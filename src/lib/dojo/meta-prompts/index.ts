// Every meta-prompt PromptDojo uses, in one place, each with an id and version that are
// stored alongside the results they produce. To improve one: edit it here, bump its
// version, and run `npm test` (tests/dojo/meta-prompts.test.ts checks the invariants)
// plus the prompt-quality evaluation cases in tests/dojo/eval-cases.ts.
import type { ProfileInput } from "../profiles";
import type { TargetSpec } from "../targets";
import { targetName } from "../targets";
import { block, DATA_RULE } from "../untrusted";
import { contextBlocks, CRAFT, type MetaPrompt, type RequestOptions } from "./shared";

export type { MetaPrompt, RequestOptions };

type Base = { target: TargetSpec; profile?: Partial<ProfileInput> | null; options?: RequestOptions };
export type QA = { question: string; answer: string };

// ---- Clarify --------------------------------------------------------------------------
export const clarifyPrompt: MetaPrompt<Base & { request: string }> = {
  id: "clarify",
  version: "clarify.v1",
  system: `${CRAFT}

Your job right now: decide whether the request is missing information that is genuinely necessary to write a good prompt — information that would substantially change the prompt and that cannot be handled with a placeholder or a sensible, labelled assumption.

- Most requests do NOT need clarification. If a reasonable prompt can be written with placeholders and labelled assumptions, set needs_clarification to false and return no questions.
- Ask at most three short, specific questions, the most important first. Never ask for information already given.
- Each question gets 2-4 short suggested answers the person could tap.
- Use ids q1, q2, q3.`,
  user: (i) => `${contextBlocks(i)}\n\n${block("request", i.request, 8000)}\n\nDecide whether to ask clarifying questions.`,
};

// ---- Generate -------------------------------------------------------------------------
export const generatePrompt: MetaPrompt<Base & { request: string; answers?: QA[] }> = {
  id: "generate",
  version: "generate.v1",
  system: `${CRAFT}

Your job: turn the person's request into a complete prompt package.

Steps:
1. Analyse the request. Fill each analysis field with what you can infer; use an empty string or empty list when nothing is known. known_facts holds only things the person actually stated (or answered).
2. List every assumption you made in "assumptions" (field, the assumption, how it would change the result if wrong).
3. List information still missing that could change the result in "missing_context", as questions the person could answer later.
4. Write the RECOMMENDED prompt: polished, complete and ready to paste into the target model. Follow the target guidance for structure. Use {{placeholders}} for unknown specifics. Put "sections_used" as the section names you included.
5. Write exactly three ALTERNATIVES, each meaningfully different — not rewordings:
   - kind "concise": the shortest prompt that still gets a good result; for quick use.
   - kind "comprehensive": more context, precision, step-by-step instructions and quality checks.
   - kind "creative": a different angle, method or framing of the problem (e.g. a different strategy, persona, process or deliverable) that could produce a better result for some users.
   Give each a short title and a one-sentence "approach" explaining how it differs.
6. Explain the recommended prompt in plain English: a short summary and the techniques it uses (role definition, structured context, output format, constraints, examples, validation, etc.) with why each helps THIS task. No hype, no claims of guaranteed performance.
7. Suggest 3-5 next steps: refinements (kind "refinement", with an instruction that could be applied to the prompt) or follow-up prompts (kind "follow_up").
8. List every {{placeholder}} used across all prompts in "variables" with a short description.

Quality bar: a beginner should be able to paste the recommended prompt and get an excellent result; an expert should find nothing padded.`,
  user: (i) => {
    const answers = (i.answers ?? []).filter((a) => a.answer.trim());
    const ans = answers.length
      ? `\n\n${block("clarifying_answers", answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n"), 6000)}`
      : "";
    return `${contextBlocks(i)}\n\n${block("request", i.request, 8000)}${ans}\n\nCreate the prompt package for ${targetName(i.target)}.`;
  },
};

// ---- Refine ---------------------------------------------------------------------------
export const refinePrompt: MetaPrompt<Base & { prompt: string; instruction: string; originalRequest?: string }> = {
  id: "refine",
  version: "refine.v1",
  system: `${CRAFT}

Your job: revise an existing prompt according to one refinement instruction.

- Preserve the prompt's original intent, audience and deliverable unless the instruction explicitly asks to change direction. If it does, set intent_preserved to false and say what changed in intent_note; otherwise intent_preserved is true and intent_note briefly confirms what was kept.
- Keep {{placeholders}} unless the instruction supplies their values.
- Do not add invented facts. If the instruction asks for examples, make them clearly illustrative or use placeholders.
- Return the complete revised prompt (not a diff), a one-sentence change_summary, and the main changes with reasons.`,
  user: (i) =>
    `${contextBlocks(i)}\n\n${i.originalRequest ? `${block("original_request", i.originalRequest, 8000)}\n\n` : ""}${block("prompt", i.prompt, 30000)}\n\n${block("refinement_instruction", i.instruction, 2000)}\n\nRevise the prompt.`,
};

