# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

Bun monorepo with three workspaces:
- `apps/web` — React + Vite frontend (TypeScript, Tailwind CSS v4)
- `workers/api` — Cloudflare Worker (TypeScript, D1 SQLite, R2)
- `packages/` — shared packages (currently empty)

## Commands

### Frontend (`apps/web`)
```bash
bun run dev        # Vite dev server → http://localhost:5173 (or 5174 if port taken)
bun run build      # tsc + vite build
bun run lint       # eslint
```

### Worker (`workers/api`)
```bash
bunx wrangler dev              # local Worker → http://localhost:8787 (or 8788)
bunx wrangler deploy           # deploy to production
bunx wrangler deploy --dry-run # build check without deploying
bunx wrangler secret put KEY   # upload a secret (pipe value via stdin)
```

### DB migrations (D1)
```bash
# Apply to local:
bunx wrangler d1 execute sonabrief-db --local --file=migrations/XXXX_name.sql
# Apply to remote:
bunx wrangler d1 execute sonabrief-db --remote --file=migrations/XXXX_name.sql
# Ad-hoc query:
bunx wrangler d1 execute sonabrief-db --local --command="SELECT ..."
```

### From repo root
```bash
bun run dev:web     # alias for apps/web dev
bun run dev:worker  # alias for workers/api dev
```

## Architecture

### Privacy model
Sonabrief's core promise: audio never leaves the user's device. Local transcription runs in-browser via `@huggingface/transformers` (Whisper model, Web Worker). Only the text transcript is ever sent to the cloud for synthesis — and only if the user chooses cloud mode.

### Sync encryption
End-to-end encrypted sync via libsodium. Key derived from a 12-word BIP39 recovery phrase in `apps/web/src/lib/keystore.ts`. The Worker stores only opaque encrypted blobs in R2. The in-memory key (`currentKey`) is held in `keystore.ts` and zeroed on logout.

### Frontend (`apps/web/src/`)
- **State**: all meeting data is stored in IndexedDB via Dexie (`lib/db.ts`). Three tables in v1, `action_items` added in v2, `embeddings` in v3.
- **Workers**: two Web Workers — `workers/whisper.worker.ts` (Whisper transcription) and `workers/embeddings.worker.ts` (MiniLM-L6-v2 for semantic search). Both wrapped by singleton service classes (`lib/whisper.ts`, `lib/embeddings.ts`).
- **Synthesis**: `RecordingPage.tsx` handles the full recording → transcription → synthesis flow. Cloud synthesis hits `POST /v1/synthesize` (SSE streaming). Local mode uses Ollama.
- **Templates**: user-selectable system prompts. 7 Italian system templates seeded in `0014_templates_seed_it.sql`. Fetched from `GET /v1/templates`.
- **Auth**: magic link via `/auth/request` → `/auth/verify`. Session stored in `sessionStorage`.
- **API client**: `lib/api.ts`. Base URL: `localhost:8787` in dev, `sonabrief-api.sonabrief-app.workers.dev` in prod (`config.ts`).
- **Key pages**: `RecordingPage` (main flow), `ArchivePage`, `ActionItemsPage`, `CalendarPage`, `SearchPage` (semantic), `DashboardPage`, `OnboardingPage` (5-step wizard on first login).

### Worker (`workers/api/src/`)
- **Router**: flat if/else chain in `index.ts`. All responses wrapped with `withCors()`.
- **Auth**: cookie-based sessions (`lib/sessions.ts`). All protected routes call `getUserFromSession()`.
- **LLM routing** (`providers/`): `types.ts` defines `TIER_ROUTING` (all tiers → Mistral). `index.ts` exports `synthesizeWithRouting()`. Pricing constants live in `mistral.ts`. `consumeOpenAIStream()` handles SSE parsing.
- **Synthesis personalization**: `buildSystemPrompt()` in `synthesize.ts` prepends professional context from `user_preferences` to the template prompt.
- **Billing**: Polar is the primary MoR (`routes/checkout-polar.ts`, `routes/webhooks-polar.ts`). LemonSqueezy kept as backup (all LS env vars are optional). Webhook idempotency via `webhook_events` table.
- **Anti-abuse**: `quota.ts` enforces per-user monthly minutes, global budget cap ($30), IP throttling, disposable email blocking, fingerprint collision detection.
- **CORS**: `lib/cors.ts` — hardcoded allowlist: `sonabrief.com`, `localhost:5173`, `localhost:1420`.

### D1 schema (key tables)
`users`, `sessions`, `licenses` (tier/status), `quota` (monthly minutes), `templates`, `user_preferences`, `synthesis_log`, `webhook_events`, `oauth_tokens`, `sync_blobs`.

## Critical constraints

- **`APP_URL` must NOT be in `Env`** — was removed to fix a CORS bug. `getAppUrl()` and `getRedirectUri()` in `calendar.ts` derive URLs from the `Host` request header.
- **`.dev.vars` is gitignored** — never commit it. All secrets go there locally or via `wrangler secret put` for production.
- **SQL apostrophes in migrations**: use `''` (double single quote) to escape apostrophes in SQLite string literals. Example: `l''esito`.
- **`template_id` is not a UUID** — system template IDs are strings like `sys_generic_it_v2`. Use `z.string()` not `z.string().uuid()` in Zod schemas.
- **Dexie version upgrades**: always keep all previous `.version().stores()` definitions intact when adding a new version.
- **Avoid `sed` for file edits** — `sed -i` with double quotes in patterns has corrupted files in this repo. Use the Edit tool directly.
