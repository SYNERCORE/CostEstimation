#!/usr/bin/env node
/*
 * Electricity drawn by a tool, charged on shopworks only.
 *
 * Shop work runs on the shop's own supply, so the power a welding machine
 * pulls is a cost the company carries and should bill. The same machine on an
 * onsite job runs on the client's supply and the power is not ours to charge
 * for -- so the CE TYPE decides, not the presence of a kW figure on the row.
 *
 *   power = qty x kW x running hours x P/kWh
 *
 * Running hours are typed, not derived from days. A grinder on the floor for
 * five days does not draw for 120 hours.
 *
 * The property everything rests on: a CE with no kW and no running hours --
 * which is every CE saved before this -- costs exactly what it always did.
 * That is asserted numerically below, not assumed.
 *
 * Run: node tools/test-tool-power.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const help = fs.readFileSync('src/helpers.js', 'utf8');
const cfg = fs.readFileSync('src/config.js', 'utf8');
const raw = fs.readFileSync('src/App.js', 'utf8');
const app = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const restab = fs.readFileSync('src/components/ResTab.js', 'utf8');
const db = fs.readFileSync('src/db.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x ? '  -> ' + x : '')); bad++; } };

/* --- the real functions, run --- */
const CE_CFG = {
  onsite: {mobDemob: true}, shopworks: {mobDemob: true, power: true}, supply: {mobDemob: false}
};
const SHIFTS = {regular_day: {mult: 1}, regular_night: {mult: 1.25}};
const src =
  (help.match(/const OT_MULT_DEFAULT[\s\S]*?\nfunction toolRowTotal\(row, kwhRate, src\) \{[\s\S]*?\n\}/) || [''])[0] + '\n' +
  (help.match(/function ceResDays\(r\) \{[\s\S]*?\n\}/) || [''])[0] + '\n' +
  (help.match(/const TIER_HOURS_PER_YEAR[\s\S]*?\nfunction toolRowCost\(row, src\) \{[\s\S]*?\n\}/) || [''])[0];
if (!/function toolPowerCost/.test(src)) { console.error('power helpers not found'); process.exit(1); }
const ctx = {SHIFTS, CE_CFG, N: v => parseFloat(v) || 0, Object, parseFloat, isFinite, Math};
vm.createContext(ctx);
vm.runInContext(src +
  ';globalThis._p=toolPowerCost;globalThis._t=toolRowTotal;globalThis._c=toolRowCost;' +
  'globalThis._r=ceRates;globalThis._k=ceKwhRate;globalThis._on=cePowerOn;globalThis._D=KWH_RATE_DEFAULT;', ctx);
const P = ctx._p, T = ctx._t, C = ctx._c, R = ctx._r, K = ctx._k, ON = ctx._on, DEF = ctx._D;

console.log('the CE type decides, not the row:');
ck('shopworks charges power', ON('shopworks') === true);
ck('onsite does not', ON('onsite') === false,
  'the client supplies the power on their own site');
ck('supply does not', ON('supply') === false);
ck('an unknown type does not', ON('nonsense') === false,
  'defaulting to ON would add a charge nobody asked for');

console.log('\nthe arithmetic is qty x kW x running hours x tariff:');
const row = {desc: 'WELDING MACHINE', qty: 2, cost: 1500, days: 5, kw: 8, runHrs: 6};
ck('2 x 8kW x 6hrs x P12 = 1152', P(row, 12) === 1152, P(row, 12));
ck('double the hours, double the cost', P({...row, runHrs: 12}, 12) === 2304);
ck('double the quantity, double the cost', P({...row, qty: 4}, 12) === 2304);
ck('the tariff scales it', P(row, 6) === 576);

console.log('\nrunning hours are typed, not days x 8:');
ck('five days on the floor is not 40 hours of draw',
  P(row, 12) !== P({...row, runHrs: 5 * 8}, 12),
  'deriving hours from days quotes more power than the shop consumes');
ck('a row with days but no running hours draws nothing',
  P({desc: 'X', qty: 1, cost: 100, days: 30, kw: 10}, 12) === 0,
  'a tool held on site is not a tool that is running');
ck('and hours apply whatever the tier',
  P({...row, tier: 1}, 12) === P({...row, tier: 2}, 12) &&
  P({...row, tier: 2}, 12) === P({...row, tier: 3}, 12),
  'a Tier 1 tool draws power the same as a Tier 2 one');

console.log('\nnothing already saved reprices:');
const old = {desc: 'CHAIN BLOCK', qty: 4, cost: 850, days: 3, tier: 2};
ck('a row with no kW costs the rental and nothing else', T(old, 12) === C(old));
ck('even at a high tariff', T(old, 500) === C(old));
ck('a kW with no hours still costs only the rental', T({...old, kw: 5}, 12) === C(old));
ck('and hours with no kW likewise', T({...old, runHrs: 40}, 12) === C(old));
ck('the rental is untouched by power', C(row) === 2 * 1500 * 5,
  'power is added to the row total, it does not alter what the tool is rented at');
