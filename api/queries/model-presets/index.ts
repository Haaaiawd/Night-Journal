import { eq, and } from "drizzle-orm";
import { getDb } from "../connection";
import { modelPresets } from "@db/schema";
import { encryptApiKey } from "../../lib/crypto";

export async function findPresetsByUserId(userId: number) {
  return getDb()
    .select()
    .from(modelPresets)
    .where(eq(modelPresets.userId, userId));
}

function encryptPresetData(
  data: {
    name?: string;
    apiBaseUrl?: string;
    apiKey?: string;
    model?: string;
  },
) {
  const encrypted = { ...data };
  if ("apiKey" in data && data.apiKey !== undefined) {
    encrypted.apiKey = encryptApiKey(data.apiKey) ?? undefined;
  }
  return encrypted;
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
  const encrypted = encryptPresetData(data);
  const [{ id }] = await db
    .insert(modelPresets)
    .values({
      userId,
      name: data.name,
      type: data.type,
      apiBaseUrl: encrypted.apiBaseUrl,
      apiKey: encrypted.apiKey,
      model: encrypted.model,
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
  const encrypted = encryptPresetData(data);

  const setData: Partial<Record<"name" | "apiBaseUrl" | "apiKey" | "model", string | undefined>> = {};
  if (encrypted.name !== undefined) setData.name = encrypted.name;
  if (encrypted.apiBaseUrl !== undefined) setData.apiBaseUrl = encrypted.apiBaseUrl;
  if (encrypted.apiKey !== undefined) setData.apiKey = encrypted.apiKey;
  if (encrypted.model !== undefined) setData.model = encrypted.model;

  await db
    .update(modelPresets)
    .set(setData)
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
