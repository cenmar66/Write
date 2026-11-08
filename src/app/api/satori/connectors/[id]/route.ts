import { ConnectorBody } from "@/lib/satori/api-schemas";
import { encrypt } from "@/lib/crypto";
import { jsonError, readBody, satoriContext, serviceFailure } from "@/lib/satori/server";
import { serverNameFor } from "@/lib/satori/connectors";

type Ctx = { params: Promise<{ id: string }> };

/** Update a connected app. `token` omitted keeps the saved one; "" removes it. */
export async function PATCH(request: Request, { params }: Ctx) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, ConnectorBody);
  if ("denied" in body) return body.denied;
  const { id } = await params;
  const b = body.data;
  try {
    const all = await ctx.store.listConnectors();
    const current = all.find((c) => c.id === id);
    if (!current) return jsonError("Connected app not found.", 404);
    let token_encrypted: string | null | undefined;
    if (b.token !== undefined) {
      try {
        token_encrypted = b.token.trim() ? encrypt(b.token.trim()) : null;
      } catch {
        return jsonError("Tokens can't be saved until ENCRYPTION_KEY is set on the server.", 503);
      }
    }
    const server_name = b.label === current.label ? current.server_name : serverNameFor(b.label, all.filter((c) => c.id !== id).map((c) => c.server_name));
    const connector = await ctx.store.saveConnector({ label: b.label, url: b.url, enabled: b.enabled, server_name, token_encrypted }, id);
    return connector ? Response.json({ connector }) : jsonError("Connected app not found.", 404);
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    await ctx.store.deleteConnector((await params).id);
    return Response.json({ ok: true });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
