/* =========================================================================
   calc.sitzplan.js – Rechenhilfen für Sitzpläne
   - Raumform: Vorlagen für Gänge (Spalten ohne Plätze)
   - Sitzregeln: Lage der Plätze (vorne/hinten, mittig, Rand, Nachbarn),
     Prüfung einer Belegung und automatisches Verteilen nach Regeln
   Vorne ist UNTEN im Raster (höchste Reihennummer, dort liegt die Tafel).
   Frei von DOM/DB. Erweitert den Namespace Calc (calc.js lädt davor).
   ========================================================================= */
(function (global) {
  "use strict";

  // ---- Raumform ------------------------------------------------------------
  // Alle Tische schauen nach vorne; eine Vorlage legt fest, welche Spalten
  // in jeder Reihe Gang sind (keinPlatz).
  //   "alle"        – keine Gänge
  //   "mittelgang"  – die mittlere Spalte (nur bei ungerader Spaltenzahl)
  //   "zweiertische"– Tisch, Tisch, Gang, Tisch, Tisch, Gang … (ein Gang ganz
  //                   rechts entfällt; passt genau bei 5, 8, 11, 14 Spalten)
  // Rückgabe: Liste der Gang-Spalten (0-basiert) oder null, wenn die Vorlage
  // bei dieser Spaltenzahl nicht passt.
  function sitzplanGaenge(cols, vorlage) {
    if (vorlage === "alle") return [];
    if (vorlage === "mittelgang") return cols >= 3 && cols % 2 === 1 ? [(cols - 1) / 2] : null;
    if (vorlage === "zweiertische") {
      if (cols < 3) return null;
      const gaenge = [];
      for (let c = 2; c < cols - 1; c += 3) gaenge.push(c);
      return gaenge;
    }
    return null;
  }

  // ---- Sitzregeln ----------------------------------------------------------
  // Eine Regel: { id, typ, a, b?, reihen?, seite?, planId?, seatId? }
  //   nichtNeben (a, b) – nicht links/rechts, davor/dahinter oder schräg daneben
  //   neben      (a, b) – direkt links oder rechts in derselben Reihe
  //   vorne / hinten (a, reihen) – in den vordersten/hintersten n Reihen mit Plätzen
  //   mittig     (a)    – im mittleren Drittel der Spalten (Blick gerade zur Tafel)
  //   rand       (a, seite "links"|"rechts") – äußerster Platz seiner Reihe
  //   platz      (a, planId, seatId) – fester Platz (gilt nur in diesem Plan)
  // a und b sind Schüler-IDs. Gänge (keinPlatz) zählen nie als Platz, ein Gang
  // zwischen zwei Plätzen trennt sie also.
  const REGEL_TYPEN = ["nichtNeben", "neben", "vorne", "hinten", "mittig", "rand", "platz"];

  // Mittlere Spalten: rund ein Drittel, symmetrisch um die Mitte – mindestens
  // die mittlere (ungerade Spaltenzahl) bzw. die mittleren zwei (gerade).
  function mittlereSpalten(cols) {
    let m = Math.max(1, Math.round(cols / 3));
    if ((cols - m) % 2 !== 0) m++;
    m = Math.min(cols, m);
    const start = (cols - m) / 2;
    const liste = [];
    for (let c = start; c < start + m; c++) liste.push(c);
    return liste;
  }

  // Lage aller echten Plätze eines Plans. Rückgabe:
  //   plaetze: [{ id, row, col, rang, mittig, randLinks, randRechts }]
  //            rang = 0 für die vorderste Reihe mit Plätzen, 1 dahinter …
  //   index:   seatId -> Position in plaetze
  //   reihen:  Anzahl Reihen mit Plätzen
  function sitzplanLage(plan) {
    const echte = (plan.seats || []).filter((s) => !s.keinPlatz);
    const reihenNr = [];
    echte.forEach((s) => { if (reihenNr.indexOf(s.row) === -1) reihenNr.push(s.row); });
    reihenNr.sort((x, y) => y - x); // vorne = höchste Reihennummer
    const cols = plan.cols || echte.reduce((m, s) => Math.max(m, s.col + 1), 0);
    const mitte = mittlereSpalten(cols);
    const aussen = {};
    echte.forEach((s) => {
      const r = aussen[s.row] || (aussen[s.row] = { min: s.col, max: s.col });
      r.min = Math.min(r.min, s.col); r.max = Math.max(r.max, s.col);
    });
    const plaetze = echte.map((s) => ({
      id: s.id, row: s.row, col: s.col,
      rang: reihenNr.indexOf(s.row),
      mittig: mitte.indexOf(s.col) !== -1,
      randLinks: aussen[s.row].min === s.col,
      randRechts: aussen[s.row].max === s.col
    }));
    const index = {};
    plaetze.forEach((p, i) => { index[p.id] = i; });
    return { plaetze, index, reihen: reihenNr.length };
  }

  function nebeneinander(p, q) {
    return p.row === q.row && Math.abs(p.col - q.col) === 1;
  }
  function inDerNaehe(p, q) {
    return p !== q && Math.abs(p.row - q.row) <= 1 && Math.abs(p.col - q.col) <= 1;
  }

  // Ist die Regel erfüllt? platzVon: Schüler-ID -> Platz aus sitzplanLage (oder undefined).
  function regelErfuellt(regel, platzVon, lage) {
    const pa = platzVon(regel.a);
    const pb = regel.b ? platzVon(regel.b) : null;
    const n = Math.max(1, parseInt(regel.reihen, 10) || 2);
    switch (regel.typ) {
      case "nichtNeben": return !(pa && pb && inDerNaehe(pa, pb));
      case "neben":      return !!(pa && pb && nebeneinander(pa, pb));
      case "vorne":      return !!pa && pa.rang < n;
      case "hinten":     return !!pa && pa.rang >= lage.reihen - n;
      case "mittig":     return !!pa && pa.mittig;
      case "rand":       return !!pa && (regel.seite === "rechts" ? pa.randRechts : pa.randLinks);
      case "platz":      return !!pa && pa.id === regel.seatId;
      default:           return true;
    }
  }

  // Regeln, die für diesen Plan gelten: feste Plätze nur im eigenen Plan und
  // nur, wenn es den Platz dort (noch) gibt.
  function regelnFuerPlan(regeln, plan, lage) {
    return (regeln || []).filter((r) => REGEL_TYPEN.indexOf(r.typ) !== -1 &&
      (r.typ !== "platz" || (r.planId === plan.id && lage.index[r.seatId] !== undefined)));
  }

  // Welche Regeln verletzt die aktuelle Belegung des Plans?
  function sitzplanRegelnPruefen(plan, regeln) {
    const lage = sitzplanLage(plan);
    const platzVon = {};
    (plan.seats || []).forEach((s) => {
      if (s.schuelerId && !s.keinPlatz) platzVon[s.schuelerId] = lage.plaetze[lage.index[s.id]];
    });
    return regelnFuerPlan(regeln, plan, lage).filter((r) => !regelErfuellt(r, (sid) => platzVon[sid], lage));
  }

  // ---- Automatisch verteilen -------------------------------------------------
  // Mischt die Schüler/innen zufällig auf die echten Plätze und sucht dabei eine
  // Belegung, die alle Regeln erfüllt. Leere Plätze bleiben möglichst hinten.
  // Geht nicht alles auf, gewinnt die Belegung mit den wenigsten verletzten Regeln.
  //   plan:       Sitzplan (rows, cols, seats mit keinPlatz)
  //   schuelerIds: wer einen Platz bekommen soll (Reihenfolge egal)
  //   regeln:     Sitzregeln der Klasse (siehe oben)
  //   zufall:     Zufallsfunktion wie Math.random (für Tests austauschbar)
  // Rückgabe: { belegung: { seatId: schuelerId }, verletzt: [Regel], ohnePlatz: [schuelerId] }
  function sitzplanVerteilen(plan, schuelerIds, regeln, zufall) {
    zufall = zufall || Math.random;
    const lage = sitzplanLage(plan);
    const P = lage.plaetze;
    const ids = (schuelerIds || []).slice();
    const gilt = regelnFuerPlan(regeln, plan, lage).filter((r) =>
      ids.indexOf(r.a) !== -1 && (!r.b || ids.indexOf(r.b) !== -1));
    const zahl = (n) => Math.floor(zufall() * n);

    // Feste Plätze zuerst (bei zwei Regeln für denselben Platz gewinnt die erste)
    const fest = {};   // Schüler-ID -> Platzindex
    const festBelegt = {};
    gilt.filter((r) => r.typ === "platz").forEach((r) => {
      const i = lage.index[r.seatId];
      if (fest[r.a] === undefined && !festBelegt[i]) { fest[r.a] = i; festBelegt[i] = true; }
    });

    // Zustand: pos[s] = Platzindex oder -1 (ohne Platz), belegt[i] = Schüler-Index oder -1
    const pos = ids.map((sid) => (fest[sid] !== undefined ? fest[sid] : -1));
    const belegt = P.map(() => -1);
    pos.forEach((i, s) => { if (i !== -1) belegt[i] = s; });
    const beweglich = [];
    ids.forEach((sid, s) => { if (fest[sid] === undefined) beweglich.push(s); });
    const freiePlaetze = [];
    P.forEach((_, i) => { if (!festBelegt[i]) freiePlaetze.push(i); });

    const mischen = (liste) => {
      for (let i = liste.length - 1; i > 0; i--) { const j = zahl(i + 1); const t = liste[i]; liste[i] = liste[j]; liste[j] = t; }
      return liste;
    };
    const sIndex = {};
    ids.forEach((sid, s) => { sIndex[sid] = s; });
    const platzVon = (sid) => { const i = pos[sIndex[sid]]; return i === -1 || i === undefined ? undefined : P[i]; };
    // Kosten: jede verletzte Regel wiegt schwer, dazu leicht der Abstand der
    // Belegten zur Tafel (damit leere Plätze hinten bleiben).
    const kosten = () => {
      let k = 0;
      for (let r = 0; r < gilt.length; r++) if (!regelErfuellt(gilt[r], platzVon, lage)) k += 1000;
      for (let s = 0; s < pos.length; s++) k += pos[s] === -1 ? 100 : P[pos[s]].rang;
      return k;
    };

    let beste = Infinity, besterPos = pos.slice();
    // Drei unabhängige Läufe, der beste gewinnt – ein einzelner Lauf bleibt
    // gelegentlich in einer fast guten Lösung hängen.
    for (let lauf = 0; lauf < 3; lauf++) {
      // Startbelegung: freie Plätze von vorne nach hinten (innerhalb einer Reihe
      // gemischt), die Beweglichen in zufälliger Reihenfolge darauf.
      beweglich.forEach((s) => { pos[s] = -1; });
      freiePlaetze.forEach((i) => { belegt[i] = -1; });
      const startPlaetze = mischen(freiePlaetze.slice()).sort((x, y) => P[x].rang - P[y].rang);
      mischen(beweglich.slice()).forEach((s, k) => {
        if (k < startPlaetze.length) { pos[s] = startPlaetze[k]; belegt[startPlaetze[k]] = s; }
      });

      let aktuell = kosten();
      if (aktuell < beste) { beste = aktuell; besterPos = pos.slice(); }
      if (!beweglich.length || !freiePlaetze.length) break;
      // Lokale Suche: ein Bewegliches auf einen anderen freien Platz setzen
      // (tauschen oder umziehen). Gleich gute Schritte werden angenommen, damit
      // das Ergebnis gemischt bleibt; schlechtere nur anfangs, um festgefahrene
      // Stellen zu verlassen.
      const schritte = 4000 + 400 * ids.length;
      for (let n = 0; n < schritte; n++) {
        const s = beweglich[zahl(beweglich.length)];
        const ziel = freiePlaetze[zahl(freiePlaetze.length)];
        const von = pos[s];
        if (von === ziel) continue;
        const t = belegt[ziel];
        pos[s] = ziel; belegt[ziel] = s;
        if (von !== -1) belegt[von] = t;
        if (t !== -1) pos[t] = von;
        const neu = kosten();
        // Abkühlen von 400 auf 0,04: Anfangs werden auch Regelverletzungen
        // in Kauf genommen, am Ende nur noch Verbesserungen (Feinschliff „vorne auffüllen“).
        const temperatur = 400 * Math.pow(0.0001, n / schritte);
        if (neu <= aktuell || zufall() < Math.exp((aktuell - neu) / temperatur)) {
          aktuell = neu;
          if (neu < beste) { beste = neu; besterPos = pos.slice(); }
        } else {
          // zurücknehmen
          pos[s] = von; belegt[ziel] = t;
          if (von !== -1) belegt[von] = s;
          if (t !== -1) pos[t] = ziel;
        }
      }
    }

    const belegung = {};
    const ohnePlatz = [];
    besterPos.forEach((i, s) => { if (i === -1) ohnePlatz.push(ids[s]); else belegung[P[i].id] = ids[s]; });
    for (let s = 0; s < pos.length; s++) pos[s] = besterPos[s];
    const verletzt = gilt.filter((r) => !regelErfuellt(r, platzVon, lage));
    return { belegung, verletzt, ohnePlatz };
  }

  Object.assign(global.Calc, {
    sitzplanGaenge, REGEL_TYPEN, mittlereSpalten, sitzplanLage,
    sitzplanRegelnPruefen, sitzplanVerteilen
  });
})(window);
