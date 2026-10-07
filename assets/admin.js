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
  const dt = s => String(s || '').replace('T', ' ').slice(0, 16);
  UB.h = { sel, fld, inp, payLabel, dt };

  function monthNav(month, act, extra) {
    return '<div class="row" style="gap:6px"><button type="button" class="btn icon" data-act="' + act + '" data-k="-1" aria-label="' + esc(t('prev_month')) + '">' + icon('left') + '</button>' +
      '<b style="min-width:140px;text-align:center">' + esc(month ? C.monthName(month) : t('all_time')) + '</b>' +
      '<button type="button" class="btn icon" data-act="' + act + '" data-k="1" aria-label="' + esc(t('next_month')) + '">' + icon('chev') + '</button>' + (extra || '') + '</div>';
  }

  // =========================================================== decisions (BR-42): Təsdiq · Geri qaytar · Rədd et
  async function decide(type, id, decision, btn, force) {
    let reason = '';
    if (decision !== 'approve') {
      reason = await C.promptDlg(t(decision === 'return' ? 'return' : 'reject'), t(decision === 'return' ? 'return_reason_q' : 'reject_reason_q'), { textarea: true, ok: t(decision === 'return' ? 'return' : 'reject') });
      if (reason === null) return false;
    }
    return C.busy(btn, () => API.call('decide', { type, id, decision, reason, force: !!force })).then(() => { C.toast(t(decision === 'approve' ? 'approved' : decision === 'return' ? 'returned' : 'rejected')); UB.refresh(); return true; }).catch(() => false);
  }
  UB.decide = decide;
  function decBtns(type, id, compact) {
    if (compact) return '<button type="button" class="btn icon ok" data-act="dec" data-d="approve" data-type="' + type + '" data-id="' + esc(id) + '" aria-label="' + esc(t('approve')) + '">' + icon('check', 20) + '</button>' +
      '<button type="button" class="btn icon" data-act="dec" data-d="return" data-type="' + type + '" data-id="' + esc(id) + '" aria-label="' + esc(t('return')) + '">' + icon('undo') + '</button>';
    return '<div class="row dec" style="justify-content:flex-end">' +
      '<button type="button" class="btn danger" data-act="dec" data-d="reject" data-type="' + type + '" data-id="' + esc(id) + '">' + icon('x', 16) + esc(t('reject')) + '</button>' +
      '<button type="button" class="btn" data-act="dec" data-d="return" data-type="' + type + '" data-id="' + esc(id) + '">' + icon('undo', 16) + esc(t('return')) + '</button>' +
      '<button type="button" class="btn ok" data-act="dec" data-d="approve" data-type="' + type + '" data-id="' + esc(id) + '">' + icon('check', 16) + esc(t('approve')) + '</button></div>';
  }
  UB.decBtns = decBtns;
  const decHandler = el => decide(el.dataset.type, el.dataset.id, el.dataset.d, el);

  function pendingItems() {
    const d = UB.data, items = [];
    d.entries.filter(e => e.status === 'ADMIN_PENDING').forEach(e => items.push({ type: 'work', id: e.id, ts: e.created, e }));
    d.advances.filter(a => a.status === 'PENDING').forEach(a => items.push({ type: 'adv', id: a.id, ts: a.created, a }));
    d.payments.filter(p => p.status === 'PENDING').forEach(p => items.push({ type: 'pay', id: p.id, ts: p.created, p }));
    d.expenses.filter(x => x.status === 'PENDING').forEach(x => items.push({ type: 'exp', id: x.id, ts: x.created, x }));
    d.sites.filter(s => s.status === 'PENDING').forEach(s => items.push({ type: 'site', id: s.id, ts: s.created, s }));
    d.attendance.filter(a => a.status === 'PENDING').forEach(a => items.push({ type: 'att', id: a.id, ts: a.ts, att: a }));
    return items.sort((x, y) => String(y.ts).localeCompare(String(x.ts)));
  }

  function sharesText(e) {
    return UB.data.shares.filter(s => s.entryId === e.id).map(s => C.shortName(UB.workerName(s.workerId)) + ' ' + C.num(s.share, 0) + '%' + (s.confirmedAt ? ' ✓' : '')).join(', ');
  }

  function itemCompact(it) {
    let tag = '', title = '', meta = '';
    if (it.type === 'work') { const e = it.e; tag = '<span class="tag accent">' + esc(t('tag_work')) + '</span>'; title = UB.wtName(e.workTypeId) + ' · ' + C.num(e.qty) + ' ' + UB.wtUnit(e.workTypeId); meta = sharesText(e) + ' · ' + UB.siteName(e.siteId); }
    if (it.type === 'adv') { const a = it.a; tag = '<span class="tag warn">' + esc(t('tag_adv')) + '</span>'; title = C.money(a.amount) + ' · ' + UB.workerName(a.workerId); meta = C.shortName(UB.foremanName(a.foremanId)) + (a.overLimit === 'yes' ? ' · ' + t('over_limit') : ' · ' + t('within_limit')); }
    if (it.type === 'pay') { const p = it.p; tag = '<span class="tag">' + esc(t('tag_pay')) + '</span>'; title = C.money(p.amount) + ' · ' + (UB.customerOfSite(p.siteId).name || ''); meta = UB.siteName(p.siteId) + ' · ' + C.shortName(UB.foremanName(p.foremanId)); }
    if (it.type === 'exp') { const x = it.x; tag = '<span class="tag">' + esc(t('tag_exp')) + '</span>'; title = C.money(x.amount) + ' · ' + x.category; meta = UB.siteName(x.siteId) + (x.note ? ' · ' + x.note : ''); }
    if (it.type === 'site') { const s = it.s; tag = '<span class="tag">' + esc(t('tag_site')) + '</span>'; title = s.name; meta = ((UB.idx.customers[s.customerId] || {}).name || '') + ' · ' + t('radius_m', { m: s.radius }); }
    if (it.type === 'att') { const a = it.att; tag = '<span class="tag">' + esc(t('tag_manual')) + '</span>'; title = t(a.kind === 'IN' ? 'kind_in' : 'kind_out') + ' · ' + UB.workerName(a.workerId); meta = C.fmtDate(a.date) + ' ' + C.fmtTime(a.ts) + ' · ' + a.reason; }
    return '<div class="list-row">' + tag + '<div class="grow"><div class="title">' + esc(title) + '</div><div class="meta">' + esc(meta) + '</div></div>' + (['site', 'pay', 'exp'].indexOf(it.type) >= 0 ? '<a class="btn sm" href="#/approvals?tab=' + it.type + '">' + esc(t('open')) + '</a>' : decBtns(it.type, it.id, true)) + '</div>';
  }

  // =========================================================== dashboard (BR-50: karta basanda siyahı açılır)
  function listDialog(title, rows, empty) {
    C.dialog({ title, body: rows.length ? '<div class="table-wrap"><table class="t">' + rows.join('') + '</table></div>' : '<div class="empty">' + esc(empty || t('no_data')) + '</div>', foot: '<button type="button" class="btn primary" data-close>' + esc(t('close')) + '</button>' });
  }

  S.home = function (view) {
    const d = UB.data;
    const workers = d.workers.filter(w => w.status === 'active');
    const st = {}; workers.forEach(w => { st[w.id] = UB.todayStatus(w.id); });
    const present = workers.filter(w => st[w.id].code !== 'absent');
    const late = workers.filter(w => st[w.id].code === 'late');
    const sitesActive = d.sites.filter(s => s.status === 'APPROVED');
    const custs = {}; sitesActive.forEach(s => { custs[s.customerId] = 1; });
    const cnt = UB.counts();
    const pct = workers.length ? Math.round(present.length / workers.length * 100) : 0;
    const now = new Date();
    const foremen = d.foremen.filter(f => f.status === 'active');
    const sm = d.summary || {};

    const feed = d.attendance.filter(a => a.date === d.today).map(a => ({ ts: a.ts, a }))
      .concat(d.geoRejects.filter(g => String(g.ts).slice(0, 10) === d.today).map(g => ({ ts: g.ts, g })))
      .sort((x, y) => String(y.ts).localeCompare(String(x.ts))).slice(0, 8);
    const attemptsToday = d.attempts.filter(a => String(a.ts).slice(0, 10) === d.today);

    view.innerHTML =
      '<div class="page-head"><div><div class="sub">' + esc(C.weekday(now) + ', ' + C.fmtDate(d.today, true)) + '</div><h1>' + esc(t('today')) + '</h1></div>' +
      '<div class="row"><button type="button" class="btn" data-act="refresh">' + icon('refresh', 16) + esc(t('refresh')) + '</button><a class="btn primary" href="#/payroll">' + esc(t('payroll_of', { m: C.monthName(d.month) })) + '</a></div></div>' +
      ((sm.locked || []).length ? '<a class="notice warn" href="#/settings" style="display:block;color:var(--text)">' + icon('lock', 14) + ' ' + esc(t('n_locked', { n: sm.locked.length })) + '</a>' : '') +
      (d.linkWarnings.length ? '<div class="notice warn">' + icon('alert', 14) + ' ' + esc(t('link_warn', { list: d.linkWarnings.map(x => UB.workerName(x.workerId) + ' (' + x.n + ')').join(', ') })) + '</div>' : '') +
      '<div class="kpis">' +
      '<button type="button" class="kpi click" data-act="kpi" data-k="present"><div class="label">' + esc(t('k_present')) + '</div><div class="value">' + present.length + '<small> / ' + workers.length + '</small></div><div class="bar"><i style="width:' + pct + '%"></i></div></button>' +
      '<button type="button" class="kpi click" data-act="kpi" data-k="late"><div class="label">' + esc(t('k_late')) + '</div><div class="value" style="color:var(--warn)">' + late.length + '</div><div class="small muted">' + esc(t('k_late_sub', { m: UB.tol() })) + '</div></button>' +
      '<button type="button" class="kpi click" data-act="kpi" data-k="sites"><div class="label">' + esc(t('k_sites')) + '</div><div class="value">' + sitesActive.length + '</div><div class="small muted">' + esc(t('k_customers', { n: Object.keys(custs).length })) + '</div></button>' +
      '<a class="kpi click" href="#/approvals"><div class="label">' + esc(t('k_pending')) + '</div><div class="value" style="color:var(--accent)">' + (cnt.total - cnt.conflicts) + '</div><div class="small muted">' + esc(t('k_pending_sub2', { w: cnt.work, a: cnt.adv, p: cnt.pay, x: cnt.exp, s: cnt.sites, m: cnt.att })) + '</div></a>' +
      '<a class="kpi click" href="#/money?tab=conflicts"><div class="label">' + esc(t('k_conflicts')) + '</div><div class="value" style="color:' + (cnt.conflicts ? 'var(--bad)' : 'inherit') + '">' + cnt.conflicts + '</div><div class="small muted">' + esc(t('k_conflicts_sub')) + '</div></a>' +
      '<button type="button" class="kpi click" data-act="kpi" data-k="attempts"><div class="label">' + esc(t('k_attempts')) + '</div><div class="value" style="color:' + (attemptsToday.length ? 'var(--bad)' : 'inherit') + '">' + d.attempts.length + '</div><div class="small muted">' + esc(t('k_attempts_sub', { n: attemptsToday.length })) + '</div></button>' +
      '<a class="kpi wide click" href="#/payroll"><div class="label">' + esc(t('k_fund', { m: C.monthName(d.month).split(' ')[0] })) + '</div><div class="value" id="kpi-fund">…</div><div class="small muted" id="kpi-fund-sub">' + esc(t('interim_calc')) + '</div></a>' +
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
      '<section class="card col-2" style="gap:4px"><div class="card-head" style="margin-bottom:6px"><h2>' + esc(t('k_pending')) + '</h2><a href="#/approvals" class="small">' + esc(t('all_n', { n: cnt.total - cnt.conflicts })) + '</a></div>' +
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

    const kpi = {
      present: () => listDialog(t('k_present') + ' · ' + present.length, present.map(w => { const s = st[w.id]; return '<tr><td><b>' + esc(w.name) + '</b><div class="tiny muted">' + esc(UB.foremanName(w.foremanId)) + '</div></td><td>' + esc(UB.siteName((s.inR || {}).siteId)) + '</td><td>' + UB.statusChip(s) + '</td></tr>'; }), t('nobody')),
      late: () => listDialog(t('k_late') + ' · ' + late.length, ['<thead><tr><th>' + esc(t('worker')) + '</th><th>' + esc(t('foreman')) + '</th><th>' + esc(t('site')) + '</th><th class="num">' + esc(t('arrived')) + '</th><th class="num">' + esc(t('minutes')) + '</th></tr></thead>'].concat(late.map(w => { const s = st[w.id]; return '<tr><td><b>' + esc(w.name) + '</b><div class="tiny muted mono">' + esc(w.startTime) + '</div></td><td>' + esc(C.shortName(UB.foremanName(w.foremanId))) + '</td><td>' + esc(UB.siteName(s.inR.siteId)) + '</td><td class="num">' + C.fmtTime(s.inR.ts) + '</td><td class="num" style="color:var(--warn)">+' + C.n(s.inR.diffMin) + '</td></tr>'; })).slice(late.length ? 0 : 1), t('nobody_late')),
      sites: () => listDialog(t('k_sites') + ' · ' + sitesActive.length, sitesActive.map(s => '<tr class="click" data-site="' + esc(s.id) + '"><td><b>' + esc(s.name) + '</b><div class="tiny muted">' + esc((UB.idx.customers[s.customerId] || {}).name || '') + '</div></td><td>' + esc(C.shortName(UB.foremanName(s.foremanId))) + '</td><td class="num">' + workers.filter(w => st[w.id].inR && st[w.id].inR.siteId === s.id).length + ' ' + esc(t('workers_short')) + '</td></tr>')),
      attempts: () => listDialog(t('k_attempts'), d.attempts.slice().reverse().map(a => '<tr><td class="mono small">' + esc(dt(a.ts)) + '</td><td>' + esc(a.workerId ? UB.workerName(a.workerId) : t('customer')) + '<div class="tiny muted">' + esc(t('lk_' + a.kind)) + '</div></td><td><span class="chip bad">' + esc(t('att_' + a.reason)) + '</span></td></tr>'), t('no_attempts'))
    };
    C.bind(view, {
      refresh: b => C.busy(b, () => UB.refresh()),
      goForeman: el => UB.go('#/workers?f=' + el.dataset.id),
      dec: decHandler,
      kpi: el => { kpi[el.dataset.k](); const dlg = document.querySelector('dialog[open]'); if (dlg) dlg.addEventListener('click', e => { const r = e.target.closest('[data-site]'); if (r) { dlg.close(); F.siteDetail(UB.idx.sites[r.dataset.site]); } }); }
    });

    const fill = (fund, adv, costByForeman) => {
      const el = view.querySelector('#kpi-fund'); if (el) el.textContent = C.money(fund);
      const sub = view.querySelector('#kpi-fund-sub'); if (sub) sub.textContent = t('adv_deducted', { v: C.money(adv) });
      view.querySelectorAll('[data-cost]').forEach(td => { td.textContent = C.num(costByForeman[td.dataset.cost] || 0); });
    };
    if (sm.month === d.month) fill(sm.fund, sm.advances, sm.costByForeman || {});
    else API.call('report', { month: d.month }).then(r => {
      fill(r.lines.reduce((s, l) => s + C.n(l.S) + C.n(l.bonus), 0), r.lines.reduce((s, l) => s + C.n(l.advance), 0), r.costByForeman || {});
    }).catch(() => { const el = view.querySelector('#kpi-fund'); if (el) el.textContent = '—'; });
  };

  function fmtDist(m) { m = C.n(m); return m >= 1000 ? C.num(m / 1000, 1).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
  UB.fmtDist = fmtDist;

  // =========================================================== foremen (sahə rəisləri)
  S.foremen = function (view) {
    const d = UB.data;
    const list = d.foremen.slice().sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'active' ? -1 : 1));
    const locked = {}; ((d.summary || {}).locked || []).forEach(x => { locked[x.id] = x; });
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('nav_foremen')) + '</h1><div class="sub">' + esc(t('foremen_limit', { n: list.filter(f => f.status === 'active').length, max: d.settings.maxForemen })) + '</div></div>' +
      '<button type="button" class="btn primary" data-act="add">' + icon('plus', 16) + esc(t('new_foreman')) + '</button></div>' +
      '<section class="card">' + (list.length ? '<div class="table-wrap"><table class="t" style="min-width:600px"><thead><tr><th>' + esc(t('name')) + '</th><th>' + esc(t('phone')) + '</th><th class="num">' + esc(t('workers_short')) + '</th><th class="num">' + esc(t('sites_short')) + '</th><th>' + esc(t('pay')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
        list.map(f => '<tr class="click" data-act="edit" data-id="' + esc(f.id) + '"><td><b>' + esc(f.name) + '</b>' + (f.mustChange === 'yes' ? '<div class="tiny muted">' + esc(t('pw_temp')) + '</div>' : '') + '</td><td class="mono">' + esc(f.phone) + '</td><td class="num">' + d.workers.filter(w => w.foremanId === f.id && w.status === 'active').length + '</td><td class="num">' + d.sites.filter(s => s.foremanId === f.id && s.status === 'APPROVED').length + '</td><td class="small">' + esc(payLabel(f)) + (C.n(f.baseAmount) ? ' · ' + C.money(f.baseAmount) : '') + (C.n(f.bonusPercent) ? ' · ' + C.num(f.bonusPercent) + '%' : '') + '</td><td>' + (locked[f.id] ? '<span class="chip bad">' + esc(t('locked')) + '</span>' : f.status === 'active' ? '<span class="chip ok">' + esc(t('active')) + '</span>' : '<span class="chip">' + esc(t('inactive')) + '</span>') + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty">' + esc(t('no_foremen')) + '</div>') + '</section>';
    C.bind(view, { add: () => F.foreman(), edit: el => F.foreman(UB.idx.foremen[el.dataset.id]) });
  };

  F.foreman = function (f) {
    f = f || { payType: 'MONTH', payModel: 'STD', lang: 'az', status: 'active' };
    const d = C.dialog({
      title: f.id ? t('edit_foreman') : t('new_foreman'),
      body: '<form class="form" id="ff"><div class="grid2">' +
        fld(t('name'), inp('name', f.name, 'text', 'required')) + fld(t('phone'), inp('phone', f.phone, 'tel', 'required inputmode="tel"')) +
        fld(t('language'), sel('lang', f.lang, UB.langOptions())) + '</div>' +
        '<fieldset><legend>' + esc(f.id ? t('reset_password') : t('temp_password')) + '</legend>' +
        '<label class="field"><span>' + esc(t(f.id ? 'new_temp_password_opt' : 'temp_password')) + '</span><span class="pw-wrap">' + inp('password', '', 'text', 'autocomplete="off" ' + (f.id ? '' : 'required')) + '</span></label><div id="rules">' + UB.rulesHtml('') + '</div>' +
        '<div class="tiny muted">' + esc(t('temp_password_hint')) + '</div></fieldset>' +
        '<fieldset><legend>' + esc(t('pay')) + '</legend><div class="grid2">' +
        fld(t('pay_type'), sel('payType', f.payType, [['MONTH', t('pt_MONTH')], ['DAY', t('pt_DAY')]])) +
        fld(t('pay_model'), sel('payModel', f.payModel, MODELS.map(m => [m, t('pm_' + m)]))) +
        fld(t('base_amount'), inp('baseAmount', f.baseAmount, 'number', 'min="0" step="0.01"')) +
        fld(t('foreman_bonus_pct'), inp('bonusPercent', f.bonusPercent, 'number', 'min="0" max="100" step="0.1"'), t('foreman_bonus_hint')) +
        '</div></fieldset>' + fld(t('status'), sel('status', f.status, [['active', t('active')], ['inactive', t('inactive')]])) + '</form>',
      foot: (f.id ? '<button type="button" class="btn" data-sess>' + esc(t('close_sessions')) + '</button><span class="grow"></span>' : '') + '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    const form = d.querySelector('#ff');
    form.password.addEventListener('input', () => { d.querySelector('#rules').innerHTML = UB.rulesHtml(form.password.value); });
    d.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      const data = Object.assign({ id: f.id }, C.formData(form));
      if (data.password && UB.pwRules(data.password).some(r => !r[1])) return C.toast(t('err_weak_password'), true);
      await C.busy(e.currentTarget, () => API.call('saveForeman', { foreman: data })).then(() => { d.close(); C.toast(t(data.password && f.id ? 'pw_reset_done' : 'saved')); UB.refresh(); }).catch(() => {});
    });
    const sb = d.querySelector('[data-sess]');
    if (sb) sb.addEventListener('click', async e => { if (!await C.confirmDlg(t('close_sessions_q'), t('close_sessions'), true)) return; await C.busy(e.currentTarget, () => API.call('closeSessions', { id: f.id })).then(() => C.toast(t('saved'))).catch(() => {}); });
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
    const advOf = id => d.advances.filter(a => a.workerId === id && ['CLOSED', 'SIGNED'].indexOf(a.status) >= 0 && String(a.approvedAt).slice(0, 7) === month).reduce((s, a) => s + C.n(a.amount), 0);
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
    w = Object.assign({ payType: 'MONTH', payModel: 'STD', grade: 'master', lang: 'az', status: 'active', startTime: '09:00', endTime: '18:00' }, w || {});
    const specs = Array.from(new Set(d.workers.map(x => x.specialty).filter(Boolean).concat(t('spec_list').split(','))));
    const dlg = C.dialog({
      title: w.id ? w.name : t('new_worker'),
      body: '<form class="form" id="wf"><div class="grid2">' +
        fld(t('name'), inp('name', w.name, 'text', 'required')) + fld(t('phone_wa'), inp('phone', w.phone, 'tel', 'required inputmode="tel"'), t('phone_hint')) +
        fld(t('foreman'), '<select name="foremanId" required>' + C.options(d.foremen.filter(f => f.status === 'active' || f.id === w.foremanId), w.foremanId, 'id', null, '—') + '</select>') +
        fld(t('language'), sel('lang', w.lang, UB.langOptions())) +
        fld(t('specialty'), inp('specialty', w.specialty, 'text', 'list="spec-list"') + '<datalist id="spec-list">' + specs.map(s => '<option value="' + esc(s) + '">').join('') + '</datalist>') +
        fld(t('grade'), sel('grade', w.grade, GRADES.map(g => [g, t('g_' + g)]))) +
        fld(t('start_time'), inp('startTime', w.startTime, 'time')) + fld(t('end_time'), inp('endTime', w.endTime, 'time')) + '</div>' +
        '<fieldset><legend>' + esc(t('pay')) + '</legend><div class="grid2">' +
        fld(t('pay_type'), sel('payType', w.payType, [['MONTH', t('pt_MONTH')], ['DAY', t('pt_DAY')]])) +
        fld(t('base_amount'), inp('baseAmount', w.baseAmount, 'number', 'min="0" step="0.01"'), t('base_hint')) +
        fld(t('pay_model'), sel('payModel', w.payModel, MODELS.map(m => [m, t('pm_' + m)]))) +
        '</div><div class="small muted" data-bonus-note>' + esc(t('bonus_rule_note')) + '</div></fieldset>' + fld(t('status'), sel('status', w.status, [['active', t('active')], ['inactive', t('inactive')]])) + '</form>',
      foot: (w.id ? '<button type="button" class="btn" data-ded>' + esc(t('add_deduction')) + '</button><span class="grow"></span>' : '') +
        '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    const form = dlg.querySelector('#wf');
    const sync = () => { dlg.querySelector('[data-bonus-note]').style.display = form.payModel.value === 'STD' ? 'none' : ''; };
    form.addEventListener('change', sync); sync();
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      const data = Object.assign({ id: w.id }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('saveWorker', { worker: data })).then(() => { dlg.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    });
    const ded = dlg.querySelector('[data-ded]');
    if (ded) ded.addEventListener('click', () => { dlg.close(); F.deduction(w.id); });
  };

  /** Cərimə / korreksiya (BR-59): növ default siyahıdan, məbləğ hər dəfə yazılır. */
  F.deduction = function (workerId) {
    const cats = UB.list('penaltyTypes');
    const dlg = C.dialog({
      title: t('add_deduction') + ' · ' + UB.workerName(workerId),
      body: '<form class="form" id="df"><div class="grid2">' +
        fld(t('type'), sel('type', 'PENALTY', [['PENALTY', t('ded_PENALTY')], ['CORRECTION', t('ded_CORRECTION')], ['OTHER', t('ded_OTHER')]])) +
        fld(t('penalty_kind'), sel('category', cats[0] || '', cats.map(c => [c, c]))) +
        fld(t('amount'), inp('amount', '', 'number', 'step="0.01" required'), t('ded_hint')) +
        fld(t('date'), inp('date', C.todayISO(), 'date', 'required')) + '</div>' +
        fld(t('reason'), '<textarea name="reason" required></textarea>') + '</form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    const form = dlg.querySelector('#df');
    const sync = () => { form.category.closest('.field').style.display = form.type.value === 'PENALTY' ? '' : 'none'; };
    form.addEventListener('change', sync); sync();
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      const data = Object.assign({ workerId }, C.formData(form));
      if (data.type !== 'PENALTY') data.category = '';
      await C.busy(e.currentTarget, () => API.call('addDeduction', { deduction: data })).then(() => { dlg.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    });
  };

  // =========================================================== sites & customers
  const SITE_CHIP = { APPROVED: 'ok', PENDING: 'warn', RETURNED: 'bad', REJECTED: 'bad' };
  UB.siteChip = s => '<span class="chip ' + (SITE_CHIP[s.status] || '') + '">' + esc(t('site_' + s.status)) + '</span>';

  S.sites = function (view, route) {
    const d = UB.data, tab = route.q.tab || 'sites';
    const sites = d.sites.slice().sort((a, b) => (a.status === 'PENDING' ? -1 : b.status === 'PENDING' ? 1 : a.name.localeCompare(b.name)));
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_sites')) + '</h1><div class="row">' +
      '<button type="button" class="btn" data-act="addCust">' + icon('plus', 16) + esc(t('new_customer')) + '</button>' +
      '<button type="button" class="btn primary" data-act="addSite">' + icon('plus', 16) + esc(t('new_site')) + '</button></div></div>' +
      '<div class="tabs" role="tablist"><button role="tab" data-act="tab" data-tab="sites" aria-selected="' + (tab === 'sites') + '">' + esc(t('sites')) + ' (' + sites.length + ')</button><button role="tab" data-act="tab" data-tab="customers" aria-selected="' + (tab === 'customers') + '">' + esc(t('customers')) + ' (' + d.customers.length + ')</button></div>' +
      '<section class="card">' + (tab === 'sites'
        ? (sites.length ? '<div class="table-wrap"><table class="t" style="min-width:700px"><thead><tr><th>' + esc(t('site')) + '</th><th>' + esc(t('customer')) + '</th><th>' + esc(t('foreman')) + '</th><th class="num">' + esc(t('radius')) + '</th><th class="num">' + esc(t('contract')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
          sites.map(s => '<tr class="click" data-act="site" data-id="' + esc(s.id) + '"><td><b>' + esc(s.name) + '</b><div class="tiny muted">' + esc(s.address) + '</div></td><td>' + esc((UB.idx.customers[s.customerId] || {}).name || '—') + '</td><td>' + esc(C.shortName(UB.foremanName(s.foremanId))) + '</td><td class="num">' + esc(s.radius) + ' m</td><td class="num">' + (C.n(s.contractAmount) ? C.num(s.contractAmount) : '—') + '</td><td>' + UB.siteChip(s) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + esc(t('no_sites')) + '</div>')
        : (d.customers.length ? '<div class="list">' + d.customers.map(c => '<div class="list-row click" data-act="cust" data-id="' + esc(c.id) + '"><div class="grow"><div class="title">' + esc(c.name) + '</div><div class="meta mono">' + esc((c.phone || '') + (c.voen ? ' · ' + t('voen') + ' ' + c.voen : '')) + '</div></div>' + (c.pendingPhone ? '<span class="chip warn">' + esc(t('phone_pending')) + '</span>' : '') + '<span class="chip">' + esc(t('n_sites', { n: d.sites.filter(s => s.customerId === c.id).length })) + '</span></div>').join('') + '</div>' : '<div class="empty">' + esc(t('no_customers')) + '</div>')) +
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
    c = c || { type: 'person', lang: 'az' };
    const dlg = C.dialog({
      title: c.id ? c.name : t('new_customer'),
      body: '<form class="form" id="cf">' + fld(t('name'), inp('name', c.name, 'text', 'required')) + '<div class="grid2">' +
        fld(t('phone_wa'), inp('phone', c.phone, 'tel', 'inputmode="tel"'), c.pendingPhone ? t('phone_pending_val', { p: c.pendingPhone }) : t('cust_phone_hint')) +
        fld(t('type'), sel('type', c.type, [['person', t('cust_person')], ['company', t('cust_company')]])) +
        fld(t('voen_opt'), inp('voen', c.voen, 'text', 'inputmode="numeric" pattern="\\d{10}" maxlength="10"'), t('voen_hint')) +
        fld(t('cust_lang'), sel('lang', c.lang || 'az', UB.langOptions())) + '</div></form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      const form = dlg.querySelector('#cf'); if (!form.reportValidity()) return;
      const data = Object.assign({ id: c.id }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('saveCustomer', { customer: data })).then(async r => {
        dlg.close();
        C.toast(t(!UB.isAdmin() && c.id && c.phone && C.waPhone(data.phone) !== C.waPhone(c.phone) ? 'phone_sent_admin' : 'saved'));
        await UB.refresh(true); if (onSaved) onSaved(r);
      }).catch(() => {});
    });
  };

  /** Obyekt forması. Sahə rəisi yaradanda şəkil məcburidir; şəkil çəkiləndə telefonun yeri yazılır (BR-37). */
  F.site = function (s, presetCustomer) {
    const d = UB.data, admin = UB.isAdmin();
    s = Object.assign({ radius: d.settings.defaultRadius, customerId: presetCustomer || '' }, s || {});
    const old = String(s.photos || '').split(' ').filter(Boolean);
    let photos = [], photoPos = null;
    const minP = C.n(d.settings.siteMinPhotos);
    const dlg = C.dialog({
      title: s.id ? s.name : t('new_site'),
      body: (s.status === 'RETURNED' && s.returnReason ? '<div class="notice warn">' + esc(t('return_reason')) + ': ' + esc(s.returnReason) + '</div>' : '') +
        '<form class="form" id="sf">' +
        '<div class="row" style="align-items:flex-end;flex-wrap:nowrap">' + '<div class="grow">' + fld(t('customer'), '<select name="customerId" required>' + C.options(d.customers, s.customerId, 'id', null, '—') + '</select>') + '</div><button type="button" class="btn icon" data-newcust aria-label="' + esc(t('new_customer')) + '">' + icon('plus') + '</button></div>' +
        fld(t('site_name'), inp('name', s.name, 'text', 'required placeholder="' + esc(t('site_name_ph')) + '"')) +
        fld(t('address'), inp('address', s.address)) +
        '<fieldset><legend>' + esc(t('coords')) + '</legend><div class="grid2">' + fld(t('lat'), inp('lat', s.lat, 'number', 'step="any" required')) + fld(t('lng'), inp('lng', s.lng, 'number', 'step="any" required')) + '</div>' +
        '<div class="row"><button type="button" class="btn" data-gps>' + icon('pin', 16) + esc(t('use_my_location')) + '</button><a class="btn ghost" data-map target="_blank" rel="noopener" href="#">' + icon('map', 16) + esc(t('open_map')) + '</a></div>' +
        '<span class="hint small muted">' + esc(t('coords_hint')) + '</span>' +
        fld(t('radius_label'), inp('radius', s.radius, 'number', 'min="50" max="500" step="10" required')) + '</fieldset>' +
        '<fieldset><legend>' + esc(t('site_photos')) + (admin || !minP ? '' : ' *') + '</legend>' +
        '<label class="btn" style="align-self:flex-start">' + icon('camera', 16) + esc(t('take_photo')) + '<input type="file" accept="image/*" capture="environment" hidden id="sph"></label>' +
        '<div class="photos" id="sph-prev">' + old.map(p => '<a href="' + esc(p) + '" target="_blank" rel="noopener" class="ph-link">' + icon('camera', 18) + '</a>').join('') + '</div>' +
        '<span class="hint small muted">' + esc(t(admin ? 'site_photo_hint_admin' : 'site_photo_hint')) + '</span></fieldset>' +
        (admin ? '<div class="grid2">' + fld(t('foreman'), '<select name="foremanId">' + C.options(d.foremen, s.foremanId, 'id', null, '—') + '</select>') +
          fld(t('status'), sel('status', s.status || 'APPROVED', ['APPROVED', 'PENDING', 'CLOSED'].map(x => [x, t('site_' + x)]))) + '</div>' +
          '<fieldset><legend>' + esc(t('contract')) + '</legend><div class="grid2">' + fld(t('contract_no'), inp('contractNo', s.contractNo)) + fld(t('date'), inp('contractDate', s.contractDate, 'date')) + fld(t('amount'), inp('contractAmount', s.contractAmount, 'number', 'min="0" step="0.01"')) + '</div></fieldset>'
          : '<div class="notice">' + esc(t('site_needs_approval')) + '</div>') +
        '</form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t(admin ? 'save' : 'send_to_admin')) + '</button>'
    });
    const form = dlg.querySelector('#sf');
    const mapLink = dlg.querySelector('[data-map]');
    const syncMap = () => { const la = form.lat.value, lo = form.lng.value; mapLink.href = la && lo ? UB.mapUrl(la, lo) : '#'; };
    form.addEventListener('input', syncMap); syncMap();
    dlg.querySelector('[data-gps]').addEventListener('click', e => C.busy(e.currentTarget, async () => {
      const p = await C.getPosition(); form.lat.value = p.lat; form.lng.value = p.lng; syncMap();
      C.toast(t('gps_ok', { acc: p.acc }));
    }).catch(() => {}));
    const ph = dlg.querySelector('#sph'), prev = dlg.querySelector('#sph-prev');
    ph.addEventListener('change', async () => {
      const f = (ph.files || [])[0]; ph.value = '';
      if (!f || photos.length + old.length >= 5) return;
      try { photos.push(await C.compressImage(f, 1280, 0.72)); } catch (err) { return C.toast(t('err_bad_image'), true); }
      prev.insertAdjacentHTML('beforeend', '<img src="' + photos[photos.length - 1] + '" alt="">');
      // Şəkil çəkiləndə telefonun yeri (obyektin koordinatı ilə müqayisə üçün)
      C.getPosition().then(p => { photoPos = p; if (!form.lat.value) { form.lat.value = p.lat; form.lng.value = p.lng; syncMap(); } }).catch(() => {});
    });
    dlg.querySelector('[data-newcust]').addEventListener('click', () => F.customer(null, r => {
      const opt = document.createElement('option'); opt.value = r.id; opt.textContent = r.name; opt.selected = true; form.customerId.appendChild(opt);
    }));
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      if (!admin && photos.length + old.length < minP) return C.toast(t('err_photo_required'), true);
      const data = Object.assign({ id: s.id }, C.formData(form));
      const body = { site: data, photos, photoLat: photoPos ? photoPos.lat : '', photoLng: photoPos ? photoPos.lng : '' };
      await C.busy(e.currentTarget, () => UB.send('saveSite', body, t('qa_saveSite') + ': ' + data.name)).then(r => { dlg.close(); if (!r || !r.queued) { C.toast(t(admin ? 'saved' : 'site_sent')); UB.refresh(); } }).catch(() => {});
    });
  };

  /** Obyekt detalı: şəkil, xəritə düyməsi, smeta, ödənişlər, xərclər, nəticə (BR-36, BR-44). */
  F.siteDetail = function (s) {
    if (!s) return;
    const d = UB.data, admin = UB.isAdmin();
    const cust = UB.idx.customers[s.customerId] || {};
    const est = d.estimates.filter(e => e.siteId === s.id);
    const pays = d.payments.filter(p => p.siteId === s.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const exps = d.expenses.filter(x => x.siteId === s.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const estSum = est.reduce((a, e) => a + C.n(e.planQty) * C.n(e.clientPrice), 0);
    const done = d.summary && d.summary.siteDone ? C.n(d.summary.siteDone[s.id]) : 0;
    const paid = pays.filter(p => p.status === 'CLOSED' || p.status === 'SIGNED').reduce((a, p) => a + C.n(p.amount), 0);
    const base = C.n(s.contractAmount) || estSum;
    const photos = String(s.photos || '').split(' ').filter(Boolean);
    const pDist = s.photoLat ? Math.round(distKm(s.lat, s.lng, s.photoLat, s.photoLng) * 1000) : null;
    const warnM = C.n(d.settings.photoWarnM) || 200;
    const dlg = C.dialog({
      title: s.name,
      body: '<div class="row">' + UB.siteChip(s) + (s.returnReason ? '<span class="small muted">' + esc(s.returnReason) + '</span>' : '') + '</div>' +
        '<div class="kv"><span>' + esc(t('customer')) + '</span><span>' + esc(cust.name || '—') + (cust.phone ? ' · <span class="mono">' + esc(cust.phone) + '</span>' : '') + (cust.voen ? ' · ' + esc(t('voen')) + ' ' + esc(cust.voen) : '') + '</span>' +
        '<span>' + esc(t('address')) + '</span><span>' + esc(s.address || '—') + '</span>' +
        '<span>' + esc(t('coords')) + '</span><span class="row" style="gap:8px"><span class="mono small">' + esc(s.lat + ', ' + s.lng) + '</span><a class="btn sm" target="_blank" rel="noopener" href="' + esc(UB.mapUrl(s.lat, s.lng)) + '" data-mapbtn>' + icon('map', 14) + esc(t('open_map')) + '</a><span class="small muted">' + esc(t('radius_m', { m: s.radius })) + '</span></span>' +
        '<span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(s.foremanId)) + '</span>' +
        (s.contractNo ? '<span>' + esc(t('contract')) + '</span><span>№ ' + esc(s.contractNo) + ' · ' + esc(C.fmtDate(s.contractDate, true)) + ' · ' + C.money(s.contractAmount) + '</span>' : '') + '</div>' +
        (photos.length ? '<div class="photos">' + photos.map((p, i) => '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p) + '">' + icon('camera', 14) + esc(t('photo')) + ' ' + (i + 1) + '</a>').join('') + '</div>' : '<div class="small muted">' + esc(t('no_photos')) + '</div>') +
        (pDist !== null ? '<div class="notice' + (pDist > warnM ? ' warn' : '') + '">' + esc(t(pDist > warnM ? 'photo_far' : 'photo_near', { d: fmtDist(pDist) })) + '</div>' : '') +
        (admin ? '<div class="kpis"><div class="kpi"><div class="label">' + esc(s.contractAmount ? t('contract') : t('estimate_total')) + '</div><div class="value" style="font-size:20px">' + C.money(base) + '</div></div>' +
          '<div class="kpi"><div class="label">' + esc(t('work_done_value')) + '</div><div class="value" style="font-size:20px">' + C.money(done) + '</div></div>' +
          '<div class="kpi"><div class="label">' + esc(t('paid_by_customer')) + '</div><div class="value" style="font-size:20px">' + C.money(paid) + '</div></div>' +
          '<div class="kpi"><div class="label">' + esc(t('balance')) + '</div><div class="value" style="font-size:20px;color:' + (base - paid > 0 ? 'var(--warn)' : 'var(--ok)') + '">' + C.money(base - paid) + '</div></div></div>' +
          '<div id="site-result" class="small muted">' + esc(t('calculating')) + '</div>' +
          '<h3>' + esc(t('estimate')) + '</h3>' +
          (est.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('work_type')) + '</th><th class="num">' + esc(t('plan_qty')) + '</th><th class="num">' + esc(t('client_price')) + '</th><th class="num">' + esc(t('sum')) + '</th></tr></thead><tbody>' +
            est.map(e => '<tr><td>' + esc(UB.wtName(e.workTypeId)) + '</td><td class="num">' + C.num(e.planQty) + ' ' + esc(UB.wtUnit(e.workTypeId)) + '</td><td class="num">' + C.num(e.clientPrice) + '</td><td class="num">' + C.num(C.n(e.planQty) * C.n(e.clientPrice)) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="small muted">' + esc(t('no_estimate')) + '</div>') +
          '<form class="row" id="estf" style="align-items:flex-end"><div class="grow" style="min-width:160px">' + fld(t('work_type'), '<select name="workTypeId" required>' + C.options(d.workTypes, '', 'id', x => x.name + ' (' + x.unit + ')', '—') + '</select>') + '</div>' +
          '<div style="width:110px">' + fld(t('plan_qty'), inp('planQty', '', 'number', 'min="0" step="0.01"')) + '</div><div style="width:110px">' + fld(t('client_price'), inp('clientPrice', '', 'number', 'min="0" step="0.01" required')) + '</div>' +
          '<button type="submit" class="btn">' + icon('plus', 16) + esc(t('add')) + '</button></form>' : '') +
        '<div class="card-head"><h3>' + esc(t('customer_payments')) + '</h3><button type="button" class="btn sm" data-addpay>' + icon('plus', 14) + esc(t('add')) + '</button></div>' +
        (pays.length ? '<div class="list">' + pays.map(p => '<div class="list-row"><span class="mono muted small">' + esc(C.fmtDate(p.date, true)) + '</span><span class="grow small">' + esc((p.receiptNo ? p.receiptNo + ' · ' : '') + t('pm_' + (p.method || 'CASH')) + (p.note ? ' · ' + p.note : '')) + '</span>' + UB.moneyChip(p.status) + '<b class="mono">' + C.money(p.amount) + '</b></div>').join('') + '</div>' : '<div class="small muted">' + esc(t('no_data')) + '</div>') +
        '<div class="card-head"><h3>' + esc(t('expenses')) + '</h3><button type="button" class="btn sm" data-addexp>' + icon('plus', 14) + esc(t('add')) + '</button></div>' +
        (exps.length ? '<div class="list">' + exps.map(x => '<div class="list-row"><span class="mono muted small">' + esc(C.fmtDate(x.date, true)) + '</span><span class="grow small">' + esc(x.category + (x.note ? ' · ' + x.note : '')) + '</span><span class="chip ' + ({ APPROVED: 'ok', PENDING: '', RETURNED: 'bad', REJECTED: 'bad' }[x.status] || '') + '">' + esc(t('xs_' + x.status)) + '</span><b class="mono">' + C.money(x.amount) + '</b></div>').join('') + '</div>' : '<div class="small muted">' + esc(t('no_data')) + '</div>'),
      foot: (admin && s.status === 'PENDING' ? '<button type="button" class="btn danger" data-d="reject">' + esc(t('reject')) + '</button><button type="button" class="btn" data-d="return">' + esc(t('return')) + '</button><button type="button" class="btn ok" data-d="approve">' + esc(t('approve')) + '</button>' : '') +
        '<span class="grow"></span>' + (admin || s.status !== 'REJECTED' ? '<button type="button" class="btn" data-edit>' + icon('edit', 16) + esc(t('edit')) + '</button>' : '')
    });
    const ef = dlg.querySelector('#estf');
    if (ef) ef.addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(e.target);
      await C.busy(e.target.querySelector('button'), () => API.call('saveEstimate', { estimate: Object.assign({ siteId: s.id }, f) })).then(async () => { dlg.close(); await UB.refresh(true); F.siteDetail(UB.idx.sites[s.id]); }).catch(() => {});
    });
    dlg.querySelector('[data-addpay]').addEventListener('click', () => { dlg.close(); F.payment(null, s.id); });
    dlg.querySelector('[data-addexp]').addEventListener('click', () => { dlg.close(); F.expense(null, s.id); });
    const edit = dlg.querySelector('[data-edit]'); if (edit) edit.addEventListener('click', () => { dlg.close(); F.site(s); });
    dlg.querySelectorAll('.dlg-foot [data-d]').forEach(b => b.addEventListener('click', async () => { if (await decide('site', s.id, b.dataset.d, b)) dlg.close(); }));
    if (admin) API.call('siteResult', {}).then(rows => {
      const r = rows.find(x => x.siteId === s.id); const box = dlg.querySelector('#site-result'); if (!box) return;
      box.outerHTML = r ? siteResultCard(r) : '';
    }).catch(() => { const box = dlg.querySelector('#site-result'); if (box) box.textContent = ''; });
  };

  function distKm(a, b, c, d) { const R = 6371, k = Math.PI / 180; const x = Math.sin((C.n(c) - C.n(a)) * k / 2) ** 2 + Math.cos(C.n(a) * k) * Math.cos(C.n(c) * k) * Math.sin((C.n(d) - C.n(b)) * k / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }

  function siteResultCard(r) {
    const row = (k, v, strong, color) => '<span>' + esc(t(k)) + '</span><span class="mono" style="text-align:right' + (strong ? ';font-weight:700' : '') + (color ? ';color:' + color : '') + '">' + v + '</span>';
    const col = v => v < 0 ? 'var(--bad)' : 'var(--ok)';
    return '<section class="card tight" style="background:var(--card2)"><h3>' + esc(t('site_result_all')) + '</h3><div class="kv" style="grid-template-columns:1fr auto">' +
      row('sr_received', C.money(r.received)) + row('sr_expenses', '−' + C.money(r.expenses)) + row('sr_labor', '−' + C.money(r.labor)) +
      row('sr_cash', C.money(r.cashResult) + (r.cashMargin !== null ? ' · ' + C.num(r.cashMargin, 1) + '%' : ''), true, col(r.cashResult)) +
      row('sr_work_value', C.money(r.workValue)) + row('sr_work', C.money(r.workResult) + (r.workMargin !== null ? ' · ' + C.num(r.workMargin, 1) + '%' : ''), true, col(r.workResult)) +
      (r.debt !== null ? row('sr_debt', C.money(r.debt)) : '') + (r.openMoney ? row('sr_open', C.money(r.openMoney)) : '') + '</div></section>';
  }

  // =========================================================== money: payments, expenses, links (shared with foreman)
  /** Müştəridən alınan pul (BR-40). */
  F.payment = function (p, siteId) {
    const d = UB.data;
    p = Object.assign({ date: C.todayISO(), method: 'CASH', siteId: siteId || '' }, p || {});
    const sites = d.sites.filter(s => s.status === 'APPROVED' || s.id === p.siteId);
    const dlg = C.dialog({
      title: p.id ? t('fix_payment') : t('new_payment'),
      body: (p.returnReason ? '<div class="notice warn">' + esc(t('return_reason')) + ': ' + esc(p.returnReason) + '</div>' : '') +
        (p.status === 'RETURNED' && p.confirmedAmount ? '<div class="notice">' + esc(t('conflict_amounts', { a: C.money(p.amount), b: C.money(p.confirmedAmount) })) + '</div>' : '') +
        '<form class="form" id="pf">' + fld(t('site'), '<select name="siteId" required>' + C.options(sites, p.siteId, 'id', s => s.name + ' · ' + ((UB.idx.customers[s.customerId] || {}).name || ''), '—') + '</select>') +
        '<div class="grid2">' + fld(t('amount') + ' (₼)', inp('amount', p.amount, 'number', 'min="0.01" step="0.01" required inputmode="decimal"')) + fld(t('date'), inp('date', p.date, 'date', 'required')) +
        fld(t('pay_method'), sel('method', p.method, [['CASH', t('pm_CASH')], ['TRANSFER', t('pm_TRANSFER')]])) + '</div>' +
        fld(t('note'), inp('note', p.note)) + '<div class="small muted" id="pf-cust"></div>' +
        (UB.isAdmin() ? '' : '<div class="notice">' + esc(t('payment_flow_hint')) + '</div>') + '</form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t(UB.isAdmin() ? 'save' : 'send_to_admin')) + '</button>'
    });
    const form = dlg.querySelector('#pf');
    const cust = () => { const c = UB.customerOfSite(form.siteId.value); dlg.querySelector('#pf-cust').textContent = c.name ? t('customer') + ': ' + c.name + (c.phone ? ' · ' + c.phone : ' · ' + t('no_phone')) : ''; };
    form.siteId.addEventListener('change', cust); cust();
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      const data = Object.assign({ id: p.id }, C.formData(form));
      await C.busy(e.currentTarget, () => API.call('addPayment', { payment: data })).then(() => { dlg.close(); C.toast(t(UB.isAdmin() ? 'saved' : 'sent_to_admin')); UB.refresh(); }).catch(() => {});
    });
  };

  /** Xərc (BR-43): müştəri → obyekt, kateqoriya, məbləğ, tarix, qeyd, qəbz şəkli. */
  F.expense = function (x, siteId) {
    const d = UB.data;
    x = Object.assign({ date: C.todayISO(), siteId: siteId || '' }, x || {});
    const cats = UB.list('expenseCategories');
    const sites = d.sites.filter(s => s.status === 'APPROVED' || s.id === x.siteId);
    let photos = [];
    const dlg = C.dialog({
      title: x.id ? t('fix_expense') : t('new_expense'),
      body: (x.returnReason ? '<div class="notice warn">' + esc(t('return_reason')) + ': ' + esc(x.returnReason) + '</div>' : '') +
        '<form class="form" id="xf">' + fld(t('site'), '<select name="siteId" required>' + C.options(sites, x.siteId, 'id', s => s.name + ' · ' + ((UB.idx.customers[s.customerId] || {}).name || ''), '—') + '</select>') +
        '<div class="grid2">' + fld(t('category'), sel('category', x.category || cats[0], cats.map(c => [c, c]))) + fld(t('amount') + ' (₼)', inp('amount', x.amount, 'number', 'min="0.01" step="0.01" required inputmode="decimal"')) +
        fld(t('date'), inp('date', x.date, 'date', 'required')) + '</div>' + fld(t('note'), inp('note', x.note)) +
        '<div class="field"><span>' + esc(t('receipt_photo')) + '</span><label class="btn" style="align-self:flex-start">' + icon('camera', 16) + esc(t('take_photo')) + '<input type="file" accept="image/*" capture="environment" hidden id="xph"></label><div class="photos" id="xph-prev"></div></div></form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t(UB.isAdmin() ? 'save' : 'send_to_admin')) + '</button>'
    });
    const form = dlg.querySelector('#xf');
    const ph = dlg.querySelector('#xph');
    ph.addEventListener('change', async () => {
      const f = (ph.files || [])[0]; ph.value = ''; if (!f || photos.length >= 3) return;
      try { photos.push(await C.compressImage(f, 1280, 0.7)); dlg.querySelector('#xph-prev').insertAdjacentHTML('beforeend', '<img src="' + photos[photos.length - 1] + '" alt="">'); } catch (err) { C.toast(t('err_bad_image'), true); }
    });
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      const data = Object.assign({ id: x.id }, C.formData(form));
      await C.busy(e.currentTarget, () => UB.send('saveExpense', { expense: data, photos }, t('qa_saveExpense') + ': ' + C.money(data.amount))).then(r => { dlg.close(); if (!r || !r.queued) { C.toast(t(UB.isAdmin() ? 'saved' : 'sent_to_admin')); UB.refresh(); } }).catch(() => {});
    });
  };

  /** Pul linki (avans → usta, ödəniş → müştəri): WhatsApp-da göndərilir, alanın dilində (BR-38, BR-40, BR-66). */
  F.moneyLink = async function (kind, r, btn) {
    const res = await C.busy(btn, () => API.call('moneyLink', { kind, id: r.id })).catch(() => null);
    if (!res) return;
    const L = res.lang || 'az';
    const url = C.linkUrl(res.token);
    const co = UB.data.settings.companyName || 'Ustabaşı';
    const text = kind === 'ADV'
      ? t('wa_adv', { name: String(res.name).split(' ')[0], company: co, url, h: UB.data.settings.moneyLinkHours || 24 }, L)
      : t('wa_pay', { name: res.name, company: co, site: UB.siteName(r.siteId), date: r.date, url, h: UB.data.settings.moneyLinkHours || 24 }, L);
    const max = C.n(UB.data.settings.maxMoneyLinks) || 3;
    const dlg = C.dialog({
      title: t('money_link_title'),
      body: '<div class="small mono" style="word-break:break-all;color:var(--muted)">' + esc(url) + '</div>' +
        '<div class="small muted">' + esc(t(res.reused ? 'link_reused' : 'money_link_hint', { n: res.linkCount + (res.reused ? 0 : 1), max, h: UB.data.settings.moneyLinkHours || 24 })) + '</div>' +
        '<button type="button" class="btn primary big block" data-wa>' + icon('chat', 18) + esc(t('send_whatsapp')) + '</button><button type="button" class="btn" data-copy>' + icon('copy', 16) + esc(t('copy')) + '</button>',
      onClose: () => UB.refresh(true)
    });
    dlg.querySelector('[data-wa]').addEventListener('click', () => C.whatsapp(res.phone, text));
    dlg.querySelector('[data-copy]').addEventListener('click', () => C.copyText(text));
  };

  /** Konflikt (BR-39, S-17): sahə rəisinə qaytar · təsdiqləyənin məbləğini qəbul et · ləğv et. */
  F.conflict = function (type, r) {
    const who = type === 'adv' ? UB.workerName(r.workerId) : (UB.customerOfSite(r.siteId).name || '');
    const dlg = C.dialog({
      title: t('conflict') + ' · ' + who,
      body: '<div class="kv wide"><span>' + esc(t('type')) + '</span><span>' + esc(t(type === 'adv' ? 'tag_adv' : 'tag_pay')) + '</span>' +
        '<span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(r.foremanId)) + '</span>' +
        '<span>' + esc(t('foreman_amount')) + '</span><span class="mono">' + C.money(r.amount) + '</span>' +
        '<span>' + esc(t(type === 'adv' ? 'worker_amount' : 'customer_amount')) + '</span><span class="mono">' + C.money(r.confirmedAmount) + '</span>' +
        '<span>' + esc(t('difference')) + '</span><span class="mono" style="color:var(--bad)">' + C.money(C.n(r.confirmedAmount) - C.n(r.amount)) + '</span>' +
        '<span>' + esc(t('date')) + '</span><span>' + esc(dt(r.confirmedAt)) + '</span></div>' +
        '<label class="field"><span>' + esc(t('reason')) + ' *</span><textarea name="reason" required></textarea></label>',
      foot: '<button type="button" class="btn danger" data-op="cancel">' + esc(t('c_cancel')) + '</button><button type="button" class="btn" data-op="accept">' + esc(t('c_accept')) + '</button><button type="button" class="btn primary" data-op="return">' + esc(t('c_return')) + '</button>'
    });
    dlg.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', async () => {
      const reason = dlg.querySelector('[name=reason]').value.trim();
      if (!reason) { dlg.querySelector('[name=reason]').focus(); return C.toast(t('err_reason_required'), true); }
      await C.busy(b, () => API.call('resolveConflict', { type, id: r.id, op: b.dataset.op, reason })).then(() => { dlg.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    }));
  };

  /** Pul əməliyyatının növbəti addımı üçün düymələr (admin və sahə rəisi). */
  UB.moneyActions = function (kind, r) {
    const type = kind === 'ADV' ? 'adv' : 'pay';
    const lk = UB.linkInfo(r.id);
    const b = [];
    if (kind === 'ADV' && r.status === 'APPROVED') b.push('<button type="button" class="btn sm primary" data-ma="given" data-id="' + esc(r.id) + '">' + esc(t('mark_given')) + '</button>');
    if ((kind === 'ADV' && ['GIVEN', 'LINK_SENT', 'LINK_EXPIRED'].indexOf(r.status) >= 0) || (kind === 'PAY' && ['APPROVED', 'LINK_SENT', 'LINK_EXPIRED'].indexOf(r.status) >= 0))
      b.push('<button type="button" class="btn sm' + (r.status === 'LINK_SENT' ? '' : ' primary') + '" data-ma="link" data-k="' + kind + '" data-id="' + esc(r.id) + '">' + icon('chat', 14) + esc(t(r.status === 'LINK_SENT' ? 'resend_link' : 'send_link_money')) + '</button>');
    if (r.status === 'CLOSED' || r.status === 'SIGNED') b.push('<button type="button" class="btn sm" data-ma="pdf" data-k="' + kind + '" data-id="' + esc(r.id) + '">' + icon('receipt', 14) + 'PDF</button>');
    if (UB.isAdmin() && r.status === 'CONFLICT') b.push('<button type="button" class="btn sm danger" data-ma="conflict" data-k="' + kind + '" data-id="' + esc(r.id) + '">' + esc(t('resolve')) + '</button>');
    if (UB.isAdmin() && kind === 'PAY' && ['APPROVED', 'LINK_SENT', 'LINK_EXPIRED'].indexOf(r.status) >= 0) b.push('<button type="button" class="btn sm" data-ma="manual" data-id="' + esc(r.id) + '">' + esc(t('close_manual')) + '</button>');
    if (UB.isAdmin() && ['APPROVED', 'GIVEN', 'LINK_SENT', 'LINK_EXPIRED'].indexOf(r.status) >= 0) b.push('<button type="button" class="btn sm ghost" data-act="dec" data-d="reject" data-type="' + type + '" data-id="' + esc(r.id) + '">' + esc(t('reject')) + '</button>');
    if (!UB.isAdmin() && r.status === 'RETURNED') b.push('<button type="button" class="btn sm primary" data-ma="fix" data-k="' + kind + '" data-id="' + esc(r.id) + '">' + icon('edit', 14) + esc(t('fix')) + '</button>');
    const info = lk && r.status === 'LINK_SENT' ? '<span class="tiny muted">' + esc(t('ls_' + lk.status)) + ' · ' + esc(t('until', { t: dt(lk.expires) })) + '</span>' : '';
    return b.length || info ? '<div class="row" style="margin-top:8px;gap:6px">' + b.join('') + info + '</div>' : '';
  };
  UB.moneyHandlers = {
    given: el => C.busy(el, () => API.call('markAdvance', { id: el.dataset.id, status: 'GIVEN' })).then(() => { C.toast(t('saved')); UB.refresh(); }).catch(() => {}),
    link: el => { const kind = el.dataset.k; const r = (kind === 'ADV' ? UB.data.advances : UB.data.payments).find(x => x.id === el.dataset.id); if (r) F.moneyLink(kind, r, el); },
    pdf: el => { const kind = el.dataset.k; const r = (kind === 'ADV' ? UB.data.advances : UB.data.payments).find(x => x.id === el.dataset.id); if (r) UB.sendPdf(kind, r, el).catch(() => {}); },
    conflict: el => { const kind = el.dataset.k; const r = (kind === 'ADV' ? UB.data.advances : UB.data.payments).find(x => x.id === el.dataset.id); if (r) F.conflict(kind === 'ADV' ? 'adv' : 'pay', r); },
    manual: async el => {
      const reason = await C.promptDlg(t('close_manual'), t('close_manual_q'), { textarea: true, ok: t('close_manual') });
      if (reason === null) return;
      C.busy(el, () => API.call('closePaymentManual', { id: el.dataset.id, reason })).then(() => { C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    },
    fix: el => { const kind = el.dataset.k; if (kind === 'ADV') UB.advanceForm(null, UB.data.advances.find(x => x.id === el.dataset.id)); else F.payment(UB.data.payments.find(x => x.id === el.dataset.id)); }
  };
  /** data-ma düymələri üçün ümumi bağlayıcı. */
  UB.bindMoney = function (root) {
    root.addEventListener('click', e => {
      const el = e.target.closest('[data-ma]');
      if (!el || !root.contains(el)) return;
      e.preventDefault(); e.stopPropagation();
      UB.moneyHandlers[el.dataset.ma](el);
    });
  };

  // =========================================================== approvals: 7 tab, 3 qərar
  S.approvals = function (view, route) {
    const d = UB.data, cnt = UB.counts();
    const order = [['work', 'work'], ['adv', 'adv'], ['pay', 'pay'], ['exp', 'exp'], ['att', 'att'], ['site', 'sites'], ['phone', 'phone']];
    const tab = route.q.tab || (order.find(o => cnt[o[1]]) || ['work'])[0];
    const tabs = order.map(o => [o[0], t('tab_' + o[0]), cnt[o[1]]]);
    const empty = '<div class="card"><div class="empty">' + esc(t('nothing_pending')) + '</div></div>';
    let body = '';
    if (tab === 'work') {
      const list = d.entries.filter(e => e.status === 'ADMIN_PENDING').sort((a, b) => a.date.localeCompare(b.date));
      const waiting = d.entries.filter(e => e.status === 'USTA_PENDING');
      body = list.map(e => {
        const shares = d.shares.filter(s => s.entryId === e.id);
        const photos = String(e.photos || '').split(' ').filter(Boolean);
        const wt = UB.idx.workTypes[e.workTypeId] || {};
        return '<section class="card"><div class="card-head"><div><span class="tag accent">' + esc(t('tag_work')) + '</span> <b style="margin-left:8px">' + esc(UB.wtName(e.workTypeId)) + ' · ' + C.num(e.qty) + ' ' + esc(UB.wtUnit(e.workTypeId)) + '</b></div><span class="small muted">' + esc(C.fmtDate(e.date, true)) + '</span></div>' +
          '<div class="kv"><span>' + esc(t('site')) + '</span><span>' + esc(UB.siteName(e.siteId)) + '</span><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(e.foremanId)) + '</span>' + (wt.normType ? '<span>' + esc(t('norm')) + '</span><span>' + C.num(wt.normQty) + ' ' + esc(wt.unit) + ' / ' + esc(t('nt_' + wt.normType)) + '</span>' : '') + (e.note ? '<span>' + esc(t('note')) + '</span><span>' + esc(e.note) + '</span>' : '') + '</div>' +
          '<div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('worker')) + '</th><th class="num">' + esc(t('share')) + '</th><th class="num">' + esc(t('qty')) + '</th><th>' + esc(t('worker_confirm')) + '</th></tr></thead><tbody>' +
          shares.map(s => '<tr><td>' + esc(UB.workerName(s.workerId)) + '</td><td class="num">' + C.num(s.share) + '%</td><td class="num">' + C.num(C.n(e.qty) * C.n(s.share) / 100) + '</td><td>' + (s.confirmedAt ? '<span class="chip ok">✓ ' + esc(C.fmtTime(s.confirmedAt)) + '</span>' : '—') + '</td></tr>').join('') + '</tbody></table></div>' +
          (photos.length ? '<div class="row">' + photos.map((p, i) => '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p) + '">' + icon('camera', 14) + esc(t('photo')) + ' ' + (i + 1) + '</a>').join('') + '</div>' : '') +
          decBtns('work', e.id) + '</section>';
      }).join('') || empty;
      if (waiting.length) body += '<section class="card"><h2>' + esc(t('waiting_workers')) + '</h2><div class="list">' + waiting.map(e => '<div class="list-row"><div class="grow"><div class="title">' + esc(UB.wtName(e.workTypeId)) + ' · ' + C.num(e.qty) + ' ' + esc(UB.wtUnit(e.workTypeId)) + '</div><div class="meta">' + esc(sharesText(e) + ' · ' + UB.siteName(e.siteId) + ' · ' + C.fmtDate(e.date)) + '</div></div><button type="button" class="btn sm" data-act="force" data-id="' + esc(e.id) + '">' + esc(t('approve_direct')) + '</button></div>').join('') + '</div></section>';
    }
    if (tab === 'adv') {
      body = d.advances.filter(a => a.status === 'PENDING').map(a => {
        const w = UB.idx.workers[a.workerId] || {};
        const monthUsed = d.advances.filter(x => x.workerId === a.workerId && x.id !== a.id && ['CLOSED', 'SIGNED', 'APPROVED', 'GIVEN', 'LINK_SENT'].indexOf(x.status) >= 0 && String(x.approvedAt || x.created).slice(0, 7) === d.month).reduce((s, x) => s + C.n(x.amount), 0);
        return '<section class="card"><div class="card-head"><div><span class="tag warn">' + esc(t('tag_adv')) + '</span> <b style="margin-left:8px">' + C.money(a.amount) + ' · ' + esc(w.name || '') + '</b></div>' + (a.overLimit === 'yes' ? '<span class="chip warn">' + esc(t('over_limit')) + '</span>' : '<span class="chip ok">' + esc(t('within_limit')) + '</span>') + '</div>' +
          '<div class="kv"><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(a.foremanId)) + '</span><span>' + esc(t('reason')) + '</span><span>' + esc(a.reason || '—') + '</span><span>' + esc(t('month_adv')) + '</span><span class="mono">' + C.money(monthUsed) + '</span><span>' + esc(t('pay')) + '</span><span>' + esc(payLabel(w)) + ' · ' + C.money(w.baseAmount) + '</span></div>' +
          decBtns('adv', a.id) + '</section>';
      }).join('') || empty;
    }
    if (tab === 'pay') {
      body = d.payments.filter(p => p.status === 'PENDING').map(p => {
        const c = UB.customerOfSite(p.siteId);
        return '<section class="card"><div class="card-head"><div><span class="tag">' + esc(t('tag_pay')) + '</span> <b style="margin-left:8px">' + C.money(p.amount) + ' · ' + esc(c.name || '') + '</b></div><span class="small muted">' + esc(C.fmtDate(p.date, true)) + '</span></div>' +
          '<div class="kv"><span>' + esc(t('site')) + '</span><span>' + esc(UB.siteName(p.siteId)) + '</span><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(p.foremanId)) + '</span><span>' + esc(t('pay_method')) + '</span><span>' + esc(t('pm_' + (p.method || 'CASH'))) + '</span>' + (p.note ? '<span>' + esc(t('note')) + '</span><span>' + esc(p.note) + '</span>' : '') + '<span>' + esc(t('phone')) + '</span><span>' + esc(c.phone || t('no_phone')) + '</span></div>' +
          decBtns('pay', p.id) + '</section>';
      }).join('') || empty;
    }
    if (tab === 'exp') {
      body = d.expenses.filter(x => x.status === 'PENDING').map(x => {
        const photos = String(x.photos || '').split(' ').filter(Boolean);
        return '<section class="card"><div class="card-head"><div><span class="tag">' + esc(t('tag_exp')) + '</span> <b style="margin-left:8px">' + C.money(x.amount) + ' · ' + esc(x.category) + '</b></div><span class="small muted">' + esc(C.fmtDate(x.date, true)) + '</span></div>' +
          '<div class="kv"><span>' + esc(t('site')) + '</span><span>' + esc(UB.siteName(x.siteId)) + ' · ' + esc(UB.customerOfSite(x.siteId).name || '') + '</span><span>' + esc(t('by')) + '</span><span>' + esc(UB.foremanName(x.by)) + '</span>' + (x.note ? '<span>' + esc(t('note')) + '</span><span>' + esc(x.note) + '</span>' : '') + '</div>' +
          (photos.length ? '<div class="row">' + photos.map((p, i) => '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p) + '">' + icon('camera', 14) + esc(t('receipt_photo')) + ' ' + (i + 1) + '</a>').join('') + '</div>' : '<div class="small muted">' + esc(t('no_photos')) + '</div>') +
          decBtns('exp', x.id) + '</section>';
      }).join('') || empty;
    }
    if (tab === 'att') {
      body = d.attendance.filter(a => a.status === 'PENDING').map(a => '<section class="card"><div class="card-head"><b>' + esc(t(a.kind === 'IN' ? 'kind_in' : 'kind_out')) + ' · ' + esc(UB.workerName(a.workerId)) + '</b><span class="mono muted">' + esc(C.fmtDate(a.date) + ' ' + C.fmtTime(a.ts)) + '</span></div>' +
        '<div class="kv"><span>' + esc(t('site')) + '</span><span>' + esc(UB.siteName(a.siteId)) + '</span><span>' + esc(t('reason')) + '</span><span>' + esc(a.reason) + '</span><span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName((UB.idx.workers[a.workerId] || {}).foremanId)) + '</span></div>' + decBtns('att', a.id) + '</section>').join('') || empty;
    }
    if (tab === 'site') {
      const warnM = C.n(d.settings.photoWarnM) || 200;
      body = d.sites.filter(s => s.status === 'PENDING').map(s => {
        const photos = String(s.photos || '').split(' ').filter(Boolean);
        const pd = s.photoLat ? Math.round(distKm(s.lat, s.lng, s.photoLat, s.photoLng) * 1000) : null;
        return '<section class="card"><div class="card-head"><b>' + esc(s.name) + '</b><span class="chip warn">' + esc(t('site_PENDING')) + '</span></div>' +
          '<div class="kv"><span>' + esc(t('customer')) + '</span><span>' + esc((UB.idx.customers[s.customerId] || {}).name || '—') + '</span><span>' + esc(t('address')) + '</span><span>' + esc(s.address || '—') + '</span>' +
          '<span>' + esc(t('coords')) + '</span><span class="row" style="gap:8px"><span class="mono small">' + esc(s.lat + ', ' + s.lng) + '</span><a class="btn sm" target="_blank" rel="noopener" href="' + esc(UB.mapUrl(s.lat, s.lng)) + '">' + icon('map', 14) + esc(t('open_map')) + '</a><span class="small muted">' + esc(t('radius_m', { m: s.radius })) + '</span></span>' +
          '<span>' + esc(t('foreman')) + '</span><span>' + esc(UB.foremanName(s.foremanId)) + '</span></div>' +
          (photos.length ? '<div class="row">' + photos.map((p, i) => '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p) + '">' + icon('camera', 14) + esc(t('photo')) + ' ' + (i + 1) + '</a>').join('') + '</div>' : '<div class="notice warn">' + esc(t('no_photos')) + '</div>') +
          (pd !== null ? '<div class="notice' + (pd > warnM ? ' warn' : '') + '">' + esc(t(pd > warnM ? 'photo_far' : 'photo_near', { d: fmtDist(pd) })) + '</div>' : '') +
          decBtns('site', s.id) + '</section>';
      }).join('') || empty;
    }
    if (tab === 'phone') {
      body = d.customers.filter(c => c.pendingPhone).map(c => '<section class="card"><div class="card-head"><b>' + esc(c.name) + '</b><span class="chip warn">' + esc(t('phone_pending')) + '</span></div>' +
        '<div class="kv"><span>' + esc(t('old_phone')) + '</span><span class="mono">' + esc(c.phone || '—') + '</span><span>' + esc(t('new_phone')) + '</span><span class="mono">' + esc(c.pendingPhone) + '</span><span>' + esc(t('sites')) + '</span><span>' + esc(d.sites.filter(s => s.customerId === c.id).map(s => s.name).join(', ')) + '</span></div>' +
        '<div class="small muted">' + esc(t('phone_change_hint')) + '</div>' + decBtns('cphone', c.id) + '</section>').join('') || empty;
    }
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_approvals')) + '</h1>' + (cnt.conflicts ? '<a class="btn danger" href="#/money?tab=conflicts">' + icon('alert', 16) + esc(t('n_conflicts', { n: cnt.conflicts })) + '</a>' : '') + '</div>' +
      '<div class="tabs" role="tablist">' + tabs.map(x => '<button role="tab" data-act="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + esc(x[1]) + (x[2] ? ' <span class="badge">' + x[2] + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="stack">' + body + '</div>';
    C.bind(view, {
      tab: el => UB.go('#/approvals?tab=' + el.dataset.tab),
      dec: decHandler,
      force: async el => {
        if (!await C.confirmDlg(t('approve_direct_q'), t('approve'))) return;
        decide('work', el.dataset.id, 'approve', el, true);
      }
    });
  };

  // =========================================================== money (admin): avanslar, ödənişlər, xərclər, konfliktlər
  S.money = function (view, route) {
    const d = UB.data, cnt = UB.counts();
    const tab = route.q.tab || (cnt.conflicts ? 'conflicts' : 'adv');
    const q = route.q.s || '';
    const tabs = [['conflicts', t('tab_conflicts'), cnt.conflicts], ['adv', t('tab_adv'), 0], ['pay', t('tab_pay'), 0], ['exp', t('tab_exp'), 0]];
    let body = '';
    const filt = (list, st) => q ? list.filter(st) : list;
    if (tab === 'conflicts') {
      const rows = d.advances.filter(a => a.status === 'CONFLICT').map(a => ({ k: 'ADV', r: a, who: UB.workerName(a.workerId) }))
        .concat(d.payments.filter(p => p.status === 'CONFLICT').map(p => ({ k: 'PAY', r: p, who: UB.customerOfSite(p.siteId).name || '' })));
      body = rows.length ? '<section class="card"><div class="table-wrap"><table class="t" style="min-width:720px"><thead><tr><th>' + esc(t('type')) + '</th><th>' + esc(t('date')) + '</th><th>' + esc(t('foreman')) + '</th><th>' + esc(t('worker_or_customer')) + '</th><th class="num">' + esc(t('foreman_amount')) + '</th><th class="num">' + esc(t('confirmed_amount')) + '</th><th class="num">' + esc(t('difference')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(x => '<tr><td><span class="tag ' + (x.k === 'ADV' ? 'warn' : '') + '">' + esc(t(x.k === 'ADV' ? 'tag_adv' : 'tag_pay')) + '</span></td><td class="small">' + esc(dt(x.r.confirmedAt)) + '<div class="tiny muted">' + esc(t('open_days', { n: Math.max(0, Math.round((Date.now() - Date.parse(x.r.confirmedAt)) / 86400000)) })) + '</div></td><td>' + esc(C.shortName(UB.foremanName(x.r.foremanId))) + '</td><td>' + esc(x.who) + '</td><td class="num">' + C.num(x.r.amount) + '</td><td class="num">' + C.num(x.r.confirmedAmount) + '</td><td class="num" style="color:var(--bad)">' + C.num(C.n(x.r.confirmedAmount) - C.n(x.r.amount)) + '</td><td><button type="button" class="btn sm danger" data-ma="conflict" data-k="' + x.k + '" data-id="' + esc(x.r.id) + '">' + esc(t('resolve')) + '</button></td></tr>').join('') +
        '</tbody></table></div></section>' : '<div class="card"><div class="empty">' + esc(t('no_conflicts')) + '</div></div>';
    }
    if (tab === 'adv') {
      const list = filt(d.advances.slice(), a => a.status === q).sort((a, b) => String(b.created).localeCompare(String(a.created)));
      body = statusFilter(['', 'PENDING', 'APPROVED', 'GIVEN', 'LINK_SENT', 'LINK_EXPIRED', 'CLOSED', 'RETURNED', 'REJECTED'], q, 'adv') +
        '<section class="card" style="gap:4px"><div class="list">' + (list.map(a => '<div class="list-row"><div class="grow"><div class="title">' + C.money(a.amount) + ' · ' + esc(UB.workerName(a.workerId)) + '</div><div class="meta">' + esc(C.fmtDate(a.created) + ' · ' + C.shortName(UB.foremanName(a.foremanId)) + (a.receiptNo ? ' · ' + a.receiptNo : '') + (a.reason ? ' · ' + a.reason : '') + (a.resolution ? ' · ' + a.resolution : '')) + '</div>' + UB.moneyActions('ADV', a) + '</div>' + UB.moneyChip(a.status) + '</div>').join('') || '<div class="empty">' + esc(t('no_data')) + '</div>') + '</div></section>';
    }
    if (tab === 'pay') {
      const list = filt(d.payments.slice(), p => p.status === q).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      body = '<div class="row"><button type="button" class="btn primary" data-act="newPay">' + icon('plus', 16) + esc(t('new_payment')) + '</button></div>' + statusFilter(['', 'PENDING', 'APPROVED', 'LINK_SENT', 'LINK_EXPIRED', 'CLOSED', 'RETURNED', 'REJECTED'], q, 'pay') +
        '<section class="card" style="gap:4px"><div class="list">' + (list.map(p => '<div class="list-row"><div class="grow"><div class="title">' + C.money(p.amount) + ' · ' + esc(UB.customerOfSite(p.siteId).name || '') + '</div><div class="meta">' + esc(C.fmtDate(p.date, true) + ' · ' + UB.siteName(p.siteId) + ' · ' + t('pm_' + (p.method || 'CASH')) + (p.receiptNo ? ' · ' + p.receiptNo : '') + (p.closedNote ? ' · ' + p.closedNote : '')) + '</div>' + UB.moneyActions('PAY', p) + '</div>' + UB.moneyChip(p.status) + '</div>').join('') || '<div class="empty">' + esc(t('no_data')) + '</div>') + '</div></section>';
    }
    if (tab === 'exp') {
      const list = filt(d.expenses.slice(), x => x.status === q).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const sum = list.filter(x => x.status === 'APPROVED').reduce((s, x) => s + C.n(x.amount), 0);
      body = '<div class="row"><button type="button" class="btn primary" data-act="newExp">' + icon('plus', 16) + esc(t('new_expense')) + '</button><span class="grow"></span><span class="muted small">' + esc(t('approved_sum', { v: C.money(sum) })) + '</span></div>' + statusFilter(['', 'PENDING', 'APPROVED', 'RETURNED', 'REJECTED'], q, 'exp', 'xs_') +
        '<section class="card" style="gap:4px"><div class="list">' + (list.map(x => '<div class="list-row"><div class="grow"><div class="title">' + C.money(x.amount) + ' · ' + esc(x.category) + '</div><div class="meta">' + esc(C.fmtDate(x.date, true) + ' · ' + UB.siteName(x.siteId) + ' · ' + (UB.customerOfSite(x.siteId).name || '') + (x.note ? ' · ' + x.note : '')) + '</div></div><span class="chip ' + ({ APPROVED: 'ok', RETURNED: 'bad', REJECTED: 'bad' }[x.status] || '') + '">' + esc(t('xs_' + x.status)) + '</span></div>').join('') || '<div class="empty">' + esc(t('no_data')) + '</div>') + '</div></section>';
    }
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_money')) + '</h1></div>' +
      '<div class="tabs" role="tablist">' + tabs.map(x => '<button role="tab" data-act="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + esc(x[1]) + (x[2] ? ' <span class="badge">' + x[2] + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="stack">' + body + '</div>';
    UB.bindMoney(view);
    C.bind(view, {
      tab: el => UB.go('#/money?tab=' + el.dataset.tab),
      sf: el => UB.go('#/money?tab=' + el.dataset.tab + (el.dataset.s ? '&s=' + el.dataset.s : '')),
      newPay: () => F.payment(), newExp: () => F.expense(),
      dec: decHandler
    });
  };
  function statusFilter(list, cur, tab, prefix) {
    return '<div class="seg chips">' + list.map(s => '<button type="button" data-act="sf" data-tab="' + tab + '" data-s="' + s + '" aria-pressed="' + (cur === s) + '">' + esc(s ? t((prefix || 'ms_') + s) : t('all')) + '</button>').join('') + '</div>';
  }

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
    const sum = k => lines.reduce((s, l) => s + C.n(l[k]), 0);
    const paidN = lines.filter(l => l.paid === 'yes').length;
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('nav_payroll')) + '</h1><div class="sub">' + esc(closed ? t('closed_view_only') : t('not_closed_hint')) + '</div></div>' + monthNav(month, 'month') + '</div>' +
      (closed && r.archiveUrl ? '<a class="notice" target="_blank" rel="noopener" href="' + esc(r.archiveUrl) + '" style="display:block;color:var(--text)">' + icon('download', 14) + ' ' + esc(t('archive_copy')) + ' →</a>' : '') +
      '<div class="cols"><section class="card col-1"><h2>' + esc(t('plan_days')) + '</h2><form class="row" id="pdf" style="flex-wrap:nowrap"><input class="inp" name="days" type="number" min="1" max="31" value="' + esc(plan || '') + '" ' + (closed ? 'disabled' : 'required') + ' style="width:100px" aria-label="' + esc(t('plan_days')) + '"><button class="btn" type="submit" ' + (closed ? 'disabled' : '') + '>' + esc(t('save')) + '</button></form><div class="small muted">' + esc(t('plan_days_hint')) + '</div></section>' +
      '<div class="kpis col-3"><div class="kpi"><div class="label">' + esc(t('col_total')) + '</div><div class="value">' + C.money(sum('total')) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('col_bonus')) + '</div><div class="value">' + C.money(sum('bonus')) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('col_adv')) + '</div><div class="value">' + C.money(sum('advance')) + '</div></div>' +
      (closed ? '<div class="kpi"><div class="label">' + esc(t('paid')) + '</div><div class="value">' + paidN + '<small> / ' + lines.length + '</small></div></div>' : '') + '</div></div>' +
      '<div class="row"><a class="btn" href="#/print/payroll/' + month + '">' + icon('print', 16) + esc(t('print')) + '</a><a class="btn" href="#/print/advances/' + month + '">' + icon('print', 16) + esc(t('print_adv')) + '</a><button type="button" class="btn" data-act="csv">' + icon('download', 16) + 'CSV</button><span class="grow"></span>' +
      (closed ? '' : '<button type="button" class="btn primary" data-act="close" ' + (plan ? '' : 'disabled title="' + esc(t('err_no_plan_days')) + '"') + '>' + esc(t('close_month')) + '</button>') + '</div>' +
      '<section class="card"><div class="table-wrap"><table class="t" style="min-width:900px"><thead><tr><th>' + esc(t('name')) + '</th><th>' + esc(t('pay')) + '</th><th class="num">' + esc(t('days')) + '</th><th class="num">' + esc(t('col_std')) + '</th><th class="num">' + esc(t('col_bonus')) + '</th><th class="num">' + esc(t('col_adv')) + '</th><th class="num">' + esc(t('col_pen')) + '</th><th class="num">' + esc(t('col_corr')) + '</th><th class="num">' + esc(t('col_total')) + '</th><th>' + esc(closed ? t('paid') : t('notes')) + '</th></tr></thead><tbody>' +
      lines.map(l => '<tr class="click" data-act="line" data-id="' + esc(l.personId) + '"><td><b>' + esc(l.name) + '</b>' + (l.personType === 'FOREMAN' ? ' <span class="chip">' + esc(t('foreman')) + '</span>' : '') + '</td><td class="small">' + esc(payLabel(l)) + '</td><td class="num">' + (l.personType === 'FOREMAN' ? '—' : esc(l.daysWorked) + (l.payType === 'MONTH' ? '/' + esc(l.planDays || '?') : '')) + '</td><td class="num">' + C.num(l.S) + '</td><td class="num">' + C.num(l.bonus) + '</td><td class="num">' + C.num(l.advance) + '</td><td class="num">' + C.num(l.penalty) + '</td><td class="num">' + C.num(l.correction) + '</td><td class="num"><b>' + C.num(l.total) + '</b></td><td>' +
        (closed ? '<label class="check" style="min-height:32px"><input type="checkbox" data-paid="' + esc(l.personId) + '"' + (l.paid === 'yes' ? ' checked' : '') + '> ' + esc(t('paid')) + '</label>'
          : (C.n(l.lateCount) ? '<span class="chip warn">' + esc(t('late_n', { n: l.lateCount })) + '</span> ' : '') + (C.n(l.incompleteDays) ? '<span class="chip bad">' + esc(t('incomplete_n', { n: l.incompleteDays })) + '</span> ' : '') + (C.n(l.pendingBonus) ? '<span class="chip">' + esc(t('pending_bonus', { v: C.num(l.pendingBonus) })) + '</span>' : '')) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">' + esc(t('total')) + '</td><td class="num">' + C.num(sum('S')) + '</td><td class="num">' + C.num(sum('bonus')) + '</td><td class="num">' + C.num(sum('advance')) + '</td><td class="num">' + C.num(sum('penalty')) + '</td><td class="num">' + C.num(sum('correction')) + '</td><td class="num">' + C.num(sum('total')) + '</td><td></td></tr></tfoot></table></div></section>';

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
      csv: () => { API.call('logEvent', { event: 'export', what: 'payroll_csv', id: month }).catch(() => {}); C.downloadCsv('vedomost-' + month + '.csv', [[t('name'), t('pay'), t('days'), t('plan_days'), t('col_std'), t('col_bonus'), t('col_adv'), t('col_pen'), t('col_corr'), t('col_total'), t('paid')]].concat(lines.map(l => [l.name, payLabel(l), l.daysWorked, l.planDays, l.S, l.bonus, l.advance, l.penalty, l.correction, l.total, l.paid || '']))); },
      close: async el => {
        // Bağlanmaya mane olan sənədlər (BR-53, BR-64)
        const blockers = await C.busy(el, () => API.call('monthBlockers', { month })).catch(() => null);
        if (blockers === null) return;
        if (blockers.length) return showBlockers(month, blockers);
        if (!await C.confirmDlg(t('close_month_q', { m: C.monthName(month) }), t('close_month'), true)) return;
        await C.busy(el, () => API.call('closePeriod', { month })).then(async r2 => {
          if (r2 && r2.ok === false) return showBlockers(month, r2.blockers);
          C.toast(t('month_closed')); await UB.refresh(true);
        }).catch(() => {});
      },
      line: (el, ev) => { if (ev.target.closest('label')) return; const l = lines.find(x => x.personId === el.dataset.id); if (l) lineDetail(l, closed); }
    });
  };

  function showBlockers(month, list) {
    const who = b => b.workerId ? UB.workerName(b.workerId) : b.siteId ? UB.siteName(b.siteId) : '';
    const link = b => ({ work: '#/approvals?tab=work', att: '#/approvals?tab=att', adv: '#/money?tab=adv', pay: '#/money?tab=pay', exp: '#/money?tab=exp' }[b.type]);
    const st = b => b.type === 'adv' || b.type === 'pay' ? t('ms_' + b.status) : b.type === 'exp' ? t('xs_' + b.status) : b.type === 'work' ? t('es_' + b.status) : t('as_' + b.status);
    const dlg = C.dialog({
      title: t('month_blocked', { m: C.monthName(month) }),
      body: '<div class="notice warn">' + esc(t('month_blocked_hint')) + '</div><div class="list">' + list.map(b => '<a class="list-row click" href="' + link(b) + '" style="color:var(--text)"><span class="tag">' + esc(t('bk_' + b.type)) + '</span><div class="grow"><div class="title">' + esc(who(b)) + (b.amount ? ' · ' + C.money(b.amount) : '') + '</div><div class="meta">' + esc(C.fmtDate(b.date, true) + ' · ' + st(b)) + '</div></div>' + icon('chev', 16) + '</a>').join('') + '</div>',
      foot: '<button type="button" class="btn primary" data-close>' + esc(t('close')) + '</button>'
    });
    dlg.querySelectorAll('a').forEach(a => a.addEventListener('click', () => dlg.close()));
  }

  function lineDetail(l, closed) {
    const row = (k, v, strong) => '<span>' + esc(k) + '</span><span class="mono" style="text-align:right' + (strong ? ';font-weight:700' : '') + '">' + v + '</span>';
    const det = l.detail || [];
    const dlg = C.dialog({
      title: l.name,
      body: '<div class="small muted">' + esc(payLabel(l)) + '</div><div class="kv" style="grid-template-columns:1fr auto">' +
        (l.personType === 'WORKER' ? row(t('days'), esc(l.daysWorked) + (l.payType === 'MONTH' ? ' / ' + esc(l.planDays || '?') : '')) : '') +
        row(t('col_std'), C.money(l.S)) + row(t('col_bonus'), C.money(l.bonus)) +
        row('− ' + t('col_adv'), C.money(l.advance)) + row('− ' + t('col_pen'), C.money(l.penalty)) + row('± ' + t('col_corr'), C.money(l.correction)) + row(t('col_total'), C.money(l.total), true) + '</div>' +
        (det.length ? '<h3>' + esc(t('bonus_by_type')) + '</h3><div class="table-wrap"><table class="t"><thead><tr><th>' + esc(t('work_type')) + '</th><th class="num">' + esc(t('norm')) + '</th><th class="num">' + esc(t('fact')) + '</th><th class="num">%</th><th class="num">' + esc(t('col_bonus')) + '</th></tr></thead><tbody>' +
          det.map(x => '<tr><td>' + esc(x.name) + '<div class="tiny muted">' + esc(t('nt_' + x.normType)) + (x.normType === 'DAY' ? ' · ' + esc(t('over_days', { n: x.overDays })) : '') + '</div></td><td class="num">' + C.num(x.norm) + ' ' + esc(x.unit) + '</td><td class="num">' + C.num(x.fakt) + '</td><td class="num">' + C.num(x.pct) + '</td><td class="num">' + C.num(x.amount) + '</td></tr>').join('') + '</tbody></table></div><div class="tiny muted">' + esc(t('bonus_formula')) + '</div>' : '') +
        (l.personType === 'FOREMAN' && C.n(l.B) ? '<div class="small muted">' + esc(t('foreman_bonus_base', { v: C.money(l.B) })) + '</div>' : '') +
        (C.n(l.lateCount) || C.n(l.incompleteDays) ? '<div class="notice warn">' + esc(t('line_warn', { late: l.lateCount, inc: l.incompleteDays })) + '</div>' : '') +
        (C.n(l.pendingBonus) ? '<div class="notice">' + esc(t('pending_bonus_long', { v: C.money(l.pendingBonus) })) + '</div>' : ''),
      foot: (!closed && l.personType === 'WORKER' ? '<button type="button" class="btn" data-ded>' + esc(t('add_deduction')) + '</button>' : '') + '<button type="button" class="btn primary" data-close>' + esc(t('close')) + '</button>'
    });
    const b = dlg.querySelector('[data-ded]'); if (b) b.addEventListener('click', () => { dlg.close(); F.deduction(l.personId); });
  }

  // =========================================================== reports (+ obyekt nəticəsi, BR-44)
  S.reports = async function (view, route) {
    const all = route.q.all === '1';
    const month = all ? '' : (route.q.m || UB.data.month);
    const nav = monthNav(month || UB.data.month, 'month', '<button type="button" class="btn sm' + (all ? ' primary' : '') + '" data-act="all">' + esc(t('all_time')) + '</button>');
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_reports')) + '</h1>' + nav + '</div><div class="loading"><i></i></div>';
    const go = m => UB.go('#/reports?m=' + m);
    C.bind(view, { month: el => go(C.shiftMonth(month || UB.data.month, Number(el.dataset.k))), all: () => UB.go(all ? '#/reports' : '#/reports?all=1') });
    let r, sr;
    try { [r, sr] = await Promise.all([API.call('report', { month: month || UB.data.month }), API.call('siteResult', { month })]); }
    catch (e) { view.querySelector('.loading').outerHTML = '<div class="empty">' + esc(C.errorText(e)) + '</div>'; return; }
    if (location.hash.indexOf('#/reports') !== 0) return;
    const d = UB.data;
    const cost = Object.keys(r.costByForeman).map(id => ({ id, name: UB.foremanName(id), v: r.costByForeman[id] })).sort((a, b) => b.v - a.v);
    const maxCost = Math.max(1, ...cost.map(x => x.v));
    const workers = r.lines.filter(l => l.personType === 'WORKER').sort((a, b) => C.n(b.lateCount) - C.n(a.lateCount) || a.name.localeCompare(b.name));
    const openAdv = d.advances.filter(a => ['APPROVED', 'GIVEN', 'LINK_SENT', 'LINK_EXPIRED', 'CONFLICT'].indexOf(a.status) >= 0);
    const tot = k => sr.reduce((s, x) => s + C.n(x[k]), 0);
    const col = v => v < 0 ? 'var(--bad)' : 'var(--ok)';
    const pct = v => v === null ? '—' : C.num(v, 1) + '%';
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_reports')) + '</h1>' + nav + '</div>' +
      '<section class="card"><div class="card-head"><div><h2>' + esc(t('r_site_result')) + '</h2><div class="small muted">' + esc(t('r_site_result_hint')) + '</div></div><button type="button" class="btn sm" data-act="srcsv">' + icon('download', 14) + 'CSV</button></div>' +
      (sr.length ? '<div class="table-wrap"><table class="t" style="min-width:980px"><thead><tr><th>' + esc(t('site')) + '</th><th class="num">' + esc(t('sr_received')) + '</th><th class="num">' + esc(t('sr_expenses')) + '</th><th class="num">' + esc(t('sr_labor')) + '</th><th class="num">' + esc(t('sr_cash')) + '</th><th class="num">' + esc(t('margin')) + '</th><th class="num">' + esc(t('sr_work_value')) + '</th><th class="num">' + esc(t('sr_work')) + '</th><th class="num">' + esc(t('sr_debt')) + '</th></tr></thead><tbody>' +
        sr.map(x => '<tr class="click" data-act="site" data-id="' + esc(x.siteId) + '"><td><b>' + esc(x.name) + '</b><div class="tiny muted">' + esc(((UB.idx.customers[x.customerId] || {}).name || '') + ' · ' + C.shortName(UB.foremanName(x.foremanId))) + '</div></td><td class="num">' + C.num(x.received) + '</td><td class="num">' + C.num(x.expenses) + '</td><td class="num">' + C.num(x.labor) + '</td><td class="num" style="color:' + col(x.cashResult) + ';font-weight:600">' + C.num(x.cashResult) + '</td><td class="num">' + pct(x.cashMargin) + '</td><td class="num">' + C.num(x.workValue) + '</td><td class="num" style="color:' + col(x.workResult) + '">' + C.num(x.workResult) + '</td><td class="num">' + (x.debt === null ? '—' : C.num(x.debt)) + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td>' + esc(t('total')) + '</td><td class="num">' + C.num(tot('received')) + '</td><td class="num">' + C.num(tot('expenses')) + '</td><td class="num">' + C.num(tot('labor')) + '</td><td class="num">' + C.num(tot('cashResult')) + '</td><td></td><td class="num">' + C.num(tot('workValue')) + '</td><td class="num">' + C.num(tot('workResult')) + '</td><td></td></tr></tfoot></table></div><div class="tiny muted">' + esc(t('sr_note')) + '</div>' : '<div class="empty">' + esc(t('no_data')) + '</div>') + '</section>' +
      (all ? '' : '<div class="kpis"><div class="kpi"><div class="label">' + esc(t('r_cost_total')) + '</div><div class="value">' + C.money(cost.reduce((s, x) => s + x.v, 0)) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('r_geo_rejects')) + '</div><div class="value" style="color:var(--bad)">' + r.geoRejects + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('r_late_total')) + '</div><div class="value" style="color:var(--warn)">' + workers.reduce((s, l) => s + C.n(l.lateCount), 0) + '</div></div>' +
      '<div class="kpi"><div class="label">' + esc(t('r_open_adv')) + '</div><div class="value">' + openAdv.length + '</div></div></div>' +
      '<div class="cols"><section class="card col-2"><h2>' + esc(t('r_cost_by_foreman')) + '</h2>' + (cost.length ? '<div class="stack">' + cost.map(x => '<div style="display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,2fr) 90px;gap:12px;align-items:center"><span>' + esc(C.shortName(x.name)) + '</span><div class="bar" style="height:10px"><i style="width:' + Math.round(x.v / maxCost * 100) + '%;background:var(--accent)"></i></div><span class="mono right">' + C.num(x.v) + '</span></div>').join('') + '</div><div class="tiny muted">' + esc(t('r_cost_hint')) + '</div>' : '<div class="empty">' + esc(t('no_data')) + '</div>') + '</section>' +
      '<section class="card col-2"><h2>' + esc(t('r_work_by_type')) + '</h2>' + (r.workByType.length ? '<table class="t"><tbody>' + r.workByType.map(x => '<tr><td>' + esc(x.name) + '</td><td class="num">' + C.num(x.qty) + ' ' + esc(x.unit) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">' + esc(t('no_data')) + '</div>') + '</section></div>' +
      '<section class="card"><div class="card-head"><h2>' + esc(t('r_attendance')) + '</h2><button type="button" class="btn sm" data-act="csv">' + icon('download', 14) + 'CSV</button></div><div class="table-wrap"><table class="t" style="min-width:600px"><thead><tr><th>' + esc(t('worker')) + '</th><th>' + esc(t('foreman')) + '</th><th class="num">' + esc(t('days')) + '</th><th class="num">' + esc(t('late')) + '</th><th class="num">' + esc(t('incomplete')) + '</th><th class="num">' + esc(t('col_bonus')) + '</th></tr></thead><tbody>' +
      workers.map(l => '<tr><td>' + esc(l.name) + '</td><td>' + esc(C.shortName(UB.foremanName(l.foremanId))) + '</td><td class="num">' + esc(l.daysWorked) + '</td><td class="num" style="color:' + (C.n(l.lateCount) ? 'var(--warn)' : 'inherit') + '">' + esc(l.lateCount) + '</td><td class="num">' + esc(l.incompleteDays) + '</td><td class="num">' + C.num(l.bonus) + '</td></tr>').join('') + '</tbody></table></div></section>' +
      '<section class="card"><h2>' + esc(t('r_open_adv')) + '</h2>' + (openAdv.length ? '<div class="list">' + openAdv.map(a => '<div class="list-row"><span class="mono muted">' + esc(a.receiptNo) + '</span><span class="grow">' + esc(UB.workerName(a.workerId)) + '</span>' + UB.moneyChip(a.status) + '<b class="mono">' + C.money(a.amount) + '</b></div>').join('') + '</div>' : '<div class="empty">' + esc(t('no_data')) + '</div>') + '</section>');
    C.bind(view, {
      month: el => go(C.shiftMonth(month || UB.data.month, Number(el.dataset.k))),
      all: () => UB.go(all ? '#/reports' : '#/reports?all=1'),
      site: el => F.siteDetail(UB.idx.sites[el.dataset.id]),
      srcsv: () => { API.call('logEvent', { event: 'export', what: 'site_result_csv', id: month || 'all' }).catch(() => {}); C.downloadCsv('obyekt-neticesi-' + (month || 'hamisi') + '.csv', [[t('site'), t('customer'), t('sr_received'), t('sr_expenses'), t('sr_labor'), t('sr_cash'), t('margin'), t('sr_work_value'), t('sr_work'), t('sr_debt')]].concat(sr.map(x => [x.name, (UB.idx.customers[x.customerId] || {}).name || '', x.received, x.expenses, x.labor, x.cashResult, x.cashMargin === null ? '' : x.cashMargin, x.workValue, x.workResult, x.debt === null ? '' : x.debt]))); },
      csv: () => { API.call('logEvent', { event: 'export', what: 'attendance_csv', id: month }).catch(() => {}); C.downloadCsv('davamiyyet-' + month + '.csv', [[t('worker'), t('foreman'), t('days'), t('late'), t('incomplete'), t('col_bonus')]].concat(workers.map(l => [l.name, UB.foremanName(l.foremanId), l.daysWorked, l.lateCount, l.incompleteDays, l.bonus]))); }
    });
  };

  // =========================================================== catalog (iş növü + norma, BR-62)
  S.catalog = function (view) {
    const list = UB.data.workTypes;
    view.innerHTML = '<div class="page-head"><div><h1>' + esc(t('nav_catalog')) + '</h1><div class="sub">' + esc(t('catalog_hint')) + '</div></div><button type="button" class="btn primary" data-act="add">' + icon('plus', 16) + esc(t('new_work_type')) + '</button></div>' +
      '<section class="card"><div class="table-wrap"><table class="t" style="min-width:520px"><thead><tr><th>' + esc(t('work_type')) + '</th><th>' + esc(t('unit')) + '</th><th>' + esc(t('norm_type')) + '</th><th class="num">' + esc(t('norm')) + '</th></tr></thead><tbody>' +
      list.map(w => '<tr class="click" data-act="edit" data-id="' + esc(w.id) + '"><td><b>' + esc(w.name) + '</b></td><td>' + esc(w.unit) + '</td><td>' + esc(w.normType ? t('nt_' + w.normType) : t('no_norm')) + '</td><td class="num">' + (w.normType ? C.num(w.normQty) + ' ' + esc(w.unit) : '—') + '</td></tr>').join('') +
      '</tbody></table></div><div class="notice">' + esc(t('bonus_formula')) + '</div></section>';
    C.bind(view, { add: () => F.workType(), edit: el => F.workType(UB.idx.workTypes[el.dataset.id]) });
  };

  F.workType = function (w) {
    w = w || { unit: 'm²', active: 'yes', normType: 'MONTH' };
    const dlg = C.dialog({
      title: w.id ? w.name : t('new_work_type'),
      body: '<form class="form" id="tf"><div class="grid2">' + fld(t('name'), inp('name', w.name, 'text', 'required')) + fld(t('unit'), inp('unit', w.unit, 'text', 'required list="units"') + '<datalist id="units"><option value="m²"><option value="m"><option value="ədəd"><option value="gün"></datalist>') +
        fld(t('norm_type'), sel('normType', w.normType || '', [['MONTH', t('nt_MONTH')], ['DAY', t('nt_DAY')], ['', t('no_norm')]])) +
        fld(t('norm_qty'), inp('normQty', w.normQty, 'number', 'min="0" step="0.01"'), t('norm_qty_hint')) +
        fld(t('status'), sel('active', w.active, [['yes', t('active')], ['no', t('inactive')]])) + '</div>' +
        '<div class="notice small">' + esc(t('bonus_formula')) + '</div></form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('save')) + '</button>'
    });
    const form = dlg.querySelector('#tf');
    const sync = () => { form.normQty.closest('.field').style.display = form.normType.value ? '' : 'none'; form.normQty.required = !!form.normType.value; };
    form.addEventListener('change', sync); sync();
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      await C.busy(e.currentTarget, () => API.call('saveWorkType', { workType: Object.assign({ id: w.id }, C.formData(form)) })).then(() => { dlg.close(); C.toast(t('saved')); UB.refresh(); }).catch(() => {});
    });
  };

  // =========================================================== journal (BR-46), links (BR-55), attempts (S-50)
  S.journal = async function (view, route) {
    const tab = route.q.tab || 'log';
    const q = route.q;
    const tabs = [['log', t('tab_log')], ['links', t('tab_links')], ['attempts', t('tab_attempts')]];
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_journal')) + '</h1></div>' +
      '<div class="tabs" role="tablist">' + tabs.map(x => '<button role="tab" data-act="tab" data-tab="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + esc(x[1]) + '</button>').join('') + '</div><div id="jb"><div class="loading"><i></i></div></div>';
    C.bind(view, { tab: el => UB.go('#/journal?tab=' + el.dataset.tab) });
    const box = view.querySelector('#jb');
    try {
      if (tab === 'log') {
        const from = q.from || C.shiftMonth(C.monthISO(), 0) + '-01', to = q.to || C.todayISO();
        const r = await API.call('auditLog', { from, to, userId: q.u || '', act: q.a || '', q: q.q || '' });
        const users = {}; r.users.forEach(u => { users[u.id] = u.name; });
        const acts = ['', 'login', 'create', 'update', 'approve', 'return', 'reject', 'link', 'confirm', 'conflict', 'pdf', 'print', 'export', 'set_password', 'close'];
        box.innerHTML = '<form class="card form" id="jf"><div class="grid2">' +
          fld(t('from'), inp('from', from, 'date')) + fld(t('to'), inp('to', to, 'date')) +
          fld(t('user'), '<select name="u"><option value="">' + esc(t('all')) + '</option><option value="public"' + (q.u === 'public' ? ' selected' : '') + '>' + esc(t('link_user')) + '</option>' + r.users.map(u => '<option value="' + esc(u.id) + '"' + (q.u === u.id ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</select>') +
          fld(t('action'), sel('a', q.a || '', acts.map(a => [a, a ? t('ja_' + a) : t('all')]))) + fld(t('search'), inp('q', q.q || '')) + '</div><div class="row"><button type="submit" class="btn primary">' + esc(t('filter')) + '</button><button type="button" class="btn" data-csv>' + icon('download', 16) + 'CSV</button><span class="muted small">' + esc(t('shown_of', { n: r.rows.length, total: r.total })) + '</span></div></form>' +
          '<section class="card"><div class="table-wrap"><table class="t" style="min-width:820px"><thead><tr><th>' + esc(t('time')) + '</th><th>' + esc(t('user')) + '</th><th>' + esc(t('action')) + '</th><th>' + esc(t('object')) + '</th><th>' + esc(t('changes')) + '</th></tr></thead><tbody>' +
          r.rows.map(x => '<tr><td class="mono small nowrap">' + esc(dt(x.ts)) + '</td><td>' + esc(users[x.userId] || (x.userId === 'public' ? t('link_user') : x.userId)) + '</td><td><span class="chip">' + esc(jaLabel(x.action)) + '</span></td><td class="small">' + esc(x.sheet) + '<div class="tiny muted mono">' + esc(x.rowId) + '</div></td><td class="small">' + changesHtml(x.details) + '</td></tr>').join('') +
          '</tbody></table></div></section>';
        const f = box.querySelector('#jf');
        f.addEventListener('submit', e => { e.preventDefault(); const v = C.formData(f); UB.go('#/journal?tab=log&from=' + v.from + '&to=' + v.to + '&u=' + encodeURIComponent(v.u) + '&a=' + encodeURIComponent(v.a) + '&q=' + encodeURIComponent(v.q)); });
        box.querySelector('[data-csv]').addEventListener('click', () => { API.call('logEvent', { event: 'export', what: 'journal_csv' }).catch(() => {}); C.downloadCsv('jurnal-' + from + '_' + to + '.csv', [[t('time'), t('user'), t('action'), t('object'), 'ID', t('changes')]].concat(r.rows.map(x => [x.ts, users[x.userId] || x.userId, x.action, x.sheet, x.rowId, x.details]))); });
      }
      if (tab === 'links') {
        const r = await API.call('links', { days: 7 });
        box.innerHTML = '<section class="card"><div class="small muted">' + esc(t('links_hint')) + '</div><div class="table-wrap"><table class="t" style="min-width:820px"><thead><tr><th>' + esc(t('created')) + '</th><th>' + esc(t('type')) + '</th><th>' + esc(t('worker_or_customer')) + '</th><th>' + esc(t('by')) + '</th><th>' + esc(t('opened')) + '</th><th>' + esc(t('used')) + '</th><th>' + esc(t('status')) + '</th></tr></thead><tbody>' +
          r.rows.map(x => '<tr><td class="mono small nowrap">' + esc(dt(x.created)) + '</td><td>' + esc(t('lk_' + x.kind)) + '</td><td>' + esc(x.workerId ? UB.workerName(x.workerId) : UB.customerOfSite(x.siteId).name || '') + '<div class="tiny muted">' + esc(UB.siteName(x.siteId)) + '</div></td><td class="small">' + esc(UB.foremanName(x.createdBy)) + '</td><td class="mono small">' + esc(dt(x.openedAt) || '—') + '</td><td class="mono small">' + esc(dt(x.usedAt) || '—') + '</td><td><span class="chip ' + ({ USED: 'ok', OPENED: 'accent', NOT_OPENED: 'bad', EXPIRED: 'bad', CANCELLED: '' }[x.status] || '') + '">' + esc(t('ls_' + x.status)) + '</span></td></tr>').join('') +
          '</tbody></table></div></section>';
      }
      if (tab === 'attempts') {
        const r = await API.call('links', { days: 30 });
        box.innerHTML = '<section class="card"><div class="small muted">' + esc(t('attempts_hint')) + '</div>' + (r.attempts.length ? '<div class="table-wrap"><table class="t" style="min-width:720px"><thead><tr><th>' + esc(t('time')) + '</th><th>' + esc(t('type')) + '</th><th>' + esc(t('worker_or_customer')) + '</th><th>' + esc(t('foreman')) + '</th><th>' + esc(t('reason')) + '</th><th>' + esc(t('device')) + '</th></tr></thead><tbody>' +
          r.attempts.map(a => '<tr><td class="mono small nowrap">' + esc(dt(a.ts)) + '</td><td>' + esc(t('lk_' + a.kind)) + '</td><td>' + esc(a.workerId ? UB.workerName(a.workerId) : UB.customerOfSite(a.siteId).name || '') + '</td><td>' + esc(UB.foremanName(a.foremanId)) + '</td><td><span class="chip bad">' + esc(t('att_' + a.reason)) + '</span></td><td class="tiny muted mono">' + esc(String(a.deviceId).slice(0, 10)) + '<div>' + esc(String(a.ua).slice(0, 60)) + '</div></td></tr>').join('') +
          '</tbody></table></div>' : '<div class="empty">' + esc(t('no_attempts')) + '</div>') + '</section>';
      }
    } catch (e) { box.innerHTML = '<div class="card"><div class="empty">' + esc(C.errorText(e)) + '</div></div>'; }
  };
  function jaLabel(a) { const k = 'ja_' + a; const v = t(k); return v !== k ? v : String(a).replace(/_/g, ' '); }
  function changesHtml(details) {
    if (!details) return '';
    let o; try { o = JSON.parse(details); } catch (e) { return esc(String(details).slice(0, 160)); }
    const ch = o.ch || {};
    const parts = Object.keys(ch).map(k => '<div><span class="muted">' + esc(k) + ':</span> <s class="dim">' + esc(ch[k][0] || '∅') + '</s> → <b>' + esc(ch[k][1] || '∅') + '</b></div>');
    const rest = Object.keys(o).filter(k => k !== 'ch').map(k => '<div><span class="muted">' + esc(k) + ':</span> ' + esc(typeof o[k] === 'object' ? JSON.stringify(o[k]).slice(0, 120) : o[k]) + '</div>');
    return parts.concat(rest).join('');
  }
})();
