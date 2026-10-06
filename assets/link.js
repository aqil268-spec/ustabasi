/* Ustabaşı — ustanın 1 dəfəlik link səhifəsi (u.html) */
(function () {
  'use strict';
  const C = window.UBCore;
  const { t, esc, icon, logo } = C;
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';

  async function call(action, body) {
    const j = await C.API.raw(Object.assign({ action, t: token }, body || {}));
    if (!j || !j.ok) throw C.err((j && j.error) || 'server', j && j.detail);
    return j.data;
  }

  let info = null, timer = null, offset = 0, langChosen = false;
  const root = () => document.getElementById('app');

  function header() {
    const l = C.getLang();
    return '<div class="row" style="justify-content:space-between;min-height:44px"><div class="row" style="gap:8px">' + logo(28) + '<b style="font-size:17px">Ustabaşı</b></div>' +
      '<div class="seg" role="group" aria-label="' + esc(t('language')) + '">' + ['az', 'ru', 'en'].map(x => '<button type="button" data-lang="' + x + '" aria-pressed="' + (l === x) + '">' + x.toUpperCase() + '</button>').join('') + '</div></div>';
  }

  function page(inner) {
    root().innerHTML = '<div class="link-page">' + header() + inner + '</div>';
    root().querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { C.setLang(b.dataset.lang); langChosen = true; render(); }));
  }

  function stateMsg(title, text, kind) {
    page('<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center">' +
      '<div style="width:72px;height:72px;border-radius:36px;display:flex;align-items:center;justify-content:center;background:' + (kind === 'bad' ? 'var(--bad-bg)' : 'var(--card)') + ';color:' + (kind === 'bad' ? 'var(--bad)' : 'var(--muted)') + '">' + icon(kind === 'bad' ? 'x' : 'clock', 34) + '</div>' +
      '<h1>' + esc(title) + '</h1><p class="muted" style="font-size:16px;line-height:1.5">' + esc(text) + '</p></div>');
  }

  function success(title, lines) {
    page('<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center">' +
      logo(148, { animate: true, ring: '#3DD68C' }) + '<h1 style="font-size:30px">' + esc(title) + '</h1>' + lines + '</div>');
  }

  function left() {
    if (!info) return 0;
    const exp = Date.parse(String(info.expires).replace(' ', 'T'));
    return Math.max(0, Math.round((exp - (Date.now() + offset)) / 1000));
  }

  function render() {
    clearInterval(timer);
    if (!info) return;
    if (info.used) {
      if (info.result) return success(t('u_already_done'), '<div class="mono" style="font-size:22px;color:var(--ok)">' + esc(C.fmtTime(info.result.ts)) + '</div>');
      return stateMsg(t('u_used_title'), t('u_used_text'));
    }
    if (info.expired || left() <= 0) return stateMsg(t('u_expired_title'), t('u_expired_text', { name: info.foreman }));
    if (info.kind === 'WORK') return renderWork();
    renderAttendance();
  }

  function renderAttendance(far) {
    const kindIn = info.kind === 'IN';
    const first = String(info.worker.name || '').split(' ')[0];
    const R = 110; // px for radius
    let meStyle = '', radarCls = 'radar unknown', meLabel = '';
    if (far) {
      radarCls = 'radar far';
      meStyle = 'left:' + (116 + R + 8) + 'px;top:40px';
      meLabel = '<div style="position:absolute;right:-6px;top:14px;font-size:12px;font-weight:600;color:var(--bad)" class="mono">' + esc(t('you')) + ' · ' + esc(fmtDist(far.dist)) + '</div>';
    }
    page('<div class="stack" style="gap:4px"><h1>' + esc(t(kindIn ? 'u_in_title' : 'u_out_title')) + '</h1><div class="muted" style="font-size:15px">' + esc(t('u_sent_by', { name: info.foreman, worker: first })) + '</div></div>' +
      '<div class="card tight"><div class="kv"><span>' + esc(t('site')) + '</span><span style="font-weight:600">' + esc(info.site.name + (info.site.address ? ', ' + info.site.address : '')) + '</span>' +
      '<span>' + esc(t('schedule')) + '</span><span class="mono">' + esc((info.worker.startTime || '') + ' – ' + (info.worker.endTime || '')) + '</span>' +
      '<span>' + esc(t('link')) + '</span><span class="mono" style="color:var(--warn)" id="cd"></span></div></div>' +
      '<div class="' + radarCls + '"><div class="ring"></div><div class="ring2"></div><div class="site">' + logo(26, { stroke: '#16191D' }) + '</div>' +
      '<div class="me" style="' + meStyle + '"><i class="me-ping"></i><b></b></div>' + meLabel +
      '<div style="position:absolute;left:0;right:0;bottom:-4px;text-align:center;font-size:12px;color:var(--muted)">' + esc(t('radius_m', { m: info.site.radius })) + '</div></div>' +
      (far ? '<div class="notice warn" role="alert">' + esc(t('u_too_far', { d: fmtDist(far.dist), r: far.radius })) + '</div>' : '<div class="small muted" style="text-align:center">' + esc(t('u_gps_note')) + '</div>') +
      '<div style="margin-top:auto" class="stack"><button type="button" class="btn primary big block" id="go">' + esc(t(far ? 'u_try_again' : (kindIn ? 'u_confirm_in' : 'u_confirm_out'))) + '</button>' +
      '<div class="tiny muted" style="text-align:center">' + esc(t('u_once')) + '</div></div>');
    tick(); timer = setInterval(tick, 1000);
    document.getElementById('go').addEventListener('click', confirmAttendance);
  }

  function tick() {
    const el = document.getElementById('cd');
    const s = left();
    if (!el) return;
    if (s <= 0) { clearInterval(timer); render(); return; }
    el.textContent = t('u_left', { t: C.pad(Math.floor(s / 60)) + ':' + C.pad(s % 60) });
  }

  function fmtDist(m) { m = C.n(m); return m >= 1000 ? (Math.round(m / 100) / 10).toString().replace('.', ',') + ' km' : Math.round(m) + ' m'; }

  async function confirmAttendance(e) {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = '<i class="spin"></i>' + esc(t('u_locating'));
    try {
      const pos = await C.getPosition();
      btn.innerHTML = '<i class="spin"></i>' + esc(t('u_sending'));
      const r = await call('tokenConfirm', pos);
      if (r && r.ok === false && r.error === 'too_far') { renderAttendance(r); return; }
      clearInterval(timer);
      const late = info.kind === 'IN' && C.n(r.diffMin) > 15 ? '<div class="chip warn">' + esc(t('st_late', { m: C.n(r.diffMin) })) + '</div>' : '';
      success(t('u_done', { name: String(info.worker.name).split(' ')[0] }),
        '<div class="mono" style="font-size:22px;color:var(--ok)">' + esc(t(info.kind === 'IN' ? 'kind_in' : 'kind_out')) + ' · ' + esc(C.fmtTime(r.ts)) + '</div>' + late +
        '<div class="muted" style="font-size:15px;line-height:1.5">' + esc(info.site.name) + ' · ' + esc(fmtDist(r.dist)) + '<br>' + esc(t('u_foreman_notified', { name: info.foreman })) + '</div>' +
        (info.kind === 'IN' ? '<div class="chip" style="margin-top:8px">' + esc(t('u_out_later')) + '</div>' : ''));
    } catch (err) {
      if (['link_used', 'link_expired', 'link_not_found'].indexOf(err.code) >= 0) { info.used = err.code === 'link_used'; info.expired = err.code === 'link_expired'; return render(); }
      C.toast(C.errorText(err), true);
      btn.disabled = false; btn.textContent = t('u_try_again');
    }
  }

  function renderWork() {
    const w = info.work || {};
    page('<div class="stack" style="gap:4px"><h1>' + esc(t('u_work_title')) + '</h1><div class="muted" style="font-size:15px">' + esc(t('u_work_sub', { name: info.foreman })) + '</div></div>' +
      '<div class="card"><div class="kv"><span>' + esc(t('date')) + '</span><span>' + esc(C.fmtDate(w.date, true)) + '</span>' +
      '<span>' + esc(t('site')) + '</span><span>' + esc(info.site.name) + '</span>' +
      '<span>' + esc(t('work_type')) + '</span><span style="font-weight:600">' + esc(w.type) + '</span>' +
      '<span>' + esc(t('total_qty')) + '</span><span class="mono">' + C.num(w.qty) + ' ' + esc(w.unit) + '</span>' +
      '<span>' + esc(t('your_part')) + '</span><span class="mono" style="font-size:20px;color:var(--accent-text);font-weight:600">' + C.num(w.myQty) + ' ' + esc(w.unit) + ' · ' + C.num(w.share) + '%</span></div></div>' +
      '<div style="margin-top:auto" class="stack"><button type="button" class="btn primary big block" id="yes">' + esc(t('u_work_yes')) + '</button>' +
      '<button type="button" class="btn block" id="no">' + esc(t('u_work_no')) + '</button><div class="tiny muted" style="text-align:center">' + esc(t('u_once')) + '</div></div>');
    document.getElementById('yes').addEventListener('click', ev => sendWork(ev.currentTarget, false));
    document.getElementById('no').addEventListener('click', async ev => {
      const reason = await C.promptDlg(t('u_work_no'), t('u_work_no_reason'), { textarea: true, ok: t('send') });
      if (reason === null) return;
      sendWork(ev.currentTarget, true, reason);
    });
  }

  async function sendWork(btn, reject, reason) {
    btn.disabled = true;
    try {
      await call('tokenConfirm', { reject: !!reject, reason: reason || '' });
      if (reject) return stateMsg(t('u_work_rejected'), t('u_work_rejected_text', { name: info.foreman }));
      success(t('u_work_done'), '<div class="muted" style="font-size:15px;line-height:1.5">' + esc(info.work.type) + ' · ' + C.num(info.work.myQty) + ' ' + esc(info.work.unit) + '<br>' + esc(t('u_work_next')) + '</div>');
    } catch (err) {
      if (['link_used', 'link_expired'].indexOf(err.code) >= 0) { info.used = err.code === 'link_used'; info.expired = err.code === 'link_expired'; return render(); }
      C.toast(C.errorText(err), true); btn.disabled = false;
    }
  }

  async function start() {
    C.setLang(C.LS.get('ub_lang') || 'az');
    root().innerHTML = '<div class="loading" style="min-height:100vh"><i></i></div>';
    if (!token) return stateMsg(t('u_bad_title'), t('u_bad_text'), 'bad');
    try {
      info = await call('tokenInfo');
      offset = Date.parse(String(info.now)) - Date.now();
      if (!isFinite(offset)) offset = 0;
      if (!langChosen && info.worker && info.worker.lang) C.setLang(info.worker.lang);
      render();
    } catch (err) {
      if (err.code === 'link_not_found') return stateMsg(t('u_bad_title'), t('u_bad_text'), 'bad');
      stateMsg(t('err_title'), C.errorText(err), 'bad');
    }
  }
  start();
})();
