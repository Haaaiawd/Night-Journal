import { eq, and, isNull, desc, gte, lt } from "drizzle-orm";
import { getDb } from "../connection";
import { entries, entryAttachments } from "@db/schema";

// ─── Entries ───────────────────────────────────────────────────────

export async function findEntriesByDate(userId: number, date: string) {
  const db = getDb();
  const userEntries = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        eq(entries.entryDate, new Date(date)),
        isNull(entries.deletedAt),
      ),
    )
    .orderBy(desc(entries.createdAt));

  // Fetch attachments for each entry
  const entriesWithAttachments = await Promise.all(
    userEntries.map(async (entry) => {
      const attachments = await db
        .select()
        .from(entryAttachments)
        .where(eq(entryAttachments.entryId, entry.id));
      return { ...entry, attachments };
    }),
  );

  return entriesWithAttachments;
}

export async function findEntryById(userId: number, entryId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.id, entryId),
        eq(entries.userId, userId),
        isNull(entries.deletedAt),
      ),
    )
    .limit(1);
  return rows.at(0);
}

export async function createEntry(
  userId: number,
  data: { contentText: string; moodLabel?: string; entryDate: string },
) {
  const db = getDb();
  const [{ id }] = await db
    .insert(entries)
    .values({
      userId,
      contentText: data.contentText,
      moodLabel: data.moodLabel,
      entryDate: new Date(data.entryDate),
    })
    .$returningId();

  const entry = await db.query.entries.findFirst({
    where: eq(entries.id, id),
  });
  return entry;
}

export async function updateEntry(
  userId: number,
  entryId: number,
  data: { contentText?: string; moodLabel?: string; entryDate?: string; includedInDiary?: boolean },
) {
  const db = getDb();

  const updateData: Record<string, unknown> = {};
  if (data.contentText !== undefined) updateData.contentText = data.contentText;
  if (data.moodLabel !== undefined) updateData.moodLabel = data.moodLabel;
  if (data.entryDate !== undefined) updateData.entryDate = new Date(data.entryDate);
  if (data.includedInDiary !== undefined) updateData.includedInDiary = data.includedInDiary;

  await db
    .update(entries)
    .set(updateData)
    .where(
      and(
        eq(entries.id, entryId),
        eq(entries.userId, userId),
        isNull(entries.deletedAt),
      ),
    );

  return findEntryById(userId, entryId);
}

export async function findEntriesByMonth(userId: number, year: number, month: number) {
  const db = getDb();
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const userEntries = await db
    .select({
      id: entries.id,
      userId: entries.userId,
      contentText: entries.contentText,
      moodLabel: entries.moodLabel,
      createdAt: entries.createdAt,
      updatedAt: entries.updatedAt,
      entryDate: entries.entryDate,
      hasImages: entries.hasImages,
      includedInDiary: entries.includedInDiary,
      deletedAt: entries.deletedAt,
    })
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        gte(entries.entryDate, startDate),
        lt(entries.entryDate, endDate),
        isNull(entries.deletedAt),
      ),
    )
    .orderBy(desc(entries.entryDate));

  return userEntries;
}

export async function softDeleteEntry(userId: number, entryId: number) {
  await getDb()
    .update(entries)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(entries.id, entryId),
        eq(entries.userId, userId),
        isNull(entries.deletedAt),
      ),
    );
}

// ─── Entry Attachments ─────────────────────────────────────────────

export async function findAttachmentsByEntryId(entryId: number) {
  return getDb()
    .select()
    .from(entryAttachments)
    .where(eq(entryAttachments.entryId, entryId));
}

export async function createAttachment(
  userId: number,
  entryId: number,
  data: { fileUrl: string; fileType: string; fileName: string; storagePath: string },
) {
  const db = getDb();
  const [{ id }] = await db
    .insert(entryAttachments)
    .values({
      entryId,
      userId,
      fileUrl: data.fileUrl,
      fileType: data.fileType,
      fileName: data.fileName,
      storagePath: data.storagePath,
    })
    .$returningId();

  // Mark entry as having images
  await db
    .update(entries)
    .set({ hasImages: true })
    .where(eq(entries.id, entryId));

  const attachment = await db.query.entryAttachments.findFirst({
    where: eq(entryAttachments.id, id),
  });
  return attachment;
}

export async function updateAttachmentVision(
  attachmentId: number,
  data: {
    visionStatus: string;
    visionSummary?: string;
    visionModelUsed?: string;
    visionContextSnapshot?: string;
  },
) {
  await getDb()
    .update(entryAttachments)
    .set(data)
    .where(eq(entryAttachments.id, attachmentId));
}
