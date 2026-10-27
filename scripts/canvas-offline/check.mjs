// Production offline check: signed in (fake auth), service worker on, network cut.
import { chromium } from "@playwright/test";
const BASE = "http://localhost:3230";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

(async () => {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: "11111111-1111-1111-1111-111111111111", email: "owner@example.com", aud: "authenticated", role: "authenticated" };
  const jwt = `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp: now + 3600, iat: now })}.c2ln`;
  const session = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "r", user };
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const step = (m) => console.log("•", m);

  await p.goto(BASE + "/canvas");
  await p.locator("#dc-main").waitFor({ timeout: 30000 });
  step("signed-in planner opened (production build): " + (await p.locator("h1").first().innerText()));
  await p.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration("/canvas"))?.active, null, { timeout: 30000 });
  await p.reload();
  await p.locator("#dc-main").waitFor();
  step("service worker controls the page: " + (await p.evaluate(() => !!navigator.serviceWorker.controller)));
  const add = async (t) => {
    const i = p.getByPlaceholder("Add a work to-do…");
    await i.fill(t);
    await i.press("Enter");
  };
  await add("Written online");
  await p.waitForTimeout(800);
  step("sync badge while backend is down: " + (await p.getByRole("status").first().innerText()));

  await ctx.setOffline(true);
  await p.reload();
  await p.locator("#dc-main").waitFor({ timeout: 20000 });
  step("reloaded with NO network → planner opened from cache");
  step("task from before is there: " + (await p.getByText("Written online").isVisible()));
  await add("Written offline");
  await p.getByRole("checkbox", { name: /Written offline/ }).click();
  await p.waitForTimeout(500);
  step("offline badge: " + (await p.getByRole("status").first().innerText()));
  await p.reload();
  await p.locator("#dc-main").waitFor({ timeout: 20000 });
  step("offline task survived an offline reload, still checked: " + (await p.getByRole("checkbox", { name: /Written offline/ }).getAttribute("aria-checked")));
  for (const path of ["/canvas/insights", "/canvas/settings"]) {
    await p.goto(BASE + path).catch(() => {});
    const ok = await p.locator("#dc-main").waitFor({ timeout: 15000 }).then(() => true, () => false);
    step(`offline ${path}: ${ok ? "opens" : "NOT cached (visit it once online first)"}`);
  }
  const pending = await p.evaluate(async () => {
    const db = await new Promise((r) => { const q = indexedDB.open("daily-canvas-11111111-1111-1111-1111-111111111111"); q.onsuccess = () => r(q.result); });
    return new Promise((r) => { const q = db.transaction("outbox").objectStore("outbox").count(); q.onsuccess = () => r(q.result); });
  });
  step("changes waiting in the outbox for the server: " + pending);
  await p.screenshot({ path: (process.env.SHOT_DIR || "test-results") + "/offline-ipad.png" });
  console.log("page errors:", errors.length ? errors : "none");
  await b.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
