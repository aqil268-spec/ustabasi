// Security test (server): auth, roles, IDOR, links, input validation.
// Usage: node sec.test.js [Code.gs]. Prints PASS/FAIL per check; exit 1 if any FAIL.
const { load } = require('./fakegas');
const { env, api, call } = load(process.argv[2] || require('path').join(__dirname, '..', 'server', 'Code.gs'));
const sheet = n => { const rows = env.state.sheets[n].rows, H = rows[0]; return rows.slice(1).filter(r => r && r.some(v => v !== '' && v !== undefined)).map(r => Object.fromEntries(H.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))); };
const results = [];
const check = (area, name, ok, info) => { results.push({ area, name, ok: !!ok, info: info || '' }); };
const raw = (p) => call(p, true).j;
// tokenConfirm GPS: inner {ok:false,error} comes inside data
const conf = (p) => { const x = raw(p); return x.ok && x.data && x.data.ok === false ? { ok: false, error: x.data.error } : x; };
const errOf = (p) => { const r = raw(p); return r.ok ? 'OK' : r.error; };

api.setup();
// ---- setup actors
let r = raw({ action: 'login', phone: '994500000000', password: 'Master#2026' });
const A = r.data.token;
raw({ action: 'setPassword', token: A, newPassword: 'Admin#2026x' });
const ad = (action, p) => { const x = raw(Object.assign({ action, token: A }, p)); if (!x.ok) throw new Error(action + ' ' + x.error + ' ' + (x.detail || '')); return x.data; };
const f1 = ad('saveForeman', { foreman: { name: 'F1', phone: '994501000001', password: 'Temp#2026a' } }).id;
const f2 = ad('saveForeman', { foreman: { name: 'F2', phone: '994501000002', password: 'Temp#2026a' } }).id;
const loginF = ph => { const t = raw({ action: 'login', phone: ph, password: 'Temp#2026a' }).data.token; raw({ action: 'setPassword', token: t, newPassword: 'Real#2026a' }); return t; };
const T1 = loginF('994501000001'), T2 = loginF('994501000002');
const w1 = ad('saveWorker', { worker: { name: 'W1', phone: '994551000001', foremanId: f1, payType: 'MONTH', baseAmount: 800, payModel: 'STD_BONUS' } }).id;
const w2 = ad('saveWorker', { worker: { name: 'W2', phone: '994551000002', foremanId: f2, payType: 'DAY', baseAmount: 40 } }).id;
const c1 = ad('saveCustomer', { customer: { name: 'C1', phone: '994551234567' } });
const s1 = ad('saveSite', { site: { customerId: c1.id, name: 'S1', lat: 40.4093, lng: 49.8671, radius: 150, foremanId: f1 } });
const c2 = ad('saveCustomer', { customer: { name: 'C2', phone: '994551234568' } });
const s2 = ad('saveSite', { site: { customerId: c2.id, name: 'S2', lat: 40.3850, lng: 49.8150, radius: 150, foremanId: f2 } });
const wt = ad('bootstrap', {}).workTypes[0].id;
const F1 = (action, p) => raw(Object.assign({ action, token: T1 }, p));
const F2 = (action, p) => raw(Object.assign({ action, token: T2 }, p));

