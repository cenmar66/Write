"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type BrandKit, DEFAULT_BRAND, renderCard } from "@/lib/social/quote-card";
import { createClient } from "@/lib/supabase/client";

export function BrandKitEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [brand, setBrand] = useState<BrandKit>(DEFAULT_BRAND);
  const [saved, setSaved] = useState<BrandKit | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("brand_kit")
      .maybeSingle()
      .then(({ data }) => {
        const kit = { ...DEFAULT_BRAND, ...(data?.brand_kit ?? {}) } as BrandKit;
        setBrand(kit);
        setSaved(kit);
      });
  }, [supabase]);

  // Live preview, redrawn shortly after each change.
  useEffect(() => {
    let url: string | null = null;
    const t = setTimeout(async () => {
      const blob = await renderCard({ text: "Your words, on brand.\nEvery single time.", brand, size: "square", footer: "1/5" });
      url = URL.createObjectURL(blob);
      setPreview(url);
    }, 250);
    return () => {
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
  }, [brand]);

  async function uploadLogo(file: File) {
    setUploading(true);
    const { data: session } = await supabase.auth.getSession();
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${session.session?.user.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: true });
    if (!error) setBrand((b) => ({ ...b, logo_url: supabase.storage.from("media").getPublicUrl(path).data.publicUrl }));
    setUploading(false);
  }

  async function save() {
    setSaving(true);
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase.from("user_settings").upsert({ user_id: session.session?.user.id, brand_kit: brand, updated_at: new Date().toISOString() });
    if (!error) setSaved(brand);
    setSaving(false);
  }

  const set = <K extends keyof BrandKit>(k: K, v: BrandKit[K]) => setBrand((b) => ({ ...b, [k]: v }));
  const dirty = JSON.stringify(brand) !== JSON.stringify(saved);

  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <h2 className="font-medium">Brand kit</h2>
      <p className="mb-4 text-sm text-muted">Colors, font, and logo for quote cards and carousel slides.</p>
      <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-4">
            {(["background", "text", "accent"] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 capitalize">
                <input type="color" value={brand[k]} onChange={(e) => set(k, e.target.value)} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
                {k}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2">
              Font
              <select value={brand.font} onChange={(e) => set("font", e.target.value as BrandKit["font"])} className="rounded-lg bg-bg px-2 py-1.5 ring-1 ring-line">
                <option value="serif">Elegant serif</option>
                <option value="sans">Clean sans</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              Background
              <select value={brand.style} onChange={(e) => set("style", e.target.value as BrandKit["style"])} className="rounded-lg bg-bg px-2 py-1.5 ring-1 ring-line">
                <option value="gradient">Gradient</option>
                <option value="solid">Solid</option>
              </select>
            </label>
          </div>
          <label className="block">
            Handle or website
            <input value={brand.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@yourbusiness" className="mt-1 w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => logoInput.current?.click()} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 ring-1 ring-line hover:bg-surface-strong">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {brand.logo_url ? "Change logo" : "Upload logo"}
            </button>
            {brand.logo_url && (
              <button onClick={() => set("logo_url", null)} className="flex items-center gap-1 text-muted hover:text-rose-500">
                <X size={13} /> Remove
              </button>
            )}
            <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </div>
          <button onClick={save} disabled={!dirty || saving} className="bg-gradient-brand rounded-full px-5 py-2 font-medium text-white disabled:opacity-40">
            {saving ? "Saving…" : dirty ? "Save brand kit" : "Saved"}
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
        {preview && <img src={preview} alt="Brand preview" className="w-full rounded-2xl shadow-md" />}
      </div>
    </section>
  );
}
