# AGENTS.md – Instruktionen für KI-Agenten

Diese Datei ist die **verbindliche Arbeitsanleitung** für alle KI-Agenten und
Coding-Assistenten (Claude, Codex, Kimi, Cursor, Copilot o. ä.), die an diesem
Repository arbeiten. Bitte vollständig lesen, bevor du Code änderst.

---

## 1. Was ist Noten-Fritze?

Lokale Noten- und Mitarbeitsverwaltung für Lehrkräfte an Gymnasien (Deutschland).

- **100 % lokal**: Alle Daten liegen in IndexedDB im Browser. Kein Server, keine
  Cloud, kein Login. Datensouveränität ist ein Kernfeature – führe niemals
  Netzwerk-Calls, Telemetrie oder externe Dienste ein.
- **Tablet-first**: Optimiert für iPad im Querformat, Touch-Bedienung, PWA
  (offline nutzbar via Service Worker).
- Zielgruppe sind Lehrkräfte: **UI-Sprache ist Deutsch**, Fachbegriffe aus dem
  Schulalltag (z. B. „Epochalnote", „Wortmeldung") beibehalten.

## 2. Harte technische Regeln (nicht verhandelbar)

1. **Kein Build-Schritt, keine Abhängigkeiten.** Vanilla HTML/CSS/JS. Füge keine
   Pakete, CDNs, Frameworks oder Toolchains hinzu – auch keine „kleinen"
   Utility-Libraries. Wenn eine Fähigkeit fehlt, implementiere sie selbst.
2. **Klassische `<script>`-Tags, keine ES-Module.** Die App muss per Doppelklick
   auf `index.html` (`file://`) lauffähig bleiben; ES-Module scheitern dort an
   CORS. Modularität entsteht über Dateien + globale Namespaces.
3. **Keine Transpiler-Syntax.** Code muss in älteren iPad-Safari-Versionen laufen:
   ES2017+ ist ok (async/await wird genutzt), aber keine optionalen Spielereien,
   die breite Kompatibilität gefährden. Bisheriger Code-Stil: `const`/`let`,
   Arrow Functions, Template-Konkatenation mit `+` (keine Template-Literals im
   bestehenden Code – dem vorhandenen Stil folgen).
4. **Nutzdaten nur in IndexedDB**, nie in LocalStorage.
5. **Minimale, fokussierte Änderungen.** Keine ungefragten Refactorings,
   Reformatierungen oder Umbenennungen außerhalb der eigentlichen Aufgabe.

## 3. Architektur

Schichten (Ladereihenfolge in `index.html` ist bindend – Abhängigkeiten!):

| Datei | Namespace | Aufgabe |
|---|---|---|
| `js/version.js` | `APP_VERSION` | App-Version `MAJOR.MINOR.PATCH` (Single Source of Truth) |
| `js/db.js` | `DB` | Generischer IndexedDB-Wrapper (Promises, Schema-Versionierung) |
| `js/store.js` | `Store` | Domänenmodell, Repositories, Defaults, Ereignistypen, Demo-Daten |
| `js/calc.js` | `Calc` | Reine Rechenlogik (Noten, Mitarbeit, Heatmap) – **frei von DOM/DB** |
| `js/csv.js` | `CSV` | CSV-Export/Import (UTF-8 mit BOM) |
| `js/ui.js` | `UI` | UI-Bausteine: Modal, Toast, Formfelder, `esc`, `$`/`$all` |
| `js/views.core.js` | `Views` | Views-Kern: State, Navigation (`go`), Render-Schleife (`render`) |
| `js/views.home-klasse.js` | `Views` | Home (Klassenübersicht) + Klassenansicht mit Tabs |
| `js/views.tracker.js` | `Views` | Mitarbeits-Tracker (Stunden, Kacheln, Modi, Heatmap, Restzeit) |
| `js/views.besprechung.js` | `Views` | Besprechungsmodus + Noten-Aufschlüsselung (`breakdownHTML`) |
| `js/views.einstellungen.js` | `Views` | Einstellungen inkl. Stundenplan |
| `js/views.dialoge.js` | `Views` | Modale Dialoge (Klasse, Schüler, Kategorie, Noten, Sitzplatz, Importe) |
| `js/views.js` | `Views` | Aktions-Dispatcher: Action-Map + zentrale Delegation |
| `js/app.js` | – | Bootstrap (DB öffnen, Demo-Daten, erster Render, SW-Registrierung) |

