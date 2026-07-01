/* =========================================================================
   ui.js – UI-Werkzeugkasten
   Kleine Helfer für DOM-Erzeugung, Modale (Bottom-Sheets), Toasts mit
   Undo, Formularbausteine und Escaping. Bewusst minimal gehalten.
   ========================================================================= */
(function (global) {
  "use strict";

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Kürzel: Element aus HTML-String erzeugen
  function fromHTML(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    return tpl.content.firstElementChild;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---- Toast ---------------------------------------------------------------
  let toastTimer = null;
  function toast(message, opts) {
    opts = opts || {};
    const root = document.getElementById("toast-root");
    root.innerHTML = "";
    const el = fromHTML('<div class="toast"><span>' + esc(message) + "</span></div>");
    if (opts.undo) {
      const u = fromHTML('<span class="undo">Rückgängig</span>');
      u.addEventListener("click", () => { hideToast(); opts.undo(); });
      el.appendChild(u);
    }
    root.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.duration || (opts.undo ? 5000 : 2600));
  }
  function hideToast() { document.getElementById("toast-root").innerHTML = ""; }

  // ---- Modal (Bottom-Sheet) ------------------------------------------------
  function modal(opts) {
    // opts: { title, bodyHTML, onMount(root), buttons:[{label,className,onClick(close)}], onClose }
    const root = document.getElementById("modal-root");
    const backdrop = fromHTML('<div class="modal-backdrop"></div>');
    const box = fromHTML('<div class="modal"></div>');
    box.innerHTML =
      '<h2>' + esc(opts.title || "") + "</h2>" +
      '<div class="modal-body"></div>' +
      '<div class="actions"></div>';
    backdrop.appendChild(box);
    root.appendChild(backdrop);

    const body = box.querySelector(".modal-body");
    if (typeof opts.bodyHTML === "string") body.innerHTML = opts.bodyHTML;
    else if (opts.bodyHTML) body.appendChild(opts.bodyHTML);

    function close() {
      root.innerHTML = "";
      if (opts.onClose) opts.onClose();
    }
    const actions = box.querySelector(".actions");
    (opts.buttons || [{ label: "Schließen", className: "btn" }]).forEach((b) => {
      const btn = fromHTML('<button class="btn ' + (b.className || "") + '">' + esc(b.label) + "</button>");
      btn.addEventListener("click", () => { if (b.onClick) b.onClick(close, box); else close(); });
      actions.appendChild(btn);
    });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop && opts.dismissible !== false) close(); });
    if (opts.onMount) opts.onMount(box);
    // Fokus auf erstes Eingabefeld
    const firstInput = box.querySelector("input, textarea, select");
    if (firstInput) setTimeout(() => firstInput.focus(), 60);
    return { close, box };
  }

  function confirmDialog(title, message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      modal({
        title,
        bodyHTML: '<p class="muted">' + esc(message) + "</p>",
        dismissible: true,
        onClose: () => resolve(false),
        buttons: [
          { label: opts.cancelLabel || "Abbrechen", className: "", onClick: (close) => { close(); resolve(false); } },
          { label: opts.okLabel || "Löschen", className: opts.danger === false ? "primary" : "danger",
            onClick: (close) => { resolve(true); document.getElementById("modal-root").innerHTML = ""; } }
        ]
      });
    });
  }

  // ---- Formularbausteine ---------------------------------------------------
  function field(label, name, value, opts) {
    opts = opts || {};
    const type = opts.type || "text";
    const attrs = 'name="' + name + '" id="f-' + name + '"' +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") +
      (opts.inputmode ? ' inputmode="' + opts.inputmode + '"' : "") +
      (opts.autofocus ? " autofocus" : "");
    let control;
    if (type === "textarea") {
      control = "<textarea " + attrs + ">" + esc(value || "") + "</textarea>";
    } else if (type === "select") {
      const options = (opts.options || []).map((o) =>
        '<option value="' + esc(o.value) + '"' + (String(o.value) === String(value) ? " selected" : "") + ">" + esc(o.label) + "</option>"
      ).join("");
      control = "<select " + attrs + ">" + options + "</select>";
    } else {
      control = '<input type="' + type + '" ' + attrs + ' value="' + esc(value == null ? "" : value) + '" />';
    }
    return '<div class="field"><label for="f-' + name + '">' + esc(label) + "</label>" + control +
      (opts.hint ? '<div class="hint">' + esc(opts.hint) + "</div>" : "") + "</div>";
  }

  function formValues(root) {
    const out = {};
    $all("input, select, textarea", root).forEach((el) => {
      if (!el.name) return;
      out[el.name] = el.type === "checkbox" ? el.checked : el.value;
    });
    return out;
  }

  // ---- Datum-Helfer --------------------------------------------------------
  function relZeit(ts) {
    if (!ts) return "noch nie";
    const diff = Store.now() - ts;
    const tag = 86400000;
    const tage = Math.floor(diff / tag);
    if (diff < 60000) return "gerade eben";
    if (diff < 3600000) return Math.floor(diff / 60000) + " Min.";
    if (tage < 1) return Math.floor(diff / 3600000) + " Std.";
    if (tage === 1) return "gestern";
    if (tage < 30) return "vor " + tage + " Tagen";
    if (tage < 365) return "vor " + Math.floor(tage / 30) + " Mon.";
    return "vor " + Math.floor(tage / 365) + " J.";
  }

  function initialen(s) {
    return ((s.vorname || "").slice(0, 1) + (s.nachname || "").slice(0, 1)).toUpperCase() || "?";
  }
  function vollerName(s) {
    return (s.vorname + " " + (s.nachname || "")).trim();
  }

  global.UI = {
    esc, fromHTML, $, $all,
    toast, hideToast, modal, confirmDialog,
    field, formValues,
    relZeit, initialen, vollerName
  };
})(window);
