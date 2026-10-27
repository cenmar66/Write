import { PROVIDERS } from "@/lib/ai/providers";
import { loadAiSettings, requireOwner } from "@/lib/ai/server";

export const maxDuration = 120;

const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short pack name, 1-3 words, no word 'pack'." },
    emoji: { type: "string", description: "One emoji that fits the theme." },
    description: { type: "string", description: "One short sentence describing the pack." },
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          emoji: { type: "string" },
          title: { type: "string", description: "Catchy prompt title, 2-6 words, Title Case." },
          prompt: { type: "string", description: "The writing prompt itself: 1-2 sentences, addressed to the writer ('Share…', 'Explain…', 'List…')." },
          format: { type: "string", enum: ["atomic", "short", "linkedin", "thread"] },
        },
        required: ["emoji", "title", "prompt", "format"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "emoji", "description", "prompts"],
  additionalProperties: false,
} as const;

const SYSTEM = `You create packs of writing prompts for a business owner who posts on LinkedIn, X, Threads, Instagram, and Facebook.
A prompt is a question or instruction that sparks one post from the writer's own experience. It never contains the answer.
Make each prompt specific, varied, and easy to answer from real life: stories, lessons, lists, opinions, how-tos, predictions.
Mix the formats: "atomic" = a 250-word essay, "short" = a tweet-length post, "linkedin" = a LinkedIn post, "thread" = a 5-10 post thread.
Write in the same language as the theme (English or Spanish).`;

/** Generates a themed pack of writing prompts. */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const body = (await request.json()) as { theme?: string; audience?: string; count?: number };
  const theme = body.theme?.trim();
  if (!theme) return Response.json({ error: "Type a theme first." }, { status: 400 });
  const count = Math.min(Math.max(body.count ?? 8, 4), 12);

  const { model } = await loadAiSettings(auth.supabase, { styleId: "none" });
  const provider = PROVIDERS[model.provider];
  try {
    const pack = (await provider.generateJson(
      {
        model,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Theme: ${theme}\n${body.audience?.trim() ? `About me / my audience: ${body.audience.trim()}\n` : ""}Create a pack of exactly ${count} prompts.`,
          },
        ],
        effort: "low",
        maxTokens: 6000,
      },
      SCHEMA,
    )) as { name: string; emoji: string; description: string; prompts: { emoji: string; title: string; prompt: string; format: string }[] };
    return Response.json({ pack: { ...pack, prompts: pack.prompts.slice(0, count) } });
  } catch (error) {
    return Response.json({ error: provider.describeError(error) }, { status: 502 });
  }
}
