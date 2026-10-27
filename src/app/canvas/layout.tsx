import type { Metadata, Viewport } from "next";
import { EB_Garamond } from "next/font/google";
import { CanvasProvider } from "@/components/canvas/provider";
import { Shell } from "@/components/canvas/shell";
import { RegisterServiceWorker } from "@/components/canvas/register-sw";
import "./canvas.css";

// The planner renders on the device from IndexedDB (after a client boot), so the server
// "instant navigation" check has nothing to validate here.
export const instant = false;

const serif = EB_Garamond({ variable: "--font-dc-serif", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: "The Daily Canvas",
  description: "Plan a brighter, more present day.",
  manifest: "/canvas/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Daily Canvas", statusBarStyle: "default" },
  icons: { apple: "/canvas-icons/apple-touch-icon.png", icon: "/canvas-icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efe9df" },
    { media: "(prefers-color-scheme: dark)", color: "#161513" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CanvasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`dc-root ${serif.variable}`} data-theme="system" data-density="comfortable">
      <CanvasProvider>
        <Shell>{children}</Shell>
      </CanvasProvider>
      <RegisterServiceWorker />
    </div>
  );
}
