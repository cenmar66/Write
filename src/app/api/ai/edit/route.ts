import { EDIT_ACTIONS, TONES, type EditAction, type Tone } from "@/lib/ai/actions";
import { loadAiSettings, requireOwner, streamText } from "@/lib/ai/server";
import { editPrompt } from "@/lib/ai/prompts";

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;

  const body = (await request.json()) as {
    action?: string;
    text?: string;
    document?: string;
    tone?: string;
    documentId?: string;
    styleId?: string;
  };
  const action = body.action as EditAction;
  if (!(action in EDIT_ACTIONS) || typeof body.text !== "string") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const tone = TONES.includes(body.tone as Tone) ? (body.tone as Tone) : undefined;

  const { model, voice } = await loadAiSettings(auth.supabase, { documentId: body.documentId, styleId: body.styleId });
  const { system, user } = editPrompt({
    action,
    text: body.text,
    document: body.document ?? "",
    tone,
    voice,
  });

  return streamText({
    model,
    system,
    messages: [{ role: "user", content: user }],
    effort: "low",
    maxTokens: 8000,
  });
}
