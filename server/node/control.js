/*
 * Master — superadmin control logic (runs only in control-server.js, never on a company server).
 * One Render web service + one PostgreSQL per company. Company servers do not know about the superadmin:
 * the panel talks to them through a hidden, signed channel (/_ctl/*, key CONTROL_KEY per company).
 *
 * Env: SUPERADMIN_PASSWORD, CONTROL_SECRET (encrypts the 2FA secret), RENDER_API_KEY, RENDER_OWNER_ID,
 *      RESEND_API_KEY, MAIL_FROM, SUPERADMIN_EMAIL, SUPERADMIN_2FA_RESET,
 *      COMPANY_REPO, COMPANY_BRANCH, COMPANY_REGION, RENDER_API_BASE, RESEND_API_BASE, RDAP_BASE.
 */
'use strict';
const crypto = require('crypto');
const dns = require('dns').promises;

const API = (process.env.RENDER_API_BASE || 'https://api.render.com/v1').replace(/\/+$/, '');
const RESEND = (process.env.RESEND_API_BASE || 'https://api.resend.com').replace(/\/+$/, '');
const RDAP = (process.env.RDAP_BASE || 'https://rdap.org').replace(/\/+$/, '');
const REPO = process.env.COMPANY_REPO || 'https://github.com/aqil268-spec/ustabasi';
const BRANCH = process.env.COMPANY_BRANCH || 'node-server';
const REGION = process.env.COMPANY_REGION || 'frankfurt';
const RENDER_APEX_IP = '216.24.57.1';
const WEB_PLANS = ['free', 'starter', 'standard', 'pro'];
const DB_PLANS = ['basic_256mb', 'basic_1gb', 'basic_4gb', 'pro_4gb'];
const PLAN_RAM_MB = { free: 512, starter: 512, standard: 2048, pro: 4096, basic_256mb: 256, basic_1gb: 1024, basic_4gb: 4096, pro_4gb: 4096 };
const CURRENCIES = ['AZN', 'USD', 'EUR'];
const SESSION_MS = 8 * 3600 * 1000;
const POLL_MS = Number(process.env.CONTROL_POLL_MS || 10000);
const TZ = 'Asia/Baku';

let pool = null;
const sessions = new Map();      // token → { exp, ip }
const pending2fa = new Map();    // temp token → { exp, secret? }
const fails = new Map();         // ip → { n, until }
let globalFails = { n: 0, since: Date.now(), until: 0 };
const running = new Set();

const hasApi = () => !!(process.env.RENDER_API_KEY && process.env.RENDER_OWNER_ID);
const hasMail = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysLeft = d => d ? Math.round((new Date(String(d).slice(0, 10) + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000) : null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanPhone = s => String(s || '').replace(/\D/g, '');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const numOrNull = v => (v === '' || v === null || v === undefined ? null : (isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : NaN));

// ================================================================ storage
const DDL = `
create table if not exists ctl_packages (
  id serial primary key, name text unique not null,
  max_foremen int, max_workers_per_foreman int, max_workers int,
  price numeric(12,2) not null default 0, currency text not null default 'AZN', note text not null default '',
  created_at timestamptz not null default now());
create table if not exists ctl_companies (
  id serial primary key, slug text unique not null, name text not null,
  admin_phone text not null, admin_password text not null,
  web_plan text not null, db_plan text not null, region text not null,
  status text not null default 'creating', step text not null default '', error text not null default '',
  pg_id text not null default '', svc_id text not null default '', svc_url text not null default '',
  domains jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table ctl_companies add column if not exists package_id int references ctl_packages(id);
alter table ctl_companies add column if not exists lic_overrides jsonb not null default '{}';
alter table ctl_companies add column if not exists license_until date;
alter table ctl_companies add column if not exists disabled boolean not null default false;
alter table ctl_companies add column if not exists monthly_price numeric(12,2);
alter table ctl_companies add column if not exists currency text not null default 'AZN';
alter table ctl_companies add column if not exists admin_email text not null default '';
alter table ctl_companies add column if not exists control_key text not null default '';
alter table ctl_companies add column if not exists lic_synced boolean not null default false;
alter table ctl_companies add column if not exists last_stats jsonb;
alter table ctl_companies add column if not exists last_stats_at timestamptz;
alter table ctl_companies add column if not exists notes text not null default '';
create table if not exists ctl_payments (
  id serial primary key, company_id int not null references ctl_companies(id),
  amount numeric(12,2) not null, currency text not null, paid_at date not null, until date, note text not null default '',
  created_at timestamptz not null default now());
create table if not exists ctl_domains (
  id serial primary key, company_id int not null references ctl_companies(id), name text unique not null,
  registrar text not null default '', price numeric(12,2), currency text not null default 'AZN', expires date,
  expires_source text not null default '', payer text not null default 'me', note text not null default '',
  render_status text not null default '', dns jsonb, dns_ok boolean not null default false, checked_at timestamptz,
  created_at timestamptz not null default now());
create table if not exists ctl_audit (id bigserial primary key, ts timestamptz not null default now(), ip text not null default '', action text not null, target text not null default '', details text not null default '');
create table if not exists ctl_kv (k text primary key, v text not null);
create table if not exists ctl_mail_log (k text primary key, sent_at timestamptz not null default now(), ok boolean not null, info text not null default '');
`;

async function init(p) {
  pool = p;
  await pool.q(DDL);
  if (!(await pool.q('select 1 from ctl_packages limit 1')).length) {
    await pool.q(`insert into ctl_packages (name, max_foremen, max_workers_per_foreman, max_workers, price, note) values
      ('Start', 3, 10, 30, 0, 'Kiçik komanda'), ('Biznes', 10, 20, 150, 0, 'Orta şirkət'), ('Pro', null, null, null, 0, 'Limitsiz')`);
  }
  await twofaResetFromEnv();
  if (hasApi()) (await pool.q("select id from ctl_companies where status = 'creating'")).forEach(c => startJob(c.id));
  setInterval(() => { const now = Date.now(); for (const [k, e] of sessions) if (e.exp < now) sessions.delete(k); for (const [k, e] of pending2fa) if (e.exp < now) pending2fa.delete(k); }, 300000).unref();
}

const kvGet = async k => { const r = await pool.q('select v from ctl_kv where k = $1', [k]); return r[0] ? r[0].v : null; };
const kvSet = (k, v) => pool.q('insert into ctl_kv (k, v) values ($1, $2) on conflict (k) do update set v = excluded.v', [k, v]);
const kvDel = k => pool.q('delete from ctl_kv where k = $1', [k]);
const auditLog = (ip, action, target, details) => pool.q('insert into ctl_audit (ip, action, target, details) values ($1, $2, $3, $4)', [ip || '', action, String(target || ''), details ? JSON.stringify(details).slice(0, 2000) : '']).catch(e => console.error('audit', e.message));

const getCompany = async id => (await pool.q('select * from ctl_companies where id = $1', [Number(id)]))[0] || null;
async function setCompany(id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const json = ['domains', 'lic_overrides', 'last_stats'];
  // JSON goes in as text and is cast in SQL (the driver would otherwise encode the string a second time).
  const sets = keys.map((k, i) => k + ' = $' + (i + 2) + (json.indexOf(k) >= 0 ? '::text::jsonb' : '')).join(', ');
  await pool.q('update ctl_companies set ' + sets + ', updated_at = now() where id = $1',
    [Number(id)].concat(keys.map(k => (json.indexOf(k) >= 0 && patch[k] !== null ? JSON.stringify(patch[k]) : patch[k]))));
}

// ================================================================ external APIs
async function http(url, opt) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, opt));
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { ok: r.ok, status: r.status, data };
}
async function render(method, p, body) {
  const r = await http(API + p, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.RENDER_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!r.ok) throw Object.assign(new Error('Render API ' + r.status + ': ' + (r.data && r.data.message ? r.data.message : String(r.data).slice(0, 300))), { status: r.status });
  return r.data;
}
const unwrap = (x, k) => (x && x[k] ? x[k] : x);

