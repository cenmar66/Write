import { EDIT_ACTIONS, TONES, type EditAction, type Tone } from "@/lib/ai/actions";
import { requireOwner, streamText } from "@/lib/ai/claude";
import { editPrompt } from "@/lib/ai/prompts";

export const maxDuration = 120;

export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json()) as {
    action?: string;
    text?: string;
    document?: string;
    tone?: string;
  };
  const action = body.action as EditAction;
  if (!(action in EDIT_ACTIONS) || typeof body.text !== "string") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const tone = TONES.includes(body.tone as Tone) ? (body.tone as Tone) : undefined;

  const { system, user } = editPrompt({
    action,
    text: body.text,
    document: body.document ?? "",
    tone,
  });

  return streamText({
    system,
    messages: [{ role: "user", content: user }],
    effort: "low",
    maxTokens: 8000,
  });
}
