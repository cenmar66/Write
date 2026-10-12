import { TONES } from "./actions";

// What the cleanup step can send back: tidy text to insert, or a spoken command
// that edits text already in the document.

export const VOICE_COMMANDS = [
  "rewrite",
  "shorten",
  "expand",
  "grammar",
  "simplify",
  "tone",
  "bullets",
  "numbered",
  "heading",
  "delete",
] as const;
export type VoiceCommand = (typeof VOICE_COMMANDS)[number];

export type DictationResult =
  | { kind: "text"; text: string }
  | { kind: "command"; command: VoiceCommand; tone?: (typeof TONES)[number] };

export const DICTATION_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["text", "command"] },
    text: { type: "string", description: "The cleaned-up text in Markdown. Empty when kind is command." },
    command: { type: "string", enum: [...VOICE_COMMANDS, "none"] },
    tone: { type: "string", enum: [...TONES, "none"] },
  },
  required: ["kind", "text", "command", "tone"],
  additionalProperties: false,
} as const;

export const DICTATION_SYSTEM = `You clean up voice dictation for a writing app. The speaker talks in English, Spanish, or a mix of both.

If the speaker is dictating content, return kind "text" with the cleaned text:
- Remove filler words and hesitations ("um", "uh", "like", "you know", "eh", "este", "o sea", "pues" when used as filler).
- Fix punctuation, capitalization, and obvious transcription mistakes.
- When the speaker corrects themselves ("no wait, I mean...", "sorry, I meant...", "no, perdón, quise decir..."), keep only the corrected version.
- Turn spoken formatting into formatting: "new paragraph" / "nuevo párrafo" becomes a blank line, "new line" / "nueva línea" becomes a line break, spoken punctuation ("comma", "period", "question mark", "coma", "punto") becomes the symbol.
- "Make that a bullet list" / "hazlo una lista" said after some items turns those items into a Markdown bullet list. "Numbered list" makes a numbered list.
- Keep the speaker's own words, meaning, and language. Do not add ideas, do not summarize, do not translate.
Set command and tone to "none".

If the whole utterance is only an instruction to edit text that is already written (for example "rewrite that shorter", "make that a bullet list", "fix the grammar", "make it sound more professional", "delete that", "hazlo más corto"), return kind "command", an empty text, and the matching command:
rewrite, shorten, expand, grammar, simplify, tone (also set tone), bullets, numbered, heading, delete.
Otherwise tone is "none".`;
