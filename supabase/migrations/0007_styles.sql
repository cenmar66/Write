-- Multiple writing styles + Trash. Safe to run more than once.
-- Your existing voice profile and samples move into a default style called "My voice".

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

alter table public.writing_styles enable row level security;
drop policy if exists "owner only" on public.writing_styles;
create policy "owner only" on public.writing_styles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.voice_samples add column if not exists style_id uuid references public.writing_styles on delete cascade;
alter table public.documents add column if not exists style_id uuid references public.writing_styles on delete set null;
alter table public.documents add column if not exists deleted_at timestamptz;
create index if not exists documents_user_deleted on public.documents (user_id, deleted_at);

-- Move what you already have (only if you don't have a default style yet).
insert into public.writing_styles (user_id, name, profile, profile_updated_at, is_default)
select u.user_id, 'My voice', u.voice_profile, u.voice_profile_updated_at, true
from public.user_settings u
where u.voice_profile is not null
  and not exists (select 1 from public.writing_styles w where w.user_id = u.user_id and w.is_default);

insert into public.writing_styles (user_id, name, is_default)
select distinct s.user_id, 'My voice', true
from public.voice_samples s
where not exists (select 1 from public.writing_styles w where w.user_id = s.user_id and w.is_default);

update public.voice_samples s
set style_id = w.id
from public.writing_styles w
where w.user_id = s.user_id and w.is_default and s.style_id is null;
