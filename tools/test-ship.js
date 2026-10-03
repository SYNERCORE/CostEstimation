/* The ship script's moving parts, without touching git or the real files.
   Run: node tools/test-ship.js */
'use strict';
const { readVersion, bumpIndex, bumpSw, addCiStep, parseArgs } = require('./ship.js');
let bad = 0;
const ck = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (!c && x ? '  -> ' + x : '')); if (!c) bad++; };

ck('reads the build number from the cache name', readVersion("const CACHE = 'shic-ce-v322';") === 322);
ck('and says so when there is none', readVersion('nothing here') === null);

const html = '<script src="./a.js?v=322"></script><script src="./b.js?v=322"></script><link href="x.css?v=322">';
const b = bumpIndex(html, 322, 323);
ck('every ?v= in index.html moves', b.split('?v=323"').length - 1 === 3 && b.indexOf('?v=322') < 0);
ck('a longer number that merely starts the same is left alone', bumpIndex('<a href="x?v=3221">', 322, 323) === '<a href="x?v=3221">');
ck('the cache name moves', bumpSw("'shic-ce-v322'", 322, 323) === "'shic-ce-v323'");

const NL = String.fromCharCode(10);
const yml = ['steps:', '      - name: A', '        run: node tools/a.js', '      - name: Every workflow step runs here', '        run: node tools/check-ci-steps.js',
  '      - name: A', '        run: node tools/a.js', '      - name: Every workflow step runs here', '        run: node tools/check-ci-steps.js'].join(NL);
const y = addCiStep(yml, 'tools/test-new.js', 'Guards the new thing');
ck('a new step is added before the guard step, in every copy of the list', y.split('run: node tools/test-new.js').length - 1 === 2);
ck('with its own name, so GitHub does not drop it',
  y.split('- name: Guards the new thing' + NL + '        run: node tools/test-new.js').length - 1 === 2);
ck('adding the same test again changes nothing', addCiStep(y, 'tools/test-new.js', 'Guards the new thing') === y);
const crlf = addCiStep(yml.split(NL).join('\r\n'), 'tools/test-new.js', 'L');
ck('a CRLF workflow stays CRLF throughout', crlf.indexOf('\r\n') > 0 && crlf.split('\r\n').join('').indexOf(NL) < 0);

const p = parseArgs(['Fix the thing', '--test', 'tools/t.js', '--step', 'Label', '--no-push', '--trailer', 'Co-Authored-By: X']);
ck('arguments are read', p.msg === 'Fix the thing' && p.test === 'tools/t.js' && p.step === 'Label' && p.push === false && p.trailer === 'Co-Authored-By: X');
ck('and a plain call pushes', parseArgs(['m']).push === true && parseArgs(['--dry-run']).dry === true);
process.exit(bad ? 1 : 0);
