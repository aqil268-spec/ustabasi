/**
 * Ustabaşı — server (Google Apps Script), v0.1.1
 * Ayrıca (standalone) layihədə və Sheet-ə bağlı layihədə işləyir.
 * Sheet yoxdursa, setup() "Ustabaşı — data" adlı Sheet-i özü yaradır.
 *
 * Quraşdırma (qısa):
 *  1. Aşağıdakı ADMIN_* dəyərlərini dəyişin və yadda saxlayın.
 *  2. Funksiya siyahısında setup seçin və "Run" basın (icazələri verin).
 *  3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *  4. Web app URL-ni tətbiqin config.js faylına yazın.
 */

// ---- 1. Birinci admin (setup-dan əvvəl dəyişin) ----
const ADMIN_NAME = 'Admin';
const ADMIN_PHONE = '994500000000';   // yalnız rəqəm
const ADMIN_PIN = '1234';             // 4–8 rəqəm; sonra tətbiqdə dəyişin

// ---- 2. Sxem ----
const SCHEMA = {
  Settings: ['key', 'value'],
  Users: ['id', 'role', 'name', 'phone', 'pinHash', 'lang', 'status', 'payType', 'payModel', 'baseAmount', 'bonusPercent', 'created'],
  Sessions: ['token', 'userId', 'expires'],
  Workers: ['id', 'name', 'phone', 'foremanId', 'specialty', 'grade', 'payType', 'baseAmount', 'payModel', 'bonusBase', 'norm', 'startTime', 'endTime', 'lang', 'status', 'created'],
  WorkerHistory: ['ts', 'workerId', 'field', 'oldValue', 'newValue', 'by'],
  Customers: ['id', 'name', 'phone', 'type', 'created'],
  Sites: ['id', 'customerId', 'name', 'address', 'lat', 'lng', 'radius', 'foremanId', 'status', 'contractNo', 'contractDate', 'contractAmount', 'created', 'approvedBy', 'approvedAt'],
  WorkTypes: ['id', 'name', 'unit', 'bonusType', 'rateHelper', 'rateMaster', 'rateSenior', 'percent', 'active'],
  Estimates: ['id', 'siteId', 'workTypeId', 'planQty', 'clientPrice'],
  CustomerPayments: ['id', 'siteId', 'date', 'amount', 'note'],
  Tokens: ['token', 'kind', 'workerId', 'siteId', 'refId', 'created', 'expires', 'usedAt', 'createdBy'],
  Attendance: ['id', 'workerId', 'siteId', 'kind', 'ts', 'date', 'lat', 'lng', 'acc', 'dist', 'source', 'reason', 'status', 'diffMin', 'by'],
  GeoRejects: ['ts', 'token', 'workerId', 'siteId', 'dist', 'lat', 'lng'],
  WorkEntries: ['id', 'date', 'siteId', 'workTypeId', 'qty', 'photos', 'note', 'status', 'returnReason', 'foremanId', 'created', 'approvedBy', 'approvedAt'],
  WorkShares: ['entryId', 'workerId', 'share', 'confirmedAt', 'token'],
  Advances: ['id', 'workerId', 'amount', 'reason', 'status', 'foremanId', 'created', 'approvedAt', 'receiptNo', 'rejectReason', 'givenAt', 'overLimit'],
  Deductions: ['id', 'workerId', 'type', 'amount', 'reason', 'date', 'by'],
  PlanDays: ['month', 'days', 'by', 'at'],
  Payroll: ['month', 'personType', 'personId', 'name', 'payType', 'payModel', 'daysWorked', 'planDays', 'S', 'B', 'bonus', 'advance', 'penalty', 'correction', 'total', 'paid', 'paidAt', 'lateCount', 'incompleteDays'],
  Periods: ['month', 'status', 'closedAt', 'by'],
  AuditLog: ['ts', 'userId', 'sheet', 'rowId', 'action', 'details']
};

const DEFAULT_SETTINGS = {
  linkTtlMin: '10',
  defaultRadius: '150',
  advanceLimitPct: '50',
  lateToleranceMin: '15',
  maxForemen: '10',
  maxWorkersPerForeman: '20',
  foremanSeesPay: 'yes',
  appUrl: '',
  sessionDays: '30'
};

const SEED_WORK_TYPES = [
  ['Kafel döşəmə', 'm²'], ['Suvaq', 'm²'], ['Şpaklyovka', 'm²'], ['Boya', 'm²'],
  ['Alçıpan', 'm²'], ['Laminat', 'm²'], ['Plintus', 'm'], ['Elektrik nöqtəsi', 'ədəd'], ['Santexnika nöqtəsi', 'ədəd']
];

// ======================================================================
// 3. Saf funksiyalar (Sheets-dən asılı deyil, Node-da test olunur)
// ======================================================================

