# TASKS.md — NetBuild.Pro 4.0

## ACTIVE NOW

### 2026-08-09: Site Magic Phase 2 — Worker Entrypoint
**Status:** Complete locally, uncommitted (see `docs/STANDUP_2026-08-09_IMPECCABLE_PHASE_2.md` for full prior-session context).
**What:** `webstaffr/site_magic_worker.ts` — closes the worker circuit: HTTP receiver for `HTTPWebhookSiteMagicQueue`'s webhook (`X-Site-Magic-Secret`, constant-time compare, fire-and-forget 202), `fetchJobRecord()` pulls the job from the internal control-plane `GET /internal/jobs/{id}`, `resolveSource()` maps `source_type`/`source_payload` into `SiteMakerEngine`'s `SiteSource`, `processJob()`/`runJob()` wire it into `SiteMakerEngine`. `buildProductionDependencies()` wires the real adapters (`OpenAICodexRuntime`, `OpenAIImageGenerator`, `SupabaseArtifactStore`, `HTTPJobStateSink`) but deliberately still resolves `evidence` to `NullEvidenceRunner` — no real Evidence Runner exists yet (Priority #2, not touched). No live credentials touched or needed.
**Intake gap closed same session:** `intake_router.py`'s `_enqueue_site_magic_job_if_configured()` now writes `source_payload = {intake_id, verified_facts: build_public_site_data(submission)}` — reuses the already-vetted, internal-fields-stripped projection `GET /sites/{tenant_id}` serves (never a raw `intake_submissions` dump, never a second drifting definition of "public-safe"). `resolveSource()`'s "intake" branch now maps it to `SiteSource`'s `verifiedFacts`, and still throws `UnresolvableSourceError` (fail-closed, not fabricated) for any job enqueued before this field existed or with a malformed payload.
**Tests:** 11 new Node tests (`tests_node/site_magic_worker.test.ts`) — `resolveSource` mapping for `url`/`repository`/`intake` (present and missing `verified_facts`/`intake_id`), `fetchJobRecord` header/URL/error handling, a full dry-run circuit test (control-plane job record → engine run → sealed build, all fakes/stubs, no network), and two webhook-server tests (wrong secret → 401, right secret → 202 + async run to `ready_for_review`). Full suite: Python 767/767, Node 32/32, health 14/14.

### 2026-08-09: Desktop and Repository Consolidation
**Status:** Complete locally.
**Outcome:** Merged the unique maid-service demo, updated the Sales Tool for NetBuild.Pro and the single Office Staff launch package, repaired five verification-gate suites, consolidated research and Site Magic references into `docs/`, and moved confirmed duplicates, legacy documents, backup bundles, and unsafe prototypes into `/Users/doc/Desktop/NBP_Archive/desktop-consolidation-2026-08-09`.
**Governance:** Updated the canonical governance manual to NetBuild.Pro version 1.2, ADR-022 rust/gold house branding, tenant-specific generated-site palettes, and the single-tier launch. Removed unsupported 78%/85% first-responder claims from active guidance.
**Safety:** No permanent deletion, commit, push, deployment, credential change, or production mutation.
**Validation:** 597 tests passed with 51 subtests; health 14/14 HEALTHY; `git diff --check` clean.

### Brand Color Doctrine
**Current:** ADR-022 rust/gold house palette for NetBuild.Pro-owned surfaces. Tenant-generated sites use verified tenant direction.
**Superseded:** ADR-021 navy/royal-blue/orange house palette.

### 2026-08-03: Stripe Webhook Fixed (was broken, uncommitted, tests failing)
Found `webstaffr/workers/angel/stripe_webhook.py` + `/webhooks/stripe` route already written but never wired into `create_app()`'s composition root (`stripe_webhook_verifier` param missing) — 10/10 tests failing on `TypeError`. Also found a real security bug: `StripeSignatureVerifier.verify()` compared the provided signature against itself (`hmac.compare_digest(provided_sig, provided_sig)`), always passing — forgeable once `STRIPE_WEBHOOK_SECRET` is set. Fixed: wired verifier through `app.py`, rewrote verifier to compute real HMAC-SHA256 over raw request body (route now captures raw bytes via `await request.body()` before Stripe's signature can be checked), fixed test fixture's placeholder signature value that never matched its own configured secret. Added `appointments.status` column (migration 0012 SQLite + 0014 postgres_manual, founder-approved) so payment webhooks have somewhere to write paid/payment_failed/refunded. Tests: 403/403 passing. Health: HEALTHY (10/10). Not committed yet — pending founder direction on unrelated uncommitted diffs in the same tree.

