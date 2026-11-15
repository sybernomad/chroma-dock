/*
 * Chroma Dock service worker: offline play + updates.
 * Every release gets a new VERSION (run `node tools/release.js`). The browser notices the changed
 * file, installs the new version in the background, and the game offers (or applies) the update.
 */
const VERSION = 'chromadock-1.2.0';
const ASSETS = [
  './', 'index.html', 'css/style.css',
  'js/engine.js', 'js/levels.js', 'js/audio.js', 'js/render.js', 'js/app.js', 'js/hint-worker.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'fonts/Outfit.woff', 'fonts/OFL-Outfit.txt'
];

self.addEventListener('install', e => {
  // Download the whole new version up front so it's never mixed with old files.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page asks the waiting worker to take over when the player accepts the update.
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => req.mode === 'navigate' ? cache.match('index.html') : Response.error()))
    )
  );
});
