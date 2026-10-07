/* The company logo on the workbook.
   ==================================
   The printed CE puts the company's logo in its header and falls back to the
   name in text when there is none. The workbook could only ever write the
   text, so the one document sales forward to a client was the one without
   the branding on it.

   A picture in an xlsx is not a cell value. It is a part in the package: the
   image itself under xl/media, a drawing part that anchors it to a cell, a
   relationship from the sheet to the drawing and another from the drawing to
   the image, and a content type for both. Get any one of them wrong and
   Excel does not show a broken picture -- it calls the whole file corrupt and
   offers to repair it, which means throwing the sheets away.

   So this builds a real workbook through the shipped writer, unzips it, and
   reads the parts back.

   Run: node tools/test-xlsx-logo.js */
'use strict';
const fs = require('fs');
const vm = require('vm');

let bad = 0;
const ck = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + x : '')); bad++; } };

/* The shipped writer, in a context with just the globals it uses. */
const ctx = { Blob, Uint8Array, Int32Array, TextEncoder, atob, console, document: undefined, URL: undefined };
ctx.global = ctx; ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext('(function(global){' + fs.readFileSync('src/xlsx-styled.js', 'utf8') + '})(this);', ctx);
const X = ctx.SHICXlsx;

/* A real 1x1 PNG. Its bytes are what must come out the other end: an image
   put through the text encoder is not a smaller image, it is a broken one. */
const PNG64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG64, 'base64');

/* The writer stores parts without compression, so a reader is a walk over the
   local headers. Using a zip library here would test the library. */
function unzip(buf) {
  const out = {};
  let o = 0;
  while (o + 4 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
    const size = buf.readUInt32LE(o + 18);
    const nlen = buf.readUInt16LE(o + 26), elen = buf.readUInt16LE(o + 28);
    const name = buf.slice(o + 30, o + 30 + nlen).toString('utf8');
    const data = buf.slice(o + 30 + nlen + elen, o + 30 + nlen + elen + size);
    out[name] = data;
    o += 30 + nlen + elen + size;
  }
  return out;
}
const build = async opts => {
  const blob = X.build([
    /* Sheet 1's first row is genuinely empty -- a styled blank cell is still
     written, so it would not exercise the row that has to be invented. */
    { name: 'CE Summary', cols: [40, 12], rows: [[], [{ v: 'COST ESTIMATE SUMMARY', s: 'title' }], ['CE No.:', 'SY3-CE-2026-0148']] },
    { name: 'BOTE', cols: [40, 12], rows: [[{ v: 'SY3', s: 'label' }], [{ v: 'Cord, Extension', s: 'td' }]] }
  ], opts);
  return unzip(Buffer.from(await blob.arrayBuffer()));
};

