"use client";

import { CalendarClock, Check, CheckSquare, Clock, ExternalLink, MoreHorizontal, Plus, Reply } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { TaskRow } from "@/lib/inbox/types";
import { api, useAct, useFollowups, useTasks, type FollowupItem } from "./api";
import { Composer } from "./composer";
import { useScope } from "./shell";
import { TaskDialog } from "./task-dialog";
import { Avatar, dueLabel, Empty, Skeleton, errText, useToast } from "./ui";

type Tab = "all" | "i_owe" | "they_owe" | "upcoming" | "done";
interface Item {
  key: string;
  kind: "task" | "i_owe" | "they_owe" | "commitment";
  title: string;
  who: string;
  due: string | null;
  dueExplicit: boolean;
  priority: string;
  status: string;
  messageId: string | null;
  accountId: string | null;
  source: "email" | "manual";
  evidence?: string;
  task?: TaskRow;
  fu?: FollowupItem;
}

const KIND_LABEL: Record<Item["kind"], string> = { task: "Task", i_owe: "I owe", they_owe: "Owed to me", commitment: "My commitment" };
const PRIO_TONE: Record<string, string> = { urgent: "critical", high: "high", normal: "normal", low: "low" };

export function FollowupsPage() {
  const { ws, boot } = useScope();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") ?? "all") as Tab;
  const doneTab = tab === "done";
  const fus = useFollowups(ws, "", doneTab ? "done" : "open");
  const tasks = useTasks(ws, doneTab ? "done" : "open");
  const [newTask, setNewTask] = useState(false);
  const [prio, setPrio] = useState("");
  const [source, setSource] = useState("");
  const [composer, setComposer] = useState<{ messageId: string; accountId: string } | null>(null);
  const toast = useToast();
  const [nowMs] = useState(() => Date.now());

  const items: Item[] = useMemo(() => {
    const out: Item[] = [
      ...(tasks.data ?? []).map((t) => ({ key: `t${t.id}`, kind: "task" as const, title: t.title, who: t.source_ref?.from ?? "", due: t.due_date, dueExplicit: t.provenance?.due_date !== "inferred", priority: t.priority, status: t.status, messageId: t.message_id, accountId: t.account_id, source: t.message_id || t.source_ref ? ("email" as const) : ("manual" as const), task: t })),
      ...(fus.data ?? []).map((f) => ({ key: `f${f.id}`, kind: f.kind, title: f.title, who: f.message?.from_name || f.counterpart, due: f.due_at, dueExplicit: f.due_explicit, priority: f.due_at && new Date(f.due_at).getTime() < nowMs ? "high" : "normal", status: f.status, messageId: f.message_id, accountId: f.account_id, source: f.detected_by === "user" && !f.message_id ? ("manual" as const) : ("email" as const), evidence: f.evidence, fu: f })),
    ];
    const in14 = nowMs + 14 * 86_400_000;
    return out
      .filter((i) => (tab === "i_owe" ? i.kind === "i_owe" || i.kind === "commitment" : tab === "they_owe" ? i.kind === "they_owe" : tab === "upcoming" ? !!i.due && new Date(i.due).getTime() <= in14 : true))
      .filter((i) => !prio || i.priority === prio)
      .filter((i) => !source || i.source === source)
      .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  }, [tasks.data, fus.data, tab, prio, source, nowMs]);

  const counts = {
    all: (tasks.data?.length ?? 0) + (fus.data?.length ?? 0),
    i_owe: (fus.data ?? []).filter((f) => f.kind !== "they_owe").length,
    they_owe: (fus.data ?? []).filter((f) => f.kind === "they_owe").length,
  };
  const setTab = (t: Tab) => router.replace(`/inbox/followups?tab=${t}`);
  const updFu = useAct((a: { id: string; body: Record<string, unknown> }) => api(`/followups/${a.id}`, { method: "PATCH", json: a.body }));
  const updTask = useAct((a: { id: string; body: Record<string, unknown> }) => api(`/tasks/${a.id}`, { method: "PATCH", json: a.body }));
  const onErr = { onError: (e: Error) => toast({ text: errText(e), tone: "error" }) };

  const complete = (i: Item) => (i.task ? updTask.mutate({ id: i.task.id, body: { status: "done" } }, onErr) : updFu.mutate({ id: i.fu!.id, body: { status: "done" } }, onErr));
  const reopen = (i: Item) => (i.task ? updTask.mutate({ id: i.task.id, body: { status: "open" } }, onErr) : updFu.mutate({ id: i.fu!.id, body: { status: "open" } }, onErr));
  const redate = (i: Item, d: string) => (i.task ? updTask.mutate({ id: i.task.id, body: { due_date: d || null } }, onErr) : updFu.mutate({ id: i.fu!.id, body: { due_at: d ? `${d}T17:00:00` : null } }, onErr));

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">Tasks &amp; Follow-ups</h1>
            <p className="ip-muted text-[13px]">Actions from your emails, all in one place.</p>
          </div>
          <button className="ip-btn ip-btn-primary ml-auto" onClick={() => setNewTask(true)}><Plus size={14} /> New task</button>
        </div>
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {([["all", `All (${counts.all})`], ["i_owe", `I owe someone (${counts.i_owe})`], ["they_owe", `Someone owes me (${counts.they_owe})`], ["upcoming", "Upcoming"], ["done", "Completed"]] as [Tab, string][]).map(([t, l]) => (
            <button key={t} role="tab" aria-selected={tab === t} className="ip-tab" onClick={() => setTab(t)}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select className="ip-select !w-auto" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Priority"><option value="">Priority: any</option>{["urgent", "high", "normal", "low"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <select className="ip-select !w-auto" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source"><option value="">Source: any</option><option value="email">Email</option><option value="manual">Manual</option></select>
        </div>

        <div className="ip-card overflow-hidden">
          {fus.isLoading || tasks.isLoading ? (
            <Skeleton rows={6} />
          ) : !items.length ? (
            <Empty icon={CheckSquare} title={doneTab ? "Nothing completed yet" : "All clear"}>
              {tab === "they_owe" ? "When you ask someone for something and they don't answer, it shows up here." : "Create tasks from any email, or let InboxPilot detect requests and promises."}
            </Empty>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="ip-muted hidden text-left text-[12px] md:table-header-group">
                <tr className="border-b ip-line">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Due</th>
                  <th className="px-2 py-2 font-medium">Priority</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.key} className="flex flex-wrap items-center border-b px-3 py-2.5 md:table-row md:px-0 ip-line">
                    <td className="flex min-w-0 flex-1 items-center gap-3 md:px-4 md:py-2.5">
                      <input type="checkbox" checked={doneTab} onChange={() => (doneTab ? reopen(i) : complete(i))} aria-label={doneTab ? "Reopen" : "Mark complete"} />
                      {i.who ? <Avatar email={i.who} name={i.who} size={28} /> : <CheckSquare size={18} className="ip-muted" />}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.title}</p>
                        <p className="ip-muted truncate text-[12px]">{i.evidence ? `“${i.evidence}”` : i.who ? `From ${i.who}` : "Manual task"}</p>
                      </div>
                    </td>
                    <td className="hidden px-2 md:table-cell"><span className="ip-chip ip-chip-info">{KIND_LABEL[i.kind]}</span></td>
                    <td className="px-2 text-[12.5px]">
                      <span style={{ color: i.due && new Date(i.due) < new Date() && !doneTab ? "var(--ip-high)" : undefined }}>{dueLabel(i.due, boot.prefs.timezone)}</span>
                      {i.due && !i.dueExplicit && <span className="ip-muted block text-[11px]">inferred</span>}
                    </td>
                    <td className="hidden px-2 md:table-cell"><span className={`ip-chip ip-chip-${PRIO_TONE[i.priority] ?? "normal"}`}>{i.priority}</span></td>
                    <td className="hidden px-2 md:table-cell"><span className={`ip-chip ${i.status === "done" ? "ip-chip-low" : i.status === "snoozed" ? "ip-chip-warn" : "ip-chip-teal"}`}>{i.status}</span></td>
                    <td className="px-2">
                      <RowMenu item={i} onComplete={() => complete(i)} onRedate={(d) => redate(i, d)} onSnooze={() => i.fu && updFu.mutate({ id: i.fu.id, body: { snooze: "tomorrow" } }, onErr)} onStop={() => i.fu && updFu.mutate({ id: i.fu.id, body: { disable_tracking: true } }, onErr)} onDraft={() => i.messageId && i.accountId && setComposer({ messageId: i.messageId, accountId: i.accountId })} onCanvas={() => i.task && updTask.mutate({ id: i.task.id, body: { send_to: "canvas" } }, { ...onErr, onSuccess: () => toast({ text: "Added to The Daily Canvas.", tone: "ok" }) })} onAssign={(a) => (i.task ? updTask.mutate({ id: i.task.id, body: { assignee: a } }, onErr) : updFu.mutate({ id: i.fu!.id, body: { assignee: a } }, onErr))} team={boot.workspaces.some((w) => w.kind === "team")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="ip-muted text-[12px]">
          Follow-ups are detected from real conversations; automatic replies and bounces don&apos;t count as answers. Reminder threshold: {boot.prefs.followup_days} business days (<Link href="/inbox/settings" className="underline">change</Link>).
        </p>
      </div>
      <TaskDialog open={newTask} messageId={null} onClose={() => setNewTask(false)} />
      {composer && <Composer messageId={composer.messageId} accountId={composer.accountId} mode="reply_ai" onClose={() => setComposer(null)} />}
    </div>
  );
}

function RowMenu({ item, onComplete, onRedate, onSnooze, onStop, onDraft, onCanvas, onAssign, team }: { item: Item; onComplete: () => void; onRedate: (d: string) => void; onSnooze: () => void; onStop: () => void; onDraft: () => void; onCanvas: () => void; onAssign: (a: string) => void; team: boolean }) {
  const [open, setOpen] = useState(false);
  const close = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div className="relative">
      <button className="ip-btn ip-btn-ghost ip-btn-sm" onClick={() => setOpen((o) => !o)} aria-label="More actions" aria-expanded={open}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="ip-card ip-fade-in absolute right-0 z-20 mt-1 w-56 p-1.5 text-[13px]" onMouseLeave={() => setOpen(false)}>
          <MenuBtn icon={Check} onClick={close(onComplete)}>Mark complete</MenuBtn>
          {item.fu && <MenuBtn icon={Clock} onClick={close(onSnooze)}>Snooze until tomorrow</MenuBtn>}
          <label className="ip-hover flex items-center gap-2 rounded-lg px-2 py-1.5">
            <CalendarClock size={14} /> Due
            <input type="date" className="ip-input !h-7 !py-0" defaultValue={item.due?.slice(0, 10) ?? ""} onChange={(e) => onRedate(e.target.value)} />
          </label>
          {item.messageId && <Link href={`/inbox/mail?view=all&m=${item.messageId}`} className="ip-hover flex items-center gap-2 rounded-lg px-2 py-1.5"><ExternalLink size={14} /> Open original email</Link>}
          {item.messageId && item.kind !== "task" && <MenuBtn icon={Reply} onClick={close(onDraft)}>Draft a follow-up</MenuBtn>}
          {item.fu && item.messageId && <Link href={`/inbox/mail?view=all&m=${item.messageId}&task=1`} className="ip-hover flex items-center gap-2 rounded-lg px-2 py-1.5"><CheckSquare size={14} /> Create a task</Link>}
          {item.task && <MenuBtn icon={CheckSquare} onClick={close(onCanvas)}>Send to The Daily Canvas</MenuBtn>}
          {team && <MenuBtn icon={Plus} onClick={close(() => { const a = prompt("Assign to (name or email)"); if (a) onAssign(a); })}>Assign…</MenuBtn>}
          {item.fu && <MenuBtn icon={Clock} onClick={close(onStop)}>Stop tracking this conversation</MenuBtn>}
        </div>
      )}
    </div>
  );
}

function MenuBtn({ icon: Icon, onClick, children }: { icon: typeof Check; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="ip-hover flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left" onClick={onClick}>
      <Icon size={14} /> {children}
    </button>
  );
}
