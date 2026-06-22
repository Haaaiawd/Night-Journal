import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import {
  findEntriesByDate,
  findEntriesByMonth,
  createEntry,
  updateEntry,
  softDeleteEntry,
  createAttachment,
} from "../queries/entries";
import { findAiSettingsByUserId } from "../queries/ai-settings";
import { callVisionModel } from "../lib/openai";
import { readFileAsBase64 } from "../lib/upload";

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
        attachments: z
          .array(
            z.object({
              fileUrl: z.string(),
              fileType: z.string(),
              fileName: z.string(),
              storagePath: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { attachments, ...entryData } = input;
      const entry = await createEntry(ctx.user.id, entryData);
      if (!entry) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create entry",
        });
      }

      // Create attachments if provided
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          await createAttachment(ctx.user.id, entry.id, att);
        }

        // Trigger async vision analysis (fire-and-forget)
        triggerVisionAnalysis(ctx.user.id, entry.id, input.contentText).catch(
          (err) => console.error("[vision] Analysis failed:", err),
        );
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

// ── Vision analysis (fire-and-forget) ──────────────────────────────

import { updateAttachmentVision, findAttachmentsByEntryId } from "../queries/entries";

async function triggerVisionAnalysis(
  userId: number,
  entryId: number,
  contextText: string,
) {
  const settings = await findAiSettingsByUserId(userId);

  // Determine whether vision analysis is actually configured.
  // If not, we must still terminate the pending state on every attachment,
  // otherwise the UI loader spins forever (see seed-01: throw/return before
  // state update leaves orphan pending records).
  const visionApiKey = settings?.visionApiKey ?? null;
  const visionApiBaseUrl = settings?.visionApiBaseUrl ?? null;
  const configured =
    !!settings &&
    settings.enableImageUnderstanding &&
    !!visionApiKey &&
    !!visionApiBaseUrl;

  const dbAttachments = await findAttachmentsByEntryId(entryId);

  if (!configured) {
    for (const att of dbAttachments) {
      await updateAttachmentVision(att.id, { visionStatus: "failed" }).catch(
        (err) => console.error(`[vision] Failed to mark ${att.id}:`, err),
      );
    }
    return;
  }

  // configured === true guarantees non-null here
  const apiKey = visionApiKey as string;
  const apiBaseUrl = visionApiBaseUrl as string;
  const prompt = settings!.visionPromptTemplate ||
    "请描述这张图片的内容，并结合以下文字上下文生成适合日记写作的图片素材描述。";

  for (const dbAtt of dbAttachments) {
    try {
      const base64 = readFileAsBase64(dbAtt.storagePath);
      if (!base64) {
        // File missing/unreadable — must terminate pending, same class as
        // the unconfigured-vision fix above. Otherwise frontend polls forever.
        await updateAttachmentVision(dbAtt.id, { visionStatus: "failed" });
        continue;
      }

      const mimeType = dbAtt.fileType || "image/jpeg";
      const fullPrompt = `${prompt}\n\n关联文字: ${contextText}\n创建时间: ${new Date().toISOString()}`;

      const result = await callVisionModel({
        apiKey,
        baseUrl: apiBaseUrl,
        model: settings!.visionModel ?? undefined,
        prompt: fullPrompt,
        imageBase64: base64,
        imageMimeType: mimeType,
      });

      await updateAttachmentVision(dbAtt.id, {
        visionStatus: "completed",
        visionSummary: result,
        visionModelUsed: settings.visionModel ?? "default",
        visionContextSnapshot: contextText,
      });
    } catch (err) {
      console.error(`[vision] Failed for attachment ${dbAtt.id}:`, err);
      await updateAttachmentVision(dbAtt.id, {
        visionStatus: "failed",
      });
    }
  }
}
