import type { PromptFormat } from "./prompts";

// Base outlines: a fill-in-the-blank skeleton for each kind of post.
// The AI tailors one to the exact prompt; these show instantly and are the fallback.

export type OutlineStep = { label: string; hint: string };
export type OutlineKind = "story" | "list" | "howto" | "opinion" | "curation" | "lesson" | "cta";
export type Outline = { kind: OutlineKind; targetWords: number; steps: OutlineStep[] };

export const TARGET_WORDS: Record<PromptFormat, number> = { atomic: 250, linkedin: 150, short: 45, thread: 220 };

const BASE: Record<OutlineKind, OutlineStep[]> = {
  story: [
    { label: "Hook", hint: "Drop the reader into the moment: a time, a place, a tension." },
    { label: "Setup", hint: "What was at stake, and what you expected to happen." },
    { label: "Turning point", hint: "What actually happened, the surprise or the hard part." },
    { label: "Lesson", hint: "What it taught you, in one clear sentence." },
    { label: "Close", hint: "How the reader can use it, or a question back to them." },
  ],
  list: [
    { label: "Hook", hint: "The number and the payoff: \"5 ___ that ___.\"" },
    { label: "Items", hint: "3-7 items, one line each, specific and concrete." },
    { label: "Why it matters", hint: "One line on what changes if they act on this." },
    { label: "Close", hint: "Ask readers to add their own, or name your favorite." },
  ],
  howto: [
    { label: "Hook", hint: "The outcome, and who it's for." },
    { label: "The problem", hint: "Why this is hard or usually done wrong." },
    { label: "Steps", hint: "3-5 steps, each starting with a verb." },
    { label: "Proof", hint: "A result, number, or quick example that shows it works." },
    { label: "Close", hint: "The first step to take today." },
  ],
  opinion: [
    { label: "Bold claim", hint: "Your view in one sentence, stated plainly." },
    { label: "Common belief", hint: "What most people think, and why it's understandable." },
    { label: "Your reasons", hint: "2-3 reasons or proof points from experience." },
    { label: "Nuance", hint: "When the common view is still right." },
    { label: "Close", hint: "Invite agreement or debate." },
  ],
  curation: [
    { label: "Hook", hint: "What you're sharing and who it helps." },
    { label: "Picks", hint: "3-7 picks: name plus one line on why each is worth it." },
    { label: "Your favorite", hint: "The one you'd keep if you could only keep one." },
    { label: "Close", hint: "Ask readers for their picks." },
  ],
  lesson: [
    { label: "Hook", hint: "The lesson or realization, stated as a punchy line." },
    { label: "Where it came from", hint: "The experience or moment behind it." },
    { label: "What it looks like", hint: "A concrete example of applying it." },
    { label: "Takeaway", hint: "What the reader should do differently." },
  ],
  cta: [
    { label: "Bridge", hint: "Connect the post to what you're offering." },
    { label: "Offer", hint: "What they get, in one specific line." },
    { label: "Action", hint: "Exactly what to click or do." },
  ],
};

/** Guesses the kind of post from the prompt's wording. */
export function guessKind(title: string, prompt: string): OutlineKind {
  const t = `${title} ${prompt}`.toLowerCase();
  if (/\b(close by|subscribe|newsletter|follow|course|guide|book) /.test(t) && /\bclose\b|invite/.test(t)) return "cta";
  if (/\b(recommend|curate|books?|podcasts?|channels?|resources?|reading list|picks?|tools?|apps?|creators? to follow|people (worth|to) follow)\b/.test(t)) return "curation";
  if (/\b(story|stories|tell|moment|journey|happened|a time|origin|low point|turning point|week in)\b/.test(t)) return "story";
  if (/\b(opinion|views?|believe|belief|hot take|disagree|myths?|unpopular|argument|case for|prediction|predict|bet)\b/.test(t)) return "opinion";
  if (/\b(how|steps?|walk through|process|framework|roadmap|routine|checklist|method|system|formula|model)\b/.test(t)) return "howto";
  if (/\b(list|ways|tips|habits|signs|mistakes|questions|rules|things|lessons|reasons|traits|skills|goals|benefits|secrets|truths)\b/.test(t)) return "list";
  return "lesson";
}

export function baseOutline(title: string, prompt: string, format: PromptFormat): Outline {
  const kind = guessKind(title, prompt);
  const steps = BASE[kind].map((s) => ({ ...s }));
  if (format === "thread") {
    steps[0] = { label: "Post 1: hook", hint: "Promise a specific payoff and say it's a thread." };
    steps.push({ label: "Last post", hint: "Recap in one line and ask readers to follow or repost." });
  }
  if (format === "short") return { kind, targetWords: TARGET_WORDS.short, steps: steps.slice(0, 3) };
  return { kind, targetWords: TARGET_WORDS[format], steps };
}

/** Turns an outline plus your notes into instructions for the AI. */
export function outlineBrief(outline: Outline, notes: string[]): string {
  return [
    `Follow this outline, in order (about ${outline.targetWords} words${outline.kind ? "" : ""}):`,
    ...outline.steps.map((s, i) => `${i + 1}. ${s.label}: ${s.hint}${notes[i]?.trim() ? `\n   My notes: ${notes[i].trim()}` : ""}`),
  ].join("\n");
}
