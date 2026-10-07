/**
 * Ustabaşı — server (Google Apps Script), v0.3.0
 * Ayrıca (standalone) layihədə və Sheet-ə bağlı layihədə işləyir.
 * Sheet yoxdursa, setup() "Ustabaşı — data" adlı Sheet-i özü yaradır.
 *
 * Quraşdırma (qısa):
 *  1. Aşağıdakı ADMIN_* dəyərlərini dəyişin və yadda saxlayın.
 *  2. Funksiya siyahısında setup seçin və "Run" basın (icazələri verin).
 *  3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *  4. Web app URL-ni tətbiqin config.js faylına yazın.
 *
 * Yeni versiyanı köçürəndə: kodu yapışdırın → Save → setup → Run (təkrar işə salmaq təhlükəsizdir;
 * köhnə datanı v0.3-ə keçirir) → Deploy → Manage deployments → Edit → Version: New version → Deploy. URL dəyişmir.
 *
 * Xidmət funksiyaları (redaktorda seçib "Run"):
 *  setup          — quraşdırma / yeniləmə, avtomatik işləri (trigger) qurur
 *  setAdminLogin  — admin telefonu və müvəqqəti şifrəni aşağıdakı ADMIN_* dəyərlərinə görə yazır
 *  clearCache     — keşi sıfırlayır (Sheet-də əl ilə dəyişiklikdən sonra tətbiq köhnəni göstərirsə)
 *  cleanup        — köhnə sessiya və linkləri silir, köhnə qeydləri arxivə köçürür (hər gecə avtomatik)
 *  dailyBackup    — Sheet-in ehtiyat surəti (hər gecə avtomatik)
 *  hourly         — vaxtı keçən linkləri bağlayır (hər saat avtomatik)
 *  weeklyMail     — Sheet-in Excel surətini adminin e-poçtuna göndərir (həftədə 1 dəfə avtomatik)
 */

// ---- 1. Birinci admin (setup-dan əvvəl dəyişin) ----
const ADMIN_NAME = 'Admin';
const ADMIN_PHONE = '994500000000';      // yalnız rəqəm
const ADMIN_PASSWORD = 'Ustabasi#2026';  // müvəqqəti şifrə: ilk girişdə yenisi yaradılır

// ---- 2. Sxem ----
// Diqqət: yeni sütunlar yalnız SONA əlavə olunur — köhnə data yerində qalır.
const SCHEMA = {
  Settings: ['key', 'value'],
  Users: ['id', 'role', 'name', 'phone', 'pinHash', 'lang', 'status', 'payType', 'payModel', 'baseAmount', 'bonusPercent', 'created', 'pwHash', 'mustChange', 'failCount', 'lockedUntil'],
  Sessions: ['token', 'userId', 'expires', 'created'],
  Workers: ['id', 'name', 'phone', 'foremanId', 'specialty', 'grade', 'payType', 'baseAmount', 'payModel', 'bonusBase', 'norm', 'startTime', 'endTime', 'lang', 'status', 'created'],
  WorkerHistory: ['ts', 'workerId', 'field', 'oldValue', 'newValue', 'by'],
  Customers: ['id', 'name', 'phone', 'type', 'created', 'voen', 'lang', 'pendingPhone', 'by'],
  Sites: ['id', 'customerId', 'name', 'address', 'lat', 'lng', 'radius', 'foremanId', 'status', 'contractNo', 'contractDate', 'contractAmount', 'created', 'approvedBy', 'approvedAt', 'photos', 'photoLat', 'photoLng', 'returnReason', 'by'],
  WorkTypes: ['id', 'name', 'unit', 'bonusType', 'rateHelper', 'rateMaster', 'rateSenior', 'percent', 'active', 'normType', 'normQty'],
  Estimates: ['id', 'siteId', 'workTypeId', 'planQty', 'clientPrice'],
  CustomerPayments: ['id', 'siteId', 'date', 'amount', 'note', 'method', 'status', 'foremanId', 'created', 'approvedBy', 'approvedAt', 'confirmedAmount', 'confirmedAt', 'returnReason', 'receiptNo', 'linkCount', 'closedNote', 'by'],
  Tokens: ['token', 'kind', 'workerId', 'siteId', 'refId', 'created', 'expires', 'usedAt', 'createdBy', 'openedAt', 'deviceId', 'cancelledAt'],
  Attendance: ['id', 'workerId', 'siteId', 'kind', 'ts', 'date', 'lat', 'lng', 'acc', 'dist', 'source', 'reason', 'status', 'diffMin', 'by', 'returnReason'],
  GeoRejects: ['ts', 'token', 'workerId', 'siteId', 'dist', 'lat', 'lng'],
  WorkEntries: ['id', 'date', 'siteId', 'workTypeId', 'qty', 'photos', 'note', 'status', 'returnReason', 'foremanId', 'created', 'approvedBy', 'approvedAt'],
  WorkShares: ['entryId', 'workerId', 'share', 'confirmedAt', 'token'],
  Advances: ['id', 'workerId', 'amount', 'reason', 'status', 'foremanId', 'created', 'approvedAt', 'receiptNo', 'rejectReason', 'givenAt', 'overLimit', 'confirmedAmount', 'confirmedAt', 'returnReason', 'linkCount', 'closedAt', 'resolution'],
  Deductions: ['id', 'workerId', 'type', 'amount', 'reason', 'date', 'by', 'category'],
  PlanDays: ['month', 'days', 'by', 'at'],
  Payroll: ['month', 'personType', 'personId', 'name', 'payType', 'payModel', 'daysWorked', 'planDays', 'S', 'B', 'bonus', 'advance', 'penalty', 'correction', 'total', 'paid', 'paidAt', 'lateCount', 'incompleteDays'],
  Periods: ['month', 'status', 'closedAt', 'by', 'archiveUrl'],
  AuditLog: ['ts', 'userId', 'sheet', 'rowId', 'action', 'details'],
  Expenses: ['id', 'siteId', 'category', 'amount', 'date', 'note', 'photos', 'status', 'by', 'created', 'approvedBy', 'approvedAt', 'returnReason'],
  LinkAttempts: ['ts', 'token', 'kind', 'workerId', 'siteId', 'refId', 'foremanId', 'deviceId', 'reason', 'ua'],
  SiteCosts: ['month', 'siteId', 'labor', 'bonus', 'by', 'at']
};

const DEFAULT_SETTINGS = {
  linkTtlMin: '10',
  workLinkHours: '24',
  moneyLinkHours: '24',
  maxMoneyLinks: '3',
  defaultRadius: '150',
  advanceLimitPct: '50',
  lateToleranceMin: '15',
  lateMode: 'FULL',
  bonusCapPct: '',
  maxForemen: '10',
  maxWorkersPerForeman: '20',
  foremanSeesPay: 'yes',
  appUrl: '',
  sessionDays: '30',
  offlineDays: '3',
  siteMinPhotos: '1',
  photoWarnM: '200',
  expenseCategories: 'Material,Nəqliyyat,Alət icarəsi,Zibil daşınması,Subpodratçı,Digər',
  penaltyTypes: 'Gecikmə,İşə gəlməmə,Keyfiyyətsiz iş,Material zərəri,Alət itkisi,Təhlükəsizlik qaydasının pozulması,Digər',
  companyName: 'Ustabaşı',
  companyVoen: '',
  companyPhone: '',
  companyAddress: '',
  backupEmail: ''
};

const SEED_WORK_TYPES = [
  ['Kafel döşəmə', 'm²'], ['Suvaq', 'm²'], ['Şpaklyovka', 'm²'], ['Boya', 'm²'],
  ['Alçıpan', 'm²'], ['Laminat', 'm²'], ['Plintus', 'm'], ['Elektrik nöqtəsi', 'ədəd'], ['Santexnika nöqtəsi', 'ədəd']
];

// Pul əməliyyatlarının statusları (avans və müştəri ödənişi)
const MONEY_FINAL = ['CLOSED', 'REJECTED', 'SIGNED'];
const ADV_COUNTED = ['CLOSED', 'SIGNED'];                     // vedomosta düşən avans
const ADV_LIMIT = ['PENDING', 'RETURNED', 'APPROVED', 'GIVEN', 'LINK_SENT', 'LINK_EXPIRED', 'CONFLICT', 'CLOSED', 'SIGNED'];

// ======================================================================
// 3. Saf funksiyalar (Sheets-dən asılı deyil, Node-da test olunur)
// ======================================================================

