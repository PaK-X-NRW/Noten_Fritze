/* =========================================================================
   views.sitzplan.js – Sitzplan-Editor (Reiter „Sitzplan“)
   Eine Klasse kann mehrere Sitzpläne haben (je Raum einen). Dazu die
   Dialoge: Platz belegen, neuer Sitzplan, umbenennen.
   ========================================================================= */
(function (global) {
  "use strict";

  const { render, sitzrasterHTML } = global.Views;
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

    const seats = plan.seats.map((seat) => {
      const s = seat.schuelerId ? sMap[seat.schuelerId] : null;
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
        (alle.plaene.length > 1 ? '<button class="btn danger" data-action="sitzplan-loeschen">Löschen</button>' : "") +
      "</div>" +
      '<div class="plan-toolbar">' +
        '<div class="hstack"><label class="muted">Reihen</label><input id="grid-rows" type="number" inputmode="numeric" min="1" max="12" value="' + plan.rows + '" style="width:80px"></div>' +
        '<div class="hstack"><label class="muted">Spalten</label><input id="grid-cols" type="number" inputmode="numeric" min="1" max="15" value="' + plan.cols + '" style="width:80px"></div>' +
        '<button class="btn" data-action="set-grid">Raster anwenden</button>' +
        '<button class="btn" data-action="auto-seat">Automatisch belegen</button>' +
        '<button class="btn" data-action="clear-seats">Leeren</button>' +
        '<div class="grow"></div>' +
        '<span class="muted">' + belegt + " / " + schueler.length + ' belegt</span>' +
        '<button class="btn primary" data-action="open-tracker">▶︎ Tracker starten</button>' +
      "</div>" +
      sitzrasterHTML(plan, seats)
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


  Object.assign(global.Views, { TabSitzplan, seatAssignDialog, sitzplanNeuDialog, sitzplanUmbenennenDialog });
})(window);
