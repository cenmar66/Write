-- PromptSatori: the prompt engineering studio at /satori.
-- Safe to run more than once. Never deletes data.
--
-- Ownership: every table has user_id (defaults to auth.uid()) and row-level security
-- that limits each signed-in user to their own rows. Policies also check that any row
-- referenced by id (collection, prompt, tag, generation, profile) belongs to the same
-- user, because foreign keys alone don't check ownership.
-- Prompt versions are immutable: no update/delete policy, plus a trigger that blocks
-- updates. Version numbers are assigned by the database under a row lock.
-- See docs/satori/DATABASE.md.

-- Helper: does the current user own row `rid` in `tbl`? (null id counts as owned)
create or replace function public.satori_owns(tbl regclass, rid uuid)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare ok boolean;
begin
  if rid is null then return true; end if;
  execute format('select exists (select 1 from %s where id = $1 and user_id = auth.uid())', tbl) into ok using rid;
  return ok;
end;
$$;

create or replace function public.satori_touch()
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
create table if not exists public.satori_profiles (
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
create index if not exists satori_profiles_user on public.satori_profiles (user_id);

-- Preferences (one row per user) -------------------------------------------------------
create table if not exists public.satori_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  accent text not null default 'teal' check (accent in ('teal', 'indigo', 'plum', 'amber', 'slate', 'forest')),
  text_size text not null default 'md' check (text_size in ('sm', 'md', 'lg')),
  default_target text not null default 'universal' check (default_target in ('claude', 'chatgpt', 'gemini', 'universal', 'custom')),
  custom_target_name text not null default '' check (char_length(custom_target_name) <= 80),
  custom_target_notes text not null default '' check (char_length(custom_target_notes) <= 1000),
  provider text not null default '',
  model text not null default '',
  active_profile_id uuid references public.satori_profiles on delete set null,
  clarify boolean not null default true,
  retention_days integer not null default 0 check (retention_days between 0 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generation requests + their alternatives -----------------------------------------------
create table if not exists public.satori_generations (
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
  profile_id uuid references public.satori_profiles on delete set null,
  options jsonb not null default '{}'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  -- Validated result minus the alternatives (those live in satori_alternatives).
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists satori_generations_user_created on public.satori_generations (user_id, created_at desc);

create table if not exists public.satori_alternatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  generation_id uuid not null references public.satori_generations on delete cascade,
  position smallint not null,
  kind text not null check (kind in ('concise', 'comprehensive', 'creative')),
  title text not null default '',
  approach text not null default '',
  prompt text not null,
  unique (generation_id, kind)
);
create index if not exists satori_alternatives_generation on public.satori_alternatives (generation_id);

-- Library -------------------------------------------------------------------------------
create table if not exists public.satori_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index if not exists satori_collections_name on public.satori_collections (user_id, lower(name));

create table if not exists public.satori_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 80),
  collection_id uuid references public.satori_collections on delete set null,
  target_model text not null check (target_model in ('claude', 'chatgpt', 'gemini', 'universal', 'custom')),
  custom_target text not null default '' check (char_length(custom_target) <= 80),
  favorite boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  source text not null default 'manual' check (source in ('generated', 'alternative', 'analyzer', 'template', 'import', 'manual', 'duplicate', 'lab')),
  generation_id uuid references public.satori_generations on delete set null,
  current_version_no integer not null default 0,
  current_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists satori_prompts_user_updated on public.satori_prompts (user_id, updated_at desc);
create index if not exists satori_prompts_user_target on public.satori_prompts (user_id, target_model);
create index if not exists satori_prompts_user_collection on public.satori_prompts (user_id, collection_id);
create index if not exists satori_prompts_search on public.satori_prompts
  using gin (to_tsvector('simple', title || ' ' || description || ' ' || current_content));

create table if not exists public.satori_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid not null references public.satori_prompts on delete cascade,
  version_no integer not null,
  content text not null check (char_length(content) <= 60000),
  kind text not null check (kind in ('generated', 'alternative', 'refined', 'edited', 'adapted', 'imported', 'restored', 'analyzed', 'template')),
  instruction text not null default '' check (char_length(instruction) <= 4000),
  parent_version_id uuid references public.satori_prompt_versions on delete set null,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  unique (prompt_id, version_no)
);
create index if not exists satori_versions_prompt on public.satori_prompt_versions (prompt_id, version_no);

