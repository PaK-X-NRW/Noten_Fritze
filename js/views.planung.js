/* =========================================================================
   views.planung.js – Stundenplanung (Fahrplan einer Stunde)
   - Vollbild-Ansicht, geöffnet per Tipp auf eine Klassenstunde im Stundenplan
   - Thema + Bausteine (Phase, Minuten, Text; Link); Sortieren am Griff ⠿
     (Pointer-Events, auch auf dem iPad), Speichern automatisch
   - Doppelstunde = ein Fahrplan mit verschiebbarer Trennlinie „— 2. Stunde —“
   - Hausaufgabe der letzten Stunde, Fahrplan einer anderen Stunde übernehmen
   - fahrplanDialog: der Fahrplan im Tracker (nur lesen)
   Rechnungen (Einheit, Aufteilen, Minuten, vorige Stunde) in calc.planung.js,
   gespeichert je Stunde über Store.Planungen.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render, tagKurz, blockName } = global.Views;
  const api = global.Views;

  let speicherTimer = null;

  // =========================================================================
  //  ANSICHT
  // =========================================================================
  async function ViewPlanung() {
    const slot = state.planungSlot;
    const s = state.settings;
    const [k, versionen, termine] = await Promise.all([
      slot ? Store.Klassen.get(slot.klasseId) : null, Store.Stundenplan.alle(), Store.Termine.alle()
    ]);
    if (!k) { state.view = "home"; return api.ViewHome(); }
    const plan = Calc.tagesPlan(versionen, s.abWochen, termine, slot.datum);
    const einheit = Calc.einheitBestimmen(plan, s.stundenzeiten, k.id, slot.blockId);
    const daIst = (plan.zellen[slot.blockId] || []).some((i) => i.typ === "stunde" && i.klasseId === k.id &&
      !(i.aenderung && i.aenderung.aenderung === "verschoben"));
    if (!einheit.length || !daIst) {
      // z. B. gerade über „⋯ Stunde ändern“ verschoben: zurück zum Stundenplan
      state.view = "home"; state.planung = null;
      UI.toast("Die Stunde liegt nicht mehr an diesem Platz – siehe Stundenplan");
      return api.ViewHome();
    }
    const blockIds = einheit.map((b) => b.id);
    const planungen = await Store.Planungen.derStunden(k.id, slot.datum, blockIds);
    state.planung = {
      klasseId: k.id, datum: slot.datum, einheit, blockIds,
      liste: Calc.fahrplanAusPlanungen(einheit, planungen),
      thema: (planungen.find((p) => p.thema) || {}).thema || ""
    };

    // Hinweise: Ausfall dieser Stunde, Hausaufgabe der letzten Stunde
    let hinweise = "";
    const erste = (plan.zellen[einheit[0].id] || []).find((i) => i.typ === "stunde" && i.klasseId === k.id);
    if (erste && erste.aenderung && erste.aenderung.aenderung === "ausfall") {
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
    const topbar =
      '<button class="iconbtn plain" data-action="planung-zurueck" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">' + UI.esc(k.name || "(ohne Namen)") + (k.fach ? " · " + UI.esc(k.fach) : "") + "</h1>" +
      '<span class="sub">' + tagKurz(slot.datum) + " · " + stunden + " · " + zeit + "</span></div>" +
      '<div class="grow"></div>' +
      '<button class="btn" data-action="planung-uebernehmen">📋 Übernehmen</button>' +
      '<button class="btn" data-action="planung-menue" title="Ausfall, Verschieben, Hinweis, Termin">⋯ Stunde ändern</button>' +
      '<button class="btn" data-action="planung-klasse">Klasse</button>' +
      '<button class="btn primary" data-action="planung-tracker">▶ Tracker</button>';

    const body = hinweise +
      '<div class="card pl-kopfzeile" style="border-left:8px solid ' + Calc.klassenFarbe(k) + '">' +
        '<input type="text" id="pl-thema" placeholder="Thema der Stunde" value="' + UI.esc(state.planung.thema) + '">' +
        '<span class="pl-summe" id="pl-summe"></span>' +
      "</div>" +
      '<datalist id="pl-phasen">' + Calc.PHASEN.map((p) => '<option value="' + UI.esc(p) + '">').join("") + "</datalist>" +
      '<div class="pl-liste" id="pl-liste"></div>' +
      '<div class="btn-row pl-neu">' +
        '<button class="btn" data-action="planung-neu" data-typ="text">＋ Text</button>' +
        '<button class="btn" data-action="planung-neu" data-typ="link">＋ Link</button>' +
      "</div>";

    return { topbar, body, fullWidth: false, mount: mountPlanung };
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
        '<button class="iconbtn plain danger-text pl-weg" title="Baustein entfernen">🗑</button>' +
      "</div>";
    let inhalt = "";
    if (x.typ === "link") {
      inhalt = '<div class="pl-link"><input type="url" data-feld="url" placeholder="https://…" value="' + UI.esc(x.url || "") + '">' +
        '<button class="btn small pl-oeffnen">Öffnen</button></div>' +
        '<textarea data-feld="text" rows="2" placeholder="Wofür? (optional)">' + UI.esc(x.text || "") + "</textarea>";
    } else {
      inhalt = '<textarea data-feld="text" rows="3" placeholder="Was passiert in dieser Phase?">' + UI.esc(x.text || "") + "</textarea>";
    }
    return '<div class="pl-baustein' + (x.typ === "link" ? " link" : "") + '" data-id="' + UI.esc(x.id) + '">' + kopf + inhalt + "</div>";
  }
  function trennerHTML(block, fest) {
    return '<div class="pl-trenner' + (fest ? " fest" : "") + '" data-id="' + (fest ? "kopf" : "trenner-" + UI.esc(block.id)) + '">' +
      (fest ? "" : '<span class="pl-griff" title="Ziehen, um die Grenze zu verschieben">⠿</span>') +
      "<span>" + (fest ? "" : "— ") + UI.esc(blockName(block.id)) + " (" + block.start + "–" + block.ende + ")" + (fest ? "" : " —") + "</span>" +
      '<span class="pl-stundensumme" data-block="' + UI.esc(block.id) + '"></span></div>';
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
      p.klasseId, p.datum, p.blockIds, Calc.fahrplanAufteilen(p.einheit, p.liste), p.thema.trim()));
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
    const box = UI.$("#pl-liste");
    const eintrag = (el) => p.liste.find((x) => x.id === el.closest("[data-id]").getAttribute("data-id"));
    box.addEventListener("input", (ev) => {
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
      } else if (ev.target.closest(".pl-oeffnen")) {
        linkOeffnen(eintrag(ev.target).url);
      }
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
    const x = { id: Store.uid(), typ: typ === "link" ? "link" : "text", phase: "", minuten: "", text: "", url: "" };
    // Ans Ende der ersten Stunde, die laut Minuten noch nicht voll ist (so füllt
    // sich eine Doppelstunde von oben); sind alle voll, ganz ans Ende.
    const m = Calc.minutenSumme(p.einheit, p.liste);
    const offen = p.einheit.find((b) => m.jeStunde[b.id].minuten < m.jeStunde[b.id].dauer);
    const naechste = offen && p.einheit[p.einheit.indexOf(offen) + 1];
    const pos = naechste ? p.liste.findIndex((y) => y.typ === "trenner" && y.blockId === naechste.id) : -1;
    if (pos >= 0) p.liste.splice(pos, 0, x); else p.liste.push(x);
    zeichnen();
    speichern().catch(UI.fehlerMelden);
    const el = UI.$('#pl-liste [data-id="' + x.id + '"] ' + (typ === "link" ? '[data-feld="url"]' : '[data-feld="phase"]'));
    if (el) { el.scrollIntoView({ block: "center" }); el.focus(); }
  }

  async function planungZurueck() {
    await speichern();
    state.planung = null;
    go("home");
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
          (x.text ? '<div class="pl-text">' + UI.esc(x.text) + "</div>" : "") + "</div>").join("");
    UI.modal({
      title: "🗺 Fahrplan" + (thema ? " · " + thema : ""),
      bodyHTML: liste.some((x) => x.typ !== "trenner") ? '<div class="pl-lesenliste">' + inhalt + "</div>"
        : '<p class="muted">Für diese Stunde gibt es keinen Fahrplan' + (nr ? "" : " (die Stunde hat keine Stundennummer)") + ".</p>",
      buttons: [{ label: "Schließen" }]
    });
  }

  Object.assign(global.Views, {
    ViewPlanung, bausteinNeu, planungZurueck, planungKlasse, planungTracker, planungMenue,
    planungUebernehmen, fahrplanDialog
  });
})(window);
