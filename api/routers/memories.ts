import { z } from "zod";
import { createRouter, authedQuery } from "../middleware";
import {
  findProfileByUserId,
  findActiveShortTermMemories,
  deleteShortTermMemory,
  resetProfile,
} from "../queries/memories";

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
});
