// Request bodies accepted by /api/dojo routes. Validated on the server; the inferred
// types are also used by the browser client.
import { z } from "zod";
import { LENGTHS } from "./profiles";
import { TargetId } from "./schema";
import { VERSION_KINDS } from "./store/types";

const s = (max: number) => z.string().max(max);
const id = z.string().min(1).max(64);

export const TargetInput = z.object({
  id: TargetId,
  customName: s(80).optional(),
  customNotes: s(1000).optional(),
});

export const OptionsInput = z
  .object({
    tone: s(200).optional(),
    audience: s(300).optional(),
    format: s(300).optional(),
    length: z.enum(LENGTHS).optional(),
    language: s(60).optional(),
  })
  .default({});

const ProviderPick = { provider: s(20).optional(), model: s(100).optional() };

export const GenerateBody = z.object({
  request: z.string().trim().min(1, "Describe what you'd like help with").max(8000, "Keep the request under 8,000 characters"),
  target: TargetInput,
  profileId: id.nullable().optional(),
  options: OptionsInput,
  answers: z.array(z.object({ question: s(500), answer: s(1000) })).max(3).default([]),
  skipClarify: z.boolean().default(false),
  ...ProviderPick,
});
export type GenerateBody = z.input<typeof GenerateBody>;

export const RefineBody = z.object({
  prompt: z.string().min(1).max(30000),
  instruction: z.string().trim().min(1, "Say how you'd like it improved").max(2000),
  action: s(40).optional(),
  originalRequest: s(8000).optional(),
  target: TargetInput,
  profileId: id.nullable().optional(),
  ...ProviderPick,
});
export type RefineBody = z.input<typeof RefineBody>;

export const AdaptBody = z.object({ prompt: z.string().min(1).max(30000), from: TargetInput.optional(), to: TargetInput, ...ProviderPick });
export const TemplateFromPromptBody = z.object({ prompt: z.string().min(1).max(30000), ...ProviderPick });
export const AnalyzeBody = z.object({ prompt: z.string().trim().min(1, "Paste a prompt to analyze").max(30000), target: TargetInput, save: z.boolean().default(true), ...ProviderPick });
export const CompareBody = z.object({ a: z.string().min(1).max(30000), b: z.string().min(1).max(30000), goal: s(4000).optional(), ...ProviderPick });

export const Criterion = z.object({ name: s(80).min(1), description: s(400) });
export const LabRunBody = z.object({
  prompt: z.string().min(1).max(30000),
  variables: z.record(z.string().max(64), z.string().max(20000)).default({}),
  targets: z.array(z.object({ provider: s(20), model: s(100) })).min(1).max(3),
});
export const JudgeBody = z.object({
  prompt: z.string().min(1).max(30000),
  output: z.string().min(1).max(60000),
  criteria: z.array(Criterion).min(1).max(8),
  reference: s(30000).optional(),
  ...ProviderPick,
});
export const SaveRunBody = z.object({
  prompt_id: id.nullable().default(null),
  version_id: id.nullable().default(null),
  prompt_text: z.string().max(30000),
  variables: z.record(z.string(), z.string().max(20000)).default({}),
  provider: s(20),
  model: s(100),
  is_mock: z.boolean().default(false),
  output: z.string().max(60000),
  input_tokens: z.number().int().nullable().default(null),
  output_tokens: z.number().int().nullable().default(null),
  cost_usd: z.number().nullable().default(null),
  latency_ms: z.number().int().nullable().default(null),
  ratings: z.array(z.object({ name: s(80), description: s(400), score: z.number().int().min(1).max(5).nullable(), note: s(1000) })).max(8).default([]),
  judge: z.unknown().default(null),
});

const VersionIn = z.object({ content: z.string().min(1).max(60000), kind: z.enum(VERSION_KINDS), instruction: s(4000).optional(), provider: s(20).nullable().optional(), model: s(100).nullable().optional() });

export const CreatePromptBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: s(2000).optional(),
  category: s(80).optional(),
  collection_id: id.nullable().optional(),
  target_model: TargetId,
  custom_target: s(80).optional(),
  source: z.enum(["generated", "alternative", "analyzer", "template", "import", "manual", "duplicate", "lab"]),
  generation_id: id.nullable().optional(),
  tags: z.array(s(40)).max(20).optional(),
  favorite: z.boolean().optional(),
  versions: z.array(VersionIn).min(1).max(100),
});

export const PatchPromptBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: s(2000).optional(),
  category: s(80).optional(),
  collection_id: id.nullable().optional(),
  target_model: TargetId.optional(),
  custom_target: s(80).optional(),
  favorite: z.boolean().optional(),
  tags: z.array(s(40)).max(20).optional(),
  archived: z.boolean().optional(),
  restore: z.boolean().optional(),
});

export const AddVersionBody = VersionIn.extend({ parent_version_id: id.nullable().optional() });

export const PreferencesBody = z.object({
  theme: z.enum(["system", "light", "dark"]).optional(),
  accent: z.enum(["teal", "indigo", "plum", "amber", "slate", "forest"]).optional(),
  text_size: z.enum(["sm", "md", "lg"]).optional(),
  default_target: TargetId.optional(),
  custom_target_name: s(80).optional(),
  custom_target_notes: s(1000).optional(),
  provider: s(20).optional(),
  model: s(100).optional(),
  active_profile_id: id.nullable().optional(),
  clarify: z.boolean().optional(),
  retention_days: z.number().int().min(0).max(3650).optional(),
});

export const TemplateBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: s(2000).default(""),
  category: s(80).default(""),
  body: z.string().min(1).max(60000),
  fields: z.array(z.object({ key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), label: s(120), placeholder: s(300), help: s(300), required: z.boolean() })).max(30),
});

export const NameBody = z.object({ name: z.string().trim().min(1).max(80) });
