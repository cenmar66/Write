-- Write.ai: the whole database in one go (updates 0001 to 0008).
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


-- Privacy: every table is "owner only" ------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['folders', 'documents', 'document_versions', 'chat_messages', 'user_settings',
                           'voice_samples', 'post_templates', 'posts', 'connected_accounts', 'writing_styles',
                           'access_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
