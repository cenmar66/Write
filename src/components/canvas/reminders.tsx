"use client";

// Gentle reminders, off by default. These are *in-app* reminders: they fire while The
// Daily Canvas is open (in a tab or as an installed app, even in the background on
// desktop browsers). True background push when the app is closed needs Web Push with
// a push server, which this version does not include (see INTEGRATIONS.md).
// Private journal text is never put in a notification.

import { useEffect } from "react";
import { localTimeOf } from "@/lib/canvas/dates";
import { useCanvas } from "./provider";

function inQuiet(now: string, start?: string, end?: string) {
  if (!start || !end) return false;
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

function minus(hhmm: string, min: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h * 60 + m - min + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

async function notify(title: string, body: string, tag: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/canvas");
    if (reg) await reg.showNotification(title, { body, tag, icon: "/canvas-icons/icon-192.png", badge: "/canvas-icons/icon-192.png" });
    else new Notification(title, { body, tag });
  } catch {
    /* not supported here */
  }
}

export function Reminders() {
  const { prefs, planner, store, today } = useCanvas();
  const r = prefs.reminders;
  useEffect(() => {
    if (!r.enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const sent = new Set<string>(JSON.parse(sessionStorage.getItem("dc-sent") ?? "[]"));
    const once = (key: string, f: () => void) => {
      if (sent.has(key)) return;
      sent.add(key);
      sessionStorage.setItem("dc-sent", JSON.stringify([...sent].slice(-200)));
      f();
    };
    const check = () => {
      const now = localTimeOf(new Date(), prefs.timezone);
      if (inQuiet(now, r.quietStart, r.quietEnd)) return;
      const lead = r.leadMinutes ?? 10;
      if (r.appointments !== false) {
        for (const a of store.all("canvas_appointments")) {
          if (a.date === today && a.start_time && minus(a.start_time, lead) === now) once(`a:${a.id}`, () => void notify("Coming up", `${a.title} at ${a.start_time}`, `a-${a.id}`));
        }
        for (const e of store.externalEvents(today)) {
          if (e.allDay) continue;
          const t = localTimeOf(e.start, prefs.timezone);
          if (minus(t, lead) === now) once(`e:${e.key}`, () => void notify("Coming up", `${e.title} at ${t}`, `e-${e.key}`));
        }
      }
      if (r.scheduledTasks !== false) {
        for (const p of planner.placementsOn(today)) {
          const t = store.get("canvas_tasks", p.task_id);
          if (t && t.status === "open" && t.scheduled_time && minus(t.scheduled_time, lead) === now)
            once(`t:${t.id}:${today}`, () => void notify(p.section === "must" ? "Priority coming up" : "Task coming up", t.title, `t-${t.id}`));
        }
      }
      if (r.hydration && ["10:00", "12:00", "14:00", "16:00", "18:00"].includes(now)) {
        const w = planner.water(today);
        const hour = Number(now.slice(0, 2));
        const expected = Math.round(((hour - 8) / 12) * prefs.water_target);
        if ((w?.glasses ?? 0) < expected) once(`w:${today}:${now}`, () => void notify("A glass of water?", `${w?.glasses ?? 0} of ${prefs.water_target} so far today.`, "water"));
      }
      if (r.evening && now === (r.eveningTime ?? "20:30")) once(`ev:${today}`, () => void notify("Evening wrap-up", "A minute to look back on today.", "evening"));
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, [r, prefs.timezone, prefs.water_target, planner, store, today]);
  return null;
}
