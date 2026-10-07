// Fake Apps Script environment for Node tests: Sheets, Properties, Cache, Lock, Drive, Triggers.
// Counts every service call so we can estimate server time.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');

// Estimated latency per call (ms) — typical Apps Script values, used only for a rough total.
const COST = { open: 150, getSheetByName: 20, getSheets: 20, getLastRow: 40, getMaxRows: 30, read: 70, flushWrite: 80, props: 15, propsWrite: 25, cache: 15, cacheWrite: 20, lock: 20 };

function makeEnv() {
  const C = {}; const hit = k => { C[k] = (C[k] || 0) + 1; };
  const state = { sheets: {}, order: [] };
  let pendingWrites = 0;
  const flushIfPending = () => { if (pendingWrites) { hit('flushWrite'); pendingWrites = 0; } };
  function Range(s, r, c, nr, nc) { Object.assign(this, { s, r, c, nr: nr || 1, nc: nc || 1 }); }
  Range.prototype.setNumberFormat = function () { pendingWrites++; return this; };
  Range.prototype.setFontWeight = function () { pendingWrites++; return this; };
  Range.prototype.clearContent = function () { pendingWrites++; const rows = this.s.rows(); for (let i = 0; i < this.nr; i++) { const row = rows[this.r - 1 + i]; if (row) for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; } return this; };
  Range.prototype.getValues = function () { flushIfPending(); hit('read'); const out = []; for (let i = 0; i < this.nr; i++) { const row = this.s.rows()[this.r - 1 + i] || []; const o = []; for (let j = 0; j < this.nc; j++) o.push(row[this.c - 1 + j] === undefined ? '' : row[this.c - 1 + j]); out.push(o); } return out; };
  Range.prototype.setValues = function (vals) { pendingWrites++; const rows = this.s.rows(); vals.forEach((v, i) => { const ri = this.r - 1 + i; if (ri >= this.s.max) throw new Error('outside dimensions'); while (rows.length <= ri) rows.push([]); v.forEach((x, j) => { rows[ri][this.c - 1 + j] = x; }); }); return this; };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  function Sheet(name) { this.name = name; }
  Sheet.prototype.rows = function () { return state.sheets[this.name].rows; };
  Object.defineProperty(Sheet.prototype, 'max', { get() { return state.sheets[this.name].max; } });
  Sheet.prototype.lastRow = function () { const r = this.rows(); let n = r.length; while (n > 0 && (!r[n - 1] || r[n - 1].every(v => v === '' || v === undefined || v === null))) n--; return n; };
  Sheet.prototype.getLastRow = function () { flushIfPending(); hit('getLastRow'); return this.lastRow(); };
  Sheet.prototype.getMaxRows = function () { hit('getMaxRows'); return state.sheets[this.name].max; };
  Sheet.prototype.insertRowsAfter = function (a, n) { pendingWrites++; state.sheets[this.name].max += n; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr, nc); };
  Sheet.prototype.getDataRange = function () { const self = this; return { getValues() { flushIfPending(); hit('read'); const n = self.lastRow(); let w = 0; self.rows().slice(0, n).forEach(r => { w = Math.max(w, r.length); }); return self.rows().slice(0, n).map(r => { const o = []; for (let j = 0; j < w; j++) o.push(r[j] === undefined ? '' : r[j]); return o; }); } }; };
  Sheet.prototype.appendRow = function (vals) { pendingWrites++; const rows = this.rows(); const n = this.lastRow(); rows.length = n; rows.push(vals.slice()); if (rows.length > state.sheets[this.name].max) state.sheets[this.name].max = rows.length; return this; };
  Sheet.prototype.deleteRow = function (r) { pendingWrites++; this.rows().splice(r - 1, 1); };
  Sheet.prototype.setFrozenRows = function () { pendingWrites++; };
  Sheet.prototype.getName = function () { return this.name; };
  const book = {
    getSheetByName(n) { hit('getSheetByName'); return state.sheets[n] ? new Sheet(n) : null; },
    insertSheet(n) { pendingWrites++; state.sheets[n] = { rows: [], max: 1000 }; state.order.push(n); return new Sheet(n); },
    getSheets() { hit('getSheets'); return state.order.map(n => new Sheet(n)); },
    deleteSheet(s) { delete state.sheets[s.name]; state.order = state.order.filter(x => x !== s.name); },
    getId() { return 'BOOK'; }, getUrl() { return 'https://docs.google.com/spreadsheets/d/BOOK'; },
    setSpreadsheetTimeZone() { pendingWrites++; }
  };
  const props = {}; const cacheStore = {};
  const pad = x => String(x).padStart(2, '0');
  const triggers = [];
  const env = {
    console, Math, Number, String, Object, Array, JSON, Date, isFinite, Error, RegExp, Boolean,
    SpreadsheetApp: { getActiveSpreadsheet: () => null, openById: () => { hit('open'); return book; }, create: () => { hit('open'); state.sheets.Sheet1 = { rows: [], max: 1000 }; state.order.push('Sheet1'); return book; }, flush: () => flushIfPending() },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
      computeDigest: (a, s) => Array.from(crypto.createHash(a === 'md5' ? 'md5' : 'sha256').update(String(s)).digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate(d, tz, fmt) { const Y = d.getFullYear(), M = pad(d.getMonth() + 1), D = pad(d.getDate()), h = pad(d.getHours()), m = pad(d.getMinutes()), s = pad(d.getSeconds()); if (fmt === 'yyyy-MM-dd') return Y + '-' + M + '-' + D; if (fmt === 'HH:mm') return h + ':' + m; return Y + '-' + M + '-' + D + 'T' + h + ':' + m + ':' + s; },
      base64Decode: s => s, base64EncodeWebSafe: s => Buffer.from(String(s)).toString('base64'), newBlob: () => ({})
    },
    Session: { getScriptTimeZone: () => 'Asia/Baku' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => { hit('props'); return props[k] === undefined ? null : props[k]; },
      getProperties: () => { hit('props'); return Object.assign({}, props); },
      setProperty: (k, v) => { hit('propsWrite'); props[k] = String(v); },
      setProperties: (o) => { hit('propsWrite'); Object.keys(o).forEach(k => { props[k] = String(o[k]); }); },
      deleteProperty: k => { hit('propsWrite'); delete props[k]; }
    }) },
    CacheService: { getScriptCache: () => ({
      get: k => { hit('cache'); return cacheStore[k] === undefined ? null : cacheStore[k]; },
      getAll: ks => { hit('cache'); const o = {}; ks.forEach(k => { if (cacheStore[k] !== undefined) o[k] = cacheStore[k]; }); return o; },
      put: (k, v) => { hit('cacheWrite'); if (Buffer.byteLength(String(v)) > 102400) throw new Error('Argument too large'); cacheStore[k] = String(v); },
      putAll: (o) => { hit('cacheWrite'); Object.keys(o).forEach(k => { if (Buffer.byteLength(String(o[k])) > 102400) throw new Error('Argument too large'); cacheStore[k] = String(o[k]); }); },
      remove: k => { hit('cacheWrite'); delete cacheStore[k]; }, removeAll: ks => { hit('cacheWrite'); ks.forEach(k => delete cacheStore[k]); }
    }) },
    LockService: { getScriptLock: () => ({ waitLock() { hit('lock'); }, tryLock() { hit('lock'); return true; }, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
    DriveApp: { createFolder: () => ({ getId: () => 'FOLDER' }), getFolderById: () => ({ createFile: () => ({ getUrl: () => 'u' }), getFiles: () => ({ hasNext: () => false }) }), getFileById: () => ({ makeCopy() {} }) },
    ScriptApp: { getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })), newTrigger: (h) => { const b = { forSpreadsheet: () => b, onChange: () => b, onEdit: () => b, timeBased: () => b, everyDays: () => b, atHour: () => b, everyHours: () => b, inTimezone: () => b, create: () => { triggers.push(h); return {}; } }; return b; } },
    Logger: { log: () => {} },
    module: { exports: {} }
  };
  env.C = C; env.reset = () => { Object.keys(C).forEach(k => delete C[k]); pendingWrites = 0; }; env.endExec = () => flushIfPending();
  env.state = state; env.props = props; env.cacheStore = cacheStore; env.triggers = triggers;
  return env;
}

