// Turns Supabase sign-in errors into plain English, keeping the original for troubleshooting.

const HINTS: [RegExp, string][] = [
  [/rate limit|too many|security purposes/i, "Too many sign-in emails in a short time. Supabase's built-in email only sends a few per hour. Wait a while, or use Google sign-in."],
  [/signups? not allowed|signup.*disabled/i, "New sign-ups are switched off in Supabase, and your account doesn't exist yet. In Supabase → Authentication → Sign In / Providers, turn on “Allow new users to sign up”, sign in once, then turn it off again."],
  [/database error saving new user|sign-ups are closed/i, "The database refused this account. Only cenmarf@gmail.com can sign up. Check the email (or Google account) you used."],
  [/provider is not enabled|unsupported provider/i, "Google sign-in isn't switched on in Supabase. Go to Authentication → Sign In / Providers → Google and turn it on."],
  [/code verifier|both auth code and code verifier|flow state/i, "The sign-in link was opened in a different browser or app than the one you started in. Open it in the same browser, or type the 6-digit code from the email instead."],
  [/expired|invalid.*(otp|token|link)|otp.*invalid/i, "That link or code has expired or was already used. Request a new one."],
  [/redirect|url.*not allowed/i, "Supabase doesn't recognize this app's web address. Add it under Authentication → URL Configuration (see the setup check below)."],
  [/invalid api key|no api key|apikey/i, "The Supabase key in Vercel is wrong. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then redeploy."],
  [/failed to fetch|network|load failed/i, "The app couldn't reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in Vercel, then redeploy."],
];

export function explainAuthError(raw: string | null | undefined): string {
  const message = (raw ?? "").trim();
  if (!message) return "Sign-in didn't work. Try again.";
  const hint = HINTS.find(([re]) => re.test(message))?.[1];
  return hint ? `${hint} (Details: ${message})` : `Sign-in didn't work: ${message}`;
}
