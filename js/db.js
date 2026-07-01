/* =========================================================================
   db.js – Schlanker IndexedDB-Wrapper (Promise-basiert)
   Kapselt das Öffnen der Datenbank, Schema-Versionierung und generische
   CRUD-Operationen. Kein Framework, keine Abhängigkeiten.
   ========================================================================= */
(function (global) {
  "use strict";

  const DB_NAME = "noten-fritze";
  const DB_VERSION = 1;

  // Definition der Object-Stores + Indizes. Zentral, damit Migrationen
  // (spätere DB_VERSION-Erhöhungen) übersichtlich bleiben.
  const STORES = {
    klassen:      { keyPath: "id", indexes: [{ name: "updatedAt", keyPath: "updatedAt" }] },
    schueler:     { keyPath: "id", indexes: [{ name: "klasseId", keyPath: "klasseId" }] },
    kategorien:   { keyPath: "id", indexes: [{ name: "klasseId", keyPath: "klasseId" }] },
    noten:        { keyPath: "id", indexes: [
                      { name: "klasseId", keyPath: "klasseId" },
                      { name: "schuelerId", keyPath: "schuelerId" },
                      { name: "kategorieId", keyPath: "kategorieId" }
                    ] },
    sitzplaene:   { keyPath: "klasseId", indexes: [] },
    ereignisse:   { keyPath: "id", indexes: [
                      { name: "klasseId", keyPath: "klasseId" },
                      { name: "schuelerId", keyPath: "schuelerId" },
                      { name: "timestamp", keyPath: "timestamp" }
                    ] },
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
      req.onsuccess = () => resolve(req.result);
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
    });
  }

  global.DB = {
    open, put, bulkPut, get, getAll, getAllByIndex, del, delByIndex, clearAll,
    DB_NAME, DB_VERSION, STORES
  };
})(window);
