-- The Daily Canvas: a personal daily planner that lives next to Write.ai.
-- Safe to run more than once. Never deletes data.
--
-- Design notes (see docs/canvas/DATABASE.md for the full write-up):
--  * Every synced table shares the same housekeeping columns:
--      id (uuid, made on the device), user_id, created_at, updated_at,
--      version (bumped on every server write), deleted_at (soft delete),
--      sync_seq (global, increasing; devices pull "everything after N").
--  * A task's identity (canvas_tasks) is separate from where it shows up on a
--    given day (canvas_task_placements). Rollover adds a placement for today
--    with an id derived from (task, date), so running it twice, or on two
--    devices, can never make a duplicate.
--  * canvas_task_events is an append-only ledger (completed, reopened, ...).
--    Statistics use it plus placements, so past days stay explainable.

create sequence if not exists public.canvas_sync_seq;

-- Housekeeping trigger: server owns version, sync_seq and updated_at.
create or replace function public.canvas_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.sync_seq := nextval('public.canvas_sync_seq');
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.created_at := old.created_at;
    new.user_id := old.user_id;
  else
    new.version := 1;
  end if;
  return new;
end;
$$;

-- Shared columns are written out per table so each stays a plain, readable table.

create table if not exists public.canvas_preferences (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  sound boolean not null default true,
  animations boolean not null default true,
  density text not null default 'comfortable' check (density in ('compact', 'comfortable', 'spacious')),
  section_order jsonb not null default '[]'::jsonb,
  hidden_sections jsonb not null default '[]'::jsonb,
  section_colors jsonb not null default '{}'::jsonb,
  color_theme text not null default 'paper-classic',
  water_target integer not null default 8 check (water_target between 1 and 24),
  glass_ml integer not null default 250 check (glass_ml between 50 and 2000),
  carry_shopping boolean not null default false,
  dictation_lang text not null default 'en-US',
  ai_interpreter boolean not null default false,
  reminders jsonb not null default '{}'::jsonb,
  tagline text not null default 'A focused day builds a brighter life.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create unique index if not exists canvas_preferences_one_per_user on public.canvas_preferences (user_id);

create table if not exists public.canvas_recurrences (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  section text not null check (section in ('must', 'work', 'personal', 'comms', 'shopping')),
  title text not null default '',
  notes text not null default '',
  priority smallint not null default 0 check (priority between 0 and 3),
  label text,
  estimate_min integer,
  scheduled_time text,
  rule jsonb not null, -- {"freq":"daily"|"weekdays"|"weekly"|"monthly","days":[0..6],"monthDay":1..31,"interval":1}
  start_date date not null,
  end_date date,
  carry boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);

create table if not exists public.canvas_tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  section text not null check (section in ('must', 'work', 'personal', 'comms', 'shopping')),
  title text not null default '',
  notes text not null default '',
  priority smallint not null default 0 check (priority between 0 and 3),
  label text,                     -- project / client, or shopping category
  due_date date,
  estimate_min integer,
  actual_min integer,
  scheduled_time text,            -- 'HH:MM' local time, optional
  parent_id uuid references public.canvas_tasks on delete cascade,
  status text not null default 'open' check (status in ('open', 'done', 'archived')),
  completed_at timestamptz,
  completed_on date,              -- local calendar date of completion
  origin_date date not null,      -- local date the task was first planned
  backlog boolean not null default false,
  carry boolean not null default true,
  recurrence_id uuid references public.canvas_recurrences on delete set null,
  occurrence_date date,
  -- Emails / Calls
  contact_name text,
  contact_info text,
  follow_up_date date,
  -- To Buy
  quantity text,
  source text not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create unique index if not exists canvas_tasks_one_occurrence
  on public.canvas_tasks (recurrence_id, occurrence_date) where recurrence_id is not null;
create index if not exists canvas_tasks_status on public.canvas_tasks (user_id, status, deleted_at);

create table if not exists public.canvas_task_placements (
  id uuid primary key,            -- uuidv5(task_id + date): one per task per day
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.canvas_tasks on delete cascade,
  date date not null,
  section text not null,
  position double precision not null default 0,
  carried boolean not null default false,
  removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0,
  unique (task_id, date)
);
create index if not exists canvas_task_placements_date on public.canvas_task_placements (user_id, date);

create table if not exists public.canvas_task_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.canvas_tasks on delete cascade,
  kind text not null check (kind in ('created', 'completed', 'reopened', 'carried', 'moved', 'rescheduled', 'archived', 'restored', 'deleted', 'edited')),
  at timestamptz not null,
  local_date date not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create index if not exists canvas_task_events_task on public.canvas_task_events (task_id, at);
create index if not exists canvas_task_events_date on public.canvas_task_events (user_id, local_date);

create table if not exists public.canvas_appointments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  start_time text,                -- 'HH:MM' local
  end_time text,
  title text not null default '',
  location text,
  notes text not null default '',
  attended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create index if not exists canvas_appointments_date on public.canvas_appointments (user_id, date);

create table if not exists public.canvas_journal (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  body text not null default '',
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create index if not exists canvas_journal_date on public.canvas_journal (user_id, date);

create table if not exists public.canvas_ideas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  body text not null default '',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  converted_task_id uuid references public.canvas_tasks on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create index if not exists canvas_ideas_date on public.canvas_ideas (user_id, date);

create table if not exists public.canvas_notes (
  id uuid primary key,            -- uuidv5('note' + date)
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0,
  unique (user_id, date)
);

create table if not exists public.canvas_exercise (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  activity text not null default '',
  duration_min integer,
  intensity text check (intensity in ('easy', 'moderate', 'hard')),
  notes text not null default '',
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create index if not exists canvas_exercise_date on public.canvas_exercise (user_id, date);

create table if not exists public.canvas_meals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  description text not null default '',
  calories integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create index if not exists canvas_meals_date on public.canvas_meals (user_id, date);

create table if not exists public.canvas_water (
  id uuid primary key,            -- uuidv5('water' + date)
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  glasses integer not null default 0 check (glasses between 0 and 48),
  target integer not null default 8,
  glass_ml integer not null default 250,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0,
  unique (user_id, date)
);

create table if not exists public.canvas_day_meta (
  id uuid primary key,            -- uuidv5('day' + date)
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  closed_at timestamptz,
  reflection text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0,
  unique (user_id, date)
);

-- Apple Pencil / stylus ink. One row per stroke, so two devices drawing at once
-- never conflict; erasing is a soft delete, so undo is just un-deleting.
create table if not exists public.canvas_ink (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  zone text not null,             -- section key or 'page'
  tool text not null check (tool in ('pen', 'highlighter')),
  color text not null,
  width real not null,
  points jsonb not null,          -- [x, y, pressure, ...] normalised to zone width
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0
);
create index if not exists canvas_ink_date on public.canvas_ink (user_id, date);

-- Integrations ---------------------------------------------------------------

-- Google account tokens. Tokens are AES-GCM encrypted by the server before they
-- are stored; the browser never sees them (this table is not part of sync).
create table if not exists public.canvas_google_accounts (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  google_email text,
  scopes text not null default '',
  refresh_token_enc text,
  access_token_enc text,
  access_expires_at timestamptz,
  selected_calendars jsonb not null default '[]'::jsonb,
  tasks_list_id text,
  tasks_settings jsonb not null default '{}'::jsonb,
  last_calendar_sync timestamptz,
  last_tasks_sync timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Links between a Daily Canvas task and a Google Tasks item (the Sunsama bridge).
create table if not exists public.canvas_task_links (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  task_id uuid not null references public.canvas_tasks on delete cascade,
  provider text not null default 'google_tasks',
  list_id text,
  external_id text,               -- null until the first export succeeds
  remote_etag text,
  remote_updated text,
  local_version_synced integer,
  state text not null default 'pending' check (state in ('pending', 'linked', 'conflict', 'broken')),
  conflict jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  sync_seq bigint not null default 0,
  unique (task_id, provider)
);
create unique index if not exists canvas_task_links_external
  on public.canvas_task_links (user_id, provider, external_id) where external_id is not null;

-- Audit trail for integration operations (connect, sync, create event, errors).
create table if not exists public.canvas_sync_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  provider text not null,
  action text not null,
  status text not null check (status in ('ok', 'error', 'skipped')),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists canvas_sync_audit_user on public.canvas_sync_audit (user_id, at desc);

-- Triggers + row-level security ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['canvas_preferences', 'canvas_recurrences', 'canvas_tasks', 'canvas_task_placements',
                           'canvas_task_events', 'canvas_appointments', 'canvas_journal', 'canvas_ideas',
                           'canvas_notes', 'canvas_exercise', 'canvas_meals', 'canvas_water', 'canvas_day_meta',
                           'canvas_ink', 'canvas_task_links'] loop
    execute format('drop trigger if exists canvas_touch on public.%I', t);
    execute format('create trigger canvas_touch before insert or update on public.%I
                      for each row execute function public.canvas_touch()', t);
    execute format('create index if not exists %I on public.%I (user_id, sync_seq)', t || '_seq', t);
  end loop;
  foreach t in array array['canvas_preferences', 'canvas_recurrences', 'canvas_tasks', 'canvas_task_placements',
                           'canvas_task_events', 'canvas_appointments', 'canvas_journal', 'canvas_ideas',
                           'canvas_notes', 'canvas_exercise', 'canvas_meals', 'canvas_water', 'canvas_day_meta',
                           'canvas_ink', 'canvas_task_links', 'canvas_google_accounts', 'canvas_sync_audit'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Ledger rows are append-only: once written they can't be edited (only the owner can insert).
drop policy if exists "owner only" on public.canvas_task_events;
drop policy if exists "owner reads" on public.canvas_task_events;
drop policy if exists "owner appends" on public.canvas_task_events;
create policy "owner reads" on public.canvas_task_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner appends" on public.canvas_task_events for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "owner deletes" on public.canvas_task_events;
create policy "owner deletes" on public.canvas_task_events for delete to authenticated
  using (user_id = (select auth.uid()));

-- Sync: apply a batch of changes from a device ---------------------------------
-- Each mutation: {"table", "id", "patch": {...changed fields}, "base": {...server values the
-- device last saw for protected text fields}, "create": bool}
-- Text fields listed in "base" are protected: if the server value changed since the device
-- last saw it (and differs from the device's new value), that field is NOT overwritten and
-- is reported back as a conflict for the person to resolve. Other fields are last-writer-wins.
-- Runs as the caller, so row-level security still applies to every read and write.
create or replace function public.canvas_push(mutations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  m jsonb;
  tbl text;
  rid uuid;
  cur jsonb;
  patch jsonb;
  base jsonb;
  k text;
  conflicts jsonb;
  cols text;
  results jsonb := '[]'::jsonb;
  row_out jsonb;
  allowed text[] := array['canvas_preferences', 'canvas_recurrences', 'canvas_tasks', 'canvas_task_placements',
                          'canvas_task_events', 'canvas_appointments', 'canvas_journal', 'canvas_ideas',
                          'canvas_notes', 'canvas_exercise', 'canvas_meals', 'canvas_water', 'canvas_day_meta',
                          'canvas_ink', 'canvas_task_links'];
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if jsonb_array_length(mutations) > 500 then raise exception 'Too many changes in one batch.'; end if;

  for m in select * from jsonb_array_elements(mutations) loop
    tbl := m->>'table';
    if not (tbl = any(allowed)) then raise exception 'Unknown table %', tbl; end if;
    rid := (m->>'id')::uuid;
    patch := coalesce(m->'patch', '{}'::jsonb) - 'user_id' - 'version' - 'sync_seq' - 'updated_at';
    base := coalesce(m->'base', '{}'::jsonb);
    conflicts := '{}'::jsonb;

    execute format('select to_jsonb(t) from public.%I t where id = $1', tbl) into cur using rid;

    if cur is null then
      -- New row. Another device may insert the same deterministic id at the same moment,
      -- so "do nothing" on conflict and fall through to the update path.
      patch := patch || jsonb_build_object('id', rid, 'user_id', uid);
      select string_agg(format('%I', key), ',') into cols
        from jsonb_object_keys(patch) key
        where key in (select attname from pg_attribute
                      where attrelid = format('public.%I', tbl)::regclass and attnum > 0 and not attisdropped);
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict do nothing',
                     tbl, cols, cols, tbl) using patch;
      execute format('select to_jsonb(t) from public.%I t where id = $1', tbl) into cur using rid;
      if cur is null then
        -- A unique rule (for example one note per day) kept it out: report the row that won.
        results := results || jsonb_build_object('id', rid, 'table', tbl, 'status', 'rejected');
        continue;
      end if;
      results := results || jsonb_build_object('id', rid, 'table', tbl, 'status', 'ok', 'row', cur);
      continue;
    end if;

    if tbl = 'canvas_task_events' then
      -- Ledger rows never change.
      results := results || jsonb_build_object('id', rid, 'table', tbl, 'status', 'ok', 'row', cur);
      continue;
    end if;

    -- Protected text fields: detect edits made elsewhere since this device last synced.
    for k in select * from jsonb_object_keys(base) loop
      if patch ? k and (cur->k) is distinct from (base->k) and (cur->k) is distinct from (patch->k) then
        conflicts := conflicts || jsonb_build_object(k, jsonb_build_object('server', cur->k, 'mine', patch->k));
        patch := patch - k;
      end if;
    end loop;
    patch := patch - 'id' - 'created_at';

    select string_agg(format('%I = r.%I', key, key), ',') into cols
      from jsonb_object_keys(patch) key
      where key in (select attname from pg_attribute
                    where attrelid = format('public.%I', tbl)::regclass and attnum > 0 and not attisdropped);

    if cols is not null then
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id = $2 returning to_jsonb(t)',
                     tbl, cols, tbl) into row_out using (cur || patch), rid;
    else
      row_out := cur;
    end if;

    results := results || jsonb_build_object(
      'id', rid, 'table', tbl,
      'status', case when conflicts = '{}'::jsonb then 'ok' else 'conflict' end,
      'row', row_out, 'conflicts', conflicts);
  end loop;
  return results;
end;
$$;
revoke all on function public.canvas_push(jsonb) from public, anon;
grant execute on function public.canvas_push(jsonb) to authenticated;

-- Account deletion helper for The Daily Canvas only (Write.ai data is untouched).
create or replace function public.canvas_delete_my_data()
returns void language plpgsql security invoker set search_path = '' as $$
declare t text;
begin
  foreach t in array array['canvas_task_links', 'canvas_task_events', 'canvas_task_placements', 'canvas_ink',
                           'canvas_tasks', 'canvas_recurrences', 'canvas_appointments', 'canvas_journal',
                           'canvas_ideas', 'canvas_notes', 'canvas_exercise', 'canvas_meals', 'canvas_water',
                           'canvas_day_meta', 'canvas_preferences', 'canvas_google_accounts', 'canvas_sync_audit'] loop
    execute format('delete from public.%I where user_id = auth.uid()', t);
  end loop;
end;
$$;
revoke all on function public.canvas_delete_my_data() from public, anon;
grant execute on function public.canvas_delete_my_data() to authenticated;

-- Live updates between devices (safe to re-run).
do $$
declare t text;
begin
  foreach t in array array['canvas_tasks', 'canvas_task_placements', 'canvas_notes', 'canvas_water', 'canvas_ink',
                           'canvas_appointments', 'canvas_preferences'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when undefined_object then null;
    end;
  end loop;
end $$;
