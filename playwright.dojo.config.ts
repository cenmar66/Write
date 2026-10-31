import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for PromptDojo. They run the app in local demo mode (no sign-in,
// in-memory data) with the TEST-ONLY mock provider, so no API keys or database are
// needed and no real AI output is involved. Real-provider behaviour is covered by the
// opt-in live evaluation (npm run eval:dojo) and the manual checklist in docs/dojo/TESTING.md.
const PORT = Number(process.env.DOJO_E2E_PORT ?? 3220);

export default defineConfig({
  testDir: "tests/e2e-dojo",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testIgnore: /responsive\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] } },
    { name: "iphone", testMatch: /responsive\.spec\.ts/, use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } },
    { name: "ipad", testMatch: /responsive\.spec\.ts/, use: { viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 2 } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/dojo/manifest.webmanifest`,
    timeout: 180_000,
    reuseExistingServer: true,
    env: { NEXT_PUBLIC_DOJO_LOCAL_ONLY: "1", DOJO_MOCK_PROVIDER: "1", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "", DOJO_RATE_PER_MINUTE: "1000" },
  },
});
