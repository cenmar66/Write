"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

/** Side panel on desktop, full-height sheet on phones. */
export function Drawer({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/10 md:hidden" onClick={onClose} />
      <aside className="fixed border border-line bg-bg inset-x-0 top-[8dvh] bottom-0 z-50 flex flex-col rounded-t-3xl shadow-2xl animate-rise print:hidden md:inset-y-4 md:top-4 md:right-4 md:left-auto md:w-[400px] md:rounded-3xl">
        <header className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <h2 className="font-display text-xl tracking-tight">{title}</h2>
          <div className="ml-auto flex items-center gap-1">
            {actions}
            <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-ink">
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}