/** Signed call to a company server (hidden channel). */
async function companyCall(c, action, body) {
  if (!c.control_key || !c.svc_url) throw new Error('Şirkətin serveri ilə əlaqə qurulmayıb');
  const raw = JSON.stringify(body || {});
  const ts = String(Date.now());
  const sig = crypto.createHmac('sha256', c.control_key).update(ts + '.' + action + '.' + raw).digest('hex');
  const r = await http(c.svc_url.replace(/\/+$/, '') + '/_ctl/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ctl-Ts': ts, 'X-Ctl-Sig': sig }, body: raw });
  if (!r.ok || !r.data || !r.data.ok) throw new Error('Şirkət serveri cavab vermədi (' + r.status + (r.data && r.data.error ? ': ' + r.data.error : '') + ')');
  return r.data.data;
}

async function sendMail(to, subject, html) {
  if (!hasMail()) throw new Error('E-poçt qurulmayıb (RESEND_API_KEY, MAIL_FROM)');
  const r = await http(RESEND + '/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [].concat(to).filter(Boolean), subject, html })
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (r.data && r.data.message ? r.data.message : ''));
  return r.data;
}

// ================================================================ helpers
function slugify(s) {
  const map = { ə: 'e', ı: 'i', ö: 'o', ü: 'u', ş: 's', ç: 'c', ğ: 'g', Ə: 'e', I: 'i', İ: 'i', Ö: 'o', Ü: 'u', Ş: 's', Ç: 'c', Ğ: 'g' };
  return String(s || '').replace(/[əıöüşçğƏIİÖÜŞÇĞ]/g, c => map[c] || c).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/, '');
}
function newPassword() {
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]);
  const a = pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2).concat(pick('abcdefghijkmnpqrstuvwxyz', 5), pick('23456789', 3), pick('#@%+', 1));
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a.join('');
}
const TWO_LEVEL = ['com.az', 'net.az', 'org.az', 'edu.az', 'gov.az', 'info.az', 'biz.az', 'name.az', 'pp.az', 'co.uk', 'com.tr'];
function apexOf(domain) {
  const parts = domain.split('.');
  const last2 = parts.slice(-2).join('.');
  return TWO_LEVEL.indexOf(last2) >= 0 ? parts.slice(-3).join('.') : last2;
}
function cleanDomain(d) {
  return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
}

/** Effective license = package + company overrides. Empty = unlimited. */
function effectiveLicense(c, pkg) {
  const o = c.lic_overrides || {};
  const pick = (k, col) => (o[k] !== undefined && o[k] !== null && o[k] !== '' ? Number(o[k]) : (pkg && pkg[col] !== null && pkg[col] !== undefined ? Number(pkg[col]) : null));
  return {
    package: pkg ? pkg.name : '',
    maxForemen: pick('maxForemen', 'max_foremen'),
    maxWorkersPerForeman: pick('maxWorkersPerForeman', 'max_workers_per_foreman'),
    maxWorkers: pick('maxWorkers', 'max_workers'),
    until: c.license_until ? (c.license_until instanceof Date ? c.license_until.toISOString().slice(0, 10) : String(c.license_until).slice(0, 10)) : null,
    disabled: !!c.disabled
  };
}
async function licenseOf(c) {
  const pkg = c.package_id ? (await pool.q('select * from ctl_packages where id = $1', [c.package_id]))[0] : null;
  return effectiveLicense(c, pkg);
}
/** Sends the license to the company server. Failure is kept (lic_synced=false) and retried every hour. */
async function pushLicense(id) {
  const c = await getCompany(id);
  if (!c || !c.svc_id) return { ok: false, error: 'no_server' };
  try {
    await companyCall(c, 'license', { license: await licenseOf(c) });
    await setCompany(id, { lic_synced: true });
    return { ok: true };
  } catch (e) {
    await setCompany(id, { lic_synced: false });
    return { ok: false, error: e.message };
  }
}

