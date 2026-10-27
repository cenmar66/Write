#!/usr/bin/env bash
# Verifies offline behaviour on a real production build:
# a fake Supabase auth server signs you in, the backend is "down", then the network is cut.
# Needs Playwright's Chromium (preinstalled in Claude Code cloud sessions; otherwise
# `npx playwright install chromium`). Rebuilds .next with fake auth settings, so run
# `npm run build` again afterwards before deploying from this machine.
set -euo pipefail
cd "$(dirname "$0")/../.."
node scripts/canvas-offline/fake-auth.mjs & AUTH=$!
trap 'kill $AUTH ${WEB:-} 2>/dev/null || true' EXIT
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54400 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=fake npx next build >/dev/null
ALLOWED_EMAIL=owner@example.com npx next start -p 3230 >/dev/null 2>&1 & WEB=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3230/canvas/manifest.webmanifest && break; sleep 1; done
node scripts/canvas-offline/check.mjs
