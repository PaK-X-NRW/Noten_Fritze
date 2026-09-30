/* =========================================================================
   store.stundenplan.js – Stundenplan (Wochenplan) und Wochennotizen
   Erweitert den Store-Namespace (store.js lädt davor) um:
   - Store.Stundenplan: Versionen des Wochenplans (Store „stundenplaene“),
     je Version { id, gueltigAb: "YYYY-MM-DD" (Montag) | null, eintraege }.
     Welche Version an einem Datum gilt, A/B-Wochen und Archiv rechnet
     calc.stundenplan.js.
   - Store.Wochennotizen: freie Notiz je Woche (Schlüssel = Montag)
   - Store.Termine: Kalender (Termine, Ferien, Änderungen einzelner Stunden:
     Ausfall, Verschieben mit Platztausch, Hinweis) und TERMIN_ARTEN
   - Store.Planungen: Fahrplan je Stunde (Store „planungen“); beim Verschieben
     einer Stunde ziehen ihre Planungen in derselben Transaktion mit um
   Die Einträge verweisen auf die Stundenzeiten (blockId: "std-3" bzw. die
   ID einer Pause) und auf eine Klasse – oder tragen einen freien Titel.
   ========================================================================= */
(function (global) {
  "use strict";

  const { uid, now } = global.Store;

  // Neuer Eintrag: { id, tag 1..5, blockId, woche "alle"|"A"|"B",
  //                  klasseId | null, titel (Freitext), sitzplanId | null }
  function neuerPlanEintrag(data) {
    return Object.assign({
      id: uid(), tag: 1, blockId: "", woche: "alle",
      klasseId: null, titel: "", sitzplanId: null
    }, data || {});
  }

  const Stundenplan = {
    // Alle Versionen, älteste zuerst (die erste hat gueltigAb null)
    alle: () => DB.getAll("stundenplaene").then((list) => list.sort((a, b) => {
      const x = a.gueltigAb || "", y = b.gueltigAb || "";
      return x < y ? -1 : x > y ? 1 : 0;
    })),
    get: (id) => DB.get("stundenplaene", id),
    async save(v) { v.updatedAt = now(); return DB.put("stundenplaene", v); },
    remove: (id) => DB.del("stundenplaene", id),
    // Neue Version ab gueltigAb (null = von Anfang an), optional als Kopie
    // einer anderen Version (die Einträge bekommen neue IDs).
    async neu(gueltigAb, vorlage) {
      const t = now();
      const v = {
        id: uid(), gueltigAb: gueltigAb || null,
        eintraege: ((vorlage && vorlage.eintraege) || []).map((e) => Object.assign({}, e, { id: uid() })),
        createdAt: t, updatedAt: t
      };
      await Stundenplan.save(v);
      return v;
    },
    // Ersetzt die Einträge einer Zelle (Tag × Block) einer Version.
    async zelleSetzen(version, tag, blockId, eintraege) {
      version.eintraege = (version.eintraege || [])
        .filter((e) => !(e.tag === tag && e.blockId === blockId))
        .concat((eintraege || []).map((e) => neuerPlanEintrag(Object.assign({}, e, { tag, blockId }))));
      return Stundenplan.save(version);
    },
    // Entfernt die Einträge eines Blocks (gelöschte Pause/Stunde) aus den
    // genannten Versionen. Rückgabe: Anzahl entfernter Einträge.
    async blockEntfernen(versionen, blockId) {
      let anzahl = 0;
      for (const v of versionen) {
        const rest = (v.eintraege || []).filter((e) => e.blockId !== blockId);
        if (rest.length === (v.eintraege || []).length) continue;
        anzahl += (v.eintraege || []).length - rest.length;
        v.eintraege = rest;
        await Stundenplan.save(v);
      }
      return anzahl;
    }
  };

  // ---- Termine (Kalender) ------------------------------------------------------
  // Arten mit Symbol und Farbe – Reihenfolge = Auswahl im Dialog. Termine mit
  // Klasse tragen die Farbe der Klasse (Calc.klassenFarbe).
  const TERMIN_ARTEN = [
    { id: "klassenarbeit", label: "Klassenarbeit", icon: "📝", farbe: "#f5d0d3" },
    { id: "test",          label: "Test",          icon: "✏️", farbe: "#fbeeb8" },
    { id: "konferenz",     label: "Konferenz",     icon: "👥", farbe: "#d6e4f5" },
    { id: "elternabend",   label: "Elternabend",   icon: "👪", farbe: "#e3e0f7" },
    { id: "aufsicht",      label: "Aufsicht",      icon: "🦺", farbe: "#e9e2d0" },
    { id: "vertretung",    label: "Vertretung",    icon: "🔁", farbe: "#cdeceb" },
    { id: "sonstiges",     label: "Sonstiges",     icon: "📌", farbe: "#eef1f0" },
    { id: "ferien",        label: "Ferien / frei", icon: "🌴", farbe: "#d9ead0" }
  ];
  const TERMIN_ART_MAP = TERMIN_ARTEN.reduce((m, a) => (m[a.id] = a, m), {});

  // Datensatz des Stores „termine“ (Formen siehe calc.stundenplan.js):
  // Termin, Ferien (datum–bis) oder Änderung einer Stunde (art "aenderung").
  function neuerTermin(data) {
    const t = now();
    return Object.assign({
      id: uid(), art: "sonstiges", titel: "", datum: "", bis: null,
      blockId: null, klasseId: null, notiz: "",
      aenderung: null, nachDatum: null, nachBlockId: null,
      createdAt: t, updatedAt: t
    }, data || {});
  }

  // Verschiebt eine Stunde (item aus Calc.tagesPlan) – Rückgabe: was zu
  // schreiben ist ({ put } oder { del }). Eine schon verschobene Stunde
  // bekommt ein neues Ziel; zurück an ihren Platz heißt: Änderung löschen.
  function verschiebung(item, vonDatum, vonBlockId, nachDatum, nachBlockId) {
    if (item.verschobenVon) {
      const v = Object.assign({}, item.verschobenVon, { updatedAt: now() });
      if (v.datum === nachDatum && v.blockId === nachBlockId) return { del: v.id };
      v.nachDatum = nachDatum; v.nachBlockId = nachBlockId;
      return { put: v };
    }
    if (vonDatum === nachDatum && vonBlockId === nachBlockId) return item.aenderung ? { del: item.aenderung.id } : {};
    const v = item.aenderung
      ? Object.assign({}, item.aenderung, { updatedAt: now() })
      : neuerTermin({ art: "aenderung", datum: vonDatum, blockId: vonBlockId, klasseId: item.klasseId || null, titel: item.titel || "" });
    v.aenderung = "verschoben"; v.nachDatum = nachDatum; v.nachBlockId = nachBlockId;
    return { put: v };
  }

  // Planungen, die beim Verschieben mit umziehen (Calc.planungenUmziehen).
  //   zuege: [{ klasseId, von: {datum, blockId}, nach: {datum, blockId} }]
  // Liest vorher (DB.atomar darf kein await enthalten). Rückgabe: { put, del }
  async function planungsUmzug(zuege) {
    zuege = (zuege || []).filter((z) => z.klasseId);
    if (!zuege.length) return { put: [], del: [] };
    const klassen = zuege.map((z) => z.klasseId).filter((k, i, a) => a.indexOf(k) === i);
    const listen = await Promise.all(klassen.map((k) => DB.getAllByIndex("planungen", "klasseId", k)));
    return Calc.planungenUmziehen([].concat.apply([], listen), zuege);
  }
  // Schreibt Termin-Schritte ({ put } / { del }) und den Planungs-Umzug in
  // einer Transaktion.
  async function termineUndPlanungen(schritte, umzug) {
    await DB.atomar(["termine", "planungen"], (os) => {
      schritte.forEach((x) => {
        if (x.del) os("termine").delete(x.del);
        if (x.put) os("termine").put(x.put);
      });
      umzug.del.forEach((id) => os("planungen").delete(id));
      umzug.put.forEach((pl) => { pl.updatedAt = now(); os("planungen").put(pl); });
    });
  }

  const Termine = {
    alle: () => DB.getAll("termine"),
    get: (id) => DB.get("termine", id),
    async save(t) { t.updatedAt = now(); return DB.put("termine", t); },
    remove: (id) => DB.del("termine", id),
    // Ausfall oder Hinweis an einer Stunde (item aus Calc.tagesPlan) setzen.
    //   was: "ausfall" | "hinweis"; notiz: Grund bzw. Hinweistext
    async aenderungSetzen(item, datum, blockId, was, notiz) {
      let v, zuege = [];
      if (item.verschobenVon) {
        // Eine hierher verschobene Stunde: Ausfall gilt für sie selbst – sie
        // steht dann wieder an ihrem alten Platz (mit ihrer Planung)
        v = Object.assign({}, item.verschobenVon);
        if (was === "ausfall") {
          zuege.push({ klasseId: v.klasseId, von: { datum: v.nachDatum, blockId: v.nachBlockId }, nach: { datum: v.datum, blockId: v.blockId } });
          v.aenderung = "ausfall"; v.nachDatum = null; v.nachBlockId = null;
        }
      } else {
        v = item.aenderung ? Object.assign({}, item.aenderung)
          : neuerTermin({ art: "aenderung", datum, blockId, klasseId: item.klasseId || null, titel: item.titel || "" });
        // Ein Hinweis an einer ausgefallenen/verschobenen Stunde ändert nur den Text
        if (was === "ausfall" || !v.aenderung) {
          v.aenderung = was; v.nachDatum = null; v.nachBlockId = null;
        }
      }
      v.notiz = notiz || "";
      v.updatedAt = now();
      return termineUndPlanungen([{ put: v }], await planungsUmzug(zuege));
    },
    // Verschiebung aufheben: Änderung löschen, die Planung kehrt an den alten Platz zurück.
    async verschiebungAufheben(v) {
      const zuege = v.aenderung === "verschoben"
        ? [{ klasseId: v.klasseId, von: { datum: v.nachDatum, blockId: v.nachBlockId }, nach: { datum: v.datum, blockId: v.blockId } }]
        : [];
      return termineUndPlanungen([{ del: v.id }], await planungsUmzug(zuege));
    },
    // Stunde verschieben; liegt am Ziel schon Unterricht (zielItems), tauschen
    // die Stunden die Plätze. Alles in einer Transaktion.
    async verschieben(item, vonDatum, vonBlockId, nachDatum, nachBlockId, zielItems) {
      const schritte = [verschiebung(item, vonDatum, vonBlockId, nachDatum, nachBlockId)];
      const von = { datum: vonDatum, blockId: vonBlockId }, nach = { datum: nachDatum, blockId: nachBlockId };
      const zuege = [{ klasseId: item.klasseId, von, nach }];
      (zielItems || []).forEach((z) => {
        schritte.push(verschiebung(z, nachDatum, nachBlockId, vonDatum, vonBlockId));
        zuege.push({ klasseId: z.klasseId, von: nach, nach: von });
      });
      await termineUndPlanungen(schritte, await planungsUmzug(zuege));
    }
  };

  // ---- Planungen (Fahrplan je Stunde) -------------------------------------------
  // Datensatz: { id, klasseId, datum, blockId, thema, bausteine: [
  //   { id, typ: "text" | "link" | "datei", phase, minuten, text, url, dateiId } ] }
  // Eine Doppelstunde hat je Stunde einen Datensatz; das Planungsfenster zeigt
  // sie als einen Fahrplan (Calc.fahrplanAusPlanungen / fahrplanAufteilen).
  const Planungen = {
    alle: () => DB.getAll("planungen"),
    byKlasse: (klasseId) => DB.getAllByIndex("planungen", "klasseId", klasseId),
    async derStunden(klasseId, datum, blockIds) {
      return (await Planungen.byKlasse(klasseId)).filter((p) => p.datum === datum && blockIds.indexOf(p.blockId) !== -1);
    },
    // Speichert den Fahrplan einer Einheit: je Stunde die Bausteine, das Thema
    // für alle Stunden. Stunden ohne Bausteine und ohne Thema werden gelöscht.
    //   teile: { blockId: [bausteine] }
    async einheitSpeichern(klasseId, datum, blockIds, teile, thema) {
      const vorhanden = await Planungen.derStunden(klasseId, datum, blockIds);
      const t = now();
      await DB.atomar(["planungen"], (os) => {
        blockIds.forEach((blockId) => {
          // Je Stunde genau ein Datensatz; überzählige (Altlast) entfernen
          const alle = vorhanden.filter((p) => p.blockId === blockId);
          const alt = alle[0];
          alle.slice(1).forEach((p) => os("planungen").delete(p.id));
          const bausteine = teile[blockId] || [];
          if (!bausteine.length && !thema) { if (alt) os("planungen").delete(alt.id); return; }
          os("planungen").put(Object.assign(alt || { id: uid(), klasseId, datum, blockId, createdAt: t },
            { thema: thema || "", bausteine, updatedAt: t }));
        });
      });
    }
  };

  const Wochennotizen = {
    get: (montag) => DB.get("wochennotizen", montag).then((n) => (n && n.text) || ""),
    // Leerer Text löscht die Notiz der Woche
    async save(montag, text) {
      text = String(text || "");
      if (!text.trim()) return DB.del("wochennotizen", montag);
      return DB.put("wochennotizen", { montag, text, updatedAt: now() });
    }
  };

  Object.assign(global.Store, {
    Stundenplan, Wochennotizen, neuerPlanEintrag,
    Termine, neuerTermin, TERMIN_ARTEN, TERMIN_ART_MAP, Planungen
  });
})(window);