function dateStr(d) { return d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null; }
function companyView(c, withSecret) {
  const o = {
    id: c.id, slug: c.slug, name: c.name, status: c.status, step: c.step, error: c.error,
    adminPhone: c.admin_phone, adminEmail: c.admin_email, webPlan: c.web_plan, dbPlan: c.db_plan, region: c.region,
    url: c.svc_url, packageId: c.package_id, overrides: c.lic_overrides || {}, licenseUntil: dateStr(c.license_until),
    licenseDaysLeft: daysLeft(dateStr(c.license_until)), disabled: c.disabled, licSynced: c.lic_synced,
    monthlyPrice: c.monthly_price === null ? null : Number(c.monthly_price), currency: c.currency, notes: c.notes,
    stats: c.last_stats || null, statsAt: c.last_stats_at, created: c.created_at,
    renderService: c.svc_id ? 'https://dashboard.render.com/web/' + c.svc_id : '',
    renderDb: c.pg_id ? 'https://dashboard.render.com/d/' + c.pg_id : ''
  };
  if (withSecret) o.adminPassword = c.admin_password;
  return o;
}
function domainView(d) {
  return {
    id: d.id, companyId: d.company_id, name: d.name, registrar: d.registrar, price: d.price === null ? null : Number(d.price), currency: d.currency,
    expires: dateStr(d.expires), daysLeft: daysLeft(dateStr(d.expires)), expiresSource: d.expires_source, payer: d.payer, note: d.note,
    renderStatus: d.render_status, dns: d.dns, dnsOk: d.dns_ok, checkedAt: d.checked_at
  };
}

// ================================================================ create company job
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
    const pg = unwrap(await render('POST', '/postgres', { name: 'm-' + c.slug + '-db', ownerId: owner, plan: c.db_plan, version: '16', region: c.region, databaseName: name, databaseUser: name }), 'postgres');
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
        { key: 'CONTROL_KEY', value: c.control_key },
        { key: 'SERVE_APP', value: '1' },
        { key: 'COMPANY_NAME', value: c.name },
        { key: 'ADMIN_NAME', value: 'Admin' },
        { key: 'ADMIN_PHONE', value: c.admin_phone },
        { key: 'ADMIN_PASSWORD', value: c.admin_password },
        { key: 'NODE_VERSION', value: '22' },
        { key: 'TZ', value: TZ }
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
  await setCompany(id, { status: 'ready', step: 'Server ilk dəfə qurulur (3–5 dəq). Lisenziya hazır olanda göndərilir.' });
}

// ================================================================ DNS / RDAP
async function checkDomain(d) {
  const c = await getCompany(d.company_id);
  const target = String(c && c.svc_url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const apex = apexOf(d.name);
  const isApex = apex === d.name;
  const out = { apex, isApex, target, ns: [], cname: [], a: [], want: isApex ? { type: 'A', name: '@', value: RENDER_APEX_IP } : { type: 'CNAME', name: d.name.slice(0, -apex.length - 1), value: target } };
  try { out.ns = (await dns.resolveNs(apex)).sort(); } catch (e) { out.nsError = e.code || e.message; }
  try { out.cname = await dns.resolveCname(d.name); } catch (e) { /* none */ }
  try { out.a = await dns.resolve4(d.name); } catch (e) { /* none */ }
  out.provider = out.ns.length ? (out.ns.some(n => /cloudflare/.test(n)) ? 'Cloudflare' : out.ns[0].split('.').slice(-2).join('.')) : '';
  const ok = isApex ? out.a.indexOf(RENDER_APEX_IP) >= 0 : out.cname.some(x => x.toLowerCase() === target.toLowerCase());
  let renderStatus = d.render_status;
  if (hasApi() && c && c.svc_id) {
    try {
      const doms = await render('GET', '/services/' + c.svc_id + '/custom-domains');
      const mine = (Array.isArray(doms) ? doms : []).map(x => unwrap(x, 'customDomain')).find(x => x.name === d.name);
      renderStatus = mine ? (mine.verificationStatus || mine.status || 'added') : 'not_added';
      if (mine && ok && renderStatus !== 'verified') { try { await render('POST', '/services/' + c.svc_id + '/custom-domains/' + encodeURIComponent(d.name) + '/verify'); } catch (e) { /* later */ } }
    } catch (e) { renderStatus = 'error: ' + e.message.slice(0, 80); }
  }
  const patch = [JSON.stringify(out), ok, renderStatus, d.id];
  await pool.q('update ctl_domains set dns = $1::text::jsonb, dns_ok = $2, render_status = $3, checked_at = now() where id = $4', patch);
  // Expiry date from RDAP (works for .com/.net/...; .az usually not → manual)
  if (!d.expires || d.expires_source === 'rdap') {
    try {
      const r = await http(RDAP + '/domain/' + encodeURIComponent(apex), { headers: { Accept: 'application/rdap+json' } });
      const ev = r.ok && r.data && Array.isArray(r.data.events) ? r.data.events.find(e => e.eventAction === 'expiration') : null;
      if (ev && ev.eventDate) await pool.q("update ctl_domains set expires = $1, expires_source = 'rdap' where id = $2", [String(ev.eventDate).slice(0, 10), d.id]);
    } catch (e) { /* manual */ }
  }
  return (await pool.q('select * from ctl_domains where id = $1', [d.id]))[0];
}

// ================================================================ 2FA (TOTP, Google Authenticator)
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function b32decode(s) { let bits = ''; for (const ch of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(secret, step) {
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1000000)).padStart(6, '0');
}
let lastTotpStep = 0;
function checkTotp(secret, code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const now = Math.floor(Date.now() / 30000);
  for (const s of [now - 1, now, now + 1]) {
    if (s > lastTotpStep && crypto.timingSafeEqual(Buffer.from(totp(secret, s)), Buffer.from(c))) { lastTotpStep = s; return true; }
  }
  return false;
}
function encKey() { return crypto.createHash('sha256').update('ctl|' + (process.env.CONTROL_SECRET || process.env.SUPERADMIN_PASSWORD)).digest(); }
function encrypt(text) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv); const d = Buffer.concat([c.update(text, 'utf8'), c.final()]); return [iv, c.getAuthTag(), d].map(x => x.toString('base64')).join('.'); }
function decrypt(s) { const [iv, tag, d] = s.split('.').map(x => Buffer.from(x, 'base64')); const c = crypto.createDecipheriv('aes-256-gcm', encKey(), iv); c.setAuthTag(tag); return Buffer.concat([c.update(d), c.final()]).toString('utf8'); }
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

