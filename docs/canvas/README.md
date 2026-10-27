# The Daily Canvas

A calm, voice-enabled daily planner modelled on a two-page paper planner (the Bloom Daily Planners Pocket Pad). It lives inside this Write.ai project at **`/canvas`**, with its own look, its own installable app, and its own database tables. It shares Write.ai's sign-in, Supabase project and Vercel deployment, so there is nothing new to host.

| Doc | What's in it |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it fits together: local-first store, sync, rollover, ink |
| [DATABASE.md](DATABASE.md) | Tables, constraints, the sync function, backups |
| [INTEGRATIONS.md](INTEGRATIONS.md) | Google Calendar, Google Tasks, Sunsama: setup and exact limits |
| [STATISTICS.md](STATISTICS.md) | Every metric and how it's counted |
| [TESTING.md](TESTING.md) | Automated tests, and the manual iPhone / iPad / Mac checklist |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Going live on Vercel + Supabase, installing on Mac/iPhone/iPad |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Every environment variable |
| [SECURITY.md](SECURITY.md) | Privacy, access control, data export and deletion |
| [STATUS.md](STATUS.md) | What's done, what's verified, what's left |

## Quick start (local)

```bash
npm install
cp .env.example .env.local          # fill in Supabase values (see ENVIRONMENT.md)
npm run dev                         # http://localhost:3000/canvas
```

To try the planner without any accounts, run it in local-only mode (dev only; data stays in your browser):

```bash
NEXT_PUBLIC_CANVAS_LOCAL_ONLY=1 npm run dev
```

## Going live (once)

1. In Supabase → SQL Editor, run [`supabase/migrations/0009_daily_canvas.sql`](../../supabase/migrations/0009_daily_canvas.sql) (or the whole `supabase/setup-all.sql`; both are safe to re-run).
2. Push to the branch Vercel deploys. Open `https://YOUR-DOMAIN/canvas` and sign in as usual.
3. Optional: set up Google ([INTEGRATIONS.md](INTEGRATIONS.md)).
4. Install it: iPhone/iPad Safari → Share → **Add to Home Screen**; Mac Safari → File → **Add to Dock**.

## What's in the planner

- All twelve paper sections: Must Do Today, Appointments, Work To-Dos, Emails/Calls, Good Things That Happened, To Buy, Personal To-Dos, Exercise, Meals/Calories, 8 Glasses a Day, Big Ideas, Notes.
- Day, Week and Month views; Insights; Notes & ideas archive; Lists & backlog; Search; Settings; printable day.
- Check-off with a hand-drawn tick, strike-through, optional pen sound, haptics where supported, and Undo.
- Dictation in every text field (English/Spanish) and a one-line Quick Add that understands sentences like "Call John tomorrow morning about the proposal".
- Unfinished tasks roll forward once per day, never duplicated, with their history kept.
- Apple Pencil handwriting on every section (and across the page) in Pencil Mode.
- Per-section colours and theme presets with automatic contrast guardrails.
- Works offline; syncs across devices through Supabase.
