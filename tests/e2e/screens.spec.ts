import { expect, test } from "@playwright/test";
import { addTask, openPlanner } from "./helpers";

test.describe("other screens", () => {
  test("insights count what happened", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await openPlanner(page);
    await addTask(page, "What matters most today?", "One");
    await addTask(page, "What matters most today?", "Two");
    await page.getByRole("checkbox", { name: /: One$/ }).click();
    await page.getByRole("button", { name: "Insights" }).click();
    await expect(page.getByRole("heading", { name: "Your progress" })).toBeVisible();
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.getByText("50%").first()).toBeVisible();
    await expect(page.locator(".dc-card", { hasText: "Priorities done" }).getByText("1/2")).toBeVisible();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Daily completion" })).toBeVisible();
  });

  test("search finds a finished task and jumps to its day", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await openPlanner(page);
    await addTask(page, "Add a work to-do…", "Quarterly proposal draft");
    await page.getByRole("checkbox", { name: /Quarterly proposal draft/ }).click();
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await page.getByRole("textbox", { name: "Search" }).fill("proposal");
    await page.getByLabel("Status").selectOption("done");
    await expect(page.getByText("1 result")).toBeVisible();
    await page.getByRole("button", { name: /Quarterly proposal draft/ }).click();
    await expect(page.locator("#section-work").getByText("Quarterly proposal draft")).toBeVisible();
  });

  test("week and month views", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.clock.setFixedTime(new Date("2026-10-27T17:00:00Z"));
    await openPlanner(page);
    await addTask(page, "Add a work to-do…", "Week task");
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Week of October 26" })).toBeVisible();
    await expect(page.getByText("Week task")).toBeVisible();
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  });

  test("exports JSON and CSV", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await openPlanner(page);
    await addTask(page, "Add a work to-do…", "Export me, please");
    await page.waitForTimeout(300);
    await page.getByRole("link", { name: "Settings" }).click();
    const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "JSON" }).click()]);
    const body = JSON.parse(Buffer.concat(await (await json.createReadStream()).toArray()).toString("utf8"));
    expect(body.data.canvas_tasks[0].title).toBe("Export me, please");
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByLabel("Download a CSV").selectOption("tasks")]);
    const text = Buffer.concat(await (await csv.createReadStream()).toArray()).toString("utf8");
    expect(text).toContain('"Export me, please"');
    expect(text).toContain("created_at_local");
  });

  test("PWA: manifest, icons, and service worker are served", async ({ request }, info) => {
    test.skip(info.project.name !== "desktop");
    const m = await request.get("/canvas/manifest.webmanifest");
    expect(m.ok()).toBe(true);
    const manifest = await m.json();
    expect(manifest).toMatchObject({ name: "The Daily Canvas", start_url: "/canvas", scope: "/canvas", display: "standalone" });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    const sw = await request.get("/canvas-sw.js");
    expect(sw.ok()).toBe(true);
    expect(await sw.text()).toContain('addEventListener("fetch"');
  });

  test("print view", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.goto("/canvas/print?date=2026-10-20");
    await expect(page.getByRole("heading", { name: "Tuesday, October 20, 2026" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Print or save as PDF/ })).toBeVisible();
  });
});
