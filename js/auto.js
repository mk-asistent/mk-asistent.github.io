// Auto: náklady a tankování z Michalovy tabulky Google (motor: auto, autoZapsat, autoSmazat, autoUctenka, autoNastavit).
// Tabulka zůstává hlavní a je i záloha – stránka z ní počítá přehled (najeto, spotřeba, nafta na km, cena nafty, výdaje
// po měsících a kategoriích, servis podle listu Péče o auto) a nové zápisy, i z vyfocené účtenky, posílá do ní.
// Čísla jsou jen v tabulce a v zařízení (ukázka má vymyšlená).

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, isoDatum, kdyKratce, MESICE_1 } from './pomocne.js';
import { kostra, chybaHtml, toast, potvrd, segment, hlavickaKarty } from './ui.js';
import { IKONY } from './ikony.js';
import { otevriPanel, zavriPanel, obnovPanel, elementPanelu } from './panely.js';

const ULOZISTE = 'asistent.data.auto';
const CELE = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const DVE = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const JEDNO = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// servis podle listu Péče o auto v Michalově tabulce: olej + filtr každých 15 000 km nebo jednou za rok
const SERVIS_KM = 15000, SERVIS_DNI = 365;
const MAX_ZAPISU = 25;

let f = null;          // rozpracovaný zápis (okno Tankování / Výdaj)
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

/** Při překreslení stránky Auto: data ještě nejsou → načíst (jednou za otevření, pak jen Obnovit). */
let nacteno = false;
export function dotahni() {
  if (stav.pohled !== 'auto' || !umiMotor('auto') || stav.nacita.auto || stav.chyby.auto) return;
  if (!nacteno) { nacteno = true; nactiAuto(); }
}

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
    const m = mesice[klicMesice(z.datum)] || (mesice[klicMesice(z.datum)] = { palivo: 0, ostatni: 0 });
    if (z.list === 'tankovani') m.palivo += z.castka; else m.ostatni += z.castka;
  });
  const mesicu = datumStart != null && posledniKm ? (posledniKm.datum - datumStart) / (30.44 * 864e5) : 0;
  return {
    najeto, kmStart, datumStart, kmPosledni: posledniKm ? posledniKm.km : null, kmPosledniDatum: posledniKm ? posledniKm.datum : null,
    kmMesic: najeto != null && mesicu > 0.5 ? najeto / mesicu : null, spotreba, palivoKm, palivo, litry,
    cenaPrumer: litry ? palivo / litry : null, kategorie, celkem, koupeKc, provoz: celkem - koupeKc, mesice,
    posledniTankovani: t.length ? t[t.length - 1] : null, ceny: t.filter((z) => z.cenaLitr).map((z) => ({ t: z.datum, c: z.cenaLitr })), auto
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
  h += heroHtml(d, p) + akceHtml() + tankovaniZAutaHtml(d) + '<div class="auto-mrizka">' + cenyHtml(p) + mesiceHtml(p) + kategorieHtml(d, p) + servisHtml(d, p) + '</div>' +
    zapisyHtml(d) + '</div>';
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
    // popisek s polem pro fotku: klepnutí otevře nabídku iPhonu – Fotky, Vyfotit, Soubory (programové kliknutí iPhone neotevře;
    // bez capture, ať jde vybrat i starší fotka účtenky z Fotek)
    (umiMotor('autoUctenka') ? '<label class="btn btn--ghost auto-foto">' + IKONY.foto + '<span>Účtenka z fotky</span>' +
      '<input type="file" accept="image/*" data-auto-foto hidden></label>' : '') + '</div>';
}

