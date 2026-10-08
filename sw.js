/* GéoCliché — service worker : l'appli s'ouvre et fonctionne hors connexion
   (seuls les fonds de carte et la recherche d'adresse demandent du réseau).
   Après toute mise à jour des fichiers, changer VERSION pour que les téléphones la récupèrent. */
const VERSION = 'geocliche-1.1.0';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'lib/leaflet.css', 'lib/leaflet.js', 'lib/proj4.js',
  'lib/images/layers.png', 'lib/images/layers-2x.png', 'lib/images/marker-icon.png', 'lib/images/marker-icon-2x.png', 'lib/images/marker-shadow.png',
  'js/geo.js', 'js/exif.js', 'js/zip.js', 'js/xlsx.js', 'js/db.js', 'js/camera.js', 'js/photo.js', 'js/editor.js',
  'js/qgis.js', 'js/report.js', 'js/exports.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png', 'icons/apple-touch-icon.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true })
      .then((hit) => hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
