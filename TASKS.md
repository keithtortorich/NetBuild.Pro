# TASKS.md — NetBuild.Pro 4.0

## ACTIVE NOW

### 2026-08-03: Brand Color Doctrine Locked (ADR-021)
Founder approved and locked the new landing page (`webstaffr-standalone.html`) as NetBuild.Pro's canonical brand identity. Wrote the color doctrine: navy #000080 (primary), royal blue #4169E1 (secondary), orange #FF6600 (highlight/CTA), gray #E0E0E0 (neutral), plus logo variants and supporting tones -- see `docs/DECISIONS.md` ADR-021 for the full table. Updated `NETBUILD_GOVERNANCE.md`'s stale Visual Identity section (was: gold #bf9000, deep blue #1f4d78 -- neither matched the approved design). Founder's framing: this is the palette Site Magic's direction engine should treat as NetBuild.Pro's house style, distinct from the dynamic per-tenant `brand_colors` system already documented in `DESIGN.md`.
**Known gap, logged not fixed:** ADR-020 (em-dash rule, 2026-07-30) is referenced in this file and CLAUDE.md but was never actually written into `docs/DECISIONS.md`. Trivial backfill, not done inline to keep ADR-021 scoped.

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

### Palette Contrast Warning (Brand Doctrine)
**Status:** Logged 2026-08-04, health check still PASSES.
**Issue:** `primary-on-neutral-light` measures 4.2:1, WCAG AA needs 4.5:1. Emitted 4x during health check as a warning, not a failure.
**Likely cause:** ADR-021 brand colors (navy #000080 on gray #E0E0E0).
**Fix:** darken the neutral or restrict that pairing to large text only.

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

## NEXT SESSION PRIORITIES

1. **Fix trust bar dead divs** — trivial template patch, unblocks UI polish.
2. **Founder: payment vendor decision** — Stripe or Orion? → unblocks webhook integration.
3. **Webhook integration for payment updates** — D2 scope, new endpoint on Angel router.
4. **Fish Audio parallel test spike** (pending approval) — measure vs. Retell, 1–2 week run.

---

## FILE SIZE

**Previous:** 77.6KB (966 lines)  
**Current:** ~6KB (target met)  
**Archived:** Old sessions and working notes moved to session summaries above.
