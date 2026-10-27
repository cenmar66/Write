"use client";

import { ArrowDown, ArrowUp, Bell, Calendar, Download, Eye, EyeOff, Link2, RefreshCw, RotateCcw, Smartphone, Trash2, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PALETTE, THEMES, headerColors, sectionColor } from "@/lib/canvas/colors";
import { deviceTimeZone } from "@/lib/canvas/dates";
import { buildCSV, buildJSON, CSV_KINDS, download } from "@/lib/canvas/export";
import { penScratch } from "@/lib/canvas/feedback";
import { deleteCanvasDB } from "@/lib/canvas/idb";
import { resolveOrder, SECTION_BY_KEY } from "@/lib/canvas/sections";
import type { Preferences, SectionKey } from "@/lib/canvas/types";
import { ENGINE_KEY } from "./dictation";
import { googleApi, refreshGoogleStatus, useGoogleStatus } from "./google-client";
import { useCanvas, useSyncStatus } from "./provider";
import { SyncBadge } from "./shell";

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="dc-card p-4 md:p-5">
      <h2 className="dc-serif mb-3 text-xl">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {hint && (
          <p className="text-xs" style={{ color: "var(--dc-muted)" }}>
            {hint}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative h-7 w-12 rounded-full transition-colors" style={{ background: on ? "var(--dc-ink)" : "var(--dc-rule)" }}>
      <span className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 26 : 4 }} />
    </button>
  );
}

export function SettingsPage() {
  const { planner, prefs } = useCanvas();
  const set = (p: Partial<Preferences>) => planner.setPrefs(p);
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 md:px-6">
      <h1 className="dc-serif text-3xl">Settings</h1>
      <Appearance />
      <Planner />
      <Card title="Voice">
        <Row label="Dictation language" hint="Every mic button uses this. Spanish and English are both supported.">
          <select className="dc-field w-auto" value={prefs.dictation_lang} onChange={(e) => set({ dictation_lang: e.target.value as Preferences["dictation_lang"] })}>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Español (España)</option>
            <option value="es-MX">Español (México)</option>
          </select>
        </Row>
        <EngineRow />
        <p className="text-xs" style={{ color: "var(--dc-muted)" }}>
          Audio is never saved by The Daily Canvas. You always see the text before it&apos;s added. Quick-add understanding is rule-based and runs on your device; nothing is sent to an AI service.
        </p>
      </Card>
      <RemindersCard />
      <Integrations />
      <DataCard />
      <InstallCard />
    </div>
  );
}

