// Pošta: jedna schránka pro oba účty (osobní Gmail + pracovní), každá konverzace je „případ“ se stavem
// (Hoří, Čeká na tebe, Otázka, Čekáš na ně, Řeší se, Informace – nápad z poštovního klienta Mailer, stav určuje motor).
// Čtení celých e-mailů, odpověď, přeposlání, nový e-mail; jedním klepnutím Hotovo (archiv), Připomenout, Spam.
// Na telefonu se e-mail otevře přes celou obrazovku, na iPadu na šířku a PC vedle seznamu.
// Michal 9. 10.: skupiny (štítky Gmailu) jako druhá lišta pod záložkami, přetažení e-mailu na skupinu (na dotyku dlouhé
// podržení řádku), řádek jen odesílatel · předmět · text · čas, detaily posledních konverzací přednačtené (klepnutí bez
// čekání na motor), návrh odpovědi od Clauda pod e-mailem, upozornění Apps Scriptu se nehlásí.

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
import * as wedos from './wedos.js'; // WEDOS: se zapnutou schránkou je účet Pracovní přímo z WEDOS (server), ne z Gmailu

const DVA_SLOUPCE = window.matchMedia('(min-width: 1000px)');
const TAHNUTI = window.matchMedia('(hover: hover) and (pointer: fine)'); // myš: řádek jde přetáhnout na skupinu
const ULOZISTE = 'asistent.data.posta';
const KONCEPT = 'asistent.koncept.';
const DNI_OZNAMENI = 14; // oznámení starší dvou týdnů se v přehledu neukazují (motor posílá 30 dní)
let posledniDetail = null; // null = detail ještě nevykreslený (i prázdný „Vyber konverzaci vlevo“ se musí ukázat)

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
  if (v && v.data) stav.posta = pripravPostu(v.data);
  nactiDetaily();
}

export function nactiPostu(znovu) {
  if (stav.nacita.posta) return Promise.resolve();
  stav.nacita.posta = true;
  stav.chyby.posta = null;
  zmeneno();
  return volej('posta', { znovu: !!znovu })
    .then((data) => {
      stav.posta = pripravPostu(data);
      uloziste.pis(ULOZISTE, { data, kdy: Date.now() });
      naplanujPrednacteni(); // i na Dnes – klepnutí na e-mail tam pak taky nečeká
    })
    .catch((e) => { stav.chyby.posta = e; })
    .then(() => { stav.nacita.posta = false; zmeneno(); });
}

export function stavZpravy(m) { return STAVY[m.stav] ? m.stav : 'ceka'; }

// Upozornění Googlu na chyby Apps Scriptu (Michal 9. 10.: „noreply apps scripts mi nemusíš oznamovat“): v seznamu pošty
// zůstanou jako informace, ale nepočítají se do nepřečtených na Dnes a nikde nesvítí. Nový motor je značí `tiche`,
// starší kopie se poznají tady.
const APPS_SCRIPT_ADRESA = /apps-scripts?-notifications@google\.com/i;
const APPS_SCRIPT_PREDMET = /(?:summary of failures for|souhrn (?:selhání|chyb|neúspěšných)).{0,40}apps script/i;
export function jeTicha(m) {
  if (!m) return false;
  const adresa = String(m.odAdresa || ''), predmet = String(m.predmet || '');
  return !!m.tiche || APPS_SCRIPT_ADRESA.test(adresa) || APPS_SCRIPT_PREDMET.test(predmet) || (/@google\.com$/i.test(adresa) && /apps script/i.test(predmet));
}

/** Souhrny hned po načtení: náhled bez hlaviček přeposlání a citací (i ze starších kopií), Apps Script = tichá informace. */
function pripravSouhrny(seznam) {
  (seznam || []).forEach((m) => {
    if (!m) return;
    m.ukazka = cistaUkazka(m.ukazka, m.predmet);
    if (jeTicha(m)) Object.assign(m, { tiche: true, stav: 'info', duvod: 'upozornění Google Apps Script', termin: null, terminVeta: '' });
  });
  return seznam;
}

function pripravPostu(data) {
  if (data) {
    pripravSouhrny(data.osobni);
    pripravSouhrny(data.pracovni);
    if (data.firemni && Array.isArray(data.firemni.zpravy)) pripravSouhrny(data.firemni.zpravy);
  }
  return data;
}

