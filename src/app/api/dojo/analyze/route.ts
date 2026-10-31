import { AnalyzeBody } from "@/lib/dojo/api-schemas";
import { checkLimits, dojoContext, notConfigured, pickProvider, readBody, recordUsage, servedBy, serviceFailure } from "@/lib/dojo/server";
import { analyze } from "@/lib/dojo/services";
import { looksLikeInjection } from "@/lib/dojo/untrusted";

export const maxDuration = 300;

export async function GET() {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  try {
    return Response.json({ analyses: await ctx.store.listAnalyses(20) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}

export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, AnalyzeBody);
  if ("denied" in body) return body.denied;
  const limited = await checkLimits(ctx, "ai");
  if (limited) return limited;
  const choice = await pickProvider(ctx, body.data);
  if (!choice) return notConfigured();
  try {
    const r = await analyze(choice, { prompt: body.data.prompt, target: body.data.target });
    await recordUsage(ctx, r.usage);
    const saved = body.data.save
      ? await ctx.store.createAnalysis({ prompt_text: body.data.prompt, provider: r.provider, model: r.model, composite: r.data.composite, result: r.data })
      : null;
    return Response.json({ result: r.data, id: saved?.id ?? null, servedBy: servedBy(r), injectionWarning: looksLikeInjection(body.data.prompt) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
