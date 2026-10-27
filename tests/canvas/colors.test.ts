import { describe, expect, it } from "vitest";
import { PALETTE, THEMES, contrast, headerColors, checkboxColor } from "@/lib/canvas/colors";

describe("colour guardrails", () => {
  const all = [...PALETTE.map((p) => p.hex), ...THEMES.flatMap((t) => Object.values(t.colors)), "#ffff00", "#ffffff", "#000000", "#f0e68c"];
  it("every header colour reaches WCAG AA text contrast, light and dark", () => {
    for (const c of all) {
      for (const dark of [false, true]) {
        const { bg, fg } = headerColors(c, dark);
        expect(contrast(bg, fg), `${c} dark=${dark}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("checkboxes reach 3:1 against the card", () => {
    for (const c of all) expect(contrast(checkboxColor(c, "#fdfbf6"), "#fdfbf6")).toBeGreaterThanOrEqual(3);
  });
});
