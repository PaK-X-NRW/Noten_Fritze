/* =========================================================================
   store.js – Domänenschicht über der DB
   Definiert das Datenmodell, sinnvolle Defaults, Einstellungen sowie
   Repository-Funktionen je Entität. Erzeugt außerdem Demo-Daten.
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
  const EVENT_TYPES = [
    { id: "einfach",   label: "Wortmeldung",       kurz: "Meldung",  farbe: "#2e7d32", defaultPunkte: 1,  heatDelta: 1, positiv: true },
    { id: "gut",       label: "Gute Meldung",      kurz: "gut",      farbe: "#1565c0", defaultPunkte: 2,  heatDelta: 2, positiv: true },
    { id: "sehrgut",   label: "Sehr gute Meldung", kurz: "sehr gut", farbe: "#6a1b9a", defaultPunkte: 3,  heatDelta: 3, positiv: true },
    { id: "stoerung",  label: "Störung",           kurz: "Störung",  farbe: "#c62828", defaultPunkte: -2, heatDelta: 0, positiv: false },
    { id: "keinehausaufgabe", label: "Fehlende HA", kurz: "keine HA", farbe: "#b9770e", defaultPunkte: -1, heatDelta: 0, positiv: false }
  ];
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

  // ---- Standard-Einstellungen ----------------------------------------------
  const DEFAULT_SETTINGS = {
    key: "app",
    schemaVersion: 1,
    // Rundung der Gesamtnote: "keine" (2 NK), "eine" (1 NK), "ganze" (ganze Note)
    rundung: "eine",
    // Punkte je Ereignistyp (überschreibbar)
    mitarbeitPunkte: EVENT_TYPES.reduce((m, t) => (m[t.id] = t.defaultPunkte, m), {}),
    // Schwellen: Ø Punkte pro aktivem Tag -> Vorschlag Mitarbeitsnote
    mitarbeitSchwellen: [
      { abPunkte: 2.5, note: 1 },
      { abPunkte: 1.8, note: 2 },
      { abPunkte: 1.0, note: 3 },
      { abPunkte: 0.3, note: 4 },
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
      nebenfach: { schriftlich: 40, sonstige: 60 }
    }
  };

  // ---- Einstellungen -------------------------------------------------------
  async function getSettings() {
    let s = await DB.get("einstellungen", "app");
    if (!s) {
      s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      await DB.put("einstellungen", s);
    }
    // Fehlende Felder aus Defaults ergänzen (Vorwärtskompatibilität)
    s = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s);
    if (s.heatPunktVerfallProMinuten && !s.heatVerfallMinuten) {
      s.heatVerfallMinuten = s.heatPunktVerfallProMinuten;
    }
    return s;
  }
  async function saveSettings(s) {
    s.key = "app";
    return DB.put("einstellungen", s);
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
      anteilSchriftlich: 50,       // %
      anteilSonstige: 50,          // %
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
  const Schueler = {
    async byKlasse(klasseId) {
      const settings = await getSettings();
      const list = await DB.getAllByIndex("schueler", "klasseId", klasseId);
      return list.map((s) => normalisiereSchuelerHeat(s, settings)).sort((a, b) => a.sortIndex - b.sortIndex);
    },
    async get(id) {
      const s = await DB.get("schueler", id);
      return normalisiereSchuelerHeat(s, await getSettings());
    },
    async save(s) { normalisiereSchuelerHeat(s, await getSettings()); s.updatedAt = now(); return DB.put("schueler", s); },
    async remove(id) {
      await DB.delByIndex("noten", "schuelerId", id);
      await DB.delByIndex("ereignisse", "schuelerId", id);
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
    return Object.assign({
      id: uid(),
      klasseId: null,
      schuelerId: null,
      kategorieId: null,
      wert: null,           // Zahl 1..6 (mit Nachkomma, z. B. 2.3)
      titel: "",
      datum: new Date().toISOString().slice(0, 10),
      createdAt: now()
    }, data || {});
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
  function neuesEreignis(klasseId, schuelerId, typ, punkte) {
    return {
      id: uid(),
      klasseId,
      schuelerId,
      typ,
      punkte,           // zum Zeitpunkt der Erfassung eingefrorene Punktzahl
      timestamp: now(),
      notiz: ""
    };
  }
  const Ereignisse = {
    byKlasse: (klasseId) => DB.getAllByIndex("ereignisse", "klasseId", klasseId),
    bySchueler: (schuelerId) => DB.getAllByIndex("ereignisse", "schuelerId", schuelerId),
    save: (e) => DB.put("ereignisse", e),
    remove: (id) => DB.del("ereignisse", id)
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

  // ---- Backup (Gesamt-Export/Import als JSON) ------------------------------
  async function exportAll() {
    const [klassen, schueler, kategorien, noten, sitzplaene, ereignisse, settings] = await Promise.all([
      DB.getAll("klassen"), DB.getAll("schueler"), DB.getAll("kategorien"),
      DB.getAll("noten"), DB.getAll("sitzplaene"), DB.getAll("ereignisse"), getSettings()
    ]);
    return {
      app: "noten-fritze", schemaVersion: DB.DB_VERSION, exportedAt: new Date().toISOString(),
      data: { klassen, schueler, kategorien, noten, sitzplaene, ereignisse, settings }
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
    if (d.settings) await saveSettings(d.settings);
  }

  // ---- Demo-Daten ----------------------------------------------------------
  async function seedDemoData() {
    const klassen = await Klassen.all();
    if (klassen.length > 0) return false; // Nur wenn leer

    const k = neueKlasse({
      name: "8b", schuljahr: "2025/26", fach: "Mathematik", typ: "hauptfach",
      anteilSchriftlich: 50, anteilSonstige: 50,
      notizen: "Demo-Klasse. Kann gefahrlos gelöscht werden."
    });
    await Klassen.save(k);

    const namen = [
      ["Anna", "Bauer"], ["Ben", "Fischer"], ["Clara", "Weber"], ["David", "Wagner"],
      ["Emma", "Becker"], ["Finn", "Schulz"], ["Greta", "Hoffmann"], ["Hannes", "Koch"],
      ["Ida", "Richter"], ["Jonas", "Klein"], ["Klara", "Wolf"], ["Leon", "Neumann"]
    ];
    const schuelerListe = namen.map((n, i) => neuerSchueler(k.id, { vorname: n[0], nachname: n[1], sortIndex: i }));
    await DB.bulkPut("schueler", schuelerListe);

    const kats = [
      neueKategorie(k.id, { name: "Klassenarbeit", art: "schriftlich", gewichtung: 2, sortIndex: 0 }),
      neueKategorie(k.id, { name: "Test",          art: "schriftlich", gewichtung: 1, sortIndex: 1 }),
      neueKategorie(k.id, { name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2, sortIndex: 2 }),
      neueKategorie(k.id, { name: "Hausaufgaben",   art: "sonstige", gewichtung: 1, sortIndex: 3 })
    ];
    await DB.bulkPut("kategorien", kats);

    // Ein paar zufällige, plausible Noten
    const noten = [];
    schuelerListe.forEach((s) => {
      kats.forEach((kat) => {
        const anzahl = kat.art === "schriftlich" ? 2 : 3;
        for (let i = 0; i < anzahl; i++) {
          const basis = 1.5 + Math.random() * 3.5; // 1,5 .. 5,0
          noten.push(neueNote({
            klasseId: k.id, schuelerId: s.id, kategorieId: kat.id,
            wert: Math.round(basis * 10) / 10,
            titel: kat.name + " " + (i + 1)
          }));
        }
      });
    });
    await DB.bulkPut("noten", noten);

    // Sitzplan füllen
    const plan = neuerSitzplan(k.id, 4, 6);
    schuelerListe.forEach((s, i) => { if (plan.seats[i]) plan.seats[i].schuelerId = s.id; });
    await Sitzplan.save(plan);

    // Ein paar Mitarbeitsereignisse der letzten Tage
    const settings = await getSettings();
    const ereignisse = [];
    schuelerListe.forEach((s, idx) => {
      const anzahl = Math.floor(Math.random() * 6);
      for (let i = 0; i < anzahl; i++) {
        const typ = EVENT_TYPES[Math.floor(Math.random() * 3)].id; // meist positiv
        const e = neuesEreignis(k.id, s.id, typ, settings.mitarbeitPunkte[typ]);
        e.timestamp = now() - Math.floor(Math.random() * 6) * 86400000 - idx * 1000;
        ereignisse.push(e);
      }
    });
    await DB.bulkPut("ereignisse", ereignisse);

    return true;
  }

  global.Store = {
    uid, now,
    EVENT_TYPES, EVENT_TYPE_MAP, DEFAULT_SETTINGS,
    getSettings, saveSettings,
    Klassen, neueKlasse,
    Schueler, neuerSchueler,
    Kategorien, neueKategorie,
    Noten, neueNote,
    Sitzplan, neuerSitzplan,
    Ereignisse, neuesEreignis,
    addHeatPoints, currentHeatPoints, normalisiereSchuelerHeat,
    exportAll, importAll, seedDemoData
  };
})(window);
