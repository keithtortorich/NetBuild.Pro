# TASKS.md — NetBuild.Pro 4.0

## ACTIVE NOW

### 2026-08-10: Landing Page Logo Swap
**Status:** Complete locally, uncommitted.
**What:** Founder dropped the actual asset (`docs/netbuild-pro-wordmark-source.jpeg`, moved there from repo root for tidiness) -- serif "NETBUILD.PRO / THE NETWORK FOR / HOME SERVICE TRADES" wordmark, previously only seen pasted in chat, unrecoverable from that. Trimmed to content bounds and keyed white-to-transparent with Pillow (source had a plain white background, confirmed uniform via corner-pixel sampling), embedded as an inline base64 `data:image/png` in `netbuild_pro.html` (this repo has no generic `StaticFiles` mount -- `/static/*` routes are hand-registered one at a time in `site_render_router.py` by design, "dependency-minimal" per its own comment -- and the asset is 33KB source / ~120KB base64, small enough that adding a new route for one image wasn't worth it).
**Contrast fix:** the wordmark's ink is near-black (sampled RGB ~(5,0,0)), designed for a light background. Both call sites (`Navbar` over `hero-glow`, `Footer`'s `bg-[#1A1A2E]`) are permanently dark -- black-on-navy would have been invisible. Wrapped the image in a light plaque (`rounded-xl bg-white/95 border border-white/10 shadow-sm`, same pattern as the Hero's existing "Just booked" card) instead of altering the founder's actual brand colors.
**Removed:** the old `Logo` component's `variant` prop (split/dark/unified text-color logic) -- only one asset now, no variants needed. Both call sites simplified to `React.createElement(Logo, null)`.
**Verification:** `node --check` passed. Health check 14/14 HEALTHY. Confirmed via Browser pane screenshot (Navbar) and DOM query (`img.complete`, `naturalWidth`/`naturalHeight` -- Footer, since the screenshot tool hit the same stale-frame issue as the prior session on scroll).
**Not done:** Not committed -- approval gate.

### 2026-08-10: Landing Page Visual Pass (Section Rhythm + Demo Cards)
**Status:** Complete locally, uncommitted.
**What:** Founder supplied a reference design file (`~/Desktop/CCCCCCC.html`, an earlier single-HVAC-tier draft of this same page, not something ever committed or deployed) plus reference screenshots. Ported two things from it into the live `webstaffr/templates/netbuild_pro.html`:
1. **Section rhythm** -- added `.section-gradient` / `.section-dark` / `.section-light` (fixed palette, no light/dark-toggle override, exact hex from the reference) and reassigned each mid-page section in order: Hero=gradient(unchanged), Services=gradient, HowItWorks=dark, Pricing=light, Proof=gradient, FAQ=light, Demos=dark, FinalCTA=gradient(unchanged). Every direct-child heading/body text color updated to match (dropped `dark:` pairs that would have gone invisible against a now-fixed background -- the reference itself had this exact contrast bug on Pricing/FAQ, not carried over).
2. **Demo grid restyle** -- `Demos()`'s 9-card plain button grid became a `DemoCard` pill-card grid (trade badge, "Demo site" indicator, name, `{trade} example · Phoenix Metro, AZ` line reusing the real service_area already in `demo_sites.py`'s fixtures, feature checklist, "View live demo →" CTA) -- exact spec pulled from the reference's `DemoCard` component. Click-to-preview behavior (inline iframe, same-card-closes) unchanged.
**Also fixed in-path (found while touching Demos):** grid was missing the Electrical trade entirely (`DEMO_SLUGS` in `demo_sites.py` has 10 trades, grid only had 9) -- added `Brightline Electric`. Separately, the "Skip to main content" link was rendering as a permanent visible banner instead of the standard focus-only pattern -- added the missing `.skip-link` CSS (off-screen until keyboard focus).
**Verification:** `node --check` on the extracted inline script (page has previously shipped a blank-screen paren-imbalance bug, see commit `78ea5cc`) -- passed. Local server (`uvicorn webstaffr.app:app --reload`) + DOM-level checks (`getComputedStyle` on all 6 reassigned sections confirms exact gradient/dark/light/gradient/light/dark backgrounds; demo grid confirmed 10 cards with correct trade/name/CTA text; click-to-open interaction confirmed via `aria-pressed` + iframe mount; console clean). Could not get a working screenshot this session -- the Browser pane's screenshot capture was stuck on a stale frame independent of actual page state (cross-checked via `elementFromPoint` + `getComputedStyle` at the exact screenshot coordinates, which showed the correct live DOM/CSS); a tool issue, not a page bug, but means this hasn't been eyeballed visually yet, only verified structurally.
**Not done:** Logo swap (serif "NETBUILD.PRO / HOME SERVICE TRADES" wordmark from a founder-supplied image) -- blocked, no file access to the pasted chat image and it doesn't exist anywhere on disk or in either reference file. Founder needs to drop the actual image file (Desktop is fine) before this can be wired in.
**Not done:** Not committed -- approval gate, and recommend an actual visual eyeball pass (screenshot tool permitting, or founder's own browser) before push given this is a landing-page visual change with no automated test coverage.

### 2026-08-10: Intake 500 in Production — Root Cause Found and Fixed
**Status:** Fix complete locally, uncommitted, tests green, health HEALTHY.
**Symptom:** `POST /intake` 500'd on Vercel prod only; local test always returned 200. Prior debug pass (commits `569912b`..`619fc14`) wrongly chased the middleware stack (CORS/rate-limit/custom-domain/body-limit) — all innocent, reverted.
**Root cause (found via Vercel `get_runtime_errors` MCP, full traceback — `get_runtime_logs` truncates before reaching app code):** [intake_router.py:162](webstaffr/intake_router.py:162) inserted a fresh `uuid.uuid4()` straight into `customer_users.user_id`, which `REFERENCES auth.users(id)` (Supabase Auth) per [0016_customer_auth.sql:2](webstaffr/migrations/postgres_manual/0016_customer_auth.sql:2). No Supabase Auth user exists for a random UUID → `psycopg2.errors.ForeignKeyViolation` on Postgres every time. SQLite (local) doesn't enforce the FK by default, so the bug was invisible locally — confirmed via full-suite/health run this session, both green with the fake-UUID insert removed.
**Deeper gap found while tracing this (not yet fixed, logged here per Drift Watch):** [customer_auth.py:143](webstaffr/customer_auth.py:143) `CustomerAuthorizer.start_session()` requires a `customer_users` row to already exist for the verified Supabase identity and 403s if not — it never bootstraps one. So there is currently **no working path** for a real customer to end up in `customer_users`/`tenant_memberships` at all; the dashboard/attribution/site-magic-control auth routes (`auth_router.py`, `attribution_router.py`, `site_magic_router.py`) are wired but unreachable for any tenant created via intake. Needs a real design: how does a prospect's post-intake Supabase sign-up (using the email already captured at [intake_router.py:46](webstaffr/intake_router.py:46)) get correlated to the tenant_id from their intake submission and bootstrapped into `customer_users` + an `owner` `tenant_memberships` row. This is a D3 item — no precedent in the codebase, touches auth architecture — separate from the MVP-blocking fix below and does not block intake → site → Angel widget.
**Fix applied:** Removed the `customer_users`/`tenant_memberships` inserts from `submit_intake()` entirely — intake's job is lead capture + site generation, not account bootstrap, and no currently-working code path depended on those rows existing post-intake (see gap above: `start_session` couldn't have used them anyway). Removed the now-dead `import uuid`.
**Also already staged uncommitted this session (unrelated authors, found in place):** [intake_start.html:108](webstaffr/templates/intake_start.html:108) frontend now reads `.text()` before `JSON.parse`, no longer throws on a non-JSON error body; [intake_router.py:183](webstaffr/intake_router.py:183) backend now catches `DB_ERRORS + StorageError` around the persist block and returns a clean JSON 503 instead of an unhandled 500. Both are good defensive hardening but were masking, not fixing, the FK bug above — real fix is the insert removal.
**Tests:** Full suite 787/787 (was 786 — includes new `test_storage_failure_returns_json_503_not_html_500`, already staged, unaffected by this change). Health check 14/14 HEALTHY.
**Not done yet:** Not committed — approval gate. Customer bootstrap-on-first-login design (D3 item above) not started.

