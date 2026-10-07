const fs = require('fs');
const files = ['assets/core.js','assets/app.js','assets/admin.js','assets/foreman.js','assets/link.js'].map(f => require('path').join(__dirname, '..', f));
const keys = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /(?<![A-Za-z0-9_.])(?:t|tt)\(/g; let m;
  while ((m = re.exec(src))) {
    let i = m.index + (src[m.index] === 't' && src[m.index+1] === 't' ? 3 : 2), depth = 1, s = '';
    while (i < src.length && depth > 0) { const c = src[i]; if (c === '(') depth++; else if (c === ')') depth--; if (depth > 0) s += c; i++; }
    const first = s.split(/,(?![^{]*})/)[0];
    (first.match(/'([A-Za-z][A-Za-z0-9_]*)'/g) || []).forEach(x => { const k = x.slice(1, -1); if (!['IN','OUT','helper','senior','master','yes','no','WORK','work','site','az','ADV','PAY','return','approve','reject'].includes(k)) keys.add(k); });
  }
  // t(cond ? 'a' : 'b') patterns already covered; also keys inside arrays like ['pw_len', ...]
  (src.match(/\['(pw_[a-z]+)'/g) || []).forEach(x => keys.add(x.slice(2, -1)));
}
const P = (pre, list) => list.forEach(x => keys.add(pre + x));
P('pt_', ['MONTH','DAY']); P('pm_', ['STD','BONUS','STD_BONUS','CASH','TRANSFER']); P('g_', ['helper','master','senior']);
P('es_', ['USTA_PENDING','ADMIN_PENDING','APPROVED','RETURNED','REJECTED']);
P('ms_', ['PENDING','RETURNED','APPROVED','GIVEN','LINK_SENT','LINK_EXPIRED','CLOSED','SIGNED','CONFLICT','REJECTED']);
P('xs_', ['PENDING','APPROVED','RETURNED','REJECTED']); P('as_', ['PENDING','RETURNED']);
P('site_', ['APPROVED','PENDING','REJECTED','CLOSED','RETURNED']);
P('ded_', ['PENALTY','CORRECTION','OTHER']);
P('tab_', ['work','adv','pay','exp','att','site','phone','conflicts','log','links','attempts']);
P('lk_', ['IN','OUT','WORK','ADV','PAY']); P('att_', ['other_device','staff_device']);
P('ls_', ['CREATED','OPENED','USED','NOT_OPENED','EXPIRED','CANCELLED']);
P('ja_', ['login','create','update','approve','return','reject','link','confirm','conflict','pdf','print','export','set_password','close']);
P('bk_', ['work','att','adv','pay','exp']); P('nt_', ['MONTH','DAY']); P('lm_', ['FULL','HALF','HOUR']);
P('qa_', ['saveWorkEntry','requestAdvance','saveExpense','saveSite']);
P('err_', ['auth','bad_login','bad_json','forbidden','server','network','no_api','link_not_found','link_used','link_expired','no_gps','gps_denied','already_in','no_in_today','already_out','required','not_found','no_coords','bad_kind','site_not_approved','bad_qty','no_shares','shares_not_100','already_approved','period_closed','bad_amount','bad_status','phone_taken','limit_foremen','limit_workers','not_ready','bad_days','no_plan_days','bad_image','dup_worker','too_far','not_setup','stale_row',
 'must_change','locked','weak_password','bad_old_password','same_password','reason_required','photo_required','bad_voen','link_other_device','link_staff_device','link_cancelled','link_limit','no_phone','offline_expired','offline_only','bad_file','pw_mismatch']);
const all = [...keys].sort();
const LANGS = ['az','ru','en','tr'];
if (process.argv[2] === 'check') {
  global.window = {}; delete require.cache[require.resolve(require('path').join(__dirname, '..', 'assets', 'i18n.js'))]; require(require('path').join(__dirname, '..', 'assets', 'i18n.js'));
  const D = global.window.I18N; let bad = 0;
  for (const L of LANGS) { if (!D[L]) { console.log('NO LANG', L); bad++; continue; } for (const k of all) if (!(k in D[L])) { console.log('MISSING', L, k); bad++; } }
  for (const L of LANGS.slice(1)) for (const k of Object.keys(D.az)) if (D[L] && !(k in D[L])) { console.log('EXTRA-AZ-ONLY', L, k); bad++; }
  for (const k of Object.keys(D.az)) { const ph = s => (String(s).match(/\{[a-z]+\}/g)||[]).sort().join(); for (const L of LANGS.slice(1)) if (D[L] && D[L][k] !== undefined && ph(D[L][k]) !== ph(D.az[k])) { console.log('PLACEHOLDER', L, k); bad++; } }
  console.log(all.length, 'keys used;', Object.keys(D.az).length, 'in az;', bad, 'problems');
} else if (process.argv[2] === 'missing') {
  global.window = {}; require(require('path').join(__dirname, '..', 'assets', 'i18n.js'));
  const D = global.window.I18N;
  console.log(all.filter(k => !(k in D.az)).join('\n'));
} else console.log(all.join('\n'));
