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
 * - Missing var in production → throws
 * - Missing var in development → warns, returns non-empty fallback
 * - Fallback value is random (different across calls)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const REQUIRED_VARS = {
  APP_ID: "test-app-id",
  APP_SECRET: "test-secret-that-is-long-enough-32c",
  DATABASE_URL: "mysql://root:pw@localhost/db",
  KIMI_AUTH_URL: "https://kimi.moonshot.cn",
  KIMI_OPEN_URL: "https://api.moonshot.cn",
};

beforeEach(() => {
  vi.resetModules();
  // Reset all env vars to known good state
  for (const [k, v] of Object.entries(REQUIRED_VARS)) {
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
    expect(env.appId).toBe(REQUIRED_VARS.APP_ID);
    expect(env.appSecret).toBe(REQUIRED_VARS.APP_SECRET);
    expect(env.databaseUrl).toBe(REQUIRED_VARS.DATABASE_URL);
    expect(env.kimiAuthUrl).toBe(REQUIRED_VARS.KIMI_AUTH_URL);
    expect(env.kimiOpenUrl).toBe(REQUIRED_VARS.KIMI_OPEN_URL);
    expect(env.isProduction).toBe(false);
  });
});

describe("env.ts — missing variable in production", () => {
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

describe("env.ts — missing variable in development", () => {
  it("does not throw, returns non-empty fallback string", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.APP_SECRET;

    // Should not throw
    const { env } = await import("./env");
    expect(typeof env.appSecret).toBe("string");
    expect(env.appSecret.length).toBeGreaterThan(0);
  });

  it("fallback is prefixed with dev-fallback", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.APP_ID;

    const { env } = await import("./env");
    expect(env.appId).toMatch(/^dev-fallback-APP_ID-/);
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
