import { authenticate } from "@/lib/access-tokens";
import { markdownToDoc } from "@/lib/markdown-server";

export async function GET(request: Request) {
  const auth = await authenticate(request, "read");
  if ("denied" in auth) return auth.denied;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  let q = auth.supabase
    .from("documents")
    .select("id,title,content_text,word_count,folder_id,style_id,created_at,updated_at")
    .eq("user_id", auth.userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  const term = (url.searchParams.get("q") ?? "").trim().replace(/[%,()]/g, " ");
  if (term) q = q.or(`title.ilike.%${term}%,content_text.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    documents: (data ?? []).map(({ content_text, ...d }) => ({ ...d, excerpt: content_text.slice(0, 280) })),
  });
}

export async function POST(request: Request) {
  const auth = await authenticate(request, "write");
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { title?: string; markdown?: string; folder_id?: string; style_id?: string };
  if (typeof body.markdown !== "string") return Response.json({ error: "Send the text as { markdown: \"…\" }." }, { status: 400 });
  const { data, error } = await auth.supabase
    .from("documents")
    .insert({
      user_id: auth.userId,
      title: (body.title ?? "").slice(0, 300),
      folder_id: body.folder_id ?? null,
      style_id: body.style_id ?? null,
      ...markdownToDoc(body.markdown),
    })
    .select("id,title,word_count,created_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ document: data }, { status: 201 });
}
