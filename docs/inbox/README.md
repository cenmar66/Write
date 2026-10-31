# InboxPilot AI

**“Your inbox should work for you, not the other way around.”**

InboxPilot is an email command center that lives inside Write.ai at **`/inbox`**. It sorts what matters from what can wait, tracks who owes whom a reply, turns emails into tasks, writes a grounded daily briefing, and drafts replies that you review before anything is sent.

It starts in **Observe** mode: nothing in your mailbox changes until you say so.

| Doc | What's in it |
|---|---|
| [STATUS.md](STATUS.md) | What's built, what's tested, what's not, what needs you |
| [SETUP.md](SETUP.md) | Database, Google Cloud / Gmail OAuth, environment variables, cron |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Decisions, domain boundaries, data flow, code map |
| [DATABASE.md](DATABASE.md) | Tables, tenancy and row-level security |
| [SECURITY.md](SECURITY.md) | Security & privacy checklist, Google API policy obligations |
| [OPERATIONS.md](OPERATIONS.md) | Background jobs, monitoring, AI cost estimate |
| [TESTING.md](TESTING.md) | Automated tests, results, manual checklist |
| [RESEARCH.md](RESEARCH.md) | Competitive notes and provider facts (with what still needs verifying) |
| [ROADMAP.md](ROADMAP.md) | Planned work, in order |

## Try it in 30 seconds (no accounts needed)

```bash
INBOX_LOCAL_DEMO=1 INBOX_SIMULATED_AI=1 npm run dev
```

Open `http://localhost:3000/inbox`, go through onboarding and choose **Use the demo mailbox**. Local demo mode is development-only (ignored in production builds): data lives in server memory, and the "AI" is a labelled simulation.

## Use it for real

1. Run `supabase/migrations/0011_inboxpilot.sql` in Supabase (or the whole `supabase/setup-all.sql`).
2. Set the environment variables in [SETUP.md](SETUP.md) (`GOOGLE_CLIENT_ID/SECRET`, `ENCRYPTION_KEY`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY`).
3. Add the Gmail redirect URI and scopes to your Google OAuth client.
4. Deploy, open `/inbox`, follow onboarding, connect Gmail.

## Main screens

- **Home**: priority emails, replies due, follow-ups waiting, deadlines; daily brief; recommended actions; inbox health; productivity snapshot.
- **Priority Inbox / All Mail / Views**: virtual categories (Needs My Attention, To Do, Read Later, Newsletters, Notifications, Receipts & Documents, Personal, Low Priority, Review: Uncertain, plus your own). Keyboard: `j`/`k`, `e` done, `s` snooze, `x` select, `r` reply, `t` task, `/` search. Swipe right (done) / left (snooze) on phones.
- **Reader**: AI summary, “Why it's here” with every factor and one-click corrections, suggested actions, rule suggestions with approve/undo, conversation tracking, sender controls, security warnings.
- **Tasks & Follow-ups**: I owe someone · Someone owes me · Upcoming · Completed.
- **Daily Brief**: morning/midday/evening or “Brief me now”; concise or expanded; every line links to its source.
- **Rules**: no-code builder with “What will change?” preview, conflict detection, action history and undo.
- **Senders**: Sender Control Center (VIP, always prioritize, mute, screen out, hide, default category).
- **Analytics**, **Connected Accounts**, **Settings** (privacy & AI, retention, automation, briefing, focus, writing profile, categories, export, delete), **Operations**.
