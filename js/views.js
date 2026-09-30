/* =========================================================================
   views.js – Aktions-Dispatcher: zentrale Delegation über [data-action].
   Lädt nach den View-Modulen (views.core.js, views.*.js) und holt sich deren
   Funktionen aus window.Views; aufgerufen werden die Actions erst zur Laufzeit.
   Die Action-Map verteilt nur – Logik gehört in das Modul des Bereichs.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render } = global.Views;
  const {
    klasseDialog, splitsDialog, schuelerDialog, kategorieDialog, leistungDialog,
    studentDetailDialog, seatAssignDialog, sitzplanNeuDialog, sitzplanUmbenennenDialog,
    sitzplanFormUmschalten, sitzplanVorlage, sitzplanRegelnDialog, sitzplanAutomatisch,
    importStudentsDialog, backupImportDialog,
    schwellenDialog, mitarbeitHerleitungDialog, quartalAbschliessenDialog, klassenImportDialog,
    trackerStartDialog, trackerModusToggle, trackerModusEnde, trackerModusTap,
    trackerStundeBeenden, trackerVerlassen, trackerRaumDialog, trackerTap, trackerUndo, trackerHeatPause,
    besprechungStep, stundenzeitenAktion,
    stundenplanEinrichten, ansichtSetzen, wocheBlaettern, stundenplanZelle, abWocheUmstellen, plaeneDialog,
    monatBlaettern, monatTag, ansichtWechseln, terminBearbeiten, terminNeu,
    bausteinNeu, planungZurueck, planungKlasse, planungTracker, planungMenue, planungUebernehmen, fahrplanDialog
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
      const status = await CSV.exportSchueler(k, await Store.Schueler.byKlasse(k.id));
      exportToast(status, "CSV");
    },

    "add-category": async () => kategorieDialog(await Store.Klassen.get(state.klasseId)),
    "edit-category": async (el) => kategorieDialog(await Store.Klassen.get(state.klasseId), await Store.Kategorien.get(el.getAttribute("data-id"))),
    "delete-category": async (el) => {
      const c = await Store.Kategorien.get(el.getAttribute("data-id"));
      if (await UI.confirmDialog("Kategorie löschen?", "„" + c.name + "“ und alle darin erfassten Noten werden gelöscht.")) {
        await Store.Kategorien.remove(c.id); render();
      }
    },

    "add-leistung": async () => leistungDialog(await Store.Klassen.get(state.klasseId), null),
    "student-detail": async (el) => studentDetailDialog(await Store.Klassen.get(state.klasseId), el.getAttribute("data-sid")),

    "export-noten": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const [s, kt, n] = await Promise.all([
        Store.Schueler.byKlasse(k.id), Store.Kategorien.byKlasse(k.id), Store.Noten.byKlasse(k.id)
      ]);
      exportToast(await CSV.exportNoten(k, s, kt, n), "Noten-CSV");
    },
    "export-einzelnoten": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const [s, kt, n, l] = await Promise.all([
        Store.Schueler.byKlasse(k.id), Store.Kategorien.byKlasse(k.id),
        Store.Noten.byKlasse(k.id), Store.Leistungen.byKlasse(k.id)
      ]);
      exportToast(await CSV.exportEinzelnoten(k, s, kt, n, l), "Einzelnoten-CSV");
    },
    "export-events": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const [s, e] = await Promise.all([Store.Schueler.byKlasse(k.id), Store.Ereignisse.byKlasse(k.id)]);
      exportToast(await CSV.exportEreignisse(k, s, e), "Mitarbeit-CSV");
    },

    // Sitzplan
    "seat-assign": async (el) => seatAssignDialog(await Store.Klassen.get(state.klasseId), el.getAttribute("data-seat")),
    "sitzplan-waehlen": async (el) => { await Store.Sitzplan.setAktiv(state.klasseId, el.getAttribute("data-id")); render(); },
    "sitzplan-neu": async () => sitzplanNeuDialog(await Store.Klassen.get(state.klasseId)),
    "sitzplan-umbenennen": async () => sitzplanUmbenennenDialog(await Store.Klassen.get(state.klasseId)),
    "sitzplan-loeschen": async () => {
      const plan = await Store.Sitzplan.get(state.klasseId);
      if (await UI.confirmDialog("Sitzplan löschen?", "Der Sitzplan „" + plan.name + "“ wird gelöscht. Noten und Mitarbeit bleiben unberührt.")) {
        await Store.Sitzplan.remove(state.klasseId, plan.id); render();
      }
    },
    "set-grid": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const plan = await Store.Sitzplan.get(k.id);
      const rows = Math.max(1, Math.min(12, parseInt(UI.$("#grid-rows").value, 10) || plan.rows));
      const cols = Math.max(1, Math.min(15, parseInt(UI.$("#grid-cols").value, 10) || plan.cols));
      // Neues Raster, bestehende Zuweisungen soweit möglich übernehmen
      const alt = {}, gang = {};
      plan.seats.forEach((s) => { alt[s.id] = s.schuelerId; gang[s.id] = s.keinPlatz; });
      const np = Store.neuerSitzplan(k.id, rows, cols, plan.name);
      np.id = plan.id;
      np.seats.forEach((s) => { if (alt[s.id]) s.schuelerId = alt[s.id]; if (gang[s.id]) s.keinPlatz = true; });
      await Store.Sitzplan.save(np); render();
    },
    "auto-seat": async () => sitzplanAutomatisch(await Store.Klassen.get(state.klasseId)),
    "sitzplan-regeln": async () => sitzplanRegelnDialog(await Store.Klassen.get(state.klasseId)),
    "clear-seats": async () => {
      const k = await Store.Klassen.get(state.klasseId);
      const plan = await Store.Sitzplan.get(k.id);
      plan.seats.forEach((s) => { s.schuelerId = null; });
      await Store.Sitzplan.save(plan); render();
    },
    "sitzplan-gestalten": () => { state.sitzplanGestalten = !state.sitzplanGestalten; render(); },
    "seat-form": (el) => sitzplanFormUmschalten(el.getAttribute("data-seat")),
    "sitzplan-vorlage": (el) => sitzplanVorlage(el.getAttribute("data-vorlage")),
    "seat-abwesend": async (el) => {
      const istAbwesend = await Store.Abwesenheiten.toggle(state.klasseId, el.getAttribute("data-id"), Store.datumLokal());
      render();
      UI.toast(istAbwesend ? "Heute als abwesend markiert" : "Wieder anwesend gemeldet");
    },

    // Tracker / Besprechung Navigation
    "open-tracker": () => trackerStartDialog(),

    // Startseite: Klassen · Stundenplan (views.stundenplan.js)
    "home-ansicht": async (el) => { await ansichtSetzen(el.getAttribute("data-ansicht")); render(); },
    "sp-einrichten": () => stundenplanEinrichten(),
    "sp-woche": (el) => wocheBlaettern(el.getAttribute("data-schritt")),
    "sp-bearbeiten": () => { state.stundenplanBearbeiten = !state.stundenplanBearbeiten; render(); },
    "sp-zelle": (el) => stundenplanZelle(el),
    "sp-ab": () => abWocheUmstellen(),
    "sp-archiv": () => plaeneDialog(),
    // Kalender (views.kalender.js)
    "sp-ansicht": (el) => ansichtWechseln(el.getAttribute("data-ansicht")),
    "mo-blaettern": (el) => monatBlaettern(el.getAttribute("data-schritt")),
    "mo-tag": (el) => monatTag(el.getAttribute("data-datum")),
    "termin-neu": () => terminNeu(),
    "termin-bearbeiten": (el) => terminBearbeiten(el.getAttribute("data-id")),
    // Stundenplanung (views.planung.js)
    "planung-neu": (el) => bausteinNeu(el.getAttribute("data-typ")),
    "planung-zurueck": () => planungZurueck(),
    "planung-klasse": () => planungKlasse(),
    "planung-tracker": () => planungTracker(),
    "planung-menue": () => planungMenue(),
    "planung-uebernehmen": () => planungUebernehmen(),
    "tracker-fahrplan": () => state.tracker && fahrplanDialog(state.klasseId, state.tracker.stunde),
    // Startseite: vergessene Stunde einer Klasse ansehen (Tracker-Start fragt nach)
    "offene-stunde": async (el) => {
      await go("klasse", { klasseId: el.getAttribute("data-id"), tab: "schueler" });
      await trackerStartDialog();
    },
    "open-besprechung": () => { state.selectedSchuelerId = null; go("besprechung"); },
    "back-to-class": async () => { if (state.view === "tracker") await trackerVerlassen(); go("klasse"); },
    "tracker-tap": (el) => trackerTap(el),
    "tracker-raum": () => trackerRaumDialog(),
    "tracker-modus": (el) => trackerModusToggle(el.getAttribute("data-modus")),
    "tracker-modus-ende": () => trackerModusEnde(),
    "tracker-modus-tap": (el) => trackerModusTap(el.getAttribute("data-sid")),
    "tracker-stunde-beenden": () => trackerStundeBeenden(),
    "tracker-undo": () => trackerUndo(),
    "tracker-heat-pause": () => trackerHeatPause(),

    "besprechung-pick": (el) => { state.selectedSchuelerId = el.getAttribute("data-sid"); render(); },
    "besprechung-list": () => { state.selectedSchuelerId = null; render(); },
    "besprechung-next": async () => { await besprechungStep(1); },
    "besprechung-prev": async () => { await besprechungStep(-1); },

    "ausw-range": (el) => { state.auswertungRange = el.getAttribute("data-range"); render(); },
    "edit-schwellen": async () => schwellenDialog(await Store.Klassen.get(state.klasseId)),
    "ausw-herleitung": async (el) => mitarbeitHerleitungDialog(el.getAttribute("data-sid")),
    "noten-hj": (el) => { state.notenHalbjahr = el.getAttribute("data-hj"); render(); },
    "noten-spalten-reset": () => { state.notenSpalten = null; render(); },
    "ausw-hj": (el) => { state.auswertungQuartal = el.getAttribute("data-hj"); render(); },

    // Einstellungen / Backup
    "backup-export": async () => {
      const data = await Store.exportAll();
      const status = await CSV.speichern(
        "noten-fritze-backup-" + new Date().toISOString().slice(0, 10) + ".json",
        JSON.stringify(data, null, 2), "application/json");
      exportToast(status, "Backup");
    },
    "backup-import": () => backupImportDialog(),
    // Stundenzeiten: Stunde anhängen/entfernen, Pause anlegen/entfernen, Lücken füllen
    "stundenzeiten": (el) => stundenzeitenAktion(el.getAttribute("data-was"), el.getAttribute("data-id")),

    // Klasse exportieren / importieren / löschen
    "export-klasse": async (el) => {
      const id = state.klasseId || el.getAttribute("data-id");
      const data = await Store.exportKlasse(id);
      const status = await CSV.speichern(
        "klasse_" + CSV.safe(data.data.klasse.name) + ".json",
        JSON.stringify(data, null, 2), "application/json");
      exportToast(status, "Klasse");
    },
    "import-klasse": () => klassenImportDialog(),
    "delete-class": async (el) => {
      const k = await Store.Klassen.get(el.getAttribute("data-id"));
      if (!k) return;
      const ok = await UI.confirmDialog("Klasse löschen?",
        "„" + k.name + "“ und alle zugehörigen Schüler, Noten, Ereignisse, Stunden, Abwesenheiten und der Sitzplan werden gelöscht.");
      if (!ok) return;
      await Store.Klassen.remove(k.id);
      UI.toast("Klasse gelöscht");
      if (state.klasseId === k.id) go("home"); else render();
    },

    // Mitarbeit: Quartal abschließen (Dialog in views.dialoge.js)
    "quartal-abschliessen": () => quartalAbschliessenDialog(),
    "abschluss-aufheben": async (el) => {
      const k = await Store.Klassen.get(state.klasseId);
      const q = parseInt(el.getAttribute("data-q"), 10);
      if (!k || !q) return;
      const ok = await UI.confirmDialog("Abschluss aufheben?",
        "Das " + q + ". Quartal wird wieder freigegeben: Tracker und Abschluss sind erneut möglich. " +
        "Die bereits übertragene Mitarbeitsnote bleibt stehen.",
        { okLabel: "Aufheben", danger: false });
      if (!ok) return;
      await Store.abschlussAufheben(k, q);
      render();
      UI.toast(q + ". Quartal wieder freigegeben");
    },

    // Export-Ordner (File System Access API, Chrome/Edge)
    "export-ordner-waehlen": async () => {
      if (!window.showDirectoryPicker) { UI.toast("Dieser Browser kann keinen Ordner wählen"); return; }
      try {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        await CSV.exportOrdnerSetzen(handle);
        render();
        UI.toast("Export-Ordner gespeichert");
      } catch (e) { /* AbortError: Nutzer hat abgebrochen -> nichts tun */ }
    },
    "export-ordner-vergessen": async () => {
      await CSV.exportOrdnerVergessen();
      render();
      UI.toast("Export-Ordner entfernt");
    },
    "reset-demo": async () => {
      if (await UI.confirmDialog("Demo-Daten laden?", "Nur möglich, wenn keine Klassen existieren, sonst bleiben deine Daten unberührt.", { okLabel: "Laden", danger: false })) {
        const ok = await Store.seedDemoData();
        UI.toast(ok ? "Demo-Daten geladen" : "Es sind bereits Klassen vorhanden");
        go("home");
      }
    },
    "seed-beispielklassen": async () => {
      const ok = await UI.confirmDialog("Beispielklassen anlegen?",
        "Angelegt werden „9a (Beispiel)“ mit Schulnoten und „Mathematik LK 12 (Beispiel)“ mit MSS-Punkten – " +
        "beide mit einem kompletten Beispieljahr. Deine vorhandenen Klassen bleiben unverändert; " +
        "gibt es eine davon schon, wird sie übersprungen.",
        { okLabel: "Anlegen", danger: false });
      if (!ok) return;
      const erg = await Store.seedBeispielklassen();
      const namen = (liste) => liste.map((n) => "„" + n + "“").join(" und ");
      const teile = [];
      if (erg.angelegt.length) teile.push(namen(erg.angelegt) + " angelegt");
      if (erg.uebersprungen.length) {
        teile.push(namen(erg.uebersprungen) + " gibt es schon – übersprungen");
      }
      UI.toast(teile.join(" · "), { duration: 6000 });
      go("home");
    },
    "delete-all": async () => {
      if (await UI.confirmDialog("Wirklich ALLE Daten löschen?", "Diese Aktion kann nicht rückgängig gemacht werden. Vorher am besten ein Backup exportieren.")) {
        await DB.clearAll(); go("home"); UI.toast("Alle Daten gelöscht");
      }
    }
  };

  // Toast je nach Ergebnis von CSV.speichern ("abgebrochen" = kein Toast)
  function exportToast(status, label) {
    if (status === "ordner") UI.toast(label + " im Export-Ordner gespeichert");
    else if (status === "teilen") UI.toast(label + " geteilt");
    else if (status === "download") UI.toast(label + " exportiert");
  }


  // ---- Delegation ----------------------------------------------------------
  function initDelegation() {
    document.body.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-action]");
      if (!el) return;
      const action = el.getAttribute("data-action");
      if (!ACTIONS[action]) return;
      ev.preventDefault();
      // Fehler einer Aktion (auch asynchron) als Toast melden
      try {
        Promise.resolve(ACTIONS[action](el, ev)).catch(UI.fehlerMelden);
      } catch (e) { UI.fehlerMelden(e); }
    });
    // Esc beendet einen aktiven Tracker-Modus (Tastatur am iPad/Desktop)
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (state.view === "tracker" && state.trackerModus) { ev.preventDefault(); trackerModusEnde(); }
    });
  }

  Object.assign(global.Views, { initDelegation });
})(window);
