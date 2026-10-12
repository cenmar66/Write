"use client";

import { CalendarDays, FileText, Home, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./logo";

export const NAV = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/docs", label: "Docs", Icon: FileText },
  { href: "/posts", label: "Posts", Icon: Sparkles },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

export function Sidebar() {
  return <SidebarView isActive={useActive()} />;
}

/** Same sidebar with nothing highlighted, shown while the URL is still loading. */
export function SidebarFallback() {
  return <SidebarView isActive={() => false} />;
}

function SidebarView({ isActive }: { isActive: (href: string) => boolean }) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col p-4 print:hidden md:flex">
      <div className="glass flex h-full flex-col rounded-3xl p-4">
        <Link href="/" className="px-2 py-3">
          <Wordmark />
        </Link>
        <nav className="mt-6 space-y-1">
          {NAV.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition ${
                isActive(href)
                  ? "bg-surface-strong font-medium text-ink shadow-sm"
                  : "text-muted hover:bg-surface-strong/60 hover:text-ink"
              }`}
            >
              <Icon size={18} className={isActive(href) ? "text-accent" : ""} />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto px-3 text-xs text-muted">Made for one. Built for everything.</p>
      </div>
    </aside>
  );
}

export function BottomNav() {
  const isActive = useActive();
  const path = usePathname();
  // Inside a document the editor's own dock takes over the bottom of the screen.
  if (/^\/docs\/[^/]+$/.test(path)) return null;
  return (
    <nav
      className="bar fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-3xl px-2 py-1.5 shadow-lg md:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] transition ${
            isActive(href) ? "text-accent" : "text-muted"
          }`}
        >
          <Icon size={21} strokeWidth={isActive(href) ? 2.3 : 1.8} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
