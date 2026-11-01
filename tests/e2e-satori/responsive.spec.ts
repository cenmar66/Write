import { expect, test } from "@playwright/test";
import { fresh } from "./helpers";

test("responsive navigation: tab bar + menu on small screens", async ({ page }) => {
  await fresh(page);
  const tabs = page.getByRole("navigation", { name: "PromptSatori tabs" });
  await expect(tabs).toBeVisible();
  await expect(page.getByRole("navigation", { name: "PromptSatori", exact: true })).toBeHidden();
  await tabs.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/\/satori\/library$/);
  await tabs.getByRole("button", { name: "More pages" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("link", { name: "Testing Lab" }).click();
  await expect(page).toHaveURL(/\/satori\/lab$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  // Primary action stays reachable and nothing overflows horizontally.
  await page.goto("/satori");
  await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
