# PromptDojo — status

Updated 2026-10-31. Branch `claude/relaxed-johnson-xv606m`.

## Phases

| Phase | State | Notes |
|---|---|---|
| 1 Functional core | ✅ Built | Generator, target selection, real Claude generation, 1 + 3 prompts, explanation, copy, refinement engine, env config. **Live generation not run in the build environment (no API key there)** — verified with the test mock and by code review against the SDK docs |
| 2 Workspace | ✅ Built | Supabase auth (existing), cloud persistence, library, search, templates, history, version comparison, preferences/profiles |
| 3 Advanced intelligence | ✅ Built | Analyzer + scores, Testing Lab with side-by-side, model adapters, export/import, speech input |
| 4 Production hardening | ✅ Mostly | Unit, SQL and e2e tests; rate/size/budget limits; error handling; usage monitoring; CSP; deployment docs. Accessibility: semantic roles, labels, focus styles, reduced motion, keyboard shortcuts — **no formal audit with assistive tech yet** |
| 5 Commercial | ⏸ Prepared only | Credit ledger table + design notes in ARCHITECTURE.md. No billing, no fake checkout |

## Acceptance criteria

| # | Criterion | |
|---|---|---|
| 1 | Enter a simple request | ✅ |
| 2 | Genuine AI-produced prompt | ✅ via Claude (needs `ANTHROPIC_API_KEY`); mock is test-only and labelled |
| 3 | Three distinct alternatives | ✅ enforced by schema (one concise, comprehensive, creative) |
| 4 | Explains the structure | ✅ "Why this works" |
| 5 | Refine any prompt | ✅ 12 one-click + free-form, on all four tabs and in the library |
| 6 | Copy immediately | ✅ with confirmation |
| 7 | History and saved prompts survive refresh | ✅ Supabase (after migration 0011); local session also restored |
| 8 | Target model affects the prompt | ✅ versioned guidance per target |
| 9 | Failures don't lose text | ✅ e2e-tested |
| 10 | Secrets server-side | ✅ |
| 11 | Desktop and mobile | ✅ responsive layout tested at desktop, iPhone and iPad sizes |
| 12 | Major workflow tests pass | ✅ 112 unit, SQL suite, 20 e2e |
| 13 | Documented deployment | ✅ README.md |

## Needs you

1. Run `supabase/migrations/0011_promptdojo.sql` in Supabase.
2. Deploy and open `/dojo`.
3. Run the live evaluation once with your key (`npm run eval:dojo`) and skim the report.
4. Work through the manual checklist in [TESTING.md](TESTING.md).

## Known limitations

- **OpenAI and Gemini adapters are untested against live accounts.** They follow those providers' documented REST shapes and are off unless configured.
- The per-minute rate limiter is per server instance (daily/monthly caps are global).
- The Analyzer's AI scores and Lab's AI ratings are opinions from a model; the quick check is simple text rules. None of them measure real-world performance.
- Library search uses `ILIKE` (fine for personal libraries; a full-text index exists for later use).
- Version comparison is word-level; very large prompts fall back to line-level.
- Voice fallback for browsers without speech recognition uses Write.ai's Deepgram route and needs `DEEPGRAM_API_KEY`.
- The service worker caches the app shell; generating still needs a connection (drafts are kept locally until you're back online).
- PromptDojo inherits Write.ai's single-owner login. Multi-user sign-up would need Write.ai's lock relaxed; RLS is already per-user.
- Collections are flat (no nesting); bulk actions in the library are limited to export.

## Suggested next steps

- Stream generation progress (the model's output arrives all at once today).
- Prompt-level sharing links and team workspaces (see Phase 5 notes).
- Saved "test suites" in the Lab (several variable sets run in one go) and version-vs-version A/B runs.
- Background re-run of the live evaluation in CI with a small budget.
- Full accessibility audit with VoiceOver/NVDA and a contrast check of every accent in dark mode.
