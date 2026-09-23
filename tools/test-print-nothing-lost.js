#!/usr/bin/env node
/* A generated CE printed 63 of its 281 tools and said nothing about the rest.

   A bill of quantities is a wrapper div holding a heading and its table. The
   paginator only ever cut a TABLE between its rows, so a wrapper taller than
   a sheet was laid down whole, and the sheet's own overflow:hidden swallowed
   everything below the foot of that page. Nothing was reported: the page
   simply ended and the next section began.

   This runs the real paginator -- lifted out of the generated HTML -- over a
   CE shaped like the one it happened to, in a small DOM of counted boxes, and
   asks the only question that matters: is every row still there?

   Run: node tools/test-print-nothing-lost.js */
'use strict';
const fs = require('fs');
const app = fs.readFileSync('src/App.js', 'utf8');
let bad = 0; const ck = (n, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n); if (!c) bad++; };

/* ---- a DOM just big enough for the paginator ---- */
const ROW = 16, HEADING = 20, AVAIL = 900;
let uid = 0;
function El(tag, h, label) {
  return {
    tagName: tag, nodeName: tag, children: [], parentNode: null, id: ++uid,
    _h: h || 0, label: label || '', className: '',
    style: {}, innerHTML: '',
    get rows() { const r = []; (function walk(n) { n.children.forEach(c => { if (c.tagName === 'TR') r.push(c); else walk(c); }); })(this); return r; },
    get offsetHeight() { return this.tagName === 'TR' ? this._h : this.children.reduce((s, c) => s + c.offsetHeight, this._h); },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i < 0) throw new Error('removeChild: not a child'); this.children.splice(i, 1); c.parentNode = null; return c; },
    querySelector(sel) { let f = null; (function walk(n) { n.children.forEach(c => { if (!f && c.className === sel.replace('.', '')) f = c; if (!f) walk(c); }); })(this); return f; },
    cloneNode(deep) { const c = El(this.tagName, this._h, this.label); c.className = this.className; if (deep) this.children.forEach(k => c.appendChild(k.cloneNode(true))); return c; },
    /* Where this box ends, measured from the top of the sheet body it is in. */
    getBoundingClientRect() {
      if (this.className === 'sbody') return { top: 0, bottom: AVAIL };
      let top = 0; const p = this.parentNode;
      if (p) { for (const c of p.children) { if (c === this) break; top += c.offsetHeight; } top += p.getBoundingClientRect().top; }
      return { top, bottom: top + this.offsetHeight };
    }
  };
}
const tr = label => { const t = El('TR', ROW, label); return t; };
const table = (label, n) => {
  const t = El('TABLE', 0, label); t.appendChild(tr(label + ' HEADINGS'));
  for (let i = 1; i <= n; i++) t.appendChild(tr(label + ' row ' + i));
  t.appendChild(tr(label + ' SUB TOTAL')); return t;
};
const blk = (label, n) => { const d = El('DIV', 0, label); d.className = 'blk'; d.appendChild(El('DIV', HEADING, label + ' heading')); d.appendChild(table(label, n)); return d; };

/* ---- the real paginator's put/split/fits/fresh ---- */
const pg = app.slice(app.indexOf('    const paginator = `(function(){'), app.indexOf('    })();`;'));
const code = pg.slice(pg.indexOf('        var sh = null, body = null, avail = 0;'), pg.indexOf('        fresh();\n        sections.forEach'));
const sheets = [];
const layout = sections => {
  sheets.length = 0;
  const run = new Function('sections', 'makeSheet', 'El', 'document',
    code.replace('function fresh(){ sh = sheet(); body = sh.querySelector(\'.sbody\'); avail = body.clientHeight; }',
      'function fresh(){ body = makeSheet(); avail = ' + AVAIL + '; }')
    + '\n fresh();\n sections.forEach(function(sec, si){ if (si) fresh(); [].slice.call(sec.children).forEach(put); });');
  run(sections, () => { const b = El('DIV', 0, 'sbody'); b.className = 'sbody'; sheets.push(b); return b; }, El,
    { createElement: t => El(t.toUpperCase(), 0, '') });
  const out = []; sheets.forEach(b => (function walk(n) { n.children.forEach(c => { if (c.tagName === 'TR') out.push(c.label); else walk(c); }); })(b));
  return out;
};

/* ---- the CE it happened to ---- */
const page1 = El('DIV', 0, 'bills');
[blk('TOOLS', 281), blk('MATERIALS', 74), blk('PPE', 21)].forEach(b => page1.appendChild(b));
const wanted = [];
(function walk(n) { n.children.forEach(c => { if (c.tagName === 'TR') wanted.push(c.label); else walk(c); }); })(page1);

const got = layout([page1]);
ck('a 281-row bill of tools inside its wrapper is laid out at all', got.length > 0);
const lost = wanted.filter(l => !got.includes(l) && l.indexOf('HEADINGS') < 0);
ck('and not one of its rows is dropped on the way', lost.length === 0);
if (lost.length) console.log('        lost ' + lost.length + ', first: ' + lost.slice(0, 3).join(' / '));
ck('the last tool is on a page, not below one', got.includes('TOOLS row 281'));
ck('so is the section that follows it', got.includes('MATERIALS row 74') && got.includes('PPE row 21'));
ck('and every sub total with them',
  ['TOOLS', 'MATERIALS', 'PPE'].every(s => got.includes(s + ' SUB TOTAL')));
ck('it takes the sheets it needs', sheets.length >= 6 && sheets.length <= 12);

/* ---- nothing is left hanging over the foot of a page ---- */
const over = sheets.filter(b => b.offsetHeight > AVAIL);
ck('no sheet holds more than a sheet can show', over.length === 0);
if (over.length) console.log('        ' + over.length + ' sheet(s) overflow, worst by ' + Math.max(...over.map(b => b.offsetHeight - AVAIL)) + 'px');

/* ---- and the pages are filled, not spent one row at a time ---- */
const perSheet = sheets.map(b => b.rows.length);
ck('a page carries the rows it has room for', Math.max(...perSheet) > 30);
ck('and none is squandered on a single row', perSheet.filter(n => n === 1).length === 0);

/* ---- the column headings repeat where a table carries on ---- */
ck('a table continued on the next page repeats its headings',
  got.filter(l => l === 'TOOLS HEADINGS').length > 1);

/* ---- an ordinary CE is not disturbed ---- */
const small = El('DIV', 0, 'small'); small.appendChild(blk('MANPOWER', 12));
const sg = layout([small]);
ck('a CE that fits on one page still takes one page', sheets.length === 1);
ck('with everything on it', sg.includes('MANPOWER row 12') && sg.includes('MANPOWER SUB TOTAL'));

console.log(bad ? '\n' + bad + ' FAILURE(S)' : '\nnothing lost in the print OK');
process.exit(bad ? 1 : 0);
