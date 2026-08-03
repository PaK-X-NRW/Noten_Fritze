# Noten-Fritze

Lokale Noten- und Mitarbeitsverwaltung für Lehrkräfte an Gymnasien.
**100 % lokal** im Browser (IndexedDB), **keine Cloud, kein Server, kein Login.**
Tablet-first, optimiert für das **iPad im Querformat**, offline nutzbar als PWA.

---

## Verfügbarkeit & Hosting

**Die App ist online verfügbar unter:**
- **http://noten-fritze.patrick-knapp.de** (Domain-Redirect)
- Gehostet auf GitHub Pages: https://pak-x-nrw.github.io/Noten_Fritze/

**Wichtig:** Alle Daten bleiben auf Ihrem Gerät! Die App speichert nichts in der Cloud. 
Sie können die App als PWA installieren („Zum Home-Bildschirm hinzufügen") und nutzen sie offline.

---

## 1. Architektur & Begründung

**Vanilla JS + IndexedDB, ohne Build-Schritt, ohne Abhängigkeiten.**

- **Warum kein Framework?** Die App ist im Kern eine formular- und tabellenlastige
  Datenverwaltung mit klar abgegrenzten Screens. Das lässt sich mit einer schlanken,
  zustandsgesteuerten Render-Schleife (~1 Datei) robust abbilden. Kein Framework
  bedeutet: keine Toolchain, keine Versions-Updates, **läuft in 10 Jahren noch**,
  öffnet sich per Doppelklick. Genau das passt zur Anforderung „einfache, langlebige
  Technologie“.
- **Klassische `<script>`-Tags statt ES-Module**, damit die App auch direkt per
  `file://` (Doppelklick auf `index.html`) läuft – ES-Module würden dort an CORS
  scheitern. Modularität entsteht über getrennte Dateien und Namespaces
  (`DB`, `Store`, `Calc`, `CSV`, `UI`, `Views`).
- **Datenhaltung:** IndexedDB für alle Nutzdaten (asynchron, große Mengen,
  strukturierte Objekte). LocalStorage wird bewusst **nicht** für Nutzdaten benutzt.
- **Schichten:**
  - `version.js` – App-Version (`MAJOR.MINOR.PATCH`, eine Stelle für alles)
  - `db.js` – generischer IndexedDB-Wrapper (Promises, Schema-Versionierung)
  - `store.js` – Domänenmodell, Repositories, Defaults, Demo-Daten
  - `calc.js` – reine Rechenlogik (Noten, Mitarbeit, Farben) – frei von DOM/DB
  - `csv.js` – CSV-Export/Import
  - `ui.js` – UI-Bausteine (Modal, Toast, Formfelder)
  - `views.core.js` – Views-Kern (State, Routing, Render-Schleife)
  - `views.home-klasse.js` – Home + Klassenansicht mit Tabs
  - `views.tracker.js` – Mitarbeits-Tracker
  - `views.besprechung.js` – Besprechungsmodus
  - `views.einstellungen.js` – Einstellungen inkl. Stundenplan
  - `views.dialoge.js` – modale Dialoge
  - `views.js` – Aktions-Dispatcher (Action-Map, Delegation)
  - `app.js` – Bootstrap
- **PWA:** `manifest.webmanifest` + `service-worker.js` (App-Shell-Cache) für
  Offline-Betrieb und „Zum Home-Bildschirm hinzufügen“. Der Service Worker aktiviert
  sich nur beim Hosting über http(s), nicht unter `file://`.

## 2. Tech-Stack

| Bereich        | Wahl                     | Begründung |
|----------------|--------------------------|------------|
| Sprache        | HTML/CSS/Vanilla JS      | langlebig, keine Toolchain |
| Speicher       | IndexedDB                | lokal, asynchron, strukturiert |
| UI-Einstellung | (LocalStorage frei)      | nur für Kleinkram vorgesehen |
| Offline        | Service Worker + Manifest| PWA-Grundlagen ohne Ballast |
| Build          | **keiner**               | statische Dateien, sofort lauffähig |

## 3. Datenmodell (IndexedDB-Stores)

```
klassen        { id, name, schuljahr, fach, typ('hauptfach'|'nebenfach'),
                 klassenstufe(5..13, null=Sek.I), anteilSchriftlich, anteilSonstige,
                 mitarbeitSchwellen(null=global),
                 notizen, createdAt, updatedAt, lastOpenedAt }
schueler       { id, klasseId, vorname, nachname, bemerkung, sortIndex, ... }
                 (sortIndex = manuelle Reihenfolge; angezeigt wird je nach
                  settings.schuelerSortierung alphabetisch oder manuell)
kategorien     { id, klasseId, name, art('schriftlich'|'sonstige'),
                 gewichtung, anzeige('note'|'fehlendeHA'), sortIndex }
noten          { id, klasseId, schuelerId, kategorieId, wert(1..6, oder 0..15
                 MSS-Punkte bei Klassenstufe >= 11, s. Calc.istMSS),
                 titel, datum(YYYY-MM-DD), quartal(1..4), halbjahr(1|2, abgeleitet),
                 createdAt }
sitzplaene     { klasseId, rows, cols, seats:[{id,row,col,schuelerId}] }
ereignisse     { id, klasseId, schuelerId, stundeId, typ, punkte, timestamp,
                 quartal(1..4), halbjahr(1|2, abgeleitet), notiz }
stunden        { id, klasseId, datum(YYYY-MM-DD), startTs, endeTs, dauerMin, stundeNr,
                 quelle('plan'|'fallback'|'manuell'|'migriert'), quartal(1..4),
                 halbjahr(1|2, abgeleitet),
                 status('offen'|'beendet'), beendetAt, createdAt, updatedAt }
abwesenheiten  { id(schuelerId_datum), klasseId, schuelerId, datum(YYYY-MM-DD), createdAt }
einstellungen  { key:'app', schemaVersion, aktuellesQuartal(1..4), haModus('punkte'|'note6'),
                 stundenplan, rundung, schuelerSortierung('nachname'|'manuell'),
                 mitarbeitPunkte, mitarbeitSchwellen,
                 heatPunkteEinfach, heatPunkteGut, heatPunkteSehrGut,
                 heatStartWert, heatVerfallPunkte, heatVerfallMinuten, anteile }
                 (key:'export' = Handle des Export-Ordners, File System Access API)
```

- **Integrität:** Löschen einer Klasse/eines Schülers löscht kaskadierend alle
  abhängigen Datensätze (Noten, Ereignisse, Stunden, Abwesenheiten, Sitzplatz-Zuweisung).
- **App-Version:** `APP_VERSION` in `js/version.js` (Schema `MAJOR.MINOR.PATCH`,
  aktuell **1.6.0**) ist die sichtbare Programmversion: angezeigt unter
  Einstellungen → Über, Name des Service-Worker-Caches, Feld `appVersion` im
  JSON-Backup. Sie wird von Hand gepflegt und ist unabhängig von den beiden
  internen Zählern unten.
- **Versionierbarkeit der Daten (zweistufig):** `DB_VERSION` + `onupgradeneeded` in `db.js`
  versioniert die **Struktur** (Stores/Indizes, additiv). Zusätzlich versioniert
  `schemaVersion` im einstellungen-Store die **Datenform**: eine kaskadierte
  Migrations-Pipeline in `store.js` (`MIGRATION_STEPS`, Schlüssel = Ziel-Version)
  transformiert Datensätze beim App-Start Schritt für Schritt (v1→v2→v3 …).
  Neue Felder bekommen immer Defaults, damit alte Datensätze nicht crashen.
  Zusätzlich JSON-Voll-Backup als Sicherung.

## 4. Rechenlogik – gewichtete Gesamtnote

Zwei-Ebenen-Gewichtung (passend zur Hauptfach/Nebenfach-Unterscheidung):

1. **Kategorie-Ø:** Durchschnitt der Einzelnoten je Kategorie (leere ignoriert).
2. **Gruppen-Ø:** je Art-Gruppe („schriftlich“, „sonstige“) gewichteter Mittelwert
   der Kategorie-Durchschnitte über deren `gewichtung`.
3. **Gesamtnote:** `anteilSchriftlich %` · Ø_schriftlich + `anteilSonstige %` · Ø_sonstige.

**Robustheit:** Fehlt eine ganze Gruppe (keine Noten), zählt die vorhandene Gruppe
zu 100 %. Kategorien ohne Noten fallen aus der Gewichtung heraus, statt als „0“ zu
verfälschen. Fehlt alles, ist die Gesamtnote „–“.

**Standard-Anteile:** Hauptfach 50 % schriftlich / 50 % sonstige, Nebenfach 30 % / 70 %
(pro Klasse über „Anteile ändern“ anpassbar).

**Rundung** (Einstellung): eine Nachkommastelle (Standard), zwei Nachkommastellen
oder ganze Note. Noteneingabe akzeptiert `2`, `2,3`, `2.3`, `2+` (→ 1,7), `2-` (→ 2,3).
Die Aufschlüsselung ist im **Besprechungsmodus** und im Schüler-Detail transparent
sichtbar (Kategorie-Ø, Gewichte, Gruppen-Ø, Gesamt, Zeugnisnote).

### Zeugnisskala

Für das Zeugnis gibt es nur ganze Noten plus die einzige zulässige Tendenz **4-** (= 4,3):

| Rechenwert | ≤ 1,5 | ≤ 2,5 | ≤ 3,5 | < 4,15 | ≤ 4,5 | ≤ 5,5 | > 5,5 |
|---|---|---|---|---|---|---|---|
| Note | 1 | 2 | 3 | 4 | **4-** | 5 | 6 |

Genau auf einer Grenze gewinnt die bessere Note (4,5 ist also noch 4-). Die **Zeugnisnote**
entsteht aus den beiden bereits gerundeten Teilnoten (schriftlich/sonstige); landet dieses
Ergebnis exakt auf einer Grenze, entscheiden die ungerundeten Werte. Die **Jahresnote**
bildet sich aus den beiden Halbjahres-Zeugnisnoten zu je 50 %, bei Gleichstand gibt das
2. Halbjahr den Ausschlag; solange nur ein Halbjahr Noten hat, bleibt sie leer.

### MSS-Punkte (Klassenstufe ab 11)

Klassen lassen sich im Klassen-Dialog auf eine **Klassenstufe** (5–13) festlegen.
Ab Klassenstufe 11 (gymnasiale Oberstufe / MSS) rechnet und zeigt die App
konsequent in **MSS-Punkten** (0–15, ganzzahlig, höher = besser) statt in
Schulnoten (1–6, niedriger = besser) – Noteneingabe, Farb-Badges, Gesamt- und
Zeugnispunkte sowie die CSV-Exporte. `Calc.istMSS(klasse)` entscheidet die
Skala; ohne Klassenstufe (bzw. < 11) bleibt alles beim gewohnten 1–6-Verhalten
inkl. der 4- -Tendenz.

Bewusst **ausgenommen** bleibt der Mitarbeits-Tracker: Das Stundennoten-Modell
und die Notenschwellen (Abschnitt 5) rechnen intern weiterhin auf der
1–6-Skala, da sie nur eine Vorschlags-Heuristik sind. Beim „Quartal
abschließen" trägt die Lehrkraft den tatsächlichen MSS-Punktwert für
Kursklassen deshalb selbst ein; der 1–6-Ø der Stundennoten dient dort nur noch
als Orientierung, ohne automatische Umrechnung.

**Quartale:** Jede Note (und jedes Mitarbeits-Ereignis, jede Stunde) gehört zu einem
der vier Quartale (1. Q: Aug–Okt, 2. Q: Nov–Jan, 3. Q: Feb–Apr, 4. Q: Mai–Jul) –
beim Anlegen aus der Einstellung „Aktuelles Quartal“ übernommen. Noten-Tab,
Besprechungsmodus und Mitarbeits-Auswertung können je Quartal oder fürs ganze Jahr
rechnen (Filter „1. Q · 2. Q · 3. Q · 4. Q · Jahr“). Bei Halbjahres- und
Jahres-Sicht werden die **sonstigen Leistungen quartalsweise** gemittelt (1. HJ =
Ø aus 1. Q und 2. Q zu je 50 %, fehlende Quartale zählen dann zu 100 %); die
schriftlichen Leistungen laufen unverändert über den ganzen Zeitraum. Die
Jahres-Ansicht der Notenübersicht zeigt die Quartals-Ergebnisse als eigene Spalten
„Sonstige 1. Q–4. Q“.

## 5. Mitarbeits-Tracker & Punktesystem

- **Ereignistypen** (Standardpunkte, konfigurierbar in den Einstellungen):

  | Typ                 | Punkte |
  |---------------------|:------:|
  | Wortmeldung         |  +1    |
  | Gute Meldung        |  +2    |
  | Sehr gute Meldung   |  +3    |
  | Störung             |  −2    |
  | Fehlende HA         |  −1    |
  | Leistungsverweigerung | – (Stundennote 6, s. unten) |

- **Unterrichtsstunde als Einheit:** Der Tracker erfasst immer *in* einer Stunde.
  Beim Start wird eine Stunde angelegt (Datum, Klasse, Start/Ende, Stundennummer);
  wurde der Tracker unterbrochen, bietet der Start-Dialog **„Stunde fortsetzen“**
  für die offene Stunde des heutigen Tages an. „Stunde beenden“ schließt sie
  endgültig ab. Alle Ereignisse hängen über `stundeId` an ihrer Stunde.
- **Erfassung:** Jede Schüler-Kachel trägt die 4 Ereignis-Buttons (Wortmeldung,
  Gute/Sehr gute Meldung, Störung) direkt in sich – als Piktogramme
  (★ / ★★ / ★★★ / ⚡), farbcodiert, mit Zähler je Typ **für die laufende Stunde**;
  eine Legende oben erklärt Icon + Bedeutung + Punkte. Ein Tap erzeugt sofort das
  Ereignis. **Undo** über Toast oder Button. Bei breiten Sitzplänen schalten die
  Kacheln automatisch auf kompaktere Darstellung (ab 7 bzw. 9 Spalten), damit
  alles auf den Schirm passt.
- **Modi in der Topbar:** Abwesend (🤒), Leistungsverweigerung (🚫), Keine HA (📕)
  und Heatmap (⚙️) sind keine Kachel-Buttons mehr, sondern Modi. Ein aktiver Modus
  **färbt Topbar und Seite um** und blendet ein Hinweisbanner ein; danach ist die
  ganze Kachel das Tap-Ziel: Abwesenheit umschalten, Verweigerung für diese Stunde
  vermerken (Badge auf der Kachel, Ereignis-Buttons deaktiviert), „keine HA“ für
  diese Stunde vermerken (erneutes Tippen entfernt den Vermerk) oder den
  Heatmap-Wert per Slider setzen. Beendet wird ein
  Modus über „Fertig“, den Topbar-Button oder `Esc`.
- **Stundenplan & Stundendauer:** In den Einstellungen liegt ein Stundenplan aus
  10 Stunden (Start/Ende je Stunde), der für jeden Schultag gleich gilt. Beim
  Tracker-Start wird nach **Einzel- oder Doppelstunde** gefragt; daraus und aus dem
  Stundenplan zeigt die Topbar die **Restzeit** der laufenden Stunde. Der
  Heatmap-Verfall (Y Punkte pro X Minuten, bezogen auf eine 45-Min-Stunde) skaliert
  auf die tatsächliche Stundendauer.
- **Abwesenheit:** Schüler/innen lassen sich für den Tag als krank/abwesend markieren
  (Abwesend-Modus im Tracker, Toggle im Sitzplan, rückgängig machbar). Abwesende:
  Kachel ausgegraut, Ereignis-Buttons deaktiviert, Heatmap-Wert eingefroren, und der
  Tag fließt nicht in die Epochalnoten-Auswertung ein.
- **Heatmap:** Farbe je Platz fließend grün→rot, aber **unabhängig** von den
  Mitarbeitspunkten. Dafür läuft ein eigenes Heatmap-Punktesystem pro Schüler/in:
  Wortmeldung / Gute / Sehr gute Meldung bringen jeweils frei einstellbare Punkte;
  zusätzlich lässt sich einstellen, wie viele Heatmap-Punkte pro X Minuten verfallen.
  Der Verfall läuft **nur innerhalb einer laufenden Stunde** – zwischen den Stunden
  ist der Wert eingefroren und läuft in der nächsten Stunde einfach weiter.
  Der Wertebereich liegt immer bei 0 bis 100. Negative Meldungen wie Störung oder
  fehlende HA beeinflussen die Heatmap nicht.
- **Mitarbeitsnote / Epochalnote (Vorschlag, Stundennoten-Modell):** Jede
  **gehaltene Stunde, in der der/die Schüler/in anwesend war**, bekommt aus ihren
  Punkten eine eigene Stundennote 1–6 (über konfigurierbare Schwellen). Stunden
  ohne jede Meldung zählen mit 0 Punkten – Schweigen wird also sichtbar. Der
  Vorschlag ist der **Ø der Stundennoten** (eine Nachkommastelle). Eine Stunde mit
  Leistungsverweigerung zählt als glatte 6, die Meldungspunkte dieser Stunde
  entfallen. Bewusst als **Vorschlag** markiert (Mitarbeit-Tab, pro Zeitraum:
  Gesamt / 30 Tage / 7 Tage, je Quartal oder fürs Jahr filterbar); ein Tap auf den
  Vorschlag zeigt die Verteilung der Stundennoten und die komplette Herleitung.
- **Notenschwellen:** global in den Einstellungen editierbar (Note 1–5 ab X Punkten
  **in einer Stunde**, darunter 6) und **pro Klasse überschreibbar** (Klasse →
  Mitarbeit → „Schwellen“), weil z. B. eine Biologiestunde andere Mitarbeit
  ermöglicht als eine Deutschstunde.
- **Vergessene Hausaufgaben (HA-Modus):** In den Einstellungen wählbar –
  „Punkteabzug in der Mitarbeit“ (−1 Punkt, Voreinstellung) oder „Ab der 3. je eine
  Note 6“: Dann geben vergessene HA keine Punkte, und bei jeder 3. vergessenen HA
  eines Quartals legt die App automatisch eine Note 6 in der Kategorie „Mündliche
  Mitarbeit“ an (wird bei Bedarf erzeugt).
- **Quartal abschließen:** Im Mitarbeit-Tab (bei gewähltem Quartal) überträgt ein
  Dialog die Notenvorschläge als richtige Noten – pro Schüler/in editierbar, in eine
  wählbare Ziel-Kategorie (Voreinstellung „Mündliche Mitarbeit“). Vorher lassen sich
  die Noten und die Roh-Ereignisse als CSV sichern; danach werden die Ereignisse und
  Stunden des Quartals gelöscht und die Zählung startet bei 0.

## 6. CSV-Schema

Format: UTF-8 **mit BOM** (Umlaute in Numbers/Excel korrekt), Trennzeichen `,`,
robustes Quoting (`"` verdoppelt). Der Import erkennt `,` **und** `;` automatisch.

- **Schülerliste** (`schueler_<Klasse>.csv`): `Vorname, Nachname, Bemerkung`
- **Noten (breit)** (`noten_<Klasse>.csv`): `Vorname, Nachname, <Kategorie> (Ø)…, Sonstige 1. Q…4. Q, Schriftlich, Sonstige, Gesamtnote, Zeugnisnote`
- **Einzelnoten (lang)** (`einzelnoten_<Klasse>.csv`): `Vorname, Nachname, Kategorie, Art, Titel, Note, Datum, Quartal`
- **Mitarbeit** (`mitarbeit_<Klasse>.csv`): `Vorname, Nachname, Ereignistyp, Punkte, Zeitpunkt`
- **Quartalsabschluss** (`mitarbeit_q<N>_<Klasse>.csv`): `Vorname, Nachname, Note, Quartal` – die übertragenen Mitarbeitsnoten beim „Quartal abschließen“.
- **MSS-Klassen** (Klassenstufe ≥ 11): Die Spalten „Note“/„Zeugnisnote“ heißen in
  den obigen Exporten „Punkte“/„Zeugnispunkte“ und enthalten 0–15-Punktwerte
  statt Schulnoten (s. Abschnitt 4, „MSS-Punkte“).
- **Export-Ziel:** Alle Exporte laufen über denselben Speicherweg: 1) einmal
  gewählter **Export-Ordner** (Einstellungen → „Export-Ordner“, Chrome/Edge am
  Desktop) – danach landen alle Dateien direkt dort; 2) auf dem iPad das
  **Teilen-Blatt** („In Dateien sichern“ erlaubt dort die Ordnerwahl – iPad-Safari
  hat keinen eigenen Ordner-Picker); 3) sonst klassischer Download.
