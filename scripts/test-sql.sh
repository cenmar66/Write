#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies the Daily Canvas migration on top of a
# tiny Supabase stand-in, and runs the SQL behaviour tests. Needs PostgreSQL 15+ binaries.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -x "$BIN/initdb" ] || { echo "PostgreSQL server binaries not found; skipping SQL tests."; exit 0; }
DIR="$(mktemp -d)"
PORT=54329
cleanup() { "$BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
RUN=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DIR"; RUN="runuser -u postgres --"; fi
$RUN "$BIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
$RUN "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start -w >/dev/null
PSQL=(psql -X -q -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase-shim.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0009_daily_canvas.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0009_daily_canvas.sql"   # must be re-runnable
"${PSQL[@]}" -f "$ROOT/supabase/tests/canvas.test.sql"
