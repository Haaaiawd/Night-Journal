/**
 * Live API key connectivity test — Deepseek
 *
 * This test makes a real HTTP request to the Deepseek API to verify
 * the provided API key is valid and the service is reachable.
 *
 * Requires env vars (loaded from .env.test):
 *   DEEPSEEK_API_KEY   — the API key to test
 *   DEEPSEEK_BASE_URL  — base URL (default: https://api.deepseek.com/v1)
 *
 * The test is skipped automatically if DEEPSEEK_API_KEY is not set,
 * so it's safe to run in CI without credentials.
 *
 * NOTE: After running this test the key should be removed from .env.test.
 */

import { describe, it, expect } from "vitest";
import { config } from "dotenv";
import path from "path";

// Load .env.test explicitly (vitest doesn't auto-load it)
config({ path: path.resolve(process.cwd(), ".env.test") });

const API_KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

// ---------------------------------------------------------------------------
// Key format validation (no network needed)
// ---------------------------------------------------------------------------

describe("Deepseek API key — format validation", () => {
  it("key is present in .env.test", () => {
    if (!API_KEY) {
      console.warn("[skip] DEEPSEEK_API_KEY not set — skipping format check");
      return;
    }
    expect(typeof API_KEY).toBe("string");
    expect(API_KEY.length).toBeGreaterThan(10);
  });

  it("key starts with 'sk-'", () => {
    if (!API_KEY) return;
    expect(API_KEY).toMatch(/^sk-/);
  });

  it("key does not contain whitespace", () => {
    if (!API_KEY) return;
    expect(API_KEY).not.toMatch(/\s/);
  });
});

// ---------------------------------------------------------------------------
// Live connectivity test
// ---------------------------------------------------------------------------

describe("Deepseek API key — live connectivity", () => {
  it.skipIf(!API_KEY)(
    "GET /models returns HTTP 200 with valid key",
    async () => {
      const res = await fetchWithTimeout(`${BASE_URL}/models`, {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { object?: string; data?: unknown[] };
      expect(body.object).toBe("list");
      expect(Array.isArray(body.data)).toBe(true);
    },
    20_000,
  );

  it.skipIf(!API_KEY)(
    "POST /chat/completions returns a valid response (minimal prompt)",
    async () => {
      const res = await fetchWithTimeout(
        `${BASE_URL}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [{ role: "user", content: "Reply with just the word OK." }],
            max_tokens: 5,
            temperature: 0,
          }),
        },
        20_000,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      expect(Array.isArray(body.choices)).toBe(true);
      expect(body.choices!.length).toBeGreaterThan(0);
      const content = body.choices![0].message?.content ?? "";
      expect(content.length).toBeGreaterThan(0);
      console.log(`[Deepseek] Model replied: "${content}"`);
    },
    25_000,
  );

  it.skipIf(!API_KEY)(
    "returns 401 / 403 with an invalid key",
    async () => {
      const res = await fetchWithTimeout(`${BASE_URL}/models`, {
        headers: {
          Authorization: "Bearer sk-invalid-key-that-will-fail",
          "Content-Type": "application/json",
        },
      });

      // Deepseek returns 401 for bad auth
      expect([401, 403]).toContain(res.status);
    },
    15_000,
  );
});
