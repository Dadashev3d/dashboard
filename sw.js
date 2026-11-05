// Сервис-воркер: приложение открывается и без интернета (данные хранятся на телефоне),
// а при наличии сети всегда берёт свежую версию файлов.
const CACHE = 'mydashboard-v1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'api.js', 'config.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google API — всегда напрямую
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
