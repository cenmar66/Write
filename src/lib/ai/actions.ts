// Shared between the browser (menus) and the server (prompts).

export const TONES = ["Professional", "Friendly", "Confident", "Persuasive", "Casual", "Witty"] as const;
export type Tone = (typeof TONES)[number];

export const EDIT_ACTIONS = {
  rewrite: { label: "Rewrite", hint: "Same idea, better words" },
  shorten: { label: "Shorten", hint: "Cut it down" },
  expand: { label: "Expand", hint: "Add depth and detail" },
  grammar: { label: "Fix grammar", hint: "Spelling and punctuation" },
  simplify: { label: "Simplify", hint: "7th-grade reading level" },
  tone: { label: "Change tone", hint: "" },
  continue: { label: "Continue writing", hint: "" },
} as const;
export type EditAction = keyof typeof EDIT_ACTIONS;