function num(v) { const n = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }
function monthOf(s) { return String(s || '').slice(0, 7); }
function dateOf(s) { return String(s || '').slice(0, 10); }
function minutesOf(hhmm) { const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

/** Haversine məsafəsi, metr. */
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (num(lat2) - num(lat1)) * toRad, dLng = (num(lng2) - num(lng1)) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(num(lat1) * toRad) * Math.cos(num(lat2) * toRad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** Bir iş sətrinin bir usta üçün bonus məbləği. */
function shareAmount(entry, share, worker, workType, estimate) {
  const qty = num(entry.qty), part = num(share.share) / 100;
  if (!workType) return 0;
  if (workType.bonusType === 'PCT') {
    const price = estimate ? num(estimate.clientPrice) : 0;
    return qty * price * num(workType.percent) / 100 * part;
  }
  const g = worker ? worker.grade : 'master';
  let rate = g === 'helper' ? num(workType.rateHelper) : g === 'senior' ? num(workType.rateSenior) : num(workType.rateMaster);
  if (!rate) rate = num(workType.rateMaster);
  return qty * rate * part;
}

/** Ustanın ay üzrə davamiyyət xülasəsi. Gün = həmin tarixdə təsdiqli gəliş VƏ çıxış. */
function attendanceSummary(workerId, month, attendance, tolerance) {
  const byDate = {};
  attendance.forEach(a => {
    if (a.workerId !== workerId || monthOf(a.date) !== month) return;
    if (a.status !== 'OK') return;
    const d = byDate[a.date] || (byDate[a.date] = { IN: null, OUT: null });
    if (a.kind === 'IN' && !d.IN) d.IN = a;
    if (a.kind === 'OUT') d.OUT = a;
  });
  let days = 0, incomplete = 0, late = 0, early = 0;
  Object.keys(byDate).forEach(k => {
    const d = byDate[k];
    if (d.IN && d.OUT) days++; else incomplete++;
    if (d.IN && num(d.IN.diffMin) > tolerance) late++;
    if (d.OUT && num(d.OUT.diffMin) < -tolerance) early++;
  });
  return { days, incomplete, late, early };
}

/**
 * Vedomost hesablaması (BRD v0.2, bölmə 6).
 * input: { month, workers, foremen, attendance, entries, shares, workTypes, estimates, sites,
 *          advances, deductions, planDays, settings, planDaysOverride }
 */
function computePayroll(input) {
  const month = input.month;
  const tol = num((input.settings || {}).lateToleranceMin || 15);
  const plan = input.planDaysOverride !== undefined && input.planDaysOverride !== null && input.planDaysOverride !== ''
    ? num(input.planDaysOverride)
    : num(((input.planDays || []).find(p => p.month === month) || {}).days);
  const wtById = indexBy(input.workTypes || [], 'id');
  const siteById = indexBy(input.sites || [], 'id');
  const workerById = indexBy(input.workers || [], 'id');
  const estKey = {};
  (input.estimates || []).forEach(e => { estKey[e.siteId + '|' + e.workTypeId] = e; });
  const approved = {};
  (input.entries || []).forEach(e => { if (e.status === 'APPROVED' && monthOf(e.date) === month) approved[e.id] = e; });

  const bByWorker = {}, bByForeman = {}, pendingByWorker = {};
  (input.shares || []).forEach(s => {
    const e = approved[s.entryId];
    const all = (input.entries || []).find(x => x.id === s.entryId);
    const w = workerById[s.workerId];
    const target = e || all;
    if (!target) return;
    const amt = shareAmount(target, s, w, wtById[target.workTypeId], estKey[target.siteId + '|' + target.workTypeId]);
    if (e) {
      bByWorker[s.workerId] = (bByWorker[s.workerId] || 0) + amt;
      const fId = (siteById[e.siteId] || {}).foremanId || e.foremanId;
      if (fId) bByForeman[fId] = (bByForeman[fId] || 0) + amt;
    } else if (all && monthOf(all.date) === month && ['USTA_PENDING', 'ADMIN_PENDING'].indexOf(all.status) >= 0) {
      pendingByWorker[s.workerId] = (pendingByWorker[s.workerId] || 0) + amt;
    }
  });

  const advSum = {}, penSum = {}, corSum = {};
  (input.advances || []).forEach(a => {
    if (['APPROVED', 'GIVEN', 'SIGNED'].indexOf(a.status) < 0) return;
    if (monthOf(a.approvedAt || a.created) !== month) return;
    advSum[a.workerId] = (advSum[a.workerId] || 0) + num(a.amount);
  });
  (input.deductions || []).forEach(d => {
    if (monthOf(d.date) !== month) return;
    if (d.type === 'CORRECTION') corSum[d.workerId] = (corSum[d.workerId] || 0) + num(d.amount);
    else penSum[d.workerId] = (penSum[d.workerId] || 0) + Math.abs(num(d.amount));
  });

  const lines = [];
  (input.workers || []).forEach(w => {
    if (w.status === 'deleted') return;
    const att = attendanceSummary(w.id, month, input.attendance || [], tol);
    const model = w.payModel || 'STD';
    let S = 0;
    if (model !== 'BONUS') {
      if (w.payType === 'DAY') S = num(w.baseAmount) * att.days;
      else S = plan > 0 ? num(w.baseAmount) / plan * att.days : 0;
    }
    const B = bByWorker[w.id] || 0;
    let bonus = 0;
    if (model !== 'STD') bonus = w.bonusBase === 'OVER_NORM' ? Math.max(0, B - num(w.norm)) : B;
    const advance = advSum[w.id] || 0, penalty = penSum[w.id] || 0, correction = corSum[w.id] || 0;
    const hasAny = S || B || advance || penalty || correction || att.days || att.incomplete;
    if (!hasAny && w.status !== 'active') return;
    lines.push({
      month, personType: 'WORKER', personId: w.id, name: w.name, foremanId: w.foremanId,
      payType: w.payType || 'MONTH', payModel: model, daysWorked: att.days, planDays: plan,
      S: round2(S), B: round2(B), bonus: round2(bonus), advance: round2(advance), penalty: round2(penalty),
      correction: round2(correction), total: round2(S + bonus - advance - penalty + correction),
      lateCount: att.late, earlyCount: att.early, incompleteDays: att.incomplete,
      pendingBonus: round2(pendingByWorker[w.id] || 0)
    });
  });

  (input.foremen || []).forEach(f => {
    if (f.status === 'deleted') return;
    const model = f.payModel || 'STD';
    let S = 0;
    if (model !== 'BONUS') S = f.payType === 'DAY' ? num(f.baseAmount) * plan : num(f.baseAmount);
    const B = bByForeman[f.id] || 0;
    const bonus = model === 'STD' ? 0 : B * num(f.bonusPercent) / 100;
    const advance = advSum[f.id] || 0, penalty = penSum[f.id] || 0, correction = corSum[f.id] || 0;
    if (!S && !bonus && f.status !== 'active') return;
    lines.push({
      month, personType: 'FOREMAN', personId: f.id, name: f.name, foremanId: f.id,
      payType: f.payType || 'MONTH', payModel: model, daysWorked: '', planDays: plan,
      S: round2(S), B: round2(B), bonus: round2(bonus), advance: round2(advance), penalty: round2(penalty),
      correction: round2(correction), total: round2(S + bonus - advance - penalty + correction),
      lateCount: 0, earlyCount: 0, incompleteDays: 0, pendingBonus: 0
    });
  });
  return { month, planDays: plan, lines };
}

/** Usta xərcinin prarablar arasında gün nisbəti ilə bölünməsi (BR-31). */
function splitCostByForeman(lines, attendance, sites, month) {
  const siteById = indexBy(sites || [], 'id');
  const out = {};
  lines.filter(l => l.personType === 'WORKER').forEach(l => {
    const daysBy = {};
    let total = 0;
    (attendance || []).forEach(a => {
      if (a.workerId !== l.personId || monthOf(a.date) !== month || a.status !== 'OK' || a.kind !== 'IN') return;
      const f = (siteById[a.siteId] || {}).foremanId || l.foremanId;
      daysBy[f] = (daysBy[f] || 0) + 1; total++;
    });
    const cost = num(l.S) + num(l.bonus);
    if (!total) { out[l.foremanId] = (out[l.foremanId] || 0) + cost; return; }
    Object.keys(daysBy).forEach(f => { out[f] = (out[f] || 0) + cost * daysBy[f] / total; });
  });
  Object.keys(out).forEach(k => { out[k] = round2(out[k]); });
  return out;
}

function indexBy(arr, key) { const o = {}; (arr || []).forEach(x => { o[x[key]] = x; }); return o; }

// ======================================================================
// 4. Sheets qatı
// ======================================================================

const TZ = 'Asia/Baku';
function tz() { return TZ; }
function nowIso() { return Utilities.formatDate(new Date(), tz(), "yyyy-MM-dd'T'HH:mm:ss"); }
function todayStr() { return Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd'); }
function addMinutesIso(min) { return Utilities.formatDate(new Date(Date.now() + min * 60000), tz(), "yyyy-MM-dd'T'HH:mm:ss"); }
function uid(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

function normCell(v) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1901) return Utilities.formatDate(v, tz(), 'HH:mm');
    return Utilities.formatDate(v, tz(), "yyyy-MM-dd'T'HH:mm:ss").replace('T00:00:00', '');
  }
  return v === null || v === undefined ? '' : String(v);
}

const DB = (function () {
  const cache = {};
  let bookObj = null;
  function book() {
    if (bookObj) return bookObj;
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (id) bookObj = SpreadsheetApp.openById(id);
    else { try { bookObj = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { bookObj = null; } }
    if (!bookObj) throw new Error('not_setup');
    return bookObj;
  }
  function sheet(name) {
    const sh = book().getSheetByName(name);
    if (!sh) throw new Error('Sheet yoxdur: ' + name + '. setup() funksiyasını işə salın.');
    return sh;
  }
  function all(name) {
    if (cache[name]) return cache[name];
    const sh = sheet(name), head = SCHEMA[name];
    const last = sh.getLastRow();
    const rows = [];
    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, head.length).getValues();
      vals.forEach((r, i) => {
        if (r.every(v => v === '' || v === null)) return;
        const o = { _row: i + 2 };
        head.forEach((h, j) => { o[h] = normCell(r[j]); });
        rows.push(o);
      });
    }
    cache[name] = rows;
    return rows;
  }
  function insert(name, obj) {
    const sh = sheet(name), head = SCHEMA[name];
    const vals = head.map(h => (obj[h] === undefined || obj[h] === null) ? '' : String(obj[h]));
    const row = sh.getLastRow() + 1;
    const rg = sh.getRange(row, 1, 1, head.length);
    rg.setNumberFormat('@');
    rg.setValues([vals]);
    const stored = { _row: row };
    head.forEach((h, j) => { stored[h] = vals[j]; });
    if (cache[name]) cache[name].push(stored);
    return stored;
  }
  function update(name, rowObj, patch) {
    const sh = sheet(name), head = SCHEMA[name];
    const vals = head.map(h => (h in patch) ? patch[h] : rowObj[h]);
    const rg = sh.getRange(rowObj._row, 1, 1, head.length);
    rg.setNumberFormat('@');
    rg.setValues([vals.map(v => (v === undefined || v === null) ? '' : String(v))]);
    Object.keys(patch).forEach(k => { rowObj[k] = (patch[k] === undefined || patch[k] === null) ? '' : String(patch[k]); });
    return rowObj;
  }
  function find(name, key, value) { return all(name).find(r => r[key] === value) || null; }
  function remove(name, rowObj) {
    sheet(name).deleteRow(rowObj._row);
    delete cache[name];
  }
  function reset() { Object.keys(cache).forEach(k => { delete cache[k]; }); bookObj = null; }
  return { all, insert, update, find, remove, book, sheet, reset };
})();

