/* Service worker mínimo para GitHub Pages: cola FSRS y repertorio viven en localStorage. */
const CACHE = 'aperturas-v3';
const CORE = [
    './',
    './index.html',
    './css/coach.css',
    './js/fsrs.js',
    './js/coach.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) {
        if (/chess\.min\.js|stockfish\.js/.test(url.href)) {
            event.respondWith(
                caches.open(CACHE).then(async (cache) => {
                    const hit = await cache.match(req);
                    try {
                        const res = await fetch(req);
                        if (res && res.ok) cache.put(req, res.clone());
                        return res;
                    } catch (err) {
                        if (hit) return hit;
                        throw err;
                    }
                })
            );
        }
        return;
    }
    /* HTML/JS/CSS: red primero para no servir un coach.js viejo tras un deploy. */
    const fresh = /\.html?$|\.js$|\.css$|\/$/.test(url.pathname);
    event.respondWith(
        (async () => {
            if (fresh) {
                try {
                    const res = await fetch(req);
                    if (res && res.ok) {
                        const cache = await caches.open(CACHE);
                        cache.put(req, res.clone());
                    }
                    return res;
                } catch (err) {
                    const hit = await caches.match(req);
                    if (hit) return hit;
                    throw err;
                }
            }
            const hit = await caches.match(req);
            if (hit) return hit;
            const res = await fetch(req);
            if (res && res.ok) {
                const cache = await caches.open(CACHE);
                cache.put(req, res.clone());
            }
            return res;
        })()
    );
});
