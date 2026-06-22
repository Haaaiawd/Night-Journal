import { eq, and, desc, lt, sql } from "drizzle-orm";
import { getDb } from "../connection";
import { userProfiles, shortTermMemories } from "@db/schema";
import type { ShortTermMemory } from "@db/schema";

// ─── User Profile (long-term, one row per user) ────────────────────

export async function findProfileByUserId(userId: number) {
  const rows = await getDb()
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return rows.at(0);
}

export interface ProfileUpdate {
  persona?: string | null;
  relationships?: string | null;
  emotionalTone?: string | null;
  languageStyle?: string | null;
  summary?: string | null;
}

/**
 * Atomically upsert the user profile using INSERT ... ON DUPLICATE KEY
 * UPDATE (relies on the `user_id` UNIQUE constraint).
 *
 * On insert: all fields written as-is, version defaults to 1.
 * On update: each field is set to IFNULL(VALUES(col), col) — if the new
 * value is NULL, the existing value is preserved. version is atomically
 * incremented. This eliminates the read-then-write TOCTOU race that the
 * previous implementation had when two Dream passes ran concurrently.
 */
export async function upsertProfile(userId: number, data: ProfileUpdate) {
  const db = getDb();

  await db
    .insert(userProfiles)
    .values({
      userId,
      persona: data.persona ?? null,
      relationships: data.relationships ?? null,
      emotionalTone: data.emotionalTone ?? null,
      languageStyle: data.languageStyle ?? null,
      summary: data.summary ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        persona: sql`IFNULL(VALUES(persona), persona)`,
        relationships: sql`IFNULL(VALUES(relationships), relationships)`,
        emotionalTone: sql`IFNULL(VALUES(emotional_tone), emotional_tone)`,
        languageStyle: sql`IFNULL(VALUES(language_style), language_style)`,
        summary: sql`IFNULL(VALUES(summary), summary)`,
        version: sql`${userProfiles.version} + 1`,
      },
    });

  return findProfileByUserId(userId);
}

/**
 * Delete the user's long-term profile. Short-term memories are unaffected
 * (they have their own decay lifecycle). Used by the "reset profile" feature
 * in Settings when the user notices the profile has drifted from reality.
 */
export async function resetProfile(userId: number) {
  await getDb()
    .delete(userProfiles)
    .where(eq(userProfiles.userId, userId));
}

// ─── Short-term Memories (multi-row, 14-day decay) ──────────────────

export interface ShortTermMemoryInput {
  content: string;
  category: "mood" | "focus" | "relationship" | "other";
  importance: number;
}

// Hard cap on how long a "short-term" memory can stay active by repeated
// refresh. Even if the LLM keeps outputting the same theme every Dream pass,
// after 30 days from firstSeenAt we stop extending decayAt — the memory
// will naturally archive when its current decayAt passes. This prevents
// short_term_memories from silently becoming permanent storage.
const SHORT_TERM_MAX_AGE_DAYS = 30;
const SHORT_TERM_DECAY_DAYS = 14;

/**
 * Merge newly extracted short-term memories into storage atomically.
 *
 * Uses INSERT ... ON DUPLICATE KEY UPDATE with the `(user_id, content,
 * archived)` unique index. On conflict (active row with same content):
 *  - lastReferencedAt always refreshed (it was referenced)
 *  - decayAt extended by 14 days ONLY if firstSeenAt is under 30 days old
 *  - importance raised to the max of existing and new
 *
 * This eliminates the select-then-insert TOCTOU race of the previous
 * implementation.
 */
export async function mergeShortTermMemories(userId: number, inputs: ShortTermMemoryInput[]) {
  const db = getDb();
  const now = new Date();
  const decayAt = new Date(now.getTime() + SHORT_TERM_DECAY_DAYS * 24 * 60 * 60 * 1000);

  for (const input of inputs) {
    const content = input.content.trim();
    if (!content) continue;

    await db
      .insert(shortTermMemories)
      .values({
        userId,
        content,
        category: input.category,
        importance: input.importance,
        firstSeenAt: now,
        lastReferencedAt: now,
        decayAt,
        archived: false,
      })
      .onDuplicateKeyUpdate({
        set: {
          lastReferencedAt: now,
          // Only extend decay if the memory is under the max age cap.
          // Over-cap memories keep their existing decayAt so they
          // eventually archive.
          decayAt: sql`IF(TIMESTAMPDIFF(DAY, first_seen_at, NOW()) > ${SHORT_TERM_MAX_AGE_DAYS}, decay_at, ${decayAt})`,
          importance: sql`GREATEST(importance, ${input.importance})`,
        },
      });
  }
}

/**
 * Active (non-archived) memories for a user, ordered by importance then
 * recency of reference. Used for prompt injection and the Settings view.
 */
export async function findActiveShortTermMemories(
  userId: number,
  limit = 10,
): Promise<ShortTermMemory[]> {
  return getDb()
    .select()
    .from(shortTermMemories)
    .where(
      and(
        eq(shortTermMemories.userId, userId),
        eq(shortTermMemories.archived, false),
      ),
    )
    .orderBy(desc(shortTermMemories.importance), desc(shortTermMemories.lastReferencedAt))
    .limit(limit);
}

/**
 * Archive all memories whose decayAt has passed. Called from the scheduler
 * tick once per day. Returns the count archived (useful for logging).
 */
export async function archiveExpiredMemories(userId?: number): Promise<number> {
  const db = getDb();
  const now = new Date();
  const conditions = [
    lt(shortTermMemories.decayAt, now),
    eq(shortTermMemories.archived, false),
  ];
  if (userId !== undefined) {
    conditions.push(eq(shortTermMemories.userId, userId));
  }

  const result = await db
    .update(shortTermMemories)
    .set({ archived: true })
    .where(and(...conditions));

  // mysql2 returns affectedRows on the result object
  const affected = (result as unknown as { affectedRows?: number }).affectedRows;
  return typeof affected === "number" ? affected : 0;
}

export async function deleteShortTermMemory(userId: number, memoryId: number) {
  await getDb()
    .delete(shortTermMemories)
    .where(
      and(
        eq(shortTermMemories.id, memoryId),
        eq(shortTermMemories.userId, userId),
      ),
    );
}