- **Import:** Schülerlisten per CSV-Datei **oder** eingefügter Namensliste
  („Nachname, Vorname“ bzw. „Vorname Nachname“).
- **Klassen-Export/-Import:** Eine einzelne Klasse komplett als JSON exportieren
  (Button „Exportieren“ in der Klassen-Ansicht, z. B. zur Übergabe an Kolleg/innen)
  und auf dem Startbildschirm wieder importieren („Klasse importieren“) – bei
  bereits vorhandener Klasse wahlweise **ersetzen** oder **als Kopie** anlegen.
- **Voll-Backup:** JSON über alle Stores (Einstellungen inkl.), Import mit optionalem
  „vorher alles löschen“.

## 7. UI-Struktur & Screens

- **Home** – Klassenübersicht als Karten, sortiert nach zuletzt geöffnet; lange nicht
  geöffnete Klassen mit rotem Punkt + Hinweis. „＋ Klasse“, „Klasse importieren“,
  Einstellungen. Jede Karte trägt oben rechts einen 🗑-Button zum direkten Löschen
  der Klasse (mit Bestätigung, inkl. aller Noten/Ereignisse/Stunden).
- **Klasse** – Tabs: *Schüler/innen · Noten · Kategorien · Sitzplan · Mitarbeit*.
  Oben schnell erreichbar: **Tracker**, **Besprechung**, **Exportieren** (Klasse als
  JSON), Bearbeiten. Im Bearbeiten-Dialog legt die **Klassenstufe** (5–13) fest,
  ob ab Stufe 11 mit MSS-Punkten (0–15) statt Schulnoten gerechnet wird.
  Die Reihenfolge der Schüler/innen ist in den Einstellungen umschaltbar
  (alphabetisch nach Nachname – Voreinstellung – oder manuell per ▲/▼); sie gilt
  für alle Ansichten und Exporte.