create table if not exists public.satori_refinements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid not null references public.satori_prompts on delete cascade,
  from_version_id uuid references public.satori_prompt_versions on delete set null,
  to_version_id uuid not null references public.satori_prompt_versions on delete cascade,
  action text not null default '',
  instruction text not null default '',
  provider text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists satori_refinements_prompt on public.satori_refinements (prompt_id);

create table if not exists public.satori_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);
create unique index if not exists satori_tags_name on public.satori_tags (user_id, lower(name));

create table if not exists public.satori_prompt_tags (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid not null references public.satori_prompts on delete cascade,
  tag_id uuid not null references public.satori_tags on delete cascade,
  primary key (prompt_id, tag_id)
);
create index if not exists satori_prompt_tags_tag on public.satori_prompt_tags (tag_id);

-- Custom templates ------------------------------------------------------------------------
create table if not exists public.satori_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default '' check (char_length(category) <= 80),
  body text not null check (char_length(body) <= 60000),
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists satori_templates_user on public.satori_templates (user_id, created_at desc);

-- Testing Lab + Analyzer ------------------------------------------------------------------
create table if not exists public.satori_test_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_id uuid references public.satori_prompts on delete set null,
  version_id uuid references public.satori_prompt_versions on delete set null,
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
create index if not exists satori_test_runs_user on public.satori_test_runs (user_id, created_at desc);
create index if not exists satori_test_runs_prompt on public.satori_test_runs (prompt_id);

create table if not exists public.satori_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  prompt_text text not null,
  provider text not null,
  model text not null,
  composite integer not null check (composite between 0 and 100),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists satori_analyses_user on public.satori_analyses (user_id, created_at desc);

-- Usage + optional credits ------------------------------------------------------------------
-- Provider usage: one row per AI call. No prompt text is stored here.
create table if not exists public.satori_usage (
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
create index if not exists satori_usage_user_created on public.satori_usage (user_id, created_at);

-- Optional credit ledger for a future paid plan. Append-only; only the server (service
-- role, e.g. a verified Stripe webhook) writes it. idempotency_key makes every credit
-- change safe to retry. Unused until billing is switched on.
create table if not exists public.satori_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('grant', 'purchase', 'subscription', 'usage', 'refund', 'adjustment')),
  idempotency_key text not null unique,
  external_ref text,
  created_at timestamptz not null default now()
);
create index if not exists satori_credit_ledger_user on public.satori_credit_ledger (user_id, created_at);

-- Triggers --------------------------------------------------------------------------------
drop trigger if exists satori_profiles_touch on public.satori_profiles;
create trigger satori_profiles_touch before insert or update on public.satori_profiles for each row execute function public.satori_touch();
drop trigger if exists satori_preferences_touch on public.satori_preferences;
create trigger satori_preferences_touch before insert or update on public.satori_preferences for each row execute function public.satori_touch();
drop trigger if exists satori_prompts_touch on public.satori_prompts;
create trigger satori_prompts_touch before insert or update on public.satori_prompts for each row execute function public.satori_touch();

-- Versions: number assigned under a lock on the prompt; prompt's current copy updated.
create or replace function public.satori_version_insert()
returns trigger language plpgsql set search_path = '' as $$
declare cur integer;
begin
  select current_version_no into cur from public.satori_prompts where id = new.prompt_id for update;
  if not found then raise exception 'Prompt not found'; end if;
  new.version_no := cur + 1;
  new.created_at := now();
  update public.satori_prompts
     set current_version_no = new.version_no, current_content = new.content
   where id = new.prompt_id;
  return new;
end;
$$;
drop trigger if exists satori_version_insert on public.satori_prompt_versions;
create trigger satori_version_insert before insert on public.satori_prompt_versions for each row execute function public.satori_version_insert();

create or replace function public.satori_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are immutable', tg_table_name;
end;
$$;
-- Versions may only lose their parent link (when the parent is deleted along with the prompt).
create or replace function public.satori_version_immutable()
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
drop trigger if exists satori_versions_immutable on public.satori_prompt_versions;
create trigger satori_versions_immutable before update on public.satori_prompt_versions for each row execute function public.satori_version_immutable();
drop trigger if exists satori_ledger_immutable on public.satori_credit_ledger;
create trigger satori_ledger_immutable before update on public.satori_credit_ledger for each row execute function public.satori_immutable();

