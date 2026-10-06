/* Ustabaşı — prarab ekranları */
(function () {
  'use strict';
  const C = window.UBCore, UB = window.UB;
  const { t, esc, icon, API } = C;
  const S = UB.screens.foreman;
  const F = UB.forms;

  const myWorkers = () => UB.data.workers.filter(w => w.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const mySites = () => UB.data.sites.filter(s => s.status === 'APPROVED');
  const fld = (label, inner, hint) => '<label class="field"><span>' + esc(label) + '</span>' + inner + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';

  function lastSiteOf(wid) {
    const a = UB.data.attendance.filter(x => x.workerId === wid).sort((x, y) => String(y.ts).localeCompare(String(x.ts)))[0];
    if (a && UB.idx.sites[a.siteId] && UB.idx.sites[a.siteId].status === 'APPROVED') return a.siteId;
    const s = mySites(); return s.length ? s[0].id : '';
  }

  const ENTRY_CHIP = { USTA_PENDING: '', ADMIN_PENDING: 'accent', APPROVED: 'ok', RETURNED: 'bad' };
  const entryChip = e => '<span class="chip ' + (ENTRY_CHIP[e.status] || '') + '">' + esc(t('es_' + e.status)) + '</span>';

  // =========================================================== home
  S.home = function (view) {
    const d = UB.data;
    const ws = myWorkers();
    const st = {}; ws.forEach(w => { st[w.id] = UB.todayStatus(w.id); });
    const present = ws.filter(w => st[w.id].code !== 'absent').length;
    const late = ws.filter(w => st[w.id].code === 'late').length;
    const absent = ws.length - present;
    const ustaWait = d.entries.filter(e => e.status === 'USTA_PENDING').length;
    const returned = d.entries.filter(e => e.status === 'RETURNED');
    const approvedAdv = d.advances.filter(a => a.status === 'APPROVED');
    const pendingSites = d.sites.filter(s => s.status === 'PENDING').length;
    const first = String(UB.user.name).split(' ')[0];
    const order = { absent: 0, late: 1, in: 2, left: 3 };
    const sorted = ws.slice().sort((a, b) => order[st[a.id].code] - order[st[b.id].code]);

    view.innerHTML =
      '<div><div class="small muted">' + esc(C.weekday() + ', ' + C.fmtDate(d.today)) + '</div><h1>' + esc(t('hello', { name: first })) + '</h1></div>' +
      '<section class="card"><div class="card-head"><span class="muted">' + esc(t('workers_at_work')) + '</span><span class="mono" style="font-size:28px;font-weight:600">' + present + '<span style="color:var(--dim);font-size:18px"> / ' + ws.length + '</span></span></div>' +
      '<div class="bar"><i style="width:' + (ws.length ? Math.round(present / ws.length * 100) : 0) + '%"></i></div><div class="row" style="gap:8px">' +
      (late ? '<span class="chip warn">' + esc(t('n_late', { n: late })) + '</span>' : '') +
      (absent ? '<span class="chip bad">' + esc(t('n_absent', { n: absent })) + '</span>' : '') +
      (ustaWait ? '<span class="chip">' + esc(t('n_usta_wait', { n: ustaWait })) + '</span>' : '') +
      (pendingSites ? '<span class="chip">' + esc(t('n_sites_wait', { n: pendingSites })) + '</span>' : '') +
      (!late && !absent && !ustaWait ? '<span class="chip ok">' + esc(t('all_good')) + '</span>' : '') + '</div></section>' +
      (returned.length ? '<a class="notice warn" href="#/work?f=RETURNED" style="color:var(--text);display:block">' + esc(t('n_returned', { n: returned.length })) + ' →</a>' : '') +
      (approvedAdv.length ? '<a class="notice" href="#/advances" style="color:var(--text);display:block">' + esc(t('n_adv_ready', { n: approvedAdv.length })) + ' →</a>' : '') +
      '<div class="actions">' +
      '<a class="action primary" href="#/link">' + icon('pin', 20) + esc(t('act_link')) + '</a>' +
      '<a class="action" href="#/work/new">' + icon('file', 20) + esc(t('act_work')) + '</a>' +
      '<button type="button" class="action" data-act="adv">' + icon('wallet', 20) + esc(t('act_adv')) + '</button>' +
      '<a class="action" href="#/interim">' + icon('chat', 20) + esc(t('act_report')) + '</a></div>' +
      '<section class="card" style="gap:4px"><div class="card-head"><h2>' + esc(t('todays_workers')) + '</h2><a href="#/workers" class="small">' + esc(t('all_n', { n: ws.length })) + '</a></div><div class="list">' +
      (sorted.map(w => {
        const s = st[w.id];
        let right = UB.statusChip(s);
        if (s.code === 'absent') right = '<a class="btn sm" style="border-color:var(--accent);color:var(--accent-text)" href="#/link?w=' + esc(w.id) + '&k=IN">' + esc(t('send_link')) + '</a>';
        return '<div class="list-row click" data-act="worker" data-id="' + esc(w.id) + '"><div class="grow"><div class="title">' + esc(w.name) + '</div><div class="meta">' + esc((w.specialty || t('g_' + (w.grade || 'master'))) + (s.code === 'absent' ? ' · ' + t('st_absent') : '')) + '</div></div>' + right + '</div>';
      }).join('') || '<div class="empty">' + esc(t('no_workers_foreman')) + '</div>') + '</div></section>';

    C.bind(view, { adv: () => advanceForm(), worker: (el, ev) => { if (ev.target.closest('a')) return; workerSheet(UB.idx.workers[el.dataset.id]); } });
  };

  // =========================================================== workers
  S.workers = function (view) {
    const ws = myWorkers();
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_workers')) + '</h1><span class="muted small">' + esc(t('n_workers', { n: ws.length })) + '</span></div>' +
      '<section class="card" style="gap:4px"><div class="list">' + (ws.map(w => '<div class="list-row click" data-act="w" data-id="' + esc(w.id) + '"><span style="width:40px;height:40px;border-radius:20px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;flex:none">' + esc(C.initials(w.name)) + '</span><div class="grow"><div class="title">' + esc(w.name) + '</div><div class="meta">' + esc((w.specialty || '') + ' · ' + t('g_' + (w.grade || 'master')) + ' · ' + w.startTime + '–' + w.endTime) + '</div></div>' + UB.statusChip(UB.todayStatus(w.id)) + '</div>').join('') || '<div class="empty">' + esc(t('no_workers_foreman')) + '</div>') + '</div></section>';
    C.bind(view, { w: el => workerSheet(UB.idx.workers[el.dataset.id]) });
  };

  function workerSheet(w) {
    if (!w) return;
    const s = UB.todayStatus(w.id);
    const next = s.code === 'absent' ? 'IN' : 'OUT';
    const dlg = C.dialog({
      title: w.name,
      body: '<div class="row">' + UB.statusChip(s) + '<span class="small muted">' + esc(t('schedule')) + ': ' + esc(w.startTime + '–' + w.endTime) + '</span></div>' +
        '<div class="kv"><span>' + esc(t('phone')) + '</span><span><a href="tel:+' + esc(C.waPhone(w.phone)) + '" class="mono">+' + esc(C.waPhone(w.phone)) + '</a></span>' +
        '<span>' + esc(t('specialty')) + '</span><span>' + esc((w.specialty || '—') + ' · ' + t('g_' + (w.grade || 'master'))) + '</span>' +
        (UB.seesPay() && w.baseAmount !== '' ? '<span>' + esc(t('pay')) + '</span><span>' + esc(t('pt_' + w.payType) + ' · ' + t('pm_' + w.payModel)) + ' · ' + C.money(w.baseAmount) + '</span>' : '') + '</div>' +
        '<div class="actions">' +
        '<a class="action primary" href="#/link?w=' + esc(w.id) + '&k=' + next + '">' + icon('pin', 20) + esc(t(next === 'IN' ? 'link_in' : 'link_out')) + '</a>' +
        '<a class="action" href="#/link?w=' + esc(w.id) + '&k=' + next + '&manual=1">' + icon('edit', 20) + esc(t('manual_entry')) + '</a>' +
        '<button type="button" class="action" data-adv>' + icon('wallet', 20) + esc(t('act_adv')) + '</button>' +
        '<a class="action" href="#/interim?w=' + esc(w.id) + '">' + icon('chat', 20) + esc(t('act_report')) + '</a></div>'
    });
    dlg.querySelectorAll('a').forEach(a => a.addEventListener('click', () => dlg.close()));
    dlg.querySelector('[data-adv]').addEventListener('click', () => { dlg.close(); advanceForm(w.id); });
  }

  // =========================================================== attendance link
  S.link = function (view, route) {
    const ws = myWorkers(), sites = mySites();
    const wid = route.q.w || (ws[0] || {}).id || '';
    const st = wid ? UB.todayStatus(wid) : { code: 'absent' };
    const kind = route.q.k || (st.code === 'absent' ? 'IN' : 'OUT');
    const manualOpen = route.q.manual === '1';
    if (!sites.length) {
      view.innerHTML = '<h1>' + esc(t('act_link')) + '</h1><div class="card"><div class="empty">' + esc(t('no_approved_sites')) + '<br><br><a class="btn" href="#/sites">' + esc(t('nav_sites_short')) + '</a></div></div>';
      return;
    }
    const reasons = t('manual_reasons').split(',');
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('act_link')) + '</h1></div>' +
      '<form class="card form" id="lf">' +
      fld(t('worker'), '<select name="workerId" required>' + C.options(ws, wid, 'id', null, '—') + '</select>') +
      fld(t('site'), '<select name="siteId" required>' + C.options(sites, lastSiteOf(wid), 'id') + '</select>') +
      '<div class="field"><span>' + esc(t('kind')) + '</span><div class="seg" role="group"><button type="button" data-act="kind" data-k="IN" aria-pressed="' + (kind === 'IN') + '" style="min-height:44px;padding:0 18px;font-family:var(--font);font-size:14px">' + esc(t('kind_in')) + '</button><button type="button" data-act="kind" data-k="OUT" aria-pressed="' + (kind === 'OUT') + '" style="min-height:44px;padding:0 18px;font-family:var(--font);font-size:14px">' + esc(t('kind_out')) + '</button></div></div>' +
      '<input type="hidden" name="kind" value="' + kind + '">' +
      '<button type="submit" class="btn primary big block">' + icon('link', 18) + esc(t('create_link')) + '</button>' +
      '<div class="small muted">' + esc(t('link_hint', { m: UB.data.settings.linkTtlMin, r: UB.data.settings.defaultRadius })) + '</div></form>' +
      '<div id="link-result"></div>' +
      '<details class="card" id="manual"' + (manualOpen ? ' open' : '') + '><summary style="cursor:pointer;font-weight:600;min-height:28px">' + esc(t('manual_entry')) + '</summary><form class="form" id="mf" style="margin-top:12px">' +
      '<div class="notice">' + esc(t('manual_hint')) + '</div><div class="grid2">' +
      fld(t('time'), '<input name="time" type="time" value="' + esc(C.pad(new Date().getHours()) + ':' + C.pad(new Date().getMinutes())) + '" required>') +
      fld(t('reason'), '<select name="reasonSel">' + reasons.map(r => '<option>' + esc(r) + '</option>').join('') + '</select>') + '</div>' +
      fld(t('note'), '<input name="note" type="text">') +
      '<button type="submit" class="btn">' + esc(t('send_to_admin')) + '</button></form></details>';

    const lf = view.querySelector('#lf');
    lf.workerId.addEventListener('change', () => {
      const id = lf.workerId.value; if (!id) return;
      lf.siteId.value = lastSiteOf(id);
      const s = UB.todayStatus(id); setKind(s.code === 'absent' ? 'IN' : 'OUT');
    });
    function setKind(k) { lf.kind.value = k; lf.querySelectorAll('[data-k]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k))); }
    C.bind(lf, { kind: el => setKind(el.dataset.k) });

    lf.addEventListener('submit', async e => {
      e.preventDefault();
      if (!lf.reportValidity()) return;
      const f = C.formData(lf);
      await C.busy(lf.querySelector('[type=submit]'), async () => {
        const r = await API.call('createToken', f);
        showLink(view.querySelector('#link-result'), UB.idx.workers[f.workerId], f.kind, r);
      }).catch(() => {});
    });

    view.querySelector('#mf').addEventListener('submit', async e => {
      e.preventDefault();
      const f = C.formData(lf), m = C.formData(e.target);
      if (!f.workerId || !f.siteId) { lf.reportValidity(); return; }
      const reason = m.reasonSel + (m.note ? ': ' + m.note : '');
      await C.busy(e.target.querySelector('button'), () => API.call('manualAttendance', { workerId: f.workerId, siteId: f.siteId, kind: f.kind, time: m.time, reason })).then(async () => {
        C.toast(t('manual_sent')); await UB.refresh(true); UB.go('#/');
      }).catch(() => {});
    });
  };

  function showLink(box, w, kind, r) {
    const url = C.linkUrl(r.token);
    const L = w.lang || 'az';
    const text = t('wa_att', { name: w.name.split(' ')[0], kind: t(kind === 'IN' ? 'kind_in_lc' : 'kind_out_lc', null, L), m: r.ttl, url }, L);
    const expires = Date.now() + C.n(r.ttl) * 60000;
    box.innerHTML = '<section class="card" style="border-color:var(--accent)"><div class="card-head"><b>' + esc(t('link_ready', { name: w.name })) + '</b><span class="chip warn mono" id="cd"></span></div>' +
      '<div class="small mono" style="word-break:break-all;color:var(--muted)">' + esc(url) + '</div>' +
      '<button type="button" class="btn primary big block" data-wa>' + icon('chat', 18) + esc(t('send_whatsapp')) + '</button>' +
      '<div class="row"><button type="button" class="btn" data-copy>' + icon('copy', 16) + esc(t('copy')) + '</button><span class="small muted">' + esc(t('link_after_send')) + '</span></div></section>';
    box.querySelector('[data-wa]').addEventListener('click', () => C.whatsapp(w.phone, text));
    box.querySelector('[data-copy]').addEventListener('click', () => C.copyText(text));
    const cd = box.querySelector('#cd');
    const tick = () => {
      if (!cd.isConnected) return clearInterval(timer);
      const left = Math.max(0, Math.round((expires - Date.now()) / 1000));
      cd.textContent = left ? C.pad(Math.floor(left / 60)) + ':' + C.pad(left % 60) : t('expired');
      if (!left) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000); tick();
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // =========================================================== work entries
  S.work = function (view, route) {
    if (route.parts[1] === 'new' || route.parts[1] === 'edit') return workForm(view, route.parts[1] === 'edit' ? route.parts[2] : null);
    const d = UB.data, f = route.q.f || '';
    const filters = ['', 'USTA_PENDING', 'ADMIN_PENDING', 'RETURNED', 'APPROVED'];
    let list = d.entries.slice().sort((a, b) => String(b.date + b.created).localeCompare(String(a.date + a.created)));
    if (f) list = list.filter(e => e.status === f);
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_work')) + '</h1><a class="btn primary" href="#/work/new">' + icon('plus', 16) + esc(t('new_entry')) + '</a></div>' +
      '<div class="tabs" role="tablist">' + filters.map(x => '<button role="tab" data-act="f" data-f="' + x + '" aria-selected="' + (f === x) + '">' + esc(x ? t('es_' + x) : t('all')) + '</button>').join('') + '</div>' +
      '<section class="card" style="gap:4px"><div class="list">' + (list.slice(0, 60).map(e => '<div class="list-row click" data-act="e" data-id="' + esc(e.id) + '"><div class="grow"><div class="title">' + esc(UB.wtName(e.workTypeId)) + ' · ' + C.num(e.qty) + ' ' + esc(UB.wtUnit(e.workTypeId)) + '</div><div class="meta">' + esc(C.fmtDate(e.date) + ' · ' + UB.siteName(e.siteId)) + '</div><div class="meta">' + esc(UB.data.shares.filter(s => s.entryId === e.id).map(s => C.shortName(UB.workerName(s.workerId)) + (s.confirmedAt ? ' ✓' : '')).join(', ')) + '</div></div>' + entryChip(e) + '</div>').join('') || '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div></section>';
    C.bind(view, { f: el => UB.go('#/work' + (el.dataset.f ? '?f=' + el.dataset.f : '')), e: el => entrySheet(d.entries.find(x => x.id === el.dataset.id)) });
  };

  function entrySheet(e) {
    const shares = UB.data.shares.filter(s => s.entryId === e.id);
    const photos = String(e.photos || '').split(' ').filter(Boolean);
    const dlg = C.dialog({
      title: UB.wtName(e.workTypeId) + ' · ' + C.num(e.qty) + ' ' + UB.wtUnit(e.workTypeId),
      body: '<div class="row">' + entryChip(e) + '<span class="small muted">' + esc(C.fmtDate(e.date, true) + ' · ' + UB.siteName(e.siteId)) + '</span></div>' +
        (e.status === 'RETURNED' && e.returnReason ? '<div class="notice warn">' + esc(t('return_reason')) + ': ' + esc(e.returnReason) + '</div>' : '') +
        (e.note ? '<div class="small">' + esc(e.note) + '</div>' : '') +
        '<div class="list">' + shares.map(s => '<div class="list-row"><div class="grow"><div class="title">' + esc(UB.workerName(s.workerId)) + '</div><div class="meta">' + C.num(s.share) + '% · ' + C.num(C.n(e.qty) * C.n(s.share) / 100) + ' ' + esc(UB.wtUnit(e.workTypeId)) + (UB.seesPay() ? ' · ' + C.money(UB.shareAmount(e, s, UB.idx.workers[s.workerId])) : '') + '</div></div>' + (s.confirmedAt ? '<span class="chip ok">✓ ' + esc(C.fmtTime(s.confirmedAt)) + '</span>' : '<span class="chip">' + esc(t('waiting')) + '</span>') + '</div>').join('') + '</div>' +
        (photos.length ? '<div class="row">' + photos.map((p, i) => '<a class="btn sm" target="_blank" rel="noopener" href="' + esc(p) + '">' + icon('camera', 14) + esc(t('photo')) + ' ' + (i + 1) + '</a>').join('') + '</div>' : '') +
        '<div id="relinks"></div>',
      foot: (e.status === 'USTA_PENDING' ? '<button type="button" class="btn" data-relink>' + icon('chat', 16) + esc(t('resend_links')) + '</button>' : '') +
        (e.status === 'RETURNED' || e.status === 'USTA_PENDING' ? '<a class="btn primary" href="#/work/edit/' + esc(e.id) + '">' + icon('edit', 16) + esc(t('edit')) + '</a>' : '') +
        '<button type="button" class="btn" data-close>' + esc(t('close')) + '</button>'
    });
    dlg.querySelectorAll('a[href^="#/"]').forEach(a => a.addEventListener('click', () => dlg.close()));
    const rl = dlg.querySelector('[data-relink]');
    if (rl) rl.addEventListener('click', ev => C.busy(ev.currentTarget, async () => {
      const links = await API.call('workLinks', { entryId: e.id });
      renderWorkLinks(dlg.querySelector('#relinks'), e, links);
    }).catch(() => {}));
  }

  function workText(e, l) {
    const L = l.lang || 'az';
    return t('wa_work', {
      name: String(l.name).split(' ')[0], date: e.date, type: UB.wtName(e.workTypeId), qty: C.num(C.n(e.qty) * C.n(l.share) / 100), unit: UB.wtUnit(e.workTypeId), share: C.num(l.share), url: C.linkUrl(l.token)
    }, L);
  }

  function renderWorkLinks(box, e, links) {
    box.innerHTML = '<section class="card" style="border-color:var(--accent)"><b>' + esc(t('send_confirm_links')) + '</b><div class="list">' +
      links.map((l, i) => '<div class="list-row"><div class="grow"><div class="title">' + esc(l.name) + '</div><div class="meta">' + C.num(l.share) + '%</div></div><button type="button" class="btn primary sm" data-i="' + i + '">' + icon('chat', 14) + 'WhatsApp</button><button type="button" class="btn sm icon" data-c="' + i + '" aria-label="' + esc(t('copy')) + '">' + icon('copy', 14) + '</button></div>').join('') + '</div></section>';
    box.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { const l = links[Number(b.dataset.i)]; C.whatsapp(l.phone, workText(e, l)); b.classList.remove('primary'); b.innerHTML = icon('check', 14) + esc(t('sent')); }));
    box.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => C.copyText(workText(e, links[Number(b.dataset.c)]))));
  }

  function workForm(view, editId) {
    const d = UB.data;
    const e = editId ? d.entries.find(x => x.id === editId) : null;
    const sites = mySites(), ws = myWorkers();
    if (!sites.length) { view.innerHTML = '<h1>' + esc(t('new_entry')) + '</h1><div class="card"><div class="empty">' + esc(t('no_approved_sites')) + '</div></div>'; return; }
    let shares = e ? d.shares.filter(s => s.entryId === e.id).map(s => ({ workerId: s.workerId, share: C.n(s.share) })) : [];
    if (!shares.length) {
      const present = ws.filter(w => UB.todayStatus(w.id).code !== 'absent');
      shares = [{ workerId: (present[0] || ws[0] || {}).id || '', share: 100 }];
    }
    let photos = [];
    view.innerHTML = '<div class="page-head"><h1>' + esc(e ? t('edit_entry') : t('new_entry')) + '</h1><a class="btn" href="#/work">' + esc(t('cancel')) + '</a></div>' +
      (e && e.returnReason ? '<div class="notice warn">' + esc(t('return_reason')) + ': ' + esc(e.returnReason) + '</div>' : '') +
      '<form class="card form" id="wf"><div class="grid2">' +
      fld(t('date'), '<input name="date" type="date" required value="' + esc(e ? e.date : d.today) + '" max="' + esc(d.today) + '">') +
      fld(t('site'), '<select name="siteId" required>' + C.options(sites, e ? e.siteId : sites[0].id, 'id') + '</select>') +
      fld(t('work_type'), '<select name="workTypeId" required>' + C.options(d.workTypes, e ? e.workTypeId : '', 'id', x => x.name + ' (' + x.unit + ')', '—') + '</select>') +
      fld(t('qty'), '<input name="qty" type="number" min="0.01" step="0.01" required inputmode="decimal" value="' + esc(e ? e.qty : '') + '">', '') + '</div>' +
      '<fieldset><legend>' + esc(t('who_did')) + '</legend><div id="shares" class="stack" style="gap:8px"></div>' +
      '<div class="row"><button type="button" class="btn sm" data-act="addShare">' + icon('plus', 14) + esc(t('add_worker')) + '</button><button type="button" class="btn sm" data-act="equal">' + esc(t('split_equal')) + '</button><span class="grow"></span><b id="share-sum" class="mono"></b></div></fieldset>' +
      fld(t('note'), '<textarea name="note">' + esc(e ? e.note : '') + '</textarea>') +
      '<div class="field"><span>' + esc(t('photos')) + ' (≤5)</span><label class="btn" style="align-self:flex-start">' + icon('camera', 16) + esc(t('add_photo')) + '<input type="file" accept="image/*" capture="environment" multiple hidden id="ph"></label><div class="photos" id="ph-prev"></div></div>' +
      '<button type="submit" class="btn primary big block">' + esc(t('save_and_send')) + '</button></form><div id="wl"></div>';

    const form = view.querySelector('#wf');
    const box = view.querySelector('#shares');
    const unitHint = () => { const u = UB.wtUnit(form.workTypeId.value); form.qty.closest('.field').querySelector('span').textContent = t('qty') + (u ? ' (' + u + ')' : ''); };
    form.workTypeId.addEventListener('change', unitHint); unitHint();

    function drawShares() {
      box.innerHTML = shares.map((s, i) => '<div class="row" style="flex-wrap:nowrap"><select class="inp grow" data-w="' + i + '" required aria-label="' + esc(t('worker')) + '">' + C.options(ws, s.workerId, 'id', null, '—') + '</select>' +
        '<input class="inp" data-s="' + i + '" type="number" min="1" max="100" step="1" value="' + esc(s.share) + '" style="width:84px" aria-label="%" inputmode="numeric"><span class="muted">%</span>' +
        '<button type="button" class="btn icon" data-act="rm" data-i="' + i + '" aria-label="' + esc(t('remove')) + '"' + (shares.length < 2 ? ' disabled' : '') + '>' + icon('x', 16) + '</button></div>').join('');
      sumShares();
    }
    function sumShares() {
      const sum = shares.reduce((a, s) => a + C.n(s.share), 0);
      const el = view.querySelector('#share-sum'); el.textContent = C.num(sum) + '%'; el.style.color = Math.abs(sum - 100) < 0.5 ? 'var(--ok)' : 'var(--bad)';
    }
    box.addEventListener('input', ev => {
      const w = ev.target.dataset.w, s = ev.target.dataset.s;
      if (w !== undefined) shares[Number(w)].workerId = ev.target.value;
      if (s !== undefined) { shares[Number(s)].share = C.n(ev.target.value); sumShares(); }
    });
    box.addEventListener('change', ev => { if (ev.target.dataset.w !== undefined) shares[Number(ev.target.dataset.w)].workerId = ev.target.value; });
    C.bind(form, {
      addShare: () => { const used = shares.map(s => s.workerId); const next = ws.find(w => used.indexOf(w.id) < 0); shares.push({ workerId: next ? next.id : '', share: 0 }); equal(); },
      equal: () => equal(),
      rm: el => { shares.splice(Number(el.dataset.i), 1); equal(); }
    });
    function equal() {
      const k = shares.length; const base = Math.floor(100 / k);
      shares.forEach((s, i) => { s.share = i === k - 1 ? 100 - base * (k - 1) : base; });
      drawShares();
    }
    drawShares();

    const ph = view.querySelector('#ph'), prev = view.querySelector('#ph-prev');
    ph.addEventListener('change', async () => {
      const files = Array.from(ph.files || []).slice(0, 5 - photos.length);
      for (const f of files) { try { photos.push(await C.compressImage(f, 1280, 0.72)); } catch (err) { C.toast(t('err_bad_image'), true); } }
      prev.innerHTML = photos.map((p, i) => '<button type="button" class="btn ghost" style="padding:0;min-height:0" data-rmph="' + i + '" aria-label="' + esc(t('remove')) + '"><img src="' + p + '" alt=""></button>').join('');
      ph.value = '';
    });
    prev.addEventListener('click', ev => { const b = ev.target.closest('[data-rmph]'); if (!b) return; photos.splice(Number(b.dataset.rmph), 1); b.remove(); });

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      const sum = shares.reduce((a, s) => a + C.n(s.share), 0);
      if (Math.abs(sum - 100) > 0.5) return C.toast(t('err_shares_not_100'), true);
      const ids = shares.map(s => s.workerId);
      if (ids.some(x => !x) || new Set(ids).size !== ids.length) return C.toast(t('err_dup_worker'), true);
      const entry = Object.assign({ id: e ? e.id : '' }, C.formData(form));
      await C.busy(form.querySelector('[type=submit]'), async () => {
        const r = await API.call('saveWorkEntry', { entry, shares, photos });
        await UB.reload();
        history.replaceState(null, '', '#/work');
        view.innerHTML = '<div class="page-head"><h1>' + esc(t('entry_saved')) + '</h1><a class="btn" href="#/work">' + esc(t('done')) + '</a></div><div class="notice">' + esc(t('entry_saved_hint')) + '</div><div id="wl"></div>';
        renderWorkLinks(view.querySelector('#wl'), r.entry, r.links);
      }).catch(() => {});
    });
  }

  // =========================================================== advances
  function advanceForm(workerId) {
    const ws = myWorkers();
    const dlg = C.dialog({
      title: t('act_adv'),
      body: '<form class="form" id="af">' + fld(t('worker'), '<select name="workerId" required>' + C.options(ws, workerId || '', 'id', null, '—') + '</select>') +
        fld(t('amount') + ' (₼)', '<input name="amount" type="number" min="1" step="0.01" required inputmode="decimal">') +
        fld(t('reason'), '<input name="reason" type="text">') + '<div class="small muted" id="adv-info"></div></form>',
      foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-save>' + esc(t('send_to_admin')) + '</button>'
    });
    const form = dlg.querySelector('#af');
    const info = () => {
      const w = UB.idx.workers[form.workerId.value]; const el = dlg.querySelector('#adv-info');
      if (!w) { el.textContent = ''; return; }
      const used = UB.data.advances.filter(a => a.workerId === w.id && String(a.created).slice(0, 7) === UB.data.month && ['PENDING', 'APPROVED', 'GIVEN', 'SIGNED'].indexOf(a.status) >= 0).reduce((s, a) => s + C.n(a.amount), 0);
      el.textContent = t('adv_used_month', { v: C.money(used) });
    };
    form.workerId.addEventListener('change', info); info();
    dlg.querySelector('[data-save]').addEventListener('click', async e => {
      if (!form.reportValidity()) return;
      await C.busy(e.currentTarget, () => API.call('requestAdvance', C.formData(form))).then(r => {
        dlg.close();
        C.toast(r.overLimit === 'yes' ? t('adv_sent_over', { l: C.money(r.limit) }) : t('adv_sent'));
        UB.refresh();
      }).catch(() => {});
    });
  }
  UB.advanceForm = advanceForm;

  S.advances = function (view) {
    const d = UB.data;
    const list = d.advances.slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
    const chip = a => '<span class="chip ' + ({ PENDING: '', APPROVED: 'accent', GIVEN: 'warn', SIGNED: 'ok', REJECTED: 'bad' }[a.status] || '') + '">' + esc(t('adv_' + a.status)) + '</span>';
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_advances')) + '</h1><div class="row"><a class="btn" href="#/print/advances/' + d.month + '">' + icon('print', 16) + esc(t('print_adv')) + '</a><button type="button" class="btn primary" data-act="new">' + icon('plus', 16) + esc(t('new_request')) + '</button></div></div>' +
      '<section class="card" style="gap:4px"><div class="list">' + (list.map(a => '<div class="list-row"><div class="grow"><div class="title">' + C.money(a.amount) + ' · ' + esc(UB.workerName(a.workerId)) + '</div><div class="meta">' + esc(C.fmtDate(a.created) + (a.receiptNo ? ' · ' + a.receiptNo : '') + (a.reason ? ' · ' + a.reason : '') + (a.rejectReason ? ' · ' + a.rejectReason : '')) + '</div>' +
        (a.status === 'APPROVED' ? '<div class="row" style="margin-top:8px;gap:6px"><button type="button" class="btn primary sm" data-act="wa" data-id="' + esc(a.id) + '">' + icon('chat', 14) + esc(t('send_receipt')) + '</button><button type="button" class="btn sm" data-act="given" data-id="' + esc(a.id) + '">' + esc(t('mark_given')) + '</button></div>' : '') +
        (a.status === 'GIVEN' ? '<div class="row" style="margin-top:8px;gap:6px"><button type="button" class="btn sm" data-act="wa" data-id="' + esc(a.id) + '">' + icon('chat', 14) + esc(t('send_receipt')) + '</button><a class="btn sm" href="#/print/receipt/' + esc(a.id) + '">' + icon('print', 14) + esc(t('print')) + '</a><button type="button" class="btn sm" data-act="signed" data-id="' + esc(a.id) + '">' + esc(t('mark_signed')) + '</button></div>' : '') +
        '</div>' + chip(a) + '</div>').join('') || '<div class="empty">' + esc(t('no_advances')) + '</div>') + '</div></section>';
    C.bind(view, {
      new: () => advanceForm(),
      wa: el => { const a = d.advances.find(x => x.id === el.dataset.id); const w = UB.idx.workers[a.workerId] || {}; C.whatsapp(w.phone, UB.receiptText(a)); },
      given: el => C.busy(el, () => API.call('markAdvance', { id: el.dataset.id, status: 'GIVEN' })).then(() => UB.refresh()).catch(() => {}),
      signed: el => C.busy(el, () => API.call('markAdvance', { id: el.dataset.id, status: 'SIGNED' })).then(() => UB.refresh()).catch(() => {})
    });
  };

  // =========================================================== interim report
  S.interim = function (view, route) {
    const d = UB.data, ws = myWorkers();
    const wid = route.q.w || '';
    const plan = UB.planDays(d.month);
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('act_report')) + '</h1></div>' +
      '<form class="card form" id="if">' + fld(t('worker'), '<select name="workerId" required>' + C.options(ws, wid, 'id', null, '—') + '</select>') +
      (plan ? '<div class="small muted">' + esc(t('plan_days_admin', { n: plan })) + '</div>' : fld(t('plan_days'), '<input name="planDays" type="number" min="1" max="31" required inputmode="numeric">', t('plan_days_foreman_hint'))) +
      '<button type="submit" class="btn primary block">' + esc(t('calculate')) + '</button></form><div id="ir"></div>';
    const form = view.querySelector('#if');
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (!form.reportValidity()) return;
      const f = C.formData(form);
      await C.busy(form.querySelector('button'), async () => {
        const r = await API.call('interim', { workerId: f.workerId, planDays: f.planDays, month: d.month });
        renderInterim(view.querySelector('#ir'), r);
      }).catch(() => {});
    });
    if (wid) form.requestSubmit && plan && form.requestSubmit();
  };

  function interimText(r) {
    const L = r.worker.lang || 'az', l = r.line || {};
    const tt = (k, v) => t(k, v, L);
    const lines = ['Ustabaşı · ' + tt('interim_title') + ' · ' + C.monthName(r.month).replace(/^\S+/, m => tt('months').split(',')[Number(r.month.slice(5, 7)) - 1] || m), tt('as_of') + ': ' + r.asOf, tt('worker') + ': ' + r.worker.name, tt('days_worked') + ': ' + (l.daysWorked || 0) + (r.worker.payType === 'MONTH' && l.planDays ? ' / ' + l.planDays : '')];
    if (l.total !== undefined) {
      if (r.worker.payModel !== 'BONUS') lines.push(tt('col_std') + ': ' + C.money(l.S));
      if (r.worker.payModel !== 'STD') lines.push(tt('bonus_approved') + ': ' + C.money(l.bonus));
      if (C.n(l.pendingBonus)) lines.push(tt('bonus_pending') + ': ' + C.money(l.pendingBonus) + ' (' + tt('not_in_total') + ')');
      if (C.n(l.advance)) lines.push(tt('col_adv') + ': −' + C.money(l.advance));
      if (C.n(l.penalty)) lines.push(tt('col_pen') + ': −' + C.money(l.penalty));
      if (C.n(l.correction)) lines.push(tt('col_corr') + ': ' + C.money(l.correction));
      lines.push(tt('current_balance') + ': ' + C.money(l.total));
    }
    lines.push(tt('not_final'));
    return lines.join('\n');
  }

  function renderInterim(box, r) {
    const text = interimText(r);
    box.innerHTML = '<section class="card"><div class="card-head"><b>' + esc(r.worker.name) + '</b><span class="chip">' + esc(t('lang_of_worker')) + ': ' + esc((r.worker.lang || 'az').toUpperCase()) + '</span></div>' +
      '<pre style="margin:0;white-space:pre-wrap;font-family:var(--mono);font-size:13px;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:12px">' + esc(text) + '</pre>' +
      '<button type="button" class="btn primary big block" data-wa>' + icon('chat', 18) + esc(t('send_whatsapp')) + '</button><button type="button" class="btn" data-copy>' + icon('copy', 16) + esc(t('copy')) + '</button></section>';
    box.querySelector('[data-wa]').addEventListener('click', () => C.whatsapp(r.worker.phone, text));
    box.querySelector('[data-copy]').addEventListener('click', () => C.copyText(text));
  }

  // =========================================================== sites
  S.sites = function (view) {
    const d = UB.data;
    const stChip = s => '<span class="chip ' + ({ APPROVED: 'ok', PENDING: 'warn', REJECTED: 'bad' }[s.status] || '') + '">' + esc(t('site_' + s.status)) + '</span>';
    view.innerHTML = '<div class="page-head"><h1>' + esc(t('nav_sites_short')) + '</h1><button type="button" class="btn primary" data-act="add">' + icon('plus', 16) + esc(t('new_site')) + '</button></div>' +
      '<section class="card" style="gap:4px"><div class="list">' + (d.sites.map(s => '<div class="list-row click" data-act="s" data-id="' + esc(s.id) + '"><div class="grow"><div class="title">' + esc(s.name) + '</div><div class="meta">' + esc(((UB.idx.customers[s.customerId] || {}).name || '') + ' · ' + (s.address || '') + ' · ' + t('radius_m', { m: s.radius })) + '</div></div>' + stChip(s) + '</div>').join('') || '<div class="empty">' + esc(t('no_sites')) + '</div>') + '</div></section>';
    C.bind(view, {
      add: () => F.site(),
      s: el => {
        const s = UB.idx.sites[el.dataset.id];
        const dlg = C.dialog({
          title: s.name,
          body: '<div class="kv"><span>' + esc(t('customer')) + '</span><span>' + esc((UB.idx.customers[s.customerId] || {}).name || '—') + '</span><span>' + esc(t('address')) + '</span><span>' + esc(s.address || '—') + '</span><span>' + esc(t('coords')) + '</span><span><a target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + esc(s.lat) + ',' + esc(s.lng) + '">' + esc(t('check_on_map')) + '</a> · ' + esc(t('radius_m', { m: s.radius })) + '</span><span>' + esc(t('status')) + '</span><span>' + stChip(s) + '</span></div>' +
            (s.status === 'APPROVED' ? '<div class="notice">' + esc(t('site_coords_change')) + '</div>' : ''),
          foot: '<button type="button" class="btn" data-close>' + esc(t('close')) + '</button><button type="button" class="btn primary" data-edit>' + icon('edit', 16) + esc(t('edit')) + '</button>'
        });
        dlg.querySelector('[data-edit]').addEventListener('click', () => { dlg.close(); F.site(s); });
      }
    });
  };
})();
