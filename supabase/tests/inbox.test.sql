-- Behaviour tests for 0011_inboxpilot.sql. Run with: npm run test:sql
\set ON_ERROR_STOP 1
insert into auth.users values ('a1111111-1111-1111-1111-111111111111', 'alice@example.com'),
                              ('b2222222-2222-2222-2222-222222222222', 'bob@example.com')
on conflict do nothing;
grant execute on all functions in schema public to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', false);

-- 1. Alice creates a workspace and becomes its owner automatically.
insert into public.ip_workspaces (id, name, kind) values ('11111111-0000-0000-0000-000000000001', 'Alice Biz', 'business');
do $$ begin
  assert (select role from public.ip_memberships where workspace_id = '11111111-0000-0000-0000-000000000001') = 'owner', 'owner membership';
end $$;

-- 2. She adds an account and a message; a re-synced copy of the same message is rejected (dedupe).
insert into public.ip_accounts (id, workspace_id, provider, email)
values ('11111111-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-000000000001', 'demo', 'alice@biz.test');
insert into public.ip_messages (id, workspace_id, account_id, provider_message_id, provider_thread_id, received_at, subject)
values ('11111111-0000-0000-0000-0000000000e1', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1', 'p1', 't1', now(), 'Hello')
on conflict (account_id, provider_message_id) do nothing;
insert into public.ip_messages (workspace_id, account_id, provider_message_id, provider_thread_id, received_at, subject)
values ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-0000000000a1', 'p1', 't1', now(), 'Hello again')
on conflict (account_id, provider_message_id) do nothing;
do $$ begin
  assert (select count(*) from public.ip_messages) = 1, 'duplicate message stored';
end $$;

-- 3. Tokens are invisible to signed-in users (service role only).
do $$ begin
  begin
    perform 1 from public.ip_provider_tokens;
    raise exception 'tokens should not be readable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4. Bob cannot see or write into Alice's workspace.
select set_config('request.jwt.claim.sub', 'b2222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.ip_workspaces) = 0, 'bob sees alice workspace';
  assert (select count(*) from public.ip_messages) = 0, 'bob sees alice mail';
  assert (select count(*) from public.ip_accounts) = 0, 'bob sees alice accounts';
end $$;
do $$ begin
  begin
    insert into public.ip_tasks (workspace_id, title) values ('11111111-0000-0000-0000-000000000001', 'sneaky');
    raise exception 'bob wrote into alice workspace';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.ip_messages set subject = 'hacked';
delete from public.ip_messages;
-- Bob can't make himself a member of Alice's workspace.
do $$ begin
  begin
    insert into public.ip_memberships (workspace_id, user_id, role) values ('11111111-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'admin');
    raise exception 'bob joined alice workspace';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bob's own workspace is separate.
insert into public.ip_workspaces (id, name) values ('22222222-0000-0000-0000-000000000001', 'Bob Home');

select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert (select subject from public.ip_messages) = 'Hello', 'bob changed alice mail';
  assert (select count(*) from public.ip_workspaces) = 1, 'alice sees only her workspace';
end $$;

-- 5. Follow-up dedupe: detecting the same item twice keeps one row.
insert into public.ip_followups (workspace_id, kind, title, dedupe_key)
values ('11111111-0000-0000-0000-000000000001', 'they_owe', 'Waiting on contract', 'thread:t1:they_owe')
on conflict (workspace_id, dedupe_key) do nothing;
insert into public.ip_followups (workspace_id, kind, title, dedupe_key)
values ('11111111-0000-0000-0000-000000000001', 'they_owe', 'Waiting on contract', 'thread:t1:they_owe')
on conflict (workspace_id, dedupe_key) do nothing;
do $$ begin assert (select count(*) from public.ip_followups) = 1, 'duplicate follow-up'; end $$;

-- 6. Audit log is append-only.
insert into public.ip_audit_events (workspace_id, actor, action) values ('11111111-0000-0000-0000-000000000001', 'user', 'test');
update public.ip_audit_events set action = 'changed';
delete from public.ip_audit_events;
do $$ begin assert (select action from public.ip_audit_events) = 'test', 'audit log was modified'; end $$;

-- 7. Users cannot grant themselves a paid plan.
do $$ begin
  begin
    insert into public.ip_subscription_entitlements (workspace_id, plan) values ('11111111-0000-0000-0000-000000000001', 'team');
    raise exception 'user granted own entitlement';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 8. Job queue: idempotent enqueue, claim, retry with backoff, dead after max attempts.
insert into public.ip_jobs (workspace_id, kind, idempotency_key, max_attempts)
values ('11111111-0000-0000-0000-000000000001', 'sync', 'sync:a1:2026-10-31T10', 2)
on conflict (idempotency_key) do nothing;
insert into public.ip_jobs (workspace_id, kind, idempotency_key, max_attempts)
values ('11111111-0000-0000-0000-000000000001', 'sync', 'sync:a1:2026-10-31T10', 2)
on conflict (idempotency_key) do nothing;
do $$
declare j public.ip_jobs;
begin
  assert (select count(*) from public.ip_jobs) = 1, 'duplicate job';
  select * into j from public.ip_claim_jobs(5);
  assert j.status = 'running' and j.attempts = 1, 'claim';
  assert (select count(*) from public.ip_claim_jobs(5)) = 0, 'claimed twice';
  perform public.ip_finish_job(j.id, false, 'boom');
  assert (select status from public.ip_jobs) = 'queued', 'should retry';
  assert (select run_after from public.ip_jobs) > now(), 'should back off';
  update public.ip_jobs set run_after = now() - interval '1 second';
  select * into j from public.ip_claim_jobs(5);
  perform public.ip_finish_job(j.id, false, 'boom again');
  assert (select status from public.ip_jobs) = 'dead', 'should be dead after max attempts';
end $$;

-- 9. Disconnecting an account removes the mail fetched from it.
delete from public.ip_accounts where id = '11111111-0000-0000-0000-0000000000a1';
do $$ begin assert (select count(*) from public.ip_messages) = 0, 'mail survived disconnect'; end $$;

-- 10. Delete-my-data removes Alice's workspaces but not Bob's.
select public.ip_delete_my_data();
do $$ begin
  assert (select count(*) from public.ip_workspaces) = 0, 'alice data remains';
  assert (select count(*) from public.ip_followups) = 0, 'alice follow-ups remain';
end $$;
reset role;
do $$ begin assert (select count(*) from public.ip_workspaces where name = 'Bob Home') = 1, 'bob data was deleted'; end $$;
\echo 'inbox SQL tests passed'
