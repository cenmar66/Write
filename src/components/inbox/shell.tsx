"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarChart3, Bot, CheckSquare, ChevronDown, Clock, Home, Inbox, Layers, Mail, Menu, Plug, Search, Settings, Sparkles, Star, Users, Wand2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useBoot, type Bootstrap } from "./api";
import { AssistantPanel } from "./assistant";
import { categoryIcon, Spinner, ToastProvider } from "./ui";

interface Scope {
  ws: string; // workspace id or "all"
  setWs: (ws: string) => void;
  boot: Bootstrap;
  openAssistant: (q?: string) => void;
}
const ScopeCtx = createContext<Scope | null>(null);
export const useScope = () => {
  const s = useContext(ScopeCtx);
  if (!s) throw new Error("useScope outside InboxShell");
  return s;
};

export function InboxShell({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 1, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Suspense fallback={<FullSpinner />}>
          <Frame>{children}</Frame>
        </Suspense>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function FullSpinner() {
  return (
    <div className="grid h-full place-items-center">
      <Spinner size={22} />
    </div>
  );
}

const MAIN = [
  { href: "/inbox", label: "Home", Icon: Home },
  { href: "/inbox/mail?view=priority", label: "Priority Inbox", Icon: Star, count: "priority" },
  { href: "/inbox/mail?view=all", label: "All Mail", Icon: Mail },
  { href: "/inbox/followups?tab=they_owe", label: "Awaiting Reply", Icon: Clock, count: "they_owe" },
  { href: "/inbox/followups", label: "Tasks", Icon: CheckSquare, count: "tasks" },
  { href: "/inbox/brief", label: "Daily Brief", Icon: Sparkles },
  { href: "/inbox/analytics", label: "Analytics", Icon: BarChart3 },
  { href: "/inbox/rules", label: "Rules", Icon: Wand2 },
  { href: "/inbox/senders", label: "Senders", Icon: Users },
  { href: "/inbox/accounts", label: "Connected Accounts", Icon: Plug },
] as const;

function Frame({ children }: { children: React.ReactNode }) {
  const boot = useBoot();
  const path = usePathname();
  const router = useRouter();
  const [wsChoice, setWsState] = useState(() => (typeof window === "undefined" ? "all" : localStorage.getItem("ip.ws") ?? "all"));
  const [navOpen, setNavOpen] = useState(false);
  const [assistant, setAssistant] = useState<{ open: boolean; q?: string; nonce?: number }>({ open: false });
  // Questions typed in the search bar open the assistant.
  useEffect(() => {
    const h = (e: Event) => setAssistant({ open: true, q: (e as CustomEvent<string>).detail, nonce: Date.now() });
    window.addEventListener("ip-ask", h);
    return () => window.removeEventListener("ip-ask", h);
  }, []);

  const setWs = (v: string) => {
    setWsState(v);
    localStorage.setItem("ip.ws", v);
  };

  const data = boot.data;
  // A remembered workspace that no longer exists falls back to "all".
  const ws = data && wsChoice !== "all" && !data.workspaces.some((w) => w.id === wsChoice) ? "all" : wsChoice;
  const needsOnboarding = data && data.workspaces.length === 0 && !path.startsWith("/inbox/onboarding");
  useEffect(() => {
    if (needsOnboarding) router.replace("/inbox/onboarding");
  }, [needsOnboarding, router]);

  const scope = useMemo<Scope | null>(() => (data ? { ws, setWs, boot: data, openAssistant: (q?: string) => setAssistant({ open: true, q, nonce: Date.now() }) } : null), [data, ws]);

  if (boot.error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="font-semibold">InboxPilot couldn&apos;t load.</p>
          <p className="ip-muted mt-1 text-[13px]">{boot.error.message}</p>
          <p className="ip-muted mt-3 text-[12px]">If this is a new install, run supabase/migrations/0011_inboxpilot.sql (see docs/inbox/SETUP.md).</p>
        </div>
      </div>
    );
  }
  if (!scope || needsOnboarding) return <FullSpinner />;
  const demoInScope = data!.workspaces.some((w) => w.is_demo && (ws === "all" || ws === w.id));

  return (
    <ScopeCtx.Provider value={scope}>
      <div className="flex h-full">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setNavOpen(true)} onAssistant={() => setAssistant({ open: true })} />
          {demoInScope && (
            <div className="border-b px-4 py-1.5 text-center text-[12px] font-medium ip-line" style={{ background: "var(--ip-warn-soft)", color: "var(--ip-warn)" }}>
              Demo data: the Demo workspace contains synthetic messages. Nothing there is real, and nothing is ever sent.
            </div>
          )}
          {data!.user.local && (
            <div className="border-b px-4 py-1 text-center text-[11px] ip-line ip-muted">Local demo mode (development only): data lives in server memory and resets on restart.</div>
          )}
          <main className="relative min-h-0 flex-1">{children}</main>
          <BottomBar />
        </div>
        <AssistantPanel open={assistant.open} initial={assistant.q} nonce={assistant.nonce} onClose={() => setAssistant({ open: false })} />
      </div>
    </ScopeCtx.Provider>
  );
}

