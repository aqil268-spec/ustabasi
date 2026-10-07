/* Test üçün: Google Apps Script mühitinin brauzer simulyasiyası (repo-ya daxil deyil).
   Vərəqlər, Script Properties və CacheService localStorage-də saxlanır — bütün tablar eyni "server"i görür. */
(function () {
  const KEY = 'ub_mock_book';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } })();
  const state = saved || { sheets: {}, order: [], props: {}, cache: {}, max: {} };
  state.cache = state.cache || {}; state.max = state.max || {};
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('persist', e); } }
  window.__mockState = state;
  window.__mockStats = { reads: 0, cacheGets: 0 };

  function Range(sheet, r, c, nr, nc) { this.s = sheet; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.setNumberFormat = function () { return this; };
  Range.prototype.setFontWeight = function () { return this; };
  Range.prototype.getValues = function () {
    window.__mockStats.reads++;
    const out = [];
    for (let i = 0; i < this.nr; i++) { const row = this.s.rows()[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) o.push(row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j]); out.push(o); }
    return out;
  };
  Range.prototype.setValues = function (vals) {
    const rows = this.s.rows();
    vals.forEach((v, i) => {
      const ri = this.r - 1 + i;
      if (ri >= this.s.getMaxRows()) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      while (rows.length <= ri) rows.push([]);
      v.forEach((x, j) => { rows[ri][this.c - 1 + j] = x; });
    });
    return this;
  };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  Range.prototype.clearContent = function () {
    const rows = this.s.rows();
    for (let i = 0; i < this.nr; i++) { const row = rows[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; }
    return this;
  };

  function Sheet(name) { this.name = name; }
  Sheet.prototype.rows = function () { return state.sheets[this.name]; };
  Sheet.prototype.getLastRow = function () { const r = this.rows(); let n = r.length; while (n > 0 && (!r[n - 1] || r[n - 1].every(v => v === '' || v === undefined || v === null))) n--; return n; };
  Sheet.prototype.getMaxRows = function () { return Math.max(state.max[this.name] || 1000, this.rows().length); };
  Sheet.prototype.insertRowsAfter = function (after, n) { state.max[this.name] = this.getMaxRows() + n; return this; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
  Sheet.prototype.getDataRange = function () {
    const self = this;
    return {
      getValues() {
        window.__mockStats.reads++;
        const n = self.getLastRow(); let w = 0;
        self.rows().slice(0, n).forEach(r => { w = Math.max(w, r.length); });
        return self.rows().slice(0, n).map(r => { const o = []; for (let j = 0; j < w; j++) o.push(r[j] === undefined ? '' : r[j]); return o; });
      }
    };
  };
  Sheet.prototype.appendRow = function (vals) {
    const rows = this.rows(); const n = this.getLastRow();
    rows.length = n; rows.push(vals.slice());
    if (rows.length > (state.max[this.name] || 1000)) state.max[this.name] = rows.length;
    return this;
  };
  Sheet.prototype.deleteRow = function (r) { this.rows().splice(r - 1, 1); };
  Sheet.prototype.setFrozenRows = function () {};
  Sheet.prototype.getName = function () { return this.name; };

  const book = {
    getSheetByName(n) { return state.sheets[n] ? new Sheet(n) : null; },
    insertSheet(n) { state.sheets[n] = []; state.order.push(n); state.max[n] = 1000; return new Sheet(n); },
    getSheets() { return state.order.map(n => new Sheet(n)); },
    deleteSheet(s) { delete state.sheets[s.name]; state.order = state.order.filter(x => x !== s.name); },
    getId() { return 'BOOK'; },
    getUrl() { return 'https://docs.google.com/spreadsheets/d/BOOK'; },
    setSpreadsheetTimeZone() {}
  };
  window.SpreadsheetApp = {
    getActiveSpreadsheet: () => (window.__standalone ? null : book),
    openById: () => book,
    create: () => { if (!state.sheets['Sheet1']) { state.sheets['Sheet1'] = []; state.order.push('Sheet1'); } return book; },
    flush: () => {}
  };
  window.__standalone = true;

  const pad = x => String(x).padStart(2, '0');
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    const out = []; let x = (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
    for (let i = 0; i < 32; i++) out.push(parseInt(x[i % x.length], 16) * 16 + i - 128);
    return out;
  }
  window.Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (a, s) => hash(String(s)),
    getUuid: () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(Date.now())),
    formatDate(d, tz, fmt) {
      const now = window.__mockNow ? new Date(window.__mockNow + (d.getTime() - window.__mockNowReal)) : d;
      const Y = now.getFullYear(), M = pad(now.getMonth() + 1), D = pad(now.getDate()), h = pad(now.getHours()), m = pad(now.getMinutes()), s = pad(now.getSeconds());
      if (fmt === 'yyyy-MM-dd') return Y + '-' + M + '-' + D;
      if (fmt === 'HH:mm') return h + ':' + m;
      return Y + '-' + M + '-' + D + 'T' + h + ':' + m + ':' + s;
    },
    base64Decode: s => s, newBlob: (b, t, n) => ({ b, t, n })
  };
  window.Session = { getScriptTimeZone: () => 'Asia/Baku' };
  window.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: k => (state.props[k] === undefined ? null : state.props[k]),
      getProperties: () => Object.assign({}, state.props),
      setProperty: (k, v) => { state.props[k] = String(v); },
      setProperties: (o) => { Object.keys(o).forEach(k => { state.props[k] = String(o[k]); }); },
      deleteProperty: k => { delete state.props[k]; }
    })
  };
  window.CacheService = {
    getScriptCache: () => ({
      get: k => { window.__mockStats.cacheGets++; return state.cache[k] === undefined ? null : state.cache[k]; },
      getAll: ks => { window.__mockStats.cacheGets++; const o = {}; ks.forEach(k => { if (state.cache[k] !== undefined) o[k] = state.cache[k]; }); return o; },
      put: (k, v) => { if (String(v).length > 100000) throw new Error('Argument too large'); state.cache[k] = String(v); },
      putAll: (o) => { Object.keys(o).forEach(k => { if (String(o[k]).length > 100000) throw new Error('Argument too large'); state.cache[k] = String(o[k]); }); },
      remove: k => { delete state.cache[k]; },
      removeAll: ks => { ks.forEach(k => { delete state.cache[k]; }); }
    })
  };
  window.LockService = { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) };
  window.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) };
  window.ScriptApp = {
    getProjectTriggers: () => (state.triggers || []).map(h => ({ getHandlerFunction: () => h })),
    newTrigger: (h) => {
      const b = { forSpreadsheet: () => b, onChange: () => b, onEdit: () => b, timeBased: () => b, everyDays: () => b, atHour: () => b, everyHours: () => b, inTimezone: () => b,
        create: () => { state.triggers = (state.triggers || []).concat([h]); return {}; } };
      return b;
    }
  };
  let fileN = 0;
  window.DriveApp = {
    createFolder: () => ({ getId: () => 'FOLDER' }),
    getFolderById: () => ({ createFile: () => ({ getUrl: () => 'https://drive.google.com/file/d/mock' + (++fileN) + '/view' }), getFiles: () => ({ hasNext: () => false }) }),
    getFileById: () => ({ makeCopy() {} })
  };
  window.Logger = { log: (...a) => console.log('[GAS]', ...a) };

  window.__mockCall = async function (body) {
    await new Promise(r => setTimeout(r, Number(localStorage.getItem('ub_mock_delay') || 60)));
    try {
      const fresh = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (fresh) { state.sheets = fresh.sheets; state.order = fresh.order; state.props = fresh.props; state.cache = fresh.cache || {}; state.max = fresh.max || {}; state.triggers = fresh.triggers; }
    } catch (e) {}
    const out = window.doPost({ postData: { contents: JSON.stringify(body) } });
    persist();
    return JSON.parse(out.s);
  };
  window.__mockPersist = persist;
  try { if (!localStorage.getItem('ub_api')) localStorage.setItem('ub_api', 'mock'); } catch (e) {}
})();
