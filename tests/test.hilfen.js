/* =========================================================================
   test.hilfen.js – Prüfungen der Hilfsfunktionen aus Store und CSV, die ohne
   Datenbank auskommen (Quartale, Spalten aus Altnoten, Sitzpläne, CSV)
   ========================================================================= */
(function () {
  "use strict";
  const { gruppe, fall, gleich, wahr } = Test;

  gruppe("Quartale und Halbjahre", () => {
    fall("Quartal aus dem Datum (Aug–Okt · Nov–Jan · Feb–Apr · Mai–Jul)", () => {
      gleich(["2025-08-01", "2025-10-31", "2025-11-01", "2026-01-31", "2026-02-01", "2026-04-30", "2026-05-01", "2026-07-31"]
        .map(Store.quartalAusDatum), [1, 1, 2, 2, 3, 3, 4, 4]);
    });
    fall("Halbjahr aus dem Quartal", () => {
      gleich([1, 2, 3, 4].map(Store.halbjahrAusQuartal), [1, 1, 2, 2]);
    });
    fall("lokales Datum (nicht UTC)", () => {
      gleich(Store.datumLokal(new Date(2026, 0, 5, 0, 30)), "2026-01-05");
    });
  });

  gruppe("Spalten aus Altnoten (leistungenAusNoten)", () => {
    fall("gleiche Gruppe = eine Spalte; zweite Note derselben Person = zweite Spalte", () => {
      const basis = { klasseId: "k", kategorieId: "c", quartal: 1, titel: "HÜ", datum: "2025-09-10" };
      const noten = [
        Object.assign({ schuelerId: "a", createdAt: 1 }, basis),
        Object.assign({ schuelerId: "b", createdAt: 2 }, basis),
        Object.assign({ schuelerId: "a", createdAt: 3 }, basis)
      ];
      const neu = Store.leistungenAusNoten(noten);
      gleich(neu.length, 2);
      gleich(noten[0].leistungId, noten[1].leistungId);
      wahr(noten[2].leistungId !== noten[0].leistungId, "zweite Note von a in eigener Spalte");
    });
    fall("Noten mit Spalte bleiben unberührt", () => {
      const noten = [{ klasseId: "k", kategorieId: "c", quartal: 1, schuelerId: "a", leistungId: "L1" }];
      gleich(Store.leistungenAusNoten(noten).length, 0);
      gleich(noten[0].leistungId, "L1");
    });
  });

  gruppe("Sitzpläne", () => {
    fall("alter Einzelplan wird zum Plan „Klassenraum“", () => {
      const alt = { klasseId: "k", rows: 2, cols: 2, seats: [{ id: "0-0", row: 0, col: 0, schuelerId: "a" }] };
      const rec = Store.sitzplaeneNormalisieren(alt);
      gleich(rec.plaene.length, 1);
      gleich(rec.plaene[0].name, "Klassenraum");
      gleich(rec.plaene[0].seats[0].schuelerId, "a");
      gleich(rec.aktivId, rec.plaene[0].id);
    });
    fall("neues Raster hat rows × cols Plätze", () => {
      gleich(Store.neuerSitzplan("k", 3, 4).seats.length, 12);
    });
  });

  gruppe("Einstellungen", () => {
    fall("Schwellen werden sortiert und bereinigt", () => {
      const s = Store.schwellenNormalisieren([{ note: 3, abPunkte: "1" }, { note: 1, abPunkte: "2,5" }, { note: 9, abPunkte: 0 }]);
      gleich(s, [{ abPunkte: 2.5, note: 1 }, { abPunkte: 1, note: 3 }, { abPunkte: 0, note: 5 }]);
    });
    fall("Standard-Stundenzeiten: 10 Stunden à 45 Minuten ab 08:00, Pausen dazwischen", () => {
      const p = Store.defaultStundenzeiten();
      const stunden = p.filter((b) => b.art === "stunde");
      gleich(stunden.length, 10);
      gleich([stunden[0].id, stunden[0].start, stunden[0].ende], ["std-1", "08:00", "08:45"]);
      const pausen = p.filter((b) => b.art === "pause");
      gleich(pausen.length, 9);
      gleich(pausen.filter((b) => b.name === "Große Pause").map((b) => b.start + "–" + b.ende), ["09:35–09:55"]);
      gleich(p[1].art, "pause", "zeitlich sortiert: nach der 1. Stunde die Pause");
    });
    fall("Stundenzeiten: sortiert, Stunden neu nummeriert, höchstens 14", () => {
      const liste = [
        { art: "stunde", start: "09:00", ende: "09:45" },
        { art: "pause", id: "p1", name: "Frühaufsicht", start: "07:45", ende: "08:00" },
        { art: "stunde", start: "08:00", ende: "08:45" },
        { art: "stunde", start: "kaputt", ende: "10:00" }
      ];
      const n = Store.stundenzeitenNormalisieren(liste);
      gleich(n.map((b) => b.id), ["p1", "std-1", "std-2"]);
      gleich(n[2].start, "09:00");
      const viele = [];
      for (let i = 0; i < 16; i++) viele.push({ art: "stunde", start: Store.minZuHHMM(420 + i * 50), ende: Store.minZuHHMM(465 + i * 50) });
      gleich(Store.stundenzeitenNormalisieren(viele).length, 14);
      gleich(Store.stundenzeitenNormalisieren([]).filter((b) => b.art === "stunde").length, 10, "ohne Stunde: Standard");
    });
    fall("altes Feld `stundenplan` wird zu Stunden ohne Pausen", () => {
      const alt = { stundenplan: [{ nr: 1, start: "07:50", ende: "08:35" }, { nr: 2, start: "08:40", ende: "09:25" }] };
      const n = Store.stundenzeitenNormalisieren(Store.stundenzeitenLesen(alt));
      gleich(n.map((b) => b.art + " " + b.start), ["stunde 07:50", "stunde 08:40"]);
      gleich(Store.stundenzeitenLesen({ stundenzeiten: n }), n, "neues Feld hat Vorrang");
      gleich(Store.stundenzeitenLesen(null), null);
    });
    fall("Pausen aus Lücken: nur freie Lücken, ab 15 Minuten „Große Pause“", () => {
      const liste = [
        { art: "stunde", start: "08:00", ende: "08:45" },
        { art: "stunde", start: "08:50", ende: "09:35" },
        { art: "stunde", start: "09:55", ende: "10:40" },
        { art: "pause", id: "a", name: "Aufsicht", start: "09:35", ende: "09:55" }
      ];
      const n = Store.pausenAusLuecken(liste);
      gleich(n.filter((b) => b.art === "pause").map((b) => b.name + " " + b.start), ["Pause 08:45", "Aufsicht 09:35"]);
      gleich(Store.pausenAusLuecken(n).length, n.length, "zweimal anlegen legt nichts doppelt an");
    });
  });

  gruppe("CSV", () => {
    fall("Export: UTF-8-BOM, Quoting bei Komma und Anführungszeichen", () => {
      const csv = CSV.toCSV([["a", "b,c"], ['sagt "hi"', ""]]);
      gleich(csv.charCodeAt(0), 0xFEFF);
      gleich(csv.slice(1), 'a,"b,c"\r\n"sagt ""hi""",');
    });
    fall("Import: Semikolon, Anführungszeichen, Zeilenumbrüche", () => {
      gleich(CSV.parseCSV('Vorname;Nachname\r\n"Anna";"Bauer; jun."\n\nBen;Fischer'),
        [["Vorname", "Nachname"], ["Anna", "Bauer; jun."], ["Ben", "Fischer"]]);
    });
    fall("Schülerliste mit Kopfzeile in beliebiger Reihenfolge", () => {
      gleich(CSV.importSchueler("Nachname,Vorname,Bemerkung\nBauer,Anna,x\nFischer,Ben,"),
        [{ vorname: "Anna", nachname: "Bauer", bemerkung: "x" }, { vorname: "Ben", nachname: "Fischer", bemerkung: "" }]);
    });
    fall("Schülerliste ohne Kopfzeile: Vorname, Nachname", () => {
      gleich(CSV.importSchueler("Anna,Bauer"), [{ vorname: "Anna", nachname: "Bauer", bemerkung: "" }]);
    });
  });
})();
