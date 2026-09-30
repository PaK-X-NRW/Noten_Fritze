/* =========================================================================
   store.stundenplan.js – Stundenplan (Wochenplan) und Wochennotizen
   Erweitert den Store-Namespace (store.js lädt davor) um:
   - Store.Stundenplan: Versionen des Wochenplans (Store „stundenplaene“),
     je Version { id, gueltigAb: "YYYY-MM-DD" (Montag) | null, eintraege }.
     Welche Version an einem Datum gilt, A/B-Wochen und Archiv rechnet
     calc.stundenplan.js.
   - Store.Wochennotizen: freie Notiz je Woche (Schlüssel = Montag)
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

  const Wochennotizen = {
    get: (montag) => DB.get("wochennotizen", montag).then((n) => (n && n.text) || ""),
    // Leerer Text löscht die Notiz der Woche
    async save(montag, text) {
      text = String(text || "");
      if (!text.trim()) return DB.del("wochennotizen", montag);
      return DB.put("wochennotizen", { montag, text, updatedAt: now() });
    }
  };

  Object.assign(global.Store, { Stundenplan, Wochennotizen, neuerPlanEintrag });
})(window);
