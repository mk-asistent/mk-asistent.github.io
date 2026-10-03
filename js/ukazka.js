// Ukázková data a napodobený motor – pro vyzkoušení aplikace bez připojení (a pro náhled vzhledu).
// Všechno je vymyšlené; nic se nikam neposílá.

import { pulnoc, pridejDny } from './pomocne.js';

const H = 36e5;
const ted = Date.now();
const dnes = pulnoc(ted);
const den = (posun, hod = 0, min = 0) => pridejDny(dnes, posun) + (hod * 60 + min) * 6e4;
const iso = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const kopie = (o) => JSON.parse(JSON.stringify(o));

const schranka = {
  nove: [
    // diktát, který aplikace pozná sama (Rozpoznáno: událost) – „zítra“ od chvíle diktátu
    { id: 'n3', slozka: 'NOVE', kdy: ted - 0.2 * H, odkud: 'iPhone', typ: '', stav: '', shrnuti: '', termin: '',
      text: 'Zítra v 18 večeře s rodiči u Martina. Vzít víno.', vlakno: [] },
    { id: 'n1', slozka: 'NOVE', kdy: ted - 0.4 * H, odkud: 'iPhone', typ: '', stav: '', shrnuti: '', termin: '',
      text: 'Zjisti, jestli jde z ArcGIS Pro exportovat půdorys rovnou do PDF s legendou po patrech, ať to nemusím skládat ručně.', vlakno: [] },
    { id: 'n2', slozka: 'NOVE', kdy: ted - 3 * H, odkud: 'aplikace', typ: '', stav: '', shrnuti: '', termin: '',
      text: 'Připrav seznam věcí na sobotní zápas dorostu.', vlakno: [] }
  ],
  ceka: [
    { id: 'c1', slozka: 'CEKA', kdy: ted - 26 * H, odkud: 'iPhone', typ: 'ukol-claude', stav: 'rozhodni',
      shrnuti: 'Přehled fotek na webu – přidat filtr podle technologie', termin: '',
      text: 'Na přehled fotek by se hodil filtr podle technologie, ať vidím jen VZT.',
      vlakno: [{ kdo: 'Claude', kdy: iso(ted - 20 * H) + ' 07:31', text: 'Připravil jsem plán ve 4 krocích (filtr nad maticí, zapamatování volby, počty v záhlaví, mobil). Mění to web, takže čekám na tvé ano.' }] },
    { id: 'c2', slozka: 'CEKA', kdy: ted - 50 * H, odkud: 'iPhone', typ: 'ukol-michal', stav: 'tvuj-ukol',
      shrnuti: 'Zavolat kvůli objednávce lešení', termin: iso(den(0)), text: 'Připomeň mi zavolat kvůli lešení.', vlakno: [] },
    { id: 'c3', slozka: 'CEKA', kdy: ted - 30 * H, odkud: 'aplikace', typ: 'ukol-michal', stav: 'tvuj-ukol',
      shrnuti: 'Objednat dresy pro dorost', termin: iso(den(4)), text: 'Do pátku objednat dresy pro dorost.', vlakno: [] },
    { id: 'c4', slozka: 'CEKA', kdy: ted - 80 * H, odkud: 'iPhone', typ: 'ukol-michal', stav: 'tvuj-ukol',
      shrnuti: 'Poslat kolegům návod k zásuvkám', termin: iso(den(-1)), text: 'Poslat kolegům návod k zásuvkám.', vlakno: [] },
    { id: 'c5', slozka: 'CEKA', kdy: ted - 70 * H, odkud: 'iPhone', typ: 'napad', stav: 'napad', tema: 'fotbal',
      shrnuti: '3D taktická tabule pro dorost', termin: '', text: 'Nápad: taktická tabule ve 3D, hráči jako figurky.', vlakno: [] },
    // návrhy z diktátu – Claude je připravil, Michal jedním klepnutím otevře předvyplněné
    { id: 'c6', slozka: 'CEKA', kdy: ted - 0.8 * H, odkud: 'iPhone', typ: 'udalost', stav: 'rozhodni', tema: 'prace',
      shrnuti: 'Schůzka s Petrem kvůli předání 2. NP', termin: '',
      navrh: { typ: 'udalost', nazev: 'Schůzka – předání 2. NP', zacatek: iso(den(3)) + 'T10:00', konec: iso(den(3)) + 'T11:00', misto: 'stavba',
        hoste: ['Investor – stavba'], pozvat: true, popis: 'Projít soupis vad.' },
      text: 'Pozvi investora na schůzku ve čtvrtek v deset na stavbu, projdeme soupis vad.',
      vlakno: [{ kdo: 'Claude', kdy: iso(ted) + ' 07:31', text: 'Připravil jsem návrh události s pozvánkou – stačí ji otevřít a uložit.' }] },
    { id: 'c7', slozka: 'CEKA', kdy: ted - 1.5 * H, odkud: 'iPhone', typ: 'email', stav: 'rozhodni', tema: 'fotbal',
      shrnuti: 'E-mail trenérovi – nepřijdu na trénink', termin: '',
      navrh: { typ: 'email', komu: ['Trenér dorostu'], predmet: 'Úterní trénink', text: 'Ahoj,\n\nv úterý na trénink nedorazím, mám pracovní schůzku. Rozcvičku vezme Honza.\n\nDíky' },
      text: 'Napiš trenérovi, že v úterý nepřijdu na trénink, rozcvičku vezme Honza.',
      vlakno: [{ kdo: 'Claude', kdy: iso(ted) + ' 07:32', text: 'Připravil jsem e-mail – zkontroluj ho a odešli.' }] }
  ],
  hotovo: [
    { id: 'h1', slozka: 'HOTOVO', kdy: ted - 22 * H, odkud: 'iPhone', typ: 'dotaz', stav: 'hotovo',
      shrnuti: 'Kolik místností má budova ve 2. NP', termin: '', text: 'Kolik místností je ve druhém patře?',
      vlakno: [{ kdo: 'Claude', kdy: iso(ted - 20 * H) + ' 07:32', text: 'Podle tabulky místností je ve 2. NP 48 místností, z toho 6 technických.' }] }
  ]
};

