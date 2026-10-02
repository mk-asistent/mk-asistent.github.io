// Drobné společné kousky rozhraní: oznámení, kostra při načítání, chybová karta, přepínač (segment).

import { esc } from './pomocne.js';

let casovac;
/** Krátké oznámení dole (tmavě zelené s fajfkou; chyba korálová s vykřičníkem a déle). */
export function toast(text, chyba) {
  const el = document.getElementById('toast');
  el.textContent = String(text || '').replace(/\s*✓$/, '');
  el.classList.toggle('chyba', !!chyba);
  el.classList.remove('s-akci');
  el.classList.add('videt');
  clearTimeout(casovac);
  casovac = setTimeout(() => el.classList.remove('videt'), chyba ? 4800 : 2400);
}

/** Oznámení s tlačítkem (např. „Hotovo · Vrátit“) – drží se déle a dá se na něj klepnout. */
export function toastAkce(text, popisek, fn) {
  const el = document.getElementById('toast');
  el.textContent = String(text || '');
  const tlacitko = document.createElement('button');
  tlacitko.type = 'button';
  tlacitko.className = 'toast__akce';
  tlacitko.textContent = popisek;
  tlacitko.addEventListener('click', (e) => { e.stopPropagation(); el.classList.remove('videt', 's-akci'); fn(); });
  el.appendChild(tlacitko);
  el.classList.remove('chyba');
  el.classList.add('videt', 's-akci');
  clearTimeout(casovac);
  casovac = setTimeout(() => el.classList.remove('videt', 's-akci'), 7000);
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

/** Přepínač z několika voleb: volby = [[hodnota, popisek, počet?], …] – pilulky, aktivní tmavá. */
export function segment(volby, aktivni, atribut, popisek) {
  return '<div class="segment" role="group"' + (popisek ? ' aria-label="' + esc(popisek) + '"' : '') + '>' +
    volby.map((v) => '<button type="button" class="chip" ' + atribut + '="' + esc(v[0]) + '" aria-pressed="' + (v[0] === aktivni) + '">' + esc(v[1]) +
      (v[2] != null ? '<span class="pocet cisla">' + v[2] + '</span>' : '') + '</button>').join('') +
    '</div>';
}

/** Hlavička karty ve stylu přehledu: ikona + název (velkými písmeny), vpravo šipka ↗ nebo vlastní obsah. */
export function hlavickaKarty(ikona, nazev, vpravo) {
  return '<div class="card-hlava"><span class="nadpis">' + ikona + '<span>' + nazev + '</span></span>' +
    (vpravo ? '<span class="vpravo">' + vpravo + '</span>' : '') + '</div>';
}

export function prizpusobVysku(t) {
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 'px';
}

/** Potvrzení před nevratnou akcí (systémové okno). */
export function potvrd(text) { return window.confirm(text); }
