// Pošta: jedna schránka pro oba účty (osobní Gmail + pracovní), každá konverzace je „případ“ se stavem
// (Hoří, Čeká na tebe, Otázka, Čekáš na ně, Řeší se, Informace – nápad z poštovního klienta Mailer, stav určuje motor).
// Čtení celých e-mailů, odpověď, přeposlání, nový e-mail; jedním klepnutím Hotovo (archiv), Připomenout, Spam.
// Na telefonu se e-mail otevře přes celou obrazovku, na iPadu na šířku a PC vedle seznamu.

import { stav, zmeneno } from './stav.js';
import { volej } from './api.js';
import {
  esc, kdyKratce, kdyDlouze, prvniRadek, iniciala, odstin, sOdkazy, velikost, jmenaAdres, uloziste,
  pulnoc, pridejDny, isoDatum, terminDatum, dm, rozdilDni
} from './pomocne.js';
import { otevriPanel, obnovPanel, zavriPanel, jeOtevreny, elementPanelu, horniPanel } from './panely.js';
import { toast, toastAkce, kostra, chybaHtml, segment, prizpusobVysku, potvrd } from './ui.js';
import { IKONY } from './ikony.js';

const DVA_SLOUPCE = window.matchMedia('(min-width: 1000px)');
const ULOZISTE = 'asistent.data.posta';
const KONCEPT = 'asistent.koncept.';
const DNI_OZNAMENI = 14; // oznámení starší dvou týdnů se v přehledu neukazují (motor posílá 30 dní)
let posledniDetail = '';

/** Stavy případů: [popisek, třída štítku, ikona, text prázdného seznamu] */
export const STAVY = {
  hori: ['Hoří', 'tag tag--danger', 'ohen', 'Nic nehoří.'],
  ceka: ['Čeká na tebe', 'tag', 'posta', 'Nic nečeká na tvou odpověď.'],
  otazka: ['Otázka', 'tag tag--warn', 'otazka', 'Žádné otázky.'],
  cekas: ['Čekáš na ně', 'tag tag--fialova', 'cekas', 'Na nikoho nečekáš.'],
  resi: ['Řeší se', 'tag tag--seda', 'odpovedet', 'Žádné rozběhnuté konverzace.'],
  info: ['Informace', 'tag tag--seda', 'info', 'Žádná oznámení.']
};
const FILTRY = [['vse', 'Vše'], ['neprectene', 'Nepřečtené'], ['hori', 'Hoří'], ['ceka', 'Čeká na tebe'], ['otazka', 'Otázky'],
  ['cekas', 'Čekáš na ně'], ['resi', 'Řeší se'], ['info', 'Informace']];

// ---------------------------------------------------------------- data

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.posta = v.data;
}

export function nactiPostu(znovu) {
  if (stav.nacita.posta) return Promise.resolve();
  stav.nacita.posta = true;
  stav.chyby.posta = null;
  zmeneno();
  return volej('posta', { znovu: !!znovu })
    .then((data) => {
      stav.posta = data;
      uloziste.pis(ULOZISTE, { data, kdy: Date.now() });
    })
    .catch((e) => { stav.chyby.posta = e; })
    .then(() => { stav.nacita.posta = false; zmeneno(); });
}

export function stavZpravy(m) { return STAVY[m.stav] ? m.stav : 'ceka'; }

/** Všechny konverzace obou účtů (+ souhrny firemní pošty z PC), nejnovější nahoře. */
export function vsechnyZpravy() {
  const p = stav.posta;
  if (!p) return [];
  const pc = p.firemni && p.firemni.zpravy && !(p.pracovni && p.pracovni.length)
    ? p.firemni.zpravy.map((m) => Object.assign({}, m, { id: 'pc-' + m.id, ucet: 'pracovni', zPc: true }))
    : [];
  const hranice = Date.now() - DNI_OZNAMENI * 864e5;
  return (p.osobni || []).map((m) => Object.assign({ ucet: 'osobni' }, m))
    .concat((p.pracovni || []).map((m) => Object.assign({ ucet: 'pracovni' }, m)), pc)
    .filter((m) => !(m.stav === 'info' && m.kdy < hranice))
    .sort((a, b) => b.kdy - a.kdy);
}

export function neprectene() { return vsechnyZpravy().filter((m) => m.neprectena); }
export function maPracovni() { return !!(stav.posta && (stav.posta.pracovniAdresa || (stav.posta.firemni && stav.posta.firemni.zpravy))); }
function aktivniUcet() { return maPracovni() ? stav.ucetPosty : 'oba'; }

/** Co od tebe pošta chce: Hoří, Čeká na tebe, Otázka – v tomhle pořadí, v každé skupině nejnovější nahoře. */
export function kPozornosti() {
  const vaha = { hori: 0, ceka: 1, otazka: 2 };
  return vsechnyZpravy().filter((m) => vaha[stavZpravy(m)] != null)
    .sort((a, b) => (vaha[stavZpravy(a)] - vaha[stavZpravy(b)]) || (b.kdy - a.kdy));
}

export function pocetStavu(stavPripadu) { return vsechnyZpravy().filter((m) => stavZpravy(m) === stavPripadu).length; }

/** Souhrn konverzace podle id – ze seznamu, nebo z výsledků hledání v celé poště. */
export function najdiSouhrn(id) {
  return vsechnyZpravy().find((m) => m.id === id) ||
    (stav.hledani && stav.hledani.vlakna ? stav.hledani.vlakna.find((m) => m.id === id) : null) || null;
}

/** Změna přímo v uložených seznamech (vsechnyZpravy vrací kopie). */
function upravVSeznamech(id, fn) {
  if (!stav.posta) return;
  ['osobni', 'pracovni'].forEach((ucet) => {
    const seznam = stav.posta[ucet] || [];
    const i = seznam.findIndex((m) => m.id === id);
    if (i >= 0) fn(seznam[i], i, seznam);
  });
}

