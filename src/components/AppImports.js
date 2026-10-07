/* The CE and monitoring import and load routines: reading the SHIC CE workbooks and the monitoring sheet, loading and saving the monitoring rows, loading the CE history, and reading a document to text.

   Moved out of App.js unchanged. Each maker below returns the function App used to declare in place; App calls
   makeX(() => ({ ...the names it reads... })) once per render. The names are read when the function is CALLED, not when it is made,
   so a function still sees the same values (and can reach ones declared further down App) exactly as the closure it replaces did. */

function makeImportShicCeFiles(getCtx) {
  return async (files) => {
    const {
      currentUser,
      history,
      loadHist,
      setCeImportProgress,
      showToast
    } = getCtx();
    const list = Array.from(files);
    if (!list.length) return;
    setCeImportProgress({done: 0, total: list.length, errors: []});
    let done = 0, errors = [];
    for (const file of list) {
      try {
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, {type:'array', cellDates:true});
        const getSheet = name => {
          // Try exact name first, then case-insensitive match
          if (wb.Sheets[name]) return XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, defval:null});
          const key = Object.keys(wb.Sheets).find(k => k.toUpperCase() === name.toUpperCase());
          return key ? XLSX.utils.sheet_to_json(wb.Sheets[key], {header:1, defval:null}) : [];
        };
        // ── CE SUMMARY ──
        // Column map (0-indexed) based on SHIC CE template:
        // row[5]: {1:'PROJECT DECRIPTION:', 11:'DATE:', 12:date}
        // row[6]: {1:description}
        // row[7]: {11:CE_number}
        // row[4]: {1:'PROJECT TYPE:', 5:electrical_checkbox, 8:mechanical_checkbox}
        // row[8]: {1:'CLIENT NAME:', 3:client}
        // row[9]: {1:'CLIENT LOCATION:', 3:location, 11:material}
        // row[10]: {1:'ATTENTION:', 3:attention, 11:qty}
        // row[11]: {1:'END USER:', 3:endUser, 11:days}
        const sum = getSheet('CE SUMMARY');
        let ceNum='', description='', client='', location='', dateVal=null,
            projType='Mechanical', attention='', endUser='', material='', qty='', days='';
        for (let i=0; i<Math.min(16, sum.length); i++) {
          const row = sum[i]||[];
          // CE Number — look for pattern like SY3-CE-2026-0479 in any column
          for (let c=0; c<row.length; c++) {
            if (row[c] && String(row[c]).match(/\w+-CE-\d{4}-\d+/i)) { ceNum = String(row[c]).trim(); break; }
          }
          const r1 = String(row[1]||'').toUpperCase();
          if (r1.includes('PROJECT TYPE')) {
            // Electrical checkbox at col 5, Mechanical at col 8
            if (row[8]===true || row[8]==='TRUE') projType='Mechanical';
            else if (row[5]===true || row[5]==='TRUE') projType='Electrical';
          }
          if (r1.includes('PROJECT DESC') || r1.includes('PROJECT DECRIPTION')) {
            // Date is at col 12 on this row; description is on the NEXT row col 1
            const dv = row[12];
            if (dv instanceof Date) dateVal = dv;
            else if (typeof dv==='number' && dv>40000) dateVal = new Date((dv-25569)*86400000);
            const nr = sum[i+1]||[]; description = String(nr[1]||'').trim();
          }
          if (r1.includes('CLIENT NAME')) client = String(row[3]||'').trim();
          if (r1.includes('CLIENT LOCATION')) { location=String(row[3]||'').trim(); material=String(row[11]||'').trim(); }
          if (r1.includes('ATTENTION')) { attention=String(row[3]||'').trim(); qty=String(row[11]||'').trim(); }
          if (r1.includes('END USER')) { endUser=String(row[3]||'').trim(); days=String(row[11]||'').trim(); }
        }
        // ── Resource sheet parser — auto-detects header row and column positions ──
        const parseRes = (sheetName) => {
          const rows = getSheet(sheetName);
          const items=[]; let hdr=false, qI=-1, uI=-1, cI=-1;
          for (const row of rows) {
            if (!row) continue;
            if (!hdr) {
              const s = row.map(v=>String(v||'').toUpperCase()).join('|');
              if ((s.includes('ITEM NO') || s.includes('ITEM\nNO') || s.includes('NO.')) && s.includes('DESCRIPTION')) {
                row.forEach((v,i)=>{
                  const t=String(v||'').toUpperCase().trim();
                  if (t==='QTY') qI=i;
                  if (t==='UOM') uI=i;
                  if (t==='UNIT PRICE' || t.includes('UNIT PRICE')) cI=i;
                });
                hdr=true; continue;
              }
            }
            if (!hdr) continue;
            // Data row: col 1 = item number, col 2 = description
            const _itemNo = row[1]; const _itemNoN = Number(_itemNo);
            if (_itemNo != null && _itemNo !== '' && !isNaN(_itemNoN) && _itemNoN > 0 && row[2]) {
              const desc=String(row[2]).trim();
              if (!desc || desc.toUpperCase()==='N/A') continue;
              const qVal = qI>=0 ? Number(row[qI]) : 1;
              const uVal = uI>=0 ? String(row[uI]||'Lot') : 'Lot';
              const cVal = cI>=0 ? Number(row[cI]) : 0;
              items.push({id:uid(), desc, qty:qVal||1, uom:uVal.replace(/\/S$/i,'').trim(), cost:cVal||0});
            }
          }
          console.log('[CE Import]', sheetName, '→', items.length, 'items');
          return items;
        };
        // ── MISC parser ──
        const parseMisc = () => {
          const m={accommodation:[],transportation:[],requirements:[],adminCost:[],thirdParty:[],insurance:[],allowance:[]};
          const SM={ACCOMODATION:'accommodation',ACCOMMODATION:'accommodation',TRANSPORTATION:'transportation',REQUIREMENTS:'requirements','ADMIN COST':'adminCost','THIRD PARTY SERVICES':'thirdParty','THIRD PARTY':'thirdParty',INSURANCES:'insurance',INSURANCE:'insurance',ALLOWANCE:'allowance'};
          let sec=null;
          for (const row of getSheet('MISC.')) {
            if (!row) continue;
            if (row[2] && typeof row[2]==='string' && /^[A-Z]\.$/.test(row[2].trim())) {
              sec=SM[String(row[3]||'').toUpperCase().trim()]||null; continue;
            }
            if (sec && typeof row[2]==='number' && row[2]>0 && row[3]) {
              const cost=Number(row[10])||Number(row[11])||0;
              if (cost>0) m[sec].push({id:uid(), desc:String(row[3]).trim(), qty:Number(row[7])||1, uom:String(row[8]||'Lot').replace(/\/S$/i,'').trim(), cost});
            }
          }
          return m;
        };
        // Detect sheet role from header content (first 3 non-empty rows) as fallback to sheet name
        const detectSheetRole = (sheetKey) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetKey], {header:1, defval:null});
          for (let i=0; i<Math.min(3,rows.length); i++) {
            const txt = (rows[i]||[]).map(v=>String(v||'').toUpperCase()).join(' ');
            if (txt.includes('PERSONAL PROTECTIVE') || txt.includes('PPE')) return 'ppe';
            if (txt.includes('BILL OF TOOLS') || txt.includes('TOOLS & EQUIP') || txt.includes('TOOLS AND EQUIP') || txt.match(/\bBOTE\b/)) return 'tools';
            if (txt.includes('BILL OF CONSUMABLE') || txt.includes('MATERIALS') || txt.match(/\bBOCM\b/)) return 'mats';
            if (txt.includes('MISCELLANEOUS')) return 'misc';
            if (txt.includes('BILL OF LABOR') || txt.match(/\bBOL\b/)) return 'manpower';
          }
          return null;
        };
        // Build role→sheetKey map: prefer exact name match, fallback to header detection
        const roleMap = {manpower:null, tools:null, mats:null, ppe:null, misc:null};
        const nameRoles = {'BOL':'manpower','BOTE':'tools','BOCM':'mats','PPE':'ppe','MISC':'misc','MISC.':'misc'};
        for (const key of Object.keys(wb.Sheets)) {
          const up = key.toUpperCase().replace('.','');
          for (const [n,r] of Object.entries(nameRoles)) { if (up===n.replace('.','') && !roleMap[r]) { roleMap[r]=key; break; } }
        }
        // Fill remaining roles via header detection
        for (const key of Object.keys(wb.Sheets)) {
          const role = detectSheetRole(key);
          if (role && !roleMap[role]) roleMap[role]=key;
        }
        const missingRoles = Object.entries(roleMap).filter(([,v])=>!v).map(([k])=>k);
        if (missingRoles.length) showToast(`Warning: could not find sheets for: ${missingRoles.join(', ')} in ${file.name}`, true);
        // Override getSheet to use detected keys
        const getSheetByRole = role => roleMap[role] ? XLSX.utils.sheet_to_json(wb.Sheets[roleMap[role]], {header:1, defval:null}) : [];
        const parseResByRole = role => {
          const rows = getSheetByRole(role);
          const items=[]; let hdr=false, nI=-1, dI=-1, qI=-1, uI=-1, cI=-1;
          for (const row of rows) {
            if (!row) continue;
            if (!hdr) {
              const s = row.map(v=>String(v||'').toUpperCase()).join('|');
              if ((s.includes('ITEM NO') || s.includes('ITEM\nNO')) && s.includes('DESCRIPTION')) {
                row.forEach((v,i)=>{
                  const t=String(v||'').toUpperCase().trim();
                  if(t.includes('ITEM NO') || t==='ITEM\nNO.') nI=i;
                  if(t==='DESCRIPTION') dI=i;
                  if(t==='QTY') qI=i;
                  if(t==='UOM') uI=i;
                  if(t==='UNIT PRICE'||t.includes('UNIT PRICE')) cI=i;
                });
                hdr=true; continue;
              }
            }
            if (!hdr) continue;
            const _itemNo = nI>=0 ? row[nI] : (row[1]??row[2]);
            const _itemNoN = Number(_itemNo);
            if (_itemNo!=null && _itemNo!=='' && !isNaN(_itemNoN) && _itemNoN>0) {
              const desc = String(dI>=0 ? (row[dI]||'') : (row[2]||row[3]||'')).trim();
              if (!desc || desc.toUpperCase()==='N/A') continue;
              items.push({id:uid(), desc, qty:qI>=0?Number(row[qI])||1:1, uom:uI>=0?String(row[uI]||'Lot').replace(/\/S$/i,'').trim():'Lot', cost:cI>=0?Number(row[cI])||0:0});
            }
          }
          console.log('[CE Import]', role, '→', items.length, 'items (sheet:', roleMap[role]||'not found', ')');
          return items;
        };
        const parseMiscByRole = () => {
          const m={accommodation:[],transportation:[],requirements:[],adminCost:[],thirdParty:[],insurance:[],allowance:[]};
          const SM={ACCOMODATION:'accommodation',ACCOMMODATION:'accommodation',TRANSPORTATION:'transportation',REQUIREMENTS:'requirements','ADMIN COST':'adminCost','THIRD PARTY SERVICES':'thirdParty','THIRD PARTY':'thirdParty',INSURANCES:'insurance',INSURANCE:'insurance',ALLOWANCE:'allowance'};
          let sec=null;
          for (const row of getSheetByRole('misc')) {
            if (!row) continue;
            const sxIdx = row.findIndex(v => v && typeof v==='string' && /^[A-Z]\.$/.test(String(v).trim()));
            if (sxIdx >= 0) { sec=SM[String(row[sxIdx+1]||'').toUpperCase().trim()]||null; continue; }
            if (sec && typeof row[2]==='number' && row[2]>0 && row[3]) {
              const cost=Number(row[10])||Number(row[11])||0;
              if (cost>0) m[sec].push({id:uid(), desc:String(row[3]).trim(), qty:Number(row[7])||1, uom:String(row[8]||'Lot').replace(/\/S$/i,'').trim(), cost});
            }
          }
          return m;
        };
        // ── BOL (Bill of Labor) parser ──
        const parseBOL = () => {
          const rows = getSheetByRole('manpower');
          const mp = []; let shift = 'regular_day'; let skipSection = false;
          // Fixed col positions from SHIC BOL template (0-indexed):
          // col2=item#, col3=role, col4=pax, col6=days, col7=rate/day, col9=OT hrs/day
          let nI=2, rI=3, pI=4, dI=6, wtI=7, otI=9;
          const shiftKey = (txt) => {
            const t = String(txt||'').toUpperCase();
            const night = t.includes('NIGHT');
            if (t.includes('LEGAL HOLIDAY')) return night ? 'holiday_night' : 'holiday_day';
            if (t.includes('SUNDAY') || t.includes('NON-WORKING')) return night ? 'sunday_night' : 'sunday_day';
            if (t.includes('DAY SHIFT') || t.includes('NIGHT SHIFT')) return night ? 'regular_night' : 'regular_day';
            if (t.includes('REGULAR DAY')) return 'regular_day';
            if (t.includes('REGULAR NIGHT')) return 'regular_night';
            return null;
          };
          for (const row of rows) {
            if (!row) continue;
            // Auto-detect column positions from header row
            if (nI === 2 && row.some(v => String(v||'').toUpperCase().includes('MANPOWER LOADING'))) {
              row.forEach((v,i) => {
                const t = String(v||'').toUpperCase().trim();
                if (t === 'ITEM' || t.startsWith('ITEM NO')) nI = i;
                else if (t === 'MANPOWER LOADING') rI = i;
                else if (t === 'QTY') pI = i;
                else if (t === 'NO. OF DAYS' || t === 'NO OF DAYS') dI = i;
                else if (t === 'RATE PER DAY') wtI = i;
                else if (t.startsWith('OT HRS')) otI = i;
              });
              continue;
            }
            // Section header: look for C.x label anywhere in row (handles merged cells)
            const cxCell = row.find(v => /^C\.\d+$/i.test(String(v||'').trim()));
            if (cxCell !== undefined) {
              const label = row.map(v=>String(v||'')).join(' ');
              if (label.toUpperCase().includes('BENEFITS')) { skipSection = true; continue; }
              const k = shiftKey(label);
              if (k) { shift = k; skipSection = false; }
              continue;
            }
            if (skipSection) continue;
            // Data row
            const itemNo = Number(row[nI]);
            const pax = Number(row[pI]);
            if (!isFinite(itemNo) || itemNo <= 0 || !isFinite(pax) || pax <= 0) continue;
            const role = String(row[rI]||'').trim(); if (!role) continue;
            const daysCnt = Number(row[dI]) || 1;
            const rate = Number(row[wtI]) || 0;
            const otPerDay = Number(row[otI]) || 0;
            /* The sheet's OT HRS column is per day, and so is otHours now -- it used to
               be multiplied out to a total here. */
            mp.push({id:uid(), role, pax, days:daysCnt, otHours:otPerDay, shift, rate, perDiem:0});
          }
          console.log('[CE Import] BOL →', mp.length, 'manpower rows');
          return mp;
        };
        const tools=parseResByRole('tools'), mats=parseResByRole('mats'), ppe=parseResByRole('ppe'), misc=parseMiscByRole(), mpRows=parseBOL();
        const dateStr = dateVal ? dateVal.toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
        const fallbackCeNum = file.name.replace(/\.xlsx?$/i,'').slice(0,30);
        // Derive CE type from project type field (Electrical=onsite, Mechanical=shopworks default)
        const importedCeType = projType==='Electrical' ? 'onsite' : 'shopworks';
        /* The stored total must be what these rows actually cost, computed by
           the same function the editor uses.

           It used to be worked out here by hand as wage only -- pax x days x
           rate x shift -- with no benefits, no OT and no miscellaneous. So an
           imported CE was filed under a total LOWER than its own line items,
           Monitoring showed that figure, and opening the CE recomputed the
           real one. The number appeared to change on load; nothing had
           changed, the two were never the same number. */
        const entry = {
          ceType:importedCeType,
          info:{ceNum:ceNum||fallbackCeNum, date:dateStr, client, location, attention:attention||'SALES DEPARTMENT', endUser:endUser||'C/O SALES', projType, description, dept:'', status:'Submitted', material, qty, days, companyId:null},
          mp:mpRows, tools, mats, ppe, misc,
          notes:[], sowItems:[], approvers:[], mobVehicles:[], demobVehicles:[],
          grand:0, unitP:0, savedBy:currentUser?.username||'import',
          savedAt:new Date(dateStr).toISOString(), _imported:true
        };
        entry.grand = computeCEGrand(entry);
        console.log('[CE Import] Parsed:', {ceNum, description, client, ceType:importedCeType, mp:mpRows.length, tools:tools.length, mats:mats.length, ppe:ppe.length, grand:entry.grand});
        const effCeNum = ceNum || fallbackCeNum;
        const dupIdx = history.findIndex(h => (h.info?.ceNum || h.ceNum) === effCeNum);
        if (dupIdx >= 0) {
          const confirmed = await uiConfirm(`CE ${effCeNum} already exists in history. Overwrite it?`);
          if (!confirmed) { errors.push(file.name + ': skipped (duplicate)'); setCeImportProgress({done, total:list.length, errors}); continue; }
        }
        const res = await dbSaveHistory(entry);
        /* A CE that only reached this browser is not imported. Saying it was
           is how a run of these ended up in SharePoint as headers with a total
           and no line items under them, reported as a clean success. */
        if (res && res.sp === false) {
          errors.push(effCeNum + ': SharePoint refused it — ' + String(res.reason || 'unknown').slice(0, 120));
          setCeImportProgress({done, total: list.length, errors});
          continue;
        }
        done++;
        showToast(`Imported ${effCeNum} — ${mpRows.length} manpower, ${tools.length} tools, ${mats.length} materials, ${ppe.length} PPE.`);
      } catch(ex) { console.error('[CE Import] Error:', ex); errors.push(file.name + ': ' + ex.message); }
      setCeImportProgress({done, total:list.length, errors});
    }
    await loadHist();
    if (errors.length) showToast(`Imported ${done}/${list.length} CE files. ${errors.length} failed: ${errors[0]}`, true);
    else if (list.length > 1) showToast(`Imported ${done} CE files successfully.`);
    setTimeout(()=>setCeImportProgress(null), 3000);
  };
}

