// Сервис-воркер: приложение открывается и без интернета (данные хранятся на телефоне),
// а при наличии сети всегда берёт свежую версию файлов — мимо кэша браузера
// (GitHub разрешает хранить файлы 10 минут, из-за этого обновления приходили с опозданием).
const CACHE = 'mydashboard-v26';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'api.js', 'config.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google API — всегда напрямую
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
// Напоминания из календаря: телефон время от времени будит сервис-воркер, даже когда приложение закрыто
async function checkReminders() {
  const c = await caches.open('mydashboard-rem');
  const list = await (await c.match('rem-list.json'))?.json().catch(() => []) || [];
  const done = new Set(await (await c.match('rem-done.json'))?.json().catch(() => []) || []);
  const now = Date.now();
  for (const r of list) {
    if (r.due <= now && r.due > now - 3 * 864e5 && !done.has(r.id)) {
      await self.registration.showNotification('🔔 Напоминание', {
        body: (r.time ? r.time + ' — ' : '') + r.title, tag: 'rem-' + r.id, renotify: true,
        icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [300, 150, 300],
      });
      done.add(r.id);
    }
  }
  await c.put('rem-done.json', new Response(JSON.stringify([...done].slice(-500))));
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'reminders') e.waitUntil(checkReminders()); });

// Нажатие на уведомление (таймер фокуса) — открыть приложение
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => 'focus' in c);
    return w ? w.focus() : self.clients.openWindow('./');
  }));
});
