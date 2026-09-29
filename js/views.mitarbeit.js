/* =========================================================================
   views.mitarbeit.js – Mitarbeits-Auswertung (Reiter „Mitarbeit“)
   - TabAuswertung: Vorschläge nach dem Stundennoten-Modell je Quartal
   - Dialoge: Notenschwellen der Klasse, Herleitung eines Vorschlags,
     Quartal abschließen (überträgt die Mitarbeitsnoten, sperrt das Quartal)
   ========================================================================= */
(function (global) {
  "use strict";

  const {
    state, render, quartalFilter, quartalTabsHTML, schwellenFelderHTML, schwellenAusFormular,
    notenBadge, nameHTML
  } = global.Views;
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
    const katIds = kats.filter(Calc.istMitarbeitsKategorie).map((c) => c.id);
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
        "<td>" + nameHTML(s) + "</td>" +
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
        '<td class="num">' + notenBadge(eingetragen, mss) + "</td>" +
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

  // ---- Notenschwellen der Klasse -------------------------------------------
  // Eigene Schwellen überschreiben die globale Einstellung; ausgeschaltet
  // rechnet die Klasse wieder mit den Werten aus den Einstellungen.
  function schwellenDialog(k) {
    const eigene = !!(Array.isArray(k.mitarbeitSchwellen) && k.mitarbeitSchwellen.length);
    const werte = eigene ? k.mitarbeitSchwellen : state.settings.mitarbeitSchwellen;
    const body =
      '<p class="muted">Die Punkte einer einzelnen Stunde werden über diese Schwellen in eine Stundennote übersetzt; die Mitarbeitsnote ist der Ø aller Stundennoten.</p>' +
      '<div class="field"><label class="hstack"><input type="checkbox" id="schwellen-eigene" style="width:auto;min-height:auto"' +
        (eigene ? " checked" : "") + "> Eigene Schwellen für diese Klasse verwenden</label>" +
        '<div class="hint">Aus = globale Einstellung. Beim Einschalten werden die globalen Werte als Startpunkt übernommen.</div></div>' +
      '<div id="schwellen-felder">' + schwellenFelderHTML(werte) + "</div>";
    UI.modal({
      title: "Notenschwellen · " + k.name,
      bodyHTML: body,
      onMount: (box) => {
        const cb = box.querySelector("#schwellen-eigene");
        const felder = box.querySelector("#schwellen-felder");
        const sync = () => {
          felder.style.opacity = cb.checked ? "1" : ".45";
          UI.$all("[data-schwelle]", felder).forEach((inp) => { inp.disabled = !cb.checked; });
        };
        cb.addEventListener("change", sync);
        sync();
      },
      buttons: [
        { label: "Abbrechen" },
        { label: "Speichern", className: "primary", onClick: async (close, box) => {
          const eigeneJetzt = box.querySelector("#schwellen-eigene").checked;
          const liste = eigeneJetzt ? schwellenAusFormular(box) : null;
          if (eigeneJetzt && !liste.length) { UI.toast("Bitte mindestens eine Schwelle angeben"); return; }
          k.mitarbeitSchwellen = liste;
          await Store.Klassen.save(k);
          close(); render();
          UI.toast(eigeneJetzt ? "Eigene Schwellen gespeichert" : "Globale Schwellen aktiv");
        }}
      ]
    });
  }

  // ---- Herleitung des Mitarbeits-Vorschlags --------------------------------
  // Macht sichtbar, wie aus den Stundennoten der Vorschlag (deren Ø) wird.
  async function mitarbeitHerleitungDialog(sid) {
    const k = await Store.Klassen.get(state.klasseId);
    const ktx = await auswertungKontext(k);
    const s = ktx.schueler.find((x) => x.id === sid);
    const a = ktx.ausw[sid];
    if (!s || !a) return;

    // Verteilung der Stundennoten; Verweigerungs-Stunden separat ausgewiesen
    const zaehlung = {};
    let verweigerungsStunden = 0;
    (a.stundenNoten || []).forEach((sn) => {
      if (sn.verweigerung) { verweigerungsStunden += 1; return; }
      zaehlung[sn.note] = (zaehlung[sn.note] || 0) + 1;
    });
    const stundennotenZeilen = (
      Object.keys(zaehlung).sort((x, y) => x - y).map((note) =>
        '<div class="line"><span>Note ' + note + '</span><span class="r">' + zaehlung[note] + "×</span></div>"
      ).join("") +
      (verweigerungsStunden
        ? '<div class="line"><span>Note 6 (Leistungsverweigerung)</span><span class="r">' + verweigerungsStunden + "×</span></div>"
        : "")
    ) || '<div class="line"><span class="muted">Keine Stunden im Zeitraum</span><span class="r">–</span></div>';

    const ereignisZeilen = Store.EVENT_TYPES.filter((t) => a.typen[t.id]).map((t) => {
      const anzahl = a.typen[t.id];
      const wert = state.settings.mitarbeitPunkte[t.id] || 0;
      return '<div class="line"><span>' + UI.esc(t.label) + ' <span class="muted">(' + anzahl + " × " +
        (wert > 0 ? "+" : "") + wert + ")</span></span>" +
        '<span class="r">' + (anzahl * wert > 0 ? "+" : "") + (anzahl * wert) + "</span></div>";
    }).join("") || '<div class="line"><span class="muted">Keine Ereignisse im Zeitraum</span><span class="r">0</span></div>';

    const haHinweis = state.settings.haModus === "note6"
      ? "Vergessene Hausaufgaben geben keine Punkte; je drei kommt eine zusätzliche Stundennote 6 in diesen Ø."
      : "Vergessene Hausaufgaben zählen als Minuspunkte in ihrer Stunde.";

    const body =
      '<div class="breakdown">' +
        '<div class="grp"><h3>Stundennoten</h3>' + stundennotenZeilen +
          '<div class="line"><span>Gezählte Stunden (anwesend)<span class="muted"> · Doppelstunde = 2</span></span><span class="r">' + a.stundenGezaehlt + "</span></div>" +
          '<div class="line"><span class="muted">davon mit Ereignis</span><span class="r muted">' + a.stundenMitEreignis + "</span></div>" +
        "</div>" +
        '<div class="grp"><h3>Erfasste Ereignisse</h3>' + ereignisZeilen + "</div>" +
        // In der Oberstufe zusätzlich der Weg zur Punktzahl: gerundete Note ->
        // offizielle Umrechnungstabelle -> MSS-Punkte (so wird auch vorbelegt).
        (Calc.istMSS(k) && a.notenvorschlag !== null && a.notenvorschlag !== undefined
          ? '<div class="grp"><h3>Umrechnung in MSS-Punkte</h3>' +
            '<div class="line"><span>Ø der Stundennoten</span><span class="r">' + Calc.formatNote(a.notenvorschlag, 1) + "</span></div>" +
            '<div class="line"><span>gerundete Note</span><span class="r">' +
              Calc.formatTendenz(Calc.tendenznote(a.notenvorschlag, false), false) + "</span></div>" +
            '<div class="line"><span class="muted">offizielle Tabelle (17 − Note × 3)</span><span class="r muted">→</span></div></div>' +
            '<div class="total"><span>Vorschlag in Punkten</span><span>' +
              Calc.noteZuMssPunkte(Calc.tendenznote(a.notenvorschlag, false)) + "</span></div>"
          : '<div class="total"><span>Ø der Stundennoten</span><span>' + Calc.formatNote(a.notenvorschlag, 1) + "</span></div>") +
      "</div>" +
      '<p class="muted">Nur ein Vorschlag – ' + haHinweis +
        " Tage mit gemeldeter Abwesenheit sind herausgerechnet.</p>";

    UI.modal({ title: "Mitarbeit · " + UI.vollerName(s), bodyHTML: body, buttons: [{ label: "Schließen", className: "primary" }] });
  }

  // ---- Quartal abschließen -------------------------------------------------
  // Überträgt die Mitarbeits-Vorschläge des im Auswertungs-Tab gewählten
  // Quartals als Noten in eine Ziel-Kategorie und markiert das Quartal an der
  // Klasse als abgeschlossen. Stunden und Ereignisse bleiben erhalten (der
  // Mitarbeit-Tab zeigt sie dann grau); der Abschluss ist dort aufhebbar.
  async function quartalAbschliessenDialog() {
    const q = quartalFilter("auswertungQuartal");
    if (q === null) { UI.toast("Bitte oben ein Quartal wählen"); return; }
    const k = await Store.Klassen.get(state.klasseId);
    if (!k) return;
    const mss = Calc.istMSS(k);
    // Schon übertragene Mitarbeitsnoten dieses Quartals haben Vorrang vor dem
    // Vorschlag, damit ein zweiter Abschluss eine korrigierte Note nicht
    // versehentlich mit dem Rohwert überschreibt.
    const [ktx, kategorien, bereitsUebertragen] = await Promise.all([
      auswertungKontext(k), Store.Kategorien.byKlasse(k.id), mitarbeitNotenVonQuartal(k, q)
    ]);
    const schuelerListe = ktx.schueler;
    const schonNoten = Object.keys(bereitsUebertragen).length;

    // Ziel-Kategorien: sonstige Leistungen mit Noten-Anzeige; "" = neu anlegen
    const ziele = kategorien.filter((c) => c.art === "sonstige" && Calc.istNotenKategorie(c));
    const vorgabe = ziele.find((c) => (c.name || "").trim().toLowerCase() === "mündliche mitarbeit");
    const katSelect =
      '<div class="field"><label for="qa-kategorie">Ziel-Kategorie für die übertragenen Noten</label>' +
      '<select id="qa-kategorie">' +
        '<option value="">„Mündliche Mitarbeit“ neu anlegen (Gewichtung 2)</option>' +
        ziele.map((c) => '<option value="' + c.id + '"' + (vorgabe && c.id === vorgabe.id ? " selected" : "") + ">" +
          UI.esc(c.name) + "</option>").join("") +
      "</select>" +
      (ziele.length ? "" : '<div class="hint">Es gibt noch keine sonstige Noten-Kategorie – „Mündliche Mitarbeit“ (Gewichtung 2) wird neu angelegt.</div>') +
      "</div>";

    const zeilen = schuelerListe.map((s) => {
      const a = ktx.ausw[s.id];
      const vorschlag = a ? a.notenvorschlag : null;
      const hatV = vorschlag !== null && vorschlag !== undefined;
      const schon = bereitsUebertragen[s.id];
      // Vorbelegung: bereits übertragene Note > umgerechneter Vorschlag.
      // In der Oberstufe läuft der Vorschlag über die offizielle Umrechnung
      // Note -> MSS-Punkte (Calc.noteZuMssPunkte).
      const ausVorschlag = !hatV ? "" : (mss
        ? String(Calc.noteZuMssPunkte(Calc.tendenznote(vorschlag, false)))
        : Calc.formatTendenz(Calc.tendenznote(vorschlag, false), false));
      const vorbelegt = schon !== undefined ? Calc.formatTendenz(schon, mss) : ausVorschlag;
      return "<tr>" +
        "<td>" + nameHTML(s) + "</td>" +
        '<td class="num">' + (hatV
          ? '<span class="note-badge" style="background:' + Calc.noteFarbe(vorschlag) + '">' + Calc.formatNote(vorschlag, 1) + "</span>"
          : "–") + "</td>" +
        // Vorgeschlagen wird eine echte Note (2+, 3, 4-), nicht der rohe Ø –
        // sonst stünde in der Notenübersicht eine Dezimalzahl wie „2,8".
        '<td><input data-sid="' + s.id + '" inputmode="' + (mss ? "numeric" : "text") + '" style="width:90px" value="' +
          UI.esc(vorbelegt) + '" placeholder="' + (mss ? "0–15" : "–") + '"></td>' +
      "</tr>";
    }).join("");

    const body =
      '<p class="muted">' + (mss
        ? "MSS-Punkte (0–15) für das " + q + ". Quartal. Vorbelegt ist der Stundennoten-Ø, " +
          "über die offizielle Tabelle in Punkte umgerechnet (2 = 11, 3+ = 9, 4- = 4 …)."
        : "Mitarbeits-Vorschläge des " + q + ". Quartals als Noten übertragen. Vorbelegt ist der auf " +
          "eine Note gerundete Ø (2+, 3, 4-); die Spalte „Vorschlag“ zeigt den genauen Wert.") +
        " Leer lassen = kein Übertrag für diese/n Schüler/in.</p>" +
      (schonNoten
        ? '<p class="hint">Für dieses Quartal sind bereits ' + schonNoten + " Noten übertragen – " +
          "die Felder sind mit diesen Noten vorbelegt, nicht mit dem Vorschlag.</p>"
        : "") +
      katSelect +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th class="num">' + (mss ? "Stundennoten-Ø" : "Vorschlag") + '</th><th>' +
        (mss ? "Punkte" : "Note") + "</th></tr></thead>" +
      "<tbody>" + zeilen + "</tbody></table></div>";

    // Aktuell eingetragene Werte der Eingabefelder einsammeln
    function eingetraegeneWerte(box) {
      return UI.$all("input[data-sid]", box).map((inp) => ({
        schuelerId: inp.getAttribute("data-sid"), wert: inp.value.trim()
      })).filter((e) => e.wert !== "");
    }

    UI.modal({
      title: q + ". Quartal abschließen · " + k.name,
      bodyHTML: body,
      buttons: [
        { label: "Abbrechen" },
        { label: "CSV: Noten", onClick: async (close, box) => {
          const eintraege = eingetraegeneWerte(box);
          if (!eintraege.length) { UI.toast("Keine Noten eingetragen"); return; }
          CSV.exportQuartalNoten(k, schuelerListe, eintraege, q); // bleibt offen
        }},
        { label: "CSV: Ereignisse", onClick: async () => {
          const alle = await Store.Ereignisse.byKlasse(k.id);
          CSV.exportEreignisse(k, schuelerListe, alle.filter((e) => e.quartal === q)); // bleibt offen
        }},
        { label: "Übertragen & abschließen", className: "danger", onClick: async (close, box) => {
          const felder = eingetraegeneWerte(box);
          let ungueltig = null;
          const eintraege = [];
          felder.forEach((f) => {
            const wert = Calc.parseNote(f.wert, mss);
            if (wert === null) ungueltig = f.schuelerId;
            else eintraege.push({ schuelerId: f.schuelerId, wert });
          });
          if (ungueltig) {
            const s = schuelerListe.find((x) => x.id === ungueltig);
            UI.toast("Ungültige Note bei " + (s ? UI.vollerName(s) : "einem Eintrag"));
            return; // Abbruch ohne Änderung
          }
          const kategorieWahl = box.querySelector("#qa-kategorie").value;
          const ok = await UI.confirmDialog("Quartal wirklich abschließen?",
            "Die eingetragenen Noten werden übertragen. Das " + q + ". Quartal wird danach gesperrt: " +
            "Stunden und Meldungen bleiben zur Ansicht erhalten, es lässt sich aber nichts mehr erfassen. " +
            "Aufheben kannst du das jederzeit im Reiter Mitarbeit.",
            { okLabel: "Übertragen & abschließen", danger: false });
          if (!ok) return;
          close();

          // Ziel-Kategorie: gewählte oder neu angelegte „Mündliche Mitarbeit“.
          // Sie wird als Mitarbeits-Kategorie markiert – daran erkennt die
          // Notenübersicht, dass die Epochalnote eines Quartals erst mit dieser
          // Note zustande kommt.
          let kategorieId = kategorieWahl;
          if (!kategorieId) {
            const kat = Store.neueKategorie(k.id, {
              name: "Mündliche Mitarbeit", art: "sonstige", gewichtung: 2,
              anzeige: "note", quelle: "mitarbeit", sortIndex: kategorien.length
            });
            await Store.Kategorien.save(kat);
            kategorieId = kat.id;
          } else {
            const kat = kategorien.find((c) => c.id === kategorieId);
            if (kat && kat.quelle !== "mitarbeit") {
              kat.quelle = "mitarbeit";
              await Store.Kategorien.save(kat);
            }
          }
          // Alle übertragenen Noten landen in einer gemeinsamen Spalte des Quartals
          const leistung = await Store.leistungFuer(k.id, kategorieId, q,
            "Mitarbeit " + q + ". Quartal", Store.datumLokal());
          for (const e of eintraege) {
            await Store.Noten.setzeZelle(leistung, e.schuelerId, e.wert);
          }
          // Stunden und Ereignisse bleiben stehen – das Quartal wird nur als
          // abgeschlossen vermerkt und dadurch im Mitarbeit-Tab gesperrt.
          await Store.quartalAbschliessen(k, q, Store.datumLokal());
          UI.toast(eintraege.length + " Noten übertragen – Quartal abgeschlossen");
          render();
        }}
      ]
    });
  }


  Object.assign(global.Views, { TabAuswertung, auswertungKontext, mitarbeitNotenVonQuartal, schwellenDialog, mitarbeitHerleitungDialog, quartalAbschliessenDialog });
})(window);
