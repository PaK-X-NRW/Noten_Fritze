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

  Object.assign(global.Store, { seedDemoData });
})(window);
