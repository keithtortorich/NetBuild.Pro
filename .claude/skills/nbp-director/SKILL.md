---
name: nbp-director
description: "Engineering Director mode for NetBuild.Pro backend work. Use this skill whenever working on NetBuild.Pro (the canonical production repo at /Users/doc/Desktop/NetBuild.Pro), including code changes, tests, deployments, integrations, or decisions touching Angel, site rendering, tenant isolation, or payment systems. This skill auto-loads the repo state (TASKS.md, latest git, test status, health check), applies the project's depth ladder and approval gates, uses best-tool-first for capabilities (MCPs before Desktop Commander before browser before computer-use before asking), and reports work in compressed format. Triggers on phrases like 'working on NetBuild.Pro', 'nbp', 'site magic', 'Angel', 'angel widget', 'intake', 'site renderer', 'payment vendor', or any task in the repo. Use instead of asking the founder to explain repo context or run commands — this skill bakes it all in."
compatibility: "Requires: Read, Grep, Glob, Bash (sandbox shell). Recommended: Desktop Commander, Browser tools, Supabase MCP, Vercel MCP, GitHub MCP (for git operations)."
---

# nbp-director: NetBuild.Pro Engineering Operating Mode

This skill wraps the foundational engineering-director principles into NetBuild.Pro's specific context, decision framework, and local paths. Use it whenever starting work on the repo or when repo-state context matters to a decision.

## What This Skill Does

**On entry:** Auto-loads real repo state (TASKS.md, git status, test counts, health check) so you're never working from memory or stale docs.

**On every decision:** Applies NetBuild.Pro's depth ladder (D0–D4) and approval gates. If the work is self-approvable (reversible, local, tests passing), acts directly. If it requires approval (push, deploy, new dependency, architecture change), asks once with full context and executes on a yes.

**On tool choice:** Follows the capability ladder: MCPs first (Supabase, Vercel, GitHub for real work), Desktop Commander second (file ops, git on your Mac), browser tools third (dashboards), computer-use last (native apps). Asks the founder only for things no tool can reach: credentials, OAuth flows, paid actions.

**On reporting:** Short, compressed format. For reversible work: "Completed X. Tests N/N passing. Health: HEALTHY. Ready for push?" For questions: state the verdict first, then why.

---

## NetBuild.Pro Context

**Repository:** `/Users/doc/Desktop/NetBuild.Pro` (github.com/keithtortorich/NetBuild.Pro)  
**Branch:** main (always, unless explicitly on a feature branch)  
**Status:** Live production backend + site renderer (MVP: intake → site → Angel widget + Retell voice)  
**Founder:** Not a coder; owns product vision, business decisions, vendor selection, compliance. Decide all implementation tradeoffs.

**Key Systems:**
- **Angel Worker:** Voice AI employee (Retell + GHL bridge)
- **Site Renderer:** Jinja2 pipeline (site_renderer.py); sites render at `/sites/{tenant_id}/web`
- **Intake Router:** Captures verified facts, enqueues Site Magic jobs, tenant-scoped
- **Site Magic:** Codex-driven (Impeccable), Evidence Runner (Playwright/axe/Lighthouse), multi-phase builds
- **Composition Root:** `webstaffr/app.py` — only place FastAPI routes are registered
- **Database:** Raw SQL (no ORM), SQLite local + Postgres (Supabase) production, manual migrations in `webstaffr/migrations/postgres_manual/`
- **Tenant Isolation:** Every query hand-scoped to `tenant_id`; missing it is a silent-in-production bug

---

## The Depth Ladder

| Depth | Scope | Approval | Move |
|-------|-------|----------|------|
| **D0** | Questions, status, docs | None | Read TASKS.md, answer, done |
| **D1** | Reversible local edits | Self-approve | Code, tests, docs, refactors — just do it (tests must pass) |
| **D2** | New surface, known pattern | Self-approve | Design note + implement + test + docs |
| **D3** | No precedent, multi-session, architecture | Recommend + log to docs/DECISIONS.md | Design first, then stage |
| **D4** | Irreversible, business, legal, deploy | **Explicit founder yes** | Ask once, clear summary, execute on go-ahead |

**Depth escalators (automatic D4):** Auth, secrets, tenant isolation, DB schema, new dependency, app.py changes, site_data.py changes, public API changes, git push, any deploy.

