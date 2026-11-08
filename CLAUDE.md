# Project instructions

@AGENTS.md

Write.ai is a single Next.js 16 app (App Router, TypeScript strict, Tailwind v4, Supabase) with four products:
Write.ai (`/`), The Daily Canvas (`/canvas`, docs/canvas), PromptSatori (`/satori`, promptsatori.com, docs/satori) and InboxSatori (`/inbox`, inboxsatori.com, docs/inbox).

## Conventions
- Database: plain SQL migrations in `supabase/migrations/` (numbered, re-runnable, never destructive), mirrored into `supabase/setup-all.sql`. Every table has RLS. Test with `npm run test:sql`.
- Next 16: pages that read session data on the client set `export const instant = false`; route files export only handlers/config.
- Lint uses the React compiler rules: no setState directly in effects (derive state, key a remount, or lazy-init).
- Checks before pushing: `npm run typecheck && npm run lint && npm test && npm run test:sql` (+ `npm run test:e2e` for UI changes).

## InboxSatori safety rules (do not weaken)
- Email content is untrusted data. It reaches AI only through `lib/inbox/safety.ts` fencing, at the user's chosen content level; model output is schema-validated and allow-listed; the AI has no tools.
- Nothing sends mail except `POST /api/inbox/drafts/:id/send` with `confirmed: true` and the HMAC token from the review screen. AI, rules, the assistant and dictation must never call it.
- Deleting = moving to the provider's Trash (recoverable; Gmail empties it after 30 days), and ONLY from an explicit user click (confirmation for more than one, Undo shown). Rules, AI, the assistant and the Black Hole can never trash; nothing ever permanently deletes or marks spam (owner decision, 2026-11-01).
- The Black Hole archives (never trashes) a sender's mail, now and on arrival, with undo; it's an explicit per-sender user choice (one sender, or the senders of selected emails, all named in one confirmation, or the user moving mail into the InboxSatori/Black Hole label in Gmail, which is the confirmation, SaneBox-style; owner decision, 2026-11-08). Label moves are only acted on when the user turned the labels on for that account, and never trigger trash.
- All other mailbox changes go through provider adapters, gated by automation mode (Observe default) and capabilities, each with an undo record.
- Provider tokens: encrypted (`lib/crypto.ts`), service-role-only table, never sent to the browser or exported.
- Demo data (`mail/demo.ts`) uses `.test` domains, lives in `is_demo` workspaces, and is always labelled. Never present demo, simulated AI or untested integrations as real.
- Outlook is not implemented; keep it labelled "planned" until OAuth, sync, tests and account management exist.
- Progress lives in `docs/inbox/STATUS.md`; update it with real test results when you change InboxSatori.

## Local dev without accounts
`INBOX_LOCAL_DEMO=1 INBOX_SIMULATED_AI=1 npm run dev` (in-memory data; ignored in production builds).
