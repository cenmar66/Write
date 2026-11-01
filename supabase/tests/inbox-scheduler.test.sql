-- Behaviour test for 0013_inbox_scheduler.sql using stand-ins for Supabase's Vault,
-- pg_net and pg_cron (the real extensions aren't in plain Postgres).
\set ON_ERROR_STOP 1
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
create schema if not exists net;
create table if not exists net.calls (url text, headers jsonb, timeout_ms int);
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$ insert into net.calls values (url, headers, timeout_milliseconds); select 1::bigint $$;
create schema if not exists cron;
create table if not exists cron.jobs (name text primary key, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$
  insert into cron.jobs values (job_name, schedule, command) on conflict (name) do update set schedule = excluded.schedule, command = excluded.command;
  select 1::bigint $$;

-- With the stand-ins present, the migration schedules the job (twice = still one job).
\i supabase/migrations/0013_inbox_scheduler.sql
\i supabase/migrations/0013_inbox_scheduler.sql
do $$ begin
  assert (select count(*) from cron.jobs) = 1, 'job not scheduled exactly once';
  assert (select schedule from cron.jobs where name = 'inboxsatori-sync') = '*/10 * * * *', 'wrong schedule';
end $$;

-- No secret yet: nothing is sent.
select public.ip_run_inbox_cron();
do $$ begin assert (select count(*) from net.calls) = 0, 'called without a secret'; end $$;

-- With the secret: one authorized call to inboxsatori.com, then to a custom address.
insert into vault.decrypted_secrets values ('inbox_cron_secret', 'test-secret');
select public.ip_run_inbox_cron();
insert into vault.decrypted_secrets values ('inbox_cron_url', 'https://example.test/api/cron/inbox');
select public.ip_run_inbox_cron();
do $$ begin
  assert (select count(*) from net.calls) = 2, 'expected two calls';
  assert (select url from net.calls limit 1) = 'https://inboxsatori.com/api/cron/inbox', 'default url';
  assert (select headers->>'Authorization' from net.calls limit 1) = 'Bearer test-secret', 'auth header';
  assert exists (select 1 from net.calls where url = 'https://example.test/api/cron/inbox'), 'custom url';
end $$;

-- Signed-in users can't trigger it.
set role authenticated;
do $$ begin
  begin
    perform public.ip_run_inbox_cron();
    raise exception 'authenticated user could run the scheduler';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'inbox scheduler SQL tests passed'
