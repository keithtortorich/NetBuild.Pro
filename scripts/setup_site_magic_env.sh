#!/usr/bin/env bash
#
# One-shot Site Magic production configuration.
#
# What you do: run it, and paste the Supabase service_role key once at a
# hidden prompt. Nothing else.
#
# What it does:
#   1. Generates a fresh shared webhook secret and sets the SAME value on
#      both Vercel and Railway. Nothing to reveal or copy between dashboards.
#      Rotating this is safe -- the app and the worker are its only consumers.
#   2. Sets SUPABASE_URL on Railway (public value, not a secret).
#   3. Sets SITE_MAGIC_STORAGE_SERVICE_KEY on both sides from the one prompt.
#   4. Redeploys Vercel production so the new env is actually picked up
#      (Vercel does NOT apply env changes to existing deployments).
#   5. Reports whether Vercel's INTERNAL_API_KEY and Railway's
#      SITE_MAGIC_INTERNAL_API_KEY are both present -- their values cannot be
#      read back from either provider, so equality is still yours to confirm.
#
# No secret is ever echoed, written to a file, or placed on a command line
# where it would land in shell history: values reach the CLIs over stdin.
#
# Safe to re-run. Existing vars are replaced.

set -euo pipefail

# Both the Vercel and Railway CLIs resolve their project link from the working
# directory. Run from anywhere else -- a home directory, say -- and `vercel env
# add` stops on an interactive "set up this project?" prompt instead of doing
# anything. Anchor to the repo so it does not matter where this is launched.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SUPABASE_PROJECT_REF="ntbnenymyqiautaqhyhe"
SUPABASE_PROJECT_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"

# Not secrets -- these appear in the Railway dashboard URL. Hardcoded so the
# script can link without an interactive picker.
RAILWAY_PROJECT_ID="c3dbdfb7-1369-4337-add3-dd604bb2d135"
RAILWAY_SERVICE_ID="80dcfe56-b6da-498c-9c89-e507cba46d04"
RAILWAY_ENVIRONMENT_ID="04820d1a-c613-46aa-a95b-532d53253b92"

red()  { printf "\033[31m%s\033[0m\n" "$*"; }
grn()  { printf "\033[32m%s\033[0m\n" "$*"; }
ylw()  { printf "\033[33m%s\033[0m\n" "$*"; }
step() { printf "\n\033[1m==> %s\033[0m\n" "$*"; }

trap 'red "FAILED at line $LINENO. Nothing further was changed."' ERR

# ---------------------------------------------------------------- preflight

step "Checking tools"

if ! command -v vercel >/dev/null; then
  red "vercel CLI not found. Install with: npm i -g vercel"
  exit 1
fi
if ! vercel whoami >/dev/null 2>&1; then
  red "vercel CLI is not logged in. Run: vercel login"
  exit 1
fi
grn "vercel: $(vercel whoami 2>/dev/null | tail -1)"

HAVE_RAILWAY=0
if ! command -v railway >/dev/null; then
  ylw "railway CLI not found.  Install:  npm i -g @railway/cli"
elif ! railway whoami >/dev/null 2>&1; then
  ylw "railway CLI is not signed in.  Run:  railway login"
  ylw "  (opens a browser and captures the session -- no token to paste)"
else
  # Link non-interactively when needed. These IDs are not secrets -- they are
  # visible in the Railway dashboard URL -- so hardcoding them here saves an
  # arrow-key picker step.
  if ! railway variable list >/dev/null 2>&1; then
    railway link \
      --project "${RAILWAY_PROJECT_ID}" \
      --service "${RAILWAY_SERVICE_ID}" \
      --environment "${RAILWAY_ENVIRONMENT_ID}" >/dev/null 2>&1 || true
  fi
  if railway variable list >/dev/null 2>&1; then
    HAVE_RAILWAY=1
    grn "railway: linked and authenticated"
  else
    ylw "railway CLI is signed in but could not link to the NetBuild.Pro service."
    ylw "  Run:  railway link      (choose melodious-elegance -> NetBuild.Pro)"
  fi
fi

if [ "${HAVE_RAILWAY}" -eq 0 ]; then
  ylw "Continuing anyway -- Vercel will be fully configured, and the three"
  ylw "Railway values will be printed at the end for you to enter by hand."
fi

# ------------------------------------------------------------------- inputs

step "Supabase secret key"

SERVICE_ROLE_KEY=""

# Preferred path: let the Supabase CLI hand us the key directly. Nothing is
# displayed, nothing is copied, nothing can end up in the wrong window.
if command -v supabase >/dev/null && supabase projects list >/dev/null 2>&1; then
  echo "Fetching the secret key from Supabase via the CLI."
  SERVICE_ROLE_KEY="$(
    supabase projects api-keys \
      --project-ref "${SUPABASE_PROJECT_REF}" --reveal --output json 2>/dev/null \
      | jq -r '
          # Prefer a new-format secret key (type "secret", sb_secret_...).
          # Fall back to the legacy service_role JWT only if none exists --
          # Supabase is deprecating those, and a project that has rotated to
          # the new format should not silently keep using the old one.
          ([.[] | select(.type == "secret")      | .api_key] | first)
          // ([.[] | select(.name == "service_role") | .api_key] | first)
          // empty'
  )"
  if [ -n "${SERVICE_ROLE_KEY}" ]; then
    grn "Retrieved automatically -- you never had to see or paste it."
  else
    ylw "The CLI did not return a secret key for this project."
  fi
fi

if [ -z "${SERVICE_ROLE_KEY}" ]; then
  cat <<'EOF'

