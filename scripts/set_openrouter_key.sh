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
Get it from https://openrouter.ai/keys -- copy an existing key, or create one.
It looks like: sk-or-v1-<long string>

IMPORTANT: paste it HERE, in this black terminal window. Never into a chat
window. Nothing will appear as you type -- that is deliberate, not a freeze.
Press Enter when done.
EOF
printf "OpenRouter key: "
read -rs OPENROUTER_KEY
printf "\n"

if [ -z "${OPENROUTER_KEY}" ]; then
  red "Empty input. Nothing was changed."
  exit 1
fi
case "${OPENROUTER_KEY}" in
  sk-or-*) ;;
  *)
    red "That does not look like an OpenRouter key (expected it to start 'sk-or-')."
    red "Nothing was changed."
    exit 1
    ;;
esac

step "Validating against OpenRouter before writing anything"
http_code="$(
  curl -s -o /tmp/.or_check.$$ -w '%{http_code}' \
    https://openrouter.ai/api/v1/chat/completions \
    -H "Authorization: Bearer ${OPENROUTER_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"reply with the single word ok"}]}' \
    --max-time 60 || true
)"
if [ "${http_code}" != "200" ]; then
  red "OpenRouter rejected this key (HTTP ${http_code}). Nothing was changed."
  ylw "Response:"
  head -c 300 "/tmp/.or_check.$$" 2>/dev/null || true
  printf "\n"
  rm -f "/tmp/.or_check.$$"
  ylw "HTTP 401 = wrong or revoked key. HTTP 402 = no credit on the account."
  exit 1
fi
rm -f "/tmp/.or_check.$$"
grn "OpenRouter accepted the key (HTTP 200)."

step "Setting it on the Railway worker"
printf '%s' "${OPENROUTER_KEY}" \
  | railway variable set OPENROUTER_API_KEY --stdin >/dev/null
grn "Railway: OPENROUTER_API_KEY set. The worker will redeploy automatically."

step "Done"
cat <<'EOF'
Wait for the Railway worker to finish redeploying (about a minute), then the
next intake should get past `ingesting` for the first time.
EOF