function filtrovane() {
  let z = vsechnyZpravy();
  const ucet = aktivniUcet();
  if (ucet !== 'oba') z = z.filter((m) => m.ucet === ucet);
  const f = stav.filtrPosty;
  if (f === 'neprectene') return z.filter((m) => m.neprectena);
  if (STAVY[f]) return z.filter((m) => stavZpravy(m) === f);
  return z;
}

/** Sousední konverzace v aktuálním seznamu (j/k, další po Hotovo). */
function sousedni(id, smer) {
  const z = filtrovane();
  const i = z.findIndex((m) => m.id === id);
  if (i < 0) return z.length ? z[0].id : null;
  const x = z[i + smer];
  return x ? x.id : null;
}

// ---------------------------------------------------------------- seznam

export function stavTag(m) {
  const s = STAVY[stavZpravy(m)];
  return '<span class="' + s[1] + '">' + s[0] + '</span>';
}

export function zpravaRadekHtml(m, ukazUcet) {
  const aktivni = DVA_SLOUPCE.matches && stav.pohled === 'posta' && stav.otevreneVlakno === m.id ? ' aktivni' : '';
  const stitekUctu = ukazUcet ? '<span class="ucet ucet-' + m.ucet + '">' + (m.ucet === 'pracovni' ? 'Pracovní' : 'Osobní') + '</span>' : '';
  return '<li class="' + (m.neprectena ? 'neprect' : 'prect') + aktivni + '"><button type="button" class="radek radek-posta" data-vlakno="' + esc(m.id) + '">' +
    '<span class="avatar" style="--h:' + odstin(m.od) + '" aria-hidden="true">' + esc(iniciala(m.od)) + '</span>' +
    '<span class="radek-obsah">' +
      '<span class="radek-hora">' + (m.neprectena ? '<span class="tecka" aria-label="nepřečtené"></span>' : '') +
        '<span class="radek-titul orez-1">' + esc(m.od) + '</span><span class="radek-cas cisla">' + esc(kdyKratce(m.kdy)) + '</span></span>' +
      '<span class="radek-predmet orez-1">' + esc(m.predmet) + (m.pocet > 1 ? ' <span class="pocet">' + m.pocet + '</span>' : '') + '</span>' +
      '<span class="radek-pod orez-2">' + stavTag(m) + ' ' + stitekUctu + esc(m.ukazka || '') + '</span>' +
    '</span></button></li>';
}

function filtryHtml() {
  const ucet = aktivniUcet();
  const zUctu = vsechnyZpravy().filter((m) => ucet === 'oba' || m.ucet === ucet);
  const pocet = (f) => (f === 'vse' ? zUctu.length : f === 'neprectene' ? zUctu.filter((m) => m.neprectena).length
    : zUctu.filter((m) => stavZpravy(m) === f).length);
  const chipy = FILTRY.filter((f) => f[0] === 'vse' || f[0] === stav.filtrPosty || pocet(f[0]) > 0)
    .map((f) => '<button type="button" class="chip' + (f[0] === 'hori' ? ' chip--hori' : '') + '" data-filtr-posty="' + f[0] + '" aria-pressed="' +
      (stav.filtrPosty === f[0]) + '">' + f[1] + '<span class="pocet cisla">' + pocet(f[0]) + '</span></button>').join('');
  return '<div class="filtry posta-filtry"><div class="segment" role="group" aria-label="Stav konverzací">' + chipy + '</div>' +
    (maPracovni() ? segment([['oba', 'Oba účty'], ['osobni', 'Osobní'], ['pracovni', 'Pracovní']], ucet, 'data-ucet-posty', 'Účet') : '') + '</div>';
}

function seznamHtml() {
  if (!stav.posta) return '<div class="card">' + (stav.chyby.posta ? chybaHtml(stav.chyby.posta, 'data-posta-znovu') : kostra(6)) + '</div>';
  const zpravy = filtrovane();
  const h = stav.chyby.posta ? '<p class="pruh pruh-varovani">' + esc(stav.chyby.posta.message) + ' Ukazuju naposledy načtené.</p>' : '';
  if (!zpravy.length) {
    const f = stav.filtrPosty;
    return h + '<div class="card"><div class="prazdne">' + (STAVY[f] ? STAVY[f][3] : f === 'neprectene' ? 'Všechno přečteno.' : 'Doručená pošta je prázdná.') + '</div></div>';
  }
  return h + '<div class="card"><ul class="seznam seznam-posta">' + zpravy.map((m) => zpravaRadekHtml(m, maPracovni() && aktivniUcet() === 'oba')).join('') + '</ul></div>';
}

/** Pohled Pošta: filtry nahoře, pod nimi seznam | detail. Detail se překresluje jen při změně vlákna. */
export function vykresliPostu(el) {
  if (!el.querySelector('.posta-rozlozeni')) {
    el.innerHTML = '<div id="posta-filtry"></div><div class="posta-rozlozeni"><div class="posta-seznam" id="posta-seznam"></div>' +
      '<div class="posta-detail" id="posta-detail"></div></div>';
    posledniDetail = '';
  }
  el.querySelector('#posta-filtry').innerHTML = stav.posta ? filtryHtml() : '';
  el.querySelector('#posta-seznam').innerHTML = seznamHtml();
  if (DVA_SLOUPCE.matches) vykresliDetail();
}

function klicDetailu() {
  const id = stav.otevreneVlakno;
  const st = id && stav.vlakna[id];
  return id ? id + ':' + (st ? (st.nacita ? 'n' : '') + (st.chyba ? 'e' : '') + (st.verze || 0) : '-') + ':' + JSON.stringify(stav.rozbaleneZpravy) +
    ':' + JSON.stringify(stav.obrazky) : '';
}

