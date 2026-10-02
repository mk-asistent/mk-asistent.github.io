// Našeptávač adres: lidé, kterým jsi za poslední rok psal (motor: akce kontakty) – pole Komu v psaní e-mailu
// a Hosté u události. Píše se jméno nebo začátek adresy, šipky + Enter vybírají, Esc zavře.

import { stav, umiMotor } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, rozdelAdresy } from './pomocne.js';

const ULOZISTE = 'asistent.data.kontakty';
const PLATNOST = 12 * 36e5;
let nacita = false;

export function nactiKontakty() {
  if (stav.kontakty || nacita) return;
  const ulozene = uloziste.cti(ULOZISTE);
  if (ulozene && ulozene.data) stav.kontakty = ulozene.data;
  if ((ulozene && Date.now() - ulozene.kdy < PLATNOST) || !umiMotor('kontakty')) return;
  nacita = true;
  volej('kontakty')
    .then((data) => { stav.kontakty = data || []; uloziste.pis(ULOZISTE, { data: stav.kontakty, kdy: Date.now() }); })
    .catch(() => { /* bez našeptávače se dá psát dál */ })
    .then(() => { nacita = false; });
}

const bezDiakritiky = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Rozepsaná poslední adresa v poli (za poslední čárkou / středníkem mimo uvozovky). */
function rozepsane(hodnota) {
  const casti = rozdelAdresy(hodnota);
  const konciOddelovacem = /[,;]\s*$/.test(hodnota);
  return konciOddelovacem ? '' : (casti[casti.length - 1] || '').trim();
}

/** Návrhy pro rozepsaný text: shoda na začátku slova jména nebo adresy, častější kontakty dřív. */
export function navrhy(hodnota, max) {
  const hledam = bezDiakritiky(rozepsane(hodnota));
  if (!stav.kontakty || hledam.length < 2) return [];
  const uz = bezDiakritiky(hodnota);
  return stav.kontakty.filter((k) => {
    if (uz.indexOf(k.a.toLowerCase()) >= 0) return false; // už je v poli
    const slova = (bezDiakritiky(k.j) + ' ' + k.a.toLowerCase()).split(/[\s.@_<>-]+/);
    return slova.some((s) => s.indexOf(hledam) === 0) || k.a.toLowerCase().indexOf(hledam) === 0;
  }).slice(0, max || 6);
}

/** Dosadí vybraný kontakt místo rozepsaného textu; jenAdresa = pole hostů (jen adresy). */
export function dosad(hodnota, k, jenAdresa) {
  const casti = rozdelAdresy(hodnota);
  if (!/[,;]\s*$/.test(hodnota) && casti.length) casti.pop();
  const novy = jenAdresa || !k.j ? k.a : (/[,;"<>]/.test(k.j) ? '"' + k.j.replace(/"/g, '') + '"' : k.j) + ' <' + k.a + '>';
  return casti.concat(novy).join(', ') + ', ';
}

// ---------------------------------------------------------------- rozbalovací seznam pod polem

let aktivni = null; // { pole, navrhy, vybrany }

function zavri() {
  const el = document.getElementById('naseptavac');
  if (el) el.remove();
  aktivni = null;
}

function ukaz(pole, seznam) {
  let el = document.getElementById('naseptavac');
  if (!seznam.length) { if (el) el.remove(); aktivni = null; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'naseptavac';
    el.className = 'naseptavac';
    el.setAttribute('role', 'listbox');
    document.body.appendChild(el);
    // klepnutí do seznamu nesmí vzít poli fokus dřív, než se vybere
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kontakt]');
      if (b && aktivni) vyber(Number(b.dataset.kontakt));
    });
  }
  aktivni = { pole, navrhy: seznam, vybrany: 0 };
  el.innerHTML = seznam.map((k, i) => '<button type="button" role="option" data-kontakt="' + i + '" aria-selected="' + (i === 0) + '">' +
    '<b>' + esc(k.j || k.a) + '</b>' + (k.j ? '<small>' + esc(k.a) + '</small>' : '') + '</button>').join('');
  const r = pole.getBoundingClientRect();
  el.style.left = Math.max(8, r.left) + 'px';
  el.style.top = (r.bottom + 4) + 'px';
  el.style.width = Math.min(r.width, window.innerWidth - 16) + 'px';
}

function vyber(i) {
  if (!aktivni) return;
  const k = aktivni.navrhy[i];
  const pole = aktivni.pole;
  if (!k) return;
  pole.value = dosad(pole.value, k, pole.hasAttribute('data-jen-adresy'));
  pole.dispatchEvent(new Event('input', { bubbles: true }));
  zavri();
  pole.focus();
}

/** Volat z posluchače „input“: pole s atributem data-naseptavac dostane návrhy. Vrací true, když pole patří sem. */
export function vstupAdresy(e) {
  const pole = e.target;
  if (!pole.matches || !pole.matches('[data-naseptavac]')) return false;
  nactiKontakty();
  ukaz(pole, navrhy(pole.value));
  return false; // ostatní posluchači (koncept e-mailu) běží dál
}

/** Šipky, Enter, Tab a Esc v poli s návrhy. Vrací true, když klávesu použil. */
export function klavesaAdresy(e) {
  if (!aktivni || e.target !== aktivni.pole) return false;
  const el = document.getElementById('naseptavac');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    aktivni.vybrany = (aktivni.vybrany + (e.key === 'ArrowDown' ? 1 : -1) + aktivni.navrhy.length) % aktivni.navrhy.length;
    if (el) el.querySelectorAll('[data-kontakt]').forEach((b, i) => b.setAttribute('aria-selected', String(i === aktivni.vybrany)));
    e.preventDefault();
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); vyber(aktivni.vybrany); return true; }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zavri(); return true; }
  return false;
}

document.addEventListener('focusout', (e) => { if (aktivni && e.target === aktivni.pole) setTimeout(zavri, 120); });
window.addEventListener('resize', () => { if (aktivni) zavri(); });
export function zavriNaseptavac() { zavri(); }