### 2026-08-10: OpenRouter Live in Production (Confirmed)
**Status:** Done.
`OPENROUTER_API_KEY` added to Vercel Production (encrypted, sensitive) -- Preview still blocked on an interactive branch prompt, deferred separately, Production is what matters for Site Magic. Live probe hit `openrouter.ai/api/v1/chat/completions` with `google/gemini-2.5-flash-image`, HTTP 200, confirmed `choices[0].message.images[0].image_url.url` returns a `data:` URI (1.97MB) -- `OpenRouterImageGenerator`'s response-shape assumption held against a real call, no code change needed. Temp key file deleted; `.env.local` (gitignored) has it for local runs. Node suite 51/51. Unblocks: Site Magic image comps work without OpenAI GPT Image org approval; `design_critique/client.py` (which already expected this key) now has it in prod instead of failing closed.

### 2026-08-10: Demo Sites via SiteMagic (D3 — Implemented Phase 1)
**Status:** Complete locally, uncommitted, tests green.
**What:** ADR-030 (`docs/ADR-030_DEMO_SITES_VIA_SITEMAGIC.md`) implemented. Demo sites are now Site Magic jobs against reserved tenant IDs (`_demo_hvac`, `_demo_plumbing`, etc., `webstaffr/demo_sites.py`), not static fixtures -- prospects who click a demo see the real pipeline's output.
**New files:** `webstaffr/demo_sites.py` (fixtures for 9 of 10 SUPPORTED_INDUSTRIES trades, drawn from `trade_presets.TRADE_HINTS`; reserved 555-01xx phone block, `*.example.com` emails, no ratings/reviews/certifications/license_number -- no-fabrication invariant holds for demos too), `webstaffr/demo_job_manager.py` (`DemoJobManager`: enqueue-once via `SiteMagicRepository`/`SiteMagicQueue`, auto-publish on `ready_for_review` since a demo has no human customer to click publish -- calls `ArtifactStorage.publish()` + `repo.publish()` directly, bypassing `CustomerAuthorizer` since there's no meaningful owner-role subject for a system-reserved tenant), `webstaffr/demo_router.py` (`GET /demos` gallery, `GET /demos/{slug}` enqueue-if-needed -> building page -> 302 to published artifact URL, legacy-slug 301s).
**Retired:** `landing_router.py`'s old `netbuild_demo` (`/demo-sites/{file}` static-file serve off `templates/netbuild_demos/`) and `demo_redirect` (`/demos/{trade}` provisioned-tenant lookup) -- both fully superseded, routes now live in `demo_router.py`. Old URLs still resolve via 301 (`LEGACY_SLUG_REDIRECTS` covers every filename the landing page already links: arbor, waterrestore, roof, landscape, pest, garage, maid).
**Bug found and fixed:** `site_magic_jobs.tenant_id` has a `FOREIGN KEY` on `tenants` -- a real intake submission gets that row via `IntakeRepository.save()`'s own `INSERT OR IGNORE`, but a demo has no intake submission, so `DemoJobManager.enqueue_if_needed()` does the same insert itself; without it every demo's first-ever visit 500'd on an FK violation.
**Tenant-isolation guard:** `intake.generate_tenant_id()` now asserts its output never starts with `_` -- structurally already true (via `sanitize_slug`'s `.strip("_")`) but now explicit and tested, not just an implicit side effect, so a real customer's tenant_id can never collide with the `_demo_` reserved namespace.
**Nav:** `/demos` linked from agency site nav + footer (`templates/agency/base.html`) -- answers ADR-030's open question on demo-gallery visibility.
**Tests:** `tests/test_demo_sites.py` (13, fixture shape/no-fabrication/reserved-namespace), `tests/test_demo_router.py` (10, enqueue-once/building/auto-publish/failed/legacy-redirects), `tests/test_landing_page.py` updated (old static-serve assertions replaced with 301-redirect assertions; `demo_redirect` tests removed, superseded by `test_demo_router.py`).
**Suite:** Full Python suite green in 3 chunks (sandbox tool timeout, not a real gate) -- 331 + 179 + 276 = 786 passed, 51 subtests, 0 failures. Health check 14/14 HEALTHY (existing `demo_site_regressions` check still passes against the new routing).
**Not done yet:** No live end-to-end demo build has run (needs `OPENAI_API_KEY` for the Codex adapter + a live SiteMagic worker process -- image generation itself is unblocked, see OpenRouter entry above). Auto-publish path is exercised only via direct `SiteMagicRepository` fixture calls in tests, not a real worker run. Not committed -- approval gate.
**Founder's open questions from the ADR, still open:** demo rebuild stale-after period (currently: never, cached indefinitely until a job record is manually cleared); contact-form "sample site" message behavior (implemented as designed in the ADR, not separately reconfirmed this session).

### 2026-08-10: Site Magic — Bounded-Retry, Graceful-Degrade Image Generation
**Status:** Complete locally, uncommitted, stacks on the OpenRouter image-generator swap (below).
**Founder decision:** image generation failure mode should be "flexible + bounded retry" — resilient, finishes builds, marks images missing on persistent failure. Rejected the alternative of fail-closed (quarantine/fail the whole job over an image-vendor hiccup).
**What:** `webstaffr/site_maker_engine.ts` gained `generateImagesWithBoundedRetry()` (exported, provider-agnostic — wraps the `ImageGenerator` interface, works regardless of which adapter is wired in). Retries the whole `generate()` call up to `IMAGE_GENERATION_MAX_ATTEMPTS` (3) times with linear backoff (`IMAGE_GENERATION_RETRY_BASE_MS` × attempt), returns `null` (not a throw) after all attempts fail. `SiteMakerEngine.run()` now calls this instead of `this.deps.images.generate()` directly: on `null` (persistent failure), the job does NOT fail — it proceeds with `imagesMissing: true` recorded on the `building` state transition's metadata, and the `builder` codex role's instructions explicitly say no image comps are available and to build with typography/color/layout/iconography only, "never fabricate, reference, or leave placeholders for missing images" (holds the existing no-fabrication invariant even under this new failure path).
**Tests:** 4 new tests in `tests_node/site_maker_engine.test.ts` — retry-helper unit tests (first-try success takes no retry, mid-retry success returns the first working result, persistent failure returns `null` after exactly 3 attempts with 2 backoff sleeps) using an injected fake `sleep` so they run in ~1ms, plus one real end-to-end engine test proving a permanently-failing image generator still reaches `ready_for_review` with `imagesMissing: true` on the building transition and the correct no-fabrication instruction reaching the builder role (this one test does incur the real ~1.5s backoff delay by design, to prove actual engine wiring, not just the helper in isolation).
**Suite:** `site_maker_engine.test.ts` + `site_magic_worker.test.ts` + `site_magic_adapters.test.ts`: 46/46 passing.
**Not done yet:** Not committed — stacks on top of already-uncommitted Site Magic Phase 2 + OpenRouter-swap work.

### 2026-08-10: Site Magic — Wired OpenRouter as Image Generator (replaces OpenAI)
**Status:** Complete locally, uncommitted, builds on prior uncommitted Site Magic Phase 2 work.
**Why:** OpenAI's GPT Image org-access approval is still pending (blocks `OpenAIImageGenerator`). `OpenRouterImageGenerator` was already written and unit-tested in a prior session (site_magic_adapters.ts) but never selected in `buildProductionDependencies()`. Founder directed the swap directly — no new vendor account needed, reuses the `OPENROUTER_API_KEY` already configured for `design_critique/client.py`.
**What:** `webstaffr/site_magic_worker.ts`'s `buildProductionDependencies()` now constructs `OpenRouterImageGenerator` instead of `OpenAIImageGenerator` for the `images` dependency. Same `ImageGenerator` contract (`string[]` of `data:` URIs), so `SiteMakerEngine` is unaffected. `OpenAICodexRuntime` (Codex/build reasoning) is untouched — this only swaps the image-generation adapter, not the whole OpenAI dependency.
**Docs:** `CREDENTIALS.md` updated — `OPENROUTER_API_KEY` section now documents its second use (Site Magic image generation), fail-closed behavior confirmed (`ImageGeneratorNotConfiguredError` if unset).
**Tests:** Updated `tests_node/site_magic_worker.test.ts`'s existing wiring test to set `OPENROUTER_API_KEY` (was only setting `OPENAI_API_KEY`, would have started failing). Added 2 new tests: confirms `deps.images instanceof OpenRouterImageGenerator`, confirms construction throws if `OPENROUTER_API_KEY` is missing even when `OPENAI_API_KEY` is set (proves the swap is real, not just additive). `OpenRouterImageGenerator` itself already had full unit coverage in `tests_node/site_magic_adapters.test.ts` from the prior session (not yet run against a live OpenRouter response — verify response shape once a key exists).
**Suite:** Node (worker+adapters) 33/33 passing. Full Node suite: 44/47 passing — 3 failures are the Evidence Runner's Playwright/Chromium tests, pre-existing sandbox gap (`chrome-headless-shell` binary not installed in this session; confirmed already installed on founder's Mac per prior session note), unrelated to this change. Python suite not run — this diff touches `.ts`/`.md` files only.
**Not done yet:** Not run against a live OpenRouter key. Not committed — Site Magic Phase 2 (Evidence Runner + Worker Entrypoint) is still uncommitted from the prior session; this change stacks on top of that uncommitted work.

### 2026-08-09: Site Magic Phase 2 — Evidence Runner (Priority #2)
**Status:** Complete locally, uncommitted, builds on the pushed Phase 2 worker-entrypoint commit (`869895e`).
**Approved:** Playwright, axe-core, Lighthouse added as npm deps (explicit founder approval this session). Chromium browser binary installed locally (`npx playwright install chromium`).
**Architecture finding (verified, not guessed):** `QualityReport.designScore`/`applicableMax`/`findings` have no deterministic source — checked Impeccable's actual `critique.md`/`audit.md` and confirmed they're Claude Code sub-agent workflows (LLM judgment), not a scriptable CLI. Only `impeccable detect --json` is real and deterministic (anti-pattern count → `detectorFindings`). Founder decided: `site_maker_engine.ts` now has `mergeDesignAssessment()`, which splices the `design_assessor` codex role's structured `{designScore, applicableMax, findings}` response into `report` right after `evidence.assess()` returns and before any gate check — throws `InvalidDesignAssessmentError` on a malformed/missing response (fail-closed, not a silent pass). `EvidenceRunner` stays purely deterministic.
**What:** `webstaffr/site_magic_evidence_runner.ts` — `PlaywrightEvidenceRunner` (real `EvidenceRunner` implementation): serves the workspace over a loopback static HTTP server, launches headless Chromium at all 3 widths (390/768/1440), collects console errors/failed requests/broken links (4xx+ document|xhr|fetch)/missing assets (4xx+ other resource types)/horizontal-overflow responsive check, injects real `axe-core` and unions violation ids across widths, runs real `lighthouse` via CDP against the served URL for accessibility/performance/best-practices/seo, and shells out to Impeccable's real `detect` CLI for `detectorFindings`. Two boolean fields are narrower than their names suggest by design, documented in the file's module docstring: `contentIntegrityPassed` only catches literal placeholder/unresolved-template markers (Lorem ipsum, `{{...}}`, TODO), and `tenantIsolationPassed` only catches a hardcoded `/sites/<other-tenant>/` path reference in rendered output (needs `tenantId` as a constructor arg — not part of the `EvidenceRunner` interface's `{workspace, widths}`).
**Tests:** 5 new Node tests (`tests_node/site_magic_evidence_runner.test.ts`), genuinely end-to-end against real Chromium/axe-core/Lighthouse/Impeccable-detect (no mocking the thing under test) — a clean fixture passes every check, a broken fixture (missing alt text, 3000px overflow div, 404 image, `console.error()`, Lorem ipsum) fails the corresponding fields, a third fixture proves the cross-tenant leak check. Caught one real bug during development: the first "clean" fixture actually had 2 genuine axe violations (no `<main>` landmark) — fixed the fixture, not the runner. Also 4 new engine tests (`tests_node/site_maker_engine.test.ts`) for `mergeDesignAssessment()`'s merge/validation/fail-closed behavior, plus updated existing engine and worker test mocks to supply the new `design_assessor` contract. Full suite: Python 767/767, Node 40/40, health 14/14.
**Wired same session (approved):** `buildProductionDependencies()` now constructs `PlaywrightEvidenceRunner`, not `NullEvidenceRunner`. This forced a real interface change: the evidence runner needs the job's own `tenantId` at construction (for `tenantIsolationPassed`'s other-tenant-path check), so no single `WorkerDependencies` value is valid across tenants. `WorkerDependencies` in `startWebhookServer()`/`processJob()` is now built per job via a `DependencyFactory = (tenantId: string) => WorkerDependencies`, not a fixed object shared across the server's lifetime. Added a test confirming `buildProductionDependencies()` wires the real class, not a stand-in. Full suite after wiring: Python 767/767, Node 41/41, health 14/14. No live end-to-end job has run through the real pipeline yet (still needs `OPENAI_API_KEY`, gated separately).

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

### 2026-08-10: Intake 500 / "Unexpected token 'I', Internal S..." JSON parse crash (D1 fix, uncommitted)
**Status:** Root cause found and fixed locally, tests green. Not committed.
**Symptom:** Every intake form submit from the live site threw `Unexpected token 'I', "Internal S"... is not valid JSON` in the browser. Cause chain: `submit_intake()` (`webstaffr/intake_router.py`) ran its DB-write block (intake_submissions, customer_users, tenant_memberships, tracking_numbers) with NO try/except. `IntakeRepository.save()` re-raises any DB failure as `StorageError` (a `RuntimeError`, not in `DB_ERRORS`), which escaped the handler as an unhandled 500 HTML page. The frontend's `response.json()` at `intake_start.html:109` then threw on the HTML body. Locally this never surfaced because the test SQLite schema is fully migrated; in production it 500s because the Supabase Postgres schema is missing the newer tables (customer_auth `0014`, website_leads `0015`, site_magic `0016/0019/0020`) — migrations never applied (the gated "apply Postgres migrations" task).
**Fix:** Wrapped the persistence block in `except (DB_ERRORS + (StorageError,))` → logs `intake_persist_failed error_type=...` (type only, never str), rolls back, and returns JSON 503 with a parseable message (`Intake temporarily unavailable. Please try again shortly.`) instead of a 500 HTML page. Also hardened `intake_start.html` to read `response.text()` and JSON.parse defensively, so any future non-JSON response shows a safe message rather than the raw parse error. Proven by test + a missing-column repro: previously HTML 500, now JSON 503.
**Tests:** added `tests/test_intake.py::test_storage_failure_returns_json_503_not_html_500`. `tests/test_intake.py` 21/21, full smoke+render 36/36 passing.
**Still D4 (not done):** Apply the missing Postgres migrations to Supabase so the schema actually exists — this is the real fix; the D1 change only stops the crash and gives a clean error. Needs the Supabase project ref (subdomain of `SUPABASE_URL`) and an approval gate. See "Applying Postgres migrations to Supabase" thread.

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
**Status:** ✓ Resolved (2026-08-09).
**Implementation:** `site_schema.py` computes `about_trust_signal_count` and `trust_signal_count`. Templates gate on `>= 2` items (`show_about_trust_bar`, `show_trust_bar`). No empty grid cells rendered.
**Files:** `webstaffr/site_schema.py`, `webstaffr/templates/site/{about,home}.html`

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

## PRIORITY #3: PHASE 3 ARCHITECTURE DECISIONS (Complete, 2026-08-09)

Three architecture decisions drafted, approved, and implemented:

1. **ADR-027: Site Magic Worker Callback Protocol** ✓ Implemented
   - HTTPJobStateSink fires webhooks to SITE_MAGIC_CALLBACK_WEBHOOK_URL
   - Idempotent (eventId), constant-time signature verification
   - Non-blocking, best-effort callback firing (failures logged, not thrown)
   - Env vars: SITE_MAGIC_CALLBACK_WEBHOOK_URL + SITE_MAGIC_CALLBACK_SECRET (optional)
   - Tests: verified webhook firing + payload structure

2. **ADR-028: Crawler SSRF Protection** ✓ Documented
   - Pre-request DNS re-validation (Option B) for MVP
   - HttpxSiteCrawler docstring updated with known limitation + escalation path
   - No code change needed (already implemented)

3. **ADR-029: Build Publishing Route** ✓ Implemented
   - SupabaseArtifactStorage.publish() returns public bucket URL
   - Phase 1: assumes bucket publicly readable via Supabase policies
   - Test updated: verify public URL format
   - Phase 3+: Cloudflare Workers + R2 (new implementation, no migration needed)

**Status:** Implementation complete. Ready for integration testing once:
- SMMM team implements listener at SITE_MAGIC_CALLBACK_WEBHOOK_URL (external)
- OPENAI_API_KEY + GPT Image org access available
- Postgres migration (`0019_site_magic.sql`) applied to Supabase

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
6. **Founder: Approve Priority #3 ADRs** — ADR-027/028/029 ready for review
7. **Founder: payment vendor decision** — Stripe or Orion? → unblocks webhook integration.

---

## FILE SIZE

**Previous:** 77.6KB (966 lines)  
**Current:** ~6KB (target met)  
**Archived:** Old sessions and working notes moved to session summaries above.
