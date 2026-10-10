// Auto: náklady a tankování z Michalovy tabulky Google (motor: auto, autoZapsat, autoUpravit, autoSmazat, autoUctenka,
// autoUctenkaFoto, autoNastavit). Fotka účtenky se rovnou zapíše (když je z ní jasné co) a každý zápis jde upravit
// i s náhledem fotky – změny jdou do tabulky.
// Tabulka zůstává hlavní a je i záloha – stránka z ní počítá přehled (najeto, spotřeba, nafta na km, cena nafty, výdaje
// po měsících a kategoriích, servis podle listu Péče o auto) a nové zápisy, i z vyfocené účtenky, posílá do ní.
// Čísla jsou jen v tabulce a v zařízení (ukázka má vymyšlená).

import { stav, zmeneno, umiMotor, prejdi } from './stav.js';
import { volej, jePripojeno } from './api.js';
import { esc, uloziste, dm, isoDatum, kdyKratce, MESICE_1 } from './pomocne.js';
import { kostra, chybaHtml, toast, potvrd, segment, hlavickaKarty } from './ui.js';
import { IKONY } from './ikony.js';
import { otevriPanel, zavriPanel, obnovPanel, elementPanelu, horniPanel } from './panely.js';
import { bublina, grafAtr } from './grafy.js';

const ULOZISTE = 'asistent.data.auto';
const CELE = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const DVE = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const JEDNO = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// servis podle listu Péče o auto v Michalově tabulce: olej + filtr každých 15 000 km nebo jednou za rok
const SERVIS_KM = 15000, SERVIS_DNI = 365;
const MAX_ZAPISU = 25;

let f = null;          // rozpracovaný zápis (okno Tankování / Výdaj)
let frontaUctenek = []; // víc účtenek najednou: ty, které je potřeba doplnit v okně (otevírají se jedna po druhé)
// na širokém okně fotka účtenky vedle formuláře rovnou (Michal 5. 10.: „vpravo fotka, vlevo editace, upravovat zároveň“)
const SIROKE = window.matchMedia('(min-width: 900px)');
let vseZapisy = false; // seznam zápisů rozbalený

const kc = (x) => CELE.format(Math.round(x)) + ' Kč';
// zkratky měsíců (červen a červenec se nesmí slít do „čer“)
const MES_KR = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const klicMesice = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const jeKoupe = (z) => /koupě auta/i.test(z.kategorie || '');

// ---------------------------------------------------------------- data

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.auto = v.data;
}

function uloz(data) {
  stav.auto = data;
  nactenoKdy = Date.now(); // i po vlastním zápisu – značka změny ze serveru pak nic znovu nenačítá
  uloziste.pis(ULOZISTE, { data, kdy: Date.now() });
}

export function nactiAuto(znovu) {
  if (!umiMotor('auto') || stav.nacita.auto) return Promise.resolve();
  stav.nacita.auto = true;
  stav.chyby.auto = null;
  zmeneno();
  return volej('auto', znovu ? { znovu: true } : {})
    .then(uloz)
    .catch((e) => { stav.chyby.auto = e; })
    .then(() => { stav.nacita.auto = false; zmeneno(); });
}

/**
 * Při překreslení stránky Auto: data ještě nejsou, nebo jsou starší než 6 hodin → načíst znovu. Zápis z jiného
 * zařízení („na PC nevidím nahrané účtenky z mobilu“, 5. 10.) pozná značka změny ze serveru (zkontrolujZmenu) – tabulka
 * se tak nečte při každém návratu do aplikace (Michal 5. 10.: „auto se během dne moc načítat nemusí“). Chyba až po Obnovit.
 */
const AUTO_CERSTVA = 6 * 3600e3;
let nactenoKdy = 0;

/** Server hlásí zápis k autu (značka AUTO_ZMENA) novější než naše data → na stránce Auto hned, jinak při otevření. */
export function zkontrolujZmenu(znacka) {
  if (!znacka || znacka <= nactenoKdy) return;
  nactenoKdy = 0;
  dotahni();
}
export function dotahni() {
  if (stav.pohled !== 'auto' || !umiMotor('auto') || stav.nacita.auto || stav.chyby.auto) return;
  if (Date.now() - nactenoKdy < AUTO_CERSTVA) return;
  nactenoKdy = Date.now();
  nactiAuto();
}
// návrat do aplikace (telefon z pozadí, jiné okno na PC) na stránce Auto → čerstvá data
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') dotahni(); });

/** Stav auta z MyŠkoda (domácí PC → Disk → motor): první auto a kdy je údaj z auta. */
function zAuta(d) {
  const m = d && d.myskoda;
  const a = m && Array.isArray(m.auta) ? m.auta[0] : null;
  if (!a) return null;
  return Object.assign({}, a, { kdy: Date.parse(a.kmKdy || m.aktualizovano) || null });
}

/** Přehled z obou listů: najeto, spotřeba (litry mezi tankováními se známým km), Kč/km, kategorie, měsíce. */
export function prehledAuta(d) {
  const t = (d.tankovani || []).filter((z) => z.datum != null).sort((a, b) => a.datum - b.datum || a.radek - b.radek);
  const n = (d.naklady || []).filter((z) => z.datum != null || z.castka != null);
  const vse = t.concat(n);
  const koupe = n.find((z) => jeKoupe(z) && z.km != null) || null;
  const auto = zAuta(d);
  // stav tachometru: zápisy v tabulce + aktuální údaj z auta (MyŠkoda); spotřeba dál jen z tankování
  const sKm = vse.filter((z) => z.km != null && z.datum != null)
    .concat(auto && auto.km != null && auto.kdy ? [{ km: auto.km, datum: auto.kdy }] : []).sort((a, b) => a.datum - b.datum);
  const kmStart = koupe ? koupe.km : sKm.length ? sKm[0].km : null;
  const datumStart = koupe ? koupe.datum : sKm.length ? sKm[0].datum : null;
  const posledniKm = sKm.reduce((a, z) => (!a || z.km >= a.km ? z : a), null);
  const najeto = kmStart != null && posledniKm ? posledniKm.km - kmStart : null;
  const iKm = [];
  t.forEach((z, i) => { if (z.km != null && z.litry != null) iKm.push(i); });
  let spotreba = null, palivoKm = null;
  if (iKm.length >= 2) {
    const a = iKm[0], b = iKm[iKm.length - 1], usek = t[b].km - t[a].km;
    const mezi = t.slice(a + 1, b + 1);
    if (usek > 0) {
      spotreba = mezi.reduce((s, z) => s + (z.litry || 0), 0) / usek * 100;
      palivoKm = mezi.reduce((s, z) => s + (z.castka || 0), 0) / usek;
    }
  }
  const palivo = t.reduce((s, z) => s + (z.castka || 0), 0);
  const litry = t.reduce((s, z) => s + (z.litry || 0), 0);
  const kategorie = {};
  n.forEach((z) => { if (z.castka) { const k = z.kategorie || 'Ostatní'; kategorie[k] = (kategorie[k] || 0) + z.castka; } });
  if (palivo) kategorie.Palivo = (kategorie.Palivo || 0) + palivo;
  const koupeKc = n.filter(jeKoupe).reduce((s, z) => s + (z.castka || 0), 0);
  const celkem = Object.keys(kategorie).reduce((s, k) => s + kategorie[k], 0);
  const mesice = {};
  vse.forEach((z) => {
    if (!z.castka || z.datum == null || jeKoupe(z)) return;
    const m = mesice[klicMesice(z.datum)] || (mesice[klicMesice(z.datum)] = { palivo: 0, ostatni: 0, kat: {} });
    if (z.list === 'tankovani') m.palivo += z.castka;
    else { m.ostatni += z.castka; const k = z.kategorie || 'Ostatní'; m.kat[k] = (m.kat[k] || 0) + z.castka; }
  });
  const mesicu = datumStart != null && posledniKm ? (posledniKm.datum - datumStart) / (30.44 * 864e5) : 0;
  return {
    najeto, kmStart, datumStart, kmPosledni: posledniKm ? posledniKm.km : null, kmPosledniDatum: posledniKm ? posledniKm.datum : null,
    kmMesic: najeto != null && mesicu > 0.5 ? najeto / mesicu : null, spotreba, palivoKm, palivo, litry,
    cenaPrumer: litry ? palivo / litry : null, kategorie, celkem, koupeKc, provoz: celkem - koupeKc, mesice,
    posledniTankovani: t.length ? t[t.length - 1] : null,
    ceny: t.filter((z) => z.cenaLitr).map((z) => ({ t: z.datum, c: z.cenaLitr, litry: z.litry, castka: z.castka, km: z.km })), auto
  };
}

/** Odhad dnešního stavu km (poslední zapsaný + průměr na den) – jen když je poslední zápis starší než týden. */
function odhadKm(p) {
  if (p.auto || p.kmPosledni == null || !p.kmMesic || !p.kmPosledniDatum) return null;
  const dni = (Date.now() - p.kmPosledniDatum) / 864e5;
  return dni > 7 ? Math.round((p.kmPosledni + p.kmMesic / 30.44 * dni) / 100) * 100 : null;
}

// ---------------------------------------------------------------- stránka

export function podnadpis() {
  const d = stav.auto;
  return d && d.nastaveno ? String(d.nazev || '').split(' - ')[0] : 'Náklady a tankování';
}

export function vykresliAuto(el) {
  const d = stav.auto;
  if (!d) {
    el.innerHTML = '<div class="card">' + (stav.chyby.auto ? chybaAutaHtml(stav.chyby.auto) : kostra(4)) + '</div>';
    return;
  }
  if (!d.nastaveno) { el.innerHTML = nastavitHtml(); return; }
  const p = prehledAuta(d);
  let h = '<div class="auto">';
  if (stav.chyby.auto) h += chybaAutaHtml(stav.chyby.auto);
  h += heroHtml(d, p) + coResitHtml(d) + akceHtml() + tankovaniZAutaHtml(d) + '<div class="auto-mrizka">' + cenyHtml(p) + mesiceHtml(p) + kategorieHtml(d, p) +
    servisHtml(d, p) + '</div>' + zapisyHtml(d) + '</div>';
  el.innerHTML = h;
}

function chybaAutaHtml(chyba) {
  const t = (chyba && chyba.message) || '';
  return chybaHtml(chyba, 'data-auto-znovu') + (/povolitTabulky/.test(t) ? povoleniHtml() : '');
}

/** Jednorázové kroky v editoru motoru (oprávnění k Tabulkám a služba Drive API pro účtenky). */
function povoleniHtml() {
  return '<details class="napoveda auto-povoleni" open><summary>Jak motoru povolit tabulky a účtenky</summary><ol>' +
    '<li>Editor motoru → ⚙ Nastavení projektu → zaškrtni <b>Zobrazit v editoru soubor manifestu „appsscript.json“</b>.</li>' +
    '<li>V souboru <b>appsscript.json</b> nahraď obsah novým z repa (<code>apps-script/appsscript.json</code> – přidává Tabulky a službu Drive) a ulož.</li>' +
    '<li>Vlož nový <b>Kod.gs</b>, ulož, nahoře vyber funkci <b>povolitTabulky</b> → ▶ Spustit → Povolit.</li>' +
    '<li>Nasadit → Spravovat nasazení → tužka → <b>Nová verze</b>.</li></ol></details>';
}

function nastavitHtml() {
  return '<div class="auto"><section class="card auto-nastavit" data-oblast="auto">' + hlavickaKarty(IKONY.auto, 'Propojit tabulku auta') +
    '<p>Vlož odkaz na svou tabulku Google s náklady (listy <b>Náklady</b> a <b>Tankování</b>). Aplikace z ní bude číst a nové zápisy ' +
    'do ní připíše – tabulka zůstává hlavní a je i záloha.</p>' +
    '<div class="auto-nastavit__radek"><input class="field" data-auto-odkaz type="url" inputmode="url" autocomplete="off" autocapitalize="off" ' +
    'spellcheck="false" placeholder="https://docs.google.com/spreadsheets/d/…"><button type="button" class="btn btn--primary" data-auto-propojit>Propojit</button></div>' +
    '<p class="pruh pruh-varovani" data-auto-chyba hidden></p>' + (stav.chyby.auto ? chybaAutaHtml(stav.chyby.auto) : '') + '</section></div>';
}

