/* Exercises the real bulkMode object lifted out of src/db.js. */
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const m = src.match(/const bulkMode = \{[\s\S]*?\n\};/);
if (!m) { console.error('bulkMode not found in src/db.js'); process.exit(1); }

const store = {};
global.sessionStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
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

console.log('\nstorage choice:');
ck('uses sessionStorage, not localStorage', /sessionStorage/.test(m[0]) && !/localStorage/.test(m[0]));

console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nall bulkMode assertions passed');
process.exit(fails ? 1 : 0);
