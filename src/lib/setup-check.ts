import { allowedEmail, SUPABASE_KEY_RAW as SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL_RAW as SUPABASE_URL } from "@/lib/env";

// Server-only. Checks the sign-in setup without revealing any secret values.

export type Check = { label: string; ok: boolean; fix?: string };

export async function runSetupCheck(origin: string): Promise<{ checks: Check[]; callback: string }> {
  const checks: Check[] = [];
  const callback = `${origin}/auth/callback`;

  const urlOk = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL);
  checks.push({
    label: "Supabase URL is set",
    ok: urlOk,
    fix: SUPABASE_URL
      ? `NEXT_PUBLIC_SUPABASE_URL should look like https://abcd1234.supabase.co (no extra path). It currently starts with “${SUPABASE_URL.slice(0, 24)}…”. Fix it in Vercel, then redeploy.`
      : "Add NEXT_PUBLIC_SUPABASE_URL in Vercel (Supabase → Project Settings → Data API → Project URL), then redeploy.",
  });

  const keyOk = /^(sb_publishable_|eyJ)/.test(SUPABASE_PUBLISHABLE_KEY);
  checks.push({
    label: "Supabase publishable key is set",
    ok: keyOk,
    fix: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY should start with sb_publishable_ (or eyJ for older “anon” keys). Copy it from Supabase → Project Settings → API Keys, update it in Vercel, then redeploy.",
  });

  const email = allowedEmail();
  checks.push({
    label: "Allowed email is set",
    ok: email.includes("@"),
    fix: "Add ALLOWED_EMAIL = cenmarf@gmail.com in Vercel (all environments), then redeploy.",
  });

  if (urlOk && keyOk) {
    try {
      const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        checks.push({
          label: "App can talk to Supabase",
          ok: false,
          fix: res.status === 401 ? "Supabase rejected the publishable key. Re-copy it into Vercel and redeploy." : `Supabase answered with an error (HTTP ${res.status}). Is the project paused? Open the Supabase dashboard to check.`,
        });
      } else {
        const s = (await res.json()) as { external?: Record<string, boolean>; disable_signup?: boolean };
        checks.push({ label: "App can talk to Supabase", ok: true });
        checks.push({
          label: "Email sign-in is on",
          ok: s.external?.email !== false,
          fix: "Turn on Email under Supabase → Authentication → Sign In / Providers.",
        });
        checks.push({
          label: "Google sign-in is on",
          ok: !!s.external?.google,
          fix: "Turn on Google under Supabase → Authentication → Sign In / Providers and paste your Google Client ID and Secret (README step 3). Email sign-in still works without it.",
        });
        checks.push({
          label: "New sign-ups allowed (needed for your very first sign-in)",
          ok: !s.disable_signup,
          fix: "Sign-ups are switched off. If you've never signed in successfully, your account doesn't exist yet: turn “Allow new users to sign up” back on, sign in once, then switch it off. (The database lock keeps everyone else out either way.)",
        });
      }
    } catch {
      checks.push({ label: "App can talk to Supabase", ok: false, fix: "Couldn't reach Supabase. Double-check NEXT_PUBLIC_SUPABASE_URL in Vercel and redeploy." });
    }
  }

  return { checks, callback };
}
