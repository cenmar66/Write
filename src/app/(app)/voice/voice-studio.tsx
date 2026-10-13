"use client";

import { ClipboardPaste, FileText, FileUp, Loader2, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Switch } from "@/components/switch";
import { EMPTY_PROFILE, normalizeProfile, type VoiceProfile } from "@/lib/ai/voice";
import { timeAgo } from "@/lib/docs";
import { streamFetch } from "@/lib/stream";
import { createClient } from "@/lib/supabase/client";

type Sample = { id: string; title: string; content: string; source: string; word_count: number; created_at: string };
type DocPick = { id: string; title: string; content_text: string; word_count: number };
type Settings = { voice_enabled: boolean; voice_profile: VoiceProfile | null; voice_profile_updated_at: string | null };

const GOAL_WORDS = 1500;
const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export function VoiceStudio() {
  const supabase = useMemo(() => createClient(), []);
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [settings, setSettings] = useState<Settings>({ voice_enabled: true, voice_profile: null, voice_profile_updated_at: null });
  const [adding, setAdding] = useState<null | "paste" | "docs">(null);
  const [building, setBuilding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadSamples = useCallback(async () => {
    const { data } = await supabase
      .from("voice_samples")
      .select("id,title,content,source,word_count,created_at")
      .order("created_at", { ascending: false });
    return (data as Sample[]) ?? [];
  }, [supabase]);

  useEffect(() => {
    loadSamples().then(setSamples);
    supabase
      .from("user_settings")
      .select("voice_enabled,voice_profile,voice_profile_updated_at")
      .maybeSingle()
      .then(({ data }) => {
        if (data)
          setSettings({
            voice_enabled: data.voice_enabled ?? true,
            voice_profile: data.voice_profile ? normalizeProfile(data.voice_profile) : null,
            voice_profile_updated_at: data.voice_profile_updated_at,
          });
      });
  }, [supabase, loadSamples]);

  async function saveSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: session.session?.user.id, ...patch, updated_at: new Date().toISOString() });
    if (error) setNotice({ tone: "error", text: "Couldn't save. Check your connection and try again." });
    return !error;
  }

  async function addSamples(rows: { title: string; content: string; source: "paste" | "upload" | "document" }[]) {
    const clean = rows
      .map((r) => ({ ...r, content: r.content.trim(), word_count: countWords(r.content) }))
      .filter((r) => r.word_count > 0);
    if (!clean.length) return;
    const { error } = await supabase.from("voice_samples").insert(clean);
    if (error) setNotice({ tone: "error", text: "Couldn't save that sample." });
    else setNotice({ tone: "ok", text: `Added ${clean.length === 1 ? "1 sample" : `${clean.length} samples`}.` });
    setSamples(await loadSamples());
  }

  async function removeSample(id: string) {
    await supabase.from("voice_samples").delete().eq("id", id);
    setSamples((s) => s?.filter((x) => x.id !== id) ?? null);
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const rows: { title: string; content: string; source: "upload" }[] = [];
    const skipped: string[] = [];
    for (const file of Array.from(files)) {
      const name = file.name.replace(/\.[^.]+$/, "");
      if (/\.(txt|md|markdown)$/i.test(file.name)) {
        rows.push({ title: name, content: await file.text(), source: "upload" });
      } else if (/\.docx$/i.test(file.name)) {
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        rows.push({ title: name, content: value, source: "upload" });
      } else {
        skipped.push(file.name);
      }
    }
    await addSamples(rows);
    if (skipped.length) setNotice({ tone: "error", text: `Skipped ${skipped.join(", ")}. Use .txt, .md, or .docx (for PDFs, copy and paste the text).` });
    if (fileInput.current) fileInput.current.value = "";
  }

  async function build() {
    setBuilding(true);
    setNotice(null);
    try {
      const res = await fetch("/api/voice/build", { method: "POST" });
      const body = (await res.json()) as
        | { profile: VoiceProfile; usedSamples: number; totalSamples: number; usedWords: number }
        | { error: string };
      if ("error" in body) throw new Error(body.error);
      setSettings((s) => ({ ...s, voice_profile: body.profile, voice_profile_updated_at: new Date().toISOString() }));
      const partial =
        body.usedSamples < body.totalSamples
          ? ` It used your ${body.usedSamples} newest samples (${body.usedWords.toLocaleString()} words); older ones didn't fit.`
          : "";
      setNotice({ tone: "ok", text: `Your voice profile is ready. Review it below and tweak anything.${partial}` });
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message || "Building the profile failed." });
    }
    setBuilding(false);
  }

  const totalWords = samples?.reduce((n, s) => n + s.word_count, 0) ?? 0;
  const progress = Math.min(totalWords / GOAL_WORDS, 1);

  return (
    <div className="animate-rise space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Your voice</h1>
          <p className="mt-1 max-w-lg text-muted">
            Show the AI how you write. It learns your tone, rhythm, and favorite phrases, then sounds like you everywhere.
          </p>
        </div>
        <label className="glass flex items-center gap-3 self-start rounded-2xl px-4 py-3 sm:self-auto">
          <span className="text-sm">
            <span className="block font-medium">Use my voice</span>
            <span className="text-xs text-muted">{settings.voice_profile ? "In every AI action" : "Build a profile first"}</span>
          </span>
          <Switch
            label="Use my voice in every AI action"
            checked={settings.voice_enabled && !!settings.voice_profile}
            disabled={!settings.voice_profile}
            onChange={(on) => saveSettings({ voice_enabled: on })}
          />
        </label>
      </header>

      {notice && (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-sm ${notice.tone === "ok" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-600 dark:text-rose-300"}`}
        >
          {notice.text}
        </p>
      )}

      {/* Step 1: samples */}
      <section className="glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl tracking-tight">1. Writing samples</h2>
          <span className="text-sm text-muted tabular-nums">
            {totalWords.toLocaleString()} / {GOAL_WORDS.toLocaleString()}+ words
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-strong">
          <div className="bg-gradient-brand h-full rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          Best results: 3 to 10 pieces you wrote yourself, like emails, posts, or articles. English, Spanish, or both.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <AddButton icon={<ClipboardPaste size={16} />} active={adding === "paste"} onClick={() => setAdding(adding === "paste" ? null : "paste")}>
            Paste text
          </AddButton>
          <AddButton icon={<FileUp size={16} />} onClick={() => fileInput.current?.click()}>
            Upload files
          </AddButton>
          <AddButton icon={<FileText size={16} />} active={adding === "docs"} onClick={() => setAdding(adding === "docs" ? null : "docs")}>
            From my documents
          </AddButton>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {adding === "paste" && (
          <PasteForm
            onCancel={() => setAdding(null)}
            onSave={async (title, content) => {
              await addSamples([{ title, content, source: "paste" }]);
              setAdding(null);
            }}
          />
        )}
        {adding === "docs" && (
          <DocPicker
            supabase={supabase}
            onCancel={() => setAdding(null)}
            onPick={async (docs) => {
              await addSamples(docs.map((d) => ({ title: d.title || "Untitled", content: d.content_text, source: "document" as const })));
              setAdding(null);
            }}
          />
        )}

        <ul className="mt-4 divide-y divide-line">
          {samples === null && <li className="py-6 text-center text-muted"><Loader2 className="mx-auto animate-spin" /></li>}
          {samples?.length === 0 && <li className="py-6 text-center text-sm text-muted">No samples yet. Add a few pieces of your writing to get started.</li>}
          {samples?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.title || "Untitled"}</p>
                <p className="truncate text-sm text-muted">{s.content.slice(0, 140)}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{s.word_count.toLocaleString()} words</span>
              <button onClick={() => removeSample(s.id)} aria-label={`Remove ${s.title || "sample"}`} className="rounded-full p-2 text-muted hover:bg-surface-strong hover:text-rose-500">
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Step 2: build */}
      <section className="glass flex flex-col items-start gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-display text-2xl tracking-tight">2. Build your profile</h2>
          <p className="text-sm text-muted">
            {settings.voice_profile_updated_at
              ? `Last built ${timeAgo(settings.voice_profile_updated_at)}. Rebuild after adding new samples.`
              : "Takes about 30 seconds. You can edit everything afterwards."}
          </p>
        </div>
        <button
          onClick={build}
          disabled={building || !samples?.length}
          className="bg-gradient-brand flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 font-medium text-white shadow-md shadow-accent/20 transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          {building ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
          {building ? "Studying your writing…" : settings.voice_profile ? "Rebuild profile" : "Build my voice"}
        </button>
      </section>

      {/* Step 3: profile */}
      {settings.voice_profile && (
        <ProfileEditor
          key={settings.voice_profile_updated_at ?? "profile"}
          profile={settings.voice_profile}
          onSave={async (p) => {
            const ok = await saveSettings({ voice_profile: p });
            if (ok) setNotice({ tone: "ok", text: "Voice profile saved." });
          }}
        />
      )}

      {settings.voice_profile && <TestDrive voiceOn={settings.voice_enabled} />}
    </div>
  );
}

