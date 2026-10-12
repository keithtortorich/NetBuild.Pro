# NetBuildPro Handoff

## Current Founder Assignment: 2026-08-05

This file is the quarterback-succession artifact. Hermes is already operating through a fresh Nous Portal allocation and automatically becomes quarterback if Codex exhausts context. Before acting, reconcile every section below against canonical `/Users/doc/Desktop/WebStaffr4/{AGENTS.md,CLAUDE.md,AGENT_COORDINATION.md,TASKS.md,docs/SESSION_SUMMARY.md}`, current git and production commits, and the shared broker. Canonical state overrides stale text below.

Active work is customer provisioning. Codex owns implementation in `/Users/doc/Desktop/WebStaffr4/scripts/provision_customer.py` and `/Users/doc/Desktop/WebStaffr4/tests/test_provision_customer.py`. Hermes must independently review the acceptance and operational evidence in `/Users/doc/Desktop/WebStaffr4/docs/CUSTOMER_PROVISIONING_PRODUCT_REVIEW.md`: real Supabase Auth identity proof, no random UUID, no intake or public provisioning, no secret output, atomic rollback, identical-active no-op, role or status conflict fail-closed, assigned-tenant access, cross-tenant denial, and audit evidence. Return findings through the broker. Do not revive or merge `0d9b5ba`.

The historical sections below are context, not current truth.

**Date:** 2026-08-05  
**Author:** Hermes (operations lane)  
**Project:** NetBuild.Pro (formerly WebStaffr)  
**Branch:** `hermes/operations` (rebased onto `main` at `a8bffe6`)  
**Working tree:** clean, no active write guards  
**Production:** verified live at `https://netbuild.pro`  
**Broker handoff:** `16552b2110914c19a6995c510e68fe2`  
**Codex is now quarterback** — Hermes is ops only.

---

## 1. Branding & Repo Status
- GitHub repo is already renamed to `NetBuild.Pro` — all remotes point to `keithtortorich/NetBuild.Pro.git`. Nothing to do here.
- User-facing name is **NetBuild.Pro** everywhere. Internal Python package remains `webstaffr`.
- Brand assets: `docs/assets/netbuildpro-logo.png` committed in rename commit `d547862`.

## 2. Current Branch State
- **Hermes lane:** `hermes/operations` branch on `/Users/doc/Desktop/WebStaffr4-Hermes`. Clean working tree. Rebased onto `main`.
- **Codex lane:** `codex/security-foundation` branch on `/Users/doc/Desktop/WebStaffr4-codex`. **Now quarterback.** Owns CORS/RLS/env tasks. Active broker claim.
- **Claude lane:** `claude/product-docs` branch on `/Users/doc/Desktop/WebStaffr4-claude`. Removed from quarterback role. Owns product/UX/copy only.
- **Coordination broker:** `/Users/doc/Desktop/.netbuild-agent-broker` (state.json, no git worktree)

## 3. What Was Committed
- `0d9b5ba` — Implement provisioning for customer_users and tenant_memberships; update CORS to use allowlist and allow credentials
- `a8bffe6` — feat: establish security and customer auth foundation
- `952b319` — docs: log brand-rename commit and Codex GitHub auth repair in TASKS.md
- `d547862` — chore: rename user-facing branding to NetBuild.Pro across docs, templates, and tests; add docs/assets/netbuildpro-logo.png; keep Python package name webstaffr
- `4fc6a69` — docs: add AGENT_COORDINATION.md, binding rule for multi-agent git safety
- `0a531c3` — chore: remove duplicate customer auth migrations 0015 and 0016

## 4. Production Status (Verified Live)
- Vercel deployment: `https://netbuild.pro`
- Health endpoint: HTTP 200
- CORS scoping: exact origin allowlist with credentials; unapproved origins get 403 without CORS headers
- Unauthenticated requests fail closed with 401
- Sensitive Vercel env vars configured:
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - `CUSTOMER_ALLOWED_ORIGINS`
- Supabase migrations applied: `0016_customer_auth`, `0017_customer_auth_rls`
- RLS verified. Authenticated self-read policies active. SELECT-only grants in place.

## 5. Test Status
- **26 passed, 3 failed** as of last run.
- Failing tests are **all CORS-scoping assertions** expecting wildcard `*` origin:
  - `tests/test_intake.py::TestIntakeCORSScoping::test_intake_has_cors_header_for_arbitrary_origin`
  - `tests/test_intake.py::TestIntakeCORSScoping::test_intake_presets_has_cors_header`
  - `tests/test_customer_auth.py::TestCustomerAuthorization::test_...oped` (truncated in output)
- **Root cause:** Current CORS implementation in `webstaffr/app.py` uses exact-origin allowlist with credentials. These tests assert the old wildcard behavior.
- **Owner:** Codex (CORS/RLS lane). Fix: update tests to assert exact-origin allowlist with `Access-Control-Allow-Credentials: true`, not wildcard `*`.

