/* Ustabaşı — ümumi köməkçilər: API, dil, format, dialoq, ikonlar */
(function () {
  'use strict';
  const CFG = window.USTABASI_CONFIG || {};
  // Server ünvanı (Google Apps Script web app). config.js-də də yazılıb; orada boş qalsa, bu istifadə olunur.
  const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbwPQJU6BvlmpywJfDCacbq7nasT_4LLwT0x1aOvqRwLTxCY8uEixqXZiiO-pUSFoQ/exec';
  const TIMEOUT_MS = 60000;

  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };

  function err(code, detail) { const e = new Error(code); e.code = code; e.detail = detail; return e; }

  const API = {
    log: [],
    url() { return String(CFG.API_URL || DEFAULT_API).trim(); },
    token() { return LS.get('ub_token'); },
    /** Sorğu göndərir; vaxtı ölçür (diaqnostika üçün). */
    async call(action, params) {
      const j = await this.raw(Object.assign({ action, token: this.token() }, params || {}));
      if (!j || !j.ok) throw err((j && j.error) || 'server', j && j.detail);
      return j.data;
    },
    async raw(body) {
      const url = this.url();
      const t0 = performance.now();
      let j, size = 0;
      if (url === 'mock' && window.__mockCall) {
        j = await window.__mockCall(JSON.parse(JSON.stringify(body)));
        size = JSON.stringify(j).length;
      } else {
        if (!url) throw err('no_api');
        const ctl = window.AbortController ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
        let text;
        try {
          const res = await fetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl ? ctl.signal : undefined });
          text = await res.text();
        } catch (e) { throw err('network'); }
        finally { if (timer) clearTimeout(timer); }
        size = text.length;
        try { j = JSON.parse(text); } catch (e) { throw err('server'); }
      }
      const rec = { action: body.action, ms: Math.round(performance.now() - t0), server: j && j.ms, reads: j && j.db ? j.db.reads : null, cached: j && j.db ? j.db.cached : null, kb: Math.round(size / 102.4) / 10, at: Date.now() };
      this.log.unshift(rec); if (this.log.length > 30) this.log.length = 30;
      return j;
    },
    /** Serveri "oyadır" (Google-un soyuq başlanğıcı) — giriş ekranı açılan kimi. */
    warm() {
      if (this._warm) return this._warm;
      this._warm = this.raw({ action: 'ping' }).catch(() => null);
      return this._warm;
    }
  };

  // ---------- language ----------
  let lang = LS.get('ub_lang') || 'az';
  function setLang(l) { lang = ['az', 'ru', 'en'].indexOf(l) >= 0 ? l : 'az'; LS.set('ub_lang', lang); document.documentElement.lang = lang; }
  function getLang() { return lang; }
  function t(key, vars, forLang) {
    const D = window.I18N || {};
    const d = D[forLang || lang] || {};
    let s = d[key];
    if (s === undefined) s = (D.az || {})[key];
    if (s === undefined) s = key;
    if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function errorText(e) {
    const code = (e && (e.code || e.message)) || 'server';
    const k = 'err_' + code;
    const s = t(k);
    return s === k ? t('err_server') + (e && e.detail ? ' (' + e.detail + ')' : '') : s;
  }

  // ---------- format ----------
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function n(v) { const x = Number(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; }
  function round2(v) { return Math.round((n(v) + Number.EPSILON) * 100) / 100; }
  function num(v, dec) {
    const x = round2(v), neg = x < 0;
    let [i, d] = Math.abs(x).toFixed(dec === undefined ? 2 : dec).split('.');
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + i + (d && Number(d) !== 0 ? '.' + d : '');
  }
  function money(v) { return num(v) + ' ₼'; }
  function pad(x) { return String(x).padStart(2, '0'); }
  function todayISO() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthISO(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function shiftMonth(m, k) { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return monthISO(d); }
  function fmtDate(s, withYear) {
    if (!s) return '';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    const months = t('months_short').split(',');
    return Number(d) + ' ' + (months[Number(m) - 1] || m) + (withYear ? ' ' + y : '');
  }
  function fmtTime(ts) { const m = String(ts || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : String(ts || '').slice(0, 5); }
  function monthName(m) { const [y, mo] = String(m).split('-'); return (t('months').split(',')[Number(mo) - 1] || mo) + ' ' + y; }
  function weekday(d) { return t('weekdays').split(',')[(d || new Date()).getDay()]; }
  function initials(name) { return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join(''); }
  function shortName(name) { const p = String(name || '').split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[1][0] + '.' : p[0] || ''; }

  // ---------- icons (stroke) ----------
  const P = {
    home: '<path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-5h4v5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.2.7 3.5 2.4 3.5 5.2"/>',
    pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16 10"/>',
    file: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 12h6M9 16h4"/>',
    bars: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
    chat: '<path d="M4 20l1.5-4.5A8 8 0 1 1 9 19z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    map: '<path d="M9 4l6 2 5-2v15l-5 2-6-2-5 2V6z"/><path d="M9 4v15M15 6v15"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'
  };
  function icon(name, size) {
    const s = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || '') + '</svg>';
  }
  function logo(size, opts) {
    const o = opts || {};
    const pin = o.pin || '#FF7A1A', stroke = o.stroke || '#16191D', ring = o.ring || '#FF7A1A';
    const a = o.animate;
    return '<svg viewBox="0 0 64 64" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      (a ? '<ellipse class="lg-ring" cx="32" cy="59" rx="9" ry="3" fill="none" stroke="' + ring + '" stroke-width="1.6"/>' : '') +
      '<g class="' + (a ? 'lg-pin' : '') + '"><path d="M32 4C20.4 4 11 13.2 11 24.6 11 39 32 58 32 58S53 39 53 24.6C53 13.2 43.6 4 32 4Z" fill="' + pin + '"/>' +
      '<path class="' + (a ? 'lg-roof' : '') + '" d="M21 26L32 16L43 26" fill="none" stroke="' + stroke + '" stroke-width="' + (size < 40 ? 4.5 : 3.6) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="' + (a ? 'lg-check' : '') + '" d="M24.5 31.5L30 37L40 27" fill="none" stroke="' + stroke + '" stroke-width="' + (size < 40 ? 4.5 : 3.6) + '" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  }

  // ---------- UI primitives ----------
  let toastTimer = null;
  function toast(msg, bad) {
    let el = document.getElementById('ub-toast');
    if (!el) { el = document.createElement('div'); el.id = 'ub-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast' + (bad ? ' bad' : '');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, bad ? 5000 : 2600);
  }

  function dialog(opts) {
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.innerHTML = '<div class="dlg-head"><h2>' + esc(opts.title || '') + '</h2><button type="button" class="btn icon ghost" data-close aria-label="' + esc(t('close')) + '">' + icon('x') + '</button></div>' +
      '<div class="dlg-body">' + (opts.body || '') + '</div>' + (opts.foot ? '<div class="dlg-foot">' + opts.foot + '</div>' : '');
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target.closest('[data-close]')) d.close(); });
    d.addEventListener('close', () => { d.remove(); if (opts.onClose) opts.onClose(); });
    d.showModal();
    if (opts.onMount) opts.onMount(d);
    return d;
  }

  function confirmDlg(text, okLabel, danger) {
    return new Promise(resolve => {
      let done = false;
      const d = dialog({
        title: t('confirm'), body: '<p>' + esc(text) + '</p>',
        foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-ok>' + esc(okLabel || t('yes')) + '</button>',
        onClose: () => { if (!done) resolve(false); }
      });
      d.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); d.close(); });
    });
  }

  function promptDlg(title, label, opts) {
    const o = opts || {};
    return new Promise(resolve => {
      let done = false;
      const d = dialog({
        title, body: '<label class="field"><span>' + esc(label) + '</span>' + (o.textarea ? '<textarea name="v" required></textarea>' : '<input name="v" type="' + (o.type || 'text') + '" value="' + esc(o.value || '') + '" ' + (o.required === false ? '' : 'required') + '>') + '</label>',
        foot: '<button type="button" class="btn" data-close>' + esc(t('cancel')) + '</button><button type="button" class="btn primary" data-ok>' + esc(o.ok || t('save')) + '</button>',
        onClose: () => { if (!done) resolve(null); },
        onMount: dd => { const i = dd.querySelector('[name=v]'); i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter' && !o.textarea) { e.preventDefault(); dd.querySelector('[data-ok]').click(); } }); }
      });
      d.querySelector('[data-ok]').addEventListener('click', () => {
        const v = d.querySelector('[name=v]').value.trim();
        if (!v && o.required !== false) { d.querySelector('[name=v]').focus(); return; }
        done = true; resolve(v); d.close();
      });
    });
  }

  async function busy(btn, fn) {
    if (btn && btn.disabled) return;
    const html = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="spin"></i>' + esc(btn.textContent.trim()); }
    try { return await fn(); }
    catch (e) { toast(errorText(e), true); throw e; }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
  }

  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    return o;
  }

  function bind(root, handlers) {
    root.onclick = e => {
      const el = e.target.closest('[data-act]');
      if (!el || !root.contains(el)) return;
      const fn = handlers[el.dataset.act];
      if (!fn) return;
      if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault();
      fn(el, e);
    };
  }

  function options(list, selected, valueKey, labelFn, empty) {
    return (empty !== undefined ? '<option value="">' + esc(empty) + '</option>' : '') +
      list.map(x => '<option value="' + esc(x[valueKey || 'id']) + '"' + (String(x[valueKey || 'id']) === String(selected) ? ' selected' : '') + '>' + esc(labelFn ? labelFn(x) : x.name) + '</option>').join('');
  }

  // ---------- links & WhatsApp ----------
  function appBase() {
    if (CFG.APP_URL) return CFG.APP_URL.replace(/\/?$/, '/');
    return location.origin + location.pathname.replace(/[^/]*$/, '');
  }
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function fromB64url(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function linkUrl(token) { return appBase() + 'u.html?t=' + encodeURIComponent(token); }
  function waPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 9) d = '994' + d; if (d.length === 10 && d[0] === '0') d = '994' + d.slice(1); return d; }
  function whatsapp(phone, text) {
    const url = 'https://wa.me/' + waPhone(phone) + '?text=' + encodeURIComponent(text);
    const w = window.open(url, '_blank');
    if (!w) location.href = url;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast(t('copied')); }
    catch (e) { prompt(t('copy'), text); }
  }

  // ---------- geolocation & photos ----------
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(err('no_gps'));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: round6(p.coords.latitude), lng: round6(p.coords.longitude), acc: Math.round(p.coords.accuracy || 0) }),
        e => reject(err(e.code === 1 ? 'gps_denied' : 'no_gps')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }
  function round6(x) { return Math.round(x * 1e6) / 1e6; }

  function compressImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, (maxSide || 1280) / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality || 0.72));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(err('bad_image')); };
      img.src = url;
    });
  }

  function downloadCsv(name, rows) {
    const csv = '﻿' + rows.map(r => r.map(c => { const s = String(c === undefined || c === null ? '' : c); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  window.UBCore = {
    CFG, LS, API, err, t, setLang, getLang, errorText,
    esc, n, round2, num, money, pad, todayISO, monthISO, shiftMonth, fmtDate, fmtTime, monthName, weekday, initials, shortName,
    icon, logo, toast, dialog, confirmDlg, promptDlg, busy, formData, bind, options,
    appBase, linkUrl, b64url, fromB64url, waPhone, whatsapp, copyText, getPosition, compressImage, downloadCsv
  };
})();
