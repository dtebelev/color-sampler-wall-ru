// Офлайн-кэш приложения. При изменении файлов увеличьте версию.
const CACHE = 'vykrasy-gh-v1';
const FILES = ['./', 'index.html', 'styles.css', 'theme-light.css', 'manual.html', 'manual.css', 'fonts/onest-cyrillic.woff2', 'fonts/onest-latin.woff2', 'app.js', 'seed-data.js', 'derufa-palette.js','xlsx.full.min.js', 'manifest.webmanifest', 'favicon/favicon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Сначала сеть (чтобы обновления подхватывались), при отсутствии сети — кэш
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const path = new URL(e.request.url).pathname;
  if (path.startsWith('/api/')) return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
