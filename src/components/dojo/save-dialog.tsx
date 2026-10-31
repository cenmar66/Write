"use client";

import { useEffect, useState } from "react";
import type { TemplateResult, TargetId } from "@/lib/dojo/schema";
import type { Collection, CustomTemplate, NewVersion, PromptRecord } from "@/lib/dojo/store/types";
import { extractVariables } from "@/lib/dojo/variables";
import { api } from "./client";
import { useToast } from "./provider";
import { Dialog, ErrorBox, Field, Spinner } from "./ui";

export const CATEGORIES = ["Business", "Marketing", "Writing", "Research", "Technology", "Construction", "Personal Development", "Other"];

export type SaveDraft = {
  title: string;
  target_model: TargetId;
  custom_target?: string;
  source: "generated" | "alternative" | "analyzer" | "template" | "manual" | "lab";
  generation_id?: string | null;
  versions: NewVersion[];
  category?: string;
};

export function SaveToLibraryDialog({ open, draft, onClose, onSaved }: { open: boolean; draft: SaveDraft | null; onClose: () => void; onSaved: (p: PromptRecord) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a new draft opens (adjusting state during render).
  const [shown, setShown] = useState<SaveDraft | null>(null);
  if (open && draft && draft !== shown) {
    setShown(draft);
    setTitle(draft.title.slice(0, 200));
    setCategory(draft.category ?? "");
    setDescription("");
    setTags("");
    setError(null);
  }
  useEffect(() => {
    if (!open || !draft) return;
    api<{ collections: Collection[] }>("/api/dojo/collections")
      .then((r) => setCollections(r.collections))
      .catch(() => setCollections([]));
  }, [open, draft]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      let collection_id: string | null = collectionId || null;
      if (collectionId === "__new" && newCollection.trim()) collection_id = (await api<{ collection: Collection }>("/api/dojo/collections", { body: { name: newCollection.trim() } })).collection.id;
      if (collectionId === "__new" && !newCollection.trim()) collection_id = null;
      const { prompt } = await api<{ prompt: PromptRecord }>("/api/dojo/prompts", {
        body: {
          ...draft,
          title: title.trim() || "Untitled prompt",
          description,
          category,
          collection_id,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20),
        },
      });
      toast("Saved to your library", "ok");
      onSaved(prompt);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Save to library">
      <form
        className="space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Title" htmlFor="pd-save-title">
          <input id="pd-save-title" className="pd-input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Description (optional)" htmlFor="pd-save-desc">
          <textarea id="pd-save-desc" className="pd-textarea min-h-16" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="pd-save-cat">
            <select id="pd-save-cat" className="pd-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">None</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Collection" htmlFor="pd-save-col">
            <select id="pd-save-col" className="pd-select" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">None</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New collection…</option>
            </select>
          </Field>
        </div>
        {collectionId === "__new" && (
          <Field label="New collection name" htmlFor="pd-save-newcol">
            <input id="pd-save-newcol" className="pd-input" value={newCollection} maxLength={80} onChange={(e) => setNewCollection(e.target.value)} placeholder="e.g. Construction" />
          </Field>
        )}
        <Field label="Tags" hint="Separate with commas" htmlFor="pd-save-tags">
          <input id="pd-save-tags" className="pd-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="email, follow-up" />
        </Field>
        {draft && draft.versions.length > 1 && <p className="text-xs pd-muted">Includes all {draft.versions.length} versions so you can compare and restore them later.</p>}
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="pd-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="pd-btn pd-btn-primary" disabled={busy}>
            {busy ? <Spinner size={14} label="Saving…" /> : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Review and save an AI-made (or hand-made) template to your private templates. */
export function SaveTemplateDialog({ open, initial, onClose, onSaved }: { open: boolean; initial: TemplateResult | null; onClose: () => void; onSaved?: (t: CustomTemplate) => void }) {
  const toast = useToast();
  const [t, setT] = useState<TemplateResult | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<TemplateResult | null>(initial);
  if (initial !== shown) {
    setShown(initial);
    setT(initial);
    setError(null);
  }

  if (!t) return null;
  const vars = extractVariables(t.body);
  const fields = vars.map((key) => t.fields.find((f) => f.key === key) ?? { key, label: key.replace(/_/g, " "), placeholder: "", help: "", required: true });

  async function save() {
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const { template } = await api<{ template: CustomTemplate }>("/api/dojo/templates", { body: { ...t, fields } });
      toast("Template saved to My templates", "ok");
      onSaved?.(template);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Save as reusable template" wide>
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="pd-tpl-title">
            <input id="pd-tpl-title" className="pd-input" value={t.title} maxLength={200} onChange={(e) => setT({ ...t, title: e.target.value })} />
          </Field>
          <Field label="Category" htmlFor="pd-tpl-cat">
            <input id="pd-tpl-cat" className="pd-input" value={t.category} maxLength={80} onChange={(e) => setT({ ...t, category: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" htmlFor="pd-tpl-desc">
          <input id="pd-tpl-desc" className="pd-input" value={t.description} maxLength={2000} onChange={(e) => setT({ ...t, description: e.target.value })} />
        </Field>
        <Field label="Template" hint="Use {{field_name}} for anything that changes each time." htmlFor="pd-tpl-body">
          <textarea id="pd-tpl-body" className="pd-textarea pd-prompt-text min-h-60" value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium">Fields ({fields.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {fields.length ? fields.map((f) => <span key={f.key} className="pd-badge pd-mono">{`{{${f.key}}}`}</span>) : <span className="text-sm pd-muted">No fields yet.</span>}
          </div>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="pd-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="pd-btn pd-btn-primary" onClick={save} disabled={busy || !t.title.trim() || !t.body.trim()}>
            {busy ? <Spinner size={14} label="Saving…" /> : "Save template"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
