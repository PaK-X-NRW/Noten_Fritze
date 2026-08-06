/* =========================================================================
   store.migrationen.js – Daten-Migrationen (schemaVersion)
   Erweitert den Store-Namespace um SCHEMA_VERSION, die Migrationsschritte und
   migrateSchema(). Wird einmalig beim App-Start ausgeführt (app.js) und bringt
   vorhandene Datensätze auf die aktuelle Datenform.
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    now, datumLokal, halbjahrAusDatum, quartalAusDatum,
    neueStunde, leistungenAusNoten,
    getSettings, saveSettings, DEFAULT_SETTINGS
  } = global.Store;

  // ---- Daten-Migrationen (schemaVersion) -------------------------------------
  // Zweistufiges Migrationskonzept:
  //   DB_VERSION (db.js)   = Struktur der Object-Stores (Stores/Indizes, additiv)
  //   SCHEMA_VERSION (hier) = Form der Datensätze (neue Felder, Defaults)
  // MIGRATION_STEPS: Schlüssel = Ziel-Version. Jede Funktion führt genau den
  // Schritt von (Version - 1) auf (Version) aus. Neue Versionen werden hinten
  // angehängt – die Kette läuft kaskadiert v1 -> v2 -> v3 ... und wird einmalig
  // beim App-Start (app.js, vor dem ersten Render) ausgeführt.
  // Regel: Neue Felder bekommen immer Defaults (Factorys + getSettings-Merge),
  // damit auch nicht migrierte/alte Datensätze ohne das Feld funktionieren.
  const SCHEMA_VERSION = 11;
  const MIGRATION_STEPS = {
    // v1 -> v2: Noten und Ereignisse erhalten ein Halbjahr (1 | 2),
    // aus dem Datum abgeleitet (Aug–Jan = 1. HJ, Feb–Jul = 2. HJ).
    2: async () => {
      const noten = await DB.getAll("noten");
      noten.forEach((n) => { if (!n.halbjahr) n.halbjahr = halbjahrAusDatum(n.datum); });
      await DB.bulkPut("noten", noten);
      const ereignisse = await DB.getAll("ereignisse");
      ereignisse.forEach((e) => {
        if (!e.halbjahr) e.halbjahr = halbjahrAusDatum(new Date(e.timestamp).toISOString().slice(0, 10));
      });
      await DB.bulkPut("ereignisse", ereignisse);
    },
    // v2 -> v3: Stundenplan in den Einstellungen. Der Default kommt über den
    // getSettings-Merge dazu; dieser Schritt persistiert die Einstellungen
    // inkl. Stundenplan (und dokumentiert den Versionsschritt).
    3: async () => {
      await saveSettings(await getSettings());
    },
    // v3 -> v4: Stundenplan wird flach (10 Stunden, jeden Schultag gleich)
    // statt Wochenplan je Wochentag. Die Konvertierung steckt in getSettings
    // (Montagsliste als Basis); dieser Schritt persistiert das Ergebnis.
    4: async () => {
      await saveSettings(await getSettings());
    },
    // v4 -> v5: Unterrichtsstunden werden eine eigene Entität. Bestehende
    // Ereignisse werden je (Klasse, Kalendertag) zu einer bereits beendeten
    // Stunde zusammengefasst, damit die Auswertung weiter rechnen kann.
    5: async () => {
      const ereignisse = await DB.getAll("ereignisse");
      const gruppen = {};
      ereignisse.forEach((e) => {
        const datum = datumLokal(new Date(e.timestamp));
        const key = e.klasseId + "|" + datum;
        if (!gruppen[key]) gruppen[key] = { klasseId: e.klasseId, datum, liste: [] };
        gruppen[key].liste.push(e);
      });
      const stunden = Object.keys(gruppen).map((key) => {
        const g = gruppen[key];
        const zeiten = g.liste.map((e) => e.timestamp);
        const start = Math.min.apply(null, zeiten);
        const ende = Math.max.apply(null, zeiten);
        const st = neueStunde(g.klasseId, {
          startTs: start, endeTs: ende,
          dauerMin: Math.max(1, Math.round((ende - start) / 60000)),
          quelle: "migriert"
        }, halbjahrAusDatum(g.datum));
        st.datum = g.datum;
        st.status = "beendet";
        st.beendetAt = ende;
        g.liste.forEach((e) => { e.stundeId = st.id; });
        return st;
      });
      await DB.bulkPut("stunden", stunden);
      await DB.bulkPut("ereignisse", ereignisse);
    },
    // v5 -> v6: Kategorien bekommen das Feld `anzeige` (Note oder Zählung
    // fehlender Hausaufgaben); Nebenfächer rechnen jetzt 30 % schriftlich /
    // 70 % sonstige statt 40/60.
    6: async () => {
      const kategorien = await DB.getAll("kategorien");
      kategorien.forEach((c) => { if (!c.anzeige) c.anzeige = "note"; });
      await DB.bulkPut("kategorien", kategorien);
      const klassen = await DB.getAll("klassen");
      klassen.forEach((k) => {
        if (k.typ === "nebenfach") {
          k.anteilSchriftlich = DEFAULT_SETTINGS.anteile.nebenfach.schriftlich;
          k.anteilSonstige = DEFAULT_SETTINGS.anteile.nebenfach.sonstige;
          k.updatedAt = now();
        }
      });
      await DB.bulkPut("klassen", klassen);
    },
    // v6 -> v7: Die Reihenfolge der Schüler/innen ist einstellbar und steht
    // standardmäßig auf alphabetisch (Nachname). Der Default kommt über den
    // getSettings-Merge; dieser Schritt schreibt ihn fest. Der bisherige
    // sortIndex bleibt erhalten – Umschalten auf "manuell" stellt ihn wieder her.
    7: async () => {
      await saveSettings(await getSettings());
    },
    // v7 -> v8: Quartale (1–4) auf Noten, Ereignissen und Stunden (aus dem
    // Datum abgeleitet); neues Setting aktuellesQuartal (aus dem heutigen
    // Datum) und haModus ("punkte" = bisherige Punktewertung).
    8: async () => {
      const noten = await DB.getAll("noten");
      noten.forEach((n) => { if (!n.quartal) n.quartal = quartalAusDatum(n.datum); });
      await DB.bulkPut("noten", noten);
      const ereignisse = await DB.getAll("ereignisse");
      ereignisse.forEach((e) => {
        if (!e.quartal) e.quartal = quartalAusDatum(datumLokal(new Date(e.timestamp)));
      });
      await DB.bulkPut("ereignisse", ereignisse);
      const stunden = await DB.getAll("stunden");
      stunden.forEach((st) => { if (!st.quartal) st.quartal = quartalAusDatum(st.datum); });
      await DB.bulkPut("stunden", stunden);
      const s = await getSettings();
      s.aktuellesQuartal = quartalAusDatum(datumLokal());
      s.haModus = "punkte";
      await saveSettings(s);
    },
    // v8 -> v9: Klassen bekommen eine Klassenstufe (5-13); ab 11 gelten
    // MSS-Punkte (0-15) statt Schulnoten (siehe Calc.istMSS).
    9: async () => {
      const klassen = await DB.getAll("klassen");
      klassen.forEach((k) => { if (k.klassenstufe === undefined) k.klassenstufe = null; });
      await DB.bulkPut("klassen", klassen);
    },
    // v9 -> v10: Spaltenmodell. Jede Note gehört jetzt zu einer Leistung –
    // das ist eine Spalte der Notenübersicht („2. Klassenarbeit", „HÜ 10.09."),
    // in der je Schüler/in genau eine Note steht. Bestandsnoten werden nach
    // Kategorie/Quartal/Titel/Datum zu Spalten zusammengefasst; hat ein/e
    // Schüler/in dort mehrere Noten, entstehen entsprechend viele Spalten.
    10: async () => {
      const noten = await DB.getAll("noten");
      if (!noten.length) return;
      const neu = leistungenAusNoten(noten);
      if (neu.length) await DB.bulkPut("leistungen", neu);
      await DB.bulkPut("noten", noten);
    },
    // v10 -> v11: Kategorien bekommen eine Herkunft (`quelle`). Kategorien, die
    // bisher schon Ziel des Quartalsabschlusses waren, werden als
    // „mitarbeit" markiert – erkennbar am Namen, so wie es der Abschluss und
    // der HA-Modus bisher auch getan haben.
    11: async () => {
      const kategorien = await DB.getAll("kategorien");
      kategorien.forEach((c) => {
        if (c.quelle) return;
        const name = String(c.name || "").toLowerCase();
        c.quelle = (c.art === "sonstige" && (c.anzeige || "note") === "note" && name.indexOf("mitarbeit") !== -1)
          ? "mitarbeit" : "manuell";
      });
      await DB.bulkPut("kategorien", kategorien);
    }
  };
  async function migrateSchema() {
    const s = await getSettings();
    let v = parseInt(s.schemaVersion, 10) || 1;
    while (v < SCHEMA_VERSION) {
      v++;
      if (MIGRATION_STEPS[v]) await MIGRATION_STEPS[v]();
    }
    if (s.schemaVersion !== SCHEMA_VERSION) {
      s.schemaVersion = SCHEMA_VERSION;
      await saveSettings(s);
    }
    return s;
  }

  Object.assign(global.Store, { SCHEMA_VERSION, migrateSchema });
})(window);
