"use client";

import { AlertTriangle, Check, ChevronDown, Copy, Loader2, RotateCw, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { copyText } from "./client";
import { useToast } from "./provider";

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 size={size} className="animate-spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function CopyButton({ text, label = "Copy", small, className = "", primary }: { text: string; label?: string; small?: boolean; className?: string; primary?: boolean }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1800);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={`pd-btn ${small ? "pd-btn-sm" : ""} ${primary ? "pd-btn-primary" : ""} ${className}`}
      onClick={async () => {
        const ok = await copyText(text);
        setDone(ok);
        toast(ok ? "Copied to clipboard" : "Couldn't copy. Select the text and copy it manually.", ok ? "ok" : "error");
      }}
      disabled={!text}
    >
      {done ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}

export function ErrorBox({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border p-3.5 text-sm" style={{ background: "var(--pd-danger-bg)", borderColor: "transparent", color: "var(--pd-danger)" }}>
      <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="pd-btn pd-btn-sm" onClick={onRetry}>
          <RotateCw size={14} aria-hidden /> Retry
        </button>
      )}
      {onDismiss && (
        <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost pd-btn-icon" onClick={onDismiss} aria-label="Dismiss">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function Notice({ tone = "accent", children, icon }: { tone?: "accent" | "warn" | "neutral"; children: ReactNode; icon?: ReactNode }) {
  const style =
    tone === "warn"
      ? { background: "var(--pd-warn-bg)", color: "var(--pd-warn)" }
      : tone === "accent"
        ? { background: "var(--pd-accent-bg)", color: "var(--pd-accent-ink)" }
        : { background: "var(--pd-surface-2)", color: "var(--pd-ink-2)" };
  return (
    <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm" style={style}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Collapsible({ title, children, defaultOpen = false, badge, id }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; badge?: ReactNode; id?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const auto = useId();
  const panel = id ?? auto;
  return (
    <section className="pd-card">
      <h3>
        <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left text-[0.9375rem] font-semibold" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
          <span className="flex-1">{title}</span>
          {badge}
          <ChevronDown size={17} className={`pd-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h3>
      <div id={panel} hidden={!open} className="border-t px-4 py-3.5 pd-line">
        {children}
      </div>
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs pd-muted">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="pd-card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full pd-accent-bg">{icon}</div>
      <h3 className="pd-serif text-xl font-semibold">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm pd-soft">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="pd-serif text-[1.85rem] leading-tight font-semibold md:text-[2.2rem]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[0.9375rem] pd-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Accessible modal dialog using the native <dialog> element. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`pd-card m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] overflow-hidden p-0 backdrop:bg-black/40 ${wide ? "max-w-4xl" : "max-w-lg"}`}
      style={{ color: "var(--pd-ink)" }}
      aria-labelledby={titleId}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center gap-3 border-b px-5 py-3.5 pd-line">
            <h2 id={titleId} className="pd-serif flex-1 text-lg font-semibold">
              {title}
            </h2>
            <button type="button" className="pd-btn pd-btn-ghost pd-btn-icon pd-btn-sm" onClick={onClose} aria-label="Close">
              <X size={17} />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ProviderBadge({ servedBy }: { servedBy: { providerLabel: string; model: string; isMock: boolean } | null | undefined }) {
  if (!servedBy) return null;
  return servedBy.isMock ? (
    <span className="pd-badge pd-badge-warn" title="Test provider: not real AI output">
      Mock test provider — not real AI
    </span>
  ) : (
    <span className="pd-badge" title="The service and model that actually produced this result">
      Generated by {servedBy.providerLabel} · <span className="pd-mono">{servedBy.model}</span>
    </span>
  );
}
