/* Emergent CRM service worker, hand-written (no Workbox).
   Goal: make the installed PWA launch instantly and survive flaky networks,
   WITHOUT ever serving stale API data. Bump CACHE on any shell change. */
const CACHE = "emergent-crm-v1";

// App-shell assets that are safe to precache. Hashed JS/CSS bundles are cached
// lazily on first fetch (their names change per build, so we can't list them here).
const SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/emergent-logo.jpeg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache API traffic: always go to the network, no offline fallback that
  // could show a logged-in user someone else's or stale pipeline data.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // Only handle same-origin static GETs; let cross-origin (fonts, analytics) pass through.
  if (url.origin !== self.location.origin) return;

  // SPA navigations: serve cached index.html shell, fall back to network.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets: cache-first, then network, and populate the cache on the way.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
