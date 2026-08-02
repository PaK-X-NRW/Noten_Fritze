/* =========================================================================
   views.core.js – Views-Kern: State, Navigation und Render-Schleife
   Legt window.Views an. Die View-Module (views.*.js) hängen ihre Funktionen
   per Object.assign daran; render() löst sie daher zur Laufzeit darüber auf.
   ========================================================================= */
(function (global) {
  "use strict";

  const state = {
    view: "home",          // home | klasse | tracker | besprechung | einstellungen
    klasseId: null,
    tab: "schueler",       // schueler | noten | kategorien | sitzplan | auswertung
    auswertungRange: "alle",
    notenHalbjahr: "",      // "1" | "2" | "jahr" ("" = Default aus Einstellungen)
    // Spaltenreihenfolge der Notenansicht, per Ziehen am Kopf gesetzt:
    // { key: "<klasseId>|<1|2|jahr>", ids: [...] }. Bewusst nur im State –
    // beim Neuladen gilt wieder die Default-Reihenfolge.
    notenSpalten: null,
    auswertungHalbjahr: "", // dto. für die Mitarbeits-Auswertung
    // Besprechung
    selectedSchuelerId: null,
    // Tracker (flüchtig)
    tracker: null,
    pendingStunde: null,   // vom Start-Dialog übergebene (neue/fortgesetzte) Stunde
    trackerModus: null,    // null | "abwesend" | "keineha" | "heat"
    settings: null
  };

  // Liest den Halbjahr-Filter ("1" | "2" | "jahr"); Default = Einstellung.
  // Rückgabe: 1 | 2 | null (null = ganzes Jahr).
  function hjFilter(key) {
    if (!state[key]) state[key] = String((state.settings && state.settings.aktuellesHalbjahr) || 1);
    return state[key] === "jahr" ? null : parseInt(state[key], 10);
  }

  // Filter-Tabs „1. HJ · 2. HJ · Jahr“ (gemeinsames Markup für Noten/Auswertung)
  function hjTabsHTML(key, action) {
    const aktuell = state[key] || String((state.settings && state.settings.aktuellesHalbjahr) || 1);
    return [["1", "1. HJ"], ["2", "2. HJ"], ["jahr", "Jahr"]].map(([id, l]) =>
      '<button class="tab ' + (aktuell === id ? "active" : "") + '" data-action="' + action + '" data-hj="' + id + '">' + l + "</button>"
    ).join("");
  }

  // ---- Navigation ----------------------------------------------------------
  async function go(view, params) {
    Object.assign(state, params || {});
    state.view = view;
    if (view === "klasse" && state.klasseId) await Store.Klassen.touchOpened(state.klasseId);
    await render();
    document.getElementById("view").scrollTop = 0;
  }

  async function render() {
    state.settings = await Store.getSettings();
    let out;
    switch (state.view) {
      case "home":         out = await api.ViewHome(); break;
      case "klasse":       out = await api.ViewKlasse(); break;
      case "tracker":      out = await api.ViewTracker(); break;
      case "besprechung":  out = await api.ViewBesprechung(); break;
      case "einstellungen":out = await api.ViewEinstellungen(); break;
      default:             out = await api.ViewHome();
    }
    document.getElementById("topbar").innerHTML = out.topbar || "";
    const containerClass = out.fullWidth ? "container container-wide" : "container";
    document.getElementById("view").innerHTML = '<div class="' + containerClass + '">' + (out.body || "") + "</div>";
    if (out.mount) out.mount();
  }

  const api = global.Views = { state, go, render, hjFilter, hjTabsHTML };
})(window);
