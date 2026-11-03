/* =========================================================================
   neuigkeiten.js – Was ist neu? (Release Notes)
   - NEUIGKEITEN: je Version { version, datum, titel, punkte[] }, neueste zuerst
   - Gezeigt nach einem Update (app.js) und unter Einstellungen → Über & Hilfe
   - Bei jedem Versionssprung einen Eintrag ergänzen – in der Sprache der
     Lehrkräfte, kurz und ohne Fachjargon
   ========================================================================= */
(function (global) {
  "use strict";

  global.NEUIGKEITEN = [
    {
      version: "1.19.0", datum: "2026-11-03", titel: "Quartalsabschluss korrigieren, Einstellungen aufgeräumt",
      punkte: [
        "Zu früh abgeschlossen? Direkt nach „Quartal abschließen“ im Hinweis auf „Rückgängig“ tippen.",
        "Reiter Mitarbeit: „Der Tracker erfasst neue Stunden im … · Ändern“ – das Quartal selbst wählen und Stunden, die im falschen Quartal gelandet sind, samt Meldungen verschieben.",
        "„Abschluss aufheben“ fragt gleich, in welchem Quartal es weitergehen soll.",
        "Warnung, wenn ein Quartal laut Kalender noch über vier Wochen läuft.",
        "Der Tracker-Start zeigt, in welchem Quartal erfasst wird.",
        "Die Einstellungen sind in Reiter aufgeteilt; dieses Fenster „Was ist neu?“ findest du dort unter „Über & Hilfe“."
      ]
    },
    {
      version: "1.18.0", datum: "2026-10-31", titel: "Stundenplanung, Reihen, Rohpunkte",
      punkte: [
        "Stundenplanung als Fenster neben dem Wochenplan (Tipp auf eine Stunde): Thema, Bausteine, Dateien, ⇥ in die nächste Stunde, Planungen rücken.",
        "Checkliste „Vorbereitung“ für jeden Tag im Wochenplan.",
        "Unterrichtsreihen: Reihe in der Planung eintragen, in der Ansicht „Reihen“ ansehen, als Paket weitergeben und in eine andere Klasse übernehmen.",
        "Klassenarbeiten mit Rohpunkten und Notenschlüssel; darunter Ø und Notenspiegel.",
        "Nach „Quartal abschließen“ erfasst der Tracker automatisch im nächsten Quartal.",
        "Gelöschte Klassen bleiben 30 Tage im Papierkorb (Einstellungen)."
      ]
    },
    {
      version: "1.17.0", datum: "2026-10-28", titel: "Impressum und Unterstützen",
      punkte: [
        "Impressum auf der Infoseite.",
        "Noten-Fritze bleibt kostenlos – wer mag, kann die Weiterentwicklung freiwillig per PayPal unterstützen."
      ]
    },
    {
      version: "1.16.0", datum: "2026-10-02", titel: "Stundenplan und Kalender",
      punkte: [
        "Stundenplan auf der Startseite, mit A/B-Wochen und Notiz je Woche.",
        "Kalender mit Terminen, Ferien, Ausfall und Verschieben von Stunden.",
        "Stundenplanung je Stunde.",
        "Stundenzeiten mit Pausen.",
        "Vergessene Stunden lassen sich nachtragen, statt still beendet zu werden."
      ]
    }
  ];
})(window);
