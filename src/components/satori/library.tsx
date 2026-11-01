"use client";

import { Archive, ArchiveRestore, BookMarked, Copy as CopyIcon, Download, FolderPlus, LayoutGrid, List, MoreHorizontal, Pencil, Search, Star, Trash2, Undo2, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TARGET_LIST, targetName } from "@/lib/satori/targets";
import type { Collection, PromptRecord } from "@/lib/satori/store/types";
import { api, copyText, download, formatDate, readLocal, writeLocal } from "./client";
import { useSatori } from "./provider";
import { CATEGORIES } from "./save-dialog";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "./ui";

type View = "active" | "archived" | "trash";

export function LibraryPage() {
  const { toast } = useSatori();
  const [prompts, setPrompts] = useState<PromptRecord[] | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState("");
  const [collection, setCollection] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [view, setView] = useState<View>("active");
  const [sort, setSort] = useState<"updated" | "created" | "title">("updated");
  const [layout, setLayout] = useState<"cards" | "list">("cards");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only storage after hydration
    setLayout(readLocal("ps-library-layout", "cards"));
  }, []);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ view, sort });
    if (q.trim()) p.set("q", q.trim());
    if (target) p.set("target", target);
    if (category) p.set("category", category);
    if (collection) p.set("collection", collection);
    if (favorite) p.set("favorite", "1");
    try {
      const r = await api<{ prompts: PromptRecord[] }>(`/api/satori/prompts?${p}`);
      setPrompts(r.prompts);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setPrompts((x) => x ?? []);
    }
  }, [q, target, category, collection, favorite, view, sort]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  const loadCollections = useCallback(() => api<{ collections: Collection[] }>("/api/satori/collections").then((r) => setCollections(r.collections)).catch(() => {}), []);
  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  async function act(p: PromptRecord, action: "favorite" | "archive" | "unarchive" | "trash" | "restore" | "forever" | "duplicate") {
    try {
      if (action === "favorite") await api(`/api/satori/prompts/${p.id}`, { method: "PATCH", body: { favorite: !p.favorite } });
      if (action === "archive" || action === "unarchive") await api(`/api/satori/prompts/${p.id}`, { method: "PATCH", body: { archived: action === "archive" } });
      if (action === "trash") await api(`/api/satori/prompts/${p.id}`, { method: "DELETE" });
      if (action === "restore") await api(`/api/satori/prompts/${p.id}`, { method: "PATCH", body: { restore: true } });
      if (action === "forever") {
        if (!confirm(`Delete “${p.title}” and all its versions permanently? This can't be undone.`)) return;
        await api(`/api/satori/prompts/${p.id}?forever=1`, { method: "DELETE" });
      }
      if (action === "duplicate") await api(`/api/satori/prompts/${p.id}/duplicate`, { method: "POST", body: {} });
      toast({ favorite: p.favorite ? "Removed from favorites" : "Added to favorites", archive: "Archived", unarchive: "Moved back to library", trash: "Moved to trash", restore: "Restored", forever: "Deleted permanently", duplicate: "Duplicated" }[action], "ok");
      void load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function exportAs(format: "md" | "txt" | "json") {
    const ids = [...selected].join(",");
    try {
      const res = await fetch(`/api/satori/export?format=${format}${ids ? `&ids=${ids}` : ""}`);
      if (!res.ok) throw new Error("Export failed.");
      download(`promptsatori-${new Date().toISOString().slice(0, 10)}.${format}`, await res.text(), format === "json" ? "application/json" : format === "md" ? "text/markdown" : "text/plain");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    try {
      if (file.size > 5_000_000) throw new Error("That file is too large (max 5 MB).");
      const text = await file.text();
      const res = await fetch("/api/satori/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
      const data = (await res.json().catch(() => ({}))) as { error?: string; imported?: { prompts: number; templates: number } };
      if (!res.ok) throw new Error(data.error ?? "Import failed.");
      toast(`Imported ${data.imported!.prompts} prompts${data.imported!.templates ? ` and ${data.imported!.templates} templates` : ""}`, "ok");
      void load();
      void loadCollections();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function newCollection() {
    const name = prompt("New collection name (e.g. Marketing, Construction)")?.trim();
    if (!name) return;
    try {
      await api("/api/satori/collections", { body: { name } });
      void loadCollections();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Library"
        subtitle="Everything you've saved — searchable, organized, and versioned."
        actions={
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} aria-label="Import file" />
            <button type="button" className="ps-btn" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Spinner size={14} /> : <Upload size={15} aria-hidden />} Import
            </button>
            <ExportMenu onExport={exportAs} count={selected.size} />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Collections */}
        <aside aria-label="Collections" className="space-y-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="ps-eyebrow">Collections</span>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-icon ps-btn-sm" aria-label="New collection" onClick={newCollection}>
              <FolderPlus size={15} />
            </button>
          </div>
          <div className="ps-scroll-x flex gap-1.5 lg:flex-col lg:gap-0.5">
            <button type="button" className="ps-nav-item shrink-0 text-sm" aria-current={!collection && !favorite ? "page" : undefined} onClick={() => { setCollection(""); setFavorite(false); }}>
              All prompts
            </button>
            <button type="button" className="ps-nav-item shrink-0 text-sm" aria-current={favorite ? "page" : undefined} onClick={() => { setFavorite(!favorite); setCollection(""); }}>
              <Star size={14} aria-hidden /> Favorites
            </button>
            {collections.map((c) => (
              <div key={c.id} className="group flex shrink-0 items-center">
                <button type="button" className="ps-nav-item min-w-0 flex-1 text-sm" aria-current={collection === c.id ? "page" : undefined} onClick={() => { setCollection(c.id); setFavorite(false); }}>
                  <span className="truncate">{c.name}</span>
                </button>
                <button
                  type="button"
                  className="ps-btn ps-btn-ghost ps-btn-icon ps-btn-sm hidden group-hover:inline-flex"
                  aria-label={`Rename ${c.name}`}
                  onClick={async () => {
                    const name = prompt("Rename collection", c.name)?.trim();
                    if (!name || name === c.name) return;
                    await api(`/api/satori/collections/${c.id}`, { method: "PATCH", body: { name } }).catch((e) => toast((e as Error).message, "error"));
                    void loadCollections();
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="ps-btn ps-btn-ghost ps-btn-icon ps-btn-sm hidden group-hover:inline-flex"
                  aria-label={`Delete ${c.name}`}
                  onClick={async () => {
                    if (!confirm(`Delete the collection “${c.name}”? Its prompts stay in your library.`)) return;
                    await api(`/api/satori/collections/${c.id}`, { method: "DELETE" }).catch((e) => toast((e as Error).message, "error"));
                    if (collection === c.id) setCollection("");
                    void loadCollections();
                    void load();
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-48 flex-1">
              <span className="sr-only">Search the library</span>
              <Search size={15} className="ps-muted absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
              <input className="ps-input pl-9" placeholder="Search titles, text and tags" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="ps-select w-auto" aria-label="Filter by target model" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">All models</option>
              {TARGET_LIST.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select className="ps-select w-auto" aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className="ps-select w-auto" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="updated">Recently changed</option>
              <option value="created">Recently created</option>
              <option value="title">Title A–Z</option>
            </select>
            <div className="flex" role="group" aria-label="Layout">
              <button type="button" className="ps-btn ps-btn-icon ps-btn-ghost" aria-pressed={layout === "cards"} aria-label="Card view" onClick={() => { setLayout("cards"); writeLocal("ps-library-layout", "cards"); }} style={layout === "cards" ? { color: "var(--ps-accent)" } : undefined}>
                <LayoutGrid size={17} />
              </button>
              <button type="button" className="ps-btn ps-btn-icon ps-btn-ghost" aria-pressed={layout === "list"} aria-label="List view" onClick={() => { setLayout("list"); writeLocal("ps-library-layout", "list"); }} style={layout === "list" ? { color: "var(--ps-accent)" } : undefined}>
                <List size={17} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Library view">
            {(["active", "archived", "trash"] as View[]).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className="ps-chip" onClick={() => { setView(v); setSelected(new Set()); }}>
                {v === "active" ? "Library" : v === "archived" ? "Archived" : "Trash"}
              </button>
            ))}
            {selected.size > 0 && (
              <span className="ml-auto flex items-center gap-2 text-sm">
                {selected.size} selected
                <button type="button" className="ps-btn ps-btn-sm ps-btn-ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </span>
            )}
          </div>

          {error && <ErrorBox message={error} onRetry={load} />}

          {prompts === null ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="ps-skeleton h-36" />
              ))}
            </div>
          ) : prompts.length === 0 ? (
            <EmptyState icon={<BookMarked size={22} />} title={view === "trash" ? "Trash is empty" : view === "archived" ? "Nothing archived" : q || target || category || collection || favorite ? "No prompts match" : "Your library is empty"} action={view === "active" && !q ? <Link href="/satori" className="ps-btn ps-btn-primary">Generate a prompt</Link> : undefined}>
              {view === "active" && !q ? "Generate a prompt and press Save, or import an export file." : null}
            </EmptyState>
          ) : (
            <ul className={layout === "cards" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "ps-card divide-y overflow-hidden"} style={layout === "list" ? { borderColor: "var(--ps-line)" } : undefined}>
              {prompts.map((p) => (
                <PromptItem key={p.id} p={p} layout={layout} view={view} selected={selected.has(p.id)} onToggle={() => toggle(p.id)} onAct={(a) => act(p, a)} collection={collections.find((c) => c.id === p.collection_id)?.name} toast={toast} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportMenu({ onExport, count }: { onExport: (f: "md" | "txt" | "json") => void; count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" className="ps-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download size={15} aria-hidden /> Export{count ? ` (${count})` : ""}
      </button>
      {open && (
        <div role="menu" className="ps-card absolute right-0 z-20 mt-1 w-52 p-1.5" onMouseLeave={() => setOpen(false)}>
          {(
            [
              ["md", "Markdown (.md)"],
              ["txt", "Plain text (.txt)"],
              ["json", "JSON — re-importable"],
            ] as const
          ).map(([f, l]) => (
            <button key={f} type="button" role="menuitem" className="ps-nav-item w-full text-sm" onClick={() => { setOpen(false); onExport(f); }}>
              {l}
            </button>
          ))}
          <p className="px-3 pt-1 pb-1.5 text-xs ps-muted">{count ? `${count} selected prompts` : "Whole library"}</p>
        </div>
      )}
    </div>
  );
}

function PromptItem({ p, layout, view, selected, onToggle, onAct, collection, toast }: { p: PromptRecord; layout: "cards" | "list"; view: View; selected: boolean; onToggle: () => void; onAct: (a: "favorite" | "archive" | "unarchive" | "trash" | "restore" | "forever" | "duplicate") => void; collection?: string; toast: (t: string, tone?: "ok" | "error" | "info") => void }) {
  const [menu, setMenu] = useState(false);
  const copy = async () => toast((await copyText(p.content)) ? "Copied to clipboard" : "Couldn't copy", "ok");
  const meta = (
    <span className="flex flex-wrap items-center gap-1.5 text-xs ps-muted">
      <span className="ps-badge">{targetName({ id: p.target_model, customName: p.custom_target })}</span>
      {p.category && <span>{p.category}</span>}
      {collection && <span>· {collection}</span>}
      <span>· v{p.version_count}</span>
      <span>· {formatDate(p.updated_at)}</span>
    </span>
  );
  const actions = (
    <div className="flex items-center gap-0.5">
      {view === "active" && (
        <>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-icon ps-btn-sm" aria-label={`Copy ${p.title}`} onClick={copy}>
            <CopyIcon size={15} />
          </button>
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-icon ps-btn-sm" aria-label={p.favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={p.favorite} onClick={() => onAct("favorite")}>
            <Star size={15} fill={p.favorite ? "currentColor" : "none"} style={p.favorite ? { color: "var(--ps-accent)" } : undefined} />
          </button>
        </>
      )}
      <div className="relative">
        <button type="button" className="ps-btn ps-btn-ghost ps-btn-icon ps-btn-sm" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <MoreHorizontal size={16} />
        </button>
        {menu && (
          <div role="menu" className="ps-card absolute right-0 z-20 mt-1 w-44 p-1.5" onMouseLeave={() => setMenu(false)}>
            {view === "trash" ? (
              <>
                <MenuItem icon={<Undo2 size={14} />} label="Restore" onClick={() => onAct("restore")} />
                <MenuItem icon={<Trash2 size={14} />} label="Delete forever" danger onClick={() => onAct("forever")} />
              </>
            ) : (
              <>
                <MenuItem icon={<CopyIcon size={14} />} label="Duplicate" onClick={() => onAct("duplicate")} />
                {view === "archived" ? <MenuItem icon={<ArchiveRestore size={14} />} label="Unarchive" onClick={() => onAct("unarchive")} /> : <MenuItem icon={<Archive size={14} />} label="Archive" onClick={() => onAct("archive")} />}
                <MenuItem icon={<Trash2 size={14} />} label="Move to trash" danger onClick={() => onAct("trash")} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
  const check = (
    <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${p.title}`} className="size-4 shrink-0 accent-[var(--ps-accent)]" />
  );

  if (layout === "list")
    return (
      <li className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderColor: "var(--ps-line)" }}>
        {check}
        <Link href={`/satori/library/${p.id}`} className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.title}</span>
          {meta}
        </Link>
        {actions}
      </li>
    );
  return (
    <li className="ps-card flex flex-col gap-2 p-4">
      <div className="flex items-start gap-2">
        {check}
        <Link href={`/satori/library/${p.id}`} className="min-w-0 flex-1 font-semibold leading-snug hover:underline">
          {p.title}
        </Link>
        {actions}
      </div>
      {p.description && <p className="line-clamp-2 text-sm ps-soft">{p.description}</p>}
      <p className="line-clamp-3 text-sm ps-muted whitespace-pre-line">{p.content}</p>
      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.tags.map((t) => (
            <span key={t} className="ps-badge">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto pt-1">{meta}</div>
    </li>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" className="ps-nav-item w-full text-sm" style={danger ? { color: "var(--ps-danger)" } : undefined} onClick={onClick}>
      {icon} {label}
    </button>
  );
}
