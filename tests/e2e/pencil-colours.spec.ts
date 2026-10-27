import { expect, test, type Page } from "@playwright/test";
import { idbCount, openPlanner } from "./helpers";

async function stroke(page: Page, selector: string, pointerType: "pen" | "touch" | "mouse") {
  const canvas = page.locator(selector);
  const box = (await canvas.boundingBox())!;
  const x = box.x + 30;
  const y = box.y + 30;
  const opts = (dx: number) => ({ pointerType, pointerId: 7, clientX: x + dx, clientY: y + dx / 2, pressure: 0.6, isPrimary: true, bubbles: true, button: 0, buttons: 1 });
  await canvas.dispatchEvent("pointerdown", opts(0));
  for (let i = 1; i <= 8; i++) await canvas.dispatchEvent("pointermove", opts(i * 8));
  await canvas.dispatchEvent("pointerup", opts(64));
}

test.describe("Apple Pencil annotation (simulated pen events)", () => {
  test("pen draws in Pencil Mode, ink is saved and shows after reload; touch does not draw", async ({ page }, info) => {
    test.skip(info.project.name === "iphone", "Pencil is an iPad/desktop feature");
    await openPlanner(page);
    const notesInk = "#section-notes canvas.dc-ink";
    // Outside Pencil Mode nothing is drawn.
    await stroke(page, notesInk, "pen");
    expect(await idbCount(page, "canvas_ink")).toBe(0);
    await page.getByRole("button", { name: "Pencil mode (handwriting)" }).click();
    await expect(page.getByRole("toolbar", { name: "Pencil tools" })).toBeVisible();
    await stroke(page, notesInk, "pen");
    await stroke(page, notesInk, "touch"); // palm or finger: ignored by default
    await page.waitForTimeout(200);
    expect(await idbCount(page, "canvas_ink")).toBe(1);
    // The whole line was captured, not just the first point.
    const points = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((r) => {
        const q = indexedDB.open("daily-canvas-local");
        q.onsuccess = () => r(q.result);
      });
      const rows: { points: number[] }[] = await new Promise((r) => {
        const q = db.transaction("canvas_ink").objectStore("canvas_ink").getAll();
        q.onsuccess = () => r(q.result);
      });
      db.close();
      return rows[0].points.length / 3;
    });
    expect(points).toBeGreaterThanOrEqual(9);
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(100);
    expect(await idbCount(page, "canvas_ink")).toBe(0);
    await page.getByRole("button", { name: "Redo" }).click();
    await page.waitForTimeout(100);
    expect(await idbCount(page, "canvas_ink")).toBe(1);
    await page.getByRole("button", { name: "Exit Pencil Mode" }).click();
    await page.reload();
    await openPlanner(page);
    await page.waitForTimeout(600);
    // Still visible (view-only) after reload: the canvas has painted pixels.
    const painted = await page.evaluate((sel) => {
      const c = document.querySelector(sel) as HTMLCanvasElement;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
      return false;
    }, notesInk);
    expect(painted).toBe(true);
  });

  test("eraser removes a stroke", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await openPlanner(page);
    await page.getByRole("button", { name: "Pencil mode (handwriting)" }).click();
    await stroke(page, "#section-notes canvas.dc-ink", "pen");
    await page.waitForTimeout(100);
    expect(await idbCount(page, "canvas_ink")).toBe(1);
    await page.getByRole("button", { name: "Eraser" }).click();
    await stroke(page, "#section-notes canvas.dc-ink", "pen");
    await page.waitForTimeout(200);
    expect(await idbCount(page, "canvas_ink")).toBe(0);
  });
});

test.describe("section colours", () => {
  test("pick a colour, it persists, text stays readable, defaults restore", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await openPlanner(page);
    const head = page.locator("#section-must header");
    const before = await head.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByRole("button", { name: "Must Do Today options" }).click();
    await page.getByRole("menuitem", { name: "Section colour" }).click();
    await page.getByRole("radio", { name: "Rose" }).click();
    await page.waitForTimeout(200);
    await page.reload();
    await openPlanner(page);
    const after = await head.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(after).not.toBe(before);
    // WCAG contrast measured in the browser.
    const ratio = await head.evaluate((el) => {
      const parse = (c: string) => c.match(/\d+/g)!.slice(0, 3).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const s = getComputedStyle(el);
      const [a, b] = [lum(parse(s.backgroundColor)), lum(parse(s.color))].sort((x, y) => y - x);
      return (a + 0.05) / (b + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.goto("/canvas/settings");
    await page.getByRole("button", { name: "Restore defaults" }).click();
    await page.goto("/canvas");
    await openPlanner(page);
    expect(await head.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before);
  });

  test("a theme preset applies to every section", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.goto("/canvas/settings");
    await page.getByRole("button", { name: /Forest & Sky/ }).click();
    await page.goto("/canvas");
    await openPlanner(page);
    const color = await page.locator("#section-must header").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(color).toBe("rgb(63, 115, 86)");
  });

  test("hiding a section keeps its data", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await openPlanner(page);
    await page.getByPlaceholder("Add something to buy…").fill("Batteries");
    await page.getByPlaceholder("Add something to buy…").press("Enter");
    await page.getByRole("button", { name: "To Buy options" }).click();
    await page.getByRole("menuitem", { name: "Hide section" }).click();
    await expect(page.locator("#section-shopping")).toHaveCount(0);
    expect(await idbCount(page, "canvas_tasks", "Batteries")).toBe(1);
    await page.goto("/canvas/settings");
    await page.getByRole("button", { name: "Show To Buy" }).click();
    await page.goto("/canvas");
    await openPlanner(page);
    await expect(page.locator("#section-shopping").getByText("Batteries")).toBeVisible();
  });
});
