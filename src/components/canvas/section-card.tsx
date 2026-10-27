"use client";

import { ChevronDown, Maximize2, Minimize2, MoreHorizontal, EyeOff, Palette, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PALETTE, headerColors, isHex, sectionColor, checkboxColor } from "@/lib/canvas/colors";
import { SECTION_BY_KEY } from "@/lib/canvas/sections";
import type { SectionKey } from "@/lib/canvas/types";
import { InkLayer } from "./ink";
import { useCanvas } from "./provider";
import { useIsDark } from "./use-dark";

/** A per-device on/off setting (the planner UI only renders in the browser). */
function useLocalFlag(key: string, initial = false): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s === null ? initial : s === "1";
    } catch {
      return initial;
    }
  });
  return [
    v,
    (next: boolean) => {
      setV(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    },
  ];
}
export { useLocalFlag };

export function useSectionColor(key: SectionKey) {
  const { prefs } = useCanvas();
  const dark = useIsDark();
  const base = sectionColor(key, prefs.section_colors, prefs.color_theme);
  const head = headerColors(base, dark);
  const check = checkboxColor(base, dark ? "#1f1e1b" : "#fdfbf6");
  return { base, head, check };
}

export function SectionCard({
  sectionKey,
  count,
  children,
  extraMenu,
  bodyClassName = "",
  fill = false,
}: {
  sectionKey: SectionKey;
  count?: string;
  children: React.ReactNode;
  extraMenu?: React.ReactNode;
  bodyClassName?: string;
  fill?: boolean;
}) {
  const def = SECTION_BY_KEY[sectionKey];
  const { focus, setFocus, planner, prefs, date } = useCanvas();
  const { head, check, base } = useSectionColor(sectionKey);
  const [collapsed, setCollapsed] = useLocalFlag(`dc-collapsed-${sectionKey}`);
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const focused = focus === sectionKey;

  useEffect(() => {
    if (!menu && !picker) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false);
        setPicker(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu, picker]);

  const setColor = (hex: string | null) => {
    const next = { ...prefs.section_colors };
    if (hex) next[sectionKey] = hex;
    else delete next[sectionKey];
    planner.setPrefs({ section_colors: next });
  };

  return (
    <section
      id={`section-${sectionKey}`}
      aria-labelledby={`h-${sectionKey}`}
      data-annotatable={def.annotatable ? "true" : "false"}
      className={`dc-card ${collapsed && !focused ? "dc-collapsed" : ""} ${fill ? "h-full" : ""}`}
      style={{ ["--dc-accent" as string]: check, ["--c" as string]: check }}
    >
      <header className="dc-card-head" style={{ background: head.bg, color: head.fg }}>
        <button
          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-1 text-left"
          aria-expanded={!collapsed || focused}
          aria-controls={`body-${sectionKey}`}
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <ChevronDown size={14} className="transition-transform" style={{ transform: collapsed && !focused ? "rotate(-90deg)" : "none" }} />
          <h2 id={`h-${sectionKey}`} className="font-[inherit]">
            {def.title}
          </h2>
        </button>
        {count && <span className="dc-count">{count}</span>}
        <div ref={menuRef} className={`relative dc-noprint ${count ? "" : "ml-auto"}`}>
          <button className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/15" aria-label={`${def.title} options`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <MoreHorizontal size={16} />
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl py-1 text-sm normal-case tracking-normal shadow-xl" style={{ background: "var(--dc-paper)", color: "var(--dc-ink)", border: "1px solid var(--dc-line)", fontWeight: 450 }}>
              <MenuItem icon={<Palette size={15} />} onClick={() => (setPicker(true), setMenu(false))}>
                Section colour
              </MenuItem>
              <MenuItem icon={focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />} onClick={() => (setFocus(focused ? null : sectionKey), setMenu(false))}>
                {focused ? "Exit focus" : "Focus on this section"}
              </MenuItem>
              {extraMenu}
              <MenuItem
                icon={<EyeOff size={15} />}
                onClick={() => {
                  planner.setPrefs({ hidden_sections: [...new Set([...prefs.hidden_sections, sectionKey])] });
                  setMenu(false);
                  if (focused) setFocus(null);
                }}
              >
                Hide section
              </MenuItem>
            </div>
          )}
          {picker && (
            <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl p-3 normal-case tracking-normal shadow-xl" style={{ background: "var(--dc-paper)", color: "var(--dc-ink)", border: "1px solid var(--dc-line)", fontWeight: 450 }}>
              <p className="mb-2 text-xs" style={{ color: "var(--dc-muted)" }}>
                {def.title} colour
              </p>
              <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Colours">
                {PALETTE.map((p) => (
                  <button
                    key={p.hex}
                    role="radio"
                    aria-checked={base.toLowerCase() === p.hex}
                    aria-label={p.name}
                    title={p.name}
                    onClick={() => setColor(p.hex)}
                    className="h-6 w-6 rounded-full"
                    style={{ background: p.hex, boxShadow: base.toLowerCase() === p.hex ? "0 0 0 2px var(--dc-paper), 0 0 0 4px var(--dc-ink)" : "none" }}
                  />
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs">
                Custom
                <input type="color" value={isHex(base) ? base : "#5f8f6c"} onChange={(e) => setColor(e.target.value)} className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent" aria-label="Custom colour" />
                <span style={{ color: "var(--dc-muted)" }}>Text stays readable automatically.</span>
              </label>
              <button className="mt-2 inline-flex items-center gap-1 text-xs underline" onClick={() => setColor(null)}>
                <RotateCcw size={12} /> Default
              </button>
            </div>
          )}
        </div>
      </header>
      <div id={`body-${sectionKey}`} className={`dc-card-body relative flex-1 ${bodyClassName}`}>
        {children}
        {def.annotatable && <InkLayer date={date} zone={sectionKey} />}
      </div>
    </section>
  );
}

export function MenuItem({ icon, children, onClick, danger }: { icon?: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5" style={danger ? { color: "#a33" } : undefined} onClick={onClick}>
      <span style={{ color: danger ? undefined : "var(--dc-muted)" }}>{icon}</span>
      {children}
    </button>
  );
}
