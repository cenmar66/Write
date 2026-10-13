-- Phase 4: writing samples and the voice profile built from them.

create table public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '',
  content text not null,
  source text not null default 'paste' check (source in ('paste', 'upload', 'document')),
  word_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index voice_samples_user on public.voice_samples (user_id, created_at desc);

alter table public.voice_samples enable row level security;
create policy "owner only" on public.voice_samples for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The profile lives with your other settings. The voice is on by default.
alter table public.user_settings
  add column voice_enabled boolean not null default true,
  add column voice_profile jsonb,
  add column voice_profile_updated_at timestamptz;