/** Cena nafty v čase – čára s tečkami, nejvyšší a nejnižší cena. */
function cenyHtml(p) {
  const c = p.ceny;
  if (c.length < 2) return '';
  const W = 600, H = 170, L = 8, R = 8, T = 22, B = 26;
  const t0 = c[0].t, t1 = c[c.length - 1].t;
  const min = Math.min(...c.map((x) => x.c)), max = Math.max(...c.map((x) => x.c));
  const lo = Math.floor(min - 1), hi = Math.ceil(max + 1);
  const x = (t) => L + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const body = c.map((v) => x(v.t).toFixed(1) + ',' + y(v.c).toFixed(1)).join(' ');
  const iMax = c.findIndex((v) => v.c === max), iMin = c.findIndex((v) => v.c === min);
  const stitek = (v, nahore) => '<text x="' + Math.min(W - 40, Math.max(40, x(v.t))).toFixed(1) + '" y="' +
    (y(v.c) + (nahore || y(v.c) + 17 > H - B - 4 ? -9 : 17)).toFixed(1) +
    '" text-anchor="middle">' + DVE.format(v.c) + '</text>';
  const mesic = (t) => MES_KR[new Date(t).getMonth()] + ' ' + String(new Date(t).getFullYear()).slice(2);
  const posledni = c[c.length - 1];
  return '<section class="card auto-graf" data-oblast="auto">' + hlavickaKarty(IKONY.palivo, 'Cena nafty', '<span class="muted">naposledy</span> <b>' +
      DVE.format(posledni.c) + ' Kč/l</b>') +
    '<svg class="auto-cara" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cena nafty od ' + esc(dm(t0)) + ' do ' + esc(dm(t1)) + '">' +
      '<line class="osa" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>' +
      '<polyline points="' + body + '"/>' + c.map((v, i) => '<circle cx="' + x(v.t).toFixed(1) + '" cy="' + y(v.c).toFixed(1) + '" r="' +
        (i === iMax || i === iMin || i === c.length - 1 ? 4.5 : 3) + '"' + (i === iMax ? ' class="max"' : i === iMin ? ' class="min"' : '') + '><title>' +
        esc(dm(v.t) + ': ' + DVE.format(v.c) + ' Kč/l') + '</title></circle>').join('') +
      '<g class="stitky">' + stitek(c[iMax], true) + (iMin !== iMax ? stitek(c[iMin], false) : '') + '</g>' +
      '<g class="osa-x"><text x="' + L + '" y="' + (H - 6) + '">' + esc(mesic(t0)) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' +
        esc(mesic(t1)) + '</text></g>' +
    '</svg></section>';
}

/** Výdaje po měsících (posledních 12): palivo a ostatní ve sloupcích, bez koupě auta. */
function mesiceHtml(p) {
  const klice = Object.keys(p.mesice).sort().slice(-12);
  if (!klice.length) return '';
  const max = Math.max(1, ...klice.map((k) => p.mesice[k].palivo + p.mesice[k].ostatni));
  const prumer = klice.reduce((s, k) => s + p.mesice[k].palivo + p.mesice[k].ostatni, 0) / klice.length;
  return '<section class="card auto-graf" data-oblast="auto">' + hlavickaKarty(IKONY.tabulka, 'Výdaje po měsících', '<span class="muted">průměr</span> <b>' +
      kc(prumer) + '</b>') +
    '<div class="auto-sloupce">' + klice.map((k) => {
      const m = p.mesice[k], celkem = m.palivo + m.ostatni;
      const v = (x) => (x ? Math.max(3, Math.round(x / max * 118)) : 0);
      return '<div class="auto-sloupec" title="' + esc(MESICE_1[Number(k.slice(5)) - 1] + ' ' + k.slice(0, 4) + ': palivo ' + kc(m.palivo) + ', ostatní ' +
        kc(m.ostatni)) + '"><span class="auto-sloupec__cislo cisla">' + (celkem >= 1000 ? JEDNO.format(celkem / 1000) + ' tis.' : CELE.format(celkem)) + '</span>' +
        '<span class="auto-sloupec__ostatni" style="height:' + v(m.ostatni) + 'px"></span><span class="auto-sloupec__palivo" style="height:' + v(m.palivo) + 'px"></span>' +
        '<small>' + esc(MES_KR[Number(k.slice(5)) - 1]) + '</small></div>';
    }).join('') + '</div>' +
    '<div class="auto-legenda"><span><i class="auto-legenda__palivo"></i>Palivo</span><span><i class="auto-legenda__ostatni"></i>Ostatní</span></div></section>';
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
      return '<li class="auto-zapis' + (tank ? ' auto-zapis--palivo' : '') + '"><span class="kruh kruh--' + (tank ? 'auto' : 'oranz') + '">' +
        (tank ? IKONY.palivo : IKONY.auto) + '</span><div class="auto-zapis__text"><b>' + esc(nazev) + '</b><small>' +
        esc((z.datum != null ? dm(z.datum) + ' ' + new Date(z.datum).getFullYear() : z.datumText) + (pod ? ' · ' + pod : '')) + '</small></div>' +
        '<span class="auto-zapis__castka cisla">' + (z.castka != null ? kc(z.castka) : '—') + (z.kdo ? '<i class="auto-kdo auto-kdo--' + (z.kdo === 'K' ? 'k' : 'm') +
        '" title="' + (z.kdo === 'K' ? 'Katka' : 'Michal') + '">' + esc(z.kdo) + '</i>' : '') + '</span>' +
        (smazat ? '<button type="button" class="btn btn--ikona" data-auto-smazat="' + esc(z.list + ':' + z.radek) + '" aria-label="Smazat zápis (překlep)">' +
          IKONY.smazat + '</button>' : '') + '</li>';
    }).join('') + '</ul>' +
    (vse.length > MAX_ZAPISU ? '<button type="button" class="odkaz auto-vse" data-auto-vse>' + (vseZapisy ? 'Méně' : 'Všechny zápisy (' + vse.length + ')') + '</button>' : '') +
    '</section>';
}

