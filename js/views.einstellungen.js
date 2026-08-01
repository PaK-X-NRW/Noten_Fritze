/* =========================================================================
   views.einstellungen.js – Einstellungen inkl. Stundenplan-Verwaltung
   ========================================================================= */
(function (global) {
  "use strict";

  const { state } = global.Views;

  // ---- Stundenplan (Einstellungen) ------------------------------------------
  // Flacher Plan: genau 10 Stunden, die jeden Schultag gleich gelten.
  function stundenplanHTML(s) {
    const plan = Array.isArray(s.stundenplan) ? s.stundenplan : [];
    const zellen = plan.map((h, i) =>
      '<div class="sp-stunde">' +
        '<span class="muted">' + (i + 1) + ".</span>" +
        '<input type="time" lang="de-DE" data-sp-idx="' + i + '" data-sp-feld="start" value="' + UI.esc(h.start || "") + '">' +
        '<input type="time" lang="de-DE" data-sp-idx="' + i + '" data-sp-feld="ende" value="' + UI.esc(h.ende || "") + '">' +
      "</div>"
    ).join("");
    return '<div class="sp-grid">' + zellen + "</div>";
  }

  // =========================================================================
  //  EINSTELLUNGEN
  // =========================================================================
  async function ViewEinstellungen() {
    const s = state.settings;
    const punkte = Store.EVENT_TYPES.map((t) =>
      '<div class="form-row" style="align-items:center">' +
        '<div class="grow"><strong>' + UI.esc(t.label) + "</strong></div>" +
        '<input type="number" inputmode="numeric" style="width:110px" data-punkt="' + t.id + '" value="' + s.mitarbeitPunkte[t.id] + '">' +
      "</div>"
    ).join("");

    const heatpunkte = [
      ["einfach", "Wortmeldung", s.heatPunkteEinfach],
      ["gut", "Gute Meldung", s.heatPunkteGut],
      ["sehrgut", "Sehr gute Meldung", s.heatPunkteSehrGut]
    ].map(([key, label, value]) =>
      '<div class="form-row" style="align-items:center">' +
        '<div class="grow"><strong>' + UI.esc(label) + "</strong></div>" +
        '<input type="number" inputmode="numeric" style="width:110px" data-heat-punkt="' + key + '" value="' + value + '">' +
      "</div>"
    ).join("");

    const topbar =
      '<button class="iconbtn plain" data-action="home" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Einstellungen</h1></div>';

    const body =
      '<div class="card"><h2>Notenberechnung</h2>' +
        UI.field("Rundung der Gesamtnote", "rundung", s.rundung, { type: "select", options: [
          { value: "eine", label: "Eine Nachkommastelle (2,3)" },
          { value: "keine", label: "Zwei Nachkommastellen (2,33)" },
          { value: "ganze", label: "Ganze Note (2)" }
        ]}) +
        UI.field("Aktuelles Halbjahr", "aktuellesHalbjahr", s.aktuellesHalbjahr, { type: "select", options: [
          { value: "1", label: "1. Halbjahr" },
          { value: "2", label: "2. Halbjahr" }
        ], hint: "Neue Noten und Mitarbeits-Ereignisse werden diesem Halbjahr zugeordnet." }) +
      "</div>" +
      '<div class="card"><h2>Mitarbeit – Punkte je Ereignistyp</h2>' + punkte +
      "</div>" +
      '<div class="card"><h2>Heatmap</h2>' + heatpunkte +
        '<div class="field" style="margin-top:14px">' + UI.field("Default-Wert für neue / zurückgesetzte Heatmap", "heatStartWert", s.heatStartWert, { type: "number", inputmode: "numeric", hint: "Wertebereich: 0 bis 100" }) + "</div>" +
        '<div class="form-row" style="align-items:center">' +
          '<div class="grow"><strong>Y Heatmap-Punkte verfallen pro X Minuten</strong><div class="hint">Bezogen auf eine 45-Minuten-Stunde; der Tracker skaliert auf die tatsächliche Stundendauer.</div></div>' +
          '<input type="number" inputmode="numeric" style="width:110px" id="f-heatVerfallPunkte" value="' + s.heatVerfallPunkte + '">' +
          '<input type="number" inputmode="numeric" style="width:110px" id="f-heatVerfallMinuten" value="' + s.heatVerfallMinuten + '" placeholder="X Minuten">' +
        "</div>" +
      "</div>" +
      '<div class="card"><h2>Stundenplan</h2>' +
        '<p class="muted">Gilt für jeden Schultag gleich. Der Tracker erkennt damit die laufende Stunde und ihre Restzeit.</p>' +
        stundenplanHTML(s) +
      "</div>" +
      '<div class="card"><h2>Datensicherung</h2><p class="muted">Alle Daten bleiben lokal im Browser. Sicherung als JSON-Datei empfohlen.</p>' +
        '<div class="btn-row">' +
          '<button class="btn" data-action="backup-export">Backup exportieren (JSON)</button>' +
          '<button class="btn" data-action="backup-import">Backup importieren</button>' +
          '<button class="btn" data-action="reset-demo">Demo-Daten neu laden</button>' +
          '<button class="btn danger" data-action="delete-all">Alle Daten löschen</button>' +
        "</div>" +
      "</div>" +
      '<div class="card"><h2>Über</h2><p class="muted">Noten-Fritze · lokale PWA · keine Cloud, keine Konten. ' +
        "Daten-Version " + Store.SCHEMA_VERSION + " · DB-Schema " + DB.DB_VERSION + ".</p></div>";

    return { topbar, body, mount: () => {
      const sel = UI.$("#f-rundung");
      if (sel) sel.addEventListener("change", async () => { s.rundung = sel.value; await Store.saveSettings(s); UI.toast("Gespeichert"); });
      const selHj = UI.$("#f-aktuellesHalbjahr");
      if (selHj) selHj.addEventListener("change", async () => {
        s.aktuellesHalbjahr = parseInt(selHj.value, 10) || 1;
        await Store.saveSettings(s);
        state.notenHalbjahr = ""; state.auswertungHalbjahr = ""; // Filter-Defaults neu ziehen
        UI.toast("Halbjahr gespeichert");
      });
      UI.$all("[data-heat-punkt]").forEach((inp) => inp.addEventListener("change", async () => {
        const key = inp.getAttribute("data-heat-punkt");
        if (key === "einfach") s.heatPunkteEinfach = Math.max(0, parseInt(inp.value, 10) || 0);
        else if (key === "gut") s.heatPunkteGut = Math.max(0, parseInt(inp.value, 10) || 0);
        else if (key === "sehrgut") s.heatPunkteSehrGut = Math.max(0, parseInt(inp.value, 10) || 0);
        await Store.saveSettings(s); UI.toast("Heatmap-Punkte gespeichert");
      }));
      const heatStart = UI.$("#f-heatStartWert");
      if (heatStart) heatStart.addEventListener("change", async () => {
        s.heatStartWert = Math.max(0, Math.min(100, parseInt(heatStart.value, 10) || 0));
        await Store.saveSettings(s);
        UI.toast("Startwert gespeichert");
      });
      const heatVerfallPunkte = UI.$("#f-heatVerfallPunkte");
      if (heatVerfallPunkte) heatVerfallPunkte.addEventListener("change", async () => { s.heatVerfallPunkte = Math.max(0, parseInt(heatVerfallPunkte.value, 10) || 0); await Store.saveSettings(s); });
      const heatVerfallMinuten = UI.$("#f-heatVerfallMinuten");
      if (heatVerfallMinuten) heatVerfallMinuten.addEventListener("change", async () => { s.heatVerfallMinuten = Math.max(1, parseInt(heatVerfallMinuten.value, 10) || 5); await Store.saveSettings(s); });
      UI.$all("[data-punkt]").forEach((inp) => inp.addEventListener("change", async () => {
        s.mitarbeitPunkte[inp.getAttribute("data-punkt")] = parseInt(inp.value, 10) || 0;
        await Store.saveSettings(s); UI.toast("Punkte gespeichert");
      }));
      UI.$all("[data-sp-feld]").forEach((inp) => inp.addEventListener("change", async () => {
        const idx = parseInt(inp.getAttribute("data-sp-idx"), 10);
        const stunde = Array.isArray(s.stundenplan) && s.stundenplan[idx];
        if (!stunde) return;
        stunde[inp.getAttribute("data-sp-feld")] = inp.value;
        await Store.saveSettings(s); UI.toast("Stundenplan gespeichert");
      }));
    }};
  }

  Object.assign(global.Views, { ViewEinstellungen });
})(window);
