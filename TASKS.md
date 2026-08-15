# TASKS.md — NetBuild.Pro 4.0

## ACTIVE NOW

### 2026-08-15: Site Magic Image Compression (Verified, Pending Production Confirmation)

Production jobs 54 and 55 confirmed that form intake, the tenant-scoped four-page Renderer baseline, Site Magic building/remediation, and deterministic evidence all execute end to end. Both remained quarantined because generated PNG transfer weight held Lighthouse LCP near 20 seconds despite responsive geometry and clean links/assets/requests. Founder approved pinned `sharp` on 2026-08-15. Generated comps now normalize to bounded 1280px WebP at quality 80 before the builder sees their paths; intrinsic dimensions remain attached for CLS protection. `sharp` is pinned at 0.35.3 and `npm audit` reports zero vulnerabilities.

Production confirmation: job `122afd83-dad0-4efe-9334-9bd3cfee8ca2` processed submission 56 end to end. WebP compression removed the LCP failure and raised Lighthouse performance from 75 to 95; SEO 100 and best practices 96. Remaining quarantine causes are accessibility (three axe rule IDs, score 89) and design score 22/28. Exact axe rule IDs and affected selectors are now captured in `quality_summary_json` and passed to remediation instead of only providing a count.

Current verification: Python 824/824 passing; Node Site Magic 119/119 passing; health check HEALTHY (14/14). Next action: deploy axe diagnostics, run another production intake, then fix the specific reported accessibility rules.

Accessibility production evidence: job `8847d9c7-8f88-4502-95be-a50f52b5c66f` reached Lighthouse performance 100, SEO 100, and best practices 100. Its three axe rules were `color-contrast` on two CTA buttons, `landmark-one-main` on the document, and `region` on the four content sections. Deterministic hardening now injects a correctly bounded `<main>` landmark, enforces a verified high-contrast CTA treatment, and keeps navigation visible/tappable at mobile widths. Current verification after this change: Python 824/824 passing; Node Site Magic 120/120 passing; health HEALTHY (14/14).

Follow-up job `1b461e78-bc27-4ad4-ad4c-1a316b02cff1` confirmed the main landmark fix and raised accessibility to 94, but exposed remaining contrast targets on navigation/footer/button surfaces plus a standalone menu toggle outside any landmark. Hardening now applies the same high-contrast treatment to those exact surfaces and wraps standalone mobile navigation controls in `<header>`. Verification: Python 824/824 passing; Node Site Magic 121/121 passing; health HEALTHY (14/14).

Final deterministic confirmation: production job `e26c2978-9a5c-4d8e-ac4b-13d7475a5954` scored performance 97, accessibility 100, SEO 100, best practices 100, zero axe violations, zero broken links/assets/requests/errors, and passed responsive/content/functional/tenant gates. Its only quarantine cause was GPT-4o design quality (23/32 with one P1 finding after four rounds). Founder approved upgrading the existing OpenRouter design model to `openai/gpt-5.6-terra`; the Railway override and all repository fallbacks now use that exact model. The first Terra production job (`e84b78d4-9053-43af-a722-aaaf79b407e5`) exposed a provider-contract incompatibility: prompt-only JSON instructions produced an ASCII wireframe instead of the required file envelope. The runtime now requests provider-enforced JSON mode for mutating roles and strict JSON Schema output for read-only reviewers. Verification: Python 824/824 passing; Node Site Magic 122/122 passing; health HEALTHY (14/14). Production confirmation pending.

### 2026-08-15: Site Renderer Now Feeds Site Magic (Local, Verified, Pending Push/Deploy)

Form submission no longer launches the deterministic renderer and Site Magic as unrelated side effects. The database-backed renderer route is always recorded in the Site Magic intake source as a tenant-scoped baseline route plus page manifest, independent of the optional on-disk artifact writer (required for Vercel serverless, where that best-effort write may be unavailable). The worker fetches that rendered baseline from the control plane into its isolated workspace before product, direction, and builder roles run. Prompts now require Site Magic to preserve verified content, navigation, forms, calls to action, and page coverage while replacing the fallback presentation with a distinctive authored direction. Existing design, accessibility, responsive, functional, tenant-isolation, asset, Lighthouse, and final-review release gates remain mandatory before `ready_for_review`.

Also fixed the URL-source validation test seam: DNS resolution is now selected at call time, so deterministic resolver replacement works and URL job creation no longer performs accidental live DNS during tests.

Verification: Python 823/823 passing; Node Site Magic 117/117 passing; health check HEALTHY (14/14). Local only, not committed, pushed, or deployed.

### 2026-08-15 (session standup): Four Real Site Magic Defects Found And Fixed By Actually Running It — Session Ended On OpenRouter Credits, Cumulative Verification Job Left Mid-Flight

**Headline:** founder asked "does a form fillout produce a full site now?" The honest answer was no — the fallback Python renderer ships instantly, but the Codex-built "award-winning" pipeline had never once cleared its own quality gate. This session chased that down to four real, independent, fixed defects, each confirmed against real production jobs (not local guesses) via a live intake → job → SQL read loop repeated ~8 times today.

**1. Image comps never wired to the builder** (earlier today, `4ba5ecf`/`5e374d8`) — comps were generated but the builder LLM had no idea they existed, so it invented image paths that 404'd (`missingAssets: 9` = 3 comps x 3 widths). Fixed in two layers: tell the builder the real paths (necessary but not sufficient — a later job reverted to 9 with zero code change, proving LLM compliance is probabilistic), then `ensureImageCompsRendered()` deterministically guarantees every comp lands on the audited page regardless of builder compliance. Held clean across 3 straight confirmation jobs after the deterministic fix.

**2. `quality_summary_json` never got written on quarantine** (`fd5ca7c`) — the DB column and API both accepted it; nothing mapped a metadata field to it. Every quarantined job's real failure reason was invisible except by archaeology through Railway's log UI, which elides multi-line console.error array output unpredictably. Fixed by threading the full `QualityReport` through the quarantine transition. This single fix is what made the next two defects findable at all.

**3. Cumulative layout shift (0.578 against a 0.1 gate)** — the fallback image gallery from fix #1 had no `width`/`height` on its `<img>` tags. Fixed (`27a4b8f`): `writeImageComps` now parses real pixel dimensions straight from PNG/JPEG header bytes (no new dependency) and threads them through.

**4. Largest Contentful Paint (16.7s against a ~2.5s gate)** — AI-generated comps at the model's default resolution were almost certainly multi-MB. Founder decision (chose "request smaller images" over "add an image-compression dependency like sharp"): OpenRouter's documented `image_config.size` set to `1024x1024` on every Gemini image call (`b028798`). **Confirmed live: performance jumped from 53 to 100, zero remaining lighthouseDiagnostics for that category.**

**5. SEO stuck at 91-across every job that failed it** — traced via the new `lighthouseDiagnostics` field to one specific Lighthouse audit, `meta-description: "Document does not have a meta description"`, confirmed on 3 separate production jobs. A run where the builder happened to include one scored SEO 100 — same probabilistic-compliance shape as defect #1. Fixed (`b49ef35`) the same way: `ensureMetaDescriptionPresent()` deterministically injects one if missing, derived from the page's own already-rendered body text (never invented copy — no-fabrication rule holds).

**Verification methodology this session, worth repeating:** fire a real `zz_test_hvac_*` intake against production after each deploy, poll `site_magic_jobs` via Supabase SQL until settled, read the real `quality_summary_json`. Caught a probabilistic-compliance regression (`missingAssets` reverting from 0 to 9 with zero code change) that a single clean test run would have missed entirely.

