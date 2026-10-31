import type { Metadata, Viewport } from "next";
import { DojoProvider } from "@/components/dojo/provider";
import { RegisterDojoServiceWorker } from "@/components/dojo/register-sw";
import { DojoShell } from "@/components/dojo/shell";
import "./dojo.css";

// Pages render on the device after the client boots (data comes from /api/dojo).
export const instant = false;

export const metadata: Metadata = {
  title: { default: "PromptDojo", template: "%s · PromptDojo" },
  description: "Describe what you want. Receive an excellent prompt. Improve it effortlessly.",
  manifest: "/dojo/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PromptDojo", statusBarStyle: "default" },
  icons: { apple: "/dojo-icons/apple-touch-icon.png", icon: "/dojo-icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#171918" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function DojoLayout({ children }: { children: React.ReactNode }) {
  return (
    <DojoProvider>
      <DojoShell>{children}</DojoShell>
      <RegisterDojoServiceWorker />
    </DojoProvider>
  );
}
