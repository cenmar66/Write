import { ConnectorBody } from "@/lib/satori/api-schemas";
import { encrypt } from "@/lib/crypto";
import { jsonError, readBody, satoriContext, serviceFailure } from "@/lib/satori/server";
import { serverNameFor } from "@/lib/satori/connectors";

/** Your connected apps (MCP servers). Tokens are never returned. */
export async function GET() {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ connectors: await ctx.store.listConnectors() });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await satoriContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, ConnectorBody);
  if ("denied" in body) return body.denied;
  const b = body.data;
  try {
    const existing = await ctx.store.listConnectors();
    if (existing.length >= 20) return jsonError("You can connect up to 20 apps.", 400);
    let token_encrypted: string | null = null;
    if (b.token?.trim()) {
      try {
        token_encrypted = encrypt(b.token.trim());
      } catch {
        return jsonError("Tokens can't be saved until ENCRYPTION_KEY is set on the server.", 503);
      }
    }
    const connector = await ctx.store.saveConnector({ label: b.label, url: b.url, enabled: b.enabled, server_name: serverNameFor(b.label, existing.map((c) => c.server_name)), token_encrypted });
    return Response.json({ connector });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
