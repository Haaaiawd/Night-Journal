import { eq, and, desc, gte, lt } from "drizzle-orm";
import { getDb } from "../connection";
import { diaries, diaryVersions } from "@db/schema";

// ─── Diaries ───────────────────────────────────────────────────────

export async function findDiariesByUser(userId: number, limit: number, offset: number) {
  return getDb()
    .select()
    .from(diaries)
    .where(eq(diaries.userId, userId))
    .orderBy(desc(diaries.diaryDate))
    .limit(limit)
    .offset(offset);
}

export async function findDiariesByMonth(userId: number, year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  return getDb()
    .select()
    .from(diaries)
    .where(
      and(
        eq(diaries.userId, userId),
        gte(diaries.diaryDate, startDate),
        lt(diaries.diaryDate, endDate),
      ),
    )
    .orderBy(desc(diaries.diaryDate));
}

export async function findDiaryByDate(userId: number, date: string) {
  const rows = await getDb()
    .select()
    .from(diaries)
    .where(and(eq(diaries.userId, userId), eq(diaries.diaryDate, new Date(date))))
    .limit(1);
  return rows.at(0);
}

export async function findDiaryById(userId: number, diaryId: number) {
  const rows = await getDb()
    .select()
    .from(diaries)
    .where(and(eq(diaries.id, diaryId), eq(diaries.userId, userId)))
    .limit(1);
  return rows.at(0);
}

/**
 * Recently generated diaries (newest first), used as Dream input material.
 * Only includes successfully generated diaries with content — pending/failed
 * rows carry no signal for profile synthesis.
 */
export async function findRecentGeneratedDiaries(userId: number, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return getDb()
    .select({
      diaryDate: diaries.diaryDate,
      title: diaries.title,
      summary: diaries.summary,
      content: diaries.content,
    })
    .from(diaries)
    .where(
      and(
        eq(diaries.userId, userId),
        gte(diaries.diaryDate, since),
        eq(diaries.generationStatus, "generated"),
      ),
    )
    .orderBy(desc(diaries.diaryDate))
    .limit(days);
}

/**
 * Recent diary generation attempts for the settings log view.
 * Includes pending, generated and failed rows so users can see whether
 * auto-generation succeeded and what went wrong when it failed.
 */
export async function findRecentDiaryGenerationLogs(userId: number, limit: number) {
  return getDb()
    .select({
      id: diaries.id,
      diaryDate: diaries.diaryDate,
      generationStatus: diaries.generationStatus,
      generatedAt: diaries.generatedAt,
      generationError: diaries.generationError,
    })
    .from(diaries)
    .where(eq(diaries.userId, userId))
    .orderBy(desc(diaries.diaryDate))
    .limit(limit);
}

export async function createDiary(
  userId: number,
  data: {
    diaryDate: string;
    title?: string;
    summary?: string;
    content?: string;
    style?: string;
    length?: string;
    diaryModelUsed?: string;
    generationStatus?: string;
  },
) {
  const db = getDb();
  const [{ id }] = await db
    .insert(diaries)
    .values({
      userId,
      diaryDate: new Date(data.diaryDate),
      title: data.title ?? null,
      summary: data.summary ?? null,
      content: data.content ?? null,
      style: data.style ?? undefined,
      length: data.length ?? undefined,
      diaryModelUsed: data.diaryModelUsed ?? null,
      generationStatus: data.generationStatus ?? "pending",
    })
    .$returningId();

  const diary = await db.query.diaries.findFirst({
    where: eq(diaries.id, id),
  });
  return diary;
}

export async function updateDiary(
  userId: number,
  diaryId: number,
  data: {
    title?: string;
    summary?: string;
    content?: string;
    style?: string;
    length?: string;
    diaryModelUsed?: string;
    generationStatus?: string;
    generationError?: string | null;
    generatedAt?: Date;
    manuallyEdited?: boolean;
  },
) {
  const db = getDb();

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.summary !== undefined) updateData.summary = data.summary;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.style !== undefined) updateData.style = data.style;
  if (data.length !== undefined) updateData.length = data.length;
  if (data.diaryModelUsed !== undefined) updateData.diaryModelUsed = data.diaryModelUsed;
  if (data.generationStatus !== undefined) updateData.generationStatus = data.generationStatus;
  if (data.generationError !== undefined) updateData.generationError = data.generationError;
  if (data.generatedAt !== undefined) updateData.generatedAt = data.generatedAt;
  if (data.manuallyEdited !== undefined) updateData.manuallyEdited = data.manuallyEdited;

  await db
    .update(diaries)
    .set(updateData)
    .where(and(eq(diaries.id, diaryId), eq(diaries.userId, userId)));

  return findDiaryById(userId, diaryId);
}

export async function updateDiaryContent(
  userId: number,
  diaryId: number,
  data: { title?: string; summary?: string; content?: string },
) {
  return updateDiary(userId, diaryId, {
    ...data,
    manuallyEdited: true,
  });
}

export async function deleteDiary(userId: number, diaryId: number) {
  await getDb()
    .delete(diaries)
    .where(and(eq(diaries.id, diaryId), eq(diaries.userId, userId)));
}

// ─── Diary Versions ────────────────────────────────────────────────

export async function findVersionsByDiaryId(diaryId: number, userId: number) {
  return getDb()
    .select()
    .from(diaryVersions)
    .where(
      and(
        eq(diaryVersions.diaryId, diaryId),
        eq(diaryVersions.userId, userId),
      ),
    )
    .orderBy(desc(diaryVersions.createdAt));
}

export async function createDiaryVersion(
  userId: number,
  diaryId: number,
  data: {
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    diaryModelUsed?: string | null;
    promptSnapshot?: string | null;
  },
) {
  const db = getDb();
  const [{ id }] = await db
    .insert(diaryVersions)
    .values({
      diaryId,
      userId,
      title: data.title ?? null,
      summary: data.summary ?? null,
      content: data.content ?? null,
      diaryModelUsed: data.diaryModelUsed ?? null,
      promptSnapshot: data.promptSnapshot ?? null,
    })
    .$returningId();

  const version = await db.query.diaryVersions.findFirst({
    where: eq(diaryVersions.id, id),
  });
  return version;
}
