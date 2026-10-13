"use client";

// Turns text into a branded image (quote card or carousel slide), drawn in the browser.

export type BrandKit = {
  background: string;
  text: string;
  accent: string;
  font: "serif" | "sans";
  style: "solid" | "gradient";
  handle: string;
  logo_url: string | null;
};

export const DEFAULT_BRAND: BrandKit = {
  background: "#14121f",
  text: "#ffffff",
  accent: "#8b7bff",
  font: "serif",
  style: "gradient",
  handle: "",
  logo_url: null,
};

export const CARD_SIZES = {
  portrait: { width: 1080, height: 1350, label: "Portrait 4:5" },
  square: { width: 1080, height: 1080, label: "Square 1:1" },
} as const;

function fontFamily(kind: BrandKit["font"]): string {
  const css = getComputedStyle(document.documentElement).getPropertyValue(kind === "serif" ? "--font-fraunces" : "--font-inter").trim();
  return css || (kind === "serif" ? "Georgia, serif" : "system-ui, sans-serif");
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function renderCard(opts: {
  text: string;
  brand: BrandKit;
  size?: keyof typeof CARD_SIZES;
  footer?: string;
}): Promise<Blob> {
  const { width, height } = CARD_SIZES[opts.size ?? "portrait"];
  const b = opts.brand;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  if (b.style === "gradient") {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, b.background);
    g.addColorStop(1, b.accent);
    ctx.fillStyle = g;
  } else ctx.fillStyle = b.background;
  ctx.fillRect(0, 0, width, height);

  const pad = 96;
  const family = fontFamily(b.font);
  await document.fonts.load(`600 64px ${family}`).catch(() => {});

  // Top: logo, or a small accent bar.
  if (b.logo_url) {
    const logo = await loadImage(b.logo_url);
    if (logo) {
      const h = 88;
      ctx.drawImage(logo, pad, pad, (logo.width / logo.height) * h, h);
    }
  } else {
    ctx.fillStyle = b.accent;
    ctx.fillRect(pad, pad, 96, 10);
  }

  // Text: the biggest size that fits.
  const boxTop = pad + 160;
  const boxBottom = height - pad - 120;
  const maxWidth = width - pad * 2;
  let size = 92;
  let lines: string[] = [];
  for (; size >= 36; size -= 4) {
    ctx.font = `600 ${size}px ${family}`;
    lines = wrap(ctx, opts.text.trim(), maxWidth);
    if (lines.length * size * 1.25 <= boxBottom - boxTop) break;
  }
  ctx.fillStyle = b.text;
  ctx.textBaseline = "top";
  const blockHeight = lines.length * size * 1.25;
  let y = boxTop + Math.max(0, (boxBottom - boxTop - blockHeight) / 2);
  for (const line of lines) {
    ctx.fillText(line, pad, y);
    y += size * 1.25;
  }

  // Bottom: handle and slide number.
  ctx.font = `500 34px ${fontFamily("sans")}`;
  ctx.globalAlpha = 0.85;
  ctx.textBaseline = "alphabetic";
  if (b.handle) ctx.fillText(b.handle, pad, height - pad);
  if (opts.footer) {
    const w = ctx.measureText(opts.footer).width;
    ctx.fillText(opts.footer, width - pad - w, height - pad);
  }
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the card."))), "image/jpeg", 0.92));
}
