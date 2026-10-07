// v0.3 server flow test: node test/flow.test.js server/Code.gs
const assert = require('assert');
const { load } = require('./fakegas');
const file = process.argv[2] || require('path').join(__dirname, '..', 'server', 'Code.gs');
const vm = require('vm');
const { env, ctx, api, call } = load(file);
const ok = m => console.log('ok ', m);
const sheet = n => { const rows = env.state.sheets[n].rows, H = rows[0]; return rows.slice(1).filter(r => r && r.some(v => v !== '' && v !== undefined)).map(r => Object.fromEntries(H.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))); };

api.setup();
// ---------- auth
let r = call({ action: 'login', phone: '994500000000', password: 'Master#2026' }).j;
assert(r.ok && r.data.mustChange, 'admin must change');
let A0 = r.data.token;
assert.strictEqual(call({ action: 'bootstrap', token: A0 }, true).j.error, 'must_change');
assert.strictEqual(call({ action: 'setPassword', token: A0, newPassword: 'abcdefgh' }, true).j.error, 'weak_password');
assert.strictEqual(call({ action: 'setPassword', token: A0, newPassword: 'Abcdefg1' }, true).j.error, 'weak_password', 'no symbol');
assert(call({ action: 'setPassword', token: A0, newPassword: 'Admin#2026x' }).j.ok);
const admin = A0;
const A = (action, p, allowFail) => { const x = call(Object.assign({ action, token: admin }, p), allowFail).j; return allowFail ? x : x.data; };
// lockout
for (let i = 0; i < 4; i++) assert.strictEqual(call({ action: 'login', phone: '994500000000', password: 'wrong' }, true).j.error, 'bad_login');
assert.strictEqual(call({ action: 'login', phone: '994500000000', password: 'wrong' }, true).j.error, 'locked');
assert.strictEqual(call({ action: 'login', phone: '994500000000', password: 'Admin#2026x' }, true).j.error, 'locked', 'locked even with right password');
const adminId = sheet('Users').find(u => u.role === 'admin').id;
A('unlockUser', { id: adminId });
assert(call({ action: 'login', phone: '994500000000', password: 'Admin#2026x' }).j.ok, 'unlock works');
ok('password policy, must-change, lockout, unlock');

// legacy PIN user → must change
const f1 = A('saveForeman', { foreman: { name: 'Rəşad Məmmədov', phone: '994501112233', password: 'Temp#1234', payType: 'MONTH', payModel: 'STD_BONUS', baseAmount: 1000, bonusPercent: 10 } }).id;
assert.strictEqual(A('saveForeman', { foreman: { name: 'X', phone: '994509999999', password: '1234' } }, true).error, 'weak_password');
r = call({ action: 'login', phone: '994501112233', password: 'Temp#1234' }).j;
assert(r.data.mustChange);
const F0 = r.data.token;
call({ action: 'setPassword', token: F0, newPassword: 'Rəşad#2026' });
const fm = F0;
const F = (action, p, allowFail) => { const x = call(Object.assign({ action, token: fm }, p), allowFail).j; return allowFail ? x : x.data; };
// change password with old one
assert.strictEqual(F('setPassword', { oldPassword: 'bad', newPassword: 'Yeni#Şifrə2' }, true).error, 'bad_old_password');
ok('foreman temp password → own password');

