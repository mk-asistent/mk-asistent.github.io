// Schránka pro Clauda: poznámky z iPhonu i z aplikace, co čeká na Michala, co dělá Claude, co je vyřízené.
// Aplikace nic nemaže – jen připíše odpověď a soubor přesune (dělá to motor, viz skill asistent-schranka).

import { stav, zmeneno, prejdi } from './stav.js';
import { volej } from './api.js';
import { esc, kdyKratce, prvniRadek, dm, hhmm, rozdilDni, terminDatum, DNY_KR, uloziste } from './pomocne.js';
import { toast, kostra, chybaHtml, prizpusobVysku } from './ui.js';

const ULOZISTE = 'asistent.data.schranka';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.schranka = v.data;
}

export function nactiSchranku() {
  if (stav.nacita.schranka) return Promise.resolve();
  stav.nacita.schranka = true;
  stav.chyby.schranka = null;
  zmeneno();
  return volej('schranka')
    .then((data) => {
      stav.schranka = data;
      uloziste.pis(ULOZISTE, { data, kdy: Date.now() });
    })
    .catch((e) => { stav.chyby.schranka = e; })
    .then(() => { stav.nacita.schranka = false; zmeneno(); });
}

// ---------------------------------------------------------------- zařazení

export function skupina(p) {
  if (p.slozka === 'NOVE') return 'nove';
  if (p.slozka === 'HOTOVO') return 'hotovo';
  const s = (p.stav || '').toLowerCase();
  if (s.indexOf('ukol') >= 0) return 'ukol';
  if (s.indexOf('napad') >= 0) return 'napad';
  return 'rozhodni';
}

/** Skupiny v pořadí na stránce: [klíč, název, barva (graf, legenda), třída štítku, krátký štítek, název filtru] */
export const SKUPINY = [
  ['ukol', 'Tvoje úkoly', 'var(--tmava)', 'tag', 'Tvůj úkol', 'Úkoly'],
  ['rozhodni', 'Rozhodni', 'var(--oranz)', 'tag tag--danger', 'Rozhodni', 'Rozhodni'],
  ['nove', 'U Clauda', 'var(--fialova)', 'tag tag--fialova', 'U Clauda', 'U Clauda'],
  ['napad', 'Nápady na později', 'var(--sand-2)', 'tag tag--seda', 'Nápad', 'Nápady'],
  ['hotovo', 'Naposledy vyřízeno', 'var(--ok)', 'tag tag--ok', 'Vyřízeno', 'Vyřízeno']
];
const SKUPINA = {};
SKUPINY.forEach((s) => { SKUPINA[s[0]] = s; });

export function vsechnyPolozky() {
  return stav.schranka ? stav.schranka.nove.concat(stav.schranka.ceka, stav.schranka.hotovo) : [];
}

export function skupinyPocty() {
  const pocty = { rozhodni: 0, ukol: 0, napad: 0, nove: 0, hotovo: 0 };
  vsechnyPolozky().forEach((p) => { pocty[skupina(p)]++; });
  return pocty;
}

export function seradUkoly(a, b) {
  const ta = terminDatum(a.termin), tb = terminDatum(b.termin);
  if (ta == null && tb == null) return a.kdy - b.kdy;
  if (ta == null) return 1;
  if (tb == null) return -1;
  return ta - tb;
}

/** Co čeká na Michala: jeho úkoly a rozhodnutí (nápady na později sem nepatří).
 *  Nahoře po termínu a dnešní, pak rozhodnutí, pak ostatní úkoly podle termínu. */
export function naTebe() {
  const ceka = stav.schranka ? stav.schranka.ceka : [];
  const naleha = (p) => { const t = terminDatum(p.termin); return t != null && rozdilDni(t) <= 0 ? 0 : skupina(p) === 'rozhodni' ? 1 : 2; };
  return ceka.filter((p) => skupina(p) !== 'napad').sort((a, b) => (naleha(a) - naleha(b)) || seradUkoly(a, b));
}

