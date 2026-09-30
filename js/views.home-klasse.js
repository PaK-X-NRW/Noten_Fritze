/* =========================================================================
   views.home-klasse.js – Home (Klassenübersicht, Hinweis auf nicht beendete
   Stunden) und Klassenansicht mit den Tabs Schüler und Kategorien. Die Tabs Noten, Sitzplan und
   Mitarbeit liegen in views.noten.js, views.sitzplan.js, views.mitarbeit.js.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, nameHTML } = global.Views;
  const api = global.Views;   // Tabs aus views.noten/sitzplan/mitarbeit.js (laden später)

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
          '<button class="iconbtn plain danger-text card-del" data-action="delete-class" data-id="' + k.id + '" title="Klasse löschen">🗑</button>' +
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

    const body = await vergesseneStundenHTML(klassen) +
      (klassen.length
      ? '<div class="grid cards">' + cards + "</div>"
      : '<div class="empty"><div class="big">🎓</div><p>Noch keine Klassen vorhanden.</p>' +
        '<button class="btn primary" data-action="add-class">Erste Klasse anlegen</button></div>') +
      // Dezenter Weg zur Infoseite (Anleitung, Datenschutz, Kontakt)
      '<p class="home-info"><a href="info.html">Was ist Noten-Fritze? · Anleitung · Datenschutz</a></p>';

    const topbar =
      '<div class="title-wrap"><h1 class="main">Noten-Fritze</h1>' +
      '<span class="sub">' + klassen.length + " Klasse" + (klassen.length === 1 ? "" : "n") + "</span></div>" +
      '<div class="grow"></div>' +
      '<button class="iconbtn" data-action="settings" title="Einstellungen">⚙️</button>' +
      '<button class="btn" data-action="import-klasse">Klasse importieren</button>' +
      '<button class="btn primary" data-action="add-class">＋ Klasse</button>';

    return { topbar, body };
  }

  // Dezente Leiste über den Klassen: Stunden, die nicht beendet wurden
  // (je Klasse die älteste). „Ansehen“ öffnet den Tracker-Start der Klasse,
  // der vor dem Beenden fragt, ob noch etwas nachzutragen ist.
  async function vergesseneStundenHTML(klassen) {
    const jetzt = Store.now();
    const namen = {};
    klassen.forEach((k) => { namen[k.id] = k.name || "(ohne Namen)"; });
    const jeKlasse = {};
    (await Store.Stunden.alleOffenen()).forEach((st) => {
      if (namen[st.klasseId] !== undefined && !jeKlasse[st.klasseId] && Calc.stundeVergessen(st, jetzt)) jeKlasse[st.klasseId] = st;
    });
    const zeilen = Object.keys(jeKlasse).map((id) => {
      const tag = new Date(jeKlasse[id].startTs).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
      return '<div class="offen-zeile"><span><strong>' + UI.esc(namen[id]) + "</strong>: Stunde vom " + UI.esc(tag) + " nicht beendet</span>" +
        '<button class="btn small" data-action="offene-stunde" data-id="' + UI.esc(id) + '">Ansehen</button></div>';
    }).join("");
    return zeilen ? '<div class="hint-box offen-box">' + zeilen + "</div>" : "";
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
    else if (state.tab === "noten") inner = await api.TabNoten(k);
    else if (state.tab === "kategorien") inner = await TabKategorien(k);
    else if (state.tab === "sitzplan")   inner = await api.TabSitzplan(k);
    else if (state.tab === "auswertung") inner = await api.TabAuswertung(k);

    const topbar =
      '<button class="iconbtn plain" data-action="home" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">' + UI.esc(k.name) + "</h1>" +
      '<span class="sub">' + UI.esc(k.fach) + " · " + UI.esc(k.schuljahr || "") + "</span></div>" +
      '<div class="grow"></div>' +
      '<button class="btn" data-action="export-klasse" title="Klasse als JSON exportieren (z. B. für Kolleg/innen)">Exportieren</button>' +
      '<button class="btn" data-action="edit-class">Bearbeiten</button>' +
      '<button class="btn" data-action="open-besprechung">Besprechung</button>' +
      '<button class="btn primary" data-action="open-tracker">▶︎ Tracker</button>';

    const body = '<div class="tabs">' + tabs + "</div>" + inner;
    return { topbar, body, mount: () => mountKlasse(k) };
  }

  function mountKlasse(k) {
    if (state.tab === "noten") api.mountNotenTabelle(k);
  }

  // ---- Tab: Schüler --------------------------------------------------------
  async function TabSchueler(k) {
    const schueler = await Store.Schueler.byKlasse(k.id);
    // Bei alphabetischer Sortierung wären die ▲/▼-Buttons wirkungslos –
    // sie erscheinen nur im Modus "manuell".
    const manuell = state.settings.schuelerSortierung === "manuell";
    const rows = schueler.map((s, i) =>
      "<tr>" +
        '<td class="num muted">' + (i + 1) + "</td>" +
        "<td>" + nameHTML(s) + "</td>" +
        "<td>" + UI.esc(s.bemerkung || "") + "</td>" +
        '<td class="right nowrap">' +
          (manuell
            ? '<button class="iconbtn plain" data-action="move-student" data-id="' + s.id + '" data-dir="up" title="Nach oben">▲</button>' +
              '<button class="iconbtn plain" data-action="move-student" data-id="' + s.id + '" data-dir="down" title="Nach unten">▼</button>'
            : "") +
          '<button class="iconbtn plain" data-action="edit-student" data-id="' + s.id + '" title="Bearbeiten">✎</button>' +
          '<button class="iconbtn plain danger-text" data-action="delete-student" data-id="' + s.id + '" title="Löschen">🗑</button>' +
        "</td>" +
      "</tr>"
    ).join("");

    const table = schueler.length
      ? '<div class="table-wrap"><table><thead><tr><th>#</th><th>Name</th><th>Bemerkung</th><th class="right">Aktionen</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
      : '<div class="empty"><div class="big">🧑‍🏫</div><p>Noch keine Schüler/innen.</p></div>';

    const sortHinweis = manuell
      ? "Reihenfolge: manuell (▲/▼) – in den Einstellungen änderbar."
      : "Reihenfolge: alphabetisch nach Nachname – in den Einstellungen änderbar.";

    return (
      '<div class="btn-row" style="margin-bottom:var(--gap)">' +
        '<button class="btn primary" data-action="add-student">＋ Schüler/in</button>' +
        '<button class="btn" data-action="import-students">CSV importieren</button>' +
        '<button class="btn" data-action="export-students">CSV exportieren</button>' +
      "</div>" +
      '<div class="muted" style="margin-bottom:var(--gap)">' + sortHinweis + "</div>" + table
    );
  }

  // ---- Tab: Kategorien -----------------------------------------------------
  async function TabKategorien(k) {
    const kats = await Store.Kategorien.byKlasse(k.id);
    function gruppe(art, titel) {
      const list = kats.filter((c) => c.art === art);
      // Kategorien, die nur zählen (vergessene HA), gehen nicht in die Gewichtung ein
      const gewSumme = list.filter((c) => c.anzeige !== "fehlendeHA")
        .reduce((a, c) => a + (Number(c.gewichtung) || 0), 0) || 1;
      const rows = list.map((c) => {
        const zaehltNicht = c.anzeige === "fehlendeHA";
        const anteil = ((Number(c.gewichtung) || 0) / gewSumme * 100).toFixed(0);
        return "<tr>" +
          "<td><strong>" + UI.esc(c.name) + "</strong>" +
            (zaehltNicht ? ' <span class="chip">zählt nicht in die Note · vergessene HA</span>' : "") +
            (c.quelle === "mitarbeit" ? ' <span class="chip accent">aus „Quartal abschließen“</span>' : "") + "</td>" +
          '<td class="num">' + (zaehltNicht ? '<span class="muted">–</span>' : UI.esc(String(c.gewichtung))) + "</td>" +
          '<td class="num">' + (zaehltNicht ? '<span class="muted">–</span>' : anteil + " %") + "</td>" +
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

  Object.assign(global.Views, { ViewHome, ViewKlasse });
})(window);
