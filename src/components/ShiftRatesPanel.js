/* The company standard shift and overtime multipliers.

   These were constants in config.js, so a new government ruling needed a code
   change and a build. Set here, they are shared through SharePoint and every
   NEW CE starts on them. A saved CE keeps the multipliers it was quoted at --
   a CE never silently reprices -- and any CE can still be changed on its own
   Manpower tab. */
function ShiftRatesPanel() {
  const blank = () => {
    const s = stdRates();
    const v = {};
    Object.keys(SHIFTS).forEach(k => { v[k] = String(s.shiftMults[k]); });
    v.ot = String(s.otMult);
    return v;
  };
  const [vals, setVals] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    dbGetShiftRates().then(() => { setVals(blank()); }).catch(e => setMsg('Could not load: ' + e.message.slice(0, 90)));
  }, []);

  const ok = x => { const n = parseFloat(x); return isFinite(n) && n > 0; };
  const allOk = Object.values(vals).every(ok);

  const save = async () => {
    if (!allOk) { setMsg('Every multiplier must be a number above zero.'); return; }
    if (!window.confirm('Set these as the company standard?\n\nEvery NEW CE will start on them. Saved CEs keep the multipliers they were quoted at.')) return;
    setBusy(true); setMsg('');
    const shiftMults = {};
    Object.keys(SHIFTS).forEach(k => { shiftMults[k] = parseFloat(vals[k]); });
    const obj = { shiftMults, otMult: parseFloat(vals.ot), updatedAt: new Date().toISOString() };
    try {
      const sp = await dbSaveShiftRates(obj);
      setDirty(false);
      setMsg(sp ? 'Saved — every user’s next new CE starts on these.' : 'Saved to this browser only — SharePoint did not accept it.');
    } catch (e) { setMsg('Save failed: ' + e.message.slice(0, 120)); }
    setBusy(false);
  };

  const field = (k, label, legacy) => React.createElement('div', { key: k, style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
    React.createElement('span', { style: { flex: 1, fontSize: 12 } }, label),
    React.createElement('input', {
      type: 'number', min: '0', step: '0.05', value: vals[k],
      style: { ...INP, ...MONO, width: 80, textAlign: 'right', fontSize: 12, padding: '4px 6px', ...(ok(vals[k]) ? {} : { borderColor: '#F85149' }) },
      onChange: e => { const v = e.target.value; setVals(p => ({ ...p, [k]: v })); setDirty(true); }
    }),
    React.createElement('span', { style: { fontSize: 11, color: MT, width: 90 } }, '×  (was ' + legacy + ')'));

  return React.createElement('div', null,
    React.createElement(ToolPowerSwitch, null),
    React.createElement('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 4 } }, 'Shift Multipliers'),
    React.createElement('div', { style: { fontSize: 11, color: MT, marginBottom: 12, lineHeight: 1.5 } },
      'The company standard for new CEs. Change these when a new labour ruling comes out. Saved CEs keep what they were quoted at; a single CE can still be changed on its Manpower tab.'),
    React.createElement('div', { style: { maxWidth: 420 } },
      Object.entries(SHIFTS).map(([k, s]) => field(k, s.label, s.mult)),
      field('ot', 'Overtime (× hourly rate)', OT_MULT_DEFAULT)),
    React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } },
      React.createElement('button', { style: btn('acc', true), disabled: busy || !dirty || !allOk, onClick: save }, busy ? 'Saving…' : 'Save standard'),
      React.createElement('button', {
        style: btn('def', true), disabled: busy,
        title: 'Fill in the original statutory figures (not saved until you press Save)',
        onClick: () => { const v = {}; Object.keys(SHIFTS).forEach(k => { v[k] = String(SHIFTS[k].mult); }); v.ot = String(OT_MULT_DEFAULT); setVals(v); setDirty(true); }
      }, 'Reset to original'),
      msg && React.createElement('span', { style: { fontSize: 11, color: MT } }, msg)));
}

/* Company-wide on/off for tool power (kW x run hours). */
function ToolPowerSwitch() {
  const [on, setOn] = React.useState(toolPowerEnabled());
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  React.useEffect(() => { dbGetFeatures().then(() => setOn(toolPowerEnabled())).catch(() => {}); }, []);
  const flip = async () => {
    const next = !on;
    if (!window.confirm(next
      ? 'Turn tool power ON?\n\nThe kW, Run hrs and Power columns come back on ShopWorks tools, and power is added to the totals.'
      : 'Turn tool power OFF?\n\nThe kW columns are hidden and no CE counts power in its totals until it is switched back on. Figures already typed are kept.')) return;
    setBusy(true); setMsg('');
    let cur = {}; try { cur = await dbGetFeatures() || {}; } catch (e) {}
    const sp = await dbSaveFeatures({ ...cur, toolPower: next, updatedAt: new Date().toISOString() });
    setOn(next); setBusy(false);
    try { window.dispatchEvent(new Event('shic-features')); } catch (e) {}
    setMsg(sp ? 'Saved for everyone.' : 'Saved to this browser only — SharePoint did not accept it.');
  };
  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 12px', border: '1px solid ' + BDR, borderRadius: 8 } },
    React.createElement('div', { style: { flex: 1 } },
      React.createElement('div', { style: { fontWeight: 700, fontSize: 14 } }, '⚡ Tool Power (kW usage)'),
      React.createElement('div', { style: { fontSize: 11, color: MT, lineHeight: 1.5 } }, 'Electricity for tools: kW × run hours × tariff. Off hides the columns and leaves power out of every total.')),
    React.createElement('button', {
      role: 'switch', 'aria-checked': on, disabled: busy, onClick: flip, title: on ? 'On — click to turn off' : 'Off — click to turn on',
      style: { width: 46, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: on ? '#16a34a' : '#8b949e', flexShrink: 0 }
    }, React.createElement('span', { style: { position: 'absolute', top: 3, left: on ? 25 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' } })),
    React.createElement('b', { style: { fontSize: 12, width: 28, color: on ? '#16a34a' : MT } }, on ? 'ON' : 'OFF'),
    msg && React.createElement('span', { style: { fontSize: 11, color: MT } }, msg));
}
