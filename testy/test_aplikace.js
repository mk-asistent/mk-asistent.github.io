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
  v1: { id: 'v1', ucet: 'osobni', stav: 'otazka', od: 'Trenér', predmet: 'Sraz v sobotu', ukazka: 'Ahoj, sraz v 8:30. Stihneš to?', kdy: ted - H, neprectena: true, pocet: 1, odkaz: '#' },
  v2: { id: 'v2', ucet: 'pracovni', stav: 'cekas', od: 'Investor', predmet: 'Protokol', ukazka: 'Posílám protokol.', kdy: ted - 2 * H, neprectena: false, pocet: 2, odkaz: '#' }
};
const KALENDARE = [{ id: 'g1', nazev: 'Osobní', barva: '#2f6bff', zdroj: 'google', skryty: false, zapis: true },
  { id: 'ics-1', nazev: 'Rodina', barva: '#e2860a', zdroj: 'icloud', skryty: false }];
const motor = {
  info: () => ({ verze: 'test', ucet: 'tester@example.com', posta: { osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false },
    kalendare: KALENDARE, skupinyHostu: [{ nazev: 'Dorost – rodiče', adresy: ['rodic1@x.test', 'rodic2@x.test'] }] }),
  schranka: () => ({ nove: [{ id: 'n1', slozka: 'NOVE', kdy: ted - H, odkud: 'iPhone', typ: '', stav: '', shrnuti: '', termin: '', text: 'Zkušební poznámka z iPhonu', vlakno: [] }],
    ceka: [{ id: 'c1', slozka: 'CEKA', kdy: ted - 5 * H, odkud: 'iPhone', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Zavolat kvůli lešení', termin: '', text: 'Připomeň mi zavolat.', vlakno: [] }],
    hotovo: [], ted }),
  posta: () => ({ osobni: [vlaknoSouhrn.v1], pracovni: [vlaknoSouhrn.v2], pracovniAdresa: 'prace@firma.test', firemni: null, ted }),
  vlakno: (d) => ({ id: d.id, predmet: d.id === 'v1' ? 'Sraz v sobotu' : 'Protokol', odkaz: '#', vDorucenych: true, skryto: 0, ucet: d.id === 'v1' ? 'osobni' : 'pracovni',
    zpravy: [{ id: 'm-' + d.id, od: 'Trenér', odAdresa: 'trener@klub.test', odeMe: false, komu: 'tester@example.com', kopie: '', kdy: ted - H, predmet: 'Sraz',
      text: 'Ahoj, sraz v 8:30.', html: d.id === 'v2' ? '<p>Protokol <img src="https://sledovani.example/pixel.gif" width="1" height="1"></p>' : '', prilohy: [] }] }),
  kalendar: (d) => ({ udalosti: [
    { id: 'u1|' + den(0, 9), nazev: 'Porada', zacatek: den(0, 9), konec: den(0, 10), celodenni: false, misto: 'kancelář', popis: '', kalendar: 'Osobní', kalendarId: 'g1', barva: '#2f6bff', zdroj: 'google', opakovana: true },
    { id: 'u3|' + den(0, 23), nazev: 'Pozdní hovor', zacatek: den(0, 23), konec: den(0, 23.5), celodenni: false, misto: '', popis: '', kalendar: 'Osobní', kalendarId: 'g1', barva: '#2f6bff', zdroj: 'google', opakovana: false },
    { id: 'u2|' + den(1), nazev: 'Narozeniny', zacatek: den(1), konec: den(2), celodenni: true, misto: '', popis: '', kalendar: 'Rodina', kalendarId: 'ics-1', barva: '#e2860a', zdroj: 'icloud' }
  ].filter((u) => u.zacatek < d.do && u.konec > d.od), chyby: [], od: d.od, do: d.do, ted }),
  kalendare: () => KALENDARE,
  kalendarZalozit: (d) => ({ id: 'zapasy@group.test', kalendare: KALENDARE.concat({ id: 'zapasy@group.test', nazev: d.nazev, barva: d.barva, zdroj: 'google', skryty: false, zapis: true }) }),
  udalostUlozit: (d) => ({ id: 'nova@google.com', kalendarId: d.kalendarId }),
  udalostSmazat: () => true,
  zapasyImport: () => ({ pridano: 3, upraveno: 0, beze_zmeny: 0, kalendar: 'Zápasy', kalendarId: 'zapasy@group.test' }),
  odeslat: () => true,
  oznacit: () => true,
  hledat: (d) => ({ dotaz: d.dotaz, vlakna: [Object.assign({}, vlaknoSouhrn.v2, { id: 'v9', predmet: 'Starý protokol', kdy: ted - 90 * 24 * H })] }),
  pripomenout: (d) => ({ id: 'c9', slozka: 'CEKA', kdy: Date.now(), odkud: 'aplikace (pošta)', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Odpovědět: Sraz v sobotu (Trenér)',
    termin: d.termin, text: 'Připomenutí e-mailu.', vlakno: [] }),
  poznamka: (d) => ({ id: 'n' + Date.now(), slozka: 'NOVE', kdy: Date.now(), odkud: 'aplikace', typ: '', stav: '', shrnuti: '', termin: '', text: d.text, vlakno: [] })
};
const volano = [];

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
  try { await fn(); ok++; console.log('  ✓ ' + nazev); }
  catch (e) { chyb++; console.log('  ✗ ' + nazev + '\n    ' + String(e.message || e).split('\n')[0]); }
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
    await page.waitForFunction(() => document.querySelectorAll('#dl-posta .radek-posta').length === 1);
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
        await page.waitForFunction(() => document.querySelectorAll('#dnes-obsah .seznam').length >= 2 && document.querySelector('.ukazatel svg'));
        const pretika = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        jistota(await pretika() <= 0, 'Dnes přetéká do strany');
        // navigace: telefon = spodní lišta, iPad = panel s ikonami, PC = panel s popisky; horní lišta s hledáním od iPadu
        // viditelné = má na stránce plochu (skrytý rodič se počítá)
        const vidim = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }, sel);
        jistota(await vidim('#lista') === v.sirka < 760, 'spodní lišta');
        jistota(await vidim('#rail') === v.sirka >= 760, 'postranní panel');
        jistota(await vidim('#horni') === v.sirka >= 760, 'horní lišta s hledáním');
        jistota(await vidim('.rail__btn > span:not(.pocet)') === v.sirka >= 1180, 'popisky v postranním panelu');
        jistota(await page.locator('.tyden-graf button').count() === 7, 'týden ve sloupcích');
        if (v.sirka < 760) {
          jistota(await vidim('.hero') && await vidim('.lista__plus') && !(await vidim('#dnes-kpi')), 'telefon: hlavní karta a + v liště');
          jistota(await page.locator('.pozornost .pozor').count() >= 2, 'telefon: Vyžaduje pozornost');
        }
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_dnes.png'), fullPage: v.nazev !== 'pc' });

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
        if (v.sirka < 1000) { await page.click('[data-panel="vlakno"] [data-zavrit-panel]'); await page.waitForSelector('[data-panel="vlakno"]', { state: 'detached' }); }

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
          await page.click('#lista [data-rychle]');
          await page.click('[data-panel="rychle"] [data-rychle-akce="udalost"]');
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
    await page.waitForSelector('[data-panel="udalost"]', { state: 'detached' });
    jistota(nove().some((d) => d.akce === 'udalostSmazat' && d.udalost === 'u3|' + den(0, 23) && !d.cela), 'smazání nedorazilo');

    // kalendář z iPhonu jen ke čtení
    await page.click('[data-kal-pohled="mesic"]');
    await page.click('.cip-udalost[data-udalost^="u2|"]');
    await page.waitForSelector('[data-panel="udalost"]');
    jistota(!(await page.isVisible('[data-panel="udalost"] [data-upravit-udalost]')) && /jen ke čtení/.test(await page.textContent('[data-panel="udalost"]')), 'iCloud nemá jít upravit');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-panel="udalost"]', { state: 'detached' });

    // rozpis dorostu z webu
    await page.click('.kal-boc [data-import-rozpisu="dorost"]');
    await page.waitForFunction(() => /3 nových/.test(document.getElementById('toast').textContent));
    const imp = nove().find((d) => d.akce === 'zapasyImport');
    jistota(imp && /rozpis-dorost\.js$/.test(imp.odkaz) && imp.domaci === 'Vnorovy' && imp.tym === 'dorost', 'import: ' + JSON.stringify(imp));

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
    await page.waitForFunction(() => document.querySelectorAll('#dl-posta .radek-posta').length === 1);
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

  await prohlizec.close();
  server.close();
  console.log('\n' + ok + ' prošlo' + (chyb ? ', ' + chyb + ' SELHALO' : '') + ' · snímky: testy/vystup/');
  process.exitCode = chyb ? 1 : 0;
})();
