// Test aplikace v prohlížeči (Playwright) – telefon, iPad na výšku i na šířku, PC; světlý i tmavý režim.
// Spuštění:  node testy/test_aplikace.js   (Playwright: `npm i` ve složce testy, nebo NODE_PATH na jeho node_modules)
// Aplikace běží proti napodobenému motoru (page.route) – žádná skutečná pošta ani klíč. Snímky do testy/vystup/.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const KOREN = path.join(__dirname, '..');
const VYSTUP = path.join(__dirname, 'vystup');
fs.mkdirSync(VYSTUP, { recursive: true });
const MOTOR = 'https://script.google.com/macros/s/TEST-motor/exec';
const KLIC = 'k'.repeat(64);

// ---------------------------------------------------------------- statický server repa
const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const cesta = path.join(KOREN, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!cesta.startsWith(KOREN) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': (TYPY[path.extname(cesta)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(cesta).pipe(res);
});

// ---------------------------------------------------------------- napodobený motor (stejné tvary dat jako apps-script/Kod.gs)
const ted = Date.now();
const H = 36e5;
const den = (n, h = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime() + h * H; };
const iso = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const vlaknoSouhrn = {
  v1: { id: 'v1', ucet: 'osobni', stav: 'otazka', navrh: true, od: 'Trenér', predmet: 'Sraz v sobotu', ukazka: 'Ahoj, sraz v 8:30. Stihneš to?', kdy: ted - H, neprectena: true, pocet: 1, odkaz: '#', stitky: ['Fotbal'] },
  v2: { id: 'v2', ucet: 'pracovni', stav: 'cekas', od: 'Investor', predmet: 'Protokol', ukazka: 'Posílám protokol.', kdy: ted - 2 * H, neprectena: false, pocet: 2, odkaz: '#' }
};
const KALENDARE = [{ id: 'g1', nazev: 'Osobní', barva: '#2f6bff', zdroj: 'google', skryty: false, zapis: true, druh: 'osobni' },
  { id: 'ics-1', nazev: 'Rodina', barva: '#e2860a', zdroj: 'icloud', skryty: false, druh: 'rodina' }];
const zapasFotbal = (tym, dni, h, domaci, hoste, vysledek) => ({ id: tym + dni, tym, zacatek: new Date(den(dni, h)).toISOString(), domaci, hoste,
  doma: /Vnorovy/.test(domaci), misto: '', vysledek, stav: vysledek ? 'odehrano' : 'naplanovano', url: '#' });
