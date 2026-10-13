import { requireOwner } from "@/lib/ai/server";
import { claimAndPublish } from "@/lib/publish";

export const maxDuration = 300;

/** "Post now" from the post page. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { id } = await params;
  const result = await claimAndPublish(auth.supabase, id, ["draft", "scheduled", "failed"]);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