function vykresliDetail(vynutit) {
  const el = document.getElementById('posta-detail');
  if (!el) return;
  const klic = klicDetailu();
  if (!vynutit && klic === posledniDetail) return;
  posledniDetail = klic;
  const id = stav.otevreneVlakno;
  if (!id) {
    el.innerHTML = '<div class="posta-prazdny">' + IKONY.posta + '<p>Vyber konverzaci vlevo.</p>' +
      '<small>Klávesy: j / k další a předchozí · e hotovo · r odpovědět</small></div>';
    return;
  }
  el.innerHTML = '<div class="detail-lista">' + akceHlavickyHtml(id, true) + '</div><div class="detail-telo">' + vlaknoHtml(id) + '</div>' +
    '<div class="detail-paticka">' + akceVlaknaHtml(id) + '</div>';
  pripravTelaZprav(el);
}

// ---------------------------------------------------------------- vlákno

export function otevriVlakno(id) {
  const m = najdiSouhrn(id);
  if (m && m.zPc) { if (m.odkaz && m.odkaz !== '#') window.open(m.odkaz, '_blank', 'noopener'); return; }
  stav.otevreneVlakno = id;
  stav.rozbaleneZpravy = {};
  if (m && m.neprectena) upravVSeznamech(id, (x) => { x.neprectena = false; });
  if (!DVA_SLOUPCE.matches) {
    otevriPanel({
      id: 'vlakno', trida: 'panel-bocni panel-vlakno', titul: '',
      vpravo: () => akceHlavickyHtml(stav.otevreneVlakno, false),
      vykresli: () => vlaknoHtml(stav.otevreneVlakno),
      paticka: () => akceVlaknaHtml(stav.otevreneVlakno),
      poVykresleni: pripravTelaZprav,
      priZavreni: () => { stav.otevreneVlakno = null; zmeneno(); }
    });
  }
  nactiVlakno(id);
  zmeneno();
  // na širokém okně řádek v seznamu udržet na očích (j/k)
  if (DVA_SLOUPCE.matches) {
    setTimeout(() => {
      const radek = Array.from(document.querySelectorAll('#posta-seznam [data-vlakno]')).find((b) => b.dataset.vlakno === id);
      if (radek) { const r = radek.getBoundingClientRect(); if (r.bottom > innerHeight || r.top < 0) radek.scrollIntoView({ block: 'nearest' }); }
    }, 30);
  }
}

function nactiVlakno(id, znovu) {
  const st = stav.vlakna[id];
  if (st && st.data && !znovu) { obnovDetail(id); return; }
  stav.vlakna[id] = Object.assign({}, st, { nacita: true, chyba: null });
  obnovDetail(id);
  volej('vlakno', { id })
    .then((data) => { stav.vlakna[id] = { data, verze: Date.now() }; })
    .catch((e) => { stav.vlakna[id] = Object.assign({}, stav.vlakna[id], { nacita: false, chyba: e }); })
    .then(() => obnovDetail(id));
}

function obnovDetail(id) {
  if (stav.otevreneVlakno !== id) return;
  if (DVA_SLOUPCE.matches) vykresliDetail(true);
  else if (jeOtevreny('vlakno')) obnovPanel('vlakno');
}

function vlaknoHtml(id) {
  const st = stav.vlakna[id] || {};
  const souhrn = najdiSouhrn(id);
  const d = st.data;
  const predmet = (d && d.predmet) || (souhrn && souhrn.predmet) || '';
  const ucet = (d && d.ucet) || (souhrn && souhrn.ucet);
  let h = '<div class="vlakno"><h1 class="vlakno-predmet">' + esc(predmet) + '</h1>';
  const stitky = (souhrn ? stavTag(souhrn) : '') + (maPracovni() && ucet ? '<span class="ucet ucet-' + ucet + '">' + (ucet === 'pracovni' ? 'Pracovní' : 'Osobní') + '</span>' : '');
  if (stitky) h += '<div class="vlakno-stitky">' + stitky + '</div>';
  // proč je konverzace v tomhle stavu (ladění pravidel) a co s ní teď udělat
  if (souhrn && souhrn.duvod) h += '<p class="duvod">Proč: <b>' + esc(souhrn.duvod) + '</b></p>';
  if (souhrn && !souhrn.zPc) h += dalsiKrokHtml(souhrn);
  if (d) {
    if (d.skryto) h += '<p class="vlakno-skryto">Starších zpráv: ' + d.skryto + ' – jsou v Gmailu.</p>';
    h += d.zpravy.map((z, i) => zpravaHtml(z, i === d.zpravy.length - 1 || !!stav.rozbaleneZpravy[z.id])).join('');
  } else if (st.chyba) {
    h += '<div class="card">' + chybaHtml(st.chyba, 'data-vlakno-znovu="' + esc(id) + '"') + '</div>';
  } else {
    h += '<div class="card">' + kostra(5) + '</div>';
  }
  return h + '</div>';
}

