# CLAUDE.md – Arbeitsanleitung für Claude

Diese Datei ist die **verbindliche Arbeitsanleitung** für Claude (Claude Code)
in diesem Repository. Bitte vollständig lesen, bevor du Code änderst.

Besonders wichtig: **Abschnitt 8 – erst planen und zustimmen lassen, dann bauen;
im Zweifel fragen statt annehmen.**

---

## 1. Was ist Noten-Fritze?

Lokale Noten- und Mitarbeitsverwaltung für Lehrkräfte an Gymnasien in
**Rheinland-Pfalz** (Sek. I und MSS). Fachliche Regeln (Notenstufen, MSS-Punkte,
Halbjahre) richten sich nach RLP – keine Regeln anderer Bundesländer (z. B. NRW)
annehmen; im Zweifel fragen.

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
| `js/store.js` | `Store` | Store-Kern: Ereignistypen, Quartals-/Heat-Helfer, Repositories je Entität (inkl. Leistungen) |
| `js/store.einstellungen.js` | `Store` | `DEFAULT_SETTINGS`, Stundenzeiten/Schwellen, `getSettings`/`saveSettings` |
| `js/store.migrationen.js` | `Store` | `SCHEMA_VERSION`, `MIGRATION_STEPS`, `migrateSchema` |
| `js/store.transfer.js` | `Store` | Backup (`exportAll`/`importAll`) und Klassen-Export/-Import |
| `js/store.stundenplan.js` | `Store` | `Store.Stundenplan` (Versionen des Wochenplans), `Store.Wochennotizen`, `Store.Termine` + `TERMIN_ARTEN` |
| `js/store.demo.js` | `Store` | Demo-Daten (`seedDemoData`) beim ersten Start |
| `js/calc.js` | `Calc` | Rechen-Kern: Notenskala (Eingabe, Drittel-/Zeugnisskala, Anzeige, MSS-Umrechnung), Kategorie-Helfer – **frei von DOM/DB** |
| `js/calc.zeugnis.js` | `Calc` | Halbjahres-Kette: `berechneSchueler`, `halbjahrErgebnis`, `mitarbeitVorhanden` |
| `js/calc.mitarbeit.js` | `Calc` | Mitarbeits-Auswertung (Stundennoten-Modell), Schwellen |
| `js/calc.tracker.js` | `Calc` | Heatmap-Verfall/-Farbe, Stundenzeiten (`trackerSession`), vergessene Stunden (`stundeVergessen`, `erfassungsZeit`) |
| `js/calc.sitzplan.js` | `Calc` | Sitzplan: Gang-Vorlagen, Lage der Plätze, Sitzregeln prüfen, `sitzplanVerteilen` |
| `js/calc.stundenplan.js` | `Calc` | Stundenplan: Montag/KW, A/B-Wochen (`abWoche`), gültige Version (`versionFuer`), Archiv, tatsächlicher Tag (`tagesPlan`), Monat, `eintragJetzt`, Klassenfarben |
| `js/calc.planung.js` | `Calc` | Stundenplanung: `einheitBestimmen`, `fahrplanAusPlanungen`/`fahrplanAufteilen`, `minutenSumme`, `vorherigeStunde`, `planungenUmziehen` |
| `js/csv.js` | `CSV` | CSV-Export/Import (UTF-8 mit BOM) |
| `js/ui.js` | `UI` | UI-Bausteine: Modal, Toast, Formfelder, `esc`, `$`/`$all` |
| `js/views.core.js` | `Views` | Views-Kern: State, Navigation (`go`), Render-Schleife (`render`), Zeitraum-Reiter |
| `js/views.einstellungen.js` | `Views` | Einstellungen inkl. Stundenzeiten, Schwellen-Felder (`schwellenFelderHTML`) |
| `js/views.besprechung.js` | `Views` | Besprechungsmodus + Noten-Aufschlüsselung (`breakdownHTML`) |
| `js/views.home-klasse.js` | `Views` | Home (Klassenübersicht) + Klassenansicht mit Tabs Schüler/Kategorien |
| `js/views.noten.js` | `Views` | Reiter Noten: Spaltenmodell, Tabelle, Dialoge Spalte + Schüler-Detail |
| `js/views.noten.eingabe.js` | `Views` | Inline-Eingabe, Nummernpad, Spalten ziehen (`mountNotenTabelle`) |
| `js/views.sitzplan.js` | `Views` | Reiter Sitzplan + Dialoge (Platz belegen, Räume) |
| `js/views.mitarbeit.js` | `Views` | Reiter Mitarbeit + Dialoge (Schwellen, Herleitung, Quartal abschließen) |
| `js/views.tracker.js` | `Views` | Mitarbeits-Tracker (Stunden, Kacheln, Modi, Heatmap, Restzeit, Tippen, Rückgängig) |
| `js/views.stundenplan.js` | `Views` | Stundenplan auf der Startseite (Wochenraster, Bearbeiten, Pläne/Archiv, Wochennotiz, nächste Termine) |
| `js/views.kalender.js` | `Views` | Kalender: Monatsansicht, Termin-Dialog, Zellen-Menü (Ausfall, Verschieben mit Tausch, Hinweis) |
| `js/views.planung.js` | `Views` | Stundenplanung: Fahrplan-Ansicht (Bausteine, Ziehen, Übernehmen, HA), `fahrplanDialog` im Tracker |
| `js/views.dialoge.js` | `Views` | Allgemeine Dialoge (Klasse, Anteile, Schüler, Kategorie, Importe, Umzug-Empfang von der alten Adresse) |
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
  `render()` löst die Views über die Registry auf (`api.ViewHome()`), ebenso
  `ViewKlasse` die Reiter (`api.TabNoten(k)` …), weil deren Module später laden.
  Eine Datei je Bereich der App: Reiter, Eingabe-Logik und Dialoge eines
  Bereichs liegen zusammen; `views.dialoge.js` nur für allgemeine Dialoge.
  Wer beim Laden destrukturiert, braucht ein **früher** geladenes Modul
  (Reihenfolge in `index.html`, `tests.html` und `service-worker.js` gleich halten).
- Der **Store** ist nach demselben Muster aufgeteilt: `store.js` legt
  `window.Store` an (Ereignistypen, Datums-/Quartals-Helfer, Repositories), die
  Module `store.*.js` hängen sich per `Object.assign(global.Store, { ... })` an
  und holen sich den Kern per `const { ... } = global.Store;` am Dateianfang.
  Ausnahme in die andere Richtung: `store.js` braucht `getSettings` und
  `DEFAULT_SETTINGS` aus `store.einstellungen.js`, das erst danach lädt –
  deshalb greift es dort **zur Laufzeit** über `global.Store` zu (kleine Shims
  am Dateianfang). `store.demo.js` lädt zuletzt, weil es alles andere benutzt.
  `leistungenAusNoten` ist deshalb öffentlich: Migration und beide Importe
  leiten damit Spalten aus Noten ohne `leistungId` ab.
