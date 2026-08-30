/* Service worker mínimo para GitHub Pages: cola FSRS y repertorio viven en localStorage. */
const CACHE = 'aperturas-v2';
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
    event.respondWith(
        caches.match(req).then((hit) => {
            const fetchPromise = fetch(req).then((res) => {
                if (res && res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(req, copy));
                }
                return res;
            }).catch(() => hit);
            return hit || fetchPromise;
        })
    );
});
