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
// poslední zpráva vlákna je ta ze souhrnu (jako v motoru) – aplikace podle času pozná, jestli je přednačtený detail aktuální
const kdySouhrnu = (id) => {
  const m = [vlaknoSouhrn.v1, vlaknoSouhrn.v2].concat(promoVlakna, postaNavic.osobni || [], postaNavic.pracovni || []).find((x) => x && x.id === id);
  return m ? m.kdy : ted - H;
};
const KALENDARE = [{ id: 'g1', nazev: 'Osobní', barva: '#2f6bff', zdroj: 'google', skryty: false, zapis: true, druh: 'osobni' },
  { id: 'ics-1', nazev: 'Rodina', barva: '#e2860a', zdroj: 'icloud', skryty: false, druh: 'rodina' }];
const zapasFotbal = (tym, dni, h, domaci, hoste, vysledek) => ({ id: tym + dni, tym, zacatek: new Date(den(dni, h)).toISOString(), domaci, hoste,
  doma: /Vnorovy/.test(domaci), misto: '', vysledek, stav: vysledek ? 'odehrano' : 'naplanovano', url: '#' });
const motor = {
  info: () => ({ verze: 'test', akce: Object.keys(motor).concat(['polozkaUpravy', 'polozkaTermin']), ucet: 'tester@example.com', posta: { osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false, podpisy: { osobni: 'Michal', pracovni: '' } },
    kalendare: KALENDARE, skupinyHostu: [{ nazev: 'Dorost – rodiče', adresy: ['rodic1@x.test', 'rodic2@x.test'] }], jmeniny: jmeninyOblibeni.slice(),
    pocasi: { misto: pocasiDomov ? pocasiDomov.misto : 'Veselí nad Moravou', domov: !!pocasiDomov } }),
  pocasiDomov: (d) => {
    pocasiDomov = d.smazat ? null : { misto: d.nazev, lat: d.lat, lon: d.lon };
    return { misto: pocasiDomov ? pocasiDomov.misto : 'Veselí nad Moravou', domov: pocasiDomov ? { lat: d.lat, lon: d.lon } : null };
  },
  jmeninyUlozit: (d) => { jmeninyOblibeni = (d.oblibeni || []).map((o) => ({ jmeno: o.jmeno, kdo: o.kdo || '' })); return jmeninyOblibeni.slice(); },
  schranka: () => ({ nove: [{ id: 'n1', slozka: 'NOVE', kdy: ted - H, odkud: 'iPhone', typ: '', stav: '', shrnuti: '', termin: '', text: 'Zkušební poznámka z iPhonu', vlakno: [] }],
    ceka: [{ id: 'c1', slozka: 'CEKA', kdy: ted - 5 * H, odkud: 'iPhone', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Zavolat kvůli lešení', termin: '', text: 'Připomeň mi zavolat.', vlakno: [] },
      { id: 'c2', slozka: 'CEKA', kdy: ted - 2 * H, odkud: 'iPhone', typ: 'email', stav: 'rozhodni', shrnuti: 'E-mail trenérovi', termin: '', tema: '', nadpis: '',
        navrh: { typ: 'email', komu: ['Trenér'], predmet: 'Trénink', text: 'Ahoj, v úterý nepřijdu.' }, text: 'Napiš trenérovi, že v úterý nepřijdu.', vlakno: [] }]
      .filter((p) => !smazanoSchranka.has(p.id)),
    // moje poznámky „pro mě“ (MOJE) – aktivní, bez hotových a smazaných, nejnovější nahoře
    moje: mojePoznamkyTest.filter((p) => !smazanoSchranka.has(p.id) && !mojeHotoveTest.has(p.id)).sort((a, b) => b.kdy - a.kdy).map((p) => Object.assign({}, p)),
    hotovo: [], ted: Date.now() }),
  posta: () => Object.assign({ osobni: [vlaknoSouhrn.v1], pracovni: [vlaknoSouhrn.v2], pracovniAdresa: 'prace@firma.test', firemni: null, ted: Date.now() },
    JSON.parse(JSON.stringify(postaNavic))),
  // záložky jako v Gmailu: Promoakce (k1 nepřečtená, k2 přečtená), přesun do štítku, přečíst vše
  postaKategorie: (d) => ({ kategorie: d.kategorie, vlakna: d.kategorie === 'promo' ? JSON.parse(JSON.stringify(promoVlakna)) : [], ted }),
  postaPresunout: (d) => {
    postaPresuny.push({ id: d.id, stitek: d.stitek, pridat: d.pridat, archivovat: d.archivovat, odebrat: d.odebrat, doDorucenych: d.doDorucenych });
    return { id: d.id, stitky: d.pridat === false ? [] : [d.stitek], archivovano: !!d.archivovat };
  },
  // přednačtení detailů (motor 2026-10-09.4): stejný tvar jako vlakno, nic nepřečte
  postaDetaily: (d) => {
    const detaily = {};
    (d.ids || []).slice(0, 10).forEach((x) => { const id = x.id || x; detaily[id] = motor.vlakno({ id }); });
    return { detaily, chyby: {}, vynechano: [], ted: Date.now() };
  },
  postaPrectene: (d) => {
    postaPrecteno.push(d.kategorie);
    const ids = promoVlakna.filter((m) => m.neprectena).map((m) => m.id);
    promoVlakna.forEach((m) => { m.neprectena = false; });
    return { precteno: ids.length, ids };
  },
  vlakno: (d) => ({ id: d.id, predmet: d.id === 'v1' ? 'Sraz v sobotu' : 'Protokol', odkaz: '#', vDorucenych: true, skryto: 0, ucet: d.id === 'v1' ? 'osobni' : 'pracovni',
    navrhOdpovedi: d.id === 'v1' && !navrhZahozen ? { zpravaId: 'm-v1', text: 'Ahoj, budu tam v 8:15.', kdy: new Date(ted).toISOString(), poznamka: '' } : undefined,
    zpravy: (d.id === 'v1' ? [{ id: 'm-starsi', od: 'Já', odAdresa: 'tester@example.com', odeMe: true, komu: 'trener@klub.test', kopie: '', kdy: ted - 30 * H, predmet: 'Sraz',
      text: 'Kdy je sraz?', html: '', prilohy: [] }] : []).concat([{ id: 'm-' + d.id, od: 'Trenér', odAdresa: 'trener@klub.test', odeMe: false, komu: 'tester@example.com', kopie: '', kdy: kdySouhrnu(d.id), predmet: 'Sraz',
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
  // smazání do koše a Vrátit (poznámky pro Clauda i moje), moje poznámky: přidat, hotovo (a zpět), smazat
  schrankaSmazat: (d) => { smazanoSchranka.add(d.id); return true; },
  schrankaObnovit: (d) => { smazanoSchranka.delete(d.id); return true; },
  mojePridat: (d) => {
    const text = String(d.text || '').trim();
    if (!text) throw new Error('Prázdná poznámka.');
    const p = { id: 'moje-' + (mojePoznamkyTest.length + 1), text, kdy: Date.now(), odkud: 'aplikace' };
    mojePoznamkyTest.push(p);
    return Object.assign({}, p);
  },
  mojeHotovo: (d) => {
    const p = mojePoznamkyTest.find((x) => x.id === d.id);
    if (!p || (d.zpet ? !mojeHotoveTest.has(d.id) : mojeHotoveTest.has(d.id))) throw new Error('Poznámka není mezi mými poznámkami.');
    if (d.zpet) mojeHotoveTest.delete(d.id); else mojeHotoveTest.add(d.id);
    return Object.assign({}, p);
  },
  mojeSmazat: (d) => { if (!mojePoznamkyTest.some((x) => x.id === d.id)) throw new Error('Poznámka není mezi mými poznámkami.'); smazanoSchranka.add(d.id); return true; },
  zdravi: () => ({ vytvoreno: ted, dny: [
      { den: iso(den(-1, 12)), whoop: { pripravenost: { skore: 55, hrv: 70, klidovyTep: 52 }, zatez: { zatez: 12.1, kroky: 9000 } },
        apple: { kroky: 10234, energie: 640, cviceni: 45, vzdalenost: 7.8, vo2max: 41.2 } },
      { den: iso(ted), whoop: { pripravenost: { skore: 72, hrv: 84.3, klidovyTep: 49, spo2: 96.4 },
        spanek: { start: den(0, -1), konec: den(0, 6), celkem: 6.5 * H, hluboky: 1.4 * H, rem: 1.6 * H, lehky: 3.5 * H, bdeni: 0.3 * H, vykon: 91, potreba: 8 * H },
        zatez: { probiha: true, zatez: 6.2, kroky: 4000 } } }],
    treninky: [{ id: 'w1', den: iso(ted), start: den(0, 9), konec: den(0, 10), sport: 'soccer', zatez: 11.5, tepPrumer: 140, tepMax: 180, kcal: 700, zony: [1, 5, 20, 20, 10, 4] }],
    whoop: { nastaveno: true, propojeno: true, sync: { kdy: ted, chyba: '' } }, apple: { kdy: ted }, vaha: vahaZaznamy.slice(), doplnky: JSON.parse(JSON.stringify(doplnkyDny)),
    pitiJidlo: JSON.parse(JSON.stringify(pitiDny)), tydenni: tydenniMock ? JSON.parse(JSON.stringify(tydenniMock)) : null,
    rezim: { kofeinDo: '14:00', treninkDny: [], zapasTymy: ['A'], hlavni: rezimHlavni || undefined, cilVahy: { kg: 70, do: iso(den(150)), od: { kg: 74, den: iso(den(-10)) } }, polozky: [{ id: 'kreatin', nazev: 'Kreatin', davka: '5 g', kdy: 'rano' },
      { id: 'kofein', nazev: 'Kofein', davka: 'před výkopem', kdy: 'zapas', jen: 'zapas' }, { id: 'horcik', nazev: 'Hořčík', davka: 'večer', kdy: 'vecer' }] } }),
  zdraviKlic: () => ({ klic: 'testovaci-klic-zdravi' }),
  zmeny: () => ({ auto: 0, zdravi: 0 }),
  pitiJidlo: (d) => {
    pitiVolani.push({ den: d.den, jak: d.jak, ml: d.ml, co: d.co, bilkoviny: d.bilkoviny, id: d.id });
    const z = (pitiDny[d.den] = pitiDny[d.den] || { piti: [], jidlo: [] });
    if (d.jak === 'piti') z.piti.push({ id: 'p' + pitiVolani.length, kdy: Date.now(), ml: d.ml });
    if (d.jak === 'jidlo') z.jidlo.push({ id: 'j' + pitiVolani.length, kdy: Date.now(), co: d.co, bilkoviny: d.bilkoviny, kcal: d.kcal, odhad: d.odhad ? 'mistni' : undefined });
    if (d.jak === 'smazat') { z.piti = z.piti.filter((x) => x.id !== d.id); z.jidlo = z.jidlo.filter((x) => x.id !== d.id); }
    return { dny: JSON.parse(JSON.stringify(pitiDny)) };
  },
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
    else vahaZaznamy.push({ kdy: d.kdy || Date.now(), kg: Number(d.kg) });
    vahaZaznamy.sort((a, b) => a.kdy - b.kdy);
    return { zaznamy: vahaZaznamy.slice() };
  },
  fotbal: () => ({ vKalendari: [], kalendar: null, data: { verze: 1, aktualizovano: new Date(ted).toISOString(), klub: 'FK Agro Vnorovy',
    tymy: [{ klic: 'A', nazev: 'A-tým', barva: '#2e7a4d' }, { klic: 'B', nazev: 'B-tým', barva: '#0f7c8c' }, { klic: 'dorost', nazev: 'Dorost', barva: '#a8620c' }],
    zapasy: [zapasFotbal('A', -6, 16, 'FK Agro Vnorovy', 'TJ Lysovice', '1:3'), zapasFotbal('A', 2, 15, 'FK Šardice', 'FK Agro Vnorovy', ''),
      zapasFotbal('B', -5, 15, 'Vnorovy B', 'Nová Lhota', '8:0'), zapasFotbal('dorost', -5, 10, 'FC Kyjov 1919', 'FK Agro Vnorovy', '4:1'),
      zapasFotbal('dorost', 3, 12, 'FK Agro Vnorovy', 'TJ Sokol Těšany', '')].concat(fotbalPlakat ? JSON.parse(JSON.stringify(ZAPASY_PLAKAT)) : []),
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
    reelyPlan[d.id] = { kdy: d.kdy, stav: 'ceka', oznacit: String(d.oznacit || '').split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^@/, '').toLowerCase()), upraveno: true, pribeh: !!d.pribeh };
    reelyPopisky[d.id] = d.popisek;
    return { plan: Object.assign({}, reelyPlan), popisky: Object.assign({}, reelyPopisky) };
  },
  reelZrusitPlan: (d) => { delete reelyPlan[d.id]; delete reelyPopisky[d.id]; return { plan: Object.assign({}, reelyPlan), popisky: Object.assign({}, reelyPopisky) }; },
  // plakáty (motor 2026-10-09.3, CLAUDE_SCHRANKA/PLAKATY): ruční úpravy kol, nastavení, popisky, obrázky a plán na Instagram
  plakaty: () => JSON.parse(JSON.stringify(Object.assign({}, plakatyData, { ig: plakatyIg }))),
  plakatUlozit: (d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.tyden || ''))) throw new Error('Víkend má tvar RRRR-MM-DD (sobota).');
    if (d.smazat) delete plakatyData.kola[d.tyden];
    else plakatyData.kola[d.tyden] = { stav: JSON.parse(JSON.stringify(d.stav)), upraveno: Date.now() };
    return { kola: JSON.parse(JSON.stringify(plakatyData.kola)) };
  },
  plakatNastaveni: (d) => { plakatyData.nastaveni = JSON.parse(JSON.stringify(d.nastaveni || {})); return { nastaveni: JSON.parse(JSON.stringify(plakatyData.nastaveni)) }; },
  plakatPopisek: (d) => {
    plakatyData.popisky[d.tyden] = Object.assign({ text: '', zdroj: '' }, plakatyData.popisky[d.tyden], { styl: d.styl || '', pozadano: Date.now(), cekaNaClauda: true });
    return { popisky: JSON.parse(JSON.stringify(plakatyData.popisky)) };
  },
  plakatPopisekUlozit: (d) => {
    plakatyData.popisky[d.tyden] = Object.assign({}, plakatyData.popisky[d.tyden], { text: String(d.text || ''), zdroj: d.text ? 'rucne' : '', kdy: Date.now(), cekaNaClauda: false });
    return { popisky: JSON.parse(JSON.stringify(plakatyData.popisky)) };
  },
  plakatObrazky: (d) => {
    if (!/^data:image\/jpeg;base64,/.test(String(d.prispevek || ''))) throw new Error('Obrázek pro příspěvek chybí nebo není JPEG.');
    plakatyData.obrazky[d.tyden] = { prispevek: true, pribeh: !!d.pribeh, kdy: Date.now() };
    return { obrazky: JSON.parse(JSON.stringify(plakatyData.obrazky)) };
  },
  plakatNaplanovat: (d) => {
    if (!plakatyData.obrazky[d.tyden]) throw new Error('Chybí obrázek plakátu – vyrob ho v aplikaci znovu.');
    if (!(plakatyData.popisky[d.tyden] || {}).text) throw new Error('Plakát nemá popisek – bez něj ho na Instagram nepošlu.');
    plakatyData.plan[d.tyden] = { kdy: d.kdy, stav: 'ceka', pribeh: !!d.pribeh };
    return { plan: JSON.parse(JSON.stringify(plakatyData.plan)) };
  },
  plakatZrusitPlan: (d) => { delete plakatyData.plan[d.tyden]; return { plan: JSON.parse(JSON.stringify(plakatyData.plan)) }; },
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
  stitky: () => JSON.parse(JSON.stringify(stitkyMotoru)),
  postaStitek: (d) => ({ nazev: d.nazev, vlakna: d.nazev === 'Fotbal' ? [vlaknoSouhrn.v1, { id: 'v8', ucet: 'osobni', stav: 'resi', od: 'Rozhodčí', predmet: 'Zápis o utkání', ukazka: 'Zápis v příloze.', kdy: ted - 200 * H, neprectena: false, pocet: 1, odkaz: '#', stitky: ['Fotbal'] }] : [], ted }),
  kontakty: () => [{ j: 'Trenér', a: 'trener@klub.test', n: 5 }, { j: 'Investor', a: 'info@stavba.test', n: 2 }],
  podpisyUlozit: (d) => ({ osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false, podpisy: d.podpisy }),
  pocasi: (d) => ({ vytvoreno: Date.now(), misto: d && d.poloha ? 'Strážnice' : pocasiDomov ? pocasiDomov.misto : 'Veselí nad Moravou', podlePolohy: !!(d && d.poloha),
    domov: !(d && d.poloha) && !!pocasiDomov || undefined, presnost: d && d.poloha && d.poloha.presnost > 1500 ? d.poloha.presnost : undefined,
    souhrn: 'Silné bouřky', zdroj: 'ČHMÚ',
    vystrahy: [{ typ: 'vystraha', uroven: 'zluta', nazev: 'Silné bouřky', od: den(1, 14), do: den(1, 22), celyKraj: true, text: 'Je třeba dbát na bezpečnost.', popis: '' }],
    reky: [{ typ: 'hladina', uroven: 'zelena', nazev: 'Morava – Strážnice', stav: 'bez povodně', kdy: ted - H, hladina: 82, trend: 'ustálená', spa: 0, spaPredpoved: 0, maxPredpoved: 82, kdyMax: ted, spa1: 530, text: 'Hladina 82 cm, ustálená.' }],
    predpovedi: [0, 1, 2, 3].map((i) => ({ nazev: 'Předpověď', od: den(i, 0), do: den(i + 1, 0), den: iso(den(i, 12)), oblast: 'Jihomoravský kraj', uvod: ['Jasno', 'Bouřky', 'Polojasno', 'Déšť'][i],
      tMax: [20 + i, 24 + i], tMin: i ? [8, 11] : null, srazky: '', vitr: '', jevy: [], ikona: ['slunce', 'bourka', 'polojasno', 'dest'][i], uroven: 'info', vydano: ted })) })
};
const volano = [];
let ztratitOdpovedi = 0;          // kolik dalších odpovědí motoru „ztratí Google“ (test opakování)
const odpovediRid = new Map();    // rid → odpověď (motor opakovaný zápis neprovede)
let navrhZahozen = false;
// schránka: smazané poznámky (koš na Disku – Vrátit je vrátí) a moje poznámky „pro mě“ (MOJE, hotové = MOJE/HOTOVO)
const smazanoSchranka = new Set(), mojeHotoveTest = new Set();
const MOJE_VYCHOZI = [{ id: 'moje-a', text: 'Koupit žárovky do garáže', kdy: ted - 2 * H, odkud: 'iPhone' },
  { id: 'moje-b', text: 'Zjistit cenu zimních pneumatik a přezout do konce října, ať nečekám na první sníh. Ceník: https://example.com/pneu', kdy: ted - 30 * H, odkud: 'iPhone' }];
const mojePoznamkyTest = MOJE_VYCHOZI.map((p) => Object.assign({}, p));
/** Schránka zpět do výchozího stavu (testy schránky po sobě uklidí). */
function vycistiSchranku() {
  smazanoSchranka.clear();
  mojeHotoveTest.clear();
  mojePoznamkyTest.splice(0, mojePoznamkyTest.length, ...MOJE_VYCHOZI.map((p) => Object.assign({}, p)));
}
const autoZapisy = [], autoSmazano = [], autoUctenky = [], autoUpravy = [], autoFotky = [], autoTerminy = [];
let postaNavic = {};              // test záložek: aktualizace v Doručené, čísla záložek a přehled od Clauda
const doplnkyDny = {}, doplnkyVolani = []; // odškrtnuté doplňky (motor: ZDRAVI/DOPLNKY.json)
let jmeninyOblibeni = [];          // oblíbení lidé (jmeniny v kalendáři)
const pitiDny = {}, pitiVolani = []; // pití a jídlo (motor: ZDRAVI/PITI_JIDLO.json)
let rezimHlavni = null;             // hlavní doplňky v režimu (ZDRAVI_REZIM.json → hlavni); null = počítá se vše
let tydenniMock = null;             // týdenní shrnutí od Clauda (motor: zdravi.tydenni)
const postaPresuny = [], postaPrecteno = [];
const STITKY_VYCHOZI = [{ nazev: 'Fotbal', neprectenych: 1 }, { nazev: 'Účty', neprectenych: 0 }];
let stitkyMotoru = STITKY_VYCHOZI;   // štítky Gmailu (test lišty skupin je rozšíří)
const zpozdeniMotoru = {};          // akce → ms (pomalý motor: test přednačtení měří klepnutí s ním a bez něj)
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
let pocasiDomov = null; // domov pro počasí (akce pocasiDomov)
let upozorneniStav = { zapnuto: false, tema: '' }, upozorneniOdeslano = 0;
// plakáty: data motoru (testy si je mění, jako když popisek napíše Claude)
const plakatyData = { nastaveni: {}, kola: {}, popisky: {}, plan: {}, obrazky: {} };
const plakatyIg = { nastaveno: true, ucet: 'fkagrovnorovy' };
// zápasy na plakát 17.–18. a 24.–25. 10. 2026 jako ve FOTBAL.json (přeložené a s poznámkou svazu). Jen v testech plakátů –
// pevná data by jinak měnila testy, které počítají s dneškem (doplňky v den zápasu áčka, další zápas).
let fotbalPlakat = false;
const zapasPlakat = (id, tym, zacatek, domaci, hoste, navic) => Object.assign({ id, tym, zacatek, domaci, hoste, doma: /Vnorovy/.test(domaci), misto: '',
  vysledek: '', stav: 'naplanovano', url: '#' }, navic);
const ZAPASY_PLAKAT = [
  zapasPlakat('pl-d12', 'dorost', '2026-10-17T10:00:00+02:00', 'FK Hodonín "B"', 'FK Agro Vnorovy'),
  zapasPlakat('pl-a12', 'A', '2026-10-17T14:30:00+02:00', 'FK Agro Vnorovy', 'FK Milotice'),
  zapasPlakat('pl-b2', 'B', '2026-10-18T14:30:00+02:00', 'Petrov', 'Vnorovy B'),
  zapasPlakat('pl-a13', 'A', '2026-10-24T14:30:00+02:00', 'TJ Sokol Hroznová Lhota', 'FK Agro Vnorovy', { poznamka: 'schváleno STK' }),
  zapasPlakat('pl-d13', 'dorost', '2026-10-25T11:45:00+01:00', 'FK Agro Vnorovy', 'TJ Velká nad Veličkou',
    { puvodniTermin: '2026-10-24 11:45', poznamka: 'Původní termín: 24.10.2026 11:45' }),
  zapasPlakat('pl-b1', 'B', '2026-10-25T14:30:00+01:00', 'Vnorovy B', 'Kozojídky', { puvodniTermin: '2026-10-24 14:30', poznamka: 'Původní termín: 24.10.2026 14:30' })
];

// ---------------------------------------------------------------- napodobený Firebase (účet a kopie dat ze serveru)
// Knihovny z gstatic nahradí malé moduly níž (page.route); přihlášení, databáze a funkce běží tady v testu
// (exposeBinding __fb) – žádný skutečný projekt. Pravidla jako firebase/firestore.rules: jen vlastní dokumenty, data jen server.
const FB_UZIVATEL = { email: 'michal@test.cz', heslo: 'zelena louka u hriste 7', uid: 'uid-michal' };
const fbDocs = {};       // cesta → data dokumentu
const fbVolano = [];     // volané serverové funkce
const fbVolanoData = []; // s jakými daty (obnovHned: vse, jen)
let fbObnova = null;     // co udělá obnovHned (nastaví test)
function fbObsluha(op, a) {
  const smi = (cesta) => !!a.uid && cesta.indexOf('uzivatele/' + a.uid) === 0;
  if (op === 'prihlas') return a.email === FB_UZIVATEL.email && a.heslo === FB_UZIVATEL.heslo ? { uid: FB_UZIVATEL.uid } : { chyba: 'auth/invalid-credential' };
  if (op === 'cti') return smi(a.cesta) ? { data: fbDocs[a.cesta] || null } : { chyba: 'permission-denied' };
  if (op === 'zapis') {
    // kopie (data/…) zapisuje jen server – výjimka data/_signal: jen celá čísla zdravi a auto (jako firestore.rules)
    const signal = a.cesta === 'uzivatele/' + a.uid + '/data/_signal';
    if (!smi(a.cesta) || (a.cesta.indexOf('/data/') >= 0 && !signal)) return { chyba: 'permission-denied' };
    const nove = a.merge ? Object.assign({}, fbDocs[a.cesta], a.data) : a.data;
    if (signal && !Object.keys(nove).every((k) => ['zdravi', 'auto'].indexOf(k) >= 0 && Number.isInteger(nove[k]))) return { chyba: 'permission-denied' };
    fbDocs[a.cesta] = nove;
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
    fbVolanoData.push(a.data || {});
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
    if (zpozdeniMotoru[data.akce]) await new Promise((r) => setTimeout(r, zpozdeniMotoru[data.akce])); // pomalý Apps Script
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

async function novaStranka(prohlizec, v, motiv, volby) {
  const ctx = await prohlizec.newContext(Object.assign({ viewport: { width: v.sirka, height: v.vyska }, colorScheme: motiv || 'light', hasTouch: v.dotyk,
    isMobile: v.nazev === 'telefon' }, volby));
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

// html2canvas (js/vendor, načte se až při obrázku plakátu) – v testu napodobený: „vykreslí“ plakát snímkem Playwrightu
// (__snimekPlakatu) a zapíše, co dostal (neškálovaný uzel 1400 × 990, měřítko)
const H2C_TEST = `window.html2canvas = async function (uzel, volby) {
  window.__h2c = (window.__h2c || []).concat([{ sirka: uzel.offsetWidth, vyska: uzel.offsetHeight, meritko: volby.scale,
    transform: getComputedStyle(uzel).transform, text: uzel.textContent }]);
  var hostitel = uzel.parentNode;
  hostitel.classList.add('plakat-export--klon');
  try {
    var b64 = await window.__snimekPlakatu();
    var obr = new Image();
    await new Promise(function (ok, chyba) { obr.onload = ok; obr.onerror = chyba; obr.src = 'data:image/png;base64,' + b64; });
    var c = document.createElement('canvas');
    c.width = Math.round(volby.width * volby.scale);
    c.height = Math.round(volby.height * volby.scale);
    c.getContext('2d').drawImage(obr, 0, 0, c.width, c.height);
    return c;
  } finally { hostitel.classList.remove('plakat-export--klon'); }
};`;
async function napodobHtml2canvas(page) {
  await page.exposeBinding('__snimekPlakatu', async ({ page: p }) => (await p.locator('.plakat-export .poster').screenshot()).toString('base64'));
  await page.route('**/js/vendor/html2canvas.min.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
    body: H2C_TEST }));
}
/** Rozměry JPEG (z dat obrázku) – šířka × výška. */
function rozmerJpeg(b) {
  for (let i = 2; i < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
const jpegZDat = (dataUrl) => Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
/** Čeká na podmínku v Node (zápis do napodobeného motoru). */
async function cekej(fn, ms, popis) {
  const konec = Date.now() + (ms || 5000);
  while (Date.now() < konec) { if (fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('Nedočkal jsem se: ' + (popis || ''));
}
const PRAHA = { timezoneId: 'Europe/Prague' };
/** Výchozí víkend jako v aplikaci (nejbližší nadcházející; v sobotu a v neděli ten probíhající). */
function vychoziVikendTestu() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (d.getDay() === 0 ? -1 : 6 - d.getDay()));
  return iso(d.getTime());
}

(async () => {
  // PORT_TESTU=… → jiný port, když na PC zrovna běží testy z jiné kopie repa (dvě okna naráz)
  const PORT = Number(process.env.PORT_TESTU) || 8766;
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const WEB = 'http://127.0.0.1:' + PORT + '/';
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
        // pošta má od 9. 10. vlastní kartu (jen co čeká a nepřečtené), ve „Vyžaduje pozornost“ jsou úkoly a rozhodnutí
        if (v.sirka >= 760) jistota(await page.locator('#dl-posta:not([hidden]) [data-vlakno="v1"]').count() === 1 && await page.locator('#dl-pozornost [data-polozka-id="c1"]').count() === 1 &&
          !(await page.locator('#dl-pozornost [data-vlakno]').count()), 'pozornost: úkoly ve Vyžaduje pozornost, pošta ve vlastní kartě');
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
        await page.waitForSelector('#sb-tyden .sb-cisla');
        jistota(await pretika() <= 0, 'Schránka přetéká');
        await page.waitForFunction(() => !document.querySelector('.panel')); // Nastavení dojede (zavírá se ještě 260 ms)
        await page.screenshot({ path: path.join(VYSTUP, jmeno + '_schranka.png'), fullPage: v.nazev !== 'pc' });
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

  // ---------- Dnes (Michal 9. 10.): malé dlaždice v horní liště místo řady velkých čísel – počasí, připravenost, nepřečtené,
  // denní kroužky (šířky 2 : 2 : 1 : 1 podle nákresu); nic nepřetéká ani se netlačí přes hledání; jinde lišta jako dřív
  const SIRKY_HORNI = [VELIKOSTI[3], { nazev: 'pc-siroke', sirka: 1650, vyska: 1000, dotyk: false }, VELIKOSTI[2], VELIKOSTI[1],
    { nazev: 'ipad-uzky', sirka: 768, vyska: 1024, dotyk: true }];
  await test('Dnes: horní dlaždice – obsah, pořadí a šířky 2 : 2 : 1 : 1, nic nepřetéká ani nezakrývá hledání (PC, iPad)', async () => {
    for (const v of SIRKY_HORNI) {
      for (const motiv of v.nazev === 'pc' ? ['light', 'dark'] : ['light']) {
        const kde = v.nazev + (motiv === 'dark' ? '-tmavy' : '') + ': ';
        const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, motiv);
        await page.goto(WEB);
        await page.waitForFunction(() => document.querySelector('#horni #dnes-kpi [data-krouzky]') &&
          /72/.test((document.querySelector('#dnes-kpi [data-cil="zdravi"]:not([data-krouzky])') || {}).textContent || '') &&
          /°C/.test((document.querySelector('#dnes-kpi [data-pocasi]') || {}).textContent || '') && document.querySelector('#dl-posta:not([hidden]) [data-vlakno]'));
        const m = await page.evaluate(() => {
          const r = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
          const dl = [...document.querySelectorAll('#dnes-kpi > .hd')];
          return {
            druhy: dl.map((x) => (x.hasAttribute('data-pocasi') ? 'pocasi' : x.hasAttribute('data-krouzky') ? 'krouzky' : x.dataset.cil)),
            sirky: dl.map((x) => x.getBoundingClientRect().width),
            pretece: dl.filter((x) => x.scrollWidth > x.clientWidth + 1 || x.scrollHeight > x.clientHeight + 1).map((x) => x.className + ' ' + x.scrollWidth + '/' + x.clientWidth),
            hledat: r(document.querySelector('#horni .hledat-tl')), dlazdice: r(document.getElementById('dnes-kpi')), akce: r(document.querySelector('#horni .horni__akce')),
            horni: r(document.getElementById('horni')),
            strana: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            texty: dl.map((x) => ['.hd__hodnota', '.hd__popis'].map((s) => ((x.querySelector(s) || {}).textContent || '').replace(/\s+/g, ' ').trim()).join(' | ')),
            krouzky: document.querySelector('#dnes-kpi [data-krouzky]').getAttribute('aria-label') || '',
            kruhy: document.querySelectorAll('#dnes-kpi [data-krouzky] svg circle').length,
            velkaCisla: document.querySelectorAll('#p-dnes .kpi').length
          };
        });
        jistota(m.druhy.join() === 'pocasi,zdravi,posta,krouzky', kde + 'pořadí dlaždic: ' + m.druhy.join());
        // širší = dva sloupce užší + mezera 8 px
        jistota(Math.abs(m.sirky[0] - m.sirky[1]) < 1.5 && Math.abs(m.sirky[2] - m.sirky[3]) < 1.5 && Math.abs(m.sirky[0] - (2 * m.sirky[2] + 8)) < 2,
          kde + 'šířky nejsou 2 : 2 : 1 : 1: ' + m.sirky.map(Math.round).join(' : '));
        jistota(m.sirky[3] >= 50, kde + 'užší dlaždice moc úzká: ' + Math.round(m.sirky[3]));
        jistota(!m.pretece.length, kde + 'obsah dlaždice přetéká: ' + m.pretece.join(' | '));
        jistota(m.hledat.r <= m.dlazdice.l - 4 && m.dlazdice.r <= m.akce.l - 4 && m.hledat.w >= 40, kde + 'dlaždice se tlačí přes hledání nebo tlačítka: ' +
          JSON.stringify([m.hledat, m.dlazdice, m.akce]));
        jistota(m.akce.r <= m.horni.r && m.horni.h <= 80 && m.strana <= 0, kde + 'lišta přetéká nebo je moc vysoká: ' + JSON.stringify([m.horni, m.akce, m.strana]));
        jistota(/°C/.test(m.texty[0]) && /^72/.test(m.texty[1]) && /Připravenost · spánek 6:30/.test(m.texty[1]) && m.texty[2] === '1 | 1 čeká',
          kde + 'obsah dlaždic: ' + m.texty.join(' ¦ '));
        jistota(/Voda 0,0 \/ 2,5 l/.test(m.krouzky) && /Bílkoviny 0 \/ 130 g/.test(m.krouzky) && /Pohyb 4\s000 \/ 8\s000 kroků \(50 %\)/.test(m.krouzky) && m.kruhy === 4,
          kde + 'kroužky: ' + m.krouzky + ' · kruhů ' + m.kruhy);
        jistota(!m.velkaCisla, kde + 'na Dnes zůstala řada velkých čísel');
        await page.locator('#horni').screenshot({ path: path.join(VYSTUP, v.nazev + (motiv === 'dark' ? '-tmavy' : '') + '_horni_dlazdice.png') });
        jistota(!chybyStranky.length, kde + 'chyby stránky: ' + chybyStranky.join(' | '));
        await ctx.close();
      }
    }
  });

  await test('Dnes: horní dlaždice – klepnutí: kroužky a připravenost do Zdraví, nepřečtené do Pošty; jinde lišta bez dlaždic', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dnes-kpi [data-krouzky]');
    await page.click('#dnes-kpi [data-krouzky]');
    await page.waitForSelector('#p-zdravi:not([hidden]) .zdravi-hero');
    jistota(!(await page.locator('#horni .hd, #horni.horni--dnes').count()), 'na Zdraví lišta bez dlaždic');
    await page.click('#rail [data-cil="dnes"]');
    await page.click('#dnes-kpi [data-filtr-posty="neprectene"]');
    await page.waitForSelector('#posta-filtry [data-filtr-posty="neprectene"][aria-pressed="true"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
    jistota(await page.locator('#posta-seznam [data-vlakno]').count() === 1, 'Pošta: jen nepřečtené');
    jistota(!(await page.locator('#horni .hd').count()) && await page.isVisible('#horni [data-psat="novy"]'), 'na Poště lišta jako dřív');
    await page.click('#rail [data-cil="dnes"]');
    await page.click('#dnes-kpi [data-cil="zdravi"]:not([data-krouzky])');
    await page.waitForSelector('#p-zdravi:not([hidden]) .zdravi-hero');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Dnes: pošta zvlášť (Michal 9. 10.: „když je vyřízena pošta, tak se nemusí zobrazit – aby bylo jasno, že mám
  // přečteno a vyřízeno, nebo ne“): karta jen s tím, co čeká, a nepřečtenými; Aktualizace jedním řádkem; telefon obdobně
  await test('Dnes: pošta zvlášť – karta jen s čekající a nepřečtenou poštou, vyřízená = schovaná, Aktualizace jedním řádkem (PC i telefon)', async () => {
    const vyrizena = Object.assign({}, vlaknoSouhrn.v1, { stav: 'resi', neprectena: false, navrh: false });
    try {
      let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
      await page.goto(WEB);
      await page.waitForSelector('#dl-posta:not([hidden]) [data-vlakno="v1"]');
      jistota(/Pošta · 1/.test(await page.textContent('#dl-posta .card-hlava')) && !(await page.locator('#dl-posta [data-vlakno="v2"]').count()), 'karta Pošta: jen co čeká');
      jistota(/2 věci čekají na tebe · 1 e-mail k vyřízení/.test(await page.textContent('#hlava')), 'podnadpis: ' + await page.textContent('#hlava'));
      jistota(/Vyžaduje pozornost · 2/.test(await page.textContent('#dl-pozornost .card-hlava')), 'Vyžaduje pozornost sedí s podnadpisem');
      await page.locator('#dl-posta').screenshot({ path: path.join(VYSTUP, 'pc_dnes_posta.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // vše přečtené a vyřízené → karta není, v liště fajfka „vše přečteno“, v podnadpisu „pošta vyřízená“
      postaNavic = { osobni: [vyrizena] };
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]));
      await page.goto(WEB);
      await page.waitForSelector('#dnes-kpi .hd--hotovo');
      await page.waitForSelector('#dl-pozornost .seznam');
      jistota(await page.locator('#dl-posta').isHidden(), 'karta Pošta po vyřízení schovaná');
      jistota(/vše\s*přečteno/.test(await page.textContent('#dnes-kpi .hd--hotovo')), 'lišta: vše přečteno');
      jistota(/pošta vyřízená/.test(await page.textContent('#hlava')), 'podnadpis: ' + await page.textContent('#hlava'));
      await page.screenshot({ path: path.join(VYSTUP, 'pc_dnes_posta_vyrizena.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // jen nepřečtené Aktualizace → karta s jedním řádkem, klepnutí → Pošta, záložka Aktualizace, nepřečtené
      postaNavic = { osobni: [vyrizena, { id: 'v5', ucet: 'osobni', stav: 'info', aktualizace: true, od: 'Obchod Test', predmet: 'Zásilka čeká ve výdejním boxu',
        ukazka: 'Vyzvedněte do pátku.', kdy: ted - 3 * H, neprectena: true, pocet: 1, odkaz: '#' }] };
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]));
      await page.goto(WEB);
      await page.waitForSelector('#dl-posta:not([hidden]) .dl-posta__aktualizace');
      jistota(/1 nepřečtený v Aktualizacích/.test(await page.textContent('#dl-posta')) && !(await page.locator('#dl-posta [data-vlakno]').count()), 'řádek Aktualizací');
      await page.click('#dl-posta .dl-posta__aktualizace');
      await page.waitForSelector('.posta-kategorie [data-kategorie-posty="aktualizace"][aria-selected="true"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="v5"]');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // telefon: Pošta jako vlastní seznam pod „Vyžaduje pozornost“, v malých číslech kroužky místo Dalšího zápasu
      postaNavic = {};
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]));
      await page.goto(WEB);
      await page.waitForSelector('.pozornost--posta [data-vlakno="v1"]');
      await page.waitForSelector('.mini-kpi[data-krouzky] svg');
      jistota(await page.locator('.mini-kpi').count() === 3 && !(await page.locator('.mini-kpi[data-oblast="fotbal"]').count()), 'telefon: tři malá čísla bez Dalšího zápasu');
      jistota(!(await page.locator('.pozornost:not(.pozornost--posta) [data-vlakno]').count()), 'telefon: pošta jen ve svém seznamu');
      jistota(/0,0 l/.test(await page.textContent('.mini-kpi[data-krouzky]')) && /4\s000/.test(await page.textContent('.mini-kpi[data-krouzky]')), 'telefon: kroužky s hodnotami');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'telefon: Dnes přetéká do strany');
      jistota(await page.evaluate(() => [...document.querySelectorAll('.mini-kpi')].every((x) => x.scrollWidth <= x.clientWidth + 1)), 'telefon: malé číslo přetéká');
      await page.locator('#dnes-mobil').screenshot({ path: path.join(VYSTUP, 'telefon_dnes_krouzky_posta.png') });
      await ctx.close();
      postaNavic = { osobni: [vyrizena] };
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark'));
      await page.goto(WEB);
      await page.waitForSelector('.pozornost .pozor');
      await page.waitForFunction(() => /pošta vyřízená/.test(document.getElementById('hlava').textContent));
      jistota(!(await page.locator('.pozornost--posta').count()), 'telefon: vyřízená pošta bez seznamu');
      await page.locator('#dnes-mobil').screenshot({ path: path.join(VYSTUP, 'telefon-tmavy_dnes_posta_vyrizena.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      postaNavic = {};
    }
  });

  // ---------- levý pás (Michal 9. 10.): mimo Dnes jen ikony s počty – víc místa na práci; po najetí myší nebo fokusu
  // klávesnicí se rozbalí přes obsah (stránka neposkočí), připnout = celý všude (pamatuje si zařízení)
  await test('levý pás: mimo Dnes jen ikony s počty, najetí myší i klávesnice ho rozbalí přes obsah, připnout a odepnout', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#rail [data-cil="posta"] .pocet');
    const rozmery = () => page.evaluate(() => ({
      pas: Math.round(document.getElementById('rail').getBoundingClientRect().width),
      obsah: Math.round(document.querySelector('.hlavni').getBoundingClientRect().left),
      popisky: [...document.querySelectorAll('#rail .rail__btn > span:not(.pocet)')].filter((s) => s.getClientRects().length).length,
      rozbaleny: document.getElementById('rail').classList.contains('rozbaleny'),
      uzky: document.getElementById('aplikace').classList.contains('rail-uzky') }));
    const pockej = async (fn, popis) => {
      for (let i = 0; i < 60; i++) { const r = await rozmery(); if (fn(r)) return r; await page.waitForTimeout(50); }
      throw new Error('Nedočkal jsem se: ' + popis + ' ' + JSON.stringify(await rozmery()));
    };
    let r = await rozmery();
    jistota(!r.uzky && r.pas === 236 && r.popisky >= 9 && r.obsah === 236, 'na Dnes celý pás: ' + JSON.stringify(r));
    await page.click('#rail [data-cil="posta"]');
    await page.waitForSelector('#posta-seznam [data-vlakno]');
    r = await pockej((x) => x.uzky && x.pas <= 76, 'úzký pás na Poště');
    jistota(!r.rozbaleny && r.popisky === 0 && r.obsah === 76, 'na Poště jen ikony: ' + JSON.stringify(r));
    jistota(await page.locator('#rail [data-cil="posta"] .pocet').isVisible() && await page.locator('#rail [data-cil="kalendar"] svg').isVisible(), 'ikony a počet v odznaku');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_pas_uzky.png') });
    // klepnutí na ikonu (myš zůstane nad pásem) vybere sekci a pás se nerozbalí přes otevřenou stránku
    await page.click('#rail [data-cil="kalendar"]');
    await page.waitForSelector('#p-kalendar:not([hidden])');
    await page.waitForTimeout(400);
    r = await rozmery();
    jistota(!r.rozbaleny && r.pas <= 76, 'po klepnutí na ikonu zůstal pás rozbalený: ' + JSON.stringify(r));
    // najetí myší: rozbalí se přes obsah, obsah zůstane na místě; odjetí ho sbalí
    await page.mouse.move(700, 450);
    await page.hover('#rail [data-cil="schranka"]');
    r = await pockej((x) => x.rozbaleny && x.pas >= 236 && x.popisky >= 9, 'rozbalení po najetí');
    jistota(r.obsah === 76, 'rozbalený pás posunul stránku: ' + JSON.stringify(r));
    jistota(await page.locator('#rail [data-rail-pripnout]').isVisible(), 'tlačítko Připnout');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(VYSTUP, 'pc_pas_rozbaleny.png') });
    await page.mouse.move(800, 450);
    await pockej((x) => !x.rozbaleny && x.pas <= 76, 'sbalení po odjetí myší');
    // klávesnice: Shift+Tab z hledání skočí do pásu (Nastavení) → rozbalí se; Escape ho sbalí
    await page.focus('#horni [data-hledat]');
    await page.keyboard.press('Shift+Tab');
    await pockej((x) => x.rozbaleny, 'rozbalení fokusem z klávesnice');
    jistota(await page.evaluate(() => !!document.activeElement.closest('#rail')), 'fokus v pásu');
    await page.keyboard.press('Escape');
    await pockej((x) => !x.rozbaleny, 'Escape sbalí');
    // připnout: pás zůstane celý i mimo Dnes (i po obnovení), odepnout vrátí ikony
    await page.hover('#rail [data-cil="schranka"]');
    await pockej((x) => x.rozbaleny, 'rozbalení před připnutím');
    await page.click('#rail [data-rail-pripnout]');
    await pockej((x) => !x.uzky && x.obsah === 236 && x.pas === 236, 'připnutý pás');
    jistota(await page.evaluate(() => localStorage.getItem('asistent.rail')) === '"pripnuty"', 'připnutí v zařízení');
    await page.evaluate(() => localStorage.removeItem('asistent.videno')); // bez okna „Co je nového“ po obnovení
    await page.reload();
    await page.waitForSelector('#p-kalendar:not([hidden])');
    r = await rozmery();
    jistota(!r.uzky && r.pas === 236 && r.popisky >= 9, 'po obnovení pořád připnutý: ' + JSON.stringify(r));
    jistota(await page.getAttribute('#rail [data-rail-pripnout]', 'aria-pressed') === 'true', 'tlačítko ukazuje připnuto');
    await page.click('#rail [data-rail-pripnout]');
    await pockej((x) => x.uzky && x.pas <= 76 && !x.rozbaleny && x.obsah === 76, 'odepnutí');
    jistota(await page.evaluate(() => localStorage.getItem('asistent.rail')) === null, 'odepnutí v zařízení');
    // zpátky na Dnes: celý pás
    await page.click('#rail [data-cil="dnes"]');
    await pockej((x) => !x.uzky && x.pas === 236 && x.obsah === 236, 'na Dnes zase celý pás');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  await test('levý pás na iPadu: ikony všude (i na Dnes), najetí myší ho rozbalí přes obsah, bez připnutí', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[1]);
    await page.goto(WEB);
    await page.waitForSelector('#rail [data-cil="posta"] .pocet');
    const pas = () => page.evaluate(() => ({ w: Math.round(document.getElementById('rail').getBoundingClientRect().width),
      obsah: Math.round(document.querySelector('.hlavni').getBoundingClientRect().left), rozbaleny: document.getElementById('rail').classList.contains('rozbaleny') }));
    let r = await pas();
    jistota(r.w === 76 && r.obsah === 76 && !r.rozbaleny, 'iPad: úzký pás na Dnes: ' + JSON.stringify(r));
    await page.hover('#rail [data-cil="kalendar"]');
    await page.waitForFunction(() => document.getElementById('rail').classList.contains('rozbaleny') && document.getElementById('rail').getBoundingClientRect().width >= 236);
    r = await pas();
    jistota(r.obsah === 76, 'iPad: rozbalení posunulo stránku: ' + JSON.stringify(r));
    jistota(!(await page.locator('#rail [data-rail-pripnout]').isVisible()), 'iPad: připnout až od 1180 px');
    await page.mouse.move(600, 600);
    await page.waitForFunction(() => !document.getElementById('rail').classList.contains('rozbaleny'));
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

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
    await page.waitForFunction(() => document.querySelectorAll('#dl-posta .radek-posta').length === 1); // pošta na Dnes ve vlastní kartě
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
    await page.waitForSelector('.posta-stitky [data-stitek-posty="VÝVOJ"]'); // nová skupina hned v liště skupin
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    postaNavic = {};
  });

  // ---------- pošta: štítky z Gmailu, nejnovější zpráva nahoře, podpis v psaní, našeptávač adres
  await test('pošta: štítky Gmailu, nejnovější nahoře, podpis, našeptávač adres', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="posta"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
    // skupina v liště pod záložkami: konverzace štítku i archivované; znovu klepnutí = zpět do Doručené
    await page.click('.posta-stitky [data-stitek-posty="Fotbal"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v8"]');
    jistota(!(await page.locator('#posta-seznam [data-vlakno="v2"]').count()), 've štítku nemá být pracovní v2');
    jistota(await page.getAttribute('.posta-stitky [data-stitek-posty="Fotbal"]', 'aria-pressed') === 'true', 'vybraná skupina zvýrazněná');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_stitek.png') });
    await page.click('.posta-stitky [data-stitek-posty="Fotbal"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v2"]');
    // vlákno: nejnovější zpráva nahoře a rozbalená, starší pod ní sbalená; štítky Gmailu jsou v detailu (v řádku ne)
    await page.click('#posta-seznam [data-vlakno="v1"]');
    await page.waitForSelector('#posta-detail .zprava');
    jistota(await page.locator('#posta-detail .vlakno-stitky .stitek-gmail').count() === 1 && !(await page.locator('#posta-seznam .stitek-gmail').count()), 'štítky v detailu, ne v řádku');
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

  // ---------- pošta 9. 10.: skupiny v liště, přetažení, dlouhé podržení, řádek, náhled, Apps Script, přednačtení, prázdná pracovní
  const STITKY_DLOUHE = ['AGRO', 'AUTO', 'AUTO/PATRIOT', 'BYT VESELÍ', 'FAKTUROID', 'Fotbal', 'Fotbal/Dorost', 'Madmonq', 'Notes', 'OSVČ', 'PASPORT KANA', 'Účty', 'VÝVOJ']
    .map((nazev) => ({ nazev, neprectenych: nazev === 'VÝVOJ' ? 11 : nazev === 'Fotbal' ? 1 : 0 }));
  const kontrastCipu = (el, sel) => {
    const c = el.querySelector(sel);
    const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = (a) => { const x = a.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2]; };
    const cs = getComputedStyle(c);
    const a = lum(rgb(cs.color)), b = lum(rgb(cs.backgroundColor));
    return Math.round((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) * 100) / 100;
  };

  await test('pošta: skupiny v liště pod záložkami (čitelné i potmě), přetažení e-mailu na skupinu, Vrátit, ze skupiny do skupiny', async () => {
    stitkyMotoru = STITKY_DLOUHE;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, { nazev: 'pc-siroke', sirka: 1650, vyska: 950, dotyk: false }, 'dark');
    await page.goto(WEB);
    await page.click('#rail [data-cil="posta"]');
    await page.waitForSelector('.posta-stitky [data-stitek-posty="VÝVOJ"]');
    // druhá lišta hned pod záložkami; podštítek hned za rodičem jako „/ PATRIOT“; počet nepřečtených
    const listy = await page.$$eval('#posta-filtry > *', (x) => x.map((e) => e.className.split(' ')[0]));
    jistota(listy.join() === 'posta-kategorie,posta-stitky,filtry', 'pořadí lišt: ' + listy.join());
    const cipy = await page.$$eval('.posta-stitky [data-stitek-posty]', (x) => x.map((e) => e.dataset.stitekPosty + '=' + e.textContent.replace(/\s+/g, '')));
    jistota(cipy.indexOf('AUTO/PATRIOT=/PATRIOT') === cipy.indexOf('AUTO=AUTO') + 1 && cipy.indexOf('VÝVOJ=VÝVOJ11') >= 0, 'čipy: ' + cipy.join(' | '));
    // čitelnost potmě (Michal 9. 10.: „nejde vidět“ – světle šedá na bílé): kontrast textu a plochy čipu aspoň 4,5 : 1
    const kontrast = await page.$eval('.posta-stitky', kontrastCipu, '[data-stitek-posty="AGRO"]');
    jistota(kontrast >= 4.5, 'kontrast čipu potmě: ' + kontrast);
    // na PC se dlouhá řada zalomí – nic nepřetéká
    jistota(await page.$eval('.posta-stitky', (l) => l.scrollWidth <= l.clientWidth + 1), 'lišta skupin přetéká');
    // během táhnutí je lišta cíl a skupina pod myší zvýrazněná (snímek pro kontrolu vzhledu)
    await page.evaluate(() => {
      const dt = new DataTransfer();
      document.querySelector('#posta-seznam [data-vlakno="v1"]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      document.querySelector('.posta-stitky [data-stitek-posty="Účty"]').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    jistota(await page.evaluate(() => document.documentElement.classList.contains('tahne-postu') && document.querySelector('[data-stitek-posty="Účty"]').classList.contains('cil')), 'zvýraznění cíle');
    await page.screenshot({ path: path.join(VYSTUP, 'pc-tmavy_posta_tazeni.png') });
    await page.evaluate(() => document.querySelector('#posta-seznam [data-vlakno="v1"]').dispatchEvent(new DragEvent('dragend', { bubbles: true })));
    jistota(!(await page.evaluate(() => document.documentElement.classList.contains('tahne-postu'))), 'po tažení zvýraznění pryč');
    // přetažení myší: v1 → Účty = štítek a pryč z Doručené, oznámení s Vrátit
    const pred = postaPresuny.length;
    await page.dragAndDrop('#posta-seznam [data-vlakno="v1"]', '.posta-stitky [data-stitek-posty="Účty"]');
    await page.waitForFunction(() => /Přesunuto do Účty/.test(document.getElementById('toast').textContent));
    jistota(!(await page.locator('#posta-seznam [data-vlakno="v1"]').count()), 'přetažená konverzace pryč ze seznamu');
    await cekej(() => postaPresuny.length === pred + 1, 3000, 'přesun do motoru');
    const p = postaPresuny[pred];
    jistota(p.id === 'v1' && p.stitek === 'Účty' && p.pridat === true && p.archivovat === true && !p.odebrat, 'přesun: ' + JSON.stringify(p));
    // Vrátit: hned zpět v seznamu, v motoru štítek pryč a zpět do Doručené jedním dotazem
    await page.click('#toast .toast__akce');
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
    await cekej(() => postaPresuny.length === pred + 2, 3000, 'Vrátit do motoru');
    const v = postaPresuny[pred + 1];
    jistota(v.id === 'v1' && v.stitek === 'Účty' && v.pridat === false && v.doDorucenych === true, 'vrátit: ' + JSON.stringify(v));
    // ze skupiny do skupiny: ve Fotbalu přetáhnout v8 na Účty → štítek Fotbal pryč (jako „Přesunout do“ v Gmailu)
    await page.click('.posta-stitky [data-stitek-posty="Fotbal"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v8"]');
    await page.screenshot({ path: path.join(VYSTUP, 'pc-tmavy_posta_skupina.png') });
    await page.dragAndDrop('#posta-seznam [data-vlakno="v8"]', '.posta-stitky [data-stitek-posty="Účty"]');
    await cekej(() => postaPresuny.length === pred + 3, 3000, 'přesun ze skupiny');
    jistota(postaPresuny[pred + 2].odebrat === 'Fotbal' && postaPresuny[pred + 2].stitek === 'Účty', 'ze skupiny: ' + JSON.stringify(postaPresuny[pred + 2]));
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    stitkyMotoru = STITKY_VYCHOZI;
  });

  await test('pošta na telefonu: skupiny v jedné řadě do strany, dlouhé podržení řádku = Přesunout do…, nic nepřetéká', async () => {
    stitkyMotoru = STITKY_DLOUHE;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark');
    await page.goto(WEB);
    await page.click('#lista [data-cil="posta"]');
    await page.waitForSelector('.posta-stitky [data-stitek-posty="VÝVOJ"]', { state: 'attached' });
    const lista = await page.$eval('.posta-stitky', (l) => ({ posun: l.scrollWidth > l.clientWidth,
      radky: new Set(Array.from(l.querySelectorAll('[data-stitek-posty]')).map((c) => Math.round(c.getBoundingClientRect().top))).size }));
    jistota(lista.posun && lista.radky === 1, 'telefon: lišta skupin v jedné řadě do strany ' + JSON.stringify(lista));
    jistota(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'stránka přetéká do strany');
    const kontrast = await page.$eval('.posta-stitky', kontrastCipu, '[data-stitek-posty="AGRO"]');
    jistota(kontrast >= 4.5, 'kontrast čipu: ' + kontrast);
    await page.screenshot({ path: path.join(VYSTUP, 'telefon-tmavy_posta_skupiny.png') });
    // dlouhé podržení prstem (0,55 s) → okno Přesunout do skupiny; konverzace se neotevře
    await page.$eval('#posta-seznam [data-vlakno="v2"]', (b) => {
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: r.x + 20, clientY: r.y + 10 }));
    });
    await page.waitForSelector('[data-panel="presunout"].otevreny [data-presun-stitek="Účty"]');
    await page.$eval('#posta-seznam [data-vlakno="v2"]', (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })));
    jistota(!(await page.locator('[data-panel="vlakno"]').count()), 'podržení nemá otevřít konverzaci');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(VYSTUP, 'telefon-tmavy_posta_presun.png') });
    const pred = postaPresuny.length;
    await page.click('[data-panel="presunout"] [data-presun-stitek="Účty"]');
    await page.waitForFunction(() => /Přesunuto do Účty/.test(document.getElementById('toast').textContent));
    await cekej(() => postaPresuny.length === pred + 1, 3000, 'přesun z telefonu');
    jistota(postaPresuny[pred].id === 'v2' && postaPresuny[pred].archivovat === true, 'přesun: ' + JSON.stringify(postaPresuny[pred]));
    await page.waitForSelector('[data-panel="presunout"]', { state: 'detached' });
    jistota(!(await page.locator('#posta-seznam [data-vlakno="v2"]').count()), 'pryč ze seznamu');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    stitkyMotoru = STITKY_VYCHOZI;
  });

  await test('pošta: řádek jen odesílatel, předmět, text a čas; náhled bez hlaviček přeposlání; upozornění Apps Scriptu se na Dnes nehlásí', async () => {
    const preposlany = { id: 'v6', ucet: 'osobni', stav: 'ceka', od: 'Kolega', predmet: 'Fwd: Nabídka střechy', kdy: ted - 1.5 * H, neprectena: true, pocet: 1, odkaz: '#',
      ukazka: '---------- Původní e-mail ---------- Od: Firma Test <obchod@firma.test> Komu: Kolega <kolega@x.test> Datum: 9. 10. 2026 10:00:00 ' +
        'Předmět: Fwd: Nabídka střechy Dobrý den, posíláme nabídku na opravu střechy.' };
    // starší kopie od motoru: chyba Apps Scriptu jako „hoří“ – aplikace ji pozná sama
    const appsScript = { id: 'as1', ucet: 'osobni', stav: 'hori', od: 'Apps Script', odAdresa: 'apps-scripts-notifications@google.com',
      predmet: 'Summary of failures for Google Apps Script: Asistent', ukazka: 'Your script, Asistent, has recently failed to finish successfully.',
      kdy: ted - 0.5 * H, neprectena: true, pocet: 1, odkaz: '#' };
    postaNavic = { osobni: [vlaknoSouhrn.v1, preposlany, appsScript] };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    // Dnes: upozornění Apps Scriptu není ve Vyžaduje pozornost ani v počtu nepřečtených
    await page.waitForSelector('#dl-posta [data-vlakno="v6"]');
    jistota(!(await page.locator('#dl-posta [data-vlakno="as1"], #dl-pozornost [data-vlakno="as1"]').count()), 'Apps Script na Dnes');
    const nep = (await page.textContent('#dnes-kpi [data-filtr-posty="neprectene"] .hd__hodnota')).trim();
    jistota(nep === '2', 'nepřečtené na Dnes bez Apps Scriptu: ' + nep);
    // Pošta: v seznamu zůstane jako informace
    await page.click('#rail [data-cil="posta"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="as1"]');
    jistota(/st-info/.test(await page.getAttribute('#posta-seznam li:has([data-vlakno="as1"])', 'class')), 'Apps Script = informace');
    // řádek: odesílatel, předmět, text a čas – stav proužkem, žádné štítky
    const radek = await page.$eval('#posta-seznam [data-vlakno="v6"]', (b) => ({ text: b.querySelector('.radek-text').textContent,
      tagy: b.querySelectorAll('.tag, .stitek-gmail').length, li: b.parentElement.className, cas: !!b.querySelector('.radek-cas') }));
    jistota(radek.text === 'Dobrý den, posíláme nabídku na opravu střechy.', 'náhled: ' + radek.text);
    jistota(!radek.tagy && radek.cas && /st-ceka/.test(radek.li), 'řádek: ' + JSON.stringify(radek));
    jistota(await page.locator('#posta-seznam .radek-ucet').count() >= 1, 'v zobrazení obou účtů drobně účet');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_radky.png') });
    await page.click('#posta-filtry [data-ucet-posty="osobni"]');
    await page.waitForFunction(() => document.querySelector('#posta-seznam [data-vlakno="v6"]') && !document.querySelector('#posta-seznam .radek-ucet'));
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    postaNavic = {};
  });

  await test('pošta: přednačtené detaily – klepnutí nečeká na motor (detail hned, motor jen „přečteno“), bez přednačtení čeká', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    zpozdeniMotoru.vlakno = 1500; // pomalý Apps Script (skutečné otevření e-mailu trvalo 2–5 s)
    const zacatek = volano.length; // volání motoru z předchozích testů nepočítat
    const tady = () => volano.slice(zacatek);
    await page.goto(WEB);
    await page.click('#rail [data-cil="posta"]');
    await page.waitForSelector('#posta-seznam [data-vlakno="v2"]');
    // aplikace v klidu → jeden dotaz s detaily konverzací ze seznamu (id + otisk), nic se nepřečte
    await cekej(() => tady().some((d) => d.akce === 'postaDetaily'), 9000, 'přednačtení');
    const prednacteni = tady().filter((d) => d.akce === 'postaDetaily');
    const idsPred = prednacteni.length === 1 ? prednacteni[0].ids.map((x) => x.id) : [];
    jistota(idsPred.includes('v1') && idsPred.includes('v2') && !idsPred.includes('as1') && prednacteni[0].ids.every((x) => x.kdy && x.pocet),
      'přednačtení: ' + JSON.stringify(tady().filter((d) => d.akce === 'postaDetaily' || d.akce === 'vlakno').map((d) => [d.akce, d.id || (d.ids || []).map((x) => x.id).join('+')])));
    await page.waitForFunction(() => import('/js/stav.js').then((m) => !!(m.stav.vlakna.v1 && m.stav.vlakna.v1.data && m.stav.vlakna.v2 && m.stav.vlakna.v2.data)));
    // přečtená konverzace: detail hned, motor se vůbec nevolá
    let pred = volano.length;
    let t = Date.now();
    await page.click('#posta-seznam [data-vlakno="v2"]');
    await page.waitForSelector('#posta-detail .zprava-html');
    const sPrednactenim = Date.now() - t;
    await page.waitForTimeout(500);
    jistota(volano.length === pred, 'klepnutí volalo motor: ' + JSON.stringify(volano.slice(pred).map((d) => [d.akce, d.id, d.ids])));
    // nepřečtená: detail hned, motor jen označí přečtené (bez načítání detailu)
    pred = volano.length;
    await page.click('#posta-seznam [data-vlakno="v1"]');
    await page.waitForFunction(() => /Sraz v sobotu/.test((document.querySelector('#posta-detail .vlakno-predmet') || {}).textContent || '') && document.querySelector('#posta-detail .zprava'));
    await page.waitForTimeout(500);
    const nove = volano.slice(pred).map((d) => d.akce + ':' + (d.jak || '') + ':' + (d.id || ''));
    jistota(nove.join() === 'oznacit:prectene:v1', 'nepřečtená: ' + nove.join());
    // bez detailu v paměti čeká klepnutí na motor (tak to bylo dřív u každého e-mailu)
    await page.evaluate(() => import('/js/stav.js').then((m) => { delete m.stav.vlakna.v2; }));
    t = Date.now();
    await page.click('#posta-seznam [data-vlakno="v2"]');
    await page.waitForSelector('#posta-detail .zprava-html');
    const bezPrednacteni = Date.now() - t;
    console.log('    (otevření e-mailu s přednačtením ' + sPrednactenim + ' ms, bez něj ' + bezPrednacteni + ' ms při motoru 1,5 s)');
    jistota(sPrednactenim < 700 && bezPrednacteni >= 1400, 'časy otevření: ' + sPrednactenim + ' / ' + bezPrednacteni + ' ms');
    zpozdeniMotoru.vlakno = 0;
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  await test('pošta: Pracovní bez pošty – místo prázdné stránky proč (přeposílání z WEDOS) a odkaz do Nastavení → Pošta', async () => {
    postaNavic = { pracovni: [] };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="posta"]');
    await page.click('#posta-filtry [data-ucet-posty="pracovni"]');
    await page.waitForSelector('#posta-seznam .posta-prace-prazdna');
    const text = (await page.textContent('#posta-seznam .posta-prace-prazdna')).replace(/\s+/g, ' ');
    jistota(/Za 30 dní nepřišla do Gmailu žádná pracovní pošta/.test(text) && /prace@firma\.test/.test(text) && /WEDOS/.test(text), 'text: ' + text);
    jistota(!/Doručená pošta je prázdná/.test(await page.textContent('#posta-seznam')), 'bez prázdné hlášky navíc');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_pracovni_prazdna.png') });
    await page.click('#posta-seznam [data-posta-navod]');
    await page.waitForSelector('[data-panel="nastaveni"] [data-sekce="posta"] details[data-detail="posta-pracovni"][open]');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    postaNavic = {};
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
    // smazat: bez dotazu hned pryč (Michal 9. 10.), v oznámení Vrátit – poznámka jde do koše na Disku
    await page.click('#p-schranka [data-polozka-akce="smazat"][data-id="c2"]');
    await page.waitForFunction(() => !document.querySelector('#p-schranka [data-polozka-id="c2"]') && /Vrátit/.test(document.getElementById('toast').textContent));
    jistota(!(await page.locator('.okno-pozadi').count()), 'smazání se nemá ptát');
    await cekej(() => volano.some((d) => d.akce === 'schrankaSmazat' && d.id === 'c2'), 3000, 'smazání do motoru');
    await page.click('#toast .toast__akce');
    await page.waitForSelector('#p-schranka [data-polozka-id="c2"]');
    await cekej(() => volano.some((d) => d.akce === 'schrankaObnovit' && d.id === 'c2'), 3000, 'Vrátit do motoru');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    vycistiSchranku();
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

  // ---------- stránka Schránka (Michal 9. 10.: „je taková prázdná“): přehled vpravo, pravé tlačítko na položce
  /** Schránka s úkolem po termínu a na zítra, nápadem a Claudovou odpovědí – pro přehled vpravo. */
  const schrankaPlna = (puvodni) => () => {
    const s = puvodni();
    const c1 = s.ceka.find((p) => p.id === 'c1');
    if (c1) c1.termin = iso(den(-2));
    s.ceka.push({ id: 'c3', slozka: 'CEKA', kdy: ted - 26 * H, odkud: 'aplikace', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Objednat dresy pro dorost', termin: iso(den(1)),
      text: 'Objednat dresy.', vlakno: [] });
    s.ceka.push({ id: 'c5', slozka: 'CEKA', kdy: ted - 50 * H, odkud: 'iPhone', typ: 'napad', stav: 'napad', shrnuti: 'Taktická tabule ve 3D', termin: '', tema: 'fotbal',
      text: 'Nápad: taktická tabule ve 3D.', vlakno: [] });
    s.hotovo = [{ id: 'h1', slozka: 'HOTOVO', kdy: ted - 20 * H, odkud: 'iPhone', typ: 'dotaz', stav: 'hotovo', shrnuti: 'Kolik místností má 2. NP', termin: iso(den(-3)), text: 'Kolik je místností?',
      vlakno: [{ kdo: 'Claude', kdy: iso(ted - 3 * H) + ' 07:30', text: 'Ve 2. NP je 48 místností.' }] }].filter((p) => !smazanoSchranka.has(p.id));
    s.zpracovano = ted - 30 * 6e4;
    return s;
  };
  await test('pc: Schránka ve dvou sloupcích – týden v číslech, moje poznámky, termíny, nápady; pravé tlačítko → Smazat bez dotazu, Vrátit, Hotovo', async () => {
    const puvodni = motor.schranka;
    motor.schranka = schrankaPlna(puvodni);
    try {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, { nazev: 'pc', sirka: 1650, vyska: 1000, dotyk: false });
      await page.goto(WEB);
      await page.click('#rail [data-cil="schranka"]');
      await page.waitForSelector('#sb-tyden .sb-cisla');
      await page.waitForSelector('#sb-moje .moje-polozka');
      // vlevo seznam, vpravo přehled – vedle sebe, nahoře zarovnané
      const r = await page.evaluate(() => {
        const box = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, w: b.width }; };
        return { hlavni: box('.schranka-hlavni'), bok: box('.schranka-bok'), stranka: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      jistota(r.bok.l >= r.hlavni.r && Math.abs(r.bok.t - r.hlavni.t) < 2 && r.bok.w >= 320 && r.hlavni.w > 700 && r.stranka <= 0, 'rozvržení: ' + JSON.stringify(r));
      const tyden = await page.textContent('#sb-tyden');
      jistota(/Zadáno\s*\d+/.test(tyden) && /Vyřízeno\s*1/.test(tyden) && /Čeká\s*3\s*na tebe/.test(tyden) && /Claude naposledy (dnes|včera) \d/.test(tyden), 'týden v číslech: ' + tyden);
      jistota(await page.locator('#sb-tyden .sb-graf__den').count() === 7 && await page.locator('#sb-tyden .sb-graf__sloupec.dnes').count() === 1, 'sloupce po dnech');
      const terminy = await page.locator('#sb-terminy .sb-termin').allTextContents();
      jistota(terminy.length === 2 && /po termínu/.test(terminy[0]) && /lešení/.test(terminy[0]) && /zítra/.test(terminy[1]), 'termíny: ' + JSON.stringify(terminy));
      // nápady ve „Vše“ vpravo, ne v seznamu; ve filtru Nápady v seznamu a karta vpravo pryč
      jistota(await page.locator('#sb-napady [data-polozka-id="c5"]').count() === 1 && !(await page.locator('#schranka-obsah [data-polozka-id="c5"]').count()), 'nápad vpravo');
      jistota(/Koupit žárovky/.test(await page.textContent('#sb-moje')), 'moje poznámky vpravo');
      // vyřízený úkol není „po termínu“
      jistota(!/po termínu/.test(await page.textContent('#schranka-obsah [data-polozka-id="h1"]')), 'vyřízená položka bez „po termínu“');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_schranka_cela.png'), fullPage: true });
      await page.click('#sb-napady [data-sb-filtr="napad"]');
      await page.waitForFunction(() => document.querySelector('#schranka-obsah [data-polozka-id="c5"]') && document.querySelector('#sb-napady').hidden);
      await page.click('#p-schranka [data-filtr-schranky="vse"]');
      // termín → položka rozbalená v seznamu
      await page.click('#sb-terminy [data-sb-polozka="c3"]');
      await page.waitForSelector('#schranka-obsah [data-polozka-id="c3"] .detail');
      await page.waitForTimeout(200); // stránka dojede k položce (posun by otevřenou nabídku zavřel)
      // pravé tlačítko na řádku: nabídka u kurzoru, Esc ji zavře
      await page.click('#schranka-obsah [data-prepni="c1"]', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      const nab = await page.locator('.nabidka [data-nabidka-i]').allTextContents();
      jistota(nab.join('|') === 'Otevřít|Hotovo|Dopsat|Smazat', 'nabídka úkolu: ' + nab.join('|'));
      await page.waitForTimeout(200); // dojede animace
      await page.screenshot({ path: path.join(VYSTUP, 'pc_schranka_nabidka.png') });
      await page.keyboard.press('Escape');
      await page.waitForSelector('.nabidka', { state: 'detached' });
      // Smazat: hned pryč bez okna, Vrátit v oznámení
      await page.click('#schranka-obsah [data-prepni="c1"]', { button: 'right' });
      await page.click('.nabidka [data-nabidka-i="3"]');
      await page.waitForFunction(() => !document.querySelector('#p-schranka [data-polozka-id="c1"]') && /Vrátit/.test(document.getElementById('toast').textContent));
      jistota(!(await page.locator('.okno-pozadi').count()) && !(await page.locator('.nabidka').count()), 'bez dotazu');
      await cekej(() => volano.some((d) => d.akce === 'schrankaSmazat' && d.id === 'c1'), 3000, 'smazání do motoru');
      jistota(!(await page.locator('#sb-terminy [data-sb-polozka="c1"]').count()), 'smazaný úkol zmizí i z termínů');
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#schranka-obsah [data-polozka-id="c1"]');
      await cekej(() => volano.some((d) => d.akce === 'schrankaObnovit' && d.id === 'c1'), 3000, 'Vrátit do motoru');
      // vyřízená položka: bez Hotovo, s Navázat
      await page.click('#schranka-obsah [data-prepni="h1"]', { button: 'right' });
      const nabH = await page.locator('.nabidka [data-nabidka-i]').allTextContents();
      jistota(nabH.join('|') === 'Otevřít|Navázat|Smazat', 'nabídka vyřízené: ' + nabH.join('|'));
      await page.keyboard.press('Escape');
      // Hotovo z nabídky → do motoru, položka mezi vyřízenými
      await page.click('#schranka-obsah [data-prepni="c1"]', { button: 'right' });
      await page.click('.nabidka [data-nabidka-i="1"]');
      await cekej(() => volano.some((d) => d.akce === 'polozka' && d.id === 'c1' && d.jak === 'hotovo'), 3000, 'Hotovo do motoru');
      // v rozbaleném textu odpovědi zůstává nabídka prohlížeče (kopírování) – vlastní se neotevře
      await page.click('#schranka-obsah [data-prepni="h1"]');
      await page.click('#schranka-obsah [data-polozka-id="h1"] .b-claude', { button: 'right' });
      await page.waitForTimeout(150);
      jistota(!(await page.locator('.nabidka').count()), 'v textu odpovědi nabídka prohlížeče');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      motor.schranka = puvodni;
      vycistiSchranku();
    }
  });

  // ---------- Moje poznámky na Dnes (Michal 9. 10.: „poznámka sám pro sebe na později … na hlavní stránce pro mě“)
  await test('pc: Moje poznámky na Dnes – přidat Enterem, Hotovo s Vrátit, pravé tlačítko → Smazat a Vrátit, celý text, ⋯', async () => {
    try {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
      await page.goto(WEB);
      await page.waitForSelector('#dl-moje:not([hidden]) .moje-polozka');
      jistota(/Moje poznámky · 2/.test(await page.textContent('#dl-moje .card-hlava')), 'hlavička s počtem');
      // přidat: Enter v poli, nahoře nová, pole prázdné a s fokusem (další poznámka hned)
      await page.fill('#dl-moje [data-moje-pole]', 'Vyzvednout boty z opravy');
      await page.press('#dl-moje [data-moje-pole]', 'Enter');
      await page.waitForFunction(() => /Vyzvednout boty/.test((document.querySelector('#dl-moje .moje-polozka') || {}).textContent || ''));
      jistota(volano.some((d) => d.akce === 'mojePridat' && d.text === 'Vyzvednout boty z opravy'), 'přidání do motoru');
      jistota(await page.inputValue('#dl-moje [data-moje-pole]') === '' && await page.evaluate(() => document.activeElement.matches('#dl-moje [data-moje-pole]')), 'pole prázdné s fokusem');
      // rozepsaný text přežije překreslení Dnes (data ze serveru, jiná karta) – i s kurzorem
      await page.type('#dl-moje [data-moje-pole]', 'Rozepsáno');
      await page.evaluate(() => import('/js/stav.js').then((m) => m.zmeneno()));
      await page.waitForTimeout(50);
      jistota(await page.inputValue('#dl-moje [data-moje-pole]') === 'Rozepsáno' && await page.evaluate(() => document.activeElement.matches('#dl-moje [data-moje-pole]')), 'rozepsaný text po překreslení');
      await page.fill('#dl-moje [data-moje-pole]', '');
      const nova = volano.filter((d) => d.akce === 'mojePridat').length;
      // Hotovo: kroužek → hned pryč, Vrátit
      const id = await page.getAttribute('#dl-moje .moje-polozka', 'data-moje-id');
      await page.click('#dl-moje [data-moje-hotovo="' + id + '"]');
      await page.waitForFunction((i) => !document.querySelector('#dl-moje [data-moje-id="' + i + '"]') && /Vrátit/.test(document.getElementById('toast').textContent), id);
      await cekej(() => volano.some((d) => d.akce === 'mojeHotovo' && d.id === id && !d.zpet), 3000, 'hotovo do motoru');
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#dl-moje [data-moje-id="' + id + '"]');
      await cekej(() => volano.some((d) => d.akce === 'mojeHotovo' && d.id === id && d.zpet), 3000, 'Vrátit hotovo');
      // pravé tlačítko → Smazat (bez dotazu) → Vrátit = obnovit z koše
      await page.click('#dl-moje [data-moje-id="moje-a"] .moje-obsah', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      const nab = await page.locator('.nabidka [data-nabidka-i]').allTextContents();
      jistota(nab.join('|') === 'Hotovo|Předat Claudovi|Kopírovat text|Smazat', 'nabídka mé poznámky: ' + nab.join('|'));
      await page.waitForTimeout(200); // dojede animace
      await page.screenshot({ path: path.join(VYSTUP, 'pc_dnes_moje_nabidka.png') });
      await page.click('.nabidka [data-nabidka-i="3"]');
      await page.waitForFunction(() => !document.querySelector('#dl-moje [data-moje-id="moje-a"]'));
      jistota(!(await page.locator('.okno-pozadi').count()), 'smazání se nemá ptát');
      await cekej(() => volano.some((d) => d.akce === 'mojeSmazat' && d.id === 'moje-a'), 3000, 'smazání do motoru');
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#dl-moje [data-moje-id="moje-a"]');
      await cekej(() => volano.some((d) => d.akce === 'schrankaObnovit' && d.id === 'moje-a'), 3000, 'obnovit z koše');
      // klepnutí na text = celý text s odkazem; ⋯ otevře stejnou nabídku
      await page.click('#dl-moje [data-moje-id="moje-b"] .moje-obsah');
      await page.waitForSelector('#dl-moje [data-moje-id="moje-b"] .moje-text--cely a[href="https://example.com/pneu"]');
      await page.hover('#dl-moje [data-moje-id="moje-a"]');
      await page.click('#dl-moje [data-moje-id="moje-a"] [data-moje-nabidka]');
      await page.waitForSelector('.nabidka.videt');
      await page.click('#hlava', { position: { x: 5, y: 5 } }); // klepnutí vedle nabídku zavře
      await page.waitForSelector('.nabidka', { state: 'detached' });
      // Předat Claudovi: nová poznámka do schránky, moje do hotových
      await page.click('#dl-moje [data-moje-id="moje-a"] .moje-obsah', { button: 'right' });
      await page.click('.nabidka [data-nabidka-i="1"]');
      await cekej(() => volano.some((d) => d.akce === 'poznamka' && d.text === 'Koupit žárovky do garáže') &&
        volano.some((d) => d.akce === 'mojeHotovo' && d.id === 'moje-a' && !d.zpet), 3000, 'předat Claudovi');
      await page.waitForFunction(() => !document.querySelector('#dl-moje [data-moje-id="moje-a"]'));
      jistota(volano.filter((d) => d.akce === 'mojePridat').length === nova, 'nic navíc nepřidáno');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_dnes_moje.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      vycistiSchranku();
    }
  });

  await test('telefon: + → Moje poznámka, dlouhé podržení = nabídka (moje poznámka i úkol na Dnes), Schránka pod sebou', async () => {
    try {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
      await page.goto(WEB);
      await page.waitForSelector('#dl-moje:not([hidden]) .moje-polozka');
      // + v liště → Moje poznámka → okno s polem
      await page.click('#lista [data-rychle]');
      await page.click('[data-panel="rychle"] [data-rychle-akce="moje"]');
      await page.waitForSelector('.okno-pozadi.videt .okno__pole textarea');
      await page.fill('.okno-pozadi .okno__pole textarea', 'Zavolat babičce v neděli');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await cekej(() => volano.some((d) => d.akce === 'mojePridat' && d.text === 'Zavolat babičce v neděli'), 3000, 'z okna do motoru');
      await page.waitForFunction(() => /Zavolat babičce/.test(document.querySelector('#dl-moje').textContent));
      // dlouhé podržení prstu na mé poznámce → nabídka; klepnutí po podržení poznámku nerozbalí
      const podrz = async (sel) => {
        await page.locator(sel).first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(100); // posun dojede (posun stránky nabídku zavírá)
        const b = await page.locator(sel).first().boundingBox();
        const bod = { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
        await page.locator(sel).first().dispatchEvent('pointerdown', bod);
        await page.waitForTimeout(650);
        await page.locator(sel).first().dispatchEvent('pointerup', bod);
        await page.locator(sel).first().dispatchEvent('click');
      };
      await podrz('#dl-moje [data-moje-id="moje-b"] .moje-obsah');
      await page.waitForSelector('.nabidka.videt');
      jistota(await page.getAttribute('#dl-moje [data-moje-id="moje-b"] .moje-obsah', 'aria-expanded') === 'false', 'klepnutí po podržení nemá rozbalit');
      const r = await page.evaluate(() => { const b = document.querySelector('.nabidka').getBoundingClientRect(); return [b.left, b.right, innerWidth]; });
      jistota(r[0] >= 0 && r[1] <= r[2], 'nabídka na obrazovce: ' + r.join());
      await page.waitForTimeout(200); // dojede animace
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_moje_nabidka.png') });
      await page.tap('.nabidka [data-nabidka-i="0"]'); // Hotovo
      await cekej(() => volano.some((d) => d.akce === 'mojeHotovo' && d.id === 'moje-b'), 3000, 'hotovo z nabídky');
      // úkol ve Vyžaduje pozornost: podržení → Otevřít / Hotovo / Dopsat / Smazat; posun stránky nabídku zavře
      await podrz('.pozornost [data-ukaz-polozku="c1"]');
      await page.waitForSelector('.nabidka.videt');
      jistota(/Smazat/.test(await page.textContent('.nabidka')) && /Otevřít/.test(await page.textContent('.nabidka')), 'nabídka úkolu na telefonu');
      await page.evaluate(() => window.scrollBy(0, 40));
      await page.waitForSelector('.nabidka', { state: 'detached' });
      // krátké klepnutí nabídku neotevře
      await page.tap('#dl-moje [data-moje-id="moje-a"] .moje-obsah');
      await page.waitForTimeout(600);
      jistota(!(await page.locator('.nabidka').count()), 'klepnutí není podržení');
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_dnes_moje.png'), fullPage: true });
      // Schránka na telefonu: přehled pod seznamem, nic nepřetéká
      await page.click('.lista__btn[data-cil="schranka"]');
      await page.waitForSelector('#sb-moje:not([hidden]) .moje-polozka');
      const s = await page.evaluate(() => ({ seznam: document.querySelector('.schranka-hlavni').getBoundingClientRect().bottom,
        bok: document.querySelector('.schranka-bok').getBoundingClientRect().top, pretika: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      jistota(s.bok >= s.seznam && s.pretika <= 0, 'telefon: ' + JSON.stringify(s));
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_schranka_cela.png'), fullPage: true });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      vycistiSchranku();
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
      jistota(await page.locator('#p-zdravi .graf14 .graf14__sl').count() === 14, 'graf 14 dní');
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

  // ---------- Zdraví: karty ve sloupcích podle výšky (Michal 9. 10.: „stále v jedné stejné výšce“) – žádná se nenatahuje na
  // výšku sousední; PC (Michalův monitor ~1650 px) 2 sloupce, od 1700 px 3, telefon 1; snímky světlý i tmavý režim
  const ZDRAVI_VELIKOSTI = [{ nazev: 'pc1650', sirka: 1650, vyska: 1000, sloupcu: 2 }, { nazev: 'pc1800', sirka: 1800, vyska: 1000, sloupcu: 3 },
    { nazev: 'ipad-sirka', sirka: 1180, vyska: 820, dotyk: true, sloupcu: 2 }, { nazev: 'ipad-vyska', sirka: 820, vyska: 1180, dotyk: true, sloupcu: 1 },
    { nazev: 'telefon', sirka: 390, vyska: 844, dotyk: true, sloupcu: 1 }];
  for (const v of ZDRAVI_VELIKOSTI) {
    for (const motiv of v.nazev === 'pc1650' || v.nazev === 'telefon' ? ['light', 'dark'] : ['light']) {
      await test('Zdraví ' + v.nazev + (motiv === 'dark' ? ' tmavý' : '') + ': karty podle své výšky (' + v.sloupcu + ' sloupce), nic nepřetéká, týden od Clauda', async () => {
        tydenniMock = { tyden: '2026-W41', od: iso(den(-6)), do: iso(den(0)), kdy: ted, odeslano: true,
          text: 'Dobrý týden – **bílkoviny** u cíle ve třech dnech.\n\n- víc vody\n- <b>ne HTML</b>' };
        vahaZaznamy = [{ kdy: den(-9, 7), kg: 74.1 }, { kdy: den(-6, 7.2), kg: 73.8 }, { kdy: den(-3, 21), kg: 74.6 }, { kdy: den(-1, 6.9), kg: 73.4 }];
        const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, motiv);
        try {
          await page.goto(WEB);
          await page.waitForSelector('#aplikace:not([hidden])');
          await page.click(v.sirka >= 760 ? '#rail [data-cil="zdravi"]' : '.hlava-ja [data-cil="zdravi"]');
          await page.waitForSelector('#p-zdravi .zd-tyden .tyden-claude');
          const t = await page.innerHTML('#p-zdravi .tyden-claude');
          jistota(/<b>bílkoviny<\/b>/.test(t) && /<li>víc vody<\/li>/.test(t) && /&lt;b&gt;ne HTML/.test(t), 'týden od Clauda (tučně, odrážky, bez HTML): ' + t);
          jistota(/odešlo i e-mailem/.test(await page.textContent('#p-zdravi .zd-tyden')), 'štítek e-mailu');
          const mira = await page.evaluate(() => {
            const m = document.querySelector('#p-zdravi .zdravi-mrizka-karet');
            const karty = Array.from(m.children);
            // mezera mezi spodkem obsahu karty a spodkem karty – natažená karta má velkou prázdnou plochu
            const prazdno = karty.map((k) => {
              const obsah = Array.from(k.querySelectorAll(':scope > :not(.dlazdice__telo), .dlazdice__telo > *')).filter((x) => x.getClientRects().length);
              const dole = Math.max.apply(null, obsah.map((x) => x.getBoundingClientRect().bottom));
              return [k.className.split(' ').pop(), Math.round(k.getBoundingClientRect().bottom - dole)];
            });
            const sloupce = new Set(karty.map((k) => Math.round(k.getBoundingClientRect().left))).size;
            return { prazdno, sloupce, pretika: document.documentElement.scrollWidth - document.documentElement.clientWidth };
          });
          jistota(mira.pretika <= 0, 'přetéká o ' + mira.pretika + ' px');
          jistota(mira.sloupce === v.sloupcu, 'sloupců ' + mira.sloupce + ', čekám ' + v.sloupcu);
          jistota(mira.prazdno.every((x) => x[1] <= 28), 'karta natažená přes obsah: ' + JSON.stringify(mira.prazdno));
          await page.screenshot({ path: path.join(VYSTUP, 'zdravi_' + v.nazev + (motiv === 'dark' ? '_tmavy' : '') + '.png'), fullPage: true });
          jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
        } finally {
          await ctx.close();
          tydenniMock = null;
          vahaZaznamy = [];
        }
      });
    }
  }

  // ---------- grafy: bublina s hodnotou (Michal 9. 10.: „kolik to byla … a který měsíc“) – myš, klepnutí, klávesnice, nepřetéká
  await test('grafy Zdraví: bublina při najetí (den, připravenost, zátěž), u váhy kg a rozdíl, klávesnicí šipkami, pití týden', async () => {
    vahaZaznamy = [{ kdy: den(-6, 7), kg: 73.8 }, { kdy: den(-1, 7), kg: 73.4 }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="zdravi"]');
      await page.waitForSelector('#p-zdravi .graf14 .graf14__den');
      const bublina = () => page.evaluate(() => { const b = document.getElementById('graf-bublina'); if (!b || b.hidden) return null;
        const r = b.getBoundingClientRect(); return { text: b.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom }; });
      // najetí myší na dnešní den (poslední sloupec)
      await page.locator('#p-zdravi .graf14 .graf14__den').last().hover();
      let b = await bublina();
      jistota(b && /dnes/.test(b.text) && /připravenost 72 %/.test(b.text) && /zátěž 6,2/.test(b.text) && /spánek 6:30/.test(b.text), 'bublina dne: ' + JSON.stringify(b));
      jistota(await page.locator('#p-zdravi .graf14 [title], #p-zdravi .graf14 title').count() === 0, 'bez starých title (dvojí bublina)');
      await page.mouse.move(5, 5);
      await page.waitForFunction(() => document.getElementById('graf-bublina').hidden);
      // váha: bod s kg, časem a rozdílem proti minulému rannímu vážení
      await page.locator('#zd-vaha .graf-vahy .graf-bod circle').last().hover();
      b = await bublina();
      jistota(b && /73,4 kg/.test(b.text) && /ráno/.test(b.text) && /−0,4 kg proti/.test(b.text) && /plán/.test(b.text), 'bublina váhy: ' + JSON.stringify(b));
      // klávesnice: Tab na graf 14 dní, šipka vlevo = včerejšek
      await page.mouse.move(5, 5);
      await page.focus('#p-zdravi .graf14');
      await page.keyboard.press('ArrowLeft'); // focus() z testu není „z klávesnice“ – šipka bublinu ukáže
      b = await bublina();
      jistota(b && /připravenost 55 %/.test(b.text) && !/dnes/.test(b.text), 'šipka na včerejšek: ' + JSON.stringify(b));
      jistota(/připravenost 55 %/.test(await page.textContent('.graf-hlaseni')), 'čtečce obrazovky');
      await page.keyboard.press('Escape');
      jistota(!(await bublina()), 'Esc schová');
      // pití týden: bublina s litry a procentem cíle
      await page.hover('#p-zdravi .piti__tyden li.dnes');
      b = await bublina();
      jistota(b && /dnes/.test(b.text) && / l/.test(b.text) && /% cíle/.test(b.text), 'pití: ' + JSON.stringify(b));
      await page.screenshot({ path: path.join(VYSTUP, 'pc_zdravi_bublina.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      vahaZaznamy = [];
    }
  });

  await test('grafy na telefonu: klepnutí ukáže bublinu, nepřetéká z obrazovky, klepnutí jinam ji schová', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark');
    try {
      await page.goto(WEB);
      await page.click('.hlava-ja [data-cil="zdravi"]');
      await page.waitForSelector('#p-zdravi .graf14 .graf14__den');
      const dny = page.locator('#p-zdravi .graf14 .graf14__den');
      for (const den14 of [dny.last(), dny.first()]) {
        await den14.scrollIntoViewIfNeeded();
        await den14.tap();
        const b = await page.evaluate(() => { const x = document.getElementById('graf-bublina'); const r = x.getBoundingClientRect();
          return { hidden: x.hidden, l: r.left, r: r.right, sirka: document.documentElement.clientWidth, text: x.textContent }; });
        jistota(!b.hidden && b.l >= 8 && b.r <= b.sirka - 8, 'bublina na obrazovce: ' + JSON.stringify(b));
      }
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_zdravi_bublina.png') });
      await page.tap('#p-zdravi .zdravi-paticka');
      await page.waitForFunction(() => document.getElementById('graf-bublina').hidden);
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  await test('Zdraví v ukázkovém režimu: týden od Clauda, hlavní a ostatní doplňky, bublina u grafu (bez motoru)', async () => {
    const ctx = await prohlizec.newContext(Object.assign({ viewport: { width: 1650, height: 1000 } }, PRAHA));
    await ctx.addInitScript(() => localStorage.setItem('asistent.pripojeni', JSON.stringify({ demo: true })));
    const page = await ctx.newPage();
    const chyby = [];
    page.on('pageerror', (e) => chyby.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="zdravi"]');
      await page.waitForSelector('#p-zdravi .zd-tyden .tyden-claude li');
      jistota(await page.locator('#p-zdravi .zd-doplnky .doplnky__oddel').count() === 1 &&
        await page.locator('#p-zdravi .zd-doplnky .doplnek--vedlejsi').count() >= 1, 'ostatní doplňky pod čarou');
      await page.locator('#p-zdravi .graf14 .graf14__den').nth(10).hover();
      jistota(/připravenost \d+ %/.test(await page.textContent('#graf-bublina')), 'bublina v ukázce');
      await page.screenshot({ path: path.join(VYSTUP, 'ukazka_zdravi.png'), fullPage: true });
      jistota(!chyby.length, 'chyby stránky: ' + chyby.join(' | '));
    } finally {
      await ctx.close();
    }
  });

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

  // ---------- Doplňky zpětně: šipka na minulý týden (den v pásku) → odškrtnutí k tomu dni, tlačítko Dnes zpět
  await test('Doplňky zpětně: minulý den, odškrtnutí k tomu dni, zpět na dnešek', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-doplnky:not([hidden]) .doplnky-tyden');
    jistota(await page.locator('#dl-doplnky .doplnky-tyden__sipka[aria-label="Další týden"][disabled]').count() === 1, 'v tomto týdnu dál nejde');
    const pred = new Date(ted); pred.setDate(pred.getDate() - 7);
    const den = iso(pred.getTime());
    await page.click('#dl-doplnky .doplnky-tyden__sipka[aria-label="Předchozí týden"]');
    await page.waitForSelector('#dl-doplnky [data-doplnek="horcik"][data-doplnek-den="' + den + '"]');
    const hlava = await page.textContent('#dl-doplnky .card-hlava');
    jistota(!/Doplňky dnes/.test(hlava) && /Dnes/.test(hlava), 'nadpis s minulým dnem a tlačítko Dnes: ' + hlava);
    jistota(await page.locator('#dl-doplnky .doplnky-tyden li.vybrany [data-doplnky-ukaz="' + den + '"]').count() === 1, 'vybraný den v pásku');
    jistota(!/Tento týden/.test(await page.textContent('#dl-doplnky .doplnky-tyden')), 'minulý týden má místo „Tento týden“ data');
    const pocet = doplnkyVolani.length;
    await page.click('#dl-doplnky [data-doplnek="horcik"]');
    await page.waitForSelector('#dl-doplnky [data-doplnek="horcik"][aria-pressed="true"]');
    for (let i = 0; i < 50 && doplnkyVolani.length === pocet; i++) await page.waitForTimeout(100);
    jistota(JSON.stringify(doplnkyVolani.slice(pocet)) === JSON.stringify([{ den, zmeny: { horcik: true } }]), 'zpětně do motoru: ' + JSON.stringify(doplnkyVolani.slice(pocet)));
    await page.locator('#dl-doplnky').screenshot({ path: path.join(VYSTUP, 'pc_doplnky_zpetne.png') });
    // tlačítko Dnes: zpátky na dnešek, dnešní hořčík zůstal neodškrtnutý
    await page.click('#dl-doplnky [data-doplnky-ukaz="dnes"]');
    await page.waitForSelector('#dl-doplnky [data-doplnek="horcik"][data-doplnek-den="' + iso(ted) + '"][aria-pressed="false"]');
    jistota(/Doplňky dnes/.test(await page.textContent('#dl-doplnky .card-hlava')), 'nadpis zpět na dnes');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- hlavní doplňky (Michal 9. 10.: podstatné jsou jen některé, „dál se to nemusí započítávat“):
  // ZDRAVI_REZIM.json → hlavni; ostatní se ukazují šedě pod čarou, jdou odškrtnout, ale do plnění se nepočítají
  await test('hlavní doplňky: do plnění (zbývá, vše ✓, týden) jen hlavní, ostatní šedě pod čarou', async () => {
    rezimHlavni = ['kreatin'];
    const dnesIso = iso(ted), drive = doplnkyDny[dnesIso];
    doplnkyDny[dnesIso] = { kreatin: true };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-doplnky:not([hidden]) .doplnky__oddel');
      const poradi = await page.$$eval('#dl-doplnky [data-doplnek]', (b) => b.map((x) => x.dataset.doplnek + (x.classList.contains('doplnek--vedlejsi') ? '(ostatní)' : '')).join());
      jistota(poradi === 'kreatin,horcik(ostatní)', 'hlavní nahoře, ostatní pod čarou: ' + poradi);
      jistota(/vše ✓/.test(await page.textContent('#dl-doplnky .card-hlava')), 'hořčík nevzatý, a přesto vše ✓ (nepočítá se)');
      jistota(await page.locator('#dl-doplnky .doplnky-tyden li.dnes.plny').count() === 1, 'dnešek v týdnu plný');
      await page.locator('#dl-doplnky').screenshot({ path: path.join(VYSTUP, 'pc_doplnky_hlavni.png') });
      // odškrtnout jde i ostatní; zrušit hlavní → zbývá 1
      await page.click('#dl-doplnky [data-doplnek="horcik"]');
      await page.waitForSelector('#dl-doplnky [data-doplnek="horcik"][aria-pressed="true"]');
      await page.click('#dl-doplnky [data-doplnek="kreatin"]');
      await page.waitForSelector('#dl-doplnky [data-doplnek="kreatin"][aria-pressed="false"]');
      jistota(/zbývá 1/.test(await page.textContent('#dl-doplnky .card-hlava')), 'zbývá jen hlavní: ' + await page.textContent('#dl-doplnky .card-hlava'));
      const den = await page.getAttribute('#dl-doplnky .doplnky-tyden li.dnes > *', 'aria-label');
      jistota(/0 z 1 hlavních/.test(den), 'den v týdnu: ' + den);
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      rezimHlavni = null;
      if (drive) doplnkyDny[dnesIso] = drive; else delete doplnkyDny[dnesIso];
    }
  });

  // ---------- kalendář: co ukazovat (zaškrtnutí, jen tento – jen v Kalendáři) a sekce Svátky: hromadné přidání oblíbených
  // (vymyšlená jména: domácký tvar, výběr u nejednoznačného, jméno bez svátku, duplicita, doplnění vztahu) jedním uložením
  await test('kalendář: zaškrtávání kalendářů, jen tento; Svátky – hromadné přidání oblíbených (domácké tvary, výběr, bez svátku, bez duplicit), zaškrtnutí sekce', async () => {
    jmeninyOblibeni = [{ jmeno: 'Josef', kdo: '' }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.click('#rail [data-cil="kalendar"]');
    await page.click('#p-kalendar [data-kal-pohled="seznam"]');
    await page.waitForSelector('#p-kalendar [data-udalost^="u2|"]');
    // okno Kalendáře: schovat Osobní → v Kalendáři zůstane Rodina
    await page.click('#p-kalendar .kal-lista [data-kal-zobrazeni]');
    await page.waitForSelector('[data-panel="kal-zobrazeni"] [data-kal-viditelny="g1"]');
    await page.uncheck('[data-panel="kal-zobrazeni"] [data-kal-viditelny="g1"]');
    await page.waitForFunction(() => !document.querySelector('#p-kalendar [data-udalost^="u4|"]'));
    jistota(await page.locator('#p-kalendar [data-udalost^="u2|"]').count() > 0, 'Rodina zůstává');
    jistota(/1\/2/.test(await page.textContent('#p-kalendar .kal-zobrazeni-btn')), 'počet ukazovaných na tlačítku');
    // jen tento = jen Osobní
    await page.click('[data-panel="kal-zobrazeni"] [data-kal-jen="g1"]');
    await page.waitForFunction(() => !document.querySelector('#p-kalendar [data-udalost^="u2|"]') && document.querySelector('#p-kalendar [data-udalost^="u4|"]'));
    // nejbližší jednoslovné jméno z kalendáře (dnes nebo pár dní) – napsané bez diakritiky, se vztahem
    const svatek = await page.evaluate(() => import('/js/jmeniny.js').then((m) => {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      let t = d.getTime();
      for (let i = 0; i < 10; i++, t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i).getTime()) {
        const j = m.hlavniJmeno(t);
        if (/^\p{L}+$/u.test(j) && ['Josef', 'Veronika', 'Alexandra'].indexOf(j) < 0) return { den: t, jmeno: j, bez: m.bezDiakritiky(j) };
      }
      return null;
    }));
    const O = '[data-panel="kal-zobrazeni"] ';
    const ulozeni = () => volano.filter((d) => d.akce === 'jmeninyUlozit').length;
    const pred = ulozeni();
    await page.fill(O + '[data-jmeniny-hromadne]', 'Pepa (děda), Verča, Saša – kolegyně, Xyzzy, ' + svatek.bez + ' (kamarád), Verča');
    await page.waitForSelector(O + '.jn--nezname');
    const radky = await page.$$eval(O + '.jn__radek', (li) => li.map((x) => ({ stav: x.className.replace('jn__radek jn--', ''),
      text: x.querySelector('.jn__text').textContent.replace(/\s+/g, ' ').trim(), den: (x.querySelector('.jn__den') || {}).textContent || '' })));
    const radek = (i) => JSON.stringify(radky[i]);
    jistota(radky.length === 6, 'řádky náhledu: ' + JSON.stringify(radky));
    jistota(radky[0].stav === 'doplnit' && /^Pepa → Josef/.test(radky[0].text) && /děda/.test(radky[0].text) && radky[0].den === '19. 3.', 'Pepa → Josef (doplní vztah): ' + radek(0));
    jistota(radky[1].stav === 'pridat' && /^Verča → Veronika/.test(radky[1].text), 'Verča → Veronika: ' + radek(1));
    jistota(radky[2].stav === 'vyber' && /^Saša/.test(radky[2].text) && await page.locator(O + '.jn--vyber [data-jmeno="Alexandra"]').count() === 1, 'Saša – výběr: ' + radek(2));
    jistota(radky[3].stav === 'nezname' && /^Xyzzy – v kalendáři jmen není, svátek nemá/.test(radky[3].text), 'Xyzzy bez svátku: ' + radek(3));
    jistota(radky[4].stav === 'pridat' && radky[4].text.indexOf(svatek.jmeno) === 0 && /kamarád/.test(radky[4].text), 'jméno bez diakritiky: ' + radek(4));
    jistota(radky[5].stav === 'uz-je', 'druhá Verča už je: ' + radek(5));
    jistota(/1× vyber jméno · 1× bez svátku · 1× už je/.test(await page.textContent(O + '[data-jmeniny-souhrn]')), 'souhrn');
    await page.click(O + '.jn--vyber [data-jmeno="Alexandra"]');
    await page.waitForFunction((o) => !document.querySelector(o + '.jn--vyber'), O);
    jistota(/Přidat 3 a doplnit 1/.test(await page.textContent(O + '[data-jmeniny-pridat]')), 'tlačítko: ' + await page.textContent(O + '[data-jmeniny-pridat]'));
    await page.screenshot({ path: path.join(VYSTUP, 'pc_kalendar_zobrazeni.png') });
    await page.click(O + '[data-jmeniny-pridat]');
    await page.waitForFunction(() => /Přidáno: Josef, Veronika, Alexandra, .* · nepřidáno: Xyzzy/.test(document.getElementById('toast').textContent));
    jistota(ulozeni() === pred + 1, 'jedno uložení do motoru');
    jistota(JSON.stringify(jmeninyOblibeni) === JSON.stringify([{ jmeno: 'Josef', kdo: 'děda' }, { jmeno: 'Veronika', kdo: '' }, { jmeno: 'Alexandra', kdo: 'kolegyně' },
      { jmeno: svatek.jmeno, kdo: 'kamarád' }]), 'oblíbení do motoru: ' + JSON.stringify(jmeninyOblibeni));
    // po uložení zůstane v poli jen to, co přidat nešlo (jméno bez svátku); stejné jméno znovu = už je (tlačítko nejde)
    await page.waitForFunction((o) => document.querySelector(o + '[data-jmeniny-hromadne]').value === 'Xyzzy' && document.querySelectorAll(o + '.jmeniny-oblibeni li').length === 4, O);
    jistota(await page.locator(O + '.jn--nezname').count() === 1, 'náhled zbylého jména');
    jistota(await page.locator(O + '.jmeniny-oblibeni li.jo--brzy', { hasText: '★ ' + svatek.jmeno }).count() === 1, 'blízký svátek v seznamu zvýrazněný');
    await page.fill(O + '[data-jmeniny-hromadne]', 'verca');
    await page.waitForSelector(O + '.jn--uz-je');
    jistota(await page.isDisabled(O + '[data-jmeniny-pridat]'), 'duplicitu nejde přidat');
    // sekce Svátky v okně: vypnout jmeniny → v měsíci zůstane jen oblíbený (★ čip)
    await page.click(O + '[data-kal-vse]');
    await page.uncheck(O + '[data-kal-svatky="jmeniny"]');
    await page.click(O + '[data-zavrit-panel]');
    await page.click('#p-kalendar [data-kal-pohled="mesic"]');
    const bunka = '#p-kalendar .mesic-den[data-den="' + svatek.den + '"]';
    await page.waitForSelector(bunka + ' .cip-svatek');
    jistota((await page.textContent(bunka + ' .cip-svatek')).indexOf('★ ' + svatek.jmeno) >= 0, 'hvězdička v měsíci');
    jistota(await page.locator('#p-kalendar .mesic-den .svatek--bunka').count() === 0, 'jmeniny skryté');
    // boční panel: sekce Svátky se stejným zaškrtnutím; jmeniny zpět
    jistota(!(await page.isChecked('.kal-boc [data-kal-svatky="jmeniny"]')) && await page.isChecked('.kal-boc [data-kal-svatky="oblibeni"]'), 'Svátky v bočním panelu');
    await page.check('.kal-boc [data-kal-svatky="jmeniny"]');
    await page.waitForSelector('#p-kalendar .mesic-den .svatek--bunka');
    jistota(!(await page.locator(bunka + ' .svatek--bunka').count()), 'u oblíbeného jen čip, ne i šedé jméno');
    // vybraný den: oblíbený jako celodenní řádek sekce Svátky
    await page.click(bunka);
    await page.waitForSelector('#p-kalendar .kal-den .udalost--svatek');
    jistota(/★ .*kamarád · Svátky/.test(await page.textContent('#p-kalendar .kal-den .udalost--svatek')), 'řádek Svátky v seznamu dne');
    await page.waitForSelector('#p-kalendar [data-udalost^="u2|"]', { state: 'attached' });
    await page.screenshot({ path: path.join(VYSTUP, 'pc_kalendar_jmeniny.png') });
    // oblíbení vypnutí → bez hvězdičky, jméno je zase šedé
    await page.uncheck('.kal-boc [data-kal-svatky="oblibeni"]');
    await page.waitForFunction((b) => !document.querySelector('#p-kalendar .cip-svatek') && document.querySelector(b + ' .svatek--bunka'), bunka);
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    jmeninyOblibeni = [];
  });

  // ---------- Dnes: týden se svátkem u každého dne (i bez událostí), oblíbený ★ výrazně; kalendář: Brzy má svátek, celý den, Seznam
  const jmeninyModul = () => import(require('url').pathToFileURL(path.join(KOREN, 'js', 'jmeniny.js')).href);
  /** Vymyšlený oblíbený: první den za od…od+6 dní s jednoslovným jménem (bez státních svátků a dvojic). */
  const oblibenyZa = async (od) => {
    const jm = await jmeninyModul();
    let za = od;
    while (za < od + 6 && !/^\p{L}+$/u.test(jm.hlavniJmeno(den(za)))) za++;
    return { jm, za, jmeno: jm.hlavniJmeno(den(za)) };
  };
  /** Vymyšlený oblíbený s druhým jménem dne (jako Elza vedle Elišky): první takový den za od…od+13 dní kromě dne krome. */
  const druheJmenoZa = async (od, krome) => {
    const jm = await jmeninyModul();
    for (let i = od; i < od + 14; i++) {
      const z = jm.jmeninyDne(den(i)).split(/,\s*/).map((x) => x.trim());
      if (i !== krome && z.length >= 2 && /^\p{L}+$/u.test(z[0]) && /^\p{L}+$/u.test(z[1])) return { za: i, jmeno: z[1], hlavni: z[0] };
    }
    return null;
  };
  await test('Dnes: týden se svátky u všech 7 dní, oblíbení ★ (i druhé jméno dne); kalendář – Brzy má svátek, celý den v týdnu, Seznam', async () => {
    const { jm, za, jmeno } = await oblibenyZa(3);
    // druhý vymyšlený oblíbený má druhé jméno dne (jako Elza vedle Elišky) – svátek se musí poznat i tak
    const druhe = await druheJmenoZa(0, za);
    jmeninyOblibeni = [{ jmeno, kdo: 'kamarádka' }].concat(druhe ? [{ jmeno: druhe.jmeno, kdo: 'sousedka' }] : []);
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-tyden .agenda__svatek--oblibeny');
    jistota(await page.locator('#dl-tyden .agenda__den').count() === 7, 'sedm dní');
    const svatky = await page.$$eval('#dl-tyden .agenda__den', (li) => li.map((x) => ((x.querySelector('.agenda__svatek') || {}).textContent || '')));
    let oblibenychDnu = 0;
    for (let i = 0; i < 7; i++) {
      const obl = jm.oblibeniDne(den(i), jmeninyOblibeni);
      if (obl.length) oblibenychDnu++;
      const cekam = obl.length ? '★ ' + obl.map((o) => o.jmeno + ' (' + o.kdo + ')').join(', ') : jm.hlavniJmeno(den(i));
      jistota(svatky[i] === cekam, 'den ' + i + ': „' + svatky[i] + '“ místo „' + cekam + '“');
    }
    jistota(svatky[za].indexOf('★ ' + jmeno + ' (kamarádka)') === 0, 'oblíbený v týdnu: ' + svatky[za]);
    if (druhe && druhe.za < 7) jistota(svatky[druhe.za].indexOf('★ ' + druhe.jmeno + ' (sousedka)') === 0, 'druhé jméno dne v týdnu: ' + svatky[druhe.za]);
    jistota(await page.locator('#dl-tyden .agenda__den--oblibeny .agenda__svatek--oblibeny').count() === oblibenychDnu, 'oblíbení zvýraznění');
    jistota(await page.locator('#dl-tyden .agenda__den--volny').count() >= 3, 'dny bez událostí jen s řádkem svátku');
    jistota(await page.locator('#dl-tyden .agenda__u').count() >= 2, 'události zůstaly');
    await page.locator('#dl-tyden').screenshot({ path: path.join(VYSTUP, 'pc_dnes_tyden_svatky.png') });
    // klepnutí na den → kalendář na tom dni
    await page.locator('#dl-tyden .agenda__den').nth(za).locator('.agenda__den-btn').click();
    await page.waitForSelector('#p-kalendar .kal-lista');
    await page.click('#p-kalendar [data-kal-pohled="mesic"]');
    await page.waitForSelector('#p-kalendar .mesic-den[data-den="' + den(za) + '"][aria-current="date"] .cip-svatek');
    // Brzy má svátek (boční panel): ★ jméno, vztah, za kolik dní
    const brzy = (await page.textContent('.kal-boc .karta-brzy')).replace(/\s+/g, ' ');
    jistota(brzy.indexOf('★ ' + jmeno) >= 0 && brzy.indexOf('kamarádka') >= 0 && /za \d+ (dny|dní)/.test(brzy), 'Brzy má svátek: ' + brzy);
    if (druhe) jistota(brzy.indexOf('★ ' + druhe.jmeno) >= 0 && brzy.indexOf('sousedka') >= 0, 'druhé jméno dne v Brzy má svátek: ' + brzy);
    // týden: oblíbený jako celodenní čip
    const cip = (j) => page.locator('#p-kalendar .cas-celodenni .cip-svatek', { hasText: new RegExp('^★ ' + j + '$') });
    await page.click('#p-kalendar [data-kal-pohled="tyden"]');
    await cip(jmeno).waitFor();
    await page.screenshot({ path: path.join(VYSTUP, 'pc_kalendar_svatky_tyden.png') });
    // Seznam: den oblíbeného má řádek sekce Svátky
    await page.click('#p-kalendar [data-kal-pohled="seznam"]');
    await page.locator('#p-kalendar .udalost--svatek', { hasText: 'kamarádka · Svátky' }).waitFor();
    if (druhe) await page.locator('#p-kalendar .udalost--svatek', { hasText: 'sousedka · Svátky' }).waitFor();
    // měsíc, dnešek; klepnutí v Brzy má svátek vybere den svátku
    const brzyRadek = (j) => page.locator('.kal-boc .brzy__radek').filter({ has: page.locator('.brzy__kdo b', { hasText: new RegExp('^★ ' + j + '$') }) });
    await page.click('#p-kalendar [data-kal-pohled="mesic"]');
    await page.click('#p-kalendar [data-kal="dnes"]');
    await page.waitForSelector('#p-kalendar .mesic-den.dnes[aria-current="date"]');
    await brzyRadek(jmeno).click();
    await page.waitForSelector('#p-kalendar .mesic-den[data-den="' + den(za) + '"][aria-current="date"]');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_kalendar_svatky.png') });
    if (druhe) {
      // druhé jméno dne: v měsíci ★ čip a žádné šedé hlavní jméno (to je jen u dne bez oblíbeného)
      await brzyRadek(druhe.jmeno).click();
      const bunka = '#p-kalendar .mesic-den[data-den="' + den(druhe.za) + '"]';
      await page.waitForSelector(bunka + '[aria-current="date"] .cip-svatek');
      jistota((await page.textContent(bunka + ' .cip-svatek')).indexOf('★ ' + druhe.jmeno) >= 0, 'čip druhého jména dne');
      jistota(!(await page.locator(bunka + ' .svatek--bunka').count()), 'u dne s oblíbeným bez šedého jména ' + druhe.hlavni);
      jistota(/sousedka · Svátky/.test(await page.textContent('#p-kalendar .kal-den .udalost--svatek')), 'řádek Svátky u druhého jména');
    }
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    jmeninyOblibeni = [];
  });

  await test('telefon (tmavý režim): svátky v týdnu na Dnes, ★ v měsíci, Brzy má svátek, okno s hromadným přidáním bez přetékání', async () => {
    const { za, jmeno } = await oblibenyZa(2);
    jmeninyOblibeni = [{ jmeno, kdo: 'soused' }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark');
    await page.goto(WEB);
    await page.waitForSelector('#dl-tyden .agenda__svatek--oblibeny');
    const pretika = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    jistota(await pretika() <= 0, 'Dnes přetéká');
    jistota(await page.evaluate(() => { const b = document.querySelector('#dl-tyden .agenda__den--oblibeny .agenda__den-btn'); return b.scrollWidth <= b.clientWidth + 1; }), 'řádek se svátkem přetéká');
    await page.locator('#dl-tyden').screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_dnes_tyden_svatky.png') });
    await page.click('#lista [data-cil="kalendar"]');
    await page.click('#p-kalendar [data-kal-pohled="mesic"]');
    await page.waitForSelector('#p-kalendar .mesic-den[data-den="' + den(za) + '"] .svatek--mobil');
    jistota(await page.isVisible('#p-kalendar .mesic-den[data-den="' + den(za) + '"] .svatek--mobil'), '★ v buňce na telefonu');
    await page.waitForSelector('#p-kalendar .karta-brzy--uzka .brzy__radek');
    jistota(await pretika() <= 0, 'Kalendář přetéká');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_kalendar_svatky.png'), fullPage: true });
    // týden na telefonu: ★ v pruhu dnů, po klepnutí na den oblíbený v „celý den“
    await page.click('#p-kalendar .karta-brzy--uzka .brzy__radek');
    await page.click('#p-kalendar [data-kal-pohled="tyden"]');
    await page.waitForSelector('#p-kalendar .pas-den.vybrany .pas-den__svatek');
    await page.waitForSelector('#p-kalendar .cas-celodenni .cip-svatek');
    jistota((await page.textContent('#p-kalendar .cas-celodenni .cip-svatek')).indexOf('★ ' + jmeno) >= 0, 'celý den na telefonu');
    jistota(await pretika() <= 0, 'Týden přetéká');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_kalendar_svatky_tyden.png') });
    await page.click('#p-kalendar .kal-lista [data-kal-zobrazeni]');
    const O = '[data-panel="kal-zobrazeni"] ';
    await page.waitForSelector(O + '[data-jmeniny-hromadne]');
    await page.fill(O + '[data-jmeniny-hromadne]', 'Honza (bratranec), Míša, Xyzzy, Bára – teta, Kristina');
    await page.waitForSelector(O + '.jn--vyber');
    jistota(await page.locator(O + '.jn__radek').count() === 5, 'pět řádků náhledu');
    jistota(await page.evaluate((o) => { const t = document.querySelector(o + '.panel-telo'); return t.scrollWidth <= t.clientWidth + 1; }, O), 'okno přetéká');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_svatky_okno.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    jmeninyOblibeni = [];
  });

  await test('iPad na výšku: svátky – ★ čip v měsíci, Brzy má svátek pod měsícem (bez bočního panelu), okno se vejde', async () => {
    const { za, jmeno } = await oblibenyZa(1);
    jmeninyOblibeni = [{ jmeno, kdo: 'teta' }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[1]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-tyden .agenda__svatek--oblibeny');
    await page.click('#rail [data-cil="kalendar"]');
    await page.click('#p-kalendar [data-kal-pohled="mesic"]');
    if (new Date(den(za)).getMonth() !== new Date().getMonth()) await page.click('#p-kalendar [data-kal="dalsi"]');
    await page.waitForSelector('#p-kalendar .mesic-den[data-den="' + den(za) + '"] .cip-svatek');
    jistota(!(await page.isVisible('.kal-boc')) && await page.isVisible('#p-kalendar .karta-brzy--uzka'), 'Brzy má svátek pod měsícem');
    jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'Kalendář přetéká');
    await page.screenshot({ path: path.join(VYSTUP, 'ipad-vyska_kalendar_svatky.png'), fullPage: true });
    await page.click('#p-kalendar .kal-lista [data-kal-zobrazeni]');
    const O = '[data-panel="kal-zobrazeni"] ';
    await page.fill(O + '[data-jmeniny-hromadne]', 'Pepa (děda), Saša');
    await page.waitForSelector(O + '.jn--vyber');
    jistota(await page.evaluate((o) => { const t = document.querySelector(o + '.panel-telo'); return t.scrollWidth <= t.clientWidth + 1; }, O), 'okno přetéká');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(VYSTUP, 'ipad-vyska_svatky_okno.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    jmeninyOblibeni = [];
  });

  await test('Svátky v ukázkovém režimu: oblíbený ★ v týdnu na Dnes, hromadné přidání vymyšlených jmen (bez motoru)', async () => {
    const ctx = await prohlizec.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem('asistent.pripojeni', JSON.stringify({ demo: true })));
    const page = await ctx.newPage();
    const chyby = [];
    page.on('pageerror', (e) => chyby.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-tyden .agenda__svatek--oblibeny'); // ukázka má oblíbeného se svátkem za pár dní
      // dva domácké tvary, jejichž jména ukázka mezi oblíbenými ještě nemá
      const pridat = await page.evaluate(() => import('/js/stav.js').then((m) => {
        const ma = (m.stav.info.jmeniny || []).map((o) => o.jmeno);
        return [['Honza', 'Jan'], ['Bára', 'Barbora'], ['Pepa', 'Josef'], ['Verča', 'Veronika']].filter((x) => ma.indexOf(x[1]) < 0).slice(0, 2);
      }));
      await page.click('#rail [data-cil="kalendar"]');
      await page.click('#p-kalendar .kal-lista [data-kal-zobrazeni]');
      const O = '[data-panel="kal-zobrazeni"] ';
      await page.fill(O + '[data-jmeniny-hromadne]', pridat[0][0] + ' (soused), ' + pridat[1][0]);
      await page.waitForFunction((o) => document.querySelectorAll(o + '.jn--pridat').length === 2, O);
      await page.click(O + '[data-jmeniny-pridat]');
      await page.waitForFunction((t) => document.getElementById('toast').textContent.indexOf(t) >= 0, 'Přidáno: ' + pridat[0][1] + ', ' + pridat[1][1]);
      const seznam = await page.textContent(O + '.jmeniny-oblibeni');
      jistota(seznam.indexOf('★ ' + pridat[0][1]) >= 0 && seznam.indexOf('soused') >= 0 && seznam.indexOf('★ ' + pridat[1][1]) >= 0, 'seznam v ukázce: ' + seznam);
      jistota(!chyby.length, 'chyby stránky: ' + chyby.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  // ---------- pití a jídlo na Dnes: voda tlačítky (hned + motor), zpět, jídlo s bílkovinami, týden
  await test('pití a jídlo na Dnes: +0,5 l, zpět, jídlo s bílkovinami do motoru', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-piti:not([hidden]) [data-piti="500"]');
    await page.click('#dl-piti [data-piti="500"]');
    await page.waitForFunction(() => /0,5 l/.test(document.querySelector('#dl-piti .piti__text b').textContent));
    jistota(pitiVolani.some((x) => x.jak === 'piti' && x.ml === 500 && x.den === iso(ted)), 'pití do motoru: ' + JSON.stringify(pitiVolani));
    await page.waitForSelector('#dl-piti [data-piti-zpet]');
    await page.click('#dl-piti [data-piti-zpet]');
    await page.waitForFunction(() => /^0,0 l/.test(document.querySelector('#dl-piti .piti__text b').textContent.trim()));
    await page.click('#dl-piti [data-jidlo-pridat]');
    await page.fill('[data-panel="jidlo"] [data-jidlo-co]', 'Kuře s rýží');
    await page.click('[data-panel="jidlo"] .jidlo-presne summary');
    await page.fill('[data-panel="jidlo"] [data-jidlo-b]', '40');
    await page.click('[data-panel="jidlo"] [data-jidlo-ulozit]');
    await page.waitForFunction(() => /Kuře s rýží/.test(document.querySelector('#dl-piti').textContent) && /40 g/.test(document.querySelector('#dl-piti').textContent));
    jistota(pitiVolani.some((x) => x.jak === 'jidlo' && x.co === 'Kuře s rýží' && x.bilkoviny === 40), 'jídlo do motoru');
    await page.locator('#dl-piti').screenshot({ path: path.join(VYSTUP, 'pc_piti.png') });
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- jídlo slovy (Michal 9. 10.): napíše, co měl → bílkoviny hned odhadne aplikace, Claude upřesní; doplněk se odškrtne
  await test('jídlo slovy: odhad bílkovin hned, doplněk z textu odškrtnutý, k motoru s odhadem pro Clauda; hodnocení dne', async () => {
    const dnes = iso(ted);
    pitiDny[dnes] = { piti: [], jidlo: [], hodnoceni: { znamka: 'B', text: 'Bílkovin 94 g ze 130 – k večeři přidej tvaroh.', kdy: ted } };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-piti:not([hidden]) [data-jidlo-pridat]');
    jistota(/Dnešek podle Clauda/.test(await page.textContent('#dl-piti .piti__hodnoceni')) && await page.locator('#dl-piti .znamka--B').count() === 1, 'hodnocení dne od Clauda');
    await page.click('#dl-piti [data-jidlo-pridat]');
    const O = '[data-panel="jidlo"] ';
    await page.waitForSelector(O + '[data-jidlo-co]');
    await page.fill(O + '[data-jidlo-co]', '3 vejce a chleba, hořčík');
    await page.waitForFunction((o) => /≈ \d+ g/.test(document.querySelector(o + '[data-jidlo-odhad]').textContent), O);
    const odhad = await page.textContent(O + '[data-jidlo-odhad]');
    jistota(/Hořčík/.test(odhad), 'doplněk poznaný v textu: ' + odhad);
    await page.locator('[data-panel="jidlo"]').screenshot({ path: path.join(VYSTUP, 'pc_jidlo_odhad.png') });
    const pred = pitiVolani.length;
    await page.click(O + '[data-jidlo-ulozit]');
    await page.waitForFunction(() => /Zapsáno:/.test(document.getElementById('toast').textContent));
    const j = pitiVolani.slice(pred).find((x) => x.jak === 'jidlo');
    jistota(j && /vejce/.test(j.co) && !/hořčík/i.test(j.co) && j.bilkoviny > 10, 'jídlo s odhadem do motoru: ' + JSON.stringify(j));
    jistota(volano.some((d) => d.akce === 'pitiJidlo' && d.odhad === true), 'odhad pro Clauda');
    for (let i = 0; i < 20 && !doplnkyVolani.some((x) => x.den === dnes && x.zmeny.horcik === true); i++) await page.waitForTimeout(150);
    jistota(doplnkyVolani.some((x) => x.den === dnes && x.zmeny.horcik === true), 'hořčík odškrtnutý: ' + JSON.stringify(doplnkyVolani));
    await page.waitForFunction(() => /≈ \d+ g/.test(document.querySelector('#dl-piti .piti__jidla').textContent));
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    delete pitiDny[dnes];
  });

  // ---------- cíl váhy jen ve Zdraví (Michal 9. 10.: váha teď není hlavní) – pruh, zbývá, tempo; na Dnes jen zápis
  await test('cíl váhy: ve Zdraví pruh a zbývá, na Dnes ne', async () => {
    vahaZaznamy = [{ kdy: Date.now() - 5 * 864e5, kg: 73.6 }, { kdy: Date.now() - 864e5, kg: 73.1 }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-vaha:not([hidden]) .vaha-ted');
    jistota(await page.locator('#dl-vaha .vaha-cil').count() === 0, 'na Dnes bez cíle');
    await page.click('#rail [data-cil="zdravi"]');
    await page.waitForSelector('#zd-vaha .vaha-cil');
    const t = await page.textContent('#zd-vaha .vaha-cil');
    jistota(/Cíl 70 kg/.test(t) && /zbývá 3,1 kg/.test(t) && /ubylo 0,9 kg/.test(t), 'cíl: ' + t);
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    vahaZaznamy = [];
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
    // v řádku jen malá ikona (ne limetkový štítek), v detailu karta POD e-mailem (Michal 9. 10.: „nejdřív si ho přečtu“)
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"] .radek-navrh');
    jistota(!(await page.locator('#posta-seznam .tag--limetka').count()), 'limetkový štítek v řádku');
    await page.click('#posta-seznam [data-vlakno="v1"]');
    await page.waitForSelector('#posta-detail .navrh-odpovedi');
    jistota(/budu tam v 8:15/.test(await page.textContent('#posta-detail .navrh-odpovedi')), 'text návrhu');
    jistota(await page.evaluate(() => { const z = document.querySelector('#posta-detail .zprava'), n = document.querySelector('#posta-detail .navrh-odpovedi');
      return !!(z.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) && n.getBoundingClientRect().top >= z.getBoundingClientRect().bottom; }), 'návrh má být pod e-mailem');
    await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_navrh_pod_emailem.png') });
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
    jistota(/12/.test(await page.textContent('#dnes-kpi [data-pocasi]')), 'teplota teď'); // dlaždice v horní liště (od 9. 10.)
    jistota(meteo >= 1, 'Open-Meteo se nezavolalo');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    // přibližná poloha (iPhone bez Přesné polohy, PC podle Wi-Fi) → přesnost do motoru a „≈“ u místa
    const b = await novaStranka(prohlizec, VELIKOSTI[3]);
    await b.ctx.grantPermissions(['geolocation']);
    await b.ctx.setGeolocation({ latitude: 48.93312, longitude: 17.29765, accuracy: 6000 });
    await b.ctx.addInitScript(() => localStorage.setItem('asistent.pocasi.poloha', 'true'));
    await b.page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' }));
    await b.page.goto(WEB);
    await b.page.waitForFunction(() => /Počasí( zítra)? · ≈ Strážnice/.test((document.getElementById('dnes-kpi') || {}).textContent || ''));
    jistota(volano.filter((d) => d.akce === 'pocasi' && d.poloha).pop().poloha.presnost === 6000, 'přesnost polohy do motoru');
    jistota(!b.chybyStranky.length, 'chyby stránky: ' + b.chybyStranky.join(' | '));
    await b.ctx.close();
  });

  // ---------- počasí: domov v Nastavení (obec podle jména) – bez polohy a v okolí domova se ukáže domov
  await test('počasí: domov – najít obec, uložit do motoru, karta ukáže domov, zrušit', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    let hledano = '';
    await page.route('https://geocoding-api.open-meteo.com/**', (route) => {
      hledano = new URL(route.request().url()).searchParams.get('name');
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ results: [
        { name: 'Lhota', latitude: 49.2441, longitude: 17.7362, admin1: 'Zlínský kraj', admin2: 'Okres Zlín', country_code: 'CZ' },
        { name: 'Lhota', latitude: 50.1694, longitude: 14.0177, admin1: 'Středočeský kraj', admin2: 'Okres Kladno', country_code: 'CZ' }] }) });
    });
    await page.goto(WEB);
    await page.click('#rail [data-otevri-nastaveni]');
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="pocasi"]');
    const S = '[data-panel="nastaveni"] [data-sekce="pocasi"]';
    await page.waitForSelector(S + ' [data-domov-hledat]');
    jistota(/Domov není nastavený/.test(await page.textContent(S)), 'bez domova');
    await page.fill(S + ' [data-domov-hledat]', 'Lhota');
    await page.press(S + ' [data-domov-hledat]', 'Enter');
    await page.waitForSelector(S + ' [data-nast="domov-vybrat"]');
    jistota(hledano === 'Lhota', 'hledání podle jména: ' + hledano);
    jistota(/Okres Zlín/.test(await page.textContent(S + ' .nast-domov__vysledky')), 'okres u výsledku (dvě obce stejného jména)');
    await page.locator(S).screenshot({ path: path.join(VYSTUP, 'pc_pocasi_domov.png') });
    await page.click(S + ' [data-nast="domov-vybrat"][data-index="0"]');
    await page.waitForFunction((s) => /Domov: Lhota/.test((document.querySelector(s) || {}).textContent || ''), S);
    const d = volano.filter((x) => x.akce === 'pocasiDomov').pop();
    jistota(d && d.nazev === 'Lhota' && d.lat === 49.2441 && d.lon === 17.7362, 'domov do motoru: ' + JSON.stringify(d));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => /Počasí( zítra)? · Lhota/.test((document.getElementById('dnes-kpi') || {}).textContent || ''));
    // zrušit domov → výchozí místo bez jména na kartě
    await page.click('#rail [data-otevri-nastaveni]');
    await page.click('[data-panel="nastaveni"] [data-nast-sekce="pocasi"]');
    await page.click(S + ' [data-nast="domov-zrusit"]');
    await page.waitForFunction((s) => /Domov není nastavený/.test((document.querySelector(s) || {}).textContent || ''), S);
    jistota(volano.filter((x) => x.akce === 'pocasiDomov').pop().smazat === true, 'zrušení do motoru');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    pocasiDomov = null;
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
    jistota(/dnes \d{1,2}:\d{2} · (ráno|přes den|večer)/.test(t) && /−0,8 kg/.test(t), 'čas zápisu, denní doba a rozdíl (stejná doba před 3 dny): ' + t);
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
      jistota(/dnes \d{1,2}:\d{2} · (ráno|přes den|večer)/.test(t) && /−0,4 kg/.test(t), 'čas, denní doba a rozdíl na Dnes: ' + t);
      jistota(await page.inputValue('#dl-vaha [data-vaha-pole]') === '', 'pole po zápisu prázdné');
      await page.locator('#dl-vaha').screenshot({ path: path.join(VYSTUP, v.nazev + '_dnes_vaha.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    });
  }

  await test('Váha na telefonu: + → Váha → zápis s časem (i zpětně – včera večer)', async () => {
    vahaZaznamy = [];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.click('.lista [data-rychle]');
    await page.click('[data-rychle-akce="vaha"]');
    const O = '[data-panel="vaha"] ';
    await page.waitForSelector(O + '[data-vaha-okno-kg]');
    await page.fill(O + '[data-vaha-okno-kg]', '79,9');
    await page.click(O + '[data-vaha-okno-cas]:has-text("Včera večer")');
    await page.click(O + '[data-vaha-okno-zapsat]');
    await page.waitForFunction(() => /Zapsáno 79,9 kg · včera 21:00/.test(document.getElementById('toast').textContent));
    const vecer = new Date(); vecer.setDate(vecer.getDate() - 1); vecer.setHours(21, 0, 0, 0);
    jistota(volano.some((d) => d.akce === 'vaha' && d.kg === 79.9 && d.kdy === vecer.getTime()), 'kg a čas vážení do motoru: ' + JSON.stringify(volano.filter((d) => d.akce === 'vaha')));
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
    // změna z aplikace (poznámka do schránky) → kopie schránky z doby před ní neplatí (čtení jde na motor), pošta platí dál
    fbVolano.length = 0;
    fbVolanoData.length = 0;
    await page.evaluate(() => import('/js/api.js').then((m) => m.volej('poznamka', { text: 'test' })));
    volano.length = 0;
    await page.evaluate(() => Promise.all([import('/js/posta.js').then((m) => m.nactiPostu(false)), import('/js/schranka.js').then((m) => m.nactiSchranku())]));
    jistota(volano.some((d) => d.akce === 'schranka'), 'po poznámce se schránka nečetla z motoru');
    jistota(!volano.some((d) => d.akce === 'posta'), 'poznámka nemá zneplatnit kopii pošty: ' + volano.map((d) => d.akce).join());
    // server za 5 s obnoví jen schránku (ne celou obnovu s poštou)
    for (let i = 0; i < 50 && fbVolano.indexOf('obnovHned') < 0; i++) await page.waitForTimeout(200);
    jistota(fbVolanoData.some((d) => d.jen && d.jen.join() === 'schranka'), 'obnova jen schránky: ' + JSON.stringify(fbVolanoData));
    // zápis k poště (označit přečtené) → pošta z motoru
    await page.evaluate(() => import('/js/api.js').then((m) => m.volej('oznacit', { id: 'v1', jak: 'precteno' })));
    volano.length = 0;
    await page.evaluate(() => import('/js/posta.js').then((m) => m.nactiPostu(false)));
    jistota(volano.some((d) => d.akce === 'posta'), 'po změně pošty se pošta nečetla z motoru');
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

  // ---------- dvě zařízení: voda zapsaná v telefonu je na PC hned (signál v účtu → zdraví z motoru), bez obnovení stránky
  await test('účet: voda z telefonu se na PC ukáže hned (signál zdraví), telefon svůj zápis znovu nenačítá', async () => {
    const u = 'uzivatele/' + FB_UZIVATEL.uid;
    Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    fbDocs[u] = { pripojeni: { url: MOTOR, klic: KLIC }, upraveno: Date.now() };
    fbDocs[u + '/data/_stav'] = { kdy: Date.now(), potvrzeno: {}, chyby: [] };
    const prihlasit = (ctx) => ctx.addInitScript((ja) => {
      if (!localStorage.getItem('asistent.ucet')) {
        localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
        localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
      }
    }, FB_UZIVATEL);
    const pc = await novaStranka(prohlizec, VELIKOSTI[3]);
    const tel = await novaStranka(prohlizec, VELIKOSTI[0]);
    await prihlasit(pc.ctx);
    await prihlasit(tel.ctx);
    await pc.page.goto(WEB);
    await tel.page.goto(WEB);
    await pc.page.waitForSelector('#dl-piti:not([hidden]) [data-piti="500"]');
    await tel.page.waitForSelector('#dl-piti:not([hidden]) [data-piti="250"]');
    await pc.page.waitForTimeout(500);
    const pred = await pc.page.textContent('#dl-piti .piti__text b');
    volano.length = 0;
    fbVolano.length = 0;
    fbVolanoData.length = 0;
    await tel.page.click('#dl-piti [data-piti="250"]');
    await pc.page.waitForFunction((p) => document.querySelector('#dl-piti .piti__text b').textContent !== p, pred, { timeout: 6000 });
    const sig = fbDocs[u + '/data/_signal'];
    jistota(sig && Number.isInteger(sig.zdravi), 'signál zdraví v účtu: ' + JSON.stringify(sig));
    await pc.page.waitForTimeout(500);
    jistota(volano.filter((d) => d.akce === 'zdravi').length === 1, 'zdraví znovu jen na PC: ' + volano.map((d) => d.akce).join());
    await pc.page.waitForTimeout(5500); // obnova po změně by přišla za 5 s
    jistota(!fbVolano.length, 'zápis ke zdraví nemá spouštět obnovu kopií na serveru: ' + JSON.stringify(fbVolanoData));
    jistota(!pc.chybyStranky.length && !tel.chybyStranky.length, 'chyby stránky: ' + pc.chybyStranky.concat(tel.chybyStranky).join(' | '));
    await pc.ctx.close();
    await tel.ctx.close();
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
    jistota(z.pribeh === true, 'rovnou i do příběhu (výchozí zapnuto): ' + JSON.stringify(z));
    const karta = await page.textContent('[data-reel="reel_dorost_tesany"]');
    jistota(/vyjde .*19:30 \+ příběh/.test(karta) && /označí @dorost_agro/.test(karta) && /Upravený popisek/.test(karta) && /upravený popisek pro Instagram/.test(karta), 'karta po naplánování: ' + karta.slice(0, 200));
    // naplánovaný reel už na Dnes nestraší jako „k vyvěšení“
    jistota(!(await page.evaluate(() => import('/js/reely.js').then((m) => m.kVyveseni().some((r) => r.id === 'reel_dorost_tesany')))), 'naplánovaný není k vyvěšení');
    await page.click('[data-reel="reel_dorost_tesany"] [data-reel-zrusit-plan]');
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForSelector('[data-reel="reel_dorost_tesany"] [data-reel-naplanovat]');
    jistota(!reelyPlan.reel_dorost_tesany, 'plán zrušený');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Plakáty: program víkendu na A3 jako na webu dorostu (zápasy z fotbal.cz + mládež z rozlosování), tisk, obrázek, Instagram
  const PL = '#p-plakaty .plakat-stage .poster ';
  const naVikend = async (page, sobota, text) => {
    await page.selectOption('#p-plakaty [data-pl-vyber]', sobota);
    await page.waitForFunction(([s, t]) => document.querySelector('#p-plakaty [data-pl-vyber]').value === s &&
      new RegExp(t).test(document.querySelector('#p-plakaty .plakat-stage .poster').textContent), [sobota, text]);
  };

  await test('Plakáty na PC: 17.–18. 10. – áčko doma z fotbal.cz, mládež z rozlosování, hlavička 122 px, tisk A3', async () => {
    fotbalPlakat = true;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      jistota(await page.inputValue('#p-plakaty [data-pl-vyber]') === vychoziVikendTestu(), 'výchozí víkend: ' + await page.inputValue('#p-plakaty [data-pl-vyber]'));
      await naVikend(page, '2026-10-17', 'MILOTICE');
      jistota(await page.$eval('#p-plakaty [data-pl-vyber]', (s) => s.selectedOptions[0].textContent) === '10. kolo · 17.–18. 10.', 'popisek kola');
      jistota(/podle rozlosování/.test(await page.textContent('#p-plakaty [data-pl-stav]')), 'štítek podle rozlosování');
      jistota(await page.locator(PL + '.blok.single').count() === 1, 'jediná velká dlaždice');
      const blok = (await page.innerText(PL + '.blok')).replace(/\s+/g, ' ');
      jistota(/A-TÝM/.test(blok) && /MILOTICE/.test(blok) && /SOBOTA 17\. 10\. \| 14:30/.test(blok), 'áčko doma: ' + blok);
      jistota(await page.getAttribute(PL + '.blok .duel .badge:last-child', 'src') === 'plakat/znaky/milotice.png', 'znak Milotic');
      const venku = (await page.innerText(PL + '.rowlist')).replace(/\s+/g, ' ');
      jistota(/BENFIKA PETROV NE 14:30/.test(venku) && /DOROST HODONÍN B SO 10:00/.test(venku), 'venku: ' + venku);
      jistota(await page.locator(PL + '.row').count() === 3 && /RATÍŠKOVICE B/.test(await page.textContent(PL + '.left')), 'mládež doma z rozlosování');
      jistota(/ML\. ŽÁCI.*PÁ 16\. 10\./.test((await page.innerText(PL + '.wk')).replace(/\s+/g, ' ')), 'v týdnu');
      jistota(!(await page.locator(PL + '.ph').count()), 'čárkovaný rámeček místo znaku');
      // hlavička + horní okraj čáry = 122 px (náhled je zmenšený – přepočet měřítkem)
      const hlavicka = await page.evaluate(() => {
        const ph = document.querySelector('#p-plakaty .poster .phead'), r = document.querySelector('#p-plakaty .poster .rule');
        const s = ph.getBoundingClientRect().width / ph.offsetWidth;
        return Math.round((r.getBoundingClientRect().top - ph.getBoundingClientRect().top) / s);
      });
      jistota(hlavicka === 122, 'hlavička ' + hlavicka + ' px');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'stránka přetéká');
      await page.waitForTimeout(600); // písma z Google Fonts
      await page.screenshot({ path: path.join(VYSTUP, 'pc_plakaty.png'), fullPage: true });
      await page.locator('#p-plakaty .plakat-nahled').screenshot({ path: path.join(VYSTUP, 'pc_plakat_nahled.png') });
      // tisk: tlačítko přidá třídu tisk-plakatu a zavolá window.print (sám tisk se v testu nespouští)
      await page.evaluate(() => { window.__tisk = 0; window.print = () => { window.__tisk++; }; });
      await page.click('#p-plakaty [data-pl-tisk]');
      await page.waitForFunction(() => window.__tisk === 1);
      jistota(await page.evaluate(() => document.documentElement.classList.contains('tisk-plakatu')), 'třída tisk-plakatu');
      const strana = await page.evaluate(() => {
        for (const st of Array.from(document.styleSheets)) {
          let pravidla = [];
          try { pravidla = Array.from(st.cssRules); } catch (e) { continue; }
          const r = pravidla.find((x) => x.type === CSSRule.PAGE_RULE);
          if (r) return r.style.getPropertyValue('size') + ' | ' + r.style.getPropertyValue('margin');
        }
        return '';
      });
      jistota(/^420mm 297mm \| 0px$/.test(strana), '@page: ' + strana);
      await page.emulateMedia({ media: 'print' });
      const tisk = await page.evaluate(() => ({ rail: getComputedStyle(document.querySelector('.rail')).display,
        editor: document.querySelector('#p-plakaty .pl-editor').getClientRects().length ? 'videt' : 'none', lista: getComputedStyle(document.querySelector('#p-plakaty .plakaty-lista')).display,
        sirka: Math.round(document.querySelector('#p-plakaty .plakat-stage').getBoundingClientRect().width),
        meritko: getComputedStyle(document.querySelector('#p-plakaty .plakat-stage .poster')).transform }));
      jistota(tisk.rail === 'none' && tisk.editor === 'none' && tisk.lista === 'none' && Math.abs(tisk.sirka - 1587) <= 1 && /^matrix\(1\.1338/.test(tisk.meritko),
        'tisk: ' + JSON.stringify(tisk));
      await page.pdf({ path: path.join(VYSTUP, 'plakat_tisk_A3.pdf'), preferCSSPageSize: true, printBackground: true });
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      jistota(!(await page.evaluate(() => document.documentElement.classList.contains('tisk-plakatu'))), 'po tisku třída pryč');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty: 24.–25. 10. – béčko a dorost doma v neděli, áčko v sobotu venku, v editoru „přeloženo z …“', async () => {
    fotbalPlakat = true;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      const pred = await page.inputValue('#p-plakaty [data-pl-vyber]');
      await page.click('#p-plakaty [data-pl-posun]:not([disabled])'); // ◀ ▶ mezi víkendy
      await page.waitForFunction((v) => document.querySelector('#p-plakaty [data-pl-vyber]').value !== v, pred);
      await naVikend(page, '2026-10-24', 'KOZOJÍDKY');
      jistota(await page.$eval('#p-plakaty [data-pl-vyber]', (s) => s.selectedOptions[0].textContent) === '11. kolo · 24.–25. 10.', 'popisek kola');
      const bloky = await page.$$eval(PL + '.blok', (b) => b.map((x) => x.innerText.replace(/\s+/g, ' ')));
      jistota(bloky.length === 2 && /BENFIKA.*KOZOJÍDKY.*NEDĚLE 25\. 10\. \| 14:30/.test(bloky[0]) && /DOROST.*VELKÁ NAD VELIČKOU.*NEDĚLE 25\. 10\. \| 11:45/.test(bloky[1]),
        'doma v neděli: ' + JSON.stringify(bloky));
      const venku = (await page.innerText(PL + '.rowlist')).replace(/\s+/g, ' ');
      jistota(/A-TÝM HROZNOVÁ LHOTA SO 14:30/.test(venku) && /ST\. ŽÁCI VACENOVICE SO 14:30/.test(venku), 'venku: ' + venku);
      const znaky = await page.$$eval(PL + '.badge', (b) => b.map((x) => x.getAttribute('src').split('/').pop()));
      jistota(['kozojidky.png', 'velka-nad-velickou.png', 'hroznova-lhota.png'].every((z) => znaky.indexOf(z) >= 0), 'znaky: ' + znaky.join());
      const pozn = (await page.textContent('#p-plakaty .pl-upozorneni')).replace(/\s+/g, ' ');
      jistota(/DOROST – VELKÁ NAD VELIČKOU: přeloženo z so 24\. 10\. 11:45 na ne 25\. 10\. 11:45/.test(pozn) &&
        /BENFIKA – KOZOJÍDKY: přeloženo z so 24\. 10\. 14:30/.test(pozn) && /A-TÝM – HROZNOVÁ LHOTA: schváleno STK/.test(pozn), 'upozornění: ' + pozn);
      await page.waitForTimeout(400);
      await page.locator('#p-plakaty .plakat-nahled').screenshot({ path: path.join(VYSTUP, 'pc_plakat_24-25_10.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty: úprava v editoru hned v náhledu, uloží se 700 ms po psaní (plakatUlozit), Vrátit podle rozlosování', async () => {
    fotbalPlakat = true;
    delete plakatyData.kola['2026-10-17'];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      await naVikend(page, '2026-10-17', 'MILOTICE');
      const pred = volano.filter((d) => d.akce === 'plakatUlozit').length;
      const pole = page.locator('#p-plakaty [data-pl-cesta="doma.0.souper"]');
      await pole.click();
      await page.keyboard.press('End');
      await pole.pressSequentially(' – DERBY', { delay: 40 });
      // náhled hned, uložení jen jednou po dopsání
      jistota(/MILOTICE – DERBY/.test(await page.textContent(PL + '.blok .opp')), 'změna v náhledu');
      await page.waitForFunction(() => /upraveno ručně/.test(document.querySelector('#p-plakaty [data-pl-stav]').textContent), null, { timeout: 6000 });
      const ulozeni = volano.filter((d) => d.akce === 'plakatUlozit').slice(pred);
      jistota(ulozeni.length === 1, 'uložení po psaní: ' + ulozeni.length + '×');
      const u = ulozeni[0];
      jistota(u.tyden === '2026-10-17' && u.stav.doma[0].souper === 'MILOTICE – DERBY' && u.stav.domaMladez.length === 3 && u.stav.vTydnu.length === 1 &&
        u.stav.paticka.misto === 'AGRO ARÉNA VNOROVY', 'uložený plakát: ' + JSON.stringify(u.stav).slice(0, 300));
      jistota(await page.inputValue('#p-plakaty [data-pl-cesta="doma.0.souper"]') === 'MILOTICE – DERBY', 'pole se při ukládání nepřepsalo');
      // přidat a smazat řádek v týdnu
      await page.click('#p-plakaty [data-pl-pridat="vTydnu"]');
      await page.waitForSelector('#p-plakaty [data-pl-cesta="vTydnu.1.kat"]');
      await page.fill('#p-plakaty [data-pl-cesta="vTydnu.1.kat"]', 'DOROST');
      await page.fill('#p-plakaty [data-pl-cesta="vTydnu.1.souper"]', 'RATÍŠKOVICE');
      await page.waitForFunction(() => /AGRO|RATÍŠKOVICE – AGRO/.test(document.querySelector('#p-plakaty .poster .wk').textContent) &&
        document.querySelectorAll('#p-plakaty .poster .wkr').length === 2);
      await cekej(() => { const x = volano.filter((d) => d.akce === 'plakatUlozit').pop(); return x && x.stav.vTydnu.length === 2 && x.stav.vTydnu[1].souper === 'RATÍŠKOVICE'; }, 6000, 'uložení nového řádku');
      await page.click('#p-plakaty [data-pl-smazat="vTydnu:1"]');
      await page.waitForFunction(() => document.querySelectorAll('#p-plakaty .poster .wkr').length === 1);
      // po obnovení stránky platí uložená ruční verze
      await cekej(() => plakatyData.kola['2026-10-17'] && plakatyData.kola['2026-10-17'].stav.vTydnu.length === 1, 6000, 'smazání řádku v motoru');
      await page.evaluate(() => localStorage.removeItem('asistent.videno')); // po obnovení bez okna Co je nového
      await page.reload();
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      await naVikend(page, '2026-10-17', 'MILOTICE – DERBY');
      jistota(/upraveno ručně/.test(await page.textContent('#p-plakaty [data-pl-stav]')), 'po obnovení upraveno ručně');
      // Vrátit podle rozlosování: potvrzení, smazání v motoru, plakát zase podle fotbal.cz
      await page.click('#p-plakaty [data-pl-vratit]');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForFunction(() => /podle rozlosování/.test(document.querySelector('#p-plakaty [data-pl-stav]').textContent) &&
        !/DERBY/.test(document.querySelector('#p-plakaty .plakat-stage .poster').textContent));
      jistota(volano.some((d) => d.akce === 'plakatUlozit' && d.tyden === '2026-10-17' && d.smazat === true) && !plakatyData.kola['2026-10-17'], 'smazání úprav v motoru');
      jistota(await page.inputValue('#p-plakaty [data-pl-cesta="doma.0.souper"]') === 'MILOTICE', 'editor podle rozlosování');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty: stažení obrázku – html2canvas z aplikace až při stažení (nic z cizích serverů), neškálovaný plakát 1400 × 990, JPEG 2 800 px', async () => {
    fotbalPlakat = true;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    try {
      await napodobHtml2canvas(page);
      const knihovna = [], cizi = [];
      page.on('request', (r) => {
        if (/\/js\/vendor\/html2canvas\.min\.js$/.test(r.url())) knihovna.push(r.url());
        if (/cdnjs|unpkg|jsdelivr/.test(r.url())) cizi.push(r.url());
      });
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      await naVikend(page, '2026-10-17', 'MILOTICE');
      jistota(!knihovna.length, 'knihovna se stáhla předem');
      const [stazeni] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#p-plakaty [data-pl-stahnout]')]);
      jistota(stazeni.suggestedFilename() === 'plakat_2026-10-17.jpg', 'název souboru: ' + stazeni.suggestedFilename());
      jistota(knihovna.length === 1 && !cizi.length, 'knihovna: ' + knihovna.join() + ' · cizí servery: ' + cizi.join());
      const h2c = await page.evaluate(() => window.__h2c);
      jistota(h2c.length === 1 && h2c[0].sirka === 1400 && h2c[0].vyska === 990 && h2c[0].meritko === 2 && h2c[0].transform === 'none' && /MILOTICE/.test(h2c[0].text),
        'html2canvas dostal: ' + JSON.stringify(h2c).slice(0, 200));
      const soubor = fs.readFileSync(await stazeni.path());
      jistota(JSON.stringify(rozmerJpeg(soubor)) === '[2800,1980]', 'JPEG ' + JSON.stringify(rozmerJpeg(soubor)));
      fs.writeFileSync(path.join(VYSTUP, 'plakat_obrazek.jpg'), soubor);
      await page.waitForFunction(() => /Obrázek plakátu stažený/.test(document.getElementById('toast').textContent));
      jistota(!(await page.locator('.plakat-export').count()), 'pomocný plakát pro obrázek zůstal v dokumentu');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty: Instagram – popisek od Clauda ve stylu, ruční úprava, naplánovat příspěvek i příběh, zrušit plán', async () => {
    fotbalPlakat = true;
    delete plakatyData.popisky['2026-10-17'];
    delete plakatyData.plan['2026-10-17'];
    delete plakatyData.kola['2026-10-17'];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    try {
      await napodobHtml2canvas(page);
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      await naVikend(page, '2026-10-17', 'MILOTICE');
      // požádat Clauda o popisek ve stylu – souhrn víkendu z plakátu (domácí zápasy, hlavní zápas áčka)
      await page.fill('#p-plakaty [data-pl-styl]', 'vtipně, ať přijde hodně lidí');
      await page.click('#p-plakaty [data-pl-popisek-claude]');
      await page.waitForSelector('#p-plakaty [data-pl-ceka]');
      jistota(/Claude píše popisek… \(do půl hodiny, když běží PC\)/.test(await page.textContent('#p-plakaty [data-pl-ceka]')), 'čeká se na Clauda');
      const z = volano.filter((d) => d.akce === 'plakatPopisek').pop();
      jistota(z && z.tyden === '2026-10-17' && z.styl === 'vtipně, ať přijde hodně lidí' && /A-TÝM \(6\. LIGA.*\): sobota 17\. 10\. 14:30 proti MILOTICE/.test(z.souhrn) &&
        /Hlavní zápas: A-TÝM – MILOTICE/.test(z.souhrn) && /BENFIKA: NE 14:30 PETROV/.test(z.souhrn), 'žádost o popisek: ' + JSON.stringify(z).slice(0, 400));
      await page.locator('#p-plakaty .pl-ig').screenshot({ path: path.join(VYSTUP, 'pc_plakat_instagram_ceka.png') });
      // Claude popisek napsal (motor ho vrátí při dalším čtení) → Obnovit
      plakatyData.popisky['2026-10-17'] = { text: 'Áčko hostí Milotice! ⚽\n\nV sobotu ve 14:30 na Agro Aréně.\n\n#fkagrovnorovy', zdroj: 'claude', kdy: Date.now(),
        styl: 'vtipně, ať přijde hodně lidí', pozadano: Date.now() - 6e4, cekaNaClauda: false };
      await page.click('#horni [data-obnovit]');
      await page.waitForFunction(() => /Áčko hostí Milotice/.test(document.querySelector('#p-plakaty [data-pl-popisek]').value));
      jistota(/od Clauda/.test(await page.textContent('#p-plakaty [data-pl-popisek-stitek]')) && !(await page.locator('#p-plakaty [data-pl-ceka]').count()), 'popisek od Clauda');
      // ruční úprava popisku → uloží se, štítek „upraveno“
      const text = 'Áčko hostí Milotice! ⚽\n\nPřijďte v sobotu ve 14:30 – bude derby.\n\n#fkagrovnorovy';
      await page.fill('#p-plakaty [data-pl-popisek]', text);
      jistota(/upraveno/.test(await page.textContent('#p-plakaty [data-pl-popisek-stitek]')), 'štítek upraveno');
      await cekej(() => volano.some((d) => d.akce === 'plakatPopisekUlozit' && d.tyden === '2026-10-17' && d.text === text), 6000, 'uložení popisku');
      // naplánovat: výchozí čtvrtek před víkendem 18:00 (když už prošel, za hodinu), i do příběhu
      await page.click('#p-plakaty [data-pl-ig-naplanovat]');
      const O = '[data-panel="plakat-ig"] ';
      await page.waitForSelector(O + '[data-pl-ig="kdy"]');
      const ctvrtek = new Date(2026, 9, 15, 18, 0).getTime();
      const vychozi = await page.inputValue(O + '[data-pl-ig="kdy"]');
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(vychozi) || [];
      const cekany = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
      // čtvrtek před víkendem 18:00; když už prošel (test běží později), za hodinu zaokrouhleno na 5 minut
      jistota(ctvrtek > Date.now() + 6 * 60e3 ? cekany === ctvrtek : (cekany - Date.now() >= 59 * 60e3 && cekany - Date.now() <= 66 * 60e3 && +m[5] % 5 === 0),
        'výchozí čas: ' + vychozi);
      jistota(await page.isChecked(O + '[data-pl-ig="pribeh"]'), 'i do příběhu zapnuté');
      await page.waitForSelector(O + '.pl-nahled-pribeh', { timeout: 20000 });
      // příběh 1080 × 1920 → testy/vystup jako PNG
      const pribeh = await page.evaluate(() => new Promise((ok) => {
        const i = new Image();
        i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
          ok({ w: i.naturalWidth, h: i.naturalHeight, png: c.toDataURL('image/png') }); };
        i.src = document.querySelector('[data-panel="plakat-ig"] .pl-nahled-pribeh').src;
      }));
      jistota(pribeh.w === 1080 && pribeh.h === 1920, 'příběh ' + pribeh.w + ' × ' + pribeh.h);
      fs.writeFileSync(path.join(VYSTUP, 'plakat_pribeh_1080x1920.png'), Buffer.from(pribeh.png.split(',')[1], 'base64'));
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_plakat_instagram_okno.png') });
      const pred = volano.length;
      await page.click(O + '[data-pl-ig-ulozit]');
      await page.waitForSelector('#p-plakaty .pl-ig .tag--plan');
      const nove = volano.slice(pred);
      const obr = nove.find((d) => d.akce === 'plakatObrazky'), plan = nove.find((d) => d.akce === 'plakatNaplanovat');
      jistota(obr && obr.tyden === '2026-10-17' && JSON.stringify(rozmerJpeg(jpegZDat(obr.prispevek))) === '[1440,1018]' &&
        JSON.stringify(rozmerJpeg(jpegZDat(obr.pribeh))) === '[1080,1920]', 'obrázky do motoru: ' + (obr ? JSON.stringify([rozmerJpeg(jpegZDat(obr.prispevek)), rozmerJpeg(jpegZDat(obr.pribeh))]) : 'nic'));
      jistota(plan && plan.tyden === '2026-10-17' && plan.pribeh === true && plan.kdy === cekany && nove.indexOf(obr) < nove.indexOf(plan), 'plán do motoru: ' + JSON.stringify(plan));
      const karta = (await page.textContent('#p-plakaty .pl-ig')).replace(/\s+/g, ' ');
      jistota(/vyjde/.test(karta) && /i do příběhu/.test(karta) && /Změnit čas/.test(karta) && /Zrušit plán/.test(karta), 'karta po naplánování: ' + karta.slice(0, 200));
      await page.waitForTimeout(300);
      await page.locator('#p-plakaty .pl-ig').screenshot({ path: path.join(VYSTUP, 'pc_plakat_instagram.png') });
      // zrušit plán
      await page.click('#p-plakaty [data-pl-ig-zrusit]');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForFunction(() => !document.querySelector('#p-plakaty .pl-ig .tag--plan') && /Naplánovat na Instagram/.test(document.querySelector('#p-plakaty .pl-ig').textContent));
      jistota(!plakatyData.plan['2026-10-17'] && volano.some((d) => d.akce === 'plakatZrusitPlan' && d.tyden === '2026-10-17'), 'plán zrušený');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty na telefonu (390 px, tmavý režim): z menu i ze stránky Fotbal, náhled se vejde, nic nepřetéká do strany', async () => {
    fotbalPlakat = true;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark', PRAHA);
    try {
      await page.goto(WEB);
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty .plakat-stage .poster .design');
      await naVikend(page, '2026-10-24', 'KOZOJÍDKY');
      const rozmer = await page.evaluate(() => {
        const b = document.querySelector('#p-plakaty .plakat-nahled').getBoundingClientRect(), s = document.querySelector('#p-plakaty .plakat-stage').getBoundingClientRect();
        return { prekryv: document.documentElement.scrollWidth - document.documentElement.clientWidth, box: [Math.round(b.left), Math.round(b.right)],
          stage: [Math.round(s.left), Math.round(s.right)], sirka: innerWidth };
      });
      jistota(rozmer.prekryv <= 0 && rozmer.box[0] >= 0 && rozmer.box[1] <= rozmer.sirka && rozmer.stage[0] >= rozmer.box[0] && rozmer.stage[1] <= rozmer.box[1],
        'telefon: ' + JSON.stringify(rozmer));
      // v telefonu je Instagram nad editorem
      jistota(await page.evaluate(() => document.querySelector('#p-plakaty .pl-ig').getBoundingClientRect().top < document.querySelector('#p-plakaty .pl-editor').getBoundingClientRect().top),
        'Instagram nad editorem');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_plakaty.png'), fullPage: true });
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_plakaty_nahore.png') });
      // stránka Fotbal: tlačítko Plakát vedle Reely
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="fotbal"]');
      await page.waitForSelector('#p-fotbal .reely-tl');
      await page.click('#p-fotbal .plakat-tl');
      await page.waitForSelector('#p-plakaty:not([hidden]) .plakat-stage .poster .design');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'stránka přetéká');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty v ukázkovém režimu: plakát z ukázkových zápasů, úprava, popisek od Clauda, naplánování (bez motoru)', async () => {
    const ctx = await prohlizec.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, PRAHA));
    await ctx.addInitScript(() => localStorage.setItem('asistent.pripojeni', JSON.stringify({ demo: true })));
    const page = await ctx.newPage();
    const chyby = [];
    page.on('pageerror', (e) => chyby.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
    try {
      await napodobHtml2canvas(page);
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty .plakat-stage .poster .design');
      jistota(await page.inputValue('#p-plakaty [data-pl-vyber]') === vychoziVikendTestu(), 'výchozí víkend v ukázce');
      jistota(/Víkend ve Vnorovech/.test(await page.inputValue('#p-plakaty [data-pl-popisek]')), 'ukázkový popisek od Clauda');
      await page.fill('#p-plakaty [data-pl-cesta="nadpis"]', 'PROGRAM VÍKENDU!');
      await page.waitForFunction(() => /upraveno ručně/.test(document.querySelector('#p-plakaty [data-pl-stav]').textContent), null, { timeout: 6000 });
      await page.fill('#p-plakaty [data-pl-styl]', 'derby');
      await page.click('#p-plakaty [data-pl-popisek-claude]');
      await page.waitForFunction(() => /Ukázkový popisek od Clauda \(derby\)/.test(document.querySelector('#p-plakaty [data-pl-popisek]').value));
      await page.click('#p-plakaty [data-pl-ig-naplanovat]');
      await page.waitForSelector('[data-panel="plakat-ig"] .pl-nahled-pribeh', { timeout: 20000 });
      await page.click('[data-panel="plakat-ig"] [data-pl-ig-ulozit]');
      await page.waitForSelector('#p-plakaty .pl-ig .tag--plan');
      await page.click('#p-plakaty [data-pl-vratit]');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForFunction(() => /podle rozlosování/.test(document.querySelector('#p-plakaty [data-pl-stav]').textContent));
      await page.screenshot({ path: path.join(VYSTUP, 'ukazka_plakaty.png') });
      jistota(!chyby.length, 'chyby stránky: ' + chyby.join(' | '));
    } finally {
      await ctx.close();
    }
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
    // výdaje po měsících: rok u prvního sloupce a u ledna; najetí = bublina s měsícem, částkou a rozpisem (Michal 9. 10.)
    const popisky = await page.$$eval('.auto-sloupec small', (s) => s.map((x) => x.textContent));
    jistota(popisky.length <= 13 && /\d{4}$/.test(popisky[0]), 'měsíce s rokem: ' + JSON.stringify(popisky));
    const bublinaAuta = () => page.evaluate(() => { const b = document.getElementById('graf-bublina'); return b && !b.hidden ? b.textContent.replace(/\s+/g, ' ') : ''; });
    await page.hover('.auto-sloupec[aria-label*="palivo"]');
    const vMesici = await bublinaAuta();
    jistota(/^(leden|únor|březen|duben|květen|červen|červenec|srpen|září|říjen|listopad|prosinec) \d{4}/.test(vMesici) && /\d Kč/.test(vMesici) && /palivo \d/.test(vMesici),
      'bublina měsíce: ' + vMesici);
    // klávesnicí: Tab na sloupec, šipka vlevo = předchozí měsíc
    await page.focus('.auto-sloupec:last-child');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => { const s = document.querySelectorAll('.auto-sloupec'); return document.activeElement === s[s.length - 2]; });
    const predchozi = await bublinaAuta();
    jistota(/\d{4}/.test(predchozi) && predchozi === await page.evaluate(() => { const a = document.activeElement.dataset;
      return (a.bublina + (a.bublinaHodnota || '') + (a.bublinaPod || '')).replace(/\s+/g, ' '); }), 'šipka: bublina předchozího měsíce: ' + predchozi);
    // cena nafty: najetí na tankování = datum, Kč/l, litry a částka
    await page.locator('.auto-cara .graf-bod').last().hover();
    const tankovani = await bublinaAuta();
    jistota(/tankování/.test(tankovani) && /35,00 Kč\/l/.test(tankovani) && /40,0 l/.test(tankovani) && /1 400 Kč/.test(tankovani), 'bublina tankování: ' + tankovani);
    await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_bublina.png') });
    await page.mouse.move(2, 2);
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
    await page.waitForSelector('.mini-kpi[data-krouzky]'); // malá čísla od 9. 10.: počasí, připravenost, kroužky (Další zápas je v kartě Fotbal)
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_dnes_barvy.png'), fullPage: true });
    await page.click('.hlava-ja [data-menu]');
    await page.click('[data-panel="menu"] [data-menu-cil="auto"]');
    await page.waitForSelector('.auto-hero');
    const prekryv = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    jistota(prekryv <= 0, 'stránka přetéká do strany o ' + prekryv + ' px');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_auto.png'), fullPage: true });
    // klepnutí na krajní sloupce měsíců: bublina s měsícem a částkou celá na obrazovce (8 px od okraje)
    for (const sloupec of [page.locator('.auto-sloupec').first(), page.locator('.auto-sloupec').last()]) {
      await sloupec.scrollIntoViewIfNeeded();
      await sloupec.tap();
      const b = await page.evaluate(() => { const x = document.getElementById('graf-bublina'); const r = x.getBoundingClientRect();
        return { hidden: x.hidden, l: r.left, r: r.right, sirka: document.documentElement.clientWidth, text: x.textContent.replace(/\s+/g, ' ') }; });
      jistota(!b.hidden && b.l >= 8 && b.r <= b.sirka - 8 && /\d{4}/.test(b.text), 'bublina měsíce na telefonu: ' + JSON.stringify(b));
    }
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_auto_bublina.png') });
    // Dnes: připomínka auta je karta Auta – ne e-mail s časem v ms místo názvu, „NaN“ místo data a „Neplatný argument“ po klepnutí
    await page.click('#lista [data-cil="dnes"]');
    await page.waitForSelector('.pozornost .pozor[data-cil="auto"]');
    const pozor = await page.textContent('.pozornost');
    jistota(/Přezout na zimní/.test(pozor) && !/NaN|\d{13}/.test(pozor), 'telefon: připomínka auta ve Vyžaduje pozornost: ' + pozor.slice(0, 200));
    jistota(await page.locator('.pozornost [data-vlakno="pneu-zimni"]').count() === 0, 'připomínka auta se otevírá jako e-mail');
    await page.click('.pozornost .pozor[data-cil="auto"]');
    await page.waitForSelector('.auto-hero');
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
  await test('telefon: menu zleva se všemi sekcemi (Fotbal, Reely, Plakáty), zavření klepnutím vedle', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.click('.hlava-ja [data-menu]');
    await page.waitForSelector('[data-panel="menu"].otevreny');
    const sekce = await page.$$eval('[data-panel="menu"] [data-menu-cil]', (b) => b.map((x) => x.dataset.menuCil).join());
    jistota(sekce === 'dnes,schranka,posta,kalendar,zdravi,fotbal,reely,plakaty,auto', 'sekce v menu: ' + sekce);
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
