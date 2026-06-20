# ─────────────────────────────────────────────────────────────
# Stage 1: builder
#   Install ALL dependencies (including devDeps for drizzle-kit,
#   Vite, esbuild, tsc) and compile both frontend and backend.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker can cache the npm install layer
COPY package.json package-lock.json ./

# Install everything — devDeps are needed here for the build
# and for drizzle-kit which we carry into the runner
RUN npm ci --registry https://registry.npmmirror.com

# Copy the rest of the source
COPY . .

# Build: Vite → dist/public  +  esbuild → dist/boot.js
RUN npm run build


# ─────────────────────────────────────────────────────────────
# Stage 2: runner
#   We keep the full node_modules from builder so that
#   drizzle-kit (a devDep) is available at runtime to run
#   migrations automatically on startup via entrypoint.sh.
#   The image is larger than a prod-only install, but removes
#   the need for any manual migration step after `docker compose up`.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy the full node_modules from builder (includes drizzle-kit)
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy migration files and Drizzle config (needed by drizzle-kit migrate)
COPY --from=builder /app/db/migrations ./db/migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/db/schema.ts ./db/schema.ts
COPY package.json ./

# Copy the entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Expose the app port (configurable via PORT env var, defaults to 3000)
EXPOSE 3000

# Health check — lightweight ping to the API layer
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health 2>/dev/null || \
      wget -qO- http://localhost:${PORT:-3000}/ > /dev/null

ENTRYPOINT ["./entrypoint.sh"]
