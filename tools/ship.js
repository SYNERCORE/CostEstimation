#!/usr/bin/env node
/* Ship a build: the same steps, in the same order, every time.
   ===========================================================
   Every build used to be a checklist run by hand -- bump the version in two
   places, regenerate the precache list, normalise line endings, refresh the
   logic lock, register the new test in the CI workflow, run every check, then
   commit and push. Forgetting the version bump leaves users on a cached copy,
   so a fix looks like it did not work; pushing past a failing check shipped a
   broken build twice. This does all of it, and stops before committing if any
   check fails.

   Usage:
     node tools/ship.js "Commit message"
     node tools/ship.js "Commit message" --test tools/test-x.js --step "What it guards"
     node tools/ship.js "Commit message" --no-push        (commit, do not push)
     node tools/ship.js "Commit message" --trailer "Co-Authored-By: Name <e@x>"
     node tools/ship.js --dry-run                         (say what it would do, change nothing)

   Run it from the project root, on master, with your changes already made. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

/* The current build number, read from the service-worker cache name. */
const readVersion = sw => { const m = sw.match(/shic-ce-v(\d+)/); return m ? parseInt(m[1], 10) : null; };

/* index.html carries ?v=N on every script; sw.js carries it in the cache name. */
const bumpIndex = (html, from, to) => html.split('?v=' + from + '"').join('?v=' + to + '"');
const bumpSw = (sw, from, to) => sw.split('shic-ce-v' + from).join('shic-ce-v' + to);

/* Register a test as a CI step. It goes in just before the step that runs the
   whole list, once for every copy of that step the workflow holds, and is
   skipped where it is already present. */
const GUARD = 'Every workflow step runs here';
const addCiStep = (yml, file, label) => {
  const NL = yml.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const lines = yml.split(/\r?\n/);
  const out = [];
  const run = 'run: node ' + file;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('- name: ' + GUARD) >= 0) {
      /* Already registered directly above this guard? */
      const prev = out.slice(-2).join(' ');
      if (prev.indexOf(run) < 0) {
        out.push('      - name: ' + label);
        out.push('        ' + run);
      }
    }
    out.push(lines[i]);
  }
  return out.join(NL);
};

const sh = (cmd, args, opts) => execFileSync(cmd, args, Object.assign({ cwd: ROOT, stdio: 'inherit' }, opts || {}));
const out = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim();

/* Line endings: Windows tooling reintroduces CRLF, and several checks match
   exact line shapes, so a file back from git with CRLF fails tests that have
   nothing to do with the change. */
const normaliseLf = () => {
  let n = 0;
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!/\.(js|json|md|html|yml)$/.test(e.name)) continue;
      const s = fs.readFileSync(f, 'utf8');
      if (s.indexOf('\r\n') >= 0) { fs.writeFileSync(f, s.replace(/\r\n/g, '\n')); n++; }
    }
  };
  ['src', 'tools'].forEach(r => { if (fs.existsSync(path.join(ROOT, r))) walk(path.join(ROOT, r)); });
  ['index.html', 'sw.js', '.github/workflows/check.yml'].forEach(f => {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) return;
    const s = fs.readFileSync(p, 'utf8');
    if (s.indexOf('\r\n') >= 0) { fs.writeFileSync(p, s.replace(/\r\n/g, '\n')); n++; }
  });
  return n;
};

const parseArgs = argv => {
  const a = { msg: '', test: '', step: '', push: true, dry: false, trailer: '' };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--test') a.test = argv[++i];
    else if (v === '--step') a.step = argv[++i];
    else if (v === '--no-push') a.push = false;
    else if (v === '--dry-run') a.dry = true;
    else if (v === '--trailer') a.trailer = argv[++i];
    else if (!a.msg) a.msg = v;
  }
  return a;
};

const main = () => {
  const a = parseArgs(process.argv.slice(2));
  const fail = m => { console.error('\nship: ' + m); process.exit(1); };
  if (!a.dry && !a.msg) fail('give a commit message:  node tools/ship.js "What changed"');
  if (a.test && !a.step) fail('--test needs --step "label" so the CI step has a name');
  if (a.test && !fs.existsSync(path.join(ROOT, a.test))) fail('no such test file: ' + a.test);

  const branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'master') fail('on branch "' + branch + '", expected master');
  const dirty = out('git', ['status', '--porcelain']).split('\n').filter(l => l && !/^\?\? (\.claude|graphify-out|scratchpad)\//.test(l));
  if (!dirty.length) fail('nothing has changed -- there is nothing to ship');

  const swPath = path.join(ROOT, 'sw.js'), idxPath = path.join(ROOT, 'index.html'), ymlPath = path.join(ROOT, '.github', 'workflows', 'check.yml');
  const from = readVersion(fs.readFileSync(swPath, 'utf8'));
  if (from == null) fail('could not read the build number from sw.js');
  const to = from + 1;

  console.log('ship: build ' + from + ' -> ' + to + (a.test ? ', registering ' + a.test : '') + (a.dry ? '   (dry run: nothing is changed)' : ''));
  console.log('      changed: ' + dirty.length + ' file(s)');
  if (a.dry) return;

  fs.writeFileSync(idxPath, bumpIndex(fs.readFileSync(idxPath, 'utf8'), from, to));
  fs.writeFileSync(swPath, bumpSw(fs.readFileSync(swPath, 'utf8'), from, to));
  if (a.test) fs.writeFileSync(ymlPath, addCiStep(fs.readFileSync(ymlPath, 'utf8'), a.test, a.step));

  console.log('ship: refreshing precache, line endings and the logic lock');
  sh('node', ['tools/check-sw-precache.js', '--fix'], { stdio: 'ignore' });
  normaliseLf();
  sh('node', ['tools/check-logic-unchanged.js', '--update'], { stdio: 'ignore' });

  console.log('ship: running every CI step');
  try { sh('node', ['tools/check-ci-steps.js'], { stdio: 'pipe' }); }
  catch (e) {
    const o = String(e.stdout || '') + String(e.stderr || '');
    console.error(o.split('\n').filter(l => !/PASS/.test(l)).join('\n').trim());
    fail('a check failed, so nothing was committed or pushed. The build number is already bumped to ' + to +
      ' in index.html and sw.js; fix the failure and run this again (it will bump once more), or undo with: git checkout index.html sw.js');
  }

  sh('git', ['add', '-A', 'src', 'tools', 'index.html', 'sw.js', '.github']);
  const msg = a.msg + ' (build ' + to + ')' + (a.trailer ? '\n\n' + a.trailer : '');
  sh('git', ['commit', '-q', '-m', msg]);
  if (a.push) sh('git', ['push', '-q', 'origin', 'master:main']);
  console.log('\nship: ' + out('git', ['log', '--oneline', '-1']) + (a.push ? '   (pushed)' : '   (not pushed)'));
};

if (require.main === module) main();
module.exports = { readVersion, bumpIndex, bumpSw, addCiStep, parseArgs, GUARD };