### Impeccable Magic Upgrade — Phase 1 (In Progress)
**Status:** Architecture & implementation docs complete. Ready for coding.  
**What:** Self-learning design feedback loop using Impeccable's 23-command system.  
**Five Stages:** SHAPE (intent) → DIRECTION ENGINE (visual roll) → GENERATE (HTML/CSS) → EVALUATE (critique+audit) → SELF-HEAL & SHIP (autonomous refinement loop).  
**Key Innovation:** Runs unattended. Terminates only when quality thresholds met (≥88 critique score, 0 P0 audit issues). No human approval gate mid-loop; humans approve final direction, not every iteration.  
**Docs:**
- `docs/IMPECCABLE_MAGIC_UPGRADE.md` — 300-line architecture decision (D3), decision matrix, backend orchestrator code.
- `docs/IMPECCABLE_IMPLEMENTATION.md` — step-by-step runbook for Phase 1 (Impeccable install, context setup, engine implementation).  
**Next:** Install Impeccable, run `/impeccable init` + `/impeccable document`, implement `site-maker-engine.ts`, dry-run end-to-end pipeline. Expected Phase 1 completion: end of week.

---

## OPEN BLOCKERS (Live, Unresolved)

### Payment Vendor Decision (D4 Gate)
**Status:** Waiting on founder.  
**Impact:** Blocks webhook integration for payment status updates.  
**Options:** Stripe vs. Orion.  
**Next:** Founder selects vendor → unblock webhook work.

### Trust Bar Dead Divs (Service Pages)
**Status:** Ready to fix (trivial).  
**Issue:** `ws-trust-grid` renders empty `<div>`s on low-signal tenants (e.g., only `emergency_service` set).  
**Fix:** Add minimum-signal-count gate instead of per-item conditionals.  
**Scope:** Product judgment on threshold (engineering question only).  
**Files:** `demo-templates/services.html`, `templates/service.html`

### Site Template Restyle Backlog
**Status:** Logged, deferred.  
**Issue:** `service.html`, `about.html`, `contact.html` still on old `ws-hero-sub` visual language (homepage restyled 2026-07-29).  
**Next:** Extend icon/utility-bar/hero-grid pattern from home to these templates (next restyle pass).

### Initial Launch Tier Alignment
**Status:** Resolved 2026-08-09.
**Decision:** Initial launch uses one tier only: Office Staff at $497/month, slug `office_staff` (ADR-026).
**Implementation:** Runtime validation, public intake, launch pricing, tests, health checks, and current database documentation use the single canonical slug. Future tiers remain post-validation work.

### Validation Regressions After Tier Alignment
**Status:** Resolved 2026-08-09.
**Resolution:** Restored global rendered-site asset routes while retaining tenant-scoped aliases, defined the ServiceTitan poll path used by the composition root, isolated social endpoint tests from the repository database, and aligned landing-page guardrails with the current launch page.
**Evidence:** Full suite 542 passed with 51 subtests; health 10/10 HEALTHY.

### Palette Contrast Warning (Legacy ADR-021)
**Status:** Resolved by ADR-022 and tenant-palette verification.
**Resolution:** NetBuild.Pro-owned surfaces use the current rust/gold doctrine; generated sites validate their submitted tenant palettes rather than forcing the superseded navy/gray pairing.

### Onboarding Smoketest Skill Is Stale (WS3.3 Layout)
**Status:** Logged 2026-08-04. Skill lives outside this repo (plugin dir), so not fixable in-repo.
**Issue:** `webstaffr-onboarding-smoketest`'s `scripts/smoketest.py` refuses to run against WS4.0 — it validates the repo by looking for `backend/main.py`, which is the WS3.3 layout. WS4.0 uses `webstaffr/app.py`.
**Workaround used 2026-08-04:** ran the equivalent inline (TestClient → POST /intake → GET /sites/{tenant}/web). Passed.
**Fix:** update the skill's repo detection to `webstaffr/app.py`.

