---
name: nbp-analyze
description: Analyze NetBuild.Pro's actual current repository state, tasks, blockers, tests, health checks, git divergence, Site Magic integration, hosting, and deployment readiness before work begins or status is reported. Use at the start of work in keithtortorich/NetBuild.Pro, before accepting delegated NetBuild.Pro tasks, when asked for project or release status, or when a checkout may point to an archived or stale WebStaffr folder. Never substitute prior standups or stale status documents for current verification.
---

# NetBuild.Pro Analysis

Produce a concise, evidence-backed report from the canonical checkout. Treat prior standups, status files, test counts, hosting claims, and skill metadata as leads until verified.

## 1. Confirm the canonical checkout

Start with:

```bash
pwd
git remote -v
git status --short --branch
git status --short
```

- Prefer `/Users/doc/Desktop/NetBuild.Pro` when it exists and resolves to `keithtortorich/NetBuild.Pro`.
- Proceed only when the remote resolves to `keithtortorich/NetBuild.Pro` and `webstaffr/app.py` exists.
- If the active folder points to `WebStaffr4.0`, `WS3.3`, an old `NB.P` checkout, or another remote, stop and flag it. Do not modify or report an archive as current.
- Preserve unrelated changes. Never use destructive git commands during analysis.

## 2. Load sources by authority and recency

Read in this order:

1. `AGENTS.md` for the Engineering Director depth ladder and approval gates.
2. `CLAUDE.md` for purpose, invariants, security, and git mechanics.
3. `TASKS.md` for live work, while checking its dates and implementation claims against code.
4. `docs/DECISIONS.md` for current ADRs, especially product and plan decisions.
5. `docs/business/WEBSTAFFR_GOVERNANCE.md` and `docs/business/NETBUILD_REFERENCE.md` for current brand, product, pricing, and stack facts.
6. Both `DEPLOYMENT_CHECKLIST.md` and `docs/DEPLOYMENT_CHECKLIST.md` when release or production readiness is in scope.
7. The newest relevant audit, session summary, or implementation document under `docs/` when newer than the root status files.
8. `CREDENTIALS.md` only for variable names and intended integration states. Never print values.

When sources conflict, prefer the newest founder-approved ADR or canonical business reference, then current code and current-SHA evidence. Report material contradictions instead of silently choosing a stale source.

Do not restore `NETBUILD_REFERENCE.md` to the repository root merely because a backup contains that filename. First check `docs/business/NETBUILD_REFERENCE.md`; that is the canonical in-repo location unless a newer decision says otherwise.

## 3. Establish live git truth

When network access is authorized, run `git fetch origin` at session start. Collect:

```bash
git log -1 --oneline --decorate
git rev-parse HEAD
git rev-parse origin/main
git ls-remote origin refs/heads/main
git diff --stat
```

Distinguish committed divergence, staged work, unstaged work, untracked files, and live remote state. Never stage, commit, push, rewrite history, or deploy during analysis. Push and deploy always require explicit founder approval.

## 4. Verify implementation claims

Inspect relevant code before reporting a feature complete.

- For Site Magic, verify `webstaffr/site_magic_engine.py`, its call from `webstaffr/intake_router.py`, the renderer path, persistence/output behavior, and focused tests. Separate "wired into intake and renderer" from production-hosting or custom-domain claims.
- For plan decisions, compare the newest ADR and `docs/business/NETBUILD_REFERENCE.md` with `webstaffr/intake.py`, templates, health checks, tests, database docs, and migrations. Current code accepting `office_staff` does not make legacy `essentials`, `pro`, or `growth` fixtures valid.
- For hosting, distinguish the registrar or DNS provider from the runtime host. Verify Spaceship domain/DNS claims separately from the Vercel deployment and exact served commit.
- For customer-facing claims, reject fabricated facts, reviews, prices, credentials, availability, or unsupported performance statistics.

## 5. Run current validation

Use the canonical checkout's existing environment:

```bash
.venv/bin/python -m pytest
.venv/bin/python scripts/health_check.py
```

- Run the full suite after code, routes, migrations, configuration, scripts, or tests change.
- For documentation- or skill-only changes, run the skill validator and label application tests `[Unverified this session]` unless the user requests a full rerun.
- Report exact pass, fail, skip, warning, and health counts from this session. Historical counts are never current evidence.
- If failures cascade from a shared fixture or plan slug, identify the root cause but preserve additional independent failures such as landing-page or ServiceTitan assertions.
- Do not install dependencies or alter credentials without authorization.

## 6. Assess deployment and blockers

Classify blockers as technical, external service, founder decision, production/credential gate, or stale documentation.

Reconcile both deployment checklists, the newest production-readiness evidence, current git SHA, CI, migrations, preview checks, and production smoke tests. A live website does not imply the full repository is release-ready, and a passing local suite does not prove production integrations.

Check high-risk invariants:

- every query is tenant-scoped;
- every SQLite migration has a Postgres counterpart where required;
- browser CORS is limited to intended routes;
- integrations use `Protocol`, `Null*`, and `*NotConfiguredError` patterns;
- public site data does not leak internal fields;
- Vercel code assumes no persistent process;
- Site Magic output and customer copy use only supported facts.

## 7. Report at founder altitude

Lead with the verified outcome and one recommended next action.

```markdown
# NetBuild.Pro Status Report - YYYY-MM-DD

## Repository
- Repo, checkout, branch, SHA, origin relationship, worktree state

## Product and hosting
- Live site, registrar/DNS, runtime host, Site Magic state

## Validation
- Tests and health from this session, or clearly marked unverified

## Blockers
- Classification, root cause, and consequence

## Recommended next action
1. Single highest-value action
```

Keep D0-D1 reports short. Ask only at an actual D3-D4 gate. Do not offer menus of equivalent engineering choices.
