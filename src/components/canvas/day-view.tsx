"use client";

import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Moon, PenTool, Plus, Search, LayoutList, LayoutGrid, Printer } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef } from "react";
import { addDays, formatLong, formatShort } from "@/lib/canvas/dates";
import { resolveOrder, SECTION_BY_KEY } from "@/lib/canvas/sections";
import { buildIndex, dayStats } from "@/lib/canvas/stats";
import type { ISODate, SectionKey, TaskSection } from "@/lib/canvas/types";
import { SECTION_ICONS, Sprig } from "./icons";
import { InkLayer } from "./ink";
import { Ring } from "./progress";
import { useCanvas, type View } from "./provider";
import { useLocalFlag, useSectionColor } from "./section-card";
import { AppointmentsCard, ExerciseCard, IdeasCard, JournalCard, MealsCard, NotesCard, TaskSectionCard, WaterCard } from "./sections";
import { MonthView, WeekView } from "./calendar-views";
import { WrapUp } from "./wrap-up";
import { useMedia } from "./use-dark";
import { useState } from "react";

export function renderSection(key: SectionKey, date: ISODate) {
  switch (key) {
    case "must":
    case "work":
    case "personal":
    case "comms":
    case "shopping":
      return <TaskSectionCard key={key} sectionKey={key as TaskSection} date={date} />;
    case "appointments":
      return <AppointmentsCard key={key} date={date} />;
    case "journal":
      return <JournalCard key={key} date={date} />;
    case "exercise":
      return <ExerciseCard key={key} date={date} />;
    case "meals":
      return <MealsCard key={key} date={date} />;
    case "water":
      return <WaterCard key={key} date={date} />;
    case "ideas":
      return <IdeasCard key={key} date={date} />;
    case "notes":
      return <NotesCard key={`${key}-${date}`} date={date} />;
  }
}

