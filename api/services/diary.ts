import { format } from "date-fns";
import { callChatModel } from "../lib/openai";
import { findEntriesByDate, updateEntry } from "../queries/entries";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { findDiaryByDate, updateDiary } from "../queries/diaries";
import { findProfileByUserId, findActiveShortTermMemories } from "../queries/memories";
import { dreamProfile } from "./dream";
import { DEFAULT_DIARY_PROMPT, DEFAULT_STYLE_PROMPTS } from "@contracts/prompts";
import type { ShortTermMemory } from "@db/schema";

// In-process guard: prevents the same (userId, date) Dream pass from
// running twice concurrently — e.g. when regenerate + scheduler both
// trigger generateDiaryForDate in the same tick. Entries are cleared in
// the .finally() so a failed Dream pass can be retried on the next
// diary generation.
const dreamInFlight = new Set<string>();

function getStylePrompt(style: string, stylePromptsJson?: string | null): string {
  if (stylePromptsJson) {
    try {
      const parsed = JSON.parse(stylePromptsJson) as Record<string, string>;
      if (parsed[style]) return parsed[style];
    } catch {
      // ignore invalid JSON
    }
  }
  return DEFAULT_STYLE_PROMPTS[style] ?? "";
}

type ShortTermMemoryInput = Pick<ShortTermMemory, "content" | "category" | "importance">;

interface DiaryMemory {
  profileSummary: string | null;
  languageStyle: string | null;
  shortTermMemories: ShortTermMemoryInput[];
}

interface DiaryContext {
  date: string;
  language: string;
  style: string;
  length: string;
  stylePrompt: string;
  fragments: Array<{
    contentText: string;
    moodLabel: string | null;
    createdAt: Date;
    attachments?: Array<{ visionSummary: string | null }>;
  }>;
  memory?: DiaryMemory | null;
}

/**
 * Render fragment descriptions for the prompt.
 * Each fragment includes its time, optional mood, content text, and any
 * image summaries produced by the vision model.
 */
function renderFragments(fragments: DiaryContext["fragments"]): string {
  return fragments
    .map((f, i) => {
      const time = format(new Date(f.createdAt), "HH:mm");
      const mood = f.moodLabel ? ` [${f.moodLabel}]` : "";
      const imageSummaries =
        f.attachments
          ?.filter((a) => a.visionSummary)
          .map((a) => `图片概要：${a.visionSummary}`)
          .join("\n") ?? "";
      return `${i + 1}. ${time}${mood}\n${f.contentText}${imageSummaries ? "\n" + imageSummaries : ""}`;
    })
    .join("\n\n");
}

/**
 * Render the consolidated image summary block.
 */
function renderImageSummaries(fragments: DiaryContext["fragments"]): string {
  const summaries = fragments
    .flatMap((f) => f.attachments?.filter((a) => a.visionSummary).map((a) => a.visionSummary) ?? [])
    .filter((s): s is string => !!s);
  return summaries.length > 0 ? summaries.join("\n") : "无";
}

/**
 * Render the Dream memory block. Injected only when a profile or short-term
 * memories exist. The wording explicitly tells the model NOT to restate these
 * facts; they are background understanding for continuity, not material to
 * narrate.
 */
function renderMemoryBlock(memory: DiaryMemory | null | undefined): string {
  if (!memory || (!memory.profileSummary && memory.shortTermMemories.length === 0)) {
    return "";
  }
  const lines: string[] = [];
  if (memory.profileSummary) {
    lines.push(`对这个用户的理解：${memory.profileSummary}`);
  }
  if (memory.languageStyle) {
    lines.push(`语风参考：${memory.languageStyle}`);
  }
  if (memory.shortTermMemories.length > 0) {
    const memLines = memory.shortTermMemories.map((m) => `- [${m.category}] ${m.content}`).join("\n");
    lines.push(`近期状态：\n${memLines}`);
  }
  return `\n你对这个用户的了解（用于保持日记的连续性，不要直接复述或罗列，自然融入即可）：\n${lines.join("\n")}\n`;
}

/**
 * Known placeholders for the diary user-message template.
 *
 * Keep this list in sync with the documentation in `contracts/prompts.ts`
 * and the hints shown in the Settings UI.
 */
export const DIARY_PLACEHOLDERS = [
  "{{date}}",
  "{{language}}",
  "{{style}}",
  "{{stylePrompt}}",
  "{{length}}",
  "{{fragments}}",
  "{{imageSummaries}}",
  "{{memoryBlock}}",
] as const;

/**
 * Build the user message sent to the diary model.
 *
 * If the configured prompt template contains any known placeholders, they are
 * replaced with the corresponding rendered content. This lets power users
 * rearrange or omit parts of the prompt from Settings.
 *
 * If the template contains no known placeholders (legacy custom prompts or
 * the old hard-coded format), the rendered content is appended after the
 * template as a fallback so existing user configurations keep working.
 */
