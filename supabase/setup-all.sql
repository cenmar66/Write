-- Write.ai: the whole database in one go (updates 0001 to 0011; 0010 is The Daily Canvas, 0011 is PromptDojo).
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

-- 0011: PromptDojo ---------------------------------------------------------------------
-- PromptDojo: the prompt engineering studio at /dojo.
-- Safe to run more than once. Never deletes data.
--
-- Ownership: every table has user_id (defaults to auth.uid()) and row-level security
-- that limits each signed-in user to their own rows. Policies also check that any row
-- referenced by id (collection, prompt, tag, generation, profile) belongs to the same
-- user, because foreign keys alone don't check ownership.
-- Prompt versions are immutable: no update/delete policy, plus a trigger that blocks
-- updates. Version numbers are assigned by the database under a row lock.
-- See docs/dojo/DATABASE.md.

-- Helper: does the current user own row `rid` in `tbl`? (null id counts as owned)
create or replace function public.dojo_owns(tbl regclass, rid uuid)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare ok boolean;
begin
  if rid is null then return true; end if;
  execute format('select exists (select 1 from %s where id = $1 and user_id = auth.uid())', tbl) into ok using rid;
  return ok;
end;
$$;

create or replace function public.dojo_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- Profiles ------------------------------------------------------------------------------
create table if not exists public.dojo_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  tone text not null default '' check (char_length(tone) <= 200),
  field text not null default '' check (char_length(field) <= 200),
  favorite_target text not null default '' check (favorite_target in ('', 'claude', 'chatgpt', 'gemini', 'universal', 'custom')),
  audience text not null default '' check (char_length(audience) <= 300),
  response_format text not null default '' check (char_length(response_format) <= 300),
  language text not null default '' check (char_length(language) <= 60),
  prompt_length text not null default '' check (prompt_length in ('', 'short', 'medium', 'long')),
  custom_instructions text not null default '' check (char_length(custom_instructions) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dojo_profiles_user on public.dojo_profiles (user_id);

-- Preferences (one row per user) -------------------------------------------------------
create table if not exists public.dojo_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  accent text not null default 'teal' check (accent in ('teal', 'indigo', 'plum', 'amber', 'slate', 'forest')),
  text_size text not null default 'md' check (text_size in ('sm', 'md', 'lg')),
  default_target text not null default 'universal' check (default_target in ('claude', 'chatgpt', 'gemini', 'universal', 'custom')),
  custom_target_name text not null default '' check (char_length(custom_target_name) <= 80),
  custom_target_notes text not null default '' check (char_length(custom_target_notes) <= 1000),
  provider text not null default '',
  model text not null default '',
  active_profile_id uuid references public.dojo_profiles on delete set null,
  clarify boolean not null default true,
  retention_days integer not null default 0 check (retention_days between 0 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generation requests + their alternatives -----------------------------------------------
create table if not exists public.dojo_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  request text not null check (char_length(request) <= 8000),
  target_model text not null check (target_model in ('claude', 'chatgpt', 'gemini', 'universal', 'custom')),
  custom_target text not null default '',
  provider text not null,
  model text not null,
  is_mock boolean not null default false,
  meta_prompt_version text not null,
  schema_version text not null,
  profile_id uuid references public.dojo_profiles on delete set null,
  options jsonb not null default '{}'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  -- Validated result minus the alternatives (those live in dojo_alternatives).
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists dojo_generations_user_created on public.dojo_generations (user_id, created_at desc);

create table if not exists public.dojo_alternatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  generation_id uuid not null references public.dojo_generations on delete cascade,
  position smallint not null,
  kind text not null check (kind in ('concise', 'comprehensive', 'creative')),
  title text not null default '',
  approach text not null default '',
  prompt text not null,
  unique (generation_id, kind)
);
create index if not exists dojo_alternatives_generation on public.dojo_alternatives (generation_id);

-- Library -------------------------------------------------------------------------------
create table if not exists public.dojo_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists dojo_collections_name on public.dojo_collections (user_id, lower(name));

create table if not exists public.dojo_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 80),
  collection_id uuid references public.dojo_collections on delete set null,
  target_model text not null check (target_model in ('claude', 'chatgpt', 'gemini', 'universal', 'custom')),
  custom_target text not null default '' check (char_length(custom_target) <= 80),
  favorite boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  source text not null default 'manual' check (source in ('generated', 'alternative', 'analyzer', 'template', 'import', 'manual', 'duplicate', 'lab')),
  generation_id uuid references public.dojo_generations on delete set null,
  current_version_no integer not null default 0,
  current_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dojo_prompts_user_updated on public.dojo_prompts (user_id, updated_at desc);
