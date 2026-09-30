/* =========================================================================
   views.kalender.js – Kalender zum Stundenplan
   - Monatsansicht (Mo–So, Ferien als Band, Termine; Tipp -> Woche)
   - Termin-Dialog: Art (Store.TERMIN_ARTEN), Titel, Datum (Ferien: von–bis),
     Stunde oder ganztägig, Klasse
   - Menü einer Zelle der Wochenansicht: Klasse öffnen, fällt aus, verschieben
     (auf eine belegte Stunde = Plätze tauschen), Hinweis, Termin anlegen
   Die Wochenansicht selbst liegt in views.stundenplan.js, die Rechnungen
   (tatsächlicher Tag, Monatsraster) in calc.stundenplan.js.
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    state, go, render,
    terminText, terminFarbe, tagKurz, blockName, angezeigterMontag
  } = global.Views;
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August",
    "September", "Oktober", "November", "Dezember"];

  function klassenMap(liste) {
    const m = {};
    liste.forEach((k) => { m[k.id] = k; });
    return m;
  }
  // Angezeigter Monat "YYYY-MM" ("" = Monat der angezeigten Woche)
  function angezeigterMonat() {
    return state.stundenplanMonat || Calc.datumPlusTage(angezeigterMontag(), 3).slice(0, 7);
  }

  // =========================================================================
  //  MONAT
  // =========================================================================
  function monatHTML(termine, klassen, ansichtTabs) {
    const monat = angezeigterMonat();
    const heute = Store.datumLokal();
    const kopf = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((t, i) =>
      '<th class="' + (i > 4 ? "we" : "") + '">' + t + "</th>").join("");
    const zeilen = Calc.monatsRaster(monat).map((woche) => "<tr>" + woche.map((d, i) => {
      const frei = Calc.ferienAm(termine, d);
      const liste = termine.filter((t) => t.art !== "ferien" && t.art !== "aenderung" && t.datum === d);
      const chips = liste.slice(0, 3).map((t) =>
        '<div class="sp-termin" style="background:' + terminFarbe(t, klassen) + '">' + UI.esc(terminText(t, klassen)) + "</div>").join("") +
        (liste.length > 3 ? '<div class="hint">+' + (liste.length - 3) + " weitere</div>" : "");
      // Ferienname am ersten Tag der Ferien und an jedem Montag
      const freiName = frei && (frei.datum === d || i === 0) ? '<div class="mo-frei">🌴 ' + UI.esc(frei.titel || "frei") + "</div>" : "";
      return '<td class="mo-tag' + (d.slice(0, 7) !== monat ? " anders" : "") + (i > 4 ? " we" : "") +
        (frei ? " frei" : "") + (d === heute ? " heute" : "") + '" data-action="mo-tag" data-datum="' + d + '">' +
        '<div class="mo-nr">' + parseInt(d.slice(8, 10), 10) + "</div>" + freiName + chips + "</td>";
    }).join("") + "</tr>").join("");
    const jahr = parseInt(monat.slice(0, 4), 10), m = parseInt(monat.slice(5, 7), 10);
    return '<div class="sp-wochenkopf">' +
        '<button class="iconbtn" data-action="mo-blaettern" data-schritt="-1" title="Voriger Monat">◀</button>' +
        '<div class="sp-wochentitel"><strong>' + MONATE[m - 1] + " " + jahr + "</strong></div>" +
        '<button class="iconbtn" data-action="mo-blaettern" data-schritt="1" title="Nächster Monat">▶</button>' +
        (monat !== heute.slice(0, 7) ? '<button class="btn small" data-action="mo-blaettern" data-schritt="0">Heute</button>' : "") +
        '<div class="grow"></div>' + ansichtTabs +
      "</div>" +
      '<div class="table-wrap"><table class="mo-tabelle"><thead><tr>' + kopf + "</tr></thead><tbody>" + zeilen + "</tbody></table></div>";
  }

  function monatBlaettern(schritt) {
    const n = parseInt(schritt, 10) || 0;
    if (n === 0) { state.stundenplanMonat = ""; state.stundenplanWoche = ""; }
    else {
      const p = angezeigterMonat().split("-");
      const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + n, 15);
      state.stundenplanMonat = Store.datumLokal(d).slice(0, 7);
    }
    render();
  }
  // Tipp auf einen Tag: in dessen Woche springen
  function monatTag(datum) {
    state.stundenplanWoche = Calc.montagVon(datum);
    state.stundenplanMonat = "";
    state.stundenplanAnsicht = "woche";
    render();
  }
  function ansichtWechseln(ansicht) {
    state.stundenplanAnsicht = ansicht === "monat" ? "monat" : "woche";
    state.stundenplanMonat = "";
    render();
  }

  // =========================================================================
  //  TERMIN-DIALOG
  // =========================================================================
  // termin: vorhandener Datensatz oder null; vorgabe: { datum, blockId, klasseId }
  async function terminDialog(termin, vorgabe) {
    const isNew = !termin;
    const t = termin || Store.neuerTermin(Object.assign({ art: "sonstiges", datum: Store.datumLokal() }, vorgabe || {}));
    const klassen = (await Store.Klassen.all()).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
    const bloecke = state.settings.stundenzeiten;
    const body =
      UI.field("Art", "art", t.art, { type: "select",
        options: Store.TERMIN_ARTEN.map((a) => ({ value: a.id, label: a.icon + " " + a.label })) }) +
      UI.field("Titel", "titel", t.titel, { placeholder: "z. B. 2. Klassenarbeit (leer = Art)" }) +
      '<div class="form-row">' +
        UI.field("Datum", "datum", t.datum, { type: "date" }) +
        '<div class="field nur-ferien"><label for="f-bis">bis</label><input type="date" name="bis" id="f-bis" value="' + UI.esc(t.bis || t.datum) + '"></div>' +
      "</div>" +
      '<div class="form-row ohne-ferien">' +
        UI.field("Stunde", "blockId", t.blockId || "", { type: "select", options: [{ value: "", label: "ganztägig" }]
          .concat(bloecke.map((b) => ({ value: b.id, label: (b.art === "stunde" ? b.nr + ". Stunde" : b.name) + " (" + b.start + "–" + b.ende + ")" }))) }) +
        UI.field("Klasse", "klasseId", t.klasseId || "", { type: "select", options: [{ value: "", label: "– keine –" }]
          .concat(klassen.map((k) => ({ value: k.id, label: k.name || "(ohne Namen)" }))) }) +
      "</div>" +
      UI.field("Notiz", "notiz", t.notiz, { type: "textarea", placeholder: "optional" });
    const buttons = [{ label: "Abbrechen" }];
    if (!isNew) buttons.push({ label: "Löschen", className: "danger", onClick: async (close) => {
      if (!await UI.confirmDialog("Termin löschen?", "„" + terminText(t, klassenMap(klassen)) + "“ wird gelöscht.")) return;
      await Store.Termine.remove(t.id);
      close(); render();
    }});
    buttons.push({ label: "Speichern", className: "primary", onClick: async (close, box) => {
      const v = UI.formValues(box);
      if (!v.datum) { UI.toast("Bitte ein Datum wählen"); return; }
      const ferien = v.art === "ferien";
      if (ferien && v.bis && v.bis < v.datum) { UI.toast("„bis“ liegt vor dem Beginn"); return; }
      Object.assign(t, {
        art: v.art, titel: v.titel.trim(), datum: v.datum, notiz: v.notiz,
        bis: ferien ? (v.bis || v.datum) : null,
        blockId: ferien ? null : (v.blockId || null),
        klasseId: ferien ? null : (v.klasseId || null)
      });
      await Store.Termine.save(t);
      close(); render();
      UI.toast(isNew ? "Termin angelegt" : "Termin gespeichert");
    }});
    UI.modal({
      title: isNew ? "Neuer Termin" : "Termin bearbeiten", bodyHTML: body, buttons,
      onMount: (box) => {
        const art = box.querySelector('[name="art"]');
        const zeigen = () => {
          const ferien = art.value === "ferien";
          UI.$all(".nur-ferien", box).forEach((x) => { x.style.display = ferien ? "" : "none"; });
          UI.$all(".ohne-ferien", box).forEach((x) => { x.style.display = ferien ? "none" : ""; });
        };
        art.addEventListener("change", zeigen);
        zeigen();
      }
    });
  }

  async function terminBearbeiten(id) {
    const t = await Store.Termine.get(id);
    if (t) terminDialog(t);
  }
  // „＋ Termin“: Datum = heute, wenn in der angezeigten Woche, sonst deren Montag
  function terminNeu() {
    const montag = angezeigterMontag();
    const heute = Store.datumLokal();
    const datum = state.stundenplanAnsicht === "monat"
      ? (heute.slice(0, 7) === angezeigterMonat() ? heute : angezeigterMonat() + "-01")
      : (Calc.montagVon(heute) === montag ? heute : montag);
    terminDialog(null, { datum });
  }

  // =========================================================================
  //  ZELLEN-MENÜ (Wochenansicht)
  // =========================================================================
  async function tagesPlanLaden(datum) {
    const [versionen, termine] = await Promise.all([Store.Stundenplan.alle(), Store.Termine.alle()]);
    return Calc.tagesPlan(versionen, state.settings.abWochen, termine, datum);
  }

  async function zellenMenue(datum, blockId) {
    const [plan, klassenListe] = await Promise.all([tagesPlanLaden(datum), Store.Klassen.all()]);
    const klassen = klassenMap(klassenListe);
    const items = plan.zellen[blockId] || [];
    const aktionen = [];   // { gruppe, label, klasse, fn }
    items.forEach((item) => {
      if (item.typ === "termin") {
        aktionen.push({ gruppe: terminText(item.termin, klassen), label: "Termin bearbeiten", fn: () => terminDialog(item.termin) });
        return;
      }
      const k = item.klasseId ? klassen[item.klasseId] : null;
      if (item.klasseId && !k) return;
      const a = item.aenderung;
      const name = k ? k.name || "(ohne Namen)" : item.titel;
      // Überschrift mit Zustand – nach einem Tausch stehen zwei Stunden in der Zelle
      const gruppe = name + (a && a.aenderung === "ausfall" ? " – fällt aus"
        : a && a.aenderung === "verschoben" ? " – verschoben auf " + tagKurz(a.nachDatum) + " " + blockName(a.nachBlockId, true)
        : item.verschobenVon ? " – von " + tagKurz(item.verschobenVon.datum) + " " + blockName(item.verschobenVon.blockId, true) : "");
      if (k) aktionen.push({ gruppe, label: "Klasse öffnen", klasse: "primary", fn: () => go("klasse", { klasseId: k.id, tab: "schueler" }) });
      if (a && (a.aenderung === "ausfall" || a.aenderung === "verschoben")) {
        aktionen.push({ gruppe, label: a.aenderung === "ausfall" ? "Ausfall aufheben" : "Verschiebung aufheben",
          fn: async () => { await Store.Termine.verschiebungAufheben(a); render(); } });
      } else {
        aktionen.push({ gruppe, label: "Fällt aus …", fn: () => textDialog("Stunde fällt aus", name + " · " + tagKurz(datum) + " " + blockName(blockId, true),
          "Grund (optional)", "", async (text) => { await Store.Termine.aenderungSetzen(item, datum, blockId, "ausfall", text); render(); }) });
        aktionen.push({ gruppe, label: "Verschieben …", fn: () => verschiebenDialog(item, datum, blockId, name) });
        if (item.verschobenVon) aktionen.push({ gruppe, label: "Zurück an den alten Platz",
          fn: async () => { await Store.Termine.verschiebungAufheben(item.verschobenVon); render(); } });
      }
      const rec = item.verschobenVon || a;
      aktionen.push({ gruppe, label: rec && rec.notiz ? "Hinweis ändern …" : "Hinweis …", fn: () => textDialog("Hinweis zur Stunde",
        name + " · " + tagKurz(datum) + " " + blockName(blockId, true), "z. B. Raum 204, Material mitbringen", (rec && rec.notiz) || "",
        async (text) => {
          // Leerer Hinweis ohne weitere Änderung: Datensatz entfernen
          if (!text && a && a.aenderung === "hinweis") await Store.Termine.remove(a.id);
          else if (text || rec) await Store.Termine.aenderungSetzen(item, datum, blockId, "hinweis", text);
          render();
        }) });
    });
    aktionen.push({ gruppe: "", label: "＋ Termin in dieser Stunde", fn: () => terminDialog(null, { datum, blockId }) });

    let gruppe = null;
    const html = aktionen.map((x, i) => {
      const kopf = x.gruppe !== gruppe ? (gruppe = x.gruppe, x.gruppe ? "<h4>" + UI.esc(x.gruppe) + "</h4>" : "<hr>") : "";
      return kopf + '<button class="btn menue-knopf ' + (x.klasse || "") + '" data-i="' + i + '">' + UI.esc(x.label) + "</button>";
    }).join("");
    const m = UI.modal({
      title: tagKurz(datum) + " · " + blockName(blockId) + (plan.frei ? " · 🌴 " + (plan.frei.titel || "frei") : ""),
      bodyHTML: '<div class="menue">' + html + "</div>",
      buttons: [{ label: "Schließen" }]
    });
    UI.$all("[data-i]", m.box).forEach((b) => b.addEventListener("click", () => {
      m.close();
      Promise.resolve(aktionen[parseInt(b.getAttribute("data-i"), 10)].fn()).catch(UI.fehlerMelden);
    }));
  }

  // Einfacher Text-Dialog (Ausfall-Grund, Hinweis)
  function textDialog(titel, unterzeile, platzhalter, wert, speichern) {
    UI.modal({
      title: titel,
      bodyHTML: '<p class="muted">' + UI.esc(unterzeile) + "</p>" + UI.field("Text", "text", wert, { placeholder: platzhalter }),
      buttons: [
        { label: "Abbrechen" },
        { label: "Speichern", className: "primary", onClick: async (close, box) => {
          const text = box.querySelector('[name="text"]').value.trim();
          close();
          await speichern(text);
        }}
      ]
    });
  }

  // Stunde auf ein anderes Datum / eine andere Stunde verschieben; liegt dort
  // schon Unterricht, tauschen die Stunden die Plätze.
  function verschiebenDialog(item, datum, blockId, name) {
    const stunden = state.settings.stundenzeiten.filter((b) => b.art === "stunde");
    UI.modal({
      title: "Stunde verschieben",
      bodyHTML: '<p class="muted">' + UI.esc(name) + " · " + tagKurz(datum) + " " + UI.esc(blockName(blockId, true)) + "</p>" +
        '<div class="form-row">' +
          UI.field("Neues Datum", "ziel", datum, { type: "date" }) +
          UI.field("Stunde", "block", blockId, { type: "select", options: stunden.map((b) => ({ value: b.id, label: b.nr + ". Stunde (" + b.start + "–" + b.ende + ")" })) }) +
        "</div>" +
        '<p class="hint">Liegt dort schon eine Stunde, tauschen beide die Plätze.</p>',
      buttons: [
        { label: "Abbrechen" },
        { label: "Verschieben", className: "primary", onClick: async (close, box) => {
          const ziel = box.querySelector('[name="ziel"]').value;
          const zielBlock = box.querySelector('[name="block"]').value;
          if (!ziel) { UI.toast("Bitte ein Datum wählen"); return; }
          if (ziel === datum && zielBlock === blockId) { close(); return; }
          const [zielPlan, klassenListe] = await Promise.all([tagesPlanLaden(ziel), Store.Klassen.all()]);
          const klassen = klassenMap(klassenListe);
          const dort = Calc.stundenFinden(zielPlan, zielBlock);
          const namen = dort.map((z) => (z.klasseId && klassen[z.klasseId] ? klassen[z.klasseId].name : z.titel)).join(", ");
          const hinweise = [];
          if (dort.length) hinweise.push("Dort liegt schon " + namen + " – die Stunden tauschen die Plätze.");
          if (zielPlan.frei) hinweise.push("Der Tag ist als „" + (zielPlan.frei.titel || "frei") + "“ eingetragen.");
          if (hinweise.length && !await UI.confirmDialog("Verschieben?", hinweise.join(" "), { okLabel: "Verschieben", danger: false })) return;
          close();
          await Store.Termine.verschieben(item, datum, blockId, ziel, zielBlock, dort);
          render();
          UI.toast(name + " → " + tagKurz(ziel) + " " + blockName(zielBlock, true) + (dort.length ? " (getauscht mit " + namen + ")" : ""));
        }}
      ]
    });
  }

  Object.assign(global.Views, {
    monatHTML, monatBlaettern, monatTag, ansichtWechseln,
    terminDialog, terminBearbeiten, terminNeu, zellenMenue
  });
})(window);