function heroHtml(d, p) {
  const nazev = String(d.nazev || 'Auto').split(' - ')[0];
  const odhad = odhadKm(p);
  const bunka = (popisek, hodnota, jednotka, pod) => '<div class="auto-cislo"><small>' + popisek + '</small><b class="cisla">' + hodnota + '</b>' +
    '<span>' + jednotka + '</span>' + (pod ? '<em>' + pod + '</em>' : '') + '</div>';
  return '<section class="card auto-hero" data-oblast="auto">' +
    '<div class="auto-hero__hlava"><span class="kruh kruh--auto">' + IKONY.auto + '</span><div class="auto-hero__nazev"><b>' + esc(nazev) + '</b>' +
      '<small>' + (p.datumStart ? 'od koupě ' + esc(dm(p.datumStart)) + ' ' + new Date(p.datumStart).getFullYear() : 'náklady a tankování') + '</small></div>' +
      (d.odkaz ? '<a class="btn btn--ghost btn--sm" href="' + esc(d.odkaz) + '" target="_blank" rel="noopener">' + IKONY.tabulka + '<span>Tabulka</span></a>' : '') + '</div>' +
    '<div class="auto-cisla">' +
      bunka('Najeto od koupě', p.najeto != null ? CELE.format(p.najeto) : '—', 'km', p.kmMesic ? CELE.format(p.kmMesic) + ' km měsíčně' : '') +
      bunka('Spotřeba', p.spotreba != null ? JEDNO.format(p.spotreba) : '—', 'l/100 km', p.litry ? CELE.format(p.litry) + ' l celkem' : '') +
      bunka('Nafta na 1 km', p.palivoKm != null ? DVE.format(p.palivoKm) : '—', 'Kč', p.cenaPrumer ? 'průměr ' + DVE.format(p.cenaPrumer) + ' Kč/l' : '') +
      bunka('Provoz celkem', CELE.format(p.provoz), 'Kč', 'bez koupě auta') +
    '</div>' +
    (p.auto ? zAutaHtml(p.auto) : p.kmPosledni != null ? '<p class="auto-hero__km">Stav tachometru ' + CELE.format(p.kmPosledni) + ' km (' +
      esc(dm(p.kmPosledniDatum)) + ')' + (odhad ? ' · dnes asi <b>' + CELE.format(odhad) + ' km</b> – při tankování zapiš stav, ať sedí spotřeba' : '') + '</p>' : '') +
  '</section>';
}

/** Řádek z auta (MyŠkoda): tachometr, nádrž, dojezd, AdBlue, zamčení a kdy to auto poslalo. */
function zAutaHtml(a) {
  const casti = [a.km != null ? '<b>' + CELE.format(a.km) + ' km</b>' : '', a.palivo != null ? 'nádrž <b>' + a.palivo + ' %</b>' : '',
    a.dojezd != null ? 'dojezd <b>' + CELE.format(a.dojezd) + ' km</b>' : '', a.adblue != null ? 'AdBlue ' + CELE.format(a.adblue) + ' km' : '',
    a.zamceno === 'YES' ? 'zamčeno' : a.zamceno === 'NO' ? '<b class="auto-pozor">odemčeno</b>' : ''].filter(Boolean);
  return '<p class="auto-hero__km auto-z-auta"><span class="auto-z-auta__stitek">' + IKONY.auto + 'z auta</span>' + casti.join(' · ') +
    (a.kdy ? ' <span class="muted">· ' + esc(kdyKratce(a.kdy)) + '</span>' : '') + '</p>';
}

/** Tankování, která poznalo auto (nádrž a spotřeba mezi dvěma denními čteními z MyŠkoda) a v tabulce k nim nic není. */
function tankovaniZAutaHtml(d) {
  const zapsana = (d.tankovani || []).filter((z) => z.datum != null).map((z) => z.datum);
  // den = odhad podle jízd mezi čteními (skript na PC); bez něj platí jen rozmezí od–do
  const chybi = ((d.myskoda && d.myskoda.tankovani) || []).map((x) => ({ od: Date.parse(x.od), do: Date.parse(x.do),
    den: /^\d{4}-\d{2}-\d{2}$/.test(x.den || '') ? Date.parse(x.den + 'T12:00:00') : null, km: x.km, litry: x.litry }))
    .filter((x) => x.od && x.do && !zapsana.some((t) => t >= x.od - 1.5 * 864e5 && t <= x.do + 864e5));
  if (!chybi.length) return '';
  return '<section class="card auto-hlaseni" data-oblast="auto">' + hlavickaKarty(IKONY.palivo, 'Auto hlásí tankování', '<span class="muted">v tabulce chybí</span>') +
    '<ul class="auto-seznam">' + chybi.map((x) => '<li class="auto-zapis auto-zapis--palivo"><span class="kruh kruh--auto">' + IKONY.palivo + '</span>' +
      '<div class="auto-zapis__text"><b>' + (x.litry ? 'asi ' + JEDNO.format(x.litry) + ' l' : 'Tankování') + '</b><small>' +
      (x.den ? 'nejspíš ' + esc(dm(x.den)) + ' (čtení ' + esc(dm(x.od)) + ' – ' + esc(dm(x.do)) + ')' : 'mezi ' + esc(dm(x.od)) + ' a ' + esc(dm(x.do))) +
      (x.km != null ? ' · asi ' + CELE.format(x.km) + ' km' : '') + '</small></div>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-auto-z-auta="' + (x.den || x.do) + '|' + (x.km != null ? x.km : '') + '">' + IKONY.plus + '<span>Zapsat</span></button></li>').join('') +
    '</ul><p class="napoveda auto-hlaseni__pozn">Auto pozná natankování podle stavu nádrže (čte se jednou denně). Datum a částku doplň podle účtenky.</p></section>';
}

function akceHtml() {
  if (!umiMotor('autoZapsat')) return '';
  return '<div class="auto-akce">' +
    '<button type="button" class="btn btn--primary" data-auto-zapis="tankovani">' + IKONY.palivo + '<span>Tankování</span></button>' +
    '<button type="button" class="btn btn--ghost" data-auto-zapis="naklad">' + IKONY.plus + '<span>Výdaj</span></button>' +
    // popisek ke stálému poli pro fotku (VSTUP_FOTO – mimo stránku, překreslení ho nesmaže): klepnutí otevře nabídku
    // iPhonu – Fotky, Vyfotit, Soubory (programové kliknutí iPhone neotevře; bez capture, ať jde vybrat i starší fotka)
    (umiMotor('autoUctenka') ? popisekFotky('btn btn--ghost auto-foto', IKONY.foto + '<span>Účtenky z fotek</span>') : '') +
    '<button type="button" class="btn btn--ghost" data-auto-pece>' + IKONY.auto + '<span>Péče o auto</span></button></div>';
}

/**
 * Cena nafty v čase – čára s tečkami, nejvyšší a nejnižší cena. Každé tankování má pás přes celou výšku grafu: najetí,
 * klepnutí nebo šipky ukážou bublinu s datem, cenou za litr, litry a částkou (js/grafy.js).
 */
function cenyHtml(p) {
  const c = p.ceny;
  if (c.length < 2) return '';
  const W = 600, H = 170, L = 8, R = 8, T = 22, B = 26;
  const t0 = c[0].t, t1 = c[c.length - 1].t;
  const min = Math.min(...c.map((x) => x.c)), max = Math.max(...c.map((x) => x.c));
  const lo = Math.floor(min - 1), hi = Math.ceil(max + 1);
  const x = (t) => L + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const xs = c.map((v) => x(v.t));
  const body = c.map((v, i) => xs[i].toFixed(1) + ',' + y(v.c).toFixed(1)).join(' ');
  const iMax = c.findIndex((v) => v.c === max), iMin = c.findIndex((v) => v.c === min);
  const stitek = (v, nahore) => '<text x="' + Math.min(W - 40, Math.max(40, x(v.t))).toFixed(1) + '" y="' +
    (y(v.c) + (nahore || y(v.c) + 17 > H - B - 4 ? -9 : 17)).toFixed(1) +
    '" text-anchor="middle">' + DVE.format(v.c) + '</text>';
  const mesic = (t) => MES_KR[new Date(t).getMonth()] + ' ' + String(new Date(t).getFullYear()).slice(2);
  const posledni = c[c.length - 1];
  const bod = (v, i) => {
    const l = i ? (xs[i - 1] + xs[i]) / 2 : 0, r = i < c.length - 1 ? (xs[i] + xs[i + 1]) / 2 : W;
    const pod = [v.litry != null ? JEDNO.format(v.litry) + ' l' : '', v.castka != null ? kc(v.castka) : '', v.km != null ? CELE.format(v.km) + ' km' : ''].filter(Boolean).join(' · ');
    return '<g class="graf-bod"' + bublina(dm(v.t) + ' ' + new Date(v.t).getFullYear() + ' · tankování', DVE.format(v.c) + ' Kč/l', pod) + '>' +
      '<rect class="graf-zasah" x="' + l.toFixed(1) + '" y="0" width="' + Math.max(0, r - l).toFixed(1) + '" height="' + H + '"/>' +
      '<line class="graf-voditko" x1="' + xs[i].toFixed(1) + '" x2="' + xs[i].toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
      '<circle cx="' + xs[i].toFixed(1) + '" cy="' + y(v.c).toFixed(1) + '" r="' + (i === iMax || i === iMin || i === c.length - 1 ? 4.5 : 3) + '"' +
      (i === iMax ? ' class="max"' : i === iMin ? ' class="min"' : '') + ' data-kotva/></g>';
  };
  return '<section class="card auto-graf" data-oblast="auto">' + hlavickaKarty(IKONY.palivo, 'Cena nafty', '<span class="muted">naposledy</span> <b>' +
      DVE.format(posledni.c) + ' Kč/l</b>') +
    '<svg class="auto-cara" viewBox="0 0 ' + W + ' ' + H + '"' + grafAtr('Cena nafty od ' + dm(t0) + ' do ' + dm(t1)) + '>' +
      '<line class="osa" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>' +
      '<polyline points="' + body + '"/>' + c.map(bod).join('') +
      '<g class="stitky">' + stitek(c[iMax], true) + (iMin !== iMax ? stitek(c[iMin], false) : '') + '</g>' +
      '<g class="osa-x"><text x="' + L + '" y="' + (H - 6) + '">' + esc(mesic(t0)) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' +
        esc(mesic(t1)) + '</text></g>' +
    '</svg></section>';
}

/**
 * Výdaje po měsících: souvislá řada posledních 13 měsíců (i prázdné), u ledna a prvního sloupce rok – stejný měsíc
 * loni je vidět zvlášť (Michal 5. 10.: „neslučuj dohromady roky“). Najetí, klepnutí nebo Tab / šipky na sloupec = bublina
 * s měsícem, částkou a rozpisem po kategoriích (Michal 9. 10.: „kolik to byla cena a který měsíc“).
 */
function mesiceHtml(p) {
  const prvni = Object.keys(p.mesice).sort()[0];
  if (!prvni) return '';
  const ted = new Date();
  const klice = [];
  for (let i = 12; i >= 0; i--) {
    const k = klicMesice(new Date(ted.getFullYear(), ted.getMonth() - i, 1).getTime());
    if (k >= prvni) klice.push(k);
  }
  const prazdny = { palivo: 0, ostatni: 0, kat: {} };
  const m = (k) => p.mesice[k] || prazdny;
  const max = Math.max(1, ...klice.map((k) => m(k).palivo + m(k).ostatni));
  const prumer = klice.reduce((s, k) => s + m(k).palivo + m(k).ostatni, 0) / klice.length;
  return '<section class="card auto-graf" data-oblast="auto">' + hlavickaKarty(IKONY.tabulka, 'Výdaje po měsících', '<span class="muted">průměr</span> <b>' +
      kc(prumer) + '</b>') +
    '<div class="auto-sloupce"' + grafAtr('Výdaje po měsících', false) + '>' + klice.map((k, i) => {
      const x = m(k), celkem = x.palivo + x.ostatni, mes = Number(k.slice(5));
      const v = (y) => (y ? Math.max(3, Math.round(y / max * 118)) : 0);
      return '<button type="button" class="auto-sloupec"' + bublina(MESICE_1[mes - 1] + ' ' + k.slice(0, 4), celkem ? kc(celkem) : 'žádné výdaje', rozpisMesice(x)) + '>' +
        '<span class="auto-sloupec__cislo cisla">' + (celkem ? (celkem >= 1000 ? JEDNO.format(celkem / 1000) + '<i> tis.</i>' : CELE.format(celkem)) : '') + '</span>' +
        '<span class="auto-sloupec__ostatni" style="height:' + v(x.ostatni) + 'px"></span><span class="auto-sloupec__palivo" style="height:' + v(x.palivo) + 'px"></span>' +
        '<small>' + esc(MES_KR[mes - 1]) + (i === 0 || mes === 1 ? '<i>' + k.slice(0, 4) + '</i>' : '') + '</small></button>';
    }).join('') + '</div>' +
    '<div class="auto-legenda"><span><i class="auto-legenda__palivo"></i>Palivo</span><span><i class="auto-legenda__ostatni"></i>Ostatní = vše kromě paliva</span>' +
    '<span class="muted">najeď nebo klepni na měsíc – částka a rozpis</span></div></section>';
}

