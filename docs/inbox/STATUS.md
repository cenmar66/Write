# InboxPilot — status

Updated: 2026-10-31. Branch: `claude/modest-mayer-s6njs0`.

**Current phase:** Phases 1–5 built; Phase 6 mostly built; Phase 7 designed, partly scaffolded. Everything below is tested against synthetic data and a mocked Google API. **Nothing has run against a live Gmail account yet** (no OAuth client/credentials were available in the build environment).

## Phases

| Phase | State | Notes |
|---|---|---|
| 1 Research & architecture | ✅ | Docs in this folder. Live sanebox.com / developers.google.com were blocked by the build sandbox's network policy; facts to re-verify are listed in RESEARCH.md. |
| 2 Visual foundation | ✅ | Design tokens (light/dark), shell, nav, dashboard, responsive layouts, PWA manifest + icons, demo mode clearly labelled. |
| 3 Email connectivity | 🟡 Built, not live-verified | Gmail OAuth (incremental scopes), encrypted tokens, refresh/revoke, initial + incremental sync, history-expiry recovery, reading (on-demand body fetch), search (stored + “Search Gmail too”), Gmail deep links, error states. Tested with mocked Google + demo provider. |
| 4 Intelligence | ✅ | Hybrid classifier with explanations/factors, priority inbox, corrections → per-sender learning, rules engine with preview/conflicts/undo, AI summaries (gated). |
| 5 Productivity | ✅ | Follow-ups (I owe / they owe / commitments), task extraction with provenance, snooze (presets, until reply), daily briefings (scheduled + on demand), AI reply drafting + rewrites + review-before-send. |
| 6 Analytics & personalization | 🟡 | Analytics (ranges, CSV, estimates disclosed), writing profile, AI settings, custom categories, multi-account/workspace views. Not yet: native Gmail label sync, push notifications. |
| 7 Commercial & integrations | ⏳ | Entitlements/plans as config (dev plan = everything). Not built: Stripe, team invitations, Microsoft 365, external task integrations (Daily Canvas one-way hand-off works). |

## Acceptance criteria (from the brief)

| Criterion | State |
|---|---|
| Sign in securely | ✅ existing Write.ai auth (owner-only) |
| Connect Gmail with authorized OAuth | 🟡 built + mocked tests; needs your Google client to verify |
| Synchronize actual messages | 🟡 same |
| View and search inbox | ✅ (demo) / 🟡 (Gmail) |
| Identify important messages | ✅ |
| Review and correct classifications | ✅ |
| Create safe organization rules | ✅ |
| Grounded daily briefing | ✅ |
| Track unanswered conversations | ✅ |
| Create tasks from messages | ✅ |
| Draft a reply using AI | ✅ with simulated AI in tests; 🟡 real Claude call not exercised in tests |
| Review before sending | ✅ (HMAC-bound confirmation, e2e-tested) |
| Preferences & privacy controls | ✅ |
| Disconnect and delete data | ✅ |
| Desktop and mobile | ✅ responsive + PWA; tested at desktop and iPhone sizes in Chromium. Real Safari/iOS not tested. |

## Tests performed (actual results, this session)

| Suite | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ clean (whole repo) |
| `npm test` (Vitest, whole repo) | ✅ 126 passed, of which 67 are InboxPilot (parse, classify, deadlines, rules, follow-ups, safety, send guard, briefing, analytics, time, search, Gmail OAuth/tokens with mocked Google, sync pipeline, jobs, AI-can't-command, memory-DB fidelity) |
| `npm run test:sql` (real Postgres) | ✅ InboxPilot: tenant isolation, token lockout, dedupe, append-only audit, entitlement self-grant blocked, job claim/retry/dead-letter, disconnect cascade, delete-my-data |
| Playwright InboxPilot (desktop + iPhone, Chromium) | ✅ 14 passed |
| Full Playwright suite (all specs, 4 device profiles) | ✅ 46 passed, 0 failed, 106 skipped by design |
| `next build` | ✅ |
| `npm audit --omit=dev --audit-level=high` | ✅ 0 vulnerabilities |

## Open issues / known limits
- Not verified against live Gmail, live Claude/OpenAI, real Safari/iOS, or real microphones.
- Rate limiting is per serverless instance (fine for one owner; needs a shared store for many users).
- Background sync polls every 10 minutes (no Gmail push yet).
- Briefings are delivered in-app only; no push/email delivery.
- Gmail web deep links use `#search/rfc822msgid:` (reliable) — they open Gmail search for that message rather than the thread view.
- Team features (invites, assignment notifications) not built; assignment is a free-text field shown only when a team workspace exists.
- Local demo mode keeps data in server memory; it resets on restart.

## Pending external dependencies (need you)
1. Run `supabase/migrations/0011_inboxpilot.sql`.
2. Google Cloud: enable Gmail API, add scopes and the redirect URI `https://YOUR-DOMAIN/api/inbox/gmail/callback` (SETUP.md §3).
3. Vercel env: `SUPABASE_SECRET_KEY`, `CRON_SECRET` (plus existing `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `ANTHROPIC_API_KEY`).
4. Decide: keep the OAuth app in Testing (weekly reconnect) or publish unverified for personal use.
5. Before any public launch: Google verification + CASA, privacy policy, Stripe account.

## Next development actions
See [ROADMAP.md](ROADMAP.md) → “Next”.
