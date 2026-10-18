// Asistent na PC – odznak na ikoně a oznámení ve Windows (Michal 18. 10.: „widget na PC … oznámení na e-maily“).
// Načte se až po startu aplikace (app.js nactiPc – start na něj nečeká), jen na PC (stav.js naPc). Zdroj = data, která
// aplikace už má: kopie ze serveru přes onSnapshot (poNovychKopiich v app.js) a motor – po každém překreslení se podívá,
// co je nového (app.js vykresli → poVykresleni). Bez serverového push: oznámení chodí, dokud aplikace běží (i minimalizovaná,
// v pozadí); zavřená aplikace = nic (do iPhonu dál ntfy). Pravidla výběru a texty: js/pc_vyber.js (čisté funkce, test).
// - Odznak (Badging API): číslo na ikoně nainstalované aplikace v hlavním panelu – hoří + čeká na odpověď / jen hoří / vypnuto.
// - Oznámení ze služby (sw.js showNotification – jdou i při minimalizovaném okně, klepnutí přepne aplikaci na tu věc přes
//   notificationclick → postMessage → app.js otevriCil). Bez služby (http, test) náhradně new Notification.
// - Žádné opakování: ohlášené klíče v zařízení (asistent.data.oznameno – smaže je i „Smazat uložená data“, pak se jen znovu
//   zapamatuje stav); dvě okna aplikace naráz (hlavní + mini) se střídají přes Web Locks, tag oznámení navíc stejné spojí.

import { stav, hooky } from './stav.js';
import * as posta from './posta.js';
import * as ig from './ig.js';
import { doplnkyDnes } from './zdravi.js';
import { uloziste } from './pomocne.js';
import { pcNastaveni } from './nastaveni.js';
import * as V from './pc_vyber.js';

const PAMET = 'asistent.data.oznameno';
const IKONA = 'ikony/ikona-192.png';

const s = {
  relace: { start: Date.now(), zaklad: false, zname: new Set() },
  posledni: null,     // otisk dat při posledním vyhodnocení (stejná data = nic nepočítat)
  odznak: -1,         // naposledy nastavené číslo na ikoně
  bezi: false, znovu: false
};

/** app.js po načtení modulu: start = kdy se aplikace otevřela (co přišlo dřív, ukáže okno Co je nového). */
export function spust(o) {
  if (o && o.start) s.relace.start = o.start;
  hooky.pc = { poVykresleni, zmenaNastaveni, zkusebni };
  poVykresleni();
  // připomínka doplňku má svůj čas – podívat se i bez nových dat (okno v pozadí: prohlížeč to zpomalí nejvýš na minutu)
  setInterval(poVykresleni, 60e3);
}

/** Oprávnění oznámení prohlížeče: 'granted' | 'denied' | 'default' | '' (prohlížeč je neumí). */
export function opravneni() {
  return typeof Notification === 'function' ? Notification.permission : '';
}

/** Volba v Nastavení se změnila: odznak hned, a když se oznámení právě zaplo, nejdřív jen zapamatovat, co už je. */
function zmenaNastaveni() {
  const n = pcNastaveni();
  if (!n.oznameni) s.relace.zaklad = false;
  s.posledni = null;
  s.odznak = -1;
  poVykresleni();
}

// ---------------------------------------------------------------- po každém překreslení

/** Otisk dat, ze kterých se oznamuje – změní se jen s novými daty (kopie ze serveru, motor), ne při každém překreslení. */
function otisk() {
  const z = stav.zdravi;
  let plany = '';
  try { plany = ig.planyInstagramu().map((p) => p.typ + p.id + (p.z && p.z.stav)).join(); } catch (e) { /* bez Instagramu */ }
  return [stav.posta, stav.posta && stav.posta.ted, posta.vsechnyZpravy().length, z, z && z.doplnky, z && z.pitiJidlo, plany,
    Math.floor(Date.now() / 300e3)];
}
const stejne = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

export function poVykresleni() {
  const o = otisk();
  if (stejne(o, s.posledni)) return;
  s.posledni = o;
  nastavOdznak();
  vyhodnot();
}

