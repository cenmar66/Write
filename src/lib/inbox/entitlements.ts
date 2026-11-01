// Plans and feature entitlements. Prices live in Stripe (when billing is turned on),
// never in code. "dev" grants everything and is the default for this owner-only
// deployment; set INBOX_DEFAULT_PLAN to test the limits of another plan.

export type Plan = "personal" | "professional" | "team" | "dev";
export type Feature =
  | "multiple_accounts" | "ai_classification" | "ai_drafts" | "ai_assistant" | "briefing"
  | "followups" | "tasks" | "task_integrations" | "analytics" | "team_members" | "team_analytics" | "rules" | "automatic_mode";

export const PLANS: Record<Plan, { label: string; maxAccounts: number; maxMembers: number; aiRequestsPerMonth: number; features: Feature[]; implemented: boolean }> = {
  personal: { label: "Personal", maxAccounts: 1, maxMembers: 1, aiRequestsPerMonth: 300, features: ["briefing", "rules", "ai_classification", "ai_drafts", "tasks"], implemented: true },
  professional: { label: "Professional", maxAccounts: 5, maxMembers: 1, aiRequestsPerMonth: 3000, features: ["multiple_accounts", "ai_classification", "ai_drafts", "ai_assistant", "briefing", "followups", "tasks", "task_integrations", "analytics", "rules", "automatic_mode"], implemented: true },
  team: { label: "Team", maxAccounts: 25, maxMembers: 25, aiRequestsPerMonth: 20000, features: ["multiple_accounts", "ai_classification", "ai_drafts", "ai_assistant", "briefing", "followups", "tasks", "task_integrations", "analytics", "team_members", "team_analytics", "rules", "automatic_mode"], implemented: false },
  dev: { label: "Owner (development)", maxAccounts: 50, maxMembers: 50, aiRequestsPerMonth: 100000, features: ["multiple_accounts", "ai_classification", "ai_drafts", "ai_assistant", "briefing", "followups", "tasks", "task_integrations", "analytics", "team_members", "team_analytics", "rules", "automatic_mode"], implemented: true },
};

export interface Entitlement {
  plan: Plan;
  source: "dev" | "stripe" | "manual";
  features: Set<Feature>;
  maxAccounts: number;
  aiRequestsPerMonth: number;
}

export function resolveEntitlement(row: { plan?: string; source?: string; overrides?: Record<string, unknown> } | null): Entitlement {
  const fallback = (process.env.INBOX_DEFAULT_PLAN as Plan) || "dev";
  const plan: Plan = (row?.plan as Plan) in PLANS ? (row!.plan as Plan) : fallback in PLANS ? fallback : "dev";
  const def = PLANS[plan];
  const features = new Set(def.features);
  const o = row?.overrides ?? {};
  for (const f of (o.add_features as Feature[]) ?? []) features.add(f);
  for (const f of (o.remove_features as Feature[]) ?? []) features.delete(f);
  return {
    plan,
    source: (row?.source as Entitlement["source"]) ?? "dev",
    features,
    maxAccounts: Number(o.max_accounts ?? def.maxAccounts),
    aiRequestsPerMonth: Number(o.ai_requests ?? def.aiRequestsPerMonth),
  };
}

export const billingConfigured = () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
