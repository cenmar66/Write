import { expect, test } from "@playwright/test";
import { fresh, generate } from "./helpers";

test.describe("Money spent and estimates", () => {
  test("costs page shows totals, a daily chart with a table view, and breakdowns", async ({ page }) => {
    await fresh(page, "/satori");
    await generate(page, "Summarize a meeting transcript into action items");
    await expect(page.getByText("Why this works")).toBeVisible();
    await page.getByRole("link", { name: "Costs", exact: true }).first().click();
    await expect(page).toHaveURL(/\/satori\/costs/);
    await expect(page.getByRole("heading", { name: "Costs", level: 1 })).toBeVisible();
    await expect(page.getByText("This month").first()).toBeVisible();
    await page.getByRole("tab", { name: "30 days" }).click();
    await page.getByText("Show as table").click();
    await expect(page.getByRole("table").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "By AI model" })).toBeVisible();
    await expect(page.getByText("Generating prompts")).toBeVisible();
  });

  test("generator shows a cost estimate before running", async ({ page }) => {
    await fresh(page, "/satori");
    await page.fill("#ps-request", "Write a friendly onboarding email for new customers");
    await expect(page.getByTestId("cost-estimate")).toContainText(/Est\./);
  });

  test("set a monthly budget and warning level in Settings", async ({ page, request }) => {
    await fresh(page, "/satori/settings#budget");
    await expect(page.getByRole("heading", { name: "Budget & prices" })).toBeVisible();
    await page.fill("#ps-budget", "25");
    await page.getByRole("button", { name: "Save budget" }).click();
    await expect(page.getByText("Monthly budget set to $25.00")).toBeVisible();
    const status = await (await request.get("/api/satori/status")).json();
    expect(status.budget).toMatchObject({ yourBudgetUsd: 25, level: "ok" });
    await page.selectOption("#ps-alert", "90");
    await expect.poll(async () => (await (await request.get("/api/satori/status")).json()).budget.alertPercent).toBe(90);

    // Clear it again so other tests start without a budget.
    await page.fill("#ps-budget", "");
    await page.getByRole("button", { name: "Save budget" }).click();
    await expect(page.getByText("Budget removed")).toBeVisible();
    await page.selectOption("#ps-alert", "80");
  });

  test("costs and estimate APIs validate input", async ({ request }) => {
    const costs = await request.get("/api/satori/costs?days=7&tz=UTC");
    expect(costs.ok()).toBe(true);
    expect((await costs.json()).report.daily).toHaveLength(7);
    const est = await request.post("/api/satori/estimate", { data: { kind: "generate", chars: 200 } });
    expect(est.ok()).toBe(true);
    expect((await est.json()).estimates.length).toBeGreaterThan(0);
    const bad = await request.post("/api/satori/estimate", { data: { kind: "launch-rockets", chars: 1 } });
    expect(bad.status()).toBe(400);
  });
});
