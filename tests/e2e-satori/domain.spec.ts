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

test("promptsatori.com serves PromptSatori's icons, Write.ai keeps its own", async ({ request }) => {
  const satori = { host: "promptsatori.com" };
  const fav = await request.get("/favicon.ico", { headers: satori });
  expect(fav.headers()["content-type"]).toContain("image/png");
  const plainFav = await request.get("/favicon.ico");
  expect(Buffer.compare(await fav.body(), await plainFav.body())).not.toBe(0);

  const svg = await request.get("/icon.svg", { headers: { host: "www.promptsatori.com" } });
  expect(await svg.text()).toContain("#0f6e66");
  expect(await (await request.get("/icon.svg")).text()).not.toContain("#0f6e66");

  const apple = await request.get("/icons/apple-touch-icon.png", { headers: satori });
  const satoriApple = await request.get("/satori-icons/apple-touch-icon.png");
  expect(Buffer.compare(await apple.body(), await satoriApple.body())).toBe(0);

  const manifest = await (await request.get("/manifest.webmanifest", { headers: satori })).json();
  expect(manifest.name).toBe("PromptSatori");
});
