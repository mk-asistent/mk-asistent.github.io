// Drobné společné kousky rozhraní: oznámení, kostra při načítání, chybová karta, přepínač (segment).

import { esc } from './pomocne.js';
import { IKONY } from './ikony.js';

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

let otevreneOkno = null;
/**
 * Okno uprostřed (vzor CaseDraft): kroužek s ikonou, nadpis, text, šedé řádky, pole, dvě tlačítka.
 * o = { ikona, ton: 'ok'|'pozor'|'nebezpeci', nadpis, text, radky: [[ikona, text, vpravo]], html (vlastní obsah – už ošetřený),
 *       pole: { popisek, hodnota, placeholder, radku (víc řádků = textarea, odeslat Ctrl+Enter) }, siroke (širší okno),
 *       volby: [[hodnota, popisek, odstín?]] + vybrana (klepnutí na volbu vrátí její hodnotu),
 *       ano: 'Smazat', ne: 'Zrušit' (null = bez druhého tlačítka) }
 * Vrací Promise: true / false, s polem napsaný text / null.
 */
export function okno(o) {
  return new Promise((hotovo) => {
    if (otevreneOkno) otevreneOkno(null);
    const pozadi = document.createElement('div');
    pozadi.className = 'okno-pozadi';
    const vstup = o.pole && o.pole.radku > 1
      ? '<textarea class="field" rows="' + o.pole.radku + '" placeholder="' + esc(o.pole.placeholder || '') + '">' + esc(o.pole.hodnota || '') + '</textarea>'
      : o.pole ? '<input class="field" value="' + esc(o.pole.hodnota || '') + '" placeholder="' + esc(o.pole.placeholder || '') + '" autocomplete="off">' : '';
    pozadi.innerHTML = '<div class="okno' + (o.siroke ? ' okno--siroke' : '') + '" role="dialog" aria-modal="true" aria-labelledby="okno-nadpis">' +
      (o.ikona ? '<span class="okno__kruh okno__kruh--' + (o.ton || 'ok') + '">' + o.ikona + '</span>' : '') +
      '<h2 id="okno-nadpis">' + esc(o.nadpis) + '</h2>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
      (o.radky && o.radky.length ? '<ul class="okno__radky">' + o.radky.map((r) => '<li>' + (r[0] || '') + '<span>' + esc(r[1]) + '</span>' +
        (r[2] != null && r[2] !== '' ? '<em>' + esc(r[2]) + '</em>' : '') + '</li>').join('') + '</ul>' : '') +
      (o.html ? '<div class="okno__obsah">' + o.html + '</div>' : '') +
      // volby: klepnutí na jednu rovnou zavře okno a vrátí její hodnotu
      (o.volby ? '<div class="okno__volby">' + o.volby.map((v) => '<button type="button" class="chip" data-okno-volba="' + esc(v[0]) + '" aria-pressed="' +
        (v[0] === o.vybrana) + '"' + (v[2] ? ' style="--h:' + v[2] + '"' : '') + '>' + esc(v[1]) + '</button>').join('') + '</div>' : '') +
      (o.pole ? '<label class="okno__pole"><span class="label">' + esc(o.pole.popisek) + '</span>' + vstup + '</label>' : '') +
      '<div class="okno__akce">' + (o.ne === null ? '' : '<button type="button" class="btn btn--ghost" data-okno="ne">' + esc(o.ne || 'Zrušit') + '</button>') +
      '<button type="button" class="btn btn--cerne' + (o.ton === 'nebezpeci' ? ' btn--cervene' : '') + '" data-okno="ano">' + esc(o.ano || 'OK') + '</button></div></div>';
    document.body.appendChild(pozadi);
    requestAnimationFrame(() => pozadi.classList.add('videt'));
    const pole = pozadi.querySelector('.okno__pole .field');
    const zrus = pole ? null : false;
    const zavri = (vysledek) => {
      document.removeEventListener('keydown', klavesa, true);
      pozadi.classList.remove('videt');
      setTimeout(() => pozadi.remove(), 200);
      otevreneOkno = null;
      hotovo(vysledek);
    };
    const potvrzeno = () => zavri(pole ? (pole.value.trim() || null) : true);
    const klavesa = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zavri(zrus); }
      else if (e.key === 'Enter' && (pole && pole.tagName === 'TEXTAREA' ? (e.ctrlKey || e.metaKey) : true)) { e.preventDefault(); e.stopPropagation(); potvrzeno(); }
    };
    document.addEventListener('keydown', klavesa, true);
    pozadi.addEventListener('click', (e) => {
      e.stopPropagation(); // klepnutí v okně nemají jít do ovládání aplikace pod ním
      const volba = e.target.closest('[data-okno-volba]');
      if (volba) { zavri(volba.dataset.oknoVolba); return; }
      const tlacitko = e.target.closest('[data-okno]');
      if (tlacitko) { if (tlacitko.dataset.okno === 'ano') potvrzeno(); else zavri(zrus); }
      else if (e.target === pozadi) zavri(zrus);
    });
    otevreneOkno = zavri;
    (pole || pozadi.querySelector('[data-okno="ano"]')).focus({ preventScroll: true });
  });
}

/** Potvrzení před nevratnou akcí – v okně ve stylu aplikace (vrací Promise s true/false). */
export function potvrd(text, moznosti) {
  return okno(Object.assign({ ikona: IKONY.pozor, ton: 'pozor', nadpis: text, ano: 'Ano', ne: 'Zrušit' }, moznosti || {}));
}
