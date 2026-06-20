import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function findUserByUsername(username: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);
  return rows.at(0);
}

/**
 * Create a local (username + password) user.
 * unionId is auto-generated with a "local:" prefix so it never
 * collides with Kimi OAuth union IDs.
 */
export async function createLocalUser(data: {
  username: string;
  passwordHash: string;
  name?: string;
}) {
  const unionId = `local:${data.username}`;
  const values: InsertUser = {
    unionId,
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name ?? data.username,
    lastSignInAt: new Date(),
  };

  if (unionId === env.ownerUnionId) {
    values.role = "admin";
  }

  await getDb().insert(schema.users).values(values);
  return findUserByUnionId(unionId);
}

export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}
