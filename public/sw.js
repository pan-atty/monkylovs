const CACHE_NAME = "monky-agenda-v12";

const ARCHIVOS = [
    "/",
    "/login.html",
    "/index.html",
    "/style.css",
    "/app.js",
    "/login.js",
    "/manifest.json",
    "/icon-couple-192.png",
    "/icon-couple-512.png",
    "/apple-touch-icon.png",
    "/mnkys.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ARCHIVOS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    if (event.request.url.includes("/guardar") ||
        event.request.url.includes("/eventos") ||
        event.request.url.includes("/subir-foto") ||
        event.request.url.includes("/fotos") ||
        event.request.url.includes("/nota") ||
        event.request.url.includes("/notas") ||
        event.request.url.includes("/flores") ||
        event.request.url.includes("/retos") ||
        event.request.url.includes("/lugar") ||
        event.request.url.includes("/lugares")) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
    );
});
