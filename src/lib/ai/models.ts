// The AI models you can pick from. Shared by the settings screen and the server.
// To add a new provider (for example a local AI), give it a provider name here
// and a matching file in src/lib/ai/providers/.

export type ProviderId = "anthropic";

export type ModelOption = {
  id: string;
  provider: ProviderId;
  label: string;
  short: string;
  blurb: string;
  cost: string;
  /** Whether the API can retry a declined request on another model for us. */
  serverFallback: boolean;
};

export const MODELS: ModelOption[] = [
  {
    id: "claude-opus-5-5",
    provider: "anthropic",
    label: "Claude Opus 5.5",
    short: "Opus",
    blurb: "Best all-round writer. The default.",
    cost: "~2¢ per edit",
    serverFallback: true,
  },
  {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    short: "Sonnet",
    blurb: "Fast and sharp at half the price.",
    cost: "~1¢ per edit",
    serverFallback: true,
  },
  {
    id: "claude-haiku-5-5",
    provider: "anthropic",
    label: "Claude Haiku 5.5",
    short: "Haiku",
    blurb: "Fastest and cheapest. Great for quick fixes.",
    cost: "a fraction of a cent",
    serverFallback: false,
  },
  {
    id: "claude-fable-5-1",
    provider: "anthropic",
    label: "Claude Fable 5.1",
    short: "Fable",
    blurb: "Anthropic's most capable model. Slower, premium price.",
    cost: "~5¢ per edit",
    serverFallback: true,
  },
];

export const DEFAULT_MODEL = "claude-opus-5-5";

export function findModel(id: string | null | undefined): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL)!;
}
