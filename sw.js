const CACHE_NAME = 'svenska-nyheter-images-v1';
const MAX_AGE_SECONDS = 10 * 24 * 60 * 60; // 10 dagar

// ── Annonsservrar som ALDRIG ska cachas ──────────────────────────────────────
const AD_DOMAINS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.com',
    'adnxs.com',                 // AppNexus / Xandr
    'adsrvr.org',                // The Trade Desk
    'advertising.com',
    'ads.yahoo.com',
    'amazon-adsystem.com',
    'media.net',
    'outbrain.com',
    'taboola.com',
    'criteo.com',
    'criteo.net',
    'rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'casalemedia.com',           // Index Exchange
    'smartadserver.com',
    'adform.net',
    'tradedoubler.com',
    'awin1.com',
    'zanox.com',
];

function isAdRequest(url) {
    return AD_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
}

// ────────────────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Annonser — alltid Network-Only, aldrig cache
    if (isAdRequest(url)) {
        return; // låt webbläsaren hantera normalt utan service worker
    }

    // HTML-filer — alltid Network-Only så att senaste innehållet visas
    const isHtml = event.request.destination === 'document' ||
        url.pathname.endsWith('.html');
    if (isHtml) {
        return;
    }

    // Bilder — Cache-First med 10 dagars maxålder
    const isImage = event.request.destination === 'image' ||
        /\.(jpe?g|png|gif|webp|svg)(\?.*)?$/i.test(url.pathname);

    if (isImage) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) =>
                cache.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        const cachedDate = cachedResponse.headers.get('sw-cached-date');
                        if (cachedDate) {
                            const age = (Date.now() - new Date(cachedDate).getTime()) / 1000;
                            if (age > MAX_AGE_SECONDS) {
                                return fetchAndCache(cache, event.request);
                            }
                        }
                        return cachedResponse;
                    }
                    return fetchAndCache(cache, event.request);
                })
            )
        );
    }
    // Allt annat (fonter, manifest etc.) — webbläsaren hanterar normalt
});

function guessContentType(url) {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith('.png'))  return 'image/png';
    if (path.endsWith('.gif'))  return 'image/gif';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.svg'))  return 'image/svg+xml';
    if (path.endsWith('.avif')) return 'image/avif';
    return 'image/jpeg'; // fallback för .jpg/.jpeg och okända
}

function fetchAndCache(cache, request) {
    const isCrossOrigin = new URL(request.url).origin !== self.location.origin;
    const fetchRequest = isCrossOrigin
        ? new Request(request.url, { mode: 'no-cors', credentials: 'omit' })
        : request;

    return fetch(fetchRequest).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            return networkResponse.clone().blob().then((body) => {
                const headers = new Headers();

                // Bevara Content-Type — använd original om tillgänglig, annars gissa från URL
                const originalType = networkResponse.headers.get('content-type');
                const contentType = (originalType && originalType.startsWith('image/'))
                    ? originalType
                    : guessContentType(request.url);

                headers.set('content-type', contentType);
                headers.set('sw-cached-date', new Date().toUTCString());

                const responseToCache = new Response(body, {
                    status: 200,
                    statusText: 'OK',
                    headers: headers,
                });
                cache.put(request, responseToCache.clone());
                return responseToCache;
            });
        }
        return networkResponse;
    }).catch(() => {
        return new Response('', { status: 408 });
    });
}