// ---------------------------------------------------------------- zápis (okno)

const cisloPole = (x) => (x == null || x === '' ? '' : String(x).replace('.', ','));
const cislo = (x) => { const t = String(x == null ? '' : x).replace(/[\s ]/g, '').replace(/kč|km/gi, '').replace(',', '.'); return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null; };

export function otevriZapis(druh, navrh) {
  const n = navrh || {};
  const a = zAuta(stav.auto);
  const kmZAuta = druh !== 'naklad' && a && a.km != null && a.kdy && Date.now() - a.kdy < 3 * 36e5 ? a : null;
  f = {
    druh: druh === 'naklad' ? 'naklad' : 'tankovani', datum: n.datum || isoDatum(Date.now()), castka: cisloPole(n.castka), cenaLitr: cisloPole(n.cenaLitr),
    km: n.km != null && n.km !== '' ? String(n.km) : kmZAuta ? String(kmZAuta.km) : '', kmZAuta: n.km != null && n.km !== '' ? 0 : kmZAuta ? kmZAuta.kdy : 0, kdo: 'M', kategorie: n.kategorie || '', polozka: '', poznamka: n.obchod || '', uctenka: n.uctenka || '', nahled: n.nahled || '',
    chybaTextu: n.chybaTextu || '', zUctenky: !!n.uctenka, ukladam: false
  };
  const moje = f;
  otevriPanel({
    id: 'auto-zapis', trida: 'panel-okno panel-formular',
    titul: () => (f.druh === 'tankovani' ? 'Tankování' : 'Výdaj za auto'),
    vykresli: zapisHtml,
    paticka: () => '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--primary" data-auto-ulozit' + (f && f.ukladam ? ' disabled' : '') + '>' + IKONY.fajfka + '<span>' +
      (f && f.ukladam ? 'Zapisuji…' : 'Zapsat do tabulky') + '</span></button></div>',
    poOtevreni: (el) => { const pole = el.querySelector(f.castka ? '[data-az="km"]' : '[data-az="castka"]'); if (pole) pole.focus(); },
    priZavreni: () => { if (f === moje) f = null; }
  });
}

function litryText() {
  const c = cislo(f.castka), l = cislo(f.cenaLitr);
  return c && l ? '= ' + JEDNO.format(c / l) + ' l' : '';
}

