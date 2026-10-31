// One function per prompt-engineering service. Each takes a provider choice and plain
// inputs and returns a validated, versioned result. No HTTP, no database, no UI here.
import {
  adaptPrompt,
  analyzePrompt,
  clarifyPrompt,
  comparePrompt,
  generatePrompt,
  judgePrompt,
  refinePrompt,
  templatePrompt,
  type QA,
  type RequestOptions,
} from "../meta-prompts";
import type { ProfileInput } from "../profiles";
import type { ProviderChoice } from "../providers";
import {
  AdaptationResult,
  AnalysisResult,
  ClarifyResult,
  ComparisonResult,
  DIMENSIONS,
  GenerationResult,
  JudgeResult,
  RefinementResult,
  SCHEMA_VERSIONS,
  TemplateResult,
} from "../schema";
import type { TargetSpec } from "../targets";
import { extractVariables, fillVariables } from "../variables";
import { runStructured, runText } from "./run";

export { ServiceError, type ServiceResult, type UsageRecord } from "./run";

type Ctx = { target: TargetSpec; profile?: Partial<ProfileInput> | null; options?: RequestOptions };

export function clarify(choice: ProviderChoice, input: Ctx & { request: string }) {
  return runStructured({ choice, meta: clarifyPrompt, input, schema: ClarifyResult, schemaVersion: SCHEMA_VERSIONS.clarify, maxTokens: 4000, effort: "low" });
}

export function generate(choice: ProviderChoice, input: Ctx & { request: string; answers?: QA[] }) {
  return runStructured({ choice, meta: generatePrompt, input, schema: GenerationResult, schemaVersion: SCHEMA_VERSIONS.generation, maxTokens: 20000, effort: "medium" });
}

export function refine(choice: ProviderChoice, input: Ctx & { prompt: string; instruction: string; originalRequest?: string }) {
  return runStructured({ choice, meta: refinePrompt, input, schema: RefinementResult, schemaVersion: SCHEMA_VERSIONS.refinement, maxTokens: 12000, effort: "medium" });
}

/** Weighted composite, 0-100. A heuristic indicator, not a measure of performance. */
export const WEIGHTS: Record<(typeof DIMENSIONS)[number], number> = {
  goal_clarity: 1.5,
  context_completeness: 1.25,
  instruction_precision: 1.25,
  constraint_quality: 1,
  output_specificity: 1.25,
  internal_consistency: 1,
  reusability: 0.75,
};

export function compositeScore(scores: Record<(typeof DIMENSIONS)[number], { score: number }>): number {
  let total = 0;
  let weight = 0;
  for (const d of DIMENSIONS) {
    total += (scores[d]?.score ?? 0) * WEIGHTS[d];
    weight += WEIGHTS[d];
  }
  return Math.round((total / weight) * 10);
}

export async function analyze(choice: ProviderChoice, input: { prompt: string; target: TargetSpec }) {
  const res = await runStructured({ choice, meta: analyzePrompt, input, schema: AnalysisResult, schemaVersion: SCHEMA_VERSIONS.analysis, maxTokens: 14000, effort: "medium" });
  return { ...res, data: { ...res.data, composite: compositeScore(res.data.scores) } };
}

export function adapt(choice: ProviderChoice, input: { prompt: string; from?: TargetSpec; to: TargetSpec }) {
  return runStructured({ choice, meta: adaptPrompt, input, schema: AdaptationResult, schemaVersion: SCHEMA_VERSIONS.adaptation, maxTokens: 12000, effort: "medium" });
}

export async function toTemplate(choice: ProviderChoice, input: { prompt: string }) {
  const res = await runStructured({ choice, meta: templatePrompt, input, schema: TemplateResult, schemaVersion: SCHEMA_VERSIONS.template, maxTokens: 10000, effort: "low" });
  // Keep fields and body in sync even if the model missed one.
  const inBody = extractVariables(res.data.body);
  const known = new Set(res.data.fields.map((f) => f.key));
  const fields = [
    ...res.data.fields.filter((f) => inBody.includes(f.key)),
    ...inBody.filter((k) => !known.has(k)).map((k) => ({ key: k, label: k.replace(/_/g, " "), placeholder: "", help: "", required: true })),
  ];
  return { ...res, data: { ...res.data, fields } };
}

export function compare(choice: ProviderChoice, input: { a: string; b: string; goal?: string }) {
  return runStructured({ choice, meta: comparePrompt, input, schema: ComparisonResult, schemaVersion: SCHEMA_VERSIONS.comparison, maxTokens: 8000, effort: "low" });
}

export function judge(choice: ProviderChoice, input: { prompt: string; output: string; criteria: { name: string; description: string }[]; reference?: string }) {
  return runStructured({ choice, meta: judgePrompt, input, schema: JudgeResult, schemaVersion: SCHEMA_VERSIONS.judge, maxTokens: 6000, effort: "low" });
}

/** Testing Lab: run a prompt as-is (variables filled) against one provider. */
export function runPrompt(choice: ProviderChoice, input: { prompt: string; variables: Record<string, string> }) {
  const filled = fillVariables(input.prompt, input.variables);
  return runText({ choice, system: "", user: filled });
}
