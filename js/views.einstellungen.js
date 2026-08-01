/* =========================================================================
   views.einstellungen.js – Einstellungen inkl. Stundenplan-Verwaltung
   ========================================================================= */
(function (global) {
  "use strict";

  const { state } = global.Views;

  // ---- Stundenplan (Einstellungen) ------------------------------------------
  const WOCHENTAGE = [["1", "Montag"], ["2", "Dienstag"], ["3", "Mittwoch"], ["4", "Donnerstag"], ["5", "Freitag"]];

  function stundenplanHTML(s) {
    const plan = s.stundenplan || {};
    return WOCHENTAGE.map(([tag, label]) => {
      const stunden = plan[tag] || [];
      const rows = stunden.map((h, i) =>
        '<div class="form-row" style="align-items:center">' +
          '<span class="muted" style="width:26px">' + (i + 1) + ".</span>" +
          '<input type="time" data-sp-tag="' + tag + '" data-sp-idx="' + i + '" data-sp-feld="start" value="' + UI.esc(h.start || "") + '">' +
          '<span class="muted">–</span>' +
          '<input type="time" data-sp-tag="' + tag + '" data-sp-idx="' + i + '" data-sp-feld="ende" value="' + UI.esc(h.ende || "") + '">' +
          '<button class="iconbtn plain danger-text" data-action="sp-del" data-tag="' + tag + '" data-idx="' + i + '" title="Stunde entfernen">🗑</button>' +
        "</div>"
      ).join("");
      return '<h3 style="margin:14px 0 4px">' + label + "</h3>" + rows +
        '<button class="btn small" data-action="sp-add" data-tag="' + tag + '" style="margin-top:6px">＋ Stunde</button>';
    }).join("");
  }

  // Speichert den Stundenplan aus den Einstellungen (Zeilen neu nummerieren).
  async function saveStundenplan() {
    const s = state.settings;
    WOCHENTAGE.forEach(([tag]) => {
      (s.stundenplan[tag] || []).forEach((h, i) => { h.nr = i + 1; });
    });
    await Store.saveSettings(s);
  }

  function hhmmZuMin(v) {
    const p = String(v || "").split(":");
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function minZuHHMM(min) {
    return ("0" + (Math.floor(min / 60) % 24)).slice(-2) + ":" + ("0" + (min % 60)).slice(-2);
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
        '<p class="muted">Der Tracker erkennt damit die laufende Stunde und ihre Restzeit.</p>' +
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
        const tag = inp.getAttribute("data-sp-tag");
        const idx = parseInt(inp.getAttribute("data-sp-idx"), 10);
        const stunde = s.stundenplan && s.stundenplan[tag] && s.stundenplan[tag][idx];
        if (!stunde) return;
        stunde[inp.getAttribute("data-sp-feld")] = inp.value;
        await Store.saveSettings(s); UI.toast("Stundenplan gespeichert");
      }));
    }};
  }

  Object.assign(global.Views, { ViewEinstellungen, saveStundenplan, hhmmZuMin, minZuHHMM });
})(window);
