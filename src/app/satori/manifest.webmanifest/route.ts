// PromptSatori installs as its own app (separate from Write.ai), scoped to /satori.
export function GET() {
  const manifest = {
    id: "/satori",
    name: "PromptSatori",
    short_name: "PromptSatori",
    description: "Turn plain requests into excellent AI prompts.",
    start_url: "/satori",
    scope: "/satori",
    display: "standalone",
    orientation: "any",
    background_color: "#f8f6f1",
    theme_color: "#0f6e66",
    icons: [
      { src: "/satori-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/satori-icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/satori-icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Analyze a prompt", url: "/satori/analyzer" },
      { name: "My library", url: "/satori/library" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
