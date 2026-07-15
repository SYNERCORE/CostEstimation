const N = v => parseFloat(v) || 0;
const ph = n => (n || 0).toLocaleString("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const uid = () => { try { return crypto.randomUUID(); } catch { return Date.now().toString(36) + Math.random().toString(36).slice(2); } };
function nextCeNum(history, cePrefix) {
  const yr = new Date().getFullYear();
  const pfx = ((cePrefix || 'SHIC') + '-CE-' + yr + '-').toUpperCase();
  let max = 0;
  (history || []).forEach(h => {
    const n = ((h.info && h.info.ceNum) || '').toUpperCase().replace(/-R\d+$/i, '');
    if (n.startsWith(pfx)) {
      const num = parseInt(n.slice(pfx.length)) || 0;
      if (num > max) max = num;
    }
  });
  return pfx + String(max + 1).padStart(4, '0');
}
function nextCeNumForCompany(history, company) {
  return nextCeNum(history, (company && company.cePrefix) ? company.cePrefix : 'SHIC');
}
const mkMP = () => ({
  id: uid(),
  role: "",
  pax: 1,
  days: 1,
  otHours: 0,
  shift: "regular_day",
  rate: 0,
  perDiem: 0
});
const mkVeh = () => ({
  id: uid(),
  desc: "",
  qty: 1,
  days: 1,
  rate: 0,
  uom: "Day"
});
const mkRes = () => ({
  id: uid(),
  desc: "",
  qty: 1,
  uom: "Lot",
  cost: 0
});
const BLANK_INFO = {
  ceNum: "SHIC-CE-" + new Date().getFullYear() + "-0001",
  date: new Date().toISOString().slice(0, 10),
  client: "",
  location: "",
  attention: "SALES DEPARTMENT",
  endUser: "C/O SALES",
  projType: "Electrical",
  description: "",
  dept: "",
  status: "FOR REVIEW",
  material: "",
  qty: "1",
  days: "",
  companyId: null
};
const BLANK_MISC = {
  accommodation: [],
  transportation: [],
  requirements: [],
  adminCost: [],
  thirdParty: [],
  insurance: [],
  allowance: []
};
const mkMiscRow = () => ({
  id: uid(),
  desc: '',
  qty: 1,
  uom: 'Lot',
  cost: 0
});
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s + 'sy3_salt_2026'));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
const _hex = buf => Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2,'0')).join('');
async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:200000}, key, 256);
  return 'pbkdf2:' + _hex(salt.buffer) + ':' + _hex(bits);
}
async function verifyPassword(pw, stored) {
  if (stored && stored.startsWith('pbkdf2:')) {
    const parts = stored.split(':');
    const salt = new Uint8Array(parts[1].match(/.{2}/g).map(h => parseInt(h,16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations:200000}, key, 256);
    return _hex(bits) === parts[2];
  }
  // Legacy SHA-256 fallback
  return await sha256(pw) === stored;
}