#!/usr/bin/env node
/*
 * A mistyped CE number (11239 for 1239) is claimed in the shared reservation list and stays there after the CE is corrected, so every
 * New CE carried on from it. The admin tool drops claims that no saved CE or draft uses and that sit more than 3 above the highest real
 * number -- and leaves a colleague's fresh claim alone.
 * Run: node tools/test-ce-number-claims.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const db = fs.readFileSync('src/db.js', 'utf8');
const helpers = fs.readFileSync('src/helpers.js', 'utf8');
const panel = fs.readFileSync('src/components/LocalToSPSync.js', 'utf8');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

const a = db.indexOf('async function dbStrayCeReservations'), b = db.indexOf('async function dbSaveShiftRates');
const h0 = helpers.indexOf('function ceSeqOf'), h1 = helpers.indexOf('function nextCeNum(');
async function run(rows, real, drafts, apply) {
  let saved = null;
  const sandbox = {
    CE_RESERVE_KEY: 'k', parseInt, String, Set, Array, logSwallowed() {},
    dbGetCompanyKey: async () => ({ rows }),
    dbGetCeNumbers: async () => real,
    dbGetDrafts: async () => drafts.map(n => ({ info: { ceNum: n } })),
    dbSaveCompanyKey: async (k, v) => { saved = v; return true; }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(helpers.slice(h0, h1) + db.slice(a, b) + '\nthis.f=dbStrayCeReservations;', ctx);
  const r = await ctx.f(apply);
  return { r, saved };
}
const now = new Date().toISOString();
const rows = [{ n: 'SHIC-CE-2026-11239', by: 'a', at: now }, { n: 'SHIC-CE-2026-11240', by: 'a', at: now }, { n: 'SHIC-CE-2026-1240', by: 'b', at: now }, { n: 'SHIC-CE-2026-1242', by: 'c', at: now }, { n: 'SHIC-CE-2026-1230', by: 'd', at: now }];
(async () => {
  let x = await run(rows, ['SHIC-CE-2026-1238', 'SY3-CE-2026-1232'], ['SHIC-CE-2026-1239'], false);
  ck('the typo claims are found', x.r.stray.join() === 'SHIC-CE-2026-11239,SHIC-CE-2026-11240', x.r.stray.join());
  ck('a colleague\'s claim just ahead (1240, 1242) is left alone', !x.r.stray.some(n => /-124\d$/.test(n)));
  ck('a claim at or below the real numbers is left alone', !x.r.stray.includes('SHIC-CE-2026-1230'));
  ck('looking changes nothing', x.saved === null);
  x = await run(rows, ['SHIC-CE-2026-1238'], ['SHIC-CE-2026-1239'], true);
  ck('releasing saves the list without the stray claims', x.saved && x.saved.rows.length === 3 && !x.saved.rows.some(r => /-1124\d$|-11239$/.test(r.n)), JSON.stringify(x.saved));
  x = await run([{ n: 'SHIC-CE-2026-11239', by: 'a', at: now }], ['SHIC-CE-2026-11239'], [], true);
  ck('a number a saved CE really uses is never released', x.r.stray.length === 0 && x.saved === null);
  ck('the admin sync panel offers it', panel.includes('React.createElement(CeNumberClaims, null)') && panel.includes('Release '));
  console.log(bad ? bad + ' FAILURE(S)' : 'CE number claims OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