async function twofaResetFromEnv() {
  const word = String(process.env.SUPERADMIN_2FA_RESET || '').trim();
  if (!word) return;
  const mark = sha('2fa|' + word);
  if (await kvGet('2fa_reset_mark') === mark) return;
  await kvDel('totp'); await kvDel('recovery');
  await kvSet('2fa_reset_mark', mark);
  await auditLog('', '2fa_reset_env', '', null);
  console.log('Superadmin 2FA reset: next login will set up a new authenticator');
}

// ================================================================ auth
function ipOf(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
function checkPassword(pw) {
  const a = crypto.createHash('sha256').update(String(pw || '')).digest();
  const b = crypto.createHash('sha256').update(String(process.env.SUPERADMIN_PASSWORD)).digest();
  return crypto.timingSafeEqual(a, b);
}
function lockedOut(ip) { const f = fails.get(ip), now = Date.now(); return (f && f.until > now) || globalFails.until > now; }
function addFail(ip) {
  const now = Date.now(), f = fails.get(ip) || { n: 0, until: 0 };
  f.n++; if (f.n >= 5) { f.until = now + 15 * 60000; f.n = 0; }
  fails.set(ip, f);
  if (now - globalFails.since > 3600000) globalFails = { n: 0, since: now, until: 0 };
  if (++globalFails.n >= 20) globalFails.until = now + 15 * 60000;
}
function newSession(ip) { const t = crypto.randomBytes(32).toString('hex'); sessions.set(t, { exp: Date.now() + SESSION_MS, ip }); return t; }

/** Step 1: password. Step 2: 6-digit code (or first-time setup). */
async function login(req, b) {
  const ip = ipOf(req);
  if (lockedOut(ip)) return { ok: false, error: 'locked' };
  const stored = await kvGet('totp');
  if (b.temp) {
    const p = pending2fa.get(String(b.temp));
    if (!p || p.exp < Date.now() || p.ip !== ip) return { ok: false, error: 'expired' };
    if (p.setup) {
      if (!checkTotp(p.setup, b.code)) { addFail(ip); return { ok: false, error: 'bad_code' }; }
      const codes = Array.from({ length: 10 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})/, '$1-'));
      await kvSet('totp', encrypt(p.setup));
      await kvSet('recovery', JSON.stringify(codes.map(sha)));
      pending2fa.delete(String(b.temp)); fails.delete(ip);
      await auditLog(ip, '2fa_setup', '', null);
      return { ok: true, token: newSession(ip), recoveryCodes: codes };
    }
    let ok = stored && checkTotp(decrypt(stored), b.code);
    if (!ok && b.code && /^[0-9A-F]{5}-[0-9A-F]{5}$/i.test(String(b.code).trim())) {
      const list = JSON.parse(await kvGet('recovery') || '[]'), h = sha(String(b.code).trim().toUpperCase());
      if (list.indexOf(h) >= 0) { ok = true; await kvSet('recovery', JSON.stringify(list.filter(x => x !== h))); await auditLog(ip, 'recovery_code_used', '', { left: list.length - 1 }); }
    }
    if (!ok) { addFail(ip); console.warn('super: bad 2fa code from', ip); return { ok: false, error: 'bad_code' }; }
    pending2fa.delete(String(b.temp)); fails.delete(ip);
    await auditLog(ip, 'login', '', null);
    return { ok: true, token: newSession(ip) };
  }
  if (!checkPassword(b.password)) { addFail(ip); console.warn('super: bad password from', ip); return { ok: false, error: 'bad_login' }; }
  const temp = crypto.randomBytes(24).toString('hex');
  if (!stored) {
    const secret = b32encode(crypto.randomBytes(20));
    pending2fa.set(temp, { exp: Date.now() + 10 * 60000, ip, setup: secret });
    return { ok: true, step: 'setup', temp, secret, uri: 'otpauth://totp/' + encodeURIComponent('Master:superadmin') + '?secret=' + secret + '&issuer=Master&digits=6&period=30' };
  }
  pending2fa.set(temp, { exp: Date.now() + 5 * 60000, ip });
  return { ok: true, step: 'code', temp };
}
function authed(token) { const s = sessions.get(String(token || '')); return !!s && s.exp > Date.now(); }

