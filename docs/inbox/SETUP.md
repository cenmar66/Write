# Setup

Everything Write.ai already needs (Supabase URL/key, `ALLOWED_EMAIL`, `ANTHROPIC_API_KEY`) plus the steps below.

## 1. Database

Supabase → SQL Editor → run `supabase/migrations/0012_inboxsatori.sql` (or paste all of `supabase/setup-all.sql`; it's safe to re-run).

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

## 4. Background jobs (Supabase runs them every 10 minutes)

Vercel's Hobby plan only allows daily crons, so Supabase calls InboxSatori instead (built-in `pg_cron` + `pg_net`, no extra service):

1. Supabase → **SQL Editor** → run `supabase/migrations/0013_inbox_scheduler.sql`. It turns on the two extensions and schedules the job `inboxsatori-sync`.
2. In the same editor, run this once with **your** `CRON_SECRET` value from Vercel (it's stored encrypted in Supabase Vault; never paste it anywhere else):
   ```sql
   select vault.create_secret('PASTE-YOUR-CRON_SECRET-HERE', 'inbox_cron_secret');
   ```
3. Check after ~10 minutes: `select status_code, created from net._http_response order by created desc limit 3;` should show `200`. The Operations page in InboxSatori shows sync jobs too.

To call a different address (e.g. your Write.ai domain): `select vault.create_secret('https://YOUR-DOMAIN/api/cron/inbox', 'inbox_cron_url');`. To stop it: `select cron.unschedule('inboxsatori-sync');`. If you rotate `CRON_SECRET` in Vercel, update the Vault secret too (Supabase → Project Settings → Vault).

Without this, nothing runs in the background; “Sync now” and “Brief me now” still work.

## 5. Its own domain: inboxsatori.com

InboxSatori runs from the same code and deployment as Write.ai. On **inboxsatori.com** the whole site is InboxSatori: `/` is the dashboard, short addresses work (`/mail`, `/brief`, `/followups`), the sign-in page carries InboxSatori's name, and Write.ai's pages never appear. (Override the domain list with `INBOX_HOSTS` if needed.)

1. **Vercel** → your Write.ai project → **Settings → Domains** → add `inboxsatori.com` and `www.inboxsatori.com`, then set the DNS records Vercel shows at your registrar.
2. **Supabase** → **Authentication → URL Configuration → Redirect URLs** → add `https://inboxsatori.com/auth/callback` (and the `www.` version).
3. **Google Cloud** → OAuth client → **Authorized redirect URIs** → add `https://inboxsatori.com/api/inbox/gmail/callback`. If you'll ever sign in with Google on this domain, also make sure the Supabase callback is listed (it already is for Write.ai).
4. Connect Gmail **from the domain you'll use**: the OAuth redirect follows the address in your browser.

## 6. First run

Deploy → open `/inbox` → onboarding: workspace → Connect Gmail → permissions → VIPs → organization style → AI permissions → briefing time → initial analysis → recommended rules → dashboard.

## Local development

```bash
npm install
INBOX_LOCAL_DEMO=1 INBOX_SIMULATED_AI=1 npm run dev     # no accounts needed
```

With a real Supabase project, leave those two unset and fill `.env.local` from `.env.example`.
