// Vymyšlená data „po měsících používání“ pro měření rychlosti (testy/mereni_rychlosti.js): stejné tvary jako motor
// (apps-script/Kod.gs), ale v objemu skutečného provozu – 145 konverzací, 90 položek schránky, 5 událostí denně, 90 dní
// zdraví, 3 týmy celé sezóny, 3 roky auta. Nic skutečného: jména, adresy, texty i čísla jsou smyšlené.
'use strict';

const H = 36e5;

/** Deterministická náhoda (stejná data při každém měření). */
function nahoda(seminko) {
  let a = seminko >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vytvorData(T) {
  const r = nahoda(42);
  const vyber = (pole) => pole[Math.floor(r() * pole.length)];
  const pulnoc = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dnes = pulnoc(T);
  const den = (n, h = 0) => { const d = new Date(dnes); d.setDate(d.getDate() + n); return d.getTime() + h * H; };
  const iso = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const SLOVA = ('pasport budova výkres místnost zápas trénink dorost schůzka protokol faktura objednávka lešení fasáda podlaží revize kontrola ' +
    'termín předání stavba projekt rozpočet podklady tabulka připomínky oprava výměna termínu potvrzení dodávka servis změna plán rozpis ' +
    'hřiště autobus sraz dresy kancelář porada vedení zakázka měření sken model export vrstva atributy zásuvky svítidla vzduchotechnika').split(' ');
  const veta = (n) => { const s = []; for (let i = 0; i < n; i++) s.push(vyber(SLOVA)); const t = s.join(' '); return t.charAt(0).toUpperCase() + t.slice(1) + '.'; };
  const text = (vet) => { const s = []; for (let i = 0; i < vet; i++) s.push(veta(6 + Math.floor(r() * 9))); return s.join(' '); };
  const LIDE = ['Jan Testovací', 'Petra Ukázková', 'Trenér dorostu', 'Investor – stavba', 'Kolega z kanceláře', 'Účetní firmy', 'Správa budov', 'Fotbalový svaz',
    'Obecní úřad', 'E-shop Sport', 'Banka', 'Pojišťovna', 'Dodavatel lešení', 'Projektant', 'Stavbyvedoucí', 'Rozhodčí', 'Rodiče dorostu', 'Knihovna',
    'Autoservis', 'Elektro firma', 'Vedoucí projektu', 'Technik budovy', 'Kamarád Pavel', 'Sestřenice', 'Soused', 'Škola', 'Lékař', 'Doprava', 'Kurýr', 'Úřad'];
  const STAVY = ['hori', 'ceka', 'ceka', 'otazka', 'cekas', 'resi', 'resi', 'info', 'info', 'info', 'info'];
  const ukazka = (i) => (i % 4 === 0
    ? '---------- Přeposlaná zpráva --------- Od: ' + vyber(LIDE) + ' <odesilatel' + i + '@example.com> Date: čt 8. 10. 2026 v 10:22 Subject: Re: ' + veta(4) +
      ' To: <ja@example.com> ' + text(2)
    : i % 5 === 0 ? text(2) + ' Dne st 7. 10. 2026 v 9:14 ' + vyber(LIDE) + ' <x' + i + '@example.com> napsal(a): > ' + text(2)
      : text(1 + (i % 3)));
  const STITKY = ['Fotbal', 'Fotbal/Dorost', 'Fotbal/A-tým', 'Účty', 'AUTO', 'AUTO/Servis', 'BYT', 'Práce', 'Práce/BPH', 'Práce/SPORTOVKA', 'Cesty', 'Zdraví',
    'Škola', 'Rodina', 'Nákupy', 'Obec', 'Pojištění', 'VÝVOJ'];

  // ---------------------------------------------------------------- pošta
  const vlakno = (ucet, i) => {
    const st = vyber(STAVY);
    const m = { id: (ucet === 'osobni' ? 'o' : 'w') + i, ucet, stav: st, od: vyber(LIDE), predmet: (r() < 0.3 ? 'Re: ' : '') + veta(3 + Math.floor(r() * 4)).replace(/\.$/, ''),
      ukazka: ukazka(i), kdy: T - (i * 2.7 + r()) * H, neprectena: i < 14 || r() < 0.08, pocet: 1 + Math.floor(r() * 5), odkaz: '#',
      duvod: st === 'hori' ? 'termín do 48 hodin' : st === 'ceka' ? 'prosí o odpověď' : '' };
    if (r() < 0.35) m.aktualizace = true;
    if (r() < 0.3) m.stitky = [vyber(STITKY)];
    if (st === 'ceka' && r() < 0.4) m.navrh = true;
    if (st === 'hori' || (st === 'ceka' && r() < 0.5)) { m.termin = den(1 + Math.floor(r() * 3)); m.terminVeta = 'do ' + (1 + Math.floor(r() * 3)) + '. dne'; }
    return m;
  };
  const osobni = [], pracovni = [];
  for (let i = 0; i < 110; i++) osobni.push(vlakno('osobni', i));
  for (let i = 0; i < 35; i++) pracovni.push(vlakno('pracovni', i));
  const posta = { osobni, pracovni, pracovniAdresa: 'prace@firma.example', firemni: null, pocty: { promo: 23, socialni: 4, fora: 2 },
    prehled: { vytvoreno: new Date(T - 2 * H).toISOString(), prosel: 64,
      dulezite: [0, 1, 2].map((i) => ({ id: 'o' + (40 + i), od: vyber(LIDE), predmet: veta(4), proc: text(1), kategorie: 'aktualizace' })),
      zajimave: [0, 1, 2, 3].map((i) => ({ id: 'o' + (50 + i), od: vyber(LIDE), predmet: veta(4), proc: text(1), kategorie: 'promo' })),
      ostatni: [0, 1, 2, 3, 4].map((i) => ({ skupina: 'Skupina ' + (i + 1), pocet: 2 + i, text: text(1) })) },
    ted: T };
  const detail = (id) => {
    const s = osobni.concat(pracovni).find((m) => m.id === id) || osobni[0];
    const zpravy = [];
    for (let i = 0; i < Math.min(s.pocet, 4); i++) {
      zpravy.push({ id: 'z-' + id + '-' + i, od: i % 2 ? 'Já' : s.od, odAdresa: i % 2 ? 'ja@example.com' : 'odesilatel@example.com', odeMe: !!(i % 2),
        komu: 'ja@example.com', kopie: '', kdy: s.kdy - (s.pocet - 1 - i) * 5 * H, predmet: s.predmet, text: text(6),
        html: i === 0 && s.id.charCodeAt(1) % 2 ? '<div style="font-family:Arial;max-width:600px"><h2>' + s.predmet + '</h2>' + '<p>' + text(8) + '</p>'.repeat(1) +
          '<table>' + '<tr><td>Položka</td><td>Cena</td></tr>'.repeat(20) + '</table></div>' : '', prilohy: i === 0 && r() < 0.3 ? [{ nazev: 'priloha.pdf', velikost: 123456 }] : [] });
    }
    return { id, predmet: s.predmet, odkaz: '#', vDorucenych: true, skryto: 0, ucet: s.ucet, zpravy,
      navrhOdpovedi: s.navrh ? { zpravaId: zpravy[zpravy.length - 1].id, text: text(3), kdy: new Date(T - H).toISOString(), poznamka: '' } : undefined };
  };

  // ---------------------------------------------------------------- schránka
  const polozka = (slozka, i) => {
    const typ = slozka === 'NOVE' ? '' : vyber(['ukol-michal', 'ukol-claude', 'dotaz', 'napad', 'email', 'udalost']);
    const p = { id: slozka.charAt(0).toLowerCase() + i, slozka, kdy: T - (i * 9 + 1) * H, odkud: r() < 0.7 ? 'iPhone' : 'aplikace', typ,
      stav: slozka === 'HOTOVO' ? 'hotovo' : typ === 'ukol-michal' ? 'tvuj-ukol' : typ === 'napad' ? 'napad' : slozka === 'CEKA' ? 'rozhodni' : '',
      shrnuti: slozka === 'NOVE' ? '' : veta(5).replace(/\.$/, ''), termin: slozka === 'CEKA' && r() < 0.4 ? iso(den(Math.floor(r() * 10) - 3)) : '',
      tema: vyber(['', 'prace', 'osobni', 'fotbal', 'zdravi', 'domov']), nadpis: '', text: text(2 + Math.floor(r() * 3)),
      vlakno: slozka === 'NOVE' ? [] : [{ kdo: 'Claude', kdy: iso(T - i * 9 * H) + ' 07:31', text: text(3) + '\n\n- **' + veta(3) + '**\n- ' + veta(5) + '\n- https://example.com/' + i }] };
    if (typ === 'email' && slozka === 'CEKA') p.navrh = { typ: 'email', komu: [vyber(LIDE)], predmet: veta(3), text: text(3) };
    if (typ === 'udalost' && slozka === 'CEKA') p.navrh = { typ: 'udalost', nazev: veta(3), zacatek: iso(den(3)) + 'T10:00', konec: iso(den(3)) + 'T11:00', misto: 'kancelář' };
    return p;
  };
  const schranka = { nove: [0, 1, 2, 3].map((i) => polozka('NOVE', i)), ceka: [], hotovo: [], moje: [], zpracovano: T - 1.5 * H, ted: T };
  for (let i = 0; i < 16; i++) schranka.ceka.push(polozka('CEKA', i));
  for (let i = 0; i < 70; i++) schranka.hotovo.push(polozka('HOTOVO', i));
  for (let i = 0; i < 15; i++) schranka.moje.push({ id: 'moje-' + i, kdy: T - i * 13 * H, odkud: r() < 0.6 ? 'iPhone' : 'aplikace', text: text(1 + (i % 3)) });

  // ---------------------------------------------------------------- kalendář (5 kalendářů, 3–6 událostí denně)
  const KALENDARE = [{ id: 'g-osobni', nazev: 'Osobní', barva: '#2f5bd3', zdroj: 'google', skryty: false, zapis: true, druh: 'osobni' },
    { id: 'ics-prace', nazev: 'Práce', barva: '#0f7c8c', zdroj: 'icloud', skryty: false, druh: 'prace' },
    { id: 'ics-fotbal', nazev: 'Fotbal', barva: '#2e7a4d', zdroj: 'icloud', skryty: false, druh: 'fotbal' },
    { id: 'ics-rodina', nazev: 'Rodina', barva: '#a8620c', zdroj: 'icloud', skryty: false, druh: 'rodina' },
    { id: 'g-svatky', nazev: 'Státní svátky', barva: '#7a5af8', zdroj: 'google', skryty: false, druh: 'ostatni' }];
  const NAZVY = ['Porada týmu', 'Trénink dorostu', 'Schůzka na stavbě', 'Zubař', 'Pasportizace – obchůzka', 'Oběd s kolegy', 'Servis auta', 'Zápas dorostu',
    'Předání podlaží', 'Školení BOZP', 'Nákup', 'Rodinná oslava', 'Telefonát s investorem', 'Kontrola výkresů', 'Plavání'];
  function kalendar(od, doDne) {
    const vysledek = [];
    for (let t = pulnoc(od); t < doDne; t = pulnoc(t + 30 * H)) {
      const di = Math.round(t / 864e5);
      const pocet = 3 + (di % 4);
      for (let k = 0; k < pocet; k++) {
        const kal = KALENDARE[(di + k) % 4];
        const h = 7 + ((di * 3 + k * 4) % 13);
        const z = t + h * H, ko = z + (1 + (k % 2)) * H;
        vysledek.push({ id: 'e' + di + '-' + k + '|' + z, nazev: NAZVY[(di + k * 7) % NAZVY.length], zacatek: z, konec: ko, celodenni: false,
          misto: k % 3 ? 'kancelář' : '', popis: k % 4 ? '' : 'Poznámka k události.', kalendar: kal.nazev, kalendarId: kal.id, barva: kal.barva, zdroj: kal.zdroj, opakovana: k % 2 === 0 });
      }
      if (di % 9 === 0) vysledek.push({ id: 'c' + di + '|' + t, nazev: 'Celodenní akce', zacatek: t, konec: t + 24 * H, celodenni: true, misto: '', popis: '',
        kalendar: 'Rodina', kalendarId: 'ics-rodina', barva: '#a8620c', zdroj: 'icloud' });
    }
    return { udalosti: vysledek.filter((u) => u.zacatek < doDne && u.konec > od), chyby: [], od, do: doDne, ted: Date.now() };
  }

  // ---------------------------------------------------------------- zdraví (90 dní)
  const dny = [], treninky = [], doplnky = {}, pitiJidlo = {}, vaha = [];
  for (let i = 89; i >= 0; i--) {
    const t = den(-i);
    const dt = new Date(t).getDay();
    const skore = Math.round(25 + r() * 70);
    const spanek = Math.round((6 + r() * 2.5) * 60) * 6e4, konec = t + 6.2 * H;
    const zatez = +(4 + r() * 12).toFixed(1), kroky = Math.round(5000 + r() * 9000);
    dny.push({ den: iso(t), whoop: { pripravenost: { skore, hrv: Math.round(50 + r() * 40), klidovyTep: Math.round(48 + r() * 8), spo2: 96.1 },
      spanek: { start: konec - spanek, konec, celkem: spanek, hluboky: spanek * 0.2, rem: spanek * 0.24, lehky: spanek * 0.5, bdeni: spanek * 0.06, vykon: 80, potreba: 8 * H },
      zatez: { probiha: i === 0, zatez, kroky, kcal: 2300 } }, apple: { kroky: Math.round(kroky * 1.05), energie: 500, cviceni: 40, vzdalenost: 6.2 } });
    if (dt === 2 || dt === 4 || dt === 6) treninky.push({ id: 'w' + i, den: iso(t), start: t + 17 * H, konec: t + 18.5 * H, sport: 'soccer', zatez: 12, tepPrumer: 140, tepMax: 182, kcal: 700, zony: [2, 8, 20, 25, 20, 5] });
    if (i < 88) doplnky[iso(t)] = { multivitamin: r() < 0.9, kreatin: r() < 0.8, omega3: r() < 0.7, horcik: r() < 0.6, vitaminc: r() < 0.5 };
    if (i < 60) pitiJidlo[iso(t)] = { piti: [0, 1, 2, 3, 4, 5].map((k) => ({ id: 'p' + i + k, kdy: t + (8 + k * 2) * H, ml: 250 + (k % 2) * 250 })),
      jidlo: [0, 1, 2, 3].map((k) => ({ id: 'j' + i + k, kdy: t + (7 + k * 4) * H, co: veta(3), bilkoviny: 15 + k * 8, kcal: 300 + k * 120, odhad: k === 3 ? 'mistni' : undefined })) };
    if (i % 2 === 0 && i < 80) vaha.push({ kdy: t + 6.7 * H, kg: +(80 - (80 - i) * 0.03 + r() * 0.6).toFixed(1) });
  }
  const zdravi = { vytvoreno: T, dny, treninky: treninky.reverse(), vaha, doplnky, pitiJidlo, tydenni: { tyden: '2026-W40', od: iso(den(-10)), do: iso(den(-4)), kdy: den(-4, 19), text: text(4) },
    whoop: { nastaveno: true, propojeno: true, sync: { kdy: T - 10 * 6e4, chyba: '' } }, apple: { kdy: T - 2 * H },
    rezim: { kofeinDo: '14:00', treninkDny: [2, 4], zapasTymy: ['A', 'dorost'], hlavni: ['multivitamin', 'kreatin', 'omega3', 'horcik'], pitiCil: 2500, bilkovinyCil: 130,
      cilVahy: { kg: 76, do: iso(den(120)), od: { kg: 80, den: iso(den(-60)) } }, polozky: [
        { id: 'multivitamin', nazev: 'Multivitamin', davka: '1 tbl', kdy: 'rano' }, { id: 'kreatin', nazev: 'Kreatin', davka: '5 g', kdy: 'rano' },
        { id: 'omega3', nazev: 'Omega-3', davka: '2 tob', kdy: 'obed' }, { id: 'vitaminc', nazev: 'Vitamin C', davka: '1 tbl', kdy: 'obed' },
        { id: 'protein', nazev: 'Protein', davka: 'po zátěži', kdy: 'po', jen: 'zatez', bilkoviny: 24 },
        { id: 'elektrolyty', nazev: 'Elektrolyty', davka: 'zápas', kdy: 'zapas', jen: 'zapas' }, { id: 'horcik', nazev: 'Hořčík', davka: '1 kps', kdy: 'vecer' }] } };

  // ---------------------------------------------------------------- fotbal (3 týmy, celá podzimní část)
  const KLUBY = ['TJ Testov', 'FK Ukázkov', 'Sokol Vzorová', 'FC Příkladov', 'SK Smyšlená', 'TJ Pokusná', 'FK Modelov', 'Slavoj Náhodná', 'Baník Fiktivní',
    'Spartak Zkušební', 'TJ Ověřená', 'FK Kontrolní', 'Sokol Měřená'];
  const zacatek = (t, h) => { const d = new Date(t + h * H); const z = -d.getTimezoneOffset(); return iso(d.getTime()) + 'T' + String(d.getHours()).padStart(2, '0') + ':00:00' +
    (z >= 0 ? '+' : '-') + String(Math.floor(Math.abs(z) / 60)).padStart(2, '0') + ':00'; };
  const zapasy = [], detaily = {}, tabulky = {};
  [['A', 15], ['B', 15], ['dorost', 10]].forEach(([tym, hod], ti) => {
    for (let k = 0; k < 13; k++) {
      const t = den(-63 + k * 7 + ti);
      const doma = k % 2 === 0;
      const souper = KLUBY[(k + ti) % KLUBY.length];
      const odehrano = t < dnes;
      const id = tym + '-' + k;
      zapasy.push({ id, tym, zacatek: zacatek(t, hod), domaci: doma ? 'FK Agro Vnorovy' : souper, hoste: doma ? souper : 'FK Agro Vnorovy', doma, misto: '',
        vysledek: odehrano ? (k % 4) + ':' + ((k + ti) % 3) : '', stav: odehrano ? 'odehrano' : 'naplanovano', url: '#' });
      if (odehrano) detaily[id] = { polocas: '1:0', goly: [{ min: 12 + k, hrac: 'Hráč ' + k, strana: 'domaci', pozn: '' }, { min: 70, hrac: 'Hráč B' + k, strana: 'hoste', pozn: '' }],
        karty: [{ min: 30, hrac: 'Hráč C' + k, barva: 'zluta', strana: 'hoste' }], divaku: 120 };
    }
    const radky = KLUBY.concat(['FK Agro Vnorovy']).map((klub, i) => ({ poradi: i + 1, klub, z: 9, v: 9 - (i % 9), r: i % 3, p: i % 5, skore: (20 - i) + ':' + (8 + i), body: 27 - i * 2 }));
    tabulky[tym] = { celkem: radky, doma: radky.slice(0, 10), venku: radky.slice(4), aktualizovano: new Date(T).toISOString() };
  });
  const fotbal = { vKalendari: ['dorost'], kalendar: null, data: { verze: 2, aktualizovano: new Date(T - 3 * H).toISOString(), klub: 'FK Agro Vnorovy',
    tymy: [{ klic: 'A', nazev: 'A-tým', barva: '#2e7a4d' }, { klic: 'B', nazev: 'B-tým', barva: '#0f7c8c' }, { klic: 'dorost', nazev: 'Dorost', barva: '#a8620c' }],
    zapasy, tabulky, detaily } };

  // ---------------------------------------------------------------- reely, plakáty, auto, počasí
  const reely = { aktualizovano: new Date(T - H).toISOString(), zverejneno: {}, plan: {}, popiskyPlanu: {}, instagram: { nastaveno: true, ucet: 'klub_test' },
    reely: Array.from({ length: 25 }, (x, i) => ({ id: 'reel_' + i, nazev: 'Vnorovy – Soupeř ' + i + ' ' + (i % 4) + ':1', varianta: '', tymy: ['dorost'], tymNazev: 'Dorost',
      datum: iso(den(-i * 7 - 1)), vyrobeno: iso(den(-i * 7)) + 'T07:48', delka: 48, velikost: 50, video: true, odkaz: '', nahled: '', popisek: text(3),
      zapasy: [{ datum: iso(den(-i * 7 - 1)), tym: 'dorost', domaci: 'Vnorovy', hoste: 'Soupeř ' + i, souper: 'Soupeř ' + i, skore: (i % 4) + ':1', soutez: 'liga' }] })) };
  reely.reely.slice(1).forEach((x) => { reely.zverejneno[x.id] = x.datum; });
  const plakaty = { nastaveni: {}, kola: {}, popisky: {}, plan: {}, obrazky: {}, ig: { nastaveno: true, ucet: 'klub_test' } };
  const tankovani = [], naklady = [];
  let km = 10000;
  for (let i = 0; i < 150; i++) {
    km += 600 + Math.round(r() * 300);
    tankovani.push({ list: 'tankovani', radek: i + 2, datum: den(-1095 + i * 7), datumText: '', polozka: 'Tankování', kategorie: 'Palivo', castka: 1500 + Math.round(r() * 600),
      km: i % 6 === 3 ? null : km, kdo: 'M', poznamka: 'Pumpa', cenaLitr: 34 + Math.round(r() * 80) / 10, litry: 40 + Math.round(r() * 100) / 10 });
  }
  const KATEGORIE = ['Servis', 'Servis - PNEU', 'STK', 'Pojištění', 'Parkování', 'Myčka', 'Nákup doplňků'];
  for (let i = 0; i < 200; i++) naklady.push({ list: 'naklady', radek: i + 2, datum: den(-1090 + i * 5), datumText: '', polozka: veta(2), kategorie: vyber(KATEGORIE),
    castka: 100 + Math.round(r() * 3000), km: null, kdo: vyber(['M', 'K']), poznamka: '' });
  const auto = { nastaveno: true, nazev: 'Testovací auto', odkaz: 'https://docs.google.com/spreadsheets/d/TEST/edit', tankovani, naklady, kategorie: KATEGORIE,
    pripominky: [{ id: 'pneu-zimni', klic: 'pneu-zimni-t', nazev: 'Přezout na zimní pneumatiky', text: 'Objednej pneuservis.', od: den(-2), do: den(30), stav: 'ted', hotovo: false }],
    pece: { radky: Array.from({ length: 40 }, (x, i) => [i % 8 === 0 ? 'ODDÍL ' + i : veta(2), text(1), '']), nadpisy: [0, 8, 16, 24, 32] }, platili: { Michal: 50000, Katka: 40000 },
    myskoda: { aktualizovano: new Date(T).toISOString(), auta: [{ nazev: 'Testovací', model: 'Testovací auto', km: km + 300, kmKdy: new Date(T - 6e5).toISOString(), palivo: 61, dojezd: 510,
      servis: { olejKm: 7700, olejDni: 280, prohlidkaKm: 27700, prohlidkaDni: 697 } }], tankovani: [] }, terminy: {}, ted: T };
  const pocasi = () => ({ vytvoreno: Date.now(), misto: 'Veselí nad Moravou', souhrn: 'Silné bouřky', zdroj: 'ČHMÚ',
    vystrahy: [{ typ: 'vystraha', uroven: 'zluta', nazev: 'Silné bouřky', od: den(1, 14), do: den(1, 22), celyKraj: true, text: 'Je třeba dbát na bezpečnost.', popis: '' }],
    reky: [{ typ: 'hladina', uroven: 'zelena', nazev: 'Morava – Strážnice', stav: 'bez povodně', kdy: T - H, hladina: 82, trend: 'ustálená', spa: 0, spaPredpoved: 0, maxPredpoved: 82, kdyMax: T, spa1: 530, text: 'Hladina 82 cm.' }],
    predpovedi: [0, 1, 2, 3].map((i) => ({ nazev: 'Předpověď', od: den(i), do: den(i + 1), den: iso(den(i, 12)), oblast: 'Jihomoravský kraj', uvod: 'Polojasno',
      tMax: [18 + i, 22 + i], tMin: i ? [8, 11] : null, srazky: '', vitr: '', jevy: [], ikona: 'polojasno', uroven: 'info', vydano: T })) });
  const kontakty = Array.from({ length: 300 }, (x, i) => ({ j: LIDE[i % LIDE.length] + (i >= LIDE.length ? ' ' + i : ''), a: 'kontakt' + i + '@example.com', n: 300 - i }));
  const stitky = STITKY.map((nazev, i) => ({ nazev, neprectenych: i % 4 === 0 ? 2 : 0 }));
  const jmeniny = [['Petra', 'kamarádka'], ['Josef', 'děda'], ['Veronika', ''], ['Pavel', 'z práce'], ['Hana', 'sousedka'], ['Marie', 'babička'], ['Jan', ''],
    ['Tereza', 'sestřenice'], ['Lukáš', 'trenér'], ['Eva', '']].map(([jmeno, kdo]) => ({ jmeno, kdo }));

  return { posta, detail, schranka, kalendar, KALENDARE, zdravi, fotbal, reely, plakaty, auto, pocasi, kontakty, stitky, jmeniny,
    dochazka: { udalosti: [], aktualizovano: new Date(T).toISOString(), chyba: '' } };
}

/** Napodobený motor nad vymyšlenými daty (jen akce, které měření potřebuje; zápisy vrátí rozumnou odpověď). */
function vytvorMotor(data) {
  const kopie = (x) => JSON.parse(JSON.stringify(x));
  const motor = {
    info: () => ({ verze: 'mereni', akce: Object.keys(motor).concat(['polozkaUpravy', 'polozkaTermin', 'autoPeceZapsat']), ucet: 'tester@example.com',
      posta: { osobniAdresa: 'tester@example.com', pracovniAdresa: 'prace@firma.example', lzeOdesilatZPracovni: false, podpisy: { osobni: 'Tester', pracovni: '' } },
      kalendare: data.KALENDARE, skupinyHostu: [], jmeniny: data.jmeniny, pocasi: { misto: 'Veselí nad Moravou', domov: false } }),
    schranka: () => Object.assign(kopie(data.schranka), { ted: Date.now() }),
    posta: () => Object.assign(kopie(data.posta), { ted: Date.now() }),
    vlakno: (d) => data.detail(d.id),
    postaDetaily: (d) => { const detaily = {}; (d.ids || []).slice(0, 10).forEach((x) => { const id = x.id || x; detaily[id] = data.detail(id); }); return { detaily, chyby: {}, vynechano: [], ted: Date.now() }; },
    postaKategorie: (d) => ({ kategorie: d.kategorie, vlakna: [], ted: Date.now() }),
    postaStitek: (d) => ({ nazev: d.nazev, vlakna: data.posta.osobni.filter((m) => (m.stitky || []).indexOf(d.nazev) >= 0), ted: Date.now() }),
    stitky: () => kopie(data.stitky),
    kontakty: () => kopie(data.kontakty),
    kalendar: (d) => data.kalendar(Number(d.od), Number(d.do)),
    kalendare: () => kopie(data.KALENDARE),
    zdravi: () => kopie(data.zdravi),
    zmeny: () => ({ auto: 0, zdravi: 0 }),
    fotbal: () => kopie(data.fotbal),
    reely: () => kopie(data.reely),
    plakaty: () => kopie(data.plakaty),
    auto: () => kopie(data.auto),
    pocasi: () => data.pocasi(),
    dochazka: () => kopie(data.dochazka),
    upozorneni: () => ({ zapnuto: false, tema: '' }),
    oznacit: () => true,
    poznamka: (d) => ({ id: 'n' + Date.now(), slozka: 'NOVE', kdy: Date.now(), odkud: 'aplikace', typ: '', stav: '', shrnuti: '', termin: '', text: d.text, vlakno: [] }),
    mojePridat: (d) => ({ id: 'moje-n' + Date.now(), text: d.text, kdy: Date.now(), odkud: 'aplikace' }),
    pitiJidlo: () => ({ dny: kopie(data.zdravi.pitiJidlo) }),
    doplnky: () => ({ dny: kopie(data.zdravi.doplnky) }),
    davka: (d) => (d.polozky || []).map((p) => { try { return { ok: true, data: motor[p.akce](p) }; } catch (e) { return { ok: false, chyba: e.message }; } })
  };
  return motor;
}

module.exports = { vytvorData, vytvorMotor };
