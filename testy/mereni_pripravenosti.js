// Měření připravenosti stránek (Michal 18. 10.: „stále mi celkem nevyhovuje, že to není vše vždy ready, že se to načítá“):
// za jak dlouho ukáže každá stránka OBSAH (ne kostřičku ani „Načítám…“) a kdy jsou na ní čerstvá data z motoru / ze serveru.
//
//   NODE_PATH=…/node_modules node testy/mereni_pripravenosti.js          PC 1500 a telefon 390, všechny stránky
//   JEN=telefon … / STRANKY=zdravi,auto … / KOREN=jina/kopie …          (KOREN = porovnání před a po)
//
// Prostředí jako testy/mereni_rychlosti.js (HTTP/2, service worker, napodobený Firebase s kopiemi dat, data v objemu skutečného
// provozu), motor ale odpovídá za 3 s a souběžné dotazy řadí za sebe (Apps Script). Tři situace:
//   a) studený start rovnou na stránce, data v zařízení z minula (10 h stará),
//   b) start na Přehledu se stejnými daty, za 2 s přepnutí na stránku,
//   c) prázdné zařízení (jen připojení a účet, aplikace nainstalovaná), start na Přehledu, za 8 s přepnutí na stránku.
// Čas = od otevření (a) / od klepnutí (b, c) do obsahu; „kostra“ = mezitím byla vidět kostřička nebo Načítám; čerstvé = kdy
// data té stránky nahradila odpověď motoru / kopie ze serveru. Výsledek: tabulka v konzoli a testy/vystup/pripravenost.json.
'use strict';
process.env.PORT_MERENI = process.env.PORT_MERENI || '8797';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const M = require('./mereni_rychlosti.js');

const LATENCE = Number(process.env.LATENCE) || 3000;
const ZARIZENI = [
  { nazev: 'PC 1500', sirka: 1500, vyska: 900, cpu: 1, sit: 'rychla' },
  { nazev: 'telefon 390', sirka: 390, vyska: 844, cpu: 4, sit: 'pomala4g' }
];
const VSE = ['dnes', 'schranka', 'posta', 'kalendar', 'zdravi', 'fotbal', 'reely', 'plakaty', 'auto', 'knihovna', 'mini'];
const STRANKY = process.env.STRANKY ? process.env.STRANKY.split(',') : VSE;
const NAZEV = { dnes: 'Přehled', schranka: 'Schránka', posta: 'Pošta', kalendar: 'Kalendář', zdravi: 'Zdraví', fotbal: 'Fotbal', reely: 'Reely',
  plakaty: 'Plakáty', auto: 'Auto', knihovna: 'Knihovna', mini: 'mini okno' };
const LIMIT = 25000;

