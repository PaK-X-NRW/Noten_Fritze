/* =========================================================================
   test.calc.js – Prüfungen der Rechenlogik (Calc)
   Die Beispiele stammen aus AGENTS.md (Abschnitt 6) und Schuljahr-Schema.md.
   Ändert sich hier ein erwarteter Wert, ändert sich eine Note – das darf nur
   bewusst und mit Rücksprache passieren.
   ========================================================================= */
(function () {
  "use strict";
  const { gruppe, fall, gleich, nahe } = Test;

  // ---- Bausteine für Testdaten ----------------------------------------------
  function kat(id, art, gewichtung, extra) {
    return Object.assign({ id, name: id, art, gewichtung, anzeige: "note", quelle: "manuell" }, extra || {});
  }
  function note(kategorieId, wert, quartal) {
    return { kategorieId, wert, quartal };
  }
  const KLASSE = { anteilSchriftlich: 50, anteilSonstige: 50 };
  // Kategorien wie in Schuljahr-Schema.md (9a Mathematik, Hauptfach)
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

  gruppe("Halbjahres-Kette (Beispiele aus Schuljahr-Schema.md)", () => {
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

  gruppe("Tracker: Stundenplan und Heatmap", () => {
    const plan = Store.defaultStundenplan();
    fall("laufende Stunde laut Stundenplan", () => {
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
    fall("Heatmap-Verfall: Y Punkte je X Minuten", () => {
      const t0 = new Date(2025, 8, 16, 9, 0).getTime();
      nahe(Calc.heatPunkteAktuell(50, t0, 5, 1, t0 + 10 * 60000).heatPoints, 48);
      nahe(Calc.heatPunkteAktuell(1, t0, 5, 1, t0 + 60 * 60000).heatPoints, 0, "nie unter 0");
    });
  });

})();