function zpravaHtml(z, rozbalena) {
  const kdo = z.odeMe ? 'Já' : z.od;
  const hlava = '<button type="button" class="zprava-hlava" data-rozbal-zpravu="' + esc(z.id) + '" aria-expanded="' + rozbalena + '">' +
    '<span class="avatar maly" style="--h:' + odstin(z.od) + '" aria-hidden="true">' + esc(iniciala(z.od)) + '</span>' +
    '<span class="zprava-kdo"><b>' + esc(kdo) + '</b><small class="orez-1">' +
      (rozbalena ? 'komu: ' + esc(jmenaAdres(z.komu)) + (z.kopie ? ' · kopie: ' + esc(jmenaAdres(z.kopie)) : '') : esc(prvniRadek(z.text, 120))) +
    '</small></span><span class="zprava-cas cisla">' + esc(kdyDlouze(z.kdy)) + '</span></button>';
  if (!rozbalena) return '<article class="zprava sbalena">' + hlava + '</article>';
  // obrázky z webu až na klepnutí – načtení by odesílateli prozradilo otevření i adresu (Gmail je proxuje, my ne)
  const skryteObrazky = z.html && maVzdaleneObrazky(z.html) && !stav.obrazky[z.id];
  const telo = z.html
    ? (skryteObrazky ? '<div class="zprava-obrazky">' + IKONY.obrazek + '<span>Obrázky z webu jsou skryté.</span>' +
        '<button type="button" class="odkaz" data-obrazky="' + esc(z.id) + '">Zobrazit</button></div>' : '') +
      '<div class="zprava-html"><iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" data-html-zpravy="' + esc(z.id) + '" title="Text e-mailu"></iframe></div>'
    : '<div class="zprava-text">' + sOdkazy(z.text || '') + '</div>';
  const prilohy = z.prilohy && z.prilohy.length
    ? '<ul class="prilohy">' + z.prilohy.map((p) => '<li>' + IKONY.priloha + '<span class="orez-1">' + esc(p.nazev) + '</span><small>' + esc(velikost(p.velikost)) + '</small></li>').join('') + '</ul>'
    : '';
  return '<article class="zprava">' + hlava + telo + prilohy + '</article>';
}

/** Akce nad konverzací. Široké okno: Hotovo a Připomenout s popiskem; telefon a panel: jen ikony. */
function akceHlavickyHtml(id, siroke) {
  const st = stav.vlakna[id];
  const souhrn = najdiSouhrn(id) || {};
  const odkaz = st && st.data ? st.data.odkaz : souhrn.odkaz;
  const tl = (atr, ikona, text, klavesa, sPopiskem) => sPopiskem
    ? '<button type="button" class="btn btn--ghost btn--sm" ' + atr + ' title="' + text + (klavesa ? ' (' + klavesa + ')' : '') + '">' + ikona + '<span>' + text + '</span></button>'
    : '<button type="button" class="btn btn--ikona" ' + atr + ' aria-label="' + text + '" title="' + text + (klavesa ? ' (' + klavesa + ')' : '') + '">' + ikona + '</button>';
  const hlavni = tl('data-oznacit="archivovat"', IKONY.hotovo, 'Hotovo', 'E', siroke) + tl('data-pripomenout', IKONY.pripomenout, 'Připomenout', 'H', siroke);
  const dalsi = tl('data-oznacit="neprectene"', IKONY.neprectene, 'Označit jako nepřečtené', 'U') + tl('data-oznacit="spam"', IKONY.spam, 'Spam') +
    (odkaz && odkaz !== '#' ? '<a class="btn btn--ikona" href="' + esc(odkaz) + '" target="_blank" rel="noopener" aria-label="Otevřít v Gmailu" title="Otevřít v Gmailu">' + IKONY.ven + '</a>' : '');
  return siroke ? '<div class="detail-lista__skupina">' + hlavni + '</div><div class="detail-lista__skupina">' + dalsi + '</div>' : hlavni + dalsi;
}

function akceVlaknaHtml() {
  return '<div class="vlakno-akce">' +
    '<button type="button" class="btn btn--primary" data-psat="odpoved" title="Odpovědět (R)">' + IKONY.odpovedet + '<span>Odpovědět</span></button>' +
    '<button type="button" class="btn btn--ghost" data-psat="vsem" title="Odpovědět všem (A)">' + IKONY.vsem + '<span>Všem</span></button>' +
    '<button type="button" class="btn btn--ghost" data-psat="preposlat" title="Přeposlat (F)">' + IKONY.preposlat + '<span>Přeposlat</span></button></div>';
}

function kdyTerminu(t) {
  const r = rozdilDni(t);
  return r < 0 ? 'minul ' + dm(t) : r === 0 ? 'dnes' : r === 1 ? 'zítra' : dm(t);
}

function jakDlouho(t) {
  const r = -rozdilDni(t);
  return r <= 0 ? 'od dneška' : r === 1 ? 'od včera' : 'už ' + r + ' ' + (r < 5 ? 'dny' : 'dní');
}

/** Limetková karta „Další krok“ (vzor PriorAuth): co s konverzací udělat teď, podle stavu a termínu. */
function dalsiKrokHtml(m) {
  const st = stavZpravy(m);
  const termin = m.termin ? 'Termín ' + kdyTerminu(m.termin) : '';
  const odpovedet = ['data-psat="odpoved"', IKONY.odpovedet, 'Odpovědět'];
  const hotovo = ['data-oznacit="archivovat"', IKONY.hotovo, 'Hotovo'];
  const k = {
    hori: ['Odpověz dnes', termin, odpovedet],
    ceka: ['Odpověz, nebo dej Hotovo', termin, odpovedet],
    otazka: ['Odpověz na otázku', termin, odpovedet],
    cekas: ['Čekáš na odpověď' + (m.cekasOd ? ' ' + jakDlouho(m.cekasOd) : ''), 'Když se neozvou, připomenu ti to.', ['data-pripomenout', IKONY.pripomenout, 'Připomenout']],
    resi: ['Konverzace běží – teď se od tebe nic nečeká', '', hotovo],
    info: ['Jen pro informaci – můžeš ji uklidit', '', hotovo]
  }[st];
  return '<div class="dalsi-krok"><small>' + IKONY.claude + 'Další krok</small><b>' + esc(k[0]) + '</b>' +
    (m.terminVeta ? '<q>' + esc(m.terminVeta) + '</q>' : k[1] ? '<span>' + esc(k[1]) + '</span>' : '') +
    '<button type="button" class="btn btn--sm" ' + k[2][0] + '>' + k[2][1] + '<span>' + k[2][2] + '</span></button></div>';
}