// Náhled zprávy (Michal 9. 10.: „primárně mi stačí kdo poslal mail, předmět a už pak rovnou text“) – motor ho od 9. 10.
// posílá čistý, tohle čistí starší kopie: řádky jsou v náhledu slité do jednoho, proto podle vzorů hlaviček.
const ODDELOVACE = /-{2,}\s*(?:původní e-mail|původní zpráva|přeposlaná zpráva|přeposlaný e-mail|forwarded message|original message)\s*-{2,}|begin forwarded message:|začátek přeposlané zprávy:|_{6,}/gi;
const HLAVICKA_ADRESY = /(?:^|\s)\*?(?:od|from|komu|to|kopie|cc|bcc|odpovědět na|reply-to)\s*:\*?\s*(?:"?[^"<>:]{0,80}?"?\s*<[^<>\s]+>\s*,?\s*|[^\s<>,:]+@[^\s<>,]+\s*,?\s*|<[^<>\s]+@[^<>\s]+>\s*,?\s*)+/gi;
const HLAVICKA_DATA = /(?:^|\s)\*?(?:datum|date|odesláno|sent)\s*:\*?\s*(?:[^:]{0,60}?\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:AM|PM|SELČ|SEČ|CEST|CET|UTC|GMT(?:[+-]\d{1,4})?|[+-]\d{4}))?|\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|\d{4}-\d{2}-\d{2})/gi;
// úvod citace má vždy datum („Dne čt 9. 10. 2026 v 10:00 … napsal:“, „On Thu, Oct 9, 2026 at 10:00 … wrote:“) – „on to napsal:“ ne
const UVOD_CITACE = /(?:^|\s)(?:dne|on)\s(?=.{0,40}\d).{4,200}?(?:napsal\(a\)|napsala|napsal|wrote)\s?:/i;
const bezPredpon = (s) => String(s || '').replace(/^\s*((re|fwd?|fw|odp|vs|tr)\s*:\s*)+/i, '').trim();
const regexText = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function cistaUkazka(s, predmet) {
  let t = String(s || '').replace(/[\u00ad\u034f\u200b-\u200f\u2060-\u2064\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // odpověď: od „Dne … napsal(a):“ / „On … wrote:“ dál je starší zpráva (když nic nepředchází, jen ten úvod pryč)
  const citace = UVOD_CITACE.exec(t);
  if (citace) t = citace.index > 0 ? t.slice(0, citace.index) : t.slice(citace[0].length);
  const zaklad = bezPredpon(predmet);
  const hlavickaPredmetu = new RegExp('(?:^|\\s)\\*?(?:předmět|subject)\\s*:\\*?\\s*(?:(?:re|fwd?|fw|odp|vs|tr)\\s*:\\s*)*' + (zaklad ? '(?:' + regexText(zaklad) + ')?' : ''), 'gi');
  t = t.replace(ODDELOVACE, ' ').replace(HLAVICKA_ADRESY, ' ').replace(HLAVICKA_DATA, ' ').replace(hlavickaPredmetu, ' ')
    .replace(/<(?:https?:|mailto:)[^>\s]*>/gi, ' ').replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:^|\s)(?:odesláno|posláno) z (?:mého )?(?:iphonu|ipadu|androidu|telefonu|mobilu)\S*/gi, ' ').replace(/(?:^|\s)sent from my \S+/gi, ' ')
    .replace(/(?:^|\s)>+(?=\s|$)/g, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

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
    .then((d) => { stav.postaStitku[nazev] = { vlakna: pripravSouhrny(d.vlakna || []), kdy: Date.now() }; naplanujPrednacteni(); })
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
    .then((d) => { stav.postaKategorie[k] = { vlakna: pripravSouhrny(d.vlakna || []), kdy: Date.now() }; naplanujPrednacteni(); })
    .catch((e) => { stav.postaKategorie[k] = Object.assign({}, stav.postaKategorie[k], { nacita: false, chyba: e }); })
    .then(zmeneno);
}

/** Krátký název štítku: u vnořených jen poslední část („Fotbal/Dorost“ → „Dorost“). */
function kratkyStitek(n) { return String(n).split('/').pop(); }

/** Všechny konverzace obou účtů (+ souhrny firemní pošty z PC), nejnovější nahoře. */
export function vsechnyZpravy() {
  const wd = wedos.zapnuto(); // WEDOS: pracovní pošta ze serveru místo Gmailu a souhrnů z PC
  const p = stav.posta || (wd ? {} : null);
  if (!p) return [];
  const pc = !wd && p.firemni && p.firemni.zpravy && !(p.pracovni && p.pracovni.length)
    ? p.firemni.zpravy.map((m) => Object.assign({}, m, { id: 'pc-' + m.id, ucet: 'pracovni', zPc: true }))
    : [];
  const hranice = Date.now() - DNI_OZNAMENI * 864e5;
  return (p.osobni || []).map((m) => Object.assign({ ucet: 'osobni' }, m))
    .concat((wd ? wedos.zpravy() : p.pracovni || []).map((m) => Object.assign({ ucet: 'pracovni' }, m)), pc)
    .filter((m) => !(m.stav === 'info' && m.kdy < hranice))
    .sort((a, b) => b.kdy - a.kdy);
}

/** Nepřečtené pro Dnes a odznak v menu – bez upozornění Apps Scriptu (v Poště se počítají dál). */
export function neprectene() { return vsechnyZpravy().filter((m) => m.neprectena && !m.tiche); }
export function maPracovni() { return wedos.zapnuto() || !!(stav.posta && (stav.posta.pracovniAdresa || (stav.posta.firemni && stav.posta.firemni.zpravy))); }
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
  if (wedos.jeWedos(id)) { const s = wedos.zpravy(); const i = s.findIndex((m) => m.id === id); if (i >= 0) fn(s[i], i, s); return; } // WEDOS
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

/**
 * Řádek konverzace (Pošta i Dnes): odesílatel, předmět, text a čas – nic dalšího (Michal 9. 10.). Stav jen proužkem vlevo
 * (hoří korálová, čeká na tebe zelená, otázka žlutá; název a důvod v popisku), návrh od Clauda malou ikonou, účet drobně
 * jen v zobrazení obou účtů. V Poště jde řádek myší přetáhnout na skupinu.
 */
export function zpravaRadekHtml(m, ukazUcet) {
  const aktivni = DVA_SLOUPCE.matches && stav.pohled === 'posta' && stav.otevreneVlakno === m.id ? ' aktivni' : '';
  const st = stavZpravy(m);
  const popis = STAVY[st][0] + (m.duvod ? ' – ' + m.duvod : '');
  const tahnout = TAHNUTI.matches && stav.pohled === 'posta' && !m.zPc && m.zdroj !== 'wedos' && umiMotor('postaPresunout') ? ' draggable="true"' : '';
  const text = m.ukazka ? cistaUkazka(m.ukazka, m.predmet) : '';
  return '<li class="' + (m.neprectena ? 'neprect' : 'prect') + aktivni + ' st-' + st + '"><button type="button" class="radek radek-posta" data-vlakno="' + esc(m.id) + '"' +
    ' title="' + esc(popis) + '"' + tahnout + '>' +
    '<span class="avatar" style="--h:' + odstin(m.od) + '" aria-hidden="true">' + esc(iniciala(m.od)) + '</span>' +
    '<span class="radek-obsah">' +
      '<span class="radek-hora">' + (m.neprectena ? '<span class="tecka" aria-label="nepřečtené"></span>' : '') +
        '<span class="radek-titul orez-1">' + esc(m.od) + '</span>' +
        (m.navrh ? '<span class="radek-navrh" title="Claude připravil návrh odpovědi" aria-label="návrh odpovědi od Clauda">' + IKONY.claude + '</span>' : '') +
        (ukazUcet ? '<span class="radek-ucet radek-ucet--' + (m.ucet === 'pracovni' ? 'pracovni' : 'osobni') + '">' + (m.ucet === 'pracovni' ? 'Pracovní' : 'Osobní') + '</span>' : '') +
        '<span class="radek-cas cisla">' + esc(kdyKratce(m.kdy)) + '</span></span>' +
      '<span class="radek-predmet orez-1">' + esc(m.predmet) + (m.pocet > 1 ? ' <span class="pocet">' + m.pocet + '</span>' : '') + '</span>' +
      (text ? '<span class="radek-text orez-2">' + esc(text) + '</span>' : '') +
      '<span class="radek-stav">' + esc(STAVY[st][0]) + '</span>' +
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
  return '<div class="filtry posta-filtry"><div class="segment" role="group" aria-label="Stav konverzací">' + chipy + '</div>' +
    (maPracovni() ? segment([['oba', 'Oba účty'], ['osobni', 'Osobní'], ['pracovni', 'Pracovní']], ucet, 'data-ucet-posty', 'Účet') : '') + '</div>';
}

/** Štítky seřazené jako strom: rodič a hned za ním jeho podštítky (AUTO, AUTO/PATRIOT, BYT VESELÍ …). */
function stromStitku() {
  const cesta = (s) => s.nazev.split('/');
  return (stav.stitkyGmailu || []).slice().sort((a, b) => {
    const x = cesta(a), y = cesta(b);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      const c = x[i].localeCompare(y[i], 'cs');
      if (c) return c;
    }
    return x.length - y.length;
  });
}

