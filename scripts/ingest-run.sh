#!/usr/bin/env bash
set -euo pipefail

# Change to repo root (this script lives in scripts/)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Ensure Python venv and deps
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
python -m pip -q install -U pip
python -m pip -q install -r jobs/ingest/requirements.txt

# Load env (for DATABASE_URL and feed URLs)
set -a; source .env; set +a

# Use today's TDNET list page if not explicitly provided
export TDNET_RSS_URL="${TDNET_RSS_URL:-https://www.release.tdnet.info/inbs/I_list_001_$(date -u +%Y%m%d).html}"

# Run the ingest job
PYTHONPATH=. python -m jobs.ingest.main

