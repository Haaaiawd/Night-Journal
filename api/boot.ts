import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler, createOAuthInitiateHandler, authenticateRequest } from "./kimi/auth";
import { createRegisterHandler, createLoginHandler } from "./auth/password";
import { Paths } from "@contracts/constants";
import { saveUploadedFile, getFilePath } from "./lib/upload";
import { startScheduler } from "./lib/scheduler";
import fs from "fs";
import path from "path";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthInitiate, createOAuthInitiateHandler());
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
app.post(Paths.authRegister, createRegisterHandler());
app.post(Paths.authLogin, createLoginHandler());

// ── File upload endpoint ──
app.post("/api/upload/file", async (c) => {
  let user;
  try {
    user = await authenticateRequest(c.req.raw.headers);
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }

  const result = await saveUploadedFile(user.id, file);
  return c.json(result);
});

// ── Serve uploaded files ──
app.get("/api/uploads/:userId/:fileName", async (c) => {
  const storagePath = `${c.req.param("userId")}/${c.req.param("fileName")}`;
  const fullPath = getFilePath(storagePath);
  if (!fullPath) return c.json({ error: "Not Found" }, 404);

  const ext = path.extname(fullPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".svg": "image/svg+xml",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";
  const data = fs.readFileSync(fullPath);

  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (env.isProduction || process.env.ENABLE_AUTO_GENERATION_IN_DEV === "true") {
  startScheduler();
}
