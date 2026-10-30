import { describe, expect, it } from "vitest";
import { findStyleIssues, sentenceRange } from "@/lib/editor/style-check";

describe("findStyleIssues", () => {
  it("flags each kind", () => {
    const text = "I really think the end result is a game changer. Let's delve in.";
    const kinds = findStyleIssues(text).map((i) => [i.text, i.kind]);
    expect(kinds).toEqual([
      ["really", "filler"],
      ["end result", "redundancy"],
      ["game changer", "cliche"],
      ["delve", "ai"],
    ]);
  });

  it("matches whole words only, and curly apostrophes", () => {
    expect(findStyleIssues("Justice is adjusting. Everyday reality.")).toEqual([]);
    expect(findStyleIssues("It’s important to note this.")[0]?.kind).toBe("ai");
  });

  it("prefers the longer phrase and never overlaps", () => {
    const issues = findStyleIssues("We need to plan ahead in order to win.");
    expect(issues.map((i) => i.text)).toEqual(["plan ahead", "in order to"]);
  });
});

describe("sentenceRange", () => {
  const text = "First one. Second one! Third";
  it("finds the sentence around the cursor", () => {
    expect(text.slice(...sentenceRange(text, 3))).toBe("First one.");
    expect(text.slice(...sentenceRange(text, 13))).toBe("Second one!");
    expect(text.slice(...sentenceRange(text, text.length))).toBe("Third");
  });
  it("keeps the cursor right after a period in that sentence", () => {
    expect(text.slice(...sentenceRange(text, 10))).toBe("First one.");
  });
});
