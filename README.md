# Write.ai

Your personal AI writing studio: an AI document editor, social post templates, publishing, and voice dictation, all in one app for laptop, tablet, and phone.

**Status:** Phase 1 (setup + login) ✅ · Phase 2 editor + AI ✅ · Phase 3 dictation · Phase 4 voice profile · Phase 5 social templates · Phase 6 publishing

---

## What's inside

| Piece | What it does |
|---|---|
| **Next.js 16** (TypeScript, Tailwind) | The app itself |
| **Supabase** | Login, database, file storage |
| **Vercel** | Hosting (keeps it online everywhere) |
| **Claude API** | All AI writing (Phase 2+) |
| **Deepgram** | Live voice dictation, English + Spanish (Phase 3) |

Only **cenmarf@gmail.com** can get in. The lock exists in three places: the database refuses any other sign-up, the server signs out any other account, and every page checks before it loads.

---

## One-time setup (about 20 minutes)

You'll copy a few values between websites. Keep a notes file open to paste them into as you go.

### 1. Supabase (database + login)

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
   - Name: `write-ai`. Pick a strong database password and save it. Region: **West US**.
2. When it's ready, open **Project Settings → API Keys** and copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Publishable key** (starts with `sb_publishable_`; older dashboards call it the **anon** key)
3. Open **SQL Editor → New query**, paste everything from [`supabase/migrations/0001_lock_signups.sql`](supabase/migrations/0001_lock_signups.sql), and click **Run**. This is the "nobody but me" lock.
4. Do the same with [`supabase/migrations/0002_documents.sql`](supabase/migrations/0002_documents.sql) (documents, folders, version history, chat) and then [`supabase/migrations/0003_user_settings.sql`](supabase/migrations/0003_user_settings.sql) (your app settings, like which AI model to use).

   > Whenever a new phase adds a file in `supabase/migrations/`, run it the same way, in number order.
5. **Upgrade to Pro** (you chose this): **Organization → Billing → Upgrade**.

### 2. Make the sign-in email include a 6-digit code

The installed phone app can't open email links (they open in Safari/Chrome instead), so the email will also include a code you can type in.

1. Supabase → **Authentication → Emails → Magic Link**.
2. Replace the message body with:
   ```html
   <h2>Sign in to Write.ai</h2>
   <p><a href="{{ .ConfirmationURL }}">Tap here to sign in</a></p>
   <p>Or enter this code: <strong>{{ .Token }}</strong></p>
   ```
3. Do the same in the **Confirm signup** template (used only for your very first login).

