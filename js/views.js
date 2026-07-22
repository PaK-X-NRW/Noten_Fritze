/* =========================================================================
   views.js – Screens, Routing und Interaktion
   Eine leichte, zustandsgesteuerte Render-Schleife (kein Framework).
   Zentrale Aktions-Delegation über [data-action]-Attribute.
   ========================================================================= */
(function (global) {
  "use strict";

  const state = {
    view: "home",          // home | klasse | tracker | besprechung | einstellungen
    klasseId: null,
    tab: "schueler",       // schueler | noten | kategorien | sitzplan | auswertung
    auswertungRange: "alle",
    // Besprechung
    selectedSchuelerId: null,
    // Tracker (flüchtig)
    tracker: null,
    settings: null
  };

  // ---- Navigation ----------------------------------------------------------
  async function go(view, params) {
    Object.assign(state, params || {});
    state.view = view;
    if (view === "klasse" && state.klasseId) await Store.Klassen.touchOpened(state.klasseId);
    await render();
    document.getElementById("view").scrollTop = 0;
  }

  async function render() {
    state.settings = await Store.getSettings();
    let out;
    switch (state.view) {
      case "home":         out = await ViewHome(); break;
      case "klasse":       out = await ViewKlasse(); break;
      case "tracker":      out = await ViewTracker(); break;
      case "besprechung":  out = await ViewBesprechung(); break;
      case "einstellungen":out = await ViewEinstellungen(); break;
      default:             out = await ViewHome();
    }
    document.getElementById("topbar").innerHTML = out.topbar || "";
    document.getElementById("view").innerHTML = '<div class="container">' + (out.body || "") + "</div>";
    if (out.mount) out.mount();
  }

  // =========================================================================
  //  HOME – Klassenübersicht
  // =========================================================================
  async function ViewHome() {
    const klassen = (await Store.Klassen.all())
      .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));

    const STALE = 14 * 86400000;
    const cards = klassen.map((k) => {
      const stale = (Store.now() - (k.lastOpenedAt || 0)) > STALE;
      const dot = stale ? "#c62828" : "#2e7d32";
      const typLabel = k.typ === "hauptfach" ? "Hauptfach" : "Nebenfach";
      return (
        '<div class="card class-card" data-action="open-class" data-id="' + k.id + '">' +
          '<div class="chips">' +
            '<span class="chip accent">' + UI.esc(k.fach || "Fach") + "</span>" +
            '<span class="chip">' + UI.esc(typLabel) + "</span>" +
            (k.schuljahr ? '<span class="chip">' + UI.esc(k.schuljahr) + "</span>" : "") +
          "</div>" +
          '<div class="name">' + UI.esc(k.name || "(ohne Namen)") + "</div>" +
          '<div class="foot">' +
            '<span class="hstack"><span class="stale-dot" style="background:' + dot + '"></span>' +
              (stale ? "lange nicht geöffnet" : "zuletzt " + UI.relZeit(k.lastOpenedAt)) + "</span>" +
            '<span>›</span>' +
          "</div>" +
        "</div>"
      );
    }).join("");

    const body = klassen.length
      ? '<div class="grid cards">' + cards + "</div>"
      : '<div class="empty"><div class="big">🎓</div><p>Noch keine Klassen vorhanden.</p>' +
        '<button class="btn primary" data-action="add-class">Erste Klasse anlegen</button></div>';

    const topbar =
      '<div class="title-wrap"><h1 class="main">Noten-Fritze</h1>' +
      '<span class="sub">' + klassen.length + " Klasse" + (klassen.length === 1 ? "" : "n") + "</span></div>" +
      '<div class="grow"></div>' +
      '<button class="iconbtn" data-action="settings" title="Einstellungen">⚙️</button>' +
      '<button class="btn primary" data-action="add-class">＋ Klasse</button>';

    return { topbar, body };
  }

  // =========================================================================
  //  KLASSE – mit Tabs
  // =========================================================================
  async function ViewKlasse() {
    const k = await Store.Klassen.get(state.klasseId);
    if (!k) { return ViewHome(); }

    const tabs = [
      ["schueler", "Schüler/innen"],
      ["noten", "Noten"],
      ["kategorien", "Kategorien"],
      ["sitzplan", "Sitzplan"],
      ["auswertung", "Mitarbeit"]
    ].map(([id, label]) =>
      '<button class="tab ' + (state.tab === id ? "active" : "") + '" data-action="class-tab" data-tab="' + id + '">' + label + "</button>"
    ).join("");

    let inner = "";
    if (state.tab === "schueler")   inner = await TabSchueler(k);
    else if (state.tab === "noten") inner = await TabNoten(k);
    else if (state.tab === "kategorien") inner = await TabKategorien(k);
    else if (state.tab === "sitzplan")   inner = await TabSitzplan(k);
    else if (state.tab === "auswertung") inner = await TabAuswertung(k);

    const topbar =
      '<button class="iconbtn plain" data-action="home" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">' + UI.esc(k.name) + "</h1>" +
      '<span class="sub">' + UI.esc(k.fach) + " · " + UI.esc(k.schuljahr || "") + "</span></div>" +
      '<div class="grow"></div>' +
      '<button class="btn" data-action="edit-class">Bearbeiten</button>' +
      '<button class="btn" data-action="open-besprechung">Besprechung</button>' +
      '<button class="btn primary" data-action="open-tracker">▶︎ Tracker</button>';

    const body = '<div class="tabs">' + tabs + "</div>" + inner;
    return { topbar, body, mount: () => mountKlasse(k) };
  }

  function mountKlasse(k) {
    if (state.tab === "sitzplan") mountSitzplanEditor(k);
  }

  // ---- Tab: Schüler --------------------------------------------------------
  async function TabSchueler(k) {
    const schueler = await Store.Schueler.byKlasse(k.id);
    const rows = schueler.map((s, i) =>
      "<tr>" +
        '<td class="num muted">' + (i + 1) + "</td>" +
        "<td><strong>" + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
        "<td>" + UI.esc(s.bemerkung || "") + "</td>" +
        '<td class="right nowrap">' +
          '<button class="iconbtn plain" data-action="move-student" data-id="' + s.id + '" data-dir="up" title="Nach oben">▲</button>' +
          '<button class="iconbtn plain" data-action="move-student" data-id="' + s.id + '" data-dir="down" title="Nach unten">▼</button>' +
          '<button class="iconbtn plain" data-action="edit-student" data-id="' + s.id + '" title="Bearbeiten">✎</button>' +
          '<button class="iconbtn plain danger-text" data-action="delete-student" data-id="' + s.id + '" title="Löschen">🗑</button>' +
        "</td>" +
      "</tr>"
    ).join("");

    const table = schueler.length
      ? '<div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Bemerkung</th><th class="right">Aktionen</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
      : '<div class="empty"><div class="big">🧑‍🏫</div><p>Noch keine Schüler/innen.</p></div>';

    return (
      '<div class="btn-row" style="margin-bottom:var(--gap)">' +
        '<button class="btn primary" data-action="add-student">＋ Schüler/in</button>' +
        '<button class="btn" data-action="import-students">CSV importieren</button>' +
        '<button class="btn" data-action="export-students">CSV exportieren</button>' +
      "</div>" + table
    );
  }

  // ---- Tab: Kategorien -----------------------------------------------------
  async function TabKategorien(k) {
    const kats = await Store.Kategorien.byKlasse(k.id);
    function gruppe(art, titel) {
      const list = kats.filter((c) => c.art === art);
      const gewSumme = list.reduce((a, c) => a + (Number(c.gewichtung) || 0), 0) || 1;
      const rows = list.map((c) => {
        const anteil = ((Number(c.gewichtung) || 0) / gewSumme * 100).toFixed(0);
        return "<tr>" +
          "<td><strong>" + UI.esc(c.name) + "</strong></td>" +
          '<td class="num">' + UI.esc(String(c.gewichtung)) + "</td>" +
          '<td class="num">' + anteil + " %</td>" +
          '<td class="right nowrap">' +
            '<button class="iconbtn plain" data-action="edit-category" data-id="' + c.id + '">✎</button>' +
            '<button class="iconbtn plain danger-text" data-action="delete-category" data-id="' + c.id + '">🗑</button>' +
          "</td></tr>";
      }).join("");
      return (
        '<div class="card"><h2>' + titel + "</h2>" +
        (list.length
          ? '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Kategorie</th><th class="num">Gewicht</th><th class="num">Anteil in Gruppe</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
          : '<p class="muted">Keine Kategorien in dieser Gruppe.</p>') +
        "</div>"
      );
    }

    return (
      '<div class="card"><div class="hstack wrap">' +
        "<div class=\"grow\"><h2>Gewichtung schriftlich / sonstige</h2>" +
        '<p class="muted">Aktuell: <strong>' + k.anteilSchriftlich + " %</strong> schriftlich · <strong>" + k.anteilSonstige + " %</strong> sonstige · Fachtyp: " + (k.typ === "hauptfach" ? "Hauptfach" : "Nebenfach") + "</p></div>" +
        '<button class="btn" data-action="edit-splits">Anteile ändern</button>' +
      "</div></div>" +
      '<div class="btn-row" style="margin:var(--gap) 0">' +
        '<button class="btn primary" data-action="add-category">＋ Kategorie</button>' +
      "</div>" +
      gruppe("schriftlich", "Schriftliche Leistungen") +
      gruppe("sonstige", "Sonstige Leistungen")
    );
  }

  // ---- Tab: Noten ----------------------------------------------------------
  async function TabNoten(k) {
    const [schueler, kats, notenAll] = await Promise.all([
      Store.Schueler.byKlasse(k.id),
      Store.Kategorien.byKlasse(k.id),
      Store.Noten.byKlasse(k.id)
    ]);
    if (!schueler.length) return '<div class="empty"><div class="big">📋</div><p>Erst Schüler/innen anlegen.</p></div>';
    if (!kats.length) return '<div class="empty"><div class="big">🏷️</div><p>Erst Kategorien anlegen.</p><button class="btn primary" data-action="class-tab" data-tab="kategorien">Zu den Kategorien</button></div>';

    const notenBySchueler = {};
    notenAll.forEach((n) => (notenBySchueler[n.schuelerId] = notenBySchueler[n.schuelerId] || []).push(n));

    const kopf = "<tr><th>Name</th>" + kats.map((c) =>
      '<th class="num">' + UI.esc(c.name) + '<br><span class="muted" style="text-transform:none;font-weight:400">' +
        (c.art === "schriftlich" ? "schriftl." : "sonst.") + " · Gew " + c.gewichtung + "</span></th>"
    ).join("") + '<th class="num">Gesamt</th></tr>';

    const body = schueler.map((s) => {
      const res = Calc.berechneSchueler(kats, notenBySchueler[s.id] || [], k, state.settings.rundung);
      const zellen = kats.map((c) => {
        const ke = res.kategorien.find((x) => x.id === c.id);
        const hat = ke && ke.schnitt !== null;
        const badge = hat
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(ke.schnitt) + '">' + Calc.formatNote(ke.schnitt) + "</span>"
          : '<span class="muted">–</span>';
        const anz = ke && ke.anzahl ? '<span class="muted"> n=' + ke.anzahl + "</span>" : "";
        return '<td class="num pointer row-hover" data-action="edit-cell" data-sid="' + s.id + '" data-cid="' + c.id + '">' + badge + anz + "</td>";
      }).join("");
      const gBadge = res.gesamt !== null
        ? '<span class="note-badge" style="background:' + Calc.noteFarbe(res.gesamt) + '">' + Calc.formatNote(res.gesamt, state.settings.rundung === "ganze" ? 0 : (state.settings.rundung === "keine" ? 2 : 1)) + "</span>"
        : "–";
      return "<tr>" +
        '<td class="pointer" data-action="student-detail" data-sid="' + s.id + '"><strong>' + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
        zellen +
        '<td class="num">' + gBadge + "</td></tr>";
    }).join("");

    return (
      '<div class="hstack wrap" style="margin-bottom:var(--gap)">' +
        '<div class="grow muted">Tippe auf eine Zelle, um Einzelnoten zu erfassen. Tippe auf den Namen für die Berechnung.</div>' +
        '<button class="btn small" data-action="export-noten">Noten-CSV</button>' +
        '<button class="btn small" data-action="export-einzelnoten">Einzelnoten-CSV</button>' +
      "</div>" +
      '<div class="table-wrap"><table><thead>' + kopf + "</thead><tbody>" + body + "</tbody></table></div>"
    );
  }

  // ---- Tab: Sitzplan (Editor) ---------------------------------------------
  async function TabSitzplan(k) {
    const [plan, schueler] = await Promise.all([Store.Sitzplan.get(k.id), Store.Schueler.byKlasse(k.id)]);
    const sMap = {}; schueler.forEach((s) => (sMap[s.id] = s));
    const belegt = plan.seats.filter((x) => x.schuelerId).length;

    const seats = plan.seats.map((seat) => {
      const s = seat.schuelerId ? sMap[seat.schuelerId] : null;
      if (s) {
        return '<div class="seat" data-action="seat-assign" data-seat="' + seat.id + '">' +
          '<div class="nm">' + UI.esc(s.vorname) + "</div><div class=\"sub\">" + UI.esc(s.nachname) + "</div></div>";
      }
      return '<div class="seat empty" data-action="seat-assign" data-seat="' + seat.id + '">＋</div>';
    }).join("");

    return (
      '<div class="plan-toolbar">' +
        '<div class="hstack"><label class="muted">Reihen</label><input id="grid-rows" type="number" inputmode="numeric" min="1" max="12" value="' + plan.rows + '" style="width:80px"></div>' +
        '<div class="hstack"><label class="muted">Spalten</label><input id="grid-cols" type="number" inputmode="numeric" min="1" max="12" value="' + plan.cols + '" style="width:80px"></div>' +
        '<button class="btn" data-action="set-grid">Raster anwenden</button>' +
        '<button class="btn" data-action="auto-seat">Automatisch belegen</button>' +
        '<button class="btn" data-action="clear-seats">Leeren</button>' +
        '<div class="grow"></div>' +
        '<span class="muted">' + belegt + " / " + schueler.length + ' belegt</span>' +
        '<button class="btn primary" data-action="open-tracker">▶︎ Tracker starten</button>' +
      "</div>" +
      '<div class="seatgrid" style="--cols:' + plan.cols + '">' + seats + "</div>"
    );
  }
  function mountSitzplanEditor(k) { /* Grid-Inputs werden über Buttons gelesen */ }

  // ---- Tab: Mitarbeit-Auswertung ------------------------------------------
  async function TabAuswertung(k) {
    const [schueler, ereignisse] = await Promise.all([
      Store.Schueler.byKlasse(k.id), Store.Ereignisse.byKlasse(k.id)
    ]);
    const now = Store.now();
    const ranges = { alle: 0, "30": 30 * 86400000, "7": 7 * 86400000 };
    const von = state.auswertungRange === "alle" ? 0 : now - ranges[state.auswertungRange];
    const ausw = Calc.auswertungMitarbeit(ereignisse, state.settings, von, now);

    const rangeBtns = [["alle", "Gesamt"], ["30", "30 Tage"], ["7", "7 Tage"]].map(([id, l]) =>
      '<button class="tab ' + (state.auswertungRange === id ? "active" : "") + '" data-action="ausw-range" data-range="' + id + '">' + l + "</button>"
    ).join("");

    const rows = schueler.map((s) => {
      const a = ausw[s.id];
      const typen = a ? Store.EVENT_TYPES.filter((t) => a.typen[t.id]).map((t) =>
        '<span class="chip" style="background:' + t.farbe + '22;color:' + t.farbe + '">' + (a.typen[t.id]) + "× " + UI.esc(t.kurz) + "</span>").join(" ") : "";
      const note = a ? a.notenvorschlag : null;
      return "<tr>" +
        "<td><strong>" + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
        '<td class="num">' + (a ? a.anzahl : 0) + "</td>" +
        '<td class="num">' + (a ? a.punkte : 0) + "</td>" +
        '<td class="num">' + (a ? a.punkteProTag.toFixed(1).replace(".", ",") : "–") + "</td>" +
        "<td>" + (a && a.letzte ? UI.relZeit(a.letzte) : '<span class="danger-text">nie</span>') + "</td>" +
        '<td class="num">' + (note ? '<span class="note-badge" style="background:' + Calc.noteFarbe(note) + '">' + note + "</span>" : "–") + "</td>" +
        "<td>" + typen + "</td>" +
      "</tr>";
    }).join("");

    return (
      '<div class="hstack wrap" style="margin-bottom:var(--gap)">' +
        '<div class="tabs" style="margin:0">' + rangeBtns + "</div>" +
        '<div class="grow"></div>' +
        '<button class="btn small" data-action="export-events">Mitarbeit-CSV</button>' +
      "</div>" +
      '<p class="muted">Notenvorschlag = Ø Punkte pro aktivem Tag, gemappt über die Schwellen in den Einstellungen. Nur ein Vorschlag – bitte prüfen.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th class="num">Meld.</th><th class="num">Punkte</th><th class="num">Ø/Tag</th><th>Zuletzt</th><th class="num">Vorschlag</th><th>Aufschlüsselung</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
    );
  }

  // =========================================================================
  //  TRACKER
  // =========================================================================
  async function ViewTracker() {
    const k = await Store.Klassen.get(state.klasseId);
    const [plan, schueler, ereignisse] = await Promise.all([
      Store.Sitzplan.get(k.id), Store.Schueler.byKlasse(k.id), Store.Ereignisse.byKlasse(k.id)
    ]);
    const sMap = {}; schueler.forEach((s) => (sMap[s.id] = s));

    // Flüchtigen Tracker-Zustand initialisieren
    const heute0 = new Date(); heute0.setHours(0, 0, 0, 0);
    // counts = heutige Meldungen gesamt; typeCounts = heutige Meldungen je Typ.
    // last bleibt session-basiert (leer), damit die Heatmap pro Stunde neu läuft.
    const counts = {}, typeCounts = {}, last = {}, names = {};
    schueler.forEach((s) => { names[s.id] = UI.vollerName(s); });
    ereignisse.forEach((e) => {
      if (e.timestamp < heute0.getTime()) return;
      counts[e.schuelerId] = (counts[e.schuelerId] || 0) + 1;
      (typeCounts[e.schuelerId] = typeCounts[e.schuelerId] || {});
      typeCounts[e.schuelerId][e.typ] = (typeCounts[e.schuelerId][e.typ] || 0) + 1;
    });
    state.tracker = {
      openedAt: Store.now(),
      counts, typeCounts, last, names, students: sMap, undoStack: [], heatTimer: null
    };

    // Legende erklärt Farbe + Kurzlabel der Buttons auf den Kacheln
    const legende = Store.EVENT_TYPES.map((t) =>
      '<span class="lg"><span class="dot" style="background:' + t.farbe + '"></span>' +
        UI.esc(t.label) + ' <span class="muted">(' +
        (state.settings.mitarbeitPunkte[t.id] > 0 ? "+" : "") + state.settings.mitarbeitPunkte[t.id] + ")</span></span>"
    ).join("");

    const seats = plan.seats.map((seat) => seatTrackerHTML(seat, sMap)).join("");

    const topbar =
      '<button class="iconbtn plain" data-action="back-to-class" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Mitarbeit · ' + UI.esc(k.name) + "</h1>" +
      '<span class="sub">Tippe direkt den passenden Button auf der Kachel</span></div>' +
      '<div class="grow"></div>' +
      '<button class="btn" data-action="tracker-undo" id="undo-btn" disabled>↶ Rückgängig</button>';

    const body =
      '<div class="plan-toolbar tracker-toolbar">' +
        '<div class="tracker-legend">' + legende + "</div>" +
        '<div class="grow"></div>' +
        '<div class="legend">viel <span class="bar"></span> wenig</div>' +
      "</div>" +
      '<div class="tracker-scroll"><div class="seatgrid tracker-grid" id="tracker-grid" style="--cols:' + plan.cols + '">' + seats + "</div></div>" +
      (schueler.length ? "" : '<div class="empty">Kein Sitzplan belegt. Lege im Tab „Sitzplan“ Plätze an.</div>');

    return { topbar, body, mount: startHeatTimer };
  }

  function seatTrackerHTML(seat, sMap) {
    const s = seat.schuelerId ? sMap[seat.schuelerId] : null;
    if (!s) return '<div class="seat tracker empty">·</div>';
    const t = state.tracker;
    const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, state.settings.heatVerfallMinuten, state.settings.heatVerfallPunkte);
    const bg = Calc.heatFarbeDurchPunkte(heat.heatPoints);
    const total = t.counts[s.id] || 0;
    const tc = t.typeCounts[s.id] || {};

    // Pro Ereignistyp ein eigener Button direkt auf der Kachel
    const buttons = Store.EVENT_TYPES.map((et) => {
      const c = tc[et.id] || 0;
      return '<button class="typebtn" data-action="tracker-tap" data-sid="' + s.id + '" data-type="' + et.id + '" style="--c:' + et.farbe + '">' +
        '<span class="tlabel">' + UI.esc(et.kurz) + "</span>" +
        '<span class="tcount">' + (c ? c : "") + "</span>" +
      "</button>";
    }).join("");

    const heatEdit = '<button class="typebtn gear" data-action="tracker-heat-edit" data-sid="' + s.id + '" title="Heatmap bearbeiten">' +
      '<span class="tlabel">⚙️</span>' +
      "</button>";

    return '<div class="seat tracker heat" style="background:' + bg + '" data-sid="' + s.id + '" data-seat="' + seat.id + '">' +
      '<div class="seat-head">' +
        '<span class="nm">' + UI.esc(UI.vollerName(s)) + "</span>" +
        '<span class="tcount-total"' + (total ? "" : ' style="visibility:hidden"') + ">Σ " + total + "</span>" +
      "</div>" +
      '<div class="typebtns">' + buttons + heatEdit + "</div>" +
    "</div>";
  }

  function startHeatTimer() {
    stopHeatTimer();
    state.tracker.heatTimer = setInterval(recolorSeats, 20000);
  }
  function stopHeatTimer() {
    if (state.tracker && state.tracker.heatTimer) { clearInterval(state.tracker.heatTimer); state.tracker.heatTimer = null; }
  }
  function recolorSeats() {
    const t = state.tracker; if (!t) return;
    UI.$all("#tracker-grid .seat.heat").forEach((el) => {
      const sid = el.getAttribute("data-sid");
      const s = t.students && t.students[sid];
      if (!s) return;
      const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, state.settings.heatVerfallMinuten, state.settings.heatVerfallPunkte);
      el.style.background = Calc.heatFarbeDurchPunkte(heat.heatPoints);
    });
  }

  // Aktualisiert Gesamt- und Typ-Zähler sowie die Heatfarbe einer Kachel
  // aus dem aktuellen Tracker-Zustand (ohne Neuaufbau des DOM).
  function renderSeatCounts(sid) {
    const t = state.tracker; if (!t) return;
    const seat = UI.$('#tracker-grid .seat[data-sid="' + sid + '"]');
    if (!seat) return;
    const total = t.counts[sid] || 0;
    const totalEl = seat.querySelector(".tcount-total");
    if (totalEl) { totalEl.textContent = "Σ " + total; totalEl.style.visibility = total ? "visible" : "hidden"; }
    const tc = t.typeCounts[sid] || {};
    Store.EVENT_TYPES.forEach((et) => {
      const cEl = seat.querySelector('.typebtn[data-type="' + et.id + '"] .tcount');
      if (cEl) cEl.textContent = tc[et.id] ? tc[et.id] : "";
    });
    const s = t.students && t.students[sid];
    if (s) {
      const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, state.settings.heatVerfallMinuten, state.settings.heatVerfallPunkte);
      seat.style.background = Calc.heatFarbeDurchPunkte(heat.heatPoints);
    }
  }

  function heatGainForType(typ) {
    const s = state.settings || {};
    if (typ === "einfach") return Math.max(0, parseInt(s.heatPunkteEinfach, 10) || 0);
    if (typ === "gut") return Math.max(0, parseInt(s.heatPunkteGut, 10) || 0);
    if (typ === "sehrgut") return Math.max(0, parseInt(s.heatPunkteSehrGut, 10) || 0);
    return 0;
  }

  async function trackerHeatEditDialog(sid) {
    const t = state.tracker;
    const s = t && t.students ? t.students[sid] : await Store.Schueler.get(sid);
    if (!s) return;
    const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, state.settings.heatVerfallMinuten, state.settings.heatVerfallPunkte);
    const body =
      '<p class="muted">Heatmap direkt setzen. Der Wert wird sofort gespeichert.</p>' +
      '<div class="field"><label for="heat-slider">Heatmap-Punkte</label>' +
        '<input type="range" id="heat-slider" min="0" max="100" step="1" value="' + Math.round(heat.heatPoints) + '">' +
        '<div class="hstack" style="justify-content:space-between;margin-top:8px"><span class="muted">0</span><strong id="heat-slider-value">' + Math.round(heat.heatPoints) + '</strong><span class="muted">100</span></div>' +
      '</div>';
    UI.modal({
      title: "Heatmap bearbeiten · " + UI.vollerName(s),
      bodyHTML: body,
      buttons: [
        { label: "Abbrechen" },
        { label: "Speichern", className: "primary", onClick: async (close, box) => {
          const slider = box.querySelector("#heat-slider");
          const value = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
          s.heatPoints = value;
          s.heatLastDecayAt = Store.now();
          await Store.Schueler.save(s);
          if (t && t.students) t.students[sid] = s;
          close();
          renderSeatCounts(sid);
          UI.toast("Heatmap gespeichert");
        }}
      ],
      onMount: (box) => {
        const slider = box.querySelector("#heat-slider");
        const out = box.querySelector("#heat-slider-value");
        const sync = () => { out.textContent = slider.value; };
        slider.addEventListener("input", sync);
        sync();
      }
    });
  }

  // =========================================================================
  //  BESPRECHUNGSMODUS – ein Schüler nach dem anderen
  // =========================================================================
  async function ViewBesprechung() {
    const k = await Store.Klassen.get(state.klasseId);
    const [schueler, kats, notenAll] = await Promise.all([
      Store.Schueler.byKlasse(k.id), Store.Kategorien.byKlasse(k.id), Store.Noten.byKlasse(k.id)
    ]);

    const topbar =
      '<button class="iconbtn plain" data-action="back-to-class" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Besprechung · ' + UI.esc(k.name) + "</h1>" +
      '<span class="sub">Nur die/der gewählte Schüler/in ist sichtbar</span></div>';

    if (!state.selectedSchuelerId) {
      const picker = schueler.map((s) =>
        '<button class="btn" data-action="besprechung-pick" data-sid="' + s.id + '">' + UI.esc(UI.vollerName(s)) + "</button>"
      ).join("");
      const body = '<div class="discussion"><p class="muted">Schüler/in auswählen:</p>' +
        '<div class="disc-picker">' + (picker || '<span class="muted">Keine Schüler/innen.</span>') + "</div></div>";
      return { topbar, body };
    }

    const idx = schueler.findIndex((s) => s.id === state.selectedSchuelerId);
    const s = schueler[idx];
    if (!s) { state.selectedSchuelerId = null; return ViewBesprechung(); }
    const notenS = notenAll.filter((n) => n.schuelerId === s.id);
    const res = Calc.berechneSchueler(kats, notenS, k, state.settings.rundung);

    const body =
      '<div class="discussion">' +
        '<div class="disc-nav">' +
          '<button class="iconbtn" data-action="besprechung-prev"' + (idx <= 0 ? " disabled" : "") + ">‹</button>" +
          '<div class="who">' + UI.esc(UI.vollerName(s)) + "</div>" +
          '<button class="iconbtn" data-action="besprechung-next"' + (idx >= schueler.length - 1 ? " disabled" : "") + ">›</button>" +
        "</div>" +
        '<div class="card">' +
          '<div class="big-grade" style="color:' + Calc.noteFarbe(res.gesamt) + '">' +
            (res.gesamt !== null ? Calc.formatNote(res.gesamt, state.settings.rundung === "ganze" ? 0 : 1) : "–") + "</div>" +
          '<div class="center muted">Gesamtnote</div>' +
          breakdownHTML(res) +
        "</div>" +
        '<div class="btn-row" style="margin-top:var(--gap);justify-content:center">' +
          '<button class="btn" data-action="besprechung-list">‹ Zur Auswahl</button>' +
        "</div>" +
      "</div>";
    return { topbar, body };
  }

  function breakdownHTML(res) {
    function grpHTML(g, titel, anteil) {
      if (!g.kategorien.length) return "";
      const lines = g.kategorien.map((c) =>
        '<div class="line"><span>' + UI.esc(c.name) + ' <span class="muted">(Gew ' + c.gewichtung + ", " + c.anzahl + " Noten)</span></span>" +
        '<span class="r">' + Calc.formatNote(c.schnitt) + "</span></div>"
      ).join("");
      return '<div class="grp"><h3>' + titel + " – Ø " + Calc.formatNote(g.schnitt) +
        (anteil ? " · Anteil " + Math.round(anteil * 100) + " %" : "") + "</h3>" + lines + "</div>";
    }
    return '<div class="breakdown">' +
      grpHTML(res.schriftlich, "Schriftlich", res.effAnteilS) +
      grpHTML(res.sonstige, "Sonstige", res.effAnteilO) +
      '<div class="total"><span>Gesamtnote</span><span>' + (res.gesamt !== null ? Calc.formatNote(res.gesamt) : "–") + "</span></div>" +
      "</div>";
  }

  // =========================================================================
  //  EINSTELLUNGEN
  // =========================================================================
  async function ViewEinstellungen() {
    const s = state.settings;
    const punkte = Store.EVENT_TYPES.map((t) =>
      '<div class="form-row" style="align-items:center">' +
        '<div class="grow"><strong>' + UI.esc(t.label) + "</strong></div>" +
        '<input type="number" inputmode="numeric" style="width:110px" data-punkt="' + t.id + '" value="' + s.mitarbeitPunkte[t.id] + '">' +
      "</div>"
    ).join("");

    const heatpunkte = [
      ["einfach", "Wortmeldung", s.heatPunkteEinfach],
      ["gut", "Gute Meldung", s.heatPunkteGut],
      ["sehrgut", "Sehr gute Meldung", s.heatPunkteSehrGut]
    ].map(([key, label, value]) =>
      '<div class="form-row" style="align-items:center">' +
        '<div class="grow"><strong>' + UI.esc(label) + "</strong></div>" +
        '<input type="number" inputmode="numeric" style="width:110px" data-heat-punkt="' + key + '" value="' + value + '">' +
      "</div>"
    ).join("");

    const topbar =
      '<button class="iconbtn plain" data-action="home" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Einstellungen</h1></div>';

    const body =
      '<div class="card"><h2>Notenberechnung</h2>' +
        UI.field("Rundung der Gesamtnote", "rundung", s.rundung, { type: "select", options: [
          { value: "eine", label: "Eine Nachkommastelle (2,3)" },
          { value: "keine", label: "Zwei Nachkommastellen (2,33)" },
          { value: "ganze", label: "Ganze Note (2)" }
        ]}) +
      "</div>" +
      '<div class="card"><h2>Mitarbeit – Punkte je Ereignistyp</h2>' + punkte +
      "</div>" +
      '<div class="card"><h2>Heatmap</h2>' + heatpunkte +
        '<div class="field" style="margin-top:14px">' + UI.field("Default-Wert für neue / zurückgesetzte Heatmap", "heatStartWert", s.heatStartWert, { type: "number", inputmode: "numeric", hint: "Wertebereich: 0 bis 100" }) + "</div>" +
        '<div class="form-row" style="align-items:center">' +
          '<div class="grow"><strong>Y Heatmap-Punkte verfallen pro X Minuten</strong></div>' +
          '<input type="number" inputmode="numeric" style="width:110px" id="f-heatVerfallPunkte" value="' + s.heatVerfallPunkte + '">' +
          '<input type="number" inputmode="numeric" style="width:110px" id="f-heatVerfallMinuten" value="' + s.heatVerfallMinuten + '" placeholder="X Minuten">' +
        "</div>" +
      "</div>" +
      '<div class="card"><h2>Datensicherung</h2><p class="muted">Alle Daten bleiben lokal im Browser. Sicherung als JSON-Datei empfohlen.</p>' +
        '<div class="btn-row">' +
          '<button class="btn" data-action="backup-export">Backup exportieren (JSON)</button>' +
          '<button class="btn" data-action="backup-import">Backup importieren</button>' +
          '<button class="btn" data-action="reset-demo">Demo-Daten neu laden</button>' +
          '<button class="btn danger" data-action="delete-all">Alle Daten löschen</button>' +
        "</div>" +
      "</div>" +
      '<div class="card"><h2>Über</h2><p class="muted">Noten-Fritze · lokale PWA · keine Cloud, keine Konten. ' +
        "Schema-Version " + DB.DB_VERSION + ".</p></div>";

    return { topbar, body, mount: () => {
      const sel = UI.$("#f-rundung");
      if (sel) sel.addEventListener("change", async () => { s.rundung = sel.value; await Store.saveSettings(s); UI.toast("Gespeichert"); });
      UI.$all("[data-heat-punkt]").forEach((inp) => inp.addEventListener("change", async () => {
        const key = inp.getAttribute("data-heat-punkt");
        if (key === "einfach") s.heatPunkteEinfach = Math.max(0, parseInt(inp.value, 10) || 0);
        else if (key === "gut") s.heatPunkteGut = Math.max(0, parseInt(inp.value, 10) || 0);
        else if (key === "sehrgut") s.heatPunkteSehrGut = Math.max(0, parseInt(inp.value, 10) || 0);
        await Store.saveSettings(s); UI.toast("Heatmap-Punkte gespeichert");
      }));
      const heatStart = UI.$("#f-heatStartWert");
      if (heatStart) heatStart.addEventListener("change", async () => {
        s.heatStartWert = Math.max(0, Math.min(100, parseInt(heatStart.value, 10) || 0));
        await Store.saveSettings(s);
        UI.toast("Startwert gespeichert");
      });
      const heatVerfallPunkte = UI.$("#f-heatVerfallPunkte");
      if (heatVerfallPunkte) heatVerfallPunkte.addEventListener("change", async () => { s.heatVerfallPunkte = Math.max(0, parseInt(heatVerfallPunkte.value, 10) || 0); await Store.saveSettings(s); });
      const heatVerfallMinuten = UI.$("#f-heatVerfallMinuten");
      if (heatVerfallMinuten) heatVerfallMinuten.addEventListener("change", async () => { s.heatVerfallMinuten = Math.max(1, parseInt(heatVerfallMinuten.value, 10) || 5); await Store.saveSettings(s); });
      UI.$all("[data-punkt]").forEach((inp) => inp.addEventListener("change", async () => {
        s.mitarbeitPunkte[inp.getAttribute("data-punkt")] = parseInt(inp.value, 10) || 0;
        await Store.saveSettings(s); UI.toast("Punkte gespeichert");
      }));
    }};
  }

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
          '<span class="grow">' + UI.esc(n.titel || "") + ' <span class="muted">' + UI.esc(n.datum) + "</span></span>" +
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
      const n = Store.neueNote({ klasseId: k.id, schuelerId: sid, kategorieId: cid, wert: val, titel });
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
    const res = Calc.berechneSchueler(kats, notenAll.filter((n) => n.schuelerId === sid), k, state.settings.rundung);
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

    // Tracker / Besprechung Navigation
    "open-tracker": () => { state.selectedSchuelerId = null; go("tracker"); },
    "open-besprechung": () => { state.selectedSchuelerId = null; go("besprechung"); },
    "back-to-class": () => { stopHeatTimer(); go("klasse"); },
    "tracker-tap": (el) => trackerTap(el),
    "tracker-heat-edit": (el) => trackerHeatEditDialog(el.getAttribute("data-sid")),
    "tracker-undo": () => trackerUndo(),

    "besprechung-pick": (el) => { state.selectedSchuelerId = el.getAttribute("data-sid"); render(); },
    "besprechung-list": () => { state.selectedSchuelerId = null; render(); },
    "besprechung-next": async () => { await besprechungStep(1); },
    "besprechung-prev": async () => { await besprechungStep(-1); },

    "ausw-range": (el) => { state.auswertungRange = el.getAttribute("data-range"); render(); },

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

  global.Views = { go, render, initDelegation, state };
})(window);
