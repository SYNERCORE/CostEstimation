/* One CE, two Monitoring rows, neither able to see the other.
   ===========================================================
   A CE saved while SharePoint was unreachable is kept locally under an id of
   Date.now(), and its Monitoring row carries that TIMESTAMP as shicCEId --
   1782785109xxx, not a list item id. When the CE later reaches SharePoint it
   is given a real id, a small integer, and the lookup by that id finds
   nothing. So a second Monitoring row is created.

   Neither row can see the other, so they drift. On the live site one row sat
   at returned|2/4| while the other had moved on to pending|1/4|. Both feed the
   approval-notification flow, which has no way to tell which is current: one
   spurious message per stale row, describing a state the CE has left.

   The CE number is what is actually the same on both. Asking for it as well
   finds the orphan, and because every copy found is written on, the split
   rows converge on the next save rather than drifting further apart. */
'use strict';
const fs = require('fs');
const db = fs.readFileSync('src/db.js', 'utf8');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };
const grab = (re, what) => { const m = db.match(re); if (!m) { console.error('not found in src/db.js: ' + what); process.exit(1); } return m[0]; };

const src =
  'const _monSpIdCache={};\n' +
  grab(/function _monMergeLog\(theirs,mine\)\{[\s\S]*?\n\}/, '_monMergeLog') + '\n' +
  grab(/async function _monRowsFor\(numId,ceNum\)\{[\s\S]*?\n\}/, '_monRowsFor') + '\n' +
  grab(/function _apvCols\(mon,ceNum\)\{[\s\S]*?\n\}/, '_apvCols') + '\n' +
  grab(/let _apvColsMissing=false;/, '_apvColsMissing') + '\n' +
  grab(/async function _monWrite\(send,payload\)\{[\s\S]*?\n\}/, '_monWrite') + '\n' +
  grab(/function _stripApvCols\(p\)\{[\s\S]*?\n\}/, '_stripApvCols') + '\n' +
  grab(/async function dbSaveMonEntry\(ceId, ceNum, monFields, changed\)\{[\s\S]*?\n\}/, 'dbSaveMonEntry');

/* A fake SharePoint that actually honours the two filters, so the split is
   real rather than assumed. `noCENumCol` stands in for a site that has not had
   "Repair lists & columns" run: asking for shicCENum there is a 400. */
function site(rows, opts) {
  const o = opts || {};
  const queried = [];
  const spGet = async (list, filter) => {
    queried.push(filter);
    let m;
    if ((m = /shicCEId eq (\d+)/.exec(filter))) {
      return rows.filter(r => String(r.shicCEId) === m[1]).map(r => ({Id: r.Id, shicMonData: r.shicMonData}));
    }
    if ((m = /shicCENum eq '(.*)'/.exec(filter))) {
      if (o.noCENumCol) throw new Error("400 Column 'shicCENum' does not exist");
      return rows.filter(r => r.shicCENum === m[1]).map(r => ({Id: r.Id, shicMonData: r.shicMonData}));
    }
    return [];
  };
  const patched = [];
  const spPatch = async (list, id, d) => {
    patched.push(id);
    const r = rows.find(x => x.Id === id);
    if (r) { r.shicMonData = d.shicMonData; if (d.shicApvKey !== undefined) r.shicApvKey = d.shicApvKey; }
  };
  const posted = [];
  const spPost = async (list, d) => { posted.push(d); const Id = 900 + posted.length; rows.push({Id, ...d}); return {Id}; };
  const save = new Function(
    'spGet', 'spPost', 'spPatch', 'spWithRetry', 'spList', 'USE_SP', 'getSiteURL', 'console', 'apvMirrorKey',
    src + '; return dbSaveMonEntry;'
  )(spGet, spPost, spPatch, fn => fn(), n => n, true, () => 'https://x', {warn() {}},
    m => m ? (m.state || 'none') + '|' + (m.signed || 0) + '/' + (m.total || 0) + '|' + (m.waiting || []).slice().sort().join(',') : '');
  return {save, rows, queried, patched, posted};
}

const J = o => JSON.stringify(o);
const CE = 'SY3-CE-2026-1168';