// ---------- customers & sites
const cust = A('saveCustomer', { customer: { name: 'Leyla Hüseynova', phone: '994551234567', voen: '1234567890', lang: 'ru' } });
assert.strictEqual(A('saveCustomer', { customer: { name: 'Bad', voen: '12' } }, true).error, 'bad_voen');
const W = [];
W.push(A('saveWorker', { worker: { name: 'Elvin Məmmədov', phone: '994551000001', foremanId: f1, grade: 'senior', payType: 'MONTH', baseAmount: 800, payModel: 'STD_BONUS', lang: 'az', startTime: '09:00', endTime: '18:00' } }).id);
W.push(A('saveWorker', { worker: { name: 'Samir Abbasov', phone: '994551000002', foremanId: f1, payType: 'DAY', baseAmount: 40, payModel: 'STD', lang: 'tr' } }).id);
// foreman site without photo → refused
assert.strictEqual(F('saveSite', { site: { customerId: cust.id, name: 'Obyekt 1', lat: 40.4093, lng: 49.8671, radius: 150 } }, true).error, 'photo_required');
const img = 'data:image/jpeg;base64,AAAA';
const s1 = F('saveSite', { site: { customerId: cust.id, name: 'Nərimanov 12', lat: 40.4093, lng: 49.8671, radius: 150 }, photos: [img], photoLat: 40.4094, photoLng: 49.8672 });
assert.strictEqual(s1.status, 'PENDING');
assert.strictEqual(A('decide', { type: 'site', id: s1.id, decision: 'return' }, true).error, 'reason_required');
A('decide', { type: 'site', id: s1.id, decision: 'return', reason: 'Ünvanı tam yazın' });
let b = F('bootstrap', {});
assert.strictEqual(b.sites.find(s => s.id === s1.id).status, 'RETURNED');
F('saveSite', { site: { id: s1.id, customerId: cust.id, name: 'Nərimanov 12, m. 34', address: 'A. Rəcəbli 12', lat: 40.4093, lng: 49.8671, radius: 150 } });
assert.strictEqual(sheet('Sites').find(s => s.id === s1.id).status, 'PENDING');
A('decide', { type: 'site', id: s1.id, decision: 'approve' });
const site = s1.id;
// foreman changes customer phone → pending
F('saveCustomer', { customer: { id: cust.id, name: cust.name, phone: '994559998877', voen: '1234567890', lang: 'ru' } });
let c = sheet('Customers').find(x => x.id === cust.id);
assert.strictEqual(c.phone, '994551234567'); assert.strictEqual(c.pendingPhone, '994559998877');
A('decide', { type: 'cphone', id: cust.id, decision: 'reject', reason: 'Səhv nömrə' });
assert.strictEqual(sheet('Customers').find(x => x.id === cust.id).pendingPhone, '');
ok('site photo required, return → fix → approve, phone change needs admin');

// ---------- attendance links: reuse, device binding, staff device
let t1 = F('createToken', { kind: 'IN', workerId: W[0], siteId: site });
let t1b = F('createToken', { kind: 'IN', workerId: W[0], siteId: site });
assert(t1b.reused && t1b.token === t1.token, 'active link is reused');
assert.strictEqual(call({ action: 'tokenInfo', t: t1.token, d: 'dev-A-12345678', st: fm }, true).j.error, 'link_staff_device');
let info = call({ action: 'tokenInfo', t: t1.token, d: 'dev-A-12345678' }).j.data;
assert.strictEqual(info.kind, 'IN');
assert.strictEqual(call({ action: 'tokenInfo', t: t1.token, d: 'dev-B-12345678' }, true).j.error, 'link_other_device');
assert(call({ action: 'tokenInfo', t: t1.token, d: 'dev-A-12345678' }).j.ok, 'same phone reopens');
r = call({ action: 'tokenConfirm', t: t1.token, d: 'dev-A-12345678', lat: 40.4094, lng: 49.8672, acc: 5 }).j;
assert(r.ok && r.data.ok, 'confirm IN');
const att = sheet('LinkAttempts');
assert.strictEqual(att.length, 2); assert.deepStrictEqual(att.map(a => a.reason).sort(), ['other_device', 'staff_device']);
b = A('bootstrap', {});
assert.strictEqual(b.attempts.length, 2, 'admin sees attempts');
assert.strictEqual(F('bootstrap', {}).attempts.length, 2, 'foreman sees own workers attempts');
ok('link reuse, device binding, staff device blocked, attempts logged');