**Not resolved — session ended on OpenRouter credits running out:** a fifth test job (tenant `zz_test_hvac_cumulative_0815_1786778505_e6437314`, job `e072aad2-72ea-4dc5-871b-3972270e178c`) was fired to check whether all four fixes together are enough for a job to actually reach `ready_for_review` for the first time ever. Last checked mid-`building` state, not settled — **next session's first move should be checking this job's final status before firing anything new.** If it's still stuck in `building`/`queued`, that's the credits outage, not a code defect — check OpenRouter balance before assuming a regression.

**Design score itself was climbing across sessions even before these fixes** (16/24 → 18/28 → 22/28 → 22/28) — the remediation loop's subjective side is working; the deterministic side was the actual blocker. Whether a real material P0/P1 UX finding (e.g. "emergency contact not prominent enough") still blocks `releaseGatesPass` even after all four deterministic fixes is exactly what the pending job would have told us.

**Test tenants accumulated this session, none cleaned up:** `zz_test_hvac_imgfix3`, `qsjson`, `imgfinal`, `seodiag`, `lcpfix`, `cumulative` (plus earlier `imgfix2`/`detfix`/`gpt4o2` from prior sessions). Deleting requires cascading DB deletes (`intake_submissions`/`tracking_numbers` don't cascade off `tenants`, everything `site_magic_*` does) — flagged, not executed, pending founder confirmation per this repo's production-DB-write approval rule.

**Also this session, unrelated:** cleaned up untracked repo sprawl (`aa24061`) — gitignored `generated_sites/`/`supabase/.temp/`, moved a logo source image to `docs/assets/`, deleted two orphaned scratch files.

**Tests:** Node suite grew from 96 to 116 across this session's fixes, full suite green at every commit. Python suite untouched (823/823, unaffected by any of today's changes — all TypeScript/worker-side).

**Root cause of the "real cause narrowed to a path/wiring bug" note below, confirmed:** `site_maker_engine.ts` generated 3 image comps but never wrote them to the job workspace or told the builder role they existed — the builder invented `<img src>` paths blind, all 404ing. Confirmed live against quarantined job `fb8798e6` (missingAssets: 9, consoleErrors: 9 — exactly 3 comps x 3 widths) by pulling Railway deploy logs directly. Fixed: comps now decode to `{workspace}/images/comp-N.{ext}` before the builder step, and the builder's instructions list the exact paths. `WorkspaceWriter` added as an injected seam (mirrors `CodexRuntime.fs`) so tests don't need a real disk. Also fixed a second, unrelated bug in the same session: `site_magic_engine.py`'s inline `:root` CSS block was an f-string missing its literal braces, so the whole style block was invalid and silently dropped by browsers — every generated site shipped with zero brand-color styling applied. Tests: Python 823/823, Node 96/96. Pushed `4ba5ecf`.

**Untracked-sprawl audit (nothing urgent, logging per drift-watch convention):**
- `supabase/.temp/linked-project.json` — Supabase CLI link cache (project ref + org id, no secrets). Should be gitignored, isn't.
- `.claude/skills/impeccable/` — 25 untracked files (reference docs + detector/hook scripts) alongside 84 already-tracked files from the same skill. Looks like a skill re-sync that was never `git add`ed, not orphaned content.
- `generated_sites/`, `scripts/local_site_magic_driver.ts` — real local-dev output/tooling, just never gitignored or committed.
- `NB.P LOGO.jpeg` (repo root) — referenced by name only in a code comment (`netbuild_pro.html:1008`, `site/index.html:1008`) as the source of a hand-coded wordmark; not loaded at runtime, not dead either.
- `Screenshot 2026-08-10 at 14.45.43.jpeg`, `gemini-svg (1).svg` (repo root) — no references anywhere found; look like scratch drops.
**Not fixed:** none of this was asked for, nothing secret or broken. Worth a future D1 pass to gitignore `supabase/.temp/` + `generated_sites/`, decide the impeccable re-sync's fate, and move/delete the root-level images.
**Update, same session:** gitignore + move/delete done (`aa24061`).

**Fix verified live:** fired a real test intake (`zz_test_hvac_imgfix3_0815_1786769873_10c7b232`, job `40b33393-0b15-45ff-ab9c-e05ab3b132f0`) against production after the fix deployed. `missingAssets: 0, consoleErrors: 0, responsiveChecksPassed: true, axeViolations: 0` — down from the pre-fix job's `missingAssets: 9, consoleErrors: 9, responsiveChecksPassed: false`. Confirms the image-comp wiring bug is dead. Job still quarantined (`remediation_limit`), but now for the expected reason: `designScore: 16/24` (real UX findings — mobile nav, color palette, persuasion copy) and `lighthouse.performance: 72`. That's the design_assessor/Lighthouse doing its job, not a wiring bug. Test tenant not cleaned up.

