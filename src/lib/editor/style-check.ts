// Plain-language style notes, inspired by iA Writer's Style Check.
// Runs in the browser with no AI: it only points things out, you decide what to cut.

export type StyleKind = "filler" | "cliche" | "redundancy" | "ai";
export type StyleIssue = { from: number; to: number; kind: StyleKind; text: string; note: string };

export const STYLE_KINDS: Record<StyleKind, { label: string; note: string }> = {
  filler: { label: "Filler", note: "Filler word. Cut it and see if the sentence gets stronger." },
  cliche: { label: "Cliché", note: "Cliché. Say it in your own words." },
  redundancy: { label: "Redundant", note: "Redundant. One of these words already says it." },
  ai: { label: "Sounds like AI", note: "Sounds machine-written. Try a plainer phrase." },
};

const FILLERS = [
  "very", "really", "just", "actually", "basically", "literally", "totally", "definitely",
  "certainly", "simply", "quite", "rather", "somewhat", "extremely", "incredibly", "truly",
  "honestly", "obviously", "clearly", "essentially", "virtually", "kind of", "sort of",
  "a little bit", "in order to", "the fact that", "needless to say", "at the end of the day",
  "for all intents and purposes", "it goes without saying",
];

const CLICHES = [
  "think outside the box", "low-hanging fruit", "move the needle", "at this point in time",
  "best of both worlds", "in the nick of time", "the elephant in the room", "few and far between",
  "last but not least", "only time will tell", "avoid it like the plague", "a perfect storm",
  "hit the ground running", "push the envelope", "circle back", "touch base", "paradigm shift",
  "win-win", "game changer", "game-changer", "the new normal", "it is what it is", "back to square one",
  "tip of the iceberg", "when all is said and done", "level the playing field", "on the same page",
  "raise the bar", "take it to the next level", "a no-brainer", "the bottom line",
];

const REDUNDANCIES = [
  "absolutely essential", "added bonus", "advance planning", "ask the question", "basic fundamentals",
  "close proximity", "completely finished", "completely eliminate", "each and every", "end result",
  "final outcome", "free gift", "future plans", "join together", "past history", "plan ahead",
  "repeat again", "revert back", "true fact", "unexpected surprise", "new innovation", "still remains",
  "first and foremost", "various different", "collaborate together", "brief summary", "past experience",
  "combine together", "exact same", "general consensus", "postpone until later", "sum total",
];

const AI_ISMS = [
  "delve", "delves", "delving", "tapestry", "testament to", "in today's fast-paced world",
  "in today’s fast-paced world", "it's important to note", "it’s important to note", "it's worth noting",
  "it’s worth noting", "navigate the complexities", "navigating the complexities", "in the realm of",
  "unlock the power", "unleash the power", "embark on a journey", "a journey of", "ever-evolving",
  "ever-changing landscape", "the landscape of", "seamlessly", "elevate your", "harness the power",
  "a myriad of", "plethora", "in conclusion", "furthermore", "moreover", "robust", "pivotal",
  "foster", "fostering", "underscore", "underscores", "resonate with",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['’]/g, "['’]");

const RULES: { kind: StyleKind; re: RegExp }[] = (
  [
    ["redundancy", REDUNDANCIES],
    ["cliche", CLICHES],
    ["ai", AI_ISMS],
    ["filler", FILLERS],
  ] as const
).map(([kind, list]) => ({
  kind,
  // Longest phrases first, so "kind of" wins over shorter overlaps.
  re: new RegExp(`(?<![\\p{L}\\p{N}'’-])(?:${[...list].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\p{L}\\p{N}'’-])`, "giu"),
}));

/** Every style note in a piece of text, without overlaps. */
export function findStyleIssues(text: string): StyleIssue[] {
  const found: StyleIssue[] = [];
  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const from = m.index;
      const to = from + m[0].length;
      if (found.some((f) => from < f.to && to > f.from)) continue;
      found.push({ from, to, kind, text: m[0], note: STYLE_KINDS[kind].note });
    }
  }
  return found.sort((a, b) => a.from - b.from);
}

/** The sentence around a cursor offset, as [start, end] in the text. */
export function sentenceRange(text: string, offset: number): [number, number] {
  const re = /[.!?…]+["'”’)\]]*(?:\s+|$)|\n/g;
  let start = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    if (end > offset) return [start, m.index + m[0].trimEnd().length];
    start = end;
  }
  return [start, text.length];
}
