// Kalendář: Měsíc (mřížka + seznam vybraného dne), Týden (časová osa; na telefonu pruh dnů + jeden den),
// Seznam (30 dní). Na PC vpravo panel: malý měsíc, kalendáře, nejbližší události, zápasy z rozpisu.
// Nová událost: tlačítko, „+ Přidat“ u dne, klepnutí do volné hodiny v týdnu (formulář v udalost.js).
// Data z motoru po měsících (mřížka 6 týdnů), uložená i v zařízení pro okamžitý start.

import { stav, zmeneno, hooky } from './stav.js';
import { volej } from './api.js';
import {
  esc, pulnoc, pridejDny, rozdilDni, zacatekTydne, hhmm, trvani, datumDlouhe, denNadpis, velkePrvni,
  sOdkazy, uloziste, DNY_KR, MESICE, MESICE_1
} from './pomocne.js';
import { otevriPanel } from './panely.js';
import { chybaHtml, segment, hlavickaKarty } from './ui.js';
import { IKONY, ikonaPocasi } from './ikony.js';
import { predpovedNa, teplota } from './pocasi.js';
import { otevriFormular, akceUdalostiHtml, zapasyHtml, zapisovatelneKalendare } from './udalost.js';
import { tymyHtml as fotbalTymyHtml } from './fotbal.js';

const k = stav.kal;
const HODINA = 48;                                   // px na hodinu v časové ose
const SIROKY = window.matchMedia('(min-width: 760px)');
const ULOZISTE = 'asistent.data.kal.';
let posunOsy = null;                                 // zapamatovaná pozice časové osy mezi překresleními
let jenDruh = null;                                  // filtr druhu platí jen při vykreslení sekce Kalendář (Dnes ukazuje vše)
export const DRUHY = [['osobni', 'Osobní'], ['prace', 'Práce'], ['fotbal', 'Fotbal'], ['rodina', 'Rodina'], ['ostatni', 'Ostatní']];
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

