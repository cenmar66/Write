# Deployment

The Daily Canvas ships with Write.ai: same Vercel project, same Supabase project. No new services are required for the core planner.

## 1. Database (Supabase)

Supabase → SQL Editor → New query → paste [`supabase/migrations/0009_daily_canvas.sql`](../../supabase/migrations/0009_daily_canvas.sql) → Run. (Or run all of `supabase/setup-all.sql`.) Safe to run again; it never deletes data.

Check: Table Editor shows the `canvas_*` tables, each with "RLS enabled". Database → Publications → `supabase_realtime` includes a few `canvas_*` tables (for instant cross-device updates; sync still works without it).

## 2. Environment (Vercel)

Nothing new is required for the planner. For Google, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` ([INTEGRATIONS.md](INTEGRATIONS.md)); `ENCRYPTION_KEY` must be set. Never set `NEXT_PUBLIC_CANVAS_LOCAL_ONLY` in Vercel (it is ignored in production anyway). See [ENVIRONMENT.md](ENVIRONMENT.md).

## 3. Deploy

Merge to the branch Vercel builds (or `vercel --prod`). Before merging:

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run build
```

After deploying, visit `https://YOUR-DOMAIN/canvas`, sign in, and run the manual checklist in [TESTING.md](TESTING.md).

## 4. Install the app

- **iPhone / iPad**: Safari → `https://YOUR-DOMAIN/canvas` → Share → **Add to Home Screen** → "Daily Canvas". (Must be Safari on iOS.)
- **Mac (Safari, macOS Sonoma or later)**: File → **Add to Dock**.
- **Mac (Chrome/Edge)**: the install icon at the right of the address bar.

The installed app is scoped to `/canvas`, separate from the Write.ai app icon. Open it once while online on each device so the offline copy is stored.

## Rollback

Code: redeploy the previous deployment in Vercel. Database: the migration only adds tables/functions; leaving them in place is harmless. To remove the planner's data, use Settings → Your data → Delete (export first).

## Known platform limitations

- iOS/iPadOS Safari: no Vibration API (no haptics); speech recognition may be unavailable in Home Screen apps on some iOS versions (use cloud dictation or the keyboard mic); notifications require iOS 16.4+ and the app installed to the Home Screen.
- Reminders fire only while the app is open or running; there's no push server.
- iOS may clear a site's offline storage after weeks of not opening it. The planner asks for persistent storage, and the cloud copy is the source of truth, so nothing is lost when signed in; unsynced offline edits are the only thing at risk.
- Apple Pencil works through standard web pointer events: pressure is supported; hover, double-tap/squeeze tool switching and Scribble-into-canvas are not available to web apps.