### Governance Linter Blind Spot
**Status:** Logged, not critical.  
**Issue:** Entity-encoded dashes (`&mdash;`) pass linter regex but render as real em-dashes to visitors (violates no-exceptions ban).  
**Fix:** Add entity-detection to `governance-compliance-linter`.  
**Priority:** Low (one-time finding, 5 instances fixed 2026-08-01).

---

## RECENT SESSIONS (Summaries)

### 2026-08-03: Site Schema System — Impeccable Redesign + Context Setup + Intake Wiring (Complete)
Fixed site template regression (optional fields causing KeyError) by rebuilding site rendering using Impeccable principles. Created `SiteSchema` dataclass: complete, guaranteed-present definition of every site field. Moved business logic (`trust_signal_count`, `has_reviews`, `service_pages`, `palette`) into Python computed properties, out of templates. All fields always present; missing optionals become None (falsy in Jinja2). Integrated into `site_render_router.py`; refactored `build_page_context()`. Created PRODUCT.md and DESIGN.md context files per Impeccable workflow. Ran `npx impeccable install` (successful); attempted `npx impeccable init` (command not found in CLI). Added `webstaffr/site_magic_engine.py` with `generate_site_for_submission()` and wired it into `submit_intake()` as best-effort post-DB-write: site generation errors are logged with the real exception type and swallowed so intake still returns 200 with tracking number. Resolved generated site workdir to `generated_sites/` next to the app DB by default, override via `NETBUILD_SITE_WORKDIR`. Tests: 408/408 passing, health 10/10 HEALTHY. Zero-impact on intake/output or template rendering. Documentation: `docs/SITE_SCHEMA_SYSTEM.md`.

### 2026-08-04: Brand Rename — WebStaffr → NetBuild.Pro
Brand rename executed across repo: docs, templates, landing pages, tests, project rules, and saved logo asset. Kept Python package name `webstaffr` intact to avoid import breakage. Verified 421/421 tests passing. Logo saved to `docs/assets/netbuildpro-logo.png`.

Git:
- Resolved stale `.git/index.lock` after confirming no live git write operations were in flight.
- Committed as `d547862` with exact-path staging per `AGENT_COORDINATION.md`.

### 2026-08-04: Codex GitHub Auth Repair
`gh auth status` showed no active GitHub session. Completed device/web login; `gh auth status` now shows authenticated session for `keithtortorich` with HTTPS protocol and token scopes `gist, read:org, repo, workflow`.

### 2026-08-01: Site Renderer Polish Pass (Complete)
Ran 5-skill audit (design-critique, accessibility-review, design-system, governance-linter, research-synthesis) against live-rendered tenant pages. Fixed: WCAG label/focus-visible gaps, 5 em-dash governance violations (entity-encoded), verified no field leaks. Tests 26/26 passing, health 9/9 HEALTHY. Founder approved scope: site renderer only (Agency/investor site Lovable-hosted, out of scope). Gate cleared for push.

### 2026-07-30: Marketing Coordinator Proposal Rejected
Founder floated 9-agent bundle (Stella, Reese, Conner, Asha, Diana, Eva, Leona, Anya, Oscar) with hand-rolled orchestration. Reviewed, rejected: (1) gated behind SMS/email vendor decision (Phase 4 per `MARKETING_COORDINATOR_PLAN.md`), (2) worse plan than existing Phase 4 approval (which combines `marketing-director-gtm` skill + existing SMMM repo workers). Sample code also lacked tenant scoping, Protocol shape, composition-root registration. Verdict: execute Phase 4 plan as written when SMS/email vendor chosen.

### 2026-07-29: Landing Page Restyle + Debunked Stat Fix
Restyled `/` landing page: added sticky top bar (logo + phone CTA), added inline-SVG icon set, updated comparison grid. Found and fixed: "78% of homeowners hire whoever responds first" stat (already debunked on 2026-07-27, BIA/Kelsey, failed 2x verification) had never been removed from `landing_router.py`. Replaced both instances with "speed-to-lead" framing backed by MIT/Oldroyd study. Flagged: industry-specific unanswered-call percentages (HVAC 66%, plumbing 26%, electrical 24%, pest control 27%) lack verification trail — deferred for separate copy audit.

