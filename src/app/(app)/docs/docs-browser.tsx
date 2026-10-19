"use client";

import { FileDown, FileText, FolderInput, FolderPlus, Loader2, MoreHorizontal, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type DocSummary, type Folder, timeAgo } from "@/lib/docs";
import { IMPORT_ACCEPT, importFiles } from "@/lib/import-docs";
import { createClient } from "@/lib/supabase/client";

export function DocsBrowser() {
  const supabase = useMemo(() => createClient(), []);
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const router = useRouter();
  const params = useSearchParams();
  const trashView = params.get("view") === "trash";
  const folder: string | "all" = params.get("folder") ?? "all";
  const setFolder = (f: string | "all") => router.replace(f === "all" ? "/docs" : `/docs?folder=${f}`);
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const foldersChanged = () => window.dispatchEvent(new Event("folders-changed"));

  const load = useCallback(async () => {
    let q = supabase
      .from("documents")
      .select("id,title,content_text,folder_id,word_count,updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    q = trashView ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    if (folder !== "all" && !trashView) q = q.eq("folder_id", folder);
    const term = query.trim().replace(/[%,()]/g, " ");
    if (term) q = q.or(`title.ilike.%${term}%,content_text.ilike.%${term}%`);
    const [{ data: d }, { data: f }] = await Promise.all([
      q,
      supabase.from("folders").select("id,name").order("name"),
    ]);
    setDocs(d ?? []);
    setFolders(f ?? []);
  }, [supabase, folder, query, trashView]);

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  async function newFolder() {
    const name = prompt("Folder name")?.trim();
    if (!name) return;
    const { data } = await supabase.from("folders").insert({ name }).select("id").single();
    foldersChanged();
    if (data) setFolder(data.id);
  }

  async function deleteFolder(id: string) {
    if (!confirm("Delete this folder? Documents inside are kept.")) return;
    await supabase.from("folders").delete().eq("id", id);
    foldersChanged();
    setFolder("all");
  }

  async function moveDoc(id: string, folderId: string | null) {
    setMenuFor(null);
    await supabase.from("documents").update({ folder_id: folderId }).eq("id", id);
    load();
  }

  async function deleteDoc(id: string) {
    setMenuFor(null);
    await supabase.from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    setNotice("Moved to Trash.");
    load();
  }

  async function restoreDoc(id: string) {
    await supabase.from("documents").update({ deleted_at: null }).eq("id", id);
    load();
  }

  async function deleteForever(id: string) {
    if (!confirm("Delete this document forever? This can't be undone.")) return;
    await supabase.from("documents").delete().eq("id", id);
    load();
  }

  async function emptyTrash() {
    if (!confirm("Empty the trash? Everything in it is deleted forever.")) return;
    await supabase.from("documents").delete().not("deleted_at", "is", null);
    load();
  }

  async function onImport(files: FileList | null) {
    if (!files?.length) return;
    setImporting(true);
    setNotice(null);
    try {
      const { ids, skipped } = await importFiles(supabase, Array.from(files), { folderId: folder === "all" ? null : folder });
      setNotice(
        [ids.length && `Imported ${ids.length === 1 ? "1 document" : `${ids.length} documents`}.`, skipped.length && `Skipped ${skipped.join(", ")} (use .txt, .md, .docx, or .html).`]
          .filter(Boolean)
          .join(" "),
      );
      load();
    } catch (e) {
      setNotice((e as Error).message);
    }
    setImporting(false);
    if (importInput.current) importInput.current.value = "";
  }

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;
  const newHref = folder === "all" ? "/docs/new" : `/docs/new?folder=${folder}`;

  return (
    <div className="animate-rise">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">{trashView ? "Trash" : folder !== "all" ? (folderName(folder) ?? "Folder") : "Documents"}</h1>
          <p className="mt-1 text-muted">{trashView ? "Deleted documents wait here until you empty the trash." : "Everything you’ve written, in one place."}</p>
        </div>
        {trashView ? (
          <button onClick={emptyTrash} disabled={!docs?.length} className="flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm text-rose-500 ring-1 ring-line transition hover:bg-surface-strong disabled:opacity-40">
            <Trash2 size={16} /> Empty trash
          </button>
        ) : (
        <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => importInput.current?.click()}
          disabled={importing}
          className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm ring-1 ring-line transition hover:bg-surface-strong disabled:opacity-60"
        >
          {importing ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Import
        </button>
        <input ref={importInput} type="file" multiple accept={IMPORT_ACCEPT} className="hidden" onChange={(e) => onImport(e.target.files)} />
        <Link
          href={newHref}
          prefetch={false}
          className="bg-gradient-brand flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-accent/20 transition hover:-translate-y-0.5"
        >
          <Plus size={17} /> New
        </Link>
        </div>
        )}
      </header>

      {notice && <p role="status" className="mt-4 rounded-2xl bg-surface-strong px-4 py-3 text-sm">{notice}</p>}

      <label className="glass mt-8 flex items-center gap-3 rounded-2xl px-4 py-3">
        <Search size={18} className="text-muted" />
        <input
          autoFocus={params.get("search") === "1"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your writing"
          className="w-full bg-transparent outline-none placeholder:text-muted"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search" className="text-muted">
            <X size={16} />
          </button>
        )}
      </label>

      {!trashView && <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <Chip active={folder === "all"} onClick={() => setFolder("all")}>
          All
        </Chip>
        {folders.map((f) => (
          <Chip key={f.id} active={folder === f.id} onClick={() => setFolder(f.id)}>
            {f.name}
          </Chip>
        ))}
        <button
          onClick={newFolder}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-muted transition hover:text-ink"
        >
          <FolderPlus size={15} /> Folder
        </button>
        {folder !== "all" && (
          <button
            onClick={() => deleteFolder(folder)}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:text-rose-500"
          >
            <Trash2 size={14} /> Delete folder
          </button>
        )}
      </div>}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {docs === null &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass h-36 animate-pulse rounded-3xl" />
          ))}

        {docs?.length === 0 && (
          <div className="col-span-full flex flex-col items-center py-16 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-surface-strong">
              <FileText className="text-accent" />
            </div>
            <p className="mt-4 font-display text-2xl">
              {query ? "Nothing matches that." : trashView ? "The trash is empty." : "A blank page awaits."}
            </p>
            {!query && !trashView && (
              <Link href={newHref} prefetch={false} className="mt-2 text-accent hover:underline">
                Start your first document
              </Link>
            )}
          </div>
        )}

        {docs?.map((d) => (
          <div key={d.id} className="relative">
            <Link
              href={`/docs/${d.id}`}
              className="glass group flex h-full min-h-36 flex-col rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(40,30,90,0.18)]"
            >
              <h2 className="pr-8 font-display text-xl leading-snug tracking-tight">
                {d.title || "Untitled"}
              </h2>
              <p className="mt-1.5 line-clamp-2 text-sm text-muted">
                {d.content_text.slice(0, 220) || "Empty"}
              </p>
              <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-muted">
                <span>{timeAgo(d.updated_at)}</span>
                <span>·</span>
                <span>{d.word_count} words</span>
                {folderName(d.folder_id) && (
                  <span className="ml-auto truncate rounded-full bg-surface-strong px-2 py-0.5">
                    {folderName(d.folder_id)}
                  </span>
                )}
              </div>
            </Link>
            <button
              onClick={() => setMenuFor(menuFor === d.id ? null : d.id)}
              aria-label="Document options"
              className="absolute top-4 right-4 rounded-full p-1.5 text-muted hover:bg-surface-strong hover:text-ink"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuFor === d.id && trashView && (
              <TrashMenu onRestore={() => restoreDoc(d.id)} onDelete={() => deleteForever(d.id)} onClose={() => setMenuFor(null)} />
            )}
            {menuFor === d.id && !trashView && (
              <DocMenu
                folders={folders}
                current={d.folder_id}
                onMove={(f) => moveDoc(d.id, f)}
                onDelete={() => deleteDoc(d.id)}
                onClose={() => setMenuFor(null)}
              />
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
        active ? "bg-ink text-bg" : "glass text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function DocMenu({
  folders,
  current,
  onMove,
  onDelete,
  onClose,
}: {
  folders: Folder[];
  current: string | null;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  return (
    <div ref={ref} className="bar absolute top-12 right-3 z-30 w-56 rounded-2xl p-1.5 text-sm shadow-xl">
      <p className="flex items-center gap-2 px-3 pt-1.5 pb-1 text-xs text-muted">
        <FolderInput size={13} /> Move to
      </p>
      {current && <MenuItem onClick={() => onMove(null)}>No folder</MenuItem>}
      {folders
        .filter((f) => f.id !== current)
        .map((f) => (
          <MenuItem key={f.id} onClick={() => onMove(f.id)}>
            {f.name}
          </MenuItem>
        ))}
      <div className="my-1 h-px bg-line" />
      <MenuItem onClick={onDelete} danger>
        <Trash2 size={14} /> Move to trash
      </MenuItem>
    </div>
  );
}

function TrashMenu({ onRestore, onDelete, onClose }: { onRestore: () => void; onDelete: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);
  return (
    <div ref={ref} className="bar absolute top-12 right-3 z-30 w-52 rounded-2xl p-1.5 text-sm shadow-xl">
      <MenuItem onClick={onRestore}>
        <RotateCcw size={14} /> Restore
      </MenuItem>
      <MenuItem onClick={onDelete} danger>
        <Trash2 size={14} /> Delete forever
      </MenuItem>
    </div>
  );
}

export function MenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-surface-strong ${
        danger ? "text-rose-500" : ""
      }`}
    >
      {children}
    </button>
  );
}
