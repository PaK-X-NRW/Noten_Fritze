/* =========================================================================
   calc.js – Rechenlogik, Kern: die Notenskala
   - Noteneingabe und -anzeige (deutsche Tendenzen 2+, 2, 2-; MSS-Punkte)
   - Drittelnoten (x,0 | x,3 | x,7) für alle Zwischennoten
   - Zeugnisskala (ganze Noten, einzige Tendenz 4-) und Jahresnote
   - Umrechnung Schulnote -> MSS-Punkte, Notenfarbe
   - Kategorie-Helfer (zählt in die Note? Mitarbeits-Kategorie?)

   Calc ist auf mehrere Dateien verteilt, die sich denselben Namespace teilen
   (Ladereihenfolge siehe index.html):
     calc.js           – diese Datei: legt window.Calc an
     calc.zeugnis.js   – Halbjahres-Kette: Einzelnoten -> Epochalnote -> Zeugnisnote
     calc.mitarbeit.js – Mitarbeits-Auswertung (Stundennoten-Modell), Schwellen
     calc.tracker.js   – Heatmap-Verfall und Stundenplan (Tracker)
   Alle Funktionen sind rein: kein DOM, keine Datenbank. Geprüft werden sie
   im Selbsttest tests.html.
   ========================================================================= */