**Follow-up same session — two more real fixes, chasing "why won't a job ever ship":**
1. Added `failingLighthouseAudits()` diagnostic logging (`site_magic_evidence_runner.ts`) when performance/seo miss the gate — headline scores alone gave no way to tell *why* without re-running Lighthouse by hand.
2. **Bigger find:** `quality_summary_json` had never once been written on any quarantined job, ever — the DB column and API both accepted it, but `HTTPJobStateSink.transition()` never mapped any metadata field to it. `SiteMakerEngine`'s quarantine transitions now pass the full `QualityReport` as `metadata.report`, and the adapter forwards it to `body.quality_summary`. First job with real data (`zz_test_hvac_qsjson_0815_1786774202_7da122bc`) showed something new: **`missingAssets` reverted to 9** on a run with zero code changes since the two clean (`missingAssets: 0`) runs above. Telling the builder the exact comp paths was necessary but not sufficient — LLM prompt compliance is probabilistic, not deterministic.
3. **Real fix:** `ensureImageCompsRendered()` — instead of trusting the builder to reference the comps correctly, deterministically checks the one HTML file Evidence Runner actually audits (mirrors its `ENTRY_CANDIDATES`) before every evaluation round, and appends a visible `<section>` with any comp not already referenced. Real rendered `<img>` tags, not a hidden preload that would pass the gate without the image actually being on the page (kept in line with this repo's no-fabrication ethos — not gaming the gate). Commit `5e374d8`.

**Also newly visible from `quality_summary_json` finally working:** SEO stuck at exactly **91** across every evaluation on every job checked so far (3 different jobs, 5+ rounds) — never moves, which reads as one static, content-independent Lighthouse SEO audit nothing is touching, not remediation noise. Worth a dedicated look once the image-asset axis is confirmed stable. Not yet diagnosed — the specific failing audit ID hasn't been pulled out of `quality_summary_json.lighthouse` yet (only the headline `seo: 91` number has been read so far).

**Confirmed post-`5e374d8` deploy:** fired job `6b3e9103` — `missingAssets: 0, consoleErrors: 0` held on the first run after the deterministic injection landed. Held again on a second confirmation job (`8fe670d3`). Two straight clean runs.

**`quality_summary_json` immediately paid off.** Wired `lighthouseDiagnostics` (failing audit id/title per category, only when that category misses its gate) into the same report that already flows to the DB (`3751232`). First real data: job `8fe670d3`'s SEO sat at exactly 91 -- but the *next* job (`8fe670d3`... wait, distinct job) hit **SEO 100**, so it's not a permanently broken audit, it's probabilistic like the image-comp bug was (whether the builder happens to include `<meta name="description">` that round). Confirmed the specific audit id locally against this repo's own Lighthouse test fixture (which has no meta description): `meta-description: "Document does not have a meta description"` -- almost certainly the same defect hitting production when SEO dips.

**New real defect found via the same diagnostic wiring:** job `8fe670d3`'s performance stayed at 53 with real audit detail this time: `largest-contentful-paint` 16.7s (gate wants ~2.5s) and `cumulative-layout-shift` 0.578 (gate wants <0.1). Two distinct causes:
1. **CLS** — `ensureImageCompsRendered`'s fallback gallery had no `width`/`height` on its `<img>` tags, a textbook layout-shift cause. **Fixed** (`27a4b8f`): `writeImageComps` now parses real pixel dimensions from the PNG/JPEG header bytes (no new dependency) and threads them through.
2. **LCP 16.7s** — not fixed, needs a founder call. Almost certainly the AI-generated PNG comps (1536x1024, likely multi-MB uncompressed) are just slow to download. Fixing this means either requesting smaller/compressed images from the generator (`IMAGE_MODEL`/size params in `site_maker_engine.ts`/`site_magic_adapters.ts`) or adding real image compression (would need a new dependency, e.g. `sharp` -- requires approval per this repo's dependency-approval rule). Both trade visual fidelity for speed -- a product tradeoff, not decided yet.

**Not yet done:** fire one more test job post-`27a4b8f` deploy to confirm CLS clears with real dimensions now set. Founder decision needed on the LCP/image-size tradeoff before that axis can converge. Test tenants from this session (`zz_test_hvac_imgfix3`, `qsjson`, `imgfinal`, `seodiag`, plus earlier `imgfix2`/`detfix`/`gpt4o2` etc.) not cleaned up.

### 2026-08-15: Remediator Was Blind To Deterministic Gate Failures — Fixed, But missingAssets Still Won't Clear, Real Cause Now Narrowed To A Path/Wiring Bug

**Root cause of the 2026-08-14 gpt-4o/gpt-4o-mini non-convergence, found by reading code, not by another model swap:** `deterministicGatesPass` gates on `missingAssets`/`consoleErrors`/`axeViolations`/`lighthouse`/`responsiveChecksPassed` etc., but the remediator prompt (`site_maker_engine.ts`) only ever carried `designAssessment`/`ledger` -- the design_assessor's subjective findings. `mergeDesignAssessment` overwrites `report.findings` with those, dropping the deterministic ones entirely. The remediator model was never told missing assets or console errors existed; no text instruction could have fixed what it never saw. Fixed: `summarizeDeterministicEvidence()` spliced into both remediator call sites (`195b501`). Node 95/95 passing.

**Second bug found in the same pass:** `generateImagesWithBoundedRetry` swallowed every image-generation error silently and returned `null` after 3 attempts -- by design (2026-08-10 founder direction: a failed image gen must never fail the job), but nobody ever logged *why*. Added a log line (`9039056`), then found it truncated the real error to 64 chars because it reused `describeFailure()` -- the ledger's bounded-field helper, wrong tool for an unaudienced container log (`SiteMakerEngine.run()`'s own catch already draws this exact distinction). Fixed to log the full redacted message (`b75edfe`).

**Fired three real test intakes against production (BYOK-paid) to verify, one per fix:**
1. `zz_test_hvac_detfix_0815` (deterministic-evidence fix only) -- still quarantined, `missingAssets: 3` / `consoleErrors: 3` / `responsiveChecksPassed: false`, unchanged across all 4 remediation rounds despite the remediator now being told about them explicitly. Fix was necessary but not sufficient.
2. `zz_test_hvac_imgfix_0815` (image-gen logging added) -- quarantined again, and the log confirmed image generation genuinely failed: `OpenRouter image call 1/3 for google/gemini-2.5-flash-im...` (truncated). Looked like it might confirm the suspected OpenRouter BYOK gap (BYOK only covers `openai/*` calls per the 2026-08-13 fix; `IMAGE_MODEL` is `google/gemini-2.5-flash-image`, never covered).
3. `zz_test_hvac_imgfix2_0815` (untruncated logging) -- **that theory didn't hold.** This run logged zero "image generation exhausted" lines at all -- images generated successfully. But `missingAssets` jumped to **9** (not 0), `consoleErrors` to 9, still `responsiveChecksPassed: false`. 9 = 3 assets × the 3 viewport widths EvidenceRunner checks (`[390, 768, 1440]`), so it reads as the same 3 assets, just counted per-breakpoint -- not a new/different failure.

**Where this actually points now:** not image generation (that worked on run 3), not OpenRouter billing, not remediator blindness (fixed and confirmed wired). Most likely a path/wiring bug between where the 3 generated image comps get saved in the workspace and what `src` paths the builder role actually writes into the HTML -- i.e. the builder is referencing images at a path that doesn't match where they landed, an ENOENT-shaped bug at the browser/asset level instead of the filesystem level fixed in `c019951`. Not confirmed -- needs someone to actually open one of these three quarantined jobs' workspaces and diff image `src` attributes against actual comp filenames on disk. Two structural fixes shipped and verified this session; this last piece needs manual workspace inspection, not another blind log pull.

**Test tenants added today, none cleaned up:** `zz_test_hvac_detfix_0815_1786761700` (quarantined, remediation_limit), `zz_test_hvac_imgfix_0815_1786762402` (quarantined, remediation_limit, image-gen genuinely failed this run), `zz_test_hvac_imgfix2_0815_1786762931` (quarantined, remediation_limit, images generated fine -- the one worth inspecting for the path/wiring theory above). All three real BYOK spend, safe to delete once inspected.

---

### 2026-08-14 (cont'd): Three More Infra Bugs Found, Model Swap To gpt-4o Doesn't Converge Either — Quality Gates Are A Structural Problem, Not A Model-Tier Problem

**Chasing the remediation-limit quarantine from earlier today surfaced three more real bugs, each found by pushing the pipeline further than it had gone before:**

1. **Three independent copies of the same round limit, only one updated.** Bumped `MAX_REMEDIATION_ROUNDS` 2→4 in `site_maker_engine.ts` to give remediation more room to converge. Missed: `site_magic_router.py`'s Pydantic `Field(le=2)` on `remediation_rounds` (422'd round 3), and Postgres's own `CHECK (remediation_rounds BETWEEN 0 AND 2)` on `site_magic_jobs` (503'd round 3 even after the Pydantic fix, masked by the `DB_ERRORS`→503 pattern). Fixed both -- Pydantic to `le=4`, Postgres constraint widened live via Supabase MCP (D4, approved) and tracked as `migrations/postgres_manual/0022_widen_remediation_rounds_check.sql`. Three places encode one invariant with no shared source of truth; worth a follow-up to make round-limit a single config value both sides read, if this keeps needing to move.
2. **`writeFile` never created parent directories.** Latent since `OpenRouterCodegenRuntime` was written -- `gpt-oss-20b`/`gemma`/`gpt-4o-mini` all happened to never emit a nested file path, so nobody hit it. The moment `SITE_MAGIC_DESIGN_MODEL` was swapped to `gpt-4o`, the very first job ENOENT'd on `images/hero.jpg` because `images/` didn't exist yet. Fixed: `mkdir(dirname, {recursive:true})` before every write ([site_magic_codegen_runtime.ts](webstaffr/site_magic_codegen_runtime.ts)).
3. **`buildProductionDependencies()` never wired the `staticRoot` fix from 2026-08-11.** That session's fix (Evidence Runner mounting `/static/` so app-served assets don't count as missing) was built, tested, and merged -- but the constructor call in `site_magic_worker.ts` never passed it. Every real job since 2026-08-11 has been reporting 6 phantom missing-assets/console-errors. Fixed and covered by a new regression test asserting the wiring, not just the class's behavior in isolation.

**Node 93/93 passing throughout. All four fixes committed and pushed (`5877481`, `ad5beae`, `b7326f2`, `c019951`, plus `3242d86`/`88096f7` docs).**