Wichtige Muster:

- Jede Datei ist eine **IIFE** mit `"use strict";` und hängt am Ende ihr
  Namespace-Objekt an `window` (`(function (global) { ... })(window)`).
- Die Views sind auf mehrere Dateien aufgeteilt, die sich **denselben**
  Namespace teilen: `views.core.js` legt `window.Views` an (State, `go`,
  `render`), die Module `views.*.js` hängen ihre Funktionen per
  `Object.assign(global.Views, { ... })` an und holen sich Kern-Funktionen
  per `const { state, go, render } = global.Views;` am Dateianfang.
  `views.js` (Dispatcher) lädt **zuletzt** und destrukturiert alles, was die
  Action-Map braucht – aufgerufen wird erst zur Laufzeit per Klick.
  `render()` löst die Views über die Registry auf (`api.ViewHome()`).
- Jede Datei beginnt mit einem **Header-Kommentarblock** (`/* ===...`), der
  Zweck und Inhalt beschreibt. Bei neuen Dateien dieses Format übernehmen.
- HTML wird als String gebaut. **Nutzerdaten immer mit `UI.esc()` escapen**,
  bevor sie ins HTML wandern (XSS-Schutz, Namen sind Freitext).
- Interaktionen laufen über **`data-action`-Attribute** und zentrale Delegation
  in `Views` (siehe `initDelegation` / Action-Map in `views.js`). Neue Buttons
  bekommen eine `data-action` + einen Eintrag in der Action-Map – keine
  Inline-`onclick`.
- Render-Schleife: `Views.render()` rendert Topbar + View neu; nach jeder
  Datenmutation `render()` aufrufen.

## 4. Datenmodell & Integrität

IndexedDB-Datenbank `noten-fritze` (Stores siehe README.md, Abschnitt 3).

- **Kaskadierung beachten:** Löschen einer Klasse/eines Schülers muss abhängige
  Datensätze mitlöschen (Noten, Ereignisse, Stunden, Abwesenheiten, Sitzplatz-Zuweisung).
  Bestehende Logik in `store.js` wiederverwenden, nicht umgehen.
- **Versionierung ist dreistufig** – die App-Version ist unabhängig von den
  beiden internen Zählern, sie werden **nicht** gekoppelt:
  0. **App-Version** (`APP_VERSION` in `js/version.js`, `MAJOR.MINOR.PATCH`):
     rein für Mensch und Cache. MAJOR = große Umbauten, MINOR = neue Funktionen,
     PATCH = Fixes/Feinschliff. Bei **jedem** Release erhöhen (siehe Abschnitt 5).
  1. **Struktur** (Stores/Indizes): `DB_VERSION` in `db.js` erhöhen, Store in
     `STORES` ergänzen – `onupgradeneeded` legt Fehlendes additiv an.
     Bestehende Stores nie zerstörerisch umbauen; Daten der Nutzer sind heilig.
  2. **Datenform** (neue/geänderte Felder): `SCHEMA_VERSION` in `store.js`
     erhöhen und einen Schritt in `MIGRATION_STEPS` (Schlüssel = Ziel-Version)
     ergänzen. `migrateSchema()` läuft beim App-Start kaskadiert
     (v1→v2→v3 …; aktueller Stand **8** – `quartal` auf noten/ereignisse/stunden,
     `aktuellesQuartal` + `haModus` in den Settings). Neue Felder bekommen zusätzlich immer Defaults
     (Factorys + `getSettings`-Merge), damit alte Datensätze nicht crashen.
- IDs via `Store`-internem `uid()` (crypto.randomUUID mit Fallback).
- Tages-Zuordnungen (Abwesenheiten, aktive Tage) nutzen das **lokale** Datum
  (`Store.datumLokal()` / `Calc.tagVonTs()`), nicht `toISOString()` (UTC).

## 5. Service Worker – Cache-Falle

