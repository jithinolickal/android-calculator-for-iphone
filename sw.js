// Service worker — caches the app shell for offline use.
//
// Strategy auto-selects by host (no manual toggling, no params):
//   • Dev  (localhost / 127.0.0.1) → NETWORK-FIRST: always fetch latest, fall back to cache.
//   • Prod (e.g. github.io)        → CACHE-FIRST:   instant load + full offline.
const CACHE = "calc-v8";
const DEV = ["localhost", "127.0.0.1"].includes(self.location.hostname);

const ASSETS = [
  ".",
  "index.html",
  "styles.css",
  "calc.js",
  "app.js",
  "manifest.json",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function fromNetwork(request) {
  return fetch(request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
    return res;
  });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (DEV) {
    // network-first
    e.respondWith(fromNetwork(e.request).catch(() => caches.match(e.request)));
  } else {
    // cache-first
    e.respondWith(caches.match(e.request).then((cached) => cached || fromNetwork(e.request).catch(() => cached)));
  }
});
