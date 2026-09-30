/* =========================================================================
   views.kalender.js – Kalender zum Stundenplan
   - Monatsansicht (Mo–So, Ferien als Band, Termine; Tipp -> Woche)
   - Termin-Dialog: Art (Store.TERMIN_ARTEN), Titel, Datum (Ferien: von–bis),
     Stunde oder ganztägig, Klasse
   - Menü einer Zelle der Wochenansicht: Klasse öffnen, fällt aus, verschieben
     (auf eine belegte Stunde = Plätze tauschen), Hinweis, Termin anlegen
   - Ausfall mit Weiterschieben der folgenden Planungen (in die nächste
     Doppel-/Einzelstunde oder stundenweise), Aufheben mit Zurückrücken,
     „Ich bin krank“ für einen Zeitraum (alle Klassen)
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
          fn: async () => {
            if (a.aenderung === "ausfall") await ausfallAufheben(a);
            else await Store.Termine.verschiebungAufheben(a);
            render();
          } });
      } else {
        aktionen.push({ gruppe, label: "Fällt aus …", fn: () => ausfallDialog(item, datum, blockId, name) });
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

  // ---- Ausfall mit Weiterschieben ---------------------------------------------------
  async function kalenderDaten() {
    const [versionen, termine] = await Promise.all([Store.Stundenplan.alle(), Store.Termine.alle()]);
    return { versionen, termine, abWochen: state.settings.abWochen, zeiten: state.settings.stundenzeiten };
  }
  // Bis wohin weitergeschoben wird: letzte Planung der Klasse + 60 Tage Luft
  // (die letzte geplante Stunde braucht einen freien Platz dahinter).
  async function schiebeBis(klasseId, von) {
    const letzte = (await Store.Planungen.byKlasse(klasseId)).reduce((m, p) => (p.datum > m ? p.datum : m), "");
    return letzte && letzte >= von ? Calc.datumPlusTage(letzte, 60) : null;
  }
  // Züge aller betroffenen Klassen (vorher/nachher = Termine ohne/mit den Ausfällen)
  async function schiebeZuege(k, klassenIds, von, vorher, nachher, modus) {
    let zuege = [];
    for (const id of klassenIds) {
      const bis = await schiebeBis(id, von);
      if (bis) zuege = zuege.concat(Calc.weiterschiebenZuege(k.versionen, k.abWochen, vorher, nachher, k.zeiten, id, von, bis, modus));
    }
    return zuege;
  }
  function ersetzt(termine, datensaetze) {
    const ids = datensaetze.map((d) => d.id);
    return termine.filter((t) => ids.indexOf(t.id) === -1).concat(datensaetze);
  }
  // Auswahl „Weiterschieben“ (Häkchen + Art); groesse = Stunden der Einheit
  function schiebeAuswahlHTML(groesse) {
    const art = groesse > 1 ? "Doppelstunde" : "Einzelstunde";
    return '<div class="field"><label class="hstack"><input type="checkbox" id="af-schieben" checked style="width:auto;min-height:auto">' +
        " Folgende Planungen weiterschieben</label></div>" +
      '<div class="seg af-modus"><button type="button" class="active" data-modus="einheit">In die nächste ' + art + "</button>" +
        '<button type="button" data-modus="stunde">Stundenweise</button></div>' +
      '<p class="hint af-erklaerung"></p>';
  }
  function schiebeAuswahlMount(box, groesse) {
    const knoepfe = UI.$all(".af-modus button", box);
    const erkl = box.querySelector(".af-erklaerung");
    const art = groesse > 1 ? "Doppelstunden" : "Einzelstunden";
    const zeigen = () => {
      const an = box.querySelector("#af-schieben").checked;
      box.querySelector(".af-modus").style.display = an ? "" : "none";
      const modus = (knoepfe.find((b) => b.classList.contains("active")) || knoepfe[0]).getAttribute("data-modus");
      erkl.textContent = !an ? "Die Planung bleibt an der ausgefallenen Stunde stehen."
        : modus === "einheit" ? "Die Fahrpläne der " + art + " rücken jeweils in die nächste " + art.slice(0, -1) + " weiter; andere Stunden bleiben, wie sie sind."
        : "Alle folgenden Fahrpläne rücken Stunde für Stunde weiter (eine Doppelstunde kann dabei auseinandergehen).";
    };
    knoepfe.forEach((b) => b.addEventListener("click", () => { knoepfe.forEach((x) => x.classList.toggle("active", x === b)); zeigen(); }));
    box.querySelector("#af-schieben").addEventListener("change", zeigen);
    zeigen();
    return () => box.querySelector("#af-schieben").checked
      ? (knoepfe.find((b) => b.classList.contains("active")) || knoepfe[0]).getAttribute("data-modus") : null;
  }

  // Eine Stunde (bei Doppelstunde wahlweise beide) fällt aus
  async function ausfallDialog(item, datum, blockId, name) {
    const k = await kalenderDaten();
    const plan = Calc.tagesPlan(k.versionen, k.abWochen, k.termine, datum);
    const einheit = item.klasseId ? Calc.einheitBestimmen(plan, k.zeiten, item.klasseId, blockId) : [];
    const doppel = einheit.length > 1;
    UI.modal({
      title: "Stunde fällt aus",
      bodyHTML: '<p class="muted">' + UI.esc(name) + " · " + tagKurz(datum) + " " + UI.esc(blockName(blockId, true)) + "</p>" +
        UI.field("Grund (optional)", "grund", "", { placeholder: "z. B. Wandertag, krank" }) +
        (doppel ? '<div class="field"><label class="hstack"><input type="checkbox" id="af-ganz" checked style="width:auto;min-height:auto"> Die ganze ' +
          (einheit.length === 2 ? "Doppelstunde" : einheit.length + "-fach-Stunde") + " (" + einheit.map((b) => b.nr + ".").join(" + ") + " Stunde)</label></div>" : "") +
        (item.klasseId && !item.verschobenVon ? schiebeAuswahlHTML(doppel ? einheit.length : 1) : ""),
      onMount: (box) => {
        box._modus = item.klasseId && !item.verschobenVon ? schiebeAuswahlMount(box, doppel ? einheit.length : 1) : () => null;
        const ganz = box.querySelector("#af-ganz");
        // Fällt nur eine Stunde einer Doppelstunde aus, passt nur „stundenweise“
        if (ganz) ganz.addEventListener("change", () => {
          const e = box.querySelector('.af-modus [data-modus="einheit"]');
          if (!e) return;
          e.style.display = ganz.checked ? "" : "none";
          if (!ganz.checked) box.querySelector('.af-modus [data-modus="stunde"]').click();
        });
      },
      buttons: [
        { label: "Abbrechen" },
        { label: "Fällt aus", className: "primary", onClick: async (close, box) => {
          const grund = box.querySelector('[name="grund"]').value.trim();
          const ganz = box.querySelector("#af-ganz");
          const modus = box._modus();
          close();
          const bloecke = ganz && ganz.checked ? einheit.map((b) => b.id) : [blockId];
          const eintraege = bloecke.map((id) => ({
            datum, blockId: id,
            item: id === blockId ? item : (plan.zellen[id] || []).find((i) => i.typ === "stunde" && i.klasseId === item.klasseId)
          })).filter((e) => e.item);
          const saetze = Store.Termine.ausfallDatensaetze(eintraege, grund, modus);
          const zuege = modus
            ? await schiebeZuege(k, [item.klasseId], datum, k.termine, ersetzt(k.termine, saetze), modus)
            : Store.Termine.zurueckZuege(eintraege);
          await Store.Termine.ausfaelleSchreiben(saetze, zuege);
          render();
          UI.toast((eintraege.length > 1 ? eintraege.length + " Stunden fallen aus" : "Stunde fällt aus") +
            (modus ? " – Planungen weitergeschoben" : ""));
        }}
      ]
    });
  }

  // Ausfall aufheben; wurden dabei Planungen weitergeschoben, nachfragen, ob sie
  // zurückrücken sollen. Ausfälle derselben Klasse am selben Tag, die gemeinsam
  // weitergeschoben wurden (Doppelstunde), werden zusammen aufgehoben.
  async function ausfallAufheben(a) {
    const k = await kalenderDaten();
    const gruppe = a.verschiebeModus && a.klasseId
      ? k.termine.filter((t) => t.art === "aenderung" && t.aenderung === "ausfall" && t.klasseId === a.klasseId &&
          t.datum === a.datum && t.verschiebeModus === a.verschiebeModus)
      : [a];
    let zuege = [];
    if (a.verschiebeModus && a.klasseId) {
      const zurueck = await new Promise((resolve) => UI.modal({
        title: "Ausfall aufheben",
        bodyHTML: "<p>Beim Ausfall wurden die folgenden Planungen weitergeschoben. Sollen sie wieder zurückrücken?</p>" +
          (gruppe.length > 1 ? '<p class="muted">Aufgehoben wird der Ausfall aller ' + gruppe.length + " Stunden dieses Tages.</p>" : ""),
        onClose: () => resolve(null),
        buttons: [
          { label: "Abbrechen", onClick: (close) => { close(); resolve(null); } },
          { label: "Nur aufheben", onClick: (close) => { resolve(false); close(); } },
          { label: "Zurückrücken", className: "primary", onClick: (close) => { resolve(true); close(); } }
        ]
      }));
      if (zurueck === null) return;
      if (zurueck) zuege = await schiebeZuege(k, [a.klasseId], a.datum, k.termine, k.termine.filter((t) => gruppe.indexOf(t) === -1), a.verschiebeModus);
    }
    await Store.Termine.ausfaelleAufheben(gruppe, zuege);
    UI.toast("Ausfall aufgehoben" + (zuege.length ? " – Planungen zurückgerückt" : ""));
  }

  // „Ich bin krank“: alle Stunden aller Klassen (auch AG, Aufsicht) von–bis
  // fallen aus; die Planungen jeder Klasse rücken entsprechend weiter.
  function krankDialog() {
    const heute = Store.datumLokal();
    UI.modal({
      title: "🤒 Ich bin krank",
      bodyHTML: '<p class="muted">Alle Stunden im Zeitraum werden als ausgefallen eingetragen – in allen Klassen, auch AGs und Aufsichten.</p>' +
        '<div class="form-row">' + UI.field("Von", "von", heute, { type: "date" }) + UI.field("Bis", "bis", heute, { type: "date" }) + "</div>" +
        UI.field("Grund", "grund", "krank") +
        schiebeAuswahlHTML(2).replace("In die nächste Doppelstunde", "Doppel-/Einzelstunden getrennt"),
      onMount: (box) => { box._modus = schiebeAuswahlMount(box, 2); box.querySelector(".af-erklaerung").textContent = ""; },
      buttons: [
        { label: "Abbrechen" },
        { label: "Eintragen", className: "primary", onClick: async (close, box) => {
          const von = box.querySelector('[name="von"]').value, bis = box.querySelector('[name="bis"]').value || von;
          if (!von || bis < von) { UI.toast("Bitte einen gültigen Zeitraum wählen"); return; }
          const grund = box.querySelector('[name="grund"]').value.trim();
          const modus = box._modus();
          const k = await kalenderDaten();
          const eintraege = [];
          for (let d = von; d <= bis; d = Calc.datumPlusTage(d, 1)) {
            const plan = Calc.tagesPlan(k.versionen, k.abWochen, k.termine, d);
            k.zeiten.forEach((b) => Calc.stundenFinden(plan, b.id).forEach((item) => eintraege.push({ item, datum: d, blockId: b.id })));
          }
          if (!eintraege.length) { UI.toast("In diesem Zeitraum liegen keine Stunden"); return; }
          const klassenIds = eintraege.map((e) => e.item.klasseId).filter((x, i, a) => x && a.indexOf(x) === i);
          if (!await UI.confirmDialog("Ausfall eintragen?", eintraege.length + " Stunden (" + klassenIds.length + (klassenIds.length === 1 ? " Klasse" : " Klassen") +
            (eintraege.length > eintraege.filter((e) => e.item.klasseId).length ? " und weitere Einträge wie Aufsichten" : "") +
            ") fallen vom " + tagKurz(von) + " bis " + tagKurz(bis) + " aus." + (modus ? " Die folgenden Planungen rücken weiter." : ""),
            { okLabel: "Eintragen", danger: false })) return;
          close();
          const saetze = Store.Termine.ausfallDatensaetze(eintraege, grund, modus);
          const zuege = modus
            ? await schiebeZuege(k, klassenIds, von, k.termine, ersetzt(k.termine, saetze), modus)
            : Store.Termine.zurueckZuege(eintraege);
          await Store.Termine.ausfaelleSchreiben(saetze, zuege);
          render();
          UI.toast(eintraege.length + " Stunden als ausgefallen eingetragen" + (modus ? ", Planungen weitergeschoben" : "") + " – gute Besserung!", { duration: 6000 });
        }}
      ]
    });
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
    terminDialog, terminBearbeiten, terminNeu, zellenMenue, krankDialog
  });
})(window);