/** Rozpis měsíce po kategoriích do bubliny: „palivo 2 100 Kč · servis 1 350 Kč“. */
function rozpisMesice(x) {
  return (x.palivo ? ['palivo ' + kc(x.palivo)] : [])
    .concat(Object.keys(x.kat).sort((a, b) => x.kat[b] - x.kat[a]).map((c) => c.toLowerCase() + ' ' + kc(x.kat[c]))).join(' · ');
}

function kategorieHtml(d, p) {
  const k = Object.keys(p.kategorie).filter((x) => !/koupě auta/i.test(x)).sort((a, b) => p.kategorie[b] - p.kategorie[a]);
  if (!k.length) return '';
  const max = p.kategorie[k[0]];
  const pl = d.platili || null;
  return '<section class="card" data-oblast="auto">' + hlavickaKarty(IKONY.auto, 'Za co', '<b>' + kc(p.provoz) + '</b>') +
    '<ul class="auto-kategorie">' + k.map((x) => '<li><span>' + esc(x) + '</span><i style="--podil:' + Math.max(2, Math.round(p.kategorie[x] / max * 100)) +
      '%"></i><b class="cisla">' + kc(p.kategorie[x]) + '</b></li>').join('') + '</ul>' +
    (p.koupeKc ? '<p class="auto-koupe">Koupě auta <b class="cisla">' + kc(p.koupeKc) + '</b> · celkem s koupí <b class="cisla">' + kc(p.celkem) + '</b></p>' : '') +
    (pl ? '<div class="auto-platili">' + Object.keys(pl).map((j) => '<span class="chip"><b>' + esc(j) + '</b> ' + kc(pl[j]) + '</span>').join('') + '</div>' : '') +
    '</section>';
}

/** Servis podle listu Péče o auto (olej + filtr po 15 000 km nebo roce) od posledního zapsaného servisu, jinak od koupě. */
function servisHtml(d, p) {
  const s = p.auto && p.auto.servis;
  if (s && (s.olejKm != null || s.olejDni != null || s.prohlidkaKm != null || s.prohlidkaDni != null)) return servisZAutaHtml(s, p.auto);
  const servisy = (d.naklady || []).filter((z) => /^servis/i.test(z.kategorie || '') && z.datum != null).sort((a, b) => b.datum - a.datum);
  const od = servisy.length ? { datum: servisy[0].datum, km: servisy[0].km, co: 'od servisu ' + dm(servisy[0].datum) } :
    { datum: p.datumStart, km: p.kmStart, co: 'od koupě ' + (p.datumStart ? dm(p.datumStart) : '') };
  if (od.datum == null) return '';
  const km = odhadKm(p) || p.kmPosledni;
  const ujeto = od.km != null && km != null ? km - od.km : null;
  const dni = Math.floor((Date.now() - od.datum) / 864e5);
  const poKm = ujeto != null && ujeto >= SERVIS_KM, poDnech = dni >= SERVIS_DNI;
  const stav2 = poKm || poDnech ? 'po' : (ujeto != null && ujeto >= SERVIS_KM - 2000) || dni >= SERVIS_DNI - 45 ? 'brzy' : 'ok';
  const text = stav2 === 'po' ? 'Čas na servis' : stav2 === 'brzy' ? 'Servis se blíží' : 'Servis v pořádku';
  return '<section class="card auto-servis auto-servis--' + stav2 + '" data-oblast="auto">' + hlavickaKarty(IKONY.nastaveni, 'Servis') +
    '<p class="auto-servis__stav"><b>' + text + '</b></p>' +
    '<p>' + esc(od.co) + ': <b>' + (ujeto != null ? CELE.format(ujeto) + ' km' : 'km nezapsané') + '</b> · ' + CELE.format(dni) + ' dní' +
      (servisy.length ? '' : ' · zatím žádný servis v tabulce') + '</p>' +
    '<p class="napoveda">Podle tvého listu Péče o auto: olej + filtr každých 15 000 km nebo jednou za rok, pylový filtr ročně. ' +
      'Zapsaný servis (kategorie Servis) počítání vynuluje.</p></section>';
}

/** Servis podle auta (MyŠkoda): kolik zbývá do výměny oleje a do prohlídky. */
function servisZAutaHtml(s, a) {
  const km = [s.olejKm, s.prohlidkaKm].filter((x) => x != null), dni = [s.olejDni, s.prohlidkaDni].filter((x) => x != null);
  const minKm = km.length ? Math.min(...km) : null, minDni = dni.length ? Math.min(...dni) : null;
  const stav2 = (minKm != null && minKm <= 0) || (minDni != null && minDni <= 0) ? 'po' : (minKm != null && minKm <= 1500) || (minDni != null && minDni <= 30) ? 'brzy' : 'ok';
  const radek = (nazev, k, dn) => (k == null && dn == null ? '' : '<li><span>' + nazev + '</span><b>' + [k != null ? (k <= 0 ? 'přes ' + CELE.format(-k) + ' km' :
    'za ' + CELE.format(k) + ' km') : '', dn != null ? (dn <= 0 ? 'prošlé ' + CELE.format(-dn) + ' dní' : 'za ' + CELE.format(dn) + ' dní') : ''].filter(Boolean).join(' nebo ') + '</b></li>');
  return '<section class="card auto-servis auto-servis--' + stav2 + '" data-oblast="auto">' + hlavickaKarty(IKONY.nastaveni, 'Servis', '<span class="muted">podle auta</span>') +
    '<p class="auto-servis__stav"><b>' + (stav2 === 'po' ? 'Čas na servis' : stav2 === 'brzy' ? 'Servis se blíží' : 'Servis v pořádku') + '</b></p>' +
    '<ul class="auto-servis__seznam">' + radek('Výměna oleje', s.olejKm, s.olejDni) + radek('Prohlídka', s.prohlidkaKm, s.prohlidkaDni) + '</ul>' +
    '<p class="napoveda">Z aplikace MyŠkoda' + (a.kdy ? ' (' + esc(kdyKratce(a.kdy)) + ')' : '') + ' – auto počítá servis samo.</p></section>';
}

function zapisyHtml(d) {
  const vse = (d.tankovani || []).concat(d.naklady || []).filter((z) => z.castka != null || z.datum != null)
    .sort((a, b) => (b.datum || 0) - (a.datum || 0) || b.radek - a.radek);
  if (!vse.length) return '';
  const posledni = {};
  ['tankovani', 'naklady'].forEach((l) => { const z = vse.filter((x) => x.list === l).sort((a, b) => b.radek - a.radek)[0]; if (z) posledni[l] = z; });
  const ukaz = vseZapisy ? vse : vse.slice(0, MAX_ZAPISU);
  return '<section class="card auto-zapisy" data-oblast="auto">' + hlavickaKarty(IKONY.tabulka, 'Zápisy', '<span class="muted">' + vse.length + '</span>') +
    '<ul class="auto-seznam">' + ukaz.map((z) => {
      const tank = z.list === 'tankovani';
      const nazev = tank ? 'Tankování' : (z.polozka && z.polozka !== z.kategorie ? z.polozka : z.kategorie || z.polozka || 'Výdaj');
      const pod = [tank ? (z.litry != null ? JEDNO.format(z.litry) + ' l' : '') + (z.cenaLitr ? ' · ' + DVE.format(z.cenaLitr) + ' Kč/l' : '') :
        (z.polozka && z.polozka !== z.kategorie ? z.kategorie : ''), z.km != null ? CELE.format(z.km) + ' km' : '', z.poznamka].filter(Boolean).join(' · ');
      const smazat = posledni[z.list] === z && z.datum != null && z.castka != null && umiMotor('autoSmazat');
      const upravit = z.datum != null && z.castka != null && umiMotor('autoUpravit');
      const obsah = '<span class="kruh kruh--' + (tank ? 'auto' : 'oranz') + '">' +
        (tank ? IKONY.palivo : IKONY.auto) + '</span><div class="auto-zapis__text"><b>' + esc(nazev) + (z.uctenka ? ' <i class="auto-zapis__foto" title="s fotkou účtenky">' +
        IKONY.foto + '</i>' : '') + '</b><small>' +
        esc((z.datum != null ? dm(z.datum) + ' ' + new Date(z.datum).getFullYear() : z.datumText) + (pod ? ' · ' + pod : '')) + '</small></div>' +
        '<span class="auto-zapis__castka cisla">' + (z.castka != null ? kc(z.castka) : '—') + (z.kdo ? '<i class="auto-kdo auto-kdo--' + (z.kdo === 'K' ? 'k' : 'm') +
        '" title="' + (z.kdo === 'K' ? 'Katka' : 'Michal') + '">' + esc(z.kdo) + '</i>' : '') + '</span>';
      return '<li class="auto-zapis' + (tank ? ' auto-zapis--palivo' : '') + '">' +
        (upravit ? '<button type="button" class="auto-zapis__hlavni" data-auto-upravit="' + esc(z.list + ':' + z.radek) + '" aria-label="Upravit zápis">' + obsah + '</button>' : obsah) +
        (smazat ? '<button type="button" class="btn btn--ikona" data-auto-smazat="' + esc(z.list + ':' + z.radek) + '" aria-label="Smazat zápis (překlep)">' +
          IKONY.smazat + '</button>' : '') + '</li>';
    }).join('') + '</ul>' +
    (vse.length > MAX_ZAPISU ? '<button type="button" class="odkaz auto-vse" data-auto-vse>' + (vseZapisy ? 'Méně' : 'Všechny zápisy (' + vse.length + ')') + '</button>' : '') +
    '</section>';
}

// ---------------------------------------------------------------- péče o auto (list „Péče o auto – text“ v tabulce)

/**
 * List → oddíly. Motor posílá { radky, nadpisy } – nadpis oddílu (nebo hlavička tabulky) = tučný řádek v tabulce;
 * první řádek je název listu. Starší motor posílal jen řádky → nadpis = sloupec A VELKÝMI PÍSMENY (bez závorky).
 */
function oddilyPece(pece) {
  const radky = Array.isArray(pece) ? pece : (pece && pece.radky) || [];
  const tucne = Array.isArray(pece) ? null : (pece && pece.nadpisy) || [];
  const nadpis = (r, i) => (tucne ? tucne.indexOf(i) >= 0 && !!r[0] :
    !!r[0] && /[A-ZÁ-Ž]{4}/.test(r[0]) && r[0].replace(/\(.*\)/, '') === r[0].replace(/\(.*\)/, '').toUpperCase());
  const oddily = [];
  radky.forEach((r, i) => {
    if (i === 0) return;
    if (nadpis(r, i)) {
      const odd = { nazev: r[0], polozky: [] };
      if (r[1].length > 30) odd.polozky.push(['', r[1], r[2]]); // nadpis s textem rovnou za ním
      oddily.push(odd);
    } else if (oddily.length) {
      oddily[oddily.length - 1].polozky.push(r);
    }
  });
  return oddily.filter((o) => o.polozky.length);
}

/** „AUTOMAT DSG“ → „Automat DSG“: malá písmena kromě zkratek (DSG, STK, DPF, TDI, UV). */
const nazevOddilu = (t) => (t.charAt(0) + t.slice(1).toLowerCase()).replace(/\b(dsg|stk|dpf|tdi|uv)\b/gi, (z) => z.toUpperCase());

// ---------------------------------------------------------------- připomínky „Co řešit“ (počítá motor, okna podle dneška)

const SEZONNI_ID = ['pneu-zimni', 'pneu-letni', 'zima', 'jaro'];
const IKONA_PRIPOMINKY = { 'pneu-zimni': '❄️', 'pneu-letni': '☀️', zima: '🧊', jaro: '🌬️', olej: '🛢️', prohlidka: '🔧', adblue: '💧', pojisteni: '📄', znamka: '🛣️', stk: '🔍' };

/**
 * Připomínky z motoru (přezutí, zima, servis podle auta, pojištění, dálniční známka). Sezónní okna se vyhodnotí podle
 * dneška (data můžou být pár dní stará): teď / brzy (30 dní předem) / po skončení pryč; ostatní, jak je poslal motor.
 */
