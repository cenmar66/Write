# Write.ai

Your personal AI writing studio: an AI document editor, social post templates, publishing, and voice dictation, all in one app for laptop, tablet, and phone.

**Status:** Phase 1 (setup + login) ✅ · Phase 2 editor + AI ✅ · Phase 3 dictation ✅ · Phase 4 voice profile ✅ · Phase 5 social templates ✅ · Phase 6 publishing ✅ · Home screen, styles, import ✅


> **New: [PromptDojo](docs/dojo/README.md)** — a prompt-engineering studio at `/dojo`: describe a task in plain words and get a recommended prompt, three alternatives, an explanation, refinements, version history, an analyzer, a testing lab and a library. Setup: run `supabase/migrations/0011_promptdojo.sql`, deploy, open `/dojo`.

> **New: [The Daily Canvas](docs/canvas/README.md)** — a calm daily planner at `/canvas` (paper-planner sections, voice, Apple Pencil, offline, Google Calendar/Tasks). Setup: run `supabase/migrations/0010_daily_canvas.sql`, deploy, open `/canvas`.

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
4. **Easiest:** paste all of [`supabase/setup-all.sql`](supabase/setup-all.sql) and click **Run**. It contains every database update (0001 to 0011), skips anything already done, and never deletes data, so it's safe to run again whenever the app gets a new update. (Or run them one by one:) Do the same with [`supabase/migrations/0002_documents.sql`](supabase/migrations/0002_documents.sql) (documents, folders, version history, chat), then [`0003_user_settings.sql`](supabase/migrations/0003_user_settings.sql) (app settings, like which AI model to use), then [`0004_voice.sql`](supabase/migrations/0004_voice.sql) (writing samples and your voice profile), then [`0005_posts.sql`](supabase/migrations/0005_posts.sql) (social posts and custom templates), then [`0006_publishing.sql`](supabase/migrations/0006_publishing.sql) (connected accounts, media storage, brand kit), then [`0007_styles.sql`](supabase/migrations/0007_styles.sql) (multiple writing styles and the Trash; your existing voice profile moves into a style called "My voice"), then [`0008_access_tokens.sql`](supabase/migrations/0008_access_tokens.sql) (access codes for your AI assistant).

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

### 4b. Deepgram API key (voice dictation)

