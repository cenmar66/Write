// InboxSatori end-to-end tests. They run against the dev server in local demo mode
// (INBOX_LOCAL_DEMO=1: in-memory data, fake owner) with the simulated AI provider
// (INBOX_SIMULATED_AI=1), using the synthetic demo mailbox. No Google, Supabase or AI
// accounts are involved. Real Gmail behaviour is covered by mocked unit tests and the
// manual checklist in docs/inbox/TESTING.md.
import { expect, test, type Page } from "@playwright/test";

async function reset(page: Page, opts: { demo?: boolean; ai?: boolean } = { demo: true }) {
  await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
  if (opts.demo) {
    const r = await page.request.post("/api/inbox/demo");
    expect(r.ok()).toBeTruthy();
    await page.request.patch("/api/inbox/settings", { data: { ai_external: !!opts.ai, onboarding: { step: 10, completed: true } } });
  }
}
const desktopOnly = (name: string) => test.skip(name !== "desktop", "covered on desktop");

// The dev server compiles each page and API route on first use and reloads open pages while
// it does. Visit everything once up front so the tests below see a settled app.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await browser.newPage();
  await page.request.post("/api/inbox/demo");
  for (const path of ["/inbox", "/inbox/mail?view=all", "/inbox/followups", "/inbox/brief", "/inbox/rules", "/inbox/senders", "/inbox/accounts", "/inbox/settings", "/inbox/analytics", "/inbox/onboarding"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
  await page.goto("/inbox/mail?view=all");
  await page.locator("li[data-id]").first().click().catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.close();
});

