import type { EditAction, Tone } from "./actions";

/** Phase 4 fills this in with the voice profile. */
export function voiceInstructions(): string {
  return "";
}

const BASE = `You are the writing assistant inside Write.ai, a personal writing app.
Always answer in the same language as the text you're working on (usually English or Spanish).
Write in Markdown. Keep any formatting the original uses (headings, lists, bold).`;

const INSTRUCTIONS: Record<Exclude<EditAction, "continue" | "tone">, string> = {
  rewrite: "Rewrite the passage so it reads better. Keep the meaning, facts, and roughly the same length.",
  shorten: "Make the passage about half as long. Keep the key points and the author's voice.",
  expand: "Expand the passage with more detail, examples, or explanation, to roughly 1.5 to 2 times the length.",
  grammar: "Fix spelling, grammar, and punctuation only. Do not change wording, tone, or structure beyond what is needed.",
  simplify: "Rewrite the passage at a 7th-grade reading level: short sentences, everyday words, same meaning.",
};

export function editPrompt(opts: {
  action: EditAction;
  text: string;
  document: string;
  tone?: Tone;
}): { system: string; user: string } {
  const voice = voiceInstructions();
  const system = [
    BASE,
    "Reply with only the finished text. No introduction, no quotation marks around it, no explanation.",
    voice,
    `Here is the full document for context:\n<document>\n${opts.document}\n</document>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (opts.action === "continue") {
    return {
      system,
      user: `Continue writing from exactly where this text ends. Write one to three paragraphs that flow naturally from it. Do not repeat what's already written.\n\n<text_so_far>\n${opts.text}\n</text_so_far>`,
    };
  }

  const instruction =
    opts.action === "tone"
      ? `Rewrite the passage in a ${(opts.tone ?? "Professional").toLowerCase()} tone. Keep the meaning.`
      : INSTRUCTIONS[opts.action];

  return { system, user: `${instruction}\n\n<passage>\n${opts.text}\n</passage>` };
}

export function chatSystem(opts: { title: string; document: string }): string {
  return [
    BASE,
    `You're chatting with the author about their document "${opts.title || "Untitled"}".
Help them brainstorm, give feedback, answer questions, and draft new passages.
Be warm and direct. Keep replies short unless they ask for a full draft.
When you write text meant to go into the document, write it ready to paste, with no extra commentary inside it.`,
    voiceInstructions(),
    `<document>\n${opts.document || "(The document is empty so far.)"}\n</document>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
