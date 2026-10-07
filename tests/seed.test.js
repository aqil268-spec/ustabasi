const assert = require('assert');
const { load } = require('./fakegas');
const { env, api, call } = load(process.argv[2] || require('path').join(__dirname, '..', 'server', 'Code.gs'));
const sheet = n => { const rows = env.state.sheets[n].rows, H = rows[0]; return rows.slice(1).filter(r => r && r.some(v => v !== '' && v !== undefined)).map(r => Object.fromEntries(H.map((h, i) => [h, r[i] === undefined ? '' : r[i]]))); };
api.setup();
api.seedTestData();
assert.strictEqual(sheet('Users').filter(u => u.role === 'foreman').length, 3);
assert.strictEqual(sheet('Workers').length, 10);
assert.strictEqual(sheet('Customers').length, 5);
assert.strictEqual(sheet('Sites').filter(s => s.status === 'APPROVED').length, 5);
assert.strictEqual(sheet('Estimates').length, 19);
assert(sheet('WorkTypes').every(t => t.normType), 'norms');
api.seedTestData(); // ikinci dəfə — dəyişmir
assert.strictEqual(sheet('Workers').length, 10);
// foreman login works and sees own data
let r = call({ action: 'login', phone: '994509990001', password: 'Test#2026' }).j;
assert(r.ok && r.data.mustChange);
const t = r.data.token;
call({ action: 'setPassword', token: t, newPassword: 'Reşad#2026x' });
const b = call({ action: 'bootstrap', token: t }).j.data;
assert.strictEqual(b.workers.length, 4); assert.strictEqual(b.sites.length, 2);
// admin bootstrap
r = call({ action: 'login', phone: '994500000000', password: 'Master#2026' }).j;
call({ action: 'setPassword', token: r.data.token, newPassword: 'Admin#2026x' });
const ab = call({ action: 'bootstrap', token: r.data.token }).j.data;
assert.strictEqual(ab.settings.companyName, 'Master');
// create a transaction then remove all
const w = b.workers[0];
call({ action: 'requestAdvance', token: t, workerId: w.id, amount: 50, reason: 'test' }, true);
api.removeTestData();
assert.strictEqual(sheet('Workers').length, 0);
assert.strictEqual(sheet('Sites').length, 0);
assert.strictEqual(sheet('Estimates').length, 0);
assert.strictEqual(sheet('Advances').length, 0);
assert.strictEqual(sheet('Users').length, 1, 'admin stays');
assert.strictEqual(sheet('WorkTypes').length, 9, 'work types stay');
api.seedTestData();
assert.strictEqual(sheet('Workers').length, 10, 'reseed');
console.log('Test data testləri keçdi.');
