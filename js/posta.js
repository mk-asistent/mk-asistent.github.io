// Pošta: jedna schránka pro oba účty (osobní Gmail + pracovní), každá konverzace je „případ“ se stavem
// (Hoří, Čeká na tebe, Otázka, Čekáš na ně, Řeší se, Informace – nápad z poštovního klienta Mailer, stav určuje motor).
// Čtení celých e-mailů, odpověď, přeposlání, nový e-mail; jedním klepnutím Hotovo (archiv), Připomenout, Spam.
// Na telefonu se e-mail otevře přes celou obrazovku, na iPadu na šířku a PC vedle seznamu.

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej } from './api.js';
import {
  esc, kdyKratce, kdyDlouze, prvniRadek, iniciala, odstin, sOdkazy, velikost, jmenaAdres, rozdelAdresy, uloziste,
  pulnoc, pridejDny, isoDatum, terminDatum, dm, rozdilDni
} from './pomocne.js';
import { otevriPanel, obnovPanel, zavriPanel, zavriAPak, jeOtevreny, elementPanelu, horniPanel } from './panely.js';
import { toast, toastAkce, kostra, chybaHtml, segment, prizpusobVysku, potvrd } from './ui.js';
import { IKONY } from './ikony.js';
import { nactiKontakty } from './adresy.js';

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
/** Záložky jako v Gmailu: Primární a Aktualizace jsou z Doručené (motor značí `aktualizace`), ostatní se načtou na klepnutí. */
const KATEGORIE = [['primarni', 'Primární', 'posta'], ['aktualizace', 'Aktualizace', 'info'], ['promo', 'Promoakce', 'stitek'],
  ['socialni', 'Sociální sítě', 'lide'], ['fora', 'Fóra', 'odpovedet']];
const NA_KLEPNUTI = ['promo', 'socialni', 'fora'];
const PREHLED_SKRYTO = 'asistent.prehledSkryto'; // položky přehledu od Clauda, které Michal skryl (klíč → kdy)

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

/** Štítky Gmailu (jednou za otevření aplikace; motor je drží 10 min). */
function nactiStitky() {
  if (!umiMotor('stitky') || stav.stitkyGmailu || stav.nacita.stitky) return;
  stav.nacita.stitky = true;
  volej('stitky').then((s) => { stav.stitkyGmailu = s || []; }).catch(() => { stav.stitkyGmailu = []; })
    .then(() => { stav.nacita.stitky = false; zmeneno(); });
}

/** Konverzace štítku (i archivované) – načte se při výběru, pak drží 5 minut. */
function nactiPostuStitku(nazev, znovu) {
  const s = stav.postaStitku[nazev];
  if (s && (s.nacita || (!znovu && s.vlakna && Date.now() - s.kdy < 5 * 60e3))) return;
  stav.postaStitku[nazev] = Object.assign({}, s, { nacita: true, chyba: null });
  zmeneno();
  volej('postaStitek', { nazev })
    .then((d) => { stav.postaStitku[nazev] = { vlakna: d.vlakna || [], kdy: Date.now() }; })
    .catch((e) => { stav.postaStitku[nazev] = Object.assign({}, stav.postaStitku[nazev], { nacita: false, chyba: e }); })
    .then(zmeneno);
}

/** Záložka, která se načítá zvlášť (Promoakce, Sociální sítě, Fóra) – a není vybraný štítek. */
function naKlepnuti() { return !stav.stitekPosty && NA_KLEPNUTI.indexOf(stav.kategoriePosty) >= 0 && umiMotor('postaKategorie'); }

/** Seznam vybraného štítku nebo záložky na klepnutí ({ vlakna, nacita, chyba }; {} = ještě nenačtený), jinak null. */
function zvlastniSeznam() {
  return stav.stitekPosty ? stav.postaStitku[stav.stitekPosty] || {} : naKlepnuti() ? stav.postaKategorie[stav.kategoriePosty] || {} : null;
}

/** Konverzace vybraného štítku nebo záložky na klepnutí (s účtem), nebo null, když se ukazuje Doručená pošta. */
function vlaknaStitku() {
  const s = zvlastniSeznam();
  if (!s) return null;
  return s.vlakna ? s.vlakna.map((m) => Object.assign({ ucet: 'osobni' }, m)) : [];
}

/** Doručená podle záložky: Primární bez Aktualizací, Aktualizace zvlášť (starší motor bez záložek: všechno). */
function dorucena() {
  const z = vsechnyZpravy();
  if (!umiMotor('postaKategorie')) return z;
  return stav.kategoriePosty === 'aktualizace' ? z.filter((m) => m.aktualizace) : z.filter((m) => !m.aktualizace);
}