- Jede Datei beginnt mit einem **Header-Kommentarblock** (`/* ===...`), der
  Zweck und Inhalt beschreibt. Bei neuen Dateien dieses Format übernehmen.
- Wiederkehrende Bausteine liegen im Views-Kern: `notenBadge(note, mss, "tendenz"|"zeugnis")`
  (farbiges Notenkästchen) und `nameHTML(s)` („**Nachname**, Vorname“) – nicht neu bauen.
  Views schreiben nie direkt in `DB`, sondern immer über den `Store`.
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
  Datensätze mitlöschen (Leistungen, Noten, Ereignisse, Stunden, Abwesenheiten,
  Sitzplatz-Zuweisung); eine Kategorie nimmt ihre Leistungen mit, eine Leistung
  ihre Noten. Bestehende Logik in `store.js` wiederverwenden, nicht umgehen.
- **Alles oder nichts:** Löschen mit Kaskade und Importe schreiben über
  `DB.atomar(stores, (os) => { … })` in **einer** Transaktion (in `store.js` über
  den Helfer `kaskade(ueberIndex, loeschen, schreiben)`). Bricht etwas ab, bleibt
  der alte Stand vollständig erhalten. Innerhalb von `atomar` nur synchron
  `put`/`delete`/`clear` aufrufen – ein `await` beendet die Transaktion (ältere
  iPad-Safari). Lesen deshalb vorher (z. B. `DB.keysByIndex`).
- **Importe prüfen vor dem Schreiben:** `importAll`/`importKlasse` validieren die
  Datei (Listen, Kennungen) und lehnen Backups aus einer **neueren** Datenversion
  ab. Nach `importAll` läuft sofort `migrateSchema()` ab der Datenversion des
  Backups – deshalb muss jeder Migrationsschritt wiederholbar sein (s. unten).
- **Versionierung ist dreistufig** – die App-Version ist unabhängig von den
  beiden internen Zählern, sie werden **nicht** gekoppelt:
  0. **App-Version** (`APP_VERSION` in `js/version.js`, `MAJOR.MINOR.PATCH`):
     rein für Mensch und Cache. MAJOR = große Umbauten, MINOR = neue Funktionen,
     PATCH = Fixes/Feinschliff. Bei **jedem** Release erhöhen – aber nur auf
     Ansage (siehe Abschnitt 5).
  1. **Struktur** (Stores/Indizes): `DB_VERSION` in `db.js` erhöhen, Store in
     `STORES` ergänzen – `onupgradeneeded` legt Fehlendes additiv an.
     Bestehende Stores nie zerstörerisch umbauen; Daten der Nutzer sind heilig.
  2. **Datenform** (neue/geänderte Felder): `SCHEMA_VERSION` in
     `store.migrationen.js` erhöhen und dort einen Schritt in
     `MIGRATION_STEPS` (Schlüssel = Ziel-Version)
     ergänzen. `migrateSchema()` läuft beim App-Start kaskadiert
     (v1→v2→v3 …; aktueller Stand **14** – v12: neue Notenschwellen auf ganzen
     Punkten, v13: `abgeschlosseneQuartale` an der Klasse, v14: mehrere Sitzpläne je Klasse). Neue Felder bekommen zusätzlich immer Defaults
     (Factorys + `getSettings`-Merge), damit alte Datensätze nicht crashen.
     ⚠️ Ein Schritt, der **Einstellungen** ändert, muss `getSettings()` selbst
     aufrufen und speichern; `migrateSchema` liest die Einstellungen nach den
     Schritten neu (jeder `getSettings()`-Aufruf liefert eine frische Kopie).
     ⚠️ Jeder Schritt muss **wiederholbar** sein: nur Datensätze in der alten
     Form anfassen (z. B. „nur Ereignisse ohne `stundeId`“), nie gewählte Werte
     pauschal überschreiben. Ein älteres Backup lässt die Schritte ab seiner
     Version erneut über alle Daten laufen. Neue Einstellungen bekommen die
     aktuelle `SCHEMA_VERSION` (erster Start); `migrateSchema` läuft beim Start
     **vor** den Demo-Daten.
- IDs via `Store`-internem `uid()` (crypto.randomUUID mit Fallback).
- Tages-Zuordnungen (Abwesenheiten, aktive Tage) nutzen das **lokale** Datum
  (`Store.datumLokal()` / `Calc.tagVonTs()`), nicht `toISOString()` (UTC).

## 5. Service Worker – Cache-Falle

`service-worker.js` cached die App-Shell **cache-first** unter dem Namen
`noten-fritze-<APP_VERSION>` (z. B. `noten-fritze-1.16.0`). Der Name wird aus
`js/version.js` gebildet, das der Service Worker per `importScripts` lädt.

⚠️ **Änderungen an einer gecachten Datei** (`index.html`, `css/`, `js/`,
Manifest, Icons) erreichen installierte PWAs erst, wenn `APP_VERSION` in
`js/version.js` steigt – das ist die häufigste Ursache für „mein Fix kommt
nicht an". **Die Version aber nicht selbstständig hochzählen:** Mehrere
Änderungen werden gesammelt, und der Nutzer sagt am Ende an, wann und auf
welche Nummer erhöht wird (MINOR bei neuen Funktionen, sonst PATCH). Am Ende
einer Aufgabe nur darauf hinweisen, dass ein Versionssprung aussteht.
Neue Dateien zusätzlich in `ASSETS` eintragen.

**Infoseite `info.html`** (mit `img/*.jpg`) ist ebenfalls in `ASSETS` und damit
gecacht: Änderungen dort brauchen genauso einen Versionssprung. Sie enthält die
Datenschutzerklärung – wer neue Datenflüsse einführt (was Abschnitt 1 ohnehin
verbietet) oder Funktionen umbenennt, muss Text und Kurzanleitung mitpflegen.
Screenshots nur mit Beispieldaten (erfundene Namen), nie mit echten Schülerdaten.
Neue öffentliche Seiten zusätzlich in `sitemap.xml` eintragen.

Damit das greift, registriert `app.js` den Service Worker mit
`{ updateViaCache: "none" }`. Ohne diese Option holt der Browser die per
`importScripts` geladene `version.js` bei der Update-Prüfung aus dem HTTP-Cache
(GitHub Pages liefert `max-age=600`) und übersieht den Versionssprung –
`service-worker.js` selbst ändert sich bei einem reinen Release ja nicht.
Die Option deshalb nicht entfernen. Übernimmt ein neuer Service Worker die
Seite, zeigt `app.js` den Toast „Neue Version verfügbar" mit „Neu laden";
beim allerersten Start erscheint er bewusst nicht.

## 6. Fachlogik – wo was hingehört