test.describe("InboxSatori", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", (d) => d.accept());
  });

  test("new users are sent to onboarding, which explains permissions", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page, { demo: false });
    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/inbox\/onboarding/, { timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "Your inbox should work for you." })).toBeVisible();
    await page.getByRole("button", { name: /Get started/ }).click();
    await page.getByPlaceholder(/Workspace name/).fill("Acme");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText("Connect your email")).toBeVisible();
    await expect(page.getByText(/Outlook \/ Microsoft 365: planned/)).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Never sends/)).toBeVisible();
    await expect(page.getByText(/Never deletes/)).toBeVisible();
  });

  test("dashboard shows real counts from the demo mailbox, clearly labelled", async ({ page }) => {
    await reset(page);
    await page.goto("/inbox");
    await expect(page.getByText(/Good (morning|afternoon|evening)\./)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Demo data: the Demo workspace contains synthetic messages/)).toBeVisible();
    await expect(page.getByText("Priority emails")).toBeVisible();
    await expect(page.getByText("Replies due")).toBeVisible();
  });

  test("priority inbox ranks real work above newsletters and promotions", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox/mail?view=priority");
    await expect(page.getByText("Quick question on the budget").first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("li[data-id]").filter({ hasText: "The Weekly Signal" })).toHaveCount(0);
    await expect(page.locator("li[data-id]").filter({ hasText: "40% off" })).toHaveCount(0);
    await page.goto("/inbox/mail?view=category:newsletters");
    await expect(page.locator("li[data-id]").filter({ hasText: "The Weekly Signal" })).toHaveCount(1);
  });

  test("reader explains the classification and learns from a correction", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox/mail?view=priority");
    await page.locator("li[data-id]").filter({ hasText: "Quick question on the budget" }).click();
    await expect(page.getByText("Why it's here")).toBeVisible();
    await expect(page.getByText(/Explicit deadline/).first()).toBeVisible();
    await page.locator("aside select").filter({ has: page.locator("option[value=critical]") }).selectOption("low");
    await expect(page.getByText(/Future mail from this sender will follow your correction/)).toBeVisible();
    const id = new URL(page.url()).searchParams.get("m");
    const detail = await (await page.request.get(`/api/inbox/messages/${id}`)).json();
    expect(detail.classification.importance).toBe("low");
    expect(detail.classification.user_corrected).toBe(true);
  });

  test("suspicious and prompt-injection emails are flagged", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox/mail?view=all");
    await page.locator("li[data-id]").filter({ hasText: "Action required: confirm your shipping address" }).click();
    await expect(page.getByText(/tries to give instructions to AI tools/)).toBeVisible();
    await page.locator("li[data-id]").filter({ hasText: "Your account is limited" }).click();
    await expect(page.getByText("Be careful with this message")).toBeVisible();
  });

  test("AI drafts a reply, but only a reviewed, confirmed send goes out", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page, { demo: true, ai: true });
    await page.goto("/inbox/mail?view=all");
    await page.locator("li[data-id]").filter({ hasText: "Sunday dinner?" }).click();
    await page.getByRole("button", { name: "Draft reply" }).click();
    await page.getByRole("button", { name: "Draft a reply" }).click();
    const body = page.locator("dialog textarea");
    await expect(body).toHaveValue(/Simulated AI draft/);
    await page.getByRole("button", { name: /Review & send/ }).click();
    await expect(page.getByText("Review before sending")).toBeVisible();
    await expect(page.getByText(/contains simulated AI text/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Send now/ })).toBeDisabled();
    await page.getByRole("button", { name: "Back to editing" }).click();
    await body.fill("Yes, I'll be there Sunday. See you!");
    await page.getByRole("button", { name: /Review & send/ }).click();
    await expect(page.getByText("papa.family@home-mail.test")).toBeVisible();
    await expect(page.getByRole("button", { name: /Send now/ })).toBeDisabled();
    await page.getByLabel(/I've checked the sender/).check();
    await page.getByRole("button", { name: /Send now/ }).click();
    await expect(page.getByText(/Recorded in the demo mailbox/)).toBeVisible();
    // The sent reply is synced back and resolves the "I owe" follow-up.
    const fus = await (await page.request.get("/api/inbox/followups?ws=all&kind=i_owe")).json();
    expect(fus.followups.some((f: { title: string }) => f.title.includes("Sunday dinner"))).toBe(false);
  });

  test("a stale review can't be sent (the confirmation is bound to the exact message)", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    const msgs = await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=Sunday")).json();
    const m = msgs.messages[0];
    const d = (await (await page.request.post("/api/inbox/drafts", { data: { message_id: m.id, action: "blank" } })).json()).draft;
    await page.request.patch(`/api/inbox/drafts/${d.id}`, { data: { body: "See you Sunday." } });
    const review = await (await page.request.get(`/api/inbox/drafts/${d.id}/send`)).json();
    await page.request.patch(`/api/inbox/drafts/${d.id}`, { data: { bcc: ["someone-else@other.test"] } });
    const send = await page.request.post(`/api/inbox/drafts/${d.id}/send`, { data: { token: review.token, confirmed: true } });
    expect(send.status()).toBe(409);
    const noConfirm = await page.request.post(`/api/inbox/drafts/${d.id}/send`, { data: { token: review.token } });
    expect(noConfirm.ok()).toBe(false);
  });

  test("tasks & follow-ups: someone owes me, complete, create task from email", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox/followups?tab=they_owe");
    const row = page.locator("tr").filter({ hasText: "Waiting on Nina Watts" });
    await expect(row).toBeVisible({ timeout: 45_000 });
    await row.getByRole("checkbox").click();
    await expect(row).toHaveCount(0);
    await page.goto("/inbox/mail?view=all");
    await page.locator("li[data-id]").filter({ hasText: "Q4 plan" }).click();
    await page.getByRole("button", { name: /Create task/ }).first().click();
    await expect(page.getByText("Stated in email")).toBeVisible();
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(page.getByText("Task created.")).toBeVisible();
    const tasks = await (await page.request.get("/api/inbox/tasks?ws=all")).json();
    expect(tasks.tasks[0].source_ref.subject).toContain("Q4 plan");
    expect(tasks.tasks[0].provenance.due_date).toBe("explicit");
  });

  test("daily brief: every item links to its source", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox/brief");
    await page.getByRole("button", { name: /Brief me now/ }).click();
    await expect(page.getByText("Executive summary")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Waiting for your reply/ })).toBeVisible();
    const links = page.locator("main a[href*='/inbox/mail?view=all&m=']");
    expect(await links.count()).toBeGreaterThan(2);
  });

  test("rules: preview what will change, then create", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox/rules");
    await page.getByRole("button", { name: /New rule/ }).click();
    await page.getByLabel("Rule name").fill("Cloudnest to receipts");
    await page.getByLabel("Value").first().fill("cloudnest.test");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/What will change\? 1 of the last/)).toBeVisible();
    await page.getByRole("button", { name: "Save rule" }).click();
    await expect(page.getByText("Cloudnest to receipts")).toBeVisible();
  });

  test("assistant answers with sources and never acts", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox");
    await page.getByRole("button", { name: "Open AI assistant" }).click();
    await page.getByRole("button", { name: /did not receive|have not received/ }).click();
    await expect(page.getByText("Sources")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Answered without AI/)).toBeVisible();
  });

  test("disconnecting deletes the account's data", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await reset(page);
    await page.goto("/inbox/accounts");
    await page.getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText(/Disconnected and data deleted/)).toBeVisible();
    const msgs = await (await page.request.get("/api/inbox/messages?ws=all&view=all")).json();
    expect(msgs.messages).toHaveLength(0);
  });

  test("phone layout: bottom tabs, list → message → back", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone");
    await reset(page);
    await page.goto("/inbox/mail?view=priority");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({ timeout: 45_000 });
    await page.locator("li[data-id]").first().click();
    await expect(page.getByText("Why it's here")).toBeVisible();
    await page.getByRole("button", { name: /Priority Inbox/ }).click();
    await expect(page.locator("li[data-id]").first()).toBeVisible();
  });
});

