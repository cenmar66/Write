"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

const HEIGHT_KEY = "write.bottomPanelHeight";
const clampHeight = (h: number) => Math.round(Math.min(Math.max(h, 180), window.innerHeight * 0.85));

/**
 * Panel docked along the bottom of the screen, under the text. Drag its top edge to resize.
 * It publishes its height as --bottom-panel so the page can leave room to scroll the text above it.
 */
export function BottomPanel({
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
  const [height, setHeight] = useState(() => {
    let saved = 0;
    try {
      saved = Number(localStorage.getItem(HEIGHT_KEY)) || 0;
    } catch {}
    return clampHeight(saved || window.innerHeight * 0.36);
  });
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.documentElement.style.setProperty("--bottom-panel", `${height}px`);
    try {
      localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {}
  }, [height]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--bottom-panel");
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startH: height };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) setHeight(clampHeight(drag.current.startH + drag.current.startY - e.clientY));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <aside
      style={{ height }}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl border-t border-line bg-bg shadow-[0_-12px_40px_-20px_rgba(40,30,90,0.25)] animate-rise print:hidden md:left-64"
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") setHeight((h) => clampHeight(h + 40));
          if (e.key === "ArrowDown") setHeight((h) => clampHeight(h - 40));
        }}
        className="flex h-4 shrink-0 cursor-row-resize touch-none items-center justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-line" />
      </div>
      <header className="flex items-center gap-2 px-5 pb-2">
        <h2 className="font-display text-lg tracking-tight">{title}</h2>
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-ink">
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </aside>
  );
}
