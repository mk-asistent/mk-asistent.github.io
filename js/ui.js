// Drobné společné kousky rozhraní: oznámení, kostra při načítání, chybová karta, přepínač (segment).

import { esc } from './pomocne.js';

let casovac;
/** Krátké oznámení dole („Uloženo ✓“). */
export function toast(text, dlouze) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('videt');
  clearTimeout(casovac);
  casovac = setTimeout(() => el.classList.remove('videt'), dlouze ? 4800 : 2200);
}

export function kostra(n) {
  let s = '';
  for (let i = 0; i < (n || 3); i++) s += '<i></i>';
  return '<div class="kostra" aria-label="Načítám">' + s + '</div>';
}

/** Chybová karta s tlačítkem „Zkusit znovu“ (atribut určuje, co se zkusí). */
export function chybaHtml(chyba, atribut) {
  return '<div class="chyba-karty"><span>' + esc((chyba && chyba.message) || 'Nepodařilo se načíst.') + '</span>' +
    (atribut ? '<button type="button" class="btn btn--ghost btn--sm" ' + atribut + '>Zkusit znovu</button>' : '') + '</div>';
}

/** Přepínač z několika voleb: volby = [[hodnota, popisek], …] */
export function segment(volby, aktivni, atribut, popisek) {
  return '<div class="segment" role="group"' + (popisek ? ' aria-label="' + esc(popisek) + '"' : '') + '>' +
    volby.map((v) => '<button type="button" class="chip" ' + atribut + '="' + esc(v[0]) + '" aria-pressed="' + (v[0] === aktivni) + '">' + esc(v[1]) + '</button>').join('') +
    '</div>';
}

export function prizpusobVysku(t) {
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 'px';
}

/** Potvrzení před nevratnou akcí (systémové okno). */
export function potvrd(text) { return window.confirm(text); }
