import { requireOwner } from "@/lib/ai/server";

export async function GET() {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { data } = await auth.supabase.from("canvas_sync_audit").select("id,provider,action,status,detail,at").order("at", { ascending: false }).limit(50);
  return Response.json({ entries: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