export function pripominky(d) {
  const ted = Date.now();
  return (((d || stav.auto) || {}).pripominky || []).map((x) => {
    if (SEZONNI_ID.indexOf(x.id) < 0) return x;
    if (ted > x.do + 864e5) return null;
    const s = ted >= x.od ? 'ted' : x.od - ted <= 30 * 864e5 ? 'brzy' : null;
    return s ? Object.assign({}, x, { stav: s }) : null;
  }).filter(Boolean).sort((a, b) => (a.hotovo - b.hotovo) || ((a.stav === 'ted' ? 0 : 1) - (b.stav === 'ted' ? 0 : 1)));
}

function kdyPripominky(x) {
  if (x.hotovo) return '✓ hotovo';
  if (SEZONNI_ID.indexOf(x.id) >= 0) return x.stav === 'ted' ? 'do ' + dm(x.do) : 'od ' + dm(x.od);
  return x.stav === 'ted' ? 'teď' : 'brzy';
}

function pripominkaHtml(x) {
  return '<li class="auto-resit__polozka auto-resit--' + (x.hotovo ? 'hotovo' : x.stav) + '"><span class="auto-resit__ikona" aria-hidden="true">' +
    (IKONA_PRIPOMINKY[x.id] || '🚗') + '</span><div class="auto-resit__text"><b>' + esc(x.nazev) + '</b><small>' + esc(x.text) + '</small></div>' +
    '<span class="auto-resit__kdy">' + esc(kdyPripominky(x)) + '</span></li>';
}

/** Karta Co řešit nahoře na stránce Auto (teď a do 30 dní; hotové v sezóně s fajfkou). */
function coResitHtml(d) {
  const x = pripominky(d);
  if (!x.length) return '';
  return '<section class="card auto-resit" data-oblast="auto">' + hlavickaKarty(IKONY.kalendar, 'Co řešit',
    '<button type="button" class="odkaz" data-auto-pece>Péče o auto</button>') + '<ul class="auto-resit__seznam">' + x.map(pripominkaHtml).join('') + '</ul></section>';
}

/** Dnes → Vyžaduje pozornost: co je u auta potřeba řešit teď (z naposledy načtených dat auta). */
export function pripominkyDnes() {
  return pripominky().filter((x) => x.stav === 'ted' && !x.hotovo);
}

export function pripominkaDnesHtml(x) {
  return '<li class="auto-dnes"><button type="button" class="auto-dnes__btn" data-cil="auto"><span class="auto-resit__ikona" aria-hidden="true">' +
    (IKONA_PRIPOMINKY[x.id] || '🚗') + '</span><span class="auto-dnes__text"><b>' + esc(x.nazev) + '</b><small>' + esc(x.text) + '</small></span>' +
    '<span class="auto-resit__kdy">' + esc(kdyPripominky(x)) + '</span></button></li>';
}

/** Totéž na telefonu: karta jako ostatní položky „Vyžaduje pozornost“ (vzor PriorAuth) – klepnutí otevře stránku Auto. */
export function pripominkaPozorHtml(x) {
  return '<li><button type="button" class="pozor" data-cil="auto">' +
    '<span class="pozor__hora"><span class="kruh kruh--auto-tint" aria-hidden="true">' + (IKONA_PRIPOMINKY[x.id] || '🚗') + '</span>' +
    '<span class="pozor__text"><b>' + esc(x.nazev) + '</b><small>' + esc(x.text) + '</small></span></span>' +
    '<span class="pozor__radek">' + IKONY.cas + '<span>Auto</span><em>' + esc(kdyPripominky(x)) + '</em></span></button></li>';
}

// ---------------------------------------------------------------- panel Péče o auto (tlačítko na liště stránky Auto)

const IKONA_ODDILU = [[/plán/i, '🗓️'], [/podle km/i, '📍'], [/celková|celý rok/i, '🔧'], [/zima/i, '❄️'], [/léto/i, '☀️'], [/dsg|automat/i, '⚙️'],
  [/návyk/i, '🧭'], [/jak často/i, '🔁'], [/mytí|mýt/i, '🧽'], [/vyhnout/i, '⚠️'], [/půl roku/i, '💎']];
const ikonaOddilu = (n) => (IKONA_ODDILU.find((x) => x[0].test(n)) || [null, '📝'])[1];

const KOLA = '<div class="pece-kola"><div class="pece-kola__karta pece-kola--zima"><span aria-hidden="true">❄️</span><b>Na zimní</b>' +
  '<p>jakmile teploty klesají pod 7 °C – obvykle od poloviny října do poloviny listopadu</p><small>při sněhu a náledí povinné od 1. 11. do 31. 3.</small></div>' +
  '<div class="pece-kola__karta pece-kola--leto"><span aria-hidden="true">☀️</span><b>Na letní</b><p>až se teploty drží nad 7 °C – obvykle v dubnu</p>' +
  '<small>pneuservis objednej s předstihem</small></div></div>' +
  '<ul class="pece-rady"><li>Dezén: zimní vyměnit pod 4 mm (zákonné minimum), letní pod 3 mm (minimum je 1,6 mm).</li>' +
  '<li>Pneumatiky starší 6–8 let vyměnit, i když mají dezén – rok výroby je v kódu DOT na boku.</li>' +
  '<li>Při přezutí nech kola vyvážit a dotáhnout, tlak kontroluj 1× měsíčně.</li>' +
  '<li>Asistent připomene přezutí na zimní od 10. 10. a na letní od 20. 3. (na stránce Auto, na Dnes a upozorněním do iPhonu).</li></ul>';

// termíny, které v tabulce nejsou – motor je drží v AUTO/terminy.json a připomene je v Co řešit (zapsat je může i Claude)
const TERMINY = [['znamka', '🛣️', 'Dálniční známka platí do'], ['stk', '🔍', 'STK platí do'], ['pojisteni', '📄', 'Výročí pojištění']];
const terminCasovace = {};

function terminyHtml(t) {
  const x = t || {};
  return '<ul class="pece-terminy">' + TERMINY.map((r) => '<li><span class="pece-ikona" aria-hidden="true">' + r[1] + '</span><label><span>' + r[2] + '</span>' +
    '<input type="date" data-auto-termin="' + r[0] + '" value="' + esc(x[r[0]] || '') + '"></label></li>').join('') + '</ul>' +
    '<p class="napoveda">Uloží se hned po změně. Asistent připomene obnovu v Co řešit a do iPhonu – známku a STK 3–6 týdnů předem, pojištění měsíc ' +
    'předem. Bez data bere známku a pojištění z posledního zápisu v Náklady.</p>';
}

function ulozTermin(id, datum) {
  volej('autoTermin', { id, datum })
    .then((data) => { uloz(data); toast(datum ? 'Termín uložený ✓' : 'Termín smazaný'); zmeneno(); if (elementPanelu('auto-pece')) obnovPanel('auto-pece'); })
    .catch((e) => toast(e.message, true));
}

function oddilHtml(ikona, nazev, obsah, otevreny, pocet) {
  return '<details class="pece-oddil"' + (otevreny ? ' open' : '') + '><summary><span class="pece-ikona" aria-hidden="true">' + ikona + '</span><span>' + esc(nazev) +
    '</span>' + (pocet ? '<small>' + pocet + '</small>' : '') + '</summary><div class="pece-obsah">' + obsah + '</div></details>';
}

function seznamPeceHtml(polozky) {
  return '<ul class="pece-seznam">' + polozky.map((r) => '<li>' + (r[0] ? '<b>' + esc(r[0]) + '</b>' : '') + '<span>' + esc(r[1]) + '</span>' +
    (r[2] ? '<small>' + esc(r[2]) + '</small>' : '') + '</li>').join('') + '</ul>';
}

/** Přehled podle km jako osa: hotové šedě, teď (stav tachometru), další zvýrazněný s „za X km“. */
function osaKmHtml(oddil, km) {
  const body = oddil.polozky.filter((r) => /^\d[\d\s ]*km$/i.test(r[0])).map((r) => ({ km: Number(r[0].replace(/\D/g, '')), co: r[1] }));
  const ostatni = oddil.polozky.filter((r) => !/^\d[\d\s ]*km$/i.test(r[0]));
  if (!body.length || km == null) return seznamPeceHtml(oddil.polozky);
  let h = '<ol class="pece-osa">', uzTed = false, dalsi = false;
  body.forEach((b) => {
    if (!uzTed && b.km > km) { h += '<li class="pece-osa__ted"><b>teď ' + CELE.format(km) + ' km</b><span>stav tachometru</span></li>'; uzTed = true; }
    const trida = b.km <= km ? 'hotovo' : !dalsi ? 'dalsi' : 'pozdeji';
    h += '<li class="pece-osa--' + trida + '"><b>' + CELE.format(b.km) + ' km</b><span>' + esc(b.co) + '</span>' +
      (trida === 'dalsi' ? '<small>za ' + CELE.format(b.km - km) + ' km</small>' : '') + '</li>';
    if (trida === 'dalsi') dalsi = true;
  });
  if (!uzTed) h += '<li class="pece-osa__ted"><b>teď ' + CELE.format(km) + ' km</b><span>stav tachometru</span></li>';
  return h + '</ol>' + (ostatni.length ? seznamPeceHtml(ostatni) : '');
}

function servisZAutaPeceHtml(a) {
  const s = (a && a.servis) || {};
  const radek = (nazev, km, dni) => (km == null && dni == null ? '' : '<li><b>' + nazev + '</b><span>za ' +
    [km != null ? CELE.format(km) + ' km' : '', dni != null ? dni + ' dní' : ''].filter(Boolean).join(' nebo ') + '</span></li>');
  const h = radek('Výměna oleje', s.olejKm, s.olejDni) + radek('Prohlídka', s.prohlidkaKm, s.prohlidkaDni) +
    (a && a.adblue != null ? '<li><b>AdBlue</b><span>dojezd ' + CELE.format(a.adblue) + ' km</span></li>' : '');
  return h ? '<ul class="pece-seznam">' + h + '</ul><p class="napoveda">Z aplikace MyŠkoda – auto počítá servis samo.</p>' : '';
}

/** Panel Péče o auto: co řešit, kdy přezouvat, servis podle auta, pak oddíly z listu „Péče o auto – text“. */
function peceHtml() {
  const d = stav.auto || {};
  const p = d.nastaveno ? prehledAuta(d) : null;
  let h = '<div class="pece">';
  const x = pripominky(d);
  if (x.length) h += oddilHtml('📌', 'Co řešit', '<ul class="auto-resit__seznam">' + x.map(pripominkaHtml).join('') + '</ul>', true);
  h += oddilHtml('📅', 'Termíny', terminyHtml(d.terminy), true);
  h += oddilHtml('🛞', 'Kdy přezouvat', KOLA, true);
  const servis = servisZAutaPeceHtml(p && p.auto);
  if (servis) h += oddilHtml('🔧', 'Servis podle auta', servis, true);
  const oddily = d.pece ? oddilyPece(d.pece) : [];
  oddily.forEach((o) => {
    const km = /podle km/i.test(o.nazev);
    h += oddilHtml(ikonaOddilu(o.nazev), nazevOddilu(o.nazev), km ? osaKmHtml(o, p ? p.kmPosledni : null) : seznamPeceHtml(o.polozky),
      km || /plán/i.test(o.nazev), o.polozky.length);
  });
  if (!oddily.length) h += '<p class="napoveda">Rady a plán údržby jsou v tabulce v listu „Péče o auto – text“.</p>';
  if (d.odkaz) h += '<p class="napoveda"><a class="odkaz" href="' + esc(d.odkaz) + '" target="_blank" rel="noopener noreferrer">Upravit v tabulce</a> – oddíl začíná tučným řádkem.</p>';
  return h + '</div>';
}

export function otevriPeci() {
  otevriPanel({ id: 'auto-pece', trida: 'panel-bocni panel-pece', titul: 'Péče o auto', vykresli: peceHtml });
}

// ---------------------------------------------------------------- zápis (okno)

const cisloPole = (x) => (x == null || x === '' ? '' : String(x).replace('.', ','));
const cislo = (x) => { const t = String(x == null ? '' : x).replace(/[\s ]/g, '').replace(/kč|km/gi, '').replace(',', '.'); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null; };

/**
 * Okno zápisu. navrh: údaje z účtenky / hlášení auta, nebo s uprava: { list, radek, puvodniDatum, puvodniCastka } oprava
 * existujícího řádku (změny jdou do tabulky). nahled / velka = fotka účtenky z telefonu, uctenka = fotka na Disku.
 */
