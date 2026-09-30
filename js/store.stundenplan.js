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

  const Termine = {
    alle: () => DB.getAll("termine"),
    get: (id) => DB.get("termine", id),
    async save(t) { t.updatedAt = now(); return DB.put("termine", t); },
    remove: (id) => DB.del("termine", id),
    // Ausfall oder Hinweis an einer Stunde (item aus Calc.tagesPlan) setzen.
    //   was: "ausfall" | "hinweis"; notiz: Grund bzw. Hinweistext
    async aenderungSetzen(item, datum, blockId, was, notiz) {
      let v;
      if (item.verschobenVon) {
        // Eine hierher verschobene Stunde: Ausfall gilt für sie selbst
        v = Object.assign({}, item.verschobenVon);
        if (was === "ausfall") { v.aenderung = "ausfall"; v.nachDatum = null; v.nachBlockId = null; }
      } else {
        v = item.aenderung ? Object.assign({}, item.aenderung)
          : neuerTermin({ art: "aenderung", datum, blockId, klasseId: item.klasseId || null, titel: item.titel || "" });
        // Ein Hinweis an einer ausgefallenen/verschobenen Stunde ändert nur den Text
        if (was === "ausfall" || !v.aenderung) {
          v.aenderung = was; v.nachDatum = null; v.nachBlockId = null;
        }
      }
      v.notiz = notiz || "";
      return Termine.save(v);
    },
    // Stunde verschieben; liegt am Ziel schon Unterricht (zielItems), tauschen
    // die Stunden die Plätze. Alles in einer Transaktion.
    async verschieben(item, vonDatum, vonBlockId, nachDatum, nachBlockId, zielItems) {
      const schritte = [verschiebung(item, vonDatum, vonBlockId, nachDatum, nachBlockId)];
      (zielItems || []).forEach((z) => schritte.push(verschiebung(z, nachDatum, nachBlockId, vonDatum, vonBlockId)));
      await DB.atomar(["termine"], (os) => {
        schritte.forEach((x) => {
          if (x.del) os("termine").delete(x.del);
          if (x.put) os("termine").put(x.put);
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
    Termine, neuerTermin, TERMIN_ARTEN, TERMIN_ART_MAP
  });
})(window);
