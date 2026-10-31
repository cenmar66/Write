-- Write.ai: the whole database in one go (updates 0001 to 0011; 0010 is The Daily Canvas, 0011 is InboxPilot).
-- Safe to run any number of times: it only adds what's missing and never deletes your data.
-- Paste all of it into Supabase > SQL Editor > New query, then click Run.

-- 0001: only the owner can sign up ------------------------------------------
create or replace function public.only_owner_can_sign_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) <> 'cenmarf@gmail.com' then
    raise exception 'Sign-ups are closed.';
  end if;
  return new;
end;
$$;
drop trigger if exists only_owner_can_sign_up on auth.users;
create trigger only_owner_can_sign_up before insert on auth.users
  for each row execute function public.only_owner_can_sign_up();

-- 0002: documents, folders, history, chat ------------------------------------
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  folder_id uuid references public.folders on delete set null,
  title text not null default '',
  content jsonb not null default '{}'::jsonb,
  content_text text not null default '',
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_user_updated on public.documents (user_id, updated_at desc);
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  label text not null,
  title text not null default '',
  content jsonb not null,
  content_text text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists document_versions_doc on public.document_versions (document_id, created_at desc);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_doc on public.chat_messages (document_id, created_at);

-- 0003: settings ---------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  ai_model text,
  updated_at timestamptz not null default now()
);

-- 0004: writing samples and voice ----------------------------------------------
create table if not exists public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '',
  content text not null,
  source text not null default 'paste' check (source in ('paste', 'upload', 'document')),
  word_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists voice_samples_user on public.voice_samples (user_id, created_at desc);
alter table public.user_settings
  add column if not exists voice_enabled boolean not null default true,
  add column if not exists voice_profile jsonb,
  add column if not exists voice_profile_updated_at timestamptz;

-- 0005: social posts and templates ---------------------------------------------
create table if not exists public.post_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  category text not null default 'mine',
  description text not null default '',
  structure text not null,
  example text not null default '',
  format text not null default 'single' check (format in ('single', 'thread', 'carousel')),
  created_at timestamptz not null default now()
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null check (platform in ('linkedin', 'x', 'threads', 'facebook', 'instagram')),
  format text not null default 'single' check (format in ('single', 'thread', 'carousel')),
  idea text not null default '',
  content text not null default '',
  parts jsonb not null default '[]'::jsonb,
  hashtags jsonb not null default '[]'::jsonb,
  template_key text,
  source_document_id uuid references public.documents on delete set null,
  status text not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  external_url text,
  error text,
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_user_status on public.posts (user_id, status, updated_at desc);
create index if not exists posts_scheduled on public.posts (status, scheduled_at) where status = 'scheduled';

-- 0006: connected accounts, publishing, media, brand kit -----------------------
create table if not exists public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null check (platform in ('linkedin', 'facebook', 'instagram', 'threads', 'substack')),
  account_id text not null default '',
  account_name text not null default '',
  avatar_url text,
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'connected' check (status in ('connected', 'error', 'expired')),
  last_error text,
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed'));
alter table public.user_settings add column if not exists brand_kit jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 262144000,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;
drop policy if exists "owner uploads" on storage.objects;
drop policy if exists "owner updates" on storage.objects;
drop policy if exists "owner deletes" on storage.objects;
create policy "owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner updates" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 0007: writing styles and Trash ------------------------------------------------
create table if not exists public.writing_styles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  description text not null default '',
  profile jsonb,
  profile_updated_at timestamptz,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists writing_styles_one_default on public.writing_styles (user_id) where is_default;
alter table public.voice_samples add column if not exists style_id uuid references public.writing_styles on delete cascade;
alter table public.documents add column if not exists style_id uuid references public.writing_styles on delete set null;
alter table public.documents add column if not exists deleted_at timestamptz;
create index if not exists documents_user_deleted on public.documents (user_id, deleted_at);

