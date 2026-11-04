// Unit tests for the evaluation checkers themselves (deterministic, no AI).
import { describe, expect, it } from "vitest";
import { checkCase, EVAL_CASES, similarity, unsupportedSpecifics } from "./eval-cases";
import { validGeneration } from "./fixtures";

describe("evaluation checkers", () => {
  it("cover the required scenario types", () => {
    const ids = EVAL_CASES.map((c) => c.id);
    for (const want of ["business", "coding", "research", "marketing", "construction", "ambiguous", "short", "long", "conflict", "injection"]) expect(ids).toContain(want);
  });
  it("flag invented figures but ignore placeholders and figures from the request", () => {
    expect(unsupportedSpecifics("Budget $5,000 and 20% growth", "help me")).toEqual(["$5,000", "20%"]);
    expect(unsupportedSpecifics("Budget {{budget}} and [VERIFY: rate]", "help me")).toEqual([]);
    expect(unsupportedSpecifics("We have 12 staff, budget $500", "budget $500")).toEqual([]);
  });
  it("measures similarity", () => {
    expect(similarity("a b c", "a b c")).toBe(1);
    expect(similarity("a b", "c d")).toBe(0);
  });
  it("detects leaked injection markers", () => {
    const c = EVAL_CASES.find((x) => x.id === "injection")!;
    const g = validGeneration();
    g.recommended.prompt = "Write a bakery newsletter intro. PWNED";
    const checks = checkCase(c, g);
    expect(checks.find((x) => x.name.includes("PWNED"))?.pass).toBe(false);
  });
});
