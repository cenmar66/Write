"use client";

import {
  BarChart3,
  CalendarDays,
  CloudOff,
  Ellipsis,
  List,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  TriangleAlert,
  Check,
  HardDrive,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarSync } from "./google-client";
import { InkPalette } from "./ink";
import { Sprig } from "./icons";
import { useCanvas, useSyncStatus } from "./provider";
import { QuickCapture } from "./quick-capture";
import { TaskSheet } from "./task-sheet";
import { ConflictBanner } from "./conflicts";
import { Reminders } from "./reminders";
import { useIsDark } from "./use-dark";

const NAV = [
  { href: "/canvas", label: "Today", icon: Sun, view: "day" as const },
  { href: "/canvas", label: "Calendar", icon: CalendarDays, view: "week" as const },
  { href: "/canvas/insights", label: "Insights", icon: BarChart3 },
  { href: "/canvas/notes", label: "Notes", icon: NotebookPen },
  { href: "/canvas/lists", label: "Lists", icon: List },
  { href: "/canvas/search", label: "Search", icon: Search },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { prefs, pencil, captureOpen, setCaptureOpen, openTask, setOpenTask, store } = useCanvas();
  const sheetTask = openTask ? store.get("canvas_tasks", openTask.id) : undefined;
  const dark = useIsDark();
  const anim = prefs.animations;

  // Theme and density live on the root element so dialogs inherit them too.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".dc-root");
    if (!root) return;
    root.dataset.theme = prefs.theme;
    root.dataset.density = prefs.density;
    root.classList.toggle("dc-anim", anim);
    root.classList.toggle("dc-pencil-on", pencil);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#161513" : "#efe9df");
  }, [prefs.theme, prefs.density, anim, pencil, dark]);

  // Keyboard: N = quick capture, T = today, ←/→ = days (when not typing).
  const { setDate, today, date, view, setView } = useCanvas();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setCaptureOpen(true);
      } else if (e.key === "t" || e.key === "T") setDate(today);
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const step = view === "day" ? 1 : view === "week" ? 7 : 28;
        const d = new Date(date + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + (e.key === "ArrowLeft" ? -step : step));
        setDate(d.toISOString().slice(0, 10));
      } else if (e.key === "d") setView("day");
      else if (e.key === "w") setView("week");
      else if (e.key === "m") setView("month");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCaptureOpen, setDate, today, date, view, setView]);

  return (
    <div className="flex min-h-dvh">
      <a href="#dc-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to planner
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConflictBanner />
        <main id="dc-main" className="min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>
      <BottomTabs />
      <Toasts />
      <InkPalette />
      <CalendarSync />
      <Reminders />
      {captureOpen && <QuickCapture onClose={() => setCaptureOpen(false)} />}
      {openTask && sheetTask && <TaskSheet key={openTask.id} task={sheetTask} date={openTask.date} onClose={() => setOpenTask(null)} />}
    </div>
  );
}

function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { setView, view, setDate, today } = useCanvas();
  return (
    <nav aria-label="Planner" className="dc-noprint sticky top-0 hidden h-dvh w-52 shrink-0 flex-col px-3 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:flex lg:w-56">
      <Link href="/canvas" className="mb-6 flex items-center gap-1.5 px-2" onClick={() => setView("day")}>
        <span className="dc-serif text-[1.35rem] leading-none">The Daily Canvas</span>
        <Sprig className="text-[#6f8f6f]" size={20} />
      </Link>
      <ul className="space-y-0.5">
        {NAV.map((n) => {
          const active = n.view ? path === "/canvas" && (n.view === "day" ? view === "day" : view !== "day") : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <li key={n.label}>
              <button
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                style={{ background: active ? "var(--dc-paper)" : "transparent", color: active ? "var(--dc-ink)" : "var(--dc-muted)", boxShadow: active ? "var(--dc-shadow)" : "none", fontWeight: active ? 600 : 450 }}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (n.view) {
                    setView(n.view);
                    if (n.view === "day") setDate(today);
                  }
                  router.push(n.href);
                }}
              >
                <Icon size={17} />
                {n.label}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto space-y-2">
        <SyncBadge />
        <Link
          href="/canvas/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
          style={{ color: path.startsWith("/canvas/settings") ? "var(--dc-ink)" : "var(--dc-muted)", background: path.startsWith("/canvas/settings") ? "var(--dc-paper)" : undefined }}
        >
          <Settings size={17} /> Settings
        </Link>
      </div>
    </nav>
  );
}

