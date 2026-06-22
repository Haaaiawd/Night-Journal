import { format } from "date-fns";
import { findAllUsers } from "../queries/users";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { findDiaryByDate, createDiary } from "../queries/diaries";
import { findEntriesByDate } from "../queries/entries";
import { generateDiaryForDate } from "../services/diary";
import { archiveExpiredMemories } from "../queries/memories";

const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

// In-memory guard to avoid reprocessing the same target date for the same user
// in one server instance. If the server restarts, the guard is lost, but the
// diary row status prevents duplicate work.
const lastProcessedDate = new Map<number, string>();

// In-memory guard so the memory-decay sweep runs at most once per day per
// server instance. Reset on restart, which is fine — archiving is idempotent.
let lastMemoryDecayRun: string | null = null;

function getLocalDateTimeParts(timezone: string): { date: string; time: string; yesterday: string } {
  const localString = new Date().toLocaleString("sv-SE", { timeZone: timezone, hour12: false });
  const [datePart, timePart] = localString.split(" ");
  const date = datePart;
  const time = timePart.slice(0, 5);

  const [y, m, d] = date.split("-").map(Number);
  const yesterdayObj = new Date(y, m - 1, d);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterday = format(yesterdayObj, "yyyy-MM-dd");

  return { date, time, yesterday };
}

async function ensurePendingDiary(userId: number, date: string) {
  const existing = await findDiaryByDate(userId, date);
  if (!existing) {
    return createDiary(userId, {
      diaryDate: date,
      generationStatus: "pending",
    });
  }
  return existing;
}

async function shouldAutoGenerate(userId: number, date: string): Promise<boolean> {
  const diary = await findDiaryByDate(userId, date);
  if (!diary) return true;

  if (diary.manuallyEdited) return false;
  if (diary.generationStatus === "generated") return false;

  if (diary.generationStatus === "pending") {
    const updatedAt = diary.updatedAt ? new Date(diary.updatedAt).getTime() : Date.now();
    if (Date.now() - updatedAt < PENDING_TIMEOUT_MS) {
      return false;
    }
    return true; // retry stuck pending generation
  }

  // failed: retry
  return true;
}

async function processUser(user: { id: number }) {
  const settings = await findAiSettingsByUserId(user.id);
  if (!settings || !settings.diaryGenerationTime || !settings.diaryApiKey || !settings.diaryApiBaseUrl) return;

  const timezone = settings.timezone || "Asia/Shanghai";
  const { time, yesterday } = getLocalDateTimeParts(timezone);

  if (time < settings.diaryGenerationTime) return;

  if (lastProcessedDate.get(user.id) === yesterday) return;

  const entries = await findEntriesByDate(user.id, yesterday);
  if (entries.length === 0) return;

  const shouldGenerate = await shouldAutoGenerate(user.id, yesterday);
  if (!shouldGenerate) return;

  const diary = await ensurePendingDiary(user.id, yesterday);
  if (!diary) return;

  lastProcessedDate.set(user.id, yesterday);

  generateDiaryForDate(user.id, yesterday).catch((err) => {
    console.error(`[scheduler] auto-generation failed for user ${user.id} date ${yesterday}:`, err);
    lastProcessedDate.delete(user.id);
  });
}

export function startScheduler(intervalMinutes = 1) {
  const intervalMs = intervalMinutes * 60 * 1000;

  async function tick() {
    try {
      const users = await findAllUsers();
      await Promise.all(
        users.map((user) =>
          processUser(user).catch((err) => {
            console.error(`[scheduler] failed to process user ${user.id}:`, err);
          }),
        ),
      );

      // Once-per-day memory decay sweep across all users. Uses today's
      // date as a rough marker — exact timezone doesn't matter since
      // deletion is idempotent and a few hours of skew is irrelevant for
      // a 14-day decay window.
      //
      // The guard is set AFTER the sweep succeeds, so a failure (e.g. DB
      // connection error) allows retry on the next tick instead of
      // blocking until tomorrow.
      const todayMarker = format(new Date(), "yyyy-MM-dd");
      if (lastMemoryDecayRun !== todayMarker) {
        try {
          const deleted = await archiveExpiredMemories();
          if (deleted > 0) {
            console.log(`[scheduler] deleted ${deleted} expired short-term memories`);
          }
          lastMemoryDecayRun = todayMarker;
        } catch (err) {
          console.error("[scheduler] memory decay sweep failed:", err);
        }
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
  }

  // Run once at startup, then on interval.
  void tick();
  const interval = setInterval(tick, intervalMs);

  return () => clearInterval(interval);
}
