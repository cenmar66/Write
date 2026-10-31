import { expect, type Page } from "@playwright/test";

/** Opens a PromptDojo page with clean browser storage. */
export async function fresh(page: Page, path = "/dojo") {
  await page.goto(path);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("pd-onboarded", "true");
  });
  await page.goto(path);
  await expect(page.locator(".pd-root")).toBeVisible();
}

export async function generate(page: Page, request: string, target = "Claude") {
  await page.fill("#pd-request", request);
  await page.getByRole("radio", { name: target, exact: true }).click();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
}
