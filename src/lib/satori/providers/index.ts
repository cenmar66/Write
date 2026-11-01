import { DEFAULT_MODEL } from "@/lib/ai/models";
import { anthropicSatori } from "./anthropic";
import { geminiSatori, openaiSatori } from "./http";
import { mockSatori } from "./mock";
import type { SatoriProvider, ProviderId } from "./types";

export type { SatoriProvider, ProviderId } from "./types";

/** The mock provider exists only for automated tests, never in a production build. */
export function mockEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SATORI_MOCK_PROVIDER === "1";
}

const REAL: SatoriProvider[] = [anthropicSatori, openaiSatori, geminiSatori];

export function allProviders(): SatoriProvider[] {
  return mockEnabled() ? [...REAL, mockSatori] : REAL;
}

export function configuredProviders(): SatoriProvider[] {
  return allProviders().filter((p) => p.configured());
}

export function getProvider(id: string | null | undefined): SatoriProvider | null {
  return configuredProviders().find((p) => p.id === id) ?? null;
}

export type ProviderChoice = { provider: SatoriProvider; model: string };

/**
 * Resolves the generation provider + model. Order: explicit choice, saved preference,
 * SATORI_PROVIDER env, then the first configured provider (mock first when testing).
 * Returns null when nothing is configured (the UI shows a setup screen).
 */
export function resolveProvider(pref: { provider?: string | null; model?: string | null } = {}): ProviderChoice | null {
  const list = configuredProviders();
  if (!list.length) return null;
  const preferred =
    getProvider(pref.provider) ?? getProvider(process.env.SATORI_PROVIDER) ?? (mockEnabled() ? mockSatori : null) ?? list[0];
  const models = preferred.models();
  const model =
    models.find((m) => m.id === pref.model)?.id ??
    (preferred.id === "anthropic" ? models.find((m) => m.id === (process.env.AI_MODEL ?? DEFAULT_MODEL))?.id : undefined) ??
    models[0]?.id;
  if (!model) return null;
  return { provider: preferred, model };
}

/** Public, secret-free description for the browser. */
export function providerStatus(): { id: ProviderId; label: string; configured: boolean; isMock: boolean; models: { id: string; label: string }[] }[] {
  return allProviders().map((p) => ({ id: p.id, label: p.label, configured: p.configured(), isMock: !!p.isMock, models: p.configured() ? p.models() : [] }));
}