// návrhy odpovědí od Clauda (v ukázce jeden – na dotaz svazu)
const navrhyOdpovedi = { t4: { zpravaId: 'z-t4', text: 'Dobrý den,\n\nneděle 10:15 nám vyhovuje, autobus objednáme o hodinu dřív.\n\nDěkuji',
  kdy: new Date(ted - H).toISOString(), poznamka: '' } };
let rezimNavrhu = 'obe';
const posta = {
  osobni: [
    { id: 't1', ucet: 'osobni', stav: 'ceka', od: 'Trenér dorostu', predmet: 'Sobotní zápas – sraz v 8:30', ukazka: 'Ahoj, sraz je výjimečně dřív, autobus jede z náměstí. Vezměte si prosím oba dresy.', kdy: ted - 1.2 * H, neprectena: true, pocet: 2, odkaz: '#', stitky: ['Fotbal', 'Fotbal/Dorost'] },
    { id: 't2', ucet: 'osobni', stav: 'info', od: 'Banka', predmet: 'Výpis z účtu za září', ukazka: 'Váš výpis je připraven v internetovém bankovnictví.', kdy: ted - 5 * H, neprectena: true, pocet: 1, odkaz: '#', stitky: ['Účty'] },
    { id: 't3', ucet: 'osobni', stav: 'info', od: 'Google', predmet: 'Bezpečnostní upozornění', ukazka: 'Nové přihlášení na zařízení Windows.', kdy: ted - 28 * H, neprectena: false, pocet: 1, odkaz: '#' },
    { id: 't4', ucet: 'osobni', stav: 'otazka', navrh: true, od: 'Fotbalový svaz', predmet: 'Změna termínu utkání dorostu', ukazka: 'Utkání 10. kola se přesouvá na neděli 10:15. Stihnete to i s autobusem?', kdy: ted - 75 * H, neprectena: false, pocet: 1, odkaz: '#', stitky: ['Fotbal'] }
  ],
  pracovni: [
    { id: 'p1', ucet: 'pracovni', stav: 'hori', od: 'Investor – stavba', predmet: 'Předávací protokol 2. NP', ukazka: 'Dobrý den, posílám protokol k připomínkám – potřebuji je nejpozději zítra, předání je ve středu.', kdy: ted - 2 * H, neprectena: true, pocet: 1, odkaz: '#' },
    { id: 'p2', ucet: 'pracovni', stav: 'resi', od: 'Kolega z kanceláře', predmet: 'Re: Výkresy SLN', ukazka: 'Díky, opravené výkresy jsem nahrál na disk.', kdy: ted - 30 * H, neprectena: false, pocet: 3, odkaz: '#' }
,
    { id: 'p3', ucet: 'pracovni', stav: 'cekas', od: 'Já → Dodavatel lešení', predmet: 'Objednávka lešení – fasáda', ukazka: 'Dobrý den, posílám objednávku, potvrďte prosím termín montáže.', kdy: ted - 52 * H, neprectena: false, pocet: 1, odkaz: '#' }
  ],
  pracovniAdresa: 'prace@firma.example',
  firemni: null,
  ted
};

