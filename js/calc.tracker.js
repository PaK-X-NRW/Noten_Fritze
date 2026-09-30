/* =========================================================================
   calc.tracker.js – Rechenhilfen für den Mitarbeits-Tracker
   - Heatmap: Verfall der Punkte über die Zeit und Farbe der Kachel
     (0–100 Punkte, bewusst unabhängig von den Mitarbeitspunkten)
   - Stundenzeiten: laufende Stunde erkennen, Einzel-/Doppelstunde bestimmen
   - vergessene (nicht beendete) Stunden erkennen, Nachträge datieren
   Erweitert den Namespace Calc (calc.js lädt davor).
   ========================================================================= */
(function (global) {
  "use strict";

  // ---- Heatmap -------------------------------------------------------------
  // Aktueller Heatmap-Stand: Y Punkte (verfallPunkte) verfallen je X Minuten
  // (verfallMinuten) seit der letzten Änderung; begrenzt auf 0–100.
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

  // Kachelfarbe: 0 Punkte = rot, 100 = grün.
  function heatFarbeDurchPunkte(heatPoints) {
    if (heatPoints === null || heatPoints === undefined || isNaN(Number(heatPoints))) return "#9aa5a1";
    const t = Math.max(0, Math.min(1, Number(heatPoints) / 100));
    const hue = 125 * t; // 0 = rot, 1 = grün
    const sat = 55, light = 72 + t * 8;
    return "hsl(" + hue.toFixed(0) + ", " + sat + "%, " + light.toFixed(0) + "%)";
  }

  // ---- Stundenzeiten-Auswertung --------------------------------------------
  // Nur die Blöcke der Art „stunde“ zählen als Unterricht; Pausen (und
  // sonstige Zeiten wie die Frühaufsicht) nie. Einträge ohne `art` gelten als
  // Stunde (ältere Listen).
  function nurStunden(stundenzeiten) {
    return (Array.isArray(stundenzeiten) ? stundenzeiten : [])
      .filter((b) => b && (!b.art || b.art === "stunde"));
  }

  // Findet zur Zeit `jetzt` die laufende Stunde laut Stundenzeiten.
  //   stundenzeiten: [{ art, nr, start, ende }, ...] – gilt für jeden Schultag gleich.
  // Rückgabe: { index, stunde } oder null (Wochenende, Pause oder keine Stunde).
  // index zählt nur die Stunden, nicht die Pausen.
  function aktuelleStunde(stundenzeiten, jetzt) {
    const d = jetzt ? new Date(jetzt) : new Date();
    const wochentag = d.getDay(); // 0 = So, 6 = Sa
    if (wochentag === 0 || wochentag === 6) return null;
    const stunden = nurStunden(stundenzeiten);
    if (!stunden.length) return null;
    const min = d.getHours() * 60 + d.getMinutes();
    for (let i = 0; i < stunden.length; i++) {
      if (min >= Store.hhmmZuMinuten(stunden[i].start) && min < Store.hhmmZuMinuten(stunden[i].ende)) {
        return { index: i, stunde: stunden[i] };
      }
    }
    return null;
  }

  // Baut die Tracker-Session (Start/Ende) aus den Stundenzeiten + Angabe
  // Einzel-/Doppelstunde. Doppelstunde = bis zum Ende der folgenden Stunde,
  // Pausen dazwischen zählen mit (bzw. + eine Stundendauer, wenn keine
  // Folgestunde eingetragen ist).
  // Ohne laufende Stunde: Fallback 45/90 Min ab jetzt.
  // Rückgabe: { startTs, endeTs, dauerMin, quelle: "plan" | "fallback", stundeNr }
  function trackerSession(stundenzeiten, jetzt, doppel) {
    const start = jetzt || Store.now();
    const stunden = nurStunden(stundenzeiten);
    const gefunden = aktuelleStunde(stunden, start);
    if (!gefunden) {
      const dauerMin = doppel ? 90 : 45;
      return { startTs: start, endeTs: start + dauerMin * 60000, dauerMin, quelle: "fallback", stundeNr: null };
    }
    const d = new Date(start);
    const tagesbeginn = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const startMin = Store.hhmmZuMinuten(gefunden.stunde.start);
    let endeMin = Store.hhmmZuMinuten(gefunden.stunde.ende);
    if (doppel) {
      const folge = stunden[gefunden.index + 1];
      endeMin = folge ? Store.hhmmZuMinuten(folge.ende) : endeMin + (endeMin - startMin);
    }
    return {
      startTs: tagesbeginn + startMin * 60000,
      endeTs: tagesbeginn + endeMin * 60000,
      dauerMin: endeMin - startMin,
      quelle: "plan",
      stundeNr: gefunden.stunde.nr != null ? gefunden.stunde.nr : gefunden.index + 1
    };
  }

  // ---- Vergessene Stunden ----------------------------------------------------
  // Letzter Zeitpunkt, der noch zur Stunde gehört: ihr Ende bzw. – ohne
  // Zeitangabe – das Ende ihres Tages.
  function stundenGrenze(stunde) {
    if (stunde.endeTs) return stunde.endeTs;
    const d = new Date(stunde.startTs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  }

  // Wurde die Stunde nicht beendet, obwohl sie vorbei ist? Mit Zeitangabe ab
  // ihrem Ende, ohne Zeitangabe ab dem Folgetag. Solche Stunden beendet die
  // App nicht selbst, sondern fragt vorher, ob noch etwas nachzutragen ist.
  function stundeVergessen(stunde, jetzt) {
    if (!stunde || stunde.status !== "offen") return false;
    return (jetzt || Store.now()) >= stundenGrenze(stunde);
  }

  // Zeitstempel eines Nachtrags: Er gehört in die Stunde, nicht auf den Tag,
  // an dem nachgetragen wird (Tages-Zuordnung, Abwesenheiten, Zeiträume).
  // Liegt jetzt nach der Stunde, gilt ihre letzte Sekunde.
  function erfassungsZeit(stunde, jetzt) {
    const t = jetzt || Store.now();
    const grenze = stundenGrenze(stunde);
    return t < grenze ? t : Math.max(stunde.startTs, grenze - 1000);
  }

  Object.assign(global.Calc, {
    heatPunkteAktuell, heatFarbeDurchPunkte, aktuelleStunde, trackerSession,
    stundeVergessen, erfassungsZeit
  });
})(window);
