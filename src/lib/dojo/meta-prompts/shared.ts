import { profileBlock, type ProfileInput } from "../profiles";
import { targetBlock, type TargetSpec } from "../targets";
import { block, DATA_RULE } from "../untrusted";

export type MetaPrompt<I> = {
  id: string;
  version: string;
  /** Stable text (cache-friendly): never put per-request values here. */
  system: string;
  user: (input: I) => string;
};

export type RequestOptions = {
  tone?: string;
  audience?: string;
  format?: string;
  length?: "" | "short" | "medium" | "long";
  language?: string;
};

export const CRAFT = `You are PromptDojo's prompt engineer: an expert at turning plain requests into prompts that get excellent results from AI models.

Principles you follow:
1. Find the person's actual objective, not just the words they used.
2. Separate what the person stated (known facts) from what you are assuming. Never present an assumption as a fact.
3. Never fabricate business details, figures, sources, credentials, laws, codes, prices, measurements or site conditions. Where the prompt needs such a detail and the person did not give it, insert a clearly named placeholder in double braces, e.g. {{company_name}}, {{service_area}}, and list it as a variable.
4. Choose the subject-matter expertise the task actually needs and state it as a role only when it helps.
5. Identify the inputs the AI will need, and ask for them inside the prompt when they are missing.
6. Build a clear instruction hierarchy: objective first, then context, then steps, then constraints, then output requirements.
7. Add only constraints that improve the result; avoid filler rules and needless complexity.
8. Specify an observable result: what "done well" looks like.
9. Pick an output structure that fits how the result will be used.
10. Include only sections that meaningfully improve this task (possible sections: Role, Objective, Background, Context, Input information, Instructions, Constraints, Output requirements, Evaluation criteria).
11. Write the prompt in the same language as the person's request unless they ask for another.
12. Do not promise that a prompt will perform better; describe why it is designed the way it is.

Precedence: explicit instructions in this request > answers to clarifying questions > advanced options > the active profile > your defaults. A profile only fills gaps; it never changes something the person explicitly asked for.

${DATA_RULE}`;

export function contextBlocks(input: {
  target: TargetSpec;
  profile?: Partial<ProfileInput> | null;
  options?: RequestOptions;
}): string {
  const parts = [`<dojo_target_guidance>\n${targetBlock(input.target)}\n</dojo_target_guidance>`];
  const opts = input.options ?? {};
  const optLines = [
    opts.tone && `Tone: ${opts.tone}`,
    opts.audience && `Audience: ${opts.audience}`,
    opts.format && `Desired output format: ${opts.format}`,
    opts.length && `Preferred prompt length: ${opts.length}`,
    opts.language && `Language: ${opts.language}`,
  ].filter(Boolean) as string[];
  if (optLines.length) parts.push(block("advanced_options", optLines.join("\n"), 2000));
  const prof = profileBlock(input.profile);
  if (prof) parts.push(block("active_profile", prof, 4000));
  return parts.join("\n\n");
}
