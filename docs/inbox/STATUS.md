# InboxSatori — status

Updated: 2026-11-01 (renamed InboxPilot → InboxSatori; inboxsatori.com support; merged main with PromptSatori). Branch: `claude/modest-mayer-s6njs0`.

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
| `npm test` (Vitest, whole repo) | ✅ 200 passed (79 InboxSatori: bulk Black Hole, unread counts agree everywhere, list paging, email HTML sanitizer + embedded images, parse, classify, deadlines, rules incl. inbox-zero template and no-trash guarantee, follow-ups, safety, send guard, briefing, analytics, time, search, Gmail OAuth/tokens/trash with mocked Google, sync pipeline, Black Hole, jobs, AI-can't-command, memory-DB fidelity, inboxsatori.com routing) |
| `npm run test:sql` (real Postgres) | ✅ InboxSatori: tenant isolation, token lockout, dedupe, append-only audit, entitlement self-grant blocked, job claim/retry/dead-letter, disconnect cascade, delete-my-data |
| Playwright InboxSatori (desktop + iPhone, Chromium) | ✅ 25 passed (incl. crash screen instead of blank page, no browser errors on a normal phone load, bulk Black Hole + Undo, preview changes nothing, sidebar badge = folder unread, formatted email in a no-script sandbox, instant delete, long-list scroll + Select all + paging, Archive, Black Hole, inboxsatori.com icons) |
| Full Playwright suite (all specs, 4 device profiles) | ✅ 46 passed, 0 failed, 106 skipped by design |
| `next build` | ✅ |
| `npm audit --omit=dev --audit-level=high` | ✅ 0 vulnerabilities |

## Changes 2026-11-01 (owner requests)
- **Delete** (message view, bulk bar, `#`): moves to Gmail Trash (restorable 30 days); confirmation for more than one; Undo. User-only: rules/AI/assistant can't trash. Safety rule in CLAUDE.md updated accordingly.
- **Black Hole** per sender: existing mail (after confirmation) and all future mail is marked done and archived out of the Gmail inbox, each with an undo record; “bring back” restores it.
- **Archive** button in the message view; rule template “Low priority → out of my inbox (inbox zero)”.
- Mailbox actions on a read-only account now explain why and offer **Grant permission** (was: “no permission to organize”).
- Fixed: Undo in the message view could act on the next message after the view moved on.
- **Mail lists page 100 at a time**, Gmail-style (“1–100 of 342” with Newer/Older). Select all checks the page; a banner offers “Select all N in this view” (large bulk actions run in batches of 100 after one confirmation). Fixed: long lists ran past the bottom of the window, so the last selected emails couldn’t be scrolled to.
- **No more blank screens**: a crash in the browser now shows what went wrong (error, page, browser) with Try again / Reload / Copy details, and a start-up watchdog shows script errors if the app can't start at all. Added after an iPhone Safari report of a blank page; the cause isn't confirmed yet: Safari/WebKit can't be run in this test environment (only Chromium at phone size), so the next report will carry the exact error.
- **Bulk Black Hole**: select emails → Move to… → “Black Hole these senders…”. One confirmation names every sender; their mail (now and future) is archived out of the inbox, never deleted; Undo brings them all back. Runs in batches of 5 senders with progress.
- **Unread counts fixed**: the number at the top of a folder counted only the current page, and sidebar badges counted Trash and snoozed mail. Now every badge and folder count uses the folder's own filters (one shared query), so they always match; the Priority badge shows unread like the others.
- **Emails show formatted, with images** (like Gmail), in a sandbox where nothing can run; “Show plain text” switches back. Suspicious messages don't load remote images.
- **Delete, Archive and Done are instant**: the message leaves the list and the next one opens immediately; Gmail is updated in the background (8 at a time instead of one by one) and the message comes back with an error if that fails.
- InboxSatori icon set (ensō + envelope); inboxsatori.com serves its own favicon, app icons and manifest.

## Open issues / known limits
- Not verified against live Gmail, live Claude/OpenAI, real Safari/iOS, or real microphones.
- Rate limiting is per serverless instance (fine for one owner; needs a shared store for many users).
- Background sync polls every 10 minutes (no Gmail push yet).
- Briefings are delivered in-app only; no push/email delivery.
- Gmail web deep links use `#search/rfc822msgid:` (reliable) — they open Gmail search for that message rather than the thread view.
- Team features (invites, assignment notifications) not built; assignment is a free-text field shown only when a team workspace exists.
- Local demo mode keeps data in server memory; it resets on restart.

## Pending external dependencies (need you)
1. Run `supabase/migrations/0012_inboxsatori.sql`.
2. Google Cloud: enable Gmail API, add scopes and the redirect URI `https://YOUR-DOMAIN/api/inbox/gmail/callback` (SETUP.md §3).
3. Vercel env: `SUPABASE_SECRET_KEY`, `CRON_SECRET` (plus existing `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `ANTHROPIC_API_KEY`).
4. Decide: keep the OAuth app in Testing (weekly reconnect) or publish unverified for personal use.
5. Before any public launch: Google verification + CASA, privacy policy, Stripe account.

## Next development actions
See [ROADMAP.md](ROADMAP.md) → “Next”.