create index if not exists dojo_prompts_user_target on public.dojo_prompts (user_id, target_model);
create index if not exists dojo_prompts_user_collection on public.dojo_prompts (user_id, collection_id);
create index if not exists dojo_prompts_search on public.dojo_prompts
  using gin (to_tsvector('simple', title || ' ' || description || ' ' || current_content));

create table if not exists public.dojo_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid not null references public.dojo_prompts on delete cascade,
  version_no integer not null,
  content text not null check (char_length(content) <= 60000),
  kind text not null check (kind in ('generated', 'alternative', 'refined', 'edited', 'adapted', 'imported', 'restored', 'analyzed', 'template')),
  instruction text not null default '' check (char_length(instruction) <= 4000),
  parent_version_id uuid references public.dojo_prompt_versions on delete set null,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  unique (prompt_id, version_no)
);
create index if not exists dojo_versions_prompt on public.dojo_prompt_versions (prompt_id, version_no);

create table if not exists public.dojo_refinements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid not null references public.dojo_prompts on delete cascade,
  from_version_id uuid references public.dojo_prompt_versions on delete set null,
  to_version_id uuid not null references public.dojo_prompt_versions on delete cascade,
  action text not null default '',
  instruction text not null default '',
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists dojo_refinements_prompt on public.dojo_refinements (prompt_id);

create table if not exists public.dojo_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);
create unique index if not exists dojo_tags_name on public.dojo_tags (user_id, lower(name));

create table if not exists public.dojo_prompt_tags (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid not null references public.dojo_prompts on delete cascade,
  tag_id uuid not null references public.dojo_tags on delete cascade,
  primary key (prompt_id, tag_id)
);
create index if not exists dojo_prompt_tags_tag on public.dojo_prompt_tags (tag_id);

-- Custom templates ------------------------------------------------------------------------
create table if not exists public.dojo_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 80),
  body text not null check (char_length(body) <= 60000),
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dojo_templates_user on public.dojo_templates (user_id, created_at desc);

-- Testing Lab + Analyzer ------------------------------------------------------------------
create table if not exists public.dojo_test_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid references public.dojo_prompts on delete set null,
  version_id uuid references public.dojo_prompt_versions on delete set null,
  prompt_text text not null,
  variables jsonb not null default '{}'::jsonb,
  provider text not null,
  model text not null,
  is_mock boolean not null default false,
  output text not null,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  latency_ms integer,
  ratings jsonb not null default '[]'::jsonb,
  judge jsonb,
  created_at timestamptz not null default now()
);
create index if not exists dojo_test_runs_user on public.dojo_test_runs (user_id, created_at desc);
create index if not exists dojo_test_runs_prompt on public.dojo_test_runs (prompt_id);

create table if not exists public.dojo_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_text text not null,
  provider text not null,
  model text not null,
  composite integer not null check (composite between 0 and 100),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists dojo_analyses_user on public.dojo_analyses (user_id, created_at desc);

-- Usage + optional credits ------------------------------------------------------------------
-- Provider usage: one row per AI call. No prompt text is stored here.
create table if not exists public.dojo_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(12, 6),
  created_at timestamptz not null default now()
);
create index if not exists dojo_usage_user_created on public.dojo_usage (user_id, created_at);

