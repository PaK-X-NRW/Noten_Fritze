/* =========================================================================
   store.js – Domänenschicht über der DB (Kern)
   Definiert das Datenmodell und die Repository-Funktionen je Entität
   (Klassen, Schüler, Kategorien, Leistungen/Spalten, Noten, Sitzplan,
   Ereignisse, Stunden, Abwesenheiten) sowie die Ereignistypen, die
   Heatmap-Punkte und die Quartals-/Halbjahres-Helfer.

   Der Store ist auf mehrere Dateien verteilt, die sich denselben Namespace
   teilen (Ladereihenfolge siehe index.html):
     store.js               – diese Datei: legt window.Store an
     store.einstellungen.js – Standardwerte und App-Einstellungen
     store.migrationen.js   – Daten-Migrationen (schemaVersion)
     store.transfer.js      – Backup und Klassen-Export/-Import
     store.demo.js          – Demo-Daten beim ersten Start
   ========================================================================= */
(function (global) {
  "use strict";

  // ---- Hilfsfunktionen ------------------------------------------------------
  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  const now = () => Date.now();

  // Einstellungen und Standardwerte liegen in store.einstellungen.js, das erst
  // nach dieser Datei geladen wird. Beide werden ausschließlich zur Laufzeit
  // gebraucht, deshalb hier über den Namespace holen statt beim Laden.
  const getSettings = () => global.Store.getSettings();
  const standardEinstellungen = () => global.Store.DEFAULT_SETTINGS;

  // ---- Ereignis-Typen (Mitarbeit) ------------------------------------------
  // Reihenfolge = Anzeige-Reihenfolge im Tracker.
  // aufKachel: true  -> eigener Button auf der Schülerkachel (mit icon)
  // aufKachel: false -> nur über einen Tracker-Modus in der Topbar erfassbar
  // heatSetting: Einstellung mit den Heatmap-Punkten dieses Typs (nur Meldungen)
  const EVENT_TYPES = [
    { id: "einfach",   label: "Wortmeldung",       kurz: "Meldung",  farbe: "#2e7d32", defaultPunkte: 1,  heatSetting: "heatPunkteEinfach", positiv: true,  aufKachel: true, icon: "★" },
    { id: "gut",       label: "Gute Meldung",      kurz: "gut",      farbe: "#1565c0", defaultPunkte: 2,  heatSetting: "heatPunkteGut",     positiv: true,  aufKachel: true, icon: "★★" },
    { id: "sehrgut",   label: "Sehr gute Meldung", kurz: "sehr gut", farbe: "#6a1b9a", defaultPunkte: 3,  heatSetting: "heatPunkteSehrGut", positiv: true,  aufKachel: true, icon: "★★★" },
    { id: "stoerung",  label: "Störung",           kurz: "Störung",  farbe: "#c62828", defaultPunkte: -2, positiv: false, aufKachel: true, icon: "⚡" },
    // Erfassung nur über Tracker-Modus: die Stunde zählt als Note 6 (Calc)
    { id: "verweigerung", label: "Leistungsverweigerung", kurz: "Verweigerung", farbe: "#4a148c", defaultPunkte: 0, positiv: false, aufKachel: false },
    { id: "keinehausaufgabe", label: "Fehlende HA", kurz: "keine HA", farbe: "#b9770e", defaultPunkte: -1, positiv: false, aufKachel: false }
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
      Number(settings && settings.heatStartWert != null ? settings.heatStartWert : standardEinstellungen().heatStartWert) || 0));
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
      // Abgeschlossene Quartale: [{ quartal: 1..4, datum: "YYYY-MM-DD" }].
      // Ein Eintrag sperrt das Quartal im Mitarbeit-Tab (siehe abschlussVon).
      abgeschlosseneQuartale: [],
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
      await DB.delByIndex("leistungen", "klasseId", id);
      await DB.delByIndex("noten", "klasseId", id);
      await DB.delByIndex("ereignisse", "klasseId", id);
      await DB.delByIndex("abwesenheiten", "klasseId", id);
      await DB.delByIndex("stunden", "klasseId", id);
      await DB.del("sitzplaene", id);
      await DB.del("klassen", id);
    }
  };

  // ---- Quartalsabschluss ---------------------------------------------------
  // „Quartal abschließen" löscht nichts mehr: Stunden und Ereignisse bleiben
  // erhalten, das Quartal wird an der Klasse als abgeschlossen vermerkt. Der
  // Mitarbeit-Tab zeigt es dann grau und gesperrt, bis der Abschluss wieder
  // aufgehoben wird.
  function abschlussVon(klasse, quartal) {
    const liste = (klasse && klasse.abgeschlosseneQuartale) || [];
    return liste.find((a) => a && a.quartal === quartal) || null;
  }
  async function quartalAbschliessen(klasse, quartal, datum) {
    if (!Array.isArray(klasse.abgeschlosseneQuartale)) klasse.abgeschlosseneQuartale = [];
    const vorhanden = abschlussVon(klasse, quartal);
    if (vorhanden) vorhanden.datum = datum || datumLokal();
    else klasse.abgeschlosseneQuartale.push({ quartal, datum: datum || datumLokal() });
    await Klassen.save(klasse);
    return klasse;
  }
  async function abschlussAufheben(klasse, quartal) {
    klasse.abgeschlosseneQuartale = ((klasse.abgeschlosseneQuartale) || [])
      .filter((a) => !a || a.quartal !== quartal);
    await Klassen.save(klasse);
    return klasse;
  }

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
      heatPoints: standardEinstellungen().heatStartWert,
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
      // Sitzplatz-Zuweisung in allen Sitzplänen der Klasse entfernen
      const s = await DB.get("schueler", id);
      if (s) {
        const rec = sitzplaeneNormalisieren(await DB.get("sitzplaene", s.klasseId));
        if (rec) {
          rec.plaene.forEach((p) => p.seats.forEach((seat) => { if (seat.schuelerId === id) seat.schuelerId = null; }));
          await DB.put("sitzplaene", rec);
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
      // Woher die Noten dieser Kategorie kommen:
      // "manuell"   = von Hand in der Notenübersicht erfasst
      // "mitarbeit" = wird durch „Quartal abschließen" im Mitarbeit-Tab gefüllt.
      //   Solange für ein Quartal keine solche Note vorliegt, bleibt dessen
      //   Epochalnote leer (das Quartal ist noch nicht abgeschlossen).
      quelle: "manuell",
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
      await DB.delByIndex("leistungen", "kategorieId", id);
      await DB.delByIndex("noten", "kategorieId", id);
      await DB.del("kategorien", id);
    }
  };

  // ---- Leistungen (Spalten der Notenübersicht) -----------------------------
  // Eine Leistung ist genau eine Spalte: „2. Klassenarbeit", „HÜ 10.09.",
  // „Mitarbeit 1. Quartal". Sie hängt an einer Kategorie (die das Gewicht
  // liefert) und an einem Quartal (das über die Epochalnote entscheidet).
  // Je Schüler/in steht in einer Leistung höchstens eine Note.
  function neueLeistung(klasseId, data) {
    const t = now();
    const datum = (data && data.datum) || datumLokal();
    return Object.assign({
      id: uid(),
      klasseId,
      kategorieId: null,
      quartal: quartalAusDatum(datum),
      titel: "",
      datum,
      sortIndex: t,
      createdAt: t
    }, data || {});
  }
  const Leistungen = {
    // Spaltenreihenfolge: erst Datum, bei gleichem Datum die Anlage-Reihenfolge.
    byKlasse: (klasseId) => DB.getAllByIndex("leistungen", "klasseId", klasseId)
      .then((list) => list.sort((a, b) =>
        (a.datum || "") === (b.datum || "")
          ? (a.sortIndex || 0) - (b.sortIndex || 0)
          : ((a.datum || "") < (b.datum || "") ? -1 : 1))),
    get: (id) => DB.get("leistungen", id),
    save: (l) => DB.put("leistungen", l),
    async remove(id) {
      await DB.delByIndex("noten", "leistungId", id);
      await DB.del("leistungen", id);
    }
  };

  // Leitet für Noten ohne leistungId die Spalten ab (Migration und Import
  // alter Exporte): gruppiert nach Kategorie/Quartal/Titel/Datum. Hat ein/e
  // Schüler/in in einer Gruppe mehrere Noten, entstehen entsprechend viele
  // Spalten – in einer Spalte steht nur eine Note. Setzt leistungId auf den
  // übergebenen Noten und liefert die neuen Leistungen zurück.
  function leistungenAusNoten(noten) {
    const gruppen = {};
    noten.forEach((n) => {
      if (n.leistungId) return;
      const q = n.quartal || quartalAusDatum(n.datum);
      const key = [n.klasseId, n.kategorieId, q, n.titel || "", n.datum || ""].join("|");
      (gruppen[key] = gruppen[key] || []).push(n);
    });
    const neue = [];
    Object.keys(gruppen).forEach((key) => {
      const liste = gruppen[key].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const proSchueler = {};   // schuelerId -> wievielte Note in dieser Gruppe
      const spalten = [];       // Index -> Leistung
      liste.forEach((n) => {
        const i = (proSchueler[n.schuelerId] = (proSchueler[n.schuelerId] || 0) + 1) - 1;
        if (!spalten[i]) {
          spalten[i] = neueLeistung(n.klasseId, {
            kategorieId: n.kategorieId,
            quartal: n.quartal || quartalAusDatum(n.datum),
            datum: n.datum, titel: n.titel || "",
            sortIndex: i, createdAt: n.createdAt || now()
          });
          neue.push(spalten[i]);
        }
        n.leistungId = spalten[i].id;
      });
    });
    return neue;
  }

  // Sucht die Spalte einer Kategorie im Quartal über ihren Titel oder legt sie
  // an – für automatisch erzeugte Noten (Quartalsabschluss, HA-Note 6).
  async function leistungFuer(klasseId, kategorieId, quartal, titel, datum) {
    const alle = await Leistungen.byKlasse(klasseId);
    const vorhanden = alle.find((l) =>
      l.kategorieId === kategorieId && l.quartal === quartal && (l.titel || "") === titel);
    if (vorhanden) return vorhanden;
    const l = neueLeistung(klasseId, {
      kategorieId, quartal, titel,
      datum: datum || datumLokal(), sortIndex: alle.length
    });
    await Leistungen.save(l);
    return l;
  }

  // ---- Noten (Einzelnoten) -------------------------------------------------
  function neueNote(data) {
    data = data || {};
    const datum = data.datum || datumLokal();
    // Quartal: vom Aufrufer übergeben oder aus dem Datum abgeleitet.
    // Wird es übergeben, leitet sich das Halbjahr daraus ab, sonst aus dem Datum.
    const quartal = data.quartal || quartalAusDatum(datum);
    return Object.assign({
      id: uid(),
      klasseId: null,
      schuelerId: null,
      kategorieId: null,
      leistungId: null,     // Spalte, zu der die Note gehört (siehe Leistungen)
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
    remove: (id) => DB.del("noten", id),
    // Eine Zelle der Notenübersicht setzen: In einer Leistung steht je
    // Schüler/in genau eine Note. wert === null löscht die Zelle; etwaige
    // Altbestände (mehrere Noten in derselben Zelle) werden dabei bereinigt.
    async setzeZelle(leistung, schuelerId, wert) {
      const alle = await DB.getAllByIndex("noten", "leistungId", leistung.id);
      const eigene = alle.filter((n) => n.schuelerId === schuelerId);
      for (const ueberzaehlig of eigene.slice(1)) await DB.del("noten", ueberzaehlig.id);
      if (wert === null || wert === undefined) {
        if (eigene[0]) await DB.del("noten", eigene[0].id);
        return null;
      }
      const n = eigene[0] || neueNote({
        klasseId: leistung.klasseId, schuelerId, kategorieId: leistung.kategorieId,
        leistungId: leistung.id
      });
      n.wert = wert;
      // Titel/Datum/Quartal folgen immer der Spalte
      n.titel = leistung.titel || "";
      n.datum = leistung.datum;
      n.quartal = leistung.quartal;
      n.halbjahr = halbjahrAusQuartal(leistung.quartal);
      n.kategorieId = leistung.kategorieId;
      await DB.put("noten", n);
      return n;
    }
  };

  // ---- Sitzplan ------------------------------------------------------------
  // Eine Klasse kann mehrere Sitzpläne haben (je Raum einen). Im Store
  // "sitzplaene" liegt je Klasse EIN Datensatz (Schlüssel klasseId):
  //   { klasseId, plaene: [{ id, name, klasseId, rows, cols, seats }], aktivId, updatedAt }
  // aktivId = zuletzt benutzter Plan (Vorauswahl im Reiter und beim Tracker-Start).
  function neuerSitzplan(klasseId, rows, cols, name) {
    rows = rows || 4; cols = cols || 6;
    const seats = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        seats.push({ id: r + "-" + c, row: r, col: c, schuelerId: null });
    return { id: uid(), name: name || "Klassenraum", klasseId, rows, cols, seats, updatedAt: now() };
  }
  // Bringt einen Datensatz auf die Form mit mehreren Plänen. Ältere Daten
  // (ein einzelner Plan mit seats direkt am Datensatz) werden zum Plan
  // „Klassenraum". Rückgabe: normalisierter Datensatz oder null.
  function sitzplaeneNormalisieren(rec) {
    if (!rec) return null;
    if (Array.isArray(rec.plaene) && rec.plaene.length) {
      rec.plaene.forEach((p) => { p.klasseId = rec.klasseId; if (!p.name) p.name = "Klassenraum"; });
      if (!rec.plaene.some((p) => p.id === rec.aktivId)) rec.aktivId = rec.plaene[0].id;
      return rec;
    }
    const plan = neuerSitzplan(rec.klasseId, rec.rows, rec.cols, "Klassenraum");
    if (Array.isArray(rec.seats)) plan.seats = rec.seats;
    return { klasseId: rec.klasseId, plaene: [plan], aktivId: plan.id, updatedAt: rec.updatedAt || now() };
  }
  const Sitzplan = {
    // Alle Pläne einer Klasse (legt bei Bedarf den ersten an bzw. wandelt alte Daten um).
    async alle(klasseId) {
      const rec = await DB.get("sitzplaene", klasseId);
      if (rec && Array.isArray(rec.plaene) && rec.plaene.length) return sitzplaeneNormalisieren(rec);
      const neu = rec ? sitzplaeneNormalisieren(rec)
        : { klasseId, plaene: [neuerSitzplan(klasseId)], aktivId: null, updatedAt: now() };
      if (!neu.aktivId) neu.aktivId = neu.plaene[0].id;
      await DB.put("sitzplaene", neu);
      return neu;
    },
    // Ein Plan: der gewünschte, sonst der zuletzt benutzte, sonst der erste.
    async get(klasseId, planId) {
      const rec = await Sitzplan.alle(klasseId);
      return rec.plaene.find((p) => p.id === planId) ||
        rec.plaene.find((p) => p.id === rec.aktivId) || rec.plaene[0];
    },
    // Speichert einen Plan (ersetzt ihn über seine id oder hängt ihn an).
    async save(plan) {
      plan.updatedAt = now();
      // Noch kein Datensatz: dieser Plan wird der erste (kein zusätzlicher Standardplan).
      if (!(await DB.get("sitzplaene", plan.klasseId))) {
        return DB.put("sitzplaene", { klasseId: plan.klasseId, plaene: [plan], aktivId: plan.id, updatedAt: now() });
      }
      const rec = await Sitzplan.alle(plan.klasseId);
      const i = rec.plaene.findIndex((p) => p.id === plan.id);
      if (i === -1) rec.plaene.push(plan); else rec.plaene[i] = plan;
      rec.updatedAt = now();
      return DB.put("sitzplaene", rec);
    },
    // Neuer Plan; mit vorlage als Kopie (Raster + Zuweisungen), sonst leer.
    async neu(klasseId, name, vorlage) {
      const plan = neuerSitzplan(klasseId, vorlage ? vorlage.rows : null, vorlage ? vorlage.cols : null, name);
      if (vorlage) plan.seats = vorlage.seats.map((s) => Object.assign({}, s));
      const rec = await Sitzplan.alle(klasseId);
      rec.plaene.push(plan);
      rec.aktivId = plan.id;
      rec.updatedAt = now();
      await DB.put("sitzplaene", rec);
      return plan;
    },
    async setAktiv(klasseId, planId) {
      const rec = await Sitzplan.alle(klasseId);
      if (rec.aktivId === planId || !rec.plaene.some((p) => p.id === planId)) return;
      rec.aktivId = planId;
      return DB.put("sitzplaene", rec);
    },
    // Löscht einen Plan; der letzte Plan einer Klasse bleibt immer erhalten.
    async remove(klasseId, planId) {
      const rec = await Sitzplan.alle(klasseId);
      if (rec.plaene.length <= 1) return false;
      rec.plaene = rec.plaene.filter((p) => p.id !== planId);
      if (rec.aktivId === planId) rec.aktivId = rec.plaene[0].id;
      rec.updatedAt = now();
      await DB.put("sitzplaene", rec);
      return true;
    }
  };

  // ---- Ereignisse (Mitarbeit) ----------------------------------------------
  // quartal: i. d. R. settings.aktuellesQuartal; ohne Angabe aus dem Datum.
  function neuesEreignis(klasseId, schuelerId, typ, punkte, stundeId, quartal) {
    const datum = datumLokal();
    const q = parseInt(quartal, 10) || quartalAusDatum(datum);
    return {
      id: uid(),
      klasseId,
      schuelerId,
      stundeId: stundeId || null,   // Unterrichtsstunde, in der erfasst wurde
      typ,
      punkte,           // zum Zeitpunkt der Erfassung eingefrorene Punktzahl
      timestamp: now(),
      quartal: q,                          // 1–4
      halbjahr: halbjahrAusQuartal(q),     // abgeleitet (Legacy-Feld)
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

  // ---- HA-Modus „note6": automatische Note 6 --------------------------------
  // Meldet, ob mit der gerade erfassten vergessenen Hausaufgabe eine volle
  // Dreiergruppe (3., 6., 9. …) im Quartal erreicht ist. Nur relevant, wenn
  // settings.haModus === "note6".
  // Die Note 6 wird bewusst NICHT als eigene Spalte in die Notenübersicht
  // geschrieben: Aus dem Mitarbeitsbereich erscheint dort nur die fertige
  // Mitarbeitsnote des abgeschlossenen Quartals. Stattdessen zählt jede
  // Dreiergruppe in `Calc.auswertungMitarbeit` als zusätzliche Stundennote 6
  // und landet so im Notenvorschlag – und mit dem Abschluss in der Note.
  // Rückgabe: true, wenn die Zählung gerade eine Dreiergruppe voll gemacht hat.
  async function haNote6Pruefen(klasseId, schuelerId, quartal) {
    const settings = await getSettings();
    if (settings.haModus !== "note6") return false;
    const ereignisse = await Ereignisse.bySchueler(schuelerId);
    const anzahl = ereignisse.filter((e) =>
      e.klasseId === klasseId && e.typ === "keinehausaufgabe" && e.quartal === quartal
    ).length;
    return anzahl > 0 && anzahl % 3 === 0;
  }

  // Die übrigen Store-Teile hängen sich per Object.assign an diesen Namespace
  // (store.einstellungen.js, store.migrationen.js, store.transfer.js,
  // store.demo.js) – siehe Kopfkommentar.
  global.Store = {
    uid, now,
    EVENT_TYPES, EVENT_TYPE_MAP, KACHEL_EVENT_TYPES,
    halbjahrAusDatum, quartalAusDatum, halbjahrAusQuartal, datumLokal,
    Klassen, neueKlasse,
    abschlussVon, quartalAbschliessen, abschlussAufheben,
    Schueler, neuerSchueler,
    Kategorien, neueKategorie,
    Leistungen, neueLeistung, leistungFuer, leistungenAusNoten,
    Noten, neueNote,
    Sitzplan, neuerSitzplan, sitzplaeneNormalisieren,
    Ereignisse, neuesEreignis,
    Stunden, neueStunde,
    Abwesenheiten,
    normalisiereSchuelerHeat,
    haNote6Pruefen
  };
})(window);
