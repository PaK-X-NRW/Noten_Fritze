# Plan: Noten-Fritze – Feature-Paket (Quartale, Verweigerung, Exporte, Fixes)

Stand nach Rückfragen. Entscheidungen des Nutzers:
- **Leistungsverweigerung**: Stundennoten-Modell (jede Stunde bekommt eine Note aus ihren Punkten via Schwellen, Verweigerung = glatte 6, Mitarbeitsnote = Ø der Stundennoten)
- **Quartale**: ganze Gruppe „Sonstige Leistungen" wird quartalsweise gerechnet (HJ-Sonstige = 50 % Ø(Q1) + 50 % Ø(Q2))
- **HA-Modus „3× vergessen = Note 6"**: Note geht in Kategorie „Mündliche Mitarbeit" (wird angelegt, falls nicht vorhanden), Zählung pro Quartal
- **Demo-Daten**: gemischt (Q1 abgeschlossen/übertragen, Q2–Q4 laufend)

Hinweis: Der Plan-Modus erlaubt nur diese Plan-Datei. **Schritt 0** kopiert den Plan nach `plan.md` im Repo, damit er dort festgehalten ist.

---

## Datenmodell & Migration (store.js, SCHEMA_VERSION 7 → 8)

DB_VERSION bleibt 3 (keine neuen Stores/Indizes nötig).

- Neues Feld `quartal` (1–4) auf `noten`, `ereignisse`, `stunden`.
  Ableitung aus Datum: Aug–Okt → 1, Nov–Jan → 2, Feb–Apr → 3, Mai–Jul → 4
  (neue Helfer `Store.quartalAusDatum(datum)`, `Store.halbjahrAusQuartal(q)`).
  Das Feld `halbjahr` bleibt auf den Datensätzen (Kompatibilität), wird aber nicht mehr gelesen.
- Migrationsschritt `8`: allen vorhandenen Noten/Ereignissen/Stunden ohne `quartal` das Quartal aus ihrem Datum zuweisen; `settings.aktuellesQuartal` aus dem heutigen Datum setzen; `settings.haModus = "punkte"` persistieren.
- `DEFAULT_SETTINGS`:
  - `aktuellesHalbjahr` → ersetzt durch `aktuellesQuartal` (1–4). `aktuellesHalbjahr` bleibt als Feld erhalten (Alt-Daten), ist aber kein UI-Setting mehr.
  - neu `haModus: "punkte"` (`"punkte"` = bisherige Punktewertung | `"note6"` = ab der 3. vergessenen HA je Quartal eine Note 6, HA geben dann keine Punkte).
- `EVENT_TYPES`:
  - Kachel-Typen bekommen `icon`: einfach `★`, gut `★★`, sehrgut `★★★`, stoerung `⚡`.
  - Neuer Typ `{ id: "verweigerung", label: "Leistungsverweigerung", kurz: "Verweigerung", farbe: "#4a148c", defaultPunkte: 0, heatDelta: 0, positiv: false, aufKachel: false }` (Erfassung nur über Tracker-Modus).
- `neueNote` / `neuesEreignis` / `neueStunde` setzen `quartal` (und weiterhin `halbjahr`, abgeleitet).
- Klasse: kein neues Feld nötig (abgeschlossene Quartale erkennt man an fehlenden Ereignissen/Stunden; die übertragenen Noten tragen das Quartal).

## Calc-Umbau (calc.js)

### 1. Mitarbeit: Stundennoten-Modell (ersetzt Punkte-Ø-Modell)
`auswertungMitarbeit(ereignisse, settings, opts)` wird umgebaut:
- Pro Schüler und **gezählter Stunde** (Stunden im Zeitraum/Quartal, Tage mit Abwesenheit weiterhin ausgenommen):
  - `punkteDerStunde` = Summe der Event-Punkte dieser Stunde. Stunde ohne Ereignis = 0 Punkte (zählt weiterhin mit).
  - Enthält die Stunde ein `verweigerung`-Event des Schülers → **Stundennote 6**; alle Meldungs-Events dieser Stunde werden ignoriert. `keinehausaufgabe` zählt weiter (s. HA-Modus).
  - Sonst: `note = punkteZuNote(punkteDerStunde, schwellen)` – dieselben Schwellen wie bisher, nur jetzt pro Stunde statt auf den Gesamt-Ø.