function maVzdaleneObrazky(html) {
  return /<img[^>]+src\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i.test(html);
}

/** Tělo HTML e-mailu: bezpečný rámec (bez skriptů), přizpůsobení šířce displeje a výšce obsahu. */
function pripravTelaZprav(koren) {
  const st = stav.vlakna[stav.otevreneVlakno];
  if (!st || !st.data) return;
  koren.querySelectorAll('iframe[data-html-zpravy]').forEach((ramec) => {
    const z = st.data.zpravy.find((x) => x.id === ramec.dataset.htmlZpravy);
    if (!z) return;
    ramec.addEventListener('load', () => prizpusobRamec(ramec), { once: true });
    // druhá, přísnější pravidla uvnitř rámce: dokud Michal neklepne „Zobrazit“, žádné obrázky ani písma z webu
    const zakazObrazku = stav.obrazky[z.id] ? '' :
      '<meta http-equiv="Content-Security-Policy" content="img-src data: cid:; media-src \'none\'; font-src data:">';
    ramec.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank">' + zakazObrazku +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      // výška podle obsahu: newslettery s výškou 100 % nebo 100vh by jinak zůstaly oříznuté
      '<style>html,body{margin:0;padding:0;background:#fff;color:#1b231e;overflow:hidden;height:auto!important;min-height:0!important}' +
      '[style*="100vh"],[style*="height:100%"],[style*="height: 100%"]{height:auto!important;min-height:0!important}' +
      'body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:4px 2px 10px;overflow-wrap:anywhere}' +
      'img{max-width:100%;height:auto}a{color:#1f6b45}pre{white-space:pre-wrap}' +
      'blockquote{margin:0 0 0 .4em;padding-left:.8em;border-left:3px solid #e8e0d2;color:#555}</style></head><body>' +
      z.html + '</body></html>';
  });
}

function prizpusobRamec(ramec) {
  const doc = ramec.contentDocument;
  if (!doc || !doc.body) return;
  const prepocitej = () => {
    doc.body.style.transform = '';
    doc.body.style.width = '';
    const sirka = ramec.clientWidth;
    const obsah = doc.documentElement.scrollWidth;
    let meritko = 1;
    if (obsah > sirka + 2) { // široké e-maily (600 px) zmenšit na šířku displeje
      meritko = sirka / obsah;
      doc.body.style.width = obsah + 'px';
      doc.body.style.transformOrigin = '0 0';
      doc.body.style.transform = 'scale(' + meritko + ')';
    }
    ramec.style.height = Math.ceil(doc.documentElement.scrollHeight * meritko) + 'px';
  };
  prepocitej();
  Array.from(doc.images).forEach((img) => { if (!img.complete) img.addEventListener('load', prepocitej, { once: true }); });
}

// ---------------------------------------------------------------- psaní

function posledniCizi(d) {
  for (let i = d.zpravy.length - 1; i >= 0; i--) if (!d.zpravy[i].odeMe) return d.zpravy[i];
  return d.zpravy[d.zpravy.length - 1];
}

function bezPredpony(s) { return String(s || '').replace(/^\s*((re|fw|fwd|odp|vs|tr)\s*:\s*)+/i, ''); }

export function otevriPsani(rezim) {
  const id = stav.otevreneVlakno;
  const d = id && stav.vlakna[id] && stav.vlakna[id].data;
  if (rezim !== 'novy' && !d) { toast(id ? 'Počkej, až se zpráva načte.' : 'Nejdřív otevři konverzaci.'); return; }
  const cil = d && rezim !== 'novy' ? posledniCizi(d) : null;
  const info = (stav.info && stav.info.posta) || {};
  const ucet = cil ? (d.ucet || 'osobni') : (aktivniUcet() === 'pracovni' && info.pracovniAdresa ? 'pracovni' : 'osobni');
  const klic = KONCEPT + rezim + '.' + (cil ? cil.id : 'novy');
  const koncept = uloziste.cti(klic) || {};
  let komu = '';
  if (rezim === 'odpoved') komu = cil.od + ' <' + cil.odAdresa + '>';
  if (rezim === 'vsem') {
    const ja = [info.osobniAdresa, info.pracovniAdresa].filter(Boolean).map((a) => a.toLowerCase());
    komu = [cil.od + ' <' + cil.odAdresa + '>'].concat(String(cil.komu || '').split(','), String(cil.kopie || '').split(','))
      .map((a) => a.trim()).filter((a) => a && !ja.some((x) => a.toLowerCase().indexOf(x) >= 0)).join(', ');
  }
  stav.psani = { rezim, ucet, zpravaId: cil ? cil.id : null, vlaknoId: cil ? id : null, klic, komu,
    predmet: rezim === 'novy' ? '' : (rezim === 'preposlat' ? 'Fwd: ' : 'Re: ') + bezPredpony(d.predmet), citace: cil ? cil.text : '',
    // jedno ID na jedno psaní – motor podle něj pozná opakovaný pokus a e-mail nepošle dvakrát
    idOdeslani: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2), odpocet: null };
  otevriPanel({
    id: 'psani', trida: 'panel-okno panel-psani',
    titul: { odpoved: 'Odpověď', vsem: 'Odpověď všem', preposlat: 'Přeposlat', novy: 'Nový e-mail' }[rezim],
    vpravo: () => '<button type="button" class="btn btn--primary" data-odeslat title="Odeslat (Ctrl+Enter)">' + IKONY.odeslat + '<span>Odeslat</span></button>',
    vykresli: () => psaniHtml(koncept),
    poOtevreni: (el) => {
      const pole = el.querySelector(rezim === 'novy' || rezim === 'preposlat' ? '[data-psani-komu]' : '[data-psani-text]');
      const text = el.querySelector('[data-psani-text]');
      if (text) prizpusobVysku(text);
      if (pole && !pole.value) pole.focus(); else if (text) text.focus();
    },
    priZavreni: () => { if (stav.psani && stav.psani.odpocet) clearInterval(stav.psani.odpocet); stav.psani = null; }
  });
}

