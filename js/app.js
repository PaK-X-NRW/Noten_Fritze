/* =========================================================================
   app.js – Bootstrap
   Startet die App: Aktions-Delegation, Demo-Daten beim ersten Start,
   erster Render, „Neu in …“ nach einem Update und (nur über http/https)
   Service-Worker für Offline.
   ========================================================================= */
(function () {
  "use strict";

  // Nach einem Update einmal zeigen, was neu ist (neuigkeiten.js). Bei einer
  // Neuinstallation nicht. Wer von einer Version ohne Vermerk kommt (vor
  // 1.19.0), sieht einmalig alles ab 1.18.0.
  async function neuigkeitenZeigen(neuInstalliert) {
    const s = await Store.getSettings();
    if (s.gesehenVersion === APP_VERSION) return;
    const seit = s.gesehenVersion || (neuInstalliert ? APP_VERSION : "1.17.0");
    s.gesehenVersion = APP_VERSION;
    await Store.saveSettings(s);
    if (Views.state.settings) Views.state.settings.gesehenVersion = APP_VERSION;
    const liste = Calc.neuigkeitenSeit(window.NEUIGKEITEN, seit, APP_VERSION);
    if (liste.length) Views.neuigkeitenDialog(liste, true);
  }

  async function boot() {
    let neuInstalliert = false;
    try {
      await DB.open();
      // Daten-Migrationen (schemaVersion) vor allem anderen ausführen
      await Store.migrateSchema();
      // Leere Datenbank = Neuinstallation (für das Neuigkeiten-Fenster)
      neuInstalliert = !(await Store.Klassen.all()).length;
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

    // Alles, was sonst unbemerkt scheitern würde (z. B. Knöpfe in Dialogen),
    // als Toast melden
    window.addEventListener("unhandledrejection", (ev) => UI.fehlerMelden(ev.reason));
    window.addEventListener("error", (ev) => { if (ev.error) UI.fehlerMelden(ev.error); });

    // Anhänge der Stundenplanung aufräumen (Frist abgelaufen, nicht mehr benutzt)
    try {
      const s = await Store.getSettings();
      await Store.Dateien.aufraeumen(s.dateiAufbewahrung === "nie" ? null : s.dateiFristTage, Store.datumLokal());
    } catch (e) { console.warn("Dateien aufräumen:", e); }
    // Klassen, die länger als 30 Tage im Papierkorb liegen, endgültig löschen
    try { await Store.Papierkorb.aufraeumen(Store.datumLokal()); } catch (e) { console.warn("Papierkorb:", e); }

    Views.initDelegation();
    await Views.render();
    // Aufruf von der Umzugsseite der alten Adresse (?umzug=1): Daten empfangen
    Views.umzugEmpfangen();
    try { await neuigkeitenZeigen(neuInstalliert); } catch (e) { console.warn("Neuigkeiten:", e); }

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
