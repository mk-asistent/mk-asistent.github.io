// Připravenost – „ať je všechno hned“ (Michal 18. 10.: „stále mi celkem nevyhovuje, že to není vše vždy ready, že se to
// načítá ty věci … je nějaké řešení?“). Pošta, schránka, kalendář, fotbal, reely a plakáty mají kopie na serveru (js/ucet.js),
// zdraví, počasí, auto a knihovna jdou jen z motoru (Apps Script, 2–16 s). Proto:
//  1. vždy nejdřív to, co zařízení zná – moduly ukazují data z minula (localStorage), kostřička jen v prázdném zařízení;
//  2. přednačtení na pozadí po startu: až doběhne start, v klidu (requestIdleCallback) jedna dávka k motoru s oblastmi, které
//     jsou starší než jejich mez (i stránky, které zrovna nejsou otevřené); auto zvlášť (motor ho v dávce neumí) až po ní;
//  3. obnova na pozadí, dokud aplikace běží (nainstalovaná na PC běží celý den): kontrola každou minutu, oblast se načte, až je
//     starší než její mez (počasí 15 min, zdraví 10 min / s účtem 30 – změny hlásí značky, auto a knihovna 6 h – taky značky);
//     po probuzení PC (mezera v kontrolách) hned. Jen jedno okno naráz (navigator.locks) a stáří se čte ze zařízení – druhé okno
//     (mini okno, záložka) nic znovu nečte, data si vezme ze zařízení (událost storage);
//  4. na telefonu šetrně: přednačtení jen bez úsporného režimu dat, mimo mobilní data a se slušnou baterií (kde to prohlížeč
//     prozradí – Android Chrome); iPhone to neprozradí → jednou za start (a po návratu z pozadí po 10 min), obnova jen na PC
//     a na telefonu na Wi-Fi;
//  5. „aktualizuji…“ v hlavičce stránky, když se její data obnovují déle než 0,7 s (mimo tok stránky – nic neposkočí).
// Oblasti a jejich načítání dodá app.js (spust) – modul nezná ostatní moduly (bez kruhových importů).

import { stav, zmeneno, naPc } from './stav.js';
import { uloziste } from './pomocne.js';
import { jePripojeno, jeDemo } from './api.js';

const KONTROLA = 60e3;            // jak často se kontroluje stáří oblastí
const PROBUZENI = 3 * 60e3;       // mezera mezi kontrolami delší než tohle = PC spalo (nebo stálo okno) → obnovit hned
const NAVRAT_PO = 10 * 60e3;      // telefon: přednačíst znovu po návratu z pozadí nejdřív za 10 min
const UKAZAT_PO = 700;            // „aktualizuji…“ až po 0,7 s (rychlá obnova z kopie se neukazuje vůbec)
const ZAMEK = 'asistent-obnova';

let oblasti = {};                 // id → { klic, mez(): min, nacti(), umi(), nacita(), davka, zUloziste?(), stari?(): min | null = podle klic }
let volby = {};                   // { naProbuzeni(), obnovRychle(), moduly() }
let bezi = null;                  // právě běžící přednačtení (druhé se nespustí)
let posledniKontrola = 0, posledniPrednacteni = 0;
let baterie = null;
const nacitaOd = {};              // oblast → kdy se začala načítat (pro „aktualizuji…“)
const pokus = {};                 // oblast → kdy ji přednačtení naposledy spustilo (motor nejde → zkusit nejdřív za 10 min, ne každou minutu)
let casovacUkazani = 0;

/** Kolik minut jsou data oblasti v zařízení stará (Infinity = žádná). */
export function stariMin(id) {
  const o = oblasti[id];
  if (!o) return Infinity;
  const s = o.stari ? o.stari() : null;
  if (s != null) return s;
  const v = o.klic ? uloziste.cti(o.klic) : null;
  return v && v.kdy ? (Date.now() - v.kdy) / 60e3 : Infinity;
}

/**
 * Smí se na pozadí stahovat? PC vždy (kromě slabé baterie bez nabíječky a úsporného režimu dat); telefon a iPad jen bez
 * mobilních dat a úsporného režimu a se slušnou baterií – kde to API neřekne (iPhone), „jednou“ = jen při startu a návratu.
 * Vrací 'ano' | 'jednou' | 'ne'.
 */
