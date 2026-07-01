/* =========================================================================
   calc.js – Rechenlogik
   - Notenberechnung (Kategorie -> Art-Gruppe -> Gesamtnote), transparent
   - Notenparser/-formatierung (deutsche Tendenzen 2+, 2, 2-)
   - Mitarbeits-Auswertung inkl. Notenvorschlag
   - Heatmap-Farbe (grün = aktiv, rot = lange nicht beteiligt)
   ========================================================================= */
(function (global) {
  "use strict";

  // ---- Noten parsen/formatieren --------------------------------------------
  // Erlaubt: "2", "2,3", "2.3", "2+", "2-", "1+". Ergebnis: Zahl 1..6 oder null.
  function parseNote(input) {
    if (input === null || input === undefined) return null;
    let s = String(input).trim().replace(",", ".");
    if (s === "") return null;
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
  function clampNote(n) { return Math.max(1, Math.min(6, n)); }

  // Anzeige als deutsche Zahl mit Komma; Nachkommastellen je nach Rundung.
  function formatNote(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    decimals = decimals === undefined ? 1 : decimals;
    return n.toFixed(decimals).replace(".", ",");
  }

  // Wendet die konfigurierte Rundungsregel auf eine Gesamtnote an.
  function rundeGesamt(n, rundung) {
    if (n === null || isNaN(n)) return null;
    if (rundung === "ganze") return Math.round(n);
    if (rundung === "keine") return Math.round(n * 100) / 100;
    return Math.round(n * 10) / 10; // "eine" (Standard)
  }

  // ---- Notenberechnung -----------------------------------------------------
  // Liefert eine nachvollziehbare Struktur mit Zwischenergebnissen.
  //   kategorien: Array {id, name, art, gewichtung}
  //   notenFuerSchueler: Array {kategorieId, wert}
  //   klasse: {anteilSchriftlich, anteilSonstige}
  function berechneSchueler(kategorien, notenFuerSchueler, klasse, rundung) {
    const notenByKat = {};
    notenFuerSchueler.forEach((n) => {
      if (n.wert === null || n.wert === undefined || isNaN(n.wert)) return;
      (notenByKat[n.kategorieId] = notenByKat[n.kategorieId] || []).push(n.wert);
    });

    // 1) Durchschnitt je Kategorie
    const katErgebnisse = kategorien.map((kat) => {
      const werte = notenByKat[kat.id] || [];
      const schnitt = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
      return {
        id: kat.id, name: kat.name, art: kat.art, gewichtung: kat.gewichtung,
        anzahl: werte.length, werte, schnitt
      };
    });

    // 2) Je Art-Gruppe: gewichteter Schnitt (Kategorien ohne Noten ignorieren)
    function gruppe(art) {
      const kats = katErgebnisse.filter((k) => k.art === art && k.schnitt !== null && k.gewichtung > 0);
      const gewSumme = kats.reduce((a, k) => a + k.gewichtung, 0);
      const schnitt = gewSumme ? kats.reduce((a, k) => a + k.schnitt * k.gewichtung, 0) / gewSumme : null;
      return { art, kategorien: kats, gewSumme, schnitt };
    }
    const schriftlich = gruppe("schriftlich");
    const sonstige = gruppe("sonstige");

    // 3) Gesamt aus beiden Gruppen. Robust: fehlt eine Gruppe, zählt die andere 100 %.
    let aS = (klasse.anteilSchriftlich != null ? klasse.anteilSchriftlich : 50);
    let aO = (klasse.anteilSonstige != null ? klasse.anteilSonstige : 50);
    const hasS = schriftlich.schnitt !== null;
    const hasO = sonstige.schnitt !== null;

    let gesamt = null, effAnteilS = 0, effAnteilO = 0;
    if (hasS && hasO) {
      const summe = aS + aO || 1;
      effAnteilS = aS / summe; effAnteilO = aO / summe;
      gesamt = schriftlich.schnitt * effAnteilS + sonstige.schnitt * effAnteilO;
    } else if (hasS) {
      effAnteilS = 1; gesamt = schriftlich.schnitt;
    } else if (hasO) {
      effAnteilO = 1; gesamt = sonstige.schnitt;
    }

    return {
      kategorien: katErgebnisse,
      schriftlich, sonstige,
      effAnteilS, effAnteilO,
      gesamtRoh: gesamt,
      gesamt: rundeGesamt(gesamt, rundung)
    };
  }

  // Farbe für eine Note (1 gut = grün, 6 = rot). Für Badges.
  function noteFarbe(n) {
    if (n === null || n === undefined || isNaN(n)) return "#9aa5a1";
    const t = Math.max(0, Math.min(1, (n - 1) / 5)); // 0..1
    const hue = 125 - t * 125; // 125° grün -> 0° rot
    return "hsl(" + hue.toFixed(0) + ", 62%, 42%)";
  }

  // ---- Mitarbeit / Epochalnote ---------------------------------------------
  // Aggregiert Ereignisse je Schüler innerhalb eines Zeitraums.
  //   ereignisse: Array {schuelerId, typ, punkte, timestamp}
  function auswertungMitarbeit(ereignisse, settings, vonTs, bisTs) {
    const von = vonTs || 0, bis = bisTs || Store.now() + 1;
    const proSchueler = {};
    ereignisse.forEach((e) => {
      if (e.timestamp < von || e.timestamp > bis) return;
      const s = proSchueler[e.schuelerId] || (proSchueler[e.schuelerId] = {
        schuelerId: e.schuelerId, anzahl: 0, punkte: 0, letzte: 0,
        typen: {}, tage: {}
      });
      s.anzahl += 1;
      s.punkte += (e.punkte != null ? e.punkte : (settings.mitarbeitPunkte[e.typ] || 0));
      s.letzte = Math.max(s.letzte, e.timestamp);
      s.typen[e.typ] = (s.typen[e.typ] || 0) + 1;
      const tag = new Date(e.timestamp).toISOString().slice(0, 10);
      s.tage[tag] = true;
    });
    Object.values(proSchueler).forEach((s) => {
      const aktiveTage = Object.keys(s.tage).length || 1;
      s.aktiveTage = aktiveTage;
      s.punkteProTag = s.punkte / aktiveTage;
      s.notenvorschlag = punkteZuNote(s.punkteProTag, settings);
    });
    return proSchueler;
  }

  function punkteZuNote(punkteProTag, settings) {
    const schwellen = settings.mitarbeitSchwellen || Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
    for (const s of schwellen) {
      if (punkteProTag >= s.abPunkte) return s.note;
    }
    return 6;
  }

  // Heatmap-Farbe für den Tracker.
  //   letzteMeldung: Timestamp der letzten Meldung (oder 0/undefined)
  //   referenzStart: ab wann gemessen wird (z. B. Tracker geöffnet)
  //   heatMinuten:  nach wie vielen Minuten "kalt" (rot)
  function heatFarbe(letzteMeldung, referenzStart, heatMinuten, jetzt) {
    jetzt = jetzt || Store.now();
    const basis = letzteMeldung && letzteMeldung > 0 ? letzteMeldung : referenzStart;
    const minuten = (jetzt - basis) / 60000;
    const max = Math.max(1, heatMinuten || 20);
    const t = Math.max(0, Math.min(1, minuten / max)); // 0 = frisch, 1 = kalt
    const hue = 125 - t * 125; // grün -> rot
    const sat = 55, light = 82 - t * 10;
    return "hsl(" + hue.toFixed(0) + ", " + sat + "%, " + light.toFixed(0) + "%)";
  }

  global.Calc = {
    parseNote, formatNote, clampNote, rundeGesamt,
    berechneSchueler, noteFarbe,
    auswertungMitarbeit, punkteZuNote, heatFarbe
  };
})(window);