// ---------------------------------------------------------------- v prohlížeči: kdy je obsah, kostra, čerstvá data
const SLEDOVANI = () => {
  const cil = () => localStorage.getItem('__pr.cil') || 'dnes';
  const p = window.__pr = { od: 0, obsah: null, kostra: false, cerstve: null, ref: null, oblasti: [] };
  const q = (s) => document.querySelector(s);
  const telefon = () => matchMedia('(max-width: 759px)').matches;
  const text = (s) => ((q(s) || {}).textContent || '');
  const OBLASTI = { dnes: ['posta', 'schranka', 'zdravi', 'pocasi'], schranka: ['schranka'], posta: ['posta'], kalendar: [], zdravi: ['zdravi'], fotbal: ['fotbal'],
    reely: ['reely'], plakaty: ['plakaty'], auto: ['auto'], knihovna: ['knihovna'], mini: ['posta', 'zdravi'] };
  const HOTOVO = {
    dnes: () => (telefon() ? /\d/.test(text('.hero__cislo')) && q('#p-dnes .mini-kpi[data-pocasi]') && q('#p-dnes .mini-kpi[data-cil="zdravi"]')
      : q('#dl-pozornost .seznam, #dl-pozornost .prazdne') && q('#dl-tyden .agenda__den') && q('#dnes-kpi [data-cil="zdravi"]') &&
        q('#dnes-kpi [data-pocasi]') && !/načítám/i.test(text('#dnes-kpi [data-pocasi]'))),
    schranka: () => q('#p-schranka li'),
    posta: () => q('#posta-seznam [data-vlakno]'),
    kalendar: () => q('#p-kalendar [data-udalost]'),
    zdravi: () => q('#p-zdravi .zdravi-hero'),
    fotbal: () => q('#p-fotbal .fotbal-tabulka tr.nas'),
    reely: () => q('#p-reely .reel__nahled'),
    plakaty: () => q('#p-plakaty .plakat-stage .poster .design'),
    auto: () => q('#p-auto .auto-zapisy'),
    knihovna: () => q('#p-knihovna .kn-karta'),
    mini: () => q('#mini [data-mini-cil="zdravi"]') && q('#mini .mo-karta, #mini section') && !q('#mini .mo-prazdne--nacitam')
  };
  const koren = (c) => (c === 'mini' ? q('#mini') : q('#p-' + c));
  const kontrola = () => {
    const c = cil();
    const el = koren(c);
    const vidim = el && !el.hidden && !(c !== 'mini' && q('#aplikace') && q('#aplikace').hidden);
    if (!vidim) return;
    const nacitam = el.querySelector('.kostra, .mo-prazdne--nacitam') || /Načítám/.test(text('#hlava p'));
    if (nacitam) p.kostra = true;
    if (p.obsah == null && !nacitam && HOTOVO[c] && HOTOVO[c]()) p.obsah = Math.round(performance.now() - p.od);
  };
  new MutationObserver(kontrola).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  // čerstvá data: objekt dat oblasti ve stavu aplikace se vymění (odpověď motoru / kopie ze serveru)
  let st = null;
  const hlidej = async () => {
    if (!window.asistentBezi) { setTimeout(hlidej, 30); return; }
    if (!st) st = (await import('/js/stav.js')).stav;
    const c = cil();
    const obl = OBLASTI[c] || [];
    if (!p.ref || p.refCil !== c) { p.refCil = c; p.ref = obl.map((o) => st[o]); }
    if (p.cerstve == null && obl.length && obl.every((o, i) => st[o] && st[o] !== p.ref[i])) p.cerstve = Math.round(performance.now() - p.od);
    kontrola();
    setTimeout(hlidej, 25);
  };
  hlidej();
  /** Klepnutí na stránku (b, c): měří se znovu od teď. */
  window.__prPrepni = (c) => {
    localStorage.setItem('__pr.cil', c);
    Object.assign(p, { od: performance.now(), obsah: null, kostra: false, cerstve: null, ref: null, refCil: '' });
    const b = document.createElement('button');
    b.type = 'button';
    b.hidden = true;
    if (c === 'mini') b.setAttribute('data-mini-sem', ''); else b.dataset.cil = c;
    document.body.appendChild(b);
    b.click();
    b.remove();
    // stránka může mít obsah hned po klepnutí (z dat v zařízení) – zkontrolovat po vykreslení
    queueMicrotask(kontrola);
  };
};

// ---------------------------------------------------------------- pomůcky
const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
async function cekejNa(page, fn, limit) {
  const konec = Date.now() + limit;
  for (;;) {
    const v = await page.evaluate(fn).catch(() => null);
    if (v) return v;
    if (Date.now() > konec) return null;
    await pauza(80);
  }
}
const hotovoVsechno = () => window.__pr && window.__pr.obsah != null && !!window.__pr.ref && (window.__pr.cerstve != null || !window.__pr.ref.length);

