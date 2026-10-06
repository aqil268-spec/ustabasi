/* Ustabaşı — service worker.
   HTML və config: əvvəl şəbəkə (brauzer keşini keçərək), 3.5 san cavab yoxdursa — saxlanan nüsxə.
   Versiyalı fayllar (?v=…): saxlanan nüsxədən dərhal (versiya dəyişəndə ünvan da dəyişir). */
const V = '0.2.0';
const CACHE = 'ustabasi-v' + V;
const SHELL = [
  './', './index.html', './u.html', './config.js', './manifest.webmanifest',
  './assets/app.css?v=' + V, './assets/i18n.js?v=' + V, './assets/core.js?v=' + V, './assets/app.js?v=' + V,
  './assets/admin.js?v=' + V, './assets/foreman.js?v=' + V, './assets/link.js?v=' + V,
  './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function fromNetwork(req) {
  return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    // Yönləndirilmiş cavab səhifə açılışında istifadə oluna bilməz — təmiz nüsxə düzəldirik.
    if (res && res.redirected) res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
    return res;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API və şriftlər brauzerin özünə
  if (url.searchParams.has('v')) {
    // Versiyalı fayl: keşdən dərhal, yoxdursa şəbəkədən.
    e.respondWith(caches.match(req).then(hit => hit || fromNetwork(req)));
    return;
  }
  // HTML, config.js, manifest: təzə nüsxə; şəbəkə gecikirsə və ya yoxdursa — saxlanan.
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(req, { ignoreSearch: true }).then(hit => { if (hit && !done) { done = true; resolve(hit); } return hit; });
    const timer = setTimeout(fallback, 3500);
    fromNetwork(req).then(res => { clearTimeout(timer); if (!done) { done = true; resolve(res); } })
      .catch(() => { clearTimeout(timer); fallback().then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
  }));
});
