# Security and privacy

## Access

- **Sign-in**: Write.ai's Supabase Auth with the owner-only lock (database trigger, proxy check, page check). `/canvas` and `/api/canvas/*` require the session; the planner's manifest is the only public `/canvas` URL.
- **Row-level security** on every `canvas_*` table: `user_id = auth.uid()` for reads and writes. The ledger has no update policy (append-only). Tested with two accounts in `npm run test:sql`.
- **Sync function** `canvas_push` runs as the caller (`security invoker`), only touches an allow-list of tables, ignores unknown columns, quotes identifiers, and caps batches at 500.
- **Account separation on devices**: each signed-in account gets its own IndexedDB database.
- **Dev bypass**: `NEXT_PUBLIC_CANVAS_LOCAL_ONLY` is honoured only when `NODE_ENV !== "production"`, so a deployed build can't be opened without signing in.

## Secrets and tokens

- No secrets in source control. Google client secret and `ENCRYPTION_KEY` live only in server environment variables.
- Google access/refresh tokens are AES-256-GCM encrypted before storage, decrypted only in server routes, never returned to the browser, and deleted on disconnect (with a revoke call to Google) or when Google revokes them.
- OAuth uses a random `state` in an HttpOnly, Secure, SameSite=Lax cookie, minimum scopes, and incremental consent.
- The login redirect accepts only internal `/canvas…` paths.

## Data handling

- Notes, journal entries and transcripts are never sent to an AI service. Quick Add interpretation is rule-based on the device.
- Dictation: browser speech recognition may be processed by Apple or Google (the browser vendor); the optional cloud engine streams audio to Deepgram after a one-time explicit consent. No audio is stored by The Daily Canvas.
- Notifications never include journal text.
- Integration actions are written to an audit log (`canvas_sync_audit`).

## Abuse protection

- Google routes: per-user rate limit (best effort per server instance) and owner-only access.
- Supabase applies its own API rate limits.
- React escapes all rendered text; no HTML from user content is injected.

## Export and deletion

- Settings → Your data → JSON (everything, including history) and CSVs.
- Settings → Your data → Delete all Daily Canvas data: calls `canvas_delete_my_data()` (all `canvas_*` rows for you), disconnects Google, and deletes the device's local database. Write.ai data is untouched. To delete the whole account, use Write.ai's process / Supabase Auth.

## Known limits

- The rate limiter is in-memory per serverless instance, not global.
- Offline data on a device is protected by the device's own security (passcode, disk encryption); it is not separately encrypted in IndexedDB.
