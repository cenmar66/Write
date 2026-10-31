# Architecture

## Decisions (and where they differ from the brief)

| Decision | Why |
|---|---|
| **Lives inside Write.ai at `/inbox`** (modular monolith) | Reuses the existing owner-only Supabase sign-in, AES-GCM token encryption, Vercel deploy, and sits next to The Daily Canvas for the optional task hand-off. Own layout, manifest, `ip_*` tables and `/api/inbox/*` routes keep it separate. |
| **Supabase SQL migrations + row-level security instead of Prisma** | The repo already uses plain SQL migrations. RLS enforces tenant isolation *in the database* for every query made with the user's session, and it's tested against real Postgres (`npm run test:sql`). Prisma would bypass RLS (it connects as a privileged role) and add a second schema source. |
| **Postgres job queue + Vercel Cron instead of Trigger.dev / Inngest** | No external account needed. `ip_jobs` has idempotency keys, `SKIP LOCKED` claiming, leases, exponential backoff and dead-lettering (`ip_claim_jobs`, `ip_finish_job`). `/api/cron/inbox` runs every 10 minutes. Swapping to Inngest later only changes `server/jobs.ts`'s driver. |
| **No shadcn/ui, no Framer Motion** | The codebase doesn't use them; components are small, accessible, plain Tailwind + native `<dialog>`. Animations are CSS (respecting reduced motion). |
| **TanStack Query** | Added (as requested) for server state in the `/inbox` client. |
| **Hand-made SVG charts** | Two chart types; avoids a chart library. |
| **Gmail via REST + `fetch`** | No `googleapis` dependency; the same approach The Daily Canvas uses. |
| **AI through one gateway (`lib/inbox/ai/client.ts`)** | Consent, quotas, model routing, caching and cost accounting in one place; Anthropic via the official SDK, OpenAI via its REST API (configured by env). Every call returns `{ok:false}` instead of throwing, so features fall back to deterministic versions. |
| **In-memory database for local demo + integration tests** | `memory-db.ts` implements the subset of supabase-js InboxPilot uses, mirroring defaults, unique keys and cascades. Lets every API route and the Playwright suite run with no Supabase project. RLS itself is tested in SQL. |
| **Owner-only deployment, multi-tenant data model** | Write.ai only admits `ALLOWED_EMAIL`. Workspaces/memberships/RLS are fully multi-tenant so opening sign-ups later is a configuration + billing step, not a rewrite. |

## Domain boundaries (code map)

```
src/lib/inbox/
  types.ts               shared row/value types
  db.ts, memory-db.ts    request context (session client, service-role client), local in-memory DB
  mail/
    provider.ts          MailProvider interface + capability model
    gmail.ts             Gmail OAuth (incremental scopes), tokens, refresh/revoke, REST calls, backoff
    demo.ts              synthetic demo mailbox (.test domains, never touches the network)
    outlook.ts           Microsoft 365 placeholder: NOT implemented, refuses every call
    parse.ts             MIME/headers → NormalizedMessage, signals, spoofing checks, RFC 5322 builder
  classify.ts            deterministic hybrid classifier + configurable priority weights
  deadlines.ts           explicit vs. mentioned dates (chrono-node, EN/ES), business days
  followups.ts           I owe / they owe / commitments from thread analysis
  rules.ts               rule model, evaluation, precedence, mode gating, dry-run, conflicts, validation
  briefing.ts            grounded briefing builder (+ schedule slots)
  tasks.ts               email → task suggestion with provenance
  analytics.ts           metrics, time-saved estimate with assumptions, CSV
  search.ts              query language + rule-based question interpretation
  safety.ts              prompt-injection detection, fencing, content-level excerpts, output allow-lists
  send-guard.ts          pre-send checks + HMAC confirmation token bound to the exact message
  time.ts                snooze presets, focus windows
  entitlements.ts        plans & feature flags (no prices in code)
  ai/                    models + prices, provider adapters, gateway, simulated provider, features
  server/                workspace access, sync, processing pipeline, briefing runner, jobs, queries
src/app/api/inbox/       route handlers (thin: auth → validate → lib)
src/app/api/cron/inbox/  scheduler entry point (CRON_SECRET)
src/app/inbox/           pages (client-rendered), layout, PWA manifest
src/components/inbox/    UI
supabase/migrations/0011_inboxpilot.sql
```

## Data flow

```
Gmail ──(OAuth, gmail.readonly)──▶ provider adapter ──▶ storeMessages (dedupe by account+provider id)
                                                         │
                       ┌─────────────────────────────────┘
                       ▼
     processNewMessages: sender stats → classify (rules-first; AI only if uncertain AND allowed)
                         → rules (app actions apply; mailbox actions gated by automation mode)
                         → thread analysis (follow-ups, commitments; auto-replies never count)
                       ▼
     ip_messages / ip_classifications / ip_followups / ip_rule_executions  (RLS by workspace)
                       ▼
     UI (TanStack Query) · briefings (deterministic + optional cited AI summary) · assistant (read-only)
```

**Sync.** Initial import: last 30 days, up to 1,000 messages, 100 per page, resumable (`sync_state.pageToken`) within a time budget. Then incremental via `history.list` from the `historyId` captured *before* the import started (no gap). An expired history cursor triggers a full re-import; the unique key makes it duplicate-free. Removed messages are deleted locally.

**Classification precedence.** User corrections (per sender, per workspace) and sender settings → explicit rules → AI (only when confidence < 0.6, allowed, within quota) → deterministic heuristics. AI may never raise time-sensitivity (urgency needs an explicit date found by the rules) nor declare “critical” without hard evidence.

**Automation modes.** Observe: classify + recommend; mailbox untouched. Assisted: mailbox changes become suggestions to approve. Automatic: only rules the user confirmed, only reversible actions (label, archive, mark read), each recorded with an undo. There is no delete action anywhere.

**Sending.** Only `POST /api/inbox/drafts/:id/send` sends, and only with `confirmed: true` plus an HMAC token computed over the exact account, recipients, subject and body the user reviewed. AI, rules, the assistant and voice dictation have no path to it.