-- Optional credit ledger for a future paid plan. Append-only; only the server (service
-- role, e.g. a verified Stripe webhook) writes it. idempotency_key makes every credit
-- change safe to retry. Unused until billing is switched on.
create table if not exists public.dojo_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('grant', 'purchase', 'subscription', 'usage', 'refund', 'adjustment')),
  idempotency_key text not null unique,
  external_ref text,
  created_at timestamptz not null default now()
);
create index if not exists dojo_credit_ledger_user on public.dojo_credit_ledger (user_id, created_at);

-- Triggers --------------------------------------------------------------------------------
drop trigger if exists dojo_profiles_touch on public.dojo_profiles;
create trigger dojo_profiles_touch before insert or update on public.dojo_profiles for each row execute function public.dojo_touch();
drop trigger if exists dojo_preferences_touch on public.dojo_preferences;
create trigger dojo_preferences_touch before insert or update on public.dojo_preferences for each row execute function public.dojo_touch();
drop trigger if exists dojo_prompts_touch on public.dojo_prompts;
create trigger dojo_prompts_touch before insert or update on public.dojo_prompts for each row execute function public.dojo_touch();

-- Versions: number assigned under a lock on the prompt; prompt's current copy updated.
create or replace function public.dojo_version_insert()
returns trigger language plpgsql set search_path = '' as $$
declare cur integer;
begin
  select current_version_no into cur from public.dojo_prompts where id = new.prompt_id for update;
  if not found then raise exception 'Prompt not found'; end if;
  new.version_no := cur + 1;
  new.created_at := now();
  update public.dojo_prompts
     set current_version_no = new.version_no, current_content = new.content
   where id = new.prompt_id;
  return new;
end;
$$;
drop trigger if exists dojo_version_insert on public.dojo_prompt_versions;
create trigger dojo_version_insert before insert on public.dojo_prompt_versions for each row execute function public.dojo_version_insert();

create or replace function public.dojo_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end;
$$;
-- Versions may only lose their parent link (when the parent is deleted along with the prompt).
create or replace function public.dojo_version_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.parent_version_id is null
     and (new.id, new.user_id, new.prompt_id, new.version_no, new.content, new.kind, new.instruction, new.created_at)
         is not distinct from (old.id, old.user_id, old.prompt_id, old.version_no, old.content, old.kind, old.instruction, old.created_at) then
    return new;
  end if;
  raise exception 'Prompt versions are immutable';
end;
$$;
drop trigger if exists dojo_versions_immutable on public.dojo_prompt_versions;
create trigger dojo_versions_immutable before update on public.dojo_prompt_versions for each row execute function public.dojo_version_immutable();
drop trigger if exists dojo_ledger_immutable on public.dojo_credit_ledger;
create trigger dojo_ledger_immutable before update on public.dojo_credit_ledger for each row execute function public.dojo_immutable();

-- Row-level security ------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dojo_profiles', 'dojo_preferences', 'dojo_generations', 'dojo_alternatives', 'dojo_collections',
    'dojo_prompts', 'dojo_prompt_versions', 'dojo_refinements', 'dojo_tags', 'dojo_prompt_tags', 'dojo_templates',
    'dojo_test_runs', 'dojo_analyses', 'dojo_usage', 'dojo_credit_ledger']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows: read" on public.%I', t);
    execute format('create policy "own rows: read" on public.%I for select to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- Full access to your own rows, for plain tables.
do $$
declare t text;
begin
  foreach t in array array['dojo_profiles', 'dojo_collections', 'dojo_tags', 'dojo_templates', 'dojo_analyses']
  loop
    execute format('drop policy if exists "own rows: write" on public.%I', t);
    execute format('create policy "own rows: write" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "own rows: write" on public.dojo_preferences;
create policy "own rows: write" on public.dojo_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.dojo_owns('public.dojo_profiles', active_profile_id));

drop policy if exists "own rows: write" on public.dojo_generations;
create policy "own rows: write" on public.dojo_generations for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.dojo_owns('public.dojo_profiles', profile_id));

