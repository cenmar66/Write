"use client";

import { AlertCircle, ArrowDown, Bell, Bookmark, CheckSquare, HelpCircle, Heart, Loader2, Newspaper, Receipt, Tag, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// ------------------------------------------------------------------ formatting
export function timeLabel(iso: string, tz?: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const diff = (now.getTime() - d.getTime()) / 86_400_000;
  if (diff < 6) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function dueLabel(iso: string | null, tz?: string) {
  if (!iso) return "No date";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const today = new Date();
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${-days} days overdue`;
  return d.toLocaleDateString("en-US", { weekday: days < 7 ? "short" : undefined, month: "short", day: "numeric", timeZone: iso.length === 10 ? undefined : tz });
}

// ------------------------------------------------------------------ chips & avatars
const IMP_LABEL: Record<string, string> = { critical: "Critical", high: "High", normal: "Medium", low: "Low" };
export function ImportanceChip({ value }: { value?: string | null }) {
  if (!value) return null;
  return <span className={`ip-chip ip-chip-${value}`}>{IMP_LABEL[value] ?? value}</span>;
}

const CAT_ICON: Record<string, typeof Tag> = { needs_attention: AlertCircle, todo: CheckSquare, read_later: Bookmark, newsletters: Newspaper, notifications: Bell, receipts: Receipt, personal: Heart, low_priority: ArrowDown, review: HelpCircle };
export const categoryIcon = (key: string) => CAT_ICON[key] ?? Tag;
export function CategoryChip({ k, name }: { k: string | null; name?: string }) {
  if (!k) return null;
  const tone = k === "newsletters" ? "info" : k === "receipts" ? "teal" : k === "review" ? "warn" : "";
  return <span className={`ip-chip ${tone ? `ip-chip-${tone}` : ""}`}>{name ?? k.replace(/_/g, " ")}</span>;
}

const PALETTE = ["#3b6fd8", "#0f8a7e", "#8a5cd1", "#c2410c", "#2f855a", "#b83280", "#2b6cb0", "#6b46c1"];
export function Avatar({ name, email, size = 32 }: { name?: string; email: string; size?: number }) {
  const label = (name || email).replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const initials = label.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className="ip-avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: PALETTE[h % PALETTE.length] }} aria-hidden>
      {initials}
    </span>
  );
}

export function Provenance({ kind }: { kind?: string }) {
  if (!kind) return null;
  const map: Record<string, [string, string]> = { explicit: ["Stated in email", "teal"], inferred: ["Inferred", "warn"], user: ["You set this", "info"] };
  const [label, tone] = map[kind] ?? [kind, ""];
  return <span className={`ip-chip ip-chip-${tone}`}>{label}</span>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 className="animate-spin" size={size} aria-label="Loading" />;
}

export function Empty({ icon: Icon = Tag, title, children }: { icon?: typeof Tag; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: "var(--ip-accent-soft)", color: "var(--ip-accent)" }}>
        <Icon size={20} />
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="ip-muted max-w-sm text-[13px]">{children}</div>}
    </div>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ip-skeleton h-10" />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ dialog
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="ip-dialog" style={wide ? { maxWidth: "min(860px, calc(100vw - 24px))" } : undefined} onClose={onClose} onCancel={onClose} aria-label={title}>
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b px-5 py-3.5 ip-line">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button className="ip-btn ip-btn-ghost ip-btn-sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="ip-scroll px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ------------------------------------------------------------------ toasts
type Toast = { id: number; text: string; tone: "ok" | "error" | "info"; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className="ip-card ip-fade-in pointer-events-auto flex max-w-md items-center gap-3 px-4 py-2.5 text-[13px]" style={t.tone === "error" ? { borderColor: "var(--ip-crit)", color: "var(--ip-crit)" } : undefined}>
            <span>{t.text}</span>
            {t.action && (
              <button className="ip-btn ip-btn-sm" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function errText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}
