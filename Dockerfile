# Site Magic worker -- persistent Node process, not part of the Vercel app.
# Receives HTTPWebhookSiteMagicQueue's webhook, runs SiteMakerEngine end to
# end (Playwright/axe/Lighthouse Evidence Runner + Codex/image-gen build),
# reports transitions back to this app's internal API. See CREDENTIALS.md
# section 12 and TASKS.md for the full contract.

FROM node:22-bookworm-slim

WORKDIR /app

# Playwright's own installer knows the correct apt packages for this base
# image -- more reliable than hand-listing libnss/libatk/etc and letting
# them drift out of sync with the pinned playwright version.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# --include=dev: `impeccable` is listed as a devDependency but is a real
# runtime dependency here -- PlaywrightEvidenceRunner shells out to its
# `detect` CLI (webstaffr/site_magic_evidence_runner.ts).
RUN npm ci --include=dev

RUN npx playwright install --with-deps chromium

COPY webstaffr ./webstaffr

ENV NODE_ENV=production
EXPOSE 8090

CMD ["npm", "run", "start:site-magic-worker"]