export function rezim() {
  const c = navigator.connection;
  const slaba = baterie && !baterie.charging && baterie.level < 0.2;
  if ((c && (c.saveData || /2g$/.test(c.effectiveType || ''))) || slaba) return 'ne';
  if (naPc()) return 'ano';
  if (c && c.type === 'cellular') return 'ne';
  return c && (c.type === 'wifi' || c.type === 'ethernet') ? 'ano' : 'jednou';
}

/** Jedno okno naráz: druhé okno (mini okno, další záložka) kolo vynechá – stáří se pak čte ze zařízení. */
function sZamkem(fn) {
  if (navigator.locks && navigator.locks.request) {
    return navigator.locks.request(ZAMEK, { ifAvailable: true }, (zamek) => (zamek ? fn() : null)).catch(() => null);
  }
  return Promise.resolve().then(fn);
}

/**
 * Načte oblasti starší než jejich mez: čtení, která motor umí v dávce, v jednom kroku (api.js je pošle jedním dotazem), ostatní
 * (auto) po nich po jednom. Nic, co se právě načítá, se nespouští znovu. Vrací slib (hotovo, i když se něco nepovedlo).
 */
export function prednacti(duvod) {
  if (!jePripojeno() || jeDemo() || navigator.onLine === false) return Promise.resolve([]);
  if (bezi) return bezi;
  // moduly načítané až na své stránce (Knihovna) nejdřív ze zařízení – jejich čtení pak jde ve stejné dávce jako ostatní
  bezi = sZamkem(() => Promise.resolve(volby.moduly ? volby.moduly() : null).catch(() => null).then(() => {
    const vDavce = [], potom = [];
    Object.keys(oblasti).forEach((id) => {
      const o = oblasti[id];
      if (!o.umi() || o.nacita() || stariMin(id) < o.mez() || Date.now() - (pokus[id] || 0) < Math.min(o.mez(), 10) * 60e3) return;
      pokus[id] = Date.now();
      (o.davka ? vDavce : potom).push(id);
    });
    const hotovo = vDavce.map((id) => Promise.resolve(oblasti[id].nacti()).catch(() => null));
    return Promise.all(hotovo)
      .then(() => potom.reduce((p, id) => p.then(() => (oblasti[id].umi() && !oblasti[id].nacita() ? oblasti[id].nacti() : null)).catch(() => null), Promise.resolve()))
      .then(() => vDavce.concat(potom));
  })).then((nactene) => { posledniPrednacteni = Date.now(); if (duvod) stav.pripravenost = { duvod, kdy: Date.now(), nactene: nactene || [] }; return nactene || []; })
    .finally(() => { bezi = null; });
  return bezi;
}

/** Po prvním vykreslení: až doběhne start (čtení při otevření), v klidu přednačíst zbytek. Start na nic z toho nečeká. */
function poStartu() {
  const konec = Date.now() + 6000;
  const zkus = () => {
    // start ještě čte (pošta, kalendář, dávka se zdravím a počasím) – přednačtení by se řadilo za něj a zdrželo ho
    if (Object.keys(stav.nacita).some((k) => stav.nacita[k]) && Date.now() < konec) { setTimeout(zkus, 300); return; }
    // window.asistentPripraveno: přednačtení po startu doběhlo (nebo se vynechalo) – testy na to čekají, než najedou myší / podrží prst
    const hotovo = () => { window.asistentPripraveno = true; };
    const jdi = () => { (rezim() !== 'ne' ? prednacti('start') : Promise.resolve()).then(hotovo, hotovo); };
    if (window.requestIdleCallback) requestIdleCallback(jdi, { timeout: 2500 }); else setTimeout(jdi, 400);
  };
  setTimeout(zkus, 300);
}

