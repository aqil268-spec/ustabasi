/*
 * Superadmin panel (/super): creates and manages one Render server + one PostgreSQL per company.
 * Runs only where SUPERADMIN_PASSWORD is set (the control server). Company servers do not have it,
 * so they do not have /super and do not know about the superadmin.
 *
 * Env (control server only):
 *   SUPERADMIN_PASSWORD  — panel password
 *   RENDER_API_KEY       — Render API key (Account Settings → API Keys)
 *   RENDER_OWNER_ID      — Render workspace id (tea-…)
 *   COMPANY_REPO, COMPANY_BRANCH, COMPANY_REGION — optional (defaults below)
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = (process.env.RENDER_API_BASE || 'https://api.render.com/v1').replace(/\/+$/, '');
const REPO = process.env.COMPANY_REPO || 'https://github.com/aqil268-spec/ustabasi';
const BRANCH = process.env.COMPANY_BRANCH || 'node-server';
const REGION = process.env.COMPANY_REGION || 'frankfurt';
const WEB_PLANS = ['free', 'starter', 'standard'];
const DB_PLANS = ['basic_256mb', 'basic_1gb', 'basic_4gb'];
const SESSION_MS = 8 * 3600 * 1000;
const POLL_MS = Number(process.env.CONTROL_POLL_MS || 10000);

let pool = null;
const sessions = new Map();          // token → expires
const fails = new Map();             // ip → { n, until }
let globalFails = { n: 0, since: Date.now(), until: 0 };
const running = new Set();           // company ids with a running create job
const PAGE = fs.readFileSync(path.join(__dirname, 'super.html'), 'utf8');

const enabled = () => !!process.env.SUPERADMIN_PASSWORD;
const hasApi = () => !!(process.env.RENDER_API_KEY && process.env.RENDER_OWNER_ID);

// ---------------------------------------------------------------- storage
const DDL = `
create table if not exists ctl_companies (
  id serial primary key,
  slug text unique not null,
  name text not null,
  admin_phone text not null,
  admin_password text not null,
  web_plan text not null,
  db_plan text not null,
  region text not null,
  status text not null default 'creating',
  step text not null default '',
  error text not null default '',
  pg_id text not null default '',
  svc_id text not null default '',
  svc_url text not null default '',
  domains jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);`;

async function init(p) {
  pool = p;
  await pool.q(DDL);
  // Resume jobs that stopped when the server restarted.
  if (hasApi()) {
    const open = await pool.q("select id from ctl_companies where status = 'creating'");
    open.forEach(c => startJob(c.id));
  }
  setInterval(() => { const now = Date.now(); for (const [k, e] of sessions) if (e < now) sessions.delete(k); }, 600000).unref();
}

const getCompany = async id => (await pool.q('select * from ctl_companies where id = $1', [Number(id)]))[0] || null;
async function setCompany(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k, i) => k + ' = $' + (i + 2) + (k === 'domains' ? '::jsonb' : '')).join(', ');
  await pool.q('update ctl_companies set ' + sets + ', updated_at = now() where id = $1',
    [Number(id)].concat(keys.map(k => (k === 'domains' ? JSON.stringify(patch[k]) : patch[k]))));
}

// ---------------------------------------------------------------- Render API
async function render(method, p, body) {
  const r = await fetch(API + p, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.RENDER_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    const msg = data && data.message ? data.message : String(text).slice(0, 300);
    throw Object.assign(new Error('Render API ' + r.status + ': ' + msg), { status: r.status });
  }
  return data;
}
const unwrap = (x, k) => (x && x[k] ? x[k] : x);

// ---------------------------------------------------------------- helpers
function slugify(s) {
  const map = { ə: 'e', ı: 'i', ö: 'o', ü: 'u', ş: 's', ç: 'c', ğ: 'g', Ə: 'e', I: 'i', İ: 'i', Ö: 'o', Ü: 'u', Ş: 's', Ç: 'c', Ğ: 'g' };
  return String(s || '').replace(/[əıöüşçğƏIİÖÜŞÇĞ]/g, c => map[c] || c).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/, '');
}
function newPassword() {
  const pick = (set, n) => Array.from(crypto.randomBytes(n), b => set[b % set.length]).join('');
  const s = pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2) + pick('abcdefghijkmnpqrstuvwxyz', 5) + pick('23456789', 3) + pick('#@%+', 1);
  return s.split('').sort(() => crypto.randomInt(3) - 1).join('');
}
const cleanPhone = s => String(s || '').replace(/\D/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function publicView(c, withSecret) {
  const o = {
    id: c.id, slug: c.slug, name: c.name, status: c.status, step: c.step, error: c.error,
    adminPhone: c.admin_phone, webPlan: c.web_plan, dbPlan: c.db_plan, region: c.region,
    url: c.svc_url, domains: c.domains || [], created: c.created_at,
    renderService: c.svc_id ? 'https://dashboard.render.com/web/' + c.svc_id : '',
    renderDb: c.pg_id ? 'https://dashboard.render.com/d/' + c.pg_id : ''
  };
  if (withSecret) o.adminPassword = c.admin_password;
  return o;
}

// ---------------------------------------------------------------- create job
function startJob(id) {
  if (running.has(id)) return;
  running.add(id);
  createCompany(id).catch(async e => {
    console.error('company', id, 'failed:', e.message);
    try { await setCompany(id, { status: 'failed', error: String(e.message).slice(0, 500) }); } catch (e2) { /* ignore */ }
  }).finally(() => running.delete(id));
}