/** Data v zařízení „z minula“: kdy u uložených dat o 10 h zpátky (snímek stránky a nastavení zůstávají). */
const ZESTARNI = () => {
  Object.keys(localStorage).filter((k) => /^asistent\.data\./.test(k)).forEach((k) => {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      if (v && typeof v === 'object' && typeof v.kdy === 'number') { v.kdy -= 10 * 3600e3; localStorage.setItem(k, JSON.stringify(v)); }
    } catch (e) { /* nic */ }
  });
};
const VYPRAZDNI = () => {
  const nechat = ['asistent.pripojeni', 'asistent.ucet', '__fb.user', '__pr.cil'];
  Object.keys(localStorage).forEach((k) => { if (nechat.indexOf(k) < 0) localStorage.removeItem(k); });
  sessionStorage.clear();
};

async function kontext(prohlizec, z) {
  const ctx = await prohlizec.newContext({ viewport: { width: z.sirka, height: z.vyska }, isMobile: z.sirka < 760, hasTouch: z.sirka < 760,
    colorScheme: 'light', ignoreHTTPSErrors: true, serviceWorkers: 'allow', locale: 'cs-CZ', timezoneId: 'Europe/Prague' });
  await ctx.exposeBinding('__fb', (zdroj, op, a) => M.fbObsluha(op, a));
  await ctx.addInitScript(M.PRIPRAVA, [M.WEB + '__motor', M.KLIC, true, M.UZIVATEL]);
  await ctx.addInitScript(SLEDOVANI);
  return ctx;
}

/** Nová stránka s omezením CPU a sítě (jako mereni_rychlosti.js). */
async function otevri(ctx, z, url) {
  const { page, chyby } = await M.stranka(ctx, z.cpu, z.sit);
  if (process.env.LADIT) {
    page.on('request', (r) => { if (/__motor|__fb/.test(r.url())) chyby.push('→ ' + r.url().split('/').pop() + ' ' + Math.round(Date.now() % 1e5)); });
    page.on('requestfailed', (r) => chyby.push('✗ ' + r.url().split('/').pop() + ' ' + (r.failure() || {}).errorText));
    page.on('console', (m) => chyby.push('console ' + m.type() + ': ' + m.text().slice(0, 120)));
  }
  await page.goto(url || M.WEB, { waitUntil: 'commit' });
  return { page, chyby };
}

async function zavri(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))).catch(() => { /* nic */ });
  await page.close();
}

/** Server a motor do výchozího stavu mezi běhy: čerstvé kopie (server běží), prázdná fronta motoru. */
function znovuServer() {
  M.vynulujFrontu();
  M.ulozKopie();
}

/** Příprava zařízení „z minula“: otevřít a projít všechny stránky (data se uloží), nainstalovat service worker. */
async function priprav(ctx, z) {
  const { page } = await otevri(ctx, z);
  await cekejNa(page, () => !!(navigator.serviceWorker && navigator.serviceWorker.controller) || null, 20000);
  for (const c of VSE) {
    if (c === 'mini' && z.sirka < 760) continue;
    await page.evaluate((s) => window.__prPrepni(s), c);
    await cekejNa(page, hotovoVsechno, 12000);
    if (c === 'mini') await page.keyboard.press('Control+Shift+KeyA'); // zpět do celé aplikace
    await pauza(300);
  }
  await page.evaluate(() => window.__prPrepni('dnes'));
  await pauza(4500);
  await zavri(page);
}

async function zmer(page, limit) {
  if (process.env.LADIT) console.log('  [zmer od] ' + (Date.now() % 1e5));
  await cekejNa(page, hotovoVsechno, limit || LIMIT);
  if (process.env.LADIT) console.log('  [zmer do] ' + (Date.now() % 1e5));
  await pauza(200);
  return page.evaluate(() => ({ obsah: window.__pr.obsah, kostra: window.__pr.kostra, cerstve: window.__pr.cerstve, oblasti: (window.__pr.ref || []).length }));
}