-- Row-level security ------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['satori_profiles', 'satori_preferences', 'satori_generations', 'satori_alternatives', 'satori_collections',
    'satori_prompts', 'satori_prompt_versions', 'satori_refinements', 'satori_tags', 'satori_prompt_tags', 'satori_templates',
    'satori_test_runs', 'satori_analyses', 'satori_usage', 'satori_credit_ledger']
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
  foreach t in array array['satori_profiles', 'satori_collections', 'satori_tags', 'satori_templates', 'satori_analyses']
  loop
    execute format('drop policy if exists "own rows: write" on public.%I', t);
    execute format('create policy "own rows: write" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

drop policy if exists "own rows: write" on public.satori_preferences;
create policy "own rows: write" on public.satori_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.satori_owns('public.satori_profiles', active_profile_id));

drop policy if exists "own rows: write" on public.satori_generations;
create policy "own rows: write" on public.satori_generations for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.satori_owns('public.satori_profiles', profile_id));

drop policy if exists "own rows: write" on public.satori_alternatives;
create policy "own rows: write" on public.satori_alternatives for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.satori_owns('public.satori_generations', generation_id));

drop policy if exists "own rows: write" on public.satori_prompts;
create policy "own rows: write" on public.satori_prompts for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and public.satori_owns('public.satori_collections', collection_id)
    and public.satori_owns('public.satori_generations', generation_id));

-- Versions: insert + read only (immutable).
drop policy if exists "own rows: insert" on public.satori_prompt_versions;
create policy "own rows: insert" on public.satori_prompt_versions for insert to authenticated
  with check (user_id = auth.uid()
    and public.satori_owns('public.satori_prompts', prompt_id)
    and public.satori_owns('public.satori_prompt_versions', parent_version_id));

drop policy if exists "own rows: insert" on public.satori_refinements;
create policy "own rows: insert" on public.satori_refinements for insert to authenticated
  with check (user_id = auth.uid()
    and public.satori_owns('public.satori_prompts', prompt_id)
    and public.satori_owns('public.satori_prompt_versions', to_version_id)
    and public.satori_owns('public.satori_prompt_versions', from_version_id));

drop policy if exists "own rows: write" on public.satori_prompt_tags;
create policy "own rows: write" on public.satori_prompt_tags for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.satori_owns('public.satori_prompts', prompt_id) and public.satori_owns('public.satori_tags', tag_id));

drop policy if exists "own rows: write" on public.satori_test_runs;
create policy "own rows: write" on public.satori_test_runs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.satori_owns('public.satori_prompts', prompt_id) and public.satori_owns('public.satori_prompt_versions', version_id));

-- Usage: insert and read your own; delete only through "delete my data".
drop policy if exists "own rows: insert" on public.satori_usage;
create policy "own rows: insert" on public.satori_usage for insert to authenticated with check (user_id = auth.uid());
-- Credit ledger: read-only for users (written by the service role).

-- Data retention and account deletion -------------------------------------------------------
create or replace function public.satori_apply_retention(days integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer := 0; c integer;
begin
  if days is null or days <= 0 then return 0; end if;
  delete from public.satori_generations where user_id = auth.uid() and created_at < now() - make_interval(days => days);
  get diagnostics c = row_count; n := n + c;
  delete from public.satori_analyses where user_id = auth.uid() and created_at < now() - make_interval(days => days);
  get diagnostics c = row_count; n := n + c;
  delete from public.satori_test_runs where user_id = auth.uid() and created_at < now() - make_interval(days => days);
  get diagnostics c = row_count; n := n + c;
  return n;
end;
$$;

-- Deletes every PromptSatori row belonging to the caller (including usage and credits).
create or replace function public.satori_delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  delete from public.satori_prompt_tags where user_id = me;
  delete from public.satori_refinements where user_id = me;
  delete from public.satori_test_runs where user_id = me;
  delete from public.satori_prompts where user_id = me; -- versions cascade
  delete from public.satori_tags where user_id = me;
  delete from public.satori_collections where user_id = me;
  delete from public.satori_alternatives where user_id = me;
  delete from public.satori_generations where user_id = me;
  delete from public.satori_templates where user_id = me;
  delete from public.satori_analyses where user_id = me;
  delete from public.satori_preferences where user_id = me;
  delete from public.satori_profiles where user_id = me;
  delete from public.satori_usage where user_id = me;
  delete from public.satori_credit_ledger where user_id = me;
end;
$$;
revoke all on function public.satori_delete_my_data() from public;
grant execute on function public.satori_delete_my_data() to authenticated;

-- Credit balance (0 until billing exists).
create or replace function public.satori_credit_balance()
returns integer language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(delta), 0)::integer from public.satori_credit_ledger where user_id = auth.uid();
$$;
