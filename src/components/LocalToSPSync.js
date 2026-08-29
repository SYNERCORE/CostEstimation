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

    /* 1. Users — CREATE ONLY, never update.
       This used to PATCH shicRole/shicStatus for any locally cached account,
       which made it a way around every account rule in the app:
         - the local cache is editable from the browser console, so an admin
           could set their own role to owner (or the owner's to user) and press
           this button to write it to SharePoint, bypassing canManageUser
           entirely and undoing the whole point of the owner role;
         - even with nobody acting in bad faith, a stale cached copy silently
           reverted roles and statuses — someone demoted or disabled in
           SharePoint would be restored by whichever browser still held the old
           record.
       Accounts that already exist in SharePoint are now left exactly as they
       are. That keeps the genuine first-run use (an empty Users list, every
       account a fresh insert) and removes the write that could rewrite an
       existing role. */
    try {
      addLog('Syncing users…');
      const localUsers = (LS.get('users') || []).filter(u => u && u.username);
      let uOk = 0, uFail = 0, uSkip = 0;
      for (const u of localUsers) {
        try {
          const ex = await spGet(spList('Users'), `Title eq '${(u.username||'').replace(/'/g,"''")}'`, 'Id,shicRole');
          if (ex.length) {
            uSkip++;
            addLog(`  — ${u.username}: already in SharePoint, left unchanged`);
            continue;
          }
          /* Ownership is claimed or transferred in the app, never pushed from a
             cache. Clamp anything claiming to be an owner down to admin. */
          const role = String(u.role || 'user').toLowerCase() === 'owner' ? 'admin' : (u.role || 'user');
          if (role !== (u.role || 'user')) addLog(`  ⚠ ${u.username}: pushed as admin — the owner role is set in the app, not here`);
          await spWithRetry(() => spPost(spList('Users'), {
            Title: u.username,
            shicName: u.name || '', shicHash: u.hash || '',
            shicRole: role, shicStatus: u.status || 'pending', shicEmail: u.email || ''
          }));
          uOk++;
        } catch (e2) { uFail++; addLog(`  ✗ ${u.username}: ${e2.message.slice(0,80)}`); }
      }
      addLog(`✅ Users: ${uOk} created${uSkip ? ', ' + uSkip + ' already existed' : ''}${uFail ? ', ' + uFail + ' failed' : ''}`);
      if (uSkip) addLog(`   Existing accounts are never overwritten from here — change roles in the Users tab.`);
      totalOk += uOk; totalFail += uFail;
    } catch (e) { addLog('❌ Users error: ' + e.message); }

    // 2. Masterlist
    try {
      addLog('Syncing masterlist…');
      const ml = LS.get('masterlist');
      if (ml) {
        const r = await dbSaveML(ml);
        /* Same rule as the CEs below: a masterlist that only reached this
           browser has not been synced, whatever the tick says. */
        if (r && r.sp === false) { addLog('✗ Masterlist: SharePoint refused it — ' + String(r.reason || 'unknown').slice(0, 90)); totalFail++; }
        else { addLog('✅ Masterlist synced'); totalOk++; }
      }
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
        /* The CE archive moved to IndexedDB and the migration removes the
           shic:ce_cache:* keys it copied, so reading localStorage alone found
           almost nothing here and reported every CE as a failure. Ask the
           archive first; ce_cache is now only the pre-migration fallback. */
        let full = e;
        if (ceNum !== '(no CE#)') {
          try { full = (await ceGet(ceNum)) || LS.get('ce_cache:' + ceNum) || e; }
          catch (_e) { full = LS.get('ce_cache:' + ceNum) || e; }
        }
        // Skip if history summary only (no detail tabs) — would overwrite SP with empty rows
        const hasDetail = Array.isArray(full.mp) || Array.isArray(full.tools);
        if (!hasDetail) {
          addLog(`  ⚠ ${ceNum}: no line items stored locally — skipped (open and re-save this CE to sync it)`);
          ceFail++;
          continue;
        }
        try {
          const res = await dbSaveHistory({
            ...full,
            savedBy: full.savedBy || 'admin',
            savedAt: full.savedAt || new Date().toISOString()
          });
          /* This is the button that repairs CEs whose rows never reached
             SharePoint, so it above all must not report a browser-only save as
             a sync. dbSaveHistory swallows the SharePoint failure by design and
             returns normally; without this the repair tool would tick every CE
             green while changing nothing. */
          if (res && res.sp === false) {
            ceFail++;
            addLog(`  ✗ ${ceNum}: SharePoint refused it — ${String(res.reason || 'unknown').slice(0,90)}`);
            if (i < hist.length - 1) await new Promise(r => setTimeout(r, 300));
            continue;
          }
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
      'After connecting SharePoint for the first time, use this to upload the CEs, accounts and masterlist stored in THIS browser so other computers can see them. Each person runs it from their own browser for their own data. Accounts that already exist in SharePoint are left untouched — roles and access are changed in the Users tab, never from a local copy.'
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
