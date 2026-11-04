import type { NextConfig } from "next";

// Content Security Policy for PromptSatori (/satori and its API). Static (no nonces) so pages
// can stay prerendered: inline scripts are allowed for Next.js's bootstrap, but scripts,
// frames, objects and network connections from other origins are not. See
// docs/satori/SECURITY.md.
const isDev = process.env.NODE_ENV !== "production";
const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const supabaseWs = supabase.replace(/^http/, "ws");
const satoriCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs} wss://api.deepgram.com${isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`.trim(),
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].map((d) => d.replace(/\s+/g, " ").trim()).join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: satoriCsp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

// PromptSatori's own domains (see src/lib/satori-host.ts). On them, the browser-tab icon,
// home-screen icons and favicon are PromptSatori's, never Write.ai's.
const satoriHosts = (process.env.SATORI_HOSTS ?? "promptsatori.com,www.promptsatori.com")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const onSatoriHost = [{ type: "host" as const, value: `(?:${satoriHosts.map((h) => h.replace(/\./g, "\\.")).join("|")})` }];

// InboxSatori's own domains (see src/lib/inbox-host.ts): same idea, its own icons.
const inboxHosts = (process.env.INBOX_HOSTS ?? "inboxsatori.com,www.inboxsatori.com")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const onInboxHost = [{ type: "host" as const, value: `(?:${inboxHosts.map((h) => h.replace(/\./g, "\\.")).join("|")})` }];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/favicon.ico", has: onSatoriHost, destination: "/satori-icons/favicon-48.png" },
        { source: "/icon.svg", has: onSatoriHost, destination: "/satori-icons/icon.svg" },
        { source: "/icons/:file", has: onSatoriHost, destination: "/satori-icons/:file" },
        { source: "/favicon.ico", has: onInboxHost, destination: "/inbox-icons/favicon-48.png" },
        { source: "/icon.svg", has: onInboxHost, destination: "/inbox-icons/icon.svg" },
        { source: "/icons/:file", has: onInboxHost, destination: "/inbox-icons/:file" },
        { source: "/manifest.webmanifest", has: onInboxHost, destination: "/inbox/manifest.webmanifest" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/satori", headers: securityHeaders },
      { source: "/satori/:path*", headers: securityHeaders },
      { source: "/api/satori/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
