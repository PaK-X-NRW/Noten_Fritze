/* =========================================================================
   views.core.js – Views-Kern: State, Navigation und Render-Schleife
   Legt window.Views an. Die View-Module (views.*.js) hängen ihre Funktionen
   per Object.assign daran; render() löst sie daher zur Laufzeit darüber auf.
   Außerdem hier die beiden Zeitraum-Navigationen:
   - halbjahrFilter / halbjahrTabsHTML: „1. Halbjahr · 2. Halbjahr“ – der
     Zeitraum der Notenübersicht (die Quartale stecken darin als Epochalnoten)
   - quartalFilter / quartalTabsHTML: „1.–4. Quartal · Jahr“ – Mitarbeit und
     Besprechungsmodus (siehe Calc.quartaleVonFilter).
   ========================================================================= */
(function (global) {
  "use strict";

  const state = {
    view: "home",          // home | klasse | tracker | besprechung | einstellungen
    klasseId: null,
    tab: "schueler",       // schueler | noten | kategorien | sitzplan | auswertung
    auswertungRange: "alle",
    // Notenübersicht: Zeitraum ist das Halbjahr ("1" | "2"), die Quartale
    // stecken darin als Epochalnoten. "" = Default aus dem aktuellen Quartal.
    notenHalbjahr: "",
    // Spaltenreihenfolge der Notenansicht, per Ziehen am Kopf gesetzt:
    // { key: "<klasseId>|hj<1|2>", ids: [...] }. Bewusst nur im State –
    // beim Neuladen gilt wieder die Default-Reihenfolge.
    notenSpalten: null,
    auswertungQuartal: "",  // dto. für die Mitarbeits-Auswertung
    // Besprechung
    selectedSchuelerId: null,
    // Tracker (flüchtig)
    tracker: null,
    pendingStunde: null,   // vom Start-Dialog übergebene (neue/fortgesetzte) Stunde
    trackerModus: null,    // null | "abwesend" | "keineha" | "heat"
    settings: null
  };

  // Liest den Quartal-Filter ("1".."4" | "jahr"); Default = Einstellung
  // (aktuellesQuartal). Rückgabe: 1 | 2 | 3 | 4 | null (null = ganzes Jahr).
  function quartalFilter(key) {
    if (!state[key]) state[key] = String((state.settings && state.settings.aktuellesQuartal) || 1);
    return state[key] === "jahr" ? null : parseInt(state[key], 10);
  }

  // Filter-Tabs „1. Q · 2. Q · 3. Q · 4. Q · Jahr“ (gemeinsames Markup für
  // Noten/Auswertung). Das data-hj-Attribut bleibt, damit die vorhandenen
  // Actions "noten-hj"/"ausw-hj" unverändert funktionieren.
  function quartalTabsHTML(key, action) {
    const aktuell = state[key] || String((state.settings && state.settings.aktuellesQuartal) || 1);
    return [["1", "1. Q"], ["2", "2. Q"], ["3", "3. Q"], ["4", "4. Q"], ["jahr", "Jahr"]].map(([id, l]) =>
      '<button class="tab ' + (aktuell === id ? "active" : "") + '" data-action="' + action + '" data-hj="' + id + '">' + l + "</button>"
    ).join("");
  }

  // Halbjahr der Notenübersicht. Default: das Halbjahr, in dem das
  // eingestellte aktuelle Quartal liegt. Rückgabe: 1 | 2.
  function halbjahrFilter() {
    if (!state.notenHalbjahr) {
      const q = parseInt((state.settings && state.settings.aktuellesQuartal) || 1, 10) || 1;
      state.notenHalbjahr = String(Store.halbjahrAusQuartal(q));
    }
    return parseInt(state.notenHalbjahr, 10) === 2 ? 2 : 1;
  }

  // Filter-Tabs „1. Halbjahr · 2. Halbjahr“ der Notenübersicht. In der
  // Oberstufe (MSS-Punkte ab Stufe 11) ist jedes Kurshalbjahr eine eigene
  // Endnote – dort heißen die Reiter deshalb „12.1 · 12.2“.
  function halbjahrTabsHTML(action, klasse) {
    const aktuell = halbjahrFilter();
    const stufe = klasse && Calc.istMSS(klasse) ? klasse.klassenstufe : null;
    return [[1, "1. Halbjahr"], [2, "2. Halbjahr"]].map(([nr, label]) =>
      '<button class="tab ' + (aktuell === nr ? "active" : "") + '" data-action="' + action + '" data-hj="' + nr + '">' +
      (stufe ? stufe + "." + nr : label) + "</button>"
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

  const api = global.Views = {
    state, go, render, quartalFilter, quartalTabsHTML,
    halbjahrFilter, halbjahrTabsHTML,
    // Legacy-Aliase, werden in Paket 4 entfernt (views.dialoge.js
    // destrukturiert noch die alten Namen)
    hjFilter: quartalFilter, hjTabsHTML: quartalTabsHTML
  };
})(window);