**Model-tier experiment, founder-directed ("we gotta get it working, maybe both"):** tried `gpt-4o` in place of `gpt-4o-mini` for the design roles, on the theory that a stronger model would converge where a cheap one plateaued. It didn't. Two real BYOK-paid runs, both quarantined at `remediation_limit`:
- `gpt-4o-mini`, 2 rounds: designScore 0.83 (20/24), 0 missing assets/console errors (post staticRoot fix), lighthouse a11y 93 / seo 91.
- `gpt-4o-mini`, 4 rounds (same job type, different generated content): designScore 0.70 (14/20) -- lower, not higher, with double the rounds.
- `gpt-4o`, 4 rounds, post-ENOENT-fix: designScore unclear from log (truncated), but **missingAssets: 3 / consoleErrors: 3 reappeared** (likely image-generation gaps, not the static-mount bug), `responsiveChecksPassed: false` (new failure mode), accessibility 85 (down from 93), seo 90 (down from 91).

**Stopped here, not automatically:** further attempts are real OpenAI spend with no evidence the knob being turned is the right one. Quality not converging across three different models/configs points at something structural in the remediation loop itself -- either the assessor's findings aren't actually being addressed by the remediator, or evidence/image-generation timing doesn't line up with what's being scored. That needs someone to actually read a quarantined job's generated workspace and the assessor/remediator's literal exchange, not another blind model swap.

**Recommended next step (not started):** pick one quarantined job (`fcbcdb63-7750-4bdc-bb32-205686911f7a`, the gpt-4o run, is probably most informative), pull its full `codex.run()` call history for the `design_assessor` and `remediator` roles from Railway logs, and check by hand whether round N+1's remediator instructions actually addressed round N's findings. If they did and the assessor still scored it low, the assessor is the noisy part. If they didn't, the remediator prompt or the ledger hand-off is broken.

**Test tenants added this session, none cleaned up:** `zz_test_hvac_gemma_0813_e9554756`, `zz_test_hvac_gemma2_0813_cfddb848` (429s, safe to delete), `zz_test_hvac_byok_0813_9b4ecdf4`, `zz_test_hvac_gates_0814_9ae889c2`, `zz_test_hvac_4rounds_0814_55c61052` (422, dead code path now), `zz_test_hvac_4rounds2_0814_8c8b62a0` (503, dead code path now), `zz_test_hvac_4rounds3_0814_ba75aaa1`, `zz_test_hvac_gpt4o_0814_3243bae2` (ENOENT, dead code path now), `zz_test_hvac_gpt4o2_0814_813f75f4` -- the last one (gpt-4o, full run) is the one worth inspecting per the recommendation above before deleting anything.

---

### 2026-08-14: Site Magic — BYOK Unblocks The Chain, First Full Pipeline Run, New Blocker Is Quality Gates Not Infrastructure — Session Standup

**Headline:** yesterday's blocker (`openai/gpt-oss-20b:free`'s reasoning eating the whole token budget) turned out to sit on top of a second, harder wall: this OpenRouter account's free tier is capped at 50 requests/day with zero lifetime credit purchase, and today's testing had already burned most of that quota before a model swap could even be evaluated. Swapping to `google/gemma-4-31b-it:free` (no forced reasoning tax) didn't clear it -- two more test jobs both died in ~12s on `429 Too Many Requests`. The actual fix: founder added an OpenAI key to OpenRouter's BYOK integration (openrouter.ai/settings/integrations), which routes `openai/*` model calls through the founder's own OpenAI billing instead of OpenRouter's free-tier pool. `SITE_MAGIC_DESIGN_MODEL` set back to `openai/gpt-4o-mini` (Railway env var). Result: a test intake (`zz_test_hvac_byok_0813_9b4ecdf4`) ran the full chain for the first time ever -- codegen, evidence, 2 remediation rounds, no crash, no malformed JSON, no rate limit -- and landed on `quarantined` / `remediation_limit`: the 11-condition `deterministicGatesPass` check never fully cleared in two rounds, so the job correctly refused to ship instead of producing a bad site. This is a materially different and better failure than every prior session's: infrastructure and format are no longer the blocker, output quality is.

**Bug found and fixed in-path:** `quarantined` jobs never logged which of the 11 gate conditions failed -- `quality_summary_json` stayed `null` even on the terminal event, and Railway's own log showed only `failureCode: 'remediation_limit'` with zero detail. Same silent-diagnosis shape as `describeFailure` (fixed 2026-08-13, bug #2), one layer deeper: that fix made *why a job failed* visible; this one still left *why remediation didn't converge* invisible. Fixed: `console.error` logging the full `QualityReport` (axe violations, all four Lighthouse scores, broken links, missing assets, console/failed-request counts, every P0-P3 finding) right before the quarantine transition ([site_maker_engine.ts:338](webstaffr/site_maker_engine.ts:338)). Node 92/92 passing. Committed `4119c56`, pushed to `main`.

**Not yet done:** the actual gate-failure detail from `zz_test_hvac_byok_0813_9b4ecdf4`'s run predates this fix, so it was never captured -- next test intake's quarantine will be the first to show real numbers (which Lighthouse category, how many findings, etc). That's the natural next step: fire one more test intake and read what's actually failing.

**Test tenants added today, not yet cleaned up:** `zz_test_hvac_gemma_0813_e9554756`, `zz_test_hvac_gemma2_0813_cfddb848` (both 429-failed, safe to delete), `zz_test_hvac_byok_0813_9b4ecdf4` (quarantined, worth keeping until its workspace is inspected for what the design assessor actually built).

**Also clarified:** Railway's own trial-credit warning ("28 days or $4.86 left") is unrelated to OpenRouter -- different vendor, different balance. Founder had conflated the two mid-session; worth remembering they're separate bills before the Railway trial actually lapses.

---

### 2026-08-13: Site Magic — Ten Real Bugs Found By Actually Running It, Model Reliability Now The Blocker — Session Standup

**Headline:** the OpenRouter 402 from last session was a red herring on top of a real one — this OpenRouter account has never had a payment method added (`is_free_tier: true`, confirmed via the key-info endpoint), so every paid-model call was always going to 402. Swapped to `openai/gpt-oss-20b:free`. That swap alone didn't work either, because `DESIGN_MODEL` turned out to be a hardcoded literal that silently ignored the env var meant to control it. Once both were actually fixed, the pipeline ran further than it ever had — full remediation cycles, real evidence checks, real codegen writing real files — and surfaced nine more genuine defects, one after another, each found by firing a real intake and reading the real failure, not by guessing. `ready_for_review` still hasn't happened. The last failure of the day was an empty API response, not a parseable malformation — the free model's mandatory reasoning is eating its entire `max_tokens` budget on verbose remediation rounds, leaving nothing for content. That's a model-capacity ceiling, not a code defect, and it's where the day stopped.