/** Kontrola každou minutu: probuzení → hned všechno; jinak obnova starých oblastí, když okno smí (PC i minimalizované). */
function kontrola() {
  const ted = Date.now();
  const mezera = posledniKontrola ? ted - posledniKontrola : 0;
  posledniKontrola = ted;
  if (!jePripojeno() || jeDemo()) return;
  if (mezera > PROBUZENI) {
    // telefon / iPad: časovače stály, protože byla aplikace v pozadí – návrat obslouží visibilitychange (app.js), tady jen
    // pomalé oblasti se šetřením (mobilní data, baterie, nejdřív po 10 min)
    if (!naPc()) { poNavratu(); return; }
    // PC se probudilo (okno zůstává viditelné, visibilitychange nepřijde) – nejdřív to, co se při návratu obnovuje vždy
    // (pokud to mezitím neudělal návrat do okna), pak pomalé oblasti
    if (volby.naProbuzeni && ted - stav.naposledy > 60e3) volby.naProbuzeni();
    if (rezim() !== 'ne') prednacti('probuzeni');
    return;
  }
  const r = rezim();
  // telefon: na pozadí nic (iPhone aplikaci stejně uspí); PC i minimalizované (Windows ho nevypíná, jen zpomalí časovače)
  if (r !== 'ano' || (!naPc() && document.visibilityState !== 'visible')) return;
  if (volby.obnovRychle) volby.obnovRychle();
  prednacti('obnova');
}

/** Návrat do aplikace (telefon z pozadí, okno na PC): pomalé oblasti, které mezitím zestárly (telefon nejdřív po 10 min). */
export function poNavratu() {
  if (rezim() === 'ne') return;
  if (!naPc() && Date.now() - posledniPrednacteni < NAVRAT_PO) return;
  prednacti('navrat');
}

/** Spuštění z app.js po prvním vykreslení. o = oblasti (viz výš), v = { naProbuzeni, obnovRychle, moduly } (moduly → slib). */
export function spust(o, v) {
  oblasti = o || {};
  volby = v || {};
  posledniKontrola = Date.now();
  try { if (navigator.getBattery) navigator.getBattery().then((b) => { baterie = b; }).catch(() => { /* bez baterie */ }); } catch (e) { /* nic */ }
  poStartu();
  setInterval(kontrola, KONTROLA);
  // druhé okno téhož zařízení (mini okno, záložka) načetlo data → vzít si je ze zařízení, ne číst znovu z motoru
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    Object.keys(oblasti).forEach((id) => {
      const x = oblasti[id];
      if (x.klic === e.key && x.zUloziste && !x.nacita()) { x.zUloziste(); zmeneno(); }
    });
  });
}

// ---------------------------------------------------------------- „aktualizuji…“ v hlavičce

/**
 * Malé „aktualizuji…“ k hlavičce stránky: data na stránce jsou (z minula), ale některá z jejích oblastí se právě načítá déle
 * než 0,7 s. Kostřička / prázdná karta = žádná data – tam se nic navíc neukazuje. Vrací HTML (nebo '').
 * seznam() = [[oblast, načítá se?, má data?], …] pro otevřenou stránku (app.js) – volá se znovu, když 0,7 s uplyne.
 */
export function aktualizujiHtml(seznam) {
  const ted = Date.now();
  let ukaz = false, nejdriv = Infinity;
  (seznam() || []).forEach((x) => {
    if (!x[1]) { delete nacitaOd[x[0]]; return; }
    if (!nacitaOd[x[0]]) nacitaOd[x[0]] = ted;
    if (!x[2]) return;
    const zbyva = nacitaOd[x[0]] + UKAZAT_PO - ted;
    if (zbyva <= 0) ukaz = true; else nejdriv = Math.min(nejdriv, zbyva);
  });
  // ještě ne – za 0,7 s překreslit, jen když se otevřená stránka pořád obnovuje (jinak zbytečné překreslení – mezitím
  // doběhlo, nebo je otevřená jiná stránka)
  if (!ukaz && nejdriv < Infinity && !casovacUkazani) {
    casovacUkazani = setTimeout(() => {
      casovacUkazani = 0;
      if ((seznam() || []).some((x) => x[1] && x[2])) zmeneno();
    }, nejdriv + 20);
  }
  return ukaz ? '<span class="aktualizuji" role="status"><i aria-hidden="true"></i>aktualizuji…</span>' : '';
}
