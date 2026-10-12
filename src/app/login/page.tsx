import { Suspense } from "react";
import { Wordmark } from "@/components/logo";
import { LoginForm } from "./login-form";

const ERRORS: Record<string, string> = {
  not_allowed: "This app is private. That account isn't allowed in.",
  auth_failed: "That sign-in link didn't work. Try again?",
};

type SearchParams = Promise<{ error?: string }>;

async function FormWithError({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  return <LoginForm initialError={error ? (ERRORS[error] ?? ERRORS.auth_failed) : undefined} />;
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

        <div className="glass mt-10 rounded-3xl p-6 shadow-[0_20px_60px_-20px_rgba(80,60,180,0.25)] sm:p-8">
          <Suspense fallback={<LoginForm />}>
            <FormWithError searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
