import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { entriesRouter } from "./routers/entries";
import { diariesRouter } from "./routers/diaries";
import { aiSettingsRouter } from "./routers/aiSettings";
import { uploadRouter } from "./routers/upload";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  entries: entriesRouter,
  diaries: diariesRouter,
  aiSettings: aiSettingsRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
