// PromptDojo installs as its own app (separate from Write.ai), scoped to /dojo.
export function GET() {
  const manifest = {
    id: "/dojo",
    name: "PromptDojo",
    short_name: "PromptDojo",
    description: "Turn plain requests into excellent AI prompts.",
    start_url: "/dojo",
    scope: "/dojo",
    display: "standalone",
    orientation: "any",
    background_color: "#f8f6f1",
    theme_color: "#0f6e66",
    icons: [
      { src: "/dojo-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/dojo-icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/dojo-icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Analyze a prompt", url: "/dojo/analyzer" },
      { name: "My library", url: "/dojo/library" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