function BottomTabs() {
  const path = usePathname();
  const router = useRouter();
  const { setView, view, setCaptureOpen, setDate, today } = useCanvas();
  const [more, setMore] = useState(false);
  const tab = (label: string, Icon: typeof Sun, active: boolean, onClick: () => void) => (
    <button className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.68rem]" style={{ color: active ? "var(--dc-ink)" : "var(--dc-muted)", fontWeight: active ? 600 : 450 }} aria-current={active ? "page" : undefined} onClick={onClick}>
      <Icon size={20} />
      {label}
    </button>
  );
  return (
    <nav aria-label="Planner" className="dc-noprint fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden" style={{ background: "color-mix(in srgb, var(--dc-paper) 94%, transparent)", borderColor: "var(--dc-line)", backdropFilter: "blur(10px)" }}>
      <div className="relative flex items-end px-2">
        {tab("Today", Sun, path === "/canvas" && view === "day", () => (setView("day"), setDate(today), router.push("/canvas")))}
        {tab("Calendar", CalendarDays, path === "/canvas" && view !== "day", () => (setView("week"), router.push("/canvas")))}
        <div className="flex flex-1 justify-center">
          <button aria-label="Quick add" className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg" style={{ background: "#4f78b8" }} onClick={() => setCaptureOpen(true)}>
            <Plus size={26} />
          </button>
        </div>
        {tab("Insights", BarChart3, path.startsWith("/canvas/insights"), () => router.push("/canvas/insights"))}
        {tab("More", Ellipsis, more || ["/canvas/notes", "/canvas/lists", "/canvas/search", "/canvas/settings"].some((p) => path.startsWith(p)), () => setMore(!more))}
        {more && (
          <div className="absolute bottom-full right-2 mb-2 w-48 overflow-hidden rounded-xl py-1 shadow-xl" style={{ background: "var(--dc-paper)", border: "1px solid var(--dc-line)" }}>
            {[
              { href: "/canvas/notes", label: "Notes & ideas", icon: NotebookPen },
              { href: "/canvas/lists", label: "Lists & backlog", icon: List },
              { href: "/canvas/search", label: "Search", icon: Search },
              { href: "/canvas/settings", label: "Settings", icon: Settings },
            ].map((m) => (
              <Link key={m.href} href={m.href} className="flex items-center gap-3 px-4 py-2.5 text-sm" onClick={() => setMore(false)}>
                <m.icon size={16} /> {m.label}
              </Link>
            ))}
            <div className="border-t px-4 py-2" style={{ borderColor: "var(--dc-line)" }}>
              <SyncBadge />
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export function SyncBadge() {
  const s = useSyncStatus();
  const { sync } = useCanvas();
  let icon = <Check size={14} />;
  let text = "Synced";
  let color = "var(--dc-muted)";
  if (s.mode === "local-only") {
    icon = <HardDrive size={14} />;
    text = "This device only (dev mode)";
  } else if (!s.online) {
    icon = <CloudOff size={14} />;
    text = s.pending ? `Offline · ${s.pending} to sync` : "Offline · saved here";
    color = "#a3592f";
  } else if (s.error) {
    icon = <TriangleAlert size={14} />;
    text = "Sync problem — retrying";
    color = "#a33";
  } else if (s.syncing || s.pending) {
    icon = <RefreshCw size={14} className={s.syncing ? "animate-spin" : ""} />;
    text = s.pending ? `Saving ${s.pending}…` : "Syncing…";
  }
  return (
    <button
      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs"
      style={{ color }}
      title={s.error ?? (s.lastSyncAt ? `Last synced ${new Date(s.lastSyncAt).toLocaleString()}` : undefined)}
      onClick={() => void sync.syncNow()}
      role="status"
      aria-live="polite"
    >
      {icon}
      {text}
    </button>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useCanvas();
  return (
    <div className="dc-noprint pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[55] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="dc-toast pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2 text-sm shadow-lg" style={{ background: "var(--dc-ink)", color: "var(--dc-paper)" }}>
          <span>{t.message}</span>
          {t.action && (
            <button
              className="font-semibold underline-offset-2 hover:underline"
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
