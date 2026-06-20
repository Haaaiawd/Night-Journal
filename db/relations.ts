import { relations } from "drizzle-orm";
import {
  users,
  entries,
  entryAttachments,
  diaries,
  diaryVersions,
  modelPresets,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  entries: many(entries),
  entryAttachments: many(entryAttachments),
  diaries: many(diaries),
  diaryVersions: many(diaryVersions),
  modelPresets: many(modelPresets),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
  user: one(users, { fields: [entries.userId], references: [users.id] }),
  attachments: many(entryAttachments),
}));

export const entryAttachmentsRelations = relations(entryAttachments, ({ one }) => ({
  entry: one(entries, {
    fields: [entryAttachments.entryId],
    references: [entries.id],
  }),
  user: one(users, {
    fields: [entryAttachments.userId],
    references: [users.id],
  }),
}));

export const diariesRelations = relations(diaries, ({ one, many }) => ({
  user: one(users, { fields: [diaries.userId], references: [users.id] }),
  versions: many(diaryVersions),
}));

export const diaryVersionsRelations = relations(diaryVersions, ({ one }) => ({
  diary: one(diaries, {
    fields: [diaryVersions.diaryId],
    references: [diaries.id],
  }),
  user: one(users, {
    fields: [diaryVersions.userId],
    references: [users.id],
  }),
}));

export const modelPresetsRelations = relations(modelPresets, ({ one }) => ({
  user: one(users, {
    fields: [modelPresets.userId],
    references: [users.id],
  }),
}));
