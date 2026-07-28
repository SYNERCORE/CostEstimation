function LocalToSPSync() {
  const [busy, setBusy] = React.useState(false);
  const [log, setLog] = React.useState([]);
  const [done, setDone] = React.useState(false);
  const [counts, setCounts] = React.useState(null);
  const addLog = msg => setLog(p => [...p, msg]);

  const handleSync = async () => {
    if (!getSiteURL()) { setLog(['❌ SharePoint not connected. Set Site URL in the SP setup above first.']); return; }
    if (!window.confirm('Push all local data (users, CE history, masterlist) to SharePoint?\n\nExisting SP records will be updated — nothing is deleted.')) return;
    setBusy(true); setDone(false); setLog([]); setCounts(null);

    let totalOk = 0, totalFail = 0;

    // 1. Users
    try {
      addLog('Syncing users…');
      const localUsers = (LS.get('users') || []).filter(u => u && u.username);
      let uOk = 0, uFail = 0;
      for (const u of localUsers) {
        try {
          // Check if already exists first to avoid relying on POST error as branch signal
          const ex = await spGet(spList('Users'), `Title eq '${(u.username||'').replace(/'/g,"''")}'`, 'Id');
          const payload = {
            shicName: u.name || '', shicHash: u.hash || '',
            shicRole: u.role || 'user', shicStatus: u.status || 'pending', shicEmail: u.email || ''
          };
          if (ex.length) {
            await spWithRetry(() => spPatch(spList('Users'), ex[0].Id, payload));
          } else {
            await spWithRetry(() => spPost(spList('Users'), { Title: u.username, ...payload }));
          }
          uOk++;
        } catch (e2) { uFail++; addLog(`  ✗ ${u.username}: ${e2.message.slice(0,80)}`); }
      }
      addLog(`✅ Users: ${uOk}/${localUsers.length} synced${uFail ? ', ' + uFail + ' failed' : ''}`);
      totalOk += uOk; totalFail += uFail;
    } catch (e) { addLog('❌ Users error: ' + e.message); }

    // 2. Masterlist
    try {
      addLog('Syncing masterlist…');
      const ml = LS.get('masterlist');
      if (ml) { await dbSaveML(ml); addLog('✅ Masterlist synced'); totalOk++; }
      else addLog('— Masterlist: nothing local to sync');
    } catch (e) { addLog('❌ Masterlist error: ' + e.message); totalFail++; }

    // 3. CE History — throttled to avoid SP rate limits
    try {
      addLog('Syncing CE history…');
      const hist = LS.get('history') || [];
      if (!hist.length) { addLog('— CE History: nothing local to sync'); }
      let ceOk = 0, ceFail = 0;
      for (let i = 0; i < hist.length; i++) {
        const e = hist[i];
        const ceNum = e.info?.ceNum || e.ceNum || '(no CE#)';
        // Prefer full cached data (has mp/tools/mats/ppe); fall back to history summary
        const full = (ceNum !== '(no CE#)' && LS.get('ce_cache:' + ceNum)) || e;
        // Skip if history summary only (no detail tabs) — would overwrite SP with empty rows
        const hasDetail = Array.isArray(full.mp) || Array.isArray(full.tools);
        if (!hasDetail) {
          addLog(`  ⚠ ${ceNum}: no detail data in cache — skipped (load & re-save this CE to sync it)`);
          ceFail++;
          continue;
        }
        try {
          await dbSaveHistory({
            ...full,
            savedBy: full.savedBy || 'admin',
            savedAt: full.savedAt || new Date().toISOString()
          });
          ceOk++;
          addLog(`  ✓ ${ceNum} (${i+1}/${hist.length})`);
        } catch (err) {
          ceFail++;
          addLog(`  ✗ ${ceNum}: ${err.message.slice(0,80)}`);
        }
        // Throttle: 300 ms between CEs to avoid SP 429 rate limiting
        if (i < hist.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      addLog(`✅ CE History: ${ceOk} synced, ${ceFail} skipped/failed`);
      totalOk += ceOk; totalFail += ceFail;
    } catch (e) { addLog('❌ CE History error: ' + e.message); }

    setCounts({ok: totalOk, fail: totalFail});
    setDone(true);
    setBusy(false);
    if (totalFail === 0) {
      addLog('🎉 Sync complete! Tell other users to refresh the app.');
    } else {
      addLog(`⚠ Sync done with ${totalFail} issue(s). Items marked ✗ or ⚠ were not pushed — check log above.`);
    }
  };

  const connected = !!getSiteURL();
  return React.createElement('div', null,
    React.createElement('div', {style:{fontWeight:700,fontSize:13,marginBottom:4,color:OK}}, '☁ Push Local Data to SharePoint'),
    React.createElement('div', {style:{fontSize:11,color:MT,marginBottom:10,lineHeight:1.6}},
      'After connecting SharePoint for the first time, use this to upload the local CEs, users, and masterlist stored in THIS browser to SP so other computers can access them. Each user must run this from their own browser to sync their own data.'
    ),
    !connected && React.createElement('div', {style:{fontSize:11,color:ERR,marginBottom:8}},
      '⚠ SharePoint not connected. Complete the SP setup above first.'
    ),
    React.createElement('button', {
      style: {...btn('ok'), opacity: connected ? 1 : 0.5},
      disabled: busy || !connected,
      onClick: handleSync
    }, busy ? 'Syncing… (do not close this tab)' : '↑ Push All Local Data to SharePoint'),
    log.length > 0 && React.createElement('div', {
      style: {marginTop:10, maxHeight:260, overflowY:'auto', background:SURF, border:'1px solid '+BDR, borderRadius:6, padding:'8px 10px'}
    }, log.map((l, i) => React.createElement('div', {
      key: i,
      style: {
        fontSize:11, fontFamily:"'JetBrains Mono',monospace", marginBottom:2,
        color: (l.startsWith('❌')||l.startsWith('  ✗')) ? ERR
             : (l.startsWith('⚠')||l.startsWith('  ⚠')) ? '#F59E0B'
             : (l.startsWith('✅')||l.startsWith('  ✓')||l.startsWith('🎉')) ? OK
             : MT
      }
    }, l))),
    done && counts && React.createElement('div', {
      style:{marginTop:8,fontSize:12,fontWeight:700,color: counts.fail === 0 ? OK : '#F59E0B',
             padding:'8px 12px',background:SURF,borderRadius:6,border:'1px solid '+BDR}
    }, counts.fail === 0
      ? `✅ All ${counts.ok} item(s) pushed successfully. Other users can now refresh and log in.`
      : `⚠ ${counts.ok} pushed, ${counts.fail} had issues. Items marked ✗/⚠ above were NOT synced.`
    )
  );
}