- `notenvorschlag` = Ø der Stundennoten (1 NK, z. B. 3,4). Im HA-Modus `"note6"` fließen `keinehausaufgabe`-Punkte nie ein.
- Rückgabe zusätzlich: `stundenNoten` (Liste {stundeId, note, punkte, verweigerung}) für den Herleitungs-Dialog; aggregierte Felder (`anzahl`, `typen`, `letzte`, `stundenGezaehlt`) bleiben für die Tabelle erhalten.
- Effekt: Schwellen-Bedeutung ändert sich von „Ø Punkte/Stunde" zu „Punkte in einer Stunde" – UI-Texte in Einstellungen/Schwellen-Dialog/Herleitung entsprechend anpassen.

### 2. Notenberechnung: Quartale
`berechneSchueler(kategorien, noten, klasse, rundung, filter)` – letzter Parameter wird:
`1|2|3|4` (Quartal) | `"hj1"` | `"hj2"` | `null` (Jahr). Noten ohne `quartal`-Feld fließen immer ein (Kompatibilität).
- Quartal-Filter: nur Noten dieses Quartals (bisherige Logik, nur Feldname neu).
- Halbjahr/Jahr: **schriftlich** unverändert über den ganzen Zeitraum; **sonstige** = Mittel der Quartals-Durchschnitte (Q1 & Q2 je 50 % bei HJ1, fehlende Quartale werden robust übersprungen → vorhandenes zählt 100 %; Jahr = Ø der bis zu vier Quartals-Ø).
- `zeugnisErgebnis`, `jahresnote` unverändert.

## Navigation: Quartale statt Halbjahre (views.core.js + alle Nutzer)

- `state.notenHalbjahr` → `state.notenQuartal`, `state.auswertungHalbjahr` → `state.auswertungQuartal`; `hjFilter` → `quartalFilter` (liefert 1–4 | null); `state.notenSpalten`-Key analog.
- `hjTabsHTML` → `quartalTabsHTML`: Tabs **1. Q · 2. Q · 3. Q · 4. Q · Jahr** (Jahr bleibt, dort stehen die Halbjahres- und Jahreszeugnis-Ergebnisse).
- Betroffene Views: TabNoten, TabAuswertung, ViewBesprechung (Tabs + Filter), cellDialog/studentDetailDialog (Filter), Einstellungen (Select „Aktuelles Quartal" 1–4 ersetzt „Aktuelles Halbjahr"; beim Wechsel Filter-Defaults zurücksetzen).
- Tracker/ neue Daten: `e.halbjahr = ...`-Zeilen werden zu `e.quartal = settings.aktuellesQuartal` (+ halbjahr abgeleitet).

## Notenübersicht (views.home-klasse.js)

- **Quartal-Ansicht** (Tab 1. Q–4. Q): wie bisherige Halbjahr-Ansicht, Kategorien + Sammelspalten Schriftlich/Sonstige/Gesamt/Zeugnis für dieses Quartal.
- **Jahr-Ansicht** (`jahresSpalten`): neue Spalten **„Sonstige 1. Q" … „Sonstige 4. Q"** (Zeugnis-Badge des Quartals-Sonstige-Ø, `grp-sonstige`), danach wie bisher HJ1/HJ2 (schriftl./sonstige/Zeugnis) und Jahr. Die HJ-Sonstige kommt aus der 50/50-Quartalsrechnung (s. Calc).
- **Fix: Spalten ziehen auf iPad** (`spaltenZiehen`):
  - `th.zieh` bekommt `touch-action: none` + `-webkit-touch-callout: none` (Gesten ab dem Kopf gehören komplett dem JS; vertikales Scrollen bleibt über den Tabellenkörper möglich).
  - `ev.preventDefault()` im `pointerdown`; Move/Up/Cancel-Listener während des Ziehens auf `document` statt nur per Pointer-Capture auf dem `<th>` (Capture bleibt als Bonus), damit iOS den Drag nicht per `pointercancel`/Scroll-Übernahme abwürgt.
  - ⚠️ Auf echtem iPad hier nicht verifizierbar – Nutzer-Test erforderlich.

## Tracker (views.tracker.js, css)

