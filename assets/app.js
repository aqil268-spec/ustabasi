/* Ustabaşı — tətbiq: giriş, karkas, marşrut, offline növbə, ümumi ekranlar */
(function () {
  'use strict';
  const C = window.UBCore;
  const { t, esc, icon, logo, API, LS } = C;
  const VERSION = '0.3.0';
  const SNAP = 'ub_snap';
  const SNAP_MAX_MS = 24 * 3600 * 1000;   // 1 gün giriş olmasa telefondakı data silinir (K-15, K-17)
  // Offline-da yalnız bunlar növbəyə düşür (S-45). Server yoxlaması tələb edənlər yalnız onlayn.
  const QUEUEABLE = { saveWorkEntry: 1, requestAdvance: 1, saveExpense: 1, saveSite: 1 };

  const UB = window.UB = { data: null, idx: {}, user: null, screens: { admin: {}, foreman: {}, common: {} }, version: VERSION, queue: [] };

  // ------------------------------------------------------------ data
  function indexData(d) {
    const by = (arr) => { const o = {}; (arr || []).forEach(x => { o[x.id] = x; }); return o; };
    ['payments', 'expenses', 'advances', 'attempts', 'linkWarnings', 'activeLinks'].forEach(k => { if (!d[k]) d[k] = []; });
    d.links = d.links || {};
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
  // Sahə rəisinin telefonunda maaş saxlanmır (T-06); 1 gün giriş olmasa silinir (K-15).
  function saveSnap(d) {
    try {
      let copy = d;
      if (d.user && d.user.role !== 'admin') {
        copy = Object.assign({}, d, { workers: d.workers.map(w => Object.assign({}, w, { baseAmount: '', norm: '' })) });
      }
      localStorage.setItem(SNAP, JSON.stringify({ v: VERSION, t: API.token(), at: Date.now(), d: copy }));
    } catch (e) { clearSnap(); }
  }
  function readSnap() {
    try {
      const s = JSON.parse(localStorage.getItem(SNAP) || 'null');
      if (s && Date.now() - s.at > SNAP_MAX_MS) { clearSnap(); return null; }
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
    return r.parts.length <= 1 && ['home', 'workers', 'approvals', 'advances', 'sites', 'foremen', 'work', 'more', 'money', 'payments', 'expenses', 'queue'].indexOf(r.name) >= 0;
  }

  // ------------------------------------------------------------ network state & offline queue (BR-61)
  function netBar() {
    let el = document.getElementById('ub-net');
    const offline = !navigator.onLine;
    const n = UB.queue.filter(x => !x.expired).length, bad = UB.queue.filter(x => x.expired || x.error).length;
    if (!offline && !n && !bad) { if (el) el.remove(); document.body.classList.remove('has-net'); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'ub-net'; el.className = 'netbar'; el.setAttribute('role', 'status');
      el.addEventListener('click', e => { if (e.target.closest('[data-q]')) { if (navigator.onLine) flushQueue(true); UB.go('#/queue'); } });
      document.body.appendChild(el);
    }
    document.body.classList.add('has-net');
    el.dataset.s = offline ? 'off' : 'queue';
    el.innerHTML = (offline ? icon('offline', 16) + '<b>' + esc(t('offline_mode')) + '</b>' : icon('refresh', 16) + '<b>' + esc(t('queue_waiting', { n })) + '</b>') +
      (n || bad ? '<button type="button" class="btn sm" data-q>' + esc(t(offline ? 'queue_n' : 'queue_send', { n: n + bad })) + '</button>' : '');
  }

  async function loadQueue() {
    try { UB.queue = await C.Q.all(); } catch (e) { UB.queue = []; }
    const days = C.n((UB.data && UB.data.settings.offlineDays) || 3);
    const limit = Date.now() - days * 86400000;
    UB.queue.forEach(x => { if (!x.expired && Date.parse(x.created) < limit) { x.expired = true; C.Q.put(x); } });
    netBar();
    return UB.queue;
  }

  async function enqueue(action, params) {
    const item = { id: params.cid || C.rid(), action, params, created: C.nowLocalIso(), userId: UB.user && UB.user.id, label: params._label || '' };
    delete item.params._label;
    await C.Q.put(item);
    await loadQueue();
    C.toast(t('queued'));
    return { queued: true, id: item.id };
  }

  let flushing = null;
  function flushQueue(manual) {
    if (flushing) return flushing;
    flushing = (async () => {
      await loadQueue();
      let sent = 0, failed = 0;
      for (const item of UB.queue) {
        if (item.expired || (item.userId && UB.user && item.userId !== UB.user.id)) continue;
        if (!navigator.onLine) break;
        try {
          await API.call(item.action, Object.assign({}, item.params, { cid: item.id, offlineAt: item.created }));
          await C.Q.del(item.id); sent++;
        } catch (e) {
          if (e.code === 'network') break;
          if (e.code === 'auth') break;
          item.error = e.code || 'server'; if (e.code === 'offline_expired') item.expired = true;
          await C.Q.put(item); failed++;
        }
      }
      await loadQueue();
      if (sent) { C.toast(t('queue_sent', { n: sent })); try { await load(); if (canRerender()) render(); } catch (e) { /* ignore */ } }
      else if (manual && failed) C.toast(t('queue_failed', { n: failed }), true);
      return sent;
    })().finally(() => { flushing = null; });
    return flushing;
  }
  UB.flushQueue = flushQueue;

  /** Yazan sorğu: offline-da (və ya şəbəkə xətasında) icazəli əməliyyat növbəyə düşür. */
  UB.send = async function (action, params, label) {
    const queueable = QUEUEABLE[action] && !UB.isAdmin();
    const body = Object.assign({}, params || {});
    if (queueable) body.cid = C.rid();
    if (!navigator.onLine) {
      if (queueable) return enqueue(action, Object.assign(body, { _label: label || '' }));
      throw C.err('offline_only');
    }
    try { return await API.call(action, body); }
    catch (e) {
      if (queueable && e.code === 'network') return enqueue(action, Object.assign(body, { _label: label || '' }));
      if (e.code === 'must_change') { renderPassword(true); }
      throw e;
    }
  };

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
    if (!navigator.onLine) { netBar(); return Promise.resolve(); }
    syncBadge('busy');
    syncing = load().then(() => {
      syncBadge(false);
      if (canRerender()) render();
      if (UB.queue.length) flushQueue();
    }).catch(e => {
      if (e.code === 'auth') { syncBadge(false); return logout(true); }
      if (e.code === 'must_change') { syncBadge(false); return renderPassword(true); }
      syncBadge('offline');
    }).finally(() => { syncing = null; });
    return syncing;
  }
  UB.sync = sync;

  UB.refresh = async function (silent) {
    try { await load(); render(); }
    catch (e) {
      if (e.code === 'auth') return logout(true);
      if (e.code === 'must_change') return renderPassword(true);
      if (!silent) C.toast(C.errorText(e), true);
    }
  };

  /** Datanı yeniləyir, ekranı yenidən çəkmir. */
  UB.reload = async function () { try { await load(); } catch (e) { if (e.code !== 'network') throw e; } };

  UB.go = function (hash) { if (location.hash === hash) render(); else location.hash = hash; };

  UB.tol = () => C.n((UB.data.settings || {}).lateToleranceMin || 15);

  /** Ustanın bu günkü vəziyyəti. */
  UB.todayStatus = function (wid) {
    const d = UB.data, today = d.today;
    const recs = d.attendance.filter(a => a.workerId === wid && a.date === today && ['REJECTED', 'RETURNED'].indexOf(a.status) < 0);
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
    const pay = d.payments.filter(p => p.status === 'PENDING').length;
    const exp = d.expenses.filter(x => x.status === 'PENDING').length;
    const phone = d.customers.filter(c => c.pendingPhone).length;
    const conflicts = d.advances.filter(a => a.status === 'CONFLICT').length + d.payments.filter(p => p.status === 'CONFLICT').length;
    return { work, adv, att, sites, pay, exp, phone, conflicts, total: work + adv + att + sites + pay + exp + phone + conflicts };
  };

  UB.workerName = id => (UB.idx.workers[id] || {}).name || '—';
  UB.siteName = id => (UB.idx.sites[id] || {}).name || '—';
  UB.customerOfSite = id => UB.idx.customers[(UB.idx.sites[id] || {}).customerId] || {};
  UB.foremanName = id => (UB.idx.foremen[id] || {}).name || (UB.user && UB.user.id === id ? UB.user.name : '—');
  UB.wtName = id => (UB.idx.workTypes[id] || {}).name || '—';
  UB.wtUnit = id => (UB.idx.workTypes[id] || {}).unit || '';
  UB.isAdmin = () => UB.user && UB.user.role === 'admin';
  UB.seesPay = () => UB.isAdmin() || (UB.data.settings.foremanSeesPay === 'yes');
  UB.planDays = month => C.n((UB.data.planDays.find(p => p.month === month) || {}).days);
  UB.isClosed = month => UB.data.periods.some(p => p.month === month && p.status === 'CLOSED');
  UB.list = key => String(UB.data.settings[key] || '').split(',').map(s => s.trim()).filter(Boolean);
  UB.mapUrl = (lat, lng) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lng);

  /** Pul əməliyyatının statusu üçün çip. */
  const MCHIP = { PENDING: '', RETURNED: 'bad', APPROVED: 'accent', GIVEN: 'warn', LINK_SENT: 'warn', LINK_EXPIRED: 'bad', CLOSED: 'ok', SIGNED: 'ok', CONFLICT: 'bad', REJECTED: 'bad' };
  UB.moneyChip = s => '<span class="chip ' + (MCHIP[s] || '') + '">' + esc(t('ms_' + s)) + '</span>';
  UB.linkInfo = id => UB.data.links[id] || null;

  // ------------------------------------------------------------ PDF receipts (BR-26, BR-41)
  UB.receiptData = function (kind, r) {
    const st = UB.data.settings;
    const company = { name: st.companyName || 'Ustabaşı', voen: st.companyVoen || '', phone: st.companyPhone || '', address: st.companyAddress || '' };
    if (kind === 'ADV') {
      const w = UB.idx.workers[r.workerId] || {};
      return { kind, no: r.receiptNo, date: String(r.closedAt || r.confirmedAt || r.givenAt || r.approvedAt || r.created).slice(0, 10), amount: r.amount, payer: company.name, payee: w.name || '', by: UB.foremanName(r.foremanId), confirmedAt: r.confirmedAt, company, lang: w.lang || 'az' };
    }
    const site = UB.idx.sites[r.siteId] || {}, c = UB.idx.customers[site.customerId] || {};
    return { kind, no: r.receiptNo, date: r.date, amount: r.amount, payer: c.name || '', payerVoen: c.voen || '', payee: company.name, site: site.name || '', by: UB.foremanName(r.foremanId || site.foremanId), method: r.method, confirmedAt: r.confirmedAt, company, lang: c.lang || 'az' };
  };
  UB.sendPdf = async function (kind, r, btn) {
    const data = UB.receiptData(kind, r);
    const run = async () => {
      const blob = C.receiptPdf(data, data.lang);
      const name = (kind === 'ADV' ? 'avans-' : 'qebz-') + String(data.no || r.id).replace(/[^\w-]+/g, '') + '.pdf';
      const how = await C.sharePdf(blob, name, t(kind === 'ADV' ? 'pdf_adv_title' : 'pdf_pay_title', null, data.lang) + ' ' + (data.no || ''));
      // Surəti Drive-a (fon rejimində); jurnal serverdə yazılır.
      C.blobToDataUrl(blob).then(du => API.call('storePdf', { data: du, name: name.replace('.pdf', ''), sheet: kind === 'ADV' ? 'Advances' : 'CustomerPayments', id: r.id })).catch(() => {});
      return how;
    };
    return btn ? C.busy(btn, run) : run();
  };

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
      { k: 'approvals', i: 'check', l: 'nav_approvals', ls: 'nav_approvals_short', badge: true },
      { k: 'money', i: 'cash', l: 'nav_money', badgeConflicts: true },
      { k: 'payroll', i: 'file', l: 'nav_payroll' },
      { k: 'foremen', i: 'user', l: 'nav_foremen' },
      { k: 'workers', i: 'users', l: 'nav_workers' },
      { k: 'sites', i: 'pin', l: 'nav_sites' },
      { k: 'reports', i: 'bars', l: 'nav_reports' },
      { k: 'catalog', i: 'list', l: 'nav_catalog' },
      { k: 'journal', i: 'journal', l: 'nav_journal' },
      { k: 'settings', i: 'gear', l: 'nav_settings' }
    ],
    adminBottom: ['home', 'approvals', 'money', 'payroll', 'more'],
    foreman: [
      { k: 'home', i: 'home', l: 'nav_home' },
      { k: 'workers', i: 'users', l: 'nav_workers' },
      { k: 'work', i: 'file', l: 'nav_work' },
      { k: 'advances', i: 'wallet', l: 'nav_advances' },
      { k: 'payments', i: 'cash', l: 'nav_payments' },
      { k: 'expenses', i: 'receipt', l: 'nav_expenses' },
      { k: 'sites', i: 'pin', l: 'nav_sites_short' },
      { k: 'settings', i: 'gear', l: 'nav_settings' }
    ],
    foremanBottom: ['home', 'workers', 'work', 'advances', 'more']
  };

  function navItems() { return UB.isAdmin() ? NAV.admin : NAV.foreman; }
  function bottomKeys() { return UB.isAdmin() ? NAV.adminBottom : NAV.foremanBottom; }

  function shell(route) {
    const items = navItems();
    const cnt = UB.counts();
    const cur = route.name;
    const inMore = items.filter(x => bottomKeys().indexOf(x.k) < 0).map(x => x.k).concat(['more', 'queue']);
    const link = (it, compact) => {
      const active = cur === it.k || (it.k === 'more' && inMore.indexOf(cur) >= 0);
      const n = UB.isAdmin() ? (it.badge ? cnt.total - cnt.conflicts : it.badgeConflicts ? cnt.conflicts : 0) : 0;
      const badge = n ? '<span class="badge">' + n + '</span>' : '';
      return '<a href="#/' + (it.k === 'home' ? '' : it.k) + '"' + (active ? ' aria-current="page"' : '') + '>' + icon(it.i, compact ? 22 : 18) + '<span>' + esc(t(compact && it.ls ? it.ls : it.l)) + '</span>' + badge + '</a>';
    };
    const bottom = bottomKeys().map(k => k === 'more' ? { k: 'more', i: 'more', l: 'nav_more' } : items.find(x => x.k === k)).map(it => link(it, true)).join('');
    // "Çıxış" menyunun ən altında, "Ayarlar"-dan sonra (BR-69).
    const logoutLink = '<a href="#/" data-g="logout" class="nav-logout">' + icon('logout', 18) + '<span>' + esc(t('logout')) + '</span></a>';
    return '<div class="shell">' +
      '<aside class="side"><div class="brand">' + logo(34, { animate: true }) + '<span>Ustabaşı</span></div>' +
      '<nav class="nav" aria-label="' + esc(t('menu')) + '">' + items.map(it => link(it)).join('') + logoutLink + '</nav>' +
      '<div class="side-foot">' + langSeg() + '<div class="small muted">' + esc(UB.user.name) + ' · ' + esc(t(UB.isAdmin() ? 'role_admin' : 'role_foreman')) + '</div></div></aside>' +
      '<header class="topbar"><a href="#/" class="row" style="gap:8px;color:var(--text)">' + logo(28) + '<b style="font-size:17px">Ustabaşı</b></a>' +
      '<a href="#/settings" class="btn icon" style="border-radius:22px" aria-label="' + esc(t('nav_settings')) + '"><span class="small" style="font-weight:600">' + esc(C.initials(UB.user.name)) + '</span></a></header>' +
      '<main class="main" id="view"></main>' +
      '<nav class="bottom" aria-label="' + esc(t('menu')) + '">' + bottom + '</nav></div>';
  }

  function langSeg() {
    const l = C.getLang();
    return '<div class="seg" role="group" aria-label="' + esc(t('language')) + '">' + C.LANGS.map(x => '<button type="button" data-g="lang" data-l="' + x + '" aria-pressed="' + (l === x) + '">' + x.toUpperCase() + '</button>').join('') + '</div>';
  }
  UB.langSeg = langSeg;
  UB.langOptions = () => C.LANGS.map(x => [x, C.LANG_NAMES[x]]);

  function render() {
    const root = document.getElementById('app');
    if (!UB.data) return;
    if (UB.user && UB.user.mustChange) return renderPassword(true);
    const route = parseRoute();
    if (route.name === 'print') {
      root.innerHTML = '<div class="print-page" id="view"></div>';
      document.documentElement.classList.add('printing');
      return UB.screens.common.print(document.getElementById('view'), route);
    }
    document.documentElement.classList.remove('printing');
    root.innerHTML = shell(route);
    const view = document.getElementById('view');
    const set = UB.isAdmin() ? UB.screens.admin : UB.screens.foreman;
    const fn = set[route.name] || UB.screens.common[route.name] || set.home;
    try { fn(view, route); }
    catch (e) { console.error(e); view.innerHTML = '<div class="empty">' + esc(C.errorText(e)) + '</div>'; }
    netBar();
    window.scrollTo(0, 0);
  }
  UB.render = render;

  // global clicks (lang, logout)
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-g]');
    if (!el) return;
    if (el.dataset.g === 'lang') { e.preventDefault(); setLanguage(el.dataset.l); }
    if (el.dataset.g === 'logout') { e.preventDefault(); logout(); }
  });

  function setLanguage(l) {
    C.setLang(l);
    if (UB.user && navigator.onLine) API.call('setLang', { lang: l }).catch(() => {});
    if (UB.data) render(); else renderLogin();
  }

  async function logout(silent) {
    if (!silent) {
      const pending = UB.queue.filter(x => !x.expired).length;
      const ok = await C.confirmDlg(pending ? t('logout_q_queue', { n: pending }) : t('logout_q'), t('logout'), !!pending);
      if (!ok) return;
    }
    API.call('logout', {}).catch(() => {});
    LS.set('ub_token', null);
    clearSnap(); syncBadge(false);
    C.Q.clear().catch(() => {}); UB.queue = [];
    UB.data = null; UB.user = null;
    location.hash = '#/';
    netBar();
    renderLogin();
  }
  UB.logout = logout;

  // ------------------------------------------------------------ login & password (BR-60)
  function pwRules(v) {
    v = String(v || '');
    return [
      ['pw_len', v.length >= 8],
      ['pw_upper', /\p{Lu}/u.test(v)],
      ['pw_lower', /\p{Ll}/u.test(v)],
      ['pw_digit', /\d/.test(v)],
      ['pw_symbol', /[^\p{L}\d\s]/u.test(v)]
    ];
  }
  UB.pwRules = pwRules;
  function rulesHtml(v) { return '<ul class="rules">' + pwRules(v).map(r => '<li class="' + (r[1] ? 'ok' : '') + '">' + icon(r[1] ? 'checkc' : 'x', 14) + esc(t(r[0])) + '</li>').join('') + '</ul>'; }
  UB.rulesHtml = rulesHtml;
  function eyeBtn() { return '<button type="button" class="btn icon ghost eye" data-eye aria-label="' + esc(t('show_password')) + '">' + icon('lock', 16) + '</button>'; }
  function bindEyes(root) { root.querySelectorAll('[data-eye]').forEach(b => b.addEventListener('click', () => { const i = b.parentNode.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; })); }
  UB.eyeBtn = eyeBtn; UB.bindEyes = bindEyes;

  function renderLogin(msg) {
    const root = document.getElementById('app');
    document.documentElement.classList.remove('printing');
    API.warm(); // Google serveri soyuq başlayır — şifrə yazılana qədər oyansın
    root.innerHTML = '<div class="login"><form class="login-box" id="login-form" autocomplete="on">' +
      '<div class="login-brand">' + logo(96, { animate: true }) + '<div class="name">Ustabaşı</div><div class="muted">' + esc(t('tagline')) + '</div></div>' +
      '<div class="row" style="justify-content:center">' + langSeg() + '</div>' +
      '<label class="field"><span>' + esc(t('phone')) + '</span><input name="phone" type="tel" inputmode="tel" autocomplete="username" placeholder="994 50 000 00 00" required></label>' +
      '<label class="field"><span>' + esc(t('password')) + '</span><span class="pw-wrap"><input name="password" type="password" autocomplete="current-password" required>' + eyeBtn() + '</span></label>' +
      (msg ? '<div class="err" role="alert">' + esc(msg) + '</div>' : '') +
      '<button type="submit" class="btn primary big block">' + esc(t('login')) + '</button>' +
      '<div class="tiny dim" style="text-align:center">v' + VERSION + '</div></form></div>';
    const form = document.getElementById('login-form');
    bindEyes(form);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(form);
      const btn = form.querySelector('[type=submit]');
      try {
        await C.busy(btn, async () => {
          const r = await API.call('login', { phone: f.phone, password: f.password });
          LS.set('ub_token', r.token);
          if (r.user.lang) C.setLang(r.user.lang);
          if (r.mustChange) { UB.user = r.user; return renderPassword(true); }
          await load();
          if (!location.hash || location.hash === '#') location.hash = '#/';
          render();
          loadQueue();
        });
      } catch (err) { /* toast shown */ }
    });
    form.addEventListener('click', e => { const el = e.target.closest('[data-g=lang]'); if (el) { e.preventDefault(); e.stopPropagation(); C.setLang(el.dataset.l); renderLogin(); } }, true);
  }

  /** İlk girişdə (və admin sıfırlayandan sonra) yeni şifrə məcburidir. */
  function renderPassword(forced) {
    const root = document.getElementById('app');
    root.innerHTML = '<div class="login"><form class="login-box" id="pw-form">' +
      '<div class="login-brand">' + logo(72) + '<div class="name" style="font-size:24px">' + esc(t('pw_new_title')) + '</div><div class="muted">' + esc(t('pw_new_hint')) + '</div></div>' +
      '<label class="field"><span>' + esc(t('new_password')) + '</span><span class="pw-wrap"><input name="newPassword" type="password" autocomplete="new-password" required>' + eyeBtn() + '</span></label>' +
      '<div id="rules">' + rulesHtml('') + '</div>' +
      '<label class="field"><span>' + esc(t('repeat_password')) + '</span><span class="pw-wrap"><input name="repeat" type="password" autocomplete="new-password" required>' + eyeBtn() + '</span></label>' +
      '<button type="submit" class="btn primary big block">' + esc(t('save')) + '</button>' +
      '<button type="button" class="btn ghost block" data-g="logout">' + esc(t('logout')) + '</button></form></div>';
    const form = document.getElementById('pw-form');
    bindEyes(form);
    form.newPassword.addEventListener('input', () => { form.querySelector('#rules').innerHTML = rulesHtml(form.newPassword.value); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(form);
      if (pwRules(f.newPassword).some(r => !r[1])) return C.toast(t('err_weak_password'), true);
      if (f.newPassword !== f.repeat) return C.toast(t('err_pw_mismatch'), true);
      await C.busy(form.querySelector('[type=submit]'), async () => {
        await API.call('setPassword', { newPassword: f.newPassword });
        C.toast(t('pw_saved'));
        await load();
        location.hash = '#/';
        render();
        loadQueue();
      }).catch(() => {});
    });
    return forced;
  }
  UB.renderPassword = renderPassword;

  // ------------------------------------------------------------ common screens
  UB.screens.common.more = function (view) {
    const rest = navItems().filter(x => bottomKeys().indexOf(x.k) < 0);
    view.innerHTML = '<h1>' + esc(t('nav_more')) + '</h1><div class="card"><div class="list">' +
      rest.map(it => '<a class="list-row click" href="#/' + it.k + '" style="color:var(--text)">' + icon(it.i, 20) + '<span class="title grow">' + esc(t(it.l)) + '</span>' + icon('chev', 18) + '</a>').join('') +
      (UB.queue.length ? '<a class="list-row click" href="#/queue" style="color:var(--text)">' + icon('offline', 20) + '<span class="title grow">' + esc(t('queue_title')) + '</span><span class="badge">' + UB.queue.length + '</span></a>' : '') +
      '<a class="list-row click nav-logout" href="#/" data-g="logout">' + icon('logout', 20) + '<span class="title grow">' + esc(t('logout')) + '</span></a>' +
      '</div></div>';
  };

  /** Göndərilməmiş qeydlər (offline növbə). */
  UB.screens.common.queue = async function (view) {
    await loadQueue();
    const L = UB.queue;
    const lab = x => x.label || t('qa_' + x.action);
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('queue_title')) + '</h1><div class="sub">' + esc(t('queue_hint', { d: UB.data.settings.offlineDays || 3 })) + '</div></div>' +
      '<button type="button" class="btn primary" data-act="send"' + (navigator.onLine ? '' : ' disabled') + '>' + icon('refresh', 16) + esc(t('queue_send', { n: L.length })) + '</button></div>' +
      '<section class="card" style="gap:4px"><div class="list">' + (L.map(x => '<div class="list-row"><div class="grow"><div class="title">' + esc(lab(x)) + '</div><div class="meta">' + esc(String(x.created).replace('T', ' ').slice(0, 16)) +
        (x.expired ? ' · ' + t('queue_expired') : x.error ? ' · ' + C.errorText({ code: x.error }) : ' · ' + t('queue_not_sent')) + '</div></div>' +
        (x.expired || x.error ? '<span class="chip bad">' + esc(t(x.expired ? 'queue_expired_short' : 'error')) + '</span>' : '<span class="chip warn">' + esc(t('queue_not_sent')) + '</span>') +
        '<button type="button" class="btn icon sm" data-act="del" data-id="' + esc(x.id) + '" aria-label="' + esc(t('remove')) + '">' + icon('x', 16) + '</button></div>').join('') || '<div class="empty">' + esc(t('queue_empty')) + '</div>') + '</div></section>';
    C.bind(view, {
      send: b => C.busy(b, () => flushQueue(true)).then(() => UB.screens.common.queue(view)),
      del: async el => { if (!await C.confirmDlg(t('queue_del_q'), t('remove'), true)) return; await C.Q.del(el.dataset.id); await loadQueue(); UB.screens.common.queue(view); }
    });
  };

  UB.screens.common.settings = function (view) {
    const s = UB.data.settings;
    const admin = UB.isAdmin();
    const sel = (name, val, opts) => '<select name="' + name + '">' + opts.map(o => '<option value="' + o[0] + '"' + (String(val) === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    const num = (name, label, min, max, step) => '<label class="field"><span>' + esc(t(label)) + '</span><input name="' + name + '" type="number" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + esc(s[name]) + '"></label>';
    const txt = (name, label, hint) => '<label class="field"><span>' + esc(t(label)) + '</span><input name="' + name + '" type="text" value="' + esc(s[name]) + '">' + (hint ? '<span class="hint">' + esc(t(hint)) + '</span>' : '') + '</label>';
    const sm = UB.data.summary || {};
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_settings')) + '</h1></div>' +
      '<div class="cols"><div class="col-2 stack">' +
      '<section class="card"><h2>' + esc(t('profile')) + '</h2><div class="kv"><span>' + esc(t('name')) + '</span><span>' + esc(UB.user.name) + '</span><span>' + esc(t('phone')) + '</span><span class="mono">' + esc(UB.user.phone) + '</span><span>' + esc(t('role')) + '</span><span>' + esc(t(admin ? 'role_admin' : 'role_foreman')) + '</span></div>' +
      '<div class="row">' + langSeg() + '</div></section>' +
      '<section class="card"><h2>' + esc(t('change_password')) + '</h2><form class="form" id="pw-form">' +
      '<label class="field"><span>' + esc(t('old_password')) + '</span><span class="pw-wrap"><input name="oldPassword" type="password" autocomplete="current-password" required>' + eyeBtn() + '</span></label>' +
      '<label class="field"><span>' + esc(t('new_password')) + '</span><span class="pw-wrap"><input name="newPassword" type="password" autocomplete="new-password" required>' + eyeBtn() + '</span></label>' +
      '<div id="rules">' + rulesHtml('') + '</div>' +
      '<div><button class="btn primary" type="submit">' + esc(t('save')) + '</button></div><div class="tiny muted">' + esc(t('pw_sessions_note')) + '</div></form></section>' +
      // Sürət yoxlaması yalnız admində (BR-45)
      (admin ? '<section class="card"><h2>' + esc(t('diag_title')) + '</h2><div class="small muted">' + esc(t('diag_hint')) + '</div><div id="diag">' + diagLast() + '</div>' +
        '<div><button type="button" class="btn" id="diag-run">' + icon('clock', 16) + esc(t('diag_run')) + '</button></div></section>' +
        '<section class="card"><h2>' + esc(t('system')) + '</h2><div class="kv wide"><span>' + esc(t('last_backup')) + '</span><span id="lb">' + esc(sm.lastBackup ? String(sm.lastBackup).replace('T', ' ').slice(0, 16) : '—') + '</span></div>' +
        '<div class="row"><button type="button" class="btn" id="backup-now">' + icon('download', 16) + esc(t('backup_now')) + '</button></div>' +
        ((sm.locked || []).length ? '<h3>' + esc(t('locked_users')) + '</h3><div class="list">' + sm.locked.map(x => '<div class="list-row"><span class="grow">' + esc(x.name) + ' · ' + esc(t('locked_until', { t: C.fmtTime(x.until) })) + '</span><button type="button" class="btn sm" data-unlock="' + esc(x.id) + '">' + esc(t('unlock')) + '</button></div>').join('') + '</div>' : '') +
        '</section>' : '') +
      '<div class="tiny dim">Ustabaşı v' + VERSION + (UB.data.version ? ' · server v' + esc(UB.data.version) : '') + '</div>' +
      '</div>' +
      (admin ? '<div class="col-2"><form class="stack" id="set-form">' +
        '<section class="card"><h2>' + esc(t('set_links')) + '</h2><div class="grid2">' +
        num('linkTtlMin', 's_link_ttl', 3, 60) + num('workLinkHours', 's_work_link_h', 1, 168) + num('moneyLinkHours', 's_money_link_h', 1, 168) + num('maxMoneyLinks', 's_max_money_links', 1, 10) +
        num('defaultRadius', 's_radius', 50, 500) + num('photoWarnM', 's_photo_warn', 50, 5000) + num('siteMinPhotos', 's_site_photos', 0, 5) + '</div></section>' +
        '<section class="card"><h2>' + esc(t('set_pay')) + '</h2><div class="grid2">' +
        num('lateToleranceMin', 's_late', 0, 120) +
        '<label class="field"><span>' + esc(t('s_late_mode')) + '</span>' + sel('lateMode', s.lateMode || 'FULL', [['FULL', t('lm_FULL')], ['HALF', t('lm_HALF')], ['HOUR', t('lm_HOUR')]]) + '</label>' +
        num('advanceLimitPct', 's_adv_limit', 0, 100) + num('bonusCapPct', 's_bonus_cap', 0, 1000) +
        '<label class="field"><span>' + esc(t('s_foreman_pay')) + '</span>' + sel('foremanSeesPay', s.foremanSeesPay, [['yes', t('yes')], ['no', t('no')]]) + '</label>' +
        num('maxForemen', 's_max_foremen', 1, 50) + num('maxWorkersPerForeman', 's_max_workers', 1, 100) + '</div>' +
        txt('penaltyTypes', 's_penalty_types', 'comma_hint') + txt('expenseCategories', 's_expense_cats', 'comma_hint') + '</section>' +
        '<section class="card"><h2>' + esc(t('set_company')) + '</h2><div class="small muted">' + esc(t('set_company_hint')) + '</div><div class="grid2">' +
        txt('companyName', 'company_name') + txt('companyVoen', 'voen') + txt('companyPhone', 'phone') + txt('companyAddress', 'address') + '</div></section>' +
        '<section class="card"><h2>' + esc(t('set_security')) + '</h2><div class="grid2">' +
        num('sessionDays', 's_session_days', 1, 365) + num('offlineDays', 's_offline_days', 1, 14) +
        '<label class="field"><span>' + esc(t('s_backup_email')) + '</span><input name="backupEmail" type="email" value="' + esc(s.backupEmail) + '"><span class="hint">' + esc(t('s_backup_email_hint')) + '</span></label></div></section>' +
        '<div><button class="btn primary" type="submit">' + esc(t('save')) + '</button></div></form></div>' : '') +
      '</div>';
    const pf = view.querySelector('#pw-form');
    bindEyes(pf);
    pf.newPassword.addEventListener('input', () => { pf.querySelector('#rules').innerHTML = rulesHtml(pf.newPassword.value); });
    pf.addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(pf);
      if (pwRules(f.newPassword).some(r => !r[1])) return C.toast(t('err_weak_password'), true);
      await C.busy(pf.querySelector('button[type=submit]'), () => API.call('setPassword', f)).then(() => { pf.reset(); pf.querySelector('#rules').innerHTML = rulesHtml(''); C.toast(t('pw_saved')); }).catch(() => {});
    });
    const dr = view.querySelector('#diag-run'); if (dr) dr.addEventListener('click', e => runDiag(view.querySelector('#diag'), e.currentTarget));
    const bn = view.querySelector('#backup-now');
    if (bn) bn.addEventListener('click', e => C.busy(e.currentTarget, async () => { const r = await API.call('backupNow', {}); view.querySelector('#lb').textContent = String(r.at).replace('T', ' ').slice(0, 16); C.toast(t('backup_done')); }).catch(() => {}));
    view.querySelectorAll('[data-unlock]').forEach(b => b.addEventListener('click', () => C.busy(b, () => API.call('unlockUser', { id: b.dataset.unlock })).then(() => { C.toast(t('saved')); UB.refresh(); }).catch(() => {})));
    const sf = view.querySelector('#set-form');
    if (sf) sf.addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(sf);
      await C.busy(sf.querySelector('button[type=submit]'), async () => { UB.data.settings = await API.call('saveSettings', { settings: f }); C.toast(t('saved')); }).catch(() => {});
    });
  };

  // ------------------------------------------------------------ speed diagnostics (yalnız admin)
  const ACT = { bootstrap: 'diag_a_bootstrap', ping: 'diag_a_ping', login: 'diag_a_login', report: 'diag_a_report', calcPayroll: 'nav_payroll', setPlanDays: 'plan_days', createToken: 'create_link', saveWorkEntry: 'nav_work', tokenInfo: 'link', tokenConfirm: 'link', decide: 'approve' };
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

  // ------------------------------------------------------------ print (BR-27, BR-49)
  UB.screens.common.print = async function (view, route) {
    const kind = route.parts[1], arg = route.parts[2];
    const tools = '<div class="print-tools"><button class="btn" type="button" onclick="history.back()">' + icon('left', 16) + esc(t('back')) + '</button><button class="btn primary" type="button" id="do-print">' + icon('print', 16) + esc(t('print_pdf')) + '</button><span class="small" style="color:#555">' + esc(t('print_hint')) + '</span></div>';
    const co = UB.data.settings;
    const head = (title, sub) => '<div class="ph"><div><div style="font-weight:700;font-size:15px">' + esc(co.companyName || 'Ustabaşı') + (co.companyVoen ? ' · ' + esc(t('voen')) + ' ' + esc(co.companyVoen) : '') + '</div><h1>' + esc(title) + '</h1><div style="color:#444;font-size:13px">' + esc(sub || '') + '</div></div>' + logo(40) + '</div>';
    const bindPrint = (what, id) => { const b = view.querySelector('#do-print'); if (b) b.addEventListener('click', () => { API.call('logEvent', { event: 'print', what, id }).catch(() => {}); window.print(); }); };
    if (kind === 'receipt' || kind === 'preceipt') {
      const isAdv = kind === 'receipt';
      const r = (isAdv ? UB.data.advances : UB.data.payments).find(x => x.id === arg);
      if (!r) { view.innerHTML = tools + '<p>' + esc(t('not_found')) + '</p>'; return; }
      const data = UB.receiptData(isAdv ? 'ADV' : 'PAY', r);
      const c = C.receiptCanvas(data, C.getLang());
      view.innerHTML = tools + '<img class="receipt-img" alt="" src="' + c.toDataURL('image/png') + '">';
      bindPrint(isAdv ? 'receipt' : 'payment_receipt', r.id);
      return;
    }
    if (kind === 'advances') {
      const month = arg || C.monthISO();
      const list = UB.data.advances.filter(a => ['CLOSED', 'SIGNED'].indexOf(a.status) >= 0 && String(a.approvedAt || a.created).slice(0, 7) === month);
      let sum = 0;
      view.innerHTML = tools + head(t('print_adv_title'), C.monthName(month)) +
        '<div class="print-scroll"><table class="pt"><thead><tr><th>#</th><th>' + esc(t('receipt_no')) + '</th><th>' + esc(t('date')) + '</th><th>' + esc(t('worker')) + '</th><th>' + esc(t('foreman')) + '</th><th class="num">' + esc(t('amount')) + '</th><th>' + esc(t('signature')) + '</th></tr></thead><tbody>' +
        list.map((a, i) => { sum += C.n(a.amount); return '<tr><td>' + (i + 1) + '</td><td>' + esc(a.receiptNo) + '</td><td>' + esc(C.fmtDate(a.closedAt || a.approvedAt, true)) + '</td><td>' + esc(UB.workerName(a.workerId)) + '</td><td>' + esc(UB.foremanName(a.foremanId)) + '</td><td class="num">' + C.money(a.amount) + '</td><td class="sigcell"></td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="5"><b>' + esc(t('total')) + '</b></td><td class="num"><b>' + C.money(sum) + '</b></td><td></td></tr></tfoot></table></div>' + signs();
      bindPrint('advances', month);
      return;
    }
    if (kind === 'payroll') {
      const month = arg || C.monthISO();
      view.innerHTML = tools + '<div class="loading"><i></i></div>';
      try {
        const r = await API.call('calcPayroll', { month });
        const cols = ['S', 'bonus', 'advance', 'penalty', 'correction', 'total'];
        // Sahə rəisi üzrə qrup və aralıq cəm (S-35)
        const groups = {};
        r.lines.forEach(l => { const k = l.personType === 'FOREMAN' ? '_F' : (l.foremanId || '_'); (groups[k] = groups[k] || []).push(l); });
        const keys = Object.keys(groups).filter(k => k !== '_F').sort((a, b) => UB.foremanName(a).localeCompare(UB.foremanName(b))).concat(groups._F ? ['_F'] : []);
        const sumOf = (ls, k) => ls.reduce((s, l) => s + C.n(l[k]), 0);
        let n = 0;
        const rows = keys.map(k => {
          const ls = groups[k].sort((a, b) => a.name.localeCompare(b.name));
          return '<tr class="grp"><td colspan="' + (cols.length + 4) + '">' + esc(k === '_F' ? t('foremen_group') : t('foreman') + ': ' + UB.foremanName(k)) + '</td></tr>' +
            ls.map(l => '<tr><td>' + (++n) + '</td><td>' + esc(l.name) + '</td><td class="num">' + esc(l.daysWorked === '' ? '—' : l.daysWorked) + '</td>' + cols.map(c => '<td class="num' + (c === 'total' ? ' b' : '') + '">' + C.num(l[c]) + '</td>').join('') + '<td class="sigcell"></td></tr>').join('') +
            '<tr class="sub"><td colspan="3">' + esc(t('subtotal')) + '</td>' + cols.map(c => '<td class="num">' + C.num(sumOf(ls, c)) + '</td>').join('') + '<td></td></tr>';
        }).join('');
        view.innerHTML = tools + head(t('print_pay_title'), C.monthName(month) + ' · ' + t('plan_days') + ': ' + (r.planDays || '—') + (r.closed ? ' · ' + t('closed') : ' · ' + t('not_closed'))) +
          '<div class="print-scroll"><table class="pt payroll"><thead><tr><th>#</th><th>' + esc(t('name')) + '</th><th class="num">' + esc(t('days')) + '</th><th class="num">' + esc(t('col_std')) + '</th><th class="num">' + esc(t('col_bonus')) + '</th><th class="num">' + esc(t('col_adv')) + '</th><th class="num">' + esc(t('col_pen')) + '</th><th class="num">' + esc(t('col_corr')) + '</th><th class="num">' + esc(t('col_total')) + '</th><th>' + esc(t('signature')) + '</th></tr></thead><tbody>' +
          rows + '</tbody><tfoot><tr><td colspan="3"><b>' + esc(t('total')) + '</b></td>' + cols.map(c => '<td class="num"><b>' + C.num(sumOf(r.lines, c)) + '</b></td>').join('') + '<td></td></tr></tfoot></table></div>' + signs(true);
        bindPrint('payroll', month);
      } catch (e) { view.innerHTML = tools + '<p>' + esc(C.errorText(e)) + '</p>'; }
    }
  };
  function signs(acc) {
    return '<div class="signs"><div>' + esc(t('approved_by')) + ' (' + esc(t('role_admin')) + '): <span class="sign"></span></div>' + (acc ? '<div>' + esc(t('accountant')) + ': <span class="sign"></span></div>' : '') + '<div>' + esc(t('date')) + ': <span class="sign" style="min-width:100px"></span></div></div>';
  }

  /** WhatsApp üçün avans çeki mətni (PDF-in yanında qısa mətn). */
  UB.receiptText = function (a) {
    const w = UB.idx.workers[a.workerId] || {};
    const L = w.lang || 'az';
    return [
      'Ustabaşı · ' + t('receipt', null, L) + ' ' + a.receiptNo,
      t('date', null, L) + ': ' + String(a.closedAt || a.approvedAt).slice(0, 10),
      t('worker', null, L) + ': ' + (w.name || ''),
      t('amount', null, L) + ': ' + C.money(a.amount),
      t('foreman', null, L) + ': ' + UB.foremanName(a.foremanId)
    ].join('\n');
  };

  // ------------------------------------------------------------ boot
  window.addEventListener('hashchange', () => { if (UB.data) render(); });
  window.addEventListener('online', () => { netBar(); if (UB.data) { flushQueue(); sync(); } });
  window.addEventListener('offline', () => netBar());

  async function boot() {
    C.setLang(C.getLang());
    const root = document.getElementById('app');
    if (!API.token()) return renderLogin();
    const snap = readSnap();
    if (snap) {
      // Dərhal: son yadda saxlanan data ilə aç, təzəsini arxa planda gətir.
      setData(snap.d, snap.at);
      render();
      await loadQueue();
      sync();
      return;
    }
    if (!navigator.onLine) { renderLogin(t('err_network')); return; }
    root.innerHTML = '<div class="loading" style="min-height:100vh"><i></i>' + esc(t('loading')) + '</div>';
    try { await load(); render(); await loadQueue(); if (UB.queue.length) flushQueue(); }
    catch (e) {
      if (e.code === 'auth') { LS.set('ub_token', null); clearSnap(); return renderLogin(); }
      if (e.code === 'must_change') return renderPassword(true);
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
