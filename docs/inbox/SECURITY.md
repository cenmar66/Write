# Security & privacy checklist

✅ implemented and tested · 🟡 implemented, not verified against the live service · ⏳ not done

## Access & tenancy
- ✅ Sign-in: Write.ai's Supabase Auth with the owner-only lock (DB trigger, proxy, per-route check). `/inbox` and `/api/inbox/*` require a session (local demo bypass only when `NODE_ENV !== "production"`).
- ✅ Per-workspace RLS on every table; server-side membership checks give clean 403s (`requireWorkspace`). Cross-tenant reads/writes/membership escalation tested in `supabase/tests/inbox.test.sql`.
- ✅ Users can't grant themselves a plan (entitlements are read-only for members).
- ✅ Audit log is append-only.

## OAuth & tokens
- 🟡 Gmail OAuth 2.0 authorization-code flow with `access_type=offline`, `include_granted_scopes`, incremental scopes (read → organize → send).
- ✅ `state`: random nonce, sealed (AES-GCM) with the intent in an HttpOnly, Secure, SameSite=Lax cookie scoped to `/api/inbox/gmail`, single-use, 10-minute expiry. Forged/replayed states rejected (tested).
- ✅ Account email taken from the `id_token` only when `aud` matches our client id and email is verified; adding permissions must come from the same Google account.
- ✅ Tokens AES-256-GCM encrypted (`ENCRYPTION_KEY`), stored in a service-role-only table, never sent to the browser or exported.
- ✅ Refresh on expiry and on 401; `invalid_grant` → tokens wiped, account marked “Reconnect needed” (tested with a mocked Google).
- ✅ Disconnect revokes with Google, deletes tokens and all data from the account.

## Least privilege (Gmail scopes)
| Scope | Used for | Google classification* |
|---|---|---|
| `gmail.readonly` | sync, read, search (required) | Restricted |
| `gmail.modify` | labels, archive, read state (optional; never delete/trash/spam — enforced in code) | Restricted |
| `gmail.send` | send after explicit review (optional) | Sensitive |
| `openid email` | identify the account | Non-sensitive |

\* From Google's published scope list as known at build time; this session couldn't reach developers.google.com to re-check. **Verify in Google Cloud Console → OAuth consent screen → Data access before launch.**

### Google API Services User Data Policy / Limited Use
- Data from Gmail is used only to provide user-facing features in InboxPilot; not sold, not used for ads, not used to train generalized AI models; humans don't read it (except with consent, for security, or legal reasons).
- AI processing by a third-party provider is opt-in (`ai_external`), limited to the content level the user picks, and disclosed in Settings and onboarding.
- **Before public launch** (anyone other than the owner): restricted scopes require **app verification** and an annual **independent security assessment (CASA)** by a Google-approved assessor; publish a privacy policy that discloses Limited Use compliance and the AI processing.
- **Owner-only use today**: keep the consent screen in Testing with the owner as test user, *or* publish to Production unverified (shows the “unverified app” screen; 100-user cap). Testing-mode refresh tokens for such scopes **expire after 7 days**, so you'd reconnect weekly; publishing (still unverified, for personal use) avoids that. Confirm current rules in the console.

## Prompt injection & AI safety
- ✅ Email content is fenced as untrusted data with random, unforgeable fence ids; bidi/zero-width characters stripped; fake fence tags removed (tested).
- ✅ Injection patterns detected and flagged in the UI; flagged mail is treated as plain text.
- ✅ The AI has no tools. Every output is parsed against a JSON schema and re-validated with allow-lists; unknown values fall back to rule results; references to items the model wasn't shown are dropped (tested with a malicious fake provider).
- ✅ AI can't raise urgency without an explicit date, can't declare “critical” without hard evidence, can't override user corrections, sender settings or rules.
- ✅ No code path lets AI, rules, the assistant or dictation send mail. Sending requires `confirmed: true` + an HMAC token over the exact account/recipients/subject/body; a changed draft invalidates it (tested in e2e). Double-send prevented by an atomic claim.
- ✅ Replies are always sent from the account that received the message; recipients outside the conversation, first-time recipients, placeholders and simulated-AI text are flagged or blocked on the review screen.

## Data minimization & retention
- ✅ Message bodies stored only for `body_retention_days` (default 14; 0 = never). Metadata-first mode (0 days + headers-only AI) syncs headers only.
- ✅ AI sees only headers / headers + preview / trimmed text, per user setting (per account override).
- ✅ Export (JSON, no tokens) and permanent deletion.

## Input & output handling
- ✅ All route inputs validated (types, lengths, allow-lists); rule conditions/actions from an allow-list (no regex → no ReDoS); search terms sanitized before PostgREST filters.
- ✅ Header-injection guard in the RFC 5322 builder (tested).
- ✅ HTML email converted to text server-side (scripts/styles/hidden blocks dropped); React escapes everything rendered. Remote images and links in mail aren't rendered as HTML.
- ✅ CSV export neutralizes spreadsheet formulas.
- ✅ InboxPilot never opens unsubscribe links and never moves mail to spam/trash.
- ✅ Suspicious-sender warnings (display-name spoofing, reply-to mismatch, brand names from free-mail domains, DMARC failure).

## Abuse protection & operations
- ✅ Per-user rate limits on sync, AI, send, search, assistant (per instance, best effort) + Supabase limits.
- ✅ Monthly AI request cap per user.
- ✅ Cron endpoint requires `CRON_SECRET` (constant-time compare).
- 🟡 CI (`.github/workflows/ci.yml`): typecheck, lint, unit + SQL tests, production build, InboxPilot e2e, `npm audit` (high/critical; 0 found at build time) and a gitleaks secret scan. Added in this change; its first run on GitHub hasn't been observed yet. Also enable GitHub secret scanning + Dependabot in the repo settings.
- ⏳ Global (cross-instance) rate limiting (e.g. Upstash) for multi-user launch.

## Not claimed
No zero-knowledge encryption (the server decrypts tokens to call Gmail and can read stored mail). No compliance certifications (SOC 2, ISO, CASA) have been obtained.