// ================================================================ actions
async function needCompany(id) { const c = await getCompany(id); if (!c) throw new Error('Şirkət tapılmadı'); return c; }
function validLicenseInput(o) {
  const out = {};
  ['maxForemen', 'maxWorkersPerForeman', 'maxWorkers'].forEach(k => { if (o && k in o) { const v = numOrNull(o[k]); if (Number.isNaN(v)) throw new Error('Limit müsbət tam ədəd olmalıdır'); if (v !== null) out[k] = v; } });
  return out;
}

const ACTIONS = {
  async overview() {
    const companies = await pool.q('select * from ctl_companies order by id');
    const packages = await pool.q('select * from ctl_packages order by id');
    const domains = await pool.q('select * from ctl_domains order by name');
    const pk = {}; packages.forEach(p => { pk[p.id] = p; });
    return {
      companies: companies.map(c => Object.assign(companyView(c, false), { license: effectiveLicense(c, pk[c.package_id]), domains: domains.filter(d => d.company_id === c.id).map(domainView) })),
      packages: packages.map(p => ({ id: p.id, name: p.name, maxForemen: p.max_foremen, maxWorkersPerForeman: p.max_workers_per_foreman, maxWorkers: p.max_workers, price: Number(p.price), currency: p.currency, note: p.note, used: companies.filter(c => c.package_id === p.id).length })),
      domains: domains.map(d => Object.assign(domainView(d), { company: (companies.find(c => c.id === d.company_id) || {}).name || '' })),
      config: { api: hasApi(), mail: hasMail(), superEmail: process.env.SUPERADMIN_EMAIL || '', repo: REPO, branch: BRANCH, region: REGION, webPlans: WEB_PLANS, dbPlans: DB_PLANS, currencies: CURRENCIES, planRam: PLAN_RAM_MB, today: today() }
    };
  },

  // ---- packages
  async savePackage(b) {
    const name = String(b.name || '').trim().slice(0, 40);
    if (!name) throw new Error('Paketin adını yazın');
    const lim = validLicenseInput(b);
    const price = Number(b.price || 0); if (!(price >= 0)) throw new Error('Qiymət düzgün deyil');
    const cur = CURRENCIES.indexOf(b.currency) >= 0 ? b.currency : 'AZN';
    const vals = [name, lim.maxForemen ?? null, lim.maxWorkersPerForeman ?? null, lim.maxWorkers ?? null, price, cur, String(b.note || '').slice(0, 200)];
    let id = Number(b.id) || 0;
    if (id) await pool.q('update ctl_packages set name=$1, max_foremen=$2, max_workers_per_foreman=$3, max_workers=$4, price=$5, currency=$6, note=$7 where id=$8', vals.concat([id]));
    else id = (await pool.q('insert into ctl_packages (name, max_foremen, max_workers_per_foreman, max_workers, price, currency, note) values ($1,$2,$3,$4,$5,$6,$7) returning id', vals))[0].id;
    const users = await pool.q('select id from ctl_companies where package_id = $1', [id]);
    const sync = []; for (const c of users) sync.push(await pushLicense(c.id));
    return { id, synced: sync.filter(x => x.ok).length, failed: sync.filter(x => !x.ok).length };
  },
  async deletePackage(b) {
    if ((await pool.q('select 1 from ctl_companies where package_id = $1 limit 1', [Number(b.id)])).length) throw new Error('Bu paket şirkətlərdə istifadə olunur');
    await pool.q('delete from ctl_packages where id = $1', [Number(b.id)]);
    return { ok: true };
  },

  // ---- companies
  async create(b) {
    if (!hasApi()) throw new Error('RENDER_API_KEY və ya RENDER_OWNER_ID yoxdur');
    const name = String(b.name || '').trim().slice(0, 80);
    const slug = slugify(b.slug || name);
    const phone = cleanPhone(b.adminPhone);
    if (!name) throw new Error('Şirkətin adını yazın');
    if (slug.length < 3) throw new Error('Qısa ad ən azı 3 simvol olmalıdır: a-z, 0-9, -');
    if (!/^994\d{9}$/.test(phone)) throw new Error('Admin telefonu 994XXXXXXXXX formatında olmalıdır');
    if (!isDate(b.licenseUntil)) throw new Error('Lisenziyanın son tarixini seçin');
    const pkg = Number(b.packageId) || null;
    if (pkg && !(await pool.q('select 1 from ctl_packages where id = $1', [pkg])).length) throw new Error('Paket tapılmadı');
    const web = WEB_PLANS.indexOf(b.webPlan) >= 0 ? b.webPlan : 'starter';
    const db = DB_PLANS.indexOf(b.dbPlan) >= 0 ? b.dbPlan : 'basic_256mb';
    if ((await pool.q('select 1 from ctl_companies where slug = $1', [slug])).length) throw new Error('Bu qısa ad artıq var: ' + slug);
    const row = (await pool.q(
      `insert into ctl_companies (slug, name, admin_phone, admin_password, web_plan, db_plan, region, step, package_id, license_until, admin_email, control_key, monthly_price, currency)
       values ($1,$2,$3,$4,$5,$6,$7,'Növbədə',$8,$9,$10,$11,$12,$13) returning *`,
      [slug, name, phone, newPassword(), web, db, REGION, pkg, b.licenseUntil, String(b.adminEmail || '').trim().slice(0, 120), crypto.randomBytes(32).toString('hex'),
        b.monthlyPrice === '' || b.monthlyPrice === undefined ? null : Number(b.monthlyPrice), CURRENCIES.indexOf(b.currency) >= 0 ? b.currency : 'AZN']))[0];
    startJob(row.id);
    return { company: companyView(row, true) };
  },

  /** Adds an existing Render service (e.g. the test company) to the panel. Sets CONTROL_KEY and redeploys it. */
  async attach(b) {
    if (!hasApi()) throw new Error('RENDER_API_KEY yoxdur');
    const svcId = String(b.serviceId || '').trim();
    if (!/^srv-[a-z0-9]+$/.test(svcId)) throw new Error('Render server ID (srv-…) yazın');
    if ((await pool.q('select 1 from ctl_companies where svc_id = $1', [svcId])).length) throw new Error('Bu server artıq paneldədir');
    const svc = unwrap(await render('GET', '/services/' + svcId), 'service');
    const name = String(b.name || svc.name).trim().slice(0, 80);
    const slug = slugify(b.slug || svc.name);
    const key = crypto.randomBytes(32).toString('hex');
    await render('PUT', '/services/' + svcId + '/env-vars/CONTROL_KEY', { value: key });
    await render('POST', '/services/' + svcId + '/deploys', {});
    const url = (svc.serviceDetails && svc.serviceDetails.url) || '';
    const row = (await pool.q(
      `insert into ctl_companies (slug, name, admin_phone, admin_password, web_plan, db_plan, region, status, step, svc_id, svc_url, pg_id, control_key, license_until, package_id)
       values ($1,$2,$3,'(mövcud — panel bilmir)',$4,$5,$6,'ready','Mövcud server qoşuldu. Server yenidən başlayır (1–3 dəq).',$7,$8,$9,$10,$11,$12) returning *`,
      [slug, name, cleanPhone(b.adminPhone) || '994500000000', (svc.serviceDetails && svc.serviceDetails.plan) || '', String(b.dbPlan || ''), (svc.serviceDetails && svc.serviceDetails.region) || REGION,
        svcId, url, String(b.pgId || '').trim(), key, isDate(b.licenseUntil) ? b.licenseUntil : addDays(today(), 30), Number(b.packageId) || null]))[0];
    return { company: companyView(row, true) };
  },

  async retry(b) {
    const c = await needCompany(b.id);
    if (c.status !== 'failed') throw new Error('Yalnız xəta ilə dayanan quraşdırma təkrarlanır');
    startJob(c.id);
    return { ok: true };
  },

  async info(b) {
    const c = await needCompany(b.id);
    const lic = await licenseOf(c);
    const domains = (await pool.q('select * from ctl_domains where company_id = $1 order by name', [c.id])).map(domainView);
    const payments = (await pool.q('select * from ctl_payments where company_id = $1 order by paid_at desc, id desc', [c.id])).map(p => ({ id: p.id, amount: Number(p.amount), currency: p.currency, paidAt: dateStr(p.paid_at), until: dateStr(p.until), note: p.note }));
    const out = { company: companyView(c, true), license: lic, domains, payments, db: null, deploy: null, live: null };
    if (hasApi() && c.pg_id) {
      try {
        const pg = unwrap(await render('GET', '/postgres/' + c.pg_id), 'postgres');
        const conn = await render('GET', '/postgres/' + c.pg_id + '/connection-info');
        out.db = { status: pg.status, plan: pg.plan, diskGb: pg.diskSizeGB || null, expiresAt: pg.expiresAt || null, database: pg.databaseName, user: pg.databaseUser, internal: conn.internalConnectionString, external: conn.externalConnectionString };
      } catch (e) { out.db = { error: e.message }; }
    }
    if (hasApi() && c.svc_id) {
      try {
        const d = await render('GET', '/services/' + c.svc_id + '/deploys?limit=1');
        const dep = Array.isArray(d) && d[0] ? unwrap(d[0], 'deploy') : null;
        out.deploy = dep ? { status: dep.status, finishedAt: dep.finishedAt || null } : null;
      } catch (e) { out.deploy = { error: e.message }; }
    }
    if (c.svc_id && c.control_key) {
      try { out.live = await companyCall(c, 'stats', {}); await setCompany(c.id, { last_stats: out.live, last_stats_at: new Date() }); }
      catch (e) { out.live = { error: e.message }; }
      if (!c.lic_synced) await pushLicense(c.id);
    }
    return out;
  },

  async saveCompany(b, ip) {
    const c = await needCompany(b.id);
    const patch = {};
    if ('name' in b) { const n = String(b.name || '').trim().slice(0, 80); if (!n) throw new Error('Ad boş ola bilməz'); patch.name = n; }
    if ('adminEmail' in b) { const e = String(b.adminEmail || '').trim(); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('E-poçt düzgün deyil'); patch.admin_email = e; }
    if ('notes' in b) patch.notes = String(b.notes || '').slice(0, 2000);
    if ('monthlyPrice' in b) patch.monthly_price = b.monthlyPrice === '' || b.monthlyPrice === null ? null : Number(b.monthlyPrice);
    if ('currency' in b && CURRENCIES.indexOf(b.currency) >= 0) patch.currency = b.currency;
    let licChanged = false;
    if ('packageId' in b) { const p = Number(b.packageId) || null; if (p && !(await pool.q('select 1 from ctl_packages where id = $1', [p])).length) throw new Error('Paket tapılmadı'); patch.package_id = p; licChanged = true; }
    if ('overrides' in b) { patch.lic_overrides = validLicenseInput(b.overrides); licChanged = true; }
    if ('licenseUntil' in b) { if (b.licenseUntil && !isDate(b.licenseUntil)) throw new Error('Tarix düzgün deyil'); patch.license_until = b.licenseUntil || null; licChanged = true; }
    if ('disabled' in b) { patch.disabled = !!b.disabled; licChanged = true; }
    await setCompany(c.id, patch);
    await auditLog(ip, 'company_update', c.slug, Object.keys(patch));
    const sync = licChanged ? await pushLicense(c.id) : { ok: true };
    return { synced: sync.ok, error: sync.error || '' };
  },

  async resetAdmin(b, ip) {
    const c = await needCompany(b.id);
    const phone = cleanPhone(b.adminPhone || c.admin_phone);
    if (!/^994\d{9}$/.test(phone)) throw new Error('Admin telefonu 994XXXXXXXXX formatında olmalıdır');
    const pw = newPassword();
    await companyCall(c, 'resetAdmin', { phone, password: pw });   // instant, not in the company journal
    await setCompany(c.id, { admin_password: pw, admin_phone: phone });
    await auditLog(ip, 'admin_reset', c.slug, { phone });
    return { adminPhone: phone, adminPassword: pw };
  },

  // ---- payments
  async addPayment(b, ip) {
    const c = await needCompany(b.id);
    const amount = Number(b.amount);
    if (!(amount > 0)) throw new Error('Məbləğ düzgün deyil');
    if (!isDate(b.paidAt)) throw new Error('Ödəniş tarixini seçin');
    if (b.until && !isDate(b.until)) throw new Error('"Nə vaxta qədər" tarixi düzgün deyil');
    const cur = CURRENCIES.indexOf(b.currency) >= 0 ? b.currency : 'AZN';
    await pool.q('insert into ctl_payments (company_id, amount, currency, paid_at, until, note) values ($1,$2,$3,$4,$5,$6)', [c.id, amount, cur, b.paidAt, b.until || null, String(b.note || '').slice(0, 300)]);
    let sync = { ok: true };
    if (b.until && (!c.license_until || b.until > dateStr(c.license_until))) { await setCompany(c.id, { license_until: b.until }); sync = await pushLicense(c.id); }
    await auditLog(ip, 'payment_add', c.slug, { amount, cur, until: b.until || null });
    return { synced: sync.ok };
  },
  async deletePayment(b, ip) {
    await pool.q('delete from ctl_payments where id = $1', [Number(b.paymentId)]);
    await auditLog(ip, 'payment_delete', String(b.paymentId), null);
    return { ok: true };
  },

  // ---- domains
  async addDomain(b, ip) {
    const c = await needCompany(b.id);
    const name = cleanDomain(b.domain);
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(name)) throw new Error('Domen düzgün deyil (məs. app.sirket.az)');
    if ((await pool.q('select 1 from ctl_domains where name = $1', [name])).length) throw new Error('Bu domen artıq var');
    if (hasApi() && c.svc_id) await render('POST', '/services/' + c.svc_id + '/custom-domains', { name });
    const d = (await pool.q('insert into ctl_domains (company_id, name, render_status) values ($1, $2, $3) returning *', [c.id, name, c.svc_id ? 'added' : '']))[0];
    await setCompany(c.id, { domains: (await pool.q('select name from ctl_domains where company_id = $1', [c.id])).map(x => x.name) });
    if (!c.admin_email) await setCompany(c.id, { admin_email: 'admin@' + apexOf(name) });
    await auditLog(ip, 'domain_add', name, { company: c.slug });
    return { domain: domainView(await checkDomain(d)) };
  },
  async saveDomain(b, ip) {
    const d = (await pool.q('select * from ctl_domains where id = $1', [Number(b.domainId)]))[0];
    if (!d) throw new Error('Domen tapılmadı');
    if (b.expires && !isDate(b.expires)) throw new Error('Tarix düzgün deyil');
    await pool.q('update ctl_domains set registrar=$1, price=$2, currency=$3, expires=$4, expires_source=$5, payer=$6, note=$7 where id=$8', [
      String(b.registrar || '').slice(0, 80), b.price === '' || b.price === undefined || b.price === null ? null : Number(b.price), CURRENCIES.indexOf(b.currency) >= 0 ? b.currency : 'AZN',
      b.expires || null, b.expires ? (b.expires === dateStr(d.expires) ? d.expires_source || 'manual' : 'manual') : '', b.payer === 'company' ? 'company' : 'me', String(b.note || '').slice(0, 300), d.id]);
    await auditLog(ip, 'domain_update', d.name, null);
    return { ok: true };
  },
  async checkDomain(b) {
    const d = (await pool.q('select * from ctl_domains where id = $1', [Number(b.domainId)]))[0];
    if (!d) throw new Error('Domen tapılmadı');
    return { domain: domainView(await checkDomain(d)) };
  },
  async removeDomain(b, ip) {
    const d = (await pool.q('select * from ctl_domains where id = $1', [Number(b.domainId)]))[0];
    if (!d) throw new Error('Domen tapılmadı');
    const c = await getCompany(d.company_id);
    if (hasApi() && c && c.svc_id) { try { await render('DELETE', '/services/' + c.svc_id + '/custom-domains/' + encodeURIComponent(d.name)); } catch (e) { if (e.status !== 404) throw e; } }
    await pool.q('delete from ctl_domains where id = $1', [d.id]);
    if (c) await setCompany(c.id, { domains: (await pool.q('select name from ctl_domains where company_id = $1', [c.id])).map(x => x.name) });
    await auditLog(ip, 'domain_remove', d.name, null);
    return { ok: true };
  },

  async deployAll(b, ip) {
    const rows = await pool.q("select * from ctl_companies where svc_id <> '' order by id");
    const out = [];
    for (const c of rows) {
      try { await render('POST', '/services/' + c.svc_id + '/deploys', {}); out.push({ slug: c.slug, ok: true }); }
      catch (e) { out.push({ slug: c.slug, ok: false, error: e.message }); }
    }
    await auditLog(ip, 'deploy_all', '', { n: out.length });
    return { results: out };
  },

  async testMail(b, ip) {
    const to = String(b.to || process.env.SUPERADMIN_EMAIL || '').trim();
    if (!to) throw new Error('Alıcı ünvanı yoxdur');
    await sendMail(to, 'Master — test məktubu', '<p>E-poçt işləyir.</p>');
    await auditLog(ip, 'mail_test', to, null);
    return { ok: true };
  },

  async journal(b) {
    const rows = await pool.q('select ts, ip, action, target, details from ctl_audit order by id desc limit 300');
    return { rows };
  }
};

