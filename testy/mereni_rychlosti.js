// Měření rychlosti aplikace (Playwright + CDP) – „co nejrychlejší práce na stránce“ (Michal 9. 10.).
//
//   NODE_PATH=…/node_modules node testy/mereni_rychlosti.js            všechny scénáře, 3 opakování (medián)
//   JEN=teply OPAKOVANI=5 node testy/mereni_rychlosti.js                jen scénáře, jejichž název obsahuje „teply“
//   STOPA=1 … (záznam výkonu do testy/vystup/stopa.json – Chrome DevTools → Performance → Load profile)
//   ZNOVU=1 … (po měření ještě přenačtení ve stejném procesu – teplá mezipaměť písem a kódu, pro porovnání)
//   KOREN=cesta … (jiná kopie aplikace – porovnání před a po; skripty měření zůstávají odsud)
//
// Pozor na Windows: první vykreslení v novém procesu prohlížeče je drahé kvůli písmům (Segoe UI Variable, emoji) – v čase
// „Dnes s daty“ studeného procesu je ho velká část; na iPhonu (systémové písmo) je to jinak. Porovnávat před/po, ne absolutně.
//
// Jako na GitHub Pages: HTTP/2 s gzipem (vlastní certifikát přes openssl – Git Bash ho má), service worker, telefon se
// zpomaleným procesorem (CDP 4×) a pomalým 4G (150 ms, 1,6 Mbit/s). Motor napodobený se zpožděním a frontou jako Apps
// Script, Firebase napodobený (kopie dat ze serveru živě) – skutečný motor ani Firestore se nikdy nevolají: prohlížeč
// má zakázané všechny adresy kromě 127.0.0.1. Data vymyšlená, ale v objemu skutečného provozu (testy/mereni_data.js).
// Výsledek: tabulka v konzoli a testy/vystup/mereni.json.
'use strict';
const http2 = require('http2');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { vytvorData, vytvorMotor } = require('./mereni_data.js');

const KOREN = process.env.KOREN ? path.resolve(process.env.KOREN) : path.join(__dirname, '..');
const PORT = Number(process.env.PORT_MERENI) || 8795;
const WEB = 'https://127.0.0.1:' + PORT + '/';
const KLIC = 'k'.repeat(64);
const OPAKOVANI = Number(process.env.OPAKOVANI) || 3;
const UZIVATEL = { uid: 'uid-mereni', email: 'tester@example.com' };
const SDK_GSTATIC = 'https://www.gstatic.com/firebasejs/12.19.0/';
const SITE = {
  pomala4g: { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8 * 0.9 },
  rychla: { offline: false, latency: 20, downloadThroughput: 10 * 1024 * 1024 / 8, uploadThroughput: 5 * 1024 * 1024 / 8 }
};

// ---------------------------------------------------------------- certifikát pro HTTP/2 (jen 127.0.0.1, dočasný)
function certifikat() {
  const slozka = path.join(os.tmpdir(), 'asistent-mereni-cert');
  const klic = path.join(slozka, 'klic.pem'), cert = path.join(slozka, 'cert.pem');
  if (!fs.existsSync(cert)) {
    fs.mkdirSync(slozka, { recursive: true });
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', klic, '-out', cert, '-days', '30', '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore', env: Object.assign({}, process.env, { MSYS_NO_PATHCONV: '1' }) });
  }
  return { key: fs.readFileSync(klic), cert: fs.readFileSync(cert) };
}

// ---------------------------------------------------------------- stav napodobeného motoru a serveru Firebase
const S = { data: null, motor: null, volano: [], latenceMotoru: 1200, fb: { docs: new Map(), verze: 0, cekaji: [] }, fbPrvni: 900, fbZmena: 150 };

function novaData() {
  S.data = vytvorData(Date.now());
  S.motor = vytvorMotor(S.data);
  S.volano = [];
  S.fb = { docs: new Map(), verze: 0, cekaji: [] };
  const u = 'uzivatele/' + UZIVATEL.uid;
  fbZapis(u, { pripojeni: { url: WEB + '__motor', klic: KLIC } });
  ulozKopie();
}

