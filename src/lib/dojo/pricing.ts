// Estimated API cost. Claude list prices are built in (USD per million tokens, first-party
// API, reviewed 2026-10); other providers' prices are configured in DOJO_PRICES because
// they change and aren't verified here. Estimates ignore caching discounts and taxes.
import type { Usage } from "./providers/types";

type Price = { input: number; output: number };

const BUILT_IN: Record<string, Price> = {
  "anthropic:claude-fable-5-1": { input: 10, output: 50 },
  "anthropic:claude-opus-5-5": { input: 4, output: 20 },
  "anthropic:claude-sonnet-5-5": { input: 2, output: 10 },
  "anthropic:claude-haiku-5-5": { input: 0.1, output: 0.5 },
  // Models a safety fallback can route to.
  "anthropic:claude-opus-5": { input: 5, output: 25 },
  "anthropic:claude-opus-4-8": { input: 5, output: 25 },
  "anthropic:claude-sonnet-5": { input: 2, output: 10 },
  "mock:mock-1": { input: 0, output: 0 },
};

function configured(): Record<string, Price> {
  try {
    const raw = JSON.parse(process.env.DOJO_PRICES ?? "{}") as Record<string, Price>;
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v?.input === "number" && typeof v?.output === "number"));
  } catch {
    return {};
  }
}

/** Returns an estimated cost in USD, or null when no price is known for this model. */
export function estimateCost(provider: string, model: string, usage: Usage | null): number | null {
  if (!usage) return null;
  const price = configured()[`${provider}:${model}`] ?? BUILT_IN[`${provider}:${model}`];
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
