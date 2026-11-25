# Project instructions

@AGENTS.md

Write.ai is a single Next.js 16 app (App Router, TypeScript strict, Tailwind v4, Supabase) with three products:
Write.ai (`/`), The Daily Canvas (`/canvas`, docs/canvas) and PromptSatori (`/satori`, promptsatori.com, docs/satori).

InboxSatori moved to its own repo (`cenmar66/inboxsatori`, inboxsatori.com) on 2026-11-19. It shares this Supabase project: its tables start with `ip_` and its migrations 0012/0013 stay here in `supabase/migrations` and `setup-all.sql` so this database is rebuilt whole. Don't change `ip_*` tables from this repo; InboxSatori may insert into `canvas_tasks` (its "Send to The Daily Canvas" hand-off), so keep that table's shape compatible.

## Conventions
- Database: plain SQL migrations in `supabase/migrations/` (numbered, re-runnable, never destructive), mirrored into `supabase/setup-all.sql`. Every table has RLS. Test with `npm run test:sql`.
- Next 16: pages that read session data on the client set `export const instant = false`; route files export only handlers/config.
- Lint uses the React compiler rules: no setState directly in effects (derive state, key a remount, or lazy-init).
- Checks before pushing: `npm run typecheck && npm run lint && npm test && npm run test:sql` (+ `npm run test:e2e` for UI changes).