export function otevriZapis(druh, navrh) {
  const n = navrh || {};
  const a = zAuta(stav.auto);
  const kmZAuta = !n.uprava && druh !== 'naklad' && a && a.km != null && a.kdy && Date.now() - a.kdy < 3 * 36e5 ? a : null;
  f = {
    druh: druh === 'naklad' ? 'naklad' : 'tankovani', datum: n.datum || isoDatum(Date.now()), castka: cisloPole(n.castka), cenaLitr: cisloPole(n.cenaLitr),
    km: n.km != null && n.km !== '' ? String(n.km) : kmZAuta ? String(kmZAuta.km) : '', kmZAuta: n.km != null && n.km !== '' ? 0 : kmZAuta ? kmZAuta.kdy : 0,
    kdo: n.kdo === 'K' ? 'K' : 'M', kategorie: n.kategorie || '', polozka: n.polozka || '', poznamka: n.poznamka != null ? n.poznamka : (n.obchod || ''),
    uctenka: n.uctenka || '', nahled: n.nahled || '', velka: n.velka || '', foto: '', fotoNacitam: false,
    fotoVedle: !!(n.velka || n.nahled) && SIROKE.matches, fotoZoom: false,
    chybaTextu: n.chybaTextu || '', zUctenky: !!n.uctenka && !n.uprava, uprava: n.uprava || null, ukladam: false,
    rychla: n.rychla || '' // rychlá volba výdaje (Mytí…) – zvýrazněná pilulka
  };
  const moje = f;
  otevriPanel({
    id: 'auto-zapis', trida: 'panel-okno panel-formular',
    titul: () => (f && f.uprava ? 'Upravit ' + (f.druh === 'tankovani' ? 'tankování' : 'výdaj') : f && f.druh === 'naklad' ? 'Výdaj za auto' : 'Tankování'),
    vykresli: zapisHtml,
    paticka: () => '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--primary" data-auto-ulozit' + (f && f.ukladam ? ' disabled' : '') + '>' + IKONY.fajfka + '<span>' +
      (f && f.ukladam ? 'Zapisuji…' : f && f.uprava ? 'Uložit změny' : 'Zapsat do tabulky') + '</span></button></div>',
    poOtevreni: (el) => {
      el.classList.toggle('auto-s-fotkou', !!(f && f.fotoVedle));
      // rychlý výdaj s částkou jako minule (Mytí): bez klávesnice – stačí Zapsat (na iPhonu číselná klávesnice nemá Enter)
      if (f.rychla && f.castka) { el.focus({ preventScroll: true }); return; }
      const pole = el.querySelector(f.castka ? '[data-az="km"]' : '[data-az="castka"]');
      if (pole) pole.focus();
    },
    priZavreni: () => {
      if (f === moje) f = null;
      if (frontaUctenek.length) setTimeout(dalsiUctenka, 350); // další účtenka k doplnění
    }
  });
}

function litryText() {
  const c = cislo(f.castka), l = cislo(f.cenaLitr);
  return c && l ? '= ' + JEDNO.format(c / l) + ' l' : '';
}

// kategorie výdajů, které tabulka zná (rozbalovací seznam, použité, Přehled – motor AUTO_.kategorie); bez dat jako motor
const KATEGORIE_ZAKLAD = ['Servis', 'Servis - PNEU', 'STK', 'Pojištění', 'Dálniční známka', 'Parkování', 'Myčka', 'Nákup doplňků', 'Doplňková výbava'];
const kategorieVydaju = (d) => (d && d.kategorie && d.kategorie.length ? d.kategorie : KATEGORIE_ZAKLAD);

/**
 * Rychlé výdaje do okna Výdaj (Michal 10. 10.: „100 Kč za umytí dvěma klepnutími“): Mytí vždy první – kategorie myčky
 * z tabulky (Myčka), částka a položka jako u posledního mytí –, za ním nejvýš dvě kategorie, které byly za poslední rok
 * aspoň dvakrát. [{ nazev, kategorie, castka (null = neznámá), polozka }]
 */
export function rychleVydaje(d) {
  const naklady = ((d && d.naklady) || []).filter((z) => z.datum != null && z.castka && z.kategorie && !jeKoupe(z));
  const myti = kategorieVydaju(d).find((k) => /my[čc]k|myt[ií]/i.test(k)) || 'Myčka';
  const volba = (nazev, k) => {
    const z = naklady.filter((x) => x.kategorie === k).sort((a, b) => b.datum - a.datum || b.radek - a.radek)[0];
    return { nazev, kategorie: k, castka: z ? z.castka : null, polozka: z ? z.polozka || '' : '' };
  };
  const rok = Date.now() - 365 * 864e5, pocty = {};
  naklady.forEach((z) => { if (z.datum >= rok && z.kategorie !== myti) pocty[z.kategorie] = (pocty[z.kategorie] || 0) + 1; });
  const caste = Object.keys(pocty).filter((k) => pocty[k] >= 2).sort((a, b) => pocty[b] - pocty[a]).slice(0, 2);
  return [volba('Mytí', myti)].concat(caste.map((k) => volba(k, k)));
}

function rychleVydajeHtml(d) {
  return '<div class="auto-rychle" role="group" aria-label="Rychlá volba výdaje"><span class="label">Rychle</span><div class="auto-rychle__volby">' +
    rychleVydaje(d).map((r, i) => '<button type="button" class="chip auto-rychle__volba" data-az-rychle="' + i + '" aria-pressed="' + (f.rychla === r.nazev) + '">' +
      (i === 0 ? '<span aria-hidden="true">🧽</span> ' : '') + esc(r.nazev) + (r.castka ? ' <small class="cisla">' + kc(r.castka) + '</small>' : '') + '</button>').join('') +
    '</div></div>';
}

/** Rychlý výdaj z „+“ (Mytí auta): okno Výdaj rovnou s kategorií a částkou jako minule – stačí Zapsat. */
export function otevriRychlyVydaj(i) {
  const r = rychleVydaje(stav.auto)[i || 0];
  otevriZapis('naklad', { kategorie: r.kategorie, polozka: r.polozka, castka: r.castka, rychla: r.nazev });
}

