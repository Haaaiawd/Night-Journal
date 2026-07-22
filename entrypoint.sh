#!/bin/sh
# entrypoint.sh — run DB migrations then start the app.
#
# drizzle-kit is available at /app/node_modules/.bin/drizzle-kit
# because the builder stage installs ALL deps (including devDeps)
# and we copy the full node_modules into the runner.
# Migration files live at /app/db/migrations/.
#
# IMPORTANT: we use `drizzle-kit push` (schema diff), NOT `drizzle-kit
# migrate` (SQL file replay). push is idempotent and safe to re-run.
# Do NOT run `drizzle-kit migrate` manually — the generated SQL files
# lack IF NOT EXISTS and will fail if tables already exist.
set -e

# Ensure /app/data exists for uploads and secret persistence.
mkdir -p /app/data

# If APP_SECRET is not provided, reuse a previously persisted one or
# generate a new random secret and persist it in the volume. This makes
# `docker compose up -d --build` work out of the box while still allowing
# explicit APP_SECRET to be set in .env for production/backup scenarios.
if [ -z "$APP_SECRET" ]; then
  if [ -f /app/data/.app_secret ]; then
    APP_SECRET=$(cat /app/data/.app_secret)
    echo "[entrypoint] Reusing persisted APP_SECRET"
  else
    APP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "$APP_SECRET" > /app/data/.app_secret
    chmod 600 /app/data/.app_secret
    echo "[entrypoint] Generated and persisted APP_SECRET"
  fi
  export APP_SECRET
fi

echo "[entrypoint] Running database migrations…"
node_modules/.bin/drizzle-kit push

echo "[entrypoint] Migrations done. Starting app…"
exec node dist/boot.js
