"use client";

import { ArrowUp, FileDown, FilePlus, FileText, Loader2, Mic, Paperclip, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DictationPanel } from "@/components/dictation/dictation-panel";
import { StyleSelect } from "@/components/style-select";
import { type Brief, briefKey } from "@/lib/docs";
import { IMPORT_ACCEPT, importFiles, readFileText } from "@/lib/import-docs";
import { createClient } from "@/lib/supabase/client";

type Draft = { id: string; title: string; content_text: string; updated_at: string };
type Attachment = { name: string; text: string };

const DAY = 86_400_000;

function groupDrafts(drafts: Draft[], now: number) {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const groups: { label: string; items: Draft[] }[] = [
    { label: "Today", items: [] },
    { label: "Last 7 Days", items: [] },
    { label: "Last 30 Days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const d of drafts) {
    const t = new Date(d.updated_at).getTime();
    const i = t >= startOfToday ? 0 : t >= startOfToday - 6 * DAY ? 1 : t >= startOfToday - 29 * DAY ? 2 : 3;
    groups[i].items.push(d);
  }
  return groups.filter((g) => g.items.length);
}

export function HomeScreen() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [styleId, setStyleId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState<null | "draft" | "import" | "new">(null);
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(0);
  const attachInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    let q = supabase
      .from("documents")
      .select("id,title,content_text,updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(60);
    const term = query.trim().replace(/[%,()]/g, " ");
    if (term) q = q.or(`title.ilike.%${term}%,content_text.ilike.%${term}%`);
    const { data } = await q;
    return (data as Draft[]) ?? [];
  }, [supabase, query]);

  useEffect(() => {
    const t = setTimeout(
      () =>
        load().then((d) => {
          setNow(Date.now());
          setDrafts(d);
        }),
      query ? 250 : 0,
    );
    return () => clearTimeout(t);
  }, [load, query]);

  async function createDoc(extra: Record<string, unknown> = {}) {
    const { data, error } = await supabase.from("documents").insert(extra).select("id").single();
    if (error || !data) throw new Error("Couldn't create the document. Check your connection and try again.");
    return data.id as string;
  }

  async function startDraft() {
    if (!brief.trim() || busy) return;
    setBusy("draft");
    setError(null);
    try {
      const realStyle = styleId && styleId !== "none" ? styleId : null;
      const id = await createDoc(realStyle ? { style_id: realStyle } : {});
      const payload: Brief = {
        brief: brief.trim(),
        styleId,
        sources: attachments.map((a) => `<file name="${a.name.replace(/"/g, "'")}">\n${a.text}\n</file>`).join("\n\n"),
      };
      sessionStorage.setItem(briefKey(id), JSON.stringify(payload));
      router.push(`/docs/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function newDraft() {
    setBusy("new");
    try {
      router.push(`/docs/${await createDoc()}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function onImport(files: FileList | null) {
    if (!files?.length) return;
    setBusy("import");
    setError(null);
    try {
      const { ids, skipped } = await importFiles(supabase, Array.from(files));
      if (skipped.length) setError(`Skipped ${skipped.join(", ")}: not a text file (PDFs: copy and paste the text).`);
      if (ids.length === 1 && !skipped.length) return router.push(`/docs/${ids[0]}`);
      setDrafts(await load());
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
    if (importInput.current) importInput.current.value = "";
  }

  async function onAttach(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      try {
        const text = await readFileText(file);
        setAttachments((a) => [...a, { name: file.name, text }]);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (attachInput.current) attachInput.current.value = "";
  }

  async function trash(id: string) {
    setDrafts((d) => d?.filter((x) => x.id !== id) ?? null);
    await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  }

  const groups = drafts ? groupDrafts(drafts, now) : [];

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <h1 className="animate-rise pt-6 text-center font-display text-4xl leading-tight tracking-tight sm:pt-16 sm:text-5xl">
        What story are we telling today?
      </h1>

      {/* Prompt box */}
      <section
        style={{ animationDelay: "80ms" }}
        className="animate-rise relative z-20 mt-8 rounded-3xl border border-line bg-bg p-3 shadow-[0_12px_40px_-24px_rgba(40,30,90,0.25)] transition focus-within:border-accent/50 sm:mt-10"
      >
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              startDraft();
            }
          }}
          rows={3}
          placeholder="Describe a story you’d like to bring to life…"
          aria-label="Describe what you want to write"
          className="max-h-[50dvh] min-h-24 w-full resize-none bg-transparent px-2 pt-1 text-[17px] leading-relaxed outline-none [field-sizing:content] placeholder:text-muted"
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-2">
            {attachments.map((a, i) => (
              <span key={`${a.name}-${i}`} className="flex items-center gap-1.5 rounded-full bg-surface-strong py-1 pr-1.5 pl-3 text-xs">
                <Paperclip size={12} /> <span className="max-w-48 truncate">{a.name}</span>
                <button onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`} className="rounded-full p-0.5 opacity-60 hover:opacity-100">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => attachInput.current?.click()}
            aria-label="Attach reference files"
            title="Attach notes or sources (any text file or Word doc)"
            className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-strong hover:text-ink"
          >
            <Plus size={19} />
          </button>
          <input ref={attachInput} type="file" multiple accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => onAttach(e.target.files)} />
          <StyleSelect value={styleId} onChange={setStyleId} />
          <button
            onClick={() => setDictating(true)}
            aria-label="Dictate"
            title="Dictate in English or Spanish"
            className="ml-auto grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-strong hover:text-ink"
          >
            <Mic size={18} />
          </button>
          <button
            onClick={startDraft}
            disabled={!brief.trim() || !!busy}
            aria-label="Write the draft"
            className="grid size-10 place-items-center rounded-full bg-ink text-bg transition enabled:hover:scale-105 disabled:bg-surface-strong disabled:text-muted"
          >
            {busy === "draft" ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} />}
          </button>
        </div>
      </section>

      {error && <p className="mt-3 text-center text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div style={{ animationDelay: "140ms" }} className="animate-rise mt-8 flex justify-center gap-3">
        <button onClick={() => importInput.current?.click()} disabled={!!busy} className="flex items-center gap-2 rounded-full px-4 py-2 text-sm ring-1 ring-line transition hover:bg-surface-strong disabled:opacity-60">
          {busy === "import" ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Import draft
        </button>
        <input ref={importInput} type="file" multiple accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => onImport(e.target.files)} />
        <button onClick={newDraft} disabled={!!busy} className="flex items-center gap-2 rounded-full px-4 py-2 text-sm ring-1 ring-line transition hover:bg-surface-strong disabled:opacity-60">
          {busy === "new" ? <Loader2 size={16} className="animate-spin" /> : <FilePlus size={16} />} New draft
        </button>
      </div>

      {/* Drafts */}
      <section style={{ animationDelay: "200ms" }} className="animate-rise mt-14 sm:mt-20">
        <div className="flex items-center justify-between gap-3">
          {searching ? (
            <label className="flex flex-1 items-center gap-2 rounded-full px-3 py-1.5 ring-1 ring-line focus-within:ring-accent">
              <Search size={16} className="text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your drafts"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
              <button
                onClick={() => {
                  setQuery("");
                  setSearching(false);
                }}
                aria-label="Close search"
                className="text-muted hover:text-ink"
              >
                <X size={15} />
              </button>
            </label>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight">Drafts</h2>
              <button onClick={() => setSearching(true)} aria-label="Search drafts" className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-ink">
                <Search size={18} />
              </button>
            </>
          )}
        </div>

        {drafts === null && (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-strong" />
            ))}
          </div>
        )}
        {drafts?.length === 0 && (
          <p className="mt-8 text-center text-muted">{query ? "Nothing matches that." : "Your drafts will show up here."}</p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mt-6">
            <h3 className="text-sm font-medium">{g.label}</h3>
            <ul className="mt-2 space-y-2">
              {g.items.map((d) => (
                <li key={d.id} className="group relative">
                  <Link
                    href={`/docs/${d.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5 transition hover:bg-surface-strong/60"
                  >
                    <FileText size={18} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{d.title || d.content_text.slice(0, 80) || "Untitled"}</span>
                    <span className="shrink-0 text-sm text-muted transition group-hover:opacity-0">
                      {new Date(d.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </Link>
                  <button
                    onClick={() => trash(d.id)}
                    aria-label={`Move ${d.title || "draft"} to trash`}
                    title="Move to trash"
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-2 text-muted opacity-0 transition group-hover:opacity-100 hover:bg-bg hover:text-red-700 dark:hover:text-red-400 focus:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {drafts && drafts.length >= 60 && (
          <Link href="/docs" className="mt-4 block text-center text-sm text-accent hover:underline">
            See all documents
          </Link>
        )}
      </section>

      {dictating && (
        <DictationPanel
          startNow
          onInsert={(text) => setBrief((b) => (b.trim() ? `${b.trimEnd()}\n\n${text}` : text))}
          onCommand={() => setError("Voice commands work inside documents. Here, just describe your idea.")}
          onClose={() => setDictating(false)}
        />
      )}
    </div>
  );
}