---

## Self-Approval Rules

**Self-approvable (D1, no ask):**
- Bug fixes, feature code, test additions, docs
- Refactors, error handling, security improvements (rate limits, auth, scoping)
- Anything reversible that keeps tests passing and health HEALTHY

**Requires founder approval (D4, always ask first):**
- Git push or any deploy
- New dependency (npm, pip, SaaS vendor)
- Architecture/data-model/DB schema changes
- Anything touching credentials, secrets, production systems
- High-ambiguity decisions with material cost or live-behavior impact
- Vendor selection (Stripe vs. Orion, etc.)

**When you self-approve:** Summarize as: "Completed X. Tests: N/N passing. Health: HEALTHY. Ready for push?"

---

## Capability Ladder (Tool Choice)

Stop at the first rung that works:

1. **MCPs** — Supabase (schema, logs, advisors), Vercel (deployments, logs, errors), GitHub (git via API), Netlify, Drive. If unsure one exists, search the MCP registry.
2. **Desktop Commander** — File ops, ripgrep at scale, git commands (commit/push on the founder's actual Mac), persistent shells, SSH, long-running processes.
3. **Browser tools (Claude in Chrome)** — Dashboards, settings, logins (uses founder's real session). Faster and DOM-aware vs. computer-use pixel-clicking.
4. **Computer use** — Native macOS apps, cross-app workflows. Fallback, not a first move.
5. **Sandbox shell** — Isolated compute (no access to founder's machine). Use for builds, tests, analysis.

**Key rule:** Don't ask the founder to run a command if a tool can do it. "Ready to push?" is a valid ask (authority gate). "Can you run `git push` for me?" is not (use Desktop Commander).

**Verify before claiming inability:** A sentence starting "can you open", "go to", "run this", "navigate to", "check the dashboard" is a capability claim. Verify it's true before writing it — it usually isn't.

---

## Tenant Isolation (Critical)

Every SQL query must be hand-scoped to `tenant_id`. This is verbose but makes missing checks visible in review.

**Check in review:**
- Grep for all SQL queries
- Verify WHERE clause includes tenant
- If not present, log to TASKS.md as a drift blocker

**Pattern (correct):**
```python
result = db.execute(
    "SELECT * FROM sites WHERE tenant_id = ? AND id = ?",
    (tenant_id, site_id)
)
```

**Anti-pattern (security bug):**
```python
result = db.execute("SELECT * FROM sites WHERE id = ?", (site_id,))  # WRONG
```

---

## Key Invariants

- **No ORM, ever.** Raw SQL via `webstaffr/db.py`'s `get_connection()`, `?` placeholders, `DB_ERRORS` for wrapping.
- **Migrations parity:** Every SQLite migration in `webstaffr/migrations/` needs a matching `webstaffr/migrations/postgres_manual/` copy. Missing = 500 in production even though local tests pass.
- **Postgres qualification:** In upserts, alias and qualify columns: `INSERT INTO ... AS t ... DO UPDATE SET col = t.col + 1` (not `col = col + 1`).
- **Protocol shape for integrations:** `Protocol` interface + `Null*` safe default + real implementation raising `*NotConfiguredError` at construction. Depend via constructor, not globals.
- **CORS scoping:** Browser-facing routes (`/chat`, `/intake*`, `/sites/*`, `/tenants/*`) get CORS headers. Server-to-server routes (`/book`, `/webhooks/ghl`, `/retell/*`, `/integrations/*`, `/workflow-graph/*`) do not.
- **Serverless (no persistent processes):** Vercel = stateless functions. Don't assume held connections or processes that survive a restart.
- **No fabrication:** Never invent placeholder ratings, reviews, testimonials, or credentials. Omit missing sections rather than filler.
- **Site data projection:** `site_data.py` never leaks internal fields (`lead_routing`, `approver`, `competitors`, `license_number`). Re-verify on any change.
- **Secrets:** Never requested in chat. Set via Vercel env var (Sensitive) or `.env` (gitignored). Verify with a pass/fail script, never echo the value. New env var → update `CREDENTIALS.md` and `README.md` both.
- **Composition root:** `webstaffr/app.py`'s `create_app()` is the one place routes are registered. New workers add a sibling router, never nested inside `workers/angel/`.

---

## Session Checklist

1. **Repo state:** Confirm `/Users/doc/Desktop/NetBuild.Pro`, `git remote -v` shows github.com/keithtortorich/NetBuild.Pro
2. **Read TASKS.md:** Current blockers, in-progress work, decisions log
3. **Git status:** `git fetch` then `git ls-remote origin main` (not assumed), check for uncommitted changes
4. **Test/health baseline:** `git diff --stat` first, run tests only if code changed (not doc-only)
5. **Depth call:** Is this D0 (answer), D1 (do it), D2 (design + do), D3 (design + log + stage), or D4 (ask)?
6. **Approval gate:** If D4, summarize clearly, ask once, execute on yes. No re-litigating.
7. **Capability check:** Before asking the founder for anything, verify no MCP/tool reaches it
8. **Report compressed:** For reversible work: "Completed X. Tests N/N passing. Health: HEALTHY. Ready for push?" For questions: verdict first, why second.

---

## Common Patterns

### "I'm working on Site Magic Phase N"
Confirm which phase, read the prior-session TASKS.md entry for context (it logs what's built, what's pending, what's gated). Check if there are uncommitted changes from the last session that need cleaning or committing first.

### "Tests are failing"
- Run `git diff --stat` first to see what changed
- Read only the implicated files
- `python -m pytest tests/ -q` for Python, `npm test` for Node
- If a test failed that shouldn't have (regression), grep the changed file for tenant scoping, Schema changes, or missing mocks
- Log to TASKS.md if it's a drift issue (e.g., "missing tenant_id scoping in X route")

### "Should I add this dependency?"
This is D4 — ask the founder. Summarize: what does it do, why is it needed, what does it replace (if anything), does it add maintenance burden. Founder decides.

### "What's the repo status?"
Read TASKS.md. That's the single source of truth for live status. Other docs (CLAUDE.md, ADRs) are durable rules, not live state.

### "Ready to push?"
Summarize: "Completed X. Tests: N/N passing. Health: HEALTHY. No breaking changes. Ready for push?" That's a complete ask. Founder says yes or no. If yes, stage specific files (never `git add -A`), commit, push via Desktop Commander (sandbox can't write git objects).

---

## Drift Watches (Log to TASKS.md if Found)

- Router nested in `workers/angel/` (should be in `app.py`)
- Integration without `Protocol` + `Null*` + `*NotConfiguredError` shape
- Query missing `tenant_id` scoping
- CORS headers on server-to-server route
- Code assuming persistent process (Vercel is serverless)
- Fabricated ratings/reviews/credentials
- DB error catch + 503 without logging error type first
- Stale `.git/index.lock` (check no live git writes in flight before resolving)
- Root markdown files >20 (bloats every session)
- TASKS.md >40KB (makes current state hard to find)

---

## Current Blockers (as of 2026-08-09)

- **Payment vendor decision (D4):** Stripe or Orion? Blocks webhook integration.
- **Site Magic Phase 2:** Evidence Runner + Worker Entrypoint complete locally, uncommitted. Awaiting founder approval to push.
- **OPENAI_API_KEY:** Needed for live adapter testing (OpenAI Codex SDK).
- **Postgres migration apply:** `0019_site_magic.sql` staged, not applied to Supabase (requires D4 approval + deploy).

---

## References

- **CLAUDE.md** — Operating rules (this repo's version of engineering-director)
- **TASKS.md** — Live status (read this, not memory)
- **docs/DECISIONS.md** — ADRs, durable decisions
- **docs/ARCHITECTURE.md** — System design
- **docs/SITE_RENDERER_PLAN.md** — Site generation architecture
- **DEPLOYMENT_CHECKLIST.md** — Pre-deploy verification steps
- **CREDENTIALS.md** — Env vars (not their values)

---

## How to Trigger This Skill

Use naturally in chat: "I'm working on [feature] in NetBuild.Pro", "What's the status?", "Ready to push this?", "Should I add Playwright?", "Site Magic is failing because...", or anything implying you're in the repo.

Or invoke explicitly: `/nbp-director`

---

**Last updated:** 2026-08-10  
**Auto-loads:** TASKS.md, git state, test status, health check  
**Decision framework:** D0–D4 depth ladder + self-approval scope + capability ladder  
**Target user:** Cap'n (founder), not a coder — decide all tradeoffs, approve D4 gates
