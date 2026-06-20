# ─────────────────────────────────────────────────────────────
# Stage 1: builder
#   Install all dependencies (including devDeps) and compile
#   both the React frontend (Vite) and the Hono backend (esbuild).
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first so Docker can cache the npm install layer
COPY package.json package-lock.json ./

# Install everything (devDeps needed for Vite + esbuild + tsc)
RUN npm ci --registry https://registry.npmmirror.com

# Copy the rest of the source
COPY . .

# Build: Vite → dist/public  +  esbuild → dist/boot.js
RUN npm run build


# ─────────────────────────────────────────────────────────────
# Stage 2: runner
#   Lean production image — only runtime deps + compiled output.
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy manifests and install production-only deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --registry https://registry.npmmirror.com

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Expose the app port (configurable via PORT env var, defaults to 3000)
EXPOSE 3000

# Health check — lightweight ping to the API layer
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health 2>/dev/null || \
      wget -qO- http://localhost:${PORT:-3000}/ > /dev/null

CMD ["node", "dist/boot.js"]
