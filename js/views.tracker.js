/* =========================================================================
   views.tracker.js – Mitarbeits-Tracker
   - Erfassung läuft immer in einer Unterrichtsstunde (Store.Stunden), die
     beim Start angelegt, fortgesetzt und beendet werden kann
   - Kacheln tragen nur die Ereignistypen mit aufKachel = true
   - Abwesend / Verweigerung / keine HA / Heatmap laufen als Modi über die Topbar
   - Heatmap verfällt nur innerhalb einer laufenden Stunde (dazwischen eingefroren)
   - Pausetaste hält den Verfall an, bis sie gelöst oder der Tracker verlassen wird
   - Vergessene (nicht beendete) Stunden: Start-Dialog fragt nach, ob noch
     etwas nachzutragen ist (Nachtrage-Modus: Heatmap bleibt unverändert)
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render, sitzrasterHTML } = global.Views;

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
    const nachtragen = einstieg && state.pendingNachtragen;
    state.pendingNachtragen = false;
    const stunde = await aktuelleTrackerStunde(k);
    // Sitzplan (Raum) dieser Stunde; ohne Angabe der zuletzt benutzte
    const alle = await Store.Sitzplan.alle(k.id);
    const plan = await Store.Sitzplan.get(k.id, stunde.sitzplanId);
    const t = await trackerZustand(k, stunde, einstieg, nachtragen);

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
      (alle.plaene.length > 1
        ? '<button class="btn small" data-action="tracker-raum" title="Sitzplan (Raum) wechseln">🏫 ' + UI.esc(plan.name) + "</button>"
        : "") +
      '<div class="modusbar">' + modusBtns + "</div>" +
      (stunde.endeTs && !t.nachtragen ? '<span class="chip accent" id="tracker-restzeit" style="align-self:center">' + restzeitText() + "</span>" : "") +
      '<button class="btn small" data-action="tracker-undo" id="undo-btn" title="Lang drücken bzw. Rechtsklick: alle Einträge dieser Stunde"' + (t.undoStack.length ? "" : " disabled") + ">↶ Rückgängig</button>" +
      '<button class="btn small" data-action="tracker-stunde-beenden">Stunde beenden</button>';

    // Beim Nachtragen steht die Heatmap still – die Pausetaste entfällt dort
    const pauseBtn = t.nachtragen ? "" :
      '<button class="btn heatpause' + (t.heatPause ? " aktiv" : "") + '" data-action="tracker-heat-pause"' +
        ' title="' + (t.heatPause ? "Verfall läuft ab dem jetzigen Stand weiter" : "Farben bleiben stehen, Meldungen zählen weiter") + '">' +
        (t.heatPause ? "▶︎ Heatmap fortsetzen" : "⏸ Heatmap pausieren") + "</button>";

    const body =
      nachtragenHinweisHTML(t) +
      modusBannerHTML() +
      '<div class="plan-toolbar tracker-toolbar">' +
        '<div class="tracker-legend">' + legende + "</div>" +
        '<div class="grow"></div>' +
        '<div class="legend">' + pauseBtn +
          'viel <span class="bar"></span> wenig</div>' +
      "</div>" +
      // Bei vielen Spalten schrumpfen die Kacheln bis zur eingestellten Grenze, danach scrollt das Raster
      sitzrasterHTML(plan, seats, "tracker-grid", "tracker-grid") +
      (Object.keys(t.students).length ? "" : '<div class="empty">Kein Sitzplan belegt. Lege im Tab „Sitzplan“ Plätze an.</div>') +
      ohnePlatzHinweis(plan, t.students);

    return { topbar, body, mount: mountTracker, fullWidth: true };
  }

  // Hinweisleiste im Nachtrage-Modus (vergessene Stunde wird nachbearbeitet)
  function nachtragenHinweisHTML(t) {
    if (!t.nachtragen) return "";
    return '<div class="hint-box"><strong>Nachtragen für ' + UI.esc(stundeLabel(t.stunde, true)) + "</strong><br>" +
      "Erfassungen zählen für diese Stunde, die Heatmap bleibt dabei unverändert. " +
      "Wenn alles stimmt: „Stunde beenden“.</div>";
  }

  // Wer in diesem Sitzplan keinen Platz hat, taucht im Tracker nicht auf –
  // deshalb ein Hinweis mit den Namen.
  function ohnePlatzHinweis(plan, students) {
    const sitzend = {};
    plan.seats.forEach((seat) => { if (seat.schuelerId) sitzend[seat.schuelerId] = true; });
    const fehlen = Object.keys(students).filter((id) => !sitzend[id]);
    if (!fehlen.length || fehlen.length === Object.keys(students).length) return "";
    return '<p class="muted">Ohne Platz in „' + UI.esc(plan.name) + '“: ' +
      fehlen.map((id) => UI.esc(UI.vollerName(students[id]))).join(", ") + "</p>";
  }

  // Sitzplan (Raum) mitten in der Stunde wechseln. Zähler, Heatmap und
  // Erfassungen bleiben, nur die Anordnung der Kacheln ändert sich.
  async function trackerRaumDialog() {
    const t = state.tracker; if (!t || !t.stunde) return;
    const alle = await Store.Sitzplan.alle(state.klasseId);
    const aktuell = (await Store.Sitzplan.get(state.klasseId, t.stunde.sitzplanId)).id;
    const optionen = alle.plaene.map((p) =>
      '<button class="btn' + (p.id === aktuell ? " primary" : "") + '" data-pick="' + UI.esc(p.id) + '">' + UI.esc(p.name) + "</button>"
    ).join("");
    const m = UI.modal({ title: "Sitzplan wechseln", bodyHTML: '<div class="raum-picker">' + optionen + "</div>",
      buttons: [{ label: "Abbrechen" }] });
    UI.$all("[data-pick]", m.box).forEach((b) => b.addEventListener("click", async () => {
      const id = b.getAttribute("data-pick");
      m.close();
      if (id === aktuell) return;
      t.stunde.sitzplanId = id;
      await Store.Stunden.save(t.stunde);
      await Store.Sitzplan.setAktiv(state.klasseId, id);
      render();
    }));
  }

  function mountTracker() {
    syncModusKlasse();
    startHeatTimer();
    undoLangDruck(document.getElementById("undo-btn"));
  }

  // Die Liste öffnet sich, während der Finger noch liegt. Beim Loslassen (oder
  // nach Verschieben des Fingers) erzeugt iOS einen Klick an der Fingerposition –
  // der würde die Liste über den Hintergrund schließen oder ein ✕ treffen. Bis
  // kurz nach dem Loslassen werden deshalb alle Klicks verschluckt.
  function klicksSchluckenBisLoslassen() {
    const schlucken = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    // Kein pointercancel: Das meldet iOS schon, sobald sich der Finger bewegt –
    // das eigentliche Loslassen (touchend) kommt erst danach.
    const loslassen = ["pointerup", "touchend", "touchcancel"];
    let ende = null;
    const freigeben = () => {
      loslassen.forEach((n) => document.removeEventListener(n, beimLoslassen, true));
      clearTimeout(ende);
      setTimeout(() => document.removeEventListener("click", schlucken, true), 400);
    };
    const beimLoslassen = () => freigeben();
    document.addEventListener("click", schlucken, true);
    loslassen.forEach((n) => document.addEventListener(n, beimLoslassen, true));
    ende = setTimeout(freigeben, 10000); // Sicherheitsnetz, falls kein Loslassen gemeldet wird
  }

  // Langes Drücken (iPad) bzw. Rechtsklick (PC) auf „Rückgängig" öffnet die
  // Liste der Einträge dieser Stunde; ein kurzer Tipp bleibt „letzten zurücknehmen".
  function undoLangDruck(btn) {
    if (!btn) return;
    let timer = null, ausgeloest = false;
    const oeffnen = (fingerLiegt) => {
      clearTimeout(timer);
      if (ausgeloest) return;
      ausgeloest = true;
      undoListeDialog();
      if (fingerLiegt) klicksSchluckenBisLoslassen();
    };
    btn.addEventListener("pointerdown", (ev) => {
      ausgeloest = false;
      clearTimeout(timer);
      if (ev.button !== 0) return; // Rechtsklick läuft über contextmenu
      timer = setTimeout(() => oeffnen(true), 550);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((n) =>
      btn.addEventListener(n, () => clearTimeout(timer)));
    btn.addEventListener("contextmenu", (ev) => { ev.preventDefault(); oeffnen(false); });
    // Nach dem langen Drücken darf kein Klick folgen: iOS würde ihn sonst an
    // der Fingerposition in die gerade geöffnete Liste setzen.
    btn.addEventListener("touchend", (ev) => { if (ausgeloest) ev.preventDefault(); });
    btn.addEventListener("click", (ev) => {
      if (ausgeloest) { ev.preventDefault(); ev.stopPropagation(); }
    });
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
  //   nachtragen: Einstieg über „Letzte Stunde wurde nicht beendet“
  async function trackerZustand(k, stunde, einstieg, nachtragen) {
    const alt = state.tracker;
    if (alt && alt.klasseId === k.id && alt.stunde && alt.stunde.id === stunde.id) {
      alt.stunde = stunde;
      if (einstieg) { alt.nachtragen = !!nachtragen; await heatUhrNachziehen(alt.students); }
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

    // Rückgängig kennt alle Kachel-Einträge dieser Stunde – auch nach dem
    // Fortsetzen, nicht nur die seit dem Öffnen des Trackers getippten.
    // Nachträge tragen die Zeit der Stunde, erfasstAm den echten Zeitpunkt.
    const undoStack = ereignisse
      .filter((e) => Store.EVENT_TYPE_MAP[e.typ] && Store.EVENT_TYPE_MAP[e.typ].aufKachel)
      .sort((a, b) => (a.timestamp - b.timestamp) || ((a.erfasstAm || 0) - (b.erfasstAm || 0)));

    state.tracker = {
      klasseId: k.id, stunde, counts, typeCounts, keineHA, verweigerung, names, students,
      undoStack, heatTimer: null, abwesend,
      heatPause: false,  // Pausetaste: Verfall ruht, bis sie gelöst oder der Tracker verlassen wird
      nachtragen: !!nachtragen // vergessene Stunde: Heatmap ruht, Nachträge tragen die Zeit der Stunde
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

  // Kurzbeschreibung der Stunde für die Topbar / den Start-Dialog. Liegt die
  // Stunde nicht auf heute (oder mitDatum), steht der Tag davor („Fr., 12.09.“).
  function stundeLabel(st, mitDatum) {
    if (!st) return "";
    const start = new Date(st.startTs);
    const hhmm = (d) => ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    const tag = (mitDatum || st.datum !== Store.datumLokal())
      ? start.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " · "
      : "";
    const nr = st.stundeNr ? st.stundeNr + ". Stunde · " : "";
    return tag + nr + hhmm(start) + (st.endeTs ? "–" + hhmm(new Date(st.endeTs)) + " Uhr" : " Uhr");
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

  // Während der Pause (und beim Nachtragen) gilt die Uhr der Kachel als
  // Bezugszeit: kein Verfall.
  function heatAktuell(s) {
    const t = state.tracker;
    const pause = t && (t.heatPause || t.nachtragen) && s.heatLastDecayAt;
    return Calc.heatPunkteAktuell(s.heatPoints, s.heatLastDecayAt, trackerVerfallMinuten(),
      state.settings.heatVerfallPunkte, pause ? s.heatLastDecayAt : heatBezugsZeit());
  }

  // Pausetaste: Beim Anhalten wird der aktuelle Stand festgeschrieben, beim
  // Fortsetzen startet die Uhr neu – die Pausenzeit holt der Verfall nicht nach.
  // Meldungen während der Pause geben weiter Heatmap-Punkte.
  async function trackerHeatPause() {
    const t = state.tracker;
    if (!t) return;
    if (t.heatPause) {
      t.heatPause = false;
      await heatUhrNachziehen(t.students);
      UI.toast("Heatmap läuft weiter");
    } else {
      await heatEinfrieren();
      t.heatPause = true;
      UI.toast("Heatmap pausiert");
    }
    render();
  }

  // Heatmap-Punkte gutschreiben/abziehen. Rechnet mit der Stunden-Bezugszeit,
  // damit nach dem Stundenende kein zusätzlicher Verfall einfließt. Beim
  // Nachtragen bleibt die Heatmap unverändert (sie zeigt den heutigen Stand).
  async function trackerHeatAddieren(sid, delta) {
    const t = state.tracker;
    const s = t && t.students ? t.students[sid] : null;
    if (!s || t.nachtragen) return s;
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
    if (seat.keinPlatz) return '<div class="seat tracker keinplatz"></div>';
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
    const plan = await Store.Sitzplan.get(state.klasseId, t.stunde && t.stunde.sitzplanId);
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

  // Vermerk für diese Stunde setzen bzw. wieder entfernen (Toggle). Je
  // Schüler/in und Stunde gibt es höchstens einen Vermerk je Typ; sein
  // Ereignis steht in t[feld][sid].
  //   typ:  "keinehausaufgabe" | "verweigerung"
  //   feld: Merkliste im Tracker-Zustand ("keineHA" | "verweigerung")
  //   punkte: eingefrorene Punktzahl des neuen Ereignisses
  async function trackerVermerkToggle(sid, typ, feld, punkte, toastGesetzt) {
    const t = state.tracker;
    if (!t) return null;
    const name = t.names && t.names[sid] ? t.names[sid] + " · " : "";
    if (!t[feld]) t[feld] = {};
    const vorhanden = t[feld][sid];
    let e = null;
    if (vorhanden) {
      await Store.Ereignisse.remove(vorhanden);
      delete t[feld][sid];
      t.counts[sid] = Math.max(0, (t.counts[sid] || 1) - 1);
      if (t.typeCounts[sid]) t.typeCounts[sid][typ] = Math.max(0, (t.typeCounts[sid][typ] || 1) - 1);
      UI.toast(name + "Vermerk entfernt");
    } else {
      e = neuesTrackerEreignis(t, sid, typ, punkte);
      await Store.Ereignisse.save(e);
      t[feld][sid] = e.id;
      t.counts[sid] = (t.counts[sid] || 0) + 1;
      if (!t.typeCounts[sid]) t.typeCounts[sid] = {};
      t.typeCounts[sid][typ] = (t.typeCounts[sid][typ] || 0) + 1;
      UI.toast(name + toastGesetzt);
    }
    await refreshTrackerSeat(sid);
    return e;
  }

  // „Keine Hausaufgaben“ für diese Stunde vermerken bzw. wieder entfernen.
  async function trackerKeineHAToggle(sid) {
    const e = await trackerVermerkToggle(sid, "keinehausaufgabe", "keineHA",
      state.settings.mitarbeitPunkte.keinehausaufgabe, "keine Hausaufgaben");
    // Im Modus „note6“ zählt jede 3. vergessene HA des Quartals als Note 6
    // im Notenvorschlag – übertragen wird sie mit dem Quartalsabschluss.
    if (e && await Store.haNote6Pruefen(state.klasseId, sid, e.quartal)) {
      UI.toast("3× Hausaufgaben vergessen – zählt als Note 6 in der Mitarbeit");
    }
  }

  // „Leistungsverweigerung“ für diese Stunde vermerken bzw. wieder entfernen.
  // Die Stunde zählt als Note 6; Meldungen der Stunde entfallen in der
  // Auswertung, vergessene Hausaufgaben bleiben gezählt.
  function trackerVerweigerungToggle(sid) {
    return trackerVermerkToggle(sid, "verweigerung", "verweigerung", 0,
      "Leistungsverweigerung – Stunde zählt als 6");
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
    const klasse = await Store.Klassen.get(state.klasseId);
    const jetzt = Store.now();
    // Eine vergessene (nicht beendete) Stunde zuerst klären – vor dem Beenden
    // lässt sich darin noch etwas nachtragen.
    const offene = await Store.Stunden.offene(state.klasseId);
    const vergessen = offene.find((st) => Calc.stundeVergessen(st, jetzt));
    if (vergessen) return vergesseneStundeDialog(klasse, vergessen);

    // In einem abgeschlossenen Quartal wird nichts mehr erfasst – dort gehört
    // keine neue Stunde mehr hinein (Abschluss im Mitarbeit-Tab aufhebbar).
    const aktuellesQ = parseInt(state.settings.aktuellesQuartal, 10) || 1;
    if (klasse && Store.abschlussVon(klasse, aktuellesQ)) {
      UI.toast(aktuellesQ + ". Quartal ist abgeschlossen – im Reiter Mitarbeit erst den Abschluss aufheben");
      return;
    }
    // Noch laufende Stunde (fortsetzbar)
    const offen = offene.length ? offene[offene.length - 1] : null;
    const einzel = Calc.trackerSession(state.settings.stundenzeiten, jetzt, false);
    const doppel = Calc.trackerSession(state.settings.stundenzeiten, jetzt, true);
    const info = einzel.quelle === "plan"
      ? "Erkannt: " + einzel.stundeNr + ". Stunde laut Stundenzeiten (Ende " +
        new Date(einzel.endeTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) +
        " Uhr, Doppelstunde bis " +
        new Date(doppel.endeTs).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr)."
      : "Gerade läuft laut Stundenzeiten keine Stunde – es wird mit 45 bzw. 90 Min ab jetzt gerechnet.";

    let offenText = "";
    if (offen) {
      const erfasst = await Store.Ereignisse.byStunde(offen.id);
      offenText = '<p><strong>Laufende Stunde:</strong> ' + UI.esc(stundeLabel(offen)) +
        " · " + erfassungenText(erfasst.length) +
        '</p><p class="muted">Fortsetzen führt die Zählung dieser Stunde weiter. Eine neue Stunde beendet sie.</p>';
    }

    // Raum-Auswahl nur, wenn die Klasse mehrere Sitzpläne hat. Vorbelegt mit
    // dem Plan der offenen Stunde, sonst dem zuletzt benutzten.
    const alle = await Store.Sitzplan.alle(state.klasseId);
    const vorwahl = (offen && alle.plaene.some((p) => p.id === offen.sitzplanId)) ? offen.sitzplanId : alle.aktivId;
    const raumHTML = alle.plaene.length > 1
      ? UI.field("Sitzplan (Raum)", "sitzplanId", vorwahl, { type: "select",
          options: alle.plaene.map((p) => ({ value: p.id, label: p.name })) })
      : "";
    const gewaehlt = (box) => {
      const sel = box && box.querySelector('select[name="sitzplanId"]');
      return sel ? sel.value : vorwahl;
    };

    const buttons = [];
    if (offen) {
      buttons.push({ label: "▶︎ Stunde fortsetzen", className: "primary", onClick: async (close, box) => {
        const planId = gewaehlt(box);
        close();
        if (offen.sitzplanId !== planId) { offen.sitzplanId = planId; await Store.Stunden.save(offen); }
        await Store.Sitzplan.setAktiv(state.klasseId, planId);
        state.pendingStunde = offen; go("tracker");
      }});
    }
    buttons.push({ label: "Einzelstunde", className: offen ? "" : "primary", onClick: (close, box) => { const id = gewaehlt(box); close(); stundeStarten(einzel, offen, id); }});
    buttons.push({ label: "Doppelstunde", className: offen ? "" : "primary", onClick: (close, box) => { const id = gewaehlt(box); close(); stundeStarten(doppel, offen, id); }});
    buttons.push({ label: "Ohne Zeitangabe", onClick: (close, box) => { const id = gewaehlt(box); close(); stundeStarten(null, offen, id); }});

    UI.modal({
      title: "Tracker starten",
      bodyHTML: offenText + raumHTML + "<p>Wie lange dauert die neue Stunde?</p>" + '<p class="muted">' + info + "</p>",
      buttons
    });
  }

  function erfassungenText(n) {
    return n + " Erfassung" + (n === 1 ? "" : "en");
  }

  // „Letzte Stunde wurde nicht beendet“: Vor dem Beenden lässt sich darin
  // noch etwas nachtragen (Nachtrage-Modus). Liegt die Stunde in einem
  // abgeschlossenen Quartal, bleibt nur das Beenden.
  async function vergesseneStundeDialog(klasse, st) {
    const erfasst = await Store.Ereignisse.byStunde(st.id);
    const gesperrt = !!(klasse && Store.abschlussVon(klasse, Number(st.quartal)));
    const beenden = async () => {
      await Store.Stunden.beenden(st.id);
      if (state.tracker && state.tracker.stunde && state.tracker.stunde.id === st.id) state.tracker = null;
      UI.toast("Stunde beendet");
      await trackerStartDialog();   // weiter wie gewohnt (neue Stunde)
    };
    const buttons = [{ label: "Abbrechen" }];
    if (!gesperrt) {
      buttons.push({ label: "Ja, Änderungen vornehmen", className: "primary", onClick: async (close) => {
        close();
        if (st.sitzplanId) await Store.Sitzplan.setAktiv(state.klasseId, st.sitzplanId);
        state.pendingStunde = st;
        state.pendingNachtragen = true;
        state.trackerModus = null;
        go("tracker");
      }});
    }
    buttons.push({ label: gesperrt ? "Stunde beenden" : "Nein, Stunde beenden", className: gesperrt ? "primary" : "",
      onClick: (close) => { close(); beenden(); } });
    UI.modal({
      title: "Letzte Stunde wurde nicht beendet",
      bodyHTML: "<p><strong>" + UI.esc(stundeLabel(st, true)) + "</strong> · " + erfassungenText(erfasst.length) + "</p>" +
        (gesperrt
          ? '<p class="muted">Das ' + st.quartal + ". Quartal ist abgeschlossen – nachtragen lässt sich darin nichts mehr. Die Stunde wird nur noch beendet.</p>"
          : "<p>Möchtest du noch etwas nachtragen oder ändern, bevor die Stunde beendet wird?</p>" +
            '<p class="muted">Nachträge zählen für diese Stunde. Die Heatmap bleibt dabei unverändert.</p>'),
      buttons
    });
  }

  // Neue Stunde anlegen (und eine noch offene vorher schließen).
  async function stundeStarten(session, offen, sitzplanId) {
    if (offen) await Store.Stunden.beenden(offen.id);
    // Neue Stunden tragen das eingestellte Quartal, nicht das aus dem Datum abgeleitete.
    session = Object.assign({}, session, { quartal: parseInt(state.settings.aktuellesQuartal, 10) || 1 });
    const st = Store.neueStunde(state.klasseId, session);
    if (sitzplanId) {
      st.sitzplanId = sitzplanId;
      await Store.Sitzplan.setAktiv(state.klasseId, sitzplanId);
    }
    await Store.Stunden.save(st);
    state.pendingStunde = st;
    state.trackerModus = null;
    go("tracker");
  }

  // Tracker verlassen, ohne die Stunde zu schließen (bleibt fortsetzbar).
  async function trackerVerlassen() {
    stopHeatTimer();
    await heatEinfrieren();
    // Eine Pause gilt nur, solange der Tracker offen ist
    if (state.tracker) state.tracker.heatPause = false;
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

  // ---- Tracker: Tap & Undo -------------------------------------------------
  // Ereignis der laufenden Stunde: Es trägt das Quartal der Stunde (nicht das
  // eingestellte – ein Nachtrag vom September gehört ins 1. Quartal). Beim
  // Nachtragen bekommt es die Zeit der Stunde, erfasstAm den echten Zeitpunkt.
  function neuesTrackerEreignis(t, sid, typ, punkte) {
    const e = Store.neuesEreignis(state.klasseId, sid, typ, punkte, t.stunde.id,
      t.stunde.quartal || state.settings.aktuellesQuartal);
    if (t.nachtragen) {
      e.erfasstAm = e.timestamp;
      e.timestamp = Calc.erfassungsZeit(t.stunde, e.timestamp);
    }
    return e;
  }

  async function trackerTap(el) {
    const sid = el.getAttribute("data-sid");
    if (state.trackerModus) return; // im Modus zählt der Tap auf die ganze Kachel
    if (state.tracker && state.tracker.abwesend && state.tracker.abwesend[sid]) return; // abwesend: keine Ereignisse
    const typ = el.getAttribute("data-type");
    const punkte = state.settings.mitarbeitPunkte[typ];
    const typDef = Store.EVENT_TYPE_MAP[typ];
    const heatDelta = typDef && typDef.heatSetting
      ? Math.max(0, parseInt(state.settings[typDef.heatSetting], 10) || 0)
      : 0;
    const t = state.tracker;
    const e = neuesTrackerEreignis(t, sid, typ, punkte);
    e.heatDelta = t.nachtragen ? 0 : heatDelta;
    await Store.Ereignisse.save(e);

    if (heatDelta > 0) await trackerHeatAddieren(sid, heatDelta);
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
    if (e.heatDelta > 0) await trackerHeatAddieren(e.schuelerId, -e.heatDelta);

    renderSeatCounts(e.schuelerId);

    const undoBtn = document.getElementById("undo-btn");
    if (undoBtn) undoBtn.disabled = t.undoStack.length === 0;
    UI.toast("Rückgängig gemacht");
  }

  // Liste aller Meldungen/Störungen der laufenden Stunde (neueste oben), jede
  // einzeln entfernbar. Geöffnet über langes Drücken bzw. Rechtsklick auf
  // „Rückgängig" (views.tracker.js); der kurze Tipp nimmt weiter den letzten zurück.
  function undoListeDialog() {
    const t = state.tracker; if (!t) return;
    const zeilenHTML = () => {
      if (!t.undoStack.length) return '<p class="muted">Keine Einträge in dieser Stunde.</p>';
      return t.undoStack.slice().reverse().map((e) => {
        const typ = Store.EVENT_TYPE_MAP[e.typ] || { label: e.typ, icon: "" };
        const zeit = new Date(e.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        return '<div class="undo-zeile">' +
          '<span class="muted">' + zeit + "</span>" +
          '<span class="nm">' + UI.esc((t.names && t.names[e.schuelerId]) || "?") + "</span>" +
          '<span><span style="color:' + typ.farbe + '">' + UI.esc(typ.icon || "") + "</span> " + UI.esc(typ.label) + "</span>" +
          '<button class="iconbtn" data-weg="' + UI.esc(e.id) + '" title="Eintrag entfernen">✕</button>' +
        "</div>";
      }).join("");
    };
    const m = UI.modal({
      title: "Einträge dieser Stunde",
      bodyHTML: '<div class="undo-liste"></div>',
      buttons: [{ label: "Fertig" }]
    });
    const liste = m.box.querySelector(".undo-liste");
    const zeichnen = () => {
      liste.innerHTML = zeilenHTML();
      UI.$all("[data-weg]", liste).forEach((b) => b.addEventListener("click", async () => {
        const e = t.undoStack.find((x) => x.id === b.getAttribute("data-weg"));
        if (!e) return;
        b.disabled = true;
        await undoEvent(e);
        zeichnen();
      }));
    };
    zeichnen();
  }

  Object.assign(global.Views, {
    ViewTracker, trackerTap, trackerUndo, undoListeDialog, trackerStartDialog, trackerHeatEditDialog, trackerAbwesendToggle,
    trackerKeineHAToggle, trackerVerweigerungToggle, trackerModusToggle, trackerModusEnde, trackerModusTap,
    trackerStundeBeenden, trackerVerlassen, trackerHeatAddieren, trackerRaumDialog,
    stopHeatTimer, renderSeatCounts, syncModusKlasse, trackerHeatPause
  });
})(window);
