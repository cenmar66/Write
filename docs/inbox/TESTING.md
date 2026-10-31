# Testing

## Run

```bash
npm run typecheck && npm run lint
npm test                       # Vitest (unit + integration)
npm run test:sql               # migrations on real Postgres + RLS/behaviour tests
npx playwright test tests/e2e/inbox.spec.ts --project=desktop --project=iphone
npm run test:e2e               # everything (Daily Canvas + InboxPilot, 4 device profiles)
```

End-to-end tests start `next dev` with `INBOX_LOCAL_DEMO=1 INBOX_SIMULATED_AI=1` (in-memory data, simulated AI, demo mailbox) — no Google, Supabase or AI account is touched. Don't edit `.env*` files while they run: Next reloads every page when env files change.

## Results (2026-10-31, this branch)

| Suite | Result |
|---|---|
| Typecheck, lint (whole repo) | clean |
| Vitest, whole repo | 126 passed (67 InboxPilot) |
| SQL tests (Postgres 16) | passed (Daily Canvas + InboxPilot) |
| Playwright, all specs, 4 profiles | 46 passed, 0 failed, 106 skipped by design (device-specific tests) |
| `next build` | passed |

## What's covered

| Requirement | Where |
|---|---|
| Authentication / permission enforcement | SQL: cross-tenant read/write/membership escalation denied; routes check membership (`requireWorkspace`) |
| OAuth callback security | `gmail.test.ts`: forged/replayed state rejected, id_token `aud` check, minimal scopes per step |
| Token refresh, revoked tokens | `gmail.test.ts` (mocked Google): refresh on expiry; `invalid_grant` → tokens wiped + “Reconnect needed”; revoke on disconnect |
| Rate limits | `gmail.test.ts`: 429 + `Retry-After` backoff; history 404 → full resync |
| Account disconnection, data deletion | SQL cascade + delete-my-data; `pipeline.test.ts`; e2e “disconnecting deletes the account's data” |
| Mail sync, duplicate prevention | `pipeline.test.ts`: full import, incremental with no new rows, replayed page, unique keys (also SQL) |
| Classification | `classify.test.ts` (newsletters, marketing ≠ urgent, VIP + explicit deadline, “critical” needs evidence, feedback, uncertain → review, bounces/auto-replies, invoices) |
| Rule precedence & execution | `rules.test.ts` (priority, stop, rules beat AI, mode gating, dry-run, broad detection, conflicts, validation, no delete action); `pipeline.test.ts` (observe suggests, automatic applies with undo) |
| Follow-up detection | `followups.test.ts` (they owe / I owe, auto-replies & bounces ignored, promises kept/broken, stable dedupe keys) |
| Task extraction | e2e (explicit due date provenance, permanent source link) |
| Draft handling | e2e: AI draft → review → simulated text blocked → confirm → recorded; stale review token rejected; double-send claim (memory-DB test) |
| Tenant isolation | SQL tests |
| Prompt-injection defenses | `safety.test.ts` (detection, fences can't be closed, content levels, invented refs dropped); `pipeline.test.ts` malicious provider can't create sends/drafts/invalid values; e2e warning banner |
| AI can't command backend actions | `pipeline.test.ts` “AI output cannot command the backend” + “never calls AI when not allowed” |
| Background job retries | SQL (claim, backoff, dead-letter) + `pipeline.test.ts` (idempotent enqueue, retry) |
| Responsive interface | e2e on desktop and iPhone viewport (bottom tabs, list → message → back) |

## Manual checklist (needs real accounts/devices)
- [ ] Connect a real Gmail account; initial import progress; “Sync now”; incremental sync after new mail arrives.
- [ ] Grant Organize, approve a suggested archive, undo it; confirm the message is back in the Gmail inbox.
- [ ] Grant Send; send a real reply; confirm it threads correctly in Gmail and the follow-up closes.
- [ ] Revoke access at myaccount.google.com/permissions → account shows “Reconnect needed”.
- [ ] Turn AI on with a real Claude key: summary, draft, rewrite, assistant; check Operations shows tokens and cost.
- [ ] Install the PWA on iPhone (Safari) and Android (Chrome); swipe actions; dictation in the composer (EN/ES).
- [ ] Scheduled briefing appears at the chosen time (needs `CRON_SECRET` and Vercel cron).