/** Kopie dat ze serveru (firebase/functions: data/{id} = { json, kdy, parametry }, data/_stav.potvrzeno). */
function ulozKopie(jen) {
  const u = 'uzivatele/' + UZIVATEL.uid + '/data/';
  const kdy = Date.now();
  const potvrzeno = {};
  const kopie = (id, data, parametry) => { fbZapis(u + id, { json: JSON.stringify(data), kdy, parametry: parametry || null }); potvrzeno[id] = kdy; };
  ['info', 'schranka', 'posta', 'fotbal', 'reely', 'zmeny', 'plakaty'].filter((id) => !jen || jen.indexOf(id) >= 0).forEach((id) => kopie(id, S.motor[id]({})));
  if (!jen) {
    [0, 1].forEach((n) => {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + n);
      const od = new Date(d.getFullYear(), d.getMonth(), 1 - ((d.getDay() + 6) % 7)).getTime();
      const doDne = new Date(d.getFullYear(), d.getMonth(), 1 - ((d.getDay() + 6) % 7) + 42).getTime();
      kopie('kalendar_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), S.motor.kalendar({ od, do: doDne }), { od, do: doDne });
    });
  }
  const st = (S.fb.docs.get(u + '_stav') || {}).data || { potvrzeno: {} };
  fbZapis(u + '_stav', { kdy, potvrzeno: Object.assign({}, st.potvrzeno, potvrzeno), chyby: [] });
}

function fbZapis(cesta, data) {
  S.fb.verze++;
  S.fb.docs.set(cesta, { data, v: S.fb.verze });
  const cekaji = S.fb.cekaji;
  S.fb.cekaji = [];
  cekaji.forEach((c) => setTimeout(() => c.hotovo(kolekce(c.cesta)), S.fbZmena));
}
function kolekce(cesta) {
  const pred = cesta + '/';
  const docs = [];
  S.fb.docs.forEach((d, c) => { if (c.indexOf(pred) === 0 && c.slice(pred.length).indexOf('/') < 0) docs.push({ id: c.slice(pred.length), v: d.v, data: d.data }); });
  return { verze: S.fb.verze, docs };
}
function fbObsluha(op, a) {
  if (op === 'prihlas') return { uid: UZIVATEL.uid };
  if (op === 'cti') { const d = S.fb.docs.get(a.cesta); return { data: d ? d.data : null }; }
  if (op === 'zapis') { fbZapis(a.cesta, a.merge ? Object.assign({}, (S.fb.docs.get(a.cesta) || {}).data, a.data) : a.data); return {}; }
  if (op === 'funkce') return new Promise((hotovo) => setTimeout(() => hotovo({ data: { kdy: Date.now() } }), 400));
  if (op === 'cekej') {
    // první odběr = první snímek (přihlášení + spojení s Firestore), další až po změně
    if (a.verze < 0) return new Promise((hotovo) => setTimeout(() => hotovo(kolekce(a.cesta)), S.fbPrvni));
    if (S.fb.verze > a.verze) return new Promise((hotovo) => setTimeout(() => hotovo(kolekce(a.cesta)), S.fbZmena));
    return new Promise((hotovo) => S.fb.cekaji.push({ cesta: a.cesta, hotovo }));
  }
  return { chyba: 'neznámá operace ' + op };
}

// napodobené knihovny Firebase (místo gstatic.com) – stejné rozhraní, jaké používá js/ucet.js
const VYPLN = (n, sem) => { let s = '', x = sem; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) % 2147483648; s += 'function _v' + x.toString(36) + '(a,b){var c=a*' + (x % 997) + '+b;return c>' + (x % 31) + '?c:_v' + x.toString(36) + '(b,a-1)}\n'; } return s; };
const FB_SDK = {
  'firebase-app.js': 'export function initializeApp(k) { return { k }; }\n' + VYPLN(150, 1),
  'firebase-auth.js': `const ja = () => { try { return JSON.parse(localStorage.getItem('__fb.user') || 'null'); } catch (e) { return null; } };
    export const indexedDBLocalPersistence = 'idb', browserLocalPersistence = 'local';
    export function initializeAuth(app) { return { app, currentUser: ja(), authStateReady() { return Promise.resolve(); } }; }
    export async function signInWithEmailAndPassword(auth, email) { const r = await window.__fb('prihlas', { email }); auth.currentUser = { uid: r.uid, email };
      localStorage.setItem('__fb.user', JSON.stringify(auth.currentUser)); return { user: auth.currentUser }; }
    export async function signOut(auth) { auth.currentUser = null; localStorage.removeItem('__fb.user'); }\n` + VYPLN(1600, 2),
  'firebase-firestore.js': `export function getFirestore(app) { return { app }; }
    export function doc(db, ...c) { return { cesta: c.join('/') }; }
    export function collection(db, ...c) { return { cesta: c.join('/') }; }
    export async function getDoc(ref) { const r = await window.__fb('cti', { cesta: ref.cesta }); return { id: ref.cesta.split('/').pop(), exists: () => r.data != null, data: () => r.data }; }
    export async function setDoc(ref, data, volby) { await window.__fb('zapis', { cesta: ref.cesta, data, merge: !!(volby && volby.merge) }); }
    export function onSnapshot(ref, dalsi) {
      let konec = false, verze = -1;
      const znamo = new Map();
      (async () => {
        while (!konec) {
          const r = await window.__fb('cekej', { cesta: ref.cesta, verze });
          if (konec) return;
          verze = r.verze;
          const zmeny = [], videno = new Set();
          r.docs.forEach((d) => { videno.add(d.id); if (znamo.get(d.id) !== d.v) { zmeny.push({ type: znamo.has(d.id) ? 'modified' : 'added', doc: { id: d.id, data: () => d.data } }); znamo.set(d.id, d.v); } });
          Array.from(znamo.keys()).forEach((id) => { if (!videno.has(id)) { zmeny.push({ type: 'removed', doc: { id, data: () => ({}) } }); znamo.delete(id); } });
          if (window.__mereni) window.__mereni.snimek = performance.now();
          dalsi({ docChanges: () => zmeny });
        }
      })();
      return () => { konec = true; };
    }\n` + VYPLN(3600, 3),
  'firebase-functions.js': `export function getFunctions(app, region) { return { app, region }; }
    export function httpsCallable(f, nazev) { return async (data) => window.__fb('funkce', { nazev, data }); }\n` + VYPLN(300, 4)
};

