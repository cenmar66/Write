import { dryRun, validateRule } from "@/lib/inbox/rules";
import { body, handle, HttpError, loadPrefs, requireWorkspace } from "@/lib/inbox/server/workspace";
import { sampleMessages } from "@/lib/inbox/server/queries";

/** "What will change?" — runs a rule over recent mail without applying anything. */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ ws?: string; rule?: unknown }>(request);
    const ws = await requireWorkspace(ctx, b.ws);
    const v = validateRule(b.rule);
    if (!v.ok) throw new HttpError(400, v.error);
    const sample = await sampleMessages(ctx.db, ws.id);
    const prefs = await loadPrefs(ctx);
    const r = dryRun({ ...v.rule, id: "preview" }, sample, prefs.automation_mode, { canModifyProvider: true });
    const byId = new Map(sample.map((m) => [m.id, m]));
    return {
      matchCount: r.matchCount,
      sampleSize: r.sampleSize,
      broad: r.broad,
      needsConfirmation: r.needsConfirmation,
      examples: r.matched.slice(0, 10).map((x) => ({ id: x.messageId, from: byId.get(x.messageId)?.from_email, subject: byId.get(x.messageId)?.subject, actions: x.actions.map((a) => a.action.kind) })),
    };
  });
}
