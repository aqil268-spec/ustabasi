/* Ustabaşı — service worker: tətbiq faylları üçün "əvvəl şəbəkə, sonra keş" */
const CACHE = 'ustabasi-v0.1.0';
const SHELL = [
  './', './index.html', './u.html', './config.js', './manifest.webmanifest',
  './assets/app.css', './assets/i18n.js', './assets/core.js', './assets/app.js', './assets/admin.js', './assets/foreman.js', './assets/link.js',
  './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // API sorğuları keşlənmir
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