// ================= AUTH
check('Auth', 'Tokensiz qorunan sorğu rədd olunur', errOf({ action: 'bootstrap' }) === 'auth');
check('Auth', 'Saxta token rədd olunur', errOf({ action: 'bootstrap', token: 'x'.repeat(44) }) === 'auth');
check('Auth', 'Naməlum action rədd olunur', ['forbidden', 'auth'].includes(errOf({ action: 'evil', token: A })));
check('Auth', 'Pis JSON', (() => { const o = JSON.parse(api.doPost({ postData: { contents: '{bad' } }).s); return o.error === 'bad_json'; })());
const ADMIN_ONLY = ['saveForeman', 'saveWorker', 'decide', 'resolveConflict', 'closePaymentManual', 'saveWorkType', 'saveEstimate', 'addDeduction', 'setPlanDays', 'calcPayroll', 'closePeriod', 'markPaid', 'saveSettings', 'deleteWorker', 'siteResult', 'auditLog', 'links', 'system', 'backupNow', 'unlockUser', 'closeSessions', 'monthBlockers'];
const leaked = ADMIN_ONLY.filter(a => F1(a, { id: w1, month: '2026-10', settings: { foremanSeesPay: 'yes' }, foreman: { name: 'x', phone: '994509999999', password: 'Abc#12345' } }).error !== 'forbidden');
check('Auth', 'Sahə rəisi admin funksiyalarını çağıra bilmir (' + ADMIN_ONLY.length + ' funksiya)', leaked.length === 0, leaked.join(', '));
// session after logout
const tmp = raw({ action: 'login', phone: '994501000001', password: 'Real#2026a' }).data.token;
raw({ action: 'logout', token: tmp });
check('Auth', 'Çıxışdan sonra token işləmir', errOf({ action: 'bootstrap', token: tmp }) === 'auth');
// deactivate user kills session
const f3 = ad('saveForeman', { foreman: { name: 'F3', phone: '994501000003', password: 'Temp#2026a' } }).id;
const T3 = loginF('994501000003');
ad('saveForeman', { foreman: { id: f3, name: 'F3', phone: '994501000003', status: 'inactive' } });
check('Auth', 'Deaktiv istifadəçinin sessiyası bağlanır', errOf({ action: 'bootstrap', token: T3 }) === 'auth');
// lockout
for (let i = 0; i < 5; i++) raw({ action: 'login', phone: '994501000002', password: 'wrong' });
check('Auth', '5 səhv cəhddən sonra bloklama', errOf({ action: 'login', phone: '994501000002', password: 'Real#2026a' }) === 'locked');
ad('unlockUser', { id: f2 });
check('Auth', 'Naməlum telefon və səhv şifrə eyni cavab verir', errOf({ action: 'login', phone: '994509999990', password: 'x' }) === errOf({ action: 'login', phone: '994501000001', password: 'x' }));
raw({ action: 'login', phone: '994501000001', password: 'Real#2026a' }); // reset fail count
const sess = sheet('Sessions')[0].token;
check('Auth', 'Sessiya tokeni uzun və təsadüfidir (≥40 simvol)', String(sess).length >= 40, String(sess).length + ' simvol');
check('Auth', 'Şifrə açıq saxlanmır (hash)', sheet('Users').every(u => !String(u.pwHash).includes('Real#2026a') && (!u.pwHash || /^[0-9a-f]{64}$/.test(u.pwHash))));

