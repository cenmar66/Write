# Testing

## Commands

| Command | What it runs | Needs |
|---|---|---|
| `npm run typecheck` | TypeScript strict | — |
| `npm run lint` | ESLint (Next + React rules) | — |
| `npm test` | Vitest: dates/DST, rollover, recurrence, statistics, parser (EN/ES), colour contrast, Google conversions and sync decisions, and **store + sync engine against a fake server** (offline queue, restart, two devices, conflicts, account separation) | — |
| `npm run test:sql` | The real migration on a throwaway local Postgres with a Supabase stand-in | PostgreSQL 15+ server binaries |
| `npm run test:e2e` | Playwright in Chromium at desktop, iPad landscape, iPad portrait and iPhone sizes, in local-only mode | Playwright Chromium |
| `npm run test:offline` | Production build + fake sign-in + service worker; cuts the network and checks the planner still opens and saves | Playwright Chromium |

## Coverage of the acceptance list

| Area | Automated |
|---|---|
| Task create/delete, complete/undo/reopen, section moves, subtasks, keyboard | e2e |
| Cross-day navigation, past/future banners | e2e |
| Rollover, rollover after inactive days, repeated rollover, two devices rolling over | unit + e2e + sync test |
| Recurring tasks | unit |
| Completion stats, reopen, no double counting, rest days | unit + e2e (Insights) |
| Timezone boundaries and daylight-saving days | unit (dates, calendar events) |
| Offline editing and reconnection; outbox survives restart | sync tests + `test:offline` |
| Simultaneous edits from two devices | sync tests + SQL tests |
| Calendar event conversion, duplicate external events | unit (gcal) |
| Google Tasks: export/push/pull/conflict/loop prevention/never-delete | unit (gtasks) |
| Failed auth (revoked token → reconnect) | code path only — needs live Google |
| Dictation: transcript editable before save, permission denied, cancel | e2e (with a fake speech engine) |
| Account separation | SQL tests (RLS) + sync test |
| PWA manifest, icons, service worker served | e2e |
| Apple Pencil: pen draws only in Pencil Mode, touch ignored, undo/redo, eraser, ink persists and renders after reload | e2e with synthetic pen pointer events |
| Section colours: persist, AA contrast, restore defaults, themes, hiding keeps data | unit + e2e |

## What was verified, and what wasn't

Verified in the build environment (Linux, headless Chromium):
- Everything in the table above marked unit/e2e/SQL.
- `npm run test:offline` on a production build: with the network cut, the planner reopened from the service worker cache, earlier tasks were there, new tasks and check-offs were saved and queued (8 changes in the outbox), Insights and Settings opened, no page errors.

**Not verified** (no such hardware or accounts in the build environment):
- Safari on macOS, iOS and iPadOS; installing to the Dock / Home Screen.
- Real Apple Pencil input, palm rejection, latency, `touchType === "stylus"` scroll blocking.
- Real microphones and Safari/Chrome speech recognition; Deepgram cloud dictation.
- Haptics (iOS Safari has no Vibration API, so there are none on iPhone).
- Live Google Calendar / Google Tasks / Sunsama accounts.
- Notifications on any platform.

## Manual checklist (do once after deploying)

### iPhone (Safari, iOS 17+)
- [ ] Open `/canvas`, sign in, Share → Add to Home Screen; launch from the icon (no browser bars, safe areas respected).
- [ ] Section list shows counts; tapping a section opens it; "All sections" returns.
- [ ] Blue + button: dictate "Call John tomorrow morning about the proposal" with the mic; transcript shows; Save; it's in Emails/Calls tomorrow.
- [ ] If the mic button says no speech recognition, try Settings → Voice → engine "Cloud" (Deepgram key must be set) or the keyboard's mic key.
- [ ] Check a task: tick draws, text strikes through, pen sound (unless the silent switch is on), Undo works.
- [ ] Airplane mode: close and reopen the app; planner opens; add and check a task; turn airplane mode off; badge goes from "Offline · N to sync" to "Synced"; change appears on the Mac.
- [ ] Spanish: Settings → Voice → Español; dictate "Llamar a Ana mañana a las 3".

### iPad (Safari, landscape and portrait, Apple Pencil)
- [ ] Landscape shows 3–4 columns with the sidebar; portrait shows 2 columns.
- [ ] Pencil Mode (pen icon): write in Notes and Big Ideas; circle an appointment; underline a Must Do task.
- [ ] Fingers still scroll the page while in Pencil Mode; resting a palm doesn't draw; a quick finger tap still ticks a checkbox.
- [ ] Highlighter, eraser, undo/redo, colours, line widths, "draw across the page", clear.
- [ ] Ink appears on the iPhone and Mac (view-only outside Pencil Mode).
- [ ] Section colours: pick one from the ⋯ menu; it appears on the other devices.

### Mac (Safari 17+ and Chrome)
- [ ] Safari → File → Add to Dock; launch it.
- [ ] Two-page notebook layout on a wide window; keyboard: N (quick add), T (today), ←/→ (days), D/W/M (views).
- [ ] Dictation in Chrome and Safari; permission prompt; deny it once and see the helpful message.
- [ ] Print a day (printer icon) → Save as PDF.
- [ ] Settings → Your data → download JSON and a CSV; open the CSV in Numbers/Excel.

### Google
- [ ] Connect Calendar; choose calendars; events appear with Google tag; all-day and recurring events look right; overlapping events say "overlaps".
- [ ] Create an appointment and move it to Google Calendar; it appears once in Google.
- [ ] Edit and delete a Google event from the planner (with confirm).
- [ ] Revoke access at myaccount.google.com → Security → Third-party access; the planner shows "Reconnect" instead of failing.
- [ ] Google Tasks: link a task, sync, see it in Google Tasks; complete it in Google; sync; it's ticked here. Change it in both places; see the conflict and resolve it.
- [ ] Sunsama: timebox a task to the selected calendar → it shows as "time block". Drag a linked task into Sunsama from its Google Tasks panel, complete it there, sync here → ticked.

### Two devices at once
- [ ] Edit the same day's Notes on two devices while one is offline; reconnect; the conflict banner offers both versions; "Keep both" merges.
