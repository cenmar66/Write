-- InboxPilot AI: an email command center that lives next to Write.ai at /inbox.
set client_min_messages = warning;
-- Safe to run more than once. Never deletes data.
--
-- Design notes (full write-up: docs/inbox/DATABASE.md)
--  * Tenancy: every row belongs to a workspace. Access is decided by membership
--    (ip_is_member), enforced with row-level security on every table.
--  * ip_provider_tokens has RLS on and NO policies: only the server's service-role
--    key can read it. Tokens are AES-256-GCM encrypted before they get here.
--  * Dedupe is done with unique keys, so a retried sync or job never duplicates:
--    messages (account, provider id), threads (account, provider thread id),
--    follow-ups / tasks / reminders (workspace, dedupe_key), jobs (idempotency_key).
--  * Disconnecting an account deletes everything fetched from it (FK cascades).

-- ---------------------------------------------------------------- workspaces
create table if not exists public.ip_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  kind text not null default 'personal' check (kind in ('personal', 'business', 'team')),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  is_demo boolean not null default false,
  color text not null default 'blue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ip_memberships (
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists ip_memberships_user on public.ip_memberships (user_id);

create or replace function public.ip_is_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ip_memberships m where m.workspace_id = ws and m.user_id = auth.uid());
$$;

create or replace function public.ip_is_admin(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ip_memberships m
                 where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;

-- The creator of a workspace becomes its owner.
create or replace function public.ip_workspace_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ip_memberships (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists ip_workspace_owner on public.ip_workspaces;
create trigger ip_workspace_owner after insert on public.ip_workspaces
  for each row execute function public.ip_workspace_owner();

-- ---------------------------------------------------------------- per-user preferences
create table if not exists public.ip_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  automation_mode text not null default 'observe' check (automation_mode in ('observe', 'assisted', 'automatic')),
  -- What the AI may read: metadata (headers only), snippet (headers + Gmail's preview), full (bodies, trimmed).
  ai_content text not null default 'metadata' check (ai_content in ('metadata', 'snippet', 'full')),
  ai_external boolean not null default false,          -- may content go to an external AI provider at all?
  ai_provider text not null default 'anthropic' check (ai_provider in ('anthropic', 'openai')),
  ai_drafts boolean not null default true,
  ai_monthly_request_cap integer not null default 2000 check (ai_monthly_request_cap between 0 and 100000),
  body_retention_days integer not null default 14 check (body_retention_days between 0 and 365),
  briefing jsonb not null default '{"morning":"08:00","midday":null,"evening":null,"mode":"concise","channels":["in_app"]}'::jsonb,
  focus jsonb not null default '{"enabled":false,"windows":[],"allow_vip":true,"allow_critical":true}'::jsonb,
  followup_days integer not null default 3 check (followup_days between 1 and 60),
  writing_profile jsonb not null default '{}'::jsonb,
  learn_from_sent boolean not null default false,
  onboarding jsonb not null default '{}'::jsonb,
  ui jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- accounts + tokens
create table if not exists public.ip_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook', 'demo')),
  email text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'syncing', 'needs_reconnect', 'paused', 'error')),
  scopes text not null default '',
  sync_cursor text,                  -- Gmail historyId
  sync_state jsonb not null default '{}'::jsonb, -- initial import progress {phase,pageToken,fetched,target}
  last_sync_at timestamptz,
  last_error text,
  automation_mode text check (automation_mode in ('observe', 'assisted', 'automatic')), -- null = use preference
  settings jsonb not null default '{}'::jsonb, -- {label_sync:false, ai_content:null, notify:{...}}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, email)
);

create table if not exists public.ip_provider_tokens (
  account_id uuid primary key references public.ip_accounts on delete cascade,
  access_token_enc text,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- mail
create table if not exists public.ip_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid not null references public.ip_accounts on delete cascade,
  provider_thread_id text not null,
  subject text not null default '',
  last_message_at timestamptz,
  message_count integer not null default 0,
  participants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_thread_id)
);

