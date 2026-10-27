import { findModel } from "@/lib/ai/models";
import { PROVIDERS } from "@/lib/ai/providers";
import { requireOwner } from "@/lib/ai/server";
import { baseOutline, TARGET_WORDS } from "@/lib/social/outlines";
import type { PromptFormat } from "@/lib/social/prompts";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Short step name, 1-4 words (e.g. 'Hook', 'The problem', 'Your 3 tools')." },
          hint: { type: "string", description: "What to write in this step, specific to the prompt, one sentence. May include a fill-in-the-blank line with [brackets]." },
        },
        required: ["label", "hint"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
} as const;

/** Tailors a fill-in-the-blank outline to one writing prompt. Uses the fast model: it's a small job. */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const body = (await request.json()) as { title?: string; prompt?: string; format?: PromptFormat };
  const format: PromptFormat = body.format && body.format in TARGET_WORDS ? body.format : "linkedin";
  if (!body.prompt?.trim()) return Response.json({ error: "Missing prompt." }, { status: 400 });
  const base = baseOutline(body.title ?? "", body.prompt, format);

  const model = findModel("claude-haiku-5-5");
  const provider = PROVIDERS[model.provider];
  try {
    const out = (await provider.generateJson(
      {
        model,
        system: `You write fill-in-the-blank outlines for social posts. Given a writing prompt, return ${base.steps.length} steps (3-6 is fine) that build the post in order, starting with a hook and ending with a close. Make every hint specific to this prompt, short, and easy to answer from real experience. Never write the post itself. Same language as the prompt.`,
        messages: [
          {
            role: "user",
            content: `Prompt: ${body.title ? `${body.title}. ` : ""}${body.prompt}\nFormat: ${format} (about ${base.targetWords} words)\nA generic outline for this kind of post, to improve on:\n${base.steps.map((s, i) => `${i + 1}. ${s.label}: ${s.hint}`).join("\n")}`,
          },
        ],
        effort: "low",
        maxTokens: 1500,
      },
      SCHEMA,
    )) as { steps: { label: string; hint: string }[] };
    const steps = out.steps.filter((s) => s.label?.trim() && s.hint?.trim()).slice(0, 7);
    return Response.json({ outline: { ...base, steps: steps.length >= 2 ? steps : base.steps } });
  } catch (error) {
    // The base outline still works if the AI is unavailable.
    return Response.json({ outline: base, note: provider.describeError(error) });
  }
}