- **Noten** – Quartal-Ansicht: Matrix Schüler × Kategorie (schriftliche zuerst) mit
  farbigen Ø-Badges, dahinter je eine gerundete Sammelspalte **Schriftlich** und
  **Sonstige** sowie **Gesamt** und **Zeugnis**. Die drei Spaltengruppen (schriftlich ·
  sonstige · Zeugnis) sind farbig hinterlegt, die Namensspalte bleibt beim
  horizontalen Scrollen stehen. Spaltenköpfe lassen sich seitlich ziehen, um die
  Spalten umzusortieren (Farbe bleibt an der Spalte); rechts gibt es genug
  Scroll-Spielraum, um auch die letzten Spalten direkt neben die Namen zu holen.
  Die Reihenfolge gilt nur für die laufende Sitzung – nach dem Neuladen steht wieder
  der Default. Zelle antippen → Einzelnoten erfassen;
  Namen antippen → Berechnung. Jahres-Ansicht: keine Einzelleistungen, sondern zuerst
  die Quartals-Spalten **Sonstige 1. Q–4. Q**, danach beide Halbjahre nebeneinander
  (schriftlich · sonstige · Zeugnis je HJ) plus Jahres-Zeugnisnote.
  Kategorien mit Anzeige „vergessene Hausaufgaben“ zeigen dort statt einer Note die Anzahl
  aus dem Tracker und zählen nicht in die Gesamtnote.