function makeImportMonitoringXLSX(getCtx) {
  return async (file) => {
    const {
      MON_KEY,
      currentUser,
      monData,
      setHistory,
      setImportProgress,
      setMonData,
      showToast
    } = getCtx();
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, {type:'array', cellDates:true});
      let ws = null;
      for (const name of wb.SheetNames) {
        const s = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(s);
        if (csv.includes('CE No.')) { ws = s; break; }
      }
      if (!ws) ws = wb.Sheets[wb.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false, dateNF:'yyyy-mm-dd'});
      let headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => c && String(c).trim() === 'CE No.'));
      if (headerIdx < 0) headerIdx = 2;
      const headers = rows[headerIdx].map(h => h ? String(h).trim() : '');
      const col = n => headers.findIndex(h => h.toLowerCase().replace(/\s+/g,'').includes(n.toLowerCase().replace(/\s+/g,'')));

      // Column indices — robust to files with or without CE Date
      const _hn = h => h.toLowerCase().replace(/[\s.]+/g,'');
      const iCeNum=headers.findIndex(h => _hn(h)==='ceno') >= 0 ? headers.findIndex(h => _hn(h)==='ceno') : col('CENo'),
            iRce=headers.findIndex(h => ['rceno','rce','rcenumber'].includes(_hn(h))), iCeName=col('CEName'), iComp=col('CompanyDesignation'),
            iDisc=headers.findIndex(h => { const c=h.toLowerCase().replace(/\s+/g,''); return c==='designation'||c==='discipline'; }), iClient=col('Customer'),
            iTitle=col('JobTitle'), iRecvDate=col('DateRecieved'), iDeadline=col('Deadline'),
            iSubmDate=col('DateSubmitted');
      // Status column header is blank in Google Sheets export — fallback to position after Date Submitted
      const iStatus = col('Column12') >= 0 ? col('Column12') : col('Status') >= 0 ? col('Status') : (iSubmDate >= 0 ? iSubmDate + 1 : -1);
      // Received By and Remarks may also shift if status header was blank
      const iRecvBy   = col('RecievedBy') > iStatus ? col('RecievedBy') : (iStatus >= 0 ? iStatus + 1 : -1);
      const iRemarks  = col('Remarks')    > iStatus ? col('Remarks')    : (iStatus >= 0 ? iStatus + 2 : -1);
      const iStanding = col('Standing');
      // CE Date optional — fall back to Date Received
      const iDate = col('CEDate') >= 0 ? col('CEDate') : iRecvDate;

      const statusMap = {
        'done':'Submitted', 'submitted':'Submitted',
        'ongoing':'Ongoing',
        'revised':'Revised',
        'pending':'Pending',
        'for site insp':'For site Inspection', 'for site inspection':'For site Inspection',
        'for approval':'For Approval',
        'waiting in':'Waiting for Information', 'waiting':'Waiting for Information',
        'waiting for information':'Waiting for Information', 'waiting for info':'Waiting for Information', 'wfi':'Waiting for Information',
        'on hold':'On Hold', 'onhold':'On Hold',
        'awarded':'Awarded', 'won':'Awarded',
        'cancelled':'Cancelled',
        'sourcing':'Sourcing',
        'no quote':'No Quote',
        'no access':'No Access',
        'approved':'Approved',
      };

      const dataRows = rows.slice(headerIdx + 1).filter(r =>
        r && r[iCeNum] && String(r[iCeNum]).trim().match(/CE-\d{4}-\d+/i));
      if (!dataRows.length) { showToast('No CE rows found in the file.', true); return; }

      const existing = await dbGetHistory(null, true).catch(() => []);
      // Map ceNum → history entry for existing CEs
      const existingMap = {};
      existing.forEach(h => {
        const k = (h.info?.ceNum||h.ceNum||'').toUpperCase().trim();
        if (k) existingMap[k] = h;
      });

      const parseDate = v => {
        if (!v) return '';
        try {
          const d = new Date(v);
          if (isNaN(d.getTime())) return '';
          const y = d.getFullYear();
          if (y < 2000 || y > 2100) return '';
          return d.toISOString().slice(0,10);
        } catch { return ''; }
      };

      const toInsert = [];   // new CEs to create
      const monByCeNum = {}; // monitoring data keyed by ceNum (both new + existing)
      let updated = 0;

      for (const r of dataRows) {
        const ceNum = String(r[iCeNum]||'').trim().toUpperCase();
        if (!ceNum) continue;

        const rawStatus = String(r[iStatus]||'').trim();
        const rawLower = rawStatus.toLowerCase();
        // Try map first; if no match use the raw value as-is so nothing is lost
        const appStatus = Object.entries(statusMap).find(([k]) => rawLower.startsWith(k))?.[1] || rawStatus || 'Pending';
        const estimatorName = String(r[iCeName]||'').trim();

        monByCeNum[ceNum] = {
          status: appStatus,
          standing: String(r[iStanding]||'').trim(),
          deadline: parseDate(r[iDeadline]),
          dateSubmitted: parseDate(r[iSubmDate]),
          dateReceived: parseDate(r[iRecvDate]),
          receivedBy: String(r[iRecvBy]||'').trim(),
          ...(iRce >= 0 && String(r[iRce]||'').trim() ? {rceNo: String(r[iRce]).trim()} : {}),
          remarks: String(r[iRemarks]||'').trim(),
          preparedBy: estimatorName,
          ceeName: estimatorName,
          designation: String(r[iDisc]||'').trim(),
        };

        if (existingMap[ceNum]) {
          updated++;
        } else {
          toInsert.push({
            ceType: 'onsite',
            info: {
              ceNum,
              client: String(r[iClient]||'').trim(),
              description: String(r[iTitle]||'').trim(),
              company: String(r[iComp]||'').trim(),
              discipline: String(r[iDisc]||'').trim(),
            },
            mp:[], tools:[], mats:[], ppe:[], misc:{}, notes:[], sowItems:[],
            approvers:[], mobVehicles:[], demobVehicles:[],
            grand:0, unitP:0,
            savedBy: estimatorName,
            savedAt: parseDate(r[iDate]) ? new Date(parseDate(r[iDate])).toISOString() : new Date().toISOString(),
            _imported: true,
          });
        }
      }

      const total = toInsert.length + updated;
      if (!total) { showToast('No valid CE rows found in the file.', true); return; }

      // Preview confirmation before applying
      const preview = [
        `Found ${total} CE row(s) in the file:`,
        `  • ${toInsert.length} new CE(s) to create`,
        `  • ${updated} existing CE(s) to update`,
        '',
        toInsert.length > 0
          ? 'New: ' + toInsert.slice(0,5).map(e => e.info.ceNum).join(', ') + (toInsert.length > 5 ? ` +${toInsert.length-5} more` : '')
          : '',
        '',
        'Proceed with import?'
      ].filter(Boolean).join('\n');
      if (!await uiConfirm(preview)) return;

      // Batch insert new CEs — 5 at a time to avoid SP throttling
      const BATCH = 5;
      setImportProgress({done:0, total});
      let imported = 0;
      const importFails = [];
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const chunk = toInsert.slice(i, i + BATCH);
        const results = await Promise.all(chunk.map(e =>
          spWithRetry(() => dbSaveHistory(e)).catch(err => ({sp: false, reason: err.message}))));
        /* .catch(_e=>logSwallowed('App:L6132',_e)) meant a batch where every CE failed counted as a
           batch where every CE succeeded. */
        results.forEach((r, j) => { if (r && r.sp === false) importFails.push((chunk[j].info?.ceNum || '?') + ': ' + String(r.reason || 'unknown').slice(0, 80)); });
        imported += chunk.length;
        setImportProgress({done: imported, total});
        if (i + BATCH < toInsert.length) await new Promise(res => setTimeout(res, 300));
      }

      // Reload history to get real IDs, apply monitoring data to all matched CEs
      const fresh = await dbGetHistory(null, true).catch(() => []);
      const merged = {...monData};
      for (const h of fresh) {
        const key = (h.info?.ceNum || h.ceNum || '').toUpperCase().trim();
        if (monByCeNum[key]) merged[h.id] = monByCeNum[key];
      }
      setMonData(merged);
      try { localStorage.setItem(MON_KEY, JSON.stringify(merged)); } catch {}
      await dbSaveMonAll(merged, fresh).catch(_e=>logSwallowed('App:L6149',_e));
      setHistory(fresh);
      setImportProgress(null);
      const ok = imported - importFails.length;
      auditLog('xlsx_import', `${ok} CEs added, ${updated} updated${importFails.length ? ', ' + importFails.length + ' FAILED' : ''}`, currentUser?.username);
      if (importFails.length) {
        console.warn('CEs SharePoint would not take:', importFails);
        showToast(`Import finished with problems: ${ok} of ${imported} CEs reached SharePoint, ${updated} monitoring records updated. ${importFails.length} failed — ${importFails[0]}`, true);
      } else {
        showToast(`Import complete: ${ok} CEs added, ${updated} monitoring records updated.`);
      }
    } catch(e) {
      setImportProgress(null);
      showToast('Import failed: ' + e.message, true);
      console.error('importMonitoringXLSX', e);
    }
  };
}

