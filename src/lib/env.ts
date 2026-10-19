// Central place for environment variables so a missing one fails loudly.
/** Exactly what's set in Vercel (the setup check inspects these). */
export const SUPABASE_URL_RAW = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_KEY_RAW = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

// A wrong setting must not break the build or crash pages: fall back to a harmless
// placeholder so the app still deploys and the login page can explain what to fix.
const isUrl = (v: string) => /^https?:\/\/[^\s/]+/.test(v);
export const SUPABASE_URL = isUrl(SUPABASE_URL_RAW) ? SUPABASE_URL_RAW.replace(/\/+$/, "") : "https://not-configured.invalid";
export const SUPABASE_PUBLISHABLE_KEY = SUPABASE_KEY_RAW || "not-configured";

/** The one email allowed into the app (server-side only). */
export function allowedEmail(): string {
  return (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

export function isAllowed(email: string | null | undefined): boolean {
  const allowed = allowedEmail();
  return !!allowed && !!email && email.trim().toLowerCase() === allowed;
}
