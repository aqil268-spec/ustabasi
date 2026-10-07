// Node test: node test/payroll.test.js — BRD v0.3 bölmə 6
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'server', 'Code.gs'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(src, { module: mod, console, Math, Number, String, Object, Array, JSON, isFinite, RegExp });
const { computePayroll, distanceM, validPassword, safeCell, splitCostBySite } = mod.exports;

const M = '2026-10';
function days(workerId, siteId, n, opts) {
  const o = opts || {}, out = [];
  for (let d = 1; d <= n; d++) {
    const date = M + '-' + String(d).padStart(2, '0');
    out.push({ workerId, siteId, kind: 'IN', date, ts: date + 'T' + (o.inTime || '09:00') + ':00', status: 'OK', diffMin: o.inDiff !== undefined && d === 1 ? o.inDiff : 0 });
    if (o.missingOutDay !== d) out.push({ workerId, siteId, kind: 'OUT', date, ts: date + 'T' + (o.outTime || '18:00') + ':00', status: 'OK', diffMin: 0 });
  }
  return out;
}
const sites = [{ id: 'S1', foremanId: 'F1' }, { id: 'S2', foremanId: 'F1' }];
const WT = [
  { id: 'T1', name: 'Kafel', unit: 'm²', normType: 'MONTH', normQty: 230 },
  { id: 'T2', name: 'Suvaq', unit: 'm²', normType: 'MONTH', normQty: 200 },
  { id: 'T3', name: 'Boya', unit: 'm²', normType: 'DAY', normQty: 20 },
  { id: 'T4', name: 'Plintus', unit: 'm', normType: '', normQty: '' }
];
const base = (over) => Object.assign({ month: M, settings: { lateToleranceMin: 15 }, foremen: [], workTypes: WT, sites, advances: [], deductions: [], planDays: [{ month: M, days: 22 }], entries: [], shares: [], attendance: [] }, over);

// --- Nümunə 1 (BRD v0.3): aylıq maaş, aylıq norma, 2 iş növü
{
  const w = { id: 'W1', name: 'Elvin', foremanId: 'F1', payType: 'MONTH', baseAmount: 800, payModel: 'STD_BONUS', status: 'active' };
  const res = computePayroll(base({
    workers: [w], attendance: days('W1', 'S1', 20),
    entries: [
      { id: 'E1', date: M + '-05', siteId: 'S1', workTypeId: 'T1', qty: 200, status: 'APPROVED' },
      { id: 'E2', date: M + '-08', siteId: 'S1', workTypeId: 'T1', qty: 140, status: 'APPROVED' },
      { id: 'E3', date: M + '-09', siteId: 'S1', workTypeId: 'T2', qty: 150, status: 'APPROVED' },
      { id: 'E4', date: M + '-10', siteId: 'S1', workTypeId: 'T4', qty: 999, status: 'APPROVED' }
    ],
    shares: [{ entryId: 'E1', workerId: 'W1', share: 100 }, { entryId: 'E2', workerId: 'W1', share: 100 }, { entryId: 'E3', workerId: 'W1', share: 100 }, { entryId: 'E4', workerId: 'W1', share: 100 }],
    advances: [{ workerId: 'W1', amount: 200, status: 'CLOSED', approvedAt: M + '-10T10:00:00' }, { workerId: 'W1', amount: 999, status: 'CONFLICT', approvedAt: M + '-11T10:00:00' }],
    deductions: [{ workerId: 'W1', type: 'PENALTY', amount: 20, date: M + '-12' }]
  }));
  const l = res.lines[0];
  assert.strictEqual(l.S, 727.27, 'S');
  assert.strictEqual(l.bonus, 382.61, 'bonus = 800 × (340−230)/230');
  assert.strictEqual(l.advance, 200, 'only closed advance');
  assert.strictEqual(l.total, 889.88, 'total');
  assert.strictEqual(l.detail.find(d => d.workTypeId === 'T1').pct, 47.83);
  assert.strictEqual(l.detail.find(d => d.workTypeId === 'T2').amount, 0, 'suvaq under norm');
  assert(!l.detail.find(d => d.workTypeId === 'T4'), 'no norm → no bonus');
  console.log('ok  nümunə 1 — ödəniləcək', l.total);
}

// --- Günlük norma: hər gün ayrıca; (baza / plan) × faiz
{
  const w = { id: 'W2', name: 'Fərid', foremanId: 'F1', payType: 'MONTH', baseAmount: 660, payModel: 'STD_BONUS', status: 'active' };
  const res = computePayroll(base({
    workers: [w], attendance: days('W2', 'S1', 3),
    entries: [
      { id: 'D1', date: M + '-01', siteId: 'S1', workTypeId: 'T3', qty: 30, status: 'APPROVED' },  // +50%
      { id: 'D2', date: M + '-02', siteId: 'S1', workTypeId: 'T3', qty: 10, status: 'APPROVED' },  // 0
      { id: 'D3', date: M + '-03', siteId: 'S2', workTypeId: 'T3', qty: 25, status: 'APPROVED' }   // +25%
    ],
    shares: [{ entryId: 'D1', workerId: 'W2', share: 100 }, { entryId: 'D2', workerId: 'W2', share: 100 }, { entryId: 'D3', workerId: 'W2', share: 100 }]
  }));
  const l = res.lines[0];
  assert.strictEqual(l.bonus, 22.5, '660/22 × (0.5 + 0.25)');
  assert.strictEqual(l.detail[0].overDays, 2);
  console.log('ok  günlük norma — bonus', l.bonus);
}

