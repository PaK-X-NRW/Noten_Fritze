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
| `js/db.js` | `DB` | Generischer IndexedDB-Wrapper (Promises, Schema-Versionierung) |
| `js/store.js` | `Store` | Domänenmodell, Repositories, Defaults, Ereignistypen, Demo-Daten |
| `js/calc.js` | `Calc` | Reine Rechenlogik (Noten, Mitarbeit, Heatmap) – **frei von DOM/DB** |
| `js/csv.js` | `CSV` | CSV-Export/Import (UTF-8 mit BOM) |
| `js/ui.js` | `UI` | UI-Bausteine: Modal, Toast, Formfelder, `esc`, `$`/`$all` |
| `js/views.core.js` | `Views` | Views-Kern: State, Navigation (`go`), Render-Schleife (`render`) |
| `js/views.home-klasse.js` | `Views` | Home (Klassenübersicht) + Klassenansicht mit Tabs |
| `js/views.tracker.js` | `Views` | Mitarbeits-Tracker (Kacheln, Heatmap, Restzeit, Start-Dialog) |
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
  Datensätze mitlöschen (Noten, Ereignisse, Abwesenheiten, Sitzplatz-Zuweisung).
  Bestehende Logik in `store.js` wiederverwenden, nicht umgehen.
- **Versionierung ist zweistufig:**
  1. **Struktur** (Stores/Indizes): `DB_VERSION` in `db.js` erhöhen, Store in
     `STORES` ergänzen – `onupgradeneeded` legt Fehlendes additiv an.
     Bestehende Stores nie zerstörerisch umbauen; Daten der Nutzer sind heilig.
  2. **Datenform** (neue/geänderte Felder): `SCHEMA_VERSION` in `store.js`
     erhöhen und einen Schritt in `MIGRATION_STEPS` (Schlüssel = Ziel-Version)
     ergänzen. `migrateSchema()` läuft beim App-Start kaskadiert
     (v1→v2→v3 …). Neue Felder bekommen zusätzlich immer Defaults
     (Factorys + `getSettings`-Merge), damit alte Datensätze nicht crashen.
- IDs via `Store`-internem `uid()` (crypto.randomUUID mit Fallback).
- Tages-Zuordnungen (Abwesenheiten, aktive Tage) nutzen das **lokale** Datum
  (`Store.datumLokal()` / `Calc.tagVonTs()`), nicht `toISOString()` (UTC).

## 5. Service Worker – Cache-Falle

`service-worker.js` cached die App-Shell **cache-first** unter dem Namen
`noten-fritze-v1`.

⚠️ **Bei jeder Änderung an einer gecachten Datei** (`index.html`, `css/`, `js/`,
Manifest, Icons) muss die **Cache-Version erhöht werden** (`noten-fritze-v1` →
`-v2` …), sonst bekommen installierte PWAs die Änderung nie zu sehen. Das ist
die häufigste Ursache für „mein Fix kommt nicht an". Neue Dateien zusätzlich in
`ASSETS` eintragen.

## 6. Fachlogik – wo was hingehört

- **Berechnungen immer in `calc.js`** (rein, testbar, ohne DOM/DB-Zugriff):
  Noten-Parsing (`2+` → 1,7), gewichtete Gesamtnote (Kategorie → Art-Gruppe →
  Gesamt, fehlende Gruppen zählen 100 %), Mitarbeits-Auswertung, Heatmap-Farbe.
- Ereignistypen (Wortmeldung, Störung, …) sind **zentral in `store.js`
  (`EVENT_TYPES`)** definiert – Reihenfolge dort = Anzeigereihenfolge. Keine
  hartcodierten Typen-Listen in Views duplizieren.
- Heatmap (0–100 Punkte) ist **bewusst unabhängig** von den Mitarbeitspunkten –
  diese Trennung nicht verwässern.
- **Halbjahr:** Noten und Ereignisse tragen `halbjahr` (1|2), beim Anlegen aus
  `settings.aktuellesHalbjahr`. `Calc.berechneSchueler` und die Auswertungen
  filtern optional danach; Datensätze ohne das Feld fließen immer ein.
- **Stundenplan/Tracker:** Der Tracker fragt beim Start Einzel-/Doppelstunde ab
  (`Calc.trackerSession`), zeigt die Restzeit und skaliert den Heatmap-Verfall
  auf die tatsächliche Stundendauer (`heatVerfallMinuten` gilt bezogen auf eine
  45-Min-Stunde).
- **Abwesenheiten** (Store `abwesenheiten`, Toggle pro Schüler/Tag): eingefrorene
  Heatmap, deaktivierte Ereignis-Buttons, und der Tag zählt in
  `Calc.auswertungMitarbeit` weder als aktiv noch bringt er Punkte.

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