- **Sitzplan** – Raster (Reihen/Spalten frei), Plätze antippen zum Zuweisen,
  „Automatisch belegen“, Abwesenheits-Toggle (🤒) je Platz.
- **Tracker** – Start-Dialog (Stunde fortsetzen / Einzel- / Doppelstunde), Restzeit
  und Modi (Abwesend · Verweigerung · Keine HA · Heatmap) in der Topbar, Kacheln je
  Schüler/in mit 4 direkten Ereignis-Buttons als Piktogramme (★/★★/★★★/⚡ =
  Wortmeldung, Gute/Sehr gute Meldung, Störung), Zähler je Typ für die Stunde,
  Undo, Heatmap-Hintergrund + Legende, kompakte Kacheln bei breiten Plänen.
- **Besprechungsmodus** – ein/e Schüler/in einzeln, groß; nur deren Daten sichtbar
  (Datenschutz bei der Notenbesprechung), Vor/Zurück, Quartal-Filter.
- **Einstellungen** – Rundung, aktuelles Quartal, Reihenfolge der Schüler/innen,
  Wertung vergessener Hausaufgaben (HA-Modus),
  Stundenplan (10 Stunden,
  täglich gleich), Mitarbeitspunkte, Notenschwellen, Heatmap-Punktverfall,
  Export-Ordner, Backup/Restore, Demo-Daten, alles löschen.

