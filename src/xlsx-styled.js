/* Minimal styled-XLSX writer.

   The vendored SheetJS build reads cell styles but does not write them, so a
   workbook produced with XLSX.writeFile comes out as unformatted text -- which
   is exactly what the sales team could not work with. Rather than add a paid
   or heavier dependency, this writes the OOXML parts and the ZIP container by
   hand. Both are small: a spreadsheet is a handful of XML strings, and a ZIP
   with no compression is a header, the bytes, and a directory.

   Everything here is deterministic and dependency-free, in keeping with the
   rest of the app (no bundler, plain script tags).

   Usage:
     SHICXlsx.download('CE.xlsx', [{name, cols, merges, rows}])

   A row is an array of cells. A cell is null, a primitive, or
   {v, s, span}:  v = value, s = style name, span = merge this many columns
   to the right. */
(function (global) {
  'use strict';

  /* ---- styles ------------------------------------------------------------
     Style names map to cellXfs indices below. Keep the two lists in step. */
  var STYLES = ['base', 'title', 'label', 'val', 'secbar', 'th', 'td', 'tdc',
                'tdn', 'tot', 'totlbl', 'doc', 'tdnb', 'sec', 'valn', 'note'];
  var SID = {};
  STYLES.forEach(function (n, i) { SID[n] = i; });

  var STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="6">' +
      '<font><sz val="10"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="10"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="16"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><sz val="8"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="5">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FF808080"/></left><right style="thin"><color rgb="FF808080"/></right>' +
      '<top style="thin"><color rgb="FF808080"/></top><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="16">' +
      '<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
      '<xf xfId="0" numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>' +
      '<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0" applyFont="1"/>' +
      '<xf xfId="0" numFmtId="0" fontId="3" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="164" fontId="1" fillId="4" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="1" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1"/>' +
      '<xf xfId="0" numFmtId="164" fontId="1" fillId="0" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="5" fillId="0" borderId="0" applyFont="1"/>' +
      '<xf xfId="0" numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>' +
      '<xf xfId="0" numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /* ---- helpers ----------------------------------------------------------- */
  function esc(s) {
    /* Control characters are illegal in XML 1.0, and Excel rejects the whole
       file rather than skipping the offending cell -- so strip them. */
    return String(s).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[c];
    }).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(i) {
    var s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }
  function cellRef(r, c) { return colName(c) + (r + 1); }

  function sheetXml(sheet) {
    var rows = sheet.rows || [], out = [], merges = (sheet.merges || []).slice();

    rows.forEach(function (row, r) {
      if (!row || !row.length) return;
      var cells = [];
      row.forEach(function (cell, c) {
        if (cell === null || cell === undefined || cell === '') return;
        var v = cell, s = 0;
        if (typeof cell === 'object') {
          v = cell.v;
          s = SID[cell.s] || 0;
          if (cell.span > 0) merges.push(cellRef(r, c) + ':' + cellRef(r, c + cell.span));
        }
        if (v === null || v === undefined || v === '') {
          /* An empty cell still has to be written when it carries a style,
             otherwise a table's borders stop wherever a value happens to be
             blank. */
          if (!s) return;
          cells.push('<c r="' + cellRef(r, c) + '" s="' + s + '"/>');
        } else if (typeof v === 'number' && isFinite(v)) {
          cells.push('<c r="' + cellRef(r, c) + '" s="' + s + '"><v>' + v + '</v></c>');
        } else {
          cells.push('<c r="' + cellRef(r, c) + '" s="' + s + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>');
        }
      });
      if (cells.length) out.push('<row r="' + (r + 1) + '">' + cells.join('') + '</row>');
    });

    var cols = '';
    if (sheet.cols && sheet.cols.length) {
      cols = '<cols>' + sheet.cols.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      }).join('') + '</cols>';
    }
    var mg = merges.length
      ? '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>'
      : '';

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="14.4"/>' + cols +
      '<sheetData>' + out.join('') + '</sheetData>' + mg +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="portrait" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }

  /* ---- ZIP (stored, no compression) -------------------------------------- */
  var CRC = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = -1;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }

  function utf8(str) {
    if (global.TextEncoder) return new TextEncoder().encode(str);
    var s = unescape(encodeURIComponent(str)), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function zip(files) {
    var chunks = [], central = [], offset = 0;

    function u16(n) { return [n & 255, (n >> 8) & 255]; }
    function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]; }

    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      /* Bit 11 of the flags marks the name as UTF-8. Every path here is ASCII,
         but Excel is stricter about the flag than about the bytes. */
      var local = [].concat([0x50, 0x4B, 0x03, 0x04], u16(20), u16(0x800), u16(0), u16(0), u16(0),
                            u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      chunks.push(new Uint8Array(local), name, data);
      central.push(new Uint8Array([].concat([0x50, 0x4B, 0x01, 0x02], u16(20), u16(20), u16(0x800), u16(0),
                                            u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
                                            u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))),
                   name);
      offset += local.length + name.length + data.length;
    });

    var cdSize = central.reduce(function (t, c) { return t + c.length; }, 0);
    var end = new Uint8Array([].concat([0x50, 0x4B, 0x05, 0x06], u16(0), u16(0),
                                       u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    return new Blob(chunks.concat(central, [end]), {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }

  /* ---- build ------------------------------------------------------------- */
  function build(sheets) {
    /* Sheet names are limited to 31 characters and cannot contain : \ / ? * [ ]
       -- Excel treats a violation as a corrupt file, not a bad name. */
    var used = {};
    var names = sheets.map(function (s, i) {
      var n = String(s.name || ('Sheet' + (i + 1))).replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31) || ('Sheet' + (i + 1));
      while (used[n.toLowerCase()]) n = n.slice(0, 28) + '_' + (i + 1);
      used[n.toLowerCase()] = 1;
      return n;
    });

    var files = [
      {name: '[Content_Types].xml', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') + '</Types>'},
      {name: '_rels/.rels', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'},
      {name: 'xl/workbook.xml', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) {
          return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets></workbook>'},
      {name: 'xl/_rels/workbook.xml.rels', data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'},
      {name: 'xl/styles.xml', data: STYLES_XML}
    ];
    sheets.forEach(function (s, i) {
      files.push({name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s)});
    });
    return zip(files);
  }

  function download(filename, sheets) {
    var url = URL.createObjectURL(build(sheets));
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.SHICXlsx = {build: build, download: download, STYLES: STYLES};
})(typeof window !== 'undefined' ? window : this);
