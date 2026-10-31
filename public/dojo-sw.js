// PromptDojo service worker: lets the app shell open with no connection.
// - Pages under /dojo: network first, falling back to the last cached copy.
// - Next.js build assets and icons: cache first (content-hashed).
// - APIs are never cached here (drafts are kept in localStorage by the app).
const VERSION = "pd-v1";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const SHELL = ["/dojo", "/dojo/manifest.webmanifest", "/dojo-icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { credentials: "include" })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pd-") && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/dojo-icons/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  const isPage = url.pathname === "/dojo" || url.pathname.startsWith("/dojo/");
  const isNav = req.mode === "navigate" || req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isPage && isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => {
          const c = await caches.open(PAGES);
          return (await c.match(req, { ignoreSearch: true })) || (await c.match("/dojo")) || Response.error();
        }),
    );
  }
});
