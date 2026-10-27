# Architecture

## Decisions

| Choice | Why |
|---|---|
| Lives inside Write.ai at `/canvas` | Reuses the existing owner-only sign-in, Supabase project and Vercel deploy. Own layout, manifest, icons and `canvas_*` tables keep it separate. |
| Next.js 16 App Router, TypeScript strict, Tailwind v4 | Already the project's stack. |
| No shadcn/ui | The existing codebase doesn't use it. Dialogs use the native `<dialog>` (focus trap, Escape, top layer) and all controls are plain accessible HTML. |
| Hand-made SVG charts (no Recharts) | Five small chart types; avoids ~100 KB of dependencies. |
| `idb` (IndexedDB), `uuid` (v4 + v5), `chrono-node` (date phrases) | Small, maintained, single-purpose. |
| Local-first | Every action writes to the device first, so checking a box is instant and works offline. |

## Code map

```
src/app/canvas/                 routes: planner, insights, notes, lists, search, settings, print, manifest
src/app/api/canvas/google/      Google OAuth, calendar events, Google Tasks bridge (server only)
src/components/canvas/          UI (provider, shell, sections, tasks, ink, dictation, …)
src/lib/canvas/
  types.ts        record shapes (mirror the SQL)
  store.ts        local-first store: memory + IndexedDB + outbox + shadow
  sync.ts         push/pull engine against Supabase
  actions.ts      planner operations (add/complete/move/rollover/…)
  planning.ts     rollover + recurrence (pure)
  stats.ts        statistics (pure)
  parse.ts        quick-capture interpretation (pure)
  colors.ts       palette, themes, contrast guardrails (pure)
  dates.ts        timezone-correct date helpers (pure)
  gcal.ts/gtasks.ts  Google conversions and sync decisions (pure)
  google.ts       server-side Google token handling
public/canvas-sw.js             service worker (offline)
supabase/migrations/0010_daily_canvas.sql
```

## Data flow

```
 UI ──actions──▶ CanvasStore ──▶ IndexedDB (records, outbox, shadow, conflicts)
                    ▲  │
            pull    │  │ push (canvas_push RPC, batched, idempotent)
                    │  ▼
                 Supabase Postgres (RLS)  ◀── server routes (Google sync)
```

- **Store.** Each record lives in memory and IndexedDB. A change is applied immediately and its changed fields are merged into an **outbox** entry for that record (one entry per record, however many edits).
- **Shadow.** For each record the device keeps the last server version and the server values of "protected" text fields (task titles/notes, notes, ideas, journal…). The UI shows *server row + pending local edits*.
- **Push.** The sync engine sends outbox entries (parents first) to `canvas_push`. Each carries the shadow values of protected fields it changes as `base`. The server applies non-text fields (last writer wins per field) and refuses to overwrite text that changed elsewhere since `base`, returning a conflict instead. Replaying a push is harmless.
- **Pull.** Rows with `sync_seq` above the device's cursor, per table, re-reading a small overlap so rows committed out of order aren't missed.
- **Triggers.** Start, local change (debounced 0.8 s), reconnect, tab focus, Supabase Realtime ping from another device, and a 60 s timer.
- **Conflicts.** Shown as a banner; the person keeps this device's text, the other device's, or both.

## Task identity vs. daily appearance

`canvas_tasks` is the task. `canvas_task_placements` says which day (and section, position) it appears on. Placement ids are `uuidv5(task, date)`.

**Rollover** (on opening today, after each sync, and at midnight): every open, non-backlog, carryable task whose latest placement is before today gets a placement for today (`carried = true`) and a `carried` ledger event with a deterministic id. Running it again, after skipped days, or on two devices produces the same ids, so there are no duplicates. Due dates are never touched; removing a task from a day sends it to the backlog instead of deleting it.

**Recurrence**: a rule on `canvas_recurrences`; each day's occurrence is a task with id `uuidv5(recurrence, date)`, created when that day is opened. Missed days aren't back-filled; occurrences don't carry forward by default.

## Ink (Apple Pencil)

Each section has a transparent `<canvas>`. In Pencil Mode, `pointerType === "pen"` (and mouse) draws; finger touches scroll and quick finger taps pass through to the control underneath. On iPad Safari, touches with `touchType === "stylus"` are the only ones prevented from scrolling. Strokes store points as integers relative to the zone width (so they scale), with pressure. One row per stroke, so devices never conflict; erasing is a soft delete, which makes undo/redo simple.

## Offline

- **Data**: IndexedDB; the app never waits for the network to show or change anything.
- **App shell**: `public/canvas-sw.js` caches planner pages (network-first) and hashed build assets (cache-first). APIs are never cached.
- External calendar events are cached per day and shown read-only when offline.

## Security model (summary)

Owner-only sign-in (Write.ai's proxy), RLS on every `canvas_*` table, Google tokens AES-GCM encrypted server-side and never sent to the browser. See [SECURITY.md](SECURITY.md).
