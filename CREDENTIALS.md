# WebStaffr Credentials & Onboarding

## Required Environment Variables

### 1. `GROK_API_KEY` (for `GrokVoiceBackend`)
- **Purpose**: enables real chat via xAI's Grok API in Angel.
- **How to get**: your xAI account's API key management page. `[Unverified]`
  the exact current URL -- check xAI's own docs rather than trusting a
  hardcoded link here, since these change.
- **Behavior**:
  - Set -> `GrokVoiceBackend` is used (see `webstaffr/workers/angel/voice.py`).
  - Unset -> falls back to `NullVoiceBackend` (safe, deterministic, no
    external calls).
- **Security**: never commit. Use a local, gitignored `.env` file or your
  shell environment.

### 2. `GHL_API_KEY` + `GHL_LOCATION_ID` (for `GoHighLevelClient`)
- **Purpose**: real appointment and note syncing to GoHighLevel.
- **How to get**: GoHighLevel's developer/API settings for your location.
- **Behavior**:
  - Both set -> real `GoHighLevelClient` is used.
  - Either missing -> `NullGHLClient` (records calls in memory, no network
    calls -- safe default for tests and unconfigured tenants).
- **Status**: `create_appointment`, `log_note`, `update_appointment`, and
  `cancel_appointment` are all implemented (see
  `webstaffr/workers/angel/ghl.py`). GHL sync calls in `Angel` retry up
  to 3 times (configurable via `Angel(..., ghl_max_attempts=N)`) before
  giving up and logging the failure -- a sync failure never blocks a
  booking or a conversation turn.
- **Security**: never commit. Same as above.

### 3. `RETELL_WEBHOOK_SECRET` (for Retell AI voice/telephony webhooks)
- **Purpose**: verifies that `/retell/webhook` and `/retell/function-call`
  requests actually came from Retell before trusting the payload.
- **How to get**: issued by Retell when you register a webhook in their
  dashboard.
- **Behavior**:
  - Set -> `RetellSignatureVerifier` is used (HMAC-SHA256 over the raw
    request body).
  - Unset -> requests are denied. Tests may inject
    `NullRetellWebhookVerifier` explicitly.
- **Tenant resolution**: each tenant's Retell agent/phone number must be
  configured in the Retell dashboard with `metadata: {"tenant_id": "..."}`
  -- Retell echoes this back on every webhook/function-call payload for
  that call. There is no phone-number-to-tenant lookup table (a real
  schema change, not done); this is a first-slice design for a handful of
  pilot tenants configured by hand.
- **Not required to receive webhooks**: `RETELL_API_KEY` is not needed for
  `/retell/webhook` or `/retell/function-call` to work -- it would only be
  needed for this app to call Retell's own management API, which nothing
  in this repo does yet.
- **Security**: never commit. Same as above.

### 4. `GHL_WEBHOOK_SECRET` (for `/webhooks/ghl` shared-secret auth)
- **Purpose**: verifies that `/webhooks/ghl` requests actually came from
  GoHighLevel before trusting the payload -- `tenant_id` alone is public,
  not a credential.
- **How to get**: not issued by GHL -- you choose this value yourself and
  configure it as a custom header (`X-Webhook-Secret: <value>`) on
  GoHighLevel's workflow Webhook action. GHL does not sign outgoing
  webhooks itself, so a shared secret set on both sides is the mechanism.
- **Behavior**:
  - Set -> `StaticSecretVerifier` checks the `X-Webhook-Secret` header
    (constant-time comparison); missing or mismatched -> `401`.
  - Unset -> requests are denied. Tests may inject
    `NullSharedSecretVerifier` explicitly.
- **Security**: never commit. Same as above.

### 5. `BOOK_API_KEY` (for `/book` shared-secret auth)
- **Purpose**: verifies the caller of `/book` before letting it create an
  appointment for an arbitrary `tenant_id`.
- **How to get**: not issued by anything external -- you choose this value
  and give it to whatever calls `/book` directly (there is no live caller
  today; this is for a future booking UI or server-side integration).
- **Behavior**:
  - Set -> `StaticSecretVerifier` checks the `X-API-Key` header; missing or
    mismatched -> `401`.
  - Unset -> requests are denied. Tests may inject
    `NullSharedSecretVerifier` explicitly.
- **Security**: never commit. Same as above.

### 6. `INTERNAL_API_KEY` (for Sam, Rita, and Leo internal routes)
- **Purpose**: authenticates callers of `/quotes/*`,
  `/workers/rita/draft-response`, and `/leo/score`.
- **How to get**: choose a cryptographically random value and share it only
  with the approved server-side caller.
- **Behavior**:
  - Set -> `StaticSecretVerifier` checks `X-API-Key`; missing or mismatched
    requests receive `401`.
  - Unset -> every protected internal request is denied.
- **Security**: never commit. Same as above.

### 7. `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` + `CUSTOMER_ALLOWED_ORIGINS` (customer authentication)
- **Purpose**: verifies customer dashboard bearer tokens against Supabase
  Auth before resolving a local session and tenant membership.
