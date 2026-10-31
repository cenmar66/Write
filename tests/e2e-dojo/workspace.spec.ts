import { expect, test } from "@playwright/test";
import { fresh, generate } from "./helpers";

test.describe("library, templates, analyzer, lab, history, settings", () => {
  test("save to library, search, edit, version, favorite, archive, trash and restore", async ({ page }) => {
    const title = `Campaign ${Date.now()}`;
    await fresh(page);
    await generate(page, "Create a referral campaign for a roofing company.");
    await page.getByRole("button", { name: "Make shorter" }).click();
    await expect(page.getByText("What changed:")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Save to library" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Category").selectOption("Marketing");
    await dialog.getByLabel("Tags").fill("referrals, roofing");
    await expect(dialog.getByText("Includes all 2 versions")).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved to your library")).toBeVisible();

    // Refinements after saving sync to the library as new versions.
    await page.getByRole("button", { name: "Add examples" }).first().click();
    await expect(page.getByRole("heading", { name: /Versions/ })).toContainText("(3)");
    // Editing a saved prompt and pressing Save adds a version instead of a duplicate.
    const genEditor = page.locator("#pd-editor");
    await genEditor.fill(`${await genEditor.inputValue()}\nOne more line.`);
    await page.getByRole("button", { name: "Save edit" }).click();
    await expect(page.getByRole("heading", { name: /Versions/ })).toContainText("(4)");

    await page.goto("/dojo/library");
    await page.getByPlaceholder("Search titles, text and tags").fill("roofing");
    const card = page.locator("li", { hasText: title });
    await expect(card).toHaveCount(1);
    await card.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Versions/ })).toContainText("(4)");

    const editor = page.locator("#pd-detail-editor");
    await editor.fill("Hand-edited prompt text.");
    await page.getByRole("button", { name: "Save as new version" }).click();
    await expect(page.getByRole("heading", { name: /Versions/ })).toContainText("(5)");

    await page.getByRole("button", { name: "Add to favorites" }).click();
    await page.goto("/dojo/library");
    await page.getByRole("button", { name: "Favorites" }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();

    const item = page.locator("li", { hasText: title });
    await item.getByRole("button", { name: "More actions" }).click();
    await item.getByRole("menuitem", { name: "Archive" }).click();
    await expect(page.locator("li", { hasText: title })).toHaveCount(0);
    await page.getByRole("tab", { name: "Archived" }).click();
    const archived = page.locator("li", { hasText: title });
    await archived.getByRole("button", { name: "More actions" }).click();
    await archived.getByRole("menuitem", { name: "Move to trash" }).click();
    await page.getByRole("tab", { name: "Trash" }).click();
    const trashed = page.locator("li", { hasText: title });
    await trashed.getByRole("button", { name: "More actions" }).click();
    await trashed.getByRole("menuitem", { name: "Restore" }).click();
    await expect(page.getByText("Restored")).toBeVisible();
  });

  test("export JSON and import it back", async ({ page, request }) => {
    await fresh(page);
    const res = await request.get("/api/dojo/export?format=json");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.format).toBe("promptdojo.export");
    const marker = `Imported ${Date.now()}`;
    data.prompts = [{ title: marker, description: "", category: "Writing", collection: "Imports", target_model: "gemini", custom_target: "", favorite: false, tags: ["io"], versions: [{ content: "v1 text", kind: "generated", instruction: "" }, { content: "v2 text", kind: "refined", instruction: "shorter" }] }];
    data.templates = [];
    await page.goto("/dojo/library");
    await page.locator('input[type="file"]').setInputFiles({ name: "export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
    await expect(page.getByText("Imported 1 prompts")).toBeVisible();
    await page.getByPlaceholder("Search titles, text and tags").fill(marker);
    await expect(page.locator("li", { hasText: marker })).toContainText("v2");
    const md = await request.get("/api/dojo/export?format=md");
    expect(await md.text()).toContain(`# ${marker}`);
    const bad = await request.post("/api/dojo/import", { data: { hello: "world" } });
    expect(bad.status()).toBe(400);
  });

  test("templates: fill fields, preview, and save", async ({ page }) => {
    await fresh(page, "/dojo/templates");
    await page.getByRole("button", { name: "Construction & Restoration", exact: true }).click();
    await page.getByRole("button", { name: /Change-order draft/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Original scope item").fill("Install new vanity");
    await expect(dialog.getByText("Original scope: Install new vanity")).toBeVisible();
    await expect(dialog.getByText(/Do not invent building-code requirements/)).toBeVisible();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    const save = page.getByRole("dialog", { name: "Save to library" });
    await save.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved to your library")).toBeVisible();
  });

  test("templates hand off to the generator for AI customization", async ({ page }) => {
    await fresh(page, "/dojo/templates");
    await page.getByRole("button", { name: /Cold email outreach/ }).click();
    await page.getByRole("dialog").getByLabel("Who you are").fill("Owner of a pressure washing business");
    await page.getByRole("button", { name: "Customize with AI" }).click();
    await expect(page).toHaveURL(/\/dojo$/);
    await expect(page.locator("#pd-request")).toHaveValue(/Owner of a pressure washing business/);
  });

  test("analyzer: instant quick check, AI review, before/after", async ({ page }) => {
    await fresh(page, "/dojo/analyzer");
    await page.fill("#pd-analyze-input", "Write something about dogs");
    await expect(page.getByRole("heading", { name: "Quick check" })).toBeVisible();
    await expect(page.getByText(/heuristic quality indicators/)).toBeVisible();
    await page.getByRole("button", { name: "Analyze my prompt" }).click();
    await expect(page.getByRole("heading", { name: "AI review" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Revised prompt" })).toBeVisible();
    await page.getByRole("tab", { name: "Before / After" }).click();
    await expect(page.locator("ins").first()).toBeVisible();
  });

  test("testing lab: run, see which model answered, rate and save", async ({ page }) => {
    await fresh(page, "/dojo/lab");
    await page.fill("#pd-lab-prompt", "Write a haiku about {{topic}}.");
    await page.getByRole("textbox").nth(1).fill("autumn");
    await page.getByRole("button", { name: "Run test" }).click();
    await expect(page.getByText("Mock test provider — not real AI").first()).toBeVisible();
    await expect(page.getByText("Response to: Write a haiku about autumn.")).toBeVisible();
    await page.getByRole("radiogroup", { name: "Relevance rating" }).getByRole("radio", { name: "4 of 5" }).click();
    await page.getByRole("button", { name: "AI first-pass rating" }).click();
    await expect(page.getByText(/AI opinion: 3\/5/).first()).toBeVisible();
    await page.getByRole("button", { name: "Save run" }).click();
    await expect(page.getByText("Test run saved")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved runs" })).toBeVisible();
  });

  test("history reopens a past generation in the generator", async ({ page }) => {
    await fresh(page);
    const req = `History check ${Date.now()}`;
    await generate(page, req);
    await expect(page.getByText("Why this works")).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("pd-session"));
    await page.goto("/dojo/history");
    await page.getByRole("button", { name: new RegExp(req) }).click();
    await expect(page.locator("#pd-request")).toHaveValue(req);
    await expect(page.getByText("Why this works")).toBeVisible();
  });

  test("settings: accent color, profiles, and usage", async ({ page }) => {
    await fresh(page, "/dojo/settings");
    await page.getByRole("radio", { name: "Plum" }).click();
    await expect(page.locator(".pd-root")).toHaveAttribute("data-accent", "plum");
    await page.reload();
    await expect(page.locator(".pd-root")).toHaveAttribute("data-accent", "plum");
    await page.getByRole("radio", { name: "Deep teal" }).click();

    await page.getByRole("button", { name: "+ Construction Specialist" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Usage & limits" })).toBeVisible();
    await expect(page.getByText("AI requests this month")).toBeVisible();
  });
});

test.describe("API safeguards", () => {
  test("rejects oversized and invalid bodies", async ({ request }) => {
    const big = await request.post("/api/dojo/generate", { data: { request: "x".repeat(250_000), target: { id: "claude" } } });
    expect(big.status()).toBe(413);
    const invalid = await request.post("/api/dojo/generate", { data: { request: "hi", target: { id: "skynet" } } });
    expect(invalid.status()).toBe(400);
    const tooLong = await request.post("/api/dojo/generate", { data: { request: "x".repeat(9000), target: { id: "claude" } } });
    expect(tooLong.status()).toBe(400);
    expect((await tooLong.json()).error).toMatch(/8,000/);
  });
  test("never exposes secrets in status", async ({ request }) => {
    const s = await (await request.get("/api/dojo/status")).text();
    expect(s).not.toMatch(/sk-|api_key|apiKey/i);
  });
});
