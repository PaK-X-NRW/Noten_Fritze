Du bist ein erfahrener Senior Frontend- und Product-Engineer. Entwickle eine produktionsreife, lokal laufende Browser-App für Lehrer/innen an Gymnasien in Deutschland.

Ziel:
Ich möchte eine Web-App/PWA entwickeln, die auf einem iPad im Chrome-Browser gut nutzbar ist und grundsätzlich auch auf anderen Systemen läuft. Die App soll komplett lokal funktionieren, keine Cloud, kein Server, keine Benutzerkonten, keine externen Datenbanken. Alle Daten sollen ausschließlich auf dem Gerät im Browser gespeichert werden. Die App muss außerdem CSV-Export und CSV-Import unterstützen, damit die Daten bei Bedarf auch mit Numbers weiterverarbeitet werden können. Für die lokale Speicherung soll bevorzugt IndexedDB verwendet werden; LocalStorage nur für kleine UI-Einstellungen, nicht für die eigentlichen Nutzdaten.

Wichtige Rahmenbedingungen:
- Tablet-first, besonders optimiert für iPad im Querformat.
- Bedienung per Touch, große Touch-Ziele, schnelle Eingaben im Unterricht.
- Kein Login.
- Datenschutzfreundlich: alle Daten lokal im Browser.
- Offline nutzbar.
- Modernes, klares, ruhiges UI.
- Deutsche Sprache in der UI.
- Responsive, aber primär für iPad.
- Die App soll als statische Web-App umsetzbar sein, idealerweise mit HTML/CSS/JavaScript oder einer leichtgewichtigen Frontend-Struktur. Falls du ein Framework empfiehlst, begründe kurz warum. Bevorzuge aber möglichst einfache, langlebige Technologie.
- Keine Backend-Abhängigkeit.
- Export/Import als CSV pro Klasse und optional als Gesamtexport.
- Datenmodell und Code so strukturieren, dass später Erweiterungen möglich sind.

Fachliche Anforderungen:
1. Klassenverwaltung
- Es muss möglich sein, mehrere Klassen anzulegen, zu bearbeiten und zu löschen.
- Pro Klasse sollen mindestens folgende Daten gepflegt werden können:
  - Klassenname
  - Schuljahr
  - Fach
  - optionale Notizen
  - unterteilung Hauptfach/-Nebenfach (wg. unterschiedlicher prozentualer Anteile für schriftliche und sonstige Leistungen)
- Innerhalb einer Klasse sollen Schüler/innen angelegt, bearbeitet, sortiert und entfernt werden können.
- Pro Schüler/in:
  - Vorname
  - Nachname
  - optionale Bemerkung
  - optional Sitzplatzzuordnung

2. Notenverwaltung
- Für jede Klasse soll es eine Notenübersicht geben.
- Es soll möglich sein, beliebig viele Teilnoten-Kategorien zu definieren, z. B.:
  - Klassenarbeit
  - Test
  - Mündliche Mitarbeit
  - Hausaufgaben
  - Projekt
  - Sonstiges
- Jede Kategorie soll eine eigene Gewichtung erhalten können.
- Innerhalb einer Kategorie sollen mehrere Einzelnoten pro Schüler/in erfasst werden können.
- Die App soll aus den Einzelnoten zunächst Kategoriewerte und daraus eine Gesamtnote berechnen.
- Die Gewichtung muss flexibel einstellbar sein.
- Die Berechnungslogik soll transparent dargestellt werden.
- Es soll klar sichtbar sein:
  - Einzelnoten
  - Durchschnitt je Kategorie
  - Gewichtung je Kategorie
  - berechnete Gesamtnote
- Optional soll eine Rundungsregel konfigurierbar sein.
- Die App soll für das in Deutschland übliche Notensystem 1 bis 6 geeignet sein.
- Die Berechnung soll robust gegen leere Werte und fehlende Teilnoten sein.

1. Mitarbeits-Tracker
- Es soll einen speziellen Modus für die Erfassung von mündlicher Mitarbeit bzw. Wortmeldungen geben.
- Dazu braucht jede Klasse einen Sitzplan.
- Der Sitzplan soll visuell als Raster mit frei belegbaren Sitzplätzen aufgebaut werden können.
- Schüler/innen sollen Sitzplätzen zugewiesen werden können.
- Im Tracker-Modus soll ich durch einfaches Tippen auf einen Sitzplatz bzw. auf den dort sitzenden Schüler eine Wortmeldung erfassen können.
- Eine Wortmeldung soll als Ereignis mit Zeitstempel lokal gespeichert werden.
- Optional soll es unterschiedliche Ereignistypen geben, z. B.:
  - einfache Wortmeldung
  - gute Wortmeldung
  - sehr gute Wortmeldung
  - Störung
  - fehlende Hausaufgabe
