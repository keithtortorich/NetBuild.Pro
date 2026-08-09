# Impeccable Cheat Sheet

> **INCORRECT -- do not use.** Every command below except `npx impeccable
> install` is fabricated; the real CLI only supports `detect`, `ignores`,
> `install`, `link`, `update`, `check`. The 23 design commands (`polish`,
> `critique`, `audit`, etc.) are agent workflows invoked through the skill
> (`/impeccable <command>`), not `npx impeccable <command>` shell calls.
> Kept for historical reference only.

## Quick Reference

### 23 Commands

| Command | Purpose |
|---|---|
| `npx impeccable install` | Bootstrap Impeccable into the project |
| `npx impeccable init` | Initialize configuration and scaffolding |
| `npx impeccable plan` | Generate implementation plan from specs |
| `npx impeccable validate` | Run validation checks against quality gates |
| `npx impeccable lint` | Lint generated code and templates |
| `npx impeccable test` | Execute test suite |
| `npx impeccable build` | Build target artifacts |
| `npx impeccable preview` | Preview generated output locally |
| `npx impeccable deploy` | Deploy approved artifacts |
| `npx impeccable doctor` | Diagnose project health |
| `npx impeccable status` | Show current phase and gate status |
| `npx impeccable diff` | Show current artifact diff |
| `npx impeccable approve` | Promote artifact to next stage |
| `npx impeccable rollback` | Roll back last approved change |
| `npx impeccable log` | Show execution log |
| `npx impeccable metrics` | Show quality metrics |
| `npx impeccable export` | Export artifacts |
| `npx impeccable sync` | Sync config and state |
| `npx impeccable watch` | Watch for changes and re-run pipeline |
| `npx impeccable clean` | Clean build artifacts and cache |
| `npx impeccable cache` | Manage artifact cache |
| `npx impeccable version` | Show Impeccable version |
| `npx impeccable help` | Show help |

## Routing Matrix

| Input Stage | Target Stage | Trigger |
|---|---|---|
| Intake | Site Magic | Valid intake payload |
| Site Magic | Preview | Render success |
| Preview | Approval | Human review requested |
| Approval | Deploy | Gate passed |
| Deploy | Observe | Live traffic |
| Observe | Refine | Metrics threshold crossed |

## File Structure

```
outputs/
  impeccable-bootstrap.md
  IMPECCABLE_CHEAT_SHEET.md
docs/
  SITE_MAGIC_ARCHITECTURE.md
  IMPECCABLE_MAGIC_UPGRADE.md
  IMPECCABLE_IMPLEMENTATION.md
webstaffr/
  site_schema.py
  site_render_router.py
  site_data.py
  templates/site/
    home.html
    service.html
    about.html
    contact.html
workers/angel/
  router.py
  stripe_webhook.py
```

## Notes

- Keep dry-run before any deploy.
- Use local venv; `pytest` may need explicit install.
- Safari cache can hide template changes; rename file if preview looks stale.
