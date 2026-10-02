// Service worker: vždy živá verze, když je síť (Michal chce vidět vždy live), a okamžitý start i bez ní.
// Soubory aplikace se berou ze sítě s ověřením u serveru (cache: 'no-cache' → rychlé 304); když síť
// nejde nebo trvá déle než 3 s, použije se poslední uložená kopie. Data z motoru (script.google.com)
// jdou mimo – ty se sem nikdy neukládají.

const VERZE = 'asistent-2026-10-02-kalendar';
const SOUBORY = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/pomocne.js', 'js/stav.js', 'js/ui.js', 'js/ikony.js', 'js/panely.js',
  'js/schranka.js', 'js/posta.js', 'js/kalendar.js', 'js/nastaveni.js', 'js/ukazka.js', 'js/grafy.js', 'js/hledat.js', 'js/udalost.js',
  'ikony/ikona-192.png', 'ikony/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERZE).then((c) => c.addAll(SOUBORY)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((klice) => Promise.all(klice.filter((k) => k !== VERZE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(zeSiteNeboUlozene(e.request));
});

async function zeSiteNeboUlozene(pozadavek) {
  const cache = await caches.open(VERZE);
  const ze_site = fetch(pozadavek, { cache: 'no-cache' }).then((odpoved) => {
    if (odpoved.ok && odpoved.type === 'basic') cache.put(pozadavek, odpoved.clone());
    return odpoved;
  });
  const casovac = new Promise((hotovo) => setTimeout(() => hotovo(null), 3000));
  try {
    const odpoved = await Promise.race([ze_site, casovac]);
    if (odpoved) return odpoved;
  } catch (chyba) { /* bez sítě – níž uložená kopie */ }
  const ulozene = await cache.match(pozadavek, { ignoreSearch: true }) ||
    (pozadavek.mode === 'navigate' ? await cache.match('index.html') : null);
  return ulozene || ze_site;
}