function zapisHtml() {
  if (!f) return '';
  const d = stav.auto || {};
  const p = d.nastaveno ? prehledAuta(d) : null;
  const pole = (klic, popisek, atributy, hodnota, pod) => '<label><span class="label">' + popisek + '</span><input class="field" data-az="' + klic + '" value="' +
    esc(hodnota) + '" autocomplete="off" ' + atributy + '>' + (pod || '') + '</label>';
  let h = '<div class="formular auto-formular">';
  const obrazek = f.foto || f.velka || f.nahled;
  const vedle = !!(obrazek && f.fotoVedle);
  if (obrazek) {
    h += '<div class="auto-uctenka">' + (vedle ? '<span class="kruh kruh--auto">' + IKONY.foto + '</span>' :
      '<button type="button" class="auto-uctenka__foto" data-az-foto-vedle aria-label="Ukázat fotku účtenky vedle formuláře"><img src="' +
      esc(f.nahled || obrazek) + '" alt="Účtenka"></button>') + '<div><b>Účtenka uložená na Disku</b><small>' +
      (f.chybaTextu ? 'Text se nepřečetl – vyplň údaje (' + esc(f.chybaTextu) + ').' :
        vedle ? 'Fotka je ' + (SIROKE.matches ? 'vpravo' : 'nahoře') + ' – údaje uprav podle ní.' :
        f.uprava ? 'Klepni na fotku – ukáže se vedle formuláře.' : 'Údaje z účtenky – zkontroluj je. Do tabulky se připíše odkaz na fotku.') + '</small></div>' +
      (vedle ? '<button type="button" class="btn btn--ghost btn--sm" data-az-foto-vedle>Skrýt fotku</button>' : '') + '</div>';
  } else if (f.uctenka && umiMotor('autoUctenkaFoto')) {
    h += '<div class="auto-uctenka"><span class="kruh kruh--auto">' + IKONY.foto + '</span><div><b>Zápis má fotku účtenky</b><small>Je uložená na tvém Disku.</small></div>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-az-foto' + (f.fotoNacitam ? ' disabled' : '') + '>' + (f.fotoNacitam ? 'Načítám…' : 'Zobrazit') + '</button></div>';
  }
  h += f.uprava ? '' : segment([['tankovani', 'Tankování'], ['naklad', 'Výdaj']], f.druh, 'data-az-druh', 'Druh zápisu');
  if (f.druh === 'naklad' && !f.uprava && !f.zUctenky) h += rychleVydajeHtml(d);
  h += '<div class="fmr fmr--2">' + pole('datum', 'Datum', 'type="date"', f.datum) +
    pole('castka', 'Částka (Kč)', 'inputmode="decimal" placeholder="např. 1 520"', f.castka) + '</div>';
  if (f.druh === 'tankovani') {
    h += '<div class="fmr fmr--2">' + pole('cenaLitr', 'Cena za litr (Kč)', 'inputmode="decimal" placeholder="např. 36,90"', f.cenaLitr,
      '<small class="auto-litry" data-az-litry>' + esc(litryText()) + '</small>') +
      pole('km', 'Stav km', 'inputmode="numeric" placeholder="' + (p && p.kmPosledni != null ? 'naposledy ' + CELE.format(p.kmPosledni) : 'z tachometru') + '"', f.km,
        f.kmZAuta ? '<small class="auto-litry">z auta ' + esc(kdyKratce(f.kmZAuta)) + ' – oprav, jestli jsi od té doby jel</small>' : '') + '</div>';
    const stanice = {};
    (d.tankovani || []).forEach((z) => { if (z.poznamka) stanice[z.poznamka] = (stanice[z.poznamka] || 0) + 1; });
    const nejcastejsi = Object.keys(stanice).sort((a, b) => stanice[b] - stanice[a]).slice(0, 8);
    h += '<label><span class="label">Kde (poznámka)</span><input class="field" data-az="poznamka" list="auto-stanice" value="' + esc(f.poznamka) + '" ' +
      'autocomplete="off" placeholder="čerpací stanice"></label><datalist id="auto-stanice">' + nejcastejsi.map((s) => '<option value="' + esc(s) + '">').join('') + '</datalist>';
  } else {
    const kategorie = kategorieVydaju(d);
    if (!f.kategorie) f.kategorie = kategorie[0];
    h += '<div class="fmr fmr--2"><label><span class="label">Kategorie</span><select class="field" data-az="kategorie">' +
      (kategorie.indexOf(f.kategorie) < 0 ? '<option selected>' + esc(f.kategorie) + '</option>' : '') +
      kategorie.map((k) => '<option' + (k === f.kategorie ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></label>' +
      pole('polozka', 'Položka', 'placeholder="nepovinné – co přesně"', f.polozka) + '</div>' +
      '<div class="fmr fmr--2">' + pole('km', 'Stav km', 'inputmode="numeric" placeholder="nepovinné"', f.km) +
      pole('poznamka', 'Poznámka', 'placeholder="nepovinné"', f.poznamka) + '</div>';
  }
  h += '<div class="formular__radek"><span class="label">Platil</span>' + segment([['M', 'Michal'], ['K', 'Katka']], f.kdo, 'data-az-kdo', 'Kdo platil') + '</div>';
  if (frontaUctenek.length) h += '<p class="napoveda">Po zavření se otevře další účtenka k doplnění (zbývá ' + frontaUctenek.length + ').</p>';
  h += '<p class="pruh pruh-varovani" data-az-chyba hidden></p></div>';
  if (!vedle) return h;
  // fotka vedle formuláře (na telefonu nad ním): klepnutí do fotky ji zvětší / zmenší, celá obrazovka v liště
  return '<div class="auto-zapis-mrizka">' + h + '<figure class="auto-zapis-foto' + (f.fotoZoom ? ' zvetseno' : '') + '">' +
    '<div class="auto-zapis-foto__lista"><button type="button" class="btn btn--ghost btn--sm" data-az-foto-zoom>' + (f.fotoZoom ? 'Zmenšit' : 'Zvětšit') + '</button>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-az-foto-velka>Celá obrazovka</button></div>' +
    '<div class="auto-zapis-foto__okno"><button type="button" class="auto-zapis-foto__obr" data-az-foto-zoom aria-label="' + (f.fotoZoom ? 'Zmenšit' : 'Zvětšit') +
    ' fotku"><img src="' + esc(obrazek) + '" alt="Účtenka"></button></div></figure></div>';
}

/** Fotka vedle formuláře zapnout / vypnout: okno se rozšíří (třída na panelu přežije překreslení obsahu). */
function fotkaVedle() {
  const el = elementPanelu('auto-zapis');
  if (el) el.classList.toggle('auto-s-fotkou', !!(f && f.fotoVedle && (f.foto || f.velka || f.nahled)));
  obnovPanel('auto-zapis');
}

async function ulozZapis() {
  const panel = elementPanelu('auto-zapis');
  const chyba = panel && panel.querySelector('[data-az-chyba]');
  const ukaz = (t) => { if (chyba) { chyba.textContent = t; chyba.hidden = !t; } };
  const castka = cislo(f.castka);
  if (!castka) { ukaz('Napiš částku v Kč.'); return; }
  if (f.druh === 'tankovani' && !cislo(f.cenaLitr)) { ukaz('Napiš cenu za litr – z ní se spočítají litry a spotřeba.'); return; }
  if (f.km && cislo(f.km) == null) { ukaz('Stav km piš jen číslem.'); return; }
  f.ukladam = true;
  obnovPanel('auto-zapis');
  try {
    const udaje = { druh: f.druh, datum: f.datum, castka, cenaLitr: f.druh === 'tankovani' ? cislo(f.cenaLitr) : undefined,
      km: f.km ? cislo(f.km) : '', kdo: f.kdo, kategorie: f.druh === 'naklad' ? f.kategorie : undefined, polozka: f.polozka, poznamka: f.poznamka,
      uctenka: f.uctenka || undefined };
    const data = f.uprava ? await volej('autoUpravit', Object.assign(udaje, f.uprava)) : await volej('autoZapsat', udaje);
    const oprava = !!f.uprava;
    uloz(data);
    zavriPanel();
    toast(oprava ? 'Změna zapsaná do tabulky ✓' : 'Zapsáno do tabulky ✓');
    zmeneno();
  } catch (e) {
    if (!f) return;
    f.ukladam = false;
    obnovPanel('auto-zapis');
    const p2 = elementPanelu('auto-zapis');
    const ch = p2 && p2.querySelector('[data-az-chyba]');
    if (ch) { ch.textContent = e.message; ch.hidden = false; }
  }
}

/// ---------------------------------------------------------------- účtenky z fotek: stálé pole, fronta v zařízení, stav
//
// Michal 10. 10.: „nahrával jsem v iPhonu účtenku a nevidím ji nahranou“ – na Disk nic nedorazilo. Pole pro fotku bylo
// uvnitř stránky Auto, kterou každé překreslení (data ze serveru, návrat z fotoaparátu → obnovVse) přepíše novým HTML:
// výběr z iPhonu pak dostalo odpojené pole a obsluha na document se o něm nedozvěděla – beze slova (test „účtenka přežije
// překreslení“). Stránku mohla během focení přenačíst i nová verze aplikace (js/start.js) a chyba sítě se hlásila jako
// „ještě se zpracovává“, i když fotka motor nikdy neviděla. Teď:
//  - jedno stálé pole v <body> mimo překreslované části; popisky (stránka Auto, „+“, kartička) na něj ukazují přes for;
//  - vybraná fotka se hned zmenší a uloží do fronty v zařízení (IndexedDB) – přežije zavření aplikace i výpadek sítě;
//  - kartička dole ukazuje průběh („Nahrávám účtenku… · Čtu text účtenky · 12 s“), výsledek s částkou a stanicí (Upravit),
//    bez sítě „čeká v telefonu“ (pošle se sama, až bude síť), chyba motoru → Zkusit znovu / Zahodit;
//  - během výběru a nahrávání se aplikace nepřenačte (window.asistentPrace → js/start.js);
//  - když se aplikace během výběru zavřela (iPhone ji při focení občas ukončí), řekne to při dalším otevření.

export const VSTUP_FOTO = 'auto-foto-vstup';
const VYBER = 'asistent.auto.vyber';                 // { kdy } – výběr fotky začal a ještě nedoběhl (přežije zavření aplikace)
const VYBER_PLATI = 20 * 60e3;
const DB = { nazev: 'asistent-auto', tabulka: 'uctenky' };
const SIT_ODKLAD = [20e3, 60e3, 180e3, 600e3];       // další pokus po výpadku sítě (a hned po návratu sítě)

let vstup = null, stavEl = null, stavHtml = '';
let vyberOd = 0;                                     // kdy se otevřel výběr fotky (0 = není otevřený)
let pripravuji = 0;                                  // kolik vybraných fotek se právě zmenšuje
let fronta = [];                                     // { id, otisk, obrazek, nahled, kdy, stav: ceka|odesila|chyba, chyba, sit, pokusu, od }
let davka = { celkem: 0, hotovo: 0 };                // průběh „2 z 3“
let hotove = [], chybyFotek = [];                    // výsledky dávky – souhrn, až je fronta prázdná
let vysledek = null;                                 // { ton: ok|chyba, nadpis, text, upravit, ukazat, doplnit, vybrat }
let bezi = null, casovacSite = 0, casovacStavu = 0, casovacVysledku = 0;

/** Popisek ke stálému poli pro fotku – kdekoli v aplikaci (stránka Auto, „+“); klepnutí otevře výběr fotky. */
export function popisekFotky(trida, obsah) {
  return '<label for="' + VSTUP_FOTO + '" class="' + trida + '">' + obsah + '</label>';
}

function pripravVstup() {
  if (vstup) return vstup;
  vstup = document.createElement('input');
  vstup.type = 'file';
  vstup.accept = 'image/*';
  vstup.multiple = true;
  vstup.id = VSTUP_FOTO;
  vstup.className = 'auto-foto-vstup';
  vstup.tabIndex = -1;
  vstup.setAttribute('aria-hidden', 'true');
  vstup.addEventListener('change', poVyberuFotek);
  vstup.addEventListener('cancel', konecVyberu);
  document.body.appendChild(vstup);
  return vstup;
}

// ---------- fronta v zařízení (IndexedDB; když nejde, jede jen v paměti)

let dbSlib = null;
function otevriDb() {
  if (!dbSlib) {
    dbSlib = new Promise((hotovo, chyba) => {
      if (!window.indexedDB) { chyba(new Error('bez IndexedDB')); return; }
      const r = indexedDB.open(DB.nazev, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(DB.tabulka)) r.result.createObjectStore(DB.tabulka, { keyPath: 'id' }); };
      r.onsuccess = () => hotovo(r.result);
      r.onerror = () => chyba(r.error || new Error('IndexedDB'));
      setTimeout(() => chyba(new Error('IndexedDB neodpovídá')), 4000); // starší Safari otevření občas „zapomene“
    });
    dbSlib.catch(() => { /* fronta jen v paměti */ });
  }
  return dbSlib;
}
function dbAkce(zapis, fn) {
  return otevriDb().then((db) => new Promise((hotovo, chyba) => {
    const t = db.transaction(DB.tabulka, zapis ? 'readwrite' : 'readonly');
    const r = fn(t.objectStore(DB.tabulka));
    t.oncomplete = () => hotovo(r ? r.result : undefined);
    t.onerror = () => chyba(t.error);
    t.onabort = () => chyba(t.error || new Error('IndexedDB'));
  }));
}
const ulozVZarizeni = (x) => dbAkce(true, (s) => s.put(Object.assign({}, x))).catch(() => false);
const smazVZarizeni = (id) => dbAkce(true, (s) => s.delete(id)).catch(() => false);
function odeberZFronty(x) {
  fronta = fronta.filter((u) => u !== x);
  smazVZarizeni(x.id);
}

/** Rozdělaná práce s účtenkou (otevřený výběr fotky, zmenšování, odesílání) – js/start.js kvůli ní nepřenačte novou verzi. */
function pracuje() {
  return (vyberOd > 0 && Date.now() - vyberOd < 10 * 60e3) || pripravuji > 0 || fronta.some((u) => u.stav === 'odesila');
}

function startUctenek() {
  if (!document.body) return;
  pripravVstup();
  stavEl = document.createElement('div');
  stavEl.id = 'auto-uctenky';
  stavEl.className = 'auto-uctenky';
  stavEl.setAttribute('role', 'status');
  stavEl.hidden = true;
  stavEl.addEventListener('click', klikStav);
  document.body.appendChild(stavEl);
  document.addEventListener('click', klikPopisek, true);
  window.addEventListener('online', opakujSit);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') opakujSit(true); });
  (window.asistentPrace = window.asistentPrace || []).push(pracuje);
  // výběr fotky začal, ale aplikace se zavřela dřív, než fotku dostala (iPhone ji při focení občas ukončí) → říct to
  const v = uloziste.cti(VYBER);
  uloziste.smaz(VYBER);
  if (v && v.kdy && Date.now() - v.kdy < VYBER_PLATI && jePripojeno()) {
    vysledek = { ton: 'chyba', vybrat: true, nadpis: 'Fotka účtenky se nenahrála',
      text: 'Výběr fotky se nedokončil – aplikace se mezitím zavřela. Jestli jsi účtenku chtěl nahrát, vyber ji znovu (nejjistější: vyfotit ' +
        'Fotoaparátem a pak vybrat z Fotek).' };
  }
  if (!jePripojeno()) { dbAkce(true, (s) => s.clear()).catch(() => false); return; } // odpojené zařízení: fotky účtenek pryč
  dbAkce(false, (s) => s.getAll()).then((ulozene) => {
    (ulozene || []).forEach((x) => {
      if (x && x.id && x.obrazek && !fronta.some((u) => u.id === x.id)) fronta.push(Object.assign(x, { stav: 'ceka', sit: false }));
    });
    fronta.sort((a, b) => a.kdy - b.kdy);
    vykresliStav();
    setTimeout(() => spustPoStartu(0), 800); // z minula: poslat, až aplikace ví, co motor umí
  }).catch(() => vykresliStav());
  vykresliStav();
}

function spustPoStartu(pokus) {
  if (!fronta.some((u) => u.stav === 'ceka')) return;
  if (!umiMotor('autoUctenka') && pokus < 20) { setTimeout(() => spustPoStartu(pokus + 1), 1500); return; }
  zpracujFrontu();
}

// ---------- výběr fotek

/** Klepnutí na popisek (zachytávání – před překreslením čehokoli): výběr se otevírá. */
function klikPopisek(e) {
  const l = e.target && e.target.closest ? e.target.closest('label[for="' + VSTUP_FOTO + '"]') : null;
  if (!l) return;
  // na iPadu se nabídka Fotky / Vyfotit ukáže u pole – posunout ho pod klepnutý popisek
  const r = l.getBoundingClientRect();
  Object.assign(pripravVstup().style, { left: Math.round(r.left) + 'px', top: Math.round(r.top) + 'px', width: Math.round(r.width) + 'px', height: Math.round(r.height) + 'px' });
  vyberOd = Date.now();
  uloziste.pis(VYBER, { kdy: vyberOd });
}

function konecVyberu() {
  vyberOd = 0;
  uloziste.smaz(VYBER);
}

function poVyberuFotek() {
  const soubory = Array.from(vstup.files || []);
  vyberOd = 0;
  const h = horniPanel();
  if (h && h.id === 'rychle') zavriPanel(); // z „+“ na telefonu – průběh je vidět v kartičce dole
  if (!soubory.length) { konecVyberu(); return; }
  pridejUctenky(soubory);
}

/** Vybrané fotky: zmenšit, uložit do fronty v zařízení a posílat (první se posílá, zatímco se další zmenšují). */
async function pridejUctenky(soubory) {
  clearTimeout(casovacVysledku);
  vysledek = null;
  pripravuji += soubory.length;
  davka.celkem += soubory.length;
  vykresliStav();
  for (const s of soubory) {
    try {
      const x = await pripravUctenku(s);
      if (fronta.some((u) => u.id === x.id)) davka.celkem--; // stejná fotka vybraná dvakrát
      else { fronta.push(x); await ulozVZarizeni(x); }
    } catch (e) {
      davka.celkem--;
      chybyFotek.push(e.message);
    }
    pripravuji--;
    zpracujFrontu();
  }
  if (vstup) vstup.value = ''; // stejnou fotku jde vybrat znovu
  uloziste.smaz(VYBER);        // fotky jsou ve frontě v zařízení – přežijí i zavření aplikace
  dokonciDavku();
  vykresliStav();
}

async function pripravUctenku(soubor) {
  const img = await nactiObrazek(soubor);
  const obrazek = zmensi(img, 1600, 0.82);
  const nahled = zmensi(img, 320, 0.7);
  if (img.close) img.close(); // ImageBitmap – paměť hned pryč
  const otisk = await otiskFotky(obrazek);
  return { id: otisk || 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), otisk, obrazek, nahled, kdy: Date.now(),
    stav: 'ceka', chyba: '', sit: false, pokusu: 0, od: 0 };
}

