/**
 * Tests for environment variable validation (env.ts)
 *
 * env.ts is a module-level singleton — once imported, the `env` object
 * is frozen. We test the validation logic by calling the internal
 * `required()` function directly, isolated from the module cache,
 * using vi.resetModules() between cases.
 *
 * Covers:
 * - All required vars present → no error
 * - Missing required var in production → throws
 * - Missing required var in development → warns, returns non-empty fallback
 * - Optional vars (Kimi OAuth) → return empty string when absent, no throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BASE_VARS = {
  APP_SECRET: "test-secret-that-is-long-enough-32c",
  DATABASE_URL: "mysql://root:pw@localhost/db",
};

const KIMI_VARS = {
  APP_ID: "test-app-id",
  KIMI_AUTH_URL: "https://kimi.moonshot.cn",
  KIMI_OPEN_URL: "https://api.moonshot.cn",
};

beforeEach(() => {
  vi.resetModules();
  // Reset to known good state
  for (const [k, v] of Object.entries({ ...BASE_VARS, ...KIMI_VARS })) {
    process.env[k] = v;
  }
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env.ts — all variables present", () => {
  it("exports env object with correct values", async () => {
    const { env } = await import("./env");
    expect(env.appSecret).toBe(BASE_VARS.APP_SECRET);
    expect(env.databaseUrl).toBe(BASE_VARS.DATABASE_URL);
    expect(env.appId).toBe(KIMI_VARS.APP_ID);
    expect(env.kimiAuthUrl).toBe(KIMI_VARS.KIMI_AUTH_URL);
    expect(env.kimiOpenUrl).toBe(KIMI_VARS.KIMI_OPEN_URL);
    expect(env.isProduction).toBe(false);
  });
});

describe("env.ts — missing required variable in production", () => {
  it("throws for missing APP_SECRET in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_SECRET;

    await expect(import("./env")).rejects.toThrow(
      /Missing required environment variable: APP_SECRET/,
    );
  });

  it("throws for missing DATABASE_URL in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    await expect(import("./env")).rejects.toThrow(
      /Missing required environment variable: DATABASE_URL/,
    );
  });
});

describe("env.ts — missing required variable in development", () => {
  it("does not throw, returns non-empty fallback string", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.APP_SECRET;

    // Should not throw
    const { env } = await import("./env");
    expect(typeof env.appSecret).toBe("string");
    expect(env.appSecret.length).toBeGreaterThan(0);
  });

  it("fallback values are not empty (no silent JWT empty-secret bug)", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.APP_SECRET;

    const { env } = await import("./env");
    // The critical invariant: the secret must never be empty
    expect(env.appSecret).not.toBe("");
    expect(env.appSecret.length).toBeGreaterThan(0);
  });
});

describe("env.ts — optional Kimi OAuth variables", () => {
  it("returns empty string for APP_ID when absent (no throw)", async () => {
    delete process.env.APP_ID;

    const { env } = await import("./env");
    expect(env.appId).toBe("");
  });

  it("returns empty string for KIMI_AUTH_URL when absent (no throw)", async () => {
    delete process.env.KIMI_AUTH_URL;

    const { env } = await import("./env");
    expect(env.kimiAuthUrl).toBe("");
  });

  it("does not throw even in production when Kimi vars are absent", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ID;
    delete process.env.KIMI_AUTH_URL;
    delete process.env.KIMI_OPEN_URL;

    // Should not throw — Kimi vars are optional
    const { env } = await import("./env");
    expect(env.appId).toBe("");
    expect(env.kimiAuthUrl).toBe("");
    expect(env.kimiOpenUrl).toBe("");
  });
});