function makeLoadMonData(getCtx) {
  return async () => {
    const {
      MON_KEY,
      _monWroteAt,
      monData,
      setMonData,
      setMonSpIds,
      showToast
    } = getCtx();
    const _fetchAt = Date.now();
    const _keepMine = incoming => {
      const mine = _monWroteAt.current, out = {...incoming};
      let kept = 0;
      Object.keys(mine).forEach(id => { if (mine[id] && mine[id].at >= _fetchAt) { out[id] = mine[id].row; kept++; } });
      if (kept) console.warn('monitoring: kept ' + kept + ' row(s) changed here while the list was loading');
      return out;
    };
    /* Always fetch from SP first; only fall back to localStorage if SP is unreachable */
    setSyncStatus({monitoring:'saving'});
    /* Show the cached monitoring table straight away; the SP result below
       replaces it wholesale once it lands. */
    try {
      const v = localStorage.getItem(MON_KEY);
      if (v) setMonData(JSON.parse(v));
    } catch(_e){logSwallowed('App:App',_e);}
    try {
      /* Clear stale cache before every fetch so deleted SP items are not reused */
      Object.keys(_monSpIdCache).forEach(k => delete _monSpIdCache[k]);
      let r = await dbGetMon();
      if (r && r.parseFailed) {
        /* Items exist in SharePoint but none had readable shicMonData — almost
           always a missing/unpopulated column, not an empty list. Keep whatever
           is cached locally and say what is wrong; this used to delete the
           user's monitoring table and report 'synced'. */
        setSyncStatus({monitoring:'error', sp:'connected'});
        showToast('SharePoint returned ' + r.itemCount + ' monitoring row(s) with no readable data — check the shicMonData column. Showing local copy.', true);
      } else if (r && r.empty && r.definitive) {
        /* The list really is empty. Still do not delete the local copy silently:
           show it, flag it as local-only, and leave discarding to the user. */
        const localCount = Object.keys(monData || {}).length;
        setSyncStatus({monitoring:'local', lastSyncAt: new Date().toISOString(), sp:'connected'});
        if (localCount) showToast('SharePoint monitoring list is empty — showing ' + localCount + ' local row(s). Use Push Local Data to upload them.', true);
      } else if (r && r.data && Object.keys(r.data).length > 0) {
        r = {...r, data: _keepMine(r.data)};
        setMonData(r.data);
        setMonSpIds(new Set(Object.keys(_monSpIdCache)));
        try { localStorage.setItem(MON_KEY, JSON.stringify(r.data)); } catch (e) { console.warn('monitoring not cached locally:', e && e.message); }
        setSyncStatus({monitoring:'synced', lastSyncAt: new Date().toISOString(), sp: 'connected'});
        if (r.legacy) {
          dbSaveMonAll(r.data, []).catch(_e=>logSwallowed('App:App',_e));
        }
      } else {
        /* SP unreachable — fall back to localStorage so user isn't left with nothing */
        try {
          const v = localStorage.getItem(MON_KEY);
          if (v) setMonData(JSON.parse(v));
        } catch(_e){logSwallowed('App:App',_e);}
        setSyncStatus({monitoring:'local'});
      }
    } catch {
      /* SP error — fall back to localStorage */
      try {
        const v = localStorage.getItem(MON_KEY);
        if (v) setMonData(JSON.parse(v));
      } catch(_e){logSwallowed('App:App',_e);}
      setSyncStatus({monitoring:'error'});
    }
  };
}