function Appearance() {
  const { planner, prefs, toast } = useCanvas();
  const set = (p: Partial<Preferences>) => planner.setPrefs(p);
  const order = resolveOrder(prefs.section_order);
  return (
    <Card title="Look & feel">
      <Row label="Theme">
        <div className="dc-seg" role="group" aria-label="Theme">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} aria-pressed={prefs.theme === t} onClick={() => set({ theme: t })}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </Row>
      <div>
        <p className="mb-2 text-sm font-medium">Colour theme</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className="rounded-xl p-2.5 text-left text-sm"
              aria-pressed={prefs.color_theme === t.id && !Object.keys(prefs.section_colors).length}
              style={{ border: `2px solid ${prefs.color_theme === t.id ? "var(--dc-ink)" : "var(--dc-line)"}` }}
              onClick={() => {
                set({ color_theme: t.id, section_colors: {} });
                toast(`${t.name} applied to every section`);
              }}
            >
              <span className="mb-1.5 flex gap-1">
                {Object.values(t.colors)
                  .slice(0, 8)
                  .map((c, i) => (
                    <span key={i} className="h-4 w-4 rounded-full" style={{ background: c }} />
                  ))}
              </span>
              {t.name}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center">
          <p className="flex-1 text-sm font-medium">Each section</p>
          <button className="inline-flex items-center gap-1 text-xs underline" onClick={() => set({ section_colors: {} })}>
            <RotateCcw size={12} /> Restore defaults
          </button>
        </div>
        <ul className="space-y-1.5">
          {order.map((k) => (
            <SectionColorRow key={k} k={k} />
          ))}
        </ul>
        <p className="mt-2 text-xs" style={{ color: "var(--dc-muted)" }}>
          Header text switches between white and dark, or the colour deepens slightly, so labels always meet WCAG AA contrast.
        </p>
      </div>
      <Row label="Density">
        <div className="dc-seg" role="group" aria-label="Density">
          {(["compact", "comfortable", "spacious"] as const).map((d) => (
            <button key={d} aria-pressed={prefs.density === d} onClick={() => set({ density: d })}>
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Check-off animation" hint="Also follows your system's Reduce Motion setting.">
        <Toggle on={prefs.animations} onChange={(v) => set({ animations: v })} label="Animations" />
      </Row>
      <Row label="Pen sound when checking off">
        <button className="dc-icon-btn" aria-label="Play sound" onClick={() => penScratch()}>
          <Volume2 size={16} />
        </button>
        <Toggle on={prefs.sound} onChange={(v) => set({ sound: v })} label="Sound" />
      </Row>
      <Row label="Daily line" hint="The handwritten note beside the date.">
        <input className="dc-field w-72" value={prefs.tagline} onChange={(e) => set({ tagline: e.target.value })} />
      </Row>
    </Card>
  );
}

function SectionColorRow({ k }: { k: SectionKey }) {
  const { planner, prefs } = useCanvas();
  const color = sectionColor(k, prefs.section_colors, prefs.color_theme);
  const head = headerColors(color);
  const setColor = (hex: string | null) => {
    const next = { ...prefs.section_colors };
    if (hex) next[k] = hex;
    else delete next[k];
    planner.setPrefs({ section_colors: next });
  };
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-48 truncate rounded-md px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wider" style={{ background: head.bg, color: head.fg }}>
        {SECTION_BY_KEY[k].title}
      </span>
      <span className="flex flex-wrap gap-1">
        {PALETTE.slice(0, 12).map((p) => (
          <button
            key={p.hex}
            aria-label={`${SECTION_BY_KEY[k].title}: ${p.name}`}
            aria-pressed={color.toLowerCase() === p.hex}
            onClick={() => setColor(p.hex)}
            className="h-5 w-5 rounded-full"
            style={{ background: p.hex, boxShadow: color.toLowerCase() === p.hex ? "0 0 0 2px var(--dc-paper), 0 0 0 3.5px var(--dc-ink)" : "none" }}
          />
        ))}
        <input type="color" className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0" value={color} onChange={(e) => setColor(e.target.value)} aria-label={`${SECTION_BY_KEY[k].title} custom colour`} />
      </span>
    </li>
  );
}

function Planner() {
  const { planner, prefs } = useCanvas();
  const set = (p: Partial<Preferences>) => planner.setPrefs(p);
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return [prefs.timezone];
    }
  }, [prefs.timezone]);
  const order = resolveOrder(prefs.section_order);
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ section_order: next });
  };
  const device = deviceTimeZone();
  return (
    <Card title="Planner">
      <Row label="Time zone" hint={device !== prefs.timezone ? `This device is set to ${device}.` : "Days start at midnight here."}>
        <select className="dc-field w-64" value={prefs.timezone} onChange={(e) => set({ timezone: e.target.value })}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {device !== prefs.timezone && (
          <button className="dc-btn" onClick={() => set({ timezone: device })}>
            Use {device}
          </button>
        )}
      </Row>
      <Row label="Water goal" hint="Glasses per day, and glass size.">
        <input type="number" min={1} max={24} className="dc-field w-20" value={prefs.water_target} onChange={(e) => set({ water_target: Math.max(1, Math.min(24, Number(e.target.value) || 8)) })} aria-label="Glasses per day" />
        <select className="dc-field w-auto" value={prefs.glass_ml} onChange={(e) => set({ glass_ml: Number(e.target.value) })} aria-label="Glass size">
          {[200, 250, 300, 350, 500].map((v) => (
            <option key={v} value={v}>
              {v} ml{v === 250 ? " (8 oz)" : v === 350 ? " (12 oz)" : v === 500 ? " (16 oz)" : ""}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Carry unbought items forward" hint="Unticked To Buy items move to the next day until bought.">
        <Toggle on={prefs.carry_shopping} onChange={(v) => set({ carry_shopping: v })} label="Carry shopping items" />
      </Row>
      <div>
        <p className="mb-1 text-sm font-medium">Sections</p>
        <p className="mb-2 text-xs" style={{ color: "var(--dc-muted)" }}>
          Reorder or hide. Hiding never deletes anything you wrote.
        </p>
        <ul className="dc-ruled rounded-lg" style={{ border: "1px solid var(--dc-line)" }}>
          {order.map((k, i) => {
            const hidden = prefs.hidden_sections.includes(k);
            return (
              <li key={k} className="flex items-center gap-1 px-3">
                <span className="flex-1 text-sm" style={{ opacity: hidden ? 0.5 : 1 }}>
                  {SECTION_BY_KEY[k].title}
                </span>
                <button className="dc-icon-btn sm" aria-label={`Move ${SECTION_BY_KEY[k].title} up`} onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowUp size={14} />
                </button>
                <button className="dc-icon-btn sm" aria-label={`Move ${SECTION_BY_KEY[k].title} down`} onClick={() => move(i, 1)} disabled={i === order.length - 1}>
                  <ArrowDown size={14} />
                </button>
                <button
                  className="dc-icon-btn sm"
                  aria-label={hidden ? `Show ${SECTION_BY_KEY[k].title}` : `Hide ${SECTION_BY_KEY[k].title}`}
                  aria-pressed={hidden}
                  onClick={() => set({ hidden_sections: hidden ? prefs.hidden_sections.filter((x) => x !== k) : [...prefs.hidden_sections, k] })}
                >
                  {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
        <button className="mt-2 text-xs underline" onClick={() => set({ section_order: [], hidden_sections: [] })}>
          Restore the original paper-planner layout
        </button>
      </div>
    </Card>
  );
}

function EngineRow() {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(ENGINE_KEY) ?? "auto";
    } catch {
      return "auto";
    }
  });
  const hasBrowser = !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  return (
    <Row
      label="Dictation engine (this device)"
      hint={
        hasBrowser
          ? "This browser has built-in speech recognition (it may use Apple's or Google's servers)."
          : "This browser has no built-in speech recognition. Use cloud dictation, or your keyboard's mic key."
      }
    >
      <select
        className="dc-field w-auto"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          try {
            localStorage.setItem(ENGINE_KEY, e.target.value);
          } catch {
            /* ignore */
          }
        }}
      >
        <option value="auto">Automatic</option>
        <option value="browser">Built-in (browser)</option>
        <option value="cloud">Cloud (Deepgram)</option>
      </select>
    </Row>
  );
}

function RemindersCard() {
  const { planner, prefs } = useCanvas();
  const r = prefs.reminders;
  const set = (p: Partial<Preferences["reminders"]>) => planner.setPrefs({ reminders: { ...r, ...p } });
  const [perm, setPerm] = useState<string>(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  return (
    <Card title="Reminders">
      <Row
        label="Reminders"
        hint={
          perm === "unsupported"
            ? "This browser can't show notifications. On iPhone and iPad, add the planner to your Home Screen first (iOS 16.4+)."
            : "Off until you turn them on. They appear while the planner is open or installed and running; there's no push server, so a fully closed app can't remind you."
        }
      >
        <Toggle
          on={!!r.enabled && perm === "granted"}
          label="Enable reminders"
          onChange={async (v) => {
            if (v && typeof Notification !== "undefined" && Notification.permission !== "granted") {
              const p = await Notification.requestPermission();
              setPerm(p);
              if (p !== "granted") return;
            }
            set({ enabled: v });
          }}
        />
      </Row>
      {r.enabled && perm === "granted" && (
        <>
          <Row label="Before appointments and timed tasks">
            <select className="dc-field w-auto" value={r.leadMinutes ?? 10} onChange={(e) => set({ leadMinutes: Number(e.target.value) })}>
              {[0, 5, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m ? `${m} min before` : "At the time"}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Appointments">
            <Toggle on={r.appointments !== false} onChange={(v) => set({ appointments: v })} label="Appointment reminders" />
          </Row>
          <Row label="Tasks with a time">
            <Toggle on={r.scheduledTasks !== false} onChange={(v) => set({ scheduledTasks: v })} label="Task reminders" />
          </Row>
          <Row label="Water check-ins" hint="A few times a day, only if you're behind.">
            <Toggle on={!!r.hydration} onChange={(v) => set({ hydration: v })} label="Water reminders" />
          </Row>
          <Row label="Evening wrap-up">
            <input type="time" className="dc-field w-auto" value={r.eveningTime ?? "20:30"} onChange={(e) => set({ eveningTime: e.target.value })} aria-label="Evening time" />
            <Toggle on={!!r.evening} onChange={(v) => set({ evening: v })} label="Evening reminder" />
          </Row>
          <Row label="Quiet hours">
            <input type="time" className="dc-field w-auto" value={r.quietStart ?? "22:00"} onChange={(e) => set({ quietStart: e.target.value })} aria-label="Quiet from" />
            <span className="text-sm">to</span>
            <input type="time" className="dc-field w-auto" value={r.quietEnd ?? "07:00"} onChange={(e) => set({ quietEnd: e.target.value })} aria-label="Quiet until" />
          </Row>
          <button className="dc-btn" onClick={() => new Notification("The Daily Canvas", { body: "Reminders are working." })}>
            <Bell size={15} /> Send a test
          </button>
        </>
      )}
    </Card>
  );
}

function Integrations() {
  const { mode, store, rev, toast, sync } = useCanvas();
  const g = useGoogleStatus();
  const [cals, setCals] = useState<{ id: string; summary: string; primary?: boolean; backgroundColor?: string; accessRole: string }[] | null>(null);
  const [lists, setLists] = useState<{ id: string; title: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<{ id: string; provider: string; action: string; status: string; detail: Record<string, unknown>; at: string }[]>([]);
  const links = useMemo(() => store.all("canvas_task_links"), [store, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!g.connected) return;
    if (g.canReadCalendar) googleApi.calendars().then((r) => setCals(r.calendars)).catch(() => setCals([]));
    if (g.canTasks) googleApi.taskLists().then((r) => setLists(r.lists)).catch(() => setLists([]));
    googleApi.audit().then((r) => setAudit(r.entries)).catch(() => {});
  }, [g.connected, g.canReadCalendar, g.canTasks]);

  if (mode !== "cloud")
    return (
      <Card title="Integrations" id="integrations">
        <p className="text-sm" style={{ color: "var(--dc-muted)" }}>
          Google Calendar and Google Tasks need you signed in with cloud sync (this is a local-only dev session).
        </p>
      </Card>
    );

  const save = async (body: Record<string, unknown>) => {
    try {
      await googleApi.saveSettings(body);
      await refreshGoogleStatus();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save");
    }
  };

  return (
    <Card title="Integrations" id="integrations">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={18} />
          <p className="flex-1 font-medium">Google Calendar</p>
          {g.connected ? <span className="dc-chip">Connected{g.email ? ` · ${g.email}` : ""}</span> : <span className="dc-chip">Not connected</span>}
        </div>
        {!g.configured ? (
          <p className="text-sm" style={{ color: "var(--dc-muted)" }}>
            Not set up on the server yet. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Vercel (see docs/canvas/INTEGRATIONS.md), then come back here.
          </p>
        ) : !g.connected || !g.canReadCalendar ? (
          <a className="dc-btn dc-btn-primary" href="/api/canvas/google/connect?scope=calendar">
            Connect Google Calendar
          </a>
        ) : (
          <>
            <p className="text-xs" style={{ color: "var(--dc-muted)" }}>
              Shown in Appointments. Events stay in Google: checking off an appointment here never changes or deletes them. New events are only created when you ask.
            </p>
            <ul className="space-y-1">
              {(cals ?? []).map((c) => {
                const on = g.selectedCalendars.length ? g.selectedCalendars.includes(c.id) : !!c.primary;
                return (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      id={`cal-${c.id}`}
                      checked={on}
                      onChange={() => {
                        const base = g.selectedCalendars.length ? g.selectedCalendars : (cals ?? []).filter((x) => x.primary).map((x) => x.id);
                        void save({ selectedCalendars: on ? base.filter((x) => x !== c.id) : [...base, c.id] });
                      }}
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.backgroundColor ?? "#888" }} />
                    <label htmlFor={`cal-${c.id}`}>{c.summary}</label>
                    {c.accessRole === "reader" || c.accessRole === "freeBusyReader" ? <span className="dc-chip">read-only</span> : null}
                  </li>
                );
              })}
              {cals === null && <li className="text-sm">Loading calendars…</li>}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--dc-line)" }}>
        <div className="flex items-center gap-2">
          <Link2 size={18} />
          <p className="flex-1 font-medium">Google Tasks bridge (for Sunsama)</p>
          {g.canTasks && <span className="dc-chip">{lists?.find((l) => l.id === g.tasksListId)?.title ?? "No list chosen"}</span>}
        </div>
        {g.configured && g.connected && !g.canTasks && (
          <a className="dc-btn" href="/api/canvas/google/connect?scope=tasks">
            Allow Google Tasks access
          </a>
        )}
        {g.canTasks && (
          <>
            <Row label="Google Tasks list" hint="Use a dedicated list, e.g. “Daily Canvas”. Only tasks you link (in a task's details) are sent.">
              <select className="dc-field w-56" value={g.tasksListId ?? ""} onChange={(e) => void save({ tasksListId: e.target.value || null })}>
                <option value="">Choose a list…</option>
                {(lists ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
                <option value="__create__">+ Create “Daily Canvas” list</option>
              </select>
            </Row>
            <Row label="Bring in tasks added in Google Tasks" hint="New items in that list (for example ones Sunsama adds) appear in your planner.">
              <Toggle on={!!g.tasksSettings.importEnabled} onChange={(v) => void save({ tasksSettings: { ...g.tasksSettings, importEnabled: v } })} label="Import from Google Tasks" />
              <select className="dc-field w-auto" value={g.tasksSettings.importSection ?? "work"} onChange={(e) => void save({ tasksSettings: { ...g.tasksSettings, importSection: e.target.value } })} aria-label="Import into section">
                <option value="work">into Work</option>
                <option value="personal">into Personal</option>
                <option value="must">into Must Do</option>
              </select>
            </Row>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="dc-btn"
                disabled={busy || !g.tasksListId}
                onClick={async () => {
                  setBusy(true);
                  try {
                    // Send this device's link changes first, then pull what the server changed.
                    await sync.syncNow();
                    const r = await googleApi.tasksSync();
                    await sync.syncNow();
                    toast(`Google Tasks: ${r.exported} sent, ${r.imported} brought in, ${r.updatedLocal + r.updatedRemote} updated${r.conflicts ? `, ${r.conflicts} need a look` : ""}`);
                    await refreshGoogleStatus();
                    googleApi.audit().then((x) => setAudit(x.entries)).catch(() => {});
                  } catch (e) {
                    toast(e instanceof Error ? e.message : "Sync failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Sync Google Tasks now
              </button>
              <span className="text-xs" style={{ color: "var(--dc-muted)" }}>
                {links.filter((l) => l.state !== "broken").length} linked task(s){g.lastTasksSync ? ` · last ${new Date(g.lastTasksSync).toLocaleString()}` : ""}
              </span>
            </div>
            {links.some((l) => l.state === "conflict") && <ConflictLinks />}
          </>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">How this works with Sunsama</summary>
          <div className="mt-2 space-y-2 text-sm" style={{ color: "var(--dc-muted)" }}>
            <p>Sunsama doesn&apos;t publish a public API, so The Daily Canvas connects through Google using only official Google APIs. Nothing here logs in to Sunsama or reads its private data.</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                <b>Calendar</b>: when you timebox a task in Sunsama, it becomes an event on the Google Calendar you chose in Sunsama (“Default for tasks”). Select that calendar above and those blocks appear in Appointments, labelled “time block” when they look like Sunsama&apos;s. They show the time, not Sunsama&apos;s full task details.
              </li>
              <li>
                <b>Google Tasks</b>: tasks you link here are sent to the Google Tasks list chosen above. In Sunsama, connect Google Tasks and drag them in from its Google Tasks panel (Sunsama imports them by hand, not automatically). When you finish an imported task in Sunsama, Sunsama marks it done in Google Tasks, and the next sync here ticks it off too.
              </li>
            </ol>
            <p>Synced with Google Tasks: title, notes, due date (date only; Google drops due times) and done/not done. Nothing is ever deleted on either side. If a task changed in both places since the last sync, you choose which version to keep.</p>
          </div>
        </details>
      </div>

      {g.connected && (
        <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--dc-line)" }}>
          <p className="font-medium">Integration health</p>
          <ul className="space-y-0.5 text-xs" style={{ color: "var(--dc-muted)" }}>
            <li>Calendar last refreshed: {g.lastCalendarSync ? new Date(g.lastCalendarSync).toLocaleString() : "not yet"}</li>
            <li>Google Tasks last synced: {g.lastTasksSync ? new Date(g.lastTasksSync).toLocaleString() : "not yet"}</li>
            {g.lastError && <li style={{ color: "#a33" }}>Last problem: {g.lastError}</li>}
          </ul>
          {audit.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer">Activity log</summary>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                {audit.map((a) => (
                  <li key={a.id}>
                    {new Date(a.at).toLocaleString()} · {a.provider} · {a.action} · <span style={{ color: a.status === "error" ? "#a33" : undefined }}>{a.status}</span>
                    {a.detail?.message ? ` — ${String(a.detail.message)}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            className="dc-btn"
            style={{ color: "#a33" }}
            onClick={async () => {
              if (!window.confirm("Disconnect Google? Your planner keeps everything; Google events will stop showing.")) return;
              await googleApi.disconnect().catch(() => {});
              store.clearExternalEvents();
              await refreshGoogleStatus();
              toast("Google disconnected");
            }}
          >
            Disconnect Google
          </button>
        </div>
      )}
    </Card>
  );
}

function ConflictLinks() {
  const { store, rev } = useCanvas();
  const conflicts = useMemo(() => store.all("canvas_task_links").filter((l) => l.state === "conflict"), [store, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rounded-lg p-3 text-sm" style={{ background: "#fbf0dc", color: "#6b4a12" }}>
      <p className="mb-1 font-medium">Changed in both places</p>
      <ul className="space-y-2">
        {conflicts.map((l) => {
          const t = store.get("canvas_tasks", l.task_id);
          const remote = (l.conflict?.remote ?? {}) as { title?: string; status?: string };
          return (
            <li key={l.id}>
              <p>
                Here: “{t?.title}” ({t?.status}) · Google: “{remote.title}” ({remote.status === "completed" ? "done" : "open"})
              </p>
              <div className="mt-1 flex gap-2">
                <button className="dc-btn min-h-0 px-2 py-1 text-xs" onClick={() => store.update("canvas_task_links", l.id, { state: "linked", conflict: { resolve: "local" } })}>
                  Keep mine
                </button>
                <button className="dc-btn min-h-0 px-2 py-1 text-xs" onClick={() => store.update("canvas_task_links", l.id, { state: "linked", conflict: { resolve: "remote" } })}>
                  Keep Google&apos;s
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs">Your choice is applied on the next sync.</p>
    </div>
  );
}

function DataCard() {
  const { store, prefs, supabase, mode } = useCanvas();
  const status = useSyncStatus();
  const [confirm, setConfirm] = useState("");
  return (
    <Card title="Your data">
      <Row label="Sync" hint={status.lastSyncAt ? `Last synced ${new Date(status.lastSyncAt).toLocaleString()}` : mode === "cloud" ? "Not synced yet on this device" : "Local-only dev session"}>
        <div className="w-56">
          <SyncBadge />
        </div>
      </Row>
      <Row label="Export everything" hint="All records, including history and deleted items, as JSON.">
        <button className="dc-btn" onClick={async () => download(`daily-canvas-${new Date().toISOString().slice(0, 10)}.json`, await buildJSON(store, prefs.timezone), "application/json")}>
          <Download size={15} /> JSON
        </button>
      </Row>
      <Row label="Spreadsheets (CSV)" hint={`Times shown in ${prefs.timezone}.`}>
        <select
          className="dc-field w-auto"
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return;
            download(`daily-canvas-${e.target.value}.csv`, buildCSV(store, e.target.value, prefs.timezone), "text/csv");
            e.target.value = "";
          }}
          aria-label="Download a CSV"
        >
          <option value="">Download a CSV…</option>
          {CSV_KINDS.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
        </select>
      </Row>
      <div className="rounded-lg p-3" style={{ border: "1px solid #e3b2aa" }}>
        <p className="text-sm font-medium" style={{ color: "#a33" }}>
          Delete all Daily Canvas data
        </p>
        <p className="mb-2 text-xs" style={{ color: "var(--dc-muted)" }}>
          Removes every planner record from the cloud and this device, and disconnects Google. Your Write.ai documents aren&apos;t touched. Export first if you might want it back. Type DELETE to confirm.
        </p>
        <div className="flex gap-2">
          <input className="dc-field w-32" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" />
          <button
            className="dc-btn"
            style={{ color: "#a33" }}
            disabled={confirm !== "DELETE"}
            onClick={async () => {
              if (mode === "cloud" && supabase) {
                await fetch("/api/canvas/google/disconnect", { method: "POST" }).catch(() => {});
                const { error } = await supabase.rpc("canvas_delete_my_data");
                if (error) return alert(`Couldn't delete: ${error.message}`);
              }
              await deleteCanvasDB(store.userKey);
              window.location.replace("/canvas"); // full reload: start from an empty local store
            }}
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

function InstallCard() {
  return (
    <Card title="Install the app">
      <div className="flex gap-3 text-sm">
        <Smartphone size={18} className="mt-0.5 shrink-0" />
        <div className="space-y-2" style={{ color: "var(--dc-muted)" }}>
          <p>
            <b style={{ color: "var(--dc-ink)" }}>iPhone / iPad</b>: open this page in Safari → Share → <i>Add to Home Screen</i>.
          </p>
          <p>
            <b style={{ color: "var(--dc-ink)" }}>Mac</b>: Safari → File → <i>Add to Dock</i> (macOS Sonoma or later). In Chrome: the install icon in the address bar.
          </p>
          <p>Once installed, the planner opens with no connection and syncs when you&apos;re back online.</p>
        </div>
      </div>
    </Card>
  );
}
