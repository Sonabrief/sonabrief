---
name: project-design-system
description: Sonabrief design system context — tokens, fonts, PRODUCT.md and DESIGN.md status
metadata:
  type: project
---

PRODUCT.md and DESIGN.md are written at the repo root and are live in impeccable context.

**Why:** User is using the `impeccable` skill for frontend design work on Sonabrief. These files are required context for all impeccable commands.

**How to apply:** Before any impeccable design work, run `node apps/web/.agents/skills/impeccable/scripts/load-context.mjs` to confirm context is loaded. Do not re-run if already loaded this session.

## Token system (as of 2026-05-20)

- `--primary`: Deep Teal `#1A4D52` / `oklch(0.316 0.053 194)`
- `--accent`: Amber `#C89868` / `oklch(0.672 0.083 62)`
- `--background`: Cream `#FAF7F0` / `oklch(0.978 0.010 88)`
- `--foreground`: Charcoal `#1A1A1F` / `oklch(0.137 0.007 280)`
- `--card` / Surface: `#FDFCF9` / `oklch(0.990 0.005 88)`
- `--border`: `#E2DDD4` / `oklch(0.900 0.008 88)`
- `--muted-foreground`: `#6B7A7B` / `oklch(0.520 0.010 194)`

Fonts:
- `--font-heading`: Instrument Serif, Georgia, serif (NOTE: not yet installed via fontsource — only fallback Georgia will render until `@fontsource/instrument-serif` is added)
- `--font-sans`: Manrope Variable (installed via `@fontsource-variable/manrope`)
- Inter was removed from `index.css`

Sidecar: `.impeccable/design.json` written with 8-step tonal ramps, motion tokens, shadow tokens, and 8 component snippets.

Register: **product** (app UI — design serves the product, not the other way around).

[[project-dashboard-audit]]
