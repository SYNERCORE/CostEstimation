/* Gives every form control a name a screen reader can say.

   The estimate tables are rows of bare number boxes and drop-downs (rate, days, quantity...), drawn in dozens of places, with nothing that names
   them: a screen reader says "edit, spin button" for every cell. Rather than touch each of those places, this reads the page after it is drawn
   and names any control that has no name of its own, from where it sits:
     in a table   ->  its column heading, then the row it is in ("Rate - Electrician")
     elsewhere    ->  the label or text just before it, else its placeholder
   A control that already has a name (aria-label, aria-labelledby, title, a <label>, wrapping <label> text) is never touched. A name this file
   wrote is marked data-a11y so it can be refreshed when the control is drawn again; one written by hand never is. */
(function () {
  var CONTROLS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]),select,textarea';

  function clean(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function short(t) { t = clean(t); return t.length > 40 ? t.slice(0, 40) + '…' : t; }

  function hasName(el) {
    if (el.getAttribute('aria-label') && !el.hasAttribute('data-a11y')) return true;
    if (el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    if (el.id) { try { var l = document.querySelector('label[for="' + el.id.replace(/"/g, '\\"') + '"]'); if (l && clean(l.textContent)) return true; } catch (e) { /* odd id */ } }
    var wrap = el.closest('label');
    if (wrap && clean(wrap.textContent)) return true;
    return false;
  }

  function cellText(cell) {
    var c = cell.querySelector('select,input:not([type=hidden])');
    if (c) {
      if (c.tagName === 'SELECT') return clean(c.options[c.selectedIndex] && c.options[c.selectedIndex].text);
      if (c.type !== 'number' && c.type !== 'checkbox') return clean(c.value);
      return '';
    }
    return clean(cell.textContent);
  }

  function inTable(el, cell) {
    var row = cell.parentElement, table = cell.closest('table');
    var head = '';
    if (table) {
      var ths = table.querySelectorAll('thead th, thead td');
      /* No thead: the first row counts as the headings only when every cell in it is a th. Otherwise this is a form laid out as a table, where
         the name is the cell just before the control. */
      if (!ths.length) { var r0 = table.querySelector('tr'); if (r0 && r0 !== row && r0.children.length && Array.prototype.every.call(r0.children, function (x) { return x.tagName === 'TH'; })) ths = r0.children; }
      var idx = 0, i, col = -1, c;
      for (i = 0; i < row.children.length; i++) { if (row.children[i] === cell) { col = idx; break; } idx += row.children[i].colSpan || 1; }
      var at = 0;
      for (i = 0; i < ths.length; i++) { c = ths[i]; at += c.colSpan || 1; if (at > col) { head = clean(c.textContent); break; } }
    }
    if (!head) {
      for (var p = cell.previousElementSibling; p; p = p.previousElementSibling) { var pt = cellText(p); if (/[A-Za-z]/.test(pt)) return short(pt.replace(/[:*]+$/, '')); }
    }
    /* The row's own name: the first other cell holding real text. A blank row (an unassigned drop-down, "Lot", a price) has none, so it is
       named by its position instead -- "Qty, row 3" says more than "Qty - Lot". */
    var rowName = '';
    for (var k = 0; k < row.children.length; k++) {
      if (row.children[k] === cell) continue;
      var t = cellText(row.children[k]);
      if (/[A-Za-z]{2}/.test(t) && !/^(lot|—|-)/i.test(t) && !/^[₱P]?s?[d,.]+$/.test(t)) { rowName = t; break; }
    }
    if (!rowName && head) {
      var body = row.parentElement, n = 0;
      if (body) for (var r = 0; r < body.children.length; r++) { if (body.children[r].tagName === 'TR') n++; if (body.children[r] === row) break; }
      if (n > 0 && body && body.tagName === 'TBODY') rowName = 'row ' + n;
    }
    if (!head && !rowName) return '';
    return head ? (rowName ? short(head) + ' - ' + short(rowName) : short(head)) : short(rowName);
  }

  function nearby(el) {
    var n = el.previousSibling, hops = 0;
    while (n && hops < 3) {
      /* A button or another control just before it is not its name ("+ PPE"). */
      if (n.nodeType === 1 && (n.matches('button,input,select,textarea') || n.querySelector('button,input,select,textarea'))) break;
      var t = clean(n.textContent);
      if (/[A-Za-z]/.test(t) && t.length < 60) return short(t.replace(/[:*]+$/, ''));
      n = n.previousSibling; hops++;
    }
    var p = el.parentElement;
    if (p) {
      var own = '';
      for (var i = 0; i < p.childNodes.length; i++) if (p.childNodes[i].nodeType === 3) own += p.childNodes[i].textContent;
      if (/[A-Za-z]/.test(clean(own)) && clean(own).length < 60) return short(own.replace(/[:*]+$/, ''));
      var ps = p.previousElementSibling;
      if (ps && !ps.querySelector('input,select,textarea')) { var pt = clean(ps.textContent); if (/[A-Za-z]/.test(pt) && pt.length < 60) return short(pt.replace(/[:*]+$/, '')); }
    }
    return '';
  }

  function nameFor(el) {
    var cell = el.closest('td,th'), s = '';
    if (cell && cell.parentElement) s = inTable(el, cell);
    if (!s) s = nearby(el);
    if (!s) s = clean(el.getAttribute('placeholder') || el.getAttribute('name') || '');
    if (!s) s = el.tagName === 'SELECT' ? 'Choose an option' : el.type === 'number' ? 'Number' : 'Text field';
    return s;
  }

  function label(el) {
    if (hasName(el)) return;
    var n = nameFor(el);
    if (el.getAttribute('aria-label') !== n) el.setAttribute('aria-label', n);
    el.setAttribute('data-a11y', '1');
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches(CONTROLS)) label(root);
    var list = root.querySelectorAll ? root.querySelectorAll(CONTROLS) : [];
    for (var i = 0; i < list.length; i++) label(list[i]);
  }

  var pending = [], queued = false;
  function flush() {
    queued = false;
    var roots = pending; pending = [];
    for (var i = 0; i < roots.length; i++) if (roots[i].isConnected) scan(roots[i]);
  }
  function start() {
    scan(document.body);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) for (var j = 0; j < muts[i].addedNodes.length; j++) { var n = muts[i].addedNodes[j]; if (n.nodeType === 1) pending.push(n); }
      if (pending.length && !queued) { queued = true; (window.requestIdleCallback || function (f) { return setTimeout(f, 60); })(flush, { timeout: 500 }); }
    }).observe(document.body, { childList: true, subtree: true });
  }
  window.a11yLabelAll = function () { scan(document.body); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
