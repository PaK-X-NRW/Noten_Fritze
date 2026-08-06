# Prompt-Beispiele

Vorlagen zum Kopieren an den Anfang einer neuen KI-Sitzung.
Die Regeln selbst stehen verbindlich in [AGENTS.md](AGENTS.md) – diese Datei ist
nur die bequeme Kurzform für Tools, die `AGENTS.md` nicht von allein lesen.

---

## Kurzfassung

```text
Du arbeitest am Projekt Noten-Fritze (lokale Noten- und Mitarbeitsverwaltung für
Lehrkräfte, Vanilla HTML/CSS/JS ohne Build und ohne Abhängigkeiten) – lies zuerst
AGENTS.md vollständig und halte dich strikt daran. Arbeite zuerst im Plan-Modus:
zeig mir den Plan in Alltagssprache und warte auf mein OK, bevor du etwas änderst.
Ich bin kein Entwickler: frag lieber einmal zu viel nach, statt zu raten, und
erkläre alles ohne Fachjargon.

Meine Aufgabe:

```

---

## Ausführlich

```text
# Einleitung
Du arbeitest am Projekt Noten-Fritze: eine 100 % lokale, offline-fähige PWA zur
Noten- und Mitarbeitsverwaltung für Lehrkräfte (Vanilla HTML/CSS/JS, klassische
<script>-Tags, keine ES-Module, keine Frameworks/CDNs, Daten ausschließlich in
IndexedDB, iPad-first).

Lies vor jeder Änderung AGENTS.md vollständig – dort stehen Architektur,
Konventionen und Fallstricke (u. a.: APP_VERSION in js/version.js bei jeder
Änderung an gecachten Dateien erhöhen, data-action + Action-Map statt onclick,
Nutzerdaten mit UI.esc() escapen, render() nach jeder Mutation).

Arbeite minimal und fokussiert, keine ungefragten Refactorings oder Commits. UI-Texte,
Kommentare und Commit-Messages auf Deutsch.

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
  aus Sicht des Codes. Statt „Ich ergänze einen Migrationsschritt im Schema“
  lieber: „Deine bisherigen Daten bleiben erhalten, das neue Feld ist bei alten
  Einträgen erstmal leer.“ Wenn ein Fachbegriff unvermeidbar ist, erkläre ihn
  in einem Halbsatz.
- Beschreibe Änderungen so, wie ich sie sehe: Was ändert sich auf dem
  Bildschirm? Wo muss ich hinklicken? Was passiert mit meinen bisherigen Daten?
- Bevor du etwas Größeres umbaust oder löschst: erst kurz beschreiben, was du
  vorhast, und meine Zustimmung abwarten.
- Sag mir am Ende, wie ich es selbst prüfen kann – Schritt für Schritt, z. B.
  „Klasse 8b öffnen → Reiter Mitarbeit → …“. Weise mich darauf hin, wenn ich
  die App neu laden muss, damit die Änderung ankommt.
- Sei ehrlich, wenn etwas nicht funktioniert hat, unklar ist oder du etwas
  nicht geprüft hast. Lieber ein klarer Hinweis als ein zu optimistisches
  „fertig“.

# Meine Aufgabe

```
