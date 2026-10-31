import { ACTION_CATALOG, dryRun, findConflicts, RULE_TEMPLATES, validateRule, type Rule } from "@/lib/inbox/rules";
import { sampleMessages } from "@/lib/inbox/server/queries";
import { audit, body, handle, HttpError, loadPrefs, requireWorkspace } from "@/lib/inbox/server/workspace";

/** GET ?ws=<id>: rules, catalog, templates, conflicts on recent mail. */
export async function GET(request: Request) {
  return handle(async (ctx) => {
    const ws = await requireWorkspace(ctx, new URL(request.url).searchParams.get("ws"));
    const { data } = await ctx.db.from("ip_rules").select("*").eq("workspace_id", ws.id).order("priority").order("created_at");
    const rules = (data ?? []) as Rule[];
    return { rules, catalog: ACTION_CATALOG, templates: RULE_TEMPLATES, conflicts: findConflicts(rules, await sampleMessages(ctx.db, ws.id)) };
  });
}

/**
 * Create a rule. Broad rules or ones that change the mailbox return 409 with a preview
 * until the user confirms (confirmed_broad=true).
 */
export async function POST(request: Request) {
  return handle(async (ctx) => {
    const b = await body<{ ws?: string; rule?: unknown }>(request);
    const ws = await requireWorkspace(ctx, b.ws);
    const v = validateRule(b.rule);
    if (!v.ok) throw new HttpError(400, v.error);
    const prefs = await loadPrefs(ctx);
    const preview = dryRun({ ...v.rule, id: "preview" }, await sampleMessages(ctx.db, ws.id), prefs.automation_mode, { canModifyProvider: true });
    if (preview.needsConfirmation.length && !v.rule.confirmed_broad) return Response.json({ needsConfirmation: preview.needsConfirmation, preview: { matchCount: preview.matchCount, sampleSize: preview.sampleSize } }, { status: 409 });
    const { data, error } = await ctx.db.from("ip_rules").insert({ ...v.rule, workspace_id: ws.id }).select().single();
    if (error) throw new HttpError(500, error.message);
    await audit(ctx.db, ws.id, "user", "rule.create", data.id, { name: v.rule.name });
    return { rule: data };
  });
}
