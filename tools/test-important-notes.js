/* The sales team reads the NOTE block to find what they must not agree to on
   the client's behalf -- an exclusion, a lead time, a price valid for 15 days.
   Those were set in the same 7.5pt black as the boilerplate around them, so
   the ones that matter were being read past. They were highlighted by hand
   after printing, which is not something that survives a reissue.

   A note can be marked important. It prints bold dark red on the CE and in
   the workbook, and carries an [IMPORTANT] marker in the plain-text summary,
   which has no font to set. Nothing else about the note changes: it keeps its
   number and its place in the list.

   Two rules hold this together:
     - ordinary is the default, or the red teaches people to read past red;
     - a preset that nobody flags saves byte for byte as it always did. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

let bad = 0;
const ck = (what, cond, got) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + what + (got !== undefined ? '  [' + got + ']' : ''));
  if (!cond) bad++;
};

const app = R('src/App.js');
const help = R('src/helpers.js');
const xl = R('src/xlsx-styled.js');
const panel = R('src/components/CeDefaultsPanel.js');
const db = R('src/db.js');

console.log('Important notes');

/* ---- one reader for both shapes ---- */
const H = new Function(
  help.slice(help.indexOf('/* -- CE notes ---'), help.indexOf('/* -- Tool & equipment tier pricing ---')) +
  '\nreturn { ceNoteText, ceNoteImp };')();

ck('a plain string is an ordinary note',
  H.ceNoteText('Price valid for 15 days.') === 'Price valid for 15 days.' && H.ceNoteImp('x') === false);
ck('a CE note reads by its text field',
  H.ceNoteText({ text: 'abc', imp: true }) === 'abc' && H.ceNoteImp({ text: 'abc', imp: true }) === true);
ck('a preset note reads by its short one',
  H.ceNoteText({ t: 'abc', imp: true }) === 'abc' && H.ceNoteImp({ t: 'abc', imp: true }) === true);
ck('an unflagged object is still ordinary', H.ceNoteImp({ t: 'abc' }) === false);
/* A preset saved before any of this existed is an array of bare strings. */
ck('nothing saved before this existed reads as flagged',
  ['a', '', null, undefined].every(v => H.ceNoteImp(v) === false));
ck('and nothing crashes on an empty one',
  H.ceNoteText(null) === '' && H.ceNoteText(undefined) === '');

/* ---- ordinary by default ---- */
ck('a new note starts ordinary', /imp: false/.test(app.slice(app.indexOf('const mkNote = ()'), app.indexOf('const [sowItems'))));

/* ---- the three documents ---- */
ck('the printed CE marks the line, not the whole block',
  app.indexOf("<li${n.imp?' class=\"impn\"':''}>") > 0);
ck('bold and dark red, in the stylesheet it names',
  /\.impn\{color:#C00000;font-weight:700\}/.test(app));
ck('the workbook has a style of its own for it', /'noteimp'\]/.test(xl) || /'noteimp'/.test(xl));
ck('which is bold dark red too, the same colour',
  /<font><b\/><sz val="10"\/><color rgb="FFC00000"\/><name val="Calibri"\/><\/font>/.test(xl));
/* The workbook is hand-written OOXML: a count that disagrees with the list
   makes Excel call the file corrupt, so these two are load-bearing. */
ck('the font count was raised with it', /'<fonts count="8">'/.test(xl));
ck('and the cellXfs count too', /'<cellXfs count="19">'/.test(xl));
const xfs = (xl.match(/'<xf xfId="0"/g) || []).length;
ck('the declared count matches the styles actually written (' + xfs + ')', xfs === 19);
const names = xl.slice(xl.indexOf('var STYLES = ['), xl.indexOf('var SID')).match(/'[a-z]+'/g) || [];
ck('and the style names are in step with them (' + names.length + ')', names.length === 19);
ck('noteimp is the last of them, matching the last cellXf',
  names[names.length - 1] === "'noteimp'");

ck('the workbook picks it per line', /n\.imp \? 'noteimp' : 'note'/.test(app));
/* The CE notes and the scope-breakdown notes are merged and THEN numbered, so
   a flat array of strings would lose which one was flagged. */
ck('the flag rides with the line through the merge',
  /notes\.map\(n => \(\{t: String\(n\.text \|\| ''\), imp: !!n\.imp\}\)\)/.test(app));
ck('a text summary has no font, so it says the word instead',
  /\(n\.imp \? '\[IMPORTANT\] ' : ''\)/.test(app));

/* ---- the editor shows what the paper will show ---- */
const ed = app.slice(app.indexOf('placeholder: \'Note \' + note.seq'), app.indexOf('"+ Add Note"') + 1 || undefined);
ck('the note can be flagged from the CE',
  /onClick: \(\) => setNotes\(p => p\.map\(n => n\.id === note\.id \? \{\.\.\.n, imp: !n\.imp\} : n\)\)/.test(app));
ck('and reads red in the editor, not only on the paper',
  /\.\.\.\(note\.imp \? \{color: ERR, fontWeight: 700/.test(app));
ck('its number turns red as well, so it is visible with the note collapsed',
  /color: note\.imp \? ERR : ACC/.test(app));

/* ---- presets ---- */
/* The standing warnings are the same on every CE. Flagged on the preset, the
   flag arrives on each new estimate instead of being re-ticked by hand. */
ck('a preset note can be flagged too', /ceNoteImp\(x\) \? ceNoteText\(x\) : \{t: ceNoteText\(x\), imp: true\}/.test(panel));
ck('and an unflagged one saves as the bare string it always was',
  /return ceNoteImp\(t\) \? \{t: txt, imp: true\} : txt;/.test(panel));
ck('a blank note is still dropped, whichever shape it is',
  /\.filter\(n => \(typeof n === 'string' \? n : n\.t\)\)/.test(panel));
ck('the CE reads the flag off the preset',
  /\(\{id: uid\(\), seq: i \+ 1, text: ceNoteText\(t\), imp: ceNoteImp\(t\)\}\)/.test(app));
/* Changing the CE type re-applies the preset only while nothing has been
   edited. Without the flag in that fingerprint, ticking a note counted as "not
   edited" and switching Onsite to Supply threw the tick away silently. */
ck('toggling a flag counts as an edit, so a re-apply cannot discard it',
  (app.match(/, !!n\.imp\]\)/g) || []).length === 2);

/* ---- it is saved ---- */
ck('notes are stored whole, so the flag needs no column of its own',
  /shicNotes:JSON\.stringify\(e\.notes\|\|\[\]\)/.test(db));
ck('and a resumed draft keeps it', (app.match(/setNotes\(JSON\.parse\(JSON\.stringify\(d\.notes \|\| \[\]\)\)\.map\(\(n, i\) => \(\{\s*\.\.\.n,/g) || []).length === 2);

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nImportant notes OK');
process.exit(bad ? 1 : 0);