## 8. MVP-Funktionsumfang

**Enthalten (funktionsfähig):**
Klassen/Schüler/Kategorien CRUD · Einzelnoten & gewichtete Gesamtnote ·
Quartale (1.–4. Q + Jahr) für Noten & Mitarbeit, sonstige Leistungen quartalsweise
gemittelt · Sitzplan-Editor ·
Tracker mit Stunden (anlegen/fortsetzen/beenden), Stundenplan/Restzeit
(Einzel-/Doppelstunde), Piktogramm-Buttons, Tap/Undo/Heatmap, kompakte Kacheln,
Modi für Abwesend/Leistungsverweigerung/Keine HA/Heatmap ·
Abwesenheiten (tageweise, beeinflusst Heatmap & Mitarbeitsnote) ·
Mitarbeits-Auswertung nach dem Stundennoten-Modell + Notenvorschlag mit sichtbarer
Herleitung · Quartal abschließen (Übertrag als Noten, CSV-Sicherung) ·
HA-Modus wählbar (Punkteabzug oder Note 6 ab der 3.) ·
Notenschwellen global und je Klasse editierbar · Besprechungsmodus ·
MSS-Punkte-Skala (0–15) für Klassenstufe ab 11, umschaltbar je Klasse ·
CSV-Export (5 Arten) mit Export-Ordner/Teilen-Blatt · CSV-Import Schüler ·
Klassen-Export/-Import (ersetzen/als Kopie) · Klasse löschen direkt auf der
Home-Kachel · JSON-Voll-Backup · PWA/Offline · Demo-Daten.