// ---------------------------------------------------------------- server (HTTP/2, gzip, přepis adres Firebase na místní)
function prepis(u, text) {
  if (u === '/index.html') return text.split(SDK_GSTATIC).join('/__fb/');
  if (u === '/js/ucet.js') {
    const t = text.replace(/const KONFIGURACE = \{[\s\S]*?\};/,"const KONFIGURACE = { apiKey: 'test-klic', authDomain: 'test.firebaseapp.com', projectId: 'asistent-test', appId: 'test' };");
    if (t === text) throw new Error('ucet.js: konfigurace Firebase se nepřepsala – měření by šlo na skutečný projekt');
    return t.split(SDK_GSTATIC).join('/__fb/');
  }
  if (u === '/sw.js') return text.split(SDK_GSTATIC).join(WEB + '__fb/');
  return text;
}
const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' };
let frontaMotoru = Promise.resolve();

function posli(req, res, telo, typ, hlavicky) {
  const gzip = /gzip/.test(req.headers['accept-encoding'] || '') && telo.length > 1024 && !/image\/png/.test(typ);
  const h = Object.assign({ 'content-type': typ + (/text|javascript|json/.test(typ) ? '; charset=utf-8' : ''), 'cache-control': 'max-age=600' }, hlavicky);
  if (gzip) { h['content-encoding'] = 'gzip'; telo = zlib.gzipSync(telo); }
  res.writeHead(200, h);
  res.end(telo);
}

function server() {
  return http2.createSecureServer(Object.assign(certifikat(), { allowHTTP1: true }), (req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/__motor' && req.method === 'POST') {
      let telo = '';
      req.on('data', (c) => { telo += c; });
      req.on('end', () => {
        let d = {};
        try { d = JSON.parse(telo || '{}'); } catch (e) { /* níž */ }
        S.volano.push(d.akce);
        // Apps Script: každý dotaz ~1–2 s a souběžné se řadí do fronty
        frontaMotoru = frontaMotoru.then(() => new Promise((ok) => setTimeout(ok, S.latenceMotoru))).then(() => {
          let v;
          if (d.klic !== KLIC) v = { ok: false, chyba: 'klic' };
          else if (!S.motor[d.akce]) v = { ok: false, chyba: 'Neznámá akce: ' + d.akce };
          else { try { v = { ok: true, data: S.motor[d.akce](d) }; } catch (e) { v = { ok: false, chyba: e.message }; } }
          if (!res.destroyed) posli(req, res, Buffer.from(JSON.stringify(v)), 'application/json', { 'cache-control': 'no-store' });
        });
      });
      return;
    }
    if (u.indexOf('/__fb/') === 0) {
      const kod = FB_SDK[u.slice(6)];
      if (!kod) { res.writeHead(404); res.end(); return; }
      posli(req, res, Buffer.from(kod), 'text/javascript');
      return;
    }
    const soubor = u.replace(/\/$/, '/index.html');
    const cesta = path.join(KOREN, soubor);
    if (!cesta.startsWith(KOREN) || /\/(testy|apps-script|firebase|\.git)\//.test(soubor) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); res.end(); return; }
    const typ = TYPY[path.extname(cesta)] || 'application/octet-stream';
    let telo = fs.readFileSync(cesta);
    if (/text|javascript|json/.test(typ)) telo = Buffer.from(prepis(soubor, telo.toString('utf8')));
    posli(req, res, telo, typ);
  });
}