function zapisHtml() {
  if (!f) return '';
  const d = stav.auto || {};
  const p = d.nastaveno ? prehledAuta(d) : null;
  const pole = (klic, popisek, atributy, hodnota, pod) => '<label><span class="label">' + popisek + '</span><input class="field" data-az="' + klic + '" value="' +
    esc(hodnota) + '" autocomplete="off" ' + atributy + '>' + (pod || '') + '</label>';
  let h = '<div class="formular auto-formular">';
  if (f.nahled) {
    h += '<div class="auto-uctenka"><img src="' + esc(f.nahled) + '" alt="Vyfocená účtenka"><div><b>Účtenka uložená na Disku</b><small>' +
      (f.chybaTextu ? 'Text se nepřečetl – vyplň údaje (' + esc(f.chybaTextu) + ').' : 'Údaje z účtenky – zkontroluj je. Do tabulky se připíše odkaz na fotku.') +
      '</small></div></div>';
  }
  h += segment([['tankovani', 'Tankování'], ['naklad', 'Výdaj']], f.druh, 'data-az-druh', 'Druh zápisu');
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
    const kategorie = (d.kategorie && d.kategorie.length ? d.kategorie : ['Servis', 'Servis - PNEU', 'STK', 'Pojištění', 'Dálniční známka', 'Parkování', 'Myčka', 'Nákup doplňků', 'Doplňková výbava']);
    if (!f.kategorie) f.kategorie = kategorie[0];
    h += '<div class="fmr fmr--2"><label><span class="label">Kategorie</span><select class="field" data-az="kategorie">' +
      (kategorie.indexOf(f.kategorie) < 0 ? '<option selected>' + esc(f.kategorie) + '</option>' : '') +
      kategorie.map((k) => '<option' + (k === f.kategorie ? ' selected' : '') + '>' + esc(k) + '</option>').join('') + '</select></label>' +
      pole('polozka', 'Položka', 'placeholder="nepovinné – co přesně"', f.polozka) + '</div>' +
      '<div class="fmr fmr--2">' + pole('km', 'Stav km', 'inputmode="numeric" placeholder="nepovinné"', f.km) +
      pole('poznamka', 'Poznámka', 'placeholder="nepovinné"', f.poznamka) + '</div>';
  }
  h += '<div class="formular__radek"><span class="label">Platil</span>' + segment([['M', 'Michal'], ['K', 'Katka']], f.kdo, 'data-az-kdo', 'Kdo platil') + '</div>';
  h += '<p class="pruh pruh-varovani" data-az-chyba hidden></p>';
  return h + '</div>';
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
    const data = await volej('autoZapsat', { druh: f.druh, datum: f.datum, castka, cenaLitr: f.druh === 'tankovani' ? cislo(f.cenaLitr) : undefined,
      km: f.km ? cislo(f.km) : '', kdo: f.kdo, kategorie: f.druh === 'naklad' ? f.kategorie : undefined, polozka: f.polozka, poznamka: f.poznamka,
      uctenka: f.uctenka || undefined });
    uloz(data);
    zavriPanel();
    toast('Zapsáno do tabulky ✓');
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

// ---------------------------------------------------------------- účtenka (fotka z telefonu)

function nactiObrazek(soubor) {
  return new Promise((hotovo, chyba) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => hotovo(img);
      img.onerror = () => chyba(new Error('Fotku se nepodařilo načíst – zkus ji vyfotit znovu.'));
      img.src = r.result;
    };
    r.onerror = () => chyba(new Error('Fotku se nepodařilo načíst.'));
    r.readAsDataURL(soubor);
  });
}

/** Zmenšená kopie jako JPEG (data URL) – účtenka se čte dobře i na 1 600 px a posílá se rychle. */
function zmensi(img, max, kvalita) {
  const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', kvalita);
}

async function zpracujUctenku(soubor) {
  toast('Čtu účtenku…');
  try {
    const img = await nactiObrazek(soubor);
    const v = await volej('autoUctenka', { obrazek: zmensi(img, 1600, 0.82) });
    const n = v.navrh || {};
    otevriZapis(n.druh === 'tankovani' ? 'tankovani' : 'naklad', Object.assign({}, n, { uctenka: v.uctenka, nahled: zmensi(img, 320, 0.7), chybaTextu: v.chybaTextu }));
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- ovládání

export function klikAuto(el) {
  if (el.hasAttribute('data-auto-znovu')) { stav.chyby.auto = null; nactiAuto(true); return true; }
  if (el.dataset.autoZapis) { otevriZapis(el.dataset.autoZapis); return true; }
  if (el.dataset.autoZAuta) { const [t, km] = el.dataset.autoZAuta.split('|'); otevriZapis('tankovani', { datum: isoDatum(Number(t)), km }); return true; }
  if (el.hasAttribute('data-auto-vse')) { vseZapisy = !vseZapisy; zmeneno(); return true; }
  if (el.hasAttribute('data-auto-ulozit')) { if (f && !f.ukladam) ulozZapis(); return true; }
  if (el.dataset.azDruh && f) { f.druh = el.dataset.azDruh; obnovPanel('auto-zapis'); return true; }
  if (el.dataset.azKdo && f) { f.kdo = el.dataset.azKdo; obnovPanel('auto-zapis'); return true; }
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
  if (t.matches && t.matches('[data-az]') && f) { f[t.dataset.az] = t.value; return true; }
  if (!t.matches || !t.matches('[data-auto-foto]')) return false;
  const soubor = t.files && t.files[0];
  t.value = '';
  if (t.closest('[data-panel="rychle"]')) zavriPanel(); // z „+“ na telefonu
  if (soubor) zpracujUctenku(soubor);
  return true;
}

/** Enter v okně zápisu = Zapsat (kromě výběru kategorie). */
export function klavesaAuto(e) {
  if (!f || e.key !== 'Enter' || !e.target.matches || !e.target.matches('input[data-az]')) return false;
  e.preventDefault();
  if (!f.ukladam) ulozZapis();
  return true;
}