// ---------------------------------------------------------------- situace
async function situaceA(prohlizec, z, ctx, c) {
  znovuServer();
  const p0 = await ctx.newPage();
  await p0.goto(M.WEB + 'ikony/ikona-192.png'); // jen kvůli localStorage na stejné adrese (obrázek – aplikace se nespustí)
  await p0.evaluate(ZESTARNI);
  await p0.evaluate(([s]) => { localStorage.setItem('__pr.cil', s); if (s !== 'mini') localStorage.setItem('asistent.pohled', JSON.stringify(s)); }, [c]);
  await p0.close();
  M.S.volano = [];
  const { page, chyby } = await otevri(ctx, z, M.WEB + (c === 'mini' ? '#mini' : ''));
  const v = await zmer(page);
  if (process.env.LADIT) console.log('\n[a ' + c + ']',JSON.stringify(await page.evaluate(async () => ({ bezi: !!window.asistentBezi, url: location.href,
    stari: Object.keys(localStorage).filter((k) => /^asistent\.data\./.test(k)).map((k) => { try { return k + ' ' + Math.round((Date.now() - JSON.parse(localStorage.getItem(k)).kdy) / 6e4); } catch (e) { return k; } }),
    nacita: (await import('/js/stav.js')).stav.nacita, chyby: Object.keys((await import('/js/stav.js')).stav.chyby),
    ucet: JSON.stringify((await import('/js/ucet.js')).stavUctu()).slice(0, 300), vid: document.visibilityState,
    casovac: await Promise.race([new Promise((r) => setTimeout(() => r('jde'), 50)), new Promise((r) => { let n = 0; const f = () => (++n > 60 ? r('raf60') : requestAnimationFrame(f)); f(); })]),
    pr: JSON.stringify(window.__pr).slice(0, 80),
    get: await Promise.race([fetch('/manifest.webmanifest?x=' + Math.random(), { cache: 'no-store' }).then((r) => 'stav ' + r.status, (e) => 'chyba ' + e.message), new Promise((r) => setTimeout(() => r('visí'), 3000))]),
    get2: await Promise.race([fetch('/__fb/firebase-app.js?x=' + Math.random()).then((r) => 'stav ' + r.status, (e) => 'chyba ' + e.message), new Promise((r) => setTimeout(() => r('visí'), 3000))]),
    online: navigator.onLine,
    fetch: await Promise.race([fetch('/__motor',{ method: 'POST', body: '{}' }).then((r) => 'stav ' + r.status, (e) => 'chyba ' + e.message), new Promise((r) => setTimeout(() => r('visí'), 3000))]),
    kopie: await Promise.race([(await import('/js/ucet.js')).kopie('zmeny').then((k) => 'kopie ' + typeof k), new Promise((r) => setTimeout(() => r('kopie visí'), 6000))]), sdk: performance.getEntriesByType('resource').filter((e) => /__fb|__motor/.test(e.name)).map((e) => e.name.split('/').pop() + ' ' + Math.round(e.startTime) + '-' + Math.round(e.responseEnd)),
    znacky: performance.getEntriesByType('mark').map((m) => m.name + ' ' + Math.round(m.startTime)), sw: !!navigator.serviceWorker.controller }))), chyby.join(' | '));
  v.motor = M.S.volano.slice();
  await zavri(page);
  return v;
}

async function situaceB(prohlizec, z, ctx, c, poMs, prazdne) {
  znovuServer();
  const p0 = await ctx.newPage();
  await p0.goto(M.WEB + 'ikony/ikona-192.png');
  await p0.evaluate(prazdne ? VYPRAZDNI : ZESTARNI);
  await p0.evaluate(() => { localStorage.setItem('__pr.cil', 'dnes'); localStorage.setItem('asistent.pohled', JSON.stringify('dnes')); });
  await p0.close();
  M.S.volano = [];
  const { page } = await otevri(ctx, z);
  // Přehled po startu (u prázdného zařízení = obsah Přehledu na prázdném zařízení)
  const prehled = await zmer(page, c === 'dnes' ? LIMIT : poMs + 200);
  await cekejNa(page, () => (performance.getEntriesByName('asistent-vykresleno').length ? performance.getEntriesByName('asistent-vykresleno')[0].startTime : null), 15000);
  const vykresleno = await page.evaluate(() => (performance.getEntriesByName('asistent-vykresleno')[0] || {}).startTime || 0);
  const ted = await page.evaluate(() => performance.now());
  if (poMs > ted - vykresleno) await pauza(poMs - (ted - vykresleno));
  let v = prehled;
  if (c !== 'dnes') {
    await page.evaluate((s) => window.__prPrepni(s), c);
    v = await zmer(page);
  }
  v.motor = M.S.volano.slice();
  await zavri(page);
  return v;
}

