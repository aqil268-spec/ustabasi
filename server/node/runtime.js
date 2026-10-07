/*
 * Master — Node.js runtime for server/Code.gs.
 * Code.gs runs unchanged. This file gives it the Apps Script services it uses
 * (SpreadsheetApp, PropertiesService, CacheService, DriveApp, ...).
 * All data lives in memory and the store (store.js) writes each change to PostgreSQL.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const TZ = 'Asia/Baku';

// ---------- date format (Utilities.formatDate) ----------
const fmtCache = {};
function parts(d, tz) {
  const key = tz || TZ;
  if (!fmtCache[key]) {
    fmtCache[key] = new Intl.DateTimeFormat('en-CA', {
      timeZone: key, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  const o = {};
  fmtCache[key].formatToParts(d).forEach(p => { o[p.type] = p.value; });
  return o;
}
function formatDate(d, tz, fmt) {
  const p = parts(d instanceof Date ? d : new Date(d), tz);
  let out = '';
  const f = String(fmt);
  for (let i = 0; i < f.length;) {
    if (f[i] === "'") { const j = f.indexOf("'", i + 1); out += f.slice(i + 1, j < 0 ? f.length : j); i = j < 0 ? f.length : j + 1; continue; }
    const t = f.slice(i).match(/^(yyyy|MM|dd|HH|mm|ss)/);
    if (t) {
      out += { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second }[t[1]];
      i += t[1].length;
    } else { out += f[i]; i++; }
  }
  return out;
}

// ---------- runtime ----------
function createRuntime(opts) {
  opts = opts || {};
  const publicUrl = String(opts.publicUrl || '').replace(/\/+$/, '');
  const log = opts.log || ((...a) => console.log('[gas]', ...a));

  // state: books → sheets → rows (row 1 = header). Loaded from PostgreSQL by store.js.
  const state = { books: {}, props: {}, triggers: [] };
  const cache = new Map();   // key → { v, exp }
  let changes = newChanges();

  function newChanges() {
    return { rows: new Map(), full: new Set(), sheets: new Set(), dropSheets: new Set(), books: new Set(), props: new Set(), propsDel: new Set(), files: [], filesDel: new Set(), triggers: false };
  }
  const sk = (b, s) => b + '\u0001' + s;
  function markRow(b, s, ri) { const k = sk(b, s); if (changes.full.has(k)) return; if (!changes.rows.has(k)) changes.rows.set(k, new Set()); changes.rows.get(k).add(ri); }
  function markFull(b, s) { const k = sk(b, s); changes.full.add(k); changes.rows.delete(k); }

  // ----- Spreadsheet -----
  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.setNumberFormat = function () { return this; };
  Range.prototype.setFontWeight = function () { return this; };
  Range.prototype.getValues = function () {
    const rows = this.sh.rows(), out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = rows[this.r - 1 + i] || [], o = [];
      for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); }
      out.push(o);
    }
    return out;
  };
  Range.prototype.setValues = function (vals) {
    const rows = this.sh.rows();
    vals.forEach((v, i) => {
      const ri = this.r - 1 + i;
      if (ri >= this.sh.getMaxRows()) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      while (rows.length <= ri) rows.push([]);
      const row = rows[ri];
      v.forEach((x, j) => { row[this.c - 1 + j] = x === undefined || x === null ? '' : x; });
      markRow(this.sh.book, this.sh.name, ri);
    });
    return this;
  };
  Range.prototype.setValue = function (v) { return this.setValues([[v]]); };
  Range.prototype.clearContent = function () {
    const rows = this.sh.rows();
    for (let i = 0; i < this.nr; i++) {
      const ri = this.r - 1 + i, row = rows[ri];
      if (row) { for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = ''; markRow(this.sh.book, this.sh.name, ri); }
    }
    return this;
  };

  function Sheet(book, name) { this.book = book; this.name = name; }
  Sheet.prototype.data = function () { const b = state.books[this.book]; const s = b && b.sheets[this.name]; if (!s) throw new Error('Sheet not found: ' + this.name); return s; };
  Sheet.prototype.rows = function () { return this.data().rows; };
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getLastRow = function () {
    const r = this.rows(); let n = r.length;
    while (n > 0 && (!r[n - 1] || r[n - 1].every(v => v === '' || v === undefined || v === null))) n--;
    return n;
  };
  Sheet.prototype.getMaxRows = function () { const d = this.data(); return Math.max(d.max || 1000, d.rows.length); };
  Sheet.prototype.insertRowsAfter = function (after, n) { const d = this.data(); d.max = this.getMaxRows() + n; changes.sheets.add(sk(this.book, this.name)); return this; };
  Sheet.prototype.getRange = function (r, c, nr, nc) {
    if (typeof r !== 'number') throw new Error('A1 notation is not supported');
    return new Range(this, r, c, nr, nc);
  };
  Sheet.prototype.getDataRange = function () {
    const self = this;
    return {
      getValues() {
        const n = self.getLastRow(); let w = 0;
        const rows = self.rows().slice(0, n);
        rows.forEach(r => { w = Math.max(w, r.length); });
        return rows.map(r => { const o = []; for (let j = 0; j < w; j++) { const v = r[j]; o.push(v === undefined || v === null ? '' : v); } return o; });
      }
    };
  };
  Sheet.prototype.appendRow = function (vals) {
    const d = this.data(), rows = d.rows, n = this.getLastRow();
    const oldLen = rows.length;
    rows.length = n;
    rows.push(vals.map(v => (v === undefined || v === null ? '' : v)));
    if (rows.length > (d.max || 1000)) { d.max = rows.length; changes.sheets.add(sk(this.book, this.name)); }
    if (oldLen > n) markFull(this.book, this.name); else markRow(this.book, this.name, rows.length - 1);
    return this;
  };
  Sheet.prototype.deleteRow = function (r) { this.rows().splice(r - 1, 1); markFull(this.book, this.name); };
  Sheet.prototype.setFrozenRows = function () { return this; };

  function Book(id) { this.id = id; }
  Book.prototype.data = function () { const b = state.books[this.id]; if (!b) throw new Error('Spreadsheet not found'); return b; };
  Book.prototype.getId = function () { return this.id; };
  Book.prototype.getUrl = function () { return ''; };
  Book.prototype.getName = function () { return this.data().name; };
  Book.prototype.getSheetByName = function (n) { return this.data().sheets[n] ? new Sheet(this.id, n) : null; };
  Book.prototype.getSheets = function () { return this.data().order.map(n => new Sheet(this.id, n)); };
  Book.prototype.insertSheet = function (n) {
    const b = this.data();
    if (b.sheets[n]) throw new Error('A sheet with the name "' + n + '" already exists.');
    b.sheets[n] = { rows: [], max: 1000 }; b.order.push(n);
    changes.books.add(this.id); markFull(this.id, n); changes.sheets.add(sk(this.id, n));
    return new Sheet(this.id, n);
  };
  Book.prototype.deleteSheet = function (sh) {
    const b = this.data();
    delete b.sheets[sh.name]; b.order = b.order.filter(x => x !== sh.name);
    changes.books.add(this.id); changes.dropSheets.add(sk(this.id, sh.name));
  };
  Book.prototype.setSpreadsheetTimeZone = function () {};

  function createBook(name) {
    const id = 'B' + crypto.randomUUID().replace(/-/g, '');
    state.books[id] = { name: name || 'Untitled', order: ['Sheet1'], sheets: { Sheet1: { rows: [], max: 1000 } } };
    changes.books.add(id); markFull(id, 'Sheet1'); changes.sheets.add(sk(id, 'Sheet1'));
    return new Book(id);
  }

  // ----- Drive (photos, PDF, backups) -----
  function Blob(bytes, mime, name) { this.bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []); this.mime = mime || 'application/octet-stream'; this.name = name || 'file'; }
  Blob.prototype.setName = function (n) { this.name = n; return this; };
  Blob.prototype.getName = function () { return this.name; };
  Blob.prototype.getBytes = function () { return this.bytes; };
  Blob.prototype.getContentType = function () { return this.mime; };

  function fileUrl(f) {
    if (!/^(image\/|application\/pdf$)/.test(f.mime)) return '';   // backups are never public
    return publicUrl + '/files/' + f.id + '/' + encodeURIComponent(f.name);
  }
  function DriveFile(f) { this.f = f; }
  DriveFile.prototype.getId = function () { return this.f.id; };
  DriveFile.prototype.getName = function () { return this.f.name; };
  DriveFile.prototype.getUrl = function () { return fileUrl(this.f); };
  DriveFile.prototype.getDateCreated = function () { return new Date(this.f.created); };
  DriveFile.prototype.setTrashed = function (t) {
    if (!t) return this;
    changes.filesDel.add(this.f.id);
    const list = state.fileIndex[this.f.folder || ''];
    if (list) state.fileIndex[this.f.folder || ''] = list.filter(x => x.id !== this.f.id);
    return this;
  };
  DriveFile.prototype.makeCopy = function (name, folder) {
    // Only used for backups: copy of the data spreadsheet → JSON snapshot.
    const b = state.books[this.f.id];
    if (!b) throw new Error('File not found');
    const snap = { name: b.name, order: b.order, sheets: {} };
    b.order.forEach(n => { snap.sheets[n] = b.sheets[n].rows; });
    return addFile(folder ? folder.id : '', name, 'application/json', Buffer.from(JSON.stringify(snap)));
  };
  function addFile(folder, name, mime, bytes) {
    const f = { id: crypto.randomUUID().replace(/-/g, ''), folder: folder || '', name, mime, bytes, created: Date.now() };
    changes.files.push(f);
    (state.fileIndex[f.folder] = state.fileIndex[f.folder] || []).push({ id: f.id, folder: f.folder, name, mime, created: f.created });
    return new DriveFile(f);
  }
  function Folder(id) { this.id = id; }
  Folder.prototype.getId = function () { return this.id; };
  Folder.prototype.createFile = function (blob) { return addFile(this.id, blob.name, blob.mime, blob.bytes); };
  Folder.prototype.getFiles = function () {
    const list = (state.fileIndex[this.id] || []).filter(f => !changes.filesDel.has(f.id)).map(f => new DriveFile(f));
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  };
  state.fileIndex = {};

  // ----- Properties / Cache -----
  const scriptProps = {
    getProperty: k => (Object.prototype.hasOwnProperty.call(state.props, k) ? state.props[k] : null),
    getProperties: () => Object.assign({}, state.props),
    setProperty: (k, v) => { state.props[k] = String(v); changes.props.add(k); changes.propsDel.delete(k); return scriptProps; },
    setProperties: (o) => { Object.keys(o).forEach(k => scriptProps.setProperty(k, o[k])); return scriptProps; },
    deleteProperty: k => { delete state.props[k]; changes.propsDel.add(k); changes.props.delete(k); return scriptProps; }
  };
  const LIMIT = 100 * 1024;
  function cget(k) { const e = cache.get(k); if (!e) return null; if (e.exp < Date.now()) { cache.delete(k); return null; } return e.v; }
  function cput(k, v, ttl) {
    const s = String(v);
    if (Buffer.byteLength(s) > LIMIT) throw new Error('Argument too large: value');
    cache.set(k, { v: s, exp: Date.now() + Math.min(Number(ttl) || 600, 21600) * 1000 });
  }
  const scriptCache = {
    get: cget,
    getAll: ks => { const o = {}; ks.forEach(k => { const v = cget(k); if (v !== null) o[k] = v; }); return o; },
    put: cput,
    putAll: (o, ttl) => { Object.keys(o).forEach(k => cput(k, o[k], ttl)); },
    remove: k => { cache.delete(k); },
    removeAll: ks => { ks.forEach(k => cache.delete(k)); }
  };
  // Keep memory bounded: drop expired keys every 10 minutes.
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, e] of cache) if (e.exp < now) cache.delete(k); }, 600000);
  if (sweep.unref) sweep.unref();

  // ----- Triggers -----
  function newTrigger(handler) {
    const b = {};
    ['forSpreadsheet', 'onChange', 'onEdit', 'timeBased', 'everyDays', 'atHour', 'everyHours', 'everyMinutes', 'inTimezone', 'onWeekDay'].forEach(m => { b[m] = () => b; });
    b.create = () => { if (state.triggers.indexOf(handler) < 0) { state.triggers.push(handler); changes.triggers = true; } return { getHandlerFunction: () => handler }; };
    return b;
  }

  let currentLicense = null;   // set by the superadmin (index.js /_ctl/license)
  const env = {
    LICENSE_GET: () => currentLicense,
    console, Math, Number, String, Object, Array, JSON, Date, isFinite, isNaN, parseInt, parseFloat, Error, RegExp, Boolean, Symbol, Map, Set, Promise, encodeURIComponent, decodeURIComponent,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => null,
      openById: (id) => { if (!state.books[id]) throw new Error('Spreadsheet not found: ' + id); return new Book(id); },
      create: (name) => createBook(name),
      flush: () => {}
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5', SHA_1: 'sha1' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => Array.from(crypto.createHash(a || 'sha256').update(typeof s === 'string' ? s : Buffer.from(s)).digest()).map(b => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(),
      formatDate,
      base64Decode: s => Buffer.from(String(s), 'base64'),
      base64Encode: s => Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64'),
      base64EncodeWebSafe: s => Buffer.from(typeof s === 'string' ? s : Buffer.from(s)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      newBlob: (bytes, mime, name) => new Blob(bytes, mime, name),
      sleep: () => {}
    },
    Session: {
      getScriptTimeZone: () => TZ,
      getEffectiveUser: () => ({ getEmail: () => process.env.ADMIN_EMAIL || '' }),
      getActiveUser: () => ({ getEmail: () => process.env.ADMIN_EMAIL || '' })
    },
    PropertiesService: { getScriptProperties: () => scriptProps },
    CacheService: { getScriptCache: () => scriptCache },
    // Requests run one at a time (index.js queue), so the lock is always free.
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } }) },
    ContentService: { MimeType: { JSON: 'json', TEXT: 'text' }, createTextOutput: s => ({ s: String(s), setMimeType() { return this; }, getContent() { return this.s; } }) },
    DriveApp: {
      createFolder: () => new Folder('F' + crypto.randomUUID().replace(/-/g, '')),
      getFolderById: id => new Folder(String(id)),
      getFileById: id => {
        if (state.books[id]) return new DriveFile({ id, name: state.books[id].name, mime: 'application/vnd.google-apps.spreadsheet', created: Date.now() });
        throw new Error('File not found');
      }
    },
    ScriptApp: {
      getProjectTriggers: () => state.triggers.map(h => ({ getHandlerFunction: () => h })),
      newTrigger,
      deleteTrigger: t => { state.triggers = state.triggers.filter(h => h !== t.getHandlerFunction()); changes.triggers = true; },
      getOAuthToken: () => ''
    },
    // Not available outside Google: weekly Excel mail is skipped (weeklyMail returns early).
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 501, getContentText: () => '', getBlob: () => new Blob(Buffer.alloc(0)) }) },
    MailApp: { sendEmail: (to, subj) => { log('mail skipped:', to, subj); } },
    Logger: { log: (...a) => log(...a) }
  };

  const ctx = vm.createContext(env);
  let api = null;

  function load(codeFile) {
    let src = fs.readFileSync(codeFile, 'utf8');
    // First admin from environment (keeps the default values in the repo out of production).
    const q = v => JSON.stringify(String(v));
    if (process.env.ADMIN_NAME) src = src.replace(/^const ADMIN_NAME = .*$/m, 'const ADMIN_NAME = ' + q(process.env.ADMIN_NAME) + ';');
    if (process.env.ADMIN_PHONE) src = src.replace(/^const ADMIN_PHONE = .*$/m, 'const ADMIN_PHONE = ' + q(process.env.ADMIN_PHONE) + ';');
    if (process.env.ADMIN_PASSWORD) src = src.replace(/^const ADMIN_PASSWORD = .*$/m, 'const ADMIN_PASSWORD = ' + q(process.env.ADMIN_PASSWORD) + ';');
    if (process.env.COMPANY_NAME) src = src.replace(/^(\s*companyName: ).*$/m, '$1' + q(process.env.COMPANY_NAME) + ',');
    const fns = ['setup', 'doPost', 'doGet', 'onSheetChange', 'cleanup', 'dailyBackup', 'hourly', 'weeklyMail', 'setAdminLogin', 'clearCache', 'seedTestData', 'removeTestData', 'resetAdminSilent', 'licenseUsage'];
    const exp = fns.map(f => f + ': typeof ' + f + ' === "function" ? ' + f + ' : null').join(', ');
    vm.runInContext(src + '\n;this.__api = { ' + exp + ', SCHEMA, VERSION };', ctx, { filename: 'Code.gs' });
    api = ctx.__api;
    return api;
  }

  return {
    state, env, cache, load,
    setLicense(l) { currentLicense = l || null; },
    get license() { return currentLicense; },
    get api() { return api; },
    takeChanges() { const c = changes; changes = newChanges(); return c; },
    hasChanges() { const c = changes; return c.rows.size || c.full.size || c.sheets.size || c.dropSheets.size || c.books.size || c.props.size || c.propsDel.size || c.files.length || c.filesDel.size || c.triggers; },
    clearCache() { cache.clear(); },
    /** Replaces all data (used after load or after a failed write). */
    replaceState(s) {
      state.books = s.books || {}; state.props = s.props || {}; state.triggers = s.triggers || []; state.fileIndex = s.fileIndex || {};
      changes = newChanges(); cache.clear();
    },
    formatDate
  };
}

module.exports = { createRuntime, formatDate, TZ };