- **Berechnungen immer in `calc*.js`** (rein, testbar, ohne DOM/DB-Zugriff; geprüft in
  `tests.html`). Aufgeteilt nach Thema wie beim Store: `calc.js` legt `window.Calc` an,
  `calc.zeugnis.js` / `calc.mitarbeit.js` / `calc.tracker.js` / `calc.sitzplan.js` hängen sich per
  `Object.assign(global.Calc, …)` an. Ob eine Kategorie als Note zählt bzw. eine
  Mitarbeits-Kategorie ist, beantworten `Calc.istNotenKategorie` /
  `Calc.istMitarbeitsKategorie` – die Bedingung nicht in Views nachbauen:
  Noten-Parsing (`2+` → 1,7), gewichtete Gesamtnote (Kategorie → Art-Gruppe →
  Gesamt, fehlende Gruppen zählen 100 %), Mitarbeits-Auswertung, Heatmap-Farbe.
- **Zeugnisskala:** `Calc.zeugnisnote` rundet auf ganze Noten plus die einzige zulässige
  Tendenz 4- (=4,3): bis 1,5→1 · bis 2,5→2 · bis 3,5→3 · unter 4,15→4 · bis 4,5→4- ·
  bis 5,5→5 · darüber 6 (genau auf der Grenze gewinnt die bessere Note).
  `Calc.jahresnote(hj1, hj2)` gewichtet 49/51, damit bei Gleichstand das 2. Halbjahr
  entscheidet. Anzeige immer über `Calc.formatZeugnisnote`.
