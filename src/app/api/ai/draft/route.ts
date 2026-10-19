import { draftSystem } from "@/lib/ai/prompts";
import { loadAiSettings, requireOwner, streamText } from "@/lib/ai/server";

export const maxDuration = 300;

const SOURCE_LIMIT = 200_000;

/** Streams a first draft (Markdown, title first) for a brief from the home screen. */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const body = (await request.json()) as { brief?: string; documentId?: string; styleId?: string; sources?: string };
  if (!body.brief?.trim()) return Response.json({ error: "Describe what you want to write." }, { status: 400 });

  const { model, voice } = await loadAiSettings(auth.supabase, { documentId: body.documentId, styleId: body.styleId });
  return streamText({
    model,
    system: draftSystem({ voice, sources: (body.sources ?? "").slice(0, SOURCE_LIMIT) }),
    messages: [{ role: "user", content: body.brief }],
    effort: "medium",
    maxTokens: 16000,
  });
}