function num(v) { const n = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
function round2(n) { return Math.round((num(n) + Number.EPSILON) * 100) / 100; }
function monthOf(s) { return String(s || '').slice(0, 7); }
function dateOf(s) { return String(s || '').slice(0, 10); }
function minutesOf(hhmm) { const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function indexBy(arr, key) { const o = {}; (arr || []).forEach(x => { o[x[key]] = x; }); return o; }

/** Haversine məsafəsi, metr. */
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (num(lat2) - num(lat1)) * toRad, dLng = (num(lng2) - num(lng1)) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(num(lat1) * toRad) * Math.cos(num(lat2) * toRad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** Şifrə qaydası (BR-60): ən azı 8 simvol, 1 böyük hərf, 1 kiçik hərf, 1 rəqəm, 1 işarə. */
function validPassword(p) {
  p = String(p || '');
  return p.length >= 8 && p.length <= 64 && /\p{Lu}/u.test(p) && /\p{Ll}/u.test(p) && /\d/.test(p) && /[^\p{L}\d\s]/u.test(p);
}

/** Sheets-də düstur kimi işləyə biləcək mətn qorunur (T-07). */
function safeCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /^[=+\-@]/.test(s) && !/^[+-]?\d/.test(s) ? "'" + s : s;
}

/** Bir günün sayılan hissəsi (BR-58): FULL — tam gün; HALF — gecikmə/erkən çıxışda yarım gün; HOUR — işlənmiş saata görə. */
function dayFraction(d, tol, mode, worker) {
  if (!d.IN || !d.OUT) return 0;
  const late = num(d.IN.diffMin) > tol, early = num(d.OUT.diffMin) < -tol;
  if (mode === 'HALF') return late || early ? 0.5 : 1;
  if (mode === 'HOUR') {
    const w = worker || {};
    let sched = (minutesOf(w.endTime) || 0) - (minutesOf(w.startTime) || 0);
    if (!(sched > 0)) sched = 480;
    const worked = (minutesOf(String(d.OUT.ts).slice(11, 16)) || 0) - (minutesOf(String(d.IN.ts).slice(11, 16)) || 0);
    return Math.max(0, Math.min(1, Math.round(worked / sched * 100) / 100));
  }
  return 1;
}

/** Ustanın ay üzrə davamiyyət xülasəsi. Gün = həmin tarixdə təsdiqli gəliş VƏ çıxış. */
function attendanceSummary(workerId, month, attendance, tolerance, mode, worker) {
  const byDate = {};
  (attendance || []).forEach(a => {
    if (a.workerId !== workerId || monthOf(a.date) !== month) return;
    if (a.status !== 'OK') return;
    const d = byDate[a.date] || (byDate[a.date] = { IN: null, OUT: null });
    if (a.kind === 'IN' && !d.IN) d.IN = a;
    if (a.kind === 'OUT') d.OUT = a;
  });
  let days = 0, full = 0, incomplete = 0, late = 0, early = 0;
  Object.keys(byDate).forEach(k => {
    const d = byDate[k];
    if (d.IN && d.OUT) { full++; days += dayFraction(d, tolerance, mode || 'FULL', worker); } else incomplete++;
    if (d.IN && num(d.IN.diffMin) > tolerance) late++;
    if (d.OUT && num(d.OUT.diffMin) < -tolerance) early++;
  });
  return { days: round2(days), full, incomplete, late, early };
}

/**
 * Bonus (BR-57, BR-62, Bölmə 6): yalnız usta iş növünün normasını keçəndə.
 *   Faiz = (Fakt − Norma) / Norma;  aylıq norma: Bonus = Baza × Faiz;
 *   günlük norma: hər gün (Baza / plan iş günü) × həmin günün faizi; iş növləri cəmlənir.
 * qty: { wtId: { total, byDate: { 'YYYY-MM-DD': qty } } }
 */
function normBonus(worker, qty, workTypes, plan, daysCounted, capPct) {
  const base = num(worker.baseAmount);
  const baseMonth = worker.payType === 'DAY' ? base * num(daysCounted) : base;
  const dayBase = worker.payType === 'DAY' ? base : (plan > 0 ? base / plan : 0);
  let raw = 0;
  const detail = [];
  (workTypes || []).forEach(wt => {
    const norm = num(wt.normQty), q = qty[wt.id];
    if (!q || !(norm > 0) || ['MONTH', 'DAY'].indexOf(wt.normType) < 0) return;
    let amount = 0, pct = 0, overDays = 0;
    if (wt.normType === 'MONTH') {
      if (q.total > norm) { pct = (q.total - norm) / norm; amount = baseMonth * pct; }
    } else {
      Object.keys(q.byDate).forEach(d => {
        const f = q.byDate[d];
        if (f > norm) { const p = (f - norm) / norm; pct += p; amount += dayBase * p; overDays++; }
      });
    }
    raw += amount;
    detail.push({ workTypeId: wt.id, name: wt.name, unit: wt.unit, normType: wt.normType, norm, fakt: round2(q.total), pct: Math.round(pct * 10000) / 100, overDays, amount: round2(amount) });
  });
  let bonus = raw;
  const cap = num(capPct);
  if (cap > 0) bonus = Math.min(bonus, baseMonth * cap / 100);
  return { raw: round2(raw), bonus: round2(bonus), detail };
}

/** Təsdiqli (və ya gözləyən) iş paylarından usta → iş növü → gün üzrə həcm. */
function qtyByWorker(entries, shares, month, statuses) {
  const ok = {};
  (entries || []).forEach(e => { if (monthOf(e.date) === month && statuses.indexOf(e.status) >= 0) ok[e.id] = e; });
  const out = {};
  (shares || []).forEach(s => {
    const e = ok[s.entryId]; if (!e) return;
    const q = num(e.qty) * num(s.share) / 100;
    const w = out[s.workerId] || (out[s.workerId] = {});
    const t = w[e.workTypeId] || (w[e.workTypeId] = { total: 0, byDate: {} });
    t.total += q; t.byDate[e.date] = (t.byDate[e.date] || 0) + q;
  });
  return out;
}

/**
 * Vedomost hesablaması (BRD v0.3, bölmə 6).
 * input: { month, workers, foremen, attendance, entries, shares, workTypes, sites,
 *          advances, deductions, planDays, settings, planDaysOverride }
 */
function computePayroll(input) {
  const month = input.month;
  const st = input.settings || {};
  const tol = num(st.lateToleranceMin === undefined || st.lateToleranceMin === '' ? 15 : st.lateToleranceMin);
  const mode = st.lateMode || 'FULL';
  const plan = input.planDaysOverride !== undefined && input.planDaysOverride !== null && input.planDaysOverride !== ''
    ? num(input.planDaysOverride)
    : num(((input.planDays || []).find(p => p.month === month) || {}).days);
  const wts = input.workTypes || [];
  const qApproved = qtyByWorker(input.entries, input.shares, month, ['APPROVED']);
  const qAll = qtyByWorker(input.entries, input.shares, month, ['APPROVED', 'USTA_PENDING', 'ADMIN_PENDING']);

  const advSum = {}, penSum = {}, corSum = {};
  (input.advances || []).forEach(a => {
    if (ADV_COUNTED.indexOf(a.status) < 0) return;
    if (monthOf(a.approvedAt || a.created) !== month) return;
    advSum[a.workerId] = (advSum[a.workerId] || 0) + num(a.amount);
  });
  (input.deductions || []).forEach(d => {
    if (monthOf(d.date) !== month) return;
    if (d.type === 'CORRECTION') corSum[d.workerId] = (corSum[d.workerId] || 0) + num(d.amount);
    else penSum[d.workerId] = (penSum[d.workerId] || 0) + Math.abs(num(d.amount));
  });

  const lines = [], bonusByForeman = {};
  (input.workers || []).forEach(w => {
    if (w.status === 'deleted') return;
    const att = attendanceSummary(w.id, month, input.attendance || [], tol, mode, w);
    const model = w.payModel || 'STD';
    let S = 0;
    if (model !== 'BONUS') {
      if (w.payType === 'DAY') S = num(w.baseAmount) * att.days;
      else S = plan > 0 ? num(w.baseAmount) / plan * att.days : 0;
    }
    let bonus = 0, B = 0, detail = [], pendingBonus = 0;
    if (model !== 'STD') {
      const r = normBonus(w, qApproved[w.id] || {}, wts, plan, att.days, st.bonusCapPct);
      bonus = r.bonus; B = r.raw; detail = r.detail;
      const all = normBonus(w, qAll[w.id] || {}, wts, plan, att.days, st.bonusCapPct);
      pendingBonus = Math.max(0, all.bonus - bonus);
    }
    if (bonus) bonusByForeman[w.foremanId] = (bonusByForeman[w.foremanId] || 0) + bonus;
    const advance = advSum[w.id] || 0, penalty = penSum[w.id] || 0, correction = corSum[w.id] || 0;
    const hasAny = S || B || advance || penalty || correction || att.full || att.incomplete;
    if (!hasAny && w.status !== 'active') return;
    lines.push({
      month, personType: 'WORKER', personId: w.id, name: w.name, foremanId: w.foremanId,
      payType: w.payType || 'MONTH', payModel: model, daysWorked: att.days, planDays: plan,
      S: round2(S), B: round2(B), bonus: round2(bonus), advance: round2(advance), penalty: round2(penalty),
      correction: round2(correction), total: round2(S + bonus - advance - penalty + correction),
      lateCount: att.late, earlyCount: att.early, incompleteDays: att.incomplete,
      pendingBonus: round2(pendingBonus), detail
    });
  });

  (input.foremen || []).forEach(f => {
    if (f.status === 'deleted') return;
    const model = f.payModel || 'STD';
    let S = 0;
    if (model !== 'BONUS') S = f.payType === 'DAY' ? num(f.baseAmount) * plan : num(f.baseAmount);
    const B = bonusByForeman[f.id] || 0;
    const bonus = model === 'STD' ? 0 : B * num(f.bonusPercent) / 100;
    const advance = advSum[f.id] || 0, penalty = penSum[f.id] || 0, correction = corSum[f.id] || 0;
    if (!S && !bonus && f.status !== 'active') return;
    lines.push({
      month, personType: 'FOREMAN', personId: f.id, name: f.name, foremanId: f.id,
      payType: f.payType || 'MONTH', payModel: model, daysWorked: '', planDays: plan,
      S: round2(S), B: round2(B), bonus: round2(bonus), advance: round2(advance), penalty: round2(penalty),
      correction: round2(correction), total: round2(S + bonus - advance - penalty + correction),
      lateCount: 0, earlyCount: 0, incompleteDays: 0, pendingBonus: 0, detail: []
    });
  });
  return { month, planDays: plan, lines };
}

/** Usta xərcinin sahə rəisləri arasında gün nisbəti ilə bölünməsi (BR-31). */
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

/**
 * Usta xərcinin obyektlərə bölünməsi (S-26): standart hissə obyektdə işlədiyi günlərə görə,
 * bonus obyektdəki işin payına görə, sahə rəisi bonusu ustalarının bonus payı ilə.
 */
function splitCostBySite(lines, attendance, entries, shares, month) {
  const out = {}, bonusOut = {};
  const add = (o, k, v) => { if (!k || !v) return; o[k] = (o[k] || 0) + v; };
  const ok = {};
  (entries || []).forEach(e => { if (e.status === 'APPROVED' && monthOf(e.date) === month) ok[e.id] = e; });
  const qtySite = {};
  (shares || []).forEach(s => {
    const e = ok[s.entryId]; if (!e) return;
    const w = qtySite[s.workerId] || (qtySite[s.workerId] = {});
    w[e.siteId] = (w[e.siteId] || 0) + num(e.qty) * num(s.share) / 100;
  });
  const workerBonusBySite = {};
  lines.filter(l => l.personType === 'WORKER').forEach(l => {
    const daysBy = {}; let total = 0;
    (attendance || []).forEach(a => {
      if (a.workerId !== l.personId || monthOf(a.date) !== month || a.status !== 'OK' || a.kind !== 'IN') return;
      daysBy[a.siteId] = (daysBy[a.siteId] || 0) + 1; total++;
    });
    if (total) Object.keys(daysBy).forEach(s => add(out, s, num(l.S) * daysBy[s] / total));
    const q = qtySite[l.personId] || {};
    const qt = Object.keys(q).reduce((a, k) => a + q[k], 0);
    if (qt && num(l.bonus)) Object.keys(q).forEach(s => {
      const v = num(l.bonus) * q[s] / qt;
      add(out, s, v); add(bonusOut, s, v);
      const f = workerBonusBySite[l.foremanId] || (workerBonusBySite[l.foremanId] = {});
      f[s] = (f[s] || 0) + v;
    });
  });
  lines.filter(l => l.personType === 'FOREMAN' && num(l.bonus)).forEach(l => {
    const by = workerBonusBySite[l.personId] || {};
    const tot = Object.keys(by).reduce((a, k) => a + by[k], 0);
    if (tot) Object.keys(by).forEach(s => { const v = num(l.bonus) * by[s] / tot; add(out, s, v); add(bonusOut, s, v); });
  });
  Object.keys(out).forEach(k => { out[k] = round2(out[k]); });
  Object.keys(bonusOut).forEach(k => { bonusOut[k] = round2(bonusOut[k]); });
  return { labor: out, bonus: bonusOut };
}

// ======================================================================
// 4. Sheets qatı (keşli)
// ======================================================================
// Sürət üçün: hər vərəq CacheService-də saxlanır. Hər vərəqin versiyası var
// (Script Properties: ver_<Vərəq>). Yazan sorğu Sheet-i yazır, flush edir, sonra
// versiyanı dəyişir — köhnə keş özü etibarsız olur. Sheet-də əl ilə edilən
// dəyişikliklər onSheetChange trigger-i ilə bütün keşi yeniləyir (epoch).
// Sətri dəyişməzdən/silməzdən əvvəl həmin sətir Sheet-dən təzə oxunur və
// yoxlanır — keş köhnə olsa belə, səhv sətrə yazılmır.

const VERSION = '0.3.0';
const TZ = 'Asia/Baku';
const CACHE_TTL = 21600;      // 6 saat (CacheService maksimumu)
const CHUNK = 30000;          // 1 keş açarı < 100 KB (UTF-8-də də)
const MAX_CHUNKS = 60;
const FIRST_CHUNKS = 3;
const NO_CACHE = { AuditLog: 1, LinkAttempts: 1 };
// Sətrin "kimliyi": dəyişiklikdən əvvəl düzgün sətir olduğunu yoxlamaq üçün.
const ROW_KEYS = { WorkShares: ['entryId', 'workerId'], Payroll: ['month', 'personType', 'personId'], SiteCosts: ['month', 'siteId'] };

function tz() { return TZ; }
function nowIso() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function todayStr() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function addMinutesIso(min) { return Utilities.formatDate(new Date(Date.now() + min * 60000), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function daysAgo(n) { return Utilities.formatDate(new Date(Date.now() - n * 86400000), TZ, 'yyyy-MM-dd'); }
function uid(prefix) { return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
/** Link tokeni: ~150 bit təsadüfi (NFR-11). */
function newToken() { return 'k' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

function normCell(v, h) {
  let s;
  if (v instanceof Date) {
    s = v.getFullYear() < 1901 ? Utilities.formatDate(v, TZ, 'HH:mm') : Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss").replace('T00:00:00', '');
  } else {
    s = v === null || v === undefined ? '' : String(v);
  }
  if (s.charAt(0) === "'" && /^'[=+\-@]/.test(s)) s = s.slice(1);
  if (h === 'month') return s.slice(0, 7);
  if (h === 'date' || h === 'contractDate') return s.slice(0, 10);
  return s;
}

/** Script Properties: 1 sorğuda 1 dəfə oxunur. */
const P = (function () {
  let all = null;
  function load() { if (!all) all = PropertiesService.getScriptProperties().getProperties() || {}; return all; }
  return {
    get(k) { return load()[k] || null; },
    set(obj) { PropertiesService.getScriptProperties().setProperties(obj, false); Object.assign(load(), obj); },
    fresh(k) { return PropertiesService.getScriptProperties().getProperty(k) || null; },
    reset() { all = null; }
  };
})();

const DB = (function () {
  let mem = {}, meta = {}, sheets = {}, dirty = {}, bookObj = null, cacheObj = null;
  let st = { sheetReads: 0, cacheHits: 0 };

  function cache() { if (!cacheObj) cacheObj = CacheService.getScriptCache(); return cacheObj; }
  function book() {
    if (bookObj) return bookObj;
    const id = P.get('SHEET_ID');
    if (id) bookObj = SpreadsheetApp.openById(id);
    else { try { bookObj = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { bookObj = null; } }
    if (!bookObj) throw new Error('not_setup');
    return bookObj;
  }
  function sheet(name) {
    if (sheets[name]) return sheets[name];
    const sh = book().getSheetByName(name);
    if (!sh) throw new Error('not_setup');
    sheets[name] = sh;
    return sh;
  }
  function ver(name) { return P.get('ver_' + name) || '0'; }
  function keyOf(name, v, i) { return 'd:' + name + ':' + v + ':' + i; }
  function key(name, i) { return keyOf(name, ver(name), i); }
  function ident(name, o) { return (ROW_KEYS[name] || [SCHEMA[name][0]]).map(k => String(o[k] === undefined || o[k] === null ? '' : o[k])).join('\u0001'); }

  function toObj(name, r) {
    const head = SCHEMA[name], o = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = normCell(r[j], head[j]);
    return o;
  }
  function fromValues(name, values) {
    const head = SCHEMA[name], rows = [];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      let empty = true;
      for (let j = 0; j < head.length; j++) { if (r[j] !== '' && r[j] !== null && r[j] !== undefined) { empty = false; break; } }
      if (empty) continue;
      const o = toObj(name, r);
      o._row = i + 1;
      rows.push(o);
    }
    return { rows, last: Math.max(1, values.length) };
  }
  function readSheet(name) {
    st.sheetReads++;
    return fromValues(name, sheet(name).getDataRange().getValues());
  }
  function pack(name, m) {
    const head = SCHEMA[name];
    return JSON.stringify({ last: m.last, rows: m.rows.map(o => [o._row].concat(head.map(h => o[h]))) });
  }
  function unpack(name, s) {
    const head = SCHEMA[name], d = JSON.parse(s);
    return { last: d.last, rows: d.rows.map(a => { const o = { _row: a[0] }; for (let j = 0; j < head.length; j++) o[head[j]] = a[j + 1] === undefined || a[j + 1] === null ? '' : a[j + 1]; return o; }) };
  }
  /** Keşə yazır. Hər hissənin əvvəlində eyni 6 simvolluq "nonce" var — eyni anda yazan iki sorğunun hissələri qarışmasın. */
  function store(name, m) {
    if (NO_CACHE[name]) return 0;
    try {
      const s = pack(name, m);
      const n = Math.max(1, Math.ceil(s.length / CHUNK));
      if (n > MAX_CHUNKS) return 0;
      const nonce = Utilities.getUuid().slice(0, 6);
      const parts = {};
      for (let i = 0; i < n; i++) parts[key(name, i)] = nonce + (i === 0 ? n + '|' : '') + s.slice(i * CHUNK, (i + 1) * CHUNK);
      cache().putAll(parts, CACHE_TTL);
      if (meta[name]) meta[name].chunks = n;
      return n;
    } catch (e) { return 0; /* keş məcburi deyil */ }
  }
  function setMem(name, m, chunks) { mem[name] = m.rows; meta[name] = { last: m.last, complete: true, blind: false, chunks: chunks || 0 }; }
  function chunkCount(c0) { const bar = c0.indexOf('|'); return bar > 6 ? Number(c0.slice(6, bar)) : 0; }

  /** Bir neçə vərəqi birlikdə yükləyir: əvvəl keşdən (1–2 sorğu), olmayanı Sheet-dən. */
  function load(names) {
    const need = [];
    names.forEach(n => { if (!mem[n] && need.indexOf(n) < 0 && SCHEMA[n]) need.push(n); });
    if (!need.length) return;
    const fromCache = need.filter(n => !NO_CACHE[n] && !dirty[n]);
    let got = {};
    if (fromCache.length) {
      const keys = [];
      fromCache.forEach(n => { for (let i = 0; i < FIRST_CHUNKS; i++) keys.push(key(n, i)); });
      try { got = cache().getAll(keys) || {}; } catch (e) { got = {}; }
      const more = [];
      fromCache.forEach(n => {
        const c0 = got[key(n, 0)];
        if (typeof c0 !== 'string') return;
        const cnt = chunkCount(c0);
        for (let i = FIRST_CHUNKS; i < cnt; i++) more.push(key(n, i));
      });
      if (more.length) { try { Object.assign(got, cache().getAll(more) || {}); } catch (e) { /* ignore */ } }
    }
    if (need.some(n => dirty[n])) SpreadsheetApp.flush();
    need.forEach(n => {
      const c0 = got[key(n, 0)];
      if (fromCache.indexOf(n) >= 0 && typeof c0 === 'string') {
        const cnt = chunkCount(c0), nonce = c0.slice(0, 6);
        let s = c0.slice(c0.indexOf('|') + 1), ok = cnt > 0;
        for (let i = 1; ok && i < cnt; i++) {
          const c = got[key(n, i)];
          if (typeof c !== 'string' || c.slice(0, 6) !== nonce) ok = false; else s += c.slice(6);
        }
        if (ok) { try { setMem(n, unpack(n, s), cnt); st.cacheHits++; return; } catch (e) { /* oxunmadı — Sheet-dən */ } }
      }
      const m = readSheet(n);
      setMem(n, m, 0);
      if (!dirty[n]) store(n, m);
    });
  }

  function all(name) { if (!mem[name]) load([name]); return mem[name]; }
  function find(name, k, value) { return all(name).find(r => r[k] === value) || null; }

  function insert(name, obj) {
    const head = SCHEMA[name];
    const vals = head.map(h => safeCell(obj[h]));
    sheet(name).appendRow(vals);
    dirty[name] = true;
    const stored = {};
    head.forEach((h, j) => { stored[h] = normCell(vals[j], h); });
    if (meta[name] && meta[name].complete) {
      meta[name].last += 1;
      stored._row = meta[name].last;
      mem[name].push(stored);
    } else {
      meta[name] = meta[name] || { complete: false };
      meta[name].blind = true;
      stored._row = 0;
    }
    return stored;
  }

  /**
   * Dəyişiklikdən əvvəl sətri Sheet-dən təzə oxuyur (1 oxu). Sətir yerindədirsə — onu qaytarır.
   * Yeri dəyişibsə (əl ilə sıralama/silmə) — vərəqi təzədən oxuyur, sətri kimliyinə görə tapır.
   */
  function locate(name, rowObj) {
    const head = SCHEMA[name], sh = sheet(name), want = ident(name, rowObj);
    if (rowObj._row > 1) {
      st.sheetReads++;
      const cur = toObj(name, sh.getRange(rowObj._row, 1, 1, head.length).getValues()[0]);
      if (ident(name, cur) === want) {
        // Sətir yerindədir, amma dəyərləri keşdəkindən fərqlidirsə — Sheet əl ilə dəyişib: keşə geri yazmırıq.
        if (head.some(h => String(cur[h]) !== String(rowObj[h] === undefined || rowObj[h] === null ? '' : rowObj[h]))) {
          meta[name] = Object.assign(meta[name] || {}, { blind: true });
        }
        return { row: rowObj._row, cur };
      }
    }
    if (dirty[name]) SpreadsheetApp.flush();
    const m = readSheet(name);
    const hit = m.rows.find(r => ident(name, r) === want);
    // Keşdəki mövqelər köhnədir: yaddaşdakı sətirləri yenilə, keşə geri yazma.
    if (mem[name]) {
      const pos = {};
      m.rows.forEach(r => { pos[ident(name, r)] = r._row; });
      mem[name].forEach(x => { x._row = pos[ident(name, x)] || 0; });
    }
    meta[name] = Object.assign(meta[name] || {}, { blind: true, last: m.last });
    if (!hit) throw new Error('stale_row');
    rowObj._row = hit._row;
    const cur = {}; head.forEach(h => { cur[h] = hit[h]; });
    return { row: hit._row, cur };
  }

  function update(name, rowObj, patch) {
    if (!rowObj) throw new Error('stale_row');
    const head = SCHEMA[name];
    const loc = locate(name, rowObj);
    // Patch-də olmayan xanalar Sheet-dəki təzə dəyərlə yazılır (əl ilə edilən düzəliş itmir).
    const vals = head.map(h => (h in patch) ? patch[h] : loc.cur[h]).map(v => safeCell(v));
    sheet(name).getRange(loc.row, 1, 1, head.length).setNumberFormat('@').setValues([vals]);
    head.forEach((h, j) => { rowObj[h] = normCell(vals[j], h); });
    dirty[name] = true;
    return rowObj;
  }
  function remove(name, rowObj) {
    if (!rowObj) throw new Error('stale_row');
    const r = locate(name, rowObj).row;
    sheet(name).deleteRow(r);
    dirty[name] = true;
    if (mem[name]) {
      mem[name] = mem[name].filter(x => x !== rowObj && x._row !== r);
      mem[name].forEach(x => { if (x._row > r) x._row--; });
      if (meta[name]) meta[name].last = Math.max(1, meta[name].last - 1);
    }
  }
  /** Vərəq bütövlükdə yenidən yazılıb (məs. təmizləmə) — keş yenilənəcək. */
  function markDirty(name) { dirty[name] = true; meta[name] = { complete: false, blind: true, chunks: (meta[name] || {}).chunks || 0 }; delete mem[name]; }

  /** Yazılardan sonra: flush, versiyanı dəyiş, köhnə keşi sil, təzə datanı keşə yaz. */
  function commit() {
    const names = Object.keys(dirty).filter(n => !NO_CACHE[n]);
    dirty = {};
    if (!names.length) { SpreadsheetApp.flush(); return; }
    SpreadsheetApp.flush();
    const epoch0 = P.get('epoch'), old = {}, bump = {};
    names.forEach(n => { old[n] = ver(n); bump['ver_' + n] = Utilities.getUuid().slice(0, 8); });
    P.set(bump);
    // Bu arada Sheet əl ilə dəyişibsə (trigger epoch-u dəyişib), köhnə ola biləcək datanı keşə yazmırıq.
    const safe = P.fresh('epoch') === epoch0;
    const drop = [];
    names.forEach(n => {
      const m = meta[n] || {};
      for (let i = 0; i < Math.max(1, m.chunks || 0); i++) drop.push(keyOf(n, old[n], i));
      if (safe && m.complete && !m.blind && mem[n]) store(n, { rows: mem[n], last: m.last });
    });
    try { cache().removeAll(drop); } catch (e) { /* ignore */ }
  }
  function reset() { mem = {}; meta = {}; sheets = {}; dirty = {}; bookObj = null; st = { sheetReads: 0, cacheHits: 0 }; }
  function stats() { return { reads: st.sheetReads, cached: st.cacheHits }; }
  return { all, find, insert, update, remove, load, commit, reset, markDirty, stats, book, sheet };
})();

function settings() {
  const s = Object.assign({}, DEFAULT_SETTINGS);
  DB.all('Settings').forEach(r => { s[r.key] = r.value; });
  return s;
}

/** Jurnal (BR-46, NFR-16). details: köhnə və yeni dəyər, əlavə məlumat. */
function audit(user, sheet, rowId, action, details) {
  try {
    DB.insert('AuditLog', { ts: nowIso(), userId: user ? user.id : 'public', sheet, rowId, action, details: details ? JSON.stringify(details).slice(0, 4000) : '' });
  } catch (e) { /* audit sorğunu dayandırmır */ }
}

/** Dəyişən sahələr: { sahə: [köhnə, yeni] }. Şifrə hash-ləri göstərilmir. */
function changes(row, patch) {
  const o = {};
  Object.keys(patch).forEach(k => {
    const a = row[k] === undefined || row[k] === null ? '' : String(row[k]);
    const b = patch[k] === undefined || patch[k] === null ? '' : String(patch[k]);
    if (a === b) return;
    o[k] = /Hash$/.test(k) ? ['***', '***'] : [a.slice(0, 300), b.slice(0, 300)];
  });
  return o;
}
/** Sətri dəyişir və jurnala köhnə/yeni dəyəri yazır. */
function upd(user, sheet, row, patch, action, extra) {
  const ch = changes(row, patch);
  DB.update(sheet, row, patch);
  audit(user, sheet, row.id || row.token && String(row.token).slice(0, 8) || row.month || row.key || '', action || 'update', Object.assign({ ch }, extra || {}));
  return row;
}

// ======================================================================
// 5. Quraşdırma və xidmət funksiyaları (redaktordan "Run" ilə)
// ======================================================================

const HOT_SHEETS = ['Attendance', 'Tokens', 'AuditLog', 'GeoRejects', 'Sessions', 'WorkEntries', 'WorkShares', 'LinkAttempts'];

/** İlk quraşdırma və yeniləmə. Təkrar işə salmaq təhlükəsizdir. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let book = null;
  const savedId = props.getProperty('SHEET_ID');
  if (savedId) { try { book = SpreadsheetApp.openById(savedId); } catch (e) { book = null; } }
  if (!book) { try { book = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { book = null; } }
  if (!book) book = SpreadsheetApp.create('Ustabaşı — data');
  props.setProperty('SHEET_ID', book.getId());
  if (!props.getProperty('SALT')) props.setProperty('SALT', Utilities.getUuid());
  P.reset(); DB.reset();
  try { book.setSpreadsheetTimeZone(TZ); } catch (e) { /* ignore */ }

  Object.keys(SCHEMA).forEach(name => {
    let sh = book.getSheetByName(name);
    if (!sh) sh = book.insertSheet(name);
    const head = SCHEMA[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    const want = HOT_SHEETS.indexOf(name) >= 0 ? 5000 : 1000;
    const max = sh.getMaxRows();
    if (max < want) sh.insertRowsAfter(max, want - max);
    sh.getRange(1, 1, Math.max(want, max), head.length).setNumberFormat('@');
  });
  book.getSheets().forEach(sh => {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(sh);
  });
  if (!props.getProperty('PHOTO_FOLDER')) props.setProperty('PHOTO_FOLDER', DriveApp.createFolder('Ustabaşı — fotolar').getId());
  P.reset();

  const have = DB.all('Settings').map(r => r.key);
  Object.keys(DEFAULT_SETTINGS).forEach(k => { if (have.indexOf(k) < 0) DB.insert('Settings', { key: k, value: DEFAULT_SETTINGS[k] }); });
  if (!DB.all('Users').some(u => u.role === 'admin')) {
    const id = uid('U');
    DB.insert('Users', { id, role: 'admin', name: ADMIN_NAME, phone: cleanPhone(ADMIN_PHONE), pwHash: hashPw(id, ADMIN_PASSWORD), mustChange: 'yes', lang: 'az', status: 'active', created: nowIso() });
  }
  if (!DB.all('WorkTypes').length) {
    SEED_WORK_TYPES.forEach(w => DB.insert('WorkTypes', { id: uid('T'), name: w[0], unit: w[1], bonusType: 'AZN', rateHelper: 0, rateMaster: 0, rateSenior: 0, percent: 0, active: 'yes', normType: '', normQty: '' }));
  }
  migrate03();
  try { ensureTriggers(book.getId()); } catch (e) { Logger.log('Trigger qurulmadı: ' + e); }
  SpreadsheetApp.flush();
  bumpAll();
  DB.reset();
  Logger.log('Hazırdır (v' + VERSION + '). Admin telefonu: ' + cleanPhone(ADMIN_PHONE));
  Logger.log('Data Sheet: ' + book.getUrl());
}

/** v0.2 → v0.3: avans və ödəniş statusları. Bir dəfə işləyir. */
function migrate03() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRATED') === '0.3') return;
  DB.all('Advances').forEach(a => {
    if (a.status === 'GIVEN' || a.status === 'SIGNED') DB.update('Advances', a, { status: 'CLOSED', confirmedAmount: a.amount, confirmedAt: a.givenAt || a.approvedAt, closedAt: a.givenAt || a.approvedAt, resolution: 'v0.2' });
  });
  DB.all('CustomerPayments').forEach(p => {
    if (!p.status) DB.update('CustomerPayments', p, { status: 'CLOSED', confirmedAmount: p.amount, method: p.method || 'CASH', closedNote: 'v0.2' });
  });
  props.setProperty('MIGRATED', '0.3');
}

/** Avtomatik işlər: Sheet-də əl ilə dəyişiklik → keş yenilənir; gecə təmizləmə və ehtiyat surəti; saatlıq link yoxlaması. */
function ensureTriggers(sheetId) {
  const have = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (have.indexOf('onSheetChange') < 0) ScriptApp.newTrigger('onSheetChange').forSpreadsheet(sheetId).onChange().create();
  if (have.indexOf('cleanup') < 0) ScriptApp.newTrigger('cleanup').timeBased().everyDays(1).atHour(3).inTimezone(TZ).create();
  if (have.indexOf('dailyBackup') < 0) ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).inTimezone(TZ).create();
  if (have.indexOf('hourly') < 0) ScriptApp.newTrigger('hourly').timeBased().everyHours(1).create();
  if (have.indexOf('weeklyMail') < 0) ScriptApp.newTrigger('weeklyMail').timeBased().everyDays(7).atHour(4).inTimezone(TZ).create();
}

/** Sheet-də əl ilə dəyişiklik olanda bütün keşi etibarsız edir. */
function onSheetChange() { bumpAll(); }

function bumpAll() {
  const b = { epoch: Utilities.getUuid().slice(0, 8) };
  Object.keys(SCHEMA).forEach(n => { b['ver_' + n] = Utilities.getUuid().slice(0, 8); });
  PropertiesService.getScriptProperties().setProperties(b, false);
  P.reset();
}

/** Keşi əl ilə sıfırlamaq üçün. */
function clearCache() { bumpAll(); Logger.log('Keş yeniləndi'); }

/** Admin telefonunu və müvəqqəti şifrəni yuxarıdakı ADMIN_* dəyərlərinə görə yazır (şifrə unudulanda). */
function setAdminLogin() {
  if (cleanPhone(ADMIN_PHONE) === '994500000000' && String(ADMIN_PASSWORD) === 'Ustabasi#2026') {
    Logger.log('Əvvəlcə kodun əvvəlində ADMIN_PHONE və ADMIN_PASSWORD dəyərlərini dəyişin, Save basın, sonra yenidən işə salın.');
    return;
  }
  if (!validPassword(ADMIN_PASSWORD)) { Logger.log('ADMIN_PASSWORD: ən azı 8 simvol, 1 böyük hərf, 1 kiçik hərf, 1 rəqəm, 1 işarə.'); return; }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    P.reset(); DB.reset();
    let admin = DB.all('Users').find(u => u.role === 'admin');
    if (!admin) admin = DB.insert('Users', { id: uid('U'), role: 'admin', lang: 'az', created: nowIso(), status: 'active' });
    DB.update('Users', admin, { name: ADMIN_NAME, phone: cleanPhone(ADMIN_PHONE), pwHash: hashPw(admin.id, ADMIN_PASSWORD), pinHash: '', mustChange: 'yes', failCount: '', lockedUntil: '', status: 'active' });
    closeSessionsOf(admin.id, null);
    audit(null, 'Users', admin.id, 'admin_reset');
    DB.commit();
  } finally { lock.releaseLock(); }
  Logger.log('Admin girişi yazıldı. Telefon: ' + cleanPhone(ADMIN_PHONE) + '. İlk girişdə yeni şifrə yaradılır.');
}

/** Gecə təmizləmə: köhnə sessiya və linklər silinir, köhnə qeydlər arxivə köçür. */
function cleanup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    P.reset(); DB.reset();
    const now = nowIso();
    prune('Sessions', r => r.expires < now, false);
    prune('Tokens', r => String(r.created).slice(0, 10) < daysAgo(14), false);
    prune('GeoRejects', r => String(r.ts).slice(0, 10) < daysAgo(90), true);
    prune('LinkAttempts', r => String(r.ts).slice(0, 10) < daysAgo(90), true);
    prune('AuditLog', r => String(r.ts).slice(0, 10) < daysAgo(365), true);
    prune('Attendance', r => String(r.date) < daysAgo(150) && ['PENDING', 'RETURNED'].indexOf(r.status) < 0, true);
    DB.commit();
  } finally { lock.releaseLock(); }
}

function prune(name, isOld, archive) {
  const sh = DB.sheet(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return 0;
  const head = SCHEMA[name], keep = [], old = [];
  for (let i = 1; i < values.length; i++) {
    const o = {};
    head.forEach((h, j) => { o[h] = normCell(values[i][j], h); });
    if (head.every(h => o[h] === '')) continue;
    (isOld(o) ? old : keep).push(head.map(h => safeCell(o[h])));
  }
  if (!old.length) return 0;
  if (archive) archiveRows(name, old);
  sh.getRange(2, 1, values.length - 1, Math.max(head.length, values[0].length)).clearContent();
  if (keep.length) sh.getRange(2, 1, keep.length, head.length).setNumberFormat('@').setValues(keep);
  DB.markDirty(name);
  return old.length;
}

function archiveRows(name, rows) {
  const props = PropertiesService.getScriptProperties();
  let book = null;
  const id = props.getProperty('ARCHIVE_ID');
  if (id) { try { book = SpreadsheetApp.openById(id); } catch (e) { book = null; } }
  if (!book) {
    book = SpreadsheetApp.create('Ustabaşı — arxiv');
    try { book.setSpreadsheetTimeZone(TZ); } catch (e) { /* ignore */ }
    props.setProperty('ARCHIVE_ID', book.getId());
  }
  const head = SCHEMA[name];
  let sh = book.getSheetByName(name);
  if (!sh) { sh = book.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]); }
  const start = sh.getLastRow() + 1, end = start + rows.length - 1;
  if (end > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), end - sh.getMaxRows());
  sh.getRange(start, 1, rows.length, head.length).setNumberFormat('@').setValues(rows);
}