function AddButton({ icon, active, onClick, children }: { icon: React.ReactNode; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm ring-1 transition ${active ? "bg-ink text-bg ring-ink" : "ring-line hover:bg-surface-strong"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function PasteForm({ onSave, onCancel }: { onSave: (title: string, content: string) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 space-y-2 rounded-2xl bg-surface-strong p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional), e.g. Newsletter, March"
        className="w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        placeholder="Paste something you wrote…"
        className="w-full resize-y rounded-xl bg-bg px-3 py-2 leading-relaxed ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="flex items-center gap-2">
        <button
          disabled={busy || !content.trim()}
          onClick={async () => {
            setBusy(true);
            await onSave(title.trim(), content);
            setBusy(false);
          }}
          className="bg-gradient-brand flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus size={15} /> Add sample
        </button>
        <button onClick={onCancel} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
        <span className="ml-auto text-xs text-muted">{countWords(content)} words</span>
      </div>
    </div>
  );
}

function DocPicker({
  supabase,
  onPick,
  onCancel,
}: {
  supabase: ReturnType<typeof createClient>;
  onPick: (docs: DocPick[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [docs, setDocs] = useState<DocPick[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => {
    supabase
      .from("documents")
      .select("id,title,content_text,word_count")
      .gt("word_count", 0)
      .order("updated_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setDocs((data as DocPick[]) ?? []));
  }, [supabase]);

  const toggle = (id: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-4 rounded-2xl bg-surface-strong p-2">
      <ul className="max-h-64 overflow-y-auto">
        {docs === null && <li className="p-4 text-center text-muted"><Loader2 className="mx-auto animate-spin" /></li>}
        {docs?.length === 0 && <li className="p-4 text-center text-sm text-muted">No documents with text yet.</li>}
        {docs?.map((d) => (
          <li key={d.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-bg">
              <input type="checkbox" checked={chosen.has(d.id)} onChange={() => toggle(d.id)} className="accent-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate">{d.title || "Untitled"}</span>
              <span className="text-xs text-muted">{d.word_count} words</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 p-2">
        <button
          disabled={!chosen.size}
          onClick={() => docs && onPick(docs.filter((d) => chosen.has(d.id)))}
          className="bg-gradient-brand flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus size={15} /> Add {chosen.size || ""} selected
        </button>
        <button onClick={onCancel} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}

const TEXT_FIELDS: { key: keyof VoiceProfile; label: string; hint: string }[] = [
  { key: "summary", label: "Your voice in a nutshell", hint: "The single most important instruction." },
  { key: "sentences", label: "Sentences", hint: "Length and rhythm." },
  { key: "vocabulary", label: "Word choice", hint: "Plain or fancy, slang, contractions." },
  { key: "formatting", label: "Formatting", hint: "Paragraphs, lists, emojis." },
  { key: "languages", label: "Languages", hint: "How you mix English and Spanish, if you do." },
];
const LIST_FIELDS: { key: keyof VoiceProfile; label: string; placeholder: string }[] = [
  { key: "tone", label: "Tone", placeholder: "Add a word, like warm" },
  { key: "favorite_phrases", label: "Favorite phrases", placeholder: "Add a phrase you love" },
  { key: "words_to_avoid", label: "Words to avoid", placeholder: "Add a word you'd never use" },
  { key: "do", label: "Do", placeholder: "Add a habit" },
  { key: "dont", label: "Don't", placeholder: "Add something to avoid" },
];

function ProfileEditor({ profile, onSave }: { profile: VoiceProfile; onSave: (p: VoiceProfile) => Promise<void> }) {
  const [draft, setDraft] = useState<VoiceProfile>({ ...EMPTY_PROFILE, ...profile });
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);
  const set = <K extends keyof VoiceProfile>(key: K, value: VoiceProfile[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl tracking-tight">3. Your voice profile</h2>
        <span className="text-xs text-muted">Edit anything. It’s yours.</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        {TEXT_FIELDS.map(({ key, label, hint }) => (
          <label key={key} className="block">
            <span className="text-sm font-medium">{label}</span>
            <span className="ml-2 text-xs text-muted">{hint}</span>
            <textarea
              value={draft[key] as string}
              onChange={(e) => set(key, e.target.value as never)}
              rows={key === "summary" ? 3 : 2}
              className="mt-1.5 w-full resize-y rounded-xl bg-bg px-3 py-2 leading-relaxed ring-1 ring-line outline-none [field-sizing:content] [overflow-wrap:anywhere] focus:ring-2 focus:ring-accent"
            />
          </label>
        ))}
        {LIST_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <span className="text-sm font-medium">{label}</span>
            <TagInput values={draft[key] as string[]} onChange={(v) => set(key, v as never)} placeholder={placeholder} danger={key === "words_to_avoid" || key === "dont"} />
          </div>
        ))}
      </div>

      <div className="sticky bottom-24 mt-6 flex items-center gap-2 md:bottom-4">
        <button
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            await onSave(normalizeProfile(draft));
            setSaving(false);
          }}
          className="bg-gradient-brand rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-accent/20 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {dirty && (
          <button onClick={() => setDraft({ ...EMPTY_PROFILE, ...profile })} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
            Undo changes
          </button>
        )}
      </div>
    </section>
  );
}

function TagInput({ values, onChange, placeholder, danger }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; danger?: boolean }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  };
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-xl bg-bg p-2 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
      {values.map((v) => (
        <span
          key={v}
          className={`flex items-center gap-1 rounded-full py-1 pr-1.5 pl-3 text-sm ${danger ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-surface-strong"}`}
        >
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="rounded-full p-0.5 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        className="min-w-40 flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted"
      />
    </div>
  );
}

function TestDrive({ voiceOn }: { voiceOn: boolean }) {
  const [text, setText] = useState("We are pleased to announce that our new service is now available. It offers many benefits to customers.");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <h2 className="font-display text-2xl tracking-tight">Test drive</h2>
      <p className="text-sm text-muted">Paste something bland and hear it in your voice.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="mt-3 w-full resize-y rounded-xl bg-bg px-3 py-2 leading-relaxed ring-1 ring-line outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        disabled={busy || !text.trim() || !voiceOn}
        onClick={async () => {
          setBusy(true);
          setResult("");
          try {
            await streamFetch("/api/ai/edit", { action: "rewrite", text, document: "" }, setResult);
          } catch (e) {
            setResult((e as Error).message);
          }
          setBusy(false);
        }}
        className="bg-gradient-brand mt-2 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Rewrite in my voice
      </button>
      {!voiceOn && <p className="mt-2 text-xs text-muted">Turn on “Use my voice” at the top to try it.</p>}
      {result && <div className="mt-4 rounded-2xl bg-surface-strong p-4 leading-relaxed whitespace-pre-wrap">{result}</div>}
    </section>
  );
}
