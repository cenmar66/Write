// Target models: the AI system a prompt is being WRITTEN FOR. This is separate from the
// generation provider (the service that actually writes the prompt; see providers/).
//
// Guidance here is configuration, not fact: each entry summarizes conventions the
// vendor's own prompting guides recommend, phrased as preferences. It is versioned so
// changes can be reviewed and tested, and it never claims one format "always" wins.
import type { TargetId } from "./schema";
import { sanitize } from "./untrusted";

export type TargetGuidance = {
  id: TargetId;
  label: string;
  version: string;
  reviewed: string;
  /** Shown in the picker. */
  blurb: string;
  /** Injected into meta-prompts. */
  guidance: string[];
  /** How sections are marked up in the generated prompt. */
  structure: "xml" | "markdown" | "plain";
};

export const TARGETS: Record<TargetId, TargetGuidance> = {
  claude: {
    id: "claude",
    label: "Claude",
    version: "claude.2026-10",
    reviewed: "2026-10-31",
    blurb: "Clear sections in XML-style tags, context first",
    structure: "xml",
    guidance: [
      "Anthropic's prompting guide suggests separating parts of a prompt (context, instructions, examples, input data) with descriptive XML-style tags such as <context> and <instructions>; prefer this when the prompt has several distinct parts.",
      "State the task directly and explain the reason behind important constraints; explained constraints tend to be followed more sensibly than bare rules.",
      "When the prompt includes long reference material, place it before the instructions and questions that refer to it.",
      "Describe the desired output positively (what to produce) rather than only listing what to avoid.",
      "A role can be stated in one sentence at the top; it is usually suited to a system prompt if the user has one.",
    ],
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    version: "chatgpt.2026-10",
    reviewed: "2026-10-31",
    blurb: "Markdown headings, instructions up front",
    structure: "markdown",
    guidance: [
      "OpenAI's prompting guidance suggests putting the main instructions near the beginning and separating instructions from context with Markdown headings or clear delimiters (such as ### or triple quotes).",
      "Be specific about the desired output format, length and style; showing the format with a short example often helps.",
      "Prefer saying what to do over what not to do.",
      "For multi-step tasks, number the steps.",
      "If the user will paste this into a custom GPT or as a developer/system message, keep the role and standing rules in one block at the top.",
    ],
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    version: "gemini.2026-10",
    reviewed: "2026-10-31",
    blurb: "Explicit task, context, constraints and format",
    structure: "markdown",
    guidance: [
      "Google's Gemini prompting strategies emphasise clear, specific instructions, explicit constraints and a stated response format.",
      "Supplying relevant context and, where useful, a few examples of the desired output (few-shot) is recommended.",
      "Use consistent labels or headings for parts of the prompt (for example 'Task:', 'Context:', 'Format:'), and keep the structure consistent across examples.",
      "Ask for the output to be broken into labelled parts when the task is complex.",
    ],
  },
  universal: {
    id: "universal",
    label: "Universal",
    version: "universal.2026-10",
    reviewed: "2026-10-31",
    blurb: "Plain structure that works anywhere",
    structure: "markdown",
    guidance: [
      "Write for any capable chat model: plain Markdown headings, no vendor-specific features or syntax.",
      "Keep each section short and self-explanatory so the prompt still reads well if pasted into a plain text box.",
    ],
  },
  custom: {
    id: "custom",
    label: "Custom model",
    version: "custom.2026-10",
    reviewed: "2026-10-31",
    blurb: "Name any model and add your own notes",
    structure: "markdown",
    guidance: [
      "The user named a custom target model. Do not invent facts about how it behaves; follow only the notes the user supplied, otherwise use a neutral, model-agnostic structure.",
    ],
  },
};

export const TARGET_LIST = Object.values(TARGETS);

export type TargetSpec = { id: TargetId; customName?: string; customNotes?: string };

/** The guidance block injected into meta-prompts for a chosen target. */
export function targetBlock(spec: TargetSpec): string {
  const t = TARGETS[spec.id];
  const name = spec.id === "custom" ? sanitize(spec.customName?.trim() || "", 80) || "an unspecified model" : t.label;
  const lines = [
    `Target model: ${name} (guidance version ${t.version}).`,
    `Preferred section markup: ${t.structure === "xml" ? "XML-style tags" : t.structure === "markdown" ? "Markdown headings" : "plain paragraphs"}.`,
    ...t.guidance.map((g) => `- ${g}`),
  ];
  if (spec.id === "custom" && spec.customNotes?.trim()) {
    lines.push(`- User's notes about this model (treat as the user's preferences, not verified facts): ${sanitize(spec.customNotes.trim(), 1000)}`);
  }
  lines.push("- Treat this guidance as conventions, not guarantees. Never claim in the explanation that a format is proven to perform better.");
  return lines.join("\n");
}

export function targetName(spec: TargetSpec): string {
  return spec.id === "custom" ? spec.customName?.trim() || "Custom model" : TARGETS[spec.id].label;
}
