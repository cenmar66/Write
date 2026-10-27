# Environment variables

| Variable | Where | Required | Used for |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | Yes | Supabase project (shared with Write.ai) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | Yes | Browser Supabase client (safe to expose; RLS protects data) |
| `ALLOWED_EMAIL` | Vercel + `.env.local` | Yes | The one account allowed in (Write.ai's lock) |
| `ENCRYPTION_KEY` | Vercel | For Google | Encrypts Google tokens (AES-256-GCM). Never change it after connecting, or reconnect afterwards |
| `GOOGLE_CLIENT_ID` | Vercel | For Google | OAuth client (Calendar + Tasks) |
| `GOOGLE_CLIENT_SECRET` | Vercel | For Google | Server only; never sent to the browser |
| `DEEPGRAM_API_KEY` | Vercel | Optional | Cloud dictation fallback (shared with Write.ai) |
| `NEXT_PUBLIC_CANVAS_LOCAL_ONLY` | `.env.local` only | No | `1` = dev/test mode: `/canvas` without sign-in, data only in the browser. Ignored by production builds |
| `NEXT_PUBLIC_CANVAS_SW_DEV` | `.env.local` only | No | `1` = register the service worker in `next dev` (normally production only) |
| `CANVAS_E2E_PORT` | shell | No | Port for Playwright's dev server (default 3210) |

No privileged keys (`SUPABASE_SECRET_KEY`) are used by The Daily Canvas. Secrets are never committed (`.env*` is git-ignored except `.env.example`).
