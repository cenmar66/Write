// Section colours: curated palette, theme presets, and contrast guardrails.
// Every header colour is passed through `headerColors`, which guarantees WCAG AA
// (4.5:1) between the header text and its background, whatever the person picks.

import type { SectionKey } from "./types";

export const PALETTE: { name: string; hex: string }[] = [
  { name: "Muted green", hex: "#5f8f6c" },
  { name: "Sage", hex: "#7c9a7e" },
  { name: "Soft teal", hex: "#4f8f94" },
  { name: "Soft blue", hex: "#6189b8" },
  { name: "Sky", hex: "#7aa3cc" },
  { name: "Muted violet", hex: "#8a76b0" },
  { name: "Lavender", hex: "#a08cc4" },
  { name: "Blush", hex: "#c7848c" },
  { name: "Rose", hex: "#b56b7a" },
  { name: "Warm gold", hex: "#c39a4e" },
  { name: "Terracotta", hex: "#b9785c" },
  { name: "Olive", hex: "#8b8a5a" },
  { name: "Slate", hex: "#6b7480" },
  { name: "Stone", hex: "#8f877c" },
  { name: "Charcoal", hex: "#4a4a48" },
  { name: "Plum", hex: "#7d5a7a" },
];

export type ThemePreset = { id: string; name: string; colors: Record<SectionKey, string> };

export const THEMES: ThemePreset[] = [
  {
    id: "paper-classic",
    name: "Paper Classic",
    colors: {
      must: "#5f8f6c",
      appointments: "#c7848c",
      work: "#8a76b0",
      comms: "#6189b8",
      journal: "#c39a4e",
      shopping: "#4f8f94",
      personal: "#a08cc4",
      exercise: "#7c9a7e",
      meals: "#6f97c0",
      water: "#7aa3cc",
      ideas: "#6f93c6",
      notes: "#8aa088",
    },
  },
  {
    id: "soft-pastels",
    name: "Soft Pastels",
    colors: {
      must: "#9cc5a8",
      appointments: "#e7b3b8",
      work: "#c3b5df",
      comms: "#a9c4e6",
      journal: "#ecd29a",
      shopping: "#a3d0cf",
      personal: "#d6c4ea",
      exercise: "#b9d1b5",
      meals: "#b5cde6",
      water: "#bcd8f0",
      ideas: "#b0c6ea",
      notes: "#c6d4bf",
    },
  },
  {
    id: "minimal-neutral",
    name: "Minimal Neutral",
    colors: {
      must: "#4a4a48",
      appointments: "#6b7480",
      work: "#5d5a55",
      comms: "#6b7480",
      journal: "#8f877c",
      shopping: "#6b7480",
      personal: "#5d5a55",
      exercise: "#8f877c",
      meals: "#6b7480",
      water: "#7a8a96",
      ideas: "#4a4a48",
      notes: "#8f877c",
    },
  },
  {
    id: "forest-sky",
    name: "Forest & Sky",
    colors: {
      must: "#3f7356",
      appointments: "#4f7fa8",
      work: "#55806a",
      comms: "#4b78a6",
      journal: "#8b8a5a",
      shopping: "#4f8f94",
      personal: "#5f8f6c",
      exercise: "#3f7356",
      meals: "#6189b8",
      water: "#4f86b8",
      ideas: "#355f88",
      notes: "#7c9a7e",
    },
  },
  {
    id: "warm-studio",
    name: "Warm Studio",
    colors: {
      must: "#b9785c",
      appointments: "#b56b7a",
      work: "#8b6f5a",
      comms: "#a0765c",
      journal: "#c39a4e",
      shopping: "#9a8455",
      personal: "#7d5a7a",
      exercise: "#8b8a5a",
      meals: "#b9785c",
      water: "#6f97b0",
      ideas: "#a06a5a",
      notes: "#8f877c",
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

export function sectionColor(
  key: SectionKey,
  custom: Partial<Record<SectionKey, string>> | undefined,
  themeId: string | undefined,
): string {
  const c = custom?.[key];
  if (c && isHex(c)) return c;
  const theme = THEMES.find((t) => t.id === themeId) ?? DEFAULT_THEME;
  return theme.colors[key];
}

export function isHex(v: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(v);
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

export const INK_DARK = "#1f2328";
export const WHITE = "#ffffff";

/**
 * Header background + text colour that always reads well (≥ 4.5:1).
 * Prefers white text on the chosen colour (the planner's look). If white doesn't
 * reach AA, the colour is deepened a little; very light picks switch to dark text.
 */
export function headerColors(hex: string, dark = false): { bg: string; fg: string } {
  const base = isHex(hex) ? hex : DEFAULT_THEME.colors.must;
  let bg = dark ? mix(base, "#000000", 0.25) : base;
  if (contrast(bg, WHITE) >= 4.5) return { bg, fg: WHITE };
  for (let t = 0.05; t <= 0.3001; t += 0.05) {
    const deeper = mix(bg, "#000000", t);
    if (contrast(deeper, WHITE) >= 4.5) return { bg: deeper, fg: WHITE };
  }
  if (contrast(bg, INK_DARK) >= 4.5) return { bg, fg: INK_DARK };
  bg = mix(base, "#000000", 0.45);
  return { bg, fg: WHITE };
}

/** Soft tint for checkboxes, rings and borders. */
export function accentTint(hex: string, amount = 0.85, dark = false): string {
  return mix(hex, dark ? "#1b1b1a" : "#ffffff", amount);
}

/** Checkbox fill must reach 3:1 against the card (non-text contrast). */
export function checkboxColor(hex: string, cardBg: string): string {
  let c = hex;
  for (let i = 0; i < 8 && contrast(c, cardBg) < 3; i++) c = mix(c, luminance(cardBg) > 0.5 ? "#000000" : "#ffffff", 0.12);
  return c;
}
