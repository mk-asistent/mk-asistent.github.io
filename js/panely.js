// Panely přes obsah: detail e-mailu, psaní, událost, nastavení. Na telefonu přes celou obrazovku,
// na iPadu a PC jako boční panel nebo okno uprostřed. Zásobník – psaní se otevře nad detailem e-mailu.
// Tlačítko Zpět prohlížeče / gesto zavře horní panel (history.pushState).

import { esc } from './pomocne.js';
import { IKONY } from './ikony.js';

const zasobnik = [];

function najdi(id) { return zasobnik.find((p) => p.id === id) || null; }
function elPanelu(id) { return document.querySelector('[data-panel="' + id + '"]'); }

/**
 * p = { id, trida ('panel-bocni' | 'panel-okno'), titul (text nebo funkce), vykresli() → html,
 *       vpravo?() → html tlačítek v hlavičce, paticka?() → html, poVykresleni?(el), poOtevreni?(el), priZavreni?() }
 */
export function otevriPanel(p) {
  if (najdi(p.id)) { obnovPanel(p.id); return; }
  zasobnik.push(p);
  const el = document.createElement('section');
  el.className = 'panel ' + (p.trida || 'panel-bocni');
  el.dataset.panel = p.id;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.tabIndex = -1;
  document.getElementById('panely').appendChild(el);
  obnovPanel(p.id);
  document.documentElement.classList.add('s-panelem');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('otevreny')));
  try { history.pushState({ panel: p.id }, ''); } catch (e) { /* nic */ }
  if (p.poOtevreni) p.poOtevreni(el); else el.focus({ preventScroll: true });
}

/** Překreslí obsah panelu (rozepsaný text v polích se nepřepisuje – psaní si ho drží samo). */
export function obnovPanel(id) {
  const p = najdi(id);
  const el = elPanelu(id);
  if (!p || !el) return;
  const telo = el.querySelector('.panel-telo');
  const posun = telo ? telo.scrollTop : 0;
  const titul = typeof p.titul === 'function' ? p.titul() : (p.titul || '');
  el.setAttribute('aria-label', titul);
  el.innerHTML =
    '<header class="panel-hlava">' +
      '<button type="button" class="btn btn--ikona panel-zavrit" data-zavrit-panel aria-label="Zavřít">' +
        (/\bpanel-okno\b/.test(p.trida || '') ? IKONY.zavrit : IKONY.zpet) + '</button>' +
      '<h2 class="panel-titul">' + esc(titul) + '</h2>' +
      '<div class="panel-vpravo">' + (p.vpravo ? p.vpravo() : '') + '</div>' +
    '</header>' +
    '<div class="panel-telo">' + p.vykresli() + '</div>' +
    (p.paticka ? '<footer class="panel-paticka">' + p.paticka() + '</footer>' : '');
  el.querySelector('.panel-telo').scrollTop = posun;
  if (p.poVykresleni) p.poVykresleni(el);
}

/** Zavře horní panel (přes historii, aby seděl i krok Zpět). */
export function zavriPanel() {
  if (!zasobnik.length) return;
  try { history.back(); } catch (e) { zavriHorni(); }
}

let poZavreni = null;
/** Zavře horní panel a teprve potom udělá fn – např. z hledání otevřít e-mail v novém panelu
 *  (kdyby se otevřel dřív, krok Zpět z historie by zavřel ten nový). */
export function zavriAPak(fn) {
  if (!zasobnik.length) { fn(); return; }
  const pocet = zasobnik.length;
  poZavreni = fn;
  zavriPanel();
  // pojistka, kdyby prohlížeč krok Zpět neohlásil
  setTimeout(() => { if (poZavreni === fn && zasobnik.length === pocet) zavriHorni(); }, 400);
}

function zavriHorni() {
  const p = zasobnik.pop();
  if (!p) return;
  const el = elPanelu(p.id);
  if (el) {
    el.classList.remove('otevreny');
    el.classList.add('zavira');
    el.removeAttribute('data-panel'); // zavírající se panel už nehledat (nový se stejným id může vzniknout hned)
    el.inert = true;                  // a už do něj nejde klepnout ani psát
    setTimeout(() => el.remove(), 260);
  }
  if (!zasobnik.length) document.documentElement.classList.remove('s-panelem');
  if (p.priZavreni) p.priZavreni();
  const fn = poZavreni;
  poZavreni = null;
  if (fn) fn();
}

window.addEventListener('popstate', () => { if (zasobnik.length) zavriHorni(); });

export function jeOtevreny(id) { return !!najdi(id); }
export function horniPanel() { return zasobnik[zasobnik.length - 1] || null; }
export function elementPanelu(id) { return elPanelu(id); }
