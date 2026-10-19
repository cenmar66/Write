import { loadAiSettings, requireOwner, streamText } from "@/lib/ai/server";
import { chatSystem } from "@/lib/ai/prompts";

export const maxDuration = 300;

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;

  const body = (await request.json()) as { title?: string; document?: string; messages?: ChatTurn[]; documentId?: string };
  const messages = (body.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content,
  );
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const { model, voice } = await loadAiSettings(auth.supabase, { documentId: body.documentId });
  return streamText({
    model,
    system: chatSystem({ title: body.title ?? "", document: body.document ?? "", voice }),
    messages,
    effort: "medium",
    maxTokens: 16000,
  });
}