function settings() {
  const s = Object.assign({}, DEFAULT_SETTINGS);
  DB.all('Settings').forEach(r => { s[r.key] = r.value; });
  return s;
}

function audit(user, sheet, rowId, action, details) {
  try {
    DB.insert('AuditLog', { ts: nowIso(), userId: user ? user.id : 'public', sheet, rowId, action, details: details ? JSON.stringify(details).slice(0, 4000) : '' });
  } catch (e) { /* audit never breaks the request */ }
}

// ======================================================================
// 5. Quraşdırma
// ======================================================================

function setup() {
  const props = PropertiesService.getScriptProperties();
  let book = null;
  const savedId = props.getProperty('SHEET_ID');
  if (savedId) { try { book = SpreadsheetApp.openById(savedId); } catch (e) { book = null; } }
  if (!book) { try { book = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { book = null; } }
  if (!book) book = SpreadsheetApp.create('Ustabaşı — data');
  props.setProperty('SHEET_ID', book.getId());
  DB.reset();
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());
  Object.keys(SCHEMA).forEach(name => {
    let sh = book.getSheetByName(name);
    if (!sh) sh = book.insertSheet(name);
    const head = SCHEMA[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, Math.max(sh.getMaxRows(), 2), head.length).setNumberFormat('@');
  });
  book.getSheets().forEach(sh => {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(sh);
  });

  const have = DB.all('Settings').map(r => r.key);
  Object.keys(DEFAULT_SETTINGS).forEach(k => { if (have.indexOf(k) < 0) DB.insert('Settings', { key: k, value: DEFAULT_SETTINGS[k] }); });
  if (!props.getProperty('PHOTO_FOLDER')) {
    const folder = DriveApp.createFolder('Ustabaşı — fotolar');
    props.setProperty('PHOTO_FOLDER', folder.getId());
  }
  if (!DB.all('Users').some(u => u.role === 'admin')) {
    DB.insert('Users', { id: uid('U'), role: 'admin', name: ADMIN_NAME, phone: cleanPhone(ADMIN_PHONE), pinHash: hashPin(ADMIN_PIN), lang: 'az', status: 'active', created: nowIso() });
  }
  if (!DB.all('WorkTypes').length) {
    SEED_WORK_TYPES.forEach(w => DB.insert('WorkTypes', { id: uid('T'), name: w[0], unit: w[1], bonusType: 'AZN', rateHelper: 0, rateMaster: 0, rateSenior: 0, percent: 0, active: 'yes' }));
  }
  Logger.log('Hazırdır. Admin telefonu: ' + cleanPhone(ADMIN_PHONE));
  Logger.log('Data Sheet: ' + book.getUrl());
}

/** Köhnə sessiyaları və istifadə olunmuş linkləri təmizləyir (gündəlik trigger üçün). */
function cleanup() {
  const now = nowIso();
  ['Sessions'].forEach(name => {
    const rows = DB.all(name).filter(r => r.expires && r.expires < now).sort((a, b) => b._row - a._row);
    rows.forEach(r => DB.sheet(name).deleteRow(r._row));
  });
}

/** Gündəlik ehtiyat surəti (trigger: hər gün). */
function dailyBackup() {
  const file = DriveApp.getFileById(DB.book().getId());
  const name = 'Ustabaşı ehtiyat ' + todayStr();
  file.makeCopy(name, DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER')));
}

// ======================================================================
// 6. HTTP
// ======================================================================

function doGet() {
  const ready = !!PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return json({ ok: true, app: 'ustabasi', version: '0.1.1', ready });
}

function doPost(e) {
  DB.reset();
  if (!PropertiesService.getScriptProperties().getProperty('SHEET_ID')) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { if (!PropertiesService.getScriptProperties().getProperty('SHEET_ID')) setup(); } finally { lock.releaseLock(); }
    DB.reset();
  }
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json({ ok: false, error: 'bad_json' }); }
  const action = body.action;
  try {
    if (PUBLIC[action]) return json({ ok: true, data: withLock(action, () => PUBLIC[action](body)) });
    const user = requireUser(body.token);
    const fn = (user.role === 'admin' ? ADMIN[action] || COMMON[action] || FOREMAN[action] : COMMON[action] || FOREMAN[action]);
    if (!fn) return json({ ok: false, error: 'forbidden' });
    return json({ ok: true, data: withLock(action, () => fn(body, user)) });
  } catch (err) {
    const msg = String(err && err.message || err);
    return json({ ok: false, error: msg.indexOf(' ') < 0 ? msg : 'server', detail: msg });
  }
}

