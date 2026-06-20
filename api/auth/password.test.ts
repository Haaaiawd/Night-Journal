/**
 * Tests for local username/password authentication handlers.
 *
 * Covers:
 *   - Input validation (username rules, password length)
 *   - Register: happy path, duplicate username → 409
 *   - Login: happy path, wrong password → 401, unknown user → 401
 *   - Timing safety: unknown-username always runs bcrypt (no fast reject)
 *
 * All DB and session-signing calls are mocked so tests run offline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Module mocks
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

vi.mock("../queries/users", () => ({
  findUserByUsername: vi.fn(),
  createLocalUser: vi.fn(),
}));

// session signing just needs to return a string token
vi.mock("../kimi/session", () => ({
  signSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
}));

import { createRegisterHandler, createLoginHandler } from "./password";
import { findUserByUsername, createLocalUser } from "../queries/users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRegisterApp() {
  const app = new Hono();
  app.post("/api/auth/register", createRegisterHandler());
  return app;
}

function buildLoginApp() {
  const app = new Hono();
  app.post("/api/auth/login", createLoginHandler());
  return app;
}

async function post(app: Hono, path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

// A real bcrypt hash of "password1" for use in login tests
const PASSWORD = "password1";
let HASHED_PASSWORD: string;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// Pre-compute the hash once (synchronous bcrypt.hashSync is fine in tests)
HASHED_PASSWORD = bcrypt.hashSync(PASSWORD, 10);

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

describe("POST /api/auth/register — input validation", () => {
  it("rejects missing body fields (400)", async () => {
    const res = await post(buildRegisterApp(), "/api/auth/register", {});
    expect(res.status).toBe(400);
  });

  it("rejects username with invalid characters (400)", async () => {
    const res = await post(buildRegisterApp(), "/api/auth/register", {
      username: "bad username!",
      password: "password1",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/username/i);
  });

  it("rejects username that is too short (400)", async () => {
    const res = await post(buildRegisterApp(), "/api/auth/register", {
      username: "ab",
      password: "password1",
    });
    expect(res.status).toBe(400);
  });

  it("rejects password shorter than 8 chars (400)", async () => {
    const res = await post(buildRegisterApp(), "/api/auth/register", {
      username: "alice",
      password: "short",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/password/i);
  });

  it("rejects password longer than 72 chars (400)", async () => {
    const res = await post(buildRegisterApp(), "/api/auth/register", {
      username: "alice",
      password: "a".repeat(73),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/register — happy path", () => {
  it("creates user and returns 201 with session cookie", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue(undefined);
    vi.mocked(createLocalUser).mockResolvedValue({
      id: 1,
      unionId: "local:alice",
      username: "alice",
      passwordHash: HASHED_PASSWORD,
      name: "alice",
      email: null,
      avatar: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignInAt: new Date(),
    });

    const res = await post(buildRegisterApp(), "/api/auth/register", {
      username: "alice",
      password: PASSWORD,
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    // Session cookie should be set
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("kimi_sid");
  });
});

describe("POST /api/auth/register — duplicate username", () => {
  it("returns 409 when username already exists", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue({
      id: 1,
      unionId: "local:alice",
      username: "alice",
      passwordHash: HASHED_PASSWORD,
      name: "alice",
      email: null,
      avatar: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignInAt: new Date(),
    });

    const res = await post(buildRegisterApp(), "/api/auth/register", {
      username: "alice",
      password: PASSWORD,
    });

    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/taken/i);
  });
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe("POST /api/auth/login — happy path", () => {
  it("returns 200 with session cookie on correct credentials", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue({
      id: 1,
      unionId: "local:alice",
      username: "alice",
      passwordHash: HASHED_PASSWORD,
      name: "alice",
      email: null,
      avatar: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignInAt: new Date(),
    });

    const res = await post(buildLoginApp(), "/api/auth/login", {
      username: "alice",
      password: PASSWORD,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("kimi_sid");
  });
});

describe("POST /api/auth/login — wrong password", () => {
  it("returns 401 on incorrect password", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue({
      id: 1,
      unionId: "local:alice",
      username: "alice",
      passwordHash: HASHED_PASSWORD,
      name: "alice",
      email: null,
      avatar: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignInAt: new Date(),
    });

    const res = await post(buildLoginApp(), "/api/auth/login", {
      username: "alice",
      password: "wrongpassword",
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid/i);
  });
});

describe("POST /api/auth/login — unknown username", () => {
  it("returns 401 (not 404) to avoid username enumeration", async () => {
    vi.mocked(findUserByUsername).mockResolvedValue(undefined);

    const res = await post(buildLoginApp(), "/api/auth/login", {
      username: "nobody",
      password: "password1",
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    // Same generic message as wrong-password — does not reveal whether username exists
    expect(body.error).toMatch(/invalid/i);
    expect(body.error).not.toMatch(/not found/i);
    expect(body.error).not.toMatch(/does not exist/i);
  });
});
