"use client";

import { Check, ChevronDown, Feather, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listStyles, type WritingStyle } from "@/lib/styles";
import { createClient } from "@/lib/supabase/client";

/** Loads your writing styles once. */
export function useStyles() {
  const supabase = useMemo(() => createClient(), []);
  const [styles, setStyles] = useState<WritingStyle[] | null>(null);
  useEffect(() => {
    listStyles(supabase).then(setStyles);
  }, [supabase]);
  return styles;
}

/**
 * Pill button that picks a writing style.
 * value: a style id, "none" for no style, or null for your default style.
 */
export function StyleSelect({
  value,
  onChange,
  direction = "down",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  direction?: "up" | "down";
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const chosen = styles?.find((s) => s.id === value);
  const fallback = styles?.find((s) => s.is_default);
  const label = value === "none" ? "No style" : chosen ? chosen.name : fallback ? fallback.name : "Add style";
  const active = value !== "none" && !!(chosen ?? fallback);

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm ring-1 ring-line transition hover:bg-surface-strong ${active ? "text-ink" : "text-muted"}`}
      >
        <Feather size={14} className={active ? "text-accent" : ""} />
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className={`absolute left-0 z-40 w-64 rounded-2xl border border-line bg-bg p-1.5 text-sm shadow-xl ${direction === "up" ? "bottom-11" : "top-11"}`}
          >
            <p className="px-3 pt-1.5 pb-1 text-xs text-muted">Write in this style</p>
            {styles?.length === 0 && <p className="px-3 py-2 text-muted">No styles yet.</p>}
            {styles?.map((s) => (
              <Option key={s.id} selected={value === s.id || (value === null && s.is_default)} onClick={() => pick(s.is_default ? null : s.id)}>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.is_default && <span className="text-[11px] text-muted">default</span>}
                {!s.profile && <span className="text-[11px] text-muted">not built</span>}
              </Option>
            ))}
            <Option selected={value === "none"} onClick={() => pick("none")}>
              <span className="flex-1 text-muted">No style</span>
            </Option>
            <div className="my-1 h-px bg-line" />
            <Link href="/styles" className="flex items-center gap-2 rounded-xl px-3 py-2 text-muted hover:bg-surface-strong hover:text-ink">
              <Settings2 size={14} /> Manage styles
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-surface-strong"
    >
      {children}
      <span className="w-4">{selected && <Check size={14} className="text-accent" />}</span>
    </button>
  );
}
