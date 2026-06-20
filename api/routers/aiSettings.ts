import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import {
  findAiSettingsByUserId,
  updateVisionSettings,
  updateDiarySettings,
} from "../queries/ai-settings";
import {
  findPresetsByUserId,
  createPreset,
  updatePreset,
  deletePreset,
} from "../queries/model-presets";
import { testModelConnection } from "../lib/openai";

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
      try {
        const result = await testModelConnection({
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
          model: input.model,
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "连接失败: 未知错误",
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
      try {
        const result = await testModelConnection({
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
          model: input.model,
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "连接失败: 未知错误",
        });
      }
    }),

  // ── presets ────────────────────────────────────────────────────

  listPresets: authedQuery.query(async ({ ctx }) => {
    return findPresetsByUserId(ctx.user.id);
  }),

  createPreset: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(["vision", "diary"]),
        apiBaseUrl: z.string().max(500).optional(),
        apiKey: z.string().optional(),
        model: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createPreset(ctx.user.id, input);
    }),

  updatePreset: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(100).optional(),
        apiBaseUrl: z.string().max(500).optional(),
        apiKey: z.string().optional(),
        model: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updatePreset(ctx.user.id, id, data);
    }),

  deletePreset: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deletePreset(ctx.user.id, input.id);
      return { success: true };
    }),

  loadPreset: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const presets = await findPresetsByUserId(ctx.user.id);
      const preset = presets.find((p) => p.id === input.id);
      if (!preset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });
      }
      if (preset.type === "vision") {
        return updateVisionSettings(ctx.user.id, {
          visionApiBaseUrl: preset.apiBaseUrl ?? undefined,
          visionApiKey: preset.apiKey ?? undefined,
          visionModel: preset.model ?? undefined,
        });
      }
      return updateDiarySettings(ctx.user.id, {
        diaryApiBaseUrl: preset.apiBaseUrl ?? undefined,
        diaryApiKey: preset.apiKey ?? undefined,
        diaryModel: preset.model ?? undefined,
      });
    }),
});
