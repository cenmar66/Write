import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";

async function AccountEmail() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return <>{(data?.claims?.email as string | undefined) ?? ""}</>;
}

export default function SettingsPage() {
  return (
    <div className="animate-rise">
      <h1 className="font-display text-4xl tracking-tight">Settings</h1>
      <p className="mt-2 text-muted">Make this space yours.</p>

      <div className="mt-8 space-y-4">
        <Row title="Appearance" hint="Light, dark, or follow your device.">
          <ThemeToggle />
        </Row>
        <Row
          title="Account"
          hint={
            <Suspense fallback="Signed in">
              <AccountEmail />
            </Suspense>
          }
        >
          <form action="/auth/signout" method="post">
            <button className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted transition hover:text-ink">
              <LogOut size={15} /> Sign out
            </button>
          </form>
        </Row>
      </div>
    </div>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </section>
  );
}