insert into public.writing_styles (user_id, name, profile, profile_updated_at, is_default)
select u.user_id, 'My voice', u.voice_profile, u.voice_profile_updated_at, true
from public.user_settings u
where u.voice_profile is not null
  and not exists (select 1 from public.writing_styles w where w.user_id = u.user_id and w.is_default);
insert into public.writing_styles (user_id, name, is_default)
select distinct s.user_id, 'My voice', true
from public.voice_samples s
where not exists (select 1 from public.writing_styles w where w.user_id = s.user_id and w.is_default);
update public.voice_samples s set style_id = w.id
from public.writing_styles w
where w.user_id = s.user_id and w.is_default and s.style_id is null;

-- 0008: access codes for your AI assistant ---------------------------------------
create table if not exists public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scope text not null default 'read' check (scope in ('read', 'write')),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists access_tokens_user on public.access_tokens (user_id, created_at desc);


-- 0009: your own prompt packs ---------------------------------------------------
create table if not exists public.prompt_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  emoji text not null default '✨',
  description text not null default '',
  prompts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists prompt_packs_user on public.prompt_packs (user_id, created_at desc);

-- Privacy: every table is "owner only" ------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['folders', 'documents', 'document_versions', 'chat_messages', 'user_settings',
                           'voice_samples', 'post_templates', 'posts', 'connected_accounts', 'writing_styles',
                           'access_tokens', 'prompt_packs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;


-- 0010: The Daily Canvas ------------------------------------------------------------
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

-- 0011: InboxPilot AI ------------------------------------------------------------
-- Safe to run more than once. Never deletes data.
--
-- Design notes (full write-up: docs/inbox/DATABASE.md)
--  * Tenancy: every row belongs to a workspace. Access is decided by membership
--    (ip_is_member), enforced with row-level security on every table.
--  * ip_provider_tokens has RLS on and NO policies: only the server's service-role
--    key can read it. Tokens are AES-256-GCM encrypted before they get here.
--  * Dedupe is done with unique keys, so a retried sync or job never duplicates:
--    messages (account, provider id), threads (account, provider thread id),
--    follow-ups / tasks / reminders (workspace, dedupe_key), jobs (idempotency_key).
--  * Disconnecting an account deletes everything fetched from it (FK cascades).

-- ---------------------------------------------------------------- workspaces
create table if not exists public.ip_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  kind text not null default 'personal' check (kind in ('personal', 'business', 'team')),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  is_demo boolean not null default false,
  color text not null default 'blue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ip_memberships (
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists ip_memberships_user on public.ip_memberships (user_id);

create or replace function public.ip_is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ip_memberships m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function public.ip_is_admin(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ip_memberships m
                 where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;

-- The creator of a workspace becomes its owner.
create or replace function public.ip_workspace_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ip_memberships (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists ip_workspace_owner on public.ip_workspaces;
create trigger ip_workspace_owner after insert on public.ip_workspaces
  for each row execute function public.ip_workspace_owner();

-- ---------------------------------------------------------------- per-user preferences
create table if not exists public.ip_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  automation_mode text not null default 'observe' check (automation_mode in ('observe', 'assisted', 'automatic')),
  -- What the AI may read: metadata (headers only), snippet (headers + Gmail's preview), full (bodies, trimmed).
  ai_content text not null default 'metadata' check (ai_content in ('metadata', 'snippet', 'full')),
  ai_external boolean not null default false,          -- may content go to an external AI provider at all?
  ai_provider text not null default 'anthropic' check (ai_provider in ('anthropic', 'openai')),
  ai_drafts boolean not null default true,
  ai_monthly_request_cap integer not null default 2000 check (ai_monthly_request_cap between 0 and 100000),
  body_retention_days integer not null default 14 check (body_retention_days between 0 and 365),
  briefing jsonb not null default '{"morning":"08:00","midday":null,"evening":null,"mode":"concise","channels":["in_app"]}'::jsonb,
  focus jsonb not null default '{"enabled":false,"windows":[],"allow_vip":true,"allow_critical":true}'::jsonb,
  followup_days integer not null default 3 check (followup_days between 1 and 60),
  writing_profile jsonb not null default '{}'::jsonb,
  learn_from_sent boolean not null default false,
  onboarding jsonb not null default '{}'::jsonb,
  ui jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- accounts + tokens
create table if not exists public.ip_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook', 'demo')),
  email text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'syncing', 'needs_reconnect', 'paused', 'error')),
  scopes text not null default '',
  sync_cursor text,                  -- Gmail historyId
  sync_state jsonb not null default '{}'::jsonb, -- initial import progress {phase,pageToken,fetched,target}
  last_sync_at timestamptz,
  last_error text,
  automation_mode text check (automation_mode in ('observe', 'assisted', 'automatic')), -- null = use preference
  settings jsonb not null default '{}'::jsonb, -- {label_sync:false, ai_content:null, notify:{...}}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, email)
);

