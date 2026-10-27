"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { formatLong, isISODate } from "@/lib/canvas/dates";
import { resolveOrder } from "@/lib/canvas/sections";
import { renderSection, useDayProgress } from "./day-view";
import { useCanvas } from "./provider";

/** A clean page for printing, or "Save as PDF" from the print dialog. */
export function PrintView() {
  const { date, setDate, prefs } = useCanvas();
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && isISODate(d)) setDate(d);
  }, [setDate]);
  const p = useDayProgress(date);
  const order = resolveOrder(prefs.section_order).filter((k) => !prefs.hidden_sections.includes(k));
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:p-0">
      <div className="dc-noprint mb-4 flex items-center gap-2">
        <button className="dc-btn dc-btn-primary" onClick={() => window.print()}>
          <Printer size={15} /> Print or save as PDF
        </button>
        <span className="text-xs" style={{ color: "var(--dc-muted)" }}>
          In the print dialog, choose “Save as PDF” to keep a copy.
        </span>
      </div>
      <header className="mb-4 flex items-end gap-4">
        <h1 className="dc-serif text-3xl">{formatLong(date)}</h1>
        <p className="dc-hand text-xl" style={{ color: "var(--dc-muted)" }}>
          {prefs.tagline}
        </p>
        <p className="ml-auto text-sm" style={{ color: "var(--dc-muted)" }}>
          {p.completedPlanned}/{p.planned} done · {prefs.timezone}
        </p>
      </header>
      <div className="columns-2 gap-4 [&>*]:mb-4">{order.map((k) => renderSection(k, date))}</div>
    </div>
  );
}
