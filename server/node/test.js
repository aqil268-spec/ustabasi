/*
 * Runs the existing server tests (tests/*.test.js) on the Node runtime.
 * Usage: node test.js            — memory only
 *        TEST_DATABASE_URL=postgres://... node test.js — also writes to PostgreSQL and reads back
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.join(__dirname, '..', '..');
const code = path.join(repo, 'server', 'Code.gs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-test-'));
for (const f of fs.readdirSync(path.join(repo, 'tests'))) {
  if (f.endsWith('.js')) fs.copyFileSync(path.join(repo, 'tests', f), path.join(dir, f));
}
fs.writeFileSync(path.join(dir, 'fakegas.js'), 'module.exports = require(' + JSON.stringify(path.join(__dirname, 'test-fakegas.js')) + ');\n');

let failed = 0;
for (const t of ['flow.test.js', 'payroll.test.js', 'sec.test.js', 'seed.test.js']) {
  const r = spawnSync(process.execPath, [path.join(dir, t), code], { encoding: 'utf8', env: Object.assign({}, process.env, { TZ: 'Asia/Baku' }) });
  const out = (r.stdout + r.stderr).trim().split('\n');
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + t);
  console.log('  ' + out.filter(l => /FAIL|Error|DB check|passed|PASS:|all|ok:/i.test(l)).slice(-8).join('\n  '));
}
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
