import { headers } from "next/headers";
import { Suspense } from "react";
import { Wordmark } from "@/components/logo";
import { explainAuthError } from "@/lib/auth-errors";
import { runSetupCheck } from "@/lib/setup-check";
import { LoginForm } from "./login-form";

type SearchParams = Promise<{ error?: string; detail?: string; check?: string }>;

function messageFor(error?: string, detail?: string) {
  if (!error) return undefined;
  if (error === "not_allowed") return `This app is private. That account isn't allowed in.${detail ? ` (${detail})` : ""}`;
  return explainAuthError(detail ?? "That sign-in link didn't work.");
}

async function FormWithError({ searchParams }: { searchParams: SearchParams }) {
  const { error, detail } = await searchParams;
  return <LoginForm initialError={messageFor(error, detail)} />;
}

/** Shows what's misconfigured. Opens by itself when something's wrong, or with ?check=1. */
async function SetupCheck({ searchParams }: { searchParams: SearchParams }) {
  const { check, error } = await searchParams;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const { checks, callback } = await runSetupCheck(origin);
  const failing = checks.filter((c) => !c.ok);
  if (!failing.length && !check && !error) return null;

  return (
    <details open={failing.length > 0 || !!check} className="glass mt-6 rounded-3xl p-5 text-sm">
      <summary className="cursor-pointer font-medium">
        Setup check {failing.length ? `· ${failing.length} thing${failing.length > 1 ? "s" : ""} to fix` : "· all good"}
      </summary>
      <ul className="mt-3 space-y-2">
        {checks.map((c) => (
          <li key={c.label}>
            <span className={c.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{c.ok ? "✓" : "✗"}</span> {c.label}
            {!c.ok && c.fix && <p className="mt-0.5 pl-4 text-muted [overflow-wrap:anywhere]">{c.fix}</p>}
          </li>
        ))}
        <li className="border-t border-line pt-3">
          <span className="font-medium">Supabase must know this address.</span>
          <p className="mt-1 text-muted">
            In Supabase → Authentication → URL Configuration, set <b>Site URL</b> to <code className="rounded bg-surface-strong px-1">{origin}</code> and add this under <b>Redirect URLs</b>:
          </p>
          <code className="mt-1 block rounded-lg bg-surface-strong px-2 py-1.5 break-all">{callback}</code>
          <p className="mt-1 text-muted">If it’s missing, sign-in emails and Google send you to the wrong place (often “localhost”).</p>
        </li>
      </ul>
    </details>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-10 flex justify-center">
          <Wordmark />
        </div>

        <h1 className="text-center font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">
          Your words,
          <br />
          <span className="text-gradient italic">without limits.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xs text-center text-muted">
          Write, speak, and publish from anywhere. Welcome back.
        </p>

        <div className="glass mt-10 rounded-3xl p-6 sm:p-8">
          <Suspense fallback={<LoginForm />}>
            <FormWithError searchParams={searchParams} />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <SetupCheck searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
