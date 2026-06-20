/**
 * Tests for OAuth CSRF protection logic in auth.ts
 *
 * These tests exercise the callback handler's state decoding,
 * nonce verification, and redirectUri origin validation — the
 * three security properties added during the security audit.
 *
 * We use Hono's test utilities to construct realistic Request
 * objects without spinning up a real HTTP server.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { OAuth } from "@contracts/constants";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any import that pulls in these modules
// ---------------------------------------------------------------------------

vi.mock("../lib/env", () => ({
  env: {
    appId: "test-app-id",
    appSecret: "test-secret-that-is-long-enough-32c",
    databaseUrl: "mysql://x:y@localhost/z",
    kimiAuthUrl: "http://kimi.test",
    kimiOpenUrl: "http://open.test",
    isProduction: false,
    ownerUnionId: "",
  },
}));

// Mock DB-dependent modules so tests don't need a real MySQL connection
vi.mock("../queries/users", () => ({
  findUserByUnionId: vi.fn(),
  upsertUser: vi.fn(),
}));

// The real token/profile fetch calls external services; mock them so
// unit tests for state/CSRF logic stay fast and offline
vi.mock("./platform", () => ({
  users: {
    getProfile: vi.fn(),
  },
}));

import { createOAuthCallbackHandler, createOAuthInitiateHandler } from "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildState(redirectUri: string, nonce: string): string {
  return btoa(JSON.stringify({ redirectUri, nonce }));
}

function buildCallbackUrl(
  base: string,
  params: Record<string, string>,
): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * Create a minimal Hono app with the callback handler mounted,
 * and issue a GET request to it, returning the raw Response.
 */
async function callCallback(
  url: string,
  cookieHeader = "",
): Promise<Response> {
  const app = new Hono();
  app.get("/api/oauth/callback", createOAuthCallbackHandler());

  const req = new Request(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
  return app.fetch(req);
}

async function callInitiate(origin: string): Promise<Response> {
  const app = new Hono();
  app.get("/api/oauth/initiate", createOAuthInitiateHandler());

  const req = new Request(`${origin}/api/oauth/initiate`);
  return app.fetch(req);
}

// ---------------------------------------------------------------------------
// createOAuthInitiateHandler
// ---------------------------------------------------------------------------

describe("createOAuthInitiateHandler", () => {
  it("redirects to Kimi authorize URL", async () => {
    const res = await callInitiate("http://localhost:3000");
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/api/oauth/authorize");
    expect(location).toContain("response_type=code");
    expect(location).toContain("state=");
  });

  it("sets nonce cookie", async () => {
    const res = await callInitiate("http://localhost:3000");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(OAuth.nonceCookieName);
  });

  it("state payload contains redirectUri pointing to /api/oauth/callback", async () => {
    const res = await callInitiate("http://localhost:3000");
    const location = res.headers.get("location") ?? "";
    const url = new URL(location);
    const state = url.searchParams.get("state") ?? "";
    const payload = JSON.parse(atob(state));
    expect(payload.redirectUri).toBe(
      "http://localhost:3000/api/oauth/callback",
    );
    expect(typeof payload.nonce).toBe("string");
    expect(payload.nonce.length).toBe(32); // 16 bytes → 32 hex chars
  });

  it("each call generates a unique nonce", async () => {
    const r1 = await callInitiate("http://localhost:3000");
    const r2 = await callInitiate("http://localhost:3000");

    const extractNonce = (res: Response) => {
      const loc = res.headers.get("location") ?? "";
      const state = new URL(loc).searchParams.get("state") ?? "";
      return JSON.parse(atob(state)).nonce as string;
    };

    expect(extractNonce(r1)).not.toBe(extractNonce(r2));
  });
});

// ---------------------------------------------------------------------------
// createOAuthCallbackHandler — missing params
// ---------------------------------------------------------------------------

describe("createOAuthCallbackHandler — missing params", () => {
  it("returns 400 when code is missing", async () => {
    const nonce = "abc123";
    const state = buildState("http://localhost:3000/api/oauth/callback", nonce);
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      state,
    });
    const res = await callCallback(
      url,
      `${OAuth.nonceCookieName}=${nonce}`,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toMatch(/code and state/i);
  });

  it("returns 400 when state is missing", async () => {
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
    });
    const res = await callCallback(url);
    expect(res.status).toBe(400);
  });

  it("redirects to / on access_denied", async () => {
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      error: "access_denied",
    });
    const res = await callCallback(url);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
  });

  it("returns 400 on other OAuth errors", async () => {
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      error: "server_error",
      error_description: "something went wrong",
    });
    const res = await callCallback(url);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toBe("server_error");
  });
});

// ---------------------------------------------------------------------------
// createOAuthCallbackHandler — state / nonce validation
// ---------------------------------------------------------------------------

describe("createOAuthCallbackHandler — state & nonce validation", () => {
  it("returns 400 when state is not valid base64 JSON", async () => {
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
      state: "not-valid-base64!!!",
    });
    const res = await callCallback(url);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toMatch(/state/i);
  });

  it("returns 400 when state JSON is missing nonce field", async () => {
    // state with redirectUri but no nonce
    const badState = btoa(
      JSON.stringify({ redirectUri: "http://localhost:3000/api/oauth/callback" }),
    );
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
      state: badState,
    });
    const res = await callCallback(url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when state JSON is missing redirectUri field", async () => {
    const badState = btoa(JSON.stringify({ nonce: "abc123" }));
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
      state: badState,
    });
    const res = await callCallback(url);
    expect(res.status).toBe(400);
  });

  it("returns 400 when nonce cookie is absent (CSRF)", async () => {
    const nonce = "legit-nonce-32chars-padding-here";
    const state = buildState("http://localhost:3000/api/oauth/callback", nonce);
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
      state,
    });
    // no cookie sent
    const res = await callCallback(url);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toMatch(/state/i);
  });

  it("returns 400 when nonce cookie doesn't match state nonce (CSRF)", async () => {
    const stateNonce = "correct-nonce-value-padded-here1";
    const cookieNonce = "attacker-nonce-different-value01";
    const state = buildState(
      "http://localhost:3000/api/oauth/callback",
      stateNonce,
    );
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
      state,
    });
    const res = await callCallback(
      url,
      `${OAuth.nonceCookieName}=${cookieNonce}`,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toMatch(/state/i);
  });
});

// ---------------------------------------------------------------------------
// createOAuthCallbackHandler — Open Redirect protection
// ---------------------------------------------------------------------------

describe("createOAuthCallbackHandler — Open Redirect protection", () => {
  it("returns 400 when redirectUri points to a different origin", async () => {
    const nonce = "valid-nonce-same-everywhere-12345";
    // redirectUri origin (evil.com) ≠ request origin (localhost:3000)
    const state = buildState("https://evil.com/steal", nonce);
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
      state,
    });
    const res = await callCallback(
      url,
      `${OAuth.nonceCookieName}=${nonce}`,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toMatch(/redirect/i);
  });

  it("allows redirectUri when origin matches exactly", async () => {
    // This test verifies the origin check passes and execution proceeds
    // to the token exchange step (which will fail, but with 500 not 400).
    const nonce = "valid-nonce-same-everywhere-12345";
    const state = buildState("http://localhost:3000/api/oauth/callback", nonce);
    const url = buildCallbackUrl("http://localhost:3000/api/oauth/callback", {
      code: "auth-code",
      state,
    });
    const res = await callCallback(
      url,
      `${OAuth.nonceCookieName}=${nonce}`,
    );
    // Should fail at token exchange (500), NOT at redirect validation (400)
    expect(res.status).not.toBe(400);
  });
});
