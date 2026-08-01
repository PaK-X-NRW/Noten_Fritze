/* =========================================================================
   views.home-klasse.js – Home (Klassenübersicht) und Klassenansicht
   mit den Tabs Schüler, Noten, Kategorien, Sitzplan und Mitarbeit.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, hjFilter, hjTabsHTML } = global.Views;

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
    const hj = hjFilter("notenHalbjahr");

    const kopf = "<tr><th>Name</th>" + kats.map((c) =>
      '<th class="num">' + UI.esc(c.name) + '<br><span class="muted" style="text-transform:none;font-weight:400">' +
        (c.art === "schriftlich" ? "schriftl." : "sonst.") + " · Gew " + c.gewichtung + "</span></th>"
    ).join("") + '<th class="num">Gesamt</th></tr>';

    const body = schueler.map((s) => {
      const res = Calc.berechneSchueler(kats, notenBySchueler[s.id] || [], k, state.settings.rundung, hj);
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
        '<div class="tabs" style="margin:0">' + hjTabsHTML("notenHalbjahr", "noten-hj") + "</div>" +
        '<div class="grow muted">Tippe auf eine Zelle, um Einzelnoten zu erfassen. Tippe auf den Namen für die Berechnung.</div>' +
        '<button class="btn small" data-action="export-noten">Noten-CSV</button>' +
        '<button class="btn small" data-action="export-einzelnoten">Einzelnoten-CSV</button>' +
      "</div>" +
      '<div class="table-wrap"><table><thead>' + kopf + "</thead><tbody>" + body + "</tbody></table></div>"
    );
  }

  // ---- Tab: Sitzplan (Editor) ---------------------------------------------
  async function TabSitzplan(k) {
    const [plan, schueler, abwList] = await Promise.all([
      Store.Sitzplan.get(k.id), Store.Schueler.byKlasse(k.id),
      Store.Abwesenheiten.byKlasseUndTag(k.id, Store.datumLokal())
    ]);
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
    const [schueler, ereignisse, abwList] = await Promise.all([
      Store.Schueler.byKlasse(k.id), Store.Ereignisse.byKlasse(k.id),
      Store.Abwesenheiten.byKlasse(k.id)
    ]);
    const now = Store.now();
    const ranges = { alle: 0, "30": 30 * 86400000, "7": 7 * 86400000 };
    const von = state.auswertungRange === "alle" ? 0 : now - ranges[state.auswertungRange];
    const hj = hjFilter("auswertungHalbjahr");
    const ereignisseGefiltert = hj ? ereignisse.filter((e) => !e.halbjahr || e.halbjahr === hj) : ereignisse;
    const abwesendTage = new Set(abwList.map((a) => a.schuelerId + "|" + a.datum));
    const ausw = Calc.auswertungMitarbeit(ereignisseGefiltert, state.settings, von, now, abwesendTage);

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
        '<div class="tabs" style="margin:0">' + hjTabsHTML("auswertungHalbjahr", "ausw-hj") + "</div>" +
        '<div class="grow"></div>' +
        '<button class="btn small" data-action="export-events">Mitarbeit-CSV</button>' +
      "</div>" +
      '<p class="muted">Notenvorschlag = Ø Punkte pro aktivem Tag, gemappt über die Schwellen in den Einstellungen. Tage mit Abwesenheit zählen nicht. Nur ein Vorschlag – bitte prüfen.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th class="num">Meld.</th><th class="num">Punkte</th><th class="num">Ø/Tag</th><th>Zuletzt</th><th class="num">Vorschlag</th><th>Aufschlüsselung</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
    );
  }

  Object.assign(global.Views, { ViewHome, ViewKlasse });
})(window);