**Bewusst später (klar als Ausbau markiert):**
Drag&Drop-Sortierung (aktuell ▲▼-Buttons) · Noten-CSV-**Import** (nur Export + Schüler-Import) ·
mehrere Sitzpläne/Perioden je Klasse · Verwaltungsansicht für vergangene Stunden
(nachträglich korrigieren/löschen) · Abwesenheiten je Stunde statt je Tag ·
echte PNG-App-Icons (aktuell SVG) · Mehrbenutzer/Sync (nicht vorgesehen, da lokal).

## 9. Dateistruktur

```
Noten_Fritze/
├─ index.html               App-Shell
├─ manifest.webmanifest     PWA-Manifest
├─ service-worker.js        Offline-Cache
├─ css/styles.css           Styles (iPad-first)
├─ icons/icon.svg           App-Icon
└─ js/
   ├─ db.js                 IndexedDB-Wrapper
   ├─ store.js              Datenmodell, Repos, Demo-Daten
   ├─ calc.js               Noten-/Mitarbeitslogik
   ├─ csv.js                CSV-Export/Import
   ├─ ui.js                 Modal/Toast/Formfelder
   ├─ views.core.js         Views-Kern (State, Routing, Render)
   ├─ views.home-klasse.js  Home + Klassenansicht mit Tabs
   ├─ views.tracker.js      Mitarbeits-Tracker
   ├─ views.besprechung.js  Besprechungsmodus
   ├─ views.einstellungen.js Einstellungen inkl. Stundenplan
   ├─ views.dialoge.js      modale Dialoge
   ├─ views.js              Aktions-Dispatcher (Action-Map)
   └─ app.js                Bootstrap
```

