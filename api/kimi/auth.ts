import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import * as jose from "jose";
import * as cookie from "cookie";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import { Session, OAuth } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { signSessionToken, verifySessionToken } from "./session";
import { users as kimiUsers } from "./platform";
import { findUserByUnionId, upsertUser } from "../queries/users";
import type { TokenResponse } from "./types";

async function exchangeAuthCode(
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.appId,
    redirect_uri: redirectUri,
    client_secret: env.appSecret,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let resp: Response;
  try {
    resp = await fetch(`${env.kimiAuthUrl}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Token exchange timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<TokenResponse>;
}

// Lazy — only constructed when Kimi OAuth is actually used.
// If KIMI_AUTH_URL is empty (password-only deployment), this never runs.
let _jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
function getJwks() {
  if (!_jwks) {
    if (!env.kimiAuthUrl) {
      throw new Error("KIMI_AUTH_URL is not configured — Kimi OAuth is unavailable");
    }
    _jwks = jose.createRemoteJWKSet(
      new URL(`${env.kimiAuthUrl}/api/.well-known/jwks.json`),
    );
  }
  return _jwks;
}

async function verifyAccessToken(
  accessToken: string,
): Promise<{ userId: string; clientId: string }> {
  const { payload } = await jose.jwtVerify(accessToken, getJwks());
  const userId = payload.user_id as string;
  const clientId = payload.client_id as string;
  if (!userId) {
    throw new Error("user_id missing from access token");
  }
  return { userId, clientId };
}

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    console.warn("[auth] No session cookie found in request.");
    throw Errors.forbidden("Invalid authentication token.");
  }
  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("User not found. Please re-login.");
  }
  return user;
}

export function createOAuthCallbackHandler() {
  return async (c: Context) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");

    if (error) {
      if (error === "access_denied") {
        return c.redirect("/", 302);
      }
      return c.json(
        { error, error_description: errorDescription },
        400,
      );
    }

    if (!code || !state) {
      return c.json({ error: "code and state are required" }, 400);
    }

    try {
      // Decode state, verify CSRF nonce, and validate redirectUri
      let redirectUri: string;
      let stateNonce: string;

      try {
        const statePayload = JSON.parse(atob(state));
        if (
          typeof statePayload.redirectUri !== "string" ||
          typeof statePayload.nonce !== "string"
        ) {
          throw new Error("Malformed state payload");
        }
        redirectUri = statePayload.redirectUri;
        stateNonce = statePayload.nonce;
      } catch {
        console.warn("[OAuth] Failed to decode state parameter");
        return c.json({ error: "Invalid state parameter" }, 400);
      }

      // Validate redirectUri to prevent open redirect attacks
      const requestOrigin = new URL(c.req.url).origin;
      const redirectOrigin = new URL(redirectUri).origin;
      if (redirectOrigin !== requestOrigin) {
        console.warn("[OAuth] redirectUri origin mismatch — possible open redirect", {
          requestOrigin,
          redirectOrigin,
        });
        return c.json({ error: "Invalid redirect URI" }, 400);
      }

      // Verify nonce against httpOnly cookie to prevent CSRF
      const cookieNonce = getCookie(c, OAuth.nonceCookieName);
      if (!cookieNonce || cookieNonce !== stateNonce) {
        console.warn("[OAuth] CSRF nonce mismatch — possible CSRF attack");
        return c.json({ error: "Invalid state parameter" }, 400);
      }
      // Consume the nonce cookie immediately (one-time use)
      deleteCookie(c, OAuth.nonceCookieName, { path: "/" });

      const tokenResp = await exchangeAuthCode(code, redirectUri);
      const { userId } = await verifyAccessToken(tokenResp.access_token);
      const userProfile = await kimiUsers.getProfile(tokenResp.access_token);
      if (!userProfile) {
        throw new Error("Failed to fetch user profile from Kimi Open");
      }

      await upsertUser({
        unionId: userId,
        name: userProfile.name,
        avatar: userProfile.avatar_url,
        lastSignInAt: new Date(),
      });

      const token = await signSessionToken({
        unionId: userId,
        clientId: env.appId,
      });

      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });

      return c.redirect("/", 302);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      return c.json({ error: "OAuth callback failed" }, 500);
    }
  };
}

export function createOAuthInitiateHandler() {
  return async (c: Context) => {
    const redirectUri = `${new URL(c.req.url).origin}/api/oauth/callback`;

    // Generate a cryptographically random nonce to prevent CSRF
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const state = btoa(JSON.stringify({ redirectUri, nonce }));

    const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
    setCookie(c, OAuth.nonceCookieName, nonce, {
      ...cookieOpts,
      maxAge: OAuth.nonceMaxAgeSeconds,
    });

    const authUrl = new URL(`${env.kimiAuthUrl}/api/oauth/authorize`);
    authUrl.searchParams.set("client_id", env.appId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "profile");
    authUrl.searchParams.set("state", state);

    return c.redirect(authUrl.toString(), 302);
  };
}

export { exchangeAuthCode, verifyAccessToken };
