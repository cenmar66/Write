import { aiStatus, simulatedAiEnabled } from "@/lib/inbox/ai/client";
import { estimateMonthlyCost } from "@/lib/inbox/ai/models";
import { billingConfigured, PLANS } from "@/lib/inbox/entitlements";
import { gmailConfigured } from "@/lib/inbox/mail/gmail";
import { capabilitiesFromScopes } from "@/lib/inbox/mail/gmail";
import { counts } from "@/lib/inbox/server/queries";
import { entitlementFor, handle, loadPrefs, myWorkspaces } from "@/lib/inbox/server/workspace";
import type { AccountRow } from "@/lib/inbox/types";

/** Everything the app shell needs in one call. Never includes tokens. */
export async function GET() {
  return handle(async (ctx) => {
    const prefs = await loadPrefs(ctx);
    const workspaces = await myWorkspaces(ctx);
    const ids = workspaces.map((w) => w.id);
    const { data: accounts } = ids.length ? await ctx.db.from("ip_accounts").select("id,workspace_id,provider,email,display_name,status,scopes,sync_state,last_sync_at,last_error,automation_mode,settings,created_at").in("workspace_id", ids).order("created_at") : { data: [] };
    const { data: categories } = ids.length ? await ctx.db.from("ip_categories").select("*").in("workspace_id", ids).order("position") : { data: [] };
    const ents = Object.fromEntries(await Promise.all(ids.map(async (id) => {
      const e = await entitlementFor(ctx.db, id);
      return [id, { plan: e.plan, label: PLANS[e.plan].label, features: [...e.features], maxAccounts: e.maxAccounts }];
    })));
    return {
      user: { email: ctx.email, local: ctx.local },
      prefs,
      workspaces,
      accounts: ((accounts ?? []) as AccountRow[]).map((a) => ({ ...a, capabilities: a.provider === "demo" ? { read: true, search: true, modify: true, send: true } : capabilitiesFromScopes(a.scopes) })),
      categories: categories ?? [],
      entitlements: ents,
      counts: await counts(ctx.db, ids),
      server: {
        gmail: gmailConfigured() && (!!ctx.admin || ctx.local),
        gmailReason: !gmailConfigured() ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET aren't set on the server." : !ctx.admin && !ctx.local ? "SUPABASE_SECRET_KEY isn't set (needed to store mailbox tokens securely)." : null,
        outlook: false,
        billing: billingConfigured(),
        ai: aiStatus(prefs),
        simulatedAi: simulatedAiEnabled(),
        costEstimate: estimateMonthlyCost(),
      },
    };
  });
}
