# PromptSatori

**Describe what you want. Receive an excellent prompt. Improve it effortlessly. Save it forever. Use it anywhere.**

PromptSatori is a prompt-engineering studio with its own home at **promptsatori.com** (it also opens at `/satori` on your Write.ai address). Type a plain request ("Create a marketing campaign for my construction business") and it returns a recommended prompt, three genuinely different alternatives, an explanation of why the prompt is built that way, the assumptions it made, and next steps — then lets you refine, version, test, and save it.

It installs as its own app on Mac, iPhone and iPad (separate icon from Write.ai).

| Page | What it does |
|---|---|
| **Generator** (`/satori`) | Plain-English request → recommended prompt + Concise / Comprehensive / Creative alternatives, "why this works", assumptions, missing context, next steps. Up to 3 clarifying questions (or **Generate now**). One-click refinements, free-form "How would you like to improve this prompt?", version history with compare and restore, voice input. |
| **Analyzer** | Paste any prompt: instant offline quick check + AI review across 7 dimensions with a 0–100 composite, weaknesses, missing info, suggestions, revised prompt, Before/After view. |
| **Testing Lab** | Run a prompt (with `{{variables}}` filled in) against up to 3 connected models side by side. Shows the model that actually answered, tokens, cost, latency. Editable criteria, your 1–5 ratings, optional AI first-pass rating, saved runs. |
| **Templates** | 32 original starter templates across Business, Marketing, Writing, Technology, Construction & Restoration, Personal Development, plus your own private templates. |
| **My Library** | Search, filter by model/category/collection, favorites, tags, archive, trash/restore, duplicate, card/list views, export Markdown/text/JSON, import JSON. Every prompt keeps its full version history. |
| **History** | Every generation, searchable; reopen to keep working. |
| **Settings** | Theme, accent color, text size, default target model, generation provider/model, named profiles, usage and limits, retention, export, delete all data. |

More: [Architecture](ARCHITECTURE.md) · [Security & privacy](SECURITY.md) · [Testing](TESTING.md) · [Status, limitations, next steps](STATUS.md)

---

## Setup (about 5 minutes on top of Write.ai)

PromptSatori reuses Write.ai's Supabase project, login and Claude key. If Write.ai already works, you need two steps.

1. **Database:** Supabase → **SQL Editor → New query** → paste [`supabase/migrations/0011_promptsatori.sql`](../../supabase/migrations/0011_promptsatori.sql) → **Run**. (Or paste all of [`supabase/setup-all.sql`](../../supabase/setup-all.sql) — safe to re-run.)
2. **Deploy** (push to the branch Vercel builds, or **Redeploy**). Open `https://YOUR-SITE/satori` and sign in.

That's it — `ANTHROPIC_API_KEY` from Write.ai's setup is the generation provider.

### Its own home: promptsatori.com

PromptSatori runs from the same code and deployment as Write.ai, but on **promptsatori.com** the whole site is PromptSatori: the home page is the generator, addresses are short (`/library`, `/lab`…), the sign-in page carries PromptSatori's name, and Write.ai's pages never appear. (A fully separate app with its own repo and database can come later.)

1. **Vercel** → your project → **Settings → Domains** → add `promptsatori.com`, then `www.promptsatori.com` (let Vercel redirect www to the main one).
2. **At your domain registrar**, add the DNS records Vercel shows you (usually an `A` record for `promptsatori.com` and a `CNAME` for `www`). Vercel turns green and issues the HTTPS certificate on its own, usually within minutes.
3. **Supabase** → **Authentication → URL Configuration** → under **Redirect URLs** add `https://promptsatori.com/auth/callback` (and the `www` one). Keep Write.ai's Site URL as it is. Without this step, sign-in emails and Google send you back to Write.ai's address.
4. Open **https://promptsatori.com** and sign in. Sign-in is per domain, so you sign in once here even if you're signed in to Write.ai. Same account, same data.

No new keys are needed. To use a different or extra domain, set `SATORI_HOSTS` (comma-separated, e.g. `promptsatori.com,www.promptsatori.com,promptsatori.app`) and redeploy.

### Optional settings (Vercel → Settings → Environment Variables)

| Name | What it does |
|---|---|
| `SATORI_HOSTS` | Domains that open straight into PromptSatori (default `promptsatori.com,www.promptsatori.com`) |
| `SATORI_RATE_PER_MINUTE` | AI requests per minute per user (default 12) |
| `SATORI_DAILY_REQUEST_LIMIT` | AI requests per day per user (default 300) |
| `SATORI_MONTHLY_BUDGET_USD` | Stop AI requests once this month's estimated cost reaches this (default 25; 0 = no cap) |
| `OPENAI_API_KEY` + `OPENAI_MODELS` | Adds OpenAI for generation and side-by-side tests. `OPENAI_MODELS` is a comma-separated list of model ids your account can use |
| `GEMINI_API_KEY` + `GEMINI_MODELS` | Same for Google Gemini (key from Google AI Studio) |
| `SATORI_PROVIDER` | Default generation provider: `anthropic`, `openai` or `gemini` |
| `SATORI_PRICES` | Prices for non-Claude models so cost estimates work: `{"openai:model-id":{"input":1.25,"output":10}}` (USD per million tokens) |

Extra providers appear only when **both** the key and the model list are set, so the app never guesses model names. Keys stay on the server.

### Install on a device

- **iPhone / iPad (Safari):** open promptsatori.com → Share → **Add to Home Screen**.
- **Mac (Safari 17+):** File → **Add to Dock**. **Chrome:** ⋮ → **Install PromptSatori**.

## Running locally

```bash
cp .env.example .env.local
```

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000/satori.

**Demo mode with no accounts** (for trying the UI or running tests): data lives in server memory, and a clearly labelled **test-only mock** stands in for AI. Mock output is never presented as real AI output, and neither flag works in a production build.

```bash
NEXT_PUBLIC_SATORI_LOCAL_ONLY=1 SATORI_MOCK_PROVIDER=1 npm run dev
```

## Deployment

Same as Write.ai: Vercel builds the repository, Supabase holds data. Checklist:

1. Migration `0011` run in Supabase.
2. `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_EMAIL` set (already true for Write.ai).
3. Optional limits/providers above. Redeploy after changing variables.
4. AI routes declare `maxDuration = 300` (seconds); thorough generations with the largest models can take 30–90 s. Check that your Vercel plan allows functions this long; if generations time out, pick a faster model in Settings → AI providers.
5. Visit `/satori`, check **Settings → AI providers** shows Claude as connected.

## Using it well

- Include **what you do, who it's for, and the outcome you want**. Everything else is optional.
- **Target model** shapes how the prompt is written (Claude: XML-style sections; ChatGPT/Gemini: Markdown headings; Universal: plain). The **generation provider** (Settings) is the service that writes it — changing one never changes the other.
- `{{placeholders}}` mark specifics PromptSatori won't invent (prices, names, measurements). Fill them in, or test with values in the Lab.
- Keyboard: `⌘/Ctrl+Enter` generate · `⌘/Ctrl+Shift+C` copy · `⌘/Ctrl+S` save · `⌘/Ctrl+Z` undo in the editor · `/` jump to the request · `?` list shortcuts.