// ---------- work entry + expiry
const bt = A('bootstrap', {});
const kafel = bt.workTypes.find(x => x.name === 'Kafel döşəmə');
const suvaq = bt.workTypes.find(x => x.name === 'Suvaq');
A('saveWorkType', { workType: Object.assign({}, kafel, { normType: 'MONTH', normQty: 230 }) });
A('saveWorkType', { workType: Object.assign({}, suvaq, { normType: 'MONTH', normQty: 200 }) });
A('saveEstimate', { estimate: { siteId: site, workTypeId: kafel.id, planQty: 400, clientPrice: 18 } });
const today = bt.today;
const e1 = F('saveWorkEntry', { entry: { siteId: site, workTypeId: kafel.id, qty: 340, date: today }, shares: [{ workerId: W[0], share: 100 }] });
const e2 = F('saveWorkEntry', { entry: { siteId: site, workTypeId: suvaq.id, qty: 150, date: today }, shares: [{ workerId: W[0], share: 100 }] });
// edit e2 → old link cancelled
const oldTok = e2.links[0].token;
const e2b = F('saveWorkEntry', { entry: { id: e2.entry.id, siteId: site, workTypeId: suvaq.id, qty: 150, date: today }, shares: [{ workerId: W[0], share: 100 }] });
assert.strictEqual(call({ action: 'tokenConfirm', t: oldTok, d: 'dev-A-12345678' }, true).j.error, 'link_cancelled');
call({ action: 'tokenConfirm', t: e1.links[0].token, d: 'dev-A-12345678' });
call({ action: 'tokenConfirm', t: e2b.links[0].token, d: 'dev-A-12345678' });
A('decide', { type: 'work', id: e1.entry.id, decision: 'approve' });
A('decide', { type: 'work', id: e2.entry.id, decision: 'approve' });
// expiry: third entry, push token expiry to the past
const e3 = F('saveWorkEntry', { entry: { siteId: site, workTypeId: suvaq.id, qty: 10, date: today }, shares: [{ workerId: W[0], share: 100 }] });
const toks = env.state.sheets.Tokens.rows; const H = toks[0];
toks.forEach(row => { if (row[H.indexOf('token')] === e3.links[0].token) row[H.indexOf('expires')] = '2000-01-01T00:00:00'; });
api.onSheetChange();
vm.runInContext('P.reset(); DB.reset(); expireLinks(); DB.commit();', ctx);
assert.strictEqual(sheet('WorkEntries').find(e => e.id === e3.entry.id).status, 'RETURNED', 'expired work link → returned');
assert(/link açılmayıb/.test(sheet('WorkEntries').find(e => e.id === e3.entry.id).returnReason));
A('decide', { type: 'work', id: e3.entry.id, decision: 'reject', reason: 'Lazım deyil' });
ok('work entry links, edit cancels old links, expiry returns entry, reject');

// ---------- advance flow
let adv = F('requestAdvance', { workerId: W[0], amount: 200, reason: 'Ailə' });
A('decide', { type: 'adv', id: adv.id, decision: 'return', reason: 'Məbləği yoxla' });
F('requestAdvance', { id: adv.id, workerId: W[0], amount: 150, reason: 'Ailə' });
A('decide', { type: 'adv', id: adv.id, decision: 'approve' });
assert.strictEqual(F('moneyLink', { kind: 'ADV', id: adv.id }, true).error, 'bad_status', 'link only after Verdim');
F('markAdvance', { id: adv.id, status: 'GIVEN' });
let ml = F('moneyLink', { kind: 'ADV', id: adv.id });
let ml2 = F('moneyLink', { kind: 'ADV', id: adv.id });
assert(ml2.reused && ml2.token === ml.token);
info = call({ action: 'tokenInfo', t: ml.token, d: 'dev-U-12345678' }).j.data;
assert(info.adv && info.adv.amount === undefined, 'amount hidden');
r = call({ action: 'tokenConfirm', t: ml.token, d: 'dev-U-12345678', amount: 140 }).j.data;
assert(!r.match);
assert.strictEqual(sheet('Advances').find(a => a.id === adv.id).status, 'CONFLICT');
assert.strictEqual(A('monthBlockers', { month: today.slice(0, 7) }).some(x => x.type === 'adv'), true);
A('resolveConflict', { type: 'adv', id: adv.id, op: 'return', reason: 'Usta 140 deyir' });
F('requestAdvance', { id: adv.id, workerId: W[0], amount: 140, reason: 'Ailə' });
A('decide', { type: 'adv', id: adv.id, decision: 'approve' });
F('markAdvance', { id: adv.id, status: 'GIVEN' });
ml = F('moneyLink', { kind: 'ADV', id: adv.id });
r = call({ action: 'tokenConfirm', t: ml.token, d: 'dev-U-12345678', amount: 140 }).j.data;
assert(r.match && r.receipt && r.receipt.no.indexOf('AV-') === 0);
assert.strictEqual(sheet('Advances').find(a => a.id === adv.id).status, 'CLOSED');
ok('advance: return → fix → approve → Verdim → link → conflict → return → … → closed');

