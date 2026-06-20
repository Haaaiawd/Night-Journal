export const Session = {
  cookieName: "kimi_sid",
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;

export const OAuth = {
  nonceCookieName: "kimi_oauth_nonce",
  nonceMaxAgeSeconds: 600, // 10 minutes — expires with the OAuth flow
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  register: "/register",
  oauthInitiate: "/api/oauth/initiate",
  oauthCallback: "/api/oauth/callback",
  authRegister: "/api/auth/register",
  authLogin: "/api/auth/login",
} as const;