## 10. Lokaler Start

**Schnell testen (Desktop):** `index.html` doppelklicken. Es öffnet sich im Browser,
Demo-Daten werden beim ersten Start angelegt. IndexedDB und CSV-Export funktionieren
per `file://`. (Nur die PWA/Offline-Installation braucht http – siehe unten.)

**Empfohlen (mit PWA/Offline, für iPad):** einen kleinen lokalen Server nutzen und die
Adresse im iPad-Chrome/Safari öffnen (gleiches WLAN):

```powershell
# im Projektordner, eine der Varianten:
npx serve .            # Node
python -m http.server  # Python 3   -> http://localhost:8000
```

Auf dem iPad die URL öffnen → Teilen → **„Zum Home-Bildschirm“**. Danach läuft die
App im Vollbild und offline. Alle Daten bleiben ausschließlich auf dem Gerät.

**Datensicherung:** Einstellungen → „Backup exportieren (JSON)“. Da Daten im Browser
liegen, gehen sie beim Löschen der Website-Daten verloren – regelmäßig sichern.
## 11. Datenspeicherung & Backup

### Wie funktioniert die Speicherung?

- **Automatisch beim Eingeben:** Jede Änderung (neue Klasse, Schüler, Noten, Mitarbeitseintrag) 
  wird sofort in IndexedDB geschrieben – **keine manuellen Speicherschritte nötig**.
