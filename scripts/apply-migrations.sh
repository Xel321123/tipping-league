#!/usr/bin/env bash
# Apply the migrations to the linked Supabase project.
#
# Why not `supabase db push`? This project shares its Postgres instance with
# other apps whose migration history lives in the same
# `supabase_migrations.schema_migrations` table. `db push` refuses to run when
# the remote history contains versions that are not in this repo's
# `supabase/migrations/` directory — so on the shared instance we execute the
# SQL files directly through the Management API instead.
#
# Usage:
#   export SUPABASE_ACCESS_TOKEN=sbp_...
#   supabase link --project-ref <ref>
#   ./scripts/apply-migrations.sh            # migrations only
#   ./scripts/apply-migrations.sh --seed     # migrations + seed.sql
#
# Each migration is written to be re-runnable on an empty schema. Re-running it
# against a populated schema will fail on `create table` — that is intentional:
# changes after the first apply belong in a new migration file.

set -euo pipefail

SUPABASE_BIN="${SUPABASE_BIN:-supabase}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED=0

for arg in "$@"; do
  case "$arg" in
    --seed) SEED=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

if ! command -v "$SUPABASE_BIN" >/dev/null 2>&1; then
  echo "supabase CLI not found (set SUPABASE_BIN or add it to PATH)" >&2
  exit 1
fi

cd "$ROOT"

for file in supabase/migrations/*.sql; do
  echo "→ applying $(basename "$file")"
  "$SUPABASE_BIN" db query --linked -f "$file" >/dev/null
done

if [ "$SEED" -eq 1 ]; then
  echo "→ seeding players, eras and teams"
  "$SUPABASE_BIN" db query --linked -f supabase/seed.sql >/dev/null
fi

echo "✓ done — verify with:"
echo "  $SUPABASE_BIN db query --linked \"select count(*) from tipping.players\""