/** Konverzace kategorie (Promoakce, Sociální sítě, Fóra) – načte se při výběru záložky, pak drží 5 minut. */
function nactiKategorii(k, znovu) {
  const s = stav.postaKategorie[k];
  if (s && (s.nacita || (!znovu && s.vlakna && Date.now() - s.kdy < 5 * 60e3))) return;
  stav.postaKategorie[k] = Object.assign({}, s, { nacita: true, chyba: null });
  zmeneno();
  volej('postaKategorie', { kategorie: k, znovu: !!znovu })
    .then((d) => { stav.postaKategorie[k] = { vlakna: d.vlakna || [], kdy: Date.now() }; })
    .catch((e) => { stav.postaKategorie[k] = Object.assign({}, stav.postaKategorie[k], { nacita: false, chyba: e }); })
    .then(zmeneno);
}

/** Krátký název štítku: u vnořených jen poslední část („Fotbal/Dorost“ → „Dorost“). */
function kratkyStitek(n) { return String(n).split('/').pop(); }

function stitkyHtml(m) {
  return (m.stitky || []).filter((n) => n !== stav.stitekPosty).slice(0, 2).map((n) =>
    '<span class="stitek-gmail" style="--h:' + odstin(n) + '" title="' + esc(n) + '">' + esc(kratkyStitek(n)) + '</span>').join('');
}

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
  const zeSeznamu = (mapa) => { for (const k of Object.keys(mapa)) { const v = (mapa[k].vlakna || []).find((m) => m.id === id); if (v) return v; } return null; };
  return vsechnyZpravy().find((m) => m.id === id) ||
    (stav.hledani && stav.hledani.vlakna ? stav.hledani.vlakna.find((m) => m.id === id) : null) || zeSeznamu(stav.postaStitku) || zeSeznamu(stav.postaKategorie) || null;
}

/** Změna přímo v uložených seznamech (vsechnyZpravy vrací kopie). */
function upravVSeznamech(id, fn) {
  if (!stav.posta) return;
  ['osobni', 'pracovni'].forEach((ucet) => {
    const seznam = stav.posta[ucet] || [];
    const i = seznam.findIndex((m) => m.id === id);
    if (i >= 0) fn(seznam[i], i, seznam);
  });
  [stav.postaStitku, stav.postaKategorie].forEach((mapa) => Object.keys(mapa).forEach((k) => {
    const seznam = mapa[k].vlakna || [];
    const i = seznam.findIndex((m) => m.id === id);
    if (i >= 0) fn(seznam[i], i, seznam);
  }));
}

function filtrovane() {
  let z = vlaknaStitku() || dorucena();
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
      '<span class="radek-pod orez-2">' + stavTag(m) + ' ' + (m.navrh ? '<span class="tag tag--limetka">' + IKONY.claude + 'Návrh odpovědi</span> ' : '') +
        stitekUctu + stitkyHtml(m) + esc(m.ukazka || '') + '</span>' +
    '</span></button></li>';
}

function filtryHtml() {
  const ucet = aktivniUcet();
  const zUctu = (vlaknaStitku() || dorucena()).filter((m) => ucet === 'oba' || m.ucet === ucet);
  const pocet = (f) => (f === 'vse' ? zUctu.length : f === 'neprectene' ? zUctu.filter((m) => m.neprectena).length
    : zUctu.filter((m) => stavZpravy(m) === f).length);
  const chipy = FILTRY.filter((f) => f[0] === 'vse' || f[0] === stav.filtrPosty || pocet(f[0]) > 0)
    .map((f) => '<button type="button" class="chip' + (f[0] === 'hori' ? ' chip--hori' : '') + '" data-filtr-posty="' + f[0] + '" aria-pressed="' +
      (stav.filtrPosty === f[0]) + '">' + f[1] + '<span class="pocet cisla">' + pocet(f[0]) + '</span></button>').join('');
  const stitky = stav.stitkyGmailu || [];
  const volbaStitku = stitky.length ? '<label class="stitek-volba" title="Štítky z Gmailu">' + IKONY.stitek +
    '<select data-stitek-posty aria-label="Štítek z Gmailu"><option value="">Doručená pošta</option><optgroup label="Skupiny (štítky Gmailu)">' + stitky.map((s) =>
      '<option value="' + esc(s.nazev) + '"' + (s.nazev === stav.stitekPosty ? ' selected' : '') + '>' + esc(s.nazev) + (s.neprectenych ? ' (' + s.neprectenych + ')' : '') + '</option>').join('') +
    '</optgroup></select></label>' : '';
  return '<div class="filtry posta-filtry">' + volbaStitku + '<div class="segment" role="group" aria-label="Stav konverzací">' + chipy + '</div>' +
    (maPracovni() ? segment([['oba', 'Oba účty'], ['osobni', 'Osobní'], ['pracovni', 'Pracovní']], ucet, 'data-ucet-posty', 'Účet') : '') + '</div>';
}

