// Kalendář: Měsíc (mřížka + seznam vybraného dne), Týden (časová osa; na telefonu pruh dnů + jeden den),
// Seznam (30 dní). Na PC vpravo panel: malý měsíc, kalendáře, nejbližší události, zápasy z rozpisu.
// Nová událost: tlačítko, „+ Přidat“ u dne, klepnutí do volné hodiny v týdnu (formulář v udalost.js).
// Data z motoru po měsících (mřížka 6 týdnů), uložená i v zařízení pro okamžitý start.

import { stav, zmeneno, hooky, umiMotor } from './stav.js';
import { volej } from './api.js';
import {
  esc, pulnoc, pridejDny, rozdilDni, zacatekTydne, hhmm, trvani, datumDlouhe, denNadpis, velkePrvni,
  sOdkazy, uloziste, DNY_KR, MESICE, MESICE_1
} from './pomocne.js';
import { otevriPanel, obnovPanel, elementPanelu } from './panely.js';
import { chybaHtml, segment, hlavickaKarty, toast, prizpusobVysku } from './ui.js';
import { jmenaDne, oblibeniDne, bezDiakritiky, svatkyOblibenych, pripravOblibene } from './jmeniny.js';
import { IKONY, ikonaPocasi } from './ikony.js';
import { predpovedNa, teplota } from './pocasi.js';
import { bublina } from './bubliny.js';
import { otevriFormular, akceUdalostiHtml, zapasyHtml, zapisovatelneKalendare } from './udalost.js';
import { tymyHtml as fotbalTymyHtml } from './fotbal.js';

const k = stav.kal;
const HODINA = 48;                                   // px na hodinu v časové ose
const SIROKY = window.matchMedia('(min-width: 760px)');
const ULOZISTE = 'asistent.data.kal.';
let posunOsy = null;                                 // zapamatovaná pozice časové osy mezi překresleními
let jenDruh = null;                                  // filtr druhu platí jen při vykreslení sekce Kalendář (Dnes ukazuje vše)
export const DRUHY = [['osobni', 'Osobní'], ['prace', 'Práce'], ['fotbal', 'Fotbal'], ['rodina', 'Rodina'], ['ostatni', 'Ostatní']];
// co ukazovat jen v sekci Kalendář (v tomhle zařízení, hned bez motoru): schované kalendáře a sekce Svátky (jmeniny,
// oblíbení lidé); Dnes ukazuje vše. Kalendář úplně vypnutý v Nastavení (motor ho nenačítá) tu není.
const SKRYTE = 'asistent.kal.skryte';
const UKAZ_JMENINY = 'asistent.kal.jmeniny';
const UKAZ_OBLIBENE = 'asistent.kal.oblibeni';
let skryte = new Set(uloziste.cti(SKRYTE) || []);
let jenViditelne = false;
const ukazJmeniny = () => uloziste.cti(UKAZ_JMENINY) !== false;
const ukazOblibene = () => uloziste.cti(UKAZ_OBLIBENE) !== false;
const oblibeni = () => (stav.info && Array.isArray(stav.info.jmeniny) ? stav.info.jmeniny : []);
const BRZY_DNI = 30; // „Brzy má svátek“: oblíbení na měsíc dopředu
const viditelneKalendare = () => ((stav.info && stav.info.kalendare) || []).filter((kal) => !kal.skryty);
function ulozSkryte() { uloziste.pis(SKRYTE, Array.from(skryte)); }

/** id kalendáře → druh (z motoru; starý motor druh neposílá → osobní) */
function druhyKalendaru() {
  const m = {};
  ((stav.info && stav.info.kalendare) || []).forEach((kal) => { m[kal.id] = kal.druh || 'osobni'; });
  return m;
}

// ---------------------------------------------------------------- data

export function klicMesice(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function prvniDen(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
function dalsiMesic(t, n) { const d = new Date(prvniDen(t)); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); }

/** Mřížka měsíce: 6 týdnů od pondělí před 1. dnem (pokryje i dny sousedních měsíců). */
function mrizkaMesice(t) {
  const prvni = new Date(prvniDen(t));
  const od = new Date(prvni.getFullYear(), prvni.getMonth(), 1 - ((prvni.getDay() + 6) % 7)).getTime();
  return { od, do: pridejDny(od, 42) };
}

export function nactiZUloziste() {
  const hranice = klicMesice(dalsiMesic(Date.now(), -3));
  uloziste.klice(ULOZISTE).forEach((klic) => {
    const mesic = klic.slice(ULOZISTE.length);
    if (mesic < hranice) { uloziste.smaz(klic); return; } // staré měsíce uklidit
    const v = uloziste.cti(klic);
    if (v && v.udalosti) k.mesice[mesic] = { udalosti: v.udalosti, kdy: v.kdy, zUloziste: true };
  });
}

export function smazUlozene() {
  uloziste.klice(ULOZISTE).forEach((klic) => uloziste.smaz(klic));
  k.mesice = {};
}

/** Načte měsíc (podle libovolného dne v něm). Čerstvá data (< 5 min) znovu nestahuje, pokud se nevynutí
 *  (znovu = z motoru, vzdy = i čerstvý měsíc – přišla nová kopie ze serveru). */
export function nactiMesic(t, znovu, vzdy) {
  const klic = klicMesice(t);
  if (k.nacita[klic]) return k.nacita[klic];
  const m = k.mesice[klic];
  if (!znovu && !vzdy && m && !m.zUloziste && Date.now() - m.kdy < 5 * 60e3) return Promise.resolve();
  const r = mrizkaMesice(t);
  k.chyby[klic] = null;
  const slib = volej('kalendar', { od: r.od, do: r.do, znovu: !!znovu })
    .then((data) => {
      k.mesice[klic] = { udalosti: data.udalosti || [], chyby: data.chyby || [], kdy: Date.now() };
      uloziste.pis(ULOZISTE + klic, { udalosti: data.udalosti || [], kdy: Date.now() });
    })
    .catch((e) => { k.chyby[klic] = e; })
    .then(() => { delete k.nacita[klic]; zmeneno(); });
  k.nacita[klic] = slib;
  zmeneno();
  return slib;
}

/** Co je potřeba: tento a příští měsíc (Dnes, Seznam) + měsíc vybraného dne (a konce jeho týdne). */
export function nactiKalendar(znovu, vzdy) {
  const dny = [Date.now(), dalsiMesic(Date.now(), 1), k.vybrany, pridejDny(zacatekTydne(k.vybrany), 6)];
  const videno = {};
  return Promise.all(dny.filter((t) => { const kl = klicMesice(t); if (videno[kl]) return false; videno[kl] = 1; return true; })
    .map((t) => nactiMesic(t, znovu, vzdy)));
}

export function nacitaSe() { return Object.keys(k.nacita).length > 0; }

/** Události zasahující do [od, do) ze všech načtených měsíců, bez duplicit. */
export function udalostiVRozsahu(od, doDne) {
  const mapa = new Map();
  Object.keys(k.mesice).forEach((kl) => {
    k.mesice[kl].udalosti.forEach((u) => {
      if (u.zacatek < doDne && (u.konec > od || (u.konec === u.zacatek && u.zacatek >= od)) && !mapa.has(u.id)) mapa.set(u.id, u);
    });
  });
  let seznam = Array.from(mapa.values());
  if (jenDruh) { const druhy = druhyKalendaru(); seznam = seznam.filter((u) => (druhy[u.kalendarId] || 'osobni') === jenDruh); }
  if (jenViditelne && skryte.size) seznam = seznam.filter((u) => !skryte.has(u.kalendarId));
  return seznam.sort((a, b) => (b.celodenni - a.celodenni) || (a.zacatek - b.zacatek) || (b.konec - a.konec));
}

export function udalostiDne(t) { const d = pulnoc(t); return udalostiVRozsahu(d, pridejDny(d, 1)); }
export function mameData(t) { return !!k.mesice[klicMesice(t)]; }

/** Tento týden po dnech (pro sloupcový graf na přehledu Dnes). */
export function tydenPrehled() {
  const po = zacatekTydne(Date.now());
  const dnes = pulnoc(Date.now());
  return [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const t = pridejDny(po, i);
    return { t, pocet: udalostiDne(t).length, dnes: t === dnes, popisek: DNY_KR[new Date(t).getDay()], nazev: datumDlouhe(t) };
  });
}

/** Nejbližší události od teď (běžící i budoucí, bez celodenních, které už začaly) – nejvýš n. */
export function nejblizsi(n, dni) {
  const ted = Date.now();
  return udalostiVRozsahu(ted, pridejDny(pulnoc(ted), dni || 14))
    .filter((u) => (u.celodenni ? u.zacatek >= pulnoc(ted) : u.konec > ted))
    .sort((a, b) => a.zacatek - b.zacatek)
    .slice(0, n);
}

