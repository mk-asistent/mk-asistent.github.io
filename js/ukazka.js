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
    { id: 'c5', slozka: 'CEKA', kdy: ted - 70 * H, odkud: 'iPhone', typ: 'napad', stav: 'napad',
      shrnuti: '3D taktická tabule pro dorost', termin: '', text: 'Nápad: taktická tabule ve 3D, hráči jako figurky.', vlakno: [] }
  ],
  hotovo: [
    { id: 'h1', slozka: 'HOTOVO', kdy: ted - 22 * H, odkud: 'iPhone', typ: 'dotaz', stav: 'hotovo',
      shrnuti: 'Kolik místností má budova ve 2. NP', termin: '', text: 'Kolik místností je ve druhém patře?',
      vlakno: [{ kdo: 'Claude', kdy: iso(ted - 20 * H) + ' 07:32', text: 'Podle tabulky místností je ve 2. NP 48 místností, z toho 6 technických.' }] }
  ]
};

const posta = {
  osobni: [
    { id: 't1', ucet: 'osobni', stav: 'ceka', od: 'Trenér dorostu', predmet: 'Sobotní zápas – sraz v 8:30', ukazka: 'Ahoj, sraz je výjimečně dřív, autobus jede z náměstí. Vezměte si prosím oba dresy.', kdy: ted - 1.2 * H, neprectena: true, pocet: 2, odkaz: '#', stitky: ['Fotbal', 'Fotbal/Dorost'] },
    { id: 't2', ucet: 'osobni', stav: 'info', od: 'Banka', predmet: 'Výpis z účtu za září', ukazka: 'Váš výpis je připraven v internetovém bankovnictví.', kdy: ted - 5 * H, neprectena: true, pocet: 1, odkaz: '#', stitky: ['Účty'] },
    { id: 't3', ucet: 'osobni', stav: 'info', od: 'Google', predmet: 'Bezpečnostní upozornění', ukazka: 'Nové přihlášení na zařízení Windows.', kdy: ted - 28 * H, neprectena: false, pocet: 1, odkaz: '#' },
    { id: 't4', ucet: 'osobni', stav: 'otazka', od: 'Fotbalový svaz', predmet: 'Změna termínu utkání dorostu', ukazka: 'Utkání 10. kola se přesouvá na neděli 10:15. Stihnete to i s autobusem?', kdy: ted - 75 * H, neprectena: false, pocet: 1, odkaz: '#', stitky: ['Fotbal'] }
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
  { id: 'g-osobni', nazev: 'Osobní', barva: '#2f5bd3', zdroj: 'google', skryty: false, zapis: true },
  { id: 'ics-prace', nazev: 'Práce', barva: '#0f7c8c', zdroj: 'icloud', skryty: false },
  { id: 'ics-fotbal', nazev: 'Fotbal', barva: '#2e7a4d', zdroj: 'icloud', skryty: false },
  { id: 'ics-rodina', nazev: 'Rodina', barva: '#a8620c', zdroj: 'icloud', skryty: false }
];
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

function najdiPolozku(id) {
  for (const sk of ['nove', 'ceka', 'hotovo']) {
    const p = schranka[sk].find((x) => x.id === id);
    if (p) return { p, sk };
  }
  throw new Error('Položka nenalezena.');
}

const akce = {
  info: () => ({ verze: 'ukázka', ucet: 'ja@example.com', skupinyHostu: kopie(skupinyHostu),
    posta: { osobniAdresa: 'ja@example.com', pracovniAdresa: posta.pracovniAdresa, lzeOdesilatZPracovni: true, podpisy: kopie(podpisy) }, kalendare }),
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
    p.vlakno.push({ kdo: 'Michal', kdy: '', text: d.jak === 'odpoved' ? d.text : { hotovo: 'Hotovo.', zahodit: 'Zahodit – nedělat.', udelej: 'Udělej to.' }[d.jak] });
    schranka[sk] = schranka[sk].filter((x) => x.id !== d.id);
    if (d.jak === 'hotovo' || d.jak === 'zahodit') { p.slozka = 'HOTOVO'; schranka.hotovo.unshift(p); } else { p.slozka = 'NOVE'; schranka.nove.unshift(p); }
    return true;
  },
  posta: () => kopie(Object.assign({}, posta, { ted: Date.now() })),
  vlakno: (d) => {
    const v = zpravyVlaken[d.id];
    if (!v) throw new Error('Zpráva nenalezena.');
    [posta.osobni, posta.pracovni].forEach((s) => s.forEach((m) => { if (m.id === d.id) m.neprectena = false; }));
    return kopie(Object.assign({ id: d.id, odkaz: '#', vDorucenych: true, skryto: 0 }, v));
  },
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
    kalendare.push({ id: 'ics-' + Date.now(), nazev: String(d.nazev || '').trim() || 'Kalendář z iPhonu', barva: d.barva || '#8e5bd3', zdroj: 'icloud', skryty: false });
    return kopie(kalendare);
  },
  kalendarUpravit: (d) => {
    const k = kalendare.find((x) => x.id === d.id);
    if (k) { if (d.skryty !== undefined) k.skryty = !!d.skryty; if (d.nazev) k.nazev = d.nazev; if (d.barva) k.barva = d.barva; }
    return kopie(kalendare);
  },
  kalendarOdebrat: (d) => { const i = kalendare.findIndex((x) => x.id === d.id); if (i >= 0) kalendare.splice(i, 1); return kopie(kalendare); },
  kalendarZalozit: (d) => {
    const nazev = String(d.nazev || '').trim();
    if (!nazev) throw new Error('Doplň název kalendáře.');
    let k = kalendare.find((x) => x.nazev === nazev && x.zapis);
    if (!k) { k = { id: 'g-' + Date.now(), nazev, barva: d.barva || '#2e7a4d', zdroj: 'google', skryty: false, zapis: true }; kalendare.push(k); }
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
