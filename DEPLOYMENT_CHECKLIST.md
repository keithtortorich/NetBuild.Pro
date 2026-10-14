# Deployment Checklist

**Owner:** Founder (approval gate before any push to production)

**Status:** CUT OVER COMPLETE (2026-07-26; independently verified 2026-07-27). Vercel project
`web-staffr3-3` builds from `WebStaffr4.0`; both Postgres migrations applied with RLS verified;
live smoke test passed. Credentials now live and verified: `DATABASE_URL`, `GROK_API_KEY`
(`/chat` returns real Grok replies), `BOOK_API_KEY` (`/book` 401s unauthenticated callers).
Still unset, deferred by founder decision (no new vendor spend/trials yet): `GHL_API_KEY`,
`GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET`, `RETELL_WEBHOOK_SECRET` -- see `TASKS.md`.

---

## Repository Readiness

- [x] **Tests passing**: 169/169 tests passing in a fresh, isolated Python 3.12 venv.
- [x] **Health check**: 8/8 checks HEALTHY (imports, migrations produce expected tables,
      app boots and serves a full chat/book/webhook round trip, intake round-trip with
      tenant isolation, site-data never leaks internal fields, CORS scoped correctly,
      rate limit trips, Angel prompt loads).
- [x] **Tenant isolation verified**: every query scoped by `tenant_id`; auth on `/book`,
      `/webhooks/ghl`, `/retell/*`, `/integrations/*`, `/workflow-graph/*`.
- [x] **Database migrations**: `0001-0007` (SQLite) apply cleanly; the two dropped-engine
      tables confirmed absent from a fresh schema.
- [x] **Angel worker**: code-complete, unit-tested.
- [x] **GHL integration**: implemented (create/update/cancel appointments, retries, error logging).
- [x] **Retell voice wiring**: code-complete, unit-tested, webhook signature verification implemented.
- [x] **Env var reference**: documented (`CREDENTIALS.md`).
- [x] **Git hygiene**: no secrets committed.
- [x] **Secrets manager configured**: Vercel Sensitive env vars in use (`DATABASE_URL`,
      `GROK_API_KEY`, `BOOK_API_KEY` set; GHL/Retell vars deferred -- see Status above).

---

## Cutover Steps (this repo is a rebuild of WS3.3, already live at netbuild.pro)

**This was a re-point, not a first launch.** Correction to the original assumption: env vars
did *not* carry over as expected -- only `DATABASE_URL` existed on the Vercel project. The
application credentials had to be (and are being) entered fresh; three of seven are live.

1. - [x] **[Founder, production DB change]** Both Postgres migrations
   (`postgres_manual/0007_social_media.sql`, `0008_execution_nodes.sql`) applied to the live
   Supabase project. Done 2026-07-26.

2. - [x] **[Founder]** RLS verified: direct `pg_tables`/`pg_policies` query on 2026-07-27
   confirmed default-deny (RLS enabled, 0 policies) on `social_media_mounts`,
   `social_media_intents`, `execution_nodes` -- same pattern as all 11 public tables.

3. - [x] **[Founder]** Vercel project re-pointed to `WebStaffr4.0`. Verified 2026-07-27 via
   the production deployment's own git metadata (built from `keithtortorich/WebStaffr4.0`,
   `main`). A `DATABASE_URL` hostname typo found and fixed during this step (pooler host is
   `aws-1-ap-south-1.pooler.supabase.com` -- `.com`, not `.co`).

4. - [x] **[Agent, post-deploy]** Smoke test passed 2026-07-27 against the live URL:
   - `GET /health` → `200 {"status":"ok"}` ✓
   - `POST /chat` with a real tenant → `200` with a real Grok-generated reply ✓
     (`Access-Control-Allow-Origin` header presence `[Unverified]` -- re-check alongside step 5)
   - `GET /sites/{tenant}` → `200`, zero never-leak fields ✓
   - `POST /book` with no/wrong `X-API-Key` → `401`, no CORS headers ✓
   - Retell bad-signature rejection: **not testable yet** -- `RETELL_WEBHOOK_SECRET` unset,
     so the Null verifier accepts everything by design. Test when Retell is configured.

5. - [ ] **[Founder]** Eyeball-check: open a real generated customer site (site renderer),
   confirm the Angel widget loads and a chat round-trip works end to end. Now meaningful --
   `GROK_API_KEY` is live.

6. - [ ] **[Founder]** Once stable, update WS3.3's own `README.md` to point at this repo, and
   consider tagging WS3.3's final commit as `archive/final`.

---

## Post-Cutover Monitoring (first 30 days)

- [ ] **Inbound call volume**: at least 1 call/day from genuine inquiries.
- [ ] **Answer rate**: 100% of calls answered by Angel (no failures/timeouts).
- [ ] **Booking accuracy**: >90% of bookings correctly captured (name, phone, time, service).
- [ ] **GHL sync success**: 100% of booked appointments synced without error.
- [ ] **Error logs**: no unhandled exceptions; the `_db_connection_failed` logging added to
      the four connection-boundary functions (`site_router.py`, `intake_router.py`,
      `attribution_router.py`, `workers/angel/router.py`) means a DB-layer failure now shows
      up in Vercel logs with an exception type -- check for it, don't assume silence means health.
- [ ] **First renewal decision**: by day 28, customer decides to renew or cancel.

---

## Rollback Triggers

If any of the following occur post-cutover, re-point the Vercel project back to WS3.3
(the archive repo, still fully intact) rather than trying to hot-fix forward under pressure:

1. More than 10% of inbound calls fail to connect or timeout.
2. Any call data (names, phone numbers) appears in logs or public output.
3. GHL sync fails for 3+ consecutive bookings.
4. `/sites/{tenant_id}` starts returning internal-only fields (never-leak list regression).
5. Error rate >1% on any endpoint (monitored via Vercel logs).

---

## Definition of "MVP Validated"

Unchanged from WS3.3: validated when at least 1 paying customer is live and answering calls,
at least 1 inbound call has been successfully answered and booked, and the customer renews
after their first billing cycle. All other metrics are operational -- retention is the
success signal.

---

**Last Updated:** 2026-07-27, after verified cutover + credential setup (`GROK_API_KEY`,
`BOOK_API_KEY`).
**Next Review:** when GHL/Retell credentials get funded and set (completes step 4's Retell
check and unlocks the 30-day monitoring section), or at the founder's step-5 eyeball-check.