// ---------------------------------------------------------------- měření v prohlížeči
const PRIPRAVA = ([url, klic, ucet, ja]) => {
  if (!localStorage.getItem('asistent.pripojeni')) localStorage.setItem('asistent.pripojeni', JSON.stringify({ url, klic }));
  if (ucet && !localStorage.getItem('asistent.ucet')) {
    localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
    localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
  }
};
// běží v každé stránce před aplikací: dlouhé úlohy, události, čtení a zápisy localStorage, JSON.parse, překreslení a značky
const INSTRUMENTACE = () => {
  const m = window.__mereni = { znacky: {}, dlouhe: [], udalosti: [], vykresleni: 0, ls: { n: 0, b: 0, ms: 0 }, lsZapis: { n: 0, b: 0, ms: 0 },
    json: { n: 0, b: 0, ms: 0 }, vstup: [], snimek: 0 };
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => m.dlouhe.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) { /* nic */ }
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => m.udalosti.push([e.name, Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) { /* nic */ }
  const gi = Storage.prototype.getItem, si = Storage.prototype.setItem, jp = JSON.parse;
  Storage.prototype.getItem = function (k) { const t = performance.now(); const v = gi.call(this, k); m.ls.ms += performance.now() - t; m.ls.n++; m.ls.b += v ? v.length : 0; return v; };
  Storage.prototype.setItem = function (k, v) { const t = performance.now(); si.call(this, k, v); m.lsZapis.ms += performance.now() - t; m.lsZapis.n++; m.lsZapis.b += String(v).length; };
  JSON.parse = function (s, r) { const t = performance.now(); try { return jp.call(JSON, s, r); } finally { m.json.ms += performance.now() - t; m.json.n++; m.json.b += typeof s === 'string' ? s.length : 0; } };
  let zacVstupu = 0;
  addEventListener('input', () => { zacVstupu = performance.now(); }, true);
  addEventListener('input', () => { m.vstup.push(performance.now() - zacVstupu); }, false);
  const znacka = (n) => { if (!(n in m.znacky)) m.znacky[n] = Math.round(performance.now()); };
  const uzky = matchMedia('(max-width: 759px)'); // ne innerWidth – ten by uprostřed vykreslování vynutil layout
  const telefon = () => uzky.matches;
  const kontrola = () => {
    const a = document.getElementById('aplikace');
    if (a && !a.hidden) znacka('aplikace');
    if (telefon() ? /\d/.test((document.querySelector('.hero__cislo') || {}).textContent || '') : document.querySelector('#dl-pozornost .seznam')) znacka('dnes');
    if (document.querySelector('#dl-tyden .agenda__u')) znacka('tyden');
    if (document.querySelector('#p-dnes [data-vlakno="cerstva"]')) znacka('cerstve');
    if (m.cekamNa && document.querySelector(m.cekamNa)) { m.znacky[m.cekamNaZnacku] = Math.round(performance.now()); m.cekamNa = null; }
  };
  new MutationObserver((zaznamy) => {
    // překreslení = jedna dávka změn v #aplikace (vykreslení proběhne najednou v jedné mikroúloze)
    const apl = document.getElementById('aplikace');
    if (apl && zaznamy.some((z) => apl.contains(z.target))) m.vykresleni++;
    kontrola();
  }).observe(document, { childList: true, subtree: true });
};

/** Co se změřilo (v prohlížeči). */
const SBER = () => {
  const m = window.__mereni;
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime;
  const zdroje = performance.getEntriesByType('resource').filter((e) => e.name.indexOf('/__motor') < 0);
  const skripty = zdroje.filter((e) => /\.js(\?|$)/.test(e.name));
  return {
    fcp: fcp == null ? null : Math.round(fcp), znacky: m.znacky, vykresleni: m.vykresleni,
    // značky aplikace: start.js, okamžitý snímek, start modulů (app.js start) a první vykreslení aplikace
    aplikace: ['asistent-start-js', 'asistent-snimek', 'asistent-start', 'asistent-vykresleno'].reduce((o, n) => { const e = performance.getEntriesByName(n)[0]; o[n.replace('asistent-', '')] = e ? Math.round(e.startTime) : -1; return o; }, {}),
    dlouhe: { pocet: m.dlouhe.length, soucet: m.dlouhe.reduce((s, x) => s + x[1], 0), max: m.dlouhe.reduce((s, x) => Math.max(s, x[1]), 0) },
    ls: { n: m.ls.n, kB: Math.round(m.ls.b / 1024), ms: Math.round(m.ls.ms) }, lsZapis: { n: m.lsZapis.n, kB: Math.round(m.lsZapis.b / 1024), ms: Math.round(m.lsZapis.ms) },
    json: { n: m.json.n, kB: Math.round(m.json.b / 1024), ms: Math.round(m.json.ms) },
    zdroje: { pocet: zdroje.length, prenos_kB: Math.round(zdroje.reduce((s, e) => s + (e.transferSize || 0), 0) / 1024),
      dekod_kB: Math.round(zdroje.reduce((s, e) => s + (e.decodedBodySize || 0), 0) / 1024), skripty: skripty.length,
      posledniSkript: Math.round(skripty.reduce((s, e) => Math.max(s, e.responseEnd), 0)) },
    sw: !!navigator.serviceWorker.controller, dom: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0)
  };
};

