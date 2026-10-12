"use client";

import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const supabase = createClient();
  const callback = () => `${window.location.origin}/auth/callback`;

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback() },
    });
    setBusy(false);
    if (error) setError("Couldn't send the email. Is that the right address?");
    else setStep("code");
  }

  // The 6-digit code lets you sign in inside the installed phone app,
  // where tapping an email link would open a separate browser instead.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setError("That code didn't work. Check the latest email.");
      setBusy(false);
    } else {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      {step === "email" ? (
        <>
          <button
            onClick={google}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-surface-strong px-4 py-3.5 font-medium shadow-sm ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={sendEmail} className="space-y-3">
            <label className="relative block">
              <span className="sr-only">Email</span>
              <Mail size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl bg-surface-strong py-3.5 pr-4 pl-11 ring-1 ring-line outline-none transition placeholder:text-muted focus:ring-2 focus:ring-accent"
              />
            </label>
            <PrimaryButton busy={busy}>Email me a sign-in link</PrimaryButton>
          </form>
        </>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <p className="text-center text-sm text-muted">
            Check <span className="font-medium text-ink">{email}</span>. Tap the link, or
            enter the code here.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-2xl bg-surface-strong py-4 text-center font-display text-3xl tracking-[0.5em] ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
          />
          <PrimaryButton busy={busy}>Sign in</PrimaryButton>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="w-full text-sm text-muted hover:text-ink"
          >
            Use a different email
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-center text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}

function PrimaryButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="group bg-gradient-brand flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 font-medium text-white shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : children}
      {!busy && <ArrowRight size={17} className="transition group-hover:translate-x-0.5" />}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