// ================================================================ scheduled work (control server)
async function hourlyJobs() {
  if (!pool) return;
  // License sync retry + live stats
  for (const c of await pool.q("select * from ctl_companies where svc_id <> '' and control_key <> ''")) {
    if (!c.lic_synced) await pushLicense(c.id);
    try { const s = await companyCall(c, 'stats', {}); await setCompany(c.id, { last_stats: s, last_stats_at: new Date() }); } catch (e) { /* server may sleep */ }
  }
}
async function dnsJobs() {
  if (!pool) return;
  for (const d of await pool.q("select * from ctl_domains where not dns_ok or render_status <> 'verified' or checked_at < now() - interval '1 day'")) {
    try { await checkDomain(d); } catch (e) { console.error('dns', d.name, e.message); }
  }
}
async function mailOnce(key, to, subject, html) {
  if (!to || !to.length) return;
  if ((await pool.q('select 1 from ctl_mail_log where k = $1 and ok', [key])).length) return;
  try { await sendMail(to, subject, html); await pool.q('insert into ctl_mail_log (k, ok) values ($1, true) on conflict (k) do update set ok = true, sent_at = now()', [key]); }
  catch (e) { await pool.q('insert into ctl_mail_log (k, ok, info) values ($1, false, $2) on conflict (k) do update set ok = false, info = excluded.info, sent_at = now()', [key, e.message.slice(0, 300)]); }
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
async function mailJobs() {
  if (!pool || !hasMail()) return;
  const sup = process.env.SUPERADMIN_EMAIL || '';
  for (const c of await pool.q('select * from ctl_companies where license_until is not null')) {
    const until = dateStr(c.license_until), left = daysLeft(until);
    if ([30, 7, 1, 0].indexOf(left) < 0) continue;
    const msg = left > 0 ? 'Lisenziyanın bitməsinə ' + left + ' gün qalıb (' + until + ').' : 'Lisenziyanın müddəti bu gün bitir (' + until + '). Sabahdan tətbiq bağlanacaq, data saxlanılır.';
    await mailOnce('lic:' + c.id + ':' + until + ':' + left, [c.admin_email].filter(Boolean), esc(c.name) + ' — lisenziya', '<p>' + esc(c.name) + ': ' + msg + '</p><p>Uzatmaq üçün xidmət göstərənlə əlaqə saxlayın.</p>');
    await mailOnce('lic-sup:' + c.id + ':' + until + ':' + left, [sup], 'Lisenziya: ' + esc(c.name) + ' — ' + left + ' gün', '<p>' + esc(c.name) + ' (' + esc(c.slug) + '): ' + msg + '</p>');
  }
  for (const d of await pool.q('select d.*, c.name as company from ctl_domains d join ctl_companies c on c.id = d.company_id where d.expires is not null')) {
    const exp = dateStr(d.expires), left = daysLeft(exp);
    if ([30, 7, 1].indexOf(left) < 0) continue;
    await mailOnce('dom:' + d.id + ':' + exp + ':' + left, [sup], 'Domen: ' + esc(d.name) + ' — ' + left + ' gün', '<p>' + esc(d.name) + ' (' + esc(d.company) + ') domeninin bitməsinə ' + left + ' gün qalıb: ' + exp + '.</p><p>Qeydiyyatçı: ' + esc(d.registrar || '—') + ', məbləğ: ' + (d.price === null ? '—' : esc(d.price + ' ' + d.currency)) + ', ödəyən: ' + (d.payer === 'company' ? 'şirkət' : 'siz') + '.</p>');
  }
}

// ================================================================ HTTP
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(obj));
}
async function handle(req, res, p, readBody, page) {
  if (req.method === 'GET' && (p === '/super' || p === '/')) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    });
    return res.end(page);
  }
  const m = p.match(/^\/super\/api\/(\w+)$/);
  if (!m || req.method !== 'POST') return sendJson(res, 404, { ok: false, error: 'not_found' });
  let b = {};
  try { b = JSON.parse(await readBody(req) || '{}'); } catch (e) { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
  const act = m[1], ip = ipOf(req);
  if (act === 'login') { const r = await login(req, b); return sendJson(res, r.ok ? 200 : 403, r); }
  if (!authed(b.token)) return sendJson(res, 403, { ok: false, error: 'forbidden' });
  if (act === 'logout') { sessions.delete(String(b.token)); return sendJson(res, 200, { ok: true }); }
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, act)) return sendJson(res, 404, { ok: false, error: 'not_found' });
  try {
    const data = await ACTIONS[act](b, ip);
    if (act === 'create') await auditLog(ip, 'company_create', data.company.slug, { web: data.company.webPlan, db: data.company.dbPlan });
    if (act === 'attach') await auditLog(ip, 'company_attach', data.company.slug, null);
    return sendJson(res, 200, { ok: true, data });
  } catch (e) {
    return sendJson(res, 200, { ok: false, error: e.message });
  }
}

module.exports = { init, handle, hourlyJobs, dnsJobs, mailJobs, slugify, newPassword, totp, b32encode, effectiveLicense, apexOf };