- **Auf dem Gerät selbst:** Die Daten werden lokal im iPad/Browser gespeichert, nicht in der Cloud, 
  nicht auf Strato, nicht auf einem Server. Vollständige Datensouveränität.
- **Dauerhaft:** Die Daten bleiben erhalten nach dem Schließen der App, nach dem Ausschalten 
  des iPads und nach Browser-Neustarts.

### Werden Daten beim Schließen gelöscht?

**Nein!** Die Daten verschwinden **nicht**:
- App schließen → Daten bleiben ✅
- iPad ausschalten → Daten bleiben ✅
- Browser-Tab schließen → Daten bleiben ✅
- Browser deinstallieren → Daten gehen verloren ⚠️

### Backup-Strategie

**Wann sollten Sie exportieren?**

| Situation | Häufigkeit | Methode |
|-----------|-----------|---------|
| Nach großen Änderungen (neue Klassen, viele Noten) | Monatlich | JSON-Export |
| Schuljahrs-Ende / Archivierung | 1x pro Jahr | JSON-Export + sichern |
| Tägliche Nutzung (normal) | Nicht nötig | App speichert automatisch |
| Zusätzliche Sicherheit | Wöchentlich (optional) | JSON-Export |

**Wie exportieren:**
1. **In der App:** Einstellungen → **„Backup exportieren"** (oder CSV-Export)
2. **Datei speichern:** z.B. `noten-fritze-backup-2026-07-22.json`
3. **Sichern:** Auf Computer, OneDrive, Google Drive oder USB-Stick kopieren

**Wie wiederherstellen:**
1. **Einstellungen** → **„Backup importieren"**
2. **JSON-Datei auswählen** → alle Daten werden wiederhergestellt
3. Optional: „Vorher alles löschen" aktivieren (für Neustart)

### Sicherheit

✅ **Alle Daten bleiben lokal** – kein Cloud-Upload, keine Übertragung  
✅ **Keine Abhängigkeit** – funktioniert offline, ohne Internetverbindung  
✅ **Langlebigkeit** – auch in 10 Jahren noch lesbar (Standard-JSON-Format)  
✅ **Kontrolle:** Sie entscheiden, wann/ob exportiert wird