create table if not exists public.ip_provider_tokens (
  account_id uuid primary key references public.ip_accounts on delete cascade,
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- mail
create table if not exists public.ip_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid not null references public.ip_accounts on delete cascade,
  provider_thread_id text not null,
  subject text not null default '',
  last_message_at timestamptz,
  message_count integer not null default 0,
  participants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_thread_id)
);

create table if not exists public.ip_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid not null references public.ip_accounts on delete cascade,
  thread_id uuid references public.ip_threads on delete set null,
  provider_message_id text not null,
  provider_thread_id text not null,
  rfc_message_id text,
  in_reply_to text,
  from_email text not null default '',
  from_name text not null default '',
  to_addrs jsonb not null default '[]'::jsonb,
  cc_addrs jsonb not null default '[]'::jsonb,
  reply_to text,
  subject text not null default '',
  snippet text not null default '',
  body_text text,                      -- only kept when content mode allows, trimmed, expires
  body_expires_at timestamptz,
  received_at timestamptz not null,
  label_ids text[] not null default '{}',
  is_unread boolean not null default false,
  is_starred boolean not null default false,
  is_sent boolean not null default false, -- written by the account owner
  in_inbox boolean not null default true,
  has_attachments boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  list_id text,
  list_unsubscribe text,
  auto_submitted text,
  precedence text,
  signals jsonb not null default '{}'::jsonb, -- header-derived flags (bulk, noreply, auto-reply, dsn...)
  category text,                         -- effective virtual category (user's choice or the classifier's)
  importance text,                       -- effective importance (denormalized from ip_classifications for fast lists)
  priority_score integer not null default 0,
  snoozed_until timestamptz,
  snooze_until_reply boolean not null default false,
  done_at timestamptz,                   -- handled in InboxPilot (doesn't touch Gmail)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_message_id)
);
create index if not exists ip_messages_ws_received on public.ip_messages (workspace_id, received_at desc);
create index if not exists ip_messages_thread on public.ip_messages (thread_id, received_at);
create index if not exists ip_messages_from on public.ip_messages (workspace_id, from_email);
create index if not exists ip_messages_priority on public.ip_messages (workspace_id, priority_score desc, received_at desc);
create index if not exists ip_messages_category on public.ip_messages (workspace_id, category, received_at desc);

