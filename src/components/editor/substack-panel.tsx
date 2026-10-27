"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Editor } from "@tiptap/react";
import { AlertTriangle, Check, ClipboardCopy, ExternalLink, Loader2, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Drawer } from "./drawer";

type Fields = { title: string; subtitle: string; description: string; note: string };

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function SubstackPanel({
  supabase,
  documentId,
  editor,
  save,
  onClose,
}: {
  supabase: SupabaseClient;
  documentId: string;
  editor: Editor;
  save: () => Promise<void>;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<Fields | null>(null);
  const [account, setAccount] = useState<{ status: string; account_name: string; meta: { subdomain?: string } } | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ editUrl?: string; error?: string; reconnect?: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchSuggestion = useCallback(async () => {
    await save();
    const res = await fetch("/api/ai/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }) });
    return (await res.json()) as Fields & { error?: string };
  }, [documentId, save]);

  const apply = (body: Fields & { error?: string }) => {
    setFields(body.error ? { title: "", subtitle: "", description: "", note: "" } : body);
    if (body.error) setResult({ error: body.error });
  };

  const suggest = () => {
    setFields(null);
    fetchSuggestion().then(apply);
  };

  useEffect(() => {
    fetchSuggestion().then(apply);
    supabase
      .from("connected_accounts")
      .select("status,account_name,meta")
      .eq("platform", "substack")
      .maybeSingle()
      .then(({ data }) => setAccount(data));
  }, [supabase, fetchSuggestion]);

  const set = (k: keyof Fields, v: string) => setFields((f) => (f ? { ...f, [k]: v } : f));
  const sub = account?.meta?.subdomain;

  async function createDraft() {
    if (!fields) return;
    setBusy("draft");
    setResult(null);
    await save();
    const res = await fetch("/api/substack/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, ...fields }) });
    const body = (await res.json()) as { editUrl?: string; error?: string; reconnect?: boolean };
    setResult(body);
    if (body.reconnect) setAccount((a) => (a ? { ...a, status: "expired" } : a));
    setBusy(null);
  }

  async function copyFormatted() {
    if (!fields) return;
    const html = `<h1>${escapeHtml(fields.title)}</h1><h3>${escapeHtml(fields.subtitle)}</h3>${editor.getHTML()}`;
    const plain = `${fields.title}\n${fields.subtitle}\n\n${editor.getText({ blockSeparator: "\n\n" })}`;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([plain], { type: "text/plain" }) }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    setCopied("post");
    window.open(sub ? `https://${sub}.substack.com/publish/post?type=newsletter` : "https://substack.com/publish", "_blank", "noopener");
  }

  async function copyNote() {
    if (!fields) return;
    await navigator.clipboard.writeText(fields.note);
    setCopied("note");
    window.open("https://substack.com/notes", "_blank", "noopener");
  }

  const field = "mt-1 w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none [field-sizing:content] focus:ring-2 focus:ring-accent";
  const connected = account?.status === "connected";

  return (
    <Drawer
      title="Send to Substack"
      onClose={onClose}
      actions={
        <button onClick={suggest} disabled={!fields} aria-label="Suggest again" title="Suggest again" className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-ink disabled:opacity-40">
          <RotateCcw size={16} />
        </button>
      }
    >
      <div className="space-y-4 p-5 text-sm">
        {!fields ? (
          <p className="flex items-center gap-2 py-6 text-accent"><Loader2 size={15} className="animate-spin" /> Packaging your newsletter…</p>
        ) : (
          <>
            <label className="block font-medium">Title<input value={fields.title} onChange={(e) => set("title", e.target.value)} className={field} /></label>
            <label className="block font-medium">Subtitle<textarea value={fields.subtitle} onChange={(e) => set("subtitle", e.target.value)} rows={2} className={field} /></label>
            <label className="block font-medium">
              Preview text <span className="font-normal text-muted">(search & social description)</span>
              <textarea value={fields.description} onChange={(e) => set("description", e.target.value)} rows={2} className={field} />
            </label>

            {account === null && (
              <p className="text-muted">Connect Substack in <Link href="/settings#accounts" className="text-accent underline">Settings</Link> to create drafts directly, or use the copy button below.</p>
            )}
            {account && !connected && (
              <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-red-700 dark:text-rose-300">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" /> The Substack connection stopped working. <Link href="/settings#accounts" className="underline">Reconnect</Link> or use the copy button.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {connected && (
                <button onClick={createDraft} disabled={!!busy || !fields.title.trim()} className="bg-gradient-brand flex items-center justify-center gap-2 rounded-full px-4 py-2.5 font-medium text-white disabled:opacity-50">
                  {busy === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Create Substack draft
                </button>
              )}
              <button onClick={copyFormatted} className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 ring-1 ring-line hover:bg-surface-strong">
                {copied === "post" ? <Check size={15} /> : <ClipboardCopy size={15} />} Copy formatted + open Substack
              </button>
            </div>
            {copied === "post" && <p className="text-xs text-muted">Copied. In Substack, click into the post body and paste. Formatting comes along.</p>}
            {result?.editUrl && (
              <a href={result.editUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-neutral-500/10 px-3 py-2 text-neutral-800 dark:text-neutral-300">
                <Check size={15} /> Draft created. Open it in Substack <ExternalLink size={13} />
              </a>
            )}
            {result?.error && <p className="text-red-700 dark:text-red-400">{result.error}</p>}

            <div className="border-t border-line pt-4">
              <p className="font-medium">Substack Note</p>
              <p className="text-xs text-muted">Notes can’t be saved as drafts through any API, so this copies it and opens Notes for you.</p>
              <textarea value={fields.note} onChange={(e) => set("note", e.target.value)} rows={3} className={field} />
              <button onClick={copyNote} disabled={!fields.note.trim()} className="mt-2 flex items-center gap-2 rounded-full px-4 py-2 ring-1 ring-line hover:bg-surface-strong disabled:opacity-50">
                {copied === "note" ? <Check size={15} /> : <ClipboardCopy size={15} />} Copy note + open Notes
              </button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
