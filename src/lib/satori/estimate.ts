// Cost estimate before running something. A range, not a quote: the answer's length isn't
// known in advance (and Claude's thinking counts as output). Once you have at least three
// past runs of the same kind on the same model, your own history sets the output range.
import { priceFor, WEB_SEARCH_USD, type UserPrices } from "./pricing";
import type { UsageEntry } from "./store/types";

export const ESTIMATE_KINDS = ["generate", "refine", "analyze", "test"] as const;
export type EstimateKind = (typeof ESTIMATE_KINDS)[number];

export type EstimateRequest = {
  kind: EstimateKind;
  /** Characters the person typed or pasted (request, prompt, filled variables). */
  chars: number;
  images?: number;
  /** Characters of attached website text. */
  sourceChars?: number;
  /** Generator: clarifying-question step runs first. */
  clarify?: boolean;
  webSearch?: boolean;
  connectors?: number;
};

export type Estimate = { provider: string; model: string; lowUsd: number | null; highUsd: number | null; basis: "your history" | "typical"; priced: boolean };

const CHARS_PER_TOKEN = 3.5;
const IMAGE_TOKENS: [number, number] = [1200, 2500];
/** Typical answer sizes in tokens, including thinking where the model thinks. */
export const TYPICAL_OUTPUT: Record<EstimateKind | "clarify", [number, number]> = {
  generate: [3000, 9000],
  clarify: [200, 1200],
  refine: [1200, 5000],
  analyze: [2000, 6000],
  test: [300, 3000],
};
const MAX_SEARCHES = 5;
/** Search results and connected-app tool definitions are read as input tokens. */
const SEARCH_INPUT: [number, number] = [0, 25000];
const CONNECTOR_INPUT: [number, number] = [500, 8000];

function percentile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

/** Output-token range: from your history when there's enough, else typical. */
export function outputRange(kind: EstimateKind | "clarify", provider: string, model: string, history: UsageEntry[]): { range: [number, number]; fromHistory: boolean } {
  const outs = history
    .filter((r) => r.kind === kind && r.provider === provider && r.model === model && (r.output_tokens ?? 0) > 0)
    .map((r) => r.output_tokens as number)
    .sort((a, b) => a - b);
  if (outs.length < 3) return { range: TYPICAL_OUTPUT[kind], fromHistory: false };
  return { range: [Math.round(percentile(outs, 0.2)), Math.round(percentile(outs, 0.8) * 1.1)], fromHistory: true };
}

/**
 * Estimated cost range for one model. `overheadTokens` is the size of PromptSatori's own
 * instructions for this kind of request (zero for Testing Lab runs, which send your prompt as-is).
 */
export function estimateFor(
  req: EstimateRequest,
  target: { provider: string; model: string },
  opts: { prices: UserPrices; history: UsageEntry[]; overheadTokens: number; clarifyOverheadTokens?: number },
): Estimate {
  const found = priceFor(target.provider, target.model, opts.prices);
  const out = outputRange(req.kind, target.provider, target.model, opts.history);
  const base = Math.ceil((req.chars + (req.sourceChars ?? 0)) / CHARS_PER_TOKEN) + opts.overheadTokens;
  const images = req.images ?? 0;
  // Web search and connected apps run only in the Testing Lab, and only on Claude.
  const tools = req.kind === "test" && target.provider === "anthropic";
  const searching = tools && !!req.webSearch;
  const connectors = tools ? (req.connectors ?? 0) : 0;
  let inLow = base + images * IMAGE_TOKENS[0] + connectors * CONNECTOR_INPUT[0];
  let inHigh = Math.ceil(base * 1.15) + images * IMAGE_TOKENS[1] + connectors * CONNECTOR_INPUT[1] + (searching ? SEARCH_INPUT[1] : 0);
  let outLow = out.range[0];
  let outHigh = out.range[1];
  if (req.kind === "generate" && req.clarify) {
    const c = outputRange("clarify", target.provider, target.model, opts.history);
    const cIn = Math.ceil((req.chars + (req.sourceChars ?? 0)) / CHARS_PER_TOKEN) + (opts.clarifyOverheadTokens ?? 0) + images * IMAGE_TOKENS[0];
    inLow += cIn;
    inHigh += Math.ceil(cIn * 1.15) + images * (IMAGE_TOKENS[1] - IMAGE_TOKENS[0]);
    outLow += c.range[0];
    outHigh += c.range[1];
  }
  if (!found) return { ...target, lowUsd: null, highUsd: null, basis: out.fromHistory ? "your history" : "typical", priced: false };
  const usd = (i: number, o: number) => (i * found.price.input + o * found.price.output) / 1_000_000;
  return {
    ...target,
    lowUsd: usd(inLow, outLow),
    highUsd: usd(inHigh, outHigh) + (searching ? MAX_SEARCHES * WEB_SEARCH_USD : 0),
    basis: out.fromHistory ? "your history" : "typical",
    priced: true,
  };
}

/** "about 2–4¢", "about $0.12–$0.30", "under 1¢". */
export function formatRange(low: number | null, high: number | null): string {
  if (low === null || high === null) return "cost unknown";
  const fmt = (v: number) => (v < 0.995 ? `${Math.max(1, Math.round(v * 100))}¢` : `$${v.toFixed(2)}`);
  if (high < 0.005) return "under 1¢";
  const a = fmt(low);
  const b = fmt(high);
  if (a === b) return `about ${a}`;
  if (a.endsWith("¢") && b.endsWith("¢")) return `about ${a.slice(0, -1)}–${b}`;
  return `about ${a}–${b}`;
}
