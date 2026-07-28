#!/usr/bin/env node
/*
 * Structural check for the App render tree.
 *
 * Why this exists:
 * React.createElement() calls are plain function calls, so a stray or missing
 * ')' does not produce a syntax error -- it silently re-parents entire chunks
 * of the UI. Two real bugs shipped this way:
 *
 *   1. An extra ')' closed the root <div> early, turning the return into
 *      `return <root>, <content>;` (the comma operator). React rendered only
 *      the last value, so the header, tab bar and sync bar vanished.
 *   2. A missing ')' stopped the main content column from closing, so the
 *      Live Totals sidebar became a child of the content column and rendered
 *      underneath it instead of beside it.
 *
 * Both passed `node --check` and produced zero console errors. This script
 * asserts the shape of the tree so that class of bug fails loudly instead.
 *
 * Run: node tools/check-render-tree.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BS = String.fromCharCode(92);

const failures = [];
const fail = msg => failures.push(msg);

/* ---------- generic scanner: walks code, skipping strings and comments ---------- */
function walk(src, visit) {
  let depth = 0, line = 1, i = 0, inS = null, inC = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; if (inC === 'line') inC = null; i++; continue; }
    if (inC === 'block') { if (c === '*' && n === '/') { inC = null; i += 2; continue; } i++; continue; }
    if (inS) { if (c === BS) { i += 2; continue; } if (c === inS) inS = null; i++; continue; }
    if (c === '/' && n === '/') { inC = 'line'; i += 2; continue; }
    if (c === '/' && n === '*') { inC = 'block'; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; i++; continue; }

    visit(i, line, depth);

    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (visit.onClose) visit.onClose(i, line, depth);
    }
    i++;
  }
}

/*
 * Given the index of a `React.createElement(` token, return its direct
 * createElement children: everything at exactly one nesting level in.
 */
function childrenOf(src, callIndex) {
  const kids = [];
  let base = null, done = false, endLine = null, endIndex = null;
  const visit = (i, line, depth) => {
    if (done || i < callIndex) return;
    if (base === null) { base = depth + 1; return; }
    if (depth === base && src.startsWith('React.createElement(', i)) {
      kids.push({ line, index: i });
    }
  };
  visit.onClose = (i, line, depth) => {
    if (done || base === null || i < callIndex) return;
    if (depth < base) { done = true; endLine = line; endIndex = i; }
  };
  walk(src, visit);
  return { kids, endLine, endIndex: endIndex === null ? src.length : endIndex };
}

/* Slice the source text belonging to each child, for content assertions. */
function childText(src, kids, idx, endIndex) {
  const start = kids[idx].index;
  const end = idx + 1 < kids.length ? kids[idx + 1].index : endIndex;
  return src.slice(start, end);
}

/* ---------- 1. syntax check every shipped script ---------- */
function jsFiles() {
  const out = [];
  const add = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) add(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  add(path.join(ROOT, 'src'));
  out.push(path.join(ROOT, 'sw.js'));
  return out;
}

for (const f of jsFiles()) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail('syntax error in ' + path.relative(ROOT, f) + '\n' + String(e.stderr || e.message).trim());
  }
}

/* ---------- 2. structural checks on App.js ---------- */
const appPath = path.join(ROOT, 'src', 'App.js');
const src = fs.readFileSync(appPath, 'utf8');

/* Locate the root render: the last top-level `return React.createElement("div"` in function App. */
const appStart = src.indexOf('function App(');
if (appStart < 0) fail('could not find `function App(` in src/App.js');

/*
 * The root render is the `return React.createElement("div"` that sits directly
 * in App's function body -- i.e. at nesting depth 1 relative to the file.
 * Nested helper components inside App have returns too, so depth is what
 * distinguishes them, not source order.
 */
