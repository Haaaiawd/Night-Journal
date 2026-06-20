import { eq } from "drizzle-orm";
import { getDb } from "../connection";
import { aiSettings } from "@db/schema";
import type { InsertAiSettings } from "@db/schema";

export async function findAiSettingsByUserId(userId: number) {
  const rows = await getDb()
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.userId, userId))
    .limit(1);
  return rows.at(0);
}

export async function upsertAiSettings(
  userId: number,
  data: Partial<Omit<InsertAiSettings, "id" | "userId" | "createdAt" | "updatedAt">>,
) {
  const db = getDb();

  const existing = await findAiSettingsByUserId(userId);

  if (existing) {
    await db
      .update(aiSettings)
      .set(data)
      .where(eq(aiSettings.userId, userId));
    return findAiSettingsByUserId(userId);
  }

  const [{ id }] = await db
    .insert(aiSettings)
    .values({
      userId,
      ...data,
    } as InsertAiSettings)
    .$returningId();

  const settings = await db.query.aiSettings.findFirst({
    where: eq(aiSettings.id, id),
  });
  return settings;
}

export async function updateVisionSettings(
  userId: number,
  data: {
    visionApiKey?: string;
    visionApiBaseUrl?: string;
    visionModel?: string;
    enableImageUnderstanding?: boolean;
    visionPromptTemplate?: string;
  },
) {
  return upsertAiSettings(userId, data);
}

export async function updateDiarySettings(
  userId: number,
  data: {
    diaryApiKey?: string;
    diaryApiBaseUrl?: string;
    diaryModel?: string;
    diaryGenerationTime?: string;
    diaryLanguage?: string;
    diaryStyle?: string;
    diaryLength?: string;
    diaryPromptTemplate?: string;
  },
) {
  return upsertAiSettings(userId, data);
}
