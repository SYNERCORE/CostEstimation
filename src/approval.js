/* Approval routing for a CE.

   Each signatory line can be linked to a user account (approver.user) and
   given a step (approver.step). Lines on the same step can sign at the same
   time; the next step opens once every line on the current one has signed --
   one after another, all at once, or any mix, the way Box routes a review.
   A line with no user linked takes no part in the routing and can still be
   signed by hand, as before.

   The approval record rides on the CE's info object (info.approval), which is
   saved, loaded, drafted and cached whole, so it needs no columns of its own:

     { state: 'pending' | 'approved' | 'returned',
       submittedAt, submittedBy, figSig,
       lines: { <approver id>: { at, by, byName } },
       log:   [{ at, by, byName, action, comment }] }

   figSig fingerprints the figures that were submitted. If they change, every
   signature is cleared and the CE goes back to the first step: a signature
   always belongs to the figures it approved. */

function apvFigSig(ce) {
  if (!ce) return '';
  const p = computeCEParts(ce);
  const c = v => Math.round(N(v) * 100);
  const info = ce.info || {};
  return [c(p.total), c(p.mob), c(p.demob), c(p.mpT), c(p.toolsT), c(p.matsT), c(p.ppeT), c(p.miscT),
    N(ce.margin), N(info.qty) || 1, JSON.stringify(Array.isArray(info.perJob) ? info.perJob.slice().sort() : [])].join('|');
}

/* The lines that take part in the routing, in signing order. */
function apvRoute(approvers) {
  return (Array.isArray(approvers) ? approvers : []).map((a, i) => ({
    id: a && a.id, user: String((a && a.user) || ''), role: (a && a.role) || '', name: (a && a.name) || '',
    step: Math.max(1, parseInt(a && a.step, 10) || (i + 1))
  })).filter(l => l.id && l.user);
}

/* Where the routing stands: who has signed, which step is open, who it waits on. */
function apvStatus(approvers, apv) {
  const lines = apvRoute(approvers);
  const signed = (apv && apv.lines) || {};
  const open = lines.filter(l => !signed[l.id]);
  const step = open.length ? Math.min.apply(null, open.map(l => l.step)) : null;
  const waiting = open.filter(l => l.step === step);
  return { lines, signedN: lines.length - open.length, total: lines.length, step, waiting, done: lines.length > 0 && !open.length };
}

/* The line this user may sign now, or null. */
function apvCanSign(approvers, apv, username) {
  if (!apv || apv.state !== 'pending' || !username) return null;
  return apvStatus(approvers, apv).waiting.find(l => l.user === username) || null;
}

/* The summary kept on the CE Monitoring row, so the list can show where
   each CE stands and whose signature it waits on without opening it. */
function apvMirror(approvers, apv) {
  const s = apvStatus(approvers, apv);
  const st = (apv && apv.state) || 'none';
  return { state: st, waiting: st === 'pending' ? s.waiting.map(l => l.user) : [], signed: s.signedN, total: s.total, at: new Date().toISOString() };
}

/* Burn who signed and when into the signature image itself: a faint diagonal
   name across the strokes and a line of text beneath them. A copy of the
   image lifted onto another document still says whose it is and when. */
function apvStamp(dataUrl, who, when, ceNum) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = 420, H = 180, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
        x.drawImage(img, 0, 0, W, 140);
        x.save(); x.translate(W / 2, 72); x.rotate(-0.2);
        x.fillStyle = 'rgba(30,123,52,0.16)'; x.font = 'bold 24px Arial'; x.textAlign = 'center';
        x.fillText('E-SIGNED · ' + who, 0, 8); x.restore();
        x.fillStyle = '#1E7B34'; x.font = 'bold 12px Arial'; x.textAlign = 'left';
        x.fillText('E-signed by ' + who, 6, 156);
        x.font = '11px Arial';
        x.fillText(when + (ceNum ? '  ·  ' + ceNum : ''), 6, 172);
        resolve(c.toDataURL('image/png'));
      } catch (e) { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function apvWhen(iso) {
  try { return new Date(iso).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return String(iso || ''); }
}

/* The signatures with every routed line's removed. Hand-signed lines keep
   theirs: they were never part of the routing. */
function apvStripSigs(approvers, sigs) {
  const ids = new Set(apvRoute(approvers).map(l => String(l.id)));
  const out = {};
  Object.keys(sigs || {}).forEach(k => { if (!ids.has(String(k))) out[k] = sigs[k]; });
  return out;
}
