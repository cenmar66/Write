-- App preferences that follow you across laptop, tablet, and phone.
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  ai_model text,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy "owner only" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
