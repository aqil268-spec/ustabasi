// Cache consistency test: after every action the cached view must equal the real sheet.
// Also: manual Sheet edits (sorting, editing a cell) must never make a write hit the wrong row.
// Usage: node test/cache.test.js server/Code.gs
const assert = require('assert');
const vm = require('vm');
const { load } = require('./fakegas');
const file = process.argv[2] || 'server/Code.gs';
const { env, ctx, api, call } = load(file);
const { DB, SCHEMA } = api;

let checks = 0;
function norm(v, h) { const s = v === null || v === undefined ? '' : String(v); if (h === 'month') return s.slice(0, 7); if (h === 'date' || h === 'contractDate') return s.slice(0, 10); return s; }
function actual(name) {
  const rows = env.state.sheets[name].rows, head = SCHEMA[name], out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (head.every((h, j) => r[j] === '' || r[j] === undefined || r[j] === null)) continue;
    const o = { _row: i + 1 }; head.forEach((h, j) => { o[h] = norm(r[j], h); }); out.push(o);
  }
  return out;
}
/** What a fresh request sees (cache first, then sheet). */
function view(name) {
  DB.reset(); vm.runInContext('P.reset()', ctx);
  DB.load([name]);
  const rows = JSON.parse(JSON.stringify(DB.all(name)));
  return { rows, fromCache: DB.stats().cached > 0 };
}
function verifyAll(label) {
  Object.keys(SCHEMA).forEach(name => {
    if (name === 'AuditLog' || name === 'LinkAttempts') return;
    const a = actual(name), v = view(name).rows;
    try { assert.deepStrictEqual(v, a); }
    catch (e) { console.error('MISMATCH after', label, '→', name); console.error(' view :', JSON.stringify(v).slice(0, 700)); console.error(' sheet:', JSON.stringify(a).slice(0, 700)); process.exit(1); }
    checks++;
  });
}
const ok = (msg) => console.log('ok ', msg);

// ---------- setup + seed through the API
api.setup();
verifyAll('setup');
const admin = call({ action: 'login', phone: '994500000000', password: 'Master#2026' }).j.data.token;
call({ action: 'setPassword', token: admin, newPassword: 'Admin#2026x' });
const A = (action, p, allowFail) => { const r = call(Object.assign({ action, token: admin }, p), allowFail); return allowFail ? r.j : r.j.data; };
const f1 = A('saveForeman', { foreman: { name: 'Sahə rəisi Bir', phone: '994501112233', password: 'Temp#1111', payModel: 'STD', baseAmount: 1000 } }).id;
const cust = A('saveCustomer', { customer: { name: 'Müştəri' } }).id;
const site = A('saveSite', { site: { customerId: cust, name: 'Obyekt', lat: 40.4, lng: 49.8, radius: 150, foremanId: f1 } }).id;
const W = [];
for (let i = 0; i < 8; i++) W.push(A('saveWorker', { worker: { name: 'Usta ' + i, phone: '99455100000' + i, foremanId: f1, payType: 'MONTH', baseAmount: 800, payModel: 'STD_BONUS', lang: 'az' } }).id);
verifyAll('seed');
ok('seed: every sheet view == sheet');

// ---------- foreman flow: links, confirmations, work entries, advances
const fm = call({ action: 'login', phone: '994501112233', password: 'Temp#1111' }).j.data.token;
call({ action: 'setPassword', token: fm, newPassword: 'Fore#man2026' });
const F = (action, p, allowFail) => { const r = call(Object.assign({ action, token: fm }, p), allowFail); return allowFail ? r.j : r.j.data; };
const boot = F('bootstrap', {});
const kafel = boot.workTypes[0].id;
for (let i = 0; i < 5; i++) {
  const t = F('createToken', { kind: 'IN', workerId: W[i], siteId: site }).token;
  verifyAll('createToken ' + i);
  const r = call({ action: 'tokenConfirm', t, d: 'dev-12345678', lat: 40.4, lng: 49.8, acc: 5 }, true).j;
  assert(r.ok, 'tokenConfirm ' + JSON.stringify(r));
  verifyAll('tokenConfirm ' + i);
}
const far = F('createToken', { kind: 'IN', workerId: W[6], siteId: site }).token;
call({ action: 'tokenConfirm', t: far, d: 'dev-12345678', lat: 40.5, lng: 49.8, acc: 5 }, true);
verifyAll('too far');
const e1 = F('saveWorkEntry', { entry: { siteId: site, workTypeId: kafel, qty: 40, date: boot.today }, shares: [{ workerId: W[0], share: 60 }, { workerId: W[1], share: 40 }] });
verifyAll('saveWorkEntry');
// edit the entry (removes and re-creates shares)
F('saveWorkEntry', { entry: { id: e1.entry.id, siteId: site, workTypeId: kafel, qty: 42, date: boot.today }, shares: [{ workerId: W[0], share: 50 }, { workerId: W[1], share: 50 }] });
verifyAll('edit work entry');
const links = F('workLinks', { entryId: e1.entry.id });
verifyAll('workLinks');
(links || []).forEach(l => { call({ action: 'tokenConfirm', t: l.token, d: 'dev-12345678' }, true); verifyAll('work confirm'); });
F('requestAdvance', { workerId: W[2], amount: 100, reason: 'test' });
verifyAll('requestAdvance');
ok('foreman flow: ' + checks + ' sheet checks');