// ---- Analyze --------------------------------------------------------------------------
export const analyzePrompt: MetaPrompt<{ prompt: string; target: TargetSpec }> = {
  id: "analyze",
  version: "analyze.v1",
  system: `You are PromptDojo's prompt reviewer. You assess an existing prompt that a person pasted in, as a heuristic quality review — an informed opinion, not a measurement.

Score each dimension from 0 (absent/poor) to 10 (excellent) and give a one-sentence rationale grounded in the actual text:
- goal_clarity: is the objective unambiguous?
- context_completeness: does the AI get the background it needs?
- instruction_precision: are the steps and requirements specific?
- constraint_quality: are constraints useful, explained, non-contradictory, not padded?
- output_specificity: is the expected output format/length/structure clear?
- internal_consistency: do any parts conflict?
- reusability: could it be reused with different inputs (placeholders, separation of data and instructions)?

Then list strengths, weaknesses, missing information and concrete suggestions. Finally write revised_prompt: an improved version that keeps the author's intent, uses {{placeholders}} for unknown specifics instead of inventing them, and follows the target guidance below. List what you changed in revision_notes. Never claim the revision is proven to perform better; say what it is designed to improve.

Be calibrated: a short but perfectly adequate prompt for a simple task can score well. Don't inflate scores.

${DATA_RULE}`,
  user: (i) => `<dojo_target_guidance>\nIntended target: ${targetName(i.target)}\n</dojo_target_guidance>\n\n${block("prompt_under_review", i.prompt, 30000)}\n\nReview this prompt.`,
};

// ---- Adapt ----------------------------------------------------------------------------
export const adaptPrompt: MetaPrompt<{ prompt: string; from?: TargetSpec; to: TargetSpec }> = {
  id: "adapt",
  version: "adapt.v1",
  system: `${CRAFT}

Your job: adapt an existing prompt for a different target model. Keep the content, intent, placeholders and requirements identical; change only structure, markup and phrasing to fit the target guidance. List each adaptation and the reason. If the prompt already fits, make minimal changes and say so.`,
  user: (i) =>
    `${contextBlocks({ target: i.to })}\n\n${i.from ? `Currently written for: ${targetName(i.from)}\n\n` : ""}${block("prompt", i.prompt, 30000)}\n\nAdapt it for ${targetName(i.to)}.`,
};

// ---- Template -------------------------------------------------------------------------
export const templatePrompt: MetaPrompt<{ prompt: string }> = {
  id: "template",
  version: "template.v1",
  system: `${CRAFT}

Your job: turn a specific prompt into a reusable template.
- Replace the situation-specific details (names, products, audiences, numbers, topics, pasted material) with {{snake_case}} fields.
- Keep everything that is generally useful (structure, method, constraints, output requirements).
- For each field give a label, an example placeholder value, a one-line help text, and whether it is required.
- Every {{field}} in the body must appear in fields, and vice versa.
- Give the template a short title, a one-sentence description and a category (e.g. Business, Marketing, Writing, Research, Technology, Construction, Personal Development).`,
  user: (i) => `${block("prompt", i.prompt, 30000)}\n\nConvert this into a reusable template.`,
};

// ---- Compare --------------------------------------------------------------------------
export const comparePrompt: MetaPrompt<{ a: string; b: string; goal?: string }> = {
  id: "compare",
  version: "compare.v1",
  system: `You compare two prompts written for the same goal. Describe concretely how they differ (structure, context, constraints, output requirements, tone, length, risks of misinterpretation), the trade-offs, and when each would be the better choice. This is an informed opinion, not a test result: never claim one will perform better without testing. Suggest how to combine their strengths.

${DATA_RULE}`,
  user: (i) =>
    `${i.goal ? `${block("goal", i.goal, 4000)}\n\n` : ""}${block("prompt_a", i.a, 30000)}\n\n${block("prompt_b", i.b, 30000)}\n\nCompare prompt A and prompt B.`,
};

// ---- Judge (testing lab) --------------------------------------------------------------
export const judgePrompt: MetaPrompt<{ prompt: string; output: string; criteria: { name: string; description: string }[]; reference?: string }> = {
  id: "judge",
  version: "judge.v1",
  system: `You give a subjective first-pass rating of an AI response against the person's criteria, on a 1-5 scale per criterion, with a one-sentence rationale each. You are an AI giving an opinion: you cannot verify facts beyond the reference material supplied. For any accuracy criterion, judge only consistency with the supplied reference material; if none is supplied, say accuracy can't be assessed and give 3. Keep the overall note short and mention that a human should review.

${DATA_RULE}`,
  user: (i) =>
    `${block("criteria", i.criteria.map((c) => `- ${c.name}: ${c.description}`).join("\n"), 4000)}\n\n${block("prompt", i.prompt, 30000)}\n\n${i.reference ? `${block("reference_material", i.reference, 30000)}\n\n` : ""}${block("response", i.output, 40000)}\n\nRate the response against each criterion, in the order given.`,
};

export const META_PROMPTS = [clarifyPrompt, generatePrompt, refinePrompt, analyzePrompt, adaptPrompt, templatePrompt, comparePrompt, judgePrompt];

/** A short fingerprint of all meta-prompt versions, saved with each generation. */
export function metaVersions(): Record<string, string> {
  return Object.fromEntries(META_PROMPTS.map((m) => [m.id, m.version]));
}
