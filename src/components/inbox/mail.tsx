"use client";

import { AlertTriangle, Archive, ArrowLeft, Check, Clock, Filter, RefreshCw, Search, ShieldAlert, Star } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, useAct, useMessages, type ListMessage } from "./api";
import { MessageReader } from "./reader";
import { useScope } from "./shell";
import { Avatar, CategoryChip, Empty, ImportanceChip, Skeleton, Spinner, errText, timeLabel, useToast } from "./ui";

const TITLES: Record<string, string> = { priority: "Priority Inbox", attention: "Needs My Attention", all: "All Mail", sent: "Sent", snoozed: "Snoozed", done: "Done" };

export function MailPage() {
  const { ws, boot } = useScope();
  const params = useSearchParams();
  const router = useRouter();
  const view = params.get("view") ?? "priority";
  const q = params.get("q") ?? "";
  const selectedId = params.get("m");
  const [account, setAccount] = useState("");
  const [deep, setDeep] = useState(false);
  const list = useMessages(ws, view, q, account);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toast = useToast();
  const listRef = useRef<HTMLUListElement>(null);

  const catName = (key: string) => boot.categories.find((c) => c.key === key)?.name ?? key.replace(/_/g, " ");
  const title = view.startsWith("category:") ? catName(view.slice(9)) : TITLES[view] ?? "Mail";
  const rows = useMemo(() => list.data ?? [], [list.data]);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v === null) p.delete(k);
    else p.set(k, v);
    router.replace(`/inbox/mail?${p}`, { scroll: false });
  };
  const open = (id: string | null) => setParam("m", id);

  const bulk = useAct((a: { action: string; value?: string; confirm?: boolean; ids: string[] }) => api<{ ok: boolean; failures?: string[] }>("/messages", { method: "POST", json: a }), {
    onSuccess: (r, a) => {
      setChecked(new Set());
      if (r.failures?.length) toast({ text: `Some changes failed: ${r.failures[0]}`, tone: "error" });
      else if (a.action === "done") toast({ text: `Marked ${a.ids.length} done.`, tone: "ok", action: { label: "Undo", run: () => bulk.mutate({ action: "undone", ids: a.ids }) } });
      else if (a.action === "snooze") toast({ text: "Snoozed.", tone: "ok", action: { label: "Undo", run: () => bulk.mutate({ action: "undone", ids: a.ids }) } });
      else toast({ text: "Done.", tone: "ok" });
    },
  });
  const runBulk = (action: string, value?: string, ids = [...checked]) => {
    if (!ids.length) return;
    bulk.mutate(
      { action, value, ids },
      {
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409 && confirm(`${e.message}`)) bulk.mutate({ action, value, ids, confirm: true });
          else if (!(e instanceof ApiError && e.status === 409)) toast({ text: errText(e), tone: "error" });
        },
      },
    );
  };

  const toggle = (id: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Keyboard: j/k move, Enter/o open, e done, s snooze, x select, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName) || e.metaKey || e.ctrlKey || document.querySelector("dialog[open]")) return;
      const idx = rows.findIndex((r) => r.id === selectedId);
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const n = rows[Math.min(rows.length - 1, idx + 1)];
        if (n) open(n.id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = rows[Math.max(0, idx - 1)];
        if (n) open(n.id);
      } else if (e.key === "e" && selectedId) runBulk("done", undefined, [selectedId]);
      else if (e.key === "s" && selectedId) runBulk("snooze", "tomorrow", [selectedId]);
      else if (e.key === "x" && selectedId) toggle(selectedId);
      else if (e.key === "Escape") open(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const accountsInScope = boot.accounts.filter((a) => ws === "all" || a.workspace_id === ws);
  const unread = useMemo(() => rows.filter((r) => r.is_unread).length, [rows]);

  const deepSearch = async () => {
    setDeep(true);
    try {
      await api(`/messages?${new URLSearchParams({ ws, view: "all", q, deep: "1" })}`);
      await list.refetch();
    } catch (e) {
      toast({ text: errText(e), tone: "error" });
    }
    setDeep(false);
  };

  return (
    <div className="flex h-full">
      <section className={`flex min-w-0 flex-col border-r ip-line ${selectedId ? "hidden lg:flex" : "flex"} w-full lg:w-[440px] lg:flex-none`} style={{ background: "var(--ip-surface)" }} aria-label={title}>
        <div className="flex items-center gap-2 border-b px-3 py-2.5 ip-line">
          <input
            type="checkbox"
            aria-label="Select all"
            checked={rows.length > 0 && checked.size === rows.length}
            onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
          />
          <h1 className="font-semibold">{q ? `Search: ${q}` : title}</h1>
          <span className="ip-muted text-[12px]">{rows.length ? `${unread} unread` : ""}</span>
          <div className="ml-auto flex items-center gap-1">
            {accountsInScope.length > 1 && (
              <label className="relative">
                <span className="sr-only">Account</span>
                <Filter size={13} className="ip-muted pointer-events-none absolute left-2 top-1/2 -translate-y-1/2" />
                <select className="ip-select !h-8 !w-36 !pl-6 text-[12px]" value={account} onChange={(e) => setAccount(e.target.value)}>
                  <option value="">All accounts</option>
                  {accountsInScope.map((a) => (
                    <option key={a.id} value={a.id}>{a.email}</option>
                  ))}
                </select>
              </label>
            )}
            <button className="ip-btn ip-btn-ghost ip-btn-sm" onClick={() => list.refetch()} aria-label="Refresh">
              <RefreshCw size={14} className={list.isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        {checked.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2 ip-line ip-fade-in" style={{ background: "var(--ip-surface-2)" }}>
            <span className="text-[12px] font-medium">{checked.size} selected</span>
            <button className="ip-btn ip-btn-sm" onClick={() => runBulk("done")}><Check size={13} /> Done</button>
            <select className="ip-select !h-7 !w-auto text-[12px]" value="" onChange={(e) => e.target.value && runBulk("snooze", e.target.value)} aria-label="Snooze selected">
              <option value="">Snooze…</option>
              <option value="later_today">Later today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="weekend">This weekend</option>
              <option value="next_week">Next week</option>
            </select>
            <select className="ip-select !h-7 !w-auto text-[12px]" value="" onChange={(e) => e.target.value && runBulk("category", e.target.value)} aria-label="Move selected">
              <option value="">Move to…</option>
              {[...new Map(boot.categories.filter((c) => !c.hidden).map((c) => [c.key, c])).values()].map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
            <button className="ip-btn ip-btn-sm" onClick={() => runBulk("archive")} title="Archive in your mailbox (asks first)"><Archive size={13} /> Archive</button>
          </div>
        )}
        <div className="ip-scroll flex-1">
          {list.isLoading ? (
            <Skeleton rows={8} />
          ) : list.error ? (
            <p className="p-4" style={{ color: "var(--ip-crit)" }}>{list.error.message}</p>
          ) : !rows.length ? (
            <Empty icon={Search} title={q ? "No matches in stored mail" : view === "priority" ? "No priority mail right now" : "Nothing here"}>
              {q ? "InboxPilot searched the mail it has stored." : boot.accounts.length ? "New mail is classified as it arrives." : "Connect an account to get started."}
              {q && boot.accounts.some((a) => a.provider === "gmail") && (
                <button className="ip-btn ip-btn-sm mt-3" onClick={deepSearch} disabled={deep}>
                  {deep ? <Spinner size={13} /> : <Search size={13} />} Search Gmail too
                </button>
              )}
            </Empty>
          ) : (
            <ul ref={listRef}>
              {rows.map((m) => (
                <Row key={m.id} m={m} selected={m.id === selectedId} checked={checked.has(m.id)} onCheck={() => toggle(m.id)} onOpen={() => open(m.id)} showCategory={!view.startsWith("category:")} tz={boot.prefs.timezone} onSwipe={(dir) => runBulk(dir === "right" ? "done" : "snooze", dir === "left" ? "tomorrow" : undefined, [m.id])} catName={catName} />
              ))}
            </ul>
          )}
          {q && rows.length > 0 && boot.accounts.some((a) => a.provider === "gmail") && (
            <div className="p-3 text-center">
              <button className="ip-btn ip-btn-sm" onClick={deepSearch} disabled={deep}>{deep ? <Spinner size={13} /> : <Search size={13} />} Also search Gmail</button>
            </div>
          )}
        </div>
        <p className="ip-muted hidden border-t px-3 py-1.5 text-[11px] lg:block ip-line">
          <span className="ip-kbd">j</span>/<span className="ip-kbd">k</span> move · <span className="ip-kbd">e</span> done · <span className="ip-kbd">s</span> snooze · <span className="ip-kbd">x</span> select · <span className="ip-kbd">r</span> reply · <span className="ip-kbd">/</span> search
        </p>
      </section>
      <section className={`min-w-0 flex-1 ${selectedId ? "flex" : "hidden lg:flex"} flex-col`} aria-label="Message">
        {selectedId ? (
          <>
            <button className="ip-btn ip-btn-ghost m-2 w-fit lg:hidden" onClick={() => open(null)}>
              <ArrowLeft size={15} /> {title}
            </button>
            <MessageReader id={selectedId} onDone={() => {
              const idx = rows.findIndex((r) => r.id === selectedId);
              open(rows[idx + 1]?.id ?? rows[idx - 1]?.id ?? null);
            }} />
          </>
        ) : (
          <Empty title="Select a message">Pick a message to read it with its summary, suggested actions and classification details.</Empty>
        )}
      </section>
    </div>
  );
}

function Row({ m, selected, checked, onCheck, onOpen, showCategory, tz, onSwipe, catName }: { m: ListMessage; selected: boolean; checked: boolean; onCheck: () => void; onOpen: () => void; showCategory: boolean; tz: string; onSwipe: (d: "left" | "right") => void; catName: (k: string) => string }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  const risky = (m.signals?.suspicious?.length ?? 0) > 0 || m.c?.injection_flag;
  return (
    <li
      data-id={m.id}
      className="ip-row relative overflow-hidden"
      data-unread={m.is_unread}
      data-selected={selected}
      onTouchStart={(e) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchMove={(e) => {
        if (!start.current) return;
        const x = e.touches[0].clientX - start.current.x;
        if (Math.abs(e.touches[0].clientY - start.current.y) < 30) setDx(Math.max(-120, Math.min(120, x)));
      }}
      onTouchEnd={() => {
        if (dx > 90) onSwipe("right");
        else if (dx < -90) onSwipe("left");
        setDx(0);
        start.current = null;
      }}
    >
      {dx !== 0 && (
        <div className="absolute inset-0 flex items-center justify-between px-5 text-[12px] font-semibold text-white" style={{ background: dx > 0 ? "var(--ip-low)" : "var(--ip-mid)" }} aria-hidden>
          <span className="flex items-center gap-1"><Check size={14} /> Done</span>
          <span className="flex items-center gap-1"><Clock size={14} /> Tomorrow</span>
        </div>
      )}
      <div className="relative flex cursor-pointer gap-3 px-3 py-2.5 transition-transform" style={{ transform: `translateX(${dx}px)`, background: selected ? "var(--ip-accent-soft)" : "var(--ip-surface)" }} onClick={onOpen}>
        <input type="checkbox" className="mt-2.5" checked={checked} onChange={onCheck} onClick={(e) => e.stopPropagation()} aria-label={`Select ${m.subject}`} />
        <Avatar name={m.from_name} email={m.from_email} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`truncate ${m.is_unread ? "font-semibold" : "font-medium"}`}>{m.is_sent ? `To: ${m.to_addrs?.[0]?.name || m.to_addrs?.[0]?.email || ""}` : m.from_name || m.from_email}</span>
            {m.vip && <Star size={12} fill="currentColor" style={{ color: "var(--ip-mid)" }} aria-label="VIP" />}
            {risky && <ShieldAlert size={13} style={{ color: "var(--ip-crit)" }} aria-label="Security warning" />}
            <span className="ip-muted ml-auto flex-none text-[12px]">{timeLabel(m.received_at, tz)}</span>
          </div>
          <p className="ip-subject truncate text-[13px]">{m.subject || "(no subject)"}</p>
          <div className="flex items-center gap-1.5">
            <p className="ip-muted min-w-0 flex-1 truncate text-[12px]">{m.snippet}</p>
            {m.c?.time_sensitivity === "today" || m.c?.time_sensitivity === "immediate" ? <AlertTriangle size={12} style={{ color: "var(--ip-high)" }} aria-label="Due today" /> : null}
            {showCategory && ["newsletters", "receipts", "review"].includes(m.category ?? "") ? <CategoryChip k={m.category} name={catName(m.category!)} /> : <ImportanceChip value={m.importance} />}
          </div>
          {m.snoozed_until && new Date(m.snoozed_until) > new Date() && <p className="text-[11px]" style={{ color: "var(--ip-mid)" }}>Snoozed until {new Date(m.snoozed_until).toLocaleString("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" })}</p>}
        </div>
      </div>
    </li>
  );
}
