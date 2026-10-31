"use client";

import { AlertTriangle, Mic, MicOff, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Address } from "@/lib/inbox/types";
import { api, useAct, type Draft } from "./api";
import { useScope } from "./shell";
import { Dialog, Spinner, errText, useToast } from "./ui";

const DRAFT_ACTIONS = [
  ["reply", "Draft a reply"],
  ["clarify", "Ask for clarification"],
  ["decline", "Decline politely"],
  ["follow_up", "Follow up (no answer yet)"],
  ["next_steps", "Propose next steps"],
] as const;
const REWRITES = [
  ["shorten", "Shorter"],
  ["expand", "Longer"],
  ["professional", "More professional"],
  ["friendlier", "Friendlier"],
  ["direct", "More direct"],
  ["translate_en", "→ English"],
  ["translate_es", "→ Español"],
] as const;

const fmt = (list: Address[]) => list.map((a) => a.email).join(", ");
const parse = (s: string): Address[] => s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean).map((email) => ({ email, name: "" }));

interface Review {
  from: string;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  body: string;
  attachments: string[];
  demo: boolean;
  errors: string[];
  warnings: string[];
  token: string | null;
}

/**
 * mode: "reply" (blank reply), "reply_ai" (start with AI options), or "draft:<id>" (continue).
 * AI can draft and revise; only the person pressing "Send" on the review screen sends.
 */
