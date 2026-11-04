// One-click refinements. Each is just a well-written instruction for the refine service;
// "adapt" and "template" are routed to their own services.
export type RefinementAction = { id: string; label: string; instruction: string; service?: "adapt" | "template" };

export const REFINEMENTS: RefinementAction[] = [
  { id: "shorter", label: "Make shorter", instruction: "Make the prompt substantially shorter and more efficient. Remove redundancy and low-value sections while keeping every requirement that matters for the result." },
  { id: "detailed", label: "More detailed", instruction: "Make the prompt more detailed: add useful context, clearer step-by-step instructions and more precise output requirements. Do not invent facts; use placeholders." },
  { id: "technical", label: "More technical", instruction: "Make the prompt more technical: use precise domain terminology, ask for technical depth and rigour in the output, and target an expert reader." },
  { id: "persuasive", label: "More persuasive", instruction: "Make the output the prompt asks for more persuasive: add guidance on benefits, objections, proof points (as placeholders, not invented claims) and a clear call to action." },
  { id: "creative", label: "More creative", instruction: "Make the prompt encourage more creative, original and surprising output while keeping the same goal and constraints." },
  { id: "simplify", label: "Simplify language", instruction: "Rewrite the prompt in simple, plain language that a beginner can read easily, and ask for plain-language output. Keep all requirements." },
  { id: "examples", label: "Add examples", instruction: "Add one or two short illustrative examples (clearly marked as examples, using placeholders where specifics are unknown) showing the desired output style or format." },
  { id: "constraints", label: "Add constraints", instruction: "Add useful constraints — length, scope, tone, things to avoid, format rules — each with a short reason. Don't add constraints that conflict with the goal." },
  { id: "reasoning", label: "Improve reasoning structure", instruction: "Improve the reasoning structure: break the task into ordered steps, ask the model to consider key factors before concluding, and to check its answer against the success criteria before finishing." },
  { id: "rubric", label: "Add evaluation rubric", instruction: "Add a short evaluation rubric (3-6 criteria) the model should use to check its own output before answering, and describe what an excellent answer looks like for each criterion." },
  { id: "adapt", label: "Adapt for another model", instruction: "", service: "adapt" },
  { id: "template", label: "Convert to template", instruction: "", service: "template" },
];

export function findRefinement(id: string): RefinementAction | undefined {
  return REFINEMENTS.find((r) => r.id === id);
}
