/* =========================================================================
   views.home-klasse.js – Home (Klassenübersicht) und Klassenansicht
   mit den Tabs Schüler, Noten, Kategorien, Sitzplan und Mitarbeit.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, render, quartalFilter, quartalTabsHTML, halbjahrFilter, halbjahrTabsHTML } = global.Views;

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

    const body = (klassen.length
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
      '<button class="btn" data-action="export-klasse" title="Klasse als JSON exportieren (z. B. für Kolleg/innen)">Exportieren</button>' +
      '<button class="btn" data-action="edit-class">Bearbeiten</button>' +
      '<button class="btn" data-action="open-besprechung">Besprechung</button>' +
      '<button class="btn primary" data-action="open-tracker">▶︎ Tracker</button>';

    const body = '<div class="tabs">' + tabs + "</div>" + inner;
    return { topbar, body, mount: () => mountKlasse(k) };
  }

  function mountKlasse(k) {
    if (state.tab === "noten") mountNotenTabelle(k);
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
        "<td><strong>" + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
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

  // ---- Tab: Noten ----------------------------------------------------------
  // Die Notenübersicht zeigt genau ein Halbjahr. Aufbau der Spalten:
  //   Name | schriftliche Leistungen | [1. Quartal: sonstige Leistungen] |
  //   Epochalnote 1 | [2. Quartal: …] | Epochalnote 2 | Schriftliche
  //   Leistungen | Sonstige Leistungen | Zeugnisnote (im 2. HJ + Jahr)
  // Jede Leistung („2. Klassenarbeit", „HÜ 10.09.") ist eine eigene Spalte mit
  // genau einer Note je Schüler/in; die Rechenkette steckt in
  // Calc.halbjahrErgebnis.

  // Render-Kontext der Tabelle. TabNoten füllt ihn; die Inline-Eingabe rechnet
  // damit einzelne Zeilen neu, ohne die ganze View neu aufzubauen.
  let notenKtx = null;

  // Badge für eine Note auf der Zeugnisskala (ganze Note bzw. 4-).
  function zeugnisBadge(note, mss) {
    if (note === null || note === undefined) return '<span class="muted">–</span>';
    return '<span class="note-badge" style="background:' + Calc.noteFarbe(note, mss) + '">' + Calc.formatZeugnisnote(note, mss) + "</span>";
  }
  // Badge für eine Drittelnote – angezeigt als Tendenz (2+, 3, 4-).
  function tendenzBadge(note, mss) {
    if (note === null || note === undefined) return '<span class="muted">–</span>';
    return '<span class="note-badge" style="background:' + Calc.noteFarbe(note, mss) + '">' + Calc.formatTendenz(note, mss) + "</span>";
  }

  async function TabNoten(k) {
    const [schueler, katsRoh, leistungen, notenAll, ereignisse] = await Promise.all([
      Store.Schueler.byKlasse(k.id),
      Store.Kategorien.byKlasse(k.id),
      Store.Leistungen.byKlasse(k.id),
      Store.Noten.byKlasse(k.id),
      Store.Ereignisse.byKlasse(k.id)
    ]);
    if (!schueler.length) return '<div class="empty"><div class="big">📋</div><p>Erst Schüler/innen anlegen.</p></div>';
    if (!katsRoh.length) return '<div class="empty"><div class="big">🏷️</div><p>Erst Kategorien anlegen.</p><button class="btn primary" data-action="class-tab" data-tab="kategorien">Zu den Kategorien</button></div>';

    const mss = Calc.istMSS(k);
    const hj = halbjahrFilter();
    const quartale = hj === 2 ? [3, 4] : [1, 2];

    const katById = {};
    katsRoh.forEach((c) => { katById[c.id] = c; });
    // Reihenfolge für die Rechnung: erst schriftlich, dann sonstige
    const kats = katsRoh.filter((c) => c.art === "schriftlich")
      .concat(katsRoh.filter((c) => c.art !== "schriftlich"));

    // Spalten dieses Halbjahres (Kategorie muss es noch geben)
    const hjLeistungen = leistungen.filter((l) =>
      katById[l.kategorieId] && quartale.indexOf(l.quartal) !== -1);

    const notenBySchueler = {};
    notenAll.forEach((n) => (notenBySchueler[n.schuelerId] = notenBySchueler[n.schuelerId] || []).push(n));

    const key = spaltenKey(k.id, hj);
    const eigeneReihenfolge = !!(state.notenSpalten && state.notenSpalten.key === key);
    notenKtx = { k, mss, hj, quartale, kats, katById, leistungen: hjLeistungen, schueler, notenBySchueler, ereignisse, key };
    notenKtx.spalten = spaltenOrdnen(halbjahrSpalten(notenKtx), key);

    const body = schueler.map((s) => notenZeile(s)).join("");

    // Offene Quartale (Mitarbeitsnote fehlt) im Hinweis benennen – sonst wirkt
    // das „⋯“ in der Epochalnote wie ein Fehler.
    const offeneQuartale = quartale.filter((q) => !Calc.mitarbeitVorhanden(kats, notenAll, q));
    const hinweis = offeneQuartale.length
      ? "Noch offen: " + offeneQuartale.map((q) => q + ". Quartal").join(" und ") +
        " – die Epochalnote entsteht, sobald die Mitarbeitsnote über „Quartal abschließen“ im Mitarbeit-Tab übertragen ist."
      : "Noten direkt in die Zellen tippen (2+, 3, 4-) – Enter springt nach unten, Tab nach rechts. " +
        "Tipp auf einen Spaltenkopf bearbeitet die Spalte, Tipp auf den Namen zeigt die Berechnung.";

    return (
      '<div class="hstack wrap" style="margin-bottom:var(--gap)">' +
        '<div class="tabs" style="margin:0">' + halbjahrTabsHTML("noten-hj", k) + "</div>" +
        '<button class="btn small primary" data-action="add-leistung">＋ Spalte</button>' +
        '<div class="grow muted">' + hinweis + "</div>" +
        (eigeneReihenfolge ? '<button class="btn small" data-action="noten-spalten-reset">Spalten zurücksetzen</button>' : "") +
        '<button class="btn small" data-action="export-noten">Noten-CSV</button>' +
        '<button class="btn small" data-action="export-einzelnoten">Einzelnoten-CSV</button>' +
      "</div>" +
      '<div class="table-wrap noten-wrap"><table class="noten-tab"><thead>' +
        spaltenKopfZeile(notenKtx.spalten) + "</thead><tbody>" + body + "</tbody></table>" +
        '<div class="noten-rand"></div>' +
      "</div>"
    );
  }

  // ---- Noten: Spaltenmodell -------------------------------------------------
  // Jede Spalte kennt ihre ID (Basis fürs Umsortieren), ihre Farbgruppe, den
  // Kopftext und wie ihre Datenzelle gefüllt wird. Die Namensspalte gehört
  // bewusst nicht dazu: sie bleibt fixiert ganz links stehen.
  function grpKlasse(art) {
    return art === "schriftlich" ? "grp-schriftlich" : "grp-sonstige";
  }
  function spaltenKlassen(sp, extra) {
    return "num " + sp.grp + (sp.trenner ? " summe" : "") + (sp.stark ? " summe-stark" : "") + (extra ? " " + extra : "");
  }
  function spaltenZelle(sp, inhalt, extra, attr) {
    return '<td class="' + spaltenKlassen(sp, extra) + '"' + (attr || "") + ">" + inhalt + "</td>";
  }

  // Spalte einer einzelnen Leistung: hier wird getippt (eine Note je Zelle).
  function leistungSpalte(l, kat, mss) {
    const untertitel = UI.esc(kat.name) + (l.datum ? " · " + UI.datumKurz(l.datum) : "");
    return {
      id: "l:" + l.id,
      grp: grpKlasse(kat.art),
      leistungId: l.id,
      kopf: UI.esc(l.titel || kat.name) +
        '<br><span class="muted" style="text-transform:none;font-weight:400">' + untertitel + "</span>",
      zelle: (sp, ctx) => {
        const n = ctx.werte[l.id];
        const inhalt = n && n.wert !== null && n.wert !== undefined
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(n.wert, mss) + '">' + Calc.formatTendenz(n.wert, mss) + "</span>"
          : '<span class="muted">–</span>';
        return spaltenZelle(sp, inhalt, "zelle",
          ' data-lid="' + l.id + '" data-sid="' + ctx.s.id + '" tabindex="0"');
      }
    };
  }

  // Zählspalte einer Kategorie mit anzeige "fehlendeHA" – je Quartal.
  function haSpalte(kat, quartal) {
    return {
      id: "ha:" + kat.id + ":" + quartal,
      grp: "grp-sonstige",
      kopf: UI.esc(kat.name) +
        '<br><span class="muted" style="text-transform:none;font-weight:400">vergessene HA · ' + quartal + ". Q</span>",
      zelle: (sp, ctx) => {
        const anzahl = ctx.ereignisse.filter((e) =>
          e.schuelerId === ctx.s.id && e.typ === "keinehausaufgabe" &&
          (!e.quartal || e.quartal === quartal)
        ).length;
        return spaltenZelle(sp, anzahl ? "<strong>" + anzahl + "×</strong>" : '<span class="muted">–</span>');
      }
    };
  }

  // Aufbau der Spalten eines Halbjahres (siehe Kopfkommentar des Tabs).
  function halbjahrSpalten(ktx) {
    const mss = ktx.mss;
    const spalten = [];
    const vonKategorie = (l) => ktx.katById[l.kategorieId];

    // 1) Schriftliche Leistungen des Halbjahres (über beide Quartale hinweg)
    ktx.leistungen
      .filter((l) => vonKategorie(l).art === "schriftlich")
      .forEach((l) => spalten.push(leistungSpalte(l, vonKategorie(l), mss)));

    // 2) Je Quartal: sonstige Leistungen, HA-Zählung, dann die Epochalnote.
    // Spalten aus einer Mitarbeits-Kategorie bleiben ausgeblendet: Aus dem
    // Mitarbeitsbereich zeigt die Übersicht nur die fertige Epochalnote. Die
    // Note selbst zählt unverändert mit und ist im Schüler-Detail (Tipp auf
    // den Namen) korrigierbar.
    ktx.quartale.forEach((q, i) => {
      ktx.leistungen
        .filter((l) => l.quartal === q && vonKategorie(l).art !== "schriftlich" &&
          (vonKategorie(l).anzeige || "note") === "note" && vonKategorie(l).quelle !== "mitarbeit")
        .forEach((l) => spalten.push(leistungSpalte(l, vonKategorie(l), mss)));
      Object.keys(ktx.katById).map((id) => ktx.katById[id])
        .filter((c) => c.art !== "schriftlich" && c.anzeige === "fehlendeHA")
        .forEach((c) => spalten.push(haSpalte(c, q)));
      spalten.push({
        id: "epochal:" + q, grp: "grp-sonstige", trenner: true, stark: true,
        kopf: "Epochalnote " + (i + 1) +
          '<br><span class="muted" style="text-transform:none;font-weight:400">' + q + ". Quartal</span>",
        zelle: (sp, ctx) => {
          const e = ctx.hjErg.epochal.find((x) => x.quartal === q);
          // Ohne Mitarbeitsnote ist das Quartal noch offen – kein Zwischenstand,
          // der wie ein Ergebnis aussieht.
          if (e && e.offen) {
            return spaltenZelle(sp, '<span class="muted" title="Quartal noch nicht abgeschlossen – die Mitarbeitsnote fehlt">⋯</span>');
          }
          return spaltenZelle(sp, tendenzBadge(e ? e.note : null, mss));
        }
      });
    });

    // 3) Halbjahres-Teilnoten und Zeugnisnote
    spalten.push({
      id: "sum:schriftlich", grp: "grp-schriftlich", trenner: true, stark: true,
      kopf: "Schriftliche<br>Leistungen",
      zelle: (sp, ctx) => spaltenZelle(sp, tendenzBadge(ctx.hjErg.schriftlich, mss))
    });
    spalten.push({
      id: "sum:sonstige", grp: "grp-sonstige", stark: true,
      kopf: "Sonstige<br>Leistungen",
      zelle: (sp, ctx) => spaltenZelle(sp, tendenzBadge(ctx.hjErg.sonstige, mss))
    });
    const stufe = mss ? ktx.k.klassenstufe : null;
    spalten.push({
      id: "sum:zeugnis", grp: "grp-zeugnis", trenner: true, stark: true,
      kopf: "Zeugnisnote<br>" + (stufe ? stufe + "." + ktx.hj : ktx.hj + ". Halbjahr"),
      zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.hjErg.zeugnis, mss))
    });
    // In der Oberstufe ist jedes Kurshalbjahr eine eigene Endnote – dort gibt
    // es keine Jahresnote aus beiden Halbjahren.
    if (ktx.hj === 2 && !mss) {
      spalten.push({
        id: "sum:jahr", grp: "grp-zeugnis", stark: true,
        kopf: "Zeugnisnote<br>Jahr",
        zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.jahr, mss))
      });
    }
    return spalten;
  }

  function spaltenKey(klasseId, hj) {
    return klasseId + "|hj" + hj;
  }

  // Wendet eine per Ziehen gemerkte Reihenfolge an. Sie liegt nur im State
  // (nicht in IndexedDB): nach einem Neuladen steht die Tabelle wieder in der
  // Default-Reihenfolge. Passt die Spaltenmenge nicht mehr (neue oder gelöschte
  // Kategorie), gilt wieder der Default.
  function spaltenOrdnen(spalten, key) {
    const merk = state.notenSpalten;
    if (!merk || merk.key !== key || merk.ids.length !== spalten.length) return spalten;
    const nachId = {};
    spalten.forEach((sp) => { nachId[sp.id] = sp; });
    const sortiert = [];
    for (const id of merk.ids) {
      if (!nachId[id]) return spalten;
      sortiert.push(nachId[id]);
    }
    return sortiert;
  }

  function spaltenKopfZeile(spalten) {
    return "<tr><th>Name</th>" + spalten.map((sp) =>
      '<th class="' + spaltenKlassen(sp, "zieh") + '" data-spalte="' + UI.esc(sp.id) + '">' + sp.kopf + "</th>"
    ).join("") + "</tr>";
  }

  // Rechenkontext einer Zeile: die Noten des Schülers nach Spalte, dazu die
  // komplette Halbjahres-Kette (im 2. HJ zusätzlich die Jahresnote).
  function zeilenKontext(s) {
    const noten = notenKtx.notenBySchueler[s.id] || [];
    const werte = {};
    noten.forEach((n) => { if (n.leistungId) werte[n.leistungId] = n; });
    const hjErg = Calc.halbjahrErgebnis(notenKtx.kats, noten, notenKtx.k, notenKtx.hj, notenKtx.mss);
    let jahr = null;
    if (notenKtx.hj === 2) {
      const hj1 = Calc.halbjahrErgebnis(notenKtx.kats, noten, notenKtx.k, 1, notenKtx.mss);
      jahr = Calc.jahresnote(hj1.zeugnis, hjErg.zeugnis, notenKtx.mss);
    }
    return { s, werte, hjErg, jahr, ereignisse: notenKtx.ereignisse };
  }

  function notenZeilenInhalt(s) {
    const ctx = zeilenKontext(s);
    return '<td class="pointer" data-action="student-detail" data-sid="' + s.id + '"><strong>' +
      UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
      notenKtx.spalten.map((sp) => sp.zelle(sp, ctx)).join("");
  }
  function notenZeile(s) {
    return '<tr data-sid="' + s.id + '">' + notenZeilenInhalt(s) + "</tr>";
  }

  // ---- Noten: Scroll-Spielraum, Inline-Eingabe, Spalten ziehen -------------
  function mountNotenTabelle(k) {
    const wrap = UI.$(".noten-wrap");
    const table = wrap && UI.$(".noten-tab", wrap);
    if (!table || !notenKtx) return;
    randSpielraum(wrap, table);
    notenEingabe(table);
    spaltenZiehen(wrap, table, notenKtx.key, (spaltenId) => {
      if (spaltenId.indexOf("l:") === 0) Views.leistungDialog(k, spaltenId.slice(2));
    });
  }

  // Excel-artige Eingabe: Tipp auf eine Zelle macht sie zum Eingabefeld,
  // Enter springt eine Zeile nach unten, Tab in die nächste Spalte. Gespeichert
  // wird beim Verlassen; danach wird nur die betroffene Zeile neu gerechnet
  // (die Sammelspalten hängen allein an ihr).
  function notenEingabe(table) {
    let aktiv = null;   // { td, input, lid, sid, alt }
    let pad = null;     // Nummernpad (im body, position: fixed)

    table.addEventListener("click", (ev) => {
      const td = ev.target.closest ? ev.target.closest("td.zelle") : null;
      if (td && td !== (aktiv && aktiv.td)) oeffnen(td);
    });

    function zellen() { return UI.$all("td.zelle", table); }

    function oeffnen(td) {
      if (aktiv) schliessen(true);
      const lid = td.getAttribute("data-lid");
      const sid = td.getAttribute("data-sid");
      const noten = notenKtx.notenBySchueler[sid] || [];
      const vorhanden = noten.find((n) => n.leistungId === lid);
      const alt = vorhanden && vorhanden.wert !== null && vorhanden.wert !== undefined
        ? Calc.formatTendenz(vorhanden.wert, notenKtx.mss) : "";
      td.classList.add("editiert");
      // inputmode="none": Auf dem iPad soll die Bildschirmtastatur zubleiben –
      // eingegeben wird über das Nummernpad (eine angeschlossene Tastatur
      // funktioniert trotzdem weiter).
      td.innerHTML = '<input class="zelle-input" inputmode="none" value="' + UI.esc(alt) + '">';
      const input = td.querySelector("input");
      aktiv = { td, input, lid, sid, alt };
      input.focus();
      input.select();
      input.addEventListener("keydown", taste);
      input.addEventListener("blur", () => { if (aktiv && aktiv.input === input) schliessen(true); });
      padOeffnen();
    }

    function taste(ev) {
      if (ev.key === "Escape") { ev.preventDefault(); schliessen(false); return; }
      if (ev.key === "Enter" || ev.key === "Tab") {
        ev.preventDefault();
        speichernUndWeiter(ev.key === "Enter", ev.shiftKey ? -1 : 1);
      }
    }

    // Speichern und zur Nachbarzelle springen (Enter/Tab und Nummernpad).
    function speichernUndWeiter(nachUnten, richtung) {
      if (!aktiv) return;
      const lid = aktiv.lid, sid = aktiv.sid;
      schliessen(true).then(() => {
        const naechste = nachbarZelle(sid, lid, nachUnten, richtung);
        if (naechste) oeffnen(naechste);
      });
    }

    // ---- Nummernpad --------------------------------------------------------
    // Tastenfeld direkt an der Zelle: Sek I die Drittelnoten, Oberstufe die
    // Punkte 0–15 (jeweils beste zuerst). Ein Tipp speichert und springt eine
    // Zeile weiter, damit sich eine Spalte zügig ausfüllen lässt.
    function padWerte() {
      if (notenKtx.mss) {
        const liste = [];
        for (let p = 15; p >= 0; p--) liste.push(String(p));
        return liste;
      }
      return ["1", "1-", "2+", "2", "2-", "3+", "3", "3-", "4+", "4", "4-", "5+", "5", "5-", "6"];
    }

    function padOeffnen() {
      padSchliessen();
      pad = document.createElement("div");
      pad.className = "notenpad" + (notenKtx.mss ? " mss" : "");
      pad.innerHTML =
        '<div class="pad-grid">' +
          padWerte().map((w) =>
            '<button type="button" class="pad-btn" data-wert="' + UI.esc(w) + '">' + UI.esc(w) + "</button>"
          ).join("") +
        "</div>" +
        '<div class="pad-fuss">' +
          '<button type="button" class="pad-btn leer" data-wert="">leeren</button>' +
          '<button type="button" class="pad-btn fertig" data-fertig="1">fertig</button>' +
        "</div>";
      document.body.appendChild(pad);
      padPosition();
      // pointerdown statt click: So behält das Eingabefeld den Fokus (ein blur
      // würde vorzeitig speichern und schließen), und iOS liefert das Ereignis
      // zuverlässig – ein click kommt nach preventDefault dort nicht mehr an.
      pad.addEventListener("pointerdown", (ev) => {
        const btn = ev.target.closest ? ev.target.closest("button") : null;
        if (!btn || !aktiv) return;
        ev.preventDefault();
        if (btn.hasAttribute("data-fertig")) { schliessen(true); return; }
        aktiv.input.value = btn.getAttribute("data-wert");
        speichernUndWeiter(true, 1);
      });
      window.addEventListener("scroll", padPosition, true);
      window.addEventListener("resize", padPosition);
    }

    // Unter der Zelle, sonst darüber; immer innerhalb des Fensters.
    function padPosition() {
      if (!pad || !aktiv) return;
      const r = aktiv.td.getBoundingClientRect();
      const breite = pad.offsetWidth, hoehe = pad.offsetHeight;
      let links = r.left + r.width / 2 - breite / 2;
      links = Math.max(8, Math.min(links, window.innerWidth - breite - 8));
      let oben = r.bottom + 6;
      if (oben + hoehe > window.innerHeight - 8) oben = Math.max(8, r.top - hoehe - 6);
      pad.style.left = Math.round(links) + "px";
      pad.style.top = Math.round(oben) + "px";
    }

    function padSchliessen() {
      if (!pad) return;
      window.removeEventListener("scroll", padPosition, true);
      window.removeEventListener("resize", padPosition);
      if (pad.parentNode) pad.parentNode.removeChild(pad);
      pad = null;
    }

    // Nachbarzelle: Enter = gleiche Spalte, nächste Zeile · Tab = gleiche Zeile,
    // nächste Spalte (Shift kehrt die Richtung um).
    function nachbarZelle(sid, lid, nachUnten, richtung) {
      const alle = zellen();
      const index = alle.findIndex((td) =>
        td.getAttribute("data-sid") === sid && td.getAttribute("data-lid") === lid);
      if (index < 0) return null;
      if (!nachUnten) return alle[index + richtung] || null;
      const spalte = alle.filter((td) => td.getAttribute("data-lid") === lid);
      const pos = spalte.indexOf(alle[index]);
      return spalte[pos + richtung] || null;
    }

    async function schliessen(speichern) {
      if (!aktiv) return;
      const { td, input, lid, sid, alt } = aktiv;
      const text = input.value.trim();
      aktiv = null;
      padSchliessen();
      td.classList.remove("editiert");
      if (!speichern || text === alt) { zeileNeu(sid); return; }
      const wert = text === "" ? null : Calc.parseNote(text, notenKtx.mss);
      if (text !== "" && wert === null) {
        UI.toast(notenKtx.mss ? "Bitte Punkte 0–15 eingeben" : "Bitte eine Note eingeben, z. B. 2, 2+ oder 3-");
        zeileNeu(sid);
        return;
      }
      const leistung = notenKtx.leistungen.find((l) => l.id === lid);
      if (!leistung) return;
      const gespeichert = await Store.Noten.setzeZelle(leistung, sid, wert);
      // Lokalen Notenstand nachziehen, damit die Zeile ohne Neuladen stimmt
      const liste = (notenKtx.notenBySchueler[sid] || []).filter((n) => n.leistungId !== lid);
      if (gespeichert) liste.push(gespeichert);
      notenKtx.notenBySchueler[sid] = liste;
      zeileNeu(sid);
    }

    function zeileNeu(sid) {
      const tr = UI.$('tbody tr[data-sid="' + sid + '"]', table);
      const s = notenKtx.schueler.find((x) => x.id === sid);
      if (tr && s) tr.innerHTML = notenZeilenInhalt(s);
    }
  }

  // Zusätzlicher Platz rechts neben der Tabelle, damit sich auch die letzten
  // Spalten bis direkt neben die fixierte Namensspalte schieben lassen.
  function randSpielraum(wrap, table) {
    wrap.style.setProperty("--rand", "0px");
    if (wrap.scrollWidth <= wrap.clientWidth + 1) return;   // passt ohnehin
    const koepfe = UI.$all("thead th", table);
    const nameBreite = koepfe[0].getBoundingClientRect().width;
    const letzteBreite = koepfe[koepfe.length - 1].getBoundingClientRect().width;
    const rand = Math.max(0, Math.round(wrap.clientWidth - nameBreite - letzteBreite));
    wrap.style.setProperty("--rand", rand + "px");
  }

  // Spalten per Ziehen am Kopf umsortieren. Bewusst mit Pointer-Events statt
  // HTML5-Drag&Drop – letzteres gibt es auf iPad-Safari nicht. Während des
  // Ziehens wird nur die Zielspalte markiert; sortiert (und neu gerendert)
  // wird erst beim Loslassen, damit der Pointer nicht sein Element verliert.
  // Ein reiner Tipp (ohne Bewegung) ruft beimTippen(spaltenId) – der Klick
  // selbst kommt auf iOS nicht an, weil pointerdown preventDefault() macht.
  function spaltenZiehen(wrap, table, key, beimTippen) {
    const koepfe = UI.$all("thead th[data-spalte]", table);
    if (koepfe.length < 2) return;

    let quelle = null;      // gezogener <th>
    let quelleId = null;
    let startX = 0;
    let letztesX = 0;
    let aktiv = false;
    let ziel = -1;          // Einfügeposition 0 .. koepfe.length
    let rafId = 0;
    let rollen = 0;         // Pixel pro Frame beim Rand-Scrollen

    koepfe.forEach((th) => th.addEventListener("pointerdown", starten));

    function starten(ev) {
      if (ev.button) return;                    // nur linke Maustaste / Touch
      ev.preventDefault();                      // Textauswahl/Long-Press-Callout auf iOS unterdrücken
      quelle = ev.currentTarget;
      quelleId = quelle.getAttribute("data-spalte");
      startX = letztesX = ev.clientX;
      aktiv = false; ziel = -1;
      quelle.setPointerCapture(ev.pointerId);
      quelle.addEventListener("pointermove", bewegen);
      quelle.addEventListener("pointerup", loslassen);
      quelle.addEventListener("pointercancel", abbrechen);
      // Zusätzlich auf document: das Lösen hängt nicht am Pointer-Capture –
      // iOS darf den Drag so nicht per pointercancel/Scroll-Übernahme abwürgen.
      document.addEventListener("pointermove", bewegen);
      document.addEventListener("pointerup", loslassen);
      document.addEventListener("pointercancel", abbrechen);
    }

    function bewegen(ev) {
      letztesX = ev.clientX;
      if (!aktiv) {
        if (Math.abs(letztesX - startX) < 8) return;   // Schwelle: kein Tap
        aktiv = true;
        table.classList.add("spalten-ziehen");
        quelle.classList.add("zieht");
      }
      ev.preventDefault();
      zielSetzen(zielAus(letztesX));
      randRollen(letztesX);
    }

    // Einfügeposition aus der X-Koordinate: vor der Spalte, in deren linke
    // Hälfte gezeigt wird – sonst hinter der letzten.
    function zielAus(x) {
      for (let i = 0; i < koepfe.length; i++) {
        const r = koepfe[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) return i;
      }
      return koepfe.length;
    }

    function spaltenZellen(i) {
      return UI.$all("tr > :nth-child(" + (i + 2) + ")", table);   // +2: Namensspalte
    }
    function markierungWeg() {
      UI.$all(".ziel-vor, .ziel-nach", table).forEach((z) => {
        z.classList.remove("ziel-vor"); z.classList.remove("ziel-nach");
      });
    }
    function zielSetzen(pos) {
      if (pos === ziel) return;
      markierungWeg();
      ziel = pos;
      const letzte = pos >= koepfe.length;
      spaltenZellen(letzte ? koepfe.length - 1 : pos)
        .forEach((z) => z.classList.add(letzte ? "ziel-nach" : "ziel-vor"));
    }

    // Am linken/rechten Rand automatisch weiterscrollen, damit auch weit
    // entfernte Positionen in einem Zug erreichbar sind.
    function randRollen(x) {
      const r = wrap.getBoundingClientRect();
      const zone = 56;
      rollen = x < r.left + zone ? -14 : (x > r.right - zone ? 14 : 0);
      if (rollen && !rafId) rafId = requestAnimationFrame(rollenTick);
    }
    function rollenTick() {
      rafId = 0;
      if (!aktiv || !rollen) return;
      wrap.scrollLeft += rollen;
      zielSetzen(zielAus(letztesX));
      rafId = requestAnimationFrame(rollenTick);
    }

    function aufraeumen(ev) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      rollen = 0;
      markierungWeg();
      table.classList.remove("spalten-ziehen");
      if (quelle) {
        quelle.classList.remove("zieht");
        quelle.removeEventListener("pointermove", bewegen);
        quelle.removeEventListener("pointerup", loslassen);
        quelle.removeEventListener("pointercancel", abbrechen);
        if (ev && quelle.hasPointerCapture && quelle.hasPointerCapture(ev.pointerId)) {
          quelle.releasePointerCapture(ev.pointerId);
        }
      }
      // document-Listener aus starten wieder entfernen (gleiche Referenzen)
      document.removeEventListener("pointermove", bewegen);
      document.removeEventListener("pointerup", loslassen);
      document.removeEventListener("pointercancel", abbrechen);
      quelle = null;
    }

    function abbrechen(ev) { aktiv = false; aufraeumen(ev); }

    function loslassen(ev) {
      const warAktiv = aktiv;
      const pos = ziel;
      const id = quelleId;
      aktiv = false;
      aufraeumen(ev);
      if (!warAktiv || pos < 0) {               // reiner Tap: Spalte bearbeiten
        if (!warAktiv && beimTippen && id) beimTippen(id);
        return;
      }
      const ids = koepfe.map((th) => th.getAttribute("data-spalte"));
      const von = ids.indexOf(id);
      const nach = pos > von ? pos - 1 : pos;   // eigene Spalte fällt vorher raus
      if (von < 0 || nach === von) return;
      ids.splice(von, 1);
      ids.splice(nach, 0, id);
      state.notenSpalten = { key, ids };
      render();
    }
  }

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

  // ---- Tab: Mitarbeit-Auswertung ------------------------------------------
  // Gemeinsamer Rechenkontext der Mitarbeits-Auswertung (Tab + Herleitungs-Dialog):
  // wendet Zeitraum- und Quartal-Filter an und liefert das Ergebnis je Schüler.
  async function auswertungKontext(k) {
    const [schueler, ereignisse, abwList, stunden] = await Promise.all([
      Store.Schueler.byKlasse(k.id), Store.Ereignisse.byKlasse(k.id),
      Store.Abwesenheiten.byKlasse(k.id), Store.Stunden.byKlasse(k.id)
    ]);
    const now = Store.now();
    const ranges = { alle: 0, "30": 30 * 86400000, "7": 7 * 86400000 };
    const von = state.auswertungRange === "alle" ? 0 : now - ranges[state.auswertungRange];
    const q = quartalFilter("auswertungQuartal");
    const ereignisseGefiltert = q ? ereignisse.filter((e) => !e.quartal || e.quartal === q) : ereignisse;
    const stundenGefiltert = q ? stunden.filter((st) => !st.quartal || st.quartal === q) : stunden;
    const abwesendTage = new Set(abwList.map((a) => a.schuelerId + "|" + a.datum));
    const schwellen = Calc.schwellenFuer(state.settings, k);
    const ausw = Calc.auswertungMitarbeit(ereignisseGefiltert, state.settings, {
      vonTs: von, bisTs: now, abwesendTage, stunden: stundenGefiltert,
      schuelerIds: schueler.map((s) => s.id), schwellen
    });
    return {
      schueler, ausw, schwellen, stunden: stundenGefiltert,
      eigeneSchwellen: !!(Array.isArray(k.mitarbeitSchwellen) && k.mitarbeitSchwellen.length)
    };
  }

  // Übertragene Mitarbeitsnoten eines Quartals: schuelerId -> wert. Quelle sind
  // die Spalten der Mitarbeits-Kategorien in diesem Quartal – also genau das,
  // was „Quartal abschließen" geschrieben hat und was in die Note eingeht.
  async function mitarbeitNotenVonQuartal(k, quartal) {
    if (!quartal) return {};
    const [kats, leistungen, noten] = await Promise.all([
      Store.Kategorien.byKlasse(k.id), Store.Leistungen.byKlasse(k.id), Store.Noten.byKlasse(k.id)
    ]);
    const katIds = kats.filter((c) => c.quelle === "mitarbeit" &&
      c.art !== "schriftlich" && (c.anzeige || "note") === "note").map((c) => c.id);
    const leistungIds = leistungen
      .filter((l) => l.quartal === quartal && katIds.indexOf(l.kategorieId) !== -1)
      .map((l) => l.id);
    const map = {};
    noten.forEach((n) => {
      if (leistungIds.indexOf(n.leistungId) !== -1 && n.wert !== null && n.wert !== undefined) {
        map[n.schuelerId] = n.wert;
      }
    });
    return map;
  }

  async function TabAuswertung(k) {
    const ktx = await auswertungKontext(k);
    const schueler = ktx.schueler, ausw = ktx.ausw;
    const stundenGefiltert = ktx.stunden, eigeneSchwellen = ktx.eigeneSchwellen;
    const q = quartalFilter("auswertungQuartal");
    const mss = Calc.istMSS(k);
    const uebertragen = await mitarbeitNotenVonQuartal(k, q);

    const rangeBtns = [["alle", "Gesamt"], ["30", "30 Tage"], ["7", "7 Tage"]].map(([id, l]) =>
      '<button class="tab ' + (state.auswertungRange === id ? "active" : "") + '" data-action="ausw-range" data-range="' + id + '">' + l + "</button>"
    ).join("");

    // Abgeschlossenes Quartal: Stunden und Ereignisse bleiben stehen, die
    // Ansicht wird nur grau und gesperrt (kein Tracker, kein neuer Abschluss).
    const abschluss = q !== null ? Store.abschlussVon(k, q) : null;

    const rows = schueler.map((s) => {
      const a = ausw[s.id];
      const typen = a ? Store.EVENT_TYPES.filter((t) => a.typen[t.id]).map((t) =>
        '<span class="chip" style="background:' + t.farbe + '22;color:' + t.farbe + '">' + (a.typen[t.id]) + "× " + UI.esc(t.kurz) + "</span>").join(" ") : "";
      const note = a ? a.notenvorschlag : null;
      const hatVorschlag = note !== null && note !== undefined;
      // Der Tracker rechnet immer auf der 1–6-Skala. Angezeigt wird der
      // Vorschlag so, wie ihn der Abschluss-Dialog vorbelegt: als echte Note
      // (2+, 3, 4-) bzw. in der Oberstufe als MSS-Punkte (offizielle
      // Umrechnung). Der genaue Ø steht im Tooltip und in der Herleitung.
      const gerundet = hatVorschlag ? Calc.tendenznote(note, false) : null;
      const vorschlagText = !hatVorschlag ? "–"
        : mss ? String(Calc.noteZuMssPunkte(gerundet)) : Calc.formatTendenz(gerundet, false);
      const eingetragen = uebertragen[s.id];
      return "<tr>" +
        "<td><strong>" + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
        '<td class="num">' + (a ? a.meldungen : 0) + "</td>" +
        '<td class="num">' + (a ? a.punkte : 0) + "</td>" +
        '<td class="num">' + (a ? a.nenner : 0) + "</td>" +
        "<td>" + (a && a.letzte ? UI.relZeit(a.letzte) : '<span class="danger-text">nie</span>') + "</td>" +
        '<td class="num">' + (hatVorschlag
          ? '<button class="note-badge tappable" data-action="ausw-herleitung" data-sid="' + s.id +
            '" title="Ø der Stundennoten: ' + Calc.formatNote(note, 1) +
            (mss ? " (Note " + Calc.formatTendenz(gerundet, false) + ")" : "") +
            ' – tippen für die Herleitung" style="background:' +
            (mss ? Calc.noteFarbe(Calc.noteZuMssPunkte(gerundet), true) : Calc.noteFarbe(note)) + '">' +
            vorschlagText + "</button>"
          : "–") + "</td>" +
        '<td class="num">' + (eingetragen !== undefined
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(eingetragen, mss) + '">' +
            Calc.formatTendenz(eingetragen, mss) + "</span>"
          : '<span class="muted">–</span>') + "</td>" +
        "<td>" + typen + "</td>" +
      "</tr>";
    }).join("");

    const hinweis = abschluss
      ? '<div class="hint-box">🔒 <strong>' + q + ". Quartal abgeschlossen</strong> am " + UI.datumKurz(abschluss.datum) +
        ". Die Noten stehen in der Notenübersicht; Stunden und Meldungen bleiben zur Ansicht erhalten. " +
        "Für dieses Quartal lässt sich kein Tracker starten – dafür erst den Abschluss aufheben.</div>"
      : '<p class="muted">Stundennoten-Modell: jede gehaltene Stunde bekommt aus ihren Punkten eine Note (Schwellen' +
        (eigeneSchwellen ? " dieser Klasse" : " aus den Einstellungen") + "); der Vorschlag ist der Ø dieser Stundennoten. " +
        "Leistungsverweigerung = 6 für die Stunde, Tage mit Abwesenheit zählen nicht. " +
        stundenGefiltert.length + " Stunde" + (stundenGefiltert.length === 1 ? "" : "n") + " im gewählten Zeitraum. " +
        "Tippe auf einen Vorschlag, um die Rechnung zu sehen.</p>";

    return (
      '<div class="hstack wrap" style="margin-bottom:var(--gap)">' +
        '<div class="tabs" style="margin:0">' + rangeBtns + "</div>" +
        '<div class="tabs" style="margin:0">' + quartalTabsHTML("auswertungQuartal", "ausw-hj") + "</div>" +
        '<div class="grow"></div>' +
        '<button class="btn small" data-action="edit-schwellen">Schwellen' + (eigeneSchwellen ? " (eigene)" : "") + "</button>" +
        (q === null ? "" : abschluss
          ? '<button class="btn small" data-action="abschluss-aufheben" data-q="' + q + '">Abschluss aufheben</button>'
          : '<button class="btn small" data-action="quartal-abschliessen">Quartal abschließen</button>') +
        '<button class="btn small" data-action="export-events">Mitarbeit-CSV</button>' +
      "</div>" +
      hinweis +
      '<div class="table-wrap' + (abschluss ? " gesperrt" : "") + '"><table><thead><tr>' +
        "<th>Name</th><th class=\"num\">Meld.</th><th class=\"num\">Punkte</th><th class=\"num\">Stunden</th>" +
        "<th>Zuletzt</th><th class=\"num\">Vorschlag" + (mss ? " (Punkte)" : "") + "</th>" +
        '<th class="num" title="Die beim Quartalsabschluss übertragene Note – sie geht in die Epochalnote ein">Note</th>' +
        "<th>Aufschlüsselung</th></tr></thead><tbody>" + rows + "</tbody></table></div>"
    );
  }

  Object.assign(global.Views, { ViewHome, ViewKlasse, auswertungKontext, mitarbeitNotenVonQuartal });
})(window);
