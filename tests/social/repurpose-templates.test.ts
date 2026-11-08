import { expect, it } from "vitest";
import { repurposePrompt } from "@/lib/social/ai";
import { findTemplate } from "@/lib/social/templates";

it("repurpose: picked templates become one post each per platform", () => {
  const templates = [findTemplate("contrarian")!, findTemplate("story-lesson")!];
  const { user } = repurposePrompt({ title: "T", document: "Body", platforms: ["linkedin", "x"], perPlatform: 3, voice: "", templates });
  expect(user).toContain("4 social posts");
  expect(user).toContain('key="contrarian"');
  expect(user).toContain("- x: contrarian as single, story-lesson as");
  expect(user).not.toContain("Template catalog");
});

it("repurpose: no picks falls back to the AI choosing from the catalog", () => {
  const { user } = repurposePrompt({ title: "T", document: "Body", platforms: ["linkedin"], perPlatform: 2, voice: "" });
  expect(user).toContain("2 social posts");
  expect(user).toContain("Template catalog");
});
