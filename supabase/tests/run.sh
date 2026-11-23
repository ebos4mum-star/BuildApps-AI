#!/usr/bin/env bash
# Runs migrations + RLS tests against real Postgres.
#  - If DATABASE_URL is set (e.g. CI service container) it is used (database must be empty/disposable).
#  - Otherwise a throwaway local cluster is created under a temp dir and removed afterwards.
set -euo pipefail
cd "$(dirname "$0")"
run_sql() { psql -v ON_ERROR_STOP=1 -q "$1" -f "$2"; }

if [[ -n "${DATABASE_URL:-}" ]]; then
  URL="$DATABASE_URL"
else
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
  DIR=$(mktemp -d); chmod 755 "$DIR"
  OWNER=$(id -un); RUNAS=()
  if [[ $(id -u) -eq 0 ]]; then OWNER=postgres; RUNAS=(runuser -u postgres --); chown postgres "$DIR"; fi
  trap '"${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
  "${RUNAS[@]}" "$PGBIN/initdb" -D "$DIR/data" -A trust >/dev/null
  "${RUNAS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p 54399 -k $DIR -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
  URL="postgresql://$OWNER@/postgres?host=$DIR&port=54399"
fi

run_sql "$URL" 00_stub_auth.sql
for f in ../migrations/*.sql; do run_sql "$URL" "$f"; done
psql -v ON_ERROR_STOP=1 -q "$URL" -f helpers.sql -f rls_test.sql -f batch2_test.sql -f publishing_test.sql -f done.sql