### 2026-07-28: Governance Em-Dash Fix Approved
Founder confirmed NETBUILD_GOVERNANCE.md is canonical source (Google Drive "Webstaffr4" folder). Em-dash rule is explicit/unconditional: no em-dashes anywhere in NetBuild.Pro copy, internal or external, no exceptions. Supersedes Brand Principles Handbook PDF's looser treatment. Linter updated to catch literal-character em-dashes; entity-encoded variant discovered as blind spot 2026-08-01.

### 2026-07-27: Debunked Stat Investigation
Investigated "78% of homeowners hire whoever responds first" — appears in multiple surfaces (landing copy, sales-crm.html, site-renderer templates). BIA/Kelsey source does not support this claim. Independent verification failed twice. Verdict: fabricated stat, must be removed from all surfaces. Tracking: landing_router.py still contained both instances until 2026-07-29 fix.

### 2026-07-26: DB Error Logging Gap (Silent Failure Pattern)
Found: `DB_ERRORS` catch raises `HTTPException(503)` without logging exception type first. This creates silent-in-production bugs (caller sees 503, logs are empty). Pattern: log exception first, then raise 503. Applied across affected routes.

---

## DECISIONS (Recent, Reference ADR in docs/DECISIONS.md)

- **ADR-020 (2026-07-30):** Em-dash governance rule is unconditional, supersedes Brand Handbook. No entity-encoded variants.
- **Site Renderer Scope (2026-08-01):** This audit covers repo-resident site renderer only. Agency/investor site (Lovable-hosted) and demo sites out of scope.
- **Marketing Coordinator Phase 4 (2026-07-30):** Execute `MARKETING_COORDINATOR_PLAN.md` as written; SMS/email vendor decision gates entry.

---

## HEALTH CHECK (Latest Run: 2026-08-09)

| Check | Result | Notes |
|-------|--------|-------|
| Imports | PASS | All core modules load |
| Migrations | PASS | 9 expected tables, no stale engine tables |
| App Boot + Chat | PASS | Null backends work |
| Intake Round-Trip | PASS | Tenant scoping holds |
| Site Data Projection | PASS | No internal-field leaks |
| Rendered Site Smoke Test | PASS | All pages render, no leaked values |
| Site A11y | PASS | WCAG 2.1 AA labels, focus, contrast, heading order |
| CORS Scoping | PASS | /chat has headers, /book does not |
| Rate Limit | PASS | Trips after DEFAULT_MAX_REQUESTS_PER_WINDOW |
| Angel Prompt Load | PASS | angel_prompt.md present |

**Result: HEALTHY (10/10)**

---

## DEMO VERIFICATION & PRE-MERGE GATES (In Progress, 2026-08-09)

### Phase 1: Impeccable Demo Verification Plan (Complete)
**Status:** Planning complete, execution ready.

Created comprehensive 7-stage verification plan for all 9 demo sites (HVAC, plumbing, roof, landscape, pest, garage, tree service, water damage). Each demo runs through:
1. **SHAPE** — Intake data validation (industry, services, brand intent)
2. **DIRECTION ENGINE** — Visual rollout per ADR-021 brand doctrine
3. **GENERATE** — HTML/CSS rendering (HTTP 200, all sections present)
4. **EVALUATE** — Critique + accessibility + governance audit (≥88 score, 0 P0 issues)
5. **SELF-HEAL** — Autonomous fix loop until gates met
6. **SHIP** — Asset hardening and security headers
7. **VERIFICATION** — Final sign-off (live, mobile responsive, CTAs working)

**Document:** `docs/IMPECCABLE_DEMO_VERIFICATION_PLAN.md`
**Next:** Execute Phase A–E for each of 8 demos (~45 min per demo, can parallelize).

### Phase 2: Pre-Merge Verification Gates (Complete)
**Status:** Design complete, implementation ready.

