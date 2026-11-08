// Estimated API cost. Claude list prices are built in (USD per million tokens, first-party
// API, reviewed 2026-10); other providers' prices are configured in SATORI_PRICES because
// they change and aren't verified here. Estimates ignore caching discounts and taxes.
import type { Usage } from "./providers/types";

export type Price = { input: number; output: number };
export type UserPrices = Record<string, Price>;
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
    const raw = JSON.parse(process.env.SATORI_PRICES ?? "{}") as Record<string, Price>;
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v?.input === "number" && typeof v?.output === "number"));
  } catch {
    return {};
  }
}

/** Claude web search: $10 per 1,000 searches (first-party API list price). */
export const WEB_SEARCH_USD = 0.01;

export type PriceSource = "built-in" | "server" | "yours";

/**
 * Price per million tokens for a model. Claude list prices are built in; for other models
 * your own prices (Settings) come first, then SATORI_PRICES on the server.
 */
export function priceFor(provider: string, model: string, user: UserPrices = {}): { price: Price; source: PriceSource } | null {
  const key = `${provider}:${model}`;
  if (BUILT_IN[key]) return { price: BUILT_IN[key], source: "built-in" };
  const mine = user[key];
  if (mine && Number.isFinite(mine.input) && Number.isFinite(mine.output)) return { price: mine, source: "yours" };
  const server = configured()[key];
  return server ? { price: server, source: "server" } : null;
}

/** Whether you can set your own price for this model (everything except built-in Claude prices). */
export const canSetPrice = (provider: string, model: string) => !BUILT_IN[`${provider}:${model}`];

/** Returns an estimated cost in USD, or null when no price is known for this model. */
export function estimateCost(provider: string, model: string, usage: Usage | null, user: UserPrices = {}): number | null {
  if (!usage) return null;
  const found = priceFor(provider, model, user);
  if (!found) return null;
  const searches = provider === "anthropic" ? (usage.webSearches ?? 0) * WEB_SEARCH_USD : 0;
  return (usage.inputTokens * found.price.input + usage.outputTokens * found.price.output) / 1_000_000 + searches;
}