create table if not exists public.ip_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid not null references public.ip_accounts on delete cascade,
  thread_id uuid references public.ip_threads on delete set null,
  provider_message_id text not null,
  provider_thread_id text not null,
  rfc_message_id text,
  in_reply_to text,
  from_email text not null default '',
  from_name text not null default '',
  to_addrs jsonb not null default '[]'::jsonb,
  cc_addrs jsonb not null default '[]'::jsonb,
  reply_to text,
  subject text not null default '',
  snippet text not null default '',
  body_text text,                      -- only kept when content mode allows, trimmed, expires
  body_expires_at timestamptz,
  received_at timestamptz not null,
  label_ids text[] not null default '{}',
  is_unread boolean not null default false,
  is_starred boolean not null default false,
  is_sent boolean not null default false, -- written by the account owner
  in_inbox boolean not null default true,
  has_attachments boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  list_id text,
  list_unsubscribe text,
  auto_submitted text,
  precedence text,
  signals jsonb not null default '{}'::jsonb, -- header-derived flags (bulk, noreply, auto-reply, dsn...)
  category text,                         -- effective virtual category (user's choice or the classifier's)
  importance text,                       -- effective importance (denormalized from ip_classifications for fast lists)
  priority_score integer not null default 0,
  snoozed_until timestamptz,
  snooze_until_reply boolean not null default false,
  done_at timestamptz,                   -- handled in InboxPilot (doesn't touch Gmail)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, provider_message_id)
);
create index if not exists ip_messages_ws_received on public.ip_messages (workspace_id, received_at desc);
create index if not exists ip_messages_thread on public.ip_messages (thread_id, received_at);
create index if not exists ip_messages_from on public.ip_messages (workspace_id, from_email);
create index if not exists ip_messages_priority on public.ip_messages (workspace_id, priority_score desc, received_at desc);
create index if not exists ip_messages_category on public.ip_messages (workspace_id, category, received_at desc);

create table if not exists public.ip_classifications (
  message_id uuid primary key references public.ip_messages on delete cascade,
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  importance text not null check (importance in ('critical', 'high', 'normal', 'low')),
  msg_type text not null,
  action text not null check (action in ('reply_needed', 'task_required', 'review_needed', 'waiting', 'informational', 'no_action')),
  time_sensitivity text not null check (time_sensitivity in ('immediate', 'today', 'this_week', 'flexible', 'unknown')),
  category text not null,
  priority_score integer not null check (priority_score between 0 and 100),
  confidence real not null check (confidence between 0 and 1),
  explanation text not null default '',
  factors jsonb not null default '[]'::jsonb,
  source text not null check (source in ('rules', 'heuristic', 'ai', 'user')),
  model text,
  injection_flag boolean not null default false,
  user_corrected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ip_class_ws on public.ip_classifications (workspace_id, priority_score desc);

create table if not exists public.ip_classification_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  message_id uuid references public.ip_messages on delete set null,
  sender_email text not null,
  field text not null check (field in ('importance', 'msg_type', 'action', 'category')),
  old_value text,
  new_value text not null,
  created_at timestamptz not null default now()
);
create index if not exists ip_feedback_sender on public.ip_classification_feedback (workspace_id, sender_email);

-- Sender Control Center + learned per-sender history (scoped to one workspace).
create table if not exists public.ip_senders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  email text not null,
  domain text not null,
  display_name text not null default '',
  is_vip boolean not null default false,
  always_priority boolean not null default false,
  suppress_notifications boolean not null default false,
  screening text not null default 'unknown' check (screening in ('unknown', 'approved', 'screened_out')),
  default_category text,
  blocked boolean not null default false,  -- InboxPilot hides; never deletes, never touches Gmail spam
  received_count integer not null default 0,
  replied_count integer not null default 0,
  sent_to_count integer not null default 0,
  first_seen timestamptz,
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, email)
);

create table if not exists public.ip_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  key text not null,
  name text not null check (length(name) between 1 and 40),
  icon text not null default 'tag',
  position integer not null default 0,
  system boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);

-- ---------------------------------------------------------------- rules
create table if not exists public.ip_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade, -- null = all accounts in workspace
  name text not null check (length(name) between 1 and 120),
  enabled boolean not null default true,
  priority integer not null default 100,
  match text not null default 'all' check (match in ('all', 'any')),
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  stop_processing boolean not null default false,
  origin text not null default 'user' check (origin in ('user', 'suggested', 'template')),
  confirmed_broad boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ip_rule_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  rule_id uuid references public.ip_rules on delete set null,
  rule_name text not null default '',
  message_id uuid references public.ip_messages on delete cascade,
  action jsonb not null,
  status text not null check (status in ('suggested', 'applied', 'approved', 'dismissed', 'undone', 'failed')),
  provider_applied boolean not null default false,
  undo jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id, message_id, action)
);
create index if not exists ip_exec_ws on public.ip_rule_executions (workspace_id, created_at desc);

-- ---------------------------------------------------------------- productivity
create table if not exists public.ip_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  message_id uuid references public.ip_messages on delete set null,
  source_ref jsonb,                 -- {provider, provider_message_id, thread, subject, from} survives cache pruning
  title text not null check (length(title) between 1 and 300),
  description text not null default '',
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  project text,
  assignee text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  notes text not null default '',
  provenance jsonb not null default '{}'::jsonb, -- field -> 'explicit' | 'inferred' | 'user'
  external_refs jsonb not null default '{}'::jsonb, -- {todoist: id, canvas: id}
  dedupe_key text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);

