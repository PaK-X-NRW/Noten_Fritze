/* =========================================================================
   store.stundenplan.js – Stundenplan (Wochenplan) und Wochennotizen
   Erweitert den Store-Namespace (store.js lädt davor) um:
   - Store.Stundenplan: Versionen des Wochenplans (Store „stundenplaene“),
     je Version { id, gueltigAb: "YYYY-MM-DD" (Montag) | null, eintraege }.
     Welche Version an einem Datum gilt, A/B-Wochen und Archiv rechnet
     calc.stundenplan.js.
   - Store.Wochennotizen: freie Notiz je Woche (Schlüssel = Montag) und die
     Checklisten „Vorbereitung“ je Tag dieser Woche
   - Store.Termine: Kalender (Termine, Ferien, Änderungen einzelner Stunden:
     Ausfall, Verschieben mit Platztausch, Hinweis) und TERMIN_ARTEN
   - Store.Planungen: Fahrplan je Stunde (Store „planungen“); beim Verschieben
     einer Stunde ziehen ihre Planungen in derselben Transaktion mit um;
     Rücken ohne Ausfall, Bausteine in die nächste Stunde voranstellen
   - Store.Dateien: Anhänge (Kopie in der App), Aufräumen nach Frist
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
    // Ausfall-Datensätze für mehrere Stunden bauen (noch nicht speichern), damit
    // sich vorher ausrechnen lässt, wohin die Planungen weiterrücken.
    //   eintraege: [{ item, datum, blockId }] (item aus Calc.tagesPlan)
    //   modus: "stunde" | "einheit" (Planungen wurden weitergeschoben) | null
    ausfallDatensaetze(eintraege, notiz, modus) {
      return eintraege.map((e) => {
        const alt = e.item.verschobenVon || e.item.aenderung;
        const v = alt ? Object.assign({}, alt)
          : neuerTermin({ art: "aenderung", datum: e.datum, blockId: e.blockId, klasseId: e.item.klasseId || null, titel: e.item.titel || "" });
        return Object.assign(v, { aenderung: "ausfall", nachDatum: null, nachBlockId: null,
          notiz: notiz || "", verschiebeModus: modus || null, updatedAt: now() });
      });
    },
    // Ohne Weiterschieben: hierher verschobene Stunden fallen an ihrem alten
    // Platz aus – ihre Planung kehrt dorthin zurück.
    zurueckZuege(eintraege) {
      return eintraege.filter((e) => e.item.verschobenVon && e.item.klasseId).map((e) => ({
        klasseId: e.item.klasseId, von: { datum: e.datum, blockId: e.blockId },
        nach: { datum: e.item.verschobenVon.datum, blockId: e.item.verschobenVon.blockId }
      }));
    },
    // Ausfälle speichern und Planungen umziehen – eine Transaktion.
    async ausfaelleSchreiben(datensaetze, zuege) {
      return termineUndPlanungen(datensaetze.map((v) => ({ put: v })), await planungsUmzug(zuege));
    },
    // Ausfälle aufheben (Datensätze löschen), Planungen ggf. zurückrücken.
    async ausfaelleAufheben(datensaetze, zuege) {
      return termineUndPlanungen(datensaetze.map((v) => ({ del: v.id })), await planungsUmzug(zuege));
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
  // Datensatz: { id, klasseId, datum, blockId, thema, reihe, bausteine: [
  //   { id, typ: "text" | "link" | "datei", phase, minuten, text, url, dateiId } ] }
  // Eine Doppelstunde hat je Stunde einen Datensatz; das Planungsfenster zeigt
  // sie als einen Fahrplan (Calc.fahrplanAusPlanungen / fahrplanAufteilen).
  // Schreibt den Fahrplan einer Einheit (synchron, innerhalb von DB.atomar).
  //   vorhanden: bisherige Datensätze der Einheit
  //   einheit: { klasseId, datum, blockIds, teile: { blockId: [bausteine] }, thema, reihe }
  //   thema: Text für alle Stunden oder { blockId: Text } (Stunden mit eigenem Thema)
  //   reihe: Name der Unterrichtsreihe (für alle Stunden der Einheit), "" = keine
  function einheitSchreiben(os, vorhanden, einheit, t) {
    const reihe = String(einheit.reihe || "").trim();
    einheit.blockIds.forEach((blockId) => {
      const thema = einheit.thema && typeof einheit.thema === "object" ? einheit.thema[blockId] || "" : einheit.thema;
      // Je Stunde genau ein Datensatz; überzählige (Altlast) entfernen
      const alle = vorhanden.filter((p) => p.blockId === blockId);
      const alt = alle[0];
      alle.slice(1).forEach((p) => os("planungen").delete(p.id));
      const bausteine = einheit.teile[blockId] || [];
      if (!bausteine.length && !thema && !reihe) { if (alt) os("planungen").delete(alt.id); return; }
      os("planungen").put(Object.assign(alt || { id: uid(), klasseId: einheit.klasseId, datum: einheit.datum, blockId, createdAt: t },
        { thema: thema || "", reihe, bausteine, updatedAt: t }));
    });
  }

  const Planungen = {
    alle: () => DB.getAll("planungen"),
    byKlasse: (klasseId) => DB.getAllByIndex("planungen", "klasseId", klasseId),
    async derStunden(klasseId, datum, blockIds) {
      return (await Planungen.byKlasse(klasseId)).filter((p) => p.datum === datum && blockIds.indexOf(p.blockId) !== -1);
    },
    // Speichert den Fahrplan einer Einheit: je Stunde die Bausteine, das Thema
    // für alle Stunden (oder je Stunde als { blockId: Text }). Stunden ohne
    // Bausteine und ohne Thema werden gelöscht.
    //   teile: { blockId: [bausteine] }
    async einheitSpeichern(klasseId, datum, blockIds, teile, thema, reihe) {
      const vorhanden = await Planungen.derStunden(klasseId, datum, blockIds);
      const t = now();
      await DB.atomar(["planungen"], (os) => {
        einheitSchreiben(os, vorhanden, { klasseId, datum, blockIds, teile, thema, reihe }, t);
      });
    },
    // Unterrichtsreihe in eine Klasse übernehmen: je Stunde eine neue Planung
    // (Thema, Reihe, Bausteine mit neuen IDs), dazu ggf. Dateien aus einem
    // Reihen-Paket. Die Ziel-Stunden sind frei (Calc.reiheVerteilen). Eine Transaktion.
    //   stunden: [{ datum, blockId, thema, bausteine }]
    async reiheEinfuegen(klasseId, reihe, stunden, dateien) {
      const t = now();
      await DB.atomar(["planungen", "dateien"], (os) => {
        (dateien || []).forEach((d) => os("dateien").put(d));
        stunden.forEach((st) => os("planungen").put({
          id: uid(), klasseId, datum: st.datum, blockId: st.blockId, thema: st.thema || "", reihe: reihe || "",
          bausteine: (st.bausteine || []).map((x) => Object.assign({}, x, { id: uid() })), createdAt: t, updatedAt: t
        }));
      });
    },
    // Bausteine einer Einheit in eine andere Stunde der Klasse schieben: Die
    // Quelle wird mit den übrigen Bausteinen gespeichert, am Ziel stehen die
    // verschobenen vorne (vor der vorhandenen Planung, Thema bleibt). Eine Transaktion.
    //   quelle: { klasseId, datum, blockIds, teile, thema } (ohne die Bausteine)
    //   ziel: { datum, blockId }
    async bausteineVoranstellen(quelle, ziel, bausteine) {
      const vorhanden = await Planungen.derStunden(quelle.klasseId, quelle.datum, quelle.blockIds);
      const dort = (await Planungen.derStunden(quelle.klasseId, ziel.datum, [ziel.blockId]))[0];
      const t = now();
      await DB.atomar(["planungen"], (os) => {
        einheitSchreiben(os, vorhanden, quelle, t);
        os("planungen").put(Object.assign(dort || { id: uid(), klasseId: quelle.klasseId, datum: ziel.datum, blockId: ziel.blockId, thema: "", createdAt: t }, {
          bausteine: bausteine.concat((dort && dort.bausteine) || []),
          updatedAt: t
        }));
      });
    },
    // Bausteine als eigene Stunde einschieben: Die Planungen ab dem Ziel rücken
    // weiter (zuege aus Calc.planungenRuecken), am frei gewordenen Ziel steht
    // eine neue Planung mit den Bausteinen und dem Thema (z. B. „Brüche 2“).
    // Quelle, Umzug und neue Stunde in einer Transaktion.
    async bausteineEinschieben(quelle, ziel, bausteine, thema, zuege) {
      const vorhanden = await Planungen.derStunden(quelle.klasseId, quelle.datum, quelle.blockIds);
      const dort = (await Planungen.derStunden(quelle.klasseId, ziel.datum, [ziel.blockId]))[0];
      const umzug = await planungsUmzug(zuege);
      // Ist die alte Planung des Ziels nicht mitgewandert (Ende des Horizonts), wird ergänzt statt doppelt angelegt
      const bleibt = dort && !umzug.put.some((p) => p.id === dort.id);
      const t = now();
      await DB.atomar(["planungen"], (os) => {
        einheitSchreiben(os, vorhanden, quelle, t);
        umzug.del.forEach((id) => os("planungen").delete(id));
        umzug.put.forEach((pl) => { pl.updatedAt = t; os("planungen").put(pl); });
        os("planungen").put(bleibt
          ? Object.assign(dort, { bausteine: bausteine.concat(dort.bausteine || []), updatedAt: t })
          : { id: uid(), klasseId: quelle.klasseId, datum: ziel.datum, blockId: ziel.blockId,
              thema: thema || "", reihe: String(quelle.reihe || "").trim(), bausteine, createdAt: t, updatedAt: t });
      });
    },
    // Planungen umziehen (Calc.planungenRuecken) – eine Transaktion
    async umziehen(zuege) {
      return termineUndPlanungen([], await planungsUmzug(zuege));
    }
  };

  // ---- Dateien (Anhänge der Planung) ------------------------------------------------
  // Datensatz: { id, name, mime, groesse, daten (ArrayBuffer | null), behalten,
  //              entferntAm ("YYYY-MM-DD" | null), erstelltAm }
  // Die Datei ist eine Kopie – das Original bleibt, wo es war. Den Inhalt
  // entfernt aufraeumen() nach der Frist; Name und Größe bleiben (auch im
  // Baustein), damit man weiß, was benutzt wurde. ArrayBuffer statt Blob:
  // ältere iPad-Safaris konnten Blobs nicht zuverlässig in IndexedDB ablegen.
  function dateiLesen(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error("Datei konnte nicht gelesen werden"));
      r.readAsArrayBuffer(file);
    });
  }
  const Dateien = {
    alle: () => DB.getAll("dateien"),
    get: (id) => DB.get("dateien", id),
    save: (d) => DB.put("dateien", d),
    // Legt eine Kopie der gewählten Datei an. Rückgabe: Datensatz
    async neu(file) {
      const d = {
        id: uid(), name: file.name || "Datei", mime: file.type || "application/octet-stream",
        groesse: file.size || 0, daten: await dateiLesen(file),
        behalten: false, entferntAm: null, erstelltAm: now()
      };
      await DB.put("dateien", d);
      return d;
    },
    blob: (d) => new Blob([d.daten], { type: d.mime || "application/octet-stream" }),
    // Belegter Speicher (nur Dateien mit Inhalt), in Bytes
    async belegt() {
      return (await Dateien.alle()).reduce((n, d) => n + (d.daten ? (d.groesse || d.daten.byteLength || 0) : 0), 0);
    },
    // Aufräumen (beim App-Start): Dateien ohne Baustein werden gelöscht; der
    // Inhalt einer Datei wird entfernt, wenn die letzte Stunde, in der sie
    // vorkommt, länger als fristTage zurückliegt – außer sie ist 📌 behalten.
    //   fristTage: Zahl oder null (= nie automatisch entfernen)
    // Rückgabe: { entfernt, geloescht }
    async aufraeumen(fristTage, heute) {
      const [dateien, planungen] = await Promise.all([Dateien.alle(), DB.getAll("planungen")]);
      const letzte = {};
      planungen.forEach((p) => (p.bausteine || []).forEach((b) => {
        if (b.typ === "datei" && b.dateiId && (!letzte[b.dateiId] || letzte[b.dateiId] < p.datum)) letzte[b.dateiId] = p.datum;
      }));
      const erg = { entfernt: 0, geloescht: 0 };
      const grenze = fristTage == null ? null : Calc.datumPlusTage(heute, -fristTage);
      await DB.atomar(["dateien"], (os) => {
        dateien.forEach((d) => {
          if (!letzte[d.id]) { os("dateien").delete(d.id); erg.geloescht += 1; return; }
          if (d.daten && !d.behalten && grenze && letzte[d.id] < grenze) {
            os("dateien").put(Object.assign({}, d, { daten: null, entferntAm: heute }));
            erg.entfernt += 1;
          }
        });
      });
      return erg;
    },
    // Inhalt aller Dateien entfernen (Einstellungen), 📌 eingeschlossen
    async alleEntfernen(heute) {
      const dateien = (await Dateien.alle()).filter((d) => d.daten);
      await DB.atomar(["dateien"], (os) => {
        dateien.forEach((d) => os("dateien").put(Object.assign({}, d, { daten: null, entferntAm: heute })));
      });
      return dateien.length;
    }
  };

  // Datensatz je Woche: { montag, text, checklisten: { "YYYY-MM-DD": [{ id, text, erledigt }] } }
  // Die Checklisten („Vorbereitung“ je Tag über der 1. Stunde) liegen bei der
  // Notiz ihrer Woche. Ohne Text und ohne Punkte wird der Datensatz gelöscht.
  function wochennotizSchreiben(n) {
    const listen = n.checklisten || {};
    Object.keys(listen).forEach((d) => { if (!(listen[d] || []).length) delete listen[d]; });
    if (!String(n.text || "").trim() && !Object.keys(listen).length) return DB.del("wochennotizen", n.montag);
    return DB.put("wochennotizen", { montag: n.montag, text: String(n.text || ""), checklisten: listen, updatedAt: now() });
  }
  const Wochennotizen = {
    get: (montag) => DB.get("wochennotizen", montag).then((n) => (n && n.text) || ""),
    // Checklisten der Woche { datum: [punkte] }
    checklisten: (montag) => DB.get("wochennotizen", montag).then((n) => (n && n.checklisten) || {}),
    // Leerer Text löscht die Notiz der Woche (die Checklisten bleiben)
    async save(montag, text) {
      const n = (await DB.get("wochennotizen", montag)) || { montag };
      n.text = String(text || "");
      return wochennotizSchreiben(n);
    },
    // Checkliste eines Tages ersetzen (leere Liste = entfernen)
    async checklisteSetzen(montag, datum, punkte) {
      const n = (await DB.get("wochennotizen", montag)) || { montag, text: "" };
      n.checklisten = n.checklisten || {};
      n.checklisten[datum] = (punkte || []).filter((x) => String(x.text || "").trim());
      return wochennotizSchreiben(n);
    }
  };

  Object.assign(global.Store, {
    Stundenplan, Wochennotizen, neuerPlanEintrag,
    Termine, neuerTermin, TERMIN_ARTEN, TERMIN_ART_MAP, Planungen, Dateien
  });
})(window);
