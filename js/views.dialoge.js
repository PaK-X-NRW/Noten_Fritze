/* =========================================================================
   views.dialoge.js – Modale Dialoge (Klasse, Schüler, Kategorie, Noten,
   Sitzplatz, CSV-Import, Backup-Import, Quartal-Abschluss, Klassen-Import)
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    state, go, render, quartalFilter, halbjahrFilter, breakdownHTML,
    schwellenFelderHTML, schwellenAusFormular, auswertungKontext, mitarbeitNotenVonQuartal
  } = global.Views;

  // =========================================================================
  //  AKTIONEN (Dialoge & Handler)
  // =========================================================================

  // ---- Klasse anlegen/bearbeiten ------------------------------------------
  function klasseDialog(k) {
    const isNew = !k;
    const data = k || Store.neueKlasse();
    // Voreinstellung der Anteile je Fachtyp aus den Einstellungen (z. B. „50/50")
    const anteilText = (typ) => {
      const a = state.settings.anteile[typ];
      return a.schriftlich + "/" + a.sonstige;
    };
    const body =
      UI.field("Klassenname", "name", data.name, { placeholder: "z. B. 8b", autofocus: true }) +
      '<div class="form-row">' +
        UI.field("Schuljahr", "schuljahr", data.schuljahr, { placeholder: "2025/26" }) +
        UI.field("Fach", "fach", data.fach, { placeholder: "Mathematik" }) +
      "</div>" +
      UI.field("Fachtyp", "typ", data.typ, { type: "select", options: [
        { value: "hauptfach", label: "Hauptfach (Standard " + anteilText("hauptfach") + ")" },
        { value: "nebenfach", label: "Nebenfach (Standard " + anteilText("nebenfach") + ")" }
      ], hint: "Bestimmt die Voreinstellung der Anteile schriftlich/sonstige." }) +
      UI.field("Klassenstufe", "klassenstufe", data.klassenstufe == null ? "" : data.klassenstufe, { type: "select", options: [
        { value: "", label: "– (Sekundarstufe I)" }
      ].concat([5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => ({ value: n, label: String(n) }))),
        hint: "Ab Klassenstufe 11 werden Noten als MSS-Punkte (0–15) statt Schulnoten erfasst." }) +
      UI.field("Notizen", "notizen", data.notizen, { type: "textarea", placeholder: "optional" });
    UI.modal({
      title: isNew ? "Neue Klasse" : "Klasse bearbeiten",
      bodyHTML: body,
      buttons: [
        { label: "Abbrechen" },
        { label: "Speichern", className: "primary", onClick: async (close, box) => {
          const v = UI.formValues(box);
          if (!v.name.trim()) { UI.toast("Bitte Klassennamen eingeben"); return; }
          const typWechsel = data.typ !== v.typ;
          const mssVorher = Calc.istMSS(data);
          const klassenstufeNeu = v.klassenstufe ? parseInt(v.klassenstufe, 10) : null;
          Object.assign(data, {
            name: v.name.trim(), schuljahr: v.schuljahr.trim(), fach: v.fach.trim(), typ: v.typ,
            klassenstufe: klassenstufeNeu, notizen: v.notizen
          });
          if (isNew || typWechsel) {
            const a = state.settings.anteile[v.typ];
            data.anteilSchriftlich = a.schriftlich; data.anteilSonstige = a.sonstige;
          }
          await Store.Klassen.save(data);
          close();
          if (!isNew && mssVorher !== Calc.istMSS(data)) {
            UI.toast("Achtung: Vorhandene Noten bleiben unverändert und werden nun als " +
              (Calc.istMSS(data) ? "MSS-Punkte" : "Schulnoten") + " interpretiert.");
          }
          if (isNew) { await go("klasse", { klasseId: data.id, tab: "schueler" }); }
          else render();
        }}
      ]
    });
  }

  function splitsDialog(k) {
    const body =
      '<p class="muted">Wie stark zählen schriftliche gegenüber sonstigen Leistungen?</p>' +
      '<div class="form-row">' +
        UI.field("Schriftlich (%)", "s", k.anteilSchriftlich, { type: "number", inputmode: "numeric" }) +
        UI.field("Sonstige (%)", "o", k.anteilSonstige, { type: "number", inputmode: "numeric" }) +
      "</div>";
    UI.modal({ title: "Anteile schriftlich / sonstige", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: "Speichern", className: "primary", onClick: async (close, box) => {
        const v = UI.formValues(box);
        k.anteilSchriftlich = Math.max(0, parseInt(v.s, 10) || 0);
        k.anteilSonstige = Math.max(0, parseInt(v.o, 10) || 0);
        await Store.Klassen.save(k); close(); render();
      }}
    ]});
  }

  // ---- Notenschwellen der Klasse -------------------------------------------
  // Eigene Schwellen überschreiben die globale Einstellung; ausgeschaltet
  // rechnet die Klasse wieder mit den Werten aus den Einstellungen.
  function schwellenDialog(k) {
    const eigene = !!(Array.isArray(k.mitarbeitSchwellen) && k.mitarbeitSchwellen.length);
    const werte = eigene ? k.mitarbeitSchwellen : state.settings.mitarbeitSchwellen;
    const body =
      '<p class="muted">Die Punkte einer einzelnen Stunde werden über diese Schwellen in eine Stundennote übersetzt; die Mitarbeitsnote ist der Ø aller Stundennoten.</p>' +
      '<div class="field"><label class="hstack"><input type="checkbox" id="schwellen-eigene" style="width:auto;min-height:auto"' +
        (eigene ? " checked" : "") + "> Eigene Schwellen für diese Klasse verwenden</label>" +
        '<div class="hint">Aus = globale Einstellung. Beim Einschalten werden die globalen Werte als Startpunkt übernommen.</div></div>' +
      '<div id="schwellen-felder">' + schwellenFelderHTML(werte) + "</div>";
    UI.modal({
      title: "Notenschwellen · " + k.name,
      bodyHTML: body,
      onMount: (box) => {
        const cb = box.querySelector("#schwellen-eigene");
        const felder = box.querySelector("#schwellen-felder");
        const sync = () => {
          felder.style.opacity = cb.checked ? "1" : ".45";
          UI.$all("[data-schwelle]", felder).forEach((inp) => { inp.disabled = !cb.checked; });
        };
        cb.addEventListener("change", sync);
        sync();
      },
      buttons: [
        { label: "Abbrechen" },
        { label: "Speichern", className: "primary", onClick: async (close, box) => {
          const eigeneJetzt = box.querySelector("#schwellen-eigene").checked;
          const liste = eigeneJetzt ? schwellenAusFormular(box) : null;
          if (eigeneJetzt && !liste.length) { UI.toast("Bitte mindestens eine Schwelle angeben"); return; }
          k.mitarbeitSchwellen = liste;
          await Store.Klassen.save(k);
          close(); render();
          UI.toast(eigeneJetzt ? "Eigene Schwellen gespeichert" : "Globale Schwellen aktiv");
        }}
      ]
    });
  }

  // ---- Herleitung des Mitarbeits-Vorschlags --------------------------------
  // Macht sichtbar, wie aus den Stundennoten der Vorschlag (deren Ø) wird.
  async function mitarbeitHerleitungDialog(sid) {
    const k = await Store.Klassen.get(state.klasseId);
    const ktx = await auswertungKontext(k);
    const s = ktx.schueler.find((x) => x.id === sid);
    const a = ktx.ausw[sid];
    if (!s || !a) return;

    // Verteilung der Stundennoten; Verweigerungs-Stunden separat ausgewiesen
    const zaehlung = {};
    let verweigerungsStunden = 0;
    (a.stundenNoten || []).forEach((sn) => {
      if (sn.verweigerung) { verweigerungsStunden += 1; return; }
      zaehlung[sn.note] = (zaehlung[sn.note] || 0) + 1;
    });
    const stundennotenZeilen = (
      Object.keys(zaehlung).sort((x, y) => x - y).map((note) =>
        '<div class="line"><span>Note ' + note + '</span><span class="r">' + zaehlung[note] + "×</span></div>"
      ).join("") +
      (verweigerungsStunden
        ? '<div class="line"><span>Note 6 (Leistungsverweigerung)</span><span class="r">' + verweigerungsStunden + "×</span></div>"
        : "")
    ) || '<div class="line"><span class="muted">Keine Stunden im Zeitraum</span><span class="r">–</span></div>';

    const ereignisZeilen = Store.EVENT_TYPES.filter((t) => a.typen[t.id]).map((t) => {
      const anzahl = a.typen[t.id];
      const wert = state.settings.mitarbeitPunkte[t.id] || 0;
      return '<div class="line"><span>' + UI.esc(t.label) + ' <span class="muted">(' + anzahl + " × " +
        (wert > 0 ? "+" : "") + wert + ")</span></span>" +
        '<span class="r">' + (anzahl * wert > 0 ? "+" : "") + (anzahl * wert) + "</span></div>";
    }).join("") || '<div class="line"><span class="muted">Keine Ereignisse im Zeitraum</span><span class="r">0</span></div>';

    const haHinweis = state.settings.haModus === "note6"
      ? "Vergessene Hausaufgaben geben keine Punkte; je drei kommt eine zusätzliche Stundennote 6 in diesen Ø."
      : "Vergessene Hausaufgaben zählen als Minuspunkte in ihrer Stunde.";

    const body =
      '<div class="breakdown">' +
        '<div class="grp"><h3>Stundennoten</h3>' + stundennotenZeilen +
          '<div class="line"><span>Gezählte Stunden (anwesend)<span class="muted"> · Doppelstunde = 2</span></span><span class="r">' + a.stundenGezaehlt + "</span></div>" +
          '<div class="line"><span class="muted">davon mit Ereignis</span><span class="r muted">' + a.stundenMitEreignis + "</span></div>" +
        "</div>" +
        '<div class="grp"><h3>Erfasste Ereignisse</h3>' + ereignisZeilen + "</div>" +
        // In der Oberstufe zusätzlich der Weg zur Punktzahl: gerundete Note ->
        // offizielle Umrechnungstabelle -> MSS-Punkte (so wird auch vorbelegt).
        (Calc.istMSS(k) && a.notenvorschlag !== null && a.notenvorschlag !== undefined
          ? '<div class="grp"><h3>Umrechnung in MSS-Punkte</h3>' +
            '<div class="line"><span>Ø der Stundennoten</span><span class="r">' + Calc.formatNote(a.notenvorschlag, 1) + "</span></div>" +
            '<div class="line"><span>gerundete Note</span><span class="r">' +
              Calc.formatTendenz(Calc.tendenznote(a.notenvorschlag, false), false) + "</span></div>" +
            '<div class="line"><span class="muted">offizielle Tabelle (17 − Note × 3)</span><span class="r muted">→</span></div></div>' +
            '<div class="total"><span>Vorschlag in Punkten</span><span>' +
              Calc.noteZuMssPunkte(Calc.tendenznote(a.notenvorschlag, false)) + "</span></div>"
          : '<div class="total"><span>Ø der Stundennoten</span><span>' + Calc.formatNote(a.notenvorschlag, 1) + "</span></div>") +
      "</div>" +
      '<p class="muted">Nur ein Vorschlag – ' + haHinweis +
        " Tage mit gemeldeter Abwesenheit sind herausgerechnet.</p>";

    UI.modal({ title: "Mitarbeit · " + UI.vollerName(s), bodyHTML: body, buttons: [{ label: "Schließen", className: "primary" }] });
  }

  // ---- Schüler anlegen/bearbeiten -----------------------------------------
  function schuelerDialog(k, s) {
    const isNew = !s;
    const data = s || Store.neuerSchueler(k.id);
    const body =
      '<div class="form-row">' +
        UI.field("Vorname", "vorname", data.vorname, { autofocus: true }) +
        UI.field("Nachname", "nachname", data.nachname) +
      "</div>" +
      UI.field("Bemerkung", "bemerkung", data.bemerkung, { type: "textarea", placeholder: "optional" });
    UI.modal({ title: isNew ? "Neue/r Schüler/in" : "Bearbeiten", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: isNew ? "Anlegen" : "Speichern", className: "primary", onClick: async (close, box) => {
        const v = UI.formValues(box);
        if (!v.vorname.trim() && !v.nachname.trim()) { UI.toast("Bitte Namen eingeben"); return; }
        if (isNew) {
          const list = await Store.Schueler.byKlasse(k.id);
          data.sortIndex = list.length;
        }
        Object.assign(data, { vorname: v.vorname.trim(), nachname: v.nachname.trim(), bemerkung: v.bemerkung });
        await Store.Schueler.save(data); close(); render();
      }}
    ]});
  }

  // ---- Kategorie anlegen/bearbeiten ---------------------------------------
  function kategorieDialog(k, c) {
    const isNew = !c;
    const data = c || Store.neueKategorie(k.id);
    const body =
      UI.field("Name der Kategorie", "name", data.name, { placeholder: "z. B. Klassenarbeit", autofocus: true }) +
      '<div class="form-row">' +
        UI.field("Art", "art", data.art, { type: "select", options: [
          { value: "schriftlich", label: "Schriftliche Leistung" },
          { value: "sonstige", label: "Sonstige Leistung" }
        ]}) +
        UI.field("Gewichtung", "gewichtung", data.gewichtung, { type: "number", inputmode: "decimal", hint: "relativ innerhalb der Art" }) +
      "</div>" +
      UI.field("Anzeige in der Notenübersicht", "anzeige", data.anzeige || "note", { type: "select", options: [
        { value: "note", label: "Note (zählt in die Gesamtnote)" },
        { value: "fehlendeHA", label: "Anzahl vergessener Hausaufgaben (zählt nicht)" }
      ], hint: "Bei der Zählung wird die Gewichtung ignoriert; die Zahl kommt aus dem Tracker." }) +
      UI.field("Herkunft der Noten", "quelle", data.quelle || "manuell", { type: "select", options: [
        { value: "manuell", label: "Von Hand in der Notenübersicht" },
        { value: "mitarbeit", label: "Mitarbeitsnote (aus „Quartal abschließen“)" }
      ], hint: "Bei „Mitarbeitsnote“ bleibt die Epochalnote eines Quartals leer, " +
        "bis die Note aus dem Mitarbeit-Tab übertragen wurde." });
    UI.modal({ title: isNew ? "Neue Kategorie" : "Kategorie bearbeiten", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: isNew ? "Anlegen" : "Speichern", className: "primary", onClick: async (close, box) => {
        const v = UI.formValues(box);
        if (!v.name.trim()) { UI.toast("Bitte Namen eingeben"); return; }
        if (isNew) { const list = await Store.Kategorien.byKlasse(k.id); data.sortIndex = list.length; }
        Object.assign(data, {
          name: v.name.trim(), art: v.art,
          anzeige: v.anzeige === "fehlendeHA" ? "fehlendeHA" : "note",
          quelle: v.quelle === "mitarbeit" ? "mitarbeit" : "manuell",
          gewichtung: Math.max(0, parseFloat(String(v.gewichtung).replace(",", ".")) || 0)
        });
        await Store.Kategorien.save(data); close(); render();
      }}
    ]});
  }

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

  // ---- Sitzplatz zuweisen --------------------------------------------------
  async function seatAssignDialog(k, seatId) {
    const [plan, schueler] = await Promise.all([Store.Sitzplan.get(k.id), Store.Schueler.byKlasse(k.id)]);
    const seat = plan.seats.find((x) => x.id === seatId);
    const belegtIds = new Set(plan.seats.filter((x) => x.schuelerId).map((x) => x.schuelerId));
    const options = schueler.map((s) => {
      const anderswo = belegtIds.has(s.id) && s.id !== seat.schuelerId;
      return '<button class="btn" data-pick="' + s.id + '"' + (anderswo ? ' style="opacity:.5"' : "") + ">" +
        UI.esc(UI.vollerName(s)) + (anderswo ? " (belegt)" : "") + "</button>";
    }).join("");
    const body =
      '<div class="disc-picker">' + options + "</div>" +
      '<div class="spacer"></div>' +
      (seat.schuelerId ? '<button class="btn danger" id="seat-clear" style="width:100%">Platz freimachen</button>' : "");
    const m = UI.modal({ title: "Platz belegen", bodyHTML: body, buttons: [{ label: "Abbrechen" }] });
    UI.$all("[data-pick]", m.box).forEach((b) => b.addEventListener("click", async () => {
      const sid = b.getAttribute("data-pick");
      plan.seats.forEach((x) => { if (x.schuelerId === sid) x.schuelerId = null; }); // vorher woanders entfernen
      seat.schuelerId = sid; // auf gewählten Platz setzen
      await Store.Sitzplan.save(plan); m.close(); render();
    }));
    const clr = m.box.querySelector("#seat-clear");
    if (clr) clr.addEventListener("click", async () => { seat.schuelerId = null; await Store.Sitzplan.save(plan); m.close(); render(); });
  }

  // ---- Sitzpläne (je Raum einer) --------------------------------------------
  // Neuer Plan: leeres Raster oder Kopie des gerade gezeigten Plans.
  async function sitzplanNeuDialog(k) {
    const aktuell = await Store.Sitzplan.get(k.id);
    const body =
      UI.field("Name (z. B. Raum)", "name", "", { placeholder: "z. B. Physikraum" }) +
      UI.field("Anlegen als", "vorlage", "leer", { type: "select", options: [
        { value: "leer", label: "Leeres Raster" },
        { value: "kopie", label: "Kopie von „" + aktuell.name + "“" }
      ] });
    UI.modal({
      title: "Neuer Sitzplan", bodyHTML: body,
      buttons: [
        { label: "Abbrechen" },
        { label: "Anlegen", className: "primary", onClick: async (close, box) => {
          const v = UI.formValues(box);
          const name = String(v.name || "").trim();
          if (!name) { UI.toast("Bitte einen Namen eingeben"); return; }
          await Store.Sitzplan.neu(k.id, name, v.vorlage === "kopie" ? aktuell : null);
          close(); render();
        }}
      ]
    });
  }
  async function sitzplanUmbenennenDialog(k) {
    const plan = await Store.Sitzplan.get(k.id);
    UI.modal({
      title: "Sitzplan umbenennen", bodyHTML: UI.field("Name", "name", plan.name),
      buttons: [
        { label: "Abbrechen" },
        { label: "Speichern", className: "primary", onClick: async (close, box) => {
          const name = String(UI.formValues(box).name || "").trim();
          if (!name) { UI.toast("Bitte einen Namen eingeben"); return; }
          plan.name = name;
          await Store.Sitzplan.save(plan);
          close(); render();
        }}
      ]
    });
  }

  // ---- CSV-Import Schüler ---------------------------------------------------
  function importStudentsDialog(k) {
    const body =
      '<p class="muted">CSV mit Spalten <strong>Vorname, Nachname</strong> (optional Bemerkung). Kopfzeile wird erkannt.</p>' +
      '<input type="file" id="csv-file" accept=".csv,text/csv">' +
      '<textarea id="csv-paste" placeholder="Mustermann, Max"></textarea>';
    const m = UI.modal({ title: "Schülerliste importieren", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: "Importieren", className: "primary", onClick: async (close, box) => {
        const file = box.querySelector("#csv-file").files[0];
        let liste = [];
        if (file) {
          const text = await file.text();
          liste = CSV.importSchueler(text);
        } else {
          const paste = box.querySelector("#csv-paste").value.trim();
          if (paste) liste = paste.split(/\n+/).map((line) => {
            line = line.trim(); if (!line) return null;
            if (line.includes(",")) { const [nach, vor] = line.split(","); return { vorname: (vor || "").trim(), nachname: (nach || "").trim(), bemerkung: "" }; }
            const parts = line.split(/\s+/); const vor = parts.shift(); return { vorname: vor, nachname: parts.join(" "), bemerkung: "" };
          }).filter(Boolean);
        }
        if (!liste.length) { UI.toast("Keine Daten gefunden"); return; }
        const existing = await Store.Schueler.byKlasse(k.id);
        let idx = existing.length;
        const neu = liste.map((r) => Store.neuerSchueler(k.id, { vorname: r.vorname, nachname: r.nachname, bemerkung: r.bemerkung, sortIndex: idx++ }));
        await DB.bulkPut("schueler", neu);
        close(); render(); UI.toast(neu.length + " Schüler/innen importiert");
      }}
    ]});
  }

  // ---- Backup Import -------------------------------------------------------
  function backupImportDialog() {
    const body =
      '<p class="muted">JSON-Backup wählen. Bestehende Daten können ersetzt oder ergänzt werden.</p>' +
      '<input type="file" id="bk-file" accept="application/json,.json">' +
      '<div class="field" style="margin-top:14px"><label class="hstack"><input type="checkbox" id="bk-replace" style="width:auto;min-height:auto"> Alle bestehenden Daten vorher löschen</label></div>';
    UI.modal({ title: "Backup importieren", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: "Importieren", className: "primary", onClick: async (close, box) => {
        const file = box.querySelector("#bk-file").files[0];
        if (!file) { UI.toast("Bitte Datei wählen"); return; }
        try {
          const data = JSON.parse(await file.text());
          const replace = box.querySelector("#bk-replace").checked;
          await Store.importAll(data, { replace });
          close(); await go("home"); UI.toast("Backup importiert");
        } catch (e) { UI.toast("Fehler: " + e.message); }
      }}
    ]});
  }

  // ---- Quartal abschließen -------------------------------------------------
  // Überträgt die Mitarbeits-Vorschläge des im Auswertungs-Tab gewählten
  // Quartals als Noten in eine Ziel-Kategorie und markiert das Quartal an der
  // Klasse als abgeschlossen. Stunden und Ereignisse bleiben erhalten (der
  // Mitarbeit-Tab zeigt sie dann grau); der Abschluss ist dort aufhebbar.
  async function quartalAbschliessenDialog() {
    const q = quartalFilter("auswertungQuartal");
    if (q === null) { UI.toast("Bitte oben ein Quartal wählen"); return; }
    const k = await Store.Klassen.get(state.klasseId);
    if (!k) return;
    const mss = Calc.istMSS(k);
    // Schon übertragene Mitarbeitsnoten dieses Quartals haben Vorrang vor dem
    // Vorschlag, damit ein zweiter Abschluss eine korrigierte Note nicht
    // versehentlich mit dem Rohwert überschreibt.
    const [ktx, kategorien, bereitsUebertragen] = await Promise.all([
      auswertungKontext(k), Store.Kategorien.byKlasse(k.id), mitarbeitNotenVonQuartal(k, q)
    ]);
    const schuelerListe = ktx.schueler;
    const schonNoten = Object.keys(bereitsUebertragen).length;

    // Ziel-Kategorien: sonstige Leistungen mit Noten-Anzeige; "" = neu anlegen
    const ziele = kategorien.filter((c) => c.art === "sonstige" && Calc.istNotenKategorie(c));
    const vorgabe = ziele.find((c) => (c.name || "").trim().toLowerCase() === "mündliche mitarbeit");
    const katSelect =
      '<div class="field"><label for="qa-kategorie">Ziel-Kategorie für die übertragenen Noten</label>' +
      '<select id="qa-kategorie">' +
        '<option value="">„Mündliche Mitarbeit“ neu anlegen (Gewichtung 2)</option>' +
        ziele.map((c) => '<option value="' + c.id + '"' + (vorgabe && c.id === vorgabe.id ? " selected" : "") + ">" +
          UI.esc(c.name) + "</option>").join("") +
      "</select>" +
      (ziele.length ? "" : '<div class="hint">Es gibt noch keine sonstige Noten-Kategorie – „Mündliche Mitarbeit“ (Gewichtung 2) wird neu angelegt.</div>') +
      "</div>";

    const zeilen = schuelerListe.map((s) => {
      const a = ktx.ausw[s.id];
      const vorschlag = a ? a.notenvorschlag : null;
      const hatV = vorschlag !== null && vorschlag !== undefined;
      const schon = bereitsUebertragen[s.id];
      // Vorbelegung: bereits übertragene Note > umgerechneter Vorschlag.
      // In der Oberstufe läuft der Vorschlag über die offizielle Umrechnung
      // Note -> MSS-Punkte (Calc.noteZuMssPunkte).
      const ausVorschlag = !hatV ? "" : (mss
        ? String(Calc.noteZuMssPunkte(Calc.tendenznote(vorschlag, false)))
        : Calc.formatTendenz(Calc.tendenznote(vorschlag, false), false));
      const vorbelegt = schon !== undefined ? Calc.formatTendenz(schon, mss) : ausVorschlag;
      return "<tr>" +
        "<td><strong>" + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
        '<td class="num">' + (hatV
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(vorschlag) + '">' + Calc.formatNote(vorschlag, 1) + "</span>"
          : "–") + "</td>" +
        // Vorgeschlagen wird eine echte Note (2+, 3, 4-), nicht der rohe Ø –
        // sonst stünde in der Notenübersicht eine Dezimalzahl wie „2,8".
        '<td><input data-sid="' + s.id + '" inputmode="' + (mss ? "numeric" : "text") + '" style="width:90px" value="' +
          UI.esc(vorbelegt) + '" placeholder="' + (mss ? "0–15" : "–") + '"></td>' +
      "</tr>";
    }).join("");

    const body =
      '<p class="muted">' + (mss
        ? "MSS-Punkte (0–15) für das " + q + ". Quartal. Vorbelegt ist der Stundennoten-Ø, " +
          "über die offizielle Tabelle in Punkte umgerechnet (2 = 11, 3+ = 9, 4- = 4 …)."
        : "Mitarbeits-Vorschläge des " + q + ". Quartals als Noten übertragen. Vorbelegt ist der auf " +
          "eine Note gerundete Ø (2+, 3, 4-); die Spalte „Vorschlag“ zeigt den genauen Wert.") +
        " Leer lassen = kein Übertrag für diese/n Schüler/in.</p>" +
      (schonNoten
        ? '<p class="hint">Für dieses Quartal sind bereits ' + schonNoten + " Noten übertragen – " +
          "die Felder sind mit diesen Noten vorbelegt, nicht mit dem Vorschlag.</p>"
        : "") +
      katSelect +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th class="num">' + (mss ? "Stundennoten-Ø" : "Vorschlag") + '</th><th>' +
        (mss ? "Punkte" : "Note") + "</th></tr></thead>" +
      "<tbody>" + zeilen + "</tbody></table></div>";

    // Aktuell eingetragene Werte der Eingabefelder einsammeln
    function eingetraegeneWerte(box) {
      return UI.$all("input[data-sid]", box).map((inp) => ({
        schuelerId: inp.getAttribute("data-sid"), wert: inp.value.trim()
      })).filter((e) => e.wert !== "");
    }

    UI.modal({
      title: q + ". Quartal abschließen · " + k.name,
      bodyHTML: body,
      buttons: [
        { label: "Abbrechen" },
        { label: "CSV: Noten", onClick: async (close, box) => {
          const eintraege = eingetraegeneWerte(box);
          if (!eintraege.length) { UI.toast("Keine Noten eingetragen"); return; }
          CSV.exportQuartalNoten(k, schuelerListe, eintraege, q); // bleibt offen
        }},
        { label: "CSV: Ereignisse", onClick: async () => {
          const alle = await Store.Ereignisse.byKlasse(k.id);
          CSV.exportEreignisse(k, schuelerListe, alle.filter((e) => e.quartal === q)); // bleibt offen
        }},
        { label: "Übertragen & abschließen", className: "danger", onClick: async (close, box) => {
          const felder = eingetraegeneWerte(box);
          let ungueltig = null;
          const eintraege = [];
          felder.forEach((f) => {
            const wert = Calc.parseNote(f.wert, mss);
            if (wert === null) ungueltig = f.schuelerId;
            else eintraege.push({ schuelerId: f.schuelerId, wert });
          });
          if (ungueltig) {
            const s = schuelerListe.find((x) => x.id === ungueltig);
            UI.toast("Ungültige Note bei " + (s ? UI.vollerName(s) : "einem Eintrag"));
            return; // Abbruch ohne Änderung
          }
          const kategorieWahl = box.querySelector("#qa-kategorie").value;
          const ok = await UI.confirmDialog("Quartal wirklich abschließen?",
            "Die eingetragenen Noten werden übertragen. Das " + q + ". Quartal wird danach gesperrt: " +
            "Stunden und Meldungen bleiben zur Ansicht erhalten, es lässt sich aber nichts mehr erfassen. " +
            "Aufheben kannst du das jederzeit im Reiter Mitarbeit.",
            { okLabel: "Übertragen & abschließen", danger: false });
          if (!ok) return;
          close();

          // Ziel-Kategorie: gewählte oder neu angelegte „Mündliche Mitarbeit“.
          // Sie wird als Mitarbeits-Kategorie markiert – daran erkennt die
          // Notenübersicht, dass die Epochalnote eines Quartals erst mit dieser
          // Note zustande kommt.
          let kategorieId = kategorieWahl;
          if (!kategorieId) {
            const kat = Store.neueKategorie(k.id, {
              name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2,
              anzeige: "note", quelle: "mitarbeit", sortIndex: kategorien.length
            });
            await Store.Kategorien.save(kat);
            kategorieId = kat.id;
          } else {
            const kat = kategorien.find((c) => c.id === kategorieId);
            if (kat && kat.quelle !== "mitarbeit") {
              kat.quelle = "mitarbeit";
              await Store.Kategorien.save(kat);
            }
          }
          // Alle übertragenen Noten landen in einer gemeinsamen Spalte des Quartals
          const leistung = await Store.leistungFuer(k.id, kategorieId, q,
            "Mitarbeit " + q + ". Quartal", Store.datumLokal());
          for (const e of eintraege) {
            await Store.Noten.setzeZelle(leistung, e.schuelerId, e.wert);
          }
          // Stunden und Ereignisse bleiben stehen – das Quartal wird nur als
          // abgeschlossen vermerkt und dadurch im Mitarbeit-Tab gesperrt.
          await Store.quartalAbschliessen(k, q, Store.datumLokal());
          UI.toast(eintraege.length + " Noten übertragen – Quartal abgeschlossen");
          render();
        }}
      ]
    });
  }

  // ---- Klassen-Import (JSON-Export einer einzelnen Klasse) ------------------
  function klassenImportDialog() {
    const body =
      '<p class="muted">JSON-Export einer einzelnen Klasse, z. B. von einer Kollegin/einem Kollegen.</p>' +
      '<input type="file" id="ki-file" accept="application/json,.json">';
    UI.modal({ title: "Klasse importieren", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: "Importieren", className: "primary", onClick: async (close, box) => {
        const file = box.querySelector("#ki-file").files[0];
        if (!file) { UI.toast("Bitte Datei wählen"); return; }
        let payload;
        try { payload = JSON.parse(await file.text()); }
        catch (e) { UI.toast("Fehler: " + e.message); return; }
        const klasseId = payload && payload.data && payload.data.klasse && payload.data.klasse.id;
        const vorhanden = klasseId ? await Store.Klassen.get(klasseId) : null;
        if (!vorhanden) {
          // ID unbekannt: "ersetzen" fällt im Store auf einen einfachen Import zurück
          await klassenImportAusfuehren(payload, "ersetzen", close);
          return;
        }
        // Zweiter Schritt: Ersetzen oder als Kopie importieren
        UI.modal({
          title: "Klasse existiert bereits",
          bodyHTML: '<p class="muted">Eine Klasse „' + UI.esc(vorhanden.name) +
            "“ mit derselben Kennung ist bereits vorhanden. „Ersetzen“ löscht die bestehende Klasse " +
            "und alle ihre Daten unwiderruflich.</p>",
          buttons: [
            { label: "Abbrechen" },
            { label: "Ersetzen", className: "danger", onClick: async (close2) => {
              await klassenImportAusfuehren(payload, "ersetzen", () => { close2(); close(); });
            }},
            { label: "Als Kopie importieren", className: "primary", onClick: async (close2) => {
              await klassenImportAusfuehren(payload, "kopie", () => { close2(); close(); });
            }}
          ]
        });
      }}
    ]});
  }

  async function klassenImportAusfuehren(payload, modus, close) {
    try {
      const importierte = await Store.importKlasse(payload, { modus });
      close();
      await go("klasse", { klasseId: importierte.id, tab: "schueler" });
      UI.toast("Klasse „" + importierte.name + "“ importiert");
    } catch (e) { UI.toast("Fehler: " + e.message); }
  }

  Object.assign(global.Views, {
    klasseDialog, splitsDialog, schuelerDialog, kategorieDialog, leistungDialog,
    studentDetailDialog, seatAssignDialog, sitzplanNeuDialog, sitzplanUmbenennenDialog,
    importStudentsDialog, backupImportDialog,
    schwellenDialog, mitarbeitHerleitungDialog,
    quartalAbschliessenDialog, klassenImportDialog
  });
})(window);
