# Auftrag für die nächste Sitzung

Diese Datei zum Start einer neuen KI-Sitzung komplett als Prompt einfügen.

---

# Einleitung

Du arbeitest am Projekt Noten-Fritze: eine 100 % lokale, offline-fähige PWA zur
Noten- und Mitarbeitsverwaltung für Lehrkräfte (Vanilla HTML/CSS/JS, klassische
`<script>`-Tags, keine ES-Module, keine Frameworks/CDNs, Daten ausschließlich in
IndexedDB, iPad-first).

Lies vor jeder Änderung `AGENTS.md` vollständig – dort stehen Architektur,
Konventionen und Fallstricke (u. a.: `APP_VERSION` in `js/version.js` bei jeder
Änderung an gecachten Dateien erhöhen, `data-action` + Action-Map statt onclick,
Nutzerdaten mit `UI.esc()` escapen, `render()` nach jeder Mutation).

Arbeite minimal und fokussiert, keine ungefragten Refactorings oder Commits.
UI-Texte, Kommentare und Commit-Messages auf Deutsch.

# Vorgehen: erst planen, dann bauen

Fang bitte im Plan-Modus an und ändere noch nichts:

1. Sieh dir die betroffenen Stellen an und stell mir deine offenen Fragen.
2. Leg mir den Plan in Alltagssprache vor: Was ändert sich in der App? Welche
   Dateien fasst du an? Was passiert mit meinen vorhandenen Daten? In welcher
   Reihenfolge gehst du vor? Wo bist du unsicher?
3. Warte auf mein ausdrückliches OK. Erst danach änderst du etwas.

# So sollst du mit mir sprechen

Ich bin kein Entwickler, sondern Lehrer. Bitte richte dich danach:

- Frag lieber einmal zu viel als zu wenig. Wenn mein Wunsch mehrdeutig ist,
  mehrere Umsetzungen denkbar sind oder du eine Annahme treffen müsstest:
  stell mir vorher eine Frage, statt einfach loszulegen.
- Stell deine Fragen in kleinen Häppchen, jeweils mit einer kurzen Begründung,
  warum du das wissen willst und was der Unterschied für mich praktisch
  bedeutet. Am liebsten mit konkreten Auswahlmöglichkeiten („Soll A passieren
  oder B?“) statt offener Fragen.
- Kein Fachjargon. Erkläre alles aus Sicht der App und des Schulalltags, nicht
  aus Sicht des Codes. Wenn ein Fachbegriff unvermeidbar ist, erkläre ihn in
  einem Halbsatz.
- Beschreibe Änderungen so, wie ich sie sehe: Was ändert sich auf dem
  Bildschirm? Wo muss ich hinklicken? Was passiert mit meinen bisherigen Daten?
- Bevor du etwas Größeres umbaust oder löschst: erst kurz beschreiben, was du
  vorhast, und meine Zustimmung abwarten.
- Sag mir am Ende, wie ich es selbst prüfen kann – Schritt für Schritt, z. B.
  „Klasse 8b öffnen → Reiter Mitarbeit → …“. Weise mich darauf hin, wenn ich die
  App neu laden muss, damit die Änderung ankommt.
- Sei ehrlich, wenn etwas nicht funktioniert hat, unklar ist oder du etwas nicht
  geprüft hast. Lieber ein klarer Hinweis als ein zu optimistisches „fertig“.

# Meine Aufgabe: die Oberstufe in einer Ansicht

Ich möchte für einen Oberstufenkurs **alle fünf Kurshalbjahre in derselben
Notenansicht** sehen: **11.1 · 11.2 · 12.1 · 12.2 · 13.1**. Heute zeigt die
Notenübersicht immer nur ein Halbjahr einer einzelnen Klasse – ich muss also
zwischen drei Klassen und zwei Reitern hin- und herspringen, um den Verlauf eines
Kurses zu sehen.

## Was heute schon da ist (Stand v1.8.2)

