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
  info: () => ({ verze: 'test', akce: Object.keys(motor).concat(['polozkaUpravy', 'polozkaTermin']), ucet: 'tester@example.com', posta: { osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false, podpisy: { osobni: 'Michal', pracovni: '' } },
    kalendare: KALENDARE, skupinyHostu: [{ nazev: 'Dorost – rodiče', adresy: ['rodic1@x.test', 'rodic2@x.test'] }] }),
  schranka: () => ({ nove: [{ id: 'n1', slozka: 'NOVE', kdy: ted - H, odkud: 'iPhone', typ: '', stav: '', shrnuti: '', termin: '', text: 'Zkušební poznámka z iPhonu', vlakno: [] }],
    ceka: [{ id: 'c1', slozka: 'CEKA', kdy: ted - 5 * H, odkud: 'iPhone', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Zavolat kvůli lešení', termin: '', text: 'Připomeň mi zavolat.', vlakno: [] },
      { id: 'c2', slozka: 'CEKA', kdy: ted - 2 * H, odkud: 'iPhone', typ: 'email', stav: 'rozhodni', shrnuti: 'E-mail trenérovi', termin: '', tema: '', nadpis: '',
        navrh: { typ: 'email', komu: ['Trenér'], predmet: 'Trénink', text: 'Ahoj, v úterý nepřijdu.' }, text: 'Napiš trenérovi, že v úterý nepřijdu.', vlakno: [] }],
    hotovo: [], ted: Date.now() }),
  posta: () => Object.assign({ osobni: [vlaknoSouhrn.v1], pracovni: [vlaknoSouhrn.v2], pracovniAdresa: 'prace@firma.test', firemni: null, ted: Date.now() },
    JSON.parse(JSON.stringify(postaNavic))),
  // záložky jako v Gmailu: Promoakce (k1 nepřečtená, k2 přečtená), přesun do štítku, přečíst vše
  postaKategorie: (d) => ({ kategorie: d.kategorie, vlakna: d.kategorie === 'promo' ? JSON.parse(JSON.stringify(promoVlakna)) : [], ted }),
  postaPresunout: (d) => { postaPresuny.push({ id: d.id, stitek: d.stitek, pridat: d.pridat, archivovat: d.archivovat }); return { id: d.id, stitky: [d.stitek], archivovano: !!d.archivovat }; },
  postaPrectene: (d) => {
    postaPrecteno.push(d.kategorie);
    const ids = promoVlakna.filter((m) => m.neprectena).map((m) => m.id);
    promoVlakna.forEach((m) => { m.neprectena = false; });
    return { precteno: ids.length, ids };
  },
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
  polozka: (d) => (d.jak === 'nadpis' || d.jak === 'tema' || d.jak === 'termin' ? Object.assign(motor.schranka().ceka.find((x) => x.id === d.id), { [d.jak]: d.text }) : true),
  poznamka: (d) => ({ id: 'n' + Date.now(), slozka: 'NOVE', kdy: Date.now(), odkud: 'aplikace', typ: '', stav: '', shrnuti: '', termin: '', text: d.text, vlakno: [] }),
  zdravi: () => ({ vytvoreno: ted, dny: [
      { den: iso(den(-1, 12)), whoop: { pripravenost: { skore: 55, hrv: 70, klidovyTep: 52 }, zatez: { zatez: 12.1, kroky: 9000 } },
        apple: { kroky: 10234, energie: 640, cviceni: 45, vzdalenost: 7.8, vo2max: 41.2 } },
      { den: iso(ted), whoop: { pripravenost: { skore: 72, hrv: 84.3, klidovyTep: 49, spo2: 96.4 },
        spanek: { start: den(0, -1), konec: den(0, 6), celkem: 6.5 * H, hluboky: 1.4 * H, rem: 1.6 * H, lehky: 3.5 * H, bdeni: 0.3 * H, vykon: 91, potreba: 8 * H },
        zatez: { probiha: true, zatez: 6.2, kroky: 4000 } } }],
    treninky: [{ id: 'w1', den: iso(ted), start: den(0, 9), konec: den(0, 10), sport: 'soccer', zatez: 11.5, tepPrumer: 140, tepMax: 180, kcal: 700, zony: [1, 5, 20, 20, 10, 4] }],
    whoop: { nastaveno: true, propojeno: true, sync: { kdy: ted, chyba: '' } }, apple: { kdy: ted }, vaha: vahaZaznamy.slice(), doplnky: JSON.parse(JSON.stringify(doplnkyDny)),
    rezim: { kofeinDo: '14:00', treninkDny: [], zapasTymy: ['A'], polozky: [{ id: 'kreatin', nazev: 'Kreatin', davka: '5 g', kdy: 'rano' },
      { id: 'kofein', nazev: 'Kofein', davka: 'před výkopem', kdy: 'zapas', jen: 'zapas' }, { id: 'horcik', nazev: 'Hořčík', davka: 'večer', kdy: 'vecer' }] } }),
  zdraviKlic: () => ({ klic: 'testovaci-klic-zdravi' }),
  zmeny: () => ({ auto: 0 }),
  doplnky: (d) => {
    doplnkyVolani.push({ den: d.den, zmeny: d.zmeny });
    const z = (doplnkyDny[d.den] = doplnkyDny[d.den] || {});
    Object.keys(d.zmeny || {}).forEach((id) => { if (d.zmeny[id]) z[id] = true; else delete z[id]; });
    return { dny: JSON.parse(JSON.stringify(doplnkyDny)) };
  },
  upozorneni: () => Object.assign({}, upozorneniStav),
  upozorneniZapnout: () => { upozorneniStav = { zapnuto: true, tema: 'asistent-testovaci-tema' }; upozorneniOdeslano++; return Object.assign({ odeslano: true }, upozorneniStav); },
  upozorneniTest: () => { upozorneniOdeslano++; return { odeslano: upozorneniStav.zapnuto }; },
  upozorneniVypnout: () => { upozorneniStav = { zapnuto: false, tema: '' }; return Object.assign({}, upozorneniStav); },
  vaha: (d) => {
    if (d.smazat != null) vahaZaznamy = vahaZaznamy.filter((x) => x.kdy !== Number(d.smazat));
    else vahaZaznamy.push({ kdy: Date.now(), kg: Number(d.kg) });
    return { zaznamy: vahaZaznamy.slice() };
  },
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
  // reely: včerejší dorost (nezveřejněný, s popiskem a videem) a starší béčko (video se ještě nahrává, bez popisku)
  reely: () => ({ aktualizovano: new Date(ted - H).toISOString(), zverejneno: Object.assign({}, reelyZverejneno), plan: Object.assign({}, reelyPlan),
    popiskyPlanu: Object.assign({}, reelyPopisky),
    instagram: { nastaveno: true, ucet: 'klub_test' }, reely: [
    { id: 'reel_dorost_tesany', nazev: 'Vnorovy – Těšany 3:1', varianta: '', tymy: ['dorost'], tymNazev: 'Dorost', datum: iso(den(-1)), vyrobeno: iso(ted) + 'T07:48',
      delka: 48.2, velikost: 51.3, video: true, odkaz: 'https://drive.google.com/file/d/TEST/view', nahled: '',
      popisek: 'Hattrick! ⚽⚽⚽\n\nDorost doma porazil Těšany 3:1.\n\nDalší zápas v neděli venku.\n\n#fkagrovnorovy #dorost',
      zapasy: [{ datum: iso(den(-1)), tym: 'dorost', domaci: 'Vnorovy', hoste: 'Těšany', souper: 'Těšany', skore: '3:1', soutez: '5. liga starší dorost' }] },
    { id: 'reel_benfika_lipov', nazev: 'Vnorovy B – Lipov 4:5', varianta: '', tymy: ['B'], tymNazev: 'B-tým', datum: iso(den(-23)), vyrobeno: iso(den(-22)) + 'T20:00',
      delka: 42.6, velikost: 30, video: true, odkaz: '', nahled: '', popisek: '',
      zapasy: [{ datum: iso(den(-23)), tym: 'B', domaci: 'Vnorovy B', hoste: 'Lipov', souper: 'Lipov', skore: '4:5', soutez: '9. liga dospělí' }] }] }),
  reelStav: (d) => { if (d.zverejneno) reelyZverejneno[d.id] = iso(ted); else delete reelyZverejneno[d.id]; return { zverejneno: Object.assign({}, reelyZverejneno) }; },
  reelNaplanovat: (d) => {
    reelyNaplanovano.push(d);
    reelyPlan[d.id] = { kdy: d.kdy, stav: 'ceka', oznacit: String(d.oznacit || '').split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^@/, '').toLowerCase()), upraveno: true };
    reelyPopisky[d.id] = d.popisek;
    return { plan: Object.assign({}, reelyPlan), popisky: Object.assign({}, reelyPopisky) };
  },
  reelZrusitPlan: (d) => { delete reelyPlan[d.id]; delete reelyPopisky[d.id]; return { plan: Object.assign({}, reelyPlan), popisky: Object.assign({}, reelyPopisky) }; },
  // auto: tabulka s vymyšlenými čísly (spotřeba 125 l na 2 900 km = 4,3 l/100 km, palivo 4 400 Kč / 2 900 km = 1,52 Kč/km)
  auto: () => JSON.parse(JSON.stringify(autoData)),
  autoNastavit: () => JSON.parse(JSON.stringify(autoData)),
  autoZapsat: (d) => {
    autoZapisy.push(d);
    const [r, m, dd] = String(d.datum).split('-').map(Number);
    const z = { datum: new Date(r, m - 1, dd).getTime(), datumText: '', castka: d.castka, km: d.km === '' ? null : d.km, kdo: d.kdo, poznamka: d.poznamka || '' };
    if (d.druh === 'tankovani') autoData.tankovani.push(Object.assign(z, { list: 'tankovani', radek: autoData.tankovani.length + 2, polozka: 'Tankování',
      kategorie: 'Palivo', cenaLitr: d.cenaLitr, litry: Math.round(d.castka / d.cenaLitr * 100) / 100 }));
    else autoData.naklady.push(Object.assign(z, { list: 'naklady', radek: autoData.naklady.length + 2, polozka: d.polozka || '', kategorie: d.kategorie }));
    return JSON.parse(JSON.stringify(autoData));
  },
  autoSmazat: (d) => {
    autoSmazano.push(d);
    const seznam = autoData[d.list];
    if (seznam[seznam.length - 1].radek === d.radek) seznam.pop();
    return JSON.parse(JSON.stringify(autoData));
  },
  autoUctenka: (d) => {
    if (!/^data:image\/jpeg;base64,/.test(d.obrazek)) throw new Error('Fotka účtenky nepřišla (čekám JPEG).');
    autoUctenky.push({ zapsat: d.zapsat, otisk: d.otisk });
    const vysledek = { uctenka: 'uctenka-test-123', odkaz: '#', text: '', chybaTextu: '',
      navrh: { druh: 'tankovani', datum: iso(ted), castka: 1859.63, litry: 42.75, cenaLitr: 43.5, kategorie: null, obchod: 'Pumpa Test' } };
    if (!d.zapsat) return vysledek;
    // jako motor: jasná účtenka se rovnou zapíše (s odkazem na fotku)
    const z = { list: 'tankovani', radek: autoData.tankovani.length + 2, datum: den(0), datumText: '', polozka: 'Tankování', kategorie: 'Palivo',
      castka: 1859.63, km: null, kdo: 'M', poznamka: 'Pumpa Test', cenaLitr: 43.5, litry: 42.75, uctenka: 'uctenka-test-123' };
    autoData.tankovani.push(z);
    return Object.assign(vysledek, { zapsano: { list: 'tankovani', radek: z.radek }, data: JSON.parse(JSON.stringify(autoData)) });
  },
  autoUpravit: (d) => {
    autoUpravy.push(d);
    const z = autoData[d.list].find((x) => x.radek === d.radek);
    if (!z || z.castka !== d.puvodniCastka) throw new Error('Zápis v tabulce se mezitím změnil – obnov stránku.');
    const [r, m, dd] = String(d.datum).split('-').map(Number);
    Object.assign(z, { datum: new Date(r, m - 1, dd).getTime(), castka: d.castka, km: d.km === '' ? null : d.km, kdo: d.kdo, poznamka: d.poznamka || '' });
    if (d.druh === 'tankovani') { z.cenaLitr = d.cenaLitr; z.litry = Math.round(d.castka / d.cenaLitr * 100) / 100; }
    return JSON.parse(JSON.stringify(autoData));
  },
  autoUctenkaFoto: (d) => { autoFotky.push(d.id); return { obrazek: MALA_FOTKA, nazev: 'uctenka.jpg' }; },
  autoTermin: (d) => {
    autoTerminy.push(d);
    autoData.terminy = Object.assign({}, autoData.terminy, { [d.id]: d.datum });
    if (!d.datum) delete autoData.terminy[d.id];
    return JSON.parse(JSON.stringify(autoData));
  },
  // dávka čtení jako v motoru: každá položka zvlášť ok / chyba
  davka: (d) => (d.polozky || []).map((p) => { try { volano.push(p); return { ok: true, data: motor[p.akce](p) }; } catch (e) { return { ok: false, chyba: e.message }; } }),
  stitky: () => [{ nazev: 'Fotbal', neprectenych: 1 }, { nazev: 'Účty', neprectenych: 0 }],
  postaStitek: (d) => ({ nazev: d.nazev, vlakna: d.nazev === 'Fotbal' ? [vlaknoSouhrn.v1, { id: 'v8', ucet: 'osobni', stav: 'resi', od: 'Rozhodčí', predmet: 'Zápis o utkání', ukazka: 'Zápis v příloze.', kdy: ted - 200 * H, neprectena: false, pocet: 1, odkaz: '#', stitky: ['Fotbal'] }] : [], ted }),
  kontakty: () => [{ j: 'Trenér', a: 'trener@klub.test', n: 5 }, { j: 'Investor', a: 'info@stavba.test', n: 2 }],
  podpisyUlozit: (d) => ({ osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false, podpisy: d.podpisy }),
  pocasi: (d) => ({ vytvoreno: Date.now(), misto: d && d.poloha ? 'Strážnice' : 'Veselí nad Moravou', podlePolohy: !!(d && d.poloha), souhrn: 'Silné bouřky', zdroj: 'ČHMÚ',
    vystrahy: [{ typ: 'vystraha', uroven: 'zluta', nazev: 'Silné bouřky', od: den(1, 14), do: den(1, 22), celyKraj: true, text: 'Je třeba dbát na bezpečnost.', popis: '' }],
    reky: [{ typ: 'hladina', uroven: 'zelena', nazev: 'Morava – Strážnice', stav: 'bez povodně', kdy: ted - H, hladina: 82, trend: 'ustálená', spa: 0, spaPredpoved: 0, maxPredpoved: 82, kdyMax: ted, spa1: 530, text: 'Hladina 82 cm, ustálená.' }],
    predpovedi: [0, 1, 2, 3].map((i) => ({ nazev: 'Předpověď', od: den(i, 0), do: den(i + 1, 0), den: iso(den(i, 12)), oblast: 'Jihomoravský kraj', uvod: ['Jasno', 'Bouřky', 'Polojasno', 'Déšť'][i],
      tMax: [20 + i, 24 + i], tMin: i ? [8, 11] : null, srazky: '', vitr: '', jevy: [], ikona: ['slunce', 'bourka', 'polojasno', 'dest'][i], uroven: 'info', vydano: ted })) })
};
const volano = [];
let ztratitOdpovedi = 0;          // kolik dalších odpovědí motoru „ztratí Google“ (test opakování)
const odpovediRid = new Map();    // rid → odpověď (motor opakovaný zápis neprovede)
let navrhZahozen = false;
const autoZapisy = [], autoSmazano = [], autoUctenky = [], autoUpravy = [], autoFotky = [], autoTerminy = [];
let postaNavic = {};              // test záložek: aktualizace v Doručené, čísla záložek a přehled od Clauda
const doplnkyDny = {}, doplnkyVolani = []; // odškrtnuté doplňky (motor: ZDRAVI/DOPLNKY.json)
const postaPresuny = [], postaPrecteno = [];
const promoVlakna = [
  { id: 'k1', ucet: 'osobni', stav: 'info', od: 'Obchod Test', predmet: 'Dárek k svátku', ukazka: 'Kredit 200 Kč do neděle.', kdy: ted - 3 * H, neprectena: true, pocet: 1, odkaz: '#' },
  { id: 'k2', ucet: 'osobni', stav: 'info', od: 'CK Test', predmet: 'Lyže v Alpách', ukazka: 'Zájezdy od 9 990 Kč.', kdy: ted - 20 * H, neprectena: false, pocet: 1, odkaz: '#' }];
