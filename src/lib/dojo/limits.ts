// Cost and abuse controls for AI endpoints. All configurable through environment
// variables (see .env.example). The per-minute limiter is in memory, so on serverless
// hosting it applies per running instance; the daily and monthly caps are read from the
// usage table and hold across instances.

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export const LIMITS = {
  get perMinute() {
    return num("DOJO_RATE_PER_MINUTE", 12);
  },
  get perDay() {
    return num("DOJO_DAILY_REQUEST_LIMIT", 300);
  },
  /** 0 = no budget cap. */
  get monthlyBudgetUsd() {
    return num("DOJO_MONTHLY_BUDGET_USD", 25);
  },
  maxRequestChars: 8_000,
  maxPromptChars: 30_000,
  maxBodyBytes: 200_000,
};

type Bucket = number[];
const g = globalThis as unknown as { __dojoRate?: Map<string, Bucket> };
const buckets = (g.__dojoRate ??= new Map());

/** Sliding one-minute window. Returns seconds to wait, or 0 when allowed. */
export function rateLimit(key: string, limit = LIMITS.perMinute, windowMs = 60_000, now = Date.now()): number {
  if (limit <= 0) return 0;
  const b = (buckets.get(key) ?? []).filter((t: number) => now - t < windowMs);
  if (b.length >= limit) {
    buckets.set(key, b);
    return Math.ceil((windowMs - (now - b[0])) / 1000);
  }
  b.push(now);
  buckets.set(key, b);
  return 0;
}

export function resetRateLimits() {
  buckets.clear();
}

export function startOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function startOfDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
