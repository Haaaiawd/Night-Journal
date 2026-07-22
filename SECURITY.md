# Security Policy

This document describes the security posture of **Night-Journal** and how to report vulnerabilities.

## Supported Versions

Night-Journal is currently in **restricted closed beta**. Security fixes are applied to the latest commit on the default branch. There is no long-term support commitment for older commits at this stage.

## Reporting a Vulnerability

Please do **not** open public issues for security vulnerabilities. Instead, report privately to the maintainers so we can coordinate a fix before disclosure.

- **Email**: contact the repository owner (see their GitHub profile for a way to reach out)
- **Expected response time**: within 7 days for critical issues, 14 days for non-critical

When reporting, include:

1. A clear description of the vulnerability
2. Steps to reproduce (or a minimal test case)
3. Impact assessment
4. Suggested fix, if any

## Security Design

### Authentication

- Local username/password only (bcrypt cost 12).
- JWT session stored in an `httpOnly` cookie (name: `session`).
- Session TTL is aligned with cookie TTL: 30 days.
- Tokens are signed with `HS256` and verified with `jose`.

### Authorization

- tRPC procedures use `authedQuery` / `authedMutation` to ensure a user is present.
- All mutations that touch a user-owned resource (entries, diaries, memories) receive the `userId` from the authenticated context and use it as a filter in the database query, not from user input.
- File download paths (`/api/uploads/:userId/:fileName`) compare the route parameter against the authenticated user's ID and sanitize the file name.

### Secrets

- `APP_SECRET` is the only required secret. It is used to sign the JWT.
- API keys are encrypted with AES-256-GCM before storage in the database. The encryption key is derived from `APP_SECRET` using HKDF.
- `DATABASE_URL` must use a strong password and TLS in production.

### Input Validation

- Username/password validation is enforced on registration and login.
- tRPC inputs use Zod schemas.
- File uploads are limited to 50 MB and validated before saving.

### Transport

- In production, run the application behind a reverse proxy (Nginx, Caddy, Cloudflare, etc.) that terminates TLS.
- The application cookie is set with `SameSite=Lax` and `Secure` in production.

## Configuration Hardening

For public or multi-tenant deployments, verify the following:

1. `APP_SECRET` is at least 32 random bytes (`openssl rand -hex 32`).
2. `DATABASE_URL` points to a strong-password user with least-privilege access.
3. MySQL is not exposed to the public internet. The Docker Compose port `3306` is bound to `127.0.0.1` by default.
4. Docker container runs as a non-root user (recommended; add a `USER` directive in the Dockerfile if needed).
5. Upload files are stored in a volume (`upload_data`) and backed by S3-compatible object storage for multi-node deployments.
6. Rate limiting is enabled (see `api/lib/rate-limit.ts`).

## Known Limitations

- **Rate limiting** is currently implemented with an in-memory store. If you run multiple app instances behind a load balancer, use Redis or a shared store instead.
- **File uploads** are stored on the local filesystem by default. In a multi-node setup, configure S3/MinIO for shared storage.
- **SSRF protection** resolves DNS and blocks private IP ranges for outbound LLM calls. Ensure that your provider's endpoints resolve to public IPs.

## Acknowledgments

We credit responsible security disclosures in the release notes. If you report a confirmed issue, we are happy to acknowledge you (unless you prefer anonymity).
