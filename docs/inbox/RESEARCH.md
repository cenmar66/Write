# Research notes

This build session's network policy blocked `sanebox.com` and `developers.google.com`, so the notes below come from prior knowledge and a web search; items marked **verify** should be re-checked against the live sources before a public launch.

## Reference product (SaneBox) — problem space only

SaneBox (verify current plans at sanebox.com/pricing) is a server-side filter that moves likely-unimportant mail into folders it creates (e.g. SaneLater, SaneNews, SaneBlackHole), with a digest, reminders for unanswered mail (SaneReminders / SaneNoReplies), snooze folders and do-not-disturb, in tiered plans by number of accounts and features.

Where InboxPilot differs by design:

| SaneBox approach | InboxPilot |
|---|---|
| Creates and moves mail into folders | Virtual categories on top of the inbox; Gmail untouched in Observe mode; mailbox changes only by approval or confirmed, reversible rules |
| Opaque training | Every classification shows its factors and confidence; corrections apply per sender, per workspace |
| Digest of filtered mail | Executive briefing with commitments, who's waiting on whom, inferred vs. stated dates, sources for every line |
| Reminders | Follow-up engine that ignores auto-replies/bounces, detects promises made by you and to you |
| — | AI drafting with mandatory review-before-send; read-only assistant with cited answers; tasks with provenance; Daily Canvas hand-off |

No SaneBox text, branding, layouts or code were used.

## Gmail API facts relied on

- OAuth 2.0 web flow, `access_type=offline`, incremental authorization with `include_granted_scopes`.
- `users.messages.list` (`q`, `pageToken`, `maxResults ≤ 500`), `users.messages.get` (`format=full|metadata`, `metadataHeaders`), `users.history.list` (`startHistoryId`, `historyTypes`; 404 when the start id is too old → full sync), `users.getProfile` (`historyId`), `users.messages.modify`, `users.labels.list/create`, `users.messages.send` (`raw` base64url RFC 5322, optional `threadId`).
- `gmail.metadata` scope can't use the `q` search parameter; InboxPilot uses `gmail.readonly` and implements metadata-first mode by fetching `format=metadata` and not storing bodies.
- Scope classification (restricted: readonly, modify, metadata, compose, insert, settings; sensitive: send) and the verification + annual CASA assessment requirement for restricted scopes in public apps — **verify** in the current Google documentation / Cloud Console.
- Testing-mode refresh tokens expire after 7 days (confirmed by Google documentation found via search: developers.google.com/google-ads/api/docs/get-started/common-errors and the Google Health API setup guide).
- Gmail Push (Pub/Sub `users.watch`) would allow near-real-time sync; not used yet (needs a Pub/Sub topic and a public push endpoint) — see ROADMAP.

## Microsoft Graph (planned)

`/me/messages` + `/me/mailFolders/{id}/messages/delta` for incremental sync, `Mail.Read` / `Mail.ReadWrite` / `Mail.Send` delegated scopes, change notifications via subscriptions. Adapter boundary: `src/lib/inbox/mail/outlook.ts`.