/** Nové poznámky, které ještě Claude nezpracoval. */
export function uClauda() {
  return stav.schranka ? stav.schranka.nove.slice().sort((a, b) => b.kdy - a.kdy) : [];
}

/** Počty pro přehled: kolik je po termínu a kolik na dnes. */
export function terminy() {
  const r = { poTerminu: 0, dnes: 0 };
  naTebe().forEach((p) => {
    const t = terminDatum(p.termin);
    if (t == null) return;
    const d = rozdilDni(t);
    if (d < 0) r.poTerminu++;
    else if (d === 0) r.dnes++;
  });
  return r;
}

function terminZnacka(p) {
  const t = terminDatum(p.termin);
  if (t == null) return '';
  const r = rozdilDni(t);
  if (r < 0) return '<span class="tag tag--danger">po termínu · ' + dm(t) + '</span>';
  if (r === 0) return '<span class="tag tag--warn">dnes</span>';
  if (r === 1) return '<span class="tag">zítra</span>';
  return '<span class="tag tag--seda">' + DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + '</span>';
}

// ---------------------------------------------------------------- vykreslení

export function polozkaHtml(p, kompaktni) {
  const sk = skupina(p);
  const otevrena = !!stav.otevrene[p.id];
  const titul = p.shrnuti || prvniRadek(p.text, 140);
  const posledniClaude = p.vlakno.filter((v) => v.kdo === 'Claude').pop();
  let pod = '';
  if (!otevrena && sk === 'hotovo' && posledniClaude) pod = '→ ' + prvniRadek(posledniClaude.text, 160);
  else if (!otevrena && sk === 'rozhodni' && posledniClaude) pod = prvniRadek(posledniClaude.text, 160);

  let h = '<li data-polozka-id="' + esc(p.id) + '"><button type="button" class="radek" data-prepni="' + esc(p.id) + '" aria-expanded="' + otevrena + '">' +
    '<span class="radek-hora"><span class="radek-titul ' + (otevrena ? '' : 'orez-2') + '">' + esc(titul) + '</span>' +
    '<span class="radek-cas cisla">' + esc(kdyKratce(p.kdy)) + '</span></span>' +
    '<span class="radek-pod">' + (kompaktni || sk === 'hotovo' || sk === 'nove' ? '<span class="' + SKUPINA[sk][3] + '">' + SKUPINA[sk][4] + '</span> ' : '') +
    terminZnacka(p) + (pod ? ' <span class="orez-2">' + esc(pod) + '</span>' : '') + '</span>' +
    '</button>';

  if (otevrena) {
    h += '<div class="detail">';
    h += '<div class="bublina b-michal"><span class="kdo">Ty · ' + esc(dm(p.kdy) + ' ' + hhmm(p.kdy)) + (p.odkud ? ' · ' + esc(p.odkud) : '') + '</span>' + esc(p.text) + '</div>';
    p.vlakno.forEach((v) => {
      h += '<div class="bublina ' + (v.kdo === 'Claude' ? 'b-claude' : 'b-michal') + '"><span class="kdo">' +
        (v.kdo === 'Claude' ? 'Claude' : 'Ty') + (v.kdy ? ' · ' + esc(v.kdy) : '') + '</span>' + esc(v.text) + '</div>';
    });
    if (sk === 'rozhodni') {
      h += '<textarea class="odpoved" data-odpoved="' + esc(p.id) + '" rows="2" placeholder="Odpověď pro Clauda…"></textarea>' +
        '<div class="akce"><button type="button" class="btn btn--ghost" data-polozka="udelej" data-id="' + esc(p.id) + '">Udělej to</button>' +
        '<button type="button" class="btn btn--primary" data-polozka="odpoved" data-id="' + esc(p.id) + '">Odeslat odpověď</button></div>';
    } else if (sk === 'ukol') {
      h += '<div class="akce"><button type="button" class="btn btn--primary" data-polozka="hotovo" data-id="' + esc(p.id) + '">Hotovo</button></div>';
    } else if (sk === 'napad') {
      h += '<div class="akce"><button type="button" class="btn btn--ghost" data-polozka="zahodit" data-id="' + esc(p.id) + '">Zahodit</button>' +
        '<button type="button" class="btn btn--primary" data-polozka="udelej" data-id="' + esc(p.id) + '">Udělej to</button></div>';
    } else if (sk === 'nove') {
      h += '<p class="poznamka-pod">Zpracuju při další „zpracuj schránku“ (ráno nebo když o to požádáš).</p>';
    }
    h += '</div>';
  }
  return h + '</li>';
}

