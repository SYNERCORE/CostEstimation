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
    id: a && a.id, user: String((a && a.user) || ''), role: (a && a.role) || '', title: (a && a.title) || '', name: (a && a.name) || '',
    step: Math.max(1, parseInt(a && a.step, 10) || (i + 1))
  })).filter(l => l.id && l.user);
}

/* Where the routing stands: who has signed, which step is open, who it waits on. */
function apvStatus(approvers, apv) {
  const lines = apvRoute(approvers);
  const signed = (apv && apv.lines) || {};
  /* A signatory who is away and holding everyone up can be skipped by an
     admin. The line is not signed -- it never will be -- but it no longer
     waits on anybody, so the routing moves on. */
  const skipped = (apv && apv.skipped) || {};
  const open = lines.filter(l => !signed[l.id] && !skipped[l.id]);
  const step = open.length ? Math.min.apply(null, open.map(l => l.step)) : null;
  const waiting = open.filter(l => l.step === step);
  const signedN = lines.filter(l => signed[l.id]).length;
  return { lines, signedN, skippedN: lines.filter(l => skipped[l.id]).length, total: lines.length,
    step, waiting, done: lines.length > 0 && !open.length };
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
  /* Who has already signed, by username. The waiting list alone was not
     enough: a mirror left behind by a failed or older write still named a
     signatory who had signed, so the CE stayed in their For my approval. */
  /* Only those with nothing left to sign. One person can hold two lines on a
     CE -- Reviewed and Approved by the same manager -- and having signed the
     first, they were listed as done: the CE left their "Awaiting my
     signature" while it was still waiting on them, with no way to reach it
     from the list. */
  const _signed = (apv && apv.lines) || {};
  const _owes = new Set(s.lines.filter(l => !_signed[l.id] && !((apv && apv.skipped) || {})[l.id]).map(l => l.user));
  const signedBy = Object.values(_signed).map(l => (l && l.by) || '').filter(u => u && !_owes.has(u));
  return { state: st, waiting: st === 'pending' ? s.waiting.map(l => l.user) : [], signedBy: signedBy,
    signed: s.signedN, total: s.total, at: new Date().toISOString() };
}
/* Whether the CE on this Monitoring row is waiting on this person's signature.
   One answer for My Work, the Monitoring filter and the row badge alike. */
function apvMonWaitsOn(m, username) {
  const a = (m && m.apv) || null;
  if (!a || a.state !== 'pending' || !username) return false;
  if ((a.signedBy || []).includes(username)) return false;
  return (a.waiting || []).includes(username);
}

/* Burn who signed and when into the signature image itself: a faint diagonal
   name across the strokes and a line of text beneath them. A copy of the
   image lifted onto another document still says whose it is and when. */
function apvStamp(dataUrl, who, when, ceNum, title) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const W = 420, H = title ? 198 : 180, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
        x.drawImage(img, 0, 0, W, 140);
        x.save(); x.translate(W / 2, 72); x.rotate(-0.2);
        x.fillStyle = 'rgba(30,123,52,0.16)'; x.font = 'bold 24px Arial'; x.textAlign = 'center';
        x.fillText('E-SIGNED · ' + who, 0, 8); x.restore();
        x.fillStyle = '#1E7B34'; x.font = 'bold 12px Arial'; x.textAlign = 'left';
        x.fillText('E-signed by ' + who, 6, 156);
        let y = 172;
        if (title) { x.font = 'italic 11px Arial'; x.fillText(title, 6, y); y += 16; }
        x.font = '11px Arial';
        x.fillText(when + (ceNum ? '  ·  ' + ceNum : ''), 6, y);
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

/* The signatures a CE may show. While a routing is live, a routed line's
   signature stands only for as long as that line is signed in the current
   approval: a revision, or a fresh submission, starts with none signed, and
   the stamped image left over from the round before used to draw on anyway,
   so a signatory saw their own signature on a CE that was still waiting for
   it. Lines outside the routing, signed by hand, are untouched. */
