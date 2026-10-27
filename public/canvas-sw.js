// The Daily Canvas service worker: lets the planner open with no connection.
// - Planner pages (/canvas...): network first, falling back to the last cached copy.
// - Next.js build assets (/_next/static): cache first (they are content-hashed).
// - Everything else (APIs, Supabase, Google): never cached here; the app's own
//   IndexedDB outbox handles offline changes.
const VERSION = "dc-v1";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const SHELL = ["/canvas", "/canvas/manifest.webmanifest", "/canvas-icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { credentials: "include" })).catch(() => {})))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("dc-") && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/canvas-icons/")) {
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

  const isPlannerPage = url.pathname === "/canvas" || url.pathname.startsWith("/canvas/");
  const isNav = req.mode === "navigate" || req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isPlannerPage && isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Don't cache redirects to the login page.
          if (res.ok && !res.redirected) caches.open(PAGES).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(async () => {
          const c = await caches.open(PAGES);
          return (await c.match(req, { ignoreSearch: true })) || (await c.match("/canvas")) || Response.error();
        }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      const open = list.find((c) => new URL(c.url).pathname.startsWith("/canvas"));
      return open ? open.focus() : self.clients.openWindow("/canvas");
    }),
  );
});
