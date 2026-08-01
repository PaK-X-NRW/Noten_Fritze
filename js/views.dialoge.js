/* =========================================================================
   views.dialoge.js – Modale Dialoge (Klasse, Schüler, Kategorie, Noten,
   Sitzplatz, CSV-Import, Backup-Import)
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render, hjFilter, breakdownHTML } = global.Views;

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
          Object.assign(data, { name: v.name.trim(), schuljahr: v.schuljahr.trim(), fach: v.fach.trim(), typ: v.typ, notizen: v.notizen });
          if (isNew || typWechsel) {
            const a = state.settings.anteile[v.typ];
            data.anteilSchriftlich = a.schriftlich; data.anteilSonstige = a.sonstige;
          }
          await Store.Klassen.save(data);
          close();
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
      "</div>";
    UI.modal({ title: isNew ? "Neue Kategorie" : "Kategorie bearbeiten", bodyHTML: body, buttons: [
      { label: "Abbrechen" },
      { label: isNew ? "Anlegen" : "Speichern", className: "primary", onClick: async (close, box) => {
        const v = UI.formValues(box);
        if (!v.name.trim()) { UI.toast("Bitte Namen eingeben"); return; }
        if (isNew) { const list = await Store.Kategorien.byKlasse(k.id); data.sortIndex = list.length; }
        Object.assign(data, { name: v.name.trim(), art: v.art, gewichtung: Math.max(0, parseFloat(String(v.gewichtung).replace(",", ".")) || 0) });
        await Store.Kategorien.save(data); close(); render();
      }}
    ]});
  }

  // ---- Zelle: Einzelnoten erfassen ----------------------------------------
  async function cellDialog(k, sid, cid) {
    const s = await Store.Schueler.get(sid);
    const c = await Store.Kategorien.get(cid);
    const alle = await Store.Noten.byKlasse(k.id);
    let noten = alle.filter((n) => n.schuelerId === sid && n.kategorieId === cid)
      .sort((a, b) => (a.datum < b.datum ? -1 : 1));

    function listHTML() {
      if (!noten.length) return '<p class="muted">Noch keine Noten.</p>';
      return noten.map((n) =>
        '<div class="line" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line)">' +
          '<span class="note-badge" style="background:' + Calc.noteFarbe(n.wert) + '">' + Calc.formatNote(n.wert) + "</span>" +
          '<span class="grow">' + UI.esc(n.titel || "") + ' <span class="muted">' + UI.esc(n.datum) +
            (n.halbjahr ? " · " + n.halbjahr + ". HJ" : "") + "</span></span>" +
          '<button class="iconbtn plain danger-text" data-del="' + n.id + '">🗑</button>' +
        "</div>"
      ).join("");
    }

    const body =
      '<p class="muted">' + UI.esc(UI.vollerName(s)) + " · " + UI.esc(c.name) + "</p>" +
      '<div id="note-list">' + listHTML() + "</div>" +
      '<div class="spacer"></div>' +
      '<div class="form-row" style="align-items:flex-end">' +
        '<div class="field grow" style="margin:0"><label>Neue Note</label><input id="new-note" inputmode="decimal" placeholder="z. B. 2 oder 2,3 oder 2+"></div>' +
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
      const val = Calc.parseNote(inp.value);
      if (val === null) { UI.toast("Bitte gültige Note 1–6 eingeben"); inp.focus(); return; }
      const titel = box.querySelector("#new-title").value.trim();
      const n = Store.neueNote({ klasseId: k.id, schuelerId: sid, kategorieId: cid, wert: val, titel,
        halbjahr: parseInt(state.settings.aktuellesHalbjahr, 10) || 1 });
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
    const res = Calc.berechneSchueler(kats, notenAll.filter((n) => n.schuelerId === sid), k, state.settings.rundung, hjFilter("notenHalbjahr"));
    UI.modal({ title: UI.vollerName(s), bodyHTML: breakdownHTML(res), buttons: [{ label: "Schließen", className: "primary" }] });
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

  Object.assign(global.Views, {
    klasseDialog, splitsDialog, schuelerDialog, kategorieDialog, cellDialog,
    studentDetailDialog, seatAssignDialog, importStudentsDialog, backupImportDialog
  });
})(window);