async function createCompany(id) {
  let c = await getCompany(id);
  if (!c) return;
  const owner = process.env.RENDER_OWNER_ID;
  await setCompany(id, { status: 'creating', error: '' });

  if (!c.pg_id) {
    await setCompany(id, { step: 'Baza yaradılır' });
    const name = 'm_' + c.slug.replace(/-/g, '_');
    const pg = unwrap(await render('POST', '/postgres', {
      name: 'm-' + c.slug + '-db', ownerId: owner, plan: c.db_plan, version: '16', region: c.region,
      databaseName: name, databaseUser: name
    }), 'postgres');
    await setCompany(id, { pg_id: pg.id });
    c = await getCompany(id);
  }

  await setCompany(id, { step: 'Baza hazırlanır (2–5 dəq)' });
  for (let i = 0; ; i++) {
    const pg = unwrap(await render('GET', '/postgres/' + c.pg_id), 'postgres');
    if (pg.status === 'available') break;
    if (/fail|suspend/i.test(String(pg.status))) throw new Error('Baza statusu: ' + pg.status);
    if (i * POLL_MS > 30 * 60000) throw new Error('Baza 30 dəqiqədə hazır olmadı');
    await sleep(POLL_MS);
  }
  const conn = await render('GET', '/postgres/' + c.pg_id + '/connection-info');
  if (!conn || !conn.internalConnectionString) throw new Error('Bazanın ünvanı alınmadı');

  if (!c.svc_id) {
    await setCompany(id, { step: 'Server yaradılır' });
    const created = await render('POST', '/services', {
      type: 'web_service', name: 'm-' + c.slug, ownerId: owner, repo: REPO, branch: BRANCH, autoDeploy: 'no',
      envVars: [
        { key: 'DATABASE_URL', value: conn.internalConnectionString },
        { key: 'SERVE_APP', value: '1' },
        { key: 'COMPANY_NAME', value: c.name },
        { key: 'ADMIN_NAME', value: 'Admin' },
        { key: 'ADMIN_PHONE', value: c.admin_phone },
        { key: 'ADMIN_PASSWORD', value: c.admin_password },
        { key: 'NODE_VERSION', value: '22' },
        { key: 'TZ', value: 'Asia/Baku' }
      ],
      serviceDetails: {
        runtime: 'node', plan: c.web_plan, region: c.region, numInstances: 1, healthCheckPath: '/health',
        envSpecificDetails: { buildCommand: 'cd server/node && npm install --omit=dev', startCommand: 'node server/node/index.js' }
      }
    });
    const svc = unwrap(created, 'service');
    const url = (svc.serviceDetails && svc.serviceDetails.url) || (svc.slug ? 'https://' + svc.slug + '.onrender.com' : '');
    await setCompany(id, { svc_id: svc.id, svc_url: url });
  }
  await setCompany(id, { status: 'ready', step: 'Server ilk dəfə qurulur (3–5 dəq)' });
}