/**
 * Druhá lišta pod záložkami (Michal 9. 10.): skupiny = štítky Gmailu jako čipy s počtem nepřečtených. Klepnutí = konverzace
 * skupiny (i archivované), znovu klepnutí = zpět do Doručené. Myší sem jde přetáhnout e-mail ze seznamu („Přesunout do“).
 * Podštítek („AUTO/PATRIOT“) jde hned za rodičem jako „/ PATRIOT“. Na telefonu se lišta posouvá do strany, jinde zalomí.
 */
function listaStitkuHtml() {
  const stitky = stromStitku();
  if (!stitky.length) return '';
  const nazvy = {};
  stitky.forEach((s) => { nazvy[s.nazev] = true; });
  // ikona na začátku lišty je vždy (při táhnutí jen změní barvu) – kdyby se nápověda objevila až při táhnutí, čipy by
  // uskočily pod myší a e-mail by spadl do jiné skupiny
  return '<div class="posta-stitky" role="toolbar" aria-label="Skupiny – štítky Gmailu"><span class="posta-stitky__ikona" title="Skupiny (štítky Gmailu)' +
    (TAHNUTI.matches ? ' – e-mail sem jde přetáhnout ze seznamu' : '') + '" aria-hidden="true">' + IKONY.stitek + '</span>' + stitky.map((s) => {
    const casti = s.nazev.split('/');
    const pod = casti.length > 1 && nazvy[casti.slice(0, -1).join('/')];
    const aktivni = s.nazev === stav.stitekPosty;
    return '<button type="button" class="stitek-cip' + (pod ? ' stitek-cip--pod' : '') + '" data-stitek-posty="' + esc(s.nazev) + '" aria-pressed="' + aktivni + '"' +
      ' title="' + esc(s.nazev) + (aktivni ? ' – klepnutím zpět do Doručené' : '') + '" style="--h:' + odstin(s.nazev) + '">' +
      (pod ? '<span class="stitek-cip__lomitko" aria-hidden="true">/</span>' : '<i class="stitek-cip__barva" aria-hidden="true"></i>') +
      '<span class="stitek-cip__nazev">' + esc(pod ? casti[casti.length - 1] : s.nazev) + '</span>' +
      (s.neprectenych ? '<b class="cisla" aria-label="nepřečtených ' + s.neprectenych + '">' + s.neprectenych + '</b>' : '') +
      (aktivni ? IKONY.zavrit : '') + '</button>';
  }).join('') + '</div>';
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
  // chyby Apps Scriptu Michal hlásit nechce (9. 10.) – ani když je Claude v přehledu zmíní
  const tiche = (x) => jeTicha({ predmet: x.predmet }) || /^(?:google )?apps script$/i.test(String(x.od || '').trim());
  const radky = (seznam, druh) => (seznam || []).filter((x) => !skryto[x.id || x.predmet] && !tiche(x)).map((x) =>
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
  if (aktivniUcet() !== 'osobni') h += wedos.pruhHtml(); // WEDOS: pracovní schránka se naposledy nenačetla
  if (!stav.stitekPosty && umiMotor('postaKategorie')) h += prehledHtml(stav.kategoriePosty !== 'primarni') + hromadneHtml(zpravy);
  if (!zpravy.length) {
    const f = stav.filtrPosty;
    const zalozka = umiMotor('postaKategorie') && stav.kategoriePosty !== 'primarni' ? (KATEGORIE.find((k) => k[0] === stav.kategoriePosty) || [])[1] : '';
    const prace = aktivniUcet() === 'pracovni' ? pracovniPrazdnaHtml() : '';
    if (prace) return h + prace;
    return h + '<div class="card"><div class="prazdne">' +
      (STAVY[f] ? STAVY[f][3] : f === 'neprectene' ? 'Všechno přečteno.' : stav.stitekPosty ? 'Se štítkem „' + esc(stav.stitekPosty) + '“ nic není.'
      : zalozka ? 'V záložce „' + zalozka + '“ nic není.' : 'Doručená pošta je prázdná.') + '</div></div>';
  }
  return h + '<div class="card"><ul class="seznam seznam-posta">' + zpravy.map((m) => zpravaRadekHtml(m, maPracovni() && aktivniUcet() === 'oba')).join('') + '</ul></div>';
}

/**
 * Zobrazení „Pracovní“ bez pošty (Michal 9. 10.: „nefunguje mi pošta pracovní, není tam nic“ – do Gmailu se pracovní pošta
 * nepřeposílá): místo prázdné stránky proč a kde je návod. Když je pracovní pošta jen v Aktualizacích, odkaz tam.
 */
function pracovniPrazdnaHtml() {
  if (wedos.zapnuto()) return wedos.prazdnaHtml(); // WEDOS: proč je prázdná (chyba, první načtení, nic za 30 dní)
  const p = stav.posta || {};
  const zadna = !(p.pracovni && p.pracovni.length) && !(p.firemni && p.firemni.zpravy && p.firemni.zpravy.length);
  if (zadna) {
    return '<div class="card posta-prace-prazdna">' + IKONY.posta + '<div><b>Za 30 dní nepřišla do Gmailu žádná pracovní pošta</b>' +
      '<p>' + (p.pracovniAdresa ? 'Na adresu <b>' + esc(p.pracovniAdresa) + '</b> nic nedorazilo' : 'Pracovní e-maily v Gmailu nejsou') +
      ' – z WEDOS se do Gmailu nepřeposílá. Zapni si <b>Pracovní schránku přímo (WEDOS)</b> v Nastavení → Pošta – pošta ' +
      'pak půjde rovnou ze serveru aplikace.</p>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-otevri-nastaveni="posta" data-posta-navod>' + IKONY.nastaveni + '<span>Nastavení pošty</span></button></div></div>';
  }
  const vAktualizacich = !stav.stitekPosty && stav.kategoriePosty === 'primarni' && stav.filtrPosty === 'vse' && umiMotor('postaKategorie') ?
    (p.pracovni || []).filter((m) => m.aktualizace && (m.stav !== 'info' || m.kdy > Date.now() - DNI_OZNAMENI * 864e5)).length : 0;
  return vAktualizacich ? '<div class="card posta-prace-prazdna">' + IKONY.info + '<div><b>V Primární žádná pracovní pošta</b>' +
    '<p>Pracovní e-maily jsou v záložce Aktualizace: ' + vAktualizacich + '.</p>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-kategorie-posty="aktualizace">' + IKONY.info + '<span>Ukázat Aktualizace</span></button></div></div>' : '';
}

/** Pohled Pošta: filtry nahoře, pod nimi seznam | detail. Detail se překresluje jen při změně vlákna. */
export function vykresliPostu(el) {
  if (!el.querySelector('.posta-rozlozeni')) {
    el.innerHTML = '<div id="posta-filtry"></div><div class="posta-rozlozeni"><div class="posta-seznam" id="posta-seznam"></div>' +
      '<div class="posta-detail" id="posta-detail"></div></div>';
    posledniDetail = null;
  }
  nactiStitky();
  nactiKontakty();
  if (stav.stitekPosty) nactiPostuStitku(stav.stitekPosty);
  else if (naKlepnuti()) nactiKategorii(stav.kategoriePosty);
  // během přetahování e-mailu nic nepřekreslovat (tažený řádek i cílová skupina by zmizely pod rukou)
  if (tah.id) { tah.odlozeno = true; return; }
  el.querySelector('#posta-filtry').innerHTML = stav.posta ? kategorieHtml() + listaStitkuHtml() + filtryHtml() : '';
  // úzký displej: vybraná záložka (třeba Fóra) a vybraná skupina musí být vidět – lišty se po překreslení vrací na začátek
  el.querySelectorAll('.posta-kategorie [aria-selected="true"], .posta-stitky [aria-pressed="true"]').forEach((x) => {
    const lista = x.parentElement;
    if (lista.scrollWidth > lista.clientWidth && x.offsetLeft + x.offsetWidth > lista.clientWidth) lista.scrollLeft = x.offsetLeft - 12;
  });
  el.querySelector('#posta-seznam').innerHTML = seznamHtml();
  if (DVA_SLOUPCE.matches) vykresliDetail();
  naplanujPrednacteni();
}

function klicDetailu() {
  const id = stav.otevreneVlakno;
  const st = id && stav.vlakna[id];
  // i stav a štítky ze seznamu (po obnovení pošty nebo přesunu se mění, i když detail zůstává stejný)
  const s = id && najdiSouhrn(id);
  return id ? id + ':' + (st ? (st.nacita ? 'n' : '') + (st.ceka ? 'c' : '') + (st.chyba ? 'e' : '') + (st.verze || 0) : '-') + ':' + JSON.stringify(stav.rozbaleneZpravy) +
    ':' + JSON.stringify(stav.obrazky) + ':' + (s ? s.stav + '|' + s.duvod + '|' + (s.stitky || []).join(',') : '')
    : 'prazdny:' + ((stav.stitkyGmailu || []).length ? 1 : 0); // bez konverzace: nápověda k přetažení, až jsou skupiny
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
      '<small>Klávesy: j / k další a předchozí · e hotovo · v přesunout · r odpovědět</small>' +
      (TAHNUTI.matches && (stav.stitkyGmailu || []).length ? '<small>E-mail ze seznamu přetáhni na skupinu nahoře – přesune se do ní.</small>' : '') + '</div>';
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
  const bylaNeprectena = !!(m && m.neprectena);
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
  nactiVlakno(id, false, bylaNeprectena);
  zmeneno();
  // na širokém okně řádek v seznamu udržet na očích (j/k)
  if (DVA_SLOUPCE.matches) {
    setTimeout(() => {
      const radek = Array.from(document.querySelectorAll('#posta-seznam [data-vlakno]')).find((b) => b.dataset.vlakno === id);
      if (radek) { const r = radek.getBoundingClientRect(); if (r.bottom > innerHeight || r.top < 0) radek.scrollIntoView({ block: 'nearest' }); }
    }, 30);
  }
}

/**
 * Detail konverzace: z paměti hned (přednačtený nebo už jednou otevřený), motor jen označí přečtené; když souhrn ze seznamu
 * ukazuje novější stav (nová zpráva, nový návrh od Clauda), načte se celý na pozadí. Bez detailu v paměti z motoru – nebo
 * z přednačtení, které zrovna běží (druhý dotaz by Apps Script stejně zařadil až za něj).
 */
function nactiVlakno(id, znovu, bylaNeprectena) {
  if (wedos.jeWedos(id)) { nactiZWedos(id, znovu, bylaNeprectena); return; } // WEDOS
  const st = stav.vlakna[id];
  if (st && st.data && !znovu) {
    obnovDetail(id);
    if (!detailSedi(st.data, najdiSouhrn(id))) nactiZMotoru(id);
    else if (bylaNeprectena) oznacPrectene(id);
    return;
  }
  if (!znovu && prednacteni && prednacteni.ids.has(id)) {
    stav.vlakna[id] = Object.assign({}, st, { ceka: true, chyba: null });
    obnovDetail(id);
    prednacteni.slib.then(() => {
      const x = stav.vlakna[id];
      if (x && x.data) {
        delete x.ceka;
        obnovDetail(id);
        if (bylaNeprectena) oznacPrectene(id);
      } else nactiZMotoru(id);
    });
    return;
  }
  nactiZMotoru(id);
}

/** Celý detail z motoru (otevřením se v Gmailu označí jako přečtený); zobrazený detail zůstává, dokud nepřijde nový. */
function nactiZMotoru(id) {
  const st = stav.vlakna[id];
  stav.vlakna[id] = Object.assign({}, st, { nacita: true, ceka: false, chyba: null });
  obnovDetail(id);
  volej('vlakno', { id })
    .then((data) => { stav.vlakna[id] = { data, verze: Date.now() }; ulozDetaily(); })
    .catch((e) => {
      const x = stav.vlakna[id] || {};
      stav.vlakna[id] = Object.assign({}, x, { nacita: false, chyba: x.data ? null : e });
    })
    .then(() => obnovDetail(id));
}

/** WEDOS: detail z paměti, z účtu (server ho chystá předem) nebo přímo ze schránky; otevřením přečtená (js/wedos.js). */
function nactiZWedos(id, znovu, bylaNeprectena) {
  const st = stav.vlakna[id];
  const souhrn = najdiSouhrn(id);
  if (st && st.data && !znovu && detailSedi(st.data, souhrn)) {
    obnovDetail(id);
    if (bylaNeprectena) wedos.oznacit(id, 'prectene').catch(() => { /* přečtení se dožene příště */ });
    return;
  }
  stav.vlakna[id] = Object.assign({}, st, { nacita: true, ceka: false, chyba: null });
  obnovDetail(id);
  wedos.detail(id, { kdy: souhrn && souhrn.kdy, precist: !!bylaNeprectena, znovu: !!znovu })
    .then((data) => { stav.vlakna[id] = { data, verze: Date.now() }; ulozDetaily(); })
    .catch((e) => {
      const x = stav.vlakna[id] || {};
      stav.vlakna[id] = Object.assign({}, x, { nacita: false, chyba: x.data ? null : e });
    })
    .then(() => obnovDetail(id));
}

/** Klepnutí na přednačtenou konverzaci: v Gmailu ji označit jako přečtenou (jinak to dělá načtení detailu). */
function oznacPrectene(id) {
  volej('oznacit', { id, jak: 'prectene' }).catch(() => { /* v Gmailu zůstane nepřečtená – nic se neztratí */ });
}

/** Sedí detail v paměti se souhrnem ze seznamu? Čas poslední zprávy stejný a návrh od Clauda, pokud ho souhrn hlásí. */
function detailSedi(data, m) {
  const z = data && data.zpravy;
  if (!z || !z.length) return false;
  if (!m) return true; // konverzace mimo seznamy (třeba z hledání) – stačí, co je
  return z[z.length - 1].kdy === m.kdy && !(m.navrh && !data.navrhOdpovedi);
}

// ---------------------------------------------------------------- přednačtení detailů (rychlé otevření)
// Michal 9. 10.: „po kliknutí na mail se celkem načítá nějakou dobu … třeba vždy posledních 10 mít načtených“. Když je
// aplikace v klidu (2,5 s po posledním vykreslení, nic se nenačítá), jde jedním dotazem až 10 konverzací, které Michal
// nejspíš otevře (v Poště seznam, jak je vidět; jinde Vyžaduje pozornost a nejnovější) a jejichž detail v zařízení chybí
// nebo neodpovídá souhrnu. Motor je má v mezipaměti podle otisku, takže opakované přednačtení Gmail skoro nevolá.

const PREDNACIST = 10;
const DETAILY = 'asistent.posta.detaily'; // sessionStorage – detaily přežijí přenačtení stránky (nová verze aplikace)
let prednacteni = null;                   // { ids: Set, slib } – běžící přednačtení
let casovacPrednacteni = 0, casovacUlozeni = 0, chybaPrednacteni = 0;
const zkuseno = {};                       // id → otisk souhrnu, se kterým už se přednačítalo (každý stav jen jednou)
const otiskSouhrnu = (m) => m.kdy + ':' + (m.navrh ? 1 : 0);

function naplanujPrednacteni() {
  clearTimeout(casovacPrednacteni);
  casovacPrednacteni = setTimeout(prednacti, 2500);
}

function kPrednacteni() {
  const zdroj = stav.pohled === 'posta' ? filtrovane() : kPozornosti().concat(vsechnyZpravy());
  const videno = {};
  return zdroj.filter((m) => {
    if (!m || m.zPc || m.tiche || m.zdroj === 'wedos' || videno[m.id]) return false; // WEDOS: detaily chystá server
    videno[m.id] = true;
    return true;
  }).slice(0, PREDNACIST).filter((m) => {
    const st = stav.vlakna[m.id];
    return zkuseno[m.id] !== otiskSouhrnu(m) && !(st && (st.nacita || st.ceka || detailSedi(st.data, m)));
  });
}

function prednacti() {
  if (prednacteni || !stav.posta || !umiMotor('postaDetaily') || document.visibilityState === 'hidden' || navigator.onLine === false) return;
  if (Date.now() - chybaPrednacteni < 120e3) return; // po chybě chvíli nezkoušet
  // aplikace zrovna načítá (start, Obnovit, otevřená konverzace) – Apps Script by dotazy řadil za sebe; zkusit za chvíli
  if (Object.keys(stav.nacita).some((k) => stav.nacita[k]) || Object.keys(stav.vlakna).some((k) => stav.vlakna[k] && stav.vlakna[k].nacita)) {
    naplanujPrednacteni();
    return;
  }
  const vlakna = kPrednacteni();
  if (!vlakna.length) return;
  vlakna.forEach((m) => { zkuseno[m.id] = otiskSouhrnu(m); });
  const ids = new Set(vlakna.map((m) => m.id));
  const slib = volej('postaDetaily', { ids: vlakna.map((m) => ({ id: m.id, kdy: m.kdy, pocet: m.pocet })) })
    .then((v) => {
      const ted = Date.now();
      const detaily = (v && v.detaily) || {};
      Object.keys(detaily).forEach((id) => {
        const st = stav.vlakna[id];
        if (st && st.nacita) return; // zrovna se načítá celý z motoru – ten vyhraje
        stav.vlakna[id] = { data: detaily[id], verze: ted };
      });
      ulozDetaily();
    })
    .catch(() => {
      // jen zrychlení – na klepnutí se detail načte jako dřív; znovu zkusit až za 2 minuty
      chybaPrednacteni = Date.now();
      vlakna.forEach((m) => { delete zkuseno[m.id]; });
    })
    .then(() => {
      prednacteni = null;
      if (stav.otevreneVlakno && ids.has(stav.otevreneVlakno)) obnovDetail(stav.otevreneVlakno);
    });
  prednacteni = { ids, slib };
}

/** Detaily do sessionStorage (nejnovějších 20, nejvýš ~2 M znaků) – po přenačtení stránky jsou hned zpátky. */
function ulozDetaily() {
  clearTimeout(casovacUlozeni);
  casovacUlozeni = setTimeout(() => {
    try {
      const ids = Object.keys(stav.vlakna).filter((id) => stav.vlakna[id] && stav.vlakna[id].data)
        .sort((a, b) => (stav.vlakna[b].verze || 0) - (stav.vlakna[a].verze || 0)).slice(0, 20);
      const obsah = {};
      let znaku = 0;
      for (const id of ids) {
        const d = stav.vlakna[id];
        const delka = JSON.stringify(d.data).length;
        if (znaku + delka > 2e6) continue;
        znaku += delka;
        obsah[id] = { data: d.data, verze: d.verze || 1 };
      }
      sessionStorage.setItem(DETAILY, JSON.stringify(obsah));
    } catch (e) {
      try { sessionStorage.removeItem(DETAILY); } catch (x) { /* nic */ }
    }
  }, 600);
}

function nactiDetaily() {
  try {
    const o = JSON.parse(sessionStorage.getItem(DETAILY) || '{}') || {};
    Object.keys(o).forEach((id) => { if (!stav.vlakna[id] && o[id] && o[id].data) stav.vlakna[id] = { data: o[id].data, verze: o[id].verze || 1 }; });
  } catch (e) { /* bez uložených detailů */ }
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
  // proč je konverzace v tomhle stavu (ladění pravidel)
  if (souhrn && souhrn.duvod) h += '<p class="duvod">Proč: <b>' + esc(souhrn.duvod) + '</b></p>';
  // co s ní teď udělat – návrh odpovědi od Clauda, jinak další krok – až POD nejnovější zprávou (Michal 9. 10.: „nejdříve
  // si ho potřebuju přečíst a pak odpovědět“)
  const krok = d && d.navrhOdpovedi ? navrhOdpovediHtml(d.navrhOdpovedi) : souhrn && !souhrn.zPc ? dalsiKrokHtml(souhrn) : '';
  if (d) {
    // nejnovější nahoře (Michal 2. 10.), rozbalená; pod ní krok; starší zprávy pod tím sbalené
    h += d.zpravy.slice().reverse().map((z, i) => zpravaHtml(z, i === 0 || !!stav.rozbaleneZpravy[z.id]) + (i === 0 ? krok : '')).join('');
    if (!d.zpravy.length) h += krok;
    if (d.skryto) h += '<p class="vlakno-skryto">Starších zpráv: ' + d.skryto + ' – jsou v ' + (d.zdroj === 'wedos' ? 'poště WEDOS' : 'Gmailu') + '.</p>';
  } else if (st.chyba) {
    h += '<div class="card">' + chybaHtml(st.chyba, 'data-vlakno-znovu="' + esc(id) + '"') + '</div>' + krok;
  } else {
    h += '<div class="card">' + kostra(5) + '</div>' + krok;
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
  const wd = wedos.jeWedos(id); // WEDOS: bez Připomenout, skupin Gmailu a Spamu (jdou jen v Gmailu)
  const hlavni = tl('data-oznacit="archivovat"', IKONY.hotovo, 'Hotovo', 'E', siroke) + (wd ? '' : tl('data-pripomenout', IKONY.pripomenout, 'Připomenout', 'H', siroke)) +
    (umiMotor('postaPresunout') && !souhrn.zPc && !wd ? tl('data-presunout', IKONY.stitek, 'Přesunout', 'V', siroke) : '');
  const dalsi = tl('data-oznacit="neprectene"', IKONY.neprectene, 'Označit jako nepřečtené', 'U') + (wd ? '' : tl('data-oznacit="spam"', IKONY.spam, 'Spam')) +
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
    cekas: ['Čekáš na odpověď' + (m.cekasOd ? ' ' + jakDlouho(m.cekasOd) : ''), m.zdroj === 'wedos' ? '' : 'Když se neozvou, připomenu ti to.',
      m.zdroj === 'wedos' ? hotovo : ['data-pripomenout', IKONY.pripomenout, 'Připomenout']], // WEDOS: připomínka jen v Gmailu
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

/** Adresy pro psaní (motor info.posta); WEDOS: pracovní adresa je ta ze schránky WEDOS a odesílá se z ní vždy (SMTP serveru). */
function infoPosty() {
  const info = (stav.info && stav.info.posta) || {};
  return wedos.zapnuto() ? Object.assign({}, info, { pracovniAdresa: wedos.pracovniAdresa(), lzeOdesilatZPracovni: true }) : info;
}

/** rezim: odpoved | vsem | preposlat | novy; predvyplnit (nový e-mail z návrhu): { id, prepsat, komu, predmet, text, ucet, poOdeslani } */
export function otevriPsani(rezim, predvyplnit) {
  const id = stav.otevreneVlakno;
  const d = id && stav.vlakna[id] && stav.vlakna[id].data;
  if (rezim !== 'novy' && !d) { toast(id ? 'Počkej, až se zpráva načte.' : 'Nejdřív otevři konverzaci.'); return; }
  const cil = d && rezim !== 'novy' ? posledniCizi(d) : null;
  const info = infoPosty();
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
  const info = infoPosty();
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
  // WEDOS: odpověď na pracovní poštu ze schránky WEDOS a nový e-mail z účtu Pracovní jdou přes server (SMTP WEDOS)
  const wd = p.rezim === 'novy' ? p.ucet === 'pracovni' && wedos.zapnuto() : wedos.jeWedos(p.zpravaId);
  try {
    const vysledek = await (wd ? wedos.odeslat(data) : volej('odeslat', data));
    uloziste.smaz(p.klic);
    const vlakno = p.vlaknoId;
    zavriPanel();
    toast(vysledek && vysledek.jizOdeslano ? 'Tahle zpráva už odešla – podruhé ji neposílám' : 'Odesláno');
    if (p.poOdeslani) p.poOdeslani(data);
    if (vlakno) nactiVlakno(vlakno, true);
    if (!wd) nactiPostu(true); // WEDOS: seznam obnoví server sám (přijde živě)
  } catch (e) {
    tlacitko.disabled = false;
    tlacitko.querySelector('span').textContent = 'Odeslat';
    // při výpadku sítě mohl motor e-mail odeslat – další pokus se stejným ID ho ale nezdvojí
    toast(e.kod === 'sit' ? 'Možná odešlo – zkontroluj Odeslané v ' + (wd ? 'poště WEDOS' : 'Gmailu') + '. Další pokus e-mail nezdvojí.' : e.message, true);
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
    await (wedos.jeWedos(id) ? wedos.oznacit(id, jak) : volej('oznacit', { id, jak })); // WEDOS: přes server
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
    await (wedos.jeWedos(id) ? wedos.oznacit(id, 'vratit') : volej('oznacit', { id, jak: 'vratit' })); // WEDOS: přes server
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
  if (wedos.jeWedos(id)) { toast('U pracovní pošty WEDOS připomínka zatím nejde – nech ji v Doručené, nebo dej Hotovo.'); return; } // WEDOS
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

/** Okno „Přesunout do skupiny“ – z detailu (tlačítko, klávesa v) nebo dlouhým podržením řádku na dotyku (id). */
function otevriPresun(id) {
  id = id || stav.otevreneVlakno;
  if (!id || !umiMotor('postaPresunout') || wedos.jeWedos(id)) return; // WEDOS: skupiny jsou štítky Gmailu
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
  const stitky = stromStitku();
  const seznam = stitky.length ? '<ul class="presun__seznam">' + stitky.map((s) => {
    const je = ma.indexOf(s.nazev) >= 0;
    return '<li><button type="button" class="presun__stitek' + (je ? ' je' : '') + '" data-presun-stitek="' + esc(s.nazev) + '" style="--h:' + odstin(s.nazev) +
      ';--hloubka:' + (s.nazev.split('/').length - 1) + '"><span class="presun__barva" aria-hidden="true"></span><span class="presun__nazev">' + esc(kratkyStitek(s.nazev)) + '</span>' +
      (je ? '<small>' + IKONY.fajfka + 'má – klepnutím odebrat</small>' : '') + '</button></li>';
  }).join('') + '</ul>' : stav.stitkyGmailu ? '<p class="napoveda">V Gmailu zatím nemáš žádné štítky.</p>' : kostra(4);
  return '<div class="presun"><p class="pripominka__predmet">' + IKONY.posta + '<span class="orez-2">' + esc((d && d.predmet) || souhrn.predmet || '') +
    (souhrn.od ? ' <small class="muted">· ' + esc(souhrn.od) + '</small>' : '') + '</span></p>' + seznam +
    '<div class="presun__novy"><input class="field" data-presun-novy maxlength="40" placeholder="Nová skupina, např. VÝVOJ" aria-label="Název nové skupiny">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-presun-vytvorit>' + IKONY.plus + '<span>Vytvořit a přesunout</span></button></div>' +
    '<label class="presun__nechat"><input type="checkbox" data-presun-nechat' + (p.nechat ? ' checked' : '') + '><span>Nechat i v Doručené (jen přidat štítek)</span></label>' +
    '<p class="napoveda">Jako „Přesunout do“ v Gmailu: konverzace dostane štítek a zmizí z Doručené. Najdeš ji v liště skupin nad seznamem pošty' +
    (TAHNUTI.matches ? ' – tam ji příště můžeš rovnou přetáhnout myší.' : '.') + '</p></div>';
}

const SPATNY_NAZEV = /^\/|\/$|\/\/|[\\"<>]/;

async function presun(nazev, tlacitko, novy) {
  const p = stav.presun;
  if (!p) return;
  nazev = String(nazev || '').replace(/\s+/g, ' ').trim();
  if (!nazev) { toast('Napiš název skupiny.', true); return; }
  if (novy && (nazev.length > 40 || SPATNY_NAZEV.test(nazev))) { toast('Název skupiny: nejvýš 40 znaků, bez \\ " < > a lomítek na krajích.', true); return; }
  const id = p.id;
  const souhrn = najdiSouhrn(id) || {};
  const odebrat = !novy && (souhrn.stitky || []).indexOf(nazev) >= 0;
  const archivovat = !odebrat && !p.nechat;
  if (archivovat) {
    // jako přetažení na skupinu: hned pryč ze seznamu, motor na pozadí, Vrátit v oznámení
    const bylOtevreny = stav.otevreneVlakno === id;
    presunVlakno(id, nazev, { novy });
    zavriAPak(() => { const horni = horniPanel(); if (bylOtevreny && horni && horni.id === 'vlakno') zavriPanel(); });
    return;
  }
  tlacitko.disabled = true;
  try {
    const v = await volej('postaPresunout', { id, stitek: nazev, pridat: !odebrat, archivovat: false, novy: !!novy });
    if (novy) pridejStitek(nazev);
    delete stav.postaStitku[nazev]; // seznam štítku se příště načte znovu
    upravVSeznamech(id, (m) => { m.stitky = v.stitky || []; });
    zavriPanel();
    if (stav.vlakna[id]) stav.vlakna[id].verze = Date.now(); // detail se překresluje podle verze
    obnovDetail(id);
    toast(odebrat ? 'Štítek ' + kratkyStitek(nazev) + ' odebrán' : 'Přidán štítek ' + kratkyStitek(nazev));
    zmeneno();
  } catch (e) {
    tlacitko.disabled = false;
    toast(e.message, true);
  }
}

/** Nová skupina hned v liště (počty se dočtou příště). */
function pridejStitek(nazev) {
  if (stav.stitkyGmailu && !stav.stitkyGmailu.some((s) => s.nazev === nazev)) stav.stitkyGmailu = stav.stitkyGmailu.concat({ nazev, neprectenych: 0 });
}

// motor od 2026-10-09.4 (přišel s přednačtením) umí u postaPresunout i „odebrat“ a „doDorucenych“ – Vrátit jedním dotazem
const umiNovyPresun = () => umiMotor('postaDetaily');

/** Je konverzace v Doručené (v načtené poště)? Podle toho Vrátit po přesunu ze skupiny vrátí i do Doručené. */
function jeVDorucene(id) {
  const p = stav.posta;
  return !!p && (p.osobni || []).concat(p.pracovni || []).some((m) => m.id === id);
}

/**
 * „Přesunout do“ skupiny (Michal 9. 10.: přetažení na skupinu, okno Přesunout do…): konverzace hned zmizí ze seznamů,
 * motor na pozadí přidá štítek a vyřadí ji z Doručené – ve výběru jiné skupiny odebere i tu (přesun ze skupiny do skupiny).
 * Oznámení „Přesunuto do X · Vrátit“: štítek pryč a zpět, kde byla.
 */
function presunVlakno(id, nazev, moznosti) {
  const o = moznosti || {};
  const souhrn = najdiSouhrn(id) || {};
  const zeSkupiny = stav.stitekPosty && stav.stitekPosty !== nazev && umiNovyPresun() ? stav.stitekPosty : '';
  const puvodne = { meloStitek: (souhrn.stitky || []).indexOf(nazev) >= 0, vDorucene: jeVDorucene(id), zeSkupiny };
  // na širokém okně rovnou další konverzace (jako Hotovo)
  const dalsi = stav.otevreneVlakno === id && DVA_SLOUPCE.matches ? (sousedni(id, 1) || sousedni(id, -1)) : null;
  const odebrane = [];
  upravVSeznamech(id, (m, i, seznam) => { odebrane.push({ seznam, i, m }); seznam.splice(i, 1); });
  delete stav.postaStitku[nazev]; // seznam cílové skupiny se příště načte znovu
  if (stav.otevreneVlakno === id) {
    if (dalsi && dalsi !== id) otevriVlakno(dalsi);
    else stav.otevreneVlakno = null;
  }
  zmeneno();
  const novaSkupina = o.novy && !(stav.stitkyGmailu || []).some((s) => s.nazev === nazev);
  if (o.novy) pridejStitek(nazev);
  const slib = volej('postaPresunout', { id, stitek: nazev, pridat: true, archivovat: true, novy: !!o.novy, odebrat: zeSkupiny || undefined });
  toastAkce('Přesunuto do ' + kratkyStitek(nazev), 'Vrátit', () => vratitPresun(id, nazev, puvodne, odebrane, slib));
  slib.catch((e) => {
    vratDoSeznamu(id, odebrane);
    if (novaSkupina && stav.stitkyGmailu) stav.stitkyGmailu = stav.stitkyGmailu.filter((s) => s.nazev !== nazev);
    zmeneno();
    toast(e.message, true);
  });
  return slib;
}

function vratDoSeznamu(id, odebrane) {
  odebrane.forEach((x) => { if (!x.seznam.some((m) => m.id === id)) x.seznam.splice(Math.min(x.i, x.seznam.length), 0, x.m); });
}

/** Vrátit po přesunu: zpět do seznamů hned, v Gmailu až po doběhnutí přesunu (jinak by Vrátit mohlo předběhnout). */
async function vratitPresun(id, nazev, puvodne, odebrane, slib) {
  vratDoSeznamu(id, odebrane);
  zmeneno();
  try {
    await slib.catch(() => null);
    if (puvodne.zeSkupiny) {
      // ze skupiny do skupiny: původní skupinu zpět, cílovou pryč (měla-li ji už předtím, zůstane)
      await volej('postaPresunout', { id, stitek: puvodne.zeSkupiny, pridat: true, odebrat: puvodne.meloStitek ? undefined : nazev, doDorucenych: puvodne.vDorucene });
    } else if (puvodne.meloStitek) {
      await volej('oznacit', { id, jak: 'vratit' }); // štítek měla už předtím – jen zpět do Doručené
    } else if (umiNovyPresun()) {
      await volej('postaPresunout', { id, stitek: nazev, pridat: false, doDorucenych: true });
    } else {
      await volej('postaPresunout', { id, stitek: nazev, pridat: false });
      await volej('oznacit', { id, jak: 'vratit' });
    }
    toast('Vráceno');
  } catch (e) {
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
    if (k === 'aktualizace' && v) v.precteno = (v.precteno || 0) + await wedos.prectiAktualizace().catch(() => 0); // WEDOS: i rozesílky pracovní pošty
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
  if (el.hasAttribute('data-stitek-posty')) {
    // skupina v liště: konverzace se štítkem (i archivované); znovu klepnutí = zpět do Doručené
    const nazev = el.dataset.stitekPosty;
    stav.stitekPosty = stav.stitekPosty === nazev ? '' : nazev;
    stav.filtrPosty = 'vse';
    stav.otevreneVlakno = null;
    if (stav.stitekPosty) nactiPostuStitku(stav.stitekPosty);
    zmeneno();
    return true;
  }
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
  if (el.hasAttribute('data-presun-vytvorit') && stav.presun) {
    const pole = el.closest('.presun__novy').querySelector('[data-presun-novy]');
    presun(pole.value, el, true);
    return true;
  }
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
    setTimeout(() => { stav.otevreneVlakno = id; posledniDetail = null; zmeneno(); }, 300);
  } else {
    posledniDetail = null;
    zmeneno();
  }
});

/** Podpis pro účet (z motoru: info.posta.podpisy). */
function podpisPro(ucet) {
  const p = stav.info && stav.info.posta && stav.info.posta.podpisy;
  return p ? String(p[ucet === 'pracovni' ? 'pracovni' : 'osobni'] || '').trim() : '';
}

/** Změny polí v Poště (zaškrtávátko „Nechat i v Doručené“). Vrací true, když změna patří sem. */
export function zmenaPosta(e) {
  const t = e.target;
  if (t.matches && t.matches('[data-presun-nechat]')) { if (stav.presun) stav.presun.nechat = t.checked; return true; }
  return false;
}

// ---------------------------------------------------------------- přetažení e-mailu na skupinu (PC) a dlouhé podržení (dotyk)
// Michal 9. 10.: „když mám ten mail, tak ho můžu přesunout do té dané kategorie drag and drop systémem“. Myší: řádek
// seznamu se táhne na čip skupiny (cíl se zvýrazní). Na iPadu a telefonu: dlouhé podržení řádku = okno Přesunout do…

const tah = { id: '', cil: null, odlozeno: false };

function oznacCil(cip) {
  if (tah.cil === cip) return;
  if (tah.cil) tah.cil.classList.remove('cil');
  tah.cil = cip;
  if (cip) cip.classList.add('cil');
}

function konecTahu() {
  if (!tah.id) return;
  oznacCil(null);
  tah.id = '';
  document.documentElement.classList.remove('tahne-postu');
  // co se během tažení nepřekreslilo (přišla data), teď
  if (tah.odlozeno) { tah.odlozeno = false; zmeneno(); }
}

document.addEventListener('dragstart', (e) => {
  const radek = e.target.closest && e.target.closest('#posta-seznam [data-vlakno][draggable="true"]');
  if (!radek) return;
  tah.id = radek.dataset.vlakno;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', tah.id);
  // malý štítek místo obrázku celého řádku
  const s = najdiSouhrn(tah.id) || {};
  const nahled = document.createElement('div');
  nahled.className = 'posta-tah';
  nahled.textContent = (s.od || '') + (s.predmet ? ' · ' + s.predmet : '');
  document.body.appendChild(nahled);
  try { e.dataTransfer.setDragImage(nahled, 16, 16); } catch (x) { /* výchozí obrázek */ }
  setTimeout(() => nahled.remove(), 0);
  document.documentElement.classList.add('tahne-postu');
});

document.addEventListener('dragover', (e) => {
  if (!tah.id) return;
  const cip = e.target.closest && e.target.closest('.posta-stitky [data-stitek-posty]');
  oznacCil(cip || null);
  if (!cip) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
});

document.addEventListener('drop', (e) => {
  if (!tah.id) return;
  const cip = e.target.closest && e.target.closest('.posta-stitky [data-stitek-posty]');
  const id = tah.id;
  konecTahu();
  if (!cip) return;
  e.preventDefault();
  presunVlakno(id, cip.dataset.stitekPosty);
});

document.addEventListener('dragend', konecTahu);

// dlouhé podržení řádku na dotyku → Přesunout do… (posun prstu = posouvání seznamu, podržení se zruší)
const drzeni = { id: '', x: 0, y: 0, casovac: 0, potlacit: 0 };
function zrusDrzeni() { clearTimeout(drzeni.casovac); drzeni.id = ''; }

document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  const radek = e.target.closest && e.target.closest('#posta-seznam [data-vlakno]');
  zrusDrzeni();
  if (!radek || !umiMotor('postaPresunout')) return;
  const s = najdiSouhrn(radek.dataset.vlakno);
  if (!s || s.zPc || s.zdroj === 'wedos') return;
  Object.assign(drzeni, { id: radek.dataset.vlakno, x: e.clientX, y: e.clientY });
  drzeni.casovac = setTimeout(() => {
    const id = drzeni.id;
    drzeni.id = '';
    if (!id) return;
    drzeni.potlacit = Date.now(); // klepnutí po puštění prstu už konverzaci neotevře
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) { /* nic */ }
    otevriPresun(id);
  }, 550);
}, { passive: true });

document.addEventListener('pointermove', (e) => {
  if (drzeni.id && Math.hypot(e.clientX - drzeni.x, e.clientY - drzeni.y) > 10) zrusDrzeni();
}, { passive: true });
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, () => { if (drzeni.id) zrusDrzeni(); }, { passive: true }));
document.addEventListener('scroll', () => { if (drzeni.id) zrusDrzeni(); }, { passive: true, capture: true });