// ---------------------------------------------------------------- tabulka
const ms = (x) => (x == null ? 'nic' : x < 1000 ? x + ' ms' : (x / 1000).toFixed(1).replace('.', ',') + ' s');
function bunka(v, cerstve) {
  if (!v) return '–';
  return ms(v.obsah) + (v.kostra ? ' (kostra)' : '') + (cerstve && v.oblasti ? ', čerstvé ' + ms(v.cerstve) : '');
}

(async () => {
  const srv = M.server();
  await new Promise((hotovo) => srv.listen(M.PORT, '127.0.0.1', hotovo));
  const prohlizec = await chromium.launch({ args: ['--ignore-certificate-errors', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1'] });
  const vysledky = {};
  for (const z of ZARIZENI) {
    if (process.env.JEN && z.nazev.indexOf(process.env.JEN) < 0) continue;
    M.novaData();
    M.S.latenceMotoru = LATENCE;
    M.S.fbPrvni = z.sit === 'pomala4g' ? 1200 : 250;
    const r = vysledky[z.nazev] = {};
    // a) a b): jedno zařízení s daty z minula (service worker nainstalovaný)
    const ctx = await kontext(prohlizec, z);
    await priprav(ctx, z);
    for (const c of STRANKY) {
      if (c === 'mini' && z.sirka < 760) continue;
      r[c] = { a: await situaceA(prohlizec, z, ctx, c).catch((e) => ({ chyba: e.message })) };
      r[c].b = await situaceB(prohlizec, z, ctx, c, 2000, false).catch((e) => ({ chyba: e.message }));
      process.stdout.write('.');
    }
    await ctx.close();
    // c) prázdné zařízení – aplikace nainstalovaná (service worker), žádná data
    for (const c of STRANKY) {
      if (c === 'mini' && z.sirka < 760) continue;
      const ctx2 = await kontext(prohlizec, z);
      znovuServer();
      const { page } = await otevri(ctx2, z);
      await cekejNa(page, () => !!(navigator.serviceWorker && navigator.serviceWorker.controller) || null, 20000);
      await pauza(500);
      await page.close();
      r[c].c = await situaceB(prohlizec, z, ctx2, c, 8000, true).catch((e) => ({ chyba: e.message }));
      await ctx2.close();
      process.stdout.write('·');
    }
    console.log('');
  }
  fs.mkdirSync(path.join(__dirname, 'vystup'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'vystup', process.env.VYSTUP || 'pripravenost.json'), JSON.stringify(vysledky, null, 1));
  Object.keys(vysledky).forEach((z) => {
    console.log('\n■ ' + z + ' (motor ' + LATENCE / 1000 + ' s, s účtem)');
    console.log('| Stránka | a) start na stránce, data z minula | b) přepnutí 2 s po startu | c) prázdné zařízení, přepnutí 8 s po startu |');
    console.log('|---|---|---|---|');
    Object.keys(vysledky[z]).forEach((c) => {
      const x = vysledky[z][c];
      console.log('| ' + NAZEV[c] + ' | ' + bunka(x.a, true) + ' | ' + bunka(x.b, true) + ' | ' + bunka(x.c, false) + ' |');
    });
  });
  await prohlizec.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
