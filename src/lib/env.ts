// Central place for environment variables so a missing one fails loudly.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** The one email allowed into the app (server-side only). */
export function allowedEmail(): string {
  return (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
}

export function isAllowed(email: string | null | undefined): boolean {
  const allowed = allowedEmail();
  return !!allowed && !!email && email.trim().toLowerCase() === allowed;
}
