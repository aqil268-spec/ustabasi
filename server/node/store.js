/*
 * PostgreSQL store for the Master runtime.
 * gas_rows holds every sheet row (row 1 = header). Views in schema "app" show each
 * main sheet as a normal table with named columns (for SQL reports).
 */
'use strict';
const postgres = require('postgres');

const DDL = `
create table if not exists gas_books  (id text primary key, name text not null default '', created timestamptz not null default now());
create table if not exists gas_sheets (book text not null, name text not null, ord int not null default 0, max_rows int not null default 1000, primary key (book, name));
create table if not exists gas_rows   (book text not null, sheet text not null, r int not null, v jsonb not null, primary key (book, sheet, r));
create table if not exists gas_props  (k text primary key, v text not null);
create table if not exists gas_files  (id text primary key, folder text not null default '', name text not null, mime text not null, data bytea not null, created timestamptz not null default now());
create index if not exists gas_files_folder on gas_files (folder);
create table if not exists gas_triggers (handler text primary key);
create table if not exists gas_jobs   (name text primary key, last_run timestamptz not null);
create table if not exists gas_meta   (k text primary key, v text not null);
create schema if not exists app;
`;

const BATCH = 5000;

function makePool(url) {
  if (!url) throw new Error('DATABASE_URL is not set');
  const ssl = /sslmode=require|\.render\.com|amazonaws\.com/.test(url) ? { rejectUnauthorized: false } : false;
  const sql = postgres(url, { ssl, max: 4, onnotice: () => {}, idle_timeout: 60, connect_timeout: 30 });
  // Small adapter: q(text, params) → rows; tx(fn) → transaction with the same q.
  const wrap = s => (text, params) => s.unsafe(text, params || []);
  return { q: wrap(sql), tx: fn => sql.begin(t => fn(wrap(t))), end: () => sql.end({ timeout: 5 }) };
}

async function init(pool) { await pool.q(DDL); }

/** Reads everything into runtime state form. */
async function loadAll(pool) {
  const books = {};
  (await pool.q('select id, name from gas_books')).forEach(b => { books[b.id] = { name: b.name, order: [], sheets: {} }; });
  (await pool.q('select book, name, max_rows from gas_sheets order by book, ord, name')).forEach(s => {
    if (!books[s.book]) books[s.book] = { name: '', order: [], sheets: {} };
    books[s.book].order.push(s.name);
    books[s.book].sheets[s.name] = { rows: [], max: s.max_rows };
  });
  // Rows: streamed in pages so big sheets do not need one huge result.
  let last = { book: '', sheet: '', r: 0 };
  for (;;) {
    const res = await pool.q(
      'select book, sheet, r, v from gas_rows where (book, sheet, r) > ($1, $2, $3) order by book, sheet, r limit 20000',
      [last.book, last.sheet, last.r]);
    res.forEach(x => {
      const sh = books[x.book] && books[x.book].sheets[x.sheet];
      if (!sh) return;
      const rows = sh.rows;
      while (rows.length < x.r - 1) rows.push([]);
      rows[x.r - 1] = (Array.isArray(x.v) ? x.v : []).map(v => (v === null ? '' : v));
    });
    if (res.length < 20000) break;
    const z = res[res.length - 1];
    last = { book: z.book, sheet: z.sheet, r: z.r };
  }
  const props = {};
  (await pool.q('select k, v from gas_props')).forEach(p => { props[p.k] = p.v; });
  const triggers = (await pool.q('select handler from gas_triggers')).map(t => t.handler);
  const fileIndex = {};
  (await pool.q("select id, folder, name, mime, created from gas_files where mime = 'application/json'")).forEach(f => {
    (fileIndex[f.folder] = fileIndex[f.folder] || []).push({ id: f.id, folder: f.folder, name: f.name, mime: f.mime, created: new Date(f.created).getTime() });
  });
  return { books, props, triggers, fileIndex };
}

const rowJson = row => JSON.stringify(Array.from(row || [], v => (v === undefined || v === null ? '' : v)));

async function upsertRows(c, book, sheet, rs, rows) {
  for (let i = 0; i < rs.length; i += BATCH) {
    const part = rs.slice(i, i + BATCH);
    await c(
      `insert into gas_rows (book, sheet, r, v)
       select $1, $2, t.r, t.v::jsonb from unnest($3::int[], $4::text[]) as t(r, v)
       on conflict (book, sheet, r) do update set v = excluded.v`,
      [book, sheet, part.map(r => r + 1), part.map(r => rowJson(rows[r]))]);
  }
}

