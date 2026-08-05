/* Exercises the real bulkMode object lifted out of src/db.js. */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
/* Include BULK_MAX_MINUTES: the ceiling is part of the behaviour under test,
   so lifting it with the object keeps the real value rather than a copy. */
const m = src.match(/const BULK_MAX_MINUTES = [\s\S]*?const bulkMode = \{[\s\S]*?\n\};/);
if (!m) { console.error('BULK_MAX_MINUTES / bulkMode not found in src/db.js'); process.exit(1); }

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
/* Deliberately absent. The window moved to localStorage so a multi-day import
   survives closing the tab; touching sessionStorage now would throw here. */
global.window = { dispatchEvent() {} };
global.Event = function () {};

const bulkMode = new Function(m[0] + ' return bulkMode;')();

let fails = 0;
const ck = (n, c, x) => {
  if (c) console.log('  PASS  ' + n);
  else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); fails++; }
};

console.log('bulk upload mode:');
ck('off by default', bulkMode.on() === false);
bulkMode.enable(60, 'admin');
ck('on after enable', bulkMode.on() === true);
ck('reports minutes left', bulkMode.minutesLeft() === 60, bulkMode.minutesLeft());
ck('records who enabled it', bulkMode.get().by === 'admin');
bulkMode.disable();
ck('off after disable', bulkMode.on() === false);

console.log('\nexpiry (must not stay off forever):');
bulkMode.enable(60, 'admin');
store['shic:bulk'] = JSON.stringify({ until: Date.now() - 1000, by: 'admin' });
ck('expired window reads as off', bulkMode.on() === false);
ck('expired entry is cleaned up', !('shic:bulk' in store));
ck('minutesLeft is 0 when off', bulkMode.minutesLeft() === 0);

console.log('\nmalformed state fails closed (protection stays ON):');
store['shic:bulk'] = 'not json';
ck('garbage value reads as off', bulkMode.on() === false);
store['shic:bulk'] = JSON.stringify({ by: 'x' });
ck('entry with no expiry reads as off', bulkMode.on() === false);
store['shic:bulk'] = JSON.stringify({ until: 'soon' });
ck('non-numeric expiry reads as off', bulkMode.on() === false);

console.log('\nstorage choice (must survive a closed tab, for multi-day imports):');
ck('uses localStorage, not sessionStorage', /localStorage/.test(m[0]) && !/sessionStorage/.test(m[0]),
  'sessionStorage caps the window at the life of one tab');

console.log('\nlong windows: up to a week, and never longer:');
const WEEK = 7 * 24 * 60;
bulkMode.disable();
bulkMode.enable(WEEK, 'admin');
ck('a full week is allowed', bulkMode.minutesLeft() === WEEK, bulkMode.minutesLeft());
ck('reads as days, not raw minutes', /^6d|^7d/.test(bulkMode.timeLeftText()), bulkMode.timeLeftText());
ck('enable reports the window it actually set', bulkMode.enable(WEEK, 'admin') === WEEK);
ck('anything longer is clamped to a week', bulkMode.enable(WEEK * 10, 'admin') === WEEK);
ck('and the stored expiry is clamped too', bulkMode.minutesLeft() <= WEEK, bulkMode.minutesLeft());
/* A hand-edited or clock-skewed entry beyond the ceiling must not be honoured. */
store['shic:bulk'] = JSON.stringify({ until: Date.now() + WEEK * 60000 * 5, by: 'admin' });
ck('an expiry past the ceiling fails closed', bulkMode.on() === false);
ck('and is cleaned up', !('shic:bulk' in store));
bulkMode.enable(0, 'admin');
ck('zero/garbage falls back to a sane default', bulkMode.minutesLeft() === 60, bulkMode.minutesLeft());

console.log('\nbound to the admin who enabled it (a shared browser is now a real risk):');
bulkMode.disable();
bulkMode.enable(WEEK, 'boss');
ck('applies to the admin who turned it on', bulkMode.on('boss') === true);
ck('is case-insensitive on the username', bulkMode.on('BOSS') === true);
ck('does NOT apply to someone else on the same device', bulkMode.on('maria') === false,
  'a colleague signing in would inherit the bypass');
ck('does not apply when nobody is named', bulkMode.on('') === false);
store['shic:bulk'] = JSON.stringify({ until: Date.now() + 60000, by: '' });
ck('an entry with no owner never applies', bulkMode.on('boss') === false);

console.log('\ntime formatting:');
bulkMode.disable();
bulkMode.enable(10, 'a'); ck('minutes', bulkMode.timeLeftText() === '10 min', bulkMode.timeLeftText());
bulkMode.enable(200, 'a'); ck('hours + minutes', bulkMode.timeLeftText() === '3h 20m', bulkMode.timeLeftText());
bulkMode.enable(1440, 'a'); ck('days + hours', bulkMode.timeLeftText() === '1d 0h', bulkMode.timeLeftText());
bulkMode.disable(); ck('expired reads as expired', bulkMode.timeLeftText() === 'expired');

console.log('\nthe save gate still re-checks the role and the account:');
const app = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'App.js'), 'utf8');
ck('save path checks isAdmin AND the username',
  /isAdmin && bulkMode\.on\(currentUser\?\.username\)/.test(app),
  'a demoted admin, or a different account, would keep the bypass');
ck('the banner shows a human duration', /bulkMode\.timeLeftText\(\)/.test(app));
const ap = fs.readFileSync(require('path').join(__dirname, '..', 'src/components/AdminPanel.js'), 'utf8');
ck('a week is offered in the UI', /\[10080, '1 week'\]/.test(ap));
/* The old dialog promised the window ends when the tab closes. It no longer
   does, and a stale promise there is worse than none. */
ck('the dialog no longer promises the tab-close behaviour',
  !/when this tab is closed/.test(ap) && /no longer ends it/.test(ap));
ck('the dialog warns that someone else\'s CE can be overwritten', /including one saved by someone else/.test(ap));
ck('long windows get an extra warning', /That is a long window/.test(ap));
ck('the window is recorded in the audit log with its end time', /bulk_mode_on[\s\S]{0,120}until /.test(ap));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall bulkMode assertions passed');
process.exit(fails ? 1 : 0);
