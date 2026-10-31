"use client";

import { ArrowLeft, BookMarked, FlaskConical, Gauge, History, LayoutTemplate, Menu, Settings, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useDojo } from "./provider";
import { Notice } from "./ui";

export const DOJO_NAV = [
  { href: "/dojo", label: "Generator", short: "Generate", Icon: Sparkles },
  { href: "/dojo/analyzer", label: "Analyzer", short: "Analyze", Icon: Gauge },
  { href: "/dojo/lab", label: "Testing Lab", short: "Lab", Icon: FlaskConical },
  { href: "/dojo/templates", label: "Templates", short: "Templates", Icon: LayoutTemplate },
  { href: "/dojo/library", label: "My Library", short: "Library", Icon: BookMarked },
  { href: "/dojo/history", label: "History", short: "History", Icon: History },
  { href: "/dojo/settings", label: "Settings", short: "Settings", Icon: Settings },
];

const MOBILE_TABS = ["/dojo", "/dojo/analyzer", "/dojo/templates", "/dojo/library"];

export function DojoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--pd-accent)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--pd-on-accent)" strokeWidth="2.4" />
      <path d="M7 16h18" stroke="var(--pd-on-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13 21.5l-2.5 4M19 21.5l2.5 4" stroke="var(--pd-on-accent)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function isActive(path: string, href: string) {
  return href === "/dojo" ? path === "/dojo" : path === href || path.startsWith(`${href}/`);
}

function StatusBanner() {
  const { status, statusError } = useDojo();
  if (statusError) return <Notice tone="warn">Couldn&apos;t check the server: {statusError}</Notice>;
  if (!status) return null;
  const items: ReactNode[] = [];
  if (status.localMode)
    items.push(
      <Notice key="local" tone="neutral">
        <strong>Local demo mode.</strong> No sign-in; data is kept in this server&apos;s memory and disappears when it restarts.
      </Notice>,
    );
  if (status.active?.isMock)
    items.push(
      <Notice key="mock" tone="warn">
        <strong>Test provider active.</strong> Results come from a mock used for automated tests — they are <em>not</em> real AI output.
      </Notice>,
    );
  if (!status.active)
    items.push(
      <Notice key="cfg" tone="warn">
        <strong>Configuration required.</strong> No AI provider is connected, so prompts can&apos;t be generated yet. Add <code className="pd-mono">ANTHROPIC_API_KEY</code> to the server environment (see <Link className="underline" href="/dojo/settings#providers">Settings → Providers</Link>). You can still browse templates and your library.
      </Notice>,
    );
  if (!status.databaseReady && status.store === "supabase")
    items.push(
      <Notice key="db" tone="warn">
        <strong>Database update needed.</strong> Run <code className="pd-mono">supabase/migrations/0011_promptdojo.sql</code> in Supabase so prompts and history can be saved.
      </Notice>,
    );
  return items.length ? <div className="mb-5 space-y-2">{items}</div> : null;
}

export function DojoShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menu = menuPath === path;
  const setMenu = (open: boolean) => setMenuPath(open ? path : null);

  return (
    <>
      <a href="#pd-main" className="sr-only-focusable fixed top-2 left-2 z-[70] pd-btn">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside data-chrome className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r pd-line lg:flex" style={{ background: "var(--pd-surface)" }}>
        <div className="flex h-full flex-col overflow-y-auto px-3 py-5">
          <Link href="/dojo" className="mb-6 flex items-center gap-2.5 px-2">
            <DojoMark />
            <span className="pd-serif text-[1.3rem] font-semibold">
              Prompt<span className="pd-accent-text">Dojo</span>
            </span>
          </Link>
          <nav aria-label="PromptDojo" className="space-y-0.5">
            {DOJO_NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="pd-nav-item" aria-current={isActive(path, href) ? "page" : undefined}>
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-1 border-t pt-4 pd-line">
            <Link href="/dojo/privacy" className="pd-nav-item text-sm" aria-current={path === "/dojo/privacy" ? "page" : undefined}>
              Privacy
            </Link>
            <Link href="/" className="pd-nav-item text-sm">
              <ArrowLeft size={16} aria-hidden /> Back to Write.ai
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header data-chrome className="pd-bar pd-safe-top sticky top-0 z-30 flex items-center gap-2 border-b px-4 pb-2.5 pd-line lg:hidden">
        <Link href="/dojo" className="flex flex-1 items-center gap-2">
          <DojoMark size={26} />
          <span className="pd-serif text-lg font-semibold">
            Prompt<span className="pd-accent-text">Dojo</span>
          </span>
        </Link>
        <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
          <Menu size={20} />
        </button>
      </header>

      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/35" aria-label="Close menu" onClick={() => setMenu(false)} />
          <div className="pd-safe-top absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-1 p-4 shadow-xl" style={{ background: "var(--pd-surface)" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="pd-eyebrow">Menu</span>
              <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon" aria-label="Close menu" onClick={() => setMenu(false)}>
                <X size={20} />
              </button>
            </div>
            {DOJO_NAV.map(({ href, label, Icon }) => (
              <Link key={href} href={href} className="pd-nav-item py-3" aria-current={isActive(path, href) ? "page" : undefined}>
                <Icon size={19} aria-hidden /> {label}
              </Link>
            ))}
            <div className="mt-auto space-y-1 border-t pt-3 pd-line">
              <Link href="/dojo/privacy" className="pd-nav-item">
                Privacy
              </Link>
              <Link href="/" className="pd-nav-item">
                <ArrowLeft size={16} aria-hidden /> Back to Write.ai
              </Link>
            </div>
          </div>
        </div>
      )}

      <main id="pd-main" className="px-4 pt-5 pb-32 sm:px-6 lg:ml-60 lg:px-10 lg:pt-9 lg:pb-14">
        <div className="mx-auto max-w-6xl">
          <StatusBanner />
          {children}
        </div>
      </main>

      {/* Mobile tab bar */}
      <nav data-chrome aria-label="PromptDojo tabs" className="pd-bar pd-safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t px-1 pt-1.5 pd-line lg:hidden">
        {DOJO_NAV.filter((n) => MOBILE_TABS.includes(n.href)).map(({ href, short, Icon }) => {
          const on = isActive(path, href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined} className="flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium" style={{ color: on ? "var(--pd-accent)" : "var(--pd-ink-3)" }}>
              <Icon size={21} strokeWidth={on ? 2.3 : 1.8} aria-hidden />
              {short}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMenu(true)} className="flex min-h-12 min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[11px] font-medium" style={{ color: "var(--pd-ink-3)" }} aria-label="More pages">
          <Menu size={21} strokeWidth={1.8} aria-hidden />
          More
        </button>
      </nav>
    </>
  );
}
