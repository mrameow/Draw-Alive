/* Draw Alive service worker – makes the web app work offline. */
const CACHE = 'draw-alive-v6';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/util.js', 'js/environments.js', 'js/templates.js', 'js/bgremove.js', 'js/ai.js', 'js/drawpad.js', 'js/world.js', 'js/sound.js', 'js/share.js', 'js/app.js',
  'vendor/peerjs.min.js', 'vendor/qrcode.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (so updates arrive), falling back to the cache when offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // big optional AI models are stored by the app itself – don't keep a second copy here
  if (/\/models\/(?!u2netp)/.test(new URL(e.request.url).pathname)) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