- **Drittelnoten:** Alle Zwischennoten laufen über `Calc.tendenznote` (x,0 | x,3 | x,7);
  genau zwischen zwei Stufen gewinnt die **schlechtere** Note (2,15 → 2,3). Gerundet wird
  in Tausendsteln, weil die Mitte binär sonst nicht exakt trifft. Bei MSS-Punkten runden
  `tendenznote` und `zeugnisnote` einheitlich auf ganze Punkte, bei genau x,5 auf die
  **größere** Punktzahl (10,5 → 11). Angezeigt wird
  ausschließlich über `Calc.formatTendenz` (1,7 → „2+"), nie als Dezimalzahl; nur Werte
  außerhalb der Skala fallen auf `formatNote` zurück.
- **Halbjahres-Kette:** `Calc.halbjahrErgebnis(kategorien, noten, klasse, hj, mss)` ist die
  eine Quelle für die Notenübersicht, den Besprechungsmodus, das Schüler-Detail und den
  CSV-Export: Epochalnote je Quartal (Drittel) → sonstige Leistungen (Ø der gerundeten
  Epochalnoten, Drittel) → schriftliche Leistungen (Drittel) → Zeugnisnote (Zeugnisskala).
  Keine dieser Rechnungen in einer View nachbauen.
- **Kategorien** tragen `anzeige: "note" | "fehlendeHA"`. `fehlendeHA` heißt: die Spalte
  zeigt die Anzahl der `keinehausaufgabe`-Ereignisse und die Kategorie fällt in
  `Calc.berechneSchueler` aus der Gewichtung (Feld `zaehltInNote` je Kategorie-Ergebnis).
- **Kategorien tragen zusätzlich `quelle: "manuell" | "mitarbeit"`.** „mitarbeit" heißt:
  die Noten kommen ausschließlich aus „Quartal abschließen". Ihre Spalten sind in der
  Notenübersicht **ausgeblendet** (`halbjahrSpalten` filtert sie): Aus dem
  Mitarbeitsbereich zeigt die Übersicht nur die fertige Epochalnote. Die Note zählt
  unverändert mit und ist im **Schüler-Detail** (Tipp auf den Namen, Abschnitt
  „Mitarbeitsnote je Quartal") editierbar; `leistungDialog` bietet Mitarbeits-Kategorien
  deshalb nicht mehr zur Auswahl an. Daran hängt auch, wann die Epochalnote entsteht
  (`Calc.mitarbeitVorhanden`): Solange für ein Quartal keine Mitarbeitsnote vorliegt, ist
  `epochal[i].offen === true` und die Epochalnote bleibt `null`. Klassen **ohne** eine
  Kategorie mit `quelle: "mitarbeit"` arbeiten ohne Mitarbeitsnote – dort ist die
  Epochalnote sofort fertig, sonst käme sie nie zustande.
- **Anteile:** Hauptfach 50/50, Nebenfach 30/70 (Defaults in `settings.anteile`, pro Klasse
  überschreibbar).
- **Eine Spalte = eine Leistung:** Store `leistungen` ({klasseId, kategorieId, quartal,
  titel, datum}) ist die Spalte der Notenübersicht; die Kategorie liefert nur noch
  Gewicht und Gruppe. In einer Zelle (Leistung × Schüler/in) steht **genau eine Note** –
  durchgesetzt von `Store.Noten.setzeZelle(leistung, schuelerId, wert)` (wert `null`
  löscht). Titel, Datum, Quartal und Kategorie einer Note folgen immer ihrer Leistung;
  Noten nie mit `Store.Noten.save` direkt an der Spalte vorbei anlegen. Für automatisch
  erzeugte Noten (Quartalsabschluss, HA-Note 6) gibt es `Store.leistungFuer`.
- **Zeitraum der Notenübersicht ist das Halbjahr** (`state.notenHalbjahr`,
  `halbjahrFilter` / `halbjahrTabsHTML(action, klasse)` in views.core.js) – die Quartale
  erscheinen darin als Epochalnoten. In MSS-Klassen heißen die Reiter nach der
  Klassenstufe („12.1 · 12.2"), weil dort jedes Kurshalbjahr eine eigene Endnote ist. Mitarbeit/Tracker bleiben quartalsweise (`quartalFilter`).
  Das Quartal einer Note kommt aus ihrer Spalte, **nicht** aus `settings.aktuellesQuartal` –
  sonst wandern Noten beim Erfassen ins falsche Halbjahr.
- **Notentabelle = Spaltenmodell:** Kopf und Datenzellen entstehen aus einer Liste von
  Spalten-Deskriptoren (`halbjahrSpalten` in `views.noten.js`), jeder mit `id`,
  Farbgruppe (`grp`) und `zelle(sp, ctx)`. Neue Spalten dort ergänzen, nicht im
  HTML-String. Reihenfolge: schriftliche Leistungen · je Quartal (sonstige Leistungen
  **ohne** die der Mitarbeits-Kategorien, HA-Zählung, Epochalnote) · Schriftlich ·
  Sonstige · Zeugnisnote (+ Jahr im 2. HJ, aber **nicht** in MSS-Klassen).
- **Inline-Eingabe:** `notenEingabe` in `views.noten.eingabe.js` macht die Zelle zum
  Eingabefeld (Enter = nächste Zeile, Tab = nächste Spalte, Esc = abbrechen).
  Dazu öffnet sich das **Nummernpad** (`.notenpad`, im `body` mit
  `position: fixed`, damit der Tabellen-Scroll es nicht abschneidet; Werte:
  Drittelnoten bzw. 0–15 in MSS-Klassen). Das Eingabefeld trägt
  `inputmode="none"`, damit auf dem iPad keine Bildschirmtastatur aufgeht –
  eine echte Tastatur funktioniert weiter. Die Pad-Buttons hängen an
  `pointerdown` mit `preventDefault()`: So verliert das Feld den Fokus nicht
  (blur würde vorzeitig speichern) und iOS liefert das Ereignis zuverlässig.
  Ein Tipp auf einen Wert speichert und springt eine Zeile weiter. Nach dem
  Speichern wird **nur die betroffene Zeile** neu gerechnet (`notenKtx` + `zeilenKontext`),
  kein `render()` – sonst springt der Fokus. `notenKtx` hält den Renderkontext zwischen
  `TabNoten` und `mountNotenTabelle`. Die per Ziehen gesetzte Reihenfolge liegt **nur** in
  `state.notenSpalten` (`{ key, ids }`) – bewusst nicht in IndexedDB, damit beim Neuladen
  der Default gilt. Passt die Spaltenmenge nicht zur gemerkten Liste, greift der Default.
  Das Ziehen selbst ist Pointer-Events-Code (`spaltenZiehen`), weil iPad-Safari kein
  HTML5-Drag&Drop kennt; sortiert wird erst beim Loslassen. Ein reiner Tipp auf den Kopf
  ruft den Callback `beimTippen` (Spalte bearbeiten) – ein normales `click`-Event kommt auf
  iOS nicht an, weil `pointerdown` `preventDefault()` macht. Für iPad: `touch-action:
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
  robust übersprungen, vorhandene zählen 100 %); die Quartals-Ergebnisse liegen
  in `res.sonstige.quartale`. Die Notenübersicht nutzt diesen Weg **nicht** direkt,
  sondern `Calc.halbjahrErgebnis` – dort werden die *gerundeten* Epochalnoten
  gemittelt. Schriftlich läuft unverändert über den ganzen Zeitraum.
- **Stunden (Store `stunden`) sind die Erfassungseinheit des Trackers:** Beim Start
  wird eine Stunde angelegt (`Store.neueStunde` aus `Calc.trackerSession`,
  Einzel-/Doppelstunde) oder eine noch laufende offene Stunde fortgesetzt
  (`Store.Stunden.offene`); „Stunde beenden“ setzt `status:"beendet"`.
  Ereignisse tragen `stundeId` und das Quartal **ihrer Stunde** (`neuesTrackerEreignis`).
  Die Restzeit kommt aus `stunde.endeTs`, der
  Heatmap-Verfall skaliert auf `stunde.dauerMin` (`heatVerfallMinuten` gilt bezogen
  auf eine 45-Min-Stunde).
- **Stundenzeiten** (`settings.stundenzeiten`, bis 1.15 `stundenplan`): zeitlich
  sortierte Blöcke `{ id, art: "stunde"|"pause", name, start, ende, nr }`, jeden
  Schultag gleich. Stunden werden nach Lage nummeriert (`id` = `"std-<nr>"`, 1–14),
  Pausen/sonstige Zeiten (Frühaufsicht …) tragen einen Namen und eine feste
  `p-…`-ID; höchstens 40 Blöcke. `Store.stundenzeitenNormalisieren` sortiert und
  nummeriert, `Store.stundenzeitenLesen` wandelt das alte Feld beim Lesen um (nur
  Stunden, **keine** Pausen – bestehende Nutzer legen sie per „Pausen aus Lücken
  anlegen“ = `Store.pausenAusLuecken` an; der Standard für neue Installationen hat
  sie). Deshalb kein Migrationsschritt. `Calc.aktuelleStunde`/`trackerSession`
  sehen nur die Stunden; eine Doppelstunde reicht bis zum Ende der nächsten Stunde.
- **Vergessene Stunden:** Offene Stunden werden **nie stillschweigend** beendet.
  `Calc.stundeVergessen` (offen und Ende vorbei; ohne Zeitangabe ab dem Folgetag)
  → `trackerStartDialog` zeigt zuerst `vergesseneStundeDialog` („Letzte Stunde wurde
  nicht beendet“): „Ja“ öffnet den Tracker im **Nachtrage-Modus**
  (`state.pendingNachtragen` → `state.tracker.nachtragen`): Heatmap ohne Verfall und
  ohne Punkte (`heatDelta` 0), Ereignisse bekommen `timestamp` =
  `Calc.erfassungsZeit` (innerhalb der Stunde, wichtig für Tages-Zuordnung und
  Abwesenheiten) und `erfasstAm` = echter Zeitpunkt. „Nein“ beendet
  (`Stunden.beenden` setzt bei fehlender Zeitangabe das Ende höchstens aufs
  Tagesende). In einem abgeschlossenen Quartal nur Beenden; `Store.quartalAbschliessen`
  beendet alle offenen Stunden des Quartals. Die Startseite zeigt je Klasse eine
  Leiste (`vergesseneStundenHTML`, Action `offene-stunde`).
- **Stundenplan (Wochenplan, Startseite):** Store `stundenplaene` (seit `DB_VERSION` 5),
  je Datensatz eine **Version** `{ id, gueltigAb, eintraege }`; `gueltigAb` ist ein
  Montag, `null` beim ersten Plan (= von Anfang an). Gültig ist die Version mit dem
  spätesten `gueltigAb` ≤ Datum (`Calc.versionFuer`); ältere als die heute gültige
  sind **Archiv** (`Calc.versionArchiviert`) und nur lesbar – bearbeitet wird immer die
  Version der angezeigten Woche. Einträge `{ tag 1–5, blockId, woche "alle"|"A"|"B",
  klasseId | titel, sitzplanId }` verweisen über `blockId` auf die Stundenzeiten
  (`std-<nr>` bzw. Pausen-ID) – eine Stunde wird also über ihre **Nummer**
  angesprochen. Zugriff nur über `Store.Stundenplan` (`zelleSetzen` ersetzt eine
  Zelle, `blockEntfernen` beim Löschen einer Pause/Stunde: nur aktuelle und künftige
  Versionen, nach Rückfrage in `views.einstellungen.js`). **A/B-Wochen:**
  `settings.abWochen` = Umschaltpunkte `{ abMontag, woche }`; `Calc.abWoche` zählt stur
  im Wochenwechsel ab dem letzten Punkt (vorher rückwärts), `Calc.abWocheSetzen`
  setzt ab einer Woche neu – frühere Wochen bleiben. Leer = keine A/B-Wochen; der
  erste A/B-Eintrag fragt nach. `settings.startAnsicht` merkt die Ansicht der
  Startseite (`ViewHome` delegiert an `ViewStundenplan`, Umschalter nur mit Plan).
  Notiz je Woche im Store `wochennotizen` (Schlüssel = Montag, leerer Text löscht).
  Kaskade: `Klassen.remove` entfernt die Einträge der Klasse aus **allen** Versionen
  (gleiche Transaktion). Nicht im Klassen-Export (der Plan gehört der Lehrkraft),
  aber im Backup. Tracker-Start: `Calc.eintragJetzt` belegt den Raum vor und macht
  „Doppelstunde“ zum Hauptknopf, wenn die Klasse auch die folgende Stunde hat.
  `db.js` meldet ein blockiertes Upgrade (anderes Fenster offen) per Toast und gibt
  die eigene Verbindung bei `versionchange` frei.
- **Kalender:** Store `termine` (seit `DB_VERSION` 6) hält Termine (`art` aus
  `Store.TERMIN_ARTEN`, `blockId` null = ganztägig), Ferien (`art: "ferien"`, `datum`–`bis`)
  und **Änderungen** einzelner Stunden (`art: "aenderung"`, `aenderung: "ausfall" |
  "verschoben" | "hinweis"`, `nachDatum`/`nachBlockId`). Eine Änderung meint die Stunde
  über **Datum + Block + Klasse** (bzw. Freitext), nie über die ID des Plan-Eintrags –
  Versionen bekommen neue IDs. Der Plan selbst wird nie geändert. `Calc.tagesPlan`
  ist die eine Quelle für den tatsächlichen Tag (Wochenansicht, Zellen-Menü, Tracker):
  an Ferientagen kein Unterricht, Termine und hergeschobene Stunden bleiben;
  `Calc.stundenFinden` = Stunden, die wirklich stattfinden. Verschieben schreibt
  `Store.Termine.verschieben` in einer Transaktion; liegt am Ziel Unterricht, tauschen
  die Stunden die Plätze (zurück an den eigenen Platz = Änderung löschen). Die Wochen-
  ansicht rechnet mit `tagesPlan`, nur der Bearbeiten-Modus zeigt den reinen Plan.
  Kaskade: `Klassen.remove` löscht die Termine der Klasse (Index `klasseId`), bewusst
  **nicht** über `klassenAbhaengige` – der Klassen-Import „ersetzen“ bringt keine
  Termine mit. Im Backup, nicht im Klassen-Export. **Farbe je Klasse:** `klasse.farbe`
  aus `Calc.KLASSEN_FARBEN` (Klassen-Dialog; neue Klassen bekommen
  `Calc.freieKlassenFarbe`), ohne Wert berechnet `Calc.klassenFarbe` eine feste Farbe aus
  der ID – keine Migration. Gilt im Stundenplan, bei Terminen der Klasse und als Streifen
  auf der Klassenkarte.
- **Stundenplanung:** Store `planungen` (seit `DB_VERSION` 7, dort auch schon `dateien`):
  **je Stunde ein Datensatz** `{ klasseId, datum, blockId, thema, bausteine }`, Schlüssel ist
  der tatsächliche Platz der Stunde. Eine Einheit (Doppelstunde) bestimmt
  `Calc.einheitBestimmen`; das Fenster (`state.view = "planung"`, `state.planungSlot`) zeigt
  sie als eine Liste mit Trennern, `Calc.fahrplanAufteilen` verteilt beim Speichern auf die
  Stunden (`Store.Planungen.einheitSpeichern`, räumt doppelte Datensätze auf). Speichern
  läuft in `views.planung.js` über eine **Kette** (nacheinander) – parallele Aufrufe legten
  sonst je einen neuen Datensatz an. Beim Verschieben/Tauschen/Zurückholen einer Stunde
  ziehen ihre Planungen in **derselben Transaktion** mit (`planungsUmzug` →
  `Calc.planungenUmziehen`, gleichzeitige Züge, Kollision = zusammenlegen). Tipp auf eine
  Klassenstunde → Planung, langes Drücken/Rechtsklick → Zellen-Menü (`UI.langDruck`
  verschluckt danach den Klick bis zum Loslassen, sonst löst iOS zusätzlich den Tipp aus).
  Sortieren per Pointer-Events am Griff (`touch-action: none`), wie `spaltenZiehen`.
  Kaskade: `Klassen.remove` löscht die Planungen (Index `klasseId`), nicht über
  `klassenAbhaengige`. Im Backup, nicht im Klassen-Export.
- **Dateien der Planung:** Store `dateien` (`Store.Dateien`), Inhalt als **ArrayBuffer**
  (nicht Blob – ältere iPad-Safaris), Name/Größe stehen zusätzlich im Baustein
  (`{ typ: "datei", dateiId, name, groesse }`), damit sie ein Entfernen überleben.
  `Store.Dateien.aufraeumen(frist, heute)` läuft in `app.js` nach den Migrationen: Datei
  ohne Baustein → löschen; letzte Stunde mit der Datei älter als die Frist und nicht
  `behalten` → `daten = null`, `entferntAm`. Einstellungen `dateiAufbewahrung`
  ("frist"|"nie") und `dateiFristTage` (1–365, Standard 14). Backup: `exportAll({ mitDateien })`
  schreibt `daten64` (Base64) nur auf Wunsch; `importAll` behält bei fehlendem Inhalt einen
  vorhandenen lokalen Inhalt, sonst gilt die Datei als entfernt. Die Dateiauswahl muss
  **direkt im Tipp** geöffnet werden (`input.click()` synchron), sonst blockt iOS.
- **Weiterschieben bei Ausfall:** `Calc.weiterschiebenZuege(…, vorher, nachher, …, modus)`
  vergleicht die Reihe der stattfindenden Stunden einer Klasse (`Calc.stundenReihe`)
  mit Terminen **ohne** und **mit** den Ausfällen: Inhalt der i-ten Stunde vorher →
  i-te Stunde nachher; `modus "einheit"` rechnet je Einheitengröße getrennt
  (Doppel → Doppel), `"stunde"` Stunde für Stunde. Aufheben = dieselbe Rechnung mit
  vertauschten Terminlisten. Horizont: letzte Planung der Klasse + 60 Tage. Die
  Ausfall-Datensätze tragen `verschiebeModus`; `Store.Termine.ausfallDatensaetze` baut
  sie vorab (damit „nachher“ berechenbar ist), `ausfaelleSchreiben`/`ausfaelleAufheben`
  schreiben Termine und Planungs-Umzug in einer Transaktion. Hierher verschobene
  Stunden fallen an ihrem alten Platz aus; ohne Weiterschieben kehrt ihre Planung dorthin
  zurück (`zurueckZuege`). Teil-Ausfall einer Doppelstunde → nur „stundenweise“.
- **Dialoge mit Promise:** `UI.modal` ruft beim Schließen `onClose` auf. Wer in einem
  Knopf `close()` und dann `resolve(wert)` aufruft, bekommt das `resolve` aus `onClose`
  – also erst `resolve`, dann `close` (oder ein Merker wie in `abWocheDialog`).
- **Heatmap-Zeit:** Der Verfall läuft **nur innerhalb einer laufenden Stunde**
  (Bezugszeit `min(jetzt, stunde.endeTs)`). Beim Öffnen/Fortsetzen wird
  `heatLastDecayAt` auf jetzt gesetzt (kein Nachhol-Verfall aus der Pause), beim
  Beenden/Verlassen der aktuelle Wert festgeschrieben. Die **Pausetaste**
  (`tracker-heat-pause`, `trackerHeatPause`) schreibt beim Anhalten den Stand fest
  (`heatEinfrieren`), setzt `state.tracker.heatPause`; währenddessen rechnet
  `heatAktuell` ohne Verfall, Meldungen geben weiter Punkte. Fortsetzen zieht die Uhr
  nach (`heatUhrNachziehen`), `trackerVerlassen` hebt die Pause auf (nur flüchtig).
- **Tracker-Modi:** Abwesend / Verweigerung (🚫) / Keine HA / Heatmap liegen in der
  Topbar (`state.trackerModus`); ein aktiver Modus setzt eine `modus-*`-Klasse am
  `<body>` (Farbschema) und macht die ganze Kachel zum Tap-Ziel. `ViewTracker` baut
  `state.tracker` nur neu auf, wenn Klasse oder Stunde wechseln – sonst gingen beim
  Moduswechsel (`render()`) Zähler und Undo-Stack verloren. Der Undo-Stack wird beim
  Aufbau aus den Kachel-Ereignissen der Stunde gefüllt (gilt also auch nach dem
  Fortsetzen). Langes Drücken/Rechtsklick auf `#undo-btn` (`undoLangDruck` in
  views.tracker.js) öffnet `undoListeDialog` (ebenfalls views.tracker.js) zum gezielten Entfernen einzelner
  Einträge; danach wird der Klick unterdrückt, sonst landet er auf iOS in der Liste. Beide Sitzplan-Raster
  (Tracker und Reiter Sitzplan) baut `sitzrasterHTML` (views.core.js): Bis zur Einstellung
  `sitzplanKachelSpalten` (6–15, Standard 9) teilen sich die Kacheln die Breite, darüber
  bleiben sie so breit (Grid-Klasse `breit`) und `.seatgrid-scroll` scrollt seitlich.
  Die Grid-Klassen `kompakt` (≥7 sichtbare Spalten) / `mini` (≥9) staffeln die
  Tracker-Kacheln (styles.css). Raster: bis 12 Reihen, bis 15 Spalten.
- **Mehrere Sitzpläne je Klasse (Räume):** Store `sitzplaene` hält je Klasse **einen**
  Datensatz `{ klasseId, plaene: [{ id, name, rows, cols, seats }], aktivId }` (Schlüssel
  bleibt `klasseId`, deshalb kein `DB_VERSION`-Sprung). Zugriff nur über `Store.Sitzplan`:
  `alle(klasseId)`, `get(klasseId, planId?)` (Fallback: `aktivId`, dann erster Plan),
  `save(plan)`, `neu(klasseId, name, vorlage?)`, `setAktiv`, `remove` (der letzte Plan
  bleibt). Ältere Datensätze mit `seats` direkt am Datensatz wandelt
  `Store.sitzplaeneNormalisieren` zum Plan „Klassenraum“ – benutzt von Migration v14,
  Klassen-Import und beim Lesen (alte Backups). Die Stunde merkt sich ihren Plan in
  `stunde.sitzplanId` (Auswahl im Start-Dialog, Umschalter 🏫 `tracker-raum` im Tracker);
  der Wechsel ändert nur die Anordnung, `state.tracker` bleibt erhalten. Mitarbeit,
  Heatmap und Noten hängen an den Schüler/innen, nie am Plan.
- **Raumform und Sitzregeln:** **Vorne ist unten** (höchste `row`, Tafel unter dem Raster).
  `seat.keinPlatz = true` ist ein Gang: bleibt im Raster (Form), zählt nie als Platz,
  „Raster anwenden“ übernimmt ihn per Seat-ID. Die Sitzregeln liegen als `regeln` am
  `sitzplaene`-Datensatz der Klasse (`Store.Sitzplan.regeln` / `regelnSpeichern`) und
  gelten für alle Pläne; nur `typ: "platz"` hängt an `planId`/`seatId`. Typen und ihre
  Geometrie stehen in `calc.sitzplan.js` (`sitzplanLage`, `sitzplanRegelnPruefen`);
  „Automatisch belegen“ ruft `Calc.sitzplanVerteilen` (lokale Suche mit Abkühlen, drei
  Läufe; Kosten = 1000 je verletzter Regel + Reihenabstand zur Tafel, damit Leerplätze
  hinten bleiben). Kaskade: `Schueler.remove` entfernt Regeln der Person,
  `Sitzplan.remove` feste Plätze des Plans; `importKlasse` (Kopie) mappt `a`/`b` um.
  Kein Migrationsschritt nötig – fehlende Felder heißen „kein Gang“ bzw. „keine Regeln“.
- **Abwesenheiten** (Store `abwesenheiten`, Toggle pro Schüler/Tag): eingefrorene
  Heatmap, deaktivierte Ereignis-Buttons, und die Stunden dieses Tages fallen in
  `Calc.auswertungMitarbeit` aus den gezählten Stunden (bringen also weder Punkte
  noch eine Stundennote).
- **Doppelstunde = zwei Stundennoten:** Eine Stunde bringt
  `Math.max(1, Math.round(dauerMin / 45))` Einheiten in die Auswertung. Ihre
  Punkte werden durch die Einheiten geteilt (die Schwellen gelten je 45 Minuten),
  die daraus entstehende Note wird entsprechend oft gezählt – auch in
  `stundenGezaehlt`. Bewusst ohne Einstellung.
- **Mitarbeitsnote (Stundennoten-Modell):** `Calc.auswertungMitarbeit(ereignisse,
  settings, opts)` vergibt je **gehaltener Stunde mit Anwesenheit** eine
  Stundennote aus den Stundenpunkten via Schwellen (`Calc.punkteZuNote`);
  Stunden ohne Meldung zählen als 0 Punkte. Der Notenvorschlag ist der Ø der
  Stundennoten (1 NK). Die Schwellen bedeuten also „Punkte in einer Stunde →
  Stundennote" (nicht mehr „Ø-Punkte") und liegen deshalb seit 1.8.0 auf **ganzen
  Punkten** (ab 3 → 1 · ab 2 → 2 · ab 1 → 3 · ab 0 → 4 · ab −1 → 5 · darunter 6);
  mit den alten Zwischenwerten waren die Stufen 2 und 4 unerreichbar. Rückgabe u. a.
  `stundenNoten` (chronologisch, `{stundeId, datum, note, punkte, verweigerung}`),
  `verweigerungen`, `anzahl` (alle Ereignisse) und `meldungen` (nur die positiven
  Typen – das ist die Spalte „Meld." im Mitarbeit-Tab).
  Die Tabelle zeigt den Vorschlag als **gerundete Note** (`tendenznote`, exakter Ø
  im Tooltip und in der Herleitung) und daneben die Spalte **„Note"** mit der
  tatsächlich übertragenen Mitarbeitsnote des Quartals
  (`Views.mitarbeitNotenVonQuartal(klasse, quartal)` – dieselbe Quelle nutzt der
  Abschluss-Dialog zum Vorbelegen). Die Schwellen liefert `Calc.schwellenFuer(settings,
  klasse)`: `klasse.mitarbeitSchwellen` (klassenweise, optional) schlägt
  `settings.mitarbeitSchwellen`. Beide sind im UI editierbar.
- **Leistungsverweigerung:** Ereignistyp `verweigerung` (`aufKachel: false`),
  Erfassung über den Tracker-Modus 🚫 (Toggle mit Badge auf der Kachel,
  Typ-Buttons deaktiviert). Eine Stunde mit Verweigerung zählt als Stundennote
  6 und die Meldungspunkte der Stunde entfallen; die HA-Zählung
  (`keinehausaufgabe`) bleibt davon unberührt.
- **HA-Modus:** `settings.haModus` (`"punkte"` = Punkteabzug in der Mitarbeit,
  bisheriges Verhalten | `"note6"` = vergessene HA geben keine Punkte; je drei
  vergessener HA im Zeitraum hängt `Calc.auswertungMitarbeit` stattdessen eine
  zusätzliche Stundennote 6 an (`haNoten`), die den Notenvorschlag drückt und mit dem
  Quartalsabschluss in der Mitarbeitsnote landet). `Store.haNote6Pruefen` **schreibt
  nichts mehr**, es meldet dem Tracker nur die volle Dreiergruppe für den Toast –
  eine eigene Notenspalte darf dabei nicht entstehen. Select in den Einstellungen.
- **Quartal abschließen:** Button im Mitarbeit-Tab (nur bei konkretem Quartal),
  Dialog `quartalAbschliessenDialog` mit pro Schüler editierbaren
  Notenvorschlägen (vorbelegt mit dem auf eine Note gerundeten Ø, nicht mit dem rohen
  Dezimalwert – liegt für das Quartal schon eine übertragene Note vor, hat **diese**
  Vorrang) und Ziel-Kategorie (Default „Mündliche Mitarbeit", wird dabei auf
  `quelle: "mitarbeit"` gesetzt). CSV-Export der Noten (`CSV.exportQuartalNoten`)
  und Ereignisse (`CSV.exportEreignisse`) im Dialog.
- **Der Abschluss löscht nichts** (seit 1.8.0): Stunden und Ereignisse bleiben
  erhalten, stattdessen vermerkt `Store.quartalAbschliessen` das Quartal in
  `klasse.abgeschlosseneQuartale` (`[{ quartal, datum }]`). Helfer:
  `Store.abschlussVon(klasse, quartal)` / `Store.abschlussAufheben`. Wirkung:
  Der Mitarbeit-Tab zeigt das Quartal grau (`.table-wrap.gesperrt`) mit
  Hinweisleiste und Button „Abschluss aufheben"; `trackerStartDialog` verweigert
  den Start, wenn `settings.aktuellesQuartal` dieser Klasse abgeschlossen ist.
  Aufheben löscht die übertragene Note **nicht**.
- **Exporte:** Alle Exporte laufen über `CSV.speichern(dateiname, inhalt, mime)` –
  dreistufig: 1) Export-Ordner via File System Access API (Handle in IndexedDB unter
  einstellungen/key `"export"`, Card „Export-Ordner“ in den Einstellungen),
  2) Web Share API mit Dateien (iPad-Safari hat keinen Ordner-Picker → Teilen-Blatt
  „In Dateien sichern“), 3) klassischer Download als Fallback.