function backupFolder() {
  const props = PropertiesService.getScriptProperties();
  let folder = null;
  const fid = props.getProperty('BACKUP_FOLDER');
  if (fid) { try { folder = DriveApp.getFolderById(fid); } catch (e) { folder = null; } }
  if (!folder) { folder = DriveApp.createFolder('Ustabaşı — ehtiyat surətləri'); props.setProperty('BACKUP_FOLDER', folder.getId()); }
  return folder;
}

/** Ehtiyat surəti. Gündəlik surətlərdən son 14-ü saxlanır; aylıq və əl ilə alınanlar silinmir. */
function makeBackup(label) {
  const props = PropertiesService.getScriptProperties();
  const folder = backupFolder();
  const name = 'Ustabaşı ' + (label || 'ehtiyat') + ' ' + todayStr();
  const file = DriveApp.getFileById(props.getProperty('SHEET_ID')).makeCopy(name, folder);
  props.setProperty('LAST_BACKUP', nowIso());
  let url = '';
  try { url = file.getUrl(); } catch (e) { url = ''; }
  props.setProperty('LAST_BACKUP_URL', url);
  return { at: nowIso(), name, url };
}

function dailyBackup() {
  const first = todayStr().slice(8, 10) === '01';
  makeBackup(first ? 'aylıq' : 'ehtiyat');
  const files = [];
  const it = backupFolder().getFiles();
  while (it.hasNext()) files.push(it.next());
  files.filter(f => String(f.getName()).indexOf('Ustabaşı ehtiyat ') === 0)
    .sort((a, b) => b.getDateCreated() - a.getDateCreated())
    .slice(14).forEach(f => f.setTrashed(true));
}

