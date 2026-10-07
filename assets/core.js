/* Master — ümumi köməkçilər: API, dil, format, dialoq, ikonlar, PDF, offline növbə */
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
  const LANGS = ['az', 'ru', 'en', 'tr'];
  const LANG_NAMES = { az: 'Azərbaycan', ru: 'Русский', en: 'English', tr: 'Türkçe' };
  let lang = LS.get('ub_lang') || 'az';
  function setLang(l, temp) { lang = LANGS.indexOf(l) >= 0 ? l : 'az'; if (!temp) LS.set('ub_lang', lang); document.documentElement.lang = lang; }
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
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5h.01"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    journal: '<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z"/><path d="M6 3v18M10 8h5M10 12h5M10 16h3"/>',
    offline: '<path d="M3 3l18 18"/><path d="M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4-2.5M12 8.5c2.8 0 5.3 1.1 7 2.9M12 20h.01"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
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
    // Excel-də düstur kimi işləyə biləcək mətn qorunur (T-07).
    const safe = s => /^[=+\-@]/.test(s) && !/^[+-]?\d/.test(s) ? "'" + s : s;
    const csv = '\ufeff' + rows.map(r => r.map(c => { const s = safe(String(c === undefined || c === null ? '' : c)); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }


  // ---------- device id (link 1 telefona bağlanır — BR-63) ----------
  function deviceId() {
    let d = LS.get('ub_dev');
    if (!d) {
      const a = new Uint8Array(16);
      (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((x, i) => { a[i] = Math.floor(Math.random() * 256); });
      d = 'd' + Array.from(a).map(b => ('0' + b.toString(16)).slice(-2)).join('');
      LS.set('ub_dev', d);
    }
    return d;
  }

  // ---------- məbləğ sözlə (PDF qəbzlər) ----------
  const W = {
    az: { u: ['sıfır', 'bir', 'iki', 'üç', 'dörd', 'beş', 'altı', 'yeddi', 'səkkiz', 'doqquz'], t: ['', 'on', 'iyirmi', 'otuz', 'qırx', 'əlli', 'altmış', 'yetmiş', 'səksən', 'doxsan'], h: 'yüz', k: 'min', m: 'milyon', cur: 'manat', sub: 'qəpik', oneH: false, oneK: false },
    tr: { u: ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'], t: ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'], h: 'yüz', k: 'bin', m: 'milyon', cur: 'manat', sub: 'kepik', oneH: false, oneK: false }
  };
  function wordsTurkic(n, L) {
    const D = W[L];
    if (n === 0) return D.u[0];
    const three = x => {
      const h = Math.floor(x / 100), r = x % 100, out = [];
      if (h) out.push((h > 1 ? D.u[h] + ' ' : '') + D.h);
      if (r >= 10) out.push(D.t[Math.floor(r / 10)]);
      if (r % 10) out.push(D.u[r % 10]);
      return out.join(' ');
    };
    const m = Math.floor(n / 1e6), k = Math.floor(n / 1000) % 1000, r = n % 1000, out = [];
    if (m) out.push(three(m) + ' ' + D.m);
    if (k) out.push((k > 1 ? three(k) + ' ' : '') + D.k);
    if (r) out.push(three(r));
    return out.join(' ');
  }
  function wordsEn(n) {
    const u = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const t = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    if (n === 0) return u[0];
    const three = x => {
      const h = Math.floor(x / 100), r = x % 100, out = [];
      if (h) out.push(u[h] + ' hundred');
      if (r) out.push(r < 20 ? u[r] : t[Math.floor(r / 10)] + (r % 10 ? '-' + u[r % 10] : ''));
      return out.join(' ');
    };
    const m = Math.floor(n / 1e6), k = Math.floor(n / 1000) % 1000, r = n % 1000, out = [];
    if (m) out.push(three(m) + ' million'); if (k) out.push(three(k) + ' thousand'); if (r) out.push(three(r));
    return out.join(' ');
  }
  function plRu(n, f) { const a = n % 100, b = n % 10; return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2]; }
  function wordsRu(n, fem) {
    const um = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const t = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const h = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    if (n === 0) return um[0];
    const three = (x, f) => {
      const out = [], r = x % 100;
      if (Math.floor(x / 100)) out.push(h[Math.floor(x / 100)]);
      if (r >= 20) { out.push(t[Math.floor(r / 10)]); if (r % 10) out.push(f && r % 10 < 3 ? ['', 'одна', 'две'][r % 10] : um[r % 10]); }
      else if (r) out.push(f && r < 3 ? ['', 'одна', 'две'][r] : um[r]);
      return out.join(' ');
    };
    const m = Math.floor(n / 1e6), k = Math.floor(n / 1000) % 1000, r = n % 1000, out = [];
    if (m) out.push(three(m, false) + ' ' + plRu(m, ['миллион', 'миллиона', 'миллионов']));
    if (k) out.push(three(k, true) + ' ' + plRu(k, ['тысяча', 'тысячи', 'тысяч']));
    if (r) out.push(three(r, fem));
    return out.join(' ');
  }
  function amountWords(v, L) {
    const x = round2(Math.abs(n(v))), whole = Math.floor(x), cents = Math.round((x - whole) * 100);
    let s;
    if (L === 'en') s = wordsEn(whole) + ' manat ' + pad(cents) + ' qapik';
    else if (L === 'ru') s = wordsRu(whole, false) + ' ' + plRu(whole, ['манат', 'маната', 'манатов']) + ' ' + pad(cents) + ' ' + plRu(cents, ['гяпик', 'гяпика', 'гяпиков']);
    else { const D = W[L] || W.az; s = wordsTurkic(whole, W[L] ? L : 'az') + ' ' + D.cur + ' ' + pad(cents) + ' ' + D.sub; }
    return s.charAt(0).toLocaleUpperCase(L === 'az' || L === 'tr' ? 'tr' : 'en') + s.slice(1);
  }

  // ---------- PDF (şəkil kimi 1 səhifə; xarici kitabxana yoxdur) ----------
  function pdfFromCanvas(canvas, wPt, hPt) {
    const jpeg = atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]);
    const img = new Uint8Array(jpeg.length); for (let i = 0; i < jpeg.length; i++) img[i] = jpeg.charCodeAt(i);
    const enc = s => new TextEncoder().encode(s);
    const parts = [], offs = [];
    let len = 0;
    const push = b => { parts.push(b); len += b.length; };
    const obj = (i, body, stream) => {
      offs[i] = len;
      push(enc(i + ' 0 obj\n' + body + (stream ? '\nstream\n' : '\nendobj\n')));
      if (stream) { push(stream); push(enc('\nendstream\nendobj\n')); }
    };
    const content = enc('q ' + wPt + ' 0 0 ' + hPt + ' 0 0 cm /Im0 Do Q');
    push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wPt + ' ' + hPt + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    obj(4, '<< /Type /XObject /Subtype /Image /Width ' + canvas.width + ' /Height ' + canvas.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>', img);
    obj(5, '<< /Length ' + content.length + ' >>', content);
    const xref = len;
    let x = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(enc(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF'));
    return new Blob(parts, { type: 'application/pdf' });
  }

  /** Qəbz (avans çeki və ya müştəri ödəniş qəbzi) — A5 portret, alanın dilində (S-31, S-32). */
  function receiptCanvas(r, L) {
    const tt = (k, v) => t(k, v, L);
    const Wd = 1240, Ht = 1754, c = document.createElement('canvas');
    c.width = Wd; c.height = Ht;
    const g = c.getContext('2d');
    const F = '"IBM Plex Sans", "Segoe UI", Roboto, Arial, sans-serif';
    g.fillStyle = '#fff'; g.fillRect(0, 0, Wd, Ht);
    // loqo
    g.save(); g.translate(90, 80); g.scale(1.9, 1.9);
    g.fillStyle = '#FF7A1A'; g.fill(new Path2D('M32 4C20.4 4 11 13.2 11 24.6 11 39 32 58 32 58S53 39 53 24.6C53 13.2 43.6 4 32 4Z'));
    g.strokeStyle = '#16191D'; g.lineWidth = 3.6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.stroke(new Path2D('M21 26L32 16L43 26')); g.stroke(new Path2D('M24.5 31.5L30 37L40 27'));
    g.restore();
    const co = r.company || {};
    g.fillStyle = '#111'; g.font = '700 46px ' + F; g.fillText(co.name || 'Master', 230, 135);
    g.font = '400 28px ' + F; g.fillStyle = '#444';
    let y = 180;
    [co.voen ? tt('voen') + ': ' + co.voen : '', [co.address, co.phone].filter(Boolean).join(' · ')].filter(Boolean).forEach(line => { g.fillText(line, 230, y); y += 38; });
    g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(90, 280); g.lineTo(Wd - 90, 280); g.stroke();
    g.fillStyle = '#111'; g.font = '700 54px ' + F;
    g.fillText(tt(r.kind === 'ADV' ? 'pdf_adv_title' : 'pdf_pay_title'), 90, 370);
    g.font = '600 34px ' + F; g.fillStyle = '#FF7A1A'; g.fillText('№ ' + (r.no || '—'), 90, 425);
    const rows = [
      [tt('date'), fmtDateL(r.date, L)],
      [tt(r.kind === 'ADV' ? 'pdf_payer' : 'pdf_customer'), r.payer + (r.payerVoen ? ' · ' + tt('voen') + ' ' + r.payerVoen : '')],
      [tt(r.kind === 'ADV' ? 'pdf_worker' : 'pdf_receiver'), r.payee],
      r.site ? [tt('site'), r.site] : null,
      r.method ? [tt('pay_method'), tt('pm_' + r.method)] : null,
      [tt('foreman'), r.by || '—'],
      [tt('pdf_confirmed'), r.confirmedAt ? String(r.confirmedAt).replace('T', ' ').slice(0, 16) : '—']
    ].filter(Boolean);
    y = 510;
    g.font = '400 32px ' + F;
    rows.forEach(rw => {
      g.fillStyle = '#666'; g.fillText(rw[0], 90, y);
      g.fillStyle = '#111'; wrapText(g, String(rw[1] || ''), 470, y, Wd - 560, 40);
      y += 70;
      g.strokeStyle = '#ddd'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(90, y - 42); g.lineTo(Wd - 90, y - 42); g.stroke();
    });
    y += 30;
    g.fillStyle = '#F4F5F6'; g.fillRect(90, y, Wd - 180, 230);
    g.fillStyle = '#666'; g.font = '400 30px ' + F; g.fillText(tt('amount'), 130, y + 60);
    g.fillStyle = '#111'; g.font = '700 72px ' + F; g.fillText(num(r.amount) + ' ₼', 130, y + 145);
    g.font = '400 28px ' + F; g.fillStyle = '#333'; wrapText(g, amountWords(r.amount, L), 130, y + 200, Wd - 260, 34);
    y += 330;
    g.font = '400 28px ' + F; g.fillStyle = '#111';
    const sig = (label, x) => { g.fillText(label, x, y); g.beginPath(); g.moveTo(x, y + 70); g.lineTo(x + 420, y + 70); g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke(); };
    sig(tt(r.kind === 'ADV' ? 'gave' : 'received_from'), 90); sig(tt('received'), 730);
    g.fillStyle = '#888'; g.font = '400 24px ' + F;
    wrapText(g, tt('pdf_footer'), 90, Ht - 110, Wd - 180, 30);
    return c;
  }
  function wrapText(g, text, x, y, maxW, lh) {
    const words = String(text).split(' '); let line = '';
    words.forEach(w => { const test = line ? line + ' ' + w : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = test; });
    if (line) g.fillText(line, x, y);
    return y;
  }
  function fmtDateL(s, L) {
    if (!s) return '';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return Number(d) + ' ' + (t('months', null, L).split(',')[Number(m) - 1] || m) + ' ' + y;
  }
  function receiptPdf(r, L) {
    const c = receiptCanvas(r, L || r.lang || lang);
    return pdfFromCanvas(c, 595.28, 841.89);
  }
  function blobToDataUrl(b) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); }); }
  /** PDF-i telefonun "Paylaş" menyusu ilə göndərir (WhatsApp); olmazsa yükləyir (S-34). */
  async function sharePdf(blob, name, text) {
    const file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name, text: text || '' }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return 'downloaded';
  }

  // ---------- offline növbə (IndexedDB; olmasa localStorage) ----------
  const Q = (function () {
    const KEY = 'ub_queue';
    let dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise((res) => {
        try {
          const r = indexedDB.open('ustabasi', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id' });
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return dbp;
    }
    function lsAll() { try { return JSON.parse(LS.get(KEY) || '[]'); } catch (e) { return []; } }
    async function tx(mode, fn) {
      const d = await db();
      if (!d) return null;
      return new Promise((res, rej) => { const x = d.transaction('q', mode); const st = x.objectStore('q'); const r = fn(st); x.oncomplete = () => res(r && r.result); x.onerror = () => rej(x.error); });
    }
    return {
      async all() { const d = await db(); if (!d) return lsAll(); const r = await tx('readonly', st => st.getAll()); return (r || []).sort((a, b) => String(a.created).localeCompare(String(b.created))); },
      async put(item) { const d = await db(); if (!d) { const l = lsAll().filter(x => x.id !== item.id); l.push(item); LS.set(KEY, JSON.stringify(l)); return; } await tx('readwrite', st => st.put(item)); },
      async del(id) { const d = await db(); if (!d) { LS.set(KEY, JSON.stringify(lsAll().filter(x => x.id !== id))); return; } await tx('readwrite', st => st.delete(id)); },
      async clear() { const d = await db(); if (!d) { LS.set(KEY, null); return; } await tx('readwrite', st => st.clear()); }
    };
  })();
  function nowLocalIso() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  window.UBCore = {
    CFG, LS, API, err, t, setLang, getLang, errorText,
    esc, n, round2, num, money, pad, todayISO, monthISO, shiftMonth, fmtDate, fmtTime, monthName, weekday, initials, shortName,
    icon, logo, toast, dialog, confirmDlg, promptDlg, busy, formData, bind, options,
    appBase, linkUrl, b64url, fromB64url, waPhone, whatsapp, copyText, getPosition, compressImage, downloadCsv,
    LANGS, LANG_NAMES, deviceId, amountWords, receiptPdf, receiptCanvas, pdfFromCanvas, sharePdf, blobToDataUrl, Q, nowLocalIso, rid
  };
})();
