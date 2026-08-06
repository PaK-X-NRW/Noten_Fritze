/* =========================================================================
   views.besprechung.js – Besprechungsmodus (ein Schüler nach dem anderen)
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, halbjahrFilter, halbjahrTabsHTML } = global.Views;

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
    const mss = Calc.istMSS(k);
    const hj = halbjahrFilter();
    const hjErg = Calc.halbjahrErgebnis(kats, notenS, k, hj, mss);

    const body =
      '<div class="discussion">' +
        '<div class="disc-nav">' +
          '<button class="iconbtn" data-action="besprechung-prev"' + (idx <= 0 ? " disabled" : "") + ">‹</button>" +
          '<div class="who">' + UI.esc(UI.vollerName(s)) + "</div>" +
          '<button class="iconbtn" data-action="besprechung-next"' + (idx >= schueler.length - 1 ? " disabled" : "") + ">›</button>" +
        "</div>" +
        '<div class="hstack" style="justify-content:center;margin-bottom:10px"><div class="tabs" style="margin:0">' +
          halbjahrTabsHTML("noten-hj", k) + "</div></div>" +
        '<div class="card">' +
          '<div class="big-grade" style="color:' + Calc.noteFarbe(hjErg.zeugnis, mss) + '">' +
            Calc.formatZeugnisnote(hjErg.zeugnis, mss) + "</div>" +
          '<div class="center muted">Zeugnisnote ' +
            (mss && k.klassenstufe ? k.klassenstufe + "." + hj : hj + ". Halbjahr") + "</div>" +
          breakdownHTML(hjErg, mss) +
        "</div>" +
        '<div class="btn-row" style="margin-top:var(--gap);justify-content:center">' +
          '<button class="btn" data-action="besprechung-list">‹ Zur Auswahl</button>' +
        "</div>" +
      "</div>";
    return { topbar, body };
  }

  // Herleitung eines Halbjahres, Schritt für Schritt wie in der Notenübersicht:
  // Epochalnote je Quartal -> sonstige Leistungen -> Zeugnisnote. Alle
  // Zwischennoten stehen roh (Ø) und gerundet (Drittel) nebeneinander.
  function breakdownHTML(hjErg, mss) {
    function zeilen(kategorien) {
      return kategorien.map((c) =>
        '<div class="line"><span>' + UI.esc(c.name) + ' <span class="muted">(Gew ' + c.gewichtung + ", " +
          c.anzahl + (c.anzahl === 1 ? " Note" : " Noten") + ")</span></span>" +
        '<span class="r">' + Calc.formatNote(c.schnitt) + "</span></div>"
      ).join("");
    }
    function gerundet(wert) {
      return '<div class="line"><span class="muted">gerundet</span><span class="r">' +
        Calc.formatTendenz(wert, mss) + "</span></div>";
    }

    let html = "";
    if (hjErg.res.schriftlich.kategorien.length) {
      html += '<div class="grp"><h3>Schriftliche Leistungen – Ø ' + Calc.formatNote(hjErg.schriftlichRoh) +
        " · Anteil " + Math.round(hjErg.effAnteilS * 100) + " %</h3>" +
        zeilen(hjErg.res.schriftlich.kategorien) + gerundet(hjErg.schriftlich) + "</div>";
    }
    hjErg.epochal.forEach((e, i) => {
      if (e.roh === null && !e.offen) return;
      html += '<div class="grp"><h3>Epochalnote ' + (i + 1) + " (" + e.quartal + ". Quartal)" +
        (e.roh !== null ? " – Ø " + Calc.formatNote(e.roh) : "") + "</h3>" +
        zeilen(e.res.sonstige.kategorien) +
        (e.offen
          ? '<div class="line"><span class="muted">Quartal noch nicht abgeschlossen</span>' +
            '<span class="r muted">–</span></div>'
          : gerundet(e.note)) +
        "</div>";
    });
    if (hjErg.sonstigeRoh !== null) {
      const teile = hjErg.epochal.filter((e) => e.note !== null).map((e, i) =>
        '<div class="line"><span>Epochalnote ' + (i + 1) + "</span>" +
        '<span class="r">' + Calc.formatTendenz(e.note, mss) + "</span></div>").join("");
      html += '<div class="grp"><h3>Sonstige Leistungen – Ø ' + Calc.formatNote(hjErg.sonstigeRoh) +
        " · Anteil " + Math.round(hjErg.effAnteilO * 100) + " %</h3>" +
        teile + gerundet(hjErg.sonstige) + "</div>";
    }
    return '<div class="breakdown">' + html +
      '<div class="total"><span>Zeugnisnote ' + hjErg.hj + ". Halbjahr</span><span>" +
        Calc.formatZeugnisnote(hjErg.zeugnis, mss) + "</span></div>" +
      "</div>";
  }

  Object.assign(global.Views, { ViewBesprechung, breakdownHTML });
})(window);
