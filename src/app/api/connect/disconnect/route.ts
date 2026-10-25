import { requireOwner } from "@/lib/ai/server";

export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { platform } = (await request.json()) as { platform?: string };
  const db = auth.supabase.from("connected_accounts");
  if (platform === "facebook") {
    // Facebook takes its Page's Instagram with it, but not an Instagram you connected directly.
    await auth.supabase.from("connected_accounts").delete().eq("platform", "facebook");
    const { data: ig } = await auth.supabase.from("connected_accounts").select("meta").eq("platform", "instagram").maybeSingle();
    if (ig && (ig.meta as { login?: string } | null)?.login !== "instagram") await db.delete().eq("platform", "instagram");
  } else {
    await db.delete().eq("platform", platform ?? "");
  }
  return Response.json({ ok: true });
}
