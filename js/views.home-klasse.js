/* =========================================================================
   views.home-klasse.js – Home (Klassenübersicht) und Klassenansicht
   mit den Tabs Schüler, Noten, Kategorien, Sitzplan und Mitarbeit.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, render, quartalFilter, quartalTabsHTML } = global.Views;

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

    const body = klassen.length
      ? '<div class="grid cards">' + cards + "</div>"
      : '<div class="empty"><div class="big">🎓</div><p>Noch keine Klassen vorhanden.</p>' +
        '<button class="btn primary" data-action="add-class">Erste Klasse anlegen</button></div>';

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
    if (state.tab === "sitzplan") mountSitzplanEditor(k);
    else if (state.tab === "noten") mountNotenTabelle(k);
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
            (zaehltNicht ? ' <span class="chip">zählt nicht in die Note · vergessene HA</span>' : "") + "</td>" +
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
  // Badge für eine Note auf der Zeugnisskala (ganze Note bzw. 4-).
  function zeugnisBadge(note, mss) {
    if (note === null || note === undefined) return '<span class="muted">–</span>';
    return '<span class="note-badge" style="background:' + Calc.noteFarbe(note, mss) + '">' + Calc.formatZeugnisnote(note, mss) + "</span>";
  }

  async function TabNoten(k) {
    const [schueler, katsRoh, notenAll, ereignisse] = await Promise.all([
      Store.Schueler.byKlasse(k.id),
      Store.Kategorien.byKlasse(k.id),
      Store.Noten.byKlasse(k.id),
      Store.Ereignisse.byKlasse(k.id)
    ]);
    if (!schueler.length) return '<div class="empty"><div class="big">📋</div><p>Erst Schüler/innen anlegen.</p></div>';
    if (!katsRoh.length) return '<div class="empty"><div class="big">🏷️</div><p>Erst Kategorien anlegen.</p><button class="btn primary" data-action="class-tab" data-tab="kategorien">Zu den Kategorien</button></div>';

    const mss = Calc.istMSS(k);

    // Spalten gruppiert: erst die schriftlichen, dann die sonstigen Kategorien –
    // so stehen die Sammelspalten direkt hinter ihrer Gruppe.
    const schriftlicheKats = katsRoh.filter((c) => c.art === "schriftlich");
    const sonstigeKats = katsRoh.filter((c) => c.art !== "schriftlich");
    const kats = schriftlicheKats.concat(sonstigeKats);

    const notenBySchueler = {};
    notenAll.forEach((n) => (notenBySchueler[n.schuelerId] = notenBySchueler[n.schuelerId] || []).push(n));
    const q = quartalFilter("notenQuartal");
    const key = spaltenKey(k.id, q);
    const eigeneReihenfolge = !!(state.notenSpalten && state.notenSpalten.key === key);

    const spalten = spaltenOrdnen(
      q === null ? jahresSpalten(mss) : halbjahrSpalten(schriftlicheKats, sonstigeKats, mss), key
    );

    const body = schueler.map((s) => {
      const noten = notenBySchueler[s.id] || [];
      if (q === null) {
        // Jahr: die vier Quartale (nur Sonstige), dazu beide Halbjahre
        const qZeugnis = [1, 2, 3, 4].map((nq) =>
          Calc.zeugnisErgebnis(Calc.berechneSchueler(kats, noten, k, state.settings.rundung, nq), mss));
        const hj1 = Calc.zeugnisErgebnis(Calc.berechneSchueler(kats, noten, k, state.settings.rundung, "hj1"), mss);
        const hj2 = Calc.zeugnisErgebnis(Calc.berechneSchueler(kats, noten, k, state.settings.rundung, "hj2"), mss);
        return notenZeile(spalten, s, { q: qZeugnis, hj1, hj2, jahr: Calc.jahresnote(hj1.zeugnis, hj2.zeugnis, mss) });
      }
      const res = Calc.berechneSchueler(kats, noten, k, state.settings.rundung, q);
      const gBadge = res.gesamt !== null
        ? '<span class="note-badge" style="background:' + Calc.noteFarbe(res.gesamt, mss) + '">' +
          Calc.formatNote(res.gesamt, state.settings.rundung === "ganze" ? 0 : (state.settings.rundung === "keine" ? 2 : 1)) + "</span>"
        : '<span class="muted">–</span>';
      return notenZeile(spalten, s, { s, res, gBadge, ereignisse, quartal: q, zeugnis: Calc.zeugnisErgebnis(res, mss) });
    }).join("");

    const hinweis = q === null
      ? "Jahresübersicht: Sonstige der vier Quartale, dazu beide Halbjahre und das Jahr. Die Jahresnote entsteht aus den beiden Zeugnisnoten (je 50 %, bei Gleichstand zählt das 2. Halbjahr)."
      : "Tippe auf eine Zelle, um Einzelnoten zu erfassen. Tippe auf den Namen für die Berechnung. Spaltenköpfe lassen sich seitlich verschieben.";

    return (
      '<div class="hstack wrap" style="margin-bottom:var(--gap)">' +
        '<div class="tabs" style="margin:0">' + quartalTabsHTML("notenQuartal", "noten-hj") + "</div>" +
        '<div class="grow muted">' + hinweis + "</div>" +
        (eigeneReihenfolge ? '<button class="btn small" data-action="noten-spalten-reset">Spalten zurücksetzen</button>' : "") +
        '<button class="btn small" data-action="export-noten">Noten-CSV</button>' +
        '<button class="btn small" data-action="export-einzelnoten">Einzelnoten-CSV</button>' +
      "</div>" +
      '<div class="table-wrap noten-wrap"><table class="noten-tab"><thead>' +
        spaltenKopfZeile(spalten) + "</thead><tbody>" + body + "</tbody></table>" +
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

  function katSpalte(c, mss) {
    const zusatz = c.anzeige === "fehlendeHA"
      ? "vergessene HA"
      : (c.art === "schriftlich" ? "schriftl." : "sonst.") + " · Gew " + c.gewichtung;
    return {
      id: "kat:" + c.id,
      grp: grpKlasse(c.art),
      kopf: UI.esc(c.name) + '<br><span class="muted" style="text-transform:none;font-weight:400">' + zusatz + "</span>",
      zelle: (sp, ctx) => {
        if (c.anzeige === "fehlendeHA") {
          const anzahl = ctx.ereignisse.filter((e) =>
            e.schuelerId === ctx.s.id && e.typ === "keinehausaufgabe" && (!ctx.quartal || !e.quartal || e.quartal === ctx.quartal)
          ).length;
          return spaltenZelle(sp, anzahl ? "<strong>" + anzahl + "×</strong>" : '<span class="muted">–</span>');
        }
        const ke = ctx.res.kategorien.find((x) => x.id === c.id);
        const badge = ke && ke.schnitt !== null
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(ke.schnitt, mss) + '">' + Calc.formatNote(ke.schnitt) + "</span>"
          : '<span class="muted">–</span>';
        const anz = ke && ke.anzahl ? '<span class="muted"> n=' + ke.anzahl + "</span>" : "";
        return spaltenZelle(sp, badge + anz, "pointer row-hover",
          ' data-action="edit-cell" data-sid="' + ctx.s.id + '" data-cid="' + c.id + '"');
      }
    };
  }

  // Quartal-Ansicht: Kategorien, dahinter je Gruppe eine Sammelspalte.
  function halbjahrSpalten(schriftlicheKats, sonstigeKats, mss) {
    return [].concat(
      schriftlicheKats.map((c) => katSpalte(c, mss)),
      [{ id: "sum:schriftlich", grp: "grp-schriftlich", trenner: true, stark: true, kopf: "Schriftlich",
         zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.zeugnis.schriftlich, mss)) }],
      sonstigeKats.map((c) => katSpalte(c, mss)),
      [{ id: "sum:sonstige", grp: "grp-sonstige", trenner: true, stark: true, kopf: "Sonstige",
         zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.zeugnis.sonstige, mss)) },
       { id: "sum:gesamt", grp: "grp-zeugnis", trenner: true, kopf: "Gesamt",
         zelle: (sp, ctx) => spaltenZelle(sp, ctx.gBadge) },
       { id: "sum:zeugnis", grp: "grp-zeugnis", stark: true, kopf: "Zeugnis",
         zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.zeugnis.zeugnis, mss)) }]
    );
  }

  // Jahresübersicht: keine Einzelleistungen, sondern erst die sonstigen
  // Leistungen der vier Quartale, dann beide Halbjahre und das Jahr.
  function jahresSpalten(mss) {
    const qSpalte = (nq) => ({
      id: "jahr:q" + nq + ":sonstige",
      grp: "grp-sonstige",
      trenner: nq === 1,
      kopf: "Sonst. " + nq + ". Q",
      zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.q[nq - 1].sonstige, mss))
    });
    const hjSpalte = (nr, feld, grp, label, trenner) => ({
      id: "jahr:" + nr + ":" + feld,
      grp: grp,
      trenner: !!trenner,
      kopf: nr + ". HJ " + label,
      zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx["hj" + nr][feld], mss))
    });
    return [
      qSpalte(1), qSpalte(2), qSpalte(3), qSpalte(4),
      hjSpalte(1, "schriftlich", "grp-schriftlich", "schriftl.", true),
      hjSpalte(1, "sonstige", "grp-sonstige", "sonstige"),
      hjSpalte(1, "zeugnis", "grp-zeugnis", "Zeugnis"),
      hjSpalte(2, "schriftlich", "grp-schriftlich", "schriftl.", true),
      hjSpalte(2, "sonstige", "grp-sonstige", "sonstige"),
      hjSpalte(2, "zeugnis", "grp-zeugnis", "Zeugnis"),
      { id: "jahr:gesamt", grp: "grp-zeugnis", trenner: true, stark: true, kopf: "Jahr",
        zelle: (sp, ctx) => spaltenZelle(sp, zeugnisBadge(ctx.jahr, mss)) }
    ];
  }

  function spaltenKey(klasseId, hj) {
    return klasseId + "|" + (hj === null ? "jahr" : hj);
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

  function notenZeile(spalten, s, ctx) {
    ctx.s = s;
    return "<tr>" +
      '<td class="pointer" data-action="student-detail" data-sid="' + s.id + '"><strong>' + UI.esc(s.nachname) + "</strong>, " + UI.esc(s.vorname) + "</td>" +
      spalten.map((sp) => sp.zelle(sp, ctx)).join("") +
    "</tr>";
  }

  // ---- Noten: Scroll-Spielraum und Spalten ziehen ---------------------------
  function mountNotenTabelle(k) {
    const wrap = UI.$(".noten-wrap");
    const table = wrap && UI.$(".noten-tab", wrap);
    if (!table) return;
    randSpielraum(wrap, table);
    spaltenZiehen(wrap, table, spaltenKey(k.id, quartalFilter("notenQuartal")));
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
  function spaltenZiehen(wrap, table, key) {
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
      if (!warAktiv || pos < 0) return;         // reiner Tap: nichts tun
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

  async function TabAuswertung(k) {
    const ktx = await auswertungKontext(k);
    const schueler = ktx.schueler, ausw = ktx.ausw;
    const stundenGefiltert = ktx.stunden, eigeneSchwellen = ktx.eigeneSchwellen;
    const q = quartalFilter("auswertungQuartal");

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
        '<td class="num">' + (a ? a.nenner : 0) + "</td>" +
        '<td class="num">' + (note !== null && note !== undefined ? Calc.formatNote(note, 1) : "–") + "</td>" +
        "<td>" + (a && a.letzte ? UI.relZeit(a.letzte) : '<span class="danger-text">nie</span>') + "</td>" +
        '<td class="num">' + (note !== null && note !== undefined
          ? '<button class="note-badge tappable" data-action="ausw-herleitung" data-sid="' + s.id + '" title="So kommt der Vorschlag zustande" style="background:' + Calc.noteFarbe(note) + '">' + Calc.formatNote(note, 1) + "</button>"
          : "–") + "</td>" +
        "<td>" + typen + "</td>" +
      "</tr>";
    }).join("");

    return (
      '<div class="hstack wrap" style="margin-bottom:var(--gap)">' +
        '<div class="tabs" style="margin:0">' + rangeBtns + "</div>" +
        '<div class="tabs" style="margin:0">' + quartalTabsHTML("auswertungQuartal", "ausw-hj") + "</div>" +
        '<div class="grow"></div>' +
        '<button class="btn small" data-action="edit-schwellen">Schwellen' + (eigeneSchwellen ? " (eigene)" : "") + "</button>" +
        (q !== null ? '<button class="btn small" data-action="quartal-abschliessen">Quartal abschließen</button>' : "") +
        '<button class="btn small" data-action="export-events">Mitarbeit-CSV</button>' +
      "</div>" +
      '<p class="muted">Stundennoten-Modell: jede gehaltene Stunde bekommt aus ihren Punkten eine Note (Schwellen' +
        (eigeneSchwellen ? " dieser Klasse" : " aus den Einstellungen") + "); der Vorschlag ist der Ø dieser Stundennoten. " +
        "Leistungsverweigerung = 6 für die Stunde, Tage mit Abwesenheit zählen nicht. " +
        stundenGefiltert.length + " Stunde" + (stundenGefiltert.length === 1 ? "" : "n") + " im gewählten Zeitraum. " +
        "Tippe auf einen Vorschlag, um die Rechnung zu sehen.</p>" +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th class="num">Meld.</th><th class="num">Punkte</th><th class="num">Stunden</th><th class="num">Noten-Ø</th><th>Zuletzt</th><th class="num">Vorschlag</th><th>Aufschlüsselung</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
    );
  }

  Object.assign(global.Views, { ViewHome, ViewKlasse, auswertungKontext });
})(window);
