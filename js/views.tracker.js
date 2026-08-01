/* =========================================================================
   views.tracker.js – Mitarbeits-Tracker (Sitzplan-Kacheln, Heatmap, Restzeit)
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go } = global.Views;

  // =========================================================================
  //  TRACKER
  // =========================================================================
  async function ViewTracker() {
    const k = await Store.Klassen.get(state.klasseId);
    const [plan, schueler, ereignisse, abwList] = await Promise.all([
      Store.Sitzplan.get(k.id), Store.Schueler.byKlasse(k.id), Store.Ereignisse.byKlasse(k.id),
      Store.Abwesenheiten.byKlasseUndTag(k.id, Store.datumLokal())
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
      session: state.pendingSession || null,
      counts, typeCounts, last, names, students: sMap, undoStack: [], heatTimer: null,
      abwesend: {} // schuelerId -> true, wenn heute abwesend gemeldet
    };
    state.pendingSession = null;
    abwList.forEach((a) => { state.tracker.abwesend[a.schuelerId] = true; });

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
      (state.tracker.session ? '<span class="chip accent" id="tracker-restzeit" style="align-self:center">' + restzeitText() + "</span>" : "") +
      '<button class="btn" data-action="tracker-undo" id="undo-btn" disabled>↶ Rückgängig</button>';

    const body =
      '<div class="plan-toolbar tracker-toolbar">' +
        '<div class="tracker-legend">' + legende + "</div>" +
        '<div class="grow"></div>' +
        '<div class="legend">viel <span class="bar"></span> wenig</div>' +
      "</div>" +
      '<div class="tracker-scroll"><div class="seatgrid tracker-grid" id="tracker-grid" style="--cols:' + plan.cols + '">' + seats + "</div></div>" +
      (schueler.length ? "" : '<div class="empty">Kein Sitzplan belegt. Lege im Tab „Sitzplan“ Plätze an.</div>');

    return { topbar, body, mount: startHeatTimer, fullWidth: true };
  }

  // Effektive Heatmap-Verfallszeit im Tracker: heatVerfallMinuten aus den
  // Einstellungen gilt für eine 45-Minuten-Standardstunde und wird auf die
  // tatsächliche Stundendauer (Einzel-/Doppelstunde) skaliert.
  function trackerVerfallMinuten() {
    const base = Math.max(1, parseInt(state.settings.heatVerfallMinuten, 10) || 5);
    const t = state.tracker;
    if (t && t.session && t.session.dauerMin) {
      return Math.max(1, Math.round(base * t.session.dauerMin / 45));
    }
    return base;
  }

  // Restzeit-Text für die Topbar ("noch 37 Min (bis 10:20)").
  function restzeitText() {
    const t = state.tracker;
    if (!t || !t.session) return "";
    const ende = new Date(t.session.endeTs);
    const endeHHMM = ("0" + ende.getHours()).slice(-2) + ":" + ("0" + ende.getMinutes()).slice(-2);
    const restMin = Math.ceil((t.session.endeTs - Store.now()) / 60000);
    if (restMin <= 0) return "Stunde vorbei (" + endeHHMM + " Uhr)";
    return "noch " + restMin + " Min (bis " + endeHHMM + " Uhr)";
  }
  function updateRestzeit() {
    const el = document.getElementById("tracker-restzeit");
    if (el) el.textContent = restzeitText();
  }

  function seatTrackerHTML(seat, sMap) {
    const s = seat.schuelerId ? sMap[seat.schuelerId] : null;
    if (!s) return '<div class="seat tracker empty">·</div>';
    const t = state.tracker;
    const abwesend = !!(t.abwesend && t.abwesend[s.id]);
    const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, trackerVerfallMinuten(), state.settings.heatVerfallPunkte);
    const bg = Calc.heatFarbeDurchPunkte(heat.heatPoints);
    const total = t.counts[s.id] || 0;
    const tc = t.typeCounts[s.id] || {};

    // Pro Ereignistyp ein eigener Button direkt auf der Kachel
    // (bei Abwesenheit deaktiviert – keine Ereignisse für abwesende Schüler)
    const buttons = Store.EVENT_TYPES.map((et) => {
      const c = tc[et.id] || 0;
      return '<button class="typebtn" data-action="tracker-tap" data-sid="' + s.id + '" data-type="' + et.id + '" style="--c:' + et.farbe + '"' +
        (abwesend ? " disabled" : "") + '>' +
        '<span class="tlabel">' + UI.esc(et.kurz) + "</span>" +
        '<span class="tcount">' + (c ? c : "") + "</span>" +
      "</button>";
    }).join("");

    const heatEdit = '<button class="typebtn gear" data-action="tracker-heat-edit" data-sid="' + s.id + '" title="Heatmap bearbeiten">' +
      '<span class="tlabel">⚙️</span>' +
      "</button>";

    // Toggle: Schüler für heute als krank/abwesend markieren (rückgängig machbar)
    const abwToggle = '<button class="typebtn gear' + (abwesend ? " aktiv" : "") + '" data-action="tracker-abwesend" data-sid="' + s.id + '"' +
      ' title="' + (abwesend ? "Wieder anwesend melden" : "Heute abwesend/krank") + '">' +
      '<span class="tlabel">🤒</span>' +
      "</button>";

    return '<div class="seat tracker heat' + (abwesend ? " abwesend" : "") + '" style="background:' + bg + '" data-sid="' + s.id + '" data-seat="' + seat.id + '">' +
      '<div class="seat-head">' +
        '<span class="nm">' + UI.esc(UI.vollerName(s)) + (abwesend ? ' <span class="muted">(abwesend)</span>' : "") + "</span>" +
        '<span class="tcount-total"' + (total ? "" : ' style="visibility:hidden"') + ">Σ " + total + "</span>" +
      "</div>" +
      '<div class="typebtns">' + buttons + heatEdit + abwToggle + "</div>" +
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
    updateRestzeit();
    UI.$all("#tracker-grid .seat.heat").forEach((el) => {
      const sid = el.getAttribute("data-sid");
      const s = t.students && t.students[sid];
      if (!s) return;
      if (t.abwesend && t.abwesend[sid]) return; // abwesend: Wert eingefroren
      const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, trackerVerfallMinuten(), state.settings.heatVerfallPunkte);
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
    if (s && !(t.abwesend && t.abwesend[sid])) {
      const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, trackerVerfallMinuten(), state.settings.heatVerfallPunkte);
      seat.style.background = Calc.heatFarbeDurchPunkte(heat.heatPoints);
    }
  }

  // Baut eine einzelne Tracker-Kachel neu auf (z. B. nach Abwesenheits-Toggle).
  async function refreshTrackerSeat(sid) {
    const t = state.tracker; if (!t) return;
    const seatEl = UI.$('#tracker-grid .seat[data-sid="' + sid + '"]');
    if (!seatEl) return;
    const plan = await Store.Sitzplan.get(state.klasseId);
    const seat = plan.seats.find((x) => String(x.id) === String(seatEl.getAttribute("data-seat")));
    if (!seat) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = seatTrackerHTML(seat, t.students);
    seatEl.replaceWith(tmp.firstElementChild);
  }

  // Schüler für heute als abwesend/anwesend umschalten (Toggle, persistiert).
  async function trackerAbwesendToggle(sid) {
    const t = state.tracker;
    const istAbwesend = await Store.Abwesenheiten.toggle(state.klasseId, sid, Store.datumLokal());
    // Heatmap-Uhr neu starten: der aktuelle Stand bleibt erhalten, aber die
    // abwesende Zeit holt der Verfall nicht nach (eingefrorener Wert).
    const s = t && t.students ? t.students[sid] : null;
    if (s) {
      const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, trackerVerfallMinuten(), state.settings.heatVerfallPunkte);
      s.heatPoints = Math.round(heat.heatPoints);
      s.heatLastDecayAt = Store.now();
      await Store.Schueler.save(s);
    }
    if (t) t.abwesend[sid] = istAbwesend;
    await refreshTrackerSeat(sid);
    UI.toast((t && t.names && t.names[sid] ? t.names[sid] + " · " : "") + (istAbwesend ? "heute abwesend" : "wieder anwesend"));
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
    const heat = Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, trackerVerfallMinuten(), state.settings.heatVerfallPunkte);
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

  // ---- Tracker-Start: Einzel- oder Doppelstunde -----------------------------
  function trackerStartDialog() {
    const jetzt = Store.now();
    const einzel = Calc.trackerSession(state.settings.stundenplan, jetzt, false);
    const doppel = Calc.trackerSession(state.settings.stundenplan, jetzt, true);
    const info = einzel.quelle === "plan"
      ? "Erkannt: " + einzel.stundeNr + ". Stunde laut Stundenplan (Ende " +
        new Date(einzel.endeTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) +
        " Uhr, Doppelstunde bis " +
        new Date(doppel.endeTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr)."
      : "Gerade läuft laut Stundenplan keine Stunde – es wird mit 45 bzw. 90 Min ab jetzt gerechnet.";
    UI.modal({
      title: "Tracker starten",
      bodyHTML: "<p>Wie lange dauert die Stunde?</p>" + '<p class="muted">' + info + "</p>",
      buttons: [
        { label: "Einzelstunde", className: "primary", onClick: (close) => { state.pendingSession = einzel; close(); go("tracker"); } },
        { label: "Doppelstunde", className: "primary", onClick: (close) => { state.pendingSession = doppel; close(); go("tracker"); } },
        { label: "Ohne Zeitangabe", onClick: (close) => { state.pendingSession = null; close(); go("tracker"); } }
      ]
    });
  }

  Object.assign(global.Views, {
    ViewTracker, trackerStartDialog, trackerHeatEditDialog, trackerAbwesendToggle,
    stopHeatTimer, renderSeatCounts
  });
})(window);