const READ_ONLY = { tokenInfo: 1, bootstrap: 1, me: 1, calcPayroll: 1, interim: 1, report: 1, ping: 1 };
function withLock(action, fn) {
  if (READ_ONLY[action]) return fn();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail(code) { throw new Error(code); }

function cleanPhone(p) { return String(p || '').replace(/\D/g, ''); }
function hashPin(pin) {
  const salt = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + String(pin));
  return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function requireUser(token) {
  if (!token) fail('auth');
  const s = DB.find('Sessions', 'token', String(token));
  if (!s || s.expires < nowIso()) fail('auth');
  const u = DB.find('Users', 'id', s.userId);
  if (!u || u.status !== 'active') fail('auth');
  return u;
}

function publicUser(u) { return { id: u.id, role: u.role, name: u.name, phone: u.phone, lang: u.lang || 'az' }; }
function isClosed(month) { const p = DB.find('Periods', 'month', month); return !!(p && p.status === 'CLOSED'); }
function assertOpen(dateStr) { if (isClosed(monthOf(dateStr))) fail('period_closed'); }

// ---------------------------------------------------------------- PUBLIC
const PUBLIC = {
  ping: () => ({ time: nowIso() }),

  login(b) {
    const phone = cleanPhone(b.phone);
    const u = DB.all('Users').find(x => x.phone === phone && x.status === 'active');
    if (!u || u.pinHash !== hashPin(b.pin)) fail('bad_login');
    const st = settings();
    const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
    DB.insert('Sessions', { token, userId: u.id, expires: addMinutesIso(num(st.sessionDays || 30) * 1440) });
    audit(u, 'Sessions', u.id, 'login');
    return { token, user: publicUser(u) };
  },

  tokenInfo(b) {
    const t = DB.find('Tokens', 'token', String(b.t || ''));
    if (!t) fail('link_not_found');
    const w = DB.find('Workers', 'id', t.workerId) || {};
    const site = DB.find('Sites', 'id', t.siteId) || {};
    const f = DB.find('Users', 'id', site.foremanId || w.foremanId) || {};
    const out = {
      kind: t.kind, used: !!t.usedAt, usedAt: t.usedAt, expires: t.expires, now: nowIso(),
      expired: !t.usedAt && t.expires < nowIso(),
      worker: { name: w.name, lang: w.lang || 'az', startTime: w.startTime, endTime: w.endTime },
      site: { name: site.name, address: site.address, radius: num(site.radius) },
      foreman: f.name || ''
    };
    if (t.kind === 'WORK') {
      const e = DB.find('WorkEntries', 'id', t.refId) || {};
      const wt = DB.find('WorkTypes', 'id', e.workTypeId) || {};
      const sh = DB.all('WorkShares').find(s => s.entryId === e.id && s.workerId === t.workerId) || {};
      out.work = { date: e.date, type: wt.name, unit: wt.unit, qty: num(e.qty), share: num(sh.share), myQty: round2(num(e.qty) * num(sh.share) / 100), status: e.status };
    }
    if (t.kind === 'IN' || t.kind === 'OUT') {
      const att = DB.all('Attendance').find(a => a.id === t.refId);
      if (att) out.result = { ts: att.ts, dist: num(att.dist) };
    }
    return out;
  },

  tokenConfirm(b) {
    const t = DB.find('Tokens', 'token', String(b.t || ''));
    if (!t) fail('link_not_found');
    if (t.usedAt) fail('link_used');
    if (t.expires < nowIso()) fail('link_expired');
    const w = DB.find('Workers', 'id', t.workerId);
    const site = DB.find('Sites', 'id', t.siteId);
    if (!w || !site) fail('link_not_found');

    if (t.kind === 'WORK') {
      const sh = DB.all('WorkShares').find(s => s.entryId === t.refId && s.workerId === t.workerId);
      const e = DB.find('WorkEntries', 'id', t.refId);
      if (!sh || !e) fail('link_not_found');
      if (e.status !== 'USTA_PENDING') fail('link_used');
      const now = nowIso();
      if (b.reject) {
        DB.update('WorkEntries', e, { status: 'RETURNED', returnReason: 'Usta razı deyil: ' + String(b.reason || '').slice(0, 200) });
      } else {
        DB.update('WorkShares', sh, { confirmedAt: now });
        const all = DB.all('WorkShares').filter(s => s.entryId === e.id);
        if (all.every(s => s.confirmedAt)) DB.update('WorkEntries', e, { status: 'ADMIN_PENDING' });
      }
      DB.update('Tokens', t, { usedAt: now });
      audit(null, 'WorkEntries', e.id, b.reject ? 'worker_reject' : 'worker_confirm', { workerId: w.id });
      return { ok: true, rejected: !!b.reject, ts: now };
    }

    // IN / OUT: GPS yoxlaması
    if (b.lat === undefined || b.lng === undefined || b.lat === null) fail('no_gps');
    const dist = distanceM(b.lat, b.lng, site.lat, site.lng);
    const radius = num(site.radius) || num(settings().defaultRadius) || 150;
    if (dist > radius) {
      DB.insert('GeoRejects', { ts: nowIso(), token: t.token, workerId: w.id, siteId: site.id, dist, lat: b.lat, lng: b.lng });
      return { ok: false, error: 'too_far', dist, radius };
    }
    const today = todayStr(), now = nowIso();
    const todays = DB.all('Attendance').filter(a => a.workerId === w.id && a.date === today && a.status !== 'REJECTED');
    if (t.kind === 'IN' && todays.some(a => a.kind === 'IN')) fail('already_in');
    if (t.kind === 'OUT' && !todays.some(a => a.kind === 'IN')) fail('no_in_today');
    if (t.kind === 'OUT' && todays.some(a => a.kind === 'OUT')) fail('already_out');
    const ref = minutesOf(t.kind === 'IN' ? w.startTime : w.endTime);
    const cur = minutesOf(now.slice(11, 16));
    const diffMin = ref === null ? '' : cur - ref;
    const att = DB.insert('Attendance', {
      id: uid('A'), workerId: w.id, siteId: site.id, kind: t.kind, ts: now, date: today,
      lat: b.lat, lng: b.lng, acc: b.acc || '', dist, source: 'LINK', reason: '', status: 'OK', diffMin, by: w.id
    });
    DB.update('Tokens', t, { usedAt: now, refId: att.id });
    return { ok: true, ts: now, dist, radius, diffMin };
  }
};

// ---------------------------------------------------------------- COMMON (admin + prarab)
const COMMON = {
  me: (b, u) => ({ user: publicUser(u), settings: settings() }),

  logout(b) {
    const s = DB.find('Sessions', 'token', String(b.token));
    if (s) DB.remove('Sessions', s);
    return true;
  },

  changePin(b, u) {
    if (u.pinHash !== hashPin(b.oldPin)) fail('bad_login');
    if (!/^\d{4,8}$/.test(String(b.newPin))) fail('bad_pin');
    DB.update('Users', u, { pinHash: hashPin(b.newPin) });
    audit(u, 'Users', u.id, 'change_pin');
    return true;
  },

  setLang(b, u) { DB.update('Users', u, { lang: ['az', 'ru', 'en'].indexOf(b.lang) >= 0 ? b.lang : 'az' }); return true; },

  bootstrap(b, u) {
    const st = settings();
    const admin = u.role === 'admin';
    const today = todayStr();
    const month = b.month || today.slice(0, 7);
    const from = Utilities.formatDate(new Date(Date.now() - 40 * 86400000), tz(), 'yyyy-MM-dd');
    const strip = o => { const c = Object.assign({}, o); delete c._row; delete c.pinHash; return c; };

    const foremen = DB.all('Users').filter(x => x.role === 'foreman' && x.status !== 'deleted').map(strip);
    let workers = DB.all('Workers').filter(x => x.status !== 'deleted').map(strip);
    let sites = DB.all('Sites').map(strip);
    if (!admin) {
      workers = workers.filter(w => w.foremanId === u.id);
      sites = sites.filter(s => s.foremanId === u.id);
      if (st.foremanSeesPay !== 'yes') workers.forEach(w => { w.baseAmount = ''; w.norm = ''; });
    }
    const wIds = {}; workers.forEach(w => { wIds[w.id] = 1; });
    const sIds = {}; sites.forEach(s => { sIds[s.id] = 1; });
    const entries = DB.all('WorkEntries').filter(e => (admin || sIds[e.siteId]) && (e.date >= from || e.status !== 'APPROVED')).map(strip);
    const eIds = {}; entries.forEach(e => { eIds[e.id] = 1; });
    return {
      user: publicUser(u), settings: st, today, month, now: nowIso(),
      foremen: admin ? foremen : foremen.filter(f => f.id === u.id).map(f => ({ id: f.id, name: f.name, phone: f.phone })),
      workers, sites,
      customers: DB.all('Customers').map(strip),
      workTypes: DB.all('WorkTypes').filter(x => x.active !== 'no').map(strip),
      estimates: DB.all('Estimates').filter(x => admin || sIds[x.siteId]).map(strip),
      payments: admin ? DB.all('CustomerPayments').map(strip) : [],
      attendance: DB.all('Attendance').filter(a => a.date >= from && (admin || wIds[a.workerId])).map(strip),
      entries,
      shares: DB.all('WorkShares').filter(s => eIds[s.entryId]).map(strip),
      advances: DB.all('Advances').filter(a => (admin || wIds[a.workerId]) && (a.created >= from || ['PENDING', 'APPROVED', 'GIVEN'].indexOf(a.status) >= 0)).map(strip),
      deductions: DB.all('Deductions').filter(d => d.date >= from && (admin || wIds[d.workerId])).map(strip),
      planDays: DB.all('PlanDays').map(strip),
      periods: DB.all('Periods').map(strip),
      geoRejects: admin ? DB.all('GeoRejects').filter(g => String(g.ts) >= from).map(strip) : []
    };
  },

  saveCustomer(b, u) {
    const c = b.customer || {};
    if (!String(c.name || '').trim()) fail('required');
    if (c.id) {
      const row = DB.find('Customers', 'id', c.id); if (!row) fail('not_found');
      DB.update('Customers', row, { name: c.name, phone: cleanPhone(c.phone), type: c.type || 'person' });
      audit(u, 'Customers', c.id, 'update', c);
      return row;
    }
    const row = DB.insert('Customers', { id: uid('C'), name: c.name, phone: cleanPhone(c.phone), type: c.type || 'person', created: nowIso() });
    audit(u, 'Customers', row.id, 'create', c);
    return row;
  },

  saveSite(b, u) {
    const s = b.site || {};
    if (!String(s.name || '').trim() || !s.customerId) fail('required');
    if (!isFinite(Number(s.lat)) || !isFinite(Number(s.lng)) || s.lat === '' || s.lng === '') fail('no_coords');
    const st = settings();
    const radius = Math.min(500, Math.max(50, num(s.radius) || num(st.defaultRadius)));
    const admin = u.role === 'admin';
    if (s.id) {
      const row = DB.find('Sites', 'id', s.id); if (!row) fail('not_found');
      if (!admin && row.foremanId !== u.id) fail('forbidden');
      const patch = { name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, radius, customerId: s.customerId };
      if (admin) Object.assign(patch, { foremanId: s.foremanId || row.foremanId, contractNo: s.contractNo || '', contractDate: s.contractDate || '', contractAmount: s.contractAmount || '', status: s.status || row.status });
      else if (row.status === 'APPROVED' && (String(row.lat) !== String(s.lat) || String(row.lng) !== String(s.lng))) patch.status = 'PENDING';
      DB.update('Sites', row, patch);
      audit(u, 'Sites', row.id, 'update', patch);
      return row;
    }
    const row = DB.insert('Sites', {
      id: uid('S'), customerId: s.customerId, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, radius,
      foremanId: admin ? (s.foremanId || '') : u.id, status: admin ? 'APPROVED' : 'PENDING',
      contractNo: s.contractNo || '', contractDate: s.contractDate || '', contractAmount: s.contractAmount || '',
      created: nowIso(), approvedBy: admin ? u.id : '', approvedAt: admin ? nowIso() : ''
    });
    audit(u, 'Sites', row.id, 'create', s);
    return row;
  },

  report(b, u) {
    const month = b.month || todayStr().slice(0, 7);
    const data = payrollInput(month);
    const res = computePayroll(data);
    const split = splitCostByForeman(res.lines, data.attendance, data.sites, month);
    const wtById = indexBy(data.workTypes, 'id');
    const byType = {};
    data.entries.filter(e => e.status === 'APPROVED' && monthOf(e.date) === month).forEach(e => {
      const wt = wtById[e.workTypeId] || { name: '?', unit: '' };
      const k = wt.name + '|' + wt.unit;
      byType[k] = (byType[k] || 0) + num(e.qty);
    });
    let lines = res.lines;
    if (u.role !== 'admin') {
      const mine = {}; DB.all('Workers').filter(w => w.foremanId === u.id).forEach(w => { mine[w.id] = 1; });
      lines = lines.filter(l => mine[l.personId]);
    }
    return {
      month, planDays: res.planDays, costByForeman: u.role === 'admin' ? split : {},
      workByType: Object.keys(byType).map(k => ({ name: k.split('|')[0], unit: k.split('|')[1], qty: round2(byType[k]) })),
      lines: u.role === 'admin' || settings().foremanSeesPay === 'yes' ? lines : lines.map(l => ({ personId: l.personId, name: l.name, daysWorked: l.daysWorked, lateCount: l.lateCount, incompleteDays: l.incompleteDays })),
      geoRejects: u.role === 'admin' ? DB.all('GeoRejects').filter(g => monthOf(g.ts) === month).length : 0
    };
  }
};

// ---------------------------------------------------------------- FOREMAN (admin da istifadə edə bilər)
const FOREMAN = {
  createToken(b, u) {
    const kind = b.kind;
    if (['IN', 'OUT'].indexOf(kind) < 0) fail('bad_kind');
    const w = DB.find('Workers', 'id', b.workerId);
    const site = DB.find('Sites', 'id', b.siteId);
    if (!w || !site) fail('not_found');
    if (u.role !== 'admin' && (w.foremanId !== u.id || site.foremanId !== u.id)) fail('forbidden');
    if (site.status !== 'APPROVED') fail('site_not_approved');
    const ttl = num(settings().linkTtlMin) || 10;
    const tok = DB.insert('Tokens', { token: uid('k') + uid(''), kind, workerId: w.id, siteId: site.id, refId: '', created: nowIso(), expires: addMinutesIso(ttl), usedAt: '', createdBy: u.id });
    audit(u, 'Tokens', tok.token.slice(0, 6), 'create_' + kind, { workerId: w.id, siteId: site.id });
    return { token: tok.token, expires: tok.expires, ttl };
  },

  manualAttendance(b, u) {
    const w = DB.find('Workers', 'id', b.workerId);
    const site = DB.find('Sites', 'id', b.siteId);
    if (!w || !site) fail('not_found');
    if (u.role !== 'admin' && w.foremanId !== u.id) fail('forbidden');
    if (['IN', 'OUT'].indexOf(b.kind) < 0) fail('bad_kind');
    if (!String(b.reason || '').trim()) fail('required');
    const date = dateOf(b.date || todayStr());
    assertOpen(date);
    const time = /^\d{2}:\d{2}$/.test(String(b.time)) ? b.time : nowIso().slice(11, 16);
    const ref = minutesOf(b.kind === 'IN' ? w.startTime : w.endTime);
    const row = DB.insert('Attendance', {
      id: uid('A'), workerId: w.id, siteId: site.id, kind: b.kind, ts: date + 'T' + time + ':00', date,
      lat: '', lng: '', acc: '', dist: '', source: 'MANUAL', reason: String(b.reason).slice(0, 200),
      status: u.role === 'admin' ? 'OK' : 'PENDING', diffMin: ref === null ? '' : minutesOf(time) - ref, by: u.id
    });
    audit(u, 'Attendance', row.id, 'manual', b);
    return row;
  },

  saveWorkEntry(b, u) {
    const e = b.entry || {};
    const site = DB.find('Sites', 'id', e.siteId);
    const wt = DB.find('WorkTypes', 'id', e.workTypeId);
    if (!site || !wt) fail('not_found');
    if (u.role !== 'admin' && site.foremanId !== u.id) fail('forbidden');
    if (site.status !== 'APPROVED') fail('site_not_approved');
    if (!(num(e.qty) > 0)) fail('bad_qty');
    const shares = (b.shares || []).filter(s => s.workerId && num(s.share) > 0);
    if (!shares.length) fail('no_shares');
    const sum = shares.reduce((a, s) => a + num(s.share), 0);
    if (Math.abs(sum - 100) > 0.5) fail('shares_not_100');
    const date = dateOf(e.date || todayStr());
    assertOpen(date);

    let photos = [];
    const folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER');
    (b.photos || []).slice(0, 5).forEach((p, i) => {
      const m = String(p).match(/^data:(image\/\w+);base64,(.+)$/);
      if (!m || !folderId) return;
      const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], date + '_' + site.id + '_' + i + '.jpg');
      photos.push(DriveApp.getFolderById(folderId).createFile(blob).getUrl());
    });

    let entry;
    if (e.id) {
      entry = DB.find('WorkEntries', 'id', e.id); if (!entry) fail('not_found');
      if (entry.status === 'APPROVED') fail('already_approved');
      const keep = (entry.photos ? String(entry.photos).split(' ') : []).filter(Boolean);
      DB.update('WorkEntries', entry, { date, siteId: site.id, workTypeId: wt.id, qty: num(e.qty), note: e.note || '', photos: keep.concat(photos).join(' '), status: 'USTA_PENDING', returnReason: '' });
      const old = DB.all('WorkShares').filter(s => s.entryId === entry.id).sort((a, c) => c._row - a._row);
      old.forEach(s => DB.remove('WorkShares', s));
    } else {
      entry = DB.insert('WorkEntries', { id: uid('E'), date, siteId: site.id, workTypeId: wt.id, qty: num(e.qty), photos: photos.join(' '), note: e.note || '', status: 'USTA_PENDING', returnReason: '', foremanId: site.foremanId, created: nowIso(), approvedBy: '', approvedAt: '' });
    }
    const ttlMin = 24 * 60; // iş təsdiqi linki 24 saat
    const links = shares.map(s => {
      const w = DB.find('Workers', 'id', s.workerId);
      if (!w || (u.role !== 'admin' && w.foremanId !== u.id)) fail('forbidden');
      const tok = DB.insert('Tokens', { token: uid('k') + uid(''), kind: 'WORK', workerId: w.id, siteId: site.id, refId: entry.id, created: nowIso(), expires: addMinutesIso(ttlMin), usedAt: '', createdBy: u.id });
      DB.insert('WorkShares', { entryId: entry.id, workerId: w.id, share: num(s.share), confirmedAt: '', token: tok.token });
      return { workerId: w.id, name: w.name, phone: w.phone, lang: w.lang || 'az', token: tok.token, share: num(s.share) };
    });
    audit(u, 'WorkEntries', entry.id, e.id ? 'update' : 'create', { qty: e.qty, shares });
    return { entry, links };
  },

  workLinks(b, u) {
    const entry = DB.find('WorkEntries', 'id', b.entryId); if (!entry) fail('not_found');
    if (u.role !== 'admin' && entry.foremanId !== u.id) fail('forbidden');
    if (entry.status !== 'USTA_PENDING') fail('link_used');
    return DB.all('WorkShares').filter(s => s.entryId === entry.id && !s.confirmedAt).map(s => {
      const w = DB.find('Workers', 'id', s.workerId) || {};
      const tok = DB.insert('Tokens', { token: uid('k') + uid(''), kind: 'WORK', workerId: s.workerId, siteId: entry.siteId, refId: entry.id, created: nowIso(), expires: addMinutesIso(24 * 60), usedAt: '', createdBy: u.id });
      DB.update('WorkShares', s, { token: tok.token });
      return { workerId: s.workerId, name: w.name, phone: w.phone, lang: w.lang || 'az', token: tok.token, share: num(s.share) };
    });
  },

  requestAdvance(b, u) {
    const w = DB.find('Workers', 'id', b.workerId); if (!w) fail('not_found');
    if (u.role !== 'admin' && w.foremanId !== u.id) fail('forbidden');
    const amount = round2(b.amount);
    if (!(amount > 0)) fail('bad_amount');
    const month = todayStr().slice(0, 7);
    const st = settings();
    const plan = num((DB.find('PlanDays', 'month', month) || {}).days) || 22;
    const monthly = w.payType === 'DAY' ? num(w.baseAmount) * plan : num(w.baseAmount);
    const limit = round2(monthly * num(st.advanceLimitPct) / 100);
    const used = DB.all('Advances').filter(a => a.workerId === w.id && monthOf(a.created) === month && ['PENDING', 'APPROVED', 'GIVEN', 'SIGNED'].indexOf(a.status) >= 0).reduce((s, a) => s + num(a.amount), 0);
    const over = limit > 0 ? used + amount > limit : w.payModel !== 'BONUS';
    const row = DB.insert('Advances', { id: uid('V'), workerId: w.id, amount, reason: String(b.reason || '').slice(0, 200), status: 'PENDING', foremanId: w.foremanId, created: nowIso(), approvedAt: '', receiptNo: '', rejectReason: '', givenAt: '', overLimit: over ? 'yes' : '' });
    audit(u, 'Advances', row.id, 'request', { amount, limit, used });
    return Object.assign({}, row, { limit, used: round2(used) });
  },

  markAdvance(b, u) {
    const a = DB.find('Advances', 'id', b.id); if (!a) fail('not_found');
    if (u.role !== 'admin' && a.foremanId !== u.id) fail('forbidden');
    if (b.status === 'GIVEN' && a.status === 'APPROVED') DB.update('Advances', a, { status: 'GIVEN', givenAt: nowIso() });
    else if (b.status === 'SIGNED' && (a.status === 'GIVEN' || a.status === 'APPROVED')) DB.update('Advances', a, { status: 'SIGNED', givenAt: a.givenAt || nowIso() });
    else fail('bad_status');
    audit(u, 'Advances', a.id, 'mark_' + b.status);
    return a;
  },

  interim(b, u) {
    const w = DB.find('Workers', 'id', b.workerId); if (!w) fail('not_found');
    if (u.role !== 'admin' && w.foremanId !== u.id) fail('forbidden');
    const month = b.month || todayStr().slice(0, 7);
    const data = payrollInput(month);
    data.workers = [w];
    data.foremen = [];
    const stored = DB.find('PlanDays', 'month', month);
    if (!stored && b.planDays) data.planDaysOverride = num(b.planDays);
    const res = computePayroll(data);
    const line = res.lines[0] || null;
    const showPay = u.role === 'admin' || settings().foremanSeesPay === 'yes';
    return { month, asOf: todayStr(), planSource: stored ? 'admin' : (b.planDays ? 'foreman' : 'none'), worker: { id: w.id, name: w.name, phone: w.phone, lang: w.lang || 'az', payType: w.payType, payModel: w.payModel }, line: showPay ? line : (line ? { daysWorked: line.daysWorked, planDays: line.planDays, lateCount: line.lateCount, incompleteDays: line.incompleteDays } : null) };
  }
};

