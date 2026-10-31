import { CreatePromptBody } from "@/lib/dojo/api-schemas";
import { TargetId } from "@/lib/dojo/schema";
import { dojoContext, readBody, serviceFailure } from "@/lib/dojo/server";
import type { PromptFilter } from "@/lib/dojo/store";

export async function GET(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const p = new URL(request.url).searchParams;
  const target = TargetId.safeParse(p.get("target"));
  const view = p.get("view");
  const sort = p.get("sort");
  const filter: PromptFilter = {
    q: p.get("q")?.slice(0, 100) || undefined,
    target: target.success ? target.data : undefined,
    category: p.get("category") || undefined,
    collection_id: p.get("collection") || undefined,
    favorite: p.get("favorite") === "1" || undefined,
    view: view === "archived" || view === "trash" ? view : "active",
    sort: sort === "created" || sort === "title" ? sort : "updated",
  };
  try {
    return Response.json({ prompts: await ctx.store.listPrompts(filter) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, CreatePromptBody);
  if ("denied" in body) return body.denied;
  try {
    if (body.data.generation_id && !(await ctx.store.getGeneration(body.data.generation_id))) body.data.generation_id = null;
    return Response.json({ prompt: await ctx.store.createPrompt(body.data) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
