# The Daily Canvas — implementation status

Updated: 2026-10-27. Branch: `claude/focused-bell-9z1bhs`.

## Phases

| Phase | State | Notes |
|---|---|---|
| 0 Architecture, schema, tooling, tests | ✅ Done | Vitest, Playwright, SQL tests, docs |
| 1 Planner: all 12 sections, CRUD, check-off experience | ✅ Done | Day/Week/Month, focus mode, wrap-up, print |
| 2 Auth, cloud sync, PWA, responsive, offline | ✅ Done | Offline verified on a production build (headless Chromium) |
| 3 Voice capture | ✅ Done | Web Speech (EN/ES) + Deepgram fallback + rule-based Quick Add. Real-mic testing pending |
| 4 Rollover, recurrence, history, statistics | ✅ Done | Insights, Search, ledger, exports |
| 5 Google Calendar | ✅ Built, ⏳ needs your Google client | Not tested against a live account |
| 6 Sunsama bridge (Google Calendar + Google Tasks) | ✅ Built, ⏳ needs your Google client | Based on Sunsama's published docs; not tested live |
| 7 Polish: stats charts, exports, accessibility, reminders, security docs | ✅ Done | Reminders are in-app only |
| iPad + Apple Pencil (v1.1) | ✅ Built | Synthetic pen events tested; real Pencil pending |
| Per-section colours + themes (v1.1) | ✅ Done | AA contrast enforced and tested |

## Needs you

1. Run `supabase/migrations/0009_daily_canvas.sql` in Supabase.
2. Deploy, open `/canvas`, install on each device.
3. For Google: create the OAuth client and add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Vercel ([INTEGRATIONS.md](INTEGRATIONS.md)).
4. Run the manual device checklist in [TESTING.md](TESTING.md).

## Known issues / not built

- No background push notifications (needs a push service + VAPID keys); reminders work while the app is running.
- No AI-assisted Quick Add interpreter (rule-based only; nothing leaves the device). The `ai_interpreter` preference column is reserved for it.
- Haptics: none on iOS (no web API).
- Week view lists tasks but doesn't support drag between days; use "Plan for another day".
- Google Tasks sync runs when you press "Sync now" (and imports then); it isn't scheduled in the background.
- Large ink histories load per day; very long-term exports include all ink points.

## Next steps (suggested)

- Background Google Tasks sync on a Vercel cron (needs a service-role design decision).
- Web Push reminders.
- Drag tasks between days in Week view.
- Optional AI Quick Add using the existing Anthropic setup, off by default.
