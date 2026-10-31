// LIVE prompt-quality evaluation (opt-in, costs real API money, a few cents per case).
// Skipped unless DOJO_EVAL=1. Writes a Markdown report to eval-results/ for human review.
// Results are signals about subjective quality, not pass/fail proof of correctness.
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveProvider } from "@/lib/dojo/providers";
import { generate } from "@/lib/dojo/services";
import { checkCase, EVAL_CASES } from "./eval-cases";

const LIVE = process.env.DOJO_EVAL === "1";

describe.skipIf(!LIVE)("live prompt-quality evaluation", () => {
  it(
    "runs every case and writes a report",
    async () => {
      const choice = resolveProvider({ provider: process.env.DOJO_EVAL_PROVIDER, model: process.env.DOJO_EVAL_MODEL });
      if (!choice || choice.provider.isMock) throw new Error("Set a real provider key (e.g. ANTHROPIC_API_KEY) to run the live evaluation.");
      const lines = [`# PromptDojo live evaluation`, ``, `Provider: ${choice.provider.label} · model ${choice.model} · ${new Date().toISOString()}`, ``, `Automatic checks are heuristics. Read the prompts below before drawing conclusions.`, ``];
      let failed = 0;
      for (const c of EVAL_CASES) {
        const started = Date.now();
        try {
          const r = await generate(choice, { request: c.request, target: c.target });
          const checks = checkCase(c, r.data);
          failed += checks.filter((x) => !x.pass).length;
          lines.push(`## ${c.label} (${c.id}) — ${((Date.now() - started) / 1000).toFixed(1)}s, ${r.usage[0].inputTokens}/${r.usage[0].outputTokens} tokens`, "", `> ${c.request}`, "");
          for (const x of checks) lines.push(`- ${x.pass ? "✅" : "⚠️"} ${x.name}${x.detail ? ` — ${x.detail}` : ""}`);
          lines.push("", "<details><summary>Recommended prompt</summary>", "", "```", r.data.recommended.prompt, "```", "</details>", "");
          for (const a of r.data.alternatives) lines.push(`<details><summary>${a.kind}: ${a.title}</summary>`, "", "```", a.prompt, "```", "</details>", "");
          lines.push(`Assumptions: ${r.data.assumptions.map((a) => a.assumption).join("; ") || "none"}`, "");
        } catch (e) {
          failed++;
          lines.push(`## ${c.label} (${c.id})`, "", `ERROR: ${(e as Error).message}`, "");
        }
      }
      mkdirSync("eval-results", { recursive: true });
      const file = `eval-results/dojo-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
      writeFileSync(file, lines.join("\n"));
      console.log(`Report: ${file} (${failed} checks flagged for review)`);
      expect(true).toBe(true);
    },
    30 * 60_000,
  );
});
