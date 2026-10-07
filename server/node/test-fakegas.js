/*
 * Test adapter: gives the old tests (tests/*.test.js) the same `load()` as tests/fakegas.js,
 * but Code.gs runs on the real Node runtime (runtime.js).
 * With TEST_DATABASE_URL set, every change is also written to PostgreSQL; at exit the data
 * is read back and compared with memory.
 */
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Baku';
const { createRuntime } = require('./runtime');

function load(file) {
  const rt = createRuntime({ publicUrl: 'http://test', log: () => {} });
  rt.load(file);
  const api = rt.api;
  const pending = [];
  const env = rt.env;
  // tests read env.state.sheets[name].rows of the main spreadsheet
  env.state = {
    get sheets() { const id = rt.state.props.SHEET_ID; return id && rt.state.books[id] ? rt.state.books[id].sheets : {}; }
  };
  env.props = rt.state.props;
  env.C = {}; env.reset = () => {}; env.endExec = () => {};
  const take = () => { if (rt.hasChanges()) pending.push(rt.takeChanges()); };
  const wrap = name => { const f = api[name]; if (f) api[name] = (...a) => { try { return f(...a); } finally { take(); } }; };
  ['setup', 'cleanup', 'hourly', 'dailyBackup', 'seedTestData', 'removeTestData', 'setAdminLogin'].forEach(wrap);

  function call(body, allowFail) {
    let out;
    try { out = api.doPost({ postData: { contents: JSON.stringify(body) } }); } finally { take(); }
    const j = JSON.parse(out.s);
    if (!j.ok && !allowFail) throw new Error(body.action + ': ' + j.error + ' ' + (j.detail || ''));
    return { j, calls: {}, bytes: out.s.length };
  }

  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    let done = false;
    process.on('beforeExit', async () => {
      if (done) return; done = true;
      const store = require('./store');
      const pool = store.makePool(url);
      try {
        await pool.q('drop table if exists gas_books, gas_sheets, gas_rows, gas_props, gas_files, gas_triggers, gas_jobs cascade; drop schema if exists app cascade;');
        await store.init(pool);
        take();
        for (const ch of pending) await store.persist(pool, rt, ch);
        await store.refreshViews(pool, api.SCHEMA, rt.state.props.SHEET_ID);
        const back = await store.loadAll(pool);
        const norm = b => {
          const o = {};
          Object.keys(b).sort().forEach(id => {
            o[id] = { order: b[id].order.slice().sort(), sheets: {} };
            Object.keys(b[id].sheets).forEach(n => {
              const rows = b[id].sheets[n].rows.map(r => Array.from(r || [], v => (v === undefined || v === null ? '' : v)));
              while (rows.length && rows[rows.length - 1].every(v => v === '')) rows.pop();
              o[id].sheets[n] = rows.map(r => { const x = r.slice(); while (x.length && x[x.length - 1] === '') x.pop(); return x; });
            });
          });
          return JSON.stringify(o);
        };
        const same = norm(back.books) === norm(rt.state.books);
        const propsSame = JSON.stringify(Object.entries(back.props).sort()) === JSON.stringify(Object.entries(rt.state.props).sort());
        const users = await pool.q('select count(*)::int as n from app."Users"');
        console.log('DB check:', same && propsSame ? 'PASS' : 'FAIL', '— changes:', pending.length, ', users in SQL view:', users[0].n);
        if (!same || !propsSame) process.exitCode = 1;
      } catch (e) {
        console.error('DB check: FAIL', e); process.exitCode = 1;
      } finally { await pool.end(); }
    });
  }
  return { env, ctx: env, api, call, rt };
}

function est() { return 0; }
module.exports = { load, est, COST: {} };
