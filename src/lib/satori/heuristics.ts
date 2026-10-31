// Instant, offline "quick check" for a prompt. Pure text rules, no AI, nothing leaves the
// device. Deliberately simple and explainable; it complements (never replaces) the AI
// analysis, and like it, is a heuristic indicator rather than a measure of performance.
import type { Dimension } from "./schema";
import { extractVariables } from "./variables";

export type QuickFinding = { dimension: Dimension; ok: boolean; note: string };
export type QuickCheck = { scores: Record<Dimension, number>; composite: number; findings: QuickFinding[]; words: number };

const has = (re: RegExp, s: string) => re.test(s);

export function quickCheck(prompt: string): QuickCheck {
  const p = prompt.trim();
  const words = p ? p.split(/\s+/).length : 0;
  const findings: QuickFinding[] = [];
  const add = (dimension: Dimension, ok: boolean, note: string) => findings.push({ dimension, ok, note });

  // Goal clarity
  const verb = has(/\b(write|create|draft|generate|analy[sz]e|summari[sz]e|explain|review|plan|design|build|list|compare|evaluate|outline|rewrite|translate|identify|recommend|help)\b/i, p);
  const goalSection = has(/(^|\n)\s*(#+\s*)?(<objective>|objective|goal|task)\b/i, p);
  add("goal_clarity", verb, verb ? "States a clear action." : "No clear action verb (write, analyze, plan…) found.");
  if (goalSection) add("goal_clarity", true, "Has an explicit objective or task section.");

  // Context
  const context = has(/\b(context|background|about (me|us|my|our)|i am|we are|my (company|business|team)|audience|for (my|our))\b/i, p);
  add("context_completeness", context, context ? "Gives some background or audience." : "No background, audience or situation given.");

  // Instruction precision
  const steps = has(/(^|\n)\s*(\d+[.)]|[-*•])\s+\S/, p);
  add("instruction_precision", steps, steps ? "Uses numbered or bulleted instructions." : "Instructions aren't broken into steps or bullets.");

  // Constraints
  const constraints = has(/\b(must|should|avoid|don't|do not|never|only|at most|no more than|limit|under \d+|maximum|minimum|constraint)\b/i, p);
  add("constraint_quality", constraints, constraints ? "Includes constraints." : "No constraints (length, scope, things to avoid).");
  const because = has(/\b(because|so that|in order to|since|this helps)\b/i, p);
  if (constraints) add("constraint_quality", because, because ? "Explains why for at least one rule." : "Constraints don't explain why; reasons help the AI apply them sensibly.");

  // Output specificity
  const format = has(/\b(format|table|bullet|list|json|markdown|headings?|sections?|paragraphs?|words|characters|outline|email|output)\b/i, p);
  add("output_specificity", format, format ? "Says something about the output format." : "Doesn't describe the output format or length.");

  // Consistency: obvious contradictions.
  const contradictions =
    (has(/\b(brief|short|concise)\b/i, p) && has(/\b(detailed|comprehensive|in-depth|exhaustive)\b/i, p)) ||
    (has(/\bformal\b/i, p) && has(/\b(casual|informal|slang)\b/i, p));
  add("internal_consistency", !contradictions, contradictions ? "Possible conflict (e.g. 'brief' and 'detailed', or 'formal' and 'casual')." : "No obvious conflicting instructions.");

  // Reusability
  const vars = extractVariables(p);
  const separated = has(/<[a-z_]+>|"""|```|(^|\n)#+\s/i, p);
  add("reusability", vars.length > 0 || separated, vars.length ? `Has ${vars.length} reusable {{placeholder}}${vars.length > 1 ? "s" : ""}.` : separated ? "Separates sections with headings or tags." : "No placeholders or separated sections; harder to reuse.");

  if (words < 8) add("context_completeness", false, "Very short; the AI will have to guess most details.");

  const score = (d: Dimension) => {
    const fs = findings.filter((f) => f.dimension === d);
    if (!fs.length) return 5;
    const ok = fs.filter((f) => f.ok).length / fs.length;
    const base = Math.round(2 + ok * 7);
    return Math.max(0, Math.min(10, base + (d === "context_completeness" && words > 120 ? 1 : 0)));
  };
  const dims: Dimension[] = ["goal_clarity", "context_completeness", "instruction_precision", "constraint_quality", "output_specificity", "internal_consistency", "reusability"];
  const scores = Object.fromEntries(dims.map((d) => [d, p ? score(d) : 0])) as Record<Dimension, number>;
  const composite = p ? Math.round((dims.reduce((s, d) => s + scores[d], 0) / dims.length) * 10) : 0;
  return { scores, composite, findings, words };
}
