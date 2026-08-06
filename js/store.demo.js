/* =========================================================================
   store.demo.js – Demo-Daten (Klasse 8b)
   Erweitert den Store-Namespace um seedDemoData(): legt beim allerersten
   Start (leere Datenbank) eine vollständige Beispielklasse an – Schüler,
   Kategorien, Spalten (Leistungen), Noten, Stunden, Ereignisse,
   Abwesenheiten und Sitzplan.
   Diese Datei lädt zuletzt, weil sie alle übrigen Store-Teile benutzt.
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    now, datumLokal, quartalAusDatum, getSettings,
    Klassen, neueKlasse, neuerSchueler, neueKategorie,
    neueLeistung, neueNote, neuesEreignis, neueStunde,
    Sitzplan, neuerSitzplan
  } = global.Store;

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

    // Notenwert um die Profil-Basis (stark ~1,8 / mittel ~2,8 / schwach ~4,0),
    // auf die Drittelskala gerundet – erfasst werden immer echte Noten (2+, 3, 4-).
    function profilNote(profil) {
      const basis = profil === "stark" ? 1.8 : profil === "mittel" ? 2.8 : 4.0;
      return Calc.tendenznote(basis + (zufall() - 0.5) * 1.6);
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
      // Wird über „Quartal abschließen“ gefüllt – daran hängt die Epochalnote
      neueKategorie(k.id, { name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2, sortIndex: 2, quelle: "mitarbeit" }),
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

    // Spalten (Leistungen) über das ganze Schuljahr verteilt; je Spalte
    // bekommt jede/r Schüler/in genau eine Note (profilbasiert).
    const spalten = [];
    let spaltenNr = 0;
    function demoSpalte(kategorie, titel, datum) {
      const l = neueLeistung(k.id, {
        kategorieId: kategorie.id, titel, datum, sortIndex: spaltenNr++
      });
      spalten.push(l);
      return l;
    }
    const kaSpalten = ["2025-09-15", "2025-12-08", "2026-03-09", "2026-06-15"]
      .map((datum, i) => demoSpalte(kats[0], "Klassenarbeit " + (i + 1), datum));
    const testSpalten = ["2025-10-13", "2026-01-26", "2026-04-20", "2026-06-29"]
      .map((datum, i) => demoSpalte(kats[1], "Test " + (i + 1), datum));
    // 1. Quartal ist abgeschlossen: die mündliche Note wurde bereits als
    // ganze Note in „Mündliche Mitarbeit" übertragen.
    const muendlichQ1 = demoSpalte(kats[2], "Mitarbeit 1. Quartal", "2025-10-20");
    await DB.bulkPut("leistungen", spalten);

    const noten = [];
    function demoNote(leistung, s, wert) {
      noten.push(neueNote({
        klasseId: k.id, schuelerId: s.id, kategorieId: leistung.kategorieId,
        leistungId: leistung.id, wert, titel: leistung.titel,
        datum: leistung.datum, quartal: leistung.quartal
      }));
    }
    schuelerListe.forEach((s, idx) => {
      const profil = profilVon(idx);
      kaSpalten.forEach((l) => demoNote(l, s, profilNote(profil)));
      testSpalten.forEach((l) => demoNote(l, s, profilNote(profil)));
      demoNote(muendlichQ1, s, q1Note(profil));
    });
    await DB.bulkPut("noten", noten);

    // Sitzplan füllen (3 Reihen × 5 Plätze, der letzte Platz bleibt frei)
    const plan = neuerSitzplan(k.id, 3, 5);
    schuelerListe.forEach((s, i) => { if (plan.seats[i]) plan.seats[i].schuelerId = s.id; });
    await Sitzplan.save(plan);

    return true;
  }

  // =========================================================================
  //  Beispielklassen „Musterjahr" – ein komplett durchgespieltes Schuljahr
  // =========================================================================
  // Zwei Klassen zum Ausprobieren und Nachvollziehen der Rechenkette:
  //   „9a (Musterjahr)"     – Sekundarstufe I mit Schulnoten
  //   „Mathematik LK 12"    – Oberstufe mit MSS-Punkten (0–15)
  // In beiden sind Q1–Q3 abgeschlossen (Stunden und Meldungen bleiben dabei
  // erhalten und sind grau sichtbar), Q4 läuft noch – damit lässt sich
  // „Quartal abschließen" einmal selbst durchspielen. Anders als seedDemoData
  // läuft das auch, wenn schon Klassen vorhanden sind; eine gleichnamige
  // Klasse wird übersprungen.
  const SEK1_NAMEN = [
    ["Alina", "Böhm"], ["Bastian", "Grüner"], ["Charlotte", "Meier"], ["Dennis", "Ostermann"],
    ["Elif", "Yildiz"], ["Fabian", "Krause"], ["Greta", "Lindner"], ["Henri", "Sommer"],
    ["Isabel", "Vogt"], ["Jakob", "Reuter"], ["Lea", "Hartmann"], ["Milan", "Petrov"],
    ["Nora", "Sander"], ["Oskar", "Thiel"]
  ];
  const MSS_NAMEN = [
    ["Lena", "Achtermann"], ["Tim", "Brenner"], ["Sofia", "Castell"], ["Marek", "Dombrowski"],
    ["Ines", "Ehlers"], ["Paul", "Frühauf"], ["Yara", "Günther"], ["Rasmus", "Holm"],
    ["Judith", "Ibrahim"], ["Konstantin", "Jäger"], ["Meret", "Kowalski"], ["Ferdinand", "Lorenz"]
  ];
  // Abschlussdaten der drei fertigen Quartale (jeweils am Quartalsende)
  const ABSCHLUSS_DATEN = { 1: "2025-10-24", 2: "2026-01-30", 3: "2026-04-30" };

  async function seedBeispielklassen() {
    const settings = await getSettings();
    const vorhandene = await Klassen.all();
    const namenVorhanden = {};
    vorhandene.forEach((k) => { namenVorhanden[k.name] = true; });

    const konfigurationen = [
      {
        seed: 20250812, mss: false,
        klasse: {
          name: "9a (Musterjahr)", schuljahr: "2025/26", fach: "Mathematik", typ: "hauptfach",
          klassenstufe: 9, anteilSchriftlich: 50, anteilSonstige: 50,
          notizen: "Beispielklasse mit komplettem Schuljahr: 1.–3. Quartal abgeschlossen, " +
            "4. Quartal läuft noch. Kann gefahrlos gelöscht werden."
        },
        namen: SEK1_NAMEN,
        kategorien: [
          { name: "Klassenarbeit", art: "schriftlich", gewichtung: 1 },
          { name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2, quelle: "mitarbeit" },
          { name: "Test", art: "sonstige", gewichtung: 2 },
          { name: "HÜ", art: "sonstige", gewichtung: 1 },
          { name: "Hausaufgaben", art: "sonstige", gewichtung: 1, anzeige: "fehlendeHA" }
        ],
        spalten: [
          { kat: "Klassenarbeit", titel: "Klassenarbeit 1", datum: "2025-09-15" },
          { kat: "Klassenarbeit", titel: "Klassenarbeit 2", datum: "2025-12-08" },
          { kat: "Klassenarbeit", titel: "Klassenarbeit 3", datum: "2026-03-09" },
          { kat: "Klassenarbeit", titel: "Klassenarbeit 4", datum: "2026-06-15" },
          { kat: "Test", titel: "Test 1", datum: "2025-08-26" },
          { kat: "Test", titel: "Test 2", datum: "2025-11-18" },
          { kat: "Test", titel: "Test 3", datum: "2026-02-24" },
          { kat: "Test", titel: "Test 4", datum: "2026-05-26" },
          { kat: "HÜ", titel: "HÜ 1", datum: "2025-09-30" },
          { kat: "HÜ", titel: "HÜ 2", datum: "2026-01-13" },
          { kat: "HÜ", titel: "HÜ 3", datum: "2026-04-21" },
          { kat: "HÜ", titel: "HÜ 4", datum: "2026-06-23" }
        ]
      },
      {
        seed: 20250910, mss: true,
        quoten: { stark: 0.95, mittel: 0.75, schwach: 0.45 },
        klasse: {
          name: "Mathematik LK 12", schuljahr: "2025/26", fach: "Mathematik", typ: "hauptfach",
          klassenstufe: 12, anteilSchriftlich: 50, anteilSonstige: 50,
          notizen: "Oberstufen-Beispielkurs mit MSS-Punkten (0–15): jedes Kurshalbjahr ist eine " +
            "eigene Endnote, es gibt keine Jahresnote. 1.–3. Quartal abgeschlossen, 4. Quartal läuft."
        },
        namen: MSS_NAMEN,
        kategorien: [
          { name: "Kursarbeit", art: "schriftlich", gewichtung: 1 },
          { name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2, quelle: "mitarbeit" },
          { name: "Test", art: "sonstige", gewichtung: 2 }
        ],
        spalten: [
          { kat: "Kursarbeit", titel: "Kursarbeit 1", datum: "2025-09-22" },
          { kat: "Kursarbeit", titel: "Kursarbeit 2", datum: "2025-12-11" },
          { kat: "Kursarbeit", titel: "Kursarbeit 3", datum: "2026-03-12" },
          { kat: "Kursarbeit", titel: "Kursarbeit 4", datum: "2026-06-11" },
          { kat: "Test", titel: "Test 1", datum: "2025-09-02" },
          { kat: "Test", titel: "Test 2", datum: "2025-11-25" },
          { kat: "Test", titel: "Test 3", datum: "2026-03-03" },
          { kat: "Test", titel: "Test 4", datum: "2026-06-02" }
        ]
      }
    ];

    const angelegt = [];
    for (const cfg of konfigurationen) {
      if (namenVorhanden[cfg.klasse.name]) continue;
      await musterklasseAnlegen(cfg, settings);
      angelegt.push(cfg.klasse.name);
    }
    return angelegt;
  }

  async function musterklasseAnlegen(cfg, settings) {
    // Reproduzierbarer Pseudozufall (LCG mit festem Startwert)
    let seed = cfg.seed;
    function zufall() {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    }

    const k = neueKlasse(cfg.klasse);
    // Q1–Q3 sind abgeschlossen: gesperrt im Mitarbeit-Tab, Daten bleiben stehen
    k.abgeschlosseneQuartale = [1, 2, 3].map((q) => ({ quartal: q, datum: ABSCHLUSS_DATEN[q] }));
    await Klassen.save(k);

    const PROFILE = ["stark", "mittel", "schwach"];
    const profilVon = (i) => PROFILE[i % PROFILE.length];
    const schuelerListe = cfg.namen.map((n, i) =>
      neuerSchueler(k.id, { vorname: n[0], nachname: n[1], sortIndex: i }));
    await DB.bulkPut("schueler", schuelerListe);

    // Note einer Spalte: Sek I auf der Drittelskala (2+, 3, 4-),
    // Oberstufe als ganze MSS-Punktzahl.
    function spaltenNote(profil) {
      if (cfg.mss) {
        const basis = profil === "stark" ? 12 : profil === "mittel" ? 8 : 4;
        return Math.max(0, Math.min(15, Math.round(basis + (zufall() - 0.5) * 4)));
      }
      const basis = profil === "stark" ? 1.8 : profil === "mittel" ? 2.8 : 4.0;
      return Calc.tendenznote(basis + (zufall() - 0.5) * 1.4);
    }

    const kats = cfg.kategorien.map((c, i) => neueKategorie(k.id, Object.assign({ sortIndex: i }, c)));
    await DB.bulkPut("kategorien", kats);
    const katNach = {};
    kats.forEach((c) => { katNach[c.name] = c; });
    const mitarbeitKat = kats.find((c) => c.quelle === "mitarbeit");

    // Stunden: Dienstag und Donnerstag durchs ganze Schuljahr, alle beendet.
    // Auch in den abgeschlossenen Quartalen bleiben sie erhalten.
    const stunden = [];
    const ende = new Date(2026, 6, 9);
    for (let d = new Date(2025, 7, 12); d <= ende; d.setDate(d.getDate() + 1)) {
      const wt = d.getDay();
      if (wt !== 2 && wt !== 4) continue;
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

    // Vereinzelte Abwesenheiten (diese Tage zählen für die Betroffenen nicht)
    const abwesenheiten = [];
    const abwesendSet = new Set();
    [[1, 7], [4, 26], [8, 44], [11, 61]].forEach((paar) => {
      const s = schuelerListe[paar[0]], st = stunden[paar[1]];
      if (!s || !st) return;
      abwesenheiten.push({
        id: s.id + "_" + st.datum, klasseId: k.id,
        schuelerId: s.id, datum: st.datum, createdAt: now()
      });
      abwesendSet.add(s.id + "|" + st.datum);
    });
    await DB.bulkPut("abwesenheiten", abwesenheiten);

    // Meldungen je Stunde und Person, Verteilung nach Leistungsprofil
    function ereignisTyp(profil) {
      const r = zufall();
      if (profil === "stark") {
        if (r < 0.45) return "einfach";
        if (r < 0.8) return "gut";
        if (r < 0.96) return "sehrgut";
        return "stoerung";
      }
      if (profil === "mittel") {
        if (r < 0.55) return "einfach";
        if (r < 0.8) return "gut";
        if (r < 0.88) return "sehrgut";
        if (r < 0.95) return "stoerung";
        return "keinehausaufgabe";
      }
      if (r < 0.45) return "einfach";
      if (r < 0.62) return "gut";
      if (r < 0.82) return "stoerung";
      return "keinehausaufgabe";
    }
    const ereignisse = [];
    schuelerListe.forEach((s, idx) => {
      const profil = profilVon(idx);
      // Wie oft meldet sich diese Person überhaupt? Starke Profile fast jede
      // Stunde, schwache nur selten – daraus entstehen die Stundennoten. Im
      // Oberstufenkurs wird insgesamt reger mitgearbeitet (cfg.quoten).
      const quoten = cfg.quoten || { stark: 0.85, mittel: 0.6, schwach: 0.3 };
      const meldeQuote = quoten[profil];
      stunden.forEach((st) => {
        if (abwesendSet.has(s.id + "|" + st.datum)) return;
        if (zufall() > meldeQuote) return;              // stille Stunde
        const anzahl = 1 + (zufall() < 0.35 ? 1 : 0);   // 1–2 Ereignisse
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
    // Eine Leistungsverweigerung im 4. Quartal (Tracker-Modus 🚫)
    const q4Stunden = stunden.filter((st) => st.quartal === 4);
    if (q4Stunden.length > 6 && schuelerListe[2]) {
      const e = neuesEreignis(k.id, schuelerListe[2].id, "verweigerung", 0, q4Stunden[6].id);
      e.timestamp = q4Stunden[6].startTs + 20 * 60000;
      e.quartal = 4;
      e.halbjahr = q4Stunden[6].halbjahr;
      ereignisse.push(e);
    }
    await DB.bulkPut("ereignisse", ereignisse);

    // Spalten (Leistungen) und ihre Noten
    const spalten = cfg.spalten.map((sp, i) => neueLeistung(k.id, {
      kategorieId: katNach[sp.kat].id, titel: sp.titel, datum: sp.datum, sortIndex: i
    }));
    const noten = [];
    function noteAnlegen(leistung, s, wert) {
      noten.push(neueNote({
        klasseId: k.id, schuelerId: s.id, kategorieId: leistung.kategorieId,
        leistungId: leistung.id, wert, titel: leistung.titel,
        datum: leistung.datum, quartal: leistung.quartal
      }));
    }
    schuelerListe.forEach((s, idx) => {
      const profil = profilVon(idx);
      spalten.forEach((l) => noteAnlegen(l, s, spaltenNote(profil)));
    });

    // Die Mitarbeitsnoten der abgeschlossenen Quartale entstehen genau so, wie
    // es „Quartal abschließen" tut: eine Spalte je Quartal mit einer Note pro
    // Person. In der Sek I ist das der auf eine Note gerundete Vorschlag aus
    // den echten Stundennoten – die Rechnung lässt sich also nachvollziehen.
    // In der Oberstufe gibt es keine Umrechnung 1–6 -> Punkte; dort steht ein
    // zum Profil passender Punktwert, wie ihn die Lehrkraft eintragen würde.
    if (mitarbeitKat) {
      [1, 2, 3].forEach((q) => {
        const stundenQ = stunden.filter((st) => st.quartal === q);
        const ereignisseQ = ereignisse.filter((e) => e.quartal === q);
        const ausw = Calc.auswertungMitarbeit(ereignisseQ, settings, {
          abwesendTage: abwesendSet, stunden: stundenQ,
          schuelerIds: schuelerListe.map((s) => s.id),
          schwellen: settings.mitarbeitSchwellen
        });
        const leistung = neueLeistung(k.id, {
          kategorieId: mitarbeitKat.id, quartal: q,
          titel: "Mitarbeit " + q + ". Quartal", datum: ABSCHLUSS_DATEN[q],
          sortIndex: spalten.length
        });
        spalten.push(leistung);
        schuelerListe.forEach((s) => {
          const a = ausw[s.id];
          const vorschlag = a ? a.notenvorschlag : null;
          if (vorschlag === null || vorschlag === undefined) return;
          const note = Calc.tendenznote(vorschlag);
          noteAnlegen(leistung, s, cfg.mss ? Calc.noteZuMssPunkte(note) : note);
        });
      });
    }
    await DB.bulkPut("leistungen", spalten);
    await DB.bulkPut("noten", noten);

    // Sitzplan füllen
    const reihen = Math.ceil(schuelerListe.length / 5);
    const plan = neuerSitzplan(k.id, reihen, 5);
    schuelerListe.forEach((s, i) => { if (plan.seats[i]) plan.seats[i].schuelerId = s.id; });
    await Sitzplan.save(plan);

    return k;
  }

  Object.assign(global.Store, { seedDemoData, seedBeispielklassen });
})(window);
