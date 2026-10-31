# Database

Migration: `supabase/migrations/0011_inboxpilot.sql` (also appended to `supabase/setup-all.sql`). Re-runnable, never deletes data. Tested by `npm run test:sql` (applied twice, then behaviour tests).

## Tenancy

- `ip_workspaces` (personal / business / team, `is_demo`) and `ip_memberships` (owner / admin / member). Creating a workspace makes you its owner (trigger).
- Every other table carries `workspace_id`. RLS policy on each: `ip_is_member(workspace_id)` for read **and** write. `ip_is_member` / `ip_is_admin` are `security definer` lookups on memberships.
- `ip_provider_tokens`: RLS **on with no policies** and privileges revoked from `authenticated`/`anon`: only the service-role key (server) can read encrypted tokens.
- `ip_audit_events`: members may insert and read; no update/delete policies (append-only).
- `ip_subscription_entitlements`: read-only for members; only the server (service role) grants plans.
- `ip_preferences`, `ip_briefings`: per user (`user_id = auth.uid()`).

## Tables

| Table | Purpose | Dedupe / keys |
|---|---|---|
| ip_workspaces, ip_memberships | tenancy | |
| ip_preferences | privacy/AI, retention, automation mode, briefing, focus, writing profile, onboarding | user_id |
| ip_accounts | connected mailboxes, status, scopes, sync cursor/progress, per-account automation & AI level | (workspace, provider, email) |
| ip_provider_tokens | AES-256-GCM encrypted access/refresh tokens | account_id |
| ip_threads | conversations | (account, provider thread id) |
| ip_messages | normalized messages; body text only within retention; effective category/importance/priority denormalized | (account, provider message id) |
| ip_classifications | latest classification + factors, confidence, source, injection flag, user_corrected | message_id |
| ip_classification_feedback | user corrections (teach per-sender behaviour in this workspace) | |
| ip_senders | Sender Control Center + per-workspace sender history | (workspace, email) |
| ip_categories | virtual folders (system + custom) | (workspace, key) |
| ip_rules, ip_rule_executions | rules; every planned/applied/approved/undone action with undo data | (rule, message, action) |
| ip_tasks | tasks with provenance and permanent `source_ref` | (workspace, dedupe_key) |
| ip_followups | I owe / they owe / commitments, evidence sentence, explicit vs inferred due date | (workspace, dedupe_key) |
| ip_reminders | reminder records (in-app) | (workspace, dedupe_key) |
| ip_briefings | stored briefings (sections → items → source refs) | |
| ip_drafts | drafts and their send status | |
| ip_notification_preferences | per workspace/account channels & schedule | (workspace, account) |
| ip_audit_events | append-only audit log | |
| ip_ai_usage | every AI call: feature, model, tokens, cost, cached, ok | |
| ip_subscription_entitlements | plan per workspace (server-granted) | workspace_id |
| ip_jobs | durable job queue | idempotency_key |

Functions: `ip_claim_jobs(n, lease_seconds)`, `ip_finish_job(job, ok, err)` (backoff 30 s × 4ⁿ, dead after `max_attempts`), `ip_delete_my_data()`.

## Deletion

- **Disconnect account** → provider revoke, token row deleted, `ip_accounts` row deleted → cascades to threads, messages, classifications, follow-ups, tasks, drafts, rules scoped to that account, jobs.
- **Delete all data** (Settings → Your data) → revoke every account, then `ip_delete_my_data()` (owned workspaces cascade everything; plus briefings and preferences).
- **Retention**: stored message bodies expire (`body_expires_at`); the hourly `prune` job nulls them.
