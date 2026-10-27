import { expect, type Page } from "@playwright/test";

export async function openPlanner(page: Page) {
  await page.goto("/canvas");
  await expect(page.locator("#dc-main")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Opening your planner…")).toHaveCount(0);
}

export async function addTask(page: Page, placeholder: string | RegExp, text: string) {
  const input = page.getByPlaceholder(placeholder).first();
  await input.fill(text);
  await input.press("Enter");
}

/** Count live rows in one of the planner's IndexedDB stores (local-only mode). */
export async function idbCount(page: Page, store: string, filter?: string) {
  return page.evaluate(
    async ([store, filter]) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("daily-canvas-local");
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const rows: Record<string, unknown>[] = await new Promise((res) => {
        const req = db.transaction(store).objectStore(store).getAll();
        req.onsuccess = () => res(req.result);
      });
      db.close();
      return rows.filter((r) => !r.deleted_at && (!filter || JSON.stringify(r).includes(filter))).length;
    },
    [store, filter ?? ""] as const,
  );
}

/** A fake Web Speech API for dictation tests (no microphone in CI). */
export const fakeSpeech = (mode: "ok" | "denied", transcript = "buy batteries") => `
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
    start() {
      setTimeout(() => {
        if (${JSON.stringify(mode)} === "denied") { this.onerror && this.onerror({ error: "not-allowed" }); this.onend && this.onend(); return; }
        const res = [{ isFinal: true, 0: { transcript: ${JSON.stringify(transcript)} } }];
        this.onresult && this.onresult({ resultIndex: 0, results: res });
      }, 50);
    }
    stop() { setTimeout(() => this.onend && this.onend(), 10); }
    abort() { this.onend && this.onend(); }
  };
`;
