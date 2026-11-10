// Service worker: guarda la aplicación para abrirla sin conexión.
//  - Archivos propios: primero la red y, si falla o responde con error (404, 500…), la copia guardada.
//    Solo se guardan respuestas correctas: un error del servidor nunca reemplaza la copia buena.
//  - Páginas (index.html) y config.js: se piden al servidor sin usar la caché del navegador (GitHub Pages pide
//    guardarlos ~10 minutos), para que una versión nueva aparezca de inmediato.
//  - Librerías, fuentes e íconos (carpeta vendor/ del mismo sitio): se guardan al instalar.
//  - config.js: primero la red, para que un cambio de servidor se aplique de inmediato.
//  - Supabase y cualquier otra API: NUNCA se guardan (los datos siempre salen frescos y seguros).
const CACHE = 'control-entes-v21-datic';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
/* Se guardan al instalar; si alguno falta (por ejemplo, la demo sin config.js), la instalación sigue */
const OPCIONALES = [
  './config.js',
  './vendor/supabase.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/591.supabase.js',
  './vendor/fuentes.css',
  './vendor/fontawesome/css/all.min.css',
  './vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './vendor/fontawesome/webfonts/fa-brands-400.woff2',
  './vendor/fontawesome/webfonts/fa-v4compatibility.woff2',
  './vendor/fuentes/archivo-latin-wdth-normal.woff2',
  './vendor/fuentes/archivo-latin-ext-wdth-normal.woff2',
  './vendor/fuentes/inter-latin-wght-normal.woff2',
  './vendor/fuentes/inter-latin-ext-wght-normal.woff2',
  './vendor/fuentes/jetbrains-mono-latin-wght-normal.woff2',
  './vendor/fuentes/jetbrains-mono-latin-ext-wght-normal.woff2'
];
const CDN = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then(c => c.addAll(SHELL).then(() => Promise.all(OPCIONALES.map(u => c.add(u).catch(() => null)))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches
      .keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request,
    url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === self.location.origin) {
    const fresco = req.mode === 'navigate' || url.pathname.endsWith('/config.js');
    const respaldo = () => caches.match(req).then(r => r || caches.match('./index.html'));
    e.respondWith(
      fetch(fresco ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req)
        .then(res => {
          if (!res.ok) return caches.match(req).then(r => r || res); // error del servidor: la copia buena, si hay
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
          return res;
        })
        .catch(respaldo)
    );
  } else if (CDN.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(res => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
            }
            return res;
          })
      )
    );
  }
});
