// Service worker — offline support with a network-first strategy.
//
// Network-first: when online, always fetch the latest file and refresh the cache; when
// offline, fall back to the cached copy. This means updates appear on the next launch with
// no cache-busting dance — important because iOS standalone PWAs are unreliable at picking
// up a new service worker. The cache is only a fallback for offline use.
//
// Bump CACHE when you want to guarantee old caches are purged on activate.
const CACHE = "calc-v9";

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

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
