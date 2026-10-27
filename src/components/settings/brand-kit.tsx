"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type BrandKit, CARD_FONTS, DEFAULT_BRAND, ensureFont, type FontKey, fontFamily, fontWeight, renderCard } from "@/lib/social/quote-card";
import { createClient } from "@/lib/supabase/client";

export function BrandKitEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [brand, setBrand] = useState<BrandKit>(DEFAULT_BRAND);
  const [saved, setSaved] = useState<BrandKit | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [fontCss, setFontCss] = useState<Record<string, string>>({});
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

  // Font stacks for the picker tiles (read from the page, so they match the cards).
  useEffect(() => {
    const keys = Object.keys(CARD_FONTS) as FontKey[];
    Promise.all(keys.map(ensureFont)).then(() => setFontCss(Object.fromEntries(keys.map((k) => [k, fontFamily(k)]))));
  }, []);

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
    setNotice(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("You're signed out. Refresh and sign in again.");
      const png = await toLogoPng(file);
      const path = `${uid}/logo-${Date.now()}.png`;
      // A fresh file name each time: no overwrite needed (overwriting needs extra storage permissions).
      const { error } = await supabase.storage.from("media").upload(path, png, { contentType: "image/png", upsert: false });
      if (error) {
        throw new Error(
          /bucket/i.test(error.message)
            ? "The image storage isn't set up yet. Run supabase/setup-all.sql in Supabase, then try again."
            : `Upload failed: ${error.message}`,
        );
      }
      const next = { ...brand, logo_url: supabase.storage.from("media").getPublicUrl(path).data.publicUrl };
      setBrand(next);
      if (await persist(next)) setNotice({ tone: "ok", text: "Logo uploaded and saved." });
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message || "Couldn't upload that image." });
    }
    setUploading(false);
    if (logoInput.current) logoInput.current.value = "";
  }

  async function persist(kit: BrandKit) {
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: session.session?.user.id, brand_kit: kit, updated_at: new Date().toISOString() });
    if (error) {
      setNotice({ tone: "error", text: "Couldn't save the brand kit. Check your connection and try again." });
      return false;
    }
    setSaved(kit);
    return true;
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    if (await persist(brand)) setNotice({ tone: "ok", text: "Brand kit saved." });
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
          <div>
            <span>Font</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Card font">
              {(Object.keys(CARD_FONTS) as FontKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={brand.font === k}
                  onClick={() => set("font", k)}
                  className={`rounded-xl px-3 py-2 text-left ring-1 transition ${brand.font === k ? "bg-bg ring-2 ring-accent" : "ring-line hover:bg-surface-strong"}`}
                >
                  <span className="block text-xl leading-tight" style={{ fontFamily: fontCss[k], fontWeight: fontWeight(k) }}>
                    Aa
                  </span>
                  <span className="block text-xs text-muted">{CARD_FONTS[k].label}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            Background
            <select value={brand.style} onChange={(e) => set("style", e.target.value as BrandKit["style"])} className="rounded-lg bg-bg px-2 py-1.5 ring-1 ring-line">
              <option value="gradient">Gradient</option>
              <option value="solid">Solid</option>
            </select>
          </label>
          <label className="block">
            Handle or website
            <input value={brand.handle} onChange={(e) => set("handle", e.target.value)} placeholder="@yourbusiness" className="mt-1 w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-line outline-none focus:ring-2 focus:ring-accent" />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => logoInput.current?.click()} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 ring-1 ring-line hover:bg-surface-strong">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />} {brand.logo_url ? "Change logo" : "Upload logo"}
            </button>
            {brand.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- your uploaded logo
              <img src={brand.logo_url} alt="Your logo" className="h-8 max-w-24 rounded object-contain ring-1 ring-line" />
            )}
            {brand.logo_url && (
              <button onClick={() => set("logo_url", null)} className="flex items-center gap-1 text-muted hover:text-red-700 dark:hover:text-red-400">
                <X size={13} /> Remove
              </button>
            )}
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
          </div>
          {notice && (
            <p role="status" className={`rounded-xl px-3 py-2 ${notice.tone === "ok" ? "bg-neutral-500/10 text-neutral-800 dark:text-neutral-300" : "bg-rose-500/10 text-red-700 dark:text-rose-300"}`}>
              {notice.text}
            </p>
          )}
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

/** Turns any image (PNG, JPEG, WebP, SVG…) into a PNG up to 800px, keeping transparency. */
async function toLogoPng(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Pick an image file (PNG, JPG, SVG, or WebP).");
  if (file.size > 10 * 1024 * 1024) throw new Error("That image is over 10 MB. Try a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Your browser can't read that image. Try a PNG or JPG."));
      i.src = url;
    });
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 800;
    const scale = Math.min(1, 800 / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}
