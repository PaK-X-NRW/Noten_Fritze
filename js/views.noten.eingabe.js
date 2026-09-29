/* =========================================================================
   views.noten.eingabe.js – Eingabe in der Notentabelle
   - Excel-artige Inline-Eingabe mit Nummernpad (iPad: keine Bildschirmtastatur)
   - Scroll-Spielraum rechts, Spalten per Ziehen am Kopf umsortieren
     (Pointer-Events, weil iPad-Safari kein HTML5-Drag&Drop kennt)
   mountNotenTabelle wird nach jedem Render des Reiters „Noten“ aufgerufen.
   ========================================================================= */
(function (global) {
  "use strict";

  const { state, render, notenKontext, notenZeilenInhalt } = global.Views;

  // Renderkontext der aktuellen Tabelle (siehe TabNoten in views.noten.js);
  // wird bei jedem mountNotenTabelle neu geholt.
  let notenKtx = null;
  // ---- Noten: Scroll-Spielraum, Inline-Eingabe, Spalten ziehen -------------
  function mountNotenTabelle(k) {
    const wrap = UI.$(".noten-wrap");
    const table = wrap && UI.$(".noten-tab", wrap);
    notenKtx = notenKontext();
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


  Object.assign(global.Views, { mountNotenTabelle });
})(window);
