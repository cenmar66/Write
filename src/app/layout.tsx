import type { Metadata, Viewport } from "next";
import { Caveat, DM_Serif_Display, Fraunces, Inter, Montserrat, Playfair_Display, Space_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});
// Extra fonts for brand-kit cards. preload: false means they only download when a card uses them.
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["600"], preload: false });
const dmSerif = DM_Serif_Display({ variable: "--font-dmserif", subsets: ["latin"], weight: ["400"], preload: false });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["700"], preload: false });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["600"], preload: false });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["600"], preload: false });
const fontVars = [inter, fraunces, playfair, dmSerif, montserrat, grotesk, caveat].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Write.ai",
  description: "Your personal AI writing studio.",
  appleWebApp: { capable: true, title: "Write.ai", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f2ef" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVars}>
      <body>
        <ThemeProvider>
          <div className="aurora" aria-hidden><span /></div>
          <div className="grain" aria-hidden />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
