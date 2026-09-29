/* =========================================================================
   calc.zeugnis.js – Halbjahres-Kette: von der Einzelnote zur Zeugnisnote
   - berechneSchueler: gewichtete Rechnung (Kategorie -> Art-Gruppe -> Gesamt)
     für einen Zeitraum (Quartal 1–4 | "hj1" | "hj2" | null = Jahr); die Gruppe
     „sonstige" wird bei Halbjahr/Jahr quartalsweise gemittelt
   - halbjahrErgebnis: die komplette Kette eines Halbjahres, wie sie in der
     Notenübersicht Spalte für Spalte steht (Epochalnote je Quartal ->
     sonstige Leistungen -> schriftliche Leistungen -> Zeugnisnote)
   Erweitert den Namespace Calc (calc.js lädt davor).
   ========================================================================= */
(function (global) {
  "use strict";

  const { tendenznote, zeugnisnote, istGrenzwert, istNotenKategorie, istMitarbeitsKategorie } = global.Calc;

  // Effektive Anteile schriftlich/sonstige einer Klasse. Fehlt eine der beiden
  // Seiten, zählt die andere 100 %.
  function anteile(klasse, hasS, hasO) {
    const aS = (klasse.anteilSchriftlich != null ? klasse.anteilSchriftlich : 50);
    const aO = (klasse.anteilSonstige != null ? klasse.anteilSonstige : 50);
    if (hasS && hasO) {
      const summe = aS + aO || 1;
      return { s: aS / summe, o: aO / summe };
    }
    return { s: hasS ? 1 : 0, o: hasO ? 1 : 0 };
  }

  // ---- Gewichtete Rechnung -------------------------------------------------
  // Quartale eines Zeitraum-Filters:
  //   1|2|3|4 -> genau dieses Quartal · "hj1" -> Quartale 1+2 ·
  //   "hj2" -> Quartale 3+4 · null/undefined/"jahr" -> ganzes Jahr (1–4)
  function quartaleVonFilter(filter) {
    if (filter === 1 || filter === 2 || filter === 3 || filter === 4) return [filter];
    if (filter === "hj1") return [1, 2];
    if (filter === "hj2") return [3, 4];
    return [1, 2, 3, 4];
  }

  // Liefert eine nachvollziehbare Struktur mit Zwischenergebnissen.
  //   kategorien: Array {id, name, art, gewichtung, anzeige}
  //   notenFuerSchueler: Array {kategorieId, wert, quartal}
  //   klasse: {anteilSchriftlich, anteilSonstige}
  //   filter: 1|2|3|4 (nur dieses Quartal) | "hj1" | "hj2" | null (ganzes Jahr).
  //   Noten ohne quartal-Feld (alte Datensätze) fließen immer ein.
  //   Schriftlich wird über den ganzen gefilterten Zeitraum gerechnet; die
  //   Gruppe „sonstige" bei Halbjahr/Jahr quartalsweise: je Quartal der
  //   gewichtete Kategorien-Ø, der Gruppen-Schnitt ist der Mittelwert der
  //   vorhandenen Quartals-Ø (zwei Quartale -> je 50 %, nur eines -> 100 %).
  //   Kategorien mit anzeige != "note" (z. B. Zählung fehlender Hausaufgaben)
  //   bleiben in den Zwischenergebnissen sichtbar, zählen aber nicht in die Note.
  function berechneSchueler(kategorien, notenFuerSchueler, klasse, filter) {
    const filterQuartale = quartaleVonFilter(filter);
    const einzelquartal = (filter === 1 || filter === 2 || filter === 3 || filter === 4);
    const notenByKat = {};
    notenFuerSchueler.forEach((n) => {
      if (n.wert === null || n.wert === undefined || isNaN(n.wert)) return;
      if (n.quartal && filterQuartale.indexOf(n.quartal) === -1) return;
      (notenByKat[n.kategorieId] = notenByKat[n.kategorieId] || []).push(n.wert);
    });

    // 1) Durchschnitt je Kategorie (über den ganzen gefilterten Zeitraum)
    const katErgebnisse = kategorien.map((kat) => {
      const werte = notenByKat[kat.id] || [];
      const schnitt = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
      return {
        id: kat.id, name: kat.name, art: kat.art, gewichtung: kat.gewichtung,
        zaehltInNote: istNotenKategorie(kat),
        anzahl: werte.length, werte, schnitt
      };
    });

    // 2) Je Art-Gruppe: gewichteter Schnitt (Kategorien ohne Noten ignorieren).
    //    Optional aus einer anderen Werte-Map (für die Quartalsrechnung).
    function gruppe(art, byKat) {
      const map = byKat || notenByKat;
      const kats = katErgebnisse
        .filter((k) => k.art === art && k.zaehltInNote && k.gewichtung > 0)
        .map((k) => {
          const werte = map[k.id] || [];
          const schnitt = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
          return Object.assign({}, k, { anzahl: werte.length, werte, schnitt });
        })
        .filter((k) => k.schnitt !== null);
      const gewSumme = kats.reduce((a, k) => a + k.gewichtung, 0);
      const schnitt = gewSumme ? kats.reduce((a, k) => a + k.schnitt * k.gewichtung, 0) / gewSumme : null;
      return { art, kategorien: kats, gewSumme, schnitt };
    }
    const schriftlich = gruppe("schriftlich");
    let sonstige;
    if (einzelquartal) {
      // Einzelnes Quartal: direkte Berechnung über die Noten des Quartals
      sonstige = gruppe("sonstige");
    } else {
      // Halbjahr/Jahr: sonstige quartalsweise (s. Kopfkommentar)
      const quartalErgebnisse = [];
      filterQuartale.forEach((q) => {
        const byKatQ = {};
        notenFuerSchueler.forEach((n) => {
          if (n.wert === null || n.wert === undefined || isNaN(n.wert)) return;
          if (n.quartal && n.quartal !== q) return;
          (byKatQ[n.kategorieId] = byKatQ[n.kategorieId] || []).push(n.wert);
        });
        const g = gruppe("sonstige", byKatQ);
        if (g.schnitt !== null) quartalErgebnisse.push({ quartal: q, schnitt: g.schnitt });
      });
      const gAlle = gruppe("sonstige");
      sonstige = {
        art: "sonstige",
        kategorien: gAlle.kategorien,
        gewSumme: gAlle.gewSumme,
        schnitt: quartalErgebnisse.length
          ? quartalErgebnisse.reduce((a, x) => a + x.schnitt, 0) / quartalErgebnisse.length
          : null,
        quartale: quartalErgebnisse
      };
    }

    // 3) Gesamt aus beiden Gruppen. Robust: fehlt eine Gruppe, zählt die andere 100 %.
    const ant = anteile(klasse, schriftlich.schnitt !== null, sonstige.schnitt !== null);
    const gesamt = (schriftlich.schnitt !== null || sonstige.schnitt !== null)
      ? (schriftlich.schnitt || 0) * ant.s + (sonstige.schnitt || 0) * ant.o
      : null;

    return {
      kategorien: katErgebnisse,
      schriftlich, sonstige,
      effAnteilS: ant.s, effAnteilO: ant.o,
      gesamtRoh: gesamt
    };
  }

  // ---- Halbjahres-Kette ----------------------------------------------------
  // Ein Quartal gilt für die Epochalnote als abgeschlossen, sobald die
  // Mitarbeitsnote vorliegt – also eine Note in einer Kategorie mit
  // quelle "mitarbeit" (die schreibt „Quartal abschließen" im Mitarbeit-Tab).
  // Klassen ohne eine solche Kategorie arbeiten ohne Mitarbeitsnote; dort ist
  // die Epochalnote sofort fertig, sonst käme sie nie zustande.
  function mitarbeitVorhanden(kategorien, notenFuerSchueler, quartal) {
    const ids = kategorien.filter(istMitarbeitsKategorie).map((c) => c.id);
    if (!ids.length) return true;
    return notenFuerSchueler.some((n) =>
      ids.indexOf(n.kategorieId) !== -1 &&
      (n.quartal || quartal) === quartal &&
      n.wert !== null && n.wert !== undefined && !isNaN(n.wert));
  }

  // Die komplette Rechnung eines Halbjahres, so wie sie in der Notenübersicht
  // Spalte für Spalte sichtbar ist (hj = 1 | 2):
  //   1. Epochalnote je Quartal = gewichteter Ø der sonstigen Kategorien des
  //      Quartals, gerundet auf Drittel (x,0 | x,3 | x,7)
  //   2. Sonstige Leistungen HJ = Ø der vorhandenen (gerundeten!) Epochalnoten,
  //      wieder auf Drittel gerundet
  //   3. Schriftliche Leistungen HJ = gewichteter Ø aller schriftlichen
  //      Kategorien über das ganze Halbjahr, auf Drittel gerundet
  //   4. Zeugnisnote HJ = Anteile der Klasse aus 2. und 3., auf die
  //      Zeugnisskala (ganze Note, einzige Tendenz 4-)
  // Gerechnet wird bewusst mit den gerundeten Zwischennoten; nur wenn die
  // Zeugnisnote genau auf einer Grenze landet, entscheiden die ungerundeten
  // Werte.
  function halbjahrErgebnis(kategorien, notenFuerSchueler, klasse, hj, mss) {
    const quartale = hj === 2 ? [3, 4] : [1, 2];
    const epochal = quartale.map((q) => {
      const res = berechneSchueler(kategorien, notenFuerSchueler, klasse, q);
      // Ohne Mitarbeitsnote ist das Quartal noch nicht abgeschlossen: die
      // Epochalnote bleibt leer, statt einen Zwischenstand wie ein Ergebnis
      // aussehen zu lassen. `roh` bleibt für die Herleitung erhalten.
      const offen = !mitarbeitVorhanden(kategorien, notenFuerSchueler, q);
      return {
        quartal: q, offen, roh: res.sonstige.schnitt,
        note: offen ? null : tendenznote(res.sonstige.schnitt, mss),
        res
      };
    });
    const vorhanden = epochal.filter((e) => e.note !== null);
    const sonstigeRoh = vorhanden.length
      ? vorhanden.reduce((a, e) => a + e.note, 0) / vorhanden.length
      : null;
    const sonstige = tendenznote(sonstigeRoh, mss);

    const res = berechneSchueler(kategorien, notenFuerSchueler, klasse, hj === 2 ? "hj2" : "hj1");
    const schriftlichRoh = res.schriftlich.schnitt;
    const schriftlich = tendenznote(schriftlichRoh, mss);

    const ant = anteile(klasse, schriftlich !== null, sonstige !== null);
    let zeugnis = null, zeugnisRoh = null;
    if (schriftlich !== null || sonstige !== null) {
      zeugnisRoh = (schriftlich || 0) * ant.s + (sonstige || 0) * ant.o;
      const roh = (schriftlichRoh || 0) * ant.s + (sonstigeRoh || 0) * ant.o;
      // Bei Punkten ist Runden immer eindeutig, der Grenzwert-Fallback gilt
      // nur für die 1-6-Skala mit ihrer "4-"-Sonderregel.
      zeugnis = (!mss && istGrenzwert(zeugnisRoh)) ? zeugnisnote(roh, mss) : zeugnisnote(zeugnisRoh, mss);
    }
    return {
      hj, quartale, epochal,
      schriftlichRoh, schriftlich,
      sonstigeRoh, sonstige,
      zeugnisRoh, zeugnis,
      effAnteilS: ant.s, effAnteilO: ant.o,
      res
    };
  }

  Object.assign(global.Calc, {
    quartaleVonFilter, berechneSchueler, mitarbeitVorhanden, halbjahrErgebnis
  });
})(window);