/** Həftəlik Excel surəti adminin e-poçtuna (S-38). */
function weeklyMail() {
  P.reset(); DB.reset();
  const st = settings();
  let to = st.backupEmail;
  if (!to) { try { to = Session.getEffectiveUser().getEmail(); } catch (e) { to = ''; } }
  if (!to) return;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return;
  const blob = res.getBlob().setName('Ustabasi-' + todayStr() + '.xlsx');
  MailApp.sendEmail(to, 'Ustabaşı — həftəlik ehtiyat surəti ' + todayStr(), 'Əlavədə Ustabaşı datasının Excel surəti var.', { attachments: [blob] });
  PropertiesService.getScriptProperties().setProperty('LAST_MAIL', nowIso());
}

/**
 * Saatlıq: vaxtı keçən linklər.
 *  - İş təsdiqi linki açılmayıb/təsdiqlənməyib → "Usta razı deyil (link açılmayıb)", qeyd sahə rəisinə qayıdır (BR-56).
 *  - Pul linki istifadə olunmayıb → "Link vaxtı keçdi", yenisi göndərilə bilər.
 */
function hourly() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { P.reset(); DB.reset(); expireLinks(); DB.commit(); } finally { lock.releaseLock(); }
}

function expireLinks() {
  const now = nowIso();
  const toks = DB.all('Tokens');
  const latest = {};
  toks.forEach(t => { if (t.cancelledAt) return; const k = t.kind + '|' + t.refId + '|' + t.workerId; if (!latest[k] || latest[k].created < t.created) latest[k] = t; });
  let n = 0;
  DB.all('WorkEntries').filter(e => e.status === 'USTA_PENDING').forEach(e => {
    const shares = DB.all('WorkShares').filter(s => s.entryId === e.id && !s.confirmedAt);
    const expired = shares.some(s => { const t = latest['WORK|' + e.id + '|' + s.workerId]; return t && !t.usedAt && t.expires < now; });
    if (expired) { DB.update('WorkEntries', e, { status: 'RETURNED', returnReason: 'Usta razı deyil (link açılmayıb)' }); audit(null, 'WorkEntries', e.id, 'link_expired'); n++; }
  });
  [['Advances', 'ADV'], ['CustomerPayments', 'PAY']].forEach(x => {
    DB.all(x[0]).filter(r => r.status === 'LINK_SENT').forEach(r => {
      const t = toks.filter(k => k.kind === x[1] && k.refId === r.id && !k.cancelledAt).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
      if (!t || (!t.usedAt && t.expires < now)) { DB.update(x[0], r, { status: 'LINK_EXPIRED' }); audit(null, x[0], r.id, 'link_expired'); n++; }
    });
  });
  return n;
}

// ======================================================================
// 6. HTTP
// ======================================================================

function doGet() {
  P.reset();
  return json({ ok: true, app: 'ustabasi', version: VERSION, ready: !!P.get('SHEET_ID') });
}

// Hər əməliyyat üçün lazım olan vərəqlər bir dəfədə (keşdən) yüklənir.
const PAY_SHEETS = ['Settings', 'Workers', 'Users', 'Attendance', 'WorkEntries', 'WorkShares', 'WorkTypes', 'Estimates', 'Sites', 'Advances', 'Deductions', 'PlanDays', 'Periods'];
const LINK_SHEETS = ['Tokens', 'Workers', 'Sites', 'Users', 'Sessions', 'Settings', 'WorkEntries', 'WorkTypes', 'WorkShares', 'Attendance', 'Advances', 'CustomerPayments', 'Customers'];
const MONEY_SHEETS = ['Settings', 'Workers', 'Sites', 'Customers', 'Advances', 'CustomerPayments', 'Tokens', 'Periods', 'PlanDays'];
const PREFETCH = {
  ping: [],
  login: ['Users', 'Settings', 'Sessions'],
  tokenInfo: LINK_SHEETS,
  tokenConfirm: LINK_SHEETS.concat(['GeoRejects']),
  bootstrap: PAY_SHEETS.concat(['Customers', 'CustomerPayments', 'GeoRejects', 'Expenses', 'Tokens']),
  report: PAY_SHEETS.concat(['GeoRejects']),
  calcPayroll: PAY_SHEETS.concat(['Payroll']),
  closePeriod: PAY_SHEETS.concat(['Payroll', 'CustomerPayments', 'Expenses', 'SiteCosts']),
  monthBlockers: PAY_SHEETS.concat(['CustomerPayments', 'Expenses']),
  siteResult: PAY_SHEETS.concat(['CustomerPayments', 'Expenses', 'SiteCosts', 'Customers']),
  interim: PAY_SHEETS,
  createToken: ['Workers', 'Sites', 'Settings', 'Tokens'],
  manualAttendance: ['Workers', 'Sites', 'Periods', 'Attendance'],
  editAttendance: ['Workers', 'Sites', 'Periods', 'Attendance'],
  saveWorkEntry: ['Sites', 'WorkTypes', 'Workers', 'WorkEntries', 'WorkShares', 'Periods', 'Tokens', 'Settings'],
  workLinks: ['WorkEntries', 'WorkShares', 'Workers', 'Tokens', 'Settings'],
  requestAdvance: MONEY_SHEETS,
  markAdvance: MONEY_SHEETS,
  moneyLink: MONEY_SHEETS,
  addPayment: MONEY_SHEETS,
  decide: MONEY_SHEETS.concat(['WorkEntries', 'Attendance', 'Expenses', 'Customers', 'Tokens']),
  resolveConflict: MONEY_SHEETS,
  closePaymentManual: MONEY_SHEETS,
  saveExpense: ['Sites', 'Expenses', 'Periods', 'Settings'],
  markPaid: ['Payroll']
};
const READ_ONLY = { ping: 1, bootstrap: 1, me: 1, calcPayroll: 1, interim: 1, report: 1, monthBlockers: 1, auditLog: 1, links: 1, system: 1, siteResult: 1 };
// Şifrəni dəyişməmiş istifadəçiyə yalnız bunlar açıqdır.
const WHEN_MUST_CHANGE = { setPassword: 1, logout: 1, me: 1 };

function doPost(e) {
  const t0 = Date.now();
  DB.reset(); P.reset();
  let body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json({ ok: false, error: 'bad_json' }); }
  const action = String(body.action || '');
  let lock = null;
  // Offline növbədən gələn sorğu: eyni sorğu 2 dəfə yazılmasın (cavab itəndə təkrar göndərilir).
  const cid = body.cid ? 'cid:' + String(body.cid).slice(0, 64) : null;
  if (cid) {
    try { const prev = CacheService.getScriptCache().get(cid); if (prev) return ContentService.createTextOutput(prev).setMimeType(ContentService.MimeType.JSON); } catch (err) { /* ignore */ }
  }
  try {
    if (!P.get('SHEET_ID')) autoSetup();
    if (!READ_ONLY[action]) {
      // Yazan sorğular növbə ilə işləyir; data kilid alınandan SONRA oxunur.
      lock = LockService.getScriptLock();
      lock.waitLock(25000);
      P.reset(); DB.reset();
    }
    const isPublic = !!PUBLIC[action];
    DB.load((isPublic ? [] : ['Sessions', 'Users']).concat(PREFETCH[action] || ['Settings']));
    let data;
    if (isPublic) data = PUBLIC[action](body);
    else {
      const user = requireUser(body.token, action);
      if (body.offlineAt) {
        const days = num(settings().offlineDays) || 3;
        if (String(body.offlineAt).slice(0, 10) < daysAgo(days)) fail('offline_expired');
      }
      const fn = (user.role === 'admin' ? ADMIN[action] || COMMON[action] || FOREMAN[action] : COMMON[action] || FOREMAN[action]);
      if (!fn) return json({ ok: false, error: 'forbidden' });
      data = fn(body, user);
    }
    const out = JSON.stringify({ ok: true, data, ms: Date.now() - t0, db: DB.stats() });
    if (cid) { try { CacheService.getScriptCache().put(cid, out, CACHE_TTL); } catch (err) { /* ignore */ } }
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const msg = String(err && err.message || err);
    return json({ ok: false, error: msg.indexOf(' ') < 0 ? msg.split(':')[0] : 'server', detail: msg, ms: Date.now() - t0 });
  } finally {
    if (lock) { try { DB.commit(); } finally { lock.releaseLock(); } }
  }
}

function autoSetup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { P.reset(); if (!P.get('SHEET_ID')) setup(); } finally { lock.releaseLock(); }
  P.reset(); DB.reset();
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail(code) { throw new Error(code); }

function cleanPhone(p) { return String(p || '').replace(/\D/g, ''); }
function sha(s) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  return raw.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
/** Köhnə PIN hash-i (v0.2) — yalnız ilk girişdə şifrəyə keçid üçün. */
function hashPin(pin) { return sha((P.get('SALT') || '') + ':' + String(pin)); }
function hashPw(userId, pw) { return sha((P.get('SALT') || '') + ':pw:' + userId + ':' + String(pw)); }

function requireUser(token, action) {
  if (!token) fail('auth');
  const s = DB.find('Sessions', 'token', String(token));
  if (!s || s.expires < nowIso()) fail('auth');
  const u = DB.find('Users', 'id', s.userId);
  if (!u || u.status !== 'active') fail('auth');
  if (mustChange(u) && action && !WHEN_MUST_CHANGE[action]) fail('must_change');
  u._session = s.token;
  return u;
}
function mustChange(u) { return u.mustChange === 'yes' || !u.pwHash; }

function closeSessionsOf(userId, exceptToken) {
  DB.all('Sessions').filter(s => s.userId === userId && s.token !== exceptToken).sort((a, b) => b._row - a._row).forEach(s => DB.remove('Sessions', s));
}

function publicUser(u) { return { id: u.id, role: u.role, name: u.name, phone: u.phone, lang: u.lang || 'az', mustChange: mustChange(u) }; }
function isClosed(month) { const p = DB.find('Periods', 'month', month); return !!(p && p.status === 'CLOSED'); }
function assertOpen(dateStr) { if (isClosed(monthOf(dateStr))) fail('period_closed'); }
function reasonOf(b) { const r = String(b.reason || '').trim().slice(0, 300); return r; }

/** Telefonun işçi (admin/sahə rəisi) sessiyası varsa, linki açmaq olmaz (K-18). */
function staffSession(st) {
  if (!st) return null;
  const s = DB.find('Sessions', 'token', String(st));
  if (!s || s.expires < nowIso()) return null;
  return s;
}

function logAttempt(t, reason, b) {
  try {
    const site = DB.find('Sites', 'id', t.siteId) || {};
    const w = DB.find('Workers', 'id', t.workerId) || {};
    DB.insert('LinkAttempts', { ts: nowIso(), token: String(t.token).slice(0, 10), kind: t.kind, workerId: t.workerId, siteId: t.siteId, refId: t.refId, foremanId: w.foremanId || site.foremanId || '', deviceId: String(b.d || '').slice(0, 64), reason, ua: String(b.ua || '').slice(0, 160) });
    audit(null, 'Tokens', String(t.token).slice(0, 8), 'link_' + reason, { kind: t.kind, refId: t.refId });
  } catch (e) { /* ignore */ }
}

/** Link açılışının yoxlanışı: işçi telefonu, başqa telefon. İlk açılışda link bu telefona bağlanır (BR-63). */
function checkDevice(t, b) {
  if (staffSession(b.st)) { logAttempt(t, 'staff_device', b); fail('link_staff_device'); }
  const d = String(b.d || '').slice(0, 64);
  if (t.deviceId && d !== t.deviceId) { logAttempt(t, 'other_device', b); fail('link_other_device'); }
  if (!t.deviceId && !t.usedAt && !t.cancelledAt && t.expires >= nowIso() && d) {
    DB.update('Tokens', t, { deviceId: d, openedAt: nowIso() });
    audit(null, 'Tokens', String(t.token).slice(0, 8), 'link_open', { kind: t.kind, refId: t.refId });
  }
}

function linkStatus(t, now) {
  now = now || nowIso();
  if (t.cancelledAt) return 'CANCELLED';
  if (t.usedAt) return 'USED';
  if (t.expires < now) return t.openedAt ? 'EXPIRED' : 'NOT_OPENED';
  return t.openedAt ? 'OPENED' : 'CREATED';
}

function companyInfo() {
  const st = settings();
  return { name: st.companyName || 'Ustabaşı', voen: st.companyVoen || '', phone: st.companyPhone || '', address: st.companyAddress || '' };
}

function receiptData(kind, r) {
  if (kind === 'ADV') {
    const w = DB.find('Workers', 'id', r.workerId) || {};
    const f = DB.find('Users', 'id', r.foremanId) || {};
    return { kind, no: r.receiptNo, date: dateOf(r.closedAt || r.confirmedAt || r.givenAt || r.approvedAt), amount: num(r.amount), payer: companyInfo().name, payee: w.name || '', by: f.name || '', confirmedAt: r.confirmedAt, company: companyInfo(), lang: w.lang || 'az' };
  }
  const site = DB.find('Sites', 'id', r.siteId) || {};
  const c = DB.find('Customers', 'id', site.customerId) || {};
  const f = DB.find('Users', 'id', r.foremanId || site.foremanId) || {};
  return { kind, no: r.receiptNo, date: r.date, amount: num(r.amount), payer: c.name || '', payerVoen: c.voen || '', payee: companyInfo().name, site: site.name || '', by: f.name || '', method: r.method || '', confirmedAt: r.confirmedAt, company: companyInfo(), lang: c.lang || 'az' };
}

function nextReceiptNo(sheet, prefix) {
  const year = todayStr().slice(0, 4);
  const n = DB.all(sheet).filter(x => String(x.receiptNo).indexOf(prefix + '-' + year) === 0).length + 1;
  return prefix + '-' + year + '-' + ('000' + n).slice(-4);
}

