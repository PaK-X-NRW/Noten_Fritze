/* =========================================================================
   views.reihen.js – Unterrichtsreihen (Knopf „Reihen“ neben Klassen · Stundenplan)
   - Übersicht: alle Reihen = Stunden einer Klasse mit gleichem Reihennamen
     (Feld „Reihe“ im Planungsfenster, views.planung.js)
   - Ansehen: die Stunden der Reihe mit Thema, Phasen, Links und Dateinamen
   - Exportieren als Paket (JSON; Datei-Inhalte auf Wunsch) und Importieren
   - In eine Klasse übernehmen: stundenweise auf die freien Stunden ab einem
     Datum verteilen (schon geplante Stunden werden übersprungen), mit Vorschau;
     danach sind es ganz normale Planungen
   Rechnungen in calc.planung.js (reihenAusPlanungen, reiheVorlage,
   reiheVerteilen), Paket in store.transfer.js (reihePaket, reiheAusPaket).
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, render, homeUmschalterHTML, homeInfoHTML, tagKurz, blockName } = global.Views;
  const api = global.Views;

  function datumDeutsch(d) {
    return d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);
  }
  function stundenText(n) {
    return n + (n === 1 ? " Stunde" : " Stunden");
  }

  // =========================================================================
  //  ANSICHT
  // =========================================================================
  async function ViewReihen() {
    const s = state.settings;
    const [planungen, klassenListe] = await Promise.all([Store.Planungen.alle(), Store.Klassen.all()]);
    const klassen = {};
    klassenListe.forEach((k) => { klassen[k.id] = k; });
    // Für die Aktionen (Index in data-i) bis zum nächsten Rendern
    state.reihen = Calc.reihenAusPlanungen(planungen.filter((p) => klassen[p.klasseId]), s.stundenzeiten);

    const topbar =
      '<div class="title-wrap"><h1 class="main">Noten-Fritze</h1><span class="sub">Reihen</span></div>' +
      homeUmschalterHTML("reihen") +
      '<div class="grow"></div>' +
      '<button class="iconbtn" data-action="settings" title="Einstellungen">⚙️</button>' +
      '<button class="btn" data-action="reihe-import">Reihe importieren</button>' +
      '<input type="file" id="reihe-datei" accept=".json,application/json" hidden>';

    const karten = state.reihen.map((r, i) => {
      const k = klassen[r.klasseId];
      return '<div class="card reihe-karte" style="border-left:8px solid ' + Calc.klassenFarbe(k) + '">' +
        "<h3>" + UI.esc(r.name) + "</h3>" +
        '<div class="muted">' + UI.esc(k.name || "(ohne Namen)") + (k.fach ? " · " + UI.esc(k.fach) : "") + " · " +
          stundenText(r.stunden.length) + " · " + datumDeutsch(r.von) + (r.bis !== r.von ? " – " + datumDeutsch(r.bis) : "") + "</div>" +
        '<div class="btn-row">' +
          '<button class="btn small" data-action="reihe-ansehen" data-i="' + i + '">Ansehen</button>' +
          '<button class="btn small" data-action="reihe-export" data-i="' + i + '">Exportieren</button>' +
          '<button class="btn small primary" data-action="reihe-uebernehmen" data-i="' + i + '">In Klasse übernehmen</button>' +
        "</div></div>";
    }).join("");

    const body =
      '<p class="muted">Eine Reihe sind alle Stunden einer Klasse, bei denen in der Stundenplanung derselbe Name im Feld ' +
        "„Reihe“ steht (z. B. „Der Schimmelreiter“). Hier kannst du sie ansehen, als Datei sichern und in eine Klasse " +
        "übernehmen – etwa im nächsten Schuljahr. Die Stunden werden dabei der Reihe nach auf die freien Stunden der " +
        "Klasse verteilt.</p>" +
      (karten ? '<div class="reihen-liste">' + karten + "</div>"
        : '<div class="empty"><div class="big">📚</div><p>Noch keine Reihen.</p>' +
          '<p class="muted">Öffne im Stundenplan eine Stunde und trage oben neben dem Thema bei „Reihe“ einen Namen ein.</p></div>') +
      homeInfoHTML();

    return { topbar, body, mount: () => {
      const feld = UI.$("#reihe-datei");
      if (feld) feld.addEventListener("change", (ev) => {
        const datei = ev.target.files && ev.target.files[0];
        ev.target.value = "";
        if (datei) reiheDateiLesen(datei).catch(UI.fehlerMelden);
      });
    }};
  }

  // =========================================================================
  //  AKTIONEN
  // =========================================================================
  function reiheVon(el) {
    return (state.reihen || [])[parseInt(el.getAttribute("data-i"), 10)] || null;
  }

  // Die Stunden der Reihe: Datum, Thema, Phasen, Links, Dateinamen
  async function reiheAnsehen(el) {
    const r = reiheVon(el);
    if (!r) return;
    const k = await Store.Klassen.get(r.klasseId);
    const zeilen = r.stunden.map((p, n) => {
      const bs = p.bausteine || [];
      const phasen = bs.filter((x) => x.typ !== "datei" && x.typ !== "link").map((x) => String(x.phase || "").trim()).filter(Boolean);
      const links = bs.filter((x) => x.typ === "link").length;
      const dateien = bs.filter((x) => x.typ === "datei").map((x) => "📄 " + UI.esc(x.name || "Datei"));
      return '<tr><td class="num">' + (n + 1) + "</td>" +
        '<td class="reihe-wann">' + tagKurz(p.datum) + "<br>" + UI.esc(blockName(p.blockId, true)) + "</td>" +
        "<td><strong>" + UI.esc(p.thema || "–") + "</strong>" +
          (phasen.length || links ? '<div class="hint">' + UI.esc(phasen.join(" · ")) + (links ? (phasen.length ? " · " : "") + "🔗 " + links : "") + "</div>" : "") +
          (dateien.length ? '<div class="hint">' + dateien.join(", ") + "</div>" : "") + "</td></tr>";
    }).join("");
    UI.modal({
      title: r.name + " · " + ((k && k.name) || ""),
      bodyHTML: '<div class="table-wrap"><table class="reihe-tab"><tbody>' + zeilen + "</tbody></table></div>",
      buttons: [{ label: "Schließen" }]
    });
  }

  // Als Paket speichern; Datei-Inhalte nur auf Wunsch (wie beim Backup)
  async function reiheExport(el) {
    const r = reiheVon(el);
    if (!r) return;
    const vorlage = Calc.reiheVorlage(r.stunden, state.settings.stundenzeiten);
    const ids = [];
    vorlage.forEach((st) => st.bausteine.forEach((x) => { if (x.typ === "datei" && x.dateiId && ids.indexOf(x.dateiId) === -1) ids.push(x.dateiId); }));
    const mitInhalt = (await Promise.all(ids.map((id) => Store.Dateien.get(id)))).filter((d) => d && d.daten);
    let mitDateien = false;
    if (mitInhalt.length) {
      const groesse = mitInhalt.reduce((n, d) => n + (d.groesse || 0), 0);
      const wahl = await new Promise((resolve) => UI.modal({
        title: "Reihe exportieren",
        bodyHTML: "<p>Zu dieser Reihe gehören " + mitInhalt.length + " Datei(en) mit zusammen " + api.groesseText(groesse) + ".</p>" +
          '<div class="field"><label class="hstack"><input type="checkbox" id="rx-dateien" style="width:auto;min-height:auto"> Dateien mitsichern</label>' +
          '<div class="hint">Ohne Häkchen enthält das Paket nur die Dateinamen; die Dateien fügst du nach dem Übernehmen neu hinzu.</div></div>',
        onClose: () => resolve(null),
        buttons: [
          { label: "Abbrechen", onClick: (close) => { resolve(null); close(); } },
          { label: "Exportieren", className: "primary", onClick: (close, box) => { resolve(box.querySelector("#rx-dateien").checked); close(); } }
        ]
      }));
      if (wahl === null) return;
      mitDateien = wahl;
    }
    const paket = await Store.reihePaket(r.name, vorlage, mitDateien);
    const status = await CSV.speichern("reihe_" + CSV.safe(r.name) + ".json", JSON.stringify(paket, null, 2), "application/json");
    if (status !== "abgebrochen") UI.toast("Reihe „" + r.name + "“ gespeichert");
  }

  // Dateiauswahl muss direkt im Tipp passieren (sonst blockt iOS)
  function reiheImportStart() {
    const feld = UI.$("#reihe-datei");
    if (feld) feld.click();
  }
  function reiheDateiLesen(datei) {
    return new Promise((resolve, reject) => {
      const leser = new FileReader();
      leser.onload = () => resolve(leser.result);
      leser.onerror = () => reject(leser.error);
      leser.readAsText(datei);
    }).then((text) => {
      let paket;
      try { paket = JSON.parse(text); } catch (e) { throw new Error("Die Datei ist keine gültige Reihen-Datei."); }
      const r = Store.reiheAusPaket(paket);
      return uebernehmenDialog(r.name, r.vorlage, r.dateien, null);
    });
  }

  function reiheUebernehmen(el) {
    const r = reiheVon(el);
    if (!r) return;
    return uebernehmenDialog(r.name, Calc.reiheVorlage(r.stunden, state.settings.stundenzeiten), [], r.klasseId);
  }

  // Klasse und Startdatum wählen, Vorschau der Verteilung, übernehmen.
  //   vorlage: Calc.reiheVorlage; dateien: Datei-Datensätze aus einem Paket
  async function uebernehmenDialog(name, vorlage, dateien, vorwahl) {
    const s = state.settings;
    const [klassenListe, versionen, termine, planungen] = await Promise.all([
      Store.Klassen.all(), Store.Stundenplan.alle(), Store.Termine.alle(), Store.Planungen.alle()
    ]);
    if (!klassenListe.length) { UI.toast("Erst eine Klasse anlegen"); return; }
    if (!versionen.length) { UI.toast("Erst einen Stundenplan einrichten – die Reihe wird auf seine Stunden verteilt"); return; }
    const klassen = klassenListe.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
    const heute = Store.datumLokal();
    let zuordnung = [];

    const vorschau = (box) => {
      const klasseId = box.querySelector('[name="klasseId"]').value;
      const ab = box.querySelector('[name="ab"]').value || heute;
      const ziele = Calc.stundenReihe(versionen, s.abWochen, termine, s.stundenzeiten, klasseId, ab, Calc.datumPlusTage(ab, 366));
      const belegt = {};
      planungen.filter((p) => p.klasseId === klasseId).forEach((p) => { belegt[p.datum + "|" + p.blockId] = true; });
      zuordnung = Calc.reiheVerteilen(vorlage.length, ziele, belegt);
      const letzte = zuordnung[zuordnung.length - 1];
      const bisLetzte = letzte ? ziele.slice(0, ziele.findIndex((z) => z.datum === letzte.datum && z.blockId === letzte.blockId) + 1) : [];
      const uebersprungen = bisLetzte.filter((z) => belegt[z.datum + "|" + z.blockId]).length;
      box.querySelector("#rv").innerHTML =
        (zuordnung.length < vorlage.length
          ? '<div class="hint-box">Nur ' + zuordnung.length + " von " + stundenText(vorlage.length) + " finden im nächsten Jahr Platz.</div>" : "") +
        (uebersprungen ? '<p class="hint">' + uebersprungen + " schon geplante Stunde(n) werden übersprungen.</p>" : "") +
        '<ol class="reihe-vorschau">' + zuordnung.map((z, n) =>
          "<li><strong>" + UI.esc(vorlage[n].thema || "(ohne Thema)") + "</strong> → " + tagKurz(z.datum) + " · " +
            UI.esc(blockName(z.blockId, true)) + "</li>").join("") + "</ol>";
    };

    UI.modal({
      title: "Reihe übernehmen",
      bodyHTML:
        '<p class="muted">' + stundenText(vorlage.length) + " werden der Reihe nach auf die freien Stunden der Klasse ab dem " +
          "gewählten Datum verteilt – mit Thema, Bausteinen und Dateinamen. Danach sind es ganz normale Planungen.</p>" +
        UI.field("Name der Reihe", "name", name, { placeholder: "z. B. Der Schimmelreiter" }) +
        '<div class="form-row">' +
          UI.field("Klasse", "klasseId", vorwahl || klassen[0].id, { type: "select",
            options: klassen.map((k) => ({ value: k.id, label: k.name + (k.fach ? " · " + k.fach : "") })) }) +
          UI.field("Ab", "ab", heute, { type: "date" }) +
        "</div>" +
        '<div id="rv"></div>',
      onMount: (box) => {
        box.querySelector('[name="klasseId"]').addEventListener("change", () => vorschau(box));
        box.querySelector('[name="ab"]').addEventListener("change", () => vorschau(box));
        vorschau(box);
      },
      buttons: [
        { label: "Abbrechen" },
        { label: "Übernehmen", className: "primary", onClick: async (close, box) => {
          const reihe = box.querySelector('[name="name"]').value.trim();
          if (!reihe) { UI.toast("Bitte einen Namen für die Reihe eingeben"); return; }
          if (!zuordnung.length) { UI.toast("In diesem Zeitraum gibt es keine freien Stunden dieser Klasse"); return; }
          const klasseId = box.querySelector('[name="klasseId"]').value;
          close();
          await Store.Planungen.reiheEinfuegen(klasseId, reihe, zuordnung.map((z, n) =>
            Object.assign({}, z, { thema: vorlage[n].thema, bausteine: vorlage[n].bausteine })), dateien);
          // Zum Stundenplan in die Woche der ersten Stunde
          await api.ansichtSetzen("stundenplan");
          state.stundenplanAnsicht = "woche";
          state.stundenplanWoche = Calc.montagVon(zuordnung[0].datum);
          await render();
          UI.toast("„" + reihe + "“: " + stundenText(zuordnung.length) + " übernommen", { duration: 6000 });
        }}
      ]
    });
  }

  Object.assign(global.Views, {
    ViewReihen, reiheAnsehen, reiheExport, reiheImportStart, reiheUebernehmen
  });
})(window);