drop policy if exists "own rows: write" on public.dojo_alternatives;
create policy "own rows: write" on public.dojo_alternatives for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.dojo_owns('public.dojo_generations', generation_id));

drop policy if exists "own rows: write" on public.dojo_prompts;
create policy "own rows: write" on public.dojo_prompts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and public.dojo_owns('public.dojo_collections', collection_id)
    and public.dojo_owns('public.dojo_generations', generation_id));

-- Versions: insert + read only (immutable).
drop policy if exists "own rows: insert" on public.dojo_prompt_versions;
create policy "own rows: insert" on public.dojo_prompt_versions for insert to authenticated
  with check (user_id = auth.uid()
    and public.dojo_owns('public.dojo_prompts', prompt_id)
    and public.dojo_owns('public.dojo_prompt_versions', parent_version_id));

drop policy if exists "own rows: insert" on public.dojo_refinements;
create policy "own rows: insert" on public.dojo_refinements for insert to authenticated
  with check (user_id = auth.uid()
    and public.dojo_owns('public.dojo_prompts', prompt_id)
    and public.dojo_owns('public.dojo_prompt_versions', to_version_id)
    and public.dojo_owns('public.dojo_prompt_versions', from_version_id));

drop policy if exists "own rows: write" on public.dojo_prompt_tags;
create policy "own rows: write" on public.dojo_prompt_tags for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.dojo_owns('public.dojo_prompts', prompt_id) and public.dojo_owns('public.dojo_tags', tag_id));

drop policy if exists "own rows: write" on public.dojo_test_runs;
create policy "own rows: write" on public.dojo_test_runs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.dojo_owns('public.dojo_prompts', prompt_id) and public.dojo_owns('public.dojo_prompt_versions', version_id));

-- Usage: insert and read your own; delete only through "delete my data".
drop policy if exists "own rows: insert" on public.dojo_usage;
create policy "own rows: insert" on public.dojo_usage for insert to authenticated with check (user_id = auth.uid());
-- Credit ledger: read-only for users (written by the service role).

-- Data retention and account deletion -------------------------------------------------------
create or replace function public.dojo_apply_retention(days integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer := 0; c integer;
begin
  if days is null or days <= 0 then return 0; end if;
  delete from public.dojo_generations where user_id = auth.uid() and created_at < now() - make_interval(days => days);
  get diagnostics c = row_count; n := n + c;
  delete from public.dojo_analyses where user_id = auth.uid() and created_at < now() - make_interval(days => days);
  get diagnostics c = row_count; n := n + c;
  delete from public.dojo_test_runs where user_id = auth.uid() and created_at < now() - make_interval(days => days);
  get diagnostics c = row_count; n := n + c;
  return n;
end;
$$;

-- Deletes every PromptDojo row belonging to the caller (including usage and credits).
create or replace function public.dojo_delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  delete from public.dojo_prompt_tags where user_id = me;
  delete from public.dojo_refinements where user_id = me;
  delete from public.dojo_test_runs where user_id = me;
  delete from public.dojo_prompts where user_id = me; -- versions cascade
  delete from public.dojo_tags where user_id = me;
  delete from public.dojo_collections where user_id = me;
  delete from public.dojo_alternatives where user_id = me;
  delete from public.dojo_generations where user_id = me;
  delete from public.dojo_templates where user_id = me;
  delete from public.dojo_analyses where user_id = me;
  delete from public.dojo_preferences where user_id = me;
  delete from public.dojo_profiles where user_id = me;
  delete from public.dojo_usage where user_id = me;
  delete from public.dojo_credit_ledger where user_id = me;
end;
$$;
revoke all on function public.dojo_delete_my_data() from public;
grant execute on function public.dojo_delete_my_data() to authenticated;

-- Credit balance (0 until billing exists).
create or replace function public.dojo_credit_balance()
returns integer language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(delta), 0)::integer from public.dojo_credit_ledger where user_id = auth.uid();
$$;