create table if not exists public.ip_followups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  thread_id uuid references public.ip_threads on delete cascade,
  message_id uuid references public.ip_messages on delete cascade,
  kind text not null check (kind in ('i_owe', 'they_owe', 'commitment')),
  title text not null,
  counterpart text not null default '',
  due_at timestamptz,
  due_explicit boolean not null default false,
  evidence text not null default '',   -- the exact sentence that triggered it
  confidence real not null default 0.5,
  detected_by text not null default 'rule' check (detected_by in ('rule', 'ai', 'user')),
  status text not null default 'open' check (status in ('open', 'done', 'snoozed', 'dismissed')),
  snoozed_until timestamptz,
  tracking_disabled boolean not null default false,
  assignee text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);

create table if not exists public.ip_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  target_type text not null check (target_type in ('message', 'task', 'followup')),
  target_id uuid not null,
  remind_at timestamptz not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'fired', 'cancelled')),
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);

create table if not exists public.ip_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workspace_ids uuid[] not null default '{}',
  slot text not null check (slot in ('morning', 'midday', 'evening', 'on_demand')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  content jsonb not null,             -- sections -> items, each with source refs
  summary_source text not null default 'deterministic' check (summary_source in ('deterministic', 'ai')),
  model text,
  created_at timestamptz not null default now()
);
create index if not exists ip_briefings_user on public.ip_briefings (user_id, created_at desc);

create table if not exists public.ip_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid not null references public.ip_accounts on delete cascade,
  message_id uuid references public.ip_messages on delete set null,
  provider_thread_id text,
  to_addrs jsonb not null default '[]'::jsonb,
  cc_addrs jsonb not null default '[]'::jsonb,
  bcc_addrs jsonb not null default '[]'::jsonb,
  subject text not null default '',
  body text not null default '',
  language text not null default 'en',
  ai_generated boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'sending', 'sent', 'discarded', 'failed')),
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ip_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  channels jsonb not null default '["in_app"]'::jsonb,
  schedule jsonb not null default '{}'::jsonb,
  quiet boolean not null default false,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (workspace_id, account_id)
);

