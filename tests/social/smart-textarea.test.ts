import { expect, it } from "vitest";
import { textIssues, toPlain } from "@/components/social/smart-textarea";

it("posts: AI Markdown becomes plain text", () => {
  expect(toPlain("**Bold** idea and *this* one\n# Heading\nSee [the guide](https://x.com/a) or `code`.")).toBe(
    "Bold idea and this one\nHeading\nSee the guide (https://x.com/a) or code.",
  );
  expect(toPlain("- keeps bullets\n- and line breaks")).toBe("- keeps bullets\n- and line breaks");
  expect(toPlain("2 * 3 = 6, #hashtag stays")).toBe("2 * 3 = 6, #hashtag stays");
});

it("posts: style notes are checked per line, with offsets into the whole text", () => {
  const text = "Plain first line.\n🚀 Ship it — really fast";
  const found = textIssues(text).map((i) => [i.rule ?? i.kind, text.slice(i.from, i.to)]);
  expect(found).toEqual([
    ["emoji-bullet", "🚀"],
    ["em-dash", "—"],
    ["filler", "really"],
  ]);
});
