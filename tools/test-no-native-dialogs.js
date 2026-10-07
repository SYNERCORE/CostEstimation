/* The app draws its own confirm and alert dialogs; the browser's are not used. Run: node tools/test-no-native-dialogs.js */
'use strict';
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

/* 1. nothing calls the browser's confirm / alert any more */
const files = ['src/App.js', 'src/ml_utils.js', 'src/db.js', 'src/sp.js', 'src/helpers.js', 'src/ai.js', 'src/auth.js', ...fs.readdirSync(path.join(__dirname, '..', 'src/components')).map(f => 'src/components/' + f)];
const left = [];
files.forEach(f => R(f).split('\n').forEach((l, i) => { if (/(^|[^\w.$])(window\.)?(confirm|alert)\(/.test(l.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, ''))) left.push(f + ':' + (i + 1)); }));
ck('no confirm( or alert( left outside the dialog file', left.length === 0, left.join(' '));
ck('the dialogs are loaded by the page and cached for offline use', R('index.html').indexOf('src/dialogs.js') > 0 && R('sw.js').indexOf('/src/dialogs.js') > 0);

/* 2. wording rules */
const dlg = R('src/dialogs.js');
const els = [];
const mkEl = tag => {
  const e = { tag, style: {}, children: [], parentNode: null, id: '', attrs: {}, textContent: '', onclick: null, focused: false,
    appendChild(c) { c.parentNode = e; e.children.push(c); return c; },
    removeChild(c) { e.children = e.children.filter(x => x !== c); c.parentNode = null; },
    setAttribute(k, v) { e.attrs[k] = v; }, focus() { doc.activeElement = e; }, click() { if (e.onclick) e.onclick(); } };
  Object.defineProperty(e.style, 'cssText', { set() {}, get() { return ''; } });
  return e;
};
const listeners = [];
const doc = { activeElement: null, body: mkEl('body'), createElement: mkEl, contains: () => true,
  addEventListener: (t, f) => listeners.push([t, f]), removeEventListener: (t, f) => { const i = listeners.findIndex(x => x[1] === f); if (i >= 0) listeners.splice(i, 1); } };
const win = {};
new Function('window', 'document', dlg)(win, doc);
const P = win._uiDialogParts;
ck('a short one-line message is the heading', P.split('Delete this service?').title === 'Delete this service?' && P.split('Delete this service?').body === '');
const sp = P.split('Delete this draft?\n\nIt cannot be undone.');
ck('the first paragraph becomes the heading, the rest the body', sp.title === 'Delete this draft?' && sp.body === 'It cannot be undone.');
ck('a long first paragraph stays in the body', P.split('x'.repeat(200) + '\n\nmore').title === '');
ck('an explicit title wins', P.split('body text', 'Heading').title === 'Heading');
ck('deleting and replacing wording is red; plain questions are not', P.danger('Delete "x" permanently?') && P.danger('Replace the library?') && !P.danger('Open test mode?') && !P.danger('Submit SY3-CE-1 for approval?'));

/* 3. behaviour */
const texts = e => [e.textContent].concat(e.children.map(texts).flat());
const buttons = () => { const out = []; const w = n => { if (n.tag === 'button') out.push(n); n.children.forEach(w); }; w(doc.body); return out; };
const key = k => { const ev = { key: k, shiftKey: false, preventDefault() {}, stopPropagation() {} }; listeners.filter(l => l[0] === 'keydown').forEach(l => l[1](ev)); };
const tick = () => new Promise(r => setImmediate(r));
(async () => {
  let p = win.uiConfirm('Open test mode?\n\nA sandbox.');
  let b = buttons();
  ck('a confirm shows Cancel and OK', b.map(x => x.textContent).join() === 'Cancel,OK');
  ck('a plain confirm focuses OK', doc.activeElement && doc.activeElement.textContent === 'OK');
  b.find(x => x.textContent === 'OK').click();
  ck('OK resolves true and removes the dialog', (await p) === true && buttons().length === 0);

  p = win.uiConfirm('Delete this service?');
  b = buttons();
  ck('a red confirm names the action', b.map(x => x.textContent).join() === 'Cancel,Delete');
  ck('and focuses the safe button', doc.activeElement.textContent === 'Cancel');
  key('Enter');
  ck('Enter does nothing on a red dialog', buttons().length === 2);
  key('Escape');
  ck('Escape cancels', (await p) === false && buttons().length === 0);

  p = win.uiConfirm('Submit for approval?');
  key('Enter');
  ck('Enter confirms a plain one', (await p) === true);

  p = win.uiConfirm('Add them?', { ok: 'Add', cancel: 'Not now', danger: false });
  ck('labels can be given', buttons().map(x => x.textContent).join() === 'Not now,Add');
  buttons().find(x => x.textContent === 'Not now').click();
  ck('and Cancel resolves false', (await p) === false);

  const p1 = win.uiConfirm('First?'), p2 = win.uiConfirm('Second?');
  ck('two at once: only the first is shown', buttons().length === 2 && texts(doc.body).join('|').indexOf('First?') >= 0 && texts(doc.body).join('|').indexOf('Second?') < 0);
  buttons().find(x => x.textContent === 'OK').click(); await tick();
  ck('then the second', texts(doc.body).join('|').indexOf('Second?') >= 0);
  buttons().find(x => x.textContent === 'Cancel').click();
  ck('each gets its own answer', (await p1) === true && (await p2) === false);

  const pa = win.uiAlert('Min 6 chars.');
  ck('an alert has one button', buttons().length === 1 && buttons()[0].textContent === 'OK');
  buttons()[0].click(); await pa;
  ck('and clears when dismissed', buttons().length === 0 && listeners.length === 0);
  process.exit(bad ? 1 : 0);
})();