(async () => {
  /* The live case: row 2935 written offline under a timestamp id, row 2936
     written later under the real SharePoint id. */
  console.log('the row written offline and the row written after it are one CE:');
  let s = site([
    {Id: 2935, shicCEId: 1782785109234, shicCENum: CE, shicMonData: J({status: 'For Approval', apv: {state: 'returned', waiting: [], signed: 2, total: 4}})},
    {Id: 2936, shicCEId: 1168, shicCENum: CE, shicMonData: J({status: 'For Approval', apv: {state: 'pending', waiting: ['jbaguidudol'], signed: 1, total: 4}})}
  ]);
  let r = await s.save(1168, CE, {status: 'Ongoing'}, ['status']);
  ck('both rows are found, not just the one matching the id', s.patched.length === 2, s.patched.join(','));
  ck('and no third row is created', s.posted.length === 0);
  /* Newest wins: the older row is brought up to it, not the other way round. */
  ck('the newest row is the one read from', r.fields.apv.state === 'pending', r.fields.apv.state);
  const a = JSON.parse(s.rows.find(x => x.Id === 2935).shicMonData);
  const b = JSON.parse(s.rows.find(x => x.Id === 2936).shicMonData);
  ck('afterwards the two rows agree', J(a) === J(b));
  ck('on the live state, not the stale one', a.apv.state === 'pending' && a.status === 'Ongoing');
  /* This is what the flow reads. Two rows disagreeing is one spurious
     notification describing a state the CE has left. */
  ck('so the flow cannot read two different keys for one CE',
    s.rows.find(x => x.Id === 2935).shicApvKey === s.rows.find(x => x.Id === 2936).shicApvKey);

  console.log('\nthe ordinary case is unchanged:');
  s = site([{Id: 40, shicCEId: 7, shicCENum: CE, shicMonData: J({status: 'Ongoing', deadline: '2026-09-30'})}]);
  r = await s.save(7, CE, {status: 'Submitted', deadline: '2026-09-01'}, ['status']);
  ck('one row is written once', s.patched.length === 1 && s.posted.length === 0);
  ck('and the field merge still holds -- the deadline it did not touch survives',
    r.fields.deadline === '2026-09-30', r.fields.deadline);

  console.log('\na CE with no row anywhere still gets one:');
  s = site([]);
  r = await s.save(7, CE, {status: 'Submitted'}, ['status']);
  ck('it is created', s.posted.length === 1);
  ck('carrying the CE number, so the next save can find it by that',
    s.posted[0].shicCENum === CE, s.posted[0].shicCENum);

  /* A near miss: another CE's row must never be swept in by the number query. */
  console.log('\nanother CE is left alone:');
  s = site([
    {Id: 50, shicCEId: 7, shicCENum: CE, shicMonData: J({status: 'Ongoing'})},
    {Id: 51, shicCEId: 8, shicCENum: 'SY3-CE-2026-1169', shicMonData: J({status: 'Draft'})}
  ]);
  await s.save(7, CE, {status: 'Submitted'}, ['status']);
  ck('only its own rows are written', s.patched.join(',') === '50', s.patched.join(','));
  ck("and the other CE's row is untouched",
    JSON.parse(s.rows.find(x => x.Id === 51).shicMonData).status === 'Draft');

  /* A site that has not been repaired has no shicCENum. The id half must still
     work, or this fix would break monitoring on exactly the sites that have
     not yet had the columns added. */
  console.log('\na site without the column still works, by id alone:');
  s = site([{Id: 60, shicCEId: 7, shicMonData: J({status: 'Ongoing'})}], {noCENumCol: true});
  r = await s.save(7, CE, {status: 'Submitted'}, ['status']);
  ck('the row is found and written', s.patched.join(',') === '60');
  ck('and nothing is duplicated because the number query failed', s.posted.length === 0);

  /* dbSaveMonitoring falls back to String(ceId) when it has no CE number.
     Matching on that would be matching an id against a number column. */
  console.log('\nno CE number means no second query:');
  s = site([{Id: 70, shicCEId: 7, shicMonData: J({status: 'Ongoing'})}]);
  await s.save(7, '7', {status: 'Submitted'}, ['status']);
  ck('only the id is asked for', s.queried.filter(q => /shicCENum/.test(q)).length === 0,
    s.queried.join(' | '));
  s = site([{Id: 71, shicCEId: 7, shicMonData: J({status: 'Ongoing'})}]);
  await s.save(7, '', {status: 'Submitted'}, ['status']);
  ck('and an empty one is not asked for either',
    s.queried.filter(q => /shicCENum/.test(q)).length === 0);

  /* An apostrophe in a CE number would otherwise end the OData string and
     make the query a syntax error. */
  console.log("\na quote in the CE number does not break the query:");
  s = site([{Id: 80, shicCEId: 7, shicCENum: "SY3-O'BRIEN-1", shicMonData: J({status: 'Ongoing'})}]);
  await s.save(7, "SY3-O'BRIEN-1", {status: 'Submitted'}, ['status']);
  ck('it is doubled, as OData wants',
    s.queried.some(q => q.indexOf("SY3-O''BRIEN-1") > 0), s.queried.join(' | '));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nduplicate monitoring rows OK');
  process.exit(bad ? 1 : 0);
})();
