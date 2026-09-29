/* =========================================================================
   views.sitzplan.js – Sitzplan-Editor (Reiter „Sitzplan“)
   Eine Klasse kann mehrere Sitzpläne haben (je Raum einen). Dazu die
   Dialoge: Platz belegen, neuer Sitzplan, umbenennen – die Raumform
   („Raum gestalten“: Stellen ohne Platz, Vorlagen für Gänge) und die
   Sitzregeln der Klasse samt „Automatisch belegen“ nach Regeln.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, render, sitzrasterHTML } = global.Views;
  // ---- Tab: Sitzplan (Editor) ---------------------------------------------
  // Eine Klasse kann mehrere Sitzpläne haben (je Raum einen); gezeigt wird der
  // zuletzt benutzte. Alle Buttons unten wirken auf diesen Plan.
  async function TabSitzplan(k) {
    const [alle, schueler, abwList] = await Promise.all([
      Store.Sitzplan.alle(k.id), Store.Schueler.byKlasse(k.id),
      Store.Abwesenheiten.byKlasseUndTag(k.id, Store.datumLokal())
    ]);
    const plan = alle.plaene.find((p) => p.id === alle.aktivId) || alle.plaene[0];
    const sMap = {}; schueler.forEach((s) => (sMap[s.id] = s));
    const abwMap = {}; abwList.forEach((a) => { abwMap[a.schuelerId] = true; });
    const belegt = plan.seats.filter((x) => x.schuelerId).length;
    const plaetze = plan.seats.filter((x) => !x.keinPlatz).length;
    const gestalten = !!state.sitzplanGestalten;
    const regeln = alle.regeln || [];
    const verletzt = Calc.sitzplanRegelnPruefen(plan, regeln).length;

    const seats = plan.seats.map((seat) => {
      const s = seat.schuelerId ? sMap[seat.schuelerId] : null;
      // Stelle ohne Platz (Gang): sonst unsichtbar, beim Gestalten als Umriss
      if (seat.keinPlatz) {
        return gestalten
          ? '<div class="seat keinplatz" data-action="seat-form" data-seat="' + seat.id + '">Gang</div>'
          : '<div class="seat keinplatz"></div>';
      }
      if (gestalten) {
        return '<div class="seat' + (s ? "" : " empty") + '" data-action="seat-form" data-seat="' + seat.id + '">' +
          (s ? '<div class="nm">' + UI.esc(s.vorname) + '</div><div class="sub">' + UI.esc(s.nachname) + "</div>" : "Platz") + "</div>";
      }
      if (s) {
        const abw = !!abwMap[s.id];
        return '<div class="seat' + (abw ? " abwesend" : "") + '" data-action="seat-assign" data-seat="' + seat.id + '">' +
          '<button class="iconbtn plain abw-btn' + (abw ? " aktiv" : "") + '" data-action="seat-abwesend" data-id="' + s.id + '"' +
            ' title="' + (abw ? "Wieder anwesend melden" : "Heute abwesend/krank") + '">🤒</button>' +
          '<div class="nm">' + UI.esc(s.vorname) + "</div><div class=\"sub\">" + UI.esc(s.nachname) + "</div></div>";
      }
      return '<div class="seat empty" data-action="seat-assign" data-seat="' + seat.id + '">＋</div>';
    }).join("");

    const planTabs = alle.plaene.map((p) =>
      '<button class="tab ' + (p.id === plan.id ? "active" : "") + '" data-action="sitzplan-waehlen" data-id="' + UI.esc(p.id) + '">' +
        UI.esc(p.name) + "</button>"
    ).join("");

    return (
      '<div class="plan-toolbar">' +
        '<div class="tabs sitzplan-tabs">' + planTabs + "</div>" +
        '<button class="btn" data-action="sitzplan-neu">＋ Neuer Sitzplan</button>' +
        '<button class="btn" data-action="sitzplan-umbenennen">Umbenennen</button>' +
        (gestalten ? "" : '<button class="btn" data-action="sitzplan-gestalten">✏️ Raum gestalten</button>' +
          '<button class="btn" data-action="sitzplan-regeln"' + (verletzt ? ' title="' + verletzt + ' Regel(n) in diesem Plan gerade nicht erfüllt"' : "") + '>📋 Regeln' +
            (regeln.length ? " (" + regeln.length + ")" : "") + (verletzt ? " ⚠️" : "") + "</button>") +
        (alle.plaene.length > 1 ? '<button class="btn danger" data-action="sitzplan-loeschen">Löschen</button>' : "") +
      "</div>" +
      (gestalten
        ? '<div class="plan-toolbar gestalten-leiste">' +
            '<span class="muted">Stelle antippen: Platz ↔ Gang · Vorlage:</span>' +
            '<button class="btn" data-action="sitzplan-vorlage" data-vorlage="alle">Alle Plätze</button>' +
            '<button class="btn" data-action="sitzplan-vorlage" data-vorlage="mittelgang">Mittelgang</button>' +
            '<button class="btn" data-action="sitzplan-vorlage" data-vorlage="zweiertische">Zweiertische mit Gängen</button>' +
            '<div class="grow"></div>' +
            '<span class="muted">' + plaetze + " Plätze</span>" +
            '<button class="btn primary" data-action="sitzplan-gestalten">Fertig</button>' +
          "</div>"
        :
      '<div class="plan-toolbar">' +
        '<div class="hstack"><label class="muted">Reihen</label><input id="grid-rows" type="number" inputmode="numeric" min="1" max="12" value="' + plan.rows + '" style="width:80px"></div>' +
        '<div class="hstack"><label class="muted">Spalten</label><input id="grid-cols" type="number" inputmode="numeric" min="1" max="15" value="' + plan.cols + '" style="width:80px"></div>' +
        '<button class="btn" data-action="set-grid">Raster anwenden</button>' +
        '<button class="btn" data-action="auto-seat">Automatisch belegen</button>' +
        '<button class="btn" data-action="clear-seats">Leeren</button>' +
        '<div class="grow"></div>' +
        '<span class="muted">' + belegt + " / " + schueler.length + ' belegt</span>' +
        '<button class="btn primary" data-action="open-tracker">▶︎ Tracker starten</button>' +
      "</div>") +
      sitzrasterHTML(plan, seats, gestalten ? "gestalten" : "")
    );
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


  // ---- Raumform (Raum gestalten) ---------------------------------------------
  // Eine Stelle zwischen Platz und Gang umschalten. Wer dort saß, wird
  // herausgenommen.
  async function sitzplanFormUmschalten(seatId) {
    const plan = await Store.Sitzplan.get(state.klasseId);
    const seat = plan.seats.find((x) => x.id === seatId);
    if (!seat) return;
    seat.keinPlatz = !seat.keinPlatz;
    if (seat.keinPlatz && seat.schuelerId) {
      seat.schuelerId = null;
      UI.toast("Platz ist jetzt Gang – das Kind hat keinen Platz mehr");
    }
    await Store.Sitzplan.save(plan); render();
  }
  // Vorlage auf alle Reihen anwenden (setzt die ganze Raumform neu).
  async function sitzplanVorlage(vorlage) {
    const plan = await Store.Sitzplan.get(state.klasseId);
    const gaenge = Calc.sitzplanGaenge(plan.cols, vorlage);
    if (!gaenge) {
      UI.toast(vorlage === "mittelgang"
        ? "Ein Mittelgang braucht eine ungerade Spaltenzahl (z. B. 7)"
        : "Zweiertische brauchen mindestens 3 Spalten");
      return;
    }
    let entfernt = 0;
    plan.seats.forEach((seat) => {
      seat.keinPlatz = gaenge.indexOf(seat.col) !== -1;
      if (seat.keinPlatz && seat.schuelerId) { seat.schuelerId = null; entfernt++; }
    });
    await Store.Sitzplan.save(plan); render();
    if (entfernt) UI.toast(entfernt + (entfernt === 1 ? " Kind hat" : " Kinder haben") + " keinen Platz mehr (Platz wurde Gang)");
    else if (vorlage === "zweiertische" && (plan.cols + 1) % 3 !== 0) UI.toast("Tipp: Zweiertische passen genau bei 5, 8, 11 oder 14 Spalten");
  }

  // ---- Sitzregeln --------------------------------------------------------------
  // Die Regeln gelten für die ganze Klasse (alle Räume); nur „fester Platz“
  // hängt an einem Plan. Verteilt wird in Calc.sitzplanVerteilen.
  const REGEL_ARTEN = [
    { value: "nichtNeben", label: "sitzt nicht neben …" },
    { value: "neben", label: "sitzt neben …" },
    { value: "vorne", label: "sitzt vorne" },
    { value: "hinten", label: "sitzt hinten" },
    { value: "mittig", label: "sitzt mittig (Blick gerade zur Tafel)" },
    { value: "rand", label: "sitzt am Rand" },
    { value: "platz", label: "behält den jetzigen Platz (fester Platz)" }
  ];

  // „Reihe 1 von vorne, 3. Platz von links“ für einen Platz eines Plans
  function platzText(plan, seatId) {
    const lage = Calc.sitzplanLage(plan);
    const p = lage.plaetze[lage.index[seatId]];
    if (!p) return "Platz gibt es nicht mehr";
    return "Reihe " + (p.rang + 1) + " von vorne, " + (p.col + 1) + ". Platz von links";
  }
  // Regel als lesbarer Satz (HTML, Namen escaped)
  function regelText(r, sMap, plaene) {
    const name = (id) => "<strong>" + (sMap[id] ? UI.esc(UI.vollerName(sMap[id])) : "?") + "</strong>";
    const n = Math.max(1, parseInt(r.reihen, 10) || 2);
    const reihen = n === 1 ? "Reihe" : n + " Reihen";
    switch (r.typ) {
      case "nichtNeben": return name(r.a) + " sitzt nicht neben " + name(r.b);
      case "neben":      return name(r.a) + " sitzt neben " + name(r.b);
      case "vorne":      return name(r.a) + " sitzt vorne (erste " + reihen + ")";
      case "hinten":     return name(r.a) + " sitzt hinten (letzte " + reihen + ")";
      case "mittig":     return name(r.a) + " sitzt mittig (Blick gerade zur Tafel)";
      case "rand":       return name(r.a) + " sitzt am " + (r.seite === "rechts" ? "rechten" : "linken") + " Rand";
      case "platz": {
        const plan = plaene.find((p) => p.id === r.planId);
        return name(r.a) + " hat einen festen Platz" + (plan
          ? " in „" + UI.esc(plan.name) + "“ (" + platzText(plan, r.seatId) + ")" : "");
      }
      default: return "";
    }
  }
  // Gibt es dieselbe Regel schon? (nichtNeben/neben gelten in beide Richtungen)
  function regelDoppelt(regeln, neu) {
    return regeln.some((r) => r.typ === neu.typ && (
      (r.a === neu.a && (r.b || null) === (neu.b || null) && (r.seite || null) === (neu.seite || null)) ||
      ((neu.typ === "neben" || neu.typ === "nichtNeben") && r.a === neu.b && r.b === neu.a)));
  }

  async function sitzplanRegelnDialog(k) {
    const [alle, schueler] = await Promise.all([Store.Sitzplan.alle(k.id), Store.Schueler.byKlasse(k.id)]);
    const plan = alle.plaene.find((p) => p.id === alle.aktivId) || alle.plaene[0];
    const regeln = (alle.regeln || []).slice();
    const sMap = {}; schueler.forEach((s) => { sMap[s.id] = s; });
    const verletzt = Calc.sitzplanRegelnPruefen(plan, regeln);
    const personen = schueler.map((s) => ({ value: s.id, label: UI.vollerName(s) }));

    const liste = regeln.length
      ? regeln.map((r) =>
          '<div class="regel-zeile">' +
            "<span>" + regelText(r, sMap, alle.plaene) +
              (verletzt.indexOf(r) !== -1 ? ' <span class="regel-warn" title="Im Plan „' + UI.esc(plan.name) + '“ gerade nicht erfüllt">⚠️ gerade nicht erfüllt</span>' : "") +
            "</span>" +
            '<button class="iconbtn" data-weg="' + UI.esc(r.id) + '" title="Regel löschen">✕</button>' +
          "</div>").join("")
      : '<p class="muted">Noch keine Regeln. „Automatisch belegen“ mischt dann rein zufällig.</p>';

    const body =
      '<p class="muted">Gilt für alle Sitzpläne der Klasse. „Automatisch belegen“ mischt die Klasse und hält sich dabei an diese Regeln.</p>' +
      '<div class="regel-liste">' + liste + "</div>" +
      (schueler.length < 1 ? "" :
      '<div class="regel-neu"><h3>Neue Regel</h3>' +
        '<div class="form-row">' +
          UI.field("Wer", "a", "", { type: "select", options: personen }) +
          UI.field("Regel", "typ", "nichtNeben", { type: "select", options: REGEL_ARTEN }) +
        "</div>" +
        '<div data-fuer="nichtNeben neben">' + UI.field("… neben wem", "b", personen[1] ? personen[1].value : "", { type: "select", options: personen }) + "</div>" +
        '<div data-fuer="vorne hinten">' + UI.field("Wie viele Reihen zählen dazu?", "reihen", 2, { type: "number", inputmode: "numeric" }) + "</div>" +
        '<div data-fuer="rand">' + UI.field("Seite", "seite", "links", { type: "select", options: [
          { value: "links", label: "linker Rand (wie auf dem Bildschirm)" },
          { value: "rechts", label: "rechter Rand (wie auf dem Bildschirm)" }] }) + "</div>" +
        '<div data-fuer="platz"><p class="hint">Setze die Person zuerst per Antippen auf den gewünschten Platz. Der feste Platz gilt nur im Plan „' +
          UI.esc(plan.name) + "“.</p></div>" +
        '<button class="btn primary" id="regel-add" style="width:100%">Regel hinzufügen</button>' +
      "</div>");

    const m = UI.modal({ title: "Sitzregeln · " + k.name, bodyHTML: body, buttons: [{ label: "Schließen" }] });
    const neuLaden = async (neueRegeln) => {
      await Store.Sitzplan.regelnSpeichern(k.id, neueRegeln);
      m.close(); render(); sitzplanRegelnDialog(k);
    };
    // Zusatzfelder passend zur gewählten Regel zeigen
    const typSel = m.box.querySelector("#f-typ");
    const zeigen = () => UI.$all("[data-fuer]", m.box).forEach((el) => {
      el.style.display = el.getAttribute("data-fuer").split(" ").indexOf(typSel.value) !== -1 ? "" : "none";
    });
    if (typSel) { typSel.addEventListener("change", zeigen); zeigen(); }

    UI.$all("[data-weg]", m.box).forEach((b) => b.addEventListener("click", () =>
      neuLaden(regeln.filter((r) => r.id !== b.getAttribute("data-weg")))));

    const add = m.box.querySelector("#regel-add");
    if (add) add.addEventListener("click", () => {
      const v = UI.formValues(m.box.querySelector(".regel-neu"));
      const neu = { id: Store.uid(), typ: v.typ, a: v.a };
      if (v.typ === "nichtNeben" || v.typ === "neben") {
        if (!v.b || v.b === v.a) { UI.toast("Bitte zwei verschiedene Personen wählen"); return; }
        neu.b = v.b;
      }
      if (v.typ === "vorne" || v.typ === "hinten") neu.reihen = Math.max(1, Math.min(12, parseInt(v.reihen, 10) || 2));
      if (v.typ === "rand") neu.seite = v.seite === "rechts" ? "rechts" : "links";
      let liste = regeln;
      if (v.typ === "platz") {
        const seat = plan.seats.find((x) => x.schuelerId === v.a && !x.keinPlatz);
        if (!seat) { UI.toast("Diese Person hat in „" + plan.name + "“ noch keinen Platz – erst per Antippen setzen"); return; }
        neu.planId = plan.id; neu.seatId = seat.id;
        // Ein fester Platz je Person und Plan: der neue ersetzt den alten
        liste = regeln.filter((r) => !(r.typ === "platz" && r.a === v.a && r.planId === plan.id));
      } else if (regelDoppelt(regeln, neu)) { UI.toast("Diese Regel gibt es schon"); return; }
      neuLaden(liste.concat([neu]));
    });
  }

  // „Automatisch belegen“: Klasse nach den Regeln neu mischen. Leere Plätze
  // bleiben hinten; was nicht aufgeht, wird danach aufgelistet.
  async function sitzplanAutomatisch(k) {
    const [alle, schueler] = await Promise.all([Store.Sitzplan.alle(k.id), Store.Schueler.byKlasse(k.id)]);
    const plan = alle.plaene.find((p) => p.id === alle.aktivId) || alle.plaene[0];
    const regeln = alle.regeln || [];
    const erg = Calc.sitzplanVerteilen(plan, schueler.map((s) => s.id), regeln);
    plan.seats.forEach((seat) => { seat.schuelerId = erg.belegung[seat.id] || null; });
    await Store.Sitzplan.save(plan); render();
    if (!erg.verletzt.length && !erg.ohnePlatz.length) {
      UI.toast(regeln.length ? "Neu gemischt – alle Regeln erfüllt" : "Neu gemischt");
      return;
    }
    const sMap = {}; schueler.forEach((s) => { sMap[s.id] = s; });
    UI.hideToast();
    UI.modal({
      title: "Nicht alles hat gepasst",
      bodyHTML:
        (erg.verletzt.length
          ? '<p class="muted">Diese Regeln ließen sich nicht erfüllen, z. B. weil sie sich widersprechen oder Plätze fehlen:</p>' +
            '<div class="regel-liste">' + erg.verletzt.map((r) => '<div class="regel-zeile"><span>' + regelText(r, sMap, alle.plaene) + "</span></div>").join("") + "</div>"
          : "") +
        (erg.ohnePlatz.length
          ? '<p class="muted">Zu wenige Plätze – ohne Platz: ' +
            erg.ohnePlatz.map((id) => "<strong>" + UI.esc(sMap[id] ? UI.vollerName(sMap[id]) : "?") + "</strong>").join(", ") + "</p>"
          : "") +
        '<p class="hint">Die Verteilung ist trotzdem gespeichert. Nochmal „Automatisch belegen“ mischt neu.</p>',
      buttons: [{ label: "OK", className: "primary" }]
    });
  }

  Object.assign(global.Views, { TabSitzplan, seatAssignDialog, sitzplanNeuDialog, sitzplanUmbenennenDialog,
    sitzplanFormUmschalten, sitzplanVorlage, sitzplanRegelnDialog, sitzplanAutomatisch });
})(window);
