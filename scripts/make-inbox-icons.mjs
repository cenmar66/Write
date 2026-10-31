// Renders public/inbox-icons/icon.svg to the PNG sizes the PWA manifest and iOS need.
// Uses Playwright's Chromium (preinstalled in Claude Code cloud sessions).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const svg = readFileSync(new URL("../public/inbox-icons/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["apple-touch-icon.png", 180, 0]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size - pad * 2}" height="${size - pad * 2}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../public/inbox-icons/${name}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log("icons written");
