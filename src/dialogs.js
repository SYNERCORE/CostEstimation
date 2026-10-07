/* In-app confirm and alert dialogs, in place of the browser's own.

   window.confirm / window.alert block the page, cannot be styled, look different in the installed app on a phone, and are sometimes
   suppressed outright by the browser ("prevent this page from creating more dialogs"), which answers every confirm with Cancel and made
   deletes and saves look broken. These are drawn by the app, in its colours, and work in both themes.

   uiConfirm(message, opts) -> Promise<boolean>   `await` it where confirm() was called: `if (!await uiConfirm('Delete this?')) return;`
   uiAlert(message, opts)   -> Promise<void>      fire and forget is fine; await it only if what follows must wait for OK.
   uiPrompt(message, opts)  -> Promise<string|null>  the typed text (trimmed), or null when cancelled: `const why = await uiPrompt('Why?', {required: true});`

   The message keeps its line breaks. The first paragraph is the heading when the message has several and the first is short, so the long
   existing wording ("Delete this?\n\nIt cannot be undone.") reads as a heading and a body without being rewritten. opts:
     title    heading to use instead
     ok       label of the confirming button (default: OK, or Delete / Replace / Clear when the wording says so)
     cancel   label of the other button (default: Cancel)
     danger   true/false to force the red confirm button; by default it is red when the wording is about deleting or replacing
   and for uiPrompt:
     value, placeholder   what the field starts with / shows while empty
     multiline            a text area instead of one line (Enter adds a line; Ctrl+Enter submits)
     choices              an array of strings: a dropdown instead of a text field
     required, min        must be non-empty / at least `min` characters; the reason is shown under the field and the dialog stays open
     validate             function(value) returning an error message, or '' when fine; also keeps the dialog open
     readonly             for showing something to copy: the text is selected and cannot be changed
     cancel: false        no Cancel button (nothing to decide)
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
    var head = el('div', 'padding:18px 20px 0;font-weight:800;font-size:15px;line-height:1.35;overflow-wrap:anywhere;', parts.title || (job.kind === 'confirm' ? 'Please confirm' : job.kind === 'prompt' ? 'Please enter' : 'Notice'));
    head.id = 'shic-dlg-t' + Date.now();
    back.setAttribute('aria-labelledby', head.id);
    var body = parts.body ? el('div', 'padding:10px 20px 0;font-size:13px;line-height:1.55;color:var(--text-secondary,#94a3b8);white-space:pre-wrap;overflow-wrap:anywhere;overflow-y:auto;', parts.body) : null;
    var row = el('div', 'display:flex;gap:8px;justify-content:flex-end;padding:18px 20px 18px;flex-wrap:wrap;');
    var field = null, errBox = null, fieldWrap = null;
    if (job.kind === 'prompt') {
      var fcss = 'font:inherit;font-size:13px;width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border-strong,#334155);background:var(--bg-input,#060e20);color:var(--text-primary,#fff);';
      if (o.choices) {
        field = el('select', fcss);
        var blank = el('option', '', o.placeholder || '\u2014 Select \u2014'); blank.value = ''; field.appendChild(blank);
        o.choices.forEach(function (c) { var op = el('option', '', String(c)); op.value = String(c); field.appendChild(op); });
      } else if (o.multiline) {
        field = el('textarea', fcss + 'min-height:88px;resize:vertical;'); field.rows = 4;
      } else { field = el('input', fcss); field.type = 'text'; }
      field.value = o.value == null ? '' : String(o.value);
      if (o.placeholder && !o.choices) field.placeholder = o.placeholder;
      if (o.readonly) field.readOnly = true;
      field.setAttribute('aria-labelledby', head.id);
      fieldWrap = el('div', 'padding:12px 20px 0;');
      errBox = el('div', 'color:var(--status-danger,#ef4444);font-size:12px;font-weight:600;margin-top:6px;overflow-wrap:anywhere;');
      fieldWrap.appendChild(field); fieldWrap.appendChild(errBox);
    }

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
    if ((job.kind === 'confirm' || job.kind === 'prompt') && o.cancel !== false) {
      cancelBtn = el('button', btnCss + 'background:transparent;color:var(--text-primary,#fff);', o.cancel || 'Cancel');
      cancelBtn.type = 'button';
      cancelBtn.onclick = function () { finish(job.kind === 'prompt' ? null : false); };
      row.appendChild(cancelBtn);
    }
    var okBtn = el('button', btnCss + (danger
      ? 'background:var(--status-danger,#ef4444);border-color:var(--status-danger,#ef4444);color:#fff;'
      : 'background:var(--brand-accent,#f59e0b);border-color:var(--brand-accent,#f59e0b);color:var(--on-accent,#000);'), okLabel);
    okBtn.type = 'button';
    okBtn.onclick = function () {
      if (job.kind !== 'prompt') { finish(job.kind === 'confirm' ? true : undefined); return; }
      var v = String(field.value == null ? '' : field.value);
      if (o.trim !== false) v = v.trim();
      var err = '';
      if (!o.readonly) {
        if (o.required && !v) err = o.requiredMsg || 'This is required.';
        else if (o.min && v.length < o.min) err = o.minMsg || ('Please write at least ' + o.min + ' characters.');
        else if (o.validate) err = o.validate(v) || '';
      }
      if (err) { errBox.textContent = err; field.focus(); return; }
      finish(v);
    };
    row.appendChild(okBtn);

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(job.kind === 'confirm' ? false : job.kind === 'prompt' ? null : undefined); }
      else if (e.key === 'Enter' && !danger && document.activeElement !== cancelBtn) {
        /* In a text area Enter is a new line; only Ctrl/Cmd+Enter submits. */
        if (o.multiline && job.kind === 'prompt' && document.activeElement === field && !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault(); e.stopPropagation(); okBtn.click();
      }
      else if (e.key === 'Tab') {
        var f = [field, cancelBtn, okBtn].filter(Boolean), i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    document.addEventListener('keydown', onKey, true);

    box.appendChild(head); if (body) box.appendChild(body); if (fieldWrap) box.appendChild(fieldWrap); box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);
    if (field) { field.focus(); try { if (field.select && (o.readonly || field.value)) field.select(); } catch (_e) { /* a select has none */ } }
    else (danger && cancelBtn ? cancelBtn : okBtn).focus();
  }

  function ask(kind, message, opts) {
    return new Promise(function (resolve) {
      queue.push({ kind: kind, message: message, opts: opts, resolve: resolve });
      next();
    });
  }

  window.uiConfirm = function (message, opts) { return ask('confirm', message, opts); };
  window.uiAlert = function (message, opts) { return ask('alert', message, opts); };
  window.uiPrompt = function (message, opts) { return ask('prompt', message, opts); };
  /* Pure parts, exposed so the wording rules can be tested without a browser. */
  window._uiDialogParts = { split: split, danger: function (m) { return DANGER.test(String(m)); } };
})();