`service-worker.js` cached die App-Shell **cache-first** unter dem Namen
`noten-fritze-<APP_VERSION>` (z. B. `noten-fritze-1.5.0`). Der Name wird aus
`js/version.js` gebildet, das der Service Worker per `importScripts` lädt.

⚠️ **Bei jeder Änderung an einer gecachten Datei** (`index.html`, `css/`, `js/`,
Manifest, Icons) muss `APP_VERSION` in `js/version.js` erhöht werden – im
Zweifel die PATCH-Stelle (`1.5.0` → `1.5.1`). Sonst bekommen installierte PWAs
die Änderung nie zu sehen; das ist die häufigste Ursache für „mein Fix kommt
nicht an". Neue Dateien zusätzlich in `ASSETS` eintragen.

## 6. Fachlogik – wo was hingehört

- **Berechnungen immer in `calc.js`** (rein, testbar, ohne DOM/DB-Zugriff):
  Noten-Parsing (`2+` → 1,7), gewichtete Gesamtnote (Kategorie → Art-Gruppe →
  Gesamt, fehlende Gruppen zählen 100 %), Mitarbeits-Auswertung, Heatmap-Farbe.
- **Zeugnisskala:** `Calc.zeugnisnote` rundet auf ganze Noten plus die einzige zulässige
  Tendenz 4- (=4,3): bis 1,5→1 · bis 2,5→2 · bis 3,5→3 · unter 4,15→4 · bis 4,5→4- ·
  bis 5,5→5 · darüber 6 (genau auf der Grenze gewinnt die bessere Note).
  `Calc.zeugnisErgebnis(res)` rechnet die Zeugnisnote aus den **gerundeten** Teilnoten und
  fällt nur bei Ergebnissen exakt auf einer Grenze auf `res.gesamtRoh` zurück.
  `Calc.jahresnote(hj1, hj2)` gewichtet 49/51, damit bei Gleichstand das 2. Halbjahr
  entscheidet. Anzeige immer über `Calc.formatZeugnisnote`.
- **Kategorien** tragen `anzeige: "note" | "fehlendeHA"`. `fehlendeHA` heißt: die Spalte
  zeigt die Anzahl der `keinehausaufgabe`-Ereignisse und die Kategorie fällt in
  `Calc.berechneSchueler` aus der Gewichtung (Feld `zaehltInNote` je Kategorie-Ergebnis).
- **Anteile:** Hauptfach 50/50, Nebenfach 30/70 (Defaults in `settings.anteile`, pro Klasse
  überschreibbar).
- **Notentabelle = Spaltenmodell:** Kopf und Datenzellen entstehen aus einer Liste von
  Spalten-Deskriptoren (`halbjahrSpalten` / `jahresSpalten` in `views.home-klasse.js`),
  jeder mit `id`, Farbgruppe (`grp`) und `zelle(sp, ctx)`. Neue Spalten dort ergänzen,
  nicht im HTML-String. Die per Ziehen gesetzte Reihenfolge liegt **nur** in
  `state.notenSpalten` (`{ key, ids }`) – bewusst nicht in IndexedDB, damit beim Neuladen
  der Default gilt. Passt die Spaltenmenge nicht zur gemerkten Liste, greift der Default.
  Das Ziehen selbst ist Pointer-Events-Code (`spaltenZiehen`), weil iPad-Safari kein
  HTML5-Drag&Drop kennt; sortiert wird erst beim Loslassen. Für iPad: `touch-action:
  none` auf `th.zieh`, `preventDefault()` im `pointerdown` und Move/Up-Listener auf
  `document`, damit iOS den Drag nicht per `pointercancel` abwürgt.
- **Reihenfolge der Schüler/innen:** `settings.schuelerSortierung`
  (`"nachname"` = Default, alphabetisch nach Nachname/Vorname mit deutscher Kollation |
  `"manuell"` = `sortIndex`). Sortiert wird **ausschließlich zentral** in
  `Store.Schueler.byKlasse` – keine eigene Sortierung in Views einbauen. Der `sortIndex`
  bleibt in beiden Modi erhalten; die ▲/▼-Buttons im Schüler-Tab erscheinen nur im
  Modus „manuell“, weil sie sonst wirkungslos wären.