- Eine **Klasse ist genau ein Schuljahr** (Feld `schuljahr`), und die
  Schülerliste gehört zu genau dieser Klasse. 11.1 bis 13.1 sind also drei
  Klassen mit drei getrennten Schülerlisten – die App weiß nicht, dass „Anna
  Bauer“ in allen dreien dieselbe Person ist.
- Ab `klassenstufe` 11 rechnet die App in **MSS-Punkten** (0–15), es gibt **keine
  Jahresnote**, und die beiden Halbjahres-Reiter heißen nach der Klassenstufe
  („12.1 · 12.2“).
- Der Mitarbeits-Vorschlag wird über die **offizielle Tabelle** in Punkte
  umgerechnet (`Calc.noteZuMssPunkte`, `Punkte = 17 − Note × 3`).
- Die Rechenkette eines Halbjahres steckt vollständig in
  `Calc.halbjahrErgebnis`; die Spalten der Notenübersicht entstehen in
  `halbjahrSpalten` (`js/views.home-klasse.js`).
- `Schuljahr-Schema.md` beschreibt den kompletten Ablauf eines Schuljahrs mit
  Beispielzahlen – auch den Oberstufen-Teil. Bitte vorher lesen.

## Der vorgeschlagene Weg (bitte prüfen, nicht blind übernehmen)

Aus einer früheren Sitzung stammt dieser Vorschlag – halte ihn für einen
Ausgangspunkt, nicht für eine Vorgabe:

1. **Kurse verknüpfen:** Beim Anlegen einer Klasse eine Auswahl „Fortsetzung von
   …“ anbieten. Die Schülerliste wird übernommen, und die Personen bleiben über
   die Schuljahre hinweg verknüpft.
2. **Neue Ansicht „Oberstufe“:** eine rein lesende Tabelle, je Person eine Zeile
   mit den Endnoten der fünf Kurshalbjahre (11.1 … 13.1) und einer
   Zusammenfassung.
3. Die einzelnen Kurshalbjahre bleiben eigene Klassen und werden weiter wie
   bisher gepflegt.

Ausdrücklich **verworfen** wurde die Alternative, alles in *eine* Klasse mit zehn
Quartalen zu pressen: Das würde die gesamte Quartalslogik umbauen und auch die
Sekundarstufe I gefährden.

## Bitte kläre mit mir vorab unter anderem

- Soll die Oberstufen-Ansicht ein **eigener Reiter/Bereich** sein oder eine
  dritte Auswahl neben „1. Halbjahr / 2. Halbjahr“ in der Notenübersicht?
- Soll man in dieser Ansicht **nur lesen** oder auch Noten eintragen können?
- Wie werden die Personen zugeordnet: über die Übernahme der Schülerliste beim
  Anlegen der Folgeklasse, über den Namen, oder soll ich eine Zuordnung von Hand
  anbieten (falls jemand dazukommt oder den Kurs verlässt)?
- Was passiert mit Personen, die **nicht in allen fünf Halbjahren** dabei sind?
- Soll zusätzlich etwas ausgerechnet werden (Durchschnitt über die
  Kurshalbjahre, Summe der Punkte, Einbringung fürs Abitur) – oder erst einmal
  nur die fünf Endnoten nebeneinander?
- Brauchst du dafür eine **Beispielklasse** wie „Mathematik LK 12“, nur über drei
  Schuljahre hinweg?

## Was unangetastet bleiben soll

- Die Sekundarstufe-I-Ansicht (Halbjahre, Epochalnoten, Jahresnote).
- Die Rechenkette in `calc.js` (`halbjahrErgebnis`, Drittel- und Zeugnisskala,
  MSS-Umrechnung) und der Mitarbeits-Tracker.
- Das Datenmodell bestehender Klassen: Vorhandene Noten dürfen sich nicht
  verändern und nichts darf gelöscht werden.

## Zum Schluss

Sag mir am Ende ehrlich, was du geprüft hast und was nicht (du kannst die App
nicht selbst anklicken), und gib mir einen Klickpfad zum Nachprüfen inklusive
Hinweis aufs Neuladen.
