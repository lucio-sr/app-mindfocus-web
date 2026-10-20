#!/usr/bin/env bash
# Valida as migrations e roda os testes pgTAP sem Docker, num Postgres local descartável
# (Homebrew: brew install postgresql@17). Imita o mínimo do Supabase: roles, auth, storage.
# O caminho oficial continua sendo `supabase db reset && supabase test db`.
#
# uso: scripts/db-test-local/run.sh [dir supabase]   (padrão: ./supabase)
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "${1:-$H/../../supabase}" && pwd)"
TMP="$(mktemp -d)"; PG="$TMP/pgdata"; PORT="${PORT:-54329}"
trap 'pg_ctl -D "$PG" stop -m fast >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

initdb -D "$PG" -U postgres -A trust >/dev/null
pg_ctl -D "$PG" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -l "$TMP/pg.log" start -w >/dev/null
P="psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $PORT -U postgres"
$P -d postgres -c "create database supa"
$P -d supa -f "$H/supabase_stub.sql"
for f in "$SUPA"/migrations/*.sql; do echo "== $(basename "$f")"; $P -d supa -f "$f"; done
$P -d supa -f "$H/pgtap_shim.sql"

status=0
for t in "$SUPA"/tests/database/*.sql; do
  echo "== $(basename "$t")"
  out=$(sed "/create extension if not exists pgtap/d" "$t" | $P -d supa -At 2>&1) || status=1
  echo "$out" | grep -vE '^$'
  echo "$out" | grep -qE '^not ok|^# (FALHAS|plano)|ERRO|ERROR' && status=1
done
[ $status -eq 0 ] && echo "TODOS OS TESTES PASSARAM" || echo "HÁ FALHAS"
exit $status