Defined 5 mandatory verification gates to embed in test suite and health check:
1. **Site Data Schema Audit** — Required/optional fields present and valid
2. **Template Regression Test** — All 9 demos HTTP 200 after code changes
3. **Angel Widget Verification** — Retell embed present and endpoint reachable
4. **Brand Palette & WCAG Audit** — Colors match ADR-021, contrast ≥3:1
5. **Governance Linter** — No em-dashes, no leaked fields, brand name correct
6. **Content Freshness** — Intake → render pipeline integrity (no data loss)

**Document:** `docs/VERIFICATION_GATES_PRE_MERGE.md`
**Next:** Implement as code in test suite, integrate with CI and health check.

### Phase 3: Attach Verification Gates (Complete ✓)
**Status:** Implementation complete, 2026-08-09.

**Implemented 6 verification gates across 6 test files:**
- ✓ `tests/test_site_data_schema_audit.py` (8 tests, Gate 1)
- ✓ `tests/test_site_render_router.py` (extended with 8 demo regression tests, Gate 2)
- ✓ `tests/test_angel_embed_verification.py` (6 tests, Gate 3)
- ✓ `tests/test_brand_palette_audit.py` (8 tests, Gate 4)
- ✓ `tests/test_governance_linter.py` (7 tests, Gate 5)
- ✓ `tests/test_intake_render_roundtrip.py` (9 tests, Gate 6)
- ✓ `scripts/health_check.py` (integrated 4 new gate checks: demo regressions, angel embed, brand palette, governance)

**Result:** Full verification gate suite embedded in CI pipeline. Ready for Phase 4 final verification.

### Phase 4: End-to-End Verification (Pending Phase 3)
**Status:** Ready after Phase 3 complete.

Final verification before merge:
- [ ] All tests passing (542/542)
- [ ] Health check HEALTHY (12/12)
- [ ] All 8 demo sites HTTP 200
- [ ] No governance violations
- [ ] Angel embed active on all demos
- [ ] Brand palette correct (no contrast errors)
- [ ] Git diff staged & ready
- [ ] Ready for push approval

### Site Magic Phase 2 (Complete, 2026-08-09)

Shipped: Impeccable skill trees corrected to the real `skill-v3.5.0` pin
(commit `99fbe4bb`, not the `1cbee026` HEAD/v4.0.4 the pin was mistakenly
recorded against). 114 new Python tests across
`test_site_magic_api.py`/`test_site_magic_repository.py`/
`test_site_magic_security.py`/`test_site_magic_migrations.py` plus 3 in
`test_intake.py` -- tenant isolation, role checks, state-machine
transitions, release gates, SSRF bypass classes, SQLite/Postgres migration
parity. Fixed a real bug found while testing: `normalize_public_url`
treated an explicit port `0` as falsy and silently substituted the scheme
default (443/80) instead of rejecting it. Intake now auto-enqueues a Site
Magic job (source_type=intake) after commit, fail-closed/non-fatal to
intake if the queue isn't configured. Agency router's embedded
`DictLoader` template dict (a second, drifting source of truth) replaced
with real files at `webstaffr/templates/agency/*.html` -- the stale
pre-governance-cleanup copies that used to live there (fabricated stats,
"WebStaffr" branding, wrong pricing tiers, a raw non-functional `<form>`)
are gone; the router now serves the one already-governance-tested version.
Full suite 707/707, health check 14/14, Node 6/6.

**Not done yet** (deferred by explicit approval gate, not an oversight):
Postgres migration apply to Supabase, `OPENAI_API_KEY` creation,
publishing, push, deploy. See `docs/STANDUP_2026-08-09_IMPECCABLE_PHASE_1.md`
for the Phase 1 baseline this built on.

### Site Magic Phase 2b: Adapter Code (Complete, 2026-08-09)

