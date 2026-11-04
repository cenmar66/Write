import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for PromptSatori. They run the app in local demo mode (no sign-in,
// in-memory data) with the TEST-ONLY mock provider, so no API keys or database are
// needed and no real AI output is involved. Real-provider behaviour is covered by the
// opt-in live evaluation (npm run eval:satori) and the manual checklist in docs/satori/TESTING.md.
const PORT = Number(process.env.SATORI_E2E_PORT ?? 3220);

export default defineConfig({
  testDir: "tests/e2e-satori",
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
    url: `http://localhost:${PORT}/satori/manifest.webmanifest`,
    timeout: 180_000,
    reuseExistingServer: true,
    env: { NEXT_PUBLIC_SATORI_LOCAL_ONLY: "1", SATORI_MOCK_PROVIDER: "1", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "", SATORI_RATE_PER_MINUTE: "1000" },
  },
});