async function stranka(ctx, cpu, sit) {
  const page = await ctx.newPage();
  const chyby = [];
  page.on('pageerror', (e) => chyby.push(e.message));
  page.on('console', (z) => { if (z.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|img-src/.test(z.text())) chyby.push(z.text()); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (sit && SITE[sit]) await cdp.send('Network.emulateNetworkConditions', SITE[sit]);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return { page, chyby, cdp };
}

/** Jeden běh scénáře: příprava (data v zařízení, service worker), pak měřené otevření a případně práce na stránce. */
async function beh(prohlizec, sc) {
  novaData();
  S.latenceMotoru = sc.latence || 1200;
  S.fbPrvni = sc.sit === 'pomala4g' ? 1200 : 250;
  const ctx = await prohlizec.newContext({ viewport: { width: sc.sirka, height: sc.vyska }, isMobile: sc.sirka < 760, hasTouch: sc.sirka < 1200,
    colorScheme: 'dark', ignoreHTTPSErrors: true, serviceWorkers: 'allow', locale: 'cs-CZ', timezoneId: 'Europe/Prague' });
  await ctx.exposeBinding('__fb', (zdroj, op, a) => fbObsluha(op, a));
  await ctx.addInitScript(PRIPRAVA, [WEB + '__motor', KLIC, !!sc.ucet, UZIVATEL]);
  await ctx.addInitScript(INSTRUMENTACE);
  if (sc.start !== 'prvni') {
    // příprava: první otevření uloží data do zařízení a nainstaluje service worker; druhé uloží knihovny Firebase
    const p = await ctx.newPage();
    await p.goto(WEB);
    await p.waitForFunction(() => window.__mereni && window.__mereni.znacky.dnes != null, null, { timeout: 30000 });
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.reload();
    await p.waitForFunction(() => window.__mereni && window.__mereni.znacky.dnes != null && navigator.serviceWorker.controller, null, { timeout: 30000 });
    await p.waitForTimeout(3500); // přednačtení pošty (2,5 s v klidu) a zápisy do zařízení
    await p.evaluate(() => window.dispatchEvent(new Event('pagehide'))); // odchod z aplikace (snímek pro příští start)
    await p.close();
  }
  // na serveru mezitím přibyla nová konverzace (hoří) – kdy ji aplikace ukáže na Dnes
  S.data.posta.osobni.unshift({ id: 'cerstva', ucet: 'osobni', stav: 'hori', od: 'Nový odesílatel', predmet: 'Čerstvá zpráva ze serveru', ukazka: 'Potřebuji to dnes.',
    kdy: Date.now(), neprectena: true, pocet: 1, odkaz: '#', duvod: 'termín do 48 hodin' });
  ulozKopie(['posta']);
  const { page, chyby, cdp } = await stranka(ctx, sc.cpu, sc.sit);
  if (sc.start === 'studeny') {
    // bez mezipaměti (service worker i soubory pryč), data v zařízení zůstanou – jako po smazání mezipaměti v iPhonu
    await cdp.send('Storage.clearDataForOrigin', { origin: WEB.slice(0, -1), storageTypes: 'cache_storage,service_workers' });
    await cdp.send('Network.clearBrowserCache');
  }
  S.volano = [];
  // STOPA=1: záznam výkonu prohlížeče (Chrome DevTools → Performance → Load profile) do testy/vystup/stopa.json
  if (process.env.STOPA && process.env.STOPA !== 'znovu') await prohlizec.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'v8',
    'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'loading'] });
  await page.goto(WEB, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__mereni && window.__mereni.znacky.cerstve != null, null, { timeout: 30000 }).catch(() => { chyby.push('čerstvá data se neukázala do 30 s'); });
  await page.waitForTimeout(1500);
  fs.mkdirSync(path.join(__dirname, 'vystup'), { recursive: true });
  if (process.env.STOPA && process.env.STOPA !== 'znovu') fs.writeFileSync(path.join(__dirname, 'vystup', 'stopa.json'), await prohlizec.stopTracing());
  const v = await page.evaluate(SBER);
  v.motor = S.volano.slice();
  v.chyby = chyby;
  if (process.env.ZNOVU || sc.znovu) {
    // totéž ještě jednou ve stejném procesu prohlížeče (teplá mezipaměť písem a kódu) – méně závislé na Windows a písmech
    if (process.env.STOPA === 'znovu') await prohlizec.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'v8',
      'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'loading'] });
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.__mereni && window.__mereni.znacky.dnes != null, null, { timeout: 30000 }).catch(() => { /* nic */ });
    await page.waitForTimeout(2500);
    if (process.env.STOPA === 'znovu') fs.writeFileSync(path.join(__dirname, 'vystup', 'stopa.json'), await prohlizec.stopTracing());
    const z = await page.evaluate(SBER);
    v.znovu = { fcp: z.fcp, znacky: z.znacky, dlouhe: z.dlouhe, vykresleni: z.vykresleni };
  }
  if (sc.prace) v.prace = await prace(page, sc);
  await ctx.close();
  return v;
}

/** Práce na stránce: přepínání stránek, otevření e-mailu, psaní, živá změna ze serveru. Časy = do dalšího snímku. */
async function prace(page, sc) {
  const telefon = sc.sirka < 760;
  const v = {};
  await page.keyboard.press('Escape'); // případné okno Co je nového
  await page.waitForTimeout(400);
  const prepni = (cil) => page.evaluate(async (c) => {
    const m = window.__mereni;
    const d0 = m.dlouhe.length, r0 = m.vykresleni;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.cil = c; b.hidden = true;
    document.body.appendChild(b);
    const t = performance.now();
    b.click();
    b.remove();
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
    return { ms: Math.round(performance.now() - t), dlouhe: m.dlouhe.slice(d0).reduce((s, x) => s + x[1], 0), vykresleni: m.vykresleni - r0 };
  }, cil);
  for (const cil of ['posta', 'kalendar', 'zdravi', 'schranka', 'fotbal', 'auto', 'dnes']) {
    S.volano = [];
    // STOPA=prepnuti_posta (…) – záznam výkonu jen při tomhle přepnutí
    const stopa = process.env.STOPA === 'prepnuti_' + cil;
    if (stopa) await page.context().browser().startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute',
      'disabled-by-default-v8.cpu_profiler'] });
    v['prepnuti_' + cil] = await prepni(cil);
    if (stopa) fs.writeFileSync(path.join(__dirname, 'vystup', 'stopa.json'), await page.context().browser().stopTracing());
    await page.waitForTimeout(900); // dotažení dat stránky (to se neměří)
    v['prepnuti_' + cil].motor = S.volano.slice();
  }
  // otevření e-mailu: první konverzace (přednačtená) a konverzace hlouběji v seznamu (z motoru)
  await prepni('posta');
  S.volano = [];
  // přednačtení detailů běží 2,5 s po načtení pošty v klidu + odpověď motoru
  for (let i = 0; i < 40 && S.volano.indexOf('postaDetaily') < 0; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(S.latenceMotoru + 1500);
  v.prednacteno = S.volano.indexOf('postaDetaily') >= 0 ? 1 : 0;
  for (const [klic, poradi] of [['email_prednacteny', 1], ['email_z_motoru', 40]]) {
    v[klic] = await page.evaluate(async ([i, tel]) => {
      const m = window.__mereni;
      const radky = document.querySelectorAll('#posta-seznam .seznam-posta [data-vlakno]');
      const r = radky[Math.min(i, radky.length - 1)];
      if (!r) return { ms: -1 };
      const cil = tel ? '[data-panel="vlakno"] .zprava-hlava' : '#posta-detail .zprava-hlava';
      document.querySelectorAll(cil).forEach((x) => x.remove());
      m.cekamNa = cil; m.cekamNaZnacku = 'email';
      delete m.znacky.email;
      const t = performance.now();
      r.click();
      for (let k = 0; k < 200 && m.znacky.email == null; k++) await new Promise((ok) => setTimeout(ok, 25));
      return { ms: m.znacky.email == null ? -1 : Math.round(m.znacky.email - t) };
    }, [poradi, telefon]);
    if (telefon) { await page.keyboard.press('Escape'); }
    await page.waitForTimeout(800);
  }
  // psaní: poznámka pro Clauda na Dnes (PC) / ve Schránce (telefon) a Moje poznámky – zpracování klávesy (ms)
  await prepni(telefon ? 'schranka' : 'dnes');
  await page.waitForTimeout(600);
  for (const [klic, pole] of [['psani_poznamka', '[data-zapis]'], ['psani_moje', '[data-moje-pole]']]) {
    const sel = '#p-' + (telefon ? 'schranka' : 'dnes') + ' ' + pole;
    if (!(await page.$(sel))) { v[klic] = { chybi: true }; continue; }
    await page.click(sel);
    await page.evaluate(() => { window.__mereni.vstup = []; window.__mereni._u0 = window.__mereni.udalosti.length; });
    await page.keyboard.type('Zítra v deset schůzka s investorem na stavbě kvůli předání', { delay: 35 });
    v[klic] = await page.evaluate(() => {
      const m = window.__mereni;
      const s = m.vstup.slice().sort((a, b) => a - b);
      const ud = m.udalosti.slice(m._u0).filter((u) => /key|input/.test(u[0]));
      return { klaves: s.length, prumer: +(s.reduce((a, b) => a + b, 0) / (s.length || 1)).toFixed(1), max: +(s[s.length - 1] || 0).toFixed(1),
        nad50ms: ud.filter((u) => u[2] > 50).length, nejdelsiUdalost: ud.reduce((a, u) => Math.max(a, u[2]), 0) };
    });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
  }
  // živá změna ze serveru (onSnapshot): nový předmět první konverzace → kdy je na Dnes
  if (sc.ucet) {
    await page.click('body', { position: { x: 5, y: 5 } }).catch(() => { /* nic */ });
    await prepni('dnes');
    await page.waitForTimeout(500);
    await page.evaluate(() => { const m = window.__mereni; m.cekamNa = '#p-dnes [data-vlakno="cerstva2"]'; m.cekamNaZnacku = 'zive'; m._d0 = m.dlouhe.length; m._r0 = m.vykresleni; });
    S.data.posta.osobni.unshift({ id: 'cerstva2', ucet: 'osobni', stav: 'hori', od: 'Další odesílatel', predmet: 'Živá změna', ukazka: 'Teď.', kdy: Date.now(), neprectena: true, pocet: 1, odkaz: '#' });
    ulozKopie(['posta']);
    await page.waitForFunction(() => window.__mereni.znacky.zive != null, null, { timeout: 10000 }).catch(() => { /* níž -1 */ });
    await page.waitForTimeout(800);
    v.zive = await page.evaluate(() => { const m = window.__mereni; return { ms: m.znacky.zive == null ? -1 : Math.round(m.znacky.zive - m.snimek),
      dlouhe: m.dlouhe.slice(m._d0).reduce((s, x) => s + x[1], 0), vykresleni: m.vykresleni - m._r0 }; });
  }
  return v;
}

