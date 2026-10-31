"use client";

import { BookmarkPlus, FlaskConical, LayoutTemplate, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CustomTemplate } from "@/lib/dojo/store/types";
import { STARTER_TEMPLATES, TEMPLATE_CATEGORIES, templateToRequest, type TemplateFieldDef } from "@/lib/dojo/templates";
import { fillVariables } from "@/lib/dojo/variables";
import { api, setHandoff } from "./client";
import { useDojo } from "./provider";
import { SaveTemplateDialog, SaveToLibraryDialog, type SaveDraft } from "./save-dialog";
import { CopyButton, Dialog, EmptyState, PageHeader } from "./ui";

type AnyTemplate = { id: string; title: string; category: string; description: string; fields: TemplateFieldDef[]; body: string; custom?: boolean };

export function TemplatesPage() {
  const router = useRouter();
  const { prefs, toast } = useDojo();
  const [mine, setMine] = useState<CustomTemplate[]>([]);
  const [tab, setTab] = useState<"starter" | "mine">("starter");
  const [category, setCategory] = useState<string>("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<AnyTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveDraft, setSaveDraft] = useState<SaveDraft | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<{ templates: CustomTemplate[] }>("/api/dojo/templates")
      .then((r) => setMine(r.templates))
      .catch(() => {});
  }, []);

  const list: AnyTemplate[] = useMemo(() => {
    const src: AnyTemplate[] = tab === "starter" ? STARTER_TEMPLATES : mine.map((t) => ({ ...t, custom: true }));
    const needle = q.trim().toLowerCase();
    return src.filter((t) => (!category || t.category === category) && (!needle || `${t.title} ${t.description} ${t.category}`.toLowerCase().includes(needle)));
  }, [tab, mine, category, q]);

  const filled = open ? fillVariables(open.body, values) : "";
  const requiredMissing = open ? open.fields.filter((f) => f.required && !values[f.key]?.trim()) : [];

  function openTemplate(t: AnyTemplate) {
    setOpen(t);
    setValues({});
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Proven starting points. Fill in the blanks and use them as-is, or let the generator tailor them to your situation."
        actions={
          <button type="button" className="pd-btn" onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden /> New template
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Template sets">
          <button type="button" role="tab" aria-selected={tab === "starter"} className="pd-chip" onClick={() => setTab("starter")}>
            Starter library ({STARTER_TEMPLATES.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === "mine"} className="pd-chip" onClick={() => setTab("mine")}>
            My templates ({mine.length})
          </button>
        </div>
        <label className="relative ml-auto w-full sm:w-64">
          <span className="sr-only">Search templates</span>
          <Search size={15} className="pd-muted absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
          <input className="pd-input pl-9" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {tab === "starter" && (
        <div className="pd-scroll-x -mx-1 flex gap-1.5 px-1">
          <button type="button" className="pd-chip shrink-0" aria-pressed={!category} onClick={() => setCategory("")}>
            All
          </button>
          {TEMPLATE_CATEGORIES.map((c) => (
            <button key={c} type="button" className="pd-chip shrink-0" aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon={<LayoutTemplate size={22} />} title={tab === "mine" ? "No templates of your own yet" : "No templates match"}>
          {tab === "mine" ? "Use “Convert to template” on any generated prompt, or create one from scratch." : "Try another search or category."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <li key={t.id}>
              <button type="button" className="pd-card h-full w-full p-4 text-left transition hover:border-[var(--pd-accent)]" onClick={() => openTemplate(t)}>
                <span className="pd-eyebrow">{t.category || "Uncategorized"}</span>
                <span className="mt-1 block font-semibold">{t.title}</span>
                <span className="mt-1 block text-sm pd-soft">{t.description}</span>
                <span className="mt-2 block text-xs pd-muted">{t.fields.length} fields</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.title ?? "Template"} wide>
        {open && (
          <div className="grid gap-5 lg:grid-cols-2">
            <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
              <p className="text-sm pd-soft">{open.description}</p>
              {open.fields.map((f) => (
                <label key={f.key} className="block space-y-1 text-sm">
                  <span className="font-medium">
                    {f.label}
                    {f.required ? "" : " (optional)"}
                  </span>
                  <textarea className="pd-textarea min-h-11 py-1.5" placeholder={f.placeholder} value={values[f.key] ?? ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} rows={f.key === "document" || f.key === "text" || f.key === "code" || f.key === "notes" ? 5 : 1} />
                  {f.help && <span className="block text-xs pd-muted">{f.help}</span>}
                </label>
              ))}
            </form>
            <div className="space-y-3">
              <p className="pd-eyebrow">Preview</p>
              <div className="pd-prompt-text max-h-[50vh] overflow-y-auto rounded-xl border p-3.5 text-sm pd-line">{filled}</div>
              {requiredMissing.length > 0 && <p className="text-xs" style={{ color: "var(--pd-warn)" }}>Still blank: {requiredMissing.map((f) => f.label).join(", ")}</p>}
              <div className="flex flex-wrap gap-2">
                <CopyButton text={filled} label="Copy prompt" primary />
                <button type="button" className="pd-btn" onClick={() => { setHandoff({ to: "generator", request: templateToRequest(open.title, filled) }); router.push("/dojo"); }}>
                  <Sparkles size={15} aria-hidden /> Customize with AI
                </button>
                <button type="button" className="pd-btn" onClick={() => setSaveDraft({ title: open.title, target_model: prefs.default_target, source: "template", category: categoryFor(open.category), versions: [{ content: filled, kind: "template", instruction: `From template "${open.title}"` }] })}>
                  <BookmarkPlus size={15} aria-hidden /> Save
                </button>
                <button type="button" className="pd-btn" onClick={() => { setHandoff({ to: "lab", prompt: filled, title: open.title }); router.push("/dojo/lab"); }}>
                  <FlaskConical size={15} aria-hidden /> Test
                </button>
                {open.custom && (
                  <button
                    type="button"
                    className="pd-btn pd-btn-danger ml-auto"
                    onClick={async () => {
                      if (!confirm(`Delete the template “${open.title}”?`)) return;
                      try {
                        await api(`/api/dojo/templates/${open.id}`, { method: "DELETE" });
                        setMine((m) => m.filter((x) => x.id !== open.id));
                        setOpen(null);
                        toast("Template deleted", "ok");
                      } catch (e) {
                        toast((e as Error).message, "error");
                      }
                    }}
                  >
                    <Trash2 size={15} aria-hidden /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      <SaveToLibraryDialog open={!!saveDraft} draft={saveDraft} onClose={() => setSaveDraft(null)} onSaved={() => {}} />
      <SaveTemplateDialog
        open={creating}
        initial={creating ? { title: "", description: "", category: "", body: "", fields: [] } : null}
        onClose={() => setCreating(false)}
        onSaved={(t) => {
          setMine((m) => [t, ...m]);
          setTab("mine");
        }}
      />
    </div>
  );
}

function categoryFor(templateCategory: string): string {
  if (templateCategory.startsWith("Business")) return "Business";
  if (templateCategory.startsWith("Marketing")) return "Marketing";
  if (templateCategory.startsWith("Writing")) return "Writing";
  if (templateCategory.startsWith("Technology")) return "Technology";
  if (templateCategory.startsWith("Construction")) return "Construction";
  if (templateCategory.startsWith("Personal")) return "Personal Development";
  return "";
}

