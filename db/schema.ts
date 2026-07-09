import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  varchar,
  text,
  timestamp,
  date,
  boolean,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ─── Users (auth feature) ──────────────────────────────────────────

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  // Local auth fields (null for OAuth-only users)
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Entries — user fragments ──────────────────────────────────────

export const entries = mysqlTable("entries", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  contentText: text("content_text").notNull(),
  moodLabel: varchar("mood_label", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  entryDate: date("entry_date").notNull(),
  hasImages: boolean("has_images").default(false).notNull(),
  includedInDiary: boolean("included_in_diary").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
});

export type Entry = typeof entries.$inferSelect;
export type InsertEntry = typeof entries.$inferInsert;

// ─── Entry Attachments (images) ────────────────────────────────────

export const entryAttachments = mysqlTable("entry_attachments", {
  id: serial("id").primaryKey(),
  entryId: bigint("entry_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  storagePath: text("storage_path").notNull(),
  visionStatus: varchar("vision_status", { length: 20 }).default("pending").notNull(),
  visionSummary: text("vision_summary"),
  visionModelUsed: varchar("vision_model_used", { length: 100 }),
  visionContextSnapshot: text("vision_context_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type EntryAttachment = typeof entryAttachments.$inferSelect;
export type InsertEntryAttachment = typeof entryAttachments.$inferInsert;

// ─── Diaries — AI generated diaries ────────────────────────────────

export const diaries = mysqlTable("diaries", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  diaryDate: date("diary_date").notNull(),
  title: varchar("title", { length: 255 }),
  summary: varchar("summary", { length: 500 }),
  content: text("content"),
  style: varchar("style", { length: 50 }).default("温柔真实"),
  length: varchar("length", { length: 20 }).default("中"),
  diaryModelUsed: varchar("diary_model_used", { length: 100 }),
  generationStatus: varchar("generation_status", { length: 20 }).default("pending").notNull(),
  generationError: text("generation_error"),
  generatedAt: timestamp("generated_at"),
  manuallyEdited: boolean("manually_edited").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type Diary = typeof diaries.$inferSelect;
export type InsertDiary = typeof diaries.$inferInsert;

// ─── Diary Versions — history of regenerations ─────────────────────

export const diaryVersions = mysqlTable("diary_versions", {
  id: serial("id").primaryKey(),
  diaryId: bigint("diary_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }),
  summary: varchar("summary", { length: 500 }),
  content: text("content"),
  diaryModelUsed: varchar("diary_model_used", { length: 100 }),
  promptSnapshot: text("prompt_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DiaryVersion = typeof diaryVersions.$inferSelect;
export type InsertDiaryVersion = typeof diaryVersions.$inferInsert;

// ─── AI Settings — user-configurable AI models and prompts ─────────

export const aiSettings = mysqlTable("ai_settings", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull().unique(),
  // Vision model config
  // NOTE: API keys are encrypted at-rest using AES-256-GCM (see api/lib/crypto.ts).
  visionApiKey: text("vision_api_key"),
  visionApiBaseUrl: varchar("vision_api_base_url", { length: 500 }),
  visionModel: varchar("vision_model", { length: 100 }),
  enableImageUnderstanding: boolean("enable_image_understanding").default(true).notNull(),
  visionPromptTemplate: text("vision_prompt_template"),
  // Diary writer model config
  // NOTE: API keys are encrypted at-rest using AES-256-GCM (see api/lib/crypto.ts).
  diaryApiKey: text("diary_api_key"),
  diaryApiBaseUrl: varchar("diary_api_base_url", { length: 500 }),
  diaryModel: varchar("diary_model", { length: 100 }),
  diaryGenerationTime: varchar("diary_generation_time", { length: 10 }).default("02:00"),
  diaryLanguage: varchar("diary_language", { length: 20 }).default("zh"),
  diaryStyle: varchar("diary_style", { length: 50 }).default("温柔真实"),
  diaryLength: varchar("diary_length", { length: 20 }).default("中"),
  diaryPromptTemplate: text("diary_prompt_template"),
  // Per-style editable prompt snippets, stored as JSON: { "温柔真实": "...", "文学感": "..." }
  stylePrompts: text("style_prompts"),
  // Dream memory: when true, diary generation triggers an async profile-update
  // pass that maintains a long-term user profile + short-term memories, which
  // are injected into subsequent diary prompts for continuity.
  enableDream: boolean("enable_dream").default(true).notNull(),
  // General
  timezone: varchar("timezone", { length: 50 }).default("Asia/Shanghai"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type AiSettings = typeof aiSettings.$inferSelect;
export type InsertAiSettings = typeof aiSettings.$inferInsert;

// ─── Model Presets — saved API configurations for quick switching ───

export const modelPresets = mysqlTable("model_presets", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", ["vision", "diary"]).notNull(),
  apiBaseUrl: varchar("api_base_url", { length: 500 }),
  apiKey: text("api_key"), // encrypted at-rest using AES-256-GCM (see api/lib/crypto.ts)
  model: varchar("model", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type ModelPreset = typeof modelPresets.$inferSelect;
export type InsertModelPreset = typeof modelPresets.$inferInsert;

// ─── User Profiles — long-term abstract understanding of the user ──
//
// Dream mechanism: one row per user. Maintained incrementally by the Dream
// pass (api/services/dream.ts) after each diary generation. Stores abstract
// traits only — persona, relationships, emotional tone, language style —
// never concrete events. Injected into diary prompts for continuity.

export const userProfiles = mysqlTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull().unique(),
  persona: text("persona"),
  relationships: text("relationships"),
  emotionalTone: text("emotional_tone"),
  languageStyle: text("language_style"),
  summary: text("summary"),
  version: bigint("version", { mode: "number", unsigned: true }).default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// ─── Short-term Memories — abstract recent state, 14-day decay ──────
//
// Multi-row per user. Abstract descriptions of recent state (e.g. "recently
// under deadline pressure"), NOT concrete events. Decays after 14 days;
// deleted when decayAt passes. Referenced memories refresh
// lastReferencedAt to stay relevant longer.
//
// content is varchar(200) (not TEXT) so it can participate in a unique
// index — MySQL forbids indexing full TEXT columns (error 1170). The 200
// char cap is enforced in parseDreamResponse (MAX_MEMORY_CONTENT_LEN).

export const shortTermMemories = mysqlTable(
  "short_term_memories",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
    content: varchar("content", { length: 200 }).notNull(),
    category: mysqlEnum("category", ["mood", "focus", "relationship", "other"]).default("other").notNull(),
    importance: bigint("importance", { mode: "number", unsigned: true }).default(3).notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastReferencedAt: timestamp("last_referenced_at").defaultNow().notNull(),
    decayAt: timestamp("decay_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    // Ensures mergeShortTermMemories can use INSERT ... ON DUPLICATE KEY
    // UPDATE safely: at most one row per (user_id, content). Expired
    // memories are hard-deleted (not soft-archived), so a memory can be
    // re-created fresh after its previous incarnation expired.
    contentUnique: uniqueIndex("content_unique").on(table.userId, table.content),
  }),
);

export type ShortTermMemory = typeof shortTermMemories.$inferSelect;
export type InsertShortTermMemory = typeof shortTermMemories.$inferInsert;