test.describe("inboxsatori.com", () => {
  test("serves InboxSatori at clean addresses with its own icons; Write.ai keeps its own", async ({ request }, info) => {
    test.skip(info.project.name !== "desktop", "host routing is device-independent");
    const inbox = { host: "inboxsatori.com" };
    const home = await request.get("/", { headers: inbox, maxRedirects: 0 });
    expect(home.status()).toBe(200);
    expect(await home.text()).toContain("InboxSatori");

    const fav = await request.get("/favicon.ico", { headers: inbox });
    expect(fav.headers()["content-type"]).toContain("image/png");
    expect(Buffer.compare(await fav.body(), await (await request.get("/favicon.ico")).body())).not.toBe(0);

    const svg = await (await request.get("/icon.svg", { headers: { host: "www.inboxsatori.com" } })).text();
    expect(svg).toContain("#24489c");
    expect(await (await request.get("/icon.svg")).text()).not.toContain("#24489c");

    const apple = await request.get("/icons/apple-touch-icon.png", { headers: inbox });
    const own = await request.get("/inbox-icons/apple-touch-icon.png");
    expect(Buffer.compare(await apple.body(), await own.body())).toBe(0);

    const manifest = await (await request.get("/manifest.webmanifest", { headers: inbox })).json();
    expect(manifest.name).toBe("InboxSatori");
  });
});

test.describe("Inbox zero", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", (d) => d.accept());
  });

  test("delete moves to Trash with Undo; archive leaves the inbox", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    await page.goto("/inbox/mail?view=all");
    const row = page.locator("li[data-id]").filter({ hasText: "40% off everything" });
    await row.click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 1000 }); // gone at once, before Gmail answers
    await expect(page.getByText("Moved to Trash.")).toBeVisible();
    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    await expect(row).toHaveCount(1);

    await page.locator("li[data-id]").filter({ hasText: "Your receipt for Tuesday" }).click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByText("Archived in Gmail.")).toBeVisible();
    const msgs = await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=receipt")).json();
    expect(msgs.messages[0].in_inbox).toBe(false);
  });

  test("Black Hole a sender: their mail leaves the inbox; bringing them back restores it", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    await page.goto("/inbox/mail?view=all");
    await page.locator("li[data-id]").filter({ hasText: "Your daily tech digest" }).click();
    await page.getByRole("button", { name: "Black Hole sender" }).click();
    await expect(page.getByText(/Sent to the Black Hole\. 1 message\(s\) done, 1 archived out of Gmail/)).toBeVisible();
    let m = (await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=tech%20digest")).json()).messages[0];
    expect(m.in_inbox).toBe(false);
    expect(m.done_at).toBeTruthy();
    await page.getByRole("button", { name: /In Black Hole — bring back/ }).click();
    await expect(page.getByText(/Back from the Black Hole: 1 message/)).toBeVisible();
    m = (await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=tech%20digest")).json()).messages[0];
    expect(m.in_inbox).toBe(true);
    expect(m.done_at).toBeNull();
  });
});