/** Pole pro zápis poznámky – vytváří se jednou, překreslování ho nemaže. */
export function zapisHtml(bezKarty) {
  return '<div class="' + (bezKarty ? '' : 'card ') + 'zapis"><textarea data-zapis rows="1" placeholder="Poznámka nebo úkol pro Clauda…" enterkeyhint="send" aria-label="Poznámka pro Clauda"></textarea>' +
    '<div class="zapis-paticka"><span class="znaku"></span><button type="button" class="btn btn--primary" data-ulozit disabled>Uložit</button></div></div>';
}

/** Skok na pole pro poznámku (tlačítko „Poznámka pro Clauda“, hledání). */
export function zamerZapis() {
  if (stav.pohled !== 'dnes' && stav.pohled !== 'schranka') prejdi('schranka');
  setTimeout(() => {
    const pole = document.querySelector('#p-' + stav.pohled + ' [data-zapis]');
    if (pole) { pole.scrollIntoView({ block: 'center' }); pole.focus(); }
  }, 30);
}

/** Otevře položku ve Schránce (z hledání). */
export function ukazPolozku(id) {
  stav.filtrSchranky = 'vse';
  stav.otevrene[id] = true;
  prejdi('schranka');
  zmeneno();
  setTimeout(() => {
    const li = Array.from(document.querySelectorAll('#p-schranka [data-polozka-id]')).find((x) => x.dataset.polozkaId === id);
    if (li) li.scrollIntoView({ block: 'center' });
  }, 30);
}

function filtryHtml(pocty) {
  const volby = [['vse', 'Vše', vsechnyPolozky().length]].concat(SKUPINY.map((s) => [s[0], s[5], pocty[s[0]]]));
  return '<div class="filtry"><div class="segment" role="group" aria-label="Filtr schránky">' +
    volby.filter((v) => v[0] === 'vse' || v[2] || v[0] === stav.filtrSchranky).map((v) =>
      '<button type="button" class="chip" data-filtr-schranky="' + v[0] + '" aria-pressed="' + (stav.filtrSchranky === v[0]) + '">' + esc(v[1]) +
      '<span class="pocet cisla">' + v[2] + '</span></button>').join('') + '</div></div>';
}