let rootIndex = -1;
{
  /* Statements in App's body sit one level in from wherever `function App(` starts. */
  const baseDepth = (() => {
    let d = null;
    walk(src, (i, line, depth) => { if (d === null && i >= appStart) d = depth + 1; });
    return d;
  })();
  const find = (i, line, depth) => {
    if (rootIndex >= 0 || i < appStart) return;
    if (depth !== baseDepth) return;
    if (!src.startsWith('return', i)) return;
    const after = src.slice(i + 6, i + 80);
    const m = after.match(/^\s*(?:\/\*[^*]*\*\/\s*)?React\.createElement\("div"/);
    if (m) rootIndex = src.indexOf('React.createElement("div"', i);
  };
  walk(src, find);
}
if (rootIndex < 0) fail('could not locate the root createElement("div") of App');

if (rootIndex >= 0) {
  const { kids, endLine, endIndex } = childrenOf(src, rootIndex);
  const lineOf = idx => src.slice(0, idx).split('\n').length;
  const rootLine = lineOf(rootIndex);

  const texts = kids.map((_, i) => childText(src, kids, i, endIndex));
  const has = needle => texts.some(t => t.includes(needle));

  /*
   * The whole UI must live inside the root <div>. If the sidebar is not even
   * within the root's subtree, a stray ')' closed the root early and the
   * return became `return <root>, <rest>;` -- the comma operator, which
   * evaluates both but yields only the last, silently dropping everything
   * that came before it.
   */
  const rootSubtree = src.slice(rootIndex, endIndex);
  const rootClosedEarly = !rootSubtree.includes('Live Totals');
  if (rootClosedEarly) {
    fail('render tree: the root <div> (line ' + rootLine + ') closes early at line ' + endLine +
      ', before the end of App.\n' +
      '  Everything after that point is a separate expression, so `return <root>, <rest>;`\n' +
      '  discards the root and React renders only the tail -- the header, tab bar and sync\n' +
      '  bar disappear with no error. Look for one extra ")" at or before line ' + endLine + '.');
  }

  const required = [
    ['SyncStatusBar', 'sync status bar'],
    ['zIndex: 50', 'sticky top header'],
    ['TABS.map', 'tab bar'],
  ];
  for (const [needle, label] of required) {
    if (!has(needle)) {
      fail('render tree: ' + label + ' (' + needle + ') is not a direct child of the root <div>.\n' +
        '  It is nested deeper than it should be -- usually a stray ")" closed the root <div> early\n' +
        '  near line ' + rootLine + ', which silently drops it from the DOM.');
    }
  }

  /* The last direct child is the flex row: main content column + sidebar.
     Only meaningful once we know the root itself closes in the right place. */
  if (kids.length === 0) {
    fail('render tree: root <div> has no createElement children at all.');
  } else if (!rootClosedEarly) {
    const lastIdx = kids.length - 1;
    const layout = kids[lastIdx];
    const layoutText = texts[lastIdx];
    if (!layoutText.includes("display: 'flex'")) {
      fail('render tree: the last child of the root <div> (line ' + layout.line + ') is not the flex layout row.');
    }
    const inner = childrenOf(src, layout.index);
    if (inner.kids.length !== 2) {
      fail('render tree: the layout row at line ' + layout.line + ' has ' + inner.kids.length +
        (inner.kids.length === 1 ? ' direct child' : ' direct children') +
        ', expected 2 (main content column + Live Totals sidebar).\n' +
        '  When this is 1, the content column never closed and the sidebar became its child,\n' +
        '  so Live Totals renders underneath the form instead of beside it.\n' +
        '  Look for a missing ")" inside the summary tab.');
    } else {
      const sidebar = src.slice(inner.kids[1].index, inner.kids[1].index + 4000);
      if (!sidebar.includes('Live Totals')) {
        fail('render tree: second child of the layout row (line ' + inner.kids[1].line +
          ') does not look like the Live Totals sidebar.');
      }
    }
  }

  if (!failures.length) {
    console.log('render tree OK');
    console.log('  root <div> line ' + rootLine + ' -> closes line ' + endLine +
      ', ' + kids.length + ' direct children');
  }
}

/* ---------- report ---------- */
if (failures.length) {
  console.error('\nFAILED (' + failures.length + '):\n');
  failures.forEach((f, i) => console.error(' ' + (i + 1) + '. ' + f + '\n'));
  process.exit(1);
}
console.log('all checks passed');
