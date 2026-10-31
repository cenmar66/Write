// Personalization profiles. A profile fills gaps; it never overrides what the person
// explicitly asked for in this request (meta-prompts state that precedence).
import { z } from "zod";
import { TargetId } from "./schema";
import { sanitize } from "./untrusted";

export const LENGTHS = ["", "short", "medium", "long"] as const;

export const ProfileInput = z.object({
  name: z.string().trim().min(1).max(60),
  tone: z.string().max(200).default(""),
  field: z.string().max(200).default(""),
  favorite_target: TargetId.or(z.literal("")).default(""),
  audience: z.string().max(300).default(""),
  response_format: z.string().max(300).default(""),
  language: z.string().max(60).default(""),
  prompt_length: z.enum(LENGTHS).default(""),
  custom_instructions: z.string().max(2000).default(""),
});
export type ProfileInput = z.infer<typeof ProfileInput>;
export type Profile = ProfileInput & { id: string; preset?: boolean };

/** Starter profiles offered in Settings (copied into the person's own list when used). */
export const PRESET_PROFILES: Profile[] = [
  { id: "preset-business", preset: true, name: "Professional Business", tone: "Clear, confident, plain-spoken", field: "Small and mid-size business", favorite_target: "", audience: "Customers and decision-makers", response_format: "Short sections with bullet points", language: "", prompt_length: "medium", custom_instructions: "" },
  { id: "preset-writer", preset: true, name: "Creative Writer", tone: "Warm, vivid, specific", field: "Writing and publishing", favorite_target: "", audience: "General readers", response_format: "Flowing prose", language: "", prompt_length: "medium", custom_instructions: "" },
  { id: "preset-research", preset: true, name: "Research Analyst", tone: "Precise, neutral, evidence-focused", field: "Research and analysis", favorite_target: "", audience: "Informed professionals", response_format: "Structured report with sources section", language: "", prompt_length: "long", custom_instructions: "Distinguish findings from interpretation. Flag uncertainty explicitly." },
  { id: "preset-dev", preset: true, name: "Technical Developer", tone: "Direct and technical", field: "Software engineering", favorite_target: "", audience: "Engineers", response_format: "Markdown with code blocks", language: "", prompt_length: "medium", custom_instructions: "" },
  { id: "preset-construction", preset: true, name: "Construction Specialist", tone: "Practical, professional, plain-spoken", field: "Construction and restoration contracting", favorite_target: "", audience: "Homeowners, adjusters and project stakeholders", response_format: "Organized sections and tables", language: "", prompt_length: "medium", custom_instructions: "Never invent code requirements, prices, measurements or site conditions; leave placeholders for them." },
];

/** Plain-text summary for meta-prompts, or "" when no profile is active. */
export function profileBlock(p: Partial<ProfileInput> | null | undefined): string {
  if (!p) return "";
  const rows: [string, string | undefined][] = [
    ["Profile name", p.name],
    ["Preferred tone", p.tone],
    ["Professional field", p.field],
    ["Typical audience", p.audience],
    ["Preferred response format", p.response_format],
    ["Default language", p.language],
    ["Preferred prompt length", p.prompt_length],
    ["Custom instructions", p.custom_instructions],
  ];
  const lines = rows.filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${sanitize(String(v), 2000)}`);
  return lines.length ? lines.join("\n") : "";
}