// accept conflict
let adv2 = F('requestAdvance', { workerId: W[1], amount: 50 });
A('decide', { type: 'adv', id: adv2.id, decision: 'approve' }); F('markAdvance', { id: adv2.id, status: 'GIVEN' });
ml = F('moneyLink', { kind: 'ADV', id: adv2.id });
call({ action: 'tokenConfirm', t: ml.token, d: 'dev-S-12345678', amount: 45 });
A('resolveConflict', { type: 'adv', id: adv2.id, op: 'accept', reason: 'Usta düz deyir' });
assert.strictEqual(sheet('Advances').find(a => a.id === adv2.id).amount, '45');
ok('conflict accepted → amount = confirmed');

// ---------- customer payment
let pay = F('addPayment', { payment: { siteId: site, amount: 5000, date: today, method: 'CASH', note: 'Avans' } });
assert.strictEqual(pay.status, 'PENDING');
A('decide', { type: 'pay', id: pay.id, decision: 'approve' });
ml = F('moneyLink', { kind: 'PAY', id: pay.id });
info = call({ action: 'tokenInfo', t: ml.token, d: 'dev-C-12345678' }).j.data;
assert.strictEqual(info.lang, 'ru'); assert(info.pay.customer);
r = call({ action: 'tokenConfirm', t: ml.token, d: 'dev-C-12345678', amount: 5000 }).j.data;
assert(r.match && r.receipt.payerVoen === '1234567890');
// manual close
let pay2 = A('addPayment', { payment: { siteId: site, amount: 300, date: today } });
assert.strictEqual(pay2.status, 'APPROVED');
A('closePaymentManual', { id: pay2.id, reason: 'Müştərinin telefonu yoxdur' });
ok('customer payment: approve → link → closed; manual close');

// ---------- expenses
let ex = F('saveExpense', { expense: { siteId: site, category: 'Material', amount: 420, date: today, note: 'Kafel yapışqanı' }, photos: [img] });
A('decide', { type: 'exp', id: ex.id, decision: 'return', reason: 'Qəbz şəkli aydın deyil' });
F('saveExpense', { expense: { id: ex.id, siteId: site, category: 'Material', amount: 420, date: today } , photos: [img] });
A('decide', { type: 'exp', id: ex.id, decision: 'approve' });
ok('expense: return → fix → approve');

// ---------- manual attendance return → edit
const m1 = F('manualAttendance', { workerId: W[1], siteId: site, kind: 'IN', time: '09:05', reason: 'GPS yoxdur' });
A('decide', { type: 'att', id: m1.id, decision: 'return', reason: 'Saatı düzəlt' });
F('editAttendance', { id: m1.id, time: '09:00', reason: 'GPS yoxdur' });
A('decide', { type: 'att', id: m1.id, decision: 'approve' });
const m2 = F('manualAttendance', { workerId: W[1], siteId: site, kind: 'OUT', time: '18:00', reason: 'GPS yoxdur' });
A('decide', { type: 'att', id: m2.id, decision: 'approve' });
ok('manual attendance return → edit → approve');

