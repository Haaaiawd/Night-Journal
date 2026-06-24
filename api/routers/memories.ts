import { z } from "zod";
import { createRouter, authedQuery } from "../middleware";
import {
  findProfileByUserId,
  findActiveShortTermMemories,
  deleteShortTermMemory,
  resetProfile,
} from "../queries/memories";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { dreamProfileDetailed } from "../services/dream";

const DREAM_MESSAGES = {
  missing_config: "请先在写作模型中配置 API",
  disabled: "Dream 记忆未启用",
  already_running: "Dream 正在运行，请稍后再试",
  no_material: "暂无足够的日记素材来提炼画像",
  unparseable_response: "模型返回格式异常，请稍后重试或检查写作模型配置",
  failed: "Dream 运行失败，请稍后重试或检查写作模型配置",
} as const;

export const memoriesRouter = createRouter({
  // ── queries ──────────────────────────────────────────────────────

  getProfile: authedQuery.query(async ({ ctx }) => {
    const profile = await findProfileByUserId(ctx.user.id);
    return profile;
  }),

  listShortTerm: authedQuery
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      return findActiveShortTermMemories(ctx.user.id, limit);
    }),

  // ── mutations ────────────────────────────────────────────────────

  deleteShortTerm: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await deleteShortTermMemory(ctx.user.id, input.id);
      return { success: true };
    }),

  resetProfile: authedQuery.mutation(async ({ ctx }) => {
    await resetProfile(ctx.user.id);
    return { success: true };
  }),

  triggerDream: authedQuery.mutation(async ({ ctx }) => {
    const settings = await findAiSettingsByUserId(ctx.user.id);
    if (!settings || !settings.diaryApiKey || !settings.diaryApiBaseUrl) {
      return { success: false, message: "请先在写作模型中配置 API" };
    }
    if (settings.enableDream === false) {
      return { success: false, message: "Dream 记忆未启用" };
    }

    const tz = settings.timezone || "Asia/Shanghai";
    const todayDate = new Date().toLocaleString("sv-SE", { timeZone: tz, hour12: false }).split(" ")[0];
    const result = await dreamProfileDetailed(ctx.user.id, todayDate);
    return {
      success: result.success,
      message: result.success ? "记忆更新成功" : DREAM_MESSAGES[result.reason ?? "failed"],
    };
  }),
});
