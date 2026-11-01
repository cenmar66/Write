"use client";

import { Bot, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, type ListMessage } from "./api";
import { Spinner, timeLabel } from "./ui";

interface Turn {
  q: string;
  a?: { answer: string; insufficient: boolean; sources: ListMessage[]; related: ListMessage[]; followups: { id: string; title: string; kind: string }[]; proposals: { label: string; href: string }[]; ai: boolean; ai_note?: string };
  error?: string;
}

const EXAMPLES = ["What is the most important thing I need to handle today?", "Which clients are waiting for me?", "Which messages did I send last week that have not received a reply?", "What invoices am I waiting to receive?"];

/** Read-only assistant: answers come with the messages they're based on. It can't act. */
export function AssistantPanel({ open, initial, nonce, onClose }: { open: boolean; initial?: string; nonce?: number; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { q: text }]);
    try {
      const a = await api<NonNullable<Turn["a"]>>("/assistant", { method: "POST", json: { question: text, ws: localStorage.getItem("ip.ws") ?? "all" } });
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e instanceof Error ? e.message : "Failed" } : x)));
    }
    setBusy(false);
  };

  // A new question from the search bar (or a page) arrives as `initial` + a fresh `nonce`.
  useEffect(() => {
    if (open && initial) void ask(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, nonce]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  if (!open) return null;
  return (
    <aside className="fixed inset-0 z-40 flex flex-col border-l md:static md:w-[380px] ip-line ip-fade-in" style={{ background: "var(--ip-surface)" }} aria-label="AI assistant">
      <div className="flex items-center gap-2 border-b px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 ip-line">
        <Bot size={17} style={{ color: "var(--ip-accent)" }} />
        <h2 className="font-semibold">Assistant</h2>
        <span className="ip-chip">Read-only</span>
        <button className="ip-btn ip-btn-ghost ip-btn-sm ml-auto" onClick={onClose} aria-label="Close assistant">
          <X size={16} />
        </button>
      </div>
      <div className="ip-scroll flex-1 space-y-4 p-4">
        {!turns.length && (
          <div>
            <p className="ip-muted text-[13px]">Ask about your mail, tasks and follow-ups. Answers cite the messages they come from. I can point you to actions, but I never send, delete or change anything.</p>
            <div className="mt-3 flex flex-col gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} className="ip-btn h-auto justify-start py-2 text-left text-[12.5px] whitespace-normal" onClick={() => ask(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="ml-8 rounded-xl px-3 py-2 text-[13px]" style={{ background: "var(--ip-accent-soft)" }}>{t.q}</div>
            {!t.a && !t.error && <Spinner />}
            {t.error && <p className="text-[13px]" style={{ color: "var(--ip-crit)" }}>{t.error}</p>}
            {t.a && (
              <div className="space-y-2 text-[13px]">
                <p className="whitespace-pre-wrap">{t.a.answer}</p>
                {t.a.insufficient && <p className="ip-chip ip-chip-warn">Not enough evidence in your accessible mail</p>}
                {!t.a.ai && <p className="ip-muted text-[11.5px]">Answered without AI (rule-based search){t.a.ai_note ? `: ${t.a.ai_note}` : ""}.</p>}
                {t.a.followups.length > 0 && (
                  <ul className="space-y-1">
                    {t.a.followups.slice(0, 6).map((f) => (
                      <li key={f.id} className="ip-muted text-[12px]">• {f.title}</li>
                    ))}
                  </ul>
                )}
                {t.a.sources.length > 0 && (
                  <div>
                    <p className="ip-muted mb-1 text-[11px] font-semibold uppercase tracking-wider">Sources</p>
                    {t.a.sources.map((m) => (
                      <Link key={m.id} href={`/inbox/mail?view=all&m=${m.id}`} className="ip-hover block rounded-lg border px-2.5 py-1.5 ip-line mb-1.5">
                        <span className="font-medium">{m.from_name || m.from_email}</span> <span className="ip-muted">· {timeLabel(m.received_at)}</span>
                        <span className="block truncate">{m.subject}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {t.a.proposals.map((p) => (
                  <Link key={p.href} href={p.href} className="ip-btn ip-btn-sm">{p.label}</Link>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t p-3 pb-[max(12px,env(safe-area-inset-bottom))] ip-line" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <input className="ip-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about your inbox…" aria-label="Question" />
        <button className="ip-btn ip-btn-primary" disabled={busy || !q.trim()} aria-label="Ask">
          {busy ? <Spinner size={14} /> : <Send size={14} />}
        </button>
      </form>
    </aside>
  );
}
