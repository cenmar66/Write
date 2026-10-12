# Write.ai

Your personal AI writing studio: an AI document editor, social post templates, publishing, and voice dictation, all in one app for laptop, tablet, and phone.

**Status:** Phase 1 (setup + login) ✅ · Phase 2 editor · Phase 3 dictation · Phase 4 voice profile · Phase 5 social templates · Phase 6 publishing

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
4. **Upgrade to Pro** (you chose this): **Organization → Billing → Upgrade**.

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

### 4. Vercel (put it online)

1. Go to [vercel.com/new](https://vercel.com/new) → import the **cenmar66/write** GitHub repo.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |
   | `ALLOWED_EMAIL` | `cenmarf@gmail.com` |

3. Click **Deploy**. You'll get a web address like `write-ai-xxxx.vercel.app`.
4. **Upgrade to Pro**: **Settings → Billing**.
5. **Production branch:** until this work is merged into `main`, go to **Settings → Git → Production Branch** and set it to `claude/ai-writing-app-plan-21oakz`. (Or ask Claude to open a pull request into `main`.)

### 5. Tell Supabase your web address

Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://YOUR-APP.vercel.app`
- **Redirect URLs**: add
  - `https://YOUR-APP.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (only needed if you run it on your computer)

### 6. Log in, then close the door

1. Open your Vercel address and sign in with Google (or email).
2. Optional extra lock: Supabase → **Authentication → Sign In / Providers** → turn **off** "Allow new users to sign up". The database already blocks everyone else, so this is belt and suspenders.

### 7. Install it on your phone

- **iPhone (Safari):** open the site → **Share** → **Add to Home Screen**.
- **Android (Chrome):** open the site → **⋮** menu → **Install app**.

Inside the installed app, sign in with Google or with the 6-digit email code.

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
| Claude API (normal personal use, from Phase 2) | ~$5–20 |
| Deepgram (from Phase 3; ~10 hrs of talking) | ~$5, covered by the $200 free credit for a long time |
| X / Twitter | $0 (we use a "copy + open X" button) |
| **Total** | **~$50–70/mo** |

---

## Project layout

```
src/
  app/
    (app)/            # pages behind login: home, docs, posts, calendar, settings
    login/            # sign-in screen
    auth/             # login callback + sign out
    manifest.ts       # makes it installable as a phone app
  components/         # shared UI pieces (nav, logo, theme toggle)
  lib/supabase/       # database/login helpers
  proxy.ts            # checks every request: are you the owner?
supabase/migrations/  # database setup scripts (run in order)
scripts/make-icons.mjs  # regenerates app icons
```
