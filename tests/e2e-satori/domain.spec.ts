import { expect, test } from "@playwright/test";

// Simulates a visit to promptsatori.com by sending its Host header.
test("promptsatori.com serves PromptSatori at clean addresses", async ({ request }) => {
  const headers = { host: "promptsatori.com" };
  const home = await request.get("/", { headers, maxRedirects: 0 });
  expect(home.status()).toBe(200);
  const html = await home.text();
  expect(html).toContain("PromptSatori");
  expect(html).not.toContain("Write.ai</title>");
  const lib = await request.get("/library", { headers, maxRedirects: 0 });
  expect(lib.status()).toBe(200);
  expect(await lib.text()).toContain("My Library");
  const api = await request.get("/api/satori/status", { headers });
  expect(api.ok()).toBeTruthy();
});