/** Předpověď ČHMÚ ke dni: malá ikona a teploty (jen dny, pro které ji ČHMÚ dává – dnes až 3 dny dopředu); po najetí /
 *  klepnutí bublina s rozpětím teplot a stavem (js/bubliny.js – dřív textový title). */
function pocasiDneHtml(den) {
  const p = predpovedNa(den + 12 * 36e5);
  if (!p) return '';
  const t = p.tMax || p.tMin;
  const d = new Date(den);
  return '<i class="den-pocasi"' + bublina('Předpověď ČHMÚ · ' + DNY_KR[d.getDay()] + ' ' + d.getDate() + '. ' + (d.getMonth() + 1) + '.', t ? teplota(p) : p.uvod || '',
    t ? p.uvod : '') + '>' + ikonaPocasi(p.ikona) + (t ? t[1] + '°' : '') + '</i>';
}

/** Zápas: z kalendáře zápasů, s míčem v názvu, nebo z importu rozpisu. */
export function jeZapas(u) {
  return !!u && (/^⚽|zápas/i.test(u.nazev || '') || /zápas/i.test(u.kalendar || '') || !!u.zapas);
}

/** Nejbližší zápas (běžící nebo budoucí) do n dní. */
export function dalsiZapas(dni) {
  const ted = Date.now();
  return udalostiVRozsahu(ted, pridejDny(pulnoc(ted), dni || 14))
    .filter((u) => jeZapas(u) && u.konec > ted).sort((a, b) => a.zacatek - b.zacatek)[0] || null;
}

/**
 * Krátký výpis na Dnes: příštích n dní po dnech, řádek = čas · barva · název. Každý den má svůj řádek se svátkem
 * („Út 13. 10. · Renata“, oblíbený člověk ★ výrazně) – i den bez událostí; událostí nejvýš max (u dne pak „+2“).
 * Dnes jen to, co ještě neskončilo. Vrací { html, pocet (ukázaných událostí), celkem (událostí) }.
 */
export function agenda(dni, max) {
  const ted = Date.now();
  const dnes = pulnoc(ted);
  const obl = oblibeni();
  let h = '', pocet = 0, celkem = 0;
  for (let i = 0; i < dni; i++) {
    const t = pridejDny(dnes, i);
    const ud = udalostiDne(t).filter((u) => i > 0 || u.celodenni || u.konec > ted);
    celkem += ud.length;
    const ukazat = ud.slice(0, Math.max(0, max - pocet));
    const svatekObl = oblibeniDne(t, obl);
    const nazevDne = i === 0 ? 'Dnes' : i === 1 ? 'Zítra' : velkePrvni(DNY_KR[new Date(t).getDay()]);
    // den = tlačítko: otevře kalendář na tom dni (data-skoc-den obsluhuje app.js)
    h += '<li class="agenda__den' + (ukazat.length ? '' : ' agenda__den--volny') + (svatekObl.length ? ' agenda__den--oblibeny' : '') + '">' +
      '<button type="button" class="agenda__den-btn" data-skoc-den="' + t + '">' +
      '<b>' + nazevDne + '</b><small>' + new Date(t).getDate() + '. ' + (new Date(t).getMonth() + 1) + '.</small>' +
      // skryté události dne hned u data („+2 další“) – vpravo za jménem svátku se četly jako další jmeniny
      (ud.length > ukazat.length ? '<em class="agenda__skryto cisla">+' + (ud.length - ukazat.length) + ' další</em>' : '') +
      agendaSvatekHtml(t, svatekObl) +
      '</button></li>';
    ukazat.forEach((u) => {
      const celyDen = u.celodenni || (u.zacatek < t && u.konec > pridejDny(t, 1));
      const cas = celyDen ? 'celý den' : u.zacatek < t ? 'do ' + hhmm(u.konec) : hhmm(u.zacatek);
      h += '<li><button type="button" class="agenda__u' + (jeZapas(u) ? ' agenda__u--zapas' : '') + '" data-udalost="' + esc(u.id) + '">' +
        '<span class="agenda__cas cisla">' + cas + '</span><i style="--b:' + esc(u.barva || 'var(--accent)') + '"></i>' +
        '<span class="agenda__nazev">' + esc(u.nazev) + (u.misto ? '<small>' + esc(u.misto) + '</small>' : '') + '</span></button></li>';
      pocet++;
    });
  }
  return { html: h ? '<ul class="agenda">' + h + '</ul>' : '', pocet, celkem };
}

/** Svátek v řádku dne na Dnes: oblíbení ★ výrazně (i se vztahem), jinak jméno z kalendáře šedě. */
function agendaSvatekHtml(t, svatekObl) {
  if (svatekObl.length) {
    return '<span class="agenda__svatek agenda__svatek--oblibeny">★ ' + esc(svatekObl.map(popisOblibeneho).join(', ')) + '</span>';
  }
  const j = jmenaDne(t);
  return j ? '<span class="agenda__svatek"' + bublina('Svátek · ' + DNY_KR[new Date(t).getDay()] + ' ' + new Date(t).getDate() + '. ' + (new Date(t).getMonth() + 1) + '.', j) + '>' + esc(j) + '</span>' : '';
}

/** Pro hledání: všechny načtené události (bez duplicit). */
export function vsechnyUdalosti() {
  const mapa = new Map();
  Object.keys(k.mesice).forEach((kl) => k.mesice[kl].udalosti.forEach((u) => { if (!mapa.has(u.id)) mapa.set(u.id, u); }));
  return Array.from(mapa.values());
}
function chybaMesice(t) { return k.chyby[klicMesice(t)]; }
export function chybaKalendare() { return chybaMesice(Date.now()) || null; }

export function najdiUdalost(id) {
  for (const kl of Object.keys(k.mesice)) {
    const u = k.mesice[kl].udalosti.find((x) => x.id === id);
    if (u) return u;
  }
  return null;
}

/** Po zápisu do kalendáře: smazanou hned schovat, všechny měsíce načíst znovu, ukázat den změny. */
export function obnovPoZmene(t, smazaneId) {
  Object.keys(k.mesice).forEach((kl) => {
    const m = k.mesice[kl];
    if (smazaneId) m.udalosti = m.udalosti.filter((u) => u.id !== smazaneId);
    m.zUloziste = true; // nactiMesic je pak stáhne znovu
  });
  if (t) { k.vybrany = pulnoc(t); posunOsy = null; }
  nactiKalendar(true);
  zmeneno();
}

// ---------------------------------------------------------------- společné kousky

/** Řádek události v seznamu (Dnes, den v měsíci, Seznam). den = půlnoc dne, ve kterém se ukazuje. */
export function udalostHtml(u, den) {
  const zacalaDriv = u.zacatek < den;
  const konciPozdeji = u.konec > pridejDny(den, 1);
  let cas;
  if (u.celodenni) cas = '<span class="cas">celý den</span>';
  else if (zacalaDriv && konciPozdeji) cas = '<span class="cas">celý den</span>';
  else if (zacalaDriv) cas = '<span class="cas cisla">do ' + hhmm(u.konec) + '</span>';
  else cas = '<span class="cas cisla">' + hhmm(u.zacatek) + (u.konec > u.zacatek ? '<small>' + (konciPozdeji ? 'dál' : hhmm(u.konec)) + '</small>' : '') + '</span>';
  const probehla = !u.celodenni && u.konec < Date.now();
  const pod = [u.misto, u.kalendar].filter(Boolean).map(esc).join(' · ');
  return '<li><button type="button" class="udalost' + (probehla ? ' probehla' : '') + '" data-udalost="' + esc(u.id) + '">' + cas +
    '<span class="udalost-barva" style="--b:' + esc(u.barva || 'var(--accent)') + '"></span>' +
    '<span class="udalost-text"><span class="nazev">' + esc(u.nazev) + '</span>' + (pod ? '<span class="pod">' + pod + '</span>' : '') + '</span></button></li>';
}

function seznamDneHtml(t, prazdnyText) {
  const ud = udalostiDne(t);
  const svatky = svatkyRadkyHtml(t); // oblíbení ze sekce Svátky jako celodenní řádky nahoře
  if (ud.length || (svatky && mameData(t))) return '<ul class="seznam">' + svatky + ud.map((u) => udalostHtml(u, pulnoc(t))).join('') + '</ul>';
  const seznamSvatku = svatky ? '<ul class="seznam">' + svatky + '</ul>' : '';
  if (!mameData(t)) return seznamSvatku + (chybaMesice(t) ? chybaHtml(chybaMesice(t), 'data-kal-znovu') : '<div class="prazdne">Načítám…</div>');
  return '<div class="prazdne">' + (prazdnyText || 'Nic naplánováno.') + '</div>';
}

