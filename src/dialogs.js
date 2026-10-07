/* In-app confirm and alert dialogs, in place of the browser's own.

   window.confirm / window.alert block the page, cannot be styled, look different in the installed app on a phone, and are sometimes
   suppressed outright by the browser ("prevent this page from creating more dialogs"), which answers every confirm with Cancel and made
   deletes and saves look broken. These are drawn by the app, in its colours, and work in both themes.

   uiConfirm(message, opts) -> Promise<boolean>   `await` it where confirm() was called: `if (!await uiConfirm('Delete this?')) return;`
   uiAlert(message, opts)   -> Promise<void>      fire and forget is fine; await it only if what follows must wait for OK.

   The message keeps its line breaks. The first paragraph is the heading when the message has several and the first is short, so the long
   existing wording ("Delete this?\n\nIt cannot be undone.") reads as a heading and a body without being rewritten. opts:
     title    heading to use instead
     ok       label of the confirming button (default: OK, or Delete / Replace / Clear when the wording says so)
     cancel   label of the other button (default: Cancel)
     danger   true/false to force the red confirm button; by default it is red when the wording is about deleting or replacing
   Escape cancels, Enter confirms (except on a red button, where Enter does nothing so a stray key cannot delete). Focus lands on the
   safe button for a red dialog and is given back to where it was when the dialog closes. Several asked at once queue one after another.

   It draws its own DOM rather than a React component so any file can call it without props, and so it survives whatever the app is
   re-rendering underneath. */
(function () {
  var queue = [], showing = false;

  var DANGER = /\b(delete|remove|clear|discard|replace|overwrite|reset|wipe|cannot be undone|can't be undone|permanently|withdraw|transfer ownership)\b/i;
  var VERB = [[/^\s*delete\b/i, 'Delete'], [/^\s*remove\b/i, 'Remove'], [/^\s*clear\b/i, 'Clear'], [/^\s*discard\b/i, 'Discard'],
    [/^\s*reset\b/i, 'Reset'], [/^\s*replace\b/i, 'Replace'], [/^\s*withdraw\b/i, 'Withdraw']];

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  function split(message, title) {
    var m = String(message == null ? '' : message).replace(/\r/g, '').trim();
    if (title) return { title: title, body: m };
    var i = m.indexOf('\n\n');
    if (i > 0 && i <= 110) return { title: m.slice(0, i).trim(), body: m.slice(i + 2).trim() };
    if (m.indexOf('\n') < 0 && m.length <= 110) return { title: m, body: '' };
    return { title: '', body: m };
  }

  function next() {
    if (showing || !queue.length) return;
    showing = true;
    var job = queue.shift(), o = job.opts || {};
    var parts = split(job.message, o.title);
    var danger = o.danger != null ? !!o.danger : (job.kind === 'confirm' && DANGER.test(String(job.message)));
    var okLabel = o.ok;
    if (!okLabel) {
      okLabel = 'OK';
      if (danger) for (var v = 0; v < VERB.length; v++) if (VERB[v][0].test(parts.title || job.message)) { okLabel = VERB[v][1]; break; }
    }
    var prev = document.activeElement;

    var back = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;');
    back.setAttribute('role', job.kind === 'confirm' ? 'alertdialog' : 'dialog');
    back.setAttribute('aria-modal', 'true');
    var box = el('div', 'background:var(--bg-surface-card,#172036);color:var(--text-primary,#fff);border:1px solid var(--border-strong,#334155);' +
      'border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.55);width:min(480px,100%);max-height:88vh;display:flex;flex-direction:column;font-family:inherit;');
    var head = el('div', 'padding:18px 20px 0;font-weight:800;font-size:15px;line-height:1.35;overflow-wrap:anywhere;', parts.title || (job.kind === 'confirm' ? 'Please confirm' : 'Notice'));
    head.id = 'shic-dlg-t' + Date.now();
    back.setAttribute('aria-labelledby', head.id);
    var body = parts.body ? el('div', 'padding:10px 20px 0;font-size:13px;line-height:1.55;color:var(--text-secondary,#94a3b8);white-space:pre-wrap;overflow-wrap:anywhere;overflow-y:auto;', parts.body) : null;
    var row = el('div', 'display:flex;gap:8px;justify-content:flex-end;padding:18px 20px 18px;flex-wrap:wrap;');

    var finish = function (val) {
      document.removeEventListener('keydown', onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      showing = false;
      try { if (prev && prev.focus && document.contains(prev)) prev.focus(); } catch (_e) { /* the element may be gone */ }
      job.resolve(val);
      next();
    };
    var btnCss = 'font:inherit;font-size:13px;font-weight:700;padding:8px 18px;border-radius:8px;cursor:pointer;border:1px solid var(--border-strong,#334155);';
    var cancelBtn = null;
    if (job.kind === 'confirm') {
      cancelBtn = el('button', btnCss + 'background:transparent;color:var(--text-primary,#fff);', o.cancel || 'Cancel');
      cancelBtn.type = 'button';
      cancelBtn.onclick = function () { finish(false); };
      row.appendChild(cancelBtn);
    }
    var okBtn = el('button', btnCss + (danger
      ? 'background:var(--status-danger,#ef4444);border-color:var(--status-danger,#ef4444);color:#fff;'
      : 'background:var(--brand-accent,#f59e0b);border-color:var(--brand-accent,#f59e0b);color:var(--on-accent,#000);'), okLabel);
    okBtn.type = 'button';
    okBtn.onclick = function () { finish(job.kind === 'confirm' ? true : undefined); };
    row.appendChild(okBtn);

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(job.kind === 'confirm' ? false : undefined); }
      else if (e.key === 'Enter' && !danger && document.activeElement !== cancelBtn) { e.preventDefault(); e.stopPropagation(); okBtn.click(); }
      else if (e.key === 'Tab') {
        var f = cancelBtn ? [cancelBtn, okBtn] : [okBtn], i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);

    box.appendChild(head); if (body) box.appendChild(body); box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);
    (danger && cancelBtn ? cancelBtn : okBtn).focus();
  }

  function ask(kind, message, opts) {
    return new Promise(function (resolve) {
      queue.push({ kind: kind, message: message, opts: opts, resolve: resolve });
      next();
    });
  }

  window.uiConfirm = function (message, opts) { return ask('confirm', message, opts); };
  window.uiAlert = function (message, opts) { return ask('alert', message, opts); };
  /* Pure parts, exposed so the wording rules can be tested without a browser. */
  window._uiDialogParts = { split: split, danger: function (m) { return DANGER.test(String(m)); } };
})();
