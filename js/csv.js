/* =========================================================================
   csv.js – CSV-Export und -Import
   Format: Trennzeichen = Komma, Dezimaltrennzeichen im Export = Komma bei
   Text, aber Noten als Zahl mit Punkt sind Numbers-tauglich. Wir liefern
   Noten mit Komma für die Anzeige-Spalten und zusätzlich robustes Quoting.
   UTF-8 mit BOM, damit Umlaute in Numbers/Excel korrekt erscheinen.
   ========================================================================= */
(function (global) {
  "use strict";

  const DELIM = ",";
  const BOM = "﻿";

  function escapeField(v) {
    if (v === null || v === undefined) v = "";
    v = String(v);
    if (v.includes('"') || v.includes(DELIM) || v.includes("\n") || v.includes("\r")) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  function toCSV(rows) {
    return BOM + rows.map((r) => r.map(escapeField).join(DELIM)).join("\r\n");
  }

  // Einfacher, robuster CSV-Parser (unterstützt Quoting, "" -> ", CRLF/LF)
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM entfernen
    // Trennzeichen automatisch erkennen (Komma oder Semikolon)
    const firstLine = text.split(/\r?\n/)[0] || "";
    const delim = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === delim) { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* ignorieren */ }
        else field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== ""));
  }

  function downloadCSV(filename, rows) {
    const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" });
    triggerDownload(filename, blob);
  }
  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8;" });
    triggerDownload(filename, blob);
  }
  function triggerDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  function n(v) { return Calc.formatNote(v, 1); } // Note deutsch (Komma)
  function safe(s) { return (s || "").replace(/[\/\\:*?"<>|]/g, "-"); }

  // ---- Export: Schülerliste ------------------------------------------------
  function exportSchueler(klasse, schuelerListe) {
    const rows = [["Vorname", "Nachname", "Bemerkung"]];
    schuelerListe.forEach((s) => rows.push([s.vorname, s.nachname, s.bemerkung]));
    downloadCSV("schueler_" + safe(klasse.name) + ".csv", rows);
  }

  // ---- Export: Noten einer Klasse -----------------------------------------
  // Breites Format: je Schüler eine Zeile, je Kategorie Ø + Gesamtnote.
  function exportNoten(klasse, schuelerListe, kategorien, notenAll, settings) {
    const kopf = ["Vorname", "Nachname"];
    kategorien.forEach((k) => kopf.push(k.name + " (Ø)"));
    kopf.push("Gesamtnote");
    const rows = [kopf];

    const notenBySchueler = {};
    notenAll.forEach((no) => (notenBySchueler[no.schuelerId] = notenBySchueler[no.schuelerId] || []).push(no));

    schuelerListe.forEach((s) => {
      const res = Calc.berechneSchueler(kategorien, notenBySchueler[s.id] || [], klasse, settings.rundung);
      const zeile = [s.vorname, s.nachname];
      kategorien.forEach((k) => {
        const ke = res.kategorien.find((x) => x.id === k.id);
        zeile.push(ke && ke.schnitt !== null ? n(ke.schnitt) : "");
      });
      zeile.push(res.gesamt !== null ? n(res.gesamt) : "");
      rows.push(zeile);
    });
    downloadCSV("noten_" + safe(klasse.name) + ".csv", rows);
  }

  // ---- Export: Einzelnoten (Langformat) ------------------------------------
  function exportEinzelnoten(klasse, schuelerListe, kategorien, notenAll) {
    const sMap = {}; schuelerListe.forEach((s) => (sMap[s.id] = s));
    const kMap = {}; kategorien.forEach((k) => (kMap[k.id] = k));
    const rows = [["Vorname", "Nachname", "Kategorie", "Art", "Titel", "Note", "Datum"]];
    notenAll.forEach((no) => {
      const s = sMap[no.schuelerId], k = kMap[no.kategorieId];
      if (!s || !k) return;
      rows.push([s.vorname, s.nachname, k.name, k.art, no.titel, n(no.wert), no.datum]);
    });
    downloadCSV("einzelnoten_" + safe(klasse.name) + ".csv", rows);
  }

  // ---- Export: Ereignisse / Wortmeldungen ----------------------------------
  function exportEreignisse(klasse, schuelerListe, ereignisse) {
    const sMap = {}; schuelerListe.forEach((s) => (sMap[s.id] = s));
    const rows = [["Vorname", "Nachname", "Ereignistyp", "Punkte", "Zeitpunkt"]];
    ereignisse.slice().sort((a, b) => a.timestamp - b.timestamp).forEach((e) => {
      const s = sMap[e.schuelerId]; if (!s) return;
      const typ = Store.EVENT_TYPE_MAP[e.typ];
      rows.push([s.vorname, s.nachname, typ ? typ.label : e.typ, e.punkte, new Date(e.timestamp).toLocaleString("de-DE")]);
    });
    downloadCSV("mitarbeit_" + safe(klasse.name) + ".csv", rows);
  }

  // ---- Import: Schülerliste ------------------------------------------------
  // Erwartet Spalten Vorname, Nachname, (Bemerkung). Kopfzeile optional.
  function importSchueler(text) {
    const rows = parseCSV(text);
    if (!rows.length) return [];
    let start = 0;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const hasHeader = head.some((h) => ["vorname", "nachname", "name", "bemerkung"].includes(h));
    let idxVor = 0, idxNach = 1, idxBem = 2;
    if (hasHeader) {
      start = 1;
      idxVor = head.findIndex((h) => h.includes("vorname"));
      idxNach = head.findIndex((h) => h.includes("nachname"));
      idxBem = head.findIndex((h) => h.includes("bemerkung"));
      if (idxVor < 0) idxVor = 0;
      if (idxNach < 0) idxNach = 1;
    }
    const out = [];
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const vorname = (r[idxVor] || "").trim();
      const nachname = (idxNach >= 0 ? (r[idxNach] || "") : "").trim();
      const bemerkung = (idxBem >= 0 ? (r[idxBem] || "") : "").trim();
      if (!vorname && !nachname) continue;
      out.push({ vorname, nachname, bemerkung });
    }
    return out;
  }

  global.CSV = {
    toCSV, parseCSV, downloadCSV, downloadText,
    exportSchueler, exportNoten, exportEinzelnoten, exportEreignisse,
    importSchueler
  };
})(window);