// ---------------------------------------------------------------- vykreslení

export function vykresliKalendar(el) {
  jenDruh = k.druh || null;
  jenViditelne = true;
  try { vykresliKalendarFiltr(el); } finally { jenDruh = null; jenViditelne = false; }
}

// ---------------------------------------------------------------- sekce Svátky: jmeniny a oblíbení lidé (★, bez upozornění)
// Dvě „kalendářové“ řádky se zaškrtnutím (boční panel, okno Kalendáře): Jmeniny = kdo má svátek (šedě, nezabírá místo –
// vpravo v buňce měsíce, pod datem v týdnu, v nadpisu dne), Oblíbení lidé = celodenní položka sekce Svátky (★, korálově)
// v měsíci, týdnu, dni i Seznamu. Dnes (agenda) ukazuje svátky vždy, zaškrtnutí platí jen v sekci Kalendář.

const popisOblibeneho = (o) => o.jmeno + (o.kdo ? ' (' + o.kdo + ')' : '');

/** Co ukázat u dne v Kalendáři: { jmeno: běžné jméno ('' když je tu oblíbený nebo jsou jmeniny skryté), obl: oblíbení }. */
function svatekDne(den) {
  const obl = ukazOblibene() ? oblibeniDne(den, oblibeni()) : [];
  return { obl, jmeno: !obl.length && ukazJmeniny() ? jmenaDne(den) : '' };
}

/** Do nadpisu dne: „svátek Eliška“ (oblíbení mají vlastní řádek v seznamu dne). */
function svatekVNadpisu(den) {
  const sv = svatekDne(den);
  return sv.jmeno ? ' <span class="svatek">svátek ' + esc(sv.jmeno) + '</span>' : '';
}

const maOblibeneho = (den) => svatekDne(den).obl.length > 0;

/** Oblíbený jako celodenní čip sekce Svátky (měsíc, celý den v týdnu). */
const cipSvatkuHtml = (o) => '<span class="cip-udalost cip-svatek"' + bublina('Svátek', '★ ' + o.jmeno, o.kdo || 'Oblíbení lidé') + '>★ ' + esc(o.jmeno) + '</span>';

/** Oblíbení jako první řádky seznamu dne (pod Měsícem, Seznam) – vypadají jako celodenní událost sekce Svátky. */
function svatkyRadkyHtml(den) {
  return svatekDne(den).obl.map((o) => '<li><div class="udalost udalost--svatek"><span class="cas">svátek</span><span class="udalost-barva"></span>' +
    '<span class="udalost-text"><span class="nazev">★ ' + esc(o.jmeno) + '</span><span class="pod">' + esc([o.kdo, 'Svátky'].filter(Boolean).join(' · ')) +
    '</span></span></div></li>').join('');
}

/** Kdy: „dnes“, „zítra“, „za 5 dní“. */
const zaDniText = (n) => (n === 0 ? 'dnes' : n === 1 ? 'zítra' : 'za ' + n + ' ' + (n >= 2 && n <= 4 ? 'dny' : 'dní'));
const denKratce = (t) => DNY_KR[new Date(t).getDay()] + ' ' + new Date(t).getDate() + '. ' + (new Date(t).getMonth() + 1) + '.';

/** Oblíbení, kteří mají svátek do n dní (od dneška): [{ jmeno, kdo, t, zaDni }]. Pro Dnes i boční panel. */
export function brzySvatky(dni) {
  return svatkyOblibenych(oblibeni(), pulnoc(Date.now())).filter((x) => x.zaDni <= (dni == null ? BRZY_DNI : dni));
}

/** Karta „Brzy má svátek“ (boční panel kalendáře; na užším displeji pod měsícem). */
function brzyHtml(trida) {
  if (!umiMotor('jmeninyUlozit') && !oblibeni().length) return '';
  const vse = svatkyOblibenych(oblibeni(), pulnoc(Date.now()));
  const brzy = vse.filter((x) => x.zaDni <= BRZY_DNI);
  if (trida && !brzy.length) return ''; // pod měsícem jen, když někdo brzy svátek má
  const radek = (x) => '<li><button type="button" class="brzy__radek' + (x.zaDni <= 1 ? ' brzy__radek--hned' : '') + '" data-den="' + x.t + '">' +
    '<span class="brzy__datum cisla"><b>' + new Date(x.t).getDate() + '. ' + (new Date(x.t).getMonth() + 1) + '.</b><small>' + DNY_KR[new Date(x.t).getDay()] + '</small></span>' +
    '<span class="brzy__kdo"><b>★ ' + esc(x.jmeno) + '</b>' + (x.kdo ? '<small>' + esc(x.kdo) + '</small>' : '') + '</span>' +
    '<em class="brzy__za">' + zaDniText(x.zaDni) + '</em></button></li>';
  let telo;
  if (!vse.length) {
    telo = '<p class="karta-text">Přidej lidi, na kterých ti záleží – jejich svátek se v kalendáři i v týdnu na Přehledu zvýrazní ★.</p>' +
      '<button type="button" class="dlazdice__pata" data-kal-zobrazeni>' + IKONY.plus + 'Přidat oblíbené</button>';
  } else if (!brzy.length) {
    telo = '<p class="karta-text">Příštích ' + BRZY_DNI + ' dní nikdo. Další:</p><ul class="brzy-seznam">' + radek(vse[0]) + '</ul>';
  } else {
    telo = '<ul class="brzy-seznam">' + brzy.slice(0, 6).map(radek).join('') + '</ul>' +
      (brzy.length > 6 ? '<button type="button" class="agenda__vic" data-kal-zobrazeni>+ ' + (brzy.length - 6) + ' další</button>' : '');
  }
  return '<section class="card karta-brzy' + (trida ? ' ' + trida : '') + '">' +
    hlavickaKarty(HVEZDA, 'Brzy má svátek' + (brzy.length ? ' · ' + brzy.length : '')) + telo + '</section>';
}

const HVEZDA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';

/** Řádky sekce Svátky se zaškrtnutím (boční panel: tvar kal-seznam, okno: kal-viditelne). */
function svatkySekceHtml(vOkne) {
  const pocet = oblibeni().length;
  const radky = [
    ['jmeniny', 'Jmeniny', 'kdo má svátek', ukazJmeniny(), '<i class="znak-svatku"></i>'],
    ['oblibeni', 'Oblíbení lidé', pocet ? String(pocet) : '', ukazOblibene(), '<i class="znak-svatku znak-svatku--oblibeny">★</i>']
  ];
  const kontrolka = (r) => '<input type="checkbox" data-kal-svatky="' + r[0] + '"' + (r[3] ? ' checked' : '') + ' aria-label="Ukazovat ' + esc(r[1]) + '">';
  if (vOkne) {
    return '<div class="kal-skupina">Svátky</div><ul class="kal-viditelne kal-svatky">' + radky.map((r) => '<li><label>' + kontrolka(r) + r[4] +
      '<span class="orez-1">' + esc(r[1]) + (r[2] ? ' <small>' + esc(r[2]) + '</small>' : '') + '</span></label></li>').join('') + '</ul>';
  }
  return '<div class="kal-skupina">Svátky</div><ul class="kal-seznam kal-svatky">' + radky.map((r) => '<li>' + r[4] +
    '<span class="orez-1">' + esc(r[1]) + (r[2] ? ' <small>' + esc(r[2]) + '</small>' : '') + '</span>' + kontrolka(r) + '</li>').join('') + '</ul>';
}

// Pozice časové osy se pamatuje při posunu (čtení scrollTop před překreslením nutilo prohlížeč složit stránku navíc)
// a stránka se přepíše, jen když se její HTML změnilo – překreslení kvůli jiným datům (pošta, zdraví) na ni nesahá
// a rozjetá osa zůstane, kde je.
let posledniHtml = null;
document.addEventListener('scroll', (e) => { if (e.target && e.target.id === 'cas-svitek') posunOsy = e.target.scrollTop; }, true);

