import { requireOwner } from "@/lib/ai/server";

export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { platform } = (await request.json()) as { platform?: string };
  // Facebook and Instagram share one login, so they disconnect together.
  const platforms = platform === "facebook" || platform === "instagram" ? ["facebook", "instagram"] : [platform ?? ""];
  await auth.supabase.from("connected_accounts").delete().in("platform", platforms);
  return Response.json({ ok: true });
}