(function (global) {
  "use strict";

  // ---- Notenskala der Klasse ------------------------------------------------
  // Klassen ab Klassenstufe 11 (MSS) werden in Punkten (0-15, höher = besser)
  // statt in Schulnoten (1-6, niedriger = besser) bewertet.
  function istMSS(klasse) {
    return !!(klasse && klasse.klassenstufe != null && klasse.klassenstufe >= 11);
  }

  // ---- Noten parsen/formatieren --------------------------------------------
  // Erlaubt (mss=false): "2", "2,3", "2.3", "2+", "2-", "1+". Ergebnis: Zahl 1..6 oder null.
  // Erlaubt (mss=true): ganze Zahl 0..15 (keine Tendenzen, keine Nachkommastellen).
  function parseNote(input, mss) {
    if (input === null || input === undefined) return null;
    let s = String(input).trim().replace(",", ".");
    if (s === "") return null;
    if (mss) {
      if (!/^\d+$/.test(s)) return null;
      return clampNote(parseInt(s, 10), true);
    }
    let m = s.match(/^([1-6])\s*([+-])?$/);
    if (m) {
      let val = parseInt(m[1], 10);
      if (m[2] === "+") val -= 0.3;
      else if (m[2] === "-") val += 0.3;
      return clampNote(Math.round(val * 100) / 100);
    }
    let f = parseFloat(s);
    if (isNaN(f)) return null;
    return clampNote(Math.round(f * 100) / 100);
  }
  function clampNote(n, mss) {
    return mss ? Math.max(0, Math.min(15, n)) : Math.max(1, Math.min(6, n));
  }

  // Anzeige als deutsche Zahl mit Komma (Standard: eine Nachkommastelle).
  function formatNote(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    decimals = decimals === undefined ? 1 : decimals;
    return n.toFixed(decimals).replace(".", ",");
  }

  // ---- Zeugnisskala --------------------------------------------------------
  // Auf dem Zeugnis sind nur ganze Noten und als einzige Tendenz die 4- (=4,3)
  // zulässig. Grenzen: bis 1,5 -> 1 · bis 2,5 -> 2 · bis 3,5 -> 3 ·
  // unter 4,15 -> 4 · bis 4,5 -> 4- · bis 5,5 -> 5 · darüber 6.
  // Genau auf einer Grenze gewinnt die bessere Note (4,5 ist also noch 4-).
  const EPS = 1e-9;
  const ZEUGNIS_GRENZEN = [1.5, 2.5, 3.5, 4.15, 4.5, 5.5];

  // mss=true: MSS-Punkte (0-15) werden schlicht auf ganze Punkte gerundet,
  // ohne Grenzen/Tendenz – die Skala hat keine "4-"-Entsprechung.
  function zeugnisnote(wert, mss) {
    if (wert === null || wert === undefined || isNaN(wert)) return null;
    const w = clampNote(Number(wert), mss);
    if (mss) return Math.round(w);
    if (w <= 1.5 + EPS) return 1;
    if (w <= 2.5 + EPS) return 2;
    if (w <= 3.5 + EPS) return 3;
    if (w < 4.15 - EPS) return 4;
    if (w <= 4.5 + EPS) return 4.3;
    if (w <= 5.5 + EPS) return 5;
    return 6;
  }

  function formatZeugnisnote(n, mss) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    if (mss) return String(Math.round(n));
    if (Math.abs(n - 4.3) < 0.01) return "4-";
    return String(Math.round(n));
  }

  // Liegt ein Wert exakt auf einer Grenze, ist die Rundung nicht eindeutig.
  function istGrenzwert(wert) {
    return ZEUGNIS_GRENZEN.some((g) => Math.abs(wert - g) < EPS);
  }

  // Jahresnote aus den beiden Halbjahres-Zeugnisnoten: beide zählen 50 %, bei
  // Gleichstand gibt das 2. Halbjahr den Ausschlag (49 % / 51 %).
  // Fehlt eine der beiden Noten, gibt es keine Jahresnote.
  function jahresnote(hj1, hj2, mss) {
    if (hj1 === null || hj1 === undefined || hj2 === null || hj2 === undefined) return null;
    return zeugnisnote(hj1 * 0.49 + hj2 * 0.51, mss);
  }

  // ---- Drittelnoten (x,0 | x,3 | x,7) --------------------------------------
  // Alle Zwischennoten der Notenübersicht (schriftliche Leistungen, Epochalnote
  // je Quartal, sonstige Leistungen des Halbjahres) laufen auf der Drittelskala:
  // 1 · 1- · 2+ · 2 · 2- · 3+ … Liegt ein Wert genau zwischen zwei Stufen,
  // gewinnt die SCHLECHTERE Note (2,15 -> 2,3 = "2-", 3,5 -> 3,7 = "4+").
  // Gerechnet wird in Tausendsteln, damit "genau in der Mitte" nicht an
  // Fließkomma-Ungenauigkeit scheitert (2,15 - 2,0 ist binär nicht exakt 0,15).
  const TENDENZ_STUFEN = (function () {
    const liste = [];
    for (let ganz = 1; ganz <= 6; ganz++) {
      liste.push(ganz * 1000);
      if (ganz < 6) { liste.push(ganz * 1000 + 300); liste.push(ganz * 1000 + 700); }
    }
    return liste;
  })();

  // mss=true: MSS-Punkte kennen keine Tendenzen -> ganze Punkte. Bei genau x,5
  // wird zur größeren Punktzahl gerundet – dieselbe Regel wie in zeugnisnote,
  // damit Zwischen- und Endnoten in der Oberstufe nicht auseinanderlaufen.
  function tendenznote(wert, mss) {
    if (wert === null || wert === undefined || isNaN(wert)) return null;
    const w = clampNote(Number(wert), mss);
    if (mss) return Math.round(w);
    const w1000 = Math.round(w * 1000);
    let beste = TENDENZ_STUFEN[0], abstand = Infinity;
    for (const stufe of TENDENZ_STUFEN) {
      const d = Math.abs(w1000 - stufe);
      if (d <= abstand) { abstand = d; beste = stufe; }   // Gleichstand: die spätere = schlechtere Stufe
    }
    return beste / 1000;
  }

  // Anzeige einer Drittelnote als deutsche Tendenz: 1,7 -> "2+", 2 -> "2",
  // 2,3 -> "2-". Krumme Werte fallen auf die Dezimaldarstellung zurück.
  function formatTendenz(n, mss) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    if (mss) return String(Math.round(n));
    const zehntel = Math.round(n * 10);
    const ganz = Math.floor(zehntel / 10);
    const rest = zehntel - ganz * 10;
    if (rest === 0) return String(ganz);
    if (rest === 3) return ganz + "-";
    if (rest === 7) return (ganz + 1) + "+";
    return formatNote(n, 1);
  }

  // ---- Umrechnung Schulnote -> MSS-Punkte ----------------------------------
  // Offizielle Tabelle der gymnasialen Oberstufe (jede Tendenzstufe = 1 Punkt):
  //   1+ 15 · 1 14 · 1- 13 · 2+ 12 · 2 11 · 2- 10 · 3+ 9 · 3 8 · 3- 7 ·
  //   4+ 6 · 4 5 · 4- 4 · 5+ 3 · 5 2 · 5- 1 · 6 0
  // Als Formel: Punkte = 17 - Note × 3, auf ganze Punkte gerundet (0..15).
  // Zwischenwerte (z. B. ein roher Ø 2,5 -> 10) runden bei genau x,5 zur
  // größeren Punktzahl – dieselbe Regel wie in tendenznote/zeugnisnote.
  // Hinweis: Die Notenskala der App beginnt bei 1,0 (= 14 Punkte); die 15 gibt
  // es nur als 1+ und damit nur von Hand.
  function noteZuMssPunkte(note) {
    if (note === null || note === undefined || isNaN(note)) return null;
    return clampNote(Math.round(17 - Number(note) * 3), true);
  }

  // Farbe für eine Note. Für Badges. mss=false: 1 gut = grün, 6 = rot.
  // mss=true (MSS-Punkte): 15 gut = grün, 0 = rot (umgekehrte Richtung).
  function noteFarbe(n, mss) {
    if (n === null || n === undefined || isNaN(n)) return "#9aa5a1";
    const t = mss ? Math.max(0, Math.min(1, n / 15)) : Math.max(0, Math.min(1, (n - 1) / 5)); // 0..1
    const hue = mss ? t * 125 : 125 - t * 125; // 125° grün -> 0° rot
    return "hsl(" + hue.toFixed(0) + ", 62%, 42%)";
  }

  // ---- Kategorien ------------------------------------------------------------
  // Zählt die Kategorie als Note? (anzeige "fehlendeHA" = nur Zählung)
  function istNotenKategorie(kat) {
    return !!kat && (kat.anzeige || "note") === "note";
  }
  // Mitarbeits-Kategorie: sonstige Leistung, deren Noten aus „Quartal
  // abschließen" kommen. An ihr hängt, wann die Epochalnote entsteht.
  function istMitarbeitsKategorie(kat) {
    return istNotenKategorie(kat) && kat.quelle === "mitarbeit" && kat.art !== "schriftlich";
  }

  global.Calc = {
    istMSS,
    parseNote, clampNote, formatNote,
    zeugnisnote, formatZeugnisnote, istGrenzwert, jahresnote,
    tendenznote, formatTendenz, noteZuMssPunkte, noteFarbe,
    istNotenKategorie, istMitarbeitsKategorie
  };
})(window);
