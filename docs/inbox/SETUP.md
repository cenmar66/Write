# Setup

Everything Write.ai already needs (Supabase URL/key, `ALLOWED_EMAIL`, `ANTHROPIC_API_KEY`) plus the steps below.

## 1. Database

Supabase → SQL Editor → run `supabase/migrations/0011_inboxpilot.sql` (or paste all of `supabase/setup-all.sql`; it's safe to re-run).

## 2. Environment variables (Vercel → Settings → Environment Variables)

| Name | Required | What |
|---|---|---|
| `ENCRYPTION_KEY` | yes | 40+ random characters. Encrypts mailbox tokens and signs send confirmations. Already used by Write.ai; never change it after connecting accounts. |
| `SUPABASE_SECRET_KEY` | yes | Supabase secret (service-role) key. Server-only: reads encrypted tokens and runs the scheduler. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Gmail | Same OAuth client The Daily Canvas uses is fine (add the redirect URI below). |
| `CRON_SECRET` | for background sync & scheduled briefings | Any long random string; Vercel Cron sends it. |
| `ANTHROPIC_API_KEY` | for AI features | Already set for Write.ai. |
| `OPENAI_API_KEY`, `OPENAI_MODEL` (or `OPENAI_MODEL_FAST/BALANCED/BEST`), `OPENAI_PRICE_IN/OUT` | optional | Only if you choose OpenAI in Settings. Prices are USD per million tokens, used for cost tracking. |
| `INBOX_DEFAULT_PLAN` | optional | `dev` (default: everything on), `personal`, `professional`, `team`: to test plan limits. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | not used yet | Billing isn't implemented; Settings says so. |

Development only (ignored in production builds): `INBOX_LOCAL_DEMO=1` (in-memory data, no sign-in), `INBOX_SIMULATED_AI=1` (labelled fake AI).

## 3. Google Cloud (Gmail)

1. console.cloud.google.com → your project → **APIs & Services → Library → Gmail API → Enable**.
2. **OAuth consent screen → Data access → Add scopes**: `.../auth/gmail.readonly`, `.../auth/gmail.modify`, `.../auth/gmail.send` (plus `openid`, `email`). Google will mark the Gmail ones as restricted/sensitive.
3. **Credentials → your Web OAuth client → Authorized redirect URIs**: add `https://YOUR-DOMAIN/api/inbox/gmail/callback` (and `http://localhost:3000/api/inbox/gmail/callback` for local testing).
4. **Audience**: for owner-only use, add your Gmail address as a test user. Note: in *Testing* status, refresh tokens for these scopes expire after 7 days (you'll see “Reconnect needed” weekly). Publishing the app to *Production* without verification avoids the weekly expiry for personal use (Google shows an “unverified app” warning; 100-user cap). Public launch requires verification + a CASA security assessment — see [SECURITY.md](SECURITY.md).

## 4. Background jobs

`vercel.json` schedules `/api/cron/inbox` every 10 minutes (sync each account, due briefings, retention pruning). Sub-daily cron schedules need a Vercel Pro plan. Without `CRON_SECRET` nothing runs in the background; “Sync now” and “Brief me now” still work.

## 5. First run

Deploy → open `/inbox` → onboarding: workspace → Connect Gmail → permissions → VIPs → organization style → AI permissions → briefing time → initial analysis → recommended rules → dashboard.

## Local development

```bash
npm install
INBOX_LOCAL_DEMO=1 INBOX_SIMULATED_AI=1 npm run dev     # no accounts needed
```

With a real Supabase project, leave those two unset and fill `.env.local` from `.env.example`.
