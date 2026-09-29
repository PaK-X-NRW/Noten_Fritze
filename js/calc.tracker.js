/* =========================================================================
   calc.tracker.js – Rechenhilfen für den Mitarbeits-Tracker
   - Heatmap: Verfall der Punkte über die Zeit und Farbe der Kachel
     (0–100 Punkte, bewusst unabhängig von den Mitarbeitspunkten)
   - Stundenplan: laufende Stunde erkennen, Einzel-/Doppelstunde bestimmen
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

  // ---- Stundenplan-Auswertung ----------------------------------------------
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
      if (min >= Store.hhmmZuMinuten(stundenplan[i].start) && min < Store.hhmmZuMinuten(stundenplan[i].ende)) {
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
    const startMin = Store.hhmmZuMinuten(gefunden.stunde.start);
    let endeMin = Store.hhmmZuMinuten(gefunden.stunde.ende);
    if (doppel) {
      const folge = stundenplan[gefunden.index + 1];
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

  Object.assign(global.Calc, { heatPunkteAktuell, heatFarbeDurchPunkte, aktuelleStunde, trackerSession });
})(window);