create table if not exists public.ip_classifications (
  message_id uuid primary key references public.ip_messages on delete cascade,
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  importance text not null check (importance in ('critical', 'high', 'normal', 'low')),
  msg_type text not null,
  action text not null check (action in ('reply_needed', 'task_required', 'review_needed', 'waiting', 'informational', 'no_action')),
  time_sensitivity text not null check (time_sensitivity in ('immediate', 'today', 'this_week', 'flexible', 'unknown')),
  category text not null,
  priority_score integer not null check (priority_score between 0 and 100),
  confidence real not null check (confidence between 0 and 1),
  explanation text not null default '',
  factors jsonb not null default '[]'::jsonb,
  source text not null check (source in ('rules', 'heuristic', 'ai', 'user')),
  model text,
  injection_flag boolean not null default false,
  user_corrected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ip_class_ws on public.ip_classifications (workspace_id, priority_score desc);

create table if not exists public.ip_classification_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  message_id uuid references public.ip_messages on delete set null,
  sender_email text not null,
  field text not null check (field in ('importance', 'msg_type', 'action', 'category')),
  old_value text,
  new_value text not null,
  created_at timestamptz not null default now()
);
create index if not exists ip_feedback_sender on public.ip_classification_feedback (workspace_id, sender_email);

-- Sender Control Center + learned per-sender history (scoped to one workspace).
create table if not exists public.ip_senders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  email text not null,
  domain text not null,
  display_name text not null default '',
  is_vip boolean not null default false,
  always_priority boolean not null default false,
  suppress_notifications boolean not null default false,
  screening text not null default 'unknown' check (screening in ('unknown', 'approved', 'screened_out')),
  default_category text,
  blocked boolean not null default false,  -- InboxPilot hides; never deletes, never touches Gmail spam
  received_count integer not null default 0,
  replied_count integer not null default 0,
  sent_to_count integer not null default 0,
  first_seen timestamptz,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.ip_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  key text not null,
  name text not null check (length(name) between 1 and 40),
  icon text not null default 'tag',
  position integer not null default 0,
  system boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);

-- ---------------------------------------------------------------- rules
create table if not exists public.ip_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade, -- null = all accounts in workspace
  name text not null check (length(name) between 1 and 120),
  enabled boolean not null default true,
  priority integer not null default 100,
  match text not null default 'all' check (match in ('all', 'any')),
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  stop_processing boolean not null default false,
  origin text not null default 'user' check (origin in ('user', 'suggested', 'template')),
  confirmed_broad boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ip_rule_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  rule_id uuid references public.ip_rules on delete set null,
  rule_name text not null default '',
  message_id uuid references public.ip_messages on delete cascade,
  action jsonb not null,
  status text not null check (status in ('suggested', 'applied', 'approved', 'dismissed', 'undone', 'failed')),
  provider_applied boolean not null default false,
  undo jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id, message_id, action)
);
create index if not exists ip_exec_ws on public.ip_rule_executions (workspace_id, created_at desc);

-- ---------------------------------------------------------------- productivity
create table if not exists public.ip_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  message_id uuid references public.ip_messages on delete set null,
  source_ref jsonb,                 -- {provider, provider_message_id, thread, subject, from} survives cache pruning
  title text not null check (length(title) between 1 and 300),
  description text not null default '',
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  project text,
  assignee text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  notes text not null default '',
  provenance jsonb not null default '{}'::jsonb, -- field -> 'explicit' | 'inferred' | 'user'
  external_refs jsonb not null default '{}'::jsonb, -- {todoist: id, canvas: id}
  dedupe_key text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);

create table if not exists public.ip_followups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  thread_id uuid references public.ip_threads on delete cascade,
  message_id uuid references public.ip_messages on delete cascade,
  kind text not null check (kind in ('i_owe', 'they_owe', 'commitment')),
  title text not null,
  counterpart text not null default '',
  due_at timestamptz,
  due_explicit boolean not null default false,
  evidence text not null default '',   -- the exact sentence that triggered it
  confidence real not null default 0.5,
  detected_by text not null default 'rule' check (detected_by in ('rule', 'ai', 'user')),
  status text not null default 'open' check (status in ('open', 'done', 'snoozed', 'dismissed')),
  snoozed_until timestamptz,
  tracking_disabled boolean not null default false,
  assignee text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);

create table if not exists public.ip_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  target_type text not null check (target_type in ('message', 'task', 'followup')),
  target_id uuid not null,
  remind_at timestamptz not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'fired', 'cancelled')),
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);

