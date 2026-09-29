/* =========================================================================
   views.noten.js – Notenübersicht (Reiter „Noten“)
   - TabNoten: Tabelle eines Halbjahres, Spalten aus dem Spaltenmodell
     (halbjahrSpalten), Zeilen aus der Halbjahres-Kette (Calc.halbjahrErgebnis)
   - Dialoge: Spalte (Leistung) anlegen/bearbeiten, Schüler-Detail mit
     Rechenweg und Korrektur der Mitarbeitsnote
   Die Eingabe in der Tabelle (Zelle, Nummernpad, Spalten ziehen) steckt in
   views.noten.eingabe.js; sie holt sich den Renderkontext über notenKontext().
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, render, halbjahrFilter, halbjahrTabsHTML, breakdownHTML } = global.Views;
  // ---- Tab: Noten ----------------------------------------------------------
  // Die Notenübersicht zeigt genau ein Halbjahr. Aufbau der Spalten:
  //   Name | schriftliche Leistungen | [1. Quartal: sonstige Leistungen] |
  //   Epochalnote 1 | [2. Quartal: …] | Epochalnote 2 | Schriftliche
  //   Leistungen | Sonstige Leistungen | Zeugnisnote (im 2. HJ + Jahr)
  // Jede Leistung („2. Klassenarbeit", „HÜ 10.09.") ist eine eigene Spalte mit
  // genau einer Note je Schüler/in; die Rechenkette steckt in
  // Calc.halbjahrErgebnis.

  // Render-Kontext der Tabelle. TabNoten füllt ihn; die Inline-Eingabe rechnet
  // damit einzelne Zeilen neu, ohne die ganze View neu aufzubauen.
  let notenKtx = null;

  // Badge für eine Note auf der Zeugnisskala (ganze Note bzw. 4-).
  function zeugnisBadge(note, mss) {
    if (note === null || note === undefined) return '<span class="muted">–</span>';
    return '<span class="note-badge" style="background:' + Calc.noteFarbe(note, mss) + '">' + Calc.formatZeugnisnote(note, mss) + "</span>";
  }
  // Badge für eine Drittelnote – angezeigt als Tendenz (2+, 3, 4-).
  function tendenzBadge(note, mss) {
    if (note === null || note === undefined) return '<span class="muted">–</span>';
    return '<span class="note-badge" style="background:' + Calc.noteFarbe(note, mss) + '">' + Calc.formatTendenz(note, mss) + "</span>";
  }

  async function TabNoten(k) {
    const [schueler, katsRoh, leistungen, notenAll, ereignisse] = await Promise.all([
      Store.Schueler.byKlasse(k.id),
      Store.Kategorien.byKlasse(k.id),
      Store.Leistungen.byKlasse(k.id),
      Store.Noten.byKlasse(k.id),
      Store.Ereignisse.byKlasse(k.id)
    ]);
    if (!schueler.length) return '<div class="empty"><div class="big">📋</div><p>Erst Schüler/innen anlegen.</p></div>';
    if (!katsRoh.length) return '<div class="empty"><div class="big">🏷️</div><p>Erst Kategorien anlegen.</p><button class="btn primary" data-action="class-tab" data-tab="kategorien">Zu den Kategorien</button></div>';

    const mss = Calc.istMSS(k);
    const hj = halbjahrFilter();
    const quartale = hj === 2 ? [3, 4] : [1, 2];

    const katById = {};
    katsRoh.forEach((c) => { katById[c.id] = c; });
    // Reihenfolge für die Rechnung: erst schriftlich, dann sonstige
    const kats = katsRoh.filter((c) => c.art === "schriftlich")
      .concat(katsRoh.filter((c) => c.art !== "schriftlich"));

    // Spalten dieses Halbjahres (Kategorie muss es noch geben)
    const hjLeistungen = leistungen.filter((l) =>
      katById[l.kategorieId] && quartale.indexOf(l.quartal) !== -1);

    const notenBySchueler = {};
    notenAll.forEach((n) => (notenBySchueler[n.schuelerId] = notenBySchueler[n.schuelerId] || []).push(n));

    const key = spaltenKey(k.id, hj);
    const eigeneReihenfolge = !!(state.notenSpalten && state.notenSpalten.key === key);
    notenKtx = { k, mss, hj, quartale, kats, katById, leistungen: hjLeistungen, schueler, notenBySchueler, ereignisse, key };
    notenKtx.spalten = spaltenOrdnen(halbjahrSpalten(notenKtx), key);

    const body = schueler.map((s) => notenZeile(s)).join("");

    // Offene Quartale (Mitarbeitsnote fehlt) im Hinweis benennen – sonst wirkt
    // das „⋯“ in der Epochalnote wie ein Fehler.
    const offeneQuartale = quartale.filter((q) => !Calc.mitarbeitVorhanden(kats, notenAll, q));
    const hinweis = offeneQuartale.length
      ? "Noch offen: " + offeneQuartale.map((q) => q + ". Quartal").join(" und ") +
        " – die Epochalnote entsteht, sobald die Mitarbeitsnote über „Quartal abschließen“ im Mitarbeit-Tab übertragen ist."
      : "Noten direkt in die Zellen tippen (2+, 3, 4-) – Enter springt nach unten, Tab nach rechts. " +
        "Tipp auf einen Spaltenkopf bearbeitet die Spalte, Tipp auf den Namen zeigt die Berechnung.";

    return (
      '<div class="hstack wrap" style="margin-bottom:var(--gap)">' +
        '<div class="tabs" style="margin:0">' + halbjahrTabsHTML("noten-hj", k) + "</div>" +
        '<button class="btn small primary" data-action="add-leistung">＋ Spalte</button>' +
        '<div class="grow muted">' + hinweis + "</div>" +
        (eigeneReihenfolge ? '<button class="btn small" data-action="noten-spalten-reset">Spalten zurücksetzen</button>' : "") +
        '<button class="btn small" data-action="export-noten">Noten-CSV</button>' +
        '<button class="btn small" data-action="export-einzelnoten">Einzelnoten-CSV</button>' +
      "</div>" +
      '<div class="table-wrap noten-wrap"><table class="noten-tab"><thead>' +
        spaltenKopfZeile(notenKtx.spalten) + "</thead><tbody>" + body + "</tbody></table>" +
        '<div class="noten-rand"></div>' +
      "</div>"
    );
  }

  // ---- Noten: Spaltenmodell -------------------------------------------------
  // Jede Spalte kennt ihre ID (Basis fürs Umsortieren), ihre Farbgruppe, den
  // Kopftext und wie ihre Datenzelle gefüllt wird. Die Namensspalte gehört
  // bewusst nicht dazu: sie bleibt fixiert ganz links stehen.
  function grpKlasse(art) {
    return art === "schriftlich" ? "grp-schriftlich" : "grp-sonstige";
  }
  function spaltenKlassen(sp, extra) {
    return "num " + sp.grp + (sp.trenner ? " summe" : "") + (sp.stark ? " summe-stark" : "") + (extra ? " " + extra : "");
  }
  function spaltenZelle(sp, inhalt, extra, attr) {
    return '<td class="' + spaltenKlassen(sp, extra) + '"' + (attr || "") + ">" + inhalt + "</td>";
  }

  // Spalte einer einzelnen Leistung: hier wird getippt (eine Note je Zelle).
  function leistungSpalte(l, kat, mss) {
    const untertitel = UI.esc(kat.name) + (l.datum ? " · " + UI.datumKurz(l.datum) : "");
    return {
      id: "l:" + l.id,
      grp: grpKlasse(kat.art),
      leistungId: l.id,
      kopf: UI.esc(l.titel || kat.name) +
        '<br><span class="muted" style="text-transform:none;font-weight:400">' + untertitel + "</span>",
      zelle: (sp, ctx) => {
        const n = ctx.werte[l.id];
        const inhalt = n && n.wert !== null && n.wert !== undefined
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(n.wert, mss) + '">' + Calc.formatTendenz(n.wert, mss) + "</span>"
          : '<span class="muted">–</span>';
        return spaltenZelle(sp, inhalt, "zelle",
          ' data-lid="' + l.id + '" data-sid="' + ctx.s.id + '" tabindex="0"');
      }
    };
  }

  // Zählspalte einer Kategorie mit anzeige "fehlendeHA" – je Quartal.
  function haSpalte(kat, quartal) {
    return {
      id: "ha:" + kat.id + ":" + quartal,
      grp: "grp-sonstige",
      kopf: UI.esc(kat.name) +
        '<br><span class="muted" style="text-transform:none;font-weight:400">vergessene HA · ' + quartal + ". Q</span>",
      zelle: (sp, ctx) => {
        const anzahl = ctx.ereignisse.filter((e) =>
          e.schuelerId === ctx.s.id && e.typ === "keinehausaufgabe" &&
          (!e.quartal || e.quartal === quartal)
        ).length;
        return spaltenZelle(sp, anzahl ? "<strong>" + anzahl + "×</strong>" : '<span class="muted">–</span>');
      }
    };
  }

  // Aufbau der Spalten eines Halbjahres (siehe Kopfkommentar des Tabs).
  function halbjahrSpalten(ktx) {
    const mss = ktx.mss;
    const spalten = [];
    const vonKategorie = (l) => ktx.katById[l.kategorieId];

    // 1) Schriftliche Leistungen des Halbjahres (über beide Quartale hinweg)
    ktx.leistungen
      .filter((l) => vonKategorie(l).art === "schriftlich")
      .forEach((l) => spalten.push(leistungSpalte(l, vonKategorie(l), mss)));

    // 2) Je Quartal: sonstige Leistungen, HA-Zählung, dann die Epochalnote.
    // Spalten aus einer Mitarbeits-Kategorie bleiben ausgeblendet: Aus dem
    // Mitarbeitsbereich zeigt die Übersicht nur die fertige Epochalnote. Die
    // Note selbst zählt unverändert mit und ist im Schüler-Detail (Tipp auf
    // den Namen) korrigierbar.
    ktx.quartale.forEach((q, i) => {
      ktx.leistungen
        .filter((l) => l.quartal === q && vonKategorie(l).art !== "schriftlich" &&
          Calc.istNotenKategorie(vonKategorie(l)) && !Calc.istMitarbeitsKategorie(vonKategorie(l)))
        .forEach((l) => spalten.push(leistungSpalte(l, vonKategorie(l), mss)));
      Object.keys(ktx.katById).map((id) => ktx.katById[id])
        .filter((c) => c.art !== "schriftlich" && c.anzeige === "fehlendeHA")
        .forEach((c) => spalten.push(haSpalte(c, q)));
      spalten.push({
        id: "epochal:" + q, grp: "grp-sonstige", trenner: true, stark: true,
        kopf: "Epochalnote " + (i + 1) +
          '<br><span class="muted" style="text-transform:none;font-weight:400">' + q + ". Quartal</span>",
        zelle: (sp, ctx) => {
          const e = ctx.hjErg.epochal.find((x) => x.quartal === q);
          // Ohne Mitarbeitsnote ist das Quartal noch offen – kein Zwischenstand,
          // der wie ein Ergebnis aussieht.
          if (e && e.offen) {
            return spaltenZelle(sp, '<span class="muted" title="Quartal noch nicht abgeschlossen – die Mitarbeitsnote fehlt">⋯</span>');
          }
          return spaltenZelle(sp, tendenzBadge(e ? e.note : null, mss));
        }
      });
    });

    // 3) Halbjahres-Teilnoten und Zeugnisnote
    spalten.push({
      id: "sum:schriftlich", grp: "grp-schriftlich", trenner: true, stark: true,
      kopf: "Schriftliche<br>Leistungen",
      zelle: (sp, ctx) => spaltenZelle(sp, tendenzBadge(ctx.hjErg.schriftlich, mss))
    });
    spalten.push({
      id: "sum:sonstige", grp: "grp-sonstige", stark: true,
      kopf: "Sonstige<br>Leistungen",
      zelle: (sp, ctx) => spaltenZelle(sp, tendenzBadge(ctx.hjErg.sonstige, mss))
    });
    const stufe = mss ? ktx.k.klassenstufe : null;
    spalten.push({
      id: "sum:zeugnis", grp: "grp-zeugnis", trenner: true, stark: true,
      kopf: "Zeugnisnote<br>" + (stufe ? stufe + "." + ktx.hj : ktx.hj + ". Halbjahr"),
      zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.hjErg.zeugnis, mss))
    });
    // In der Oberstufe ist jedes Kurshalbjahr eine eigene Endnote – dort gibt
    // es keine Jahresnote aus beiden Halbjahren.
    if (ktx.hj === 2 && !mss) {
      spalten.push({
        id: "sum:jahr", grp: "grp-zeugnis", stark: true,
        kopf: "Zeugnisnote<br>Jahr",
        zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.jahr, mss))
      });
    }
    return spalten;
  }

  function spaltenKey(klasseId, hj) {
    return klasseId + "|hj" + hj;
  }

  // Wendet eine per Ziehen gemerkte Reihenfolge an. Sie liegt nur im State
  // (nicht in IndexedDB): nach einem Neuladen steht die Tabelle wieder in der
  // Default-Reihenfolge. Passt die Spaltenmenge nicht mehr (neue oder gelöschte
  // Kategorie), gilt wieder der Default.
  function spaltenOrdnen(spalten, key) {
    const merk = state.notenSpalten;
    if (!merk || merk.key !== key || merk.ids.length !== spalten.length) return spalten;
    const nachId = {};
    spalten.forEach((sp) => { nachId[sp.id] = sp; });
    const sortiert = [];
    for (const id of merk.ids) {
      if (!nachId[id]) return spalten;
      sortiert.push(nachId[id]);
    }
    return sortiert;
  }

  function spaltenKopfZeile(spalten) {
    return "<tr><th>Name</th>" + spalten.map((sp) =>
      '<th class="' + spaltenKlassen(sp, "zieh") + '" data-spalte="' + UI.esc(sp.id) + '">' + sp.kopf + "</th>"
    ).join("") + "</tr>";
  }

  // Rechenkontext einer Zeile: die Noten des Schülers nach Spalte, dazu die
  // komplette Halbjahres-Kette (im 2. HJ zusätzlich die Jahresnote).
  function zeilenKontext(s) {
    const noten = notenKtx.notenBySchueler[s.id] || [];
    const werte = {};
    noten.forEach((n) => { if (n.leistungId) werte[n.leistungId] = n; });
    const hjErg = Calc.halbjahrErgebnis(notenKtx.kats, noten, notenKtx.k, notenKtx.hj, notenKtx.mss);
    let jahr = null;
    if (notenKtx.hj === 2) {
      const hj1 = Calc.halbjahrErgebnis(notenKtx.kats, noten, notenKtx.k, 1, notenKtx.mss);
      jahr = Calc.jahresnote(hj1.zeugnis, hjErg.zeugnis, notenKtx.mss);
    }
    return { s, werte, hjErg, jahr, ereignisse: notenKtx.ereignisse };
  }

  function notenZeilenInhalt(s) {
    const ctx = zeilenKontext(s);
    return '<td class="pointer" data-action="student-detail" data-sid="' + s.id + '"><strong>' +
      UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
      notenKtx.spalten.map((sp) => sp.zelle(sp, ctx)).join("");
  }
  function notenZeile(s) {
    return '<tr data-sid="' + s.id + '">' + notenZeilenInhalt(s) + "</tr>";
  }

  // Renderkontext der zuletzt gezeichneten Tabelle (für die Inline-Eingabe)
  function notenKontext() { return notenKtx; }

  // ---- Spalte (Leistung) anlegen/bearbeiten --------------------------------
  // Eine Leistung ist genau eine Spalte der Notenübersicht; ihr Quartal
  // entscheidet, in welche Epochalnote sie einfließt. Neue Spalten liegen
  // voreingestellt im ersten Quartal des angezeigten Halbjahres – Noten
  // können so nicht versehentlich im anderen Halbjahr landen.
  async function leistungDialog(k, leistungId) {
    const kats = await Store.Kategorien.byKlasse(k.id);
    const hj = halbjahrFilter();
    const isNew = !leistungId;
    const vorhanden = isNew ? null : await Store.Leistungen.get(leistungId);
    if (!isNew && !vorhanden) { UI.toast("Spalte nicht gefunden"); return; }
    // Mitarbeits-Kategorien stehen nicht zur Wahl: Ihre Noten kommen aus
    // „Quartal abschließen" und ihre Spalten sind in der Übersicht
    // ausgeblendet – eine neue Spalte dort wäre unsichtbar. Eine bereits
    // zugeordnete Kategorie bleibt wählbar, damit sie beim Bearbeiten einer
    // Altspalte nicht stillschweigend wechselt.
    const benutzbar = kats.filter((c) => Calc.istNotenKategorie(c) &&
      (c.quelle !== "mitarbeit" || (vorhanden && vorhanden.kategorieId === c.id)));
    if (!benutzbar.length) {
      UI.toast("Erst eine Kategorie anlegen (z. B. „Klassenarbeit“)");
      return;
    }
    const data = isNew
      ? Store.neueLeistung(k.id, { kategorieId: benutzbar[0].id, quartal: hj === 2 ? 3 : 1 })
      : vorhanden;

    const body =
      UI.field("Bezeichnung", "titel", data.titel, {
        placeholder: "z. B. 2. Klassenarbeit", autofocus: true,
        hint: "Steht als Spaltenkopf über der Note."
      }) +
      '<div class="form-row">' +
        UI.field("Kategorie", "kategorieId", data.kategorieId, { type: "select",
          options: benutzbar.map((c) => ({
            value: c.id,
            label: c.name + " (" + (c.art === "schriftlich" ? "schriftlich" : "sonstige") + ", Gew " + c.gewichtung + ")"
          })),
          hint: "Liefert Gewicht und Gruppe." }) +
        UI.field("Quartal", "quartal", data.quartal, { type: "select",
          options: [1, 2, 3, 4].map((q) => ({
            value: q,
            label: q + ". Quartal (" + Store.halbjahrAusQuartal(q) + ". Halbjahr)"
          })),
          hint: "Bestimmt die Epochalnote." }) +
      "</div>" +
      UI.field("Datum", "datum", data.datum, { type: "date" });

    const buttons = [{ label: "Abbrechen" }];
    if (!isNew) {
      buttons.push({ label: "Spalte löschen", className: "danger", onClick: async (close) => {
        const ok = await UI.confirmDialog("Spalte löschen?",
          "Die Spalte „" + (data.titel || "ohne Titel") + "“ und alle darin erfassten Noten werden gelöscht.");
        if (!ok) return;
        await Store.Leistungen.remove(data.id);
        close(); render();
      }});
    }
    buttons.push({ label: isNew ? "Anlegen" : "Speichern", className: "primary", onClick: async (close, box) => {
      const v = UI.formValues(box);
      const quartal = parseInt(v.quartal, 10) || 1;
      Object.assign(data, {
        titel: v.titel.trim(),
        kategorieId: v.kategorieId,
        quartal,
        datum: v.datum || Store.datumLokal()
      });
      await Store.Leistungen.save(data);
      // Noten der Spalte folgen ihr (Quartal/Kategorie/Datum sind Spalten-Sache)
      const noten = await DB.getAllByIndex("noten", "leistungId", data.id);
      noten.forEach((n) => {
        n.kategorieId = data.kategorieId;
        n.quartal = quartal;
        n.halbjahr = Store.halbjahrAusQuartal(quartal);
        n.titel = data.titel;
        n.datum = data.datum;
      });
      if (noten.length) await DB.bulkPut("noten", noten);
      // Beim Anlegen ins Halbjahr der neuen Spalte wechseln, damit sie sichtbar ist
      state.notenHalbjahr = String(Store.halbjahrAusQuartal(quartal));
      close(); render();
    }});

    UI.modal({ title: isNew ? "Neue Spalte" : "Spalte bearbeiten", bodyHTML: body, buttons });
  }

  // Rechenweg eines Halbjahres. Zusätzlich lässt sich hier die aus dem
  // Mitarbeit-Tab übertragene Note je Quartal korrigieren – in der
  // Notenübersicht hat sie bewusst keine eigene Spalte mehr.
  async function studentDetailDialog(k, sid) {
    const s = await Store.Schueler.get(sid);
    const [kats, notenAll, leistungen] = await Promise.all([
      Store.Kategorien.byKlasse(k.id), Store.Noten.byKlasse(k.id), Store.Leistungen.byKlasse(k.id)
    ]);
    const mss = Calc.istMSS(k);
    const hj = halbjahrFilter();
    const hjErg = Calc.halbjahrErgebnis(kats, notenAll.filter((n) => n.schuelerId === sid), k, hj, mss);

    const mitarbeitKats = kats.filter(Calc.istMitarbeitsKategorie);
    const quartale = hj === 2 ? [3, 4] : [1, 2];
    let mitarbeitHTML = "";
    if (mitarbeitKats.length) {
      const katIds = mitarbeitKats.map((c) => c.id);
      const felder = quartale.map((q) => {
        const leistung = leistungen.find((l) => l.quartal === q && katIds.indexOf(l.kategorieId) !== -1);
        const note = leistung
          ? notenAll.find((n) => n.leistungId === leistung.id && n.schuelerId === sid)
          : null;
        const wert = note && note.wert !== null && note.wert !== undefined ? Calc.formatTendenz(note.wert, mss) : "";
        return '<div class="field"><label for="mn-' + q + '">' + q + ". Quartal</label>" +
          '<input id="mn-' + q + '" data-q="' + q + '" inputmode="' + (mss ? "numeric" : "text") + '" value="' +
          UI.esc(wert) + '" placeholder="' + (mss ? "0–15" : "leer = keine Note") + '"></div>';
      }).join("");
      mitarbeitHTML =
        '<div class="grp"><h3>Mitarbeitsnote je Quartal</h3>' +
        '<p class="hint">Kommt aus „Quartal abschließen“ im Reiter Mitarbeit und zählt in die Epochalnote. ' +
        "Hier kannst du sie korrigieren; leer speichern entfernt die Note.</p>" +
        '<div class="form-row">' + felder + "</div></div>";
    }

    const buttons = [{ label: "Schließen", className: mitarbeitKats.length ? "" : "primary" }];
    if (mitarbeitKats.length) {
      buttons.push({ label: "Mitarbeitsnoten speichern", className: "primary", onClick: async (close, box) => {
        const kategorieId = mitarbeitKats[0].id;
        for (const q of quartale) {
          const inp = box.querySelector('[data-q="' + q + '"]');
          if (!inp) continue;
          const text = inp.value.trim();
          const wert = text === "" ? null : Calc.parseNote(text, mss);
          if (text !== "" && wert === null) {
            UI.toast("Ungültige Note im " + q + ". Quartal");
            return; // Abbruch ohne Änderung
          }
          const katIds = mitarbeitKats.map((c) => c.id);
          const vorhanden = leistungen.find((l) => l.quartal === q && katIds.indexOf(l.kategorieId) !== -1);
          if (!vorhanden && wert === null) continue; // nichts zu tun
          const leistung = vorhanden || await Store.leistungFuer(k.id, kategorieId, q,
            "Mitarbeit " + q + ". Quartal", Store.datumLokal());
          await Store.Noten.setzeZelle(leistung, sid, wert);
        }
        close(); render();
        UI.toast("Mitarbeitsnoten gespeichert");
      }});
    }

    UI.modal({ title: UI.vollerName(s), bodyHTML: breakdownHTML(hjErg, mss) + mitarbeitHTML, buttons });
  }


  Object.assign(global.Views, { TabNoten, notenKontext, notenZeilenInhalt, leistungDialog, studentDetailDialog });
})(window);
