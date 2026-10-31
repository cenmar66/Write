import { expect, test } from "@playwright/test";
import { fresh, generate } from "./helpers";

test.describe("generator", () => {
  test("generates a recommended prompt plus three alternatives, labelled as mock", async ({ page }) => {
    await fresh(page);
    await expect(page.getByText("Test provider active")).toBeVisible();
    await generate(page, "Create a marketing campaign for my construction business.");
    await expect(page.getByRole("heading", { name: "[MOCK] Prompt for Claude" })).toBeVisible();
    for (const tab of ["Recommended", "Concise", "Comprehensive", "Creative / Strategic"]) await expect(page.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
    await expect(page.locator("#pd-editor")).toHaveValue(/<objective>Create a marketing campaign/);
    await expect(page.getByText("Mock test provider — not real AI").first()).toBeVisible();
    await expect(page.getByText("Why this works")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Missing context" })).toBeVisible();

    await page.getByRole("tab", { name: /Concise/ }).click();
    await expect(page.locator("#pd-editor")).toHaveValue(/^\[MOCK\] Concise:/);
    await page.getByRole("tab", { name: /Creative/ }).click();
    await expect(page.locator("#pd-editor")).toHaveValue(/customer's point of view/);
  });

  test("target model selection changes the prompt structure", async ({ page }) => {
    await fresh(page);
    await generate(page, "Write onboarding emails for new gym members.", "ChatGPT");
    await expect(page.locator("#pd-editor")).toHaveValue(/## Role/);
  });

  test("copy shows a confirmation", async ({ page }) => {
    await fresh(page);
    await generate(page, "Draft a cold email for a cleaning company.");
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(page.getByText("Copied to clipboard")).toBeVisible();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain("[MOCK OUTPUT");
  });

  test("asks clarifying questions, and Generate now proceeds with assumptions", async ({ page }) => {
    await fresh(page);
    await generate(page, "__MOCK_CLARIFY__ help with my thing");
    await expect(page.getByText("A few quick questions")).toBeVisible();
    await expect(page.getByLabel("[MOCK] Who is the audience?")).toBeVisible();
    await page.getByRole("button", { name: "Generate now with assumptions" }).click();
    await expect(page.getByRole("heading", { name: "Assumptions made" })).toBeVisible();
  });

  test("a failed request keeps the user's text and offers retry; draft survives refresh", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Options" }).click();
    await page.getByLabel(/Ask up to three clarifying questions/).uncheck();
    await generate(page, "__MOCK_FAIL__ my important request");
    await expect(page.getByRole("alert").filter({ hasText: "Mock provider failure" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.locator("#pd-request")).toHaveValue("__MOCK_FAIL__ my important request");
    await page.reload();
    await expect(page.locator("#pd-request")).toHaveValue("__MOCK_FAIL__ my important request");
  });

  test("refines into a new version, compares and restores without losing history", async ({ page }) => {
    await fresh(page);
    await generate(page, "Plan a nonfiction chapter about habits.");
    await page.getByRole("button", { name: "Make shorter" }).click();
    await expect(page.getByText("What changed:")).toBeVisible();
    await expect(page.locator("#pd-editor")).toHaveValue(/\[MOCK refined: Make the prompt substantially shorter/);
    await expect(page.getByRole("heading", { name: /Versions/ })).toContainText("(2)");

    await page.fill("#pd-refine-custom", "Make this appropriate for California construction contractors.");
    await page.getByRole("button", { name: "Improve", exact: true }).click();
    await expect(page.locator("#pd-editor")).toHaveValue(/California construction contractor/);

    await page.getByRole("button", { name: "Compare" }).click();
    const dialog = page.getByRole("dialog", { name: "Compare versions" });
    await expect(dialog.locator("ins").first()).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Restore version 1" }).click();
    await expect(page.getByRole("heading", { name: /Versions/ })).toContainText("(4)");
    await expect(page.locator("#pd-editor")).not.toHaveValue(/MOCK refined/);
  });

  test("editor undo/redo and keeping an edit as a version", async ({ page }) => {
    await fresh(page);
    await generate(page, "Write a product description for a standing desk.");
    const editor = page.locator("#pd-editor");
    const original = await editor.inputValue();
    await editor.fill(`${original}\nExtra line I typed.`);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(editor).toHaveValue(original);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(editor).toHaveValue(/Extra line I typed\./);
    await page.getByRole("button", { name: "Keep edit as new version" }).click();
    await expect(page.getByRole("heading", { name: /Versions/ })).toContainText("(2)");
  });

  test("session survives a page refresh", async ({ page }) => {
    await fresh(page);
    await generate(page, "Write a weekly team update template.");
    await expect(page.getByRole("heading", { name: "[MOCK] Prompt for Claude" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "[MOCK] Prompt for Claude" })).toBeVisible();
  });
});
