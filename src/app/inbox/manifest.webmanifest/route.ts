// InboxPilot installs as its own app (PWA), scoped to /inbox.
export function GET() {
  const manifest = {
    id: "/inbox",
    name: "InboxPilot",
    short_name: "InboxPilot",
    description: "Your inbox should work for you, not the other way around.",
    start_url: "/inbox",
    scope: "/inbox",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f6f8",
    theme_color: "#ffffff",
    icons: [
      { src: "/inbox-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/inbox-icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/inbox-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/inbox-icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Priority Inbox", url: "/inbox/mail?view=priority" },
      { name: "Daily Brief", url: "/inbox/brief" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
