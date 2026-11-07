import type { Metadata, Viewport } from "next";
import { InboxShell } from "@/components/inbox/shell";
import "./inbox.css";

// InboxSatori renders on the client from /api/inbox (session-dependent data), so the
// server "instant navigation" check has nothing to validate here.
export const instant = false;

export const metadata: Metadata = {
  title: "InboxSatori",
  description: "Your inbox should work for you, not the other way around.",
  manifest: "/inbox/manifest.webmanifest",
  appleWebApp: { capable: true, title: "InboxSatori", statusBarStyle: "default" },
  icons: { apple: "/inbox-icons/apple-touch-icon.png" }, // tab icon: ./icon.svg (file convention)
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

// If the app's scripts fail before React starts (so no error screen can render), show the
// errors after a few seconds instead of leaving a blank page. Error text only.
const bootWatch = `(function(){var errs=[];function add(m){if(errs.length<5)errs.push(String(m).slice(0,300))}
addEventListener("error",function(e){add((e.message||"Script failed to load")+(e.filename?" @ "+e.filename.split("/").pop()+":"+e.lineno:""))},true);
addEventListener("unhandledrejection",function(e){var r=e.reason;add(r&&r.message?r.name+": "+r.message:r)});
setTimeout(function(){var root=document.querySelector(".ip-root");if(!errs.length||(root&&root.innerText.trim().length>20))return;
var d=document.createElement("div");d.setAttribute("role","alert");d.style.cssText="position:fixed;inset:0;z-index:2147483647;background:#161a22;color:#e8eaf0;padding:20px;font:14px -apple-system,sans-serif;overflow:auto";
d.innerText="InboxSatori couldn't start in this browser.\\n\\n"+errs.join("\\n")+"\\n\\nBrowser: "+navigator.userAgent+"\\n\\nPull down to reload, or send this screen to support.";document.body.appendChild(d)},8000)})();`;

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ip-root">
      <script dangerouslySetInnerHTML={{ __html: bootWatch }} />
      <InboxShell>{children}</InboxShell>
    </div>
  );
}