// ---------------------------------------------------------------- scénáře a souhrn
const SCENARE = [
  { nazev: 'telefon teply start (SW, ucet, CPU 4x, pomale 4G)', sirka: 390, vyska: 844, cpu: 4, sit: 'pomala4g', ucet: true, start: 'teply', prace: true, znovu: true },
  { nazev: 'telefon studeny start (bez mezipameti, data v zarizeni)', sirka: 390, vyska: 844, cpu: 4, sit: 'pomala4g', ucet: true, start: 'studeny' },
  { nazev: 'telefon prvni start (nic v zarizeni)', sirka: 390, vyska: 844, cpu: 4, sit: 'pomala4g', ucet: true, start: 'prvni' },
  { nazev: 'telefon teply start bez uctu (jen motor)', sirka: 390, vyska: 844, cpu: 4, sit: 'pomala4g', ucet: false, start: 'teply' },
  { nazev: 'pc teply start (SW, ucet, 1920, CPU 1x)', sirka: 1920, vyska: 1080, cpu: 1, sit: 'rychla', ucet: true, start: 'teply', prace: true },
  { nazev: 'pc teply start (SW, ucet, 1440, CPU 4x)', sirka: 1440, vyska: 900, cpu: 4, sit: 'rychla', ucet: true, start: 'teply', prace: true, znovu: true }
];

