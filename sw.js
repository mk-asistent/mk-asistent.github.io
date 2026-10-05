// Service worker: aplikace se načte vždy celá z jedné uložené verze – moduly k sobě vždycky sedí a start je hned,
// i bez sítě. Novou verzi (jiná VERZE níž) prohlížeč stáhne celou na pozadí (install), pak převezme řízení a aplikace
// se sama znovu načte (js/start.js, controllerchange) → živá verze pár vteřin po otevření (Michal chce vždy live).
// Dřív šel každý soubor zvlášť ze sítě s limitem 3 s → při pomalé síti se míchaly soubory dvou verzí a aplikace
// (ES moduly) vůbec nenastartovala (5. 10.: „aplikace v mobilu se mi nezapíná“).
// Data z motoru (script.google.com) a z Firebase (googleapis.com, knihovny z gstatic.com) jdou mimo – nikdy se neukládají.
//
// VERZE = otisk obsahu souborů aplikace: po každé změně `node testy/sw_verze.js --zapsat` (testy jinak selžou).

const VERZE = 'asistent-2760dbc7d8ea';
const SOUBORY = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/start.js', 'js/app.js', 'js/api.js', 'js/pomocne.js', 'js/stav.js', 'js/ui.js', 'js/ikony.js', 'js/panely.js',
  'js/schranka.js', 'js/posta.js', 'js/kalendar.js', 'js/nastaveni.js', 'js/ukazka.js', 'js/grafy.js', 'js/hledat.js', 'js/udalost.js',
  'js/pocasi.js', 'js/zdravi.js', 'js/adresy.js', 'js/fotbal.js', 'js/rozbor.js', 'js/dochazka.js', 'js/reely.js', 'js/ucet.js', 'js/auto.js',
  'ikony/ikona-192.png', 'ikony/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' – mimo mezipaměť prohlížeče, ať se nová verze neposkládá ze starých kusů
  e.waitUntil(caches.open(VERZE)
    .then((c) => c.addAll(SOUBORY.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
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
  e.respondWith(zUlozeneVerze(e.request));
});

async function zUlozeneVerze(pozadavek) {
  const cache = await caches.open(VERZE);
  const ulozene = await cache.match(pozadavek, { ignoreSearch: true }) ||
    (pozadavek.mode === 'navigate' ? await cache.match('index.html') : null);
  // soubory mimo aplikaci (soukromi.html, velké ikony): ze sítě
  return ulozene || fetch(pozadavek);
}
