/* =========================================================================
   app.js – Bootstrap
   Startet die App: Aktions-Delegation, Demo-Daten beim ersten Start,
   erster Render und (nur über http/https) Service-Worker für Offline.
   ========================================================================= */
(function () {
  "use strict";

  async function boot() {
    try {
      await DB.open();
      // Beim allerersten Start Demo-Daten anlegen (nur wenn DB leer ist)
      await Store.seedDemoData();
      // Daten-Migrationen (schemaVersion) vor dem ersten Render ausführen
      await Store.migrateSchema();
    } catch (e) {
      console.error("DB-Fehler:", e);
      document.getElementById("view").innerHTML =
        '<div class="container"><div class="empty"><div class="big">⚠️</div>' +
        "<p>Der lokale Speicher (IndexedDB) ist nicht verfügbar.</p>" +
        '<p class="muted">Bitte den privaten Modus deaktivieren oder einen anderen Browser verwenden.</p></div></div>';
      return;
    }

    Views.initDelegation();
    await Views.render();

    // Service Worker nur bei echtem Hosting registrieren (nicht unter file://)
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      // Vor dem Registrieren merken, ob schon ein Service Worker die Seite
      // steuert: Nur dann ist ein späterer Wechsel wirklich ein Update und
      // nicht bloß die allererste Installation.
      const schonAktiv = !!navigator.serviceWorker.controller;
      // updateViaCache "none" ist entscheidend: Sonst holt der Browser die per
      // importScripts geladene version.js aus dem HTTP-Cache (GitHub Pages
      // liefert max-age=600) und merkt nicht, dass APP_VERSION gestiegen ist –
      // die installierte PWA bliebe auf der alten App-Shell hängen.
      navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" })
        .then((reg) => reg.update())
        .catch((e) => console.warn("SW:", e));
      // Der Service Worker übernimmt sofort (skipWaiting + clients.claim). Ein
      // Controller-Wechsel heißt deshalb: neue App-Shell liegt bereit.
      if (schonAktiv) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          UI.toast("Neue Version verfügbar", {
            aktion: { label: "Neu laden", onClick: () => location.reload() },
            duration: 12000
          });
        });
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
