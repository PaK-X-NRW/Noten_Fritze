/* =========================================================================
   db.js – Schlanker IndexedDB-Wrapper (Promise-basiert)
   Kapselt das Öffnen der Datenbank, Schema-Versionierung und generische
   CRUD-Operationen. Kein Framework, keine Abhängigkeiten.
   ========================================================================= */
(function (global) {
  "use strict";

  const DB_NAME = "noten-fritze";
  // v2: neuer Store "abwesenheiten" (Schüler tageweise als abwesend markieren)
  // v3: neuer Store "stunden" (Unterrichtsstunden) + Index "stundeId" auf ereignisse
  // v4: neuer Store "leistungen" (eine Spalte der Notenübersicht) + Index
  //     "leistungId" auf noten
  // v5: neue Stores "stundenplaene" (Versionen des Wochen-Stundenplans) und
  //     "wochennotizen" (Notiz je Woche, Schlüssel = Montag)
  // v6: neuer Store "termine" (Kalender: Termine, Ferien, Änderungen einzelner Stunden)
  // v7: neue Stores "planungen" (Fahrplan je Stunde) und "dateien" (Anhänge)
  const DB_VERSION = 7;

  // Definition der Object-Stores + Indizes. Zentral, damit Migrationen
  // (spätere DB_VERSION-Erhöhungen) übersichtlich bleiben.
  const STORES = {
    klassen:      { keyPath: "id", indexes: [{ name: "updatedAt", keyPath: "updatedAt" }] },
    schueler:     { keyPath: "id", indexes: [{ name: "klasseId", keyPath: "klasseId" }] },
    kategorien:   { keyPath: "id", indexes: [{ name: "klasseId", keyPath: "klasseId" }] },
    // Leistungen: je eine Spalte der Notenübersicht („2. Klassenarbeit",
    // „HÜ 10.09."). Gehört zu einer Kategorie und einem Quartal; je Schüler/in
    // steht darin genau eine Note.
    leistungen:   { keyPath: "id", indexes: [
                      { name: "klasseId", keyPath: "klasseId" },
                      { name: "kategorieId", keyPath: "kategorieId" }
                    ] },
    noten:        { keyPath: "id", indexes: [
                      { name: "klasseId", keyPath: "klasseId" },
                      { name: "schuelerId", keyPath: "schuelerId" },
                      { name: "kategorieId", keyPath: "kategorieId" },
                      { name: "leistungId", keyPath: "leistungId" }
                    ] },
    sitzplaene:   { keyPath: "klasseId", indexes: [] },
    ereignisse:   { keyPath: "id", indexes: [
                      { name: "klasseId", keyPath: "klasseId" },
                      { name: "schuelerId", keyPath: "schuelerId" },
                      { name: "timestamp", keyPath: "timestamp" },
                      { name: "stundeId", keyPath: "stundeId" }
                    ] },
    // Unterrichtsstunden: Einheit, in der der Tracker erfasst wird
    stunden:      { keyPath: "id", indexes: [
                      { name: "klasseId", keyPath: "klasseId" },
                      { name: "datum", keyPath: "datum" }
                    ] },
    // Abwesenheiten: id = schuelerId + "_" + datum (YYYY-MM-DD, lokal)
    abwesenheiten:{ keyPath: "id", indexes: [
                      { name: "klasseId", keyPath: "klasseId" },
                      { name: "schuelerId", keyPath: "schuelerId" },
                      { name: "datum", keyPath: "datum" }
                    ] },
    // Stundenplan: je Datensatz eine Version { id, gueltigAb, eintraege }
    stundenplaene:{ keyPath: "id", indexes: [] },
    // Freie Notiz je Woche (z. B. ToDos fürs Wochenende), Schlüssel = Montag
    wochennotizen:{ keyPath: "montag", indexes: [] },
    // Kalender: Termine, Ferien und Änderungen einzelner Stunden
    termine:      { keyPath: "id", indexes: [{ name: "klasseId", keyPath: "klasseId" }] },
    // Stundenplanung: je Stunde ein Fahrplan { klasseId, datum, blockId, thema, bausteine }
    planungen:    { keyPath: "id", indexes: [{ name: "klasseId", keyPath: "klasseId" }] },
    // Anhänge der Planung (Kopie der Datei; Inhalt wird nach einer Frist entfernt)
    dateien:      { keyPath: "id", indexes: [] },
    einstellungen:{ keyPath: "key", indexes: [] }
  };

  let _dbPromise = null;

  function open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        // Migrationen: bei höheren Versionen hier ergänzen (additiv!).
        Object.keys(STORES).forEach((name) => {
          let store;
          if (!db.objectStoreNames.contains(name)) {
            store = db.createObjectStore(name, { keyPath: STORES[name].keyPath });
          } else {
            store = e.target.transaction.objectStore(name);
          }
          STORES[name].indexes.forEach((ix) => {
            if (!store.indexNames.contains(ix.name)) {
              store.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique });
            }
          });
        });
      };
      // Ein anderes offenes Fenster (Tab/PWA) mit älterer Version hält die
      // Datenbank: das Upgrade wartet, bis es geschlossen ist – Hinweis zeigen.
      req.onblocked = () => {
        if (global.UI) UI.toast("Bitte andere geöffnete Noten-Fritze-Fenster schließen – die Datenbank wird aktualisiert.", { duration: 15000 });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Will ein neueres Fenster upgraden, die eigene Verbindung freigeben
        // (sonst bliebe es blockiert); dieses Fenster muss dann neu laden.
        db.onversionchange = () => {
          db.close();
          if (global.UI) UI.toast("Noten-Fritze wurde in einem anderen Fenster aktualisiert – bitte neu laden.", { duration: 60000 });
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function tx(storeNames, mode) {
    return open().then((db) => {
      const t = db.transaction(storeNames, mode);
      return t;
    });
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---- Generische Operationen ----------------------------------------------
  async function put(store, value) {
    const t = await tx(store, "readwrite");
    const r = reqToPromise(t.objectStore(store).put(value));
    return r.then(() => value);
  }

  async function bulkPut(store, values) {
    const t = await tx(store, "readwrite");
    const os = t.objectStore(store);
    values.forEach((v) => os.put(v));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(values);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function get(store, key) {
    const t = await tx(store, "readonly");
    return reqToPromise(t.objectStore(store).get(key));
  }

  async function getAll(store) {
    const t = await tx(store, "readonly");
    return reqToPromise(t.objectStore(store).getAll());
  }

  async function getAllByIndex(store, indexName, value) {
    const t = await tx(store, "readonly");
    const ix = t.objectStore(store).index(indexName);
    return reqToPromise(ix.getAll(value));
  }

  async function del(store, key) {
    const t = await tx(store, "readwrite");
    return reqToPromise(t.objectStore(store).delete(key));
  }

  async function delByIndex(store, indexName, value) {
    const t = await tx(store, "readwrite");
    const os = t.objectStore(store);
    const ix = os.index(indexName);
    const keys = await reqToPromise(ix.getAllKeys(value));
    keys.forEach((k) => os.delete(k));
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(keys.length);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  // Schlüssel aller Datensätze mit einem bestimmten Index-Wert (nur lesen).
  async function keysByIndex(store, indexName, value) {
    const t = await tx(store, "readonly");
    return reqToPromise(t.objectStore(store).index(indexName).getAllKeys(value));
  }

  // Schreibt in mehrere Stores in EINER Transaktion: entweder wird alles
  // gespeichert oder – bei einem Fehler mittendrin – gar nichts. Für Löschen
  // mit Kaskade und für Importe, damit nie ein halber Datenstand zurückbleibt.
  //   schritte(os): os(name) liefert den Object-Store; darin synchron
  //   put/delete/clear aufrufen (kein await – sonst endet die Transaktion).
  async function atomar(storeNames, schritte) {
    const db = await open();
    const t = db.transaction(storeNames, "readwrite");
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("Speichern abgebrochen"));
      try {
        schritte((name) => t.objectStore(name));
      } catch (e) {
        try { t.abort(); } catch (e2) { /* schon beendet */ }
        reject(e);
      }
    });
  }

  async function clearAll() {
    const db = await open();
    const names = Array.from(db.objectStoreNames);
    const t = db.transaction(names, "readwrite");
    names.forEach((n) => t.objectStore(n).clear());
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  global.DB = {
    open, put, bulkPut, get, getAll, getAllByIndex, keysByIndex, del, delByIndex, clearAll, atomar,
    DB_NAME, DB_VERSION, STORES
  };
})(window);
