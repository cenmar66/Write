import { newToken, type Scope } from "@/lib/access-tokens";
import { requireOwner } from "@/lib/ai/server";

/** Creates an access code. The code is returned once and never stored in readable form. */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const body = (await request.json()) as { name?: string; scope?: Scope; days?: number | null };
  const name = body.name?.trim().slice(0, 80);
  if (!name) return Response.json({ error: "Give the code a name, like “My assistant”." }, { status: 400 });
  const scope: Scope = body.scope === "write" ? "write" : "read";
  const days = typeof body.days === "number" && body.days > 0 ? Math.min(body.days, 3650) : null;

  const { token, hash, prefix } = newToken();
  const { data, error } = await auth.supabase
    .from("access_tokens")
    .insert({
      name,
      scope,
      token_hash: hash,
      token_prefix: prefix,
      expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return Response.json({ error: "Couldn't create the code. Has the 0008 database update been run?" }, { status: 500 });
  }
  return Response.json({ id: data.id, token });
}
