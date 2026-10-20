import { authenticate } from "@/lib/access-tokens";

export async function GET(request: Request) {
  const auth = await authenticate(request, "read");
  if ("denied" in auth) return auth.denied;
  const { data, error } = await auth.supabase
    .from("writing_styles")
    .select("id,name,description,is_default,profile,profile_updated_at")
    .eq("user_id", auth.userId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ styles: data ?? [] });
}
