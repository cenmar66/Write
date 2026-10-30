// Plain-language style notes, inspired by iA Writer's Style Check.
// Runs in the browser with no AI: it only points things out, you decide what to cut.

export type StyleKind = "filler" | "cliche" | "redundancy" | "ai";
export type SlopRule = "phrase" | "em-dash" | "not-x" | "fake-question" | "emoji-bullet";
export type StyleIssue = { from: number; to: number; kind: StyleKind; text: string; note: string; rule?: SlopRule };

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
  "a myriad of", "plethora", "seamless", "in conclusion", "furthermore", "moreover", "robust", "pivotal",
  "foster", "fostering", "underscore", "underscores", "resonate with",
  "here's the thing", "here’s the thing", "let's dive in", "let’s dive in", "dive into", "let that sink in",
  "picture this", "buckle up", "in a world where", "imagine a world", "read that again", "spoiler alert",
  "here's the kicker", "here’s the kicker", "make no mistake", "full stop", "unlock", "unleash", "realm",
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

// Sentence-shape tells that a word list can't catch.
const SLOP_PATTERNS: { rule: SlopRule; re: RegExp; note: string }[] = [
  {
    rule: "not-x",
    re: /\b\p{L}+(?:['’]s|\s+(?:is|are|was))\s+not\b[^.!?\n]{1,60}?[,;:—–]\s*(?:it|this|that|they|he|she)(?:['’]s|['’]re| is| are)\b|\b(?:isn|aren|wasn)['’]t\b[^.!?\n]{1,60}?[,;:—–]\s*(?:it|this|that|they|he|she)(?:['’]s|['’]re| is| are)\b/giu,
    note: "“It’s not X, it’s Y” is a classic AI move. Just say Y.",
  },
  {
    rule: "fake-question",
    re: /\b(?:the|and the|but the|so the)\s+(?:result|answer|catch|truth|kicker|twist|best part|secret|problem|reason|lesson|takeaway|outcome|difference|real question)\?/giu,
    note: "Fake-suspense question. State the point directly.",
  },
  { rule: "em-dash", re: /\s?—\s?/gu, note: "Em dashes are an AI tell. Try a period, comma, or colon." },
  { rule: "emoji-bullet", re: /^\s*(?:\p{Extended_Pictographic}\uFE0F?)+/gu, note: "Emoji as a bullet reads like AI. Use a plain list." },
];

/** Every style note in a piece of text, without overlaps. */
export function findStyleIssues(text: string): StyleIssue[] {
  const found: StyleIssue[] = [];
  for (const { rule, re, note } of SLOP_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[0].trim()) continue;
      const lead = m[0].length - m[0].trimStart().length;
      const from = m.index + lead;
      const to = m.index + m[0].trimEnd().length;
      if (found.some((f) => from < f.to && to > f.from)) continue;
      found.push({ from, to, kind: "ai", text: text.slice(from, to), note, rule });
    }
  }
  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const from = m.index;
      const to = from + m[0].length;
      if (found.some((f) => from < f.to && to > f.from)) continue;
      found.push({ from, to, kind, text: m[0], note: STYLE_KINDS[kind].note, ...(kind === "ai" ? { rule: "phrase" as const } : {}) });
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

// ---------- Slop check: a score for the whole piece ----------

export type SlopItem = { id: SlopRule | "cliche" | "threes" | "rhythm"; label: string; count: number; hint: string };
export type SlopReport = { words: number; score: number; level: "low" | "medium" | "high"; items: SlopItem[] };

const SLOP_LABELS: Record<SlopItem["id"], { label: string; hint: string; weight: number }> = {
  phrase: { label: "AI phrases", hint: "Words like “delve” or “here’s the thing”.", weight: 1 },
  "not-x": { label: "“It’s not X, it’s Y”", hint: "Just say what it is.", weight: 2 },
  "fake-question": { label: "Fake-suspense questions", hint: "“The result?” Say the result.", weight: 2 },
  "em-dash": { label: "Em dashes", hint: "Swap for periods, commas, or colons.", weight: 0.6 },
  "emoji-bullet": { label: "Emoji bullets", hint: "Use plain bullets.", weight: 1 },
  cliche: { label: "Clichés", hint: "Say it in your own words.", weight: 0.5 },
  threes: { label: "Lists of three", hint: "Use as many items as the point needs.", weight: 0.5 },
  rhythm: { label: "Same-length sentences", hint: "Mix short sentences with long ones.", weight: 2 },
};

/** How much a piece sounds machine-written. Plain text in, with one block per line. */
export function slopReport(text: string): SlopReport {
  const words = text.split(/\s+/).filter(Boolean).length;
  const counts = new Map<SlopItem["id"], number>();
  const add = (id: SlopItem["id"], n = 1) => counts.set(id, (counts.get(id) ?? 0) + n);

  for (const block of text.split("\n")) {
    for (const issue of findStyleIssues(block)) {
      if (issue.rule) add(issue.rule);
      else if (issue.kind === "cliche") add("cliche");
    }
  }
  const threes = text.match(/\b[\p{L}'’-]+,\s+[\p{L}'’-]+,?\s+(?:and|or|y|o)\s+[\p{L}'’-]+\b/giu)?.length ?? 0;
  if (threes) add("threes", threes);

  const lengths = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.split(/\s+/).filter(Boolean).length)
    .filter((n) => n > 2);
  if (lengths.length >= 6) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
    if (sd / mean < 0.3) add("rhythm");
  }

  let raw = 0;
  for (const [id, n] of counts) raw += n * SLOP_LABELS[id].weight * (id === "rhythm" ? 1 : 100 / Math.max(words, 100));
  const score = Math.round(raw * 10) / 10;
  const items = [...counts]
    .map(([id, count]) => ({ id, count, label: SLOP_LABELS[id].label, hint: SLOP_LABELS[id].hint }))
    .sort((a, b) => b.count * SLOP_LABELS[b.id].weight - a.count * SLOP_LABELS[a.id].weight);
  return { words, score, level: score < 1.5 ? "low" : score < 4 ? "medium" : "high", items };
}
