// Malá nabídka u kurzoru: pravé tlačítko myši, na dotyku dlouhé podržení (Michal 9. 10.: „když kliknu pravým, tak můžu
// třeba smazat tu poznámku, aby se mi to tam zbytečně nezobrazovalo, co už je staré nebo jednoduše vyřešené“).
// Co v ní je, skládají moduly podle prvku, na který se kliklo (schranka.js – položky schránky, moje.js – moje
// poznámky); app.js je připojí přes pripoj(). Zavře se klepnutím vedle, Esc, posunem stránky nebo výběrem položky.
// Kde žádný modul nabídku nemá (pole, odkazy, text odpovědi), zůstane běžná nabídka prohlížeče.

import { esc } from './pomocne.js';

const DRZET_MS = 480;     // dlouhé podržení prstu (iPhone pravé tlačítko nemá a contextmenu neposílá)
const POSUN_PX = 10;      // prst se pohnul = posouvání stránky, ne podržení
let zdroj = null;         // fn(prvek) → { nadpis, polozky: [{ ikona, text, fn, nebezpeci }] } | null
let otevrena = null;      // { el, puvod, kdy }
let drzeni = null;        // { casovac, x, y }
let potlacitKlik = 0;     // po dlouhém podržení pošle prohlížeč ještě klepnutí – to se zahodí (jinak by položku rozbalilo)

/** Kdo skládá nabídku: fn(prvek) → nabídka, nebo null (pak běžná nabídka prohlížeče). */
export function pripoj(fn) { zdroj = fn; }
export function jeOtevrena() { return !!otevrena; }

function nabidkaPro(cil) {
  if (!zdroj || !cil || !cil.closest) return null;
  // v polích, v odkazech a v rozbaleném textu poznámky nechat nabídku prohlížeče (kopírovat, vložit, otevřít odkaz)
  if (cil.closest('input, textarea, select, [contenteditable="true"], a[href], .detail, .nabidka')) return null;
  const n = zdroj(cil);
  return n && n.polozky && n.polozky.length ? n : null;
}

/** Otevře nabídku v bodě x, y (px v okně); puvod = prvek, na který se kliklo (po Esc na něj vrátí fokus);
 *  dotyk = otevřelo ji podržení prstem (fokus nepřesouvat – zavřela by se klávesnice a s ní okno). */
export function otevri(x, y, n, puvod, dotyk) {
  zavri();
  const el = document.createElement('div');
  el.className = 'nabidka';
  el.setAttribute('role', 'menu');
  if (n.nadpis) el.setAttribute('aria-label', n.nadpis);
  el.innerHTML = (n.nadpis ? '<div class="nabidka__nadpis">' + esc(n.nadpis) + '</div>' : '') +
    n.polozky.map((p, i) => '<button type="button" role="menuitem" class="nabidka__polozka' + (p.nebezpeci ? ' nabidka__polozka--nebezpeci' : '') +
      '" data-nabidka-i="' + i + '">' + (p.ikona || '') + '<span>' + esc(p.text) + '</span></button>').join('');
  document.body.appendChild(el);
  // u kurzoru, ale vždy celá na obrazovce (u pravého a dolního okraje se otočí); rozměr bez animace zvětšení
  const w = el.offsetWidth, h = el.offsetHeight, okraj = 8;
  const sirka = document.documentElement.clientWidth, vyska = window.innerHeight;
  el.style.left = Math.max(okraj, Math.min(x, sirka - w - okraj)) + 'px';
  el.style.top = Math.max(okraj, Math.min(y + h + okraj > vyska ? y - h : y, vyska - h - okraj)) + 'px';
  el.addEventListener('click', (e) => {
    e.stopPropagation(); // klepnutí v nabídce nejde do ovládání aplikace pod ní
    const b = e.target.closest('[data-nabidka-i]');
    if (!b) return;
    const p = n.polozky[Number(b.dataset.nabidkaI)];
    zavri(true);
    if (p && p.fn) p.fn();
  });
  otevrena = { el, puvod, kdy: Date.now(), sirka };
  requestAnimationFrame(() => el.classList.add('videt'));
  const prvni = el.querySelector('[data-nabidka-i]');
  if (prvni && !dotyk) prvni.focus({ preventScroll: true }); // šipkami a Enterem z klávesnice
}

