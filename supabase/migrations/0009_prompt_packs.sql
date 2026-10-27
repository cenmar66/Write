-- Your own prompt packs (made with AI or by hand).
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

alter table public.prompt_packs enable row level security;
drop policy if exists "owner only" on public.prompt_packs;
create policy "owner only" on public.prompt_packs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
