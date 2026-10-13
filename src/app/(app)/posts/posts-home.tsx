"use client";

import { ArrowUpRight, FileText, Layers, Loader2, PenLine, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/editor/drawer";
import { PlatformBadge } from "@/components/social/platform-badge";
import { timeAgo } from "@/lib/docs";
import type { PlatformId, PostFormat } from "@/lib/social/platforms";
import { CATEGORIES, TEMPLATES, type TemplateCategory } from "@/lib/social/templates";
import { createClient } from "@/lib/supabase/client";

type CustomTemplate = { id: string; name: string; description: string; structure: string; example: string; format: PostFormat };
type DraftRow = {
  id: string;
  platform: PlatformId;
  format: PostFormat;
  content: string;
  parts: string[];
  idea: string;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  updated_at: string;
  scheduled_at: string | null;
  published_at: string | null;
};
type Tab = "templates" | "drafts" | "scheduled" | "published";

export function PostsHome() {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>("templates");
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [custom, setCustom] = useState<CustomTemplate[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());

  const loadCustom = useCallback(async () => {
    const { data } = await supabase.from("post_templates").select("id,name,description,structure,example,format").order("created_at", { ascending: false });
    return (data as CustomTemplate[]) ?? [];
  }, [supabase]);

  useEffect(() => {
    loadCustom().then(setCustom);
    supabase
      .from("posts")
      .select("id,platform,format,content,parts,idea,status,updated_at,scheduled_at,published_at")
      .order("updated_at", { ascending: false })
      .limit(300)
      .then(({ data }) => setDrafts((data as DraftRow[]) ?? []));
  }, [supabase, loadCustom]);

  const lists = {
    drafts: drafts?.filter((d) => d.status === "draft"),
    scheduled: drafts
      ?.filter((d) => d.status === "scheduled" || d.status === "publishing" || d.status === "failed")
      .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? "")),
    published: drafts?.filter((d) => d.status === "published").sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")),
  };
  const builtIns = category === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);
  const showCustom = category === "all" || category === "mine";

  async function deleteCustom(id: string) {
    if (!confirm("Delete this template?")) return;
    await supabase.from("post_templates").delete().eq("id", id);
    setCustom((c) => c.filter((t) => t.id !== id));
  }

  return (
    <div className="animate-rise pb-8">
      <header>
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Posts</h1>
        <p className="mt-1 text-muted">One idea in. Scroll-stopping posts out.</p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href="/posts/new?template=free" className="glass group flex items-center gap-4 rounded-3xl p-5 transition hover:-translate-y-0.5">
          <span className="bg-gradient-brand grid size-12 place-items-center rounded-2xl text-white"><PenLine size={20} /></span>
          <span className="flex-1">
            <span className="block font-display text-xl">Write a post</span>
            <span className="text-sm text-muted">Start from your idea, no template needed.</span>
          </span>
          <ArrowUpRight size={18} className="text-muted transition group-hover:text-ink" />
        </Link>
        <Link href="/posts/repurpose" className="glass group flex items-center gap-4 rounded-3xl p-5 transition hover:-translate-y-0.5">
          <span className="grid size-12 place-items-center rounded-2xl bg-ink text-bg"><Layers size={20} /></span>
          <span className="flex-1">
            <span className="block font-display text-xl">Repurpose a document</span>
            <span className="text-sm text-muted">Turn one piece into posts for every platform.</span>
          </span>
          <ArrowUpRight size={18} className="text-muted transition group-hover:text-ink" />
        </Link>
      </div>

      <div className="mt-8 flex items-center gap-1 overflow-x-auto border-b border-line">
        {(["templates", "drafts", "scheduled", "published"] as const).map((t) => {
          const n = t === "templates" ? 0 : (lists[t]?.length ?? 0);
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm capitalize transition sm:px-4 ${tab === t ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {t}
              {n ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      {tab === "templates" && (
        <>
          <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${category === c.id ? "bg-ink text-bg" : "glass text-muted hover:text-ink"}`}
              >
                {c.label}
              </button>
            ))}
            <button onClick={() => setCreating(true)} className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-accent hover:bg-accent/10">
              <Plus size={15} /> New template
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {showCustom &&
              custom.map((t) => (
                <div key={t.id} className="relative">
                  <TemplateCard href={`/posts/new?custom=${t.id}`} name={t.name} description={t.description} example={t.example} format={t.format} mine />
                  <button
                    onClick={() => deleteCustom(t.id)}
                    aria-label={`Delete ${t.name}`}
                    className="absolute top-4 right-4 rounded-full p-1.5 text-muted hover:bg-surface-strong hover:text-rose-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            {category === "mine" && custom.length === 0 && (
              <button onClick={() => setCreating(true)} className="col-span-full rounded-3xl p-8 text-center text-muted ring-1 ring-line ring-dashed hover:text-ink">
                <Wand2 className="mx-auto mb-2" /> Save a format you love as your own template.
              </button>
            )}
            {category !== "mine" &&
              builtIns.map((t) => (
                <TemplateCard key={t.key} href={`/posts/new?template=${t.key}`} name={t.name} description={t.description} example={t.example} format={t.format} />
              ))}
          </div>
        </>
      )}

      {tab !== "templates" && (
        <ul className="mt-4 space-y-2">
          {drafts === null && <li className="py-8 text-center text-muted"><Loader2 className="mx-auto animate-spin" /></li>}
          {lists[tab]?.length === 0 && (
            <li className="py-12 text-center text-muted">
              <Sparkles className="mx-auto mb-2 text-accent" />
              {tab === "drafts" ? "No drafts yet. Pick a template and write your first post." : tab === "scheduled" ? "Nothing scheduled. Open a draft and pick a time." : "Nothing published yet."}
            </li>
          )}
          {lists[tab]?.map((d) => (
            <li key={d.id}>
              <Link href={`/posts/${d.id}`} className="glass flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5">
                <PlatformBadge platform={d.platform} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{(d.content || d.parts[0] || "Empty").split("\n")[0]}</span>
                  <span className="text-xs text-muted">
                    {d.format !== "single" ? `${d.format === "thread" ? "Thread" : "Carousel"} · ` : ""}
                    {d.status === "scheduled" && d.scheduled_at
                      ? `${d.platform === "x" ? "Reminder" : "Scheduled"} ${new Date(d.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : d.status === "published" && d.published_at
                        ? `Published ${timeAgo(d.published_at)}`
                        : timeAgo(d.updated_at)}
                  </span>
                </span>
                {d.status === "failed" && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-600">Failed</span>}
                {d.status === "scheduled" && d.platform === "x" && d.scheduled_at && new Date(d.scheduled_at).getTime() <= now && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">Ready to post</span>
                )}
                <ArrowUpRight size={16} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <TemplateForm
          supabase={supabase}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false);
            setCategory("mine");
            setCustom(await loadCustom());
          }}
        />
      )}
    </div>
  );
}

function TemplateCard({
  href,
  name,
  description,
  example,
  format,
  mine,
}: {
  href: string;
  name: string;
  description: string;
  example: string;
  format: PostFormat;
  mine?: boolean;
}) {
  return (
    <Link href={href} className="glass group flex h-full flex-col rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(40,30,90,0.18)]">
      <div className="flex items-center gap-2 pr-8">
        <h3 className="font-display text-lg leading-snug tracking-tight">{name}</h3>
        {format !== "single" && <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[11px] text-muted">{format}</span>}
        {mine && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent">mine</span>}
      </div>
      <p className="mt-1 text-sm text-muted">{description}</p>
      {example && (
        <p className="mt-3 line-clamp-3 rounded-2xl bg-surface-strong px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-ink/80">
          {example.split("\n").filter((l) => l.trim()).slice(0, 2).join("\n")}
        </p>
      )}
      <span className="mt-auto flex items-center gap-1 pt-3 text-sm text-accent opacity-0 transition group-hover:opacity-100">
        Use template <ArrowUpRight size={14} />
      </span>
    </Link>
  );
}

function TemplateForm({ supabase, onClose, onSaved }: { supabase: ReturnType<typeof createClient>; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", structure: "", example: "", format: "single" as PostFormat });
  const [sample, setSample] = useState("");
  const [learning, setLearning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function learn() {
    setLearning(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "extract_template", example: sample }),
      });
      const body = (await res.json()) as { template?: Omit<typeof form, "example">; error?: string };
      if (!body.template) throw new Error(body.error);
      setForm((f) => ({ ...f, ...body.template, example: sample.slice(0, 280) }));
    } catch (e) {
      setError((e as Error).message || "Couldn't analyze that post.");
    }
    setLearning(false);
  }

  async function save() {
    const { error } = await supabase.from("post_templates").insert({ ...form, category: "mine" });
    if (error) setError("Couldn't save the template.");
    else onSaved();
  }

  const field = "mt-1 w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent";
  return (
    <Drawer title="New template" onClose={onClose}>
      <div className="space-y-4 p-5">
        <div className="rounded-2xl bg-surface-strong p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium"><FileText size={15} /> Learn from a post you love</p>
          <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={4} placeholder="Paste any post whose format you like…" className={field} />
          <button onClick={learn} disabled={learning || !sample.trim()} className="bg-gradient-brand mt-2 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {learning ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Fill in the template for me
          </button>
        </div>
        <label className="block text-sm font-medium">Name<input value={form.name} onChange={(e) => set("name", e.target.value)} className={field} placeholder="e.g. Lesson from a client" /></label>
        <label className="block text-sm font-medium">When to use it<input value={form.description} onChange={(e) => set("description", e.target.value)} className={field} /></label>
        <label className="block text-sm font-medium">
          Structure <span className="font-normal text-muted">(the steps the AI follows)</span>
          <textarea value={form.structure} onChange={(e) => set("structure", e.target.value)} rows={5} className={field} placeholder="Line 1: … Then … End with …" />
        </label>
        <label className="block text-sm font-medium">Example (optional)<textarea value={form.example} onChange={(e) => set("example", e.target.value)} rows={3} className={field} /></label>
        <label className="block text-sm font-medium">
          Format
          <select value={form.format} onChange={(e) => set("format", e.target.value)} className={field}>
            <option value="single">Single post</option>
            <option value="thread">Thread</option>
            <option value="carousel">Carousel</option>
          </select>
        </label>
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button onClick={save} disabled={!form.name.trim() || !form.structure.trim()} className="bg-gradient-brand w-full rounded-full px-4 py-2.5 font-medium text-white disabled:opacity-50">
          Save template
        </button>
      </div>
    </Drawer>
  );
}
