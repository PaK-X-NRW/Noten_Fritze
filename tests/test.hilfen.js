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
    fall("Standard-Stundenplan: 10 Stunden à 45 Minuten ab 08:00", () => {
      const p = Store.defaultStundenplan();
      gleich(p.length, 10);
      gleich([p[0].start, p[0].ende], ["08:00", "08:45"]);
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
