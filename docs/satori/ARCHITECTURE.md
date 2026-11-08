# PromptSatori architecture

```
Browser (React client components, src/components/satori/)
   │  fetch JSON                       drafts/session in localStorage
   ▼
/api/satori/*  (route handlers: auth, validation, limits, usage — no prompt logic)
   │
   ├── services/ (one function per job: generate, refine, analyze, adapt, template,
   │      compare, judge, run)  ──► runStructured(): meta-prompt → provider → JSON
   │                                  → Zod validation → one repair retry
   │         │
   │         ├── meta-prompts/  versioned system prompts (the "intellectual core")
   │         ├── targets.ts     versioned target-model guidance (config, not claims)
   │         └── providers/     Anthropic SDK · OpenAI REST · Gemini REST · test mock
   │
   └── store/  SatoriStore interface ──► Supabase (RLS)  |  memory (demo/tests)
```

Layers never reach upward: services don't know about HTTP; routes don't contain prompt text; components only call `/api/satori`.

## Key ideas

**Target model vs. generation provider.** `TargetSpec` (Claude / ChatGPT / Gemini / Universal / Custom) only changes the guidance block inside the meta-prompt. The generation provider is resolved separately (explicit choice → Settings → `SATORI_PROVIDER` → first configured). Tests assert they stay independent.

**Versioned meta-prompts.** `src/lib/satori/meta-prompts/index.ts` holds every system prompt with an `id` and `version`. Each generation stores the meta-prompt version and schema version used. To change one: edit, bump the version, run `npm test` (structural invariants) and `npm run eval:satori` (live quality report).

The generation meta-prompt asks the model to: find the real objective, separate known facts from assumptions, pick needed expertise, identify inputs, build an instruction hierarchy, add only useful constraints, define observable success, choose output structure, apply target guidance, write three meaningfully different alternatives, explain the design, and never fabricate (use `{{placeholders}}` instead).

**Validated, versioned output.** `src/lib/satori/schema.ts` defines Zod schemas (`satori.generation.v1`, etc.). The JSON schema sent to providers is derived from them (`toProviderSchema` strips keywords structured-output modes reject, closes every object). Responses are parsed with Zod; on failure the runner retries once, telling the model what was wrong, then fails cleanly. Business rules that JSON schema can't express (exactly one concise/comprehensive/creative alternative, non-empty prompts, score clamping) live in the Zod schema.

**Untrusted data.** User text, pasted prompts and imports go inside `<satori_…>` blocks (`untrusted.ts`). Look-alikes of those delimiters are defanged so content can't close a block; every meta-prompt carries a rule that block contents are data, not instructions. Ordinary XML in prompts (e.g. `<instructions>` written for Claude) is preserved.

**Immutable versions.** Refining, editing, adapting or restoring always appends a version; nothing is overwritten. In the generator, each of the four tabs has its own version track; once saved to the library, new versions are written to the database *before* they appear on screen.

**Never lose text.** The request, options and the whole current session are saved to `localStorage` on every change; failed requests leave the input untouched and offer Retry. A service worker caches the app shell for offline opening.

## Providers

| Provider | Transport | Notes |
|---|---|---|
| Anthropic (Claude) | `@anthropic-ai/sdk` (`beta.messages.create` with `output_config.format` JSON schema, effort, server-side refusal fallback) | Reports the model that actually answered (fallback can change it) |
| OpenAI | REST `chat/completions` with `response_format: json_schema` (strict) | Enabled only with `OPENAI_API_KEY` + `OPENAI_MODELS`. Not exercised against a live account in this repo |
| Gemini | REST `generateContent` with `responseJsonSchema` | Enabled only with `GEMINI_API_KEY` + `GEMINI_MODELS`. Not exercised against a live account in this repo |
| Mock | In-process | **Tests only.** Requires `SATORI_MOCK_PROVIDER=1` and a non-production build; every output is marked `[MOCK]` and the UI shows a warning badge |

Adding a provider: implement `SatoriProvider` (`providers/types.ts`) and list it in `providers/index.ts`.

## Images, websites and tools

