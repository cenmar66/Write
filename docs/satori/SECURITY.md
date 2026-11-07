# PromptSatori security & privacy

| Requirement | How it's handled |
|---|---|
| API keys server-side | Providers read keys from server env only; `/api/satori/status` reports "configured" booleans and model ids, never keys (e2e-tested). No `NEXT_PUBLIC_` secret variables. |
| No service-role key in the browser | PromptSatori never uses `SUPABASE_SECRET_KEY`; all queries run as the signed-in user under RLS. |
| Authentication | Write.ai's Supabase login and single-owner lock (`ALLOWED_EMAIL`), enforced in `proxy.ts` and again in every `/api/satori` route (`satoriContext`). |
| Ownership boundaries | RLS on every table + explicit `user_id` filters in queries + policy checks that referenced rows (collections, prompts, tags, profiles, generations, versions) belong to the caller. SQL tests prove another user can't read, edit, attach to, or delete your rows, or grant themselves credits. |
| Input validation | Zod schemas for every request body; 200 KB body cap (5 MB for imports); request text ≤ 8,000 chars, prompts ≤ 30,000; import files validated field by field with unknown values coerced to safe defaults. |
| Untrusted text / prompt injection | User text, pasted prompts, imports and templates are wrapped in `<satori_…>` data blocks; delimiter look-alikes are defanged; every meta-prompt states block contents are data and must not change behaviour or reveal instructions. Structured output + schema validation means injected text can't change the response format. Suspicious phrases trigger a visible warning (they're treated as content, not blocked). The live evaluation includes an injection case. |
| Output validation | Every AI response is parsed against a versioned Zod schema before use; invalid shapes get one repair attempt then a clean error. |
| Website reading (SSRF) | Only http(s); hosts must resolve to public addresses (localhost, private ranges, link-local/cloud metadata, carrier-grade NAT, multicast refused); redirects followed by hand and re-checked each hop; 12 s timeout, 2 MB cap, text content types only; rate-limited (20/min). Residual risk: a DNS answer that changes between check and connect; Vercel functions have no private network to reach. |
| Images | Validated type (JPEG/PNG/WebP/GIF) and size; resized and re-encoded in the browser, which removes EXIF data such as GPS. Never stored. |
| Connected app tokens | Encrypted with AES-256-GCM (`ENCRYPTION_KEY`) before storage; never returned to the browser (API returns `has_token` only); decrypted only for the run that uses them; `https://` servers only; own rows only (RLS). Connected apps can take actions a prompt asks for; Settings warns about this. |
| Rendering | All AI output is rendered as React text (no `dangerouslySetInnerHTML`), so model output can't inject HTML/script. |
| Rate limits & abuse | Per-minute, per-day and monthly-budget caps on all AI endpoints; size limits on every route. |
| Logging | Server logs name the failing operation/provider only — never prompt content or provider error bodies. |
| CSP & headers | `/satori` pages: `default-src 'self'`, no third-party scripts, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, connections limited to self, Supabase and Deepgram (dictation). Plus `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, `Permissions-Policy` allowing only the microphone. API responses are `no-store`. |
| Test-only code | The mock provider and in-memory store are disabled in production builds regardless of environment variables (verified against `next start`). |

## Privacy

See the in-app **Privacy** page (`/satori/privacy`). In short: your data is in your own Supabase project; text is sent to the AI provider shown on each result only when you press a button; voice audio is never stored; usage records contain counts and costs, not content.

## Retention and deletion

- **Settings → Your data → Keep history for…** deletes generations, analyses and test runs older than 30/90/365 days (applied after each generation and on demand). Library prompts are kept until you delete them.
- **Delete all PromptSatori data** calls `satori_delete_my_data()`, removing every PromptSatori row you own, including usage and credits.
- Deleting the user in Supabase → Authentication cascades to every PromptSatori table.

## Known trade-offs

- The CSP allows inline scripts (Next.js bootstrap) because a nonce-based policy would require per-request rendering of every page.
- The per-minute limiter is per server instance; daily and monthly caps are database-backed and global.
- Injection resistance is defence in depth, not a guarantee: a determined input can still steer the *content* of a generated prompt (that's the product's purpose), but not the app's behaviour, format, or hidden instructions.
