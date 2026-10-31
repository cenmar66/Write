// InboxPilot end-to-end tests. They run against the dev server in local demo mode
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

test.describe("InboxPilot", () => {
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