Shipped, code only, no live credentials: `webstaffr/site_magic_adapters.ts`
(`OpenAICodexRuntime` wrapping `@openai/codex-sdk`, `OpenAIImageGenerator`
wrapping the `openai` Images API for `gpt-image-2`, `SupabaseArtifactStore`
sealing a job workspace into Supabase Storage's private bucket) and
`webstaffr/site_magic_adapters.py` (`SupabaseArtifactStorage` for signed
preview/publish URLs, `HttpxSiteCrawler` with same-origin-only bounded
redirect handling and per-hop SSRF re-validation, `HTTPWebhookSiteMagicQueue`).

The queue adapter is a generic authenticated webhook
(`SITE_MAGIC_WORKER_WEBHOOK_URL` + `SITE_MAGIC_WORKER_WEBHOOK_SECRET`), not
a real SMMM/Celery broker client -- this repo has no visibility into that
service's actual API, and guessing its protocol would repeat the same
mistake as the `1cbee026` commit-hash error above. Whoever owns the SMMM
worker needs to register a listener at that URL.

`HttpxSiteCrawler`'s SSRF protection is a re-validate-immediately-before-
each-request narrowing of the DNS-rebind TOCTOU window, not full
connection-level IP pinning (httpx has no simple public API for that) --
documented as a known limitation in the class docstring, not silently
presented as closed.

`SupabaseArtifactStorage.publish()` uses a 10-year signed URL rather than
a real public route/CDN mapping -- a pragmatic MVP choice pending a real
public-serving design for published Site Magic builds.

Not built this pass (would need new npm dependencies -- playwright,
axe-core, lighthouse -- not yet approved): the Evidence Runner (Impeccable
detector + Playwright screenshots + axe + Lighthouse), and the Node-side
`JobStateSink` that calls back into the Python control-plane API plus an
actual entrypoint script wiring `SiteMakerEngine` to real deps end to end.

Tests: 16 new Python (`test_site_magic_adapters.py`, all via
`httpx.MockTransport` + a fake DNS resolver, no network) + 8 new Node
(`site_magic_adapters.test.ts`, via injected `fetch`/transport seams, no
network). Full suite 723/723, health check 14/14, Node 14/14.

### Site Magic Phase 2c: Close the Worker Circuit Locally (Complete, 2026-08-09)

Shipped: `HTTPJobStateSink` (`webstaffr/site_magic_adapters.ts`) reporting
`SiteMakerEngine` transitions back to a new internal, `X-API-Key`-authenticated
control-plane surface (`webstaffr/site_magic_router.py`:
`GET /site-magic/internal/jobs/{job_id}` returning the full job including
`source_payload`, `POST .../transition`), matching the existing Rita/Leo/Sam
internal-router convention exactly. `SiteMagicJob` gained a `source_payload`
field (internal-only -- `_public_job()`'s customer-facing projection still
excludes it, verified by test). `SiteMagicRepository.transition()` now
persists `remediation_rounds`/`rebuild_count`/`quality_summary`/`failure_code`
via `COALESCE` (previously silently dropped). New
`SiteMagicRepository.seal_build_and_advance()` is the first real path that
writes a `site_magic_builds` row and sets `final_build_id` -- previously
nothing did this outside test fixtures raw-SQL-inserting it, so
`ready_for_review` was unreachable for a real job. Build-id collisions
(retried worker calls) correctly 503 rather than silently swapping which
job owns a build.

Known gap, explicitly flagged rather than assumed solved (per the
standup's own engineering-advice list): retried transition calls rely
entirely on the server's existing optimistic-concurrency guard
(`WHERE status = <expected>`), not a correlation ID / monotonic event
sequence -- "already applied, no-op" and "genuinely stale, reject" both
currently surface as the same 409. Lease/claim semantics for a worker
picking a job off the queue are also not built.

Tests: 5 new Python repository (`test_site_magic_repository.py`) + 9 new
Python router (`test_site_magic_api.py`, including a same-build_id race
returning 503) + 5 new Node (`site_magic_adapters.test.ts`). Full suite
745/745, health check 14/14, Node 19/19.

### Site Magic Phase 2d: Idempotent Event-Sequenced Transitions (Complete, 2026-08-09)

Reconciled the idempotency-ledger idea from two external architecture
drafts (pasted into chat from a separate, disconnected sandbox session --
never landed as files, reviewed as text) onto the real schema instead of
adopting them as-is. Both drafts had real, disqualifying defects: a
`.gitignore` diff that deleted every existing rule, migration numbers
(`0015`-`0018` postgres) that silently collided with already-applied
migrations (`webhook_deliveries`, `customer_auth`, `customer_auth_rls`,
`website_leads`), an `async`/`asyncpg` design against a table named
`jobs` when this codebase is sync psycopg2/sqlite3 against
`site_magic_jobs`, an UPDATE that incremented `rebuild_count`/
`remediation_count` on every transition (would blow the schema's own
`BETWEEN 0 AND 1`/`BETWEEN 0 AND 2` CHECK constraints within one ordinary
job), a client-side in-memory sequence counter that resets to 0 on worker
restart (defeats the entire point of a monotonic sequence surviving a
crash), and calls to `sink.claimLease()`/`renewLease()`/`releaseLease()`
that were never defined on the class calling them.

What actually shipped: `webstaffr/migrations/0017_site_magic_job_events.sql`
+ `postgres_manual/0020_site_magic_job_events.sql` (verified against the
real directory listing before picking numbers) add
`site_magic_jobs.current_event_sequence` and an immutable
`site_magic_job_events` ledger, `(job_id, event_id)` primary key.
`SiteMagicRepository.transition_idempotent()` allocates `event_sequence`
server-side (never client-supplied -- eliminates the "client sent a stale
sequence number" failure class by construction), and a retried `event_id`
replays the original cached result (200) instead of re-applying or 409ing,
even after the job has since moved further through the state machine.
`POST /site-magic/internal/jobs/{id}/transition` accepts an optional
`event_id`; omitting it keeps the exact prior (non-idempotent) behavior
for backward compatibility. `HTTPJobStateSink.transition()` (Node) grew an
optional 5th `eventId` param, defaulting to a fresh UUID per call but
letting a future retry wrapper supply the same one across attempts --
`transition()` itself still doesn't retry.

Deliberately not adopted from the drafts: lease/claim semantics. Both
drafts assumed a shared pull-queue with multiple workers racing to claim
jobs; this repo's actual queue adapter
(`HTTPWebhookSiteMagicQueue`/`SiteMagicQueue`) is a single push webhook to
one external worker per job, so the "two workers claim the same job"
problem the lease manager solves doesn't obviously apply to this
architecture -- building it anyway would be solving a problem this system
doesn't have, based on someone else's assumed queue model rather than the
one that's actually here.

Tests: 8 new Python repository, 5 new Python router, 2 new Node, 10 new
migration-parity/existence (including one that pins `0017`/`0020` as
still-free at test time, so a future collision fails loudly). Full suite
767/767, health check 14/14, Node 21/21.

**Still not built:** worker entrypoint script (wire
`SiteMakerEngine` to real deps + a fake `EvidenceRunner` for a first
end-to-end dry run, per standup guidance), the Evidence Runner itself
(needs Playwright/axe/Lighthouse -- new npm deps, not yet approved), a
real SMMM listener (needs SMMM's own team to define the contract), IP-pinned
crawling (needs an egress proxy or a custom httpx transport), and a real
public-serving design for published builds (current 10-year-signed-URL
`publish()` is explicitly a placeholder). `OPENAI_API_KEY`, Postgres
migration apply, publish, push, deploy remain behind their approval gates.

---

## NEXT SESSION PRIORITIES

1. **Site Magic Phase 3** — live adapters (Codex SDK, GPT Image, crawler,
   Supabase Storage, queue) once `OPENAI_API_KEY` + GPT Image org access
   exist; apply `0019_site_magic.sql` to Supabase; shadow pilot across the
   9 demo sites + 6 agency routes before any repository-source job runs
   for real.
2. **Complete Phase 3 (verification gates)** — Implement verification gates in code (all 6 new test files)
3. **Run Phase 4** — Final end-to-end verification, confirm all gates pass
4. **Push to main** — Stage site/index.html, tests/*.py, webstaffr/templates/netbuild_pro.html, docs/IMPECCABLE_*.md, docs/VERIFICATION_GATES_*.md
5. **Fix trust bar dead divs** — trivial template patch (after push, separate PR)
6. **Founder: payment vendor decision** — Stripe or Orion? → unblocks webhook integration.

---

## FILE SIZE

**Previous:** 77.6KB (966 lines)  
**Current:** ~6KB (target met)  
**Archived:** Old sessions and working notes moved to session summaries above.