// ---------- admin approvals
const b2 = A('bootstrap', {});
b2.entries.filter(e => e.status === 'ADMIN_PENDING').forEach(e => { A('approveWork', { id: e.id, ok: true }); verifyAll('approveWork'); });
b2.advances.filter(a => a.status === 'PENDING').forEach(a => { A('decide', { type: 'adv', id: a.id, decision: 'approve' }); verifyAll('approveAdvance'); });
A('setLang', { lang: 'ru' }); verifyAll('setLang');
ok('admin approvals');

// ---------- manual edit 1: someone sorts the Workers sheet by hand (no trigger yet)
const ws = env.state.sheets.Workers.rows;
const head = ws[0], body = ws.slice(1).reverse();
env.state.sheets.Workers.rows = [head].concat(body);
const target = W[3];
const before = A('bootstrap', {}).workers.find(w => w.id === target); // stale cache view is fine for reads
A('saveWorker', { worker: Object.assign({}, before, { name: 'Usta 3 (yeni ad)' }) });
const rowsNow = actual('Workers');
assert.strictEqual(rowsNow.find(r => r.id === target).name, 'Usta 3 (yeni ad)', 'target row updated');
assert.strictEqual(rowsNow.filter(r => r.name === 'Usta 3 (yeni ad)').length, 1, 'no other row overwritten');
W.filter(id => id !== target).forEach((id, i) => { assert(/^Usta \d$/.test(rowsNow.find(r => r.id === id).name), 'other workers intact'); });
verifyAll('manual sort + update');
ok('manual sort: write went to the right row, cache refreshed');

// ---------- manual edit 2: someone edits a cell by hand (no trigger yet), then the app updates another field
const wr = env.state.sheets.Workers.rows;
const idx = wr.findIndex(r => r[0] === W[5]);
const phoneCol = SCHEMA.Workers.indexOf('phone');
wr[idx][phoneCol] = '994559999999';
const w5 = A('bootstrap', {}).workers.find(w => w.id === W[5]);
assert.notStrictEqual(w5.phone, '994559999999', 'cache is stale before trigger (expected)');
A('deleteWorker', { id: W[5] });          // app changes one field (status) of the same row
const r5 = actual('Workers').find(r => r.id === W[5]);
assert.strictEqual(r5.status, 'inactive', 'app change written');
assert.strictEqual(r5.phone, '994559999999', 'manual edit kept');
verifyAll('manual cell edit + update');
ok('manual cell edit: app update did not break the sheet; cache == sheet');

// ---------- manual edit 3: hand edit + trigger → next read is fresh
const wr2 = env.state.sheets.Workers.rows;
const i7 = wr2.findIndex(r => r[0] === W[7]);
wr2[i7][SCHEMA.Workers.indexOf('name')] = 'Əl ilə dəyişdi';
api.onSheetChange();
assert.strictEqual(A('bootstrap', {}).workers.find(w => w.id === W[7]).name, 'Əl ilə dəyişdi');
verifyAll('trigger');
ok('trigger: manual edit visible on the next request');

// ---------- manual edit 4: row deleted by hand, app tries to update it → clear error, no damage
const wr3 = env.state.sheets.Workers.rows;
const i6 = wr3.findIndex(r => r[0] === W[6]);
const noRow = list => JSON.stringify(list.map(r => { const c = Object.assign({}, r); delete c._row; return c; }));
const snapshotBefore = noRow(actual('Workers').filter(r => r.id !== W[6]));
const w6 = A('bootstrap', {}).workers.find(w => w.id === W[6]);
wr3.splice(i6, 1);
const res = A('saveWorker', { worker: Object.assign({}, w6, { name: 'xxx' }) }, true);
assert(!res.ok, 'update of a deleted row must fail');
assert.strictEqual(noRow(actual('Workers')), snapshotBefore, 'no other row touched');
api.onSheetChange();
verifyAll('deleted row');
ok('deleted row: update refused (' + res.error + '), other rows untouched');

// ---------- mixed chunks from two writers are detected
for (let i = 0; i < 1500; i++) env.state.sheets.Attendance.rows.push(['X' + i, W[i % 8], site, 'IN', '2026-09-01T09:00:00', '2026-09-01', '40.4', '49.8', '5', '10', 'LINK', 'qeyd qeyd qeyd qeyd', 'OK', '0', W[0]]);
api.onSheetChange();
view('Attendance');                      // fills the cache (several chunks)
const keys = Object.keys(env.cacheStore).filter(k => k.indexOf('d:Attendance:') === 0);
assert(keys.length >= 2, 'Attendance uses several chunks (' + keys.length + ')');
const k1 = keys.find(k => /:1$/.test(k));
env.cacheStore[k1] = 'zzzzzz' + env.cacheStore[k1].slice(6);  // chunk from "another writer"
const v = view('Attendance');
assert(!v.fromCache, 'mixed chunks must not be used');
assert.deepStrictEqual(v.rows, actual('Attendance'));
ok('mixed chunks: detected, data read from the sheet');

// ---------- cleanup keeps cache == sheet
api.cleanup();
verifyAll('cleanup');
ok('cleanup');

// ---------- stale cache keys are removed on write
const before2 = Object.keys(env.cacheStore).length;
for (let i = 0; i < 20; i++) F('createToken', { kind: 'OUT', workerId: W[i % 5], siteId: site });
const after2 = Object.keys(env.cacheStore).length;
assert(after2 - before2 < 10, 'cache does not grow with every write (' + before2 + ' → ' + after2 + ')');
ok('old cache versions removed (' + before2 + ' → ' + after2 + ' items)');

console.log('\nCache testləri keçdi. Yoxlama sayı: ' + checks);
