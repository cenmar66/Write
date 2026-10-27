"use client";

// Fast capture: type or speak one line; we suggest where it goes; nothing is saved
// until "Save". Unrecognised text is offered as a plain task, never thrown away.

import { Mic, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatShort, formatTime } from "@/lib/canvas/dates";
import { interpret, type Capture, type CaptureKind } from "@/lib/canvas/parse";
import { TASK_SECTION_TITLES } from "@/lib/canvas/sections";
import type { TaskSection } from "@/lib/canvas/types";
import { useSpeech } from "./dictation";
import { createGoogleEvent, useGoogleStatus } from "./google-client";
import { useCanvas } from "./provider";
import { Field, Sheet } from "./sheet";

const KINDS: { kind: CaptureKind; label: string }[] = [
  { kind: "task", label: "Task" },
  { kind: "appointment", label: "Appointment" },
  { kind: "idea", label: "Big idea" },
  { kind: "journal", label: "Good thing" },
  { kind: "note", label: "Note" },
  { kind: "exercise", label: "Exercise" },
  { kind: "water", label: "Water" },
];

export function QuickCapture({ onClose, startListening = false }: { onClose: () => void; startListening?: boolean }) {
  const { planner, date, today, prefs, toast, setDate } = useCanvas();
  const google = useGoogleStatus();
  const speech = useSpeech(prefs.dictation_lang);
  const [text, setText] = useState("");
  const [override, setOverride] = useState<Partial<Capture>>({});
  const [toGoogle, setToGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const base = date >= today ? date : today;

  const parsed = useMemo(() => interpret(text, { today: base, defaultSection: "personal" }), [text, base]);
  const c: Capture = { ...parsed, ...override };

  useEffect(() => {
    if (startListening) void speech.start();
    else inputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live transcript flows into the box; it stays editable.
  const liveText = speech.status === "listening" ? [speech.text, speech.interim].filter(Boolean).join(" ") : null;

  const stopListening = async () => {
    const t = await speech.stop();
    if (t) setText((cur) => (cur ? cur + " " : "") + t);
  };

  const save = async () => {
    if (speech.status === "listening") await stopListening();
    const title = (c.title || c.transcript).trim();
    if (!title && c.kind !== "water") return;
    const day = c.date ?? base;
    setBusy(true);
    try {
      switch (c.kind) {
        case "task": {
          const section = (c.section ?? "personal") as TaskSection;
          planner.addTask(day, section, title, {
            scheduled_time: c.time ?? null,
            contact_name: c.contactName ?? null,
            follow_up_date: section === "comms" && c.date ? c.date : null,
            quantity: c.quantity ?? null,
            source: "capture",
          });
          toast(`Added to ${TASK_SECTION_TITLES[section]}${day !== date ? ` on ${formatShort(day)}` : ""}`, day !== date ? { label: "Go", run: () => setDate(day) } : undefined);
          break;
        }
        case "appointment":
          if (toGoogle && google.connected && c.time) {
            await createGoogleEvent({ title, date: day, start: c.time, end: null, location: null, notes: "", timeZone: prefs.timezone });
            toast("Added to Google Calendar");
          } else {
            planner.addAppointment({ date: day, title, start_time: c.time ?? null });
            toast(`Appointment on ${formatShort(day)}${c.time ? ` at ${formatTime(c.time)}` : ""}`);
          }
          break;
        case "idea":
          planner.addIdea(day, title);
          toast("Saved to Big Ideas");
          break;
        case "journal":
          planner.addJournal(day, title);
          toast("Saved to Good Things");
          break;
        case "note":
          planner.appendNote(day, title);
          toast("Added to Notes");
          break;
        case "exercise":
          planner.addExercise(day, title, c.durationMin ?? null);
          toast("Exercise logged");
          break;
        case "water": {
          const cur = planner.water(day)?.glasses ?? 0;
          planner.setWater(day, cur + (c.glasses ?? 1));
          toast(`${c.glasses ?? 1} glass${(c.glasses ?? 1) > 1 ? "es" : ""} of water`);
          break;
        }
      }
      onClose();
    } catch (e) {
      // Keep the text so nothing is lost.
      toast(e instanceof Error ? e.message : "Couldn't save that. Your text is still here.");
    } finally {
      setBusy(false);
    }
  };

  const listening = speech.status === "listening";

  return (
    <Sheet
      title="Quick add"
      onClose={() => (speech.cancel(), onClose())}
      footer={
        <>
          <span className="text-xs" style={{ color: "var(--dc-faint)" }}>
            {c.confidence === "low" && text.trim() ? "Not sure where this goes — check below." : "Enter to save · Shift+Enter for a new line"}
          </span>
          <button className="dc-btn dc-btn-primary ml-auto" disabled={busy || (!text.trim() && !liveText)} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <textarea
            ref={inputRef}
            className="dc-field min-h-24 pr-14 text-base"
            placeholder={'Try: "Call John tomorrow morning about the proposal"'}
            value={liveText ?? text}
            readOnly={listening}
            aria-label="What do you want to add?"
            onChange={(e) => {
              setText(e.target.value);
              setOverride({});
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void save();
              }
            }}
          />
          <button
            className={`absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full ${listening ? "dc-mic-live" : ""}`}
            style={{ background: listening ? "#b83a3a" : "var(--dc-ink)", color: "var(--dc-paper)" }}
            aria-label={listening ? "Stop dictation" : "Dictate"}
            aria-pressed={listening}
            onClick={() => (listening ? stopListening() : speech.start())}
          >
            {listening ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}
          </button>
        </div>
        {speech.error && (
          <p className="text-sm" style={{ color: "#a33" }}>
            {speech.error}
          </p>
        )}

        {(text.trim() || liveText) && (
          <div className="space-y-3 rounded-xl p-3" style={{ background: "var(--dc-paper-2)" }}>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  role="radio"
                  aria-checked={c.kind === k.kind}
                  className="rounded-full px-3 py-1 text-xs"
                  style={{ background: c.kind === k.kind ? "var(--dc-ink)" : "var(--dc-paper)", color: c.kind === k.kind ? "var(--dc-paper)" : "var(--dc-muted)", border: "1px solid var(--dc-line)" }}
                  onClick={() => setOverride({ ...override, kind: k.kind, section: k.kind === "task" ? c.section ?? "personal" : undefined })}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Field label="Text">
                  <input className="dc-field" value={c.title} onChange={(e) => setOverride({ ...override, title: e.target.value })} />
                </Field>
              </div>
              {c.kind === "task" && (
                <Field label="Section">
                  <select className="dc-field" value={c.section} onChange={(e) => setOverride({ ...override, section: e.target.value as TaskSection })}>
                    {(Object.keys(TASK_SECTION_TITLES) as TaskSection[]).map((s) => (
                      <option key={s} value={s}>
                        {TASK_SECTION_TITLES[s]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {c.kind !== "water" && (
                <Field label="Day">
                  <input type="date" className="dc-field" value={c.date ?? base} onChange={(e) => setOverride({ ...override, date: e.target.value })} />
                </Field>
              )}
              {(c.kind === "task" || c.kind === "appointment") && (
                <Field label="Time">
                  <input type="time" className="dc-field" value={c.time ?? ""} onChange={(e) => setOverride({ ...override, time: e.target.value || undefined })} />
                </Field>
              )}
              {c.kind === "exercise" && (
                <Field label="Minutes">
                  <input type="number" className="dc-field" value={c.durationMin ?? ""} onChange={(e) => setOverride({ ...override, durationMin: Number(e.target.value) || undefined })} />
                </Field>
              )}
              {c.kind === "water" && (
                <Field label="Glasses">
                  <input type="number" min={1} className="dc-field" value={c.glasses ?? 1} onChange={(e) => setOverride({ ...override, glasses: Number(e.target.value) || 1 })} />
                </Field>
              )}
            </div>
            {c.kind === "appointment" && google.connected && google.canWriteCalendar && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={toGoogle} onChange={(e) => setToGoogle(e.target.checked)} /> Also put it on my Google Calendar
              </label>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