/** Zavře nabídku; bez výběru (Esc) vrátí fokus tam, odkud se otevřela. */
export function zavri(vybrano) {
  if (!otevrena) return;
  const { el, puvod } = otevrena;
  const mela = el.contains(document.activeElement);
  otevrena = null;
  el.remove();
  const kam = puvod && puvod.isConnected ? (puvod.closest('button, [tabindex]') || puvod) : null;
  if (!vybrano && mela && kam) { try { kam.focus({ preventScroll: true }); } catch (e) { /* nic */ } }
}

function zrusDrzeni() {
  if (drzeni) { clearTimeout(drzeni.casovac); drzeni = null; }
}

// ---------------------------------------------------------------- ovládání (celý dokument)

// pravé tlačítko (PC), Ctrl+klik (Mac), klávesa nabídky, dlouhé podržení na Androidu
document.addEventListener('contextmenu', (e) => {
  if (otevrena && otevrena.el.contains(e.target)) { e.preventDefault(); return; }
  const n = nabidkaPro(e.target);
  if (!n) { zavri(true); return; }
  e.preventDefault();
  zrusDrzeni();
  if (otevrena && Date.now() - otevrena.kdy < 700) return; // právě ji otevřelo dlouhé podržení (Android pošle obojí)
  let x = e.clientX, y = e.clientY;
  if (!x && !y) { const r = e.target.getBoundingClientRect(); x = r.left + 16; y = r.bottom; } // z klávesnice
  otevri(x, y, n, e.target);
});

// dlouhé podržení prstem (iPhone, iPad)
document.addEventListener('pointerdown', (e) => {
  if (otevrena && !otevrena.el.contains(e.target)) zavri(true);
  zrusDrzeni();
  if (e.pointerType !== 'touch' || !e.isPrimary || !nabidkaPro(e.target)) return;
  const cil = e.target, x = e.clientX, y = e.clientY;
  drzeni = {
    x, y,
    casovac: setTimeout(() => {
      drzeni = null;
      const n = cil.isConnected ? nabidkaPro(cil) : null;
      if (!n) return;
      potlacitKlik = Date.now();
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (chyba) { /* nic */ }
      otevri(x, y, n, cil, true);
    }, DRZET_MS)
  };
}, true);
document.addEventListener('pointermove', (e) => {
  if (drzeni && Math.abs(e.clientX - drzeni.x) + Math.abs(e.clientY - drzeni.y) > POSUN_PX) zrusDrzeni();
}, true);
document.addEventListener('pointerup', zrusDrzeni, true);
document.addEventListener('pointercancel', zrusDrzeni, true);

// klepnutí, které prohlížeč pošle po dlouhém podržení, nemá položku rozbalit ani otevřít
document.addEventListener('click', (e) => {
  if (!potlacitKlik) return;
  const cerstve = Date.now() - potlacitKlik < 1500;
  potlacitKlik = 0;
  if (cerstve && !(otevrena && otevrena.el.contains(e.target))) { e.preventDefault(); e.stopPropagation(); }
}, true);

// Esc zavře (a nezavře přitom panel pod ní), šipky mezi položkami, Tab a jiné klávesy (zkratky aplikace) ji zavřou
document.addEventListener('keydown', (e) => {
  if (!otevrena) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zavri(); return; }
  if (e.key === 'Tab' || (e.key.length === 1 && e.key !== ' ')) { zavri(true); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    e.stopPropagation();
    const polozky = Array.from(otevrena.el.querySelectorAll('[data-nabidka-i]'));
    const i = polozky.indexOf(document.activeElement);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? polozky.length - 1
      : (i + (e.key === 'ArrowDown' ? 1 : -1) + polozky.length) % polozky.length;
    if (polozky[j]) polozky[j].focus();
  }
}, true);

// posun stránky nebo seznamu, otočení / jiná šířka okna, odchod z aplikace → zavřít (nabídka by visela mimo svůj
// řádek); výška se mění i s klávesnicí telefonu – ta nabídku nezavírá
document.addEventListener('scroll', (e) => { if (otevrena && !otevrena.el.contains(e.target)) zavri(true); }, true);
window.addEventListener('resize', () => { if (otevrena && document.documentElement.clientWidth !== otevrena.sirka) zavri(true); });
window.addEventListener('blur', () => zavri(true));
