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
  info: () => ({ verze: 'test', akce: Object.keys(motor).concat(['polozkaUpravy', 'polozkaTermin', 'pitiJidloPresun', 'plakatPlanPopisek', 'igJenPribeh']), ucet: 'tester@example.com', posta: { osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.test', lzeOdesilatZPracovni: false, podpisy: { osobni: 'Michal', pracovni: '' } },
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
  posta: () => {
    const d = Object.assign({ osobni: [vlaknoSouhrn.v1], pracovni: [vlaknoSouhrn.v2], pracovniAdresa: 'prace@firma.test', firemni: null, ted: Date.now() },
      JSON.parse(JSON.stringify(postaNavic)));
    // Beru na vědomí jako motor: s časem poslední zprávy = informace „bereš na vědomí“, původní stav vedle
    ['osobni', 'pracovni'].forEach((k) => { d[k] = (d[k] || []).map((m) => (vedomiTest[m.id] === m.kdy
      ? Object.assign({}, m, { vedomi: true, puvodniStav: m.stav, puvodniDuvod: m.duvod || '', stav: 'info', duvod: 'bereš na vědomí', neprectena: false }) : m)); });
    return d;
  },
  // víc konverzací naráz (výběr, pravé tlačítko, rychlé akce) a Beru na vědomí – motor 2026-10-10
  postaOznacit: (d) => {
    const ids = (d.ids || []).map((x) => (typeof x === 'string' ? { id: x } : x));
    postaOznaceni.push({ ids, jak: d.jak });
    ids.forEach((x) => { if (d.jak === 'vedomi') vedomiTest[x.id] = x.kdy; if (d.jak === 'vedomiZrusit') delete vedomiTest[x.id]; });
    return { jak: d.jak, ids: ids.map((x) => x.id), chyby: {} };
  },
  // záložky jako v Gmailu: Promoakce (k1 nepřečtená, k2 přečtená), přesun do štítku, přečíst vše
  postaKategorie: (d) => ({ kategorie: d.kategorie, vlakna: d.kategorie === 'promo' ? JSON.parse(JSON.stringify(promoVlakna)) : [], ted }),
  postaPresunout: (d) => {
    postaPresuny.push({ id: d.id, ids: d.ids, stitek: d.stitek, pridat: d.pridat, archivovat: d.archivovat, odebrat: d.odebrat, doDorucenych: d.doDorucenych });
    if (Array.isArray(d.ids)) return { stitek: d.stitek, ids: d.ids.slice(), chyby: {}, archivovano: !!d.archivovat }; // víc naráz (výběr)
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
      text: 'Kdy je sraz?', html: '', prilohy: [] }] : []).concat([{ id: 'm-' + d.id, od: 'Trenér', odAdresa: 'trener@klub.test', odeMe: false, komu: 'tester@example.com', kopie: d.id === 'v2' ? vlaknoV2Kopie : '', kdy: kdySouhrnu(d.id), predmet: 'Sraz',
      text: 'Ahoj, sraz v 8:30.', html: d.id === 'v2' ? '<p>Protokol <img src="https://sledovani.example/pixel.gif" width="1" height="1"></p>' : '', prilohy: [] }]) }),
  kalendar: (d) => ({ udalosti: kalendarPrazdny ? [] : [
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
    pitiJidlo: JSON.parse(JSON.stringify(pitiDny)), tydenni: tydenniMock ? JSON.parse(JSON.stringify(tydenniMock)) : null, jidlaMichal: JSON.parse(JSON.stringify(jidlaMichalMock)),
    rezim: { kofeinDo: '14:00', treninkDny: [], zapasTymy: ['A'], hlavni: rezimHlavni || undefined, cilVahy: { kg: 70, do: iso(den(150)), od: { kg: 74, den: iso(den(-10)) } }, polozky: [{ id: 'kreatin', nazev: 'Kreatin', davka: '5 g', kdy: 'rano' },
      { id: 'kofein', nazev: 'Kofein', davka: 'před výkopem', kdy: 'zapas', jen: 'zapas' }, { id: 'horcik', nazev: 'Hořčík', davka: 'večer', kdy: 'vecer' }] } }),
  zdraviKlic: () => ({ klic: 'testovaci-klic-zdravi' }),
  zmeny: () => ({ auto: 0, zdravi: 0 }),
  // jako motor 2026-10-10: den nejvýš 14 dní zpátky a ne do budoucna; přesun i smazání najdou zápis podle id v kterémkoli dni
  pitiJidlo: (d) => {
    pitiVolani.push({ den: d.den, jak: d.jak, ml: d.ml, co: d.co, bilkoviny: d.bilkoviny, id: d.id, doplnky: d.doplnky });
    if (d.jak !== 'smazat' && (d.den > iso(Date.now()) || d.den < iso(den(-14)))) throw new Error('Den mimo 14 dní zpátky.');
    const zDne = (x) => (pitiDny[x] = pitiDny[x] || { piti: [], jidlo: [] });
    const najdi = () => { for (const k of Object.keys(pitiDny)) for (const druh of ['jidlo', 'piti']) { const i = (pitiDny[k][druh] || []).findIndex((x) => x.id === d.id); if (i >= 0) return { k, druh, i }; } return null; };
    if (d.jak === 'piti') zDne(d.den).piti.push({ id: 'p' + pitiVolani.length, kdy: Date.now(), ml: d.ml });
    if (d.jak === 'jidlo') zDne(d.den).jidlo.push({ id: 'j' + pitiVolani.length, kdy: Date.now(), co: d.co, bilkoviny: d.bilkoviny, kcal: d.kcal, odhad: d.odhad ? 'mistni' : undefined });
    if (d.jak === 'smazat' || d.jak === 'presun') {
      const n = najdi();
      if (!n && d.jak === 'presun') throw new Error('Zápis už není – obnov stránku.');
      if (n) { const x = pitiDny[n.k][n.druh].splice(n.i, 1)[0]; if (d.jak === 'presun') zDne(d.den)[n.druh].push(x); }
    }
    return { dny: JSON.parse(JSON.stringify(pitiDny)) };
  },
  // jako motor 2026-10-16.2: odpověď Claudovi k jídlu (čip, pole, Upřesnit) → odpoved k jídlu, „Claude přepočítá“
  jidloOdpoved: (d) => {
    let j = null;
    Object.keys(pitiDny).forEach((k) => (pitiDny[k].jidlo || []).forEach((x) => { if (x.id === d.id) j = x; }));
    if (!j) throw new Error('Jídlo už není – obnov stránku.');
    if (!String(d.text || '').trim()) throw new Error('Napiš odpověď.');
    j.odpoved = { text: d.text, kdy: Date.now(), otazka: j.otazka ? j.otazka.text : '' };
    delete j.otazka;
    j.prepocet = true;
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
    // v testech plakátů jen zápasy s pevným datem: zápasy „za 2–3 dny“ by v týdnu před 17. nebo 24. 10. padly na plakát
    // (15. 10. dorost doma s Těšany v neděli 18. 10. = druhá velká dlaždice, test „jediná velká dlaždice“ selhal)
    zapasy: fotbalPlakat ? JSON.parse(JSON.stringify(ZAPASY_PLAKAT)) : [zapasFotbal('A', -6, 16, 'FK Agro Vnorovy', 'TJ Lysovice', '1:3'), zapasFotbal('A', 2, 15, 'FK Šardice', 'FK Agro Vnorovy', ''),
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
    popiskyPlanu: Object.assign({}, reelyPopisky), pribehy: JSON.parse(JSON.stringify(pribehyTest)), planPribehu: JSON.parse(JSON.stringify(pribehyPlan)),
    instagram: { nastaveno: true, ucet: 'klub_test' }, reely: REELY_TEST.map(reelTestu), skupiny: JSON.parse(JSON.stringify(skupinyTest)) }),
  // skupiny lidí k označení (motor REELY/skupiny.json) – jako SKUPINY_ v motoru: jména bez @ malými, nejvýš 50, 30 skupin
  igSkupiny: () => ({ skupiny: JSON.parse(JSON.stringify(skupinyTest)) }),
  igSkupinaUlozit: (d) => {
    skupinyVolani.push(JSON.parse(JSON.stringify(d)));
    let sk = d.id ? skupinyTest.find((x) => x.id === d.id) : null;
    const nova = !sk;
    const nazev = d.nazev == null ? null : String(d.nazev).replace(/\s+/g, ' ').trim();
    if (nova || nazev != null) {
      if (!nazev) throw new Error('Napiš název skupiny.');
      if (skupinyTest.some((x) => x !== sk && x.nazev.toLowerCase() === nazev.toLowerCase())) throw new Error('Skupina „' + nazev + '“ už je.');
    }
    if (nova) { sk = { id: d.id || 'sk_test' + String(skupinyTest.length + 1).padStart(6, '0'), nazev, ucty: [], barva: d.barva || 'fialova' }; skupinyTest.push(sk); } else if (nazev) sk.nazev = nazev;
    if (d.ucty != null) {
      const ucty = (Array.isArray(d.ucty) ? d.ucty : String(d.ucty).split(/[\s,;]+/)).map((u) => String(u).replace(/^@/, '').toLowerCase()).filter(Boolean);
      if (ucty.some((u) => !/^[a-z0-9._]{1,30}$/.test(u))) throw new Error('Neplatné jméno účtu na Instagramu');
      if (ucty.length > 50) throw new Error('Ve skupině může být nejvýš 50 účtů.');
      sk.ucty = ucty.filter((u, i) => ucty.indexOf(u) === i);
    }
    return { skupiny: JSON.parse(JSON.stringify(skupinyTest)), skupina: JSON.parse(JSON.stringify(sk)) };
  },
  igSkupinaSmazat: (d) => {
    skupinyVolani.push({ smazat: d.id });
    const i = skupinyTest.findIndex((x) => x.id === d.id);
    const smazana = i >= 0 ? skupinyTest.splice(i, 1)[0] : null;
    return { skupiny: JSON.parse(JSON.stringify(skupinyTest)), smazana };
  },
  reelStav: (d) => { if (d.zverejneno) reelyZverejneno[d.id] = iso(ted); else delete reelyZverejneno[d.id]; return { zverejneno: Object.assign({}, reelyZverejneno) }; },
  // úprava popisku z aplikace (motor 2026-10-15.2, REELY/upravy.json): prázdný / stejný jako z PC / vratit = původní
  reelPopisekUlozit: (d) => {
    const r = REELY_TEST.find((x) => x.id === d.id);
    if (!r) throw new Error('Reel už není v REELY/reely.json.');
    const text = d.vratit ? '' : String(d.text || '');
    if (text.length > 2200) throw new Error('Popisek je delší než 2 200 znaků – Instagram ho nevezme.');
    if (text.trim() && text.trim() !== r.popisek.trim()) reelyUpravy[d.id] = text; else delete reelyUpravy[d.id];
    const z = reelyPlan[d.id];
    if (z && z.stav === 'ceka' && !z.jenPribeh) { if (reelyUpravy[d.id]) reelyPopisky[d.id] = text.trim(); else delete reelyPopisky[d.id]; }
    return { reel: reelTestu(r), popiskyPlanu: Object.assign({}, reelyPopisky), plan: JSON.parse(JSON.stringify(reelyPlan)) };
  },
  reelPopisekNavrhy: (d) => {
    const r = REELY_TEST.find((x) => x.id === d.id);
    if (!r) throw new Error('Reel už není v REELY/reely.json.');
    reelyNavrhyPozadano[d.id] = Date.now();
    return { reel: reelTestu(r) };
  },
  // příběh z fotky (motor 2026-10-15.2): fotka do seznamu (stejný otisk = stejný příběh), plán PRIBEHY_PLAN
  pribehNaplanovat: (d) => {
    const ucty = (Array.isArray(d.oznacit) ? d.oznacit : String(d.oznacit || '').split(/[\s,;]+/)).filter(Boolean).map((u) => String(u).replace(/^@/, '').toLowerCase());
    let id = String(d.id || '');
    if (d.obrazek) {
      if (!/^data:image\/jpeg;base64,/.test(String(d.obrazek))) throw new Error('Fotka příběhu nepřišla (čekám JPEG).');
      id = 'pribeh_' + (d.otisk || '0123456789abcdef');
      if (!pribehyTest.some((x) => x.id === id)) pribehyTest.unshift({ id, nahled: String(d.nahled || ''), vytvoreno: Date.now() });
    } else if (!pribehyTest.some((x) => x.id === id)) throw new Error('Příběh už v seznamu není – vyber fotku znovu.');
    pribehyPlan[id] = { kdy: d.kdy, stav: 'ceka', jenPribeh: true, oznacit: ucty };
    return { id, plan: JSON.parse(JSON.stringify(pribehyPlan)), pribehy: JSON.parse(JSON.stringify(pribehyTest)) };
  },
  pribehZrusit: (d) => {
    delete pribehyPlan[d.id];
    const i = pribehyTest.findIndex((x) => x.id === d.id);
    if (i >= 0) pribehyTest.splice(i, 1);
    return { plan: JSON.parse(JSON.stringify(pribehyPlan)), pribehy: JSON.parse(JSON.stringify(pribehyTest)) };
  },
  reelNaplanovat: (d) => {
    reelyNaplanovano.push(d);
    const r = REELY_TEST.find((x) => x.id === d.id);
    reelyPlan[d.id] = Object.assign({ kdy: d.kdy, stav: 'ceka', oznacit: String(d.oznacit || '').split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^@/, '').toLowerCase()), upraveno: true },
      d.jenPribeh ? { jenPribeh: true } : { pribeh: !!d.pribeh });
    if (d.jenPribeh || !d.popisek) delete reelyPopisky[d.id];
    else { reelyPopisky[d.id] = d.popisek; if (r && d.popisek !== r.popisek) reelyUpravy[d.id] = d.popisek; }
    delete reelyZverejneno[d.id]; // vyšel jen příběh → i jako reel
    return { plan: Object.assign({}, reelyPlan), popisky: Object.assign({}, reelyPopisky), zverejneno: Object.assign({}, reelyZverejneno), reel: r ? reelTestu(r) : null };
  },
  reelZrusitPlan: (d) => { delete reelyPlan[d.id]; delete reelyPopisky[d.id]; return { plan: Object.assign({}, reelyPlan), popisky: Object.assign({}, reelyPopisky) }; },
  // plakáty (motor 2026-10-09.3, CLAUDE_SCHRANKA/PLAKATY): ruční úpravy kol, nastavení, popisky, obrázky a plán na Instagram
  plakaty: () => JSON.parse(JSON.stringify(Object.assign({}, plakatyData, { ig: plakatyIg, skupiny: skupinyTest }))),
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
    // u plakátu, který čeká na čas, i popisek plánu (motor 2026-10-15.1)
    const z = plakatyData.plan[d.tyden], pop = plakatyData.popisky[d.tyden];
    if (z && z.stav === 'ceka' && pop.plan && String(d.text || '').trim()) Object.assign(pop, { plan: String(d.text).trim(), planKdy: Date.now() });
    return { popisky: JSON.parse(JSON.stringify(plakatyData.popisky)) };
  },
  plakatObrazky: (d) => {
    if (!/^data:image\/jpeg;base64,/.test(String(d.prispevek || ''))) throw new Error('Obrázek pro příspěvek chybí nebo není JPEG.');
    plakatyData.obrazky[d.tyden] = { prispevek: true, pribeh: !!d.pribeh, kdy: Date.now() };
    return { obrazky: JSON.parse(JSON.stringify(plakatyData.obrazky)) };
  },
  // popisek z okna plánu se drží k plánu (popisky[t].plan) a je i popiskem kola; oznacit = účty na obrázku (motor 2026-10-15.1)
  plakatNaplanovat: (d) => {
    if (!plakatyData.obrazky[d.tyden]) throw new Error('Chybí obrázek plakátu – vyrob ho v aplikaci znovu.');
    const vlastni = d.jenPribeh ? '' : String(d.popisek || '').trim();
    if (!vlastni && !d.jenPribeh && !(plakatyData.popisky[d.tyden] || {}).text) throw new Error('Plakát nemá popisek – bez něj ho na Instagram nepošlu.');
    const pop = plakatyData.popisky[d.tyden] = Object.assign({}, plakatyData.popisky[d.tyden]);
    if (vlastni) {
      if (String(pop.text || '').trim() !== vlastni) Object.assign(pop, { text: vlastni, zdroj: 'rucne', kdy: Date.now() });
      Object.assign(pop, { plan: vlastni, planKdy: Date.now() });
    } else { delete pop.plan; delete pop.planKdy; }
    const oznacit = String(d.oznacit || '').split(/[\s,;]+/).filter(Boolean).map((u) => u.replace(/^@/, '').toLowerCase());
    plakatyData.plan[d.tyden] = Object.assign({ kdy: d.kdy, stav: 'ceka' }, d.jenPribeh ? { jenPribeh: true } : { pribeh: !!d.pribeh }, oznacit.length ? { oznacit } : {});
    return { plan: JSON.parse(JSON.stringify(plakatyData.plan)), popisky: JSON.parse(JSON.stringify(plakatyData.popisky)) };
  },
  plakatZrusitPlan: (d) => {
    delete plakatyData.plan[d.tyden];
    if (plakatyData.popisky[d.tyden]) { delete plakatyData.popisky[d.tyden].plan; delete plakatyData.popisky[d.tyden].planKdy; }
    return { plan: JSON.parse(JSON.stringify(plakatyData.plan)), popisky: JSON.parse(JSON.stringify(plakatyData.popisky)) };
  },
  // průběh zveřejňování na Instagram (motor 2026-10-11.2): igStav jen čte, igKrok posune o fázi jako motor po krocích
  // (reel: ceka → zpracovává → hotovo; plakát – obrázek – rovnou hotovo); igZaseknuto = Instagram video pořád zpracovává
  igStav: () => igPrehled(),
  igKrok: (d) => {
    igKroky.push({ typ: d.typ, id: d.id, ted: !!d.ted, znovu: !!d.znovu });
    const plan = d.typ === 'plakat' ? plakatyData.plan : d.typ === 'pribeh' ? pribehyPlan : reelyPlan;
    if (!plan[d.id]) throw new Error('Příspěvek není v plánu – naplánuj ho znovu.');
    const t = Date.now();
    const z = plan[d.id];
    if (d.ted && z.stav === 'ceka') z.kdy = Math.min(z.kdy, t);
    if (d.znovu && z.stav !== 'hotovo' && z.stav !== 'ceka') plan[d.id] = { kdy: t, stav: 'ceka', pribeh: z.pribeh, oznacit: z.oznacit };
    const x = plan[d.id];
    const k = (x.kroky = x.kroky || {});
    const hotovo = () => {
      Object.assign(k, { zverejnuji: t, hotovo: t }, x.pribeh ? { pribeh: t } : {});
      Object.assign(x, { stav: 'hotovo', zverejneno: t, odkaz: 'https://www.instagram.com/reel/TEST' + d.typ + '/', kontejner: '', mediaPribeh: x.pribeh && !x.jenPribeh ? 'media-2' : '', pribehChyba: '' });
      delete x.stavIg;
      if (d.typ === 'reel') reelyZverejneno[d.id] = iso(t);
    };
    if (x.stav === 'ceka' && x.kdy <= t + 60e3) {
      Object.assign(x, { stav: 'nahrava', kontejner: 'kontejner-1', stavIg: 'IN_PROGRESS', kontrola: t });
      Object.assign(k, { priprava: t, zpracovani: t });
      if (d.typ === 'plakat' || d.typ === 'pribeh') hotovo();
    } else if ((x.stav === 'nahrava' || x.stav === 'zverejnuji') && !igZaseknuto) hotovo();
    else if (x.stav === 'nahrava') x.kontrola = t;
    return igPrehled();
  },
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
    if (autoUctenkaChyba) throw new Error(autoUctenkaChyba); // test: chyba motoru (účtenka zůstane v zařízení)
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
  // jako motor (AUTO_ODLOZENE): odložená připomínka jde do odlozene, null ji vrátí, 'hotovo' = ručně hotová
  autoPripominkaOdlozit: (d) => {
    autoOdlozeni.push({ pripominka: d.pripominka, do: d.do });
    if (d.klic !== KLIC) throw new Error('klíč motoru přepsaný');
    const vse = (autoData.pripominky || []).concat(autoData.odlozene || []);
    const x = vse.find((y) => y.klic === d.pripominka);
    if (!x) throw new Error('Neznámá připomínka.');
    if (x.stav === 'odlozeno') { x.stav = x.stavPak || 'ted'; delete x.odlozeno; delete x.odlozenoDo; }
    if (d.do) {
      const [r, m, dd] = String(d.do).split('-').map(Number);
      Object.assign(x, { stavPak: x.stav === 'naplanovano' ? 'ted' : x.stav, stav: 'odlozeno', odlozeno: d.do }, d.do === 'hotovo' ? {} : { odlozenoDo: new Date(r, m - 1, dd).getTime() });
    }
    autoData.pripominky = vse.filter((y) => y.stav !== 'odlozeno');
    autoData.odlozene = vse.filter((y) => y.stav === 'odlozeno');
    return JSON.parse(JSON.stringify(autoData));
  },
  // Knihovna (motor 2026-10-11.5, CLAUDE_SCHRANKA/KNIHOVNA): karty, index rešerší, můj stav, požadavky – testy data mění jako Claude
  knihovna: () => Object.assign(JSON.parse(JSON.stringify(knihovnaTest)), { ted: Date.now() }),
  knihovnaReserse: (d) => {
    if (d.id !== RESERSE_TEST.id) throw new Error('Rešerše v knihovně není – obnov stránku.');
    return JSON.parse(JSON.stringify(RESERSE_TEST));
  },
  knihovnaPridat: (d) => {
    knihovnaVolani.push({ akce: 'knihovnaPridat', druh: d.druh, text: d.text });
    const text = String(d.text || '').replace(/\s+/g, ' ').trim();
    if (['film', 'serial', 'kniha', 'reserse'].indexOf(d.druh) < 0 || text.length < 2) throw new Error('Napiš název nebo téma.');
    if (!knihovnaTest.pozadavky.some((x) => x.druh === d.druh && x.text.toLowerCase() === text.toLowerCase())) {
      knihovnaTest.pozadavky.push({ id: 'p-20261011-1200-' + String(knihovnaVolani.length).padStart(2, '0'), druh: d.druh, text, kdy: new Date().toISOString() });
    }
    return motor.knihovna();
  },
  knihovnaMoje: (d) => {
    knihovnaVolani.push({ akce: 'knihovnaMoje', id: d.id, stav: d.stav, hodnoceni: d.hodnoceni, poznamka: d.poznamka });
    if (!knihovnaTest.karty.some((x) => x.id === d.id) && !knihovnaTest.reserse.some((x) => x.id === d.id)) throw new Error('Položka v knihovně není – obnov stránku.');
    const x = Object.assign({}, knihovnaTest.moje[d.id]);
    if (d.stav !== undefined) x.stav = d.stav || undefined;
    if (d.hodnoceni !== undefined) x.hodnoceni = Number(d.hodnoceni) || undefined;
    if (d.poznamka !== undefined) x.poznamka = String(d.poznamka || '').trim() || undefined;
    Object.keys(x).forEach((k) => { if (x[k] === undefined) delete x[k]; });
    if (Object.keys(x).length) knihovnaTest.moje[d.id] = x; else delete knihovnaTest.moje[d.id];
    return motor.knihovna();
  },
  knihovnaZrusit: (d) => {
    knihovnaVolani.push({ akce: 'knihovnaZrusit', id: d.id });
    const i = knihovnaTest.pozadavky.findIndex((x) => x.id === d.id);
    if (i < 0) throw new Error('Požadavek už není – obnov stránku.');
    knihovnaTest.pozadavky.splice(i, 1);
    return motor.knihovna();
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
let vlaknoV2Kopie = '';           // kopie u zprávy v2 (test Odpovědět všem v nabídce)
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
const autoOdlozeni = [];           // autoPripominkaOdlozit: { pripominka, do }
let autoUctenkaChyba = '';          // chyba motoru při čtení účtenky (test fronty v zařízení)
let motorBezSite = false;           // motor nedostupný (bez sítě) – spolu s ctx.setOffline
let postaNavic = {};              // test záložek: aktualizace v Doručené, čísla záložek a přehled od Clauda
const doplnkyDny = {}, doplnkyVolani = []; // odškrtnuté doplňky (motor: ZDRAVI/DOPLNKY.json)
let jmeninyOblibeni = [];          // oblíbení lidé (jmeniny v kalendáři)
const pitiDny = {}, pitiVolani = []; // pití a jídlo (motor: ZDRAVI/PITI_JIDLO.json)
let jidlaMichalMock = { polozky: [] }; // Michalova jídla a recepty (motor: zdravi.jidlaMichal ze ZDRAVI/JIDLA_MICHAL.json – píše Claude)
let rezimHlavni = null;             // hlavní doplňky v režimu (ZDRAVI_REZIM.json → hlavni); null = počítá se vše
let tydenniMock = null;             // týdenní shrnutí od Clauda (motor: zdravi.tydenni)
const postaPresuny = [], postaPrecteno = [];
const postaOznaceni = [];           // postaOznacit (výběr, pravé tlačítko, rychlé akce, Beru na vědomí): { ids: [{ id, kdy, neprectena }], jak }
const vedomiTest = {};              // Beru na vědomí v napodobeném motoru: id → čas poslední zprávy
const STITKY_VYCHOZI = [{ nazev: 'Fotbal', neprectenych: 1 }, { nazev: 'Účty', neprectenych: 0 }];
let stitkyMotoru = STITKY_VYCHOZI;   // štítky Gmailu (test lišty skupin je rozšíří)
const zpozdeniMotoru = {};          // akce → ms (pomalý motor: test přednačtení měří klepnutí s ním a bez něj)
const chybaMotoru = {};             // akce → text chyby, kterou motor vrátí (zápis na pozadí se nepovedl – aplikace ho má vrátit)
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
    { id: 'pojisteni', klic: 'poj-t', nazev: 'Výročí pojištění', text: 'Zkontroluj platbu.', od: den(5), do: den(35), stav: 'brzy', hotovo: false },
    // termín v kalendáři (motor 2026-10-15.3): naplánováno – na Přehledu ne, na stránce Auto šedě s dnem
    { id: 'stk', klic: 'stk-t', nazev: 'STK', text: 'STK platí do konce měsíce.', od: den(-10), do: den(20), stav: 'naplanovano', stavPak: 'ted', hotovo: false,
      plan: { kdy: den(4, 9), nazev: 'STK Hodonín' } }],
  odlozene: [],
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
// reely: včerejší dorost (nezveřejněný, s popiskem a videem) a starší béčko (video se ještě nahrává, bez popisku)
const REELY_TEST = [
    { id: 'reel_dorost_tesany', nazev: 'Vnorovy – Těšany 3:1', varianta: '', tymy: ['dorost'], tymNazev: 'Dorost', datum: iso(den(-1)), vyrobeno: iso(ted) + 'T07:48',
      delka: 48.2, velikost: 51.3, video: true, odkaz: 'https://drive.google.com/file/d/TEST/view', nahled: '',
      popisek: 'Hattrick! ⚽⚽⚽\n\nDorost doma porazil Těšany 3:1.\n\nDalší zápas v neděli venku.\n\n#fkagrovnorovy #dorost',
      zapasy: [{ datum: iso(den(-1)), tym: 'dorost', domaci: 'Vnorovy', hoste: 'Těšany', souper: 'Těšany', skore: '3:1', soutez: '5. liga starší dorost' }] },
    { id: 'reel_benfika_lipov', nazev: 'Vnorovy B – Lipov 4:5', varianta: '', tymy: ['B'], tymNazev: 'B-tým', datum: iso(den(-23)), vyrobeno: iso(den(-22)) + 'T20:00',
      delka: 42.6, velikost: 30, video: true, odkaz: '', nahled: '', popisek: '',
      zapasy: [{ datum: iso(den(-23)), tym: 'B', domaci: 'Vnorovy B', hoste: 'Lipov', souper: 'Lipov', skore: '4:5', soutez: '9. liga dospělí' }] }];
let reelyZverejneno = {};
const reelyPlan = {}, reelyPopisky = {}, reelyNaplanovano = [];
// 15. 10.: úpravy popisků (REELY/upravy.json), návrhy od Clauda (REELY/popisky_claude.json), příběhy z fotek (PRIBEHY_PLAN)
const reelyUpravy = {}, reelyNavrhy = {}, reelyNavrhyPozadano = {};
const pribehyTest = [], pribehyPlan = {};
// skupiny k označení (napodobený REELY/skupiny.json) – vymyšlená jména; testy si je nastaví přes skupinyVychozi()
const skupinyTest = [], skupinyVolani = [];
const SKUPINY_VYCHOZI = [{ id: 'sk_test000001', nazev: 'Dorost – hráči', ucty: ['hrac_ukazka1', 'hrac_ukazka2', 'hrac_ukazka3'], barva: 'zelena' },
  { id: 'sk_test000002', nazev: 'Trenéři', ucty: ['trener_ukazka', 'hrac_ukazka1'], barva: 'modra' }];
function skupinyVychozi(seznam) {
  skupinyTest.length = 0;
  skupinyVolani.length = 0;
  (seznam || SKUPINY_VYCHOZI).forEach((x) => skupinyTest.push(JSON.parse(JSON.stringify(x))));
}
skupinyVychozi();
/** Reel jako z motoru: s úpravou popisku a návrhy od Clauda. */
function reelTestu(r) {
  const u = reelyUpravy[r.id], n = reelyNavrhy[r.id];
  return Object.assign(JSON.parse(JSON.stringify(r)), u ? { popisek: u, upraveno: true, puvodni: r.popisek } : {}, n ? { navrhy: JSON.parse(JSON.stringify(n)) } : {},
    reelyNavrhyPozadano[r.id] && !(n && n.kdy > reelyNavrhyPozadano[r.id]) ? { cekaNaClauda: true } : {});
}
// průběh zveřejňování na Instagram: volání igKrok, „Instagram video pořád zpracovává“, kdy naposledy běžel spouštěč (0 = před 4 min)
const igKroky = [];
let igZaseknuto = false, igSpoustec = 0;
const igPrehled = () => JSON.parse(JSON.stringify({ ted: Date.now(), spoustec: igSpoustec || Date.now() - 4 * 60e3, reely: reelyPlan, plakaty: plakatyData.plan, pribehy: pribehyPlan,
  zverejneno: reelyZverejneno, popiskyPlanu: reelyPopisky }));
let vahaZaznamy = [];
let pocasiDomov = null; // domov pro počasí (akce pocasiDomov)
let kalendarPrazdny = false;  // test prázdného týdne na Dnes (žádné události)
let upozorneniStav = { zapnuto: false, tema: '' }, upozorneniOdeslano = 0;
// plakáty: data motoru (testy si je mění, jako když popisek napíše Claude)
const plakatyData = { nastaveni: {}, kola: {}, popisky: {}, plan: {}, obrazky: {} };
const plakatyIg = { nastaveno: true, ucet: 'fkagrovnorovy' };
// zápasy na plakát 17.–18. a 24.–25. 10. 2026 jako ve FOTBAL.json (přeložené a s poznámkou svazu). Jen v testech plakátů –
// pevná data by jinak měnila testy, které počítají s dneškem (doplňky v den zápasu áčka, další zápas). Testy plakátů mají
// i pevné „teď“ v prohlížeči (pevnyCasPlakatu: pondělí 12. 10. 2026) – výchozí víkend a popisky nezávisí na dni spuštění.
let fotbalPlakat = false;
const TED_PLAKATU = new Date('2026-10-12T10:00:00+02:00');
const pevnyCasPlakatu = (page) => page.clock.setSystemTime(TED_PLAKATU);
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

// Knihovna: vymyšlené karty (film s plakátem a sérií, seriál s obrázkem, který nejde načíst, kniha), jedna rešerše
const KNIHOVNA_VYCHOZI = () => ({
  karty: [
    { id: 'film-zkusebni-let', druh: 'film', nazev: 'Zkušební let', original: 'Test Flight', rok: 2020, delka: '120 min', zeme: 'Česko',
      tvurci: [{ role: 'režie', jmena: ['Jana Testová'] }, { role: 'hrají', jmena: ['Karel Zkušební', 'Eva Pokusná'] }], zanry: ['drama', 'letecký'],
      obrazek: { url: 'https://upload.wikimedia.org/test/plakat.png', zdroj: 'Wikipedie', popis: 'plakát' },
      hodnoceni: [{ zdroj: 'ČSFD', hodnota: '80 %', url: 'https://www.csfd.cz/film/1-zkusebni-let/' }, { zdroj: 'IMDb', hodnota: '7,5/10', url: 'https://www.imdb.com/title/tt0000001/' }],
      kratce: 'Pilotka testuje nové letadlo.', obsah: 'První odstavec děje.\n\nDruhý odstavec bez spoilerů.', proc: 'Krásné záběry z kokpitu.',
      zajimavosti: ['Natáčelo se v hangáru.', 'Herečka sama pilotuje.'], skutecnost: 'Podle skutečné zkušební pilotky, jména jsou změněná.', oceneni: ['Cena za kameru (test)'],
      serie: { nazev: 'Lety', poradi: 'Podle roku vydání.', dily: [{ nazev: 'Zkušební let', rok: 2020, delka: '120 min' },
        { nazev: 'Druhý let', original: 'Second Flight', rok: 2023, delka: '115 min', pozn: 'prodloužená verze 140 min' }] },
      kdeSledovat: { text: 'Na streamovací službě s dabingem.', overeno: '2026-10-11' },
      souvisi: [{ id: 'reserse-letectvi', proc: 'jak letadla létají' }, { id: 'film-druhy-let', proc: 'pokračování' }],
      stitky: ['letadla'], odkazy: [{ nazev: 'ČSFD', url: 'https://www.csfd.cz/film/1-zkusebni-let/' }], zdroje: [{ nazev: 'Wikipedie – test', url: 'https://cs.wikipedia.org/wiki/Test' }],
      // rozšířená karta (12. 10.): herci (jeden s fotkou z Commons, druhý jen iniciály), lidé za kamerou, fakta, sekce, citát, podobné
      herci: [{ jmeno: 'Karel Zkušební', postava: 'kapitán Novák', o: 'Znáš ho z jiných testů.', foto: 'https://upload.wikimedia.org/test/herec.png',
        fotoStranka: 'https://commons.wikimedia.org/wiki/File:Herec.png' }, { jmeno: 'Eva Pokusná', postava: 'pilotka Jana', o: 'Sama pilotuje.' }],
      lide: [{ jmeno: 'Jana Testová', role: 'režie', o: 'Druhý film.' }],
      fakta: [{ co: 'Rozpočet', hodnota: '10 mil. Kč' }, { co: 'Natáčecích dní', hodnota: '40' }, { co: 'Formát', hodnota: 'IMAX a 35 mm, část černobíle' }],
      sekce: [{ id: 'vznik', nadpis: 'Jak film vznikal: hangár a letiště', odstavce: ['Natáčelo se v hangáru u letiště.'], body: ['léto 2019'] },
        { id: 'hudba', nadpis: 'Hudba a zvuk', odstavce: ['Hudba z kokpitu.'] }],
      citaty: [{ text: 'Letíme výš!', kdo: 'pilotka Jana' }],
      podobne: [{ nazev: 'Maják', rok: 2019, proc: 'Tajemství u moře.', id: 'serial-majak' }, { nazev: 'Nebeští jezdci', rok: 1968, proc: 'Klasika o letcích.' }],
      pripraveno: new Date(ted - 2 * H).toISOString() },
    { id: 'serial-majak', druh: 'serial', nazev: 'Maják', roky: '2019–2022', obrazek: { url: 'https://upload.wikimedia.org/test/chybi.png' }, kratce: 'Správkyně majáku na ostrově.',
      hodnoceni: [{ zdroj: 'ČSFD', hodnota: '84 %' }], pripraveno: new Date(ted - 9 * 24 * H).toISOString() },
    { id: 'kniha-maly-princ', druh: 'kniha', nazev: 'Malý princ', rok: 1943, stran: 96, tvurci: [{ role: 'autor', jmena: ['Antoine de Saint-Exupéry'] }],
      kratce: 'Pohádka pro dospělé.', pripraveno: new Date(ted - 20 * 24 * H).toISOString() }
  ],
  reserse: [{ id: 'reserse-letectvi', nazev: 'Jak létá letadlo', kratce: 'Křídlo vychyluje vzduch dolů – vzniká vztlak.', stitky: ['fyzika'],
    pripraveno: new Date(ted - 30 * H).toISOString() }],
  moje: { 'kniha-maly-princ': { stav: 'chci' } },
  pozadavky: [],
  chybne: []
});
const RESERSE_TEST = { id: 'reserse-letectvi', nazev: 'Jak létá letadlo', otazka: 'Proč letadlo nespadne?', kratce: 'Křídlo vychyluje vzduch dolů – vzniká vztlak.',
  sekce: [{ nadpis: 'Vztlak', odstavce: ['Křídlo vychyluje proud vzduchu dolů.'], body: ['úhel náběhu', 'rychlost'] }, { nadpis: 'Motory', odstavce: ['Tah motorů drží rychlost.'] }],
  pojmy: [{ pojem: 'Vztlak', vysvetleni: 'Síla kolmá na proud vzduchu.' }, { pojem: 'Úhel náběhu', vysvetleni: 'Sklon křídla proti proudu vzduchu.' }],
  casovaOsa: [{ kdy: '1903', co: 'První řízený motorový let.' }, { kdy: '1969', co: 'První let velkého dopravního letadla.' }],
  cisla: [{ hodnota: '900 km/h', co: 'cestovní rychlost dopravních letadel' }, { hodnota: '11 km', co: 'cestovní výška' }],
  dalsiOtazky: ['Jak funguje vrtulník?', 'Proč letadla nelétají výš?'], souvisi: [{ id: 'film-zkusebni-let', proc: 'film o pilotce' }],
  zdroje: [{ nazev: 'Encyklopedie – vztlak', url: 'https://example.com/vztlak' }], stitky: ['fyzika'], pripraveno: new Date(ted - 30 * H).toISOString() };
let knihovnaTest = KNIHOVNA_VYCHOZI();
const knihovnaVolani = [];
/** Obrázky karet (upload.wikimedia.org: plakát jde, „chybi“ ne) a Wikipedie (shrnutí jen k „Interstellar (film)“) – nic ze sítě. */
async function knihovnaSit(page, wiki) {
  await page.route('https://upload.wikimedia.org/**', (route) => (/chybi/.test(route.request().url()) ? route.fulfill({ status: 404, body: '' })
    : route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(MALA_FOTKA.split(',')[1], 'base64') })));
  await page.route(/^https:\/\/(cs|en)\.wikipedia\.org\/api\/rest_v1\/page\/summary\//, (route) => {
    const u = route.request().url();
    if (wiki) wiki.push(decodeURIComponent(u.split('/summary/')[1]));
    const film = /\/cs\.wikipedia\.org\/.*\/summary\/Interstellar_\(film\)$/.test(u);
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(film ? { type: 'standard', title: 'Interstellar', description: 'film z roku 2014', extract: 'Sci-fi film o cestě červí dírou.',
        thumbnail: { source: 'https://upload.wikimedia.org/test/wiki.png' }, content_urls: { desktop: { page: 'https://cs.wikipedia.org/wiki/Interstellar_(film)' } } }
        : { type: 'disambiguation', title: 'x', extract: '' }) });
  });
}
/** Chyby stránky bez hlášky o obrázku, který záměrně nejde načíst (404 u „chybi.png“). */
const chybyKnihovny = (chyby) => chyby.filter((t) => !/Failed to load resource/.test(t));

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
    // bez sítě (ctx.setOffline): page.route by odpověď jinak doručil i offline
    if (motorBezSite) { await route.abort('internetdisconnected'); return; }
    const data = JSON.parse(route.request().postData() || '{}');
    let telo;
    // jako motor: opakovaný požadavek se stejným rid se podruhé neprovede (vrátí výsledek prvního běhu)
    if (data.rid && odpovediRid.has(data.rid)) telo = odpovediRid.get(data.rid);
    else if (data.klic !== KLIC) telo = { ok: false, chyba: 'klic' };
    else if (!motor[data.akce]) telo = { ok: false, chyba: 'Neznámá akce.' };
    else if (chybaMotoru[data.akce]) { volano.push(data); telo = { ok: false, chyba: chybaMotoru[data.akce] }; }
    else {
      volano.push(data);
      // jako motor: chyba akce = { ok: false, chyba } (aplikace ji ukáže; jinak by požadavek zůstal viset)
      try { telo = { ok: true, data: motor[data.akce](data) }; } catch (e) { telo = { ok: false, chyba: e.message }; }
    }
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
  // snímek celé stránky: obsah mimo obrazovku aplikace neskládá (content-visibility: auto – Pošta, karty na telefonu) a prohlížeč
  // by ho na snímku nechal prázdný → na dobu snímku vše vykreslit (jen kvůli kontrole očima, aplikace se nemění)
  const snimek = page.screenshot.bind(page);
  page.screenshot = async (volby) => {
    if (!(volby && volby.fullPage)) return snimek(volby);
    await page.evaluate(() => { const s = document.createElement('style'); s.id = '__cv'; s.textContent = '* { content-visibility: visible !important; }'; document.head.appendChild(s); });
    try { return await snimek(volby); } finally { await page.evaluate(() => { const s = document.getElementById('__cv'); if (s) s.remove(); }).catch(() => { /* stránka zavřená */ }); }
  };
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
/** Čeká na podmínku ve stránce, i asynchronní (import modulu) – page.waitForFunction slib nečeká a vrácený slib bere
 *  jako splněnou podmínku hned (ověřeno 10. 10.). */
async function cekejVeStrance(page, fn, arg, ms) {
  const konec = Date.now() + (ms || 6000);
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > konec) throw new Error('Nedočkal jsem se ve stránce: ' + String(fn).replace(/\s+/g, ' ').slice(0, 140));
    await new Promise((r) => setTimeout(r, 60));
  }
}
/** Po startu se na pozadí přednačtou pomalé oblasti (js/pripravenost.js) a stránka se pak ještě jednou překreslí (v prázdném
 *  zařízení třeba připomínky auta na Přehledu) – testy, které najíždějí myší, drží prst nebo měří karty, nejdřív počkají. */
const pripraveno = (page) => page.waitForFunction(() => window.asistentPripraveno === true, null, { timeout: 10000 });
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
  // rychlý start: index.html přednačte všechny moduly, které app.js při startu importuje (jinak je prohlížeč objevuje po
  // patrech); každý modul js/*.js musí být v sw.js SOUBORY (bez sítě by aplikace nenastartovala – 9. 10. chyběl jmeniny.js)
  await test('index.html: modulepreload = moduly, které app.js načítá při startu; sw.js: všechny moduly v SOUBORY', async () => {
    const poradi = [], fronta = ['app.js'], videno = new Set(['app.js']);
    while (fronta.length) {
      const src = fs.readFileSync(path.join(KOREN, 'js', fronta.shift()), 'utf8');
      const re = /^\s*import\s[^'"]*?from\s*['"]\.\/([^'"]+)['"]/gm;
      let m;
      while ((m = re.exec(src))) if (!videno.has(m[1])) { videno.add(m[1]); poradi.push(m[1]); fronta.push(m[1]); }
    }
    const html = fs.readFileSync(path.join(KOREN, 'index.html'), 'utf8');
    const preload = Array.from(html.matchAll(/<link rel="modulepreload" href="js\/([^"]+)">/g)).map((m) => m[1]);
    const chybi = poradi.filter((f) => preload.indexOf(f) < 0), navic = preload.filter((f) => poradi.indexOf(f) < 0);
    jistota(!chybi.length && !navic.length, 'modulepreload v index.html – chybí: ' + chybi.join(', ') + ' · navíc: ' + navic.join(', '));
    jistota(poradi.indexOf('ukazka.js') < 0, 'ukázková data (ukazka.js) se mají načítat až v ukázkovém režimu');
    const sw = fs.readFileSync(path.join(KOREN, 'sw.js'), 'utf8');
    const bezSw = fs.readdirSync(path.join(KOREN, 'js')).filter((f) => /\.js$/.test(f) && sw.indexOf("'js/" + f + "'") < 0);
    jistota(!bezSw.length, 'moduly chybí v sw.js SOUBORY: ' + bezSw.join(', '));
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

  // ---------- okamžitý snímek (Michal 9. 10.: „co nejrychlejší práce na stránce“): js/start.js ukáže poslední stránku hned po
  // načtení HTML, ještě než naběhnou moduly; aplikace ji pak smaže a vykreslí znovu – žádná dvojí id, klepnutí fungují
  await test('start.js: okamžitý snímek poslední stránky před moduly, aplikace ho vymění; jiný den / rozložení bez snímku; záchrana i pod snímkem; smazání dat ho smaže', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    const snimek = () => page.evaluate(() => JSON.parse(localStorage.getItem('asistent.data.snimek') || 'null'));
    let pust = null;
    const zdrz = async (route) => { await new Promise((r) => { pust = r; }); await route.continue(); };
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-pozornost .seznam [data-polozka-id="c1"]');
      await page.waitForSelector('#dl-tyden .agenda__den');
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); // odchod z aplikace
      const s = await snimek();
      jistota(s && s.pohled === 'dnes' && s.rozlozeni === 'pc' && /dl-pozornost/.test(s.casti.stranka) && /rail__btn/.test(s.casti.rail) && /dnes-kpi/.test(s.casti.horni),
        'snímek se neuložil: ' + JSON.stringify(s && { pohled: s.pohled, rozlozeni: s.rozlozeni }));
      // moduly aplikace se zdrží (pomalý telefon, pomalá síť) – snímek je vidět dřív než aplikace
      await page.route('**/js/app.js', zdrz);
      await page.reload({ waitUntil: 'commit' });
      await page.waitForFunction(() => document.documentElement.classList.contains('snimek') && !window.asistentBezi);
      jistota(await page.locator('#dl-pozornost [data-polozka-id="c1"]').count() === 1 && await page.isVisible('#rail .rail__btn') &&
        await page.isVisible('#dnes-kpi [data-pocasi]'), 'snímek: Dnes, levý pás a dlaždice hned');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_snimek_pred_aplikaci.png') });
      pust();
      await page.waitForFunction(() => window.asistentBezi && !document.documentElement.classList.contains('snimek'));
      await page.unroute('**/js/app.js');
      await page.waitForSelector('#dl-pozornost [data-polozka-id="c1"]');
      jistota(await page.evaluate(() => ['dl-pozornost', 'rail', 'dnes-kpi', 'dl-tyden', 'dl-moje'].every((id) => document.querySelectorAll('#' + id).length === 1)),
        'po startu aplikace dvojí id');
      await page.waitForTimeout(300);
      if (await page.locator('.okno-pozadi').count()) { await page.keyboard.press('Escape'); await page.waitForSelector('.okno-pozadi', { state: 'detached' }); } // Co je nového
      await page.click('#rail [data-cil="schranka"]');
      await page.waitForSelector('#p-schranka:not([hidden]) #sk-ukol');
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('#p-dnes:not([hidden]) #dl-pozornost .seznam');
      // snímek z jiného dne ani z jiného rozložení (PC × iPad) se neukáže; aplikace se při odchodu neuloží (asistentBezSnimku)
      for (const [popis, den, sirka] of [['jiný den', '2000-1-1', 1440], ['jiné rozložení (PC → iPad)', '', 900]]) {
        await page.evaluate((d) => {
          const x = JSON.parse(localStorage.getItem('asistent.data.snimek'));
          const t = new Date();
          x.den = d || t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate();
          x.rozlozeni = 'pc';
          localStorage.setItem('asistent.data.snimek', JSON.stringify(x));
          window.asistentBezSnimku = true; // přenačtení ho nepřepíše
        }, den);
        await page.setViewportSize({ width: sirka, height: 900 });
        await page.route('**/js/app.js', zdrz);
        await page.reload({ waitUntil: 'commit' });
        await page.waitForTimeout(400);
        jistota(await page.evaluate(() => !document.documentElement.classList.contains('snimek') && document.getElementById('aplikace').hidden), popis + ': snímek se neměl ukázat');
        pust();
        await page.waitForFunction(() => window.asistentBezi);
        await page.unroute('**/js/app.js');
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForSelector('#p-dnes #dl-pozornost .seznam');
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      jistota((await snimek()).den !== '2000-1-1', 'nový snímek po odchodu');
      // moduly se nenačtou (smíchané verze) a snímek je vidět → záchrana přesto za 8 s
      await page.route('**/js/app.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "import { neexistuje } from './pomocne.js'; neexistuje();" }));
      await page.reload({ waitUntil: 'commit' });
      await page.waitForFunction(() => document.documentElement.classList.contains('snimek'));
      await page.waitForSelector('.zachrana button', { timeout: 12000 });
      await page.unroute('**/js/app.js');
      // Nastavení → Aplikace → Smazat uložená data: snímek pryč a před přenačtením se znovu neuloží
      await page.reload();
      await page.waitForFunction(() => window.asistentBezi);
      await page.waitForSelector('#dl-pozornost .seznam');
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      jistota(!!(await snimek()), 'snímek před smazáním dat');
      await page.evaluate(() => import('/js/nastaveni.js').then((m) => m.otevriNastaveni('aplikace')));
      await page.route('**/js/app.js', zdrz);
      const prenacteni = page.waitForEvent('framenavigated');
      await page.click('[data-panel="nastaveni"] [data-nast="smazat-data"]');
      await prenacteni;
      await page.waitForTimeout(400);
      jistota(await page.evaluate(() => !document.documentElement.classList.contains('snimek') && !localStorage.getItem('asistent.data.snimek')),
        'po smazání dat snímek zůstal');
      pust();
      await page.waitForFunction(() => window.asistentBezi);
      await page.unroute('**/js/app.js');
      jistota(!chybyStranky.filter((c) => !/neexistuje|Failed to load module|does not provide an export/.test(c)).length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      if (pust) pust();
      await ctx.close();
    }
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
      await test(jmeno + ': Přehled, Schránka, Pošta, Kalendář bez chyb a bez přetékání', async () => {
        const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, motiv);
        await page.goto(WEB);
        await page.waitForFunction(() => document.querySelector('#dl-tyden .agenda__u') && document.querySelector('.vystraha') &&
          (window.innerWidth < 760 ? document.querySelector('.pozornost .pozor') : document.querySelector('#dl-pozornost .seznam')));
        const pretika = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        jistota(await pretika() <= 0, 'Přehled přetéká do strany');
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

  // ---------- Přehled (dřív Dnes; Michal 9. 10.): malé dlaždice v horní liště místo řady velkých čísel – počasí, připravenost, nepřečtené,
  // denní kroužky (šířky 2 : 2 : 1 : 1 podle nákresu); nic nepřetéká ani se netlačí přes hledání; jinde lišta jako dřív
  const SIRKY_HORNI = [VELIKOSTI[3], { nazev: 'pc-siroke', sirka: 1650, vyska: 1000, dotyk: false }, VELIKOSTI[2], VELIKOSTI[1],
    { nazev: 'ipad-uzky', sirka: 768, vyska: 1024, dotyk: true }];
  await test('Přehled: horní dlaždice – obsah, pořadí a šířky 2 : 2 : 1 : 1, nic nepřetéká ani nezakrývá hledání (PC, iPad)', async () => {
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
        // čtvrtý kroužek Doplňky: dnes platí kreatin a hořčík (kofein jen v den zápasu) – 4 dráhy + hodnota jen u pohybu
        jistota(/Voda 0,0 \/ 2,5 l/.test(m.krouzky) && /Bílkoviny 0 \/ 130 g/.test(m.krouzky) && /Pohyb 4\s000 \/ 8\s000 kroků \(50 %\)/.test(m.krouzky) &&
          /Doplňky 0 z 2 \(0 %\)/.test(m.krouzky) && m.kruhy === 5, kde + 'kroužky: ' + m.krouzky + ' · kruhů ' + m.kruhy);
        jistota(!m.velkaCisla, kde + 'na Přehledu zůstala řada velkých čísel');
        await page.locator('#horni').screenshot({ path: path.join(VYSTUP, v.nazev + (motiv === 'dark' ? '-tmavy' : '') + '_horni_dlazdice.png') });
        jistota(!chybyStranky.length, kde + 'chyby stránky: ' + chybyStranky.join(' | '));
        await ctx.close();
      }
    }
  });

  await test('Přehled: horní dlaždice – klepnutí: kroužky a připravenost do Zdraví, nepřečtené do Pošty; jinde lišta bez dlaždic', async () => {
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

  // ---------- Přehled (Michal 10. 10.): u dlaždic v horní liště vyjede karta místo textového title – „když najedu na ty
  // kroužky, chci aby se mi to hezky zobrazilo jakoby vyjeté“. Myš s prodlevou, do karty jde najet, klik vede dál,
  // klávesnice (Tab, šipka dolů, Esc), nic nepřetéká, tmavý i světlý režim
  const kartaBubliny = (page) => page.evaluate(() => {
    const k = document.getElementById('bublina-karta');
    if (!k || k.hidden || !k.classList.contains('videt')) return null;
    const r = k.getBoundingClientRect(), a = document.querySelector('[data-karta][aria-expanded="true"]');
    const ra = a ? a.getBoundingClientRect() : null;
    return { druh: k.dataset.druh, text: k.textContent.replace(/\s+/g, ' '), l: r.left, r: r.right, t: r.top, b: r.bottom, sirka: document.documentElement.clientWidth,
      vyska: innerHeight, kotva: ra && { b: ra.bottom, stred: ra.left + ra.width / 2 }, sipka: r.left + parseFloat(k.style.getPropertyValue('--sipka') || '0'),
      dole: k.classList.contains('dole'), pozadi: getComputedStyle(k).backgroundColor, plocha: getComputedStyle(document.body).backgroundColor };
  });
  const cekejNaKartu = async (page, druh) => {
    await page.waitForFunction((d) => { const k = document.getElementById('bublina-karta'); return k && !k.hidden && k.classList.contains('videt') && k.dataset.druh === d; }, druh);
    await page.waitForTimeout(260); // vyjetí (posun a zmenšení) dojede – rozměry bez přechodu
    return kartaBubliny(page);
  };
  const kartaNaObrazovce = (k, popis) => jistota(k && k.l >= 7.5 && k.r <= k.sirka - 7.5 && k.t >= 7.5 && k.b <= k.vyska - 7.5, popis + ': karta přetéká z obrazovky ' + JSON.stringify(k));
  await test('Přehled: vyjeté karty u horních dlaždic – myš s prodlevou, karta pod dlaždicí (kroužky, počasí, připravenost, pošta), do karty jde najet, klik vede dál, klávesnice, bez title (PC světlý i tmavý)', async () => {
    for (const motiv of ['light', 'dark']) {
      const kde = motiv === 'dark' ? 'tmavý: ' : '';
      const jmeno = 'pc' + (motiv === 'dark' ? '-tmavy' : '');
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], motiv);
      await page.goto(WEB);
      await page.waitForFunction(() => document.querySelector('#dnes-kpi [data-krouzky]') && /°C/.test((document.querySelector('#dnes-kpi [data-pocasi]') || {}).textContent || '') &&
        /72/.test((document.querySelector('#dnes-kpi [data-karta="zdravi"]') || {}).textContent || '') && document.querySelector('#dnes-kpi [data-karta="posta"][data-filtr-posty="neprectene"]'));
      jistota(!(await page.locator('#dnes-kpi [title], #rail .rail__btn[title], #rail .rail__logo[title], #rail .rail__ja[title]').count()), kde + 'zůstal textový title');
      // kroužky: najetí → po krátké prodlevě karta pod dlaždicí, šipka míří na dlaždici; 4 velké kroužky s čísly a cílem
      await page.hover('#dnes-kpi [data-krouzky]');
      jistota(!(await kartaBubliny(page)), kde + 'karta vyjela bez prodlevy');
      let k = await cekejNaKartu(page, 'krouzky');
      jistota(k.dole && k.t >= k.kotva.b && Math.abs(k.sipka - k.kotva.stred) < 2, kde + 'karta kroužků není pod dlaždicí: ' + JSON.stringify(k));
      kartaNaObrazovce(k, kde + 'kroužky');
      jistota(await page.locator('#bublina-karta .bk-krouzek').count() === 4 && /Voda/.test(k.text) && /0,0 \/ 2,5 l/.test(k.text) && /zbývá 2,5 l/.test(k.text) &&
        /Bílkoviny/.test(k.text) && /0 \/ 130 g/.test(k.text) && /Kroky/.test(k.text) && /4\s000 \/ 8\s000/.test(k.text) && /zbývá 4\s000/.test(k.text) &&
        /50\s*%/.test(k.text) && /Doplňky/.test(k.text) && /0 z 2/.test(k.text) && /zbývají 2/.test(k.text) && /0 ze 4/.test(k.text), kde + 'obsah karty kroužků: ' + k.text);
      jistota(k.pozadi !== k.plocha && await page.getAttribute('#dnes-kpi [data-krouzky]', 'aria-expanded') === 'true', kde + 'karta splývá s plochou / dlaždice bez aria-expanded');
      await page.screenshot({ path: path.join(VYSTUP, jmeno + '_karta_krouzky.png') });
      // do karty jde najet – zůstane; tlačítko Zdraví vede do Zdraví a kartu zavře
      await page.hover('#bublina-karta .bk-akce');
      await page.waitForTimeout(350);
      jistota((await kartaBubliny(page) || {}).druh === 'krouzky', kde + 'karta zmizela při najetí do ní');
      await page.click('#bublina-karta .bk-akce');
      await page.waitForSelector('#p-zdravi:not([hidden]) .zdravi-hero');
      await page.waitForFunction(() => document.getElementById('bublina-karta').hidden);
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('#dnes-kpi [data-pocasi]');
      // počasí: teď / dnes, dny s rozpětím, výstraha ČHMÚ; tlačítko Celá předpověď
      await page.hover('#dnes-kpi [data-pocasi]');
      k = await cekejNaKartu(page, 'pocasi');
      kartaNaObrazovce(k, kde + 'počasí');
      jistota(/Veselí nad Moravou/.test(k.text) && /Silné bouřky/.test(k.text) && /Zítra/.test(k.text) && /Bouřky/.test(k.text) && /25°/.test(k.text) &&
        await page.locator('#bublina-karta .bk-dny li').count() >= 3 && await page.locator('#bublina-karta .bk-vystraha--zluta').count() === 1 &&
        await page.locator('#bublina-karta [data-pocasi]').count() === 1, kde + 'obsah karty počasí: ' + k.text);
      await page.screenshot({ path: path.join(VYSTUP, jmeno + '_karta_pocasi.png') });
      // přejetí na vedlejší dlaždici: karta se vymění hned (bez prodlevy) – připravenost: kroužek zóny, spánek, HRV, 7 dní
      await page.hover('#dnes-kpi [data-karta="zdravi"]');
      k = await kartaBubliny(page);
      jistota(k && k.druh === 'zdravi', kde + 'přejetí na vedlejší dlaždici kartu hned nevyměnilo: ' + JSON.stringify(k && k.druh));
      jistota(/Připravenost/.test(k.text) && /72/.test(k.text) && /Zelená/.test(k.text) && /\+17 proti včerejšku/.test(k.text) && /6:30/.test(k.text) &&
        /HRV/.test(k.text) && /84/.test(k.text) && /Tep\s*49\s*bpm\s*v klidu/.test(k.text) && /96,4/.test(k.text) && /Hluboký/.test(k.text) &&
        await page.locator('#bublina-karta .bk-tyden > span').count() === 7, kde + 'obsah karty připravenosti: ' + k.text);
      kartaNaObrazovce(k, kde + 'připravenost');
      await page.waitForTimeout(260);
      await page.screenshot({ path: path.join(VYSTUP, jmeno + '_karta_pripravenost.png') });
      // pošta: stavy, co čeká; řádek otevře e-mail v Poště
      await page.hover('#dnes-kpi [data-karta="posta"]');
      k = await cekejNaKartu(page, 'posta');
      jistota(/1\s*nepřečtený/.test(k.text) && /1 čeká na tvou odpověď/.test(k.text) && /Otázky\s*1/.test(k.text) && /Nepřečtené\s*1/.test(k.text) && /Trenér/.test(k.text) &&
        /Sraz v sobotu/.test(k.text) && !/Investor/.test(k.text), kde + 'obsah karty pošty: ' + k.text);
      kartaNaObrazovce(k, kde + 'pošta');
      await page.screenshot({ path: path.join(VYSTUP, jmeno + '_karta_posta.png') });
      // myš odjede → karta zmizí
      await page.mouse.move(700, 700);
      await page.waitForFunction(() => document.getElementById('bublina-karta').hidden);
      await page.hover('#dnes-kpi [data-karta="posta"]');
      await cekejNaKartu(page, 'posta');
      await page.click('#bublina-karta [data-vlakno="v1"]');
      await page.waitForSelector('#p-posta:not([hidden]) #posta-seznam li.aktivni [data-vlakno="v1"]');
      await page.waitForSelector('#posta-detail .detail-telo');
      await page.waitForFunction(() => document.getElementById('bublina-karta').hidden);
      // klávesnice: Tab z hledání na dlaždici počasí ukáže kartu, šipka dolů skočí do ní, Esc ji zavře a vrátí fokus
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('#dnes-kpi [data-pocasi]');
      await page.mouse.move(700, 700);
      await page.focus('#horni [data-hledat]');
      await page.keyboard.press('Tab');
      await cekejNaKartu(page, 'pocasi');
      await page.keyboard.press('ArrowDown');
      jistota(await page.evaluate(() => !!document.activeElement.closest('#bublina-karta')), kde + 'šipka dolů nevede do karty');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('bublina-karta').hidden);
      jistota(await page.evaluate(() => document.activeElement.matches('#dnes-kpi [data-pocasi]')), kde + 'Esc nevrátil fokus na dlaždici');
      // Tab dál: karta jde s fokusem na další dlaždici
      await page.keyboard.press('Tab');
      await cekejNaKartu(page, 'zdravi');
      // otevřená karta a Ctrl K: hledání ji zavře a Esc pak patří hledání (karta ho nespolkne)
      await page.keyboard.press('Control+k');
      await page.waitForSelector('[data-panel="hledat"].otevreny');
      await page.waitForFunction(() => document.getElementById('bublina-karta').hidden);
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="hledat"]', { state: 'detached' });
      jistota(!chybyStranky.length, kde + 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    }
  });

  await test('Přehled: vyjeté karty na dotyku – klepnutí ukáže kartu a nikam nevede, druhé klepnutí / klepnutí jinam ji zavře, dál tlačítkem v kartě (iPad, telefon tmavý)', async () => {
    let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[1]);
    await page.goto(WEB);
    await page.waitForFunction(() => /°C/.test((document.querySelector('#dnes-kpi [data-pocasi]') || {}).textContent || '') && document.querySelector('#dnes-kpi [data-krouzky]'));
    const druh = () => page.evaluate(() => { const k = document.getElementById('bublina-karta'); return k && !k.hidden && k.classList.contains('videt') ? k.dataset.druh : ''; });
    const zavrena = () => page.waitForFunction(() => document.getElementById('bublina-karta').hidden);
    await page.tap('#dnes-kpi [data-krouzky]');
    await cekejNaKartu(page, 'krouzky');
    jistota(await page.isVisible('#p-dnes') && !(await page.isVisible('#p-zdravi')), 'iPad: klepnutí na kroužky odvedlo pryč z Přehledu');
    await page.tap('#dnes-kpi [data-krouzky]');
    await zavrena();
    // počasí: klepnutí = karta (ne rovnou detail); klepnutí jinam ji zavře; Celá předpověď otevře detail
    await page.tap('#dnes-kpi [data-pocasi]');
    let k = await cekejNaKartu(page, 'pocasi');
    jistota(!(await page.locator('.okno-pozadi').count()), 'iPad: klepnutí na počasí otevřelo rovnou detail');
    kartaNaObrazovce(k, 'iPad počasí');
    await page.screenshot({ path: path.join(VYSTUP, 'ipad-vyska_karta_pocasi.png') });
    await page.tap('#hlava h1');
    await zavrena();
    await page.tap('#dnes-kpi [data-pocasi]');
    await cekejNaKartu(page, 'pocasi');
    await page.tap('#bublina-karta [data-pocasi]');
    await page.waitForSelector('.okno-pozadi.videt .pocasi-dny li');
    await zavrena();
    await page.click('.okno-pozadi [data-okno="ano"]');
    await page.waitForSelector('.okno-pozadi', { state: 'detached' });
    // z jedné dlaždice na druhou: klepnutí vymění kartu
    await page.tap('#dnes-kpi [data-karta="posta"]');
    await cekejNaKartu(page, 'posta');
    await page.tap('#dnes-kpi [data-karta="zdravi"]');
    await cekejNaKartu(page, 'zdravi');
    jistota(await druh() === 'zdravi', 'iPad: karta se nevyměnila');
    jistota(!chybyStranky.length, 'iPad: chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    // telefon: malé kroužky → karta s velkými kroužky na obrazovce, tlačítkem do Zdraví
    ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark'));
    await page.goto(WEB);
    await page.waitForSelector('.mini-kpi[data-krouzky] svg');
    jistota(!(await page.locator('.mini-kpi[title]').count()), 'telefon: title u malých čísel');
    await page.tap('.mini-kpi[data-krouzky]');
    k = await cekejNaKartu(page, 'krouzky');
    kartaNaObrazovce(k, 'telefon kroužky');
    jistota(await page.locator('#bublina-karta .bk-krouzek').count() === 4 && await page.isVisible('#p-dnes'), 'telefon: karta kroužků / klepnutí odvedlo pryč');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon-tmavy_karta_krouzky.png') });
    await page.tap('#bublina-karta .bk-akce');
    await page.waitForSelector('#p-zdravi:not([hidden]) .zdravi-hero');
    await zavrena();
    jistota(!chybyStranky.length, 'telefon: chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- „1 hoří“ (Michal 10. 10.: „když na to kliknu, chci aby se mi zobrazil ten mail, co hoří“): jeden hořící e-mail
  // se z dlaždice, z karty i z hlavní karty na telefonu (a z okna Co je nového) rovnou otevře; víc → Pošta jen s hořícími
  await test('hoří: jeden hořící e-mail se z dlaždice, karty, telefonu i okna Co je nového rovnou otevře; víc hořících → Pošta s filtrem Hoří', async () => {
    const horici = (id, od, predmet, h) => ({ id, ucet: 'osobni', stav: 'hori', duvod: 'termín dnes', od, predmet, ukazka: 'Potřebuju odpověď do večera.', kdy: ted - h * H,
      neprectena: true, pocet: 1, odkaz: '#' });
    try {
      postaNavic = { osobni: [vlaknoSouhrn.v1, horici('v6', 'Stavbyvedoucí', 'Havárie vody', 0.5)] };
      let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
      await page.goto(WEB);
      await page.waitForSelector('#dnes-kpi [data-hori-vlakno="v6"]');
      jistota(/1 hoří/.test(await page.textContent('#dnes-kpi [data-hori-vlakno="v6"]')), 'dlaždice: 1 hoří');
      await page.click('#dnes-kpi [data-hori-vlakno="v6"]');
      await page.waitForSelector('#p-posta:not([hidden]) #posta-filtry [data-filtr-posty="hori"][aria-pressed="true"]');
      await page.waitForSelector('#posta-seznam li.aktivni [data-vlakno="v6"]');
      await page.waitForSelector('#posta-detail .detail-telo');
      jistota(await page.locator('#posta-seznam [data-vlakno]').count() === 1, 'Pošta: jen hořící');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_hori_jeden.png') });
      // karta u dlaždice: „Hoří 1“ taky rovnou na e-mail
      await page.click('#rail [data-cil="dnes"]');
      await page.hover('#dnes-kpi [data-karta="posta"]');
      await cekejNaKartu(page, 'posta');
      jistota(await page.locator('#bublina-karta .bk-stav--hori[data-hori-vlakno="v6"]').count() === 1, 'karta: Hoří → e-mail');
      await page.click('#bublina-karta .bk-stav--hori');
      await page.waitForSelector('#p-posta:not([hidden]) #posta-seznam li.aktivni [data-vlakno="v6"]');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // telefon: „1 hoří v poště“ v hlavní kartě otevře e-mail (v panelu přes Přehled)
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]));
      await page.goto(WEB);
      await page.waitForSelector('.hero .hero__hori[data-hori-vlakno="v6"]');
      jistota(/1 hoří v poště/.test(await page.textContent('.hero__hori')), 'telefon: odkaz v hlavní kartě');
      await page.locator('#dnes-mobil .hero').screenshot({ path: path.join(VYSTUP, 'telefon_hori_hero.png') });
      await page.click('.hero__hori');
      await page.waitForSelector('[data-panel="vlakno"].otevreny');
      jistota(!chybyStranky.length, 'telefon: chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // Co je nového s jedním hořícím: Ukázat ho rovnou otevře
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]));
      await ctx.addInitScript(() => { if (!sessionStorage.getItem('test-videno')) { localStorage.setItem('asistent.videno', JSON.stringify(Date.now() - 3 * 3600e3)); sessionStorage.setItem('test-videno', '1'); } });
      await page.goto(WEB);
      await page.waitForSelector('.okno-pozadi.videt .okno__radky li');
      jistota(/Hoří v poště/.test(await page.textContent('.okno__radky')), 'Co je nového: hoří');
      await page.waitForTimeout(300);
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForSelector('[data-panel="vlakno"].otevreny');
      jistota(!chybyStranky.length, 'Co je nového: chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // dva hořící: dlaždice → Pošta s filtrem Hoří (oba, žádný otevřený)
      postaNavic = { osobni: [vlaknoSouhrn.v1, horici('v6', 'Stavbyvedoucí', 'Havárie vody', 0.5), horici('v7', 'Úřad', 'Podpis smlouvy', 1.5)] };
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]));
      await page.goto(WEB);
      await page.waitForSelector('#dnes-kpi [data-karta="posta"][data-filtr-posty="hori"]');
      jistota(/2 hoří/.test(await page.textContent('#dnes-kpi [data-karta="posta"]')), 'dlaždice: 2 hoří');
      await page.click('#dnes-kpi [data-karta="posta"]');
      await page.waitForSelector('#p-posta:not([hidden]) #posta-filtry [data-filtr-posty="hori"][aria-pressed="true"]');
      await page.waitForFunction(() => document.querySelectorAll('#posta-seznam [data-vlakno]').length === 2 && document.querySelector('#posta-seznam [data-vlakno="v7"]'));
      jistota(!(await page.locator('#posta-seznam li.aktivni').count()), 'dva hořící: žádný se neotevřel');
      jistota(!chybyStranky.length, 'dva hořící: chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      postaNavic = {};
    }
  });

  // ---------- Přehled: nový název hlavní stránky (Michal 10. 10.: „hlavní stránku pojmenuj jinak než Dnes“) – klíč „dnes“ zůstal
  await test('Přehled: hlavní stránka se jmenuje Přehled – pás, nadpis, titulek okna, hledání; telefon: spodní lišta, menu, pozdrav zůstal', async () => {
    let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#rail [data-cil="dnes"][aria-current="page"]');
    jistota((await page.textContent('#rail .rail__btn[data-cil="dnes"]')).trim() === 'Přehled', 'pás: ' + await page.textContent('#rail .rail__btn[data-cil="dnes"]'));
    jistota((await page.textContent('#hlava h1')).trim() === 'Přehled', 'nadpis: ' + await page.textContent('#hlava h1'));
    jistota(await page.title() === 'Přehled · Asistent', 'titulek okna: ' + await page.title());
    await page.click('#rail [data-cil="posta"]');
    await page.waitForFunction(() => document.title === 'Pošta · Asistent');
    await page.keyboard.press('Control+k');
    await page.waitForSelector('[data-panel="hledat"] [data-hledat-pole]');
    await page.fill('[data-panel="hledat"] [data-hledat-pole]', 'dnes');
    await page.waitForFunction(() => /Přehled/.test(document.getElementById('hledat-vysledky').textContent));
    await page.locator('#hledat-vysledky [data-h-prikaz]', { hasText: 'Přehled' }).click(); // „dnes“ najde i Přehled
    await page.waitForSelector('#p-dnes:not([hidden]) #dl-pozornost');
    jistota(await page.title() === 'Přehled · Asistent', 'hledání → Přehled');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]));
    await page.goto(WEB);
    await page.waitForSelector('#lista [data-cil="dnes"][aria-current="page"]');
    jistota(/Přehled/.test(await page.textContent('#lista [data-cil="dnes"]')), 'spodní lišta');
    jistota(/^(Dobrou noc|Dobré ráno|Dobrý den|Dobrý večer)/.test((await page.textContent('#hlava h1')).trim()), 'pozdrav na telefonu: ' + await page.textContent('#hlava h1'));
    await page.click('.hlava-ja [data-menu]');
    await page.waitForSelector('[data-panel="menu"].otevreny [data-menu-cil="dnes"]');
    jistota(/Přehled/.test(await page.textContent('[data-panel="menu"] [data-menu-cil="dnes"]')), 'menu');
    jistota(!chybyStranky.length, 'telefon: chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- bubliny místo title i jinde: výsledky Fotbalu na Přehledu, předpověď u dne a svátek v kalendáři
  await test('bubliny místo title: výsledek Fotbalu na Přehledu (vyjetá karta), předpověď ČHMÚ u dne v kalendáři', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-fotbal .fotbal-vysledek--P');
    await pripraveno(page);
    jistota(!(await page.locator('#dl-fotbal .fotbal-vysledek[title]').count()), 'title u výsledku');
    await page.locator('#dl-fotbal .fotbal-vysledek--P').first().hover();
    await page.waitForSelector('#bublina-karta.videt[data-druh="zapas"]');
    const t = (await page.textContent('#bublina-karta')).replace(/\s+/g, ' ');
    jistota(/A-tým/.test(t) && /1:3 prohra/.test(t) && /FK Agro Vnorovy – TJ Lysovice/.test(t) && /Poločas\s?0:2/.test(t), 'karta výsledku: ' + t);
    await page.mouse.move(2, 2);
    await page.screenshot({ path: path.join(VYSTUP, 'pc_bublina_fotbal.png') });
    await page.click('#rail [data-cil="kalendar"]');
    await page.click('[data-kal-pohled="tyden"]');
    await page.waitForSelector('#p-kalendar .den-pocasi');
    jistota(!(await page.locator('#p-kalendar .den-pocasi[title]').count()), 'title u předpovědi');
    await page.locator('#p-kalendar .den-pocasi').first().hover();
    await page.waitForFunction(() => !document.getElementById('graf-bublina').hidden && /Předpověď ČHMÚ/.test(document.getElementById('graf-bublina').textContent));
    jistota(/°C/.test(await page.textContent('#graf-bublina')), 'bublina předpovědi: ' + await page.textContent('#graf-bublina'));
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- Přehled: pošta zvlášť (Michal 9. 10.: „když je vyřízena pošta, tak se nemusí zobrazit – aby bylo jasno, že mám
  // přečteno a vyřízeno, nebo ne“): karta jen s tím, co čeká, a nepřečtenými; Aktualizace jedním řádkem; telefon obdobně
  await test('Přehled: pošta zvlášť – karta jen s čekající a nepřečtenou poštou, vyřízená = schovaná, Aktualizace jedním řádkem (PC i telefon)', async () => {
    const vyrizena = Object.assign({}, vlaknoSouhrn.v1, { stav: 'resi', neprectena: false, navrh: false });
    try {
      let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
      await page.goto(WEB);
      await page.waitForSelector('#dl-posta:not([hidden]) [data-vlakno="v1"]');
      // po startu se přednačte i auto (js/pripravenost.js) – jeho připomínka (přezutí) přibude do Vyžaduje pozornost
      await pripraveno(page);
      jistota(/Pošta · 1/.test(await page.textContent('#dl-posta .card-hlava')) && !(await page.locator('#dl-posta [data-vlakno="v2"]').count()), 'karta Pošta: jen co čeká');
      jistota(/3 věci čekají na tebe · 1 e-mail k vyřízení/.test(await page.textContent('#hlava')), 'podnadpis: ' + await page.textContent('#hlava'));
      jistota(/Vyžaduje pozornost · 3/.test(await page.textContent('#dl-pozornost .card-hlava')) && /Přezout na zimní/.test(await page.textContent('#dl-pozornost')),
        'Vyžaduje pozornost sedí s podnadpisem (2 úkoly + přezutí z přednačteného auta)');
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

  // ---------- levý pás (Michal 9. 10.): mimo Přehled jen ikony s počty – víc místa na práci; po najetí myší nebo fokusu
  // klávesnicí se rozbalí přes obsah (stránka neposkočí), připnout = celý všude (pamatuje si zařízení)
  await test('levý pás: mimo Přehled jen ikony s počty, najetí myší i klávesnice ho rozbalí přes obsah, připnout a odepnout', async () => {
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
    jistota(!r.uzky && r.pas === 236 && r.popisky >= 9 && r.obsah === 236, 'na Přehledu celý pás: ' + JSON.stringify(r));
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
    // připnout: pás zůstane celý i mimo Přehled (i po obnovení), odepnout vrátí ikony
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
    // zpátky na Přehled: celý pás
    await page.click('#rail [data-cil="dnes"]');
    await pockej((x) => !x.uzky && x.pas === 236 && x.obsah === 236, 'na Přehledu zase celý pás');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  await test('levý pás na iPadu: ikony všude (i na Přehledu), najetí myší ho rozbalí přes obsah, bez připnutí', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[1]);
    await page.goto(WEB);
    await page.waitForSelector('#rail [data-cil="posta"] .pocet');
    const pas = () => page.evaluate(() => ({ w: Math.round(document.getElementById('rail').getBoundingClientRect().width),
      obsah: Math.round(document.querySelector('.hlavni').getBoundingClientRect().left), rozbaleny: document.getElementById('rail').classList.contains('rozbaleny') }));
    let r = await pas();
    jistota(r.w === 76 && r.obsah === 76 && !r.rozbaleny, 'iPad: úzký pás na Přehledu: ' + JSON.stringify(r));
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

  // ---------- levý pás bez poskakování (Michal 10. 10.: „když si rozjedu ten pás, tak se jakoby posune drobně dolů … ať jsou
  // ty ikony stejné“): logo, ikony sekcí, Nastavení a avatar mají ve všech podobách stejnou polohu (měřeno, ne od oka)
  await test('levý pás: logo a ikony při rozbalení přesně na stejném místě – úzký, rozbalený i celý na Přehledu (PC, iPad na šířku), úzký a rozbalený (iPad)', async () => {
    const polohy = (page) => page.evaluate(() => [...document.querySelectorAll('#rail .rail__logo .znak, #rail .rail__btn > svg, #rail .rail__ja .avatar')]
      .map((x) => { const r = x.getBoundingClientRect(); return [Math.round(r.top * 4) / 4, Math.round((r.left + r.width / 2) * 4) / 4]; }));
    const stejne = (a, b, popis) => jistota(a.length >= 12 && a.length === b.length && a.every((x, i) => Math.abs(x[0] - b[i][0]) <= 0.5 && Math.abs(x[1] - b[i][1]) <= 0.5),
      popis + ': ' + JSON.stringify(a) + ' × ' + JSON.stringify(b));
    for (const v of [VELIKOSTI[3], VELIKOSTI[2], VELIKOSTI[1]]) {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v);
      await page.goto(WEB);
      await page.waitForSelector('#rail [data-cil="posta"] .pocet');
      const naPrehledu = await polohy(page); // PC: celý pás s popisky; iPad: úzký
      await page.click('#rail [data-cil="posta"]');
      await page.waitForSelector('#posta-seznam [data-vlakno]');
      await page.mouse.move(v.sirka - 60, v.vyska - 60);
      await page.waitForFunction(() => document.getElementById('rail').getBoundingClientRect().width <= 76);
      const uzky = await polohy(page);
      await page.hover('#rail [data-cil="kalendar"]');
      await page.waitForFunction(() => document.getElementById('rail').classList.contains('rozbaleny') && document.getElementById('rail').getBoundingClientRect().width >= 236);
      await page.waitForTimeout(300); // popisky dojedou
      const rozbaleny = await polohy(page);
      stejne(uzky, rozbaleny, v.nazev + ': úzký × rozbalený');
      stejne(naPrehledu, uzky, v.nazev + ': Přehled × jiná stránka');
      jistota(await page.isVisible('#rail .rail__btn[data-cil="dnes"] > span') && (await page.textContent('#rail .rail__btn[data-cil="dnes"] > span')) === 'Přehled' &&
        !(await page.locator('#rail .rail__sekce').count()), v.nazev + ': popisky v rozbaleném pásu / nadpisy sekcí');
      await page.screenshot({ path: path.join(VYSTUP, v.nazev + '_pas_rozbaleny_polohy.png'), clip: { x: 0, y: 0, width: 300, height: v.vyska } });
      jistota(!chybyStranky.length, v.nazev + ': chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    }
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

  await test('pošta na telefonu: skupiny v jedné řadě do strany, dlouhé podržení řádku = nabídka e-mailu (Přesunout do…), nic nepřetéká', async () => {
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
    // dlouhé podržení prstem → nabídka e-mailu (js/nabidka.js, Michal 10. 10.); konverzace se neotevře; v nabídce Přesunout do…
    await page.$eval('#posta-seznam [data-vlakno="v2"]', (b) => {
      const r = b.getBoundingClientRect();
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.x + 20, clientY: r.y + 10 }));
    });
    await page.waitForSelector('.nabidka.videt [data-nabidka-i]');
    await page.$eval('#posta-seznam [data-vlakno="v2"]', (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })));
    const polozky = await page.$$eval('.nabidka [data-nabidka-i] span', (x) => x.map((e) => e.textContent));
    jistota(new RegExp('^Otevřít\\|Označit jako nepřečtené\\|Hotovo\\|Beru na vědomí\\|Přesunout do skupiny…\\|Připomenout…\\|Odpovědět\\|Přeposlat\\|(Nový e-mail odesílateli\\|Kopírovat adresu\\|)?Vybrat\\|Spam\\|Smazat$').test(polozky.join('|')),
      'nabídka: ' + polozky.join(' | '));
    jistota(!(await page.locator('[data-panel="vlakno"]').count()), 'podržení nemá otevřít konverzaci');
    jistota(await page.$eval('.nabidka', (n) => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), 'nabídka celá na obrazovce');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon-tmavy_posta_nabidka.png') });
    await page.click('.nabidka [data-nabidka-i]:has-text("Přesunout do skupiny")');
    await page.waitForSelector('[data-panel="presunout"].otevreny [data-presun-stitek="Účty"]');
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
    await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!(m.stav.vlakna.v1 && m.stav.vlakna.v1.data && m.stav.vlakna.v2 && m.stav.vlakna.v2.data)));
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
    // s účtem dojede k oddílu „Pracovní schránka přímo (WEDOS)“, bez účtu rozbalí návod na přeposílání
    await page.waitForSelector('[data-panel="nastaveni"] #nast-wedos, [data-panel="nastaveni"] [data-sekce="posta"] details[data-detail="posta-pracovni"][open]');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
    postaNavic = {};
  });

  // ---------- pošta 10. 10. (Michal: „ať mi tam nevisí stále e-maily“): pravé tlačítko, Beru na vědomí, výběr víc e-mailů
  const polozkyNabidky = (page) => page.$$eval('.nabidka [data-nabidka-i] span', (x) => x.map((e) => e.textContent).join('|'));
  const pocty = (page) => page.evaluate(() => import('/js/posta.js').then((m) => ({ nep: m.neprectene().map((x) => x.id), pozornost: m.kPozornosti().map((x) => x.id),
    hori: m.pocetStavu('hori') })));

  await test('pošta: pravé tlačítko na e-mailu – nabídka, Beru na vědomí (informace, počty na Dnes, Vrátit, rychlá akce na Dnes, Zrušit v Dalším kroku), Smazat, Odpovědět', async () => {
    Object.keys(vedomiTest).forEach((k) => delete vedomiTest[k]);
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-posta:not([hidden]) [data-vlakno="v1"]');
      await page.click('#rail [data-cil="posta"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
      // pravé tlačítko: nabídka jako ve schránce, v pořadí, jak ji Michal popsal
      await page.click('#posta-seznam [data-vlakno="v1"]', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      jistota(new RegExp('^Otevřít\\|Označit jako přečtené\\|Hotovo\\|Beru na vědomí\\|Přesunout do skupiny…\\|Připomenout…\\|Odpovědět\\|Přeposlat\\|(Nový e-mail odesílateli\\|Kopírovat adresu\\|)?Vybrat\\|Spam\\|Smazat$').test(await polozkyNabidky(page)),
        'nabídka: ' + await polozkyNabidky(page));
      jistota(/Trenér · Sraz v sobotu/.test(await page.textContent('.nabidka__nadpis')), 'nadpis nabídky');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_nabidka.png') });
      // Beru na vědomí: hned informace s okem, přečtená; motor jedním dotazem s časem poslední zprávy ze souhrnu
      const pred = postaOznaceni.length;
      await page.click('.nabidka [data-nabidka-i]:has-text("Beru na vědomí")');
      await page.waitForFunction(() => /st-info/.test((document.querySelector('#posta-seznam li:has([data-vlakno="v1"])') || {}).className || ''));
      jistota(await page.locator('#posta-seznam li:has([data-vlakno="v1"]) .radek-vedomi').count() === 1, 'oko u odesílatele');
      jistota(/Bereš na vědomí/.test(await page.textContent('#toast')) && await page.isVisible('#toast .toast__akce'), 'oznámení s Vrátit');
      await cekej(() => postaOznaceni.length === pred + 1, 3000, 'postaOznacit');
      jistota(JSON.stringify(postaOznaceni[pred]) === JSON.stringify({ ids: [{ id: 'v1', kdy: vlaknoSouhrn.v1.kdy, neprectena: true }], jak: 'vedomi' }),
        'motor: ' + JSON.stringify(postaOznaceni[pred]));
      let p = await pocty(page);
      jistota(!p.nep.includes('v1') && !p.pozornost.includes('v1') && p.hori === 0, 'počty na Dnes (nepřečtené, čeká, hoří): ' + JSON.stringify(p));
      // Vrátit: zpátky otázka a nepřečtená, motor zruší (a zase označí nepřečtenou)
      await page.click('#toast .toast__akce');
      await page.waitForFunction(() => /st-otazka/.test((document.querySelector('#posta-seznam li:has([data-vlakno="v1"])') || {}).className || ''));
      await cekej(() => postaOznaceni.length === pred + 2, 3000, 'vedomiZrusit');
      jistota(JSON.stringify(postaOznaceni[pred + 1]) === JSON.stringify({ ids: [{ id: 'v1', kdy: vlaknoSouhrn.v1.kdy, neprectena: true }], jak: 'vedomiZrusit' }),
        'Vrátit: ' + JSON.stringify(postaOznaceni[pred + 1]));
      p = await pocty(page);
      jistota(p.nep.includes('v1') && p.pozornost.includes('v1'), 'po Vrátit zase nepřečtená a čeká: ' + JSON.stringify(p));
      // Dnes: rychlá akce na řádku (najetí myší) – řádek zmizí, karta Pošta s ním (nic dalšího nečeká)
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('#dl-posta:not([hidden]) [data-vlakno="v1"]');
      await page.hover('#dl-posta [data-vlakno="v1"]');
      await page.waitForSelector('#dl-posta .radek-rychle [data-posta-rychle="vedomi"]', { state: 'visible' });
      jistota(await page.locator('#dl-posta .radek-rychle [data-posta-rychle="archivovat"]').count() === 1, 'rychlá akce Hotovo');
      await page.locator('#dl-posta').screenshot({ path: path.join(VYSTUP, 'pc_dnes_posta_rychle_akce.png') });
      await page.click('#dl-posta [data-posta-rychle="vedomi"]');
      await page.waitForSelector('#dl-posta', { state: 'hidden' });
      jistota(/Bereš na vědomí/.test(await page.textContent('#toast')), 'oznámení na Dnes');
      // po přenačtení platí dál (pamatuje si to motor) – na Dnes nic nevisí
      await cekej(() => vedomiTest.v1 === vlaknoSouhrn.v1.kdy, 3000, 'motor si to pamatuje');
      await page.reload();
      await page.waitForSelector('#dl-pozornost .seznam');
      await cekejVeStrance(page, () => import('/js/posta.js').then((m) => m.vsechnyZpravy().some((x) => x.id === 'v1' && x.vedomi)));
      // po druhém otevření okno Co je nového (výstraha ČHMÚ z napodobeného motoru) – zavřít
      await page.waitForSelector('.okno-pozadi.videt [data-okno="ne"]', { timeout: 4000 }).then(() => page.click('.okno-pozadi.videt [data-okno="ne"]'))
        .then(() => page.waitForSelector('.okno-pozadi', { state: 'detached' })).catch(() => { /* okno nebylo */ });
      jistota(await page.locator('#dl-posta').isHidden(), 'karta Pošta po Beru na vědomí schovaná');
      p = await pocty(page);
      jistota(!p.nep.length && !p.pozornost.length, 'počty po přenačtení: ' + JSON.stringify(p));
      // detail: štítek Bereš na vědomí, proč a co bylo předtím, Další krok s Hotovo a Zrušit
      await page.click('#rail [data-cil="posta"]');
      await page.click('#posta-seznam [data-vlakno="v1"]');
      await page.waitForSelector('#posta-detail .dalsi-krok [data-oznacit="vedomiZrusit"]');
      const detail = (await page.textContent('#posta-detail')).replace(/\s+/g, ' ');
      jistota(/Bereš na vědomí/.test(detail) && /předtím Otázka/.test(detail) && /Nic od tebe nečeká/.test(detail), 'detail: ' + detail.slice(0, 300));
      jistota(await page.locator('#posta-detail .dalsi-krok [data-oznacit="archivovat"]').count() === 1, 'Hotovo v Dalším kroku');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_bere_na_vedomi.png') });
      const predZrusenim = postaOznaceni.length;
      await page.click('#posta-detail .dalsi-krok [data-oznacit="vedomiZrusit"]');
      await cekej(() => postaOznaceni.length === predZrusenim + 1 && postaOznaceni[predZrusenim].jak === 'vedomiZrusit', 3000, 'Zrušit v Dalším kroku');
      // Další krok u otázky (i karta s návrhem od Clauda): vedle Odpovědět / Použít i Hotovo a Beru na vědomí
      await page.waitForSelector('#posta-detail .dalsi-krok [data-oznacit="vedomi"]');
      jistota(await page.locator('#posta-detail .dalsi-krok [data-oznacit="archivovat"]').count() === 1, 'Hotovo v Dalším kroku / u návrhu od Clauda');
      await page.locator('#posta-detail .dalsi-krok').screenshot({ path: path.join(VYSTUP, 'pc_posta_dalsi_krok.png') });
      // Smazat (koš) bez dotazu, s Vrátit
      const predSmazanim = postaOznaceni.length, volanoPred = volano.length;
      await page.click('#posta-seznam [data-vlakno="v2"]', { button: 'right' });
      await page.click('.nabidka [data-nabidka-i]:has-text("Smazat")');
      await page.waitForFunction(() => !document.querySelector('#posta-seznam [data-vlakno="v2"]'));
      jistota(!(await page.locator('.okno-pozadi').count()), 'smazání se neptá');
      await cekej(() => postaOznaceni.length === predSmazanim + 1, 3000, 'smazat');
      jistota(postaOznaceni[predSmazanim].jak === 'smazat' && postaOznaceni[predSmazanim].ids[0].id === 'v2', 'smazat: ' + JSON.stringify(postaOznaceni[predSmazanim]));
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#posta-seznam [data-vlakno="v2"]');
      await cekej(() => volano.slice(volanoPred).some((d) => d.akce === 'oznacit' && d.id === 'v2' && d.jak === 'vratit'), 3000, 'Vrátit po smazání');
      // Odpovědět z nabídky: otevře konverzaci a psaní
      await page.click('#posta-seznam [data-vlakno="v2"]', { button: 'right' });
      await page.click('.nabidka [data-nabidka-i]:has-text("Odpovědět")');
      await page.waitForSelector('[data-panel="psani"] [data-psani-text]');
      jistota(/Odpověď/.test(await page.textContent('[data-panel="psani"]')), 'psaní odpovědi');
      await page.keyboard.press('Escape');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      Object.keys(vedomiTest).forEach((k) => delete vedomiTest[k]);
    }
  });

  await test('pošta: výběr víc e-mailů – Ctrl+klik, Shift+klik, lišta a přehled vpravo, Hotovo a Vrátit jedním dotazem, Beru na vědomí, Přesunout do…, Esc; telefon: Vybrat v nabídce', async () => {
    const souhrnTest = (id, o) => Object.assign({ id, ucet: 'osobni', stav: 'ceka', duvod: 'prosba „prosím“', od: 'Odesílatel ' + id, predmet: 'Předmět ' + id,
      ukazka: 'Text ' + id, kdy: ted - 3 * H, neprectena: true, pocet: 1, odkaz: '#' }, o);
    postaNavic = { osobni: [vlaknoSouhrn.v1, souhrnTest('x1', { kdy: ted - 1.5 * H }), souhrnTest('x2', { kdy: ted - 2.5 * H, stav: 'hori', duvod: 'termín „do zítra“' }),
      souhrnTest('x3', { kdy: ted - 4 * H, stav: 'info', neprectena: false }), souhrnTest('x4', { kdy: ted - 5 * H, stav: 'otazka' })] };
    Object.keys(vedomiTest).forEach((k) => delete vedomiTest[k]);
    let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="posta"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="x4"]');
      const poradi = await page.$$eval('#posta-seznam .seznam-posta [data-vlakno]', (x) => x.map((e) => e.dataset.vlakno).join(','));
      jistota(poradi === 'v1,x1,v2,x2,x3,x4', 'pořadí: ' + poradi);
      // Ctrl+klik vybere (nic se neotevře), Shift+klik rozsah; lišta nad seznamem, vpravo přehled vybraných
      await page.click('#posta-seznam [data-vlakno="x1"]', { modifiers: ['Control'] });
      await page.waitForSelector('#posta-seznam .posta-vyber');
      jistota(!(await page.locator('#posta-detail .vlakno').count()), 'Ctrl+klik e-mail neotevřel');
      await page.click('#posta-seznam [data-vlakno="x3"]', { modifiers: ['Shift'] });
      await page.waitForFunction(() => document.querySelectorAll('#posta-seznam li.vybrany').length === 4);
      let vybrane = await page.$$eval('#posta-seznam li.vybrany [data-vlakno]', (x) => x.map((e) => e.dataset.vlakno).join(','));
      jistota(vybrane === 'x1,v2,x2,x3', 'rozsah: ' + vybrane);
      jistota(/4 vybrané/.test(await page.textContent('#posta-seznam .posta-vyber')) && /4 vybrané e-maily/.test(await page.textContent('#posta-detail')), 'počet v liště a vpravo');
      jistota(await page.locator('#posta-seznam .seznam-posta.vybira .radek-vyber[aria-pressed="true"]').count() === 4, 'zaškrtávátka');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_vyber.png') });
      // Ctrl+klik znovu = z výběru pryč; zaškrtávátko taky přepíná
      await page.click('#posta-seznam [data-vlakno="x3"]', { modifiers: ['Control'] });
      await page.waitForFunction(() => document.querySelectorAll('#posta-seznam li.vybrany').length === 3);
      // pravé tlačítko na vybraném řádku = akce pro celý výběr
      await page.click('#posta-seznam [data-vlakno="x2"]', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      jistota(/3 vybrané e-maily/.test(await page.textContent('.nabidka__nadpis')) && /^Hotovo\|Beru na vědomí\|/.test(await polozkyNabidky(page)), 'nabídka výběru: ' + await polozkyNabidky(page));
      await page.keyboard.press('Escape');
      // Hotovo z lišty: jedním dotazem (x1, x2 – Gmail; v2 je pracovní z Gmailu taky), hned pryč, Vrátit jedním dotazem
      const pred = postaOznaceni.length;
      await page.click('#posta-seznam .posta-vyber [data-hromadne="archivovat"]');
      await page.waitForFunction(() => !document.querySelector('#posta-seznam [data-vlakno="x1"]') && !document.querySelector('#posta-seznam [data-vlakno="x2"]'));
      jistota(!(await page.locator('#posta-seznam .posta-vyber').count()), 'po Hotovo bez výběru');
      await cekej(() => postaOznaceni.length === pred + 1, 3000, 'jeden dotaz');
      jistota(postaOznaceni[pred].jak === 'archivovat' && postaOznaceni[pred].ids.map((x) => x.id).sort().join() === 'v2,x1,x2', 'Hotovo: ' + JSON.stringify(postaOznaceni[pred]));
      jistota(/Hotovo: 3/.test(await page.textContent('#toast')), 'oznámení: ' + await page.textContent('#toast'));
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#posta-seznam [data-vlakno="x2"]');
      await cekej(() => postaOznaceni.length === pred + 2, 3000, 'Vrátit');
      jistota(postaOznaceni[pred + 1].jak === 'vratit' && postaOznaceni[pred + 1].ids.length === 3, 'Vrátit: ' + JSON.stringify(postaOznaceni[pred + 1]));
      // klávesy: Ctrl+klik dvou, b = Beru na vědomí pro výběr (jeden dotaz), Esc zruší výběr
      await page.click('#posta-seznam [data-vlakno="x2"]', { modifiers: ['Control'] });
      await page.click('#posta-seznam [data-vlakno="x4"]', { modifiers: ['Control'] });
      await page.keyboard.press('b');
      await cekej(() => postaOznaceni.length === pred + 3, 3000, 'b');
      jistota(postaOznaceni[pred + 2].jak === 'vedomi' && postaOznaceni[pred + 2].ids.map((x) => x.id).join() === 'x2,x4', 'b: ' + JSON.stringify(postaOznaceni[pred + 2]));
      await page.waitForFunction(() => /st-info/.test(document.querySelector('#posta-seznam li:has([data-vlakno="x2"])').className));
      await page.click('#posta-seznam [data-vlakno="x1"]', { modifiers: ['Control'] });
      await page.waitForSelector('#posta-seznam .posta-vyber');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#posta-seznam .posta-vyber') && !document.querySelector('#posta-seznam li.vybrany'));
      // Přesunout do… pro víc e-mailů: jeden dotaz s ids, hned pryč, Vrátit
      await page.click('#posta-seznam [data-vlakno="x1"]', { modifiers: ['Control'] });
      await page.click('#posta-seznam [data-vlakno="x3"]', { modifiers: ['Control'] });
      await page.click('#posta-seznam .posta-vyber [data-hromadne="presunout"]');
      await page.waitForSelector('[data-panel="presunout"] [data-presun-stitek="Účty"]');
      jistota(/2 vybrané e-maily/.test(await page.textContent('[data-panel="presunout"]')), 'okno přesunu pro výběr');
      const predPresunem = postaPresuny.length;
      await page.click('[data-panel="presunout"] [data-presun-stitek="Účty"]');
      await page.waitForFunction(() => !document.querySelector('#posta-seznam [data-vlakno="x1"]') && !document.querySelector('#posta-seznam [data-vlakno="x3"]'));
      await cekej(() => postaPresuny.length === predPresunem + 1, 3000, 'přesun víc');
      const ps = postaPresuny[predPresunem];
      jistota(JSON.stringify(ps.ids) === JSON.stringify(['x1', 'x3']) && ps.stitek === 'Účty' && ps.archivovat === true, 'přesun: ' + JSON.stringify(ps));
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#posta-seznam [data-vlakno="x3"]');
      await cekej(() => postaPresuny.length === predPresunem + 2, 3000, 'Vrátit přesun');
      jistota(postaPresuny[predPresunem + 1].pridat === false && postaPresuny[predPresunem + 1].doDorucenych === true && postaPresuny[predPresunem + 1].ids.length === 2,
        'Vrátit přesun: ' + JSON.stringify(postaPresuny[predPresunem + 1]));
      // obyčejné klepnutí ve výběru e-mail otevře a výběr zruší
      await page.click('#posta-seznam [data-vlakno="x1"]', { modifiers: ['Control'] });
      await page.click('#posta-seznam [data-vlakno="x4"]');
      await page.waitForSelector('#posta-detail .vlakno');
      jistota(!(await page.locator('#posta-seznam .posta-vyber').count()), 'klepnutí výběr zrušilo');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // iPad na výšku: seznam přes celou šířku – lišta výběru v jednom řádku, nic nepřetéká
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[1]));
      await page.goto(WEB);
      await page.click('#rail [data-cil="posta"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="x1"]');
      await page.$eval('#posta-seznam [data-vlakno="x1"]', (b) => {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.x + 30, clientY: r.y + 12 }));
      });
      await page.waitForSelector('.nabidka.videt');
      await page.$eval('#posta-seznam [data-vlakno="x1"]', (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })));
      await page.click('.nabidka [data-nabidka-i]:has-text("Vybrat")');
      await page.tap('#posta-seznam [data-vlakno="x4"]');
      await page.waitForFunction(() => document.querySelectorAll('#posta-seznam li.vybrany').length === 2);
      const lista = await page.$eval('#posta-seznam .posta-vyber', (l) => ({ vyska: Math.round(l.getBoundingClientRect().height), sirka: l.scrollWidth <= l.clientWidth + 1 }));
      jistota(lista.vyska < 60 && lista.sirka, 'iPad: lišta v jednom řádku ' + JSON.stringify(lista));
      await page.screenshot({ path: path.join(VYSTUP, 'ipad-vyska_posta_vyber.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // telefon (tmavý): dlouhé podržení → Vybrat; pak klepnutí vybírá; lišta nahoře; Hotovo jedním dotazem
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark'));
      await page.goto(WEB);
      await page.click('#lista [data-cil="posta"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="x1"]');
      await page.$eval('#posta-seznam [data-vlakno="x1"]', (b) => {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.x + 30, clientY: r.y + 12 }));
      });
      await page.waitForSelector('.nabidka.videt');
      await page.$eval('#posta-seznam [data-vlakno="x1"]', (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })));
      await page.click('.nabidka [data-nabidka-i]:has-text("Vybrat")');
      await page.waitForSelector('#posta-seznam .posta-vyber');
      await page.tap('#posta-seznam [data-vlakno="x2"]');
      await page.waitForFunction(() => document.querySelectorAll('#posta-seznam li.vybrany').length === 2);
      jistota(!(await page.locator('[data-panel="vlakno"]').count()), 'klepnutí ve výběru e-mail neotevřelo');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'telefon: přetéká do strany');
      jistota(await page.$eval('#posta-seznam .posta-vyber', (l) => l.scrollWidth <= l.clientWidth + 1 && l.getBoundingClientRect().right <= innerWidth), 'lišta výběru se vejde');
      await page.screenshot({ path: path.join(VYSTUP, 'telefon-tmavy_posta_vyber.png') });
      const predTel = postaOznaceni.length;
      await page.tap('#posta-seznam .posta-vyber [data-hromadne="archivovat"]');
      await cekej(() => postaOznaceni.length === predTel + 1, 3000, 'Hotovo z telefonu');
      jistota(postaOznaceni[predTel].ids.map((x) => x.id).join() === 'x1,x2', 'telefon: ' + JSON.stringify(postaOznaceni[predTel]));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      postaNavic = {};
      Object.keys(vedomiTest).forEach((k) => delete vedomiTest[k]);
    }
  });

  await test('Dnes na telefonu: podržení e-mailu = nabídka, Beru na vědomí – Pošta na Dnes zmizí, Vrátit ji vrátí', async () => {
    Object.keys(vedomiTest).forEach((k) => delete vedomiTest[k]);
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('.pozornost--posta [data-vlakno="v1"]');
      await pripraveno(page);
      await page.$eval('.pozornost--posta [data-vlakno="v1"]', (b) => {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.x + 30, clientY: r.y + 15 }));
      });
      await page.waitForSelector('.nabidka.videt');
      await page.$eval('.pozornost--posta [data-vlakno="v1"]', (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })));
      const n = await polozkyNabidky(page);
      jistota(new RegExp('^Otevřít\\|Označit jako přečtené\\|Hotovo\\|Beru na vědomí\\|Přesunout do skupiny…\\|Připomenout…\\|Odpovědět\\|Přeposlat\\|(Nový e-mail odesílateli\\|Kopírovat adresu\\|)?Spam\\|Smazat$').test(n), 'nabídka na Dnes: ' + n);
      jistota(!(await page.locator('[data-panel="vlakno"]').count()), 'podržení e-mail neotevřelo');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_dnes_posta_nabidka.png') });
      await page.click('.nabidka [data-nabidka-i]:has-text("Beru na vědomí")');
      await page.waitForSelector('.pozornost--posta', { state: 'detached' });
      await page.click('#toast .toast__akce');
      await page.waitForSelector('.pozornost--posta [data-vlakno="v1"]');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      Object.keys(vedomiTest).forEach((k) => delete vedomiTest[k]);
    }
  });

  await test('pošta: starší motor (bez postaOznacit) – v nabídce bez Beru na vědomí a Smazat, Hotovo jako dřív (oznacit)', async () => {
    const puvodni = motor.postaOznacit;
    delete motor.postaOznacit;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="posta"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
      await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!(m.stav.info && m.stav.info.akce)));
      await page.click('#posta-seznam [data-vlakno="v1"]', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      const n = await polozkyNabidky(page);
      jistota(new RegExp('^Otevřít\\|Označit jako přečtené\\|Hotovo\\|Přesunout do skupiny…\\|Připomenout…\\|Odpovědět\\|Přeposlat\\|(Nový e-mail odesílateli\\|Kopírovat adresu\\|)?Vybrat\\|Spam$').test(n), 'nabídka: ' + n);
      const pred = volano.length;
      await page.click('.nabidka [data-nabidka-i]:has-text("Hotovo")');
      await cekej(() => volano.slice(pred).some((d) => d.akce === 'oznacit' && d.id === 'v1' && d.jak === 'archivovat'), 3000, 'oznacit');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      motor.postaOznacit = puvodni;
      await ctx.close();
    }
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

  // ---------- šířka stránek na PC (Michal 15. 10.: „problém s tou šířkou stránky … projdi všechny stránky“): šířku využít víc
  // sloupci / mřížkou, ne zvětšováním jednoho prvku – nic přerostlého (karta, obrázek, tlačítko přes celou šířku), žádný úzký
  // pruh s prázdnem vedle, souvislý text ~75 znaků; telefon beze změny (jeden sloupec, nic nepřetéká). Systém šířek: app.css
  // u .pohled (--sirka-stranky, --sirka-bloku, --sirka-cteni, --sirka-okna, .mrizka-karet).
  /** Rozměry aktivní stránky: místo vedle pásu, kam sahá obsah, nejširší karta / obrázek / tlačítko, přetečení do strany. */
  const MER_SIRKY = (sel) => {
    const main = document.querySelector('main');
    const cs = getComputedStyle(main);
    const misto = Math.min(main.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), 2200);
    const pohled = Array.from(document.querySelectorAll('.pohled')).find((e) => e.getClientRects().length > 0);
    const vidim = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const kusy = Array.from(pohled.querySelectorAll(sel || '.card')).filter(vidim).map((e) => e.getBoundingClientRect());
    const nej = (s) => Array.from(pohled.querySelectorAll(s)).filter(vidim).reduce((m, e) => Math.max(m, e.getBoundingClientRect().width), 0);
    return {
      misto: Math.round(misto),
      pohled: Math.round(pohled.getBoundingClientRect().width),
      obsah: Math.round(Math.max(...kusy.map((b) => b.right)) - Math.min(...kusy.map((b) => b.left))),
      sloupcu: new Set(kusy.map((b) => Math.round(b.left))).size,
      karta: Math.round(Math.max(...kusy.map((b) => b.width))),
      obrazek: Math.round(nej('img, svg, canvas, video, iframe')),
      tlacitko: Math.round(nej('.btn, .dlazdice__pata')), // tlačítka akcí (řádky seznamů a výstraha ČHMÚ jsou celé řádky / pruhy)
      pretok: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  };
  const SIRKY_PC = [{ nazev: 'pc-1920', sirka: 1920, vyska: 1080, dotyk: false }, { nazev: 'pc-1500', sirka: 1500, vyska: 850, dotyk: false },
    { nazev: 'pc-1280', sirka: 1280, vyska: 800, dotyk: false }];
  await test('šířka stránek na PC: Přehled, Schránka, Pošta, Kalendář, Nastavení – obsah využívá ≥ 80 % místa vedle pásu ve sloupcích, nic přerostlého, text ~75 znaků (1920 / 1500 / 1280 px, světlý i tmavý)', async () => {
    const puvodni = motor.schranka;
    motor.schranka = schrankaPlna(puvodni);
    try {
      for (const v of SIRKY_PC) {
        for (const motiv of v.sirka === 1920 ? ['light', 'dark'] : ['light']) {
          const kde = v.nazev + (motiv === 'dark' ? '-tmavy' : '') + ' ';
          const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, motiv);
          await page.goto(WEB);
          await page.waitForSelector('#dl-tyden .agenda__u');
          await page.waitForSelector('#dl-pozornost .seznam');
          const vyuziva = (m, co) => jistota(m.pohled >= 0.8 * m.misto && m.obsah >= 0.8 * m.misto && m.pretok <= 0,
            kde + co + ': obsah nevyužívá šířku vedle pásu – ' + JSON.stringify(m));
          // Přehled: karty ve sloupcích (2, od 1600 px 3), žádná karta přes ~650 px, tlačítko nejvýš půl stránky
          let m = await page.evaluate(MER_SIRKY, '.dnes-mrizka .card');
          vyuziva(m, 'Přehled');
          jistota(m.sloupcu === (v.sirka >= 1600 ? 3 : 2) && m.karta <= 660 && m.obrazek <= 660 && m.tlacitko <= m.misto / 2, kde + 'Přehled: ' + JSON.stringify(m));
          // Schránka: seznam a přehled vedle sebe (od 1480 px přehled ve dvou sloupcích), seznam nejvýš ~polovina stránky
          await page.click('#rail [data-cil="schranka"]');
          await page.waitForSelector('#sb-moje .moje-polozka');
          m = await page.evaluate(MER_SIRKY, '.schranka-hlavni > .card, #schranka-obsah .card, .schranka-bok > .card');
          vyuziva(m, 'Schránka');
          const sb = await page.evaluate(() => {
            const b = (s) => document.querySelector(s).getBoundingClientRect();
            const bok = Array.from(document.querySelectorAll('.schranka-bok > .card')).filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
            return { seznam: Math.round(b('.schranka-hlavni').width), bokSloupcu: new Set(bok.map((x) => Math.round(x.left))).size,
              bokKarta: Math.round(Math.max(...bok.map((x) => x.width))) };
          });
          jistota(sb.bokSloupcu === (v.sirka >= 1480 ? 2 : 1) && sb.seznam <= Math.max(0.62 * m.misto, 820) && sb.bokKarta <= 520 && m.tlacitko <= m.misto / 2,
            kde + 'Schránka: ' + JSON.stringify(sb) + ' ' + JSON.stringify(m));
          // Pošta: seznam a čtení 2 : 3, čtení vystředěný blok ≤ 800 px, tlačítka v patičce ne přes celou šířku
          await page.click('#rail [data-cil="posta"]');
          await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
          await page.click('#posta-seznam [data-vlakno="v1"]');
          await page.waitForSelector('#posta-detail .detail-telo .vlakno .zprava');
          m = await page.evaluate(MER_SIRKY, '#posta-seznam, #posta-detail');
          vyuziva(m, 'Pošta');
          const po = await page.evaluate(() => {
            const b = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
            const det = b('#posta-detail'), vl = b('#posta-detail .vlakno');
            const text = document.querySelector('#posta-detail .zprava-text');
            return { seznam: Math.round(b('#posta-seznam').width), detail: Math.round(det.width), vlakno: Math.round(vl.width),
              stred: Math.round(Math.abs((vl.left + vl.right) / 2 - (det.left + det.right) / 2)),
              tlacitka: Math.round(Math.max(...Array.from(document.querySelectorAll('#posta-detail .detail-paticka .btn')).map((e) => e.getBoundingClientRect().width))),
              textEm: text ? Math.round(text.getBoundingClientRect().width / parseFloat(getComputedStyle(text).fontSize) * 10) / 10 : 0 };
          });
          jistota(po.seznam >= 380 && po.seznam <= 0.45 * m.misto + 1 && po.vlakno <= 801 && po.stred <= 2 && po.tlacitka <= 300 && po.textEm > 0 && po.textEm <= 40,
            kde + 'Pošta: ' + JSON.stringify(po));
          // Kalendář: měsíc přes šířku vedle pravého panelu; Seznam = dny jako karty v mřížce (ne každý den přes celou šířku)
          await page.click('#rail [data-cil="kalendar"]');
          await page.click('[data-kal-pohled="mesic"]');
          await page.waitForSelector('.mesic-den.dnes');
          m = await page.evaluate(MER_SIRKY, '.kal-hlavni > .card, .kal-boc > .card');
          vyuziva(m, 'Kalendář – měsíc');
          await page.click('[data-kal-pohled="seznam"]');
          await page.waitForSelector('.kal-seznam-dny > .card');
          m = await page.evaluate(MER_SIRKY, '.kal-seznam-dny > .card, .kal-boc > .card');
          vyuziva(m, 'Kalendář – seznam');
          const dny = await page.evaluate(MER_SIRKY, '.kal-seznam-dny > .card');
          jistota(dny.sloupcu >= 2 && dny.karta <= 520, kde + 'Kalendář – seznam: ' + JSON.stringify(dny));
          if (v.sirka === 1920) await page.screenshot({ path: path.join(VYSTUP, 'sirka_' + kde.trim() + '_kalendar_seznam.png') });
          await page.click('[data-kal-pohled="mesic"]'); // výchozí zobrazení pro další testy (pamatuje se v zařízení)
          // Nastavení: okno uprostřed, rozumně široké (ne přes celou obrazovku, ne úzký proužek)
          await page.click('#rail [data-otevri-nastaveni]');
          await page.waitForSelector('[data-panel="nastaveni"].otevreny .nast-zalozky');
          await page.waitForTimeout(300);
          const okno = await page.evaluate(() => { const b = document.querySelector('[data-panel="nastaveni"]').getBoundingClientRect(); return { w: Math.round(b.width), stred: Math.round(Math.abs(b.left + b.width / 2 - innerWidth / 2)) }; });
          jistota(okno.w >= 600 && okno.w <= 760 && okno.stred <= 2, kde + 'Nastavení: ' + JSON.stringify(okno));
          await page.keyboard.press('Escape');
          await page.waitForSelector('[data-panel="nastaveni"]', { state: 'detached' });
          jistota(!chybyStranky.length, kde + 'chyby stránky: ' + chybyStranky.join(' | '));
          await ctx.close();
        }
      }
    } finally {
      motor.schranka = puvodni;
      vycistiSchranku();
    }
  });

  await test('šířka stránek na telefonu: Přehled, Schránka, Pošta, Kalendář (měsíc, týden, seznam pod sebou), Nastavení – nic nepřetéká do strany, karty v jednom sloupci', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.waitForSelector('.pozornost .pozor');
    const kontrola = async (co, sel) => {
      const m = await page.evaluate(MER_SIRKY, sel);
      jistota(m.pretok <= 0 && m.sloupcu === 1 && m.karta <= 390, 'telefon ' + co + ': ' + JSON.stringify(m));
    };
    await kontrola('Přehled', '#p-dnes .card');
    const jdi = (s) => page.click('#lista [data-cil="' + s + '"]');
    await jdi('schranka');
    await page.waitForSelector('#sb-tyden .sb-cisla');
    await kontrola('Schránka', '#p-schranka .card');
    await jdi('posta');
    await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
    await kontrola('Pošta', '#posta-seznam .card');
    await jdi('kalendar');
    for (const k of ['mesic', 'tyden', 'seznam']) {
      await page.click('[data-kal-pohled="' + k + '"]');
      await page.waitForSelector(k === 'seznam' ? '.kal-seznam-dny > .card' : k === 'mesic' ? '.mesic-den.dnes' : '.cas-mrizka');
      await kontrola('Kalendář ' + k, k === 'seznam' ? '.kal-seznam-dny > .card' : '.kal-hlavni > .card');
    }
    await page.click('[data-kal-pohled="mesic"]');
    await page.click('.hlava-ja [data-menu]');
    await page.waitForSelector('[data-panel="menu"].otevreny [data-menu-nastaveni]');
    await page.click('[data-panel="menu"] [data-menu-nastaveni]');
    await page.waitForSelector('[data-panel="nastaveni"].otevreny .nast-zalozky');
    const okno = await page.evaluate(() => { const p = document.querySelector('[data-panel="nastaveni"]'); const t = p.querySelector('.panel-telo');
      return { w: Math.round(p.getBoundingClientRect().width), pretok: t.scrollWidth - t.clientWidth }; });
    jistota(okno.w <= 390 && okno.pretok <= 1, 'telefon Nastavení: ' + JSON.stringify(okno));
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
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
      await pripraveno(page);
      // + v liště → Moje poznámka → okno s polem
      await page.click('#lista [data-rychle]');
      await page.click('[data-panel="rychle"] [data-rychle-akce="moje"]');
      await page.waitForSelector('.okno-pozadi.videt .okno__pole textarea');
      await page.fill('.okno-pozadi .okno__pole textarea', 'Zavolat babičce v neděli');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await cekej(() => volano.some((d) => d.akce === 'mojePridat' && d.text === 'Zavolat babičce v neděli'), 3000, 'z okna do motoru');
      await page.waitForFunction(() => /Zavolat babičce/.test(document.querySelector('#dl-moje').textContent));
      // poznámka je v seznamu hned, motor ji potvrdí (opravdové id) – karta se pak jednou překreslí
      await page.waitForFunction(() => !document.querySelector('#dl-moje [data-moje-id^="ceka-"]'));
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
  // výšku sousední; PC od 1 400 px 3 sloupce (Michal 15. 10.: šířku využít sloupci – dřív 2 sloupce v pruhu 1 180 px na jeho
  // ~1 650 px monitoru), iPad 2, telefon 1; snímky světlý i tmavý režim
  const ZDRAVI_VELIKOSTI = [{ nazev: 'pc1650', sirka: 1650, vyska: 1000, sloupcu: 3 }, { nazev: 'pc1800', sirka: 1800, vyska: 1000, sloupcu: 3 },
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
          await pripraveno(page);
          await page.click(v.sirka >= 760 ? '#rail [data-cil="zdravi"]' : '.hlava-ja [data-cil="zdravi"]');
          await page.waitForSelector('#p-zdravi .zd-tyden .tyden-claude');
          const t = await page.innerHTML('#p-zdravi .tyden-claude');
          jistota(/<b>bílkoviny<\/b>/.test(t) && /<li>víc vody<\/li>/.test(t) && /&lt;b&gt;ne HTML/.test(t), 'týden od Clauda (tučně, odrážky, bez HTML): ' + t);
          jistota(/odešlo i e-mailem/.test(await page.textContent('#p-zdravi .zd-tyden')), 'štítek e-mailu');
          // telefon: karty mimo obrazovku prohlížeč skládá až při posunu k nim (content-visibility) – projet stránku jako Michal
          await page.evaluate(async () => {
            for (const k of document.querySelectorAll('#p-zdravi .zdravi-mrizka-karet > *')) {
              k.scrollIntoView({ block: 'center' });
              await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
            }
            window.scrollTo(0, 0);
          });
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
      await pripraveno(page);
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
      // všech 7 položek režimu každý den ve stejném pořadí (co neplatí, ztlumeně) – i po klepnutí na jiný den
      const radky = () => page.$$eval('#p-zdravi .zd-doplnky [data-doplnek]', (b) => b.map((x) => x.dataset.doplnek).join());
      const dnes = await radky();
      jistota(dnes.split(',').length === 7, 'všechny položky: ' + dnes);
      const jiny = page.locator('#p-zdravi .zd-doplnky .doplnky-tyden ol button[data-doplnky-ukaz]:not([aria-current])').first();
      if (await jiny.count()) {
        const kam = await jiny.getAttribute('data-doplnky-ukaz');
        await jiny.click();
        await page.waitForSelector('#p-zdravi .zd-doplnky [data-doplnek-den="' + kam + '"]');
        jistota(await radky() === dnes, 'jiný den stejné řádky: ' + await radky());
      }
      // pití a jídlo: bílkoviny ve sloupcích týdne (vymyšlená jídla posledních dní)
      const b = await page.$$eval('#p-zdravi .zd-piti .piti__sl--b', (s) => s.filter((x) => parseFloat(x.style.height) > 0).length);
      jistota(b >= 1, 'sloupky bílkovin v ukázce: ' + b);
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

  // ---------- Doplňky dnes: z režimu motoru, zápasové mimo den zápasu ztlumeně na svém místě, odškrtnutí vydrží obnovení stránky
  await test('Doplňky dnes na Dnes: všechny položky režimu, zápasové mimo den zápasu ztlumeně (nepočítají se), odškrtnutí zůstane', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-doplnky:not([hidden]) [data-doplnek="kreatin"]');
    // Michal 10. 10.: „když v doplňkách kliknu na pátek tak se mi to drobně přeháže“ → řádky jsou každý den stejné
    jistota(await page.locator('#dl-doplnky [data-doplnek="kofein"].doplnek--neplati').count() === 1, 'kofein mimo den zápasu ztlumeně na svém místě');
    jistota(/jen v den zápasu/.test(await page.textContent('#dl-doplnky [data-doplnek="kofein"]')), 'proč dnes neplatí');
    jistota(await page.locator('#dl-doplnky [data-doplnek]').count() === 3, 'všechny tři položky režimu');
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
      jistota(poradi === 'kreatin,kofein(ostatní),horcik(ostatní)', 'hlavní nahoře, ostatní pod čarou (kofein mimo zápas ztlumeně): ' + poradi);
      jistota(/vše ✓/.test(await page.textContent('#dl-doplnky .card-hlava')), 'hořčík nevzatý, a přesto vše ✓ (nepočítá se)');
      jistota(await page.locator('#dl-doplnky .doplnky-tyden li.dnes.plny').count() === 1, 'dnešek v týdnu plný');
      // denní kroužky berou totéž plnění (doplnkyDnes().plneni): Doplňky 1 z 1 hlavních = ✓ v legendě
      const krouzky = () => page.getAttribute('#dnes-kpi [data-krouzky]', 'aria-label');
      jistota(/Doplňky 1 z 1 hlavních \(100 %\)/.test(await krouzky()), 'kroužky: ' + await krouzky());
      jistota((await page.textContent('#dnes-kpi .krouzky-legenda .krouzky--doplnky')).trim() === '✓', 'legenda kroužku Doplňky');
      await page.locator('#dl-doplnky').screenshot({ path: path.join(VYSTUP, 'pc_doplnky_hlavni.png') });
      // odškrtnout jde i ostatní; zrušit hlavní → zbývá 1
      await page.click('#dl-doplnky [data-doplnek="horcik"]');
      await page.waitForSelector('#dl-doplnky [data-doplnek="horcik"][aria-pressed="true"]');
      await page.click('#dl-doplnky [data-doplnek="kreatin"]');
      await page.waitForSelector('#dl-doplnky [data-doplnek="kreatin"][aria-pressed="false"]');
      jistota(/zbývá 1/.test(await page.textContent('#dl-doplnky .card-hlava')), 'zbývá jen hlavní: ' + await page.textContent('#dl-doplnky .card-hlava'));
      jistota(/Doplňky 0 z 1 hlavních \(0 %\)/.test(await krouzky()), 'kroužky po zrušení hlavního: ' + await krouzky());
      jistota((await page.textContent('#dnes-kpi .krouzky-legenda .krouzky--doplnky')).trim() === '0/1', 'legenda kroužku Doplňky 0/1');
      const den = await page.getAttribute('#dl-doplnky .doplnky-tyden li.dnes > *', 'aria-label');
      jistota(/0 z 1 hlavních/.test(den), 'den v týdnu: ' + den);
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      rezimHlavni = null;
      if (drive) doplnkyDny[dnesIso] = drive; else delete doplnkyDny[dnesIso];
    }
  });

  // ---------- Doplňky: výběr jiného dne nic nepřehází (Michal 10. 10.: „když kliknu na pátek, tak se mi to drobně přeháže … to by
  // mělo být furt všude stejné“) – stejné řádky ve stejném pořadí a na stejném místě, co ten den neplatí, je ztlumené
  for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
    await test(v.nazev + ': Doplňky – jiný den (i den zápasu) = stejné řádky ve stejném pořadí a na stejném místě', async () => {
      const zaloha = JSON.parse(JSON.stringify(doplnkyDny));
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, v.dotyk ? 'dark' : 'light');
      try {
        await page.goto(WEB);
        await page.waitForSelector('#dl-doplnky:not([hidden]) .doplnky-tyden');
        const radky = () => page.$$eval('#dl-doplnky [data-doplnek]', (b) => {
          const karta = document.getElementById('dl-doplnky').getBoundingClientRect().top;
          return b.map((x) => x.dataset.doplnek + (x.classList.contains('doplnek--neplati') ? '~' : '') + '@' + Math.round(x.getBoundingClientRect().top - karta)).join();
        });
        const dnes = await radky();
        jistota(/^kreatin@\d+,kofein~@\d+,horcik@\d+$/.test(dnes), 'dnes (kofein ztlumený): ' + dnes);
        jistota(/Bez zápasu a tréninku/.test(await page.textContent('#dl-doplnky .doplnky-pozn')), 'druh dne: ' + await page.textContent('#dl-doplnky .doplnky-pozn'));
        // na telefonu karta mimo obrazovku nemá skutečnou výšku (content-visibility) – nejdřív k ní posunout
        const vyska = () => page.$eval('#dl-doplnky', async (k) => {
          k.scrollIntoView({ block: 'center' });
          await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
          return Math.round(k.getBoundingClientRect().height);
        });
        const vyskaDnes = await vyska();
        await page.locator('#dl-doplnky').screenshot({ path: path.join(VYSTUP, v.nazev + '_doplnky_stejne_radky.png') });
        // den zápasu áčka (před 6 dny): kofein platí – řádky stejné a na stejném místě
        const zapas = iso(den(-6));
        if (!(await page.locator('#dl-doplnky [data-doplnky-ukaz="' + zapas + '"]').count())) await page.click('#dl-doplnky .doplnky-tyden__sipka[aria-label="Předchozí týden"]');
        await page.click('#dl-doplnky [data-doplnky-ukaz="' + zapas + '"]');
        await page.waitForSelector('#dl-doplnky [data-doplnek="kofein"][data-doplnek-den="' + zapas + '"]');
        const vZapas = await radky();
        jistota(vZapas === dnes.replace('kofein~', 'kofein'), 'den zápasu: ' + vZapas + ' × dnes ' + dnes);
        jistota(/den zápasu/i.test(await page.textContent('#dl-doplnky')), 'poznámka o zápasu');
        jistota(await vyska() === vyskaDnes, 'karta stejně vysoká (karty pod ní neposkočí): ' + await vyska() + ' × ' + vyskaDnes);
        await page.locator('#dl-doplnky').screenshot({ path: path.join(VYSTUP, v.nazev + '_doplnky_den_zapasu.png') });
        // další den (bez zápasu) – zase kofein ztlumený, nic se nepohnulo
        const dalsi = iso(den(-5));
        if (await page.locator('#dl-doplnky [data-doplnky-ukaz="' + dalsi + '"]').count()) {
          await page.click('#dl-doplnky [data-doplnky-ukaz="' + dalsi + '"]');
          await page.waitForSelector('#dl-doplnky [data-doplnek="kofein"][data-doplnek-den="' + dalsi + '"]');
          jistota(await radky() === dnes, 'všední den: ' + await radky());
        }
        // ztlumený doplněk jde odškrtnout (vzal ho i tak) → „navíc“, do plnění se nepočítá
        await page.click('#dl-doplnky [data-doplnky-ukaz="dnes"]');
        await page.waitForSelector('#dl-doplnky [data-doplnek="kofein"][data-doplnek-den="' + iso(ted) + '"]');
        const pred = await page.textContent('#dl-doplnky .card-hlava');
        await page.click('#dl-doplnky [data-doplnek="kofein"]');
        await page.waitForSelector('#dl-doplnky [data-doplnek="kofein"][aria-pressed="true"]:not(.doplnek--neplati)');
        jistota(/navíc/.test(await page.textContent('#dl-doplnky [data-doplnek="kofein"]')), 'navíc');
        jistota(await page.textContent('#dl-doplnky .card-hlava') === pred, 'plnění beze změny: ' + await page.textContent('#dl-doplnky .card-hlava'));
        await page.click('#dl-doplnky [data-doplnek="kofein"]');
        await page.waitForSelector('#dl-doplnky [data-doplnek="kofein"].doplnek--neplati');
        jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      } finally {
        await ctx.close();
        Object.keys(doplnkyDny).forEach((k) => delete doplnkyDny[k]);
        Object.assign(doplnkyDny, zaloha);
      }
    });
  }

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
      const cekam = obl.length ? '★ ' + obl.map((o) => o.jmeno + ' (' + o.kdo + ')').join(', ') : jm.jmenaDne(den(i)); // až dvě jména dne
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

  await test('Dnes: prázdný týden (7 dní bez událostí) – svátky u dnů zůstanou, oblíbený ★, pod nimi „nic v kalendáři“', async () => {
    const { za, jmeno } = await oblibenyZa(1);
    jmeninyOblibeni = [{ jmeno, kdo: 'kamarádka' }];
    kalendarPrazdny = true;
    try {
      for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
        const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, v.nazev === 'telefon' ? 'dark' : 'light');
        await page.goto(WEB);
        await page.waitForSelector('#dl-tyden .agenda__prazdno');
        jistota(await page.locator('#dl-tyden .agenda__den').count() === 7 && !(await page.locator('#dl-tyden .agenda__u').count()), v.nazev + ': sedm dní bez událostí');
        jistota(/nic v kalendáři/.test(await page.textContent('#dl-tyden .agenda__prazdno')), v.nazev + ': věta o prázdném týdnu');
        const obl = await page.locator('#dl-tyden .agenda__den').nth(za).locator('.agenda__svatek--oblibeny').textContent();
        jistota(obl.indexOf('★ ' + jmeno) === 0, v.nazev + ': oblíbený v prázdném týdnu: ' + obl);
        jistota(await page.locator('#dl-tyden .agenda__svatek').count() >= 6, v.nazev + ': svátky u dnů');
        jistota(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), v.nazev + ': přetéká do strany');
        await page.locator('#dl-tyden').screenshot({ path: path.join(VYSTUP, v.nazev + '_dnes_tyden_prazdny.png') });
        jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
        await ctx.close();
      }
    } finally {
      kalendarPrazdny = false;
      jmeninyOblibeni = [];
    }
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

  // ---------- jídlo probrané s Claudem (Michal 16. 10.: „chci, aby se jídlo vždy probralo s tebou, abys to zkontroloval … a nebylo to
  // jen přednastavené věci“): stav u každého jídla, Claude se ptá → odpověď čipem i polem, Upřesnit, odhad z Michalovy položky
  for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
    await test(v.nazev + ': jídlo s Claudem – čipy stavu, karta s rozpadem, otázka → odpověď čipem i polem (hned „Odpověděl jsi“), Upřesnit, odhad z Michalovy položky', async () => {
      const zaloha = JSON.parse(JSON.stringify(pitiDny));
      const dnesIso = iso(ted);
      Object.keys(pitiDny).forEach((k) => delete pitiDny[k]);
      pitiDny[dnesIso] = { piti: [], jidlo: [
        { id: 'jc-1', kdy: den(0, 7), co: 'Kuskus', bilkoviny: 8, kcal: 300, odhad: 'mistni' },
        { id: 'jc-2', kdy: den(0, 7.2), co: 'Rizoto s kuřetem', bilkoviny: 34, kcal: 640, odhad: 'claude', poznamka: 'rizoto ~350 g ~21 g, kuře ~60 g ~13 g' },
        { id: 'jc-3', kdy: den(0, 7.4), co: 'Buchta', bilkoviny: 12, kcal: 450, odhad: 'claude', poznamka: 'buchta ~150 g',
          otazka: { text: 'Jaká to byla buchta?', moznosti: ['tvarohová', 's mákem'], kdy: den(0, 7.5) } },
        { id: 'jc-4', kdy: den(0, 7.6), co: 'Polévka', bilkoviny: 6, kcal: 150, odhad: 'claude', otazka: { text: 'Kolik talířů?', moznosti: [], kdy: den(0, 7.7) } },
        { id: 'jc-5', kdy: den(0, 7.8), co: 'Tvaroh', bilkoviny: 30, kcal: 250 }] };
      jidlaMichalMock = { polozky: [{ id: 'box', nazev: 'Box na oběd', typ: 'nadoba', vzory: ['box'], ml: 800 },
        { id: 'kuskus_cizrna', nazev: 'Kuskus s cizrnou', vzory: ['kuskus s cizrnou'], jednotka: 'box', nadoba: 'box', porce: 0.5, g: 350, bilkoviny: 20, kcal: 480 }] };
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, v.dotyk ? 'dark' : 'light');
      const K = '#dl-piti ', R = (id) => K + '[data-jidlo-zapis="' + id + '"] ';
      const cip = (id) => page.textContent(R(id) + '.jidlo-stav');
      try {
        await page.goto(WEB);
        await page.waitForSelector(R('jc-3') + '.jidlo-otazka');
        const cipy = [await cip('jc-1'), await cip('jc-2'), await cip('jc-3'), await cip('jc-5')];
        jistota(cipy.join('|') === 'odhad aplikace · Claude zkontroluje|✓ Claude|❓ Claude se ptá|tvoje čísla', 'čipy stavu: ' + cipy.join('|'));
        jistota(/Claude se ptá: Jaká to byla buchta\?/.test(await page.textContent(R('jc-3') + '.jidlo-otazka')) &&
          await page.locator(R('jc-3') + '[data-jidlo-moznost]').count() === 2, 'otázka s možnostmi u jídla');
        jistota(await page.locator(R('jc-1') + '.jidlo-otazka').count() === 0, 'bez otázky žádný blok');
        await page.locator('#dl-piti').screenshot({ path: path.join(VYSTUP, v.nazev + '_jidlo_claude.png') });
        // karta „✓ Claude“ s rozpadem (myš najetím, dotyk klepnutím)
        if (v.dotyk) await page.tap(R('jc-2') + '.jidlo-stav'); else await page.hover(R('jc-2') + '.jidlo-stav');
        await page.waitForSelector('#bublina-karta.videt[data-druh="jidlo"]');
        const k = (await page.textContent('#bublina-karta')).replace(/\s+/g, ' ');
        jistota(/Rizoto s kuřetem/.test(k) && /rizoto ~350 g ~21 g/.test(k) && /kuře ~60 g ~13 g/.test(k) && /34 g bílkovin/.test(k) && /Upřesnit pro Clauda/.test(k), 'karta s rozpadem: ' + k);
        await page.waitForTimeout(220);
        await page.screenshot({ path: path.join(VYSTUP, v.nazev + '_jidlo_karta.png') });
        if (v.dotyk) await page.tap(R('jc-2') + '.jidlo-stav'); else await page.mouse.move(2, 2);
        await page.waitForSelector('#bublina-karta', { state: 'hidden' });
        // odpověď čipem možnosti → hned „Odpověděl jsi“, motor dostane id a text
        let pred = volano.length;
        await page.click(R('jc-3') + '[data-jidlo-moznost][data-text="tvarohová"]');
        await page.waitForFunction((s) => /Odpověděl jsi: „tvarohová“ · Claude přepočítá/.test(document.querySelector(s).textContent), R('jc-3'));
        jistota(await cip('jc-3') === 'Claude přepočítá' && await page.locator(R('jc-3') + '.jidlo-otazka').count() === 0, 'stav po odpovědi');
        await cekej(() => volano.slice(pred).some((d) => d.akce === 'jidloOdpoved' && d.id === 'jc-3' && d.text === 'tvarohová'), 4000, 'odpověď do motoru');
        // vlastní slova polem: překreslení karty pole nezavře (fokus i text zůstanou), Enter odešle
        const pole = R('jc-4') + '[data-jidlo-odpoved-pole]';
        await page.click(pole);
        await page.keyboard.type('dva tal');
        await page.evaluate(async () => { (await import('./js/stav.js')).zmeneno(); await new Promise((r) => setTimeout(r, 120)); });
        jistota(await page.evaluate((s) => document.activeElement === document.querySelector(s), pole), 'pole po překreslení drží fokus');
        await page.keyboard.type('íře');
        jistota(await page.inputValue(pole) === 'dva talíře', 'text v poli: ' + await page.inputValue(pole));
        pred = volano.length;
        await page.keyboard.press('Enter');
        await cekej(() => volano.slice(pred).some((d) => d.akce === 'jidloOdpoved' && d.id === 'jc-4' && d.text === 'dva talíře'), 4000, 'odpověď polem do motoru');
        await page.waitForFunction((s) => /Odpověděl jsi: „dva talíře“/.test(document.querySelector(s).textContent), R('jc-4'));
        // Upřesnit pro Clauda bez otázky (PC: pravé tlačítko na jídle; dotyk: tlačítko ve vyjeté kartě)
        if (v.dotyk) {
          await page.tap(R('jc-5') + '.jidlo-stav');
          await page.waitForSelector('#bublina-karta.videt [data-jidlo-upresnit="jc-5"]');
          await page.click('#bublina-karta [data-jidlo-upresnit="jc-5"]');
        } else {
          await page.click(R('jc-5'), { button: 'right' });
          await page.waitForSelector('.nabidka.videt [data-nabidka-i]');
          await page.click('.nabidka [data-nabidka-i] span:text-is("Upřesnit pro Clauda…")');
        }
        await page.waitForSelector('.okno-pozadi.videt .okno__pole .field');
        jistota(/Upřesnit pro Clauda/.test(await page.textContent('.okno-pozadi #okno-nadpis')), 'okno Upřesnit');
        await page.fill('.okno-pozadi .okno__pole .field', 'celý kelímek 500 g');
        pred = volano.length;
        await page.click('.okno-pozadi [data-okno="ano"]');
        await cekej(() => volano.slice(pred).some((d) => d.akce === 'jidloOdpoved' && d.id === 'jc-5' && d.text === 'celý kelímek 500 g'), 4000, 'upřesnění do motoru');
        await page.waitForFunction((s) => /Upřesnil jsi: „celý kelímek 500 g“ · Claude přepočítá/.test(document.querySelector(s).textContent), R('jc-5'));
        // odhad z Michalovy položky (JIDLA_MICHAL.json) a nádoba jako jednotka
        await page.click(K + '[data-jidlo-pridat]');
        const O = '[data-panel="jidlo"] ';
        await page.waitForSelector(O + '[data-jidlo-co]');
        await page.fill(O + '[data-jidlo-co]', '¾ boxu kuskusu s cizrnou');
        await page.waitForFunction((o) => /tvůj recept/.test(document.querySelector(o + '[data-jidlo-odhad]').textContent), O);
        const odhad = (await page.textContent(O + '[data-jidlo-odhad]')).replace(/\s+/g, ' ');
        jistota(/≈ 30 g/.test(odhad) && /Kuskus s cizrnou ¾ boxu/.test(odhad), 'odhad z Michalovy položky: ' + odhad);
        await page.locator('[data-panel="jidlo"]').screenshot({ path: path.join(VYSTUP, v.nazev + '_jidlo_muj_recept.png') });
        pred = pitiVolani.length;
        await page.click(O + '[data-jidlo-ulozit]');
        await cekej(() => pitiVolani.slice(pred).some((x) => x.jak === 'jidlo' && x.bilkoviny === 30), 4000, 'jídlo s Michalovým odhadem');
        jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'přetéká');
        jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      } finally {
        await ctx.close();
        Object.keys(pitiDny).forEach((k) => delete pitiDny[k]);
        Object.assign(pitiDny, zaloha);
        jidlaMichalMock = { polozky: [] };
      }
    });
  }

  // ---------- jídlo na správný den (Michal 10. 10.: „nadiktoval sem jídlo co jsem jedl včera … zapsalo se mi to do dneška“ –
  // skutečný zápis zněl „v pátek ráno sem měl 3 rohlíky…“): den z textu, volba dne v okně, Ukázat, Přesunout na jiný den
  for (const v of [VELIKOSTI[3], VELIKOSTI[0]]) {
    await test(v.nazev + ': jídlo zpětně – den z textu („v pátek“, „včera“), volba dne v okně, Ukázat den, Přesunout na jiný den, voda k vybranému dni', async () => {
      const zaloha = JSON.parse(JSON.stringify(pitiDny));
      const dnesIso = iso(ted), vceraIso = iso(den(-1)), predIso = iso(den(-3));
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v, v.dotyk ? 'dark' : 'light');
      const O = '[data-panel="jidlo"] ';
      const posledni = (jak) => pitiVolani.filter((x) => x.jak === jak).slice(-1)[0] || {};
      try {
        await page.goto(WEB);
        await page.waitForSelector('#dl-piti:not([hidden]) [data-jidlo-pridat]');
        await page.click('#dl-piti [data-jidlo-pridat]');
        await page.waitForSelector(O + '[data-jidlo-den]');
        jistota(/Zapíšu na .* · dnes/.test(await page.textContent(O + '[data-jidlo-den]')), 'bez dne v textu: dnes – ' + await page.textContent(O + '[data-jidlo-den]'));
        // „v pátek …“ = poslední uplynulý pátek (v pátek samotný = před týdnem)
        const zpet = (new Date(ted).getDay() - 5 + 7) % 7 || 7;
        const patek = new Date(den(-zpet));
        await page.fill(O + '[data-jidlo-co]', 'v pátek ráno sem měl 3 rohlíky, na oběd kuře s rýží');
        await page.waitForFunction((o) => /Zapíšu na pátek .*podle textu/.test(document.querySelector(o + '[data-jidlo-den]').textContent), O);
        jistota(new RegExp('pátek ' + patek.getDate() + '\\. ' + (patek.getMonth() + 1) + '\\.').test(await page.textContent(O + '[data-jidlo-den]')), 'datum pátku');
        await page.locator('[data-panel="jidlo"]').screenshot({ path: path.join(VYSTUP, v.nazev + '_jidlo_den.png') });
        let pocet = pitiVolani.length;
        await page.click(O + '[data-jidlo-ulozit]');
        await cekej(() => pitiVolani.length > pocet, 5000, 'jídlo do motoru');
        jistota(posledni('jidlo').den === iso(patek.getTime()), 'jídlo na pátek: ' + JSON.stringify(posledni('jidlo')));
        // oznámení s „Ukázat“ → karta ukáže pátek (nadpis s datem, tlačítko Dnes, jídlo v seznamu)
        await page.waitForSelector('#toast.videt .toast__akce');
        jistota(/Zapsáno na pá/.test(await page.textContent('#toast')), 'oznámení: ' + await page.textContent('#toast'));
        await page.click('#toast .toast__akce');
        await page.waitForFunction((d) => document.querySelector('#dl-piti [data-piti-den]').dataset.pitiDen === d, iso(patek.getTime()));
        const hlava = await page.textContent('#dl-piti .card-hlava');
        jistota(new RegExp('pá ' + patek.getDate() + '\\. ').test(hlava) && /Dnes/.test(hlava), 'nadpis s pátkem: ' + hlava);
        jistota(/3 rohlíky/.test(await page.textContent('#dl-piti .piti__jidla')), 'jídlo v pátku');
        jistota(await page.locator('#dl-piti .piti__tyden li.vybrany [aria-current="date"]').count() === 1, 'vybraný den ve sloupcích');
        // voda z karty jde k vybranému dni
        pocet = pitiVolani.length;
        await page.click('#dl-piti [data-piti="250"]');
        await cekej(() => pitiVolani.length > pocet, 5000, 'voda do motoru');
        jistota(posledni('piti').den === iso(patek.getTime()), 'voda k pátku: ' + JSON.stringify(posledni('piti')));
        // Přesunout na jiný den: okno s dny → Dnes
        const id = (posledni('jidlo') && Object.values(pitiDny).flatMap((x) => x.jidlo).find((x) => /3 rohlíky/.test(x.co)) || {}).id;
        await page.click('#dl-piti [data-jidlo-presun="' + id + '"]');
        await page.waitForSelector('.okno [data-okno-volba="' + dnesIso + '"]');
        jistota(await page.locator('.okno [data-okno-volba]').count() === 7, 'sedm dní na výběr');
        // v pátek je „v pátek“ před týdnem – mimo sedm dní okna, žádný den tedy není vybraný
        jistota(await page.locator('.okno [data-okno-volba="' + iso(patek.getTime()) + '"][aria-pressed="true"]').count() === (zpet < 7 ? 1 : 0), 'teď je v pátku');
        await page.waitForTimeout(350); // okno se ukazuje plynule
        await page.screenshot({ path: path.join(VYSTUP, v.nazev + '_jidlo_presun.png') });
        await page.click('.okno [data-okno-volba="' + dnesIso + '"]');
        await cekej(() => posledni('presun').id === id, 5000, 'přesun do motoru');
        jistota(posledni('presun').den === dnesIso, 'přesun na dnešek: ' + JSON.stringify(posledni('presun')));
        await page.waitForFunction(() => !/3 rohlíky/.test((document.querySelector('#dl-piti .piti__jidla') || {}).textContent || ''));
        // zpět na dnešek tlačítkem Dnes – jídlo je tam
        await page.click('#dl-piti [data-piti-ukaz="dnes"]');
        await page.waitForFunction((d) => document.querySelector('#dl-piti [data-piti-den]').dataset.pitiDen === d, dnesIso);
        jistota(/3 rohlíky/.test(await page.textContent('#dl-piti .piti__jidla')), 'jídlo dnes');
        // „včera večer …“ → včerejšek; ruční volba (Včera, Jiný den…) přebije text
        await page.click('#dl-piti [data-jidlo-pridat]');
        await page.waitForSelector(O + '[data-jidlo-den]');
        await page.fill(O + '[data-jidlo-co]', 'včera večer 2 vejce');
        await page.waitForFunction((o) => / · včera.*podle textu/.test(document.querySelector(o + '[data-jidlo-den]').textContent), O);
        jistota(await page.locator(O + '[data-jidlo-na="' + vceraIso + '"][aria-pressed="true"]').count() === 1, 'Včera zvýrazněné');
        await page.selectOption(O + '[data-jidlo-na-vyber]', predIso);
        await page.waitForFunction((o) => !/podle textu/.test(document.querySelector(o + '[data-jidlo-den]').textContent), O);
        await page.fill(O + '[data-jidlo-co]', 'dnes ráno 2 vejce');
        await page.waitForTimeout(100);
        jistota(await page.inputValue(O + '[data-jidlo-na-vyber]') === predIso, 'ruční volba zůstane i po přepsání textu');
        pocet = pitiVolani.length;
        await page.click(O + '[data-jidlo-ulozit]');
        await cekej(() => pitiVolani.length > pocet, 5000, 'jídlo do motoru');
        jistota(posledni('jidlo').den === predIso, 'ručně vybraný den: ' + JSON.stringify(posledni('jidlo')));
        jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'přetéká');
        jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      } finally {
        await ctx.close();
        Object.keys(pitiDny).forEach((k) => delete pitiDny[k]);
        Object.assign(pitiDny, zaloha);
      }
    });
  }

  // ---------- týden v kartě Pití a jídlo (Michal 10. 10.: „ty sloupce můžeš dát i bílkoviny za ten den“): voda a bílkoviny jako
  // podíl cíle, čárkovaná čára = cíl, bublina s gramy, klepnutí na den ho otevře, šipka o týden zpátky
  await test('Pití a jídlo: bílkoviny ve sloupcích týdne (cíl čarou), bublina, klepnutí na den, šipky o týden; hodnocení zpětně změněného dne', async () => {
    const zaloha = JSON.parse(JSON.stringify(pitiDny));
    const v = iso(den(-1)), pv = iso(den(-2));
    pitiDny[v] = { piti: [{ id: 'pv1', kdy: den(-1, 9), ml: 2000 }], jidlo: [{ id: 'jv1', kdy: den(-1, 12), co: 'Kuře s rýží', bilkoviny: 90, kcal: 700 },
      { id: 'jv2', kdy: den(-1, 19), co: 'Tvaroh', bilkoviny: 50, kcal: 400 }],
      hodnoceni: { znamka: 'C', text: 'Bílkoviny 90 g – chyběla večeře.', kdy: den(-1, 21.5), stare: true } };
    pitiDny[pv] = { piti: [{ id: 'pv2', kdy: den(-2, 9), ml: 1000 }], jidlo: [{ id: 'jv3', kdy: den(-2, 12), co: 'Guláš', bilkoviny: 65, kcal: 900 }] };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="zdravi"]');
      const K = '#p-zdravi .zd-piti ';
      await page.waitForSelector(K + '.piti__tyden');
      jistota(/Tento týden/.test(await page.textContent(K + '.piti-tyden__hlava')) && /bílkoviny/.test(await page.textContent(K + '.piti-tyden__legenda')), 'hlavička týdne s legendou');
      if (!(await page.locator(K + '[data-piti-ukaz="' + v + '"]').count())) await page.click(K + '.doplnky-tyden__sipka[aria-label="Předchozí týden"]');
      const sloupec = K + '[data-piti-ukaz="' + v + '"]';
      await page.waitForSelector(sloupec);
      // 140 g ze 130 → nad čárou cíle (75 % výšky → 81 %), 2 l z 2,5 → 60 %
      const vysky = await page.$eval(sloupec, (b) => [b.querySelector('.piti__sl--voda').style.height, b.querySelector('.piti__sl--b').style.height]);
      jistota(vysky.join() === '60%,81%', 'výšky sloupků: ' + vysky);
      await page.hover(sloupec);
      const b = await page.textContent('#graf-bublina');
      jistota(/2,0 l · 140 g/.test(b) && /bílkoviny 108 % cíle/.test(b) && /1\s100\skcal/.test(b) && /klepnutím den otevřeš/.test(b), 'bublina: ' + b);
      await page.locator(K + '.piti-tyden').screenshot({ path: path.join(VYSTUP, 'pc_piti_tyden.png') });
      // klepnutí na včerejšek → karta ukáže ten den, hodnocení se značkou „přehodnotí“
      await page.click(sloupec);
      await page.waitForSelector(K + '[data-piti-den="' + v + '"]');
      jistota(/140 g/.test(await page.textContent(K + '.piti__radek:nth-child(2)')), 'bílkoviny včerejška: ' + await page.textContent(K + '.piti__radek:nth-child(2)'));
      jistota(/Včerejšek podle Clauda/.test(await page.textContent(K + '.piti__hodnoceni')) && /přehodnotí/.test(await page.textContent(K + '.piti__hodnoceni')), 'staré hodnocení');
      await page.locator('#p-zdravi .zd-piti').screenshot({ path: path.join(VYSTUP, 'pc_piti_vcera.png') });
      // šipky: předchozí týden a zpět (dál než 14 dní zpátky to nejde – motor posílá 14 dní)
      const zpetSipka = K + '.doplnky-tyden__sipka[aria-label="Předchozí týden"]';
      if (!(await page.locator(zpetSipka + '[disabled]').count())) {
        await page.click(zpetSipka);
        await page.waitForFunction((k) => !/Tento týden/.test(document.querySelector(k + '.piti-tyden__hlava').textContent), K);
      }
      jistota(await page.locator(zpetSipka + '[disabled]').count() === 1, 'dál zpátky ne');
      await page.click(K + '.doplnky-tyden__sipka[aria-label="Další týden"]');
      await page.waitForFunction((k) => /Tento týden/.test(document.querySelector(k + '.piti-tyden__hlava').textContent), K);
      if (await page.locator(K + '[data-piti-ukaz="dnes"]').count()) await page.click(K + '[data-piti-ukaz="dnes"]');
      await page.waitForSelector(K + '[data-piti-den="' + iso(ted) + '"]');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      Object.keys(pitiDny).forEach((k) => delete pitiDny[k]);
      Object.assign(pitiDny, zaloha);
    }
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
  // ---------- hlídání rychlosti (Michal 9. 10.: „co nejrychlejší práce na stránce“): bez zpomalení procesoru jde o řády, ne
  // o milisekundy – limity jsou volné, ať test netrpí náhodou; pořadí snímek → aplikace a „bez motoru“ platí přesně.
  // Podrobné měření (telefon CPU 4×, pomalé 4G, studený / teplý start): node testy/mereni_rychlosti.js
  await test('rychlost: snímek dřív než moduly, Dnes do 3 s; Pošta se 150 konverzacemi se přepne pod 300 ms; druhé kolo stránek bez čtení z motoru', async () => {
    postaNavic = { osobni: Array.from({ length: 150 }, (x, i) => ({ id: 'r' + i, ucet: 'osobni', stav: ['ceka', 'info', 'resi', 'otazka'][i % 4], od: 'Odesílatel ' + i,
      predmet: 'Předmět ' + i, ukazka: 'Text zprávy ' + i + ' – posílám podklady k připomínkám, prosím o kontrolu do pátku.', kdy: ted - i * H / 2, neprectena: i < 8,
      pocet: 1 + (i % 3), odkaz: '#' })) };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-pozornost .seznam');
      await page.waitForSelector('#dl-tyden .agenda__den');
      await page.waitForTimeout(500);
      if (await page.locator('.okno-pozadi').count()) { await page.keyboard.press('Escape'); await page.waitForSelector('.okno-pozadi', { state: 'detached' }); }
      // přepnutí (klepnutí → další snímek obrazovky), jako v testy/mereni_rychlosti.js
      const prepni = (cil) => page.evaluate(async (c) => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.cil = c; b.hidden = true;
        document.body.appendChild(b);
        const t = performance.now();
        b.click();
        b.remove();
        await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 0)));
        return performance.now() - t;
      }, cil);
      const casy = [];
      for (let i = 0; i < 3; i++) {
        casy.push(await prepni('posta'));
        await page.waitForSelector('#posta-seznam .seznam-posta [data-vlakno="r149"]', { state: 'attached' });
        await prepni('dnes');
        await page.waitForTimeout(150);
      }
      casy.sort((a, b) => a - b);
      jistota(casy[1] < 300, 'přepnutí do Pošty (150 konverzací) trvá ' + casy.map(Math.round).join(' / ') + ' ms');
      jistota(await page.evaluate(() => getComputedStyle(document.querySelector('#posta-seznam .seznam-posta > li:last-child')).contentVisibility === 'auto'),
        'řádky pošty mimo obrazovku se mají přeskočit (content-visibility)');
      // první kolo stránek dotáhne, co patří ke stránce (štítky, kontakty, docházka); druhé už jen z paměti
      const kolo = async () => { for (const c of ['schranka', 'posta', 'kalendar', 'zdravi', 'dnes']) { await prepni(c); await page.waitForTimeout(120); } };
      await kolo();
      await page.waitForTimeout(800);
      volano.length = 0;
      await kolo();
      const cteni = volano.map((d) => d.akce).filter((a) => ['postaDetaily', 'oznacit'].indexOf(a) < 0);
      jistota(!cteni.length, 'druhé kolo přepínání stránek volalo motor: ' + cteni.join(', '));
      // teplé otevření: snímek dřív než moduly aplikace, aplikace vykreslená do 3 s
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.reload();
      await page.waitForFunction(() => window.asistentBezi && performance.getEntriesByName('asistent-vykresleno').length);
      const z = await page.evaluate(() => ['asistent-start-js', 'asistent-snimek', 'asistent-start', 'asistent-vykresleno']
        .map((n) => { const e = performance.getEntriesByName(n)[0]; return e ? Math.round(e.startTime) : -1; }));
      jistota(z[1] >= 0 && z[1] <= z[2], 'snímek se má ukázat dřív než aplikace: ' + z.join(' / '));
      jistota(z[3] > 0 && z[3] < 3000, 'aplikace vykreslená za ' + z[3] + ' ms');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      postaNavic = {};
      await ctx.close();
    }
  });

  // ---------- práce na stránce: překreslení kvůli novým datům nesmaže rozepsanou odpověď Claudovi (dřív každé načtení dat
  // – kopie ze serveru, zdraví – vyměnilo kartu i s polem) a nepřepisuje karty, které se nezměnily
  await test('Dnes: rozepsaná odpověď Claudovi přežije překreslení (i se změnou karty – text, fokus, kurzor); nezměněné karty se nepřepisují', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await page.goto(WEB);
    await page.waitForSelector('#dl-pozornost [data-prepni="c2"]');
    await page.waitForTimeout(600);
    if (await page.locator('.okno-pozadi').count()) { await page.keyboard.press('Escape'); await page.waitForSelector('.okno-pozadi', { state: 'detached' }); }
    await page.click('#dl-pozornost [data-prepni="c2"]');
    const pole = '#dl-pozornost textarea[data-odpoved="c2"]';
    await page.waitForSelector(pole);
    await page.click(pole);
    await page.keyboard.type('Ano, pošli');
    // jiná data (zdraví) se načtou → Dnes se překreslí; karta Vyžaduje pozornost se nezměnila → zůstane stejný prvek
    await page.evaluate(() => { window.__pole = document.querySelector('#dl-pozornost textarea[data-odpoved="c2"]'); window.__tyden = document.querySelector('#dl-tyden .agenda'); });
    await page.evaluate(() => import('/js/zdravi.js').then((m) => m.nactiZdravi(true)));
    await page.waitForTimeout(300);
    jistota(await page.evaluate(() => window.__pole.isConnected && window.__tyden.isConnected), 'nezměněné karty se přepsaly');
    // nový úkol ve schránce → karta se změní a vymění; text, fokus i kurzor zůstanou
    await page.evaluate(() => import('/js/stav.js').then(({ stav, zmeneno }) => {
      stav.schranka.ceka.push({ id: 'c-novy', slozka: 'CEKA', kdy: Date.now(), odkud: 'test', typ: 'ukol-michal', stav: 'tvuj-ukol', shrnuti: 'Nový úkol', termin: '', text: 'x', vlakno: [] });
      zmeneno();
    }));
    await page.waitForSelector('#dl-pozornost [data-polozka-id="c-novy"]');
    jistota(await page.evaluate(() => !window.__pole.isConnected), 'karta se měla vyměnit (test)');
    jistota(await page.inputValue(pole) === 'Ano, pošli', 'rozepsaná odpověď zmizela: „' + await page.inputValue(pole) + '“');
    jistota(await page.evaluate((s) => document.activeElement === document.querySelector(s), pole), 'fokus se nevrátil do pole');
    await page.keyboard.type(' to.');
    jistota(await page.inputValue(pole) === 'Ano, pošli to.', 'kurzor na konci: „' + await page.inputValue(pole) + '“');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

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
  await test('Reely na PC: karta na Dnes, kopírování popisku, zveřejněno; stránka Nevydané · Zveřejněné · Vše, seznam přes celou šířku, detail v okně uprostřed', async () => {
    reelyZverejneno = {};
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    await page.goto(WEB);
    await page.waitForSelector('#dl-reel:not([hidden]) .reel-krok');
    jistota(/Reel k vyvěšení/.test(await page.textContent('#dl-reel')) && /Těšany 3:1/.test(await page.textContent('#dl-reel')), 'karta reelu na Dnes');
    jistota(await page.locator('#dl-reel a.reel__nahled[href="https://drive.google.com/file/d/TEST/view"][target="_blank"]').count() === 1, 'náhled vede na video na Disku');
    jistota(await page.locator('#dl-reel [data-reel-detail="reel_dorost_tesany"]').count() === 1, 'na Přehledu tlačítko Na Instagram');
    jistota(/Reely/.test(await page.textContent('#rail')) && await page.locator('#rail [data-cil="reely"] .pocet').count() === 1, 'Reely v panelu s počtem');
    await page.locator('#dl-reel').screenshot({ path: path.join(VYSTUP, 'pc_dnes_reel.png') });
    await page.click('#dl-reel [data-reel-kopirovat]');
    await page.waitForFunction(() => /Popisek zkopírovaný/.test(document.getElementById('toast').textContent));
    const schranka = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'); // schránka Windows vrací CRLF
    jistota(schranka === 'Hattrick! ⚽⚽⚽\n\nDorost doma porazil Těšany 3:1.\n\nDalší zápas v neděli venku.\n\n#fkagrovnorovy #dorost', 've schránce: ' + JSON.stringify(schranka));
    await page.click('#toast .toast__akce');
    await page.waitForSelector('#dl-reel', { state: 'hidden' });
    jistota(volano.some((d) => d.akce === 'reelStav' && d.id === 'reel_dorost_tesany' && d.zverejneno === true), 'zveřejnění nedorazilo do motoru');
    // stránka Reely: výchozí Nevydané (Michal 15. 10.: „primárně jen to, co čeká na Instagram“) – zveřejněný dorost tam není,
    // béčko (video se ještě nahrává) ano; seznam přes celou šířku, detail až po klepnutí v okně uprostřed (Michal 16. 10.)
    await page.click('#rail [data-cil="reely"]');
    await page.waitForSelector('#p-reely .reel[data-reel="reel_benfika_lipov"]');
    jistota(!(await page.locator('#p-reely .reel[data-reel="reel_dorost_tesany"]').count()), 'zveřejněný v Nevydaných není');
    jistota(await page.getAttribute('#p-reely [data-reely-filtr="nevydane"]', 'aria-pressed') === 'true', 'výchozí Nevydané');
    jistota(/2 reely · 1 čeká na Instagram/.test(await page.textContent('#hlava')), 'podnadpis: ' + await page.textContent('#hlava'));
    jistota(!(await page.locator('#p-reely .reely-detail, [data-panel="reel-detail"]').count()), 'bez klepnutí žádný detail');
    await page.click('#p-reely [data-reel-vyber="reel_benfika_lipov"]');
    const O = '[data-panel="reel-detail"] ';
    await page.waitForSelector(O + '[data-reel-detail="reel_benfika_lipov"]');
    const det = await page.textContent('[data-panel="reel-detail"]');
    jistota(/nahrává se na Disk/.test(det) && /Vnorovy B – Lipov 4:5/.test(det), 'detail v okně: ' + det.slice(0, 160));
    jistota(!(await page.locator(O + '[data-rd-ulozit]').count()), 'bez videa na Disku se plánovat nedá');
    jistota(await page.getAttribute('#p-reely .reel[data-reel="reel_benfika_lipov"]', 'class').then((c) => /reel--vybrany/.test(c)), 'otevřená karta svítí');
    // rozvržení: okno uprostřed (široké), vlevo velký náhled, vpravo obsah; seznam za oknem přes celou šířku, nic nepřetéká
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const o = box('[data-panel="reel-detail"]');
      return { oW: Math.round(o.width), stred: Math.round(o.left + o.width / 2 - innerWidth / 2), nH: Math.round(box('[data-panel="reel-detail"] .reel__nahled').height),
        obsahLeft: Math.round(box('[data-panel="reel-detail"] .reel-detail__obsah').left), nRight: Math.round(box('[data-panel="reel-detail"] .reel__nahled').right),
        kW: Math.round(box('#p-reely .reel').width), prekryv: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    jistota(r.oW >= 900 && Math.abs(r.stred) <= 2 && r.nH >= 380 && r.obsahLeft > r.nRight && r.kW <= 600 && r.prekryv <= 0, 'rozvržení: ' + JSON.stringify(r));
    await page.screenshot({ path: path.join(VYSTUP, 'pc_reely.png') });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-panel="reel-detail"]', { state: 'detached' });
    // Zveřejněné: dorost s „na Instagramu od“; Vše: oba; volba se pamatuje v zařízení
    await page.click('#p-reely [data-reely-filtr="zverejnene"]');
    await page.waitForSelector('#p-reely .reel[data-reel="reel_dorost_tesany"]');
    jistota(await page.locator('#p-reely .reel').count() === 1 && /na Instagramu od/.test(await page.textContent('#p-reely .reel[data-reel="reel_dorost_tesany"]')), 'zveřejněné');
    await page.click('#p-reely [data-reely-filtr="vse"]');
    await page.waitForFunction(() => document.querySelectorAll('#p-reely .reel').length === 2);
    jistota(JSON.parse(await page.evaluate(() => localStorage.getItem('asistent.reely.vyber'))).stav === 'vse', 'volba v zařízení');
    // klepnutí na reel → okno s popiskem; zpět mezi nezveřejněné
    await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
    await page.waitForSelector('[data-panel="reel-detail"] [data-reel-detail="reel_dorost_tesany"]');
    jistota(await page.getAttribute('#p-reely .reel[data-reel="reel_dorost_tesany"] [data-reel-vyber]', 'aria-current') === 'true', 'vybraná karta');
    jistota((await page.inputValue('[data-panel="reel-detail"] [data-reel-popisek]')).replace(/\r\n/g, '\n').indexOf('Hattrick!') === 0, 'popisek v detailu');
    await page.click('[data-panel="reel-detail"] [data-reel-zverejneno="reel_dorost_tesany"]');
    await page.waitForFunction(() => /čeká na Instagram/.test(document.querySelector('#p-reely .reel[data-reel="reel_dorost_tesany"]').textContent));
    jistota(volano.some((d) => d.akce === 'reelStav' && d.id === 'reel_dorost_tesany' && d.zverejneno === false), 'zrušení zveřejnění');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  await test('Reely na telefonu: karta na Dnes pod čísly, ze stránky Fotbal na Reely, klepnutí na reel = detail v okně, nic nepřetéká', async () => {
    reelyZverejneno = {};
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.waitForSelector('#dnes-mobil .reel-krok');
    jistota(await page.locator('#dl-reel:not([hidden])').count() === 0, 'na telefonu jen jedna karta reelu');
    await page.locator('#dnes-mobil .reel-krok').screenshot({ path: path.join(VYSTUP, 'telefon_dnes_reel.png') });
    await page.click('#dl-fotbal [data-cil="fotbal"].sipka');
    await page.waitForSelector('#p-fotbal .reely-tl');
    await page.click('#p-fotbal .reely-tl');
    await page.waitForSelector('#p-reely .reel[data-reel="reel_dorost_tesany"] [data-reel-vyber]');
    jistota(!(await page.locator('[data-panel="reel-detail"]').count()), 'bez klepnutí žádný detail');
    jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'Reely přetékají');
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_reely.png'), fullPage: true });
    // klepnutí na reel → okno s detailem: celý popisek k úpravě, Instagram, tlačítka v patičce
    await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
    const O = '[data-panel="reel-detail"] ';
    await page.waitForSelector(O + '[data-reel-popisek="reel_dorost_tesany"]');
    jistota(/#fkagrovnorovy #dorost$/.test((await page.inputValue(O + '[data-reel-popisek]')).replace(/\r\n/g, '\n')), 'popisek celý v poli');
    jistota(await page.locator(O + '.panel-paticka [data-rd-ted]').count() === 1 && await page.locator(O + '.panel-paticka [data-rd-ulozit]').count() === 1, 'Zveřejnit teď a Naplánovat v patičce');
    await page.waitForTimeout(350);
    const rozmer = await page.evaluate(() => { const o = document.querySelector('[data-panel="reel-detail"]').getBoundingClientRect();
      return { prekryv: document.documentElement.scrollWidth - document.documentElement.clientWidth, w: Math.round(o.width), h: Math.round(o.height), top: Math.round(o.top),
        nahled: document.querySelector('[data-panel="reel-detail"] .reel__nahled').getBoundingClientRect().width }; });
    jistota(rozmer.prekryv <= 0 && rozmer.nahled <= 120 && rozmer.w === 390 && rozmer.h >= 840 && rozmer.top === 0, 'okno detailu přes celou obrazovku: ' + JSON.stringify(rozmer));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(VYSTUP, 'telefon_reel_detail.png') });
    await page.click(O + '[data-zavrit-panel]');
    await page.waitForSelector(O, { state: 'detached' });
    // popisek v kartě na Dnes je celý
    await page.click('.lista [data-cil="dnes"]');
    await page.waitForSelector('#dnes-mobil .reel-krok__popisek');
    const celyPopisek = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.scrollHeight <= el.clientHeight + 1 && /#fkagrovnorovy #dorost/.test(el.innerText); }, sel);
    jistota(await celyPopisek('#dnes-mobil .reel-krok__popisek'), 'popisek v kartě na Dnes není celý');
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
    // Připomenout = odložení e-mailu + úkol do schránky → zneplatní poštu i schránku a server obnoví obojí
    // (dřív jen poštu – úkol se z kopie ztratil a na druhém zařízení se ukázal až za 10 minut)
    fbVolanoData.length = 0;
    await page.waitForFunction(() => import('/js/stav.js').then((m) => !m.stav.nacita.schranka));
    await page.evaluate(() => import('/js/api.js').then((m) => m.volej('pripomenout', { id: 'v1', termin: '2030-01-01' })));
    volano.length = 0;
    await page.evaluate(() => import('/js/schranka.js').then((m) => m.nactiSchranku()));
    jistota(volano.some((d) => d.akce === 'schranka'), 'po Připomenout se schránka nečetla z motoru (kopie bez nového úkolu)');
    for (let i = 0; i < 50 && !fbVolanoData.some((d) => d.jen); i++) await page.waitForTimeout(100);
    jistota(fbVolanoData.some((d) => d.jen && d.jen.indexOf('schranka') >= 0 && d.jen.indexOf('posta') >= 0), 'obnova pošty i schránky po Připomenout: ' + JSON.stringify(fbVolanoData));
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

  // ---------- WEDOS – pracovní schránka přímo (js/wedos.js, server firebase/functions/wedos.js): Nastavení → Pošta
  await test('WEDOS: Nastavení → Pošta zapne pracovní schránku přímo (do účtu, bez hesla), ukáže synchronizaci i chybu, vypne ji', async () => {
    const u = 'uzivatele/' + FB_UZIVATEL.uid;
    Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    fbDocs[u] = { pripojeni: { url: MOTOR, klic: KLIC }, upraveno: Date.now() };
    fbDocs[u + '/data/_stav'] = { kdy: Date.now(), potvrzeno: {}, chyby: [] };
    // server: obnova pracovní schránky zapíše kopii data/wedos (tvar jako pošta z motoru) a potvrzení v _stav
    const kopieWedos = (chyba) => {
      const kdy = Date.now();
      const zprava = Object.assign({}, vlaknoSouhrn.v2, { id: 'w0123456789abcde', ucet: 'pracovni', zdroj: 'wedos', odkaz: null, stitky: [] });
      fbDocs[u + '/data/wedos'] = { json: JSON.stringify({ ted: kdy, pracovniAdresa: 'prace@firma.test', pracovni: [zprava], pocty: { neprectene: 1, konverzaci: 1, celkem: 1 },
        slozky: { dorucene: 'INBOX', odeslane: 'Sent', archiv: '', kos: 'Trash' }, chyba: chyba || null }), otisk: 'o' + kdy + (chyba ? 'c' : ''), kdy, parametry: null };
      if (!chyba) fbDocs[u + '/data/_stav'] = Object.assign({}, fbDocs[u + '/data/_stav'], { potvrzeno: { wedos: kdy } });
    };
    fbObnova = () => { const d = fbVolanoData[fbVolanoData.length - 1] || {}; if (fbVolano[fbVolano.length - 1] === 'wedos' && d.akce === 'obnov') kopieWedos(null); };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.addInitScript((ja) => {
      if (!localStorage.getItem('asistent.ucet')) {
        localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
        localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
      }
    }, FB_UZIVATEL);
    fbVolano.length = 0;
    fbVolanoData.length = 0;
    try {
      await page.goto(WEB);
      await page.click('#rail [data-otevri-nastaveni]');
      const N = '[data-panel="nastaveni"] ';
      await page.click(N + '[data-nast-sekce="posta"]');
      await page.waitForSelector(N + '[data-wedos-adresa]');
      const posta = N + '[data-sekce="posta"]';
      jistota(/Pracovní schránka přímo \(WEDOS\)/.test(await page.textContent(posta)) && /Vypnuto/.test(await page.textContent(posta)), 'oddíl WEDOS, na začátku vypnuto');
      jistota(await page.inputValue(N + '[data-wedos-adresa]') === 'prace@firma.test', 'adresa předvyplněná z pracovní pošty');
      jistota(await page.inputValue(N + '[data-wedos-imap]') === 'wes1-imap.wedos.net' && await page.inputValue(N + '[data-wedos-smtp]') === 'wes1-smtp.wedos.net', 'výchozí servery WEDOS');
      jistota(!(await page.$(posta + ' input[type="password"]')), 'heslo se do aplikace nezadává');
      // cizí server aplikace neuloží (heslo by šlo jinam)
      await page.fill(N + '[data-wedos-imap]', 'imap.zly.test');
      await page.click(N + '[data-wedos="ulozit"]');
      await page.waitForFunction(() => /WEDOS/.test(document.getElementById('toast').textContent));
      jistota(!fbDocs[u].wedos, 'cizí server se nesmí uložit: ' + JSON.stringify(fbDocs[u].wedos));
      await page.fill(N + '[data-wedos-imap]', 'wes1-imap.wedos.net');
      await page.fill(N + '[data-wedos-jmeno]', 'Michal Test');
      await page.click(N + '[data-wedos="ulozit"]');
      await page.waitForFunction((p) => /Připojeno · synchronizováno/.test((document.querySelector(p) || {}).textContent || ''), posta, { timeout: 8000 });
      jistota(JSON.stringify(fbDocs[u].wedos) === JSON.stringify({ adresa: 'prace@firma.test', imap: 'wes1-imap.wedos.net', smtp: 'wes1-smtp.wedos.net', jmeno: 'Michal Test' }),
        'nastavení v účtu: ' + JSON.stringify(fbDocs[u].wedos));
      jistota(fbDocs[u].pripojeni && fbDocs[u].pripojeni.klic === KLIC, 'připojení k motoru v účtu zůstává');
      jistota(fbVolanoData.some((d) => d.akce === 'obnov' && d.vynutit === true), 'server požádán o první spojení: ' + JSON.stringify(fbVolanoData));
      jistota(/1 konverzace, nepřečtené 1/.test(await page.textContent(posta)), 'počty z kopie: ' + await page.textContent(posta));
      // rozhraní pro Poštu (fáze 2): konverzace ve tvaru pošty z motoru
      const zpravy = await page.evaluate(() => import('/js/wedos.js').then((m) => m.zpravy()));
      jistota(zpravy.length === 1 && zpravy[0].ucet === 'pracovni' && zpravy[0].zdroj === 'wedos' && zpravy[0].predmet === vlaknoSouhrn.v2.predmet, 'zpravy(): ' + JSON.stringify(zpravy));
      await page.locator(posta).screenshot({ path: path.join(VYSTUP, 'pc_nastaveni_wedos.png') });
      // chyba ze serveru (špatné heslo) se ukáže živě
      kopieWedos({ druh: 'heslo', text: 'Přihlášení prace@firma.test k poště WEDOS se nepovedlo – zkontroluj adresu a heslo uložené na serveru.', kdy: Date.now() });
      await page.waitForFunction((p) => /zkontroluj adresu a heslo/.test((document.querySelector(p) || {}).textContent || ''), posta, { timeout: 6000 });
      // telefon: stejný oddíl přes menu, bez vodorovného přetékání
      const tel = await novaStranka(prohlizec, VELIKOSTI[0]);
      try {
        await tel.ctx.addInitScript((ja) => {
          if (!localStorage.getItem('asistent.ucet')) {
            localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
            localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
          }
        }, FB_UZIVATEL);
        await tel.page.goto(WEB);
        await tel.page.click('.hlava-ja [data-menu]');
        await tel.page.waitForSelector('[data-panel="menu"].otevreny [data-menu-nastaveni]');
        await tel.page.click('[data-panel="menu"] [data-menu-nastaveni]');
        await tel.page.waitForSelector(N + '.nast-zalozky');
        await tel.page.click(N + '[data-nast-sekce="posta"]');
        await tel.page.waitForFunction((p) => /zkontroluj adresu a heslo/.test((document.querySelector(p) || {}).textContent || ''), posta, { timeout: 6000 });
        jistota(await tel.page.inputValue(N + '[data-wedos-adresa]') === 'prace@firma.test', 'telefon: nastavení z účtu');
        jistota(await tel.page.evaluate((p) => { const s = document.querySelector(p); return s.scrollWidth <= s.clientWidth + 1; }, posta), 'telefon: oddíl přetéká do šířky');
        await tel.page.locator(N + '[data-wedos-adresa]').scrollIntoViewIfNeeded();
        await tel.page.waitForTimeout(250);
        await tel.page.screenshot({ path: path.join(VYSTUP, 'telefon_nastaveni_wedos.png') });
        jistota(!tel.chybyStranky.length, 'telefon – chyby stránky: ' + tel.chybyStranky.join(' | '));
      } finally {
        await tel.ctx.close();
      }
      // vypnout: nastavení pryč z účtu, server smaže kopii
      fbVolanoData.length = 0;
      await page.click(N + '[data-wedos="vypnout"]');
      await page.waitForSelector('.okno-pozadi.videt [data-okno="ano"]');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForFunction(() => /vypnutá/.test(document.getElementById('toast').textContent));
      jistota(fbDocs[u].wedos === null, 'vypnuto v účtu: ' + JSON.stringify(fbDocs[u]));
      jistota(fbVolanoData.some((d) => d.akce === 'vypnout'), 'server požádán o smazání kopie');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fbObnova = null;
      await ctx.close();
    }
  });

  // ---------- WEDOS fáze 2: Pošta bere účet Pracovní ze schránky WEDOS (kopie data/wedos, detail z wedosDetaily, akce funkcí wedos)
  await test('WEDOS: Pošta → Pracovní ze schránky WEDOS – Dnes, seznam, detail z účtu, přečteno, odpověď z pracovní adresy, Hotovo a Vrátit, chyba', async () => {
    const u = 'uzivatele/' + FB_UZIVATEL.uid;
    const T = Date.now();
    const W1 = 'w00000000000a001', W2 = 'w00000000000a002', ZPRAVA = 'w0000000000cc001';
    const souhrn = (id, o) => Object.assign({ id, ucet: 'pracovni', zdroj: 'wedos', stav: 'ceka', duvod: 'prosba „prosím“', od: 'Petr Klient', odAdresa: 'petr@klient.test',
      predmet: 'Nabídka pasportu', ukazka: 'Pošlete prosím nabídku.', kdy: T - 3600e3, neprectena: true, hvezdicka: false, stitky: [], pocet: 1, odkaz: null,
      termin: null, terminVeta: '', poTerminu: false, cekasOd: null }, o);
    const kopie = (seznam, chyba) => {
      fbDocs[u + '/data/wedos'] = { json: JSON.stringify({ ted: T, pracovniAdresa: 'michal@firma.test', pracovni: seznam,
        pocty: { neprectene: seznam.filter((m) => m.neprectena).length, konverzaci: seznam.length, celkem: seznam.length }, slozky: {}, chyba: chyba || null }),
        otisk: 'o' + Math.random(), kdy: Date.now(), parametry: null };
    };
    Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    fbDocs[u] = { pripojeni: { url: MOTOR, klic: KLIC }, upraveno: T,
      wedos: { adresa: 'michal@firma.test', imap: 'wes1-imap.wedos.net', smtp: 'wes1-smtp.wedos.net', jmeno: 'Michal Test' } };
    fbDocs[u + '/data/_stav'] = { kdy: T, potvrzeno: { wedos: T }, chyby: [] };
    kopie([souhrn(W1, {}), souhrn(W2, { predmet: 'Porada v pátek', od: 'Jana Kolegová', odAdresa: 'jana@firma.test', stav: 'cekas', duvod: 'odpověděl jsi poslední',
      ukazka: 'Navrhuji čtvrtek.', kdy: T - 7200e3, neprectena: false, cekasOd: T - 7200e3 })]);
    // detail předem v účtu (server ho chystá do wedosDetaily) – otevření nečeká na schránku
    fbDocs[u + '/wedosDetaily/' + W1] = { json: JSON.stringify({ id: W1, predmet: 'Nabídka pasportu', odkaz: null, vDorucenych: true, skryto: 0, ucet: 'pracovni', zdroj: 'wedos',
      zpravy: [{ id: ZPRAVA, od: 'Petr Klient', odAdresa: 'petr@klient.test', odeMe: false, komu: 'michal@firma.test', kopie: '', kdy: T - 3600e3, predmet: 'Nabídka pasportu',
        text: 'Dobrý den,\npošlete prosím nabídku na pasport budovy.', html: '', prilohy: [{ nazev: 'plan.pdf', velikost: 12000 }] }] }), kdy: T };
    fbObnova = null;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.addInitScript((ja) => {
      if (!localStorage.getItem('asistent.ucet')) {
        localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
        localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
      }
    }, FB_UZIVATEL);
    const wd = () => fbVolanoData.filter((d, i) => fbVolano[i] === 'wedos');
    try {
      await page.goto(WEB);
      // Dnes: nepřečtené počítají i pracovní poštu WEDOS (a Gmailovou pracovní v2 už ne)
      await cekejVeStrance(page, () => import('/js/posta.js').then((m) => m.vsechnyZpravy().some((x) => x.id === 'w00000000000a001')), null, 8000);
      const prehled = await page.evaluate(() => import('/js/posta.js').then((m) => ({ ids: m.vsechnyZpravy().map((x) => x.id), nep: m.neprectene().map((x) => x.id) })));
      jistota(prehled.ids.includes('w00000000000a002') && !prehled.ids.includes('v2') && prehled.nep.includes('w00000000000a001'), 'pošta: ' + JSON.stringify(prehled));
      await page.waitForFunction((n) => ((document.querySelector('#dnes-kpi [data-filtr-posty="neprectene"] .hd__hodnota') || {}).textContent || '').trim() === String(n),
        prehled.nep.length, { timeout: 6000 });
      // Pošta → Pracovní: konverzace z WEDOS, nejdou táhnout na skupiny Gmailu
      await page.click('#rail [data-cil="posta"]');
      await page.click('#posta-filtry [data-ucet-posty="pracovni"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="' + W1 + '"]');
      jistota(await page.locator('#posta-seznam [data-vlakno="' + W2 + '"]').count() === 1, 'chybí druhá konverzace WEDOS');
      jistota(!(await page.locator('#posta-seznam [data-vlakno="v2"]').count()), 'Gmailová pracovní pošta se s WEDOS neukazuje');
      jistota(!(await page.locator('#posta-seznam [data-vlakno^="w"][draggable="true"]').count()), 'WEDOS se nedá přetáhnout na štítek Gmailu');
      // detail z účtu hned (bez funkce detail a bez motoru), otevřením přečteno přes server
      const motorPred = volano.length;
      fbVolano.length = 0;
      fbVolanoData.length = 0;
      await page.click('#posta-seznam [data-vlakno="' + W1 + '"]');
      await page.waitForFunction(() => /pošlete prosím nabídku na pasport/.test((document.querySelector('#posta-detail .zprava') || {}).textContent || ''));
      jistota(/plan\.pdf/.test(await page.textContent('#posta-detail')), 'příloha v detailu');
      await cekej(() => wd().some((d) => d.akce === 'precteno'), 4000, 'přečteno přes server');
      jistota(JSON.stringify(wd()) === JSON.stringify([{ id: W1, precteno: true, akce: 'precteno' }]), 'volání serveru: ' + JSON.stringify(wd()));
      jistota(!volano.slice(motorPred).some((d) => ['vlakno', 'oznacit', 'postaDetaily'].includes(d.akce) && JSON.stringify(d).includes('w0000')), 'WEDOS šlo na motor');
      jistota(await page.isVisible('#posta-detail [data-oznacit="archivovat"]'), 'Hotovo');
      jistota(!(await page.locator('#posta-detail [data-pripomenout], #posta-detail [data-presunout], #posta-detail [data-oznacit="spam"]').count()),
        'Připomenout, Přesunout a Spam jdou jen v Gmailu');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_posta_wedos.png') });
      // odpověď: Od = pracovní adresa WEDOS, bez varování o Gmailu; odeslání funkcí wedos se zprávou WEDOS
      await page.click('#posta-detail [data-psat="odpoved"]');
      await page.waitForSelector('[data-panel="psani"] [data-psani-text]');
      jistota(/michal@firma\.test/.test(await page.textContent('[data-panel="psani"] .psani')), 'Od: pracovní adresa WEDOS');
      jistota(!(await page.locator('[data-panel="psani"] .pruh-varovani').count()), 'bez varování „Odesílat poštu jako“');
      await page.fill('[data-panel="psani"] [data-psani-text]', 'Dobrý den,\nnabídku pošlu dnes.');
      await page.click('[data-panel="psani"] [data-odeslat]');
      await page.waitForSelector('[data-panel="psani"]', { state: 'detached', timeout: 10000 });
      const odeslano = wd().find((d) => d.akce === 'odeslat');
      jistota(odeslano && odeslano.rezim === 'odpoved' && odeslano.id === ZPRAVA && /nabídku pošlu dnes/.test(odeslano.text) && odeslano.idOdeslani,
        'odeslání přes server: ' + JSON.stringify(odeslano));
      jistota(!volano.slice(motorPred).some((d) => d.akce === 'odeslat'), 'odpověď WEDOS šla na motor');
      // Hotovo: hned pryč ze seznamu, server archivuje; Vrátit → zpět
      await page.click('#posta-seznam [data-vlakno="' + W1 + '"]');
      await page.waitForSelector('#posta-detail [data-oznacit="archivovat"]');
      await page.click('#posta-detail [data-oznacit="archivovat"]');
      await page.waitForFunction((id) => !document.querySelector('#posta-seznam [data-vlakno="' + id + '"]'), W1);
      await cekej(() => wd().some((d) => d.akce === 'archivovat' && d.id === W1), 4000, 'archivovat přes server');
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#posta-seznam [data-vlakno="' + W1 + '"]');
      await cekej(() => wd().some((d) => d.akce === 'vratit' && d.id === W1), 4000, 'vrátit přes server');
      // Obnovit = i pracovní schránka na serveru
      fbVolanoData.length = 0;
      fbVolano.length = 0;
      await page.evaluate(() => document.querySelector('[data-obnovit]').click());
      await cekej(() => wd().some((d) => d.akce === 'obnov'), 4000, 'Obnovit nepožádal o pracovní poštu');
      // chyba ze serveru: pruh nad seznamem; prázdná schránka: proč
      kopie([souhrn(W2, { neprectena: false })], { druh: 'heslo', text: 'Přihlášení michal@firma.test k poště WEDOS se nepovedlo – zkontroluj adresu a heslo.', kdy: Date.now() });
      await page.waitForFunction(() => /Pracovní pošta: Přihlášení/.test((document.querySelector('#posta-seznam .pruh-varovani') || {}).textContent || ''), null, { timeout: 6000 });
      kopie([]);
      await page.waitForSelector('#posta-seznam .posta-prace-prazdna');
      jistota(/Za 30 dní nic v Doručené/.test(await page.textContent('#posta-seznam .posta-prace-prazdna')), 'prázdná pracovní schránka');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  // ---------- WEDOS 10. 10.: výběr víc pracovních e-mailů, Beru na vědomí a nabídka přes server (umi v kopii = nový server)
  await test('WEDOS: nabídka bez skupin, Připomenout a Spamu; Beru na vědomí přes server; výběr – Hotovo a Vrátit jedním voláním; starší server bez Beru na vědomí', async () => {
    const u = 'uzivatele/' + FB_UZIVATEL.uid;
    const T = Date.now();
    const W1 = 'w00000000000b001', W2 = 'w00000000000b002', W3 = 'w00000000000b003';
    const souhrn = (id, o) => Object.assign({ id, ucet: 'pracovni', zdroj: 'wedos', stav: 'ceka', duvod: 'prosba „prosím“', od: 'Klient ' + id.slice(-1), odAdresa: 'klient@klient.test',
      predmet: 'Zakázka ' + id.slice(-1), ukazka: 'Pošlete prosím podklady.', kdy: T - 3600e3, neprectena: true, hvezdicka: false, stitky: [], pocet: 1, odkaz: null,
      termin: null, terminVeta: '', poTerminu: false, cekasOd: null }, o);
    const kopie = (seznam, umi) => {
      fbDocs[u + '/data/wedos'] = { json: JSON.stringify({ ted: T, pracovniAdresa: 'michal@firma.test', pracovni: seznam, umi: umi || undefined,
        pocty: { neprectene: seznam.filter((m) => m.neprectena).length, konverzaci: seznam.length, celkem: seznam.length }, slozky: {}, chyba: null }),
        otisk: 'o' + Math.random(), kdy: Date.now(), parametry: null };
    };
    Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    fbDocs[u] = { pripojeni: { url: MOTOR, klic: KLIC }, upraveno: T,
      wedos: { adresa: 'michal@firma.test', imap: 'wes1-imap.wedos.net', smtp: 'wes1-smtp.wedos.net', jmeno: 'Michal Test' } };
    fbDocs[u + '/data/_stav'] = { kdy: T, potvrzeno: { wedos: T }, chyby: [] };
    kopie([souhrn(W1, { stav: 'hori', duvod: 'termín „do zítra“' }), souhrn(W2, { kdy: T - 7200e3 }), souhrn(W3, { kdy: T - 9000e3, neprectena: false, stav: 'info' })], ['vedomi', 'hromadne']);
    fbObnova = null;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.addInitScript((ja) => {
      if (!localStorage.getItem('asistent.ucet')) {
        localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
        localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
      }
    }, FB_UZIVATEL);
    const wd = () => fbVolanoData.filter((d, i) => fbVolano[i] === 'wedos');
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="posta"]');
      await page.click('#posta-filtry [data-ucet-posty="pracovni"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="' + W2 + '"]');
      // nabídka: skupiny, Připomenout a Spam jsou jen v Gmailu
      await page.click('#posta-seznam [data-vlakno="' + W1 + '"]', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      const n = await polozkyNabidky(page);
      jistota(new RegExp('^Otevřít\\|Označit jako přečtené\\|Hotovo\\|Beru na vědomí\\|Odpovědět\\|Přeposlat\\|(Nový e-mail odesílateli\\|Kopírovat adresu\\|)?Vybrat\\|Smazat$').test(n), 'nabídka WEDOS: ' + n);
      // Beru na vědomí: server s časem poslední zprávy, hned informace
      fbVolano.length = 0;
      fbVolanoData.length = 0;
      await page.click('.nabidka [data-nabidka-i]:has-text("Beru na vědomí")');
      await page.waitForFunction((id) => /st-info/.test((document.querySelector('#posta-seznam li:has([data-vlakno="' + id + '"])') || {}).className || ''), W1);
      await cekej(() => wd().some((d) => d.akce === 'vedomi'), 4000, 'vedomi přes server');
      jistota(JSON.stringify(wd()[0]) === JSON.stringify({ ids: [W1], kdy: { [W1]: T - 3600e3 }, akce: 'vedomi' }), 'server: ' + JSON.stringify(wd()));
      const p = await pocty(page);
      jistota(!p.nep.includes(W1) && !p.pozornost.includes(W1) && p.hori === 0, 'počty: ' + JSON.stringify(p));
      // výběr W2 + W3 → Hotovo jedním voláním (ids), Vrátit taky
      fbVolano.length = 0;
      fbVolanoData.length = 0;
      await page.click('#posta-seznam [data-vlakno="' + W2 + '"]', { modifiers: ['Control'] });
      await page.click('#posta-seznam [data-vlakno="' + W3 + '"]', { modifiers: ['Control'] });
      jistota(!(await page.locator('#posta-seznam .posta-vyber [data-hromadne="presunout"]').count()), 'Přesunout do… u WEDOS není');
      await page.click('#posta-seznam .posta-vyber [data-hromadne="archivovat"]');
      await page.waitForFunction((ids) => ids.every((id) => !document.querySelector('#posta-seznam [data-vlakno="' + id + '"]')), [W2, W3]);
      await cekej(() => wd().some((d) => d.akce === 'archivovat'), 4000, 'archivovat přes server');
      jistota(JSON.stringify(wd()) === JSON.stringify([{ ids: [W2, W3], akce: 'archivovat' }]), 'jedno volání: ' + JSON.stringify(wd()));
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#posta-seznam [data-vlakno="' + W3 + '"]');
      await cekej(() => wd().some((d) => d.akce === 'vratit'), 4000, 'vrátit přes server');
      jistota(JSON.stringify(wd().find((d) => d.akce === 'vratit')) === JSON.stringify({ ids: [W2, W3], akce: 'vratit' }), 'Vrátit: ' + JSON.stringify(wd()));
      // starší server (kopie bez umi): Beru na vědomí u pracovní pošty není
      kopie([souhrn(W2, { kdy: T - 7200e3 })]);
      await cekejVeStrance(page, () => import('/js/wedos.js').then((m) => !m.umi('vedomi')));
      await page.click('#posta-seznam [data-vlakno="' + W2 + '"]', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      jistota(!/Beru na vědomí/.test(await polozkyNabidky(page)), 'starší server: ' + await polozkyNabidky(page));
      await page.keyboard.press('Escape');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
      Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    }
  });

  // ---------- Reely: naplánovat na Instagram (motor reel v daný čas zveřejní sám), zrušit plán
  await test('Reely: naplánovat z detailu – čas, účty, popisek (uloží se i jako úprava), štítek „vyjde…“, Uložit změny, zrušit plán', async () => {
    Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
    Object.keys(reelyUpravy).forEach((k) => delete reelyUpravy[k]);
    reelyZverejneno = {};
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="reely"]');
      const D = '[data-panel="reel-detail"] ';
      // první v Nevydaných je nejnovější čekající – dorost; detail v okně uprostřed
      await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
      await page.waitForSelector(D + '[data-reel-detail="reel_dorost_tesany"] [data-rd="kdy"]');
      const vychozi = await page.inputValue(D + '[data-rd="kdy"]');
      jistota(/T18:00$/.test(vychozi), 'výchozí čas 18:00: ' + vychozi);
      jistota(await page.inputValue(D + '[data-rd="oznacit"]') === '@dorost_agro', 'u dorostu předvyplněné @dorost_agro');
      jistota(await page.getAttribute(D + '[data-rd-kam="oba"]', 'aria-pressed') === 'true', 'výchozí reel + příběh');
      const zitra = new Date(den(1, 19.5));
      await page.fill(D + '[data-rd="kdy"]', iso(zitra.getTime()) + 'T19:30');
      await page.fill(D + '[data-reel-popisek]', 'Upravený popisek ⚽\n\n#fkagrovnorovy');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_reel_naplanovat.png') });
      await page.click(D + '[data-rd-ulozit]');
      await page.waitForSelector('#p-reely .reel[data-reel="reel_dorost_tesany"] .tag--plan');
      const z = reelyNaplanovano[reelyNaplanovano.length - 1] || {};
      jistota(z.id === 'reel_dorost_tesany' && z.kdy === den(1, 19.5) && z.oznacit === '@dorost_agro' && /^Upravený popisek/.test(z.popisek) && z.pribeh === true && !z.jenPribeh,
        'plán do motoru: ' + JSON.stringify(z));
      await page.waitForFunction(() => /vyjde .*19:30 \+ příběh/.test(document.querySelector('[data-panel="reel-detail"]').textContent));
      const karta = (await page.textContent(D)).replace(/\s+/g, ' ');
      jistota(/označí @dorost_agro/.test(karta) && /upraveno/.test(karta) && /Uložit změny/.test(karta) && /Zrušit plán/.test(karta), 'detail po naplánování: ' + karta.slice(0, 300));
      jistota(/upravený popisek/.test(await page.textContent('#p-reely .reel[data-reel="reel_dorost_tesany"]')), 'v seznamu: upravený popisek');
      // naplánovaný reel už na Dnes nestraší jako „k vyvěšení“ a v Nevydaných je nahoře mezi Naplánovanými
      jistota(!(await page.evaluate(() => import('/js/reely.js').then((m) => m.kVyveseni().some((r) => r.id === 'reel_dorost_tesany')))), 'naplánovaný není k vyvěšení');
      jistota(await page.locator('#p-reely .reely-sekce--plan .reel[data-reel="reel_dorost_tesany"]').count() === 1, 'v sekci Naplánované');
      // změna času: Uložit změny
      await page.fill(D + '[data-rd="kdy"]', iso(zitra.getTime()) + 'T20:00');
      await page.click(D + '[data-rd-ulozit]');
      await cekej(() => (reelyNaplanovano[reelyNaplanovano.length - 1] || {}).kdy === den(1, 20), 4000, 'nový čas do motoru');
      // zrušit plán
      await page.click(D + '[data-reel-zrusit-plan]');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForSelector(D + '[data-rd-ted]');
      jistota(!reelyPlan.reel_dorost_tesany, 'plán zrušený');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
      Object.keys(reelyPopisky).forEach((k) => delete reelyPopisky[k]);
      Object.keys(reelyUpravy).forEach((k) => delete reelyUpravy[k]);
      await ctx.close();
    }
  });

  // ---------- Instagram: Zveřejnit teď, průběh s časy (aplikace ho posouvá sama), karta na Přehledu (Michal 11. 10.)
  await test('Reely: Zveřejnit teď z detailu – potvrzení, kroky s časy, aplikace posouvá průběh sama, hotovo s odkazem i na Přehledu', async () => {
    Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
    reelyZverejneno = {};
    igKroky.length = 0;
    igZaseknuto = false;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="reely"]');
      const D = '[data-panel="reel-detail"] ';
      await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
      await page.waitForSelector(D + '[data-rd-ted="reel_dorost_tesany"]');
      jistota(await page.locator(D + '[data-rd-ulozit]').count() === 1, 'vedle Zveřejnit teď i Naplánovat');
      await page.fill(D + '[data-rd="oznacit"]', '@dorost_agro, @klub_test');
      await page.click(D + '[data-rd-ted]');
      await page.waitForSelector('.okno-pozadi [data-okno="ano"]');
      const dotaz = await page.textContent('.okno-pozadi');
      jistota(/Zveřejnit hned/.test(dotaz) && /reel i příběh/.test(dotaz) && /@dorost_agro, @klub_test/.test(dotaz), 'potvrzení: ' + dotaz);
      const pred = Date.now();
      await page.click('.okno-pozadi [data-okno="ano"]');
      // plán na teď + hned první krok (igKrok s ted) – nečeká se na čas ani na spouštěč
      await cekej(() => igKroky.some((x) => x.id === 'reel_dorost_tesany' && x.ted), 6000, 'igKrok s ted');
      const z = reelyNaplanovano[reelyNaplanovano.length - 1] || {};
      jistota(z.id === 'reel_dorost_tesany' && z.kdy >= pred - 1000 && z.kdy <= Date.now() && z.pribeh === true && z.oznacit === '@dorost_agro, @klub_test' &&
        /^Hattrick!/.test(z.popisek), 'plán na teď: ' + JSON.stringify(z));
      await page.waitForFunction((d) => /Instagram zpracovává/.test((document.querySelector(d + '.ig-krok--ted[aria-current="step"]') || {}).textContent || ''), D);
      let kroky = (await page.textContent(D + '.ig-kroky')).replace(/\s+/g, ' ');
      jistota(/Naplánováno/.test(kroky) && /Příprava videa/.test(kroky) && /Instagram zpracovává/.test(kroky) && /Příběh/.test(kroky) && /Na Instagramu/.test(kroky), 'kroky: ' + kroky);
      jistota(await page.locator(D + '.ig-krok--hotovo').count() === 2, 'hotové kroky: naplánováno a příprava');
      jistota(/poslední kontrola na Instagramu před chvílí/.test(await page.textContent(D + '.ig-prubeh__info')), 'řádek s kontrolou');
      jistota(/zveřejňuje se/.test(await page.textContent('#p-reely .reel[data-reel="reel_dorost_tesany"] .reel__stitky')), 'štítek v seznamu');
      await page.locator('[data-panel="reel-detail"]').screenshot({ path: path.join(VYSTUP, 'pc_reel_prubeh.png') });
      // aplikace se za ~15 s sama zeptá motoru (igKrok) – reel vyjde a v detailu (pořád vybraný) se ukáže odkaz
      await page.waitForSelector(D + 'a[href="https://www.instagram.com/reel/TESTreel/"]', { timeout: 25000 });
      jistota(igKroky.filter((x) => x.id === 'reel_dorost_tesany').length === 2 && !igKroky[1].ted, 'druhý krok bez ted: ' + JSON.stringify(igKroky));
      kroky = (await page.textContent(D + '.ig-kroky')).replace(/\s+/g, ' ');
      jistota(await page.locator(D + '.ig-krok--hotovo').count() === 6 && !(await page.locator(D + '.ig-krok--ted').count()), 'vše hotové: ' + kroky);
      jistota(/na Instagramu od/.test(await page.textContent(D + '.reel__stitky')), 'zveřejněno z přímého čtení');
      jistota(!(await page.locator('#p-reely .reely-sloupec .reel[data-reel="reel_dorost_tesany"]').count()), 'vydaný zmizel z Nevydaných');
      // Přehled: karta Instagramu s odkazem (vyšlo před chvílí) – nejdřív zavřít okno (Esc)
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="reel-detail"]', { state: 'detached' });
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('#dl-reel:not([hidden]) .ig-karta');
      const karta = (await page.textContent('#dl-reel .ig-karta')).replace(/\s+/g, ' ');
      jistota(/Instagram/.test(karta) && /Těšany 3:1/.test(karta) && /Na Instagramu/.test(karta) && /i v příběhu/.test(karta), 'karta na Přehledu: ' + karta);
      jistota(await page.locator('#dl-reel .ig-karta a[href="https://www.instagram.com/reel/TESTreel/"]').count() === 1, 'odkaz na příspěvek na Přehledu');
      await page.locator('#dl-reel').screenshot({ path: path.join(VYSTUP, 'pc_dnes_instagram.png') });
      // hotové – už se nic nesleduje
      const n = igKroky.length;
      await page.waitForTimeout(2000);
      jistota(igKroky.length === n && !volano.slice(-5).some((d) => d.akce === 'igStav'), 'po zveřejnění se motoru dál neptá');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
      Object.keys(reelyPopisky).forEach((k) => delete reelyPopisky[k]);
      reelyZverejneno = {};
      await ctx.close();
    }
  });

  // ---------- Reely 15. 10.: popisek k úpravě, 2 návrhy od Clauda, jen příběh se zmínkami, příběh z fotky, rozvržení na PC
  await test('Reely: popisek v detailu – uloží se sám, pole zůstane ve fokusu, štítek upraveno, počítadlo, Vrátit původní; 2 návrhy od Clauda – Návrh 2 → Použít; Nové návrhy', async () => {
    Object.keys(reelyUpravy).forEach((k) => delete reelyUpravy[k]);
    reelyZverejneno = {};
    reelyNavrhy.reel_dorost_tesany = { varianty: ['Věcně: dorost porazil Těšany 3:1. ⚽\n\n#fkagrovnorovy', 'Hravě: hattrick a tři body! 🔥\n\n#fkagrovnorovy #dorost'], kdy: Date.now() };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="reely"]');
      const D = '[data-panel="reel-detail"] ';
      await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
      await page.waitForSelector(D + '[data-reel-popisek="reel_dorost_tesany"]');
      jistota(/^99 \/ 2 200$/.test((await page.textContent(D + '[data-reel-znaky]')).replace(/\s/g, ' ')), 'počítadlo: ' + await page.textContent(D + '[data-reel-znaky]'));
      jistota(!(await page.textContent(D + '[data-reel-stitek]')).trim(), 'bez úpravy bez štítku');
      // psaní: štítek hned, uložení 700 ms po posledním písmenu, pole zůstane ve fokusu i po překreslení
      await page.click(D + '[data-reel-popisek]');
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' Díky za podporu!');
      jistota(/upraveno/.test(await page.textContent(D + '[data-reel-stitek]')), 'štítek upraveno hned');
      await cekej(() => volano.some((d) => d.akce === 'reelPopisekUlozit' && d.id === 'reel_dorost_tesany' && /Díky za podporu!$/.test(d.text)), 4000, 'uložení popisku');
      await page.waitForFunction(() => /Uloženo/.test(document.querySelector('[data-panel="reel-detail"] [data-reel-ulozeni]').textContent));
      jistota(await page.evaluate(() => !!document.activeElement && document.activeElement.matches('[data-reel-popisek]')), 'pole zůstalo ve fokusu');
      await page.keyboard.type(' 💚');
      await cekej(() => volano.some((d) => d.akce === 'reelPopisekUlozit' && /podporu! 💚$/.test(d.text)), 4000, 'psaní pokračuje');
      jistota(/upravený popisek/.test(await page.textContent('#p-reely .reel[data-reel="reel_dorost_tesany"]')), 'v seznamu: upravený popisek');
      // návrhy od Clauda: Návrh 1 / Návrh 2, Použít → do pole a uložit
      jistota(/Návrhy od Clauda/.test(await page.textContent(D + '.ig-navrhy')) && /Věcně/.test(await page.textContent(D + '.ig-navrhy__text')), 'návrh 1');
      await page.click(D + '[data-reel-navrh-volba="1"]');
      await page.waitForFunction(() => /Hravě/.test(document.querySelector('[data-panel="reel-detail"] .ig-navrhy__text').textContent));
      await page.screenshot({ path: path.join(VYSTUP, 'pc_reel_popisek_navrhy.png') });
      await page.click(D + '[data-reel-navrh-pouzit]');
      await cekej(() => volano.some((d) => d.akce === 'reelPopisekUlozit' && d.text === 'Hravě: hattrick a tři body! 🔥\n\n#fkagrovnorovy #dorost'), 4000, 'použitý návrh uložený');
      jistota((await page.inputValue(D + '[data-reel-popisek]')).replace(/\r\n/g, '\n') === 'Hravě: hattrick a tři body! 🔥\n\n#fkagrovnorovy #dorost', 'návrh v poli');
      // Vrátit původní: úprava pryč, v poli popisek z PC
      await page.waitForSelector(D + '[data-reel-vratit]');
      await page.click(D + '[data-reel-vratit]');
      await cekej(() => volano.some((d) => d.akce === 'reelPopisekUlozit' && d.vratit === true), 4000, 'Vrátit původní');
      await page.waitForFunction(() => /^Hattrick!/.test(document.querySelector('[data-panel="reel-detail"] [data-reel-popisek]').value));
      jistota(!reelyUpravy.reel_dorost_tesany, 'úprava v motoru pryč');
      // Nové návrhy od Clauda: úkol pro Clauda, „Claude píše 2 návrhy…“
      await page.click(D + '[data-reel-navrh-claude]');
      await cekej(() => volano.some((d) => d.akce === 'reelPopisekNavrhy' && d.id === 'reel_dorost_tesany'), 4000, 'žádost o návrhy');
      await page.waitForSelector(D + '.ig-navrhy__ceka');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.keys(reelyUpravy).forEach((k) => delete reelyUpravy[k]);
      Object.keys(reelyPopisky).forEach((k) => delete reelyPopisky[k]);
      delete reelyNavrhy.reel_dorost_tesany;
      delete reelyNavrhyPozadano.reel_dorost_tesany;
      await ctx.close();
    }
  });

  await test('Reely: jen příběh se zmínkami – kontrola účtů v aplikaci, bez popisku, štítek „příběh vyjde“', async () => {
    Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
    reelyZverejneno = {};
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="reely"]');
      const D = '[data-panel="reel-detail"] ';
      await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
      await page.waitForSelector(D + '[data-rd-kam="pribeh"]');
      await page.click(D + '[data-rd-kam="pribeh"]');
      await page.waitForFunction(() => /Zmínit účty v příběhu/.test(document.querySelector('[data-panel="reel-detail"] .reel-ig').textContent));
      const pred = reelyNaplanovano.length;
      await page.fill(D + '[data-rd="oznacit"]', '@dorost_agro, špatné jméno!');
      await page.click(D + '[data-rd-ulozit]');
      await page.waitForFunction(() => /Neplatné jméno účtu/.test(document.querySelector('[data-panel="reel-detail"] [data-rd-chyba]').textContent));
      jistota(reelyNaplanovano.length === pred, 'neplatné jméno do motoru nejde');
      await page.fill(D + '[data-rd="oznacit"]', '@dorost_agro, @fkagrovnorovy');
      await page.fill(D + '[data-rd="kdy"]', iso(den(1)) + 'T10:00');
      await page.click(D + '[data-rd-ulozit]');
      await page.waitForSelector('#p-reely .reel[data-reel="reel_dorost_tesany"] .tag--plan');
      const z = reelyNaplanovano[reelyNaplanovano.length - 1] || {};
      jistota(z.jenPribeh === true && z.pribeh === false && z.popisek === undefined && z.oznacit === '@dorost_agro, @fkagrovnorovy' && z.kdy === den(1, 10), 'jen příběh do motoru: ' + JSON.stringify(z));
      jistota(/příběh vyjde/.test(await page.textContent('#p-reely .reel[data-reel="reel_dorost_tesany"]')), 'štítek příběh vyjde');
      await page.waitForFunction(() => /zmíní @dorost_agro, @fkagrovnorovy/.test(document.querySelector('[data-panel="reel-detail"]').textContent));
      jistota(await page.getAttribute(D + '[data-rd-kam="pribeh"]', 'aria-pressed') === 'true', 'v detailu naplánovaného jen příběh');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
      Object.keys(reelyPopisky).forEach((k) => delete reelyPopisky[k]);
      await ctx.close();
    }
  });

  await test('Příběh z fotky (telefon): „+“ → fotka 4:3 → JPEG 1080 × 1920 s rozmazaným pozadím, zmínky, Teď → průběh, „příběh vyšel“ mezi Zveřejněnými', async () => {
    pribehyTest.length = 0;
    Object.keys(pribehyPlan).forEach((k) => delete pribehyPlan[k]);
    igKroky.length = 0;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dnes-mobil .reel-krok'); // reely načtené (Instagram propojený)
      await page.click('#lista [data-rychle]');
      await page.click('[data-panel="rychle"] [data-rychle-akce="pribeh"]');
      const O = '[data-panel="pribeh-novy"] ';
      await page.waitForSelector(O + 'label[for="pribeh-foto-vstup"]');
      jistota(await page.isDisabled(O + '[data-np-ulozit]'), 'bez fotky nejde zveřejnit');
      jistota(await page.getAttribute(O + '[data-np-kdy="ted"]', 'aria-pressed') === 'true', 'výchozí Teď');
      // fotka 1600 × 1200 (zelená plocha, uprostřed červený čtverec) – stálé pole pro fotku v <body>
      const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const g = c.getContext('2d');
        g.fillStyle = '#2e7a4d'; g.fillRect(0, 0, 1600, 1200); g.fillStyle = '#d91e26'; g.fillRect(500, 300, 600, 600); return c.toDataURL('image/png'); });
      await page.setInputFiles('#pribeh-foto-vstup', { name: 'fotka.png', mimeType: 'image/png', buffer: Buffer.from(png.split(',')[1], 'base64') });
      await page.waitForSelector(O + '.pribeh-foto__nahled');
      jistota(/rozmazané pozadí/.test(await page.textContent(O + '[data-np-foto]')) && /1600 × 1200/.test(await page.textContent(O + '[data-np-foto]')), 'fotka připravená');
      await page.fill(O + '[data-np="oznacit"]', '@Dorost_Agro');
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_pribeh_novy.png') });
      await page.click(O + '[data-np-ulozit]');
      await cekej(() => volano.some((d) => d.akce === 'pribehNaplanovat'), 8000, 'nahrání příběhu');
      const d = volano.find((x) => x.akce === 'pribehNaplanovat');
      jistota(JSON.stringify(rozmerJpeg(jpegZDat(d.obrazek))) === '[1080,1920]' && JSON.stringify(rozmerJpeg(jpegZDat(d.nahled))) === '[108,192]' &&
        /^[0-9a-f]{24}$/.test(d.otisk) && JSON.stringify(d.oznacit) === '["dorost_agro"]' && Math.abs(d.kdy - Date.now()) < 15000,
        'příběh do motoru: ' + JSON.stringify({ rozmer: rozmerJpeg(jpegZDat(d.obrazek)), otisk: d.otisk, oznacit: d.oznacit }));
      fs.writeFileSync(path.join(VYSTUP, 'pribeh_z_fotky_1080x1920.jpg'), jpegZDat(d.obrazek));
      // nahoře rozmazané (ztmavené) zelené pozadí z fotky, uprostřed fotka s červeným čtvercem
      const px = await page.evaluate((src) => new Promise((ok) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
        const g = c.getContext('2d'); g.drawImage(i, 0, 0); ok([Array.from(g.getImageData(540, 120, 1, 1).data), Array.from(g.getImageData(540, 960, 1, 1).data)]); }; i.src = src; }), d.obrazek);
      jistota(px[0][1] > px[0][0] + 20 && px[0][1] > 60 && px[1][0] > 150 && px[1][1] < 90, 'pixely (pozadí, střed): ' + JSON.stringify(px));
      await cekej(() => igKroky.some((x) => x.typ === 'pribeh' && x.ted), 6000, 'igKrok příběhu s ted');
      // stránka Reely: příběh vyšel (napodobený motor obrázek zveřejní v jednom kroku) → mezi Zveřejněnými
      await page.evaluate(() => import('/js/stav.js').then((m) => { m.prejdi('reely'); m.zmeneno(); }));
      await page.waitForSelector('#p-reely [data-reely-filtr="zverejnene"]');
      await page.click('#p-reely [data-reely-filtr="zverejnene"]');
      await page.waitForSelector('#p-reely [data-pribeh]');
      jistota(/příběh vyšel/.test(await page.textContent('#p-reely [data-pribeh]')) && /zmíní @dorost_agro/.test(await page.textContent('#p-reely [data-pribeh]')), 'karta příběhu: ' +
        await page.textContent('#p-reely [data-pribeh]'));
      await page.click('#p-reely [data-pribeh] [data-reel-vyber]');
      await page.waitForSelector('[data-panel="reel-detail"] [data-pribeh-detail]');
      jistota(/Příběh vyšel/.test(await page.textContent('[data-panel="reel-detail"] .ig-kroky')), 'kroky příběhu');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'nic nepřetéká');
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_pribeh_detail.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      pribehyTest.length = 0;
      Object.keys(pribehyPlan).forEach((k) => delete pribehyPlan[k]);
      await ctx.close();
    }
  });

  // ---------- Reely 16. 10.: detail uprostřed a širší (Michal: „ať to není jen vpravo … dej to doprostřed a ať je to širší“)
  await test('Reely na PC 1500 × 850 a 1920 × 1080 (světlý i tmavý): seznam přes celou šířku v mřížce, detail v širokém okně uprostřed (≥ 900 px), Esc / klepnutí mimo / Zpět zavře; nový příběh ve stejném okně', async () => {
    reelyZverejneno = {};
    reelyPlan.reel_dorost_tesany = { kdy: Date.now() + 5 * H, stav: 'ceka', pribeh: true, oznacit: ['dorost_agro'], upraveno: false };
    pribehyTest.length = 0;
    pribehyTest.push({ id: 'pribeh_0123456789abcdef', nahled: '', vytvoreno: Date.now() - H });
    pribehyPlan.pribeh_0123456789abcdef = { kdy: Date.now() + 2 * H, stav: 'ceka', jenPribeh: true, oznacit: ['dorost_agro'] };
    skupinyVychozi();
    try {
      for (const [sirka, vyska, motiv] of [[1500, 850, 'light'], [1920, 1080, 'dark'], [1500, 850, 'dark'], [1920, 1080, 'light']]) {
        const { ctx, page, chybyStranky } = await novaStranka(prohlizec, { nazev: 'pc', sirka, vyska, dotyk: false }, motiv);
        try {
          await page.goto(WEB);
          await page.click('#rail [data-cil="reely"]');
          await page.waitForSelector('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
          // seznam: přes celou šířku stránky, karty v mřížce (nic přerostlého), žádný detail vedle
          const s = await page.evaluate(() => {
            const box = (x) => document.querySelector(x).getBoundingClientRect();
            const karty = Array.from(document.querySelectorAll('#p-reely .reely-sloupec .reel')).map((k) => Math.round(k.getBoundingClientRect().width));
            return { stranka: Math.round(box('#p-reely').width), sloupec: Math.round(box('#p-reely .reely-sloupec').width), karty,
              sloupce: getComputedStyle(document.querySelector('#p-reely .reely-seznam')).gridTemplateColumns.split(' ').length,
              detail: document.querySelectorAll('#p-reely .reely-detail').length, sekce: document.querySelectorAll('#p-reely .reely-sekce').length,
              prekryv: document.documentElement.scrollWidth - document.documentElement.clientWidth };
          });
          jistota(s.detail === 0 && s.sloupec >= 0.95 * s.stranka && s.stranka >= 0.85 * (sirka - 80) && Math.max(...s.karty) <= 600 && s.sloupce >= (sirka >= 1800 ? 4 : 3) &&
            s.sekce === 2 && s.prekryv <= 0, sirka + '×' + vyska + ' seznam: ' + JSON.stringify(s));
          await page.waitForTimeout(200);
          await page.screenshot({ path: path.join(VYSTUP, 'pc_reely_' + sirka + '_' + motiv + '.png') });
          // klepnutí na reel → okno uprostřed: 900–1200 px (nejvýš 90 % šířky a výšky), vlevo velký náhled, vpravo popisek a Instagram
          await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
          const O = '[data-panel="reel-detail"]';
          await page.waitForSelector(O + ' [data-reel-detail="reel_dorost_tesany"] [data-reel-popisek]');
          await page.waitForTimeout(350);
          const o = await page.evaluate((sel) => {
            const box = (x) => document.querySelector(x).getBoundingClientRect();
            const ok = box(sel), n = box(sel + ' .reel-detail__media .reel__nahled'), ob = box(sel + ' .reel-detail__obsah');
            return { w: Math.round(ok.width), h: Math.round(ok.height), stredX: Math.round(ok.left + ok.width / 2 - innerWidth / 2), stredY: Math.round(ok.top + ok.height / 2 - innerHeight / 2),
              nW: Math.round(n.width), nH: Math.round(n.height), obsahLeft: Math.round(ob.left), obsahW: Math.round(ob.width), nRight: Math.round(n.right),
              pozadi: getComputedStyle(document.querySelector('#panely .panel-pozadi')).opacity, iw: innerWidth, ih: innerHeight,
              akce: !!document.querySelector(sel + ' .panel-paticka [data-rd-ulozit]'), cipy: document.querySelectorAll(sel + ' [data-ig-skupina]').length };
          }, O);
          jistota(o.w >= 900 && o.w <= 1200 && o.w <= 0.9 * o.iw + 1 && o.h <= 0.9 * o.ih + 1 && Math.abs(o.stredX) <= 2 && Math.abs(o.stredY) <= 2 && o.nH >= 380 &&
            o.nH <= 610 && Math.abs(o.nW / o.nH - 9 / 16) < 0.03 && o.obsahLeft > o.nRight && o.obsahW >= 440 && o.pozadi === '1' && o.akce && o.cipy === 2,
            sirka + '×' + vyska + ' okno: ' + JSON.stringify(o));
          await page.screenshot({ path: path.join(VYSTUP, 'pc_reel_okno_' + sirka + '_' + motiv + '.png') });
          // Esc zavře; klepnutí mimo okno zavře; Zpět v prohlížeči zavře
          await page.keyboard.press('Escape');
          await page.waitForSelector(O, { state: 'detached' });
          await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
          await page.waitForSelector(O + '.otevreny');
          await page.mouse.click(20, Math.round(vyska / 2));
          await page.waitForSelector(O, { state: 'detached' });
          jistota(await page.evaluate(() => document.querySelectorAll('#p-reely .reel--vybrany').length) === 0, 'po zavření karta nesvítí');
          await page.click('#p-reely [data-reel-vyber="pribeh_0123456789abcdef"]');
          await page.waitForSelector(O + ' [data-pribeh-detail="pribeh_0123456789abcdef"]');
          await page.waitForTimeout(300);
          const p2 = await page.evaluate((sel) => Math.round(document.querySelector(sel).getBoundingClientRect().width), O);
          jistota(p2 >= 900, 'příběh ve stejném širokém okně: ' + p2);
          await page.goBack();
          await page.waitForSelector(O, { state: 'detached' });
          jistota(await page.evaluate(() => !!document.querySelector('#p-reely .reely-sloupec')), 'po Zpět zůstává stránka Reely');
          // Nový příběh z fotky: stejné široké okno uprostřed (vlevo místo pro fotku 9:16, vpravo kdy a zmínky se skupinami)
          if (sirka === 1500 && motiv === 'light') {
            await page.click('#p-reely [data-pribeh-novy]');
            const N = '[data-panel="pribeh-novy"]';
            await page.waitForSelector(N + ' label[for="pribeh-foto-vstup"]');
            await page.waitForTimeout(350);
            const n = await page.evaluate((sel) => {
              const ok = document.querySelector(sel).getBoundingClientRect(), v = document.querySelector(sel + ' .pribeh-foto__vyber').getBoundingClientRect();
              const pole = document.querySelector(sel + ' .pribeh-okno__pole').getBoundingClientRect();
              return { w: Math.round(ok.width), stredX: Math.round(ok.left + ok.width / 2 - innerWidth / 2), vH: Math.round(v.height), poleLeft: Math.round(pole.left), vRight: Math.round(v.right),
                cipy: document.querySelectorAll(sel + ' [data-ig-skupina]').length };
            }, N);
            jistota(n.w >= 900 && Math.abs(n.stredX) <= 2 && n.vH >= 380 && n.poleLeft > n.vRight && n.cipy === 2, 'okno nového příběhu: ' + JSON.stringify(n));
            await page.screenshot({ path: path.join(VYSTUP, 'pc_pribeh_novy_okno.png') });
            // bez fotky zavře i klepnutí mimo okno
            await page.mouse.click(20, Math.round(vyska / 2));
            await page.waitForSelector(N, { state: 'detached' });
          }
          jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
        } finally {
          await ctx.close();
        }
      }
    } finally {
      delete reelyPlan.reel_dorost_tesany;
      pribehyTest.length = 0;
      Object.keys(pribehyPlan).forEach((k) => delete pribehyPlan[k]);
    }
  });

  // ---------- Skupiny k označení (Michal 16. 10.: „skupiny … k označení … a mít tam pak možnost přidávat si do těch skupin lidi“)
  await test('Skupiny k označení: správa ze stránky Reely i z Nastavení → Instagram – vytvořit, přidat lidi Enterem i víc naráz, kontrola jmen, odebrat ×, přejmenovat, smazat a Vrátit', async () => {
    skupinyVychozi([]);
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="reely"]');
      await page.waitForSelector('#p-reely [data-ig-skupiny-sprava]');
      jistota(/Skupiny/.test(await page.textContent('#p-reely .reely-skupiny')), 'tlačítko Skupiny na stránce Reely');
      await page.click('#p-reely .reely-skupiny');
      const S = '[data-panel="ig-skupiny"] ';
      await page.waitForSelector(S + '[data-ig-sk-novy]');
      jistota(/Zatím žádná skupina/.test(await page.textContent(S + '.ig-sprava')), 'prázdná správa');
      // vytvořit: Enter v poli názvu → skupina, fokus do pole přidání
      await page.fill(S + '[data-ig-sk-novy]', 'Dorost hráči');
      await page.press(S + '[data-ig-sk-novy]', 'Enter');
      await page.waitForSelector(S + '[data-ig-sk] [data-ig-sk-pridat]');
      jistota(skupinyVolani.some((d) => d.nazev === 'Dorost hráči' && Array.isArray(d.ucty) && !d.ucty.length), 'nová skupina do motoru: ' + JSON.stringify(skupinyVolani));
      await cekejVeStrance(page, () => !!document.activeElement && document.activeElement.matches('[data-panel="ig-skupiny"] [data-ig-sk-pridat]'));
      // přidat: jedno jméno Enterem (pole zůstane ve fokusu), pak víc naráz (mezera, čárka, @, velká písmena, opakování)
      await page.keyboard.type('@Hrac_Ukazka1');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => /@hrac_ukazka1/.test(document.querySelector('[data-panel="ig-skupiny"] .ig-sk__clenove').textContent));
      jistota(await page.evaluate(() => document.activeElement.matches('[data-ig-sk-pridat]') && document.activeElement.value === ''), 'pole prázdné a ve fokusu');
      await page.keyboard.type('hrac_ukazka2, @hrac_ukazka3 hrac_ukazka1;hrac.ukazka4');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('[data-panel="ig-skupiny"] .ig-sk__clen').length === 4);
      await cekej(() => (skupinyTest[0] || {}).ucty && skupinyTest[0].ucty.join() === 'hrac_ukazka1,hrac_ukazka2,hrac_ukazka3,hrac.ukazka4', 4000, 'členové v motoru: ' + JSON.stringify(skupinyTest));
      jistota(/4 lidé/.test(await page.textContent(S + '.ig-sk__pocet')), 'počet členů: ' + await page.textContent(S + '.ig-sk__pocet'));
      // neplatné jméno: chyba u skupiny, nic do motoru
      const pred = skupinyVolani.length;
      await page.keyboard.type('špatné jméno!');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => /Neplatné jméno účtu: „špatné“/.test(document.querySelector('[data-panel="ig-skupiny"] [data-ig-sk-chyba]:not([hidden])').textContent));
      jistota(skupinyVolani.length === pred, 'neplatné jméno do motoru nejde');
      await page.fill(S + '[data-ig-sk-pridat]', '');
      // odebrat × u čipu
      await page.click(S + '[data-ig-sk-odebrat="hrac_ukazka3"]');
      await page.waitForFunction(() => document.querySelectorAll('[data-panel="ig-skupiny"] .ig-sk__clen').length === 3);
      await cekej(() => skupinyTest[0].ucty.join() === 'hrac_ukazka1,hrac_ukazka2,hrac.ukazka4', 4000, 'odebráno v motoru');
      // druhá skupina tlačítkem Vytvořit; stejný název nejde
      await page.fill(S + '[data-ig-sk-novy]', 'dorost HRÁČI');
      await page.click(S + '[data-ig-sk-zalozit]');
      await page.waitForFunction(() => /už je/.test(document.querySelector('[data-panel="ig-skupiny"] [data-ig-sk-chyba="novy"]').textContent));
      await page.fill(S + '[data-ig-sk-novy]', 'Trenéři');
      await page.click(S + '[data-ig-sk-zalozit]');
      await page.waitForFunction(() => document.querySelectorAll('[data-panel="ig-skupiny"] [data-ig-sk]').length === 2);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_skupiny.png') });
      // přejmenovat (okno s polem)
      const id1 = skupinyTest[0].id;
      await page.click(S + '[data-ig-sk-prejmenovat="' + id1 + '"]');
      await page.waitForSelector('.okno-pozadi.videt .okno__pole .field');
      await page.fill('.okno-pozadi .okno__pole .field', 'Dorost – hráči');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForFunction(() => /Dorost – hráči/.test(document.querySelector('[data-panel="ig-skupiny"] .ig-sk__nazev').textContent));
      jistota(skupinyTest[0].nazev === 'Dorost – hráči' && skupinyTest[0].ucty.length === 3, 'přejmenováno, členové zůstali');
      // smazat bez dotazu a Vrátit (stejné id, členové zpět)
      await page.click(S + '[data-ig-sk-smazat="' + id1 + '"]');
      await page.waitForFunction(() => document.querySelectorAll('[data-panel="ig-skupiny"] [data-ig-sk]').length === 1);
      await page.waitForSelector('#toast.videt .toast__akce');
      jistota(/smazaná/.test(await page.textContent('#toast')), 'oznámení se smazáním');
      await page.click('#toast .toast__akce');
      await page.waitForFunction(() => document.querySelectorAll('[data-panel="ig-skupiny"] [data-ig-sk]').length === 2);
      jistota(skupinyTest.some((x) => x.id === id1 && x.ucty.length === 3), 'Vrátit: skupina zpět se stejným id: ' + JSON.stringify(skupinyTest));
      // Hotovo → v liště Reely počet skupin; Nastavení → Instagram ukáže totéž
      await page.click('[data-panel="ig-skupiny"] .panel-paticka [data-zavrit-panel]');
      await page.waitForSelector('[data-panel="ig-skupiny"]', { state: 'detached' });
      await page.waitForFunction(() => /2/.test((document.querySelector('#p-reely .reely-skupiny .pocet') || {}).textContent || ''));
      await page.evaluate(() => import('/js/nastaveni.js').then((m) => m.otevriNastaveni('instagram')));
      await page.waitForSelector('[data-panel="nastaveni"] [data-ig-sprava] [data-ig-sk]');
      jistota(await page.locator('[data-panel="nastaveni"] [data-ig-sk]').count() === 2 && /Instagram/.test(await page.textContent('[data-panel="nastaveni"] [data-nast-sekce="instagram"]')),
        'Nastavení → Instagram');
      await page.fill('[data-panel="nastaveni"] [data-ig-sk-pridat="' + id1 + '"]', 'hrac_ukazka5');
      await page.press('[data-panel="nastaveni"] [data-ig-sk-pridat="' + id1 + '"]', 'Enter');
      await cekej(() => skupinyTest.find((x) => x.id === id1).ucty.indexOf('hrac_ukazka5') >= 0, 4000, 'přidáno z Nastavení');
      await page.locator('[data-panel="nastaveni"]').screenshot({ path: path.join(VYSTUP, 'pc_nastaveni_instagram.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      skupinyVychozi();
      await ctx.close();
    }
  });

  await test('Skupiny k označení v okně reelu, plakátu i příběhu: čip přidá všechny členy (bez opakování), druhé klepnutí je ubere, počet / 20, přes 20 nic nepřidá a upozorní, naposledy použitá první', async () => {
    reelyZverejneno = {};
    Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
    const velka = { id: 'sk_test000003', nazev: 'Celý kádr', ucty: Array.from({ length: 18 }, (_, i) => 'kadr_ukazka' + i), barva: 'oranz' };
    skupinyVychozi(SKUPINY_VYCHOZI.concat(velka));
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="reely"]');
      await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
      const D = '[data-panel="reel-detail"] ';
      await page.waitForSelector(D + '[data-ig-skupina="sk_test000001"]');
      const pole = D + '[data-rd="oznacit"]';
      jistota(await page.inputValue(pole) === '@dorost_agro', 'výchozí @dorost_agro');
      jistota(/1 \/ 20/.test(await page.textContent(D + '[data-ig-pocet]')), 'počet: ' + await page.textContent(D + '[data-ig-pocet]'));
      // čip Dorost – hráči: přidá 3 členy za @dorost_agro
      await page.click(D + '[data-ig-skupina="sk_test000001"]');
      jistota(await page.inputValue(pole) === '@dorost_agro, @hrac_ukazka1, @hrac_ukazka2, @hrac_ukazka3', 'po skupině: ' + await page.inputValue(pole));
      jistota(await page.getAttribute(D + '[data-ig-skupina="sk_test000001"]', 'aria-pressed') === 'true' && /4 \/ 20/.test(await page.textContent(D + '[data-ig-pocet]')), 'čip vybraný, 4 / 20');
      // Trenéři: hrac_ukazka1 už v poli je – přidá jen trenéra (bez opakování)
      await page.click(D + '[data-ig-skupina="sk_test000002"]');
      jistota(await page.inputValue(pole) === '@dorost_agro, @hrac_ukazka1, @hrac_ukazka2, @hrac_ukazka3, @trener_ukazka', 'bez opakování: ' + await page.inputValue(pole));
      // druhé klepnutí na Trenéry: uberou se, ale hrac_ukazka1 drží vybraná skupina Dorost
      await page.click(D + '[data-ig-skupina="sk_test000002"]');
      jistota(await page.inputValue(pole) === '@dorost_agro, @hrac_ukazka1, @hrac_ukazka2, @hrac_ukazka3', 'po odebrání trenérů: ' + await page.inputValue(pole));
      // velká skupina (18): 4 + 18 = 22 > 20 → nic nepřidá a upozorní
      await page.click(D + '[data-ig-skupina="sk_test000003"]');
      await page.waitForSelector(D + '[data-ig-varovani]:not([hidden])');
      jistota(/22 účtů/.test(await page.textContent(D + '[data-ig-varovani]')) && /nejvýš 20/.test(await page.textContent(D + '[data-ig-varovani]')), 'varování: ' + await page.textContent(D + '[data-ig-varovani]'));
      jistota(await page.inputValue(pole) === '@dorost_agro, @hrac_ukazka1, @hrac_ukazka2, @hrac_ukazka3' && await page.getAttribute(D + '[data-ig-skupina="sk_test000003"]', 'aria-pressed') === 'false', 'přes limit nic nepřidáno');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_reel_skupiny_limit.png') });
      // psaní do pole: varování zmizí, počet se mění hned
      await page.click(pole);
      await page.keyboard.press('End');
      await page.keyboard.type(', @klub_test');
      jistota(await page.locator(D + '[data-ig-varovani]:not([hidden])').count() === 0 && /5 \/ 20/.test(await page.textContent(D + '[data-ig-pocet]')), 'po psaní 5 / 20');
      // druhé klepnutí na Dorost: uberou se jeho tři, ruční účty zůstanou; naplánovat → účty do motoru
      await page.click(D + '[data-ig-skupina="sk_test000001"]');
      jistota(await page.inputValue(pole) === '@dorost_agro, @klub_test', 'po odebrání skupiny: ' + await page.inputValue(pole));
      await page.click(D + '[data-ig-skupina="sk_test000001"]');
      await page.click(D + '[data-rd-ulozit]');
      await cekej(() => (reelyNaplanovano[reelyNaplanovano.length - 1] || {}).oznacit === '@dorost_agro, @klub_test, @hrac_ukazka1, @hrac_ukazka2, @hrac_ukazka3', 4000,
        'účty se skupinou do motoru: ' + JSON.stringify(reelyNaplanovano[reelyNaplanovano.length - 1]));
      // naposledy použitá skupina (Dorost) je v řadě první; Upravit skupiny otevře správu nad oknem reelu
      jistota(await page.evaluate(() => localStorage.getItem('asistent.ig.skupinaPosledni')) === '"sk_test000001"', 'pamatuje poslední skupinu');
      await page.click(D + '.ig-cipy__sprava');
      await page.waitForSelector('[data-panel="ig-skupiny"] [data-ig-sk="sk_test000002"]');
      await page.fill('[data-panel="ig-skupiny"] [data-ig-sk-pridat="sk_test000002"]', 'trener_ukazka2');
      await page.press('[data-panel="ig-skupiny"] [data-ig-sk-pridat="sk_test000002"]', 'Enter');
      await page.waitForFunction(() => /3/.test(document.querySelector('[data-panel="reel-detail"] [data-ig-skupina="sk_test000002"] .pocet').textContent));
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="ig-skupiny"]', { state: 'detached' });
      jistota(await page.locator('[data-panel="reel-detail"]').count() === 1, 'okno reelu zůstalo pod správou');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="reel-detail"]', { state: 'detached' });
      // příběh z fotky: čipy u Zmínit účty, poslední skupina první
      await page.click('#p-reely [data-pribeh-novy]');
      const N = '[data-panel="pribeh-novy"] ';
      await page.waitForSelector(N + '[data-ig-skupina]');
      jistota(await page.getAttribute(N + '[data-ig-cipy] [data-ig-skupina]', 'data-ig-skupina') === 'sk_test000001', 'naposledy použitá první');
      await page.click(N + '[data-ig-skupina="sk_test000002"]');
      jistota(/@trener_ukazka, @hrac_ukazka1, @trener_ukazka2$/.test(await page.inputValue(N + '[data-np="oznacit"]')), 'zmínky v příběhu: ' + await page.inputValue(N + '[data-np="oznacit"]'));
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="pribeh-novy"]', { state: 'detached' });
      // plakát: okno plánu má čipy u Označit účty
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-ig-naplanovat]');
      await page.click('#p-plakaty [data-pl-ig-naplanovat]');
      const P = '[data-panel="plakat-ig"] ';
      await page.waitForSelector(P + '[data-ig-skupina="sk_test000001"]');
      await page.click(P + '[data-ig-skupina="sk_test000001"]');
      jistota(/@hrac_ukazka1, @hrac_ukazka2, @hrac_ukazka3$/.test(await page.inputValue(P + '[data-pl-ig="oznacit"]')), 'plakát: ' + await page.inputValue(P + '[data-pl-ig="oznacit"]'));
      await page.click(P + '[data-pl-ig-kam="pribeh"]');
      jistota(/Zmínit účty v příběhu/.test(await page.textContent(P + '[data-pl-ig-oznacit-popis]')) && /@hrac_ukazka3$/.test(await page.inputValue(P + '[data-pl-ig="oznacit"]')), 'jen příběh: popisek i účty');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
      Object.keys(reelyPopisky).forEach((k) => delete reelyPopisky[k]);
      Object.keys(reelyUpravy).forEach((k) => delete reelyUpravy[k]);
      skupinyVychozi();
      await ctx.close();
    }
  });

  await test('Skupiny a okno reelu na telefonu (tmavý): okno přes celou obrazovku, čipy u účtů, správa skupin přes celou obrazovku, klávesnice nezakryje pole přidání, nic nepřetéká', async () => {
    reelyZverejneno = {};
    skupinyVychozi();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark');
    // napodobená klávesnice: visualViewport s menší výškou (jako iphoneStranka – window.__klavesnice(viditelná výška), 0 = zavřená)
    await page.addInitScript(() => {
      const cil = new EventTarget();
      let vyska = 0;
      const vv = { get width() { return innerWidth; }, get height() { return vyska || innerHeight; }, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
        addEventListener: cil.addEventListener.bind(cil), removeEventListener: cil.removeEventListener.bind(cil), dispatchEvent: cil.dispatchEvent.bind(cil) };
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
      window.__klavesnice = (h) => { vyska = h; cil.dispatchEvent(new Event('resize')); };
    });
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dnes-mobil .reel-krok');
      await page.evaluate(() => import('/js/stav.js').then((m) => { m.prejdi('reely'); m.zmeneno(); }));
      await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
      const D = '[data-panel="reel-detail"]';
      await page.waitForSelector(D + ' [data-ig-skupina]');
      await page.locator(D + ' [data-ig-oznaceni]').scrollIntoViewIfNeeded();
      await page.click(D + ' [data-ig-skupina="sk_test000001"]');
      await page.waitForTimeout(350);
      const r = await page.evaluate((sel) => { const o = document.querySelector(sel).getBoundingClientRect(), c = document.querySelector(sel + ' .ig-cipy').getBoundingClientRect();
        return { w: Math.round(o.width), h: Math.round(o.height), cRight: Math.round(c.right), prekryv: document.documentElement.scrollWidth - document.documentElement.clientWidth }; }, D);
      jistota(r.w === 390 && r.h >= 840 && r.cRight <= 390 && r.prekryv <= 0, 'telefon – okno reelu: ' + JSON.stringify(r));
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_reel_skupiny.png') });
      // správa skupin: přes celou obrazovku, pole přidání nad klávesnicí (visualViewport – js/panely.js)
      await page.click(D + ' .ig-cipy__sprava');
      const S = '[data-panel="ig-skupiny"]';
      await page.waitForSelector(S + ' [data-ig-sk-pridat="sk_test000002"]');
      await page.click(S + ' [data-ig-sk-pridat="sk_test000002"]');
      {
        await page.evaluate(() => window.__klavesnice(470));
        await page.waitForTimeout(300);
        const k = await page.evaluate((sel) => { const p = document.activeElement.getBoundingClientRect(), pat = document.querySelector(sel + ' .panel-paticka').getBoundingClientRect();
          return { poleDole: Math.round(p.bottom), viditelne: 470, paticka: Math.round(pat.bottom) }; }, S);
        jistota(k.poleDole <= k.viditelne && k.paticka <= k.viditelne + 1, 'klávesnice: ' + JSON.stringify(k));
        await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_skupiny_klavesnice.png') });
        await page.evaluate(() => window.__klavesnice(0));
      }
      await page.keyboard.type('trener_ukazka3');
      await page.keyboard.press('Enter');
      await cekej(() => skupinyTest.find((x) => x.id === 'sk_test000002').ucty.indexOf('trener_ukazka3') >= 0, 4000, 'přidáno na telefonu');
      const r2 = await page.evaluate((sel) => { const o = document.querySelector(sel).getBoundingClientRect();
        return { w: Math.round(o.width), prekryv: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          siroke: Array.from(document.querySelectorAll(sel + ' .ig-sk, ' + sel + ' .ig-sk__clen')).filter((x) => x.getBoundingClientRect().right > 391).length }; }, S);
      jistota(r2.w === 390 && r2.prekryv <= 0 && r2.siroke === 0, 'telefon – správa: ' + JSON.stringify(r2));
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_skupiny.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      skupinyVychozi();
      await ctx.close();
    }
  });

  await test('Reely s účtem: stará kopie „vyjde 20:15“ u reelu, který už vyšel → přímé čtení z motoru ukáže Na Instagramu a server kopii obnoví', async () => {
    const u = 'uzivatele/' + FB_UZIVATEL.uid;
    const T = Date.now();
    const kdy = T - 9 * 60e3; // naplánováno před 9 minutami, spouštěč reel zveřejnil – kopie serveru je z doby před tím
    Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
    fbDocs[u] = { pripojeni: { url: MOTOR, klic: KLIC }, upraveno: T };
    const stara = Object.assign(motor.reely(), { zverejneno: {}, plan: { reel_dorost_tesany: { kdy, stav: 'ceka', oznacit: ['dorost_agro'], pribeh: true } } });
    fbDocs[u + '/data/reely'] = { json: JSON.stringify(stara), kdy: T - 20 * 60e3, parametry: null };
    fbDocs[u + '/data/_stav'] = { kdy: T, potvrzeno: { reely: T - 20 * 60e3 }, chyby: [] };
    reelyPlan.reel_dorost_tesany = { kdy, stav: 'hotovo', oznacit: ['dorost_agro'], pribeh: true, odkaz: 'https://www.instagram.com/reel/TESTstary/', media: 'media-1',
      mediaPribeh: 'media-2', pribehChyba: '', zverejneno: kdy + 70e3, kroky: { priprava: kdy + 5e3, zpracovani: kdy + 8e3, zverejnuji: kdy + 60e3, pribeh: kdy + 65e3, hotovo: kdy + 70e3 } };
    reelyZverejneno = { reel_dorost_tesany: iso(T) };
    igKroky.length = 0;
    fbObnova = null;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.addInitScript((ja) => {
      if (!localStorage.getItem('asistent.ucet')) {
        localStorage.setItem('asistent.ucet', JSON.stringify({ email: ja.email }));
        localStorage.setItem('__fb.user', JSON.stringify({ uid: ja.uid, email: ja.email }));
        localStorage.setItem('asistent.pohled', JSON.stringify('reely'));
        localStorage.setItem('asistent.reely.vyber', JSON.stringify({ stav: 'vse', tym: '' })); // vydaný reel je mezi Zveřejněnými
      }
    }, FB_UZIVATEL);
    try {
      fbVolano.length = 0;
      fbVolanoData.length = 0;
      volano.length = 0;
      await page.goto(WEB);
      const R = '[data-reel="reel_dorost_tesany"] ';
      await page.waitForSelector(R + '.reel__stitky');
      // z kopie nejdřív „na řadě od …“ – aplikace se hned zeptá motoru (čas prošel) a ukáže skutečný stav (detail v okně)
      const D = '[data-panel="reel-detail"] ';
      await page.click('#p-reely [data-reel-vyber="reel_dorost_tesany"]');
      await page.waitForSelector(D + 'a[href="https://www.instagram.com/reel/TESTstary/"]', { timeout: 8000 });
      const stitky = await page.textContent(R + '.reel__stitky');
      jistota(/na Instagramu od/.test(stitky) && !/vyjde|na řadě/.test(stitky), 'štítek: ' + stitky);
      jistota(volano.some((d) => d.akce === 'igKrok' || d.akce === 'igStav'), 'přímé čtení z motoru: ' + volano.map((d) => d.akce).join());
      jistota(/Na Instagramu/.test(await page.textContent(D + '.ig-kroky')) && await page.locator(D + '.ig-krok--hotovo').count() === 6, 'kroky z motoru');
      // stav se změnil → server obnoví kopii reelů (jen ji), stará se už nepoužije
      await cekej(() => fbVolanoData.some((d) => d.jen && d.jen.join() === 'reely'), 6000, 'obnova kopie reelů na serveru: ' + JSON.stringify(fbVolanoData));
      volano.length = 0;
      await page.evaluate(() => import('/js/reely.js').then((m) => m.nactiReely(false)));
      jistota(volano.some((d) => d.akce === 'reely'), 'stará kopie se znovu použila');
      jistota(/na Instagramu od/.test(await page.textContent(R + '.reel__stitky')), 'pořád zveřejněno');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
      reelyZverejneno = {};
      Object.keys(fbDocs).forEach((k) => delete fbDocs[k]);
      await ctx.close();
    }
  });

  await test('Instagram na telefonu: zaseknuté a chyba – důvod, Zkusit znovu z Přehledu, spouštěč neběží; nic nepřetéká', async () => {
    const T = Date.now();
    reelyZverejneno = {};
    reelyPlan.reel_dorost_tesany = { kdy: T - 40 * 60e3, stav: 'chyba', pribeh: true, chyba: 'Instagram video odmítl: Error: video se nepodařilo stáhnout',
      kontejner: '', kroky: { priprava: T - 39 * 60e3, zpracovani: T - 39 * 60e3, chyba: T - 30 * 60e3 } };
    igKroky.length = 0;
    igZaseknuto = true;
    igSpoustec = T - 50 * 60e3;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark');
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dnes-mobil .ig-karta');
      let karta = (await page.textContent('#dnes-mobil .ig-karta')).replace(/\s+/g, ' ');
      jistota(/Těšany 3:1/.test(karta) && /Nepovedlo se/.test(karta) && /Instagram zpracovává: Instagram video odmítl/.test(karta) && /Zkusit znovu/.test(karta), 'karta s chybou: ' + karta);
      await page.locator('#dnes-mobil .ig-karta').screenshot({ path: path.join(VYSTUP, 'telefon_dnes_instagram_chyba.png') });
      await page.click('#dnes-mobil .ig-karta [data-ig-akce="znovu"]');
      await cekej(() => igKroky.some((x) => x.znovu), 6000, 'igKrok se znovu');
      // znovu: Instagram video zase zpracovává (zaseknuté) – karta ukáže krok a spouštěč, který neběží
      await page.waitForFunction(() => /Instagram zpracovává/.test((document.querySelector('#dnes-mobil .ig-karta') || {}).textContent || ''));
      karta = (await page.textContent('#dnes-mobil .ig-karta')).replace(/\s+/g, ' ');
      jistota(/3\/6/.test(karta), 'krok 3 ze 6: ' + karta);
      // stránka Reely: kroky, zaseknutí po 20 min zpracování (Nahrát znovu) a varování, že spouštěč neběží
      reelyPlan.reel_dorost_tesany.kroky.zpracovani = T - 20 * 60e3;
      reelyPlan.reel_dorost_tesany.kontrola = T - 30e3;
      await page.evaluate(() => import('/js/reely.js').then((m) => m.otevriDetail('reel_dorost_tesany')));
      await page.evaluate(() => import('/js/ig.js').then((m) => m.hned('reel', 'reel_dorost_tesany', 'krok')));
      const R = '[data-panel="reel-detail"] ';
      await page.waitForSelector(R + '.ig-zasek [data-ig-akce="znovu"]');
      const zasek = (await page.textContent(R + '.ig-prubeh')).replace(/\s+/g, ' ');
      jistota(/zpracovává už 20 min/.test(zasek) && /Nahrát znovu/.test(zasek) && /Spouštěč motoru naposledy běžel před 50 min/.test(zasek), 'zaseknutí: ' + zasek);
      const rozmer = await page.evaluate(() => ({ prekryv: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        prubeh: document.querySelector('[data-panel="reel-detail"] .ig-prubeh').getBoundingClientRect().width,
        reel: document.querySelector('[data-panel="reel-detail"] .reel-detail').getBoundingClientRect().width }));
      jistota(rozmer.prekryv <= 0 && rozmer.prubeh > rozmer.reel * 0.8, 'telefon: ' + JSON.stringify(rozmer));
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_reel_zasek.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.keys(reelyPlan).forEach((k) => delete reelyPlan[k]);
      reelyZverejneno = {};
      igZaseknuto = false;
      igSpoustec = 0;
      await ctx.close();
    }
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
      await pevnyCasPlakatu(page); // pondělí 12. 10. – nejbližší víkend je 17.–18. 10. bez ohledu na den spuštění
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      jistota(await page.inputValue('#p-plakaty [data-pl-vyber]') === '2026-10-17', 'výchozí víkend: ' + await page.inputValue('#p-plakaty [data-pl-vyber]'));
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
      // na PC jen menší náhled (Michal 15. 10.): nejvýš 720 × 509 px
      const nahled = await page.evaluate(() => { const r = document.querySelector('#p-plakaty .plakat-stage').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      jistota(nahled[0] <= 721 && nahled[0] >= 600 && nahled[1] <= 510, 'náhled na PC ' + nahled.join(' × '));
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
      await pevnyCasPlakatu(page);
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

  // ---------- interaktivní náhled (Michal 15. 10.): klepnutí na text v náhledu plakátu sjede v editoru na pole s tím textem, krátce
  // ho zvýrazní a dá do něj kurzor; mapování přes data-pl-pole (plakat.js) ↔ data-pl-cesta (editor), žádné hledání podle textu
  await test('Plakáty: klepnutí na text v náhledu → jeho pole v editoru (posun, bliknutí, kurzor), obrys jen při najetí v náhledu – tisk a obrázek bez obrysů; telefon klepnutím', async () => {
    fotbalPlakat = true;
    delete plakatyData.kola['2026-10-17'];
    let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    // aktivní pole je v editoru (rozbalené části) a vidět na obrazovce
    const vPoli = (cesta) => cekejVeStrance(page, (c) => {
      const a = document.activeElement, r = a && a.getBoundingClientRect();
      return !!a && a.dataset.plCesta === c && !!a.closest('#p-plakaty .pl-editor') && !a.closest('details:not([open])') && r.top >= 0 && r.bottom <= innerHeight;
    }, cesta, 4000);
    try {
      await pevnyCasPlakatu(page);
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      await naVikend(page, '2026-10-17', 'MILOTICE');
      // každý text a znak v náhledu má své pole v editoru
      const cesty = await page.$$eval(PL + '[data-pl-pole]', (x) => x.map((e) => e.dataset.plPole));
      const bezPole = await page.evaluate((c) => c.filter((x) => !document.querySelector('#p-plakaty .pl-editor [data-pl-cesta="' + x + '"]')), cesty);
      jistota(cesty.length >= 25 && !bezPole.length, 'texty náhledu s polem: ' + cesty.length + ', bez pole: ' + bezPole.join(', '));
      const klikni = async (sel, cesta) => {
        await (typeof sel === 'string' ? page.click(sel) : sel.click());
        await vPoli(cesta);
        jistota(await page.evaluate(() => !!document.activeElement.closest('label.pl-blik')), 'bliknutí u pole ' + cesta);
      };
      // soupeř velké dlaždice: pole soupeře, kurzor na konci – psaní jde rovnou do náhledu
      await klikni(PL + '.blok .opp', 'doma.0.souper');
      jistota(await page.evaluate(() => { const a = document.activeElement; return a.selectionStart === a.value.length && a.selectionEnd === a.value.length; }), 'kurzor na konci textu');
      await page.keyboard.type(' X');
      await page.waitForFunction(() => /MILOTICE X/.test(document.querySelector('#p-plakaty .plakat-stage .poster .blok .opp').textContent));
      // čas a den zvlášť, nadpis, datum, mládež, venku (i znak → výběr znaku), v týdnu, patička
      await klikni(PL + '.blok .when [data-pl-pole="doma.0.cas"]', 'doma.0.cas');
      await klikni(PL + '.blok .when [data-pl-pole="doma.0.den"]', 'doma.0.den');
      await klikni(PL + '.ptitle', 'nadpis');
      await klikni(PL + '.pdate .d', 'datum');
      await klikni(page.locator(PL + '.left .row .opp').nth(2), 'domaMladez.2.souper');
      await klikni(PL + '.awayrow .cat', 'venku.0.kat');
      await klikni(PL + '.awayrow [data-pl-pole="venku.0.logo"]', 'venku.0.logo');
      await klikni(PL + '.wkr .wkm', 'vTydnu.0.souper');
      await klikni(PL + '.pfoot .venue', 'vyzva');
      // najetí myší: ukazatel a obrys jen u textu pod myší
      await page.hover(PL + '.ptitle');
      const najeti = await page.$eval(PL + '.ptitle', (x) => [getComputedStyle(x).cursor, getComputedStyle(x).boxShadow]);
      jistota(najeti[0] === 'pointer' && /inset/.test(najeti[1]), 'obrys při najetí: ' + najeti.join(' | '));
      await page.mouse.move(2, 400);
      jistota(await page.$eval(PL + '.ptitle', (x) => getComputedStyle(x).boxShadow) === 'none', 'bez najetí bez obrysu');
      // plakát pro obrázek (.plakat-export, html2canvas) ani tisk obrysy nemají
      await page.evaluate(() => {
        const h = document.createElement('div');
        h.className = 'plakat-export plakat-export--klon __test-export';
        h.innerHTML = '<div class="plakat poster">' + document.querySelector('#p-plakaty .plakat-stage .poster').innerHTML + '</div>';
        document.body.appendChild(h);
      });
      // (export má pointer-events: none – najetí nejde, proto se zkouší, jestli by na něj pravidla s najetím vůbec platila)
      const vObrazku = await page.evaluate(() => {
        const x = document.querySelector('.__test-export .ptitle');
        const pravidla = [];
        const projdi = (seznam) => Array.from(seznam).forEach((r) => {
          if (/data-pl-pole/.test(r.selectorText || '')) pravidla.push(r.selectorText);
          if (r.cssRules && r.cssRules.length) projdi(r.cssRules); // @media (i vnořená pravidla)
        });
        Array.from(document.styleSheets).forEach((st) => { try { projdi(st.cssRules); } catch (e) { /* cizí list */ } });
        const plati = pravidla.filter((sel) => x.matches(sel.replace(/:hover/g, '')));
        const v = [getComputedStyle(x).cursor, getComputedStyle(x).boxShadow, pravidla.length, plati.join(' ; ')];
        document.querySelector('.__test-export').remove();
        return v;
      });
      jistota(vObrazku[0] !== 'pointer' && vObrazku[1] === 'none' && vObrazku[2] >= 2 && !vObrazku[3], 'obrázek bez obrysu: ' + vObrazku.join(' | '));
      await page.emulateMedia({ media: 'print' });
      await page.hover(PL + '.ptitle');
      const tisk = await page.$eval(PL + '.ptitle', (x) => getComputedStyle(x).boxShadow);
      await page.emulateMedia({ media: 'screen' });
      jistota(tisk === 'none', 'tisk bez obrysu: ' + tisk);
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // telefon: stejně klepnutím (Instagram je nad editorem – posun dolů k poli)
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark', PRAHA));
      await pevnyCasPlakatu(page);
      await page.goto(WEB);
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty .plakat-stage .poster .design');
      await naVikend(page, '2026-10-17', 'MILOTICE');
      await page.tap(PL + '.blok .opp');
      await vPoli('doma.0.souper');
      await page.tap(PL + '.left .row .opp');
      await vPoli('domaMladez.0.souper');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'telefon přetéká');
      jistota(!chybyStranky.length, 'chyby stránky (telefon): ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      delete plakatyData.kola['2026-10-17'];
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
      jistota(await page.getAttribute(O + '[data-pl-ig-kam="oba"]', 'aria-pressed') === 'true', 'příspěvek + příběh zapnuté');
      // popisek přímo v okně (jako u reelu): předvyplněný uloženým, jde upravit; účty k označení
      jistota((await page.inputValue(O + '[data-pl-ig="popisek"]')).replace(/\r\n/g, '\n') === text, 'popisek v okně: ' + await page.inputValue(O + '[data-pl-ig="popisek"]'));
      const text2 = text + '\n\nVstup zdarma!';
      await page.fill(O + '[data-pl-ig="popisek"]', text2);
      await page.fill(O + '[data-pl-ig="oznacit"]', '@dorost_agro');
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
      // popisek z okna: uložený i jako popisek kola (dřív než plán) a poslaný s plánem; označený účet
      const ulozPop = nove.find((d) => d.akce === 'plakatPopisekUlozit');
      jistota(ulozPop && ulozPop.text === text2 && nove.indexOf(ulozPop) < nove.indexOf(plan) && plan.popisek === text2 && plan.oznacit === '@dorost_agro',
        'popisek s plánem: ' + JSON.stringify([ulozPop, plan.popisek, plan.oznacit]));
      jistota(plakatyData.popisky['2026-10-17'].plan === text2 && JSON.stringify(plakatyData.plan['2026-10-17'].oznacit) === '["dorost_agro"]', 'v motoru: ' + JSON.stringify(plakatyData.popisky['2026-10-17']));
      await page.waitForFunction((t) => document.querySelector('#p-plakaty [data-pl-popisek]').value === t, text2);
      const karta = (await page.textContent('#p-plakaty .pl-ig')).replace(/\s+/g, ' ');
      jistota(/vyjde/.test(karta) && /i do příběhu/.test(karta) && /označí @dorost_agro/.test(karta) && /Změnit čas \/ popisek/.test(karta) && /Zrušit plán/.test(karta) &&
        /Kopírovat popisek/.test(karta) && /v plánu/.test(karta), 'karta po naplánování: ' + karta.slice(0, 300));
      // Claude potom pošle nový popisek: plán drží ten z okna, karta nabídne „Použít nový“ (uloží ho i do plánu)
      plakatyData.popisky['2026-10-17'] = Object.assign({}, plakatyData.popisky['2026-10-17'], { text: 'Nový popisek od Clauda ⚽', zdroj: 'claude', kdy: Date.now() + 1000 });
      await page.click('#horni [data-obnovit]');
      await page.waitForSelector('#p-plakaty [data-pl-novy-popisek]');
      jistota((await page.inputValue('#p-plakaty [data-pl-popisek]')).replace(/\r\n/g, '\n') === text2, 'karta ukazuje popisek z plánu');
      await page.click('#p-plakaty [data-pl-popisek-novy]');
      await cekej(() => plakatyData.popisky['2026-10-17'].plan === 'Nový popisek od Clauda ⚽', 6000, 'nový popisek v plánu');
      await page.waitForFunction(() => !document.querySelector('#p-plakaty [data-pl-novy-popisek]'));
      // Změnit čas / popisek: okno s popiskem a účty z plánu
      await page.click('#p-plakaty [data-pl-ig-naplanovat]');
      await page.waitForSelector(O + '[data-pl-ig="popisek"]');
      jistota(/Změnit plán/.test(await page.textContent(O + '.panel-titul')) && await page.inputValue(O + '[data-pl-ig="popisek"]') === 'Nový popisek od Clauda ⚽' &&
        await page.inputValue(O + '[data-pl-ig="oznacit"]') === '@dorost_agro', 'okno změny plánu');
      await page.click(O + '[data-zavrit-panel]');
      await page.waitForSelector(O, { state: 'detached' });
      await page.waitForTimeout(300);
      await page.locator('#p-plakaty .pl-ig').screenshot({ path: path.join(VYSTUP, 'pc_plakat_instagram.png') });
      // zrušit plán
      await page.click('#p-plakaty [data-pl-ig-zrusit]');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForFunction(() => !document.querySelector('#p-plakaty .pl-ig .tag--plan') && document.querySelector('#p-plakaty .pl-ig [data-pl-ig-naplanovat]'));
      jistota(!plakatyData.plan['2026-10-17'] && volano.some((d) => d.akce === 'plakatZrusitPlan' && d.tyden === '2026-10-17'), 'plán zrušený');
      jistota(!plakatyData.popisky['2026-10-17'].plan && plakatyData.popisky['2026-10-17'].text === 'Nový popisek od Clauda ⚽', 'popisek kola zůstal, popisek plánu pryč');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });


  await test('Plakáty: naplánovaný plakát – kroky, Zveřejnit teď s potvrzením, obrázek vyjde v jednom kroku', async () => {
    fotbalPlakat = true;
    const T = Date.now();
    plakatyData.popisky['2026-10-17'] = { text: 'Áčko hostí Milotice!', zdroj: 'rucne', kdy: T };
    plakatyData.obrazky['2026-10-17'] = { prispevek: true, pribeh: true, kdy: T };
    plakatyData.plan['2026-10-17'] = { kdy: T + 3 * 3600e3, stav: 'ceka', pribeh: true };
    igKroky.length = 0;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      await naVikend(page, '2026-10-17', 'MILOTICE');
      await page.waitForSelector('#p-plakaty .pl-ig .ig-kroky');
      const karta = (await page.textContent('#p-plakaty .pl-ig')).replace(/\s+/g, ' ');
      jistota(/vyjde/.test(karta) && /Příprava obrázku/.test(karta) && /Zveřejnit teď/.test(karta) && /Změnit čas/.test(karta) && /Zrušit plán/.test(karta), 'karta: ' + karta.slice(0, 300));
      jistota(!igKroky.length && !volano.some((d) => d.akce === 'igStav'), 'za 3 h – motoru se zatím neptá');
      await page.click('#p-plakaty .pl-ig [data-ig-akce="ted"]');
      await page.waitForSelector('.okno-pozadi [data-okno="ano"]');
      jistota(/Zveřejnit hned/.test(await page.textContent('.okno-pozadi')) && /@fkagrovnorovy/.test(await page.textContent('.okno-pozadi')), 'potvrzení');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForSelector('#p-plakaty .pl-ig a[href="https://www.instagram.com/reel/TESTplakat/"]');
      jistota(igKroky.length === 1 && igKroky[0].typ === 'plakat' && igKroky[0].id === '2026-10-17' && igKroky[0].ted, 'igKrok: ' + JSON.stringify(igKroky));
      jistota((await page.locator('#p-plakaty .pl-ig .ig-krok--hotovo').count()) === 6, 'všechny kroky hotové');
      jistota(/na Instagramu/.test(await page.textContent('#p-plakaty .pl-ig__stav')), 'štítek na Instagramu');
      await page.locator('#p-plakaty .pl-ig').screenshot({ path: path.join(VYSTUP, 'pc_plakat_instagram_hotovo.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      delete plakatyData.plan['2026-10-17'];
      delete plakatyData.popisky['2026-10-17'];
      delete plakatyData.obrazky['2026-10-17'];
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty: 2 návrhy popisku od Clauda (Návrh 2 → Použít) a jen příběh se zmínkami – bez popisku, štítek „příběh vyjde“', async () => {
    fotbalPlakat = true;
    const T = Date.now();
    plakatyData.popisky['2026-10-17'] = { text: 'Áčko hostí Milotice!', varianty: ['Áčko hostí Milotice!', 'Derby s Miloticemi – kdo nepřijde, neuvidí to! 🔥'],
      zdroj: 'claude', kdy: T };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'light', PRAHA);
    try {
      await pevnyCasPlakatu(page);
      await page.goto(WEB);
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty [data-pl-vyber]');
      await naVikend(page, '2026-10-17', 'MILOTICE');
      await page.waitForSelector('#p-plakaty .pl-ig .ig-navrhy');
      jistota(/Návrhy od Clauda/.test(await page.textContent('#p-plakaty .pl-ig .ig-navrhy')), 'návrhy v kartě Instagram');
      await page.click('#p-plakaty .pl-ig [data-pl-navrh-volba="1"]');
      await page.waitForFunction(() => /Derby/.test(document.querySelector('#p-plakaty .pl-ig .ig-navrhy__text').textContent));
      await page.click('#p-plakaty .pl-ig [data-pl-navrh-pouzit]');
      await cekej(() => volano.some((d) => d.akce === 'plakatPopisekUlozit' && d.tyden === '2026-10-17' && /^Derby s Miloticemi/.test(d.text)), 6000, 'použitý návrh uložený');
      await page.waitForFunction(() => /^Derby s Miloticemi/.test(document.querySelector('#p-plakaty [data-pl-popisek]').value));
      // jen příběh: okno bez popisku, zmínky
      await page.click('#p-plakaty [data-pl-ig-naplanovat]');
      const O = '[data-panel="plakat-ig"] ';
      await page.waitForSelector(O + '[data-pl-ig-kam="pribeh"]');
      jistota(await page.getAttribute(O + '[data-pl-ig-kam="oba"]', 'aria-pressed') === 'true', 'výchozí příspěvek + příběh');
      await page.click(O + '[data-pl-ig-kam="pribeh"]');
      await page.waitForFunction(() => document.querySelector('[data-panel="plakat-ig"] [data-pl-ig-prispevek]').hidden);
      jistota(/Zmínit účty v příběhu/.test(await page.textContent(O)) && /jen příběh/.test(await page.textContent(O + '[data-pl-ig-napoveda]')), 'okno jen příběhu');
      await page.fill(O + '[data-pl-ig="oznacit"]', '@fkmilotice');
      await page.waitForSelector(O + '.pl-nahled-pribeh', { timeout: 20000 });
      await page.screenshot({ path: path.join(VYSTUP, 'pc_plakat_jen_pribeh.png') });
      const pred = volano.length;
      await page.click(O + '[data-pl-ig-ulozit]');
      await page.waitForSelector('#p-plakaty .pl-ig .tag--plan');
      const plan = volano.slice(pred).find((d) => d.akce === 'plakatNaplanovat');
      jistota(plan && plan.jenPribeh === true && plan.pribeh === false && plan.popisek === undefined && plan.oznacit === '@fkmilotice', 'jen příběh do motoru: ' + JSON.stringify(plan));
      const karta = (await page.textContent('#p-plakaty .pl-ig__stav')).replace(/\s+/g, ' ');
      jistota(/příběh vyjde/.test(karta) && /zmíní @fkmilotice/.test(karta), 'štítek: ' + karta);
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      delete plakatyData.plan['2026-10-17'];
      delete plakatyData.popisky['2026-10-17'];
      delete plakatyData.obrazky['2026-10-17'];
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  await test('Plakáty na telefonu (390 px, tmavý režim): z menu i ze stránky Fotbal, náhled se vejde, nic nepřetéká do strany', async () => {
    fotbalPlakat = true;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark', PRAHA);
    try {
      await pevnyCasPlakatu(page);
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

  // ---------- Plakáty na iPhonu (Michal 15. 10.: „na mobilu mi nejde stáhnout obrázek plakátu“): Safari pustí navigator.share
  // jen hned v obsluze klepnutí → obrázek se chystá dopředu a klepnutí sdílí synchronně; bez sdílení (nebo když ho Safari
  // odmítne) okno s obrázkem přes celou obrazovku – podržet prst → Přidat do Fotek. Sdílení je v testu napodobené (záznam
  // souboru a události, ve které se zavolalo). WebKit, když je nainstalovaný (npx playwright install webkit), jinak Chromium
  // s emulací iPhonu (user agent, 390 × 844, dotyk).
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
  let webkitProhlizec = null;
  try { webkitProhlizec = await require('playwright').webkit.launch(); } catch (e) { webkitProhlizec = null; }
  const iphoneJadro = webkitProhlizec ? 'WebKit' : 'Chromium jako iPhone – WebKit není nainstalovaný';
  /** Stránka jako iPhone: sdileni = navigator.share / canShare (napodobené), klavesnice = napodobený visualViewport
   *  (window.__klavesnice(výška) „otevře“ klávesnici, 0 ji zavře). */
  async function iphoneStranka(motiv, sdileni, klavesnice) {
    const v = await novaStranka(webkitProhlizec || prohlizec, VELIKOSTI[0], motiv, Object.assign({ userAgent: IPHONE_UA, deviceScaleFactor: 3 }, PRAHA));
    await v.page.addInitScript((sdilet) => {
      window.__sdileni = [];
      window.__sdileniChyba = '';
      const nastav = (jmeno, hodnota) => Object.defineProperty(Navigator.prototype, jmeno, { configurable: true, writable: true, value: hodnota });
      if (!sdilet) { nastav('share', undefined); nastav('canShare', undefined); return; }
      nastav('canShare', function (d) { return !!(d && d.files && d.files.length && Array.from(d.files).every((f) => f instanceof File)); });
      nastav('share', function (d) {
        const f = Array.from((d && d.files) || []);
        // window.event = klepnutí, ve kterém se sdílení zavolalo (po await by tu žádná událost nebyla – Safari by sdílení odmítl)
        window.__sdileni.push({ pocet: f.length, nazev: f[0] && f[0].name, typ: f[0] && f[0].type, velikost: f[0] && f[0].size, udalost: window.event ? window.event.type : '' });
        return window.__sdileniChyba ? Promise.reject(new DOMException('Sdílení odmítnuto (test)', window.__sdileniChyba)) : Promise.resolve();
      });
    }, !!sdileni);
    if (klavesnice) {
      await v.page.addInitScript(() => {
        const cil = new EventTarget();
        let vyska = 0;
        const vv = { get width() { return innerWidth; }, get height() { return vyska || innerHeight; }, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
          addEventListener: cil.addEventListener.bind(cil), removeEventListener: cil.removeEventListener.bind(cil), dispatchEvent: cil.dispatchEvent.bind(cil) };
        Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
        window.__klavesnice = (h) => { vyska = h; cil.dispatchEvent(new Event('resize')); };
      });
    }
    return v;
  }
  const naPlakatyTelefon = async (page) => {
    await page.goto(WEB);
    await page.click('.hlava-ja [data-menu]');
    await page.click('[data-panel="menu"] [data-menu-cil="plakaty"]');
    await page.waitForSelector('#p-plakaty .plakat-stage .poster .design');
  };
  const STAHNOUT = '#p-plakaty [data-pl-stahnout]', OBRAZEK = '[data-panel="plakat-obrazek"] ';

  await test('Plakáty na iPhonu (' + iphoneJadro + '): obrázek připravený dopředu, Stáhnout = sdílení hned v klepnutí, po úpravě nový; odmítnuté sdílení → obrázek přes celou obrazovku (podržet prst → Přidat do Fotek)', async () => {
    fotbalPlakat = true;
    delete plakatyData.kola['2026-10-17'];
    const { ctx, page, chybyStranky } = await iphoneStranka('light', true);
    try {
      await napodobHtml2canvas(page);
      await pevnyCasPlakatu(page);
      await naPlakatyTelefon(page);
      jistota(await page.inputValue('#p-plakaty [data-pl-vyber]') === '2026-10-17', 'víkend');
      // obrázek se nakreslí sám v klidu po otevření stránky
      await page.waitForSelector(STAHNOUT + '[data-pripraveno="1"]', { timeout: 20000 });
      jistota(await page.evaluate(() => (window.__h2c || []).length) === 1, 'nakreslený dopředu jednou');
      await page.tap(STAHNOUT);
      await page.waitForFunction(() => window.__sdileni.length === 1);
      const sd = await page.evaluate(() => window.__sdileni[0]);
      jistota(sd.pocet === 1 && sd.nazev === 'plakat_2026-10-17.jpg' && sd.typ === 'image/jpeg' && sd.velikost > 1000 && sd.udalost === 'click', 'sdílení: ' + JSON.stringify(sd));
      jistota(await page.evaluate(() => window.__h2c.length) === 1 && !(await page.locator('[data-panel="plakat-obrazek"]').count()), 'bez nového kreslení a bez okna');
      // úprava v editoru: připravený obrázek už neplatí – po chvíli klidu se nakreslí nový a sdílí se ten
      await page.fill('#p-plakaty [data-pl-cesta="nadpis"]', 'PROGRAM VÍKENDU!');
      await page.waitForFunction(() => window.__h2c.length === 2 && document.querySelector('#p-plakaty [data-pl-stahnout]').dataset.pripraveno === '1', null, { timeout: 20000 });
      jistota(/PROGRAM VÍKENDU!/.test(await page.evaluate(() => window.__h2c[1].text)), 'nový obrázek z upraveného plakátu');
      await page.tap(STAHNOUT);
      await page.waitForFunction(() => window.__sdileni.length === 2);
      jistota((await page.evaluate(() => window.__sdileni[1])).udalost === 'click', 'druhé sdílení v klepnutí');
      // Safari sdílení odmítne → obrázek přes celou obrazovku s návodem; podržení prstu = nabídka iPhonu (aplikace ji nepřebírá)
      await page.evaluate(() => { window.__sdileniChyba = 'NotAllowedError'; });
      await page.tap(STAHNOUT);
      await page.waitForSelector(OBRAZEK + 'img[data-pl-obrazek-img]');
      await page.waitForFunction((s) => document.querySelector(s).naturalWidth > 0, OBRAZEK + 'img');
      const okno = await page.evaluate((s) => {
        const i = document.querySelector(s + 'img');
        return { src: i.src.slice(0, 23), w: i.naturalWidth, h: i.naturalHeight, navod: document.querySelector(s + '.pl-obrazek__navod').textContent,
          sdilet: !!document.querySelector(s + '[data-pl-obrazek-sdilet]'), stahnout: !!document.querySelector(s + 'a[download]'),
          nabidka: i.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })), preteka: document.documentElement.scrollWidth - innerWidth };
      }, OBRAZEK);
      jistota(okno.src === 'data:image/jpeg;base64,' && okno.w === 2800 && okno.h === 1980 && /Podrž prst na obrázku → Přidat do Fotek/.test(okno.navod) &&
        okno.sdilet && !okno.stahnout && okno.nabidka && okno.preteka <= 0, 'okno s obrázkem: ' + JSON.stringify(okno));
      await page.waitForTimeout(350); // okno dojede zespodu
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_plakat_obrazek.png') });
      await page.tap(OBRAZEK + '[data-zavrit-panel]');
      await page.waitForSelector(OBRAZEK, { state: 'detached' });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      delete plakatyData.kola['2026-10-17'];
      await ctx.close();
    }
  });

  await test('Plakáty na iPhonu bez sdílení (' + iphoneJadro + ', tmavý režim): Stáhnout hned po otevření – obrázek přes celou obrazovku s návodem, nic se nestahuje', async () => {
    fotbalPlakat = true;
    const { ctx, page, chybyStranky } = await iphoneStranka('dark', false);
    let stazeno = 0;
    page.on('download', () => { stazeno++; });
    try {
      await napodobHtml2canvas(page);
      await pevnyCasPlakatu(page);
      await naPlakatyTelefon(page);
      await page.tap(STAHNOUT); // obrázek se možná ještě kreslí – okno na něj počká
      await page.waitForSelector(OBRAZEK + 'img[data-pl-obrazek-img]', { timeout: 20000 });
      const okno = await page.evaluate((s) => ({ navod: document.querySelector(s + '.pl-obrazek__navod').textContent,
        tlacitka: Array.from(document.querySelectorAll(s + '.panel-paticka .btn')).map((b) => b.textContent.trim()) }), OBRAZEK);
      jistota(/Podrž prst na obrázku → Přidat do Fotek\./.test(okno.navod) && JSON.stringify(okno.tlacitka) === '["Zavřít"]', 'okno: ' + JSON.stringify(okno));
      jistota(await page.evaluate(() => window.__h2c.length) === 1 && !stazeno, 'jeden obrázek, žádné stažení');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_plakat_obrazek.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      fotbalPlakat = false;
      await ctx.close();
    }
  });

  for (const motiv of ['light', 'dark']) {
    await test('Plakát na iPhonu (' + iphoneJadro + ', ' + (motiv === 'dark' ? 'tmavý' : 'světlý') + '): karta Instagram bez hledání (Stáhnout, Zveřejnit teď, Naplánovat, Kopírovat popisek), okno plánu se vejde, klávesnice nepřekryje Naplánovat' +
      (motiv === 'light' ? ', příběh přes celou obrazovku a sdílení, plán s popiskem a označeným účtem' : ''), async () => {
      fotbalPlakat = true;
      delete plakatyData.kola['2026-10-17'];
      delete plakatyData.plan['2026-10-17'];
      plakatyData.popisky['2026-10-17'] = { text: 'Áčko hostí Milotice! ⚽\n\nV sobotu ve 14:30 na Agro Aréně.\n\n#fkagrovnorovy', zdroj: 'claude', kdy: Date.now() };
      const { ctx, page, chybyStranky } = await iphoneStranka(motiv, true, true);
      const T = motiv === 'dark' ? 'telefon_tmavy_' : 'telefon_';
      try {
        await napodobHtml2canvas(page);
        await pevnyCasPlakatu(page);
        await naPlakatyTelefon(page);
        await page.waitForSelector('#p-plakaty .pl-ig [data-pl-ig-naplanovat]');
        // bez posouvání: tlačítka nad plovoucí spodní lištou
        const mimo = await page.evaluate(() => {
          const spodek = document.getElementById('lista').getBoundingClientRect().top;
          return ['[data-pl-stahnout]', '.pl-ig [data-pl-ig-hned]', '.pl-ig [data-pl-ig-naplanovat]', '.pl-ig [data-pl-kopirovat]'].filter((s) => {
            const r = document.querySelector('#p-plakaty ' + s).getBoundingClientRect();
            return !(r.top >= 0 && r.bottom <= spodek);
          });
        });
        jistota(!mimo.length, 'na první obrazovce chybí: ' + mimo.join(', '));
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(VYSTUP, T + 'plakat_karta_ig.png') });
        await page.tap('#p-plakaty .pl-ig [data-pl-ig-naplanovat]');
        const O = '[data-panel="plakat-ig"] ';
        await page.waitForSelector(O + '[data-pl-ig="popisek"]');
        jistota(/Áčko hostí Milotice/.test(await page.inputValue(O + '[data-pl-ig="popisek"]')) && await page.locator(O + '[data-pl-ig="oznacit"]').count() === 1, 'popisek od Clauda a označení v okně');
        await page.waitForSelector(O + '.pl-nahled-pribeh', { timeout: 20000 });
        const okno = await page.evaluate((s) => {
          const el = document.querySelector(s.trim()), telo = el.querySelector('.panel-telo');
          return { preteka: telo.scrollWidth - telo.clientWidth, sirka: Math.round(el.getBoundingClientRect().width), okno: innerWidth,
            siroke: Array.from(el.querySelectorAll('*')).filter((x) => x.getBoundingClientRect().right > innerWidth + 1).map((x) => x.tagName + '.' + x.className).slice(0, 5) };
        }, O);
        jistota(okno.preteka <= 0 && okno.sirka <= okno.okno && !okno.siroke.length, 'okno plánu přetéká: ' + JSON.stringify(okno));
        await page.screenshot({ path: path.join(VYSTUP, T + 'plakat_okno_planu.png') });
        // klávesnice při psaní popisku: panel jen nad ní, tlačítko Naplánovat zůstane vidět
        await page.focus(O + '[data-pl-ig="popisek"]');
        await page.evaluate(() => window.__klavesnice(470));
        await page.waitForFunction(() => document.documentElement.classList.contains('s-klavesnici'));
        const tl = await page.evaluate((s) => { const r = document.querySelector(s + '[data-pl-ig-ulozit]').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }, O);
        jistota(tl[0] >= 0 && tl[1] <= 470, 'Naplánovat pod klávesnicí: ' + JSON.stringify(tl));
        // pole, do kterého se píše, se posune do viditelné části (nad patičku)
        await cekejVeStrance(page, (s) => {
          const p = document.querySelector(s + '[data-pl-ig="popisek"]').getBoundingClientRect(), pat = document.querySelector(s + '.panel-paticka').getBoundingClientRect();
          return p.top >= 0 && p.top + 40 < pat.top;
        }, O);
        await page.screenshot({ path: path.join(VYSTUP, T + 'plakat_okno_klavesnice.png') });
        await page.evaluate(() => window.__klavesnice(0));
        await page.waitForFunction(() => !document.documentElement.classList.contains('s-klavesnici'));
        if (motiv === 'light') {
          // náhled příběhu přes celou obrazovku – Sdílet / uložit pošle obrázek příběhu (hned v klepnutí)
          await page.tap(O + '[data-pl-ig-ukaz="pribeh"]');
          await page.waitForSelector(OBRAZEK + 'img[data-pl-obrazek-img]');
          await page.waitForFunction((s) => document.querySelector(s).naturalWidth > 0, OBRAZEK + 'img');
          const rozmer = await page.$eval(OBRAZEK + 'img', (i) => [i.naturalWidth, i.naturalHeight]);
          jistota(/Obrázek příběhu/.test(await page.textContent(OBRAZEK + '.panel-titul')) && JSON.stringify(rozmer) === '[1080,1920]', 'příběh: ' + rozmer);
          await page.waitForTimeout(350); // okno dojede zespodu
          await page.screenshot({ path: path.join(VYSTUP, T + 'plakat_pribeh_obrazek.png') });
          await page.tap(OBRAZEK + '[data-pl-obrazek-sdilet]');
          await page.waitForFunction(() => window.__sdileni.length === 1);
          const sd = await page.evaluate(() => window.__sdileni[0]);
          jistota(sd.nazev === 'plakat_2026-10-17_pribeh.jpg' && sd.typ === 'image/jpeg' && sd.velikost > 1000 && sd.udalost === 'click', 'sdílení příběhu: ' + JSON.stringify(sd));
          await page.tap(OBRAZEK + '[data-zavrit-panel]');
          await page.waitForSelector(OBRAZEK, { state: 'detached' });
          // naplánovat s upraveným popiskem a označeným účtem
          await page.fill(O + '[data-pl-ig="oznacit"]', '@dorost_agro');
          await page.fill(O + '[data-pl-ig="popisek"]', 'Derby s Miloticemi! ⚽');
          await page.tap(O + '[data-pl-ig-ulozit]');
          await page.waitForSelector('#p-plakaty .pl-ig .tag--plan');
          const plan = volano.filter((d) => d.akce === 'plakatNaplanovat').pop();
          jistota(plan && plan.popisek === 'Derby s Miloticemi! ⚽' && plan.oznacit === '@dorost_agro' && plan.pribeh === true, 'plán: ' + JSON.stringify(plan));
          const karta = (await page.textContent('#p-plakaty .pl-ig')).replace(/\s+/g, ' ');
          jistota(/označí @dorost_agro/.test(karta) && /Zveřejnit teď/.test(karta) && /Změnit čas \/ popisek/.test(karta) && /Zrušit plán/.test(karta), 'karta: ' + karta.slice(0, 300));
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(VYSTUP, T + 'plakat_karta_naplanovano.png') });
        }
        jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      } finally {
        fotbalPlakat = false;
        delete plakatyData.plan['2026-10-17'];
        delete plakatyData.popisky['2026-10-17'];
        delete plakatyData.obrazky['2026-10-17'];
        await ctx.close();
      }
    });
  }
  if (webkitProhlizec) await webkitProhlizec.close();

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
    // účtenka (i z Fotek): fotka → motor ji přečte a rovnou zapíše → v kartičce Upravit → okno s fotkou → změna do tabulky
    jistota(await page.getAttribute('.auto-akce label.auto-foto', 'for') === 'auto-foto-vstup', 'tlačítko účtenek = popisek ke stálému poli');
    await page.setInputFiles('#auto-foto-vstup', { name: 'uctenka.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'ikona-192.png')) });
    await page.waitForSelector('#auto-uctenky.auto-uctenky--ok [data-au-upravit]');
    const oznameni = (await page.textContent('#auto-uctenky')).replace(/\s+/g, ' ');
    jistota(/Zapsáno z účtenky/.test(oznameni) && /tankování 1 860 Kč · Pumpa Test/.test(oznameni), 'oznámení: ' + oznameni);
    await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_uctenka_karticka.png') });
    const u = autoUctenky[autoUctenky.length - 1] || {};
    jistota(u.zapsat === true && /^[0-9a-f]{24}$/.test(u.otisk || ''), 'účtenka do motoru se zápisem a otiskem: ' + JSON.stringify(u));
    jistota(autoZapisy.length === 2, 'z účtenky se nezapisuje přes okno');
    await page.click('#auto-uctenky [data-au-upravit]');
    await page.waitForSelector('#auto-uctenky', { state: 'hidden' });
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
    // víc účtenek najednou (z Fotek): každá zvlášť do motoru, souhrn v kartičce
    const predUctenkami = autoUctenky.length;
    jistota(await page.getAttribute('#auto-foto-vstup', 'multiple') !== null, 'výběr víc fotek');
    await page.setInputFiles('#auto-foto-vstup', [
      { name: 'a.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'ikona-192.png')) },
      { name: 'b.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'apple-touch-icon.png')) }]);
    await page.waitForFunction(() => /Účtenky: zapsáno 2/.test(document.getElementById('auto-uctenky').textContent), null, { timeout: 15000 });
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
    jistota(await page.locator('[data-panel="rychle"] label.rychle__foto[for="auto-foto-vstup"]').count() === 1, 'účtenka v „+“');
    jistota(await page.getAttribute('#auto-foto-vstup', 'capture') === null && await page.getAttribute('#auto-foto-vstup', 'accept') === 'image/*',
      'účtenka i z Fotek (bez vynuceného fotoaparátu)');
    jistota(await page.locator('[data-panel="rychle"] [data-rychle-akce="myti"]').count() === 1, 'Mytí auta v „+“');
    await page.click('[data-panel="rychle"] [data-rychle-akce="tankovani"]');
    await page.waitForSelector('[data-panel="auto-zapis"] [data-az="castka"]');
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- účtenka z iPhonu (10. 10. se ztratila: pole pro fotku bylo ve stránce, kterou překreslení přepíše)
  const fotkaUctenky = () => ({ name: 'uctenka.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'ikona-192.png')) });
  const pocetVZarizeni = (page) => page.evaluate(() => new Promise((hotovo) => {
    const r = indexedDB.open('asistent-auto', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('uctenky', { keyPath: 'id' });
    r.onsuccess = () => { const q = r.result.transaction('uctenky').objectStore('uctenky').count(); q.onsuccess = () => { hotovo(q.result); r.result.close(); }; };
    r.onerror = () => hotovo(-1);
  }));
  const textKarty = (page) => page.evaluate(() => { const k = document.getElementById('auto-uctenky'); return k && !k.hidden ? k.textContent.replace(/\s+/g, ' ').trim() : ''; });

  await test('Auto: účtenka z iPhonu přežije překreslení i návrat z fotoaparátu („+“ i stránka Auto), průběh a výsledek v kartičce', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('.lista__plus');
      // „+“ → Účtenky: během výběru (iPhone otevře Fotky / fotoaparát na desítky vteřin) přijdou data a stránka se překreslí,
      // po návratu z fotoaparátu aplikace obnoví data (visibilitychange) – teprve potom iPhone doručí vybranou fotku
      await page.click('.lista__plus');
      await page.waitForSelector('[data-panel="rychle"] label.rychle__foto');
      const [vyber] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-panel="rychle"] label.rychle__foto')]);
      jistota(await page.evaluate(() => (window.asistentPrace || []).some((f) => f())), 'otevřený výběr fotky = rozdělaná práce (nová verze nepřenačte)');
      jistota(await page.evaluate(() => !!localStorage.getItem('asistent.auto.vyber')), 'značka rozdělaného výběru');
      await page.evaluate(async () => {
        const s = await import('/js/stav.js');
        s.zmeneno();
        await new Promise((r) => setTimeout(r, 50));
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        s.stav.naposledy = Date.now() - 120000; // aplikace byla dlouho v pozadí → obnovVse
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise((r) => setTimeout(r, 100));
      });
      jistota(await vyber.element().evaluate((el) => el.isConnected && el.id === 'auto-foto-vstup'), 'pole pro fotku po překreslení pořád v dokumentu');
      const pred = autoUctenky.length;
      zpozdeniMotoru.autoUctenka = 1500; // motor čte účtenku (OCR) – průběh musí být vidět hned
      await vyber.setFiles(fotkaUctenky());
      await page.waitForSelector('[data-panel="rychle"]', { state: 'detached' });
      await page.waitForFunction(() => /Nahrávám účtenku/.test(document.getElementById('auto-uctenky').textContent));
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_uctenka_nahravam.png') });
      jistota(await page.evaluate(() => (window.asistentPrace || []).some((f) => f())), 'nahrávání = rozdělaná práce');
      await page.waitForSelector('#auto-uctenky.auto-uctenky--ok [data-au-upravit]', { timeout: 10000 });
      jistota(autoUctenky.length === pred + 1, 'účtenka došla do motoru: ' + (autoUctenky.length - pred));
      const karta = await textKarty(page);
      jistota(/Zapsáno z účtenky/.test(karta) && /tankování 1 860 Kč · Pumpa Test/.test(karta), 'výsledek s částkou a stanicí: ' + karta);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_uctenka_zapsano.png') });
      jistota(await pocetVZarizeni(page) === 0, 'zapsaná účtenka už není ve frontě v zařízení');
      jistota(!(await page.evaluate(() => (window.asistentPrace || []).some((f) => f()))) && !(await page.evaluate(() => localStorage.getItem('asistent.auto.vyber'))),
        'po zápisu nic rozdělaného');
      // Upravit = odkaz na zápis (okno s fotkou)
      await page.click('#auto-uctenky [data-au-upravit]');
      await page.waitForSelector('[data-panel="auto-zapis"] [data-az="castka"]');
      jistota(/Upravit tankování/.test(await page.textContent('[data-panel="auto-zapis"] .panel-titul')), 'Upravit otevře zápis');
      await page.click('[data-panel="auto-zapis"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
      // stránka Auto: totéž přes tlačítko Účtenky z fotek, překreslení stránky během výběru
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="auto"]');
      await page.waitForSelector('.auto-akce label.auto-foto');
      const [vyber2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.auto-akce label.auto-foto')]);
      await page.evaluate(() => import('/js/stav.js').then((s) => { s.zmeneno(); return new Promise((r) => setTimeout(r, 50)); }));
      await vyber2.setFiles({ name: 'jina.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(KOREN, 'ikony', 'apple-touch-icon.png')) });
      await cekej(() => autoUctenky.length === pred + 2, 10000, 'druhá účtenka ze stránky Auto do motoru');
      await page.waitForSelector('#auto-uctenky.auto-uctenky--ok');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      delete zpozdeniMotoru.autoUctenka;
      await ctx.close();
    }
  });

  await test('Auto: účtenka bez sítě počká v telefonu a pošle se sama, chyba motoru → Zkusit znovu (i po zavření aplikace) / Zahodit', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('.lista__plus');
      const pred = autoUctenky.length;
      // bez sítě: fotka zůstane v zařízení, kartička to řekne a po návratu sítě se pošle sama
      motorBezSite = true;
      await ctx.setOffline(true);
      await page.setInputFiles('#auto-foto-vstup', fotkaUctenky());
      await page.waitForSelector('#auto-uctenky.auto-uctenky--ceka');
      const bezSite = await textKarty(page);
      jistota(/čeká v telefonu/.test(bezSite) && /bez sítě – pošlu ji sama, až bude síť/.test(bezSite), 'bez sítě: ' + bezSite);
      jistota(await pocetVZarizeni(page) === 1, 'účtenka uložená v zařízení');
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_uctenka_bez_site.png') });
      motorBezSite = false;
      await ctx.setOffline(false);
      await page.waitForSelector('#auto-uctenky.auto-uctenky--ok', { timeout: 10000 });
      jistota(autoUctenky.length === pred + 1 && await pocetVZarizeni(page) === 0, 'po návratu sítě odeslaná');
      await page.click('#auto-uctenky [data-au-zavrit]');
      await page.waitForSelector('#auto-uctenky', { state: 'hidden' });
      // chyba motoru: Zkusit znovu / Zahodit; účtenka přežije i zavření aplikace a pošle se při dalším otevření
      autoUctenkaChyba = 'Tabulka auta není propojená.';
      await page.setInputFiles('#auto-foto-vstup', fotkaUctenky());
      await page.waitForSelector('#auto-uctenky.auto-uctenky--chyba [data-au-znovu]');
      jistota(/Účtenka se nenahrála/.test(await textKarty(page)) && /není propojená/.test(await textKarty(page)), 'chyba motoru: ' + await textKarty(page));
      const predStartem = autoUctenky.length;
      await page.evaluate(() => localStorage.removeItem('asistent.videno')); // bez okna „Co je nového“ po přenačtení
      await page.reload();
      await cekej(() => autoUctenky.length === predStartem + 1, 10000, 'po otevření aplikace se účtenka z minula poslala sama');
      await page.waitForSelector('#auto-uctenky.auto-uctenky--chyba [data-au-znovu]', { timeout: 10000 });
      autoUctenkaChyba = '';
      const predZnovu = autoUctenky.length;
      await page.click('#auto-uctenky [data-au-znovu]');
      await page.waitForSelector('#auto-uctenky.auto-uctenky--ok', { timeout: 10000 });
      jistota(autoUctenky.length === predZnovu + 1 && await pocetVZarizeni(page) === 0, 'Zkusit znovu po otevření aplikace');
      // Zahodit (s potvrzením) – fotka z fronty v zařízení pryč
      autoUctenkaChyba = 'Fotka účtenky je moc velká.';
      await page.setInputFiles('#auto-foto-vstup', fotkaUctenky());
      await page.waitForSelector('#auto-uctenky.auto-uctenky--chyba [data-au-zahodit]');
      await page.click('#auto-uctenky [data-au-zahodit]');
      await page.click('.okno-pozadi [data-okno="ano"]');
      await page.waitForSelector('#auto-uctenky', { state: 'hidden' });
      jistota(await pocetVZarizeni(page) === 0, 'zahozená účtenka pryč ze zařízení');
      autoUctenkaChyba = '';
      // aplikace se zavřela během výběru fotky (iPhone ji při focení občas ukončí) → při dalším otevření to řekne
      await Promise.all([page.waitForEvent('filechooser'), page.click('.lista__plus').then(() => page.click('[data-panel="rychle"] label.rychle__foto'))]);
      await page.evaluate(() => localStorage.removeItem('asistent.videno'));
      await page.reload();
      await page.waitForSelector('#auto-uctenky.auto-uctenky--chyba label[for="auto-foto-vstup"]');
      jistota(/nenahrála/.test(await textKarty(page)) && /vyber ji znovu/.test(await textKarty(page)), 'přerušený výběr: ' + await textKarty(page));
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_uctenka_preruseno.png') });
      jistota(!chybyStranky.filter((c) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/.test(c)).length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      autoUctenkaChyba = '';
      motorBezSite = false;
      await ctx.close();
    }
  });

  await test('Auto: rychlý výdaj Mytí – v okně Výdaj (částka jako minule) i z „+“ dvěma klepnutími', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    try {
      await page.goto(WEB);
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="auto"]');
      await page.waitForSelector('.auto-akce [data-auto-zapis="naklad"]');
      await page.click('.auto-akce [data-auto-zapis="naklad"]');
      await page.waitForSelector('[data-panel="auto-zapis"] [data-az-rychle="0"]');
      const volba = (await page.textContent('[data-panel="auto-zapis"] [data-az-rychle="0"]')).replace(/\s+/g, ' ').trim();
      jistota(/Mytí/.test(volba) && /150 Kč/.test(volba), 'rychlá volba Mytí s částkou jako minule: ' + volba);
      await page.click('[data-panel="auto-zapis"] [data-az-rychle="0"]');
      jistota(await page.inputValue('[data-panel="auto-zapis"] [data-az="kategorie"]') === 'Myčka' &&
        await page.inputValue('[data-panel="auto-zapis"] [data-az="castka"]') === '150', 'Mytí: kategorie Myčka a částka');
      jistota(await page.getAttribute('[data-panel="auto-zapis"] [data-az-rychle="0"]', 'aria-pressed') === 'true', 'zvolená rychlá volba');
      await page.fill('[data-panel="auto-zapis"] [data-az="castka"]', '100');
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_auto_myti.png') });
      const predZapisy = autoZapisy.length;
      await page.click('[data-panel="auto-zapis"] [data-auto-ulozit]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
      const z = autoZapisy[predZapisy] || {};
      jistota(z.druh === 'naklad' && z.kategorie === 'Myčka' && z.castka === 100 && z.datum === iso(Date.now()), 'mytí do tabulky: ' + JSON.stringify(z));
      // „+“ → Mytí auta → okno už s kategorií a částkou z posledního mytí (100 Kč) → Zapsat
      await page.click('.lista__plus');
      await page.click('[data-panel="rychle"] [data-rychle-akce="myti"]');
      await page.waitForSelector('[data-panel="auto-zapis"] [data-az="castka"]');
      jistota(await page.inputValue('[data-panel="auto-zapis"] [data-az="castka"]') === '100' &&
        await page.inputValue('[data-panel="auto-zapis"] [data-az="kategorie"]') === 'Myčka', '„+“ Mytí auta předvyplní kategorii a částku');
      jistota(await page.evaluate(() => !document.activeElement.matches('input')), 'bez klávesnice – stačí Zapsat');
      await page.click('[data-panel="auto-zapis"] [data-auto-ulozit]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
      const z2 = autoZapisy[predZapisy + 1] || {};
      jistota(z2.kategorie === 'Myčka' && z2.castka === 100, 'druhé mytí: ' + JSON.stringify(z2));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  // ---------- telefon: menu zleva (klepnutí na jméno) vede i na Fotbal a Reely; klepnutí vedle menu zavře
  // ---------- Knihovna (Michal 11. 10.: „přehled informací k filmu či knize … rešerše k různým věcem – mít svoji knihovnu“;
  // 12. 10.: karta a rešerše jako celá stránka #knihovna/<id>; večer: „přes celou stránku … ne jedno dlouhé rolování … když kliknu
  // na té liště, ať se zobrazí jen k té dané věci“ → záložky #knihovna/<id>/<záložka>, plná šířka)
  const STRANKA = '#kn-stranka:not([hidden])';
  // podstránka id (na jakékoli záložce)
  const podstranka = (page, id) => cekejVeStrance(page, (i) => (location.hash === '#knihovna/' + i || location.hash.indexOf('#knihovna/' + i + '/') === 0) &&
    !!document.querySelector('#kn-stranka:not([hidden]) .kn-hero__nazev') && document.getElementById('kn-seznam').hidden, id);
  const seznamKnihovny = (page) => cekejVeStrance(page, () => location.hash === '' && !!document.querySelector('#kn-seznam:not([hidden]) .kn-lista') && document.getElementById('kn-stranka').hidden);
  // vybraná záložka: adresa (výchozí bez záložky), jen její panel vidět, aria-selected
  const naZalozce = (page, id, klic, vychozi) => cekejVeStrance(page, (a) => {
    const videt = Array.from(document.querySelectorAll('#kn-stranka [data-kn-panel]')).filter((p) => !p.hidden).map((p) => p.dataset.knPanel);
    const tab = document.querySelector('#kn-stranka [data-kn-tab="' + a[1] + '"]');
    return location.hash === '#knihovna/' + a[0] + (a[1] === a[2] ? '' : '/' + a[1]) && videt.length === 1 && videt[0] === a[1] && !!tab && tab.getAttribute('aria-selected') === 'true' &&
      document.querySelectorAll('#kn-stranka [data-kn-tab][aria-selected="true"]').length === 1;
  }, [id, klic, vychozi || 'prehled']);
  const PC1500 = { nazev: 'pc1500', sirka: 1500, vyska: 850, dotyk: false };

  await test('Knihovna na PC: modul při startu ne (start na něj nečeká), přednačte se po startu i s daty; záložky, karty s plakátem (líně, zástupná plocha) přes celou šířku, filtr stavu, hledání i v Hledat', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC1500);
    try {
      await knihovnaSit(page);
      const pred = volano.length;
      await page.goto(WEB);
      await page.waitForSelector('#p-dnes .card');
      // první vykreslení bez knihovny (modul ani čtení) – přednačte se až po startu v klidu (js/pripravenost.js)
      const pri = await page.evaluate(() => { const v = (performance.getEntriesByName('asistent-vykresleno')[0] || {}).startTime || 0;
        return performance.getEntriesByType('resource').filter((e) => /\/js\/knihovna(_stranka)?\.js/.test(e.name)).map((e) => Math.round(e.startTime - v)); });
      jistota(pri.every((t) => t > 0), 'knihovna.js se má načíst až po prvním vykreslení: ' + pri.join());
      await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!(m.stav.pripravenost && m.stav.knihovna)), null, 8000);
      jistota(volano.slice(pred).filter((d) => d.akce === 'knihovna').length === 1, 'knihovna se po startu přednačte jednou: ' + volano.slice(pred).map((d) => d.akce).join());
      const poPrednacteni = volano.length;
      await page.click('#rail [data-cil="knihovna"]');
      await page.waitForSelector('#p-knihovna .kn-karta', { timeout: 300 });
      jistota(!volano.slice(poPrednacteni).some((d) => d.akce === 'knihovna'), 'po otevření stránky se knihovna už znovu nečte (přednačtená)');
      jistota(/Knihovna/.test(await page.textContent('#hlava h1')) && /filmy a seriály 2 · knihy 1 · rešerše 1/i.test(await page.textContent('#hlava p')), 'nadpis: ' + await page.textContent('#hlava'));
      const zalozky = (await page.locator('#kn-zalozky .chip').allTextContents()).map((t) => t.replace(/\s+/g, ''));
      jistota(zalozky.join('|') === 'Filmy2|Knihy1|Rešerše1', 'záložky: ' + zalozky.join('|'));
      jistota(await page.locator('#p-knihovna .kn-karta').count() === 2, 'filmy i seriály');
      // přes celou šířku okna (Michal 12. 10.: „je to zase jen přes kousek“): seznam ≥ 85 % okna, mřížka aspoň 6 sloupců
      const sirka = await page.evaluate(() => ({ stranka: document.getElementById('p-knihovna').getBoundingClientRect().width, okno: window.innerWidth,
        sloupcu: getComputedStyle(document.querySelector('#p-knihovna .kn-mrizka')).gridTemplateColumns.split(' ').length }));
      jistota(sirka.stranka >= 0.85 * sirka.okno && sirka.sloupcu >= 6, 'seznam přes celou šířku: ' + JSON.stringify(sirka));
      // plakát: líně, poměr 2 : 3; obrázek, který nejde načíst, zmizí a zůstane iniciála
      const img = '#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-obr img';
      jistota(await page.getAttribute(img, 'loading') === 'lazy', 'obrázek líně');
      await page.waitForFunction((s) => { const i = document.querySelector(s); return i && i.complete && i.naturalWidth > 0; }, img);
      const obr = await page.evaluate(() => { const b = document.querySelector('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-obr').getBoundingClientRect(); return b.height / b.width; });
      jistota(Math.abs(obr - 1.5) < 0.02, 'plakát 2 : 3: ' + obr);
      await page.waitForFunction(() => !document.querySelector('#p-knihovna [data-kn-karta="serial-majak"] .kn-obr img'));
      jistota(await page.textContent('#p-knihovna [data-kn-karta="serial-majak"] .kn-obr b') === 'M', 'zástupná plocha s iniciálou');
      jistota(/ČSFD\s*80 %/.test(await page.textContent('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-hodn')), 'hodnocení na dlaždici');
      jistota(/nové/.test(await page.textContent('#p-knihovna [data-kn-karta="film-zkusebni-let"]')), 'čerstvá karta je „nové“');
      // filtr stavu (nic viděno) → prázdné s „Zrušit filtr“
      await page.click('#kn-filtry [data-kn-filtr="hotovo"]');
      await page.waitForSelector('#p-knihovna [data-kn-filtr-vse]');
      await page.click('#p-knihovna [data-kn-filtr-vse]');
      await page.waitForFunction(() => document.querySelectorAll('#p-knihovna .kn-karta').length === 2);
      // knihy: můj stav „Chci číst“
      await page.click('#kn-zalozky [data-kn-zalozka="knihy"]');
      await page.waitForFunction(() => document.querySelectorAll('#p-knihovna .kn-karta').length === 1);
      jistota(/Malý princ/.test(await page.textContent('#p-knihovna .kn-karta')) && /Chci číst/.test(await page.textContent('#p-knihovna .kn-karta')), 'kniha se stavem');
      // hledání v knihovně (bez diakritiky, i herci); nic → nabídne přidat
      await page.click('#kn-zalozky [data-kn-zalozka="filmy"]');
      await page.fill('#kn-hledat', 'majak');
      await page.waitForFunction(() => document.querySelectorAll('#p-knihovna .kn-karta').length === 1 && /Maják/.test(document.querySelector('#p-knihovna .kn-karta').textContent));
      await page.fill('#kn-hledat', 'pokusna');
      await page.waitForFunction(() => document.querySelectorAll('#p-knihovna .kn-karta').length === 1 && /Zkušební let/.test(document.querySelector('#p-knihovna .kn-karta').textContent));
      await page.fill('#kn-hledat', 'Interstellar');
      await page.waitForSelector('#p-knihovna .prazdne [data-kn-pridat][data-kn-text="Interstellar"]');
      await page.fill('#kn-hledat', '');
      await page.waitForFunction(() => document.querySelectorAll('#p-knihovna .kn-karta').length === 2);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_knihovna.png') });
      // Hledat (Ctrl K) najde kartu a otevře její stránku
      await page.keyboard.press('Control+k');
      await page.fill('[data-hledat-pole]', 'zkusebni');
      await page.waitForSelector('#hledat-vysledky [data-h-knihovna="film-zkusebni-let"]');
      await page.click('#hledat-vysledky [data-h-knihovna="film-zkusebni-let"]');
      await podstranka(page, 'film-zkusebni-let');
      await naZalozce(page, 'film-zkusebni-let', 'prehled');
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | '));
    } finally { await ctx.close(); }
  });

  await test('Knihovna: stránka karty se záložkami – přes celou šířku, klik na záložku ukáže jen její panel (adresa, bez posunu dolů, zúžená hlavička), šipky, Home/End, ' +
    'herci s fotkou a iniciálami, Zákulisí po sekcích (seznam vlevo), fakta, podobné → požadavek, můj stav do motoru, pravé tlačítko', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    knihovnaVolani.length = 0;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC1500, 'light', PRAHA);
    try {
      await knihovnaSit(page);
      await page.goto(WEB);
      await page.click('#rail [data-cil="knihovna"]');
      await page.waitForSelector('#p-knihovna [data-kn-karta="film-zkusebni-let"]');
      await page.click('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-karta__otevri');
      await podstranka(page, 'film-zkusebni-let');
      await naZalozce(page, 'film-zkusebni-let', 'prehled');
      jistota(/^Zkušební let · Knihovna · Asistent$/.test(await page.title()), 'titulek okna: ' + await page.title());
      jistota(await page.isHidden('#hlava .hlava-radek'), 'nadpis „Knihovna“ nad podstránkou schovaný');
      jistota(await page.evaluate(() => document.activeElement && document.activeElement.matches('.kn-hero__nazev')), 'fokus na nadpisu stránky');
      // celý obsah karty je na stránce (v panelech záložek)
      const t = (await page.textContent(STRANKA)).replace(/\s+/g, ' ');
      ['Test Flight', 'ČSFD 80 %', 'IMDb 7,5/10', 'Pilotka testuje nové letadlo.', 'Režie Jana Testová', 'Druhý odstavec bez spoilerů.',
        'Krásné záběry z kokpitu.', 'Doporučené pořadí: Podle roku vydání.', 'Second Flight', '115 min', 'prodloužená verze 140 min', '2 díly · celkem 3 h 55 min',
        'Herečka sama pilotuje.', 'Skutečnost vs. film', 'Cena za kameru (test)', 'Kde sledovat', 'ověřeno 11. 10. 2026', 'Jak létá letadlo', 'Druhy let', 'v knihovně zatím není',
        'Připravil Claude', 'jako kapitán Novák', 'Lidé za kamerou', 'Jak film vznikal: hangár a letiště', 'Natáčelo se v hangáru u letiště.', 'léto 2019', 'Letíme výš!', 'pilotka Jana',
        '10 mil. Kč', 'Nebeští jezdci', 'Hudba z kokpitu.'].forEach((x) => jistota(t.indexOf(x) >= 0, 'na stránce chybí „' + x + '“: ' + t.slice(0, 300)));
      jistota(await page.getAttribute(STRANKA + ' .kn-hodnoceni a', 'href') === 'https://www.csfd.cz/film/1-zkusebni-let/' &&
        await page.getAttribute(STRANKA + ' .kn-hodnoceni a', 'target') === '_blank', 'hodnocení je odkaz ven');
      // pás záložek: role tablist, jen to, co karta má (rozumně málo), výchozí Přehled
      jistota(await page.locator(STRANKA + ' .kn-oddily__pas[role="tablist"]').count() === 1 && await page.locator(STRANKA + ' .kn-cteni__nav[role="tablist"][aria-orientation="vertical"]').count() === 1, 'pás je tablist, sekce Zákulisí také');
      const pas = (await page.locator(STRANKA + ' [role="tab"][data-kn-tab]').allTextContents()).map((x) => x.trim()).join('|');
      jistota(pas === 'Přehled|Herci a tvůrci|Zákulisí|Fakta a zajímavosti|Série|Kde sledovat|Podobné', 'záložky: ' + pas);
      jistota(await page.getAttribute(STRANKA + ' [data-kn-tab="herci"]', 'aria-controls') === 'kn-panel-herci' &&
        await page.getAttribute(STRANKA + ' #kn-panel-herci', 'role') === 'tabpanel', 'záložka a panel propojené');
      // přes celou šířku: obsah stránky ≥ 85 % okna, hlavička (plakát | text | Moje) i panel přes celou šířku stránky
      const s = await page.evaluate(() => {
        const r = (q) => document.querySelector(q).getBoundingClientRect();
        return { okno: window.innerWidth, stranka: r('#kn-stranka').width, vrch: r('#kn-stranka .kn-st__vrch').width, panel: r('#kn-panel-prehled').width,
          moje: r('#kn-stranka .kn-moje').left > r('#kn-stranka .kn-hero__nazev').right, pozadi: !!document.querySelector('#kn-stranka .kn-hero__pozadi i') };
      });
      jistota(s.stranka >= 0.85 * s.okno && s.vrch >= s.stranka - 2 && s.panel >= s.stranka - 2 && s.moje && s.pozadi, 'plná šířka: ' + JSON.stringify(s));
      // můj stav, hvězdy, poznámka (Moje je v hlavičce Přehledu; poznámka se uloží sama po psaní)
      await page.click(STRANKA + ' [data-kn-stav="hotovo"]');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaMoje' && v.stav === 'hotovo'), 5000, 'stav do motoru');
      await page.waitForSelector(STRANKA + ' [data-kn-stav="hotovo"][aria-pressed="true"]');
      await page.click(STRANKA + ' [data-kn-hvezdy="4"]');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaMoje' && v.hodnoceni === 4), 5000, 'hvězdy do motoru');
      await page.waitForFunction((p) => document.querySelectorAll(p + ' .kn-hvezda.plna').length === 4, STRANKA);
      await page.fill(STRANKA + ' [data-kn-poznamka]', 'Skvělé – znovu s dětmi.');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaMoje' && v.poznamka === 'Skvělé – znovu s dětmi.'), 5000, 'poznámka do motoru');
      jistota(await page.inputValue(STRANKA + ' [data-kn-poznamka]') === 'Skvělé – znovu s dětmi.', 'rozepsaná poznámka se při uložení nepřepsala');
      jistota(knihovnaTest.moje['film-zkusebni-let'].stav === 'hotovo' && knihovnaTest.moje['film-zkusebni-let'].hodnoceni === 4, 'motor má stav i hvězdy');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_knihovna_detail.png') });
      // klik na záložku: jen její panel, adresa /herci, stránka se neposune dolů, hlavička zúžená (Moje jen stav a hvězdy)
      const y0 = await page.evaluate(() => window.scrollY);
      await page.click(STRANKA + ' [data-kn-tab="herci"]');
      await naZalozce(page, 'film-zkusebni-let', 'herci');
      const h = await page.evaluate(() => ({ y: window.scrollY, kompakt: document.getElementById('kn-stranka').classList.contains('kn-st--kompakt'),
        vrch: document.querySelector('#kn-stranka .kn-st__vrch').getBoundingClientRect().height, poznamka: !!document.querySelector('#kn-stranka [data-kn-poznamka]').offsetParent,
        hvezdy: !!document.querySelector('#kn-stranka .kn-hvezdy').offsetParent }));
      jistota(h.y <= y0 + 1 && h.kompakt && h.vrch < 120 && !h.poznamka && h.hvezdy, 'po kliku na záložku: ' + JSON.stringify(h));
      // herci: kulatá fotka z Commons (líně, rozměr předem) s odkazem na zdroj; bez fotky iniciály; mřížka vedle sebe
      const f = STRANKA + ' #kn-panel-herci .kn-lp-herci .kn-osoba:nth-child(1)';
      jistota(await page.getAttribute(f + ' img', 'loading') === 'lazy' && await page.getAttribute(f + ' img', 'width') === '96', 'fotka herce líně a s rozměrem');
      jistota(await page.getAttribute(f + ' a.kn-foto__zdroj', 'href') === 'https://commons.wikimedia.org/wiki/File:Herec.png' &&
        /Foto: Wikimedia Commons/.test(await page.textContent(f + ' .kn-foto__zdroj')), 'zdroj fotky');
      const f2 = STRANKA + ' #kn-panel-herci .kn-lp-herci .kn-osoba:nth-child(2)';
      jistota(await page.textContent(f2 + ' .kn-foto b') === 'EP' && await page.locator(f2 + ' img, ' + f2 + ' .kn-foto__zdroj').count() === 0, 'bez fotky iniciály');
      const vedle = await page.evaluate(() => { const o = Array.from(document.querySelectorAll('#kn-panel-herci .kn-lp-herci .kn-osoba')).map((x) => x.getBoundingClientRect());
        return o.length === 2 && Math.abs(o[0].top - o[1].top) < 2 && o[1].left > o[0].right && o[0].width >= 280 && o[0].width < 520; });
      jistota(vedle, 'herci v mřížce vedle sebe');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_knihovna_herci.png') });
      // šipky na záložce: → další (fokus se přesune s ní), adresa /zakulisi
      jistota(await page.evaluate(() => document.activeElement && document.activeElement.dataset.knTab === 'herci'), 'fokus na kliknuté záložce');
      await page.keyboard.press('ArrowRight');
      await naZalozce(page, 'film-zkusebni-let', 'zakulisi');
      jistota(await page.evaluate(() => document.activeElement && document.activeElement.dataset.knTab === 'zakulisi' && document.activeElement.tabIndex === 0), 'fokus na nové záložce');
      // Zákulisí: na PC svislý seznam sekcí vlevo, vybraná sekce vpravo; ostatní skryté
      const z = await page.evaluate(() => {
        const nav = document.querySelector('#kn-panel-zakulisi .kn-cteni__nav');
        const vid = Array.from(document.querySelectorAll('#kn-panel-zakulisi [data-kn-podpanel]')).filter((c) => !c.hidden);
        return { smer: getComputedStyle(nav).flexDirection, vlevo: nav.getBoundingClientRect().right <= vid[0].getBoundingClientRect().left + 1, vidim: vid.map((c) => c.dataset.knPodpanel) };
      });
      jistota(z.smer === 'column' && z.vlevo && z.vidim.join() === 'kn-s-vznik', 'Zákulisí: ' + JSON.stringify(z));
      await page.click(STRANKA + ' #kn-panel-zakulisi [role="tab"][data-kn-pod="kn-s-hudba"]');
      await cekejVeStrance(page, () => !document.querySelector('#kn-pp-kn-s-hudba').hidden && document.querySelector('#kn-pp-kn-s-vznik').hidden &&
        document.querySelector('#kn-ptab-kn-s-hudba').getAttribute('aria-selected') === 'true');
      await page.keyboard.press('ArrowUp'); // šipky v seznamu sekcí přepínají sekce
      await cekejVeStrance(page, () => !document.querySelector('#kn-pp-kn-s-vznik').hidden && document.activeElement.id === 'kn-ptab-kn-s-vznik');
      jistota(await page.evaluate(() => location.hash) === '#knihovna/film-zkusebni-let/zakulisi', 'šipky v sekcích nemění záložku');
      await page.click(STRANKA + ' #kn-pp-kn-s-vznik .kn-cteni__dalsi [data-kn-pod="kn-s-hudba"]'); // „Další: Hudba a zvuk“ pod textem
      await cekejVeStrance(page, () => !document.querySelector('#kn-pp-kn-s-hudba').hidden && document.activeElement.id === 'kn-ptab-kn-s-hudba');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_knihovna_zakulisi.png') });
      // End / Home na záložce; Přehled = adresa bez záložky a celá hlavička
      await page.focus(STRANKA + ' [data-kn-tab="zakulisi"]');
      await page.keyboard.press('End');
      await naZalozce(page, 'film-zkusebni-let', 'podobne');
      await page.keyboard.press('Home');
      await naZalozce(page, 'film-zkusebni-let', 'prehled');
      jistota(!(await page.evaluate(() => document.getElementById('kn-stranka').classList.contains('kn-st--kompakt'))), 'na Přehledu celá hlavička');
      // ←/→ i mimo pás (fokus na stránce, ne v poli): ← z Přehledu dokola na Podobné, → zpět
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('ArrowLeft');
      await naZalozce(page, 'film-zkusebni-let', 'podobne');
      await page.keyboard.press('ArrowRight');
      await naZalozce(page, 'film-zkusebni-let', 'prehled');
      // šipky v poli poznámky záložku nemění
      await page.focus(STRANKA + ' [data-kn-poznamka]');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(150);
      jistota(await page.evaluate(() => location.hash) === '#knihovna/film-zkusebni-let', 'šipka v poli nechala záložku');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      // Přehled → „Všechna fakta a zajímavosti“ = záložka Fakta (dlaždice čísel, delší hodnota menším písmem)
      jistota(await page.locator(STRANKA + ' #kn-panel-prehled .kn-fakt').count() === 3, 'nejdůležitější fakta na Přehledu');
      await page.click(STRANKA + ' #kn-panel-prehled [data-kn-tab-prejdi="fakta"]');
      await naZalozce(page, 'film-zkusebni-let', 'fakta');
      jistota(await page.locator(STRANKA + ' #kn-panel-fakta .kn-fakt').count() === 3 && await page.locator(STRANKA + ' #kn-panel-fakta .kn-fakt--dlouhy').count() === 1 &&
        await page.isVisible(STRANKA + ' #kn-panel-fakta .kn-zajimavosti'), 'fakta a zajímavosti');
      // série jako tabulka
      await page.click(STRANKA + ' [data-kn-tab="serie"]');
      await naZalozce(page, 'film-zkusebni-let', 'serie');
      jistota(await page.locator(STRANKA + ' #kn-panel-serie .kn-tabulka tbody tr').count() === 2, 'série jako tabulka');
      // podobné, které v knihovně není: Přidat jedním klepnutím = požadavek pro Clauda, na stránce (a záložce) zůstanu
      await page.click(STRANKA + ' [data-kn-tab="podobne"]');
      await naZalozce(page, 'film-zkusebni-let', 'podobne');
      await page.click(STRANKA + ' [data-kn-podobne-pridat][data-kn-text="Nebeští jezdci"]');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaPridat' && v.druh === 'film' && v.text === 'Nebeští jezdci'), 5000, 'podobné → požadavek');
      await page.waitForFunction(() => /Přidáno – Claude připraví kartu filmu/.test(document.getElementById('toast').textContent));
      await page.waitForFunction(() => /Claude připravuje/.test(document.querySelector('#kn-stranka .kn-podobne__polozka--neni').textContent));
      await naZalozce(page, 'film-zkusebni-let', 'podobne');
      // pravé tlačítko na podobném, které v knihovně je: stejná nabídka jako na dlaždici
      await page.click(STRANKA + ' .kn-podobne__polozka[data-kn-karta="serial-majak"] b', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      jistota((await page.locator('.nabidka [data-nabidka-i]').allTextContents()).join('|') === 'Chci vidět|Rozkoukané|Viděno|Kopírovat název|Otevřít ČSFD', 'nabídka na podobném');
      // šipky při otevřené nabídce záložku nemění; Esc nejdřív zavře jen nabídku, druhý Esc (mimo pole) vrátí seznam
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.nabidka.videt'));
      await page.waitForTimeout(150);
      jistota(await page.evaluate(() => location.hash) === '#knihovna/film-zkusebni-let/podobne', 'nabídka nechala stránku i záložku: ' + await page.evaluate(() => location.hash));
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('Escape');
      await seznamKnihovny(page);
      // dlaždice: Viděno a moje hvězdy
      const dl = await page.textContent('#p-knihovna [data-kn-karta="film-zkusebni-let"]');
      jistota(/Viděno/.test(dl) && /4\s*ČSFD/.test(dl), 'dlaždice po změně: ' + dl);
      // vyjetá karta u hodnocení: všechna hodnocení s odkazy a moje poznámka
      await page.hover('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-hodn');
      await page.waitForFunction(() => { const k = document.getElementById('bublina-karta'); return k && !k.hidden && k.classList.contains('videt') && k.dataset.druh === 'kn-hodnoceni'; });
      const bk = await page.textContent('#bublina-karta');
      jistota(/IMDb/.test(bk) && /7,5\/10/.test(bk) && /Skvělé – znovu s dětmi/.test(bk) && await page.locator('#bublina-karta .kn-bk-hodnoceni a').count() === 2, 'vyjetá karta: ' + bk);
      await page.mouse.move(720, 12);
      await page.waitForFunction(() => document.getElementById('bublina-karta').hidden);
      // pravé tlačítko na dlaždici seriálu: stav, kopírovat, ČSFD
      await page.click('#p-knihovna [data-kn-karta="serial-majak"] .kn-karta__nazev', { button: 'right' });
      await page.waitForSelector('.nabidka.videt');
      const nab = await page.locator('.nabidka [data-nabidka-i]').allTextContents();
      jistota(nab.join('|') === 'Chci vidět|Rozkoukané|Viděno|Kopírovat název|Otevřít ČSFD', 'nabídka: ' + nab.join('|'));
      await page.click('.nabidka [data-nabidka-i="0"]');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaMoje' && v.id === 'serial-majak' && v.stav === 'chci'), 5000, 'Chci vidět z nabídky');
      await page.waitForFunction(() => /Chci vidět/.test(document.querySelector('#p-knihovna [data-kn-karta="serial-majak"]').textContent));
      // filtr Chci vidět ukáže jen seriál (a čekající požadavek z Podobných – ten je vidět vždy)
      await page.click('#kn-filtry [data-kn-filtr="chci"]');
      await page.waitForFunction(() => document.querySelectorAll('#p-knihovna .kn-karta:not(.kn-karta--ceka)').length === 1 &&
        /Nebeští jezdci/.test(document.querySelector('#p-knihovna .kn-karta--ceka').textContent));
      await page.click('#kn-filtry [data-kn-filtr="vse"]');
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | '));
    } finally { await ctx.close(); }
  });

  await test('Knihovna: historie podstránek a záložek – Zpět vrátí seznam s posunem a filtrem (i po přepínání záložek), související a podobné = další stránka (Zpět i se záložkou), ' +
    'vpřed, okno nad stránkou, znovunačtení na záložce, odkaz na záložku zvenku, přilepený pás, jiná sekce, Hledat z Pošty', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, { nazev: 'pc-nizke', sirka: 1440, vyska: 420, dotyk: false });
    try {
      await knihovnaSit(page);
      await page.goto(WEB);
      await page.click('#rail [data-cil="knihovna"]');
      await page.waitForSelector('#p-knihovna [data-kn-karta="film-zkusebni-let"]');
      // posun seznamu se po Zpět vrátí (otevření přes JS – klepnutí Playwrightu by stránku posunulo k dlaždici)
      const y = await page.evaluate(() => { window.scrollTo(0, 120); return window.scrollY; });
      jistota(y > 50, 'seznam jde posunout: ' + y);
      await page.evaluate(() => document.querySelector('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-karta__otevri').click());
      await podstranka(page, 'film-zkusebni-let');
      jistota(await page.evaluate(() => window.scrollY) < 5, 'stránka karty začíná nahoře');
      // přepínání záložek historii nepřidává: po třech záložkách vede Zpět rovnou na seznam
      for (const z of ['herci', 'zakulisi', 'fakta']) {
        await page.click(STRANKA + ' [data-kn-tab="' + z + '"]');
        await naZalozce(page, 'film-zkusebni-let', z);
      }
      await page.goBack();
      await seznamKnihovny(page);
      await cekejVeStrance(page, (v) => Math.abs(window.scrollY - v) <= 2, y);
      // vpřed = zase karta na poslední záložce
      await page.goForward();
      await podstranka(page, 'film-zkusebni-let');
      await naZalozce(page, 'film-zkusebni-let', 'fakta');
      // přilepený pás: čtenář je níž v dlouhém panelu (pás nahoře), jiná záložka začne hned pod pásem
      await page.click(STRANKA + ' [data-kn-tab="herci"]');
      await naZalozce(page, 'film-zkusebni-let', 'herci');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await cekejVeStrance(page, () => document.querySelector('#kn-stranka [data-kn-cast="nav"]').getBoundingClientRect().top <= 1 && window.scrollY > 200);
      await page.click(STRANKA + ' [data-kn-tab="kde"]');
      await naZalozce(page, 'film-zkusebni-let', 'kde');
      const p = await page.evaluate(() => ({ nav: document.querySelector('#kn-stranka [data-kn-cast="nav"]').getBoundingClientRect(), telo: document.querySelector('#kn-stranka [data-kn-cast="telo"]').getBoundingClientRect() }));
      jistota(p.nav.top <= 1 && p.telo.top >= p.nav.bottom - 1 && p.telo.top - p.nav.bottom < 30, 'nový panel hned pod přilepeným pásem: ' + JSON.stringify(p));
      // související rešerše a podobné s kartou = další stránka, Zpět vrátí předchozí i se záložkou a posunem
      await page.click(STRANKA + ' [data-kn-tab="podobne"]');
      await naZalozce(page, 'film-zkusebni-let', 'podobne');
      await page.evaluate(() => document.querySelector('#kn-stranka .kn-souvisi [data-kn-otevri="reserse-letectvi"]').scrollIntoView());
      const y2 = await page.evaluate(() => window.scrollY);
      await page.evaluate(() => document.querySelector('#kn-stranka .kn-souvisi [data-kn-otevri="reserse-letectvi"]').click());
      await podstranka(page, 'reserse-letectvi');
      await page.waitForSelector(STRANKA + ' .kn-kratce');
      await naZalozce(page, 'reserse-letectvi', 'shrnuti', 'shrnuti');
      await page.goBack();
      await podstranka(page, 'film-zkusebni-let');
      await naZalozce(page, 'film-zkusebni-let', 'podobne');
      await cekejVeStrance(page, (v) => Math.abs(window.scrollY - v) <= 2, y2);
      await page.evaluate(() => document.querySelector('#kn-stranka .kn-podobne [data-kn-otevri="serial-majak"]').click());
      await podstranka(page, 'serial-majak');
      jistota(/Maják/.test(await page.textContent(STRANKA + ' .kn-hero__nazev')), 'podobné s kartou otevře její stránku');
      // ← Knihovna ze druhé stránky: rovnou na seznam (dva kroky historie)
      await page.click(STRANKA + ' [data-kn-zpet]');
      await seznamKnihovny(page);
      await cekejVeStrance(page, (v) => Math.abs(window.scrollY - v) <= 2, y);
      // filtr a hledání zůstanou: hledám „zku“, otevřu kartu, Zpět → pořád „zku“ a jedna dlaždice
      await page.fill('#kn-hledat', 'zku');
      await page.waitForFunction(() => document.querySelectorAll('#p-knihovna .kn-karta').length === 1);
      await page.click('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-karta__otevri');
      await podstranka(page, 'film-zkusebni-let');
      await naZalozce(page, 'film-zkusebni-let', 'prehled'); // nová podstránka vždy na Přehledu
      // okno nad stránkou: Zpět zavře jen okno, stránka zůstane
      await page.click('#horni [data-kn-pridat]');
      await page.waitForSelector('[data-panel="kn-pridat"].otevreny');
      await page.goBack();
      await page.waitForSelector('[data-panel="kn-pridat"]', { state: 'detached' });
      await page.waitForTimeout(150);
      jistota(await page.evaluate(() => location.hash) === '#knihovna/film-zkusebni-let' && await page.isVisible(STRANKA + ' .kn-hero'), 'Zpět zavřel jen okno');
      await page.goBack();
      await seznamKnihovny(page);
      jistota(await page.inputValue('#kn-hledat') === 'zku' && await page.locator('#p-knihovna .kn-karta').count() === 1, 'hledání v seznamu zůstalo');
      await page.fill('#kn-hledat', '');
      // znovunačtení na záložce karty: zůstane karta i záložka; ← Knihovna pak jde historií na seznam
      await page.click('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-karta__otevri');
      await podstranka(page, 'film-zkusebni-let');
      await page.click(STRANKA + ' [data-kn-tab="zakulisi"]');
      await naZalozce(page, 'film-zkusebni-let', 'zakulisi');
      await page.reload();
      await podstranka(page, 'film-zkusebni-let');
      // po znovunačtení může vyskočit okno Co je nového (výstrahy) – zavřít, ať nepřekáží
      await page.waitForSelector('.okno-pozadi.videt', { timeout: 2500 }).then(() => page.keyboard.press('Escape')).catch(() => { /* nevyskočilo */ });
      await page.waitForSelector('.okno-pozadi', { state: 'detached' });
      await naZalozce(page, 'film-zkusebni-let', 'zakulisi');
      jistota(await page.locator('#rail [data-cil="knihovna"][aria-current="page"]').count() === 1, 'po znovunačtení stránka Knihovna');
      // Kopírovat odkaz = adresa i se záložkou
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.click(STRANKA + ' [data-kn-kopirovat-odkaz]');
      await cekejVeStrance(page, async () => /#knihovna\/film-zkusebni-let\/zakulisi$/.test(await navigator.clipboard.readText()));
      await page.click(STRANKA + ' [data-kn-zpet]');
      await seznamKnihovny(page);
      // jiná sekce z karty: adresa bez #knihovna, návrat do Knihovny = seznam
      await page.click('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-karta__otevri');
      await podstranka(page, 'film-zkusebni-let');
      await page.click(STRANKA + ' [data-kn-tab="herci"]');
      await naZalozce(page, 'film-zkusebni-let', 'herci');
      await page.click('#rail [data-cil="posta"]');
      await cekejVeStrance(page, () => location.hash === '' && !document.getElementById('p-posta').hidden && !document.documentElement.classList.contains('kn-podstranka'));
      await page.click('#rail [data-cil="knihovna"]');
      await seznamKnihovny(page);
      // Hledat z Pošty → stránka karty; Zpět vrátí na Poštu
      await page.click('#rail [data-cil="posta"]');
      await page.keyboard.press('Control+k');
      await page.fill('[data-hledat-pole]', 'zkusebni');
      await page.click('#hledat-vysledky [data-h-knihovna="film-zkusebni-let"]');
      await podstranka(page, 'film-zkusebni-let');
      await page.goBack();
      await cekejVeStrance(page, () => !document.getElementById('p-posta').hidden && location.hash === '');
      // odkaz na záložku zvenku (nová záložka prohlížeče): rovnou karta na té záložce, ← Knihovna = seznam; karta, která není → hláška a zpět
      const p2 = await ctx.newPage();
      await pripravMotor(p2);
      await knihovnaSit(p2);
      await p2.goto(WEB + '#knihovna/reserse-letectvi/osa');
      await podstranka(p2, 'reserse-letectvi');
      await p2.waitForSelector(STRANKA + ' .kn-osa');
      await naZalozce(p2, 'reserse-letectvi', 'osa', 'shrnuti');
      await p2.click(STRANKA + ' [data-kn-zpet]');
      await seznamKnihovny(p2);
      await p2.goto('about:blank');
      await p2.goto(WEB + '#knihovna/film-zkusebni-let/pojmy'); // záložka, kterou karta nemá → Přehled
      await podstranka(p2, 'film-zkusebni-let');
      await cekejVeStrance(p2, () => !document.getElementById('kn-panel-prehled').hidden && document.querySelector('#kn-stranka [data-kn-tab="prehled"]').getAttribute('aria-selected') === 'true');
      await p2.goto('about:blank');
      await p2.goto(WEB + '#knihovna/film-neni');
      await p2.waitForFunction(() => /Tohle v knihovně není/.test((document.querySelector('#kn-stranka') || {}).textContent || ''));
      await p2.click('#kn-stranka .prazdne [data-kn-zpet]');
      await seznamKnihovny(p2);
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | '));
    } finally { await ctx.close(); }
  });

  await test('Knihovna: „+ Přidat“ → hned „Claude připravuje…“ s časem a náhledem z Wikipedie, „už v knihovně je“, Zrušit a Vrátit, Claude kartu připraví → plná karta', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    knihovnaVolani.length = 0;
    const wiki = [];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await knihovnaSit(page, wiki);
      await page.goto(WEB);
      await page.click('#rail [data-cil="knihovna"]');
      await page.waitForSelector('#p-knihovna .kn-karta');
      // „už v knihovně je“ při psaní
      await page.click('#horni [data-kn-pridat]');
      await page.waitForSelector('[data-panel="kn-pridat"].otevreny [data-kn-pridat-text]');
      jistota(await page.getAttribute('[data-panel="kn-pridat"] [data-kn-druh="film"]', 'aria-pressed') === 'true', 'na záložce Filmy předvybraný film');
      await page.fill('[data-panel="kn-pridat"] [data-kn-pridat-text]', 'Zkušební let');
      await page.waitForFunction(() => /V knihovně už je „Zkušební let“ \(2020\)/.test((document.querySelector('[data-panel="kn-pridat"] [data-kn-pridat-uz]') || {}).textContent || ''));
      await page.click('[data-panel="kn-pridat"] [data-kn-druh="kniha"]');
      jistota(await page.inputValue('[data-panel="kn-pridat"] [data-kn-pridat-text]') === 'Zkušební let', 'text zůstal po změně druhu');
      jistota(/Název knihy/.test(await page.textContent('[data-panel="kn-pridat"] .label')), 'popisek pole podle druhu');
      await page.click('[data-panel="kn-pridat"] [data-kn-druh="film"]');
      await page.fill('[data-panel="kn-pridat"] [data-kn-pridat-text]', 'Interstellar');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_knihovna_pridat.png') });
      // pomalý motor: karta „Claude připravuje…“ je vidět hned, ještě před odpovědí
      zpozdeniMotoru.knihovnaPridat = 1200;
      await page.press('[data-panel="kn-pridat"] [data-kn-pridat-text]', 'Enter');
      await page.waitForSelector('#p-knihovna .kn-karta--ceka', { timeout: 900 });
      jistota(/Interstellar/.test(await page.textContent('#p-knihovna .kn-karta--ceka')) && /Claude připravuje/.test(await page.textContent('#p-knihovna .kn-karta--ceka')), 'čekající karta hned');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaPridat' && v.druh === 'film' && v.text === 'Interstellar'), 5000, 'požadavek do motoru');
      delete zpozdeniMotoru.knihovnaPridat;
      await page.waitForFunction(() => /Přidáno – Claude připraví kartu filmu/.test((document.getElementById('toast') || {}).textContent || ''));
      await page.waitForSelector('#p-knihovna .kn-karta--ceka[data-kn-ceka^="p-20261011-1200-"]');
      const ceka = await page.textContent('#p-knihovna .kn-karta--ceka');
      jistota(/film · zadáno \d{1,2}:\d{2}/.test(ceka), 'čas zadání: ' + ceka);
      // náhled z Wikipedie (nejdřív česky „Interstellar (film)“): popis a obrázek
      await page.waitForFunction(() => /Film z roku 2014/.test((document.querySelector('#p-knihovna .kn-karta--ceka') || {}).textContent || ''));
      jistota(wiki[0] === 'Interstellar_(film)', 'Wikipedie: ' + wiki.join(', '));
      jistota(await page.locator('#p-knihovna .kn-karta--ceka .kn-obr img[src="https://upload.wikimedia.org/test/wiki.png"]').count() === 1, 'obrázek z Wikipedie');
      // detail čekajícího: zadáno, z Wikipedie, Zrušit → Vrátit
      await page.click('#p-knihovna .kn-karta--ceka .kn-karta__otevri');
      const P = '.panel-kn-pozadavek';
      await page.waitForSelector(P + '.otevreny .kn-wiki');
      const pt = await page.textContent(P);
      jistota(/Mezitím z Wikipedie/.test(pt) && /červí dírou/.test(pt) && /Zadáno/.test(pt) && /do půl hodiny/.test(pt), 'detail požadavku: ' + pt);
      await page.click(P + ' [data-kn-zrusit]');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaZrusit'), 5000, 'zrušení do motoru');
      await page.waitForFunction(() => !document.querySelector('#p-knihovna .kn-karta--ceka'));
      await page.waitForFunction(() => /Požadavek zrušen/.test((document.getElementById('toast') || {}).textContent || ''));
      await page.click('#toast .toast__akce');
      await page.waitForSelector('#p-knihovna .kn-karta--ceka');
      await cekej(() => knihovnaTest.pozadavky.length === 1, 5000, 'Vrátit přidá znovu');
      await page.waitForFunction(() => /Přidáno/.test((document.getElementById('toast') || {}).textContent || '')); // odpověď motoru je v aplikaci
      // Claude připravil kartu (s "pozadavek") → po obnovení plná karta, čekající pryč
      const pz = knihovnaTest.pozadavky[0];
      knihovnaTest.karty.unshift({ id: 'film-interstellar', druh: 'film', nazev: 'Interstellar', rok: 2014, delka: '169 min', kratce: 'Výprava červí dírou.',
        pozadavek: pz.id, pripraveno: new Date().toISOString() });
      knihovnaTest.pozadavky = [];
      await page.click('#horni [data-obnovit]');
      await page.waitForSelector('#p-knihovna [data-kn-karta="film-interstellar"]');
      await page.waitForFunction(() => !document.querySelector('#p-knihovna .kn-karta--ceka'));
      jistota(/nové/.test(await page.textContent('#p-knihovna [data-kn-karta="film-interstellar"]')), 'nová karta je „nové“');
      // stará karta bez rozšíření (jen základní pole): stránka bez pásu záložek, šipky nic nedělají
      await page.click('#p-knihovna [data-kn-karta="film-interstellar"] .kn-karta__otevri');
      await podstranka(page, 'film-interstellar');
      jistota(await page.locator(STRANKA + ' [role="tab"]').count() === 0 && /Výprava červí dírou/.test(await page.textContent(STRANKA)), 'jednoduchá karta');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      jistota(await page.evaluate(() => location.hash) === '#knihovna/film-interstellar', 'bez záložek šipka nic');
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | '));
    } finally { delete zpozdeniMotoru.knihovnaPridat; await ctx.close(); }
  });

  await test('Knihovna: rešerše jako stránka se záložkami – Shrnutí (krátce, čísla, další otázky), Obsah po sekcích, Časová osa, Pojmy, Zdroje; přečteno, další otázka = nový požadavek', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    knihovnaVolani.length = 0;
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3], 'dark');
    try {
      await knihovnaSit(page);
      await page.goto(WEB);
      await page.click('#rail [data-cil="knihovna"]');
      await page.click('#kn-zalozky [data-kn-zalozka="reserse"]');
      await page.waitForSelector('#p-knihovna .kn-res');
      jistota(/Jak létá letadlo/.test(await page.textContent('#p-knihovna .kn-reserse-seznam')) && /fyzika/.test(await page.textContent('#p-knihovna .kn-reserse-seznam')), 'seznam rešerší');
      await page.click('#p-knihovna .kn-res');
      await podstranka(page, 'reserse-letectvi');
      await page.waitForSelector(STRANKA + ' .kn-kratce');
      await naZalozce(page, 'reserse-letectvi', 'shrnuti', 'shrnuti');
      const t = (await page.textContent(STRANKA)).replace(/\s+/g, ' ');
      ['Proč letadlo nespadne?', 'Krátce', 'Křídlo vychyluje vzduch dolů', '900 km/h', 'cestovní výška', 'Vztlak', 'úhel náběhu', 'Motory', '1903', 'První řízený motorový let.',
        'Jak funguje vrtulník?', 'Encyklopedie – vztlak', 'Zkušební let', 'Síla kolmá na proud vzduchu.'].forEach((x) => jistota(t.indexOf(x) >= 0, 'v rešerši chybí „' + x + '“'));
      jistota(await page.locator(STRANKA + ' .kn-osa li').count() === 2 && await page.locator(STRANKA + ' .kn-cisla > .kn-fakt').count() === 2, 'osa a čísla');
      const pas = (await page.locator(STRANKA + ' [role="tab"][data-kn-tab]').allTextContents()).map((x) => x.trim()).join('|');
      jistota(pas === 'Shrnutí|Obsah|Časová osa|Pojmy|Zdroje', 'záložky rešerše: ' + pas);
      jistota(await page.isVisible(STRANKA + ' #kn-panel-shrnuti .kn-otazky') && await page.isHidden(STRANKA + ' .kn-osa'), 'Shrnutí s dalšími otázkami, ostatní skryté');
      // přečteno (Moje v hlavičce Shrnutí)
      await page.click(STRANKA + ' [data-kn-stav="hotovo"]');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaMoje' && v.id === 'reserse-letectvi' && v.stav === 'hotovo'), 5000, 'přečteno do motoru');
      // Obsah: sekce po jedné (seznam vlevo), body pod textem
      await page.click(STRANKA + ' [data-kn-tab="obsah"]');
      await naZalozce(page, 'reserse-letectvi', 'obsah', 'shrnuti');
      jistota(await page.isVisible(STRANKA + ' #kn-panel-obsah [data-kn-podpanel="kn-s-1"] .kn-vkostce') && await page.isHidden(STRANKA + ' #kn-panel-obsah [data-kn-podpanel="kn-s-2"]'), 'první sekce');
      await page.click(STRANKA + ' #kn-panel-obsah [role="tab"][data-kn-pod="kn-s-2"]');
      await cekejVeStrance(page, () => !document.querySelector('#kn-panel-obsah [data-kn-podpanel="kn-s-2"]').hidden && document.querySelector('#kn-panel-obsah [data-kn-podpanel="kn-s-1"]').hidden);
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_tmavy_knihovna_reserse.png') });
      // pojmy: všechny vidět jako karty (žádné rozbalování)
      await page.click(STRANKA + ' [data-kn-tab="pojmy"]');
      await naZalozce(page, 'reserse-letectvi', 'pojmy', 'shrnuti');
      jistota(await page.locator(STRANKA + ' #kn-panel-pojmy dt').count() === 2 && await page.isVisible(STRANKA + ' #kn-panel-pojmy dd >> nth=1'), 'pojmy');
      // časová osa a zdroje
      await page.click(STRANKA + ' [data-kn-tab="osa"]');
      await naZalozce(page, 'reserse-letectvi', 'osa', 'shrnuti');
      await page.click(STRANKA + ' [data-kn-tab="zdroje"]');
      await naZalozce(page, 'reserse-letectvi', 'zdroje', 'shrnuti');
      jistota(await page.getAttribute(STRANKA + ' #kn-panel-zdroje .kn-zdroje a', 'href') === 'https://example.com/vztlak' &&
        await page.isVisible(STRANKA + ' #kn-panel-zdroje [data-kn-otevri="film-zkusebni-let"]'), 'zdroje a související');
      // další otázka = nový požadavek na rešerši rovnou (na stránce zůstanu)
      await page.click(STRANKA + ' [data-kn-tab="shrnuti"]');
      await naZalozce(page, 'reserse-letectvi', 'shrnuti', 'shrnuti');
      await page.click(STRANKA + ' [data-kn-otazka="Jak funguje vrtulník?"]');
      await cekej(() => knihovnaVolani.some((v) => v.akce === 'knihovnaPridat' && v.druh === 'reserse' && v.text === 'Jak funguje vrtulník?'), 5000, 'otázka do motoru');
      await page.waitForFunction(() => /Přidáno – Claude připraví rešerši/.test((document.getElementById('toast') || {}).textContent || ''));
      jistota(await page.evaluate(() => location.hash) === '#knihovna/reserse-letectvi', 'zůstávám na rešerši');
      await page.click(STRANKA + ' [data-kn-zpet]');
      await page.waitForSelector('#p-knihovna .kn-res--ceka');
      jistota(/Jak funguje vrtulník\?/.test(await page.textContent('#p-knihovna .kn-res--ceka')) && /přečteno/.test(await page.textContent('#p-knihovna .kn-reserse-seznam')),
        'čekající rešerše a přečteno v seznamu');
      // podruhé se rešerše čte ze zařízení (bez motoru)
      const pred = volano.filter((d) => d.akce === 'knihovnaReserse').length;
      await page.click('#p-knihovna [data-kn-otevri="reserse-letectvi"]');
      await podstranka(page, 'reserse-letectvi');
      await page.waitForSelector(STRANKA + ' .kn-kratce');
      jistota(volano.filter((d) => d.akce === 'knihovnaReserse').length === pred, 'rešerše podruhé bez motoru');
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | '));
    } finally { await ctx.close(); }
  });

  await test('Knihovna na telefonu (390 px, tmavý režim): z menu, dlaždice pod sebou, stránka karty v jednom sloupci, pás záložek do strany (vybraná vidět), ' +
    'Zákulisí s výběrem sekcí nahoře, žádná záložka nepřetéká, gesto Zpět, „+“ → Do knihovny', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark');
    try {
      await knihovnaSit(page);
      await page.goto(WEB);
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="knihovna"]');
      await page.waitForSelector('#p-knihovna .kn-karta');
      const r = await page.evaluate(() => {
        const k = Array.from(document.querySelectorAll('#p-knihovna .kn-karta')).map((x) => x.getBoundingClientRect());
        return { sirky: k.map((b) => Math.round(b.width)), pod: k.length > 1 && k[1].top >= k[0].bottom, preteka: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      jistota(r.sirky.every((w) => w >= 340) && r.pod && r.preteka <= 0, 'telefon: ' + JSON.stringify(r));
      jistota(await page.isVisible('#p-knihovna .kn-lista__pridat'), 'na telefonu „Přidat“ na stránce');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_knihovna.png') });
      await page.click('#p-knihovna [data-kn-karta="film-zkusebni-let"] .kn-karta__otevri');
      await podstranka(page, 'film-zkusebni-let');
      await page.waitForTimeout(350);
      jistota(await page.evaluate(() => { const pas = document.querySelector('#kn-stranka .kn-oddily__pas'); return pas.scrollWidth > pas.clientWidth && !!document.querySelector('.hlava-ja [data-menu]').offsetParent; }),
        'pás záložek do strany, menu vidět');
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_knihovna_detail.png') });
      // každá záložka: jen její panel, nic nepřetéká do strany, vybraná záložka je v pásu vidět
      const klice = await page.evaluate(() => Array.from(document.querySelectorAll('#kn-stranka [data-kn-tab]')).map((b) => b.dataset.knTab));
      for (const z of klice) {
        await page.click(STRANKA + ' [data-kn-tab="' + z + '"]');
        await naZalozce(page, 'film-zkusebni-let', z);
        await cekejVeStrance(page, (k) => {
          const b = document.querySelector('#kn-stranka [data-kn-tab="' + k + '"]');
          const pas = b.parentNode.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return rb.left >= pas.left - 1 && rb.right <= pas.right + 1 && document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0;
        }, z, 8000);
      }
      // herci pod sebou v jednom sloupci
      await page.click(STRANKA + ' [data-kn-tab="herci"]');
      await naZalozce(page, 'film-zkusebni-let', 'herci');
      jistota(await page.evaluate(() => { const l = Array.from(document.querySelectorAll('#kn-panel-herci .kn-osoba')).map((x) => Math.round(x.getBoundingClientRect().left));
        return l.length >= 3 && l.every((x) => x === l[0]); }), 'herci v jednom sloupci');
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_knihovna_herci.png') });
      // Zákulisí: výběr sekcí vodorovně nad textem
      await page.click(STRANKA + ' [data-kn-tab="zakulisi"]');
      await naZalozce(page, 'film-zkusebni-let', 'zakulisi');
      jistota(await page.evaluate(() => { const nav = document.querySelector('#kn-panel-zakulisi .kn-cteni__nav'); const c = document.querySelector('#kn-pp-kn-s-vznik');
        return getComputedStyle(nav).flexDirection === 'row' && nav.getBoundingClientRect().bottom <= c.getBoundingClientRect().top + 1; }), 'sekce nahoře vodorovně');
      await page.click(STRANKA + ' #kn-panel-zakulisi [role="tab"][data-kn-pod="kn-s-hudba"]');
      await cekejVeStrance(page, () => !document.querySelector('#kn-pp-kn-s-hudba').hidden);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_tmavy_knihovna_zakulisi.png') });
      // gesto Zpět (Zpět prohlížeče) vrátí seznam – přepínání záložek historii nepřidalo
      await page.goBack();
      await seznamKnihovny(page);
      await page.click('#lista [data-rychle]');
      await page.click('[data-panel="rychle"] [data-rychle-akce="knihovna"]');
      await page.waitForSelector('[data-panel="kn-pridat"].otevreny [data-kn-pridat-text]');
      jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'okno přetéká');
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | '));
    } finally { await ctx.close(); }
  });

  await test('Knihovna na iPadu (na výšku i na šířku): stránka karty přes celou šířku, hlavička s Moje, záložky, nic nepřetéká', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    for (const v of [VELIKOSTI[1], VELIKOSTI[2]]) {
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, v);
      try {
        await knihovnaSit(page);
        await page.goto(WEB + '#knihovna/film-zkusebni-let');
        await podstranka(page, 'film-zkusebni-let');
        await page.waitForSelector('.okno-pozadi.videt', { timeout: 1500 }).then(() => page.keyboard.press('Escape')).catch(() => { /* nevyskočilo */ });
        await page.waitForTimeout(300);
        const s = await page.evaluate(() => ({ okno: window.innerWidth, stranka: document.getElementById('kn-stranka').getBoundingClientRect().width,
          preteka: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
        jistota(s.stranka >= 0.8 * s.okno && s.preteka <= 0, v.nazev + ': ' + JSON.stringify(s));
        await page.screenshot({ path: path.join(VYSTUP, v.nazev + '_knihovna_detail.png') });
        await page.click(STRANKA + ' [data-kn-tab="fakta"]');
        await naZalozce(page, 'film-zkusebni-let', 'fakta');
        jistota(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, v.nazev + ': fakta přetékají');
        jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | '));
      } finally { await ctx.close(); }
    }
  });

  await test('Knihovna v ukázkovém režimu: vymyšlené karty s herci, postavami, fakty a sekcemi (jen iniciály), čekající požadavek, stránka karty a rešerše bez motoru (a bez Wikipedie)', async () => {
    const ctx = await prohlizec.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem('asistent.pripojeni', JSON.stringify({ demo: true })));
    const page = await ctx.newPage();
    const chyby = [], venku = [];
    page.on('pageerror', (e) => chyby.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
    page.on('request', (r) => { if (/wikipedia\.org|wikimedia\.org/.test(r.url())) venku.push(r.url()); });
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="knihovna"]');
      await page.waitForSelector('#p-knihovna [data-kn-karta="film-expedice-polarka"]');
      jistota(await page.locator('#p-knihovna .kn-karta').count() === 2, 'film a seriál z ukázky');
      await page.click('#p-knihovna [data-kn-karta="film-expedice-polarka"] .kn-karta__otevri');
      await podstranka(page, 'film-expedice-polarka');
      jistota(await page.locator(STRANKA + ' #kn-panel-herci .kn-lp-herci .kn-osoba').count() === 4 && await page.locator(STRANKA + ' .kn-foto img').count() === 0, 'herci z ukázky jen s iniciálami');
      jistota(await page.locator(STRANKA + ' #kn-panel-fakta .kn-fakt').count() === 4 && await page.locator(STRANKA + ' #kn-panel-zakulisi [data-kn-podpanel]').count() === 3 &&
        await page.locator(STRANKA + ' .kn-citat').count() === 2, 'fakta, sekce a citáty z ukázky');
      await page.screenshot({ path: path.join(VYSTUP, 'ukazka_knihovna_film.png') });
      await page.click(STRANKA + ' [data-kn-zpet]');
      await page.click('#kn-zalozky [data-kn-zalozka="knihy"]');
      await page.waitForSelector('#p-knihovna .kn-karta--ceka');
      jistota(/Ukázková kniha o vesmíru/.test(await page.textContent('#p-knihovna .kn-karta--ceka')), 'čekající požadavek v ukázce');
      await page.click('#p-knihovna [data-kn-karta="kniha-kroniky-udoli"] .kn-karta__otevri');
      await podstranka(page, 'kniha-kroniky-udoli');
      const zal = (await page.locator(STRANKA + ' [data-kn-tab]').allTextContents()).map((x) => x.trim()).join('|');
      jistota(zal === 'Přehled|Postavy a autor|Svět a autor|Fakta a zajímavosti|Série|Kde sehnat|Podobné', 'záložky knihy: ' + zal);
      await page.click(STRANKA + ' [data-kn-tab="serie"]');
      await page.waitForSelector(STRANKA + ' .kn-tabulka');
      const t = await page.textContent(STRANKA);
      jistota(/Doporučené pořadí/.test(t) && /Autor a tvůrci/.test(t) && await page.locator(STRANKA + ' .kn-postava').count() === 4, 'série, autor a postavy v ukázce');
      jistota(/Claude připravuje/.test(await page.textContent(STRANKA + ' #kn-panel-podobne')), 'podobné, které už Claude připravuje');
      await page.click(STRANKA + ' [data-kn-zpet]');
      await page.click('#kn-zalozky [data-kn-zalozka="reserse"]');
      await page.click('#p-knihovna [data-kn-otevri="reserse-proc-je-obloha-modra"]');
      await podstranka(page, 'reserse-proc-je-obloha-modra');
      await page.waitForSelector(STRANKA + ' .kn-osa', { state: 'attached' });
      await page.click(STRANKA + ' [data-kn-tab="obsah"]');
      await page.waitForSelector(STRANKA + ' #kn-panel-obsah .kn-cteni__clanek');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(VYSTUP, 'ukazka_knihovna_reserse.png') });
      jistota(!venku.length, 'ukázka nic neposílá ven: ' + venku.join(', '));
      jistota(!chyby.length, 'chyby stránky: ' + chyby.join(' | '));
    } finally { await ctx.close(); }
  });

  // ---------- šířka stránek (Michal 15. 10.: „problém s tou šířkou stránky je stejně jako na reelu i u auta … projdi všechny stránky“):
  // na PC šířku využít víc sloupci / mřížkou, ne zvětšováním jednoho prvku – nic přerostlého (grafy, obrázky, karty, tabulky přes
  // celou šířku) ani úzký pruh s prázdnem vedle; telefon bez přetečení do strany. Stránky Zdraví, Fotbal, Auto, Plakáty, Knihovna.
  const PC1920 = { nazev: 'pc1920', sirka: 1920, vyska: 1080, dotyk: false };
  const PC1280 = { nazev: 'pc1280', sirka: 1280, vyska: 800, dotyk: false };
  const NA_STRANCE = { zdravi: '#p-zdravi .zdravi-hero', fotbal: '#p-fotbal .fotbal-tabulka tr.nas', auto: '#p-auto .auto-zapisy',
    plakaty: '#p-plakaty .plakat-stage .poster .design', knihovna: '#p-knihovna .kn-karta' };
  /** Otevře stránku (PC pásem, telefon menu) a vrátí míry: dostupná šířka, obsah, obdélníky prvků podle selektorů, přetečení. */
  const otevriAZmer = async (page, v, s, vyber) => {
    if (v.sirka >= 760) await page.click('#rail [data-cil="' + s + '"]');
    else { await page.click('.hlava-ja [data-menu]'); await page.click('[data-panel="menu"] [data-menu-cil="' + s + '"]'); }
    await page.waitForSelector(NA_STRANCE[s]);
    // plakát vždy na 17.–18. 10. (mládež z rozlosování = několik řádků v editoru), ať nezáleží na dni spuštění
    if (s === 'plakaty') await naVikend(page, '2026-10-17', 'RATÍŠKOVICE');
    await page.waitForTimeout(400);
    return page.evaluate(([s, vyber]) => {
      const el = document.getElementById('p-' + s), main = el.parentElement, cs = getComputedStyle(main);
      const r = (x) => { const b = x.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
      const prvky = {};
      Object.keys(vyber).forEach((k) => { prvky[k] = Array.from(el.querySelectorAll(vyber[k])).filter((x) => x.getClientRects().length).map(r); });
      return { dostupne: Math.round(main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), obsah: r(el), prvky,
        preteka: document.documentElement.scrollWidth - document.documentElement.clientWidth, okno: innerWidth };
    }, [s, vyber]);
  };
  const nejvic = (pole, k) => Math.max(0, ...pole.map((x) => x[k]));
  const sloupcu = (pole) => new Set(pole.map((x) => x.l)).size;
  const vedle = (a, b) => a && b && b.l >= a.r && Math.abs(a.t - b.t) <= 4; // b vpravo od a, nahoře zarovnané
  const VYBER = {
    zdravi: { karty: '.card', grafy: 'svg.graf14, svg.graf-vahy', hero: '.zdravi-hero', kpi: '.zdravi-kpi' },
    fotbal: { karty: '.card', tabulka: '.fotbal-tabulka' },
    auto: { hero: '.auto-hero', servis: '.auto-servis', grafy: '.auto-graf', cara: 'svg.auto-cara', zapisy: '.auto-zapisy .auto-zapis', resit: '.auto-resit__polozka', karty: '.card' },
    plakaty: { nahled: '.plakat-nahled', stage: '.plakat-stage', ig: '.pl-ig', editor: '.pl-editor', karty: '.pl-editor .pl-karta' },
    knihovna: { karty: '.kn-karta' }
  };

  await test('šířka stránek na PC 1920 px: Zdraví, Fotbal, Auto, Plakáty a Knihovna přes celou šířku ve sloupcích – žádný graf, obrázek, karta ani tabulka přerostlé', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC1920, 'light', PRAHA);
    try {
      await knihovnaSit(page);
      await page.goto(WEB);
      await page.waitForSelector('#rail [data-cil="knihovna"]', { state: 'attached' }); // motor načtený – v pásu i menu jsou všechny stránky
      const m = {};
      for (const s of Object.keys(VYBER)) {
        m[s] = await otevriAZmer(page, PC1920, s, VYBER[s]);
        jistota(m[s].preteka <= 0, s + ': stránka přetéká o ' + m[s].preteka + ' px');
        // stránka není zastropená úzkým sloupcem (Auto bylo 1 180 px z 1 792, Zdraví 1 640)
        jistota(m[s].obsah.w >= m[s].dostupne - 2, s + ': obsah ' + m[s].obsah.w + ' px z ' + m[s].dostupne);
        await page.screenshot({ path: path.join(VYSTUP, 'pc1920_' + s + '.png'), fullPage: true });
      }
      const z = m.zdravi.prvky, f = m.fotbal.prvky, a = m.auto.prvky, p = m.plakaty.prvky;
      // Zdraví: karty ve 3 sloupcích (≤ 700 px), kruh připravenosti jen v prvním sloupci a čísla vedle něj, grafy rozumně velké
      jistota(nejvic(z.karty, 'w') <= 700 && sloupcu(z.karty) >= 3, 'Zdraví: karty ' + nejvic(z.karty, 'w') + ' px, sloupců ' + sloupcu(z.karty));
      jistota(vedle(z.hero[0], z.kpi[0]), 'Zdraví: čísla vedle kruhu ' + JSON.stringify([z.hero[0], z.kpi[0]]));
      jistota(z.grafy.length >= 1 && nejvic(z.grafy, 'w') <= 700 && nejvic(z.grafy, 'h') <= 300, 'Zdraví: grafy ' + JSON.stringify(z.grafy));
      // Fotbal: zápasy | tabulka | střelci – tabulka ani karta přes půl stránky
      jistota(sloupcu(f.karty) >= 3 && nejvic(f.karty, 'w') <= 720 && nejvic(f.tabulka, 'w') <= 720, 'Fotbal: ' + JSON.stringify({ sloupcu: sloupcu(f.karty), karta: nejvic(f.karty, 'w'), tabulka: nejvic(f.tabulka, 'w') }));
      // Auto: čísla + servis nahoře vedle sebe, grafy po třech (≤ 700 px, čára ≤ 230 px na výšku), zápisy ve 3 sloupcích, Co řešit v mřížce
      jistota(vedle(a.hero[0], a.servis[0]) && a.hero[0].w <= 1250, 'Auto: servis vedle čísel ' + JSON.stringify([a.hero[0], a.servis[0]]));
      jistota(a.grafy.length >= 2 && nejvic(a.grafy, 'w') <= 700 && nejvic(a.cara, 'h') <= 230, 'Auto: grafy ' + JSON.stringify(a.grafy.concat(a.cara)));
      jistota(a.zapisy.length >= 6 && sloupcu(a.zapisy) >= 3 && nejvic(a.zapisy, 'w') <= 700, 'Auto: zápisy ' + sloupcu(a.zapisy) + ' sloupce, ' + nejvic(a.zapisy, 'w') + ' px');
      jistota(a.resit.length >= 2 && sloupcu(a.resit) >= 2 && nejvic(a.resit, 'w') <= 700, 'Auto: Co řešit ' + JSON.stringify(a.resit));
      // Plakáty: náhled nejvýš 720 px, Instagram a editor vpravo vedle něj, dlaždice v editoru po dvou
      jistota(p.stage[0].w <= 721 && p.nahled[0].w <= 760, 'Plakáty: náhled ' + JSON.stringify([p.nahled[0], p.stage[0]]));
      jistota(vedle(p.nahled[0], p.ig[0]) && p.editor[0].l >= p.nahled[0].r && p.editor[0].t > p.ig[0].t, 'Plakáty: Instagram a editor vedle náhledu ' + JSON.stringify([p.nahled[0], p.ig[0], p.editor[0]]));
      jistota(sloupcu(p.karty) >= 2, 'Plakáty: dlaždice editoru po dvou');
      // Knihovna: karty v mřížce, žádná roztažená
      jistota(m.knihovna.prvky.karty.length >= 2 && nejvic(m.knihovna.prvky.karty, 'w') <= 420, 'Knihovna: karty ' + JSON.stringify(m.knihovna.prvky.karty.slice(0, 3)));
      // náhled plakátu při posunu dolů zůstává vidět (editor je dlouhý – klepnutí v náhledu skáče do pole)
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty .plakat-stage .poster .design');
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(200);
      const n = await page.evaluate(() => { const b = document.querySelector('#p-plakaty .plakat-nahled').getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; });
      jistota(n[0] >= 0 && n[1] <= 1080, 'náhled při posunu mimo obrazovku: ' + n.join('–'));
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | ')); // 404 = záměrně chybějící obrázek knihovny
    } finally {
      await ctx.close();
    }
  });

  await test('šířka stránek na PC 1280 px a na telefonu: Zdraví čísla vedle kruhu, Auto zápisy ve 2 sloupcích, Plakáty náhled s Instagramem vedle sebe; telefon nic nepřetéká (tmavý)', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    let { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC1280, 'light', PRAHA);
    try {
      await page.goto(WEB);
      await page.waitForSelector('#rail [data-cil="knihovna"]', { state: 'attached' }); // motor načtený – v pásu i menu jsou všechny stránky
      const z = (await otevriAZmer(page, PC1280, 'zdravi', VYBER.zdravi)).prvky;
      jistota(vedle(z.hero[0], z.kpi[0]) && nejvic(z.karty, 'w') <= 620 && sloupcu(z.karty) >= 2, 'Zdraví 1280: ' + JSON.stringify([z.hero[0], z.kpi[0], nejvic(z.karty, 'w')]));
      const a = await otevriAZmer(page, PC1280, 'auto', VYBER.auto);
      jistota(a.obsah.w >= a.dostupne - 2 && sloupcu(a.prvky.zapisy) >= 2 && nejvic(a.prvky.grafy, 'w') <= 640, 'Auto 1280: ' + JSON.stringify({ obsah: a.obsah.w, sloupcu: sloupcu(a.prvky.zapisy), graf: nejvic(a.prvky.grafy, 'w') }));
      const p = (await otevriAZmer(page, PC1280, 'plakaty', VYBER.plakaty)).prvky;
      jistota(vedle(p.nahled[0], p.ig[0]) && p.stage[0].w >= 560 && p.stage[0].w <= 721 && p.ig[0].w >= 470, 'Plakáty 1280: ' + JSON.stringify([p.nahled[0], p.stage[0], p.ig[0]]));
      await page.screenshot({ path: path.join(VYSTUP, 'pc1280_plakaty.png') });
      const f = (await otevriAZmer(page, PC1280, 'fotbal', VYBER.fotbal)).prvky;
      jistota(sloupcu(f.karty) === 2 && nejvic(f.karty, 'w') <= 650, 'Fotbal 1280: ' + JSON.stringify(f.karty));
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | ')); // 404 = záměrně chybějící obrázek knihovny
      await ctx.close();
      // telefon: všechno pod sebou jako dřív, nic nepřetéká a žádná karta nevyčuhuje z obrazovky
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0], 'dark', PRAHA));
      await knihovnaSit(page);
      await page.goto(WEB);
      await page.waitForSelector('#rail [data-cil="knihovna"]', { state: 'attached' }); // motor načtený – v pásu i menu jsou všechny stránky
      for (const s of Object.keys(VYBER)) {
        const t = await otevriAZmer(page, VELIKOSTI[0], s, { karty: '.card, .kn-karta', grafy: 'svg, img' });
        const ven = t.prvky.karty.concat(t.prvky.grafy.filter((x) => x.w > 40)).filter((x) => x.l < 0 || x.r > t.okno);
        jistota(t.preteka <= 0 && !ven.length, 'telefon ' + s + ': přetéká ' + t.preteka + ' px, ven ' + JSON.stringify(ven.slice(0, 3)));
        jistota(sloupcu(t.prvky.karty.filter((x) => x.w > 300)) <= 1, 'telefon ' + s + ': karty pod sebou');
      }
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyKnihovny(chybyStranky).join(' | ')); // 404 = záměrně chybějící obrázek knihovny
    } finally {
      await ctx.close();
    }
  });

  await test('telefon: menu zleva se všemi sekcemi (Fotbal, Reely, Plakáty), zavření klepnutím vedle', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    await page.goto(WEB);
    await page.click('.hlava-ja [data-menu]');
    await page.waitForSelector('[data-panel="menu"].otevreny');
    const sekce = await page.$$eval('[data-panel="menu"] [data-menu-cil]', (b) => b.map((x) => x.dataset.menuCil).join());
    jistota(sekce === 'dnes,schranka,posta,kalendar,zdravi,fotbal,reely,plakaty,auto,knihovna', 'sekce v menu: ' + sekce);
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
  await test('start: rychlá čtení jdou v jedné dávce; přednačtení po startu jednou dávkou a auto zvlášť', async () => {
    const pozadavky = [];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    page.on('request', (r) => { if (r.url() === MOTOR) { try { pozadavky.push(JSON.parse(r.postData()).akce); } catch (e) { /* nic */ } } });
    await page.goto(WEB); // první start: info ještě není uložené → bez dávky
    await page.waitForSelector('#dl-pozornost .seznam');
    await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!m.stav.pripravenost), null, 8000);
    pozadavky.length = 0;
    await page.reload();
    await page.waitForSelector('#dl-pozornost .seznam');
    // start (do vykreslení a dočtení) – přednačtení čeká, až start doběhne
    const start = await page.evaluate(() => (performance.getEntriesByName('asistent-vykresleno')[0] || {}).startTime || 0);
    jistota(start > 0, 'aplikace se nevykreslila');
    await page.waitForTimeout(1500);
    jistota(pozadavky.indexOf('davka') >= 0, 'dávka se neposlala: ' + pozadavky.join());
    jistota(['info', 'pocasi', 'zdravi', 'fotbal', 'plakaty', 'knihovna', 'dochazka'].every((a) => pozadavky.indexOf(a) < 0), 'rychlá čtení samostatně: ' + pozadavky.join());
    // čerstvá data z minulého otevření → přednačtení nemá co číst (nic navíc)
    jistota(pozadavky.length <= 6, 'při startu moc požadavků: ' + pozadavky.join());
    jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    await ctx.close();
  });

  // ---------- připravenost (Michal 18. 10.: „stále mi celkem nevyhovuje, že to není vše vždy ready, že se to načítá“ – js/pripravenost.js)
  // kdy se na otevřené stránce poprvé ukázal obsah (ms od startu modulů), jestli mezitím byla kostřička a kdy „aktualizuji…“
  const SLEDUJ_OBSAH = () => {
    const p = window.__obsah = { kostra: false, t: null, aktualizuji: null };
    const VYBER = { zdravi: '#p-zdravi .zdravi-hero', auto: '#p-auto .auto-zapisy', knihovna: '#p-knihovna .kn-karta', plakaty: '#p-plakaty .plakat-stage .poster .design',
      fotbal: '#p-fotbal .fotbal-tabulka tr.nas', dnes: '#dl-pozornost .seznam' };
    const cil = () => { try { return JSON.parse(localStorage.getItem('asistent.pohled')) || 'dnes'; } catch (e) { return 'dnes'; } };
    new MutationObserver(() => {
      const c = cil(), el = document.getElementById('p-' + c);
      if (!el || el.hidden) return;
      if (el.querySelector('.kostra')) p.kostra = true;
      const start = (performance.getEntriesByName('asistent-start')[0] || {}).startTime;
      if (start == null) return;
      if (p.t == null && document.querySelector(VYBER[c])) p.t = Math.round(performance.now() - start);
      if (p.aktualizuji == null && document.querySelector('#hlava .aktualizuji')) p.aktualizuji = Math.round(performance.now() - start);
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  };
  const ZESTARNI_DATA = (st) => {
    Object.keys(localStorage).filter((k) => /^asistent\.data\./.test(k)).forEach((k) => {
      try { const v = JSON.parse(localStorage.getItem(k)); if (v && typeof v.kdy === 'number') { v.kdy -= 10 * 3600e3; localStorage.setItem(k, JSON.stringify(v)); } } catch (e) { /* nic */ }
    });
    localStorage.setItem('asistent.pohled', JSON.stringify(st));
  };
  const POMALE = ['davka', 'auto', 'zdravi', 'pocasi', 'knihovna', 'plakaty', 'fotbal'];

  await test('připravenost: data z minula hned – Zdraví, Auto, Knihovna, Plakáty, Fotbal a Přehled se zpožděným motorem (3 s) do 200 ms bez kostřičky, „aktualizuji…“, pak čerstvá data', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC1500);
    try {
      await knihovnaSit(page);
      await ctx.addInitScript(SLEDUJ_OBSAH);
      await page.goto(WEB);
      // první otevření: start a přednačtení na pozadí uloží do zařízení i stránky, které nejsou otevřené
      await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!(m.stav.pripravenost && m.stav.knihovna && m.stav.auto && m.stav.plakaty && m.stav.zdravi)), null, 10000);
      await page.waitForTimeout(300);
      POMALE.forEach((a) => { zpozdeniMotoru[a] = 3000; });
      const vysledek = [];
      for (const st of ['zdravi', 'auto', 'knihovna', 'plakaty', 'fotbal', 'dnes']) {
        await page.evaluate(ZESTARNI_DATA, st);
        await page.reload();
        await cekejVeStrance(page, () => window.__obsah && window.__obsah.t != null, null, 3000).catch(() => { /* níž */ });
        const o = await page.evaluate(() => window.__obsah);
        vysledek.push(st + ' ' + o.t + ' ms');
        jistota(o.t != null && o.t <= 200, st + ': obsah za ' + o.t + ' ms od startu (data z minula mají být hned, motor odpovídá za 3 s)');
        jistota(!o.kostra, st + ': kostřička, i když zařízení data má');
        // obnova potichu na pozadí: malé „aktualizuji…“ (po 0,7 s, mimo tok stránky) a po odpovědi motoru zase pryč
        await page.waitForSelector('#hlava .aktualizuji', { timeout: 3000 });
        const poloha = await page.evaluate(() => getComputedStyle(document.querySelector('#hlava .aktualizuji')).position);
        jistota(poloha === 'absolute', '„aktualizuji…“ nemá posouvat stránku: ' + poloha);
        await page.waitForSelector('#hlava .aktualizuji', { state: 'detached', timeout: 12000 });
      }
      console.log('    (obsah od startu: ' + vysledek.join(', ') + ')');
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      POMALE.forEach((a) => { delete zpozdeniMotoru[a]; });
      await ctx.close();
    }
  });

  await test('připravenost: po startu přednačtení na pozadí (jedna dávka, auto zvlášť) – přepnutí na Zdraví, Auto, Knihovnu a Plakáty hned a bez motoru; obnova po ~10 / 15 min každé oblasti jednou, po probuzení PC hned, druhé okno nic znovu nečte', async () => {
    knihovnaTest = KNIHOVNA_VYCHOZI();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC1500);
    try {
      await knihovnaSit(page);
      await page.clock.install(); // čas běží dál, testy ho jen popoženou (runFor = minuty po minutě, fastForward = probuzení)
      const pozadavky = [];
      page.on('request', (r) => { if (r.url() === MOTOR) { try { const d = JSON.parse(r.postData()); pozadavky.push(d.akce === 'davka' ? 'davka:' + d.polozky.map((y) => y.akce).join('+') : d.akce); } catch (e) { /* nic */ } } });
      const pred = volano.length;
      await page.goto(WEB);
      await page.waitForSelector('#dl-pozornost .seznam');
      await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!(m.stav.pripravenost && m.stav.pripravenost.duvod === 'start')), null, 10000);
      await page.waitForTimeout(300);
      const pr = await page.evaluate(() => import('/js/stav.js').then((m) => m.stav.pripravenost.nactene));
      ['plakaty', 'knihovna', 'auto', 'dochazka'].forEach((o) => jistota(pr.indexOf(o) >= 0, 'přednačtení po startu: ' + pr.join()));
      const cteni = (a, od) => volano.slice(od).filter((d) => d.akce === a).length;
      jistota(['knihovna', 'plakaty', 'auto', 'zdravi', 'pocasi'].every((a) => cteni(a, pred) === 1), 'každá pomalá oblast jednou: ' + volano.slice(pred).map((d) => d.akce).join());
      jistota(pozadavky.filter((a) => a === 'auto').length === 1 && pozadavky.filter((a) => /^davka:/.test(a) && ['plakaty', 'knihovna', 'dochazka'].every((y) => a.indexOf(y) >= 0)).length === 1,
        'přednačtení jednou dávkou, auto zvlášť: ' + pozadavky.join());
      // přepnutí: obsah hned (bez kostřičky), motor nic nečte
      const poStartu = volano.length;
      for (const [st, sel] of [['zdravi', '#p-zdravi .zdravi-hero'], ['auto', '#p-auto .auto-zapisy'], ['knihovna', '#p-knihovna .kn-karta'], ['plakaty', '#p-plakaty .plakat-stage .poster .design']]) {
        await page.click('#rail [data-cil="' + st + '"]');
        jistota(await page.evaluate(([c, q]) => !!document.querySelector(q) && !document.querySelector('#p-' + c + ' .kostra'), [st, sel]), st + ': po přepnutí hned obsah (bez kostřičky)');
        jistota(!(await page.$('#hlava .aktualizuji')), st + ': přednačtená data nemají „aktualizuji…“');
      }
      await page.waitForTimeout(400);
      const poPrepnuti = volano.slice(poStartu).map((d) => d.akce).filter((a) => ['zdravi', 'auto', 'knihovna', 'plakaty', 'pocasi'].indexOf(a) >= 0);
      jistota(!poPrepnuti.length, 'přepnutí četlo z motoru: ' + poPrepnuti.join());
      await page.click('#rail [data-cil="dnes"]');
      // obnova na pozadí (bez účtu): po 11 min zdraví (mez 10 min), po dalších 5 min počasí (15 min) – každé jednou, nic dvakrát
      let od = volano.length;
      await page.clock.runFor('11:30');
      await page.waitForTimeout(900);
      let x = volano.slice(od).map((d) => d.akce);
      jistota(x.filter((a) => a === 'zdravi').length === 1 && x.indexOf('pocasi') < 0 && x.indexOf('auto') < 0 && x.indexOf('knihovna') < 0, 'obnova po 11 min: ' + x.join());
      od = volano.length;
      await page.clock.runFor('05:00');
      await page.waitForTimeout(900);
      x = volano.slice(od).map((d) => d.akce);
      jistota(x.filter((a) => a === 'pocasi').length === 1 && x.indexOf('zdravi') < 0, 'obnova po 16 min: ' + x.join());
      // probuzení PC (kontroly 20 min stály) → hned pošta, schránka, zdraví, počasí a plakáty – každé jednou
      od = volano.length;
      await page.clock.fastForward('20:00');
      await page.waitForTimeout(1500);
      x = volano.slice(od).map((d) => d.akce);
      ['posta', 'schranka', 'zdravi', 'pocasi', 'plakaty'].forEach((a) => jistota(x.filter((y) => y === a).length === 1, 'po probuzení ' + a + ' jednou: ' + x.join()));
      jistota(await page.evaluate(() => import('/js/stav.js').then((m) => m.stav.pripravenost.duvod)) === 'probuzeni', 'přednačtení po probuzení');
      // druhé okno téhož zařízení (záložka, mini okno): data mu přijdou ze zařízení – samo zdraví nečte
      const p2 = await ctx.newPage();
      const pozadavky2 = [];
      p2.on('request', (r) => { if (r.url() === MOTOR) { try { const d = JSON.parse(r.postData()); pozadavky2.push(d.akce === 'davka' ? 'davka:' + d.polozky.map((y) => y.akce).join('+') : d.akce); } catch (e) { /* nic */ } } });
      await p2.goto(WEB);
      await p2.waitForSelector('#dl-pozornost .seznam');
      await p2.waitForTimeout(1500);
      jistota(!pozadavky2.some((a) => /zdravi|pocasi|knihovna|plakaty|auto/.test(a)), 'druhé okno četlo pomalé oblasti znovu: ' + pozadavky2.join());
      vahaZaznamy = [{ kdy: Date.now() - 864e5, kg: 79.9 }];
      await page.evaluate(() => import('/js/zdravi.js').then((m) => m.nactiZdravi(true)));
      await cekejVeStrance(p2, () => import('/js/stav.js').then((m) => !!(m.stav.zdravi && (m.stav.zdravi.vaha || []).some((v) => v.kg === 79.9))), null, 4000);
      jistota(!pozadavky2.some((a) => /zdravi/.test(a)), 'druhé okno dostalo zdraví ze zařízení, ne z motoru: ' + pozadavky2.join());
      await p2.close();
      jistota(!chybyKnihovny(chybyStranky).length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      vahaZaznamy = [];
      await ctx.close();
    }
  });

  await test('hned v aplikaci, motor na pozadí (motor 2 s): voda, zpět, jídlo, doplněk, váha, tankování, smazání tankování, moje poznámka; chyba motoru zápis vrátí (váha, tankování)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC1500);
    const ZAPISY = ['pitiJidlo', 'vaha', 'doplnky', 'autoZapsat', 'autoSmazat', 'mojePridat'];
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-piti:not([hidden]) [data-piti="250"]');
      await page.waitForSelector('#dl-vaha:not([hidden]) [data-vaha-pole]');
      await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!(m.stav.pripravenost && m.stav.auto)), null, 10000);
      ZAPISY.forEach((a) => { zpozdeniMotoru[a] = 2000; });
      const hned = async (popis, akce, podminka, arg) => {
        await akce();
        await page.waitForFunction(podminka, arg, { timeout: 400 }).catch(() => { throw new Error(popis + ': v aplikaci se nic neukázalo do 400 ms (motor odpovídá za 2 s)'); });
      };
      const text = (s) => page.evaluate((q) => (document.querySelector(q) || {}).textContent || '', s);
      // voda +0,25 l dvakrát rychle za sebou – obě hned, po odpovědích motoru nic neproblikne zpátky
      const pred = await text('#dl-piti .piti__text b');
      await hned('voda', () => page.click('#dl-piti [data-piti="250"]'), (p) => document.querySelector('#dl-piti .piti__text b').textContent !== p, pred);
      const po1 = await text('#dl-piti .piti__text b');
      await hned('voda podruhé', () => page.click('#dl-piti [data-piti="250"]'), (p) => document.querySelector('#dl-piti .piti__text b').textContent !== p, po1);
      const po2 = await text('#dl-piti .piti__text b');
      const videno = new Set();
      for (let i = 0; i < 30; i++) { videno.add(await text('#dl-piti .piti__text b')); await page.waitForTimeout(100); }
      jistota(videno.size === 1 && videno.has(po2), 'voda po odpovědích motoru problikla: ' + Array.from(videno).join(' → '));
      // zpět (smazání posledního zápisu vody) – hned
      await page.waitForSelector('#dl-piti [data-piti-zpet]');
      await hned('voda zpět', () => page.click('#dl-piti [data-piti-zpet]'), (p) => document.querySelector('#dl-piti .piti__text b').textContent === p, po1);
      // doplněk
      const dopl = '#dl-doplnky [data-doplnek]';
      const stisknuto = await page.getAttribute(dopl, 'aria-pressed');
      await hned('doplněk', () => page.click(dopl), ([q, a]) => document.querySelector(q).getAttribute('aria-pressed') !== a, [dopl, stisknuto]);
      // váha z karty na Přehledu
      await page.fill('#dl-vaha [data-vaha-pole]', '80,4');
      await hned('váha', () => page.click('#dl-vaha [data-vaha-zapsat]'), () => /80,4/.test(document.querySelector('#dl-vaha').textContent));
      // moje poznámka
      await page.fill('#p-dnes [data-moje-pole]', 'Koupit hřebíky');
      await hned('moje poznámka', () => page.press('#p-dnes [data-moje-pole]', 'Enter'), () => /Koupit hřebíky/.test(document.querySelector('#dl-moje').textContent));
      // tankování: okno se zavře hned, zápis je v přehledu se „zapisuji…“, po odpovědi motoru bez něj
      await page.click('#rail [data-cil="auto"]');
      await page.waitForSelector('#p-auto .auto-zapisy');
      await page.click('[data-auto-zapis="tankovani"]');
      await page.fill('[data-panel="auto-zapis"] [data-az="castka"]', '1 234');
      await page.fill('[data-panel="auto-zapis"] [data-az="cenaLitr"]', '36,50');
      await hned('tankování', () => page.click('[data-panel="auto-zapis"] [data-auto-ulozit]'),
        () => !document.querySelector('[data-panel="auto-zapis"]') && /1 234 Kč/.test(document.querySelector('.auto-zapisy').textContent.replace(/\s+/g, ' ')));
      jistota(/zapisuji do tabulky/.test(await text('.auto-zapisy')), 'tankování na cestě do tabulky: „zapisuji…“');
      await page.waitForFunction(() => !/zapisuji do tabulky/.test(document.querySelector('.auto-zapisy').textContent), null, { timeout: 5000 });
      // smazání posledního zápisu – hned pryč
      const palivo = await page.$$eval('.auto-zapisy .auto-zapis--palivo', (s) => s.length);
      await page.click('[data-auto-smazat^="tankovani:"]');
      await hned('smazání tankování', () => page.click('.okno-pozadi [data-okno="ano"]'), (n) => document.querySelectorAll('.auto-zapisy .auto-zapis--palivo').length === n - 1, palivo);
      await page.waitForTimeout(2300);
      // chyba motoru: tankování zmizí a okno se otevře znovu se vším napsaným a s důvodem
      chybaMotoru.autoZapsat = 'Tabulka Google teď neodpovídá.';
      const palivoPred = await page.$$eval('.auto-zapisy .auto-zapis--palivo', (s) => s.length);
      await page.click('[data-auto-zapis="tankovani"]');
      await page.fill('[data-panel="auto-zapis"] [data-az="castka"]', '999');
      await page.fill('[data-panel="auto-zapis"] [data-az="cenaLitr"]', '35');
      await page.click('[data-panel="auto-zapis"] [data-auto-ulozit]');
      await page.waitForSelector('[data-panel="auto-zapis"] [data-az-chyba]:not([hidden])', { timeout: 5000 });
      jistota(/neodpovídá/.test(await text('[data-panel="auto-zapis"] [data-az-chyba]')) && await page.inputValue('[data-panel="auto-zapis"] [data-az="castka"]') === '999',
        'okno znovu s chybou a s částkou: ' + await text('[data-panel="auto-zapis"] [data-az-chyba]'));
      jistota(await page.$$eval('.auto-zapisy .auto-zapis--palivo', (s) => s.length) === palivoPred, 'nezapsané tankování zmizelo z přehledu');
      await page.click('[data-panel="auto-zapis"] [data-zavrit-panel]');
      delete chybaMotoru.autoZapsat;
      // chyba motoru u váhy: zápis zmizí, hodnota zpátky v poli, oznámení proč
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('#dl-vaha [data-vaha-pole]');
      chybaMotoru.vaha = 'Disk teď neodpovídá.';
      await page.fill('#dl-vaha [data-vaha-pole]', '81,7');
      await hned('váha (chyba)', () => page.click('#dl-vaha [data-vaha-zapsat]'), () => /81,7/.test(document.querySelector('#dl-vaha').textContent));
      await page.waitForFunction(() => document.querySelector('#dl-vaha [data-vaha-pole]').value === '81,7' && /nezapsala/.test(document.body.textContent), null, { timeout: 5000 });
      jistota(!(await page.evaluate(() => import('/js/stav.js').then((m) => (m.stav.zdravi.vaha || []).some((v) => v.kg === 81.7)))), 'nezapsaná váha zmizela');
      delete chybaMotoru.vaha;
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      ZAPISY.forEach((a) => { delete zpozdeniMotoru[a]; });
      delete chybaMotoru.vaha; delete chybaMotoru.autoZapsat;
      vahaZaznamy = [];
      vycistiSchranku();
      await ctx.close();
    }
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


  // ---------- pravé tlačítko a vyjeté karty po stránkách (Michal 11. 10.: „další využití pravého tlačítka … jednoduché vychytávky,
  // co by bylo vhodné usnadnit a zrychlit … denní kroužky a najetí na to se mi líbí, podobné věci můžeme přidat“)
  const nabidkaPolozky = (page) => page.$$eval('.nabidka [data-nabidka-i] span', (x) => x.map((e) => e.textContent).join('|'));
  const vyberZNabidky = async (page, text) => {
    await page.click('.nabidka [data-nabidka-i] span:text-is("' + text + '")');
    await page.waitForSelector('.nabidka', { state: 'detached' });
  };
  const pravym = async (page, sel) => {
    await page.click(sel, { button: 'right' });
    await page.waitForSelector('.nabidka.videt [data-nabidka-i]');
  };
  const textVyjeteKarty = async (page) => (await page.textContent('#bublina-karta')).replace(/\s+/g, ' ');
  const najetNaKartu = async (page, sel, druh) => {
    await page.mouse.move(2, 2);
    await page.hover(sel);
    await page.waitForSelector('#bublina-karta.videt[data-druh="' + druh + '"]');
    await page.waitForTimeout(220); // dojet přechod „vyjetí“ (kvůli snímkům)
    return textVyjeteKarty(page);
  };
  const schrankaText = async (page) => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n').replace(/ /g, ' ');

  await test('nabídky: Kalendář – pravé tlačítko na události (Kopírovat, Duplikovat na zítra a Smazat s Vrátit, opakovaná s dotazem, iPhone jen ke čtení), den (Nová událost), svátek (přání, oblíbení); karta události a dne myší; klávesnice Shift+F10 (PC)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    await ctx.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>ok</p>' }));
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="kalendar"]');
      await page.click('[data-kal-pohled="mesic"]');
      const pozdni = '#p-kalendar .kal-den [data-udalost^="u3|"]';
      await page.waitForSelector(pozdni);
      // událost v zapisovatelném kalendáři Google
      await pravym(page, pozdni);
      jistota(await nabidkaPolozky(page) === 'Otevřít|Upravit|Duplikovat na zítra|Duplikovat na jiný den…|Kopírovat|Smazat', 'nabídka události: ' + await nabidkaPolozky(page));
      jistota(/Pozdní hovor/.test(await page.textContent('.nabidka__nadpis')) && await page.locator('.nabidka .nabidka__oddel').count() === 2, 'nadpis a oddělovače');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_kalendar_nabidka.png') });
      await vyberZNabidky(page, 'Kopírovat');
      const d0 = new Date(den(0));
      jistota(await schrankaText(page) === ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][d0.getDay()] + ' ' + d0.getDate() + '. ' + (d0.getMonth() + 1) + '. 23:00 Pozdní hovor',
        'zkopírovaný text: ' + await schrankaText(page));
      // Duplikovat na zítra: hned do motoru (stejný kalendář, o den později), Vrátit kopii smaže
      let pred = volano.length;
      await pravym(page, pozdni);
      await vyberZNabidky(page, 'Duplikovat na zítra');
      await cekej(() => volano.slice(pred).some((d) => d.akce === 'udalostUlozit'), 3000, 'duplikát do motoru');
      const dup = volano.slice(pred).find((d) => d.akce === 'udalostUlozit');
      jistota(dup.nazev === 'Pozdní hovor' && dup.zacatek === den(1, 23) && dup.konec === den(1, 23.5) && dup.kalendarId === 'g1' && !dup.udalost, 'duplikát: ' + JSON.stringify(dup));
      await page.waitForSelector('#toast.videt .toast__akce');
      jistota(/Zkopírováno na/.test(await page.textContent('#toast')), 'oznámení duplikátu: ' + await page.textContent('#toast'));
      pred = volano.length;
      await page.click('#toast .toast__akce');
      await cekej(() => volano.slice(pred).some((d) => d.akce === 'udalostSmazat' && d.udalost === 'nova@google.com|' + den(1, 23)), 3000, 'Vrátit duplikát');
      // Smazat obyčejnou: bez dotazu, hned zmizí, Vrátit ji založí znovu (Seznam – 30 dní)
      await page.click('[data-kal-pohled="seznam"]');
      const schuzka = '#p-kalendar [data-udalost^="u4|"]';
      await page.waitForSelector(schuzka);
      pred = volano.length;
      await pravym(page, schuzka);
      await vyberZNabidky(page, 'Smazat');
      jistota(!(await page.locator('.okno-pozadi').count()), 'obyčejná událost se smaže bez dotazu');
      await cekej(() => volano.slice(pred).some((d) => d.akce === 'udalostSmazat' && /^u4\|/.test(d.udalost)), 3000, 'smazání do motoru');
      await page.waitForSelector('#toast.videt .toast__akce');
      pred = volano.length;
      await page.click('#toast .toast__akce');
      await cekej(() => volano.slice(pred).some((d) => d.akce === 'udalostUlozit' && d.nazev === 'Schůzka' && d.zacatek === den(2, 10) && !d.udalost), 3000, 'Vrátit smazanou');
      // opakovaná: Smazat… s potvrzením jako v detailu (Vrátit by řadu nevrátil)
      await page.waitForSelector('#p-kalendar [data-udalost^="u1|"]');
      await pravym(page, '#p-kalendar [data-udalost^="u1|"]');
      jistota(/Smazat…$/.test(await nabidkaPolozky(page)), 'opakovaná: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Smazat…');
      await page.waitForSelector('.okno-pozadi.videt [data-okno="ne"]');
      jistota(/Smazat „Porada“ \(jen tento výskyt\)/.test(await page.textContent('.okno')), 'dotaz u opakované');
      await page.click('.okno-pozadi [data-okno="ne"]');
      await page.waitForSelector('.okno-pozadi', { state: 'detached' });
      // kalendář z iPhonu jen ke čtení: bez Upravit a Smazat
      await pravym(page, '#p-kalendar [data-udalost^="u2|"]');
      jistota(await nabidkaPolozky(page) === 'Otevřít|Duplikovat na jiný den…|Kopírovat', 'iPhone: ' + await nabidkaPolozky(page));
      // Duplikovat na jiný den: formulář předvyplněný o týden později
      await vyberZNabidky(page, 'Duplikovat na jiný den…');
      await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="nazev"]');
      jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="nazev"]') === 'Narozeniny' &&
        await page.inputValue('[data-panel="udalost-formular"] [data-uf="datum"]') === iso(den(8)), 'formulář kopie: ' + await page.inputValue('[data-panel="udalost-formular"] [data-uf="datum"]'));
      await page.click('[data-panel="udalost-formular"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="udalost-formular"]'));
      // den v měsíci: nová událost a zápas v ten den (a svátek – přání, oblíbení)
      await page.click('[data-kal-pohled="mesic"]');
      const dnesBunka = '#p-kalendar .mesic-den.dnes';
      await page.waitForSelector(dnesBunka);
      await pravym(page, dnesBunka + ' .mesic-cislo');
      const nDne = await nabidkaPolozky(page);
      jistota(/^Nová událost v tento den\|Nový zápas v tento den\|Ukázat týden/.test(nDne), 'nabídka dne: ' + nDne);
      await vyberZNabidky(page, 'Nová událost v tento den');
      await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="datum"]');
      jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="datum"]') === iso(den(0)), 'nová událost v ten den');
      await page.click('[data-panel="udalost-formular"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="udalost-formular"]'));
      // svátek v buňce: přání přes WhatsApp (nová karta s textem), přidat a odebrat oblíbeného
      const sv = await page.evaluate(() => {
        const x = Array.from(document.querySelectorAll('#p-kalendar .mesic-den:not(.mimo) .svatek--bunka')).find((e) => /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+$/.test(e.textContent.trim()));
        return x ? { den: x.closest('[data-den]').dataset.den, jmeno: x.textContent.trim() } : null;
      });
      jistota(sv, 'buňka se svátkem');
      const svSel = '#p-kalendar .mesic-den[data-den="' + sv.den + '"] .svatek--bunka';
      await pravym(page, svSel);
      const nSv = await nabidkaPolozky(page);
      jistota(new RegExp('^Přání přes WhatsApp\\|Přání přes SMS / iMessage\\|Kopírovat přání\\|Přidat do oblíbených: ' + sv.jmeno + '\\|Nová událost v tento den').test(nSv), 'nabídka svátku: ' + nSv);
      const [wa] = await Promise.all([ctx.waitForEvent('page'), page.click('.nabidka [data-nabidka-i] span:text-is("Přání přes WhatsApp")')]);
      await wa.waitForURL(/wa\.me/);
      jistota(/^https:\/\/wa\.me\/\?text=V%C5%A1echno%20nejlep%C5%A1%C3%AD/.test(wa.url()), 'WhatsApp: ' + wa.url());
      await wa.close();
      jistota(page.url() === WEB || page.url().indexOf(WEB) === 0, 'aplikace zůstala na místě');
      await pravym(page, svSel);
      await vyberZNabidky(page, 'Přidat do oblíbených: ' + sv.jmeno);
      await cekej(() => jmeninyOblibeni.some((o) => o.jmeno === sv.jmeno), 3000, 'oblíbený do motoru');
      await page.waitForSelector('#p-kalendar .mesic-den[data-den="' + sv.den + '"].svatek-oblibeny');
      await pravym(page, '#p-kalendar .mesic-den[data-den="' + sv.den + '"] .cip-svatek');
      jistota(new RegExp('Odebrat z oblíbených: ' + sv.jmeno).test(await nabidkaPolozky(page)), 'u oblíbeného Odebrat: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Odebrat z oblíbených: ' + sv.jmeno);
      await cekej(() => !jmeninyOblibeni.length, 3000, 'odebrání');
      // vyjeté karty myší: událost (čas od–do, kalendář) a den (co v něm je)
      let k = await najetNaKartu(page, pozdni, 'udalost');
      jistota(/23:00–23:30/.test(k) && /Pozdní hovor/.test(k) && /30 min/.test(k) && /Osobní/.test(k) && /Upravit/.test(k) && /Otevřít/.test(k), 'karta události: ' + k);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_kalendar_karta_udalosti.png') });
      k = await najetNaKartu(page, dnesBunka + ' .mesic-cislo', 'den');
      jistota(/2 události/.test(k) && /9:00\s?Porada/.test(k) && /23:00\s?Pozdní hovor/.test(k), 'karta dne: ' + k);
      // klávesnice: Shift+F10 na události otevře nabídku s fokusem na první položce, Esc ji zavře a vrátí fokus
      await page.mouse.move(2, 2);
      await page.focus(pozdni);
      await page.keyboard.press('Shift+F10');
      await page.waitForSelector('.nabidka.videt');
      jistota(await page.evaluate(() => document.activeElement && document.activeElement.closest('.nabidka') && document.activeElement.textContent === 'Otevřít'), 'fokus v nabídce');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="nazev"]');
      jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="nazev"]') === 'Pozdní hovor', 'Upravit z klávesnice');
      await page.keyboard.press('Escape');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      jmeninyOblibeni = [];
      await ctx.close();
    }
  });

  await test('nabídky: Přehled – týden (událost, den: Otevřít v Kalendáři), karta Přehledu (Otevřít, Obnovit jen tuto část), karta události v týdnu (PC)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-tyden .agenda__u[data-udalost^="u4|"]');
      await pravym(page, '#dl-tyden .agenda__u[data-udalost^="u4|"]');
      jistota(/^Otevřít\|Upravit\|Duplikovat na zítra/.test(await nabidkaPolozky(page)), 'událost v týdnu: ' + await nabidkaPolozky(page));
      await page.keyboard.press('Escape');
      await page.waitForSelector('.nabidka', { state: 'detached' });
      const k = await najetNaKartu(page, '#dl-tyden .agenda__u[data-udalost^="u4|"]', 'udalost');
      jistota(/Schůzka/.test(k) && /10:00–11:00/.test(k), 'karta události na Přehledu: ' + k);
      await page.mouse.move(2, 2);
      await pravym(page, '#dl-tyden [data-skoc-den="' + den(2) + '"] b');
      const n = await nabidkaPolozky(page);
      jistota(/^Nová událost v tento den\|Nový zápas v tento den\|Otevřít v Kalendáři/.test(n), 'den v týdnu: ' + n);
      await vyberZNabidky(page, 'Otevřít v Kalendáři');
      await cekejVeStrance(page, (t) => import('/js/stav.js').then((m) => m.stav.pohled === 'kalendar' && m.stav.kal.vybrany === t), den(2));
      // karta Přehledu: Otevřít a Obnovit jen tuto část (tady kalendář z motoru)
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('#dl-tyden .card-hlava');
      await pravym(page, '#dl-tyden .card-hlava');
      jistota(await nabidkaPolozky(page) === 'Otevřít Kalendář|Obnovit jen kalendář', 'karta Týden: ' + await nabidkaPolozky(page));
      const pred = volano.length;
      await vyberZNabidky(page, 'Obnovit jen kalendář');
      await cekej(() => volano.slice(pred).some((d) => d.akce === 'kalendar' && d.znovu === true), 3000, 'obnova kalendáře');
      jistota(!volano.slice(pred).some((d) => d.akce === 'posta' || d.akce === 'schranka'), 'obnovilo se jen to: ' + volano.slice(pred).map((d) => d.akce).join());
      await pravym(page, '#dnes-kpi [data-pocasi]');
      jistota(await nabidkaPolozky(page) === 'Celá předpověď|Obnovit jen počasí', 'dlaždice počasí: ' + await nabidkaPolozky(page));
      await page.keyboard.press('Escape');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  await test('nabídky: Fotbal – zápas (Kopírovat výsledek, Rozbalit detail, Plakát k zápasu, Přidat do kalendáře), tabulka (Kopírovat řádek); karty výsledku, dalšího zápasu a řádku tabulky (PC)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    try {
      await page.goto(WEB);
      await page.waitForSelector('#dl-fotbal .fotbal-dalsi[data-zapas-id="A2"]');
      // další zápas na Přehledu: odpočet a místo v kartě; nabídka s Přidat do kalendáře a navigací (venku)
      let k = await najetNaKartu(page, '#dl-fotbal .fotbal-dalsi[data-zapas-id="A2"]', 'zapas');
      jistota(/A-tým/.test(k) && /za 2 dny/.test(k) && /FK Šardice – FK Agro Vnorovy/.test(k) && /venku/.test(k) && /výkop 15:00/.test(k), 'karta dalšího zápasu: ' + k);
      await page.mouse.move(2, 2);
      await pravym(page, '#dl-fotbal .fotbal-dalsi[data-zapas-id="A2"]');
      jistota(await nabidkaPolozky(page) === 'Tabulka a zápasy A-tým|Kopírovat|Plakát k zápasu|Přidat do kalendáře…|Navigovat – Mapy Google', 'nabídka dalšího zápasu: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Přidat do kalendáře…');
      await page.waitForSelector('[data-panel="udalost-formular"] [data-uf="nazev"]');
      jistota(await page.inputValue('[data-panel="udalost-formular"] [data-uf="nazev"]') === '⚽ Šardice – Vnorovy (A-tým)' &&
        await page.inputValue('[data-panel="udalost-formular"] [data-uf="od"]') === '15:00', 'zápas do kalendáře předvyplněný: ' + await page.inputValue('[data-panel="udalost-formular"] [data-uf="nazev"]'));
      await page.click('[data-panel="udalost-formular"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="udalost-formular"]'));
      // Plakát k zápasu: stránka Plakáty na víkendu toho zápasu
      await pravym(page, '#dl-fotbal .fotbal-dalsi[data-zapas-id="A2"]');
      await vyberZNabidky(page, 'Plakát k zápasu');
      const t = den(2, 15), vikend = iso(new Date(den(2)).setDate(new Date(den(2)).getDate() + [-1, -2, -3, -4, -5, 1, 0][new Date(t).getDay()]));
      await page.waitForSelector('#p-plakaty:not([hidden]) [data-pl-vyber]');
      jistota(await page.inputValue('#p-plakaty [data-pl-vyber]') === vikend, 'víkend plakátu: ' + await page.inputValue('#p-plakaty [data-pl-vyber]') + ' × ' + vikend);
      // stránka Fotbal: výsledek – karta se střelci a poločasem, nabídka Kopírovat výsledek a Rozbalit detail
      await page.click('#rail [data-cil="fotbal"]');
      await page.waitForSelector('#p-fotbal [data-zapas-id="A-6"] .zapas-hlava');
      k = await najetNaKartu(page, '#p-fotbal [data-zapas-id="A-6"] .zapas-hlava', 'zapas');
      jistota(/1:3 prohra/.test(k) && /Poločas\s?0:2/.test(k) && /Diváků\s?160/.test(k) && /Horák P\./.test(k) && /Svoboda T\./.test(k) && /Dvořák M\./.test(k), 'karta výsledku: ' + k);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_fotbal_karta_vysledku.png') });
      await page.mouse.move(2, 2);
      await pravym(page, '#p-fotbal [data-zapas-id="A-6"] .zapas-hlava');
      jistota(await nabidkaPolozky(page) === 'Rozbalit detail|Kopírovat výsledek|Plakát k zápasu', 'nabídka výsledku: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Kopírovat výsledek');
      jistota(await schrankaText(page) === 'Vnorovy – Lysovice 1:3', 'zkopírovaný výsledek: ' + await schrankaText(page));
      await pravym(page, '#p-fotbal [data-zapas-id="A-6"] .zapas-hlava');
      await vyberZNabidky(page, 'Rozbalit detail');
      await page.waitForSelector('#p-fotbal .zapas-radek.otevreny[data-zapas-id="A-6"] .zapas-detail');
      // tabulka: řádek soupeře (zápasy s námi), náš řádek (forma), Kopírovat řádek
      k = await najetNaKartu(page, '#p-fotbal tr[data-tab-klub="FK Šardice"]', 'tabulka');
      jistota(/1\. místo/.test(k) && /FK Šardice/.test(k) && /25 b/.test(k) && /S námi/.test(k) && /venku/.test(k), 'karta soupeře: ' + k);
      k = await najetNaKartu(page, '#p-fotbal tr[data-tab-klub="FK Agro Vnorovy"]', 'tabulka');
      jistota(/2\. místo/.test(k) && /Doma\s?3–0–1/.test(k) && /Forma/.test(k) && await page.locator('#bublina-karta .bk-forma--P').count() === 1, 'karta našeho řádku: ' + k);
      await page.mouse.move(2, 2);
      await pravym(page, '#p-fotbal tr[data-tab-klub="FK Agro Vnorovy"]');
      await vyberZNabidky(page, 'Kopírovat řádek');
      jistota(await schrankaText(page) === '2. Vnorovy · 10 b · 3–1–5 · 16:20', 'řádek tabulky: ' + await schrankaText(page));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  await test('nabídky: Zdraví – doplněk (Odškrtnout včera s Vrátit, všechny hlavní), jídlo (Zopakovat dnes, Kopírovat), den v týdnu Pití (+0,5 l), váha (Smazat); karty doplňku a váhy, týden v kroužcích (PC)', async () => {
    const dnesIso = iso(ted), vceraIso = iso(den(-1));
    Object.keys(doplnkyDny).forEach((x) => delete doplnkyDny[x]); // odškrtnutí z dřívějších testů pryč
    pitiDny[dnesIso] = { piti: [], jidlo: [{ id: 'j-test', kdy: den(0, 8), co: 'Kuře s rýží', bilkoviny: 40, kcal: 600 }] };
    vahaZaznamy = [{ kdy: den(-2, 7), kg: 80.4 }, { kdy: den(-1, 7), kg: 80.1 }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="zdravi"]');
      const kreatin = '#p-zdravi .zd-doplnky [data-doplnek="kreatin"]';
      await page.waitForSelector(kreatin);
      // doplněk: nabídka a Odškrtnout včera (karta ukazuje dnešek – oznámení s Vrátit)
      await pravym(page, kreatin);
      jistota(await nabidkaPolozky(page) === 'Odškrtnout dnes|Odškrtnout včera|Odškrtnout všechny hlavní (2)', 'nabídka doplňku: ' + await nabidkaPolozky(page));
      const predD = doplnkyVolani.length;
      await vyberZNabidky(page, 'Odškrtnout včera');
      await cekej(() => doplnkyVolani.slice(predD).some((x) => x.den === vceraIso && x.zmeny.kreatin === true), 4000, 'včera do motoru');
      jistota(/✓ včera: Kreatin/.test(await page.textContent('#toast')) && await page.getAttribute(kreatin, 'aria-pressed') === 'false', 'oznámení, dnešek beze změny');
      await page.click('#toast .toast__akce');
      await cekej(() => doplnkyVolani.slice(predD).some((x) => x.den === vceraIso && x.zmeny.kreatin === false), 4000, 'Vrátit');
      // všechny hlavní na dnešek jedním dotazem
      await pravym(page, kreatin);
      await vyberZNabidky(page, 'Odškrtnout všechny hlavní (2)');
      await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'true' &&
        document.querySelector('#p-zdravi .zd-doplnky [data-doplnek="horcik"]').getAttribute('aria-pressed') === 'true', kreatin);
      await cekej(() => doplnkyVolani.some((x) => x.den === dnesIso && x.zmeny.kreatin === true && x.zmeny.horcik === true), 4000, 'oba jedním dotazem');
      // karta doplňku (myš): dávka, kdy, týden po dnech
      let k = await najetNaKartu(page, kreatin, 'doplnek');
      jistota(/Kreatin/.test(k) && /Ráno · 5 g/.test(k) && /✓ vzato/.test(k) && /Tento týden/.test(k) && await page.locator('#bublina-karta .bk-den').count() === 7, 'karta doplňku: ' + k);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_zdravi_karta_doplnku.png') });
      // jídlo: Zopakovat dnes, Kopírovat
      await page.mouse.move(2, 2);
      await pravym(page, '#p-zdravi [data-jidlo-zapis="j-test"]');
      jistota(await nabidkaPolozky(page) === 'Zopakovat dnes|Upřesnit pro Clauda…|Přesunout na jiný den…|Kopírovat|Smazat', 'nabídka jídla: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Kopírovat');
      jistota(await schrankaText(page) === 'Kuře s rýží · 40 g bílkovin · 600 kcal', 'jídlo do schránky: ' + await schrankaText(page));
      let predP = pitiVolani.length;
      await pravym(page, '#p-zdravi [data-jidlo-zapis="j-test"]');
      await vyberZNabidky(page, 'Zopakovat dnes');
      await cekej(() => pitiVolani.slice(predP).some((x) => x.jak === 'jidlo' && x.den === dnesIso && x.co === 'Kuře s rýží' && x.bilkoviny === 40), 3000, 'zopakované jídlo');
      await page.waitForFunction(() => document.querySelectorAll('#p-zdravi .piti__jidla li').length === 2);
      // den v týdnu Pití a jídlo: voda k tomu dni
      predP = pitiVolani.length;
      await pravym(page, '#p-zdravi .piti__tyden [data-piti-ukaz="' + dnesIso + '"]');
      jistota(await nabidkaPolozky(page) === 'Ukázat dnes|+0,25 l vody|+0,5 l vody|Jídlo na tento den…', 'nabídka dne pití: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, '+0,5 l vody');
      await cekej(() => pitiVolani.slice(predP).some((x) => x.jak === 'piti' && x.ml === 500 && x.den === dnesIso), 3000, 'voda do motoru');
      // váha: karta s rozdílem, Smazat s potvrzením
      k = await najetNaKartu(page, '#p-zdravi [data-vaha-kdy="' + den(-1, 7) + '"]', 'vaha');
      jistota(/80,1 kg/.test(k) && /ráno/.test(k) && /−0,3 kg proti/.test(k), 'karta váhy: ' + k);
      await page.mouse.move(2, 2);
      await pravym(page, '#p-zdravi [data-vaha-kdy="' + den(-1, 7) + '"]');
      jistota(await nabidkaPolozky(page) === 'Kopírovat|Smazat zápis', 'nabídka váhy: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Smazat zápis');
      await page.click('.okno-pozadi.videt [data-okno="ano"]');
      await cekej(() => vahaZaznamy.length === 1, 3000, 'smazaná váha');
      // týden v kroužcích: dnešek s kartou (stejná jako na Přehledu) a tlačítkem na Pití a jídlo
      await page.waitForSelector('#p-zdravi .zd-krouzky .tk-den--dnes .tk-den__kruh');
      jistota(await page.locator('#p-zdravi .zd-krouzky .tk-den').count() === 7, '7 dní');
      k = await najetNaKartu(page, '#p-zdravi .zd-krouzky .tk-den--dnes .tk-den__kruh', 'krouzky-den');
      jistota(/Denní kroužky · dnes/.test(k) && /Voda/.test(k) && /0,5 \/ 2,5 l/.test(k) && /Bílkoviny/.test(k) && /Pití a jídlo dnes/.test(k), 'karta dne v kroužcích: ' + k);
      await page.locator('#p-zdravi .zd-krouzky').screenshot({ path: path.join(VYSTUP, 'pc_zdravi_tyden_krouzku.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      delete pitiDny[dnesIso];
      Object.keys(doplnkyDny).forEach((x) => delete doplnkyDny[x]);
      vahaZaznamy = [];
      await ctx.close();
    }
  });

  await test('nabídky: Auto – zápis (Zopakovat tankování, Fotka účtenky, Kopírovat, Smazat jen u posledního); karta tankování se spotřebou od minula (PC)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="auto"]');
      const radek = '.auto-zapisy [data-auto-zapis-id="tankovani:4"]';
      await page.waitForSelector(radek);
      // starší tankování s účtenkou: bez Smazat (motor smí jen poslední zápis)
      await pravym(page, radek);
      jistota(await nabidkaPolozky(page) === 'Upravit|Zopakovat tankování|Fotka účtenky|Kopírovat', 'nabídka zápisu: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Kopírovat');
      jistota(/^Tankování \d+\. \d+\. \d{4} · 1 000 Kč · 25,0 l · 40,00 Kč\/l · 11 500 km · Pumpa Test$/.test(await schrankaText(page)), 'zápis do schránky: ' + await schrankaText(page));
      const predF = autoFotky.length;
      await pravym(page, radek);
      await vyberZNabidky(page, 'Fotka účtenky');
      await page.waitForSelector('[data-panel="auto-foto"] img');
      jistota(autoFotky[predF] === 'uctenka-starsi-001', 'fotka z Disku');
      await page.click('[data-panel="auto-foto"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="auto-foto"]'));
      // Zopakovat: nové tankování se stejnou cenou za litr a stanicí
      await pravym(page, radek);
      await vyberZNabidky(page, 'Zopakovat tankování');
      await page.waitForSelector('[data-panel="auto-zapis"] [data-az="cenaLitr"]');
      jistota(await page.inputValue('[data-panel="auto-zapis"] [data-az="cenaLitr"]') === '40' && await page.inputValue('[data-panel="auto-zapis"] [data-az="poznamka"]') === 'Pumpa Test' &&
        await page.inputValue('[data-panel="auto-zapis"] [data-az="castka"]') === '' && await page.inputValue('[data-panel="auto-zapis"] [data-az="datum"]') === iso(ted), 'předvyplněné tankování');
      await page.click('[data-panel="auto-zapis"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="auto-zapis"]'));
      // poslední zápis listu má Smazat
      const posledni = await page.$eval('.auto-zapisy', () => {
        const r = Array.from(document.querySelectorAll('.auto-zapisy [data-auto-zapis-id^="tankovani:"]')).map((x) => Number(x.dataset.autoZapisId.split(':')[1]));
        return Math.max.apply(null, r);
      });
      await pravym(page, '.auto-zapisy [data-auto-zapis-id="tankovani:' + posledni + '"]');
      jistota(/\|Smazat \(poslední zápis\)$/.test(await nabidkaPolozky(page)), 'u posledního Smazat: ' + await nabidkaPolozky(page));
      await page.keyboard.press('Escape');
      // karta tankování: litry, Kč/l, ujeto a spotřeba od minulého tankování se známým km
      const k = await najetNaKartu(page, radek + ' .auto-zapis__hlavni', 'auto-zapis');
      jistota(/25,0 l/.test(k) && /1 000 Kč · 40,00 Kč\/l/.test(k) && /Ujeto\s?700\s?km/.test(k) && /Spotřeba\s?3,6\s?l\/100/.test(k) && /Na km\s?1,43/.test(k), 'karta tankování: ' + k);
      await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_karta_tankovani.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  // Michal 15. 10.: „přezouvat budu v pondělí … mám to i v kalendáři. A připravit auto na zimu … připomenout v půlce
  // listopadu“ → připomínka auta: Odložit na zítra / na týden / do…, Hotovo, Zrušit odložení; termín v kalendáři = naplánováno
  const DNY_T = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
  const denTydneT = (t) => DNY_T[new Date(t).getDay()] + ' ' + new Date(t).getDate() + '. ' + (new Date(t).getMonth() + 1) + '.';
  const pripominkyZaloha = () => JSON.parse(JSON.stringify({ pripominky: autoData.pripominky, odlozene: autoData.odlozene }));
  const radekPrip = (klic) => '.auto-resit > .auto-resit__seznam [data-auto-pripominka="' + klic + '"]';

  await test('Auto: připomínky – naplánováno z kalendáře (šedě, s dnem), pravé tlačítko Odložit na týden / do… / Hotovo, sekce Odložené, Zrušit odložení, Vrátit, vypršelé odložení zpět; Přehled bez odložených a naplánovaných (PC)', async () => {
    const zaloha = pripominkyZaloha();
    // odložení, které vypršelo dnes (data z motoru jsou starší) – aplikace ho sama vrátí mezi ostatní
    autoData.odlozene = [{ id: 'olej', klic: 'olej-t', nazev: 'Servis – výměna oleje', text: 'Podle auta za 1 200 km – objednej servis.', od: den(0), do: den(0),
      stav: 'odlozeno', stavPak: 'ted', odlozeno: iso(den(0)), odlozenoDo: den(0), hotovo: false }];
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="auto"]');
      await page.waitForSelector(radekPrip('stk-t'));
      // naplánovaná STK: šedá, „naplánováno – po 19. 10.“ a co je v kalendáři
      jistota(await page.getAttribute(radekPrip('stk-t'), 'class').then((c) => /auto-resit--naplanovano/.test(c)), 'STK naplánovaná');
      const stk = (await page.textContent(radekPrip('stk-t'))).replace(/\s+/g, ' ');
      jistota(stk.indexOf('naplánováno – ' + denTydneT(den(4))) >= 0 && /V kalendáři: STK Hodonín/.test(stk), 'naplánovaná STK: ' + stk);
      // vypršelé odložení oleje je zpátky (teď), v Odložených nic
      jistota(/teď/.test(await page.textContent(radekPrip('olej-t'))) && !(await page.locator('.auto-odlozene').count()), 'vypršelé odložení zpět');
      // pravé tlačítko na přezutí → Odložit na týden: hned pryč z Co řešit, v Odložených (sbalené), motor dostal datum
      await pravym(page, radekPrip('pneu-zimni-t'));
      jistota(await nabidkaPolozky(page) === 'Odložit na zítra|Odložit na týden|Odložit do…|Hotovo', 'nabídka připomínky: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Odložit na týden');
      await page.waitForFunction(() => !document.querySelector('.auto-resit > .auto-resit__seznam [data-auto-pripominka="pneu-zimni-t"]'));
      await page.waitForFunction(() => /Odloženo do/.test(document.getElementById('toast').textContent));
      jistota(JSON.stringify(autoOdlozeni[autoOdlozeni.length - 1]) === JSON.stringify({ pripominka: 'pneu-zimni-t', do: iso(den(7)) }), 'motor: ' + JSON.stringify(autoOdlozeni));
      jistota((await page.textContent('.auto-odlozene__prepni')).replace(/\s+/g, ' ').trim() === 'Odložené1' ||
        /Odložené\s*1/.test(await page.textContent('.auto-odlozene__prepni')), 'počet odložených');
      jistota(!(await page.locator('.auto-odlozene__seznam').count()), 'Odložené sbalené');
      await page.click('.auto-odlozene__prepni');
      await page.waitForSelector('.auto-odlozene__seznam [data-auto-pripominka="pneu-zimni-t"]');
      jistota((await page.textContent('.auto-odlozene__seznam [data-auto-pripominka="pneu-zimni-t"]')).indexOf('odloženo do ' + denTydneT(den(7))) >= 0, 'odloženo do dne');
      await page.screenshot({ path: path.join(VYSTUP, 'pc_auto_pripominky_odlozene.png') });
      // odložená: Zrušit odložení je první → zpátky v Co řešit
      await pravym(page, '.auto-odlozene__seznam [data-auto-pripominka="pneu-zimni-t"]');
      jistota(/^Zrušit odložení\|Odložit na zítra\|Odložit na týden\|Odložit do…\|Hotovo$/.test(await nabidkaPolozky(page)), 'nabídka odložené: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Zrušit odložení');
      await page.waitForSelector(radekPrip('pneu-zimni-t'));
      jistota(autoOdlozeni[autoOdlozeni.length - 1].do === null && !(await page.locator('.auto-odlozene').count()), 'zrušené odložení: ' + JSON.stringify(autoOdlozeni));
      // ⋯ u pojištění → Odložit do… (okno s dnem) → motor dostane vybraný den
      await page.hover(radekPrip('poj-t'));
      await page.click(radekPrip('poj-t') + ' .auto-resit__vic');
      await page.waitForSelector('.nabidka.videt [data-nabidka-i]');
      await vyberZNabidky(page, 'Odložit do…');
      await page.waitForSelector('.okno input[type="date"]');
      jistota(await page.inputValue('.okno input[type="date"]') === iso(den(7)), 'návrh dne: za týden');
      await page.fill('.okno input[type="date"]', iso(den(30)));
      await page.click('.okno [data-okno="ano"]');
      await page.waitForFunction(() => !document.querySelector('.auto-resit > .auto-resit__seznam [data-auto-pripominka="poj-t"]'));
      jistota(JSON.stringify(autoOdlozeni[autoOdlozeni.length - 1]) === JSON.stringify({ pripominka: 'poj-t', do: iso(den(30)) }), 'odložit do: ' + JSON.stringify(autoOdlozeni));
      // Vrátit v hlášce → zpátky (motor dostal null)
      await page.click('#toast .toast__akce');
      await page.waitForSelector(radekPrip('poj-t'));
      jistota(autoOdlozeni[autoOdlozeni.length - 1].pripominka === 'poj-t' && autoOdlozeni[autoOdlozeni.length - 1].do === null, 'Vrátit: ' + JSON.stringify(autoOdlozeni));
      // Přehled: přezutí a vypršelý olej ano, naplánovaná STK ne; Hotovo z pravého tlačítka → pryč
      await page.click('#rail [data-cil="dnes"]');
      await page.waitForSelector('.auto-dnes');
      const naDnes = await page.$$eval('.auto-dnes', (s) => s.map((x) => x.dataset.autoPripominka).sort().join(','));
      jistota(naDnes === 'olej-t,pneu-zimni-t', 'na Přehledu: ' + naDnes);
      await pravym(page, '.auto-dnes[data-auto-pripominka="pneu-zimni-t"]');
      jistota(/Odložit na zítra.*\|Hotovo$/.test(await nabidkaPolozky(page)), 'nabídka na Přehledu: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Hotovo');
      await page.waitForFunction(() => !document.querySelector('.auto-dnes[data-auto-pripominka="pneu-zimni-t"]'));
      jistota(JSON.stringify(autoOdlozeni[autoOdlozeni.length - 1]) === JSON.stringify({ pripominka: 'pneu-zimni-t', do: 'hotovo' }), 'hotovo: ' + JSON.stringify(autoOdlozeni));
      await page.screenshot({ path: path.join(VYSTUP, 'pc_dnes_auto_po_hotovo.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.assign(autoData, zaloha);
      await ctx.close();
    }
  });

  await test('Auto: připomínka na telefonu – podržení i ⋯ na Přehledu = nabídka (Odložit…), Odložit na týden zmizí z Vyžaduje pozornost, stránka Auto s ⋯ nepřetéká', async () => {
    const zaloha = pripominkyZaloha();
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    try {
      await page.goto(WEB);
      // data auta se načtou se stránkou Auto (Přehled pak bere naposledy načtená)
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="auto"]');
      await page.waitForSelector('.auto-resit');
      await page.click('#lista [data-cil="dnes"]');
      const karta = '.pozor-auto[data-auto-pripominka="pneu-zimni-t"]';
      await page.waitForSelector(karta);
      await page.locator(karta).scrollIntoViewIfNeeded();
      // podržení prstem na kartě připomínky
      await page.$eval(karta + ' .pozor', (b) => {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.x + 20, clientY: r.y + 10 }));
      });
      await page.waitForSelector('.nabidka.videt [data-nabidka-i]');
      await page.$eval(karta + ' .pozor', (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })));
      jistota(await nabidkaPolozky(page) === 'Odložit na zítra|Odložit na týden|Odložit do…|Hotovo', 'podržení: ' + await nabidkaPolozky(page));
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_dnes_auto_nabidka.png') });
      await page.keyboard.press('Escape');
      await page.waitForSelector('.nabidka', { state: 'detached' });
      await page.waitForTimeout(1600); // klepnutí hned po podržení nabidka.js zahodí
      // ⋯ v rohu karty
      await page.locator(karta + ' .auto-resit__vic').tap();
      await page.waitForSelector('.nabidka.videt [data-nabidka-i]');
      await vyberZNabidky(page, 'Odložit na týden');
      await page.waitForFunction((s) => !document.querySelector(s), karta);
      jistota(JSON.stringify(autoOdlozeni[autoOdlozeni.length - 1]) === JSON.stringify({ pripominka: 'pneu-zimni-t', do: iso(den(7)) }), 'motor: ' + JSON.stringify(autoOdlozeni));
      // stránka Auto: Co řešit s ⋯ a Odložené – nic nepřetéká
      await page.click('.hlava-ja [data-menu]');
      await page.click('[data-panel="menu"] [data-menu-cil="auto"]');
      await page.waitForSelector('.auto-resit .auto-odlozene__prepni');
      await page.click('.auto-odlozene__prepni');
      await page.waitForSelector('.auto-odlozene__seznam');
      const prekryv = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      jistota(prekryv <= 0, 'stránka Auto přetéká o ' + prekryv + ' px');
      const kdy = await page.$$eval('.auto-resit .auto-resit__kdy', (s) => s.map((x) => { const r = x.getBoundingClientRect(); return r.right <= window.innerWidth; }));
      jistota(kdy.every(Boolean), 'termíny připomínek celé na obrazovce');
      await page.locator('.auto-resit').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_auto_pripominky.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      Object.assign(autoData, zaloha);
      await ctx.close();
    }
  });

  await test('nabídky: Reely a Plakáty – reel (Kopírovat popisek, Označit zveřejněno, Zveřejnit teď s dotazem), karta stavu na Instagramu, plakát (Kopírovat popisek, Stáhnout obrázek) (PC)', async () => {
    reelyPlan.reel_dorost_tesany = { kdy: ted + 3 * H, stav: 'ceka', pribeh: true, oznacit: [] };
    const vikend = vychoziVikendTestu();
    plakatyData.popisky[vikend] = { text: 'Víkend doma! ⚽', zdroj: 'claude' };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="reely"]');
      const reel = '#p-reely [data-reel="reel_dorost_tesany"]';
      await page.waitForSelector(reel + ' .reel__nazev');
      await pravym(page, reel + ' .reel__nazev');
      jistota(await nabidkaPolozky(page) === 'Kopírovat popisek|Popisek a Instagram…|Přehrát video|Zveřejnit teď|Zrušit plán|Označit jako zveřejněné', 'nabídka naplánovaného reelu: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Zveřejnit teď');
      await page.waitForSelector('.okno-pozadi.videt [data-okno="ne"]');
      jistota(/Zveřejnit hned/.test(await page.textContent('.okno')), 'dotaz Zveřejnit teď');
      await page.click('.okno-pozadi [data-okno="ne"]');
      await page.waitForSelector('.okno-pozadi', { state: 'detached' });
      // stav na Instagramu: karta s kroky
      const k = await najetNaKartu(page, reel + ' .tag--plan[data-karta="ig"]', 'ig');
      jistota(/Naplánováno/.test(k) && /Vnorovy – Těšany 3:1/.test(k) && /@klub_test/.test(k), 'karta stavu: ' + k);
      await page.mouse.move(2, 2);
      await pravym(page, reel + ' .reel__nazev');
      await vyberZNabidky(page, 'Kopírovat popisek');
      jistota(/^Hattrick!/.test(await schrankaText(page)), 'popisek reelu: ' + await schrankaText(page));
      await pravym(page, reel + ' .reel__nazev');
      await vyberZNabidky(page, 'Označit jako zveřejněné');
      await cekej(() => !!reelyZverejneno.reel_dorost_tesany, 3000, 'zveřejněno do motoru');
      // text popisku (pole v okně detailu): nabídka prohlížeče (označit a kopírovat ručně)
      await page.evaluate(() => import('/js/reely.js').then((m) => m.otevriDetail('reel_dorost_tesany')));
      await page.click('[data-panel="reel-detail"] [data-reel-popisek]', { button: 'right' });
      await page.waitForTimeout(200);
      jistota(!(await page.locator('.nabidka').count()), 'v textu popisku nabídka prohlížeče');
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-panel="reel-detail"]', { state: 'detached' });
      // plakát: nabídka na náhledu
      await page.click('#rail [data-cil="plakaty"]');
      await page.waitForSelector('#p-plakaty .plakat-stage .poster');
      await pravym(page, '#p-plakaty .plakat-nahled');
      jistota(/^Stáhnout obrázek\|Vytisknout \/ PDF\|Kopírovat popisek\|Zveřejnit teď…\|Naplánovat na Instagram…\|Popisek od Clauda/.test(await nabidkaPolozky(page)), 'nabídka plakátu: ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Kopírovat popisek');
      jistota(await schrankaText(page) === 'Víkend doma! ⚽', 'popisek plakátu: ' + await schrankaText(page));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      delete reelyPlan.reel_dorost_tesany;
      delete reelyZverejneno.reel_dorost_tesany;
      delete plakatyData.popisky[vikend];
      await ctx.close();
    }
  });

  await test('nabídky na dotyku: podržení doplňku a události = nabídka, klepnutí dál odškrtne / otevře (karta jen myší); týden v kroužcích – klepnutí ukáže kartu dne (telefon)', async () => {
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]);
    const podrz = async (sel) => {
      await page.$eval(sel, (b) => {
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: r.x + 20, clientY: r.y + 10 }));
      });
      await page.waitForSelector('.nabidka.videt [data-nabidka-i]');
      await page.$eval(sel, (b) => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true })));
    };
    try {
      await page.goto(WEB);
      await pripraveno(page);
      await page.click('.hlava-ja [data-cil="zdravi"]');
      const kreatin = '#p-zdravi .zd-doplnky [data-doplnek="kreatin"]';
      await page.waitForSelector(kreatin);
      await page.locator(kreatin).scrollIntoViewIfNeeded();
      await podrz(kreatin);
      jistota(/^Odškrtnout dnes\|Odškrtnout včera/.test(await nabidkaPolozky(page)), 'podržení doplňku: ' + await nabidkaPolozky(page));
      jistota(await page.getAttribute(kreatin, 'aria-pressed') === 'false', 'podržení neodškrtlo');
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_zdravi_nabidka_doplnku.png') });
      await page.keyboard.press('Escape');
      await page.waitForSelector('.nabidka', { state: 'detached' });
      await page.waitForTimeout(1600); // klepnutí hned po podržení nabidka.js zahodí (prohlížeč ho posílá sám)
      await page.tap(kreatin);
      await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'true', kreatin);
      jistota(!(await page.locator('#bublina-karta.videt').count()), 'klepnutí na doplněk kartu neukazuje');
      await page.tap(kreatin); // zpět
      await page.waitForFunction((s) => document.querySelector(s).getAttribute('aria-pressed') === 'false', kreatin);
      // týden v kroužcích: klepnutí ukáže kartu dne, klepnutí jinam ji zavře
      const dnes = '#p-zdravi .zd-krouzky .tk-den--dnes .tk-den__kruh';
      await page.locator(dnes).scrollIntoViewIfNeeded();
      await page.tap(dnes);
      await page.waitForSelector('#bublina-karta.videt[data-druh="krouzky-den"]');
      const k = await textVyjeteKarty(page);
      jistota(/Denní kroužky · dnes/.test(k), 'karta dne na dotyku: ' + k);
      await page.screenshot({ path: path.join(VYSTUP, 'telefon_zdravi_karta_krouzku.png') });
      await page.tap('#p-zdravi .zd-krouzky .card-hlava');
      await page.waitForFunction(() => !document.querySelector('#bublina-karta.videt'));
      // Kalendář: podržení události = nabídka, klepnutí otevře detail (ne kartu)
      await page.evaluate(() => import('/js/stav.js').then((m) => { m.prejdi('kalendar'); m.zmeneno(); }));
      await page.click('[data-kal-pohled="seznam"]');
      const ud = '#p-kalendar [data-udalost^="u4|"]';
      await page.waitForSelector(ud);
      await podrz(ud);
      jistota(/^Otevřít\|Upravit\|Duplikovat na zítra/.test(await nabidkaPolozky(page)), 'podržení události: ' + await nabidkaPolozky(page));
      jistota(!(await page.locator('[data-panel="udalost"]').count()), 'podržení detail neotevřelo');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.nabidka', { state: 'detached' });
      await page.waitForTimeout(1600);
      await page.tap(ud);
      await page.waitForSelector('[data-panel="udalost"]');
      jistota(!(await page.locator('#bublina-karta.videt').count()), 'klepnutí na událost kartu neukazuje');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      await ctx.close();
    }
  });

  await test('pošta: nabídka – Přeposlat (Fwd:, prázdné Komu), Odpovědět všem jen u zprávy pro víc lidí, Kopírovat adresu a Nový e-mail odesílateli z načteného detailu (PC)', async () => {
    vlaknoV2Kopie = 'Kolega <kolega@firma.test>';
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB.replace(/\/$/, '') });
    try {
      await page.goto(WEB);
      await page.click('#rail [data-cil="posta"]');
      await page.waitForSelector('#posta-seznam [data-vlakno="v1"]');
      // přednačtené detaily (adresy) – pak je nabídka úplná
      await cekejVeStrance(page, () => import('/js/stav.js').then((m) => !!(m.stav.vlakna.v1 && m.stav.vlakna.v1.data && m.stav.vlakna.v2 && m.stav.vlakna.v2.data)), null, 8000);
      await pravym(page, '#posta-seznam [data-vlakno="v1"]');
      const n1 = await nabidkaPolozky(page);
      jistota(/\|Odpovědět\|Přeposlat\|Nový e-mail odesílateli\|Kopírovat adresu\|Vybrat\|/.test(n1) && !/Odpovědět všem/.test(n1), 'nabídka (jen mně): ' + n1);
      await vyberZNabidky(page, 'Přeposlat');
      await page.waitForSelector('[data-panel="psani"] [data-psani-komu]');
      jistota(/Přeposlat/.test(await page.textContent('[data-panel="psani"] .panel-titul')) && /Fwd: Sraz v sobotu/.test(await page.textContent('[data-panel="psani"]')) &&
        await page.inputValue('[data-panel="psani"] [data-psani-komu]') === '', 'psaní přeposlání');
      await page.click('[data-panel="psani"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="psani"]'));
      // zpráva i pro dalšího (kopie): Odpovědět všem; Kopírovat adresu odesílatele
      await pravym(page, '#posta-seznam [data-vlakno="v2"]');
      jistota(/\|Odpovědět\|Odpovědět všem\|Přeposlat\|Nový e-mail odesílateli\|Kopírovat adresu\|/.test(await nabidkaPolozky(page)), 'nabídka (víc lidí): ' + await nabidkaPolozky(page));
      await vyberZNabidky(page, 'Kopírovat adresu');
      jistota(await schrankaText(page) === 'trener@klub.test', 'adresa: ' + await schrankaText(page));
      await pravym(page, '#posta-seznam [data-vlakno="v2"]');
      await vyberZNabidky(page, 'Odpovědět všem');
      await page.waitForSelector('[data-panel="psani"] [data-psani-text]');
      const psani = (await page.textContent('[data-panel="psani"]')).replace(/\s+/g, ' ');
      jistota(/Odpověď všem/.test(psani) && /Trenér/.test(psani) && /Kolega/.test(psani), 'odpověď všem: ' + psani.slice(0, 200));
      await page.click('[data-panel="psani"] [data-zavrit-panel]');
      await page.waitForFunction(() => !document.querySelector('[data-panel="psani"]'));
      await pravym(page, '#posta-seznam [data-vlakno="v1"]');
      await vyberZNabidky(page, 'Nový e-mail odesílateli');
      await page.waitForSelector('[data-panel="psani"] [data-psani-komu]');
      jistota(/Trenér <trener@klub\.test>/.test(await page.inputValue('[data-panel="psani"] [data-psani-komu]')) &&
        await page.inputValue('[data-panel="psani"] [data-psani-predmet]') === '', 'nový e-mail odesílateli: ' + await page.inputValue('[data-panel="psani"] [data-psani-komu]'));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      vlaknoV2Kopie = '';
      await ctx.close();
    }
  });

  // ================================================================ Asistent na PC (Michal 18. 10.: „widget na PC … oznámení na e-maily“)
  // Instalace jako aplikace (manifest, rychlé akce), odznak na ikoně, oznámení ve Windows, mini okno a plovoucí okno.
  // Badging API, Notification / showNotification a Document Picture-in-Picture jsou napodobené (pcNapodob) – nic skutečného.
  const pcNapodob = (volby) => {
    window.__odznak = [];
    navigator.setAppBadge = (n) => { window.__odznak.push(n == null ? 'tecka' : n); return Promise.resolve(); };
    navigator.clearAppBadge = () => { window.__odznak.push(0); return Promise.resolve(); };
    window.__oznameni = [];
    let povoleni = (volby && volby.povoleni) || localStorage.getItem('test.povoleni') || 'default'; // přežije znovunačtení jako v prohlížeči
    window.Notification = class {
      constructor(titul, o) { window.__oznameni.push({ titul, text: o && o.body, tag: o && o.tag, cil: o && o.data && o.data.cil, primo: true, n: this }); }
      close() { /* nic */ }
      static get permission() { return povoleni; }
      static requestPermission() { povoleni = 'granted'; localStorage.setItem('test.povoleni', 'granted'); return Promise.resolve('granted'); }
    };
    if (navigator.serviceWorker) {
      navigator.serviceWorker.getRegistration = () => Promise.resolve(window.__bezSluzby ? undefined : {
        showNotification: (titul, o) => { window.__oznameni.push({ titul, text: o.body, tag: o.tag, cil: o.data && o.data.cil }); return Promise.resolve(); } });
    }
    if (volby && volby.nastaveni && !localStorage.getItem('asistent.pc')) localStorage.setItem('asistent.pc', JSON.stringify(volby.nastaveni));
    // plovoucí okno: napodobené Document Picture-in-Picture – „okno“ je iframe ve stránce (vlastní dokument, stejný původ)
    if (volby && volby.pip === false) Object.defineProperty(window, 'documentPictureInPicture', { value: undefined, configurable: true });
    else if (volby && volby.pip) {
      Object.defineProperty(window, 'documentPictureInPicture', { configurable: true, value: { requestWindow: async (o) => {
        window.__pipVolby = o;
        const f = document.createElement('iframe');
        f.id = 'test-pip';
        f.style.cssText = 'position:fixed;right:8px;bottom:8px;width:' + o.width + 'px;height:' + o.height + 'px;border:1px solid #888;z-index:9999;background:#fff';
        document.body.appendChild(f);
        return f.contentWindow;
      } } });
    }
  };
  const PC_MALE = { nazev: 'pc-mini', sirka: 360, vyska: 640, dotyk: false };
  const horiciPc = (id, od, predmet, navic) => Object.assign({ id, ucet: 'osobni', stav: 'hori', duvod: 'termín dnes', od, predmet, ukazka: 'Potřebuju odpověď.',
    kdy: Date.now() - 60e3, neprectena: true, pocet: 1, odkaz: '#' }, navic);
  const posledniOznameni = (page) => page.evaluate(() => (window.__oznameni || []).map((x) => ({ titul: x.titul, text: x.text, tag: x.tag, cil: x.cil, primo: !!x.primo })));
  const nactiPostu = (page) => page.evaluate(() => import('/js/posta.js').then((m) => m.nactiPostu(true)));

  await test('Asistent na PC: manifest – okno aplikace, ikony any i maskable, rychlé akce Pošta / Přehled / Mini okno / Jídlo s ikonami 96 × 96; zkratky z ikony v aplikaci', async () => {
    const m = JSON.parse(fs.readFileSync(path.join(KOREN, 'manifest.webmanifest'), 'utf8'));
    jistota(m.name === 'Asistent' && m.short_name === 'Asistent' && m.display === 'standalone' && m.start_url === './' && m.scope === './' && m.id === './', 'základ manifestu');
    // překryv ovládacích prvků okna (WCO) by tlačítka okna položil přes horní lištu a okna přes celou obrazovku v malém mini okně
    jistota(!(m.display_override || []).includes('window-controls-overlay'), 'window-controls-overlay bez rozvržení, které ho zvládne');
    const rozmer = (f) => { const b = fs.readFileSync(path.join(KOREN, f)); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
    jistota(m.icons.some((i) => i.purpose === 'maskable') && m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') && m.icons.some((i) => i.sizes === '192x192'), 'ikony');
    m.icons.forEach((i) => jistota(rozmer(i.src) === i.sizes, 'ikona ' + i.src + ' má ' + rozmer(i.src)));
    const z = m.shortcuts || [];
    jistota(z.map((x) => x.name).join('|') === 'Pošta|Přehled|Mini okno|Nový zápis jídla', 'zkratky: ' + z.map((x) => x.name).join('|'));
    jistota(z.map((x) => x.url).join(' ') === './?zkratka=posta ./?zkratka=prehled ./#mini ./?zkratka=jidlo', 'adresy zkratek: ' + z.map((x) => x.url).join(' '));
    z.forEach((x) => {
      jistota(x.short_name && x.icons && x.icons.some((i) => i.sizes === '96x96'), 'ikona 96 × 96 u ' + x.name);
      x.icons.forEach((i) => jistota(rozmer(i.src) === i.sizes, i.src + ' má ' + rozmer(i.src)));
    });
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.goto(WEB + '?zkratka=posta');
      await page.waitForSelector('#p-posta:not([hidden]) #posta-seznam [data-vlakno]');
      jistota(!/zkratka/.test(page.url()), 'adresa po zkratce uklizená: ' + page.url());
      await page.goto(WEB + '?zkratka=jidlo');
      await page.waitForSelector('[data-panel="jidlo"] [data-jidlo-co]');
      await page.goto(WEB + '?zkratka=prehled');
      await page.waitForSelector('#p-dnes:not([hidden]) #dl-pozornost');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally { await ctx.close(); }
  });

  await test('Asistent na PC: odznak na ikoně – hoří + čeká na odpověď, jen hoří, vypnuto (Nastavení → Aplikace); telefon bez části Na tomhle PC', async () => {
    postaNavic = { osobni: [vlaknoSouhrn.v1, horiciPc('v6', 'Stavbyvedoucí', 'Havárie vody')] };
    try {
      let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
      await page.addInitScript(pcNapodob);
      await page.goto(WEB);
      // v1 otázka + v6 hoří (v2 „čekáš na ně“ se nepočítá)
      await cekejVeStrance(page, () => (window.__odznak || []).slice(-1)[0] === 2, null, 9000);
      await page.evaluate(() => import('/js/nastaveni.js').then((m) => m.otevriNastaveni('aplikace')));
      await page.waitForSelector('[data-panel="nastaveni"] [data-nast-odznak="pozornost"][aria-pressed="true"]');
      const text = await page.textContent('[data-panel="nastaveni"]');
      jistota(/Na tomhle PC/.test(text) && /chrome:\/\/apps/.test(text) && /Spustit aplikaci při přihlášení/.test(text) && /Připnout na hlavní panel/.test(text), 'návod instalace');
      await page.click('[data-panel="nastaveni"] [data-nast-odznak="hori"]');
      await cekejVeStrance(page, () => window.__odznak.slice(-1)[0] === 1);
      await page.click('[data-panel="nastaveni"] [data-nast-odznak="vypnuto"]');
      await cekejVeStrance(page, () => window.__odznak.slice(-1)[0] === 0);
      jistota(await page.evaluate(() => JSON.parse(localStorage.getItem('asistent.pc')).odznak) === 'vypnuto', 'volba v zařízení');
      await page.click('[data-panel="nastaveni"] [data-nast-odznak="pozornost"]');
      await cekejVeStrance(page, () => window.__odznak.slice(-1)[0] === 2);
      await page.locator('[data-panel="nastaveni"] .panel-telo').screenshot({ path: path.join(VYSTUP, 'pc_nastaveni_aplikace.png') });
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // telefon: žádná část pro PC, žádný odznak ani mini
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[0]));
      await page.addInitScript(pcNapodob);
      await page.goto(WEB);
      await page.waitForSelector('#dnes-mobil .hero');
      await page.evaluate(() => import('/js/nastaveni.js').then((m) => m.otevriNastaveni('aplikace')));
      await page.waitForSelector('[data-panel="nastaveni"] [data-sekce="aplikace"]');
      jistota(!/Na tomhle PC|Mini okno/.test(await page.textContent('[data-panel="nastaveni"]')), 'telefon: bez části pro PC');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+Shift+KeyA');
      await page.waitForTimeout(400);
      jistota(await page.evaluate(() => document.getElementById('mini').hidden && !document.getElementById('aplikace').hidden && !window.__odznak.length &&
        !document.querySelector('[data-mini-sem]')), 'telefon: Ctrl+Shift+A nic, odznak nic, tlačítko mini není');
      jistota(!chybyStranky.length, 'telefon: chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally { postaNavic = {}; }
  });

  await test('Asistent na PC: oznámení ve Windows – zapnutí klepnutím, staré věci ne, nové hoří jednou bez předmětu, s volbou i předmět, hlídaný, klepnutí otevře e-mail (služba i bez ní), žádné opakování po novém otevření', async () => {
    postaNavic = { osobni: [vlaknoSouhrn.v1, horiciPc('v6', 'Stavbyvedoucí', 'Havárie vody')] };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.addInitScript(pcNapodob);
      await page.goto(WEB);
      await page.waitForSelector('#dl-pozornost .seznam');
      jistota(await page.evaluate(() => Notification.permission) === 'default', 'oprávnění se samo nežádá');
      await page.evaluate(() => import('/js/nastaveni.js').then((m) => m.otevriNastaveni('aplikace')));
      await page.click('[data-panel="nastaveni"] [data-nast="pc-oznameni-zapnout"]');
      await page.waitForSelector('[data-panel="nastaveni"] [data-nast-pc-druh="hori"]');
      // první vyhodnocení jen zapamatuje, co už hoří (v6) – nic nevyskočí
      await cekejVeStrance(page, () => /posta:v6:hori/.test(localStorage.getItem('asistent.data.oznameno') || ''), null, 9000);
      jistota(!(await posledniOznameni(page)).length, 'staré věci se neohlásí: ' + JSON.stringify(await posledniOznameni(page)));
      await page.locator('[data-panel="nastaveni"] [data-nast-pc-ticho]').setChecked(false); // test nesmí záviset na denní době
      // nová konverzace hoří → jedno oznámení: odesílatel a stav, bez předmětu
      postaNavic = { osobni: [vlaknoSouhrn.v1, horiciPc('v6', 'Stavbyvedoucí', 'Havárie vody'), horiciPc('v7', 'Úřad', 'Podpis smlouvy', { kdy: Date.now() })] };
      await nactiPostu(page);
      await cekejVeStrance(page, () => window.__oznameni.length === 1, null, 6000);
      let o = await posledniOznameni(page);
      jistota(o[0].titul === 'Hoří · Úřad' && !/Podpis smlouvy/.test(o[0].titul + o[0].text) && o[0].tag === 'posta:v7:hori' && o[0].cil === 'vlakno:v7', 'oznámení: ' + JSON.stringify(o[0]));
      await nactiPostu(page);
      await page.waitForTimeout(500);
      jistota((await posledniOznameni(page)).length === 1, 'žádné opakování');
      // „I předmět“ + hlídaný odesílatel
      await page.click('[data-panel="nastaveni"] [data-nast-pc-predmet="ano"]');
      postaNavic.osobni.push(horiciPc('v8', 'Investor', 'Kontrola zítra v 8', { kdy: Date.now() }),
        horiciPc('v9', 'Pojišťovna', 'Pojistná událost', { kdy: Date.now(), hlidano: true, duvod: 'hlídáš: pojišťovna' }));
      await nactiPostu(page);
      await cekejVeStrance(page, () => window.__oznameni.length === 3, null, 6000);
      o = await posledniOznameni(page);
      const v8 = o.find((x) => x.tag === 'posta:v8:hori'), v9 = o.find((x) => x.tag === 'posta:v9:hlidani');
      jistota(v8 && v8.titul === 'Hoří · Investor' && v8.text === 'Kontrola zítra v 8', 'i předmět: ' + JSON.stringify(v8));
      jistota(v9 && v9.titul === 'Hlídaný odesílatel · Pojišťovna', 'hlídaný: ' + JSON.stringify(v9));
      // zkušební oznámení z Nastavení
      await page.click('[data-panel="nastaveni"] [data-nast="pc-oznameni-test"]');
      await cekejVeStrance(page, () => window.__oznameni.some((x) => x.tag === 'zkusebni'));
      await page.locator('[data-panel="nastaveni"] .panel-telo').screenshot({ path: path.join(VYSTUP, 'pc_nastaveni_oznameni.png') });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-panel="nastaveni"]'));
      // klepnutí na oznámení: služba pošle zprávu oknu → Pošta s tím e-mailem
      await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { typ: 'asistent-oznameni', cil: 'vlakno:v7' } })));
      await page.waitForSelector('#p-posta:not([hidden]) #posta-seznam li.aktivni [data-vlakno="v7"]');
      await page.waitForSelector('#posta-detail .detail-telo');
      // bez služby (http, starší prohlížeč): oznámení přímo ze stránky, klepnutí taky otevře e-mail
      await page.click('#rail [data-cil="dnes"]');
      await page.evaluate(() => { window.__bezSluzby = true; });
      postaNavic.osobni.push(horiciPc('v10', 'Soused', 'Plot', { kdy: Date.now() }));
      await nactiPostu(page);
      await cekejVeStrance(page, () => window.__oznameni.some((x) => x.primo && x.tag === 'posta:v10:hori'), null, 6000);
      await page.evaluate(() => window.__oznameni.find((x) => x.primo).n.onclick());
      await page.waitForSelector('#p-posta:not([hidden]) #posta-seznam li.aktivni [data-vlakno="v10"]');
      // nové otevření: nic znovu; konverzace, která přišla do zavřené aplikace, taky ne (ukáže ji Co je nového)
      postaNavic.osobni.push(horiciPc('v11', 'Kolega', 'Výkaz', { kdy: Date.now() - 2 * H }));
      await page.reload();
      await page.waitForFunction(() => window.asistentBezi);
      await cekejVeStrance(page, () => /posta:v11:hori/.test(localStorage.getItem('asistent.data.oznameno') || ''), null, 9000);
      await page.waitForTimeout(400);
      jistota(!(await posledniOznameni(page)).length, 'po novém otevření nic: ' + JSON.stringify(await posledniOznameni(page)));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      postaNavic = {};
      await ctx.close();
    }
  });

  await test('Asistent na PC: oznámení – tiché hodiny 22–6 nic neukážou (jen zapamatují), vypnutý druh taky ne', async () => {
    postaNavic = { osobni: [vlaknoSouhrn.v1] };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      const noc = new Date(); noc.setHours(23, 30, 0, 0);
      await page.clock.setSystemTime(noc);
      await page.addInitScript(pcNapodob, { povoleni: 'granted', nastaveni: { oznameni: true, ticho: true, druhy: { ceka: false } } });
      await page.goto(WEB);
      await page.waitForSelector('#dl-pozornost .seznam');
      await cekejVeStrance(page, () => /posta:v1:ceka/.test(localStorage.getItem('asistent.data.oznameno') || ''), null, 9000);
      const t = await page.evaluate(() => Date.now());
      postaNavic.osobni.push(horiciPc('v7', 'Úřad', 'Podpis', { kdy: t + 60e3 }), Object.assign({}, vlaknoSouhrn.v1, { id: 'v12', stav: 'ceka', kdy: t + 60e3 }));
      await nactiPostu(page);
      await cekejVeStrance(page, () => /posta:v7:hori/.test(localStorage.getItem('asistent.data.oznameno') || '') && /posta:v12:ceka/.test(localStorage.getItem('asistent.data.oznameno') || ''), null, 6000);
      jistota(!(await posledniOznameni(page)).length, 'v noci nic: ' + JSON.stringify(await posledniOznameni(page)));
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      postaNavic = {};
      await ctx.close();
    }
  });

  for (const motiv of ['light', 'dark']) {
    await test('Mini okno na PC 360 × 640' + (motiv === 'dark' ? ' (tmavý)' : '') + ': sekce pošta, dnešek, pití a doplňky, fotbal, Instagram, počasí a připravenost; nic nepřetéká; +0,5 l a doplněk; e-mail v hlavním okně', async () => {
      postaNavic = { osobni: [vlaknoSouhrn.v1, horiciPc('v6', 'Stavbyvedoucí Novák', 'Havárie vody')] };
      reelyPlan[REELY_TEST[0].id] = { kdy: Date.now() + 2 * H, stav: 'ceka', oznacit: [] }; // vyjde dnes (nebo v noci)
      const { ctx, page, chybyStranky } = await novaStranka(prohlizec, PC_MALE, motiv);
      try {
        await page.addInitScript(pcNapodob, { pip: true });
        await page.goto(WEB + '#mini');
        await page.waitForSelector('#mini:not([hidden]) .mo-hlava');
        await page.waitForSelector('#mini [data-oblast="posta"] [data-mini-vlakno="v6"]');
        await page.waitForSelector('#mini [data-oblast="kalendar"] .mo-program, #mini [data-oblast="kalendar"] .mo-prazdne:not(.mo-prazdne--nacitam)');
        await page.waitForSelector('#mini [data-oblast="zdravi"] [data-piti="500"]');
        await page.waitForSelector('#mini .mo-cisla [data-mini-cil="pocasi"]');
        await page.waitForSelector('#mini .mo-cisla [data-mini-cil="zdravi"]');
        await page.waitForSelector('#mini [data-oblast="fotbal"] .mo-zapas');
        await page.waitForSelector('#mini [data-mo="instagram"] [data-mini-cil="ig:reel:' + REELY_TEST[0].id + '"]');
        jistota(await page.isHidden('#aplikace'), 'celá aplikace schovaná');
        jistota(await page.locator('#mini [data-mini-plovouci]').count() === 1, 'tlačítko Plovoucí okno');
        // soukromí: v mini okně bez předmětu (výchozí volba)
        jistota(!/Havárie vody/.test(await page.textContent('#mini')), 'předmět jen s volbou');
        const pretok = await page.evaluate(() => {
          const sirka = document.documentElement.clientWidth;
          const ven = [];
          if (document.documentElement.scrollWidth > sirka + 1) ven.push('stránka ' + document.documentElement.scrollWidth);
          document.querySelectorAll('#mini *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && r.right > sirka + 1) ven.push(el.className + ' ' + Math.round(r.right)); });
          return ven.slice(0, 6);
        });
        jistota(!pretok.length, 'přetéká: ' + pretok.join(' | '));
        await page.screenshot({ path: path.join(VYSTUP, 'pc_mini_' + (motiv === 'dark' ? 'tmavy' : 'svetly') + '.png') });
        await page.screenshot({ path: path.join(VYSTUP, 'pc_mini_' + (motiv === 'dark' ? 'tmavy' : 'svetly') + '_cela.png'), fullPage: true });
        // rychlá tlačítka: voda a doplněk jdou do motoru stejně jako z Přehledu
        const piti = pitiVolani.length, doplnky = doplnkyVolani.length;
        await page.click('#mini [data-piti="500"]');
        await cekej(() => pitiVolani.length > piti && pitiVolani[pitiVolani.length - 1].ml === 500, 5000, 'voda do motoru');
        const prvni = page.locator('#mini .mo-doplnek').first();
        const pred = await prvni.getAttribute('aria-pressed');
        await prvni.click();
        await cekejVeStrance(page, (p) => document.querySelector('#mini .mo-doplnek').getAttribute('aria-pressed') !== p, pred);
        await cekej(() => doplnkyVolani.length > doplnky, 5000, 'doplněk do motoru');
        if (motiv === 'light') {
          // samostatné mini okno bez hlavního: e-mail otevře nové hlavní okno (?otevri=…) přímo na tom e-mailu
          const [nova] = await Promise.all([ctx.waitForEvent('page'), page.click('#mini [data-mini-vlakno="v6"]')]);
          await nova.waitForSelector('[data-panel="vlakno"].otevreny'); // ?otevri=vlakno:v6 → e-mail (adresa se pak uklidí)
          jistota(!/otevri/.test(nova.url()) && await nova.isHidden('#mini'), 'nové hlavní okno: ' + nova.url());
          await nova.close();
          // s hlavním oknem: e-mail se otevře v něm (BroadcastChannel), mini okno zůstane mini
          const hlavni = await ctx.newPage();
          await hlavni.setViewportSize({ width: 1440, height: 900 });
          await hlavni.goto(WEB);
          await hlavni.waitForFunction(() => window.asistentBezi);
          await hlavni.waitForSelector('#dl-pozornost .seznam');
          await page.click('#mini [data-mini-vlakno="v1"]');
          await hlavni.waitForSelector('#p-posta:not([hidden]) #posta-seznam li.aktivni [data-vlakno="v1"]');
          await page.waitForSelector('#toast.videt');
          jistota(/hlavním okně/.test(await page.textContent('#toast')), 'mini okno: otevřeno v hlavním');
          jistota(await page.isVisible('#mini .mo-hlava'), 'mini zůstalo');
          await hlavni.close();
        }
        jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      } finally {
        postaNavic = {};
        delete reelyPlan[REELY_TEST[0].id];
        await ctx.close();
      }
    });
  }

  await test('Mini v hlavním okně: Ctrl+Shift+A a Mini přehled v levém pásu přepnou na mini a zpět, e-mail z mini otevře Pošta, snímek celé aplikace zůstane (PC)', async () => {
    postaNavic = { osobni: [vlaknoSouhrn.v1, horiciPc('v6', 'Stavbyvedoucí', 'Havárie vody')] };
    const { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.addInitScript(pcNapodob);
      await page.goto(WEB);
      await page.waitForSelector('#dl-pozornost .seznam');
      await page.waitForSelector('#rail [data-mini-sem]');
      await page.keyboard.press('Control+Shift+KeyA');
      await page.waitForSelector('#mini:not([hidden]) [data-oblast="posta"] [data-mini-vlakno="v6"]');
      jistota(await page.isHidden('#aplikace') && /#mini$/.test(page.url()), 'mini: ' + page.url());
      await page.screenshot({ path: path.join(VYSTUP, 'pc_mini_v_hlavnim_okne.png') });
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      const snimek = await page.evaluate(() => JSON.parse(localStorage.getItem('asistent.data.snimek') || 'null'));
      jistota(snimek && snimek.pohled === 'dnes' && /dl-pozornost/.test(snimek.casti.stranka) && !/mo-hlava/.test(JSON.stringify(snimek.casti)), 'mini snímek celé aplikace nesmaže ani nepřepíše');
      await page.keyboard.press('Control+Shift+KeyA');
      await page.waitForSelector('#aplikace:not([hidden]) #dl-pozornost .seznam');
      jistota(await page.isHidden('#mini') && !/#mini/.test(page.url()), 'zpět celá aplikace');
      await page.click('#rail [data-mini-sem]');
      await page.waitForSelector('#mini:not([hidden]) [data-mini-vlakno="v6"]');
      await page.click('#mini [data-mini-vlakno="v6"]');
      await page.waitForSelector('#aplikace:not([hidden]) #p-posta:not([hidden]) #posta-seznam li.aktivni [data-vlakno="v6"]');
      jistota(await page.isHidden('#mini'), 'e-mail z mini: zpět v celé aplikaci');
      // Celá aplikace z hlavičky mini
      await page.keyboard.press('Control+Shift+KeyA');
      await page.waitForSelector('#mini:not([hidden]) [data-mini-cela]');
      await page.click('#mini [data-mini-cela]');
      await page.waitForSelector('#aplikace:not([hidden])');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
    } finally {
      postaNavic = {};
      await ctx.close();
    }
  });

  await test('Plovoucí okno (napodobené Document Picture-in-Picture): 360 × 640, obsah mini se styly, živě se obnovuje (+0,5 l), e-mail otevře hlavní okno, zavření; bez API tlačítko není', async () => {
    postaNavic = { osobni: [vlaknoSouhrn.v1, horiciPc('v6', 'Stavbyvedoucí', 'Havárie vody')] };
    let { ctx, page, chybyStranky } = await novaStranka(prohlizec, VELIKOSTI[3]);
    try {
      await page.addInitScript(pcNapodob, { pip: true });
      await page.goto(WEB);
      await page.waitForSelector('#dl-pozornost .seznam');
      await page.evaluate(() => import('/js/nastaveni.js').then((m) => m.otevriNastaveni('aplikace')));
      await page.click('[data-panel="nastaveni"] [data-nast="pc-plovouci"]');
      await page.waitForSelector('#test-pip');
      const pip = page.frameLocator('#test-pip');
      await pip.locator('#mini .mo-hlava').waitFor();
      await pip.locator('#mini [data-oblast="zdravi"] [data-piti="500"]').waitFor();
      jistota(JSON.stringify(await page.evaluate(() => window.__pipVolby)).indexOf('"width":360') >= 0, 'velikost okna');
      jistota(await pip.locator('[data-mini-plovouci]').count() === 0 && await pip.locator('[data-mini-cil="aplikace"]').count() === 1, 'v plovoucím okně místo Plovoucí okno „Otevřít Asistenta“');
      // styly zkopírované (karta má okraj a zaoblení jako v aplikaci)
      jistota(await pip.locator('#mini .mo-karta').first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 10), 'styly v plovoucím okně');
      const voda = await pip.locator('#mini .mo-piti b').textContent();
      const piti = pitiVolani.length;
      await pip.locator('#mini [data-piti="500"]').click();
      await cekej(() => pitiVolani.length > piti, 5000, 'voda z plovoucího okna do motoru');
      await cekejVeStrance(page, (v) => { const f = document.getElementById('test-pip'); const b = f && f.contentDocument.querySelector('#mini .mo-piti b'); return b && b.textContent !== v; }, voda, 6000);
      await page.locator('#test-pip').screenshot({ path: path.join(VYSTUP, 'pc_plovouci_okno.png') });
      await page.click('[data-panel="nastaveni"] [data-zavrit-panel]'); // klávesnice je teď v plovoucím okně
      await page.waitForFunction(() => !document.querySelector('[data-panel="nastaveni"]'));
      await pip.locator('#mini [data-mini-vlakno="v6"]').click();
      await page.waitForSelector('#p-posta:not([hidden]) #posta-seznam li.aktivni [data-vlakno="v6"]');
      // zavření okna (pagehide) – další klepnutí otevře nové
      await page.evaluate(() => { const f = document.getElementById('test-pip'); f.contentWindow.dispatchEvent(new Event('pagehide')); f.remove(); });
      jistota(await page.evaluate(() => import('/js/mini.js').then((m) => !m.plovouciOtevrene())), 'po zavření zapomenuté');
      jistota(!chybyStranky.length, 'chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
      // bez Document Picture-in-Picture (jiný prohlížeč): tlačítko v mini ani v Nastavení není
      ({ ctx, page, chybyStranky } = await novaStranka(prohlizec, PC_MALE));
      await page.addInitScript(pcNapodob, { pip: false });
      await page.goto(WEB + '#mini');
      await page.waitForSelector('#mini:not([hidden]) .mo-hlava');
      jistota(await page.locator('#mini [data-mini-plovouci]').count() === 0, 'bez API bez tlačítka');
      jistota(!chybyStranky.length, 'bez API: chyby stránky: ' + chybyStranky.join(' | '));
      await ctx.close();
    } finally {
      postaNavic = {};
    }
  });

  await prohlizec.close();
  server.close();
  console.log('\n' + ok + ' prošlo' + (chyb ? ', ' + chyb + ' SELHALO' : '') + ' · snímky: testy/vystup/');
  process.exitCode = chyb ? 1 : 0;
})();