function psaniHtml(koncept) {
  const p = stav.psani;
  const info = (stav.info && stav.info.posta) || {};
  const adresaOd = p.ucet === 'pracovni' ? info.pracovniAdresa : info.osobniAdresa;
  let h = '<div class="psani">';
  if (p.rezim === 'novy' && info.pracovniAdresa) {
    h += '<div class="psani-radek"><span class="psani-popisek">Od</span>' +
      segment([['osobni', 'Osobní'], ['pracovni', 'Pracovní']], p.ucet, 'data-psani-ucet', 'Z kterého účtu') + '</div>';
  } else if (adresaOd) {
    h += '<div class="psani-radek"><span class="psani-popisek">Od</span><span class="psani-hodnota">' + esc(adresaOd) + '</span></div>';
  }
  if (p.ucet === 'pracovni' && info.pracovniAdresa && info.lzeOdesilatZPracovni === false) {
    h += '<p class="pruh pruh-varovani">Z pracovní adresy zatím odesílat nejde – v Gmailu chybí „Odesílat poštu jako“. Návod je v Nastavení → Pošta.</p>';
  }
  if (p.rezim === 'odpoved' || p.rezim === 'vsem') {
    h += '<div class="psani-radek"><span class="psani-popisek">Komu</span><span class="psani-hodnota">' + esc(jmenaAdres(p.komu)) + '</span></div>';
  } else {
    h += '<label class="psani-radek"><span class="psani-popisek">Komu</span><input type="email" multiple data-psani-komu autocomplete="email" ' +
      'inputmode="email" autocapitalize="off" spellcheck="false" placeholder="adresa@…" value="' + esc(koncept.komu || '') + '"></label>';
  }
  if (p.rezim === 'novy') {
    h += '<label class="psani-radek"><span class="psani-popisek">Předmět</span><input type="text" data-psani-predmet value="' + esc(koncept.predmet || '') + '"></label>';
  } else {
    h += '<div class="psani-radek"><span class="psani-popisek">Předmět</span><span class="psani-hodnota">' + esc(p.predmet) + '</span></div>';
  }
  h += '<textarea class="psani-text" data-psani-text rows="6" placeholder="Text zprávy…">' + esc(koncept.text || '') + '</textarea>';
  if (p.citace) h += '<details class="psani-citace"><summary>Původní zpráva</summary><div>' + esc(prvniRadek(p.citace, 3000)) + '</div></details>';
  if (koncept.text) h += '<button type="button" class="odkaz psani-zahodit" data-zahodit-koncept>Zahodit rozepsaný text</button>';
  return h + '</div>';
}

function ulozKoncept() {
  const el = elementPanelu('psani');
  if (!el || !stav.psani) return;
  const hodnota = (sel) => { const x = el.querySelector(sel); return x ? x.value : ''; };
  const koncept = { text: hodnota('[data-psani-text]'), komu: hodnota('[data-psani-komu]'), predmet: hodnota('[data-psani-predmet]') };
  if (koncept.text.trim() || koncept.komu.trim() || koncept.predmet.trim()) uloziste.pis(stav.psani.klic, koncept);
  else uloziste.smaz(stav.psani.klic);
}

async function odeslat(tlacitko) {
  const p = stav.psani;
  const el = elementPanelu('psani');
  if (!p || !el) return;
  const text = el.querySelector('[data-psani-text]').value;
  if (!text.trim()) { toast('Napiš text zprávy.', true); el.querySelector('[data-psani-text]').focus(); return; }
  const data = { rezim: p.rezim, id: p.zpravaId, text, ucet: p.ucet };
  if (p.rezim === 'preposlat' || p.rezim === 'novy') {
    data.komu = el.querySelector('[data-psani-komu]').value.trim();
    if (!data.komu) { toast('Doplň adresáta.', true); el.querySelector('[data-psani-komu]').focus(); return; }
  }
  if (p.rezim === 'novy') data.predmet = el.querySelector('[data-psani-predmet]').value.trim();
  data.idOdeslani = p.idOdeslani;
  // 5 sekund na rozmyšlenou – tlačítko mezitím ukazuje „Zpět (5)“ a klepnutím se odeslání zruší
  let zbyva = 5;
  const popisek = tlacitko.querySelector('span');
  tlacitko.dataset.zpet = '1';
  popisek.textContent = 'Zpět (' + zbyva + ')';
  p.odpocet = setInterval(() => {
    zbyva--;
    if (zbyva > 0) { popisek.textContent = 'Zpět (' + zbyva + ')'; return; }
    clearInterval(p.odpocet);
    p.odpocet = null;
    delete tlacitko.dataset.zpet;
    odeslatHned(p, tlacitko, data);
  }, 1000);
}

function zrusOdeslani(tlacitko) {
  const p = stav.psani;
  if (p && p.odpocet) { clearInterval(p.odpocet); p.odpocet = null; }
  delete tlacitko.dataset.zpet;
  tlacitko.querySelector('span').textContent = 'Odeslat';
  toast('Neodesláno – můžeš psát dál');
}

