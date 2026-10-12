import { requireOwner, streamText } from "@/lib/ai/claude";
import { chatSystem } from "@/lib/ai/prompts";

export const maxDuration = 300;

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json()) as { title?: string; document?: string; messages?: ChatTurn[] };
  const messages = (body.messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content,
  );
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  return streamText({
    system: chatSystem({ title: body.title ?? "", document: body.document ?? "" }),
    messages,
    effort: "medium",
    maxTokens: 16000,
  });
}
