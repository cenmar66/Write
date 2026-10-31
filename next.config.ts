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
  async headers() {
    return [
      { source: "/satori", headers: securityHeaders },
      { source: "/satori/:path*", headers: securityHeaders },
      { source: "/api/satori/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
