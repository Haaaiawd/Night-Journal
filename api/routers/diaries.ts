import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import {
  findDiariesByUser,
  findDiariesByMonth,
  findDiaryByDate,
  findDiaryById,
  createDiary,
  updateDiary,
  updateDiaryContent,
  createDiaryVersion,
  findVersionsByDiaryId,
  deleteDiary,
} from "../queries/diaries";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { generateDiaryForDate } from "../services/diary";

export const diariesRouter = createRouter({
  // ── queries ──────────────────────────────────────────────────────

  list: authedQuery
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const diaries = await findDiariesByUser(ctx.user.id, limit, offset);
      return diaries;
    }),

  listByMonth: authedQuery
    .input(z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
      const diaries = await findDiariesByMonth(ctx.user.id, input.year, input.month);
      return diaries;
    }),

  getByDate: authedQuery
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD") }))
    .query(async ({ ctx, input }) => {
      const diary = await findDiaryByDate(ctx.user.id, input.date);
      if (!diary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diary not found for this date",
        });
      }
      return diary;
    }),

  getVersions: authedQuery
    .input(z.object({ diaryId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      // Verify the diary belongs to the user
      const diary = await findDiaryById(ctx.user.id, input.diaryId);
      if (!diary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diary not found",
        });
      }
      const versions = await findVersionsByDiaryId(input.diaryId, ctx.user.id);
      return versions;
    }),

  // ── mutations ────────────────────────────────────────────────────

  generate: authedQuery
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD") }))
    .mutation(async ({ ctx, input }) => {
      // Check if diary model is configured
      const settings = await findAiSettingsByUserId(ctx.user.id);
      if (!settings || !settings.diaryApiKey || !settings.diaryApiBaseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Diary model not configured. Please set it up in Settings.",
        });
      }

      // Check if diary already exists for this date
      const existing = await findDiaryByDate(ctx.user.id, input.date);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Diary already exists for this date. Use regenerate instead.",
        });
      }

      // Create a diary with pending status
      const diary = await createDiary(ctx.user.id, {
        diaryDate: input.date,
        generationStatus: "pending",
      });

      if (!diary) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create diary",
        });
      }

      // Trigger async diary generation
      generateDiaryForDate(ctx.user.id, input.date).catch((err) => {
        console.error("[diaries.generate] background generation failed:", err);
      });

      return diary;
    }),

  updateContent: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().max(255).optional(),
        summary: z.string().max(500).optional(),
        content: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const diary = await updateDiaryContent(ctx.user.id, id, data);
      if (!diary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diary not found",
        });
      }
      return diary;
    }),

  regenerate: authedQuery
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD") }))
    .mutation(async ({ ctx, input }) => {
      // Check if diary model is configured
      const settings = await findAiSettingsByUserId(ctx.user.id);
      if (!settings || !settings.diaryApiKey || !settings.diaryApiBaseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Diary model not configured. Please set it up in Settings.",
        });
      }

      const diary = await findDiaryByDate(ctx.user.id, input.date);
      if (!diary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diary not found for this date",
        });
      }

      // Save current version before regenerating
      await createDiaryVersion(ctx.user.id, diary.id, {
        title: diary.title ?? undefined,
        summary: diary.summary ?? undefined,
        content: diary.content ?? undefined,
        diaryModelUsed: diary.diaryModelUsed ?? undefined,
      });

      // Update diary to pending status for regeneration
      const updated = await updateDiary(ctx.user.id, diary.id, {
        generationStatus: "pending",
        manuallyEdited: false,
      });

      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update diary for regeneration",
        });
      }

      // Trigger async diary generation
      generateDiaryForDate(ctx.user.id, input.date).catch((err) => {
        console.error("[diaries.regenerate] background generation failed:", err);
      });

      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const diary = await findDiaryById(ctx.user.id, input.id);
      if (!diary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diary not found",
        });
      }
      await deleteDiary(ctx.user.id, input.id);
      return { success: true };
    }),
});
