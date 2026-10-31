import { AdaptBody } from "@/lib/dojo/api-schemas";
import { checkLimits, dojoContext, notConfigured, pickProvider, readBody, recordUsage, servedBy, serviceFailure } from "@/lib/dojo/server";
import { adapt } from "@/lib/dojo/services";

export const maxDuration = 300;

export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, AdaptBody);
  if ("denied" in body) return body.denied;
  const limited = await checkLimits(ctx, "ai");
  if (limited) return limited;
  const choice = await pickProvider(ctx, body.data);
  if (!choice) return notConfigured();
  try {
    const r = await adapt(choice, body.data);
    await recordUsage(ctx, r.usage);
    return Response.json({ result: r.data, servedBy: servedBy(r) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
