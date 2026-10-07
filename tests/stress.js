// Stress / capacity test: big data volumes (up to 2 years), timings per action, response size, Sheets cell usage.
// Usage: node stress.js [Code.gs]
const { load, est } = require('./fakegas');
const vm = require('vm');
const file = process.argv[2] || require('path').join(__dirname, '..', 'server', 'Code.gs');

const ONLY = process.env.ONLY;
const SCALES0 = [
  { key: 'Start', foremen: 2, workers: 20, months: 12 },
  { key: 'Biznes', foremen: 5, workers: 60, months: 24 },
  { key: 'Pro', foremen: 10, workers: 200, months: 24 }
];
const SCALES = ONLY ? SCALES0.filter(x => x.key === ONLY) : SCALES0;
const pad = x => String(x).padStart(2, '0');
const dayStr = n => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const out = [];

for (const sc of SCALES) {
  const { env, ctx, api, call } = load(file);
  api.setup();
  const SCHEMA = api.SCHEMA;
  const push = (sheet, obj) => { env.state.sheets[sheet].rows.push(SCHEMA[sheet].map(h => obj[h] === undefined ? '' : String(obj[h]))); };
  let L = call({ action: 'login', phone: '994500000000', password: 'Master#2026' }).j.data.token;
  call({ action: 'setPassword', token: L, newPassword: 'Admin#2026x' });
  const A = (action, p) => call(Object.assign({ action, token: L }, p)).j.data;
  A('saveSettings', { settings: { maxForemen: 50, maxWorkersPerForeman: 50 } });
  const foremen = [], workers = [], sites = [];
  for (let f = 0; f < sc.foremen; f++) foremen.push(A('saveForeman', { foreman: { name: 'Sahə rəisi ' + f, phone: '99450000' + (1000 + f), password: 'Temp#2026a', payModel: 'STD_BONUS', baseAmount: 1000, bonusPercent: 10 } }).id);
  const cust = A('saveCustomer', { customer: { name: 'Müştəri' } }).id;
  const sitesPer = Math.max(3, Math.round(sc.months / 2));
  for (let f = 0; f < sc.foremen; f++) for (let s = 0; s < sitesPer; s++) sites.push({ id: A('saveSite', { site: { customerId: cust, name: 'Obyekt ' + f + '-' + s, lat: 40.4 + f / 100, lng: 49.8 + s / 100, radius: 150, foremanId: foremen[f] } }).id, f });
  for (let i = 0; i < sc.workers; i++) workers.push({ id: A('saveWorker', { worker: { name: 'Usta ' + i, phone: '9945510' + (10000 + i), foremanId: foremen[i % sc.foremen], payType: i % 2 ? 'DAY' : 'MONTH', baseAmount: i % 2 ? 45 : 900, payModel: 'STD_BONUS' } }).id, f: i % sc.foremen });
  const wts = env.state.sheets.WorkTypes.rows.slice(1).map(r => r[0]);
  const days = sc.months * 30;
  const siteOf = f => sites.filter(s => s.f === f).slice(-3);
  // Attendance: only last 150 days stay in the main sheet (cleanup archives older ones)
  let k = 0;
  for (let d = Math.min(150, days); d >= 1; d--) { if (d % 7 === 0) continue; const date = dayStr(d); for (const w of workers) for (const kind of ['IN', 'OUT']) push('Attendance', { id: 'A' + (k++), workerId: w.id, siteId: siteOf(w.f)[0].id, kind, ts: date + (kind === 'IN' ? 'T09:01:00' : 'T18:02:00'), date, lat: 40.4, lng: 49.8, acc: 10, dist: 20, source: 'LINK', status: 'OK', diffMin: 1, by: w.id }); }
  // Work entries: 2 per foreman per working day, 2 workers per entry
  let e = 0;
  for (let d = days; d >= 1; d--) { if (d % 7 === 0) continue; const date = dayStr(d); for (let f = 0; f < sc.foremen; f++) for (let j = 0; j < 2; j++) { const id = 'E' + (e++); const ws = workers.filter(w => w.f === f); push('WorkEntries', { id, date, siteId: siteOf(f)[j % 3].id, workTypeId: wts[e % wts.length], qty: 20, status: 'APPROVED', foremanId: foremen[f], created: date + 'T10:00:00' }); push('WorkShares', { entryId: id, workerId: ws[e % ws.length].id, share: 50, confirmedAt: date + 'T11:00:00', token: 't' }); push('WorkShares', { entryId: id, workerId: ws[(e + 1) % ws.length].id, share: 50, confirmedAt: date + 'T11:00:00', token: 't' }); } }
  // Money: 2 advances/worker/month, 3 payments + 5 expenses per active site per month, payroll lines per month
  let v = 0;
  for (let m = sc.months; m >= 1; m--) {
    const date = dayStr(m * 30 - 5);
    for (const w of workers) for (let j = 0; j < 2; j++) push('Advances', { id: 'V' + (v++), workerId: w.id, amount: 50, status: 'CLOSED', foremanId: foremen[w.f], created: date + 'T10:00:00', confirmedAmount: 50, closedAt: date + 'T12:00:00', receiptNo: 'AV-' + v });
    for (let f = 0; f < sc.foremen; f++) for (const s of siteOf(f)) { for (let j = 0; j < 3; j++) push('CustomerPayments', { id: 'P' + (v++), siteId: s.id, date, amount: 1000, status: 'CLOSED', foremanId: foremen[f], created: date + 'T10:00:00', receiptNo: 'MQ-' + v }); for (let j = 0; j < 5; j++) push('Expenses', { id: 'X' + (v++), siteId: s.id, category: 'Material', amount: 80, date, status: 'APPROVED', by: foremen[f], created: date }); }
    const month = date.slice(0, 7);
    if (m > 1) { for (const w of workers) push('Payroll', { month, personType: 'WORKER', personId: w.id, name: 'Usta', S: 900, total: 900 }); push('Periods', { month, status: 'CLOSED', closedAt: date }); }
  }
  // Audit: 365 days × ~4 events per worker-day; tokens: 14 days × 3 per worker-day
  for (let d = Math.min(365, days); d >= 1; d--) { const date = dayStr(d); for (let i = 0; i < sc.workers * 4; i++) push('AuditLog', { ts: date + 'T10:00:00', userId: 'public', sheet: 'Attendance', rowId: 'A' + i, action: 'link_IN', details: '{"workerId":"W"}' }); }
  for (let d = 14; d >= 1; d--) { const date = dayStr(d); for (const w of workers) for (const kind of ['IN', 'OUT', 'WORK']) push('Tokens', { token: 'tk' + (k++), kind, workerId: w.id, siteId: siteOf(w.f)[0].id, created: date + 'T08:00:00', expires: date + 'T08:10:00', usedAt: date + 'T08:05:00', createdBy: foremen[w.f] }); }
  Object.keys(env.state.sheets).forEach(n => { env.state.sheets[n].max = Math.max(env.state.sheets[n].max, env.state.sheets[n].rows.length + 1000); });
  vm.runInContext('bumpAll()', ctx);

  // cells in use
  let cells = 0; const rowsBySheet = {};
  Object.keys(env.state.sheets).forEach(n => { const r = env.state.sheets[n].rows.length; rowsBySheet[n] = r; cells += r * (SCHEMA[n] ? SCHEMA[n].length : 2); });

  const fmTok = (() => { const t = call({ action: 'login', phone: '994500001000', password: 'Temp#2026a' }).j.data.token; call({ action: 'setPassword', token: t, newPassword: 'Real#2026a' }); return t; })();
  const month = dayStr(0).slice(0, 7);
  const rows = [];
  const measure = (name, body, times) => {
    for (let r = 0; r < (times || 2); r++) {
      const t0 = process.hrtime.bigint();
      const res = call(body, true);
      const cpu = Number(process.hrtime.bigint() - t0) / 1e6;
      rows.push({ name: name + (r ? ' (keşdən)' : ' (ilk)'), ok: res.j.ok, err: res.j.error || '', cpu: Math.round(cpu), svc: est(res.calls), kb: Math.round(res.bytes / 1024) });
    }
  };
  if (process.env.KEYS) { const bj = call({ action: 'bootstrap', token: L }).j.data; console.log('admin bootstrap KB by key:', JSON.stringify(Object.fromEntries(Object.keys(bj).map(k => [k, Math.round(JSON.stringify(bj[k]).length / 1024)])))); }
  measure('login', { action: 'login', phone: '994500001000', password: 'Real#2026a' }, 1);
  measure('bootstrap admin', { action: 'bootstrap', token: L });
  measure('bootstrap sahə rəisi', { action: 'bootstrap', token: fmTok });
  measure('calcPayroll (ay)', { action: 'calcPayroll', token: L, month });
  measure('siteResult (bütün dövr)', { action: 'siteResult', token: L, all: true });
  measure('report (ay)', { action: 'report', token: L, month });
  measure('auditLog (jurnal)', { action: 'auditLog', token: L });
  const w0 = workers[0];
  const tk = call({ action: 'createToken', token: fmTok, kind: 'IN', workerId: w0.id, siteId: siteOf(0)[0].id }, true);
  measure('createToken (yazı)', { action: 'createToken', token: fmTok, kind: 'OUT', workerId: workers[sc.foremen].id, siteId: siteOf(0)[0].id }, 1);
  if (tk.j.ok) { call({ action: 'tokenInfo', t: tk.j.data.token, d: 'dev-12345678' }, true); measure('tokenConfirm GPS (yazı)', { action: 'tokenConfirm', t: tk.j.data.token, d: 'dev-12345678', lat: 40.4, lng: 49.8, acc: 10 }, 1); }
  measure('requestAdvance (yazı)', { action: 'requestAdvance', token: fmTok, workerId: workers[sc.foremen * 2].id, amount: 20 }, 1);
  // nightly cleanup
  // fake Apps Script: SpreadsheetApp.create returns the same book, so the archive book is stubbed here
  vm.runInContext('archiveRows = function (n, rows) { this.__arch = (this.__arch || 0) + rows.length; };', ctx);
  const t1 = process.hrtime.bigint(); env.reset(); try { vm.runInContext('cleanup()', ctx); } catch (er) { rows.push({ name: 'cleanup', ok: false, err: String(er), cpu: 0, svc: 0, kb: 0 }); }
  rows.push({ name: 'cleanup (gecə)', ok: true, err: '', cpu: Math.round(Number(process.hrtime.bigint() - t1) / 1e6), svc: est(env.C), kb: 0 });
  // after nightly cleanup (archive) — same actions again
  vm.runInContext('bumpAll()', ctx);
  const attAfter = env.state.sheets.Attendance.rows.filter(r => r && r.some(v => v !== '')).length - 1;
  const audAfter = env.state.sheets.AuditLog.rows.filter(r => r && r.some(v => v !== '')).length - 1;
  rows.push({ name: '— gecə arxivindən sonra: davamiyyət ' + attAfter + ', jurnal ' + audAfter + ' sətir', ok: true, err: '', cpu: 0, svc: 0, kb: 0 });
  const tk2 = call({ action: 'createToken', token: fmTok, kind: 'IN', workerId: workers[sc.foremen * 3].id, siteId: siteOf(0)[0].id }, true);
  if (tk2.j.ok) { call({ action: 'tokenInfo', t: tk2.j.data.token, d: 'dev-12345678' }, true); measure('tokenConfirm GPS — arxivdən sonra', { action: 'tokenConfirm', t: tk2.j.data.token, d: 'dev-12345678', lat: 40.4, lng: 49.8, acc: 10 }, 1); }
  else rows.push({ name: 'createToken2', ok: false, err: tk2.j.error, cpu: 0, svc: 0, kb: 0 });
  measure('bootstrap admin — arxivdən sonra', { action: 'bootstrap', token: L });
  measure('bootstrap sahə rəisi — arxivdən sonra', { action: 'bootstrap', token: fmTok }, 1);
  out.push({ scale: sc, cells, rowsBySheet, rows, cacheItems: Object.keys(env.cacheStore).length, cacheKB: Math.round(Object.values(env.cacheStore).reduce((s, x) => s + x.length, 0) / 1024) });
  console.log('\n== ' + sc.key + ': ' + sc.foremen + ' sahə rəisi, ' + sc.workers + ' usta, ' + sc.months + ' ay ==');
  console.log('Sheet xanaları: ' + cells.toLocaleString() + ' / 10 000 000 (' + (cells / 1e5).toFixed(1) + '%)  sətirlər: ' + JSON.stringify(rowsBySheet));
  console.log('Keş: ' + Object.keys(env.cacheStore).length + ' element, ' + out[out.length - 1].cacheKB + ' KB');
  rows.forEach(r => console.log((r.ok ? '  ' : '! ') + r.name.padEnd(34) + ' CPU ' + String(r.cpu).padStart(6) + ' ms | Google xidmətləri ~' + String(r.svc).padStart(6) + ' ms | cavab ' + String(r.kb).padStart(5) + ' KB ' + (r.err ? '| ' + r.err : '')));
}
require('fs').writeFileSync(__dirname + '/stress.result.json', JSON.stringify(out, null, 1));