// ---------------------------------------------------------------- ADMIN
const ADMIN = {
  saveForeman(b, u) {
    const f = b.foreman || {};
    if (!String(f.name || '').trim() || !cleanPhone(f.phone)) fail('required');
    const users = DB.all('Users');
    if (users.some(x => x.phone === cleanPhone(f.phone) && x.id !== f.id && x.status !== 'deleted')) fail('phone_taken');
    const patch = { name: f.name, phone: cleanPhone(f.phone), lang: f.lang || 'az', status: f.status || 'active', payType: f.payType || 'MONTH', payModel: f.payModel || 'STD', baseAmount: num(f.baseAmount), bonusPercent: num(f.bonusPercent) };
    if (f.pin) { if (!/^\d{4,8}$/.test(String(f.pin))) fail('bad_pin'); patch.pinHash = hashPin(f.pin); }
    if (f.id) {
      const row = DB.find('Users', 'id', f.id); if (!row || row.role !== 'foreman') fail('not_found');
      DB.update('Users', row, patch); audit(u, 'Users', row.id, 'update', Object.assign({}, patch, { pinHash: patch.pinHash ? '***' : undefined }));
      return { id: row.id };
    }
    const active = users.filter(x => x.role === 'foreman' && x.status === 'active').length;
    if (active >= num(settings().maxForemen)) fail('limit_foremen');
    if (!f.pin) fail('bad_pin');
    const row = DB.insert('Users', Object.assign({ id: uid('U'), role: 'foreman', created: nowIso() }, patch));
    audit(u, 'Users', row.id, 'create', { name: f.name });
    return { id: row.id };
  },

  saveWorker(b, u) {
    const w = b.worker || {};
    if (!String(w.name || '').trim() || !cleanPhone(w.phone) || !w.foremanId) fail('required');
    const st = settings();
    const patch = {
      name: w.name, phone: cleanPhone(w.phone), foremanId: w.foremanId, specialty: w.specialty || '', grade: w.grade || 'master',
      payType: w.payType === 'DAY' ? 'DAY' : 'MONTH', baseAmount: num(w.baseAmount), payModel: w.payModel || 'STD',
      bonusBase: w.bonusBase === 'OVER_NORM' ? 'OVER_NORM' : 'ALL', norm: num(w.norm), startTime: w.startTime || '09:00', endTime: w.endTime || '18:00',
      lang: w.lang || 'az', status: w.status || 'active'
    };
    const inForeman = DB.all('Workers').filter(x => x.foremanId === patch.foremanId && x.status === 'active' && x.id !== w.id).length;
    if (patch.status === 'active' && inForeman >= num(st.maxWorkersPerForeman)) fail('limit_workers');
    if (w.id) {
      const row = DB.find('Workers', 'id', w.id); if (!row) fail('not_found');
      ['foremanId', 'payType', 'baseAmount', 'payModel', 'bonusBase', 'norm', 'grade'].forEach(k => {
        if (String(row[k]) !== String(patch[k])) DB.insert('WorkerHistory', { ts: nowIso(), workerId: row.id, field: k, oldValue: row[k], newValue: patch[k], by: u.id });
      });
      DB.update('Workers', row, patch); audit(u, 'Workers', row.id, 'update', patch);
      return { id: row.id };
    }
    const row = DB.insert('Workers', Object.assign({ id: uid('W'), created: nowIso() }, patch));
    audit(u, 'Workers', row.id, 'create', patch);
    return { id: row.id };
  },

  approveSite(b, u) {
    const s = DB.find('Sites', 'id', b.id); if (!s) fail('not_found');
    DB.update('Sites', s, b.ok ? { status: 'APPROVED', approvedBy: u.id, approvedAt: nowIso() } : { status: 'REJECTED' });
    audit(u, 'Sites', s.id, b.ok ? 'approve' : 'reject');
    return s;
  },

  saveWorkType(b, u) {
    const t = b.workType || {};
    if (!String(t.name || '').trim()) fail('required');
    const patch = { name: t.name, unit: t.unit || 'm²', bonusType: t.bonusType === 'PCT' ? 'PCT' : 'AZN', rateHelper: num(t.rateHelper), rateMaster: num(t.rateMaster), rateSenior: num(t.rateSenior), percent: num(t.percent), active: t.active === 'no' ? 'no' : 'yes' };
    if (t.id) { const row = DB.find('WorkTypes', 'id', t.id); if (!row) fail('not_found'); DB.update('WorkTypes', row, patch); audit(u, 'WorkTypes', row.id, 'update', patch); return row; }
    const row = DB.insert('WorkTypes', Object.assign({ id: uid('T') }, patch)); audit(u, 'WorkTypes', row.id, 'create', patch); return row;
  },

  saveEstimate(b, u) {
    const e = b.estimate || {};
    if (!e.siteId || !e.workTypeId) fail('required');
    const existing = DB.all('Estimates').find(x => x.siteId === e.siteId && x.workTypeId === e.workTypeId);
    const patch = { siteId: e.siteId, workTypeId: e.workTypeId, planQty: num(e.planQty), clientPrice: num(e.clientPrice) };
    if (existing) { DB.update('Estimates', existing, patch); audit(u, 'Estimates', existing.id, 'update', patch); return existing; }
    const row = DB.insert('Estimates', Object.assign({ id: uid('M') }, patch)); audit(u, 'Estimates', row.id, 'create', patch); return row;
  },

  addPayment(b, u) {
    const p = b.payment || {};
    if (!p.siteId || !(num(p.amount) > 0)) fail('required');
    const row = DB.insert('CustomerPayments', { id: uid('P'), siteId: p.siteId, date: dateOf(p.date || todayStr()), amount: round2(p.amount), note: p.note || '' });
    audit(u, 'CustomerPayments', row.id, 'create', p); return row;
  },

  approveWork(b, u) {
    const e = DB.find('WorkEntries', 'id', b.id); if (!e) fail('not_found');
    assertOpen(e.date);
    if (b.ok) {
      if (e.status !== 'ADMIN_PENDING' && !b.force) fail('not_ready');
      DB.update('WorkEntries', e, { status: 'APPROVED', approvedBy: u.id, approvedAt: nowIso(), returnReason: '' });
    } else {
      DB.update('WorkEntries', e, { status: 'RETURNED', returnReason: String(b.reason || '').slice(0, 200) });
    }
    audit(u, 'WorkEntries', e.id, b.ok ? 'approve' : 'return', { reason: b.reason });
    return e;
  },

  approveAdvance(b, u) {
    const a = DB.find('Advances', 'id', b.id); if (!a) fail('not_found');
    if (a.status !== 'PENDING') fail('bad_status');
    if (b.ok) {
      const year = todayStr().slice(0, 4);
      const n = DB.all('Advances').filter(x => String(x.receiptNo).indexOf('AV-' + year) === 0).length + 1;
      DB.update('Advances', a, { status: 'APPROVED', approvedAt: nowIso(), receiptNo: 'AV-' + year + '-' + ('000' + n).slice(-4) });
    } else {
      DB.update('Advances', a, { status: 'REJECTED', rejectReason: String(b.reason || '').slice(0, 200) });
    }
    audit(u, 'Advances', a.id, b.ok ? 'approve' : 'reject');
    return a;
  },

  approveAttendance(b, u) {
    const a = DB.find('Attendance', 'id', b.id); if (!a) fail('not_found');
    assertOpen(a.date);
    DB.update('Attendance', a, { status: b.ok ? 'OK' : 'REJECTED' });
    audit(u, 'Attendance', a.id, b.ok ? 'approve' : 'reject');
    return a;
  },

  addDeduction(b, u) {
    const d = b.deduction || {};
    if (!d.workerId || !num(d.amount)) fail('required');
    const date = dateOf(d.date || todayStr());
    assertOpen(date);
    const type = ['PENALTY', 'CORRECTION', 'OTHER'].indexOf(d.type) >= 0 ? d.type : 'PENALTY';
    const row = DB.insert('Deductions', { id: uid('D'), workerId: d.workerId, type, amount: round2(d.amount), reason: String(d.reason || '').slice(0, 200), date, by: u.id });
    audit(u, 'Deductions', row.id, 'create', d); return row;
  },

  setPlanDays(b, u) {
    const month = String(b.month || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || !(num(b.days) > 0 && num(b.days) <= 31)) fail('bad_days');
    if (isClosed(month)) fail('period_closed');
    const row = DB.find('PlanDays', 'month', month);
    if (row) DB.update('PlanDays', row, { days: num(b.days), by: u.id, at: nowIso() });
    else DB.insert('PlanDays', { month, days: num(b.days), by: u.id, at: nowIso() });
    audit(u, 'PlanDays', month, 'set', { days: b.days });
    return true;
  },

  calcPayroll(b) {
    const month = String(b.month || todayStr().slice(0, 7)).slice(0, 7);
    if (isClosed(month)) {
      return { month, closed: true, planDays: num((DB.find('PlanDays', 'month', month) || {}).days), lines: DB.all('Payroll').filter(p => p.month === month).map(p => { const c = Object.assign({}, p); delete c._row; return c; }) };
    }
    const res = computePayroll(payrollInput(month));
    res.closed = false;
    return res;
  },

  closePeriod(b, u) {
    const month = String(b.month || '').slice(0, 7);
    if (isClosed(month)) fail('period_closed');
    if (!DB.find('PlanDays', 'month', month)) fail('no_plan_days');
    const res = computePayroll(payrollInput(month));
    res.lines.forEach(l => DB.insert('Payroll', Object.assign({}, l, { paid: '', paidAt: '' })));
    const p = DB.find('Periods', 'month', month);
    if (p) DB.update('Periods', p, { status: 'CLOSED', closedAt: nowIso(), by: u.id });
    else DB.insert('Periods', { month, status: 'CLOSED', closedAt: nowIso(), by: u.id });
    audit(u, 'Periods', month, 'close', { lines: res.lines.length });
    return { month, lines: res.lines.length };
  },

  markPaid(b, u) {
    const row = DB.all('Payroll').find(p => p.month === b.month && p.personId === b.personId);
    if (!row) fail('not_found');
    DB.update('Payroll', row, { paid: b.paid ? 'yes' : '', paidAt: b.paid ? nowIso() : '' });
    audit(u, 'Payroll', b.month + '/' + b.personId, b.paid ? 'paid' : 'unpaid');
    return true;
  },

  saveSettings(b, u) {
    const s = b.settings || {};
    const allowed = Object.keys(DEFAULT_SETTINGS);
    Object.keys(s).forEach(k => {
      if (allowed.indexOf(k) < 0) return;
      const row = DB.find('Settings', 'key', k);
      if (row) DB.update('Settings', row, { value: s[k] }); else DB.insert('Settings', { key: k, value: s[k] });
    });
    audit(u, 'Settings', '-', 'update', s);
    return settings();
  },

  deleteWorker(b, u) {
    const row = DB.find('Workers', 'id', b.id); if (!row) fail('not_found');
    DB.update('Workers', row, { status: 'inactive' }); audit(u, 'Workers', row.id, 'deactivate');
    return true;
  }
};

function payrollInput(month) {
  const from = month + '-01', to = month + '-31';
  return {
    month,
    settings: settings(),
    workers: DB.all('Workers'),
    foremen: DB.all('Users').filter(x => x.role === 'foreman'),
    attendance: DB.all('Attendance').filter(a => a.date >= from && a.date <= to),
    entries: DB.all('WorkEntries').filter(e => e.date >= from && e.date <= to),
    shares: DB.all('WorkShares'),
    workTypes: DB.all('WorkTypes'),
    estimates: DB.all('Estimates'),
    sites: DB.all('Sites'),
    advances: DB.all('Advances'),
    deductions: DB.all('Deductions').filter(d => d.date >= from && d.date <= to),
    planDays: DB.all('PlanDays')
  };
}

// Node testləri üçün (Apps Script bunu görməzdən gəlir)
if (typeof module !== 'undefined') {
  module.exports = { computePayroll, attendanceSummary, distanceM, shareAmount, splitCostByForeman, round2, minutesOf };
}
