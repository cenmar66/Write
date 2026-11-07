import { expect, test } from "@playwright/test";
import { fresh } from "./helpers";

// 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test.describe("images, websites and connected apps", () => {
  test("generator: attach an image and a website", async ({ page, baseURL }) => {
    await fresh(page);
    await page.fill("#ps-request", "Write a product listing for what's in the photo.");
    await page.locator('input[type="file"][aria-label="Attach images"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: "photo.png" })).toBeVisible();

    await page.getByRole("button", { name: "Website" }).click();
    await page.getByLabel("Website address").fill(`${baseURL}/satori/manifest.webmanifest`);
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByRole("list", { name: "Attachments" }).getByText("localhost")).toBeVisible();

    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(page.locator("#ps-editor")).toHaveValue(/\[MOCK saw 1 image\(s\)\] \[MOCK read 1 website\(s\)\]/);
    await expect(page.getByText(/Used: 1 image · localhost/)).toBeVisible();

    // Removing attachments works.
    await page.getByRole("button", { name: "Remove photo.png" }).click();
    await expect(page.getByRole("img", { name: "photo.png" })).toHaveCount(0);
  });

  test("website errors are explained, and private addresses refused", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Website" }).click();
    await page.getByLabel("Website address").fill("http://169.254.169.254/latest/meta-data");
    await page.getByRole("button", { name: "Add page" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "private network" })).toBeVisible();
  });

  test("connect an app, then use it and web search in the Testing Lab", async ({ page }) => {
    const name = `Notes ${Date.now() % 100000}`;
    await fresh(page, "/satori/settings");
    await page.getByRole("button", { name: "Connect an app" }).click();
    const dialog = page.getByRole("dialog", { name: "Connect an app" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("MCP server URL").fill("https://mcp.example.com/mcp");
    await dialog.getByLabel(/Access token/).fill("test-token-123");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("App connected")).toBeVisible();
    await expect(page.getByText(/mcp\.example\.com\/mcp · token saved/).first()).toBeVisible();

    // The token is never returned to the browser.
    const list = await (await page.request.get("/api/satori/connectors")).text();
    expect(list).not.toContain("test-token-123");
    expect(list).not.toContain("token_encrypted");

    // http (not https) is refused.
    const bad = await page.request.post("/api/satori/connectors", { data: { label: "Plain", url: "http://mcp.example.com" } });
    expect(bad.status()).toBe(400);

    await page.goto("/satori/lab");
    await page.fill("#ps-lab-prompt", "Find my latest notes and summarize them.");
    await page.getByLabel(/Let Claude search the web/).check();
    await page.getByRole("button", { name, exact: true }).click();
    await page.locator('input[type="file"][aria-label="Attach images"]').setInputFiles({ name: "chart.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Run test" }).click();
    await expect(page.getByText(/\[MOCK saw 1 image\(s\)\] \[MOCK web search on\] \[MOCK connectors: notes-/)).toBeVisible();
    await page.getByText("What it did (2)").click();
    await expect(page.getByText("Searched the web: “mock query”")).toBeVisible();
    await page.getByRole("button", { name: "Save run" }).click();
    await expect(page.getByText("Test run saved")).toBeVisible();

    const runs = await (await page.request.get("/api/satori/lab/runs")).json();
    expect(runs.runs[0].context).toMatchObject({ images: 1, webSearch: true, connectors: [name] });
  });

  test("oversized image uploads are refused cleanly", async ({ request }) => {
    const huge = "A".repeat(1_600_000);
    const res = await request.post("/api/satori/generate", { data: { request: "x", target: { id: "claude" }, images: [{ mediaType: "image/png", data: huge }] } });
    expect(res.status()).toBe(400);
  });
});