const zpravyVlaken = {
  t1: { predmet: 'Sobotní zápas – sraz v 8:30', ucet: 'osobni', zpravy: [
    { id: 'z11', od: 'Já', odAdresa: 'ja@example.com', odeMe: true, komu: 'Trenér dorostu <trener@example.com>', kdy: ted - 30 * H,
      text: 'Ahoj, v kolik je v sobotu sraz?', html: '' },
    { id: 'z12', od: 'Trenér dorostu', odAdresa: 'trener@example.com', odeMe: false, komu: 'ja@example.com', kdy: ted - 1.2 * H,
      text: 'Ahoj,\n\nsraz je výjimečně dřív, v 8:30 u hřiště, autobus jede z náměstí v 8:45.\nVezměte si prosím oba dresy a kartičky.\n\nRozpis: https://example.com/rozpis\n\nDíky, trenér', html: '' }
  ] },
  t2: { predmet: 'Výpis z účtu za září', ucet: 'osobni', zpravy: [
    { id: 'z21', od: 'Banka', odAdresa: 'info@banka.example', odeMe: false, komu: 'ja@example.com', kdy: ted - 5 * H, text: 'Váš výpis je připraven.',
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><div style="background:#0b5cad;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;font-size:20px;font-weight:bold">Banka</div><div style="border:1px solid #dde3ea;border-top:0;padding:22px;border-radius:0 0 8px 8px"><p>Dobrý den,</p><p>váš <b>výpis z účtu za září</b> je připraven v internetovém bankovnictví.</p><p style="margin:26px 0"><a href="https://example.com" style="background:#0b5cad;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Zobrazit výpis</a></p><p style="color:#667;font-size:13px">Tento e-mail je automaticky generován, neodpovídejte na něj.</p></div></div>' }
  ] },
  t3: { predmet: 'Bezpečnostní upozornění', ucet: 'osobni', zpravy: [
    { id: 'z31', od: 'Google', odAdresa: 'no-reply@accounts.example', odeMe: false, komu: 'ja@example.com', kdy: ted - 28 * H, text: 'Nové přihlášení na zařízení Windows. Pokud jste to byli vy, nemusíte nic dělat.', html: '' }
  ] },
  t4: { predmet: 'Změna termínu utkání dorostu', ucet: 'osobni', zpravy: [
    { id: 'z41', od: 'Fotbalový svaz', odAdresa: 'svaz@example.com', odeMe: false, komu: 'ja@example.com', kdy: ted - 75 * H, text: 'Utkání 10. kola se přesouvá na neděli 10:15. Stihnete to i s autobusem?', html: '' }
  ] },
  p1: { predmet: 'Předávací protokol 2. NP', ucet: 'pracovni', zpravy: [
    { id: 'z51', od: 'Investor – stavba', odAdresa: 'investor@example.com', odeMe: false, komu: 'prace@firma.example', kopie: 'vedouci@firma.example', kdy: ted - 2 * H,
      text: 'Dobrý den,\n\nposílám předávací protokol k připomínkám. Připomínky potřebuji nejpozději zítra, předání je ve středu v 9:00.\n\nS pozdravem\nInvestor', html: '',
      prilohy: [{ nazev: 'Predavaci_protokol_2NP.pdf', velikost: 482133 }, { nazev: 'Soupis_vad.xlsx', velikost: 23011 }] }
  ] },
  p3: { predmet: 'Objednávka lešení – fasáda', ucet: 'pracovni', zpravy: [
    { id: 'z71', od: 'Já', odAdresa: 'prace@firma.example', odeMe: true, komu: 'Dodavatel lešení <leseni@example.com>', kdy: ted - 52 * H,
      text: 'Dobrý den,\n\nposílám objednávku lešení na fasádu. Potvrďte prosím termín montáže.\n\nDěkuji', html: '' }
  ] },
  p2: { predmet: 'Re: Výkresy SLN', ucet: 'pracovni', zpravy: [
    { id: 'z61', od: 'Já', odAdresa: 'prace@firma.example', odeMe: true, komu: 'kolega@firma.example', kdy: ted - 50 * H, text: 'Ahoj, můžeš prosím opravit výkresy SLN ve 3. NP?', html: '' },
    { id: 'z62', od: 'Kolega z kanceláře', odAdresa: 'kolega@firma.example', odeMe: false, komu: 'prace@firma.example', kdy: ted - 40 * H, text: 'Jasně, do zítřka.', html: '' },
    { id: 'z63', od: 'Kolega z kanceláře', odAdresa: 'kolega@firma.example', odeMe: false, komu: 'prace@firma.example', kdy: ted - 30 * H, text: 'Díky, opravené výkresy jsem nahrál na disk.', html: '' }
  ] }
};

const kalendare = [
  { id: 'g-osobni', nazev: 'Osobní', barva: '#2f5bd3', zdroj: 'google', skryty: false, zapis: true, druh: 'osobni' },
  { id: 'ics-prace', nazev: 'Práce', barva: '#0f7c8c', zdroj: 'icloud', skryty: false, druh: 'prace' },
  { id: 'ics-fotbal', nazev: 'Fotbal', barva: '#2e7a4d', zdroj: 'icloud', skryty: false, druh: 'fotbal' },
  { id: 'ics-rodina', nazev: 'Rodina', barva: '#a8620c', zdroj: 'icloud', skryty: false, druh: 'rodina' }
];
/** Druh nového kalendáře podle názvu – stejně jako motor (odhadDruhu_). */
function odhadDruhu(nazev) {
  const n = String(nazev || '').toLowerCase();
  if (/⚽|fotbal|zápas|zapas|trénink|trenink|dorost|klub|liga/.test(n)) return 'fotbal';
  if (/práce|prace|pracovn|work|firma|kancel|projekt/.test(n)) return 'prace';
  if (/rodin|family|děti|deti|domácnost/.test(n)) return 'rodina';
  if (/svátk|svatk|narozen|holiday/.test(n)) return 'ostatni';
  return 'osobni';
}
const podpisy = { osobni: 'Michal', pracovni: 'S pozdravem\n\nJméno Příjmení\npozice · firma' };
// kontakty pro našeptávač (komu jsem psal)
const kontakty = [{ j: 'Trenér dorostu', a: 'trener@example.com', n: 12 }, { j: 'Kolega z kanceláře', a: 'kolega@firma.example', n: 9 },
  { j: 'Investor – stavba', a: 'investor@example.com', n: 4 }, { j: '', a: 'rodic1@example.com', n: 2 }];
// štítky Gmailu: Fotbal a Účty i se staršími (archivovanými) konverzacemi
const stitkyGmailu = { 'Fotbal': ['t1', 't4', 'a1'], 'Fotbal/Dorost': ['t1'], 'Účty': ['t2', 'a2'] };
const archivovane = [
  { id: 'a1', ucet: 'osobni', stav: 'resi', od: 'Rozhodčí', predmet: 'Zápis o utkání 8. kola', ukazka: 'V příloze zápis, prosím o kontrolu sestavy.', kdy: ted - 9 * 24 * H, neprectena: false, pocet: 2, odkaz: '#', stitky: ['Fotbal'] },
  { id: 'a2', ucet: 'osobni', stav: 'info', od: 'Elektřina', predmet: 'Vyúčtování za září', ukazka: 'Vyúčtování je k dispozici v zákaznickém portálu.', kdy: ted - 12 * 24 * H, neprectena: false, pocet: 1, odkaz: '#', stitky: ['Účty'] }
];
const skupinyHostu = [{ nazev: 'Dorost – rodiče', adresy: ['rodic1@example.com', 'rodic2@example.com', 'rodic3@example.com'] }];
const vlastni = [];         // události zapsané v ukázce
const smazane = new Set();  // smazané nebo přepsané ukázkové události
let citac = 0;

/** Ukázkové události pro libovolný rozsah – opakované po týdnech, pár jednorázových kolem dneška, plus zapsané. */
function udalostiVRozsahu(od, doDne) {
  const kal = (id) => kalendare.find((k) => k.id === id);
  const vysledek = [];
  const pridej = (id, nazev, zacatek, konec, celodenni, misto, popis, opakovana) => {
    const k = kal(id);
    const idUdalosti = id + '-' + nazev + '|' + zacatek;
    if (!k || k.skryty || smazane.has(idUdalosti) || !(zacatek < doDne && konec > od)) return;
    vysledek.push({ id: idUdalosti, nazev, zacatek, konec, celodenni: !!celodenni, misto: misto || '', popis: popis || '',
      kalendar: k.nazev, kalendarId: k.id, barva: k.barva, zdroj: k.zdroj, opakovana: !!opakovana });
  };
  for (let t = pulnoc(od); t < doDne; t = pridejDny(t, 1)) {
    const d = new Date(t).getDay();
    const v = (h, m) => t + (h * 60 + m) * 6e4;
    if (d === 1) pridej('ics-prace', 'Porada týmu', v(8, 30), v(9, 15), false, 'kancelář', 'Program: stav zakázek, plán týdne.', true);
    if (d === 2 || d === 4) pridej('ics-fotbal', 'Trénink dorostu', v(17, 0), v(18, 30), false, 'hřiště', '', true);
    if (d === 6) pridej('ics-fotbal', 'Zápas dorostu', v(10, 15), v(12, 0), false, 'venku', '', true);
    if (d === 3) pridej('ics-prace', 'Pasportizace – obchůzka', v(13, 0), v(16, 0), false, 'stavba', '', true);
  }
  vlastni.forEach((u) => {
    const k = kal(u.kalendarId);
    if (k && !k.skryty && u.zacatek < doDne && u.konec > od) vysledek.push(Object.assign({}, u, { kalendar: k.nazev, barva: k.barva, zdroj: k.zdroj }));
  });
  pridej('g-osobni', 'Zubař', den(2, 14, 0), den(2, 14, 45), false, 'Poliklinika');
  pridej('ics-rodina', 'Narozeniny – babička', den(3), den(4), true);
  pridej('g-osobni', 'Servis auta', den(6, 7, 30), den(6, 8, 30), false, 'autoservis');
  pridej('ics-rodina', 'Dovolená', den(12), den(17), true, 'hory');
  pridej('ics-prace', 'Předání 2. NP', den(5, 9, 0), den(5, 11, 0), false, 'stavba', 'Předávací protokol – vzít výtisk.');
  pridej('ics-prace', 'Školení BOZP', den(5, 10, 0), den(5, 12, 30), false, 'zasedačka');
  pridej('g-osobni', 'Svátky', den(-3), den(-2), true);
  return vysledek.sort((a, b) => (a.zacatek - b.zacatek) || (b.celodenni - a.celodenni));
}

const smazanePolozky = {}; // „Vrátit“ po smazání

/** Fotbal v ukázce: tři týmy klubu, poslední výsledky a nejbližší zápasy kolem dneška (jako FOTBAL.json z nástroje). */
const fotbalZapas = (tym, posunDni, hod, domaci, hoste, vysledek, misto) => {
  const t = new Date(pridejDny(dnes, posunDni) + hod * H);
  const z = t.getTimezoneOffset();
  const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0') + 'T' +
    String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ':00' + (z <= 0 ? '+' : '-') +
    String(Math.floor(Math.abs(z) / 60)).padStart(2, '0') + ':' + String(Math.abs(z) % 60).padStart(2, '0');
  return { id: tym + posunDni, tym, zacatek: iso, domaci, hoste, doma: /Vnorovy/.test(domaci), misto, vysledek, stav: vysledek ? 'odehrano' : 'naplanovano', url: '#' };
};
// odehrané = minulý víkend (vždy před dneškem, i v sobotu a v neděli), budoucí = nejbližší víkend po dnešku
const denTydne = new Date(dnes).getDay();
const minulaNedele = -((denTydne + 7) % 7 || 7);
const pristiSobota = ((6 - denTydne + 7) % 7) || 7;
const fotbalUkazka = {
  verze: 1, aktualizovano: new Date(ted - 3 * H).toISOString(), zdroj: 'fotbal.cz', klub: 'FK Agro Vnorovy',
  tymy: [{ klic: 'A', nazev: 'A-tým', soutez: '6. liga dospělí', barva: '#2e7a4d' }, { klic: 'B', nazev: 'B-tým', soutez: '9. liga dospělí', barva: '#0f7c8c' },
    { klic: 'dorost', nazev: 'Dorost', soutez: '5. liga starší dorost', barva: '#a8620c' }],
  zapasy: [
    fotbalZapas('A', minulaNedele - 1, 16.5, 'FK Agro Vnorovy', 'TJ Lysovice', '1:3', 'Vnorovy'),
    fotbalZapas('A', pristiSobota, 15, 'FK Šardice', 'FK Agro Vnorovy', '', 'Šardice'),
    fotbalZapas('B', minulaNedele, 15, 'Vnorovy B', 'Nová Lhota', '8:0', 'Vnorovy'),
    fotbalZapas('B', pristiSobota + 1, 15, 'Vnorovy B', 'Veselí n. Moravou B', '', 'Vnorovy'),
    fotbalZapas('dorost', minulaNedele, 10.25, 'FC Kyjov 1919', 'FK Agro Vnorovy', '4:1', 'Kyjov'),
    fotbalZapas('dorost', pristiSobota + 1, 12.25, 'FK Agro Vnorovy', 'TJ Sokol Těšany', '', 'Vnorovy')
  ]
};
// tabulky a detaily odehraných zápasů – hráči jsou VYMYŠLENÍ (skutečná jména z fotbal.cz do veřejného repa nepatří)
(function () {
  const tab = (radky) => radky.map((r, i) => ({ poradi: i + 1, klub: r[0], z: r[1], v: r[2], r: r[3], p: r[4], skore: r[5], body: r[6] }));
  const tabulky = {
    A: [['FK Šardice', 9, 8, 1, 0, '30:8', 25], ['TJ Lysovice', 9, 7, 0, 2, '33:14', 21], ['FK Mutěnice', 9, 6, 1, 2, '18:10', 19], ['FK Milotice', 9, 5, 2, 2, '15:9', 17],
      ['FC Kyjov 1919', 9, 4, 3, 2, '14:12', 15], ['FK Baník Dubňany', 9, 4, 1, 4, '15:16', 13], ['FK Agro Vnorovy', 9, 3, 1, 5, '16:20', 10], ['FK Židlochovice', 9, 3, 0, 6, '18:22', 9],
      ['SK Vojkovice', 9, 2, 1, 6, '12:21', 7], ['TJ START Brno', 9, 1, 2, 6, '8:30', 5]],
    B: [['Veselí n. Moravou B', 8, 6, 1, 1, '21:8', 19], ['Vnorovy B', 8, 6, 0, 2, '35:12', 18], ['Lipov', 8, 4, 1, 3, '17:15', 13], ['Petrov', 8, 4, 0, 4, '16:14', 12],
      ['Kozojídky', 8, 3, 1, 4, '13:16', 10], ['Suchov', 8, 2, 1, 5, '14:24', 7], ['Nová Lhota', 8, 0, 0, 8, '3:40', 0]],
    dorost: [['TJ Sokol Těšany', 9, 7, 1, 1, '22:7', 22], ['FC Kyjov 1919', 9, 7, 0, 2, '35:12', 21], ['TJ Sokol Lanžhot', 9, 5, 2, 2, '20:13', 17], ['FK Agro Vnorovy', 9, 4, 1, 4, '19:18', 13],
      ['TJ Slavoj Rohatec', 9, 4, 0, 5, '21:24', 12], ['FK Hodonín B', 9, 3, 1, 5, '25:21', 10], ['Dubňany/Mutěnice', 9, 1, 1, 7, '9:28', 4]]
  };
  fotbalUkazka.tabulky = {};
  Object.keys(tabulky).forEach((k) => {
    const celkem = tab(tabulky[k]);
    // doma / venku v ukázce zhruba polovina zápasů (jen aby se dalo přepínat)
    const pul = (r, i) => ({ poradi: i + 1, klub: r.klub, z: Math.ceil(r.z / 2), v: Math.ceil(r.v / 2), r: Math.floor(r.r / 2), p: Math.floor(r.p / 2), skore: r.skore, body: Math.ceil(r.body / 2) });
    fotbalUkazka.tabulky[k] = { celkem, doma: celkem.map(pul), venku: celkem.slice().reverse().map(pul), aktualizovano: fotbalUkazka.aktualizovano };
  });
  const g = (min, hrac, strana, pozn) => ({ min, hrac, strana, pozn: pozn || '' });
  const k = (min, hrac, barva, strana) => ({ min, hrac, barva, strana });
  const detaily = {
    A: { polocas: '0:2', goly: [g(23, 'Horák Pavel', 'hoste'), g(41, 'Horák Pavel', 'hoste'), g(67, 'Svoboda Tomáš', 'domaci'), g(80, 'Beneš Ondřej', 'hoste', 'penalta')],
      karty: [k(35, 'Dvořák Martin', 'zluta', 'domaci'), k(72, 'Král Lukáš', 'zluta', 'hoste')], divaku: 160 },
    B: { polocas: '4:0', goly: [g(5, 'Procházka Adam', 'domaci'), g(18, 'Procházka Adam', 'domaci'), g(27, 'Veselý Jakub', 'domaci'), g(44, 'Marek Filip', 'domaci'),
      g(52, 'Procházka Adam', 'domaci'), g(60, 'Pokorný Vít', 'domaci'), g(77, 'Veselý Jakub', 'domaci'), g(88, 'Kučera Daniel', 'domaci')], karty: [], divaku: 45 },
    dorost: { polocas: '2:1', goly: [g(15, 'Černý Matěj', 'domaci'), g(33, 'Bartoš Šimon', 'hoste'), g(40, 'Mach Vojtěch', 'domaci'), g(70, 'Mach Vojtěch', 'domaci'), g(86, 'Hájek Adam', 'domaci')],
      karty: [k(61, 'Zeman Tobiáš', 'zluta', 'hoste'), k(83, 'Zeman Tobiáš', 'cervena', 'hoste')], divaku: 40 }
  };
  fotbalUkazka.detaily = {};
  fotbalUkazka.zapasy.filter((z) => z.vysledek).forEach((z) => { if (detaily[z.tym]) fotbalUkazka.detaily[z.id] = detaily[z.tym]; });
  fotbalUkazka.tymy.forEach((t) => { t.url = 'https://www.fotbal.cz/souteze/'; t.urlTabulka = 'https://www.fotbal.cz/souteze/'; });
})();
let fotbalVKalendari = ['dorost'];

/** Zdraví v ukázce: 30 dní připravenosti, spánku a zátěže; zápas v sobotu, trénink út a čt (sedí s kalendářem), posilovna v pondělí. */
function zdraviUkazka() {
  const nahoda = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const dnyZ = [], treninky = [];
  for (let i = 29; i >= 0; i--) {
    const t = pridejDny(dnes, -i);
    const dt = new Date(t).getDay();
    const zapas = dt === 6, trenink = dt === 2 || dt === 4, posilovna = dt === 1;
    const skore = Math.max(18, Math.min(96, Math.round(42 + nahoda(i, 1) * 50 - (dt === 0 ? 14 : 0))));
    const spanek = Math.round((6.5 + nahoda(i, 2) * 1.9) * 60) * 6e4;
    const konec = t + (6 * 60 + 5) * 6e4, bdeni = Math.round((12 + nahoda(i, 5) * 20)) * 6e4;
    const zatez = +(4 + nahoda(i, 3) * 4 + (zapas ? 9 : trenink ? 6 : posilovna ? 3 : 0)).toFixed(1);
    const kroky = Math.round(6500 + nahoda(i, 6) * 5000 + (zapas || trenink ? 3500 : 0));
    dnyZ.push({ den: iso(t),
      whoop: {
        pripravenost: { skore, hrv: Math.round(58 + skore * 0.32 + nahoda(i, 4) * 8), klidovyTep: Math.round(57 - skore * 0.08), spo2: 96.4, teplota: 33.8, kalibrace: false },
        spanek: { start: konec - spanek - bdeni, konec, celkem: spanek, hluboky: Math.round(spanek * 0.21), rem: Math.round(spanek * 0.24), lehky: Math.round(spanek * 0.55),
          bdeni, probuzeni: Math.round(5 + nahoda(i, 7) * 8), vykon: Math.round(78 + nahoda(i, 8) * 20), konzistence: 80, efektivita: 93.5, dech: 15.1, potreba: 8 * H },
        zatez: { probiha: i === 0, kroky, zatez: i === 0 ? 6.2 : zatez, kcal: Math.round(2100 + zatez * 80), tepPrumer: 68, tepMax: zapas ? 189 : 150 }
      },
      apple: { kroky: i === 0 ? Math.round(kroky * 0.45) : kroky, energie: Math.round(380 + zatez * 32), cviceni: Math.round(18 + zatez * 3.5), stani: 11,
        vzdalenost: +(kroky * 0.00076).toFixed(2), klidovyTep: Math.round(58 - skore * 0.08), vo2max: i === 6 ? 42.3 : undefined }
    });
    const pridej = (sport, hod, min, delkaMin, z, tep, tepMax) => {
      const start = t + (hod * 60 + min) * 6e4;
      if (start > Date.now()) return;
      treninky.push({ id: 'w' + i + sport, den: iso(t), start, konec: start + delkaMin * 6e4, sport, zatez: z, tepPrumer: tep, tepMax,
        kcal: Math.round(z * 62), vzdalenost: sport === 'soccer' ? Math.round(6000 + nahoda(i, 9) * 4000) : null,
        zony: sport === 'soccer' ? [4, 12, 22, 28, 22, 8] : [6, 20, 24, 8, 2, 0] });
    };
    if (zapas) pridej('soccer', 10, 15, 105, +(15 + nahoda(i, 10) * 2).toFixed(1), 154, 191);
    if (trenink) pridej('soccer', 17, 0, 90, +(11 + nahoda(i, 11) * 2).toFixed(1), 138, 178);
    if (posilovna) pridej('weightlifting', 19, 0, 60, 7.8, 112, 151);
  }
  return { vytvoreno: Date.now(), dny: dnyZ, treninky: treninky.sort((a, b) => b.start - a.start),
    whoop: { nastaveno: true, propojeno: true, sync: { kdy: Date.now() - 12 * 6e4, chyba: '' } }, apple: { kdy: Date.now() - 3 * H },
    // obecný ukázkový režim doplňků (skutečný je jen v ZDRAVI_REZIM.json na Disku)
    rezim: { kofeinDo: '14:00', treninkDny: [2, 4], zapasTymy: ['dorost'], polozky: [
      { id: 'multivitamin', nazev: 'Multivitamin', davka: '1 tbl po snídani', kdy: 'rano' },
      { id: 'kreatin', nazev: 'Kreatin', davka: '5 g ke snídani', kdy: 'rano' },
      { id: 'omega3', nazev: 'Omega-3', davka: '2 tob k jídlu', kdy: 'obed' },
      { id: 'protein', nazev: 'Protein', davka: 'po zátěži', kdy: 'po', jen: 'zatez' },
      { id: 'elektrolyty', nazev: 'Elektrolyty', davka: 'během zápasu', kdy: 'zapas', jen: 'zapas' },
      { id: 'horcik', nazev: 'Hořčík', davka: '1 kps večer', kdy: 'vecer' }] } };
}

function najdiPolozku(id) {
  if (smazanePolozky[id]) { const x = smazanePolozky[id]; delete smazanePolozky[id]; schranka[x.sk].unshift(x.p); }
  for (const sk of ['nove', 'ceka', 'hotovo']) {
    const p = schranka[sk].find((x) => x.id === id);
    if (p) return { p, sk };
  }
  throw new Error('Položka nenalezena.');
}

const akce = {
  info: () => ({ verze: 'ukázka', ucet: 'ja@example.com', skupinyHostu: kopie(skupinyHostu),
    posta: { osobniAdresa: 'ja@example.com', pracovniAdresa: posta.pracovniAdresa, lzeOdesilatZPracovni: true, podpisy: kopie(podpisy), navrhyOdpovedi: rezimNavrhu }, kalendare }),
  nastavPostu: (d) => { posta.pracovniAdresa = String(d.pracovniAdresa || '').trim(); return akce.info().posta; },
  schranka: () => Object.assign(kopie(schranka), { ted: Date.now() }),
  poznamka: (d) => {
    const text = String(d.text || '').trim();
    if (!text) throw new Error('Prázdná poznámka.');
    const p = { id: 'n' + Date.now(), slozka: 'NOVE', kdy: Date.now(), odkud: 'aplikace', typ: '', stav: '', shrnuti: '', termin: '', text, vlakno: [] };
    schranka.nove.unshift(p);
    return kopie(p);
  },
  polozka: (d) => {
    const { p, sk } = najdiPolozku(d.id);
    if (d.jak === 'obnovit') return true; // najdiPolozku ji už vrátila ze „smazaných“
    if (d.jak === 'nadpis' || d.jak === 'tema') { p[d.jak] = String(d.text || '').trim(); return kopie(p); }
    if (d.jak === 'smazat') { schranka[sk] = schranka[sk].filter((x) => x.id !== d.id); smazanePolozky[d.id] = { p, sk }; return true; }
    if (d.jak === 'dopsat' && !String(d.text || '').trim()) throw new Error('Prázdný text.');
    p.vlakno.push({ kdo: 'Michal', kdy: '', text: d.jak === 'odpoved' || d.jak === 'dopsat' || (d.jak === 'hotovo' && d.text) ? d.text
      : { hotovo: 'Hotovo.', zahodit: 'Zahodit – nedělat.', udelej: 'Udělej to.' }[d.jak] });
    schranka[sk] = schranka[sk].filter((x) => x.id !== d.id);
    if (d.jak === 'hotovo' || d.jak === 'zahodit') { p.slozka = 'HOTOVO'; schranka.hotovo.unshift(p); } else { p.slozka = 'NOVE'; schranka.nove.unshift(p); }
    return true;
  },
  posta: () => kopie(Object.assign({}, posta, { ted: Date.now() })),
  vlakno: (d) => {
    const v = zpravyVlaken[d.id];
    if (!v) throw new Error('Zpráva nenalezena.');
    [posta.osobni, posta.pracovni].forEach((s) => s.forEach((m) => { if (m.id === d.id) m.neprectena = false; }));
    const navrh = navrhyOdpovedi[d.id] ? { navrhOdpovedi: navrhyOdpovedi[d.id] } : {};
    return kopie(Object.assign({ id: d.id, odkaz: '#', vDorucenych: true, skryto: 0 }, v, navrh));
  },
  navrhZahodit: (d) => { const n = navrhyOdpovedi[d.id] ? 1 : 0; delete navrhyOdpovedi[d.id]; [posta.osobni, posta.pracovni].forEach((s) => s.forEach((m) => { if (m.id === d.id) m.navrh = false; })); return { smazano: n }; },
  navrhyNastavit: (d) => { rezimNavrhu = d.rezim; return akce.info().posta; },
  odeslat: (d) => {
    if (!String(d.text || '').trim()) throw new Error('Prázdná zpráva.');
    if ((d.rezim === 'preposlat' || d.rezim === 'novy') && !/@/.test(d.komu || '')) throw new Error('Chybí adresát.');
    const v = Object.keys(zpravyVlaken).find((id) => zpravyVlaken[id].zpravy.some((z) => z.id === d.id));
    if (v && d.rezim !== 'preposlat') {
      zpravyVlaken[v].zpravy.push({ id: 'z' + Date.now(), od: 'Já', odAdresa: 'ja@example.com', odeMe: true, komu: '', kdy: Date.now(), text: d.text, html: '' });
    }
    return true;
  },
  oznacit: (d) => {
    [posta.osobni, posta.pracovni].forEach((s, i) => {
      const m = s.find((x) => x.id === d.id);
      if (!m) return;
      if (d.jak === 'neprectene') m.neprectena = true;
      if (d.jak === 'prectene') m.neprectena = false;
      if (d.jak === 'archivovat' || d.jak === 'spam') s.splice(s.indexOf(m), 1);
    });
    return true;
  },
  kalendar: (d) => ({ udalosti: udalostiVRozsahu(Number(d.od), Number(d.do)), chyby: [], od: d.od, do: d.do, ted: Date.now() }),
  hledat: (d) => {
    // „celá pošta“ v ukázce = načtené konverzace + jedna starší, která v přehledu není
    const slova = String(d.dotaz || '').toLowerCase().split(/\s+/).filter((x) => x && x.indexOf(':') < 0);
    const starsi = { id: 'x1', ucet: 'osobni', stav: 'info', od: 'Autoservis', predmet: 'Faktura za servis – srpen', ukazka: 'V příloze posíláme fakturu za servis vozu.', kdy: ted - 40 * 24 * H, neprectena: false, pocet: 1, odkaz: '#' };
    const vse = posta.osobni.concat(posta.pracovni, [starsi]);
    return { dotaz: d.dotaz, vlakna: kopie(vse.filter((m) => slova.length && slova.every((x) => (m.od + ' ' + m.predmet + ' ' + m.ukazka).toLowerCase().indexOf(x) >= 0))) };
  },
  pripomenout: (d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.termin || ''))) throw new Error('Termín má tvar RRRR-MM-DD.');
    const m = posta.osobni.concat(posta.pracovni).find((x) => x.id === d.id) || { predmet: 'e-mail', od: '' };
    const p = { id: 'c' + Date.now(), slozka: 'CEKA', kdy: Date.now(), odkud: 'aplikace (pošta)', typ: 'ukol-michal', stav: 'tvuj-ukol',
      shrnuti: 'Odpovědět: ' + m.predmet + (m.od ? ' (' + m.od + ')' : ''), termin: d.termin,
      text: 'Připomenutí e-mailu „' + m.predmet + '“.' + (d.poznamka ? '\n\n' + d.poznamka : ''), vlakno: [] };
    schranka.ceka.push(p);
    return kopie(p);
  },
  kalendare: () => kopie(kalendare),
  kalendarPridat: (d) => {
    if (!/^(webcal|https):\/\//i.test(String(d.odkaz || '').trim())) throw new Error('Odkaz musí začínat webcal:// nebo https://');
    const nazev = String(d.nazev || '').trim() || 'Kalendář z iPhonu';
    kalendare.push({ id: 'ics-' + Date.now(), nazev, barva: d.barva || '#8e5bd3', zdroj: 'icloud', skryty: false, druh: odhadDruhu(nazev) });
    return kopie(kalendare);
  },
  kalendarUpravit: (d) => {
    const k = kalendare.find((x) => x.id === d.id);
    if (k) { if (d.skryty !== undefined) k.skryty = !!d.skryty; if (d.nazev) k.nazev = d.nazev; if (d.barva) k.barva = d.barva; if (d.druh) k.druh = d.druh; }
    return kopie(kalendare);
  },
  kalendarOdebrat: (d) => { const i = kalendare.findIndex((x) => x.id === d.id); if (i >= 0) kalendare.splice(i, 1); return kopie(kalendare); },
  kalendarZalozit: (d) => {
    const nazev = String(d.nazev || '').trim();
    if (!nazev) throw new Error('Doplň název kalendáře.');
    let k = kalendare.find((x) => x.nazev === nazev && x.zapis);
    if (!k) { k = { id: 'g-' + Date.now(), nazev, barva: d.barva || '#2e7a4d', zdroj: 'google', skryty: false, zapis: true, druh: odhadDruhu(nazev) }; kalendare.push(k); }
    return { id: k.id, kalendare: kopie(kalendare) };
  },
  udalostUlozit: (d) => {
    const k = kalendare.find((x) => x.id === d.kalendarId);
    if (!k || !k.zapis) throw new Error('Do tohoto kalendáře zapisovat nejde.');
    if (!String(d.nazev || '').trim()) throw new Error('Doplň název události.');
    if (!(d.konec > d.zacatek)) throw new Error('Konec musí být po začátku.');
    if (d.udalost) { // úprava: zapsanou přepsat, ukázkovou schovat a nahradit
      const i = vlastni.findIndex((u) => u.id === d.udalost);
      if (i >= 0) vlastni.splice(i, 1); else smazane.add(d.udalost);
    }
    const rada = d.tydne ? 'rada-' + (++citac) : '';
    const konecRady = d.tydneDo ? new Date(d.tydneDo + 'T23:59').getTime() : d.zacatek + 12 * 7 * 864e5;
    for (let n = 0, z = d.zacatek; n < (d.tydne ? 60 : 1) && z <= (d.tydne ? konecRady : z); n++, z = pridejDny(z, 7)) {
      vlastni.push({ id: 'v' + (++citac) + '|' + z, rada, nazev: d.nazev, zacatek: z, konec: z + (d.konec - d.zacatek), celodenni: !!d.celodenni,
        misto: d.misto || '', popis: d.popis || '', kalendarId: k.id, opakovana: !!d.tydne, hoste: Array.isArray(d.hoste) ? d.hoste : [] });
    }
    return { id: 'v' + citac, kalendarId: k.id };
  },
  udalostSmazat: (d) => {
    const u = vlastni.find((x) => x.id === d.udalost);
    if (!u) { smazane.add(d.udalost); return true; }
    for (let i = vlastni.length - 1; i >= 0; i--) {
      if (vlastni[i].id === d.udalost || (d.cela && u.rada && vlastni[i].rada === u.rada)) vlastni.splice(i, 1);
    }
    return true;
  },
  skupinyHostuUlozit: (d) => { skupinyHostu.splice(0, skupinyHostu.length, ...(d.skupiny || [])); return kopie(skupinyHostu); },
  zapasyImport: (d) => {
    // ukázkový rozpis: tři sobotní zápasy od příští soboty, opakovaný import nic nezdvojí
    const k = akce.kalendarZalozit({ nazev: 'Zápasy', barva: '#2e7a4d' });
    const sobota = pridejDny(pulnoc(ted), ((6 - new Date(ted).getDay() + 7) % 7) || 7);
    const zapasy = [['Kyjov', true], ['Hodonín B', false], ['Rohatec', true]];
    let pridano = 0, beze_zmeny = 0;
    zapasy.forEach((z, i) => {
      const zacatek = pridejDny(sobota, i * 7) + (10 * 60 + 15) * 6e4;
      const nazev = '⚽ ' + (z[1] ? d.domaci + ' – ' + z[0] : z[0] + ' – ' + d.domaci) + ' (' + d.tym + ')';
      if (vlastni.some((u) => u.nazev === nazev && u.zacatek === zacatek)) { beze_zmeny++; return; }
      vlastni.push({ id: 'z' + (++citac) + '|' + zacatek, nazev, zacatek, konec: zacatek + 2 * 36e5, celodenni: false,
        misto: z[1] ? d.domaci + ', hřiště' : z[0], popis: (z[1] ? 'Doma' : 'Venku') + '\n' + (d.soutez || ''), kalendarId: k.id, opakovana: false });
      pridano++;
    });
    return { pridano, upraveno: 0, beze_zmeny, kalendar: 'Zápasy', kalendarId: k.id };
  },
  stitky: () => Object.keys(stitkyGmailu).map((nazev) => ({ nazev, neprectenych: nazev === 'Účty' ? 1 : 0 })),
  postaStitek: (d) => {
    const ids = stitkyGmailu[d.nazev];
    if (!ids) throw new Error('Štítek „' + d.nazev + '“ v Gmailu není.');
    const vse = posta.osobni.concat(posta.pracovni, archivovane);
    return { nazev: d.nazev, vlakna: kopie(ids.map((id) => vse.find((m) => m.id === id)).filter(Boolean)), ted: Date.now() };
  },
  kontakty: () => kopie(kontakty),
  podpisyUlozit: (d) => { Object.assign(podpisy, { osobni: String((d.podpisy || {}).osobni || ''), pracovni: String((d.podpisy || {}).pracovni || '') }); return akce.info().posta; },
  fotbal: () => kopie({ data: fotbalUkazka, vKalendari: fotbalVKalendari, kalendar: null }),
  // docházka dorostu (Týmuj) – tréninky út a čt za 8 týdnů, hráči vymyšlení
  dochazka: () => {
    const jmena = ['Novák J.', 'Svoboda P.', 'Dvořák T.', 'Černý M.', 'Procházka A.', 'Kučera D.', 'Veselý J.', 'Horák P.', 'Marek F.', 'Pokorný V.'];
    const udalosti = [];
    for (let i = 56; i >= 1; i--) {
      const t = pridejDny(dnes, -i);
      const dt = new Date(t).getDay();
      if (dt !== 2 && dt !== 4) continue;
      const x = (k) => { const v = Math.sin(i * 7.31 + k) * 10000; return v - Math.floor(v); };
      const neomluveni = x(1) > 0.6 ? [jmena[Math.floor(x(2) * jmena.length)]] : [];
      const omluveni = jmena.filter((j, k) => x(k + 3) > 0.85 && neomluveni.indexOf(j) < 0).slice(0, 3);
      udalosti.push({ zacatek: new Date(t + 17 * H).toISOString(), druh: dt === 2 ? 'T_UT' : 'T_CT', nazev: (dt === 2 ? 'ÚT' : 'ČT') + ' - DOROST', zruseno: false, venku: false,
        pocty: { prislo: 21 - omluveni.length - neomluveni.length, omluveno: omluveni.length, neomluveno: neomluveni.length, mozna: 0, bez: 0, pozvano: 21 },
        omluveni, neomluveni });
    }
    return { udalosti, aktualizovano: new Date(ted - 6 * H).toISOString(), chyba: '' };
  },
  fotbalKalendar: (d) => {
    fotbalVKalendari = (d.tymy || []).filter((t) => fotbalUkazka.tymy.some((x) => x.klic === t));
    return { pridano: fotbalVKalendari.length * 3, upraveno: 0, beze_zmeny: 0, kalendare: {}, kalendareSeznam: kopie(kalendare) };
  },
  zdravi: () => zdraviUkazka(),
  whoopPropojit: () => { throw new Error('V ukázce se WHOOP nepropojuje – po připojení motoru to půjde.'); },
  whoopOdpojit: () => zdraviUkazka().whoop,
  zdraviKlic: () => ({ klic: 'ukazka-klic-pro-zkratku-zdravi-0000' }),
  pocasi: () => {
    // ukázka: zítra odpoledne žluté bouřky, jinak klid; předpověď na 4 dny jako od ČHMÚ
    const dnyPred = [['slunce', 'Převážně jasno', [19, 23], null], ['bourka', 'Odpoledne bouřky', [24, 28], [12, 15]],
      ['polojasno', 'Polojasno, ochlazení', [17, 21], [9, 12]], ['dest', 'Oblačno, místy déšť', [14, 17], [8, 11]]];
    return {
      vytvoreno: Date.now(), misto: 'Veselí nad Moravou', souhrn: 'Silné bouřky', zdroj: 'ČHMÚ',
      vystrahy: [{ typ: 'vystraha', uroven: 'zluta', nazev: 'Silné bouřky', od: den(1, 14, 0), do: den(1, 22, 0), oblast: 'Veselí nad Moravou',
        celyKraj: true, text: 'Je třeba dbát na bezpečnost především s ohledem na nebezpečí zásahu bleskem a úrazu padajícími předměty.', popis: '' }],
      reky: [{ typ: 'hladina', uroven: 'zelena', nazev: 'Morava – Strážnice', stav: 'bez povodně', kdy: ted - H, hladina: 82, trend: 'ustálená',
        spa: 0, spaPredpoved: 0, maxPredpoved: 84, kdyMax: den(1, 6, 0), spa1: 530, text: 'Hladina 82 cm, ustálená (1. SPA od 530 cm).' }],
      predpovedi: dnyPred.map((p, i) => ({ nazev: 'Předpověď', od: den(i, 5, 0), do: den(i + 1, 0, 0), den: iso(den(i, 12, 0)), oblast: 'Jihomoravský kraj',
        uvod: p[1], pocasi: '', tMax: p[2], tMin: p[3], srazky: p[0] === 'dest' ? '1 až 4 mm' : '', vitr: '', jevy: p[0] === 'bourka' ? ['bouřky'] : [],
        ikona: p[0], uroven: p[0] === 'bourka' ? 'zluta' : 'info', vydano: ted - 2 * H }))
    };
  }
};

/** Napodobí motor včetně krátkého zpoždění sítě. */
export function ukazkaVolej(nazev, data) {
  return new Promise((ok, chyba) => {
    setTimeout(() => {
      try {
        if (!akce[nazev]) throw new Error('Neznámá akce: ' + nazev);
        ok(akce[nazev](data || {}));
      } catch (e) { chyba(e); }
    }, 250 + Math.random() * 350);
  });
}
