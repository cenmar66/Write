// Generation / test providers: the AI services that actually run requests. Server-only.

export type ProviderId = "anthropic" | "openai" | "gemini" | "mock";

export type ProviderModel = { id: string; label: string };

export type CompletionRequest = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  /** When set, the provider must return JSON matching this schema. */
  json?: { name: string; schema: Record<string, unknown> };
  /** Lets the mock provider answer per task; ignored by real providers. */
  task?: string;
};

export type Usage = { inputTokens: number; outputTokens: number };

export type CompletionResult = {
  text: string;
  usage: Usage | null;
  /** The model that actually answered, as reported by the provider. */
  model: string;
  stopReason: string | null;
};

export interface DojoProvider {
  id: ProviderId;
  label: string;
  /** True when the provider's credentials are present. Never exposes them. */
  configured(): boolean;
  models(): ProviderModel[];
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Plain-English, secret-free error message. */
  describeError(error: unknown): string;
  /** Mock providers are for automated tests only and are labelled everywhere. */
  isMock?: boolean;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable = false,
  ) {
    super(message);
  }
}