- **Piktogramme**: Kachel-Buttons zeigen `icon` (★ / ★★ / ★★★ / ⚡) statt Kurztext; Legende oben zeigt Icon + Label + Punkte.
- **Kompakte Kacheln**: `tracker-grid` bekommt je nach `plan.cols` eine Klasse: ≤6 = normal, 7–8 = `kompakt`, ≥9 = `mini`. CSS staffelt: Kachel-`min-height` (132 → ~96 → ~72 px), Padding/Gap, Namens- und Button-Schrift, `typebtn`-`min-height` (46 → ~34 → ~28 px); in `mini` wird das Σ-Badge ausgeblendet. So passen z. B. 4×9 Kacheln auf den Schirm.
- **Neuer Modus „Leistungsverweigerung"** in der Topbar (Icon 🚫, zwischen „Abwesend" und „Keine HA"):
  - `MODI`-Eintrag + `body.modus-verweigerung`-Farbschema (dunkles Violett, passend zur Typ-Farbe).
  - Tap auf Kachel toggelt ein `verweigerung`-Event (mit `stundeId`, `quartal`); Kachel bekommt Badge „Verweigerung", Typ-Buttons werden deaktiviert (wie bei abwesend); erneuter Tap entfernt das Event (Undo). Zähler im Tracker-State mitführen (`t.verweigerung`).
  - Heatmap unverändert (kein Delta).

## Mitarbeit-Tab (views.home-klasse.js / views.dialoge.js)