- Diese Ereignisse sollen später in eine Epochalnote bzw. Mitarbeitstendenz überführt werden können.
- Entwickle dafür ein nachvollziehbares, konfigurierbares Punktesystem.
- Die Erfassung muss extrem schnell gehen, idealerweise mit einem Tap.
- Es soll eine Undo-Funktion für Fehleingaben geben.
- Es soll Auswertungen pro Schüler/in und pro Zeitraum geben.
- Eine farbliche Darstellung über die Mitarbeit soll erkenntlich sein - Schüler die sich länger nicht beteiligt haben sollen rot werden (fließende Farbwechsel von Grün=häufige Mitarbeit zu rot=seltene Mitarbeit)


1. CSV-Import und CSV-Export
- CSV-Export für:
  - Schülerliste einer Klasse
  - Noten einer Klasse
  - Ereignisse/Wortmeldungen einer Klasse
  - Gesamtexport aller Klassen
- CSV-Dateien sollen Numbers-kompatibel sein.
- Nutze saubere Spaltennamen und ein robustes CSV-Format.
- Biete auch CSV-Import an, zumindest für Schülerlisten und optional Noten.
- Beschreibe das CSV-Schema klar.

1. Lokale Datenspeicherung
- Verwende IndexedDB für die eigentlichen Daten.
- Lege ein sauberes Datenmodell fest für:
  - Klassen
  - Schüler/innen
  - Kategorien
  - Einzelnoten
  - Sitzpläne
  - Ereignisse
  - Einstellungen
- Implementiere Export/Import als Sicherungsmechanismus.
- Achte auf Datenintegrität und Versionierbarkeit des lokalen Schemas.

1. UX-Anforderungen
- Home-Bereich mit Klassenübersicht - lange nicht bearbeitete/ aufgerufenen Klassen sollen erkenntlich gemacht werden.
- Die wichtigsten Aktionen müssen mit wenigen Taps erreichbar sein.
- Die App soll im Unterricht stressfrei bedienbar sein.
- Große Buttons, klare Kontraste, einfache Navigation.
- Eine Klasse schnell öffnen, Sitzplan öffnen, tippen, zurück zur Übersicht.
- Möglichst wenig Tipparbeit während des Unterrichts.
- Gute Übersicht auf dem iPad.
- Kein überladenes Design.
- Besprechungsmodus implementieren - Für die Notenbesprechung müssen Schüler einzeln anwählbar sein, da sie die Daten der mitschüler nicht sehen dürfen.

1. Technische Anforderungen
- Erstelle eine klare Projektstruktur.
- Implementiere die App so, dass sie lokal als statische Website lauffähig ist.
- Schlage eine sinnvolle Architektur vor.
- Falls sinnvoll, nutze PWA-Grundlagen für Offline-Nutzung.
- Vermeide unnötige Abhängigkeiten.
- Achte auf gute Wartbarkeit.
- Schreibe sauberen, modularen Code.
- Erstelle Beispiel-Daten für Demo-Zwecke.

Deine Aufgaben:
1. Beschreibe zuerst kurz das beste technische Konzept für diese App.
2. Schlage einen sinnvollen Tech-Stack vor und begründe ihn knapp.
3. Definiere das Datenmodell.
4. Definiere die Rechenlogik für gewichtete Gesamtnoten.
5. Definiere die Logik für den Epochalnoten-Tracker inklusive Punktesystem.
6. Definiere das CSV-Schema.
7. Beschreibe die UI-Struktur und die wichtigsten Screens.
8. Erstelle danach direkt einen umsetzbaren MVP-Plan in sinnvollen Schritten.
9. Erzeuge anschließend den vollständigen Code für einen ersten funktionsfähigen Prototypen.
10. Der Prototyp soll folgende Kernfunktionen bereits enthalten:
   - Klassen anlegen
   - Schüler/innen anlegen
   - Notenkategorien mit Gewichtung anlegen
   - Einzelnoten erfassen
   - Gesamtnote berechnen
   - einfachen Sitzplan anlegen
   - Tap auf Schüler im Sitzplan zählt Wortmeldungen
   - lokale Speicherung
   - CSV-Export
11. Baue den Code so, dass ich ihn lokal öffnen und testen kann.
12. Verwende deutsche UI-Texte.

Wichtig:
- Triff eigene sinnvolle Produktentscheidungen, wenn etwas nicht exakt definiert ist.
- Bevorzuge einfache, robuste Lösungen statt unnötiger Komplexität.
- Denke wie ein Produktdesigner und wie ein Lehrer, der im Unterricht unter Zeitdruck arbeitet.
- Gib nicht nur abstrakte Vorschläge, sondern liefere konkrete Umsetzung.
- Wenn du für den ersten Prototypen Dinge vereinfachst, markiere klar, was MVP ist und was später ergänzt werden sollte.

Ausgabeformat:
- Zuerst: Architektur und Begründung
- Dann: Datenmodell
- Dann: MVP-Funktionsumfang
- Dann: Dateistruktur
- Dann: vollständiger Code
- Dann: kurze Anleitung zum lokalen Start