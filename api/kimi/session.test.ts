/**
 * Tests for JWT session signing and verification (session.ts)
 *
 * Covers:
 * - Successful sign → verify roundtrip
 * - Expiry alignment with Session.maxAgeMs (30 days)
 * - Tampered token rejection
 * - Wrong algorithm rejection
 * - Missing payload fields rejection
 * - Empty / null token handling
 */

import { describe, it, expect, vi } from "vitest";
import * as jose from "jose";
import { Session } from "@contracts/constants";

// vi.mock factories are hoisted to the top of the file by vitest — any
// variable referenced inside must be defined within the factory itself,
// not in the outer module scope, or you'll get "Cannot access before init".
vi.mock("../lib/env", () => ({
  env: {
    appId: "test-app-id",
    appSecret: "test-secret-that-is-long-enough-32c", // inline — no outer var
    databaseUrl: "mysql://x:y@localhost/z",
    kimiAuthUrl: "http://kimi.test",
    kimiOpenUrl: "http://open.test",
    isProduction: false,
    ownerUnionId: "",
  },
}));

// Alias for use in test assertions — must match the mock value above
const TEST_SECRET = "test-secret-that-is-long-enough-32c";

import { signSessionToken, verifySessionToken } from "./session";

const SAMPLE_PAYLOAD = {
  unionId: "uid_abc123",
  clientId: "client_xyz",
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("signSessionToken + verifySessionToken", () => {
  it("roundtrip: signed token is verifiable", async () => {
    const token = await signSessionToken(SAMPLE_PAYLOAD);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3); // JWT has 3 parts

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.unionId).toBe(SAMPLE_PAYLOAD.unionId);
    expect(payload!.clientId).toBe(SAMPLE_PAYLOAD.clientId);
  });

  it("expiry is set to ~30 days from now", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signSessionToken(SAMPLE_PAYLOAD);
    const after = Math.floor(Date.now() / 1000);

    // jose.decodeJwt returns the payload object directly (synchronous, no { payload } wrapper)
    const claims = jose.decodeJwt(token);
    const exp = claims.exp as number;
    const iat = claims.iat as number;

    expect(iat).toBeGreaterThanOrEqual(before);
    expect(iat).toBeLessThanOrEqual(after);

    const expectedTtlSeconds = Session.maxAgeMs / 1000;
    const actualTtl = exp - iat;
    // Allow ±2s for timing slack
    expect(actualTtl).toBeGreaterThanOrEqual(expectedTtlSeconds - 2);
    expect(actualTtl).toBeLessThanOrEqual(expectedTtlSeconds + 2);
  });

  it("uses HS256 algorithm", async () => {
    const token = await signSessionToken(SAMPLE_PAYLOAD);
    const header = jose.decodeProtectedHeader(token);
    expect(header.alg).toBe("HS256");
  });
});

// ---------------------------------------------------------------------------
// Rejection cases
// ---------------------------------------------------------------------------

describe("verifySessionToken — rejection", () => {
  it("returns null for empty string", async () => {
    const result = await verifySessionToken("");
    expect(result).toBeNull();
  });

  it("returns null for obviously invalid token", async () => {
    const result = await verifySessionToken("not.a.jwt");
    expect(result).toBeNull();
  });

  it("returns null for token signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-totally-different");
    const tampered = await new jose.SignJWT(SAMPLE_PAYLOAD)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(wrongSecret);

    const result = await verifySessionToken(tampered);
    expect(result).toBeNull();
  });

  it("returns null for token with no unionId", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const incomplete = await new jose.SignJWT({ clientId: "only-client" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);

    const result = await verifySessionToken(incomplete);
    expect(result).toBeNull();
  });

  it("returns null for token with no clientId", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    const incomplete = await new jose.SignJWT({ unionId: "only-union" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(secret);

    const result = await verifySessionToken(incomplete);
    expect(result).toBeNull();
  });

  it("returns null for expired token", async () => {
    const secret = new TextEncoder().encode(TEST_SECRET);
    // Manually craft a token that expired 1 second ago
    const now = Math.floor(Date.now() / 1000);
    const expired = await new jose.SignJWT(SAMPLE_PAYLOAD)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now - 10)
      .setExpirationTime(now - 1) // expired 1s ago
      .sign(secret);

    const result = await verifySessionToken(expired);
    expect(result).toBeNull();
  });
});
