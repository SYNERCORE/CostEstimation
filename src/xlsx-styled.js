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
                'tdn', 'tot', 'totlbl', 'doc', 'tdnb', 'sec', 'valn', 'note',
                /* A breakdown line that sits UNDER a total, not beside it:
                   small, italic, grey. It must not be mistaken for another
                   item to be added -- which is exactly what happened when it
                   was styled the same as the items above it. */
                'tdsub', 'tdsubn',
                /* A note the sales team must not read past: bold, dark red.
                   Same weight and colour the printed CE gives it. */
                'noteimp',
                /* A bold line that wraps, for a main scope item. */
                'notebold'];
  var SID = {};
  STYLES.forEach(function (n, i) { SID[n] = i; });

  var STYLES_XML =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="8">' +
      '<font><sz val="10"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="10"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="16"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
      '<font><sz val="8"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
      /* Small, italic, grey: a subordinate line. */
      '<font><i/><sz val="8"/><color rgb="FF808080"/><name val="Calibri"/></font>' +
      /* Bold dark red: an important note. C00000 is Excel's own "Dark Red",
         so it survives a copy into another workbook as a named colour. */
      '<font><b/><sz val="10"/><color rgb="FFC00000"/><name val="Calibri"/></font>' +
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
    '<cellXfs count="20">' +
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
          /* tdsub: the breakdown label. tdsubn: its amount -- which the CE
         SUMMARY puts in its OWN column, never the TOTAL COST column, so
         selecting that column can only ever give the total. */
      '<xf xfId="0" numFmtId="0" fontId="6" fillId="0" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      '<xf xfId="0" numFmtId="164" fontId="6" fillId="0" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      /* noteimp: wraps and tops like `note`, but bold red. */
      '<xf xfId="0" numFmtId="0" fontId="7" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
      '<xf xfId="0" numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
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

  /* Row 1 has to be tall enough to hold the image, or the logo hangs down
     over the title in row 2. 30pt is the 40px the picture is drawn at. */
  var LOGO_ROW_ATTR = ' ht="30" customHeight="1"';
  function sheetXml(sheet, hasLogo) {
    var rows = sheet.rows || [], out = [], merges = (sheet.merges || []).slice();
    var firstRow = false;

    rows.forEach(function (row, r) {
      if (!row || !row.length) return;
      var cells = [], rowHt = 0;
      row.forEach(function (cell, c) {
        if (cell === null || cell === undefined || cell === '') return;
        var v = cell, s = 0;
        if (typeof cell === 'object') {
          v = cell.v;
          s = SID[cell.s] || 0;
          /* ht: the row is this tall (points). A wrapped cell in a merged range does not
             size its own row in Excel, so the caller says how tall the text needs. */
          if (cell.ht > rowHt) rowHt = cell.ht;
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
      if (cells.length) {
        if (r === 0) firstRow = true;
        out.push('<row r="' + (r + 1) + '"' + (hasLogo && r === 0 ? LOGO_ROW_ATTR : (rowHt ? ' ht="' + rowHt + '" customHeight="1"' : '')) + '>' + cells.join('') + '</row>');
      }
    });
    /* A sheet whose first row is empty -- which is what a sheet with a logo
       INSTEAD of a company name looks like -- writes no <row> at all, and
       then has nowhere to carry the height. */
    if (hasLogo && !firstRow) out.unshift('<row r="1"' + LOGO_ROW_ATTR + '/>');

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
      /* xmlns:r is declared always rather than only with a logo: an undeclared
         prefix on <drawing> is not a bad reference, it is a file Excel calls
         corrupt and refuses to open. */
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="14.4"/>' + cols +
      '<sheetData>' + out.join('') + '</sheetData>' + mg +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="portrait" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
      /* The schema fixes this order: <drawing> comes after <pageSetup>. Put it
         earlier and the workbook will not open. */
      (hasLogo ? '<drawing r:id="rIdDr1"/>' : '') +
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
      /* A part is text unless it is already bytes. An image run through utf8()
         is not a smaller image, it is a corrupt one: every byte above 0x7F
         becomes two, and Excel rejects the file. */
      var name = utf8(f.name), data = (f.data instanceof Uint8Array) ? f.data : utf8(f.data), crc = crc32(data);
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

  /* ---- logo --------------------------------------------------------------
     The company logo is held as a data: URL on the company record -- the same
     one the printed CE puts in its header. Excel wants it as a part in the
     package, anchored to a cell by a drawing.

     An SVG logo is not an image to Excel at all, and a logo that cannot be
     used is simply left out: the workbook still opens and still says who it
     is from, in the text the logo would have replaced. */
  function logoPart(url) {
    var m = /^data:image\/(png|jpe?g|gif);base64,([\s\S]+)$/i.exec(String(url || ''));
    if (!m || !global.atob) return null;
    var ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
    var bin;
    try { bin = global.atob(m[2].replace(/\s+/g, '')); } catch (e) { return null; }
    var b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return { ext: ext, bytes: b };
  }
  /* 9525 EMU to the pixel. 90x40 keeps the proportions of the block the
     printed CE reserves for it and fits the row height set above. */
  var LOGO_CX = 90 * 9525, LOGO_CY = 40 * 9525;
  function drawingXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      /* oneCellAnchor: pinned to A1 at its own size. A twoCellAnchor would be
         stretched by whatever column widths the sheet happens to use. */
      '<xdr:oneCellAnchor>' +
      '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>19050</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>9525</xdr:rowOff></xdr:from>' +
      '<xdr:ext cx="' + LOGO_CX + '" cy="' + LOGO_CY + '"/>' +
      '<xdr:pic>' +
      '<xdr:nvPicPr><xdr:cNvPr id="1" name="Logo" descr="Company logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
      '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
      '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + LOGO_CX + '" cy="' + LOGO_CY + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
      '</xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
  }

  /* ---- build ------------------------------------------------------------- */
  function build(sheets, opts) {
    /* opts.bar / opts.barText recolour the title bars (secbar), '#RRGGBB'. */
    var argb = function (h) { return 'FF' + String(h).replace('#', '').toUpperCase(); };
    var styles = STYLES_XML;
    if (opts && opts.bar) styles = styles.replace('<fgColor rgb="FF000000"/>', '<fgColor rgb="' + argb(opts.bar) + '"/>');
    if (opts && opts.barText) styles = styles.replace('<color rgb="FFFFFFFF"/>', '<color rgb="' + argb(opts.barText) + '"/>');
    /* Sheet names are limited to 31 characters and cannot contain : \ / ? * [ ]
       -- Excel treats a violation as a corrupt file, not a bad name. */
    var used = {};
    var names = sheets.map(function (s, i) {
      var n = String(s.name || ('Sheet' + (i + 1))).replace(/[:\\\/?*\[\]]/g, ' ').slice(0, 31) || ('Sheet' + (i + 1));
      while (used[n.toLowerCase()]) n = n.slice(0, 28) + '_' + (i + 1);
      used[n.toLowerCase()] = 1;
      return n;
    });

    var logo = (opts && opts.logo) ? logoPart(opts.logo) : null;

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
        }).join('') +
        (logo ? '<Default Extension="' + logo.ext + '" ContentType="image/' + logo.ext + '"/>' +
          sheets.map(function (s, i) {
            return '<Override PartName="/xl/drawings/drawing' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
          }).join('') : '') +
        '</Types>'},
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
      {name: 'xl/styles.xml', data: styles}
    ];
    sheets.forEach(function (s, i) {
      files.push({name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s, !!logo)});
    });
    /* One media part, but a drawing part PER SHEET: a worksheet owns its
       drawing, and two worksheets pointing at one drawing part is a file
       Excel repairs by throwing the pictures away. They all embed the same
       image, which is stored once. */
    if (logo) {
      files.push({name: 'xl/media/logo.' + logo.ext, data: logo.bytes});
      sheets.forEach(function (s, i) {
        files.push({name: 'xl/drawings/drawing' + (i + 1) + '.xml', data: drawingXml()});
        files.push({name: 'xl/drawings/_rels/drawing' + (i + 1) + '.xml.rels', data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.' + logo.ext + '"/>' +
          '</Relationships>'});
        files.push({name: 'xl/worksheets/_rels/sheet' + (i + 1) + '.xml.rels', data:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rIdDr1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + (i + 1) + '.xml"/>' +
          '</Relationships>'});
      });
    }
    return zip(files);
  }

  function download(filename, sheets, opts) {
    var url = URL.createObjectURL(build(sheets, opts));
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
