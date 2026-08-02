/* =========================================================================
   views.besprechung.js – Besprechungsmodus (ein Schüler nach dem anderen)
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, hjFilter, hjTabsHTML } = global.Views;

  // =========================================================================
  //  BESPRECHUNGSMODUS – ein Schüler nach dem anderen
  // =========================================================================
  async function ViewBesprechung() {
    const k = await Store.Klassen.get(state.klasseId);
    const [schueler, kats, notenAll] = await Promise.all([
      Store.Schueler.byKlasse(k.id), Store.Kategorien.byKlasse(k.id), Store.Noten.byKlasse(k.id)
    ]);

    const topbar =
      '<button class="iconbtn plain" data-action="back-to-class" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Besprechung · ' + UI.esc(k.name) + "</h1>" +
      '<span class="sub">Nur die/der gewählte Schüler/in ist sichtbar</span></div>';

    if (!state.selectedSchuelerId) {
      const picker = schueler.map((s) =>
        '<button class="btn" data-action="besprechung-pick" data-sid="' + s.id + '">' + UI.esc(UI.vollerName(s)) + "</button>"
      ).join("");
      const body = '<div class="discussion"><p class="muted">Schüler/in auswählen:</p>' +
        '<div class="disc-picker">' + (picker || '<span class="muted">Keine Schüler/innen.</span>') + "</div></div>";
      return { topbar, body };
    }

    const idx = schueler.findIndex((s) => s.id === state.selectedSchuelerId);
    const s = schueler[idx];
    if (!s) { state.selectedSchuelerId = null; return ViewBesprechung(); }
    const notenS = notenAll.filter((n) => n.schuelerId === s.id);
    const res = Calc.berechneSchueler(kats, notenS, k, state.settings.rundung, hjFilter("notenHalbjahr"));

    const body =
      '<div class="discussion">' +
        '<div class="disc-nav">' +
          '<button class="iconbtn" data-action="besprechung-prev"' + (idx <= 0 ? " disabled" : "") + ">‹</button>" +
          '<div class="who">' + UI.esc(UI.vollerName(s)) + "</div>" +
          '<button class="iconbtn" data-action="besprechung-next"' + (idx >= schueler.length - 1 ? " disabled" : "") + ">›</button>" +
        "</div>" +
        '<div class="hstack" style="justify-content:center;margin-bottom:10px"><div class="tabs" style="margin:0">' +
          hjTabsHTML("notenHalbjahr", "noten-hj") + "</div></div>" +
        '<div class="card">' +
          '<div class="big-grade" style="color:' + Calc.noteFarbe(res.gesamt) + '">' +
            (res.gesamt !== null ? Calc.formatNote(res.gesamt, state.settings.rundung === "ganze" ? 0 : 1) : "–") + "</div>" +
          '<div class="center muted">Gesamtnote</div>' +
          breakdownHTML(res) +
        "</div>" +
        '<div class="btn-row" style="margin-top:var(--gap);justify-content:center">' +
          '<button class="btn" data-action="besprechung-list">‹ Zur Auswahl</button>' +
        "</div>" +
      "</div>";
    return { topbar, body };
  }

  function breakdownHTML(res) {
    function grpHTML(g, titel, anteil, zeugnisNote) {
      if (!g.kategorien.length) return "";
      const lines = g.kategorien.map((c) =>
        '<div class="line"><span>' + UI.esc(c.name) + ' <span class="muted">(Gew ' + c.gewichtung + ", " + c.anzahl + " Noten)</span></span>" +
        '<span class="r">' + Calc.formatNote(c.schnitt) + "</span></div>"
      ).join("");
      return '<div class="grp"><h3>' + titel + " – Ø " + Calc.formatNote(g.schnitt) +
        (anteil ? " · Anteil " + Math.round(anteil * 100) + " %" : "") + "</h3>" + lines +
        '<div class="line"><span class="muted">gerundet</span><span class="r">' + Calc.formatZeugnisnote(zeugnisNote) + "</span></div>" +
        "</div>";
    }
    const z = Calc.zeugnisErgebnis(res);
    return '<div class="breakdown">' +
      grpHTML(res.schriftlich, "Schriftlich", res.effAnteilS, z.schriftlich) +
      grpHTML(res.sonstige, "Sonstige", res.effAnteilO, z.sonstige) +
      '<div class="total"><span>Gesamtnote</span><span>' + (res.gesamt !== null ? Calc.formatNote(res.gesamt) : "–") + "</span></div>" +
      '<div class="total"><span>Zeugnisnote</span><span>' + Calc.formatZeugnisnote(z.zeugnis) + "</span></div>" +
      "</div>";
  }

  Object.assign(global.Views, { ViewBesprechung, breakdownHTML });
})(window);
