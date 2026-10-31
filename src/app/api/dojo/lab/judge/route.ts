import { JudgeBody } from "@/lib/dojo/api-schemas";
import { checkLimits, dojoContext, notConfigured, pickProvider, readBody, recordUsage, servedBy, serviceFailure } from "@/lib/dojo/server";
import { judge } from "@/lib/dojo/services";

export const maxDuration = 300;

/** Optional AI first-pass rating against the person's criteria. Subjective, never ground truth. */
export async function POST(request: Request) {
  const ctx = await dojoContext();
  if ("denied" in ctx) return ctx.denied;
  const body = await readBody(request, JudgeBody);
  if ("denied" in body) return body.denied;
  const limited = await checkLimits(ctx, "ai");
  if (limited) return limited;
  const choice = await pickProvider(ctx, body.data);
  if (!choice) return notConfigured();
  try {
    const r = await judge(choice, body.data);
    await recordUsage(ctx, r.usage);
    return Response.json({ result: r.data, servedBy: servedBy(r) });
  } catch (error) {
    return serviceFailure(ctx, error);
  }
}
