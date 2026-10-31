import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run The Daily Canvas in local-only dev mode (no sign-in, data stays
// in the browser), so they need no Supabase or Google accounts. Chromium only: real
// Safari, iPhone/iPad hardware, Apple Pencil and installed-PWA behaviour are covered by
// the manual checklist in docs/canvas/TESTING.md.
const PORT = Number(process.env.CANVAS_E2E_PORT ?? 3210);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", timezoneId: "America/Los_Angeles", locale: "en-US" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1512, height: 950 } } },
    { name: "ipad-landscape", use: { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false, deviceScaleFactor: 2 } },
    { name: "ipad-portrait", use: { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: false, deviceScaleFactor: 2 } },
    { name: "iphone", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/canvas/manifest.webmanifest`,
    timeout: 180_000,
    reuseExistingServer: true,
    // Local-only dev switches (ignored in production builds): the planner without sign-in,
    // and InboxPilot's in-memory demo mode with the simulated AI provider.
    env: { NEXT_PUBLIC_CANVAS_LOCAL_ONLY: "1", INBOX_LOCAL_DEMO: "1", INBOX_SIMULATED_AI: "1" },
  },
});
