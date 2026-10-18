// Asistent na PC – co ohlásit oznámením ve Windows a jaké číslo dát na ikonu (čisté funkce bez DOM a stavu;
// test testy/test_pc_vyber.mjs). Volá je js/pc.js nad daty, která aplikace už má (kopie ze serveru přes onSnapshot,
// motor) – žádná nová serverová infrastruktura. Michal 18. 10.: „widget na PC … oznámení na e-maily, rychle se podívat“.
//
// Kandidát = věc, kterou jde ohlásit: { klic (jednoznačný – ohlásí se jednou), druh, id, kdy (ms), cil (kam vede klepnutí),
//   bezZakladu (připomínka – ohlásí se i hned po startu) + data pro text }.
// Druhy: hori, ceka (čeká na tebe / otázka, jen nepřečtené), hlidani (hlídaný odesílatel), jidlo (Claude se ptá),
//   instagram (reel / plakát / příběh vyšel nebo nevyšel), doplnek (připomínka z ZDRAVI_REZIM.json → pripomenout).

export const DRUHY = [
  ['hori', 'Pošta – hoří', 'nová konverzace, která hoří'],
  ['ceka', 'Pošta – čeká na tebe', 'nepřečtená konverzace, která čeká na odpověď (i otázky)'],
  ['hlidani', 'Hlídaní odesílatelé', 'e-mail od někoho, koho hlídáš (POSTA_HLIDANI.json)'],
  ['jidlo', 'Claude se ptá k jídlu', 'otázka k jídlu, které jsi zapsal'],
  ['instagram', 'Instagram', 'reel, plakát nebo příběh vyšel – nebo nevyšel'],
  ['doplnek', 'Připomínka doplňku', 've stejný čas jako upozornění do iPhonu, když doplněk není odškrtnutý']
];

const H = 3600e3;
const STARI_IG = 6 * H;      // hotové / nevyšlé na Instagramu ohlásit jen čerstvé (data nesou i týden staré)
const STARI_JIDLA = 24 * H;  // otázka od Clauda k jídlu
const PAMET_DNI = 30;        // ohlášené klíče v zařízení
const PAMET_MAX = 600;
export const SOUHRN_OD = 4;  // víc nových věcí naráz = jedno souhrnné oznámení (ne lavina)

const cislo = (x) => (typeof x === 'number' ? x : Date.parse(x) || Number(x) || 0);
const dvoj = (n) => String(n).padStart(2, '0');
const isoDen = (t) => { const d = new Date(t); return d.getFullYear() + '-' + dvoj(d.getMonth() + 1) + '-' + dvoj(d.getDate()); };

/** Stav konverzace jako v js/posta.js (neznámý = čeká). */
const stavZpravy = (m) => (['hori', 'ceka', 'otazka', 'cekas', 'resi', 'info'].indexOf(m.stav) >= 0 ? m.stav : 'ceka');

/** Hlídaný odesílatel: motor značí `hlidano` a důvod „hlídáš: …“ (stavADuvod_). */
export const jeHlidany = (m) => !!m && (m.hlidano === true || /^hlídáš/i.test(String(m.duvod || '')));

/** Pošta → kandidáti: hoří (a hlídaní zvlášť) i přečtené, čeká na tebe / otázka jen nepřečtené; bez upozornění Apps Scriptu
 *  (tiche) a bez „Beru na vědomí“. */
export function kandidatiPosty(zpravy) {
  const ven = [];
  (zpravy || []).forEach((m) => {
    if (!m || !m.id || m.tiche || m.vedomi) return;
    const s = stavZpravy(m);
    let druh = '';
    if (s === 'hori') druh = jeHlidany(m) ? 'hlidani' : 'hori';
    else if ((s === 'ceka' || s === 'otazka') && m.neprectena) druh = 'ceka';
    if (!druh) return;
    ven.push({ klic: 'posta:' + m.id + ':' + druh, druh, id: m.id, kdy: cislo(m.kdy), cil: 'vlakno:' + m.id,
      od: String(m.od || '').trim() || 'Neznámý odesílatel', predmet: String(m.predmet || '').trim(), ucet: m.ucet || 'osobni', otazka: s === 'otazka' });
  });
  return ven;
}

/** Jídla, ke kterým se Claude ptá (j.otazka – motor ji posílá jen dokud na ni Michal neodpověděl). pitiJidlo = { den: { jidlo } }. */
export function kandidatiJidla(pitiJidlo, ted) {
  const ven = [];
  Object.keys(pitiJidlo || {}).forEach((den) => {
    ((pitiJidlo[den] || {}).jidlo || []).forEach((j) => {
      if (!j || !j.id || !j.otazka || !j.otazka.text) return;
      const kdy = cislo(j.otazka.kdy);
      if (kdy && ted - kdy > STARI_JIDLA) return;
      ven.push({ klic: 'jidlo:' + j.id + ':' + (kdy || String(j.otazka.text).slice(0, 40)), druh: 'jidlo', id: j.id, kdy: kdy || ted, cil: 'jidlo:' + j.id,
        co: String(j.co || '').trim(), otazka: String(j.otazka.text).trim(), den });
    });
  });
  return ven;
}

