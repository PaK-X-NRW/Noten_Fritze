/* =========================================================================
   views.einstellungen.js – Einstellungen inkl. Stundenplan-Verwaltung
   ========================================================================= */
(function (global) {
  "use strict";

  const { state } = global.Views;

  // ---- Stundenplan (Einstellungen) ------------------------------------------
  // Flacher Plan: genau 10 Stunden, die jeden Schultag gleich gelten.
  function stundenplanHTML(s) {
    const plan = Array.isArray(s.stundenplan) ? s.stundenplan : [];
    const zellen = plan.map((h, i) =>
      '<div class="sp-stunde">' +
        '<span class="muted">' + (i + 1) + ".</span>" +
        '<input type="time" lang="de-DE" data-sp-idx="' + i + '" data-sp-feld="start" value="' + UI.esc(h.start || "") + '">' +
        '<input type="time" lang="de-DE" data-sp-idx="' + i + '" data-sp-feld="ende" value="' + UI.esc(h.ende || "") + '">' +
      "</div>"
    ).join("");
    return '<div class="sp-grid">' + zellen + "</div>";
  }

  // ---- Notenschwellen (global und je Klasse gleiches Markup) ----------------
  // Eine Zeile je Note 1–5: ab wie vielen Punkten in einer einzelnen Stunde
  // diese Stundennote vergeben wird. Darunter bleibt 6.
  function schwellenFelderHTML(schwellen) {
    const map = {};
    (schwellen || []).forEach((s) => { map[s.note] = s.abPunkte; });
    const zeilen = [1, 2, 3, 4, 5].map((note) =>
      '<div class="form-row" style="align-items:center">' +
        '<div class="grow"><strong>Note ' + note + "</strong></div>" +
        '<span class="muted">ab</span>' +
        '<input type="number" step="0.1" inputmode="decimal" style="width:110px" data-schwelle="' + note + '" value="' +
          (map[note] != null ? map[note] : "") + '">' +
        '<span class="muted">Punkten in der Stunde</span>' +
      "</div>"
    ).join("");
    return zeilen + '<div class="hint">Die Punkte einer Stunde werden über diese Schwellen in eine Stundennote übersetzt; die Mitarbeitsnote ist der Ø aller Stundennoten. Wer unter der letzten Schwelle liegt, bekommt eine 6.</div>';
  }

  // Liest die Schwellen-Felder eines Containers aus und normalisiert sie.
  function schwellenAusFormular(root) {
    const liste = [];
    UI.$all("[data-schwelle]", root).forEach((inp) => {
      const wert = String(inp.value).trim();
      if (wert === "") return;
      liste.push({ note: parseInt(inp.getAttribute("data-schwelle"), 10), abPunkte: wert });
    });
    return Store.schwellenNormalisieren(liste);
  }

  // =========================================================================
  //  EINSTELLUNGEN
  // =========================================================================
  async function ViewEinstellungen() {
    const s = state.settings;
    // Gewählter Export-Ordner (File System Access API) – nur Name lesen,
    // keine Berechtigungsabfrage beim Anzeigen.
    const ordnerApi = !!window.showDirectoryPicker;
    const ordnerHandle = ordnerApi ? await CSV.exportOrdner() : null;
    const punkte = Store.EVENT_TYPES.map((t) =>
      '<div class="form-row" style="align-items:center">' +
        '<div class="grow"><strong>' + UI.esc(t.label) + "</strong></div>" +
        '<input type="number" inputmode="numeric" style="width:110px" data-punkt="' + t.id + '" value="' + s.mitarbeitPunkte[t.id] + '">' +
      "</div>"
    ).join("");

    const heatpunkte = [
      ["einfach", "Wortmeldung", s.heatPunkteEinfach],
      ["gut", "Gute Meldung", s.heatPunkteGut],
      ["sehrgut", "Sehr gute Meldung", s.heatPunkteSehrGut]
    ].map(([key, label, value]) =>
      '<div class="form-row" style="align-items:center">' +
        '<div class="grow"><strong>' + UI.esc(label) + "</strong></div>" +
        '<input type="number" inputmode="numeric" style="width:110px" data-heat-punkt="' + key + '" value="' + value + '">' +
      "</div>"
    ).join("");

    const topbar =
      '<button class="iconbtn plain" data-action="home" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Einstellungen</h1></div>';

    const body =
      '<div class="card"><h2>Notenberechnung</h2>' +
        UI.field("Aktuelles Quartal", "aktuellesQuartal", s.aktuellesQuartal, { type: "select", options: [
          { value: "1", label: "1. Quartal" },
          { value: "2", label: "2. Quartal" },
          { value: "3", label: "3. Quartal" },
          { value: "4", label: "4. Quartal" }
        ], hint: "Neue Noten, Stunden und Mitarbeits-Ereignisse werden diesem Quartal zugeordnet." }) +
      "</div>" +
      '<div class="card"><h2>Darstellung</h2>' +
        UI.field("Reihenfolge der Schüler/innen", "schuelerSortierung", s.schuelerSortierung, { type: "select", options: [
          { value: "nachname", label: "Alphabetisch (Nachname)" },
          { value: "manuell", label: "Manuell (▲/▼ im Schüler-Tab)" }
        ], hint: "Gilt für alle Listen: Noten, Tracker, Sitzplan, Besprechung und CSV-Exporte. Die manuelle Reihenfolge bleibt gespeichert und ist jederzeit wieder abrufbar." }) +
      "</div>" +
      '<div class="card"><h2>Mitarbeit – Punkte je Ereignistyp</h2>' + punkte +
        UI.field("Vergessene Hausaufgaben werten", "haModus", s.haModus, { type: "select", options: [
          { value: "punkte", label: "Punkteabzug in der Mitarbeit" },
          { value: "note6", label: "Ab der 3. je eine Note 6 (Mündliche Mitarbeit)" }
        ], hint: "Bei „Note 6“ geben vergessene Hausaufgaben keine Punkte; je drei vergessene HA im Quartal kommt eine zusätzliche Stundennote 6 in den Notenvorschlag – eine eigene Notenspalte entsteht dabei nicht." }) +
      "</div>" +
      '<div class="card"><h2>Mitarbeit – Notenschwellen</h2>' +
        '<p class="muted">Übersetzt die Punkte einer einzelnen Stunde in eine Stundennote; der Vorschlag für die Mitarbeitsnote ist der Ø aller Stundennoten. Einzelne Klassen können eigene Schwellen bekommen (Klasse → Auswertung → Schwellen), z. B. weil eine Biologiestunde andere Mitarbeit ermöglicht als eine Deutschstunde.</p>' +
        '<div id="schwellen-global">' + schwellenFelderHTML(s.mitarbeitSchwellen) + "</div>" +
      "</div>" +
      '<div class="card"><h2>Heatmap</h2>' + heatpunkte +
        '<div class="field" style="margin-top:14px">' + UI.field("Default-Wert für neue / zurückgesetzte Heatmap", "heatStartWert", s.heatStartWert, { type: "number", inputmode: "numeric", hint: "Wertebereich: 0 bis 100" }) + "</div>" +
        '<div class="form-row" style="align-items:center">' +
          '<div class="grow"><strong>Y Heatmap-Punkte verfallen pro X Minuten</strong><div class="hint">Bezogen auf eine 45-Minuten-Stunde; der Tracker skaliert auf die tatsächliche Stundendauer.</div></div>' +
          '<input type="number" inputmode="numeric" style="width:110px" id="f-heatVerfallPunkte" value="' + s.heatVerfallPunkte + '">' +
          '<input type="number" inputmode="numeric" style="width:110px" id="f-heatVerfallMinuten" value="' + s.heatVerfallMinuten + '" placeholder="X Minuten">' +
        "</div>" +
      "</div>" +
      '<div class="card"><h2>Stundenplan</h2>' +
        '<p class="muted">Gilt für jeden Schultag gleich. Der Tracker erkennt damit die laufende Stunde und ihre Restzeit.</p>' +
        stundenplanHTML(s) +
      "</div>" +
      '<div class="card"><h2>Export-Ordner</h2>' +
        '<p class="muted">Exporte (CSV/JSON) direkt in einen Ordner auf diesem Gerät speichern. ' +
        'Funktioniert in Chrome/Edge; auf dem iPad läuft der Export stattdessen über das Teilen-Blatt („In Dateien sichern“).</p>' +
        (!ordnerApi
          ? '<p class="hint">Auf diesem Gerät/Browser nicht verfügbar – Exporte laufen über das Teilen-Blatt oder den Downloads-Ordner.</p>'
          : '<p class="hint">' + (ordnerHandle
              ? "Gewählter Ordner: <strong>" + UI.esc(ordnerHandle.name) + "</strong>"
              : "Kein Ordner gewählt.") + "</p>" +
            '<div class="btn-row">' +
              '<button class="btn" data-action="export-ordner-waehlen">Ordner wählen</button>' +
              (ordnerHandle ? '<button class="btn" data-action="export-ordner-vergessen">Entfernen</button>' : "") +
            "</div>") +
      "</div>" +
      '<div class="card"><h2>Datensicherung</h2><p class="muted">Alle Daten bleiben lokal im Browser. Sicherung als JSON-Datei empfohlen.</p>' +
        '<div class="btn-row">' +
          '<button class="btn" data-action="backup-export">Backup exportieren (JSON)</button>' +
          '<button class="btn" data-action="backup-import">Backup importieren</button>' +
          '<button class="btn" data-action="reset-demo">Demo-Daten neu laden</button>' +
          '<button class="btn danger" data-action="delete-all">Alle Daten löschen</button>' +
        "</div>" +
      "</div>" +
      '<div class="card"><h2>Beispielklassen</h2>' +
        '<p class="muted">Zwei Klassen mit einem komplett durchgespielten Schuljahr zum Ausprobieren: ' +
        '„9a (Musterjahr)“ mit Schulnoten und „Mathematik LK 12“ mit MSS-Punkten. ' +
        "In beiden sind das 1.–3. Quartal abgeschlossen, das 4. Quartal läuft noch. " +
        "Deine eigenen Klassen bleiben unverändert; löschen kannst du die Beispiele jederzeit auf der Startseite.</p>" +
        '<div class="btn-row">' +
          '<button class="btn" data-action="seed-beispielklassen">Beispielklassen anlegen</button>' +
        "</div>" +
      "</div>" +
      '<div class="card"><h2>Hilfe &amp; Rechtliches</h2>' +
        '<p class="muted">Anleitung, Funktionsübersicht, Datenschutzerklärung, Kontakt und Lizenz findest du auf der Infoseite.</p>' +
        '<p class="hint">Noten sind personenbezogene Schülerdaten: Für die Nutzung auf einem privaten Gerät ist in der Regel ' +
          "eine Genehmigung der Schulleitung nötig (Einzelheiten regelt jedes Bundesland). Die Daten liegen nur auf diesem Gerät – " +
          "exportiere deshalb regelmäßig ein Backup.</p>" +
        '<div class="btn-row"><a class="btn" href="info.html">Infoseite öffnen</a></div>' +
      "</div>" +
      '<div class="card"><h2>Über</h2><p class="muted">Noten-Fritze · Version ' + APP_VERSION +
        " · lokale PWA · keine Cloud, keine Konten.</p>" +
        '<p class="hint">DB-Schema ' + DB.DB_VERSION + " · Daten-Version " + Store.SCHEMA_VERSION + ".</p></div>";

    return { topbar, body, mount: () => {
      const selSort = UI.$("#f-schuelerSortierung");
      if (selSort) selSort.addEventListener("change", async () => {
        s.schuelerSortierung = selSort.value === "manuell" ? "manuell" : "nachname";
        await Store.saveSettings(s); UI.toast("Gespeichert");
      });
      const selQ = UI.$("#f-aktuellesQuartal");
      if (selQ) selQ.addEventListener("change", async () => {
        s.aktuellesQuartal = parseInt(selQ.value, 10) || 1;
        await Store.saveSettings(s);
        // Filter-Defaults neu ziehen (Notenübersicht folgt dem Halbjahr)
        state.notenHalbjahr = ""; state.auswertungQuartal = "";
        UI.toast("Quartal gespeichert");
      });
      const selHa = UI.$("#f-haModus");
      if (selHa) selHa.addEventListener("change", async () => {
        s.haModus = selHa.value === "note6" ? "note6" : "punkte";
        await Store.saveSettings(s); UI.toast("Gespeichert");
      });
      UI.$all("[data-heat-punkt]").forEach((inp) => inp.addEventListener("change", async () => {
        const key = inp.getAttribute("data-heat-punkt");
        if (key === "einfach") s.heatPunkteEinfach = Math.max(0, parseInt(inp.value, 10) || 0);
        else if (key === "gut") s.heatPunkteGut = Math.max(0, parseInt(inp.value, 10) || 0);
        else if (key === "sehrgut") s.heatPunkteSehrGut = Math.max(0, parseInt(inp.value, 10) || 0);
        await Store.saveSettings(s); UI.toast("Heatmap-Punkte gespeichert");
      }));
      const heatStart = UI.$("#f-heatStartWert");
      if (heatStart) heatStart.addEventListener("change", async () => {
        s.heatStartWert = Math.max(0, Math.min(100, parseInt(heatStart.value, 10) || 0));
        await Store.saveSettings(s);
        UI.toast("Startwert gespeichert");
      });
      const heatVerfallPunkte = UI.$("#f-heatVerfallPunkte");
      if (heatVerfallPunkte) heatVerfallPunkte.addEventListener("change", async () => { s.heatVerfallPunkte = Math.max(0, parseInt(heatVerfallPunkte.value, 10) || 0); await Store.saveSettings(s); });
      const heatVerfallMinuten = UI.$("#f-heatVerfallMinuten");
      if (heatVerfallMinuten) heatVerfallMinuten.addEventListener("change", async () => { s.heatVerfallMinuten = Math.max(1, parseInt(heatVerfallMinuten.value, 10) || 5); await Store.saveSettings(s); });
      UI.$all("[data-punkt]").forEach((inp) => inp.addEventListener("change", async () => {
        s.mitarbeitPunkte[inp.getAttribute("data-punkt")] = parseInt(inp.value, 10) || 0;
        await Store.saveSettings(s); UI.toast("Punkte gespeichert");
      }));
      const schwellenBox = UI.$("#schwellen-global");
      if (schwellenBox) UI.$all("[data-schwelle]", schwellenBox).forEach((inp) => inp.addEventListener("change", async () => {
        const liste = schwellenAusFormular(schwellenBox);
        if (!liste.length) { UI.toast("Mindestens eine Schwelle angeben"); return; }
        s.mitarbeitSchwellen = liste;
        await Store.saveSettings(s); UI.toast("Notenschwellen gespeichert");
      }));
      UI.$all("[data-sp-feld]").forEach((inp) => inp.addEventListener("change", async () => {
        const idx = parseInt(inp.getAttribute("data-sp-idx"), 10);
        const stunde = Array.isArray(s.stundenplan) && s.stundenplan[idx];
        if (!stunde) return;
        stunde[inp.getAttribute("data-sp-feld")] = inp.value;
        await Store.saveSettings(s); UI.toast("Stundenplan gespeichert");
      }));
    }};
  }

  Object.assign(global.Views, { ViewEinstellungen, schwellenFelderHTML, schwellenAusFormular });
})(window);
