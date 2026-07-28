function LocalToSPSync() {
  const [busy, setBusy] = React.useState(false);
  const [log, setLog] = React.useState([]);
  const [done, setDone] = React.useState(false);
  const addLog = msg => setLog(p => [...p, msg]);

  const handleSync = async () => {
    if (!getSiteURL()) { setLog(['❌ SharePoint not connected. Set Site URL in the SP setup above first.']); return; }
    if (!window.confirm('Push all local data (users, CE history, masterlist) to SharePoint? Existing SP records will be updated, not deleted.')) return;
    setBusy(true); setDone(false); setLog([]);

    // 1. Users
    try {
      addLog('Syncing users…');
      const localUsers = (LS.get('users') || []).filter(u => u && u.username);
      let uOk = 0;
      for (const u of localUsers) {
        try {
          await spWithRetry(() => spPost(spList('Users'), {
            Title: u.username, shicName: u.name || '', shicHash: u.hash || '',
            shicRole: u.role || 'user', shicStatus: u.status || 'pending', shicEmail: u.email || ''
          }));
          uOk++;
        } catch (e) {
          // may already exist — try patch by Title lookup
          try {
            const ex = await spGet(spList('Users'), `Title eq '${(u.username||'').replace(/'/g,"''")}'`, 'Id');
            if (ex.length) {
              await spWithRetry(() => spPatch(spList('Users'), ex[0].Id, {
                shicName: u.name || '', shicHash: u.hash || '',
                shicRole: u.role || 'user', shicStatus: u.status || 'pending', shicEmail: u.email || ''
              }));
              uOk++;
            }
          } catch (e2) { addLog(`  ✗ ${u.username}: ${e2.message.slice(0,60)}`); }
        }
      }
      addLog(`✅ Users: ${uOk}/${localUsers.length} synced`);
    } catch (e) { addLog('❌ Users error: ' + e.message); }

    // 2. Masterlist
    try {
      addLog('Syncing masterlist…');
      const ml = LS.get('masterlist');
      if (ml) { await dbSaveML(ml); addLog('✅ Masterlist synced'); }
      else addLog('— Masterlist: nothing local to sync');
    } catch (e) { addLog('❌ Masterlist error: ' + e.message); }

    // 3. CE History
    try {
      addLog('Syncing CE history…');
      const hist = LS.get('history') || [];
      let ceOk = 0, ceFail = 0;
      for (const e of hist) {
        // Load full CE from cache if available
        const ceNum = e.info?.ceNum || e.ceNum || '';
        const full = (ceNum && LS.get('ce_cache:' + ceNum)) || e;
        try {
          await dbSaveHistory({
            ...full,
            savedBy: full.savedBy || 'admin',
            savedAt: full.savedAt || new Date().toISOString()
          });
          ceOk++;
          addLog(`  ✓ ${ceNum}`);
        } catch (err) { ceFail++; addLog(`  ✗ ${ceNum}: ${err.message.slice(0,60)}`); }
      }
      addLog(`✅ CE History: ${ceOk} synced, ${ceFail} failed`);
    } catch (e) { addLog('❌ CE History error: ' + e.message); }

    setDone(true);
    setBusy(false);
    addLog('🎉 Sync complete! Other users can now log in and see all data.');
  };

  const connected = !!getSiteURL();
  return React.createElement('div', null,
    React.createElement('div', {style:{fontWeight:700,fontSize:13,marginBottom:4,color:OK}}, '☁ Push Local Data to SharePoint'),
    React.createElement('div', {style:{fontSize:11,color:MT,marginBottom:10,lineHeight:1.6}},
      'After connecting SharePoint for the first time, use this to upload all your existing local CEs, users, and masterlist to SP so other computers can access them.'
    ),
    !connected && React.createElement('div', {style:{fontSize:11,color:ERR,marginBottom:8}},
      '⚠ SharePoint not connected. Complete the SP setup above first.'
    ),
    React.createElement('button', {
      style: {...btn('ok'), opacity: connected ? 1 : 0.5},
      disabled: busy || !connected,
      onClick: handleSync
    }, busy ? 'Syncing…' : '↑ Push All Local Data to SharePoint'),
    log.length > 0 && React.createElement('div', {
      style: {marginTop:10, maxHeight:220, overflowY:'auto', background:SURF, border:'1px solid '+BDR, borderRadius:6, padding:'8px 10px'}
    }, log.map((l, i) => React.createElement('div', {
      key: i,
      style: {fontSize:11, fontFamily:"'JetBrains Mono',monospace", color: l.startsWith('❌')||l.startsWith('  ✗') ? ERR : l.startsWith('✅')||l.startsWith('  ✓')||l.startsWith('🎉') ? OK : MT, marginBottom:2}
    }, l))),
    done && React.createElement('div', {style:{marginTop:8,fontSize:11,color:OK,fontWeight:600}},
      'Done! Tell other users to refresh the app — they will see all the data.'
    )
  );
}
