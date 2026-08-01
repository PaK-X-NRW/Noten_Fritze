/* =========================================================================
   views.js – Aktions-Dispatcher: zentrale Delegation über [data-action].
   Lädt nach den View-Modulen (views.core.js, views.*.js) und holt sich deren
   Funktionen aus window.Views; aufgerufen werden die Actions erst zur Laufzeit.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render } = global.Views;
  const {
    klasseDialog, splitsDialog, schuelerDialog, kategorieDialog, cellDialog,
    studentDetailDialog, seatAssignDialog, importStudentsDialog, backupImportDialog,
    trackerStartDialog, trackerHeatEditDialog, trackerAbwesendToggle,
    stopHeatTimer, renderSeatCounts
  } = global.Views;

  // =========================================================================
  //  Aktions-Dispatcher
  // =========================================================================
  const ACTIONS = {
    home: () => go("home"),
    settings: () => go("einstellungen"),
    "add-class": () => klasseDialog(null),
    "open-class": (el) => go("klasse", { klasseId: el.getAttribute("data-id"), tab: "schueler" }),
    "edit-class": async () => klasseDialog(await Store.Klassen.get(state.klasseId)),
    "class-tab": (el) => { state.tab = el.getAttribute("data-tab"); render(); },
    "edit-splits": async () => splitsDialog(await Store.Klassen.get(state.klasseId)),

    "add-student": async () => schuelerDialog(await Store.Klassen.get(state.klasseId)),
    "edit-student": async (el) => schuelerDialog(await Store.Klassen.get(state.klasseId), await Store.Schueler.get(el.getAttribute("data-id"))),
    "delete-student": async (el) => {
      const s = await Store.Schueler.get(el.getAttribute("data-id"));
      if (await UI.confirmDialog("Schüler/in löschen?", UI.vollerName(s) + " und alle zugehörigen Noten/Ereignisse werden gelöscht.")) {
        await Store.Schueler.remove(s.id); render();
      }
    },
    "move-student": async (el) => {
      const list = await Store.Schueler.byKlasse(state.klasseId);
      const i = list.findIndex((x) => x.id === el.getAttribute("data-id"));
      const dir = el.getAttribute("data-dir") === "up" ? -1 : 1;
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
      await Store.Schueler.reorder(list); render();
    },
    "import-students": async () => importStudentsDialog(await Store.Klassen.get(state.klasseId)),
    "export-students": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      CSV.exportSchueler(k, await Store.Schueler.byKlasse(k.id)); UI.toast("CSV exportiert");
    },

    "add-category": async () => kategorieDialog(await Store.Klassen.get(state.klasseId)),
    "edit-category": async (el) => kategorieDialog(await Store.Klassen.get(state.klasseId), await Store.Kategorien.get(el.getAttribute("data-id"))),
    "delete-category": async (el) => {
      const c = await Store.Kategorien.get(el.getAttribute("data-id"));
      if (await UI.confirmDialog("Kategorie löschen?", "„" + c.name + "“ und alle darin erfassten Noten werden gelöscht.")) {
        await Store.Kategorien.remove(c.id); render();
      }
    },

    "edit-cell": async (el) => cellDialog(await Store.Klassen.get(state.klasseId), el.getAttribute("data-sid"), el.getAttribute("data-cid")),
    "student-detail": async (el) => studentDetailDialog(await Store.Klassen.get(state.klasseId), el.getAttribute("data-sid")),

    "export-noten": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const [s, kt, n] = await Promise.all([Store.Schueler.byKlasse(k.id), Store.Kategorien.byKlasse(k.id), Store.Noten.byKlasse(k.id)]);
      CSV.exportNoten(k, s, kt, n, state.settings); UI.toast("Noten-CSV exportiert");
    },
    "export-einzelnoten": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const [s, kt, n] = await Promise.all([Store.Schueler.byKlasse(k.id), Store.Kategorien.byKlasse(k.id), Store.Noten.byKlasse(k.id)]);
      CSV.exportEinzelnoten(k, s, kt, n); UI.toast("Einzelnoten-CSV exportiert");
    },
    "export-events": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const [s, e] = await Promise.all([Store.Schueler.byKlasse(k.id), Store.Ereignisse.byKlasse(k.id)]);
      CSV.exportEreignisse(k, s, e); UI.toast("Mitarbeit-CSV exportiert");
    },

    // Sitzplan
    "seat-assign": (el) => seatAssignDialog2(el.getAttribute("data-seat")),
    "set-grid": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const plan = await Store.Sitzplan.get(k.id);
      const rows = Math.max(1, Math.min(12, parseInt(UI.$("#grid-rows").value, 10) || plan.rows));
      const cols = Math.max(1, Math.min(12, parseInt(UI.$("#grid-cols").value, 10) || plan.cols));
      // Neues Raster, bestehende Zuweisungen soweit möglich übernehmen
      const alt = {}; plan.seats.forEach((s) => { alt[s.id] = s.schuelerId; });
      const np = Store.neuerSitzplan(k.id, rows, cols);
      np.seats.forEach((s) => { if (alt[s.id]) s.schuelerId = alt[s.id]; });
      await Store.Sitzplan.save(np); render();
    },
    "auto-seat": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const [plan, schueler] = await Promise.all([Store.Sitzplan.get(k.id), Store.Schueler.byKlasse(k.id)]);
      plan.seats.forEach((s) => { s.schuelerId = null; });
      schueler.forEach((s, i) => { if (plan.seats[i]) plan.seats[i].schuelerId = s.id; });
      await Store.Sitzplan.save(plan); render();
    },
    "clear-seats": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const plan = await Store.Sitzplan.get(k.id);
      plan.seats.forEach((s) => { s.schuelerId = null; });
      await Store.Sitzplan.save(plan); render();
    },
    "seat-abwesend": async (el) => {
      const istAbwesend = await Store.Abwesenheiten.toggle(state.klasseId, el.getAttribute("data-id"), Store.datumLokal());
      render();
      UI.toast(istAbwesend ? "Heute als abwesend markiert" : "Wieder anwesend gemeldet");
    },

    // Tracker / Besprechung Navigation
    "open-tracker": () => trackerStartDialog(),
    "open-besprechung": () => { state.selectedSchuelerId = null; go("besprechung"); },
    "back-to-class": () => { stopHeatTimer(); go("klasse"); },
    "tracker-tap": (el) => trackerTap(el),
    "tracker-heat-edit": (el) => trackerHeatEditDialog(el.getAttribute("data-sid")),
    "tracker-abwesend": (el) => trackerAbwesendToggle(el.getAttribute("data-sid")),
    "tracker-undo": () => trackerUndo(),

    "besprechung-pick": (el) => { state.selectedSchuelerId = el.getAttribute("data-sid"); render(); },
    "besprechung-list": () => { state.selectedSchuelerId = null; render(); },
    "besprechung-next": async () => { await besprechungStep(1); },
    "besprechung-prev": async () => { await besprechungStep(-1); },

    "ausw-range": (el) => { state.auswertungRange = el.getAttribute("data-range"); render(); },
    "noten-hj": (el) => { state.notenHalbjahr = el.getAttribute("data-hj"); render(); },
    "ausw-hj": (el) => { state.auswertungHalbjahr = el.getAttribute("data-hj"); render(); },

    // Einstellungen / Backup
    "backup-export": async () => {
      const data = await Store.exportAll();
      CSV.downloadText("noten-fritze-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data, null, 2), "application/json");
      UI.toast("Backup exportiert");
    },
    "backup-import": () => backupImportDialog(),
    "reset-demo": async () => {
      if (await UI.confirmDialog("Demo-Daten laden?", "Nur möglich, wenn keine Klassen existieren, sonst bleiben deine Daten unberührt.", { okLabel: "Laden", danger: false })) {
        const ok = await Store.seedDemoData();
        UI.toast(ok ? "Demo-Daten geladen" : "Es sind bereits Klassen vorhanden");
        go("home");
      }
    },
    "delete-all": async () => {
      if (await UI.confirmDialog("Wirklich ALLE Daten löschen?", "Diese Aktion kann nicht rückgängig gemacht werden. Vorher am besten ein Backup exportieren.")) {
        await DB.clearAll(); go("home"); UI.toast("Alle Daten gelöscht");
      }
    }
  };

  // seat-assign braucht die aktuelle Klasse
  async function seatAssignDialog2(seatId) {
    const k = await Store.Klassen.get(state.klasseId);
    seatAssignDialog(k, seatId);
  }

  async function besprechungStep(dir) {
    const schueler = await Store.Schueler.byKlasse(state.klasseId);
    const idx = schueler.findIndex((s) => s.id === state.selectedSchuelerId);
    const j = idx + dir;
    if (j < 0 || j >= schueler.length) return;
    state.selectedSchuelerId = schueler[j].id; render();
  }

  // ---- Tracker: Tap & Undo -------------------------------------------------
  async function trackerTap(el) {
    const sid = el.getAttribute("data-sid");
    if (state.tracker && state.tracker.abwesend && state.tracker.abwesend[sid]) return; // abwesend: keine Ereignisse
    const typ = el.getAttribute("data-type");
    const punkte = state.settings.mitarbeitPunkte[typ];
    const heatDelta = typ === "einfach"
      ? Math.max(0, parseInt(state.settings.heatPunkteEinfach, 10) || 0)
      : typ === "gut"
        ? Math.max(0, parseInt(state.settings.heatPunkteGut, 10) || 0)
        : typ === "sehrgut"
          ? Math.max(0, parseInt(state.settings.heatPunkteSehrGut, 10) || 0)
          : 0;
    const e = Store.neuesEreignis(state.klasseId, sid, typ, punkte);
    e.heatDelta = heatDelta;
    e.halbjahr = parseInt(state.settings.aktuellesHalbjahr, 10) || 1;
    await Store.Ereignisse.save(e);

    const t = state.tracker;
    if (heatDelta > 0) {
      t.students[sid] = await Store.addHeatPoints(sid, heatDelta) || t.students[sid];
    }
    t.counts[sid] = (t.counts[sid] || 0) + 1;
    (t.typeCounts[sid] = t.typeCounts[sid] || {});
    t.typeCounts[sid][typ] = (t.typeCounts[sid][typ] || 0) + 1;
    t.undoStack.push(e);

    // Sofortiges Feedback direkt am getippten Button + Kachel aktualisieren
    el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
    renderSeatCounts(sid);

    const undoBtn = document.getElementById("undo-btn");
    if (undoBtn) undoBtn.disabled = false;

    const name = (t.names && t.names[sid]) ? t.names[sid] + " · " : "";
    UI.toast(name + Store.EVENT_TYPE_MAP[typ].label, { undo: () => undoEvent(e) });
  }

  async function trackerUndo() {
    const t = state.tracker;
    if (!t.undoStack.length) return;
    const e = t.undoStack.pop();
    await undoEvent(e, true);
  }
  async function undoEvent(e, fromStack) {
    await Store.Ereignisse.remove(e.id);
    const t = state.tracker;
    if (!fromStack) { const i = t.undoStack.findIndex((x) => x.id === e.id); if (i >= 0) t.undoStack.splice(i, 1); }
    t.counts[e.schuelerId] = Math.max(0, (t.counts[e.schuelerId] || 1) - 1);
    if (t.typeCounts[e.schuelerId]) {
      t.typeCounts[e.schuelerId][e.typ] = Math.max(0, (t.typeCounts[e.schuelerId][e.typ] || 1) - 1);
    }
    if (e.heatDelta > 0) {
      t.students[e.schuelerId] = await Store.addHeatPoints(e.schuelerId, -e.heatDelta) || t.students[e.schuelerId];
    }

    renderSeatCounts(e.schuelerId);

    const undoBtn = document.getElementById("undo-btn");
    if (undoBtn) undoBtn.disabled = t.undoStack.length === 0;
    UI.toast("Rückgängig gemacht");
  }

  // ---- Delegation ----------------------------------------------------------
  function initDelegation() {
    document.body.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      const action = el.getAttribute("data-action");
      if (ACTIONS[action]) { ev.preventDefault(); ACTIONS[action](el, ev); }
    });
  }

  Object.assign(global.Views, { initDelegation });
})(window);
