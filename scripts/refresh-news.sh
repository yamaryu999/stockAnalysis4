#!/usr/bin/env bash
set -euo pipefail

# Change to repo root
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Export env (NEXT_PUBLIC_API_URL, DATABASE_URL, etc.)
set -a; source .env; set +a

# Hit the API endpoint to fetch live news and rebuild picks
curl -fsS -X POST "${NEXT_PUBLIC_API_URL:-http://localhost:3001}/api/news/refresh" >/dev/null

echo "News refreshed and picks rebuilt at $(date -u +%F' '%T) UTC"

