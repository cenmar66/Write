# Database

Migration: [`supabase/migrations/0010_daily_canvas.sql`](../../supabase/migrations/0010_daily_canvas.sql). Re-runnable; never deletes data. Also appended to `supabase/setup-all.sql`.

## Shared columns (every synced table)

| Column | Meaning |
|---|---|
| `id uuid` | Made on the device (v4), or deterministic (v5) where one-per-something matters |
| `user_id` | Owner; RLS checks it on every read and write |
| `created_at`, `updated_at` | UTC. `updated_at` is set by the server |
| `version` | Server-incremented on every write |
| `deleted_at` | Soft delete (history and undo) |
| `sync_seq` | From a global sequence; devices pull "everything after N" |

The `canvas_touch` trigger owns `version`, `sync_seq`, `updated_at`, and stops `user_id`/`created_at` from changing.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `canvas_preferences` | One row per person: timezone, theme, colours, section order/visibility, water target, reminders… | unique `user_id` |
| `canvas_tasks` | Every task-like item: Must Do, Work, Personal, Emails/Calls (contact fields), To Buy (quantity). Subtasks via `parent_id` | unique `(recurrence_id, occurrence_date)` |
| `canvas_task_placements` | Which day a task appears on, section, order, `carried`, `removed` | unique `(task_id, date)`; id = v5(task, date) |
| `canvas_task_events` | Append-only ledger: created, completed, reopened, carried, moved, rescheduled, archived, restored, deleted | insert/select/delete only (no update policy) |
| `canvas_recurrences` | Repeat rules and template fields | |
| `canvas_appointments` | Local appointments (`attended` ≠ task completion) | |
| `canvas_journal` | Good things | |
| `canvas_ideas` | Big ideas, tags, pinned, `converted_task_id` | |
| `canvas_notes` | One note per day | unique `(user_id, date)` |
| `canvas_exercise` | Activity, minutes, intensity, metrics jsonb | |
| `canvas_meals` | breakfast/lunch/dinner (deterministic ids) and snacks | |
| `canvas_water` | Glasses, target and glass size per day | unique `(user_id, date)` |
| `canvas_day_meta` | Evening wrap-up: closed_at, reflection | unique `(user_id, date)` |
| `canvas_ink` | One row per pen stroke | |
| `canvas_task_links` | Daily Canvas task ↔ Google Tasks item, sync markers, conflict | unique `(task_id, provider)`, unique external id |
| `canvas_google_accounts` | Encrypted Google tokens, chosen calendars, Tasks list. **Not synced to devices** | PK `user_id` |
| `canvas_sync_audit` | Log of integration operations | |

Dates: planner days are `date` columns holding the local calendar date in the person's timezone (`canvas_preferences.timezone`). Instants are `timestamptz` (UTC).

## `canvas_push(mutations jsonb)`

Runs as the caller (RLS applies). For each `{table, id, patch, base}`:

1. Unknown table → error. Unknown columns are ignored (checked against `pg_attribute`).
2. Row doesn't exist → insert with `on conflict do nothing` (two devices creating the same deterministic id is fine). If a unique rule rejects it, returns `rejected`.
3. Ledger rows are never updated.
4. For each protected field in `base`: if the server value differs from `base` and from the new value, that field is skipped and reported as a conflict.
5. Remaining fields are applied. Returns the stored row.

`canvas_delete_my_data()` deletes every Daily Canvas row for the caller (Write.ai data untouched).

## Tests

`npm run test:sql` starts a throwaway local Postgres, applies a tiny Supabase stand-in (`supabase/tests/supabase-shim.sql`), runs the migration twice, then [`supabase/tests/canvas.test.sql`](../../supabase/tests/canvas.test.sql): create, replay without duplicates, conflict detection, one-note-per-day, unknown table refusal, immutable ledger, cross-account isolation, increasing `sync_seq`, delete-my-data.

## Backup and restore

- **Supabase backups**: Pro plans include daily backups (Database → Backups). Restoring there rolls back the whole project, including Write.ai.
- **Your own copy**: Settings → Your data → **JSON** downloads everything (including deleted rows and the ledger). Keep it somewhere safe.
- **Restore a single table from a JSON export** (SQL editor, as the owner): use `jsonb_populate_recordset` on the exported array, e.g.
  ```sql
  insert into canvas_tasks select * from jsonb_populate_recordset(null::canvas_tasks, '<paste the canvas_tasks array>'::jsonb)
  on conflict (id) do nothing;
  ```
  Do parents first (`canvas_recurrences`, `canvas_tasks`) then children (placements, events, links).
- **Point-in-time**: Supabase PITR add-on, if you want minute-level recovery.
