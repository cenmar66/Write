// The voice profile: what makes your writing sound like you.
// Shared by the Voice page (editing) and the server (building and applying it).

export type VoiceProfile = {
  summary: string;
  tone: string[];
  sentences: string;
  vocabulary: string;
  formatting: string;
  languages: string;
  favorite_phrases: string[];
  words_to_avoid: string[];
  do: string[];
  dont: string[];
};

export const EMPTY_PROFILE: VoiceProfile = {
  summary: "",
  tone: [],
  sentences: "",
  vocabulary: "",
  formatting: "",
  languages: "",
  favorite_phrases: [],
  words_to_avoid: [],
  do: [],
  dont: [],
};

const list = (description: string) => ({ type: "array", items: { type: "string" }, description });
const text = (description: string) => ({ type: "string", description });

export const VOICE_SCHEMA = {
  type: "object",
  properties: {
    summary: text("Two or three sentences describing this writer's voice, written as instructions to someone imitating it."),
    tone: list("3 to 6 single words or short phrases for the tone, e.g. warm, direct, playful."),
    sentences: text("Typical sentence length and rhythm, with an approximate average word count."),
    vocabulary: text("Word choice: plain or fancy, jargon, slang, contractions, how they address the reader."),
    formatting: text("Paragraph length, use of lists, headings, emojis, exclamation marks, questions."),
    languages: text("Which languages they write in and how they mix them. Empty if only one."),
    favorite_phrases: list("Up to 12 phrases or expressions they actually repeat in the samples, quoted exactly."),
    words_to_avoid: list("Up to 15 words or phrases that would sound unlike them, including generic AI-sounding words they never use."),
    do: list("3 to 6 short habits to imitate."),
    dont: list("3 to 6 short things to avoid."),
  },
  required: ["summary", "tone", "sentences", "vocabulary", "formatting", "languages", "favorite_phrases", "words_to_avoid", "do", "dont"],
  additionalProperties: false,
} as const;

export const VOICE_BUILD_SYSTEM = `You are an expert editor who studies a writer's samples and captures their voice so other writing can match it.
Base every observation on the samples. Quote favorite phrases exactly as they appear. Do not invent habits that aren't there.
Write the profile in English, even if the samples are in Spanish, but quote phrases in their original language.`;

/** Keeps the newest samples that fit, so very large collections don't blow up the cost. */
export const VOICE_SAMPLE_CHAR_LIMIT = 300_000;

/** Turns the profile into instructions that get added to every AI request. */
export function formatVoice(profile: VoiceProfile | null | undefined): string {
  if (!profile || !profile.summary.trim()) return "";
  const lines = [
    "Write in the author's own voice, described below. Match it closely, but never at the expense of the task.",
    `Voice: ${profile.summary}`,
  ];
  if (profile.tone.length) lines.push(`Tone: ${profile.tone.join(", ")}.`);
  if (profile.sentences) lines.push(`Sentences: ${profile.sentences}`);
  if (profile.vocabulary) lines.push(`Word choice: ${profile.vocabulary}`);
  if (profile.formatting) lines.push(`Formatting: ${profile.formatting}`);
  if (profile.languages) lines.push(`Languages: ${profile.languages}`);
  if (profile.favorite_phrases.length) lines.push(`Phrases they like (use naturally, rarely, never forced): ${profile.favorite_phrases.map((p) => `"${p}"`).join(", ")}.`);
  if (profile.words_to_avoid.length) lines.push(`Never use these words or phrases: ${profile.words_to_avoid.map((p) => `"${p}"`).join(", ")}.`);
  if (profile.do.length) lines.push(`Do: ${profile.do.join("; ")}.`);
  if (profile.dont.length) lines.push(`Don't: ${profile.dont.join("; ")}.`);
  return `<author_voice>\n${lines.join("\n")}\n</author_voice>`;
}

/** Cleans up anything coming from the browser or the model into a valid profile. */
export function normalizeProfile(raw: unknown): VoiceProfile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 30) : [];
  return {
    summary: str(r.summary),
    tone: arr(r.tone),
    sentences: str(r.sentences),
    vocabulary: str(r.vocabulary),
    formatting: str(r.formatting),
    languages: str(r.languages),
    favorite_phrases: arr(r.favorite_phrases),
    words_to_avoid: arr(r.words_to_avoid),
    do: arr(r.do),
    dont: arr(r.dont),
  };
}