const MALA_FOTKA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const tank = (dni, castka, km, cena, litry) => ({ list: 'tankovani', datum: den(dni), datumText: '', polozka: 'Tankování', kategorie: 'Palivo', castka, km,
  kdo: 'M', poznamka: 'Pumpa Test', cenaLitr: cena, litry });
const autoData = {
  nastaveno: true, nazev: 'Testovací auto - Test', odkaz: 'https://docs.google.com/spreadsheets/d/TEST/edit',
  tankovani: [tank(-120, 1500, 10000, 30, 50), tank(-90, 1200, 10800, 30, 40), tank(-60, 1000, 11500, 40, 25), tank(-45, 800, null, 40, 20),
    tank(-30, 1400, 12900, 35, 40)].map((z, i) => Object.assign(z, { radek: i + 2 }, i === 2 ? { uctenka: 'uctenka-starsi-001' } : {})),
  naklady: [
    { list: 'naklady', radek: 2, datum: den(-130), datumText: '', polozka: '', kategorie: 'Koupě auta', castka: 300000, km: 9800, kdo: '', poznamka: 'Nákup auta' },
    { list: 'naklady', radek: 3, datum: den(-130), datumText: '', polozka: '', kategorie: 'Pojištění', castka: 8000, km: null, kdo: 'M', poznamka: 'Roční' },
    { list: 'naklady', radek: 4, datum: den(-40), datumText: '', polozka: 'Myčka', kategorie: 'Myčka', castka: 150, km: null, kdo: 'K', poznamka: '' }],
  kategorie: ['Servis', 'Servis - PNEU', 'STK', 'Pojištění', 'Parkování', 'Myčka', 'Nákup doplňků'],
  // připomínky jako z motoru (přezutí teď, zima hotová, pojištění brzy)
  pripominky: [{ id: 'pneu-zimni', klic: 'pneu-zimni-t', nazev: 'Přezout na zimní pneumatiky', text: 'Objednej pneuservis.', od: den(-2), do: den(30), stav: 'ted', hotovo: false },
    { id: 'zima', klic: 'zima-t', nazev: 'Připravit auto na zimu', text: 'Směs do ostřikovačů.', od: den(-10), do: den(30), stav: 'ted', hotovo: true },
    { id: 'pojisteni', klic: 'poj-t', nazev: 'Výročí pojištění', text: 'Zkontroluj platbu.', od: den(5), do: den(35), stav: 'brzy', hotovo: false }],
  // jako motor: řádky + indexy tučných (nadpisy); STK uvnitř tabulky není nadpis, i když je velkými písmeny
  pece: { radky: [['PÉČE O AUTO – Testovací auto', '', ''], ['', 'Úvodní věta.', ''], ['PLÁN ÚDRŽBY', 'Kdy', 'Poznámka'],
    ['Olej + filtr', 'každých 15 000 km', 'termín hlásí auto'], ['STK', 'po 4 letech, pak po 2', ''], ['PŘEHLED PODLE KM', 'Co udělat', ''],
    ['15 000 km', 'olej + filtr', ''], ['AUTOMAT DSG', '', ''], ['', 'Startuj s nohou na brzdě.', ''],
    ['MYTÍ – POSTUP (ideálně každé 2–3 týdny)', '', ''], ['1. Hmyz', 'Hned po příjezdu.', ''],
    ['JEDNOU ZA PŮL ROKU', 'Jaro a podzim: navoskovat, ošetřit plasty a těsnění dveří (dost dlouhý text).', '']], nadpisy: [0, 2, 5, 7, 9, 11] },
  platili: { Michal: 11000, Katka: 300150 },
  // stav z auta (MyŠkoda přes domácí PC) – čerstvý, tachometr dál než poslední zápis v tabulce
  myskoda: { aktualizovano: new Date(ted).toISOString(), auta: [{ nazev: 'Testovací', model: 'Testovací auto', km: 13600, kmKdy: new Date(ted - 6e5).toISOString(),
    palivo: 61, dojezd: 510, adblue: 2900, zamceno: 'YES', servis: { olejKm: 7700, olejDni: 280, prohlidkaKm: 27700, prohlidkaDni: 697 } }],
    tankovani: [{ od: new Date(den(-3, 3.5)).toISOString(), do: new Date(den(-2, 3.5)).toISOString(), den: iso(den(-3)), km: 13700, litry: 36.4 },
      { od: new Date(den(-31, 3.5)).toISOString(), do: new Date(den(-30, 3.5)).toISOString(), km: 12900, litry: 39 }] }
};
let reelyZverejneno = {};
const reelyPlan = {}, reelyPopisky = {}, reelyNaplanovano = [];
let vahaZaznamy = [];
let upozorneniStav = { zapnuto: false, tema: '' }, upozorneniOdeslano = 0;