const motor = {
  info: () => ({ verze: 'test', akce: Object.keys(motor).concat(['polozkaUpravy']), ucet: 'tester@example.com', posta: { osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false, podpisy: { osobni: 'Michal', pracovni: '' } },
    kalendare: KALENDARE, skupinyHostu: [{ nazev: 'Dorost – rodiče', adresy: ['rodic1@x.test', 'rodic2@x.test'] }] }),
  schranka: () => ({ nove: [{ id: 'n1', slozka: 'NOVE', kdy: ted - H, odkud: 'iPhone', typ: '', stav: '', shrnuti: '', termin: '', text: 'Zkušební poznámka z iPhonu', vlakno: [] }],
    ceka: [{ id: 'c1', slozka: 'CEKA', kdy: ted - 5 * H, odkud: 'iPhone', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Zavolat kvůli lešení', termin: '', text: 'Připomeň mi zavolat.', vlakno: [] },
      { id: 'c2', slozka: 'CEKA', kdy: ted - 2 * H, odkud: 'iPhone', typ: 'email', stav: 'rozhodni', shrnuti: 'E-mail trenérovi', termin: '', tema: '', nadpis: '',
        navrh: { typ: 'email', komu: ['Trenér'], predmet: 'Trénink', text: 'Ahoj, v úterý nepřijdu.' }, text: 'Napiš trenérovi, že v úterý nepřijdu.', vlakno: [] }],
    hotovo: [], ted: Date.now() }),
  posta: () => ({ osobni: [vlaknoSouhrn.v1], pracovni: [vlaknoSouhrn.v2], pracovniAdresa: 'prace@firma.test', firemni: null, ted: Date.now() }),
  vlakno: (d) => ({ id: d.id, predmet: d.id === 'v1' ? 'Sraz v sobotu' : 'Protokol', odkaz: '#', vDorucenych: true, skryto: 0, ucet: d.id === 'v1' ? 'osobni' : 'pracovni',
    navrhOdpovedi: d.id === 'v1' && !navrhZahozen ? { zpravaId: 'm-v1', text: 'Ahoj, budu tam v 8:15.', kdy: new Date(ted).toISOString(), poznamka: '' } : undefined,
    zpravy: (d.id === 'v1' ? [{ id: 'm-starsi', od: 'Já', odAdresa: 'tester@example.com', odeMe: true, komu: 'trener@klub.test', kopie: '', kdy: ted - 30 * H, predmet: 'Sraz',
      text: 'Kdy je sraz?', html: '', prilohy: [] }] : []).concat([{ id: 'm-' + d.id, od: 'Trenér', odAdresa: 'trener@klub.test', odeMe: false, komu: 'tester@example.com', kopie: '', kdy: ted - H, predmet: 'Sraz',
      text: 'Ahoj, sraz v 8:30.', html: d.id === 'v2' ? '<p>Protokol <img src="https://sledovani.example/pixel.gif" width="1" height="1"></p>' : '', prilohy: [] }]) }),
  kalendar: (d) => ({ udalosti: [
    { id: 'u1|' + den(0, 9), nazev: 'Porada', zacatek: den(0, 9), konec: den(0, 10), celodenni: false, misto: 'kancelář', popis: '', kalendar: 'Osobní', kalendarId: 'g1', barva: '#2f6bff', zdroj: 'google', opakovana: true },
    { id: 'u3|' + den(0, 23), nazev: 'Pozdní hovor', zacatek: den(0, 23), konec: den(0, 23.5), celodenni: false, misto: '', popis: '', kalendar: 'Osobní', kalendarId: 'g1', barva: '#2f6bff', zdroj: 'google', opakovana: false },
    { id: 'u2|' + den(1), nazev: 'Narozeniny', zacatek: den(1), konec: den(2), celodenni: true, misto: '', popis: '', kalendar: 'Rodina', kalendarId: 'ics-1', barva: '#e2860a', zdroj: 'icloud' },
    // osobní událost vždy v budoucnu (testy výpisu týdne nesmí záviset na tom, kolik je hodin)
    { id: 'u5|' + den(-1, 17), nazev: 'Trénink dorostu', zacatek: den(-1, 17), konec: den(-1, 18.5), celodenni: false, misto: 'hřiště', popis: '', kalendar: 'Osobní', kalendarId: 'g1', barva: '#2f6bff', zdroj: 'google', opakovana: true },
    { id: 'u4|' + den(2, 10), nazev: 'Schůzka', zacatek: den(2, 10), konec: den(2, 11), celodenni: false, misto: '', popis: '', kalendar: 'Osobní', kalendarId: 'g1', barva: '#2f6bff', zdroj: 'google', opakovana: false }
  ].filter((u) => u.zacatek < d.do && u.konec > d.od), chyby: [], od: d.od, do: d.do, ted }),
  kalendare: () => KALENDARE,
  kalendarZalozit: (d) => ({ id: 'zapasy@group.test', kalendare: KALENDARE.concat({ id: 'zapasy@group.test', nazev: d.nazev, barva: d.barva, zdroj: 'google', skryty: false, zapis: true }) }),
  udalostUlozit: (d) => ({ id: 'nova@google.com', kalendarId: d.kalendarId }),
  udalostSmazat: () => true,
  zapasyImport: () => ({ pridano: 3, upraveno: 0, beze_zmeny: 0, kalendar: 'Zápasy', kalendarId: 'zapasy@group.test' }),
  odeslat: () => true,
  navrhZahodit: () => { navrhZahozen = true; return { smazano: 1 }; },
  oznacit: () => true,
  hledat: (d) => ({ dotaz: d.dotaz, vlakna: [Object.assign({}, vlaknoSouhrn.v2, { id: 'v9', predmet: 'Starý protokol', kdy: ted - 90 * 24 * H })] }),
  pripomenout: (d) => ({ id: 'c9', slozka: 'CEKA', kdy: Date.now(), odkud: 'aplikace (pošta)', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Odpovědět: Sraz v sobotu (Trenér)',
    termin: d.termin, text: 'Připomenutí e-mailu.', vlakno: [] }),
  polozka: (d) => (d.jak === 'nadpis' || d.jak === 'tema' ? Object.assign(motor.schranka().ceka.find((x) => x.id === d.id), { [d.jak]: d.text }) : true),
  poznamka: (d) => ({ id: 'n' + Date.now(), slozka: 'NOVE', kdy: Date.now(), odkud: 'aplikace', typ: '', stav: '', shrnuti: '', termin: '', text: d.text, vlakno: [] }),
  zdravi: () => ({ vytvoreno: ted, dny: [
      { den: iso(den(-1, 12)), whoop: { pripravenost: { skore: 55, hrv: 70, klidovyTep: 52 }, zatez: { zatez: 12.1, kroky: 9000 } },
        apple: { kroky: 10234, energie: 640, cviceni: 45, vzdalenost: 7.8, vo2max: 41.2 } },
      { den: iso(ted), whoop: { pripravenost: { skore: 72, hrv: 84.3, klidovyTep: 49, spo2: 96.4 },
        spanek: { start: den(0, -1), konec: den(0, 6), celkem: 6.5 * H, hluboky: 1.4 * H, rem: 1.6 * H, lehky: 3.5 * H, bdeni: 0.3 * H, vykon: 91, potreba: 8 * H },
        zatez: { probiha: true, zatez: 6.2, kroky: 4000 } } }],
    treninky: [{ id: 'w1', den: iso(ted), start: den(0, 9), konec: den(0, 10), sport: 'soccer', zatez: 11.5, tepPrumer: 140, tepMax: 180, kcal: 700, zony: [1, 5, 20, 20, 10, 4] }],
    whoop: { nastaveno: true, propojeno: true, sync: { kdy: ted, chyba: '' } }, apple: { kdy: ted },
    rezim: { kofeinDo: '14:00', treninkDny: [], zapasTymy: ['A'], polozky: [{ id: 'kreatin', nazev: 'Kreatin', davka: '5 g', kdy: 'rano' },
      { id: 'kofein', nazev: 'Kofein', davka: 'před výkopem', kdy: 'zapas', jen: 'zapas' }, { id: 'horcik', nazev: 'Hořčík', davka: 'večer', kdy: 'vecer' }] } }),
  zdraviKlic: () => ({ klic: 'testovaci-klic-zdravi' }),
  fotbal: () => ({ vKalendari: [], kalendar: null, data: { verze: 1, aktualizovano: new Date(ted).toISOString(), klub: 'FK Agro Vnorovy',
    tymy: [{ klic: 'A', nazev: 'A-tým', barva: '#2e7a4d' }, { klic: 'B', nazev: 'B-tým', barva: '#0f7c8c' }, { klic: 'dorost', nazev: 'Dorost', barva: '#a8620c' }],
    zapasy: [zapasFotbal('A', -6, 16, 'FK Agro Vnorovy', 'TJ Lysovice', '1:3'), zapasFotbal('A', 2, 15, 'FK Šardice', 'FK Agro Vnorovy', ''),
      zapasFotbal('B', -5, 15, 'Vnorovy B', 'Nová Lhota', '8:0'), zapasFotbal('dorost', -5, 10, 'FC Kyjov 1919', 'FK Agro Vnorovy', '4:1'),
      zapasFotbal('dorost', 3, 12, 'FK Agro Vnorovy', 'TJ Sokol Těšany', '')],
    // tabulky a detail zápasu (vymyšlení hráči) – stránka Fotbal
    tabulky: { A: { celkem: [{ poradi: 1, klub: 'FK Šardice', z: 9, v: 8, r: 1, p: 0, skore: '30:8', body: 25 }, { poradi: 2, klub: 'FK Agro Vnorovy', z: 9, v: 3, r: 1, p: 5, skore: '16:20', body: 10 }],
      doma: [{ poradi: 1, klub: 'FK Agro Vnorovy', z: 4, v: 3, r: 0, p: 1, skore: '9:5', body: 9 }], venku: [], aktualizovano: new Date(ted).toISOString() } },
    detaily: { 'A-6': { polocas: '0:2', goly: [{ min: 23, hrac: 'Horák Pavel', strana: 'hoste', pozn: '' }, { min: 67, hrac: 'Svoboda Tomáš', strana: 'domaci', pozn: '' }],
      karty: [{ min: 35, hrac: 'Dvořák Martin', barva: 'zluta', strana: 'domaci' }], divaku: 160 } } } }),
  dochazka: () => ({ udalosti: [{ zacatek: new Date(den(-1, 17)).toISOString(), druh: 'T_CT', nazev: 'ČT - DOROST', zruseno: false, venku: false,
    pocty: { prislo: 18, omluveno: 2, neomluveno: 1, mozna: 0, bez: 0, pozvano: 21 }, omluveni: ['Hráč A', 'Hráč B'], neomluveni: ['Hráč C'] }], aktualizovano: new Date(ted).toISOString(), chyba: '' }),
  fotbalKalendar: (d) => ({ pridano: 2, upraveno: 0, beze_zmeny: 0, kalendare: {}, kalendareSeznam: KALENDARE }),
  stitky: () => [{ nazev: 'Fotbal', neprectenych: 1 }, { nazev: 'Účty', neprectenych: 0 }],
  postaStitek: (d) => ({ nazev: d.nazev, vlakna: d.nazev === 'Fotbal' ? [vlaknoSouhrn.v1, { id: 'v8', ucet: 'osobni', stav: 'resi', od: 'Rozhodčí', predmet: 'Zápis o utkání', ukazka: 'Zápis v příloze.', kdy: ted - 200 * H, neprectena: false, pocet: 1, odkaz: '#', stitky: ['Fotbal'] }] : [], ted }),
  kontakty: () => [{ j: 'Trenér', a: 'trener@klub.test', n: 5 }, { j: 'Investor', a: 'info@stavba.test', n: 2 }],
  podpisyUlozit: (d) => ({ osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false, podpisy: d.podpisy }),
  pocasi: () => ({ vytvoreno: Date.now(), misto: 'Veselí nad Moravou', souhrn: 'Silné bouřky', zdroj: 'ČHMÚ',
    vystrahy: [{ typ: 'vystraha', uroven: 'zluta', nazev: 'Silné bouřky', od: den(1, 14), do: den(1, 22), celyKraj: true, text: 'Je třeba dbát na bezpečnost.', popis: '' }],
    reky: [{ typ: 'hladina', uroven: 'zelena', nazev: 'Morava – Strážnice', stav: 'bez povodně', kdy: ted - H, hladina: 82, trend: 'ustálená', spa: 0, spaPredpoved: 0, maxPredpoved: 82, kdyMax: ted, spa1: 530, text: 'Hladina 82 cm, ustálená.' }],
    predpovedi: [0, 1, 2, 3].map((i) => ({ nazev: 'Předpověď', od: den(i, 0), do: den(i + 1, 0), den: iso(den(i, 12)), oblast: 'Jihomoravský kraj', uvod: ['Jasno', 'Bouřky', 'Polojasno', 'Déšť'][i],
      tMax: [20 + i, 24 + i], tMin: i ? [8, 11] : null, srazky: '', vitr: '', jevy: [], ikona: ['slunce', 'bourka', 'polojasno', 'dest'][i], uroven: 'info', vydano: ted })) })
};
const volano = [];
let navrhZahozen = false;

async function pripravMotor(page) {
  await page.route(MOTOR, async (route) => {
    const data = JSON.parse(route.request().postData() || '{}');
    let telo;
    if (data.klic !== KLIC) telo = { ok: false, chyba: 'klic' };
    else if (!motor[data.akce]) telo = { ok: false, chyba: 'Neznámá akce.' };
    else { volano.push(data); telo = { ok: true, data: motor[data.akce](data) }; }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(telo) });
  });
}

// ---------------------------------------------------------------- pomůcky
let ok = 0, chyb = 0;
async function test(nazev, fn) {
  // JEN=část názvu → spustí jen odpovídající testy (ladění)
  if (process.env.JEN && nazev.indexOf(process.env.JEN) < 0) return;
  try { await fn(); ok++; console.log('  ✓ ' + nazev); }
  catch (e) { chyb++; console.log('  ✗ ' + nazev + '\n    ' + String(e.message || e).split('\n').filter(Boolean).slice(0, 12).join('\n    ')); }
}
function jistota(podminka, zprava) { if (!podminka) throw new Error(zprava); }

