-- Access codes (API keys) so your AI assistant can work with your documents.
-- Only a fingerprint (hash) of each code is stored, never the code itself.
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

alter table public.access_tokens enable row level security;
drop policy if exists "owner only" on public.access_tokens;
create policy "owner only" on public.access_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