// ---------------------------------------------------------------- napodobený Firebase (účet a kopie dat ze serveru)
// Knihovny z gstatic nahradí malé moduly níž (page.route); přihlášení, databáze a funkce běží tady v testu
// (exposeBinding __fb) – žádný skutečný projekt. Pravidla jako firebase/firestore.rules: jen vlastní dokumenty, data jen server.
const FB_UZIVATEL = { email: 'michal@test.cz', heslo: 'zelena louka u hriste 7', uid: 'uid-michal' };
const fbDocs = {};       // cesta → data dokumentu
const fbVolano = [];     // volané serverové funkce
let fbObnova = null;     // co udělá obnovHned (nastaví test)
function fbObsluha(op, a) {
  const smi = (cesta) => !!a.uid && cesta.indexOf('uzivatele/' + a.uid) === 0;
  if (op === 'prihlas') return a.email === FB_UZIVATEL.email && a.heslo === FB_UZIVATEL.heslo ? { uid: FB_UZIVATEL.uid } : { chyba: 'auth/invalid-credential' };
  if (op === 'cti') return smi(a.cesta) ? { data: fbDocs[a.cesta] || null } : { chyba: 'permission-denied' };
  if (op === 'zapis') {
    if (!smi(a.cesta) || a.cesta.indexOf('/data/') >= 0) return { chyba: 'permission-denied' };
    fbDocs[a.cesta] = a.merge ? Object.assign({}, fbDocs[a.cesta], a.data) : a.data;
    return {};
  }
  if (op === 'kolekce') {
    if (!smi(a.cesta)) return { chyba: 'permission-denied' };
    const pred = a.cesta + '/';
    return { docs: Object.keys(fbDocs).filter((c) => c.indexOf(pred) === 0 && c.slice(pred.length).indexOf('/') < 0)
      .map((c) => ({ id: c.slice(pred.length), data: fbDocs[c] })) };
  }
  if (op === 'funkce') {
    fbVolano.push(a.nazev);
    // server chvíli pracuje (motor) – kopie přijdou až potom
    return new Promise((hotovo) => setTimeout(() => { if (fbObnova) fbObnova(); hotovo({ data: { kdy: Date.now() } }); }, 500));
  }
  return { chyba: 'neznámá operace ' + op };
}
const FB_SDK = {
  'firebase-app.js': `export function initializeApp(konfigurace) { return { konfigurace }; }`,
  'firebase-auth.js': `
    const ulozeny = () => { try { return JSON.parse(localStorage.getItem('__fb.user') || 'null'); } catch (e) { return null; } };
    export const indexedDBLocalPersistence = 'idb', browserLocalPersistence = 'local';
    export function initializeAuth(app) { return { app, currentUser: ulozeny(), authStateReady() { return Promise.resolve(); } }; }
    export async function signInWithEmailAndPassword(auth, email, heslo) {
      const r = await window.__fb('prihlas', { email, heslo });
      if (r.chyba) throw Object.assign(new Error('Firebase: Error (' + r.chyba + ').'), { code: r.chyba });
      auth.currentUser = { uid: r.uid, email };
      localStorage.setItem('__fb.user', JSON.stringify(auth.currentUser));
      return { user: auth.currentUser };
    }
    export async function signOut(auth) { auth.currentUser = null; localStorage.removeItem('__fb.user'); }`,
  'firebase-firestore.js': `
    const uid = () => { try { return (JSON.parse(localStorage.getItem('__fb.user') || 'null') || {}).uid; } catch (e) { return null; } };
    const chyba = (r) => Object.assign(new Error(r.chyba), { code: r.chyba });
    export function getFirestore(app) { return { app }; }
    export function doc(db, ...c) { return { cesta: c.join('/') }; }
    export function collection(db, ...c) { return { cesta: c.join('/') }; }
    export async function getDoc(ref) {
      const r = await window.__fb('cti', { cesta: ref.cesta, uid: uid() });
      if (r.chyba) throw chyba(r);
      return { id: ref.cesta.split('/').pop(), exists: () => r.data != null, data: () => r.data };
    }
    export async function setDoc(ref, data, volby) {
      const r = await window.__fb('zapis', { cesta: ref.cesta, data, merge: !!(volby && volby.merge), uid: uid() });
      if (r.chyba) throw chyba(r);
    }
    export function onSnapshot(ref, dalsi, priChybe) {
      let znamo = null, konec = false;
      const kolo = async () => {
        if (konec) return;
        const r = await window.__fb('kolekce', { cesta: ref.cesta, uid: uid() });
        if (konec) return;
        if (r.chyba) { if (priChybe) priChybe(chyba(r)); return; }
        const nove = {}, zmeny = [];
        r.docs.forEach((d) => {
          const j = JSON.stringify(d.data);
          nove[d.id] = j;
          if (!znamo || znamo[d.id] !== j) zmeny.push({ type: znamo && znamo[d.id] ? 'modified' : 'added', doc: { id: d.id, data: () => JSON.parse(j) } });
        });
        if (znamo) Object.keys(znamo).forEach((id) => { if (!(id in nove)) zmeny.push({ type: 'removed', doc: { id, data: () => JSON.parse(znamo[id]) } }); });
        const prvni = !znamo;
        znamo = nove;
        if (prvni || zmeny.length) dalsi({ docChanges: () => zmeny });
        setTimeout(kolo, 150);
      };
      kolo();
      return () => { konec = true; };
    }`,
  'firebase-functions.js': `
    export function getFunctions(app, region) { return { app, region }; }
    export function httpsCallable(f, nazev) {
      return async (data) => {
        const r = await window.__fb('funkce', { nazev, data, region: f.region });
        if (r.chyba) throw Object.assign(new Error(r.chyba), { code: 'functions/' + r.chyba });
        return { data: r.data };
      };
    }`
};
// ucet.js s testovací konfigurací (skutečný projekt Firebase se v testu nikdy nevolá)
const UCET_TEST = () => fs.readFileSync(path.join(KOREN, 'js', 'ucet.js'), 'utf8')
  .replace(/const KONFIGURACE = \{[^\n]*\};/, "const KONFIGURACE = { apiKey: 'test-klic', authDomain: 'test.firebaseapp.com', projectId: 'asistent-test', appId: 'test' };");