ck('and the row total is rental plus power', T(row, 12) === C(row) + P(row, 12));

console.log('\na tariff of zero charges nothing:');
ck('zero rate, zero power', P(row, 0) === 0,
  'a shop that does not bill power sets the rate to 0 and keeps typing kW');
ck('so does a missing rate', P(row, undefined) === 0 && P(row, '') === 0);
ck('and a negative one', P(row, -5) === 0);

console.log('\nnonsense on the row does not become a charge:');
for (const v of [0, -1, '', null, undefined, 'abc', NaN])
  ck('kW ' + JSON.stringify(v) + ' -> no power', P({...row, kw: v}, 12) === 0);
for (const v of [0, -1, '', null, 'abc'])
  ck('hours ' + JSON.stringify(v) + ' -> no power', P({...row, runHrs: v}, 12) === 0);
ck('a null row is 0, not a crash', P(null, 12) === 0);

console.log('\nthe tariff rides on the CE, like the shift multipliers:');
ck('the default is P' + DEF + '/kWh', DEF === 12);
ck('a CE carrying nothing gets the default', K(R(null)) === DEF);
ck('a CE with its own rate keeps it', K(R({rates: {kwhRate: 9.5}})) === 9.5);
ck('zero is honoured, not replaced by the default', K(R({rates: {kwhRate: 0}})) === 0,
  'a multiplier of 0 is nonsense, but a tariff of 0 means "do not bill power"');
ck('a negative one falls back', K(R({rates: {kwhRate: -3}})) === DEF);
ck('and it does not disturb the multipliers',
  R({rates: {kwhRate: 9.5}}).otMult === R(null).otMult);

console.log('\nthe grand total charges it on shopworks and only there:');
const ce = t => ({ceType: t, mp: [], tools: [row], mats: [], ppe: [], misc: {}, rates: {kwhRate: 12}});
const grand = (help.match(/function computeCEGrand\(ce\) \{[\s\S]*?\n\}/) || [''])[0];
vm.runInContext((help.match(/function ceMpRowCost\(r, rates\) \{[\s\S]*?\n\}/) || [''])[0] + '\n' +
  grand + ';globalThis._g=computeCEGrand;', ctx);
const G = ctx._g;
ck('a shopworks CE includes the power', G(ce('shopworks')) === C(row) + 1152,
  G(ce('shopworks')) + ' vs ' + (C(row) + 1152));
ck('the same CE onsite does not', G(ce('onsite')) === C(row));
ck('nor supply', G(ce('supply')) === C(row));
ck('the difference is exactly the power', G(ce('shopworks')) - G(ce('onsite')) === 1152);

