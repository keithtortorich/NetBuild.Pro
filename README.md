# NetBuild.Pro 4.0
Production repository for the NetBuild.Pro AI workforce platform. A clean rebuild of WS3.3, carrying forward only proven, running code -- see `docs/DECISIONS.md` for what changed and why.

## Quick Start

### Local Development Setup
```bash
# 1. Set up environment variables
cp .env.example .env  # or create .env with required vars (see CREDENTIALS.md)

# 2. Install dependencies
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

# 3. Run tests
python -m pytest

# 4. Health check
python scripts/health_check.py

# 5. Run locally
uvicorn webstaffr.app:app --reload
```

### Environment Variables
See `CREDENTIALS.md` for a complete list of required env vars:
- `GROK_API_KEY` (xAI chat backend)
- `GHL_API_KEY` + `GHL_LOCATION_ID` (GoHighLevel sync)
- `RETELL_WEBHOOK_SECRET` (Retell voice webhooks)
- `BOOK_API_KEY` / `INTERNAL_API_KEY` / `GHL_WEBHOOK_SECRET` (endpoint auth)
- `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `CUSTOMER_ALLOWED_ORIGINS`
  (customer dashboard identity and exact private browser origins)
- `NETBUILD_DB_PATH` or `DATABASE_URL` (database)
- `SITE_MAGIC_WORKER_WEBHOOK_URL` + `SITE_MAGIC_WORKER_WEBHOOK_SECRET`
  (app side: hand a queued Site Magic job to the Railway worker -- both
  required, either alone leaves the queue on its Null default)
- `SITE_MAGIC_API_BASE_URL` / `SITE_MAGIC_INTERNAL_API_KEY` /
  `SITE_MAGIC_CODEGEN_BASE_URL` / `SITE_MAGIC_STORAGE_SERVICE_KEY`
  (worker side: control-plane callbacks, LLM endpoint, artifact storage --
  `SITE_MAGIC_CODEGEN_BASE_URL` is an LLM endpoint and is deliberately NOT
  `SITE_MAGIC_API_BASE_URL`, see CREDENTIALS.md)
- `NETBUILD_PUBLIC_BASE_URL` (optional, not a secret: public origin stamped
  into offline-generated pages' links, canonical, and og:url; unset means
  origin-relative `/sites/{tenant_id}/web/...`)

## Folder Structure

- **`/webstaffr`** -- Core backend: `app.py` (composition root), Angel worker, integrations, database, migrations.
- **`/tests`** -- Test suite (169 tests, all passing).
- **`/scripts`** -- Utilities: `health_check.py`, `test_db_connection.py`.
- **`/docs`** -- Architecture, API, database, security, and decisions reference.
- **`/.github`** -- CI/CD workflows.

## Key Entry Points

- **Composition root**: `webstaffr/app.py` -- `create_app()` builds the FastAPI app and wires every router. This is where a future AI-employee worker's router gets added.
- **Angel's own endpoints**: `webstaffr/workers/angel/router.py` -- `create_angel_router()` (`/chat`, `/book`, `/webhooks/ghl`).
- **Deploy entrypoint**: `index.py` -- re-exports `app` for Vercel's Python builder.
- **Tests**: `python -m pytest` (run all, or target a module).
- **Health check**: `python scripts/health_check.py` (9 checks against the live product surface -- imports, migrations, app boot, intake round-trip, site-data leak prevention, rendered-site smoke test, CORS scoping, rate limiting, prompt loading).
- **Customer site rendering**: `webstaffr/site_renderer.py` + `webstaffr/templates/` -- server-side Jinja2 templates over the same public projection `/sites/{tenant_id}` returns as JSON. Rendered pages live at `/sites/{tenant_id}/web` and below (see `docs/SITE_RENDERER_PLAN.md`).

## Repository Rules & Process

See `CLAUDE.md` for:
- Founder's role and approval boundaries
- Engineering invariants (tenant scoping, auth, CORS, secrets, no ORM)
- Token efficiency rules
- Self-approval scope vs. founder approval required

## Documentation

- `PROJECT.md` -- Product vision and roadmap.
- `CLAUDE.md` -- Process, scope, engineering rules.
- `CREDENTIALS.md` -- Env var reference, security baseline.
- `TASKS.md` -- Live work status.
- `DEPLOYMENT_CHECKLIST.md` -- Launch gate criteria.
- `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` -- reference docs, generated from the actual code.
