/* =========================================================================
   csv.js – CSV-Export und -Import
   Format: Trennzeichen = Komma, Dezimaltrennzeichen im Export = Komma bei
   Text, aber Noten als Zahl mit Punkt sind Numbers-tauglich. Wir liefern
   Noten mit Komma für die Anzeige-Spalten und zusätzlich robustes Quoting.
   UTF-8 mit BOM, damit Umlaute in Numbers/Excel korrekt erscheinen.
   Alle Exporte laufen über speichern() (Export-Ordner → Teilen → Download).
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

  function triggerDownload(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  // ---- Export-Ordner (File System Access API) ------------------------------
  // Das Verzeichnis-Handle liegt als eigener Datensatz { key: "export",
  // ordnerHandle } im Store "einstellungen" – NICHT im "app"-Settings-Objekt.
  async function exportOrdner() {
    try {
      const rec = await DB.get("einstellungen", "export");
      return rec && rec.ordnerHandle ? rec.ordnerHandle : null;
    } catch (e) { return null; }
  }
  async function exportOrdnerSetzen(handle) {
    await DB.put("einstellungen", { key: "export", ordnerHandle: handle });
  }
  async function exportOrdnerVergessen() {
    await DB.del("einstellungen", "export");
  }

  // ---- Zentrales Speichern aller Exporte ------------------------------------
  // Dreistufig. Hinweis: iPad-Safari hat keinen Ordner-Picker für Downloads –
  // dort ist das Teilen-Blatt („In Dateien sichern") der Weg zur Ordnerwahl.
  // Rückgabe: "ordner" | "teilen" | "abgebrochen" | "download".
  async function speichern(dateiname, inhalt, mime) {
    // 1) Gewählter Export-Ordner (Chrome/Edge Desktop)
    try {
      const ordner = await exportOrdner();
      if (ordner) {
        let perm = await ordner.queryPermission({ mode: "readwrite" });
        if (perm === "prompt") perm = await ordner.requestPermission({ mode: "readwrite" });
        if (perm === "granted") {
          const fh = await ordner.getFileHandle(dateiname, { create: true });
          const w = await fh.createWritable();
          await w.write(new Blob([inhalt], { type: mime }));
          await w.close();
          return "ordner";
        }
      }
    } catch (e) { /* still zur nächsten Stufe */ }

    // 2) Web Share API (iPad-Safari)
    try {
      const file = new File([inhalt], dateiname, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return "teilen";
      }
    } catch (e) {
      // Nutzer bricht das Teilen-Blatt ab -> kein Fallback-Download
      if (e && e.name === "AbortError") return "abgebrochen";
      /* sonst still zur nächsten Stufe */
    }

    // 3) Fallback: klassischer Download
    triggerDownload(dateiname, new Blob([inhalt], { type: mime }));
    return "download";
  }

  function safe(s) { return (s || "").replace(/[\/\\:*?"<>|]/g, "-"); }

  // ---- Export: Schülerliste ------------------------------------------------
  async function exportSchueler(klasse, schuelerListe) {
    const rows = [["Vorname", "Nachname", "Bemerkung"]];
    schuelerListe.forEach((s) => rows.push([s.vorname, s.nachname, s.bemerkung]));
    return await speichern("schueler_" + safe(klasse.name) + ".csv", toCSV(rows), "text/csv");
  }

  // ---- Export: Zeugnisnoten einer Klasse ----------------------------------
  // Je Schüler/in eine Zeile mit der kompletten Kette beider Halbjahre, so wie
  // sie in der Notenübersicht steht: Epochalnoten, schriftliche und sonstige
  // Leistungen, Zeugnisnote je Halbjahr und die Jahresnote. Zwischennoten als
  // Tendenz (2+, 3, 4-), Zeugnisnoten auf der Zeugnisskala. In MSS-Klassen ist
  // jedes Kurshalbjahr eine eigene Endnote – dort gibt es keine Jahresnote.
  async function exportNoten(klasse, schuelerListe, kategorien, notenAll) {
    const mss = Calc.istMSS(klasse);
    const t = (v) => Calc.formatTendenz(v, mss);
    const zn = (v) => Calc.formatZeugnisnote(v, mss);
    const kopf = ["Vorname", "Nachname"];
    [1, 2].forEach((hj) => {
      kopf.push(
        hj + ". HJ Epochalnote 1", hj + ". HJ Epochalnote 2",
        hj + ". HJ Schriftliche Leistungen", hj + ". HJ Sonstige Leistungen",
        hj + ". HJ " + (mss ? "Zeugnispunkte" : "Zeugnisnote"));
    });
    if (!mss) kopf.push("Zeugnisnote Jahr");
    const rows = [kopf];

    const notenBySchueler = {};
    notenAll.forEach((no) => (notenBySchueler[no.schuelerId] = notenBySchueler[no.schuelerId] || []).push(no));

    schuelerListe.forEach((s) => {
      const noten = notenBySchueler[s.id] || [];
      const zeile = [s.vorname, s.nachname];
      const erg = [1, 2].map((hj) => Calc.halbjahrErgebnis(kategorien, noten, klasse, hj, mss));
      erg.forEach((e) => {
        zeile.push(t(e.epochal[0].note), t(e.epochal[1].note), t(e.schriftlich), t(e.sonstige), zn(e.zeugnis));
      });
      if (!mss) zeile.push(zn(Calc.jahresnote(erg[0].zeugnis, erg[1].zeugnis, mss)));
      rows.push(zeile);
    });
    return await speichern("noten_" + safe(klasse.name) + ".csv", toCSV(rows), "text/csv");
  }

  // ---- Export: Einzelnoten (Langformat) ------------------------------------
  // Eine Zeile je erfasster Note, mit ihrer Spalte (Leistung) als Bezeichnung.
  async function exportEinzelnoten(klasse, schuelerListe, kategorien, notenAll, leistungen) {
    const mss = Calc.istMSS(klasse);
    const sMap = {}; schuelerListe.forEach((s) => (sMap[s.id] = s));
    const kMap = {}; kategorien.forEach((k) => (kMap[k.id] = k));
    const lMap = {}; (leistungen || []).forEach((l) => (lMap[l.id] = l));
    const rows = [["Vorname", "Nachname", "Spalte", "Kategorie", "Art", mss ? "Punkte" : "Note", "Datum", "Quartal"]];
    notenAll.forEach((no) => {
      const s = sMap[no.schuelerId], k = kMap[no.kategorieId];
      if (!s || !k) return;
      const l = lMap[no.leistungId];
      rows.push([s.vorname, s.nachname, (l && l.titel) || no.titel || k.name, k.name, k.art,
        Calc.formatTendenz(no.wert, mss), (l && l.datum) || no.datum, no.quartal || no.halbjahr || ""]);
    });
    return await speichern("einzelnoten_" + safe(klasse.name) + ".csv", toCSV(rows), "text/csv");
  }

  // ---- Export: Ereignisse / Wortmeldungen ----------------------------------
  async function exportEreignisse(klasse, schuelerListe, ereignisse) {
    const sMap = {}; schuelerListe.forEach((s) => (sMap[s.id] = s));
    const rows = [["Vorname", "Nachname", "Ereignistyp", "Punkte", "Zeitpunkt"]];
    ereignisse.slice().sort((a, b) => a.timestamp - b.timestamp).forEach((e) => {
      const s = sMap[e.schuelerId]; if (!s) return;
      const typ = Store.EVENT_TYPE_MAP[e.typ];
      rows.push([s.vorname, s.nachname, typ ? typ.label : e.typ, e.punkte, new Date(e.timestamp).toLocaleString("de-DE")]);
    });
    return await speichern("mitarbeit_" + safe(klasse.name) + ".csv", toCSV(rows), "text/csv");
  }

  // ---- Export: Mitarbeitsnoten eines Quartals (beim Quartalsabschluss) ------
  // eintraege: [{ schuelerId, wert }] – wert ist der rohe String aus dem
  // Eingabefeld ("2+", "2,3" ...); ungültige/leere werden übersprungen.
  async function exportQuartalNoten(klasse, schuelerListe, eintraege, quartal) {
    const mss = Calc.istMSS(klasse);
    const sMap = {}; schuelerListe.forEach((s) => (sMap[s.id] = s));
    const rows = [["Vorname", "Nachname", mss ? "Punkte" : "Note", "Quartal"]];
    eintraege.forEach((e) => {
      const s = sMap[e.schuelerId]; if (!s) return;
      const wert = Calc.parseNote(e.wert, mss);
      if (wert === null) return;
      rows.push([s.vorname, s.nachname, Calc.formatTendenz(wert, mss), quartal]);
    });
    return await speichern("mitarbeit_q" + quartal + "_" + safe(klasse.name) + ".csv", toCSV(rows), "text/csv");
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
    toCSV, parseCSV, safe, speichern,
    exportOrdner, exportOrdnerSetzen, exportOrdnerVergessen,
    exportSchueler, exportNoten, exportEinzelnoten, exportEreignisse, exportQuartalNoten,
    importSchueler
  };
})(window);