async function odeslatHned(p, tlacitko, data) {
  tlacitko.disabled = true;
  tlacitko.querySelector('span').textContent = 'Odesílám…';
  try {
    const vysledek = await volej('odeslat', data);
    uloziste.smaz(p.klic);
    const vlakno = p.vlaknoId;
    zavriPanel();
    toast(vysledek && vysledek.jizOdeslano ? 'Tahle zpráva už odešla – podruhé ji neposílám' : 'Odesláno');
    if (vlakno) nactiVlakno(vlakno, true);
    nactiPostu(true);
  } catch (e) {
    tlacitko.disabled = false;
    tlacitko.querySelector('span').textContent = 'Odeslat';
    // při výpadku sítě mohl motor e-mail odeslat – další pokus se stejným ID ho ale nezdvojí
    toast(e.kod === 'sit' ? 'Možná odešlo – zkontroluj Odeslané v Gmailu. Další pokus e-mail nezdvojí.' : e.message, true);
  }
}

// ---------------------------------------------------------------- Hotovo, Spam, nepřečtené

async function oznac(jak) {
  const id = stav.otevreneVlakno;
  if (!id) return;
  if (jak === 'spam' && !potvrd('Označit jako spam? Konverzace se v Gmailu přesune do Spamu.')) return;
  const pryc = jak === 'archivovat' || jak === 'spam';
  const dalsi = pryc ? (sousedni(id, 1) || sousedni(id, -1)) : null;
  // hned ze seznamu (jako v poštovních klientech), motor se volá na pozadí; při chybě se konverzace vrátí
  let odebrana = null;
  if (pryc) upravVSeznamech(id, (m, i, seznam) => { odebrana = { seznam, i, m }; seznam.splice(i, 1); });
  else upravVSeznamech(id, (m) => { m.neprectena = jak === 'neprectene'; });
  // na širokém okně rovnou další konverzace, jinak zpět na seznam
  if (pryc && DVA_SLOUPCE.matches && dalsi && dalsi !== id) otevriVlakno(dalsi);
  else {
    stav.otevreneVlakno = null;
    if (jeOtevreny('vlakno')) zavriPanel();
  }
  zmeneno();
  if (pryc) toastAkce(jak === 'spam' ? 'Přesunuto do spamu' : 'Hotovo', 'Vrátit', () => vratit(id, odebrana));
  else toast('Označeno jako nepřečtené');
  try {
    await volej('oznacit', { id, jak });
  } catch (e) {
    if (odebrana && !odebrana.seznam.some((x) => x.id === id)) odebrana.seznam.splice(Math.min(odebrana.i, odebrana.seznam.length), 0, odebrana.m);
    zmeneno();
    toast(e.message, true);
  }
}

