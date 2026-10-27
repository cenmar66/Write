"use client";

import {
  CalendarDays,
  Feather,
  FileText,
  Folder,
  Home,
  Inbox,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./logo";

/** Phone tab bar. */
export const NAV = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/docs", label: "Docs", Icon: FileText },
  { href: "/posts", label: "Posts", Icon: Sparkles },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/styles", label: "Styles", Icon: Feather },
  { href: "/settings", label: "Settings", Icon: Settings },
];

const MAIN = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/docs?search=1", label: "Search", Icon: Search },
  { href: "/posts", label: "Posts", Icon: Sparkles },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/settings", label: "Settings", Icon: Settings },
];

type FolderRow = { id: string; name: string };

/** Works out which sidebar link matches the current page. */
function useActive() {
  const path = usePathname();
  const params = useSearchParams();
  return (href: string) => {
    const [p, q] = href.split("?");
    if (p === "/") return path === "/";
    if (p === "/docs") {
      if (path !== "/docs") return false;
      const want = new URLSearchParams(q ?? "");
      const keys = ["search", "folder", "view"];
      return keys.every((k) => (want.get(k) ?? "") === (params.get(k) ?? ""));
    }
    return path.startsWith(p);
  };
}

export function Sidebar() {
  return <SidebarView isActive={useActive()} />;
}

/** Same sidebar with nothing highlighted, shown while the URL is still loading. */
export function SidebarFallback() {
  return <SidebarView isActive={() => false} />;
}

function SidebarView({ isActive }: { isActive: (href: string) => boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [folders, setFolders] = useState<FolderRow[]>([]);

  useEffect(() => {
    supabase.auth.getClaims().then(({ data }) => setEmail((data?.claims?.email as string) ?? ""));
    const load = () =>
      supabase
        .from("folders")
        .select("id,name")
        .order("name")
        .then(({ data }) => setFolders((data as FolderRow[]) ?? []));
    load();
    // The Docs page announces folder changes so this list stays fresh.
    window.addEventListener("folders-changed", load);
    return () => window.removeEventListener("folders-changed", load);
  }, [supabase]);

  async function addFolder() {
    const name = prompt("Folder name")?.trim();
    if (!name) return;
    const { data } = await supabase.from("folders").insert({ name }).select("id,name").single();
    if (data) {
      setFolders((f) => [...f, data as FolderRow].sort((a, b) => a.name.localeCompare(b.name)));
      router.push(`/docs?folder=${data.id}`);
    }
  }

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-bg print:hidden md:flex">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-4" title="Write.ai">
          <Logo size={28} />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] leading-tight tracking-tight">
              Write<span className="text-gradient">.ai</span>
            </span>
            <span className="block truncate text-xs text-muted">{email || " "}</span>
          </span>
        </Link>

        <nav className="space-y-0.5">
          {MAIN.map((item) => (
            <Item key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </nav>

        <Section title="Resources">
          <Item href="/styles" label="Styles" Icon={Feather} active={isActive("/styles")} />
        </Section>

        <Section
          title="Folders"
          action={
            <button onClick={addFolder} aria-label="New folder" className="rounded-md p-1 text-muted hover:bg-surface-strong hover:text-ink">
              <Plus size={15} />
            </button>
          }
        >
          {folders.map((f) => (
            <Item key={f.id} href={`/docs?folder=${f.id}`} label={f.name} Icon={Folder} active={isActive(`/docs?folder=${f.id}`)} />
          ))}
          <Item href="/docs" label="Drafts" Icon={Inbox} active={isActive("/docs")} />
          <Item href="/docs?view=trash" label="Trash" Icon={Trash2} active={isActive("/docs?view=trash")} />
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between px-3 pb-1">
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{title}</h2>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Item({ href, label, Icon, active }: { href: string; label: string; Icon: typeof Home; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition ${
        active ? "bg-surface-strong font-medium text-ink" : "text-muted hover:bg-surface-strong/60 hover:text-ink"
      }`}
    >
      <Icon size={17} className={`shrink-0 ${active ? "text-accent" : ""}`} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const path = usePathname();
  // Inside a document the editor's own dock takes over the bottom of the screen.
  if (/^\/docs\/[^/]+$/.test(path)) return null;
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav
      className="bar fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-3xl px-2 py-1.5 shadow-lg md:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className={`flex min-w-12 flex-col items-center gap-0.5 rounded-2xl px-1.5 py-1.5 text-[11px] transition ${
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
