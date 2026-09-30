/* =========================================================================
   calc.stundenplan.js – Rechenhilfen für den Stundenplan (Wochenplan)
   - Wochen: Montag einer Woche, Tage verschieben, Kalenderwoche (ISO)
   - A/B-Wochen: stur im Wochenwechsel ab dem letzten Umschaltpunkt
   - Versionen: welcher Plan gilt an einem Datum (gueltigAb), Archiv
   - Einträge einer Woche bzw. einer Zelle (Tag × Block)
   - Kalender: tatsächlicher Tag (Ferien, Änderungen, Termine), Monatsraster,
     nächste Termine; Farbe je Klasse
   Erweitert den Namespace Calc (calc.js lädt davor). Frei von DOM/DB.
   ========================================================================= */
(function (global) {
  "use strict";

  const TAG_MS = 86400000;

  // "YYYY-MM-DD" -> lokales Date (Mitternacht)
  function datumZuDate(datum) {
    const p = String(datum || "").split("-");
    return new Date(parseInt(p[0], 10), (parseInt(p[1], 10) || 1) - 1, parseInt(p[2], 10) || 1);
  }
  function datumPlusTage(datum, tage) {
    const d = datumZuDate(datum);
    d.setDate(d.getDate() + tage);
    return Store.datumLokal(d);
  }
  // Montag der Woche eines Datums ("YYYY-MM-DD" oder Date)
  function montagVon(datum) {
    const d = datum instanceof Date ? new Date(datum.getFullYear(), datum.getMonth(), datum.getDate()) : datumZuDate(datum);
    const wt = (d.getDay() + 6) % 7; // 0 = Montag
    d.setDate(d.getDate() - wt);
    return Store.datumLokal(d);
  }
  // Ganze Wochen zwischen zwei Montagen (Sommerzeit-fest durch Runden)
  function wochenZwischen(vonMontag, bisMontag) {
    return Math.round((datumZuDate(bisMontag) - datumZuDate(vonMontag)) / (7 * TAG_MS));
  }
  // ISO-Kalenderwoche (die Woche mit dem ersten Donnerstag ist KW 1)
  function kalenderwoche(datum) {
    const d = datumZuDate(montagVon(datum));
    d.setDate(d.getDate() + 3); // Donnerstag dieser Woche – er bestimmt das Jahr
    const tage = Math.round((d - new Date(d.getFullYear(), 0, 1)) / TAG_MS);
    return Math.floor(tage / 7) + 1;
  }

  // ---- A/B-Wochen ------------------------------------------------------------
  // abWochen: [{ abMontag: "YYYY-MM-DD", woche: "A" | "B" }] – Umschaltpunkte.
  // Ab einem Umschaltpunkt wechseln die Wochen stur ab; ein späterer Punkt
  // rechnet ab seiner Woche neu, frühere Wochen bleiben unberührt. Vor dem
  // ersten Punkt wird rückwärts weitergezählt.
  // Rückgabe: "A" | "B" | null (keine A/B-Wochen eingerichtet)
  function abWoche(abWochen, datum) {
    const punkte = (abWochen || []).filter((p) => p && p.abMontag && (p.woche === "A" || p.woche === "B"))
      .slice().sort((a, b) => (a.abMontag < b.abMontag ? -1 : a.abMontag > b.abMontag ? 1 : 0));
    if (!punkte.length) return null;
    const montag = montagVon(datum);
    let anker = punkte[0];
    punkte.forEach((p) => { if (p.abMontag <= montag) anker = p; });
    const gerade = Math.abs(wochenZwischen(anker.abMontag, montag)) % 2 === 0;
    return gerade ? anker.woche : (anker.woche === "A" ? "B" : "A");
  }

  // Setzt die Woche eines Datums auf A oder B (ab dort wird neu gerechnet).
  // Ein Punkt an einem späteren Montag bleibt bestehen. Rückgabe: neue Liste.
  function abWocheSetzen(abWochen, datum, woche) {
    const montag = montagVon(datum);
    const liste = (abWochen || []).filter((p) => p && p.abMontag !== montag);
    if (abWoche(liste, montag) !== woche) liste.push({ abMontag: montag, woche });
    return liste.sort((a, b) => (a.abMontag < b.abMontag ? -1 : 1));
  }

  // ---- Versionen ---------------------------------------------------------------
  // versionen: [{ id, gueltigAb: "YYYY-MM-DD" | null, eintraege }]. null = gilt
  // von Anfang an (der erste Plan). Gültig an einem Datum ist die Version mit
  // dem spätesten gueltigAb, das nicht nach dem Datum liegt.
  function versionenSortiert(versionen) {
    return (versionen || []).slice().sort((a, b) => {
      const x = a.gueltigAb || "", y = b.gueltigAb || "";
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }
  function versionFuer(versionen, datum) {
    let treffer = null;
    versionenSortiert(versionen).forEach((v) => { if (!v.gueltigAb || v.gueltigAb <= datum) treffer = v; });
    return treffer;
  }
  // Letzter Tag einer Version (Tag vor der nächsten) oder null (offen)
  function versionBis(versionen, version) {
    const liste = versionenSortiert(versionen);
    const i = liste.findIndex((v) => v.id === version.id);
    const naechste = liste[i + 1];
    return naechste && naechste.gueltigAb ? datumPlusTage(naechste.gueltigAb, -1) : null;
  }
  // Archiviert (nur lesbar) ist jede Version, die vor der heute gültigen liegt.
  function versionArchiviert(versionen, version, heute) {
    const aktuell = versionFuer(versionen, heute);
    if (!aktuell || aktuell.id === version.id) return false;
    return (version.gueltigAb || "") < (aktuell.gueltigAb || "");
  }

  // ---- Einträge ------------------------------------------------------------------
  // Eintrag: { id, tag: 1..5, blockId, woche: "alle" | "A" | "B",
  //            klasseId | null, titel, sitzplanId | null }
  // Einträge, die in einer Woche gelten (woche = "A" | "B" | null).
  function eintraegeDerWoche(version, woche) {
    return ((version && version.eintraege) || []).filter((e) =>
      e.woche === "A" || e.woche === "B" ? e.woche === woche : true);
  }
  function eintraegeDerZelle(eintraege, tag, blockId) {
    return (eintraege || []).filter((e) => e.tag === tag && e.blockId === blockId);
  }
  // ---- Kalender: der tatsächliche Tag -------------------------------------------
  // termine: Datensätze des Stores „termine“:
  //   Termin:    { art, titel, datum, blockId | null (ganztägig), klasseId | null }
  //   Ferien:    { art: "ferien", titel, datum, bis }  – freie Tage, von–bis
  //   Änderung:  { art: "aenderung", aenderung: "ausfall" | "verschoben" | "hinweis",
  //                datum, blockId, klasseId | titel, notiz, nachDatum, nachBlockId }
  // Eine Änderung meint die Stunde über Datum + Block + Klasse (bzw. Freitext),
  // nicht über die ID des Plan-Eintrags – so überlebt sie einen neuen Plan.
  function ferienAm(termine, datum) {
    return (termine || []).find((t) => t.art === "ferien" && t.datum <= datum && (t.bis || t.datum) >= datum) || null;
  }
  function gleicheStunde(a, e) {
    return e.klasseId ? a.klasseId === e.klasseId : (!a.klasseId && a.titel === e.titel);
  }

  // Tatsächlicher Plan eines Tages: Plan-Einträge (A/B-Woche beachtet), ohne
  // Unterricht an Ferientagen, mit Änderungen (Ausfall, Verschiebung, Hinweis),
  // hierher verschobenen Stunden und Terminen.
  // Rückgabe: { datum, tag, frei, ganztags: [termin], zellen: { blockId: [item] } }
  //   item: { typ: "stunde", klasseId, titel, sitzplanId, woche,
  //           aenderung (Datensatz oder null), verschobenVon (Änderung oder null) }
  //       | { typ: "termin", termin }
  function tagesPlan(versionen, abWochen, termine, datum) {
    const wt = datumZuDate(datum).getDay();
    const tag = wt >= 1 && wt <= 5 ? wt : 0;
    const frei = ferienAm(termine, datum);
    const zellen = {};
    const rein = (blockId, item) => { (zellen[blockId] = zellen[blockId] || []).push(item); };
    const aenderungen = (termine || []).filter((t) => t.art === "aenderung");
    if (tag && !frei) {
      eintraegeDerWoche(versionFuer(versionen, datum), abWoche(abWochen, datum))
        .filter((e) => e.tag === tag)
        .forEach((e) => {
          const a = aenderungen.find((x) => x.datum === datum && x.blockId === e.blockId && gleicheStunde(x, e)) || null;
          rein(e.blockId, { typ: "stunde", klasseId: e.klasseId || null, titel: e.titel || "",
            sitzplanId: e.sitzplanId || null, woche: e.woche, aenderung: a, verschobenVon: null });
        });
    }
    // Hierher verschobene Stunden (Raum aus dem Plan-Eintrag am alten Platz)
    aenderungen.filter((a) => a.aenderung === "verschoben" && a.nachDatum === datum).forEach((a) => {
      const herTag = datumZuDate(a.datum).getDay();
      const alt = eintraegeDerWoche(versionFuer(versionen, a.datum), abWoche(abWochen, a.datum))
        .find((e) => e.tag === herTag && e.blockId === a.blockId && gleicheStunde(a, e));
      rein(a.nachBlockId, { typ: "stunde", klasseId: a.klasseId || null, titel: a.titel || "",
        sitzplanId: alt ? alt.sitzplanId || null : null, woche: "alle", aenderung: null, verschobenVon: a });
    });
    const ganztags = [];
    (termine || []).forEach((t) => {
      if (t.art === "ferien" || t.art === "aenderung" || t.datum !== datum) return;
      if (t.blockId) rein(t.blockId, { typ: "termin", termin: t });
      else ganztags.push(t);
    });
    return { datum, tag, frei, ganztags, zellen };
  }

  // Stunden einer Zelle, die an diesem Tag wirklich stattfinden (nicht
  // ausgefallen, nicht weggeschoben)
  function stundenFinden(plan, blockId) {
    return (plan.zellen[blockId] || []).filter((i) => i.typ === "stunde" &&
      !(i.aenderung && (i.aenderung.aenderung === "ausfall" || i.aenderung.aenderung === "verschoben")));
  }

  // Eintrag einer Klasse zu einem Zeitpunkt (tatsächlicher Tag laut Plan,
  // Ferien und Änderungen) – für den Tracker (Raum vorbelegen, Doppelstunde).
  // Rückgabe: { eintrag, folgeGleich } oder null
  function eintragJetzt(versionen, abWochen, termine, stundenzeiten, klasseId, jetzt) {
    const gefunden = Calc.aktuelleStunde(stundenzeiten, jetzt);
    if (!gefunden) return null;
    const plan = tagesPlan(versionen, abWochen, termine, Store.datumLokal(new Date(jetzt)));
    const hier = (blockId) => stundenFinden(plan, blockId).find((i) => i.klasseId === klasseId) || null;
    const eintrag = hier(gefunden.stunde.id);
    if (!eintrag) return null;
    const stunden = (stundenzeiten || []).filter((b) => b.art === "stunde");
    const folge = stunden[gefunden.index + 1];
    return { eintrag, folgeGleich: !!(folge && hier(folge.id)) };
  }

  // Monatsraster: Wochen (Mo–So) als Listen von Daten, die den Monat abdecken.
  //   monat: "YYYY-MM"
  function monatsRaster(monat) {
    const erster = monat + "-01";
    const d = datumZuDate(erster);
    const letzter = Store.datumLokal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const wochen = [];
    for (let m = montagVon(erster); m <= letzter; m = datumPlusTage(m, 7)) {
      const w = [];
      for (let i = 0; i < 7; i++) w.push(datumPlusTage(m, i));
      wochen.push(w);
    }
    return wochen;
  }

  // Termine (ohne Änderungen) von datum an für `tage` Tage, sortiert; Ferien,
  // die in den Zeitraum hineinreichen, zählen mit.
  function naechsteTermine(termine, datum, tage) {
    const bis = datumPlusTage(datum, tage);
    return (termine || []).filter((t) => t.art !== "aenderung" &&
      (t.art === "ferien" ? (t.bis || t.datum) >= datum && t.datum <= bis : t.datum >= datum && t.datum <= bis))
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  }

  // ---- Farbe je Klasse ---------------------------------------------------------
  const KLASSEN_FARBEN = ["#cfe8d5", "#d6e4f5", "#f7dcc4", "#eed6f0", "#f5d0d3", "#fbeeb8",
    "#cdeceb", "#e3e0f7", "#e9e2d0", "#d9ead0", "#f3d6e6", "#d5dde3"];
  // Gewählte Farbe, sonst eine feste aus der Palette (aus der ID berechnet)
  function klassenFarbe(klasse) {
    if (!klasse) return KLASSEN_FARBEN[KLASSEN_FARBEN.length - 1];
    if (klasse.farbe) return klasse.farbe;
    const s = String(klasse.id || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return KLASSEN_FARBEN[h % KLASSEN_FARBEN.length];
  }
  // Erste Farbe der Palette, die noch keine Klasse trägt (sonst reihum)
  function freieKlassenFarbe(klassen) {
    const belegt = (klassen || []).map(klassenFarbe);
    return KLASSEN_FARBEN.find((f) => belegt.indexOf(f) === -1) ||
      KLASSEN_FARBEN[(klassen || []).length % KLASSEN_FARBEN.length];
  }

  Object.assign(global.Calc, {
    datumPlusTage, montagVon, kalenderwoche,
    abWoche, abWocheSetzen,
    versionenSortiert, versionFuer, versionBis, versionArchiviert,
    eintraegeDerWoche, eintraegeDerZelle, eintragJetzt,
    ferienAm, tagesPlan, stundenFinden, monatsRaster, naechsteTermine,
    KLASSEN_FARBEN, klassenFarbe, freieKlassenFarbe
  });
})(window);