**Ten real bugs fixed today, in the order they were found (each one only visible by running the pipeline against production, never from reading the code):**
1. **`c0acf7f`** — Codegen JSON arrived wrapped in a ` ```json ` fence; `JSON.parse` choked on it outright. `stripJsonFence()` added.
2. **`4754660`** — The worker's own log only ever echoed the same 64-char redacted `failure_code` back at itself. Added a raw, unredacted `console.error` in `SiteMakerEngine`'s catch so the Railway container log carries more than the ledger does.
3. **`1dac17a`** — `PathValidator.validatePath` called `fs.realpath()` directly on the file being written, but `realpath` requires the target to already exist — every write of a brand-new file threw `ENOENT` before anything was ever written. Fixed to realpath the nearest *existing* ancestor instead. The test double's `realpath` never modeled ENOENT for a nonexistent path, so no test caught this — same shape as last session's jsonb/TEXT gap.
4. **`0237997`** — `runImpeccableDetect`'s default CLI path pointed at `.claude/skills/impeccable/...`, a Claude Code agent-skill path never shipped in the Docker image (and untracked in git besides). Repointed at the real `impeccable` npm package's own CLI, resolved through its `exports` map since direct subpath resolution is blocked.
5. **`74c8e33`** — `stripJsonFence`'s regex required the *entire* response to be one closed fence; a fence that never closed (more likely on a large remediation payload) fell through unstripped. Made non-anchored with a brace-slice fallback.
6. **`a8a0c78`** — `DESIGN_MODEL` was a hardcoded `"openai/gpt-4o-mini"` literal despite an env-var-aware default existing one layer down — every `codex.run()` call passed the hardcoded value explicitly, so setting `SITE_MAGIC_DESIGN_MODEL` in Railway had zero effect. This was the real reason the free-model swap didn't take on the first attempt.
7. **`e2a48fc`** — Neither OpenRouter call set `max_tokens` at all. `gpt-oss-20b:free`'s reasoning is mandatory (confirmed by testing `reasoning: {enabled: false}` directly — OpenRouter rejects it) and eats a large, non-optional share of whatever budget applies, so an unset default truncated a real multi-page `direction` response mid-string. Set to 16000 explicitly.
8. **`19283a1`** — RFC 8259 requires literal control characters inside a JSON string to be escaped; the model routinely emits a raw newline instead when a string value carries multi-line content, and V8 reports that as "Unterminated string." Added `sanitizeJsonControlChars()`, a quote/escape-aware state machine — a no-op on already-valid JSON, so always safe to apply.
9. **`20cec59`** — The diagnostic snippet added in #8 was a flat 0–300 char prefix; a real failure's malformation was at position 894, so the log showed 300 characters of nothing wrong. `buildParseErrorSnippet()` now centers a window on whatever position V8's `SyntaxError` reports.
10. **`6ef2ede`** — With the windowed snippet actually working, the next failure showed a response truncated by exactly one character — every bracket closes except the outermost wrapper's. Added `closeUnbalancedJson()`: walks the string tracking open `{`/`[` and appends whatever's still outstanding. Only ever appends, never reorders or removes, so it's a no-op on balanced JSON — tried as a fallback before giving up.

**Furthest reached:** a job ran the full pipeline twice through — both remediation rounds (`MAX_REMEDIATION_ROUNDS = 2`), multiple real evidence-runner passes, real codegen writing real files to a real workspace. That's the first time any of codegen, evidence, or remediation has ever actually executed. `ready_for_review` has still never happened.

**Where it stopped:** the final failure of the day was `SyntaxError: Unexpected end of JSON input` with an **empty** response snippet — not a malformation any of the ten fixes above address, because there was no content to repair. Most likely explanation: on the second remediation round, reasoning tokens consumed the entire 16000-token budget before any actual JSON content was emitted. That's a capacity ceiling on this specific free model, not a code defect — every parseable malformation found today was found and fixed; this one has nothing to parse.

**Recommendation:** the pipeline is very likely code-correct at this point — everything that could be diagnosed from a real failure has been. The remaining blocker is model choice: `openai/gpt-oss-20b:free`'s reasoning overhead doesn't leave enough room for its own verbose output on multi-round remediation. Two paths: try a different free-tier model with lower reasoning overhead (or optional reasoning), or add real OpenRouter credit so a reliable paid model can carry the remediation/finish-review roles. Founder's call (D4 — vendor/model choice with a real cost tradeoff).

**Tests:** Node grew from 82 to 92 over the day (+10, one regression per real defect found). Health 14/14 HEALTHY throughout — never broken.

**Not done:** production still carries the test tenants from today's ~11 fired intakes (`zz_test_hvac_retry*_0812_*`) — safe to delete once a job finally succeeds or the founder decides to stop testing against production data.

---

### 2026-08-12: Site Magic Ran End To End For The First Time — Session Standup

**Headline:** the chain works. A real intake now creates a job, hands it to the Railway worker, the worker authenticates, calls back, and moves the job's state. That had never happened before today. The pipeline currently stops at the first codegen call because Railway's `OPENROUTER_API_KEY` is not a valid key — everything before that point is proven.

**Proven working (observed, not inferred):**
- `POST /intake` on netbuild.pro returns **200** with a real tenant, submission, and tracking number.
- The job is created and transitions `queued → ingesting`. That single transition proves four things at once: the Vercel→Railway webhook fired, the shared `SITE_MAGIC_WORKER_WEBHOOK_SECRET` matches on both sides, the worker reached the control plane, and Vercel's `INTERNAL_API_KEY` equals Railway's `SITE_MAGIC_INTERNAL_API_KEY`.
- Evidence Runner against a regenerated site: 0 axe violations, Lighthouse **100 / 100 / 100 / 100**, no broken links, missing assets, console errors, or failed requests.
- Suites: Python **822**, Node **82**, health **14/14 HEALTHY**.

**Never yet run:** codegen (the LLM that actually builds the site), artifact seal to Supabase Storage, and therefore `ready_for_review`. The first job to get past `ingesting` will be the first real test of all three.

#### Committed and pushed
- `fdd4492` — Site Magic chain wiring; generated-site URL fix; Evidence Runner entry-file + `staticRoot` fixes; footer contrast fix.
- `be83b6b` — intake 500 fix (jsonb/TEXT parity + the over-narrow `except` on a path documented as never able to fail).

#### Committed, NOT pushed — needs a push
- **`ab0b47b` — "fix: record why a Site Magic job failed."** `describeFailure()` puts a redacted, bounded reason in `failure_code` instead of the bare class name `Error`, and the worker logs it. Until this is pushed, the next failed job is diagnosed the slow way (by hand, against the provider). Also carries `scripts/set_openrouter_key.sh`.

#### Uncommitted working-tree changes
- `scripts/setup_site_magic_env.sh` — later hardening after it was first committed: `cd` to the repo (the CLIs resolve their project link from the working directory, so running it from `~` hung on an invisible prompt), `--non-interactive` on `vercel env add` so a failure is loud, and clipboard-first key entry with an in-place retry loop.
- `scripts/set_openrouter_key.sh` — same retry/clipboard hardening.
- These are the fixes for two real incidents this session; they should be committed with the push above.

#### Production config completed this session
`SITE_MAGIC_WORKER_WEBHOOK_SECRET` and `SITE_MAGIC_STORAGE_SERVICE_KEY` on Vercel Production; `SUPABASE_URL`, `SITE_MAGIC_STORAGE_SERVICE_KEY` and a regenerated shared webhook secret on Railway; Supabase bucket `site-magic-builds` created **private** (signed-URL route per ADR-029 — the earlier "public-read" note in this file was wrong).

#### The last blocker — CLEARED at end of session, not yet exercised
Railway's `OPENROUTER_API_KEY` had been the literal placeholder string `"OPENROUTER_API_KEY"` (18 chars, confirmed inside Railway's own environment), which is why every job 401'd at the first codegen call. **A real key is now set** — verified as 73 chars with an `sk-or-` prefix — and the worker redeployed successfully (`SUCCESS`, 2026-08-12T11:24Z).

**So the very next action is simply to submit one intake at netbuild.pro and watch `site_magic_jobs`.** Every known blocker is cleared; nothing else is pending on config. A job that reaches `ready_for_review` means codegen, image generation, evidence, and the Supabase artifact seal all work — none of which has ever executed. A job that fails will now, once `ab0b47b` is pushed, say why in its `failure_code`.

#### Defects found by running it rather than reading it (all fixed)
1. `site_magic_engine.py` built its link base from `web_dir.as_posix()`, so every generated page shipped `href="/Users/.../generated_sites/..."` in nav, `canonical`, and `og:url` — broken anywhere it is served, and it leaked the build machine's directory layout into public HTML and SEO tags.
2. A relative `rel=canonical` is invalid and fails Lighthouse's `canonical` audit — the entire gap between SEO 91 and the gate's 95. Now emitted only when an absolute origin is configured, omitted otherwise; no origin is hardcoded because tenant sites can live on custom domains.
3. Evidence Runner served only `index.html` at `/`, so a workspace whose entry is `home.html` had Lighthouse audit a 404 and score 0 everywhere, with no finding saying why.
4. Evidence Runner knew nothing about the app's `/static/` mount, so a perfectly good site logged missing assets, console errors, and failed requests at every width — enough to fail the gates alone.
5. `.ws-footer-attribution` used `opacity: .7` over `--ws-muted`, blending to an effective 3.07:1 on white and failing WCAG AA on every generated site.
6. jsonb/TEXT parity in `site_magic.py` — the production 500.
7. `failure_code` recorded only an exception class name, making the first real failure undiagnosable from the ledger or the logs.

#### Also worth a decision
- Railway is on trial credit — "30 days or $4.99 left". The worker goes offline when it runs out.
- Two Railway projects exist under the same account: **melodious-elegance** (`c3dbdfb7-…`) runs the worker; **agile-perfection** (`76fd82a3-…`) is unrelated. The random names cost real time this session; worth renaming melodious-elegance to something obvious.
- Two OpenRouter keys were exposed in chat during setup and were rotated/deleted. Root cause was tooling design, not user error: a script that exited to a shell prompt where the next paste landed, and instructions that told the founder to copy a command from chat while a script relied on the key being on his clipboard. Both are fixed in the uncommitted script changes above.

#### Test data to clean up
Production carries two test tenants from this session: `zz_pipeline_test_heating_and_air_eea8964a` and `zz_pipeline_test_two_heating_and_air_59805c89` (tenants, intake_submissions, tracking_numbers, and one `failed` site_magic_job). Safe to delete once a job has run through successfully.

#### OmniRoute — answer to "can we change our user to OmniRoute"
The code already supports it; no code change is needed to switch. `buildProductionDependencies()` ([site_magic_worker.ts:82](webstaffr/site_magic_worker.ts:82)) reads `SITE_MAGIC_USE_OMNIROUTE` (defaults to on) and routes codegen through `OpenRouterCodegenRuntime`, whose endpoint comes from `SITE_MAGIC_CODEGEN_BASE_URL`.

The catch is where that endpoint points. Unset — today's state — it goes straight to openrouter.ai using `OPENROUTER_API_KEY`. The OmniRoute path expects a **gateway that holds the provider credentials itself**, and the only address wired for it is `http://localhost:20128/v1`. A Railway container has no localhost gateway, so pointing at that URL from production would fail every call. Switching genuinely means standing up an OmniRoute gateway on a public, authenticated address and setting `SITE_MAGIC_CODEGEN_BASE_URL` to it.

That is a hosting-and-vendor decision (**D4**), not an engineering one: a new always-on service to run, pay for, and secure, in exchange for multi-provider fallback and free tiers. Recommendation: get one job through end to end on plain OpenRouter first. Right now nothing has ever exercised codegen, so switching routers would change two variables at once and make the next failure ambiguous.

### 2026-08-11: Site Magic Chain Was Not Actually Wired -- Three Breaks Found and Fixed (D2, Uncommitted)
**Status:** Code fixed locally, tests green, health HEALTHY. Chain still cannot run until the config items below are set (approval gate).
**Correction to the entry below:** the prior session's "form to site chain wired end to end" was wrong. The Railway worker is genuinely online and its auth path is genuinely proven, but nothing connected it to the app. Three separate breaks, each of which alone would have stopped the first real intake:

1. **The app never built a real queue.** `webstaffr/app.py`'s module-level `app` passed `site_magic_queue=None` and `site_magic_artifact_storage=None`, so production ran on `NullSiteMagicQueue`. Nothing in the process read `SITE_MAGIC_WORKER_WEBHOOK_URL` at all -- setting it on Vercel was a no-op. Every intake would have created a `queued` row that no worker was ever told about, which is exactly what left job `550e8400-...` sitting queued for a day. **Fixed:** added `_site_magic_queue_from_env()` / `_site_magic_artifact_storage_from_env()`, same shape as the existing `_backend_from_env()` / `_ghl_client_from_env()`, each requiring BOTH of its env vars before constructing anything and catching `SiteMagicNotConfiguredError` so a half-set environment degrades the hand-off instead of breaking app import on a serverless cold start. `tests/test_app_site_magic_wiring.py` (9 tests) pins both, including the exact production state (URL set, secret absent) and that `SUPABASE_PUBLISHABLE_KEY` is never accepted in place of the service-role key.
2. **One env var meant two incompatible things.** `SITE_MAGIC_API_BASE_URL` was read both by `HTTPJobStateSink`/`fetchJobRecord` (this app's control plane, appends `/site-magic/internal/...`) and by `OpenRouterCodegenRuntime` (an OpenAI-compatible LLM endpoint, appends `/chat/completions`). Railway has it set to `https://netbuild.pro`, so every codegen call would have gone to `https://netbuild.pro/chat/completions` carrying a hardcoded `apiKey: "dummy"`. **Fixed:** the LLM endpoint now reads `SITE_MAGIC_CODEGEN_BASE_URL` (unset means openrouter.ai directly, authenticated with the real `OPENROUTER_API_KEY`); the `"dummy"` key and the OmniRoute-only `auto/best-free` model id now apply only when that var points at a localhost gateway, so against a real provider a missing key fails closed instead of sending garbage. Regression test added to `tests_node/site_magic_worker.test.ts`.
3. **The worker cannot store anything it builds.** Railway has exactly 4 vars (`SITE_MAGIC_WORKER_WEBHOOK_SECRET`, `SITE_MAGIC_API_BASE_URL`, `OPENROUTER_API_KEY`, `SITE_MAGIC_INTERNAL_API_KEY`, confirmed in the dashboard, not from this file). `SupabaseArtifactStore` needs `SUPABASE_URL` + `SITE_MAGIC_STORAGE_SERVICE_KEY`, and `buildProductionDependencies()` constructs it per job, so the first real job throws `ArtifactStoreNotConfiguredError` before any LLM call. Separately, the Supabase project has **zero storage buckets** -- `site-magic-builds` does not exist. Both are config, not code.

**Also fixed in-path:** `site/index.html` had drifted from `webstaffr/templates/netbuild_pro.html` (the 2026-08-10 visual pass edited the template only), leaving `test_landing_page.py::test_live_and_static_landing_artifacts_are_identical` failing on committed `main`. Re-synced.
**Cleared:** stale prod job `550e8400-e29b-41d4-a716-446655440001` (`{"test": "data"}`, queued since 2026-08-10) deleted from `site_magic_jobs`. No child rows existed in `site_magic_job_events`/`builds`/`active_builds` (all three tables are empty). `site_magic_jobs` is now empty, so the first real intake is the first real job.
**Tests:** Python 806/806 (was 805 passed + 1 failed on the landing drift). Node 73/73. Health 14/14 HEALTHY.
**Blocked on founder (all four are production config, none are code):**
- Vercel: `SITE_MAGIC_WORKER_WEBHOOK_SECRET` (must equal Railway's existing value), `SITE_MAGIC_STORAGE_SERVICE_KEY`.
- Railway: `SUPABASE_URL`, `SITE_MAGIC_STORAGE_SERVICE_KEY` (same service-role key).
- ~~Supabase: create the `site-magic-builds` bucket.~~ **Done 2026-08-11.** Created **private**, not public-read. The earlier "public-read per ADR-029" note was wrong: ADR-029 documents the 10-year *signed-URL* publishing route, and `site_magic_adapters.ts:213` says private bucket. Signed URLs need the bucket private.
- Push: the code fixes above only reach production on a push to `main` (Vercel and Railway both auto-deploy from it).
**Also worth a decision:** the Railway account is on trial credit -- "30 days or $4.99 left" in the dashboard. The worker goes offline when that runs out.

### 2026-08-11: Site Magic Test Run -- Suites Green, Live Run Still Blocked, Two Real Defects Found (D1)
**Status:** Test suites pass. Neither the live nor the local end-to-end run could execute -- both blocked on the same missing credential, not on code.
**Suites:** Node `npm run test:site-magic` 73/73 (36.7s, real Chromium). Python `pytest -k site_magic` 184/184.
**Live path re-verified against the dashboards, not docs:** Railway worker `netbuildpro-production.up.railway.app` is ACTIVE and online; a POST with a wrong `X-Site-Magic-Secret` returns **401**, so the receiver is up and fails closed. Supabase prod has all four `site_magic_*` tables, `site_magic_jobs` empty. Railway still shows exactly the same 4 service variables. Vercel Production still has no `SITE_MAGIC_WORKER_WEBHOOK_SECRET`, so `_site_magic_queue_from_env()` ([app.py:449](webstaffr/app.py:449)) still returns `None` and production still runs `NullSiteMagicQueue`. Firing an intake now would only recreate the `550e8400` dead-queued-row situation, so it was not fired.
**Correction to a stale note:** the earlier claim that `.env.local` holds `OPENROUTER_API_KEY` "for local runs" is wrong. That file is a `vercel env pull` artifact and every Sensitive value in it is redacted to an empty string (`OPENROUTER_API_KEY` len=0, same for `SUPABASE_URL`, `INTERNAL_API_KEY`). There is no OpenRouter key anywhere on this machine, so `OpenRouterCodegenRuntime` throws `CodexRuntimeNotConfiguredError` at construction and the local end-to-end cannot run either.
**Evidence Runner proven live** on real rendered output (the credential-free half of the pipeline): 11.4s, real Chromium at 390/768/1440, real axe-core, real Lighthouse over CDP. Against `generated_sites/pro_hvac_services_6dcfd0c8/web` with an `index.html` entry: Lighthouse a11y 94 / perf 100 / best-practices 96 / SEO 91, 0 axe violations, 0 broken links, responsive + content-integrity + tenant-isolation all pass.

**Three defects found, all three fixed (D1/D2, uncommitted):**

1. **Filesystem paths were being written into public HTML.** [site_magic_engine.py](webstaffr/site_magic_engine.py) set `site_root = f"{web_dir.as_posix()}"` -- the on-disk absolute path -- and used it as the URL base for every internal link plus `<link rel="canonical">` and `<meta property="og:url">`. Rendered pages carried `href="/Users/doc/Desktop/NetBuild.Pro/generated_sites/<tenant>/web/services/repair"`: broken wherever the site is actually served, and it leaked the build machine's directory layout into public HTML and into SEO canonical tags. **Fixed:** new `resolve_public_base_url()` + `site_root = f"{base}/sites/{tenant_id}/web"`, the same URL space `site_render_router._site_root()` serves. That generator runs offline with no `Request`, so the origin comes from the new optional `NETBUILD_PUBLIC_BASE_URL`; unset means origin-relative, which is correct for navigation, and setting it gives canonical/og:url the absolute URLs they want. `tests/test_site_magic_engine_urls.py` (10 tests) pins it, including a blanket assertion that no generated page contains the workdir path or `/Users/`. This module had zero test coverage before.
2. **Evidence Runner only ever served `index.html` at `/`.** [site_magic_evidence_runner.ts](webstaffr/site_magic_evidence_runner.ts)'s `startStaticServer` 404'd `/` for any workspace whose entry is named otherwise -- and the Python generator emits `home.html`. Lighthouse then audited the 404 body and returned 0 in every category with no finding explaining why, which reads as a catastrophically bad site rather than a missing entry file. That is exactly what this session's first evidence run produced. **Fixed:** `ENTRY_CANDIDATES = ["index.html", "home.html"]`, tried in order, `index.html` still winning when both exist.
3. **App-served `/static/` assets always counted as missing.** Rendered pages reference `/static/site.css` and `/static/angel-widget.js`, which the FastAPI app serves from routes, not from the workspace. The standalone workspace server knew nothing about them, so a site that is perfectly fine when the app serves it reported 6 missing assets / 6 console errors / 6 failed requests -- enough to fail `deterministicGatesPass` on its own. **Fixed:** optional `staticRoot` constructor option mounted at `/static/`, serving the same real files those routes read, with the same containment check the workspace root already had. `startStaticServer` is now exported so the traversal guard is directly testable -- a browser normalizes `..` out of a URL before sending, so that guard is unreachable through Chromium.

**Bonus defect found once the noise was gone, also fixed:** `.ws-footer-attribution` in `webstaffr/templates/site/static/site.css` used `opacity: .7`, which blended `--ws-muted` (#5a6672) down to an effective #8c949c on white -- 3.07:1, failing WCAG AA's 4.5:1 for body text, on every generated site at every width. Replaced with the token's own color (5.87:1). This was invisible before, buried under the missing-asset noise from defect 3.

**Fifth defect, caught by the SEO gate and introduced by fix 1 itself:** an origin-relative `<link rel="canonical">` is invalid, and Lighthouse fails its `canonical` audit on one -- that single audit was the whole gap between SEO 91 and the gate's 95. Hardcoding `https://netbuild.pro` as a default was rejected: tenant sites can live on their own custom domains, so there is no one origin worth baking in. **Fixed:** `canonical` and `og:url` are emitted only when an absolute origin is configured, and omitted otherwise. Omitting beats emitting a wrong tag -- a missing canonical is not penalized, an invalid one is -- and it matches this repo's existing "omit rather than fabricate" rule. `og:title`/`og:description`/`og:type` are unaffected. Verified both ways: relative-link mode scores SEO 100, and `NETBUILD_PUBLIC_BASE_URL=https://netbuild.pro` also scores 100 even though the Evidence Runner serves on loopback, so a production origin does not sabotage the gate on future builds.

**End-to-end evidence after all fixes**, real Chromium/axe/Lighthouse against a freshly regenerated `pro_hvac_services_6dcfd0c8`: axe violations **0**, Lighthouse accessibility **100** / performance **100** / best-practices **100** / SEO **100**, broken links 0, missing assets 0, console errors 0, failed requests 0, responsive + content-integrity + tenant-isolation all pass. Every internal link is now `/sites/pro_hvac_services_6dcfd0c8/web/...`.

**`deterministicGatesPass` is still false, and now for exactly one reason:** `normalizedScore` is 0 because `designScore`/`applicableMax` come from the LLM `design_assessor` role, which cannot run without an OpenRouter key. Every other clause of the gate now passes on real output. That last one is the credential blocker, not a code defect.
**Suites after all fixes:** Python **817/817** (was 806; +11 new). Node **77/77** (was 73; +4 net). Health 14/14 HEALTHY.

### 2026-08-11: Client Dashboard — NetBuild Control Center (D2, Complete Locally, Uncommitted)
**Status:** Complete locally, tests green, visual pass confirmed. Not committed (approval gate).
**What:** Client-facing dashboard so trade-business owners watch what NetBuild does for them — calls, leads, bookings, reviews, site build, and the voice agent's ROI, in one branded surface.
**Why now:** The backend already had tenant-scoped read endpoints (`/tenants/{id}/metrics`, `auth_router`, `attribution_router`) but no dashboard surface. This fills it as a pure read-only aggregation, no schema change.
**Files:** `webstaffr/dashboard.py` (tenant-scoped `DashboardRepository` + `build_dashboard_data()` — reuses `attribution.CallEventRepository`, COUNTs over intake_submissions/website_leads/appointments/review_requests/review_responses/quotes/site_magic_jobs/call_events/tracking_numbers, every query `WHERE tenant_id = ?`), `webstaffr/dashboard_router.py` (`GET /dashboard`, `GET /tenants/{id}/dashboard` SPA shell, `GET /tenants/{id}/dashboard-data` JSON gated by `CustomerAuthorizer` viewer role), `webstaffr/templates/dashboard.html` (single-file branded SPA: rust/gold/navy palette, 6 KPI cards, ROI donut, NetBuild Agent status, website status, reviews, unified activity feed, honest empty states, Supabase magic-link sign-in), wired as a sibling router in `webstaffr/app.py` (sets `app.state.customer_authorizer`), `tests/test_dashboard.py` (11 tests).
**Verification:** `tests/test_dashboard.py` 11/11 passing; full attribution suite green (32 total). Tenant isolation confirmed (no cross-tenant leak; static check asserts every SQL block is tenant-scoped). SPA renders, auth returns 401/403, HTML serves, screenshot confirmed polished/on-brand. Repo dir was OS-locked (`Operation not permitted`) mid-session from a background preview server; cleared, TASKS.md now updated.
**No-fabrication invariant holds:** empty tenant shows zeros/nulls, never invented busy numbers; ROI figure is the repo's `$250/booked` placeholder, labeled ESTIMATE.
**Depends on (separate D3 item, not built here):** customer bootstrap-on-first-login — there is no path yet that creates `customer_users`/`tenant_memberships` after intake, so real clients cannot log in. Until then, `?preview=1` shows the design with a clearly-labeled SAMPLE PREVIEW mode. Live sign-in needs `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` set (already read by the shell).
**Open question for founder:** swap the `$250/booked` ROI placeholder for a per-plan real figure (Office Staff $497/mo) once bootstrap exists?

### 2026-08-11: Site Magic Worker — Deployed Live on Railway
**Status:** DEPLOYED. Worker online, full chain wired end to end. Not yet exercised by a real intake submission.
**Why:** `site_magic_worker.ts` is a persistent Node process (Playwright/Chromium Evidence Runner) -- can't run on Vercel serverless. This is why the one real prod job (`550e8400-e29b-41d4-a716-446655440001`) has sat at `status: queued` since 2026-08-10 -- nothing has ever consumed the webhook queue.
**Shipped:** `Dockerfile` (node:22-bookworm-slim, `npx playwright install --with-deps chromium`, `npm ci --include=dev` since `impeccable` is a real runtime dep here -- Evidence Runner shells out to its `detect` CLI), `.dockerignore`, `railway.json` (Dockerfile builder, restart-on-failure x5, deliberately no healthcheck path -- worker's only route is POST, a GET check would false-fail), `package.json` gained `start:site-magic-worker`.
**Verified, not just built:** `docker build` succeeded (915MB image). Ran it with dummy env vars -- container starts, logs `listening on :8090`, POST with wrong secret returns 401 (auth path works), GET returns 405 (confirms the no-healthcheck-path call was correct). Cleaned up test image after.
**Also fixed in-path:** `rate_limit_dimensions` never got RLS in its original migration (`0005`) -- shipped fully exposed to anon/authenticated since creation, flagged by Supabase's advisor. Applied `ENABLE RLS` + `REVOKE ALL FROM anon, authenticated` directly in Supabase, backfilled as `webstaffr/migrations/postgres_manual/0021_rate_limit_dimensions_rls.sql` for parity. Zero functional risk -- backend only touches this table via service-role raw SQL, which bypasses RLS regardless.
**Deployed (2026-08-11):** Railway project `melodious-elegance`, service `NetBuild.Pro`, auto-deploys from this repo's `main`. Public URL `https://netbuildpro-production.up.railway.app` (generated domain, target port 8090). Status Online, deploy successful. Worker-side env set: `SITE_MAGIC_WORKER_WEBHOOK_SECRET` (freshly generated), `SITE_MAGIC_API_BASE_URL=https://netbuild.pro`, `SITE_MAGIC_INTERNAL_API_KEY`, `OPENROUTER_API_KEY`. App-side: `SITE_MAGIC_WORKER_WEBHOOK_URL` added to Vercel Production+Preview, redeployed (Ready, 18s).
**Security gap found and closed while wiring this:** Vercel had NO `INTERNAL_API_KEY` at all -- neither Project nor Shared scope -- despite `webstaffr/workers/angel/api_auth.py:94` requiring it. Rita/Leo/Sam's internal routes have therefore been running `DenyAllSharedSecretVerifier` (always-403, fail-closed) in production since they shipped. Pre-existing, not introduced here. Generated a fresh secret, set it as Vercel `INTERNAL_API_KEY` (Production, Sensitive) and the same value as Railway's `SITE_MAGIC_INTERNAL_API_KEY` -- the two names are one shared secret across two processes, per CREDENTIALS.md #12. Those internal routes are now actually reachable for the first time.
**Not done:** No real intake submission has run through the live chain yet -- the wiring is verified (worker online, auth path proven via 401/405 in local container test) but no end-to-end job has executed against real OpenRouter/Playwright in production. The stale prod job (`550e8400-...`, `status: queued` since 2026-08-10, `source_payload_json: {"test":"data"}`) is a malformed test record, not a real submission -- it will fail `resolveSource()` with `UnresolvableSourceError` if the worker ever picks it up. Clear it before or during the first real test.

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

### 2026-08-10: Railway worker deploy artifacts + RLS migration (D4, in progress, uncommitted)
**Status:** Artifacts written, Docker build running in founder's terminal (report pending). RLS migration `0021_rate_limit_dimensions_rls` applied to Supabase and confirmed there.
**What:** `Dockerfile` (node:22-bookworm-slim; Playwright Chromium via its own installer; `npm ci --include=dev` so `impeccable` is a real runtime dep because `PlaywrightEvidenceRunner` shells out to `.claude/skills/impeccable/scripts/detector/cli/main.mjs`; `CMD npm run start:site-magic-worker`). `railway.json` (DOCKERFILE builder, `ON_FAILURE` restart ×5, no healthcheck path — worker's only route is POST, a GET healthcheck would false-fail). `package.json` gained `start:site-magic-worker` (`node webstaffr/site_magic_worker.ts`). `CREDENTIALS.md` scrubbed of the stale SMMM/Celery framing (Credential #12 now describes the worker as a persistent Node process receiving `HTTPWebhookSiteMagicQueue`'s webhook, not the old SMMM/Celery narrative).
**Verified on disk:** Dockerfile/railway.json/package.json script all present and consistent; Evidence Runner's `cliPath` points at the impeccable detect CLI the Dockerfile installs; no `SMMM`/`Celery` strings remain in CREDENTIALS.md.
**Drift (logged, non-blocking):** `0021_rate_limit_dimensions_rls` is applied in Supabase but **absent from `webstaffr/migrations/postgres_manual/`** (that dir ends at `0020`). Repo migration-parity invariant violated: a fresh-Supabase cutover would silently skip it. Needs the `0021` SQL committed to `postgres_manual/` so the repo and cloud stay in parity. Not blocking the running Docker build.
**Next:** founder reports Docker build result; then commit these artifacts (atomic, separate from the Impeccable skill tree rewrite also staged in the tree) and the missing `0021` migration file before any Railway deploy (D4 push/deploy gate).

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