// ---------------------------------------------------------------- auth
function ipOf(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function checkPassword(pw) {
  const a = crypto.createHash('sha256').update(String(pw || '')).digest();
  const b = crypto.createHash('sha256').update(String(process.env.SUPERADMIN_PASSWORD)).digest();
  return crypto.timingSafeEqual(a, b);
}
function login(req, pw) {
  const ip = ipOf(req), now = Date.now();
  const f = fails.get(ip) || { n: 0, until: 0 };
  if (f.until > now || globalFails.until > now) return { ok: false, error: 'locked' };
  if (!checkPassword(pw)) {
    f.n++; if (f.n >= 5) { f.until = now + 15 * 60000; f.n = 0; }
    fails.set(ip, f);
    if (now - globalFails.since > 3600000) globalFails = { n: 0, since: now, until: 0 };
    if (++globalFails.n >= 20) globalFails.until = now + 15 * 60000;
    console.warn('super: bad login from', ip);
    return { ok: false, error: 'bad_login' };
  }
  fails.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, now + SESSION_MS);
  console.log('super: login from', ip);
  return { ok: true, token };
}
function authed(token) { const e = sessions.get(String(token || '')); return !!e && e > Date.now(); }

// ---------------------------------------------------------------- actions
const ACTIONS = {
  async list() {
    const rows = await pool.q('select * from ctl_companies order by id');
    return { companies: rows.map(c => publicView(c, false)), api: hasApi(), repo: REPO, branch: BRANCH, region: REGION, webPlans: WEB_PLANS, dbPlans: DB_PLANS };
  },

  async create(b) {
    if (!hasApi()) throw new Error('RENDER_API_KEY və ya RENDER_OWNER_ID yoxdur');
    const name = String(b.name || '').trim().slice(0, 80);
    const slug = slugify(b.slug || name);
    const phone = cleanPhone(b.adminPhone);
    if (!name) throw new Error('Şirkətin adını yazın');
    if (slug.length < 3) throw new Error('Qısa ad (slug) ən azı 3 simvol olmalıdır: a-z, 0-9, -');
    if (!/^994\d{9}$/.test(phone)) throw new Error('Admin telefonu 994XXXXXXXXX formatında olmalıdır');
    const web = WEB_PLANS.indexOf(b.webPlan) >= 0 ? b.webPlan : 'starter';
    const db = DB_PLANS.indexOf(b.dbPlan) >= 0 ? b.dbPlan : 'basic_256mb';
    if ((await pool.q('select 1 from ctl_companies where slug = $1', [slug])).length) throw new Error('Bu qısa ad artıq var: ' + slug);
    const row = (await pool.q(
      'insert into ctl_companies (slug, name, admin_phone, admin_password, web_plan, db_plan, region, step) values ($1, $2, $3, $4, $5, $6, $7, $8) returning *',
      [slug, name, phone, newPassword(), web, db, REGION, 'Növbədə']))[0];
    startJob(row.id);
    return { company: publicView(row, true) };
  },

  async retry(b) {
    const c = await getCompany(b.id);
    if (!c) throw new Error('Şirkət tapılmadı');
    if (c.status !== 'failed') throw new Error('Yalnız xəta ilə dayanan quraşdırma təkrarlanır');
    startJob(c.id);
    return { ok: true };
  },

  /** Everything about one company: login, URLs, live status and DB connection (from Render). */
  async info(b) {
    const c = await getCompany(b.id);
    if (!c) throw new Error('Şirkət tapılmadı');
    const out = { company: publicView(c, true), db: null, deploy: null, domains: [] };
    if (!hasApi()) return out;
    if (c.pg_id) {
      try {
        const pg = unwrap(await render('GET', '/postgres/' + c.pg_id), 'postgres');
        const conn = await render('GET', '/postgres/' + c.pg_id + '/connection-info');
        out.db = { status: pg.status, plan: pg.plan, expiresAt: pg.expiresAt || null, database: pg.databaseName, user: pg.databaseUser,
          internal: conn.internalConnectionString, external: conn.externalConnectionString, psql: conn.psqlCommand };
      } catch (e) { out.db = { error: e.message }; }
    }
    if (c.svc_id) {
      try {
        const d = await render('GET', '/services/' + c.svc_id + '/deploys?limit=1');
        const dep = Array.isArray(d) && d[0] ? unwrap(d[0], 'deploy') : null;
        out.deploy = dep ? { status: dep.status, finishedAt: dep.finishedAt || null } : null;
      } catch (e) { out.deploy = { error: e.message }; }
      try {
        const doms = await render('GET', '/services/' + c.svc_id + '/custom-domains');
        out.domains = (Array.isArray(doms) ? doms : []).map(x => unwrap(x, 'customDomain')).map(x => ({ name: x.name, status: x.verificationStatus || x.status || '' }));
      } catch (e) { /* ignore */ }
    }
    return out;
  },

  /** New temporary admin password: sets env vars and redeploys the company server. */
  async resetAdmin(b) {
    const c = await getCompany(b.id);
    if (!c || !c.svc_id) throw new Error('Şirkətin serveri yoxdur');
    const phone = cleanPhone(b.adminPhone || c.admin_phone);
    if (!/^994\d{9}$/.test(phone)) throw new Error('Admin telefonu 994XXXXXXXXX formatında olmalıdır');
    const pw = newPassword();
    await render('PUT', '/services/' + c.svc_id + '/env-vars/ADMIN_PHONE', { value: phone });
    await render('PUT', '/services/' + c.svc_id + '/env-vars/ADMIN_PASSWORD', { value: pw });
    await render('PUT', '/services/' + c.svc_id + '/env-vars/ADMIN_RESET', { value: 'reset-' + Date.now() });
    await render('POST', '/services/' + c.svc_id + '/deploys', {});
    await setCompany(c.id, { admin_password: pw, admin_phone: phone });
    return { adminPhone: phone, adminPassword: pw };
  },

  async addDomain(b) {
    const c = await getCompany(b.id);
    if (!c || !c.svc_id) throw new Error('Şirkətin serveri yoxdur');
    const domain = String(b.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) throw new Error('Domen düzgün deyil (məs. app.sirket.az)');
    await render('POST', '/services/' + c.svc_id + '/custom-domains', { name: domain });
    const doms = Array.from(new Set((c.domains || []).concat([domain])));
    await setCompany(c.id, { domains: doms });
    const target = String(c.svc_url).replace(/^https?:\/\//, '');
    const apex = domain.split('.').length === 2;
    return { domain, dns: apex ? { type: 'A', name: '@', value: '216.24.57.1' } : { type: 'CNAME', name: domain.split('.')[0], value: target } };
  },

  /** New code for every company: one deploy per company server. */
  async deployAll() {
    const rows = await pool.q("select * from ctl_companies where svc_id <> '' order by id");
    const out = [];
    for (const c of rows) {
      try { await render('POST', '/services/' + c.svc_id + '/deploys', {}); out.push({ slug: c.slug, ok: true }); }
      catch (e) { out.push({ slug: c.slug, ok: false, error: e.message }); }
    }
    return { results: out };
  }
};

// ---------------------------------------------------------------- HTTP
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}

async function handle(req, res, p, readBody) {
  if (req.method === 'GET' && p === '/super') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    });
    return res.end(PAGE);
  }
  const m = p.match(/^\/super\/api\/(\w+)$/);
  if (!m || req.method !== 'POST') return sendJson(res, 404, { ok: false, error: 'not_found' });
  let b = {};
  try { b = JSON.parse(await readBody(req) || '{}'); } catch (e) { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
  const act = m[1];
  if (act === 'login') { const r = login(req, b.password); return sendJson(res, r.ok ? 200 : 403, r); }
  if (!authed(b.token)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
  if (act === 'logout') { sessions.delete(String(b.token)); return sendJson(res, 200, { ok: true }); }
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, act)) return sendJson(res, 404, { ok: false, error: 'not_found' });
  try {
    const data = await ACTIONS[act](b);
    if (act !== 'list' && act !== 'info') console.log('super:', act, b.id || b.name || '');
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    return sendJson(res, 200, { ok: false, error: e.message });
  }
}

module.exports = { enabled, init, handle, slugify, newPassword };