/** Loads Code.gs into a fresh fake environment. Returns { env, ctx, api, call }. */
function load(file) {
  const env = makeEnv();
  const ctx = vm.createContext(env);
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.__api = { setup, doPost, doGet, onSheetChange: typeof onSheetChange === "function" ? onSheetChange : null, cleanup: typeof cleanup === "function" ? cleanup : null, setAdminLogin: typeof setAdminLogin === "function" ? setAdminLogin : null, seedTestData: typeof seedTestData === "function" ? seedTestData : null, removeTestData: typeof removeTestData === "function" ? removeTestData : null, DB: typeof DB === "object" ? DB : null, SCHEMA };', ctx);
  const api = ctx.__api;
  function call(body, allowFail) {
    env.reset();
    const out = api.doPost({ postData: { contents: JSON.stringify(body) } });
    env.endExec();
    const j = JSON.parse(out.s);
    if (!j.ok && !allowFail) throw new Error(body.action + ': ' + j.error + ' ' + (j.detail || ''));
    return { j, calls: Object.assign({}, env.C), bytes: out.s.length };
  }
  return { env, ctx, api, call };
}

function est(c) { return Object.keys(c).reduce((s, k) => s + (COST[k] || 0) * c[k], 0); }

module.exports = { makeEnv, load, est, COST };
