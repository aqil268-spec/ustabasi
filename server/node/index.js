/*
 * Master — HTTP server (Node.js + PostgreSQL).
 * Same API as the Apps Script web app: POST JSON body → JSON answer.
 * Env: DATABASE_URL (required), PORT, PUBLIC_URL, ADMIN_NAME, ADMIN_PHONE, ADMIN_PASSWORD, ADMIN_EMAIL, CORS_ORIGIN.
 */
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Baku';
const http = require('http');
const path = require('path');
const { createRuntime, formatDate, TZ } = require('./runtime');
const store = require('./store');

const PORT = Number(process.env.PORT || 10000);
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT).replace(/\/+$/, '');
const CODE = process.env.CODE_FILE || path.join(__dirname, '..', 'Code.gs');
const MAX_BODY = 30 * 1024 * 1024;
const CORS = process.env.CORS_ORIGIN || '*';

const pool = store.makePool(process.env.DATABASE_URL);
const rt = createRuntime({ publicUrl: PUBLIC_URL });
let ready = false;
let viewsFor = '';

// ---------- one job at a time (same as the Apps Script lock) ----------
let queue = Promise.resolve();
function serial(fn) {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

/** Runs fn (sync, inside Code.gs), then writes the changes. On a write error the memory is rolled back. */
async function runAndSave(fn) {
  let result;
  try { result = fn(); } finally {
    if (rt.hasChanges()) {
      const ch = rt.takeChanges();
      try {
        await store.persist(pool, rt, ch);
      } catch (e) {
        console.error('persist failed, reloading state:', e);
        rt.replaceState(await store.loadAll(pool));
        throw Object.assign(new Error('busy'), { code: 'busy' });
      }
    }
  }
  const sid = rt.state.props.SHEET_ID || '';
  if (sid && sid !== viewsFor) {
    try { await store.refreshViews(pool, rt.api.SCHEMA, sid); viewsFor = sid; } catch (e) { console.error('views:', e.message); }
  }
  return result;
}

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > MAX_BODY) { reject(Object.assign(new Error('too_large'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (p === '/health') return send(res, ready ? 200 : 503, JSON.stringify({ ok: ready }));
    if (!ready) return send(res, 503, JSON.stringify({ ok: false, error: 'busy', detail: 'starting' }));

    const fm = p.match(/^\/files\/([a-f0-9]{32})(?:\/[^/]*)?$/);
    if (req.method === 'GET' && fm) {
      const f = await store.getFile(pool, fm[1]);
      if (!f || !/^(image\/|application\/pdf$)/.test(f.mime)) return send(res, 404, 'not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': f.data.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'Access-Control-Allow-Origin': CORS, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="' + String(f.name).replace(/[^\w.\-]/g, '_') + '"' });
      return res.end(f.data);
    }
    if (p === '/' || p === '/exec') {
      if (req.method === 'GET') {
        const out = await serial(() => runAndSave(() => rt.api.doGet({ parameter: Object.fromEntries(url.searchParams) })));
        return send(res, 200, out.s);
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        const out = await serial(() => runAndSave(() => rt.api.doPost({ postData: { contents: body, type: 'text/plain' }, parameter: {} })));
        return send(res, 200, out.s);
      }
    }
    return send(res, 404, JSON.stringify({ ok: false, error: 'not_found' }));
  } catch (e) {
    if (e.code === 413) return send(res, 413, JSON.stringify({ ok: false, error: 'too_large' }));
    const busy = e.code === 'busy';
    if (!busy) console.error(e);
    return send(res, busy ? 503 : 500, JSON.stringify({ ok: false, error: busy ? 'busy' : 'server' }));
  }
});

// ---------- scheduled jobs (replaces Apps Script triggers) ----------
const JOBS = [
  { name: 'hourly', due: (now, last) => !last || now - last >= 59 * 60000 },
  { name: 'dailyBackup', due: (now, last) => hourBaku(now) >= 2 && dayBaku(now) !== (last && dayBaku(last)) },
  { name: 'cleanup', due: (now, last) => hourBaku(now) >= 3 && dayBaku(now) !== (last && dayBaku(last)) },
  { name: 'weeklyMail', due: (now, last) => hourBaku(now) >= 4 && (!last || now - last >= 7 * 86400000 - 3600000) }
];
const hourBaku = d => Number(formatDate(d, TZ, 'HH'));
const dayBaku = d => formatDate(d, TZ, 'yyyy-MM-dd');

async function tick() {
  if (!ready) return;
  for (const j of JOBS) {
    if (rt.state.triggers.indexOf(j.name) < 0 || typeof rt.api[j.name] !== 'function') continue;
    try {
      const last = await store.jobLastRun(pool, j.name);
      const now = new Date();
      if (!j.due(now, last)) continue;
      await serial(() => runAndSave(() => rt.api[j.name]()));
      await store.jobDone(pool, j.name);
      console.log('job done:', j.name);
    } catch (e) {
      console.error('job failed:', j.name, e && e.message);
      try { await store.jobDone(pool, j.name); } catch (e2) { /* ignore */ }   // do not retry every minute
    }
  }
}

async function main() {
  await store.init(pool);
  rt.load(CODE);
  rt.replaceState(await store.loadAll(pool));
  if (!rt.state.props.SHEET_ID) {
    console.log('First start: running setup()');
    await runAndSave(() => rt.api.setup());
  } else {
    await runAndSave(() => {});   // creates SQL views
  }
  ready = true;
  server.listen(PORT, () => console.log('Master server v' + rt.api.VERSION + ' on :' + PORT + ' (' + PUBLIC_URL + ')'));
  setInterval(() => { tick().catch(e => console.error('tick', e)); }, 60000).unref();
}

function stop() {
  console.log('stopping…');
  server.close();
  queue.finally(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

if (require.main === module) {
  main().catch(e => { console.error('start failed:', e); process.exit(1); });
}
module.exports = { main, rt, pool };
