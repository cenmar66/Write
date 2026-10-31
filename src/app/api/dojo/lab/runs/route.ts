import { SaveRunBody } from "@/lib/dojo/api-schemas";
import { dojoContext, readBody, serviceFailure } from "@/lib/dojo/server";

export async function GET(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const promptId = new URL(request.url).searchParams.get("prompt") ?? undefined;
  try {
    return Response.json({ runs: await ctx.store.listTestRuns({ promptId, limit: 50 }) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, SaveRunBody);
  if ("denied" in body) return body.denied;
  try {
    if (body.data.prompt_id && !(await ctx.store.getPrompt(body.data.prompt_id))) return Response.json({ error: "Prompt not found." }, { status: 404 });
    return Response.json({ run: await ctx.store.createTestRun(body.data) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