function nastavOdznak() {
  if (!('setAppBadge' in navigator)) return;
  const n = pcNastaveni();
  const pocet = stav.posta ? V.pocetNaIkonu(posta.vsechnyZpravy(), n.odznak) : 0;
  if (pocet === s.odznak) return;
  s.odznak = pocet;
  try {
    const slib = pocet ? navigator.setAppBadge(pocet) : navigator.clearAppBadge();
    if (slib && slib.catch) slib.catch(() => { /* aplikace není nainstalovaná – nic */ });
  } catch (e) { /* nic */ }
}

/** Všichni kandidáti z dat v zařízení (pošta, jídlo, Instagram, doplňky). */
function kandidati(ted) {
  const k = [];
  if (stav.posta) k.push(...V.kandidatiPosty(posta.vsechnyZpravy()));
  const z = stav.zdravi;
  if (z && z.pitiJidlo) k.push(...V.kandidatiJidla(z.pitiJidlo, ted));
  try { k.push(...V.kandidatiInstagramu(ig.planyInstagramu(), ted)); } catch (e) { /* bez Instagramu */ }
  if (z && z.rezim) {
    const d = doplnkyDnes(0, true);
    const vzato = {};
    if (d) d.polozky.forEach((p) => { if (p.vzato) vzato[p.id] = true; });
    k.push(...V.kandidatDoplnku(z.rezim, vzato, ted));
  }
  return k;
}

function vyhodnot() {
  const n = pcNastaveni();
  if (!n.oznameni || opravneni() !== 'granted') return;
  // dvě okna aplikace (hlavní a mini) – vyhodnocují po sobě, druhé už vidí, co první ohlásilo
  if (s.bezi) { s.znovu = true; return; }
  s.bezi = true;
  const prace = () => Promise.resolve().then(() => {
    const ted = Date.now();
    const pamet = uloziste.cti(PAMET) || {};
    const v = V.vyber(kandidati(ted), pamet, s.relace, { druhy: n.druhy, ticho: n.ticho }, ted);
    // všechny známé konverzace (i bez stavu k ohlášení) – když později začnou hořet, je to novinka
    posta.vsechnyZpravy().forEach((m) => s.relace.zname.add(m.id));
    if (v.oznacit.length) uloziste.pis(PAMET, V.ulozDoPameti(pamet, v.oznacit, ted));
    if (!v.ukazat.length) return null;
    if (v.ukazat.length >= V.SOUHRN_OD) {
      const sh = V.souhrn(v.ukazat);
      return ukaz({ titul: sh.titul, text: sh.text, tag: sh.klic + ':' + ted, cil: sh.cil });
    }
    return Promise.all(v.ukazat.map((k) => { const o = V.obsah(k, n.predmet); return ukaz({ titul: o.titul, text: o.text, tag: k.klic, cil: k.cil }); }));
  });
  const hotovo = () => { s.bezi = false; if (s.znovu) { s.znovu = false; s.posledni = null; poVykresleni(); } };
  const zamek = navigator.locks && navigator.locks.request ? navigator.locks.request('asistent-oznameni', prace) : prace();
  zamek.then(hotovo, hotovo);
}

// ---------------------------------------------------------------- ukázat oznámení

/** Oznámení ze služby (jde i při minimalizovaném okně, klepnutí zpracuje sw.js), jinak přímo ze stránky. */
async function ukaz(o) {
  const volby = { body: o.text, tag: o.tag, data: { cil: o.cil || '' }, icon: IKONA, badge: IKONA, lang: 'cs' };
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) { await reg.showNotification(o.titul, volby); return true; }
  } catch (e) { /* náhradní cesta níž */ }
  if (opravneni() !== 'granted') return false;
  try {
    const ozn = new Notification(o.titul, volby);
    ozn.onclick = () => {
      try { window.focus(); } catch (e) { /* nic */ }
      if (hooky.otevriCil) hooky.otevriCil(o.cil || '');
      try { ozn.close(); } catch (e) { /* nic */ }
    };
    return true;
  } catch (e) { return false; }
}

/** Zkušební oznámení z Nastavení (vždy, i v tichých hodinách). */
export function zkusebni() {
  return ukaz({ titul: 'Asistent · zkušební oznámení', text: pcNastaveni().predmet ? 'Takhle přijde e-mail, který hoří – i s předmětem.'
    : 'Takhle přijde e-mail, který hoří – jen odesílatel a stav.', tag: 'zkusebni', cil: 'dnes' });
}