test.describe("Bulk Black Hole", () => {
  test("Move to… → Black Hole these senders: names them, archives (never deletes), Undo brings them back", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    await page.goto("/inbox/mail?view=all");
    const digest = page.locator("li[data-id]").filter({ hasText: "Your daily tech digest" });
    const promo = page.locator("li[data-id]").filter({ hasText: "40% off everything" });
    await expect(digest).toBeVisible({ timeout: 45_000 });
    await digest.getByRole("checkbox").check();
    await promo.getByRole("checkbox").check();
    let asked = "";
    page.once("dialog", (d) => {
      asked = d.message();
      void d.accept();
    });
    await page.getByLabel("Move selected").selectOption({ label: "Black Hole these senders…" });
    await expect(page.getByText(/Sent 2 senders to the Black Hole/)).toBeVisible();
    expect(asked).toContain("Send 2 senders to the Black Hole?");
    expect(asked).toContain("deals@shopmore.test");
    expect(asked).toContain("Nothing is deleted");
    // (All Mail keeps archived mail, like Gmail; the server shows what changed.)
    const promoMsg = (await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=40%25%20off")).json()).messages[0];
    expect(promoMsg.in_inbox).toBe(false);
    expect(promoMsg.done_at).toBeTruthy();
    expect(promoMsg.label_ids).not.toContain("TRASH"); // archived, never deleted

    await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Back from the Black Hole.")).toBeVisible();
    const back = (await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=40%25%20off")).json()).messages[0];
    expect(back.in_inbox).toBe(true);
  });

  test("the preview step changes nothing", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    const all = (await (await page.request.get("/api/inbox/messages?ws=all&view=all")).json()).messages;
    const r = await (await page.request.post("/api/inbox/senders/black-hole", { data: { message_ids: all.map((m: { id: string }) => m.id) } })).json();
    expect(r.senders.length).toBeGreaterThan(3);
    const after = (await (await page.request.get("/api/inbox/messages?ws=all&view=all")).json()).messages;
    expect(after.filter((m: { in_inbox: boolean }) => m.in_inbox).length).toBe(all.filter((m: { in_inbox: boolean }) => m.in_inbox).length);
    expect(r.senders.every((s: { blocked: boolean }) => !s.blocked)).toBe(true);
  });
});

test.describe("SaneBox-style Gmail labels", () => {
  test("turn on labels; moving mail into InboxSatori/Black Hole in Gmail sends the sender there", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    await page.goto("/inbox/accounts");
    await expect(page.getByText("Sort from Gmail (SaneBox-style labels)")).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByText(/Created \d+ labels under “InboxSatori\/”/)).toBeVisible();
    await expect(page.getByText(/Labels: Black Hole, /)).toBeVisible();

    // In "Gmail", the user moves the promo email into InboxSatori/Black Hole.
    const boot = await (await page.request.get("/api/inbox/bootstrap")).json();
    const acc = boot.accounts.find((a: { provider: string }) => a.provider === "demo");
    const bh = Object.entries(acc.settings.training_labels as Record<string, string>).find(([, v]) => v === "black_hole")![0];
    const promo = (await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=40%25%20off")).json()).messages[0];
    expect((await page.request.post("/api/inbox/demo/gmail-move", { data: { message_id: promo.id, label: bh } })).ok()).toBe(true);
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByText(/new message/)).toBeVisible();
    const senders = await (await page.request.get("/api/inbox/senders?ws=all")).json();
    const s = (senders.senders ?? senders).find((x: { email: string }) => x.email === "deals@shopmore.test");
    expect(s.blocked).toBe(true);
    const after = (await (await page.request.get("/api/inbox/messages?ws=all&view=all&q=40%25%20off")).json()).messages[0];
    expect(after.label_ids).not.toContain("TRASH");

    // Instant updates aren't configured in tests: the push endpoint says so and does nothing.
    expect((await page.request.post("/api/inbox/gmail/push", { data: {} })).status()).toBe(404);
  });
});

