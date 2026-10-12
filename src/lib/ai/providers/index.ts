import type { ProviderId } from "../models";
import { anthropicProvider } from "./anthropic";
import type { Provider } from "./types";

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
};