- Ereignistypen (Wortmeldung, Störung, …) sind **zentral in `store.js`
  (`EVENT_TYPES`)** definiert – Reihenfolge dort = Anzeigereihenfolge. Keine
  hartcodierten Typen-Listen in Views duplizieren. `aufKachel` entscheidet, ob ein
  Typ einen Button auf der Tracker-Kachel bekommt (`Store.KACHEL_EVENT_TYPES`) oder
  nur über einen Modus erfassbar ist („Fehlende HA“, „Leistungsverweigerung“).
  Kachel-Typen tragen zusätzlich ein `icon` (★/★★/★★★/⚡), das die Buttons als
  Piktogramm zeigt.
- Heatmap (0–100 Punkte) ist **bewusst unabhängig** von den Mitarbeitspunkten –
  diese Trennung nicht verwässern.
- **Quartale:** Noten, Ereignisse und Stunden tragen `quartal` (1–4: Aug–Okt,
  Nov–Jan, Feb–Apr, Mai–Jul), beim Anlegen aus `settings.aktuellesQuartal`.
  Helfer: `Store.quartalAusDatum` / `Store.halbjahrAusQuartal`. Das Feld
  `halbjahr` bleibt als abgeleitetes Legacy-Feld auf den Datensätzen, wird aber
  nicht mehr gelesen. `Calc.berechneSchueler` filtert mit `1–4 | "hj1" | "hj2" |
  null` (Jahr); Datensätze ohne `quartal` fließen immer ein. Die Navigation
  heißt überall „1. Q · 2. Q · 3. Q · 4. Q · Jahr" (`state.notenQuartal` /
  `state.auswertungQuartal`, `quartalFilter` / `quartalTabsHTML` in views.core.js).
- **Sonstige Leistungen quartalsweise:** Bei Halbjahr-/Jahr-Filter rechnet
  `Calc.berechneSchueler` die sonstige Gruppe als Mittel der
  Quartals-Durchschnitte (Q1+Q2 je 50 % fürs 1. HJ; fehlende Quartale werden
  robust übersprungen, vorhandene zählen 100 %). Die Quartals-Ergebnisse liegen
  in `res.sonstige.quartale` – die Jahr-Ansicht der Notenübersicht zeigt daraus
  die Spalten „Sonst. 1. Q–4. Q" (`jahresSpalten`). Schriftlich läuft
  unverändert über den ganzen Zeitraum.
- **Stunden (Store `stunden`) sind die Erfassungseinheit des Trackers:** Beim Start
  wird eine Stunde angelegt (`Store.neueStunde` aus `Calc.trackerSession`,
  Einzel-/Doppelstunde) oder die offene Stunde von heute fortgesetzt
  (`Store.Stunden.offeneVonHeute`); „Stunde beenden“ setzt `status:"beendet"`.
  Ereignisse tragen `stundeId`. Die Restzeit kommt aus `stunde.endeTs`, der
  Heatmap-Verfall skaliert auf `stunde.dauerMin` (`heatVerfallMinuten` gilt bezogen
  auf eine 45-Min-Stunde).
- **Heatmap-Zeit:** Der Verfall läuft **nur innerhalb einer laufenden Stunde**
  (Bezugszeit `min(jetzt, stunde.endeTs)`). Beim Öffnen/Fortsetzen wird
  `heatLastDecayAt` auf jetzt gesetzt (kein Nachhol-Verfall aus der Pause), beim
  Beenden/Verlassen der aktuelle Wert festgeschrieben.
- **Tracker-Modi:** Abwesend / Verweigerung (🚫) / Keine HA / Heatmap liegen in der
  Topbar (`state.trackerModus`); ein aktiver Modus setzt eine `modus-*`-Klasse am
  `<body>` (Farbschema) und macht die ganze Kachel zum Tap-Ziel. `ViewTracker` baut
  `state.tracker` nur neu auf, wenn Klasse oder Stunde wechseln – sonst gingen beim
  Moduswechsel (`render()`) Zähler und Undo-Stack verloren. Bei breiten Sitzplänen
  staffeln die Grid-Klassen `kompakt` (≥7 Spalten) / `mini` (≥9 Spalten) die
  Kachelgröße (styles.css).