function makeLoadHist(getCtx) {
  return async () => {
    const {
      canSeeAll,
      currentUser,
      mineToSee,
      setCeNums,
      setHistBusy,
      setHistory
    } = getCtx();
    setHistBusy(true);
    /* Paint the cached history immediately, then refresh from SharePoint in the
       background. Fetching 800+ CEs takes seconds, and blocking the first render
       on it made opening the app feel like it had hung. */
    try {
      const cached = LS.get('history') || [];
      if (cached.length) setHistory(canSeeAll ? cached : cached.filter(h => h.savedBy === currentUser.username || mineToSee(h.id)));
    } catch(_e){logSwallowed('App:L1207',_e);}
    try {
      const spAvail = !!(USE_SP || getSiteURL());
      /* Alongside the history, never instead of it: this is Titles only and
         says nothing about anyone's estimates, but it is what stops two
         people being handed the same number. */
      dbGetCeNumbers().then(ns => { if (ns && ns.length) setCeNums(ns); }).catch(_e=>logSwallowed('App:L1213',_e));
      const h = await dbGetHistory(currentUser.username, canSeeAll, canSeeAll ? null : mineToSee);
      /* Keep LS in sync with SP so fallback is never stale. Only ever write a
         NON-empty result. The old code purged the cache whenever SharePoint
         returned zero rows, which was wrong twice over: a failed/trimmed query
         looks identical to an empty one, and non-admins query with
         `shicSavedBy eq '<user>'` — so zero rows means "none of MINE", not
         "none at all". A brand-new estimator wiped the shared cache. */
      let effective = h;
      if (spAvail && h && h.length > 0) {
        try { LS.set('history', h); } catch (e) { console.warn('history not cached locally:', e && e.message); }
      } else if (spAvail && h && h.length === 0) {
        /* Keep showing the cached list rather than blanking the UI. */
        /* The cache is one key for the whole browser, not one per account: an
           admin who used this machine earlier left EVERYONE's CEs in it. Only
           an admin may be shown it as it stands -- anyone else gets the same
           filter the first paint and the offline path apply. Without it, an
           account with no CEs of its own (a new requestor, say) matched zero
           rows, fell into this branch, and was handed the lot. */
        try {
          const _c = LS.get('history') || [];
          effective = canSeeAll ? _c : _c.filter(x => x.savedBy === currentUser.username || mineToSee(x.id));
        } catch (_e) { effective = []; }
        setSyncStatus({ sp: 'connected' });
      }
      setHistory(effective);
      try{window.shicHistory=effective.map(function(e){return Object.assign({},e.data||{},e);});}catch(_e){logSwallowed('App:L1239',_e);}
      spLoadMLImports().then(function(imports){
        if(imports&&imports.length){
          window.shicHistory=(window.shicHistory||[]).concat(imports);
        }
      }).catch(_e=>logSwallowed('App:L1244',_e));
    } catch (e) {
      /* SP completely unreachable — show whatever is in LS */
      console.warn('loadHist error, using local cache:', e.message);
      try {
        const cached = LS.get('history') || [];
        const u = currentUser.username;
        setHistory(canSeeAll ? cached : cached.filter(h => h.savedBy === u || mineToSee(h.id)));
      } catch(_e){logSwallowed('App:L1252',_e);}
    }
    setHistBusy(false);
  };
}