test.describe("Long lists", () => {
  test("every selected message can be scrolled to; pages and Select all work", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width: 1280, height: 560 }); // short window, like a laptop with the dock up
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    await page.goto("/inbox/mail?view=all");
    const rows = page.locator("li[data-id]");
    await expect(rows.first()).toBeVisible({ timeout: 45_000 });
    const n = await rows.count();
    await expect(page.getByText(`1–${n} of ${n}`)).toBeVisible();
    await page.getByLabel("Select all").check();
    await expect(page.getByText(`${n} selected`)).toBeVisible();
    // The last row must be reachable by scrolling inside the list, and actually on screen.
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows.last()).toBeInViewport();
    const box = await rows.last().boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(560);

    // Server paging: pages of 10 add up to the total with no overlaps.
    const a = await (await page.request.get("/api/inbox/messages?ws=all&view=all&limit=10&page=0")).json();
    const b = await (await page.request.get("/api/inbox/messages?ws=all&view=all&limit=10&page=1")).json();
    expect(a.total).toBe(n);
    expect(a.messages).toHaveLength(10);
    expect(new Set([...a.messages, ...b.messages].map((m: { id: string }) => m.id)).size).toBe(20);
    const sel = await (await page.request.get("/api/inbox/messages?ws=all&view=all&ids=1")).json();
    expect(sel.ids).toHaveLength(n);
  });
});

test.describe("Formatted email", () => {
  test("shows the email with its images in a sandbox where nothing can run", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    await page.goto("/inbox/mail?view=all");
    await page.locator("li[data-id]").filter({ hasText: "The Weekly Signal" }).click();
    const frame = page.locator("iframe.ip-html-body");
    await expect(frame).toBeVisible({ timeout: 20_000 });
    expect(await frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    const body = page.frameLocator("iframe.ip-html-body");
    await expect(body.getByRole("heading", { name: "This week" })).toBeVisible();
    const img = body.getByAltText("The Weekly Signal masthead");
    await expect(img).toHaveAttribute("src", /^data:image\/png;base64,/); // embedded image, inlined
    expect(await frame.getAttribute("srcdoc")).not.toContain("<script");
    await page.getByRole("button", { name: "Show plain text" }).click();
    await expect(page.locator(".ip-body-text")).toContainText("This week: five ideas on focus");
    await expect(frame).toHaveCount(0);
  });
});

test.describe("Unread counts", () => {
  test("a folder's sidebar badge matches the unread count at the top of the folder", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    for (const name of ["Low Priority", "Newsletters"]) {
      const link = page.getByRole("navigation", { name: "InboxSatori" }).getByRole("link", { name: new RegExp(`^${name}`) });
      if (!(await page.url().includes("/inbox/mail"))) await page.goto("/inbox/mail?view=all");
      await expect(link).toBeVisible({ timeout: 45_000 });
      const badge = Number((await link.locator(".ip-badge").textContent().catch(() => "0")) || 0);
      await link.click();
      await expect(page.locator("li[data-id]").first()).toBeVisible();
      await expect(page.getByText(`${badge} unread`, { exact: true })).toBeVisible();
    }
  });
});

test.describe("Crash screen", () => {
  test("a crash in the browser shows what went wrong instead of a blank page", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop" && info.project.name !== "iphone");
    await page.request.delete("/api/inbox/data", { data: { confirm: "DELETE" } });
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    // Simulate a browser that can't format dates (the home page uses this on load).
    await page.addInitScript(() => {
      const Real = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function (...a: ConstructorParameters<typeof Real>) {
        if (a[1]?.hour12 === false) throw new RangeError("Simulated browser incompatibility");
        return new Real(...a);
      } as unknown as typeof Real;
    });
    await page.goto("/inbox");
    await expect(page.getByText("Something went wrong")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Simulated browser incompatibility/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible();
  });

  test("a normal load has no browser errors", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.request.post("/api/inbox/demo");
    await page.request.patch("/api/inbox/settings", { data: { onboarding: { step: 10 } } });
    await page.goto("/inbox");
    await expect(page.getByText("Upcoming deadlines")).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(9000); // past the start-up watchdog
    await expect(page.getByRole("alert").filter({ hasText: "couldn't start" })).toHaveCount(0);
    expect(errors.filter((e) => !/favicon|Download the React DevTools|hydrat/i.test(e))).toEqual([]);
    expect(errors.filter((e) => /hydrat|script tag/i.test(e))).toEqual([]);
  });
});