function vykresliKalendarFiltr(el) {
  let telo;
  if (k.pohled === 'tyden') telo = tydenHtml();
  else if (k.pohled === 'seznam') telo = seznamHtml();
  else telo = mesicHtml();
  const chyby = Object.keys(k.mesice).reduce((a, kl) => a.concat(k.mesice[kl].chyby || []), []);
  const varovani = chyby.length
    ? '<p class="pruh pruh-varovani">Některý kalendář se nepodařilo načíst: ' + esc(Array.from(new Set(chyby.map((c) => c.kalendar))).join(', ')) + '</p>'
    : '';
  const html = '<div class="kal-rozlozeni"><div class="kal-hlavni">' + listaHtml() + varovani + telo + '</div>' +
    '<aside class="kal-boc" aria-label="Kalendáře a nejbližší události">' + bocniPanelHtml() + '</aside></div>';
  if (html === posledniHtml && el.querySelector('.kal-rozlozeni')) return;
  posledniHtml = html;
  el.innerHTML = html;
  const novaOsa = el.querySelector('#cas-svitek');
  if (novaOsa) {
    if (posunOsy == null) {
      const dnesVidet = el.querySelector('.cas-sloupec.dnes');
      const hodina = dnesVidet ? Math.max(0, new Date().getHours() - 1.5) : 7;
      posunOsy = hodina * HODINA;
    }
    novaOsa.scrollTop = posunOsy;
  }
}

/** Podtitulek v hlavičce stránky: „Říjen 2026“, „28. 9. – 4. 10. 2026“ nebo „Příštích 30 dní“. */
export function nadpisObdobi() { return nadpisLisy(); }

function nadpisLisy() {
  const d = new Date(k.vybrany);
  if (k.pohled === 'seznam') return 'Příštích 30 dní';
  if (k.pohled === 'tyden') {
    const po = zacatekTydne(k.vybrany), ne = pridejDny(po, 6);
    const a = new Date(po), b = new Date(ne);
    if (!SIROKY.matches) return velkePrvni(MESICE_1[d.getMonth()]) + ' ' + d.getFullYear();
    return a.getMonth() === b.getMonth()
      ? a.getDate() + '.–' + b.getDate() + '. ' + MESICE[b.getMonth()] + ' ' + b.getFullYear()
      : a.getDate() + '. ' + MESICE[a.getMonth()] + ' – ' + b.getDate() + '. ' + MESICE[b.getMonth()] + ' ' + b.getFullYear();
  }
  return velkePrvni(MESICE_1[d.getMonth()]) + ' ' + d.getFullYear();
}

function listaHtml() {
  const sipky = k.pohled !== 'seznam'
    ? '<button type="button" class="btn btn--ikona" data-kal="predchozi" aria-label="Předchozí">' + IKONY.vlevo + '</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-kal="dnes">Dnes</button>' +
      '<button type="button" class="btn btn--ikona" data-kal="dalsi" aria-label="Další">' + IKONY.vpravo + '</button>'
    : '';
  // druhy kalendářů jako filtr (jen když jsou aspoň dva)
  const pritomne = Array.from(new Set(((stav.info && stav.info.kalendare) || []).filter((kal) => !kal.skryty).map((kal) => kal.druh || 'osobni')));
  const filtr = pritomne.length > 1 ? segment([['', 'Vše']].concat(DRUHY.filter((d) => pritomne.indexOf(d[0]) >= 0)), k.druh, 'data-kal-druh', 'Druh kalendářů') : '';
  const vid = viditelneKalendare();
  const schovano = vid.filter((kal) => skryte.has(kal.id)).length;
  const zobrazeni = '<button type="button" class="btn btn--ghost btn--sm kal-zobrazeni-btn" data-kal-zobrazeni title="Které kalendáře ukazovat, svátky a oblíbení lidé">' +
    IKONY.kalendar + '<span>Kalendáře</span>' + (schovano ? '<b class="cisla">' + (vid.length - schovano) + '/' + vid.length + '</b>' : '') + '</button>';
  return '<div class="kal-lista">' +
    segment([['mesic', 'Měsíc'], ['tyden', 'Týden'], ['seznam', 'Seznam']], k.pohled, 'data-kal-pohled', 'Zobrazení kalendáře') +
    (filtr ? '<div class="kal-druhy">' + filtr + '</div>' : '') + zobrazeni +
    '<div class="kal-ovladani">' + sipky + '</div></div>';
}

// ---------------------------------------------------------------- malý měsíc (postranní panel)

let miniMesic = null; // první den měsíce zobrazeného v malém kalendáři (listuje se nezávisle)

export function miniMesicHtml() {
  if (!miniMesic || (!miniMesic.listovano && klicMesice(miniMesic.t) !== klicMesice(k.vybrany))) {
    miniMesic = { t: prvniDen(k.vybrany), listovano: false };
  }
  const prvni = new Date(miniMesic.t);
  const od = new Date(prvni.getFullYear(), prvni.getMonth(), 1 - ((prvni.getDay() + 6) % 7)).getTime();
  const dnes = pulnoc(Date.now()), vybrany = pulnoc(k.vybrany);
  let h = '<div class="mini"><div class="mini__hlava"><span>' + velkePrvni(MESICE_1[prvni.getMonth()]) + ' ' + prvni.getFullYear() + '</span><span>' +
    '<button type="button" class="btn btn--ikona" data-mini-posun="-1" aria-label="Předchozí měsíc">' + IKONY.vlevo + '</button>' +
    '<button type="button" class="btn btn--ikona" data-mini-posun="1" aria-label="Další měsíc">' + IKONY.vpravo + '</button></span></div>' +
    '<div class="mini__mrizka">' + ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map((d) => '<span>' + d + '</span>').join('');
  for (let i = 0; i < 42; i++) {
    const den = pridejDny(od, i);
    const d = new Date(den);
    const tridy = ['mini__den'];
    if (d.getMonth() !== prvni.getMonth()) tridy.push('mimo');
    if (den === dnes) tridy.push('dnes');
    if (den === vybrany) tridy.push('vybrany');
    if (udalostiDne(den).length) tridy.push('ma');
    if (maOblibeneho(den)) tridy.push('svatek-oblibeny');
    h += '<button type="button" class="' + tridy.join(' ') + '" data-den="' + den + '" aria-label="' + esc(datumDlouhe(den)) + '">' + d.getDate() + '</button>';
  }
  return h + '</div></div>';
}

/** Pravý panel kalendáře (PC): malý měsíc, kalendáře se zapínáním, nejbližší události. */
function bocniPanelHtml() {
  const kalendare = (stav.info && stav.info.kalendare) || [];
  let h = '<section class="card">' + miniMesicHtml() + '</section>';
  // kalendáře po druzích (Osobní, Práce, Fotbal…)
  const radek = (kal) => '<li><i style="--b:' + esc(kal.barva) + '"></i><span class="orez-1">' + esc(kal.nazev) + '</span>' +
    '<input type="checkbox" data-kal-viditelny="' + esc(kal.id) + '"' + (skryte.has(kal.id) ? '' : ' checked') + ' aria-label="Ukazovat ' + esc(kal.nazev) + '"></li>';
  const skupiny = DRUHY.map((d) => [d, kalendare.filter((kal) => !kal.skryty && (kal.druh || 'osobni') === d[0])]).filter((x) => x[1].length);
  h += '<section class="card">' + hlavickaKarty(IKONY.kalendar, 'Kalendáře') +
    (kalendare.length
      ? skupiny.map((x) => '<div class="kal-skupina">' + esc(x[0][1]) + '</div><ul class="kal-seznam">' + x[1].map(radek).join('') + '</ul>').join('')
      : '<div class="prazdne">Zatím žádný kalendář.</div>') +
    svatkySekceHtml(false) +
    '<button type="button" class="dlazdice__pata" data-kal-zobrazeni>' + HVEZDA + 'Oblíbení lidé a svátky</button>' +
    '<button type="button" class="dlazdice__pata" data-otevri-nastaveni="kalendare">Přidat kalendář z iPhonu</button></section>';
  h += brzyHtml();
  const tymy = fotbalTymyHtml();
  h += '<section class="card">' + hlavickaKarty(IKONY.zapas, 'Zápasy') + (tymy ? '<div class="fotbal-panel">' + tymy + '</div>' +
    '<button type="button" class="dlazdice__pata" data-novy-zapas>' + IKONY.plus + 'Zápas ručně</button>' : zapasyHtml(true)) + '</section>';
  const dalsi = nejblizsi(6);
  h += '<section class="card">' + hlavickaKarty(IKONY.cas, 'Nejbližší') +
    (dalsi.length
      ? '<ul class="seznam">' + dalsi.map((u) => {
          const den = pulnoc(u.zacatek);
          const kdy = rozdilDni(den) === 0 ? 'dnes' : rozdilDni(den) === 1 ? 'zítra' : DNY_KR[new Date(den).getDay()] + ' ' + new Date(den).getDate() + '. ' + (new Date(den).getMonth() + 1) + '.';
          return '<li><button type="button" class="udalost udalost--mala" data-udalost="' + esc(u.id) + '"><span class="cas cisla">' + (u.celodenni ? 'celý' : hhmm(u.zacatek)) +
            '<small>' + esc(kdy) + '</small></span><span class="udalost-barva" style="--b:' + esc(u.barva) + '"></span>' +
            '<span class="udalost-text"><span class="nazev">' + esc(u.nazev) + '</span>' + (u.misto ? '<span class="pod">' + esc(u.misto) + '</span>' : '') + '</span></button></li>';
        }).join('') + '</ul>'
      : '<div class="prazdne">' + (mameData(Date.now()) ? 'Dva týdny nic.' : 'Načítám…') + '</div>') + '</section>';
  return h;
}

