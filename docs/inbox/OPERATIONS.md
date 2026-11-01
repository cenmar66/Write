# Operations

## Background jobs

`/api/cron/inbox` (Vercel Cron, every 10 min, `Authorization: Bearer $CRON_SECRET`):

1. **scheduleTick** enqueues, idempotently (keyed by account + 10-minute slot): one `sync` job per active account; a `briefing` job per user whose morning/midday/evening time has passed today (in their time zone) and hasn't run; an hourly `prune` job (expired message bodies).
2. **drain** claims ready jobs with `ip_claim_jobs` (`FOR UPDATE SKIP LOCKED`, 4-minute lease) and runs them for up to 45 s. Success → `done`. Failure → retry with backoff 30 s, 2 min, 8 min, 32 min… → `dead` after 5 attempts (visible on the Operations page).

Sync steps are bounded (25 s per account per run); the initial import resumes on the next tick. Gmail 429/5xx/`rateLimitExceeded` responses are retried with backoff honouring `Retry-After`; persistent rate limiting fails the job, which retries later.

## Monitoring

`/inbox/ops` (also linked from Settings and Analytics): AI requests/tokens/cost per feature and model (30 days), job counts by kind/status, recent failures, sync health per account. Every AI call and every mailbox-changing action is in the database (`ip_ai_usage`, `ip_rule_executions`, `ip_audit_events`).

## AI cost model

Routing: classification and task extraction → Claude Haiku 5.5 (low effort); summaries, briefings, drafts, assistant → Claude Sonnet 5.5 (low effort). Opus 5.5 is available as the “best” tier. List prices used (USD per million input/output tokens, Oct 2026): Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 (`lib/inbox/ai/models.ts`).

Cost controls: deterministic classification first (AI only for messages under 0.6 confidence, max 15 per sync run), AI off by default, content level limits (headers only by default), excerpts trimmed (no full histories), 10-minute response cache, monthly request cap per user, per-minute rate limits.

**Estimated cost per active user** (estimate, not a bill; token sizes are assumptions):

| Profile | Emails/day | AI-classified | Drafts/day | Briefings/day | Assistant/day | ≈ per month |
|---|---|---|---|---|---|---|
| Light | 40 | 25% | 1 | 1 | 1 | **$1.27** |
| Typical | 120 | 25% | 5 | 2 | 3 | **$3.97** |
| Heavy | 300 | 25% | 15 | 3 | 10 | **$10.98** |

Assumed tokens per call: classify 700 in / 150 out; draft 2,500 / 500; briefing 4,000 / 700; assistant 5,000 / 600. With AI turned off the AI cost is $0. Infrastructure (Vercel Pro, Supabase Pro) is already paid for Write.ai.

## Incidents

- **“Reconnect needed”**: Google revoked or expired the refresh token (in OAuth *Testing* mode this happens every 7 days). Reconnect from Connected Accounts.
- **History expired**: logged; the account re-imports automatically without duplicates.
- **Dead jobs**: check `last_error` on the Operations page; fix the cause; jobs for the next slot are enqueued automatically.