### 3. Google login

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project named `Write.ai`.
2. **APIs & Services → OAuth consent screen**: choose **External**, app name `Write.ai`, and your email for the contact fields. Under **Test users** (sometimes called **Audience**), add `cenmarf@gmail.com`. You can leave the app in "Testing" forever, since you're the only user.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**
   - **Authorized redirect URIs**: `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (use your Supabase Project URL)
4. Copy the **Client ID** and **Client secret**.
5. Back in Supabase: **Authentication → Sign In / Providers → Google** → turn it on → paste both → **Save**.

### 4. Claude API key (the AI)

1. Go to [platform.claude.com](https://platform.claude.com) and sign up or log in.
2. **Billing**: add a payment method and buy $10 of credits to start.
3. **Limits**: set a monthly spend limit (for example $30) so there are never surprises.
4. **API Keys → Create Key**: name it `write-ai` and copy it (it starts with `sk-ant-`). You only see it once.
5. Keep it for the next step. Never paste it anywhere except Vercel.

### 5. Vercel (put it online)

1. Go to [vercel.com/new](https://vercel.com/new) → import the **cenmar66/write** GitHub repo.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |
   | `ALLOWED_EMAIL` | `cenmarf@gmail.com` |
   | `ANTHROPIC_API_KEY` | your Claude API key |

   Added a variable after deploying? Go to **Deployments → ⋯ → Redeploy** so it takes effect.
3. Click **Deploy**. You'll get a web address like `write-ai-xxxx.vercel.app`.
4. **Upgrade to Pro**: **Settings → Billing**.
5. **Production branch:** until this work is merged into `main`, go to **Settings → Git → Production Branch** and set it to `claude/ai-writing-app-plan-21oakz`. (Or ask Claude to open a pull request into `main`.)

### 6. Tell Supabase your web address

Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://YOUR-APP.vercel.app`
- **Redirect URLs**: add
  - `https://YOUR-APP.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (only needed if you run it on your computer)

### 7. Log in, then close the door

1. Open your Vercel address and sign in with Google (or email).
2. Optional extra lock: Supabase → **Authentication → Sign In / Providers** → turn **off** "Allow new users to sign up". The database already blocks everyone else, so this is belt and suspenders.

### 8. Install it on your phone

- **iPhone (Safari):** open the site → **Share** → **Add to Home Screen**.
- **Android (Chrome):** open the site → **⋮** menu → **Install app**.

Inside the installed app, sign in with Google or with the 6-digit email code.

---

## Using the editor

- **Autosave:** every change saves within a second. The badge at the top says *Saved*.
- **AI on any text:** highlight words, then tap **Ask AI**: Rewrite, Shorten, Expand, Fix grammar, Simplify (7th-grade level), or Change tone. You see the draft first and choose **Replace**, **Insert below**, or **Try again**.
- **Continue writing:** tap the button at the bottom, or press **⌘J** (Mac) / **Ctrl+J** (Windows).
- **Chat:** the speech bubble at the top opens a chat that can see your whole document. Any reply can be inserted into the doc.
- **Version history:** the clock icon. A snapshot is saved before every AI change, when you open a doc, and when you tap *Save now*. Tap any version to preview it and restore it.
- **Export:** the download icon gives you Word, PDF (choose "Save as PDF" in the print window), or Markdown.

## Choosing the AI model

Pick the model in **Settings → AI model**, or tap the little model name in the editor's bottom bar. Your choice is saved to your account, so it follows you to every device.

| Model | Best for | Rough cost |
|---|---|---|
| Claude Opus 5.5 (default) | Best all-round writing | ~2¢ per edit |
| Claude Sonnet 5.5 | Fast and sharp, half the price | ~1¢ per edit |
| Claude Haiku 5.5 | Quick fixes, cheapest | a fraction of a cent |
| Claude Fable 5.1 | Anthropic's most capable, premium price | ~5¢ per edit |

If your Claude account can't use a model, the AI shows a plain message and you can switch to another one.

**Local AI (later):** the app talks to AI through "providers" (`src/lib/ai/providers/`). Claude is one provider. A local model becomes a second provider file plus an entry in `src/lib/ai/models.ts`, and nothing else changes. One thing to know ahead of time: the app runs on Vercel's servers, so a model on your own computer has to be reachable from the internet (for example through a secure tunnel), or you run the app on that computer.

---

## Running it on your computer (optional, for developers)

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                   # open http://localhost:3000
```

---

## Expected monthly cost

| Service | Cost |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Claude API (normal personal use) | ~$5–20 (about 1–3¢ per AI edit, 2–5¢ per chat message) |
| Deepgram (from Phase 3; ~10 hrs of talking) | ~$5, covered by the $200 free credit for a long time |
| X / Twitter | $0 (we use a "copy + open X" button) |
| **Total** | **~$50–70/mo** |

---

## Project layout

```
src/
  app/
    (app)/            # pages behind login: home, docs, posts, calendar, settings
    api/ai/           # AI endpoints (edit + chat); the API key never leaves the server
    login/            # sign-in screen
    auth/             # login callback + sign out
    manifest.ts       # makes it installable as a phone app
  components/         # shared UI pieces (nav, logo, theme toggle)
  components/editor/  # the writing screen: AI menu, chat, history, export
  lib/ai/             # prompts, model list, and providers (Claude today, local AI later)
  lib/supabase/       # database/login helpers
  proxy.ts            # checks every request: are you the owner?
supabase/migrations/  # database setup scripts (run in order)
scripts/make-icons.mjs  # regenerates app icons
```