export function buildDiaryUserMessage(context: DiaryContext, template: string): string {
  const { date, language, style, length, stylePrompt, fragments, memory } = context;

  const fragmentDescriptions = renderFragments(fragments);
  const imageSummaries = renderImageSummaries(fragments);
  const memoryBlock = renderMemoryBlock(memory);

  const legacyContentBlock = `日期：${date}
语言：${language}
日记风格：${style}
风格说明：${stylePrompt}
日记长度：${length}
${memoryBlock}
今日碎片：
${fragmentDescriptions}

图片摘要汇总：
${imageSummaries}

请根据以上素材生成日记。`;

  const hasPlaceholder = DIARY_PLACEHOLDERS.some((p) => template.includes(p));
  if (!hasPlaceholder) {
    return `${template}\n\n${legacyContentBlock}`;
  }

  const values: Record<string, string> = {
    date,
    language,
    style,
    stylePrompt,
    length,
    fragments: fragmentDescriptions,
    imageSummaries,
    memoryBlock,
  };
  return DIARY_PLACEHOLDERS.reduce((acc, key) => acc.replaceAll(key, values[key.slice(2, -2)] ?? ""), template);
}

function parseDiaryResponse(
  content: string,
): { title: string; summary: string; content: string } | null {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const diaryContent = typeof parsed.content === "string" ? parsed.content.trim() : "";
    if (!title || !diaryContent) return null;
    return { title, summary, content: diaryContent };
  } catch (err) {
    console.error("[diary] Failed to parse JSON response:", err);
    return null;
  }
}

export async function generateDiaryForDate(userId: number, date: string): Promise<void> {
  const settings = await findAiSettingsByUserId(userId);
  if (!settings || !settings.diaryApiKey || !settings.diaryApiBaseUrl) {
    throw new Error("Diary model not configured");
  }

  const diary = await findDiaryByDate(userId, date);
  if (!diary) {
    throw new Error("Diary not found");
  }
  if (diary.manuallyEdited) {
    console.log(`[diary] Diary ${diary.id} was manually edited, skipping generation`);
    return;
  }

  try {
    const entries = await findEntriesByDate(userId, date);
    if (entries.length === 0) {
      throw new Error("No entries for this date");
    }

    const style = settings.diaryStyle ?? "温柔真实";
    const length = settings.diaryLength ?? "中";
    const language = settings.diaryLanguage ?? "zh";
    const stylePrompt = getStylePrompt(style, settings.stylePrompts);
    const promptTemplate = settings.diaryPromptTemplate || DEFAULT_DIARY_PROMPT;

    // Load Dream memory (profile + active short-term memories) for prompt
    // injection. Skipped when the user has disabled Dream or no profile
    // exists yet — both resolve to a null memory block.
    let memory: DiaryMemory | null = null;
    if (settings.enableDream !== false) {
      const [profile, shortTermMemories] = await Promise.all([
        findProfileByUserId(userId),
        findActiveShortTermMemories(userId, 5),
      ]);
      if (profile || shortTermMemories.length > 0) {
        memory = {
          profileSummary: profile?.summary ?? null,
          languageStyle: profile?.languageStyle ?? null,
          shortTermMemories,
        };
      }
    }

    const userMessage = buildDiaryUserMessage(
      {
        date,
        language,
        style,
        length,
        stylePrompt,
        fragments: entries,
        memory,
      },
      promptTemplate,
    );

    const content = await callChatModel({
      apiKey: settings.diaryApiKey,
      baseUrl: settings.diaryApiBaseUrl,
      model: settings.diaryModel ?? undefined,
      messages: [
        { role: "system", content: promptTemplate },
        { role: "user", content: userMessage },
      ],
      maxTokens: 2048,
      temperature: 0.7,
      timeoutMs: 120_000,
    });

    const parsed = parseDiaryResponse(content);
    if (!parsed) {
      throw new Error("Failed to parse diary response");
    }

    await updateDiary(userId, diary.id, {
      title: parsed.title,
      summary: parsed.summary,
      content: parsed.content,
      style,
      length,
      diaryModelUsed: settings.diaryModel ?? "default",
      generationStatus: "generated",
      generatedAt: new Date(),
      manuallyEdited: false,
    });

    // Trigger an async Dream pass to update the user profile based on the
    // newly generated diary + recent history. Fire-and-forget: never blocks
    // or fails the diary generation. Skipped when the user disabled Dream.
    // The in-process guard prevents duplicate Dream passes for the same
    // (userId, date) when regenerate + scheduler race in the same tick.
    if (settings.enableDream !== false) {
      const dreamKey = `${userId}:${date}`;
      if (!dreamInFlight.has(dreamKey)) {
        dreamInFlight.add(dreamKey);
        dreamProfile(userId, date)
          .catch((err) => {
            console.error(`[diary] Dream pass failed for user ${userId} date ${date}:`, err);
          })
          .finally(() => {
            dreamInFlight.delete(dreamKey);
          });
      }
    }

    // Mark entries as included (non-critical)
    try {
      for (const entry of entries) {
        if (!entry.includedInDiary) {
          await updateEntry(userId, entry.id, { includedInDiary: true });
        }
      }
    } catch (err) {
      console.error("[diary] Failed to mark entries as included:", err);
    }
  } catch (err) {
    console.error(`[diary] Generation failed for user ${userId} date ${date}:`, err);
    if (diary.generationStatus === "pending") {
      await updateDiary(userId, diary.id, { generationStatus: "failed" });
    }
    throw err;
  }
}