export function useDayProgress(date: ISODate) {
  const { store, rev } = useCanvas();
  return useMemo(() => {
    const ix = buildIndex({ tasks: store.all("canvas_tasks"), placements: store.all("canvas_task_placements") });
    return dayStats(ix, date);
  }, [store, date, rev]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function PlannerHeader() {
  const { date, setDate, today, view, setView, pencil, setPencil, setCaptureOpen, prefs } = useCanvas();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [wrap, setWrap] = useState(false);
  const step = view === "day" ? 1 : view === "week" ? 7 : 0;
  const go = (dir: -1 | 1) => {
    if (view === "month") {
      const d = new Date(date + "T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + dir, 1);
      setDate(d.toISOString().slice(0, 10));
    } else setDate(addDays(date, dir * step));
  };
  return (
    <div className="dc-noprint sticky top-0 z-30 border-b px-3 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] md:px-6" style={{ background: "color-mix(in srgb, var(--dc-desk) 92%, transparent)", borderColor: "var(--dc-line)", backdropFilter: "blur(8px)" }}>
      <div className="flex items-center gap-1">
        <Link href="/canvas" className="mr-auto flex items-center gap-1 md:hidden" onClick={() => (setView("day"), setDate(today))}>
          <span className="dc-serif text-lg">The Daily Canvas</span>
          <Sprig size={17} className="text-[#6f8f6f]" />
        </Link>
        <div className="dc-seg mr-auto hidden md:inline-flex" role="group" aria-label="View">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <Link href="/canvas/search" className="dc-icon-btn hidden sm:inline-flex" aria-label="Search">
          <Search size={18} />
        </Link>
        <span className="relative">
          <button className="dc-icon-btn" aria-label="Pick a date" onClick={() => pickerRef.current?.showPicker?.() ?? pickerRef.current?.focus()}>
            <CalendarDays size={18} />
          </button>
          <input ref={pickerRef} type="date" className="pointer-events-none absolute inset-0 opacity-0" tabIndex={-1} aria-hidden value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </span>
        <button className="dc-btn hidden min-h-0 px-3 py-1 text-sm sm:inline-flex" onClick={() => setDate(today)} disabled={date === today && view === "day"}>
          Today
        </button>
        <button className="dc-icon-btn" aria-label={`Previous ${view}`} onClick={() => go(-1)}>
          <ChevronLeft size={19} />
        </button>
        <button className="dc-icon-btn" aria-label={`Next ${view}`} onClick={() => go(1)}>
          <ChevronRight size={19} />
        </button>
        {view === "day" && (
          <>
            <button className="dc-icon-btn" aria-label="Pencil mode (handwriting)" aria-pressed={pencil} title="Pencil mode — write with Apple Pencil" onClick={() => setPencil(!pencil)}>
              <PenTool size={17} />
            </button>
            <button className="dc-icon-btn hidden sm:inline-flex" aria-label="Evening wrap-up" title="Evening wrap-up" onClick={() => setWrap(true)}>
              <Moon size={17} />
            </button>
            <Link className="dc-icon-btn hidden lg:inline-flex" aria-label="Print this day" href={`/canvas/print?date=${date}`}>
              <Printer size={17} />
            </Link>
          </>
        )}
        <button className="dc-icon-btn hidden md:inline-flex" aria-label="Quick add (N)" title="Quick add (N)" style={{ border: "1px solid var(--dc-line)" }} onClick={() => setCaptureOpen(true)}>
          <Plus size={18} />
        </button>
      </div>
      <div className="mt-2 md:hidden">
        <div className="dc-seg w-full justify-between" role="group" aria-label="View">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button key={v} className="flex-1" aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {wrap && <WrapUp date={date} onClose={() => setWrap(false)} />}
      <span className="hidden">{prefs.tagline}</span>
    </div>
  );
}

export function PlannerPage() {
  const { view } = useCanvas();
  return (
    <>
      <PlannerHeader />
      {view === "day" ? <DayView /> : view === "week" ? <WeekView /> : <MonthView />}
    </>
  );
}

function DayView() {
  const { date, today, setDate, prefs, focus, setFocus } = useCanvas();
  const progress = useDayProgress(date);
  const order = resolveOrder(prefs.section_order).filter((k) => !prefs.hidden_sections.includes(k));
  const phone = !useMedia("(min-width: 768px)", true);
  const wide = useMedia("(min-width: 1440px)");
  const [phoneCards, setPhoneCards] = useLocalFlag("dc-phone-cards");

  const title = (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
      <h1 className="dc-serif text-[1.65rem] leading-tight md:text-[2rem]">{formatLong(date)}</h1>
      <p className="dc-hand pb-1 text-xl md:text-2xl" style={{ color: "var(--dc-muted)", transform: "rotate(-2deg)" }}>
        {prefs.tagline}
      </p>
      <div className="ml-auto flex items-center gap-2 pb-1 text-sm" style={{ color: "var(--dc-muted)" }}>
        <Ring value={progress.completionRate} size={34} stroke={3.5} label={`${progress.completedPlanned} of ${progress.planned} tasks done`} />
        <span>{progress.planned ? `${progress.completedPlanned} of ${progress.planned} done` : "Nothing planned yet"}</span>
      </div>
    </div>
  );

  const banner =
    date !== today ? (
      <div className="dc-noprint mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--dc-paper-2)", color: "var(--dc-muted)" }}>
        {date < today ? `A past page — ${formatShort(date)}. Edits are kept in its history.` : `Planning ahead for ${formatShort(date)}.`}
        <button className="ml-auto font-semibold underline" onClick={() => setDate(today)}>
          Back to today
        </button>
      </div>
    ) : null;

  if (focus) {
    return (
      <div className="mx-auto max-w-3xl px-3 py-4 md:px-6">
        <button className="dc-btn mb-3" onClick={() => setFocus(null)}>
          <ArrowLeft size={15} /> {phone ? "All sections" : "Exit focus"}
        </button>
        {banner}
        {renderSection(focus, date)}
      </div>
    );
  }

  if (phone && !phoneCards) {
    return (
      <div className="px-3 py-3">
        <h1 className="dc-serif text-center text-xl">{formatLong(date).replace(/^\w+, /, "")}</h1>
        <p className="dc-hand mb-3 text-center text-lg" style={{ color: "var(--dc-muted)" }}>
          {prefs.tagline}
        </p>
        {banner}
        <ul className="space-y-2" aria-label="Sections">
          {order.map((k) => (
            <PhoneRow key={k} sectionKey={k} date={date} onOpen={() => setFocus(k)} />
          ))}
        </ul>
        <button className="dc-btn mt-4 w-full" onClick={() => setPhoneCards(true)}>
          <LayoutGrid size={15} /> Show every section on one page
        </button>
      </div>
    );
  }

  const half = Math.ceil(order.length / 2);
  return (
    <div className="px-3 py-4 md:px-6">
      <div className="mb-4">{title}</div>
      {banner}
      {phone && (
        <button className="dc-btn mb-3 w-full" onClick={() => setPhoneCards(false)}>
          <LayoutList size={15} /> Section list
        </button>
      )}
      <div className="relative">
        {wide ? (
          // Desktop: an open notebook — two pages with a spine.
          <div className="flex items-stretch">
            <div className="dc-sheet flex-1 rounded-l-xl rounded-r-sm p-4">
              <div className="columns-2 gap-4 [&>*]:mb-4">{order.slice(0, half).map((k) => renderSection(k, date))}</div>
            </div>
            <div className="dc-spine" aria-hidden />
            <div className="dc-sheet flex-1 rounded-l-sm rounded-r-xl p-4">
              <div className="columns-2 gap-4 [&>*]:mb-4">{order.slice(half).map((k) => renderSection(k, date))}</div>
            </div>
          </div>
        ) : (
          <div className="dc-sheet rounded-xl p-3 md:p-4">
            <div className="columns-1 gap-4 md:columns-2 lg:columns-3 xl:columns-4 [&>*]:mb-4">{order.map((k) => renderSection(k, date))}</div>
          </div>
        )}
        <InkLayer date={date} zone="page" />
      </div>
    </div>
  );
}

function PhoneRow({ sectionKey, date, onOpen }: { sectionKey: SectionKey; date: ISODate; onOpen: () => void }) {
  const { planner, store, rev } = useCanvas();
  const { base, head } = useSectionColor(sectionKey);
  const Icon = SECTION_ICONS[sectionKey];
  const summary = useMemo(() => {
    const def = SECTION_BY_KEY[sectionKey];
    if (def.taskSection) {
      const items = planner.tasksFor(date, def.taskSection);
      return items.length ? `${items.filter((i) => i.task.status === "done").length}/${items.length}` : "";
    }
    switch (sectionKey) {
      case "appointments": {
        const n = store.all("canvas_appointments").filter((a) => a.date === date).length + store.externalEvents(date).length;
        return n ? `${n} event${n > 1 ? "s" : ""}` : "";
      }
      case "journal":
        return String(store.all("canvas_journal").filter((j) => j.date === date).length || "");
      case "exercise": {
        const m = store.all("canvas_exercise").filter((e) => e.date === date).reduce((s, e) => s + (e.duration_min ?? 0), 0);
        return m ? `${m} min` : "";
      }
      case "meals": {
        const c = store.all("canvas_meals").filter((e) => e.date === date).reduce((s, e) => s + (e.calories ?? 0), 0);
        return c ? c.toLocaleString() : "";
      }
      case "water": {
        const w = planner.water(date);
        return `${w?.glasses ?? 0}/${w?.target ?? planner.prefs().water_target}`;
      }
      case "ideas":
        return String(store.all("canvas_ideas").filter((i) => i.date === date).length || "");
      default:
        return "";
    }
  }, [sectionKey, date, planner, store, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <li>
      <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left" style={{ background: `color-mix(in srgb, ${base} 16%, var(--dc-paper))`, border: "1px solid var(--dc-line)" }} onClick={onOpen}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: head.bg, color: head.fg }}>
          <Icon size={17} />
        </span>
        <span className="flex-1 text-[0.95rem] font-medium">{SECTION_BY_KEY[sectionKey].title}</span>
        <span className="text-sm tabular-nums" style={{ color: "var(--dc-muted)" }}>
          {summary}
        </span>
        <ChevronRight size={17} style={{ color: "var(--dc-faint)" }} />
      </button>
    </li>
  );
}
