/* =========================================================================
   calc.mitarbeit.js – Mitarbeits-Auswertung nach dem Stundennoten-Modell
   - auswertungMitarbeit: je gehaltener Stunde eine Stundennote aus ihren
     Punkten (Schwellen), Notenvorschlag = Ø der Stundennoten;
     Verweigerung = glatte 6, Abwesenheitstage zählen nicht
   - punkteZuNote / schwellenFuer: Schwellen global oder je Klasse
   Erweitert den Namespace Calc (calc.js lädt davor).
   ========================================================================= */
(function (global) {
  "use strict";

  // Lokales Tages-Datum (YYYY-MM-DD) eines Timestamps – Schlüssel für
  // Tages-Zählungen und Abwesenheiten.
  function tagVonTs(ts) {
    return Store.datumLokal(new Date(ts));
  }

  // Aggregiert Ereignisse je Schüler innerhalb eines Zeitraums und rechnet
  // nach dem STUNDENNOTEN-MODELL: Jede gezählte Stunde (im Zeitraum, keine
  // gemeldete Abwesenheit des Schülers an dem Tag) bekommt eine Stundennote
  // aus der Summe ihrer Event-Punkte via Schwellen; eine Stunde ohne
  // Ereignis zählt mit 0 Punkten. Ein „verweigerung"-Ereignis setzt die
  // Stundennote glatt auf 6 (Meldungspunkte dieser Stunde entfallen).
  // Der Notenvorschlag ist der Ø aller Stundennoten (1 NK).
  // Im haModus "note6" fließen „keinehausaufgabe"-Punkte NICHT in die
  // Stundennoten ein; stattdessen kommt je drei vergessener Hausaufgaben eine
  // zusätzliche Stundennote 6 dazu (Feld `haNoten`), die den Notenvorschlag
  // drückt und mit dem Quartalsabschluss in der Mitarbeitsnote landet – in der
  // Notenübersicht taucht sie bewusst nicht als eigene Spalte auf.
  // Im Aggregat-Feld `punkte` bleiben die HA-Punkte enthalten –
  // `punkte` ist die reine Info-Summe aller gezählten Event-Punkte (ohne
  // Verwerfung durch Verweigerung oder haModus).
  //   ereignisse: Array {schuelerId, stundeId, typ, punkte, timestamp}
  //   opts: {
  //     vonTs, bisTs:   Zeitraum (Default: alles bis jetzt)
  //     abwesendTage:   Set "schuelerId|YYYY-MM-DD" – Ereignisse an Tagen mit
  //                     gemeldeter Abwesenheit zählen nicht, und die Stunden
  //                     dieses Tages fallen für den/die Schüler/in aus dem Nenner
  //     stunden:        Array der gehaltenen Stunden {id, datum, startTs} –
  //                     bereits nach Zeitraum gefiltert; sie bilden die Stundennoten
  //     schuelerIds:    optional alle Schüler der Klasse, damit auch Schüler
  //                     ohne jedes Ereignis einen Vorschlag bekommen
  //     schwellen:      effektive Notenschwellen (global oder klassenweise)
  //   }
  // Rückgabe je Schüler u. a.: anzahl, punkte, typen, letzte, tage,
  // stundenIds, stundenGezaehlt, stundenMitEreignis, aktiveTage, nenner,
  // punkteProStunde (Info, treibt den Vorschlag nicht mehr), verweigerungen,
  // stundenNoten (chronologisch, {stundeId, datum, note, punkte, verweigerung,
  //   einheiten} – eine Doppelstunde liefert zwei Einträge, s. unten),
  // notenvorschlag (Ø der Stundennoten, 1 NK; null ohne jede Grundlage).
  function auswertungMitarbeit(ereignisse, settings, opts) {
    opts = opts || {};
    const von = opts.vonTs || 0, bis = opts.bisTs || Store.now() + 1;
    const abwesendTage = opts.abwesendTage;
    const schwellen = opts.schwellen || settings.mitarbeitSchwellen || Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
    const stunden = (opts.stunden || [])
      .filter((st) => st.startTs >= von && st.startTs <= bis)
      .sort((a, b) => a.startTs - b.startTs);
    const haZaehltPunkte = settings.haModus !== "note6";

    const proSchueler = {};
    function eintrag(sid) {
      if (!proSchueler[sid]) {
        proSchueler[sid] = {
          // anzahl = alle Ereignisse, meldungen = nur die positiven
          // (Wortmeldung/gut/sehr gut) – die Tabelle zeigt die Meldungen.
          schuelerId: sid, anzahl: 0, meldungen: 0, punkte: 0, letzte: 0,
          typen: {}, tage: {}, stundenIds: {}, verweigerungen: 0
        };
      }
      return proSchueler[sid];
    }
    (opts.schuelerIds || []).forEach(eintrag);

    // Ereignisse aggregieren und zusätzlich je Schüler/Stunde gruppieren
    const eventsProStunde = {}; // sid -> stundeKey -> { punkte, verweigerung }
    ereignisse.forEach((e) => {
      if (e.timestamp < von || e.timestamp > bis) return;
      const tag = tagVonTs(e.timestamp);
      if (abwesendTage && abwesendTage.has(e.schuelerId + "|" + tag)) return;
      const s = eintrag(e.schuelerId);
      const punkte = (e.punkte != null ? e.punkte : (settings.mitarbeitPunkte[e.typ] || 0));
      s.anzahl += 1;
      s.punkte += punkte;
      const typDef = Store.EVENT_TYPE_MAP[e.typ];
      if (typDef && typDef.positiv) s.meldungen += 1;
      if (e.typ === "verweigerung") s.verweigerungen += 1;
      s.letzte = Math.max(s.letzte, e.timestamp);
      s.typen[e.typ] = (s.typen[e.typ] || 0) + 1;
      s.tage[tag] = true;
      s.stundenIds[e.stundeId || tag] = true;
      const key = e.stundeId || ("tag:" + tag);
      const gruppen = (eventsProStunde[e.schuelerId] = eventsProStunde[e.schuelerId] || {});
      const g = (gruppen[key] = gruppen[key] || { punkte: 0, verweigerung: false });
      if (e.typ === "verweigerung") {
        g.verweigerung = true;
      } else if (e.typ === "keinehausaufgabe" && !haZaehltPunkte) {
        // haModus "note6": vergessene HA geben keine Mitarbeits-Punkte
      } else {
        g.punkte += punkte;
      }
    });

    Object.keys(proSchueler).forEach((sid) => {
      const s = proSchueler[sid];
      const stundenNoten = [];
      let gezaehlt = 0;
      stunden.forEach((st) => {
        if (abwesendTage && abwesendTage.has(sid + "|" + st.datum)) return;
        // Eine Doppelstunde zählt wie zwei Einzelstunden: Ihre Punkte werden
        // auf 45 Minuten umgerechnet (die Schwellen gelten je Unterrichts-
        // stunde), und die daraus entstehende Note zählt entsprechend oft.
        const einheiten = Math.max(1, Math.round((st.dauerMin || 45) / 45));
        gezaehlt += einheiten;
        const g = (eventsProStunde[sid] || {})[st.id] || null;
        const punkte = g ? g.punkte : 0;
        const verw = g ? g.verweigerung : false;
        const note = verw ? 6 : punkteZuNote(punkte / einheiten, schwellen);
        for (let i = 0; i < einheiten; i++) {
          stundenNoten.push({
            stundeId: st.id, datum: st.datum, note,
            punkte: punkte / einheiten, verweigerung: verw,
            einheiten
          });
        }
      });
      if (gezaehlt === 0 && s.anzahl > 0) {
        // Keine Stunden bekannt (z. B. gefilterter Zeitraum): ersatzweise je
        // Ereignis-Gruppe (Stunde bzw. Tag) eine Stundennote bilden.
        const gruppen = eventsProStunde[sid] || {};
        Object.keys(gruppen).forEach((key) => {
          const g = gruppen[key];
          const istTag = key.indexOf("tag:") === 0;
          stundenNoten.push({
            stundeId: istTag ? null : key,
            datum: istTag ? key.slice(4) : null,
            note: g.verweigerung ? 6 : punkteZuNote(g.punkte, schwellen),
            punkte: g.punkte, verweigerung: g.verweigerung
          });
        });
      }
      // haModus "note6": je drei vergessene Hausaufgaben im Zeitraum eine
      // zusätzliche Note 6 im Notenvorschlag. Sie erscheint bewusst nicht als
      // eigene Spalte in der Notenübersicht – dort steht aus dem
      // Mitarbeitsbereich nur die fertige Mitarbeitsnote (s. Store.haNote6Pruefen).
      s.haNoten = haZaehltPunkte ? 0 : Math.floor((s.typen.keinehausaufgabe || 0) / 3);
      for (let i = 0; i < s.haNoten; i++) {
        stundenNoten.push({ stundeId: null, datum: null, note: 6, punkte: 0, verweigerung: false, haNote: true });
      }

      s.stundenGezaehlt = gezaehlt;
      s.stundenMitEreignis = Object.keys(s.stundenIds).length;
      s.aktiveTage = Object.keys(s.tage).length;
      // Ohne bekannte Stunden (z. B. gefilterter Zeitraum) ersatzweise die
      // Stunden mit Ereignis, damit nie durch 0 geteilt wird.
      s.nenner = gezaehlt || s.stundenMitEreignis || 1;
      s.punkteProStunde = s.punkte / s.nenner;
      s.stundenNoten = stundenNoten;
      // Notenvorschlag = Ø der Stundennoten (1 NK). Ohne jede Grundlage
      // (keine Stunde, kein Ereignis) gibt es keinen Vorschlag.
      s.notenvorschlag = stundenNoten.length
        ? Math.round(stundenNoten.reduce((a, x) => a + x.note, 0) / stundenNoten.length * 10) / 10
        : null;
    });
    return proSchueler;
  }

  // Punkte einer Stunde -> Stundennote: die erste Schwelle (absteigend
  // sortiert), deren abPunkte erreicht sind; darunter 6.
  function punkteZuNote(punkteProStunde, schwellen) {
    const liste = schwellen || Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
    for (const s of liste) {
      if (punkteProStunde >= s.abPunkte) return s.note;
    }
    return 6;
  }

  // Effektive Notenschwellen: eigene Schwellen der Klasse schlagen die
  // globale Einstellung (Fächer ermöglichen unterschiedliche Mitarbeit).
  function schwellenFuer(settings, klasse) {
    if (klasse && Array.isArray(klasse.mitarbeitSchwellen) && klasse.mitarbeitSchwellen.length) {
      return klasse.mitarbeitSchwellen;
    }
    if (settings && Array.isArray(settings.mitarbeitSchwellen) && settings.mitarbeitSchwellen.length) {
      return settings.mitarbeitSchwellen;
    }
    return Store.DEFAULT_SETTINGS.mitarbeitSchwellen;
  }

  Object.assign(global.Calc, { auswertungMitarbeit, punkteZuNote, schwellenFuer, tagVonTs });
})(window);
