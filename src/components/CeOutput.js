/* The CE document generators: the printable CE (handleGenerateCE), the detailed Excel export (handleExportXLSX) and the CE export (handleExport).

   Moved out of App.js unchanged. Each maker below returns the function App used to declare in place; App calls
   makeX(() => ({ ...the names it reads... })) once per render. The names are read when the function is CALLED, not when it is made,
   so a function still sees the same values (and can reach ones declared further down App) exactly as the closure it replaces did. */

function makeHandleGenerateCE(getCtx) {
  return (opt) => {
    const {
      approvers,
      benefitRows,
      benefitsT,
      ceBreakdown,
      ceLayout,
      ceSections,
      ceType,
      demobVehicles,
      demobVehiclesT,
      grand,
      hlAmt,
      hlLabel,
      hlRows,
      incOn,
      info,
      kwhRate,
      margin,
      mats,
      matsT,
      miscCosted,
      miscT,
      mobVehicles,
      mobVehiclesT,
      monData,
      mp,
      mpTot,
      notes,
      openCeId,
      perJobLbl,
      perJobT,
      powerOn,
      ppe,
      ppeT,
      pwrFrac,
      qtyUom,
      rceNo,
      rr,
      servicesSummary,
      showUnitP,
      signatures,
      sowItems,
      sowLabels,
      toolBasis,
      tools,
      toolsT,
      unitLbl,
      unitP
    } = getCtx();
    /* Generate CE without the amounts: the same document -- scope, quantities, days, rates' columns -- with every money figure left blank, for
       a copy that goes to someone who should see what is being done but not what it costs. fmt is the one place a peso amount is written, so
       blanking it blanks them all; dropTotals then removes the total, unit-price, margin and highlighted-cost lines, which would be labels with
       nothing beside them (a sub total that counts people stays, it holds no money). */
    const noAmt = !!(opt && opt.noAmounts);
    const dropTotals = html => !noAmt ? html : html.replace(/<tr class="tot"[^>]*>[\s\S]*?<\/tr>|<div class="tot"[^>]*>[\s\S]*?<\/div>/g, m => {
      const t = m.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\([^)]*\)/g, ' ');
      return (!/\d/.test(t) || /SELLING PRICE|margin/i.test(t)) ? '' : m;
    });
    const fmt = (n, d = 2) => noAmt ? '' : 'P' + N(n).toLocaleString('en-PH', {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
    const ph2 = n => N(n).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const allCos = getCompanies();
    const coInfo = allCos.find(c => String(c.id) === String(info.companyId)) || allCos[0] || {};
    const _br = ceBrand(coInfo);
    const pageStyle = `
      /* Zero: every sheet carries its own margins as padding, so what is on
         screen is exactly what leaves the printer. */
      @page{size:A4 portrait;margin:0}
      *{box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:8pt;color:#000;margin:0;padding:0}
      table{width:100%;border-collapse:collapse}
      td,th{border:1px solid #555;padding:1.5px 4px;font-size:7.5pt;vertical-align:middle}
      .nb td,.nb th{border:none} .bdr td,.bdr th{border:1px solid #999}
      .page{padding:0;margin-bottom:4mm}
      .page-break{page-break-before:always;padding-top:0}
      .blk{page-break-inside:avoid;margin-bottom:5px}
      h2{font-size:10pt;text-align:center;margin:2px 0;font-weight:bold}
      .sec{background:${_br.bar};color:${_br.text};font-weight:bold;text-align:center;padding:3px;font-size:8pt}
      .sub{background:#eee;font-weight:bold;font-size:7.5pt;padding:2px 4px}
      .r{text-align:right} .c{text-align:center} .b{font-weight:bold}
      /* Header labels never wrap: the tick rows are wide, and a label
         broken over two lines makes the whole block a row taller. */
      .nw{white-space:nowrap}.impn{color:#C00000;font-weight:700}
      .tot{background:#f5f5f5;font-weight:bold}
      .sig td{border:none;text-align:center;padding:0 6px;vertical-align:bottom}
      /* The document is laid out into real A4 sheets before printing, each
         carrying its own header and footer. A position:fixed running header is
         drawn wherever the printer's own margins happen to fall -- which is how
         a footer ended up struck through the middle of a table -- and HTML has
         no way to count pages, so "Page 3 of 12" was impossible that way. */
      .sheet{width:210mm;height:297mm;padding:9mm 7mm 8mm;display:flex;flex-direction:column;overflow:hidden;background:#fff;page-break-after:always;break-after:page}
      .sheet:last-child{page-break-after:auto;break-after:auto}
      .sbody{flex:1;min-height:0;overflow:hidden}
      .run-hdr,.run-ftr{font-size:6.5pt;color:#333;display:flex;justify-content:space-between;gap:8px;flex:none}
      .run-hdr{display:block;font-size:inherit;color:inherit;margin-bottom:2mm}
      .run-ftr{border-top:.5pt solid #999;padding-top:2px;margin-top:3mm}
      @media screen{body{background:#e9e9ee}.sheet{margin:0 auto 8px;box-shadow:0 1px 6px rgba(0,0,0,.25)}}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    `;
    /* The Synercore names are the fallback for having NO company record at
       all -- a first run, before the Company DB is filled in. They are not a
       fallback for a field left blank on some other company: SY3 with no
       subtitle set printed "SY3 - HEAVY INDUSTRIES CORP.", putting another
       company's name on its own documents. */
    const _hasCo = !!(coInfo && (coInfo.name || coInfo.sub || coInfo.logo || coInfo.id));
    const co = {
      name:    coInfo.name    || (_hasCo ? '' : 'SYNERCORE'),
      sub:     coInfo.sub     || (_hasCo ? '' : 'HEAVY INDUSTRIES CORP.'),
      doc:     coInfo.docNo   || coInfo.doc || 'SHIC-F-TSG025',
      revNo:   coInfo.revNo   || '0',
      revDate: coInfo.revDate || '',
      logo:    coInfo.logo    || '',
      color:   coInfo.color   || '#cc0000'
    };
    const logoCell = co.logo
      ? `<img src="${esc(co.logo)}" width="70" height="36" style="width:70px;height:36px;object-fit:contain">`
      : `<div style="font-weight:900;font-size:10pt;color:${esc(co.color)};line-height:1.1">${esc(co.name)}<br><span style="font-size:6pt">${esc(co.sub)}</span></div>`;

    /* The logo / title / document-number block. It is the header of every
       printed page (the paginator puts it on each sheet), so the sections below
       carry only their own title bar. The right column was 150px with the
       labels fixed at 80px, which wrapped "SY3-F-TSG-025" onto two lines on a
       page with room to spare; it is sized to its content and never wraps. */
    const docTop = `<table style="border:1px solid #000;font-size:7.5pt"><tr>
      <td style="border:none;width:75px;padding:2px">${logoCell}</td>
      <td style="border:none;text-align:center"><h2>COST ESTIMATE SUMMARY</h2></td>
      <td style="border:none;width:1%;white-space:nowrap;font-size:7pt;padding:2px 6px">
        <table class="nb" style="width:auto"><tr><td style="border:none;white-space:nowrap;padding-right:8px">Document No.:</td><td style="border:none;white-space:nowrap">${esc(co.doc)}</td></tr>
        <tr><td style="border:none;white-space:nowrap;padding-right:8px">Revision No.:</td><td style="border:none;white-space:nowrap">${esc(co.revNo)}</td></tr>
        <tr><td style="border:none;white-space:nowrap;padding-right:8px">Revision Date:</td><td style="border:none;white-space:nowrap">${esc(co.revDate)}</td></tr></table>
      </td></tr></table>`;
    const docHdr = title => `<table style="border:1px solid #000;margin-bottom:4px;font-size:7.5pt">
      <tr><td colspan="3" style="text-align:center;background:${_br.bar};color:${_br.text};font-weight:bold;font-size:9pt;padding:3px;border:1px solid #000">${title}</td></tr>
      <tr><td colspan="3" style="border:none;font-size:7.5pt;padding:1px 4px"><div style="display:flex;justify-content:space-between;gap:8px"><span><b>CE TYPE:</b>&nbsp;${esc(ceTypeLabel(ceType).toUpperCase())}</span><span>${rceNo ? '<b>RCE No.:</b>&nbsp;' + esc(rceNo) + '&nbsp;&nbsp;' : ''}<b>CE No.:</b>&nbsp;${esc(info.ceNum || '')}&nbsp;&nbsp;<b>DATE:</b>&nbsp;${esc(info.date||'')}</span></div></td></tr>
    </table>`;

    /* PROJECT TYPE is ticked, not spelled out, because that is how the form is
       read: an approver looks for which box is marked. The boxes are
       CE_DISCIPLINES itself, so a discipline added there gets a box here and
       cannot go missing from the paper. */
    /* The chosen option has to be unmistakable at a glance on a printed sheet:
       a ticked box that looks like the empty ones, beside labels that are all
       bold, left an approver reading every word to find which was meant. The
       choice is a filled black label with a cross; the others are plain grey.
       print-color-adjust keeps the fill when the browser would drop backgrounds. */
    const tickRow = (opts, chosen) => opts.map(o => {
      const on = String(chosen || '').toLowerCase() === String(o.k).toLowerCase();
      return on
        ? `<span style="white-space:nowrap;margin-right:14px;background:#000;color:#fff;padding:1px 7px;border-radius:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact">&#9746;&nbsp;<b>${esc(String(o.t).toUpperCase())}</b></span>`
        : `<span style="white-space:nowrap;margin-right:14px;color:#777">&#9744;&nbsp;${esc(String(o.t).toUpperCase())}</span>`;
    }).join('');
    const typeBoxes = tickRow(CE_DISCIPLINES.map(d => ({ k: d, t: d })), info.projType);
    /* Whether the work is done in our shop or away on the client's site is
       the other thing an approver checks first: it decides mobilization, the
       site incentive and whose power the tools draw. Ticked like the
       discipline at first, but four boxes and a label would not fit the
       right-hand column and ran off the sheet -- and unlike the discipline
       there is only ever one CE type, so there is nothing to choose between:
       the one it is, stated. */
    const kindBoxes = `<b>${esc(ceTypeLabel(ceType).toUpperCase())}</b>`;

    const infoTable = `<table class="bdr" style="margin-bottom:5px;font-size:7.5pt">
      <tr><td class="b nw" style="width:110px">PROJECT TYPE:</td><td>${typeBoxes}</td><td class="b nw">CE TYPE:</td><td>${kindBoxes}</td></tr>
      <tr><td class="b nw">PROJECT DESCRIPTION:</td><td class="b c">${esc(info.description||'')}</td><td class="b nw">MATERIAL:</td><td>${esc(info.material||'')}</td></tr>
      <tr><td class="b nw">CLIENT NAME:</td><td>${esc(info.client||'')}</td><td class="b nw">CLIENT LOCATION:</td><td>${esc(info.location||'')}</td></tr>
      <tr><td class="b nw">ATTENTION:</td><td>${esc(info.attention||'SALES DEPARTMENT')}</td><td class="b">QUANTITY:</td><td>${esc(info.qty||1)} ${esc(qtyUom)}</td></tr>
      <tr><td class="b nw">END USER:</td><td>${esc(info.endUser||'C/O SALES')}</td><td class="b">NO. OF DAYS:</td><td>${esc(info.days||'')} DAYS</td></tr>
    </table>`;

    /* Cost summary -- only the sections this CE actually uses.

       The sub-rows read `misc.transport` as a number. Miscellaneous holds a
       LIST OF ROWS per category, so every one of those came out NaN, every
       category tested as empty, and the whole Miscellaneous section vanished
       from the printed CE -- while its cost stayed inside the total, which is
       the worst of both: a document whose parts do not add up to its sum.
       The parts now come from ceBreakdown, which every renderer reads. */
    const costRows = ceSections.filter(x => x.v > 0).map(x => ({
      letter: x.letter,
      label: x.printLabel,
      v: x.v,
      sub: ceBreakdown[x.printLabel] || null
    }));

    const costTable = `<table style="margin-bottom:5px">
      <tr style="background:${_br.bar};color:${_br.text}"><th class="c" style="width:40px">ITEM</th><th>DESCRIPTION</th><th class="r" style="width:110px">TOTAL COST</th></tr>
      ${costRows.map(r=>`<tr>
        <td class="c b">${r.letter}</td>
        <td class="b">${r.label}</td>
        <td class="r">${r.sub && !ceLayout.parentCarries ? '' : fmt(r.v)}</td>
      </tr>${r.sub?r.sub.map(s=>ceLayout.parentCarries
        ? `<tr><td class="c"></td><td style="padding-left:16px;font-size:7pt;font-style:italic;color:#555"><div style="display:flex;justify-content:space-between;gap:12px"><span>of which&nbsp; ${s.letter}&nbsp; ${esc(s.label)}</span><span>${fmt(s.v)}</span></div></td><td class="r"></td></tr>`
        : `<tr><td class="c"></td><td class="b" style="padding-left:22px">${s.letter}.&nbsp; ${esc(s.label)}</td><td class="r">${fmt(s.v)}</td></tr>`).join(''):''}
      `).join('')}
      <tr class="tot"><td colspan="2" class="b r" style="font-size:9pt">TOTAL AMOUNT:</td><td class="r b" style="font-size:9pt">${fmt(grand)}</td></tr>
      ${showUnitP ? `<tr class="tot"><td colspan="2" class="b r">${esc(unitLbl)}</td><td class="r b">${fmt(unitP)}</td></tr>` : ''}
      ${showUnitP && perJobT ? `<tr class="tot"><td colspan="2" class="b r">${esc(perJobLbl)}</td><td class="r b">${fmt(perJobT)}</td></tr>` : ''}
      ${margin !== 0 ? `<tr class="tot" style="background:#e8f5e9"><td colspan="2" class="b r">SELLING PRICE (${margin > 0 ? '+' : ''}${margin}% margin):</td><td class="r b">${fmt(grand*(1+margin/100))}</td></tr>` : ''}
      ${hlRows.length && !noAmt ? `<tr><td colspan="3" class="c b" style="background:#ddd;font-size:7.5pt">HIGHLIGHTED COSTS (already included above)</td></tr>` + hlRows.map(r=>`<tr class="tot"><td colspan="2" class="b r">${esc(hlLabel(r).toUpperCase())}:</td><td class="r b">${fmt(hlAmt(r))}</td></tr>`).join('') : ''}
      ${servicesSummary.on && servicesSummary.ok && !noAmt ? `<tr><td colspan="3" class="c b" style="background:#ddd">SERVICES</td></tr>
      ${servicesSummary.lines.map(l=>`<tr><td colspan="2" class="b r">${esc(l.label.toUpperCase())}:</td><td class="r">${fmt(l.v)}</td></tr>`).join('')}
      ${Math.abs(servicesSummary.other) >= 0.005 ? `<tr><td colspan="2" class="b r">OTHER MISC. TO THE PROJECT:</td><td class="r">${fmt(servicesSummary.other)}</td></tr>` : ''}
      <tr class="tot"><td colspan="2" class="b r" style="font-size:9pt">SERVICES TOTAL AMOUNT:</td><td class="r b" style="font-size:9pt">${fmt(servicesSummary.total)}</td></tr>` : ''}
    </table>`;

    /* Breakdown notes written on the SOW Breakdown tab print with the CE notes,
       after the manually written ones, each labelled with its scope number. */
    const sowNotes = (sowItems || []).filter(s => String(s.note || '').trim());
    const notesList = (notes.length || sowNotes.length) ? `<div style="margin-top:4px"><b>NOTE:</b><ol style="margin:1px 0 0 14px;padding:0;font-size:7.5pt">${notes.map(n=>`<li${n.imp?' class="impn"':''}>${esc(n.text)}</li>`).join('')}${sowNotes.map(s=>`<li><b>Scope ${esc(sowLabels[s.id]||'')}</b> &#8212; ${esc(String(s.note).trim())}</li>`).join('')}</ol></div>` : '';
    /* Four signatories to a row. Seven in a single row left each about 2cm
       wide and shrank every signature image to match; the sheet is the same
       width whatever the routing is, so the row has to wrap instead. */
    const SIG_PER_ROW = 4;
    const sigRows = [];
    for (let i = 0; i < approvers.length; i += SIG_PER_ROW) sigRows.push(approvers.slice(i, i + SIG_PER_ROW));
    /* Only the signatures this approval actually stands on -- see apvVisibleSigs. */
    const sigShow = apvVisibleSigs(approvers, info.approval, signatures);
    const sigCell = (a, i) => {
      const sigImg = sigShow[a.id || i] ? `<img src="${sigShow[a.id || i]}" style="height:52px;max-width:100%;display:block;margin:0 auto 2px"/>` : '';
      const line = a.id && info.approval && (info.approval.lines || {})[a.id];
      return `<td style="border:1px solid #000;padding:4px 8px;vertical-align:bottom"><div style="min-height:50px;text-align:center">${sigImg}</div><div style="border-top:1px solid #000;padding-top:3px;text-align:center"><b style="font-size:8pt">${esc((line || {}).byName || a.name || '')}</b><br><span style="font-size:7.5pt">${esc(a.title || a.role || '')}</span></div></td>`;
    };
    const sigBlock = sigRows.map((row, ri) => {
      /* A short last row keeps the cell width of a full one, so four
         signatories and five do not draw at different sizes. */
      const pad = ri ? Array(SIG_PER_ROW - row.length).fill('<td style="border:none"></td>').join('') : '';
      return `<table style="width:100%;border-collapse:collapse;margin-top:${ri ? 8 : 20}px;table-layout:fixed;page-break-inside:avoid" class="sig">
      <tr>${row.map(a => `<td style="border:1px solid #000;padding:4px 8px;font-size:8pt;font-weight:bold;vertical-align:top"><b>${esc(a.role)}:</b></td>`).join('')}${pad}</tr>
      <tr>${row.map((a, i) => sigCell(a, ri * SIG_PER_ROW + i)).join('')}${pad}</tr>
    </table>`;
    }).join('');

    /* Manpower &#8212; skip zero-rate rows */
    const mpActive = mp.filter(r=>N(r.rate)>0||String(r.role||'').trim());
    const shiftKeys = [...new Set(mpActive.map(r=>r.shift||'straight'))];
    const shiftRows = shiftKeys.map(sk=>{
      const rows=mpActive.filter(r=>(r.shift||'straight')===sk);
      if(!rows.length)return'';
      const info2=SHIFTS[sk];const mult=ceShiftMult(rr, sk);const _otM=ceOtMult(rr);
      const subA=rows.reduce((s,r)=>s+N(r.pax)*N(r.days)*N(r.rate)*mult,0);
      const subB=rows.reduce((s,r)=>s+N(r.pax)*N(r.days)*(N(r.otHours)/8)*N(r.rate)*_otM*mult,0);
      return`<div class="sub">${info2?.label||sk.toUpperCase()}</div>
      <table><tr style="background:#eee"><th class="c" style="width:28px">ITEM</th><th>MANPOWER LOADING</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:30px">UOM</th><th class="c" style="width:36px">DAYS</th><th class="r" style="width:60px">RATE/DAY</th><th class="r" style="width:70px">SUBTOTAL</th><th class="c" style="width:34px">OT HRS/DAY</th><th class="c" style="width:30px">AOT</th><th class="r" style="width:55px">RATE OT</th><th class="r" style="width:70px">TOTAL</th></tr>
      ${rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.role||'')}</td><td class="c">${esc(r.pax||1)}</td><td class="c">pax</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.rate)}</td><td class="r">${fmt(N(r.pax)*N(r.days)*N(r.rate)*mult)}</td>${/* AOT is the ACCUMULATED overtime on the printed form: the reader multiplies
      this column by RATE OT. otHours is now per day, so the total is what
      belongs here -- printing the per-day figure would understate the row
      against its own TOTAL column. */''}<td class="c">${esc(N(r.otHours)||0)}</td><td class="c">${esc(N(r.otHours)*N(r.days)||0)}</td><td class="r">${fmt(N(r.rate)/8*_otM*mult)}</td><td class="r b">${fmt(N(r.pax)*N(r.days)*N(r.rate)*mult+N(r.pax)*N(r.days)*(N(r.otHours)/8)*N(r.rate)*_otM*mult)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2" class="r b">SUB TOTAL:</td><td class="c b">${esc(rows.reduce((s,r)=>s+N(r.pax),0))}</td><td colspan="7"></td><td class="r b">${fmt(subA+subB)}</td></tr></table>`;
    }).join('');

    /* Benefits &#8212; the same rows the Manpower tab shows */
    const benPage=benefitRows.length?`<div class="blk">
      <div class="sec">C.7 &nbsp;BENEFITS AND OTHERS</div>
      <table><tr style="background:#eee"><th class="c">ITEM</th><th>MANPOWER LOADING</th><th class="c">QTY</th><th class="c">UOM</th><th class="c">TOTAL DAYS</th><th class="r">MONTHLY RATE</th><th class="r">13TH PAY</th><th class="r">SSS</th><th class="r">HDMF&amp;PHIC</th><th class="r">SIL</th><th class="r">ECC</th>${incOn?'<th class="r">INCENTIVE</th>':''}<th class="r">TOTAL</th></tr>
      ${benefitRows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.role||'')}</td><td class="c">${esc(r.pax)}</td><td class="c">pax</td><td class="c">${esc(r.days)}</td><td class="r">${fmt(r.monthlyRate)}</td><td class="r">${fmt(r.thirteenth)}</td><td class="r">${fmt(r.sss)}</td><td class="r">${fmt(r.hdmf)}</td><td class="r">${fmt(r.sil-(r.ecc||0))}</td><td class="r">${fmt(r.ecc||0)}</td>${incOn?`<td class="r">${fmt(r.perdiem)}</td>`:''}<td class="r b">${fmt(r.total)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2" class="r b">TOTAL MANPOWER:</td><td class="c b">${esc(benefitRows.reduce((t,r)=>t+N(r.pax),0))}</td><td colspan="${incOn?9:8}" class="r b">BENEFITS &amp; OTHERS SUB TOTAL:</td><td class="r b">${fmt(benefitsT)}</td></tr>
      <tr class="tot"><td colspan="${incOn?12:11}" class="r b">TOTAL MANPOWER COST (C.1-C.7):</td><td class="r b">${fmt(mpTot)}</td></tr></table></div>` : '';

    /* Tools &#8212; skip zero rows */
    const toolsActive=tools.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const toolsPage=toolsActive.length?`<div class="blk">
      <div class="sec">BILL OF TOOLS AND EQUIPMENT</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:35px">UOM</th><th class="c" style="width:52px">BASIS</th>${powerOn?'<th class="r" style="width:64px">POWER</th>':''}<th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${toolsActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="c">${esc(toolBasis(r))}</td>${powerOn?`<td class="r">${(toolPowerCost(r, kwhRate) * pwrFrac(r))>0?fmt((toolPowerCost(r, kwhRate) * pwrFrac(r))):'&#8212;'}</td>`:''}<td class="r">${fmt(toolUnitRate(r))}</td><td class="r b">${fmt(toolRowTotal(r, kwhRate, undefined, pwrFrac(r)))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="${powerOn?7:6}" class="r b">TOTAL:</td><td class="r b">${fmt(toolsT)}</td></tr></table></div>` : '';

    /* Materials &#8212; skip zero rows */
    const matsActive=mats.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const matsPage=matsActive.length?`<div class="blk">
      <div class="sec">BILL OF MATERIALS AND CONSUMABLES</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${matsActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.cost))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r b">TOTAL:</td><td class="r b">${fmt(matsT)}</td></tr></table></div>` : '';

    /* PPE &#8212; skip zero rows */
    const ppeActive=ppe.filter(r=>r.desc&&(N(r.cost)>0||r.desc.trim()));
    const ppePage=ppeActive.length?`<div class="blk">
      <div class="sec">PERSONAL PROTECTIVE EQUIPMENTS</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${ppeActive.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.cost))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r b">TOTAL:</td><td class="r b">${fmt(ppeT)}</td></tr></table></div>` : '';

    /* Miscellaneous &#8212; grouped by category, one row per entry.

       Labour, tools, materials, PPE and the scope each print their own bill
       page; Miscellaneous never did. Its cost reached the summary and the
       total, but a delivery charge or a third-party fee had no line anywhere
       in the document saying what the client was being charged for. */
    /* The Miscellaneous page itemises the rows under each category, which
       it does whichever summary layout the CE prints. */
    const miscItems = miscCosted;
    const miscPage=miscItems.length?`<div class="blk">
      <div class="sec">MISCELLANEOUS</div>
      ${miscItems.map(cat=>`<div class="sub">${cat.letter}&nbsp;&nbsp;${esc(cat.label)}</div>
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:35px">UOM</th><th class="c" style="width:36px">NO. OF DAYS</th><th class="r" style="width:80px">UNIT PRICE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${cat.rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.uom||'Lot')}</td><td class="c">${esc(N(r.days)||1)}</td><td class="r">${fmt(r.cost||0)}</td><td class="r b">${fmt(miscRowCost(r))}</td></tr>${(Array.isArray(r.parts)?r.parts:[]).map(p=>`<tr style="font-size:7pt;color:#555"><td></td><td style="padding-left:14px">&#8211; ${esc(p.label)}</td><td class="c">${esc(N(p.qty))}</td><td></td><td class="c">${esc(N(p.days))}</td><td></td><td class="r">${fmt(N(r.cost)*N(p.qty)*N(p.days))}</td></tr>`).join('')}`).join('')}
      <tr class="tot"><td colspan="6" class="r b">SUB TOTAL:</td><td class="r b">${fmt(cat.v)}</td></tr></table>`).join('')}
      <div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">MISCELLANEOUS TOTAL: ${fmt(miscT)}</div></div>` : '';

    /* The summary and the scope of work each get a sheet of their own; the
       bills share whatever space is left.

       Every bill used to be its own `page-break` page, so a CE with three
       plywood lines and one delivery charge spent a whole sheet per section
       and printed mostly white space. They are `blk` blocks now: they flow one
       after another and break only when the paper actually runs out, with
       page-break-inside:avoid so a short bill is not split across that break.
       The document header prints once for the run rather than per section --
       each bill still carries its own black title bar. */
    const mpPage=mpActive.length?`<div class="blk"><div class="sec">MANPOWER COST</div>${shiftRows}<div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">TOTAL MANPOWER COST: ${fmt(mpTot)}</div></div>`:'';
    /* Mobilization and demobilization -- costed into the total but never
       printed, so the client saw a charge with no line saying what it was. */
    const mobRows=(rows)=>(rows||[]).filter(r=>String(r.desc||'').trim()||N(r.rate)>0);
    const _otMm=ceOtMult(rr);
    const mobMpTable=(rows)=>{const m=rows.filter(r=>r.kind==='mp');return m.length?`<table><tr style="background:#eee"><th class="c" style="width:28px">ITEM</th><th>MANPOWER LOADING</th><th class="c" style="width:28px">QTY</th><th class="c" style="width:32px">UOM</th><th class="c" style="width:36px">NO. OF DAYS</th><th class="r" style="width:60px">RATE PER DAY</th><th class="r" style="width:66px">SUB-TOTAL A</th><th class="c" style="width:36px">OT HRS PER DAY</th><th class="r" style="width:55px">RATE OT/HR</th><th class="r" style="width:62px">SUB-TOTAL B</th><th class="r" style="width:70px">TOTAL</th></tr>
      ${m.map((r,i)=>{const a=N(r.qty)*N(r.days)*N(r.rate),b=mobRowCost(r,rr)-a;return`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">PAX/S</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.rate||0)}</td><td class="r">${fmt(a)}</td><td class="c">${esc(N(r.otHours))}</td><td class="r">${fmt(N(r.rate)/8*_otMm)}</td><td class="r">${fmt(b)}</td><td class="r b">${fmt(a+b)}</td></tr>`;}).join('')}
      <tr class="tot"><td colspan="2" class="r b">SUB TOTAL:</td><td class="c b">${esc(m.reduce((s,r)=>s+N(r.qty),0))}</td><td colspan="7"></td><td class="r b">${fmt(m.reduce((s,r)=>s+mobRowCost(r,rr),0))}</td></tr></table>`:'';};
    const mobTable=(label,all,tot)=>{const rows=all.filter(r=>r.kind!=='mp');return all.length?`<div class="sub">${label}</div>${mobMpTable(all)}${rows.length?`
      <table><tr style="background:#eee"><th class="c" style="width:30px">ITEM</th><th>DESCRIPTION</th><th class="c" style="width:35px">QTY</th><th class="c" style="width:36px">DAYS</th><th class="r" style="width:80px">RATE</th><th class="r" style="width:80px">TOTAL</th></tr>
      ${rows.map((r,i)=>`<tr><td class="c">${i+1}</td><td>${esc(r.desc||'')}</td><td class="c">${esc(r.qty||1)}</td><td class="c">${esc(r.days||1)}</td><td class="r">${fmt(r.rate||0)}</td><td class="r b">${fmt(N(r.qty)*N(r.days)*N(r.rate))}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5" class="r b">SUB TOTAL:</td><td class="r b">${fmt(rows.reduce((s,r)=>s+mobRowCost(r,rr),0))}</td></tr></table>`:''}<div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">${label} TOTAL: ${fmt(tot)}</div>`:'';};
    const _mobR=mobRows(mobVehicles),_demobR=mobRows(demobVehicles);
    const mobPage=(_mobR.length||_demobR.length)?`<div class="blk">
      <div class="sec">MOBILIZATION / DEMOBILIZATION</div>
      ${mobTable('MOBILIZATION',_mobR,mobVehiclesT)}${mobTable('DEMOBILIZATION',_demobR,demobVehiclesT)}
      <div class="tot" style="text-align:right;padding:3px 4px;font-weight:bold">MOBILIZATION / DEMOBILIZATION TOTAL: ${fmt(mobVehiclesT+demobVehiclesT)}</div></div>`:'';
    const bills=dropTotals([mobPage,mpPage,benPage,toolsPage,matsPage,ppePage,miscPage].filter(Boolean).join(''));
    const billsPage=bills?`<div class="page page-break">${docHdr('BILL OF QUANTITIES')}${bills}</div>`:'';

    const sowPage=sowItems.length?`<div class="page page-break">${docHdr('SCOPE OF WORK')}<div style="font-size:8pt;line-height:1.6">${(()=>{let mc=0,sc=0;return sowItems.map(it=>{if(it.type==='main'){mc++;sc=0;return`<div style="margin-top:4px"><b>${mc}. ${esc(it.text)}</b></div>`;}else{sc++;return`<div style="margin-left:14px">${mc}.${sc} ${esc(it.text)}</div>`;}}).join('');})()}</div></div>`:'';

    const runHdr = `<div class="run-hdr">${docTop}</div>`;
    const runFtr = `<div class="run-ftr"><span>Document No.: ${esc(co.doc)} Rev. ${esc(co.revNo)}</span><span class="pnum"></span></div>`;
    /* Laid out here, not by the browser: only by measuring can a header and a
       footer sit on every page without crossing the rows, and only by counting
       the sheets can a footer say "of 12". */
    const paginator = `(function(){
      var HDR = ${JSON.stringify(runHdr)}, FTR = ${JSON.stringify(runFtr)};
      function sheet(){
        var d = document.createElement('div'); d.className = 'sheet';
        d.innerHTML = HDR + '<div class="sbody"></div>' + FTR;
        document.getElementById('out').appendChild(d); return d;
      }
      function run(){
        var src = document.getElementById('doc'), out = document.getElementById('out');
        if (!src || !out) return;
        src.style.display = '';
        var sections = [].slice.call(src.children);
        var sh = null, body = null, avail = 0;
        function fresh(){ sh = sheet(); body = sh.querySelector('.sbody'); avail = body.clientHeight; }
        /* What is measured is the bottom of the content, not scrollHeight:
           scrollHeight is a whole number and never reports less than the box
           itself, so it can neither see a row overflowing by half a line nor
           be asked for any room in hand -- "avail - 1" against it fits
           nothing at all, one row to a sheet, for ever.
           The room in hand is what a printer needs. A sheet filled to its
           last pixel on screen is a sheet whose final row a printer's own
           rounding of 297mm pushes under the footer, which is a row sliced
           in half at the foot of a page. GAP is about a millimetre. */
        var GAP = 4;
        function fits(){
          var last = body.lastElementChild;
          if (!last) return true;
          return last.getBoundingClientRect().bottom - body.getBoundingClientRect().top <= avail - GAP;
        }
        function put(el){
          body.appendChild(el);
          if (fits()) return;
          var tall = el.offsetHeight > avail;
          /* Taller than a whole sheet however it is placed, so it is cut here
             rather than moved: moving it left the heading above it alone on a
             page of its own with the table starting on the next one. */
          if (el.tagName === 'TABLE') {
            if (tall || body.children.length === 1) { split(el); return; }
            /* A table moved to the next sheet takes its heading with it, or
               the heading is left alone at the foot of the page it came
               from, announcing a table that is not there. */
            body.removeChild(el);
            var lead = body.lastElementChild;
            var carry = (lead && lead.tagName !== 'TABLE' && body.children.length > 1) ? lead : null;
            if (carry) body.removeChild(carry);
            fresh();
            if (carry) body.appendChild(carry);
            put(el);
            return;
          }
          /* A bill of quantities is a wrapper holding a heading and its table,
             and a wrapper is not a table, so nothing cut it: one taller than a
             sheet was laid down whole and everything past the foot of that
             page was swallowed by the sheet's own overflow -- 281 tools
             printed as 63, with nothing to say the rest had gone. Taken apart,
             its heading and its table are each placed on their own terms, and
             the table is cut between its rows like any other. */
          if (tall && el.children.length) {
            body.removeChild(el);
            [].slice.call(el.children).forEach(put);
            return;
          }
          /* Alone on a sheet and still too big: nothing is gained by moving
             it, and it must not be dropped. */
          if (body.children.length === 1) return;
          body.removeChild(el); fresh(); put(el);
        }
        /* A table taller than a page is cut between its rows, and its first
           row -- the column headings -- repeats on the sheet after it. */
        function split(tbl){
          if (tbl.tagName !== 'TABLE') return;
          body.removeChild(tbl);
          var rows = [].slice.call(tbl.rows), head = rows.length ? rows[0].cloneNode(true) : null, i = 0;
          while (i < rows.length) {
            var part = tbl.cloneNode(false), tb = document.createElement('tbody');
            part.appendChild(tb); body.appendChild(part);
            if (i && head) tb.appendChild(head.cloneNode(true));
            var placed = 0;
            while (i < rows.length) {
              tb.appendChild(rows[i]);
              if (!fits() && placed) { tb.removeChild(rows[i]); break; }
              i++; placed++;
            }
            if (i < rows.length) fresh();
          }
        }
        fresh();
        sections.forEach(function(sec, si){
          if (si) fresh();
          [].slice.call(sec.children).forEach(put);
        });
        src.parentNode.removeChild(src);
        var sheets = out.children, n = sheets.length;
        for (var p = 0; p < n; p++) {
          var t = sheets[p].querySelector('.pnum');
          if (t) t.textContent = 'Page ' + (p + 1) + ' of ' + n;
        }
        document.body.setAttribute('data-paged', '1');
      }
      /* Not before the images are in. The running header carries the company
         logo, and a logo that has not loaded measures as nothing: every sheet
         was given the height of a header without it, and when it arrived the
         header grew and pushed the last row of each page under the footer --
         which is what a row sliced in half at the foot of a page was. */
      var ran = false;
      function go(){ if (ran) return; ran = true; run(); }
      function whenLoaded(){
        var imgs = [].slice.call(document.images).filter(function(i){ return !i.complete; });
        if (!imgs.length) return go();
        var left = imgs.length;
        function one(){ if (--left <= 0) go(); }
        imgs.forEach(function(i){ i.addEventListener('load', one); i.addEventListener('error', one); });
        /* A logo that never arrives must not leave the CE blank. */
        setTimeout(go, 4000);
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', whenLoaded); else whenLoaded();
    })();`;
    /* Save as PDF offers the document title as the file name, so name it the
       way the file is filed: the CE number and what the job is. Anything a
       file name cannot hold is dropped. */
    const _jobTitle = String((openCeId != null ? (monData[openCeId] || {}).jobTitle : '') || info.description || '').trim();
    const printName = ceFileName(info.ceNum, _jobTitle);
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(printName)}<\/title><style>${pageStyle}<\/style><\/head><body>
      <div id="doc" style="display:none">
      <div class="page">
        ${docHdr('COST ESTIMATE SUMMARY')}
        ${infoTable}
        ${dropTotals(costTable)}
        ${notesList}
        ${sigBlock}
      </div>
      ${sowPage}
      ${billsPage}
      </div><div id="out"></div>
      <script>${paginator}</script>
    <\/body><\/html>`;
    /* View from CE Monitoring: this copy of the app runs inside that frame
       only to draw the CE, so it swaps itself for the document -- which also
       stops it, leaving nothing running that could autosave. */
    /* Preview wants the document, not a print window. */
    if (opt && opt.htmlOnly) { window.__lastCEHtml = fullHtml; return fullHtml; }
    if (opt && opt.embed && window !== window.top) {
      document.open(); document.write(fullHtml); document.close();
      return;
    }
    const w=window.open('','_blank');
    w.document.write(fullHtml);
    w.document.close();
    /* Print when the sheets are laid out, not 800ms in: the paginator now
       waits for the logo, and printing before it finished would print the
       document unpaginated. */
    (function _waitThenPrint(n){
      try {
        if (w.closed) return;
        if ((w.document.body && w.document.body.getAttribute('data-paged')) || n > 40) { w.print(); return; }
      } catch (_e) { return; }
      setTimeout(() => _waitThenPrint(n + 1), 150);
    })(0);
    window.__lastCEHtml = fullHtml;
  };
}

/* The Excel exports without amounts. Both exporters end in a list of sheets whose cells carry a style, and a money cell is one with a money
   style, so blanking them is done here once, for both. A total, unit-price or selling-price line is then a label with nothing beside it, so
   it is dropped -- unless it counts people (a crew sub total), which is not money and stays. */
const SHEET_MONEY_STYLES = ['tdn', 'valn', 'tdnb', 'tdsubn', 'tot'];
function stripSheetAmounts(sheets) {
  sheets.forEach(sh => {
    sh.rows = (sh.rows || []).filter(row => {
      if (!row || !row.length) return true;
      let hadTotal = false, label = '';
      row.forEach(c => {
        if (!c || typeof c !== 'object') return;
        if (c.s === 'tot') hadTotal = true;
        if (typeof c.v === 'string') label += ' ' + c.v;
        if (SHEET_MONEY_STYLES.indexOf(c.s) >= 0) c.v = '';
      });
      const counts = row.some(c => c && typeof c === 'object' && typeof c.v === 'number');
      const priceLine = /SELLING PRICE|MARGIN/i.test(label);
      return !((hadTotal || priceLine) && !counts);
    });
  });
  return sheets;
}

/* The allocation sheet the Planning app imports, one row per resource, from the CE on screen.

   Columns and values follow the Planning app's own export (ID, ProjectID, ResourceID, ResourceName, ResourceType, Unit, Role,
   AllocatedQty, PlannedCost, ActualCost, Status, ...):
     Manpower    one row per role, all shifts together. Qty is the headcount, PlannedCost the role's wages plus its benefits (what the CE
                 charges for that role), ResourceID TRADE-<ROLE>.
     Consumable  every Materials and PPE line: Qty as entered, PlannedCost = qty x cost, Unit as entered. ResourceID is left blank
                 unless the line carries a warehouse code (WHSE-...).
   Tools and equipment, vehicles and miscellaneous are not allocated resources and are not exported. ActualCost, dates and the issued /
   returned / net columns are blank; Remaining starts equal to Qty; Status is active. */
const PLANNING_HEADERS = ['ID', 'ProjectID', 'ResourceID', 'ResourceName', 'ResourceType', 'Unit', 'Role', 'AllocatedQty', 'PlannedCost', 'ActualCost', 'Status', 'StartDate', 'EndDate', 'Notes', 'Issued', 'Returned', 'NetUsed', 'Remaining'];
function buildPlanningRows(ctx, projectId) {
  const { mp, mats, ppe, mpWageParts, benefitRows } = ctx;
  const money = v => Math.round(N(v) * 100) / 100;
  const roleKey = s => String(s || '').trim().toUpperCase();
  const out = [];
  const add = (resId, name, type, unit, qty, planned) => out.push([
    'RA-' + String(out.length + 1).padStart(4, '0'), projectId, resId, name, type, unit, '', qty, money(planned), '', 'active', '', '', '', '', '', '', qty]);
  const roles = new Map();
  (mp || []).filter(r => r.role && (N(r.rate) > 0 || N(r.pax) > 0)).forEach(r => {
    const k = roleKey(r.role);
    const g = roles.get(k) || { name: String(r.role).trim(), pax: 0, wage: 0 };
    g.pax = Math.max(g.pax, N(r.pax) || 1);
    g.wage += mpWageParts(r).total;
    roles.set(k, g);
  });
  roles.forEach((g, k) => {
    const b = (benefitRows || []).find(x => roleKey(x.role) === k);
    add('TRADE-' + k.replace(/\s+/g, '-'), g.name, 'Manpower', 'pax', b && N(b.pax) ? N(b.pax) : g.pax, g.wage + (b ? N(b.total) : 0));
  });
  [...(mats || []), ...(ppe || [])].filter(r => r.desc && String(r.desc).trim()).forEach(r => {
    add(/^WHSE-/i.test(String(r.code || '')) ? String(r.code).trim() : '', String(r.desc).trim(), 'Consumable', r.uom || 'Lot', N(r.qty), N(r.qty) * N(r.cost));
  });
  return out;
}
function makeHandleExportPlanning(getCtx) {
  return (opt) => {
    const ctx = getCtx();
    const info = ctx.info || {};
    const pid = String((opt && opt.projectId) || '').trim() || info.ceNum || '';
    const rows = buildPlanningRows(ctx, pid);
    if (!rows.length) { ctx.showToast('Nothing to export — this CE has no manpower, materials or PPE.', true); return; }
    const th = PLANNING_HEADERS.map(h => ({ v: h, s: 'th' }));
    const body = rows.map(r => r.map((v, i) => ({ v, s: (i === 7 || i === 17) ? 'tdc' : i === 8 ? 'tdn' : 'td' })));
    SHICXlsx.download('allocation_' + String(pid).replace(/[^a-z0-9._-]/gi, '_') + '.xlsx',
      [{ name: 'Allocation', cols: [10, 24, 30, 46, 14, 9, 8, 13, 14, 12, 9, 11, 11, 10, 9, 10, 9, 11], rows: [th, ...body] }]);
    ctx.showToast('Planning workbook exported — ' + rows.length + ' resource(s) for ' + pid + '.');
  };
}

function makeHandleExportXLSX(getCtx) {
  return (opt) => {
    const noAmt = !!(opt && opt.noAmounts);
    const {
      approvers,
      benefitRows,
      benefitsT,
      ceBreakdown,
      ceLayout,
      ceSections,
      ceType,
      cfg,
      demobVehicles,
      demobVehiclesT,
      docStatus,
      grand,
      hlAmt,
      hlLabel,
      hlRows,
      incOn,
      info,
      kwhRate,
      margin,
      mats,
      matsT,
      misc,
      miscT,
      mobVehicles,
      mobVehiclesT,
      mp,
      mpTot,
      mpWageParts,
      notes,
      perJobLbl,
      perJobT,
      powerOn,
      ppe,
      ppeT,
      pwrFrac,
      qtyUom,
      rr,
      servicesSummary,
      showToast,
      showUnitP,
      sowItems,
      sowLabels,
      toolBasis,
      tools,
      toolsT,
      unitLbl,
      unitP
    } = getCtx();
    /* Written through SHICXlsx rather than SheetJS: the vendored build reads
       cell styles but cannot write them, so this workbook used to come out as
       unformatted text. The content was already right -- one sheet per printed
       page -- but sales could not work with a wall of plain cells. */
    const sheets = [];
    /* Resolved exactly as the printed CE does, so the two headers agree. */
    const _cos = getCompanies();
    const coI = _cos.find(c => String(c.id) === String(info.companyId)) || _cos[0] || {};
    const _hasCoI = !!(coI && (coI.name || coI.sub || coI.logo || coI.id));
    const co = {
      /* Same rule as the printed CE -- see the note there. */
      name: coI.name || (_hasCoI ? '' : 'SYNERCORE'),
      sub: coI.sub || (_hasCoI ? '' : 'HEAVY INDUSTRIES CORP.'),
      logo: coI.logo || '',
      doc: coI.docNo || coI.doc || 'SHIC-F-TSG025', revNo: coI.revNo || '0', revDate: coI.revDate || ''
    };
    const shiftLabel = k => (SHIFTS[k] && SHIFTS[k].label) || k;

    /* Build one sheet. A cell is a plain value or {v, n:true} for money.

       Table rows are bordered, headers are shaded and totals are boxed --
       worked out from position rather than declared per cell: `head` opens a
       table, `total` and `blank` close it, and every `row` in between is a
       body row. That is the shape every bill on the printed form already has,
       so no call site has to describe its own formatting twice. */
    const sheet = (name, build, colWidths) => {
      const rows = [], merges = [];
      let inTable = false, width = 0;
      const cell = (c, bodyStyle) => {
        if (c === undefined || c === null) return null;
        /* {text, span, ht}: wrapped text across `span` more columns, the row `ht` points tall. */
        if (typeof c === 'object' && c.wrapText) return { v: c.wrapText, s: 'note', span: c.span, ht: c.ht };
        if (typeof c === 'object' && 'v' in c) return { v: c.v, s: c.n ? (bodyStyle ? 'tdn' : 'valn') : bodyStyle || 'val' };
        if (!bodyStyle) return { v: c, s: 'val' };
        if (bodyStyle === 'label') return { v: c, s: 'label' };
        return { v: c, s: typeof c === 'number' ? 'tdc' : 'td' };
      };
      const api = {
        row: (...cells) => {
          /* Outside a table the first cell is the label of a label/value pair;
             inside one, every cell is a bordered body cell. */
          rows.push(cells.map((c, i) => cell(c, inTable ? 'body' : (i === 0 ? 'label' : null))));
          return rows.length - 1;
        },
        /* A table header. Opens the bordered run beneath it. */
        head: (...cells) => {
          inTable = true;
          width = cells.length;
          rows.push(cells.map(c => ({ v: c === undefined ? '' : c, s: 'th' })));
        },
        /* A total or sub-total line. Closes the run.

           Laid out as the printed CE lays it: the amount under the table's
           last column and the label right-aligned against it. Call sites wrote
           fewer cells than their table had columns, which put the Shopworks
           tools total and the manpower cost total a column short. */
        total: (...cells) => {
          inTable = false;
          const isAmt = c => c && typeof c === 'object' && 'v' in c;
          const out = cells.slice();
          if (out.length < width && isAmt(out[out.length - 1]))
            out.splice(out.length - 1, 0, ...Array(width - out.length).fill(''));
          const row = out.map(c => isAmt(c) ? { v: c.v, s: 'tot' } : { v: c === undefined ? '' : c, s: 'totlbl' });
          /* A label followed only by blanks spans them, so it reads beside the amount. */
          const last = row.length - 1;
          let li = last - 1;
          while (li > 0 && row[li].v === '') li--;
          if (li > 0 && li < last - 1 && typeof row[li].v === 'string' && isAmt(out[last])) {
            row[li].span = last - 1 - li;
            for (let k = li + 1; k < last; k++) row[k] = { v: '', s: 'totlbl' };
          }
          rows.push(row);
        },
        blank: () => { inTable = false; rows.push([]); },
        /* A full-width heading over `span` columns, like the black bars on the
           printed form. */
        title: (text, span) => {
          inTable = false;
          rows.push([{ v: text, s: 'secbar', span: span > 1 ? span - 1 : 0 }]);
        },
        money: v => ({ v: Math.round(N(v) * 100) / 100, n: true })
      };
      build(api);
      /* A merged bar or note reaches past the last cell written, and that column needs a width too. */
      const widest = rows.reduce((m, r) => Math.max(m, r.length, r.reduce((e, c, i) => c && c.span > 0 ? Math.max(e, i + c.span + 1) : e, 0)), 0);
      sheets.push({
        name: name,
        cols: colWidths ? Array.from({ length: Math.max(widest, colWidths.length) }, (_, i) => colWidths[i] || 13)
          : Array.from({ length: widest }, (_, i) => i === 1 ? 42 : i === 0 ? 7 : 13),
        merges: merges,
        rows: rows
      });
    };

    /* The document header that tops every printed page. */
    const docHead = (a, title, span) => {
      /* The logo REPLACES the name, exactly as it does on the printed CE --
         it is drawn over A1, and the name underneath it would show through.
         No dangling dash for a company with a name and no subtitle. */
      a.row({ v: co.logo ? '' : [co.name, co.sub].filter(Boolean).join(' — ') }, '', '', 'Document No.:', co.doc);
      a.row({ v: 'COST ESTIMATE SUMMARY' }, '', '', 'Revision No.:', co.revNo);
      a.row('', '', '', 'Revision Date:', co.revDate);
      a.title(title, span);
      a.row('CE No.:', info.ceNum || '', 'CE TYPE:', ceTypeLabel(ceType).toUpperCase(), 'DATE:', info.date || '');
      a.blank();
    };

    /* ── Page 1: cost estimate summary ── */
    /* Every bar on this sheet is the header's width (A to G), and long text wraps inside it. */
    const CS_W = 7, CS_COLS = [20, 42, 14, 20, 16, 16, 16];
    const wrapIn = (text, span, perLine) => { const t = String(text || ''); const n = Math.max(1, Math.ceil(t.length / perLine)); return { wrapText: t, span, ht: n > 1 ? Math.round(n * 14.4 * 10) / 10 : undefined }; };
    sheet('CE Summary', a => {
      docHead(a, 'COST ESTIMATE SUMMARY', CS_W);
      a.row('PROJECT DESCRIPTION:', wrapIn(info.description, 5, 105));
      /* A material spec runs to a line of its own -- "A217 Gr. C12A with
         Co-Cr-Mo-Ni & ASTM A335 P91" does not sit in half a row -- and it
         belongs next to the description it qualifies. */
      if (info.material) a.row('MATERIAL:', wrapIn(info.material, 5, 105));
      a.row('CLIENT NAME:', info.client || '', '', 'CLIENT LOCATION:', wrapIn(info.location, 2, 42));
      a.row('ATTENTION:', info.attention || 'SALES DEPARTMENT', '', 'QUANTITY:', (info.qty || 1) + ' ' + qtyUom);
      a.row('END USER:', info.endUser || 'C/O SALES', '', 'NO. OF DAYS:', (info.days || '') + ' DAYS');
      a.row('DISCIPLINE:', info.projType || '', '', 'STATUS:', docStatus);
      a.blank();
      a.head('ITEM', 'DESCRIPTION', 'TOTAL COST');
      /* Itemised the same way the printed CE and the workbook itemise it, so
         a CE read in a message and the same CE read on paper agree. */
      ceSections.filter(x => x.v > 0).forEach(x => {
        const kids = ceBreakdown[x.printLabel];
        a.row(x.letter, x.label, kids && !ceLayout.parentCarries ? '' : a.money(x.v));
        if (kids) kids.forEach(k => a.row('', (ceLayout.parentCarries ? '   of which ' : '   ') + k.letter + '. ' + k.label, a.money(k.v)));
      });
      a.blank();
      a.total('', 'TOTAL AMOUNT:', a.money(grand));
      if (showUnitP) a.total('', unitLbl, a.money(unitP));
      if (showUnitP && perJobT) a.total('', perJobLbl, a.money(perJobT));
      if (margin !== 0) a.total('', 'SELLING PRICE (' + (margin > 0 ? '+' : '') + margin + '% margin):', a.money(grand * (1 + margin / 100)));
      /* The workbook has always headed these; the printed CE and this one
         did not, so two bold figures appeared under TOTAL AMOUNT, in the
         same column, with nothing to say they were already inside it. */
      if (hlRows.length && !noAmt) a.title('HIGHLIGHTED COSTS (already included above)', CS_W);
      if (!noAmt) hlRows.forEach(r => a.total('', String(hlLabel(r)).toUpperCase() + ':', a.money(hlAmt(r))));
      if (servicesSummary.on && servicesSummary.ok && !noAmt) {
        a.blank();
        a.title('SERVICES', CS_W);
        servicesSummary.lines.forEach(l => a.row('', l.label.toUpperCase() + ':', a.money(l.v)));
        if (Math.abs(servicesSummary.other) >= 0.005) a.row('', 'OTHER MISC. TO THE PROJECT:', a.money(servicesSummary.other));
        a.total('', 'SERVICES TOTAL AMOUNT:', a.money(servicesSummary.total));
      }
      /* Notes, including the breakdown notes, exactly as the CE prints them. */
      const sowNotes = (sowItems || []).filter(x => String(x.note || '').trim());
      if (notes.length || sowNotes.length) {
        a.blank();
        a.title('NOTE', CS_W);
        /* A text file has no font, so the flag has to be a word. Written in
           front of the note, where it is read before the note is. */
        notes.forEach((n, i) => a.row(i + 1, wrapIn((n.imp ? '[IMPORTANT] ' : '') + (n.text || ''), 5, 105)));
        sowNotes.forEach((x, i) => a.row(notes.length + i + 1, wrapIn('Scope ' + (sowLabels[x.id] || '') + ' — ' + String(x.note).trim(), 5, 105)));
      }
      if (approvers && approvers.length) {
        a.blank();
        a.title('SIGNATORIES', CS_W);
        approvers.forEach(ap => a.row(ap.role || '', ap.name || '', ap.title || ''));
      }
    }, CS_COLS);

    /* ── Page 2: manpower loading, one block per shift ── */
    /* ── Mobilization / demobilization, manpower then expenses, per stage ── */
    const _mobL = rows => (rows || []).filter(r => String(r.desc || '').trim() || N(r.rate) > 0);
    if (cfg.mobDemob && (_mobL(mobVehicles).length || _mobL(demobVehicles).length)) sheet('Mobilization', a => {
      docHead(a, 'MOBILIZATION / DEMOBILIZATION', 11);
      [['MOBILIZATION', mobVehicles, mobVehiclesT], ['DEMOBILIZATION', demobVehicles, demobVehiclesT]].forEach(([lbl, all, tot]) => {
        const list = _mobL(all);
        if (!list.length) return;
        const crew = list.filter(r => r.kind === 'mp'), exp = list.filter(r => r.kind !== 'mp');
        a.title(lbl, 11);
        if (crew.length) {
          a.head('ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'NO. OF DAYS', 'RATE PER DAY', 'SUB-TOTAL A', 'OT HRS PER DAY', 'RATE OT/HR', 'SUB-TOTAL B', 'TOTAL');
          crew.forEach((r, i) => {
            const base = N(r.qty) * N(r.days) * N(r.rate), all2 = mobRowCost(r, rr);
            a.row(i + 1, r.desc || '', N(r.qty), 'PAX/S', N(r.days), a.money(r.rate), a.money(base), N(r.otHours),
              a.money(N(r.rate) / 8 * ceOtMult(rr)), a.money(all2 - base), a.money(all2));
          });
          a.total('', 'SUB TOTAL:', crew.reduce((t, r) => t + N(r.qty), 0), '', '', '', '', '', '', '', a.money(crew.reduce((t, r) => t + mobRowCost(r, rr), 0)));
          a.blank();
        }
        if (exp.length) {
          a.head('ITEM', 'DESCRIPTION', 'QTY', 'DAYS', 'RATE', 'TOTAL');
          exp.forEach((r, i) => a.row(i + 1, r.desc || '', N(r.qty), N(r.days), a.money(r.rate), a.money(mobRowCost(r, rr))));
          a.total('', 'SUB TOTAL:', '', '', '', a.money(exp.reduce((t, r) => t + mobRowCost(r, rr), 0)));
          a.blank();
        }
        a.total('', lbl + ' TOTAL:', '', '', '', a.money(tot));
        a.blank();
      });
    });

    const mpActive = mp.filter(r => r.role && (N(r.rate) > 0 || N(r.pax) > 0));
    if (mpActive.length) sheet('Manpower', a => {
      docHead(a, 'BILL OF MANPOWER LOADING', 11);
      [...new Set(mpActive.map(r => r.shift || 'regular_day'))].forEach(sk => {
        const rows = mpActive.filter(r => (r.shift || 'regular_day') === sk);
        const mult = ceShiftMult(rr, sk);
        a.title(shiftLabel(sk), 11);
        a.head('ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'DAYS', 'RATE/DAY', 'SUBTOTAL', 'OT HRS/DAY', 'AOT', 'RATE OT', 'TOTAL');
        let subA = 0, subB = 0;
        rows.forEach((r, i) => {
          const {reg: base, ot} = mpWageParts(r);
          subA += base; subB += ot;
          a.row(i + 1, r.role || '', N(r.pax), 'pax', N(r.days), a.money(r.rate),
            a.money(base), N(r.otHours), N(r.otHours) * N(r.days), a.money(N(r.rate) / 8 * ceOtMult(rr) * mult), a.money(base + ot));
        });
        a.total('', 'SUB TOTAL:', rows.reduce((t, r) => t + N(r.pax), 0), '', '', '', '', '', '', a.money(subA + subB));
        a.blank();
      });
      /* Benefits table, matching section C.7 on the printed form. */
      if (benefitRows.length) {
        a.title('BENEFITS AND OTHERS', incOn ? 12 : 11);
        const _inc = incOn ? ['INCENTIVE'] : [];
        a.head('ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'TOTAL DAYS', 'MONTHLY RATE', '13TH PAY', 'SSS', 'HDMF & PHIC', 'SIL', 'ECC', ..._inc, 'TOTAL');
        benefitRows.forEach((r, i) => a.row(i + 1, r.role, r.pax, 'pax', r.days, a.money(r.monthlyRate),
          a.money(r.thirteenth), a.money(r.sss), a.money(r.hdmf), a.money(r.sil - (r.ecc || 0)), a.money(r.ecc || 0), ...(incOn ? [a.money(r.perdiem)] : []), a.money(r.total)));
        a.total('', 'TOTAL MANPOWER:', benefitRows.reduce((t, r) => t + N(r.pax), 0), '', '', '', '', '', '', '', ...(incOn ? [''] : []), 'SUB TOTAL:', a.money(benefitsT));
      }
      a.blank();
      a.total('', 'MANPOWER COST TOTAL:', '', '', '', '', '', '', '', a.money(mpTot));
    });

    /* ── Resource pages, each mirroring its printed bill ── */
    const bill = (name, heading, rows, withDays, total) => {
      if (!rows.length) return;
      sheet(name, a => {
        /* withDays is only ever true for tools, which is the one bill whose
           rows can be charged per project or by the hour. POWER joins it on
           shopworks, where the shop's own electricity is part of the cost. */
        const pwrCol = withDays && powerOn;
        docHead(a, heading, (withDays ? 7 : 6) + (pwrCol ? 1 : 0));
        a.head('ITEM', 'DESCRIPTION', 'QTY', 'UOM', ...(withDays ? ['BASIS'] : []),
          ...(pwrCol ? ['POWER'] : []), 'UNIT PRICE', 'TOTAL');
        rows.forEach((r, i) => {
          a.row(i + 1, r.desc || '', N(r.qty), r.uom || 'Lot', ...(withDays ? [toolBasis(r)] : []),
            ...(pwrCol ? [a.money((toolPowerCost(r, kwhRate) * pwrFrac(r)))] : []),
            a.money(withDays ? toolUnitRate(r) : N(r.cost)),
            a.money(withDays ? toolRowTotal(r, kwhRate, undefined, pwrFrac(r)) : N(r.qty) * N(r.cost)));
        });
        a.blank();
        a.total('', 'TOTAL:', '', '', ...(withDays ? [''] : []), '', a.money(total));
      });
    };
    bill('Tools & Equipment', 'BILL OF TOOLS AND EQUIPMENT', tools.filter(r => r.desc), true, toolsT);
    bill('Materials', 'BILL OF MATERIALS AND CONSUMABLES', mats.filter(r => r.desc), false, matsT);
    bill('PPE', 'PERSONAL PROTECTIVE EQUIPMENTS', ppe.filter(r => r.desc), false, ppeT);

    /* ── Miscellaneous, grouped by its categories ── */
    const miscCatsX = (MISC_DEF[ceType] || MISC_DEF.onsite);
    const miscAny = miscCatsX.some(([k]) => (Array.isArray(misc[k]) ? misc[k] : []).some(r => r.desc));
    if (miscAny) sheet('Miscellaneous', a => {
      docHead(a, 'MISCELLANEOUS', 7);
      miscCatsX.forEach(([k, label]) => {
        const rows = (Array.isArray(misc[k]) ? misc[k] : []).filter(r => r.desc);
        if (!rows.length) return;
        a.title(label, 7);
        a.head('ITEM', 'DESCRIPTION', 'QTY', 'UOM', 'NO. OF DAYS', 'UNIT PRICE', 'TOTAL');
        rows.forEach((r, i) => {
          a.row(i + 1, r.desc, N(r.qty), r.uom || 'Lot', N(r.days) || 1, a.money(r.cost), a.money(miscRowCost(r)));
          (Array.isArray(r.parts) ? r.parts : []).forEach(p => a.row('', '    - ' + p.label, N(p.qty), '', N(p.days), '', a.money(N(r.cost) * N(p.qty) * N(p.days))));
        });
        a.total('', 'SUB TOTAL:', '', '', '', '', a.money(rows.reduce((s2, r) => s2 + miscRowCost(r), 0)));
        a.blank();
      });
      a.total('', 'MISCELLANEOUS TOTAL:', '', '', '', '', a.money(miscT));
    });

    /* ── Scope of work, numbered as the CE prints it ── */
    if ((sowItems || []).length) sheet('Scope of Work', a => {
      docHead(a, 'SCOPE OF WORK', CS_W);
      let mc = 0, sc = 0;
      sowItems.forEach(it => {
        if (it.type === 'main') { mc++; sc = 0; a.row(mc + '.', wrapIn(it.text, 5, 105)); }
        else { sc++; a.row(mc + '.' + sc, wrapIn('   ' + (it.text || ''), 5, 105)); }
      });
    }, CS_COLS);

    if (noAmt) stripSheetAmounts(sheets);
    SHICXlsx.download((info.ceNum || 'CE') + '_' + (info.client || 'export').replace(/[^a-z0-9]/gi, '_') + (noAmt ? '_no-amounts' : '') + '.xlsx', sheets,
      { bar: ceBrand(coI).bar, barText: ceBrand(coI).text, logo: co.logo });
    showToast('Exported to Excel — one sheet per page of the CE.');
  };
}

function makeHandleExport(getCtx) {
  return (opt) => {
    const noAmt = !!(opt && opt.noAmounts);
    const {
      approvers,
      benefitRows,
      benefitsT,
      ceBreakdown,
      ceLayout,
      ceSections,
      ceType,
      cfg,
      demobVehicles,
      demobVehiclesT,
      docStatus,
      grand,
      hlAmt,
      hlLabel,
      hlRows,
      info,
      kwhRate,
      margin,
      mats,
      matsT,
      miscCosted,
      miscT,
      mobVehicles,
      mobVehiclesT,
      mp,
      mpTot,
      mpWage,
      notes,
      perJobLbl,
      perJobT,
      ppe,
      ppeT,
      pwrFrac,
      qtyUom,
      rceNo,
      rr,
      servicesSummary,
      showToast,
      showUnitP,
      sowItems,
      sowLabels,
      toolBasis,
      tools,
      toolsT,
      unitLbl,
      unitP
    } = getCtx();
    const cl = ceType === 'shopworks' ? 'Shopwork' : ceTypeLabel(ceType);
    /* ht: the row's height in points, for a wrapped cell in a merged range (Excel will not size those itself). */
    const S = (v, s, span, ht) => ({v: v, s: s, span: span, ht: ht});
    /* Column A holds the labels (PROJECT DESCRIPTION:, Prepared by:), so it is wide; B to G, merged, are about 106 wide. */
    const COLS = [22, 46, 9, 9, 10, 15, 17];
    const wrapHt = (t, perLine) => { const n = Math.max(1, Math.ceil(String(t || '').length / perLine)); return n > 1 ? Math.round(n * 14.4 * 10) / 10 : undefined; };
    const TPL_LINE = 95;

    /* Every sheet opens with the same four rows: document control on the
       right, then a black title bar and the CE identifiers -- the same header
       the printed CE carries at the top of each page. */
    const head = title => [
      [S('COST ESTIMATE SUMMARY', 'title', 4), null, null, null, null, S('Document No.:', 'doc'), S(cfg.docNo || '', 'doc')],
      [null, null, null, null, null, S('Revision No.:', 'doc'), S('0', 'doc')],
      [],
      [S(title, 'secbar', 6)],
      [S('CE No.:', 'label'), S(info.ceNum || '', 'val'), null, S('CE TYPE:', 'label'), S(cl.toUpperCase(), 'val'), S('DATE:', 'label'), S(info.date || '', 'val')],
      []
    ];

    const sheets = [];

    /* ---- CE SUMMARY ---------------------------------------------------- */
    const sum = head('COST ESTIMATE SUMMARY');
    [['PROJECT TYPE:', (info.projType ? info.projType + ' ' : '') + cl],
     ['PROJECT DESCRIPTION:', info.description],
     /* Beside the description, because it describes the same thing: what the
        job is being quoted on. It used to be printed below END USER, three
        rows away from the work it qualifies. */
     ['MATERIAL:', info.material],
     ['CLIENT NAME:', info.client],
     ['CLIENT LOCATION:', info.location],
     ['ATTENTION:', info.attention],
     ['END USER:', info.endUser],
     ['RCE No.:', rceNo],
     ['QUANTITY:', (info.qty || 1) + ' ' + qtyUom],
     ['NO. OF DAYS:', info.days],
     ['STATUS:', docStatus]].forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) return;
      sum.push([S(k, 'label'), S(String(v), 'note', 5, wrapHt(v, TPL_LINE))]);
    });
    sum.push([]);
    sum.push([S('ITEM', 'th'), S('DESCRIPTION', 'th', 4), null, null, null, null, S('TOTAL COST', 'th')]);
    ceSections.filter(x => x.v > 0).forEach(x => {
      const _blank = !ceLayout.parentCarries && !!ceBreakdown[x.printLabel];
      sum.push([S(x.letter, 'tdc'), S(x.printLabel, 'td', 4), null, null, null, null, S(_blank ? '' : N(x.v), 'tdn')]);
      /* A section with parts is itemised under it. Which way round depends
         on the layout, and both arrangements exist for the same reason: read
         down TOTAL COST and every cost must appear exactly once.
           Mechanical keeps the section's figure in the column and sets its
         parts beside it, in a column of their own, marked "of which".
           Electrical leaves the section's own cell empty and lets the parts
         carry the figures, which is how SY3-F-ACF-009 has always read.
         Before either, the parts sat in the total column looking exactly
         like the sections, and the column added up to more than the CE. */
      const kids = ceBreakdown[x.printLabel];
      if (kids) kids.forEach(k => sum.push(ceLayout.parentCarries
        ? [S('', 'tdc'), S('        of which  ' + k.letter + '  ' + k.label, 'tdsub', 4), null, null, null, S(N(k.v), 'tdsubn'), S('', 'tdn')]
        : [S('', 'tdc'), S('      ' + k.letter + '.  ' + k.label, 'td', 4), null, null, null, null, S(N(k.v), 'tdn')]));
    });
    sum.push([S('', 'totlbl'), S('TOTAL AMOUNT:', 'totlbl', 4), null, null, null, null, S(N(grand), 'tot')]);
    if (showUnitP) sum.push([S('', 'totlbl'), S(unitLbl, 'totlbl', 4), null, null, null, null, S(N(unitP), 'tot')]);
    if (showUnitP && perJobT) sum.push([S('', 'totlbl'), S(perJobLbl, 'totlbl', 4), null, null, null, null, S(N(perJobT), 'tot')]);
    if (margin !== 0) {
      sum.push([S('', 'totlbl'), S('MARGIN:', 'totlbl', 4), null, null, null, null, S((margin > 0 ? '+' : '') + margin + '%', 'totlbl')]);
      sum.push([S('', 'totlbl'), S('SELLING PRICE:', 'totlbl', 4), null, null, null, null, S(N(grand * (1 + margin / 100)), 'tot')]);
    }
    if (hlRows.length && !noAmt) {
      sum.push([]);
      sum.push([S('HIGHLIGHTED COSTS (already included above)', 'sec')]);
      hlRows.forEach(r => sum.push([S('', 'tdc'), S(hlLabel(r).toUpperCase(), 'td', 4), null, null, null, null, S(N(hlAmt(r)), 'tdn')]));
    }
    if (servicesSummary.on && servicesSummary.ok && !noAmt) {
      sum.push([]);
      sum.push([S('SERVICES', 'sec')]);
      servicesSummary.lines.forEach(l => sum.push([S('', 'tdc'), S(l.label.toUpperCase() + ':', 'td', 4), null, null, null, null, S(N(l.v), 'tdn')]));
      if (Math.abs(servicesSummary.other) >= 0.005) sum.push([S('', 'tdc'), S('OTHER MISC. TO THE PROJECT:', 'td', 4), null, null, null, null, S(N(servicesSummary.other), 'tdn')]);
      sum.push([S('', 'totlbl'), S('SERVICES TOTAL AMOUNT:', 'totlbl', 4), null, null, null, null, S(N(servicesSummary.total), 'tot')]);
    }
    const sowNotes = (sowItems || []).filter(x => String(x.note || '').trim());
    /* The flag rides with the line: these two lists are merged and then
       numbered, so a bare array of strings would lose which one was flagged. */
    const noteLines = [...notes.map(n => ({t: String(n.text || ''), imp: !!n.imp})),
                       ...sowNotes.map(x => ({t: 'Scope ' + (sowLabels[x.id] || '') + ' — ' + String(x.note).trim(), imp: false}))]
                      .filter(n => n.t.trim());
    if (noteLines.length) {
      sum.push([]);
      sum.push([S('NOTE:', 'sec')]);
      noteLines.forEach((n, i) => sum.push([null, S((i + 1) + '. ' + n.t, n.imp ? 'noteimp' : 'note', 5, wrapHt((i + 1) + '. ' + n.t, TPL_LINE))]));
    }
    const aps = (approvers || []).filter(a => a.role || a.name || a.title);
    if (aps.length) {
      sum.push([], []);
      /* One line per signatory, label in A, name in B, title across C to G: the old four-across layout put
         each name in a 9-wide column and cut it off. */
      aps.forEach(a => sum.push([S((a.role || '') + ':', 'label'), S(a.name || '', 'label'), S(a.title || a.role || '', 'val', 4)]));
    }
    sheets.push({name: 'CE SUMMARY', cols: COLS, rows: sum});

    /* ---- SCOPE OF WORK -------------------------------------------------- */
    if (sowItems.length) {
      const sow = head('SCOPE OF WORK');
      let mc = 0, sc = 0;
      sowItems.forEach(it => {
        if (it.type === 'main') { mc++; sc = 0; sow.push([S(mc + '.', 'label'), S(it.text || '', 'notebold', 5, wrapHt(it.text, TPL_LINE))]); }
        else { sc++; sow.push([null, S(mc + '.' + sc + '  ' + (it.text || ''), 'note', 5, wrapHt(mc + '.' + sc + '  ' + (it.text || ''), TPL_LINE))]); }
      });
      sheets.push({name: 'SCOPE', cols: COLS, rows: sow});
    }

    /* ---- BOL (manpower + benefits) -------------------------------------- */
    /* A row with no role is not a hire: mpWage costs it at zero, so printing
       it would put a line on the client's copy that the total does not carry. */
    /* ---- MOB / DEMOB ------------------------------------------------------ */
    const _mobList = rows => (rows || []).filter(r => String(r.desc || '').trim() || N(r.rate) > 0);
    if (cfg.mobDemob && (_mobList(mobVehicles).length || _mobList(demobVehicles).length)) {
      const s = head('MOBILIZATION / DEMOBILIZATION');
      [['MOBILIZATION', mobVehicles, mobVehiclesT], ['DEMOBILIZATION', demobVehicles, demobVehiclesT]].forEach(([lbl, all, tot]) => {
        const list = _mobList(all);
        if (!list.length) return;
        const crew = list.filter(r => r.kind === 'mp'), exp = list.filter(r => r.kind !== 'mp');
        s.push([S(lbl, 'sec')]);
        if (crew.length) {
          s.push(['ITEM', 'MANPOWER LOADING', 'QTY', 'DAYS', 'OT HRS/DAY', 'RATE/DAY', 'TOTAL'].map(h => S(h, 'th')));
          crew.forEach((r, i) => s.push([S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty), 'tdc'), S(N(r.days) || 1, 'tdc'), S(N(r.otHours), 'tdc'), S(N(r.rate), 'tdn'), S(mobRowCost(r, rr), 'tdnb')]));
          s.push([S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(crew.reduce((t, r) => t + N(r.qty), 0), 'tot'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S(crew.reduce((t, r) => t + mobRowCost(r, rr), 0), 'tot')]);
        }
        if (exp.length) {
          s.push(['ITEM', 'DESCRIPTION', 'QTY', 'DAYS', '', 'RATE', 'TOTAL'].map(h => S(h, 'th')));
          exp.forEach((r, i) => s.push([S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(N(r.days) || 1, 'tdc'), S('', 'tdc'), S(N(r.rate), 'tdn'), S(mobRowCost(r, rr), 'tdnb')]));
          s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(exp.reduce((t, r) => t + mobRowCost(r, rr), 0), 'tot')]);
        }
        s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S(lbl + ' TOTAL:', 'totlbl'), S(N(tot), 'tot')]);
        s.push([]);
      });
      sheets.push({name: 'MOB-DEMOB', cols: COLS, rows: s});
    }

    const mpActive = mp.filter(r => r.role && (N(r.rate) > 0 || N(r.pax) > 0));
    if (mpActive.length) {
      const bol = head('BILL OF LABOR');
      const shiftKeys = [...new Set(mpActive.map(r => r.shift || 'straight'))];
      shiftKeys.forEach(sk => {
        const rows = mpActive.filter(r => (r.shift || 'straight') === sk);
        if (!rows.length) return;
        const sh = SHIFTS[sk], mult = ceShiftMult(rr, sk);
        const sub = rows.reduce((s, r) => s + mpWage(r), 0);
        bol.push([S(sh?.label || sk.toUpperCase(), 'sec')]);
        bol.push(['ITEM', 'MANPOWER LOADING', 'QTY', 'UOM', 'DAYS', 'RATE/DAY', 'TOTAL'].map(h => S(h, 'th')));
        rows.forEach((r, i) => bol.push([
          S(i + 1, 'tdc'), S(r.role || '', 'td'), S(N(r.pax) || 1, 'tdc'), S('pax', 'tdc'), S(N(r.days) || 1, 'tdc'),
          S(N(r.rate), 'tdn'),
          S(mpWage(r), 'tdnb')
        ]));
        bol.push([S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(rows.reduce((s, r) => s + N(r.pax), 0), 'tot'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S(sub, 'tot')]);
        bol.push([]);
      });
      if (benefitRows.length) {
        bol.push([S('BENEFITS AND OTHERS', 'sec')]);
        bol.push(['ITEM', 'MANPOWER LOADING', 'QTY', '13TH PAY', 'SSS', 'HDMF, PHIC, SIL & ECC', 'TOTAL'].map(h => S(h, 'th')));
        benefitRows.forEach((r, i) => bol.push([
          S(i + 1, 'tdc'), S(r.role, 'td'), S(r.pax, 'tdc'),
          S(r.thirteenth, 'tdn'), S(r.sss, 'tdn'), S(r.hdmf + r.sil, 'tdn'), S(r.total, 'tdnb')]));
        bol.push([S('', 'totlbl'), S('TOTAL MANPOWER:', 'totlbl'), S(benefitRows.reduce((t, r) => t + N(r.pax), 0), 'tot'), S('', 'totlbl'), S('', 'totlbl'), S('BENEFITS SUB TOTAL:', 'totlbl'), S(benefitsT, 'tot')]);
        bol.push([]);
      }
      bol.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('TOTAL MANPOWER COST:', 'totlbl'), S(N(mpTot), 'tot')]);
      sheets.push({name: 'BOL', cols: COLS, rows: bol});
    }

    /* ---- BOTE / BOCM / PPE ---------------------------------------------- */
    const toolsActive = tools.filter(r => r.desc && String(r.desc).trim());
    if (toolsActive.length) {
      const s = head('BILL OF TOOLS AND EQUIPMENT');
      s.push(['ITEM', 'DESCRIPTION', 'QTY', 'UOM', 'BASIS', 'UNIT PRICE', 'TOTAL'].map(h => S(h, 'th')));
      toolsActive.forEach((r, i) => s.push([
        S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(r.uom || 'Lot', 'tdc'), S(toolBasis(r), 'tdc'),
        /* The rate for the basis in the column beside it, not the stored daily
           rate -- on any tier but 2 those are different numbers. */
        S(toolUnitRate(r), 'tdn'), S(toolRowTotal(r, kwhRate, undefined, pwrFrac(r)), 'tdnb')]));
      s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('TOTAL:', 'totlbl'), S(N(toolsT), 'tot')]);
      sheets.push({name: 'BOTE', cols: COLS, rows: s});
    }

    const simpleBill = (sheetName, title, rows, total) => {
      const s = head(title);
      s.push(['ITEM', 'DESCRIPTION', 'QTY', 'UOM', '', 'UNIT PRICE', 'TOTAL'].map(h => S(h, 'th')));
      rows.forEach((r, i) => s.push([
        S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(r.uom || 'Lot', 'tdc'), S('', 'tdc'),
        S(N(r.cost), 'tdn'), S(N(r.qty) * N(r.cost), 'tdnb')]));
      s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('TOTAL:', 'totlbl'), S(N(total), 'tot')]);
      sheets.push({name: sheetName, cols: COLS, rows: s});
    };
    const matsActive = mats.filter(r => r.desc && String(r.desc).trim());
    if (matsActive.length) simpleBill('BOCM', 'BILL OF MATERIALS AND CONSUMABLES', matsActive, matsT);
    const ppeActive = ppe.filter(r => r.desc && String(r.desc).trim());
    if (ppeActive.length) simpleBill('PPE', 'PERSONAL PROTECTIVE EQUIPMENTS', ppeActive, ppeT);

    /* ---- MISC. ----------------------------------------------------------- */
    const cats = miscCosted;
    if (cats.length) {
      const s = head('MISCELLANEOUS');
      cats.forEach(cat => {
        s.push([S(cat.letter + '  ' + cat.label, 'sec')]);
        s.push(['ITEM', 'DESCRIPTION', 'QTY', 'UOM', 'NO. OF DAYS', 'UNIT PRICE', 'TOTAL'].map(h => S(h, 'th')));
        cat.rows.forEach((r, i) => {
          s.push([
          S(i + 1, 'tdc'), S(r.desc || '', 'td'), S(N(r.qty) || 1, 'tdc'), S(r.uom || 'Lot', 'tdc'), S(N(r.days) || 1, 'tdc'),
          S(N(r.cost), 'tdn'), S(miscRowCost(r), 'tdnb')]);
          (Array.isArray(r.parts) ? r.parts : []).forEach(p => s.push([S('', 'tdc'), S('    - ' + p.label, 'td'), S(N(p.qty), 'tdc'), S('', 'tdc'), S(N(p.days), 'tdc'), S('', 'tdn'), S(N(r.cost) * N(p.qty) * N(p.days), 'tdn')]));
        });
        s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('SUB TOTAL:', 'totlbl'), S(N(cat.v), 'tot')]);
        s.push([]);
      });
      s.push([S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('', 'totlbl'), S('MISCELLANEOUS TOTAL:', 'totlbl'), S(N(miscT), 'tot')]);
      sheets.push({name: 'MISC.', cols: COLS, rows: s});
    }

    const _xb = ceBrand(getCompanies().find(c => String(c.id) === String(info.companyId)) || getCompanies()[0] || {});
    if (noAmt) stripSheetAmounts(sheets);
    SHICXlsx.download((info.ceNum || 'CE') + '_' + ceType + (noAmt ? '_no-amounts' : '') + '.xlsx', sheets, { bar: _xb.bar, barText: _xb.text });
    showToast('Excel exported — ' + sheets.length + ' sheets.');
  };
}

