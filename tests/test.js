/* =========================================================================
   test.js – Minimaler Test-Rahmen für tests.html (ohne Abhängigkeiten)
   Test.gruppe("Name", () => { Test.fall("…", () => { Test.gleich(ist, soll); }); })
   Test.ausfuehren() zeigt das Ergebnis auf der Seite und legt es zusätzlich
   unter window.TEST_ERGEBNIS ab ({ gesamt, fehler, liste }).
   ========================================================================= */
(function (global) {
  "use strict";

  const gruppen = [];
  let aktuelleGruppe = null;

  function gruppe(name, fn) {
    aktuelleGruppe = { name, faelle: [] };
    gruppen.push(aktuelleGruppe);
    fn();
    aktuelleGruppe = null;
  }

  function fall(name, fn) {
    if (!aktuelleGruppe) gruppe("Allgemein", () => {});
    (aktuelleGruppe || gruppen[gruppen.length - 1]).faelle.push({ name, fn });
  }

  function text(v) {
    return typeof v === "string" ? '"' + v + '"' : JSON.stringify(v);
  }

  // Strikter Vergleich; Objekte/Arrays werden über JSON verglichen.
  function gleich(ist, soll, hinweis) {
    const a = typeof ist === "object" ? JSON.stringify(ist) : ist;
    const b = typeof soll === "object" ? JSON.stringify(soll) : soll;
    if (a !== b) {
      throw new Error((hinweis ? hinweis + ": " : "") + "erwartet " + text(soll) + ", erhalten " + text(ist));
    }
  }

  // Vergleich von Kommazahlen mit Toleranz (Standard 0,001).
  function nahe(ist, soll, hinweis, toleranz) {
    const eps = toleranz === undefined ? 0.001 : toleranz;
    if (typeof ist !== "number" || Math.abs(ist - soll) > eps) {
      throw new Error((hinweis ? hinweis + ": " : "") + "erwartet ≈ " + soll + ", erhalten " + text(ist));
    }
  }

  function wahr(bedingung, hinweis) {
    if (!bedingung) throw new Error(hinweis || "Bedingung nicht erfüllt");
  }

  function ausfuehren() {
    const liste = [];
    let fehler = 0;
    const html = gruppen.map((g) => {
      const zeilen = g.faelle.map((f) => {
        try {
          f.fn();
          liste.push({ gruppe: g.name, fall: f.name, ok: true });
          return '<div class="t">✓ ' + esc(f.name) + "</div>";
        } catch (e) {
          fehler += 1;
          liste.push({ gruppe: g.name, fall: f.name, ok: false, meldung: e.message });
          return '<div class="t fehler">✗ ' + esc(f.name) + "<pre>" + esc(e.message) + "</pre></div>";
        }
      }).join("");
      return '<div class="gruppe"><h2>' + esc(g.name) + "</h2>" + zeilen + "</div>";
    }).join("");
    const gesamt = liste.length;
    const summe = fehler
      ? '<div class="summe fehler">' + fehler + " von " + gesamt + " Prüfungen fehlgeschlagen</div>"
      : '<div class="summe ok">Alle ' + gesamt + " Prüfungen bestanden</div>";
    document.getElementById("ergebnis").innerHTML = summe + html;
    global.TEST_ERGEBNIS = { gesamt, fehler, liste };
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  global.Test = { gruppe, fall, gleich, nahe, wahr, ausfuehren };
})(window);