function mesicHtml() {
  const r = mrizkaMesice(k.vybrany);
  const mesic = new Date(k.vybrany).getMonth();
  const prvni = new Date(prvniDen(k.vybrany));
  const tydnu = Math.ceil((((prvni.getDay() + 6) % 7) + new Date(prvni.getFullYear(), prvni.getMonth() + 1, 0).getDate()) / 7);
  const dnes = pulnoc(Date.now());
  const vybrany = pulnoc(k.vybrany);
  let h = '<div class="card mesic"><div class="mesic-hlava" aria-hidden="true">' +
    ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map((d) => '<span>' + d + '</span>').join('') + '</div><div class="mesic-mrizka">';
  for (let i = 0; i < tydnu * 7; i++) {
    const den = pridejDny(r.od, i);
    const d = new Date(den);
    const ud = udalostiDne(den);
    const tridy = ['mesic-den'];
    if (d.getMonth() !== mesic) tridy.push('mimo');
    if (den === dnes) tridy.push('dnes');
    if (den === vybrany) tridy.push('vybrany');
    if (d.getDay() === 0 || d.getDay() === 6) tridy.push('vikend');
    // sekce Svátky: běžné jméno šedě vpravo vedle čísla (na telefonu se nevejde), oblíbení jako celodenní čip ★
    // (na telefonu korálový řádek – čipy tam nejsou)
    const sv = svatekDne(den);
    if (sv.obl.length) tridy.push('svatek-oblibeny');
    const mista = Math.max(1, 3 - sv.obl.length);
    const barvy = Array.from(new Set(ud.map((u) => u.barva))).slice(0, 3);
    const cipy = sv.obl.map(cipSvatkuHtml).join('') +
      ud.slice(0, mista).map((u) => '<span class="cip-udalost' + (u.celodenni ? ' celodenni' : '') + '" data-udalost="' + esc(u.id) + '" style="--b:' + esc(u.barva) + '">' +
      (u.celodenni || u.zacatek < den ? '' : '<b class="cisla">' + hhmm(u.zacatek) + '</b> ') + esc(u.nazev) + '</span>').join('') +
      (ud.length > mista ? '<span class="cip-vic">+' + (ud.length - mista) + ' další</span>' : '');
    h += '<button type="button" class="' + tridy.join(' ') + '" data-den="' + den + '" aria-label="' + esc(datumDlouhe(den)) + (ud.length ? ', událostí ' + ud.length : '') +
      (sv.obl.length ? ', svátek má ' + esc(sv.obl.map(popisOblibeneho).join(', ')) : sv.jmeno ? ', svátek ' + esc(sv.jmeno) : '') + '"' +
      (den === vybrany ? ' aria-current="date"' : '') + '>' +
      '<span class="mesic-cislo cisla">' + d.getDate() + pocasiDneHtml(den) + '</span>' +
      (sv.jmeno ? '<span class="svatek svatek--bunka">' + esc(sv.jmeno) + '</span>' : '') +
      (sv.obl.length ? '<span class="svatek svatek--oblibeny svatek--mobil">★ ' + esc(sv.obl.map((o) => o.jmeno).join(', ')) + '</span>' : '') +
      '<span class="mesic-tecky">' + barvy.map((b) => '<i style="--b:' + esc(b) + '"></i>').join('') + '</span>' +
      '<span class="mesic-cipy">' + cipy + '</span></button>';
  }
  h += '</div></div>';
  h += '<div class="card kal-den"><div class="kal-den__hlava"><span class="den-nadpis' + (rozdilDni(vybrany) === 0 ? ' dnes' : '') + '">' +
    esc(velkePrvni(denNadpis(vybrany))) + svatekVNadpisu(vybrany) + '</span>' +
    (zapisovatelneKalendare().length ? '<button type="button" class="btn btn--ghost btn--sm" data-nova-udalost="' + vybrany + '">' + IKONY.plus + '<span>Přidat</span></button>' : '') +
    '</div>' + seznamDneHtml(vybrany) + '</div>';
  // telefon a iPad (bez bočního panelu): kdo z oblíbených má brzy svátek
  return h + brzyHtml('karta-brzy--uzka');
}

function tydenHtml() {
  const po = zacatekTydne(k.vybrany);
  const dny = [0, 1, 2, 3, 4, 5, 6].map((i) => pridejDny(po, i));
  if (SIROKY.matches) return '<div class="card kal-tyden">' + casovaOsaHtml(dny) + '</div>';
  // telefon: pruh dnů týdne + časová osa vybraného dne
  const dnes = pulnoc(Date.now());
  const vybrany = pulnoc(k.vybrany);
  const pas = '<div class="pas-tydne">' + dny.map((d) => {
    const ma = udalostiDne(d).length > 0;
    return '<button type="button" class="pas-den' + (d === dnes ? ' dnes' : '') + (d === vybrany ? ' vybrany' : '') + '" data-den="' + d + '"' +
      (d === vybrany ? ' aria-current="date"' : '') + '><small>' + DNY_KR[new Date(d).getDay()] + '</small><b class="cisla">' + new Date(d).getDate() + '</b>' +
      '<i' + (ma ? '' : ' hidden') + '></i>' + (maOblibeneho(d) ? '<em class="pas-den__svatek" aria-label="svátek oblíbeného">★</em>' : '') + '</button>';
  }).join('') + '</div>';
  return '<div class="card kal-tyden">' + pas + '<div class="den-nadpis' + (vybrany === dnes ? ' dnes' : '') + '">' + esc(velkePrvni(denNadpis(vybrany))) +
    svatekVNadpisu(vybrany) + '</div>' +
    casovaOsaHtml([vybrany]) + '</div>';
}

/** Časová osa pro jeden nebo víc dnů: hlavička, řádek celodenních, mřížka 0–24 h se svitkem. */
function casovaOsaHtml(dny) {
  const dnes = pulnoc(Date.now());
  const sloupce = 'style="--dnu:' + dny.length + '"';
  let h = '<div class="cas-svitek" id="cas-svitek">';
  if (dny.length > 1) {
    h += '<div class="cas-hlava" ' + sloupce + '><span></span>' + dny.map((d) => '<button type="button" class="cas-den-nadpis' + (d === dnes ? ' dnes' : '') +
      (d === pulnoc(k.vybrany) ? ' vybrany' : '') + '" data-den="' + d + '"><small>' + DNY_KR[new Date(d).getDay()] + pocasiDneHtml(d) + '</small><b class="cisla">' + new Date(d).getDate() + '</b>' +
      (svatekDne(d).jmeno ? '<span class="svatek svatek--hlava">' + esc(svatekDne(d).jmeno) + '</span>' : '') + '</button>').join('') + '</div>';
  }
  // celý den: oblíbení ze sekce Svátky (★) první, pak celodenní události
  const svatky = dny.map((d) => svatekDne(d).obl);
  const celodenni = dny.map((d) => udalostiDne(d).filter((u) => u.celodenni || (u.zacatek <= d && u.konec >= pridejDny(d, 1))));
  if (celodenni.some((a) => a.length) || svatky.some((a) => a.length)) {
    h += '<div class="cas-celodenni" ' + sloupce + '><span class="cas-popisek">celý den</span>' + celodenni.map((a, i) => '<div>' + svatky[i].map(cipSvatkuHtml).join('') +
      a.map((u) => '<button type="button" class="cip-udalost celodenni" data-udalost="' + esc(u.id) + '" style="--b:' + esc(u.barva) + '">' + esc(u.nazev) + '</button>').join('') +
      '</div>').join('') + '</div>';
  }
  h += '<div class="cas-mrizka' + (zapisovatelneKalendare().length ? ' lze-zapisovat' : '') + '" style="--dnu:' + dny.length + ';--hodina:' + HODINA + 'px"' +
    (zapisovatelneKalendare().length ? ' title="Klepni do volného místa pro novou událost"' : '') + '>';
  h += '<div class="cas-hodiny">' + Array.from({ length: 24 }, (_, i) => '<span style="top:' + (i * HODINA) + 'px">' + (i ? i + ':00' : '') + '</span>').join('') + '</div>';
  dny.forEach((d) => {
    const konecDne = pridejDny(d, 1);
    const casove = udalostiVRozsahu(d, konecDne).filter((u) => !u.celodenni && !(u.zacatek <= d && u.konec >= konecDne));
    h += '<div class="cas-sloupec' + (d === dnes ? ' dnes' : '') + '" data-den-osa="' + d + '">';
    rozloz(casove, d, konecDne).forEach((p) => {
      const nahore = hodinyOd(p.z, d) * HODINA;
      const vyska = Math.max((hodinyOd(p.k, d) - hodinyOd(p.z, d)) * HODINA - 2, 22);
      h += '<button type="button" class="cas-udalost' + (p.u.konec < Date.now() ? ' probehla' : '') + '" data-udalost="' + esc(p.u.id) + '" style="top:' + nahore + 'px;height:' + vyska + 'px;' +
        'left:calc(' + p.sloupec + ' * 100% / ' + p.sloupcu + ');width:calc(100% / ' + p.sloupcu + ' - 3px);--b:' + esc(p.u.barva) + '">' +
        '<b>' + esc(p.u.nazev) + '</b><small class="cisla">' + hhmm(p.u.zacatek) + '–' + hhmm(p.u.konec) + (p.u.misto ? ' · ' + esc(p.u.misto) : '') +
        (hooky.dochazkaKratce && hooky.dochazkaKratce(p.u) ? ' · ' + IKONY.lide + hooky.dochazkaKratce(p.u) : '') + '</small></button>';
    });
    if (d === dnes) h += '<div class="cas-ted" style="top:' + (hodinyOd(Date.now(), d) * HODINA) + 'px"></div>';
    h += '</div>';
  });
  h += '</div></div>';
  if (dny.length === 1 && !mameData(dny[0])) h += chybaMesice(dny[0]) ? chybaHtml(chybaMesice(dny[0]), 'data-kal-znovu') : '';
  return h;
}

