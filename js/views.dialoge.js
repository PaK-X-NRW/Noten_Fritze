/* =========================================================================
   views.dialoge.js – Modale Dialoge (Klasse, Schüler, Kategorie, Noten,
   Sitzplatz, CSV-Import, Backup-Import, Quartal-Abschluss, Klassen-Import)
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    state, go, render, quartalFilter, breakdownHTML,
    schwellenFelderHTML, schwellenAusFormular, auswertungKontext
  } = global.Views;

  // =========================================================================
  //  AKTIONEN (Dialoge & Handler)
  // =========================================================================

  // ---- Klasse anlegen/bearbeiten ------------------------------------------
  function klasseDialog(k) {
    const isNew = !k;
    const data = k || Store.neueKlasse();
    const body =
      UI.field("Klassenname", "name", data.name, { placeholder: "z. B. 8b", autofocus: true }) +
      '<div class="form-row">' +
        UI.field("Schuljahr", "schuljahr", data.schuljahr, { placeholder: "2025/26" }) +
        UI.field("Fach", "fach", data.fach, { placeholder: "Mathematik" }) +
      "</div>" +
      UI.field("Fachtyp", "typ", data.typ, { type: "select", options: [
        { value: "hauptfach", label: "Hauptfach (Standard 50/50)" },
        { value: "nebenfach", label: "Nebenfach (Standard 40/60)" }
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
      ? "Vergessene Hausaufgaben geben keine Punkte; jede 3. erzeugt automatisch eine Note 6 in Mündliche Mitarbeit."
      : "Vergessene Hausaufgaben zählen als Minuspunkte in ihrer Stunde.";

    const body =
      '<div class="breakdown">' +
        '<div class="grp"><h3>Stundennoten</h3>' + stundennotenZeilen +
          '<div class="line"><span>Gehaltene Stunden (anwesend)</span><span class="r">' + a.stundenGezaehlt + "</span></div>" +
          '<div class="line"><span class="muted">davon mit Ereignis</span><span class="r muted">' + a.stundenMitEreignis + "</span></div>" +
        "</div>" +
        '<div class="grp"><h3>Erfasste Ereignisse</h3>' + ereignisZeilen + "</div>" +
        '<div class="total"><span>Ø der Stundennoten</span><span>' + Calc.formatNote(a.notenvorschlag, 1) + "</span></div>" +
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
      ], hint: "Bei der Zählung wird die Gewichtung ignoriert; die Zahl kommt aus dem Tracker." });
    UI.modal({ title: isNew ? "Neue Kategorie" : "Kategorie bearbeiten", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: isNew ? "Anlegen" : "Speichern", className: "primary", onClick: async (close, box) => {
        const v = UI.formValues(box);
        if (!v.name.trim()) { UI.toast("Bitte Namen eingeben"); return; }
        if (isNew) { const list = await Store.Kategorien.byKlasse(k.id); data.sortIndex = list.length; }
        Object.assign(data, {
          name: v.name.trim(), art: v.art,
          anzeige: v.anzeige === "fehlendeHA" ? "fehlendeHA" : "note",
          gewichtung: Math.max(0, parseFloat(String(v.gewichtung).replace(",", ".")) || 0)
        });
        await Store.Kategorien.save(data); close(); render();
      }}
    ]});
  }

  // ---- Zelle: Einzelnoten erfassen ----------------------------------------
  async function cellDialog(k, sid, cid) {
    const mss = Calc.istMSS(k);
    const s = await Store.Schueler.get(sid);
    const c = await Store.Kategorien.get(cid);
    const alle = await Store.Noten.byKlasse(k.id);
    let noten = alle.filter((n) => n.schuelerId === sid && n.kategorieId === cid)
      .sort((a, b) => (a.datum < b.datum ? -1 : 1));

    function listHTML() {
      if (!noten.length) return '<p class="muted">Noch keine Noten.</p>';
      return noten.map((n) =>
        '<div class="line" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line)">' +
          '<span class="note-badge" style="background:' + Calc.noteFarbe(n.wert, mss) + '">' + Calc.formatNote(n.wert) + "</span>" +
          '<span class="grow">' + UI.esc(n.titel || "") + ' <span class="muted">' + UI.esc(n.datum) +
            (n.quartal ? " · " + n.quartal + ". Q" : (n.halbjahr ? " · " + n.halbjahr + ". HJ" : "")) + "</span></span>" +
          '<button class="iconbtn plain danger-text" data-del="' + n.id + '">🗑</button>' +
        "</div>"
      ).join("");
    }

    const body =
      '<p class="muted">' + UI.esc(UI.vollerName(s)) + " · " + UI.esc(c.name) + "</p>" +
      '<div id="note-list">' + listHTML() + "</div>" +
      '<div class="spacer"></div>' +
      '<div class="form-row" style="align-items:flex-end">' +
        '<div class="field grow" style="margin:0"><label>Neue ' + (mss ? "Punktzahl" : "Note") + '</label><input id="new-note" inputmode="' +
          (mss ? "numeric" : "decimal") + '" placeholder="' + (mss ? "0 bis 15" : "z. B. 2 oder 2,3 oder 2+") + '"></div>' +
        '<div class="field" style="margin:0;flex:1"><label>Titel (optional)</label><input id="new-title" placeholder="' + UI.esc(c.name) + '"></div>' +
      "</div>" +
      '<button class="btn primary" id="add-note" style="width:100%">Note hinzufügen</button>';

    const m = UI.modal({ title: "Noten erfassen", bodyHTML: body, dismissible: true,
      buttons: [{ label: "Fertig", className: "primary" }],
      onClose: () => render()
    });

    const box = m.box;
    function refresh() { box.querySelector("#note-list").innerHTML = listHTML(); wireDeletes(); }
    function wireDeletes() {
      UI.$all("[data-del]", box).forEach((b) => b.addEventListener("click", async () => {
        const id = b.getAttribute("data-del");
        await Store.Noten.remove(id);
        noten = noten.filter((n) => n.id !== id);
        refresh();
      }));
    }
    async function addNote() {
      const inp = box.querySelector("#new-note");
      const val = Calc.parseNote(inp.value, mss);
      if (val === null) { UI.toast(mss ? "Bitte gültige Punktzahl 0–15 eingeben" : "Bitte gültige Note 1–6 eingeben"); inp.focus(); return; }
      const titel = box.querySelector("#new-title").value.trim();
      const quartal = parseInt(state.settings.aktuellesQuartal, 10) || 1;
      const n = Store.neueNote({ klasseId: k.id, schuelerId: sid, kategorieId: cid, wert: val, titel,
        quartal, halbjahr: Store.halbjahrAusQuartal(quartal) });
      await Store.Noten.save(n);
      noten.push(n);
      inp.value = ""; box.querySelector("#new-title").value = "";
      refresh(); inp.focus();
    }
    box.querySelector("#add-note").addEventListener("click", addNote);
    box.querySelector("#new-note").addEventListener("keydown", (e) => { if (e.key === "Enter") addNote(); });
    wireDeletes();
  }

  async function studentDetailDialog(k, sid) {
    const s = await Store.Schueler.get(sid);
    const [kats, notenAll] = await Promise.all([Store.Kategorien.byKlasse(k.id), Store.Noten.byKlasse(k.id)]);
    const res = Calc.berechneSchueler(kats, notenAll.filter((n) => n.schuelerId === sid), k, state.settings.rundung, quartalFilter("notenQuartal"));
    UI.modal({ title: UI.vollerName(s), bodyHTML: breakdownHTML(res, Calc.istMSS(k)), buttons: [{ label: "Schließen", className: "primary" }] });
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
  // Quartals als Noten in eine Ziel-Kategorie und löscht danach alle
  // Mitarbeits-Ereignisse und Stunden dieses Quartals (Abwesenheiten bleiben).
  async function quartalAbschliessenDialog() {
    const q = quartalFilter("auswertungQuartal");
    if (q === null) { UI.toast("Bitte oben ein Quartal wählen"); return; }
    const k = await Store.Klassen.get(state.klasseId);
    if (!k) return;
    const mss = Calc.istMSS(k);
    const [ktx, kategorien] = await Promise.all([auswertungKontext(k), Store.Kategorien.byKlasse(k.id)]);
    const schuelerListe = ktx.schueler;

    // Ziel-Kategorien: sonstige Leistungen mit Noten-Anzeige; "" = neu anlegen
    const ziele = kategorien.filter((c) => c.art === "sonstige" && (c.anzeige || "note") === "note");
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
      return "<tr>" +
        "<td><strong>" + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
        '<td class="num">' + (hatV
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(vorschlag) + '">' + Calc.formatNote(vorschlag, 1) + "</span>"
          : "–") + "</td>" +
        '<td><input data-sid="' + s.id + '" inputmode="' + (mss ? "numeric" : "decimal") + '" style="width:90px" value="' +
          (mss ? "" : (hatV ? Calc.formatNote(vorschlag, 1) : "")) + '" placeholder="' + (mss ? "0–15" : "–") + '"></td>' +
      "</tr>";
    }).join("");

    const body =
      '<p class="muted">' + (mss
        ? "MSS-Punkte (0–15) für das " + q + ". Quartal eintragen. Die Stundennoten-Ø dient nur zur Orientierung."
        : "Mitarbeits-Vorschläge des " + q + ". Quartals als Noten übertragen. Tendenzen wie 2+ oder 3- sind erlaubt.") +
        " Leer lassen = kein Übertrag für diese/n Schüler/in.</p>" +
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
          // Werte VOR dem Confirm-Dialog einsammeln und prüfen – UI.confirmDialog
          // leert den modal-root komplett (auch dieses Modal).
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
            "Die eingetragenen Noten werden übertragen. Danach werden alle Mitarbeits-Ereignisse und Stunden des " + q +
            ". Quartals dieser Klasse endgültig gelöscht. Vorher ggf. CSV exportieren.",
            { okLabel: "Übertragen & löschen" });
          if (!ok) return;

          // Ziel-Kategorie: gewählte oder neu angelegte „Mündliche Mitarbeit“
          let kategorieId = kategorieWahl;
          if (!kategorieId) {
            const kat = Store.neueKategorie(k.id, {
              name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2,
              anzeige: "note", sortIndex: kategorien.length
            });
            await Store.Kategorien.save(kat);
            kategorieId = kat.id;
          }
          const datum = Store.datumLokal();
          for (const e of eintraege) {
            await Store.Noten.save(Store.neueNote({
              klasseId: k.id, schuelerId: e.schuelerId, kategorieId, wert: e.wert,
              titel: "Mündliche Mitarbeit " + q + ". Quartal",
              quartal: q, halbjahr: Store.halbjahrAusQuartal(q), datum
            }));
          }
          const [ereignisse, stunden] = await Promise.all([
            Store.Ereignisse.byKlasse(k.id), Store.Stunden.byKlasse(k.id)
          ]);
          for (const ev of ereignisse.filter((x) => x.quartal === q)) await Store.Ereignisse.remove(ev.id);
          for (const st of stunden.filter((x) => x.quartal === q)) await DB.del("stunden", st.id);
          // Das Modal ist durch den Confirm-Dialog bereits geschlossen.
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
              await klassenImportAusfuehren(payload, "ersetzen", close2);
            }},
            { label: "Als Kopie importieren", className: "primary", onClick: async (close2) => {
              await klassenImportAusfuehren(payload, "kopie", close2);
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
    klasseDialog, splitsDialog, schuelerDialog, kategorieDialog, cellDialog,
    studentDetailDialog, seatAssignDialog, importStudentsDialog, backupImportDialog,
    schwellenDialog, mitarbeitHerleitungDialog,
    quartalAbschliessenDialog, klassenImportDialog
  });
})(window);
