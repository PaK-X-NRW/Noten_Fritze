/* =========================================================================
   store.transfer.js – Export und Import
   Erweitert den Store-Namespace um das Gesamt-Backup (exportAll/importAll,
   alle Klassen als JSON) und den Export/Import einer einzelnen Klasse
   (exportKlasse/importKlasse, z. B. zur Übergabe an Kolleg/innen).
   Beide leiten bei Dateien aus älteren Versionen die Spalten (Leistungen)
   aus den Noten ab.
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    uid, Klassen, getSettings, saveSettings,
    normalisiereSchuelerHeat, leistungenAusNoten
  } = global.Store;

  // ---- Backup (Gesamt-Export/Import als JSON) ------------------------------
  async function exportAll() {
    const [klassen, schueler, kategorien, leistungen, noten, sitzplaene, ereignisse, abwesenheiten, stunden, settings] = await Promise.all([
      DB.getAll("klassen"), DB.getAll("schueler"), DB.getAll("kategorien"),
      DB.getAll("leistungen"),
      DB.getAll("noten"), DB.getAll("sitzplaene"), DB.getAll("ereignisse"),
      DB.getAll("abwesenheiten"), DB.getAll("stunden"), getSettings()
    ]);
    return {
      app: "noten-fritze", appVersion: APP_VERSION,
      schemaVersion: DB.DB_VERSION, exportedAt: new Date().toISOString(),
      data: { klassen, schueler, kategorien, leistungen, noten, sitzplaene, ereignisse, abwesenheiten, stunden, settings }
    };
  }
  async function importAll(backup, { replace }) {
    if (!backup || !backup.data) throw new Error("Ungültiges Backup-Format.");
    if (replace) await DB.clearAll();
    const d = backup.data;
    await DB.bulkPut("klassen", d.klassen || []);
    const settings = await getSettings();
    await DB.bulkPut("schueler", (d.schueler || []).map((s) => normalisiereSchuelerHeat(s, settings)));
    await DB.bulkPut("kategorien", d.kategorien || []);
    // Backup aus einer älteren Version: Spalten aus den Noten ableiten
    const noten = (d.noten || []).map((n) => Object.assign({}, n));
    const leistungen = (d.leistungen || []).slice();
    if (!leistungen.length && noten.some((n) => !n.leistungId)) {
      leistungenAusNoten(noten).forEach((l) => leistungen.push(l));
    }
    await DB.bulkPut("leistungen", leistungen);
    await DB.bulkPut("noten", noten);
    await DB.bulkPut("sitzplaene", d.sitzplaene || []);
    await DB.bulkPut("ereignisse", d.ereignisse || []);
    await DB.bulkPut("abwesenheiten", d.abwesenheiten || []);
    await DB.bulkPut("stunden", d.stunden || []);
    if (d.settings) await saveSettings(d.settings);
  }

  // ---- Klassen-Export/-Import (einzelne Klasse als JSON) -------------------
  // Alle Datensätze einer Klasse (z. B. zur Übergabe an Kolleg/innen).
  async function exportKlasse(klasseId) {
    const [klasse, schueler, kategorien, leistungen, noten, ereignisse, stunden, abwesenheiten, sitzplan] = await Promise.all([
      Klassen.get(klasseId),
      DB.getAllByIndex("schueler", "klasseId", klasseId),
      DB.getAllByIndex("kategorien", "klasseId", klasseId),
      DB.getAllByIndex("leistungen", "klasseId", klasseId),
      DB.getAllByIndex("noten", "klasseId", klasseId),
      DB.getAllByIndex("ereignisse", "klasseId", klasseId),
      DB.getAllByIndex("stunden", "klasseId", klasseId),
      DB.getAllByIndex("abwesenheiten", "klasseId", klasseId),
      DB.get("sitzplaene", klasseId)
    ]);
    return {
      app: "noten-fritze-klasse", appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        klasse, schueler, kategorien, leistungen, noten, ereignisse, stunden, abwesenheiten,
        sitzplan: sitzplan || null
      }
    };
  }
  // modus "ersetzen": vorhandene Klasse mit gleicher ID kaskadierend löschen,
  //   dann die Datensätze unverändert einfügen (ID unbekannt -> einfach importieren).
  // modus "kopie":   alle IDs neu vergeben und Referenzen ummappen,
  //   Name wird um „ (Kopie)" ergänzt.
  // Rückgabe: die importierte Klasse.
  async function importKlasse(payload, { modus }) {
    if (!payload || payload.app !== "noten-fritze-klasse" || !payload.data || !payload.data.klasse) {
      throw new Error("Ungültiges Klassen-Export-Format.");
    }
    const d = payload.data;
    let klasse = d.klasse;
    let schueler = d.schueler || [];
    let kategorien = d.kategorien || [];
    let leistungen = d.leistungen || [];
    let noten = d.noten || [];
    let ereignisse = d.ereignisse || [];
    let stunden = d.stunden || [];
    let abwesenheiten = d.abwesenheiten || [];
    let sitzplan = d.sitzplan || null;

    // Export aus einer älteren Version (vor dem Spaltenmodell): Spalten aus
    // den Noten ableiten, sonst wären sie in der Notenübersicht unsichtbar.
    if (!leistungen.length && noten.some((n) => !n.leistungId)) {
      noten = noten.map((n) => Object.assign({}, n));
      leistungen = leistungenAusNoten(noten);
    }

    if (modus === "kopie") {
      const klasseIdNeu = uid();
      const schuelerMap = {}, kategorienMap = {}, stundenMap = {}, leistungenMap = {};
      schueler.forEach((s) => { schuelerMap[s.id] = uid(); });
      kategorien.forEach((c) => { kategorienMap[c.id] = uid(); });
      stunden.forEach((st) => { stundenMap[st.id] = uid(); });
      leistungen.forEach((l) => { leistungenMap[l.id] = uid(); });
      klasse = Object.assign({}, klasse, { id: klasseIdNeu, name: (klasse.name || "") + " (Kopie)" });
      schueler = schueler.map((s) => Object.assign({}, s, { id: schuelerMap[s.id], klasseId: klasseIdNeu }));
      kategorien = kategorien.map((c) => Object.assign({}, c, { id: kategorienMap[c.id], klasseId: klasseIdNeu }));
      leistungen = leistungen.map((l) => Object.assign({}, l, {
        id: leistungenMap[l.id], klasseId: klasseIdNeu,
        kategorieId: kategorienMap[l.kategorieId] || l.kategorieId
      }));
      noten = noten.map((n) => Object.assign({}, n, {
        id: uid(), klasseId: klasseIdNeu,
        schuelerId: schuelerMap[n.schuelerId] || n.schuelerId,
        kategorieId: kategorienMap[n.kategorieId] || n.kategorieId,
        leistungId: leistungenMap[n.leistungId] || n.leistungId
      }));
      ereignisse = ereignisse.map((e) => Object.assign({}, e, {
        id: uid(), klasseId: klasseIdNeu,
        schuelerId: schuelerMap[e.schuelerId] || e.schuelerId,
        stundeId: stundenMap[e.stundeId] || e.stundeId
      }));
      stunden = stunden.map((st) => Object.assign({}, st, { id: stundenMap[st.id], klasseId: klasseIdNeu }));
      abwesenheiten = abwesenheiten.map((a) => {
        const sid = schuelerMap[a.schuelerId] || a.schuelerId;
        return Object.assign({}, a, { id: sid + "_" + a.datum, klasseId: klasseIdNeu, schuelerId: sid });
      });
      if (sitzplan) {
        sitzplan = Object.assign({}, sitzplan, {
          klasseId: klasseIdNeu,
          seats: (sitzplan.seats || []).map((seat) => Object.assign({}, seat, {
            schuelerId: seat.schuelerId ? (schuelerMap[seat.schuelerId] || null) : null
          }))
        });
      }
    } else if (modus === "ersetzen") {
      if (await Klassen.get(klasse.id)) await Klassen.remove(klasse.id); // Kaskade
    }

    const settings = await getSettings();
    await Klassen.save(klasse);
    await DB.bulkPut("schueler", schueler.map((s) => normalisiereSchuelerHeat(s, settings)));
    await DB.bulkPut("kategorien", kategorien);
    await DB.bulkPut("leistungen", leistungen);
    await DB.bulkPut("noten", noten);
    await DB.bulkPut("ereignisse", ereignisse);
    await DB.bulkPut("stunden", stunden);
    await DB.bulkPut("abwesenheiten", abwesenheiten);
    if (sitzplan) await DB.put("sitzplaene", sitzplan);
    return klasse;
  }

  Object.assign(global.Store, { exportAll, importAll, exportKlasse, importKlasse });
})(window);
