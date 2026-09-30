/* =========================================================================
   views.stundenplan.js – Stundenplan auf der Startseite
   - Wochenraster Mo–Fr × Stundenzeiten; Pausenzeilen nur mit Eintrag
     (im Bearbeiten-Modus alle), heute und laufende Stunde hervorgehoben
   - Wochen blättern, A/B-Woche anzeigen und umstellen
   - Bearbeiten: Zelle antippen -> Klasse oder Freitext, jede Woche oder A/B
   - Versionen: „Neuer Stundenplan ab …“, ältere Pläne im Archiv (nur lesbar)
   - Notiz je Woche (Wochenende / ToDos)
   Die Rechnungen (Wochen, A/B, Versionen) liegen in calc.stundenplan.js.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, go, render, homeUmschalterHTML } = global.Views;
  const TAGE = ["Mo", "Di", "Mi", "Do", "Fr"];

  // Dezente Farbe je Fach (gleiches Fach = gleiche Farbe)
  function fachFarbe(fach) {
    const s = String(fach || "").toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return "hsl(" + h + ", 55%, 90%)";
  }
  function tagMonat(datum) {
    return datum.slice(8, 10) + "." + datum.slice(5, 7) + ".";
  }
  function datumLang(datum) {
    return tagMonat(datum) + datum.slice(0, 4);
  }

  // Montag der angezeigten Woche ("" = aktuelle Woche)
  function angezeigterMontag() {
    return state.stundenplanWoche || Calc.montagVon(Store.datumLokal());
  }

  // Block, der gerade läuft (Stunde oder Pause), sonst null
  function laufenderBlockId(bloecke) {
    const d = new Date(Store.now());
    const min = d.getHours() * 60 + d.getMinutes();
    const b = bloecke.find((x) => min >= Store.hhmmZuMinuten(x.start) && min < Store.hhmmZuMinuten(x.ende));
    return b ? b.id : null;
  }

  // =========================================================================
  //  ANSICHT
  // =========================================================================
  async function ViewStundenplan() {
    const s = state.settings;
    const [versionen, klassenListe] = await Promise.all([Store.Stundenplan.alle(), Store.Klassen.all()]);
    const klassen = {};
    klassenListe.forEach((k) => { klassen[k.id] = k; });
    const heute = Store.datumLokal();
    const montag = angezeigterMontag();
    const version = Calc.versionFuer(versionen, montag);
    const archiv = !!(version && Calc.versionArchiviert(versionen, version, heute));
    const bearbeiten = !!(state.stundenplanBearbeiten && version && !archiv);
    const woche = Calc.abWoche(s.abWochen, montag);
    const eintraege = bearbeiten ? (version.eintraege || []) : Calc.eintraegeDerWoche(version, woche);

    // Zeilen: alle Stunden; Pausen nur mit Eintrag (beim Bearbeiten alle)
    const genutzt = {};
    eintraege.forEach((e) => { genutzt[e.blockId] = true; });
    const bloecke = s.stundenzeiten.filter((b) => b.art === "stunde" || bearbeiten || genutzt[b.id]);
    const laufend = montag === Calc.montagVon(heute) ? laufenderBlockId(s.stundenzeiten) : null;
    const heuteTag = montag === Calc.montagVon(heute) ? ((new Date().getDay() + 6) % 7) + 1 : 0;

    const kopf = "<tr><th></th>" + TAGE.map((t, i) => {
      const datum = Calc.datumPlusTage(montag, i);
      return '<th class="' + (i + 1 === heuteTag ? "heute" : "") + '">' + t + ' <span class="muted">' + tagMonat(datum) + "</span></th>";
    }).join("") + "</tr>";

    const zeilen = bloecke.map((b) => {
      const label = b.art === "stunde"
        ? "<strong>" + b.nr + ".</strong>"
        : "<strong>" + UI.esc(b.name) + "</strong>";
      const zellen = TAGE.map((t, i) => {
        const tag = i + 1;
        const inhalt = Calc.eintraegeDerZelle(eintraege, tag, b.id).map((e) => eintragHTML(e, klassen, bearbeiten)).join("");
        const klick = bearbeiten || inhalt.indexOf("data-klasse") !== -1;
        return '<td class="sp-zelle' + (tag === heuteTag ? " heute" : "") + (b.id === laufend && tag === heuteTag ? " jetzt" : "") +
          (bearbeiten ? " bearbeiten" : "") + '"' +
          (klick ? ' data-action="sp-zelle" data-tag="' + tag + '" data-block="' + UI.esc(b.id) + '"' : "") + ">" +
          inhalt + "</td>";
      }).join("");
      return '<tr class="' + (b.art === "stunde" ? "" : "pause") + '"><th class="sp-zeit">' + label +
        '<span class="muted">' + b.start + "–" + b.ende + "</span></th>" + zellen + "</tr>";
    }).join("");

    const kw = Calc.kalenderwoche(montag);
    const wochenKopf =
      '<div class="sp-wochenkopf">' +
        '<button class="iconbtn" data-action="sp-woche" data-schritt="-1" title="Vorige Woche">◀</button>' +
        '<div class="sp-wochentitel"><strong>KW ' + kw + "</strong> · " + tagMonat(montag) + "–" +
          datumLang(Calc.datumPlusTage(montag, 4)) +
          (woche ? ' · <button class="btn small" data-action="sp-ab" title="A/B-Woche umstellen">' + woche + "-Woche</button>" : "") +
        "</div>" +
        '<button class="iconbtn" data-action="sp-woche" data-schritt="1" title="Nächste Woche">▶</button>' +
        (montag !== Calc.montagVon(heute) ? '<button class="btn small" data-action="sp-woche" data-schritt="0">Heute</button>' : "") +
      "</div>";

    let hinweis = "";
    if (!version) {
      hinweis = '<div class="hint-box">Für diese Woche gibt es noch keinen Stundenplan.</div>';
    } else if (archiv) {
      const bis = Calc.versionBis(versionen, version);
      hinweis = '<div class="hint-box"><strong>Archiv:</strong> Dieser Stundenplan galt ' +
        (version.gueltigAb ? "vom " + datumLang(version.gueltigAb) + " " : "") + (bis ? "bis " + datumLang(bis) : "") +
        " und lässt sich nur noch ansehen.</div>";
    } else if (bearbeiten) {
      hinweis = '<div class="hint-box"><strong>Bearbeiten:</strong> Zelle antippen, um eine Klasse oder einen Freitext ' +
        "(z. B. Aufsicht) einzutragen. " +
        (version.gueltigAb ? "Dieser Plan gilt ab " + datumLang(version.gueltigAb) + ". " : "") +
        "Für einen Wechsel (z. B. zum Halbjahr) „Neuer Stundenplan ab …“ wählen – der bisherige bleibt dann im Archiv.</div>";
    }

    const notiz = await Store.Wochennotizen.get(montag);
    const body = hinweis + wochenKopf +
      '<div class="sp-layout">' +
        '<div class="table-wrap sp-wrap"><table class="sp-tabelle' + (bearbeiten ? " bearbeiten" : "") + '"><thead>' + kopf + "</thead><tbody>" +
          zeilen + "</tbody></table></div>" +
        '<div class="card sp-notiz"><h3>Wochenende &amp; ToDos</h3>' +
          '<textarea id="sp-notiz" placeholder="Notizen für diese Woche …">' + UI.esc(notiz) + "</textarea>" +
          '<div class="hint">Gehört zur KW ' + kw + ", wird automatisch gespeichert.</div></div>" +
      "</div>" +
      '<p class="home-info"><a href="info.html">Was ist Noten-Fritze? · Anleitung · Datenschutz</a></p>';

    const topbar =
      '<div class="title-wrap"><h1 class="main">Noten-Fritze</h1><span class="sub">Stundenplan</span></div>' +
      homeUmschalterHTML("stundenplan") +
      '<div class="grow"></div>' +
      '<button class="iconbtn" data-action="settings" title="Einstellungen">⚙️</button>' +
      '<button class="btn" data-action="sp-archiv">🗂 Pläne</button>' +
      (version && !archiv
        ? '<button class="btn' + (bearbeiten ? " primary" : "") + '" data-action="sp-bearbeiten">' + (bearbeiten ? "✓ Fertig" : "✏️ Bearbeiten") + "</button>"
        : "");

    return { topbar, body, mount: () => {
      const feld = UI.$("#sp-notiz");
      if (feld) feld.addEventListener("change", async () => {
        await Store.Wochennotizen.save(montag, feld.value);
        UI.toast("Notiz gespeichert");
      });
    }};
  }

  function eintragHTML(e, klassen, bearbeiten) {
    const ab = bearbeiten && e.woche !== "alle" ? '<span class="sp-ab">' + e.woche + "</span>" : "";
    if (e.klasseId) {
      const k = klassen[e.klasseId];
      if (!k) return "";
      return '<div class="sp-eintrag" data-klasse="' + UI.esc(k.id) + '" style="background:' + fachFarbe(k.fach) + '">' + ab +
        '<span class="nm">' + UI.esc(k.name || "(ohne Namen)") + "</span>" +
        (k.fach ? '<span class="fach">' + UI.esc(k.fach) + "</span>" : "") + "</div>";
    }
    return '<div class="sp-eintrag frei">' + ab + '<span class="nm">' + UI.esc(e.titel || "") + "</span></div>";
  }

  // =========================================================================
  //  AKTIONEN
  // =========================================================================
  async function stundenplanEinrichten() {
    const versionen = await Store.Stundenplan.alle();
    if (!versionen.length) await Store.Stundenplan.neu(null);
    await ansichtSetzen("stundenplan");
    state.stundenplanWoche = "";
    state.stundenplanBearbeiten = true;
    render();
  }

  // Startseite: Klassen oder Stundenplan (wird gemerkt)
  async function ansichtSetzen(ansicht) {
    const s = await Store.getSettings();
    s.startAnsicht = ansicht === "stundenplan" ? "stundenplan" : "klassen";
    await Store.saveSettings(s);
    if (ansicht !== "stundenplan") state.stundenplanBearbeiten = false;
  }

  function wocheBlaettern(schritt) {
    const n = parseInt(schritt, 10) || 0;
    state.stundenplanWoche = n === 0 ? "" : Calc.datumPlusTage(angezeigterMontag(), 7 * n);
    render();
  }

  // Ansicht: Klasse öffnen. Bearbeiten: Zelle belegen.
  async function stundenplanZelle(el) {
    if (!state.stundenplanBearbeiten) {
      const k = el.querySelector("[data-klasse]");
      if (k) go("klasse", { klasseId: k.getAttribute("data-klasse"), tab: "schueler" });
      return;
    }
    const versionen = await Store.Stundenplan.alle();
    const version = Calc.versionFuer(versionen, angezeigterMontag());
    if (!version) return;
    zelleDialog(version, parseInt(el.getAttribute("data-tag"), 10), el.getAttribute("data-block"));
  }

  // Dialog einer Zelle: jede Woche ein Eintrag oder A/B getrennt; Eintrag =
  // Klasse (optional mit Raum) oder Freitext.
  async function zelleDialog(version, tag, blockId) {
    const s = state.settings;
    const block = s.stundenzeiten.find((b) => b.id === blockId);
    if (!block) return;
    const klassen = (await Store.Klassen.all()).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
    const raeume = {};
    for (const k of klassen) {
      const alle = await Store.Sitzplan.alle(k.id);
      if (alle.plaene.length > 1) raeume[k.id] = alle.plaene;
    }
    const vorhanden = Calc.eintraegeDerZelle(version.eintraege, tag, blockId);
    const abModus = vorhanden.some((e) => e.woche !== "alle");
    const stunden = s.stundenzeiten.filter((b) => b.art === "stunde");
    const folge = block.art === "stunde" ? stunden[stunden.indexOf(block) + 1] : null;

    const optionen = '<option value="">– frei –</option>' +
      klassen.map((k) => '<option value="k:' + UI.esc(k.id) + '">' + UI.esc(k.name || "(ohne Namen)") +
        (k.fach ? " · " + UI.esc(k.fach) : "") + "</option>").join("") +
      '<option value="t">Freitext (z. B. Aufsicht, AG) …</option>';
    const slotHTML = (slot, label) => {
      const e = vorhanden.find((x) => x.woche === slot) || null;
      const wert = e ? (e.klasseId ? "k:" + e.klasseId : "t") : "";
      return '<div class="sp-slot" data-slot="' + slot + '">' +
        (label ? "<h4>" + label + "</h4>" : "") +
        '<select data-feld="was">' + optionen.replace('value="' + UI.esc(wert) + '"', 'value="' + UI.esc(wert) + '" selected') + "</select>" +
        '<input type="text" data-feld="titel" placeholder="z. B. Pausenaufsicht Hof" value="' + UI.esc(e && !e.klasseId ? e.titel : "") + '">' +
        '<select data-feld="raum" data-vorwahl="' + UI.esc((e && e.sitzplanId) || "") + '"></select>' +
      "</div>";
    };
    const bodyHTML =
      '<div class="seg sp-modus"><button type="button" data-modus="alle"' + (abModus ? "" : ' class="active"') + ">Jede Woche</button>" +
        '<button type="button" data-modus="ab"' + (abModus ? ' class="active"' : "") + ">A/B unterschiedlich</button></div>" +
      '<div class="sp-slots" data-modus="alle">' + slotHTML("alle", "") + "</div>" +
      '<div class="sp-slots" data-modus="ab">' + slotHTML("A", "A-Woche") + slotHTML("B", "B-Woche") + "</div>" +
      (folge ? '<div class="field"><label class="hstack"><input type="checkbox" id="sp-doppel" style="width:auto;min-height:auto"> Auch die ' +
        folge.nr + ". Stunde (Doppelstunde)</label></div>" : "");

    const titel = TAGE[tag - 1] + " · " + (block.art === "stunde" ? block.nr + ". Stunde" : block.name) +
      " (" + block.start + "–" + block.ende + ")";
    UI.modal({
      title: titel, bodyHTML,
      buttons: [
        { label: "Abbrechen" },
        { label: "Leeren", onClick: async (close) => {
          close();
          await Store.Stundenplan.zelleSetzen(version, tag, blockId, []);
          render();
        }},
        { label: "Speichern", className: "primary", onClick: async (close, box) => {
          const ab = box.querySelector(".sp-modus .active").getAttribute("data-modus") === "ab";
          const slots = ab ? ["A", "B"] : ["alle"];
          const liste = [];
          for (const slot of slots) {
            const el = box.querySelector('.sp-slot[data-slot="' + slot + '"]');
            const was = el.querySelector('[data-feld="was"]').value;
            if (!was) continue;
            if (was === "t") {
              const t = el.querySelector('[data-feld="titel"]').value.trim();
              if (!t) { UI.toast("Bitte einen Text eingeben"); return; }
              liste.push({ woche: slot, titel: t });
            } else {
              const raum = el.querySelector('[data-feld="raum"]');
              liste.push({ woche: slot, klasseId: was.slice(2), sitzplanId: (raum && raum.value) || null });
            }
          }
          const doppel = box.querySelector("#sp-doppel");
          close();
          await Store.Stundenplan.zelleSetzen(version, tag, blockId, liste);
          if (doppel && doppel.checked) await Store.Stundenplan.zelleSetzen(version, tag, folge.id, liste);
          if (ab && liste.length && !Calc.abWoche(s.abWochen, angezeigterMontag())) await abWocheDialog(true);
          render();
        }}
      ],
      onMount: (box) => {
        const zeigen = () => {
          const modus = box.querySelector(".sp-modus .active").getAttribute("data-modus");
          UI.$all(".sp-slots", box).forEach((x) => { x.style.display = x.getAttribute("data-modus") === modus ? "" : "none"; });
          UI.$all(".sp-slot", box).forEach((slot) => {
            const was = slot.querySelector('[data-feld="was"]').value;
            const titelFeld = slot.querySelector('[data-feld="titel"]');
            titelFeld.style.display = was === "t" ? "" : "none";
            const raum = slot.querySelector('[data-feld="raum"]');
            const plaene = was.indexOf("k:") === 0 ? raeume[was.slice(2)] : null;
            if (!plaene) { raum.style.display = "none"; raum.innerHTML = ""; return; }
            const vorwahl = raum.value || raum.getAttribute("data-vorwahl");
            raum.innerHTML = '<option value="">Raum: zuletzt benutzter</option>' + plaene.map((p) =>
              '<option value="' + UI.esc(p.id) + '"' + (p.id === vorwahl ? " selected" : "") + ">Raum: " + UI.esc(p.name) + "</option>").join("");
            raum.style.display = "";
          });
        };
        UI.$all(".sp-modus button", box).forEach((btn) => btn.addEventListener("click", () => {
          UI.$all(".sp-modus button", box).forEach((x) => x.classList.toggle("active", x === btn));
          zeigen();
        }));
        UI.$all('[data-feld="was"]', box).forEach((sel) => sel.addEventListener("change", zeigen));
        zeigen();
      }
    });
  }

  // A/B-Woche der angezeigten Woche festlegen; ab dort wechseln die Wochen ab.
  function abWocheDialog(ersteinrichtung) {
    const montag = angezeigterMontag();
    const aktuell = Calc.abWoche(state.settings.abWochen, montag);
    return new Promise((resolve) => {
      const setzen = (woche) => async (close) => {
        close();
        const s = await Store.getSettings();
        s.abWochen = Calc.abWocheSetzen(s.abWochen, montag, woche);
        await Store.saveSettings(s);
        UI.toast("KW " + Calc.kalenderwoche(montag) + " ist eine " + woche + "-Woche – ab hier wechseln die Wochen ab");
        resolve(woche);
      };
      UI.modal({
        title: ersteinrichtung ? "A/B-Wochen einrichten" : "A/B-Woche umstellen",
        bodyHTML: "<p>Ist die Woche vom " + datumLang(montag) + " (KW " + Calc.kalenderwoche(montag) + ") eine A- oder B-Woche?</p>" +
          '<p class="muted">Ab dieser Woche wechseln A und B jede Woche. Frühere Wochen bleiben, wie sie waren.</p>',
        onClose: () => resolve(null),
        buttons: [
          { label: "Abbrechen", onClick: (close) => { close(); resolve(null); } },
          { label: "A-Woche", className: aktuell === "A" ? "primary" : "", onClick: setzen("A") },
          { label: "B-Woche", className: aktuell === "B" ? "primary" : "", onClick: setzen("B") }
        ]
      });
    });
  }
  async function abWocheUmstellen() {
    if (await abWocheDialog(false)) render();
  }

  // Übersicht der Pläne: aktuell, geplant, Archiv; neuer Plan ab einem Montag.
  async function plaeneDialog() {
    const versionen = await Store.Stundenplan.alle();
    const heute = Store.datumLokal();
    const aktuell = Calc.versionFuer(versionen, heute);
    const zeilen = versionen.slice().reverse().map((v) => {
      const bis = Calc.versionBis(versionen, v);
      const status = aktuell && v.id === aktuell.id ? "aktuell"
        : Calc.versionArchiviert(versionen, v, heute) ? "Archiv" : "geplant";
      const zeitraum = (v.gueltigAb ? "ab " + datumLang(v.gueltigAb) : "von Anfang an") + (bis ? " bis " + datumLang(bis) : "");
      return '<div class="undo-zeile">' +
        '<span class="chip' + (status === "aktuell" ? " accent" : "") + '">' + status + "</span>" +
        '<span class="nm">' + zeitraum + ' <span class="muted">· ' + (v.eintraege || []).length + " Einträge</span></span>" +
        '<button class="btn small" data-zeigen="' + UI.esc(v.id) + '">Anzeigen</button>' +
        (status !== "Archiv" && versionen.length > 1 ? '<button class="iconbtn plain danger-text" data-weg="' + UI.esc(v.id) + '" title="Plan löschen">🗑</button>' : "") +
      "</div>";
    }).join("");
    const vorschlag = Calc.datumPlusTage(Calc.montagVon(heute), 7);
    const m = UI.modal({
      title: "Stundenpläne",
      bodyHTML: '<div class="undo-liste">' + (zeilen || '<p class="muted">Noch kein Stundenplan.</p>') + "</div>" +
        "<h4>Neuer Stundenplan ab …</h4>" +
        '<p class="muted">Z. B. zum Halbjahreswechsel: Der neue Plan startet als Kopie und gilt ab der Woche des gewählten Tages. ' +
        "Der bisherige bleibt für die Wochen davor erhalten und wandert ins Archiv, sobald der neue gilt.</p>" +
        '<div class="form-row" style="align-items:center"><input type="date" id="sp-neu-ab" value="' + vorschlag + '" style="max-width:200px">' +
        '<button class="btn primary" id="sp-neu-btn">Anlegen</button></div>',
      buttons: [{ label: "Schließen" }]
    });
    const box = m.box;
    const zeigen = (v) => {
      m.close();
      state.stundenplanWoche = v.gueltigAb || Calc.montagVon(Calc.datumPlusTage(Calc.versionBis(versionen, v) || heute, 0));
      state.stundenplanBearbeiten = false;
      render();
    };
    UI.$all("[data-zeigen]", box).forEach((b) => b.addEventListener("click", () =>
      zeigen(versionen.find((v) => v.id === b.getAttribute("data-zeigen")))));
    UI.$all("[data-weg]", box).forEach((b) => b.addEventListener("click", async () => {
      const v = versionen.find((x) => x.id === b.getAttribute("data-weg"));
      const ok = await UI.confirmDialog("Stundenplan löschen?",
        "Der Plan " + (v.gueltigAb ? "ab " + datumLang(v.gueltigAb) : "von Anfang an") + " wird gelöscht. " +
        "Für seine Wochen gilt dann der vorherige Plan.");
      if (!ok) return;
      // Der erste Plan gilt „von Anfang an“ – das übernimmt dann der nächste
      if (!v.gueltigAb) {
        const naechster = versionen.find((x) => x.id !== v.id);
        naechster.gueltigAb = null;
        await Store.Stundenplan.save(naechster);
      }
      await Store.Stundenplan.remove(v.id);
      m.close();
      render();
    }));
    box.querySelector("#sp-neu-btn").addEventListener("click", async () => {
      const wert = box.querySelector("#sp-neu-ab").value;
      if (!wert) { UI.toast("Bitte ein Datum wählen"); return; }
      const ab = Calc.montagVon(wert);
      if (versionen.some((v) => v.gueltigAb === ab)) { UI.toast("Ab dieser Woche gibt es schon einen Plan"); return; }
      await Store.Stundenplan.neu(ab, Calc.versionFuer(versionen, ab));
      m.close();
      state.stundenplanWoche = ab;
      state.stundenplanBearbeiten = true;
      render();
      UI.toast("Neuer Stundenplan ab " + datumLang(ab) + " angelegt");
    });
  }

  Object.assign(global.Views, {
    ViewStundenplan, stundenplanEinrichten, ansichtSetzen, wocheBlaettern,
    stundenplanZelle, abWocheUmstellen, plaeneDialog
  });
})(window);
