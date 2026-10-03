/* The resource tabs skip a render when nothing they show has changed.
   ==================================================================
   Memoising a component that is handed a fresh arrow on every render does
   nothing; wrapping each arrow in useCallback invites a stale closure, which
   in a costing tool is a stale price. So the callbacks keep one identity and
   call the newest function through a ref -- and what pwrFrac DRAWS comes
   through props that change when its inputs do.

   Run: node tools/test-restab-memo.js */
'use strict';
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };
const NL = String.fromCharCode(10);

ck('ResTab is wrapped in React.memo', app.indexOf('const ResTabM = React.memo(ResTab);') > 0);
ck('all three tabs use the memoised one', app.split('React.createElement(ResTabM, {').length - 1 === 3 && app.indexOf('React.createElement(ResTab, {') < 0);
const a = app.indexOf('createElement(ResTabM, {'), blk = app.slice(a, app.indexOf("tab === 'misc'", a));
ck('no fresh arrow is handed to any of them',
  !/(addToML|readFile|setDefaultTier|setKwhRate|pwrFrac): *(list|v|r|f|\w+) *=>/.test(blk) && !/readFile: readDoc/.test(blk) && !/showToast,/.test(blk.split('showToast: resStable.showToast').join('')));
ck('what pwrFrac depends on is a prop, so a change redraws the tab', blk.indexOf('_pfk: cfg.power, _wm: _workMap') > 0);

/* the wrappers, as shipped, against a ref that is refreshed each "render" */
const src = app.slice(app.indexOf('const _lat = useRef(null);'), app.indexOf('}), []);', app.indexOf('const _lat = useRef(null);')) + '}), []);'.length);
/* the wrappers, built from the shipped lambdas with a hand-made ref */
const lat = { current: null };
const calls = [];
const resStable = new Function('_lat', 'setInfo', 'setRates', 'KWH_RATE_DEFAULT', 'useMemo',
  src.replace('const _lat = useRef(null);', '').replace(/_lat\.current = \(\) => \(\{[^}]*\}\);/, '') + NL + 'return resStable;')(lat, () => {}, () => {}, 0, f => f());
lat.current = () => ({ addRowsToML: (t, l) => calls.push(['v1', t, l]), readDoc: f => 'v1:' + f, showToast: (m, e) => calls.push(['t1', m, e]), pwrFrac: r => 0.25 });
const first = resStable.pwrFrac;
ck('a wrapper calls the function from the render it is run in', resStable.pwrFrac({}) === 0.25);
lat.current = () => ({ addRowsToML: (t, l) => calls.push(['v2', t, l]), readDoc: f => 'v2:' + f, showToast: (m, e) => calls.push(['t2', m, e]), pwrFrac: r => 0.75 });
ck('after the next render the same wrapper runs the NEW closure (no stale price)', resStable.pwrFrac({}) === 0.75 && resStable.readFile('x') === 'v2:x');
resStable.addTools([1]); resStable.addMats([2]); resStable.addPpe([3]); resStable.showToast('hi', true);
ck('the three add-to-Masterlist wrappers name their own tab', JSON.stringify(calls.slice(0, 3).map(c => c[1])) === '["tools","materials","ppe"]', JSON.stringify(calls));
ck('and the toast keeps its error flag', calls[3][0] === 't2' && calls[3][2] === true);
ck('the wrapper object never changes identity', first === resStable.pwrFrac);
process.exit(bad ? 1 : 0);
