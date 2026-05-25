# WebForge

A Telegram-First full-stack PaaS that autonomously builds, hosts, and monetizes apps entirely through chat.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, includes Telegram bots)
- `pnpm --filter @workspace/webforge-ui run dev` — run the workspace UI (port 23726)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CORE_BOT_TOKEN`, `PAYMENT_BOT_TOKEN`, `AI_GATEWAY_KEY`, `ENCRYPTION_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Server-Sent Events
- DB: PostgreSQL + Drizzle ORM
- AI: OpenAI SDK → custom gateway (aimodelapi.onrender.com)
- Bots: node-telegram-bot-api (dual polling)
- Image editing: sharp
- Proxy: http-proxy-middleware
- Frontend: React + Vite + Tailwind + shadcn/ui + Framer Motion
- Validation: Zod, drizzle-zod
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — DB schema (users, projects, payments, telemetry)
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `artifacts/api-server/src/bots/` — coreBot.ts, paymentBot.ts
- `artifacts/api-server/src/ai/router.ts` — multi-model task router
- `artifacts/api-server/src/engines/orchestrator.ts` — Ruflo/OpenClaw layer
- `artifacts/api-server/src/utils/` — billing.ts, telemetry.ts, crypto.ts
- `artifacts/api-server/src/routes/` — workspace.ts, stream.ts, proxy.ts, projects.ts
- `artifacts/webforge-ui/src/` — React frontend workspace dashboard
- `user-projects/` — sandboxed project directories created at runtime

## Architecture decisions

- Dual Telegram bots run as concurrent pollers from the same Express process to avoid port conflicts
- AI routing is intent-based: the backend classifies task type and picks the optimal model automatically — users never choose
- API keys are AES-256-CBC encrypted before storing in the DB; raw keys are immediately scrubbed from Telegram chat via deleteMessage
- SSE streams file diffs live to the workspace UI; fs.watch triggers hot-reload pings
- Per-project sandbox proxy uses http-proxy-middleware with dynamic port lookup from DB
- Telemetry tracks cost per model via input/output token counts × per-model $/M rates

## Product

- **Core Bot** (@WebForgeBot) — conversational PaaS: describe a project → get a plan → open workspace
- **Payment Bot** — OPay invoice generation, receipt upload, admin inline approval keyboards  
- **Workspace UI** — split-pane: streaming code canvas (SSE) + live app sandbox (iframe proxy)
- **Tiers**: Starter (₦0/10 actions/day), Pro (₦5,000/150 actions), Elite (₦15,000/500 actions + DeepBuild)
- **Bot-as-a-Service** — scaffold + spawn persistent PM2-style bot daemons for user tokens
- **Persona injection** — dynamic persona.json in each project; live-editable via chat

## User preferences

- Production-ready TypeScript only — no placeholders
- Dual-bot architecture is intentional (billing separation from UX)
- Admin Group ID for payment approvals is in ADMIN_GROUP_ID env var

## Gotchas

- Rebuild the api-server after code changes: `pnpm --filter @workspace/api-server run build`
- The Telegram bot tokens are in env vars — never hardcode in commits
- sharp is externalized from esbuild bundle (native bindings)
- After OpenAPI spec changes, always re-run codegen before touching frontend

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- AI gateway: https://aimodelapi.onrender.com/v1 (OpenAI SDK compatible)
- Workspace viewport: GET /workspace/:projectId (server-rendered HTML, not React)
- SSE stream: GET /api/projects/:projectId/stream
- Sandbox proxy: GET /api/preview-proxy/:projectId/
