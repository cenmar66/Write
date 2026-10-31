# Roadmap

Ordered by value to the owner first, then commercial readiness.

## Next (needs your accounts or approval)
1. **Verify Gmail end-to-end with your real account** (connect, initial import, incremental sync, organize permission, send permission). Everything is built and tested against a mocked Google; it has not run against live Gmail yet.
2. **Publish the OAuth app to Production (unverified, personal use)** to stop the 7-day refresh-token expiry of Testing mode.
3. **Watch the first CI run** (`.github/workflows/ci.yml`) and fix anything environment-specific.

## Soon
- Gmail push notifications (`users.watch` + Pub/Sub) for near-real-time sync instead of 10-minute polling.
- Optional native Gmail label sync per account (the `label_sync` setting exists; the sync job doesn't mirror categories yet).
- Notifications: Web Push for critical/VIP mail honouring focus mode (`time.ts` `shouldNotify` is ready), and email/push delivery of briefings.
- Reminders UI on top of `ip_reminders` (custom snooze schedules, “remind me at…” on any item).
- Attachments: download/preview through the adapter (metadata is shown today).
- Writing-profile learning from sent mail beyond the 3-example prompt (explicit, reviewable profile summary).
- Assistant: multi-turn context; “prepare drafts for today's urgent messages” as a batch that still requires per-draft review.
- Undo for app-level rule actions beyond done/snooze.

## Commercial (Phase 7)
- Open sign-ups: replace the `ALLOWED_EMAIL` lock with invite/sign-up, per-user onboarding, abuse limits (global rate limiting).
- Stripe subscriptions → `ip_subscription_entitlements` (webhook-driven); plans in `entitlements.ts` already gate features.
- Team workspaces: invitations, roles UI, assignment notifications, team analytics.
- Google verification + CASA assessment; privacy policy and Limited Use disclosure.
- Microsoft 365 adapter (Graph OAuth, delta sync, send) behind the existing `MailProvider` interface.
- Task integrations through adapters: Todoist, Asana, ClickUp, Google Tasks, Sunsama (two-way only where the API allows; loop protection via `external_refs`). The Daily Canvas one-way hand-off exists today.
- Outbound webhooks for extensibility.
