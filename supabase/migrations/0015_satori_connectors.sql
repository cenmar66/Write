-- PromptSatori: connected apps (MCP servers) and run context.
-- Safe to run more than once. Never deletes data. Needs 0011_promptsatori.sql first.

-- Connected apps. The access token is encrypted by the server (AES-256-GCM with
-- ENCRYPTION_KEY) before it is stored, and is never sent to the browser.
create table if not exists public.satori_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  server_name text not null check (server_name ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  token_encrypted text check (char_length(token_encrypted) <= 8000),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists satori_connectors_name on public.satori_connectors (user_id, server_name);

drop trigger if exists satori_connectors_touch on public.satori_connectors;
create trigger satori_connectors_touch before insert or update on public.satori_connectors for each row execute function public.satori_touch();

alter table public.satori_connectors enable row level security;
drop policy if exists "own rows: read" on public.satori_connectors;
create policy "own rows: read" on public.satori_connectors for select to authenticated using (user_id = auth.uid());
drop policy if exists "own rows: write" on public.satori_connectors;
create policy "own rows: write" on public.satori_connectors for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- What a Testing Lab run used: image count, website addresses, web search, connected
-- apps by name, and what the model did with them. No image data, no page text.
alter table public.satori_test_runs add column if not exists context jsonb not null default '{}'::jsonb;

-- "Delete all my data" also removes connected apps.
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
  delete from public.satori_connectors where user_id = me;
end;
$$;
revoke all on function public.satori_delete_my_data() from public;
grant execute on function public.satori_delete_my_data() to authenticated;
