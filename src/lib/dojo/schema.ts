// Versioned, validated shapes for everything PromptDojo asks an AI service to return.
// Each schema is the single source of truth: the JSON schema sent to the provider is
// derived from it (see toProviderSchema), and every response is parsed with it before
// anything reaches the browser or the database.
import { z } from "zod";

export const SCHEMA_VERSIONS = {
  clarify: "dojo.clarify.v1",
  generation: "dojo.generation.v1",
  refinement: "dojo.refinement.v1",
  analysis: "dojo.analysis.v1",
  adaptation: "dojo.adaptation.v1",
  template: "dojo.template.v1",
  comparison: "dojo.comparison.v1",
  judge: "dojo.judge.v1",
} as const;

export const TARGET_IDS = ["claude", "chatgpt", "gemini", "universal", "custom"] as const;
export const TargetId = z.enum(TARGET_IDS);
export type TargetId = z.infer<typeof TargetId>;

const text = z.string();
const list = z.array(z.string());

// ---- Clarification ------------------------------------------------------------------
export const ClarifyResult = z.object({
  needs_clarification: z.boolean(),
  reason: text,
  questions: z
    .array(
      z.object({
        id: text,
        question: text,
        why_it_matters: text,
        suggested_answers: list,
      }),
    )
    .transform((qs) => qs.slice(0, 3)),
});
export type ClarifyResult = z.infer<typeof ClarifyResult>;

// ---- Generation ----------------------------------------------------------------------
export const ALTERNATIVE_KINDS = ["concise", "comprehensive", "creative"] as const;

export const Analysis = z.object({
  objective: text,
  user_role: text,
  task: text,
  desired_outcome: text,
  audience: text,
  industry: text,
  expertise: text,
  context: text,
  constraints: list,
  tone: text,
  output_format: text,
  success_criteria: list,
  known_facts: list,
});
export type Analysis = z.infer<typeof Analysis>;

export const Assumption = z.object({ field: text, assumption: text, impact: text });
export const MissingItem = z.object({ field: text, question: text, why_it_matters: text });
export const Variable = z.object({ name: text, description: text });

export const Alternative = z.object({
  kind: z.enum(ALTERNATIVE_KINDS),
  title: text,
  approach: text,
  prompt: text,
});
export type Alternative = z.infer<typeof Alternative>;

export const GenerationResult = z
  .object({
    analysis: Analysis,
    assumptions: z.array(Assumption),
    missing_context: z.array(MissingItem),
    recommended: z.object({ title: text, prompt: text, sections_used: list }),
    alternatives: z.array(Alternative),
    explanation: z.object({
      summary: text,
      techniques: z.array(z.object({ technique: text, why: text })),
    }),
    next_steps: z.array(z.object({ label: text, kind: z.enum(["refinement", "follow_up"]), instruction: text })),
    variables: z.array(Variable),
  })
  .superRefine((r, ctx) => {
    if (!r.recommended.prompt.trim()) ctx.addIssue({ code: "custom", message: "recommended.prompt is empty", path: ["recommended", "prompt"] });
    const kinds = r.alternatives.map((a) => a.kind).sort().join(",");
    if (kinds !== [...ALTERNATIVE_KINDS].sort().join(",")) {
      ctx.addIssue({ code: "custom", message: "alternatives must be exactly one concise, one comprehensive, one creative", path: ["alternatives"] });
    }
    r.alternatives.forEach((a, i) => {
      if (!a.prompt.trim()) ctx.addIssue({ code: "custom", message: "alternative prompt is empty", path: ["alternatives", i, "prompt"] });
    });
  });
export type GenerationResult = z.infer<typeof GenerationResult>;

// ---- Refinement ----------------------------------------------------------------------
export const RefinementResult = z.object({
  prompt: text,
  change_summary: text,
  changes: z.array(z.object({ what: text, why: text })),
  intent_preserved: z.boolean(),
  intent_note: text,
});
export type RefinementResult = z.infer<typeof RefinementResult>;

// ---- Analysis (quality analyzer) -----------------------------------------------------
export const DIMENSIONS = [
  "goal_clarity",
  "context_completeness",
  "instruction_precision",
  "constraint_quality",
  "output_specificity",
  "internal_consistency",
  "reusability",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

const DimensionScore = z.object({
  // Providers can't enforce numeric ranges in JSON schema, so clamp here.
  score: z.number().transform((n) => Math.max(0, Math.min(10, Math.round(n)))),
  rationale: text,
});

export const AnalysisResult = z.object({
  scores: z.object(Object.fromEntries(DIMENSIONS.map((d) => [d, DimensionScore])) as Record<Dimension, typeof DimensionScore>),
  strengths: list,
  weaknesses: list,
  missing_information: list,
  suggestions: list,
  revised_prompt: text,
  revision_notes: list,
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;

// ---- Model adaptation ----------------------------------------------------------------
export const AdaptationResult = z.object({
  prompt: text,
  adaptations: z.array(z.object({ change: text, reason: text })),
});
export type AdaptationResult = z.infer<typeof AdaptationResult>;

// ---- Template creation ---------------------------------------------------------------
export const TemplateField = z.object({
  key: text,
  label: text,
  placeholder: text,
  help: text,
  required: z.boolean(),
});
export const TemplateResult = z.object({
  title: text,
  description: text,
  category: text,
  body: text,
  fields: z.array(TemplateField),
});
export type TemplateResult = z.infer<typeof TemplateResult>;

// ---- Prompt comparison ---------------------------------------------------------------
export const ComparisonResult = z.object({
  summary: text,
  differences: z.array(z.object({ aspect: text, prompt_a: text, prompt_b: text, assessment: text })),
  tradeoffs: list,
  suggestion: text,
});
export type ComparisonResult = z.infer<typeof ComparisonResult>;

// ---- Test-lab judge (subjective, never ground truth) ---------------------------------
export const JudgeResult = z.object({
  criteria: z.array(
    z.object({
      name: text,
      score: z.number().transform((n) => Math.max(1, Math.min(5, Math.round(n)))),
      rationale: text,
    }),
  ),
  overall_note: text,
});
export type JudgeResult = z.infer<typeof JudgeResult>;

// ---- Provider JSON schema ------------------------------------------------------------
const UNSUPPORTED = new Set(["$schema", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "pattern", "format", "default"]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = clean(v);
  }
  if (out.type === "object") {
    out.additionalProperties = false;
    out.required = Object.keys((out.properties as Record<string, unknown>) ?? {});
  }
  return out;
}

/**
 * JSON schema for structured output. Strips keywords that providers' structured-output
 * modes reject (lengths, ranges, patterns) — those rules are enforced by the Zod parse
 * after the response arrives — and marks every object closed with all fields required.
 */
export function toProviderSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })) as Record<string, unknown>;
}
