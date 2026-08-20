#!/usr/bin/env bash
# Wrapper script to run migration verification from the project root.
# Usage: bun run verify:migrations  (or ./scripts/verify-migrations.sh)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../packages/server"
bun run src/scripts/verify-migrations.ts