- **Abwesenheiten** (Store `abwesenheiten`, Toggle pro Schüler/Tag): eingefrorene
  Heatmap, deaktivierte Ereignis-Buttons, und die Stunden dieses Tages fallen in
  `Calc.auswertungMitarbeit` aus den gezählten Stunden (bringen also weder Punkte
  noch eine Stundennote).
- **Mitarbeitsnote (Stundennoten-Modell):** `Calc.auswertungMitarbeit(ereignisse,
  settings, opts)` vergibt je **gehaltener Stunde mit Anwesenheit** eine
  Stundennote aus den Stundenpunkten via Schwellen (`Calc.punkteZuNote`);
  Stunden ohne Meldung zählen als 0 Punkte. Der Notenvorschlag ist der Ø der
  Stundennoten (1 NK). Die Schwellen bedeuten also „Punkte in einer Stunde →
  Stundennote" (nicht mehr „Ø-Punkte"). Rückgabe u. a. `stundenNoten`
  (chronologisch, `{stundeId, datum, note, punkte, verweigerung}`) und
  `verweigerungen`. Die Schwellen liefert `Calc.schwellenFuer(settings,
  klasse)`: `klasse.mitarbeitSchwellen` (klassenweise, optional) schlägt
  `settings.mitarbeitSchwellen`. Beide sind im UI editierbar.
- **Leistungsverweigerung:** Ereignistyp `verweigerung` (`aufKachel: false`),
  Erfassung über den Tracker-Modus 🚫 (Toggle mit Badge auf der Kachel,
  Typ-Buttons deaktiviert). Eine Stunde mit Verweigerung zählt als Stundennote
  6 und die Meldungspunkte der Stunde entfallen; die HA-Zählung
  (`keinehausaufgabe`) bleibt davon unberührt.
- **HA-Modus:** `settings.haModus` (`"punkte"` = Punkteabzug in der Mitarbeit,
  bisheriges Verhalten | `"note6"` = vergessene HA geben keine Punkte;
  `Store.haNote6Pruefen` erzeugt bei jeder 3. je Quartal automatisch eine Note
  6 in „Mündliche Mitarbeit", Aufruf im Tracker-Modus „Keine HA"). Select in
  den Einstellungen.
- **Quartal abschließen:** Button im Mitarbeit-Tab (nur bei konkretem Quartal),
  Dialog `quartalAbschliessenDialog` mit pro Schüler editierbaren
  Notenvorschlägen und Ziel-Kategorie (Default „Mündliche Mitarbeit"). Vor dem
  Löschen CSV-Export der Noten (`CSV.exportQuartalNoten`) und Ereignisse
  (`CSV.exportEreignisse`); der Übertrag legt die Noten mit Quartal an und
  löscht Ereignisse + Stunden des Quartals (Abwesenheiten bleiben).
- **Exporte:** Alle Exporte laufen über `CSV.speichern(dateiname, inhalt, mime)` –
  dreistufig: 1) Export-Ordner via File System Access API (Handle in IndexedDB unter
  einstellungen/key `"export"`, Card „Export-Ordner“ in den Einstellungen),
  2) Web Share API mit Dateien (iPad-Safari hat keinen Ordner-Picker → Teilen-Blatt
  „In Dateien sichern“), 3) klassischer Download als Fallback.
- **Klassen-Export/-Import:** `Store.exportKlasse` / `Store.importKlasse` (JSON einer
  einzelnen Klasse inkl. Schüler, Kategorien, Noten, Ereignisse, Stunden,
  Abwesenheiten, Sitzplan). Import bei bestehender Klassen-ID im Modus „ersetzen“
  (kaskadierend löschen, dann importieren) oder „kopie“ (alle IDs neu vergeben,
  Referenzen inkl. `sitzplan.seats[].schuelerId` ummappen). Buttons „Exportieren“
  in der Klassen-Topbar, „Klasse importieren“ auf Home (`klassenImportDialog`).
- **Klasse löschen:** 🗑-Button direkt auf der Home-Kachel (`delete-class`,
  Bestätigungsdialog, Kaskade via `Store.Klassen.remove`).
