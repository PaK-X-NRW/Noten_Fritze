/* =========================================================================
   store.einstellungen.js – Standardwerte und App-Einstellungen
   Erweitert den Store-Namespace (store.js lädt davor) um DEFAULT_SETTINGS,
   die Stundenzeiten (Stunden und Pausen als Blöcke), die Normalisierung von
   Stundenzeiten und Notenschwellen sowie das Laden/Speichern der Einstellungen.
   ========================================================================= */
(function (global) {
  "use strict";

  const { EVENT_TYPES, datumLokal, quartalAusDatum, uid } = global.Store;

  // ---- Standard-Einstellungen ----------------------------------------------
  function hhmmZuMinuten(v) {
    const p = String(v || "").split(":");
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function minZuHHMM(min) {
    return ("0" + (Math.floor(min / 60) % 24)).slice(-2) + ":" + ("0" + (min % 60)).slice(-2);
  }

  // ---- Stundenzeiten ---------------------------------------------------------
  // Zeitlich sortierte Liste von Blöcken, gilt jeden Schultag gleich:
  //   { id, art: "stunde" | "pause", name, start: "HH:MM", ende: "HH:MM", nr }
  // Stunden werden nach ihrer Lage durchnummeriert (nr, id "std-<nr>"), damit
  // „3. Stunde“ immer dieselbe Kennung hat. Pausen (auch Frühaufsicht o. Ä.)
  // tragen einen freien Namen und zählen nie als Unterricht.
  const MAX_STUNDEN = 14;
  const MAX_BLOECKE = 40;

  function neuerBlock(art, start, ende, name) {
    return {
      id: art === "stunde" ? "" : "p-" + uid(),
      art, name: name || "", start, ende
    };
  }

  // Legt zwischen zwei aufeinanderfolgenden Stunden eine Pause an, wo noch
  // kein Block liegt („Pause“, ab 15 Min „Große Pause“). Rückgabe: neue Liste.
  function pausenAusLuecken(liste) {
    const bloecke = (liste || []).slice();
    const stunden = bloecke.filter((b) => b.art === "stunde")
      .sort((a, b) => hhmmZuMinuten(a.start) - hhmmZuMinuten(b.start));
    for (let i = 0; i + 1 < stunden.length && bloecke.length < MAX_BLOECKE; i++) {
      const von = hhmmZuMinuten(stunden[i].ende), bis = hhmmZuMinuten(stunden[i + 1].start);
      if (bis <= von) continue;
      const belegt = bloecke.some((b) => b.art !== "stunde" &&
        hhmmZuMinuten(b.start) < bis && hhmmZuMinuten(b.ende) > von);
      if (belegt) continue;
      bloecke.push(neuerBlock("pause", minZuHHMM(von), minZuHHMM(bis), bis - von >= 15 ? "Große Pause" : "Pause"));
    }
    return stundenzeitenNormalisieren(bloecke);
  }

  // Standard: 10 Stunden à 45 Min ab 08:00 mit 5-Min-Pausen, nach der 2. Stunde
  // 20 Min (Große Pause). Die Pausen stehen als eigene Blöcke dazwischen.
  function defaultStundenzeiten() {
    const starts = ["08:00", "08:50", "09:55", "10:45", "11:35", "12:25", "13:15", "14:05", "14:55", "15:45"];
    return pausenAusLuecken(starts.map((start) =>
      neuerBlock("stunde", start, minZuHHMM(hhmmZuMinuten(start) + 45))));
  }

  // Bringt die Blockliste in eine gültige Form: Blöcke ohne Zeiten raus,
  // nach Beginn sortiert, höchstens 14 Stunden und 40 Blöcke, Stunden neu
  // durchnummeriert. Ohne eine einzige Stunde gilt der Standard.
  function stundenzeitenNormalisieren(liste) {
    const hhmm = /^\d{1,2}:\d{2}$/;
    let stunden = 0;
    const bloecke = (Array.isArray(liste) ? liste : [])
      .filter((b) => b && hhmm.test(b.start) && hhmm.test(b.ende))
      .map((b, i) => ({ b, i }))
      // Bei gleichem Beginn: Pause (z. B. Aufsicht) vor der Stunde, sonst stabil
      .sort((x, y) => (hhmmZuMinuten(x.b.start) - hhmmZuMinuten(y.b.start)) ||
        ((x.b.art === "stunde") - (y.b.art === "stunde")) || (x.i - y.i))
      .map((x) => x.b)
      .filter((b) => b.art !== "stunde" || ++stunden <= MAX_STUNDEN)
      .slice(0, MAX_BLOECKE);
    if (!bloecke.some((b) => b.art === "stunde")) return defaultStundenzeiten();
    let nr = 0;
    return bloecke.map((b) => {
      if (b.art === "stunde") {
        nr += 1;
        return { id: "std-" + nr, art: "stunde", name: "", start: b.start, ende: b.ende, nr };
      }
      return { id: b.id || neuerBlock("pause", b.start, b.ende).id, art: "pause",
        name: String(b.name || "").trim() || "Pause", start: b.start, ende: b.ende };
    });
  }

  // Stundenzeiten aus den gespeicherten (Roh-)Einstellungen lesen – auch aus
  // älteren Formen: bis 1.15 hieß das Feld `stundenplan` und war eine Liste
  // { nr, start, ende } (davor ein Wochenplan je Wochentag, Montag als Basis).
  // Die bisherigen Zeiten werden zu Stunden, Pausen kommen dabei keine dazu.
  // Rückgabe: Blockliste oder null (nichts gespeichert -> Standard).
  function stundenzeitenLesen(roh) {
    if (!roh) return null;
    if (Array.isArray(roh.stundenzeiten)) return roh.stundenzeiten;
    let alt = roh.stundenplan;
    if (alt && !Array.isArray(alt)) {
      const ersterTag = Object.keys(alt).sort()[0];
      alt = ersterTag ? alt[ersterTag] : null;
    }
    if (!Array.isArray(alt)) return null;
    return alt.filter((h) => h && h.start && h.ende)
      .map((h) => neuerBlock("stunde", h.start, h.ende));
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
    // Datenform (siehe store.migrationen.js). Neu angelegte Einstellungen
    // bekommen die aktuelle SCHEMA_VERSION (getSettings); dieser Wert gilt nur
    // für sehr alte Datensätze ohne das Feld – für sie laufen alle Migrationen.
    schemaVersion: 1,
    // Aktuelles Quartal (1–4) – neue Noten/Ereignisse/Stunden werden damit getaggt
    aktuellesQuartal: 1,
    // Vergessene Hausaufgaben werten:
    // "punkte" = vergessene HA geben Minuspunkte in der Mitarbeit
    // "note6"  = jede 3. vergessene HA je Quartal erzeugt automatisch eine
    //            Note 6 in „Mündliche Mitarbeit", HA geben dann keine Punkte
    haModus: "punkte",
    // Stundenzeiten: Stunden und Pausen als Blöcke (siehe oben), gelten für
    // jeden Schultag gleich. Hieß bis 1.15 `stundenplan` (nur Stunden).
    stundenzeiten: defaultStundenzeiten(),
    // Startseite: zuletzt gewählte Ansicht ("klassen" | "stundenplan")
    startAnsicht: "klassen",
    // A/B-Wochen: Umschaltpunkte [{ abMontag: "YYYY-MM-DD", woche: "A"|"B" }];
    // leer = keine A/B-Wochen (siehe Calc.abWoche)
    abWochen: [],
    // Reihenfolge der Schüler/innen in allen Listen:
    // "nachname" = alphabetisch (Nachname, dann Vorname), "manuell" = per ▲/▼ gepflegter sortIndex
    schuelerSortierung: "nachname",
    // Sitzplan-Kacheln (Tracker und Reiter Sitzplan) werden höchstens so schmal
    // wie bei so vielen Spalten; breitere Pläne scrollen seitlich (6–15)
    sitzplanKachelSpalten: 9,
    // Punkte je Ereignistyp (überschreibbar)
    mitarbeitPunkte: EVENT_TYPES.reduce((m, t) => (m[t.id] = t.defaultPunkte, m), {}),
    // Schwellen: Punkte in EINER Stunde -> Stundennote (Ø der Stundennoten ist
    // der Notenvorschlag). Weil Ereignisse ganze Punkte geben, liegen die
    // Stufen auf ganzen Zahlen: sehr gute Meldung (3) = 1 · gute Meldung (2) = 2 ·
    // Meldung (1) = 3 · stille Stunde (0) = 4 · vergessene HA (-1) = 5 ·
    // Störung (-2) = 6. Global und je Klasse editierbar.
    mitarbeitSchwellen: [
      { abPunkte: 3.0, note: 1 },
      { abPunkte: 2.0, note: 2 },
      { abPunkte: 1.0, note: 3 },
      { abPunkte: 0.0, note: 4 },
      { abPunkte: -1.0, note: 5 }
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
    // Vor dem Merge lesen, sonst verdeckt der Standard die alten Zeiten
    const stundenzeiten = stundenzeitenLesen(s);
    if (!s) {
      // Erster Start bzw. leere Datenbank: nichts zu migrieren
      s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      s.schemaVersion = global.Store.SCHEMA_VERSION;
      await DB.put("einstellungen", s);
    }
    // Fehlende Felder aus Defaults ergänzen (Vorwärtskompatibilität)
    s = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s);
    // Nicht mehr benutzte Felder älterer Versionen; verschwinden beim nächsten Speichern
    delete s.rundung;
    delete s.aktuellesHalbjahr;
    if (s.heatPunktVerfallProMinuten && !s.heatVerfallMinuten) {
      s.heatVerfallMinuten = s.heatPunktVerfallProMinuten;
    }
    // Stundenzeiten (auch aus dem alten Feld `stundenplan`); das alte Feld
    // verschwindet beim nächsten Speichern
    s.stundenzeiten = stundenzeitenNormalisieren(stundenzeiten || s.stundenzeiten);
    delete s.stundenplan;
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

  Object.assign(global.Store, {
    DEFAULT_SETTINGS,
    getSettings, saveSettings,
    MAX_STUNDEN, MAX_BLOECKE,
    defaultStundenzeiten, stundenzeitenNormalisieren, stundenzeitenLesen, pausenAusLuecken,
    schwellenNormalisieren, hhmmZuMinuten, minZuHHMM
  });
})(window);
