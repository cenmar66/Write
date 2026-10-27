"use client";

import { GitMerge } from "lucide-react";
import { useMemo, useState } from "react";
import { useCanvas } from "./provider";
import { Sheet } from "./sheet";

const NAMES: Record<string, string> = {
  canvas_notes: "Notes",
  canvas_tasks: "a task",
  canvas_ideas: "an idea",
  canvas_journal: "a good thing",
  canvas_appointments: "an appointment",
  canvas_meals: "a meal",
  canvas_exercise: "exercise",
  canvas_day_meta: "a day reflection",
  canvas_recurrences: "a repeating task",
};

const show = (v: unknown) => (v === null || v === undefined ? "(empty)" : typeof v === "string" ? v : JSON.stringify(v, null, 1));

/** Edits made on two devices at once are never silently overwritten: the person picks. */
export function ConflictBanner() {
  const { store, rev } = useCanvas();
  const list = useMemo(() => store.conflicts(), [store, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <>
      <div className="dc-noprint flex items-center gap-2 px-4 py-2 text-sm" style={{ background: "#fbf0dc", color: "#6b4a12" }} role="alert">
        <GitMerge size={16} />
        {list.length === 1 ? "One edit was changed on another device too." : `${list.length} edits were changed on another device too.`}
        <button className="ml-auto font-semibold underline" onClick={() => setOpen(true)}>
          Review
        </button>
      </div>
      {open && (
        <Sheet title="Choose which version to keep" onClose={() => setOpen(false)} wide>
          <ul className="space-y-5">
            {list.map((c) => (
              <li key={c.key} className="space-y-2">
                <p className="text-sm" style={{ color: "var(--dc-muted)" }}>
                  {c.field === "_record" ? "Couldn't save" : "Changed in two places"}: {NAMES[c.table] ?? c.table}
                  {c.field !== "_record" && ` (${c.field})`}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg p-3 text-sm" style={{ background: "var(--dc-paper-2)" }}>
                    <p className="mb-1 text-xs font-semibold">This device</p>
                    <pre className="whitespace-pre-wrap font-[inherit]">{show(c.mine)}</pre>
                  </div>
                  <div className="rounded-lg p-3 text-sm" style={{ background: "var(--dc-paper-2)" }}>
                    <p className="mb-1 text-xs font-semibold">Other device</p>
                    <pre className="whitespace-pre-wrap font-[inherit]">{show(c.server)}</pre>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="dc-btn" onClick={() => store.resolveConflict(c.key, "mine")}>
                    Keep this device&apos;s
                  </button>
                  <button className="dc-btn" onClick={() => store.resolveConflict(c.key, "server")}>
                    Keep the other
                  </button>
                  {typeof c.mine === "string" && (
                    <button className="dc-btn" onClick={() => store.resolveConflict(c.key, "both")}>
                      Keep both
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