// ================= IDOR / rol sərhədi
const b2 = F2('bootstrap', {}).data;
check('Giriş hüququ', 'Sahə rəisi başqasının ustalarını görmür', !b2.workers.some(w => w.id === w1));
check('Giriş hüququ', 'Sahə rəisi başqasının obyektlərini görmür', !b2.sites.some(s => s.id === s1.id));
check('Giriş hüququ', 'Bootstrap-da şifrə hash-i yoxdur', !JSON.stringify(b2).includes('pwHash') && !JSON.stringify(ad('bootstrap', {})).match(/"pwHash":"[0-9a-f]/));
check('Giriş hüququ', 'Başqasının ustasına gəliş linki', F2('createToken', { kind: 'IN', workerId: w1, siteId: s1.id }).error === 'forbidden');
check('Giriş hüququ', 'Başqasının ustasına avans', F2('requestAdvance', { workerId: w1, amount: 50 }).error === 'forbidden');
check('Giriş hüququ', 'Başqasının ustasına manual davamiyyət', F2('manualAttendance', { workerId: w1, siteId: s1.id, kind: 'IN', reason: 'x' }).error === 'forbidden');
check('Giriş hüququ', 'Öz ustasına başqasının obyektində manual davamiyyət', F2('manualAttendance', { workerId: w2, siteId: s1.id, kind: 'IN', reason: 'x' }).error === 'forbidden');
check('Giriş hüququ', 'Başqasının obyektinə iş qeydi', F2('saveWorkEntry', { entry: { siteId: s1.id, workTypeId: wt, qty: 10 }, shares: [{ workerId: w2, share: 100 }] }).error === 'forbidden');
check('Giriş hüququ', 'Başqasının ustası iş payında', F2('saveWorkEntry', { entry: { siteId: s2.id, workTypeId: wt, qty: 10 }, shares: [{ workerId: w1, share: 100 }] }).error === 'forbidden');
const e1 = F1('saveWorkEntry', { entry: { siteId: s1.id, workTypeId: wt, qty: 10 }, shares: [{ workerId: w1, share: 100 }] }).data.entry;
const hij = F2('saveWorkEntry', { entry: { id: e1.id, siteId: s2.id, workTypeId: wt, qty: 999 }, shares: [{ workerId: w2, share: 100 }] });
check('Giriş hüququ', 'Başqasının iş qeydini dəyişmək (id ilə)', hij.error === 'forbidden', hij.ok ? 'F2 F1-in qeydini öz obyektinə köçürdü' : hij.error);
check('Giriş hüququ', 'Başqasının iş linkləri', F2('workLinks', { entryId: e1.id }).error === 'forbidden');
const adv1 = F1('requestAdvance', { workerId: w1, amount: 50 }).data;
check('Giriş hüququ', 'Başqasının avansını "Verdim" etmək', F2('markAdvance', { id: adv1.id, status: 'GIVEN' }).error === 'forbidden');
check('Giriş hüququ', 'Başqasının avansına pul linki', F2('moneyLink', { kind: 'ADV', id: adv1.id }).error === 'forbidden');
ad('decide', { type: 'adv', id: adv1.id, decision: 'return', reason: 'test' });
const fixOther = F2('requestAdvance', { id: adv1.id, workerId: w2, amount: 999 });
check('Giriş hüququ', 'Başqasının qaytarılmış avansını düzəltmək', fixOther.error === 'forbidden' || fixOther.error === 'not_found', fixOther.ok ? 'F2 F1-in avansını 999 etdi' : fixOther.error);
const pay1 = F1('addPayment', { payment: { siteId: s1.id, amount: 100 } }).data;
ad('decide', { type: 'pay', id: pay1.id, decision: 'return', reason: 'test' });
const payHij = F2('addPayment', { payment: { id: pay1.id, siteId: s2.id, amount: 1 } });
check('Giriş hüququ', 'Başqasının ödənişini dəyişmək (id ilə)', payHij.error === 'forbidden', payHij.ok ? 'F2 F1-in ödənişini dəyişdi' : payHij.error);
check('Giriş hüququ', 'Başqasının obyektinə ödəniş', F2('addPayment', { payment: { siteId: s1.id, amount: 100 } }).error === 'forbidden');
check('Giriş hüququ', 'Başqasının obyektinə xərc', F2('saveExpense', { expense: { siteId: s1.id, amount: 10, category: 'Material' } }).error === 'forbidden');
check('Giriş hüququ', 'Başqasının obyektini dəyişmək', F2('saveSite', { site: { id: s1.id, customerId: c1.id, name: 'hacked', lat: 1, lng: 1 } }).error === 'forbidden');
const custHij = F2('saveCustomer', { customer: { id: c1.id, name: 'hacked', phone: '994551234567' } });
check('Giriş hüququ', 'Başqasının müştərisini dəyişmək (id ilə)', custHij.error === 'forbidden', custHij.ok ? 'F2 C1-in adını dəyişdi' : custHij.error);
check('Giriş hüququ', 'Başqasının ustasının ilkin hesabatı (maaş)', F2('interim', { workerId: w1 }).error === 'forbidden');
ad('saveSettings', { settings: { foremanSeesPay: 'no' } });
const bNoPay = F1('bootstrap', {}).data;
check('Giriş hüququ', '"Maaşı görməsin" ayarında maaş gizlənir', bNoPay.workers.every(w => w.baseAmount === ''));
ad('saveSettings', { settings: { foremanSeesPay: 'yes' } });

// ================= LINKS
const mk = () => F1('createToken', { kind: 'IN', workerId: w1, siteId: s1.id }).data.token;
let tok = mk();
check('Link', 'Token uzunluğu (~150 bit)', tok.length >= 40, tok.length + ' simvol');
check('Link', 'Saxta link tapılmır', errOf({ action: 'tokenInfo', t: 'k' + 'a'.repeat(40), d: 'dev1-12345678' }) === 'link_not_found');
check('Link', 'İşçi sessiyası olan telefonda link açılmır', errOf({ action: 'tokenInfo', t: tok, d: 'devA-12345678', st: T1 }) === 'link_staff_device');
// device id empty → no binding bypass
const noDev = raw({ action: 'tokenInfo', t: tok });
const other = conf({ action: 'tokenConfirm', t: tok, d: 'devB-12345678', lat: 40.4093, lng: 49.8671 });
check('Link', 'Cihaz ID-siz açılış linki bağlamadan buraxmır', !noDev.ok || !other.ok, noDev.ok && other.ok ? 'd göndərməyən sorğu linki bağlamadı; başqa telefon təsdiq etdi' : '');
tok = mk() === tok ? mk() : mk();
const ti = raw({ action: 'tokenInfo', t: tok, d: 'devA-12345678' });
check('Link', 'Başqa telefon bağlanmış linki aça bilmir', errOf({ action: 'tokenInfo', t: tok, d: 'devB-12345678' }) === 'link_other_device');
const wNan = ad('saveWorker', { worker: { name: 'WN', phone: '994551000050', foremanId: f1 } }).id;
const tNan = F1('createToken', { kind: 'IN', workerId: wNan, siteId: s1.id }).data.token;
raw({ action: 'tokenInfo', t: tNan, d: 'devN-12345678' });
const nan = conf({ action: 'tokenConfirm', t: tNan, d: 'devN-12345678', lat: 'abc', lng: 'xyz' });
check('Link', 'GPS: rəqəm olmayan koordinat qəbul olunmur', !nan.ok, nan.ok ? 'lat="abc" ilə gəliş yazıldı (məsafə NaN)' : nan.error);
if (nan.ok) { sheet('Attendance').filter(a => a.workerId === w1).forEach(() => {}); }
// reset attendance for further tests: use OUT kind instead
const far = (() => { const t = F1('createToken', { kind: 'OUT', workerId: w1, siteId: s1.id }).data.token; raw({ action: 'tokenInfo', t, d: 'devA-12345678' }); return conf({ action: 'tokenConfirm', t, d: 'devA-12345678', lat: 41.0, lng: 49.0 }); })();
check('Link', 'GPS: radiusdan kənar rədd olunur', !far.ok && far.error === 'too_far');
const big = (() => { const t = F1('createToken', { kind: 'OUT', workerId: w1, siteId: s1.id }).data.token; raw({ action: 'tokenInfo', t, d: 'devA-12345678' }); return conf({ action: 'tokenConfirm', t, d: 'devA-12345678', lat: 999, lng: 999 }); })();
check('Link', 'GPS: mümkün olmayan koordinat (999) rədd olunur', !big.ok);
// money link amount secrecy
raw({ action: 'decide', token: A, type: 'adv', id: adv1.id, decision: 'approve', reason: '' });
const adv = F1('requestAdvance', { workerId: w1, amount: 77 }).data;
ad('decide', { type: 'adv', id: adv.id, decision: 'approve' });
F1('markAdvance', { id: adv.id, status: 'GIVEN' });
const ml = F1('moneyLink', { kind: 'ADV', id: adv.id }).data;
const info = raw({ action: 'tokenInfo', t: ml.token, d: 'devW-12345678' });
check('Link', 'Avans linkində məbləğ cavabda görünmür', !JSON.stringify(info).includes('77'), JSON.stringify(info).includes('77') ? 'cavabda 77 var' : '');
check('Link', 'Mənfi məbləğ qəbul olunmur', errOf({ action: 'tokenConfirm', t: ml.token, d: 'devW-12345678', amount: -77 }) === 'bad_amount');
check('Link', 'Mətn məbləğ qəbul olunmur', errOf({ action: 'tokenConfirm', t: ml.token, d: 'devW-12345678', amount: 'abc' }) === 'bad_amount');
raw({ action: 'tokenConfirm', t: ml.token, d: 'devW-12345678', amount: 70 });
check('Link', 'Link 2-ci dəfə işləmir (məbləği təxmin etmək olmur)', errOf({ action: 'tokenConfirm', t: ml.token, d: 'devW-12345678', amount: 77 }) === 'link_used');

// ================= INPUT
const evil = '=HYPERLINK("http://evil","x")';
const wEvil = ad('saveWorker', { worker: { name: evil, phone: '994551000099', foremanId: f1 } }).id;
const rawCell = env.state.sheets.Workers.rows.find(rw => rw[0] === wEvil)[1];
check('Daxil edilən data', 'Formula injection: "=" ilə başlayan mətn formula olmur', String(rawCell).startsWith("'"), String(rawCell).slice(0, 12));
const longName = 'A'.repeat(60000);
const lw = raw({ action: 'saveWorker', token: A, worker: { name: longName, phone: '994551000098', foremanId: f1 } });
const stored = lw.ok ? String(env.state.sheets.Workers.rows.find(rw => rw[0] === lw.data.id)[1]).length : 0;
check('Daxil edilən data', 'Çox uzun mətn (60 000 simvol) kəsilir — Sheets limiti 50 000', !lw.ok || stored <= 50000, lw.ok ? stored + ' simvol yazıldı' : lw.error);
const bigAdv = F1('requestAdvance', { workerId: w1, amount: 1e12 });
check('Daxil edilən data', 'Absurd məbləğ (1 000 000 000 000 ₼) rədd olunur', !bigAdv.ok, bigAdv.ok ? 'qəbul olundu' : bigAdv.error);
const badDate = F1('manualAttendance', { workerId: w1, siteId: s1.id, kind: 'IN', reason: 'x', date: 'abcd-ef-gh' });
check('Daxil edilən data', 'Səhv tarix formatı rədd olunur', !badDate.ok, badDate.ok ? 'tarix "' + badDate.data.date + '" yazıldı' : badDate.error);
const fut = F1('manualAttendance', { workerId: w1, siteId: s1.id, kind: 'IN', reason: 'x', date: '2099-01-01' });
check('Daxil edilən data', 'Gələcək tarixə davamiyyət rədd olunur', !fut.ok, fut.ok ? '2099-01-01 yazıldı' : fut.error);
const dup = F1('saveWorkEntry', { entry: { siteId: s1.id, workTypeId: wt, qty: 10 }, shares: [{ workerId: w1, share: 50 }, { workerId: w1, share: 50 }] });
check('Daxil edilən data', 'Eyni usta payda 2 dəfə ola bilməz', !dup.ok, dup.ok ? 'eyni usta 2 dəfə yazıldı' : dup.error);
const negQty = F1('saveWorkEntry', { entry: { siteId: s1.id, workTypeId: wt, qty: -5 }, shares: [{ workerId: w1, share: 100 }] });
check('Daxil edilən data', 'Mənfi həcm rədd olunur', !negQty.ok);
const hugeQty = F1('saveWorkEntry', { entry: { siteId: s1.id, workTypeId: wt, qty: 1e9 }, shares: [{ workerId: w1, share: 100 }] });
check('Daxil edilən data', 'Absurd həcm (1 000 000 000) rədd olunur', !hugeQty.ok, hugeQty.ok ? 'qəbul olundu' : hugeQty.error);
const xss = '<img src=x onerror=alert(1)>';
const wx = ad('saveWorker', { worker: { name: xss, phone: '994551000097', foremanId: f1 } });
check('Daxil edilən data', 'XSS mətni serverdə dəyişmədən saxlanır (ekranda escape yoxlanır — brauzer testi)', String(env.state.sheets.Workers.rows.find(rw => rw[0] === wx.id)[1]) === xss);
const offline = F1('requestAdvance', { workerId: w1, amount: 5, offlineAt: '2020-01-01T10:00:00' });
check('Daxil edilən data', '3 gündən köhnə oflayn qeyd rədd olunur', offline.error === 'offline_expired');

// ================= report
const fails = results.filter(x => !x.ok);
for (const x of results) console.log((x.ok ? 'PASS' : 'FAIL') + ' | ' + x.area + ' | ' + x.name + (x.info ? ' | ' + x.info : ''));
console.log('\nCƏMİ: ' + results.length + ' yoxlama, ' + (results.length - fails.length) + ' keçdi, ' + fails.length + ' problem');
require('fs').writeFileSync(__dirname + '/sec.result.json', JSON.stringify(results, null, 1));
process.exit(fails.length ? 1 : 0);