/** Fotka → obrázek: FileReader + Image (CSP nepouští blob:), jinak createImageBitmap; HEIC ze Souborů neumí každý prohlížeč. */
function nactiObrazek(soubor) {
  const chybaFotky = () => new Error(/hei[cf]/i.test((soubor.type || '') + ' ' + (soubor.name || ''))
    ? 'Fotka je ve formátu HEIC, který tu nejde přečíst – vyber ji přes Fotky (ne Soubory), nebo ji vyfoť znovu.'
    : 'Fotku se nepodařilo načíst – zkus ji vybrat nebo vyfotit znovu.');
  return new Promise((hotovo, chyba) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => hotovo(img);
      img.onerror = () => chyba(chybaFotky());
      img.src = r.result;
    };
    r.onerror = () => chyba(chybaFotky());
    r.readAsDataURL(soubor);
  }).catch((e) => (window.createImageBitmap ? createImageBitmap(soubor).catch(() => { throw e; }) : Promise.reject(e)));
}

/** Zmenšená kopie jako JPEG (data URL) – účtenka se čte dobře i na 1 600 px a posílá se rychle. */
function zmensi(img, max, kvalita) {
  const w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', kvalita);
  c.width = c.height = 0; // iPhone má na plátna málo paměti – uvolnit hned
  if (!/^data:image\/jpeg;base64,./.test(url)) throw new Error('Fotku se nepodařilo zmenšit (málo paměti?) – zkus ji vybrat znovu.');
  return url;
}