/** „Vrátit“ po Hotovo nebo Spamu: zpět do seznamu i do Doručené pošty v Gmailu. */
async function vratit(id, odebrana) {
  if (odebrana && !odebrana.seznam.some((x) => x.id === id)) odebrana.seznam.splice(Math.min(odebrana.i, odebrana.seznam.length), 0, odebrana.m);
  zmeneno();
  try {
    await volej('oznacit', { id, jak: 'vratit' });
    toast('Vráceno do Doručené');
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- Připomenout (úkol s termínem do Schránky)

function volbyPripominky() {
  const dnes = pulnoc(Date.now());
  const doPondeli = ((8 - new Date(dnes).getDay()) % 7) || 7;
  return [['Zítra', 1], ['Pozítří', 2], ['V pondělí', doPondeli], ['Za týden', 7]].map((v) => [v[0], isoDatum(pridejDny(dnes, v[1]))]);
}

function otevriPripominku() {
  const id = stav.otevreneVlakno;
  if (!id) return;
  stav.pripominka = { id, termin: volbyPripominky()[0][1] };
  otevriPanel({
    id: 'pripomenout', trida: 'panel-okno panel-pripominka', titul: 'Připomenout',
    vykresli: pripominkaHtml,
    paticka: () => '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--primary" data-ulozit-pripominku>' + IKONY.pripomenout + '<span>Připomenout</span></button></div>',
    poOtevreni: (el) => { const b = el.querySelector('[data-termin][aria-pressed="true"]'); if (b) b.focus({ preventScroll: true }); },
    priZavreni: () => { stav.pripominka = null; }
  });
}

function pripominkaHtml() {
  const p = stav.pripominka;
  const souhrn = najdiSouhrn(p.id) || {};
  const d = stav.vlakna[p.id] && stav.vlakna[p.id].data;
  const predmet = (d && d.predmet) || souhrn.predmet || '';
  return '<div class="pripominka">' +
    '<p class="pripominka__predmet">' + IKONY.posta + '<span class="orez-2">' + esc(predmet) + (souhrn.od ? ' <small class="muted">· ' + esc(souhrn.od) + '</small>' : '') + '</span></p>' +
    '<div><span class="label">Kdy</span><div class="volby">' + volbyPripominky().map((v) => '<button type="button" class="chip" data-termin="' + v[1] + '" aria-pressed="' +
      (v[1] === p.termin) + '">' + v[0] + '<small>' + dm(terminDatum(v[1])) + '</small></button>').join('') + '</div></div>' +
    '<label><span class="label">Nebo vyber datum</span><input class="field" type="date" data-pripominka-datum value="' + p.termin + '" min="' + isoDatum(Date.now()) + '"></label>' +
    '<label><span class="label">Poznámka (nepovinné)</span><textarea class="odpoved" data-pripominka-text rows="2" placeholder="Co s tím mám udělat…"></textarea></label>' +
    '<p class="napoveda">Uloží se do Schránky mezi tvé úkoly s odkazem na e-mail; v den termínu svítí na přehledu Dnes.</p></div>';
}

function zvolTermin(termin) {
  const el = elementPanelu('pripomenout');
  if (!el || !stav.pripominka) return;
  stav.pripominka.termin = termin;
  el.querySelectorAll('[data-termin]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.termin === termin)));
  const pole = el.querySelector('[data-pripominka-datum]');
  if (pole.value !== termin) pole.value = termin;
}

async function ulozPripominku(tlacitko) {
  const el = elementPanelu('pripomenout');
  const p = stav.pripominka;
  if (!el || !p) return;
  const termin = el.querySelector('[data-pripominka-datum]').value || p.termin;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(termin)) { toast('Vyber datum.', true); return; }
  tlacitko.disabled = true;
  try {
    const polozka = await volej('pripomenout', { id: p.id, termin, poznamka: el.querySelector('[data-pripominka-text]').value.trim() });
    if (stav.schranka && polozka) stav.schranka.ceka.push(polozka);
    zavriPanel();
    toast('Připomenu ' + dm(terminDatum(termin)) + ' – úkol je ve Schránce');
    zmeneno();
  } catch (e) {
    tlacitko.disabled = false;
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- ovládání

export function klikPosta(el) {
  if (el.dataset.vlakno) { otevriVlakno(el.dataset.vlakno); return true; }
  if (el.dataset.filtrPosty) {
    stav.filtrPosty = el.dataset.filtrPosty;
    uloziste.pis('asistent.filtrPosty', stav.filtrPosty);
    zmeneno();
    return true;
  }
  if (el.dataset.ucetPosty) {
    stav.ucetPosty = el.dataset.ucetPosty;
    uloziste.pis('asistent.ucetPosty', stav.ucetPosty);
    zmeneno();
    return true;
  }
  if (el.dataset.psat) { otevriPsani(el.dataset.psat); return true; }
  if (el.hasAttribute('data-odeslat')) { if (el.dataset.zpet) zrusOdeslani(el); else odeslat(el); return true; }
  if (el.dataset.oznacit) { oznac(el.dataset.oznacit); return true; }
  if (el.hasAttribute('data-pripomenout')) { otevriPripominku(); return true; }
  if (el.dataset.termin && el.closest('[data-panel="pripomenout"]')) { zvolTermin(el.dataset.termin); return true; }
  if (el.hasAttribute('data-ulozit-pripominku')) { ulozPripominku(el); return true; }
  if (el.dataset.rozbalZpravu) {
    const st = stav.vlakna[stav.otevreneVlakno];
    const posledni = st && st.data && st.data.zpravy[st.data.zpravy.length - 1];
    if (posledni && posledni.id === el.dataset.rozbalZpravu) return true; // poslední zůstává otevřená
    stav.rozbaleneZpravy[el.dataset.rozbalZpravu] = !stav.rozbaleneZpravy[el.dataset.rozbalZpravu];
    obnovDetail(stav.otevreneVlakno);
    return true;
  }
  if (el.dataset.vlaknoZnovu) { nactiVlakno(el.dataset.vlaknoZnovu, true); return true; }
  if (el.dataset.obrazky) { stav.obrazky[el.dataset.obrazky] = true; obnovDetail(stav.otevreneVlakno); return true; }
  if (el.hasAttribute('data-posta-znovu')) { nactiPostu(true); return true; }
  if (el.dataset.psaniUcet && stav.psani) {
    ulozKoncept();
    stav.psani.ucet = el.dataset.psaniUcet;
    const koncept = uloziste.cti(stav.psani.klic) || {};
    const panel = elementPanelu('psani');
    if (panel) { panel.querySelector('.panel-telo').innerHTML = psaniHtml(koncept); }
    return true;
  }
  if (el.hasAttribute('data-zahodit-koncept') && stav.psani) {
    uloziste.smaz(stav.psani.klic);
    zavriPanel();
    toast('Rozepsaný text zahozen');
    return true;
  }
  return false;
}

let casovacKonceptu;
export function vstupPosta(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-pripominka-datum]')) { if (t.value) zvolTermin(t.value); return true; }
  if (!t.closest || !t.closest('[data-panel="psani"]')) return false;
  if (t.matches('[data-psani-text]')) prizpusobVysku(t);
  clearTimeout(casovacKonceptu);
  casovacKonceptu = setTimeout(ulozKoncept, 400);
  return true;
}

/** Klávesy v Poště (PC, iPad s klávesnicí): j/k další a předchozí, e hotovo, h připomenout, u nepřečtené,
 *  r odpovědět, a všem, f přeposlat, c nový e-mail. Vrací true, když klávesu použila. */
export function klavesaPosta(e) {
  const horni = horniPanel();
  if (stav.pohled !== 'posta' || (horni && horni.id !== 'vlakno')) return false;
  const k = e.key.toLowerCase();
  if (k === 'c') { otevriPsani('novy'); return true; }
  if (k === 'j' || k === 'k') {
    const cil = stav.otevreneVlakno ? sousedni(stav.otevreneVlakno, k === 'j' ? 1 : -1) : (filtrovane()[0] || {}).id;
    if (cil) otevriVlakno(cil);
    return true;
  }
  if (!stav.otevreneVlakno) return false;
  const akce = { e: () => oznac('archivovat'), u: () => oznac('neprectene'), h: otevriPripominku,
    r: () => otevriPsani('odpoved'), a: () => otevriPsani('vsem'), f: () => otevriPsani('preposlat') }[k];
  if (!akce) return false;
  akce();
  return true;
}

/** Při otočení iPadu / změně šířky okna přepnout mezi panelem a dvěma sloupci. */
DVA_SLOUPCE.addEventListener('change', () => {
  if (DVA_SLOUPCE.matches && jeOtevreny('vlakno')) {
    const id = stav.otevreneVlakno;
    zavriPanel();
    setTimeout(() => { stav.otevreneVlakno = id; posledniDetail = ''; zmeneno(); }, 300);
  } else {
    posledniDetail = '';
    zmeneno();
  }
});
