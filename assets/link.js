/* Master — usta və müştəri linki (u.html): gəliş/çıxış, iş təsdiqi, avans və ödəniş təsdiqi */
(function () {
  'use strict';
  const C = window.UBCore;
  const { t, esc, icon, logo } = C;
  const params = new URLSearchParams(location.search);
  const token = params.get('t') || '';

  /** Hər sorğuya telefonun kimliyi (link 1 telefona bağlanır) və işçi sessiyası (varsa — link açılmır, K-18) gedir. */
  async function call(action, body) {
    const j = await C.API.raw(Object.assign({ action, t: token, d: C.deviceId(), st: C.LS.get('ub_token') || '', ua: navigator.userAgent.slice(0, 160) }, body || {}));
    if (!j || !j.ok) throw C.err((j && j.error) || 'server', j && j.detail);
    return j.data;
  }

  let info = null, timer = null, offset = 0, langChosen = false;
  const root = () => document.getElementById('app');

  function header() {
    const l = C.getLang();
    return '<div class="row" style="justify-content:space-between;min-height:44px"><div class="row" style="gap:8px">' + logo(28) + '<b style="font-size:17px">Master</b></div>' +
      '<div class="seg" role="group" aria-label="' + esc(t('language')) + '">' + C.LANGS.map(x => '<button type="button" data-lang="' + x + '" aria-pressed="' + (l === x) + '">' + x.toUpperCase() + '</button>').join('') + '</div></div>';
  }

  function page(inner) {
    root().innerHTML = '<div class="link-page">' + header() + inner + '</div>';
    root().querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { C.setLang(b.dataset.lang, true); langChosen = true; render(); }));
  }

  function stateMsg(title, text, kind) {
    page('<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center">' +
      '<div style="width:72px;height:72px;border-radius:36px;display:flex;align-items:center;justify-content:center;background:' + (kind === 'bad' ? 'var(--bad-bg)' : 'var(--card)') + ';color:' + (kind === 'bad' ? 'var(--bad)' : 'var(--muted)') + '">' + icon(kind === 'bad' ? (kind === 'lock' ? 'lock' : 'x') : 'clock', 34) + '</div>' +
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

  function from() { return info.kind === 'PAY' ? (info.pay || {}).company : info.foreman; }

  function render() {
    clearInterval(timer);
    if (!info) return;
    if (info.used) {
      if (info.result && info.result.ts) return success(t('u_already_done'), '<div class="mono" style="font-size:22px;color:var(--ok)">' + esc(C.fmtTime(info.result.ts)) + '</div>');
      if (info.result && (info.kind === 'ADV' || info.kind === 'PAY')) return moneyDone(info.result.match, info.result.receipt);
      return stateMsg(t('u_used_title'), t('u_used_text'));
    }
    if (info.cancelled) return stateMsg(t('u_cancelled_title'), t('u_cancelled_text', { name: from() }));
    if (info.expired || left() <= 0) return stateMsg(t('u_expired_title'), t('u_expired_text', { name: from() }));
    if (info.kind === 'WORK') return renderWork();
    if (info.kind === 'ADV' || info.kind === 'PAY') return renderMoney();
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
      '<div class="tiny muted" style="text-align:center">' + esc(t('u_once_phone')) + '</div></div>');
    tick(); timer = setInterval(tick, 1000);
    document.getElementById('go').addEventListener('click', confirmAttendance);
  }

  function tick() {
    const el = document.getElementById('cd');
    const s = left();
    if (!el) return;
    if (s <= 0) { clearInterval(timer); render(); return; }
    const h = Math.floor(s / 3600);
    el.textContent = t('u_left', { t: (h ? h + ':' : '') + C.pad(Math.floor(s % 3600 / 60)) + ':' + C.pad(s % 60) });
  }

  function fmtDist(m) { m = C.n(m); return m >= 1000 ? (Math.round(m / 100) / 10).toString().replace('.', ',') + ' km' : Math.round(m) + ' m'; }

  function handleErr(err, btn, label) {
    const map = { link_used: 'used', link_expired: 'expired', link_cancelled: 'cancelled' };
    // Cavab itəndə (zəif internet) usta yenidən basır: link artıq istifadə olunub — nəticəni serverdən götürürük.
    if (err.code === 'link_used' || err.code === 'already_in' || err.code === 'already_out') {
      return call('tokenInfo').then(fresh => { info = fresh; info.used = true; render(); }).catch(() => { info.used = true; render(); });
    }
    if (map[err.code]) { info[map[err.code]] = true; return render(); }
    if (err.code === 'link_other_device') return stateMsg(t('u_other_device_title'), t('u_other_device_text'), 'bad');
    if (err.code === 'link_staff_device') return stateMsg(t('u_staff_device_title'), t('u_staff_device_text'), 'bad');
    C.toast(C.errorText(err), true);
    if (btn) { btn.disabled = false; btn.textContent = label || t('u_try_again'); }
  }

  async function confirmAttendance(e) {
    const btn = e.currentTarget;
    btn.disabled = true; btn.innerHTML = '<i class="spin"></i>' + esc(t('u_locating'));
    try {
      const pos = await C.getPosition();
      btn.innerHTML = '<i class="spin"></i>' + esc(t('u_sending'));
      const r = await call('tokenConfirm', pos);
      if (r && r.ok === false && r.error === 'too_far') { renderAttendance(r); return; }
      clearInterval(timer);
      const late = info.kind === 'IN' && C.n(r.diffMin) > C.n(r.late || 15) ? '<div class="chip warn">' + esc(t('st_late', { m: C.n(r.diffMin) })) + '</div>' : '';
      success(t('u_done', { name: String(info.worker.name).split(' ')[0] }),
        '<div class="mono" style="font-size:22px;color:var(--ok)">' + esc(t(info.kind === 'IN' ? 'kind_in' : 'kind_out')) + ' · ' + esc(C.fmtTime(r.ts)) + '</div>' + late +
        '<div class="muted" style="font-size:15px;line-height:1.5">' + esc(info.site.name) + ' · ' + esc(fmtDist(r.dist)) + '<br>' + esc(t('u_foreman_notified', { name: info.foreman })) + '</div>' +
        (info.kind === 'IN' ? '<div class="chip" style="margin-top:8px">' + esc(t('u_out_later')) + '</div>' : ''));
    } catch (err) { handleErr(err, btn); }
  }

  function renderWork() {
    const w = info.work || {};
    page('<div class="stack" style="gap:4px"><h1>' + esc(t('u_work_title')) + '</h1><div class="muted" style="font-size:15px">' + esc(t('u_work_sub', { name: info.foreman })) + '</div></div>' +
      '<div class="card"><div class="kv"><span>' + esc(t('date')) + '</span><span>' + esc(C.fmtDate(w.date, true)) + '</span>' +
      '<span>' + esc(t('site')) + '</span><span>' + esc(info.site.name) + '</span>' +
      '<span>' + esc(t('work_type')) + '</span><span style="font-weight:600">' + esc(w.type) + '</span>' +
      '<span>' + esc(t('total_qty')) + '</span><span class="mono">' + C.num(w.qty) + ' ' + esc(w.unit) + '</span>' +
      '<span>' + esc(t('your_part')) + '</span><span class="mono" style="font-size:20px;color:var(--accent-text);font-weight:600">' + C.num(w.myQty) + ' ' + esc(w.unit) + ' · ' + C.num(w.share) + '%</span>' +
      '<span>' + esc(t('link')) + '</span><span class="mono" style="color:var(--warn)" id="cd"></span></div></div>' +
      '<div style="margin-top:auto" class="stack"><button type="button" class="btn primary big block" id="yes">' + esc(t('u_work_yes')) + '</button>' +
      '<button type="button" class="btn block" id="no">' + esc(t('u_work_no')) + '</button><div class="tiny muted" style="text-align:center">' + esc(t('u_once_phone')) + '</div></div>');
    tick(); timer = setInterval(tick, 1000);
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
      clearInterval(timer);
      if (reject) return stateMsg(t('u_work_rejected'), t('u_work_rejected_text', { name: info.foreman }));
      success(t('u_work_done'), '<div class="muted" style="font-size:15px;line-height:1.5">' + esc(info.work.type) + ' · ' + C.num(info.work.myQty) + ' ' + esc(info.work.unit) + '<br>' + esc(t('u_work_next')) + '</div>');
    } catch (err) { handleErr(err, btn, t(reject ? 'u_work_no' : 'u_work_yes')); }
  }

  // ---------- avans (usta) və müştəri ödənişi: məbləğ göstərilmir, alan/verən özü yazır (S-16)
  function renderMoney() {
    const adv = info.kind === 'ADV';
    const x = adv ? info.adv : info.pay;
    page('<div class="stack" style="gap:4px"><h1>' + esc(t(adv ? 'u_adv_title' : 'u_pay_title')) + '</h1><div class="muted" style="font-size:15px">' + esc(t(adv ? 'u_adv_sub' : 'u_pay_sub', { name: adv ? info.foreman : x.company })) + '</div></div>' +
      '<div class="card tight"><div class="kv">' +
      (adv ? '<span>' + esc(t('worker')) + '</span><span style="font-weight:600">' + esc(info.worker.name) + '</span><span>' + esc(t('foreman')) + '</span><span>' + esc(info.foreman) + '</span><span>' + esc(t('date')) + '</span><span>' + esc(C.fmtDate(x.date, true)) + '</span>'
        : '<span>' + esc(t('customer')) + '</span><span style="font-weight:600">' + esc(x.customer) + '</span><span>' + esc(t('site')) + '</span><span>' + esc(x.site) + '</span><span>' + esc(t('date')) + '</span><span>' + esc(C.fmtDate(x.date, true)) + '</span><span>' + esc(t('pdf_receiver')) + '</span><span>' + esc(x.by || x.company) + '</span>') +
      '<span>' + esc(t('link')) + '</span><span class="mono" style="color:var(--warn)" id="cd"></span></div></div>' +
      '<form class="stack" id="mf"><label class="field"><span style="font-size:15px;color:var(--text)">' + esc(t(adv ? 'u_adv_q' : 'u_pay_q')) + '</span>' +
      '<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required style="font-size:28px;min-height:64px;font-family:var(--mono);text-align:center" placeholder="0.00"></label>' +
      '<div class="small muted">' + esc(t('u_money_note')) + '</div>' +
      '<button type="submit" class="btn primary big block" id="go">' + esc(t('u_money_send')) + '</button>' +
      '<div class="tiny muted" style="text-align:center">' + esc(t('u_once_phone')) + '</div></form>');
    tick(); timer = setInterval(tick, 1000);
    const f = document.getElementById('mf');
    f.addEventListener('submit', async e => {
      e.preventDefault(); if (!f.reportValidity()) return;
      const amount = C.round2(f.amount.value);
      const ok = await C.confirmDlg(t('u_money_confirm', { v: C.money(amount) }), t('u_money_send'));
      if (!ok) return;
      const btn = document.getElementById('go');
      btn.disabled = true; btn.innerHTML = '<i class="spin"></i>' + esc(t('u_sending'));
      try {
        const r = await call('tokenConfirm', { amount });
        clearInterval(timer);
        moneyDone(r.match, r.receipt);
      } catch (err) { handleErr(err, btn, t('u_money_send')); }
    });
  }

  function moneyDone(match, receipt) {
    if (!match) return stateMsg(t('u_money_diff_title'), t('u_money_diff_text'));
    success(t('u_money_ok'), '<div class="muted" style="font-size:15px;line-height:1.5">' + esc(t(info.kind === 'ADV' ? 'u_adv_ok_text' : 'u_pay_ok_text')) + '</div>' +
      (receipt ? '<div class="mono" style="font-size:22px;color:var(--ok)">' + C.money(receipt.amount) + '</div><button type="button" class="btn big" id="pdf">' + icon('download', 18) + esc(t('u_download_pdf')) + '</button>' : ''));
    const b = document.getElementById('pdf');
    if (b) b.addEventListener('click', () => C.busy(b, () => C.sharePdf(C.receiptPdf(receipt, C.getLang()), (info.kind === 'ADV' ? 'avans-' : 'qebz-') + String(receipt.no || '').replace(/[^\w-]+/g, '') + '.pdf')).catch(() => {}));
  }

  async function start() {
    C.setLang(C.LS.get('ub_lang') || 'az', true);
    root().innerHTML = '<div class="loading" style="min-height:100vh"><i></i></div>';
    if (!token) return stateMsg(t('u_bad_title'), t('u_bad_text'), 'bad');
    try {
      info = await call('tokenInfo');
      offset = Date.parse(String(info.now)) - Date.now();
      if (!isFinite(offset)) offset = 0;
      if (!langChosen && info.lang) C.setLang(info.lang, true);
      render();
    } catch (err) {
      if (err.code === 'link_not_found') return stateMsg(t('u_bad_title'), t('u_bad_text'), 'bad');
      if (err.code === 'link_other_device') return stateMsg(t('u_other_device_title'), t('u_other_device_text'), 'bad');
      if (err.code === 'link_staff_device') return stateMsg(t('u_staff_device_title'), t('u_staff_device_text'), 'bad');
      stateMsg(t('err_title'), C.errorText(err), 'bad');
      // Zəif internet: "Yenidən cəhd et" düyməsi (connection testi)
      if (err.code === 'network' || err.code === 'busy' || err.code === 'server') {
        const box = root().querySelector('.link-page > div:last-child');
        if (box) { box.insertAdjacentHTML('beforeend', '<button type="button" class="btn primary big" id="retry">' + esc(t('u_try_again')) + '</button>'); document.getElementById('retry').addEventListener('click', start); }
      }
    }
  }
  start();
})();
