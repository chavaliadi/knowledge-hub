#!/usr/bin/env bash
#
# scripts/migrate.sh — Apply all KnowledgeHub database migrations in order.
#
# This script applies schema.sql through schema_v8.sql against the live
# Supabase PostgreSQL database using psql. It requires a SUPABASE_DB_URL
# environment variable (a Postgres connection string) to be set either in
# the .env file or in the environment.
#
# If SUPABASE_DB_URL is not set, the script constructs one from the
# SUPABASE_URL (extracting the project ref) using Supabase's standard
# direct connection format. You will be prompted for the database password.
#
# Usage:
#   ./scripts/migrate.sh              # Apply all pending migrations
#   ./scripts/migrate.sh --verify     # Only verify what's applied, no changes
#
# Prerequisites:
#   - psql (PostgreSQL client) must be installed
#   - .env file with SUPABASE_URL (and optionally SUPABASE_DB_URL)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_DIR="$PROJECT_ROOT/packages/server"

# Load .env if it exists
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Check psql is available
if ! command -v psql &>/dev/null; then
  echo "❌ psql is not installed. Install PostgreSQL client tools first."
  echo "   brew install postgresql  (macOS)"
  echo "   sudo apt install postgresql-client  (Ubuntu/Debian)"
  exit 1
fi

# Build the database connection URL
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  if [ -z "${SUPABASE_URL:-}" ]; then
    echo "❌ Neither SUPABASE_DB_URL nor SUPABASE_URL is set."
    echo "   Set SUPABASE_DB_URL in your .env to a PostgreSQL connection string, e.g.:"
    echo "   SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
    exit 1
  fi
  
  # Extract project ref from SUPABASE_URL (e.g. https://abcdefgh.supabase.co -> abcdefgh)
  PROJECT_REF=$(echo "$SUPABASE_URL" | sed -E 's|https?://([^.]+)\.supabase\.co.*|\1|')
  
  echo "⚠ SUPABASE_DB_URL is not set. Building connection from SUPABASE_URL."
  echo "  Project ref: $PROJECT_REF"
  echo ""
  echo "  You can find the direct connection string in the Supabase Dashboard:"
  echo "  Settings > Database > Connection String > URI"
  echo ""
  echo "  Or set SUPABASE_DB_URL in your .env file for future runs."
  echo ""
  echo "  Attempting connection via: postgresql://postgres.$PROJECT_REF@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  echo "  (You will be prompted for the database password)"
  echo ""
  
  DB_URL="postgresql://postgres.$PROJECT_REF@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
else
  DB_URL="$SUPABASE_DB_URL"
fi

# Migration files in order
MIGRATIONS=(
  "schema.sql"
  "schema_v2.sql"
  "schema_v3.sql"
  "schema_v4.sql"
  "schema_v5.sql"
  "schema_v6.sql"
  "schema_v7.sql"
  "schema_v8.sql"
)

# Verify mode
if [ "${1:-}" = "--verify" ]; then
  echo "=== Verify Mode: Checking which migrations have been applied ==="
  echo ""
  
  # Check each critical object
  CHECKS=(
    "entries:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='entries')"
    "tags:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='tags')"
    "entry_tags:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='entry_tags')"
    "collections:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='collections')"
    "attachments:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='attachments')"
    "entry_chunks:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='entry_chunks')"
    "concept_links:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='concept_links')"
    "knowledge_reports:SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='knowledge_reports')"
    "match_entries():SELECT EXISTS(SELECT FROM pg_proc WHERE proname='match_entries')"
    "match_chunks():SELECT EXISTS(SELECT FROM pg_proc WHERE proname='match_chunks')"
    "vector_ext:SELECT EXISTS(SELECT FROM pg_extension WHERE extname='vector')"
  )
  
  for check in "${CHECKS[@]}"; do
    name="${check%%:*}"
    query="${check#*:}"
    result=$(psql "$DB_URL" -tAc "$query" 2>/dev/null || echo "error")
    if [ "$result" = "t" ]; then
      echo "  ✅ $name"
    elif [ "$result" = "f" ]; then
      echo "  ❌ $name (MISSING)"
    else
      echo "  ⚠  $name (connection error)"
    fi
  done
  
  exit 0
fi

# Apply mode
echo "=== Applying KnowledgeHub Database Migrations ==="
echo ""
echo "Target: $DB_URL"
echo ""

for migration in "${MIGRATIONS[@]}"; do
  filepath="$SCHEMA_DIR/$migration"
  
  if [ ! -f "$filepath" ]; then
    echo "⚠ Skipping $migration (file not found at $filepath)"
    continue
  fi
  
  echo "▶ Applying $migration..."
  
  if psql "$DB_URL" -f "$filepath" 2>&1; then
    echo "  ✅ $migration applied successfully"
  else
    echo "  ❌ $migration FAILED — stopping migration sequence"
    echo "  Review the error above and fix before re-running."
    exit 1
  fi
  
  echo ""
done

echo "=== All migrations applied ==="
echo ""
echo "Run '$0 --verify' to confirm all objects exist."
