/* =========================================================================
   store.einstellungen.js – Standardwerte und App-Einstellungen
   Erweitert den Store-Namespace (store.js lädt davor) um DEFAULT_SETTINGS,
   den Default-Stundenplan, die Normalisierung von Stundenplan und
   Notenschwellen sowie das Laden/Speichern der Einstellungen.
   ========================================================================= */
(function (global) {
  "use strict";

  const { EVENT_TYPES, datumLokal, quartalAusDatum } = global.Store;

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
    // Stundenplan: flache Liste von genau 10 { nr, start: "HH:MM", ende: "HH:MM" },
    // gilt für jeden Schultag gleich (kein Wochenplan mehr).
    stundenplan: defaultStundenplan(),
    // Reihenfolge der Schüler/innen in allen Listen:
    // "nachname" = alphabetisch (Nachname, dann Vorname), "manuell" = per ▲/▼ gepflegter sortIndex
    schuelerSortierung: "nachname",
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
    if (!s) {
      s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
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

  Object.assign(global.Store, {
    DEFAULT_SETTINGS,
    getSettings, saveSettings,
    defaultStundenplan, schwellenNormalisieren, hhmmZuMinuten
  });
})(window);