/** Konec zveřejňování (hotovo nebo chyba) – jako konec() v js/ig_prubeh.js. */
function konecIg(z) {
  const k = (z && z.kroky) || {};
  return Math.max(cislo(z.zverejneno), cislo(k.hotovo), cislo(k.chyba));
}

/** Instagram: plány reelů, plakátů a příběhů ({ typ, id, z, nazev } z js/ig.js planyInstagramu) – co čerstvě vyšlo nebo nevyšlo. */
export function kandidatiInstagramu(plany, ted) {
  const ven = [];
  (plany || []).forEach((p) => {
    const z = p && p.z;
    if (!z || (z.stav !== 'hotovo' && z.stav !== 'chyba')) return;
    const konec = konecIg(z);
    if (!konec || ted - konec > STARI_IG) return;
    const ok = z.stav === 'hotovo';
    const druhPrispevku = p.typ === 'pribeh' || z.jenPribeh ? 'pribeh' : p.typ === 'plakat' ? 'plakat' : 'reel';
    ven.push({ klic: 'ig:' + p.typ + ':' + p.id + ':' + z.stav + ':' + konec, druh: 'instagram', id: p.typ + ':' + p.id, kdy: konec, cil: 'ig:' + p.typ + ':' + p.id,
      ok, prispevek: druhPrispevku, nazev: String(p.nazev || '').trim(), pribehChyba: ok && !!z.pribehChyba, chyba: ok ? '' : String(z.chyba || '') });
  });
  return ven;
}

const casNa = (c) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(c || '').trim()); return m ? dvoj(m[1]) + ':' + m[2] : ''; };

/**
 * Připomínka doplňků jako motor (pripominkaDoplnku_): rezim.pripomenout [{ id, cas: 'H:MM' }] – od daného času do 21:00, položka
 * platí každý den (bez „jen“) a dnes není odškrtnutá → jedna připomínka za den pro všechny takové. vzato = { id: true } dnes.
 */
export function kandidatDoplnku(rezim, vzato, ted) {
  if (!rezim || !Array.isArray(rezim.pripomenout) || !Array.isArray(rezim.polozky)) return [];
  const d = new Date(ted);
  const hhmm = dvoj(d.getHours()) + ':' + dvoj(d.getMinutes());
  if (hhmm > '21:00') return [];
  const polozky = {};
  rezim.polozky.forEach((x) => { if (x && x.id) polozky[x.id] = x; });
  const chybi = rezim.pripomenout.filter((x) => {
    const cas = x && casNa(x.cas);
    return cas && hhmm >= cas && polozky[x.id] && !polozky[x.id].jen && !(vzato || {})[x.id];
  });
  if (!chybi.length) return [];
  const den = isoDen(ted);
  const prvni = chybi.map((x) => casNa(x.cas)).sort()[0];
  return [{ klic: 'doplnek:' + den, druh: 'doplnek', id: 'doplnek:' + den, kdy: Date.parse(den + 'T' + prvni + ':00') || ted, cil: 'doplnky',
    nazvy: chybi.map((x) => String(polozky[x.id].nazev || x.id)), bezZakladu: true }];
}

/** Tiché hodiny 22:00–6:00 (místní čas). */
export function jeTicho(ted) {
  const h = new Date(ted).getHours();
  return h >= 22 || h < 6;
}

/**
 * Co ukázat. kandidati = výše; pamet = { klic: kdy ohlášeno } (v zařízení – žádné opakování, ani po novém otevření);
 * relace = { start (ms otevření aplikace), zaklad (už proběhlo první vyhodnocení), zname: Set id konverzací / věcí }; volby =
 * { druhy: { druh: bool }, ticho: bool }. Pravidla:
 * - první vyhodnocení po otevření (nebo po zapnutí oznámení) jen zapamatuje, co už je (žádná lavina starých věcí),
 *   kromě připomínek (bezZakladu);
 * - později jen nové: čas věci po otevření aplikace, nebo věc, kterou aplikace už znala v jiném stavu (konverzace začala
 *   hořet). Co přišlo, když byla aplikace zavřená, ukáže okno Co je nového – oznámení ne;
 * - vypnutý druh a tiché hodiny = jen zapamatovat (po zapnutí ani ráno nic nevyskočí najednou).
 * Vrací { ukazat: [kandidát], oznacit: [klíč] } – relace.zaklad nastaví, zname doplní.
 */
export function vyber(kandidati, pamet, relace, volby, ted) {
  const ukazat = [], oznacit = [];
  const druhy = (volby && volby.druhy) || {};
  const ticho = !!(volby && volby.ticho) && jeTicho(ted);
  (kandidati || []).forEach((k) => {
    if (!k || !k.klic || (pamet && pamet[k.klic])) return;
    oznacit.push(k.klic);
    if (!k.bezZakladu && !relace.zaklad) return;
    if (druhy[k.druh] === false || ticho) return;
    if (!k.bezZakladu && !(k.kdy >= relace.start || relace.zname.has(k.id))) return;
    ukazat.push(k);
  });
  relace.zaklad = true;
  (kandidati || []).forEach((k) => { if (k && k.id) relace.zname.add(k.id); });
  return { ukazat, oznacit };
}

