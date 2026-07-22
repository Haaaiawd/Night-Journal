/**
 * Local username/password authentication handlers.
 *
 * Two endpoints:
 *   POST /api/auth/register  — create a new local account
 *   POST /api/auth/login     — authenticate and issue a session cookie
 *
 * Both share the same session signing logic used by the Kimi OAuth flow
 * (`signSessionToken` → HS256 JWT → httpOnly cookie, 30-day TTL).
 *
 * Constraints:
 *   - Username: 3–32 chars, [a-zA-Z0-9_-] only
 *   - Password: 8–72 chars (bcrypt max input is 72 bytes)
 *   - Passwords are hashed with bcrypt, cost factor 12
 *   - Timing-safe comparison via bcrypt.compare (always runs even on
 *     unknown username to prevent username enumeration via timing)
 */

import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import { getSessionCookieOptions } from "../lib/cookies";
import { Session } from "@contracts/constants";
import { signSessionToken } from "./session";
import {
  findUserByUsername,
  createLocalUser,
} from "../queries/users";

const BCRYPT_ROUNDS = 12;

// Sentinel hash used to prevent username-enumeration via timing
const DUMMY_HASH =
  "$2a$12$dummyhashfortimingnormalizationi.NRPb2P0Nqx0M6cJXyMJpYEiuV3K";

/** Validates username/password shape before touching the DB. */
function validateInput(
  username: unknown,
  password: unknown,
): string | null {
  if (typeof username !== "string" || typeof password !== "string") {
    return "username and password are required";
  }
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    return "username must be 3–32 characters (letters, digits, _ -)";
  }
  if (password.length < 8 || password.length > 72) {
    return "password must be 8–72 characters";
  }
  return null;
}

export function createRegisterHandler() {
  return async (c: Context) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { username, password, name } = body as Record<string, unknown>;
    const validationError = validateInput(username, password);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    // Check if username is already taken
    const existing = await findUserByUsername(username as string);
    if (existing) {
      return c.json({ error: "Username already taken" }, 409);
    }

    const passwordHash = await bcrypt.hash(password as string, BCRYPT_ROUNDS);
    const user = await createLocalUser({
      username: username as string,
      passwordHash,
      name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    });

    if (!user) {
      return c.json({ error: "Failed to create user" }, 500);
    }

    const token = await signSessionToken({
      unionId: user.unionId,
      clientId: "local",
    });

    const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
    setCookie(c, Session.cookieName, token, {
      ...cookieOpts,
      maxAge: Session.maxAgeMs / 1000,
    });

    return c.json({ ok: true }, 201);
  };
}

export function createLoginHandler() {
  return async (c: Context) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { username, password } = body as Record<string, unknown>;
    const validationError = validateInput(username, password);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    const user = await findUserByUsername(username as string);

    // Always run bcrypt.compare to prevent timing-based username enumeration
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
    const match = await bcrypt.compare(password as string, hashToCompare);

    if (!user || !match) {
      return c.json({ error: "Invalid username or password" }, 401);
    }

    const token = await signSessionToken({
      unionId: user.unionId,
      clientId: "local",
    });

    const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
    setCookie(c, Session.cookieName, token, {
      ...cookieOpts,
      maxAge: Session.maxAgeMs / 1000,
    });

    return c.json({ ok: true });
  };
}
