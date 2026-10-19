"use client";

import { Feather, Loader2, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/switch";
import { timeAgo } from "@/lib/docs";
import { STYLE_FIELDS, type WritingStyle } from "@/lib/styles";
import { createClient } from "@/lib/supabase/client";

type Row = WritingStyle & { voice_samples: { count: number }[] };

export function StylesHome() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [styles, setStyles] = useState<Row[] | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase
      .from("writing_styles")
      .select(`${STYLE_FIELDS},voice_samples(count)`)
      .order("is_default", { ascending: false })
      .order("created_at")
      .then(({ data, error }) => {
        if (error) setSetupNeeded(true);
        setStyles((data as Row[]) ?? []);
      });
    supabase
      .from("user_settings")
      .select("voice_enabled")
      .maybeSingle()
      .then(({ data }) => setEnabled(data?.voice_enabled ?? true));
  }, [supabase]);

  async function toggle(on: boolean) {
    setEnabled(on);
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: session.session?.user.id, voice_enabled: on, updated_at: new Date().toISOString() });
    if (error) setEnabled(!on);
  }

  async function create() {
    setCreating(true);
    const first = !styles?.length;
    const { data, error } = await supabase
      .from("writing_styles")
      .insert({ name: first ? "My voice" : "New style", is_default: first })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) return alert("Couldn't create the style. Has the 0007 database update been run?");
    router.push(`/styles/${data.id}`);
  }

  return (
    <div className="animate-rise space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Styles</h1>
          <p className="mt-1 max-w-lg text-muted">
            Teach the AI a way of writing from a few examples, then use it anywhere: documents, posts, newsletters.
          </p>
        </div>
        <button
          onClick={create}
          disabled={creating || setupNeeded}
          className="bg-gradient-brand flex shrink-0 items-center gap-2 self-start rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-accent/20 transition hover:-translate-y-0.5 disabled:opacity-50 sm:self-auto"
        >
          {creating ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />} New style
        </button>
      </header>

      {setupNeeded && (
        <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          One more database step: run <code>supabase/migrations/0007_styles.sql</code> in the Supabase SQL editor, then reload.
        </p>
      )}

      <label className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
        <span className="flex-1 text-sm">
          <span className="block font-medium">Use styles in AI actions</span>
          <span className="text-xs text-muted">Off means the AI writes in its own neutral voice, unless you pick a style yourself.</span>
        </span>
        <Switch label="Use styles in AI actions" checked={enabled} onChange={toggle} />
      </label>

      <section className="grid gap-3 sm:grid-cols-2">
        {styles === null && Array.from({ length: 2 }).map((_, i) => <div key={i} className="glass h-36 animate-pulse rounded-3xl" />)}
        {styles?.length === 0 && !setupNeeded && (
          <div className="col-span-full flex flex-col items-center py-14 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-surface-strong"><Feather className="text-accent" /></div>
            <p className="mt-4 font-display text-2xl">No styles yet.</p>
            <p className="mt-1 max-w-sm text-muted">Start with “My voice”: add a few things you wrote and let the AI learn how you sound.</p>
          </div>
        )}
        {styles?.map((s) => (
          <Link
            key={s.id}
            href={`/styles/${s.id}`}
            className="glass group flex min-h-36 flex-col rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(40,30,90,0.18)]"
          >
            <div className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${s.profile ? "bg-gradient-brand text-white" : "bg-surface-strong text-muted"}`}>
                <Feather size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-xl tracking-tight">{s.name}</h2>
                <p className="line-clamp-2 text-sm text-muted">{s.description || s.profile?.summary || "Add samples and build it."}</p>
              </div>
              {s.is_default && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-strong px-2 py-0.5 text-[11px] text-muted">
                  <Star size={11} className="text-accent" /> default
                </span>
              )}
            </div>
            <p className="mt-auto pt-4 text-xs text-muted">
              {s.voice_samples?.[0]?.count ?? 0} samples · {s.profile_updated_at ? `built ${timeAgo(s.profile_updated_at)}` : "not built yet"}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