1. Go to [console.deepgram.com](https://console.deepgram.com) and sign up. New accounts get $200 of free credit, which covers hundreds of hours of talking.
2. Open your project → **API Keys** → **Create a New API Key**.
3. Name it `write-ai`. Set the permission to **Member** (needed so the app can create short-lived keys for your browser) and the expiration to **Never**.
4. Copy the key and add it in Vercel as `DEEPGRAM_API_KEY` (type **Secret**, all environments), then redeploy.

### 5. Vercel (put it online)

1. Go to [vercel.com/new](https://vercel.com/new) → import the **cenmar66/write** GitHub repo.
2. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |
   | `ALLOWED_EMAIL` | `cenmarf@gmail.com` |
   | `ANTHROPIC_API_KEY` | your Claude API key |
   | `DEEPGRAM_API_KEY` | your Deepgram API key |

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

## The home screen

- **Describe what you want to write** in the box ("A LinkedIn post about the cost of a bad first hire") and press **Enter** or the arrow. A new document opens and the AI writes the first draft straight into it, title included.
- **+** attaches notes or sources (`.txt`, `.md`, `.docx`, `.html`) for the AI to draw from. The **mic** lets you say your idea instead of typing.
- **Style pill:** pick which writing style the draft uses (see *Writing styles* below).
- **Import draft** turns files into documents, keeping headings, lists, bold, and links. **New draft** opens a blank page.
- **Drafts** lists your documents by Today, Last 7 Days, Last 30 Days, and Older. The magnifier searches them; hover a row for the trash icon.
- **Sidebar:** Search, Posts, Calendar, Settings, Styles, your **Folders** (the **+** adds one), **Drafts** (all documents), and **Trash** (restore or delete forever).

## Using the editor

- **Autosave:** every change saves within a second. The badge at the top says *Saved*.
- **AI on any text:** highlight words, then tap **Ask AI**: Rewrite, Shorten, Expand, Fix grammar, Simplify (7th-grade level), or Change tone. You see the draft first and choose **Replace**, **Insert below**, or **Try again**.
- **Continue writing:** tap the button at the bottom, or press **⌘J** (Mac) / **Ctrl+J** (Windows).
- **Chat:** the speech bubble at the top opens a chat that can see your whole document. Any reply can be inserted into the doc.
- **Version history:** the clock icon. A snapshot is saved before every AI change, when you open a doc, and when you tap *Save now*. Tap any version to preview it and restore it.
- **Export:** the download icon gives you Word, PDF (choose "Save as PDF" in the print window), or Markdown.

## Voice dictation

- **Start:** tap the black mic in the editor's bottom bar, or press **⌘ + Shift + Space** (Mac) / **Ctrl + Shift + Space** (Windows). Press the shortcut again to finish. On the home screen, the mic in the prompt box dictates your idea.
- **Talk naturally** in English, Spanish, or both. Your words appear live as you speak.
- **When you stop,** the AI removes "um" and "uh", fixes punctuation, and keeps only your corrections ("Monday, no wait, Tuesday" becomes "Tuesday"). Pick **Cleaned up** or **Exactly as said**, then **Insert**. Tick **Skip this step next time** to insert the cleaned text straight away.
- **Spoken formatting:** "new paragraph", "new line", "comma", "period", "make that a bullet list", "numbered list".
- **Voice commands:** say only a command, like "rewrite that shorter", "fix the grammar", "make it more professional", "make that a heading", or "delete that". It acts on your highlighted text, or on what you just dictated.
- **Phones:** works in Safari (iPhone/iPad) and Chrome (Android). The first time, allow microphone access when asked.

## Writing styles

Open **Styles** in the menu. A style is a way of writing the AI learns from examples: "My voice", "Client emails", "Newsletter", or even an author you admire.

1. **New style**, then give it a name and a short description.
2. **Add samples:** paste text, upload `.txt`, `.md`, or `.docx` files, or pick from your documents. Aim for 1,500+ words across 3 to 10 pieces. English, Spanish, or both. (For PDFs, copy and paste the text.)
3. **Build this style:** the AI writes a profile covering tone, sentence style, word choice, formatting, how languages are mixed, favorite phrases, words to avoid, and do's and don'ts.
4. **Edit anything** by hand and tap **Save changes**. **Test drive** rewrites bland text in the style.
5. **Make default** picks the style used when you don't choose one.

**Where styles apply:** each document can have its own style (model menu in the editor's bottom bar), the home prompt box and post composer have a style pill, and the repurposer uses the document's style unless you pick another. Styles apply to every AI action and to chat replies, but not to grammar fixes or dictation cleanup (your exact words stay). The switch at the top of the Styles page turns them off everywhere unless you pick one yourself.

## Social posts

Open **Posts** in the menu.

- **Templates:** 17 proven formats in six groups: hooks, lists, stories, how-tos, threads, and carousels. Pick one, type or dictate your idea (the mic is in the idea box), choose platforms, and tap **Draft my posts**. You get one post per platform, each written for that platform.
- **Platform rules built in:**

  | Platform | Limit | Notes |
  |---|---|---|
  | LinkedIn | 3,000 characters | Only about 210 show before "see more"; the card shows you exactly what does |
  | X | 280 per post | Links count as 23; threads supported |
  | Threads | 500 per post | Threads supported |
  | Facebook | 63,206 | Best under ~500 |
  | Instagram | 2,200-character caption | Carousels supported; up to 5 hashtag suggestions |

- **Edit freely:** the counter turns red when a post is too long. **Shorten to fit** trims it for you. Add or remove hashtags, edit thread posts and carousel slides, then **Copy** or **Save draft**.
- **Repurpose a document:** pick a document, the platforms, and how many posts per platform, and get a set of posts with different angles. In the editor, the megaphone button does this in one click.
- **Your own templates:** tap **New template**. Paste a post you love and tap **Fill in the template for me**, or write the structure yourself.
- **Drafts, Scheduled, Published** tabs keep everything organized.

Instagram's hashtag limit is in flux (30 per post on some accounts, 5 on newer ones), so the app suggests at most 5.

## Prompts and packs

**Posts → Prompts** is a library of writing prompts grouped into packs (Traits, Milestones, Tools, and more). Each prompt is tagged Atomic Essay, Short Form, LinkedIn, or Thread. Pick one, jot your answer (or dictate it), and the AI turns it into posts in your style.

**Create a pack with AI:** type any theme (for example "lessons from the restoration business") and, optionally, a line about you. Claude writes a fresh pack of 6-12 prompts. Remove the ones you don't want, rename the pack, and **Save pack**. Your packs appear first in the grid; the trash icon deletes one. (Needs the `0009` database update, included in `supabase/setup-all.sql`.)

## Publishing and scheduling

Open any saved post (Posts → Drafts) to publish it:

- **Post now** sends it right away. **Schedule** picks a date and time; the app checks for due posts and sends them (once a day on Vercel's free Hobby plan; every 5 minutes with the Supabase timer below or on Vercel Pro).
- **Media:** add photos or a video, tap **Make a quote card** (uses your brand kit), or **Turn slides into images** for carousels. Instagram needs at least one image or video: 1 image = photo post, 2 to 10 = carousel, 1 video = Reel.
- **X** stays manual: **Copy & open X** copies your post and opens X ready to paste. "Scheduling" an X post sets a reminder; when it's due it shows **Ready to post**.
- **Calendar:** week and month views of everything scheduled, published, or failed. Tap any post to open it.
- **If something fails,** the post is marked **Failed** with the reason, and you can tap **Try again**. If an account's login expired, Settings shows **Reconnect**.

**Substack:** in any document, tap the newspaper icon. The AI suggests a title, subtitle, preview text, and a teaser Note. Then either **Create Substack draft** (lands in your Substack drafts; you publish from Substack) or **Copy formatted + open Substack** (paste into a new post). Substack has no official API, so drafts use your login cookie (stored encrypted). Notes can't be drafted through any API, so the Note is copied and Substack Notes opens.

| Platform | How it posts | Cost | Notes |
|---|---|---|---|
| LinkedIn | Automatic | Free | Personal profile works right away; company page after LinkedIn approves your app |
| Facebook Page | Automatic | Free | One login connects Facebook and Instagram |
| Instagram | Automatic | Free | Business or Creator account linked to a Facebook Page. About 50 to 100 API posts per day |
| Threads | Automatic | Free | Up to 250 posts per day; login refreshes itself |
| X | Copy + open | Free | X's posting API is paid, so it's done by hand |
| Substack | Drafts only | Free | Unofficial; copy backup always works |

### Setup for publishing (one time, about 45 minutes)

**A. Three new settings in Vercel** (Settings → Environment Variables, type **Secret**, all environments, then redeploy):

| Name | What to put |
|---|---|
| `ENCRYPTION_KEY` | A long random password (40+ characters) from your password manager. **Never change it** later, or saved connections stop working. |
| `CRON_SECRET` | Another long random password. Vercel uses it when running the scheduler. |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **Secret keys** → create one (starts with `sb_secret_`). |

The scheduler is set up in `vercel.json` to run **once a day** (8 AM Pacific), because Vercel's free Hobby plan allows nothing more often. A more frequent schedule makes Vercel refuse to deploy the app at all.

**Want posts to go out on time (every 5 minutes) for free?** Let Supabase run the timer instead. In Supabase, go to **Database → Extensions** and turn on `pg_cron` and `pg_net`. Then run this in the SQL Editor, replacing the two values:

```sql
select cron.schedule('publish-due-posts', '*/5 * * * *', $$
  select net.http_get(
    url := 'https://YOUR-SITE.vercel.app/api/cron/publish',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
  );
$$);
```

(On Vercel Pro you can instead change the schedule in `vercel.json` to `*/5 * * * *`.)

**B. Instagram + Facebook** (one Meta app, one login):

1. **Make Instagram a professional account:** Instagram app → your profile → ☰ menu → **Settings and activity** → **Account type and tools** → **Switch to professional account** → choose a category → **Business** (or Creator).
2. **Have a Facebook Page:** if you don't have one, create it at facebook.com/pages/create.
3. **Link them:** on Facebook, open your Page → **Settings** → **Linked accounts** → **Instagram** → **Connect** and sign in to Instagram.
4. **Create the Meta app:** go to developers.facebook.com → **My Apps** → **Create app**. Name it `Write.ai`. When asked for use cases, pick the ones for **managing your Facebook Page** and **managing content on Instagram** (Meta renames these often; choose the closest match). If asked for an app type, choose **Business**.
5. In the app: **App settings → Basic** → copy **App ID** and **App secret** into Vercel as `META_APP_ID` and `META_APP_SECRET`.
6. Open **Facebook Login** (or "Facebook Login for Business") → **Settings** → under **Valid OAuth Redirect URIs** add `https://YOUR-APP.vercel.app/api/connect/meta/callback` → **Save**.
7. Leave the app in **Development** mode. Because you're the app's admin, it works with your own Page and Instagram without Meta's App Review.
8. Redeploy, then in Write.ai: **Settings → Connected accounts → Connect with Facebook**, approve everything, and choose your Page.

**B2. Instagram without Facebook** (optional, instead of B for Instagram):

Use this if your Instagram isn't linked to a Facebook Page. Your Instagram must be a **Business** or **Creator** account (Instagram app → Settings → Account type and tools).

1. In your Meta app (developers.facebook.com → My Apps), add the use case **Manage messaging & content on Instagram** and choose **API setup with Instagram login** (Meta's wording changes; pick the "Instagram login" option, not "Facebook login").
2. On that setup page, copy the **Instagram app ID** and **Instagram app secret** (different from the main App ID) into Vercel as `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.
3. Under **Set up Instagram business login → Business login settings**, add the redirect URL `https://YOUR-APP.vercel.app/api/connect/instagram/callback` (Settings shows the exact address with a Copy button).
4. **App roles → Roles → Add people → Instagram Tester**: add your Instagram username, then accept it in Instagram: Settings → **Apps and websites** → **Tester invites**.
5. Redeploy, then **Settings → Instagram (without Facebook) → Connect Instagram**. The login lasts 60 days and renews itself whenever a post goes out.

If both are connected, the direct Instagram connection is the one used for Instagram posts.

**C. Threads** (same Meta app):

1. In your Meta app, add the use case **Access the Threads API**.
2. In its **Settings**, copy the **Threads app ID** and **Threads app secret** (they're different from the main app's) into Vercel as `THREADS_APP_ID` and `THREADS_APP_SECRET`.
3. Under **Redirect callback URLs** add `https://YOUR-APP.vercel.app/api/connect/threads/callback`.
4. **App roles → Roles → Add people → Threads Tester**: add your Threads username. Then accept the invite in the Threads app: profile → ☰ → **Account** → **Website permissions** → **Invites**.
5. Redeploy, then **Settings → Connect** next to Threads.

**D. LinkedIn:**

1. Go to linkedin.com/developers/apps → **Create app**. It must be associated with your **LinkedIn Company Page**.
2. **Products** tab: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** (both approved instantly).
3. **Auth** tab: copy **Client ID** and **Primary Client Secret** into Vercel as `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. Under **Authorized redirect URLs** add `https://YOUR-APP.vercel.app/api/connect/linkedin/callback`.
4. Redeploy and **Connect** LinkedIn. You can post to your **personal profile** right away.
5. **Company page posting:** in **Products**, request **Community Management API** and complete LinkedIn's form (business details and verification; approval can take a few weeks). LinkedIn sometimes requires this product to live on its own separate app; if so, create a second app and use its Client ID and Secret instead. Once approved, set `LINKEDIN_ORGANIZATION_POSTING` to `true` in Vercel, redeploy, reconnect LinkedIn, and choose your company under **Post as**.
6. LinkedIn logins last about 60 days. When Settings says **Reconnect**, tap it.

**E. Substack:** Settings → Connected accounts → Substack → **Connect**. The form explains how to copy your `substack.sid` cookie.

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

## Letting your AI assistant in

Your assistant gets its own **access code** instead of your login. Codes only work with the assistant API below. They can't open the app's pages or change settings.

1. **Settings → Access codes for assistants → New code.** Name it, choose **Read only** or **Read and write**, and pick an expiry.
2. Copy the code (it starts with `wai_`). It's shown once; only a fingerprint is stored.
3. Give your assistant the code and the address `https://YOUR-SITE/api/v1`. It sends the code as a header: `Authorization: Bearer wai_…`.

| Request | What it does |
|---|---|
| `GET /api/v1` | Checks the code works and lists everything below |
| `GET /api/v1/documents?q=word` | Lists or searches documents (newest first) |
| `GET /api/v1/documents/{id}` | Reads one document as Markdown |
| `POST /api/v1/documents` | Creates a document: `{ "title": "…", "markdown": "…" }` (write codes) |
| `PATCH /api/v1/documents/{id}` | Replaces text (`markdown`), adds to the end (`append`), or renames (`title`). The old version is saved in History first (write codes) |
| `DELETE /api/v1/documents/{id}` | Moves a document to the Trash (write codes) |
| `GET /api/v1/styles` | Lists your writing styles, so the assistant can write like you |

**Needs:** the `0008` database update (included in `supabase/setup-all.sql`) and `SUPABASE_SECRET_KEY` set in Vercel. Revoke a code in Settings and it stops working immediately.

## Privacy

- **Your documents** live in your own Supabase database, locked so only your account can read them.
- **Claude (the AI):** the app uses Anthropic's paid API. Under Anthropic's commercial terms, what you send through the API isn't used to train their models. Requests may be kept for a short time for safety checks, then deleted.
- **Deepgram (dictation):** the app asks Deepgram not to keep your audio for improving its models (the `mip_opt_out` setting).
- **Social posts** become public on the platform once you publish them, of course.
- No analytics or tracking scripts are included.

## Expected monthly cost

| Service | Cost |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 |
| Claude API (normal personal use) | ~$5–20 (about 1–3¢ per AI edit, 2–5¢ per chat message) |
| Deepgram (~10 hrs of talking) | ~$5, covered by the $200 free credit for a long time |
| X / Twitter | $0 (we use a "copy + open X" button) |
| LinkedIn, Facebook, Instagram, Threads, Substack | $0 |
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
  components/dictation/ # the dictation panel
  components/social/  # post cards, platform picker, results grid
  lib/social/         # platform rules, templates, post prompts, quote cards
  lib/publish/        # posting to LinkedIn, Facebook, Instagram, Threads, Substack (server-only)
  app/api/cron/       # the scheduler (Vercel daily, or Supabase every 5 minutes)
  lib/dictation/      # microphone capture + live Deepgram transcription
  lib/ai/             # prompts, model list, voice profile, and providers (Claude today, local AI later)
  lib/supabase/       # database/login helpers
  proxy.ts            # checks every request: are you the owner?
supabase/migrations/  # database setup scripts (run in order)
scripts/make-icons.mjs  # regenerates app icons
```
