import type { Metadata, Viewport } from "next";
import { InboxShell } from "@/components/inbox/shell";
import "./inbox.css";

// InboxPilot renders on the client from /api/inbox (session-dependent data), so the
// server "instant navigation" check has nothing to validate here.
export const instant = false;

export const metadata: Metadata = {
  title: "InboxPilot",
  description: "Your inbox should work for you, not the other way around.",
  manifest: "/inbox/manifest.webmanifest",
  appleWebApp: { capable: true, title: "InboxPilot", statusBarStyle: "default" },
  icons: { apple: "/inbox-icons/apple-touch-icon.png", icon: "/inbox-icons/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#161a22" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ip-root">
      <InboxShell>{children}</InboxShell>
    </div>
  );
}
