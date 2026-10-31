import { toJson, toMarkdown, toText } from "@/lib/dojo/export";
import { dojoContext, serviceFailure } from "@/lib/dojo/server";

/** GET ?format=json|md|txt&ids=a,b (ids optional = whole active library). */
export async function GET(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const p = new URL(request.url).searchParams;
  const format = p.get("format") === "md" ? "md" : p.get("format") === "txt" ? "txt" : "json";
  const ids = (p.get("ids") ?? "").split(",").filter(Boolean).slice(0, 500);
  try {
    const list = await ctx.store.listPrompts({ view: "active", limit: 500 });
    const archived = ids.length ? await ctx.store.listPrompts({ view: "archived", limit: 500 }) : [];
    const chosen = ids.length ? [...list, ...archived].filter((x) => ids.includes(x.id)) : list;
    const stamp = new Date().toISOString().slice(0, 10);
    const headers = (type: string, ext: string) => ({
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="promptdojo-${stamp}.${ext}"`,
      "Cache-Control": "no-store",
    });
    if (format === "md") return new Response(toMarkdown(chosen), { headers: headers("text/markdown", "md") });
    if (format === "txt") return new Response(toText(chosen), { headers: headers("text/plain", "txt") });
    const collections = new Map((await ctx.store.listCollections()).map((c) => [c.id, c.name]));
    const full = await Promise.all(chosen.map(async (x) => ({ ...(await ctx.store.getPrompt(x.id))!, collection: x.collection_id ? collections.get(x.collection_id) : undefined })));
    const templates = ids.length ? [] : await ctx.store.listTemplates();
    return new Response(JSON.stringify(toJson(full, templates), null, 2), { headers: headers("application/json", "json") });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
