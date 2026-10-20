#!/bin/sh
# Start the notes server on Linux/Debian without systemd (foreground).
set -eu
APP_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
DATA_DIR="${DSH_NOTES_DATA_DIR:-/var/lib/dsh-notes}"
HOST="${DSH_NOTES_HOST:-127.0.0.1}"
PORT="${DSH_NOTES_PORT:-8787}"

exec node "$APP_DIR/server/bin.js" serve \
  --data-dir "$DATA_DIR" \
  --host "$HOST" \
  --port "$PORT" \
  --log-level "${DSH_NOTES_LOG_LEVEL:-info}" \
  "$@"