function apvVisibleSigs(approvers, apv, sigs) {
  const st = (apv && apv.state) || 'none';
  if (st !== 'pending' && st !== 'approved') return {...(sigs || {})};
  const signed = (apv && apv.lines) || {};
  const routed = new Set(apvRoute(approvers).map(l => String(l.id)));
  const out = {};
  Object.keys(sigs || {}).forEach(k => { if (!routed.has(String(k)) || signed[k]) out[k] = sigs[k]; });
  return out;
}

/* Everything a signatory is putting their name to, not only the totals: the
   header, scope, notes and every priced line. Built from normalised fields
   and sorted, so the same CE gives the same answer whether it came from the
   editor or back from SharePoint. */
function apvContentSig(ce) {
  if (!ce) return '';
  const s = v => String(v == null ? '' : v).trim(), n = v => String(Math.round(N(v) * 100) / 100);
  const rows = (a, f) => (Array.isArray(a) ? a : []).filter(r => r && (r.desc || r.role)).map(f).sort().join(';');
  const inf = ce.info || {};
  const txt = [apvFigSig(ce),
    ['client', 'description', 'location', 'attention', 'endUser', 'projType', 'material', 'dept', 'qty', 'days'].map(k => s(inf[k])).join('|'),
    s(ce.scope),
    (Array.isArray(ce.notes) ? ce.notes : []).map(x => s(x && typeof x === 'object' ? x.text : x)).join('|'),
    rows(ce.mp, r => [s(r.role), n(r.rate), s(r.shift), n(r.days), n(r.pax), n(r.otHours)].join(',')),
    rows(ce.tools, r => [s(r.desc), n(r.qty), s(r.uom), n(r.cost), n(r.days)].join(',')),
    rows(ce.mats, r => [s(r.desc), n(r.qty), s(r.uom), n(r.cost)].join(',')),
    rows(ce.ppe, r => [s(r.desc), n(r.qty), s(r.uom), n(r.cost)].join(','))].join('#');
  let h = 5381;
  for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
  return h.toString(36) + '.' + txt.length;
}

/* Two approvers signing at the same moment each wrote back the whole CE, so
   the one that landed second carried the trail from before the first. The
   two trails are folded into one, in order, with nothing counted twice. */
function apvMergeLog(a, b) {
  const out = [], seen = new Set();
  [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].forEach(l => {
    if (!l) return;
    const k = [l.at, l.by, l.action, l.role || '', l.comment || ''].join('|');
    if (seen.has(k)) return;
    seen.add(k); out.push(l);
  });
  return out.sort((x, y) => String(x.at || '').localeCompare(String(y.at || '')));
}

/* What a Return keeps. A CE sent back for a wording change used to lose every
   signature on it, so three people signed again for a change none of them had
   asked about. The signatures stand while the CE they were put to stands: the
   estimator's next save clears them if -- and only if -- the figures or the
   wording actually change, which is the same rule as everywhere else.

   Returning is still a full stop: the approval leaves 'pending', so nobody is
   waiting on anything until it is submitted again. */
function apvKeepOnReturn(approvers, apv, sigs) {
  const lines = {}, route = apvRoute(approvers);
  const signed = (apv && apv.lines) || {};
  route.forEach(l => { if (signed[l.id] && (sigs || {})[l.id]) lines[l.id] = signed[l.id]; });
  return lines;
}
/* Submitting again after a Return. The signatures already collected count
   only while the CE is the one they were put to; anything else starts over. */
function apvResume(ce, prev) {
  const a = prev || {};
  if (a.state !== 'returned' || !Object.keys(a.lines || {}).length) return {};
  if (!a.contentSig || apvContentSig(ce) !== a.contentSig) return {};
  if (!a.figSig || apvFigSig(ce) !== a.figSig) return {};
  return {...(a.lines || {})};
}
