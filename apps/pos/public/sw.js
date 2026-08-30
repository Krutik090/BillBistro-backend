// Minimal offline app-shell service worker (Phase 0). Workbox + background sync land with the offline order queue.
const CACHE = "bb-pos-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image")) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(request)) ?? fetch(request).then((r) => { c.put(request, r.clone()); return r; })));
    return;
  }
  if (request.mode === "navigate") {
    e.respondWith(fetch(request).then((r) => { caches.open(CACHE).then((c) => c.put(request, r.clone())); return r; }).catch(() => caches.match(request).then((r) => r ?? caches.match("/"))));
  }
});
