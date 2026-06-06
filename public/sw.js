const CACHE_NAME = "monky-agenda-v1";

const ARCHIVOS = [
    "/",
    "/login.html",
    "/index.html",
    "/style.css",
    "/app.js",
    "/login.js",
    "/manifest.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ARCHIVOS))
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
    );
});