function hodinyOd(t, den) {
  if (t <= den) return 0;
  if (t >= pridejDny(den, 1)) return 24;
  const x = new Date(t);
  return x.getHours() + x.getMinutes() / 60;
}

/** Rozložení překrývajících se událostí do sloupců (jako v kalendáři v telefonu). */
function rozloz(udalosti, den, konecDne) {
  const polozky = udalosti.map((u) => ({ u, z: Math.max(u.zacatek, den), k: Math.min(Math.max(u.konec, u.zacatek + 20 * 6e4), konecDne) }))
    .sort((a, b) => (a.z - b.z) || (b.k - a.k));
  const vysledek = [];
  let shluk = [];
  let konecShluku = -Infinity;
  const uzavri = () => {
    const konceSloupcu = [];
    shluk.forEach((p) => {
      let i = konceSloupcu.findIndex((konec) => konec <= p.z);
      if (i < 0) { i = konceSloupcu.length; konceSloupcu.push(0); }
      konceSloupcu[i] = p.k;
      p.sloupec = i;
    });
    shluk.forEach((p) => { p.sloupcu = konceSloupcu.length; vysledek.push(p); });
    shluk = [];
  };
  polozky.forEach((p) => {
    if (shluk.length && p.z >= konecShluku) { uzavri(); konecShluku = -Infinity; }
    shluk.push(p);
    konecShluku = Math.max(konecShluku, p.k);
  });
  if (shluk.length) uzavri();
  return vysledek;
}

function seznamHtml() {
  const od = pulnoc(Date.now());
  let h = '';
  let neco = false;
  for (let i = 0; i < 30; i++) {
    const d = pridejDny(od, i);
    const ud = udalostiDne(d);
    const svatky = svatkyRadkyHtml(d); // den jen se svátkem oblíbeného se ukáže taky
    if (!ud.length && !svatky) continue;
    neco = true;
    h += '<div class="card"><div class="den-nadpis' + (i === 0 ? ' dnes' : '') + '">' + esc(velkePrvni(denNadpis(d))) + svatekVNadpisu(d) + '</div>' +
      '<ul class="seznam">' + svatky + ud.map((u) => udalostHtml(u, d)).join('') + '</ul></div>';
  }
  if (!neco) {
    if (!mameData(od)) return '<div class="card">' + (chybaMesice(od) ? chybaHtml(chybaMesice(od), 'data-kal-znovu') : '<div class="prazdne">Načítám…</div>') + '</div>';
    return '<div class="card"><div class="prazdne">Příštích 30 dní nic v kalendáři.</div></div>';
  }
  return h;
}

// ---------------------------------------------------------------- okno „Kalendáře a svátky“: co ukazovat, oblíbení lidé

// rozepsané hromadné přidání (přežije překreslení okna): text a výběr u nejednoznačných jmen (klíč = tvar bez diakritiky)
const hromadne = { text: '', volby: {} };

function otevriZobrazeni() {
  otevriPanel({ id: 'kal-zobrazeni', trida: 'panel-okno panel-kal-zobrazeni', titul: 'Kalendáře a svátky', vykresli: zobrazeniHtml });
}

function zobrazeniHtml() {
  const vid = viditelneKalendare();
  const skupiny = DRUHY.map((d) => [d, vid.filter((kal) => (kal.druh || 'osobni') === d[0])]).filter((x) => x[1].length);
  let h = '<div class="kal-zobrazeni"><section><h3>Které kalendáře ukazovat</h3>' +
    '<p class="napoveda">Jen tady v Kalendáři a v tomhle zařízení (Dnes ukazuje vše). Úplně vypnout kalendář jde v Nastavení → Kalendáře.</p>';
  h += skupiny.length ? skupiny.map((x) => '<div class="kal-skupina">' + esc(x[0][1]) + '</div><ul class="kal-viditelne">' +
    x[1].map((kal) => '<li><label><input type="checkbox" data-kal-viditelny="' + esc(kal.id) + '"' + (skryte.has(kal.id) ? '' : ' checked') + '>' +
      '<i style="--b:' + esc(kal.barva) + '"></i><span class="orez-1">' + esc(kal.nazev) + '</span></label>' +
      '<button type="button" class="odkaz" data-kal-jen="' + esc(kal.id) + '">jen tento</button></li>').join('') + '</ul>').join('')
    : '<p class="prazdne">Zatím žádný kalendář.</p>';
  h += svatkySekceHtml(true);
  if (skryte.size) h += '<button type="button" class="btn btn--ghost btn--sm" data-kal-vse>Ukázat všechny</button>';
  h += '</section><section class="jmeniny-sekce"><h3>★ Oblíbení lidé' + (oblibeni().length ? ' <small class="cisla">' + oblibeni().length + '</small>' : '') + '</h3>';
  if (!umiMotor('jmeninyUlozit')) return h + '<p class="napoveda">Oblíbené lidi ukáže nová verze motoru.</p></section></div>';
  h += '<p class="napoveda">Jejich svátek uvidíš výrazně ★ v kalendáři, v „Brzy má svátek“ i v týdnu na Přehledu – bez upozornění.</p>';
  // seznam podle nejbližšího svátku (odebrat jde podle pořadí v uloženém seznamu)
  const dnes = pulnoc(Date.now());
  const serazeni = oblibeni().map((o, i) => {
    const s = svatkyOblibenych([o], dnes)[0];
    return { o, i, t: s ? s.t : Infinity, zaDni: s ? s.zaDni : null };
  }).sort((a, b) => (a.t - b.t) || a.o.jmeno.localeCompare(b.o.jmeno, 'cs'));
  if (serazeni.length) {
    h += '<ul class="jmeniny-oblibeni">' + serazeni.map((x) => '<li' + (x.zaDni != null && x.zaDni <= 7 ? ' class="jo--brzy"' : '') + '>' +
      '<span class="jo__kdo"><b>★ ' + esc(x.o.jmeno) + '</b>' + (x.o.kdo ? '<small>' + esc(x.o.kdo) + '</small>' : '') + '</span>' +
      (x.zaDni != null ? '<span class="jo__kdy cisla"><b>' + esc(denKratce(x.t)) + '</b><small>' + zaDniText(x.zaDni) + '</small></span>'
        : '<span class="jo__kdy"><small>bez svátku</small></span>') +
      '<button type="button" class="btn btn--ikona btn--sm" data-jmeniny-odebrat="' + x.i + '" aria-label="Odebrat ' + esc(x.o.jmeno) + '">' + IKONY.zavrit + '</button></li>').join('') + '</ul>';
  }
  const p = pripravOblibene(hromadne.text, oblibeni(), hromadne.volby);
  h += '<div class="jmeniny-hromadne"><label class="label" for="jmeniny-hromadne">Přidat lidi</label>' +
    '<textarea class="field" id="jmeniny-hromadne" data-jmeniny-hromadne rows="2" autocomplete="off" spellcheck="false" ' +
    'placeholder="Např. Pepa (děda), Verča, Saša – kolegyně">' + (hromadne.text.charAt(0) === '\n' ? '\n' : '') + esc(hromadne.text) + '</textarea>' +
    '<p class="napoveda">Víc jmen odděl čárkou. Vztah do závorky nebo za pomlčku – nepovinné. Domácké tvary převedu na jméno z kalendáře (Pepa → Josef).</p>' +
    '<div class="jmeniny-nahled" data-jmeniny-nahled>' + nahledHtml(p) + '</div>' +
    '<div class="jmeniny-akce"><span class="napoveda" data-jmeniny-souhrn>' + esc(souhrnPridani(p)) + '</span>' +
    '<button type="button" class="btn btn--primary btn--sm" data-jmeniny-pridat' + (p.pridano || p.doplneno ? '' : ' disabled') + '>' + IKONY.plus +
    '<span>' + esc(popisPridani(p)) + '</span></button></div></div>';
  return h + '</section></div>';
}

