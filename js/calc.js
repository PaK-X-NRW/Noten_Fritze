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

  // ---- Zeugnisskala --------------------------------------------------------
  // Auf dem Zeugnis sind nur ganze Noten und als einzige Tendenz die 4- (=4,3)
  // zulässig. Grenzen: bis 1,5 -> 1 · bis 2,5 -> 2 · bis 3,5 -> 3 ·
  // unter 4,15 -> 4 · bis 4,5 -> 4- · bis 5,5 -> 5 · darüber 6.
  // Genau auf einer Grenze gewinnt die bessere Note (4,5 ist also noch 4-).
  const EPS = 1e-9;
  const ZEUGNIS_GRENZEN = [1.5, 2.5, 3.5, 4.15, 4.5, 5.5];

  function zeugnisnote(wert) {
    if (wert === null || wert === undefined || isNaN(wert)) return null;
    const w = clampNote(Number(wert));
    if (w <= 1.5 + EPS) return 1;
    if (w <= 2.5 + EPS) return 2;
    if (w <= 3.5 + EPS) return 3;
    if (w < 4.15 - EPS) return 4;
    if (w <= 4.5 + EPS) return 4.3;
    if (w <= 5.5 + EPS) return 5;
    return 6;
  }

  function formatZeugnisnote(n) {
    if (n === null || n === undefined || isNaN(n)) return "–";
    if (Math.abs(n - 4.3) < 0.01) return "4-";
    return String(Math.round(n));
  }

  // Liegt ein Wert exakt auf einer Grenze, ist die Rundung nicht eindeutig.
  function istGrenzwert(wert) {
    return ZEUGNIS_GRENZEN.some((g) => Math.abs(wert - g) < EPS);
  }

  // Zeugnis-Teilnoten und Zeugnisnote aus dem Ergebnis von berechneSchueler.
  // Gerechnet wird mit den GERUNDETEN Teilnoten (so wie sie in der Übersicht
  // stehen); landet das Ergebnis genau auf einer Grenze, entscheiden die
  // ungerundeten Werte (gesamtRoh).
  function zeugnisErgebnis(res) {
    const schriftlich = zeugnisnote(res.schriftlich.schnitt);
    const sonstige = zeugnisnote(res.sonstige.schnitt);
    let zeugnis = null;
    if (schriftlich !== null && sonstige !== null) {
      const kandidat = schriftlich * res.effAnteilS + sonstige * res.effAnteilO;
      zeugnis = istGrenzwert(kandidat) ? zeugnisnote(res.gesamtRoh) : zeugnisnote(kandidat);
    } else if (schriftlich !== null) {
      zeugnis = schriftlich;
    } else if (sonstige !== null) {
      zeugnis = sonstige;
    }
    return { schriftlich, sonstige, zeugnis };
  }

  // Jahresnote aus den beiden Halbjahres-Zeugnisnoten: beide zählen 50 %, bei
  // Gleichstand gibt das 2. Halbjahr den Ausschlag (49 % / 51 %).
  // Fehlt eine der beiden Noten, gibt es keine Jahresnote.
  function jahresnote(hj1, hj2) {
    if (hj1 === null || hj1 === undefined || hj2 === null || hj2 === undefined) return null;
    return zeugnisnote(hj1 * 0.49 + hj2 * 0.51);
  }

  // ---- Notenberechnung -----------------------------------------------------
  // Liefert eine nachvollziehbare Struktur mit Zwischenergebnissen.
  //   kategorien: Array {id, name, art, gewichtung, anzeige}
  //   notenFuerSchueler: Array {kategorieId, wert, halbjahr}
  //   klasse: {anteilSchriftlich, anteilSonstige}
  //   halbjahr: optional 1 | 2 (nur dieses Halbjahr rechnen), null = ganzes Jahr.
  //   Noten ohne halbjahr-Feld (alte Datensätze) fließen immer ein.
  //   Kategorien mit anzeige != "note" (z. B. Zählung fehlender Hausaufgaben)
  //   bleiben in den Zwischenergebnissen sichtbar, zählen aber nicht in die Note.
  function berechneSchueler(kategorien, notenFuerSchueler, klasse, rundung, halbjahr) {
    const notenByKat = {};
    notenFuerSchueler.forEach((n) => {
      if (n.wert === null || n.wert === undefined || isNaN(n.wert)) return;
      if (halbjahr && n.halbjahr && n.halbjahr !== halbjahr) return;
      (notenByKat[n.kategorieId] = notenByKat[n.kategorieId] || []).push(n.wert);
    });

    // 1) Durchschnitt je Kategorie
    const katErgebnisse = kategorien.map((kat) => {
      const werte = notenByKat[kat.id] || [];
      const schnitt = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : null;
      return {
        id: kat.id, name: kat.name, art: kat.art, gewichtung: kat.gewichtung,
        zaehltInNote: (kat.anzeige || "note") === "note",
        anzahl: werte.length, werte, schnitt
      };
    });

    // 2) Je Art-Gruppe: gewichteter Schnitt (Kategorien ohne Noten ignorieren)
    function gruppe(art) {
      const kats = katErgebnisse.filter((k) => k.art === art && k.zaehltInNote && k.schnitt !== null && k.gewichtung > 0);
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
  // Lokales Tages-Datum (YYYY-MM-DD) eines Timestamps – Schlüssel für
  // Tages-Zählungen und Abwesenheiten.
  function tagVonTs(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  // Aggregiert Ereignisse je Schüler innerhalb eines Zeitraums.
  //   ereignisse: Array {schuelerId, stundeId, typ, punkte, timestamp}
  //   opts: {
  //     vonTs, bisTs:   Zeitraum (Default: alles bis jetzt)
  //     abwesendTage:   Set "schuelerId|YYYY-MM-DD" – Ereignisse an Tagen mit
  //                     gemeldeter Abwesenheit zählen nicht, und die Stunden
  //                     dieses Tages fallen für den/die Schüler/in aus dem Nenner
  //     stunden:        Array der gehaltenen Stunden {datum, startTs} – bereits
  //                     nach Halbjahr gefiltert; sie bilden den Nenner
  //     schuelerIds:    optional alle Schüler der Klasse, damit auch Schüler
  //                     ohne jedes Ereignis einen Vorschlag bekommen
  //     schwellen:      effektive Notenschwellen (global oder klassenweise)
  //   }
  // Der Nenner sind ALLE Stunden im Zeitraum, in denen der/die Schüler/in
  // anwesend war – auch Stunden ohne jede Meldung (sie zählen 0 Punkte).
  function auswertungMitarbeit(ereignisse, settings, opts) {
    opts = opts || {};
    const von = opts.vonTs || 0, bis = opts.bisTs || Store.now() + 1;
    const abwesendTage = opts.abwesendTage;
    const schwellen = opts.schwellen || settings.mitarbeitSchwellen || Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
    const stunden = (opts.stunden || []).filter((st) => st.startTs >= von && st.startTs <= bis);

    const proSchueler = {};
    function eintrag(sid) {
      if (!proSchueler[sid]) {
        proSchueler[sid] = {
          schuelerId: sid, anzahl: 0, punkte: 0, letzte: 0,
          typen: {}, tage: {}, stundenIds: {}
        };
      }
      return proSchueler[sid];
    }
    (opts.schuelerIds || []).forEach(eintrag);

    ereignisse.forEach((e) => {
      if (e.timestamp < von || e.timestamp > bis) return;
      const tag = tagVonTs(e.timestamp);
      if (abwesendTage && abwesendTage.has(e.schuelerId + "|" + tag)) return;
      const s = eintrag(e.schuelerId);
      s.anzahl += 1;
      s.punkte += (e.punkte != null ? e.punkte : (settings.mitarbeitPunkte[e.typ] || 0));
      s.letzte = Math.max(s.letzte, e.timestamp);
      s.typen[e.typ] = (s.typen[e.typ] || 0) + 1;
      s.tage[tag] = true;
      s.stundenIds[e.stundeId || tag] = true;
    });

    Object.keys(proSchueler).forEach((sid) => {
      const s = proSchueler[sid];
      let gezaehlt = 0;
      stunden.forEach((st) => {
        if (abwesendTage && abwesendTage.has(sid + "|" + st.datum)) return;
        gezaehlt += 1;
      });
      s.stundenGezaehlt = gezaehlt;
      s.stundenMitEreignis = Object.keys(s.stundenIds).length;
      s.aktiveTage = Object.keys(s.tage).length;
      // Ohne bekannte Stunden (z. B. gefilterter Zeitraum) ersatzweise die
      // Stunden mit Ereignis, damit nie durch 0 geteilt wird.
      s.nenner = gezaehlt || s.stundenMitEreignis || 1;
      s.punkteProStunde = s.punkte / s.nenner;
      // Ohne jede Grundlage (keine Stunde, kein Ereignis) gibt es keinen Vorschlag.
      s.notenvorschlag = (gezaehlt || s.anzahl) ? punkteZuNote(s.punkteProStunde, schwellen) : null;
    });
    return proSchueler;
  }

  function punkteZuNote(punkteProStunde, schwellen) {
    const liste = schwellen || Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
    for (const s of liste) {
      if (punkteProStunde >= s.abPunkte) return s.note;
    }
    return 6;
  }

  // Effektive Notenschwellen: eigene Schwellen der Klasse schlagen die
  // globale Einstellung (Fächer ermöglichen unterschiedliche Mitarbeit).
  function schwellenFuer(settings, klasse) {
    if (klasse && Array.isArray(klasse.mitarbeitSchwellen) && klasse.mitarbeitSchwellen.length) {
      return klasse.mitarbeitSchwellen;
    }
    if (settings && Array.isArray(settings.mitarbeitSchwellen) && settings.mitarbeitSchwellen.length) {
      return settings.mitarbeitSchwellen;
    }
    return Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
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

  function heatPunkteAktuell(heatPoints, heatLastDecayAt, verfallMinuten, verfallPunkte, jetzt) {
    const startWert = Math.max(0, Math.min(100, Number(heatPoints) || 0));
    const letzteAenderung = Number(heatLastDecayAt) || 0;
    const aktuelleZeit = jetzt || Store.now();
    const minuten = Math.max(0, (aktuelleZeit - letzteAenderung) / 60000);
    const x = Math.max(1, Number(verfallMinuten) || 5);
    const y = Math.max(0, Number(verfallPunkte) || 1);
    const aktuell = Math.max(0, Math.min(100, startWert - (minuten / x) * y));
    return { heatPoints: aktuell, verfallMinuten: x, verfallPunkte: y, minutenSeitLetzterAenderung: minuten };
  }

  function heatFarbeDurchPunkte(heatPoints) {
    if (heatPoints === null || heatPoints === undefined || isNaN(Number(heatPoints))) return "#9aa5a1";
    const t = Math.max(0, Math.min(1, Number(heatPoints) / 100));
    const hue = 125 * t; // 0 = rot, 1 = grün
    const sat = 55, light = 72 + t * 8;
    return "hsl(" + hue.toFixed(0) + ", " + sat + "%, " + light.toFixed(0) + "%)";
  }

  // ---- Stundenplan-Auswertung ----------------------------------------------
  function hhmmZuMinuten(v) {
    const p = String(v || "").split(":");
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }

  // Findet zur Zeit `jetzt` die laufende Stunde im Stundenplan.
  //   stundenplan: [{ nr, start, ende }, ...] – gilt für jeden Schultag gleich.
  // Rückgabe: { index, stunde } oder null (Wochenende oder keine laufende Stunde).
  function aktuelleStunde(stundenplan, jetzt) {
    const d = jetzt ? new Date(jetzt) : new Date();
    const wochentag = d.getDay(); // 0 = So, 6 = Sa
    if (wochentag === 0 || wochentag === 6) return null;
    if (!Array.isArray(stundenplan) || !stundenplan.length) return null;
    const min = d.getHours() * 60 + d.getMinutes();
    for (let i = 0; i < stundenplan.length; i++) {
      if (min >= hhmmZuMinuten(stundenplan[i].start) && min < hhmmZuMinuten(stundenplan[i].ende)) {
        return { index: i, stunde: stundenplan[i] };
      }
    }
    return null;
  }

  // Baut die Tracker-Session (Start/Ende) aus Stundenplan + Angabe
  // Einzel-/Doppelstunde. Doppelstunde = bis zum Ende der Folgestunde
  // (bzw. + eine Stundendauer, wenn keine Folgestunde im Plan steht).
  // Ohne laufende Stunde im Plan: Fallback 45/90 Min ab jetzt.
  // Rückgabe: { startTs, endeTs, dauerMin, quelle: "plan" | "fallback", stundeNr }
  function trackerSession(stundenplan, jetzt, doppel) {
    const start = jetzt || Store.now();
    const gefunden = aktuelleStunde(stundenplan, start);
    if (!gefunden) {
      const dauerMin = doppel ? 90 : 45;
      return { startTs: start, endeTs: start + dauerMin * 60000, dauerMin, quelle: "fallback", stundeNr: null };
    }
    const d = new Date(start);
    const tagesbeginn = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const liste = stundenplan;
    const startMin = hhmmZuMinuten(gefunden.stunde.start);
    let endeMin = hhmmZuMinuten(gefunden.stunde.ende);
    if (doppel) {
      const folge = liste[gefunden.index + 1];
      endeMin = folge ? hhmmZuMinuten(folge.ende) : endeMin + (endeMin - startMin);
    }
    return {
      startTs: tagesbeginn + startMin * 60000,
      endeTs: tagesbeginn + endeMin * 60000,
      dauerMin: endeMin - startMin,
      quelle: "plan",
      stundeNr: gefunden.stunde.nr != null ? gefunden.stunde.nr : gefunden.index + 1
    };
  }

  global.Calc = {
    parseNote, formatNote, clampNote, rundeGesamt,
    berechneSchueler, noteFarbe,
    zeugnisnote, formatZeugnisnote, zeugnisErgebnis, jahresnote,
    auswertungMitarbeit, punkteZuNote, schwellenFuer, heatFarbe,
    tagVonTs,
    heatPunkteAktuell, heatFarbeDurchPunkte,
    aktuelleStunde, trackerSession
  };
})(window);