/** Záložky jako v Gmailu s počtem nepřečtených (Primární a Aktualizace z Doručené, ostatní čísla posílá motor). */
function kategorieHtml() {
  if (!umiMotor('postaKategorie')) return '';
  const ucet = aktivniUcet();
  const z = vsechnyZpravy().filter((m) => m.neprectena && (ucet === 'oba' || m.ucet === ucet));
  const pocty = stav.posta.pocty || {};
  const pocet = { primarni: z.filter((m) => !m.aktualizace).length, aktualizace: z.filter((m) => m.aktualizace).length,
    promo: pocty.promo, socialni: pocty.socialni, fora: pocty.fora };
  const aktivni = stav.stitekPosty ? '' : stav.kategoriePosty;
  return '<div class="posta-kategorie" role="tablist" aria-label="Kategorie pošty">' + KATEGORIE.map(([k, nazev, ikona]) => {
    const n = pocet[k] || 0;
    return '<button type="button" role="tab" class="posta-kategorie__tab" data-kategorie-posty="' + k + '" aria-selected="' + (aktivni === k) + '">' +
      IKONY[ikona] + '<span>' + nazev + '</span>' + (n ? '<b class="cisla">' + (n >= 50 ? '50+' : n) + '</b>' : '') + '</button>';
  }).join('') + '</div>';
}

function skrytePrehledu() { return uloziste.cti(PREHLED_SKRYTO) || {}; }

/** Skrýt položku přehledu (vyřízená / nezajímá) – jen v tomhle zařízení, starší než měsíc se zapomenou. */
function skryjVPrehledu(klic) {
  const s = skrytePrehledu();
  const hranice = Date.now() - 30 * 864e5;
  Object.keys(s).forEach((k) => { if (!(s[k] > hranice)) delete s[k]; });
  s[klic] = Date.now();
  uloziste.pis(PREHLED_SKRYTO, s);
  zmeneno();
}

/**
 * Přehled od Clauda (naplánovaná úloha prošla Aktualizace, Promoakce, Sociální sítě a Fóra): co vyřídit a co by tě
 * mohlo zajímat; v ostatních záložkách navíc zbytek po skupinách jednou větou. V Primární jen, když je co ukázat.
 */
function prehledHtml(plny) {
  const p = stav.posta && stav.posta.prehled;
  if (!p) {
    return plny ? '<p class="napoveda posta-prehled-nic">' + IKONY.claude + '<span>Přehled od Clauda tu bude, až ho naplánovaná úloha napíše ' +
      '(prochází Aktualizace, Promoakce, Sociální sítě a Fóra každé 4 hodiny).</span></p>' : '';
  }
  const skryto = skrytePrehledu();
  const radky = (seznam, druh) => (seznam || []).filter((x) => !skryto[x.id || x.predmet]).map((x) =>
    '<li class="posta-prehled__polozka posta-prehled--' + druh + '"><button type="button" class="posta-prehled__btn"' + (x.id ? ' data-vlakno="' + esc(x.id) + '"' : ' disabled') + '>' +
      '<span class="posta-prehled__kdo"><b>' + esc(x.od || '') + '</b><span class="orez-1">' + esc(x.predmet || '') + '</span></span>' +
      (x.proc ? '<small>' + esc(x.proc) + '</small>' : '') + '</button>' +
      '<button type="button" class="btn btn--ikona btn--sm" data-prehled-skryt="' + esc(x.id || x.predmet) + '" aria-label="Skrýt z přehledu" title="Skrýt z přehledu">' +
      IKONY.zavrit + '</button></li>').join('');
  const dulezite = radky(p.dulezite, 'dulezite');
  const zajimave = radky(p.zajimave, 'zajimave');
  const zbytek = plny && p.ostatni && p.ostatni.length ? '<ul class="posta-prehled__zbytek">' + p.ostatni.map((x) => '<li><b>' + esc(x.skupina) + '</b>' +
    (x.pocet ? ' <span class="cisla">' + x.pocet + '×</span>' : '') + (x.text ? ' – ' + esc(x.text) : '') + '</li>').join('') + '</ul>' : '';
  if (!dulezite && !zajimave && !zbytek) return '';
  const kdy = Date.parse(p.vytvoreno);
  return '<section class="card posta-prehled"><div class="posta-prehled__hlava">' + IKONY.claude + '<b>Přehled od Clauda</b><small>' +
    [p.prosel ? 'prošel ' + p.prosel + ' e-mailů' : '', isFinite(kdy) ? kdyKratce(kdy) : ''].filter(Boolean).join(' · ') + '</small></div>' +
    (dulezite ? '<h3 class="posta-prehled__nadpis">Vyřiď</h3><ul class="posta-prehled__seznam">' + dulezite + '</ul>' : '') +
    (zajimave ? '<h3 class="posta-prehled__nadpis">Mohlo by tě zajímat</h3><ul class="posta-prehled__seznam">' + zajimave + '</ul>' : '') +
    (zbytek ? '<h3 class="posta-prehled__nadpis">Ostatní stručně</h3>' + zbytek : '') + '</section>';
}

