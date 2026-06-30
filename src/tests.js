// SHIC CE Automated Test Suite — runs in-browser, no build step needed
// Open browser console and call: SHIC_TESTS.run()
// Or add ?run_tests to the URL to auto-run on load

(function () {
  'use strict';

  let _passed = 0, _failed = 0, _results = [];

  function assert(name, condition, detail) {
    if (condition) {
      _passed++;
      _results.push({ ok: true, name });
    } else {
      _failed++;
      _results.push({ ok: false, name, detail: detail || 'assertion failed' });
      console.error('[FAIL]', name, detail || '');
    }
  }

  function assertEqual(name, actual, expected) {
    const ok = actual === expected;
    assert(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  function assertApprox(name, actual, expected, tol = 0.001) {
    const ok = Math.abs(actual - expected) <= tol;
    assert(name, ok, ok ? '' : `expected ~${expected}, got ${actual}`);
  }

  // ─── N() ───────────────────────────────────────────────────────────────────
  function testN() {
    assertEqual('N: number passthrough', N(42), 42);
    assertEqual('N: string number', N('3.14'), 3.14);
    assertEqual('N: empty string → 0', N(''), 0);
    assertEqual('N: null → 0', N(null), 0);
    assertEqual('N: undefined → 0', N(undefined), 0);
    assertEqual('N: NaN string → 0', N('abc'), 0);
    assertEqual('N: negative', N(-5.5), -5.5);
  }

  // ─── ph() ──────────────────────────────────────────────────────────────────
  function testPh() {
    assert('ph: zero formats', ph(0) === '0.00');
    assert('ph: thousand separator', ph(1000) === '1,000.00');
    assert('ph: two decimals', ph(3.1) === '3.10');
    assert('ph: null → 0.00', ph(null) === '0.00');
    assert('ph: large number', ph(1234567.89) === '1,234,567.89');
  }

  // ─── uid() ─────────────────────────────────────────────────────────────────
  function testUid() {
    const a = uid(), b = uid(), c = uid();
    assert('uid: returns string', typeof a === 'string');
    assert('uid: a < b', Number(a) < Number(b));
    assert('uid: b < c', Number(b) < Number(c));
    assert('uid: all unique', a !== b && b !== c && a !== c);
  }

  // ─── nextCeNum() ───────────────────────────────────────────────────────────
  function testNextCeNum() {
    const yr = new Date().getFullYear();
    const pfx = 'SHIC-CE-' + yr + '-';

    // empty history → 0001
    const n1 = nextCeNum([], null);
    assertEqual('nextCeNum: empty history', n1, pfx + '0001');

    // history with existing entries
    const hist = [
      { info: { ceNum: pfx + '0003' } },
      { info: { ceNum: pfx + '0001' } },
      { info: { ceNum: pfx + '0010' } },
    ];
    const n2 = nextCeNum(hist, null);
    assertEqual('nextCeNum: next after max', n2, pfx + '0011');

    // revision suffix stripped
    const histR = [{ info: { ceNum: pfx + '0005-R2' } }];
    const n3 = nextCeNum(histR, null);
    assertEqual('nextCeNum: strips -Rn revision', n3, pfx + '0006');

    // custom prefix
    const n4 = nextCeNum([], 'SY3');
    assert('nextCeNum: custom prefix', n4.startsWith('SY3-CE-' + yr + '-'));

    // null/missing ceNum entries don't break it
    const histBad = [{ info: {} }, { info: null }, {}];
    const n5 = nextCeNum(histBad, null);
    assertEqual('nextCeNum: handles missing ceNum', n5, pfx + '0001');
  }

  // ─── CE_CFG completeness ───────────────────────────────────────────────────
  function testCeCfg() {
    const requiredTypes = ['onsite', 'shopworks', 'supply'];
    const requiredFields = ['color', 'mobDemob', 'docNo', 'hasConc'];
    for (const type of requiredTypes) {
      assert('CE_CFG has ' + type, !!CE_CFG[type]);
      for (const field of requiredFields) {
        assert('CE_CFG.' + type + '.' + field + ' exists', CE_CFG[type][field] !== undefined);
      }
    }
    assert('CE_CFG.onsite.mobDemob is true', CE_CFG.onsite.mobDemob === true);
    assert('CE_CFG.supply.mobDemob is false', CE_CFG.supply.mobDemob === false);
  }

  // ─── MISC_DEF completeness ─────────────────────────────────────────────────
  function testMiscDef() {
    const types = ['onsite', 'shopworks', 'supply'];
    for (const type of types) {
      assert('MISC_DEF has ' + type, Array.isArray(MISC_DEF[type]));
      assert('MISC_DEF.' + type + ' non-empty', MISC_DEF[type].length > 0);
      for (const [key, label] of MISC_DEF[type]) {
        assert('MISC_DEF.' + type + ' entry has key+label', typeof key === 'string' && typeof label === 'string');
      }
    }
    // supply must have allowance (not accommodation)
    const supplyKeys = MISC_DEF.supply.map(([k]) => k);
    assert('MISC_DEF.supply has allowance', supplyKeys.includes('allowance'));
  }

  // ─── SHIFTS completeness ───────────────────────────────────────────────────
  function testShifts() {
    const required = ['regular_day', 'regular_night', 'sunday_day', 'sunday_night', 'holiday_day', 'holiday_night'];
    for (const s of required) {
      assert('SHIFTS has ' + s, !!SHIFTS[s]);
      assert('SHIFTS.' + s + '.mult > 0', (SHIFTS[s].mult || 0) > 0);
      assert('SHIFTS.' + s + '.label is string', typeof SHIFTS[s].label === 'string');
    }
    assertEqual('SHIFTS.regular_day.mult', SHIFTS.regular_day.mult, 1);
    assert('SHIFTS.holiday_day.mult > 1', SHIFTS.holiday_day.mult > 1);
  }

  // ─── mkRes / mkMP / mkVeh factories ───────────────────────────────────────
  function testFactories() {
    const r = mkRes();
    assert('mkRes has id', !!r.id);
    assert('mkRes has desc', r.desc === '');
    assertEqual('mkRes qty default', r.qty, 1);
    assertEqual('mkRes uom default', r.uom, 'Lot');
    assertEqual('mkRes cost default', r.cost, 0);

    const m = mkMP();
    assert('mkMP has id', !!m.id);
    assertEqual('mkMP pax default', m.pax, 1);
    assertEqual('mkMP days default', m.days, 1);
    assertEqual('mkMP otHours default', m.otHours, 0);
    assertEqual('mkMP shift default', m.shift, 'regular_day');
    assertEqual('mkMP rate default', m.rate, 0);

    const v = mkVeh();
    assert('mkVeh has id', !!v.id);
    assertEqual('mkVeh qty default', v.qty, 1);
    assertEqual('mkVeh uom default', v.uom, 'Day');
  }

  // ─── hashPassword / verifyPassword (async) ─────────────────────────────────
  async function testPasswords() {
    const pw = 'TestPass123!';

    // hash then verify
    const hash = await hashPassword(pw);
    assert('hashPassword: returns pbkdf2 string', hash.startsWith('pbkdf2:'));
    assert('hashPassword: not plaintext', !hash.includes(pw));

    const ok = await verifyPassword(pw, hash);
    assert('verifyPassword: correct password', ok === true);

    const bad = await verifyPassword('WrongPass!', hash);
    assert('verifyPassword: wrong password rejected', bad === false);

    // two hashes of same password must differ (random salt)
    const hash2 = await hashPassword(pw);
    assert('hashPassword: salted (different hashes)', hash !== hash2);

    // legacy sha256 path
    const legacyHash = await sha256(pw);
    const legacyOk = await verifyPassword(pw, legacyHash);
    assert('verifyPassword: legacy sha256 fallback', legacyOk === true);
  }

  // ─── BLANK_INFO defaults ───────────────────────────────────────────────────
  function testBlankInfo() {
    assert('BLANK_INFO has ceNum', typeof BLANK_INFO.ceNum === 'string');
    assert('BLANK_INFO has date', /^\d{4}-\d{2}-\d{2}$/.test(BLANK_INFO.date));
    assert('BLANK_INFO.qty is string "1"', BLANK_INFO.qty === '1');
    assertEqual('BLANK_INFO.attention default', BLANK_INFO.attention, 'SALES DEPARTMENT');
    assertEqual('BLANK_INFO.endUser default', BLANK_INFO.endUser, 'C/O SALES');
    assert('BLANK_INFO.status set', !!BLANK_INFO.status);
    assert('BLANK_INFO.companyId is null', BLANK_INFO.companyId === null);
  }

  // ─── CE_TABS order ─────────────────────────────────────────────────────────
  function testCeTabs() {
    assert('CE_TABS is array', Array.isArray(CE_TABS));
    const ids = CE_TABS.map(t => t.id);
    const required = ['info', 'sow', 'manpower', 'tools', 'materials', 'ppe', 'misc', 'summary', 'history'];
    for (const id of required) {
      assert('CE_TABS has ' + id, ids.includes(id));
    }
    // info must be first
    assertEqual('CE_TABS: info is first', ids[0], 'info');
    // all tabs have label
    for (const t of CE_TABS) {
      assert('CE_TABS.' + t.id + ' has label', typeof t.label === 'string' && t.label.length > 0);
    }
  }

  // ─── Runner ────────────────────────────────────────────────────────────────
  async function run() {
    _passed = 0; _failed = 0; _results = [];
    console.group('%c SHIC CE Test Suite', 'font-weight:bold;font-size:14px;color:#F0A429');
    console.time('total');

    testN();
    testPh();
    testUid();
    testNextCeNum();
    testCeCfg();
    testMiscDef();
    testShifts();
    testFactories();
    testBlankInfo();
    testCeTabs();
    await testPasswords();

    console.timeEnd('total');
    const total = _passed + _failed;
    if (_failed === 0) {
      console.log('%c ✓ All ' + total + ' tests passed', 'color:#3FB950;font-weight:bold');
    } else {
      console.warn('%c ' + _failed + ' of ' + total + ' tests FAILED', 'color:#F85149;font-weight:bold');
      _results.filter(r => !r.ok).forEach(r => console.error('  ✗', r.name, '—', r.detail));
    }
    console.groupEnd();
    return { passed: _passed, failed: _failed, results: _results };
  }

  window.SHIC_TESTS = { run };

  // Auto-run if URL contains ?run_tests
  if (location.search.includes('run_tests')) {
    window.addEventListener('load', () => setTimeout(() => run(), 500));
  }
})();
