// Timezone-aware snooze presets and focus windows (pure).

function partsIn(tz: string, d: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: +g("year"), mo: +g("month"), d: +g("day"), h: +g("hour") % 24, mi: +g("minute"), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")) };
}

/** The UTC instant for a wall-clock time in a timezone. */
export function zonedTime(tz: string, y: number, mo: number, d: number, h: number, mi = 0): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const p = partsIn(tz, guess);
  const diff = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - guess.getTime();
  return new Date(guess.getTime() - diff);
}

export type SnoozePreset = "later_today" | "tomorrow" | "next_week" | "weekend";

export function snoozeUntil(preset: SnoozePreset, tz: string, now = new Date()): Date {
  const p = partsIn(tz, now);
  const at = (addDays: number, h: number) => {
    const base = new Date(Date.UTC(p.y, p.mo - 1, p.d + addDays));
    return zonedTime(tz, base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h);
  };
  switch (preset) {
    case "later_today": {
      const t = new Date(now.getTime() + 3 * 3_600_000);
      return p.h >= 18 ? at(1, 8) : t;
    }
    case "tomorrow":
      return at(1, 8);
    case "next_week":
      return at(((8 - p.wd) % 7) || 7, 8);
    case "weekend":
      return at(((6 - p.wd + 7) % 7) || 7, 9);
  }
}

/** Is "now" inside one of the user's protected focus windows? */
export function inFocus(focus: { enabled: boolean; windows: { days: number[]; start: string; end: string }[] }, tz: string, now = new Date()): boolean {
  if (!focus.enabled) return false;
  const p = partsIn(tz, now);
  const hm = `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
  return focus.windows.some((w) => w.days.includes(p.wd) && hm >= w.start && hm < w.end);
}

/** Should a new message notify the user right now? Focus mode affects only InboxPilot notifications. */
export function shouldNotify(m: { importance: string; vip: boolean; suppressed: boolean }, focus: Parameters<typeof inFocus>[0] & { allow_vip: boolean; allow_critical: boolean }, tz: string, now = new Date()) {
  if (m.suppressed) return false;
  if (!inFocus(focus, tz, now)) return m.importance === "critical" || m.importance === "high";
  return (focus.allow_vip && m.vip) || (focus.allow_critical && m.importance === "critical");
}