create table if not exists public.ip_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_ids uuid[] not null default '{}',
  slot text not null check (slot in ('morning', 'midday', 'evening', 'on_demand')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  content jsonb not null,             -- sections -> items, each with source refs
  summary_source text not null default 'deterministic' check (summary_source in ('deterministic', 'ai')),
  model text,
  created_at timestamptz not null default now()
);
create index if not exists ip_briefings_user on public.ip_briefings (user_id, created_at desc);

create table if not exists public.ip_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid not null references public.ip_accounts on delete cascade,
  message_id uuid references public.ip_messages on delete set null,
  provider_thread_id text,
  to_addrs jsonb not null default '[]'::jsonb,
  cc_addrs jsonb not null default '[]'::jsonb,
  bcc_addrs jsonb not null default '[]'::jsonb,
  subject text not null default '',
  body text not null default '',
  language text not null default 'en',
  ai_generated boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'discarded', 'failed')),
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ip_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  channels jsonb not null default '["in_app"]'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  quiet boolean not null default false,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (workspace_id, account_id)
);

-- ---------------------------------------------------------------- operations
create table if not exists public.ip_audit_events (
  id bigserial primary key,
  workspace_id uuid references public.ip_workspaces on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete set null,
  actor text not null check (actor in ('user', 'system', 'ai', 'rule', 'assistant')),
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ip_audit_ws on public.ip_audit_events (workspace_id, created_at desc);

create table if not exists public.ip_ai_usage (
  id bigserial primary key,
  workspace_id uuid references public.ip_workspaces on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  cached boolean not null default false,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ip_ai_usage_user on public.ip_ai_usage (user_id, created_at desc);

create table if not exists public.ip_subscription_entitlements (
  workspace_id uuid primary key references public.ip_workspaces on delete cascade,
  plan text not null default 'dev' check (plan in ('personal', 'professional', 'team', 'dev')),
  source text not null default 'dev' check (source in ('dev', 'stripe', 'manual')),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled')),
  overrides jsonb not null default '{}'::jsonb,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);

-- Durable background jobs: retried with backoff, idempotent by key, claimed with SKIP LOCKED.
create table if not exists public.ip_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  kind text not null check (kind in ('sync', 'classify', 'briefing', 'followups', 'prune')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ip_jobs_ready on public.ip_jobs (status, run_after);

-- Claim up to n ready jobs (queued and due, or running with an expired lock).
create or replace function public.ip_claim_jobs(n integer, lease_seconds integer default 240)
returns setof public.ip_jobs language plpgsql set search_path = '' as $$
begin
  return query
  update public.ip_jobs j set status = 'running', attempts = j.attempts + 1,
         locked_until = now() + make_interval(secs => lease_seconds), updated_at = now()
  where j.id in (
    select id from public.ip_jobs
    where (status = 'queued' and run_after <= now())
       or (status = 'running' and locked_until < now())
    order by run_after
    limit greatest(n, 0)
    for update skip locked
  )
  returning j.*;
end;
$$;

-- Finish a job; failures back off exponentially (30s, 2m, 8m, ...) until max_attempts.
create or replace function public.ip_finish_job(job uuid, ok boolean, err text default null)
returns void language plpgsql set search_path = '' as $$
begin
  if ok then
    update public.ip_jobs set status = 'done', locked_until = null, last_error = null, updated_at = now() where id = job;
  else
    update public.ip_jobs set
      status = case when attempts >= max_attempts then 'dead' else 'queued' end,
      run_after = now() + make_interval(secs => 30 * power(4, least(attempts - 1, 6))::int),
      locked_until = null, last_error = left(err, 2000), updated_at = now()
    where id = job;
  end if;
end;
$$;

-- ---------------------------------------------------------------- updated_at
create or replace function public.ip_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
do $$
declare t text;
begin
  foreach t in array array['ip_workspaces','ip_preferences','ip_accounts','ip_threads','ip_messages','ip_classifications',
    'ip_senders','ip_rules','ip_rule_executions','ip_tasks','ip_followups','ip_drafts','ip_jobs','ip_subscription_entitlements']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ip_touch()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- row-level security
alter table public.ip_workspaces enable row level security;
alter table public.ip_memberships enable row level security;
alter table public.ip_preferences enable row level security;
alter table public.ip_provider_tokens enable row level security; -- no policies: service role only
alter table public.ip_briefings enable row level security;

drop policy if exists ip_ws_select on public.ip_workspaces;
create policy ip_ws_select on public.ip_workspaces for select using (public.ip_is_member(id) or owner_id = auth.uid());
drop policy if exists ip_ws_insert on public.ip_workspaces;
create policy ip_ws_insert on public.ip_workspaces for insert with check (owner_id = auth.uid());
drop policy if exists ip_ws_update on public.ip_workspaces;
create policy ip_ws_update on public.ip_workspaces for update using (public.ip_is_admin(id)) with check (public.ip_is_admin(id));
drop policy if exists ip_ws_delete on public.ip_workspaces;
create policy ip_ws_delete on public.ip_workspaces for delete using (owner_id = auth.uid());

drop policy if exists ip_mem_select on public.ip_memberships;
create policy ip_mem_select on public.ip_memberships for select using (public.ip_is_member(workspace_id));
drop policy if exists ip_mem_write on public.ip_memberships;
create policy ip_mem_write on public.ip_memberships for all using (public.ip_is_admin(workspace_id)) with check (public.ip_is_admin(workspace_id));

drop policy if exists ip_prefs_own on public.ip_preferences;
create policy ip_prefs_own on public.ip_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ip_brief_own on public.ip_briefings;
create policy ip_brief_own on public.ip_briefings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every workspace-scoped table: members only, both for reading and writing.
do $$
declare t text;
begin
  foreach t in array array['ip_accounts','ip_threads','ip_messages','ip_classifications','ip_classification_feedback',
    'ip_senders','ip_categories','ip_rules','ip_rule_executions','ip_tasks','ip_followups','ip_reminders','ip_drafts',
    'ip_notification_preferences','ip_ai_usage','ip_jobs','ip_subscription_entitlements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('create policy %I on public.%I for all using (public.ip_is_member(workspace_id)) with check (public.ip_is_member(workspace_id))', t || '_member', t);
  end loop;
end $$;

-- Audit log: members can read and append, never edit or delete.
alter table public.ip_audit_events enable row level security;
drop policy if exists ip_audit_read on public.ip_audit_events;
create policy ip_audit_read on public.ip_audit_events for select using (public.ip_is_member(workspace_id) or (workspace_id is null and user_id = auth.uid()));
drop policy if exists ip_audit_insert on public.ip_audit_events;
create policy ip_audit_insert on public.ip_audit_events for insert with check (public.ip_is_member(workspace_id) or (workspace_id is null and user_id = auth.uid()));

-- Entitlements are granted by the server (billing), not by the user; members may only read.
drop policy if exists ip_subscription_entitlements_member on public.ip_subscription_entitlements;
drop policy if exists ip_ent_read on public.ip_subscription_entitlements;
create policy ip_ent_read on public.ip_subscription_entitlements for select using (public.ip_is_member(workspace_id));

grant execute on function public.ip_is_member(uuid), public.ip_is_admin(uuid) to authenticated;
revoke all on public.ip_provider_tokens from anon, authenticated;

-- ---------------------------------------------------------------- deletion
-- Deletes every InboxPilot row the caller owns (workspaces they own cascade everything).
create or replace function public.ip_delete_my_data()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.ip_workspaces where owner_id = auth.uid();
  delete from public.ip_briefings where user_id = auth.uid();
  delete from public.ip_preferences where user_id = auth.uid();
end;
$$;
grant execute on function public.ip_delete_my_data() to authenticated;