## 6. Provisioning Status (Hermes Lane)
- **Provisioning path EXISTS** in `webstaffr/intake_router.py` lines 141-153: on successful intake, the app inserts into `customer_users` and `tenant_memberships`.
- **Migrations 0015 and 0016 were REMOVED** from the repo because `0014_customer_auth.sql` already defines `customer_users`, `tenant_memberships`, `customer_sessions`, and `customer_audit_events` with full schema. The duplicate 0015/0016 files were stale and conflicting.
- **Committed deletion** of these duplicates in `0a531c3`. Working tree is now clean.
- **Production schema:** `0014_customer_auth.sql` is the canonical migration. Supabase production has been migrated via `0016_customer_auth` and `0017_customer_auth_rls`.
- **Residual risk:** No local SQLite dev database exists (`webstaffr.db` not present), so local provisioning INSERTs haven't been exercised in this session. If a dev runs with SQLite, they need `0014_customer_auth.sql` applied first.

## 7. Outstanding Work Items
1. **Fix 3 failing CORS tests** — Codex's job. Update to assert exact-origin allowlist + credentials, not wildcard.
2. **Confirm D4 authorization** — unclear whether Codex was authorized directly outside chat window; messages hit caveman hook.
3. **Remove caveman hook** from Claude Code configuration — it blocked messages and caused operational issues. Not urgent since Claude is no longer quarterback.
4. **Production is running a feature-branch commit** (`6c57eaf`) — `main` was not merged. Codex should decide whether to merge `main` or keep feature-branch deployment.
5. **PROVISIONING_SPEC.md** was referenced in standup but not found in repo. The actual provisioning logic is in `intake_router.py`; if a formal spec is needed, it must be written.

## 8. Critical Gotchas
- **Do not act on "Screen 13/14 complete" claims** from prior Hermes sessions — they were false. The provisioning INSERTs exist in code, but the duplicate migration files created confusion.
- **Lane collision hazard:** Hermes halted edits on `app.py` and `test_customer_auth.py` after user instruction. Codex owns CORS/RLS/env. Hermes will not touch these.
- **Caveman hook:** If messages appear blocked or truncated, check Claude Code's caveman hook config. Remove or disable it.
- **Safari stale cache:** If Safari shows stale content, rename the file or change the approach. Do not retry the same URL.
- **Em dash rule:** No em dashes in any NetBuild.Pro copy or documentation. Use colon/comma/period instead.

## 9. Pricing & Governance Rules
- **Hard pricing:** Office Staff $497/mo, Business Manager $997/mo. Business Manager bundles SMM agent.
- **Ad paid by contractor** — not by NetBuild.Pro.
- **ServiceTitan/Jobber/Housecall Pro** are qualification signals, not add-ons or upgrade paths.
- **Governance Manual (2026-07-18)** supersedes CLAUDE.md, scattered project instructions, and investor materials for strategic decisions. TASKS.md remains task-state source of truth.
- **Playbook v2 targets:** CAC <$250, demo-to-close 50%+, cost per demo <$60, demos booked 5/SDR/day, trial-to-paid 50-65%.

## 10. File Index
- `webstaffr/app.py` — CORS allowlist middleware, composition root (**Codex lane**)
- `webstaffr/intake_router.py` — provisioning INSERTs for customer_users/tenant_memberships (**Hermes lane**)
- `webstaffr/migrations/0014_customer_auth.sql` — canonical customer auth schema
- `webstaffr/migrations/0013_webhook_deliveries.sql` — prior migration
- `webstaffr/db.py` — Supabase client, Postgres/SQLite routing
- `webstaffr/tenant.py` — tenant model
- `tests/test_intake.py` — intake + CORS scoping tests (**Codex lane for CORS fixes**)
- `tests/test_customer_auth.py` — auth + CORS tests (**Codex lane**)
- `docs/assets/netbuildpro-logo.png` — brand asset
- `HANDOFF.md` — this file

## 11. Broker Registration
- Hermes: `/Users/doc/Desktop/WebStaffr4-Hermes` branch `hermes/operations`
- Codex: `/Users/doc/Desktop/WebStaffr4-codex` branch `codex/security-foundation`
- Claude: `/Users/doc/Desktop/WebStaffr4-claude` branch `claude/product-docs`
- Broker: `/Users/doc/Desktop/.netbuild-agent-broker`

## 12. What Needs to Happen When You Wake Up
1. **Tell Codex to fix the 3 failing CORS tests.** They assert wildcard `*` but production uses exact-origin allowlist. This is the only remaining test debt.
2. **Commit is ready on Hermes lane** (`0a531c3`). Merge or squash as you see fit.
3. **Production is live and healthy** on a feature-branch commit. Decide on `main` merge strategy.
4. **Claude is out of the quarterback chair.** Only use him for product/UX/copy work.

Go to sleep. I got you. We'll finish this in the morning.
