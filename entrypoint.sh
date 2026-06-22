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

echo "[entrypoint] Running database migrations…"
node_modules/.bin/drizzle-kit push

echo "[entrypoint] Migrations done. Starting app…"
exec node dist/boot.js
