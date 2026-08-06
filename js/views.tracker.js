/* =========================================================================
   views.tracker.js – Mitarbeits-Tracker
   - Erfassung läuft immer in einer Unterrichtsstunde (Store.Stunden), die
     beim Start angelegt, fortgesetzt und beendet werden kann
   - Kacheln tragen nur die Ereignistypen mit aufKachel = true
   - Abwesend / Verweigerung / keine HA / Heatmap laufen als Modi über die Topbar
   - Heatmap verfällt nur innerhalb einer laufenden Stunde (dazwischen eingefroren)
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render } = global.Views;

  // Die vier Topbar-Modi. Im Modus ist die ganze Kachel ein Tap-Ziel.
  const MODI = {
    abwesend: { icon: "🤒", label: "Abwesend", hinweis: "Schüler/innen antippen, die heute fehlen. Sie werden ausgegraut und zählen nicht in die Auswertung." },
    verweigerung: { icon: "🚫", label: "Verweigerung", hinweis: "Schüler/innen antippen, die die Mitarbeit verweigern. Die Stunde zählt als Note 6; Meldungen dieser Stunde entfallen, vergessene Hausaufgaben bleiben gezählt." },
    keineha:  { icon: "📕", label: "Keine HA", hinweis: "Schüler/innen antippen, die keine Hausaufgaben haben. Der Vermerk gilt für diese Stunde." },
    heat:     { icon: "⚙️", label: "Heatmap",  hinweis: "Schüler/in antippen, um den Heatmap-Wert direkt zu setzen." }
  };

  // =========================================================================
  //  TRACKER
  // =========================================================================
  async function ViewTracker() {
    const k = await Store.Klassen.get(state.klasseId);
    // Einstieg = über den Start-Dialog betreten (neue oder fortgesetzte Stunde);
    // ein bloßes render() (z. B. Moduswechsel) ist kein Einstieg.
    const einstieg = !!state.pendingStunde;
    const stunde = await aktuelleTrackerStunde(k);
    const plan = await Store.Sitzplan.get(k.id);
    const t = await trackerZustand(k, stunde, einstieg);

    // Legende erklärt Farbe + Kurzlabel der Buttons auf den Kacheln
    const legende = Store.KACHEL_EVENT_TYPES.map((typ) =>
      '<span class="lg"><span class="dot" style="background:' + typ.farbe + '"></span>' +
        (typ.icon ? typ.icon + " " : "") + UI.esc(typ.label) + ' <span class="muted">(' +
        (state.settings.mitarbeitPunkte[typ.id] > 0 ? "+" : "") + state.settings.mitarbeitPunkte[typ.id] + ")</span></span>"
    ).join("");

    const seats = plan.seats.map((seat) => seatTrackerHTML(seat, t.students)).join("");

    const modusBtns = Object.keys(MODI).map((id) =>
      '<button class="btn modusbtn' + (state.trackerModus === id ? " aktiv" : "") + '" data-action="tracker-modus" data-modus="' + id + '">' +
        MODI[id].icon + " " + UI.esc(MODI[id].label) + "</button>"
    ).join("");

    const topbar =
      '<button class="iconbtn plain" data-action="back-to-class" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Mitarbeit · ' + UI.esc(k.name) + "</h1>" +
      '<span class="sub">' + UI.esc(stundeLabel(stunde)) + "</span></div>" +
      '<div class="grow"></div>' +
      '<div class="modusbar">' + modusBtns + "</div>" +
      (stunde.endeTs ? '<span class="chip accent" id="tracker-restzeit" style="align-self:center">' + restzeitText() + "</span>" : "") +
      '<button class="btn small" data-action="tracker-undo" id="undo-btn"' + (t.undoStack.length ? "" : " disabled") + ">↶ Rückgängig</button>" +
      '<button class="btn small" data-action="tracker-stunde-beenden">Stunde beenden</button>';

    const body =
      modusBannerHTML() +
      '<div class="plan-toolbar tracker-toolbar">' +
        '<div class="tracker-legend">' + legende + "</div>" +
        '<div class="grow"></div>' +
        '<div class="legend">viel <span class="bar"></span> wenig</div>' +
      "</div>" +
      // Bei vielen Spalten schrumpfen die Kacheln, damit das Raster aufs Display passt
      '<div class="tracker-scroll"><div class="seatgrid tracker-grid' +
        (plan.cols >= 9 ? " mini" : plan.cols >= 7 ? " kompakt" : "") +
        '" id="tracker-grid" style="--cols:' + plan.cols + '">' + seats + "</div></div>" +
      (Object.keys(t.students).length ? "" : '<div class="empty">Kein Sitzplan belegt. Lege im Tab „Sitzplan“ Plätze an.</div>');

    return { topbar, body, mount: mountTracker, fullWidth: true };
  }

  function mountTracker() {
    syncModusKlasse();
    startHeatTimer();
  }

  // Ermittelt die Stunde, in der erfasst wird: die vom Start-Dialog übergebene,
  // sonst die des laufenden Tracker-Zustands, sonst ersatzweise eine neue.
  async function aktuelleTrackerStunde(k) {
    if (state.pendingStunde) {
      const st = state.pendingStunde;
      state.pendingStunde = null;
      return st;
    }
    if (state.tracker && state.tracker.klasseId === k.id && state.tracker.stunde) return state.tracker.stunde;
    // Neue Stunden tragen das eingestellte Quartal, nicht das aus dem Datum abgeleitete.
    const st = Store.neueStunde(k.id, { quartal: parseInt(state.settings.aktuellesQuartal, 10) || 1 });
    await Store.Stunden.save(st);
    return st;
  }

  // Baut den flüchtigen Tracker-Zustand auf – aber nur, wenn sich Klasse oder
  // Stunde geändert haben. Sonst bleiben Zähler und Undo-Stack erhalten
  // (z. B. beim Umschalten eines Modus, das ein render() auslöst).
  async function trackerZustand(k, stunde, einstieg) {
    const alt = state.tracker;
    if (alt && alt.klasseId === k.id && alt.stunde && alt.stunde.id === stunde.id) {
      alt.stunde = stunde;
      if (einstieg) await heatUhrNachziehen(alt.students);
      return alt;
    }

    const [schueler, ereignisse, abwList] = await Promise.all([
      Store.Schueler.byKlasse(k.id),
      Store.Ereignisse.byStunde(stunde.id),
      Store.Abwesenheiten.byKlasseUndTag(k.id, stunde.datum)
    ]);

    const students = {}, names = {};
    schueler.forEach((s) => { students[s.id] = s; names[s.id] = UI.vollerName(s); });

    // Zähler beziehen sich auf diese Stunde, nicht mehr auf den ganzen Tag.
    const counts = {}, typeCounts = {}, keineHA = {}, verweigerung = {};
    ereignisse.forEach((e) => {
      counts[e.schuelerId] = (counts[e.schuelerId] || 0) + 1;
      if (!typeCounts[e.schuelerId]) typeCounts[e.schuelerId] = {};
      typeCounts[e.schuelerId][e.typ] = (typeCounts[e.schuelerId][e.typ] || 0) + 1;
      if (e.typ === "keinehausaufgabe") keineHA[e.schuelerId] = e.id;
      if (e.typ === "verweigerung") verweigerung[e.schuelerId] = e.id;
    });

    const abwesend = {};
    abwList.forEach((a) => { abwesend[a.schuelerId] = true; });

    state.tracker = {
      klasseId: k.id, stunde, counts, typeCounts, keineHA, verweigerung, names, students,
      undoStack: [], heatTimer: null, abwesend
    };

    await heatUhrNachziehen(students);
    return state.tracker;
  }

  // Heatmap-Uhr auf jetzt setzen: der Verfall aus der Pause zwischen zwei
  // Stunden wird nicht nachgeholt, der Stand läuft einfach weiter.
  async function heatUhrNachziehen(students) {
    const liste = Object.keys(students || {}).map((sid) => students[sid]).filter(Boolean);
    if (!liste.length) return;
    const jetzt = Store.now();
    liste.forEach((s) => { s.heatLastDecayAt = jetzt; });
    await Store.Schueler.saveAlle(liste);
  }

  // Kurzbeschreibung der Stunde für die Topbar / den Start-Dialog.
  function stundeLabel(st) {
    if (!st) return "";
    const start = new Date(st.startTs);
    const hhmm = (d) => ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    const nr = st.stundeNr ? st.stundeNr + ". Stunde · " : "";
    return nr + hhmm(start) + (st.endeTs ? "–" + hhmm(new Date(st.endeTs)) + " Uhr" : " Uhr");
  }

  // Effektive Heatmap-Verfallszeit im Tracker: heatVerfallMinuten aus den
  // Einstellungen gilt für eine 45-Minuten-Standardstunde und wird auf die
  // tatsächliche Stundendauer (Einzel-/Doppelstunde) skaliert.
  function trackerVerfallMinuten() {
    const base = Math.max(1, parseInt(state.settings.heatVerfallMinuten, 10) || 5);
    const t = state.tracker;
    if (t && t.stunde && t.stunde.dauerMin) {
      return Math.max(1, Math.round(base * t.stunde.dauerMin / 45));
    }
    return base;
  }

  // Bezugszeit für den Heatmap-Verfall: er läuft nur innerhalb der Stunde.
  // Nach dem Stundenende steht der Wert still, bis die nächste Stunde startet.
  function heatBezugsZeit() {
    const t = state.tracker;
    const jetzt = Store.now();
    if (t && t.stunde && t.stunde.endeTs) return Math.min(jetzt, t.stunde.endeTs);
    return jetzt;
  }

  function heatAktuell(s) {
    return Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, trackerVerfallMinuten(),
      state.settings.heatVerfallPunkte, heatBezugsZeit());
  }

  // Heatmap-Punkte gutschreiben/abziehen. Rechnet mit der Stunden-Bezugszeit,
  // damit nach dem Stundenende kein zusätzlicher Verfall einfließt.
  async function trackerHeatAddieren(sid, delta) {
    const t = state.tracker;
    const s = t && t.students ? t.students[sid] : null;
    if (!s) return null;
    s.heatPoints = Math.max(0, Math.min(100, Math.round(heatAktuell(s).heatPoints + (Number(delta) || 0))));
    s.heatLastDecayAt = Store.now();
    await Store.Schueler.save(s);
    return s;
  }

  // Aktuellen Heatmap-Stand aller Schüler festschreiben (Stundenende / Verlassen).
  // Abwesende behalten ihren Wert; für sie wird nur die Uhr nachgezogen.
  async function heatEinfrieren() {
    const t = state.tracker;
    if (!t || !t.students) return;
    const liste = Object.keys(t.students).map((sid) => t.students[sid]).filter(Boolean);
    if (!liste.length) return;
    const jetzt = Store.now();
    liste.forEach((s) => {
      if (!(t.abwesend && t.abwesend[s.id])) s.heatPoints = Math.round(heatAktuell(s).heatPoints);
      s.heatLastDecayAt = jetzt;
    });
    await Store.Schueler.saveAlle(liste);
  }

  // Restzeit-Text für die Topbar ("noch 37 Min (bis 10:20)").
  function restzeitText() {
    const t = state.tracker;
    if (!t || !t.stunde || !t.stunde.endeTs) return "";
    const ende = new Date(t.stunde.endeTs);
    const endeHHMM = ("0" + ende.getHours()).slice(-2) + ":" + ("0" + ende.getMinutes()).slice(-2);
    const restMin = Math.ceil((t.stunde.endeTs - Store.now()) / 60000);
    if (restMin <= 0) return "Stunde vorbei (" + endeHHMM + " Uhr)";
    return "noch " + restMin + " Min (bis " + endeHHMM + " Uhr)";
  }
  function updateRestzeit() {
    const el = document.getElementById("tracker-restzeit");
    if (el) el.textContent = restzeitText();
  }

  // ---- Modi -----------------------------------------------------------------
  function modusBannerHTML() {
    const m = MODI[state.trackerModus];
    if (!m) return "";
    return '<div class="modus-banner">' +
      '<span class="modus-icon">' + m.icon + "</span>" +
      '<div class="grow"><strong>' + UI.esc(m.label) + "-Modus</strong>" +
        '<div class="hint">' + UI.esc(m.hinweis) + "</div></div>" +
      '<button class="btn" data-action="tracker-modus-ende">Fertig</button>' +
    "</div>";
  }

  // Farbschema der Seite an den aktiven Modus koppeln.
  function syncModusKlasse() {
    const cl = document.body.classList;
    Object.keys(MODI).forEach((id) => cl.remove("modus-" + id));
    if (state.trackerModus) cl.add("modus-" + state.trackerModus);
  }

  function trackerModusToggle(id) {
    if (!MODI[id]) return;
    state.trackerModus = state.trackerModus === id ? null : id;
    render();
  }
  function trackerModusEnde() {
    if (!state.trackerModus) return;
    state.trackerModus = null;
    render();
  }

  // Tap auf eine Kachel, während ein Modus aktiv ist.
  async function trackerModusTap(sid) {
    if (state.trackerModus === "abwesend") return trackerAbwesendToggle(sid);
    if (state.trackerModus === "verweigerung") return trackerVerweigerungToggle(sid);
    if (state.trackerModus === "keineha") return trackerKeineHAToggle(sid);
    if (state.trackerModus === "heat") return trackerHeatEditDialog(sid);
  }

  function seatTrackerHTML(seat, sMap) {
    const s = seat.schuelerId ? sMap[seat.schuelerId] : null;
    if (!s) return '<div class="seat tracker empty">·</div>';
    const t = state.tracker;
    const abwesend = !!(t.abwesend && t.abwesend[s.id]);
    const keineHA = !!(t.keineHA && t.keineHA[s.id]);
    const verweigert = !!(t.verweigerung && t.verweigerung[s.id]);
    const bg = Calc.heatFarbeDurchPunkte(heatAktuell(s).heatPoints);
    const total = t.counts[s.id] || 0;
    const tc = t.typeCounts[s.id] || {};
    const modus = state.trackerModus;

    // Pro Ereignistyp mit aufKachel = true ein eigener Button auf der Kachel.
    // Bei Abwesenheit oder Verweigerung deaktiviert; im Modus lässt CSS die
    // Taps auf die Kachel durch (disabled würde den Klick schlucken, statt
    // ihn weiterzureichen).
    const buttons = Store.KACHEL_EVENT_TYPES.map((et) => {
      const c = tc[et.id] || 0;
      return '<button class="typebtn" data-action="tracker-tap" data-sid="' + s.id + '" data-type="' + et.id + '" style="--c:' + et.farbe + '"' +
        (abwesend || verweigert ? " disabled" : "") + ">" +
        '<span class="tlabel">' + UI.esc(et.icon) + "</span>" +
        '<span class="tcount">' + (c ? c : "") + "</span>" +
      "</button>";
    }).join("");

    const vermerke =
      (abwesend ? ' <span class="muted">(abwesend)</span>' : "") +
      (keineHA ? ' <span class="tag-ha">keine HA</span>' : "") +
      (verweigert ? ' <span class="tag-verweigerung">Verweigerung</span>' : "");

    return '<div class="seat tracker heat' + (abwesend ? " abwesend" : "") + (modus ? " modus" : "") + '"' +
      ' style="background:' + bg + '" data-sid="' + s.id + '" data-seat="' + seat.id + '"' +
      (modus ? ' data-action="tracker-modus-tap"' : "") + ">" +
      '<div class="seat-head">' +
        '<span class="nm">' + UI.esc(UI.vollerName(s)) + vermerke + "</span>" +
        '<span class="tcount-total"' + (total ? "" : ' style="visibility:hidden"') + ">Σ " + total + "</span>" +
      "</div>" +
      '<div class="typebtns">' + buttons + "</div>" +
    "</div>";
  }

  function startHeatTimer() {
    stopHeatTimer();
    if (state.tracker) state.tracker.heatTimer = setInterval(recolorSeats, 20000);
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
      el.style.background = Calc.heatFarbeDurchPunkte(heatAktuell(s).heatPoints);
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
    Store.KACHEL_EVENT_TYPES.forEach((et) => {
      const cEl = seat.querySelector('.typebtn[data-type="' + et.id + '"] .tcount');
      if (cEl) cEl.textContent = tc[et.id] ? tc[et.id] : "";
    });
    const s = t.students && t.students[sid];
    if (s && !(t.abwesend && t.abwesend[sid])) {
      seat.style.background = Calc.heatFarbeDurchPunkte(heatAktuell(s).heatPoints);
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
    const tag = t && t.stunde ? t.stunde.datum : Store.datumLokal();
    const istAbwesend = await Store.Abwesenheiten.toggle(state.klasseId, sid, tag);
    // Heatmap-Uhr neu starten: der aktuelle Stand bleibt erhalten, aber die
    // abwesende Zeit holt der Verfall nicht nach (eingefrorener Wert).
    const s = t && t.students ? t.students[sid] : null;
    if (s) {
      s.heatPoints = Math.round(heatAktuell(s).heatPoints);
      s.heatLastDecayAt = Store.now();
      await Store.Schueler.save(s);
    }
    if (t) t.abwesend[sid] = istAbwesend;
    await refreshTrackerSeat(sid);
    UI.toast((t && t.names && t.names[sid] ? t.names[sid] + " · " : "") + (istAbwesend ? "heute abwesend" : "wieder anwesend"));
  }

  // „Keine Hausaufgaben“ für diese Stunde vermerken bzw. wieder entfernen.
  async function trackerKeineHAToggle(sid) {
    const t = state.tracker;
    if (!t) return;
    const typ = "keinehausaufgabe";
    const name = t.names && t.names[sid] ? t.names[sid] + " · " : "";
    const vorhanden = t.keineHA[sid];
    if (vorhanden) {
      await Store.Ereignisse.remove(vorhanden);
      delete t.keineHA[sid];
      t.counts[sid] = Math.max(0, (t.counts[sid] || 1) - 1);
      if (t.typeCounts[sid]) t.typeCounts[sid][typ] = Math.max(0, (t.typeCounts[sid][typ] || 1) - 1);
      UI.toast(name + "Vermerk entfernt");
    } else {
      const e = Store.neuesEreignis(state.klasseId, sid, typ, state.settings.mitarbeitPunkte[typ], t.stunde.id);
      e.quartal = parseInt(state.settings.aktuellesQuartal, 10) || 1;
      e.halbjahr = Store.halbjahrAusQuartal(e.quartal);
      await Store.Ereignisse.save(e);
      t.keineHA[sid] = e.id;
      t.counts[sid] = (t.counts[sid] || 0) + 1;
      if (!t.typeCounts[sid]) t.typeCounts[sid] = {};
      t.typeCounts[sid][typ] = (t.typeCounts[sid][typ] || 0) + 1;
      UI.toast(name + "keine Hausaufgaben");
      // Im Modus „note6“ zählt jede 3. vergessene HA des Quartals als Note 6
      // im Notenvorschlag – übertragen wird sie mit dem Quartalsabschluss.
      const note6 = await Store.haNote6Pruefen(state.klasseId, sid, e.quartal);
      if (note6) UI.toast("3× Hausaufgaben vergessen – zählt als Note 6 in der Mitarbeit");
    }
    await refreshTrackerSeat(sid);
  }

  // „Leistungsverweigerung“ für diese Stunde vermerken bzw. wieder entfernen.
  // Die Stunde zählt als Note 6; Meldungen der Stunde entfallen in der
  // Auswertung, vergessene Hausaufgaben bleiben gezählt.
  async function trackerVerweigerungToggle(sid) {
    const t = state.tracker;
    if (!t) return;
    const typ = "verweigerung";
    const name = t.names && t.names[sid] ? t.names[sid] + " · " : "";
    const vorhanden = t.verweigerung && t.verweigerung[sid];
    if (vorhanden) {
      await Store.Ereignisse.remove(vorhanden);
      delete t.verweigerung[sid];
      t.counts[sid] = Math.max(0, (t.counts[sid] || 1) - 1);
      if (t.typeCounts[sid]) t.typeCounts[sid][typ] = Math.max(0, (t.typeCounts[sid][typ] || 1) - 1);
      UI.toast(name + "Vermerk entfernt");
    } else {
      const e = Store.neuesEreignis(state.klasseId, sid, typ, 0, t.stunde.id);
      e.quartal = parseInt(state.settings.aktuellesQuartal, 10) || 1;
      e.halbjahr = Store.halbjahrAusQuartal(e.quartal);
      await Store.Ereignisse.save(e);
      if (!t.verweigerung) t.verweigerung = {};
      t.verweigerung[sid] = e.id;
      t.counts[sid] = (t.counts[sid] || 0) + 1;
      if (!t.typeCounts[sid]) t.typeCounts[sid] = {};
      t.typeCounts[sid][typ] = (t.typeCounts[sid][typ] || 0) + 1;
      UI.toast(name + "Leistungsverweigerung – Stunde zählt als 6");
    }
    await refreshTrackerSeat(sid);
  }

  async function trackerHeatEditDialog(sid) {
    const t = state.tracker;
    const s = t && t.students ? t.students[sid] : await Store.Schueler.get(sid);
    if (!s) return;
    const aktuell = t && t.students && t.students[sid] ? heatAktuell(s).heatPoints : s.heatPoints;
    const body =
      '<p class="muted">Heatmap direkt setzen. Der Wert wird sofort gespeichert.</p>' +
      '<div class="field"><label for="heat-slider">Heatmap-Punkte</label>' +
        '<input type="range" id="heat-slider" min="0" max="100" step="1" value="' + Math.round(aktuell) + '">' +
        '<div class="hstack" style="justify-content:space-between;margin-top:8px"><span class="muted">0</span><strong id="heat-slider-value">' + Math.round(aktuell) + '</strong><span class="muted">100</span></div>' +
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

  // ---- Stunde starten / fortsetzen / beenden --------------------------------
  async function trackerStartDialog() {
    const offen = await Store.Stunden.offeneVonHeute(state.klasseId);
    const jetzt = Store.now();
    const einzel = Calc.trackerSession(state.settings.stundenplan, jetzt, false);
    const doppel = Calc.trackerSession(state.settings.stundenplan, jetzt, true);
    const info = einzel.quelle === "plan"
      ? "Erkannt: " + einzel.stundeNr + ". Stunde laut Stundenplan (Ende " +
        new Date(einzel.endeTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) +
        " Uhr, Doppelstunde bis " +
        new Date(doppel.endeTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr)."
      : "Gerade läuft laut Stundenplan keine Stunde – es wird mit 45 bzw. 90 Min ab jetzt gerechnet.";

    let offenText = "";
    if (offen) {
      const erfasst = await Store.Ereignisse.byStunde(offen.id);
      offenText = '<p><strong>Offene Stunde von heute:</strong> ' + UI.esc(stundeLabel(offen)) +
        " · " + erfasst.length + " Erfassung" + (erfasst.length === 1 ? "" : "en") +
        '</p><p class="muted">Fortsetzen führt die Zählung dieser Stunde weiter. Eine neue Stunde beendet sie.</p>';
    }

    const buttons = [];
    if (offen) {
      buttons.push({ label: "▶︎ Stunde fortsetzen", className: "primary", onClick: (close) => {
        state.pendingStunde = offen; close(); go("tracker");
      }});
    }
    buttons.push({ label: "Einzelstunde", className: offen ? "" : "primary", onClick: (close) => { close(); stundeStarten(einzel, offen); }});
    buttons.push({ label: "Doppelstunde", className: offen ? "" : "primary", onClick: (close) => { close(); stundeStarten(doppel, offen); }});
    buttons.push({ label: "Ohne Zeitangabe", onClick: (close) => { close(); stundeStarten(null, offen); }});

    UI.modal({
      title: "Tracker starten",
      bodyHTML: offenText + "<p>Wie lange dauert die neue Stunde?</p>" + '<p class="muted">' + info + "</p>",
      buttons
    });
  }

  // Neue Stunde anlegen (und eine noch offene vorher schließen).
  async function stundeStarten(session, offen) {
    if (offen) await Store.Stunden.beenden(offen.id);
    // Neue Stunden tragen das eingestellte Quartal, nicht das aus dem Datum abgeleitete.
    session = Object.assign({}, session, { quartal: parseInt(state.settings.aktuellesQuartal, 10) || 1 });
    const st = Store.neueStunde(state.klasseId, session);
    await Store.Stunden.save(st);
    state.pendingStunde = st;
    state.trackerModus = null;
    go("tracker");
  }

  // Tracker verlassen, ohne die Stunde zu schließen (bleibt fortsetzbar).
  async function trackerVerlassen() {
    stopHeatTimer();
    await heatEinfrieren();
    state.trackerModus = null;
    syncModusKlasse();
  }

  async function trackerStundeBeenden() {
    const t = state.tracker;
    if (!t || !t.stunde) { await trackerVerlassen(); return go("klasse"); }
    const ok = await UI.confirmDialog("Stunde beenden?", "Die Erfassung dieser Stunde wird abgeschlossen und lässt sich nicht mehr fortsetzen.",
      { okLabel: "Beenden", danger: false });
    if (!ok) return;
    await trackerVerlassen();
    await Store.Stunden.beenden(t.stunde.id);
    state.tracker = null;
    await go("klasse");
    UI.toast("Stunde beendet");
  }

  Object.assign(global.Views, {
    ViewTracker, trackerStartDialog, trackerHeatEditDialog, trackerAbwesendToggle,
    trackerKeineHAToggle, trackerVerweigerungToggle, trackerModusToggle, trackerModusEnde, trackerModusTap,
    trackerStundeBeenden, trackerVerlassen, trackerHeatAddieren,
    stopHeatTimer, renderSeatCounts, syncModusKlasse
  });
})(window);
