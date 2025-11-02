# AGENTS.md – Agent Ops Notes (kabu4)

Scope: entire repo

## Goals
- Start API and Web locally fast
- Ensure DB path works across monorepo execution contexts
- Keep ingest job runnable in isolation

## Environments
- Node: v20.x
- Package manager: pnpm (workspace)
- Python: 3.11 with venv
- DB: SQLite at `prisma/dev.db`

## Env Vars
- `DATABASE_URL` must point to the SQLite file. Current value in `.env` is absolute: `file:/home/yamaryu/ドキュメント/kabu4/prisma/dev.db`.
  - If the repo path changes, update `.env` accordingly.
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3001` (also used by Web UI).

## Install
```bash
pnpm install
```

## Run (dev)
Prefer two terminals. Export `.env` for safety when launching from repo root.
```bash
# Terminal A (API)
set -a; source .env; set +a
pnpm run dev:api   # http://localhost:3001

# Terminal B (Web)
set -a; source .env; set +a
pnpm run dev:web   # http://localhost:3000
```

Alternative (background) used by assistants:
```bash
set -a; source .env; set +a
nohup pnpm run dev:api > logs/api-dev.log 2>&1 & echo $! > logs/api-dev.pid
nohup pnpm run dev:web > logs/web-dev.log 2>&1 & echo $! > logs/web-dev.pid
```

Stop background servers:
```bash
kill $(cat logs/api-dev.pid) 2>/dev/null || true
kill $(cat logs/web-dev.pid) 2>/dev/null || true
```

## Database
- Prisma schema: `prisma/schema.prisma`
- If migrations are absent, use client against existing `dev.db`.
- To regenerate client: `pnpm run prisma:generate`

Date storage notes:
- `CorporateEvent.date` in SQLite is stored as epoch milliseconds (INTEGER). Prisma reads it reliably in this form.
- Python ingest was updated to write epoch ms to avoid mixing ISO TEXT and epoch INTEGER values that caused Prisma errors.

Seed data (already loaded, rerun if needed):
```bash
node scripts/seed.js
```

## Ingest Job (Python)
Create venv and run job to rebuild features, events, and picks.
```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r jobs/ingest/requirements.txt
PYTHONPATH=. python -m jobs.ingest.main
```

## API Endpoints
- `GET /api/picks?date=YYYY-MM-DD&minScore=60`
- `GET /api/symbols/{code}/events`
- `GET /api/symbols/{code}/prices`

## Notes for Agents
- When running Next.js from a workspace, `process.cwd()` may differ. `apps/api/lib/prisma.ts` resolves relative `file:./prisma/dev.db` to an absolute path if needed.
- Prefer sourcing `.env` to ensure `DATABASE_URL` is set in process env.
- Avoid altering package scripts unless necessary; use background `nohup` + PID files for non-interactive runs.

## MCP: Browser setup (Playwright)
- Configured at `.vscode/mcp.json` under server key `browser` using `playwright-mcp-server`.
- Requires Playwright browsers. If not present:
  - `pnpm exec playwright install chromium`
- Headless mode is enabled via `PLAYWRIGHT_HEADLESS=1` in the server env.
- If the IDE cannot start the server, run manually for debugging:
  - `npx -y playwright-mcp-server@latest`
  - Expected output: `MCP server ready to accept requests`.

## Real-time data ingestion
- News defaults to `https://kabutan.jp/news/?b=k250` (scraped via BeautifulSoup + requests).
- Symbol names are resolved via `https://kabutan.jp/stock/?code={code}` when feeds lack names.
- Ensure `.venv` has the latest dependencies: `python -m pip install -r jobs/ingest/requirements.txt` (adds `requests`, `beautifulsoup4`).
- Custom feeds can be provided through `.env` (`NEWS_FEED_URL`, `SYMBOLS_CSV_URL`, `SYMBOLS_JSON_URL`, `SYMBOL_PROFILE_URL_TEMPLATE`).