// ---------- payroll with norm bonus (BRD Nümunə 1 logic: 340 vs 230 → 47.83%)
const M = today.slice(0, 7);
A('setPlanDays', { month: M, days: 22 });
let pr = A('calcPayroll', { month: M });
const el = pr.lines.find(l => l.personId === W[0]);
assert.strictEqual(el.bonus, 382.61, 'bonus = 800 × 110/230');
assert.strictEqual(el.advance, 140);
const fl = pr.lines.find(l => l.personId === f1);
assert.strictEqual(fl.bonus, 38.26, 'foreman 10% of workers bonus');
ok('payroll: norm bonus ' + el.bonus + ', foreman bonus ' + fl.bonus);

// ---------- site result
const sr = A('siteResult', { month: M }).find(x => x.siteId === site);
assert.strictEqual(sr.received, 5300); assert.strictEqual(sr.expenses, 420);
assert(sr.labor > 0, 'labor cost');
assert.strictEqual(sr.workValue, 340 * 18);
ok('site result: received ' + sr.received + ', expenses ' + sr.expenses + ', labor ' + sr.labor + ', cash ' + sr.cashResult + ' (' + sr.cashMargin + '%)');

// ---------- month close blockers
let pend = F('saveExpense', { expense: { siteId: site, category: 'Digər', amount: 10, date: today } });
let cl = A('closePeriod', { month: M });
assert(!cl.ok && cl.blockers.some(x => x.type === 'exp'), 'blocked by open expense');
A('decide', { type: 'exp', id: pend.id, decision: 'reject', reason: 'Təkrar' });
cl = A('closePeriod', { month: M });
assert(cl.ok, 'closed: ' + JSON.stringify(cl));
assert(sheet('SiteCosts').length > 0);
const sr2 = A('siteResult', { month: M }).find(x => x.siteId === site);
assert.strictEqual(sr2.labor, sr.labor, 'stored labor == computed');
ok('month close: blockers listed, then closed; site costs stored');

// ---------- audit, links, system
const al = A('auditLog', { from: '2000-01-01' });
assert(al.rows.some(x => x.action === 'login_fail') && al.rows.some(x => x.action === 'link_other_device') && al.rows.some(x => x.action === 'return'));
const withCh = al.rows.find(x => x.action === 'fix' && x.sheet === 'Advances');
assert(withCh && JSON.parse(withCh.details).ch.amount, 'old/new values in journal');
const lk = A('links', {});
assert(lk.rows.length && lk.attempts.length === 2);
ok('journal (old/new values), links, attempts');

// ---------- idempotency and offline expiry
const before = sheet('Advances').length;
call({ action: 'requestAdvance', token: fm, workerId: W[1], amount: 5, cid: 'q-1' });
call({ action: 'requestAdvance', token: fm, workerId: W[1], amount: 5, cid: 'q-1' });
assert.strictEqual(sheet('Advances').length, before + 1, 'same cid stored once');
assert.strictEqual(call({ action: 'requestAdvance', token: fm, workerId: W[1], amount: 5, offlineAt: '2001-01-01T10:00:00' }, true).j.error, 'offline_expired');
ok('offline queue: duplicate send ignored, old record refused');

// ---------- formula protection
F('saveCustomer', { customer: { name: '=HYPERLINK("x")' } });
const raw = env.state.sheets.Customers.rows.find(rw => String(rw[1]).indexOf('HYPERLINK') >= 0)[1];
assert.strictEqual(raw.charAt(0), "'");
assert(F('bootstrap', {}).customers.some(x => x.name === '=HYPERLINK("x")'), 'read back without apostrophe');
ok('formula text protected');

console.log('\nFlow testləri keçdi.');
