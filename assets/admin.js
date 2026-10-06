/* Ustabaşı — admin ekranları və ümumi formalar */
(function () {
  'use strict';
  const C = window.UBCore, UB = window.UB;
  const { t, esc, icon, API } = C;
  const S = UB.screens.admin;
  const F = UB.forms = {};

  const GRADES = ['helper', 'master', 'senior'];
  const MODELS = ['STD', 'BONUS', 'STD_BONUS'];
  const sel = (name, val, opts, attrs) => '<select name="' + name + '" ' + (attrs || '') + '>' + opts.map(o => '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  const fld = (label, inner, hint) => '<label class="field"><span>' + esc(label) + '</span>' + inner + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
  const inp = (name, val, type, attrs) => '<input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(val === undefined || val === null ? '' : val) + '" ' + (attrs || '') + '>';
  const payLabel = x => t('pt_' + (x.payType || 'MONTH')) + ' · ' + t('pm_' + (x.payModel || 'STD'));

  /** Bir iş sətrinin usta payı üzrə bonus məbləği (server düsturu ilə eyni). */
  UB.shareAmount = function (entry, share, worker) {
    const wt = UB.idx.workTypes[entry.workTypeId]; if (!wt) return 0;
    const qty = C.n(entry.qty), part = C.n(share.share) / 100;
    if (wt.bonusType === 'PCT') {
      const est = UB.data.estimates.find(e => e.siteId === entry.siteId && e.workTypeId === entry.workTypeId);
      return qty * C.n(est && est.clientPrice) * C.n(wt.percent) / 100 * part;
    }
    const g = (worker || {}).grade;
    let r = g === 'helper' ? C.n(wt.rateHelper) : g === 'senior' ? C.n(wt.rateSenior) : C.n(wt.rateMaster);
    if (!r) r = C.n(wt.rateMaster);
    return qty * r * part;
  };

  function monthNav(month, act) {
    return '<div class="row" style="gap:6px"><button type="button" class="btn icon" data-act="' + act + '" data-k="-1" aria-label="' + esc(t('prev_month')) + '">' + icon('left') + '</button>' +
      '<b style="min-width:140px;text-align:center">' + esc(C.monthName(month)) + '</b>' +
      '<button type="button" class="btn icon" data-act="' + act + '" data-k="1" aria-label="' + esc(t('next_month')) + '">' + icon('chev') + '</button></div>';
  }

  // =========================================================== approvals (shared logic)
  async function decide(type, id, ok, btn) {
    let reason = '';
    if (!ok) {
      reason = await C.promptDlg(t(type === 'work' ? 'return_work' : 'reject'), t('reason'), { textarea: true, ok: t(type === 'work' ? 'return' : 'reject') });
      if (reason === null) return;
    }
    const action = { work: 'approveWork', adv: 'approveAdvance', att: 'approveAttendance', site: 'approveSite' }[type];
    await C.busy(btn, () => API.call(action, { id, ok, reason })).then(() => { C.toast(t(ok ? 'approved' : 'returned')); UB.refresh(); }).catch(() => {});
  }
  UB.decide = decide;

  function pendingItems() {
    const d = UB.data, items = [];
    d.entries.filter(e => e.status === 'ADMIN_PENDING').forEach(e => items.push({ type: 'work', id: e.id, ts: e.created, e }));
    d.advances.filter(a => a.status === 'PENDING').forEach(a => items.push({ type: 'adv', id: a.id, ts: a.created, a }));
    d.sites.filter(s => s.status === 'PENDING').forEach(s => items.push({ type: 'site', id: s.id, ts: s.created, s }));
    d.attendance.filter(a => a.status === 'PENDING').forEach(a => items.push({ type: 'att', id: a.id, ts: a.ts, att: a }));
    return items.sort((x, y) => String(y.ts).localeCompare(String(x.ts)));
  }

  function sharesText(e) {
    return UB.data.shares.filter(s => s.entryId === e.id).map(s => C.shortName(UB.workerName(s.workerId)) + ' ' + C.num(s.share, 0) + '%' + (s.confirmedAt ? ' ✓' : '')).join(', ');
  }

  function itemCompact(it) {
    const btns = '<button type="button" class="btn icon ok" data-act="ok" data-type="' + it.type + '" data-id="' + esc(it.id) + '" aria-label="' + esc(t('approve')) + '">' + icon('check', 20) + '</button>' +
      '<button type="button" class="btn icon" data-act="no" data-type="' + it.type + '" data-id="' + esc(it.id) + '" aria-label="' + esc(t(it.type === 'work' ? 'return' : 'reject')) + '">' + icon(it.type === 'work' || it.type === 'site' ? 'undo' : 'x') + '</button>';
    let tag = '', title = '', meta = '';
    if (it.type === 'work') { const e = it.e; tag = '<span class="tag accent">' + esc(t('tag_work')) + '</span>'; title = UB.wtName(e.workTypeId) + ' · ' + C.num(e.qty) + ' ' + UB.wtUnit(e.workTypeId); meta = sharesText(e) + ' · ' + UB.siteName(e.siteId); }
    if (it.type === 'adv') { const a = it.a; tag = '<span class="tag warn">' + esc(t('tag_adv')) + '</span>'; title = C.money(a.amount) + ' · ' + UB.workerName(a.workerId); meta = C.shortName(UB.foremanName(a.foremanId)) + (a.overLimit === 'yes' ? ' · ' + t('over_limit') : ' · ' + t('within_limit')); }
    if (it.type === 'site') { const s = it.s; tag = '<span class="tag">' + esc(t('tag_site')) + '</span>'; title = s.name; meta = ((UB.idx.customers[s.customerId] || {}).name || '') + ' · ' + t('radius_m', { m: s.radius }); }
    if (it.type === 'att') { const a = it.att; tag = '<span class="tag">' + esc(t('tag_manual')) + '</span>'; title = t(a.kind === 'IN' ? 'kind_in' : 'kind_out') + ' · ' + UB.workerName(a.workerId); meta = C.fmtDate(a.date) + ' ' + C.fmtTime(a.ts) + ' · ' + a.reason; }
    return '<div class="list-row">' + tag + '<div class="grow"><div class="title">' + esc(title) + '</div><div class="meta">' + esc(meta) + '</div></div>' + btns + '</div>';
  }

  // =========================================================== dashboard
  S.home = function (view) {
    const d = UB.data;
    const workers = d.workers.filter(w => w.status === 'active');
    const st = {}; workers.forEach(w => { st[w.id] = UB.todayStatus(w.id); });
    const present = workers.filter(w => st[w.id].code !== 'absent').length;
    const late = workers.filter(w => st[w.id].code === 'late').length;
    const sitesActive = d.sites.filter(s => s.status === 'APPROVED');
    const custs = {}; sitesActive.forEach(s => { custs[s.customerId] = 1; });
    const cnt = UB.counts();
    const pct = workers.length ? Math.round(present / workers.length * 100) : 0;
    const now = new Date();
    const foremen = d.foremen.filter(f => f.status === 'active');

    const feed = d.attendance.filter(a => a.date === d.today).map(a => ({ ts: a.ts, a }))
      .concat(d.geoRejects.filter(g => String(g.ts).slice(0, 10) === d.today).map(g => ({ ts: g.ts, g })))
      .sort((x, y) => String(y.ts).localeCompare(String(x.ts))).slice(0, 8);

    view.innerHTML =
      '<div class="page-head"><div><div class="sub">' + esc(C.weekday(now) + ', ' + C.fmtDate(d.today, true)) + '</div><h1>' + esc(t('today')) + '</h1></div>' +
      '<div class="row"><button type="button" class="btn" data-act="refresh">' + icon('refresh', 16) + esc(t('refresh')) + '</button><a class="btn primary" href="#/payroll">' + esc(t('payroll_of', { m: C.monthName(d.month) })) + '</a></div></div>' +
      '<div class="kpis">' +
      '<div class="kpi"><div class="label">' + esc(t('k_present')) + '</div><div class="value">' + present + '<small> / ' + workers.length + '</small></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('k_late')) + '</div><div class="value" style="color:var(--warn)">' + late + '</div><div class="small muted">' + esc(t('k_late_sub', { m: UB.tol() })) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('k_sites')) + '</div><div class="value">' + sitesActive.length + '</div><div class="small muted">' + esc(t('k_customers', { n: Object.keys(custs).length })) + '</div></div>' +
      '<a class="kpi" href="#/approvals" style="color:var(--text)"><div class="label">' + esc(t('k_pending')) + '</div><div class="value" style="color:var(--accent)">' + cnt.total + '</div><div class="small muted">' + esc(t('k_pending_sub', { w: cnt.work, a: cnt.adv, s: cnt.sites, m: cnt.att })) + '</div></a>' +
      '<div class="kpi wide"><div class="label">' + esc(t('k_fund', { m: C.monthName(d.month).split(' ')[0] })) + '</div><div class="value" id="kpi-fund">…</div><div class="small muted" id="kpi-fund-sub">' + esc(t('interim_calc')) + '</div></div>' +
      '</div>' +
      '<div class="cols">' +
      '<section class="card col-3"><div class="card-head"><h2>' + esc(t('foremen_month', { m: C.monthName(d.month).split(' ')[0] })) + '</h2><a href="#/foremen" class="small">' + esc(t('all')) + '</a></div>' +
      (foremen.length ? '<div class="table-wrap"><table class="t" style="min-width:520px"><thead><tr><th>' + esc(t('foreman')) + '</th><th class="num">' + esc(t('workers_short')) + '</th><th class="num">' + esc(t('today')) + '</th><th class="num">' + esc(t('sites_short')) + '</th><th class="num">' + esc(t('month_cost')) + '</th><th class="num">' + esc(t('attendance')) + '</th></tr></thead><tbody>' +
        foremen.map(f => {
          const ws = workers.filter(w => w.foremanId === f.id), pr = ws.filter(w => st[w.id].code !== 'absent').length;
          const p = ws.length ? Math.round(pr / ws.length * 100) : 0;
          return '<tr class="click" data-act="goForeman" data-id="' + esc(f.id) + '"><td><b>' + esc(f.name) + '</b></td><td class="num">' + ws.length + '</td><td class="num">' + pr + '</td><td class="num">' + d.sites.filter(s => s.foremanId === f.id && s.status === 'APPROVED').length + '</td><td class="num" data-cost="' + esc(f.id) + '">…</td><td class="num" style="color:' + (p >= 90 ? 'var(--ok)' : 'var(--warn)') + '">' + (ws.length ? p + '%' : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">' + esc(t('no_foremen')) + ' <a href="#/foremen">' + esc(t('add')) + '</a></div>') +
      '</section>' +
      '<section class="card col-2" style="gap:4px"><div class="card-head" style="margin-bottom:6px"><h2>' + esc(t('k_pending')) + '</h2><a href="#/approvals" class="small">' + esc(t('all_n', { n: cnt.total })) + '</a></div>' +
      '<div class="list" id="pending-list">' + (pendingItems().slice(0, 5).map(itemCompact).join('') || '<div class="empty">' + esc(t('nothing_pending')) + '</div>') + '</div></section>' +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>' + esc(t('live_attendance')) + '</h2><span class="chip ok">● ' + esc(t('today')) + '</span></div>' +
      (feed.length ? '<div class="table-wrap"><table class="t" style="min-width:620px"><tbody>' + feed.map(x => {
        if (x.g) return '<tr><td class="mono muted" style="width:64px">' + C.fmtTime(x.g.ts) + '</td><td><b>' + esc(UB.workerName(x.g.workerId)) + '</b></td><td>' + esc(t('kind_in')) + '</td><td class="num" style="color:var(--bad)">' + esc(fmtDist(x.g.dist)) + '</td><td class="muted">' + esc(UB.siteName(x.g.siteId)) + '</td><td><span class="chip bad">' + esc(t('geo_reject')) + '</span></td></tr>';
        const a = x.a, lateM = C.n(a.diffMin);
        let chip = '<span class="chip ok">' + esc(t('on_time')) + '</span>';
        if (a.status === 'PENDING') chip = '<span class="chip">' + esc(t('awaiting_approval')) + '</span>';
        else if (a.kind === 'IN' && lateM > UB.tol()) chip = '<span class="chip warn">' + esc(t('st_late', { m: lateM })) + '</span>';
        else if (a.kind === 'OUT' && lateM < -UB.tol()) chip = '<span class="chip warn">' + esc(t('early_leave', { m: -lateM })) + '</span>';
        return '<tr><td class="mono muted" style="width:64px">' + C.fmtTime(a.ts) + '</td><td><b>' + esc(UB.workerName(a.workerId)) + '</b></td><td>' + esc(t(a.kind === 'IN' ? 'kind_in' : 'kind_out')) + (a.source === 'MANUAL' ? ' · ' + esc(t('manual')) : '') + '</td><td class="num">' + esc(a.dist === '' ? '—' : fmtDist(a.dist)) + '</td><td class="muted">' + esc(UB.siteName(a.siteId)) + '</td><td>' + chip + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">' + esc(t('no_attendance_today')) + '</div>') + '</section>';

    C.bind(view, {
      refresh: b => C.busy(b, () => UB.refresh()),
      goForeman: el => UB.go('#/workers?f=' + el.dataset.id),
      ok: el => decide(el.dataset.type, el.dataset.id, true, el),
      no: el => decide(el.dataset.type, el.dataset.id, false, el)
    });

    const fill = (fund, adv, costByForeman) => {
      const el = view.querySelector('#kpi-fund'); if (el) el.textContent = C.money(fund);
      const sub = view.querySelector('#kpi-fund-sub'); if (sub) sub.textContent = t('adv_deducted', { v: C.money(adv) });
      view.querySelectorAll('[data-cost]').forEach(td => { td.textContent = C.num(costByForeman[td.dataset.cost] || 0); });
    };
    // Ayın xülasəsi bootstrap-la birlikdə gəlir (v0.2+). Köhnə server üçün ayrıca sorğu.
    if (d.summary && d.summary.month === d.month) fill(d.summary.fund, d.summary.advances, d.summary.costByForeman || {});
    else API.call('report', { month: d.month }).then(r => {
      fill(r.lines.reduce((s, l) => s + C.n(l.S) + C.n(l.bonus), 0), r.lines.reduce((s, l) => s + C.n(l.advance), 0), r.costByForeman || {});
    }).catch(() => { const el = view.querySelector('#kpi-fund'); if (el) el.textContent = '—'; });
  };

  function fmtDist(m) { m = C.n(m); return m >= 1000 ? C.num(m / 1000, 1).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
  UB.fmtDist = fmtDist;

  // =========================================================== foremen
  S.foremen = function (view) {
    const d = UB.data;
    const list = d.foremen.slice().sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('nav_foremen')) + '</h1><div class="sub">' + esc(t('foremen_limit', { n: list.filter(f => f.status === 'active').length, max: d.settings.maxForemen })) + '</div></div>' +
      '<button type="button" class="btn primary" data-act="add">' + icon('plus', 16) + esc(t('new_foreman')) + '</button></div>' +
      '<section class="card">' + (list.length ? '<div class="table-wrap"><table class="t" style="min-width:600px"><thead><tr><th>' + esc(t('name')) + '</th><th>' + esc(t('phone')) + '</th><th class="num">' + esc(t('workers_short')) + '</th><th class="num">' + esc(t('sites_short')) + '</th><th>' + esc(t('pay')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
        list.map(f => '<tr class="click" data-act="edit" data-id="' + esc(f.id) + '"><td><b>' + esc(f.name) + '</b></td><td class="mono">' + esc(f.phone) + '</td><td class="num">' + d.workers.filter(w => w.foremanId === f.id && w.status === 'active').length + '</td><td class="num">' + d.sites.filter(s => s.foremanId === f.id && s.status === 'APPROVED').length + '</td><td class="small">' + esc(payLabel(f)) + (C.n(f.baseAmount) ? ' · ' + C.money(f.baseAmount) : '') + (C.n(f.bonusPercent) ? ' · ' + C.num(f.bonusPercent) + '%' : '') + '</td><td>' + (f.status === 'active' ? '<span class="chip ok">' + esc(t('active')) + '</span>' : '<span class="chip">' + esc(t('inactive')) + '</span>') + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty">' + esc(t('no_foremen')) + '</div>') + '</section>';
    C.bind(view, { add: () => F.foreman(), edit: el => F.foreman(UB.idx.foremen[el.dataset.id]) });
  };

  F.foreman = function (f) {
    f = f || { payType: 'MONTH', payModel: 'STD', lang: 'az', status: 'active' };
    const d = C.dialog({
      title: f.id ? t('edit_foreman') : t('new_foreman'),
      body: '<form class="form" id="ff"><div class="grid2">' +
        fld(t('name'), inp('name', f.name, 'text', 'required')) + fld(t('phone'), inp('phone', f.phone, 'tel', 'required inputmode="tel"')) +
        fld(f.id ? t('new_pin_opt') : t('pin'), inp('pin', '', 'password', 'inputmode="numeric" pattern="\\d{4,8}" ' + (f.id ? '' : 'required'))) +
        fld(t('language'), sel('lang', f.lang, [['az', 'Azərbaycan'], ['ru', 'Русский'], ['en', 'English']])) + '</div>' +
        '<fieldset><legend>' + esc(t('pay')) + '</legend><div class="grid2">' +
        fld(t('pay_type'), sel('payType', f.payType, [['MONTH', t('pt_MONTH')], ['DAY', t('pt_DAY')]])) +
        fld(t('pay_model'), sel('payModel', f.payModel, MODELS.map(m => [m, t('pm_' + m)]))) +
        fld(t('base_amount'), inp('baseAmount', f.baseAmount, 'number', 'min="0" step="0.01"')) +
        fld(t('foreman_bonus_pct'), inp('bonusPercent', f.bonusPercent, 'number', 'min="0" max="100" step="0.1"'), t('foreman_bonus_hint')) +
        '</div></fieldset>' + fld(t('status'), sel('status', f.status, [['active', t('active')], ['inactive', t('inactive')]])) + '</form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    d.querySelector('[data-save]').addEventListener('click', async e => {
      const form = d.querySelector('#ff'); if (!form.reportValidity()) return;
      const data = Object.assign({ id: f.id }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('saveForeman', { foreman: data })).then(() => { d.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    });
  };

  // =========================================================== workers
  S.workers = function (view, route) {
    const d = UB.data;
    const fId = route.q.f || '';
    const q = (route.q.q || '').toLowerCase();
    let list = d.workers.filter(w => w.status !== 'deleted');
    if (fId) list = list.filter(w => w.foremanId === fId);
    if (q) list = list.filter(w => (w.name + ' ' + w.phone + ' ' + w.specialty).toLowerCase().indexOf(q) >= 0);
    list.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
    const month = d.month;
    const advOf = id => d.advances.filter(a => a.workerId === id && ['APPROVED', 'GIVEN', 'SIGNED'].indexOf(a.status) >= 0 && String(a.approvedAt).slice(0, 7) === month).reduce((s, a) => s + C.n(a.amount), 0);
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('nav_workers')) + '</h1><div class="sub">' + esc(t('n_workers', { n: list.filter(w => w.status === 'active').length })) + '</div></div>' +
      '<button type="button" class="btn primary" data-act="add">' + icon('plus', 16) + esc(t('new_worker')) + '</button></div>' +
      '<div class="row"><select class="inp" id="f-foreman" style="max-width:240px" aria-label="' + esc(t('foreman')) + '">' + C.options(d.foremen, fId, 'id', null, t('all_foremen')) + '</select>' +
      '<input class="inp grow" id="f-q" type="search" placeholder="' + esc(t('search')) + '" value="' + esc(route.q.q || '') + '" style="max-width:320px"></div>' +
      '<section class="card">' + (list.length ? '<div class="table-wrap"><table class="t" style="min-width:760px"><thead><tr><th>' + esc(t('name')) + '</th><th>' + esc(t('foreman')) + '</th><th>' + esc(t('specialty')) + '</th><th>' + esc(t('pay')) + '</th><th>' + esc(t('today')) + '</th><th class="num">' + esc(t('month_adv')) + '</th></tr></thead><tbody>' +
        list.map(w => '<tr class="click" data-act="edit" data-id="' + esc(w.id) + '"><td><b>' + esc(w.name) + '</b><div class="tiny muted mono">' + esc(w.phone) + '</div></td><td>' + esc(C.shortName(UB.foremanName(w.foremanId))) + '</td><td class="small">' + esc(w.specialty || '—') + ' · ' + esc(t('g_' + (w.grade || 'master'))) + '</td><td class="small">' + esc(payLabel(w)) + '<div class="tiny muted mono">' + C.money(w.baseAmount) + (w.payType === 'DAY' ? '/' + esc(t('day')) : '') + '</div></td><td>' + (w.status === 'active' ? UB.statusChip(UB.todayStatus(w.id)) : '<span class="chip">' + esc(t('inactive')) + '</span>') + '</td><td class="num">' + C.num(advOf(w.id)) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty">' + esc(t('no_workers')) + '</div>') + '</section>';
    const upd = () => {
      const f = view.querySelector('#f-foreman').value, s = view.querySelector('#f-q').value.trim();
      const parts = []; if (f) parts.push('f=' + encodeURIComponent(f)); if (s) parts.push('q=' + encodeURIComponent(s));
      history.replaceState(null, '', '#/workers' + (parts.length ? '?' + parts.join('&') : ''));
      S.workers(view, { q: { f, q: s } });
      const qi = view.querySelector('#f-q'); qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length);
    };
    view.querySelector('#f-foreman').addEventListener('change', upd);
    let timer; view.querySelector('#f-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(upd, 300); });
    C.bind(view, { add: () => F.worker({ foremanId: fId }), edit: el => F.worker(UB.idx.workers[el.dataset.id]) });
  };

  F.worker = function (w) {
    const d = UB.data;
    w = Object.assign({ payType: 'MONTH', payModel: 'STD', bonusBase: 'ALL', grade: 'master', lang: 'az', status: 'active', startTime: '09:00', endTime: '18:00' }, w || {});
    const specs = Array.from(new Set(d.workers.map(x => x.specialty).filter(Boolean).concat(t('spec_list').split(','))));
    const dlg = C.dialog({
      title: w.id ? w.name : t('new_worker'),
      body: '<form class="form" id="wf"><div class="grid2">' +
        fld(t('name'), inp('name', w.name, 'text', 'required')) + fld(t('phone_wa'), inp('phone', w.phone, 'tel', 'required inputmode="tel"'), t('phone_hint')) +
        fld(t('foreman'), '<select name="foremanId" required>' + C.options(d.foremen.filter(f => f.status === 'active' || f.id === w.foremanId), w.foremanId, 'id', null, '—') + '</select>') +
        fld(t('language'), sel('lang', w.lang, [['az', 'Azərbaycan'], ['ru', 'Русский'], ['en', 'English']])) +
        fld(t('specialty'), inp('specialty', w.specialty, 'text', 'list="spec-list"') + '<datalist id="spec-list">' + specs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist>') +
        fld(t('grade'), sel('grade', w.grade, GRADES.map(g => [g, t('g_' + g)]))) +
        fld(t('start_time'), inp('startTime', w.startTime, 'time')) + fld(t('end_time'), inp('endTime', w.endTime, 'time')) + '</div>' +
        '<fieldset><legend>' + esc(t('pay')) + '</legend><div class="grid2">' +
        fld(t('pay_type'), sel('payType', w.payType, [['MONTH', t('pt_MONTH')], ['DAY', t('pt_DAY')]])) +
        fld(t('base_amount'), inp('baseAmount', w.baseAmount, 'number', 'min="0" step="0.01"'), t('base_hint')) +
        fld(t('pay_model'), sel('payModel', w.payModel, MODELS.map(m => [m, t('pm_' + m)]))) +
        fld(t('bonus_base'), sel('bonusBase', w.bonusBase, [['ALL', t('bb_ALL')], ['OVER_NORM', t('bb_OVER_NORM')]])) +
        fld(t('norm'), inp('norm', w.norm, 'number', 'min="0" step="0.01"'), t('norm_hint')) +
        '</div></fieldset>' + fld(t('status'), sel('status', w.status, [['active', t('active')], ['inactive', t('inactive')]])) + '</form>',
      foot: (w.id ? '<button type="button" class="btn" data-ded>' + esc(t('add_deduction')) + '</button><span class="grow"></span>' : '') +
        '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    const form = dlg.querySelector('#wf');
    const sync = () => {
      const m = form.payModel.value;
      form.baseAmount.closest('.field').style.display = m === 'BONUS' ? 'none' : '';
      form.bonusBase.closest('.field').style.display = m === 'STD_BONUS' ? '' : 'none';
      form.norm.closest('.field').style.display = m === 'STD_BONUS' && form.bonusBase.value === 'OVER_NORM' ? '' : 'none';
    };
    form.addEventListener('change', sync); sync();
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      const data = Object.assign({ id: w.id }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('saveWorker', { worker: data })).then(() => { dlg.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    });
    const ded = dlg.querySelector('[data-ded]');
    if (ded) ded.addEventListener('click', () => { dlg.close(); F.deduction(w.id); });
  };

  F.deduction = function (workerId) {
    const dlg = C.dialog({
      title: t('add_deduction') + ' · ' + UB.workerName(workerId),
      body: '<form class="form" id="df"><div class="grid2">' +
        fld(t('type'), sel('type', 'PENALTY', [['PENALTY', t('ded_PENALTY')], ['CORRECTION', t('ded_CORRECTION')], ['OTHER', t('ded_OTHER')]])) +
        fld(t('amount'), inp('amount', '', 'number', 'step="0.01" required'), t('ded_hint')) +
        fld(t('date'), inp('date', C.todayISO(), 'date', 'required')) + '</div>' +
        fld(t('reason'), '<textarea name="reason" required></textarea>') + '</form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      const form = dlg.querySelector('#df'); if (!form.reportValidity()) return;
      const data = Object.assign({ workerId }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('addDeduction', { deduction: data })).then(() => { dlg.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    });
  };

  // =========================================================== sites & customers
  S.sites = function (view, route) {
    const d = UB.data, tab = route.q.tab || 'sites';
    const sites = d.sites.slice().sort((a, b) => (a.status === 'PENDING' ? -1 : b.status === 'PENDING' ? 1 : a.name.localeCompare(b.name)));
    const stChip = s => '<span class="chip ' + ({ APPROVED: 'ok', PENDING: 'warn', REJECTED: 'bad' }[s.status] || '') + '">' + esc(t('site_' + s.status)) + '</span>';
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_sites')) + '</h1><div class="row">' +
      '<button type="button" class="btn" data-act="addCust">' + icon('plus', 16) + esc(t('new_customer')) + '</button>' +
      '<button type="button" class="btn primary" data-act="addSite">' + icon('plus', 16) + esc(t('new_site')) + '</button></div></div>' +
      '<div class="tabs" role="tablist"><button role="tab" data-act="tab" data-tab="sites" aria-selected="' + (tab === 'sites') + '">' + esc(t('sites')) + ' (' + sites.length + ')</button><button role="tab" data-act="tab" data-tab="customers" aria-selected="' + (tab === 'customers') + '">' + esc(t('customers')) + ' (' + d.customers.length + ')</button></div>' +
      '<section class="card">' + (tab === 'sites'
        ? (sites.length ? '<div class="table-wrap"><table class="t" style="min-width:700px"><thead><tr><th>' + esc(t('site')) + '</th><th>' + esc(t('customer')) + '</th><th>' + esc(t('foreman')) + '</th><th class="num">' + esc(t('radius')) + '</th><th class="num">' + esc(t('contract')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
          sites.map(s => '<tr class="click" data-act="site" data-id="' + esc(s.id) + '"><td><b>' + esc(s.name) + '</b><div class="tiny muted">' + esc(s.address) + '</div></td><td>' + esc((UB.idx.customers[s.customerId] || {}).name || '—') + '</td><td>' + esc(C.shortName(UB.foremanName(s.foremanId))) + '</td><td class="num">' + esc(s.radius) + ' m</td><td class="num">' + (C.n(s.contractAmount) ? C.num(s.contractAmount) : '—') + '</td><td>' + stChip(s) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + esc(t('no_sites')) + '</div>')
        : (d.customers.length ? '<div class="list">' + d.customers.map(c => '<div class="list-row click" data-act="cust" data-id="' + esc(c.id) + '"><div class="grow"><div class="title">' + esc(c.name) + '</div><div class="meta mono">' + esc(c.phone || '') + '</div></div><span class="chip">' + esc(t('n_sites', { n: d.sites.filter(s => s.customerId === c.id).length })) + '</span></div>').join('') + '</div>' : '<div class="empty">' + esc(t('no_customers')) + '</div>')) +
      '</section>';
    C.bind(view, {
      tab: el => UB.go('#/sites?tab=' + el.dataset.tab),
      addSite: () => F.site(),
      addCust: () => F.customer(),
      site: el => F.siteDetail(UB.idx.sites[el.dataset.id]),
      cust: el => F.customer(UB.idx.customers[el.dataset.id])
    });
  };

  F.customer = function (c, onSaved) {
    c = c || { type: 'person' };
    const dlg = C.dialog({
      title: c.id ? c.name : t('new_customer'),
      body: '<form class="form" id="cf">' + fld(t('name'), inp('name', c.name, 'text', 'required')) + '<div class="grid2">' + fld(t('phone'), inp('phone', c.phone, 'tel', 'inputmode="tel"')) +
        fld(t('type'), sel('type', c.type, [['person', t('cust_person')], ['company', t('cust_company')]])) + '</div></form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      const form = dlg.querySelector('#cf'); if (!form.reportValidity()) return;
      const data = Object.assign({ id: c.id }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('saveCustomer', { customer: data })).then(async r => { dlg.close(); C.toast(t('saved')); await UB.refresh(true); if (onSaved) onSaved(r); }).catch(() => {});
    });
  };

  F.site = function (s, presetCustomer) {
    const d = UB.data, admin = UB.isAdmin();
    s = Object.assign({ radius: d.settings.defaultRadius, customerId: presetCustomer || '' }, s || {});
    const dlg = C.dialog({
      title: s.id ? s.name : t('new_site'),
      body: '<form class="form" id="sf">' +
        '<div class="row" style="align-items:flex-end;flex-wrap:nowrap">' + '<div class="grow">' + fld(t('customer'), '<select name="customerId" required>' + C.options(d.customers, s.customerId, 'id', null, '—') + '</select>') + '</div><button type="button" class="btn icon" data-newcust aria-label="' + esc(t('new_customer')) + '">' + icon('plus') + '</button></div>' +
        fld(t('site_name'), inp('name', s.name, 'text', 'required placeholder="' + esc(t('site_name_ph')) + '"')) +
        fld(t('address'), inp('address', s.address)) +
        '<fieldset><legend>' + esc(t('coords')) + '</legend><div class="grid2">' + fld(t('lat'), inp('lat', s.lat, 'number', 'step="any" required')) + fld(t('lng'), inp('lng', s.lng, 'number', 'step="any" required')) + '</div>' +
        '<div class="row"><button type="button" class="btn" data-gps>' + icon('pin', 16) + esc(t('use_my_location')) + '</button><a class="btn ghost" data-map target="_blank" rel="noopener" href="#">' + icon('map', 16) + esc(t('check_on_map')) + '</a></div>' +
        '<span class="hint small muted">' + esc(t('coords_hint')) + '</span>' +
        fld(t('radius_label'), inp('radius', s.radius, 'number', 'min="50" max="500" step="10" required')) + '</fieldset>' +
        (admin ? '<div class="grid2">' + fld(t('foreman'), '<select name="foremanId">' + C.options(d.foremen, s.foremanId, 'id', null, '—') + '</select>') +
          fld(t('status'), sel('status', s.status || 'APPROVED', ['APPROVED', 'PENDING', 'CLOSED'].map(x => [x, t('site_' + x)]))) + '</div>' +
          '<fieldset><legend>' + esc(t('contract')) + '</legend><div class="grid2">' + fld(t('contract_no'), inp('contractNo', s.contractNo)) + fld(t('date'), inp('contractDate', s.contractDate, 'date')) + fld(t('amount'), inp('contractAmount', s.contractAmount, 'number', 'min="0" step="0.01"')) + '</div></fieldset>'
          : '<div class="notice">' + esc(t('site_needs_approval')) + '</div>') +
        '</form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    const form = dlg.querySelector('#sf');
    const mapLink = dlg.querySelector('[data-map]');
    const syncMap = () => { const la = form.lat.value, lo = form.lng.value; mapLink.href = la && lo ? 'https://www.google.com/maps?q=' + la + ',' + lo : '#'; };
    form.addEventListener('input', syncMap); syncMap();
    dlg.querySelector('[data-gps]').addEventListener('click', e => C.busy(e.currentTarget, async () => {
      const p = await C.getPosition(); form.lat.value = p.lat; form.lng.value = p.lng; syncMap();
      C.toast(t('gps_ok', { acc: p.acc }));
    }).catch(() => {}));
    dlg.querySelector('[data-newcust]').addEventListener('click', () => F.customer(null, r => {
      const opt = document.createElement('option'); opt.value = r.id; opt.textContent = r.name; opt.selected = true; form.customerId.appendChild(opt);
    }));
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      const data = Object.assign({ id: s.id }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('saveSite', { site: data })).then(() => { dlg.close(); C.toast(t(admin ? 'saved' : 'site_sent')); UB.refresh(); }).catch(() => {});
    });
  };

  F.siteDetail = function (s) {
    const d = UB.data;
    const cust = UB.idx.customers[s.customerId] || {};
    const est = d.estimates.filter(e => e.siteId === s.id);
    const pays = d.payments.filter(p => p.siteId === s.id);
    const estSum = est.reduce((a, e) => a + C.n(e.planQty) * C.n(e.clientPrice), 0);
    // Görülən iş: bütün təsdiqlənmiş qeydlər (serverdə hesablanır; telefona yalnız son 14 gün gəlir).
    const done = d.summary && d.summary.siteDone ? C.n(d.summary.siteDone[s.id]) : d.entries.filter(e => e.siteId === s.id && e.status === 'APPROVED').reduce((a, e) => { const x = est.find(z => z.workTypeId === e.workTypeId); return a + C.n(e.qty) * C.n(x && x.clientPrice); }, 0);
    const paid = pays.reduce((a, p) => a + C.n(p.amount), 0);
    const base = C.n(s.contractAmount) || estSum;
    const dlg = C.dialog({
      title: s.name,
      body: '<div class="kv"><span>' + esc(t('customer')) + '</span><span>' + esc(cust.name || '—') + (cust.phone ? ' · <span class="mono">' + esc(cust.phone) + '</span>' : '') + '</span>' +
        '<span>' + esc(t('address')) + '</span><span>' + esc(s.address || '—') + '</span>' +
        '<span>' + esc(t('coords')) + '</span><span><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + esc(s.lat) + ',' + esc(s.lng) + '">' + esc(s.lat + ', ' + s.lng) + '</a> · ' + esc(t('radius_m', { m: s.radius })) + '</span>' +
        '<span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(s.foremanId)) + '</span>' +
        '<span>' + esc(t('status')) + '</span><span>' + esc(t('site_' + s.status)) + '</span>' +
        (s.contractNo ? '<span>' + esc(t('contract')) + '</span><span>№ ' + esc(s.contractNo) + ' · ' + esc(C.fmtDate(s.contractDate, true)) + ' · ' + C.money(s.contractAmount) + '</span>' : '') + '</div>' +
        '<div class="kpis"><div class="kpi"><div class="label">' + esc(s.contractAmount ? t('contract') : t('estimate_total')) + '</div><div class="value" style="font-size:20px">' + C.money(base) + '</div></div>' +
        '<div class="kpi"><div class="label">' + esc(t('work_done_value')) + '</div><div class="value" style="font-size:20px">' + C.money(done) + '</div></div>' +
        '<div class="kpi"><div class="label">' + esc(t('paid_by_customer')) + '</div><div class="value" style="font-size:20px">' + C.money(paid) + '</div></div>' +
        '<div class="kpi"><div class="label">' + esc(t('balance')) + '</div><div class="value" style="font-size:20px;color:' + (base - paid > 0 ? 'var(--warn)' : 'var(--ok)') + '">' + C.money(base - paid) + '</div></div></div>' +
        '<h3>' + esc(t('estimate')) + '</h3>' +
        (est.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('work_type')) + '</th><th class="num">' + esc(t('plan_qty')) + '</th><th class="num">' + esc(t('client_price')) + '</th><th class="num">' + esc(t('sum')) + '</th></tr></thead><tbody>' +
          est.map(e => '<tr><td>' + esc(UB.wtName(e.workTypeId)) + '</td><td class="num">' + C.num(e.planQty) + ' ' + esc(UB.wtUnit(e.workTypeId)) + '</td><td class="num">' + C.num(e.clientPrice) + '</td><td class="num">' + C.num(C.n(e.planQty) * C.n(e.clientPrice)) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="small muted">' + esc(t('no_estimate')) + '</div>') +
        '<form class="row" id="estf" style="align-items:flex-end"><div class="grow" style="min-width:160px">' + fld(t('work_type'), '<select name="workTypeId" required>' + C.options(d.workTypes, '', 'id', x => x.name + ' (' + x.unit + ')', '—') + '</select>') + '</div>' +
        '<div style="width:110px">' + fld(t('plan_qty'), inp('planQty', '', 'number', 'min="0" step="0.01"')) + '</div><div style="width:110px">' + fld(t('client_price'), inp('clientPrice', '', 'number', 'min="0" step="0.01" required')) + '</div>' +
        '<button type="submit" class="btn">' + icon('plus', 16) + esc(t('add')) + '</button></form>' +
        '<h3>' + esc(t('customer_payments')) + '</h3>' +
        (pays.length ? '<div class="list">' + pays.map(p => '<div class="list-row"><span class="mono muted">' + esc(C.fmtDate(p.date, true)) + '</span><span class="grow">' + esc(p.note || '') + '</span><b class="mono">' + C.money(p.amount) + '</b></div>').join('') + '</div>' : '') +
        '<form class="row" id="payf" style="align-items:flex-end"><div style="width:150px">' + fld(t('date'), inp('date', C.todayISO(), 'date', 'required')) + '</div><div style="width:120px">' + fld(t('amount'), inp('amount', '', 'number', 'min="0.01" step="0.01" required')) + '</div><div class="grow" style="min-width:140px">' + fld(t('note'), inp('note', '')) + '</div><button type="submit" class="btn">' + icon('plus', 16) + esc(t('add')) + '</button></form>',
      foot: (s.status === 'PENDING' ? '<button type="button" class="btn danger" data-rej>' + esc(t('reject')) + '</button><button type="button" class="btn ok" data-appr>' + esc(t('approve')) + '</button>' : '') +
        '<span class="grow"></span><button type="button" class="btn" data-edit>' + icon('edit', 16) + esc(t('edit')) + '</button>'
    });
    dlg.querySelector('#estf').addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(e.target);
      await C.busy(e.target.querySelector('button'), () => API.call('saveEstimate', { estimate: Object.assign({ siteId: s.id }, f) })).then(async () => { dlg.close(); await UB.refresh(true); F.siteDetail(UB.idx.sites[s.id]); }).catch(() => {});
    });
    dlg.querySelector('#payf').addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(e.target);
      await C.busy(e.target.querySelector('button'), () => API.call('addPayment', { payment: Object.assign({ siteId: s.id }, f) })).then(async () => { dlg.close(); await UB.refresh(true); F.siteDetail(UB.idx.sites[s.id]); }).catch(() => {});
    });
    dlg.querySelector('[data-edit]').addEventListener('click', () => { dlg.close(); F.site(s); });
    const ap = dlg.querySelector('[data-appr]'); if (ap) ap.addEventListener('click', e => { dlg.close(); decide('site', s.id, true, e.currentTarget); });
    const rj = dlg.querySelector('[data-rej]'); if (rj) rj.addEventListener('click', e => { dlg.close(); decide('site', s.id, false, e.currentTarget); });
  };

  // =========================================================== approvals
  S.approvals = function (view, route) {
    const d = UB.data, cnt = UB.counts();
    const tab = route.q.tab || (cnt.work ? 'work' : cnt.adv ? 'adv' : cnt.att ? 'att' : cnt.sites ? 'site' : 'work');
    const tabs = [['work', t('tab_work'), cnt.work], ['adv', t('tab_adv'), cnt.adv], ['att', t('tab_att'), cnt.att], ['site', t('tab_site'), cnt.sites]];
    let body = '';
    const btns = (type, id) => '<div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="no" data-type="' + type + '" data-id="' + esc(id) + '">' + icon(type === 'work' || type === 'site' ? 'undo' : 'x', 16) + esc(t(type === 'work' ? 'return' : 'reject')) + '</button><button type="button" class="btn ok" data-act="ok" data-type="' + type + '" data-id="' + esc(id) + '">' + icon('check', 16) + esc(t('approve')) + '</button></div>';
    if (tab === 'work') {
      const list = d.entries.filter(e => e.status === 'ADMIN_PENDING').sort((a, b) => a.date.localeCompare(b.date));
      const waiting = d.entries.filter(e => e.status === 'USTA_PENDING');
      body = list.map(e => {
        const shares = d.shares.filter(s => s.entryId === e.id);
        const photos = String(e.photos || '').split(' ').filter(Boolean);
        return '<section class="card"><div class="card-head"><div><span class="tag accent">' + esc(t('tag_work')) + '</span> <b style="margin-left:8px">' + esc(UB.wtName(e.workTypeId)) + ' · ' + C.num(e.qty) + ' ' + esc(UB.wtUnit(e.workTypeId)) + '</b></div><span class="small muted">' + esc(C.fmtDate(e.date, true)) + '</span></div>' +
          '<div class="kv"><span>' + esc(t('site')) + '</span><span>' + esc(UB.siteName(e.siteId)) + '</span><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(e.foremanId)) + '</span>' + (e.note ? '<span>' + esc(t('note')) + '</span><span>' + esc(e.note) + '</span>' : '') + '</div>' +
          '<div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('worker')) + '</th><th class="num">' + esc(t('share')) + '</th><th class="num">' + esc(t('qty')) + '</th><th class="num">' + esc(t('bonus')) + '</th><th>' + esc(t('worker_confirm')) + '</th></tr></thead><tbody>' +
          shares.map(s => '<tr><td>' + esc(UB.workerName(s.workerId)) + '</td><td class="num">' + C.num(s.share) + '%</td><td class="num">' + C.num(C.n(e.qty) * C.n(s.share) / 100) + '</td><td class="num">' + C.num(UB.shareAmount(e, s, UB.idx.workers[s.workerId])) + '</td><td>' + (s.confirmedAt ? '<span class="chip ok">✓ ' + esc(C.fmtTime(s.confirmedAt)) + '</span>' : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
          (photos.length ? '<div class="row">' + photos.map((p, i) => '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p) + '">' + icon('camera', 14) + esc(t('photo')) + ' ' + (i + 1) + '</a>').join('') + '</div>' : '') +
          btns('work', e.id) + '</section>';
      }).join('') || '<div class="card"><div class="empty">' + esc(t('nothing_pending')) + '</div></div>';
      if (waiting.length) body += '<section class="card"><h2>' + esc(t('waiting_workers')) + '</h2><div class="list">' + waiting.map(e => '<div class="list-row"><div class="grow"><div class="title">' + esc(UB.wtName(e.workTypeId)) + ' · ' + C.num(e.qty) + ' ' + esc(UB.wtUnit(e.workTypeId)) + '</div><div class="meta">' + esc(sharesText(e) + ' · ' + UB.siteName(e.siteId) + ' · ' + C.fmtDate(e.date)) + '</div></div><button type="button" class="btn sm" data-act="force" data-id="' + esc(e.id) + '">' + esc(t('approve_direct')) + '</button></div>').join('') + '</div></section>';
    }
    if (tab === 'adv') {
      const list = d.advances.filter(a => a.status === 'PENDING');
      body = list.map(a => {
        const w = UB.idx.workers[a.workerId] || {};
        const monthUsed = d.advances.filter(x => x.workerId === a.workerId && x.id !== a.id && ['APPROVED', 'GIVEN', 'SIGNED'].indexOf(x.status) >= 0 && String(x.approvedAt).slice(0, 7) === d.month).reduce((s, x) => s + C.n(x.amount), 0);
        return '<section class="card"><div class="card-head"><div><span class="tag warn">' + esc(t('tag_adv')) + '</span> <b style="margin-left:8px">' + C.money(a.amount) + ' · ' + esc(w.name || '') + '</b></div>' + (a.overLimit === 'yes' ? '<span class="chip warn">' + esc(t('over_limit')) + '</span>' : '<span class="chip ok">' + esc(t('within_limit')) + '</span>') + '</div>' +
          '<div class="kv"><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(a.foremanId)) + '</span><span>' + esc(t('reason')) + '</span><span>' + esc(a.reason || '—') + '</span><span>' + esc(t('month_adv')) + '</span><span class="mono">' + C.money(monthUsed) + '</span><span>' + esc(t('pay')) + '</span><span>' + esc(payLabel(w)) + ' · ' + C.money(w.baseAmount) + '</span></div>' +
          btns('adv', a.id) + '</section>';
      }).join('') || '<div class="card"><div class="empty">' + esc(t('nothing_pending')) + '</div></div>';
    }
    if (tab === 'att') {
      const list = d.attendance.filter(a => a.status === 'PENDING');
      body = list.map(a => '<section class="card"><div class="card-head"><b>' + esc(t(a.kind === 'IN' ? 'kind_in' : 'kind_out')) + ' · ' + esc(UB.workerName(a.workerId)) + '</b><span class="mono muted">' + esc(C.fmtDate(a.date) + ' ' + C.fmtTime(a.ts)) + '</span></div>' +
        '<div class="kv"><span>' + esc(t('site')) + '</span><span>' + esc(UB.siteName(a.siteId)) + '</span><span>' + esc(t('reason')) + '</span><span>' + esc(a.reason) + '</span><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName((UB.idx.workers[a.workerId] || {}).foremanId)) + '</span></div>' + btns('att', a.id) + '</section>').join('') || '<div class="card"><div class="empty">' + esc(t('nothing_pending')) + '</div></div>';
    }
    if (tab === 'site') {
      const list = d.sites.filter(s => s.status === 'PENDING');
      body = list.map(s => '<section class="card"><div class="card-head"><b>' + esc(s.name) + '</b><span class="chip warn">' + esc(t('site_PENDING')) + '</span></div>' +
        '<div class="kv"><span>' + esc(t('customer')) + '</span><span>' + esc((UB.idx.customers[s.customerId] || {}).name || '—') + '</span><span>' + esc(t('address')) + '</span><span>' + esc(s.address || '—') + '</span><span>' + esc(t('coords')) + '</span><span><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + esc(s.lat) + ',' + esc(s.lng) + '">' + esc(t('check_on_map')) + '</a> · ' + esc(t('radius_m', { m: s.radius })) + '</span><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(s.foremanId)) + '</span></div>' +
        btns('site', s.id) + '</section>').join('') || '<div class="card"><div class="empty">' + esc(t('nothing_pending')) + '</div></div>';
    }
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_approvals')) + '</h1></div>' +
      '<div class="tabs" role="tablist">' + tabs.map(x => '<button role="tab" data-act="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + esc(x[1]) + (x[2] ? ' <span class="badge">' + x[2] + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="stack">' + body + '</div>';
    C.bind(view, {
      tab: el => UB.go('#/approvals?tab=' + el.dataset.tab),
      ok: el => decide(el.dataset.type, el.dataset.id, true, el),
      no: el => decide(el.dataset.type, el.dataset.id, false, el),
      force: async el => {
        if (!await C.confirmDlg(t('approve_direct_q'), t('approve'))) return;
        await C.busy(el, () => API.call('approveWork', { id: el.dataset.id, ok: true, force: true })).then(() => { C.toast(t('approved')); UB.refresh(); }).catch(() => {});
      }
    });
  };

  // =========================================================== payroll
  S.payroll = async function (view, route) {
    const month = route.q.m || UB.data.month;
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_payroll')) + '</h1>' + monthNav(month, 'month') + '</div><div class="loading"><i></i>' + esc(t('calculating')) + '</div>';
    C.bind(view, { month: el => UB.go('#/payroll?m=' + C.shiftMonth(month, Number(el.dataset.k))) });
    let r;
    try { r = await API.call('calcPayroll', { month }); }
    catch (e) { view.querySelector('.loading').outerHTML = '<div class="card"><div class="empty">' + esc(C.errorText(e)) + '</div></div>'; return; }
    if (location.hash.indexOf('#/payroll') !== 0) return;
    const closed = r.closed;
    const plan = r.planDays || UB.planDays(month);
    const lines = r.lines.slice().sort((a, b) => (a.personType === b.personType ? a.name.localeCompare(b.name) : a.personType === 'FOREMAN' ? 1 : -1));
    const sum = k => lines.reduce((s, l) => s + (k === 'B' && l.personType === 'FOREMAN' ? 0 : C.n(l[k])), 0);
    const paidN = lines.filter(l => l.paid === 'yes').length;
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('nav_payroll')) + '</h1><div class="sub">' + esc(closed ? t('closed') : t('not_closed_hint')) + '</div></div>' + monthNav(month, 'month') + '</div>' +
      '<div class="cols"><section class="card col-1"><h2>' + esc(t('plan_days')) + '</h2><form class="row" id="pdf" style="flex-wrap:nowrap"><input class="inp" name="days" type="number" min="1" max="31" value="' + esc(plan || '') + '" ' + (closed ? 'disabled' : 'required') + ' style="width:100px" aria-label="' + esc(t('plan_days')) + '"><button class="btn" type="submit" ' + (closed ? 'disabled' : '') + '>' + esc(t('save')) + '</button></form><div class="small muted">' + esc(t('plan_days_hint')) + '</div></section>' +
      '<div class="kpis col-3"><div class="kpi"><div class="label">' + esc(t('col_total')) + '</div><div class="value">' + C.money(sum('total')) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('col_bonus')) + '</div><div class="value">' + C.money(sum('bonus')) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('col_adv')) + '</div><div class="value">' + C.money(sum('advance')) + '</div></div>' +
      (closed ? '<div class="kpi"><div class="label">' + esc(t('paid')) + '</div><div class="value">' + paidN + '<small> / ' + lines.length + '</small></div></div>' : '') + '</div></div>' +
      '<div class="row"><a class="btn" href="#/print/payroll/' + month + '">' + icon('print', 16) + esc(t('print')) + '</a><a class="btn" href="#/print/advances/' + month + '">' + icon('print', 16) + esc(t('print_adv')) + '</a><button type="button" class="btn" data-act="csv">' + icon('download', 16) + 'CSV</button><span class="grow"></span>' +
      (closed ? '' : '<button type="button" class="btn primary" data-act="close" ' + (plan ? '' : 'disabled title="' + esc(t('err_no_plan_days')) + '"') + '>' + esc(t('close_month')) + '</button>') + '</div>' +
      '<section class="card"><div class="table-wrap"><table class="t" style="min-width:980px"><thead><tr><th>' + esc(t('name')) + '</th><th>' + esc(t('pay')) + '</th><th class="num">' + esc(t('days')) + '</th><th class="num">' + esc(t('col_std')) + '</th><th class="num">B</th><th class="num">' + esc(t('col_bonus')) + '</th><th class="num">' + esc(t('col_adv')) + '</th><th class="num">' + esc(t('col_pen')) + '</th><th class="num">' + esc(t('col_corr')) + '</th><th class="num">' + esc(t('col_total')) + '</th><th>' + esc(closed ? t('paid') : t('notes')) + '</th></tr></thead><tbody>' +
      lines.map(l => '<tr class="click" data-act="line" data-id="' + esc(l.personId) + '"><td><b>' + esc(l.name) + '</b>' + (l.personType === 'FOREMAN' ? ' <span class="chip">' + esc(t('foreman')) + '</span>' : '') + '</td><td class="small">' + esc(payLabel(l)) + '</td><td class="num">' + (l.personType === 'FOREMAN' ? '—' : esc(l.daysWorked) + (l.payType === 'MONTH' ? '/' + esc(l.planDays || '?') : '')) + '</td><td class="num">' + C.num(l.S) + '</td><td class="num muted">' + C.num(l.B) + '</td><td class="num">' + C.num(l.bonus) + '</td><td class="num">' + C.num(l.advance) + '</td><td class="num">' + C.num(l.penalty) + '</td><td class="num">' + C.num(l.correction) + '</td><td class="num"><b>' + C.num(l.total) + '</b></td><td>' +
        (closed ? '<label class="check" style="min-height:32px"><input type="checkbox" data-paid="' + esc(l.personId) + '"' + (l.paid === 'yes' ? ' checked' : '') + '> ' + esc(t('paid')) + '</label>'
          : (C.n(l.lateCount) ? '<span class="chip warn">' + esc(t('late_n', { n: l.lateCount })) + '</span> ' : '') + (C.n(l.incompleteDays) ? '<span class="chip bad">' + esc(t('incomplete_n', { n: l.incompleteDays })) + '</span> ' : '') + (C.n(l.pendingBonus) ? '<span class="chip">' + esc(t('pending_bonus', { v: C.num(l.pendingBonus) })) + '</span>' : '')) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">' + esc(t('total')) + '</td><td class="num">' + C.num(sum('S')) + '</td><td class="num">' + C.num(sum('B')) + '</td><td class="num">' + C.num(sum('bonus')) + '</td><td class="num">' + C.num(sum('advance')) + '</td><td class="num">' + C.num(sum('penalty')) + '</td><td class="num">' + C.num(sum('correction')) + '</td><td class="num">' + C.num(sum('total')) + '</td><td></td></tr></tfoot></table></div></section>';

    view.querySelector('#pdf').addEventListener('submit', async e => {
      e.preventDefault();
      await C.busy(e.target.querySelector('button'), () => API.call('setPlanDays', { month, days: e.target.days.value })).then(async () => { C.toast(t('saved')); await UB.refresh(true); }).catch(() => {});
    });
    view.querySelectorAll('[data-paid]').forEach(cb => cb.addEventListener('change', async () => {
      try { await API.call('markPaid', { month, personId: cb.dataset.paid, paid: cb.checked }); C.toast(t('saved')); }
      catch (e) { cb.checked = !cb.checked; C.toast(C.errorText(e), true); }
    }));
    C.bind(view, {
      month: el => UB.go('#/payroll?m=' + C.shiftMonth(month, Number(el.dataset.k))),
      csv: () => C.downloadCsv('vedomost-' + month + '.csv', [[t('name'), t('pay'), t('days'), t('plan_days'), t('col_std'), 'B', t('col_bonus'), t('col_adv'), t('col_pen'), t('col_corr'), t('col_total'), t('paid')]].concat(lines.map(l => [l.name, payLabel(l), l.daysWorked, l.planDays, l.S, l.B, l.bonus, l.advance, l.penalty, l.correction, l.total, l.paid || '']))),
      close: async el => {
        if (!await C.confirmDlg(t('close_month_q', { m: C.monthName(month) }), t('close_month'), true)) return;
        await C.busy(el, () => API.call('closePeriod', { month })).then(async () => { C.toast(t('month_closed')); await UB.refresh(true); }).catch(() => {});
      },
      line: (el, ev) => { if (ev.target.closest('label')) return; const l = lines.find(x => x.personId === el.dataset.id); if (l) lineDetail(l, closed); }
    });
  };

  function lineDetail(l, closed) {
    const row = (k, v, strong) => '<span>' + esc(k) + '</span><span class="mono" style="text-align:right' + (strong ? ';font-weight:700' : '') + '">' + v + '</span>';
    const dlg = C.dialog({
      title: l.name,
      body: '<div class="small muted">' + esc(payLabel(l)) + '</div><div class="kv" style="grid-template-columns:1fr auto">' +
        (l.personType === 'WORKER' ? row(t('days'), esc(l.daysWorked) + (l.payType === 'MONTH' ? ' / ' + esc(l.planDays || '?') : '')) : '') +
        row(t('col_std'), C.money(l.S)) + row('B (' + t('approved_work') + ')', C.money(l.B)) + row(t('col_bonus'), C.money(l.bonus)) +
        row('− ' + t('col_adv'), C.money(l.advance)) + row('− ' + t('col_pen'), C.money(l.penalty)) + row('± ' + t('col_corr'), C.money(l.correction)) + row(t('col_total'), C.money(l.total), true) + '</div>' +
        (C.n(l.lateCount) || C.n(l.incompleteDays) ? '<div class="notice warn">' + esc(t('line_warn', { late: l.lateCount, inc: l.incompleteDays })) + '</div>' : '') +
        (C.n(l.pendingBonus) ? '<div class="notice">' + esc(t('pending_bonus_long', { v: C.money(l.pendingBonus) })) + '</div>' : ''),
      foot: (!closed && l.personType === 'WORKER' ? '<button type="button" class="btn" data-ded>' + esc(t('add_deduction')) + '</button>' : '') + '<button type="button" class="btn primary" data-close>' + esc(t('close')) + '</button>'
    });
    const b = dlg.querySelector('[data-ded]'); if (b) b.addEventListener('click', () => { dlg.close(); F.deduction(l.personId); });
  }

  // =========================================================== reports
  S.reports = async function (view, route) {
    const month = route.q.m || UB.data.month;
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_reports')) + '</h1>' + monthNav(month, 'month') + '</div><div class="loading"><i></i></div>';
    C.bind(view, { month: el => UB.go('#/reports?m=' + C.shiftMonth(month, Number(el.dataset.k))) });
    let r;
    try { r = await API.call('report', { month }); } catch (e) { view.querySelector('.loading').outerHTML = '<div class="empty">' + esc(C.errorText(e)) + '</div>'; return; }
    if (location.hash.indexOf('#/reports') !== 0) return;
    const d = UB.data;
    const cost = Object.keys(r.costByForeman).map(id => ({ id, name: UB.foremanName(id), v: r.costByForeman[id] })).sort((a, b) => b.v - a.v);
    const maxCost = Math.max(1, ...cost.map(x => x.v));
    const workers = r.lines.filter(l => l.personType === 'WORKER').sort((a, b) => C.n(b.lateCount) - C.n(a.lateCount) || a.name.localeCompare(b.name));
    const openAdv = d.advances.filter(a => ['APPROVED', 'GIVEN'].indexOf(a.status) >= 0);
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_reports')) + '</h1>' + monthNav(month, 'month') + '</div>' +
      '<div class="kpis"><div class="kpi"><div class="label">' + esc(t('r_cost_total')) + '</div><div class="value">' + C.money(cost.reduce((s, x) => s + x.v, 0)) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('r_geo_rejects')) + '</div><div class="value" style="color:var(--bad)">' + r.geoRejects + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('r_late_total')) + '</div><div class="value" style="color:var(--warn)">' + workers.reduce((s, l) => s + C.n(l.lateCount), 0) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('r_open_adv')) + '</div><div class="value">' + openAdv.length + '</div></div></div>' +
      '<div class="cols"><section class="card col-2"><h2>' + esc(t('r_cost_by_foreman')) + '</h2>' + (cost.length ? '<div class="stack">' + cost.map(x => '<div style="display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,2fr) 90px;gap:12px;align-items:center"><span>' + esc(C.shortName(x.name)) + '</span><div class="bar" style="height:10px"><i style="width:' + Math.round(x.v / maxCost * 100) + '%;background:var(--accent)"></i></div><span class="mono right">' + C.num(x.v) + '</span></div>').join('') + '</div><div class="tiny muted">' + esc(t('r_cost_hint')) + '</div>' : '<div class="empty">' + esc(t('no_data')) + '</div>') + '</section>' +
      '<section class="card col-2"><h2>' + esc(t('r_work_by_type')) + '</h2>' + (r.workByType.length ? '<table class="t"><tbody>' + r.workByType.map(x => '<tr><td>' + esc(x.name) + '</td><td class="num">' + C.num(x.qty) + ' ' + esc(x.unit) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">' + esc(t('no_data')) + '</div>') + '</section></div>' +
      '<section class="card"><div class="card-head"><h2>' + esc(t('r_attendance')) + '</h2><button type="button" class="btn sm" data-act="csv">' + icon('download', 14) + 'CSV</button></div><div class="table-wrap"><table class="t" style="min-width:600px"><thead><tr><th>' + esc(t('worker')) + '</th><th>' + esc(t('foreman')) + '</th><th class="num">' + esc(t('days')) + '</th><th class="num">' + esc(t('late')) + '</th><th class="num">' + esc(t('incomplete')) + '</th><th class="num">' + esc(t('col_bonus')) + '</th></tr></thead><tbody>' +
      workers.map(l => '<tr><td>' + esc(l.name) + '</td><td>' + esc(C.shortName(UB.foremanName(l.foremanId))) + '</td><td class="num">' + esc(l.daysWorked) + '</td><td class="num" style="color:' + (C.n(l.lateCount) ? 'var(--warn)' : 'inherit') + '">' + esc(l.lateCount) + '</td><td class="num">' + esc(l.incompleteDays) + '</td><td class="num">' + C.num(l.bonus) + '</td></tr>').join('') + '</tbody></table></div></section>' +
      '<section class="card"><h2>' + esc(t('r_open_adv')) + '</h2>' + (openAdv.length ? '<div class="list">' + openAdv.map(a => '<div class="list-row"><span class="mono muted">' + esc(a.receiptNo) + '</span><span class="grow">' + esc(UB.workerName(a.workerId)) + '</span><span class="chip ' + (a.status === 'GIVEN' ? 'warn' : '') + '">' + esc(t('adv_' + a.status)) + '</span><b class="mono">' + C.money(a.amount) + '</b></div>').join('') + '</div>' : '<div class="empty">' + esc(t('no_data')) + '</div>') + '</section>';
    C.bind(view, {
      month: el => UB.go('#/reports?m=' + C.shiftMonth(month, Number(el.dataset.k))),
      csv: () => C.downloadCsv('davamiyyet-' + month + '.csv', [[t('worker'), t('foreman'), t('days'), t('late'), t('incomplete'), t('col_bonus')]].concat(workers.map(l => [l.name, UB.foremanName(l.foremanId), l.daysWorked, l.lateCount, l.incompleteDays, l.bonus])))
    });
  };

  // =========================================================== catalog
  S.catalog = function (view) {
    const list = UB.data.workTypes;
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('nav_catalog')) + '</h1><div class="sub">' + esc(t('catalog_hint')) + '</div></div><button type="button" class="btn primary" data-act="add">' + icon('plus', 16) + esc(t('new_work_type')) + '</button></div>' +
      '<section class="card"><div class="table-wrap"><table class="t" style="min-width:640px"><thead><tr><th>' + esc(t('work_type')) + '</th><th>' + esc(t('unit')) + '</th><th>' + esc(t('bonus_type')) + '</th><th class="num">' + esc(t('g_helper')) + '</th><th class="num">' + esc(t('g_master')) + '</th><th class="num">' + esc(t('g_senior')) + '</th></tr></thead><tbody>' +
      list.map(w => '<tr class="click" data-act="edit" data-id="' + esc(w.id) + '"><td><b>' + esc(w.name) + '</b></td><td>' + esc(w.unit) + '</td><td>' + esc(t('bt_' + w.bonusType)) + '</td>' +
        (w.bonusType === 'PCT' ? '<td class="num" colspan="3">' + C.num(w.percent) + '% ' + esc(t('of_client_price')) + '</td>' : '<td class="num">' + C.num(w.rateHelper) + '</td><td class="num">' + C.num(w.rateMaster) + '</td><td class="num">' + C.num(w.rateSenior) + '</td>') + '</tr>').join('') +
      '</tbody></table></div><div class="tiny muted">' + esc(t('rates_hint')) + '</div></section>';
    C.bind(view, { add: () => F.workType(), edit: el => F.workType(UB.idx.workTypes[el.dataset.id]) });
  };

  F.workType = function (w) {
    w = w || { bonusType: 'AZN', unit: 'm²', active: 'yes' };
    const dlg = C.dialog({
      title: w.id ? w.name : t('new_work_type'),
      body: '<form class="form" id="tf"><div class="grid2">' + fld(t('name'), inp('name', w.name, 'text', 'required')) + fld(t('unit'), inp('unit', w.unit, 'text', 'required list="units"') + '<datalist id="units"><option value="m²"><option value="m"><option value="ədəd"><option value="gün"></datalist>') +
        fld(t('bonus_type'), sel('bonusType', w.bonusType, [['AZN', t('bt_AZN')], ['PCT', t('bt_PCT')]])) + fld(t('status'), sel('active', w.active, [['yes', t('active')], ['no', t('inactive')]])) + '</div>' +
        '<fieldset data-azn><legend>' + esc(t('rate_per_unit')) + '</legend><div class="grid2">' + fld(t('g_helper'), inp('rateHelper', w.rateHelper, 'number', 'min="0" step="0.01"')) + fld(t('g_master'), inp('rateMaster', w.rateMaster, 'number', 'min="0" step="0.01"')) + fld(t('g_senior'), inp('rateSenior', w.rateSenior, 'number', 'min="0" step="0.01"')) + '</div></fieldset>' +
        '<fieldset data-pct><legend>' + esc(t('bt_PCT')) + '</legend>' + fld(t('percent'), inp('percent', w.percent, 'number', 'min="0" max="100" step="0.1"'), t('pct_hint')) + '</fieldset></form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    const form = dlg.querySelector('#tf');
    const sync = () => { const p = form.bonusType.value === 'PCT'; dlg.querySelector('[data-azn]').style.display = p ? 'none' : ''; dlg.querySelector('[data-pct]').style.display = p ? '' : 'none'; };
    form.addEventListener('change', sync); sync();
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      await C.busy(e.currentTarget, () => API.call('saveWorkType', { workType: Object.assign({ id: w.id }, C.formData(form)) })).then(() => { dlg.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    });
  };
})();