const denZKlice = (k) => (k ? Number(k.slice(3)) + '. ' + Number(k.slice(0, 2)) + '.' : '');

/** Náhled hromadného přidání: co se přidá (i převod Pepa → Josef), co už je, kde vybrat, co svátek nemá. */
function nahledHtml(p) {
  if (!p.radky.length) return '';
  const volba = (r, m) => '<button type="button" class="chip jn__volba" data-jmeniny-volba="' + esc(bezDiakritiky(r.text)) + '" data-jmeno="' + esc(m.jmeno) + '">' +
    esc(m.jmeno) + ' <small class="cisla">' + denZKlice(m.den) + '</small></button>';
  const kdo = (r) => (r.kdo ? '<small class="jn__vztah">' + esc(r.kdo) + '</small>' : '');
  return '<ul class="jn">' + p.radky.map((r) => {
    if (r.stav === 'pridat' || r.stav === 'doplnit' || r.stav === 'uz-je') {
      const stitek = r.stav === 'pridat' ? '<span class="tag tag--ok">přidám</span>' : r.stav === 'doplnit' ? '<span class="tag">doplním vztah</span>'
        : '<span class="tag tag--seda">už je</span>';
      return '<li class="jn__radek jn--' + r.stav + '"><span class="jn__znak">' + (r.stav === 'uz-je' ? '=' : '✓') + '</span>' +
        '<span class="jn__text">' + (r.prevod ? '<span class="jn__puvodni">' + esc(r.text) + ' →</span> ' : '') + '<b>' + esc(r.jmeno) + '</b>' + kdo(r) +
        (r.zvoleno ? ' <button type="button" class="odkaz" data-jmeniny-volba="' + esc(bezDiakritiky(r.text)) + '" data-jmeno="">změnit</button>' : '') + '</span>' +
        '<span class="jn__den cisla">' + denZKlice(r.den) + '</span>' + stitek + '</li>';
    }
    if (r.stav === 'vyber') {
      return '<li class="jn__radek jn--vyber"><span class="jn__znak">?</span><span class="jn__text"><b>' + esc(r.text) + '</b>' + kdo(r) +
        ' – které jméno?</span><span class="jn__volby">' + r.moznosti.map((m) => volba(r, m)).join('') + '</span></li>';
    }
    return '<li class="jn__radek jn--nezname"><span class="jn__znak">!</span><span class="jn__text"><b>' + esc(r.text) + '</b> – v kalendáři jmen není, svátek nemá' +
      (r.navrhy.length ? '. Myslel jsi…' : '') + '</span>' + (r.navrhy.length ? '<span class="jn__volby">' + r.navrhy.map((m) => volba(r, m)).join('') + '</span>' : '') + '</li>';
  }).join('') + '</ul>';
}

function popisPridani(p) {
  if (p.pridano) return 'Přidat ' + p.pridano + (p.doplneno ? ' a doplnit ' + p.doplneno : '');
  return p.doplneno ? 'Doplnit vztah' : 'Přidat';
}

function souhrnPridani(p) {
  const pocet = (stav) => p.radky.filter((r) => r.stav === stav).length;
  return [[pocet('vyber'), 'vyber jméno'], [pocet('nezname'), 'bez svátku'], [pocet('uz-je'), 'už je']]
    .filter((x) => x[0]).map((x) => x[0] + '× ' + x[1]).join(' · ');
}

/** Při psaní: jen náhled a tlačítko (pole zůstane, jak je – i s kurzorem). */
function prekresliNahled() {
  const el = elementPanelu('kal-zobrazeni');
  if (!el) return;
  const p = pripravOblibene(hromadne.text, oblibeni(), hromadne.volby);
  const n = el.querySelector('[data-jmeniny-nahled]');
  if (n) n.innerHTML = nahledHtml(p);
  const s = el.querySelector('[data-jmeniny-souhrn]');
  if (s) s.textContent = souhrnPridani(p);
  const b = el.querySelector('[data-jmeniny-pridat]');
  if (b) { b.disabled = !(p.pridano || p.doplneno); b.querySelector('span').textContent = popisPridani(p); }
  ukazNahled(el);
}

/** Náhled a tlačítko Přidat pod polem musí být vidět (okno je dlouhé – na PC a iPadu byly pod jeho spodním okrajem):
 *  okno se posune tak, aby byly vidět, ale pole, do kterého se píše, zůstane v okně. */
function ukazNahled(el) {
  const svitek = el.querySelector('.panel-telo'), akce = el.querySelector('.jmeniny-akce'), pole = el.querySelector('[data-jmeniny-hromadne]');
  if (!svitek || !akce || !pole) return;
  const s = svitek.getBoundingClientRect(), a = akce.getBoundingClientRect(), p = pole.getBoundingClientRect();
  const chybi = a.bottom + 12 - s.bottom;
  if (chybi > 0) svitek.scrollTop += Math.min(chybi, Math.max(0, p.top - s.top - 8));
}

document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.matches || !t.matches('[data-jmeniny-hromadne]')) return;
  hromadne.text = t.value;
  prizpusobVysku(t);
  prekresliNahled();
});

function poZmeneZobrazeni() {
  zmeneno();
  if (elementPanelu('kal-zobrazeni')) obnovPanel('kal-zobrazeni');
}

function ulozOblibene(seznam, tlacitko, zprava, poUlozeni) {
  tlacitko.disabled = true;
  volej('jmeninyUlozit', { oblibeni: seznam })
    .then((s) => {
      stav.info = Object.assign({}, stav.info, { jmeniny: s || [] });
      uloziste.pis('asistent.info', stav.info);
      if (poUlozeni) poUlozeni();
      toast(zprava);
      poZmeneZobrazeni();
    })
    .catch((e) => { tlacitko.disabled = false; toast(e.message, true); });
}

/** Hromadné přidání: všechna poznaná jména jedním uložením (motor jmeninyUlozit), bez duplicit. */
function pridejHromadne(tlacitko) {
  const p = pripravOblibene(hromadne.text, oblibeni(), hromadne.volby);
  if (!p.pridano && !p.doplneno) { toast('Není koho přidat – zkontroluj jména v náhledu.', true); return; }
  if (p.seznam.length > 60) { toast('Oblíbených může být nejvýš 60.', true); return; }
  const jmena = p.radky.filter((r) => r.stav === 'pridat' || r.stav === 'doplnit').map((r) => r.jmeno);
  const vypis = jmena.length > 4 ? jmena.slice(0, 3).join(', ') + ' a další ' + (jmena.length - 3) : jmena.join(', ');
  // co se přidat nedalo (bez svátku, nevybrané), zůstane v poli i v náhledu – ať se to dá opravit
  const zbyva = p.radky.filter((r) => r.stav === 'nezname' || r.stav === 'vyber');
  const nahlas = zbyva.length ? ' · nepřidáno: ' + zbyva.map((r) => r.text).join(', ') : '';
  ulozOblibene(p.seznam, tlacitko, (p.pridano ? 'Přidáno: ' : 'Doplněno: ') + vypis + nahlas, () => {
    hromadne.text = zbyva.map((r) => r.text + (r.kdo ? ' (' + r.kdo + ')' : '')).join(', ');
    hromadne.volby = {};
  });
}