// ---------------------------------------------------------------- PUBLIC
const PUBLIC = {
  ping: () => ({ time: nowIso() }),

  login(b) {
    const phone = cleanPhone(b.phone);
    const pw = String(b.password !== undefined ? b.password : (b.pin || ''));
    const u = DB.all('Users').find(x => x.phone === phone && x.status === 'active');
    if (!u) { audit(null, 'Users', phone.slice(-4), 'login_fail', { phone: '***' + phone.slice(-4) }); fail('bad_login'); }
    const now = nowIso();
    if (u.lockedUntil && u.lockedUntil > now) { audit(u, 'Users', u.id, 'login_locked'); fail('locked'); }
    let ok = false;
    if (u.pwHash) ok = u.pwHash === hashPw(u.id, pw);
    else if (u.pinHash) ok = u.pinHash === hashPin(pw);   // v0.2 PIN: yalnız şifrəyə keçid üçün
    if (!ok) {
      const n = num(u.failCount) + 1;
      const patch = n >= 5 ? { failCount: 0, lockedUntil: addMinutesIso(15) } : { failCount: n };
      DB.update('Users', u, patch);
      audit(u, 'Users', u.id, n >= 5 ? 'login_blocked' : 'login_fail', { n });
      fail(n >= 5 ? 'locked' : 'bad_login');
    }
    if (num(u.failCount) || u.lockedUntil) DB.update('Users', u, { failCount: '', lockedUntil: '' });
    const st = settings();
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    DB.insert('Sessions', { token, userId: u.id, expires: addMinutesIso(num(st.sessionDays || 30) * 1440), created: now });
    audit(u, 'Sessions', u.id, 'login');
    return { token, user: publicUser(u), mustChange: mustChange(u) };
  },

  tokenInfo(b) {
    const t = DB.find('Tokens', 'token', String(b.t || ''));
    if (!t) fail('link_not_found');
    checkDevice(t, b);
    const now = nowIso();
    const out = { kind: t.kind, used: !!t.usedAt, usedAt: t.usedAt, expires: t.expires, now, expired: !t.usedAt && t.expires < now, cancelled: !!t.cancelledAt };
    if (t.kind === 'PAY') {
      const p = DB.find('CustomerPayments', 'id', t.refId) || {};
      const r = receiptData('PAY', p);
      out.lang = r.lang;
      out.pay = { date: p.date, site: r.site, customer: r.payer, company: r.company.name, by: r.by };
      if (t.usedAt) out.result = { status: p.status, match: p.status === 'CLOSED', receipt: p.status === 'CLOSED' ? r : null };
      if (['LINK_SENT'].indexOf(p.status) < 0 && !t.usedAt) out.cancelled = true;
      return out;
    }
    const w = DB.find('Workers', 'id', t.workerId) || {};
    const site = DB.find('Sites', 'id', t.siteId) || {};
    const f = DB.find('Users', 'id', site.foremanId || w.foremanId) || {};
    out.worker = { name: w.name, lang: w.lang || 'az', startTime: w.startTime, endTime: w.endTime };
    out.lang = w.lang || 'az';
    out.site = { name: site.name, address: site.address, radius: num(site.radius) };
    out.foreman = f.name || '';
    if (t.kind === 'ADV') {
      const a = DB.find('Advances', 'id', t.refId) || {};
      out.adv = { date: dateOf(a.givenAt || a.approvedAt), no: a.receiptNo, company: companyInfo().name };
      if (t.usedAt) out.result = { status: a.status, match: a.status === 'CLOSED', receipt: a.status === 'CLOSED' ? receiptData('ADV', a) : null };
      if (a.status !== 'LINK_SENT' && !t.usedAt) out.cancelled = true;
    }
    if (t.kind === 'WORK') {
      const e = DB.find('WorkEntries', 'id', t.refId) || {};
      const wt = DB.find('WorkTypes', 'id', e.workTypeId) || {};
      const sh = DB.all('WorkShares').find(s => s.entryId === e.id && s.workerId === t.workerId) || {};
      out.work = { date: e.date, type: wt.name, unit: wt.unit, qty: num(e.qty), share: num(sh.share), myQty: round2(num(e.qty) * num(sh.share) / 100), status: e.status };
      if (!t.usedAt && (e.status !== 'USTA_PENDING' || sh.token !== t.token)) out.cancelled = true;
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
    checkDevice(t, b);
    if (t.cancelledAt) fail('link_cancelled');
    if (t.usedAt) fail('link_used');
    if (t.expires < nowIso()) fail('link_expired');
    const now = nowIso();

    if (t.kind === 'ADV' || t.kind === 'PAY') {
      const sheet = t.kind === 'ADV' ? 'Advances' : 'CustomerPayments';
      const r = DB.find(sheet, 'id', t.refId);
      if (!r || r.status !== 'LINK_SENT') fail('link_cancelled');
      const amount = round2(b.amount);
      if (!(amount > 0)) fail('bad_amount');
      const match = Math.abs(amount - round2(r.amount)) < 0.005;
      DB.update(sheet, r, match ? { status: 'CLOSED', confirmedAmount: amount, confirmedAt: now, closedAt: now } : { status: 'CONFLICT', confirmedAmount: amount, confirmedAt: now });
      DB.update('Tokens', t, { usedAt: now });
      audit(null, sheet, r.id, match ? 'confirm_match' : 'confirm_conflict', { by: t.kind === 'ADV' ? 'worker' : 'customer', amount, expected: round2(r.amount) });
      return { ok: true, match, ts: now, receipt: match ? receiptData(t.kind, r) : null };
    }

    const w = DB.find('Workers', 'id', t.workerId);
    const site = DB.find('Sites', 'id', t.siteId);
    if (!w || !site) fail('link_not_found');

    if (t.kind === 'WORK') {
      const sh = DB.all('WorkShares').find(s => s.entryId === t.refId && s.workerId === t.workerId);
      const e = DB.find('WorkEntries', 'id', t.refId);
      if (!sh || !e) fail('link_not_found');
      if (e.status !== 'USTA_PENDING' || sh.token !== t.token) fail('link_cancelled');
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
      DB.insert('GeoRejects', { ts: nowIso(), token: String(t.token).slice(0, 10), workerId: w.id, siteId: site.id, dist, lat: b.lat, lng: b.lng });
      return { ok: false, error: 'too_far', dist, radius };
    }
    const today = todayStr();
    const todays = DB.all('Attendance').filter(a => a.workerId === w.id && a.date === today && ['REJECTED', 'RETURNED'].indexOf(a.status) < 0);
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
    audit(null, 'Attendance', att.id, 'link_' + t.kind, { workerId: w.id, dist });
    return { ok: true, ts: now, dist, radius, diffMin, late: num(settings().lateToleranceMin) };
  }
};

// ---------------------------------------------------------------- COMMON (admin + sahə rəisi)
function uploadPhotos(list, prefix, max) {
  const out = [];
  const folderId = P.get('PHOTO_FOLDER');
  (list || []).slice(0, max || 5).forEach((p, i) => {
    const m = String(p).match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m || !folderId) return;
    const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], prefix + '_' + i + '.jpg');
    out.push(DriveApp.getFolderById(folderId).createFile(blob).getUrl());
  });
  return out;
}

