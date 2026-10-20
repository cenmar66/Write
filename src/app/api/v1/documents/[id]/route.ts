import { authenticate } from "@/lib/access-tokens";
import { docToMarkdown, markdownToDoc } from "@/lib/markdown-server";

type Ctx = { params: Promise<{ id: string }> };
const FIELDS = "id,title,content,content_text,word_count,folder_id,style_id,created_at,updated_at";
const notFound = () => Response.json({ error: "Document not found." }, { status: 404 });

export async function GET(request: Request, { params }: Ctx) {
  const auth = await authenticate(request, "read");
  if ("denied" in auth) return auth.denied;
  const { id } = await params;
  const { data: doc } = await auth.supabase
    .from("documents")
    .select(FIELDS)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return notFound();
  const { content, content_text, ...rest } = doc;
  return Response.json({ document: { ...rest, markdown: docToMarkdown(content, content_text) } });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await authenticate(request, "write");
  if ("denied" in auth) return auth.denied;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { title?: string; markdown?: string; append?: string };
  const { data: doc } = await auth.supabase
    .from("documents")
    .select(FIELDS)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc) return notFound();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") patch.title = body.title.slice(0, 300);
  let markdown: string | null = null;
  if (typeof body.markdown === "string") markdown = body.markdown;
  else if (typeof body.append === "string") markdown = `${docToMarkdown(doc.content, doc.content_text).trimEnd()}\n\n${body.append}`;
  if (markdown !== null) {
    // Keep the old text in History, so nothing the assistant changes is lost.
    await auth.supabase.from("document_versions").insert({
      user_id: auth.userId,
      document_id: id,
      label: "Before assistant edit",
      title: doc.title,
      content: doc.content,
      content_text: doc.content_text,
    });
    Object.assign(patch, markdownToDoc(markdown));
  }
  const { data, error } = await auth.supabase
    .from("documents")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select("id,title,word_count,updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ document: data });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const auth = await authenticate(request, "write");
  if ("denied" in auth) return auth.denied;
  const { id } = await params;
  const { data } = await auth.supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.userId)
    .is("deleted_at", null)
    .select("id");
  if (!data?.length) return notFound();
  return Response.json({ ok: true, trashed: id });
}