/** Načte měsíc (podle libovolného dne v něm). Čerstvá data (< 5 min) znovu nestahuje, pokud se nevynutí. */
export function nactiMesic(t, znovu) {
  const klic = klicMesice(t);
  if (k.nacita[klic]) return k.nacita[klic];
  const m = k.mesice[klic];
  if (!znovu && m && !m.zUloziste && Date.now() - m.kdy < 5 * 60e3) return Promise.resolve();
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
export function nactiKalendar(znovu) {
  const dny = [Date.now(), dalsiMesic(Date.now(), 1), k.vybrany, pridejDny(zacatekTydne(k.vybrany), 6)];
  const videno = {};
  return Promise.all(dny.filter((t) => { const kl = klicMesice(t); if (videno[kl]) return false; videno[kl] = 1; return true; })
    .map((t) => nactiMesic(t, znovu)));
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

/** Předpověď ČHMÚ ke dni: malá ikona a teploty (jen dny, pro které ji ČHMÚ dává – dnes až 3 dny dopředu). */
function pocasiDneHtml(den) {
  const p = predpovedNa(den + 12 * 36e5);
  if (!p) return '';
  const t = p.tMax || p.tMin;
  return '<i class="den-pocasi" title="' + esc(p.uvod + (t ? ', ' + teplota(p) : '')) + '">' + ikonaPocasi(p.ikona) + (t ? t[1] + '°' : '') + '</i>';
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
 * Krátký výpis na Dnes: příštích n dní po dnech (jen dny, kdy něco je), řádek = čas · barva · název.
 * Dnes jen to, co ještě neskončilo. Vrací { html, pocet (ukázaných), celkem }.
 */
export function agenda(dni, max) {
  const ted = Date.now();
  const dnes = pulnoc(ted);
  let h = '', pocet = 0, celkem = 0;
  for (let i = 0; i < dni; i++) {
    const t = pridejDny(dnes, i);
    const ud = udalostiDne(t).filter((u) => i > 0 || u.celodenni || u.konec > ted);
    celkem += ud.length;
    const vejde = Math.max(0, max - pocet);
    if (!ud.length || !vejde) continue;
    h += '<li class="agenda__den"><b>' + (i === 0 ? 'Dnes' : i === 1 ? 'Zítra' : velkePrvni(DNY_KR[new Date(t).getDay()])) + '</b>' +
      '<small>' + new Date(t).getDate() + '. ' + (new Date(t).getMonth() + 1) + '.</small></li>';
    ud.slice(0, vejde).forEach((u) => {
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
  if (ud.length) return '<ul class="seznam">' + ud.map((u) => udalostHtml(u, pulnoc(t))).join('') + '</ul>';
  if (!mameData(t)) return chybaMesice(t) ? chybaHtml(chybaMesice(t), 'data-kal-znovu') : '<div class="prazdne">Načítám…</div>';
  return '<div class="prazdne">' + (prazdnyText || 'Nic naplánováno.') + '</div>';
}

// ---------------------------------------------------------------- vykreslení

export function vykresliKalendar(el) {
  jenDruh = k.druh || null;
  try { vykresliKalendarFiltr(el); } finally { jenDruh = null; }
}

function vykresliKalendarFiltr(el) {
  const osa = el.querySelector('#cas-svitek');
  if (osa) posunOsy = osa.scrollTop;
  let telo;
  if (k.pohled === 'tyden') telo = tydenHtml();
  else if (k.pohled === 'seznam') telo = seznamHtml();
  else telo = mesicHtml();
  const chyby = Object.keys(k.mesice).reduce((a, kl) => a.concat(k.mesice[kl].chyby || []), []);
  const varovani = chyby.length
    ? '<p class="pruh pruh-varovani">Některý kalendář se nepodařilo načíst: ' + esc(Array.from(new Set(chyby.map((c) => c.kalendar))).join(', ')) + '</p>'
    : '';
  el.innerHTML = '<div class="kal-rozlozeni"><div class="kal-hlavni">' + listaHtml() + varovani + telo + '</div>' +
    '<aside class="kal-boc" aria-label="Kalendáře a nejbližší události">' + bocniPanelHtml() + '</aside></div>';
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
  return '<div class="kal-lista">' +
    segment([['mesic', 'Měsíc'], ['tyden', 'Týden'], ['seznam', 'Seznam']], k.pohled, 'data-kal-pohled', 'Zobrazení kalendáře') +
    (filtr ? '<div class="kal-druhy">' + filtr + '</div>' : '') +
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
    '<input type="checkbox" data-nast-kal-zobrazit="' + esc(kal.id) + '"' + (kal.skryty ? '' : ' checked') + ' aria-label="Ukazovat ' + esc(kal.nazev) + '"></li>';
  const skupiny = DRUHY.map((d) => [d, kalendare.filter((kal) => (kal.druh || 'osobni') === d[0])]).filter((x) => x[1].length);
  h += '<section class="card">' + hlavickaKarty(IKONY.kalendar, 'Kalendáře') +
    (kalendare.length
      ? skupiny.map((x) => (skupiny.length > 1 ? '<div class="kal-skupina">' + esc(x[0][1]) + '</div>' : '') + '<ul class="kal-seznam">' + x[1].map(radek).join('') + '</ul>').join('')
      : '<div class="prazdne">Zatím žádný kalendář.</div>') +
    '<button type="button" class="dlazdice__pata" data-otevri-nastaveni="kalendare">Přidat kalendář z iPhonu</button></section>';
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
    const barvy = Array.from(new Set(ud.map((u) => u.barva))).slice(0, 3);
    const cipy = ud.slice(0, 3).map((u) => '<span class="cip-udalost' + (u.celodenni ? ' celodenni' : '') + '" data-udalost="' + esc(u.id) + '" style="--b:' + esc(u.barva) + '">' +
      (u.celodenni || u.zacatek < den ? '' : '<b class="cisla">' + hhmm(u.zacatek) + '</b> ') + esc(u.nazev) + '</span>').join('') +
      (ud.length > 3 ? '<span class="cip-vic">+' + (ud.length - 3) + ' další</span>' : '');
    h += '<button type="button" class="' + tridy.join(' ') + '" data-den="' + den + '" aria-label="' + esc(datumDlouhe(den)) + (ud.length ? ', událostí ' + ud.length : '') + '"' +
      (den === vybrany ? ' aria-current="date"' : '') + '>' +
      '<span class="mesic-cislo cisla">' + d.getDate() + pocasiDneHtml(den) + '</span>' +
      '<span class="mesic-tecky">' + barvy.map((b) => '<i style="--b:' + esc(b) + '"></i>').join('') + '</span>' +
      '<span class="mesic-cipy">' + cipy + '</span></button>';
  }
  h += '</div></div>';
  h += '<div class="card kal-den"><div class="kal-den__hlava"><span class="den-nadpis' + (rozdilDni(vybrany) === 0 ? ' dnes' : '') + '">' +
    esc(velkePrvni(denNadpis(vybrany))) + '</span>' +
    (zapisovatelneKalendare().length ? '<button type="button" class="btn btn--ghost btn--sm" data-nova-udalost="' + vybrany + '">' + IKONY.plus + '<span>Přidat</span></button>' : '') +
    '</div>' + seznamDneHtml(vybrany) + '</div>';
  return h;
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
      '<i' + (ma ? '' : ' hidden') + '></i></button>';
  }).join('') + '</div>';
  return '<div class="card kal-tyden">' + pas + '<div class="den-nadpis' + (vybrany === dnes ? ' dnes' : '') + '">' + esc(velkePrvni(denNadpis(vybrany))) + '</div>' +
    casovaOsaHtml([vybrany]) + '</div>';
}

/** Časová osa pro jeden nebo víc dnů: hlavička, řádek celodenních, mřížka 0–24 h se svitkem. */
function casovaOsaHtml(dny) {
  const dnes = pulnoc(Date.now());
  const sloupce = 'style="--dnu:' + dny.length + '"';
  let h = '<div class="cas-svitek" id="cas-svitek">';
  if (dny.length > 1) {
    h += '<div class="cas-hlava" ' + sloupce + '><span></span>' + dny.map((d) => '<button type="button" class="cas-den-nadpis' + (d === dnes ? ' dnes' : '') +
      (d === pulnoc(k.vybrany) ? ' vybrany' : '') + '" data-den="' + d + '"><small>' + DNY_KR[new Date(d).getDay()] + pocasiDneHtml(d) + '</small><b class="cisla">' + new Date(d).getDate() + '</b></button>').join('') + '</div>';
  }
  const celodenni = dny.map((d) => udalostiDne(d).filter((u) => u.celodenni || (u.zacatek <= d && u.konec >= pridejDny(d, 1))));
  if (celodenni.some((a) => a.length)) {
    h += '<div class="cas-celodenni" ' + sloupce + '><span class="cas-popisek">celý den</span>' + celodenni.map((a) => '<div>' +
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
    if (!ud.length) continue;
    neco = true;
    h += '<div class="card"><div class="den-nadpis' + (i === 0 ? ' dnes' : '') + '">' + esc(velkePrvni(denNadpis(d))) + '</div>' +
      '<ul class="seznam">' + ud.map((u) => udalostHtml(u, d)).join('') + '</ul></div>';
  }
  if (!neco) {
    if (!mameData(od)) return '<div class="card">' + (chybaMesice(od) ? chybaHtml(chybaMesice(od), 'data-kal-znovu') : '<div class="prazdne">Načítám…</div>') + '</div>';
    return '<div class="card"><div class="prazdne">Příštích 30 dní nic v kalendáři.</div></div>';
  }
  return h;
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