- **Images** (`context.ts`, `components/satori/attachments.tsx`): the browser resizes to ≤1568 px and re-encodes (JPEG, or PNG with transparency), then sends base64 in the request body (routes that accept images allow ~4 MB; Vercel's limit is 4.5 MB). Each provider gets them in its own format: Claude image blocks, OpenAI `image_url` / `input_image`, Gemini `inlineData`.
- **Websites** (`web.ts`, `/api/satori/web/preview`): server-side fetch with SSRF protection (public addresses only, every redirect re-checked, 12 s / 2 MB limits, text types only), HTML reduced to readable text (≤15,000 chars). The text is sent as `<satori_source_N>` data blocks: the generator meta-prompt (`generate.v2`, `clarify.v2`) is told to use it as background facts and never follow instructions inside it.
- **Web search and connected apps** (Testing Lab, providers with `supportsTools`, i.e. Claude): `web_search_20260209` (max 5 uses) and the MCP connector (`mcp-client-2025-11-20` beta: `mcp_servers` + one `mcp_toolset` per server). The adapter resumes `pause_turn` up to 4 times and reports tool use as plain-words "activity". Other providers run without tools and the result says so.
- **Connectors** are stored in `satori_connectors` (migration 0015) with the token AES-256-GCM-encrypted by the server (`lib/crypto.ts`); the browser only ever sees `has_token`. Decrypted tokens exist only for the duration of a Lab run.

## Database (migration `0011_promptsatori.sql`)

| Table | Purpose |
|---|---|
| `satori_profiles`, `satori_preferences` | Named personalization profiles; one settings row per user |
| `satori_generations`, `satori_alternatives` | Each generation request with its validated result, provider/model, meta-prompt + schema versions; alternatives normalized |
| `satori_prompts`, `satori_prompt_versions`, `satori_refinements` | Library items (current copy denormalized for search), immutable versions (numbered by trigger under a row lock), refinement links between versions |
| `satori_collections`, `satori_tags`, `satori_prompt_tags` | Organization |
| `satori_templates` | Private user templates (starter templates ship in code) |
| `satori_test_runs`, `satori_analyses` | Testing Lab runs (output, tokens, cost, ratings, AI judge) and Analyzer results |
| `satori_usage` | One row per AI call: kind, provider, model, tokens, estimated cost — **no prompt text** |
| `satori_credit_ledger` | Optional, append-only, idempotency-keyed credit ledger for a future paid plan; users can read, only the service role can write |

Every table: `user_id default auth.uid()`, RLS "own rows only", and write policies that also check referenced ids (collection, prompt, tag, profile, generation) belong to the same user. Versions and ledger rows have no update policy and an update-blocking trigger. Functions: `satori_apply_retention(days)`, `satori_delete_my_data()`, `satori_credit_balance()`. Behaviour is covered by `supabase/tests/satori.test.sql`.

## Limits and costs

`checkLimits()` runs before every AI call: a per-user sliding one-minute window (in memory, so per server instance), a daily request cap and a monthly estimated-spend cap (both read from `satori_usage`, so they hold across instances). Usage is recorded for successes and failures. Claude prices are built in (`pricing.ts`); other providers' prices come from `SATORI_PRICES` — unknown prices show "cost n/a" rather than a guess.

## Preparing for commercial features (Phase 5 — not built)

- **Credits:** `satori_credit_ledger` exists with idempotency keys. To switch on: verify Stripe webhooks server-side (signature check), write ledger rows with the Stripe event id as `idempotency_key` using the service role, check `satori_credit_balance()` inside `checkLimits()`, and reconcile periodically against Stripe. No checkout exists and none is simulated.
- **Teams / shared collections:** add a `workspace_id` to library tables and membership-based RLS policies alongside the owner policies; the store interface already isolates queries behind one module.
- **Admin controls:** the single-owner login lock (`ALLOWED_EMAIL`) would need replacing with real sign-up and roles first.

## Design choices worth knowing

- **No shadcn/ui or Radix.** The existing app uses hand-built Tailwind components; PromptSatori follows suit with a small set of primitives (`ui.tsx`) using native `<dialog>` for accessible modals, avoiding a large new dependency tree. Zod is the only new runtime dependency.
- **Client-rendered pages.** Like The Daily Canvas, pages render on the device and load data from `/api/satori` (`export const instant = false`); this keeps one data path for the Supabase and demo stores.
- **CSP without nonces.** A strict nonce CSP would force every page to render per request; the static policy allows Next's inline bootstrap but blocks third-party scripts, framing, plugins and unknown network origins.
