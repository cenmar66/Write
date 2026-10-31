import { TemplateBody } from "@/lib/dojo/api-schemas";
import { dojoContext, readBody, serviceFailure } from "@/lib/dojo/server";

/** Your own private templates (the starter library ships with the app). */
export async function GET() {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ templates: await ctx.store.listTemplates() });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, TemplateBody);
  if ("denied" in body) return body.denied;
  try {
    return Response.json({ template: await ctx.store.createTemplate(body.data) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
