# PromptDojo

**Describe what you want. Receive an excellent prompt. Improve it effortlessly. Save it forever. Use it anywhere.**

PromptDojo is a prompt-engineering studio that lives inside Write.ai at **`/dojo`**. Type a plain request ("Create a marketing campaign for my construction business") and it returns a recommended prompt, three genuinely different alternatives, an explanation of why the prompt is built that way, the assumptions it made, and next steps — then lets you refine, version, test, and save it.

It installs as its own app on Mac, iPhone and iPad (separate icon from Write.ai).

| Page | What it does |
|---|---|
| **Generator** (`/dojo`) | Plain-English request → recommended prompt + Concise / Comprehensive / Creative alternatives, "why this works", assumptions, missing context, next steps. Up to 3 clarifying questions (or **Generate now**). One-click refinements, free-form "How would you like to improve this prompt?", version history with compare and restore, voice input. |
| **Analyzer** | Paste any prompt: instant offline quick check + AI review across 7 dimensions with a 0–100 composite, weaknesses, missing info, suggestions, revised prompt, Before/After view. |
| **Testing Lab** | Run a prompt (with `{{variables}}` filled in) against up to 3 connected models side by side. Shows the model that actually answered, tokens, cost, latency. Editable criteria, your 1–5 ratings, optional AI first-pass rating, saved runs. |
| **Templates** | 32 original starter templates across Business, Marketing, Writing, Technology, Construction & Restoration, Personal Development, plus your own private templates. |
| **My Library** | Search, filter by model/category/collection, favorites, tags, archive, trash/restore, duplicate, card/list views, export Markdown/text/JSON, import JSON. Every prompt keeps its full version history. |
| **History** | Every generation, searchable; reopen to keep working. |
| **Settings** | Theme, accent color, text size, default target model, generation provider/model, named profiles, usage and limits, retention, export, delete all data. |

More: [Architecture](ARCHITECTURE.md) · [Security & privacy](SECURITY.md) · [Testing](TESTING.md) · [Status, limitations, next steps](STATUS.md)

---

## Setup (about 5 minutes on top of Write.ai)

PromptDojo reuses Write.ai's Supabase project, login and Claude key. If Write.ai already works, you need two steps.

1. **Database:** Supabase → **SQL Editor → New query** → paste [`supabase/migrations/0011_promptdojo.sql`](../../supabase/migrations/0011_promptdojo.sql) → **Run**. (Or paste all of [`supabase/setup-all.sql`](../../supabase/setup-all.sql) — safe to re-run.)
2. **Deploy** (push to the branch Vercel builds, or **Redeploy**). Open `https://YOUR-SITE/dojo` and sign in.

That's it — `ANTHROPIC_API_KEY` from Write.ai's setup is the generation provider.

### Optional settings (Vercel → Settings → Environment Variables)

| Name | What it does |
|---|---|
| `DOJO_RATE_PER_MINUTE` | AI requests per minute per user (default 12) |
| `DOJO_DAILY_REQUEST_LIMIT` | AI requests per day per user (default 300) |
| `DOJO_MONTHLY_BUDGET_USD` | Stop AI requests once this month's estimated cost reaches this (default 25; 0 = no cap) |
| `OPENAI_API_KEY` + `OPENAI_MODELS` | Adds OpenAI for generation and side-by-side tests. `OPENAI_MODELS` is a comma-separated list of model ids your account can use |
| `GEMINI_API_KEY` + `GEMINI_MODELS` | Same for Google Gemini (key from Google AI Studio) |
| `DOJO_PROVIDER` | Default generation provider: `anthropic`, `openai` or `gemini` |
| `DOJO_PRICES` | Prices for non-Claude models so cost estimates work: `{"openai:model-id":{"input":1.25,"output":10}}` (USD per million tokens) |

Extra providers appear only when **both** the key and the model list are set, so the app never guesses model names. Keys stay on the server.

### Install on a device

- **iPhone / iPad (Safari):** open `/dojo` → Share → **Add to Home Screen**.
- **Mac (Safari 17+):** File → **Add to Dock**. **Chrome:** ⋮ → **Install PromptDojo**.

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

Open http://localhost:3000/dojo.

**Demo mode with no accounts** (for trying the UI or running tests): data lives in server memory, and a clearly labelled **test-only mock** stands in for AI. Mock output is never presented as real AI output, and neither flag works in a production build.

```bash
NEXT_PUBLIC_DOJO_LOCAL_ONLY=1 DOJO_MOCK_PROVIDER=1 npm run dev
```

## Deployment

Same as Write.ai: Vercel builds the repository, Supabase holds data. Checklist:

1. Migration `0011` run in Supabase.
2. `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ALLOWED_EMAIL` set (already true for Write.ai).
3. Optional limits/providers above. Redeploy after changing variables.
4. AI routes declare `maxDuration = 300` (seconds); thorough generations with the largest models can take 30–90 s. Check that your Vercel plan allows functions this long; if generations time out, pick a faster model in Settings → AI providers.
5. Visit `/dojo`, check **Settings → AI providers** shows Claude as connected.

## Using it well

- Include **what you do, who it's for, and the outcome you want**. Everything else is optional.
- **Target model** shapes how the prompt is written (Claude: XML-style sections; ChatGPT/Gemini: Markdown headings; Universal: plain). The **generation provider** (Settings) is the service that writes it — changing one never changes the other.
- `{{placeholders}}` mark specifics PromptDojo won't invent (prices, names, measurements). Fill them in, or test with values in the Lab.
- Keyboard: `⌘/Ctrl+Enter` generate · `⌘/Ctrl+Shift+C` copy · `⌘/Ctrl+S` save · `⌘/Ctrl+Z` undo in the editor · `/` jump to the request · `?` list shortcuts.
