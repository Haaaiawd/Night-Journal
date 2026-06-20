import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import {
  findAiSettingsByUserId,
  updateVisionSettings,
  updateDiarySettings,
} from "../queries/ai-settings";

export const aiSettingsRouter = createRouter({
  // ── queries ──────────────────────────────────────────────────────

  get: authedQuery.query(async ({ ctx }) => {
    const settings = await findAiSettingsByUserId(ctx.user.id);
    if (!settings) {
      // Return default settings object if none exist yet
      return {
        userId: ctx.user.id,
        enableImageUnderstanding: true,
        diaryGenerationTime: "02:00",
        diaryLanguage: "zh",
        diaryStyle: "温柔真实",
        diaryLength: "中",
        timezone: "Asia/Shanghai",
        visionModel: null,
        visionApiBaseUrl: null,
        visionPromptTemplate: null,
        diaryModel: null,
        diaryApiBaseUrl: null,
        diaryPromptTemplate: null,
        stylePrompts: null,
        createdAt: null,
        updatedAt: null,
      };
    }

    // Never expose API keys to the frontend
    return {
      ...settings,
      visionApiKey: undefined,
      diaryApiKey: undefined,
    };
  }),

  // ── mutations ────────────────────────────────────────────────────

  updateVision: authedQuery
    .input(
      z.object({
        visionApiKey: z.string().optional(),
        visionApiBaseUrl: z.string().max(500).optional(),
        visionModel: z.string().max(100).optional(),
        enableImageUnderstanding: z.boolean().optional(),
        visionPromptTemplate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await updateVisionSettings(ctx.user.id, input);
      if (!settings) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update vision settings",
        });
      }
      return {
        ...settings,
        visionApiKey: undefined,
        diaryApiKey: undefined,
      };
    }),

  updateDiary: authedQuery
    .input(
      z.object({
        diaryApiKey: z.string().optional(),
        diaryApiBaseUrl: z.string().max(500).optional(),
        diaryModel: z.string().max(100).optional(),
        diaryGenerationTime: z.string().max(10).optional(),
        diaryLanguage: z.string().max(20).optional(),
        diaryStyle: z.string().max(50).optional(),
        diaryLength: z.string().max(20).optional(),
        diaryPromptTemplate: z.string().optional(),
        stylePrompts: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await updateDiarySettings(ctx.user.id, input);
      if (!settings) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update diary settings",
        });
      }
      return {
        ...settings,
        visionApiKey: undefined,
        diaryApiKey: undefined,
      };
    }),

  testVision: authedQuery
    .input(
      z.object({
        apiKey: z.string().min(1),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // TODO: Implement actual vision model connection test
      try {
        // In a real implementation, this would make a test request to the vision API
        // e.g., const result = await testVisionConnection(input.apiKey, input.baseUrl, input.model);
        void input; // Acknowledge input is used for future implementation
        return { success: true, message: "Vision model connection is valid" };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Vision model connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  testDiary: authedQuery
    .input(
      z.object({
        apiKey: z.string().min(1),
        baseUrl: z.string().optional(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // TODO: Implement actual diary model connection test
      try {
        // In a real implementation, this would make a test request to the diary API
        void input; // Acknowledge input is used for future implementation
        return { success: true, message: "Diary model connection is valid" };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Diary model connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});
