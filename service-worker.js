/* =========================================================================
   service-worker.js – Offline-Cache (App-Shell)
   Cache-first für die statischen Dateien. Nutzdaten liegen in IndexedDB
   und werden vom Service Worker nicht angefasst.
   ========================================================================= */
const CACHE = "noten-fritze-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/db.js",
  "./js/store.js",
  "./js/calc.js",
  "./js/csv.js",
  "./js/ui.js",
  "./js/views.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      // Neue Same-Origin-Antworten opportunistisch cachen
      const copy = res.clone();
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
