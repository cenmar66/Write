"use client";

import { Inbox, Pin, Search as SearchIcon, CalendarArrowUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatShort } from "@/lib/canvas/dates";
import { TASK_SECTION_TITLES } from "@/lib/canvas/sections";
import type { ISODate, TaskSection } from "@/lib/canvas/types";
import { useCanvas } from "./provider";
import { Checkbox, useCompleteTask } from "./tasks";

function useOpenDay() {
  const { setDate, setView, setFocus } = useCanvas();
  const router = useRouter();
  return (d: ISODate) => {
    setDate(d);
    setView("day");
    setFocus(null);
    router.push("/canvas");
  };
}

// ---- Notes & ideas -------------------------------------------------------------------------
export function NotesArchive() {
  const { store, rev } = useCanvas();
  const open = useOpenDay();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [tab, setTab] = useState<"ideas" | "notes" | "good">("ideas");
  const ideas = useMemo(() => store.all("canvas_ideas").filter((i) => i.body.trim()), [store, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const tags = useMemo(() => [...new Set(ideas.flatMap((i) => i.tags))].sort(), [ideas]);
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());
  const list = useMemo(() => {
    if (tab === "ideas")
      return ideas
        .filter((i) => match(i.body) && (!tag || i.tags.includes(tag)))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))
        .map((i) => ({ id: i.id, date: i.date, body: i.body, pinned: i.pinned, tags: i.tags }));
    if (tab === "notes")
      return store
        .all("canvas_notes")
        .filter((n) => n.body.trim() && match(n.body))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((n) => ({ id: n.id, date: n.date, body: n.body, pinned: false, tags: [] as string[] }));
    return store
      .all("canvas_journal")
      .filter((j) => j.body.trim() && match(j.body))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((j) => ({ id: j.id, date: j.date, body: j.body, pinned: false, tags: [] as string[] }));
  }, [tab, ideas, store, rev, q, tag]); // eslint-disable-line react-hooks/exhaustive-deps

  // A gentle look back: a different good moment each day.
  const { today } = useCanvas();
  const memory = useMemo(() => {
    const old = store.all("canvas_journal").filter((j) => j.body.trim() && j.date < today).sort((a, b) => a.id.localeCompare(b.id));
    return old.length ? old[Number(today.replace(/-/g, "")) % old.length] : null;
  }, [store, rev, today]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 md:px-6">
      <h1 className="dc-serif mb-4 text-3xl">Notes &amp; ideas</h1>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="dc-seg" role="group" aria-label="Show">
          {(
            [
              ["ideas", "Big ideas"],
              ["notes", "Daily notes"],
              ["good", "Good things"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="relative ml-auto min-w-48 flex-1 sm:flex-none">
          <SearchIcon size={15} className="absolute left-2.5 top-2.5" style={{ color: "var(--dc-faint)" }} />
          <input className="dc-field py-1.5 pl-8" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes and ideas" />
        </label>
      </div>
      {tab === "ideas" && tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {tags.map((t) => (
            <button key={t} className="dc-chip" aria-pressed={tag === t} style={tag === t ? { background: "var(--dc-ink)", color: "var(--dc-paper)" } : undefined} onClick={() => setTag(tag === t ? null : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}
      {tab === "good" && memory && (
        <div className="dc-card mb-4 p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--dc-muted)" }}>
            A good moment from {formatShort(memory.date)}
          </p>
          <p className="dc-hand mt-1 text-2xl">{memory.body}</p>
        </div>
      )}
      <ul className="space-y-2">
        {list.map((x) => (
          <li key={x.id} className="dc-card p-3">
            <div className="mb-1 flex items-center gap-2 text-xs" style={{ color: "var(--dc-muted)" }}>
              {x.pinned && <Pin size={12} fill="currentColor" />}
              <button className="underline-offset-2 hover:underline" onClick={() => open(x.date)}>
                {formatShort(x.date)}
              </button>
              {x.tags.map((t) => (
                <span key={t} className="dc-chip">
                  #{t}
                </span>
              ))}
            </div>
            <p className={`whitespace-pre-wrap ${tab === "ideas" ? "dc-hand text-xl" : "text-sm"}`}>{x.body}</p>
          </li>
        ))}
        {!list.length && <li style={{ color: "var(--dc-faint)" }}>Nothing here yet.</li>}
      </ul>
    </div>
  );
}

// ---- Lists & backlog -------------------------------------------------------------------------
export function Lists() {
  const { planner, store, rev, today, toast } = useCanvas();
  const complete = useCompleteTask();
  const open = useOpenDay();
  const backlog = useMemo(() => planner.backlog(), [planner, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of store.all("canvas_task_placements")) if (!p.removed && (!m.get(p.task_id) || p.date > m.get(p.task_id)!)) m.set(p.task_id, p.date);
    return m;
  }, [store, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const openTasks = useMemo(
    () =>
      store
        .all("canvas_tasks")
        .filter((t) => t.status === "open" && !t.parent_id && !t.backlog)
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.origin_date.localeCompare(b.origin_date)),
    [store, rev], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const archived = useMemo(() => store.all("canvas_tasks").filter((t) => t.status === "archived"), [store, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newItem, setNewItem] = useState("");
  const [section, setSection] = useState<TaskSection>("personal");

  const group = (s: TaskSection) => openTasks.filter((t) => t.section === s);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-3 py-4 md:px-6">
      <h1 className="dc-serif text-3xl">Lists</h1>

      <section className="dc-card">
        <h2 className="flex items-center gap-2 px-4 pt-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dc-muted)" }}>
          <Inbox size={14} /> Backlog — not on any day
        </h2>
        <p className="px-4 pb-2 text-xs" style={{ color: "var(--dc-faint)" }}>
          Things you want to keep without seeing them every day. They don&apos;t roll forward.
        </p>
        <ul className="dc-ruled">
          {backlog.map((t) => (
            <li key={t.id} className="flex items-center gap-2 pl-4 pr-2">
              <Checkbox checked={false} onToggle={() => complete(t)} label={t.title} />
              <span className="flex-1 text-sm">{t.title}</span>
              <span className="dc-chip">{TASK_SECTION_TITLES[t.section]}</span>
              <button
                className="dc-btn min-h-0 px-2.5 py-1 text-xs"
                onClick={() => {
                  planner.reschedule(t, null, today);
                  toast("Added to today");
                }}
              >
                <CalendarArrowUp size={13} /> Today
              </button>
              <button className="dc-icon-btn sm" aria-label={`Delete ${t.title}`} onClick={() => planner.deleteTask(t)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
          <li className="flex items-center gap-2 pl-4 pr-2">
            <input
              className="dc-input text-sm"
              placeholder="Add to the backlog…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItem.trim()) {
                  planner.addTask(today, section, newItem, { backlog: true });
                  setNewItem("");
                }
              }}
            />
            <select className="dc-input w-auto text-xs" value={section} onChange={(e) => setSection(e.target.value as TaskSection)} aria-label="Section">
              {(Object.keys(TASK_SECTION_TITLES) as TaskSection[]).map((s) => (
                <option key={s} value={s}>
                  {TASK_SECTION_TITLES[s]}
                </option>
              ))}
            </select>
          </li>
        </ul>
      </section>

      {(["must", "work", "personal", "comms", "shopping"] as TaskSection[]).map((s) =>
        group(s).length ? (
          <section key={s} className="dc-card">
            <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dc-muted)" }}>
              Open · {TASK_SECTION_TITLES[s]}
            </h2>
            <ul className="dc-ruled">
              {group(s).map((t) => (
                <li key={t.id} className="flex items-center gap-2 pl-4 pr-2">
                  <Checkbox checked={false} onToggle={() => complete(t)} label={t.title} />
                  <span className="flex-1 text-sm">{t.title}</span>
                  {t.due_date && <span className="dc-chip" style={t.due_date < today ? { color: "#a3392f" } : undefined}>Due {formatShort(t.due_date)}</span>}
                  {latest.get(t.id) && (
                    <button className="dc-chip" onClick={() => open(latest.get(t.id)!)}>
                      on {formatShort(latest.get(t.id)!)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {archived.length > 0 && (
        <details className="dc-card p-4">
          <summary className="cursor-pointer text-sm" style={{ color: "var(--dc-muted)" }}>
            Archived ({archived.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {archived.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="flex-1">{t.title}</span>
                <button className="text-xs underline" onClick={() => planner.updateTask(t.id, { status: "open", backlog: true })}>
                  Restore to backlog
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ---- Search ---------------------------------------------------------------------------------
type Kind = "task" | "idea" | "good" | "note" | "appointment" | "exercise" | "meal" | "reflection";
interface Hit {
  id: string;
  kind: Kind;
  date: ISODate;
  text: string;
  sub?: string;
  status?: "open" | "done" | "archived";
  section?: TaskSection;
}

export function SearchPage() {
  const { store, rev, planner } = useCanvas();
  const open = useOpenDay();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Kind>("all");
  const [section, setSection] = useState<"all" | TaskSection>("all");
  const [status, setStatus] = useState<"all" | "open" | "done">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const all = useMemo<Hit[]>(() => {
    const latest = new Map<string, string>();
    for (const p of store.all("canvas_task_placements")) if (!latest.get(p.task_id) || p.date > latest.get(p.task_id)!) latest.set(p.task_id, p.date);
    const hits: Hit[] = [];
    for (const t of store.all("canvas_tasks"))
      hits.push({
        id: t.id,
        kind: "task",
        date: t.completed_on ?? latest.get(t.id) ?? t.origin_date,
        text: [t.title, t.notes, t.label, t.contact_name, t.contact_info].filter(Boolean).join(" · "),
        sub: t.status === "done" ? `Completed ${t.completed_on ? formatShort(t.completed_on) : ""}` : `First planned ${formatShort(t.origin_date)}`,
        status: t.status,
        section: t.section,
      });
    for (const i of store.all("canvas_ideas")) hits.push({ id: i.id, kind: "idea", date: i.date, text: i.body, sub: i.tags.map((x) => "#" + x).join(" ") });
    for (const j of store.all("canvas_journal")) hits.push({ id: j.id, kind: "good", date: j.date, text: j.body });
    for (const n of store.all("canvas_notes")) if (n.body.trim()) hits.push({ id: n.id, kind: "note", date: n.date, text: n.body });
    for (const a of store.all("canvas_appointments")) hits.push({ id: a.id, kind: "appointment", date: a.date, text: [a.title, a.location, a.notes].filter(Boolean).join(" · "), sub: a.start_time ?? undefined });
    for (const e of store.all("canvas_exercise")) hits.push({ id: e.id, kind: "exercise", date: e.date, text: [e.activity, e.notes].filter(Boolean).join(" · "), sub: e.duration_min ? `${e.duration_min} min` : undefined });
    for (const m of store.all("canvas_meals")) if (m.description.trim()) hits.push({ id: m.id, kind: "meal", date: m.date, text: m.description, sub: m.slot });
    for (const d of store.all("canvas_day_meta")) if (d.reflection.trim()) hits.push({ id: d.id, kind: "reflection", date: d.date, text: d.reflection });
    return hits;
  }, [store, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  void planner;

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = all
    .filter(
      (h) =>
        (kind === "all" || h.kind === kind) &&
        (section === "all" || h.section === section) &&
        (status === "all" || h.status === status) &&
        (!from || h.date >= from) &&
        (!to || h.date <= to) &&
        words.every((w) => h.text.toLowerCase().includes(w)),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 200);
  const active = words.length || kind !== "all" || section !== "all" || status !== "all" || from || to;

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 md:px-6">
      <h1 className="dc-serif mb-4 text-3xl">Search</h1>
      <label className="relative block">
        <SearchIcon size={17} className="absolute left-3 top-3.5" style={{ color: "var(--dc-faint)" }} />
        <input autoFocus className="dc-field py-3 pl-10 text-base" placeholder="Search everything you've written…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select className="dc-field py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind">
          <option value="all">Everything</option>
          <option value="task">Tasks</option>
          <option value="appointment">Appointments</option>
          <option value="idea">Big ideas</option>
          <option value="good">Good things</option>
          <option value="note">Notes</option>
          <option value="exercise">Exercise</option>
          <option value="meal">Meals</option>
          <option value="reflection">Reflections</option>
        </select>
        <select className="dc-field py-1.5 text-sm" value={section} onChange={(e) => setSection(e.target.value as typeof section)} aria-label="Section">
          <option value="all">Any section</option>
          {(Object.keys(TASK_SECTION_TITLES) as TaskSection[]).map((s) => (
            <option key={s} value={s}>
              {TASK_SECTION_TITLES[s]}
            </option>
          ))}
        </select>
        <select className="dc-field py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="all">Any status</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
        </select>
        <input type="date" className="dc-field py-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
        <input type="date" className="dc-field py-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </div>
      {active ? (
        <ul className="mt-4 space-y-1" aria-live="polite">
          <li className="text-xs" style={{ color: "var(--dc-muted)" }}>
            {results.length} result{results.length === 1 ? "" : "s"}
          </li>
          {results.map((h) => (
            <li key={h.kind + h.id}>
              <button className="dc-card w-full p-3 text-left hover:opacity-90" onClick={() => open(h.date)}>
                <span className="mb-0.5 flex items-center gap-2 text-xs" style={{ color: "var(--dc-muted)" }}>
                  <span>{formatShort(h.date)}</span>
                  <span className="dc-chip">{h.kind === "task" && h.section ? TASK_SECTION_TITLES[h.section] : h.kind}</span>
                  {h.status === "done" && <span className="dc-chip">done</span>}
                  {h.sub && <span>{h.sub}</span>}
                </span>
                <span className="line-clamp-2 text-sm">{h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm" style={{ color: "var(--dc-faint)" }}>
          Try “proposal”, or filter to Done tasks last month to see what you accomplished.
        </p>
      )}
    </div>
  );
}