/** Paměť ohlášených: přidat klíče, staré (> 30 dní) a nad 600 nejstarší pryč. */
export function ulozDoPameti(pamet, klice, ted) {
  const p = Object.assign({}, pamet || {});
  (klice || []).forEach((k) => { p[k] = ted; });
  const hranice = ted - PAMET_DNI * 864e5;
  let klicePameti = Object.keys(p).filter((k) => p[k] >= hranice);
  if (klicePameti.length > PAMET_MAX) klicePameti = klicePameti.sort((a, b) => p[b] - p[a]).slice(0, PAMET_MAX);
  const ven = {};
  klicePameti.forEach((k) => { ven[k] = p[k]; });
  return ven;
}

const NAZEV_PRISPEVKU = { reel: 'Reel', plakat: 'Plakát', pribeh: 'Příběh' };

/**
 * Text oznámení. Soukromí (Michal: PC v práci vidí ostatní): výchozí jen odesílatel a stav – bez předmětu, textu, jídla
 * a názvů doplňků; sPredmetem = i předmět (u jídla otázka, u Instagramu název, u doplňků názvy). → { titul, text }
 */
export function obsah(k, sPredmetem) {
  if (k.druh === 'hori' || k.druh === 'ceka' || k.druh === 'hlidani') {
    const stav = k.druh === 'hori' ? 'Hoří' : k.druh === 'hlidani' ? 'Hlídaný odesílatel' : k.otazka ? 'Otázka pro tebe' : 'Čeká na tebe';
    const ucet = k.ucet === 'pracovni' ? 'Pracovní pošta' : 'Pošta';
    return { titul: stav + ' · ' + k.od, text: sPredmetem && k.predmet ? k.predmet : ucet + ' · klepni a e-mail se otevře' };
  }
  if (k.druh === 'jidlo') {
    return { titul: 'Claude se ptá k jídlu', text: sPredmetem ? (k.co ? k.co + ': ' : '') + k.otazka : 'Odpověz v Asistentovi (Pití a jídlo)' };
  }
  if (k.druh === 'instagram') {
    const co = NAZEV_PRISPEVKU[k.prispevek] || 'Příspěvek';
    const titul = k.ok ? co + ' vyšel na Instagramu' : co + ' na Instagram nevyšel'; // reel, plakát, příběh – všechno „vyšel“
    const pod = k.ok ? (k.pribehChyba ? 'příspěvek ano, příběh ne' : 'klepni a uvidíš ho') : 'klepni – v Asistentovi zkusíš znovu';
    return { titul, text: sPredmetem && k.nazev ? k.nazev + ' · ' + pod : velkym(pod) };
  }
  if (k.druh === 'doplnek') {
    return { titul: 'Nezapomeň na doplněk', text: sPredmetem ? k.nazvy.join(', ') + ' – ještě není odškrtnuté' : 'Ještě není odškrtnutý – klepni a odškrtni' };
  }
  return { titul: 'Asistent', text: '' };
}
const velkym = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const POPIS_SOUHRNU = { hori: 'hoří', ceka: 'čeká', hlidani: 'hlídaný', jidlo: 'jídlo', instagram: 'Instagram', doplnek: 'doplněk' };

/** Víc nových věcí naráz → jedno oznámení: „5 nových věcí v Asistentovi“, „hoří 2 · čeká 3“. Klepnutí: jen pošta → Pošta. */
export function souhrn(seznam) {
  const pocty = {};
  seznam.forEach((k) => { pocty[k.druh] = (pocty[k.druh] || 0) + 1; });
  const n = seznam.length;
  const jenPosta = seznam.every((k) => k.druh === 'hori' || k.druh === 'ceka' || k.druh === 'hlidani');
  return { titul: n + ' ' + (n < 5 ? 'nové věci' : 'nových věcí') + ' v Asistentovi', text: Object.keys(pocty).map((d) => POPIS_SOUHRNU[d] + ' ' + pocty[d]).join(' · '),
    cil: jenPosta ? 'posta' : 'dnes', klic: 'souhrn' };
}

/**
 * Číslo na ikonu aplikace (Badging API): rezim 'pozornost' = hoří + čeká na odpověď (+ otázky – jako „čeká“ na Přehledu,
 * posta.kPozornosti), 'hori' = jen hoří, 'vypnuto' = nic. Bez upozornění Apps Scriptu a „Beru na vědomí“ (mají stav informace).
 */
export function pocetNaIkonu(zpravy, rezim) {
  if (rezim === 'vypnuto') return 0;
  return (zpravy || []).filter((m) => {
    if (!m || m.tiche || m.vedomi) return false;
    const s = stavZpravy(m);
    return rezim === 'hori' ? s === 'hori' : s === 'hori' || s === 'ceka' || s === 'otazka';
  }).length;
}
