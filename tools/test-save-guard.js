/* One click is one save.
   =====================
   Save, Revise and Draft each reach SharePoint and come back before anything
   on screen changes. For that second or two the button looked untouched, so
   people pressed it again -- and on Revise that was expensive. Every press
   read the same history, worked out the same next revision number, found it
   unused, and wrote it. One Revise, three revisions, and a revision is not
   something anyone unpicks afterwards.

   The guard has to be a REF. Two clicks in the same tick both read a state
   value that has not re-rendered yet, so both would pass; a ref assignment is
   there for the next click immediately. That is the whole fix, and it is the
   part a test can hold still.

   The other half is that the button now says what it is doing. A control that
   gives no sign of life is a control people press again -- the guard stops the
   damage, the label stops the pressing.

   Run: node tools/test-save-guard.js */
'use strict';
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };

/* ---- the guard itself, lifted from the shipped source and run ---- */
const src = app.slice(app.indexOf('const _busy = useRef({});'), app.indexOf('const saveDraft ='));
let _refVal = {}, _stateVal = {};
const mk = new Function('useRef', 'useState',
  src + String.fromCharCode(10) + 'return { guard, busyBtn };');
const G = mk(
  () => ({ get current() { return _refVal; }, set current(v) { _refVal = v; } }),
  () => [_stateVal, fn => { _stateVal = typeof fn === 'function' ? fn(_stateVal) : fn; }]
);

console.log('a second click while the first is still working:');
let runs = 0, release;
const slow = () => { runs++; return new Promise(r => { release = r; }); };
const guarded = G.guard('revise', slow);

(async () => {
  const a = guarded();          /* first click -- now in flight */
  const b = guarded();          /* the spam click, same tick */
  const c = guarded();
  ck('only the first click does the work', runs === 1, runs);
  /* They must come back on their own -- a spam click that sat waiting on the
     first save would queue up and fire the moment it finished. */
  ck('the others come back at once rather than queueing behind it',
    (await b) === undefined && (await c) === undefined && runs === 1, runs);
  ck('and the button knows it is busy', _stateVal.revise === true, JSON.stringify(_stateVal));

  release();
  await a;
  ck('once it finishes the guard lifts', _busyCleared(), JSON.stringify(_refVal));
  function _busyCleared() { return _refVal.revise === false && _stateVal.revise === false; }

  runs = 0;
  const d = guarded(); 
  ck('so the next real click works', runs === 1, runs);
  release(); await d;

  /* A failed save must not wedge the button for the rest of the session. */
  console.log(String.fromCharCode(10) + 'and a save that throws still lets go:');
  const boom = G.guard('save', async () => { throw new Error('SharePoint said no'); });
  let threw = false;
  try { await boom(); } catch (e) { threw = true; }
  ck('the error reaches the caller', threw);
  ck('but the button is usable again', _refVal.save === false && _stateVal.save === false,
    JSON.stringify({ r: _refVal.save, s: _stateVal.save }));

  /* Each button is guarded on its own key: saving must not lock Revise. */
  console.log(String.fromCharCode(10) + 'one busy button does not disable the others:');
  const s1 = G.guard('save', slow), r1 = G.guard('revise', async () => 'ran');
  runs = 0; s1();
  ck('Revise still runs while Save is in flight', (await r1()) === 'ran');
  release();

  /* ---- and the three handlers are actually wired to it ---- */
  console.log(String.fromCharCode(10) + 'the handlers that write are the ones guarded:');
  [['saveDraft', 'draft'], ['handleSave', 'save'], ['handleSaveRevision', 'revise']].forEach(([fn, key]) => {
    ck(fn + ' is guarded at its definition',
      app.indexOf('const ' + fn + " = guard('" + key + "', async (") > 0,
      'guarding at the call site would leave Ctrl+S and every other caller unguarded');
  });
  /* Ctrl+S is a real way to spam a save, and it does not go through a button. */
  ck('so Ctrl+S is covered by the same guard',
    app.indexOf("e.key==='s'") > 0 && app.indexOf('handleSave();') > 0);

  console.log(String.fromCharCode(10) + 'and every guarded button says so:');
  [['draft', 'Draft'], ['save', 'Save'], ['revise', 'Revise']].forEach(([key, label]) => {
    ck(label + ' goes out of action while it works',
      app.indexOf('disabled: !!busyOp.' + key) > 0);
    /* A built RegExp does not survive the shell quoting this repo is edited
       through, and one that degrades silently passes for the wrong reason. */
    const at = app.indexOf('busyOp.' + key + ' ? "');
    ck(label + ' changes its label so the wait is visible',
      at > 0 && app.slice(at, at + 60).indexOf('Saving') > 0, app.slice(at, at + 60));
  });
  /* pointerEvents, because `disabled` alone still leaves a button that looks
     live on a touch screen. */
  ck('and is visibly out of action, not just inert',
    /pointerEvents: 'none'/.test(app) && /cursor: 'progress'/.test(app));

  console.log(bad ? String.fromCharCode(10) + bad + ' FAILURE(S)' : String.fromCharCode(10) + 'save guard OK');
  process.exit(bad ? 1 : 0);
})();
