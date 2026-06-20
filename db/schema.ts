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
  // NOTE: API keys are stored as plaintext. Consider encrypting at-rest before going to production.
  visionApiKey: text("vision_api_key"),
  visionApiBaseUrl: varchar("vision_api_base_url", { length: 500 }),
  visionModel: varchar("vision_model", { length: 100 }),
  enableImageUnderstanding: boolean("enable_image_understanding").default(true).notNull(),
  visionPromptTemplate: text("vision_prompt_template"),
  // Diary writer model config
  // NOTE: API keys are stored as plaintext. Consider encrypting at-rest before going to production.
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
  apiKey: text("api_key"),
  model: varchar("model", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type ModelPreset = typeof modelPresets.$inferSelect;
export type InsertModelPreset = typeof modelPresets.$inferInsert;