function useActive() {
  const path = usePathname();
  const params = useSearchParams();
  return (href: string) => {
    const [p, q] = href.split("?");
    if (p === "/inbox") return path === "/inbox";
    if (path !== p) return false;
    const want = new URLSearchParams(q ?? "");
    for (const [k, v] of want) if (params.get(k) !== v) return false;
    if (p === "/inbox/followups" && !q) return !params.get("tab") || params.get("tab") === "all";
    return true;
  };
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { boot, ws } = useScope();
  const active = useActive();
  const counts = boot.counts as Record<string, number | Record<string, number> | undefined>;
  const cats = boot.categories.filter((c) => !c.hidden && (ws === "all" || c.workspace_id === ws));
  const uniqueCats = [...new Map(cats.map((c) => [c.key, c])).values()].sort((a, b) => a.position - b.position);
  const byCat = (boot.counts.unread_by_category ?? {}) as Record<string, number>;
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={onClose} aria-hidden />}
      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform md:static md:translate-x-0 ip-line ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--ip-surface)" }}
        aria-label="InboxPilot"
      >
        <div className="flex items-center gap-2 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3">
          <Logo />
          <span className="text-[16px] font-bold tracking-tight">InboxPilot</span>
          <button className="ip-btn ip-btn-ghost ip-btn-sm ml-auto md:hidden" onClick={onClose} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
        <div className="ip-scroll flex-1 px-2.5 pb-3">
          {MAIN.map(({ href, label, Icon, ...rest }) => {
            const c = "count" in rest ? (counts[rest.count] as number | undefined) : undefined;
            return (
              <Link key={href} href={href} onClick={onClose} className="ip-nav-link" aria-current={active(href) ? "page" : undefined}>
                <Icon size={16} /> {label} {!!c && <span className="ip-badge">{c}</span>}
              </Link>
            );
          })}
          <p className="ip-muted mt-4 mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider">Views</p>
          {uniqueCats.map((c) => {
            const Icon = categoryIcon(c.key);
            const href = `/inbox/mail?view=category:${c.key}`;
            return (
              <Link key={c.key} href={href} onClick={onClose} className="ip-nav-link" aria-current={active(href) ? "page" : undefined}>
                <Icon size={16} /> {c.name} {!!byCat[c.key] && <span className="ip-badge">{byCat[c.key]}</span>}
              </Link>
            );
          })}
        </div>
        <div className="border-t px-2.5 py-2 ip-line">
          <Link href="/inbox/settings" className="ip-nav-link" aria-current={active("/inbox/settings") ? "page" : undefined}>
            <Settings size={16} /> Settings
          </Link>
          <Link href="/" className="ip-nav-link text-[12px]">
            <Layers size={14} /> Back to Write.ai
          </Link>
        </div>
      </nav>
    </>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--ip-accent)" />
      <path d="M7 11.5 16 17l9-5.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11v9.5a1.5 1.5 0 0 0 1.5 1.5h9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <path d="m21 19 4 2.5-4 2.5" fill="var(--ip-teal)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function TopBar({ onMenu, onAssistant }: { onMenu: () => void; onAssistant: () => void }) {
  const { boot, ws, setWs } = useScope();
  const router = useRouter();
  const params = useSearchParams();
  const path = usePathname();
  const [q, setQ] = useState(path === "/inbox/mail" ? params.get("q") ?? "" : "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    // Questions go to the assistant; everything else is a search.
    if (/\?$|^(what|which|who|show me|when|how|qué|cuál|quién)\b/i.test(v)) {
      input.current?.blur();
      window.dispatchEvent(new CustomEvent("ip-ask", { detail: v }));
      return;
    }
    router.push(`/inbox/mail?view=all&q=${encodeURIComponent(v)}`);
  };
  return (
    <header className="flex items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] md:px-5 ip-line" style={{ background: "var(--ip-surface)", minHeight: 56 }}>
      <button className="ip-btn ip-btn-ghost ip-btn-sm md:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <form onSubmit={submit} className="relative max-w-xl flex-1" role="search">
        <Search size={15} className="ip-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} className="ip-input !h-9 !pl-9 !pr-12" placeholder="Search emails, contacts, or ask a question…" aria-label="Search or ask" />
        <span className="ip-kbd absolute right-2.5 top-1/2 hidden -translate-y-1/2 sm:inline">⌘K</span>
      </form>
      <label className="relative hidden sm:block">
        <span className="sr-only">Workspace</span>
        <select className="ip-select !h-9 !w-auto !pr-7 appearance-none" value={ws} onChange={(e) => setWs(e.target.value)}>
          <option value="all">All workspaces</option>
          {boot.workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
              {w.is_demo ? " (demo)" : ""}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="ip-muted pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
      </label>
      <button className="ip-btn" onClick={onAssistant} aria-label="Open AI assistant">
        <Bot size={15} /> <span className="hidden lg:inline">Assistant</span>
      </button>
      <Link href="/inbox/accounts" className="ip-btn hidden md:inline-flex">
        <Plug size={15} /> Connect account
      </Link>
    </header>
  );
}

function BottomBar() {
  const active = useActive();
  const items = [
    { href: "/inbox", label: "Home", Icon: Home },
    { href: "/inbox/mail?view=priority", label: "Inbox", Icon: Inbox },
    { href: "/inbox/followups", label: "Tasks", Icon: CheckSquare },
    { href: "/inbox/brief", label: "Brief", Icon: Sparkles },
    { href: "/inbox/settings", label: "More", Icon: Settings },
  ];
  return (
    <nav className="flex border-t pb-[env(safe-area-inset-bottom)] md:hidden ip-line" style={{ background: "var(--ip-surface)" }} aria-label="Primary">
      {items.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]" style={{ color: active(href) ? "var(--ip-accent)" : "var(--ip-muted)" }} aria-current={active(href) ? "page" : undefined}>
          <Icon size={20} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
