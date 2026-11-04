import type { Metadata, Viewport } from "next";
import { SatoriProvider } from "@/components/satori/provider";
import { RegisterSatoriServiceWorker } from "@/components/satori/register-sw";
import { SatoriShell } from "@/components/satori/shell";
import "./satori.css";

// Pages render on the device after the client boots (data comes from /api/satori).
export const instant = false;

export const metadata: Metadata = {
  title: { default: "PromptSatori", template: "%s · PromptSatori" },
  description: "Describe what you want. Receive an excellent prompt. Improve it effortlessly.",
  manifest: "/satori/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PromptSatori", statusBarStyle: "default" },
  icons: { apple: "/satori-icons/apple-touch-icon.png", icon: "/satori-icons/icon-192.png" },
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

export default function SatoriLayout({ children }: { children: React.ReactNode }) {
  return (
    <SatoriProvider>
      <SatoriShell>{children}</SatoriShell>
      <RegisterSatoriServiceWorker />
    </SatoriProvider>
  );
}