- Tabelle an Stundennoten-Modell anpassen: Spalte „Ø/Stunde" → „Noten-Ø" (Ø der Stundennoten), Vorschlag = dieser Ø (1 NK). Punkte-Spalte bleibt als Info.
- Herleitungs-Dialog: statt Punkte-Rechnung jetzt Verteilung der Stundennoten (z. B. „3× Note 2, 5× Note 3, 1× Note 6 (Verweigerung)") + Ø + Schwellen-Hinweis; HA-Hinweis je nach `haModus`.
- **Button „Quartal abschließen"** (nur aktiv/sichtbar, wenn ein konkretes Quartal 1–4 gewählt ist):
  - Dialog `quartalAbschliessenDialog`: Tabelle aller Schüler mit Notenvorschlag des gewählten Quartals, **pro Schüler editierbar** (Tendenzen erlaubt, leer = kein Übertrag für diesen Schüler); Select „Ziel-Kategorie" (sonstige Noten-Kategorien, Default „Mündliche Mitarbeit" – wird angelegt, falls nicht vorhanden).
  - Buttons: **„CSV: Noten"** (Einzelnoten der Übertragung: Name, Quartal, Note) und **„CSV: Ereignisse"** (Rohdaten des Quartals) – vor dem Löschen; dann **„Übertragen & abschließen"** mit Bestätigungs-Warnung.
  - Übertrag: je Schüler eine Note (Ziel-Kategorie, `quartal`, abgeleitetes `halbjahr`, Titel „Mündliche Mitarbeit n. Quartal"). Danach **Ereignisse und Stunden des Quartals dieser Klasse löschen** (Zählung startet bei 0; Abwesenheiten bleiben erhalten). Toast + render.

## HA-Modus wählbar (store/calc/tracker/einstellungen)

- Einstellungen: Select „Vergessene Hausaufgaben werten": „Punkteabzug in der Mitarbeit" (`punkte`, bisheriges Verhalten) | „Ab der 3. je eine Note 6" (`note6`).
- `note6`: `keinehausaufgabe` gibt keine Mitarbeits-Punkte (Calc). Beim Anlegen eines `keinehausaufgabe`-Events (Tracker-Modus „Keine HA") wird die Anzahl dieses Typs im laufenden Quartal gezählt: bei jeder 3. (3., 6., 9. …) automatisch eine **Note 6** in die Kategorie „Mündliche Mitarbeit" (per Name suchen, sonst anlegen; Titel „3× Hausaufgaben vergessen (n. Quartal)", `quartal` gesetzt) + Toast. Entfernen eines HA-Vermerks löscht keine bereits erzeugte Note.

## Exporte (csv.js, store.js, views)

- **`CSV.speichern(dateiname, inhalt, mime)`** – dreistufig:
  1. `showDirectoryPicker` (Chrome/Edge Desktop): Ordner einmal in den Einstellungen wählen, Handle in IndexedDB (`einstellungen`) ablegen, Berechtigung bei Bedarf erneuern → alle Exporte landen direkt dort.
  2. Sonst Web Share API mit Dateien (`navigator.canShare({files})`, iPad-Safari): Teilen-Blatt → „In Dateien sichern" erlaubt dort die Ordnerwahl.
  3. Fallback: klassischer Download (Downloads-Ordner).
  - ⚠️ Ehrliche Einschränkung: iPad-Safari hat keinen echten Ordner-Picker für Downloads; Stufe 2 ist der iPad-Weg.
  - Einstellungen: neue Card „Export-Ordner" (Status + „Ordner wählen"-Button nur, wo die API existiert). Alle bestehenden Exporte (CSV + JSON-Backup) auf `CSV.speichern` umstellen.
- **Klassen-Export** (Button ⤓ auf der Home-Kachel + in der Klassen-Topbar): JSON `{ app: "noten-fritze-klasse", appVersion, exportedAt, klasse, schueler, kategorien, noten, ereignisse, stunden, abwesenheiten, sitzplan }` einer einzelnen Klasse (z. B. zur Übergabe an Kolleg/innen).
- **Klassen-Import** (Home-Topbar „Klasse importieren"): Datei validieren; existiert die Klassen-ID bereits → Dialog „Ersetzen" (bestehende Klasse kaskadierend löschen, dann importieren) oder „Als Kopie importieren" (alle IDs neu vergeben, Referenzen inkl. `sitzplan.seats[].schuelerId` ummappen).
- CSV-Anpassungen: `exportEinzelnoten` Spalte „Halbjahr" → „Quartal"; `exportNoten` um Spalten „Sonstige Q1–Q4" ergänzen; `exportEreignisse` unverändert.

## Home: Klasse löschen (views.home-klasse.js, views.js)

- 🗑-Button oben rechts auf jeder Klassen-Kachel (eigene `data-action="delete-class"`, greift vor dem Karten-`open-class` durch `closest`). Bestätigungsdialog („… und alle Noten/Ereignisse/Stunden werden gelöscht"), dann `Store.Klassen.remove(id)` (Kaskade existiert bereits) + render. Gilt für jede Klasse, auch die Demo-8b.

## Demo-Daten 8b (store.js `seedDemoData`)

Realistischer „Stand Ende Schuljahr" (Schuljahr 2025/26, heute = Anfang August 2026):
- 14 Schüler mit festen Leistungsprofilen (stark/mittel/schwach), damit Noten plausibel streuen statt rein zufällig.
- Kategorien wie bisher (Klassenarbeit Gew 2, Test Gew 1, Mündliche Mitarbeit Gew 2, Hausaufgaben als `fehlendeHA`).
- Stunden: Di + Do jede Schulwoche Aug 2025 – Jul 2026 (beendet, 45 Min), Quartale aus dem Datum.
- **Q1 abgeschlossen**: keine Q1-Ereignisse/Stunden; stattdessen übertragene Noten in „Mündliche Mitarbeit" mit `quartal: 1`, Titel „Mündliche Mitarbeit 1. Quartal".
- **Q2–Q4 laufend**: Stunden + Ereignisse mit profilgesteuerter Verteilung; mehrere Schüler mit ≥3 vergessenen HA pro Quartal (testet den HA-Modus); 1–2 `verweigerung`-Events; vereinzelte Abwesenheiten.
- Schriftliche Noten über alle Quartale verteilt (KA Sep/Dez/Mär/Jun, Tests dazwischen).

## Version, Doku, Verifikation

- `APP_VERSION` 1.4.0 → **1.5.0** (MINOR: neue Funktionen; Pflicht wegen Service-Worker-Cache). Keine neuen Dateien → `ASSETS` unverändert.
- `AGENTS.md` + `README.md` aktualisieren: Quartale statt Halbjahre, Stundennoten-Modell, Verweigerung, `haModus`, Klassen-Export, Export-Ordner, Kompakt-Tracker.
- Verifikation manuell: Browser-Konsole fehlerfrei; Flows durchklicken: Spalten ziehen (Maus; iPad durch Nutzer), Tracker-Modi inkl. Verweigerung + Undo, Quartal abschließen (mit CSV), HA-Modus beide Varianten, Klasse löschen/exportieren/importieren (Ersetzen + Kopie), Demo-Daten prüfen, Zeugnisrechnung HJ/Jahr gegenrechnen (50/50-Sonstige).

## Umsetzungsreihenfolge

1. Plan nach `plan.md` kopieren; `APP_VERSION` erhöhen
2. store.js: `quartal`-Feld, Migration 8, Settings, EVENT_TYPES (Icons + Verweigerung)
3. calc.js: Stundennoten-Modell + Quartals-Filter/50-50-Sonstige
4. views.core.js + Navigation/Filter auf Quartale (home-klasse, besprechung, einstellungen, dialoge)
5. Notenübersicht: Quartalsspalten + iPad-Drag-Fix
6. Tracker: Icons, Kompakt-Modi, Verweigerungs-Modus
7. Mitarbeit-Tab: Stundennoten-Anzeige, Herleitung, „Quartal abschließen"-Dialog
8. HA-Modus (Einstellung + Auto-Note-6)
9. Exporte: `CSV.speichern`, Export-Ordner, Klassen-Export/-Import, CSV-Spalten
10. Home: Klasse löschen
11. Demo-Daten 8b
12. Doku (AGENTS.md/README.md), finale Verifikation