function makeUpdateMon(getCtx) {
  return (ceId, field, val) => {
    const {
      MON_KEY,
      _monWroteAt,
      currentUser,
      history,
      isRequestor,
      reqOwns,
      setMonData,
      showToast
    } = getCtx();
    return setMonData(prev => {
    if (isRequestor && !reqOwns(ceId, prev)) { console.warn('[blocked] a requestor tried to change CE ' + ceId + ', which they did not raise'); return prev; }
    const fields = (field && typeof field === 'object') ? field : { [field]: val };
    const extra = {};
    /* Stamp who moved a CE and when, on EVERY status change.

       This used to fire only for a hand-picked list, which named 'Issued' and
       'For Review' -- neither a status this app has ever offered -- and missed
       'Submitted' and 'No Quote', the two that most need a trail. A CE moved
       to Ongoing or For site insp. recorded nothing at all, so the history of
       how it got where it is had holes in it.

       Clearing the status back to blank is not a change worth attributing, so
       it is left unstamped. */
    const _has = k => Object.prototype.hasOwnProperty.call(fields, k);
    if (_has('status') && fields.status) {
      const val = fields.status;
      /* A date given with the status is the date it happened -- the panel
         sends both together, and the stamp must not talk over it. */
      extra.statusChangedAt = (_has('statusChangedAt') && fields.statusChangedAt) || new Date().toISOString();
      extra.statusChangedBy = currentUser?.name || currentUser?.username || '';
      /* The whole trail, not just the latest change. statusChangedAt only ever
         held the most recent one, so "who moved this to Submitted, and when did
         it leave For Approval" had no answer -- the previous stamp was
         overwritten the moment the next change landed.

         Capped: a CE that gets toggled daily for a year should not grow an
         unbounded column in a list already at its size limits. The oldest
         entries go first, and the newest 60 are the ones anyone asks about. */
      const before = prev[ceId] || {};
      const log = Array.isArray(before.statusLog) ? before.statusLog : [];
      extra.statusLog = [...log, {
        status: val,
        from: before.status || '',
        at: extra.statusChangedAt,
        by: extra.statusChangedBy
      }].slice(-60);
    }
    /* Remarks keep a trail like status does: every remark, who wrote it and
       when. The remark already on a CE from before the trail existed becomes
       its first entry, undated, rather than being lost to the next edit. */
    if (_has('remarks')) {
      const val = fields.remarks;
      const before = prev[ceId] || {};
      let log = Array.isArray(before.remarksLog) ? before.remarksLog : [];
      if (!log.length && String(before.remarks || '').trim()) log = [{ text: String(before.remarks), at: '', by: '' }];
      if (String(val || '').trim()) log = [...log, { text: String(val).trim(), at: new Date().toISOString(), by: currentUser?.name || currentUser?.username || '' }];
      extra.remarksLog = log.slice(-60);
    }
    /* Correcting when a status changed has to correct the trail too, or the
       history would still show the day it was recorded here rather than the day
       it happened -- which is the whole point of correcting it on a CE entered
       long after the fact. */
    if (_has('statusChangedAt') && !(_has('status') && fields.status)) {
      const val = fields.statusChangedAt;
      const log0 = (prev[ceId] || {}).statusLog;
      if (Array.isArray(log0) && log0.length) {
        extra.statusLog = log0.map((h, i) => i === log0.length - 1 ? {...h, at: val} : h);
      }
    }
    const n = {
      ...prev,
      [ceId]: {
        ...prev[ceId],
        ...fields,
        ...extra
      }
    };
    try {
      _monWroteAt.current[ceId] = { at: Date.now(), row: n[ceId] };
      lsPut(MON_KEY, n, 'this Monitoring change');
      /* Save only the one changed CE entry, not the whole blob -- and within
         that entry, only the fields this edit touched, so a colleague's
         deadline is not written back as it stood when this page was opened. */
      const h = history.find(x => String(x.id) === String(ceId));
      const ceNum = h?.info?.ceNum || h?.ceNum || String(ceId);
      const changed = [...Object.keys(fields), ...Object.keys(extra)];
      dbSaveMonEntry(ceId, ceNum, n[ceId], changed).then(res => {
        if (res && res.ok) {
          /* Show the row the site now holds: anything somebody else changed on
             this CE came back in the merge. */
          if (res.fields) setMonData(p => {
            const m = {...p, [ceId]: res.fields};
            try { localStorage.setItem(MON_KEY, JSON.stringify(m)); } catch (_e) {}
            return m;
          });
          setSyncStatus({monitoring:'synced', lastSyncAt:new Date().toISOString(), sp:'connected', dirty:false});
        } else {
          /* It used to do nothing at all here, so a monitoring edit that
             SharePoint refused looked exactly like one it accepted. */
          setSyncStatus({monitoring:'error', dirty:true});
          showToast('Monitoring change saved in this browser only — SharePoint refused it' +
            (res && res.reason ? ': ' + String(res.reason).slice(0, 100) : '.'), true);
        }
      }).catch(e => {
        setSyncStatus({monitoring:'error', dirty:true});
        showToast('Monitoring save failed: ' + (e && e.message ? e.message : e), true);
      });
    } catch(_e){logSwallowed('App:App',_e);}
    return n;
  });
  };
}

