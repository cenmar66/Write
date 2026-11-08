"use client";

// Attach images and website pages to a request. Images are resized and re-encoded in the
// browser before upload, which keeps requests small and strips hidden photo data such as
// GPS location. Nothing here is saved; attachments last for the current page only.
import { Globe, ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";
import { MAX_IMAGE_BASE64, MAX_IMAGES, MAX_SOURCES, type ImageInput, type SourceInput } from "@/lib/satori/context";
import { api } from "./client";

export type AttachedImage = ImageInput & { id: string; preview: string };
export type AttachedSource = SourceInput & { id: string; truncated?: boolean };

const MAX_EDGE = 1568; // larger images are downscaled by the providers anyway
const uid = () => Math.random().toString(36).slice(2);

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can't open that image. Try a JPEG or PNG (on iPhone: share as JPEG)."));
    };
    img.src = url;
  });
}

/** Resize to fit MAX_EDGE and re-encode (JPEG, or PNG when the image has transparency). */
export async function prepareImage(file: File): Promise<AttachedImage> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) throw new Error(`“${file.name}” isn't an image.`);
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("Couldn't process that image.");
  g.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  const keepPng = file.type === "image/png" && hasTransparency(g, w, h);
  let quality = 0.85;
  let dataUrl = canvas.toDataURL(keepPng ? "image/png" : "image/jpeg", quality);
  while (!keepPng && dataUrl.length > MAX_IMAGE_BASE64 && quality > 0.45) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  const [head, data] = dataUrl.split(",");
  if (data.length > MAX_IMAGE_BASE64) throw new Error(`“${file.name}” is too detailed to send. Try a smaller image or a screenshot of part of it.`);
  const mediaType = head.includes("image/png") ? "image/png" : "image/jpeg";
  return { id: uid(), mediaType, data, name: file.name.slice(0, 120), preview: dataUrl };
}

function hasTransparency(g: CanvasRenderingContext2D, w: number, h: number): boolean {
  const step = Math.max(1, Math.floor((w * h) / 20000));
  const px = g.getImageData(0, 0, w, h).data;
  for (let i = 3; i < px.length; i += 4 * step) if (px[i] < 250) return true;
  return false;
}

/** Strips preview data before sending. */
export const toImageInputs = (images: AttachedImage[]): ImageInput[] => images.map(({ mediaType, data, name }) => ({ mediaType, data, name }));
export const toSourceInputs = (sources: AttachedSource[]): SourceInput[] => sources.map(({ url, title, text }) => ({ url, title, text }));

export function Attachments({
  images,
  sources,
  onImages,
  onSources,
  disabled,
  imageHint = "The AI will look at these while it works.",
}: {
  images: AttachedImage[];
  sources: AttachedSource[];
  onImages: (next: AttachedImage[]) => void;
  onSources: (next: AttachedSource[]) => void;
  disabled?: boolean;
  imageHint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"image" | "web" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");

  async function addFiles(files: File[]) {
    setError(null);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return setError(`You can attach up to ${MAX_IMAGES} images.`);
    setBusy("image");
    const added: AttachedImage[] = [];
    for (const f of files.slice(0, room)) {
      try {
        added.push(await prepareImage(f));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (files.length > room) setError(`Only ${MAX_IMAGES} images fit; the rest were skipped.`);
    onImages([...images, ...added]);
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function addUrl() {
    const value = url.trim();
    if (!value) return;
    if (sources.length >= MAX_SOURCES) return setError(`You can add up to ${MAX_SOURCES} websites.`);
    setError(null);
    setBusy("web");
    try {
      const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
      const r = await api<{ source: SourceInput; truncated: boolean }>("/api/satori/web/preview", { body: { url: withScheme } });
      onSources([...sources, { ...r.source, id: uid(), truncated: r.truncated }]);
      setUrl("");
      setUrlOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Attach images" onChange={(e) => e.target.files && addFiles([...e.target.files])} />
        <button type="button" className="ps-btn ps-btn-sm ps-btn-ghost" onClick={() => fileRef.current?.click()} disabled={disabled || busy !== null || images.length >= MAX_IMAGES} title={imageHint}>
          {busy === "image" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />}
          <span>Image</span>
        </button>
        <button type="button" className="ps-btn ps-btn-sm ps-btn-ghost" onClick={() => setUrlOpen((o) => !o)} aria-expanded={urlOpen} disabled={disabled || sources.length >= MAX_SOURCES}>
          <Globe size={16} aria-hidden />
          <span>Website</span>
        </button>
      </div>

      {urlOpen && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void addUrl();
          }}
        >
          <label htmlFor="ps-add-url" className="sr-only">
            Website address
          </label>
          <input id="ps-add-url" className="ps-input flex-1 py-1.5 text-sm" placeholder="https://example.com/page" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="url" autoFocus />
          <button type="submit" className="ps-btn ps-btn-sm" disabled={busy !== null || !url.trim()}>
            {busy === "web" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {busy === "web" ? "Reading…" : "Add page"}
          </button>
        </form>
      )}

      {(images.length > 0 || sources.length > 0) && (
        <ul className="flex flex-wrap gap-2" aria-label="Attachments">
          {images.map((img) => (
            <li key={img.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a user-picked file */}
              <img src={img.preview} alt={img.name ?? "Attached image"} className="size-16 rounded-lg border object-cover ps-line" />
              <button type="button" className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full shadow" style={{ background: "var(--ps-ink)", color: "var(--ps-bg)" }} aria-label={`Remove ${img.name ?? "image"}`} onClick={() => onImages(images.filter((i) => i.id !== img.id))}>
                <X size={12} />
              </button>
            </li>
          ))}
          {sources.map((s) => (
            <li key={s.id} className="flex max-w-xs items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ps-line" title={`${s.url}\n${s.text.length.toLocaleString()} characters${s.truncated ? " (trimmed)" : ""}`}>
              <Globe size={13} className="shrink-0 ps-muted" aria-hidden />
              <span className="truncate">{s.title || new URL(s.url).hostname}</span>
              <button type="button" className="shrink-0 ps-muted hover:text-[var(--ps-ink)]" aria-label={`Remove ${s.title || s.url}`} onClick={() => onSources(sources.filter((x) => x.id !== s.id))}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--ps-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
