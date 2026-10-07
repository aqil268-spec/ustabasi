/*
 * Master — control server (superadmin panel only). No company data here.
 * Start: node server/node/control-server.js
 * Env: DATABASE_URL (control DB), PORT, SUPERADMIN_PASSWORD, CONTROL_SECRET, RENDER_API_KEY, RENDER_OWNER_ID,
 *      RESEND_API_KEY, MAIL_FROM, SUPERADMIN_EMAIL (see control.js).
 */
'use strict';
process.env.TZ = process.env.TZ || 'Asia/Baku';
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const control = require('./control');

const PORT = Number(process.env.PORT || 10000);
const MAX_BODY = 1024 * 1024;
const PAGE = fs.readFileSync(path.join(__dirname, 'super.html'), 'utf8');
if (!process.env.SUPERADMIN_PASSWORD || String(process.env.SUPERADMIN_PASSWORD).length < 12) {
  console.error('SUPERADMIN_PASSWORD must be set (12+ characters)'); process.exit(1);
}
const pool = store.makePool(process.env.DATABASE_URL);
let ready = false;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '') || '/';
  try {
    if (p === '/health') { res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: ready })); }
    if (!ready) { res.writeHead(503); return res.end('starting'); }
    if (p === '/' || p === '/super' || p.startsWith('/super/')) return await control.handle(req, res, p, readBody, PAGE);
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'server' })); }
  }
});

// Scheduled work: DNS every 10 min, license sync + stats every hour, e-mails once a day after 09:00 (Baku).
let lastHourly = 0, lastMailDay = '';
async function tick() {
  try { await control.dnsJobs(); } catch (e) { console.error('dns jobs', e.message); }
  if (Date.now() - lastHourly > 55 * 60000) { lastHourly = Date.now(); try { await control.hourlyJobs(); } catch (e) { console.error('hourly', e.message); } }
  const now = new Date(), day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baku', hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour >= 9 && day !== lastMailDay) { lastMailDay = day; try { await control.mailJobs(); } catch (e) { console.error('mail', e.message); } }
}

async function main() {
  await control.init(pool);
  ready = true;
  server.listen(PORT, () => console.log('Master control server on :' + PORT));
  setTimeout(() => tick().catch(() => {}), 20000).unref();
  setInterval(() => tick().catch(() => {}), 10 * 60000).unref();
}
process.on('SIGTERM', () => { server.close(); pool.end().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref(); });
main().catch(e => { console.error('start failed:', e); process.exit(1); });
