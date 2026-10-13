-- Phase 6: connected accounts, publishing, media storage, and your brand kit.

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null check (platform in ('linkedin', 'facebook', 'instagram', 'threads', 'substack')),
  account_id text not null default '',
  account_name text not null default '',
  avatar_url text,
  -- Tokens and cookies are encrypted by the server before they are stored.
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  status text not null default 'connected' check (status in ('connected', 'error', 'expired')),
  last_error text,
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);
alter table public.connected_accounts enable row level security;
create policy "owner only" on public.connected_accounts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- "publishing" marks a post that is being sent right now, so it can never go out twice.
alter table public.posts drop constraint posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status in ('draft', 'scheduled', 'publishing', 'published', 'failed'));

alter table public.user_settings add column brand_kit jsonb;

-- Public bucket for images and videos (Instagram needs a public link to fetch them).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 262144000,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- You can only add or remove files inside your own folder.
create policy "owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner updates" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
