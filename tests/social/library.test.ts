import { expect, it } from "vitest";
import { PROMPTS, PROMPT_SECTIONS, PROMPT_PACKS } from "@/lib/social/prompts";
it("prompt library: unique keys and pack names, every pack described", () => {
  const keys = PROMPTS.map((p) => p.key);
  expect(new Set(keys).size).toBe(keys.length);
  const packs = PROMPT_SECTIONS.flatMap((s) => s.packs);
  expect(new Set(packs).size).toBe(packs.length);
  for (const p of packs) expect(PROMPT_PACKS[p], p).toBeTruthy();
  expect(PROMPTS.length).toBeGreaterThan(600);
});