async function readDoc(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      const lib = window.pdfjsLib;
      if (lib) lib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
      const ab = await file.arrayBuffer();
      const pdf = await lib.getDocument({
        data: ab
      }).promise;
      /* Every page, and one line per printed line. It read the first 30 pages
         only, and ran each page into a single line -- so a 42-page tool list
         lost its last 12 pages and every table row ran into the next, which
         is what the AI then had to make sense of. */
      const PDF_MAX_PAGES = 200;
      let t = '';
      for (let i = 1; i <= Math.min(pdf.numPages, PDF_MAX_PAGES); i++) {
        const pg = await pdf.getPage(i);
        const c = await pg.getTextContent();
        let line = '', lastY = null;
        const lines = [];
        c.items.forEach(x => {
          const y = x.transform ? Math.round(x.transform[5]) : lastY;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && line.trim()) { lines.push(line.trim()); line = ''; }
          line += (line && x.str && !/\s$/.test(line) ? ' ' : '') + x.str;
          lastY = y;
          if (x.hasEOL && line.trim()) { lines.push(line.trim()); line = ''; }
        });
        if (line.trim()) lines.push(line.trim());
        t += lines.join('\n') + '\n\n';
      }
      if (pdf.numPages > PDF_MAX_PAGES) t += '[only the first ' + PDF_MAX_PAGES + ' of ' + pdf.numPages + ' pages were read]';
      return t.replace(/[ \t]+/g, ' ').trim();
    } else if (ext === 'docx') {
      const ab = await file.arrayBuffer();
      return (await mammoth.extractRawText({
        arrayBuffer: ab
      })).value.trim();
    } else if (ext === 'xlsx' || ext === 'xls') {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      return wb.SheetNames.map(n => '[' + n + ']\n' + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n\n');
    } else if (['txt', 'csv', 'md'].includes(ext)) {
      return await file.text();
    }
    throw new Error('Unsupported file type: .' + ext + '. Use PDF, DOCX, XLSX or TXT.');
}

