/* =========================================================================
   service-worker.js – Offline-Cache (App-Shell)
   Cache-first für die statischen Dateien. Nutzdaten liegen in IndexedDB
   und werden vom Service Worker nicht angefasst.
   ========================================================================= */
// Cache-Name = App-Version (js/version.js). Damit reicht das Erhöhen von
// APP_VERSION, um installierten PWAs eine neue App-Shell auszuliefern.
// Das funktioniert nur zusammen mit `updateViaCache: "none"` bei der
// Registrierung in js/app.js – sonst kommt die hier importierte version.js
// bei der Update-Prüfung aus dem HTTP-Cache und der Sprung bleibt unbemerkt.
importScripts("./js/version.js");
const CACHE = "noten-fritze-" + self.APP_VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/version.js",
  "./js/db.js",
  "./js/store.js",
  "./js/store.einstellungen.js",
  "./js/store.migrationen.js",
  "./js/store.transfer.js",
  "./js/store.demo.js",
  "./js/calc.js",
  "./js/csv.js",
  "./js/ui.js",
  "./js/views.core.js",
  "./js/views.home-klasse.js",
  "./js/views.tracker.js",
  "./js/views.besprechung.js",
  "./js/views.einstellungen.js",
  "./js/views.dialoge.js",
  "./js/views.js",
  "./js/app.js",
  "./info.html",
  "./img/tracker.jpg",
  "./img/noten.jpg",
  "./img/sitzplan.jpg",
  "./img/besprechung.jpg",
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
