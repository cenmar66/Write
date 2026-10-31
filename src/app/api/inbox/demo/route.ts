import { DEMO_EMAIL } from "@/lib/inbox/mail/demo";
import { syncAccount } from "@/lib/inbox/server/sync";
import { audit, createWorkspace, handle, loadPrefs, myWorkspaces } from "@/lib/inbox/server/workspace";
import type { AccountRow } from "@/lib/inbox/types";

export const maxDuration = 60;

/** Creates a clearly-labelled demo workspace with a synthetic mailbox and imports it. */
export async function POST() {
  return handle(async (ctx) => {
    const existing = (await myWorkspaces(ctx)).find((w) => w.is_demo);
    const ws = existing ?? (await createWorkspace(ctx, { name: "Demo workspace", kind: "business", is_demo: true }));
    let { data: acc } = await ctx.db.from("ip_accounts").select("*").eq("workspace_id", ws.id).eq("provider", "demo").maybeSingle();
    if (!acc) {
      const res = await ctx.db.from("ip_accounts").insert({ workspace_id: ws.id, user_id: ctx.userId, provider: "demo", email: DEMO_EMAIL, display_name: "Demo mailbox", scopes: "demo" }).select().single();
      if (res.error) throw new Error(res.error.message);
      acc = res.data;
    }
    const result = await syncAccount(ctx.db, ctx.admin, acc as AccountRow, await loadPrefs(ctx));
    await audit(ctx.db, ws.id, "user", "demo.create", (acc as AccountRow).id, { inserted: result.inserted });
    return { workspace: ws, account: acc, result };
  });
}

/** Removes every demo workspace (and all its synthetic data). */
export async function DELETE() {
  return handle(async (ctx) => {
    const demos = (await myWorkspaces(ctx)).filter((w) => w.is_demo && w.owner_id === ctx.userId);
    for (const w of demos) await ctx.db.from("ip_workspaces").delete().eq("id", w.id);
    return { removed: demos.length };
  });
}
