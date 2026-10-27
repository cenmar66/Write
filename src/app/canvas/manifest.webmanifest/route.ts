// The Daily Canvas has its own installable app (separate from Write.ai), scoped to /canvas.
export function GET() {
  const manifest = {
    id: "/canvas",
    name: "The Daily Canvas",
    short_name: "Daily Canvas",
    description: "Plan a brighter, more present day.",
    start_url: "/canvas",
    scope: "/canvas",
    display: "standalone",
    orientation: "any",
    background_color: "#efe9df",
    theme_color: "#efe9df",
    icons: [
      { src: "/canvas-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/canvas-icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/canvas-icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Quick add", url: "/canvas?capture=1" }],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
