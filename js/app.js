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
      navigator.serviceWorker.register("service-worker.js").catch((e) => console.warn("SW:", e));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
