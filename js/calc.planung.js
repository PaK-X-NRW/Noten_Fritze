/* =========================================================================
   calc.planung.js – Rechenhilfen für die Stundenplanung (Fahrplan)
   - Einheit: aufeinanderfolgende Stunden derselben Klasse an einem Tag
     (Einzel-, Doppel-, Dreifachstunde) – sie teilen sich einen Fahrplan
   - Fahrplan <-> Planungen je Stunde: die Liste der Bausteine mit Trennern
     („— 2. Stunde —“) wird beim Speichern je Stunde aufgeteilt
   - Minuten: verplante Zeit je Stunde und gesamt
   - vorige Stunde einer Klasse (Hausaufgabe von letzter Stunde)
   - Umzug von Planungen (Stunde verschoben/getauscht/zurück)
   Erweitert den Namespace Calc (calc.js lädt davor). Frei von DOM/DB.
   ========================================================================= */
(function (global) {
  "use strict";

  // Phasen-Vorschläge für Bausteine (frei ergänzbar)
  const PHASEN = ["Einstieg", "Erarbeitung", "Sicherung", "Übung", "Hausaufgabe", "Puffer"];

  function nurStunden(stundenzeiten) {
    return (stundenzeiten || []).filter((b) => b.art === "stunde");
  }
  function dauerMin(block) {
    return Store.hhmmZuMinuten(block.ende) - Store.hhmmZuMinuten(block.start);
  }

  // Findet in einer Zelle des Tagesplans die Stunde der Klasse, die dort
  // (noch) liegt – auch ausgefallen, aber nicht weggeschoben.
  function stundeDerKlasse(plan, blockId, klasseId) {
    return ((plan.zellen[blockId]) || []).find((i) => i.typ === "stunde" && i.klasseId === klasseId &&
      !(i.aenderung && i.aenderung.aenderung === "verschoben")) || null;
  }

  // Einheit um eine Stunde: alle direkt aufeinanderfolgenden Stunden derselben
  // Klasse an diesem Tag. Rückgabe: Liste von Stunden-Blöcken (leer, wenn
  // blockId keine Stunde ist).
  function einheitBestimmen(plan, stundenzeiten, klasseId, blockId) {
    const stunden = nurStunden(stundenzeiten);
    const i = stunden.findIndex((b) => b.id === blockId);
    if (i < 0) return [];
    const hat = (b) => !!stundeDerKlasse(plan, b.id, klasseId);
    if (!hat(stunden[i])) return [stunden[i]];
    let a = i, e = i;
    while (a > 0 && hat(stunden[a - 1])) a--;
    while (e + 1 < stunden.length && hat(stunden[e + 1])) e++;
    return stunden.slice(a, e + 1);
  }

  // Fahrplan einer Einheit: Bausteine der Stunden hintereinander, zwischen
  // den Stunden ein Trenner { typ: "trenner", blockId }.
  //   planungen: Datensätze { blockId, bausteine } der Einheit (beliebige Reihenfolge)
  function fahrplanAusPlanungen(einheit, planungen) {
    const liste = [];
    einheit.forEach((b, k) => {
      if (k > 0) liste.push({ typ: "trenner", id: "trenner-" + b.id, blockId: b.id });
      const p = (planungen || []).find((x) => x.blockId === b.id);
      ((p && p.bausteine) || []).forEach((x) => liste.push(x));
    });
    return liste;
  }
  // Umkehrung: Bausteine je Stunde der Einheit { blockId: [bausteine] }.
  // Ein Trenner schaltet auf seine Stunde um; fehlt einer, bleiben die
  // Bausteine bei der vorherigen Stunde.
  function fahrplanAufteilen(einheit, liste) {
    const out = {};
    einheit.forEach((b) => { out[b.id] = []; });
    let aktuell = einheit.length ? einheit[0].id : null;
    (liste || []).forEach((x) => {
      if (x.typ === "trenner") { if (out[x.blockId]) aktuell = x.blockId; return; }
      if (aktuell) out[aktuell].push(x);
    });
    return out;
  }

  // Verplante Minuten: je Stunde und gesamt, dazu die Dauer laut Stundenzeiten.
  // Rückgabe: { gesamt, dauer, jeStunde: { blockId: { minuten, dauer } } }
  function minutenSumme(einheit, liste) {
    const teile = fahrplanAufteilen(einheit, liste);
    const jeStunde = {};
    let gesamt = 0, dauer = 0;
    einheit.forEach((b) => {
      const m = teile[b.id].reduce((n, x) => n + (parseInt(x.minuten, 10) || 0), 0);
      jeStunde[b.id] = { minuten: m, dauer: dauerMin(b) };
      gesamt += m; dauer += dauerMin(b);
    });
    return { gesamt, dauer, jeStunde };
  }

  // Letzte Stunde der Klasse vor dem Beginn einer Einheit (tatsächlicher Tag:
  // Ferien, Ausfall, Verschiebung beachtet). Sucht höchstens maxTage zurück.
  // Rückgabe: { datum, blockId } oder null
  function vorherigeStunde(versionen, abWochen, termine, stundenzeiten, klasseId, datum, blockId, maxTage) {
    const stunden = nurStunden(stundenzeiten);
    const start = stunden.findIndex((b) => b.id === blockId);
    for (let t = 0; t <= (maxTage || 90); t++) {
      const d = Calc.datumPlusTage(datum, -t);
      const plan = Calc.tagesPlan(versionen, abWochen, termine, d);
      for (let i = (t === 0 ? start : stunden.length) - 1; i >= 0; i--) {
        if (Calc.stundenFinden(plan, stunden[i].id).some((x) => x.klasseId === klasseId)) {
          return { datum: d, blockId: stunden[i].id };
        }
      }
    }
    return null;
  }

  // Umzug von Planungen: zuege [{ klasseId, von: {datum, blockId}, nach: {datum, blockId} }]
  // gelten gleichzeitig (Tausch!). Treffen zwei Planungen auf denselben Platz,
  // werden ihre Bausteine zusammengelegt.
  //   planungen: Datensätze { id, klasseId, datum, blockId, thema, bausteine }
  // Rückgabe: { put: [Datensätze], del: [ids] }
  function planungenUmziehen(planungen, zuege) {
    const key = (k, d, b) => k + "|" + d + "|" + b;
    const ziel = {};
    (zuege || []).forEach((z) => { ziel[key(z.klasseId, z.von.datum, z.von.blockId)] = z.nach; });
    const neu = {}, put = [], del = [];
    const bewegt = (planungen || []).filter((p) => ziel[key(p.klasseId, p.datum, p.blockId)]);
    const ids = bewegt.map((p) => p.id);
    // Wer nicht bewegt wird, bleibt an seinem Platz (Kollisionen mit ihm zählen)
    (planungen || []).forEach((p) => { if (ids.indexOf(p.id) === -1) neu[key(p.klasseId, p.datum, p.blockId)] = p; });
    bewegt.forEach((p) => {
      const n = ziel[key(p.klasseId, p.datum, p.blockId)];
      const k = key(p.klasseId, n.datum, n.blockId);
      const q = Object.assign({}, p, { datum: n.datum, blockId: n.blockId });
      if (neu[k]) {
        // Kopie, damit die übergebenen Datensätze unverändert bleiben
        const vorhanden = put.indexOf(neu[k]) !== -1 ? neu[k] : Object.assign({}, neu[k]);
        neu[k] = vorhanden;
        vorhanden.bausteine = (vorhanden.bausteine || []).concat(q.bausteine || []);
        if (!vorhanden.thema) vorhanden.thema = q.thema;
        if (put.indexOf(vorhanden) === -1) put.push(vorhanden);
        del.push(p.id);
      } else {
        neu[k] = q;
        put.push(q);
      }
    });
    return { put, del };
  }

  // ---- Weiterschieben bei Ausfall ----------------------------------------------------
  // Reihe der Stunden einer Klasse, die von–bis tatsächlich stattfinden
  // (Plan, A/B-Wochen, Ferien, Änderungen). Rückgabe: [{ datum, blockId, i }]
  // (i = Position der Stunde am Tag, für das Bilden von Einheiten)
  function stundenReihe(versionen, abWochen, termine, stundenzeiten, klasseId, von, bis) {
    const stunden = nurStunden(stundenzeiten);
    const out = [];
    for (let d = von; d <= bis; d = Calc.datumPlusTage(d, 1)) {
      const plan = Calc.tagesPlan(versionen, abWochen, termine, d);
      stunden.forEach((b, i) => {
        if (Calc.stundenFinden(plan, b.id).some((x) => x.klasseId === klasseId)) out.push({ datum: d, blockId: b.id, i });
      });
    }
    return out;
  }
  // Einheiten: direkt aufeinanderfolgende Stunden eines Tages (Doppelstunde = 2)
  function einheitenAus(reihe) {
    const out = [];
    reihe.forEach((h) => {
      const letzte = out[out.length - 1];
      const vor = letzte && letzte[letzte.length - 1];
      if (vor && vor.datum === h.datum && vor.i + 1 === h.i) letzte.push(h);
      else out.push([h]);
    });
    return out;
  }

  // Wohin wandern die Planungen einer Klasse, wenn Stunden ausfallen (oder ein
  // Ausfall aufgehoben wird)? Verglichen wird die Reihe der Stunden vorher und
  // nachher (Termine mit bzw. ohne die Ausfälle): Der Inhalt der i-ten Stunde
  // von vorher kommt auf die i-te Stunde von nachher.
  //   modus "stunde":  Stunde für Stunde (Doppelstunden können auseinandergehen)
  //   modus "einheit": je Einheitengröße getrennt – Doppelstunden-Inhalte nur in
  //                    Doppelstunden, Einzelstunden-Inhalte nur in Einzelstunden
  // Rückgabe: Züge für Calc.planungenUmziehen (nur echte Ortswechsel)
  function weiterschiebenZuege(versionen, abWochen, vorher, nachher, stundenzeiten, klasseId, von, bis, modus) {
    const alt = stundenReihe(versionen, abWochen, vorher, stundenzeiten, klasseId, von, bis);
    const neu = stundenReihe(versionen, abWochen, nachher, stundenzeiten, klasseId, von, bis);
    const paare = [];
    if (modus === "einheit") {
      const ae = einheitenAus(alt), ne = einheitenAus(neu);
      const groessen = ae.map((u) => u.length).filter((g, i, a) => a.indexOf(g) === i);
      groessen.forEach((g) => {
        const an = ne.filter((u) => u.length === g);
        ae.filter((u) => u.length === g).forEach((u, k) => {
          if (an[k]) u.forEach((h, j) => paare.push([h, an[k][j]]));
        });
      });
    } else {
      alt.forEach((h, k) => { if (neu[k]) paare.push([h, neu[k]]); });
    }
    return paare
      .filter((p) => p[0].datum !== p[1].datum || p[0].blockId !== p[1].blockId)
      .map((p) => ({ klasseId, von: { datum: p[0].datum, blockId: p[0].blockId }, nach: { datum: p[1].datum, blockId: p[1].blockId } }));
  }

  Object.assign(global.Calc, {
    PHASEN, einheitBestimmen, fahrplanAusPlanungen, fahrplanAufteilen, minutenSumme,
    vorherigeStunde, planungenUmziehen, stundenReihe, weiterschiebenZuege
  });
})(window);