// systémová nabídka při dlouhém podržení (Android, iPadOS) by překryla okno Přesunout do…
document.addEventListener('contextmenu', (e) => {
  if (Date.now() - drzeni.potlacit < 1500 && e.target.closest && e.target.closest('#posta-seznam [data-vlakno]')) e.preventDefault();
});
window.addEventListener('click', (e) => {
  if (Date.now() - drzeni.potlacit < 1000 && e.target.closest && e.target.closest('#posta-seznam [data-vlakno]')) {
    e.preventDefault();
    e.stopPropagation();
    drzeni.potlacit = 0;
  }
}, true);

// „Nastavení pošty“ z prázdné pracovní pošty: Nastavení otevře app.js, tady dojet k oddílu „Pracovní schránka přímo (WEDOS)“
// (bez účtu, kde oddíl není, rozbalit návod na přeposílání)
document.addEventListener('click', (e) => {
  if (!(e.target.closest && e.target.closest('[data-posta-navod]'))) return;
  setTimeout(() => {
    const oddil = document.querySelector('[data-panel="nastaveni"] #nast-wedos');
    if (oddil) { oddil.scrollIntoView({ block: 'start' }); return; }
    const navod = document.querySelector('[data-panel="nastaveni"] details[data-detail="posta-pracovni"]');
    if (navod && !navod.open) { navod.open = true; navod.scrollIntoView({ block: 'nearest' }); }
  }, 60);
});