/** Writes one request's changes in one transaction. */
async function persist(pool, rt, ch) {
  const st = rt.state;
  await pool.tx(async c => {
    for (const id of ch.books) {
      const b = st.books[id];
      if (!b) { await c('delete from gas_books where id = $1', [id]); continue; }
      await c('insert into gas_books (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name', [id, b.name]);
      for (let i = 0; i < b.order.length; i++) {
        await c('update gas_sheets set ord = $3 where book = $1 and name = $2', [id, b.order[i], i]);
      }
    }
    for (const k of ch.dropSheets) {
      const [book, sheet] = k.split('\u0001');
      if (st.books[book] && st.books[book].sheets[sheet]) continue;   // re-created in the same request
      await c('delete from gas_rows where book = $1 and sheet = $2', [book, sheet]);
      await c('delete from gas_sheets where book = $1 and name = $2', [book, sheet]);
    }
    const sheetMeta = new Set([...ch.sheets, ...ch.full, ...ch.rows.keys()]);
    for (const k of sheetMeta) {
      const [book, sheet] = k.split('\u0001');
      const b = st.books[book], s = b && b.sheets[sheet];
      if (!s) continue;
      await c(
        `insert into gas_sheets (book, name, ord, max_rows) values ($1, $2, $3, $4)
         on conflict (book, name) do update set max_rows = excluded.max_rows`,
        [book, sheet, Math.max(0, b.order.indexOf(sheet)), Math.max(s.max || 1000, s.rows.length)]);
    }
    for (const k of ch.full) {
      const [book, sheet] = k.split('\u0001');
      const s = st.books[book] && st.books[book].sheets[sheet];
      if (!s) continue;
      await c('delete from gas_rows where book = $1 and sheet = $2', [book, sheet]);
      const rs = [];
      s.rows.forEach((row, i) => { if (row && row.some(v => v !== '' && v !== undefined && v !== null)) rs.push(i); });
      await upsertRows(c, book, sheet, rs, s.rows);
    }
    for (const [k, set] of ch.rows) {
      if (ch.full.has(k)) continue;
      const [book, sheet] = k.split('\u0001');
      const s = st.books[book] && st.books[book].sheets[sheet];
      if (!s) continue;
      const rs = [...set].filter(i => i < s.rows.length).sort((a, b) => a - b);
      await upsertRows(c, book, sheet, rs, s.rows);
      await c('delete from gas_rows where book = $1 and sheet = $2 and r > $3', [book, sheet, s.rows.length]);
    }
    for (const k of ch.props) {
      if (!(k in st.props)) continue;
      await c('insert into gas_props (k, v) values ($1, $2) on conflict (k) do update set v = excluded.v', [k, st.props[k]]);
    }
    if (ch.propsDel.size) await c('delete from gas_props where k = any($1::text[])', [[...ch.propsDel]]);
    for (const f of ch.files) {
      if (ch.filesDel.has(f.id)) continue;
      await c('insert into gas_files (id, folder, name, mime, data, created) values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))',
        [f.id, f.folder, f.name, f.mime, f.bytes, f.created]);
    }
    if (ch.filesDel.size) await c('delete from gas_files where id = any($1::text[])', [[...ch.filesDel]]);
    if (ch.triggers) {
      await c('delete from gas_triggers');
      for (const h of st.triggers) await c('insert into gas_triggers (handler) values ($1)', [h]);
    }
  });
}

/** Views app."Users", app."Sites", ... for the main data spreadsheet (read-only, text columns). */
async function refreshViews(pool, schema, bookId) {
  if (!bookId || !schema) return;
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
  await pool.tx(async c => {
    for (const name of Object.keys(schema)) {
      const cols = schema[name].map((h, i) => `nullif(v->>${i}, '') as ${q(h)}`).join(', ');
      await c(`drop view if exists app.${q(name)}`);
      await c(`create view app.${q(name)} as select r as _row, ${cols} from gas_rows where book = ${lit(bookId)} and sheet = ${lit(name)} and r > 1`);
    }
  });
}

async function getFile(pool, id) {
  const r = await pool.q('select name, mime, data from gas_files where id = $1', [id]);
  return r[0] || null;
}

async function jobLastRun(pool, name) {
  const r = await pool.q('select last_run from gas_jobs where name = $1', [name]);
  return r[0] ? new Date(r[0].last_run) : null;
}
async function jobDone(pool, name) {
  await pool.q('insert into gas_jobs (name, last_run) values ($1, now()) on conflict (name) do update set last_run = excluded.last_run', [name]);
}

async function metaGet(pool, k) {
  const r = await pool.q('select v from gas_meta where k = $1', [k]);
  return r[0] ? r[0].v : null;
}
async function metaSet(pool, k, v) {
  await pool.q('insert into gas_meta (k, v) values ($1, $2) on conflict (k) do update set v = excluded.v', [k, v]);
}

module.exports = { metaGet, metaSet, makePool, init, loadAll, persist, refreshViews, getFile, jobLastRun, jobDone };
