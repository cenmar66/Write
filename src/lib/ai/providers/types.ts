import type { ModelOption } from "../models";

export type TextMessage = { role: "user" | "assistant"; content: string };

export type TextRequest = {
  model: ModelOption;
  system: string;
  messages: TextMessage[];
  effort: "low" | "medium" | "high";
  maxTokens: number;
};

/** Every AI provider (Claude today, a local model later) implements this. */
export interface Provider {
  /** Yields the reply as it's generated. */
  streamText(request: TextRequest): AsyncIterable<string>;
  /** Turns a provider error into a plain-English sentence. */
  describeError(error: unknown): string;
}
