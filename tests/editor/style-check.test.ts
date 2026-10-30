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

import { slopReport } from "@/lib/editor/style-check";

describe("slop patterns", () => {
  const rules = (t: string) => findStyleIssues(t).filter((i) => i.rule).map((i) => [i.rule, i.text]);
  it("catches sentence-shape tells", () => {
    expect(rules("It's not a tool, it's a mindset.")).toEqual([["not-x", "It's not a tool, it's"]]);
    expect(rules("The result? Twice the sales.")).toEqual([["fake-question", "The result?"]]);
    expect(rules("Speed matters — a lot.")).toEqual([["em-dash", "—"]]);
    expect(rules("🚀 Ship faster")).toEqual([["emoji-bullet", "🚀"]]);
    expect(rules("Here’s the thing: hire slowly.")).toEqual([["phrase", "Here’s the thing"]]);
  });
  it("leaves normal writing alone", () => {
    expect(rules("It's not ready yet. This is fine — wait, no.").map((r) => r[0])).toEqual(["em-dash"]);
    expect(rules("I hired two people last spring and one of them left.")).toEqual([]);
  });
});

describe("slopReport", () => {
  it("scores sloppy text high and plain text low", () => {
    const slop = [
      "In today's fast-paced world, hiring is not a task, it's a journey.",
      "The result? A tapestry of talent — robust, seamless, and pivotal.",
      "Let's dive in. Here's the thing — it's important to note this.",
    ].join("\n");
    const human = [
      "I hired my first engineer in March. It took four months.",
      "She'd built payment systems at a bank, so I skipped the take-home test.",
      "Best call I made that year. Also the slowest.",
    ].join("\n");
    expect(slopReport(slop).level).toBe("high");
    expect(slopReport(human).level).toBe("low");
    expect(slopReport(slop).items.map((i) => i.id)).toContain("not-x");
  });
});
