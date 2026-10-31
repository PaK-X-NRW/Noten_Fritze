/* =========================================================================
   views.planung.js – Stundenplanung (Fahrplan einer Stunde)
   - Fenster rechts neben dem Wochenplan (planungPanel), geöffnet per Tipp auf
     eine Klassenstunde; der Plan bleibt daneben bedienbar (blättern, andere
     Stunde antippen = Fenster wechselt). Schmale Bildschirme: nur das Fenster.
   - Thema, Reihe (Unterrichtsreihe, siehe views.reihen.js) + Bausteine (Phase,
     Minuten, Text; Link; Datei als Kopie in der App,
     öffnen/teilen/📌 behalten); Sortieren am Griff ⠿
     (Pointer-Events, auch auf dem iPad), Speichern automatisch
   - ⇥ an einem Baustein: ihn und alle folgenden in die nächste Stunde (vorne)
   - Fällt aus / Rücken (Planungen ab hier nach hinten oder vorne) direkt im Fenster
   - Doppelstunde = ein Fahrplan mit verschiebbarer Trennlinie „— 2. Stunde —“
   - Hausaufgabe der letzten Stunde, Fahrplan einer anderen Stunde übernehmen
   - fahrplanDialog: die Stundenplanung im Tracker (nur lesen, Knopf „📋 Stundenplanung“)
   Rechnungen (Einheit, Aufteilen, Minuten, vorige Stunde) in calc.planung.js,
   gespeichert je Stunde über Store.Planungen.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render, tagKurz, blockName } = global.Views;
  const api = global.Views;

  let speicherTimer = null;

  // „1,2 MB“ / „340 KB“
  function groesseText(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
    return Math.max(1, Math.round(n / 1024)) + " KB";
  }
  function datumDeutsch(d) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) ? d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4) : String(d || "");
  }

  // =========================================================================
  //  ANSICHT
  // =========================================================================
  // Planungsfenster rechts neben dem Wochenplan (views.stundenplan.js baut es
  // ein, solange state.planungSlot gesetzt ist). Rückgabe: { html, mount }
  // oder null, wenn die Stunde nicht mehr an diesem Platz liegt.
  async function planungPanel() {
    // Noch ausstehende Eingaben der bisher offenen Stunde sichern – aber nur
    // die: Ein volles Speichern würde Planungen überschreiben, die gerade
    // gerückt oder weitergeschoben wurden (der Fahrplan im Speicher ist dann alt).
    if (speicherTimer) await speichern();
    else await speicherKette.catch(() => {});
    const slot = state.planungSlot;
    const s = state.settings;
    const [k, versionen, termine] = await Promise.all([
      slot ? Store.Klassen.get(slot.klasseId) : null, Store.Stundenplan.alle(), Store.Termine.alle()
    ]);
    if (!k) { state.planungSlot = null; state.planung = null; return null; }
    const plan = Calc.tagesPlan(versionen, s.abWochen, termine, slot.datum);
    const einheit = Calc.einheitBestimmen(plan, s.stundenzeiten, k.id, slot.blockId);
    const daIst = (plan.zellen[slot.blockId] || []).some((i) => i.typ === "stunde" && i.klasseId === k.id &&
      !(i.aenderung && i.aenderung.aenderung === "verschoben"));
    if (!einheit.length || !daIst) {
      // z. B. gerade über „⋯ Mehr“ verschoben: Fenster schließen
      state.planungSlot = null; state.planung = null;
      UI.toast("Die Stunde liegt nicht mehr an diesem Platz – siehe Stundenplan");
      return null;
    }
    const blockIds = einheit.map((b) => b.id);
    const planungen = await Store.Planungen.derStunden(k.id, slot.datum, blockIds);
    const liste = Calc.fahrplanAusPlanungen(einheit, planungen);
    // Haben die Stunden einer Doppelstunde verschiedene Themen (z. B. nach dem
    // stundenweisen Rücken), bekommt jede Stunde ihr eigenes Feld (themen), sonst
    // gilt ein Thema für alle Stunden.
    const themaVon = (b) => ((planungen.find((p) => p.blockId === b.id && p.thema) || {}).thema || "");
    const verschiedene = einheit.map(themaVon).filter((t, i, a) => t && a.indexOf(t) === i);
    const themen = verschiedene.length > 1 ? {} : null;
    if (themen) einheit.slice(1).forEach((b) => { themen[b.id] = themaVon(b); });
    // Reihe der Einheit; Vorschläge: die Reihen dieser Klasse
    const reihenDerKlasse = (await Store.Planungen.byKlasse(k.id)).map((p) => String(p.reihe || "").trim())
      .filter((r, i, a) => r && a.indexOf(r) === i).sort((a, b) => a.localeCompare(b, "de"));
    state.planung = {
      klasseId: k.id, datum: slot.datum, einheit, blockIds, liste,
      thema: themen ? themaVon(einheit[0]) : verschiedene[0] || "",
      themen,
      reihe: (planungen.find((p) => p.reihe) || {}).reihe || "",
      dateien: await dateiStatus(liste)
    };

    // Hinweise: Ausfall dieser Stunde, Hausaufgabe der letzten Stunde
    let hinweise = "";
    const erste = (plan.zellen[einheit[0].id] || []).find((i) => i.typ === "stunde" && i.klasseId === k.id);
    const faelltAus = !!(erste && erste.aenderung && erste.aenderung.aenderung === "ausfall");
    if (faelltAus) {
      hinweise += '<div class="hint-box"><strong>Diese Stunde fällt aus</strong>' +
        (erste.aenderung.notiz ? " – " + UI.esc(erste.aenderung.notiz) : "") + ".</div>";
    }
    const vorher = Calc.vorherigeStunde(versionen, s.abWochen, termine, s.stundenzeiten, k.id, slot.datum, einheit[0].id, 90);
    if (vorher) {
      const alt = (await Store.Planungen.byKlasse(k.id)).filter((p) => p.datum === vorher.datum);
      const ha = [].concat.apply([], alt.map((p) => p.bausteine || []))
        .filter((x) => /^hausaufgabe/i.test(String(x.phase || "").trim()) && String(x.text || "").trim());
      if (ha.length) {
        hinweise += '<div class="hint-box pl-ha"><strong>📚 Hausaufgabe von letzter Stunde (' + tagKurz(vorher.datum) + "):</strong> " +
          ha.map((x) => UI.esc(x.text)).join(" · ") + "</div>";
      }
    }

    const zeit = einheit[0].start + "–" + einheit[einheit.length - 1].ende;
    const stunden = einheit.length > 1 ? einheit[0].nr + ".–" + einheit[einheit.length - 1].nr + ". Stunde" : einheit[0].nr + ". Stunde";
    const kopf =
      '<div class="pl-panelkopf">' +
        '<div class="title-wrap"><h2>' + UI.esc(k.name || "(ohne Namen)") + (k.fach ? " · " + UI.esc(k.fach) : "") + "</h2>" +
        '<span class="sub">' + tagKurz(slot.datum) + " · " + stunden + " · " + zeit + "</span></div>" +
        '<button class="iconbtn plain" data-action="planung-zurueck" title="Planung schließen">✕</button>' +
      "</div>" +
      '<div class="btn-row pl-knoepfe">' +
        '<button class="btn small" data-action="planung-ausfall">' + (faelltAus ? "Ausfall aufheben" : "Fällt aus …") + "</button>" +
        (faelltAus ? "" : '<button class="btn small" data-action="planung-ruecken" title="Planungen ab hier nach hinten oder vorne rücken">⇅ Rücken …</button>') +
        '<button class="btn small" data-action="planung-menue" title="Verschieben, Hinweis, Termin">⋯ Mehr</button>' +
        '<button class="btn small" data-action="planung-uebernehmen">📋 Übernehmen</button>' +
        '<button class="btn small" data-action="planung-klasse">Klasse</button>' +
        '<button class="btn small primary" data-action="planung-tracker">▶ Tracker</button>' +
      "</div>";

    const html = '<div class="card pl-panel" style="border-top:6px solid ' + Calc.klassenFarbe(k) + '">' + kopf + hinweise +
      '<div class="pl-kopfzeile">' +
        '<input type="text" id="pl-thema" placeholder="' + (state.planung.themen ? "Thema der 1. Stunde" : "Thema der Stunde") + '" value="' + UI.esc(state.planung.thema) + '">' +
        '<input type="text" id="pl-reihe" list="pl-reihen" placeholder="Reihe (z. B. Der Schimmelreiter)" value="' + UI.esc(state.planung.reihe) + '">' +
        '<span class="pl-summe" id="pl-summe"></span>' +
      "</div>" +
      '<datalist id="pl-reihen">' + reihenDerKlasse.map((r) => '<option value="' + UI.esc(r) + '">').join("") + "</datalist>" +
      '<datalist id="pl-phasen">' + Calc.PHASEN.map((p) => '<option value="' + UI.esc(p) + '">').join("") + "</datalist>" +
      '<div class="pl-liste" id="pl-liste"></div>' +
      '<div class="btn-row pl-neu">' +
        '<button class="btn" data-action="planung-neu" data-typ="text">＋ Text</button>' +
        '<button class="btn" data-action="planung-neu" data-typ="link">＋ Link</button>' +
        '<button class="btn" data-action="planung-neu" data-typ="datei">＋ Datei</button>' +
        '<input type="file" id="pl-datei" multiple hidden>' +
      "</div></div>";

    return { html, mount: mountPlanung };
  }

  // ---- Liste zeichnen ---------------------------------------------------------
  function bausteinHTML(x) {
    const kopf =
      '<div class="pl-zeile">' +
        '<span class="pl-griff" title="Ziehen zum Verschieben">⠿</span>' +
        '<input type="text" class="pl-phase" data-feld="phase" list="pl-phasen" placeholder="Phase" value="' + UI.esc(x.phase || "") + '">' +
        '<input type="number" class="pl-min" data-feld="minuten" inputmode="numeric" min="0" placeholder="Min" value="' + UI.esc(x.minuten || "") + '">' +
        '<span class="muted">Min</span>' +
        '<div class="grow"></div>' +
        '<button class="iconbtn plain pl-weiter" title="Diesen und alle folgenden Bausteine in die nächste Stunde">⇥</button>' +
        '<button class="iconbtn plain danger-text pl-weg" title="Baustein entfernen">🗑</button>' +
      "</div>";
    let inhalt = "";
    if (x.typ === "datei") {
      const d = (state.planung.dateien || {})[x.dateiId];
      const da = !!(d && d.daten);
      inhalt = '<div class="pl-datei">📄 <strong>' + UI.esc(x.name || "Datei") + "</strong>" +
        ' <span class="muted">' + groesseText(x.groesse) + "</span>" +
        (da
          ? '<div class="grow"></div><button class="btn small pl-datei-oeffnen">Öffnen</button>' +
            (navigator.share ? '<button class="btn small pl-datei-teilen">Teilen</button>' : "") +
            '<button class="btn small pl-datei-pin' + (d.behalten ? " aktiv" : "") + '" title="' +
              (d.behalten ? "Wird behalten – nicht automatisch entfernen" : "Behalten (nicht automatisch entfernen)") + '">📌</button>'
          : ' <span class="pl-entfernt">entfernt' + (d && d.entferntAm ? " (" + UI.esc(datumDeutsch(d.entferntAm)) + ")" : "") +
            " – bei Bedarf aus der Dateien-App neu hinzufügen</span>") +
        "</div>" +
        '<textarea data-feld="text" rows="2" placeholder="Wofür? (optional)">' + UI.esc(x.text || "") + "</textarea>";
    } else if (x.typ === "link") {
      inhalt = '<div class="pl-link"><input type="url" data-feld="url" placeholder="https://…" value="' + UI.esc(x.url || "") + '">' +
        '<button class="btn small pl-oeffnen">Öffnen</button></div>' +
        '<textarea data-feld="text" rows="2" placeholder="Wofür? (optional)">' + UI.esc(x.text || "") + "</textarea>";
    } else {
      inhalt = '<textarea data-feld="text" rows="3" placeholder="Was passiert in dieser Phase?">' + UI.esc(x.text || "") + "</textarea>";
    }
    return '<div class="pl-baustein' + (x.typ === "link" || x.typ === "datei" ? " " + x.typ : "") + '" data-id="' + UI.esc(x.id) + '">' + kopf + inhalt + "</div>";
  }
  function trennerHTML(block, fest) {
    const themen = state.planung && state.planung.themen;
    return '<div class="pl-trenner' + (fest ? " fest" : "") + '" data-id="' + (fest ? "kopf" : "trenner-" + UI.esc(block.id)) + '">' +
      (fest ? "" : '<span class="pl-griff" title="Ziehen, um die Grenze zu verschieben">⠿</span>') +
      "<span>" + (fest ? "" : "— ") + UI.esc(blockName(block.id)) + " (" + block.start + "–" + block.ende + ")" + (fest ? "" : " —") + "</span>" +
      // Eigenes Thema dieser Stunde (nur bei verschiedenen Themen)
      (themen && !fest ? '<input type="text" class="pl-stundenthema" data-thema-block="' + UI.esc(block.id) +
        '" placeholder="Thema dieser Stunde" value="' + UI.esc(themen[block.id] || "") + '">' : "") +
      '<span class="pl-stundensumme" data-block="' + UI.esc(block.id) + '"></span></div>';
  }
  // Thema zum Speichern: Text für alle Stunden, bei getrennten Themen { blockId: Text }
  function themaZumSpeichern(p) {
    if (!p.themen) return p.thema.trim();
    const out = {};
    p.einheit.forEach((b, i) => { out[b.id] = String(i === 0 ? p.thema : p.themen[b.id] || "").trim(); });
    return out;
  }
  function zeichnen() {
    const p = state.planung;
    const box = UI.$("#pl-liste");
    if (!p || !box) return;
    const kopf = p.einheit.length > 1 ? trennerHTML(p.einheit[0], true) : "";
    box.innerHTML = kopf + p.liste.map((x) => x.typ === "trenner"
      ? trennerHTML(p.einheit.find((b) => b.id === x.blockId) || p.einheit[0], false)
      : bausteinHTML(x)).join("") +
      (p.liste.some((x) => x.typ !== "trenner") ? "" : '<p class="muted pl-leer">Noch keine Bausteine – unten „＋ Text“ oder „＋ Link“.</p>');
    summeZeigen();
  }
  function summeZeigen() {
    const p = state.planung;
    const m = Calc.minutenSumme(p.einheit, p.liste);
    const el = UI.$("#pl-summe");
    if (el) {
      el.textContent = "verplant: " + m.gesamt + " von " + m.dauer + " Min";
      el.classList.toggle("zuviel", m.gesamt > m.dauer);
    }
    UI.$all(".pl-stundensumme").forEach((x) => {
      const j = m.jeStunde[x.getAttribute("data-block")];
      if (j) x.textContent = j.minuten + " / " + j.dauer + " Min";
    });
  }

  // ---- Speichern ------------------------------------------------------------------
  // Speichervorgänge laufen nacheinander (Kette) – gleichzeitige würden je
  // einen neuen Datensatz für dieselbe Stunde anlegen.
  let speicherKette = Promise.resolve();
  function speichern() {
    clearTimeout(speicherTimer); speicherTimer = null;
    const p = state.planung;
    if (!p) return speicherKette;
    speicherKette = speicherKette.catch(() => {}).then(() => Store.Planungen.einheitSpeichern(
      p.klasseId, p.datum, p.blockIds, Calc.fahrplanAufteilen(p.einheit, p.liste), themaZumSpeichern(p), p.reihe.trim()));
    return speicherKette;
  }
  function spaeterSpeichern() {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(() => { speichern().catch(UI.fehlerMelden); }, 600);
  }

  // ---- Mount: Eingaben, Entfernen, Öffnen, Ziehen ------------------------------------
  function mountPlanung() {
    const p = state.planung;
    zeichnen();
    const thema = UI.$("#pl-thema");
    thema.addEventListener("input", () => { p.thema = thema.value; spaeterSpeichern(); });
    thema.addEventListener("change", () => { p.thema = thema.value; speichern().catch(UI.fehlerMelden); });
    const reihe = UI.$("#pl-reihe");
    reihe.addEventListener("input", () => { p.reihe = reihe.value; spaeterSpeichern(); });
    reihe.addEventListener("change", () => { p.reihe = reihe.value; speichern().catch(UI.fehlerMelden); });
    const box = UI.$("#pl-liste");
    const eintrag = (el) => p.liste.find((x) => x.id === el.closest("[data-id]").getAttribute("data-id"));
    box.addEventListener("input", (ev) => {
      const themaBlock = ev.target.getAttribute("data-thema-block");
      if (themaBlock) { p.themen[themaBlock] = ev.target.value; spaeterSpeichern(); return; }
      const feld = ev.target.getAttribute("data-feld");
      const x = feld && eintrag(ev.target);
      if (!x) return;
      x[feld] = ev.target.value;
      if (feld === "minuten") summeZeigen();
      spaeterSpeichern();
    });
    box.addEventListener("change", () => { speichern().catch(UI.fehlerMelden); });
    box.addEventListener("click", (ev) => {
      if (ev.target.closest(".pl-weg")) {
        const x = eintrag(ev.target);
        p.liste = p.liste.filter((y) => y !== x);
        zeichnen(); speichern().catch(UI.fehlerMelden);
      } else if (ev.target.closest(".pl-weiter")) {
        bausteineWeiter(eintrag(ev.target)).catch(UI.fehlerMelden);
      } else if (ev.target.closest(".pl-oeffnen")) {
        linkOeffnen(eintrag(ev.target).url);
      } else if (ev.target.closest(".pl-datei-oeffnen")) {
        dateiOeffnen(eintrag(ev.target).dateiId);
      } else if (ev.target.closest(".pl-datei-teilen")) {
        dateiTeilen(eintrag(ev.target).dateiId);
      } else if (ev.target.closest(".pl-datei-pin")) {
        dateiBehalten(eintrag(ev.target).dateiId);
      }
    });
    UI.$("#pl-datei").addEventListener("change", (ev) => {
      const files = Array.prototype.slice.call(ev.target.files || []);
      ev.target.value = "";
      dateienHinzufuegen(files).catch(UI.fehlerMelden);
    });
    ziehenAktivieren(box);
  }

  // Link im Browser öffnen (vom Nutzer angetippt; ohne http(s):// wird https ergänzt)
  function linkOeffnen(url) {
    url = String(url || "").trim();
    if (!url) { UI.toast("Bitte zuerst eine Adresse eintragen"); return; }
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    global.open(url, "_blank", "noopener");
  }

  // Sortieren am Griff: Pointer-Events (iPad-Safari kennt kein HTML5-Drag&Drop).
  // Die Zeile wandert beim Ziehen mit; beim Loslassen wird die Reihenfolge aus
  // dem DOM übernommen. Die feste Kopfzeile (1. Stunde) bleibt oben.
  function ziehenAktivieren(box) {
    box.addEventListener("pointerdown", (ev) => {
      const griff = ev.target.closest(".pl-griff");
      if (!griff) return;
      const zeile = griff.closest("[data-id]");
      ev.preventDefault();
      zeile.classList.add("zieht");
      const bewegen = (e) => {
        const ziel = document.elementFromPoint(e.clientX, e.clientY);
        const andere = ziel && ziel.closest("#pl-liste > [data-id]");
        if (!andere || andere === zeile || andere.getAttribute("data-id") === "kopf") return;
        const r = andere.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) box.insertBefore(zeile, andere);
        else box.insertBefore(zeile, andere.nextSibling);
      };
      const ende = () => {
        document.removeEventListener("pointermove", bewegen);
        document.removeEventListener("pointerup", ende);
        document.removeEventListener("pointercancel", ende);
        zeile.classList.remove("zieht");
        const p = state.planung;
        const nachId = {};
        p.liste.forEach((x) => { nachId[x.id] = x; });
        p.liste = UI.$all("#pl-liste > [data-id]").map((el) => nachId[el.getAttribute("data-id")]).filter(Boolean);
        zeichnen();
        speichern().catch(UI.fehlerMelden);
      };
      document.addEventListener("pointermove", bewegen);
      document.addEventListener("pointerup", ende);
      document.addEventListener("pointercancel", ende);
    });
  }

  // =========================================================================
  //  AKTIONEN
  // =========================================================================
  function bausteinNeu(typ) {
    const p = state.planung;
    if (!p) return;
    // Datei: Auswahl öffnen (muss direkt im Tipp passieren, sonst blockt iOS)
    if (typ === "datei") { const f = UI.$("#pl-datei"); if (f) f.click(); return; }
    einfuegen({ id: Store.uid(), typ: typ === "link" ? "link" : "text", phase: "", minuten: "", text: "", url: "" });
  }
  // Neuen Baustein einsortieren, zeichnen, speichern, Feld fokussieren
  function einfuegen(x) {
    const p = state.planung;
    // Ans Ende der ersten Stunde, die laut Minuten noch nicht voll ist (so füllt
    // sich eine Doppelstunde von oben); sind alle voll, ganz ans Ende.
    const m = Calc.minutenSumme(p.einheit, p.liste);
    const offen = p.einheit.find((b) => m.jeStunde[b.id].minuten < m.jeStunde[b.id].dauer);
    const naechste = offen && p.einheit[p.einheit.indexOf(offen) + 1];
    const pos = naechste ? p.liste.findIndex((y) => y.typ === "trenner" && y.blockId === naechste.id) : -1;
    if (pos >= 0) p.liste.splice(pos, 0, x); else p.liste.push(x);
    zeichnen();
    speichern().catch(UI.fehlerMelden);
    const el = UI.$('#pl-liste [data-id="' + x.id + '"] ' + (x.typ === "link" ? '[data-feld="url"]' : '[data-feld="phase"]'));
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
  }

  // ---- Dateien -------------------------------------------------------------------
  // Status der Dateien eines Fahrplans (Inhalt vorhanden?, 📌, entfernt am)
  async function dateiStatus(liste) {
    const ids = liste.filter((x) => x.typ === "datei" && x.dateiId).map((x) => x.dateiId);
    const out = {};
    for (const id of ids) {
      const d = await Store.Dateien.get(id);
      if (d) out[id] = { daten: !!d.daten, behalten: !!d.behalten, entferntAm: d.entferntAm };
    }
    return out;
  }
  async function dateienHinzufuegen(files) {
    const p = state.planung;
    for (const f of files) {
      if (f.size > 50 * 1024 * 1024 && !await UI.confirmDialog("Große Datei",
        "„" + f.name + "“ ist " + groesseText(f.size) + " groß und wird als Kopie in der App gespeichert. Trotzdem hinzufügen?",
        { okLabel: "Hinzufügen", danger: false })) continue;
      const d = await Store.Dateien.neu(f);
      p.dateien[d.id] = { daten: true, behalten: false, entferntAm: null };
      einfuegen({ id: Store.uid(), typ: "datei", dateiId: d.id, name: d.name, groesse: d.groesse, phase: "", minuten: "", text: "" });
    }
    await speichern();
    if (files.length) UI.toast(files.length === 1 ? "Datei hinzugefügt" : files.length + " Dateien hinzugefügt");
  }
  async function dateiOeffnen(id) {
    const d = await Store.Dateien.get(id);
    if (!d || !d.daten) { UI.toast("Der Inhalt dieser Datei wurde entfernt"); return; }
    const url = URL.createObjectURL(Store.Dateien.blob(d));
    const fenster = global.open(url, "_blank");
    if (!fenster) {
      // Popup blockiert: als Download anbieten
      const a = document.createElement("a");
      a.href = url; a.download = d.name; document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function dateiTeilen(id) {
    const d = await Store.Dateien.get(id);
    if (!d || !d.daten) { UI.toast("Der Inhalt dieser Datei wurde entfernt"); return; }
    const file = new File([d.daten], d.name, { type: d.mime });
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { UI.toast("Teilen wird auf diesem Gerät nicht unterstützt"); return; }
    try { await navigator.share({ files: [file], title: d.name }); } catch (e) { /* abgebrochen */ }
  }
  async function dateiBehalten(id) {
    const d = await Store.Dateien.get(id);
    if (!d) return;
    d.behalten = !d.behalten;
    await Store.Dateien.save(d);
    state.planung.dateien[id] = { daten: !!d.daten, behalten: d.behalten, entferntAm: d.entferntAm };
    zeichnen();
    UI.toast(d.behalten ? "📌 Wird behalten – nicht automatisch entfernt" : "Wird nach der Frist automatisch entfernt");
  }

  // „⇥“ an einem Baustein: ihn und alle folgenden der Einheit in die nächste
  // Stunde der Klasse schieben. Die App fragt: vorne vor die vorhandene
  // Planung, oder als eigene Stunde („Brüche 2“) einschieben – dann rücken die
  // Planungen ab dort stundenweise weiter.
  async function bausteineWeiter(x) {
    const p = state.planung;
    const s = state.settings;
    if (!p || !x) return;
    await speichern();
    const weg = p.liste.slice(p.liste.indexOf(x)).filter((y) => y.typ !== "trenner");
    const [versionen, termine, planungen] = await Promise.all([
      Store.Stundenplan.alle(), Store.Termine.alle(), Store.Planungen.byKlasse(p.klasseId)
    ]);
    const ziel = Calc.naechsteStunde(versionen, s.abWochen, termine, s.stundenzeiten, p.klasseId, p.datum,
      p.blockIds[p.blockIds.length - 1], 120);
    if (!ziel) { UI.toast("In den nächsten Wochen liegt keine weitere Stunde dieser Klasse"); return; }
    const wohin = tagKurz(ziel.datum) + ", " + blockName(ziel.blockId);
    const dort = planungen.find((q) => q.datum === ziel.datum && q.blockId === ziel.blockId);
    // Thema der Stunde, in der der Baustein steht (bei getrennten Themen)
    const teile = Calc.fahrplanAufteilen(p.einheit, p.liste);
    const seineStunde = p.einheit.find((b) => teile[b.id].indexOf(x) !== -1) || p.einheit[0];
    const neuesThema = Calc.themaFortsetzung(p.themen && seineStunde !== p.einheit[0] ? p.themen[seineStunde.id] : p.thema);
    const neuName = neuesThema ? "„" + neuesThema + "“" : "eigene Stunde";
    const was = weg.length === 1 ? "Dieser Baustein" : "Diese " + weg.length + " Bausteine";
    const wahl = await new Promise((resolve) => UI.modal({
      title: "In die nächste Stunde schieben",
      bodyHTML: "<p>" + was + " " + (weg.length === 1 ? "kommt" : "kommen") + " in die nächste Stunde (" + UI.esc(wohin) + ")" +
          (dort && dort.thema ? ", geplant ist dort „" + UI.esc(dort.thema) + "“" : "") + ".</p>" +
        '<p class="hint"><strong>Vorne anhängen:</strong> vor die vorhandene Planung dieser Stunde, sonst ändert sich nichts.<br>' +
        "<strong>Einschieben:</strong> als " + UI.esc(neuName) + " in diese Stunde; ihre bisherige Planung und alle folgenden " +
        "rücken samt Thema eine Stunde weiter.</p>",
      onClose: () => resolve(null),
      buttons: [
        { label: "Abbrechen", onClick: (close) => { resolve(null); close(); } },
        { label: "Vorne anhängen", onClick: (close) => { resolve("vorne"); close(); } },
        { label: "Als " + neuName + " einschieben", className: "primary", onClick: (close) => { resolve("einschieben"); close(); } }
      ]
    }));
    if (!wahl) return;
    const rest = p.liste.filter((y) => weg.indexOf(y) === -1);
    const quelle = { klasseId: p.klasseId, datum: p.datum, blockIds: p.blockIds, teile: Calc.fahrplanAufteilen(p.einheit, rest), thema: themaZumSpeichern(p), reihe: p.reihe.trim() };
    if (wahl === "vorne") {
      await Store.Planungen.bausteineVoranstellen(quelle, ziel, weg);
    } else {
      // Rücken ab dem Ziel, stundenweise; Horizont wie beim Ausfall (letzte Planung + 60 Tage)
      const letzte = planungen.reduce((m, q) => (q.datum > m ? q.datum : m), ziel.datum);
      const bis = Calc.datumPlusTage(letzte, 60);
      const zielTag = Calc.tagesPlan(versionen, s.abWochen, termine, ziel.datum);
      const item = Calc.stundenFinden(zielTag, ziel.blockId).find((i) => i.klasseId === p.klasseId);
      const luecke = termine.filter((t) => !(item && (t === item.aenderung || t === item.verschobenVon)))
        .concat(Store.Termine.ausfallDatensaetze([{ item, datum: ziel.datum, blockId: ziel.blockId }], "", null));
      const zuege = Calc.planungenRuecken(versionen, s.abWochen, termine, luecke, s.stundenzeiten, p.klasseId,
        ziel.datum, bis, "stunde", "nach");
      await Store.Planungen.bausteineEinschieben(quelle, ziel, weg, neuesThema, zuege);
    }
    p.liste = rest;
    await render();
    UI.toast((weg.length === 1 ? "1 Baustein" : weg.length + " Bausteine") + " → " + wohin +
      (wahl === "einschieben" ? " – folgende Planungen eine Stunde weiter" : ""));
  }

  // Planungsfenster schließen
  async function planungZurueck() {
    await speichern();
    state.planung = null;
    state.planungSlot = null;
    render();
  }
  // Die Stunde des Fensters im tatsächlichen Tag (für Ausfall / Rücken)
  async function planungStunde() {
    const p = state.planung;
    await speichern();
    const [versionen, termine, k] = await Promise.all([Store.Stundenplan.alle(), Store.Termine.alle(), Store.Klassen.get(p.klasseId)]);
    const plan = Calc.tagesPlan(versionen, state.settings.abWochen, termine, p.datum);
    const item = (plan.zellen[p.blockIds[0]] || []).find((i) => i.typ === "stunde" && i.klasseId === p.klasseId &&
      !(i.aenderung && i.aenderung.aenderung === "verschoben"));
    return item ? { item, datum: p.datum, blockId: p.blockIds[0], name: (k && k.name) || "(ohne Namen)" } : null;
  }
  async function planungAusfall() {
    const st = await planungStunde();
    if (!st) return;
    const a = st.item.aenderung;
    if (a && a.aenderung === "ausfall") { await api.ausfallAufheben(a); render(); return; }
    api.ausfallDialog(st.item, st.datum, st.blockId, st.name);
  }
  async function planungRuecken() {
    const st = await planungStunde();
    if (st) api.rueckenDialog(st.item, st.datum, st.blockId, st.name);
  }
  async function planungKlasse() {
    const p = state.planung;
    await speichern();
    go("klasse", { klasseId: p.klasseId, tab: "schueler" });
  }
  async function planungTracker() {
    const p = state.planung;
    await speichern();
    await go("klasse", { klasseId: p.klasseId, tab: "schueler" });
    api.trackerStartDialog();
  }
  async function planungMenue() {
    const p = state.planung;
    await speichern();
    api.zellenMenue(p.datum, p.blockIds[0]);
  }

  // Fahrplan einer anderen Stunde anhängen (Parallelklasse, letztes Jahr …)
  async function planungUebernehmen() {
    const p = state.planung;
    await speichern();
    const [alle, klassenListe] = await Promise.all([Store.Planungen.alle(), Store.Klassen.all()]);
    const klassen = {};
    klassenListe.forEach((k) => { klassen[k.id] = k; });
    const eigene = (x) => x.klasseId === p.klasseId && x.datum === p.datum && p.blockIds.indexOf(x.blockId) !== -1;
    const liste = alle.filter((x) => !eigene(x) && (x.bausteine || []).length && klassen[x.klasseId])
      .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
    const zeile = (x) => '<div class="undo-zeile">' +
      '<span class="muted">' + tagKurz(x.datum) + " " + UI.esc(blockName(x.blockId, true)) + "</span>" +
      '<span class="nm"><span class="pl-klassenpunkt" style="background:' + Calc.klassenFarbe(klassen[x.klasseId]) + '"></span>' +
        UI.esc(klassen[x.klasseId].name || "") + (x.thema ? " · " + UI.esc(x.thema) : "") +
        ' <span class="muted">(' + x.bausteine.length + " Bausteine)</span></span>" +
      '<button class="btn small" data-nehmen="' + UI.esc(x.id) + '">Übernehmen</button><span></span></div>';
    const m = UI.modal({
      title: "Fahrplan übernehmen",
      bodyHTML: '<p class="muted">Die Bausteine werden an diesen Fahrplan angehängt (eine Kopie).</p>' +
        '<div class="undo-liste">' + (liste.length ? liste.map(zeile).join("") : '<p class="muted">Es gibt noch keine anderen Planungen.</p>') + "</div>",
      buttons: [{ label: "Schließen" }]
    });
    UI.$all("[data-nehmen]", m.box).forEach((b) => b.addEventListener("click", async () => {
      const quelle = liste.find((x) => x.id === b.getAttribute("data-nehmen"));
      m.close();
      quelle.bausteine.forEach((x) => p.liste.push(Object.assign({}, x, { id: Store.uid() })));
      if (!p.thema.trim() && quelle.thema) { p.thema = quelle.thema; const t = UI.$("#pl-thema"); if (t) t.value = p.thema; }
      zeichnen();
      await speichern();
      UI.toast(quelle.bausteine.length + " Bausteine übernommen");
    }));
  }

  // ---- Fahrplan im Tracker (nur lesen) ---------------------------------------------
  // stunde: Datensatz aus Store.Stunden (datum, stundeNr, dauerMin)
  async function fahrplanDialog(klasseId, stunde) {
    const s = state.settings;
    const nr = parseInt(stunde && stunde.stundeNr, 10);
    let blockIds = [];
    if (nr) {
      const stunden = s.stundenzeiten.filter((b) => b.art === "stunde");
      const n = Math.max(1, Math.round((stunde.dauerMin || 45) / 45));
      blockIds = stunden.slice(nr - 1, nr - 1 + n).map((b) => b.id);
    }
    const planungen = blockIds.length ? await Store.Planungen.derStunden(klasseId, stunde.datum, blockIds) : [];
    const einheit = s.stundenzeiten.filter((b) => blockIds.indexOf(b.id) !== -1);
    const liste = Calc.fahrplanAusPlanungen(einheit, planungen);
    const thema = (planungen.find((p) => p.thema) || {}).thema || "";
    const inhalt = liste.map((x) => x.typ === "trenner"
      ? '<div class="pl-trenner fest"><span>— ' + UI.esc(blockName(x.blockId)) + " —</span></div>"
      : '<div class="pl-lesen"><div><strong>' + UI.esc(x.phase || "") + "</strong>" +
          (x.minuten ? ' <span class="muted">' + UI.esc(x.minuten) + " Min</span>" : "") + "</div>" +
          (x.typ === "link" && x.url ? '<a href="' + UI.esc(/^https?:\/\//i.test(x.url) ? x.url : "https://" + x.url) +
            '" target="_blank" rel="noopener">' + UI.esc(x.url) + "</a>" : "") +
          (x.typ === "datei" ? '<div>📄 <button class="btn small" data-datei="' + UI.esc(x.dateiId) + '">' + UI.esc(x.name || "Datei") + "</button></div>" : "") +
          (x.text ? '<div class="pl-text">' + UI.esc(x.text) + "</div>" : "") + "</div>").join("");
    const m = UI.modal({
      title: "📋 Stundenplanung" + (thema ? " · " + thema : ""),
      bodyHTML: liste.some((x) => x.typ !== "trenner") ? '<div class="pl-lesenliste">' + inhalt + "</div>"
        : '<p class="muted">Für diese Stunde gibt es keine Stundenplanung' + (nr ? "" : " (die Stunde hat keine Stundennummer)") + ".</p>",
      buttons: [{ label: "Schließen" }]
    });
    UI.$all("[data-datei]", m.box).forEach((b) => b.addEventListener("click", () => dateiOeffnen(b.getAttribute("data-datei"))));
  }

  Object.assign(global.Views, {
    planungPanel, bausteinNeu, planungZurueck, planungAusfall, planungRuecken, planungKlasse, planungTracker, planungMenue,
    planungUebernehmen, fahrplanDialog, groesseText
  });
})(window);