/** Aktualizace, Promoakce…: „Označit vše jako přečtené“ nad seznamem, když je co. */
function hromadneHtml(zpravy) {
  if (stav.kategoriePosty === 'primarni' || !umiMotor('postaPrectene')) return '';
  const n = zpravy.filter((m) => m.neprectena).length;
  return n ? '<div class="posta-hromadne"><span>Nepřečtené: ' + n + '</span><button type="button" class="btn btn--ghost btn--sm" data-kategorie-prectene>' +
    IKONY.fajfka + '<span>Označit vše jako přečtené</span></button></div>' : '';
}

function seznamHtml() {
  if (!stav.posta) return '<div class="card">' + (stav.chyby.posta ? chybaHtml(stav.chyby.posta, 'data-posta-znovu') : kostra(6)) + '</div>';
  const st = zvlastniSeznam();
  if (st && !st.vlakna) return '<div class="card">' + (st.chyba ? chybaHtml(st.chyba, stav.stitekPosty ? 'data-stitek-znovu' : 'data-kategorie-znovu') : kostra(6)) + '</div>';
  const zpravy = filtrovane();
  let h = stav.chyby.posta ? '<p class="pruh pruh-varovani">' + esc(stav.chyby.posta.message) + ' Ukazuju naposledy načtené.</p>' : '';
  if (!stav.stitekPosty && umiMotor('postaKategorie')) h += prehledHtml(stav.kategoriePosty !== 'primarni') + hromadneHtml(zpravy);
  if (!zpravy.length) {
    const f = stav.filtrPosty;
    const zalozka = umiMotor('postaKategorie') && stav.kategoriePosty !== 'primarni' ? (KATEGORIE.find((k) => k[0] === stav.kategoriePosty) || [])[1] : '';
    return h + '<div class="card"><div class="prazdne">' + (STAVY[f] ? STAVY[f][3] : f === 'neprectene' ? 'Všechno přečteno.' : stav.stitekPosty ? 'Se štítkem „' + esc(stav.stitekPosty) + '“ nic není.'
      : zalozka ? 'V záložce „' + zalozka + '“ nic není.' : 'Doručená pošta je prázdná.') + '</div></div>';
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
  nactiStitky();
  nactiKontakty();
  if (stav.stitekPosty) nactiPostuStitku(stav.stitekPosty);
  else if (naKlepnuti()) nactiKategorii(stav.kategoriePosty);
  el.querySelector('#posta-filtry').innerHTML = stav.posta ? kategorieHtml() + filtryHtml() : '';
  // úzký displej: vybraná záložka (třeba Fóra) musí být vidět – lišta se po překreslení vrací na začátek
  const zalozka = el.querySelector('.posta-kategorie [aria-selected="true"]');
  if (zalozka && zalozka.offsetLeft + zalozka.offsetWidth > zalozka.parentElement.clientWidth) zalozka.parentElement.scrollLeft = zalozka.offsetLeft - 12;
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
      '<small>Klávesy: j / k další a předchozí · e hotovo · v přesunout · r odpovědět</small></div>';
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
  if (m && m.neprectena) {
    upravVSeznamech(id, (x) => { x.neprectena = false; });
    const pocty = stav.posta && stav.posta.pocty;
    if (naKlepnuti() && pocty && pocty[stav.kategoriePosty] > 0 && pocty[stav.kategoriePosty] < 50) pocty[stav.kategoriePosty]--;
  }
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
  const gmail = souhrn && souhrn.stitky && souhrn.stitky.length ? souhrn.stitky.map((n) => '<span class="stitek-gmail" style="--h:' + odstin(n) + '">' + esc(n) + '</span>').join('') : '';
  if (stitky || gmail) h += '<div class="vlakno-stitky">' + stitky + gmail + '</div>';
  // proč je konverzace v tomhle stavu (ladění pravidel) a co s ní teď udělat
  if (souhrn && souhrn.duvod) h += '<p class="duvod">Proč: <b>' + esc(souhrn.duvod) + '</b></p>';
  if (d && d.navrhOdpovedi) h += navrhOdpovediHtml(d.navrhOdpovedi);
  else if (souhrn && !souhrn.zPc) h += dalsiKrokHtml(souhrn);
  if (d) {
    // nejnovější nahoře (Michal 2. 10.), rozbalená; starší pod ní sbalené
    h += d.zpravy.slice().reverse().map((z, i) => zpravaHtml(z, i === 0 || !!stav.rozbaleneZpravy[z.id])).join('');
    if (d.skryto) h += '<p class="vlakno-skryto">Starších zpráv: ' + d.skryto + ' – jsou v Gmailu.</p>';
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
      (rozbalena ? 'komu: ' + esc(jmenaAdres(z.komu)) + (z.kopie ? ' · kopie: ' + esc(jmenaAdres(z.kopie)) : '') +
        (z.odpovedNa ? ' · odpověď na: ' + esc(jmenaAdres(z.odpovedNa)) : '') : esc(prvniRadek(z.text, 120))) +
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
  const hlavni = tl('data-oznacit="archivovat"', IKONY.hotovo, 'Hotovo', 'E', siroke) + tl('data-pripomenout', IKONY.pripomenout, 'Připomenout', 'H', siroke) +
    (umiMotor('postaPresunout') && !souhrn.zPc ? tl('data-presunout', IKONY.stitek, 'Přesunout', 'V', siroke) : '');
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

/** Návrh odpovědi od Clauda (naplánovaná úloha nad POSTA_K_ODPOVEDI.json): použít = psaní s textem návrhu a podpisem. */
function navrhOdpovediHtml(n) {
  return '<div class="dalsi-krok navrh-odpovedi"><small>' + IKONY.claude + 'Claude navrhuje odpověď</small>' +
    '<div class="navrh-odpovedi__text">' + esc(n.text) + '</div>' + (n.poznamka ? '<span>' + esc(n.poznamka) + '</span>' : '') +
    '<div class="navrh-odpovedi__akce"><button type="button" class="btn btn--sm" data-navrh-odpovedi="pouzit">' + IKONY.odpovedet + '<span>Použít a upravit</span></button>' +
    '<button type="button" class="btn btn--sm btn--ghost" data-navrh-odpovedi="zahodit">Zahodit</button></div>' +
    '<p>Nic se neodešle, dokud to v psaní neodešleš ty.</p></div>';
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
    (m.terminVeta && st !== 'info' && st !== 'resi' ? '<q>' + esc(m.terminVeta) + '</q>' : k[1] ? '<span>' + esc(k[1]) + '</span>' : '') +
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

/** rezim: odpoved | vsem | preposlat | novy; predvyplnit (nový e-mail z návrhu): { id, prepsat, komu, predmet, text, ucet, poOdeslani } */
export function otevriPsani(rezim, predvyplnit) {
  const id = stav.otevreneVlakno;
  const d = id && stav.vlakna[id] && stav.vlakna[id].data;
  if (rezim !== 'novy' && !d) { toast(id ? 'Počkej, až se zpráva načte.' : 'Nejdřív otevři konverzaci.'); return; }
  const cil = d && rezim !== 'novy' ? posledniCizi(d) : null;
  const info = (stav.info && stav.info.posta) || {};
  // návrh od Clauda říká účet; rychlý zápis ho nechá na aktivním účtu (jako nový e-mail)
  const ucet = predvyplnit && predvyplnit.ucet ? (predvyplnit.ucet === 'pracovni' && info.pracovniAdresa ? 'pracovni' : 'osobni')
    : cil ? (d.ucet || 'osobni') : (aktivniUcet() === 'pracovni' && info.pracovniAdresa ? 'pracovni' : 'osobni');
  // koncept z návrhu má vlastní klíč (každý návrh zvlášť); „prepsat“ = rychlý zápis – vždy čerstvě z poznámky
  const klic = KONCEPT + rezim + '.' + (cil ? cil.id : predvyplnit ? 'navrh.' + (predvyplnit.id || 'rychle') : 'novy');
  let koncept = uloziste.cti(klic) || {};
  if (predvyplnit && (!koncept.text || predvyplnit.prepsat)) {
    const podpis = podpisPro(ucet);
    koncept = { komu: predvyplnit.komu || '', predmet: predvyplnit.predmet || '', text: (predvyplnit.text || '') + (podpis ? '\n\n' + podpis : '') };
  }
  let komu = '';
  // odpověď jde na adresu pro odpověď (Reply-To), když ji odesílatel nastavil – GmailApp.reply to tak dělá
  if (rezim === 'odpoved') komu = cil.odpovedNa || cil.od + ' <' + cil.odAdresa + '>';
  if (rezim === 'vsem') {
    const ja = [info.osobniAdresa, info.pracovniAdresa].filter(Boolean).map((a) => a.toLowerCase());
    komu = [cil.odpovedNa || cil.od + ' <' + cil.odAdresa + '>'].concat(rozdelAdresy(cil.komu), rozdelAdresy(cil.kopie))
      .map((a) => a.trim()).filter((a) => a && !ja.some((x) => a.toLowerCase().indexOf(x) >= 0)).join(', ');
  }
  stav.psani = { rezim, ucet, podpis: podpisPro(ucet), zpravaId: cil ? cil.id : null, vlaknoId: cil ? id : null, klic, komu,
    predmet: rezim === 'novy' ? '' : (rezim === 'preposlat' ? 'Fwd: ' : 'Re: ') + bezPredpony(d.predmet), citace: cil ? cil.text : '',
    // jedno ID na jedno psaní – motor podle něj pozná opakovaný pokus a e-mail nepošle dvakrát
    idOdeslani: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2), odpocet: null,
    poOdeslani: (predvyplnit && predvyplnit.poOdeslani) || null };
  otevriPanel({
    id: 'psani', trida: 'panel-okno panel-psani',
    titul: { odpoved: 'Odpověď', vsem: 'Odpověď všem', preposlat: 'Přeposlat', novy: 'Nový e-mail' }[rezim],
    vpravo: () => '<button type="button" class="btn btn--primary" data-odeslat title="Odeslat (Ctrl+Enter)">' + IKONY.odeslat + '<span>Odeslat</span></button>',
    vykresli: () => psaniHtml(koncept),
    poOtevreni: (el) => {
      const pole = el.querySelector(rezim === 'novy' || rezim === 'preposlat' ? '[data-psani-komu]' : '[data-psani-text]');
      const text = el.querySelector('[data-psani-text]');
      if (text) prizpusobVysku(text);
      if (pole && !pole.value) pole.focus(); else if (text) { text.focus(); text.setSelectionRange(0, 0); text.scrollTop = 0; }
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
    h += '<label class="psani-radek"><span class="psani-popisek">Komu</span><input type="text" data-psani-komu data-naseptavac autocomplete="off" ' +
      'inputmode="email" autocapitalize="off" spellcheck="false" placeholder="jméno nebo adresa…" value="' + esc(koncept.komu || '') + '"></label>';
  }
  if (p.rezim === 'novy') {
    h += '<label class="psani-radek"><span class="psani-popisek">Předmět</span><input type="text" data-psani-predmet value="' + esc(koncept.predmet || '') + '"></label>';
  } else {
    h += '<div class="psani-radek"><span class="psani-popisek">Předmět</span><span class="psani-hodnota">' + esc(p.predmet) + '</span></div>';
  }
  // podpis na konec (dá se upravit); text začíná prázdným řádkem, kurzor na začátku
  const vychozi = p.podpis ? '\n\n' + p.podpis : '';
  const hodnota = koncept.text || vychozi;
  // prohlížeč první odřádkování hned za <textarea> zahodí – proto jedno navíc
  h += '<textarea class="psani-text" data-psani-text rows="6" placeholder="Text zprávy…">' + (hodnota.charAt(0) === '\n' ? '\n' : '') + esc(hodnota) + '</textarea>';
  if (p.citace) h += '<details class="psani-citace"><summary>Původní zpráva</summary><div>' + esc(prvniRadek(p.citace, 3000)) + '</div></details>';
  if (koncept.text) h += '<button type="button" class="odkaz psani-zahodit" data-zahodit-koncept>Zahodit rozepsaný text</button>';
  else if (!p.podpis) h += '<p class="napoveda psani-podpis">Podpis si nastavíš v Nastavení → Pošta.</p>';
  return h + '</div>';
}

function ulozKoncept() {
  const el = elementPanelu('psani');
  if (!el || !stav.psani) return;
  const hodnota = (sel) => { const x = el.querySelector(sel); return x ? x.value : ''; };
  const koncept = { text: hodnota('[data-psani-text]'), komu: hodnota('[data-psani-komu]'), predmet: hodnota('[data-psani-predmet]') };
  // jen podpis bez textu není rozepsaná zpráva
  if (stav.psani.podpis && koncept.text.trim() === stav.psani.podpis.trim()) koncept.text = '';
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
    if (p.poOdeslani) p.poOdeslani(data);
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
  if (jak === 'spam' && !(await potvrd('Označit jako spam?', { ikona: IKONY.spam, text: 'Konverzace se v Gmailu přesune do Spamu. Jde vrátit.', ano: 'Spam' }))) return;
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
    // motor konverzaci odložil (archivoval) – v den termínu se sama vrátí do Doručené; tady ji jen schovat
    upravVSeznamech(p.id, (m, i, seznam) => seznam.splice(i, 1));
    if (stav.otevreneVlakno === p.id) stav.otevreneVlakno = null;
    // nejdřív okno připomínky, PAK detail e-mailu – ale jen když je pořád nahoře (Michal ho mohl zavřít sám
    // nebo otevřít jiný panel; slepý časovač by zavřel ten nový)
    zavriAPak(() => { const horni = horniPanel(); if (horni && horni.id === 'vlakno') zavriPanel(); });
    toast('Odloženo do ' + dm(terminDatum(termin)) + ' – pak se vrátí do Doručené, úkol je ve Schránce');
    zmeneno();
  } catch (e) {
    tlacitko.disabled = false;
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- Přesunout do skupiny (štítek Gmailu), přečíst vše

function otevriPresun() {
  const id = stav.otevreneVlakno;
  if (!id || !umiMotor('postaPresunout')) return;
  stav.presun = { id, nechat: false };
  nactiStitky();
  otevriPanel({
    id: 'presunout', trida: 'panel-okno panel-presun', titul: 'Přesunout do skupiny',
    vykresli: presunHtml,
    priZavreni: () => { stav.presun = null; }
  });
}

function presunHtml() {
  const p = stav.presun;
  if (!p) return '';
  const souhrn = najdiSouhrn(p.id) || {};
  const d = stav.vlakna[p.id] && stav.vlakna[p.id].data;
  const ma = souhrn.stitky || [];
  const stitky = stav.stitkyGmailu || [];
  const seznam = stitky.length ? '<ul class="presun__seznam">' + stitky.map((s) => {
    const je = ma.indexOf(s.nazev) >= 0;
    return '<li><button type="button" class="presun__stitek' + (je ? ' je' : '') + '" data-presun-stitek="' + esc(s.nazev) + '" style="--h:' + odstin(s.nazev) +
      ';--hloubka:' + (s.nazev.split('/').length - 1) + '"><span class="presun__barva" aria-hidden="true"></span><span class="presun__nazev">' + esc(kratkyStitek(s.nazev)) + '</span>' +
      (je ? '<small>' + IKONY.fajfka + 'má – klepnutím odebrat</small>' : '') + '</button></li>';
  }).join('') + '</ul>' : stav.stitkyGmailu ? '<p class="napoveda">V Gmailu zatím nemáš žádné štítky.</p>' : kostra(4);
  return '<div class="presun"><p class="pripominka__predmet">' + IKONY.posta + '<span class="orez-2">' + esc((d && d.predmet) || souhrn.predmet || '') +
    (souhrn.od ? ' <small class="muted">· ' + esc(souhrn.od) + '</small>' : '') + '</span></p>' + seznam +
    '<label class="presun__nechat"><input type="checkbox" data-presun-nechat' + (p.nechat ? ' checked' : '') + '><span>Nechat i v Doručené (jen přidat štítek)</span></label>' +
    '<p class="napoveda">Jako „Přesunout do“ v Gmailu: konverzace dostane štítek a zmizí z Doručené. Najdeš ji ve výběru štítku nad seznamem pošty.</p></div>';
}

async function presun(nazev, tlacitko) {
  const p = stav.presun;
  if (!p) return;
  const id = p.id;
  const souhrn = najdiSouhrn(id) || {};
  const odebrat = (souhrn.stitky || []).indexOf(nazev) >= 0;
  const archivovat = !odebrat && !p.nechat;
  tlacitko.disabled = true;
  try {
    const v = await volej('postaPresunout', { id, stitek: nazev, pridat: !odebrat, archivovat });
    delete stav.postaStitku[nazev]; // seznam štítku se příště načte znovu
    upravVSeznamech(id, (m) => { m.stitky = v.stitky || []; });
    if (archivovat) {
      // jako Hotovo: pryč ze seznamu, na širokém okně rovnou další konverzace; Vrátit = zpět do Doručené (štítek zůstane)
      const dalsi = DVA_SLOUPCE.matches ? (sousedni(id, 1) || sousedni(id, -1)) : null;
      let odebrana = null;
      upravVSeznamech(id, (m, i, seznam) => { odebrana = { seznam, i, m }; seznam.splice(i, 1); });
      if (dalsi && dalsi !== id) { zavriPanel(); otevriVlakno(dalsi); }
      else {
        if (stav.otevreneVlakno === id) stav.otevreneVlakno = null;
        zavriAPak(() => { const horni = horniPanel(); if (horni && horni.id === 'vlakno') zavriPanel(); });
      }
      toastAkce('Přesunuto do ' + kratkyStitek(nazev), 'Vrátit', () => vratit(id, odebrana));
    } else {
      zavriPanel();
      if (stav.vlakna[id]) stav.vlakna[id].verze = Date.now(); // detail se překresluje podle verze
      obnovDetail(id);
      toast(odebrat ? 'Štítek ' + kratkyStitek(nazev) + ' odebrán' : 'Přidán štítek ' + kratkyStitek(nazev));
    }
    zmeneno();
  } catch (e) {
    tlacitko.disabled = false;
    toast(e.message, true);
  }
}

async function prectiKategorii(tlacitko) {
  const k = stav.kategoriePosty;
  const nazev = (KATEGORIE.find((x) => x[0] === k) || [])[1] || '';
  if (!(await potvrd('Označit vše jako přečtené?', { ikona: IKONY.fajfka, ton: 'ok', ano: 'Označit',
    text: 'Nepřečtené e-maily v záložce „' + nazev + '“ se v Gmailu označí jako přečtené (nejvýš 100 najednou).' }))) return;
  tlacitko.disabled = true;
  try {
    const v = await volej('postaPrectene', { kategorie: k });
    const ids = {};
    (v.ids || []).forEach((id) => { ids[id] = true; });
    const oznac = (seznam) => (seznam || []).forEach((m) => { if (ids[m.id]) m.neprectena = false; });
    if (stav.posta) {
      oznac(stav.posta.osobni);
      oznac(stav.posta.pracovni);
      if (stav.posta.pocty && k in stav.posta.pocty) stav.posta.pocty[k] = 0;
    }
    [stav.postaStitku, stav.postaKategorie].forEach((mapa) => Object.keys(mapa).forEach((x) => oznac(mapa[x].vlakna)));
    toast(v.precteno ? 'Označeno jako přečtené: ' + v.precteno : 'Nic nepřečteného tu není');
    zmeneno();
  } catch (e) {
    tlacitko.disabled = false;
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- ovládání

export function klikPosta(el) {
  if (el.dataset.vlakno) { otevriVlakno(el.dataset.vlakno); return true; }
  if (el.dataset.kategoriePosty) {
    stav.kategoriePosty = el.dataset.kategoriePosty;
    uloziste.pis('asistent.kategoriePosty', stav.kategoriePosty);
    stav.stitekPosty = '';
    stav.filtrPosty = 'vse';
    if (naKlepnuti()) nactiKategorii(stav.kategoriePosty);
    zmeneno();
    return true;
  }
  if (el.hasAttribute('data-kategorie-znovu')) { nactiKategorii(stav.kategoriePosty, true); return true; }
  if (el.hasAttribute('data-kategorie-prectene')) { prectiKategorii(el); return true; }
  if (el.dataset.prehledSkryt) { skryjVPrehledu(el.dataset.prehledSkryt); return true; }
  if (el.hasAttribute('data-presunout')) { otevriPresun(); return true; }
  if (el.dataset.presunStitek && stav.presun) { presun(el.dataset.presunStitek, el); return true; }
  if (el.dataset.navrhOdpovedi) {
    const id = stav.otevreneVlakno;
    const d = id && stav.vlakna[id] && stav.vlakna[id].data;
    if (!d || !d.navrhOdpovedi) return true;
    if (el.dataset.navrhOdpovedi === 'pouzit') { otevriPsani('odpoved', { text: d.navrhOdpovedi.text, prepsat: true }); return true; }
    el.disabled = true;
    volej('navrhZahodit', { id }).then(() => {
      delete d.navrhOdpovedi;
      if (stav.vlakna[id]) stav.vlakna[id].verze = Date.now(); // detail se překresluje podle verze
      const s = najdiSouhrn(id);
      if (s) s.navrh = false;
      toast('Návrh zahozen');
      zmeneno();
    }).catch((e) => { el.disabled = false; toast(e.message, true); });
    return true;
  }
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
  if (el.hasAttribute('data-stitek-znovu') && stav.stitekPosty) { nactiPostuStitku(stav.stitekPosty, true); return true; }
  if (el.dataset.psaniUcet && stav.psani) {
    ulozKoncept();
    const staryPodpis = stav.psani.podpis;
    stav.psani.ucet = el.dataset.psaniUcet;
    stav.psani.podpis = podpisPro(stav.psani.ucet);
    const koncept = uloziste.cti(stav.psani.klic) || {};
    // podpis podle účtu: na konci rozepsaného textu vyměnit starý za nový
    if (koncept.text && staryPodpis && koncept.text.replace(/\s+$/, '').endsWith(staryPodpis.trim())) {
      koncept.text = koncept.text.replace(/\s+$/, '').slice(0, -staryPodpis.trim().length) + (stav.psani.podpis || '');
    }
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
  const akce = { e: () => oznac('archivovat'), u: () => oznac('neprectene'), h: otevriPripominku, v: otevriPresun,
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

/** Podpis pro účet (z motoru: info.posta.podpisy). */
function podpisPro(ucet) {
  const p = stav.info && stav.info.posta && stav.info.posta.podpisy;
  return p ? String(p[ucet === 'pracovni' ? 'pracovni' : 'osobni'] || '').trim() : '';
}

/** Výběr štítku Gmailu v Poště. Vrací true, když změna patří sem. */
export function zmenaPosta(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-presun-nechat]')) { if (stav.presun) stav.presun.nechat = t.checked; return true; }
  if (!t.matches || !t.matches('[data-stitek-posty]')) return false;
  stav.stitekPosty = t.value;
  stav.filtrPosty = 'vse';
  stav.otevreneVlakno = null;
  if (t.value) nactiPostuStitku(t.value);
  zmeneno();
  return true;
}
