-- InboxSatori background sync, run by Supabase itself every 10 minutes (pg_cron + pg_net).
-- Vercel's Hobby plan only allows daily crons, so the database calls the app instead:
--   every 10 min → GET https://inboxsatori.com/api/cron/inbox  (Authorization: Bearer <CRON_SECRET>)
-- The secret is read from Supabase Vault at run time; it never appears in this file.
-- One-time setup after running this file (SQL editor, your own value):
--   select vault.create_secret('<the CRON_SECRET from Vercel>', 'inbox_cron_secret');
-- Optional: a different address, e.g. your Write.ai domain:
--   select vault.create_secret('https://YOUR-DOMAIN/api/cron/inbox', 'inbox_cron_url');
-- Safe to run more than once. Never deletes data.
set client_min_messages = warning;

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_cron/pg_net unavailable here (%); InboxSatori scheduler not installed.', sqlerrm;
end $$;

-- Fires one request (pg_net is asynchronous: the job returns at once; the app does the work).
create or replace function public.ip_run_inbox_cron()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  secret text;
  target text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'inbox_cron_secret' limit 1;
  if secret is null or secret = '' then
    raise notice 'InboxSatori scheduler: add the inbox_cron_secret to Vault first (docs/inbox/SETUP.md §4).';
    return null;
  end if;
  select coalesce(
    (select decrypted_secret from vault.decrypted_secrets where name = 'inbox_cron_url' limit 1),
    'https://inboxsatori.com/api/cron/inbox'
  ) into target;
  return net.http_get(
    url := target,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 60000
  );
end;
$$;
-- Only the database itself (pg_cron runs as postgres) may trigger it.
revoke all on function public.ip_run_inbox_cron() from public;
do $$ begin
  revoke all on function public.ip_run_inbox_cron() from anon, authenticated;
exception when undefined_object then null;
end $$;

-- (Re)schedule by name, so re-running this file just updates the job.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('inboxsatori-sync', '*/10 * * * *', 'select public.ip_run_inbox_cron()');
  end if;
end $$;
