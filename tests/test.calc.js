/* =========================================================================
   test.calc.js – Prüfungen der Rechenlogik (Calc)
   Die Beispiele stammen aus CLAUDE.md (Abschnitt 6) und Dev/Schuljahr-Schema.md (nur lokal).
   Ändert sich hier ein erwarteter Wert, ändert sich eine Note – das darf nur
   bewusst und mit Rücksprache passieren.
   ========================================================================= */
(function () {
  "use strict";
  const { gruppe, fall, gleich, nahe, wahr } = Test;

  // ---- Bausteine für Testdaten ----------------------------------------------
  function kat(id, art, gewichtung, extra) {
    return Object.assign({ id, name: id, art, gewichtung, anzeige: "note", quelle: "manuell" }, extra || {});
  }
  function note(kategorieId, wert, quartal) {
    return { kategorieId, wert, quartal };
  }
  const KLASSE = { anteilSchriftlich: 50, anteilSonstige: 50 };
  // Kategorien wie in Dev/Schuljahr-Schema.md (9a Mathematik, Hauptfach)
  const KATS = [
    kat("KA", "schriftlich", 1),
    kat("Mitarbeit", "sonstige", 2, { quelle: "mitarbeit" }),
    kat("Test", "sonstige", 2),
    kat("HÜ", "sonstige", 1)
  ];
  // Noten eines Halbjahres: [KA1, KA2], Q1 [Mitarbeit, Test, HÜ], Q2 [Mitarbeit, Test, HÜ]
  function halbjahrNoten(ka, q1, q2) {
    return [
      note("KA", ka[0], 1), note("KA", ka[1], 2),
      note("Mitarbeit", q1[0], 1), note("Test", q1[1], 1), note("HÜ", q1[2], 1),
      note("Mitarbeit", q2[0], 2), note("Test", q2[1], 2), note("HÜ", q2[2], 2)
    ];
  }

  gruppe("Noteneingabe (parseNote)", () => {
    fall("ganze Noten und Tendenzen", () => {
      gleich(Calc.parseNote("2"), 2);
      nahe(Calc.parseNote("2+"), 1.7);
      nahe(Calc.parseNote("2-"), 2.3);
      nahe(Calc.parseNote("4-"), 4.3);
    });
    fall("Dezimalzahlen mit Komma oder Punkt", () => {
      nahe(Calc.parseNote("2,3"), 2.3);
      nahe(Calc.parseNote("2.7"), 2.7);
    });
    fall("Werte außerhalb der Skala werden begrenzt", () => {
      gleich(Calc.parseNote("1+"), 1, "1+ (0,7) wird auf 1 begrenzt");
      gleich(Calc.parseNote("7"), 6);
    });
    fall("ungültige Eingaben ergeben null", () => {
      gleich(Calc.parseNote(""), null);
      gleich(Calc.parseNote("abc"), null);
      gleich(Calc.parseNote(null), null);
    });
    fall("MSS-Punkte: nur ganze Zahlen 0–15", () => {
      gleich(Calc.parseNote("11", true), 11);
      gleich(Calc.parseNote("0", true), 0);
      gleich(Calc.parseNote("16", true), 15);
      gleich(Calc.parseNote("2+", true), null);
      gleich(Calc.parseNote("10,5", true), null);
    });
  });

  gruppe("Drittelnoten (tendenznote / formatTendenz)", () => {
    fall("genau in der Mitte gewinnt die schlechtere Note", () => {
      nahe(Calc.tendenznote(2.15), 2.3);
      nahe(Calc.tendenznote(3.5), 3.7);
      nahe(Calc.tendenznote(1.85), 2);
    });
    fall("sonst die nächstliegende Stufe", () => {
      nahe(Calc.tendenznote(1.86), 2);
      nahe(Calc.tendenznote(1.76), 1.7);
      nahe(Calc.tendenznote(3.48), 3.3);
      nahe(Calc.tendenznote(4.18), 4.3);
      gleich(Calc.tendenznote(null), null);
    });
    fall("MSS: ganze Punkte, bei x,5 aufrunden", () => {
      gleich(Calc.tendenznote(10.5, true), 11);
      gleich(Calc.tendenznote(9.49, true), 9);
    });
    fall("Anzeige als Tendenz", () => {
      gleich(Calc.formatTendenz(1.7), "2+");
      gleich(Calc.formatTendenz(2), "2");
      gleich(Calc.formatTendenz(2.3), "2-");
      gleich(Calc.formatTendenz(4.3), "4-");
      gleich(Calc.formatTendenz(2.5), "2,5", "krumme Werte als Dezimalzahl");
      gleich(Calc.formatTendenz(null), "–");
      gleich(Calc.formatTendenz(11, true), "11");
    });
  });

  gruppe("Zeugnisskala (zeugnisnote / jahresnote)", () => {
    fall("Grenzen: genau auf der Grenze gewinnt die bessere Note", () => {
      gleich(Calc.zeugnisnote(1.5), 1);
      gleich(Calc.zeugnisnote(2.5), 2);
      gleich(Calc.zeugnisnote(3.5), 3);
      gleich(Calc.zeugnisnote(4.14), 4);
      gleich(Calc.zeugnisnote(4.15), 4.3);
      gleich(Calc.zeugnisnote(4.5), 4.3);
      gleich(Calc.zeugnisnote(4.51), 5);
      gleich(Calc.zeugnisnote(5.5), 5);
      gleich(Calc.zeugnisnote(5.51), 6);
    });
    fall("Anzeige: einzige Tendenz ist 4-", () => {
      gleich(Calc.formatZeugnisnote(4.3), "4-");
      gleich(Calc.formatZeugnisnote(3), "3");
      gleich(Calc.formatZeugnisnote(null), "–");
      gleich(Calc.formatZeugnisnote(12, true), "12");
    });
    fall("MSS: auf ganze Punkte, x,5 aufrunden", () => {
      gleich(Calc.zeugnisnote(10.5, true), 11);
      gleich(Calc.zeugnisnote(10.49, true), 10);
    });
    fall("Jahresnote 49/51: bei Gleichstand entscheidet das 2. Halbjahr", () => {
      gleich(Calc.jahresnote(4, 3), 3, "0,49 × 4 + 0,51 × 3 = 3,49");
      gleich(Calc.jahresnote(2, 3), 3);
      gleich(Calc.jahresnote(3, 2), 2);
      gleich(Calc.jahresnote(null, 3), null, "ohne 1. Halbjahr keine Jahresnote");
    });
  });

  gruppe("Umrechnung Note → MSS-Punkte", () => {
    fall("offizielle Tabelle (17 − Note × 3)", () => {
      gleich(Calc.noteZuMssPunkte(0.7), 15);
      gleich(Calc.noteZuMssPunkte(1), 14);
      gleich(Calc.noteZuMssPunkte(2), 11);
      gleich(Calc.noteZuMssPunkte(2.7), 9);
      gleich(Calc.noteZuMssPunkte(3.7), 6);
      gleich(Calc.noteZuMssPunkte(4.3), 4);
      gleich(Calc.noteZuMssPunkte(6), 0);
      gleich(Calc.noteZuMssPunkte(null), null);
    });
    fall("istMSS ab Klassenstufe 11", () => {
      gleich(Calc.istMSS({ klassenstufe: 10 }), false);
      gleich(Calc.istMSS({ klassenstufe: 11 }), true);
      gleich(Calc.istMSS({ klassenstufe: null }), false);
      gleich(Calc.istMSS(null), false);
    });
  });

  gruppe("Halbjahres-Kette (Beispiele aus Dev/Schuljahr-Schema.md)", () => {
    fall("Anna: Epochalnoten 2 / 2+, Zeugnis 2", () => {
      const e = Calc.halbjahrErgebnis(KATS, halbjahrNoten([2, 1.7], [2, 2, 1.3], [1.7, 1.7, 2]), KLASSE, 1, false);
      nahe(e.epochal[0].roh, 1.86, "Epochal 1 roh");
      nahe(e.epochal[0].note, 2, "Epochal 1");
      nahe(e.epochal[1].roh, 1.76, "Epochal 2 roh");
      nahe(e.epochal[1].note, 1.7, "Epochal 2");
      nahe(e.sonstigeRoh, 1.85, "Sonstige roh");
      nahe(e.sonstige, 2, "Sonstige");
      nahe(e.schriftlichRoh, 1.85, "Schriftlich roh");
      nahe(e.schriftlich, 2, "Schriftlich");
      gleich(e.zeugnis, 2, "Zeugnis");
    });
    fall("Ben: 3,5 auf der Grenze → ungerundete Werte entscheiden → 3", () => {
      const e = Calc.halbjahrErgebnis(KATS, halbjahrNoten([4, 3.3], [3.7, 3, 4], [3.7, 3.3, 3]), KLASSE, 1, false);
      nahe(e.epochal[0].note, 3.3, "Epochal 1 = 3-");
      nahe(e.epochal[1].note, 3.3, "Epochal 2 = 3-");
      nahe(e.schriftlich, 3.7, "Schriftlich = 4+");
      nahe(e.zeugnisRoh, 3.5, "Zeugnis roh");
      gleich(e.zeugnis, 3, "Zeugnis");
    });
    fall("Clara: 4,5 auf der Grenze → 4-", () => {
      const e = Calc.halbjahrErgebnis(KATS, halbjahrNoten([5, 4.3], [4, 4.3, 5], [4.3, 4, 4.3]), KLASSE, 1, false);
      nahe(e.epochal[0].note, 4.3, "Epochal 1 = 4-");
      nahe(e.epochal[1].note, 4.3, "Epochal 2 = 4-");
      nahe(e.schriftlich, 4.7, "Schriftlich = 5+");
      gleich(e.zeugnis, 4.3, "Zeugnis 4-");
    });
    fall("2. Halbjahr nutzt die Quartale 3 und 4", () => {
      const noten = halbjahrNoten([2, 1.7], [2, 2, 1.3], [1.7, 1.7, 2]).map((n) => Object.assign({}, n, { quartal: n.quartal + 2 }));
      const hj1 = Calc.halbjahrErgebnis(KATS, noten, KLASSE, 1, false);
      const hj2 = Calc.halbjahrErgebnis(KATS, noten, KLASSE, 2, false);
      gleich(hj1.zeugnis, null, "1. HJ leer");
      gleich(hj2.zeugnis, 2, "2. HJ");
      gleich(hj2.epochal.map((e) => e.quartal), [3, 4]);
    });
    fall("ohne Mitarbeitsnote bleibt die Epochalnote offen", () => {
      const noten = halbjahrNoten([2, 2], [2, 2, 2], [2, 2, 2]).filter((n) => !(n.kategorieId === "Mitarbeit" && n.quartal === 2));
      const e = Calc.halbjahrErgebnis(KATS, noten, KLASSE, 1, false);
      gleich(e.epochal[1].offen, true, "Q2 offen");
      gleich(e.epochal[1].note, null, "keine Epochalnote Q2");
      nahe(e.epochal[1].roh, 2, "Zwischenstand bleibt für die Herleitung");
      nahe(e.sonstige, 2, "Sonstige nur aus Q1");
    });
    fall("Klasse ohne Mitarbeits-Kategorie: Epochalnote sofort fertig", () => {
      const kats = [kat("KA", "schriftlich", 1), kat("Test", "sonstige", 1)];
      const e = Calc.halbjahrErgebnis(kats, [note("Test", 3, 1)], KLASSE, 1, false);
      gleich(e.epochal[0].offen, false);
      nahe(e.epochal[0].note, 3);
      gleich(e.zeugnis, 3, "ohne schriftliche Noten zählt sonstige 100 %");
      gleich(e.effAnteilO, 1);
    });
    fall("Zählkategorie (vergessene HA) geht nicht in die Note ein", () => {
      const kats = [kat("Test", "sonstige", 1), kat("HA", "sonstige", 5, { anzeige: "fehlendeHA" })];
      const e = Calc.halbjahrErgebnis(kats, [note("Test", 2, 1), note("HA", 6, 1)], KLASSE, 1, false);
      nahe(e.epochal[0].note, 2);
    });
    fall("Noten ohne Quartal zählen in jedem Zeitraum (Altbestand)", () => {
      const kats = [kat("Test", "sonstige", 1)];
      const e = Calc.halbjahrErgebnis(kats, [{ kategorieId: "Test", wert: 2 }], KLASSE, 2, false);
      nahe(e.sonstige, 2);
    });
    fall("Nebenfach 30/70", () => {
      const kats = [kat("KA", "schriftlich", 1), kat("Test", "sonstige", 1)];
      const e = Calc.halbjahrErgebnis(kats, [note("KA", 1, 1), note("Test", 3, 1)], { anteilSchriftlich: 30, anteilSonstige: 70 }, 1, false);
      nahe(e.zeugnisRoh, 2.4);
      gleich(e.zeugnis, 2);
    });
    fall("MSS: Lenas Epochalnote 10,5 → 11 Punkte", () => {
      const kats = [kat("Mitarbeit", "sonstige", 2, { quelle: "mitarbeit" }), kat("Test", "sonstige", 2)];
      const e = Calc.halbjahrErgebnis(kats, [note("Mitarbeit", 11, 1), note("Test", 10, 1)], KLASSE, 1, true);
      nahe(e.epochal[0].roh, 10.5);
      gleich(e.epochal[0].note, 11);
      gleich(e.zeugnis, 11);
    });
  });

  gruppe("Gewichtete Rechnung (berechneSchueler)", () => {
    fall("Zwei Ebenen: Kategorie-Ø, dann gewichtet", () => {
      const kats = [kat("KA", "schriftlich", 2), kat("Test", "schriftlich", 1)];
      const r = Calc.berechneSchueler(kats, [note("KA", 2, 1), note("KA", 3, 1), note("Test", 1, 1)], KLASSE, 1);
      nahe(r.schriftlich.schnitt, (2.5 * 2 + 1 * 1) / 3);
    });
    fall("Halbjahr: sonstige als Mittel der Quartals-Durchschnitte", () => {
      const kats = [kat("Test", "sonstige", 1)];
      const r = Calc.berechneSchueler(kats, [note("Test", 1, 1), note("Test", 1, 1), note("Test", 3, 2)], KLASSE, "hj1");
      nahe(r.sonstige.schnitt, 2, "(1 + 3) / 2, nicht (1+1+3)/3");
      gleich(r.sonstige.quartale.length, 2);
    });
    fall("Kategorie-Helfer", () => {
      gleich(Calc.istNotenKategorie(kat("a", "sonstige", 1)), true);
      gleich(Calc.istNotenKategorie(kat("a", "sonstige", 1, { anzeige: "fehlendeHA" })), false);
      gleich(Calc.istMitarbeitsKategorie(kat("m", "sonstige", 2, { quelle: "mitarbeit" })), true);
      gleich(Calc.istMitarbeitsKategorie(kat("m", "schriftlich", 2, { quelle: "mitarbeit" })), false);
      gleich(Calc.istMitarbeitsKategorie(kat("m", "sonstige", 2)), false);
    });
    fall("Zeitraum-Filter", () => {
      gleich(Calc.quartaleVonFilter(3), [3]);
      gleich(Calc.quartaleVonFilter("hj2"), [3, 4]);
      gleich(Calc.quartaleVonFilter(null), [1, 2, 3, 4]);
    });
  });

  // ---- Mitarbeit ------------------------------------------------------------
  function einstellungen(extra) {
    return Object.assign(JSON.parse(JSON.stringify(Store.DEFAULT_SETTINGS)), extra || {});
  }
  // Stunde an einem festen Tag (lokale Zeit), 45 oder 90 Minuten
  function stunde(id, tag, dauerMin) {
    const start = new Date(2025, 8, tag, 9, 0).getTime();
    return { id, datum: Store.datumLokal(new Date(start)), startTs: start, endeTs: start + dauerMin * 60000, dauerMin };
  }
  function ereignis(st, schuelerId, typ, minute) {
    return { schuelerId, stundeId: st.id, typ, punkte: Store.DEFAULT_SETTINGS.mitarbeitPunkte[typ], timestamp: st.startTs + (minute || 5) * 60000 };
  }
  function auswerten(ereignisse, stunden, ids, settings, abwesend) {
    return Calc.auswertungMitarbeit(ereignisse, settings || einstellungen(), {
      vonTs: 0, bisTs: new Date(2030, 0, 1).getTime(), stunden, schuelerIds: ids,
      abwesendTage: abwesend || new Set()
    });
  }

  gruppe("Mitarbeit (Stundennoten-Modell)", () => {
    fall("Schwellen: Punkte einer Stunde → Stundennote", () => {
      const sw = Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
      gleich([3, 2, 1, 0, -1, -2, 2.5].map((p) => Calc.punkteZuNote(p, sw)), [1, 2, 3, 4, 5, 6, 2]);
    });
    fall("Beispielstunde: Anna 1 · Ben 5 · Clara 4", () => {
      const st = stunde("s1", 16, 45);
      const a = auswerten([ereignis(st, "anna", "sehrgut"), ereignis(st, "ben", "einfach"), ereignis(st, "ben", "stoerung", 9)],
        [st], ["anna", "ben", "clara"]);
      gleich(a.anna.notenvorschlag, 1);
      gleich(a.ben.notenvorschlag, 5);
      gleich(a.clara.notenvorschlag, 4, "stille Stunde = 4");
      gleich(a.ben.meldungen, 1, "Störung ist keine Meldung");
      gleich(a.ben.punkte, -1);
    });
    fall("Doppelstunde zählt doppelt, Punkte je 45 Minuten", () => {
      const st = stunde("d1", 18, 90);
      const a = auswerten([ereignis(st, "anna", "gut")], [st], ["anna"]);
      gleich(a.anna.stundenGezaehlt, 2);
      gleich(a.anna.stundenNoten.map((x) => x.note), [3, 3], "2 Punkte / 2 Einheiten = 1 Punkt → 3");
    });
    fall("Leistungsverweigerung: Stunde = 6, Meldungen entfallen", () => {
      const st = stunde("v1", 16, 45);
      const a = auswerten([ereignis(st, "ben", "sehrgut"), ereignis(st, "ben", "verweigerung", 10)], [st], ["ben"]);
      gleich(a.ben.notenvorschlag, 6);
      gleich(a.ben.verweigerungen, 1);
    });
    fall("Abwesenheit: Tag zählt nicht", () => {
      const st1 = stunde("a1", 16, 45), st2 = stunde("a2", 17, 45);
      const a = auswerten([ereignis(st2, "clara", "sehrgut")], [st1, st2], ["clara"], null, new Set(["clara|" + st1.datum]));
      gleich(a.clara.stundenGezaehlt, 1);
      gleich(a.clara.notenvorschlag, 1);
    });
    fall("Notenvorschlag = Ø der Stundennoten (1 Nachkommastelle)", () => {
      const s = [stunde("n1", 15, 45), stunde("n2", 16, 45), stunde("n3", 17, 45)];
      const a = auswerten([ereignis(s[0], "x", "sehrgut"), ereignis(s[1], "x", "gut")], s, ["x"]);
      gleich(a.x.notenvorschlag, 2.3, "(1 + 2 + 4) / 3 = 2,33");
    });
    fall("HA-Modus „note6“: je 3 vergessene HA eine Stundennote 6, keine Minuspunkte", () => {
      const s = [stunde("h1", 15, 45), stunde("h2", 16, 45), stunde("h3", 17, 45)];
      const e = s.map((st) => ereignis(st, "x", "keinehausaufgabe"));
      const punkte = auswerten(e, s, ["x"]);
      gleich(punkte.x.notenvorschlag, 5, "Modus Punkte: jede Stunde -1 → 5");
      const note6 = auswerten(e, s, ["x"], einstellungen({ haModus: "note6" }));
      gleich(note6.x.haNoten, 1);
      gleich(note6.x.notenvorschlag, 4.5, "(4 + 4 + 4 + 6) / 4");
    });
    fall("Klassen-Schwellen schlagen die globalen", () => {
      const eigene = [{ abPunkte: 1, note: 1 }];
      gleich(Calc.schwellenFuer(einstellungen(), { mitarbeitSchwellen: eigene }), eigene);
      gleich(Calc.schwellenFuer(einstellungen(), { mitarbeitSchwellen: null }), Store.DEFAULT_SETTINGS.mitarbeitSchwellen);
    });
  });

  gruppe("Tracker: Stundenzeiten und Heatmap", () => {
    const plan = Store.defaultStundenzeiten();
    fall("laufende Stunde laut Stundenzeiten", () => {
      const dienstag = new Date(2025, 8, 16, 8, 10).getTime();
      const s = Calc.trackerSession(plan, dienstag, false);
      gleich(s.quelle, "plan");
      gleich(s.stundeNr, 1);
      gleich(s.dauerMin, 45);
      const d = Calc.trackerSession(plan, dienstag, true);
      gleich(d.dauerMin, 95, "Doppelstunde bis zum Ende der 2. Stunde (inkl. Pause)");
    });
    fall("Wochenende oder Pause: 45/90 Minuten ab jetzt", () => {
      const samstag = new Date(2025, 8, 20, 9, 0).getTime();
      gleich(Calc.aktuelleStunde(plan, samstag), null);
      const s = Calc.trackerSession(plan, samstag, true);
      gleich(s.quelle, "fallback");
      gleich(s.dauerMin, 90);
    });
    fall("Pausen zählen nicht als Stunde, Doppelstunde überspringt sie", () => {
      const grossePause = new Date(2025, 8, 16, 9, 40).getTime();
      gleich(Calc.aktuelleStunde(plan, grossePause), null, "Große Pause 09:35–09:55");
      const zweite = new Date(2025, 8, 16, 9, 0).getTime();
      const d = Calc.trackerSession(plan, zweite, true);
      gleich(d.stundeNr, 2);
      gleich(d.dauerMin, 45 + 20 + 45, "2. Stunde + Große Pause + 3. Stunde");
    });
    fall("vergessene Stunde: mit Zeitangabe ab dem Ende, ohne ab dem Folgetag", () => {
      const start = new Date(2025, 8, 16, 8, 0).getTime();
      const mit = { status: "offen", startTs: start, endeTs: start + 45 * 60000, datum: "2025-09-16" };
      wahr(!Calc.stundeVergessen(mit, start + 30 * 60000), "läuft noch");
      wahr(Calc.stundeVergessen(mit, start + 45 * 60000), "vorbei");
      wahr(!Calc.stundeVergessen(Object.assign({}, mit, { status: "beendet" }), start + 90 * 60000), "beendet ist nie vergessen");
      const ohne = { status: "offen", startTs: start, endeTs: null, datum: "2025-09-16" };
      wahr(!Calc.stundeVergessen(ohne, new Date(2025, 8, 16, 23, 59).getTime()), "gleicher Tag");
      wahr(Calc.stundeVergessen(ohne, new Date(2025, 8, 17, 0, 0).getTime()), "Folgetag");
    });
    fall("Nachtrag trägt die Zeit der Stunde, nicht die des Nachtragens", () => {
      const start = new Date(2025, 8, 16, 8, 0).getTime();
      const st = { startTs: start, endeTs: start + 45 * 60000 };
      gleich(Calc.erfassungsZeit(st, start + 10 * 60000), start + 10 * 60000, "während der Stunde: jetzt");
      const spaeter = new Date(2025, 9, 20, 11, 0).getTime();
      gleich(Calc.erfassungsZeit(st, spaeter), start + 45 * 60000 - 1000, "Wochen später: letzte Sekunde der Stunde");
      gleich(Store.datumLokal(new Date(Calc.erfassungsZeit({ startTs: start, endeTs: null }, spaeter))), "2025-09-16",
        "ohne Zeitangabe: Tag der Stunde");
    });
    fall("Heatmap-Verfall: Y Punkte je X Minuten", () => {
      const t0 = new Date(2025, 8, 16, 9, 0).getTime();
      nahe(Calc.heatPunkteAktuell(50, t0, 5, 1, t0 + 10 * 60000).heatPoints, 48);
      nahe(Calc.heatPunkteAktuell(1, t0, 5, 1, t0 + 60 * 60000).heatPoints, 0, "nie unter 0");
    });
  });

  gruppe("Stundenplan: Wochen, A/B-Wochen, Versionen", () => {
    fall("Montag und Kalenderwoche", () => {
      gleich(Calc.montagVon("2026-10-01"), "2026-09-28", "Donnerstag -> Montag");
      gleich(Calc.montagVon("2026-10-04"), "2026-09-28", "Sonntag gehört zur Woche davor");
      gleich(Calc.kalenderwoche("2026-09-28"), 40);
      gleich(Calc.kalenderwoche("2026-01-01"), 1);
      gleich(Calc.kalenderwoche("2027-01-01"), 53, "2026 hat 53 Kalenderwochen");
      gleich(Calc.datumPlusTage("2026-10-30", 3), "2026-11-02", "über die Zeitumstellung");
    });
    fall("A/B wechselt stur jede Woche, auch rückwärts", () => {
      const ab = [{ abMontag: "2026-09-28", woche: "A" }];
      gleich(["2026-09-30", "2026-10-07", "2026-10-14", "2026-09-21"].map((d) => Calc.abWoche(ab, d)), ["A", "B", "A", "B"]);
      gleich(Calc.abWoche([], "2026-09-30"), null, "ohne Einrichtung keine A/B-Wochen");
    });
    fall("Umstellen rechnet ab der Woche neu, frühere bleiben", () => {
      let ab = [{ abMontag: "2026-09-28", woche: "A" }];
      ab = Calc.abWocheSetzen(ab, "2026-10-21", "A");   // KW 43 wäre B
      gleich(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"].map((d) => Calc.abWoche(ab, d)),
        ["A", "B", "A", "A", "B"]);
      gleich(Calc.abWocheSetzen(ab, "2026-10-26", "B").length, 2, "passt schon: kein neuer Umschaltpunkt");
    });
    fall("gültige Version und Archiv", () => {
      const v = [{ id: "hj2", gueltigAb: "2027-02-01" }, { id: "erst", gueltigAb: null }];
      gleich(Calc.versionFuer(v, "2026-09-28").id, "erst");
      gleich(Calc.versionFuer(v, "2027-02-01").id, "hj2");
      gleich(Calc.versionBis(v, v[1]), "2027-01-31");
      wahr(!Calc.versionArchiviert(v, v[1], "2026-10-01"), "vor dem Wechsel aktuell");
      wahr(Calc.versionArchiviert(v, v[1], "2027-03-01"), "danach im Archiv");
      wahr(!Calc.versionArchiviert(v, v[0], "2026-10-01"), "künftiger Plan ist nicht archiviert");
    });
    fall("Einträge der Woche: jede Woche + passende A/B-Woche", () => {
      const version = { eintraege: [
        { tag: 1, blockId: "std-1", woche: "alle", klasseId: "k1" },
        { tag: 1, blockId: "std-2", woche: "A", klasseId: "k2" },
        { tag: 1, blockId: "std-2", woche: "B", titel: "AG" }
      ] };
      gleich(Calc.eintraegeDerWoche(version, "A").map((e) => e.klasseId || e.titel), ["k1", "k2"]);
      gleich(Calc.eintraegeDerWoche(version, "B").map((e) => e.klasseId || e.titel), ["k1", "AG"]);
    });
    fall("Tracker: Eintrag der laufenden Stunde und Doppelstunde", () => {
      const zeiten = Store.defaultStundenzeiten();
      const v = [{ id: "v", gueltigAb: null, eintraege: [
        { tag: 3, blockId: "std-3", woche: "alle", klasseId: "k", sitzplanId: "raum2" },
        { tag: 3, blockId: "std-4", woche: "alle", klasseId: "k" }
      ] }];
      const mittwoch = new Date(2026, 8, 30, 10, 0).getTime();   // 3. Stunde
      const r = Calc.eintragJetzt(v, [], [], zeiten, "k", mittwoch);
      gleich([r.eintrag.sitzplanId, r.folgeGleich], ["raum2", true]);
      gleich(Calc.eintragJetzt(v, [], [], zeiten, "andere", mittwoch), null);
      const ausfall = [{ art: "aenderung", aenderung: "ausfall", datum: "2026-09-30", blockId: "std-4", klasseId: "k" }];
      gleich(Calc.eintragJetzt(v, [], ausfall, zeiten, "k", mittwoch).folgeGleich, false, "4. Stunde fällt aus");
      const ferien = [{ art: "ferien", datum: "2026-09-28", bis: "2026-10-02" }];
      gleich(Calc.eintragJetzt(v, [], ferien, zeiten, "k", mittwoch), null, "in den Ferien kein Unterricht");
    });
  });

  gruppe("Kalender: tatsächlicher Tag, Monat, Farben", () => {
    const versionen = [{ id: "v", gueltigAb: null, eintraege: [
      { tag: 1, blockId: "std-1", woche: "alle", klasseId: "k1", sitzplanId: "r1" },
      { tag: 1, blockId: "std-2", woche: "alle", klasseId: "k2" },
      { tag: 3, blockId: "std-3", woche: "alle", titel: "Aufsicht" }
    ] }];
    const namen = (liste) => (liste || []).map((i) => i.typ === "termin" ? "T:" + i.termin.titel : (i.klasseId || i.titel));
    fall("Plan, Ausfall und Hinweis eines Tages", () => {
      const termine = [
        { art: "aenderung", aenderung: "ausfall", datum: "2026-09-28", blockId: "std-2", klasseId: "k2", notiz: "Wandertag" },
        { art: "aenderung", aenderung: "hinweis", datum: "2026-09-28", blockId: "std-1", klasseId: "k1", notiz: "Raum 204" }
      ];
      const p = Calc.tagesPlan(versionen, [], termine, "2026-09-28");
      gleich(namen(p.zellen["std-1"]), ["k1"]);
      gleich(p.zellen["std-1"][0].aenderung.notiz, "Raum 204");
      gleich(p.zellen["std-2"][0].aenderung.aenderung, "ausfall");
      gleich(namen(Calc.stundenFinden(p, "std-2")), [], "ausgefallen findet nicht statt");
      gleich(Calc.tagesPlan(versionen, [], termine, "2026-10-05").zellen["std-2"][0].aenderung, null, "nur an diesem Datum");
    });
    fall("Verschieben: am alten Platz vermerkt, am neuen Platz dabei (Raum bleibt)", () => {
      const termine = [{ art: "aenderung", aenderung: "verschoben", datum: "2026-09-28", blockId: "std-1", klasseId: "k1",
        nachDatum: "2026-10-01", nachBlockId: "std-5" }];
      const mo = Calc.tagesPlan(versionen, [], termine, "2026-09-28");
      gleich(namen(Calc.stundenFinden(mo, "std-1")), []);
      const neu = Calc.tagesPlan(versionen, [], termine, "2026-10-01").zellen["std-5"][0];
      gleich([neu.klasseId, neu.sitzplanId, !!neu.verschobenVon], ["k1", "r1", true]);
    });
    fall("Ferien: kein Unterricht, Termine und hergeschobene Stunden bleiben", () => {
      const termine = [
        { art: "ferien", titel: "Herbstferien", datum: "2026-09-28", bis: "2026-10-09" },
        { art: "konferenz", titel: "Konferenz", datum: "2026-09-30", blockId: null },
        { art: "klassenarbeit", titel: "KA", datum: "2026-09-30", blockId: "std-3", klasseId: "k1" }
      ];
      const p = Calc.tagesPlan(versionen, [], termine, "2026-09-30");
      gleich(p.frei.titel, "Herbstferien");
      gleich(namen(p.zellen["std-3"]), ["T:KA"], "Aufsicht entfällt, Termin bleibt");
      gleich(p.ganztags.map((t) => t.titel), ["Konferenz"]);
      gleich(Calc.ferienAm(termine, "2026-10-10"), null, "nach den Ferien");
    });
    fall("Monatsraster und nächste Termine", () => {
      const r = Calc.monatsRaster("2026-10");
      gleich([r.length, r[0][0], r[r.length - 1][6]], [5, "2026-09-28", "2026-11-01"]);
      const termine = [
        { art: "test", datum: "2026-10-20" }, { art: "test", datum: "2026-10-02" },
        { art: "ferien", datum: "2026-09-21", bis: "2026-10-01" }, { art: "aenderung", datum: "2026-10-01" }
      ];
      gleich(Calc.naechsteTermine(termine, "2026-09-30", 14).map((t) => t.datum), ["2026-09-21", "2026-10-02"]);
    });
    fall("Farbe je Klasse: gewählt, sonst fest aus der ID; neue Klassen bekommen eine freie", () => {
      gleich(Calc.klassenFarbe({ id: "x", farbe: "#123456" }), "#123456");
      gleich(Calc.klassenFarbe({ id: "abc" }), Calc.klassenFarbe({ id: "abc" }));
      const belegt = [{ id: "a", farbe: Calc.KLASSEN_FARBEN[0] }];
      gleich(Calc.freieKlassenFarbe(belegt), Calc.KLASSEN_FARBEN[1]);
    });
  });

  gruppe("Sitzplan: Raumform", () => {
    fall("Mittelgang nur bei ungerader Spaltenzahl", () => {
      gleich(Calc.sitzplanGaenge(7, "mittelgang"), [3]);
      gleich(Calc.sitzplanGaenge(6, "mittelgang"), null);
    });
    fall("Zweiertische: Tisch, Tisch, Gang … ohne Gang ganz rechts", () => {
      gleich(Calc.sitzplanGaenge(8, "zweiertische"), [2, 5]);
      gleich(Calc.sitzplanGaenge(6, "zweiertische"), [2]);
      gleich(Calc.sitzplanGaenge(2, "zweiertische"), null);
    });
    fall("Alle Plätze: keine Gänge", () => {
      gleich(Calc.sitzplanGaenge(9, "alle"), []);
    });
  });

  // ---- Sitzregeln ------------------------------------------------------------
  // Plan wie Store.neuerSitzplan: Reihe 0 oben (hinten), letzte Reihe unten (vorne)
  function plan(rows, cols, gaenge) {
    const seats = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        seats.push({ id: r + "-" + c, row: r, col: c, schuelerId: null, keinPlatz: (gaenge || []).indexOf(r + "-" + c) !== -1 });
    return { id: "p1", rows, cols, seats };
  }
  function belegen(p, belegung) {
    p.seats.forEach((s) => { s.schuelerId = belegung[s.id] || null; });
    return p;
  }
  // Fester Zufall, damit die Prüfung immer gleich läuft (mulberry32)
  function zufall(saat) {
    return function () {
      saat = (saat + 0x6D2B79F5) | 0;
      let t = Math.imul(saat ^ (saat >>> 15), 1 | saat);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const KINDER = [];
  for (let i = 1; i <= 20; i++) KINDER.push("k" + i);

  gruppe("Sitzplan: Regeln", () => {
    fall("vorne ist unten, mittlere Spalten ≈ ein Drittel", () => {
      const lage = Calc.sitzplanLage(plan(3, 4));
      gleich(lage.plaetze[lage.index["2-0"]].rang, 0, "unterste Reihe = vorne");
      gleich(lage.plaetze[lage.index["0-0"]].rang, 2);
      gleich([3, 4, 5, 6, 7, 9].map(Calc.mittlereSpalten), [[1], [1, 2], [1, 2, 3], [2, 3], [2, 3, 4], [3, 4, 5]]);
    });
    fall("Rand: äußerster Platz der Reihe, Gänge zählen nicht", () => {
      const lage = Calc.sitzplanLage(plan(2, 4, ["0-0"]));
      wahr(lage.plaetze[lage.index["0-1"]].randLinks, "0-1 ist links außen, weil 0-0 Gang ist");
      wahr(lage.plaetze[lage.index["1-0"]].randLinks);
      wahr(!lage.plaetze[lage.index["1-1"]].randLinks);
    });
    fall("ein Gang trennt Nachbarn", () => {
      const p = belegen(plan(1, 3, ["0-1"]), { "0-0": "a", "0-2": "b" });
      gleich(Calc.sitzplanRegelnPruefen(p, [
        { typ: "neben", a: "a", b: "b" }, { typ: "nichtNeben", a: "a", b: "b" }
      ]).map((r) => r.typ), ["neben"]);
    });
    fall("nicht neben gilt auch davor, dahinter und schräg", () => {
      const p = belegen(plan(2, 2), { "0-0": "a", "1-1": "b" });
      gleich(Calc.sitzplanRegelnPruefen(p, [{ typ: "nichtNeben", a: "a", b: "b" }]).length, 1);
    });
    fall("fester Platz gilt nur im eigenen Plan", () => {
      const p = belegen(plan(1, 2), { "0-0": "a" });
      gleich(Calc.sitzplanRegelnPruefen(p, [{ typ: "platz", a: "a", planId: "anderer", seatId: "0-1" }]).length, 0);
      gleich(Calc.sitzplanRegelnPruefen(p, [{ typ: "platz", a: "a", planId: "p1", seatId: "0-1" }]).length, 1);
    });
    fall("Verteilen erfüllt alle Regeln, leere Plätze bleiben hinten", () => {
      const regeln = [
        { typ: "nichtNeben", a: "k1", b: "k2" }, { typ: "nichtNeben", a: "k1", b: "k3" },
        { typ: "nichtNeben", a: "k2", b: "k3" }, { typ: "neben", a: "k4", b: "k5" },
        { typ: "vorne", a: "k6", reihen: 1 }, { typ: "hinten", a: "k7", reihen: 1 },
        { typ: "mittig", a: "k8" }, { typ: "rand", a: "k9", seite: "rechts" },
        { typ: "platz", a: "k10", planId: "p1", seatId: "1-0" },
        { typ: "vorne", a: "k11", reihen: 2 }, { typ: "mittig", a: "k11" }
      ];
      for (let saat = 1; saat <= 15; saat++) {
        const p = plan(4, 6);
        const erg = Calc.sitzplanVerteilen(p, KINDER, regeln, zufall(saat));
        gleich(erg.verletzt.length, 0, "Saat " + saat + ": verletzte Regeln");
        gleich(erg.ohnePlatz.length, 0, "Saat " + saat + ": ohne Platz");
        belegen(p, erg.belegung);
        gleich(Calc.sitzplanRegelnPruefen(p, regeln).length, 0, "Saat " + saat + ": Nachprüfung");
        wahr(p.seats.filter((s) => !s.schuelerId).every((s) => s.row === 0), "Saat " + saat + ": leere Plätze nur in der hintersten Reihe");
      }
    });
    fall("jeder Druck mischt neu", () => {
      const a = Calc.sitzplanVerteilen(plan(4, 6), KINDER, [], zufall(1)).belegung;
      const b = Calc.sitzplanVerteilen(plan(4, 6), KINDER, [], zufall(2)).belegung;
      wahr(JSON.stringify(a) !== JSON.stringify(b));
    });
    fall("Unerfüllbares: beste Belegung plus Liste der verletzten Regeln", () => {
      const erg = Calc.sitzplanVerteilen(plan(3, 3), ["a", "b"], [
        { typ: "vorne", a: "a", reihen: 1 }, { typ: "hinten", a: "a", reihen: 1 }
      ], zufall(3));
      gleich(erg.verletzt.length, 1);
      gleich(erg.ohnePlatz.length, 0);
    });
    fall("zu wenige Plätze: Rest ohne Platz, Regel-Kinder zuerst", () => {
      const erg = Calc.sitzplanVerteilen(plan(1, 3), ["a", "b", "c", "d", "e"], [{ typ: "vorne", a: "e", reihen: 1 }], zufall(4));
      gleich(erg.ohnePlatz.length, 2);
      wahr(erg.ohnePlatz.indexOf("e") === -1, "e hat eine Regel und bekommt einen Platz");
    });
  });

})();