const VELIKOSTI = [
  { nazev: 'telefon', sirka: 390, vyska: 844, dotyk: true },
  { nazev: 'ipad-vyska', sirka: 820, vyska: 1180, dotyk: true },
  { nazev: 'ipad-sirka', sirka: 1180, vyska: 820, dotyk: true },
  { nazev: 'pc', sirka: 1440, vyska: 900, dotyk: false }
];

async function novaStranka(prohlizec, v, motiv) {
  const ctx = await prohlizec.newContext({ viewport: { width: v.sirka, height: v.vyska }, colorScheme: motiv || 'light', hasTouch: v.dotyk, isMobile: v.nazev === 'telefon' });
  await ctx.addInitScript(([url, klic]) => {
    if (!localStorage.getItem('asistent.pripojeni')) localStorage.setItem('asistent.pripojeni', JSON.stringify({ url, klic }));
    // záznam historie (ladění zavírání panelů tlačítkem Zpět)
    window.__hist = [];
    const zpet = history.back.bind(history), pridej = history.pushState.bind(history);
    history.back = () => { window.__hist.push('back ' + (performance.now() | 0) + ' ' + String(new Error().stack).split('\n').slice(2, 4).join(' < ').replace(/https?:\/\/[^/]+\//g, '')); zpet(); };
    history.pushState = (s, t, u) => { window.__hist.push('push ' + JSON.stringify(s) + ' ' + (performance.now() | 0)); pridej(s, t, u); };
    addEventListener('popstate', (e) => window.__hist.push('pop ' + JSON.stringify(e.state) + ' ' + (performance.now() | 0)));
  }, [MOTOR, KLIC]);
  const page = await ctx.newPage();
  const chybyStranky = [];
  page.on('pageerror', (e) => chybyStranky.push(e.message));
  page.on('console', (m) => {
    // záměrně zablokovaný obrázek z e-mailu (sledovací pixel) prohlížeč hlásí jako chybu – to je správně
    if (m.type() === 'error' && !/Content Security Policy directive: "img-src data: cid:"/.test(m.text())) chybyStranky.push(m.text());
  });
  await pripravMotor(page);
  return { ctx, page, chybyStranky };
}

(async () => {
  await new Promise((r) => server.listen(8766, '127.0.0.1', r));
  const WEB = 'http://127.0.0.1:8766/';
  const prohlizec = await chromium.launch();
  console.log('Asistent – test v prohlížeči');

  // ---------- připojení: úvodní obrazovka, špatný klíč, správný klíč
  await test('úvod: kontrola adresy, špatný klíč, pak připojení přes motor', async () => {
    const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const chybyStranky = [];
    page.on('pageerror', (e) => chybyStranky.push(e.message));
    await pripravMotor(page);
    await page.goto(WEB);
    await page.waitForSelector('#uvod:not([hidden]) [data-uvod-pripojit]');
    // adresa Schránky pro Clauda (diktování) místo motoru – odpovídá {ok: 'ne'} a aplikace to musí poznat
    const SCHRANKA = 'https://script.google.com/macros/s/TEST-schranka/exec';
    await page.route(SCHRANKA, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: 'ne', chyba: 'prázdná poznámka' }) }));
    await page.fill('[data-pripojeni-url]', SCHRANKA);
    await page.fill('[data-pripojeni-klic]', KLIC);
    await page.click('[data-uvod-pripojit]');
    await page.waitForFunction(() => /Schránce pro Clauda/.test(document.querySelector('[data-pripojeni-chyba]').textContent));
    jistota(!(await page.isVisible('#aplikace')), 'se Schránkou se aplikace nesmí tvářit připojeně');
    await page.fill('[data-pripojeni-url]', 'https://example.com/neco');
    await page.fill('[data-pripojeni-klic]', KLIC);
    await page.click('[data-uvod-pripojit]');
    jistota(/script\.google\.com/.test(await page.textContent('[data-pripojeni-chyba]')), 'chybí hláška o tvaru adresy');
    await page.fill('[data-pripojeni-url]', MOTOR);
    await page.fill('[data-pripojeni-klic]', 'x'.repeat(64));
    await page.click('[data-uvod-pripojit]');
    await page.waitForFunction(() => /Klíč nesedí/.test(document.querySelector('[data-pripojeni-chyba]').textContent));
    await page.fill('[data-pripojeni-klic]', KLIC);
    await page.click('[data-uvod-pripojit]');
    await page.waitForSelector('#aplikace:not([hidden]) .hero'); // telefon: zelená hlavní karta místo čtyř čísel
    // na Dnes je jen pošta, která na tebe čeká (otázka), ne ta, kde čekáš ty
    await page.waitForFunction(() => document.querySelectorAll('.pozornost [data-vlakno]').length === 1);
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await page.screenshot({ path: path.join(VYSTUP, 'pripojeno_telefon.png') });
    await ctx.close();
  });

  for (const v of VELIKOSTI) {
    for (const motiv of v.nazev === 'telefon' || v.nazev === 'pc' ? ['light', 'dark'] : ['light']) {
      const jmeno = v.nazev + (motiv === 'dark' ? '-tmavy' : '');
      await test(jmeno + ': Dnes, Schránka, Pošta, Kalendář bez chyb a bez přetékání', async () => {
        const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, motiv);
        await page.goto(WEB);
        await page.waitForFunction(() => document.querySelector('#dl-tyden .agenda__u') && document.querySelector('.vystraha') &&
          (window.innerWidth < 760 ? document.querySelector('.pozornost .pozor') : document.querySelector('#dl-pozornost .seznam')));
        const pretika = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        jistota(await pretika() <= 0, 'Dnes přetéká do strany');
        // navigace: telefon = spodní lišta, iPad = panel s ikonami, PC = panel s popisky; horní lišta s hledáním od iPadu
        // viditelné = má na stránce plochu (skrytý rodič se počítá)
        const vidim = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
        jistota(await vidim('#lista') === v.sirka < 760, 'spodní lišta');
        jistota(await vidim('#rail') === v.sirka >= 760, 'postranní panel');
        jistota(await vidim('#horni') === v.sirka >= 760, 'horní lišta s hledáním');
        jistota(await vidim('.rail__btn > span:not(.pocet)') === v.sirka >= 1180, 'popisky v postranním panelu');
        // týden jako krátký výpis, výstraha ČHMÚ nahoře, karta počasí; nic z Dnes se neopakuje (žádný půlkruh ani sloupce)
        // (dnešní události, které už skončily, výpis neukazuje – zítřejší narozeniny jsou tam vždy)
        jistota(await page.locator('#dl-tyden .agenda__u').count() >= 1 && !(await page.locator('.ukazatel, .tyden-graf').count()), 'týden jako výpis');
        jistota(/Silné bouřky/.test(await page.textContent('.vystraha')), 'výstraha ČHMÚ');
        jistota(await vidim(v.sirka < 760 ? '.mini-kpi[data-pocasi]' : '#dnes-kpi [data-pocasi]'), 'karta počasí');
        if (v.sirka >= 760) jistota(await page.locator('#dl-pozornost [data-vlakno="v1"]').count() === 1 && await page.locator('#dl-pozornost [data-polozka-id="c1"]').count() === 1, 'pozornost: úkol i pošta v jednom seznamu');
        if (v.sirka < 760) {
          jistota(await vidim('.hero') && await vidim('.lista__plus') && !(await vidim('#dnes-kpi')), 'telefon: hlavní karta a + v liště');
          jistota(await page.locator('.pozornost .pozor').count() >= 2, 'telefon: Vyžaduje pozornost');
        }
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_dnes.png'), fullPage: v.nazev !== 'pc' });
        // detail počasí v okně uprostřed
        await page.click(v.sirka < 760 ? '.mini-kpi[data-pocasi]' : '#dnes-kpi [data-pocasi]');
        await page.waitForSelector('.okno-pozadi.videt .pocasi-dny li');
        jistota(await page.locator('.okno .pocasi-dny li').count() === 4 && /Silné bouřky/.test(await page.textContent('.okno')), 'detail počasí');
        jistota(await page.evaluate(() => { const o = document.querySelector('.okno'); return o.scrollWidth <= o.clientWidth + 1; }), 'okno počasí přetéká');
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_pocasi.png') });
        await page.click('.okno-pozadi [data-okno="ano"]');
        await page.waitForSelector('.okno-pozadi', { state: 'detached' });
        // Nastavení: okno uprostřed se záložkami
        await page.click(v.sirka < 760 ? '.hlava-ja [data-otevri-nastaveni]' : '#rail [data-otevri-nastaveni]');
        await page.waitForSelector('[data-panel="nastaveni"].otevreny .nast-zalozky');
        await page.click('[data-panel="nastaveni"] [data-nast-sekce="pocasi"]');
        await page.waitForFunction(() => /Veselí nad Moravou|Místo/.test(document.querySelector('[data-panel="nastaveni"] [data-sekce="pocasi"]').textContent));
        if (v.sirka >= 760) {
          const r = await page.evaluate(() => { const b = document.querySelector('[data-panel="nastaveni"]').getBoundingClientRect(); return [b.left + b.width / 2, window.innerWidth / 2 + (document.querySelector('#rail') ? 0 : 0)]; });
          jistota(Math.abs(r[0] - r[1]) < 2, 'Nastavení není uprostřed: ' + r.join(' / '));
        }
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_nastaveni.png') });
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-panel="nastaveni"]', { state: 'detached' });

        const klikNaSekci = async (s) => page.click((v.sirka < 760 ? '#lista' : '#rail') + ' [data-cil="' + s + '"]');
        await klikNaSekci('schranka');
        await page.waitForSelector('#sk-ukol');
        jistota(await pretika() <= 0, 'Schránka přetéká');
        await page.click('#p-schranka [data-filtr-schranky="nove"]');
        await page.waitForFunction(() => !document.querySelector('#sk-ukol') && document.querySelector('#sk-nove'));
        await page.click('#p-schranka [data-filtr-schranky="vse"]');

        await klikNaSekci('posta');
        await page.waitForSelector('#posta-seznam [data-vlakno="v2"]');
        // filtr podle stavu: Otázky → jen v1
        await page.click('#posta-filtry [data-filtr-posty="otazka"]');
        await page.waitForFunction(() => document.querySelectorAll('#posta-seznam [data-vlakno]').length === 1 && document.querySelector('#posta-seznam [data-vlakno="v1"]'));
        await page.click('#posta-filtry [data-filtr-posty="vse"]');
        await page.waitForSelector('#posta-seznam [data-vlakno="v2"]');
        jistota(await pretika() <= 0, 'Pošta přetéká');
        await page.click('#posta-seznam [data-vlakno="v2"]');
        if (v.sirka >= 1000) await page.waitForSelector('#posta-detail .zprava-obrazky');
        else await page.waitForSelector('[data-panel="vlakno"] .zprava-obrazky');
        // sledovací obrázek je zablokovaný, dokud se neklepne na Zobrazit
        const koren = v.sirka >= 1000 ? '#posta-detail' : '[data-panel="vlakno"]';
        const obrazekNacten = () => page.evaluate((k) => { const f = document.querySelector(k + ' iframe'); const i = f && f.contentDocument && f.contentDocument.images[0]; return !!i && i.complete && i.naturalWidth > 0; }, koren);
        await page.waitForTimeout(300);
        jistota(!(await obrazekNacten()), 'obrázek z webu se načetl bez souhlasu');
        jistota(await page.isVisible(koren + ' [data-oznacit="archivovat"]') && await page.isVisible(koren + ' [data-pripomenout]'), 'chybí Hotovo nebo Připomenout');
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_posta.png') });
        // odpověď: Od podle účtu vlákna, varování u pracovní adresy bez „Odesílat jako“
        await page.click(koren + ' [data-psat="odpoved"]');
        await page.waitForSelector('[data-panel="psani"] [data-psani-text]');
        jistota(await page.isVisible('[data-panel="psani"] .pruh-varovani'), 'chybí varování o odesílání z pracovní adresy');
        await page.fill('[data-panel="psani"] [data-psani-text]', 'Díky, beru na vědomí.');
        await page.click('[data-panel="psani"] [data-odeslat]');
        await page.waitForSelector('[data-panel="psani"]', { state: 'detached' });
        jistota(volano.some((d) => d.akce === 'odeslat' && d.rezim === 'odpoved' && d.id === 'm-v2' && d.text === 'Díky, beru na vědomí.'), 'odpověď nedorazila do motoru');
        // připomenout: v pondělí → úkol do schránky
        await page.click(koren + ' [data-pripomenout]');
        await page.waitForSelector('[data-panel="pripomenout"] [data-termin]');
        const pondeli = await page.getAttribute('[data-panel="pripomenout"] [data-termin]:nth-child(3)', 'data-termin');
        await page.click('[data-panel="pripomenout"] [data-termin]:nth-child(3)');
        await page.fill('[data-panel="pripomenout"] [data-pripominka-text]', 'Zavolat zpátky');
        await page.click('[data-panel="pripomenout"] [data-ulozit-pripominku]');
        await page.waitForSelector('[data-panel="pripomenout"]', { state: 'detached' });
        jistota(volano.some((d) => d.akce === 'pripomenout' && d.id === 'v2' && d.termin === pondeli && d.poznamka === 'Zavolat zpátky'), 'připomínka nedorazila do motoru');
        jistota(new Date(pondeli + 'T12:00').getDay() === 1, 'V pondělí není pondělí: ' + pondeli);
        // po odložení se detail e-mailu zavře sám (až po okně připomínky) – nic dalšího se zavřít nesmí
        if (v.sirka < 1000) await page.waitForSelector('[data-panel="vlakno"]', { state: 'detached' });
        jistota(!(await page.locator('.panel.otevreny').count()), 'po odložení zůstal otevřený panel');

        await klikNaSekci('kalendar');
        await page.click('[data-kal-pohled="mesic"]');
        await page.waitForSelector('.mesic-den.dnes');
        jistota(await pretika() <= 0, 'Kalendář (měsíc) přetéká');
        jistota(await vidim('.kal-boc') === v.sirka >= 1180, 'pravý panel kalendáře');
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_kalendar_mesic.png') });
        await page.click('[data-kal-pohled="tyden"]');
        await page.waitForSelector('.cas-mrizka');
        jistota(await page.locator('.cas-udalost').count() >= (v.sirka >= 760 ? 1 : 0), 'v týdnu chybí porada');
        jistota(await pretika() <= 0, 'Kalendář (týden) přetéká');
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_kalendar_tyden.png') });
        // formulář nové události (telefon: plus v hlavičce, jinak tlačítko nahoře) – vejde se a nepřetéká
        if (v.sirka < 760) { // telefon: „+“ v liště → list Přidat → Událost
          await page.evaluate(() => { window.__log = []; addEventListener('popstate', (e) => window.__log.push('popstate ' + JSON.stringify(e.state) + ' ' + (performance.now() | 0))); });
          await page.click('#lista [data-rychle]');
          await page.evaluate(() => window.__log.push('po kliknuti ' + (performance.now() | 0) + ' panel=' + !!document.querySelector('[data-panel="rychle"]')));
          try {
            await page.click('[data-panel="rychle"] [data-rychle-akce="udalost"]', { timeout: 8000 });
          } catch (e) {
            // ladění kolísavého pádu: co je na místě tlačítka a v jakém stavu je list
            const diag = await page.evaluate(() => {
              const b = document.querySelector('[data-panel="rychle"] [data-rychle-akce="udalost"]');
              const p = document.querySelector('[data-panel="rychle"]');
              const r = b && b.getBoundingClientRect();
              const naMiste = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
              return { panel: p && p.className, inert: p && p.inert, rect: r && [r.x, r.y, r.width, r.height].map(Math.round), vyska: innerHeight,
                naMiste: naMiste && (naMiste.outerHTML || '').slice(0, 160), okno: !!document.querySelector('.okno-pozadi'), historie: history.length,
                stav: history.state, log: window.__log, hist: (window.__hist || []).slice(-14), panely: Array.from(document.querySelectorAll('.panel')).map((x) => x.className + '|' + (x.dataset.panel || '')) };
            });
            await page.screenshot({ path: path.join(VYSTUP, 'chyba_rychle_' + jmeno + '.png') });
            throw new Error('Událost z listu Přidat nejde klepnout: ' + JSON.stringify(diag));
          }
        } else await page.click('#horni [data-nova-udalost]');
        await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="nazev"]');
        await page.click('[data-panel="udalost-formular"] [data-uf-typ="zapas"]');
        await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="souper"]');
        jistota(await page.evaluate(() => { const t = document.querySelector('[data-panel="udalost-formular"] .panel-telo'); return t.scrollWidth <= t.clientWidth + 1; }), 'formulář přetéká');
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_kalendar_zapas.png') });
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-panel="udalost-formular"]', { state: 'detached' });

        jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
        await ctx.close();
      });
    }
  }

  // ---------- kalendář: nový zápas (i s novým kalendářem Zápasy), úprava, smazání, iCloud jen čtení, rozpis, klepnutí do týdne
  await test('kalendář: zápas, úprava, smazání, rozpis dorostu, nová událost z týdne', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    page.on('dialog', (d) => d.accept());
    await page.goto(WEB);
    await page.click('#rail [data-cil="kalendar"]');
    await page.click('[data-kal-pohled="tyden"]');
    await page.waitForSelector('.cas-udalost[data-udalost^="u1|"]');
    const pred = volano.length;
    const nove = () => volano.slice(pred);

    // zápas venku: název, místo, sraz, 2 h, připomenutí den a 2 h předem, kalendář Zápasy se založí
    await page.click('#horni [data-nova-udalost]');
    await page.click('[data-panel="udalost-formular"] [data-uf-typ="zapas"]');
    await page.fill('[data-panel="udalost-formular"] [data-uf="souper"]', 'Kyjov');
    await page.click('[data-panel="udalost-formular"] [data-uf-doma="venku"]');
    const za3 = new Date(); za3.setHours(0, 0, 0, 0); za3.setDate(za3.getDate() + 3);
    const iso3 = za3.getFullYear() + '-' + String(za3.getMonth() + 1).padStart(2, '0') + '-' + String(za3.getDate()).padStart(2, '0');
    await page.fill('[data-panel="udalost-formular"] [data-uf="datum"]', iso3);
    await page.fill('[data-panel="udalost-formular"] [data-uf="od"]', '10:15');
    jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="do"]') === '12:15', 'konec se neposunul s výkopem');
    await page.fill('[data-panel="udalost-formular"] [data-uf="sraz"]', '09:00');
    await page.fill('[data-panel="udalost-formular"] [data-uf="hoste"]', 'Trener@Klub.test');
    await page.click('[data-panel="udalost-formular"] [data-uf-skupina="Dorost – rodiče"]');
    jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="hoste"]') === 'trener@klub.test, rodic1@x.test, rodic2@x.test', 'skupina hostů se nepřidala');
    jistota(/Kyjov – Vnorovy \(dorost\)/.test(await page.textContent('[data-uf-nahled]')), 'náhled názvu zápasu');
    await page.click('[data-panel="udalost-formular"] [data-ulozit-udalost]');
    await page.waitForSelector('[data-panel="udalost-formular"]', { state: 'detached' });
    const zalozeni = nove().find((d) => d.akce === 'kalendarZalozit');
    const zapas = nove().find((d) => d.akce === 'udalostUlozit');
    jistota(zalozeni && zalozeni.nazev === 'Zápasy', 'kalendář Zápasy se nezaložil');
    jistota(zapas && zapas.kalendarId === 'zapasy@group.test' && zapas.nazev === '⚽ Kyjov – Vnorovy (dorost)', 'zápas: ' + JSON.stringify(zapas));
    jistota(zapas.misto === 'Kyjov' && /Venku/.test(zapas.popis) && /Sraz: 09:00/.test(zapas.popis), 'místo nebo popis zápasu');
    const vykop = new Date(za3); vykop.setHours(10, 15);
    jistota(zapas.zacatek === vykop.getTime() && zapas.konec - zapas.zacatek === 2 * H, 'čas zápasu');
    jistota(JSON.stringify(zapas.pripomenuti) === '[1440,120]', 'připomenutí zápasu');
    jistota(JSON.stringify(zapas.hoste) === JSON.stringify(['trener@klub.test', 'rodic1@x.test', 'rodic2@x.test']) && zapas.pozvat === true, 'hosté: ' + JSON.stringify(zapas.hoste));
    // po uložení kalendář ukáže den zápasu
    jistota(await page.evaluate((t) => !!document.querySelector('.cas-den-nadpis.vybrany[data-den="' + t + '"]'), za3.getTime()), 'kalendář neukázal den zápasu');
    await page.click('[data-kal="dnes"]');

    // úprava opakované události z Google: Upravit → nový název, jen tento výskyt
    await page.click('.cas-udalost[data-udalost^="u1|"]');
    await page.waitForSelector('[data-panel="udalost"] [data-upravit-udalost]');
    jistota(await page.isVisible('[data-panel="udalost"] [data-smazat-udalost][data-cela="1"]'), 'u opakované chybí Smazat řadu');
    await page.click('[data-panel="udalost"] [data-upravit-udalost]');
    await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="nazev"]');
    jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="nazev"]') === 'Porada', 'úprava nemá předvyplněný název');
    await page.fill('[data-panel="udalost-formular"] [data-uf="nazev"]', 'Porada týmu');
    await page.click('[data-panel="udalost-formular"] [data-ulozit-udalost]');
    await page.waitForSelector('[data-panel="udalost-formular"]', { state: 'detached' });
    const uprava = nove().filter((d) => d.akce === 'udalostUlozit').pop();
    jistota(uprava.udalost === 'u1|' + den(0, 9) && uprava.nazev === 'Porada týmu' && uprava.kalendarId === 'g1', 'úprava: ' + JSON.stringify(uprava));

    // smazání jednorázové
    await page.click('.cas-udalost[data-udalost^="u3|"]');
    await page.click('[data-panel="udalost"] [data-smazat-udalost]');
    // potvrzení v okně ve stylu aplikace (ne systémové)
    await page.waitForSelector('.okno-pozadi.videt [data-okno="ano"]');
    jistota(/Smazat/.test(await page.textContent('.okno h2')), 'okno se ptá na smazání');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForSelector('[data-panel="udalost"]', { state: 'detached' });
    jistota(nove().some((d) => d.akce === 'udalostSmazat' && d.udalost === 'u3|' + den(0, 23) && !d.cela), 'smazání nedorazilo');

    // kalendář z iPhonu jen ke čtení
    await page.click('[data-kal-pohled="mesic"]');
    await page.click('.cip-udalost[data-udalost^="u2|"]');
    await page.waitForSelector('[data-panel="udalost"]');
    jistota(!(await page.isVisible('[data-panel="udalost"] [data-upravit-udalost]')) && /jen ke čtení/.test(await page.textContent('[data-panel="udalost"]')), 'iCloud nemá jít upravit');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-panel="udalost"]', { state: 'detached' });

    // zápasy klubu: místo rozpisu z webu dorostu týmy z fotbal.cz (pilulky v pravém panelu; rozpis zůstal pro starý motor)
    jistota(await page.locator('.kal-boc [data-fotbal-tym]').count() === 3 && !(await page.locator('.kal-boc [data-import-rozpisu]').count()), 'týmy klubu v panelu');

    // klepnutí do volné hodiny v týdnu → formulář s tou hodinou
    await page.click('[data-kal-pohled="tyden"]');
    await page.waitForSelector('.cas-sloupec');
    // osa se sama posouvá k aktuální hodině – pro test ji dát napevno tak, aby 15:00 bylo vidět
    await page.evaluate(() => { document.getElementById('cas-svitek').scrollIntoView(); document.getElementById('cas-svitek').scrollTop = 13 * 48; });
    const sloupec = page.locator('.cas-sloupec').nth(2);
    const box = await sloupec.boundingBox();
    const svitek = await page.evaluate(() => document.getElementById('cas-svitek').scrollTop);
    const hodina = 15;
    await page.mouse.click(box.x + box.width / 2, box.y + hodina * 48 + 10);
    await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="od"]');
    jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="od"]') === '15:00', 'klepnutí do 15 h dalo ' + await page.inputValue('[data-panel="udalost-formular"] [data-uf="od"]') + ' (svitek ' + svitek + ')');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_kalendar_nova_udalost.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- hledání (Ctrl K): načtená pošta hned, celá pošta přes motor, české filtry
  await test('hledání: Ctrl K, místní výsledky, celá pošta, české filtry, klávesy v Poště', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForFunction(() => document.querySelectorAll('#dl-pozornost .radek-posta').length === 1);
    await page.keyboard.press('Control+K');
    await page.waitForSelector('[data-panel="hledat"] [data-hledat-pole]');
    await page.keyboard.type('sraz');
    await page.waitForSelector('[data-panel="hledat"] [data-h-vlakno="v1"]');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_hledani.png') });
    // Enter otevře první výsledek – e-mail v Poště vedle seznamu
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-panel="hledat"]', { state: 'detached' });
    await page.waitForSelector('#posta-detail .vlakno-predmet');
    jistota((await page.textContent('#posta-detail .vlakno-predmet')).indexOf('Sraz') >= 0, 'neotevřel se nalezený e-mail');
    // celá pošta s českým filtrem
    await page.keyboard.press('Control+K');
    await page.waitForSelector('[data-panel="hledat"] [data-hledat-pole]');
    await page.fill('[data-panel="hledat"] [data-hledat-pole]', 'od:investor má:přílohu po:1.9.2026');
    await page.click('[data-panel="hledat"] [data-h-gmail]');
    await page.waitForSelector('[data-panel="hledat"] [data-h-vlakno="v9"]');
    const po = Math.floor(new Date(2026, 8, 1).getTime() / 1000); // pražská půlnoc v sekundách
    jistota(volano.some((d) => d.akce === 'hledat' && d.dotaz === 'from:investor has:attachment after:' + po), 'filtry se nepřeložily: ' +
      JSON.stringify(volano.filter((d) => d.akce === 'hledat').map((d) => d.dotaz)));
    await page.click('[data-panel="hledat"] [data-h-vlakno="v9"]');
    await page.waitForSelector('[data-panel="hledat"]', { state: 'detached' });
    await page.waitForFunction(() => /Protokol/.test((document.querySelector('#posta-detail .vlakno-predmet') || {}).textContent || ''));
    // klávesy: k nahoru, j dolů, e = Hotovo
    await page.click('#posta-seznam [data-vlakno="v1"]');
    await page.keyboard.press('j');
    await page.waitForFunction(() => document.querySelector('#posta-seznam li.aktivni [data-vlakno="v2"]'));
    await page.keyboard.press('e');
    jistota(volano.some((d) => d.akce === 'oznacit' && d.id === 'v2' && d.jak === 'archivovat'), 'e nearchivovalo');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- pošta: štítky z Gmailu, nejnovější zpráva nahoře, podpis v psaní, našeptávač adres
  await test('pošta: štítky Gmailu, nejnovější nahoře, podpis, našeptávač adres', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="posta"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"] .stitek-gmail');
    // výběr štítku: konverzace štítku i archivované
    await page.waitForSelector('[data-stitek-posty] option[value="Fotbal"]', { state: 'attached' });
    await page.selectOption('[data-stitek-posty]', 'Fotbal');
    await page.waitForSelector('#posta-seznam [data-vlakno="v8"]');
    jistota(!(await page.locator('#posta-seznam [data-vlakno="v2"]').count()), 've štítku nemá být pracovní v2');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_stitek.png') });
    await page.selectOption('[data-stitek-posty]', '');
    await page.waitForSelector('#posta-seznam [data-vlakno="v2"]');
    // vlákno: nejnovější zpráva nahoře a rozbalená, starší pod ní sbalená
    await page.click('#posta-seznam [data-vlakno="v1"]');
    await page.waitForSelector('#posta-detail .zprava');
    const poradi = await page.$$eval('#posta-detail .zprava', (z) => z.map((x) => (x.classList.contains('sbalena') ? 's:' : 'r:') + x.querySelector('.zprava-kdo b').textContent));
    jistota(JSON.stringify(poradi) === JSON.stringify(['r:Trenér', 's:Já']), 'pořadí zpráv: ' + JSON.stringify(poradi));
    // nový e-mail: podpis na konci, kurzor na začátku; našeptávač doplní jméno i adresu
    await page.keyboard.press('c');
    await page.waitForSelector('[data-panel="psani"] [data-psani-komu]');
    jistota(await page.inputValue('[data-panel="psani"] [data-psani-text]') === '\n\nMichal', 'podpis v psaní');
    await page.click('[data-panel="psani"] [data-psani-komu]');
    await page.keyboard.type('tre');
    await page.waitForSelector('#naseptavac [data-kontakt="0"]');
    jistota(/Trenér/.test(await page.textContent('#naseptavac')), 'našeptávač');
    await page.keyboard.press('Enter');
    jistota(await page.inputValue('[data-panel="psani"] [data-psani-komu]') === 'Trenér <trener@klub.test>, ', 'dosazená adresa: ' + await page.inputValue('[data-panel="psani"] [data-psani-komu]'));
    jistota(!(await page.locator('#naseptavac').count()), 'našeptávač se má zavřít');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_psani_podpis.png') });
    await page.keyboard.press('Escape');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- schránka: návrh e-mailu od Clauda (předvyplněné psaní), téma, smazání s Vrátit
  await test('schránka: návrh e-mailu z diktátu, téma, smazání', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="schranka"]');
    await page.waitForSelector('#p-schranka [data-polozka-id="c2"] .tag--limetka');
    await page.click('#p-schranka [data-prepni="c2"]');
    await page.waitForSelector('#p-schranka .navrh [data-navrh="c2"]');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_schranka_navrh.png') });
    // kontakty se načtou při prvním návrhu – počkat, ať se jméno přeloží na adresu
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
    await page.click('#p-schranka [data-navrh="c2"]');
    await page.waitForSelector('[data-panel="psani"] [data-psani-komu]');
    await page.waitForFunction(() => true);
    const komu = await page.inputValue('[data-panel="psani"] [data-psani-komu]');
    jistota(komu === 'Trenér <trener@klub.test>' || komu === 'Trenér', 'komu z návrhu: ' + komu);
    jistota(await page.inputValue('[data-panel="psani"] [data-psani-predmet]') === 'Trénink', 'předmět z návrhu');
    jistota(await page.inputValue('[data-panel="psani"] [data-psani-text]') === 'Ahoj, v úterý nepřijdu.\n\nMichal', 'text z návrhu s podpisem');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-panel="psani"]', { state: 'detached' });
    // téma: okno s volbami → Fotbal
    await page.click('#p-schranka [data-polozka-akce="tema"][data-id="c2"]');
    await page.waitForSelector('.okno-pozadi.videt [data-okno-volba="fotbal"]');
    await page.click('.okno-pozadi [data-okno-volba="fotbal"]');
    await page.waitForFunction(() => document.querySelector('#p-schranka [data-polozka-id="c2"] .stitek-gmail'));
    jistota(volano.some((d) => d.akce === 'polozka' && d.id === 'c2' && d.jak === 'tema' && d.text === 'fotbal'), 'téma nedorazilo do motoru');
    jistota(await page.locator('#p-schranka [data-tema-schranky="fotbal"]').count() === 1, 'filtr podle tématu');
    // smazat: potvrzení, zmizí ze seznamu, nabídne Vrátit
    await page.click('#p-schranka [data-polozka-akce="smazat"][data-id="c2"]');
    await page.waitForSelector('.okno-pozadi.videt [data-okno="ano"]');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForFunction(() => !document.querySelector('#p-schranka [data-polozka-id="c2"]') && /Vrátit/.test(document.getElementById('toast').textContent));
    jistota(volano.some((d) => d.akce === 'polozka' && d.id === 'c2' && d.jak === 'smazat'), 'smazání nedorazilo do motoru');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- rychlý zápis: poznámka „schůzka zítra v 10“ → Do kalendáře, „napiš X, že…“ → e-mail (bez Clauda)
  for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
    await test(v.nazev + ': rychlý zápis – poznámka jako událost a e-mail', async () => {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v);
      await page.goto(WEB);
      await page.click(v.sirka >= 760 ? '#rail [data-cil="schranka"]' : '.lista__btn[data-cil="schranka"]');
      const pole = '#p-schranka [data-zapis]';
      await page.waitForSelector(pole);
      await page.fill(pole, 'Schůzka s Trenérem zítra v 10 na 2 hodiny. Vzít dresy.');
      await page.waitForSelector('#p-schranka .zapis-navrh:not([hidden]) [data-zapis-navrh]');
      const navrh = await page.textContent('#p-schranka .zapis-navrh');
      jistota(/Schůzka s Trenérem/.test(navrh) && /10:00–12:00/.test(navrh), 'návrh pod polem: ' + navrh);
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'návrh přetéká');
      await page.waitForTimeout(250); // dojede animace lišty
      await page.screenshot({ path: path.join(VYSTUP, v.nazev + '_rychly_zapis.png') });
      await page.click('#p-schranka [data-zapis-navrh]');
      const f = '[data-panel="udalost-formular"] ';
      await page.waitForSelector(f + '[data-uf="nazev"]');
      jistota(await page.inputValue(f + '[data-uf="nazev"]') === 'Schůzka s Trenérem', 'název v formuláři');
      jistota(await page.inputValue(f + '[data-uf="od"]') === '10:00' && await page.inputValue(f + '[data-uf="do"]') === '12:00', 'čas ve formuláři');
      jistota(await page.inputValue(f + '[data-uf="popis"]') === 'Vzít dresy.', 'poznámka k události');
      const pred = volano.length;
      await page.click(f + '[data-ulozit-udalost]');
      await page.waitForSelector('[data-panel="udalost-formular"]', { state: 'detached' });
      const ulozena = volano.slice(pred).find((d) => d.akce === 'udalostUlozit');
      jistota(ulozena && ulozena.nazev === 'Schůzka s Trenérem' && ulozena.zacatek === den(1, 10) && ulozena.konec === den(1, 12), 'uložená událost: ' + JSON.stringify(ulozena));
      jistota(!volano.slice(pred).some((d) => d.akce === 'poznamka'), 'poznámka nemá jít do schránky');
      await page.waitForFunction(() => { const p = document.querySelector('#p-schranka [data-zapis]'); return p && !p.value && document.querySelector('#p-schranka .zapis-navrh').hidden; });
      // e-mail: jméno ve 3. pádě se přeloží na kontakt, text za „že“ do těla nad podpis
      await page.fill(pole, 'Napiš Trenérovi, že v úterý nepřijdu');
      await page.waitForFunction(() => /Napsat e-mail/.test((document.querySelector('#p-schranka .zapis-navrh:not([hidden])') || {}).textContent || ''));
      await page.click('#p-schranka [data-zapis-navrh]');
      await page.waitForSelector('[data-panel="psani"] [data-psani-komu]');
      const komu = await page.inputValue('[data-panel="psani"] [data-psani-komu]');
      jistota(komu === 'Trenér <trener@klub.test>', 'komu z poznámky: ' + komu);
      jistota(await page.inputValue('[data-panel="psani"] [data-psani-text]') === 'V úterý nepřijdu.\n\nMichal', 'text e-mailu: ' + await page.inputValue('[data-panel="psani"] [data-psani-text]'));
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="psani"]', { state: 'detached' });
      // obyčejná poznámka nic nenabízí
      await page.fill(pole, 'Koupit nové kopačky a míče');
      jistota(await page.locator('#p-schranka .zapis-navrh[hidden]').count() === 1, 'obyčejná poznámka nemá nabízet událost');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    });
  }

  // ---------- diktát z iPhonu, který Claude ještě nezpracoval: „zítra v 10“ počítané od chvíle diktátu → Založit událost hned
  await test('schránka: rozpoznaný diktát → událost, k položce se připíše „Událost založena“', async () => {
    const puvodni = motor.schranka;
    motor.schranka = () => {
      const s = puvodni();
      s.nove.push({ id: 'n2', slozka: 'NOVE', kdy: ted - H, odkud: 'iPhone', typ: '', stav: '', shrnuti: '', termin: '', text: 'Schůzka s Trenérem zítra v 10. Vzít rozpis.', vlakno: [] });
      return s;
    };
    try {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
      await page.goto(WEB);
      await page.click('#rail [data-cil="schranka"]');
      await page.waitForFunction(() => /Rozpoznáno: událost/.test((document.querySelector('#p-schranka [data-polozka-id="n2"] .tag--limetka') || {}).textContent || ''));
      jistota(!(await page.locator('#p-schranka [data-polozka-id="n1"] .tag--limetka').count()), 'obyčejná poznámka nemá mít návrh');
      await page.click('#p-schranka [data-prepni="n2"]');
      await page.waitForSelector('#p-schranka [data-navrh-mistni="n2"]');
      jistota(/Rozpoznáno v diktátu/.test(await page.textContent('#p-schranka [data-polozka-id="n2"] .navrh')), 'popisek návrhu');
      await page.click('#p-schranka [data-navrh-mistni="n2"]');
      const f = '[data-panel="udalost-formular"] ';
      await page.waitForSelector(f + '[data-uf="nazev"]');
      jistota(await page.inputValue(f + '[data-uf="nazev"]') === 'Schůzka s Trenérem' && await page.inputValue(f + '[data-uf="od"]') === '10:00', 'formulář z diktátu');
      const pred = volano.length;
      await page.click(f + '[data-ulozit-udalost]');
      await page.waitForSelector('[data-panel="udalost-formular"]', { state: 'detached' });
      const zitra = new Date(ted - H); zitra.setHours(10, 0, 0, 0); zitra.setDate(zitra.getDate() + 1); // „zítra“ od diktátu
      const ulozena = volano.slice(pred).find((d) => d.akce === 'udalostUlozit');
      jistota(ulozena && ulozena.zacatek === zitra.getTime() && ulozena.popis === 'Vzít rozpis.', 'uložená událost: ' + JSON.stringify(ulozena));
      for (let i = 0; i < 20 && !volano.slice(pred).some((d) => d.akce === 'polozka'); i++) await page.waitForTimeout(100);
      const pozn = volano.slice(pred).find((d) => d.akce === 'polozka');
      jistota(pozn && pozn.id === 'n2' && pozn.jak === 'dopsat' && /^Událost založena: Schůzka s Trenérem/.test(pozn.text), 'poznámka k položce: ' + JSON.stringify(pozn));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      motor.schranka = puvodni;
    }
  });

  // ---------- zdraví: stránka, karta na Dnes, trénink spárovaný s událostí, klíč pro zkratku v Nastavení
  for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
    await test(v.nazev + ': Zdraví – připravenost, spánek, trénink u události, Nastavení', async () => {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v);
      await page.goto(WEB);
      if (v.sirka >= 760) await page.waitForFunction(() => /Připravenost/.test((document.getElementById('dnes-kpi') || {}).textContent || ''));
      else await page.waitForFunction(() => /72/.test((document.querySelector('.mini-kpi[data-cil="zdravi"]') || {}).textContent || ''));
      await page.click(v.sirka >= 760 ? '#rail [data-cil="zdravi"]' : '.hlava-ja [data-cil="zdravi"]');
      await page.waitForSelector('#p-zdravi .zdravi-hero');
      jistota(/72/.test(await page.textContent('#p-zdravi .zdravi-hero')), 'připravenost 72 %');
      jistota(await page.locator('#p-zdravi .graf14 rect').count() === 14, 'graf 14 dní');
      jistota(/Porada/.test(await page.textContent('#p-zdravi .trenink')), 'trénink spárovaný s událostí v kalendáři');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'Zdraví přetéká');
      await page.screenshot({ path: path.join(VYSTUP, v.nazev + '_zdravi.png'), fullPage: true });
      // klepnutí na trénink otevře událost a v ní čísla z WHOOP
      await page.click('#p-zdravi .trenink[data-udalost]');
      await page.waitForSelector('[data-panel="udalost"] .zdravi-k-udalosti');
      jistota(/zátěž 11,5/.test(await page.textContent('[data-panel="udalost"] .zdravi-k-udalosti')), 'WHOOP v detailu události');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="udalost"]', { state: 'detached' });
      if (v.sirka >= 760) {
        await page.click('#rail [data-otevri-nastaveni]');
        await page.click('[data-panel="nastaveni"] [data-nast-sekce="zdravi"]');
        await page.click('[data-panel="nastaveni"] [data-nast="zdravi-klic"]');
        await page.waitForSelector('[data-panel="nastaveni"] [data-klic-zdravi]');
        jistota(await page.inputValue('[data-panel="nastaveni"] [data-klic-zdravi]') === 'testovaci-klic-zdravi', 'klíč pro zkratku');
        await page.screenshot({ path: path.join(VYSTUP, 'pc_nastaveni_zdravi.png') });
      }
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    });
  }

  // ---------- fotbal na Dnes, tým do kalendáře, filtr druhů kalendářů
  await test('fotbal: výsledky a další zápasy týmů na Dnes, tým do kalendáře, filtr druhů v Kalendáři', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-fotbal:not([hidden]) .fotbal-tymy li');
    const text = await page.textContent('#dl-fotbal');
    jistota(/A-tým/.test(text) && /1:3 Lysovice/.test(text) && /Šardice/.test(text) && /8:0/.test(text), 'karta fotbalu: ' + text);
    jistota(await page.locator('#dl-fotbal .fotbal-vysledek--P').count() === 2 && await page.locator('#dl-fotbal .fotbal-vysledek--V').count() === 1, 'V/P podle pohledu klubu');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_dnes_fotbal.png') });
    await page.click('#rail [data-cil="kalendar"]');
    await page.waitForSelector('.kal-boc [data-fotbal-tym="A"]');
    await page.click('.kal-boc [data-fotbal-tym="A"]');
    await page.waitForFunction(() => /2 nových/.test(document.getElementById('toast').textContent));
    jistota(volano.some((d) => d.akce === 'fotbalKalendar' && JSON.stringify(d.tymy) === '["A"]'), 'tým do kalendáře');
    // filtr druhu: Rodina → jen narozeniny
    await page.click('[data-kal-pohled="seznam"]');
    await page.waitForSelector('#p-kalendar [data-udalost^="u1|"]');
    await page.click('#p-kalendar [data-kal-druh="rodina"]');
    await page.waitForFunction(() => !document.querySelector('#p-kalendar .kal-hlavni [data-udalost^="u1|"]') && document.querySelector('#p-kalendar .kal-hlavni [data-udalost^="u2|"]'));
    // Dnes filtr nemá (týden ukazuje vše)
    await page.click('#rail [data-cil="dnes"]');
    await page.waitForSelector('#dl-tyden [data-udalost^="u2|"]');
    jistota(await page.locator('#dl-tyden [data-udalost^="u4|"]').count() === 1, 'Dnes ukazuje i osobní');
    await page.click('#rail [data-cil="kalendar"]');
    await page.click('#p-kalendar [data-kal-druh=""]');
    await page.waitForSelector('#p-kalendar .kal-hlavni [data-udalost^="u3|"]');
    await page.click('[data-kal-pohled="tyden"]');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- stránka Fotbal: tabulka (náš řádek), výsledek s góly a kartami, střelci, přepnutí týmu; telefon z karty na Dnes
  for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
    await test(v.nazev + ': Fotbal – tabulka, detail zápasu s góly a kartami, střelci', async () => {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v);
      await page.goto(WEB);
      await page.waitForSelector('#dl-fotbal:not([hidden]) [data-cil="fotbal"]');
      await page.click(v.sirka >= 760 ? '#rail [data-cil="fotbal"]' : '#dl-fotbal [data-cil="fotbal"]');
      await page.waitForSelector('#p-fotbal .fotbal-tabulka tr.nas');
      jistota(/FK Agro Vnorovy|Vnorovy/.test(await page.textContent('#p-fotbal .fotbal-tabulka tr.nas')), 'náš řádek v tabulce');
      jistota(/2. místo/.test(await page.textContent('#p-fotbal .fotbal-souhrn')), 'souhrn místa: ' + await page.textContent('#p-fotbal .fotbal-souhrn'));
      jistota(/Svoboda T./.test(await page.textContent('#p-fotbal .zapasy-seznam')), 'střelec u výsledku');
      jistota(/Svoboda Tomáš/.test(await page.textContent('#p-fotbal .fotbal-statistiky')), 'střelci týmu');
      await page.click('#p-fotbal [data-fotbal-zapas="A-6"]');
      await page.waitForSelector('#p-fotbal .zapas-detail .zapas-udalosti');
      const det = await page.textContent('#p-fotbal .zapas-detail');
      jistota(/Horák Pavel/.test(det) && /Dvořák Martin/.test(det) && /Poločas 0:2/.test(det), 'detail zápasu: ' + det);
      await page.click('#p-fotbal [data-fotbal-tabulka="doma"]');
      await page.waitForFunction(() => /9:5/.test(document.querySelector('#p-fotbal .fotbal-tabulka').textContent));
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'Fotbal přetéká');
      await page.screenshot({ path: path.join(VYSTUP, v.nazev + '_fotbal.png'), fullPage: true });
      await page.click('#p-fotbal [data-fotbal-vyber="dorost"]');
      await page.waitForFunction(() => /Těšany/.test(document.querySelector('#p-fotbal').textContent));
      jistota(/Tabulka ještě není stažená/.test(await page.textContent('#p-fotbal')), 'dorost bez tabulky');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    });
  }

  // ---------- Doplňky dnes: z režimu motoru, zápasové jen v den zápasu, odškrtnutí vydrží obnovení stránky
  await test('Doplňky dnes na Dnes: dnešní položky, zápasové jen v den zápasu, odškrtnutí zůstane', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-doplnky:not([hidden]) [data-doplnek="kreatin"]');
    jistota(!(await page.locator('#dl-doplnky [data-doplnek="kofein"]').count()), 'kofein jen v den zápasu');
    jistota(await page.locator('#dl-doplnky [data-doplnek]').count() === 2, 'dvě položky na dnešek');
    await page.click('#dl-doplnky [data-doplnek="kreatin"]');
    await page.waitForSelector('#dl-doplnky [data-doplnek="kreatin"][aria-pressed="true"]');
    jistota(/zbývá 1/.test(await page.textContent('#dl-doplnky')), 'počet zbývajících');
    await page.reload();
    await page.waitForSelector('#dl-doplnky [data-doplnek="kreatin"][aria-pressed="true"]');
    await page.locator('#dl-doplnky').screenshot({ path: path.join(VYSTUP, 'pc_doplnky.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- docházka dorostu (Týmuj) u tréninku v kalendáři: v týdnu „18/21“, v detailu počty a jména bez omluvy
  await test('docházka dorostu u tréninku v kalendáři (týden i detail)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="kalendar"]');
    await page.click('[data-kal-pohled="tyden"]');
    // včerejší trénink může být v minulém týdnu (pondělí) – pak o týden zpět
    if (new Date().getDay() === 1) await page.click('[data-kal="predchozi"]');
    await page.waitForFunction(() => ((document.querySelector('.cas-udalost[data-udalost^="u5|"]') || {}).textContent || '').indexOf('18/21') >= 0);
    await page.click('.cas-udalost[data-udalost^="u5|"]');
    await page.waitForSelector('[data-panel="udalost"] .dochazka-detail');
    const t = await page.textContent('[data-panel="udalost"] .dochazka-detail');
    jistota(/přišlo 18 z 21/.test(t) && /neomluveno 1/.test(t) && /Bez omluvy: Hráč C/.test(t), 'detail docházky: ' + t);
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- návrh odpovědi od Clauda v konverzaci: štítek v seznamu, karta, Použít → psaní s textem a podpisem, Zahodit
  await test('pošta: návrh odpovědi od Clauda – použít a zahodit', async () => {
    navrhZahozen = false;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="posta"]');
    await page.waitForFunction(() => /Návrh odpovědi/.test((document.querySelector('#posta-seznam [data-vlakno="v1"]') || {}).textContent || ''));
    await page.click('#posta-seznam [data-vlakno="v1"]');
    await page.waitForSelector('#posta-detail .navrh-odpovedi');
    jistota(/budu tam v 8:15/.test(await page.textContent('#posta-detail .navrh-odpovedi')), 'text návrhu');
    await page.click('#posta-detail [data-navrh-odpovedi="pouzit"]');
    await page.waitForSelector('[data-panel="psani"] [data-psani-text]');
    jistota(await page.inputValue('[data-panel="psani"] [data-psani-text]') === 'Ahoj, budu tam v 8:15.\n\nMichal', 'psaní s návrhem a podpisem: ' + JSON.stringify(await page.inputValue('[data-panel="psani"] [data-psani-text]')));
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-panel="psani"]', { state: 'detached' });
    await page.click('#posta-detail [data-navrh-odpovedi="zahodit"]');
    await page.waitForSelector('#posta-detail .navrh-odpovedi', { state: 'detached' });
    jistota(volano.some((d) => d.akce === 'navrhZahodit' && d.id === 'v1'), 'zahození nedorazilo');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Co je nového: po návratu ukáže, co přibylo (tady nová pošta, která čeká), Ukázat vede do Pošty
  await test('okno Co je nového po návratu do aplikace', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await ctx.addInitScript(() => { if (!sessionStorage.getItem('test-videno')) { localStorage.setItem('asistent.videno', JSON.stringify(Date.now() - 3 * 3600e3)); sessionStorage.setItem('test-videno', '1'); } });
    await page.goto(WEB);
    await page.waitForSelector('.okno-pozadi.videt .okno__radky li');
    jistota(/Co je nového/.test(await page.textContent('.okno h2')), 'nadpis okna');
    jistota(/Nová pošta/.test(await page.textContent('.okno__radky')), 'v okně chybí nová pošta');
    await page.waitForTimeout(400); // dojet animaci okna
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_co_je_noveho.png') });
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  await prohlizec.close();
  server.close();
  console.log('\n' + ok + ' prošlo' + (chyb ? ', ' + chyb + ' SELHALO' : '') + ' · snímky: testy/vystup/');
  process.exitCode = chyb ? 1 : 0;
})();
