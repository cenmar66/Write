// Model routing and cost table for InboxPilot. Prices are USD per million tokens,
// first-party API list prices as of 2026-10 (update here when they change).

export type Tier = "fast" | "balanced" | "best";
export type AiProviderId = "anthropic" | "openai" | "simulated";

export interface InboxModel {
  id: string;
  provider: AiProviderId;
  tier: Tier;
  label: string;
  priceIn: number;
  priceOut: number;
  serverFallback: boolean;
}

export const ANTHROPIC_MODELS: InboxModel[] = [
  { id: "claude-haiku-5-5", provider: "anthropic", tier: "fast", label: "Claude Haiku 5.5", priceIn: 0.1, priceOut: 0.5, serverFallback: false },
  { id: "claude-sonnet-5-5", provider: "anthropic", tier: "balanced", label: "Claude Sonnet 5.5", priceIn: 2, priceOut: 10, serverFallback: true },
  { id: "claude-opus-5-5", provider: "anthropic", tier: "best", label: "Claude Opus 5.5", priceIn: 4, priceOut: 20, serverFallback: true },
];

/** OpenAI models are configured by environment (names/prices change often). */
export function openAiModels(): InboxModel[] {
  const pick = (tier: Tier, envName: string): InboxModel | null => {
    const id = process.env[envName] || process.env.OPENAI_MODEL;
    if (!id) return null;
    return {
      id,
      provider: "openai",
      tier,
      label: id,
      priceIn: Number(process.env.OPENAI_PRICE_IN ?? 0) || 0,
      priceOut: Number(process.env.OPENAI_PRICE_OUT ?? 0) || 0,
      serverFallback: false,
    };
  };
  return [pick("fast", "OPENAI_MODEL_FAST"), pick("balanced", "OPENAI_MODEL_BALANCED"), pick("best", "OPENAI_MODEL_BEST")].filter((m): m is InboxModel => !!m);
}

/** Which tier each feature uses (cheapest that does the job well). */
export const FEATURE_TIER: Record<string, Tier> = {
  classify: "fast",
  extract_task: "fast",
  summarize: "balanced",
  briefing: "balanced",
  draft: "balanced",
  search: "fast",
  assistant: "balanced",
};

export const EFFORT: Record<Tier, "low" | "medium" | "high"> = { fast: "low", balanced: "low", best: "medium" };

export function modelFor(provider: AiProviderId, tier: Tier): InboxModel | null {
  if (provider === "simulated") return { id: "simulated", provider, tier, label: "Simulated AI (dev only)", priceIn: 0, priceOut: 0, serverFallback: false };
  const list = provider === "openai" ? openAiModels() : ANTHROPIC_MODELS;
  return list.find((m) => m.tier === tier) ?? list[0] ?? null;
}

export function costUsd(m: InboxModel, inputTokens: number, outputTokens: number): number {
  return (inputTokens * m.priceIn + outputTokens * m.priceOut) / 1_000_000;
}

/**
 * Rough monthly AI cost per active user, from assumptions the UI shows next to it.
 * Not a measurement: real usage is in the AI usage table.
 */
export function estimateMonthlyCost(a = { emailsPerDay: 120, aiClassifiedShare: 0.25, draftsPerDay: 5, briefingsPerDay: 2, chatsPerDay: 3 }) {
  const fast = ANTHROPIC_MODELS[0];
  const bal = ANTHROPIC_MODELS[1];
  const perDay =
    a.emailsPerDay * a.aiClassifiedShare * costUsd(fast, 700, 150) +
    a.draftsPerDay * costUsd(bal, 2500, 500) +
    a.briefingsPerDay * costUsd(bal, 4000, 700) +
    a.chatsPerDay * costUsd(bal, 5000, 600);
  return { assumptions: a, perDayUsd: perDay, perMonthUsd: perDay * 30 };
}