- **Behavior**:
  - Both set -> customer identity verification calls the project's
    `/auth/v1/user` endpoint.
  - Either missing -> `/auth/session`, `/auth/logout`, and private
    `/tenants/{tenant_id}/*` routes fail closed with `401`.
- **Session flow**: after Supabase sign-in, call `POST /auth/session` with
  the access token. Repeat after token refresh so the local expiry follows
  the newly issued access token. Call `POST /auth/logout` before signing
  out of Supabase for immediate application-side revocation.
- **Authorization data**: roles come only from `tenant_memberships` in
  trusted storage. User-editable Supabase metadata is never authoritative.
- **Private browser origins**: `CUSTOMER_ALLOWED_ORIGINS` is a comma-separated
  list of exact origins such as `https://dashboard.netbuild.pro`. Wildcards,
  URL paths, query strings, fragments, and embedded credentials are rejected.
  When unset, private cross-origin `/auth/*` and `/tenants/*` requests are
  denied; same-origin requests still work. Public widget/site routes retain
  their separate wildcard CORS behavior.
- **Cookie readiness**: private allowlisted responses include credentialed
  CORS headers, but the current application still uses Bearer tokens. Before
  adopting HttpOnly cookies, add CSRF protection and explicitly review the
  cookie `Secure`, `HttpOnly`, `SameSite`, domain, path, and lifetime settings.
- **Security**: the publishable key is not a service-role secret, but keep
  environment configuration centralized. Never use a Supabase secret or
  service-role key in a browser client.

### 8. `SERVICETITAN_CLIENT_ID` + `SERVICETITAN_CLIENT_SECRET` + `SERVICETITAN_TENANT_ID` (+ optional `SERVICETITAN_BASE_URL`)
- **Purpose**: read-first polling of jobs, customers, appointments, invoices,
  payments, locations, projects, installed equipment, and technicians.
- **Behavior**:
  - All three required vars set -> `webstaffr/integrations/servicetitan/client.py`
    builds a real `ServiceTitanClient`. Missing any one raises
    `ServiceTitanNotConfiguredError` at construction time.
  - `SERVICETITAN_ENABLED=true` also required to mount the
    `POST /integrations/servicetitan/poll` route at all (see `webstaffr/app.py`).
- **Status**: code exists and is tested (`tests/test_servicetitan.py`), but
  wiring this live is explicitly post-MVP per this repo's `CLAUDE.md`.
- **Security**: never commit. Same as above.

### 9. `WEBSTAFFR_DB_PATH` / `DATABASE_URL`
- **Purpose**: `WEBSTAFFR_DB_PATH` sets the local SQLite file path for dev.
  `DATABASE_URL` (Postgres/Supabase) switches the app to the dual-backend
  Postgres path -- see `webstaffr/db.py`.
- **WebStaffr 4.0 status**: this repo is intended to be re-pointed at the
  same Supabase project WS3.3 was using -- see `DEPLOYMENT_CHECKLIST.md`
  for the exact cutover steps, including the two Postgres migrations
  (`postgres_manual/0007_social_media.sql`, `0008_execution_nodes.sql`)
  that must be applied before this repo goes live against it.
- **Security**: never commit. Same as above.

### 10. `KOKORO_TTS_URL` (optional)
- **Purpose**: when set, `POST /v1/audio/speech` proxies OpenAI-compatible
  TTS requests to this external Kokoro backend instead of the route not
  existing at all.
- **Behavior**: unset -> the route is not mounted; no new dependency or
  model hosting required in this repo either way.
- **Security**: never commit if it embeds any credential in the URL.

### 11. `OPENROUTER_API_KEY` + `DESIGN_CRITIQUE_MODEL` (optional, for `OpenRouterDesignCritiqueClient`)
- **Purpose**: on-demand design/UI critique of one rendered tenant site
  page (`scripts/design_critique.py`) -- founder- or session-invoked, not
  part of any automatic path. `site_renderer.py`'s render path and
  `scripts/health_check.py`'s a11y check
  (`webstaffr/site_a11y_check.py`) both stay free and mechanical; this is
  the separate, judgment-based half, which costs real per-call money and
  therefore never runs unattended.
- **How to get**: an OpenRouter account API key (openrouter.ai).
- **Behavior**:
  - `OPENROUTER_API_KEY` set -> `OpenRouterDesignCritiqueClient` is used.
  - Unset -> `NullDesignCritiqueClient` (no network call, returns a plain
    "not configured" message) -- safe default for tests and any
    environment that hasn't opted in.
  - `DESIGN_CRITIQUE_MODEL` optional, defaults to a cheap OpenRouter model
    tier (`meta-llama/llama-3.1-8b-instruct` as of 2026-08-01) -- override
    without a code change if OpenRouter's pricing or lineup shifts.
- **Security**: never commit. Same as above.