async function pripravMotor(page) {
  // účet Firebase: testovací konfigurace a napodobené knihovny (bez účtu v zařízení se nestahují)
  await page.route('**/js/ucet.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: UCET_TEST() }));
  await page.route('https://www.gstatic.com/firebasejs/**', (route) => {
    const kod = FB_SDK[route.request().url().split('/').pop()];
    route.fulfill({ status: kod ? 200 : 404, contentType: 'text/javascript; charset=utf-8', headers: { 'Access-Control-Allow-Origin': '*' }, body: kod || '' });
  });
  await page.route(MOTOR, async (route) => {
    const data = JSON.parse(route.request().postData() || '{}');
    let telo;
    // jako motor: opakovaný požadavek se stejným rid se podruhé neprovede (vrátí výsledek prvního běhu)
    if (data.rid && odpovediRid.has(data.rid)) telo = odpovediRid.get(data.rid);
    else if (data.klic !== KLIC) telo = { ok: false, chyba: 'klic' };
    else if (!motor[data.akce]) telo = { ok: false, chyba: 'Neznámá akce.' };
    else { volano.push(data); telo = { ok: true, data: motor[data.akce](data) }; }
    if (data.rid && telo.ok) odpovediRid.set(data.rid, telo);
    // jako Google: motor akci provedl, ale odpověď se ztratila a prohlížeč skončil na úvodu motoru (doGet)
    if (ztratitOdpovedi > 0) {
      ztratitOdpovedi--;
      await route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Asistent – motor běží.' });
      return;
    }
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
  await ctx.exposeBinding('__fb', (zdroj, op, a) => fbObsluha(op, a));
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

  // ---------- ztracená odpověď motoru: znovu se stejným rid, zápis jen jednou
  await test('ztracená odpověď motoru (Google vrátí úvod motoru): aplikace to zkusí znovu, zápis jen jednou', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#p-dnes .card');
    const pred = volano.filter((d) => d.akce === 'poznamka').length;
    ztratitOdpovedi = 2;
    const v = await page.evaluate(() => import('/js/api.js').then((m) => m.volej('poznamka', { text: 'Zkouška ztracené odpovědi' })).then(() => 'ok', (e) => e.message));
    jistota(v === 'ok', 'po opakování projde: ' + v);
    jistota(volano.filter((d) => d.akce === 'poznamka').length === pred + 1, 'poznámka zapsaná jednou');
    ztratitOdpovedi = 0;
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- service worker: VERZE podle obsahu (jinak by se změna k nikomu nedostala); záchrana při prázdné obrazovce
  await test('sw.js: VERZE odpovídá obsahu souborů aplikace', async () => {
    const v = require('./sw_verze.js').zkontroluj();
    jistota(v.ok, 'sw.js VERZE ' + v.ma + ' nesedí, má být ' + v.mel + ' → node testy/sw_verze.js --zapsat');
  });
  await test('start.js: když se moduly nenačtou (smíchané verze), za 8 s nabídne Načíst znovu', async () => {
    const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    // app.js chce export, který starší soubor nemá → modul se nenačte, aplikace nenastartuje
    await page.route('**/js/app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "import { neexistuje } from './pomocne.js'; neexistuje();" }));
    await page.goto(WEB);
    await page.waitForSelector('.zachrana button', { timeout: 12000 });
    jistota(/nenačetla/.test(await page.textContent('.zachrana')), 'text záchrany');
    await ctx.close();
  });

  // ---------- připojení: úvodní obrazovka, špatný klíč, správný klíč
  await test('úvod: kontrola adresy, špatný klíč, pak připojení přes motor', async () => {
    const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const chybyStranky = [];
    page.on('pageerror', (e) => chybyStranky.push(e.message));
    await pripravMotor(page);
    await page.goto(WEB);
    await page.waitForSelector('#uvod:not([hidden]) [data-uvod-form] [data-ucet-email]'); // výchozí: přihlášení účtem
    await page.click('[data-uvod-jinak]');
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
        // Nastavení: okno uprostřed se záložkami (na telefonu přes menu z klepnutí na jméno nahoře)
        if (v.sirka < 760) {
          await page.click('.hlava-ja [data-menu]');
          await page.waitForSelector('[data-panel="menu"].otevreny [data-menu-cil="fotbal"]');
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(VYSTUP, jmeno + '_menu.png') });
          await page.click('[data-panel="menu"] [data-menu-nastaveni]');
        } else {
          await page.click('#rail [data-otevri-nastaveni]');
        }
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

  // ---------- pošta: záložky jako v Gmailu, přehled od Clauda, přesun do štítku, přečíst vše
  await test('pošta: záložky jako v Gmailu, přehled od Clauda, Přesunout do skupiny, Označit vše jako přečtené', async () => {
    postaNavic = { pocty: { promo: 1, socialni: 0, fora: 0 },
      osobni: [vlaknoSouhrn.v1, { id: 'v5', ucet: 'osobni', stav: 'info', aktualizace: true, od: 'Obchod Test', predmet: 'Zásilka čeká ve výdejním boxu', ukazka: 'Vyzvedněte do pátku.', kdy: ted - 3 * H, neprectena: true, pocet: 1, odkaz: '#' }],
      prehled: { vytvoreno: new Date(ted - H).toISOString(), prosel: 12, dulezite: [],
        zajimave: [{ id: 'k1', od: 'Obchod Test', predmet: 'Dárek k svátku', proc: 'Kredit 200 Kč – platí do neděle.', kategorie: 'promo' }],
        ostatni: [{ skupina: 'Cestovky', pocet: 1, text: 'Zájezdy, nic co by spěchalo.' }] } };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="posta"]');
    await page.waitForSelector('.posta-kategorie [data-kategorie-posty="primarni"][aria-selected="true"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
    jistota(!(await page.locator('#posta-seznam .seznam-posta [data-vlakno="v5"]').count()), 'aktualizace nemá být v Primární');
    const zalozky = (await page.textContent('.posta-kategorie')).replace(/\s+/g, ' ');
    jistota(/Primární\s*1/.test(zalozky) && /Aktualizace\s*1/.test(zalozky) && /Promoakce\s*1/.test(zalozky) && !/Fóra\s*\d/.test(zalozky), 'záložky: ' + zalozky);
    // přehled od Clauda v Primární: jen „Mohlo by tě zajímat“, zbytek až v záložkách
    let prehled = (await page.textContent('#posta-seznam .posta-prehled')).replace(/\s+/g, ' ');
    jistota(/Mohlo by tě zajímat/.test(prehled) && /Kredit 200 Kč/.test(prehled) && /prošel 12 e-mailů/.test(prehled) && !/Ostatní stručně/.test(prehled), 'přehled v Primární: ' + prehled);
    await page.click('.posta-kategorie [data-kategorie-posty="aktualizace"]');
    await page.waitForSelector('#posta-seznam .seznam-posta [data-vlakno="v5"]');
    jistota(!(await page.locator('#posta-seznam .seznam-posta [data-vlakno="v1"]').count()), 'v Aktualizacích jen aktualizace');
    // Promoakce: načtou se na klepnutí, přehled i se zbytkem; Označit vše jako přečtené
    await page.click('.posta-kategorie [data-kategorie-posty="promo"]');
    await page.waitForSelector('#posta-seznam .seznam-posta [data-vlakno="k2"]');
    jistota(volano.some((d) => d.akce === 'postaKategorie' && d.kategorie === 'promo'), 'postaKategorie');
    prehled = (await page.textContent('#posta-seznam .posta-prehled')).replace(/\s+/g, ' ');
    jistota(/Ostatní stručně/.test(prehled) && /Cestovky 1×/.test(prehled), 'zbytek v záložce: ' + prehled);
    await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_zalozky.png') });
    await page.click('#posta-seznam [data-kategorie-prectene]');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForFunction(() => /Označeno jako přečtené: 1/.test(document.getElementById('toast').textContent));
    jistota(postaPrecteno.join() === 'promo', 'přečíst vše: ' + postaPrecteno.join());
    jistota(!/Promoakce\s*\d/.test(await page.textContent('.posta-kategorie')), 'číslo u Promoakcí pryč');
    // položka přehledu jde skrýt (v zařízení)
    await page.click('#posta-seznam .posta-prehled [data-prehled-skryt="k1"]');
    await page.waitForFunction(() => !document.querySelector('#posta-seznam .posta-prehled [data-vlakno="k1"]'));
    // Přesunout do skupiny: k2 do štítku Fotbal = štítek a pryč z Doručené
    await page.click('#posta-seznam [data-vlakno="k2"]');
    await page.waitForSelector('#posta-detail [data-presunout]');
    await page.click('#posta-detail [data-presunout]');
    await page.waitForSelector('[data-panel="presunout"] [data-presun-stitek="Fotbal"]');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_presun.png') });
    await page.click('[data-panel="presunout"] [data-presun-stitek="Fotbal"]');
    await page.waitForFunction(() => /Přesunuto do Fotbal/.test(document.getElementById('toast').textContent));
    jistota(postaPresuny.length === 1 && postaPresuny[0].id === 'k2' && postaPresuny[0].stitek === 'Fotbal' && postaPresuny[0].pridat === true && postaPresuny[0].archivovat === true,
      'přesun: ' + JSON.stringify(postaPresuny));
    jistota(!(await page.locator('#posta-seznam .seznam-posta [data-vlakno="k2"]').count()), 'přesunutá pryč ze seznamu');
    // nová skupina: název → Vytvořit a přesunout (motor štítek založí), ve výběru štítků hned je
    await page.click('#posta-seznam .seznam-posta [data-vlakno="k1"]');
    await page.waitForSelector('#posta-detail [data-presunout]');
    await page.click('#posta-detail [data-presunout]');
    await page.waitForSelector('[data-panel="presunout"] [data-presun-novy]');
    await page.fill('[data-panel="presunout"] [data-presun-novy]', 'VÝVOJ');
    await page.click('[data-panel="presunout"] [data-presun-vytvorit]');
    await page.waitForFunction(() => /Přesunuto do VÝVOJ/.test(document.getElementById('toast').textContent));
    const novy = postaPresuny[postaPresuny.length - 1];
    jistota(novy.id === 'k1' && novy.stitek === 'VÝVOJ' && novy.archivovat === true, 'nová skupina: ' + JSON.stringify(novy));
    jistota(volano.some((d) => d.akce === 'postaPresunout' && d.novy === true), 'novy: true do motoru');
    await page.waitForSelector('[data-stitek-posty] option[value="VÝVOJ"]', { state: 'attached' });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    postaNavic = {};
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
    // odškrtnutí jde na Disk (motor doplnky) – stejné na telefonu i PC; týden pod seznamem
    for (let i = 0; i < 50 && !doplnkyVolani.length; i++) await page.waitForTimeout(100);
    jistota(JSON.stringify(doplnkyVolani) === JSON.stringify([{ den: iso(ted), zmeny: { kreatin: true } }]), 'doplňky do motoru: ' + JSON.stringify(doplnkyVolani));
    const tyden = (await page.textContent('#dl-doplnky .doplnky-tyden')).replace(/\s+/g, ' ');
    jistota(/Tento týden/.test(tyden) && /\d+ %/.test(tyden), 'týden: ' + tyden);
    // jiné zařízení (čisté úložiště) vidí odškrtnutí z motoru
    await page.evaluate(() => { Object.keys(localStorage).filter((k) => /^asistent\.doplnky/.test(k)).forEach((k) => localStorage.removeItem(k)); });
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

  // ---------- počasí podle polohy: zapnout v Nastavení → poloha (zaokrouhlená) do motoru, „Teď“ z Open-Meteo na Dnes
  await test('počasí podle polohy: přepínač, poloha do motoru, teď z Open-Meteo', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['geolocation']);
    await ctx.setGeolocation({ latitude: 48.93312, longitude: 17.29765 });
    let meteo = 0;
    await page.route('https://api.open-meteo.com/**', (route) => {
      meteo++;
      const hodiny = Array.from({ length: 12 }, (_, k) => { const d = new Date(Date.now() + k * 36e5); d.setMinutes(0, 0, 0); return d.toISOString().slice(0, 13) + ':00'; });
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({
        current: { temperature_2m: 12.4, weather_code: 61, precipitation: 0.3, wind_speed_10m: 2.1 },
        hourly: { time: hodiny, temperature_2m: hodiny.map(() => 12), weather_code: hodiny.map(() => 61), precipitation_probability: hodiny.map(() => 70), precipitation: hodiny.map(() => 0.4) } }) });
    });
    await page.goto(WEB);
    await page.click('#rail [data-otevri-nastaveni]');
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="pocasi"]');
    await page.click('[data-panel="nastaveni"] .prepinac-radek:has([data-nast-poloha])');
    await page.waitForFunction(() => /podle polohy/.test((document.querySelector('[data-panel="nastaveni"] [data-sekce="pocasi"]') || {}).textContent || ''));
    const dotaz = volano.filter((d) => d.akce === 'pocasi' && d.poloha).pop();
    jistota(dotaz && dotaz.poloha.lat === 48.93 && dotaz.poloha.lon === 17.3, 'poloha do motoru zaokrouhlená: ' + JSON.stringify(dotaz && dotaz.poloha));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => /Teď · Strážnice/.test((document.getElementById('dnes-kpi') || {}).textContent || ''));
    jistota(/12/.test(await page.textContent('#dnes-kpi .kpi')), 'teplota teď');
    jistota(meteo >= 1, 'Open-Meteo se nezavolalo');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- schránka: termín u tvého úkolu, Claudova odpověď s odkazem a formátem, upozornění na nezpracovanou schránku
  await test('schránka: termín úkolu, odpověď Clauda s odkazem, upozornění na nezpracovanou schránku', async () => {
    const puvodni = motor.schranka;
    motor.schranka = () => {
      const x = puvodni();
      x.zpracovano = ted - 10 * H;
      x.nove[0].kdy = ted - 5 * H; // čeká u Clauda 5 h, Claude naposledy před 10 h
      x.hotovo = [{ id: 'h1', slozka: 'HOTOVO', kdy: ted - 30 * H, odkud: 'iPhone', typ: 'dotaz', stav: '', shrnuti: 'Kde je návod', termin: '', text: 'Kde je návod k AutoCADu?',
        vlakno: [{ kdo: 'Claude', kdy: '2026-10-02 10:00', text: 'Návod je na **webu 2.0**:\n- https://example.com/navod\n- `D:\\CAD_MK`' }] }];
      return x;
    };
    try {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
      await page.goto(WEB);
      await page.click('#rail [data-cil="schranka"]');
      await page.waitForSelector('#p-schranka [data-polozka-id="c1"]');
      jistota(/déle než 3 hodiny/.test(await page.textContent('#p-schranka')), 'upozornění na nezpracovanou schránku');
      jistota(/Claude naposledy/.test(await page.textContent('#hlava')), 'čas zpracování v hlavičce');
      // termín u tvého úkolu
      await page.click('#p-schranka [data-prepni="c1"]');
      await page.click('#p-schranka [data-polozka-akce="odlozit"][data-id="c1"]');
      await page.waitForSelector('.okno-pozadi.videt [data-okno-volba]');
      await page.click('.okno-pozadi [data-okno-volba]:nth-of-type(2)'); // Zítra
      await page.waitForFunction(() => document.querySelector('#toast') && /Termín/.test(document.querySelector('#toast').textContent));
      const zitra = new Date(); zitra.setDate(zitra.getDate() + 1);
      const iso = zitra.getFullYear() + '-' + String(zitra.getMonth() + 1).padStart(2, '0') + '-' + String(zitra.getDate()).padStart(2, '0');
      jistota(volano.some((d) => d.akce === 'polozka' && d.id === 'c1' && d.jak === 'termin' && d.text === iso), 'termín do motoru: ' + JSON.stringify(volano.filter((d) => d.jak === 'termin')));
      // Claudova odpověď: odkaz klikací, tučně, odrážky
      await page.click('#p-schranka [data-prepni="h1"]');
      await page.waitForSelector('#p-schranka .b-claude a[href="https://example.com/navod"]');
      jistota(await page.locator('#p-schranka .b-claude b').count() === 1 && /• /.test(await page.textContent('#p-schranka .b-claude')), 'formát odpovědi');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      motor.schranka = puvodni;
    }
  });

  // ---------- Reely: limetková karta na Dnes, Kopírovat popisek (celý text i s prázdnými řádky), „Už je venku“, stránka s filtrem
  await test('Reely na PC: karta na Dnes, kopírování popisku, zveřejněno, stránka a filtr', async () => {
    reelyZverejneno = {};
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    await page.goto(WEB);
    await page.waitForSelector('#dl-reel:not([hidden]) .reel-krok');
    jistota(/Reel k vyvěšení/.test(await page.textContent('#dl-reel')) && /Těšany 3:1/.test(await page.textContent('#dl-reel')), 'karta reelu na Dnes');
    jistota(await page.locator('#dl-reel a.reel__nahled[href="https://drive.google.com/file/d/TEST/view"][target="_blank"]').count() === 1, 'náhled vede na video na Disku');
    jistota(/Reely/.test(await page.textContent('#rail')) && await page.locator('#rail [data-cil="reely"] .pocet').count() === 1, 'Reely v panelu s počtem');
    await page.locator('#dl-reel').screenshot({ path: path.join(VYSTUP, 'pc_dnes_reel.png') });
    await page.click('#dl-reel [data-reel-kopirovat]');
    await page.waitForFunction(() => /Popisek zkopírovaný/.test(document.getElementById('toast').textContent));
    const schranka = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // schránka Windows vrací CRLF
    jistota(schranka === 'Hattrick! ⚽⚽⚽\n\nDorost doma porazil Těšany 3:1.\n\nDalší zápas v neděli venku.\n\n#fkagrovnorovy #dorost', 've schránce: ' + JSON.stringify(schranka));
    await page.click('#toast .toast__akce');
    await page.waitForSelector('#dl-reel', { state: 'hidden' });
    jistota(volano.some((d) => d.akce === 'reelStav' && d.id === 'reel_dorost_tesany' && d.zverejneno === true), 'zveřejnění nedorazilo do motoru');
    // stránka Reely: oba reely, štítky, video se nahrává, filtr „Čeká na Instagram“
    await page.click('#rail [data-cil="reely"]');
    await page.waitForSelector('#p-reely .reel[data-reel="reel_benfika_lipov"]');
    jistota(/na Instagramu od/.test(await page.textContent('#p-reely [data-reel="reel_dorost_tesany"]')), 'štítek zveřejněno');
    jistota(/nahrává se na Disk/.test(await page.textContent('#p-reely [data-reel="reel_benfika_lipov"]')), 'video se nahrává');
    jistota(/Popisek zatím není/.test(await page.textContent('#p-reely [data-reel="reel_benfika_lipov"]')), 'bez popisku');
    jistota(/2 reely · 1 čeká na Instagram/.test(await page.textContent('#hlava')), 'podnadpis: ' + await page.textContent('#hlava'));
    await page.screenshot({ path: path.join(VYSTUP, 'pc_reely.png'), fullPage: true });
    await page.click('#p-reely [data-reely-filtr="ceka"]');
    await page.waitForSelector('#p-reely .reel[data-reel="reel_dorost_tesany"]', { state: 'detached' });
    jistota(await page.locator('#p-reely .reel').count() === 1, 'filtr nezveřejněných');
    // zpět mezi nezveřejněné
    await page.click('#p-reely [data-reely-filtr="vse"]');
    await page.click('#p-reely [data-reel-zverejneno="reel_dorost_tesany"]');
    await page.waitForFunction(() => /čeká na Instagram/.test(document.querySelector('#p-reely [data-reel="reel_dorost_tesany"]').textContent));
    jistota(volano.some((d) => d.akce === 'reelStav' && d.id === 'reel_dorost_tesany' && d.zverejneno === false), 'zrušení zveřejnění');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  await test('Reely na telefonu: karta na Dnes pod čísly, ze stránky Fotbal na Reely, nic nepřetéká', async () => {
    reelyZverejneno = {};
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.waitForSelector('#dnes-mobil .reel-krok');
    jistota(await page.locator('#dl-reel:not([hidden])').count() === 0, 'na telefonu jen jedna karta reelu');
    await page.locator('#dnes-mobil .reel-krok').screenshot({ path: path.join(VYSTUP, 'telefon_dnes_reel.png') });
    await page.click('#dl-fotbal [data-cil="fotbal"].sipka');
    await page.waitForSelector('#p-fotbal .reely-tl');
    await page.click('#p-fotbal .reely-tl');
    await page.waitForSelector('#p-reely .reel[data-reel="reel_dorost_tesany"] [data-reel-kopirovat]');
    jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'Reely přetékají');
    // popisek vždy celý: poslední řádek je vidět a text není oříznutý (na stránce i v kartě na Dnes)
    const celyPopisek = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.scrollHeight <= el.clientHeight + 1 && /#fkagrovnorovy #dorost/.test(el.innerText); }, sel);
    jistota(await celyPopisek('#p-reely [data-reel="reel_dorost_tesany"] .reel__popisek'), 'popisek na stránce není celý');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_reely.png'), fullPage: true });
    await page.click('.lista [data-cil="dnes"]');
    await page.waitForSelector('#dnes-mobil .reel-krok__popisek');
    jistota(await celyPopisek('#dnes-mobil .reel-krok__popisek'), 'popisek v kartě na Dnes není celý');
    await page.locator('#dnes-mobil .reel-krok').screenshot({ path: path.join(VYSTUP, 'telefon_dnes_reel.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Váha: zápis v kartě Zdraví (tlačítko i Enter) s časem zápisu, rozdíl, čára, nesmysl odmítnut, smazání; telefon přes „+“
  await test('Váha na PC: zápis v kartě Zdraví s časem, rozdíl, čára, smazání', async () => {
    vahaZaznamy = [{ kdy: Date.now() - 3 * 864e5, kg: 81.2 }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="zdravi"]');
    await page.waitForSelector('#zd-vaha [data-vaha-pole]');
    jistota(/81,2/.test(await page.textContent('#zd-vaha')), 'poslední váha');
    await page.fill('#zd-vaha [data-vaha-pole]', '80,4');
    await page.click('#zd-vaha [data-vaha-zapsat]');
    await page.waitForFunction(() => /80,4/.test(document.querySelector('#zd-vaha .vaha-ted').textContent));
    jistota(volano.some((d) => d.akce === 'vaha' && d.kg === 80.4), 'kg do motoru');
    const t = await page.textContent('#zd-vaha .vaha-ted');
    jistota(/zapsáno dnes \d{1,2}:\d{2}/.test(t) && /−0,8 kg/.test(t), 'čas zápisu a rozdíl: ' + t);
    jistota(await page.locator('#zd-vaha .graf-vahy').count() === 1 && await page.inputValue('#zd-vaha [data-vaha-pole]') === '', 'čára a prázdné pole');
    await page.fill('#zd-vaha [data-vaha-pole]', '80,1');
    await page.press('#zd-vaha [data-vaha-pole]', 'Enter');
    await page.waitForFunction(() => /80,1/.test(document.querySelector('#zd-vaha .vaha-ted').textContent));
    const pred = volano.filter((d) => d.akce === 'vaha').length;
    await page.fill('#zd-vaha [data-vaha-pole]', 'osm');
    await page.click('#zd-vaha [data-vaha-zapsat]');
    await page.waitForFunction(() => /Napiš váhu/.test(document.getElementById('toast').textContent));
    jistota(volano.filter((d) => d.akce === 'vaha').length === pred, 'nesmysl nešel do motoru');
    await page.fill('#zd-vaha [data-vaha-pole]', '');
    await page.locator('#zd-vaha').screenshot({ path: path.join(VYSTUP, 'pc_vaha.png') });
    await page.click('#zd-vaha .vaha-seznam li:first-child [data-vaha-smazat]');
    await page.waitForSelector('.okno-pozadi.videt [data-okno="ano"]');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForFunction(() => !/80,1 kg/.test(document.querySelector('#zd-vaha .vaha-seznam').textContent));
    jistota(volano.some((d) => d.akce === 'vaha' && d.smazat), 'smazání do motoru');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
    await test(v.nazev + ': Váha na Dnes – zápis z hlavní stránky s časem', async () => {
      vahaZaznamy = [{ kdy: Date.now() - 2 * 864e5, kg: 81.5 }];
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v);
      await page.goto(WEB);
      await page.waitForSelector('#dl-vaha:not([hidden]) [data-vaha-pole]');
      jistota(/81,5/.test(await page.textContent('#dl-vaha')), 'poslední váha na Dnes');
      await page.fill('#dl-vaha [data-vaha-pole]', '81,1');
      await page.press('#dl-vaha [data-vaha-pole]', 'Enter');
      await page.waitForFunction(() => /81,1/.test(document.querySelector('#dl-vaha .vaha-ted').textContent));
      const t = await page.textContent('#dl-vaha .vaha-ted');
      jistota(/zapsáno dnes \d{1,2}:\d{2}/.test(t) && /−0,4 kg/.test(t), 'čas a rozdíl na Dnes: ' + t);
      jistota(await page.inputValue('#dl-vaha [data-vaha-pole]') === '', 'pole po zápisu prázdné');
      await page.locator('#dl-vaha').screenshot({ path: path.join(VYSTUP, v.nazev + '_dnes_vaha.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    });
  }

  await test('Váha na telefonu: + → Váha → zápis s časem', async () => {
    vahaZaznamy = [];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.click('.lista [data-rychle]');
    await page.click('[data-rychle-akce="vaha"]');
    await page.waitForSelector('.okno-pozadi.videt .okno__pole input[inputmode="decimal"]');
    await page.fill('.okno-pozadi .okno__pole input', '79,9');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForFunction(() => /Zapsáno 79,9 kg · dnes \d/.test(document.getElementById('toast').textContent));
    jistota(volano.some((d) => d.akce === 'vaha' && d.kg === 79.9), 'kg z okna do motoru');
    await page.click('.hlava-akce [data-cil="zdravi"]');
    await page.waitForFunction(() => /79,9/.test((document.querySelector('#zd-vaha .vaha-ted') || {}).textContent || ''));
    await page.locator('#zd-vaha').screenshot({ path: path.join(VYSTUP, 'telefon_vaha.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- účet (Firebase): přihlášení v Nastavení uloží připojení do účtu, nové zařízení jen e-mail a heslo
  await test('účet: přihlášení v Nastavení uloží připojení do účtu, nový telefon se přihlásí e-mailem a heslem', async () => {
    Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-otevri-nastaveni]');
    const N = '[data-panel="nastaveni"] ';
    await page.waitForSelector(N + '[data-ucet-form]');
    await page.fill(N + '[data-ucet-email]', FB_UZIVATEL.email);
    await page.fill(N + '[data-ucet-heslo]', 'spatne heslo uplne');
    await page.click(N + '[data-ucet-prihlasit]');
    await page.waitForFunction((n) => /nesedí/.test((document.querySelector(n + '[data-ucet-chyba]') || {}).textContent || ''), N);
    await page.fill(N + '[data-ucet-heslo]', FB_UZIVATEL.heslo);
    await page.press(N + '[data-ucet-heslo]', 'Enter');
    await page.waitForSelector(N + '[data-nast="ucet-odhlasit"]');
    const ulozeno = fbDocs['uzivatele/' + FB_UZIVATEL.uid];
    jistota(ulozeno && ulozeno.pripojeni && ulozeno.pripojeni.url === MOTOR && ulozeno.pripojeni.klic === KLIC, 'připojení v účtu: ' + JSON.stringify(ulozeno));
    jistota(/Přihlášeno · michal@test\.cz/.test(await page.textContent(N + '[data-sekce="pripojeni"]')), 'stav účtu v Nastavení');
    await page.locator(N + '[data-sekce="pripojeni"]').screenshot({ path: path.join(VYSTUP, 'pc_ucet.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    // nový telefon: nic v něm není, přihlásí se účtem a připojení k motoru si vezme z účtu
    const ctx2 = await prohlizec.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx2.exposeBinding('__fb', (zdroj, op, a) => fbObsluha(op, a));
    const p2 = await ctx2.newPage();
    const chyby2 = [];
    p2.on('pageerror', (e) => chyby2.push(e.message));
    await pripravMotor(p2);
    await p2.goto(WEB);
    await p2.waitForSelector('#uvod:not([hidden]) [data-uvod-form]');
    await p2.screenshot({ path: path.join(VYSTUP, 'telefon_prihlaseni.png') });
    await p2.fill('[data-ucet-email]', FB_UZIVATEL.email);
    await p2.fill('[data-ucet-heslo]', FB_UZIVATEL.heslo);
    await p2.click('[data-uvod-prihlasit]');
    await p2.waitForSelector('#aplikace:not([hidden]) .hero');
    const v = await p2.evaluate(() => ({ p: JSON.parse(localStorage.getItem('asistent.pripojeni')), u: JSON.parse(localStorage.getItem('asistent.ucet')) }));
    jistota(v.p && v.p.url === MOTOR && v.p.klic === KLIC, 'připojení z účtu v zařízení');
    jistota(v.u && v.u.email === FB_UZIVATEL.email, 'účet zapnutý v zařízení');
    jistota(!chyby2.length, 'chyby stránky: ' + chyby2.join(' | '));
    await ctx2.close();
  });

  // ---------- účet: kopie dat ze serveru – hned bez motoru, živé změny, po změně a u staré kopie zase motor
  await test('účet: data z kopie ze serveru bez motoru, živá změna, po změně i u staré kopie motor (a obnova na serveru)', async () => {
    const u = 'uzivatele/' + FB_UZIVATEL.uid;
    const T = Date.now();
    const posta = (predmet) => JSON.stringify({ osobni: [Object.assign({}, vlaknoSouhrn.v1, { predmet })], pracovni: [vlaknoSouhrn.v2],
      pracovniAdresa: 'prace@firma.test', firemni: null, ted: T });
    const kopie = (predmet, kdy) => {
      fbDocs[u + '/data/posta'] = { json: posta(predmet), kdy, parametry: null };
      fbDocs[u + '/data/schranka'] = { json: JSON.stringify(motor.schranka()), kdy, parametry: null };
      fbDocs[u + '/data/_stav'] = { kdy, potvrzeno: { posta: kdy, schranka: kdy }, chyby: [] };
    };
    Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    fbDocs[u] = { pripojeni: { url: MOTOR, klic: KLIC }, upraveno: T };
    kopie('Z kopie serveru', T);
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.addInitScript((ja) => {
      if (!localStorage.getItem('asistent.ucet')) {
        localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
        localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
        localStorage.setItem('asistent.pohled', JSON.stringify('posta'));
      }
    }, FB_UZIVATEL);
    volano.length = 0;
    fbVolano.length = 0;
    await page.goto(WEB);
    await page.waitForSelector('#posta-seznam :text("Z kopie serveru")');
    await page.waitForTimeout(400);
    jistota(!volano.some((d) => d.akce === 'posta' || d.akce === 'schranka'), 'pošta a schránka šly na motor: ' + volano.map((d) => d.akce).join());
    jistota(!fbVolano.length, 'čerstvá kopie – server se o obnovu žádat nemá');
    // živě: server uložil novou kopii → aplikace ji ukáže sama
    kopie('Živě ze serveru', Date.now());
    await page.waitForSelector('#posta-seznam :text("Živě ze serveru")');
    jistota(!volano.some((d) => d.akce === 'posta'), 'živá změna bez motoru');
    // změna z aplikace (poznámka do schránky) → kopie z doby před ní neplatí, čtení jde na motor
    await page.evaluate(() => import('/js/api.js').then((m) => m.volej('poznamka', { text: 'test' })));
    volano.length = 0;
    await page.evaluate(() => import('/js/posta.js').then((m) => m.nactiPostu(false)));
    jistota(volano.some((d) => d.akce === 'posta'), 'po změně se pošta nečetla z motoru');
    await page.waitForSelector('#posta-seznam :text("Sraz v sobotu")');
    // stará kopie (40 min – server nejel) → motor a žádost o obnovu na serveru; nová kopie pak přijde živě
    const stare = Date.now() - 40 * 60e3;
    kopie('Stará kopie', stare);
    fbObnova = () => kopie('Po obnově na serveru', Date.now());
    await page.evaluate(() => localStorage.removeItem('asistent.kopie')); // zapomenout změnu z minulého kroku
    volano.length = 0;
    fbVolano.length = 0;
    await page.reload();
    await page.waitForSelector('#posta-seznam :text("Po obnově na serveru")', { timeout: 8000 });
    fbObnova = null;
    jistota(volano.some((d) => d.akce === 'posta'), 'stará kopie → pošta z motoru');
    jistota(fbVolano.indexOf('obnovHned') >= 0, 'server nebyl požádán o obnovu');
    jistota(!(await page.isVisible('#posta-seznam :text("Stará kopie")')), 'stará kopie se nesmí ukázat');
    // tlačítko Obnovit požádá server o nové kopie i tehdy, když jsou čerstvé (třeba hned po nasazení motoru)
    await page.waitForTimeout(300);
    fbVolano.length = 0;
    await page.evaluate(() => document.querySelector('[data-obnovit]').click()); // přes případné otevřené okno
    for (let i = 0; i < 20 && fbVolano.indexOf('obnovHned') < 0; i++) await page.waitForTimeout(150);
    jistota(fbVolano.indexOf('obnovHned') >= 0, 'Obnovit nepožádal server o nové kopie');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Reely: naplánovat na Instagram (motor reel v daný čas zveřejní sám), zrušit plán
  await test('Reely: naplánovat na Instagram s datem a časem, štítek „vyjde…“, zrušit plán', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="reely"]');
    await page.waitForSelector('[data-reel="reel_dorost_tesany"] [data-reel-naplanovat]');
    jistota(!(await page.isVisible('[data-reel="reel_benfika_lipov"] [data-reel-naplanovat]')), 'reel bez popisku se plánovat nedá');
    await page.click('[data-reel="reel_dorost_tesany"] [data-reel-naplanovat]');
    const O = '[data-panel="reel-plan"] ';
    await page.waitForSelector(O + '[data-rp="kdy"]');
    const vychozi = await page.inputValue(O + '[data-rp="kdy"]');
    jistota(/T18:00$/.test(vychozi), 'výchozí čas 18:00: ' + vychozi);
    jistota(await page.inputValue(O + '[data-rp="oznacit"]') === '@dorost_agro', 'u dorostu předvyplněné @dorost_agro');
    jistota((await page.inputValue(O + '[data-rp="popisek"]')).indexOf('Hattrick!') === 0, 'popisek z PC v okně');
    const zitra = new Date(den(1, 19.5));
    await page.fill(O + '[data-rp="kdy"]', iso(zitra.getTime()) + 'T19:30');
    await page.fill(O + '[data-rp="popisek"]', 'Upravený popisek ⚽\n\n#fkagrovnorovy');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_reel_naplanovat.png') });
    await page.click(O + '[data-rp-ulozit]');
    await page.waitForSelector('[data-reel="reel_dorost_tesany"] .tag--plan');
    const z = reelyNaplanovano[reelyNaplanovano.length - 1] || {};
    jistota(z.id === 'reel_dorost_tesany' && z.kdy === den(1, 19.5) && z.oznacit === '@dorost_agro' && /^Upravený popisek/.test(z.popisek), 'plán do motoru: ' + JSON.stringify(z));
    const karta = await page.textContent('[data-reel="reel_dorost_tesany"]');
    jistota(/vyjde .*19:30/.test(karta) && /označí @dorost_agro/.test(karta) && /Upravený popisek/.test(karta) && /upravený popisek pro Instagram/.test(karta), 'karta po naplánování: ' + karta.slice(0, 200));
    // naplánovaný reel už na Dnes nestraší jako „k vyvěšení“
    jistota(!(await page.evaluate(() => import('/js/reely.js').then((m) => m.kVyveseni().some((r) => r.id === 'reel_dorost_tesany')))), 'naplánovaný není k vyvěšení');
    await page.click('[data-reel="reel_dorost_tesany"] [data-reel-zrusit-plan]');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForSelector('[data-reel="reel_dorost_tesany"] [data-reel-naplanovat]');
    jistota(!reelyPlan.reel_dorost_tesany, 'plán zrušený');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Auto: přehled z tabulky, zápis tankování, účtenka z fotky, smazání překlepu
  await test('Auto na PC: přehled z tabulky (najeto, spotřeba, Kč/km), zápis tankování, účtenka z fotky, smazání překlepu', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="auto"]');
    await page.waitForSelector('.auto-hero');
    const hero = (await page.textContent('.auto-hero')).replace(/\s+/g, ' ');
    jistota(/3 800/.test(hero) && /4,3/.test(hero) && /1,52/.test(hero) && /Testovací auto/.test(hero), 'přehled: ' + hero);
    jistota(/z auta/.test(hero) && /nádrž 61 %/.test(hero) && /dojezd 510 km/.test(hero), 'údaje z auta: ' + hero);
    jistota(/Výměna oleje\s*za 7 700 km nebo za 280 dní/.test((await page.textContent('.auto-servis')).replace(/\s+/g, ' ')), 'servis podle auta');
    jistota(/Myčka/.test(await page.textContent('.auto-kategorie')) && /Katka/.test(await page.textContent('.auto-platili')), 'kategorie a kdo platil');
    jistota(await page.locator('.auto-cara circle').count() === 5, 'graf ceny nafty');
    // Co řešit nahoře: přezutí teď (do …), zima hotová, pojištění brzy
    const resit = (await page.textContent('.auto-resit')).replace(/\s+/g, ' ');
    jistota(/Přezout na zimní pneumatiky/.test(resit) && /do \d+\. \d+\./.test(resit) && /✓ hotovo/.test(resit) && /Výročí pojištění/.test(resit), 'co řešit: ' + resit);
    // Péče o auto z lišty: panel s oddíly (kdy přezouvat, servis podle auta, list z tabulky), přehled podle km jako osa
    await page.click('.auto-akce [data-auto-pece]');
    await page.waitForSelector('[data-panel="auto-pece"] .pece');
    const oddily = await page.$$eval('[data-panel="auto-pece"] .pece-oddil > summary > span:nth-child(2)', (s) => s.map((x) => x.textContent.trim()));
    jistota(JSON.stringify(oddily) === JSON.stringify(['Co řešit', 'Termíny', 'Kdy přezouvat', 'Servis podle auta', 'Plán údržby', 'Přehled podle km', 'Automat DSG',
      'Mytí – postup (ideálně každé 2–3 týdny)', 'Jednou za půl roku']), 'oddíly péče: ' + JSON.stringify(oddily));
    // Termíny: datum známky se uloží do motoru (soubor terminy.json), rok psaný po číslicích se neposílá
    await page.fill('[data-panel="auto-pece"] [data-auto-termin="znamka"]', '2027-04-12');
    await page.waitForFunction(() => /Termín uložený/.test(document.getElementById('toast').textContent));
    jistota(JSON.stringify(autoTerminy.map((x) => [x.id, x.datum])) === JSON.stringify([['znamka', '2027-04-12']]), 'termín do motoru: ' + JSON.stringify(autoTerminy));
    jistota(await page.inputValue('[data-panel="auto-pece"] [data-auto-termin="znamka"]') === '2027-04-12', 'termín po obnovení panelu');
    const osa = (await page.textContent('[data-panel="auto-pece"] .pece-osa')).replace(/\s+/g, ' ');
    jistota(/teď 13 600 km/.test(osa) && /15 000 km/.test(osa) && /za 1 400 km/.test(osa), 'osa km: ' + osa);
    jistota(/pod 7 °C/.test(await page.textContent('[data-panel="auto-pece"] .pece-kola')), 'kdy přezouvat');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_pece.png') });
    await page.click('[data-panel="auto-pece"] [data-zavrit-panel]');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-pece"]'));
    // výdaje po měsících: rok u prvního sloupce a u ledna, klepnutí = rozpis
    const popisky = await page.$$eval('.auto-sloupec small', (s) => s.map((x) => x.textContent));
    jistota(popisky.length <= 13 && /\d{4}$/.test(popisky[0]), 'měsíce s rokem: ' + JSON.stringify(popisky));
    await page.click('.auto-sloupec:last-child');
    await page.waitForFunction(() => /\d{4}: /.test(document.getElementById('toast').textContent));
    // auto hlásí tankování, které v tabulce chybí (to před měsícem v tabulce je)
    const hlaseni = (await page.textContent('.auto-hlaseni')).replace(/\s+/g, ' ');
    jistota(/asi 36,4 l/.test(hlaseni) && !/asi 39 l/.test(hlaseni), 'hlášení z auta: ' + hlaseni);
    await page.click('.auto-hlaseni [data-auto-z-auta]');
    await page.waitForSelector('[data-panel="auto-zapis"] [data-az="km"]');
    jistota(await page.inputValue('[data-panel="auto-zapis"] [data-az="km"]') === '13700' &&
      await page.inputValue('[data-panel="auto-zapis"] [data-az="datum"]') === iso(den(-3)), 'okno z hlášení: km a den podle jízd');
    jistota(/nejspíš/.test(hlaseni), 'hlášení ukazuje odhadnutý den');
    await page.click('[data-panel="auto-zapis"] [data-zavrit-panel]');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
    await page.screenshot({ path: path.join(VYSTUP, 'pc_auto.png'), fullPage: true });
    // značka změny ze serveru (zápis z jiného zařízení) → tabulka auta znovu; stará značka nic nenačte
    const nacteniAuta = () => volano.filter((d) => d.akce === 'auto').length;
    const predZnackou = nacteniAuta();
    await page.evaluate(() => import('/js/auto.js').then((m) => m.zkontrolujZmenu(1)));
    await page.waitForTimeout(300);
    jistota(nacteniAuta() === predZnackou, 'stará značka nemá nic načítat');
    await page.evaluate(() => import('/js/auto.js').then((m) => m.zkontrolujZmenu(Date.now() + 60000)));
    for (let i = 0; i < 30 && nacteniAuta() === predZnackou; i++) await page.waitForTimeout(100);
    jistota(nacteniAuta() === predZnackou + 1, 'novější značka → auto znovu (' + nacteniAuta() + ')');
    // tankování: litry se dopočítají, do tabulky jde číslo (ne text s mezerami a čárkou)
    autoZapisy.length = 0;
    await page.click('[data-auto-zapis="tankovani"]');
    jistota(await page.inputValue('[data-panel="auto-zapis"] [data-az="km"]') === '13600', 'stav km z auta v okně tankování');
    await page.fill('[data-panel="auto-zapis"] [data-az="castka"]', '1 520');
    await page.fill('[data-panel="auto-zapis"] [data-az="cenaLitr"]', '36,90');
    jistota(/41,2 l/.test(await page.textContent('[data-panel="auto-zapis"] [data-az-litry]')), 'litry: ' + await page.evaluate(() => Array.from(document.querySelectorAll('[data-az-litry]')).map((x) => (x.closest('[data-panel]') ? 'P:' : 'zavira:') + x.textContent).join(' | ')));
    await page.fill('[data-panel="auto-zapis"] [data-az="km"]', '13 500');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_tankovani.png') });
    await page.click('[data-panel="auto-zapis"] [data-auto-ulozit]');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
    const z = autoZapisy[0] || {};
    jistota(z.druh === 'tankovani' && z.castka === 1520 && z.cenaLitr === 36.9 && z.km === 13500 && z.kdo === 'M', 'zápis: ' + JSON.stringify(z));
    await page.waitForFunction(() => /13 500 km/.test(document.querySelector('.auto-zapisy').textContent.replace(/\s+/g, ' ')));
    // výdaj: kategorie z tabulky, platila Katka
    await page.click('[data-auto-zapis="naklad"]');
    await page.selectOption('[data-panel="auto-zapis"] [data-az="kategorie"]', 'Servis');
    await page.fill('[data-panel="auto-zapis"] [data-az="polozka"]', 'Výměna oleje');
    await page.fill('[data-panel="auto-zapis"] [data-az="castka"]', '3 450');
    await page.click('[data-panel="auto-zapis"] [data-az-kdo="K"]');
    await page.press('[data-panel="auto-zapis"] [data-az="castka"]', 'Enter');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
    const v = autoZapisy[1] || {};
    jistota(v.druh === 'naklad' && v.kategorie === 'Servis' && v.polozka === 'Výměna oleje' && v.castka === 3450 && v.kdo === 'K', 'výdaj: ' + JSON.stringify(v));
    // účtenka (i z Fotek): fotka → motor ji přečte a rovnou zapíše → v oznámení Upravit → okno s fotkou → změna do tabulky
    await page.setInputFiles('.auto-akce [data-auto-foto]', { name: 'uctenka.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'ikona-192.png')) });
    await page.waitForSelector('#toast.videt .toast__akce');
    const oznameni = (await page.textContent('#toast')).replace(/\s+/g, ' ');
    jistota(/Zapsáno z účtenky: tankování 1 860 Kč/.test(oznameni), 'oznámení: ' + oznameni);
    const u = autoUctenky[autoUctenky.length - 1] || {};
    jistota(u.zapsat === true && /^[0-9a-f]{24}$/.test(u.otisk || ''), 'účtenka do motoru se zápisem a otiskem: ' + JSON.stringify(u));
    jistota(autoZapisy.length === 2, 'z účtenky se nezapisuje přes okno');
    await page.click('#toast .toast__akce');
    // na PC fotka rovnou vedle formuláře (vlevo údaje, vpravo fotka)
    await page.waitForSelector('[data-panel="auto-zapis"].auto-s-fotkou .auto-zapis-foto img');
    const sloupce = await page.$eval('[data-panel="auto-zapis"] .auto-zapis-mrizka', (m) => getComputedStyle(m).gridTemplateColumns.split(' ').length);
    jistota(sloupce === 2, 'údaje a fotka vedle sebe: ' + sloupce);
    await page.click('[data-panel="auto-zapis"] .auto-zapis-foto__obr');
    jistota(await page.locator('[data-panel="auto-zapis"] .auto-zapis-foto.zvetseno').count() === 1, 'klepnutí fotku zvětší');
    jistota(/Upravit tankování/.test(await page.textContent('[data-panel="auto-zapis"] .panel-titul')), 'okno opravy');
    jistota(await page.inputValue('[data-panel="auto-zapis"] [data-az="castka"]') === '1859,63' && await page.inputValue('[data-panel="auto-zapis"] [data-az="cenaLitr"]') === '43,5', 'údaje z účtenky');
    jistota(await page.inputValue('[data-panel="auto-zapis"] [data-az="poznamka"]') === 'Pumpa Test', 'stanice z účtenky');
    await page.click('[data-panel="auto-zapis"] [data-az-foto-velka]');
    await page.waitForSelector('[data-panel="auto-foto"] .auto-foto-velka');
    await page.click('[data-panel="auto-foto"] [data-zavrit-panel]');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-foto"]'));
    await page.fill('[data-panel="auto-zapis"] [data-az="castka"]', '1 900');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_uctenka.png') });
    await page.click('[data-panel="auto-zapis"] [data-auto-ulozit]');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
    const up = autoUpravy[0] || {};
    jistota(up.list === 'tankovani' && up.puvodniCastka === 1859.63 && up.castka === 1900 && up.cenaLitr === 43.5 && up.uctenka === 'uctenka-test-123',
      'oprava do motoru: ' + JSON.stringify(up));
    await page.waitForFunction(() => /1 900 Kč/.test(document.querySelector('.auto-zapisy').textContent.replace(/\s+/g, ' ')));
    // starší zápis s fotkou: klepnutí v Zápisech → okno → Zobrazit fotku (z Disku přes motor)
    await page.click('.auto-zapisy [data-auto-upravit="tankovani:4"]');
    jistota(!(await page.$('[data-panel="auto-zapis"].auto-s-fotkou')), 'bez načtené fotky úzké okno');
    await page.click('[data-panel="auto-zapis"] [data-az-foto]');
    await page.waitForSelector('[data-panel="auto-zapis"].auto-s-fotkou .auto-zapis-foto img');
    jistota(autoFotky[0] === 'uctenka-starsi-001', 'fotka z Disku: ' + JSON.stringify(autoFotky));
    await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_oprava_s_fotkou.png') });
    // Skrýt fotku → zase úzké okno s náhledem
    await page.click('[data-panel="auto-zapis"] .auto-uctenka [data-az-foto-vedle]');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"].auto-s-fotkou') && document.querySelector('[data-panel="auto-zapis"] .auto-uctenka__foto img'));
    await page.click('[data-panel="auto-zapis"] [data-zavrit-panel]');
    await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
    // smazat poslední zápis (překlep)
    await page.click('[data-auto-smazat^="tankovani:"]');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForFunction(() => document.querySelectorAll('.auto-zapisy .auto-zapis--palivo').length === 6);
    jistota(autoSmazano.length === 1 && autoSmazano[0].list === 'tankovani' && autoSmazano[0].castka === 1900, 'smazání: ' + JSON.stringify(autoSmazano));
    // víc účtenek najednou (z Fotek): každá zvlášť do motoru, souhrn v oznámení
    const predUctenkami = autoUctenky.length;
    jistota(await page.getAttribute('.auto-akce [data-auto-foto]', 'multiple') !== null, 'výběr víc fotek');
    await page.setInputFiles('.auto-akce [data-auto-foto]', [
      { name: 'a.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'ikona-192.png')) },
      { name: 'b.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'apple-touch-icon.png')) }]);
    await page.waitForFunction(() => /Účtenky: zapsáno 2/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
    const dve = autoUctenky.slice(predUctenkami);
    jistota(dve.length === 2 && dve[0].otisk !== dve[1].otisk, 'dvě účtenky, každá s vlastním otiskem: ' + JSON.stringify(dve));
    await page.waitForFunction(() => document.querySelectorAll('.auto-zapisy .auto-zapis--palivo').length === 8);
    // Dnes → Vyžaduje pozornost: přezutí (teď), hotová zima ani pojištění „brzy“ ne
    await page.click('#rail [data-cil="dnes"]');
    await page.waitForSelector('.auto-dnes');
    const dnesAuto = await page.$$eval('.auto-dnes', (s) => s.map((x) => x.textContent.replace(/\s+/g, ' ')));
    jistota(dnesAuto.length === 1 && /Přezout na zimní/.test(dnesAuto[0]), 'auto na Dnes: ' + JSON.stringify(dnesAuto));
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  await test('Auto na telefonu: v menu, přehled bez přetékání, „+“ → Tankování, barvy oblastí na Dnes', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark');
    await page.goto(WEB);
    await page.waitForSelector('.mini-kpi[data-oblast="fotbal"]');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_dnes_barvy.png'), fullPage: true });
    await page.click('.hlava-ja [data-menu]');
    await page.click('[data-panel="menu"] [data-menu-cil="auto"]');
    await page.waitForSelector('.auto-hero');
    const prekryv = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    jistota(prekryv <= 0, 'stránka přetéká do strany o ' + prekryv + ' px');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_auto.png'), fullPage: true });
    await page.click('.lista__plus');
    await page.waitForSelector('[data-panel="rychle"] [data-rychle-akce="tankovani"]');
    jistota(await page.locator('[data-panel="rychle"] .rychle__foto input[data-auto-foto]').count() === 1, 'účtenka v „+“');
    jistota(await page.getAttribute('[data-panel="rychle"] .rychle__foto input[data-auto-foto]', 'capture') === null, 'účtenka i z Fotek (bez vynuceného fotoaparátu)');
    await page.click('[data-panel="rychle"] [data-rychle-akce="tankovani"]');
    await page.waitForSelector('[data-panel="auto-zapis"] [data-az="castka"]');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- telefon: menu zleva (klepnutí na jméno) vede i na Fotbal a Reely; klepnutí vedle menu zavře
  await test('telefon: menu zleva se všemi sekcemi (Fotbal, Reely), zavření klepnutím vedle', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.click('.hlava-ja [data-menu]');
    await page.waitForSelector('[data-panel="menu"].otevreny');
    const sekce = await page.$$eval('[data-panel="menu"] [data-menu-cil]', (b) => b.map((x) => x.dataset.menuCil).join());
    jistota(sekce === 'dnes,schranka,posta,kalendar,zdravi,fotbal,reely,auto', 'sekce v menu: ' + sekce);
    jistota(await page.locator('[data-panel="menu"] [data-menu-cil="dnes"][aria-current="page"]').count() === 1, 'aktivní sekce');
    await page.click('[data-panel="menu"] [data-menu-cil="fotbal"]');
    await page.waitForSelector('#p-fotbal:not([hidden]) .fotbal-stranka');
    await page.waitForSelector('[data-panel="menu"]', { state: 'detached' });
    await page.click('.hlava-ja [data-menu]');
    await page.waitForSelector('[data-panel="menu"].otevreny');
    await page.mouse.click(370, 400); // vedle menu (menu je široké nejvýš 86 % šířky)
    await page.waitForSelector('[data-panel="menu"]', { state: 'detached' });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Nastavení: rozbalený návod zůstane rozbalený, i když se okno překreslí (dorazí data)
  await test('Nastavení: rozbalený návod se po překreslení nezavře', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-otevri-nastaveni]');
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="zdravi"]');
    await page.click('[data-panel="nastaveni"] details[data-detail="zkratka-zdravi"] summary');
    jistota(await page.locator('details[data-detail="zkratka-zdravi"][open]').count() === 1, 'návod rozbalený');
    // překreslení okna (jako když dorazí data z motoru): přepnout záložku tam a zpět
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="pocasi"]');
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="zdravi"]');
    jistota(await page.locator('details[data-detail="zkratka-zdravi"][open]').count() === 1, 'návod se po překreslení zavřel');
    jistota(/Teprve potom/.test(await page.textContent('details[data-detail="zkratka-zdravi"]')), 'návod: Zkratky se ve Zdraví objeví až po prvním spuštění');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Nastavení: upozornění do iPhonu bez editoru motoru
  await test('Nastavení: upozornění – zapnout, téma pro ntfy, zkušební, vypnout (bez editoru a spouštěčů)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-otevri-nastaveni]');
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="upozorneni"]');
    const S = '[data-panel="nastaveni"] [data-sekce="upozorneni"] ';
    await page.waitForSelector(S + '[data-nast="upozorneni-zapnout"]');
    jistota(!/kazdouHodinu|editoru/.test(await page.textContent(S)), 'návod bez editoru a spouštěčů');
    await page.click(S + '[data-nast="upozorneni-zapnout"]');
    await page.waitForSelector(S + '[data-ntfy-tema]');
    jistota(await page.inputValue(S + '[data-ntfy-tema]') === 'asistent-testovaci-tema', 'téma v okně');
    const pred = upozorneniOdeslano;
    await page.click(S + '[data-nast="upozorneni-test"]');
    await page.waitForFunction(() => /Zkušební upozornění odesláno/.test(document.body.textContent));
    jistota(upozorneniOdeslano === pred + 1, 'zkušební do motoru');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_nastaveni_upozorneni.png') });
    await page.click(S + '[data-nast="upozorneni-vypnout"]');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForSelector(S + '[data-nast="upozorneni-zapnout"]');
    jistota(!upozorneniStav.zapnuto, 'vypnuto v motoru');
    // zkratka Zdraví: návod na upozornění už v záložce Zdraví není
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="zdravi"]');
    jistota(!/nastavUpozorneni/.test(await page.textContent('[data-panel="nastaveni"]')), 'starý návod pryč');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- start: rychlá čtení v jedné dávce (méně souběžných dotazů na motor)
  await test('start: rychlá čtení jdou v jedné dávce', async () => {
    const pozadavky = [];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    page.on('request', (r) => { if (r.url() === MOTOR) { try { pozadavky.push(JSON.parse(r.postData()).akce); } catch (e) { /* nic */ } } });
    await page.goto(WEB); // první start: info ještě není uložené → bez dávky
    await page.waitForSelector('#dl-pozornost .seznam');
    pozadavky.length = 0;
    await page.reload();
    await page.waitForSelector('#dl-pozornost .seznam');
    await page.waitForTimeout(1500);
    jistota(pozadavky.indexOf('davka') >= 0, 'dávka se neposlala: ' + pozadavky.join());
    jistota(['info', 'pocasi', 'zdravi', 'fotbal'].every((a) => pozadavky.indexOf(a) < 0), 'rychlá čtení samostatně: ' + pozadavky.join());
    jistota(pozadavky.length <= 6, 'při startu moc požadavků: ' + pozadavky.join());
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
