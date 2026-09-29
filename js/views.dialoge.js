/* =========================================================================
   views.dialoge.js – Allgemeine Dialoge (Klasse, Anteile, Schüler,
   Kategorie, CSV-Import, Backup-Import, Klassen-Import). Dialoge eines
   Reiters liegen bei ihm (views.noten/sitzplan/mitarbeit.js).
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render } = global.Views;

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
        await Store.Schueler.saveAlle(neu);
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
    klasseDialog, splitsDialog, schuelerDialog, kategorieDialog,
    importStudentsDialog, backupImportDialog, klassenImportDialog
  });
})(window);