-- ---------------------------------------------------------------- operations
create table if not exists public.ip_audit_events (
  id bigserial primary key,
  workspace_id uuid references public.ip_workspaces on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete set null,
  actor text not null check (actor in ('user', 'system', 'ai', 'rule', 'assistant')),
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ip_audit_ws on public.ip_audit_events (workspace_id, created_at desc);

create table if not exists public.ip_ai_usage (
  id bigserial primary key,
  workspace_id uuid references public.ip_workspaces on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  cached boolean not null default false,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ip_ai_usage_user on public.ip_ai_usage (user_id, created_at desc);

create table if not exists public.ip_subscription_entitlements (
  workspace_id uuid primary key references public.ip_workspaces on delete cascade,
  plan text not null default 'dev' check (plan in ('personal', 'professional', 'team', 'dev')),
  source text not null default 'dev' check (source in ('dev', 'stripe', 'manual')),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled')),
  overrides jsonb not null default '{}'::jsonb,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);

-- Durable background jobs: retried with backoff, idempotent by key, claimed with SKIP LOCKED.
create table if not exists public.ip_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.ip_workspaces on delete cascade,
  account_id uuid references public.ip_accounts on delete cascade,
  kind text not null check (kind in ('sync', 'classify', 'briefing', 'followups', 'prune')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ip_jobs_ready on public.ip_jobs (status, run_after);

-- Claim up to n ready jobs (queued and due, or running with an expired lock).
create or replace function public.ip_claim_jobs(n integer, lease_seconds integer default 240)
returns setof public.ip_jobs language plpgsql set search_path = '' as $$
begin
  return query
  update public.ip_jobs j set status = 'running', attempts = j.attempts + 1,
         locked_until = now() + make_interval(secs => lease_seconds), updated_at = now()
  where j.id in (
    select id from public.ip_jobs
    where (status = 'queued' and run_after <= now())
       or (status = 'running' and locked_until < now())
    order by run_after
    limit greatest(n, 0)
    for update skip locked
  )
  returning j.*;
end;
$$;

-- Finish a job; failures back off exponentially (30s, 2m, 8m, ...) until max_attempts.
create or replace function public.ip_finish_job(job uuid, ok boolean, err text default null)
returns void language plpgsql set search_path = '' as $$
begin
  if ok then
    update public.ip_jobs set status = 'done', locked_until = null, last_error = null, updated_at = now() where id = job;
  else
    update public.ip_jobs set
      status = case when attempts >= max_attempts then 'dead' else 'queued' end,
      run_after = now() + make_interval(secs => 30 * power(4, least(attempts - 1, 6))::int),
      locked_until = null, last_error = left(err, 2000), updated_at = now()
    where id = job;
  end if;
end;
$$;

-- ---------------------------------------------------------------- updated_at
create or replace function public.ip_touch()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
do $$
declare t text;
begin
  foreach t in array array['ip_workspaces','ip_preferences','ip_accounts','ip_threads','ip_messages','ip_classifications',
    'ip_senders','ip_rules','ip_rule_executions','ip_tasks','ip_followups','ip_drafts','ip_jobs','ip_subscription_entitlements']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.ip_touch()', t || '_touch', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- row-level security
alter table public.ip_workspaces enable row level security;
alter table public.ip_memberships enable row level security;
alter table public.ip_preferences enable row level security;
alter table public.ip_provider_tokens enable row level security; -- no policies: service role only
alter table public.ip_briefings enable row level security;

drop policy if exists ip_ws_select on public.ip_workspaces;
create policy ip_ws_select on public.ip_workspaces for select using (public.ip_is_member(id) or owner_id = auth.uid());
drop policy if exists ip_ws_insert on public.ip_workspaces;
create policy ip_ws_insert on public.ip_workspaces for insert with check (owner_id = auth.uid());
drop policy if exists ip_ws_update on public.ip_workspaces;
create policy ip_ws_update on public.ip_workspaces for update using (public.ip_is_admin(id)) with check (public.ip_is_admin(id));
drop policy if exists ip_ws_delete on public.ip_workspaces;
create policy ip_ws_delete on public.ip_workspaces for delete using (owner_id = auth.uid());

drop policy if exists ip_mem_select on public.ip_memberships;
create policy ip_mem_select on public.ip_memberships for select using (public.ip_is_member(workspace_id));
drop policy if exists ip_mem_write on public.ip_memberships;
create policy ip_mem_write on public.ip_memberships for all using (public.ip_is_admin(workspace_id)) with check (public.ip_is_admin(workspace_id));

drop policy if exists ip_prefs_own on public.ip_preferences;
create policy ip_prefs_own on public.ip_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ip_brief_own on public.ip_briefings;
create policy ip_brief_own on public.ip_briefings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every workspace-scoped table: members only, both for reading and writing.
do $$
declare t text;
begin
  foreach t in array array['ip_accounts','ip_threads','ip_messages','ip_classifications','ip_classification_feedback',
    'ip_senders','ip_categories','ip_rules','ip_rule_executions','ip_tasks','ip_followups','ip_reminders','ip_drafts',
    'ip_notification_preferences','ip_ai_usage','ip_jobs','ip_subscription_entitlements']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('create policy %I on public.%I for all using (public.ip_is_member(workspace_id)) with check (public.ip_is_member(workspace_id))', t || '_member', t);
  end loop;
end $$;

-- Audit log: members can read and append, never edit or delete.
alter table public.ip_audit_events enable row level security;
drop policy if exists ip_audit_read on public.ip_audit_events;
create policy ip_audit_read on public.ip_audit_events for select using (public.ip_is_member(workspace_id) or (workspace_id is null and user_id = auth.uid()));
drop policy if exists ip_audit_insert on public.ip_audit_events;
create policy ip_audit_insert on public.ip_audit_events for insert with check (public.ip_is_member(workspace_id) or (workspace_id is null and user_id = auth.uid()));

-- Entitlements are granted by the server (billing), not by the user; members may only read.
drop policy if exists ip_subscription_entitlements_member on public.ip_subscription_entitlements;
drop policy if exists ip_ent_read on public.ip_subscription_entitlements;
create policy ip_ent_read on public.ip_subscription_entitlements for select using (public.ip_is_member(workspace_id));

grant execute on function public.ip_is_member(uuid), public.ip_is_admin(uuid) to authenticated;
revoke all on public.ip_provider_tokens from anon, authenticated;

-- ---------------------------------------------------------------- deletion
-- Deletes every InboxPilot row the caller owns (workspaces they own cascade everything).
create or replace function public.ip_delete_my_data()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.ip_workspaces where owner_id = auth.uid();
  delete from public.ip_briefings where user_id = auth.uid();
  delete from public.ip_preferences where user_id = auth.uid();
end;
$$;
grant execute on function public.ip_delete_my_data() to authenticated;
