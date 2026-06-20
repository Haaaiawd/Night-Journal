import { eq, and } from "drizzle-orm";
import { getDb } from "../connection";
import { modelPresets } from "@db/schema";

export async function findPresetsByUserId(userId: number) {
  return getDb()
    .select()
    .from(modelPresets)
    .where(eq(modelPresets.userId, userId));
}

export async function createPreset(
  userId: number,
  data: {
    name: string;
    type: "vision" | "diary";
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
  },
) {
  const db = getDb();
  const [{ id }] = await db
    .insert(modelPresets)
    .values({
      userId,
      name: data.name,
      type: data.type,
      apiBaseUrl: data.apiBaseUrl,
      apiKey: data.apiKey,
      model: data.model,
    })
    .$returningId();

  return db.query.modelPresets.findFirst({
    where: eq(modelPresets.id, id),
  });
}

export async function updatePreset(
  userId: number,
  presetId: number,
  data: {
    name?: string;
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
  },
) {
  const db = getDb();
  await db
    .update(modelPresets)
    .set(data)
    .where(and(eq(modelPresets.id, presetId), eq(modelPresets.userId, userId)));

  return db.query.modelPresets.findFirst({
    where: and(eq(modelPresets.id, presetId), eq(modelPresets.userId, userId)),
  });
}

export async function deletePreset(userId: number, presetId: number) {
  await getDb()
    .delete(modelPresets)
    .where(and(eq(modelPresets.id, presetId), eq(modelPresets.userId, userId)));
}
