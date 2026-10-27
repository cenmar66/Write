"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Accessible modal using the native <dialog> (focus trap + Escape for free). */
export function Sheet({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dc-sheet-dialog"
      style={wide ? { width: "min(46rem, calc(100vw - 2rem))" } : undefined}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center gap-2 border-b px-5 py-3" style={{ borderColor: "var(--dc-line)" }}>
          <h2 className="dc-serif flex-1 text-lg">{title}</h2>
          <button className="dc-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="dc-scroll flex-1 px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3" style={{ borderColor: "var(--dc-line)" }}>
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--dc-muted)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--dc-faint)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}
