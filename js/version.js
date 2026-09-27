/* =========================================================================
   version.js – App-Version (Single Source of Truth)
   Schema MAJOR.MINOR.PATCH, von Hand gepflegt:
     MAJOR – große Umbauten / neue App-Generation
     MINOR – neue Funktionen
     PATCH – Fixes, Feinschliff, kleine Änderungen
   Die Version wird in den Einstellungen ("Über") angezeigt, benennt den
   Service-Worker-Cache und steht im JSON-Backup. Sie ist bewusst unabhängig
   von den beiden internen Zählern DB.DB_VERSION (Struktur der Object-Stores)
   und Store.SCHEMA_VERSION (Form der Datensätze).

   ⚠️ Bei jedem Release erhöhen – auch bei reinen UI-Änderungen, sonst behalten
   installierte PWAs die alte App-Shell im Cache (siehe service-worker.js).
   ========================================================================= */
(function (global) {
  "use strict";

  global.APP_VERSION = "1.12.0";

  // `self` statt `window`: Die Datei wird auch vom Service Worker per
  // importScripts geladen, damit Cache-Name und App dieselbe Version nutzen.
})(self);
