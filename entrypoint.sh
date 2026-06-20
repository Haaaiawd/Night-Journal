#!/bin/sh
# entrypoint.sh — run DB migrations then start the app.
#
# drizzle-kit is available at /app/node_modules/.bin/drizzle-kit
# because the builder stage installs ALL deps (including devDeps)
# and we copy the full node_modules into the runner.
# Migration files live at /app/db/migrations/.
set -e

echo "[entrypoint] Running database migrations…"
node_modules/.bin/drizzle-kit migrate

echo "[entrypoint] Migrations done. Starting app…"
exec node dist/boot.js