- **Klassen-Export/-Import:** `Store.exportKlasse` / `Store.importKlasse` (JSON einer
  einzelnen Klasse inkl. Schüler, Kategorien, Noten, Ereignisse, Stunden,
  Abwesenheiten, alle Sitzpläne). Import bei bestehender Klassen-ID im Modus „ersetzen“
  (kaskadierend löschen und importieren in einer Transaktion) oder „kopie“ (alle IDs neu vergeben,
  Referenzen inkl. `sitzplan.plaene[].seats[].schuelerId` ummappen). Buttons „Exportieren“
  in der Klassen-Topbar, „Klasse importieren“ auf Home (`klassenImportDialog`).
- **Klasse löschen:** 🗑-Button direkt auf der Home-Kachel (`delete-class`,
  Bestätigungsdialog, Kaskade via `Store.Klassen.remove`).
- **MSS-Punkte (Klassenstufe ab 11):** `klasse.klassenstufe` (5–13, `null` =
  Sek. I, im Klassen-Dialog wählbar) entscheidet über `Calc.istMSS(klasse)`,
  ob eine Klasse Schulnoten (1–6, niedriger = besser) oder MSS-Punkte
  (0–15, ganzzahlig, höher = besser) verwendet. Die betroffenen `Calc`-
  Funktionen (`parseNote`, `clampNote`, `noteFarbe`, `zeugnisnote`,
  `formatZeugnisnote`, `jahresnote`, `tendenznote`) nehmen dafür einen
  optionalen `mss`-Parameter (Default `false`); Aufrufer reichen ihn aus dem
  `klasse`-Objekt durch. `formatNote`/`berechneSchueler` bleiben
  skalenunabhängig (reine Mittelwertbildung). Der Mitarbeits-Tracker
  (Stundennoten-Modell, Notenschwellen) bleibt bewusst unverändert auf der
  1–6-Skala – er ist eine interne Vorschlags-Heuristik, keine gespeicherte
  Note. Für die Anzeige und die Vorbelegung beim „Quartal abschließen" wird der
  gerundete Vorschlag über die **offizielle Umrechnungstabelle** in Punkte
  gebracht: `Calc.noteZuMssPunkte(note)` = `17 − Note × 3`, gerundet und auf
  0–15 begrenzt (1+ 15 · 1 14 · 1- 13 · 2+ 12 · 2 11 · … · 5- 1 · 6 0). Weil die
  Notenskala der App bei 1,0 beginnt, ist 14 der höchste automatisch erreichbare
  Wert; die 15 (= 1+) trägt die Lehrkraft von Hand ein. Gespeichert wird immer
  der Wert der Klassenskala – die Umrechnung passiert nur an dieser Stelle.
  **Keine Jahresnote:** In MSS-Klassen ist jedes Kurshalbjahr eine eigene
  Endnote – die Spalte „Zeugnisnote Jahr" entfällt dort, und die
  Halbjahres-Reiter heißen nach der Klassenstufe („12.1 · 12.2").

## 7. Testen & Verifizieren

- **Selbsttest `tests.html`** (per Doppelklick, ohne Framework): prüft die
  Rechenregeln aus Abschnitt 6 und die Beispiele aus `Dev/Schuljahr-Schema.md` mit
  festen Werten, dazu Hilfsfunktionen aus Store und CSV. Er liest und schreibt
  **keine** Nutzerdaten. Nach jeder Änderung an `calc*.js`, `store*.js` oder
  `csv.js` ausführen – alle Prüfungen müssen grün sein. Ein geänderter Sollwert
  bedeutet eine geänderte Note und braucht Rücksprache. Neue Rechenregeln
  bekommen einen eigenen Fall in `tests/test.calc.js`; neue JS-Dateien, die die
  Tests brauchen, auch in `tests.html` eintragen. Die Testseite gehört nicht in
  den Service-Worker-Cache.
- Einen Linter gibt es nicht. Die Oberfläche wird manuell im Browser geprüft:
  - `index.html` doppelklicken (Demo-Daten werden beim ersten Start angelegt), oder
  - lokal servern: `npx serve .` bzw. `python -m http.server` (für PWA/SW nötig).
- Nach einer Änderung den betroffenen Flow wirklich durchklicken (z. B. Sitzplan:
  Schüler zuweisen, verschieben, Platz freimachen).
- Syntax-Fehler zeigen sich sofort in der Browser-Konsole – vor Übergabe prüfen,
  dass keine Fehler beim Laden auftreten.

## 8. Kommunikation & Konventionen im Repo

### Erst planen, dann bauen

Beginne **jede** Aufgabe im **Plan-Modus** (`Umschalt`+`Tab`) – notfalls
schlicht: erst nur lesen und antworten, noch nichts schreiben. Ablauf:

1. Die betroffenen Stellen im Code lesen und offene Punkte klären (siehe unten).
2. Den Plan **kurz und verständlich** vorlegen: Was ändert sich in der App? Welche
   Dateien werden angefasst? Was passiert mit vorhandenen Daten? In welcher
   Reihenfolge gehst du vor? Wo bist du unsicher?
3. **Auf ausdrückliche Zustimmung warten.** Erst danach Dateien ändern.

Einzige Ausnahme: winzige, offensichtliche Korrekturen (z. B. Tippfehler in
einem UI-Text). Im Zweifel trotzdem lieber vorher fragen.

### Fragen statt Annahmen

Die Person, für die du hier arbeitest, ist **IT-ler** (kein Beamter/keine
Lehrkraft) und entwickelt die App für Lehrkräfte; den Schulalltag kennt die
Person aus zweiter Hand über die Partnerin, die Lehrkraft ist. Technische Begriffe und
Code-Details sind in Ordnung – bei **fachlichen Schulfragen** (Notenregeln,
Abläufe im Unterricht) aber nicht raten, sondern fragen. Daraus folgt für jede
Aufgabe:

- **Im Zweifel fragen, nicht raten.** Sobald ein Auftrag mehrdeutig ist, mehrere
  Umsetzungen plausibel sind oder du eine fachliche Annahme treffen müsstest
  (welche Kategorie? welches Quartal? was passiert mit vorhandenen Daten?):
  erst fragen, dann bauen. Eine Rückfrage kostet Minuten, eine falsche Annahme
  im Zweifel einen Notenbestand.
- **Konkret fragen** – in kleinen Häppchen, mit Auswahlmöglichkeiten („A oder B?“)
  statt offener Fragen, und jeweils mit einem Satz dazu, was der Unterschied im
  Schulalltag praktisch bedeutet.
- **Erst die Wirkung, dann der Code.** Änderungen zuerst aus Sicht der App
  beschreiben (was ändert sich auf dem Bildschirm, wo klickt man, was passiert
  mit bisherigen Daten), danach die betroffenen Dateien/Funktionen. Alles, was
  in UI-Texten oder `info.html` landet, bleibt für Lehrkräfte ohne Fachjargon.
- **Vor größeren Umbauten oder Löschungen** kurz das Vorhaben beschreiben und
  Zustimmung abwarten.
- **Verifikation als Klickpfad** angeben („Klasse 8b öffnen → Reiter Mitarbeit →
  …“) und auf ein nötiges Neuladen der App hinweisen (Service-Worker-Cache,
  Abschnitt 5).
- **Ehrlich berichten**, was du geprüft hast und was nicht – lieber ein klarer
  Hinweis als ein zu optimistisches „fertig“.

### Sprache & Dokumentation

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
- Änderungen an `calc*.js` können weitreichende Folgen haben (Gesamtnote!) –
  `tests.html` ausführen und Schüler-Detail / Besprechungsmodus gegenprüfen.
- **Note ohne Spalte angelegt:** Noten ohne `leistungId` tauchen in der Notenübersicht
  nicht auf. Immer über `Store.Noten.setzeZelle` bzw. `Store.leistungFuer` gehen.
- **Quartal-Tagging vergessen:** Neue Datensätze (Ereignisse, Stunden) müssen `quartal`
  bekommen – über die Factorys (`neuesEreignis`, `neueStunde`) bzw. aus
  `settings.aktuellesQuartal`; bei Noten liefert es die Leistung. Ohne `quartal` landen sie
  in jeder Quartals-Filterung (Kompatibilitäts-Regel) und verfälschen alle
  Quartale. `halbjahr` wird nur noch abgeleitet mitgeschrieben.
- **Schwellen-Bedeutung geändert:** `mitarbeitSchwellen` gelten seit dem
  Stundennoten-Modell **pro Stunde** (Punkte in einer Stunde → Stundennote),
  nicht mehr auf den Punkte-Ø. Seit 1.8.0 liegen die Stufen deshalb auf ganzen
  Punkten; Bestände mit der alten Voreinstellung wurden migriert, eigene
  Schwellen (global oder je Klasse) blieben unangetastet.
- **Einstellungen in Migrationsschritten:** `getSettings()` liefert jedes Mal
  eine frische Kopie (Merge mit `DEFAULT_SETTINGS`). Ein Schritt muss daher
  selbst laden **und** speichern; `migrateSchema` liest nach den Schritten neu,
  sonst überschreibt es deren Änderungen.
- **Neue Einstellung anlegen:** 1) Standardwert in `DEFAULT_SETTINGS`
  (`store.einstellungen.js`) – über den `getSettings`-Merge bekommen ihn auch
  vorhandene Installationen, eine Migration ist dafür nicht nötig. 2) Regel im
  Bauplan `EINSTELLUNGEN` (`views.einstellungen.js`: `art` zahl/auswahl, `min`,
  `max`, `ersatz`, `werte`, `meldung`, `danach`). 3) Feld mit
  `einstellungFeld(...)` bzw. `zahlZeile(...)` in eine Karte setzen. Speichern,
  Prüfen und Rückmeldung übernimmt dann der gemeinsame Handler – keine eigenen
  Listener je Feld. Zusammengesetzte Werte (Schwellen, Stundenzeiten) behalten
  eigene Handler. Die Einstellung in README (Datenmodell) und ggf. info.html nennen.
- **Fehler nicht verschlucken:** Aktionen aus der Action-Map und unbehandelte
  Promise-Fehler landen über `UI.fehlerMelden` als Toast (plus Konsole). Eigene
  `try/catch` nur, wo ein Fehler fachlich erwartet wird (z. B. Abbruch im
  Teilen-Blatt), und dann mit verständlicher Meldung.
- **Beispieldaten:** `Store.seedDemoData` (Klasse „8b (Demo)“) läuft nur bei leerer
  Datenbank beim App-Start. `Store.seedBeispielklassen` („9a (Beispiel)“ +
  „Mathematik LK 12 (Beispiel)“) legt zusätzlich an, auch wenn schon Klassen da
  sind, und überspringt gleichnamige Klassen (Vergleich ohne Groß-/Kleinschreibung
  und Rand-Leerzeichen); Rückgabe `{ angelegt, uebersprungen }` – Knopf in den
  Einstellungen. Der Zusatz „(Beispiel)“ verhindert Verwechslungen mit echten Klassen.