const median = (cisla) => { const s = cisla.filter((x) => typeof x === 'number' && x >= 0).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
/** Medián přes běhy pro každou číselnou hodnotu (vnořené objekty zvlášť). */
function souhrn(behy) {
  const vysledek = {};
  const projdi = (cesta, vzor) => {
    Object.keys(vzor).forEach((k) => {
      const c = cesta.concat(k);
      const hodnoty = behy.map((b) => c.reduce((o, x) => (o == null ? o : o[x]), b));
      if (typeof vzor[k] === 'number') c.reduce((o, x, i) => (i === c.length - 1 ? (o[x] = median(hodnoty)) : (o[x] = o[x] || {})), vysledek);
      else if (vzor[k] && typeof vzor[k] === 'object' && !Array.isArray(vzor[k])) projdi(c, vzor[k]);
    });
  };
  projdi([], behy[0]);
  return vysledek;
}

(async () => {
  const srv = server();
  await new Promise((hotovo) => srv.listen(PORT, '127.0.0.1', hotovo));
  // všechno mimo 127.0.0.1 neexistuje – skutečný motor, Firebase ani písma se nikdy nezavolají
  const prohlizec = await chromium.launch({ args: ['--ignore-certificate-errors', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1'] });
  const vse = {};
  for (const sc of SCENARE) {
    if (process.env.JEN && sc.nazev.indexOf(process.env.JEN) < 0) continue;
    const behy = [];
    for (let i = 0; i < OPAKOVANI; i++) {
      try { behy.push(await beh(prohlizec, sc)); } catch (e) { console.log('  ✗ ' + sc.nazev + ' (běh ' + (i + 1) + '): ' + String(e.message).split('\n')[0]); }
    }
    if (!behy.length) continue;
    const s = souhrn(behy);
    s.chyby = Array.from(new Set([].concat(...behy.map((b) => b.chyby))));
    s.motor = behy[behy.length - 1].motor;
    vse[sc.nazev] = s;
    const z = s.znacky || {};
    console.log('\n■ ' + sc.nazev + '  (medián z ' + behy.length + ')');
    console.log('  FCP ' + s.fcp + ' ms · aplikace ' + z.aplikace + ' · Dnes s daty ' + z.dnes + ' · týden ' + z.tyden + ' · čerstvá data ' + z.cerstve + ' ms');
    const ap = s.aplikace || {};
    console.log('  start.js ' + ap['start-js'] + ' · snímek ' + ap.snimek + ' · moduly naběhly ' + ap.start + ' · aplikace vykreslena ' + ap.vykresleno + ' ms');
    console.log('  překreslení ' + s.vykresleni + ' · dlouhé úlohy ' + s.dlouhe.pocet + ' (' + s.dlouhe.soucet + ' ms, max ' + s.dlouhe.max + ') · localStorage čtení ' +
      s.ls.n + '× ' + s.ls.kB + ' kB ' + s.ls.ms + ' ms, zápis ' + s.lsZapis.n + '× ' + s.lsZapis.kB + ' kB ' + s.lsZapis.ms + ' ms · JSON.parse ' + s.json.n + '× ' + s.json.kB + ' kB ' + s.json.ms + ' ms');
    console.log('  soubory ' + s.zdroje.pocet + ' (skriptů ' + s.zdroje.skripty + ', poslední ' + s.zdroje.posledniSkript + ' ms) · přeneseno ' + s.zdroje.prenos_kB + ' kB · rozbaleno ' +
      s.zdroje.dekod_kB + ' kB · motor: ' + s.motor.join(', '));
    if (s.znovu) console.log('  znovu ve stejném procesu (teplá písma a kód): FCP ' + s.znovu.fcp + ' · Dnes s daty ' + (s.znovu.znacky || {}).dnes + ' ms · dlouhé úlohy ' +
      s.znovu.dlouhe.pocet + ' (' + s.znovu.dlouhe.soucet + ' ms, max ' + s.znovu.dlouhe.max + ')');
    if (s.prace) {
      const p = s.prace;
      console.log('  přepnutí: ' + Object.keys(p).filter((k) => /^prepnuti_/.test(k)).map((k) => k.slice(9) + ' ' + p[k].ms + ' ms (dlouhé ' + p[k].dlouhe + ', překr. ' + p[k].vykresleni + ')').join(' · '));
      console.log('  e-mail přednačtený ' + (p.email_prednacteny || {}).ms + ' ms · z motoru ' + (p.email_z_motoru || {}).ms + ' ms · živá změna ' + ((p.zive || {}).ms) + ' ms (dlouhé ' +
        ((p.zive || {}).dlouhe) + ', překr. ' + ((p.zive || {}).vykresleni) + ')');
      ['psani_poznamka', 'psani_moje'].forEach((k) => { const x = p[k] || {}; console.log('  ' + k + ': ø ' + x.prumer + ' ms, max ' + x.max + ' ms, událostí > 50 ms: ' + x.nad50ms + ' (nejdelší ' + x.nejdelsiUdalost + ')'); });
    }
    if (s.chyby.length) console.log('  CHYBY: ' + s.chyby.slice(0, 5).join(' | '));
  }
  fs.mkdirSync(path.join(__dirname, 'vystup'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'vystup', process.env.VYSTUP || 'mereni.json'), JSON.stringify(vse, null, 1));
  await prohlizec.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