console.log('\nshopworks is the type that carries the flag:');
ck('it is set in the config, not hard-coded in a component',
  /shopworks: \{[\s\S]*?power: true/.test(cfg));
ck('and onsite does not have it', !/onsite: \{[\s\S]*?power: true[\s\S]*?\},\s*shopworks/.test(cfg));

console.log('\none tariff, read by everything that shows a figure:');
ck('derived once from the CE type', /const powerOn = !!cfg\.power;/.test(app));
ck('and once from the CE rates', /const kwhRate = powerOn \? ceKwhRate\(rr\) : 0;/.test(app));
for (const [what, re] of [
  ['the section total', /toolsT = useMemo\(\(\) => tools\.reduce\(\(s, r\) => s \+ toolRowTotal\(r, kwhRate\), 0\)/],
  ['the per-task cost', /if \(kind === 'tools'\) return toolRowTotal\(r, kwhRate\);/],
  ['the recompute', /toolRowTotal\(r, _kwh\)/],
  ['the printed CE', /fmt\(toolRowTotal\(r, kwhRate\)\)/],
  ['Export CE', /S\(toolRowTotal\(r, kwhRate\), 'tdnb'\)/],
  ['Export Detailed', /a\.money\(withDays \? toolRowTotal\(r, kwhRate\)/]
]) ck(what + ' goes through toolRowTotal', re.test(what === 'the recompute' ? help : app));
ck('nothing costs a tool as rental-only any more',
  !/toolRowCost\(r\)(?!\s*\+)/.test(app),
  'one site left on the old function is one screen that disagrees with the total');

console.log('\nthe columns appear on shopworks and nowhere else:');
ck('the tab is told by the CE type', /showPower: powerOn,/.test(app));
ck('the headings are conditional', /\.\.\.\(showPower \? \['kW', 'Run hrs', 'Power \(P\)'\] : \[\]\)/.test(restab));
ck('and so are the cells',
  (restab.match(/showPower && \/\*#__PURE__\*\/React\.createElement\("td"/g) || []).length === 3);
ck('the columns are NOT gated on the tariff being non-zero',
  !/showPower = .*kwhRate/.test(restab) && !/const powerOn = .*N\(kwhRate\)/.test(restab),
  'a shop billing no power still needs somewhere to record the kW');
ck('the row total on screen includes it', /const rowTot = r => showDays \? toolRowCost\(r\) \+ rowPwr\(r\)/.test(restab));
ck('and a non-tools tab is never given it', /rowPwr = r => showPower \?/.test(restab));

console.log('\nthe kW rating comes from the Masterlist, then stays on the row:');
ck('copied when the item is picked', /\.\.\.\(item\.kw \? \{kw: item\.kw\} : \{\}\)/.test(restab));
ck('and when the description is matched', /\.\.\.\(f\.kw \? \{kw: f\.kw\} : \{\}\)/.test(restab));
ck('Sync Rates brings it across', /'maintPerYear', 'kw'\]\.forEach/.test(restab));
ck('so does the tab-level re-price', /'maintPerYear', 'kw'\]\.forEach/.test(app));
ck('the Masterlist has a cell for it', /'projectsPerYear', 'maintPerYear', 'kw'\]\.map\(k =>/.test(app));
ck('and the import workbook a column', /'Maintenance per Year', 'Power \(kW\)'\]/.test(app));
ck('under the headings a shop sheet actually uses', /powerkw: 'kw', kw: 'kw'/.test(app));

console.log('\nthe registry keeps it per tool, with no schema change:');
ck('the masterlist is one JSON blob',
  /shicData:JSON\.stringify\(data\)/.test(db),
  'a per-tool field rides in it, so no site has to be repaired to store kW');
ck('and is read back whole', /JSON\.parse\(r\[0\]\.shicData\)/.test(db));
ck('the tier calculator does not wipe it',
  /tools: \(masterlist\.tools \|\| \[\]\)\.map\(r => r\.id === mlCalc\.id \? \{\s*\.\.\.r,/.test(app),
  'rebuilding the item instead of spreading it would drop every field the dialog does not know about');

console.log('\nevery way a tool reaches a CE brings the rating with it:');
ck('the Masterlist picker', /\.\.\.\(item\.kw \? \{kw: item\.kw\} : \{\}\)/.test(restab));
ck('the SOW breakdown picker', /\.\.\.\(item && N\(item\.kw\) > 0 \? \{kw: N\(item\.kw\)\} : \{\}\)/.test(app),
  'a tool added against a task is the same machine as one added on the tab');
ck('and a scope library entry', /\.\.\.\(findToolKw\(desc\) !== undefined \? \{kw: findToolKw\(desc\)\} : \{\}\)/.test(app),
  'a shopworks CE built from a saved scope would otherwise charge no power at all');
ck('an unrated tool gets no kw key rather than a 0',
  /N\(t\.kw\) > 0 \? N\(t\.kw\) : undefined/.test(app),
  'a stored 0 reads as a tool that draws nothing, not one nobody has rated yet');

console.log('\nit survives a save and a reload:');
ck('written to SharePoint', /shicKW:r\.kw\|\|0,shicRunHrs:r\.runHrs\|\|0/.test(db));
ck('read back out', /kw:r\.shicKW\|\|0,runHrs:r\.shicRunHrs\|\|0/.test(db));
ck('selected in both read paths',
  (db.match(/shicTier,shicHours,shicKW,shicRunHrs/g) || []).length === 2);
ck('and tolerated when the site has not been repaired',
  /'shicTier','shicHours','shicKW','shicRunHrs'\]/.test(db),
  'without this an unrepaired site fails to open any CE at all');
ck('Repair knows to create them',
  /\[9,'shicKW'\],\[9,'shicRunHrs'\]/.test(fs.readFileSync('src/components/RegisterPage.js', 'utf8')));

/* The multipliers shipped yesterday and were never written anywhere: the CE
   object carried `rates`, but dbSaveHistory did not put it in a column or in
   the misc blob, so an edited multiplier survived only in the saving browser's
   cache and was lost the moment the CE came back from SharePoint. */
console.log('\nand so does the whole rates object, which it did not before:');
ck('saved in the misc blob', /_rates:\(e\.rates\|\|\{\}\)/.test(db),
  'no new column, so no site has to be repaired for it');
ck('read back out', /rates:\(\(\)=>\{const m=h\.shicMisc\?JSON\.parse\(h\.shicMisc\):\{\};return m\._rates\|\|\{\};\}\)\(\)/.test(db));
ck('and stripped so it is not a cost group',
  /const\{_addlCosts,_margin,_verifyNotes,_rates,\.\.\.rest\}=m/.test(db));

console.log('\nthe tariff edit writes only what differs:');
ck('setting it back to the default removes it',
  /if \(!isFinite\(f\) \|\| f < 0 \|\| f === KWH_RATE_DEFAULT\) delete n\.kwhRate; else n\.kwhRate = f;/.test(app),
  'storing a copy of the default freezes this CE against a future change to it');

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\ntool power OK');
process.exit(bad ? 1 : 0);
