/* Ustabaşı — tətbiq: giriş, karkas, marşrut, ümumi ekranlar */
(function () {
  'use strict';
  const C = window.UBCore;
  const { t, esc, icon, logo, API, LS } = C;
  const VERSION = '0.2.0';
  const SNAP = 'ub_snap';

  const UB = window.UB = { data: null, idx: {}, user: null, screens: { admin: {}, foreman: {}, common: {} }, version: VERSION };

  // ------------------------------------------------------------ data
  function indexData(d) {
    const by = (arr) => { const o = {}; (arr || []).forEach(x => { o[x.id] = x; }); return o; };
    UB.idx = {
      workers: by(d.workers), sites: by(d.sites), foremen: by(d.foremen), customers: by(d.customers), workTypes: by(d.workTypes)
    };
    d.settings = d.settings || {};
  }

  function setData(d, at) { UB.data = d; UB.user = d.user; indexData(d); UB.loadedAt = at || Date.now(); }

  async function load() {
    const d = await API.call('bootstrap', {});
    setData(d);
    saveSnap(d);
    return d;
  }

  // Son data telefonda saxlanır: tətbiq dərhal açılır, təzə data arxa planda gəlir.
  function saveSnap(d) {
    try { localStorage.setItem(SNAP, JSON.stringify({ v: VERSION, t: API.token(), at: Date.now(), d })); }
    catch (e) { clearSnap(); }
  }
  function readSnap() {
    try {
      const s = JSON.parse(localStorage.getItem(SNAP) || 'null');
      if (s && s.v === VERSION && s.t && s.t === API.token() && s.d && s.d.user) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function clearSnap() { try { localStorage.removeItem(SNAP); } catch (e) { /* ignore */ } }

  /** İstifadəçi forma doldurmursa, ekranı yenidən çəkmək olar. */
  function canRerender() {
    if (document.querySelector('dialog[open]')) return false;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
    const r = parseRoute();
    return r.parts.length <= 1 && ['home', 'workers', 'approvals', 'advances', 'sites', 'foremen', 'work', 'more'].indexOf(r.name) >= 0;
  }

  function syncBadge(state) {
    let el = document.getElementById('ub-sync');
    if (!state) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('button');
      el.type = 'button'; el.id = 'ub-sync'; el.className = 'sync';
      el.addEventListener('click', () => { if (el.dataset.s === 'offline') sync(); });
      document.body.appendChild(el);
    }
    el.dataset.s = state;
    el.innerHTML = state === 'offline' ? icon('refresh', 14) + '<span>' + esc(t('offline_snapshot')) + '</span>' : '<i class="spin"></i><span>' + esc(t('updating')) + '</span>';
  }

  /** Arxa planda təzə data; ekran yalnız istifadəçiyə mane olmayanda yenidən çəkilir. */
  let syncing = null;
  function sync() {
    if (syncing) return syncing;
    syncBadge('busy');
    syncing = load().then(() => {
      syncBadge(false);
      if (canRerender()) render();
    }).catch(e => {
      if (e.code === 'auth') { syncBadge(false); return logout(true); }
      syncBadge('offline');
    }).finally(() => { syncing = null; });
    return syncing;
  }
  UB.sync = sync;

  UB.refresh = async function (silent) {
    try { await load(); render(); }
    catch (e) { if (e.code === 'auth') return logout(true); if (!silent) C.toast(C.errorText(e), true); }
  };

  /** Datanı yeniləyir, ekranı yenidən çəkmir. */
  UB.reload = async function () { await load(); };

  UB.go = function (hash) { if (location.hash === hash) render(); else location.hash = hash; };

  UB.tol = () => C.n((UB.data.settings || {}).lateToleranceMin || 15);

  /** Ustanın bu günkü vəziyyəti. */
  UB.todayStatus = function (wid) {
    const d = UB.data, today = d.today;
    const recs = d.attendance.filter(a => a.workerId === wid && a.date === today && a.status !== 'REJECTED');
    const inR = recs.find(a => a.kind === 'IN'), outR = recs.find(a => a.kind === 'OUT');
    const pending = recs.some(a => a.status === 'PENDING');
    if (outR) return { code: 'left', inR, outR, pending };
    if (inR) return { code: C.n(inR.diffMin) > UB.tol() ? 'late' : 'in', inR, pending };
    return { code: 'absent', pending };
  };

  UB.statusChip = function (st) {
    if (st.code === 'in') return '<span class="chip ok mono">' + esc(t('st_in')) + ' ' + C.fmtTime(st.inR.ts) + '</span>';
    if (st.code === 'late') return '<span class="chip warn">' + esc(t('st_late', { m: C.n(st.inR.diffMin) })) + '</span>';
    if (st.code === 'left') return '<span class="chip mono">' + esc(t('st_left')) + ' ' + C.fmtTime(st.outR.ts) + '</span>';
    return '<span class="chip bad">' + esc(t('st_absent')) + '</span>';
  };

  UB.counts = function () {
    const d = UB.data;
    const work = d.entries.filter(e => e.status === 'ADMIN_PENDING').length;
    const adv = d.advances.filter(a => a.status === 'PENDING').length;
    const att = d.attendance.filter(a => a.status === 'PENDING').length;
    const sites = d.sites.filter(s => s.status === 'PENDING').length;
    return { work, adv, att, sites, total: work + adv + att + sites };
  };

  UB.workerName = id => (UB.idx.workers[id] || {}).name || '—';
  UB.siteName = id => (UB.idx.sites[id] || {}).name || '—';
  UB.foremanName = id => (UB.idx.foremen[id] || {}).name || (UB.user && UB.user.id === id ? UB.user.name : '—');
  UB.wtName = id => (UB.idx.workTypes[id] || {}).name || '—';
  UB.wtUnit = id => (UB.idx.workTypes[id] || {}).unit || '';
  UB.isAdmin = () => UB.user && UB.user.role === 'admin';
  UB.seesPay = () => UB.isAdmin() || (UB.data.settings.foremanSeesPay === 'yes');
  UB.planDays = month => C.n((UB.data.planDays.find(p => p.month === month) || {}).days);
  UB.isClosed = month => UB.data.periods.some(p => p.month === month && p.status === 'CLOSED');

  // ------------------------------------------------------------ routing
  function parseRoute() {
    const h = (location.hash || '#/').slice(1);
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const q = {};
    (qs || '').split('&').filter(Boolean).forEach(p => { const [k, v] = p.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { parts, name: parts[0] || 'home', q, hash: '#' + h };
  }

  const NAV = {
    admin: [
      { k: 'home', i: 'grid', l: 'nav_dashboard' },
      { k: 'foremen', i: 'user', l: 'nav_foremen' },
      { k: 'workers', i: 'users', l: 'nav_workers' },
      { k: 'sites', i: 'pin', l: 'nav_sites' },
      { k: 'approvals', i: 'check', l: 'nav_approvals', ls: 'nav_approvals_short', badge: true },
      { k: 'payroll', i: 'file', l: 'nav_payroll' },
      { k: 'reports', i: 'bars', l: 'nav_reports' },
      { k: 'catalog', i: 'list', l: 'nav_catalog' },
      { k: 'settings', i: 'gear', l: 'nav_settings' }
    ],
    adminBottom: ['home', 'workers', 'approvals', 'payroll', 'more'],
    foreman: [
      { k: 'home', i: 'home', l: 'nav_home' },
      { k: 'workers', i: 'users', l: 'nav_workers' },
      { k: 'work', i: 'file', l: 'nav_work' },
      { k: 'advances', i: 'wallet', l: 'nav_advances' },
      { k: 'sites', i: 'pin', l: 'nav_sites_short' },
      { k: 'settings', i: 'gear', l: 'nav_settings' }
    ],
    foremanBottom: ['home', 'workers', 'work', 'advances', 'sites']
  };

  function navItems() { return UB.isAdmin() ? NAV.admin : NAV.foreman; }

  function shell(route) {
    const items = navItems();
    const cnt = UB.isAdmin() ? UB.counts().total : 0;
    const cur = route.name;
    const link = (it, compact) => {
      const active = cur === it.k || (it.k === 'more' && ['foremen', 'sites', 'reports', 'catalog', 'settings', 'more'].indexOf(cur) >= 0 && UB.isAdmin());
      const badge = it.badge && cnt ? '<span class="badge">' + cnt + '</span>' : '';
      return '<a href="#/' + (it.k === 'home' ? '' : it.k) + '"' + (active ? ' aria-current="page"' : '') + '>' + icon(it.i, compact ? 22 : 18) + '<span>' + esc(t(compact && it.ls ? it.ls : it.l)) + '</span>' + badge + '</a>';
    };
    const bottomKeys = UB.isAdmin() ? NAV.adminBottom : NAV.foremanBottom;
    const bottom = bottomKeys.map(k => k === 'more' ? { k: 'more', i: 'more', l: 'nav_more' } : items.find(x => x.k === k)).map(it => link(it, true)).join('');
    return '<div class="shell">' +
      '<aside class="side"><div class="brand">' + logo(34, { animate: true }) + '<span>Ustabaşı</span></div>' +
      '<nav class="nav" aria-label="' + esc(t('menu')) + '">' + items.map(it => link(it)).join('') + '</nav>' +
      '<div class="side-foot">' + langSeg() + '<div class="small muted">' + esc(UB.user.name) + ' · ' + esc(t(UB.isAdmin() ? 'role_admin' : 'role_foreman')) + '</div>' +
      '<button type="button" class="btn sm" data-g="logout">' + icon('logout', 16) + esc(t('logout')) + '</button></div></aside>' +
      '<header class="topbar"><a href="#/" class="row" style="gap:8px;color:var(--text)">' + logo(28) + '<b style="font-size:17px">Ustabaşı</b></a>' +
      '<a href="#/settings" class="btn icon" style="border-radius:22px" aria-label="' + esc(t('nav_settings')) + '"><span class="small" style="font-weight:600">' + esc(C.initials(UB.user.name)) + '</span></a></header>' +
      '<main class="main" id="view"></main>' +
      '<nav class="bottom" aria-label="' + esc(t('menu')) + '">' + bottom + '</nav></div>';
  }

  function langSeg() {
    const l = C.getLang();
    return '<div class="seg" role="group" aria-label="' + esc(t('language')) + '">' + ['az', 'ru', 'en'].map(x => '<button type="button" data-g="lang" data-l="' + x + '" aria-pressed="' + (l === x) + '">' + x.toUpperCase() + '</button>').join('') + '</div>';
  }

  function render() {
    const root = document.getElementById('app');
    if (!UB.data) return;
    const route = parseRoute();
    if (route.name === 'print') {
      root.innerHTML = '<div class="print-page" id="view"></div>';
      document.body.style.background = '#fff';
      return UB.screens.common.print(document.getElementById('view'), route);
    }
    document.body.style.background = '';
    root.innerHTML = shell(route);
    const view = document.getElementById('view');
    const set = UB.isAdmin() ? UB.screens.admin : UB.screens.foreman;
    const fn = set[route.name] || UB.screens.common[route.name] || set.home;
    try { fn(view, route); }
    catch (e) { console.error(e); view.innerHTML = '<div class="empty">' + esc(C.errorText(e)) + '</div>'; }
    window.scrollTo(0, 0);
  }
  UB.render = render;

  // global clicks (lang, logout)
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-g]');
    if (!el) return;
    if (el.dataset.g === 'lang') { setLanguage(el.dataset.l); }
    if (el.dataset.g === 'logout') { e.preventDefault(); logout(); }
  });

  function setLanguage(l) {
    C.setLang(l);
    if (UB.user) API.call('setLang', { lang: l }).catch(() => {});
    if (UB.data) render(); else renderLogin();
  }

  async function logout(silent) {
    if (!silent) { const ok = await C.confirmDlg(t('logout_q'), t('logout')); if (!ok) return; }
    API.call('logout', {}).catch(() => {});
    LS.set('ub_token', null);
    clearSnap(); syncBadge(false);
    UB.data = null; UB.user = null;
    location.hash = '#/';
    renderLogin();
  }
  UB.logout = logout;

  // ------------------------------------------------------------ login
  function renderLogin(msg) {
    const root = document.getElementById('app');
    API.warm(); // Google serveri soyuq başlayır — PIN yazılana qədər oyansın
    root.innerHTML = '<div class="login"><form class="login-box" id="login-form" autocomplete="on">' +
      '<div class="login-brand">' + logo(96, { animate: true }) + '<div class="name">Ustabaşı</div><div class="muted">' + esc(t('tagline')) + '</div></div>' +
      '<div class="row" style="justify-content:center">' + langSeg() + '</div>' +
      '<label class="field"><span>' + esc(t('phone')) + '</span><input name="phone" type="tel" inputmode="tel" autocomplete="username" placeholder="994 50 000 00 00" required></label>' +
      '<label class="field"><span>' + esc(t('pin')) + '</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" minlength="4" maxlength="8" required></label>' +
      (msg ? '<div class="err" role="alert">' + esc(msg) + '</div>' : '') +
      '<button type="submit" class="btn primary big block">' + esc(t('login')) + '</button>' +
      '<div class="tiny dim" style="text-align:center">v' + VERSION + '</div></form></div>';
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(form);
      const btn = form.querySelector('[type=submit]');
      try {
        await C.busy(btn, async () => {
          const r = await API.call('login', { phone: f.phone, pin: f.pin });
          LS.set('ub_token', r.token);
          if (r.user.lang) C.setLang(r.user.lang);
          await load();
          if (!location.hash || location.hash === '#') location.hash = '#/';
          render();
        });
      } catch (err) { /* toast shown */ }
    });
    form.addEventListener('click', e => { const el = e.target.closest('[data-g=lang]'); if (el) { e.preventDefault(); e.stopPropagation(); C.setLang(el.dataset.l); renderLogin(); } }, true);
  }

  // ------------------------------------------------------------ common screens
  UB.screens.common.more = function (view) {
    view.innerHTML = '<h1>' + esc(t('nav_more')) + '</h1><div class="card"><div class="list">' +
      NAV.admin.filter(x => NAV.adminBottom.indexOf(x.k) < 0).map(it => '<a class="list-row click" href="#/' + it.k + '" style="color:var(--text)">' + icon(it.i, 20) + '<span class="title grow">' + esc(t(it.l)) + '</span>' + icon('chev', 18) + '</a>').join('') +
      '</div></div>';
  };

  UB.screens.common.settings = function (view) {
    const s = UB.data.settings;
    const admin = UB.isAdmin();
    const sel = (name, val, opts) => '<select name="' + name + '">' + opts.map(o => '<option value="' + o[0] + '"' + (String(val) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_settings')) + '</h1></div>' +
      '<div class="cols"><div class="col-2 stack">' +
      '<section class="card"><h2>' + esc(t('profile')) + '</h2><div class="kv"><span>' + esc(t('name')) + '</span><span>' + esc(UB.user.name) + '</span><span>' + esc(t('phone')) + '</span><span class="mono">' + esc(UB.user.phone) + '</span><span>' + esc(t('role')) + '</span><span>' + esc(t(admin ? 'role_admin' : 'role_foreman')) + '</span></div>' +
      '<div class="row">' + langSeg() + '</div></section>' +
      '<section class="card"><h2>' + esc(t('change_pin')) + '</h2><form class="form" id="pin-form"><div class="grid2">' +
      '<label class="field"><span>' + esc(t('old_pin')) + '</span><input name="oldPin" type="password" inputmode="numeric" required></label>' +
      '<label class="field"><span>' + esc(t('new_pin')) + '</span><input name="newPin" type="password" inputmode="numeric" pattern="\\d{4,8}" required></label></div>' +
      '<div><button class="btn primary" type="submit">' + esc(t('save')) + '</button></div></form></section>' +
      '<section class="card"><h2>' + esc(t('diag_title')) + '</h2><div class="small muted">' + esc(t('diag_hint')) + '</div><div id="diag">' + diagLast() + '</div>' +
      '<div><button type="button" class="btn" id="diag-run">' + icon('clock', 16) + esc(t('diag_run')) + '</button></div></section>' +
      '<section class="card"><button type="button" class="btn danger" data-g="logout">' + icon('logout', 16) + esc(t('logout')) + '</button><div class="tiny dim">Ustabaşı v' + VERSION + (UB.data.version ? ' · server v' + esc(UB.data.version) : '') + '</div></section>' +
      '</div>' +
      (admin ? '<div class="col-2"><section class="card"><h2>' + esc(t('app_settings')) + '</h2><form class="form" id="set-form"><div class="grid2">' +
        '<label class="field"><span>' + esc(t('s_link_ttl')) + '</span><input name="linkTtlMin" type="number" min="3" max="60" value="' + esc(s.linkTtlMin) + '"></label>' +
        '<label class="field"><span>' + esc(t('s_radius')) + '</span><input name="defaultRadius" type="number" min="50" max="500" value="' + esc(s.defaultRadius) + '"></label>' +
        '<label class="field"><span>' + esc(t('s_late')) + '</span><input name="lateToleranceMin" type="number" min="0" max="120" value="' + esc(s.lateToleranceMin) + '"></label>' +
        '<label class="field"><span>' + esc(t('s_adv_limit')) + '</span><input name="advanceLimitPct" type="number" min="0" max="100" value="' + esc(s.advanceLimitPct) + '"></label>' +
        '<label class="field"><span>' + esc(t('s_max_foremen')) + '</span><input name="maxForemen" type="number" min="1" max="50" value="' + esc(s.maxForemen) + '"></label>' +
        '<label class="field"><span>' + esc(t('s_max_workers')) + '</span><input name="maxWorkersPerForeman" type="number" min="1" max="100" value="' + esc(s.maxWorkersPerForeman) + '"></label>' +
        '<label class="field"><span>' + esc(t('s_foreman_pay')) + '</span>' + sel('foremanSeesPay', s.foremanSeesPay, [['yes', t('yes')], ['no', t('no')]]) + '</label>' +
        '<label class="field"><span>' + esc(t('s_session_days')) + '</span><input name="sessionDays" type="number" min="1" max="365" value="' + esc(s.sessionDays) + '"></label>' +
        '</div><div><button class="btn primary" type="submit">' + esc(t('save')) + '</button></div></form></section></div>' : '') +
      '</div>';
    view.querySelector('#pin-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(e.target);
      await C.busy(e.target.querySelector('button'), () => API.call('changePin', f)).then(() => { e.target.reset(); C.toast(t('saved')); }).catch(() => {});
    });
    view.querySelector('#diag-run').addEventListener('click', e => runDiag(view.querySelector('#diag'), e.currentTarget));
    const sf = view.querySelector('#set-form');
    if (sf) sf.addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(sf);
      await C.busy(sf.querySelector('button'), async () => { UB.data.settings = await API.call('saveSettings', { settings: f }); C.toast(t('saved')); }).catch(() => {});
    });
  };

  // ------------------------------------------------------------ speed diagnostics
  const ACT = { bootstrap: 'diag_a_bootstrap', ping: 'diag_a_ping', login: 'diag_a_login', report: 'diag_a_report', calcPayroll: 'nav_payroll', setPlanDays: 'plan_days', createToken: 'create_link', saveWorkEntry: 'nav_work', tokenInfo: 'link', tokenConfirm: 'link', approveWork: 'approve', approveAdvance: 'approve', approveAttendance: 'approve' };
  function diagLast() {
    const L = API.log.slice(0, 8);
    if (!L.length) return '';
    return '<div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('diag_last')) + '</th><th class="num">' + esc(t('diag_total')) + '</th><th class="num">' + esc(t('diag_server')) + '</th><th class="num">' + esc(t('diag_reads')) + '</th><th class="num">KB</th></tr></thead><tbody>' +
      L.map(r => '<tr><td>' + esc(ACT[r.action] ? t(ACT[r.action]) : r.action) + '</td><td class="num">' + ms(r.ms) + '</td><td class="num">' + (r.server === undefined || r.server === null ? '—' : ms(r.server)) + '</td><td class="num">' + (r.reads === null ? '—' : r.reads + ' / ' + r.cached) + '</td><td class="num">' + C.num(r.kb, 1) + '</td></tr>').join('') +
      '</tbody></table></div><div class="tiny muted">' + esc(t('diag_reads_note')) + '</div>';
  }
  function ms(v) { v = C.n(v); return v >= 1000 ? C.num(v / 1000, 1) + ' s' : Math.round(v) + ' ms'; }
  async function runDiag(box, btn) {
    await C.busy(btn, async () => {
      await API.raw({ action: 'ping' }); const p1 = API.log[0];
      await API.raw({ action: 'ping' }); const p2 = API.log[0];
      await load(); const b = API.log[0];
      const net = Math.max(0, b.ms - C.n(b.server));
      const notes = [];
      if (p1.ms > 2500) notes.push(t('diag_n_cold'));
      if (b.reads > 3) notes.push(t('diag_n_cache'));
      if (p2.ms > 2000 || net > 2500) notes.push(t('diag_n_net'));
      if (!notes.length) notes.push(t('diag_n_ok'));
      const row = (k, v) => '<span>' + esc(t(k)) + '</span><span class="mono">' + v + '</span>';
      box.innerHTML = '<div class="kv wide">' + row('diag_ping_cold', ms(p1.ms)) + row('diag_ping_warm', ms(p2.ms)) + row('diag_boot', ms(b.ms)) +
        row('diag_server', ms(b.server)) + row('diag_net', ms(net)) + row('diag_reads', esc(b.reads + ' / ' + b.cached)) + row('diag_size', C.num(b.kb, 1) + ' KB') + '</div>' +
        notes.map(n => '<div class="notice">' + esc(n) + '</div>').join('') + diagLast();
    }).catch(() => {});
  }

  // ------------------------------------------------------------ print
  UB.screens.common.print = async function (view, route) {
    const kind = route.parts[1], arg = route.parts[2];
    const tools = '<div class="print-tools"><button class="btn" type="button" onclick="history.back()">' + icon('left', 16) + esc(t('back')) + '</button><button class="btn" type="button" onclick="window.print()">' + icon('print', 16) + esc(t('print')) + '</button></div>';
    const head = (title, sub) => '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px"><div><h1>' + esc(title) + '</h1><div style="color:#444;font-size:13px">' + esc(sub || '') + '</div></div>' + logo(40) + '</div>';
    if (kind === 'receipt') {
      const a = UB.data.advances.find(x => x.id === arg);
      if (!a) { view.innerHTML = tools + '<p>' + esc(t('not_found')) + '</p>'; return; }
      view.innerHTML = tools + receiptHtml(a) + receiptHtml(a);
      return;
    }
    if (kind === 'advances') {
      const month = arg || C.monthISO();
      const list = UB.data.advances.filter(a => ['APPROVED', 'GIVEN', 'SIGNED'].indexOf(a.status) >= 0 && String(a.approvedAt || a.created).slice(0, 7) === month);
      let sum = 0;
      view.innerHTML = tools + head(t('print_adv_title'), C.monthName(month)) +
        '<table><thead><tr><th>#</th><th>' + esc(t('receipt_no')) + '</th><th>' + esc(t('date')) + '</th><th>' + esc(t('worker')) + '</th><th>' + esc(t('foreman')) + '</th><th class="num">' + esc(t('amount')) + '</th><th>' + esc(t('signature')) + '</th></tr></thead><tbody>' +
        list.map((a, i) => { sum += C.n(a.amount); return '<tr><td>' + (i + 1) + '</td><td>' + esc(a.receiptNo) + '</td><td>' + esc(C.fmtDate(a.approvedAt, true)) + '</td><td>' + esc(UB.workerName(a.workerId)) + '</td><td>' + esc(UB.foremanName(a.foremanId)) + '</td><td class="num">' + C.money(a.amount) + '</td><td style="width:140px"></td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="5"><b>' + esc(t('total')) + '</b></td><td class="num"><b>' + C.money(sum) + '</b></td><td></td></tr></tfoot></table>';
      return;
    }
    if (kind === 'payroll') {
      const month = arg || C.monthISO();
      view.innerHTML = tools + '<div class="loading"><i></i></div>';
      try {
        const r = await API.call('calcPayroll', { month });
        const rows = r.lines;
        const tot = rows.reduce((s, l) => s + C.n(l.total), 0);
        view.innerHTML = tools + head(t('print_pay_title'), C.monthName(month) + ' · ' + t('plan_days') + ': ' + (r.planDays || '—') + (r.closed ? ' · ' + t('closed') : ' · ' + t('not_closed'))) +
          '<table><thead><tr><th>#</th><th>' + esc(t('name')) + '</th><th>' + esc(t('days')) + '</th><th class="num">' + esc(t('col_std')) + '</th><th class="num">' + esc(t('col_bonus')) + '</th><th class="num">' + esc(t('col_adv')) + '</th><th class="num">' + esc(t('col_pen')) + '</th><th class="num">' + esc(t('col_corr')) + '</th><th class="num">' + esc(t('col_total')) + '</th><th>' + esc(t('signature')) + '</th></tr></thead><tbody>' +
          rows.map((l, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(l.name) + (l.personType === 'FOREMAN' ? ' (' + esc(t('foreman')) + ')' : '') + '</td><td>' + esc(l.daysWorked === '' ? '—' : l.daysWorked) + '</td><td class="num">' + C.num(l.S) + '</td><td class="num">' + C.num(l.bonus) + '</td><td class="num">' + C.num(l.advance) + '</td><td class="num">' + C.num(l.penalty) + '</td><td class="num">' + C.num(l.correction) + '</td><td class="num"><b>' + C.num(l.total) + '</b></td><td style="width:120px"></td></tr>').join('') +
          '</tbody><tfoot><tr><td colspan="8"><b>' + esc(t('total')) + '</b></td><td class="num"><b>' + C.money(tot) + '</b></td><td></td></tr></tfoot></table>' +
          '<p style="margin-top:24px;font-size:13px">' + esc(t('approved_by')) + ': <span class="sign"></span></p>';
      } catch (e) { view.innerHTML = tools + '<p>' + esc(C.errorText(e)) + '</p>'; }
    }
  };

  function receiptHtml(a) {
    const monthTotal = UB.data.advances.filter(x => x.workerId === a.workerId && ['APPROVED', 'GIVEN', 'SIGNED'].indexOf(x.status) >= 0 && String(x.approvedAt).slice(0, 7) === String(a.approvedAt).slice(0, 7)).reduce((s, x) => s + C.n(x.amount), 0);
    return '<div class="receipt"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + esc(t('receipt')) + ' ' + esc(a.receiptNo) + '</b>' + logo(28) + '</div>' +
      '<div>' + esc(t('date')) + ': ' + esc(C.fmtDate(a.approvedAt, true)) + '</div>' +
      '<div>' + esc(t('worker')) + ': <b>' + esc(UB.workerName(a.workerId)) + '</b></div>' +
      '<div>' + esc(t('amount')) + ': <b style="font-size:18px">' + C.money(a.amount) + '</b></div>' +
      '<div style="font-size:12px;color:#444">' + esc(t('month_adv_total')) + ': ' + C.money(monthTotal) + '</div>' +
      '<div>' + esc(t('foreman')) + ': ' + esc(UB.foremanName(a.foremanId)) + '</div>' +
      '<div style="margin-top:14px;display:flex;justify-content:space-between;gap:12px;font-size:12px"><span>' + esc(t('received')) + ': <span class="sign"></span></span><span>' + esc(t('gave')) + ': <span class="sign"></span></span></div></div>';
  }

  /** WhatsApp üçün avans çeki mətni. */
  UB.receiptText = function (a) {
    const w = UB.idx.workers[a.workerId] || {};
    const L = w.lang || 'az';
    const monthTotal = UB.data.advances.filter(x => x.workerId === a.workerId && ['APPROVED', 'GIVEN', 'SIGNED'].indexOf(x.status) >= 0 && String(x.approvedAt).slice(0, 7) === String(a.approvedAt).slice(0, 7)).reduce((s, x) => s + C.n(x.amount), 0);
    return [
      'Ustabaşı · ' + t('receipt', null, L) + ' ' + a.receiptNo,
      t('date', null, L) + ': ' + String(a.approvedAt).slice(0, 10),
      t('worker', null, L) + ': ' + (w.name || ''),
      t('amount', null, L) + ': ' + C.money(a.amount),
      t('month_adv_total', null, L) + ': ' + C.money(monthTotal),
      t('foreman', null, L) + ': ' + UB.foremanName(a.foremanId)
    ].join('\n');
  };

  // ------------------------------------------------------------ boot
  window.addEventListener('hashchange', () => { if (UB.data) render(); });

  async function boot() {
    C.setLang(C.getLang());
    const root = document.getElementById('app');
    if (!API.token()) return renderLogin();
    const snap = readSnap();
    if (snap) {
      // Dərhal: son yadda saxlanan data ilə aç, təzəsini arxa planda gətir.
      setData(snap.d, snap.at);
      render();
      sync();
      return;
    }
    root.innerHTML = '<div class="loading" style="min-height:100vh"><i></i>' + esc(t('loading')) + '</div>';
    try { await load(); render(); }
    catch (e) {
      if (e.code === 'auth') { LS.set('ub_token', null); clearSnap(); return renderLogin(); }
      renderLogin(C.errorText(e));
    }
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  document.addEventListener('visibilitychange', () => {
    // Tətbiqə qayıdanda (1 dəqiqədən çox keçibsə) data arxa planda yenilənir.
    if (document.visibilityState !== 'visible' || !UB.data || Date.now() - (UB.loadedAt || 0) < 60000) return;
    sync();
  });

  UB.boot = boot;
})();