Falling back to manual entry.

  Best fix: run `supabase login` (a browser opens, you click Authorize --
  nothing to copy), then re-run this script and it fetches the key itself.

  Otherwise: Supabase dashboard -> Project Settings -> API Keys -> the
  `secret` key -> Reveal -> copy.

IMPORTANT: paste it HERE, in this black terminal window -- never into a chat
window. Nothing will appear as you type. That is deliberate, not a freeze.
Press Enter when done.
EOF
  printf "secret key: "
  read -rs SERVICE_ROLE_KEY
  printf "\n"
fi

if [ -z "${SERVICE_ROLE_KEY}" ]; then
  red "No key provided. Nothing was changed."
  exit 1
fi
case "${SERVICE_ROLE_KEY}" in
  eyJ*|sb_secret_*) ;;
  *)
    red "That does not look like a Supabase service_role key."
    red "Expected a JWT starting 'eyJ' or a key starting 'sb_secret_'."
    red "Nothing was changed."
    exit 1
    ;;
esac
grn "Key accepted (${#SERVICE_ROLE_KEY} characters)."

WEBHOOK_SECRET="$(openssl rand -hex 32)"
grn "Generated a fresh 256-bit shared webhook secret."

# ------------------------------------------------------------------- vercel

set_vercel() {
  local name="$1" value="$2"
  # --force overwrites in place. Removing first would leave a window where
  # production has no value at all, and --value would put the secret in argv
  # where `ps` can read it; stdin avoids both.
  # --non-interactive so a missing project link fails loudly instead of
  # hanging on a prompt nobody can see. stderr is deliberately NOT swallowed.
  if ! printf '%s' "${value}" \
      | vercel env add "${name}" production --sensitive --force --yes --non-interactive >/dev/null; then
    red "  Vercel rejected ${name}. Nothing further was changed."
    exit 1
  fi
  grn "  Vercel production: ${name} set"
}

step "Setting Vercel production variables"
set_vercel SITE_MAGIC_WORKER_WEBHOOK_SECRET "${WEBHOOK_SECRET}"
set_vercel SITE_MAGIC_STORAGE_SERVICE_KEY   "${SERVICE_ROLE_KEY}"

# ------------------------------------------------------------------ railway

if [ "${HAVE_RAILWAY}" -eq 1 ]; then
  step "Setting Railway variables"
  # --stdin, not --set "KEY=value": the latter puts the secret in argv, where
  # any other process on this machine can read it out of `ps`. Deploys are
  # skipped per-variable so the worker restarts once, at the end, with a
  # complete set rather than three times through partial states.
  set_railway() {
    local name="$1" value="$2" extra="${3:-}"
    printf '%s' "${value}" \
      | railway variable set "${name}" --stdin ${extra:+"${extra}"} >/dev/null
    grn "  Railway: ${name} set"
  }
  set_railway SUPABASE_URL                     "${SUPABASE_PROJECT_URL}"       --skip-deploys
  set_railway SITE_MAGIC_STORAGE_SERVICE_KEY   "${SERVICE_ROLE_KEY}"           --skip-deploys
  set_railway SITE_MAGIC_WORKER_WEBHOOK_SECRET "${WEBHOOK_SECRET}"
  grn "  Railway will redeploy the worker once, with all three applied."
else
  step "Railway values (CLI unavailable -- enter these by hand)"
  echo "Railway -> NetBuild.Pro -> Variables -> New Variable:"
  echo
  echo "  SUPABASE_URL"
  echo "    ${SUPABASE_PROJECT_URL}"
  echo
  echo "  SITE_MAGIC_STORAGE_SERVICE_KEY"
  echo "    (the same service_role key you just pasted)"
  echo
  echo "  SITE_MAGIC_WORKER_WEBHOOK_SECRET  <- REPLACE the existing value"
  echo "    ${WEBHOOK_SECRET}"
  echo
  ylw "The webhook secret above must match Vercel exactly or every hand-off 401s."
fi

# ----------------------------------------------------------------- redeploy

step "Redeploying Vercel production"
echo "Env changes do not apply to existing deployments."
vercel redeploy --prod --yes >/dev/null 2>&1 \
  || vercel deploy --prod --yes >/dev/null 2>&1
grn "Production redeployed."

# ------------------------------------------------------------------- checks

step "Post-check"

health="$(curl -fsS https://netbuild.pro/health --max-time 30 || true)"
if [ -n "${health}" ]; then
  grn "netbuild.pro/health: ${health}"
else
  red "netbuild.pro/health did not respond."
fi

worker_status="$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST https://netbuildpro-production.up.railway.app/ \
  -H 'Content-Type: application/json' \
  -H 'X-Site-Magic-Secret: deliberately-wrong' \
  -d '{"job_id":"probe","tenant_id":"probe"}' --max-time 30 || true)"
if [ "${worker_status}" = "401" ]; then
  grn "Railway worker: up, rejects a bad secret (401)."
else
  red "Railway worker returned ${worker_status} (expected 401). Check its deploy."
fi

if vercel env ls production 2>/dev/null | grep -q 'INTERNAL_API_KEY'; then
  grn "Vercel INTERNAL_API_KEY: present."
  ylw "Still yours to confirm: it must EQUAL Railway's SITE_MAGIC_INTERNAL_API_KEY."
  ylw "Neither provider can read a Sensitive value back, so this cannot be"
  ylw "checked automatically. If they differ, every job 401s at job-fetch."
else
  red "Vercel INTERNAL_API_KEY is missing -- the worker cannot fetch job records."
fi

step "Done"
cat <<'EOF'
Next: submit one real intake at netbuild.pro and watch site_magic_jobs. A job
that leaves `queued` means the hand-off works. Reaching `ready_for_review`
means codegen works -- which has never run, so that is the real first test.
EOF
