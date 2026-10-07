/* Loads the three big libraries only when something first uses them.

   xlsx (880 KB), mammoth (640 KB) and pdf.js (320 KB) were <script> tags in index.html, so every person paid to download and parse
   1.8 MB before the login page could appear -- for libraries that only an import, an export or a document read ever touches.

   Each name is defined here as a property of window with a getter. The first time any code reads it -- XLSX.utils, typeof pdfjsLib,
   window.pdfjsLib -- the getter fetches the file, runs it in the global scope, and the property becomes the real library. After that
   nothing differs from the old <script> tag, so no call site had to change.

   The fetch is synchronous on purpose: the callers read the library on the very next line and several are not async. It happens once,
   from the service worker's cache (the files are precached, see EXTRA in sw.js), so it costs the parse time and no network. If the file
   cannot be had (offline and never cached) the read throws a plain message and the next read tries again. */
(function () {
  var LIBS = { XLSX: 'xlsx.full.min.js', pdfjsLib: 'pdf.min.js', mammoth: 'mammoth.browser.min.js' };
  var LABEL = { XLSX: 'spreadsheet', pdfjsLib: 'PDF', mammoth: 'Word document' };

  function define(name) {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: function () {
        /* Drop the getter first: the library assigns the global itself, and anything it reads while loading must not come back here. */
        delete window[name];
        try {
          var x = new XMLHttpRequest();
          x.open('GET', './vendor/' + LIBS[name], false);
          x.send(null);
          if (x.status !== 200 && x.status !== 0) throw new Error('HTTP ' + x.status);
          (0, eval)(x.responseText + '\n//# sourceURL=vendor/' + LIBS[name]);
          if (typeof window[name] === 'undefined') throw new Error('it loaded but did not define ' + name);
          return window[name];
        } catch (e) {
          define(name); /* so the next read tries again */
          throw new Error('The ' + LABEL[name] + ' library could not be loaded (' + (e && e.message ? e.message : e) + '). Check the connection and try again.');
        }
      },
      set: function (v) {
        Object.defineProperty(window, name, { value: v, writable: true, configurable: true, enumerable: true });
      }
    });
  }
  Object.keys(LIBS).forEach(define);
})();