### 12. Site Magic worker credentials (NOT YET CONFIGURED, D4 approval gate)
- **Purpose**: the Site Magic autonomous rebuild pipeline
  (`webstaffr/site_magic.py` / `site_magic_router.py`) needs, on the
  worker side only -- never in the NetBuild.Pro Vercel app environment:
  - An `OPENAI_API_KEY` scoped to a dedicated project, for the Codex SDK
    runtime and `gpt-image-*` direction comps. As of this writing no key
    has been created; Platform rejected the request and GPT Image
    organization access is still unapproved.
  - `SUPABASE_URL` + `SITE_MAGIC_STORAGE_SERVICE_KEY` (service-role, NOT
    the publishable key #7 uses) + optional `SITE_MAGIC_STORAGE_BUCKET`
    (defaults `site-magic-builds`) -- Supabase Storage private bucket for
    immutable build artifacts. Real adapter:
    `webstaffr.site_magic_adapters.SupabaseArtifactStorage`.
  - `SITE_MAGIC_WORKER_WEBHOOK_URL` + `SITE_MAGIC_WORKER_WEBHOOK_SECRET`
    -- hand-off to the existing SMMM/Celery worker infrastructure the Site
    Magic engine actually runs on (never inside Vercel). This repo has no
    visibility into that service's real API, so the adapter defines only
    OUR side of a generic authenticated-webhook contract (POST
    `{job_id, tenant_id}`, `X-Site-Magic-Secret` header) rather than
    guessing SMMM's internals -- whoever owns that service registers a
    listener at the URL. Real adapter:
    `webstaffr.site_magic_adapters.HTTPWebhookSiteMagicQueue`.
  - `SITE_MAGIC_API_BASE_URL` + `SITE_MAGIC_INTERNAL_API_KEY` (worker-side
    env vars) -- the worker's own callback credentials, pointed the other
    direction: the Node engine (`SiteMakerEngine` in
    `site_maker_engine.ts`) reports every state-machine transition back to
    this app's internal API via `HTTPJobStateSink`
    (`webstaffr/site_magic_adapters.ts`), authenticated the same
    `X-API-Key` way as Rita/Leo/Sam's internal routers
    (`webstaffr/workers/angel/api_auth.py`'s `SharedSecretVerifier`).
    `SITE_MAGIC_INTERNAL_API_KEY` is a separate env var name from the
    server's `INTERNAL_API_KEY` (#6 above) because they live in different
    processes/environments (worker vs app) -- but its VALUE must be set to
    the same secret as the app's `INTERNAL_API_KEY`, since that's what
    `internal_api_verifier_from_env()` checks incoming `X-API-Key` headers
    against. Two env var names, one shared secret.
- **Behavior**: `create_app()`'s `site_magic_queue` / `site_magic_artifact_storage`
  params default to `NullSiteMagicQueue` / `NullArtifactStorage`, which
  fail closed with `SiteMagicNotConfiguredError` (503 at the API, silently
  skipped at intake auto-enqueue) -- safe default until these are wired.
- **Security**: never commit. Worker gets only these scoped credentials,
  not full production secrets -- see `docs/STANDUP_2026-08-09_IMPECCABLE_PHASE_1.md`
  for current status.

## Local Development Setup

```bash
# 1. Create .env in the repo root (already gitignored -- see .gitignore)
cat > .env << 'EOF'
GROK_API_KEY=your_xai_key_here
GHL_API_KEY=your_ghl_key_here
GHL_LOCATION_ID=your_location_id_here
RETELL_WEBHOOK_SECRET=your_retell_webhook_signing_secret_here
GHL_WEBHOOK_SECRET=choose_your_own_shared_secret_here
BOOK_API_KEY=choose_your_own_api_key_here
INTERNAL_API_KEY=choose_a_separate_internal_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key_here
CUSTOMER_ALLOWED_ORIGINS=http://localhost:3000
WEBSTAFFR_DB_PATH=./webstaffr.db
EOF

# 2. Run with real backends
export $(cat .env | xargs)
uvicorn webstaffr.app:app --reload
```

## Testing

- The full test suite always runs, regardless of environment -- nothing
  is conditionally skipped based on whether credentials are set.
- Credential-check tests explicitly clear the relevant env var to verify
  the "not configured" error path.
- Behavior tests pass an explicit fake key to exercise the real logic
  without needing a live account, then mock the actual network call
  rather than hitting a real API. No test in this suite makes a real
  network call.
- Run the full suite: `python -m pytest`
- Run the self-healing health check: `python scripts/health_check.py`

## Production Notes

- Use a real secret manager for deployment (Vercel's Sensitive env vars,
  not a `.env` file) -- `.env` is a local development convenience only.
- Watch logs for `VoiceBackendNotConfiguredError` / `GHLNotConfiguredError`
  (raised at construction if credentials are missing) and for
  `ghl_call_attempt_failed` / `ghl_sync_failed` / `ghl_note_log_failed`
  (logged, not raised, when a configured GHL call still fails after
  retrying).
- `angel_db_connection_failed`, `site_data_db_connection_failed`,
  `intake_db_connection_failed`, `attribution_db_connection_failed` are
  logged with `error_type=<exception class name>` only, never the raw
  exception message -- a Postgres error can embed the connection string
  (host, user). Never widen these log calls to include `str(exc)`.
