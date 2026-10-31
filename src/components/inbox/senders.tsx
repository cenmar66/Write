"use client";

import { useQuery } from "@tanstack/react-query";
import { BellOff, Search, Star, UserCheck, UserX, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { SenderRow } from "@/lib/inbox/types";
import { api, ApiError, useAct } from "./api";
import { useScope } from "./shell";
import { Avatar, Empty, Skeleton, errText, useToast } from "./ui";

const FILTERS = [["", "All"], ["new", "First-time senders"], ["vip", "VIP"], ["newsletters", "Newsletters"], ["screened", "Screened out"], ["blocked", "Hidden"]] as const;

export function SendersPage() {
  const { ws, boot } = useScope();
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["senders", ws, filter, q], queryFn: () => api<{ senders: SenderRow[] }>(`/senders?${new URLSearchParams({ ws, filter, q })}`).then((r) => r.senders) });
  const toast = useToast();
  const upd = useAct((a: { id: string; body: Record<string, unknown> }) => api<{ affected: number }>(`/senders/${a.id}`, { method: "PATCH", json: a.body }));
  const change = (s: SenderRow, body: Record<string, unknown>) =>
    upd.mutate({ id: s.id, body }, {
      onSuccess: () => toast({ text: "Saved.", tone: "ok" }),
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409 && confirm(e.message)) upd.mutate({ id: s.id, body: { ...body, confirm: true } }, { onSuccess: (r) => toast({ text: `Done. ${r.affected} message(s) re-filed in InboxPilot.`, tone: "ok" }) });
        else if (!(e instanceof ApiError && e.status === 409)) toast({ text: errText(e), tone: "error" });
      },
    });
  const cats = [...new Map(boot.categories.map((c) => [c.key, c])).values()];

  return (
    <div className="ip-scroll h-full">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
        <h1 className="text-[22px] font-bold tracking-tight">Sender Control Center</h1>
        <p className="ip-muted text-[13px]">Decide how InboxPilot treats each sender. Hiding or screening never deletes mail and never touches Gmail&apos;s spam folder. InboxPilot never opens unsubscribe links for you.</p>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-52 flex-1">
            <Search size={14} className="ip-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="ip-input !pl-8" placeholder="Search senders" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search senders" />
          </div>
          <div className="flex gap-1 overflow-x-auto" role="tablist">
            {FILTERS.map(([k, l]) => <button key={k} role="tab" className="ip-tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
        </div>
        <div className="ip-card">
          {list.isLoading ? (
            <Skeleton rows={6} />
          ) : !list.data?.length ? (
            <Empty title="No senders here">Senders appear as mail is synced.</Empty>
          ) : (
            <ul>
              {list.data.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 ip-line last:border-0">
                  <Avatar name={s.display_name} email={s.email} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.display_name || s.email} {s.is_vip && <Star size={12} className="inline" fill="currentColor" style={{ color: "var(--ip-mid)" }} />}</p>
                    <p className="ip-muted truncate text-[12px]">{s.email} · {s.received_count} received · replied {s.replied_count}× · <Link className="underline" href={`/inbox/mail?view=all&q=${encodeURIComponent(`from:${s.email}`)}`}>history</Link></p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Toggle on={s.is_vip} onClick={() => change(s, { is_vip: !s.is_vip })} icon={Star} label="VIP" />
                    <Toggle on={s.always_priority} onClick={() => change(s, { always_priority: !s.always_priority })} icon={UserCheck} label="Always prioritize" />
                    <Toggle on={s.suppress_notifications} onClick={() => change(s, { suppress_notifications: !s.suppress_notifications })} icon={BellOff} label="Mute" />
                    <Toggle on={s.screening === "screened_out"} onClick={() => change(s, { screening: s.screening === "screened_out" ? "approved" : "screened_out" })} icon={UserX} label="Screen out" />
                    <Toggle on={s.blocked} onClick={() => change(s, s.blocked ? { blocked: false } : { blocked: true, apply_to_existing: true })} icon={EyeOff} label="Hide" />
                    <select className="ip-select !h-7 !w-36 text-[12px]" value={s.default_category ?? ""} onChange={(e) => change(s, { default_category: e.target.value || null, apply_to_existing: !!e.target.value })} aria-label="Default category">
                      <option value="">Auto category</option>
                      {cats.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Star; label: string }) {
  return (
    <button className="ip-btn ip-btn-sm" aria-pressed={on} onClick={onClick} style={on ? { background: "var(--ip-accent-soft)", color: "var(--ip-accent)", borderColor: "transparent" } : undefined}>
      <Icon size={12} /> {label}
    </button>
  );
}
