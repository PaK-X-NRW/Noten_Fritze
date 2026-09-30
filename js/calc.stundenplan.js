/* =========================================================================
   calc.stundenplan.js – Rechenhilfen für den Stundenplan (Wochenplan)
   - Wochen: Montag einer Woche, Tage verschieben, Kalenderwoche (ISO)
   - A/B-Wochen: stur im Wochenwechsel ab dem letzten Umschaltpunkt
   - Versionen: welcher Plan gilt an einem Datum (gueltigAb), Archiv
   - Einträge einer Woche bzw. einer Zelle (Tag × Block)
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
  // Eintrag einer Klasse zu einem Zeitpunkt (Tag + Stunde laut Stundenzeiten)
  // – für den Tracker (Raum vorbelegen, Doppelstunde erkennen).
  // Rückgabe: { eintrag, folgeGleich } oder null
  function eintragJetzt(versionen, abWochen, stundenzeiten, klasseId, jetzt) {
    const d = new Date(jetzt);
    const tag = d.getDay();
    if (tag < 1 || tag > 5) return null;
    const datum = Store.datumLokal(d);
    const gefunden = Calc.aktuelleStunde(stundenzeiten, jetzt);
    if (!gefunden) return null;
    const woche = eintraegeDerWoche(versionFuer(versionen, datum), abWoche(abWochen, datum));
    const hier = (blockId) => eintraegeDerZelle(woche, tag, blockId).find((e) => e.klasseId === klasseId) || null;
    const eintrag = hier(gefunden.stunde.id);
    if (!eintrag) return null;
    const stunden = (stundenzeiten || []).filter((b) => b.art === "stunde");
    const folge = stunden[gefunden.index + 1];
    return { eintrag, folgeGleich: !!(folge && hier(folge.id)) };
  }

  Object.assign(global.Calc, {
    datumPlusTage, montagVon, kalenderwoche,
    abWoche, abWocheSetzen,
    versionenSortiert, versionFuer, versionBis, versionArchiviert,
    eintraegeDerWoche, eintraegeDerZelle, eintragJetzt
  });
})(window);