// --- Günlük maaşlı usta: baza = günlük × sayılan gün; pay bölgüsü; gözləyən iş
{
  const w = { id: 'W3', name: 'Samir', foremanId: 'F1', payType: 'DAY', baseAmount: 40, payModel: 'STD_BONUS', status: 'active' };
  const res = computePayroll(base({
    workers: [w], attendance: days('W3', 'S1', 10),
    entries: [
      { id: 'P1', date: M + '-03', siteId: 'S1', workTypeId: 'T2', qty: 500, status: 'APPROVED' },
      { id: 'P2', date: M + '-04', siteId: 'S1', workTypeId: 'T2', qty: 100, status: 'ADMIN_PENDING' }
    ],
    shares: [{ entryId: 'P1', workerId: 'W3', share: 50 }, { entryId: 'P2', workerId: 'W3', share: 100 }]
  }));
  const l = res.lines[0];
  assert.strictEqual(l.S, 400, '40 × 10');
  assert.strictEqual(l.bonus, 100, '(40×10) × (250−200)/200');
  assert.strictEqual(l.pendingBonus, 200, 'with pending: 400 × 150/200 = 300 → +200');
  console.log('ok  günlük maaş — bonus', l.bonus, 'gözləyir', l.pendingBonus);
}

// --- Limit (bonusCapPct) və sahə rəisi bonusu
{
  const w = { id: 'W4', name: 'Anar', foremanId: 'F1', payType: 'MONTH', baseAmount: 1000, payModel: 'BONUS', status: 'active' };
  const f = { id: 'F1', name: 'Rəşad', payType: 'MONTH', payModel: 'STD_BONUS', baseAmount: 1000, bonusPercent: 10, status: 'active' };
  const inp = base({
    settings: { lateToleranceMin: 15, bonusCapPct: 50 }, workers: [w], foremen: [f], attendance: days('W4', 'S1', 5),
    entries: [{ id: 'C1', date: M + '-02', siteId: 'S1', workTypeId: 'T1', qty: 460, status: 'APPROVED' }],
    shares: [{ entryId: 'C1', workerId: 'W4', share: 100 }]
  });
  const res = computePayroll(inp);
  const l = res.lines.find(x => x.personId === 'W4'), fl = res.lines.find(x => x.personId === 'F1');
  assert.strictEqual(l.S, 0, 'BONUS model: no standard part');
  assert.strictEqual(l.B, 1000, 'raw 100%'); assert.strictEqual(l.bonus, 500, 'capped at 50%');
  assert.strictEqual(fl.bonus, 50, 'foreman 10% of 500'); assert.strictEqual(fl.total, 1050);
  const split = splitCostBySite(res.lines, inp.attendance, inp.entries, inp.shares, M);
  assert.strictEqual(split.labor.S1, 550, 'site labor = worker bonus + foreman bonus');
  console.log('ok  limit və sahə rəisi bonusu; obyekt xərci', split.labor.S1);
}

// --- Gecikmə qaydası (BR-58)
{
  const w = { id: 'W5', name: 'Orxan', foremanId: 'F1', payType: 'DAY', baseAmount: 40, payModel: 'STD', status: 'active', startTime: '09:00', endTime: '18:00' };
  const att = days('W5', 'S1', 4, { inDiff: 60 });
  const full = computePayroll(base({ workers: [w], attendance: att })).lines[0];
  const half = computePayroll(base({ workers: [w], attendance: att, settings: { lateToleranceMin: 15, lateMode: 'HALF' } })).lines[0];
  assert.strictEqual(full.daysWorked, 4); assert.strictEqual(full.lateCount, 1);
  assert.strictEqual(half.daysWorked, 3.5); assert.strictEqual(half.S, 140);
  const att2 = days('W5', 'S1', 2, { inTime: '13:30' });
  const hour = computePayroll(base({ workers: [w], attendance: att2, settings: { lateToleranceMin: 15, lateMode: 'HOUR' } })).lines[0];
  assert.strictEqual(hour.daysWorked, 1, '2 × 4.5h/9h');
  console.log('ok  gecikmə: FULL', full.daysWorked, '· HALF', half.daysWorked, '· HOUR', hour.daysWorked);
}

// --- köməkçilər
assert.strictEqual(distanceM(40.4093, 49.8671, 40.4093, 49.8671), 0);
assert(validPassword('Şifrə#2026')); assert(!validPassword('sifre2026#')); assert(!validPassword('Ab#1'));
assert.strictEqual(safeCell('=SUM(A1)'), "'=SUM(A1)"); assert.strictEqual(safeCell('-5'), '-5'); assert.strictEqual(safeCell('+994501234567'), '+994501234567');
console.log('ok  şifrə qaydası, düstur qorunması');
console.log('\nHesablama testləri keçdi.');
