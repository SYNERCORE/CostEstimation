/* A CE carries hundreds of tool rows -- 922 on the one that prompted this --
   and every one has its own DAYS. When the job's duration changes, or a list
   is imported with no duration at all, setting that column one row at a time
   is not something anyone will actually do. So the column can be set at once.

   What it must not do is touch anything else: quantities, tiers, costs and
   descriptions are what the row is, and a bulk edit that quietly reset one of
   them would be worse than the typing. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + what); if (!cond) bad++; };

const tab = R('src/components/ResTab.js');
const app = R('src/App.js');

console.log('Setting DAYS on every tool row');

/* ---- it is there, and only where days mean anything ---- */
ck('the tools tab offers it', tab.indexOf('"Set all"') > 0);
ck('and only the tools tab, because only equipment is charged by the day',
  /showDays && \/\*#__PURE__\*\/React\.createElement\("span", \{[\s\S]{0,200}"Days:"/.test(tab));
ck('materials and PPE are not given it',
  (app.match(/showDays: true/g) || []).length === 1);

/* ---- what it writes ---- */
const btn = tab.slice(tab.indexOf('const d = parseFloat(bulkDays);'), tab.indexOf('}, "Set all")'));
ck('it writes days on every row', /set\(p => p\.map\(r => \(\{\.\.\.r, days: d\}\)\)\)/.test(btn));
/* The spread is the whole point: everything else on the row survives. */
ck('and spreads the row, so qty, tier, cost and description survive',
  /\{\.\.\.r, days: d\}/.test(btn) && btn.indexOf('qty:') < 0 && btn.indexOf('cost:') < 0 && btn.indexOf('tier:') < 0);
ck('a number that is not one is refused rather than written',
  /if \(!isFinite\(d\) \|\| d < 0\)/.test(btn));
ck('and the button is dead until there is one to write',
  /disabled: !rows\.length \|\| bulkDays === '' \|\| !isFinite\(parseFloat\(bulkDays\)\)/.test(tab));
ck('it says how many rows it actually changed, not how many there are',
  /rows\.filter\(r => rowDays\(r\) !== d\)\.length/.test(btn));
ck('and says so plainly when nothing needed changing',
  btn.indexOf('was already on') > 0);

/* ---- the number it starts on ---- */
const seed = tab.slice(tab.indexOf('const [bulkDays, setBulkDays] = useState(() => {'), tab.indexOf('}, "↺ Sync Rates")'));
ck('it opens on what the rows already say, not on a guess',
  /rows : \[\]\)\.forEach\(r => \{ const d = rowDays\(r \|\| \{\}\); seen\[d\]/.test(seed));
ck('the commonest value wins when they disagree',
  /keys\.sort\(\(a, b\) => seen\[b\] - seen\[a\]\)\[0\]/.test(seed));
ck('and an empty tab falls back to the CE duration', /String\(N\(ceDays\) \|\| 1\)/.test(seed));
ck('it reads days the same way the cost does -- blank means one day',
  tab.indexOf("const rowDays = r => (r.days === undefined || r.days === '' || r.days === null) ? 1 : (N(r.days) || 0);") > 0);

/* ---- the CE's own duration is one click away ---- */
ck("the CE's NO. OF DAYS can be taken straight across", /"= CE \(" \+ ceDays \+ "\)"/.test(tab));
ck('and it is the figure already on Project Info, not a second one to keep in step',
  /ceDays: N\(info\.days\) \|\| 0,/.test(app));
/* A CE with no duration typed in has nothing to offer, and a button offering
   "= CE (0)" would set every tool to nothing. */
ck('a CE with no duration does not offer it', /ceDays > 0 && \/\*#__PURE__\*\//.test(tab));
ck('taking it only fills the box -- nothing is written until Set all',
  /onClick: \(\) => setBulkDays\(String\(ceDays\)\)/.test(tab));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nBulk DAYS OK');
process.exit(bad ? 1 : 0);
