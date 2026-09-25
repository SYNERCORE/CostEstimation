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
const wb = app.slice(app.indexOf("['PROJECT TYPE:'"), app.indexOf("['STATUS:', docStatus]") + 40);
ck('the workbook prints it', wb.indexOf("['MATERIAL:', info.material]") > 0);
ck('beside the description it qualifies, not three rows below it',
  wb.indexOf("'PROJECT DESCRIPTION:'") < wb.indexOf("'MATERIAL:'") &&
  wb.indexOf("'MATERIAL:'") < wb.indexOf("'CLIENT NAME:'"));
ck('and skips the row when there is none',
  /if \(v === '' \|\| v === null \|\| v === undefined\) return;/.test(app));

const info = app.slice(app.indexOf('const infoTable = `<table'), app.indexOf('</table>`;', app.indexOf('const infoTable =')));
ck('the printed CE prints it', /MATERIAL:<\/td>/.test(info));
ck('in the right-hand cell of the description row, where the form has it',
  /PROJECT DESCRIPTION:[\s\S]{0,140}MATERIAL:/.test(info) &&
  info.indexOf('MATERIAL:') < info.indexOf('CLIENT NAME:'));
ck('it is escaped, like every other field on the sheet',
  /MATERIAL:<\/td><td>\$\{esc\(info\.material\|\|''\)\}/.test(info));
/* A form's cell stays on the paper when it is empty -- an approver reads a
   blank MATERIAL as "none stated", and a row that vanishes as an oversight. */
ck('the label stays on the paper even with nothing in it',
  info.indexOf('${info.material ?') < 0);
/* The tick rows are wide. Without this the first column is squeezed and
   every label in the block breaks over two lines. */
ck('no label in the header wraps onto two lines',
  ['PROJECT TYPE:', 'PROJECT DESCRIPTION:', 'CLIENT NAME:', 'ATTENTION:', 'END USER:',
   'MATERIAL:', 'CLIENT LOCATION:', 'CE TYPE:'].every(l =>
    new RegExp('class="b nw"[^>]*>' + l.replace('.', '\.')).test(info)));
ck('and the class it uses is really in the stylesheet',
  /\.nw\{white-space:nowrap\}/.test(app));

/* ---- PROJECT TYPE is ticked ---- */
const boxes = app.slice(app.indexOf('const tickRow = (opts, chosen)'), app.indexOf('const infoTable = `<table'));
ck('the printed CE has a PROJECT TYPE row', /PROJECT TYPE:<\/td>/.test(info));
ck('with a box per discipline, taken from CE_DISCIPLINES itself',
  /CE_DISCIPLINES\.map\(d => \(\{ k: d, t: d \}\)\)/.test(boxes));
ck('so a discipline added to the app gets a box and cannot go missing',
  require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'config.js'), 'utf8')
    .indexOf("const CE_DISCIPLINES = ['Electrical', 'Mechanical', 'Civil', 'General'];") > 0);
ck("the CE's own discipline is the one ticked", /, info\.projType\)/.test(boxes));
ck('ticked and empty are different glyphs', /&#9745;/.test(boxes) && /&#9744;/.test(boxes));

/* Where the work is done decides mobilization, the site incentive and whose
   power the tools draw. It was printed once, in a line of running text in the
   band above the table; it is ticked beside PROJECT TYPE now. */
ck('CE TYPE is stated beside it', /CE TYPE:<\/td>/.test(info));
/* Four boxes and a label did not fit the right-hand column -- the row ran off
   the sheet and the last type was cut in half. And unlike the discipline there
   is only ever one CE type on a CE, so there is nothing to choose between. */
ck('as the one type it is, not as boxes to choose from',
  /const kindBoxes = `<b>\$\{esc\(ceTypeLabel\(ceType\)\.toUpperCase\(\)\)\}<\/b>`/.test(boxes));
ck('labelled as the app labels it, not respelled here', /ceTypeLabel\(ceType\)/.test(boxes));
ck('and nothing is ticked for it', boxes.indexOf('tickRow(Object.keys(CE_CFG)') < 0);
ck('the tick helper is declared once and used once',
  (boxes.match(/const tickRow = /g) || []).length === 1 &&
  (boxes.match(/tickRow\(/g) || []).length === 1);
ck('and the match ignores case, so a stored "MECHANICAL" still ticks',
  /String\(chosen \|\| ''\)\.toLowerCase\(\) === String\(o\.k\)\.toLowerCase\(\)/.test(boxes));

const txt = app.slice(app.indexOf("a.row('PROJECT DESCRIPTION:'"), app.indexOf("a.row('DISCIPLINE:'"));
ck('the text summary prints it', /a\.row\('MATERIAL:', info\.material\)/.test(txt));
ck('and only when there is one', /if \(info\.material\) a\.row\('MATERIAL:'/.test(txt));
ck('in the same place there too -- straight under the description',
  txt.indexOf('PROJECT DESCRIPTION:') < txt.indexOf("'MATERIAL:'") &&
  txt.indexOf("'MATERIAL:'") < txt.indexOf('CLIENT NAME:'));

/* ---- and it survives a round trip through an exported workbook ---- */
ck('an imported CE reads the material back out of the header',
  /material=String\(row\[11\]\|\|''\)\.trim\(\)/.test(app));
ck('and keeps it on the CE it builds', /info:\{[^}]*material,/.test(app));
ck('the AI extractor fills it too, so a quoted spec is not retyped',
  /'description', 'material'/.test(app));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nCE material OK');
process.exit(bad ? 1 : 0);
