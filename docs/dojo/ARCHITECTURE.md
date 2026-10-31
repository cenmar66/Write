# PromptDojo architecture

```
Browser (React client components, src/components/dojo/)
   │  fetch JSON                       drafts/session in localStorage
   ▼
/api/dojo/*  (route handlers: auth, validation, limits, usage — no prompt logic)
   │
   ├── services/ (one function per job: generate, refine, analyze, adapt, template,
   │      compare, judge, run)  ──► runStructured(): meta-prompt → provider → JSON
   │                                  → Zod validation → one repair retry
   │         │
   │         ├── meta-prompts/  versioned system prompts (the "intellectual core")
   │         ├── targets.ts     versioned target-model guidance (config, not claims)
   │         └── providers/     Anthropic SDK · OpenAI REST · Gemini REST · test mock
   │
   └── store/  DojoStore interface ──► Supabase (RLS)  |  memory (demo/tests)
```

Layers never reach upward: services don't know about HTTP; routes don't contain prompt text; components only call `/api/dojo`.

## Key ideas

**Target model vs. generation provider.** `TargetSpec` (Claude / ChatGPT / Gemini / Universal / Custom) only changes the guidance block inside the meta-prompt. The generation provider is resolved separately (explicit choice → Settings → `DOJO_PROVIDER` → first configured). Tests assert they stay independent.

**Versioned meta-prompts.** `src/lib/dojo/meta-prompts/index.ts` holds every system prompt with an `id` and `version`. Each generation stores the meta-prompt version and schema version used. To change one: edit, bump the version, run `npm test` (structural invariants) and `npm run eval:dojo` (live quality report).

The generation meta-prompt asks the model to: find the real objective, separate known facts from assumptions, pick needed expertise, identify inputs, build an instruction hierarchy, add only useful constraints, define observable success, choose output structure, apply target guidance, write three meaningfully different alternatives, explain the design, and never fabricate (use `{{placeholders}}` instead).

**Validated, versioned output.** `src/lib/dojo/schema.ts` defines Zod schemas (`dojo.generation.v1`, etc.). The JSON schema sent to providers is derived from them (`toProviderSchema` strips keywords structured-output modes reject, closes every object). Responses are parsed with Zod; on failure the runner retries once, telling the model what was wrong, then fails cleanly. Business rules that JSON schema can't express (exactly one concise/comprehensive/creative alternative, non-empty prompts, score clamping) live in the Zod schema.

**Untrusted data.** User text, pasted prompts and imports go inside `<dojo_…>` blocks (`untrusted.ts`). Look-alikes of those delimiters are defanged so content can't close a block; every meta-prompt carries a rule that block contents are data, not instructions. Ordinary XML in prompts (e.g. `<instructions>` written for Claude) is preserved.

**Immutable versions.** Refining, editing, adapting or restoring always appends a version; nothing is overwritten. In the generator, each of the four tabs has its own version track; once saved to the library, new versions are written to the database *before* they appear on screen.

**Never lose text.** The request, options and the whole current session are saved to `localStorage` on every change; failed requests leave the input untouched and offer Retry. A service worker caches the app shell for offline opening.

## Providers

| Provider | Transport | Notes |
|---|---|---|
| Anthropic (Claude) | `@anthropic-ai/sdk` (`beta.messages.create` with `output_config.format` JSON schema, effort, server-side refusal fallback) | Reports the model that actually answered (fallback can change it) |
| OpenAI | REST `chat/completions` with `response_format: json_schema` (strict) | Enabled only with `OPENAI_API_KEY` + `OPENAI_MODELS`. Not exercised against a live account in this repo |
| Gemini | REST `generateContent` with `responseJsonSchema` | Enabled only with `GEMINI_API_KEY` + `GEMINI_MODELS`. Not exercised against a live account in this repo |
| Mock | In-process | **Tests only.** Requires `DOJO_MOCK_PROVIDER=1` and a non-production build; every output is marked `[MOCK]` and the UI shows a warning badge |

Adding a provider: implement `DojoProvider` (`providers/types.ts`) and list it in `providers/index.ts`.

## Database (migration `0011_promptdojo.sql`)

| Table | Purpose |
|---|---|
| `dojo_profiles`, `dojo_preferences` | Named personalization profiles; one settings row per user |
| `dojo_generations`, `dojo_alternatives` | Each generation request with its validated result, provider/model, meta-prompt + schema versions; alternatives normalized |
| `dojo_prompts`, `dojo_prompt_versions`, `dojo_refinements` | Library items (current copy denormalized for search), immutable versions (numbered by trigger under a row lock), refinement links between versions |
| `dojo_collections`, `dojo_tags`, `dojo_prompt_tags` | Organization |
| `dojo_templates` | Private user templates (starter templates ship in code) |
| `dojo_test_runs`, `dojo_analyses` | Testing Lab runs (output, tokens, cost, ratings, AI judge) and Analyzer results |
| `dojo_usage` | One row per AI call: kind, provider, model, tokens, estimated cost — **no prompt text** |
| `dojo_credit_ledger` | Optional, append-only, idempotency-keyed credit ledger for a future paid plan; users can read, only the service role can write |

Every table: `user_id default auth.uid()`, RLS "own rows only", and write policies that also check referenced ids (collection, prompt, tag, profile, generation) belong to the same user. Versions and ledger rows have no update policy and an update-blocking trigger. Functions: `dojo_apply_retention(days)`, `dojo_delete_my_data()`, `dojo_credit_balance()`. Behaviour is covered by `supabase/tests/dojo.test.sql`.

## Limits and costs

`checkLimits()` runs before every AI call: a per-user sliding one-minute window (in memory, so per server instance), a daily request cap and a monthly estimated-spend cap (both read from `dojo_usage`, so they hold across instances). Usage is recorded for successes and failures. Claude prices are built in (`pricing.ts`); other providers' prices come from `DOJO_PRICES` — unknown prices show "cost n/a" rather than a guess.

## Preparing for commercial features (Phase 5 — not built)

- **Credits:** `dojo_credit_ledger` exists with idempotency keys. To switch on: verify Stripe webhooks server-side (signature check), write ledger rows with the Stripe event id as `idempotency_key` using the service role, check `dojo_credit_balance()` inside `checkLimits()`, and reconcile periodically against Stripe. No checkout exists and none is simulated.
- **Teams / shared collections:** add a `workspace_id` to library tables and membership-based RLS policies alongside the owner policies; the store interface already isolates queries behind one module.
- **Admin controls:** the single-owner login lock (`ALLOWED_EMAIL`) would need replacing with real sign-up and roles first.

## Design choices worth knowing

- **No shadcn/ui or Radix.** The existing app uses hand-built Tailwind components; PromptDojo follows suit with a small set of primitives (`ui.tsx`) using native `<dialog>` for accessible modals, avoiding a large new dependency tree. Zod is the only new runtime dependency.
- **Client-rendered pages.** Like The Daily Canvas, pages render on the device and load data from `/api/dojo` (`export const instant = false`); this keeps one data path for the Supabase and demo stores.
- **CSP without nonces.** A strict nonce CSP would force every page to render per request; the static policy allows Next's inline bootstrap but blocks third-party scripts, framing, plugins and unknown network origins.
