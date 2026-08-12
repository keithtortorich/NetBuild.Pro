#!/usr/bin/env bash
#
# Set the real OpenRouter API key on the Railway worker.
#
# Why this exists: Railway's OPENROUTER_API_KEY was set to the literal
# placeholder string "OPENROUTER_API_KEY", so every codegen call returned
# HTTP 401 and every Site Magic job failed ~4s in with failure_code "Error".
#
# The key is VALIDATED against OpenRouter before anything is written, so a
# mistyped or truncated paste fails here instead of silently killing the next
# job. Nothing is echoed, written to disk, or placed on a command line.

set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

red()  { printf "\033[31m%s\033[0m\n" "$*"; }
grn()  { printf "\033[32m%s\033[0m\n" "$*"; }
ylw()  { printf "\033[33m%s\033[0m\n" "$*"; }
step() { printf "\n\033[1m==> %s\033[0m\n" "$*"; }

trap 'red "FAILED at line $LINENO. Nothing was changed."' ERR

step "Checking Railway"
if ! command -v railway >/dev/null || ! railway variable list >/dev/null 2>&1; then
  red "Railway CLI is not signed in or not linked. Run: railway login"
  exit 1
fi
grn "railway: linked and authenticated"

step "OpenRouter API key"
cat <<'EOF'
Just copy the key in your browser -- this reads it from your clipboard.

  https://openrouter.ai/keys -> Create Key -> copy the value it shows once.

Then run this script. There is nothing to type or paste here.

(If the clipboard does not hold a key, you will get a hidden prompt as a
fallback. That prompt is this terminal window -- never a chat window.)
EOF

# Retries rather than exiting on a bad key. Exiting dropped the user back at
# a shell prompt, where the next paste landed in shell history as a failed
# command instead of into this script -- exposing the key. Staying in the
# read loop means there is never a shell prompt waiting to catch a paste.
OPENROUTER_KEY=""

# Clipboard first. Copying the key in the browser is a step the user has to
# take anyway, so reading it from there removes the paste entirely -- and with
# it every way a key can land in the wrong window or in shell history.
CLIPBOARD=""
if command -v pbpaste >/dev/null; then
  CLIPBOARD="$(pbpaste 2>/dev/null | tr -d '[:space:]')"
fi

attempt=0
while [ ${attempt} -lt 3 ]; do
  attempt=$((attempt + 1))

  CANDIDATE=""
  case "${CLIPBOARD}" in
    sk-or-*)
      grn "Found an OpenRouter key on your clipboard -- using it, nothing to paste."
      CANDIDATE="${CLIPBOARD}"
      CLIPBOARD=""   # only offer it once, so a retry re-prompts
      ;;
  esac

  if [ -z "${CANDIDATE}" ]; then
    printf "OpenRouter key (attempt %d of 3): " "${attempt}"
    read -rs CANDIDATE
    printf "\n"
  fi

  if [ -z "${CANDIDATE}" ]; then
    ylw "Nothing was entered. Copy the key, then paste and press Enter."
    continue
  fi
  case "${CANDIDATE}" in
    sk-or-*) ;;
    *)
      ylw "That does not start with 'sk-or-', so it is not an OpenRouter key."
      ylw "It may have been truncated -- copy the whole value and try again."
      continue
      ;;
  esac

  printf "  validating against OpenRouter... "
  http_code="$(
    curl -s -o "/tmp/.or_check.$$" -w '%{http_code}' \
      https://openrouter.ai/api/v1/chat/completions \
      -H "Authorization: Bearer ${CANDIDATE}" \
      -H "Content-Type: application/json" \
      -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"reply with the single word ok"}]}' \
      --max-time 60 || true
  )"
  if [ "${http_code}" = "200" ]; then
    rm -f "/tmp/.or_check.$$"
    grn "accepted (HTTP 200)."
    OPENROUTER_KEY="${CANDIDATE}"
    break
  fi

  printf "\n"
  red "  OpenRouter rejected it (HTTP ${http_code})."
  head -c 200 "/tmp/.or_check.$$" 2>/dev/null || true
  printf "\n"
  rm -f "/tmp/.or_check.$$"
  case "${http_code}" in
    401) ylw "  401 = wrong, revoked, or partially-copied key. Create a fresh one." ;;
    402) ylw "  402 = the OpenRouter account has no credit. Add credit, then retry." ;;
    *)   ylw "  Check the key and your connection, then retry." ;;
  esac
done

if [ -z "${OPENROUTER_KEY}" ]; then
  red "No valid key after 3 attempts. Nothing was changed."
  ylw "Re-run this script when you have a freshly created key on your clipboard."
  exit 1
fi

step "Setting it on the Railway worker"
printf '%s' "${OPENROUTER_KEY}" \
  | railway variable set OPENROUTER_API_KEY --stdin >/dev/null
grn "Railway: OPENROUTER_API_KEY set. The worker will redeploy automatically."

step "Done"
cat <<'EOF'
Wait for the Railway worker to finish redeploying (about a minute), then the
next intake should get past `ingesting` for the first time.
EOF