export function vykresliSchranku(el) {
  if (!el.querySelector('#schranka-obsah')) {
    el.innerHTML = zapisHtml() + '<div id="schranka-filtry"></div><div id="schranka-obsah" class="pohled"></div>';
  }
  const obsah = el.querySelector('#schranka-obsah');
  if (!stav.schranka) {
    el.querySelector('#schranka-filtry').innerHTML = '';
    obsah.innerHTML = '<div class="card">' + (stav.chyby.schranka ? chybaHtml(stav.chyby.schranka, 'data-schranka-znovu') : kostra(4)) + '</div>';
    return;
  }
  const sk = { rozhodni: [], ukol: [], napad: [], nove: [], hotovo: [] };
  vsechnyPolozky().forEach((p) => sk[skupina(p)].push(p));
  sk.ukol.sort(seradUkoly);
  sk.rozhodni.sort((a, b) => a.kdy - b.kdy);
  sk.nove.sort((a, b) => b.kdy - a.kdy);
  const pocty = {};
  Object.keys(sk).forEach((k) => { pocty[k] = sk[k].length; });
  el.querySelector('#schranka-filtry').innerHTML = filtryHtml(pocty);

  let h = stav.chyby.schranka ? '<p class="pruh pruh-varovani">' + esc(stav.chyby.schranka.message) + ' Ukazuju naposledy načtené.</p>' : '';
  let neco = false;
  SKUPINY.forEach((s) => {
    const pol = sk[s[0]];
    if (!pol.length || (stav.filtrSchranky !== 'vse' && stav.filtrSchranky !== s[0])) return;
    neco = true;
    h += '<section class="skupina"><h2 class="skupina-nadpis" id="sk-' + s[0] + '"><i class="znacka" style="--b:' + s[2] + '"></i>' + s[1] +
      '<span class="pocet cisla">' + pol.length + '</span></h2>' +
      '<div class="card"><ul class="seznam">' + pol.map((p) => polozkaHtml(p, false)).join('') + '</ul></div></section>';
  });
  if (!neco) h += '<div class="card"><div class="prazdne">' + (stav.filtrSchranky === 'vse' ? 'Schránka je prázdná. Nadiktuj první poznámku.' : 'Tady nic není.') + '</div></div>';
  obsah.innerHTML = h;
}

// ---------------------------------------------------------------- ovládání

export function klikSchranka(el) {
  if (el.dataset.prepni) {
    stav.otevrene[el.dataset.prepni] = !stav.otevrene[el.dataset.prepni];
    zmeneno();
    return true;
  }
  if (el.dataset.filtrSchranky && el.closest('#p-schranka')) { stav.filtrSchranky = el.dataset.filtrSchranky; zmeneno(); return true; }
  if (el.hasAttribute('data-ulozit')) {
    const pole = el.closest('.zapis').querySelector('[data-zapis]');
    const text = pole.value.trim();
    if (!text) return true;
    el.disabled = true;
    volej('poznamka', { text }).then((p) => {
      pole.value = '';
      prizpusobVysku(pole);
      el.closest('.zapis').querySelector('.znaku').textContent = '';
      if (stav.schranka) stav.schranka.nove.unshift(p);
      zmeneno();
      toast('Uloženo do schránky');
    }).catch((e) => {
      el.disabled = false;
      toast('Neuloženo – ' + e.message, true);
    });
    return true;
  }
  if (el.dataset.polozka) {
    const jak = el.dataset.polozka, id = el.dataset.id;
    let text = '';
    if (jak === 'odpoved') {
      // položka může být rozbalená ve dvou pohledech naráz – brát pole z té, kde se kliklo
      const ta = el.closest('li').querySelector('[data-odpoved]');
      text = ta ? ta.value.trim() : '';
      if (!text) { if (ta) ta.focus(); return true; }
    }
    el.disabled = true;
    volej('polozka', { id, jak, text }).then(() => {
      delete stav.otevrene[id];
      toast({ hotovo: 'Hotovo', zahodit: 'Zahozeno', udelej: 'Předáno Claudovi', odpoved: 'Odpověď předána Claudovi' }[jak]);
      return nactiSchranku();
    }).catch((e) => { el.disabled = false; toast(e.message, true); });
    return true;
  }
  if (el.hasAttribute('data-schranka-znovu')) { nactiSchranku(); return true; }
  return false;
}

export function vstupSchranka(e) {
  const t = e.target;
  if (!t.matches || !t.matches('[data-zapis]')) return false;
  prizpusobVysku(t);
  const zapis = t.closest('.zapis');
  zapis.querySelector('[data-ulozit]').disabled = !t.value.trim();
  const n = t.value.length;
  zapis.querySelector('.znaku').textContent = n > 200 ? n + ' znaků' : '';
  return true;
}