const COMMON = {
  me: (b, u) => ({ user: publicUser(u), settings: settings() }),

  logout(b) {
    const s = DB.find('Sessions', 'token', String(b.token));
    if (s) DB.remove('Sessions', s);
    return true;
  },

  /** Şifrə yaratmaq / dəyişmək (BR-60). İlk girişdə köhnə şifrə soruşulmur. */
  setPassword(b, u) {
    const must = mustChange(u);
    if (!must) {
      const old = String(b.oldPassword || '');
      if (u.pwHash !== hashPw(u.id, old)) fail('bad_old_password');
    }
    if (!validPassword(b.newPassword)) fail('weak_password');
    if (u.pwHash && u.pwHash === hashPw(u.id, b.newPassword)) fail('same_password');
    DB.update('Users', u, { pwHash: hashPw(u.id, b.newPassword), pinHash: '', mustChange: '', failCount: '', lockedUntil: '' });
    closeSessionsOf(u.id, u._session);
    audit(u, 'Users', u.id, 'set_password');
    return { user: publicUser(u) };
  },

  setLang(b, u) { DB.update('Users', u, { lang: ['az', 'ru', 'en', 'tr'].indexOf(b.lang) >= 0 ? b.lang : 'az' }); return true; },

  /** Çap, PDF, eksport jurnala yazılır (NFR-16). */
  logEvent(b, u) {
    const ev = ['print', 'pdf', 'export', 'share'].indexOf(b.event) >= 0 ? b.event : 'other';
    audit(u, String(b.sheet || '-').slice(0, 30), String(b.id || '').slice(0, 40), ev, { what: String(b.what || '').slice(0, 100) });
    return true;
  },

  /** PDF faylını Drive-da saxlayır (S-34). */
  storePdf(b, u) {
    const m = String(b.data || '').match(/^data:application\/pdf;base64,(.+)$/);
    if (!m) fail('bad_file');
    const props = PropertiesService.getScriptProperties();
    let fid = props.getProperty('PDF_FOLDER'), folder = null;
    if (fid) { try { folder = DriveApp.getFolderById(fid); } catch (e) { folder = null; } }
    if (!folder) { folder = DriveApp.createFolder('Ustabaşı — PDF'); props.setProperty('PDF_FOLDER', folder.getId()); }
    const name = String(b.name || 'cek').replace(/[^\w.\-]+/g, '_').slice(0, 80) + '.pdf';
    const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[1]), 'application/pdf', name));
    audit(u, String(b.sheet || '-'), String(b.id || ''), 'pdf', { name });
    return { url: file.getUrl() };
  },

  bootstrap(b, u) {
    const st = settings();
    const admin = u.role === 'admin';
    const today = todayStr();
    const month = b.month || today.slice(0, 7);
    const now = nowIso();
    // Telefona yalnız lazım olan data gedir: davamiyyət 3 gün, iş 14 gün, pul 40 gün + açıq qeydlər.
    const from3 = daysAgo(3), from14 = daysAgo(14), from40 = daysAgo(40), from7 = daysAgo(7);
    const strip = o => { const c = Object.assign({}, o); delete c._row; delete c.pinHash; delete c.pwHash; delete c.failCount; return c; };

    const foremen = DB.all('Users').filter(x => x.role === 'foreman' && x.status !== 'deleted').map(strip);
    let workers = DB.all('Workers').filter(x => x.status !== 'deleted').map(strip);
    let sites = DB.all('Sites').map(strip);
    if (!admin) {
      workers = workers.filter(w => w.foremanId === u.id);
      sites = sites.filter(s => s.foremanId === u.id || (s.by === u.id && ['PENDING', 'RETURNED', 'REJECTED'].indexOf(s.status) >= 0));
      if (st.foremanSeesPay !== 'yes') workers.forEach(w => { w.baseAmount = ''; w.norm = ''; });
    }
    const wIds = {}; workers.forEach(w => { wIds[w.id] = 1; });
    const sIds = {}; sites.forEach(s => { sIds[s.id] = 1; });
    const custIds = {}; sites.forEach(s => { custIds[s.customerId] = 1; });
    const entries = DB.all('WorkEntries').filter(e => (admin || sIds[e.siteId]) && (e.date >= from14 || ['APPROVED', 'REJECTED'].indexOf(e.status) < 0)).map(strip);
    const eIds = {}; entries.forEach(e => { eIds[e.id] = 1; });
    const openMoney = s => MONEY_FINAL.indexOf(s) < 0;
    const advances = DB.all('Advances').filter(a => (admin || wIds[a.workerId]) && (String(a.created) >= from40 || openMoney(a.status))).map(strip);
    const payments = DB.all('CustomerPayments').filter(p => (admin || sIds[p.siteId]) && (String(p.created || p.date) >= from40 || openMoney(p.status) || admin)).map(strip);
    const expenses = DB.all('Expenses').filter(x => (admin || sIds[x.siteId]) && (String(x.date) >= from40 || ['PENDING', 'RETURNED'].indexOf(x.status) >= 0)).map(strip);
    // Pul linklərinin son vəziyyəti (link vaxtı, açılıb-açılmadığı)
    const refIds = {}; advances.forEach(a => { refIds[a.id] = 1; }); payments.forEach(p => { refIds[p.id] = 1; });
    const links = {};
    DB.all('Tokens').forEach(t => {
      if (t.cancelledAt) return;
      if ((t.kind === 'ADV' || t.kind === 'PAY') && refIds[t.refId]) {
        if (!links[t.refId] || links[t.refId].created < t.created) links[t.refId] = { refId: t.refId, kind: t.kind, created: t.created, expires: t.expires, openedAt: t.openedAt, usedAt: t.usedAt, status: linkStatus(t, now) };
      }
    });
    // Bir ustaya bu gün 3-dən çox açılmamış link (S-40)
    const unopened = {};
    DB.all('Tokens').forEach(t => {
      if ((t.kind === 'IN' || t.kind === 'OUT') && String(t.created).slice(0, 10) === today && linkStatus(t, now) === 'NOT_OPENED' && (admin || wIds[t.workerId])) unopened[t.workerId] = (unopened[t.workerId] || 0) + 1;
    });
    const linkWarnings = Object.keys(unopened).filter(k => unopened[k] >= 3).map(k => ({ workerId: k, n: unopened[k] }));
    // Bu gün aktiv gəliş/çıxış linkləri (sahə rəisi eyni linki təkrar göndərə bilsin)
    const activeLinks = DB.all('Tokens').filter(t => (t.kind === 'IN' || t.kind === 'OUT') && !t.usedAt && !t.cancelledAt && t.expires > now && (admin || wIds[t.workerId]))
      .map(t => ({ token: t.token, kind: t.kind, workerId: t.workerId, siteId: t.siteId, expires: t.expires, openedAt: t.openedAt }));
    let attempts = [];
    try {
      attempts = DB.all('LinkAttempts').filter(a => String(a.ts).slice(0, 10) >= from7 && (admin || a.foremanId === u.id || wIds[a.workerId])).map(strip);
    } catch (e) { attempts = []; }

    const out = {
      user: publicUser(u), settings: st, today, month, now, version: VERSION,
      foremen: admin ? foremen : foremen.filter(f => f.id === u.id).map(f => ({ id: f.id, name: f.name, phone: f.phone })),
      workers, sites,
      customers: DB.all('Customers').filter(c => admin || custIds[c.id] || c.by === u.id).map(strip),
      workTypes: DB.all('WorkTypes').filter(x => x.active !== 'no').map(strip),
      estimates: DB.all('Estimates').filter(x => admin || sIds[x.siteId]).map(strip),
      payments, expenses, advances, links, activeLinks, linkWarnings, attempts,
      attendance: DB.all('Attendance').filter(a => (a.date >= from3 || ['PENDING', 'RETURNED'].indexOf(a.status) >= 0) && (admin || wIds[a.workerId])).map(strip),
      entries,
      shares: DB.all('WorkShares').filter(s => eIds[s.entryId]).map(strip),
      planDays: DB.all('PlanDays').map(strip),
      periods: DB.all('Periods').map(strip),
      geoRejects: admin ? DB.all('GeoRejects').filter(g => String(g.ts).slice(0, 10) === today).map(strip) : []
    };
    if (admin) {
      // Dashboard üçün ayın xülasəsi — ayrıca sorğu lazım olmasın.
      const data = payrollInput(month);
      const res = computePayroll(data);
      const est = {}; data.estimates.forEach(x => { est[x.siteId + '|' + x.workTypeId] = num(x.clientPrice); });
      const siteDone = {};
      DB.all('WorkEntries').forEach(e => { if (e.status === 'APPROVED') siteDone[e.siteId] = round2((siteDone[e.siteId] || 0) + num(e.qty) * (est[e.siteId + '|' + e.workTypeId] || 0)); });
      const props = PropertiesService.getScriptProperties();
      out.summary = {
        month,
        fund: round2(res.lines.reduce((s, l) => s + num(l.S) + num(l.bonus), 0)),
        advances: round2(res.lines.reduce((s, l) => s + num(l.advance), 0)),
        costByForeman: splitCostByForeman(res.lines, data.attendance, data.sites, month),
        siteDone,
        lastBackup: props.getProperty('LAST_BACKUP') || '',
        locked: DB.all('Users').filter(x => x.lockedUntil && x.lockedUntil > now).map(x => ({ id: x.id, name: x.name, until: x.lockedUntil }))
      };
    }
    return out;
  },

  saveCustomer(b, u) {
    const c = b.customer || {};
    if (!String(c.name || '').trim()) fail('required');
    const voen = String(c.voen || '').replace(/\s/g, '');
    if (voen && !/^\d{10}$/.test(voen)) fail('bad_voen');
    const lang = ['az', 'ru', 'en', 'tr'].indexOf(c.lang) >= 0 ? c.lang : 'az';
    const admin = u.role === 'admin';
    if (c.id) {
      const row = DB.find('Customers', 'id', c.id); if (!row) fail('not_found');
      const patch = { name: c.name, type: c.type || 'person', voen, lang };
      const phone = cleanPhone(c.phone);
      if (admin) { patch.phone = phone; patch.pendingPhone = ''; }
      else if (phone !== row.phone) {
        // Sahə rəisi müştərinin nömrəsini dəyişəndə admin təsdiqi lazımdır (K-18).
        if (!row.phone) patch.phone = phone; else patch.pendingPhone = phone;
      }
      upd(u, 'Customers', row, patch);
      return row;
    }
    const row = DB.insert('Customers', { id: uid('C'), name: c.name, phone: cleanPhone(c.phone), type: c.type || 'person', voen, lang, created: nowIso(), by: u.id });
    audit(u, 'Customers', row.id, 'create', { name: c.name });
    return row;
  },

  saveSite(b, u) {
    const s = b.site || {};
    if (!String(s.name || '').trim() || !s.customerId) fail('required');
    if (!isFinite(Number(s.lat)) || !isFinite(Number(s.lng)) || s.lat === '' || s.lng === '') fail('no_coords');
    const st = settings();
    const radius = Math.min(500, Math.max(50, num(s.radius) || num(st.defaultRadius)));
    const admin = u.role === 'admin';
    const photoPatch = {};
    const newPhotos = (b.photos || []).filter(Boolean);
    if (newPhotos.length) {
      photoPatch.photos = uploadPhotos(newPhotos, 'site_' + todayStr(), 5);
      if (b.photoLat !== undefined && b.photoLat !== '' && b.photoLat !== null) { photoPatch.photoLat = b.photoLat; photoPatch.photoLng = b.photoLng; }
    }
    if (s.id) {
      const row = DB.find('Sites', 'id', s.id); if (!row) fail('not_found');
      if (!admin && row.foremanId !== u.id && row.by !== u.id) fail('forbidden');
      const keep = String(row.photos || '').split(' ').filter(Boolean);
      const patch = { name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, radius, customerId: s.customerId };
      if (photoPatch.photos) { patch.photos = keep.concat(photoPatch.photos).slice(-5).join(' '); if (photoPatch.photoLat !== undefined) { patch.photoLat = photoPatch.photoLat; patch.photoLng = photoPatch.photoLng; } }
      if (admin) Object.assign(patch, { foremanId: s.foremanId || row.foremanId, contractNo: s.contractNo || '', contractDate: s.contractDate || '', contractAmount: s.contractAmount || '', status: s.status || row.status });
      else {
        if (row.status === 'REJECTED') fail('bad_status');
        const minP = num(st.siteMinPhotos);
        const count = (patch.photos ? patch.photos : row.photos || '').split(' ').filter(Boolean).length;
        if (count < minP) fail('photo_required');
        if (row.status === 'RETURNED') { patch.status = 'PENDING'; patch.returnReason = ''; }
        else if (row.status === 'APPROVED' && (String(row.lat) !== String(s.lat) || String(row.lng) !== String(s.lng))) patch.status = 'PENDING';
      }
      upd(u, 'Sites', row, patch);
      return row;
    }
    if (!admin && newPhotos.length < num(st.siteMinPhotos)) fail('photo_required');
    const row = DB.insert('Sites', {
      id: uid('S'), customerId: s.customerId, name: s.name, address: s.address || '', lat: s.lat, lng: s.lng, radius,
      foremanId: admin ? (s.foremanId || '') : u.id, status: admin ? 'APPROVED' : 'PENDING',
      contractNo: s.contractNo || '', contractDate: s.contractDate || '', contractAmount: s.contractAmount || '',
      created: nowIso(), approvedBy: admin ? u.id : '', approvedAt: admin ? nowIso() : '',
      photos: (photoPatch.photos || []).join(' '), photoLat: photoPatch.photoLat || '', photoLng: photoPatch.photoLng || '', returnReason: '', by: u.id
    });
    audit(u, 'Sites', row.id, 'create', { name: s.name, photos: (photoPatch.photos || []).length });
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
function ownsWorker(u, w) { return u.role === 'admin' || (w && w.foremanId === u.id); }
function ownsSite(u, s) { return u.role === 'admin' || (s && s.foremanId === u.id); }

/** Pul linki (avans → usta, ödəniş → müştəri). Aktiv link varsa, həmin link qaytarılır (BR-55). */
function moneyLinkFor(u, kind, r) {
  const st = settings();
  const now = nowIso();
  const toks = DB.all('Tokens').filter(t => t.kind === kind && t.refId === r.id && !t.cancelledAt);
  const active = toks.find(t => !t.usedAt && t.expires > now);
  if (active && r.status === 'LINK_SENT') return { token: active.token, expires: active.expires, reused: true };
  const max = num(st.maxMoneyLinks) || 3;
  if (num(r.linkCount) >= max) fail('link_limit');
  const tok = DB.insert('Tokens', { token: newToken(), kind, workerId: r.workerId || '', siteId: r.siteId || '', refId: r.id, created: now, expires: addMinutesIso((num(st.moneyLinkHours) || 24) * 60), usedAt: '', createdBy: u.id, openedAt: '', deviceId: '', cancelledAt: '' });
  return { token: tok.token, expires: tok.expires, reused: false };
}

function cancelTokens(kind, refId) {
  const now = nowIso();
  DB.all('Tokens').filter(t => t.kind === kind && t.refId === refId && !t.usedAt && !t.cancelledAt).forEach(t => DB.update('Tokens', t, { cancelledAt: now }));
}

const FOREMAN = {
  /** Gəliş/çıxış linki. Açılmamış aktiv link varsa, yenisi yaradılmır — həmin link qaytarılır (BR-55). */
  createToken(b, u) {
    const kind = b.kind;
    if (['IN', 'OUT'].indexOf(kind) < 0) fail('bad_kind');
    const w = DB.find('Workers', 'id', b.workerId);
    const site = DB.find('Sites', 'id', b.siteId);
    if (!w || !site) fail('not_found');
    if (u.role !== 'admin' && (w.foremanId !== u.id || site.foremanId !== u.id)) fail('forbidden');
    if (site.status !== 'APPROVED') fail('site_not_approved');
    const ttl = num(settings().linkTtlMin) || 10;
    const now = nowIso();
    const active = DB.all('Tokens').find(t => t.kind === kind && t.workerId === w.id && !t.usedAt && !t.cancelledAt && t.expires > now);
    if (active) {
      if (active.siteId === site.id) return { token: active.token, expires: active.expires, ttl, reused: true, opened: !!active.openedAt };
      DB.update('Tokens', active, { cancelledAt: now });
    }
    const tok = DB.insert('Tokens', { token: newToken(), kind, workerId: w.id, siteId: site.id, refId: '', created: now, expires: addMinutesIso(ttl), usedAt: '', createdBy: u.id, openedAt: '', deviceId: '', cancelledAt: '' });
    audit(u, 'Tokens', tok.token.slice(0, 8), 'create_' + kind, { workerId: w.id, siteId: site.id });
    return { token: tok.token, expires: tok.expires, ttl, reused: false };
  },

  manualAttendance(b, u) {
    const w = DB.find('Workers', 'id', b.workerId);
    const site = DB.find('Sites', 'id', b.siteId);
    if (!w || !site) fail('not_found');
    if (!ownsWorker(u, w)) fail('forbidden');
    if (['IN', 'OUT'].indexOf(b.kind) < 0) fail('bad_kind');
    if (!String(b.reason || '').trim()) fail('required');
    const date = dateOf(b.date || todayStr());
    assertOpen(date);
    const time = /^\d{2}:\d{2}$/.test(String(b.time)) ? b.time : nowIso().slice(11, 16);
    const ref = minutesOf(b.kind === 'IN' ? w.startTime : w.endTime);
    const row = DB.insert('Attendance', {
      id: uid('A'), workerId: w.id, siteId: site.id, kind: b.kind, ts: date + 'T' + time + ':00', date,
      lat: '', lng: '', acc: '', dist: '', source: 'MANUAL', reason: String(b.reason).slice(0, 200),
      status: u.role === 'admin' ? 'OK' : 'PENDING', diffMin: ref === null ? '' : minutesOf(time) - ref, by: u.id, returnReason: ''
    });
    audit(u, 'Attendance', row.id, 'manual', { workerId: w.id, kind: b.kind, time, reason: b.reason });
    return row;
  },

  /** Geri qaytarılmış manual qeydi düzəltmək. */
  editAttendance(b, u) {
    const a = DB.find('Attendance', 'id', b.id); if (!a) fail('not_found');
    const w = DB.find('Workers', 'id', a.workerId);
    if (!ownsWorker(u, w)) fail('forbidden');
    if (a.status !== 'RETURNED' && a.status !== 'PENDING') fail('bad_status');
    assertOpen(a.date);
    const time = /^\d{2}:\d{2}$/.test(String(b.time)) ? b.time : String(a.ts).slice(11, 16);
    const ref = minutesOf(a.kind === 'IN' ? w.startTime : w.endTime);
    upd(u, 'Attendance', a, { ts: a.date + 'T' + time + ':00', reason: String(b.reason || a.reason).slice(0, 200), status: u.role === 'admin' ? 'OK' : 'PENDING', diffMin: ref === null ? '' : minutesOf(time) - ref, returnReason: '' }, 'edit');
    return a;
  },

  saveWorkEntry(b, u) {
    const e = b.entry || {};
    const site = DB.find('Sites', 'id', e.siteId);
    const wt = DB.find('WorkTypes', 'id', e.workTypeId);
    if (!site || !wt) fail('not_found');
    if (!ownsSite(u, site)) fail('forbidden');
    if (site.status !== 'APPROVED') fail('site_not_approved');
    if (!(num(e.qty) > 0)) fail('bad_qty');
    const shares = (b.shares || []).filter(s => s.workerId && num(s.share) > 0);
    if (!shares.length) fail('no_shares');
    const sum = shares.reduce((a, s) => a + num(s.share), 0);
    if (Math.abs(sum - 100) > 0.5) fail('shares_not_100');
    const date = dateOf(e.date || todayStr());
    assertOpen(date);
    const photos = uploadPhotos(b.photos, date + '_' + site.id, 5);

    let entry;
    if (e.id) {
      entry = DB.find('WorkEntries', 'id', e.id); if (!entry) fail('not_found');
      if (['APPROVED', 'REJECTED', 'ADMIN_PENDING'].indexOf(entry.status) >= 0) fail('already_approved');
      const keep = (entry.photos ? String(entry.photos).split(' ') : []).filter(Boolean);
      upd(u, 'WorkEntries', entry, { date, siteId: site.id, workTypeId: wt.id, qty: num(e.qty), note: e.note || '', photos: keep.concat(photos).join(' '), status: 'USTA_PENDING', returnReason: '' });
      const old = DB.all('WorkShares').filter(s => s.entryId === entry.id).sort((a, c) => c._row - a._row);
      old.forEach(s => DB.remove('WorkShares', s));
      cancelTokens('WORK', entry.id);   // köhnə linklərlə yeni versiya təsdiqlənməsin
    } else {
      entry = DB.insert('WorkEntries', { id: uid('E'), date, siteId: site.id, workTypeId: wt.id, qty: num(e.qty), photos: photos.join(' '), note: e.note || '', status: 'USTA_PENDING', returnReason: '', foremanId: site.foremanId, created: nowIso(), approvedBy: '', approvedAt: '' });
      audit(u, 'WorkEntries', entry.id, 'create', { qty: e.qty, shares });
    }
    const ttlMin = (num(settings().workLinkHours) || 24) * 60;
    const links = shares.map(s => {
      const w = DB.find('Workers', 'id', s.workerId);
      if (!w || !ownsWorker(u, w)) fail('forbidden');
      const tok = DB.insert('Tokens', { token: newToken(), kind: 'WORK', workerId: w.id, siteId: site.id, refId: entry.id, created: nowIso(), expires: addMinutesIso(ttlMin), usedAt: '', createdBy: u.id, openedAt: '', deviceId: '', cancelledAt: '' });
      DB.insert('WorkShares', { entryId: entry.id, workerId: w.id, share: num(s.share), confirmedAt: '', token: tok.token });
      return { workerId: w.id, name: w.name, phone: w.phone, lang: w.lang || 'az', token: tok.token, share: num(s.share) };
    });
    return { entry, links };
  },

  /** Təsdiq linklərini yenidən göndərmək: aktiv link varsa həmin link, vaxtı keçibsə yenisi. */
  workLinks(b, u) {
    const entry = DB.find('WorkEntries', 'id', b.entryId); if (!entry) fail('not_found');
    if (u.role !== 'admin' && entry.foremanId !== u.id) fail('forbidden');
    if (entry.status !== 'USTA_PENDING') fail('link_used');
    const now = nowIso();
    return DB.all('WorkShares').filter(s => s.entryId === entry.id && !s.confirmedAt).map(s => {
      const w = DB.find('Workers', 'id', s.workerId) || {};
      const cur = DB.find('Tokens', 'token', s.token);
      if (cur && !cur.usedAt && !cur.cancelledAt && cur.expires > now) return { workerId: s.workerId, name: w.name, phone: w.phone, lang: w.lang || 'az', token: cur.token, share: num(s.share), reused: true };
      const tok = DB.insert('Tokens', { token: newToken(), kind: 'WORK', workerId: s.workerId, siteId: entry.siteId, refId: entry.id, created: now, expires: addMinutesIso((num(settings().workLinkHours) || 24) * 60), usedAt: '', createdBy: u.id, openedAt: '', deviceId: '', cancelledAt: '' });
      DB.update('WorkShares', s, { token: tok.token });
      return { workerId: s.workerId, name: w.name, phone: w.phone, lang: w.lang || 'az', token: tok.token, share: num(s.share) };
    });
  },

  /** Avans sorğusu; geri qaytarılmış avansı düzəltmək (b.id). */
  requestAdvance(b, u) {
    const w = DB.find('Workers', 'id', b.workerId); if (!w) fail('not_found');
    if (!ownsWorker(u, w)) fail('forbidden');
    const amount = round2(b.amount);
    if (!(amount > 0)) fail('bad_amount');
    const month = todayStr().slice(0, 7);
    const st = settings();
    const plan = num((DB.find('PlanDays', 'month', month) || {}).days) || 22;
    const monthly = w.payType === 'DAY' ? num(w.baseAmount) * plan : num(w.baseAmount);
    const limit = round2(monthly * num(st.advanceLimitPct) / 100);
    const used = DB.all('Advances').filter(a => a.workerId === w.id && a.id !== b.id && monthOf(a.created) === month && ADV_LIMIT.indexOf(a.status) >= 0).reduce((s, a) => s + num(a.amount), 0);
    const over = limit > 0 ? used + amount > limit : w.payModel !== 'BONUS';
    if (b.id) {
      const a = DB.find('Advances', 'id', b.id); if (!a) fail('not_found');
      if (a.status !== 'RETURNED') fail('bad_status');
      upd(u, 'Advances', a, { amount, reason: String(b.reason || '').slice(0, 200), status: 'PENDING', overLimit: over ? 'yes' : '', returnReason: '', confirmedAmount: '', confirmedAt: '' }, 'fix');
      return Object.assign({}, a, { limit, used: round2(used) });
    }
    const row = DB.insert('Advances', { id: uid('V'), workerId: w.id, amount, reason: String(b.reason || '').slice(0, 200), status: 'PENDING', foremanId: w.foremanId, created: nowIso(), approvedAt: '', receiptNo: '', rejectReason: '', givenAt: '', overLimit: over ? 'yes' : '', confirmedAmount: '', confirmedAt: '', returnReason: '', linkCount: 0, closedAt: '', resolution: '' });
    audit(u, 'Advances', row.id, 'request', { amount, limit, used });
    return Object.assign({}, row, { limit, used: round2(used) });
  },

  /** Sahə rəisi pulu ustaya verdi ("Verdim") — link yalnız bundan sonra (S-15). */
  markAdvance(b, u) {
    const a = DB.find('Advances', 'id', b.id); if (!a) fail('not_found');
    if (u.role !== 'admin' && a.foremanId !== u.id) fail('forbidden');
    if (b.status === 'GIVEN' && a.status === 'APPROVED') upd(u, 'Advances', a, { status: 'GIVEN', givenAt: nowIso() }, 'given');
    else fail('bad_status');
    return a;
  },

  /** Pul linki: admin və ya həmin usta/obyektə bağlı sahə rəisi göndərir (S-20, S-21, BR-66). */
  moneyLink(b, u) {
    if (b.kind === 'ADV') {
      const a = DB.find('Advances', 'id', b.id); if (!a) fail('not_found');
      const w = DB.find('Workers', 'id', a.workerId) || {};
      if (!ownsWorker(u, w)) fail('forbidden');
      if (['GIVEN', 'LINK_SENT', 'LINK_EXPIRED'].indexOf(a.status) < 0) fail('bad_status');
      if (!w.phone) fail('no_phone');
      const r = moneyLinkFor(u, 'ADV', a);
      if (!r.reused) upd(u, 'Advances', a, { status: 'LINK_SENT', linkCount: num(a.linkCount) + 1 }, 'link');
      return Object.assign(r, { phone: w.phone, name: w.name, lang: w.lang || 'az', linkCount: num(a.linkCount) });
    }
    if (b.kind === 'PAY') {
      const p = DB.find('CustomerPayments', 'id', b.id); if (!p) fail('not_found');
      const site = DB.find('Sites', 'id', p.siteId) || {};
      if (!ownsSite(u, site)) fail('forbidden');
      if (['APPROVED', 'LINK_SENT', 'LINK_EXPIRED'].indexOf(p.status) < 0) fail('bad_status');
      const c = DB.find('Customers', 'id', site.customerId) || {};
      if (!c.phone) fail('no_phone');
      const r = moneyLinkFor(u, 'PAY', p);
      if (!r.reused) upd(u, 'CustomerPayments', p, { status: 'LINK_SENT', linkCount: num(p.linkCount) + 1 }, 'link');
      return Object.assign(r, { phone: c.phone, name: c.name, lang: c.lang || 'az', linkCount: num(p.linkCount) });
    }
    fail('bad_kind');
  },

  /** Müştəridən alınan pul (BR-40). Sahə rəisinin yazdığı admin təsdiqinə gedir. */
  addPayment(b, u) {
    const p = b.payment || {};
    const site = DB.find('Sites', 'id', p.siteId);
    if (!site || !(num(p.amount) > 0)) fail('required');
    if (!ownsSite(u, site)) fail('forbidden');
    const admin = u.role === 'admin';
    const date = dateOf(p.date || todayStr());
    const method = ['CASH', 'TRANSFER'].indexOf(p.method) >= 0 ? p.method : 'CASH';
    if (p.id) {
      const row = DB.find('CustomerPayments', 'id', p.id); if (!row) fail('not_found');
      if (row.status !== 'RETURNED' && !(admin && row.status === 'PENDING')) fail('bad_status');
      upd(u, 'CustomerPayments', row, { amount: round2(p.amount), date, method, note: String(p.note || '').slice(0, 200), status: 'PENDING', returnReason: '', confirmedAmount: '', confirmedAt: '' }, 'fix');
      return row;
    }
    const row = DB.insert('CustomerPayments', {
      id: uid('P'), siteId: site.id, date, amount: round2(p.amount), note: String(p.note || '').slice(0, 200), method,
      status: admin ? 'APPROVED' : 'PENDING', foremanId: site.foremanId, created: nowIso(), approvedBy: admin ? u.id : '', approvedAt: admin ? nowIso() : '',
      confirmedAmount: '', confirmedAt: '', returnReason: '', receiptNo: admin ? nextReceiptNo('CustomerPayments', 'MQ') : '', linkCount: 0, closedNote: '', by: u.id
    });
    audit(u, 'CustomerPayments', row.id, 'create', { siteId: site.id, amount: row.amount });
    return row;
  },

  /** Xərc (BR-43). Sahə rəisinin xərci admin təsdiqindən keçir; adminin xərci dərhal təsdiqlidir. */
  saveExpense(b, u) {
    const x = b.expense || {};
    const site = DB.find('Sites', 'id', x.siteId);
    if (!site || !(num(x.amount) > 0) || !String(x.category || '').trim()) fail('required');
    if (!ownsSite(u, site)) fail('forbidden');
    const admin = u.role === 'admin';
    const date = dateOf(x.date || todayStr());
    assertOpen(date);
    const photos = uploadPhotos(b.photos, 'xerc_' + date + '_' + site.id, 3);
    if (x.id) {
      const row = DB.find('Expenses', 'id', x.id); if (!row) fail('not_found');
      if (!admin && (row.by !== u.id || ['RETURNED', 'PENDING'].indexOf(row.status) < 0)) fail('bad_status');
      const keep = String(row.photos || '').split(' ').filter(Boolean);
      upd(u, 'Expenses', row, { siteId: site.id, category: String(x.category).slice(0, 60), amount: round2(x.amount), date, note: String(x.note || '').slice(0, 200), photos: keep.concat(photos).slice(-3).join(' '), status: admin ? 'APPROVED' : 'PENDING', returnReason: '' }, 'fix');
      return row;
    }
    const row = DB.insert('Expenses', { id: uid('X'), siteId: site.id, category: String(x.category).slice(0, 60), amount: round2(x.amount), date, note: String(x.note || '').slice(0, 200), photos: photos.join(' '), status: admin ? 'APPROVED' : 'PENDING', by: u.id, created: nowIso(), approvedBy: admin ? u.id : '', approvedAt: admin ? nowIso() : '', returnReason: '' });
    audit(u, 'Expenses', row.id, 'create', { siteId: site.id, amount: row.amount, category: row.category });
    return row;
  },

  interim(b, u) {
    const w = DB.find('Workers', 'id', b.workerId); if (!w) fail('not_found');
    if (!ownsWorker(u, w)) fail('forbidden');
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
/** Ayın bağlanmasına mane olan sənədlər (BR-53, BR-64). */
function monthBlockers(month) {
  const out = [];
  const inMonth = s => monthOf(s) === month;
  DB.all('WorkEntries').forEach(e => { if (inMonth(e.date) && ['USTA_PENDING', 'ADMIN_PENDING', 'RETURNED'].indexOf(e.status) >= 0) out.push({ type: 'work', id: e.id, status: e.status, date: e.date, siteId: e.siteId }); });
  DB.all('Attendance').forEach(a => { if (inMonth(a.date) && ['PENDING', 'RETURNED'].indexOf(a.status) >= 0) out.push({ type: 'att', id: a.id, status: a.status, date: a.date, workerId: a.workerId }); });
  DB.all('Advances').forEach(a => { if (inMonth(a.approvedAt || a.created) && ['CLOSED', 'SIGNED', 'REJECTED'].indexOf(a.status) < 0) out.push({ type: 'adv', id: a.id, status: a.status, date: dateOf(a.created), workerId: a.workerId, amount: num(a.amount) }); });
  DB.all('CustomerPayments').forEach(p => { if (inMonth(p.date) && ['CLOSED', 'REJECTED'].indexOf(p.status) < 0) out.push({ type: 'pay', id: p.id, status: p.status, date: p.date, siteId: p.siteId, amount: num(p.amount) }); });
  DB.all('Expenses').forEach(x => { if (inMonth(x.date) && ['PENDING', 'RETURNED'].indexOf(x.status) >= 0) out.push({ type: 'exp', id: x.id, status: x.status, date: x.date, siteId: x.siteId, amount: num(x.amount) }); });
  return out;
}

/** Təsdiq mərkəzi: Təsdiq, Geri qaytar (səbəb məcburi), Rədd et (son) — BR-42. */
function decideItem(b, u) {
  const type = b.type, decision = b.decision, reason = reasonOf(b);
  if (['approve', 'return', 'reject'].indexOf(decision) < 0) fail('bad_status');
  if (decision !== 'approve' && !reason) fail('reason_required');
  const now = nowIso();
  if (type === 'site') {
    const s = DB.find('Sites', 'id', b.id); if (!s) fail('not_found');
    if (decision === 'approve') upd(u, 'Sites', s, { status: 'APPROVED', approvedBy: u.id, approvedAt: now, returnReason: '' }, 'approve');
    else upd(u, 'Sites', s, { status: decision === 'return' ? 'RETURNED' : 'REJECTED', returnReason: reason }, decision, { reason });
    return s;
  }
  if (type === 'work') {
    const e = DB.find('WorkEntries', 'id', b.id); if (!e) fail('not_found');
    assertOpen(e.date);
    if (decision === 'approve') {
      if (e.status !== 'ADMIN_PENDING' && !(b.force && e.status === 'USTA_PENDING')) fail('not_ready');
      upd(u, 'WorkEntries', e, { status: 'APPROVED', approvedBy: u.id, approvedAt: now, returnReason: '' }, b.force ? 'approve_direct' : 'approve');
    } else {
      if (['APPROVED', 'REJECTED'].indexOf(e.status) >= 0) fail('bad_status');
      upd(u, 'WorkEntries', e, { status: decision === 'return' ? 'RETURNED' : 'REJECTED', returnReason: reason }, decision, { reason });
      cancelTokens('WORK', e.id);
    }
    return e;
  }
  if (type === 'adv') {
    const a = DB.find('Advances', 'id', b.id); if (!a) fail('not_found');
    if (decision === 'approve') {
      if (a.status !== 'PENDING') fail('bad_status');
      upd(u, 'Advances', a, { status: 'APPROVED', approvedAt: now, receiptNo: a.receiptNo || nextReceiptNo('Advances', 'AV'), returnReason: '' }, 'approve');
    } else if (decision === 'return') {
      if (a.status !== 'PENDING') fail('bad_status');
      upd(u, 'Advances', a, { status: 'RETURNED', returnReason: reason }, 'return', { reason });
    } else {
      if (['CLOSED', 'SIGNED', 'REJECTED'].indexOf(a.status) >= 0) fail('bad_status');
      upd(u, 'Advances', a, { status: 'REJECTED', rejectReason: reason }, 'reject', { reason });
      cancelTokens('ADV', a.id);
    }
    return a;
  }
  if (type === 'pay') {
    const p = DB.find('CustomerPayments', 'id', b.id); if (!p) fail('not_found');
    if (decision === 'approve') {
      if (p.status !== 'PENDING') fail('bad_status');
      upd(u, 'CustomerPayments', p, { status: 'APPROVED', approvedBy: u.id, approvedAt: now, receiptNo: p.receiptNo || nextReceiptNo('CustomerPayments', 'MQ'), returnReason: '' }, 'approve');
    } else if (decision === 'return') {
      if (p.status !== 'PENDING') fail('bad_status');
      upd(u, 'CustomerPayments', p, { status: 'RETURNED', returnReason: reason }, 'return', { reason });
    } else {
      if (['CLOSED', 'REJECTED'].indexOf(p.status) >= 0) fail('bad_status');
      upd(u, 'CustomerPayments', p, { status: 'REJECTED', returnReason: reason }, 'reject', { reason });
      cancelTokens('PAY', p.id);
    }
    return p;
  }
  if (type === 'exp') {
    const x = DB.find('Expenses', 'id', b.id); if (!x) fail('not_found');
    if (x.status !== 'PENDING') fail('bad_status');
    assertOpen(x.date);
    if (decision === 'approve') upd(u, 'Expenses', x, { status: 'APPROVED', approvedBy: u.id, approvedAt: now, returnReason: '' }, 'approve');
    else upd(u, 'Expenses', x, { status: decision === 'return' ? 'RETURNED' : 'REJECTED', returnReason: reason }, decision, { reason });
    return x;
  }
  if (type === 'att') {
    const a = DB.find('Attendance', 'id', b.id); if (!a) fail('not_found');
    if (a.status !== 'PENDING') fail('bad_status');
    assertOpen(a.date);
    if (decision === 'approve') upd(u, 'Attendance', a, { status: 'OK', returnReason: '' }, 'approve');
    else upd(u, 'Attendance', a, { status: decision === 'return' ? 'RETURNED' : 'REJECTED', returnReason: reason }, decision, { reason });
    return a;
  }
  if (type === 'cphone') {
    const c = DB.find('Customers', 'id', b.id); if (!c || !c.pendingPhone) fail('not_found');
    if (decision === 'approve') upd(u, 'Customers', c, { phone: c.pendingPhone, pendingPhone: '' }, 'approve_phone');
    else upd(u, 'Customers', c, { pendingPhone: '' }, 'reject_phone', { reason });
    return c;
  }
  fail('bad_kind');
}

const ADMIN = {
  saveForeman(b, u) {
    const f = b.foreman || {};
    if (!String(f.name || '').trim() || !cleanPhone(f.phone)) fail('required');
    const users = DB.all('Users');
    if (users.some(x => x.phone === cleanPhone(f.phone) && x.id !== f.id && x.status !== 'deleted')) fail('phone_taken');
    const patch = { name: f.name, phone: cleanPhone(f.phone), lang: ['az', 'ru', 'en', 'tr'].indexOf(f.lang) >= 0 ? f.lang : 'az', status: f.status || 'active', payType: f.payType || 'MONTH', payModel: f.payModel || 'STD', baseAmount: num(f.baseAmount), bonusPercent: num(f.bonusPercent) };
    const pw = f.password || '';
    if (pw && !validPassword(pw)) fail('weak_password');
    if (f.id) {
      const row = DB.find('Users', 'id', f.id); if (!row || row.role !== 'foreman') fail('not_found');
      // Admin şifrəni sıfırlayanda istifadəçi ilk girişdə yeni şifrə yaradır.
      if (pw) Object.assign(patch, { pwHash: hashPw(row.id, pw), pinHash: '', mustChange: 'yes', failCount: '', lockedUntil: '' });
      upd(u, 'Users', row, patch, pw ? 'reset_password' : 'update');
      if (pw || patch.status !== 'active') closeSessionsOf(row.id, null);
      return { id: row.id };
    }
    const active = users.filter(x => x.role === 'foreman' && x.status === 'active').length;
    if (active >= num(settings().maxForemen)) fail('limit_foremen');
    if (!pw) fail('weak_password');
    const id = uid('U');
    DB.insert('Users', Object.assign({ id, role: 'foreman', created: nowIso(), pwHash: hashPw(id, pw), mustChange: 'yes' }, patch));
    audit(u, 'Users', id, 'create', { name: f.name });
    return { id };
  },

  unlockUser(b, u) {
    const row = DB.find('Users', 'id', b.id); if (!row) fail('not_found');
    upd(u, 'Users', row, { failCount: '', lockedUntil: '' }, 'unlock');
    return true;
  },

  closeSessions(b, u) {
    const row = DB.find('Users', 'id', b.id); if (!row) fail('not_found');
    closeSessionsOf(row.id, row.id === u.id ? u._session : null);
    audit(u, 'Sessions', row.id, 'close_sessions');
    return true;
  },

  saveWorker(b, u) {
    const w = b.worker || {};
    if (!String(w.name || '').trim() || !cleanPhone(w.phone) || !w.foremanId) fail('required');
    const st = settings();
    const patch = {
      name: w.name, phone: cleanPhone(w.phone), foremanId: w.foremanId, specialty: w.specialty || '', grade: w.grade || 'master',
      payType: w.payType === 'DAY' ? 'DAY' : 'MONTH', baseAmount: num(w.baseAmount), payModel: w.payModel || 'STD',
      startTime: w.startTime || '09:00', endTime: w.endTime || '18:00',
      lang: ['az', 'ru', 'en', 'tr'].indexOf(w.lang) >= 0 ? w.lang : 'az', status: w.status || 'active'
    };
    const inForeman = DB.all('Workers').filter(x => x.foremanId === patch.foremanId && x.status === 'active' && x.id !== w.id).length;
    if (patch.status === 'active' && inForeman >= num(st.maxWorkersPerForeman)) fail('limit_workers');
    if (w.id) {
      const row = DB.find('Workers', 'id', w.id); if (!row) fail('not_found');
      ['foremanId', 'payType', 'baseAmount', 'payModel', 'grade', 'phone'].forEach(k => {
        if (String(row[k]) !== String(patch[k])) DB.insert('WorkerHistory', { ts: nowIso(), workerId: row.id, field: k, oldValue: row[k], newValue: patch[k], by: u.id });
      });
      upd(u, 'Workers', row, patch);
      return { id: row.id };
    }
    const row = DB.insert('Workers', Object.assign({ id: uid('W'), created: nowIso(), bonusBase: '', norm: '' }, patch));
    audit(u, 'Workers', row.id, 'create', patch);
    return { id: row.id };
  },

  decide(b, u) { return decideItem(b, u); },
  // v0.2 uyğunluğu
  approveSite(b, u) { return decideItem({ type: 'site', id: b.id, decision: b.ok ? 'approve' : (b.decision || 'reject'), reason: b.reason || '-' }, u); },
  approveWork(b, u) { return decideItem({ type: 'work', id: b.id, decision: b.ok ? 'approve' : (b.decision || 'return'), reason: b.reason || '-', force: b.force }, u); },
  approveAdvance(b, u) { return decideItem({ type: 'adv', id: b.id, decision: b.ok ? 'approve' : (b.decision || 'reject'), reason: b.reason || '-' }, u); },
  approveAttendance(b, u) { return decideItem({ type: 'att', id: b.id, decision: b.ok ? 'approve' : (b.decision || 'reject'), reason: b.reason || '-' }, u); },

  /** Konflikt (BR-39, S-17): sahə rəisinə qaytar, təsdiqləyənin məbləğini qəbul et, ləğv et. */
  resolveConflict(b, u) {
    const sheet = b.type === 'pay' ? 'CustomerPayments' : 'Advances';
    const r = DB.find(sheet, 'id', b.id); if (!r) fail('not_found');
    if (r.status !== 'CONFLICT') fail('bad_status');
    const reason = reasonOf(b); if (!reason) fail('reason_required');
    const now = nowIso();
    if (b.op === 'return') upd(u, sheet, r, { status: 'RETURNED', returnReason: reason }, 'conflict_return', { reason });
    else if (b.op === 'accept') upd(u, sheet, r, { status: 'CLOSED', amount: r.confirmedAmount, closedAt: now, resolution: 'accepted: ' + r.amount + ' → ' + r.confirmedAmount + ' · ' + reason }, 'conflict_accept', { reason });
    else if (b.op === 'cancel') upd(u, sheet, r, { status: 'REJECTED', resolution: 'cancelled · ' + reason, rejectReason: reason }, 'conflict_cancel', { reason });
    else fail('bad_status');
    return r;
  },

  /** Müştərinin telefonu yoxdursa, admin ödənişi səbəblə əl ilə bağlayır (BR-65). */
  closePaymentManual(b, u) {
    const p = DB.find('CustomerPayments', 'id', b.id); if (!p) fail('not_found');
    if (['APPROVED', 'LINK_SENT', 'LINK_EXPIRED'].indexOf(p.status) < 0) fail('bad_status');
    const reason = reasonOf(b); if (!reason) fail('reason_required');
    cancelTokens('PAY', p.id);
    upd(u, 'CustomerPayments', p, { status: 'CLOSED', confirmedAmount: p.amount, confirmedAt: nowIso(), closedNote: 'manual: ' + reason }, 'close_manual', { reason });
    return p;
  },

  saveWorkType(b, u) {
    const t = b.workType || {};
    if (!String(t.name || '').trim()) fail('required');
    const normType = ['MONTH', 'DAY'].indexOf(t.normType) >= 0 ? t.normType : '';
    const patch = { name: t.name, unit: t.unit || 'm²', normType, normQty: normType ? num(t.normQty) : '', active: t.active === 'no' ? 'no' : 'yes' };
    if (t.id) { const row = DB.find('WorkTypes', 'id', t.id); if (!row) fail('not_found'); upd(u, 'WorkTypes', row, patch); return row; }
    const row = DB.insert('WorkTypes', Object.assign({ id: uid('T'), bonusType: 'AZN', rateHelper: 0, rateMaster: 0, rateSenior: 0, percent: 0 }, patch)); audit(u, 'WorkTypes', row.id, 'create', patch); return row;
  },

  saveEstimate(b, u) {
    const e = b.estimate || {};
    if (!e.siteId || !e.workTypeId) fail('required');
    const existing = DB.all('Estimates').find(x => x.siteId === e.siteId && x.workTypeId === e.workTypeId);
    const patch = { siteId: e.siteId, workTypeId: e.workTypeId, planQty: num(e.planQty), clientPrice: num(e.clientPrice) };
    if (existing) { upd(u, 'Estimates', existing, patch); return existing; }
    const row = DB.insert('Estimates', Object.assign({ id: uid('M') }, patch)); audit(u, 'Estimates', row.id, 'create', patch); return row;
  },

  addDeduction(b, u) {
    const d = b.deduction || {};
    if (!d.workerId || !num(d.amount)) fail('required');
    const date = dateOf(d.date || todayStr());
    assertOpen(date);
    const type = ['PENALTY', 'CORRECTION', 'OTHER'].indexOf(d.type) >= 0 ? d.type : 'PENALTY';
    const row = DB.insert('Deductions', { id: uid('D'), workerId: d.workerId, type, amount: round2(d.amount), reason: String(d.reason || '').slice(0, 200), date, by: u.id, category: String(d.category || '').slice(0, 60) });
    audit(u, 'Deductions', row.id, 'create', d); return row;
  },

  setPlanDays(b, u) {
    const month = String(b.month || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month) || !(num(b.days) > 0 && num(b.days) <= 31)) fail('bad_days');
    if (isClosed(month)) fail('period_closed');
    const row = DB.find('PlanDays', 'month', month);
    if (row) upd(u, 'PlanDays', row, { days: num(b.days), by: u.id, at: nowIso() });
    else { DB.insert('PlanDays', { month, days: num(b.days), by: u.id, at: nowIso() }); audit(u, 'PlanDays', month, 'set', { days: b.days }); }
    return true;
  },

  calcPayroll(b) {
    const month = String(b.month || todayStr().slice(0, 7)).slice(0, 7);
    if (isClosed(month)) {
      const p = DB.find('Periods', 'month', month) || {};
      return { month, closed: true, archiveUrl: p.archiveUrl || '', planDays: num((DB.find('PlanDays', 'month', month) || {}).days), lines: DB.all('Payroll').filter(x => x.month === month).map(x => { const c = Object.assign({}, x); delete c._row; return c; }) };
    }
    const res = computePayroll(payrollInput(month));
    res.closed = false;
    return res;
  },

  monthBlockers(b) { return monthBlockers(String(b.month || '').slice(0, 7)); },

  closePeriod(b, u) {
    const month = String(b.month || '').slice(0, 7);
    if (isClosed(month)) fail('period_closed');
    if (!DB.find('PlanDays', 'month', month)) fail('no_plan_days');
    const blockers = monthBlockers(month);
    if (blockers.length) return { ok: false, blockers };
    const data = payrollInput(month);
    const res = computePayroll(data);
    res.lines.forEach(l => DB.insert('Payroll', Object.assign({}, l, { paid: '', paidAt: '' })));
    // Obyektlərin usta xərci ay bağlananda saxlanır — obyekt nəticəsi üçün (BR-44).
    const split = splitCostBySite(res.lines, data.attendance, data.entries, data.shares, month);
    DB.all('SiteCosts').filter(x => x.month === month).sort((a, c) => c._row - a._row).forEach(x => DB.remove('SiteCosts', x));
    Object.keys(split.labor).forEach(s => DB.insert('SiteCosts', { month, siteId: s, labor: split.labor[s], bonus: split.bonus[s] || 0, by: u.id, at: nowIso() }));
    let archiveUrl = '';
    try { archiveUrl = makeBackup('arxiv ' + month).url; } catch (e) { archiveUrl = ''; }
    const p = DB.find('Periods', 'month', month);
    if (p) DB.update('Periods', p, { status: 'CLOSED', closedAt: nowIso(), by: u.id, archiveUrl });
    else DB.insert('Periods', { month, status: 'CLOSED', closedAt: nowIso(), by: u.id, archiveUrl });
    audit(u, 'Periods', month, 'close', { lines: res.lines.length });
    return { ok: true, month, lines: res.lines.length, archiveUrl };
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
    const before = settings(), ch = {};
    Object.keys(s).forEach(k => {
      if (allowed.indexOf(k) < 0) return;
      if (k === 'companyVoen' && s[k] && !/^\d{10}$/.test(String(s[k]).replace(/\s/g, ''))) fail('bad_voen');
      if (String(before[k]) !== String(s[k])) ch[k] = [before[k], s[k]];
      const row = DB.find('Settings', 'key', k);
      if (row) DB.update('Settings', row, { value: s[k] }); else DB.insert('Settings', { key: k, value: s[k] });
    });
    audit(u, 'Settings', '-', 'update', { ch });
    return settings();
  },

  deleteWorker(b, u) {
    const row = DB.find('Workers', 'id', b.id); if (!row) fail('not_found');
    upd(u, 'Workers', row, { status: 'inactive' }, 'deactivate');
    return true;
  },

  /** Obyekt nəticəsi (BR-44): alınan pul, xərclər, usta xərci, görülən iş, mənfəət/zərər, marja. */
  siteResult(b) {
    const month = b.month ? String(b.month).slice(0, 7) : '';
    const inM = d => !month || monthOf(d) === month;
    const est = {}; DB.all('Estimates').forEach(x => { est[x.siteId + '|' + x.workTypeId] = num(x.clientPrice); });
    const rows = {};
    const R = id => rows[id] || (rows[id] = { siteId: id, received: 0, expenses: 0, labor: 0, bonus: 0, workValue: 0, expByCat: {}, openMoney: 0 });
    DB.all('Sites').forEach(s => R(s.id));
    DB.all('CustomerPayments').forEach(p => {
      if (!inM(p.date)) return;
      if (p.status === 'CLOSED') R(p.siteId).received += num(p.amount);
      else if (p.status !== 'REJECTED') R(p.siteId).openMoney += num(p.amount);
    });
    DB.all('Expenses').forEach(x => { if (x.status === 'APPROVED' && inM(x.date)) { const r = R(x.siteId); r.expenses += num(x.amount); r.expByCat[x.category] = (r.expByCat[x.category] || 0) + num(x.amount); } });
    DB.all('WorkEntries').forEach(e => { if (e.status === 'APPROVED' && inM(e.date)) R(e.siteId).workValue += num(e.qty) * (est[e.siteId + '|' + e.workTypeId] || 0); });
    // Usta xərci: bağlı aylar — saxlanmış; açıq aylar — hesablanır.
    const closedM = {}; DB.all('Periods').forEach(p => { if (p.status === 'CLOSED') closedM[p.month] = 1; });
    DB.all('SiteCosts').forEach(c => { if (closedM[c.month] && (!month || c.month === month)) { R(c.siteId).labor += num(c.labor); R(c.siteId).bonus += num(c.bonus); } });
    const openMonths = {};
    if (month) { if (!closedM[month]) openMonths[month] = 1; }
    else {
      DB.all('Attendance').forEach(a => { const m = monthOf(a.date); if (m && !closedM[m]) openMonths[m] = 1; });
      DB.all('WorkEntries').forEach(e => { const m = monthOf(e.date); if (m && !closedM[m] && e.status === 'APPROVED') openMonths[m] = 1; });
    }
    Object.keys(openMonths).sort().slice(-6).forEach(m => {
      const data = payrollInput(m);
      const res = computePayroll(data);
      const split = splitCostBySite(res.lines, data.attendance, data.entries, data.shares, m);
      Object.keys(split.labor).forEach(s => { R(s).labor += split.labor[s]; R(s).bonus += split.bonus[s] || 0; });
    });
    const sites = indexBy(DB.all('Sites'), 'id');
    return Object.keys(rows).map(id => {
      const r = rows[id], s = sites[id] || {};
      const cost = r.expenses + r.labor;
      const cash = r.received - cost, work = r.workValue - cost;
      return {
        siteId: id, name: s.name || '?', customerId: s.customerId, foremanId: s.foremanId, status: s.status,
        received: round2(r.received), expenses: round2(r.expenses), labor: round2(r.labor), bonus: round2(r.bonus), workValue: round2(r.workValue),
        cashResult: round2(cash), workResult: round2(work),
        cashMargin: r.received ? Math.round(cash / r.received * 1000) / 10 : null,
        workMargin: r.workValue ? Math.round(work / r.workValue * 1000) / 10 : null,
        debt: num(s.contractAmount) ? round2(num(s.contractAmount) - r.received) : null,
        openMoney: round2(r.openMoney),
        expByCat: Object.keys(r.expByCat).map(k => ({ category: k, amount: round2(r.expByCat[k]) }))
      };
    }).filter(r => r.received || r.expenses || r.labor || r.workValue || r.openMoney || sites[r.siteId] && sites[r.siteId].status === 'APPROVED')
      .sort((a, c) => a.cashResult - c.cashResult);
  },

  /** Jurnal (BR-46): filtr — istifadəçi, tarix, əməliyyat, mətn. */
  auditLog(b) {
    DB.load(['AuditLog']);
    const from = String(b.from || daysAgo(7)), to = String(b.to || todayStr()) + 'T99';
    const q = String(b.q || '').toLowerCase();
    let list = DB.all('AuditLog').filter(r => String(r.ts) >= from && String(r.ts) <= to);
    if (b.userId) list = list.filter(r => r.userId === b.userId);
    if (b.act) list = list.filter(r => String(r.action).indexOf(b.act) === 0);
    if (q) list = list.filter(r => (r.sheet + ' ' + r.rowId + ' ' + r.action + ' ' + r.details).toLowerCase().indexOf(q) >= 0);
    const total = list.length;
    list = list.slice(-400).reverse().map(r => ({ ts: r.ts, userId: r.userId, sheet: r.sheet, rowId: r.rowId, action: r.action, details: r.details }));
    const users = DB.all('Users').map(x => ({ id: x.id, name: x.name, role: x.role }));
    return { total, rows: list, users };
  },

  /** Linklərin statusu (BR-55) və şübhəli cəhdlər (S-50). */
  links(b) {
    DB.load(['Tokens', 'LinkAttempts', 'Workers', 'Sites']);
    const now = nowIso(), from = daysAgo(num(b.days) || 7);
    const rows = DB.all('Tokens').filter(t => String(t.created).slice(0, 10) >= from).map(t => ({ token: String(t.token).slice(0, 8), kind: t.kind, workerId: t.workerId, siteId: t.siteId, refId: t.refId, created: t.created, expires: t.expires, openedAt: t.openedAt, usedAt: t.usedAt, createdBy: t.createdBy, status: linkStatus(t, now) })).reverse().slice(0, 500);
    const attempts = DB.all('LinkAttempts').filter(a => String(a.ts).slice(0, 10) >= from).map(a => { const c = Object.assign({}, a); delete c._row; return c; }).reverse();
    return { rows, attempts };
  },

  system() {
    const props = PropertiesService.getScriptProperties();
    const now = nowIso();
    return {
      version: VERSION,
      lastBackup: props.getProperty('LAST_BACKUP') || '', lastBackupUrl: props.getProperty('LAST_BACKUP_URL') || '',
      lastMail: props.getProperty('LAST_MAIL') || '',
      locked: DB.all('Users').filter(x => x.lockedUntil && x.lockedUntil > now).map(x => ({ id: x.id, name: x.name, until: x.lockedUntil })),
      sessions: DB.all('Sessions').filter(s => s.expires > now).length
    };
  },

  backupNow(b, u) {
    const r = makeBackup('əl ilə');
    audit(u, '-', '-', 'backup', { name: r.name });
    return r;
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
  module.exports = { computePayroll, attendanceSummary, distanceM, normBonus, splitCostByForeman, splitCostBySite, round2, minutesOf, validPassword, safeCell, dayFraction };
}
