/* =========================================================================
   store.transfer.js – Export und Import
   Erweitert den Store-Namespace um das Gesamt-Backup (exportAll/importAll,
   alle Klassen als JSON) und den Export/Import einer einzelnen Klasse
   (exportKlasse/importKlasse, z. B. zur Übergabe an Kolleg/innen).
   Beide leiten bei Dateien aus älteren Versionen die Spalten (Leistungen)
   aus den Noten ab, prüfen die Datei vor dem Schreiben und schreiben in
   einer einzigen Transaktion (alles oder nichts).
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    uid, now, Klassen, getSettings, klassenAbhaengige, kaskade,
    normalisiereSchuelerHeat, leistungenAusNoten, sitzplaeneNormalisieren,
    SCHEMA_VERSION, migrateSchema
  } = global.Store;

  // Datensatz-Listen eines Backups und ihr Schlüsselfeld
  const DATEN_STORES = {
    klassen: "id", schueler: "id", kategorien: "id", leistungen: "id", noten: "id",
    sitzplaene: "klasseId", ereignisse: "id", abwesenheiten: "id", stunden: "id",
    stundenplaene: "id", wochennotizen: "montag"
  };
  // Prüft eine Liste aus einer Import-Datei, bevor irgendetwas geschrieben
  // wird: fehlt sie, ist sie leer; ist sie kaputt, bricht der Import ab.
  function pruefeListe(d, name, schluessel, was) {
    const liste = d[name];
    if (liste === undefined || liste === null) return [];
    if (!Array.isArray(liste)) throw new Error(was + " ist beschädigt: „" + name + "“ ist keine Liste.");
    liste.forEach((x) => {
      if (!x || typeof x !== "object" || x[schluessel] === undefined || x[schluessel] === null) {
        throw new Error(was + " ist beschädigt: „" + name + "“ enthält einen Eintrag ohne Kennung.");
      }
    });
    return liste;
  }

  // ---- Backup (Gesamt-Export/Import als JSON) ------------------------------
  async function exportAll() {
    const [klassen, schueler, kategorien, leistungen, noten, sitzplaene, ereignisse, abwesenheiten, stunden,
      stundenplaene, wochennotizen, settings] = await Promise.all([
      DB.getAll("klassen"), DB.getAll("schueler"), DB.getAll("kategorien"),
      DB.getAll("leistungen"),
      DB.getAll("noten"), DB.getAll("sitzplaene"), DB.getAll("ereignisse"),
      DB.getAll("abwesenheiten"), DB.getAll("stunden"),
      DB.getAll("stundenplaene"), DB.getAll("wochennotizen"), getSettings()
    ]);
    return {
      app: "noten-fritze", appVersion: APP_VERSION,
      // dbVersion = Struktur der Datenbank, schemaVersion = Form der Datensätze.
      // (Ältere Backups trugen hier fälschlich die dbVersion; beim Import zählt
      // deshalb die schemaVersion in den Einstellungen.)
      dbVersion: DB.DB_VERSION, schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: { klassen, schueler, kategorien, leistungen, noten, sitzplaene, ereignisse, abwesenheiten, stunden,
        stundenplaene, wochennotizen, settings }
    };
  }

  // Spielt ein Backup ein. Ablauf: erst die ganze Datei prüfen, dann alles in
  // EINER Transaktion schreiben (bei replace vorher leeren) – bricht etwas ab,
  // bleibt der bisherige Datenstand vollständig erhalten. Danach werden die
  // Daten sofort auf den aktuellen Stand migriert (ältere Backups).
  async function importAll(backup, { replace }) {
    if (!backup || !backup.data || typeof backup.data !== "object") throw new Error("Ungültiges Backup-Format.");
    const d = backup.data;
    const was = "Das Backup";
    const daten = {};
    Object.keys(DATEN_STORES).forEach((name) => { daten[name] = pruefeListe(d, name, DATEN_STORES[name], was); });
    const backupSettings = d.settings && typeof d.settings === "object" ? d.settings : null;
    // Datenform des Backups; fehlt sie, laufen alle Migrationen (sie sind wiederholbar).
    const version = parseInt(backupSettings && backupSettings.schemaVersion, 10) || 1;
    if (version > SCHEMA_VERSION) {
      throw new Error("Dieses Backup stammt aus einer neueren Version von Noten-Fritze. " +
        "Bitte zuerst die App aktualisieren (Seite neu laden) und dann erneut importieren.");
    }

    const settingsAktuell = await getSettings();
    daten.schueler = daten.schueler.map((s) => normalisiereSchuelerHeat(Object.assign({}, s), settingsAktuell));
    // Backup aus einer älteren Version: Spalten aus den Noten ableiten
    daten.noten = daten.noten.map((n) => Object.assign({}, n));
    if (!daten.leistungen.length && daten.noten.some((n) => !n.leistungId)) {
      daten.leistungen = leistungenAusNoten(daten.noten);
    }
    // Einstellungen aus dem Backup, sonst die bisherigen – jeweils mit der
    // Datenform des Backups, damit die Migration danach weiß, wo sie anfängt.
    const settings = Object.assign({}, backupSettings || settingsAktuell, { key: "app", schemaVersion: version });

    const stores = Object.keys(DATEN_STORES).concat("einstellungen");
    await DB.atomar(stores, (os) => {
      if (replace) stores.forEach((name) => os(name).clear());
      Object.keys(DATEN_STORES).forEach((name) => daten[name].forEach((x) => os(name).put(x)));
      os("einstellungen").put(settings);
    });
    await migrateSchema();
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
  //   Beides passiert in einer Transaktion: Bricht der Import ab, bleibt die
  //   vorhandene Klasse unverändert.
  // modus "kopie":   alle IDs neu vergeben und Referenzen ummappen,
  //   Name wird um „ (Kopie)" ergänzt.
  // Rückgabe: die importierte Klasse.
  async function importKlasse(payload, { modus }) {
    if (!payload || payload.app !== "noten-fritze-klasse" || !payload.data || !payload.data.klasse) {
      throw new Error("Ungültiges Klassen-Export-Format.");
    }
    const d = payload.data;
    const was = "Der Klassen-Export";
    if (!d.klasse.id) throw new Error(was + " ist beschädigt: Die Klasse hat keine Kennung.");
    let klasse = d.klasse;
    let schueler = pruefeListe(d, "schueler", "id", was);
    let kategorien = pruefeListe(d, "kategorien", "id", was);
    let leistungen = pruefeListe(d, "leistungen", "id", was);
    let noten = pruefeListe(d, "noten", "id", was);
    let ereignisse = pruefeListe(d, "ereignisse", "id", was);
    let stunden = pruefeListe(d, "stunden", "id", was);
    let abwesenheiten = pruefeListe(d, "abwesenheiten", "id", was);
    // Ältere Exporte enthalten nur einen Sitzplan – er wird zum Plan „Klassenraum".
    let sitzplan = sitzplaeneNormalisieren(d.sitzplan || null);

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
          plaene: sitzplan.plaene.map((p) => Object.assign({}, p, {
            klasseId: klasseIdNeu,
            seats: (p.seats || []).map((seat) => Object.assign({}, seat, {
              schuelerId: seat.schuelerId ? (schuelerMap[seat.schuelerId] || null) : null
            }))
          })),
          // Plan-IDs bleiben gleich, deshalb gelten feste Plätze (planId) weiter
          regeln: (sitzplan.regeln || []).filter((r) => schuelerMap[r.a] && (!r.b || schuelerMap[r.b]))
            .map((r) => Object.assign({}, r, { id: uid(), a: schuelerMap[r.a], b: r.b ? schuelerMap[r.b] : r.b }))
        });
      }
    }
    // „ersetzen": Die vorhandene Klasse samt Daten wird in derselben
    // Transaktion gelöscht, in der die neuen Daten geschrieben werden.
    const ersetzen = modus !== "kopie" && !!(await Klassen.get(klasse.id));

    const settings = await getSettings();
    klasse = Object.assign({}, klasse, { updatedAt: now() });
    const schreiben = [["klassen", klasse]];
    schueler.forEach((s) => schreiben.push(["schueler", normalisiereSchuelerHeat(Object.assign({}, s), settings)]));
    kategorien.forEach((x) => schreiben.push(["kategorien", x]));
    leistungen.forEach((x) => schreiben.push(["leistungen", x]));
    noten.forEach((x) => schreiben.push(["noten", x]));
    ereignisse.forEach((x) => schreiben.push(["ereignisse", x]));
    stunden.forEach((x) => schreiben.push(["stunden", x]));
    abwesenheiten.forEach((x) => schreiben.push(["abwesenheiten", x]));
    if (sitzplan) schreiben.push(["sitzplaene", sitzplan]);
    await kaskade(
      ersetzen ? klassenAbhaengige(klasse.id) : [],
      ersetzen ? [["sitzplaene", klasse.id]] : [],
      schreiben);
    return klasse;
  }

  Object.assign(global.Store, { exportAll, importAll, exportKlasse, importKlasse });
})(window);
