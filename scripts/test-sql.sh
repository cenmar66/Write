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
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0010_daily_canvas.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0010_daily_canvas.sql"   # must be re-runnable
"${PSQL[@]}" -f "$ROOT/supabase/tests/canvas.test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0011_promptsatori.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0011_promptsatori.sql"  # must be re-runnable
"${PSQL[@]}" -f "$ROOT/supabase/tests/satori.test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0012_inboxsatori.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0012_inboxsatori.sql"  # must be re-runnable
"${PSQL[@]}" -f "$ROOT/supabase/tests/inbox.test.sql"
# Scheduler: on plain Postgres it must skip quietly (twice), then work against stand-ins.
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0013_inbox_scheduler.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0013_inbox_scheduler.sql"
(cd "$ROOT" && "${PSQL[@]}" -f "supabase/tests/inbox-scheduler.test.sql")
# Post folders + social analytics (0014), on a fresh database with the Write.ai tables it builds on.
"${PSQL[@]}" -c "create database analytics_test" >/dev/null
APSQL=(psql -X -q -h "$DIR" -p "$PORT" -U postgres -d analytics_test -v ON_ERROR_STOP=1)
"${APSQL[@]}" -f "$ROOT/supabase/tests/supabase-shim.sql"
"${APSQL[@]}" -f "$ROOT/supabase/migrations/0002_documents.sql"
"${APSQL[@]}" -f "$ROOT/supabase/migrations/0005_posts.sql"
"${APSQL[@]}" -f "$ROOT/supabase/migrations/0014_post_folders_analytics.sql" 2>/dev/null
"${APSQL[@]}" -f "$ROOT/supabase/migrations/0014_post_folders_analytics.sql" 2>/dev/null  # must be re-runnable
"${APSQL[@]}" -f "$ROOT/supabase/tests/analytics.test.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0015_satori_connectors.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0015_satori_connectors.sql"   # must be re-runnable
"${PSQL[@]}" -f "$ROOT/supabase/tests/satori-connectors.test.sql"
