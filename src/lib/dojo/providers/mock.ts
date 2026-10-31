// TEST-ONLY provider. Returns deterministic, schema-valid answers so automated tests can
// exercise the whole app without an API key. Every piece of text it produces is marked
// "[MOCK]" and the UI labels it as a test provider. It is impossible to enable in a
// production build (see providers/index.ts).
//
// Test hooks inside the user's text:
//   __MOCK_FAIL__     -> throws a retryable provider error
//   __MOCK_BADJSON__  -> returns invalid JSON (exercises the repair retry, then failure)
//   __MOCK_CLARIFY__  -> clarify step asks two questions
import { ProviderError, type CompletionRequest, type DojoProvider } from "./types";

function between(user: string, tag: string): string {
  const m = user.match(new RegExp(`<dojo_${tag}>\\n([\\s\\S]*?)\\n</dojo_${tag}>`));
  return m?.[1] ?? "";
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

function targetLabel(user: string) {
  return user.match(/Target model: ([^(\n]+)/)?.[1]?.trim() ?? "Universal";
}

function answer(req: CompletionRequest): unknown {
  const u = req.user;
  const request = between(u, "request");
  const prompt = between(u, "prompt") || between(u, "prompt_under_review");
  switch (req.task) {
    case "clarify":
      return u.includes("__MOCK_CLARIFY__")
        ? {
            needs_clarification: true,
            reason: "[MOCK] Audience and goal are unclear.",
            questions: [
              { id: "q1", question: "[MOCK] Who is the audience?", why_it_matters: "Changes tone and content.", suggested_answers: ["Homeowners", "Businesses"] },
              { id: "q2", question: "[MOCK] What is the main goal?", why_it_matters: "Sets the success criteria.", suggested_answers: ["More leads", "Brand awareness"] },
            ],
          }
        : { needs_clarification: false, reason: "[MOCK] Enough to proceed.", questions: [] };
    case "generate": {
      const t = targetLabel(u);
      const xml = t === "Claude";
      const body = xml
        ? `<role>[MOCK] Expert for: ${short(request)}</role>\n<objective>${request}</objective>\n<instructions>Work step by step for {{audience}}.</instructions>`
        : `## Role\n[MOCK] Expert for: ${short(request)}\n\n## Objective\n${request}\n\n## Instructions\nWork step by step for {{audience}}.`;
      return {
        analysis: { objective: `[MOCK] ${short(request)}`, user_role: "", task: request, desired_outcome: "", audience: "", industry: "", expertise: "", context: "", constraints: [], tone: "", output_format: "", success_criteria: [], known_facts: [request] },
        assumptions: [{ field: "audience", assumption: "[MOCK] General audience", impact: "Tone may not fit." }],
        missing_context: [{ field: "audience", question: "[MOCK] Who exactly is this for?", why_it_matters: "Changes the message." }],
        recommended: { title: `[MOCK] Prompt for ${t}`, prompt: `[MOCK OUTPUT — test provider, not real AI]\n${body}`, sections_used: ["Role", "Objective", "Instructions"] },
        alternatives: [
          { kind: "concise", title: "[MOCK] Concise", approach: "Shorter.", prompt: `[MOCK] Concise: ${request}` },
          { kind: "comprehensive", title: "[MOCK] Comprehensive", approach: "Deeper.", prompt: `[MOCK] Comprehensive: ${request}\nInclude context, steps and checks.` },
          { kind: "creative", title: "[MOCK] Creative", approach: "Different angle.", prompt: `[MOCK] Creative: approach "${short(request, 40)}" from the customer's point of view.` },
        ],
        explanation: { summary: "[MOCK] Uses a role, objective and steps.", techniques: [{ technique: "Role definition", why: "[MOCK] Sets expertise." }] },
        next_steps: [{ label: "Add examples", kind: "refinement", instruction: "Add one short example." }],
        variables: [{ name: "audience", description: "[MOCK] Who it's for" }],
      };
    }
    case "refine": {
      const instruction = between(u, "refinement_instruction");
      return { prompt: `${prompt}\n\n[MOCK refined: ${short(instruction, 60)}]`, change_summary: `[MOCK] Applied: ${short(instruction, 60)}`, changes: [{ what: "[MOCK] Appended a note", why: "Test provider" }], intent_preserved: true, intent_note: "[MOCK] Intent kept." };
    }
    case "analyze": {
      const n = prompt.length > 200 ? 7 : prompt.length > 60 ? 5 : 2;
      const s = { score: n, rationale: "[MOCK] Heuristic test score." };
      return {
        scores: { goal_clarity: s, context_completeness: s, instruction_precision: s, constraint_quality: s, output_specificity: s, internal_consistency: s, reusability: s },
        strengths: ["[MOCK] Has a goal"],
        weaknesses: ["[MOCK] Lacks output format"],
        missing_information: ["[MOCK] Audience"],
        suggestions: ["[MOCK] Specify the format"],
        revised_prompt: `${prompt}\n\n## Output format\n[MOCK] A bulleted list.`,
        revision_notes: ["[MOCK] Added an output format section"],
      };
    }
    case "adapt":
      return { prompt: `${prompt}\n\n[MOCK adapted for ${targetLabel(u)}]`, adaptations: [{ change: "[MOCK] Marked adaptation", reason: "Test provider" }] };
    case "template":
      return { title: "[MOCK] Template", description: "[MOCK] Reusable version", category: "Business", body: `${prompt}\n\nTopic: {{topic}}`, fields: [{ key: "topic", label: "Topic", placeholder: "e.g. roofing", help: "What it's about", required: true }] };
    case "compare":
      return { summary: "[MOCK] B is longer.", differences: [{ aspect: "Length", prompt_a: "Shorter", prompt_b: "Longer", assessment: "[MOCK]" }], tradeoffs: ["[MOCK] Detail vs speed"], suggestion: "[MOCK] Combine them." };
    case "judge": {
      const names = [...between(u, "criteria").matchAll(/^- ([^:]+):/gm)].map((m) => m[1]);
      return { criteria: names.map((name) => ({ name, score: 3, rationale: "[MOCK] Test rating." })), overall_note: "[MOCK] A human should review." };
    }
    default:
      return null;
  }
}

export const mockDojo: DojoProvider = {
  id: "mock",
  label: "Mock (test only)",
  isMock: true,
  configured: () => true,
  models: () => [{ id: "mock-1", label: "Mock model (test only)" }],
  async complete(req) {
    if (req.user.includes("__MOCK_FAIL__")) throw new ProviderError("Mock provider failure (test).", 503, true);
    if (req.user.includes("__MOCK_BADJSON__")) return { text: "{not json", model: "mock-1", stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 2 } };
    const usage = { inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: 120 };
    if (!req.json) {
      return { text: `[MOCK OUTPUT — test provider, not real AI]\nResponse to: ${short(req.user.replace(/\s+/g, " "), 160)}`, model: "mock-1", stopReason: "end_turn", usage };
    }
    return { text: JSON.stringify(answer(req)), model: "mock-1", stopReason: "end_turn", usage };
  },
  describeError: (e) => (e instanceof ProviderError ? e.message : "Mock provider error."),
};
