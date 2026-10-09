// Service worker: aplikace se načte vždy celá z jedné uložené verze – moduly k sobě vždycky sedí a start je hned,
// i bez sítě. Novou verzi (jiná VERZE níž) prohlížeč stáhne celou na pozadí (install), pak převezme řízení a aplikace
// se sama znovu načte (js/start.js, controllerchange) → živá verze pár vteřin po otevření (Michal chce vždy live).
// Dřív šel každý soubor zvlášť ze sítě s limitem 3 s → při pomalé síti se míchaly soubory dvou verzí a aplikace
// (ES moduly) vůbec nenastartovala (5. 10.: „aplikace v mobilu se mi nezapíná“).
// Data z motoru (script.google.com) a z Firebase (googleapis.com) jdou mimo – nikdy se neukládají. Knihovny Firebase
// (gstatic.com, adresa s pevnou verzí) se uloží při prvním použití do vlastní mezipaměti a pak jdou ze zařízení – start
// v telefonu na ně nečeká na síť (Michal 9. 10.: „načtení stránky na sekundu“).
// Znaky klubů a QR na plakát (plakat/znaky, plakat/qr – 5,5 MB) se nepřednačítají: uloží se při prvním použití do vlastní
// mezipaměti „plakat-znaky“, kterou nová verze nemaže (znak s novým obsahem = nový název souboru).
//
// VERZE = otisk obsahu souborů aplikace: po každé změně `node testy/sw_verze.js --zapsat` (testy jinak selžou).

const VERZE = 'asistent-19a8e8fcc444';
const SOUBORY = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/start.js', 'js/app.js', 'js/api.js', 'js/pomocne.js', 'js/stav.js', 'js/ui.js', 'js/ikony.js', 'js/panely.js',
  'js/schranka.js', 'js/posta.js', 'js/kalendar.js', 'js/nastaveni.js', 'js/ukazka.js', 'js/grafy.js', 'js/hledat.js', 'js/udalost.js',
  'js/pocasi.js', 'js/zdravi.js', 'js/adresy.js', 'js/fotbal.js', 'js/rozbor.js', 'js/dochazka.js', 'js/reely.js', 'js/ucet.js', 'js/auto.js',
  'js/jidlo_odhad.js', 'js/jmeniny.js', 'js/plakaty.js', 'js/plakat.js', 'js/plakat_data.js', 'plakaty.css', 'js/moje.js',
  'ikony/ikona-192.png', 'ikony/apple-touch-icon.png'
];

// knihovny Firebase: verze je v adrese (js/ucet.js SDK) – nová verze = nová mezipaměť, stará se smaže
const FIREBASE = 'https://www.gstatic.com/firebasejs/12.19.0/';
const FIREBASE_CACHE = 'firebase-12.19.0';
// znaky klubů a QR na plakát – nová verze aplikace je nemaže
const ZNAKY = 'plakat-znaky';

self.addEventListener('install', (e) => {
  // cache: 'reload' – mimo mezipaměť prohlížeče, ať se nová verze neposkládá ze starých kusů
  e.waitUntil(caches.open(VERZE)
    .then((c) => c.addAll(SOUBORY.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((klice) => Promise.all(klice.filter((k) => k !== VERZE && k !== FIREBASE_CACHE && k !== ZNAKY).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf(FIREBASE) === 0) { e.respondWith(knihovnaFirebase(e.request)); return; }
  if (url.origin !== self.location.origin) return;
  if (/\/plakat\/(znaky|qr)\//.test(url.pathname)) { e.respondWith(znakPlakatu(e.request)); return; }
  e.respondWith(zUlozeneVerze(e.request));
});

/** Knihovna Firebase: ze zařízení, jinak ze sítě a uložit (jen úspěšnou odpověď). */
async function knihovnaFirebase(pozadavek) {
  const cache = await caches.open(FIREBASE_CACHE);
  const ulozena = await cache.match(pozadavek.url);
  if (ulozena) return ulozena;
  const odpoved = await fetch(pozadavek);
  if (odpoved.ok) cache.put(pozadavek.url, odpoved.clone()).catch(() => { /* příště */ });
  return odpoved;
}

/** Znak nebo QR plakátu: ze zařízení, jinak ze sítě a uložit (jen úspěšnou odpověď). */
async function znakPlakatu(pozadavek) {
  const cache = await caches.open(ZNAKY);
  const ulozeny = await cache.match(pozadavek, { ignoreSearch: true });
  if (ulozeny) return ulozeny;
  const odpoved = await fetch(pozadavek);
  if (odpoved.ok) cache.put(pozadavek, odpoved.clone()).catch(() => { /* příště */ });
  return odpoved;
}

async function zUlozeneVerze(pozadavek) {
  const cache = await caches.open(VERZE);
  const ulozene = await cache.match(pozadavek, { ignoreSearch: true }) ||
    (pozadavek.mode === 'navigate' ? await cache.match('index.html') : null);
  // soubory mimo aplikaci (soukromi.html, velké ikony): ze sítě
  return ulozene || fetch(pozadavek);
}