export function Composer({ messageId, accountId, mode, onClose }: { messageId: string; accountId: string; mode: string; onClose: () => void }) {
  const { boot } = useScope();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [language, setLanguage] = useState(boot.prefs.writing_profile.language ?? "en");
  const [review, setReview] = useState<Review | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const aiOn = boot.server.ai.available && boot.prefs.ai_drafts;

  const load = (d: Draft, n = "") => {
    setDraft(d);
    setTo(fmt(d.to_addrs));
    setCc(fmt(d.cc_addrs));
    setBcc(fmt(d.bcc_addrs));
    setSubject(d.subject);
    setBody(d.body);
    setNotes(n);
  };

  const create = async (action: string) => {
    setBusy(action);
    try {
      const r = await api<{ draft: Draft; notes: string }>("/drafts", { method: "POST", json: { message_id: messageId, account_id: accountId, action, instructions, language } });
      load(r.draft, r.notes);
    } catch (e) {
      toast({ text: errText(e), tone: "error" });
    }
    setBusy(null);
  };

  useEffect(() => {
    if (mode.startsWith("draft:")) {
      api<{ message: unknown; drafts: Draft[] }>(`/messages/${messageId}`).then((r) => {
        const d = r.drafts.find((x) => x.id === mode.slice(6));
        if (d) load(d);
      });
    } else if (mode === "reply") void Promise.resolve().then(() => create("blank"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (extra: Record<string, unknown> = {}) => {
    if (!draft) return null;
    const r = await api<{ draft: Draft; notes: string }>(`/drafts/${draft.id}`, { method: "PATCH", json: { to: parse(to), cc: parse(cc), bcc: parse(bcc), subject, body, ...extra } });
    load(r.draft, r.notes || notes);
    return r.draft;
  };
  const rewrite = async (k: string) => {
    setBusy(k);
    try {
      await save({ rewrite: k });
    } catch (e) {
      toast({ text: errText(e), tone: "error" });
    }
    setBusy(null);
  };
  const openReview = async () => {
    setBusy("review");
    try {
      await save();
      setReview(await api<Review>(`/drafts/${draft!.id}/send`));
      setConfirmed(false);
    } catch (e) {
      toast({ text: errText(e), tone: "error" });
    }
    setBusy(null);
  };
  const send = useAct(() => api<{ demo: boolean }>(`/drafts/${draft!.id}/send`, { method: "POST", json: { token: review!.token, confirmed: true } }), {
    onSuccess: (r) => {
      toast({ text: r.demo ? "Recorded in the demo mailbox (nothing was actually sent)." : "Sent.", tone: "ok" });
      onClose();
    },
  });
  const discard = useAct(() => api(`/drafts/${draft!.id}`, { method: "DELETE" }), { onSuccess: onClose });

  if (review) {
    return (
      <Dialog open title="Review before sending" onClose={() => setReview(null)} wide>
        <div className="space-y-3 text-[13px]">
          {review.demo && <p className="ip-chip ip-chip-warn">Demo account: this will be recorded locally, not sent.</p>}
          <dl className="grid grid-cols-[70px_1fr] gap-x-3 gap-y-1.5">
            <dt className="ip-muted">From</dt><dd className="font-semibold">{review.from}</dd>
            <dt className="ip-muted">To</dt><dd className="font-semibold">{fmt(review.to) || "—"}</dd>
            <dt className="ip-muted">Cc</dt><dd>{fmt(review.cc) || "—"}</dd>
            <dt className="ip-muted">Bcc</dt><dd>{fmt(review.bcc) || "—"}</dd>
            <dt className="ip-muted">Subject</dt><dd>{review.subject}</dd>
            <dt className="ip-muted">Attachments</dt><dd>{review.attachments.length ? review.attachments.join(", ") : "None"}</dd>
          </dl>
          <div className="ip-body-text max-h-60 overflow-auto rounded-lg border p-3 ip-line">{review.body}</div>
          {review.errors.map((e) => <p key={e} className="flex gap-1.5" style={{ color: "var(--ip-crit)" }}><AlertTriangle size={14} /> {e}</p>)}
          {review.warnings.map((w) => <p key={w} className="flex gap-1.5" style={{ color: "var(--ip-warn)" }}><AlertTriangle size={14} /> {w}</p>)}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!review.token} />
            I&apos;ve checked the sender, recipients and content.
          </label>
          <div className="flex justify-end gap-2">
            <button className="ip-btn" onClick={() => setReview(null)}>Back to editing</button>
            <button className="ip-btn ip-btn-primary" disabled={!confirmed || !review.token || send.isPending} onClick={() => send.mutate(undefined, { onError: (e) => toast({ text: errText(e), tone: "error" }) })}>
              {send.isPending ? <Spinner size={14} /> : <Send size={14} />} Send now
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open title={draft ? (draft.ai_generated ? "AI draft — edit before sending" : "Reply") : "Draft a reply"} onClose={onClose} wide>
      {!draft ? (
        <div className="space-y-3 text-[13px]">
          {!aiOn && <p className="ip-chip ip-chip-warn">{boot.server.ai.reason ?? "AI drafting is off in Settings."}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {DRAFT_ACTIONS.map(([k, l]) => (
              <button key={k} className="ip-btn justify-start" disabled={!aiOn || !!busy} onClick={() => create(k)}>
                {busy === k ? <Spinner size={13} /> : <Sparkles size={13} />} {l}
              </button>
            ))}
            <button className="ip-btn justify-start" disabled={!!busy} onClick={() => create("blank")}>Write it myself</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
            <input className="ip-input" placeholder="Optional instructions (e.g. “accept, propose Tuesday”)" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            <select className="ip-select" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 text-[13px]">
          <Field label="To"><input className="ip-input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Cc"><input className="ip-input" value={cc} onChange={(e) => setCc(e.target.value)} /></Field>
          <Field label="Bcc"><input className="ip-input" value={bcc} onChange={(e) => setBcc(e.target.value)} /></Field>
          <Field label="Subject"><input className="ip-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <div className="relative">
            <textarea className="ip-textarea !min-h-[220px]" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
            <Dictation onText={(t) => setBody((b) => (b ? `${b.replace(/\s*$/, "")} ${t}` : t))} lang={language === "es" ? "es-ES" : "en-US"} />
          </div>
          {notes && <p className="ip-muted text-[12px]">AI note: {notes}</p>}
          {aiOn && (
            <div className="flex flex-wrap gap-1.5">
              {REWRITES.map(([k, l]) => (
                <button key={k} className="ip-btn ip-btn-sm" disabled={!!busy || !body.trim()} onClick={() => rewrite(k)}>
                  {busy === k ? <Spinner size={12} /> : null} {l}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <button className="ip-btn ip-btn-danger" onClick={() => discard.mutate(undefined)}><Trash2 size={14} /> Discard</button>
            <div className="flex gap-2">
              <button className="ip-btn" onClick={() => save().then(() => toast({ text: "Draft saved.", tone: "ok" })).catch((e) => toast({ text: errText(e), tone: "error" }))}>Save draft</button>
              <button className="ip-btn ip-btn-primary" onClick={openReview} disabled={busy === "review"}>
                {busy === "review" ? <Spinner size={14} /> : <Send size={14} />} Review &amp; send
              </button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_1fr] items-center gap-2">
      <span className="ip-muted">{label}</span>
      {children}
    </label>
  );
}

// Browser speech recognition (Web Speech API). Only inserts text; it can never send.
type Rec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: (e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void; onend: () => void; onerror: (e: { error: string }) => void };

function Dictation({ onText, lang }: { onText: (t: string) => void; lang: string }) {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const Ctor = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition) : undefined;
  const toggle = () => {
    if (!Ctor) {
      setMsg("Voice dictation isn't supported in this browser. Use your keyboard's dictation key instead.");
      return;
    }
    if (on) {
      rec.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = (e) => {
      setMsg(e.error === "not-allowed" ? "Microphone permission was denied." : `Dictation stopped (${e.error}).`);
      setOn(false);
    };
    rec.current = r;
    r.start();
    setOn(true);
    setMsg(null);
  };
  return (
    <div className="absolute bottom-2 right-2 flex items-center gap-2">
      {msg && <span className="ip-muted text-[11px]">{msg}</span>}
      <button type="button" className="ip-btn ip-btn-sm" onClick={toggle} aria-pressed={on} aria-label={on ? "Stop dictation" : "Dictate"} title="Dictate (inserts text only; never sends)">
        {on ? <MicOff size={13} style={{ color: "var(--ip-crit)" }} /> : <Mic size={13} />}
      </button>
    </div>
  );
}