- **MSS-Punkte (Klassenstufe ab 11):** `klasse.klassenstufe` (5–13, `null` =
  Sek. I, im Klassen-Dialog wählbar) entscheidet über `Calc.istMSS(klasse)`,
  ob eine Klasse Schulnoten (1–6, niedriger = besser) oder MSS-Punkte
  (0–15, ganzzahlig, höher = besser) verwendet. Die betroffenen `Calc`-
  Funktionen (`parseNote`, `clampNote`, `noteFarbe`, `zeugnisnote`,
  `formatZeugnisnote`, `zeugnisErgebnis`, `jahresnote`) nehmen dafür einen
  optionalen `mss`-Parameter (Default `false`); Aufrufer reichen ihn aus dem
  `klasse`-Objekt durch. `formatNote`/`berechneSchueler`/`rundeGesamt` bleiben
  skalenunabhängig (reine Mittelwertbildung). Der Mitarbeits-Tracker
  (Stundennoten-Modell, Notenschwellen) bleibt bewusst unverändert auf der
  1–6-Skala – er ist eine interne Vorschlags-Heuristik, keine gespeicherte
  Note. Beim „Quartal abschließen" trägt die Lehrkraft den MSS-Punktwert für
  Kursklassen deshalb selbst ein (kein Prefill aus dem 1–6-Vorschlag, der
  bleibt nur als Orientierungswert sichtbar) – es gibt keine offizielle,
  automatische Umrechnungstabelle zwischen den Skalen im Code.

## 7. Testen & Verifizieren

- Es gibt **kein Test-Framework und keinen Linter**. Verifizierung erfolgt
  manuell im Browser:
  - `index.html` doppelklicken (Demo-Daten werden beim ersten Start angelegt), oder
  - lokal servern: `npx serve .` bzw. `python -m http.server` (für PWA/SW nötig).
- Nach einer Änderung den betroffenen Flow wirklich durchklicken (z. B. Sitzplan:
  Schüler zuweisen, verschieben, Platz freimachen).
- Syntax-Fehler zeigen sich sofort in der Browser-Konsole – vor Übergabe prüfen,
  dass keine Fehler beim Laden auftreten.

## 8. Kommunikation & Konventionen im Repo

- **Sprache:** UI-Texte, Code-Kommentare und Commit-Messages auf Deutsch,
  passend zum bestehenden Ton (sachlich, kurz).
- Commit-Messages: kurze deutsche Imperativ- oder Beschreibungsform, z. B.
  „Fix: Schüler beim Zuweisen auf gewählten Sitzplatz setzen".
- Dokumentation aktuell halten: Wenn du Struktur, Konventionen oder Features
  änderst, die in `README.md` oder dieser Datei beschrieben sind, passe beide
  Dateien mit an.

## 9. Häufige Fallstricke (Learnings)

- **Service-Worker-Cache vergessen** → siehe Abschnitt 5.
- **`data-action` ohne Handler** → Button tut nichts; Action-Map in `views.js`
  ergänzen.
- **Fehlendes `UI.esc()`** bei Nutzereingaben im HTML-String.
- **`render()` nach Mutation vergessen** → UI zeigt alten Stand.
- Änderungen an `calc.js` können weitreichende Folgen haben (Gesamtnote!) –
  Berechnung im Schüler-Detail / Besprechungsmodus gegenprüfen.
- **Quartal-Tagging vergessen:** Neue Datensätze (Noten, Ereignisse, Stunden)
  müssen `quartal` bekommen – über die Factorys (`neueNote`, `neuesEreignis`,
  `neueStunde`) bzw. aus `settings.aktuellesQuartal`. Ohne `quartal` landen sie
  in jeder Quartals-Filterung (Kompatibilitäts-Regel) und verfälschen alle
  Quartale. `halbjahr` wird nur noch abgeleitet mitgeschrieben.
- **Schwellen-Bedeutung geändert:** `mitarbeitSchwellen` gelten seit dem
  Stundennoten-Modell **pro Stunde** (Punkte in einer Stunde → Stundennote),
  nicht mehr auf den Punkte-Ø. Alte Schwellenwerte wirken daher anders –
  Texte/Dialoge entsprechend lesen.
