"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type Version, timeAgo } from "@/lib/docs";
import { Drawer } from "./drawer";

export function HistoryPanel({
  supabase,
  documentId,
  onSaveVersion,
  onRestore,
  onClose,
}: {
  supabase: SupabaseClient;
  documentId: string;
  onSaveVersion: () => Promise<void>;
  onRestore: (v: Version) => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("document_versions")
      .select("id,label,title,content,content_text,created_at")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(100);
    return (data as Version[]) ?? [];
  }, [supabase, documentId]);

  useEffect(() => {
    load().then(setVersions);
  }, [load]);

  async function saveNow() {
    setBusy(true);
    await onSaveVersion();
    setVersions(await load());
    setBusy(false);
  }

  async function restore(v: Version) {
    setBusy(true);
    await onRestore(v);
    setVersions(await load());
    setOpen(null);
    setBusy(false);
  }

  return (
    <Drawer
      title="Version history"
      onClose={onClose}
      actions={
        <button
          onClick={saveNow}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:bg-surface-strong hover:text-ink disabled:opacity-50"
        >
          <Save size={14} /> Save now
        </button>
      }
    >
      <p className="px-5 pt-4 text-sm text-muted">
        A snapshot is saved before every AI change, each time you open the doc, and whenever you tap Save now.
      </p>
      <ul className="space-y-1 p-3">
        {versions === null && (
          <li className="flex justify-center py-8 text-muted">
            <Loader2 className="animate-spin" />
          </li>
        )}
        {versions?.length === 0 && (
          <li className="flex flex-col items-center py-10 text-center text-muted">
            <History />
            <p className="mt-2 text-sm">No versions yet.</p>
          </li>
        )}
        {versions?.map((v) => (
          <li key={v.id} className="rounded-2xl transition hover:bg-surface-strong/70">
            <button onClick={() => setOpen(open === v.id ? null : v.id)} className="w-full px-3 py-2.5 text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{v.label}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(v.created_at)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{v.content_text.slice(0, 120) || "Empty"}</p>
            </button>
            {open === v.id && (
              <div className="px-3 pb-3">
                <div className="max-h-60 overflow-y-auto rounded-xl bg-surface p-3 text-sm leading-relaxed whitespace-pre-wrap ring-1 ring-line">
                  {v.title && <p className="mb-2 font-display text-lg">{v.title}</p>}
                  {v.content_text || "Empty"}
                </div>
                <button
                  onClick={() => restore(v)}
                  disabled={busy}
                  className="bg-gradient-brand mt-2 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  <RotateCcw size={14} /> Restore this version
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
