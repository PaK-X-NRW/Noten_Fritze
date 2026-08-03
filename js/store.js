/* =========================================================================
   store.js – Domänenschicht über der DB
   Definiert das Datenmodell, sinnvolle Defaults, Einstellungen sowie
   Repository-Funktionen je Entität. Erzeugt außerdem Demo-Daten und enthält
   den Klassen-Export/-Import sowie den HA-Modus (Note 6 bei 3× vergessen).
   ========================================================================= */
(function (global) {
  "use strict";

  // ---- Hilfsfunktionen ------------------------------------------------------
  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  const now = () => Date.now();

  // ---- Ereignis-Typen (Mitarbeit) ------------------------------------------
  // Reihenfolge = Anzeige-Reihenfolge im Tracker.
  // aufKachel: true  -> eigener Button auf der Schülerkachel (mit icon)
  // aufKachel: false -> nur über einen Tracker-Modus in der Topbar erfassbar
  const EVENT_TYPES = [
    { id: "einfach",   label: "Wortmeldung",       kurz: "Meldung",  farbe: "#2e7d32", defaultPunkte: 1,  heatDelta: 1, positiv: true,  aufKachel: true, icon: "★" },
    { id: "gut",       label: "Gute Meldung",      kurz: "gut",      farbe: "#1565c0", defaultPunkte: 2,  heatDelta: 2, positiv: true,  aufKachel: true, icon: "★★" },
    { id: "sehrgut",   label: "Sehr gute Meldung", kurz: "sehr gut", farbe: "#6a1b9a", defaultPunkte: 3,  heatDelta: 3, positiv: true,  aufKachel: true, icon: "★★★" },
    { id: "stoerung",  label: "Störung",           kurz: "Störung",  farbe: "#c62828", defaultPunkte: -2, heatDelta: 0, positiv: false, aufKachel: true, icon: "⚡" },
    // Erfassung nur über Tracker-Modus: die Stunde zählt als Note 6 (Calc)
    { id: "verweigerung", label: "Leistungsverweigerung", kurz: "Verweigerung", farbe: "#4a148c", defaultPunkte: 0, heatDelta: 0, positiv: false, aufKachel: false },
    { id: "keinehausaufgabe", label: "Fehlende HA", kurz: "keine HA", farbe: "#b9770e", defaultPunkte: -1, heatDelta: 0, positiv: false, aufKachel: false }
  ];
  const KACHEL_EVENT_TYPES = EVENT_TYPES.filter((t) => t.aufKachel);
  const EVENT_TYPE_MAP = EVENT_TYPES.reduce((m, t) => (m[t.id] = t, m), {});
  const HEAT_POINTS_MAX = 100;

  function clampHeatPoints(value) {
    return Math.max(0, Math.min(HEAT_POINTS_MAX, Number(value) || 0));
  }

  function normalisiereSchuelerHeat(s, settings) {
    if (!s) return s;
    const heatStart = Math.max(0, Math.min(HEAT_POINTS_MAX,
      Number(settings && settings.heatStartWert != null ? settings.heatStartWert : DEFAULT_SETTINGS.heatStartWert) || 0));
    if (s.heatPoints === null || s.heatPoints === undefined || isNaN(Number(s.heatPoints))) {
      s.heatPoints = heatStart;
    } else {
      s.heatPoints = clampHeatPoints(s.heatPoints);
    }
    if (!s.heatLastDecayAt || isNaN(Number(s.heatLastDecayAt))) {
      s.heatLastDecayAt = now();
    }
    return s;
  }

  function currentHeatPoints(s, settings, jetzt) {
    const punktestand = normalisiereSchuelerHeat(JSON.parse(JSON.stringify(s || {})));
    const verfallMinuten = Math.max(1, parseInt((settings && settings.heatVerfallMinuten), 10) || 5);
    const verfallPunkte = Math.max(0, parseInt((settings && settings.heatVerfallPunkte), 10) || 1);
    const aktuelleZeit = jetzt || now();
    const vergangen = Math.max(0, aktuelleZeit - punktestand.heatLastDecayAt);
    const decay = vergangen / 60000 / verfallMinuten * verfallPunkte;
    const heatPoints = clampHeatPoints(punktestand.heatPoints - decay);
    return { heatPoints, heatLastDecayAt: punktestand.heatLastDecayAt, decay, verfallMinuten, verfallPunkte };
  }

  // ---- Quartal / Halbjahr ---------------------------------------------------
  // Lokales Datum als YYYY-MM-DD (für Tages-Zuordnungen wie Abwesenheiten).
  function datumLokal(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  // Leitet aus einem Datum (YYYY-MM-DD oder Date) das Quartal ab:
  // Aug–Okt = 1 · Nov–Jan = 2 · Feb–Apr = 3 · Mai–Jul = 4 (deutsches Schuljahr).
  function quartalAusDatum(datum) {
    const s = (datum instanceof Date) ? datumLokal(datum) : String(datum || "");
    const m = parseInt(s.slice(5, 7), 10);
    if (!m) return 1; // Fallback
    if (m >= 8 && m <= 10) return 1;
    if (m >= 11 || m <= 1) return 2;
    if (m >= 2 && m <= 4) return 3;
    return 4;
  }
  // Halbjahr zu einem Quartal: Q1/Q2 = 1. Halbjahr, Q3/Q4 = 2. Halbjahr.
  function halbjahrAusQuartal(q) {
    return (parseInt(q, 10) || 1) <= 2 ? 1 : 2;
  }
  // Leitet aus einem Datum (YYYY-MM-DD) das Halbjahr ab:
  // Aug–Jan = 1. Halbjahr, Feb–Jul = 2. Halbjahr (deutsches Schuljahr).
  function halbjahrAusDatum(datum) {
    const m = parseInt(String(datum || "").slice(5, 7), 10);
    if (!m) return 1;
    return (m >= 8 || m <= 1) ? 1 : 2;
  }

  // ---- Standard-Einstellungen ----------------------------------------------
  function hhmmZuMinuten(v) {
    const p = String(v || "").split(":");
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function minZuHHMM(min) {
    return ("0" + (Math.floor(min / 60) % 24)).slice(-2) + ":" + ("0" + (min % 60)).slice(-2);
  }

  // Default-Stundenplan: 10 Stunden à 45 Min ab 08:00 – gilt jeden Schultag
  // gleich (5-Min-Pausen, nach der 2. Stunde 20 Min).
  function defaultStundenplan() {
    const starts = ["08:00", "08:50", "09:55", "10:45", "11:35", "12:25", "13:15", "14:05", "14:55", "15:45"];
    return starts.map((start, i) => ({ nr: i + 1, start, ende: minZuHHMM(hhmmZuMinuten(start) + 45) }));
  }

  // Bringt einen Stundenplan auf genau 10 Einträge { nr, start, ende }:
  // ungültige Einträge raus, fehlende Stunden ans Ende gehängt
  // (letzte Stunde + 5 Min Pause, 45 Min).
  function stundenplanNormalisieren(liste) {
    const plan = (Array.isArray(liste) ? liste : [])
      .filter((h) => h && h.start && h.ende)
      .slice(0, 10)
      .map((h, i) => ({ nr: i + 1, start: h.start, ende: h.ende }));
    while (plan.length < 10) {
      const letzte = plan[plan.length - 1];
      const startMin = letzte ? hhmmZuMinuten(letzte.ende) + 5 : 8 * 60;
      plan.push({ nr: plan.length + 1, start: minZuHHMM(startMin), ende: minZuHHMM(startMin + 45) });
    }
    return plan;
  }

  // Bringt eine Schwellen-Liste in eine gültige Form: unbrauchbare Einträge
  // raus, Noten auf 1..5 begrenzt, absteigend nach abPunkte sortiert
  // (Calc.punkteZuNote nimmt die erste passende Schwelle).
  function schwellenNormalisieren(liste) {
    const clean = (Array.isArray(liste) ? liste : [])
      .map((s) => ({
        abPunkte: Math.round((parseFloat(String(s && s.abPunkte).replace(",", ".")) || 0) * 100) / 100,
        note: Math.max(1, Math.min(5, parseInt(s && s.note, 10) || 0))
      }))
      .filter((s) => s.note >= 1);
    clean.sort((a, b) => b.abPunkte - a.abPunkte);
    return clean;
  }

  const DEFAULT_SETTINGS = {
    key: "app",
    schemaVersion: 8,
    // Aktuelles Quartal (1–4) – neue Noten/Ereignisse/Stunden werden damit getaggt
    aktuellesQuartal: 1,
    // Vergessene Hausaufgaben werten:
    // "punkte" = vergessene HA geben Minuspunkte in der Mitarbeit
    // "note6"  = jede 3. vergessene HA je Quartal erzeugt automatisch eine
    //            Note 6 in „Mündliche Mitarbeit", HA geben dann keine Punkte
    haModus: "punkte",
    // Legacy-Feld: nicht mehr im UI, wird aus dem Quartal abgeleitet
    aktuellesHalbjahr: 1,
    // Stundenplan: flache Liste von genau 10 { nr, start: "HH:MM", ende: "HH:MM" },
    // gilt für jeden Schultag gleich (kein Wochenplan mehr).
    stundenplan: defaultStundenplan(),
    // Rundung der Gesamtnote: "keine" (2 NK), "eine" (1 NK), "ganze" (ganze Note)
    rundung: "eine",
    // Reihenfolge der Schüler/innen in allen Listen:
    // "nachname" = alphabetisch (Nachname, dann Vorname), "manuell" = per ▲/▼ gepflegter sortIndex
    schuelerSortierung: "nachname",
    // Punkte je Ereignistyp (überschreibbar)
    mitarbeitPunkte: EVENT_TYPES.reduce((m, t) => (m[t.id] = t.defaultPunkte, m), {}),
    // Schwellen: Ø Punkte pro gehaltener Stunde -> Vorschlag Mitarbeitsnote.
    // Startwerte, gedacht zum Nachjustieren (global und je Klasse editierbar).
    mitarbeitSchwellen: [
      { abPunkte: 2.0, note: 1 },
      { abPunkte: 1.3, note: 2 },
      { abPunkte: 0.7, note: 3 },
      { abPunkte: 0.2, note: 4 },
      { abPunkte: -0.5, note: 5 }
      // darunter: 6
    ],
    // Heatmap-Erfassungspunkte je Ereignistyp
    heatPunkteEinfach: 1,
    heatPunkteGut: 2,
    heatPunkteSehrGut: 3,
    // Heatmap-Startwert beim Anlegen / Initialisieren von Schülerdaten
    heatStartWert: 50,
    // Heatmap-Verfall: Y Punkte pro X Minuten
    heatVerfallPunkte: 1,
    heatVerfallMinuten: 5,
    // Default-Anteile schriftlich/sonstige je Fachtyp (in %)
    anteile: {
      hauptfach: { schriftlich: 50, sonstige: 50 },
      nebenfach: { schriftlich: 30, sonstige: 70 }
    }
  };

  // ---- Einstellungen -------------------------------------------------------
  async function getSettings() {
    let s = await DB.get("einstellungen", "app");
    const quartalFehlt = !s || !s.aktuellesQuartal;
    if (!s) {
      s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      await DB.put("einstellungen", s);
    }
    // Fehlende Felder aus Defaults ergänzen (Vorwärtskompatibilität)
    s = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s);
    if (s.heatPunktVerfallProMinuten && !s.heatVerfallMinuten) {
      s.heatVerfallMinuten = s.heatPunktVerfallProMinuten;
    }
    // Altes Format (Wochenplan als Objekt je Wochentag) in die flache
    // 10-Stunden-Liste überführen: Montagsliste als Basis, sonst Default.
    if (!Array.isArray(s.stundenplan)) {
      const alt = s.stundenplan || {};
      const ersterTag = Object.keys(alt).sort()[0];
      s.stundenplan = ersterTag ? alt[ersterTag] : null;
    }
    s.stundenplan = stundenplanNormalisieren(s.stundenplan);
    s.mitarbeitSchwellen = schwellenNormalisieren(s.mitarbeitSchwellen);
    if (!s.mitarbeitSchwellen.length) {
      s.mitarbeitSchwellen = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.mitarbeitSchwellen));
    }
    // Aktuelles Quartal: fehlt es oder ist es ungültig, aus dem heutigen
    // Datum ableiten.
    if (quartalFehlt || s.aktuellesQuartal < 1 || s.aktuellesQuartal > 4) {
      s.aktuellesQuartal = quartalAusDatum(datumLokal());
    }
    return s;
  }
  async function saveSettings(s) {
    s.key = "app";
    return DB.put("einstellungen", s);
  }

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
  const SCHEMA_VERSION = 9;
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

  // ---- Klassen -------------------------------------------------------------
  function neueKlasse(data) {
    const t = now();
    return Object.assign({
      id: uid(),
      name: "",
      schuljahr: "",
      fach: "",
      typ: "hauptfach",            // "hauptfach" | "nebenfach"
      klassenstufe: null,          // 5..13; ab 11 gelten MSS-Punkte (0-15) statt Schulnoten
      anteilSchriftlich: 50,       // %
      anteilSonstige: 50,          // %
      // Eigene Mitarbeits-Schwellen dieser Klasse; null = globale Einstellung
      mitarbeitSchwellen: null,
      notizen: "",
      createdAt: t,
      updatedAt: t,
      lastOpenedAt: t
    }, data || {});
  }
  const Klassen = {
    all: () => DB.getAll("klassen"),
    get: (id) => DB.get("klassen", id),
    async save(k) { k.updatedAt = now(); return DB.put("klassen", k); },
    async touchOpened(id) {
      const k = await DB.get("klassen", id);
      if (k) { k.lastOpenedAt = now(); await DB.put("klassen", k); }
      return k;
    },
    async remove(id) {
      // Kaskadierendes Löschen aller abhängigen Daten
      await DB.delByIndex("schueler", "klasseId", id);
      await DB.delByIndex("kategorien", "klasseId", id);
      await DB.delByIndex("noten", "klasseId", id);
      await DB.delByIndex("ereignisse", "klasseId", id);
      await DB.delByIndex("abwesenheiten", "klasseId", id);
      await DB.delByIndex("stunden", "klasseId", id);
      await DB.del("sitzplaene", id);
      await DB.del("klassen", id);
    }
  };

  // ---- Schüler/innen -------------------------------------------------------
  function neuerSchueler(klasseId, data) {
    const t = now();
    return Object.assign({
      id: uid(),
      klasseId,
      vorname: "",
      nachname: "",
      bemerkung: "",
      sortIndex: t,
      heatPoints: DEFAULT_SETTINGS.heatStartWert,
      heatLastDecayAt: t,
      createdAt: t,
      updatedAt: t
    }, data || {});
  }
  // Namensvergleich mit deutscher Kollation (Umlaute einsortiert,
  // Groß-/Kleinschreibung egal). Fallback für sehr alte Engines: localeCompare.
  const nameCollator = (typeof Intl !== "undefined" && Intl.Collator)
    ? new Intl.Collator("de", { sensitivity: "base", numeric: true })
    : null;
  function vergleicheText(a, b) {
    a = a || ""; b = b || "";
    return nameCollator ? nameCollator.compare(a, b) : String(a).localeCompare(String(b), "de");
  }
  // Sortierfunktion gemäß settings.schuelerSortierung: alphabetisch nach
  // Nachname (dann Vorname, dann sortIndex) oder manuell nach sortIndex.
  function schuelerSortierer(settings) {
    if (settings.schuelerSortierung === "manuell") return (a, b) => a.sortIndex - b.sortIndex;
    return (a, b) =>
      vergleicheText(a.nachname, b.nachname) ||
      vergleicheText(a.vorname, b.vorname) ||
      (a.sortIndex - b.sortIndex);
  }

  const Schueler = {
    async byKlasse(klasseId) {
      const settings = await getSettings();
      const list = await DB.getAllByIndex("schueler", "klasseId", klasseId);
      return list.map((s) => normalisiereSchuelerHeat(s, settings)).sort(schuelerSortierer(settings));
    },
    async get(id) {
      const s = await DB.get("schueler", id);
      return normalisiereSchuelerHeat(s, await getSettings());
    },
    async save(s) { normalisiereSchuelerHeat(s, await getSettings()); s.updatedAt = now(); return DB.put("schueler", s); },
    // Mehrere Schüler in einem Rutsch speichern (z. B. Heatmap-Stand einer
    // ganzen Klasse beim Start/Ende einer Stunde).
    async saveAlle(list) {
      const settings = await getSettings();
      list.forEach((s) => { normalisiereSchuelerHeat(s, settings); s.updatedAt = now(); });
      return DB.bulkPut("schueler", list);
    },
    async remove(id) {
      await DB.delByIndex("noten", "schuelerId", id);
      await DB.delByIndex("ereignisse", "schuelerId", id);
      await DB.delByIndex("abwesenheiten", "schuelerId", id);
      // Sitzplatz-Zuweisung entfernen
      const s = await DB.get("schueler", id);
      if (s) {
        const plan = await DB.get("sitzplaene", s.klasseId);
        if (plan) {
          plan.seats.forEach((seat) => { if (seat.schuelerId === id) seat.schuelerId = null; });
          await DB.put("sitzplaene", plan);
        }
      }
      await DB.del("schueler", id);
    },
    async reorder(list) {
      list.forEach((s, i) => { s.sortIndex = i; });
      return DB.bulkPut("schueler", list);
    }
  };

  // ---- Kategorien ----------------------------------------------------------
  function neueKategorie(klasseId, data) {
    return Object.assign({
      id: uid(),
      klasseId,
      name: "",
      art: "sonstige",     // "schriftlich" | "sonstige"
      gewichtung: 1,        // relatives Gewicht innerhalb der Art
      // "note"       = normale Notenspalte
      // "fehlendeHA" = zählt nur vergessene Hausaufgaben, geht nicht in die Note
      anzeige: "note",
      sortIndex: now(),
      createdAt: now()
    }, data || {});
  }
  const Kategorien = {
    byKlasse: (klasseId) => DB.getAllByIndex("kategorien", "klasseId", klasseId)
      .then((list) => list.sort((a, b) => a.sortIndex - b.sortIndex)),
    get: (id) => DB.get("kategorien", id),
    save: (k) => DB.put("kategorien", k),
    async remove(id) {
      await DB.delByIndex("noten", "kategorieId", id);
      await DB.del("kategorien", id);
    }
  };

  // ---- Noten (Einzelnoten) -------------------------------------------------
  function neueNote(data) {
    data = data || {};
    const datum = data.datum || new Date().toISOString().slice(0, 10);
    // Quartal: vom Aufrufer übergeben oder aus dem Datum abgeleitet.
    // Wird es übergeben, leitet sich das Halbjahr daraus ab, sonst aus dem Datum.
    const quartal = data.quartal || quartalAusDatum(datum);
    return Object.assign({
      id: uid(),
      klasseId: null,
      schuelerId: null,
      kategorieId: null,
      wert: null,           // Zahl 1..6 (mit Nachkomma, z. B. 2.3)
      titel: "",
      datum,
      quartal,              // 1–4; Aufrufer setzen i. d. R. settings.aktuellesQuartal
      halbjahr: data.quartal ? halbjahrAusQuartal(quartal) : halbjahrAusDatum(datum),
      createdAt: now()
    }, data);
  }
  const Noten = {
    byKlasse: (klasseId) => DB.getAllByIndex("noten", "klasseId", klasseId),
    save: (n) => DB.put("noten", n),
    remove: (id) => DB.del("noten", id)
  };

  // ---- Sitzplan ------------------------------------------------------------
  function neuerSitzplan(klasseId, rows, cols) {
    rows = rows || 4; cols = cols || 6;
    const seats = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        seats.push({ id: r + "-" + c, row: r, col: c, schuelerId: null });
    return { klasseId, rows, cols, seats, updatedAt: now() };
  }
  const Sitzplan = {
    async get(klasseId) {
      let p = await DB.get("sitzplaene", klasseId);
      if (!p) { p = neuerSitzplan(klasseId); await DB.put("sitzplaene", p); }
      return p;
    },
    save(p) { p.updatedAt = now(); return DB.put("sitzplaene", p); }
  };

  // ---- Ereignisse (Mitarbeit) ----------------------------------------------
  function neuesEreignis(klasseId, schuelerId, typ, punkte, stundeId) {
    const datum = new Date().toISOString().slice(0, 10);
    return {
      id: uid(),
      klasseId,
      schuelerId,
      stundeId: stundeId || null,   // Unterrichtsstunde, in der erfasst wurde
      typ,
      punkte,           // zum Zeitpunkt der Erfassung eingefrorene Punktzahl
      timestamp: now(),
      quartal: quartalAusDatum(datum),    // 1–4; Aufrufer setzen i. d. R. settings.aktuellesQuartal
      halbjahr: halbjahrAusDatum(datum),
      notiz: ""
    };
  }
  const Ereignisse = {
    byKlasse: (klasseId) => DB.getAllByIndex("ereignisse", "klasseId", klasseId),
    bySchueler: (schuelerId) => DB.getAllByIndex("ereignisse", "schuelerId", schuelerId),
    byStunde: (stundeId) => DB.getAllByIndex("ereignisse", "stundeId", stundeId),
    save: (e) => DB.put("ereignisse", e),
    remove: (id) => DB.del("ereignisse", id)
  };

  // ---- Unterrichtsstunden ---------------------------------------------------
  // Eine Stunde ist die Einheit, in der der Tracker erfasst: sie wird beim
  // Tracker-Start angelegt, kann fortgesetzt und explizit beendet werden.
  // Ereignisse hängen über `stundeId` daran, die Mitarbeitsnote rechnet
  // Punkte pro gehaltener Stunde.
  function neueStunde(klasseId, session, halbjahr) {
    const t = now();
    const startTs = session && session.startTs ? session.startTs : t;
    const datum = datumLokal(new Date(startTs));
    // Quartal: über session.quartal vorgegeben (Halbjahr dann daraus
    // abgeleitet) oder aus dem Datum bestimmt.
    const quartal = session && session.quartal ? session.quartal : quartalAusDatum(datum);
    return {
      id: uid(),
      klasseId,
      datum,
      startTs,
      endeTs: session && session.endeTs ? session.endeTs : null,
      dauerMin: session && session.dauerMin ? session.dauerMin : null,
      stundeNr: session && session.stundeNr != null ? session.stundeNr : null,
      quelle: session && session.quelle ? session.quelle : "manuell",
      quartal,
      halbjahr: session && session.quartal
        ? halbjahrAusQuartal(quartal)
        : (parseInt(halbjahr, 10) || halbjahrAusDatum(datum)),
      status: "offen",          // "offen" (fortsetzbar) | "beendet"
      beendetAt: null,
      createdAt: t,
      updatedAt: t
    };
  }
  const Stunden = {
    byKlasse: (klasseId) => DB.getAllByIndex("stunden", "klasseId", klasseId)
      .then((list) => list.sort((a, b) => a.startTs - b.startTs)),
    get: (id) => DB.get("stunden", id),
    async save(st) { st.updatedAt = now(); return DB.put("stunden", st); },
    async beenden(id) {
      const st = await DB.get("stunden", id);
      if (!st || st.status === "beendet") return st;
      st.status = "beendet";
      st.beendetAt = now();
      if (!st.endeTs) st.endeTs = st.beendetAt;
      return Stunden.save(st);
    },
    // Offene Stunde der Klasse vom heutigen Tag (zum Fortsetzen), sonst null.
    // Ältere offene Stunden werden dabei automatisch beendet.
    async offeneVonHeute(klasseId) {
      const heute = datumLokal();
      const list = await Stunden.byKlasse(klasseId);
      const offen = list.filter((st) => st.status === "offen");
      for (const st of offen) {
        if (st.datum !== heute) await Stunden.beenden(st.id);
      }
      const heutige = offen.filter((st) => st.datum === heute);
      return heutige.length ? heutige[heutige.length - 1] : null;
    }
  };

  async function addHeatPoints(schuelerId, delta) {
    const s = await DB.get("schueler", schuelerId);
    if (!s) return null;
    normalisiereSchuelerHeat(s);
    const settings = await getSettings();
    const current = currentHeatPoints(s, settings, now());
    s.heatPoints = clampHeatPoints(current.heatPoints + (Number(delta) || 0));
    s.heatLastDecayAt = now();
    s.updatedAt = now();
    await DB.put("schueler", s);
    return s;
  }

  // ---- Abwesenheiten ---------------------------------------------------------
  // Schüler tageweise als krank/abwesend markieren (Toggle).
  // Datensatz: { id: schuelerId + "_" + datum, klasseId, schuelerId, datum, createdAt }
  const Abwesenheiten = {
    byKlasse: (klasseId) => DB.getAllByIndex("abwesenheiten", "klasseId", klasseId),
    byKlasseUndTag: (klasseId, datum) => DB.getAllByIndex("abwesenheiten", "klasseId", klasseId)
      .then((list) => list.filter((a) => a.datum === datum)),
    // Gibt true zurück, wenn der Schüler danach abwesend ist.
    async toggle(klasseId, schuelerId, datum) {
      datum = datum || datumLokal();
      const id = schuelerId + "_" + datum;
      if (await DB.get("abwesenheiten", id)) {
        await DB.del("abwesenheiten", id);
        return false;
      }
      await DB.put("abwesenheiten", { id, klasseId, schuelerId, datum, createdAt: now() });
      return true;
    }
  };

  // ---- Backup (Gesamt-Export/Import als JSON) ------------------------------
  async function exportAll() {
    const [klassen, schueler, kategorien, noten, sitzplaene, ereignisse, abwesenheiten, stunden, settings] = await Promise.all([
      DB.getAll("klassen"), DB.getAll("schueler"), DB.getAll("kategorien"),
      DB.getAll("noten"), DB.getAll("sitzplaene"), DB.getAll("ereignisse"),
      DB.getAll("abwesenheiten"), DB.getAll("stunden"), getSettings()
    ]);
    return {
      app: "noten-fritze", appVersion: APP_VERSION,
      schemaVersion: DB.DB_VERSION, exportedAt: new Date().toISOString(),
      data: { klassen, schueler, kategorien, noten, sitzplaene, ereignisse, abwesenheiten, stunden, settings }
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
    await DB.bulkPut("noten", d.noten || []);
    await DB.bulkPut("sitzplaene", d.sitzplaene || []);
    await DB.bulkPut("ereignisse", d.ereignisse || []);
    await DB.bulkPut("abwesenheiten", d.abwesenheiten || []);
    await DB.bulkPut("stunden", d.stunden || []);
    if (d.settings) await saveSettings(d.settings);
  }

  // ---- HA-Modus „note6": automatische Note 6 --------------------------------
  // Zählt die vergessenen Hausaufgaben (keinehausaufgabe) eines Schülers in
  // einer Klasse und einem Quartal. Bei jeder 3. (3., 6., 9. …) wird eine
  // Note 6 in die Kategorie „Mündliche Mitarbeit" eingefügt (wird angelegt,
  // falls nicht vorhanden). Nur aktiv, wenn settings.haModus === "note6".
  // Rückgabe: true, wenn eine Note erzeugt wurde.
  async function haNote6Pruefen(klasseId, schuelerId, quartal) {
    const settings = await getSettings();
    if (settings.haModus !== "note6") return false;
    const ereignisse = await Ereignisse.bySchueler(schuelerId);
    const anzahl = ereignisse.filter((e) =>
      e.klasseId === klasseId && e.typ === "keinehausaufgabe" && e.quartal === quartal
    ).length;
    if (anzahl <= 0 || anzahl % 3 !== 0) return false;
    const kategorien = await Kategorien.byKlasse(klasseId);
    let kat = kategorien.find((c) =>
      c.art === "sonstige" && (c.anzeige || "note") === "note" &&
      String(c.name || "").toLowerCase() === "mündliche mitarbeit");
    if (!kat) {
      kat = neueKategorie(klasseId, {
        name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2,
        sortIndex: kategorien.length
      });
      await Kategorien.save(kat);
    }
    await Noten.save(neueNote({
      klasseId, schuelerId, kategorieId: kat.id, wert: 6,
      titel: "3× Hausaufgaben vergessen (" + quartal + ". Quartal)",
      quartal
    }));
    return true;
  }

  // ---- Klassen-Export/-Import (einzelne Klasse als JSON) -------------------
  // Alle Datensätze einer Klasse (z. B. zur Übergabe an Kolleg/innen).
  async function exportKlasse(klasseId) {
    const [klasse, schueler, kategorien, noten, ereignisse, stunden, abwesenheiten, sitzplan] = await Promise.all([
      Klassen.get(klasseId),
      DB.getAllByIndex("schueler", "klasseId", klasseId),
      DB.getAllByIndex("kategorien", "klasseId", klasseId),
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
        klasse, schueler, kategorien, noten, ereignisse, stunden, abwesenheiten,
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
    let noten = d.noten || [];
    let ereignisse = d.ereignisse || [];
    let stunden = d.stunden || [];
    let abwesenheiten = d.abwesenheiten || [];
    let sitzplan = d.sitzplan || null;

    if (modus === "kopie") {
      const klasseIdNeu = uid();
      const schuelerMap = {}, kategorienMap = {}, stundenMap = {};
      schueler.forEach((s) => { schuelerMap[s.id] = uid(); });
      kategorien.forEach((c) => { kategorienMap[c.id] = uid(); });
      stunden.forEach((st) => { stundenMap[st.id] = uid(); });
      klasse = Object.assign({}, klasse, { id: klasseIdNeu, name: (klasse.name || "") + " (Kopie)" });
      schueler = schueler.map((s) => Object.assign({}, s, { id: schuelerMap[s.id], klasseId: klasseIdNeu }));
      kategorien = kategorien.map((c) => Object.assign({}, c, { id: kategorienMap[c.id], klasseId: klasseIdNeu }));
      noten = noten.map((n) => Object.assign({}, n, {
        id: uid(), klasseId: klasseIdNeu,
        schuelerId: schuelerMap[n.schuelerId] || n.schuelerId,
        kategorieId: kategorienMap[n.kategorieId] || n.kategorieId
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
    await DB.bulkPut("noten", noten);
    await DB.bulkPut("ereignisse", ereignisse);
    await DB.bulkPut("stunden", stunden);
    await DB.bulkPut("abwesenheiten", abwesenheiten);
    if (sitzplan) await DB.put("sitzplaene", sitzplan);
    return klasse;
  }

  // ---- Demo-Daten ----------------------------------------------------------
  // „Stand Ende Schuljahr": Das Schuljahr 2025/26 ist gerade zu Ende (heute:
  // Anfang August 2026). Das 1. Quartal ist bereits abgeschlossen – dafür
  // gibt es keine Stunden/Ereignisse mehr, sondern übertragene ganze Noten in
  // „Mündliche Mitarbeit". Q2–Q4 laufen mit Stunden und Ereignissen. Feste
  // Leistungsprofile (stark/mittel/schwach) und ein Pseudozufall mit festem
  // Startwert sorgen für plausible, reproduzierbare Teststände.
  async function seedDemoData() {
    const klassen = await Klassen.all();
    if (klassen.length > 0) return false; // Nur wenn leer

    // Reproduzierbarer Pseudozufall (LCG mit festem Startwert)
    let seed = 20260801;
    function zufall() {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    }

    const k = neueKlasse({
      name: "8b", schuljahr: "2025/26", fach: "Mathematik", typ: "hauptfach",
      anteilSchriftlich: 50, anteilSonstige: 50,
      notizen: "Demo-Klasse. Kann gefahrlos gelöscht werden."
    });
    await Klassen.save(k);

    const namen = [
      ["Anna", "Bauer"], ["Ben", "Fischer"], ["Clara", "Weber"], ["David", "Wagner"],
      ["Emma", "Becker"], ["Finn", "Schulz"], ["Greta", "Hoffmann"], ["Hannes", "Koch"],
      ["Ida", "Richter"], ["Jonas", "Klein"], ["Klara", "Wolf"], ["Leon", "Neumann"],
      ["Maja", "Brandt"], ["Noah", "Schäfer"]
    ];
    // Feste Leistungsprofile, zyklisch je Index zugeteilt
    const PROFILE = ["stark", "mittel", "schwach"];
    const profilVon = (i) => PROFILE[i % PROFILE.length];
    const schuelerListe = namen.map((n, i) => neuerSchueler(k.id, { vorname: n[0], nachname: n[1], sortIndex: i }));
    await DB.bulkPut("schueler", schuelerListe);

    // Notenwert um die Profil-Basis (stark ~1,8 / mittel ~2,8 / schwach ~4,0)
    function profilNote(profil) {
      const basis = profil === "stark" ? 1.8 : profil === "mittel" ? 2.8 : 4.0;
      const wert = basis + (zufall() - 0.5) * 1.6;
      return Math.max(1, Math.min(6, Math.round(wert * 10) / 10));
    }
    // Übertragene Mündlich-Note fürs abgeschlossene 1. Quartal (ganze Note):
    // stark 1–2, mittel 2–3, schwach 4–5
    function q1Note(profil) {
      const von = profil === "stark" ? 1 : profil === "mittel" ? 2 : 4;
      return von + Math.round(zufall());
    }

    const kats = [
      neueKategorie(k.id, { name: "Klassenarbeit", art: "schriftlich", gewichtung: 2, sortIndex: 0 }),
      neueKategorie(k.id, { name: "Test",          art: "schriftlich", gewichtung: 1, sortIndex: 1 }),
      neueKategorie(k.id, { name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2, sortIndex: 2 }),
      // Hausaufgaben werden nicht benotet – die Spalte zählt nur die vergessenen
      neueKategorie(k.id, { name: "Hausaufgaben", art: "sonstige", gewichtung: 1, sortIndex: 3, anzeige: "fehlendeHA" })
    ];
    await DB.bulkPut("kategorien", kats);

    const settings = await getSettings();

    // Stunden des Schuljahrs 2025/26: jeden Dienstag und Donnerstag vom
    // 12.08.2025 bis 09.07.2026, je 45 Min ab 09:00, alle beendet. Schulwochen
    // sind grob zusammengefasst (keine Ferienlogik). Fürs 1. Quartal gibt es
    // keine Stunden – es ist bereits abgeschlossen und übertragen.
    const stunden = [];
    const ende = new Date(2026, 6, 9);
    for (let d = new Date(2025, 7, 12); d <= ende; d.setDate(d.getDate() + 1)) {
      const wt = d.getDay();
      if (wt !== 2 && wt !== 4) continue; // nur Dienstag + Donnerstag
      const datum = datumLokal(d);
      if (quartalAusDatum(datum) === 1) continue; // Q1 abgeschlossen: keine Stunden
      const startD = new Date(d);
      startD.setHours(9, 0, 0, 0);
      const st = neueStunde(k.id, {
        startTs: startD.getTime(), endeTs: startD.getTime() + 45 * 60000,
        dauerMin: 45, quelle: "fallback", stundeNr: 2
      });
      st.status = "beendet";
      st.beendetAt = st.endeTs;
      stunden.push(st);
    }
    await DB.bulkPut("stunden", stunden);
    const quartalStunden = {};
    stunden.forEach((st) => {
      (quartalStunden[st.quartal] = quartalStunden[st.quartal] || []).push(st);
    });

    // Vereinzelte Abwesenheiten (einzelne Tage bei vier Schülern)
    const abwesenheiten = [];
    const abwesendSet = {};
    [[3, 5], [6, 20], [9, 40], [12, 60]].forEach((paar) => {
      const s = schuelerListe[paar[0]], st = stunden[paar[1]];
      if (!s || !st) return;
      abwesenheiten.push({
        id: s.id + "_" + st.datum, klasseId: k.id,
        schuelerId: s.id, datum: st.datum, createdAt: now()
      });
      abwesendSet[s.id + "|" + st.datum] = true;
    });
    await DB.bulkPut("abwesenheiten", abwesenheiten);

    // Mitarbeitsereignisse: pro Schüler und Stunde 0–3 Ereignisse, die
    // Typ-Verteilung hängt vom Leistungsprofil ab (stark häufiger positiv,
    // schwach öfter Störung/vergessene HA). Timestamps innerhalb der Stunde.
    function ereignisTyp(profil) {
      const r = zufall();
      if (profil === "stark") {
        if (r < 0.5) return "einfach";
        if (r < 0.8) return "gut";
        if (r < 0.95) return "sehrgut";
        return "stoerung";
      }
      if (profil === "mittel") {
        if (r < 0.55) return "einfach";
        if (r < 0.8) return "gut";
        if (r < 0.88) return "sehrgut";
        if (r < 0.96) return "stoerung";
        return "keinehausaufgabe";
      }
      if (r < 0.4) return "einfach";
      if (r < 0.6) return "gut";
      if (r < 0.8) return "stoerung";
      return "keinehausaufgabe";
    }
    const ereignisse = [];
    schuelerListe.forEach((s, idx) => {
      const profil = profilVon(idx);
      stunden.forEach((st) => {
        if (abwesendSet[s.id + "|" + st.datum]) return;
        const anzahl = Math.floor(zufall() * 4); // 0–3
        for (let i = 0; i < anzahl; i++) {
          const typ = ereignisTyp(profil);
          const e = neuesEreignis(k.id, s.id, typ, settings.mitarbeitPunkte[typ], st.id);
          e.timestamp = st.startTs + Math.floor(zufall() * 40) * 60000 + idx * 1000;
          e.quartal = st.quartal;
          e.halbjahr = st.halbjahr;
          ereignisse.push(e);
        }
      });
    });

    // Drei Schüler (schwache Profile) bekommen garantiert in jedem laufenden
    // Quartal mind. 3 vergessene HA – damit lässt sich der HA-Modus „note6"
    // (jede 3. vergessene HA = Note 6) testen.
    [2, 5, 8].forEach((sIdx) => {
      const s = schuelerListe[sIdx];
      [2, 3, 4].forEach((q) => {
        (quartalStunden[q] || []).slice(0, 3).forEach((st, i) => {
          const e = neuesEreignis(k.id, s.id, "keinehausaufgabe", settings.mitarbeitPunkte.keinehausaufgabe, st.id);
          e.timestamp = st.startTs + (i + 2) * 60000 + sIdx * 1000;
          e.quartal = st.quartal;
          e.halbjahr = st.halbjahr;
          ereignisse.push(e);
        });
      });
    });

    // Zwei Leistungsverweigerungen bei zwei Schülern in verschiedenen Quartalen
    [[1, 2], [7, 3]].forEach((paar) => {
      const st = (quartalStunden[paar[1]] || [])[10];
      if (!st) return;
      const e = neuesEreignis(k.id, schuelerListe[paar[0]].id, "verweigerung", 0, st.id);
      e.timestamp = st.startTs + 20 * 60000 + paar[0] * 1000;
      e.quartal = st.quartal;
      e.halbjahr = st.halbjahr;
      ereignisse.push(e);
    });
    await DB.bulkPut("ereignisse", ereignisse);

    // Schriftliche Noten über das ganze Schuljahr verteilt (profilbasiert)
    const noten = [];
    const kaDaten = ["2025-09-15", "2025-12-08", "2026-03-09", "2026-06-15"];
    const testDaten = ["2025-10-13", "2026-01-26", "2026-04-20", "2026-06-29"];
    schuelerListe.forEach((s, idx) => {
      const profil = profilVon(idx);
      kaDaten.forEach((datum, i) => {
        noten.push(neueNote({
          klasseId: k.id, schuelerId: s.id, kategorieId: kats[0].id,
          wert: profilNote(profil), titel: "Klassenarbeit " + (i + 1), datum
        }));
      });
      testDaten.forEach((datum, i) => {
        noten.push(neueNote({
          klasseId: k.id, schuelerId: s.id, kategorieId: kats[1].id,
          wert: profilNote(profil), titel: "Test " + (i + 1), datum
        }));
      });
      // 1. Quartal ist abgeschlossen: die mündliche Note wurde bereits als
      // ganze Note in „Mündliche Mitarbeit" übertragen (Datum im Oktober 2025).
      noten.push(neueNote({
        klasseId: k.id, schuelerId: s.id, kategorieId: kats[2].id,
        wert: q1Note(profil), titel: "Mündliche Mitarbeit 1. Quartal",
        datum: "2025-10-" + ("0" + (13 + (idx % 10))).slice(-2), quartal: 1
      }));
    });
    await DB.bulkPut("noten", noten);

    // Sitzplan füllen (3 Reihen × 5 Plätze, der letzte Platz bleibt frei)
    const plan = neuerSitzplan(k.id, 3, 5);
    schuelerListe.forEach((s, i) => { if (plan.seats[i]) plan.seats[i].schuelerId = s.id; });
    await Sitzplan.save(plan);

    return true;
  }

  global.Store = {
    uid, now,
    EVENT_TYPES, EVENT_TYPE_MAP, KACHEL_EVENT_TYPES, DEFAULT_SETTINGS,
    SCHEMA_VERSION, migrateSchema, halbjahrAusDatum, quartalAusDatum, halbjahrAusQuartal,
    getSettings, saveSettings, schwellenNormalisieren,
    Klassen, neueKlasse,
    Schueler, neuerSchueler,
    Kategorien, neueKategorie,
    Noten, neueNote,
    Sitzplan, neuerSitzplan,
    Ereignisse, neuesEreignis,
    Stunden, neueStunde,
    Abwesenheiten, datumLokal,
    addHeatPoints, currentHeatPoints, normalisiereSchuelerHeat,
    defaultStundenplan,
    exportAll, importAll, exportKlasse, importKlasse, haNote6Pruefen,
    seedDemoData
  };
})(window);