/** Zaškrtávání v okně Kalendáře a v bočním panelu (change). */
export function zmenaKalendar(e) {
  const t = e.target;
  if (!t || !t.matches) return false;
  if (t.matches('[data-kal-viditelny]')) {
    if (t.checked) skryte.delete(t.dataset.kalViditelny); else skryte.add(t.dataset.kalViditelny);
    ulozSkryte();
    poZmeneZobrazeni();
    return true;
  }
  if (t.matches('[data-kal-svatky]')) {
    uloziste.pis(t.dataset.kalSvatky === 'oblibeni' ? UKAZ_OBLIBENE : UKAZ_JMENINY, t.checked);
    poZmeneZobrazeni();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- detail události

export function otevriUdalost(id) {
  const u = najdiUdalost(id);
  if (!u) return;
  const akce = akceUdalostiHtml(u);
  otevriPanel({ id: 'udalost', trida: 'panel-okno', titul: u.kalendar || 'Událost', vykresli: () => detailHtml(u),
    paticka: akce ? () => akce : null });
}

function kdyUdalosti(u) {
  if (u.celodenni) {
    const posledni = pridejDny(u.konec, -1);
    if (pulnoc(posledni) <= pulnoc(u.zacatek)) return velkePrvni(datumDlouhe(u.zacatek)) + ' · celý den';
    const a = new Date(u.zacatek), b = new Date(posledni);
    return (a.getMonth() === b.getMonth() ? a.getDate() + '.' : a.getDate() + '. ' + MESICE[a.getMonth()]) + ' – ' +
      b.getDate() + '. ' + MESICE[b.getMonth()] + ' · celý den';
  }
  if (pulnoc(u.zacatek) === pulnoc(u.konec - 1)) {
    return velkePrvni(datumDlouhe(u.zacatek)) + ' · ' + hhmm(u.zacatek) + '–' + hhmm(u.konec) + (u.konec > u.zacatek ? ' (' + trvani(u.konec - u.zacatek) + ')' : '');
  }
  return velkePrvni(datumDlouhe(u.zacatek)) + ' ' + hhmm(u.zacatek) + ' – ' + datumDlouhe(u.konec) + ' ' + hhmm(u.konec);
}

function detailHtml(u) {
  let h = '<div class="udalost-detail" style="--b:' + esc(u.barva || 'var(--accent)') + '">';
  h += '<h3 class="udalost-titul">' + esc(u.nazev) + '</h3>';
  h += '<p class="udalost-radek">' + IKONY.cas + '<span>' + esc(kdyUdalosti(u)) + '</span></p>';
  if (u.misto) {
    h += '<p class="udalost-radek">' + IKONY.misto + '<a href="https://maps.apple.com/?q=' + encodeURIComponent(u.misto) + '" target="_blank" rel="noopener">' + esc(u.misto) + '</a></p>';
  }
  h += '<p class="udalost-radek"><i class="tecka-kal"></i><span>' + esc(u.kalendar || '') + (u.zdroj === 'icloud' ? ' · iPhone' : u.zdroj === 'google' ? ' · Google' : '') +
    (u.opakovana ? ' · opakuje se' : '') + '</span></p>';
  if (u.hoste && u.hoste.length) {
    h += '<p class="udalost-radek">' + IKONY.lide + '<span>' + esc(u.hoste.slice(0, 6).join(', ')) +
      (u.hoste.length > 6 ? ' a další ' + (u.hoste.length - 6) : '') + '</span></p>';
  }
  if (u.popis) h += '<div class="udalost-popis">' + sOdkazy(u.popis) + '</div>';
  // předpověď ČHMÚ na den události (když ji ČHMÚ už dává) – hodí se hlavně u zápasů
  const pr = predpovedNa(u.zacatek);
  if (pr && u.konec > Date.now()) h += '<p class="udalost-radek">' + ikonaPocasi(pr.ikona) + '<span>' + esc(pr.uvod) + (teplota(pr) ? ', ' + esc(teplota(pr)) : '') +
    (pr.srazky ? ' · srážky ' + esc(pr.srazky) : '') + ' <small class="muted">ČHMÚ</small></span></p>';
  if (hooky.detailUdalosti) h += hooky.detailUdalosti(u); // trénink z WHOOP ve stejném čase
  if (hooky.dochazkaUdalosti) h += hooky.dochazkaUdalosti(u); // docházka dorostu z Týmuj
  return h + '</div>';
}

// ---------------------------------------------------------------- ovládání

function posun(smer) {
  if (k.pohled === 'mesic') {
    const cil = dalsiMesic(k.vybrany, smer);
    k.vybrany = klicMesice(cil) === klicMesice(Date.now()) ? pulnoc(Date.now()) : cil;
  } else {
    k.vybrany = pridejDny(k.vybrany, smer * 7);
  }
  posunOsy = null;
  nactiKalendar();
  zmeneno();
}

/** Kliknutí v kalendáři; vrací true, když ho obsloužil. */
hooky.obnovKalendar = () => obnovPoZmene(null);

export function klikKalendar(el) {
  if (el.hasAttribute('data-kal-zobrazeni')) { otevriZobrazeni(); return true; }
  if (el.dataset.kalJen) {
    skryte = new Set(viditelneKalendare().map((kal) => kal.id).filter((id) => id !== el.dataset.kalJen));
    ulozSkryte();
    poZmeneZobrazeni();
    return true;
  }
  if (el.hasAttribute('data-kal-vse')) { skryte = new Set(); ulozSkryte(); poZmeneZobrazeni(); return true; }
  if (el.hasAttribute('data-jmeniny-pridat')) { pridejHromadne(el); return true; }
  if (el.dataset.jmeninyVolba !== undefined) {
    // výběr u nejednoznačného / podobného jména (prázdné = zrušit výběr)
    if (el.dataset.jmeno) hromadne.volby[el.dataset.jmeninyVolba] = el.dataset.jmeno; else delete hromadne.volby[el.dataset.jmeninyVolba];
    prekresliNahled();
    return true;
  }
  if (el.dataset.jmeninyOdebrat !== undefined) {
    const o = oblibeni()[Number(el.dataset.jmeninyOdebrat)];
    if (o) ulozOblibene(oblibeni().filter((x) => x !== o), el, 'Odebráno: ' + o.jmeno);
    return true;
  }
  if (el.dataset.kalDruh !== undefined) {
    k.druh = el.dataset.kalDruh;
    uloziste.pis('asistent.kal.druh', k.druh);
    zmeneno();
    return true;
  }
  if (el.dataset.udalost) { otevriUdalost(el.dataset.udalost); return true; }
  if (el.dataset.kal) {
    if (el.dataset.kal === 'dnes') { k.vybrany = pulnoc(Date.now()); posunOsy = null; nactiKalendar(); zmeneno(); }
    else posun(el.dataset.kal === 'dalsi' ? 1 : -1);
    return true;
  }
  if (el.dataset.kalPohled) {
    k.pohled = el.dataset.kalPohled;
    uloziste.pis('asistent.kal.pohled', k.pohled);
    posunOsy = null;
    zmeneno();
    return true;
  }
  if (el.dataset.miniPosun) {
    const d = new Date(miniMesic ? miniMesic.t : prvniDen(k.vybrany));
    miniMesic = { t: new Date(d.getFullYear(), d.getMonth() + Number(el.dataset.miniPosun), 1).getTime(), listovano: true };
    nactiMesic(miniMesic.t);
    zmeneno();
    return true;
  }
  if (el.dataset.den && el.closest('#p-kalendar')) {
    if (el.closest('.mini') && miniMesic) miniMesic.listovano = false; // malý měsíc se zase drží vybraného dne
    const den = Number(el.dataset.den);
    const jinyMesic = klicMesice(den) !== klicMesice(k.vybrany);
    k.vybrany = den;
    if (jinyMesic) nactiKalendar();
    if (k.pohled === 'tyden') posunOsy = null;
    zmeneno();
    return true;
  }
  if (el.hasAttribute('data-kal-znovu')) { nactiKalendar(true); return true; }
  return false;
}

/** Přejetí prstem doleva/doprava = další/předchozí měsíc či týden. */
export function pripravGesta(el) {
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || e.target.closest('.cas-svitek')) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (x0 == null || k.pohled === 'seznam') return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 45) posun(dx < 0 ? 1 : -1);
  }, { passive: true });
  // klepnutí do volného místa v týdnu = nová událost v tu půlhodinu
  el.addEventListener('click', (e) => {
    const sloupec = e.target.closest('.cas-sloupec');
    if (!sloupec || e.target.closest('.cas-udalost') || !zapisovatelneKalendare().length) return;
    const y = e.clientY - sloupec.getBoundingClientRect().top;
    otevriFormular({ den: Number(sloupec.dataset.denOsa), hodina: Math.max(0, Math.min(23, Math.floor((y / HODINA) * 2) / 2)) });
  });
  SIROKY.addEventListener('change', () => { posunOsy = null; zmeneno(); });
}
