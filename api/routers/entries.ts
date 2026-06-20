import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import {
  findEntriesByDate,
  findEntriesByMonth,
  createEntry,
  updateEntry,
  softDeleteEntry,
} from "../queries/entries";

export const entriesRouter = createRouter({
  // ── queries ──────────────────────────────────────────────────────

  list: authedQuery
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD") }))
    .query(async ({ ctx, input }) => {
      const entries = await findEntriesByDate(ctx.user.id, input.date);
      return entries;
    }),

  listByMonth: authedQuery
    .input(z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }))
    .query(async ({ ctx, input }) => {
      const entries = await findEntriesByMonth(ctx.user.id, input.year, input.month);
      return entries;
    }),

  // ── mutations ────────────────────────────────────────────────────

  create: authedQuery
    .input(
      z.object({
        contentText: z.string().min(1, "Content is required"),
        moodLabel: z.string().max(20).optional(),
        entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await createEntry(ctx.user.id, input);
      if (!entry) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create entry",
        });
      }
      return entry;
    }),

  update: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        contentText: z.string().min(1).optional(),
        moodLabel: z.string().max(20).optional(),
        entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        includedInDiary: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const entry = await updateEntry(ctx.user.id, id, data);
      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Entry not found",
        });
      }
      return entry;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await softDeleteEntry(ctx.user.id, input.id);
      return { success: true };
    }),
});
