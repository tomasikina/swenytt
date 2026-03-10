const CACHE_NAME = 'svenska-nyheter-images-v1';
const MAX_AGE_SECONDS = 10 * 24 * 60 * 60; // 10 dagar

const AD_DOMAINS = [
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'adservice.google.com',
    'adnxs.com',
    'adsrvr.org',
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
    'casalemedia.com',
    'smartadserver.com',
    'adform.net',
    'tradedoubler.com',
    'awin1.com',
    'zanox.com',
];

function isAdRequest(url) {
    return AD_DOMAINS.some(domain =>
        url.hostname === domain || url.hostname.endsWith('.' + domain)
    );
}

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

    // Annonser — aldrig cache
    if (isAdRequest(url)) return;

    // HTML — aldrig cache
    if (event.request.destination === 'document' || url.pathname.endsWith('.html')) return;

    // Endast same-origin bilder cachas (dina egna filer i pics/)
    const isSameOrigin = url.origin === self.location.origin;
    const isImage =
        event.request.destination === 'image' ||
        /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(url.pathname);

    if (isImage && isSameOrigin) {
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
    // Cross-origin bilder — ignoreras av SW, webbläsarens HTTP-cache tar hand om dem
});

function fetchAndCache(cache, request) {
    return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
            const headers = new Headers(networkResponse.headers);
            headers.set('sw-cached-date', new Date().toUTCString());
            return networkResponse.clone().blob().then((body) => {
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