/** Otisk fotky (stejná fotka = stejný otisk) – motor podle něj nic nezapíše dvakrát, když se účtenka pošle znovu. */
async function otiskFotky(dataUrl) {
  try {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
    return Array.from(new Uint8Array(h)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return ''; // bez crypto.subtle (ne https) – funguje, jen bez ochrany proti zdvojení
  }
}

// ---------- odesílání (jedna po druhé; stejnou fotku jde poslat znovu – motor ji pozná podle otisku a nic nezdvojí)

function zpracujFrontu() {
  if (bezi) return bezi;
  if (!fronta.some((u) => u.stav === 'ceka')) { dokonciDavku(); return Promise.resolve(); }
  if (!davka.celkem) davka = { celkem: fronta.filter((u) => u.stav === 'ceka').length + pripravuji, hotovo: 0 };
  bezi = (async () => {
    for (let x = fronta.find((u) => u.stav === 'ceka'); x; x = fronta.find((u) => u.stav === 'ceka')) {
      await odesliUctenku(x);
      if (x.stav === 'chyba' && x.sit) {
        // bez sítě nemá cenu zkoušet další – počkají ve frontě a pošlou se s ní
        fronta.forEach((u) => { if (u.stav === 'ceka') Object.assign(u, { stav: 'chyba', sit: true, chyba: x.chyba }); });
        break;
      }
    }
  })().catch((e) => {
    // nečekaná chyba mimo odeslání – nic nesmí zůstat „odesílá se“ (kartička by visela a nová verze se nenačetla)
    fronta.forEach((u) => { if (u.stav === 'odesila') Object.assign(u, { stav: 'chyba', sit: false, chyba: (e && e.message) || 'Nepodařilo se.' }); });
  }).then(() => {
    bezi = null;
    if (fronta.some((u) => u.stav === 'ceka')) zpracujFrontu(); else dokonciDavku();
  });
  vykresliStav();
  return bezi;
}

async function odesliUctenku(x) {
  Object.assign(x, { stav: 'odesila', od: Date.now(), pokusu: (x.pokusu || 0) + 1, chyba: '', sit: false });
  ulozVZarizeni(x);
  vykresliStav();
  try {
    const v = await volej('autoUctenka', { obrazek: x.obrazek, otisk: x.otisk, zapsat: true });
    odeberZFronty(x);
    davka.hotovo++;
    // spojení zase jde → účtenky, které čekaly na síť, hned za ní (ne až po časovači)
    fronta.forEach((u) => { if (u.stav === 'chyba' && u.sit) { u.stav = 'ceka'; davka.celkem++; } });
    clearTimeout(casovacSite);
    if (v && v.zapsano && v.data) {
      uloz(v.data);
      hotove.push({ zapsano: v.zapsano, z: najdiZapis(v.zapsano.list, v.zapsano.radek), foto: { nahled: x.nahled, velka: x.obrazek } });
    } else {
      hotove.push({ navrh: Object.assign({}, (v && v.navrh) || {}, { uctenka: v && v.uctenka, nahled: x.nahled, velka: x.obrazek, chybaTextu: v && v.chybaTextu }) });
    }
    zmeneno();
  } catch (e) {
    // síť / Google odpověď ztratil / motor dlouho neodpovídá → účtenka počká v zařízení a pošle se znovu sama
    const sit = e.kod === 'sit' || e.kod === 'ztracena' || navigator.onLine === false;
    Object.assign(x, { stav: 'chyba', sit, chyba: (e && e.message) || 'Nepodařilo se.' });
    ulozVZarizeni(x);
    if (sit) naplanujOpakovani(x.pokusu);
  }
  vykresliStav();
}

function naplanujOpakovani(pokusu) {
  clearTimeout(casovacSite);
  casovacSite = setTimeout(opakujSit, SIT_ODKLAD[Math.min(Math.max(0, pokusu - 1), SIT_ODKLAD.length - 1)]);
}

/** Účtenky čekající na síť znovu (po časovači, návratu sítě, návratu do aplikace – ten ne hned po pokusu). */
function opakujSit(zNavratu) {
  const cekaji = fronta.filter((u) => u.stav === 'chyba' && u.sit);
  if (!cekaji.length || bezi) return;
  if (zNavratu === true && cekaji.some((u) => Date.now() - (u.od || 0) < 15000)) return;
  clearTimeout(casovacSite);
  cekaji.forEach((u) => { u.stav = 'ceka'; });
  davka = { celkem: 0, hotovo: 0 };
  zpracujFrontu();
}

const popisUctenky = (z) => (z ? [(z.list === 'tankovani' ? 'tankování' : (z.kategorie || 'výdaj').toLowerCase()) + ' ' + kc(z.castka),
  z.list === 'tankovani' ? z.poznamka : z.polozka !== z.kategorie ? z.polozka : '', z.datum != null ? dm(z.datum) : ''].filter(Boolean).join(' · ') : 'zápis je v tabulce');

/** Fronta doběhla: souhrn v kartičce (částka, stanice, Upravit), nejasné účtenky k doplnění v okně. */
function dokonciDavku() {
  if (pripravuji > 0 || bezi) return;
  const zapsane = hotove.filter((r) => r.zapsano), kDoplneni = hotove.filter((r) => r.navrh).map((r) => r.navrh), chybyFoto = chybyFotek;
  hotove = [];
  chybyFotek = [];
  davka = { celkem: 0, hotovo: 0 };
  if (!zapsane.length && !kDoplneni.length && !chybyFoto.length) { vykresliStav(); return; }
  const castka = zapsane.reduce((s, r) => s + ((r.z && r.z.castka) || 0), 0);
  const navic = [kDoplneni.length ? 'k doplnění ' + kDoplneni.length : '', chybyFoto.length === 1 ? chybyFoto[0] : chybyFoto.length ? 'fotky, které nešly načíst: ' + chybyFoto.length : '']
    .filter(Boolean).join(' · ');
  if (zapsane.length === 1) {
    vysledek = { ton: 'ok', nadpis: 'Zapsáno z účtenky', text: popisUctenky(zapsane[0].z) + (navic ? ' · ' + navic : ''), upravit: zapsane[0] };
  } else if (zapsane.length) {
    vysledek = { ton: 'ok', nadpis: 'Účtenky: zapsáno ' + zapsane.length + (castka ? ' (' + kc(castka) + ')' : ''), text: navic || 'všechny jsou v tabulce', ukazat: stav.pohled !== 'auto' };
  } else if (!kDoplneni.length) {
    vysledek = { ton: 'chyba', nadpis: chybyFoto.length > 1 ? 'Fotky se nepodařilo načíst' : 'Fotku se nepodařilo načíst', text: navic, vybrat: true };
  } else {
    vysledek = null; // okno k doplnění samo řekne, že je fotka na Disku
  }
  if (kDoplneni.length) {
    frontaUctenek = frontaUctenek.concat(kDoplneni);
    // nejasná účtenka → okno s předvyplněnými údaji; když je otevřené jiné okno, jen nabídnout (nepřekřikovat rozdělanou práci)
    if (horniPanel()) vysledek = Object.assign(vysledek || { ton: 'ok', nadpis: 'Účtenka je na Disku', text: 'Z fotky není jasné všechno – doplň údaje.' }, { doplnit: true });
    else dalsiUctenka();
  }
  if (vysledek && vysledek.ton === 'ok' && !vysledek.doplnit) casovacVysledku = setTimeout(() => { vysledek = null; vykresliStav(); }, 20000);
  vykresliStav();
}

// ---------- kartička se stavem (dole nad lištou, na PC vpravo dole)

function krokNahravani(x) {
  if (!x || x.stav !== 'odesila') return 'Zmenšuji fotku';
  const s = (Date.now() - x.od) / 1000;
  return s < 4 ? 'Posílám fotku' : s < 75 ? 'Čtu text účtenky' : 'Čtu text účtenky – Google je pomalý, vydrž';
}

function prubeh() {
  const x = fronta.find((u) => u.stav === 'odesila');
  const cast = x ? Math.min(0.92, 0.12 + (Date.now() - x.od) / 50000 * 0.8) : 0.05;
  return Math.max(4, Math.min(100, Math.round((davka.hotovo + cast) / Math.max(1, davka.celkem) * 100)));
}

function radekStavu(nahled, ikona, nadpis, text) {
  return '<div class="auto-uctenky__radek">' + (nahled ? '<img src="' + esc(nahled) + '" alt="">' : '<span class="kruh kruh--auto" aria-hidden="true">' + ikona + '</span>') +
    '<div class="auto-uctenky__text"><b>' + esc(nadpis) + '</b><small>' + text + '</small></div></div>';
}
const tlacitkoStavu = (atribut, popisek, hlavni) => '<button type="button" class="btn ' + (hlavni ? 'btn--primary' : 'btn--ghost') + ' btn--sm" ' + atribut + '>' + popisek + '</button>';

function vykresliStav() {
  if (!stavEl) return;
  const odesila = fronta.find((u) => u.stav === 'odesila');
  const ceka = fronta.filter((u) => u.stav === 'ceka'), chybne = fronta.filter((u) => u.stav === 'chyba');
  let h = '', ton = '';
  if (pripravuji || odesila || (bezi && ceka.length)) {
    ton = 'prace';
    const celkem = Math.max(1, davka.celkem), x = odesila || ceka[0];
    h = radekStavu(x && x.nahled, IKONY.foto, celkem > 1 ? 'Nahrávám účtenky · ' + Math.min(celkem, davka.hotovo + 1) + ' z ' + celkem : 'Nahrávám účtenku…',
      '<span data-au-krok>' + esc(krokNahravani(odesila)) + '</span> <span class="cisla" data-au-cas aria-hidden="true"></span>') +
      '<div class="auto-uctenky__prubeh" aria-hidden="true"><i data-au-prubeh></i></div>';
  } else if (chybne.length) {
    const sit = chybne.every((u) => u.sit), n = chybne.length;
    ton = sit ? 'ceka' : 'chyba';
    h = radekStavu(chybne[0].nahled, IKONY.pozor, sit ? (n > 1 ? 'Účtenky čekají v telefonu (' + n + ')' : 'Účtenka čeká v telefonu') : (n > 1 ? 'Účtenky se nenahrály (' + n + ')' : 'Účtenka se nenahrála'),
      esc(!sit ? chybne[0].chyba : navigator.onLine === false ? 'Jsi bez sítě – pošlu ji sama, až bude síť.' :
        'Spojení s motorem se nepovedlo – zkusím to znovu sám. (' + chybne[0].chyba + ')') +
      // co se mezitím povedlo (jiné účtenky z dávky), ať to chyba nepřekryje
      (vysledek && vysledek.ton === 'ok' ? '<span class="auto-uctenky__povedlo">✓ ' + esc(vysledek.nadpis + (vysledek.text ? ': ' + vysledek.text : '')) + '</span>' : '')) +
      '<div class="auto-uctenky__akce">' + tlacitkoStavu('data-au-zahodit', 'Zahodit') + tlacitkoStavu('data-au-znovu', sit ? 'Zkusit hned' : 'Zkusit znovu', true) + '</div>';
  } else if (ceka.length) {
    ton = 'ceka';
    h = radekStavu(ceka[0].nahled, IKONY.foto, ceka.length > 1 ? 'Účtenky čekají na odeslání (' + ceka.length + ')' : 'Účtenka čeká na odeslání',
      'Pošle se, jakmile se aplikace spojí s motorem.') + '<div class="auto-uctenky__akce">' + tlacitkoStavu('data-au-znovu', 'Odeslat', true) + '</div>';
  } else if (vysledek) {
    ton = vysledek.ton;
    const v = vysledek;
    h = '<button type="button" class="btn btn--ikona auto-uctenky__zavrit" data-au-zavrit aria-label="Zavřít">' + IKONY.zavrit + '</button>' +
      radekStavu(v.upravit && v.upravit.foto ? v.upravit.foto.nahled : '', v.ton === 'ok' ? IKONY.fajfka : IKONY.pozor, v.nadpis, esc(v.text)) +
      (v.vybrat || v.upravit || v.ukazat || v.doplnit ? '<div class="auto-uctenky__akce">' +
        (v.vybrat ? popisekFotky('btn btn--primary btn--sm auto-foto', IKONY.foto + '<span>Vybrat fotku</span>') : '') +
        (v.ukazat ? tlacitkoStavu('data-au-ukazat', 'Ukázat') : '') + (v.doplnit ? tlacitkoStavu('data-au-doplnit', 'Doplnit', true) : '') +
        (v.upravit ? tlacitkoStavu('data-au-upravit', 'Upravit', true) : '') + '</div>' : '');
  }
  if (h !== stavHtml) { stavEl.innerHTML = h; stavHtml = h; }
  stavEl.hidden = !h;
  stavEl.className = 'auto-uctenky' + (ton ? ' auto-uctenky--' + ton : '');
  if (ton === 'prace') {
    tikStavu();
    if (!casovacStavu) casovacStavu = setInterval(tikStavu, 1000);
  } else if (casovacStavu) {
    clearInterval(casovacStavu);
    casovacStavu = 0;
  }
}

/** Každou vteřinu při nahrávání: krok, čas a průběh (jen text a šířka – kartička se nepřekresluje). */
function tikStavu() {
  if (!stavEl) return;
  const x = fronta.find((u) => u.stav === 'odesila');
  const krok = stavEl.querySelector('[data-au-krok]'), cas = stavEl.querySelector('[data-au-cas]'), pruh = stavEl.querySelector('[data-au-prubeh]');
  if (krok && krok.textContent !== krokNahravani(x)) krok.textContent = krokNahravani(x);
  if (cas) cas.textContent = x ? '· ' + Math.max(0, Math.round((Date.now() - x.od) / 1000)) + ' s' : '';
  if (pruh) pruh.style.width = prubeh() + '%';
}

function klikStav(e) {
  const el = e.target.closest('button');
  if (!el) return; // popisek „Vybrat fotku“ obslouží prohlížeč (for) a klikPopisek
  e.stopPropagation();
  if (el.hasAttribute('data-au-znovu')) {
    fronta.forEach((u) => { if (u.stav === 'chyba') u.stav = 'ceka'; });
    clearTimeout(casovacSite);
    davka = { celkem: 0, hotovo: 0 };
    zpracujFrontu();
  } else if (el.hasAttribute('data-au-zahodit')) {
    const x = fronta.find((u) => u.stav === 'chyba');
    if (x) {
      potvrd('Zahodit účtenku?', { text: 'Fotka se z tohohle zařízení smaže. Jestli ji motor nestihl přečíst, v tabulce nebude.', ton: 'nebezpeci', ano: 'Zahodit' })
        .then((ano) => { if (ano) { odeberZFronty(x); vykresliStav(); } });
    }
  } else if (el.hasAttribute('data-au-upravit') && vysledek && vysledek.upravit) {
    const r = vysledek.upravit;
    zavriVysledek();
    otevriUpravu(najdiZapis(r.zapsano.list, r.zapsano.radek) || r.z, r.foto);
  } else if (el.hasAttribute('data-au-doplnit')) {
    zavriVysledek();
    dalsiUctenka();
  } else if (el.hasAttribute('data-au-ukazat')) {
    zavriVysledek();
    prejdi('auto');
    zmeneno();
  } else if (el.hasAttribute('data-au-zavrit')) {
    zavriVysledek();
  }
}

function zavriVysledek() {
  clearTimeout(casovacVysledku);
  vysledek = null;
  vykresliStav();
}

function najdiZapis(list, radek) {
  return ((stav.auto || {})[list] || []).find((x) => x.radek === Number(radek)) || null;
}

/** Oprava zápisu z tabulky (z seznamu nebo hned po zápisu z účtenky). */
function otevriUpravu(z, foto) {
  if (!z) return;
  otevriZapis(z.list === 'tankovani' ? 'tankovani' : 'naklad', Object.assign({
    uprava: { list: z.list, radek: z.radek, puvodniDatum: z.datum, puvodniCastka: z.castka },
    datum: isoDatum(z.datum), castka: z.castka, cenaLitr: z.cenaLitr, km: z.km, kdo: z.kdo, kategorie: z.kategorie, polozka: z.polozka,
    poznamka: z.poznamka || '', uctenka: z.uctenka || ''
  }, foto || {}));
}

const otevriNavrh = (n) => otevriZapis(n.druh === 'tankovani' ? 'tankovani' : 'naklad', n);

function dalsiUctenka() {
  const n = frontaUctenek.shift();
  if (n) otevriNavrh(n);
}

startUctenek();

/** Fotka účtenky na celou obrazovku (nad oknem zápisu). */
function ukazFotku(src) {
  otevriPanel({ id: 'auto-foto', trida: 'panel-okno auto-foto-okno', titul: 'Účtenka',
    vykresli: () => '<img class="auto-foto-velka" src="' + esc(src) + '" alt="Účtenka">' });
}

// ---------------------------------------------------------------- ovládání

export function klikAuto(el) {
  if (el.hasAttribute('data-auto-znovu')) { stav.chyby.auto = null; nactiAuto(true); return true; }
  if (el.dataset.autoZapis) { otevriZapis(el.dataset.autoZapis); return true; }
  if (el.hasAttribute('data-auto-pece')) { otevriPeci(); return true; }
  if (el.classList.contains('auto-sloupec')) return true; // sloupec měsíce: rozpis ukáže bublina (js/grafy.js)
  if (el.dataset.autoUpravit) { const [list, radek] = el.dataset.autoUpravit.split(':'); otevriUpravu(najdiZapis(list, radek)); return true; }
  if (el.hasAttribute('data-az-foto-velka') && f) { ukazFotku(f.foto || f.velka || f.nahled); return true; }
  if (el.hasAttribute('data-az-foto-vedle') && f) { f.fotoVedle = !f.fotoVedle; f.fotoZoom = false; fotkaVedle(); return true; }
  if (el.hasAttribute('data-az-foto-zoom') && f) { f.fotoZoom = !f.fotoZoom; obnovPanel('auto-zapis'); return true; }
  if (el.hasAttribute('data-az-foto') && f && f.uctenka && !f.fotoNacitam) {
    const moje = f;
    f.fotoNacitam = true;
    obnovPanel('auto-zapis');
    volej('autoUctenkaFoto', { id: f.uctenka })
      .then((v) => { if (f === moje) { f.foto = v.obrazek; f.fotoNacitam = false; f.fotoVedle = true; fotkaVedle(); } })
      .catch((e) => { if (f === moje) { f.fotoNacitam = false; obnovPanel('auto-zapis'); } toast(e.message, true); });
    return true;
  }
  if (el.dataset.autoZAuta) { const [t, km] = el.dataset.autoZAuta.split('|'); otevriZapis('tankovani', { datum: isoDatum(Number(t)), km }); return true; }
  if (el.hasAttribute('data-auto-vse')) { vseZapisy = !vseZapisy; zmeneno(); return true; }
  if (el.hasAttribute('data-auto-ulozit')) { if (f && !f.ukladam) ulozZapis(); return true; }
  if (el.dataset.azDruh && f) { f.druh = el.dataset.azDruh; obnovPanel('auto-zapis'); return true; }
  if (el.dataset.azKdo && f) { f.kdo = el.dataset.azKdo; obnovPanel('auto-zapis'); return true; }
  if (el.dataset.azRychle != null && f) {
    // rychlá volba výdaje (Mytí…): kategorie, položka a částka jako minule – pak stačí Zapsat; bez známé částky kurzor do Částky
    const r = rychleVydaje(stav.auto)[Number(el.dataset.azRychle)];
    if (!r) return true;
    Object.assign(f, { druh: 'naklad', kategorie: r.kategorie, polozka: r.polozka, rychla: r.nazev }, r.castka ? { castka: cisloPole(r.castka) } : {});
    obnovPanel('auto-zapis');
    const pole = !r.castka && elementPanelu('auto-zapis') && elementPanelu('auto-zapis').querySelector('[data-az="castka"]');
    if (pole) pole.focus();
    return true;
  }
  if (el.hasAttribute('data-auto-propojit')) {
    const koren = el.closest('.auto-nastavit');
    const odkaz = koren.querySelector('[data-auto-odkaz]').value.trim();
    const chyba = koren.querySelector('[data-auto-chyba]');
    if (!odkaz) { chyba.textContent = 'Vlož odkaz na tabulku.'; chyba.hidden = false; return true; }
    el.disabled = true;
    volej('autoNastavit', { odkaz })
      .then((data) => { stav.chyby.auto = null; uloz(data); toast('Tabulka propojená ✓'); zmeneno(); })
      .catch((e) => { el.disabled = false; chyba.textContent = e.message; chyba.hidden = false; });
    return true;
  }
  if (el.dataset.autoSmazat) {
    const [list, radek] = el.dataset.autoSmazat.split(':');
    const z = ((stav.auto || {})[list] || []).find((x) => String(x.radek) === radek);
    if (!z) return true;
    potvrd('Smazat poslední zápis?', { text: (list === 'tankovani' ? 'Tankování' : z.kategorie || 'Výdaj') + ' ' + dm(z.datum) + ' za ' + kc(z.castka) +
      ' se smaže i z tabulky.', ton: 'nebezpeci', ano: 'Smazat' }).then((ano) => {
      if (!ano) return;
      volej('autoSmazat', { list, radek: Number(radek), datum: z.datum, castka: z.castka })
        .then((data) => { uloz(data); toast('Zápis smazaný'); zmeneno(); })
        .catch((e) => toast(e.message, true));
    });
    return true;
  }
  return false;
}

export function vstupAuto(e) {
  const t = e.target;
  if (!f || !t.matches || !t.matches('[data-az]')) return false;
  f[t.dataset.az] = t.value;
  if (t.dataset.az === 'castka' || t.dataset.az === 'cenaLitr') {
    const l = elementPanelu('auto-zapis') && elementPanelu('auto-zapis').querySelector('[data-az-litry]');
    if (l) l.textContent = litryText();
  }
  return true;
}

export function zmenaAuto(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-az]') && f) {
    f[t.dataset.az] = t.value;
    // jiná kategorie ručně = rychlá volba (Mytí…) už neplatí
    if (t.dataset.az === 'kategorie' && f.rychla) {
      f.rychla = '';
      const panel = t.closest('[data-panel]');
      if (panel) panel.querySelectorAll('[data-az-rychle]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    }
    return true;
  }
  if (t.matches && t.matches('[data-auto-termin]')) {
    // datum se ukládá chvíli po poslední změně (při psaní roku přijde change po každé číslici)
    const id = t.dataset.autoTermin, datum = t.value;
    clearTimeout(terminCasovace[id]);
    if (!datum || /^20\d\d-\d\d-\d\d$/.test(datum)) terminCasovace[id] = setTimeout(() => ulozTermin(id, datum), 700);
    return true;
  }
  return false; // fotky účtenek: stálé pole má vlastní posluchač (poVyberuFotek) – na document by výběr po překreslení nedošel
}

/** Enter v okně zápisu = Zapsat (kromě výběru kategorie). */
export function klavesaAuto(e) {
  if (!f || e.key !== 'Enter' || !e.target.matches || !e.target.matches('input[data-az]')) return false;
  e.preventDefault();
  if (!f.ukladam) ulozZapis();
  return true;
}