(async () => {
  console.log('with a logo:');
  const z = await build({ logo: 'data:image/png;base64,' + PNG64 });
  const names = Object.keys(z);

  ck('the image is a part of its own', !!z['xl/media/logo.png'], names.join(' '));
  /* The whole reason zip() had to learn about binary parts. */
  ck('and its bytes are the image, byte for byte',
    z['xl/media/logo.png'] && Buffer.compare(z['xl/media/logo.png'], PNG) === 0,
    z['xl/media/logo.png'] && z['xl/media/logo.png'].length + ' bytes vs ' + PNG.length);

  const T = z['[Content_Types].xml'].toString();
  ck('the package declares what a .png is', T.indexOf('<Default Extension="png" ContentType="image/png"/>') > 0);
  ck('and declares each drawing part',
    (T.match(/drawings\/drawing\d\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.drawing\+xml"/g) || []).length === 2);

  /* A worksheet owns its drawing. Two sheets pointing at one drawing part is
     a file Excel repairs by throwing the pictures away. */
  ck('every sheet has its own drawing part',
    !!z['xl/drawings/drawing1.xml'] && !!z['xl/drawings/drawing2.xml']);
  ck('but the image itself is stored once', names.filter(n => /^xl\/media\//.test(n)).length === 1);

  const s1 = z['xl/worksheets/sheet1.xml'].toString();
  ck('the sheet points at its drawing', s1.indexOf('<drawing r:id="rIdDr1"/>') > 0);
  /* An undeclared prefix is not a bad reference, it is a corrupt file. */
  ck('and declares the r: prefix it uses',
    s1.indexOf('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"') > 0);
  /* The schema fixes the order: drawing comes after pageSetup. */
  ck('the drawing element comes after pageSetup, as the schema requires',
    s1.indexOf('<drawing') > s1.indexOf('<pageSetup'));

  const r1 = z['xl/worksheets/_rels/sheet1.xml.rels'].toString();
  ck('the relationship id the sheet uses is the one that exists',
    r1.indexOf('Id="rIdDr1"') > 0 && r1.indexOf('Target="../drawings/drawing1.xml"') > 0, r1);
  const r2 = z['xl/worksheets/_rels/sheet2.xml.rels'].toString();
  ck('and sheet 2 points at drawing 2, not drawing 1',
    r2.indexOf('Target="../drawings/drawing2.xml"') > 0, r2);

  const dr = z['xl/drawings/_rels/drawing1.xml.rels'].toString();
  ck('the drawing points at the image', dr.indexOf('Target="../media/logo.png"') > 0, dr);
  const d1 = z['xl/drawings/drawing1.xml'].toString();
  ck('by the id the drawing embeds', d1.indexOf('r:embed="rId1"') > 0 && dr.indexOf('Id="rId1"') > 0);
  /* Pinned to A1 at its own size. A twoCellAnchor would be stretched by
     whatever column widths the sheet happens to use. */
  ck('it is anchored to A1', /<xdr:col>0<\/xdr:col>[\s\S]*?<xdr:row>0<\/xdr:row>/.test(d1));
  ck('at its own size, not stretched to the cell', d1.indexOf('oneCellAnchor') > 0);
  ck('and the drawing declares every prefix it uses',
    ['xmlns:xdr=', 'xmlns:a=', 'xmlns:r='].every(p => d1.indexOf(p) > 0));

  /* Row 1 has to be tall enough or the picture hangs over the title in row 2.
     Sheet 1's first row is empty -- that is what a sheet with a logo instead
     of a name looks like -- so the height has nowhere to live unless the row
     is written anyway. */
  ck('row 1 is given a height even when it holds nothing',
    /<row r="1" ht="30" customHeight="1"\/>/.test(s1), s1.slice(s1.indexOf('<sheetData'), s1.indexOf('<sheetData') + 120));
  const s2 = z['xl/worksheets/sheet2.xml'].toString();
  ck('and a row that does hold something keeps both its height and its cells',
    /<row r="1" ht="30" customHeight="1"><c /.test(s2), s2.slice(s2.indexOf('<row r="1"'), s2.indexOf('<row r="1"') + 60));

  console.log('\nwithout a logo, nothing changes:');
  const p = await build({});
  ck('no media part', !Object.keys(p).some(n => /^xl\/media\//.test(n)));
  ck('no drawing parts', !Object.keys(p).some(n => /drawing/.test(n)));
  ck('and the sheet carries no drawing element',
    p['xl/worksheets/sheet1.xml'].toString().indexOf('<drawing') < 0);
  ck('nor an unused row height',
    p['xl/worksheets/sheet1.xml'].toString().indexOf('customHeight') < 0);

  console.log('\na logo Excel cannot use is left out, not written badly:');
  /* An SVG is not an image to Excel. A workbook that opens without the logo
     is a great deal better than one it offers to repair. */
  for (const u of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'https://example.com/logo.png', '', 'data:image/png;base64,!!!not base64!!!']) {
    const w = await build({ logo: u });
    ck('  ' + (u.slice(0, 28) || '(empty)'), !Object.keys(w).some(n => /^xl\/media\//.test(n)));
  }

  console.log('\na JPEG logo works too:');
  const j = await build({ logo: 'data:image/jpeg;base64,' + PNG64 });
  ck('stored under its own extension', !!j['xl/media/logo.jpeg']);
  ck('and declared as a jpeg',
    j['[Content_Types].xml'].toString().indexOf('<Default Extension="jpeg" ContentType="image/jpeg"/>') > 0);

  console.log('\nand the header text gets out of its way:');
  const app = require('./lib/appsrc').plus(fs.readFileSync('src/App.js', 'utf8'));
  /* Drawn OVER A1, so the name underneath would show through it. */
  ck('the company name is not written under the logo',
    /co\.logo \? '' : \[co\.name, co\.sub\]\.filter\(Boolean\)\.join/.test(app));
  ck('and the workbook is told which logo to use', /logo: co\.logo \}\);/.test(app));

  /* The parts being right is not the same as the workbook still being
     readable. Excel is stricter than any library, but a package a real
     reader chokes on is certainly wrong. */
  console.log(String.fromCharCode(10) + 'and it is still a workbook a reader can open:');
  /* A browser bundle, loaded the way the page loads it. */
  const xctx = { console, Date, Math, JSON, Uint8Array, Buffer, TextDecoder, TextEncoder, process };
  xctx.global = xctx; xctx.window = xctx; xctx.self = xctx;
  vm.createContext(xctx);
  vm.runInContext(fs.readFileSync('vendor/xlsx.full.min.js', 'utf8'), xctx);
  const XLSX = xctx.XLSX;
  const wb = XLSX.read(Buffer.from(await X.build([
    { name: 'CE Summary', cols: [40, 12], rows: [[], [{ v: 'COST ESTIMATE SUMMARY', s: 'title' }], ['CE No.:', 'SY3-CE-2026-0148']] }
  ], { logo: 'data:image/png;base64,' + PNG64 }).arrayBuffer()), { type: 'buffer' });
  ck('the sheet is there', wb.SheetNames.join() === 'CE Summary', wb.SheetNames.join());
  ck('and the cells survived the extra parts',
    wb.Sheets['CE Summary']['B3'] && wb.Sheets['CE Summary']['B3'].v === 'SY3-CE-2026-0148',
    JSON.stringify(wb.Sheets['CE Summary']['B3']));

  console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nxlsx logo OK');
  process.exit(bad ? 1 : 0);
})();
