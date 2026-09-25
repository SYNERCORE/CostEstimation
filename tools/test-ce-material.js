/* MATERIAL is what the job is being quoted on -- "A217 Gr. C12A with
   Co-Cr-Mo-Ni & ASTM A335 P91" is the difference between a weld repair that
   can be done and one that cannot. SHIC-F-TSG-25 carries it in the header
   block beside CLIENT LOCATION.

   It was typed on the CE, saved with it, and read back out of an imported
   workbook -- and then printed on exactly one of the three documents. On the
   printed CE and in the text summary it simply vanished, so the field looked
   like it went nowhere.

   All three carry it now, and none of them prints an empty row for a CE that
   has no material. */
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.js'), 'utf8');

let bad = 0;
const ck = (what, cond) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + what); if (!cond) bad++; };

console.log('CE material');

/* ---- it is a field on the CE, and it is saved ---- */
ck('the CE form has a MATERIAL field', /material: e\.target\.value/.test(app));
ck('which rides info, saved whole as one JSON column',
  fs.readFileSync(path.join(__dirname, '..', 'src', 'db.js'), 'utf8')
    .indexOf('shicInfo:JSON.stringify(e.info||{})') > 0);

/* ---- all three documents ---- */
const wb = app.slice(app.indexOf("['CLIENT NAME:', info.client]"), app.indexOf("['STATUS:', docStatus]") + 40);
ck('the workbook prints it', wb.indexOf("['MATERIAL:', info.material]") > 0);
ck('and skips the row when there is none',
  /if \(v === '' \|\| v === null \|\| v === undefined\) return;/.test(app));

const info = app.slice(app.indexOf('const infoTable = `<table'), app.indexOf('</table>`;', app.indexOf('const infoTable =')));
ck('the printed CE prints it', /MATERIAL:<\/td>/.test(info));
ck('on a full-width line, because a material spec is long',
  /MATERIAL:<\/td><td colspan="3">/.test(info));
ck('and prints no row at all when the CE has no material',
  /\$\{info\.material \? `<tr>/.test(info));
ck('it is escaped, like every other field on the sheet',
  /MATERIAL:<\/td><td colspan="3">\$\{esc\(info\.material\)\}/.test(info));
/* Placed where the form places it: under the client, above the quantity. */
ck('it sits between CLIENT LOCATION and ATTENTION, as the form has it',
  info.indexOf('CLIENT LOCATION') < info.indexOf('MATERIAL:') &&
  info.indexOf('MATERIAL:') < info.indexOf('ATTENTION:'));

const txt = app.slice(app.indexOf("a.row('PROJECT DESCRIPTION:'"), app.indexOf("a.row('DISCIPLINE:'"));
ck('the text summary prints it', /a\.row\('MATERIAL:', info\.material\)/.test(txt));
ck('and only when there is one', /if \(info\.material\) a\.row\('MATERIAL:'/.test(txt));
ck('in the same place there too',
  txt.indexOf('CLIENT LOCATION') < txt.indexOf("'MATERIAL:'") &&
  txt.indexOf("'MATERIAL:'") < txt.indexOf('ATTENTION:'));

/* ---- and it survives a round trip through an exported workbook ---- */
ck('an imported CE reads the material back out of the header',
  /material=String\(row\[11\]\|\|''\)\.trim\(\)/.test(app));
ck('and keeps it on the CE it builds', /info:\{[^}]*material,/.test(app));
ck('the AI extractor fills it too, so a quoted spec is not retyped',
  /'description', 'material'/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE material OK');
process.exit(bad ? 1 : 0);
