import type { JSONContent } from "@tiptap/react";
import { requireOwner } from "@/lib/ai/server";
import { getAccount, markAccount, ReconnectError } from "@/lib/publish/accounts";
import { createSubstackDraft } from "@/lib/publish/substack";

export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { documentId, title, subtitle, description } = (await request.json()) as {
    documentId?: string;
    title?: string;
    subtitle?: string;
    description?: string;
  };
  const { data: doc } = await auth.supabase.from("documents").select("title,content").eq("id", documentId ?? "").maybeSingle();
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });

  const account = await getAccount(auth.supabase, "substack");
  if (!account?.token) return Response.json({ error: "Connect Substack in Settings first.", reconnect: true }, { status: 400 });
  try {
    const draft = await createSubstackDraft(account, {
      title: title?.trim() || doc.title || "Untitled",
      subtitle: subtitle?.trim() ?? "",
      description: description?.trim() ?? "",
      body: doc.content as JSONContent,
    });
    return Response.json(draft);
  } catch (error) {
    const reconnect = error instanceof ReconnectError;
    if (reconnect) await markAccount(auth.supabase, account, "expired", (error as Error).message);
    return Response.json({ error: (error as Error).message, reconnect }, { status: 502 });
  }
}
