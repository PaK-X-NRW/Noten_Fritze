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

  // ---- Bauplan der einfachen Einstellungen ----------------------------------
  // Schlüssel = Pfad im Einstellungs-Objekt ("heatStartWert",
  // "mitarbeitPunkte.gut"). Ein Eingabefeld mit data-einstellung="<Schlüssel>"
  // wird beim Ändern nach diesen Regeln geprüft und gespeichert – eine neue
  // Einstellung braucht also nur einen Eintrag hier, einen Standardwert in
  // DEFAULT_SETTINGS und ein Feld (einstellungFeld / zahlZeile).
  //   art:     "zahl" (ganze Zahl) | "auswahl"
  //   min/max: Grenzen einer Zahl; ersatz: Wert bei ungültiger Eingabe (Standard 0)
  //   werte:   erlaubte Werte einer Auswahl, der erste ist der Standard
  //   meldung: Toast nach dem Speichern
  //   danach:  zusätzliche Wirkung nach dem Speichern
  const EINSTELLUNGEN = {
    aktuellesQuartal: { art: "zahl", min: 1, max: 4, ersatz: 1, meldung: "Quartal gespeichert",
      // Filter-Defaults neu ziehen (Notenübersicht folgt dem Halbjahr)
      danach: () => { state.notenHalbjahr = ""; state.auswertungQuartal = ""; } },
    schuelerSortierung: { art: "auswahl", werte: ["nachname", "manuell"], meldung: "Gespeichert" },
    haModus: { art: "auswahl", werte: ["punkte", "note6"], meldung: "Gespeichert" },
    heatStartWert: { art: "zahl", min: 0, max: 100, meldung: "Startwert gespeichert" },
    heatVerfallPunkte: { art: "zahl", min: 0, meldung: "Heatmap-Verfall gespeichert" },
    heatVerfallMinuten: { art: "zahl", min: 1, ersatz: 5, meldung: "Heatmap-Verfall gespeichert" }
  };
  // Je Ereignistyp: Mitarbeitspunkte, bei Meldungen zusätzlich Heatmap-Punkte
  Store.EVENT_TYPES.forEach((t) => {
    EINSTELLUNGEN["mitarbeitPunkte." + t.id] = { art: "zahl", meldung: "Punkte gespeichert" };
    if (t.heatSetting) EINSTELLUNGEN[t.heatSetting] = { art: "zahl", min: 0, meldung: "Heatmap-Punkte gespeichert" };
  });

  function wertLesen(s, pfad) {
    return pfad.split(".").reduce((o, teil) => (o == null ? o : o[teil]), s);
  }
  function wertSetzen(s, pfad, wert) {
    const teile = pfad.split(".");
    const letzter = teile.pop();
    const ziel = teile.reduce((o, teil) => (o[teil] = o[teil] || {}), s);
    ziel[letzter] = wert;
  }

  // Eingabe nach dem Bauplan in einen gültigen Wert übersetzen.
  function wertPruefen(regel, eingabe) {
    if (regel.art === "auswahl") {
      return regel.werte.indexOf(eingabe) !== -1 ? eingabe : regel.werte[0];
    }
    // Leer, ungültig oder 0 -> Ersatzwert (wie bisher: parseInt(...) || ersatz)
    let n = parseInt(eingabe, 10) || regel.ersatz || 0;
    if (regel.min !== undefined) n = Math.max(regel.min, n);
    if (regel.max !== undefined) n = Math.min(regel.max, n);
    return n;
  }

  async function einstellungSpeichern(s, feld) {
    const pfad = feld.getAttribute("data-einstellung");
    const regel = EINSTELLUNGEN[pfad];
    if (!regel) return;
    const wert = wertPruefen(regel, feld.value);
    wertSetzen(s, pfad, wert);
    await Store.saveSettings(s);
    feld.value = String(wert);   // korrigierten Wert zeigen (z. B. 140 -> 100)
    if (regel.danach) regel.danach();
    if (regel.meldung) UI.toast(regel.meldung);
  }

  // Zahl-Feld in einer Zeile (Beschriftung links, Feld rechts)
  function zahlZeile(label, pfad, s, hinweis) {
    return '<div class="form-row" style="align-items:center">' +
      '<div class="grow"><strong>' + UI.esc(label) + "</strong>" +
        (hinweis ? '<div class="hint">' + UI.esc(hinweis) + "</div>" : "") + "</div>" +
      zahlFeld(pfad, s) +
    "</div>";
  }
  function zahlFeld(pfad, s, placeholder) {
    return '<input type="number" inputmode="numeric" style="width:110px" id="f-' + pfad.replace(/\./g, "-") + '"' +
      ' data-einstellung="' + pfad + '" value="' + UI.esc(wertLesen(s, pfad)) + '"' +
      (placeholder ? ' placeholder="' + UI.esc(placeholder) + '"' : "") + ">";
  }
  // Auswahl- oder Zahlfeld mit Beschriftung über UI.field
  function einstellungFeld(label, pfad, s, opts) {
    return UI.field(label, pfad, wertLesen(s, pfad),
      Object.assign({}, opts, { attrs: 'data-einstellung="' + pfad + '"' }));
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
    const punkte = Store.EVENT_TYPES.map((t) => zahlZeile(t.label, "mitarbeitPunkte." + t.id, s)).join("");
    const heatpunkte = Store.EVENT_TYPES.filter((t) => t.heatSetting)
      .map((t) => zahlZeile(t.label, t.heatSetting, s)).join("");

    const topbar =
      '<button class="iconbtn plain" data-action="home" title="Zurück">‹</button>' +
      '<div class="title-wrap"><h1 class="main">Einstellungen</h1></div>';

    const body =
      '<div class="card"><h2>Notenberechnung</h2>' +
        einstellungFeld("Aktuelles Quartal", "aktuellesQuartal", s, { type: "select", options: [
          { value: "1", label: "1. Quartal" },
          { value: "2", label: "2. Quartal" },
          { value: "3", label: "3. Quartal" },
          { value: "4", label: "4. Quartal" }
        ], hint: "Neue Noten, Stunden und Mitarbeits-Ereignisse werden diesem Quartal zugeordnet." }) +
      "</div>" +
      '<div class="card"><h2>Darstellung</h2>' +
        einstellungFeld("Reihenfolge der Schüler/innen", "schuelerSortierung", s, { type: "select", options: [
          { value: "nachname", label: "Alphabetisch (Nachname)" },
          { value: "manuell", label: "Manuell (▲/▼ im Schüler-Tab)" }
        ], hint: "Gilt für alle Listen: Noten, Tracker, Sitzplan, Besprechung und CSV-Exporte. Die manuelle Reihenfolge bleibt gespeichert und ist jederzeit wieder abrufbar." }) +
      "</div>" +
      '<div class="card"><h2>Mitarbeit – Punkte je Ereignistyp</h2>' + punkte +
        einstellungFeld("Vergessene Hausaufgaben werten", "haModus", s, { type: "select", options: [
          { value: "punkte", label: "Punkteabzug in der Mitarbeit" },
          { value: "note6", label: "Ab der 3. je eine Note 6 (Mündliche Mitarbeit)" }
        ], hint: "Bei „Note 6“ geben vergessene Hausaufgaben keine Punkte; je drei vergessene HA im Quartal kommt eine zusätzliche Stundennote 6 in den Notenvorschlag – eine eigene Notenspalte entsteht dabei nicht." }) +
      "</div>" +
      '<div class="card"><h2>Mitarbeit – Notenschwellen</h2>' +
        '<p class="muted">Übersetzt die Punkte einer einzelnen Stunde in eine Stundennote; der Vorschlag für die Mitarbeitsnote ist der Ø aller Stundennoten. Einzelne Klassen können eigene Schwellen bekommen (Klasse → Auswertung → Schwellen), z. B. weil eine Biologiestunde andere Mitarbeit ermöglicht als eine Deutschstunde.</p>' +
        '<div id="schwellen-global">' + schwellenFelderHTML(s.mitarbeitSchwellen) + "</div>" +
      "</div>" +
      '<div class="card"><h2>Heatmap</h2>' + heatpunkte +
        '<div class="field" style="margin-top:14px">' + einstellungFeld("Default-Wert für neue / zurückgesetzte Heatmap", "heatStartWert", s, { type: "number", inputmode: "numeric", hint: "Wertebereich: 0 bis 100" }) + "</div>" +
        '<div class="form-row" style="align-items:center">' +
          '<div class="grow"><strong>Y Heatmap-Punkte verfallen pro X Minuten</strong><div class="hint">Bezogen auf eine 45-Minuten-Stunde; der Tracker skaliert auf die tatsächliche Stundendauer.</div></div>' +
          zahlFeld("heatVerfallPunkte", s) + zahlFeld("heatVerfallMinuten", s, "X Minuten") +
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
      // Einfache Einstellungen: alle nach dem Bauplan (EINSTELLUNGEN)
      UI.$all("[data-einstellung]").forEach((feld) =>
        feld.addEventListener("change", () => einstellungSpeichern(s, feld)));
      // Zusammengesetzte Einstellungen: Notenschwellen und Stundenplan
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

  Object.assign(global.Views, { ViewEinstellungen, schwellenFelderHTML, schwellenAusFormular, EINSTELLUNGEN });
})(window);
