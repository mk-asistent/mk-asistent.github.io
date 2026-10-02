// Schránka pro Clauda: poznámky z iPhonu i z aplikace, co čeká na Michala, co dělá Claude, co je vyřízené.
// Aplikace nic nemaže – jen připíše odpověď a soubor přesune (dělá to motor, viz skill asistent-schranka).

import { stav, zmeneno } from './stav.js';
import { volej } from './api.js';
import { esc, kdyKratce, prvniRadek, dm, hhmm, rozdilDni, terminDatum, DNY_KR, uloziste } from './pomocne.js';
import { toast, kostra, chybaHtml, prizpusobVysku } from './ui.js';

const ULOZISTE = 'asistent.data.schranka';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.schranka = v.data;
}

export function nactiSchranku() {
  if (stav.nacita.schranka) return;
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

const ZNACKY = {
  rozhodni: ['tag tag--warn', 'Rozhodni'], ukol: ['tag', 'Tvůj úkol'], napad: ['tag tag--seda', 'Nápad'],
  nove: ['tag tag--fialova', 'U Clauda'], hotovo: ['tag tag--ok', 'Vyřízeno']
};

/** Skupiny schránky v pořadí na stránce: [klíč, název, barva značky v postranním panelu] */
export const SKUPINY = [
  ['rozhodni', 'Rozhodni', 'var(--warn)'], ['ukol', 'Tvoje úkoly', 'var(--accent)'], ['nove', 'U Clauda', 'var(--fialova)'],
  ['napad', 'Nápady na později', 'var(--muted)'], ['hotovo', 'Naposledy vyřízeno', 'var(--ok)']
];

export function skupinyPocty() {
  const pocty = { rozhodni: 0, ukol: 0, napad: 0, nove: 0, hotovo: 0 };
  if (stav.schranka) stav.schranka.nove.concat(stav.schranka.ceka, stav.schranka.hotovo).forEach((p) => { pocty[skupina(p)]++; });
  return pocty;
}

export function seradUkoly(a, b) {
  const ta = terminDatum(a.termin), tb = terminDatum(b.termin);
  if (ta == null && tb == null) return a.kdy - b.kdy;
  if (ta == null) return 1;
  if (tb == null) return -1;
  return ta - tb;
}

/** Co čeká na Michala: jeho úkoly (podle termínu) a rozhodnutí. Nápady na později sem nepatří. */
export function naTebe() {
  const ceka = stav.schranka ? stav.schranka.ceka : [];
  return ceka.filter((p) => skupina(p) !== 'napad').sort((a, b) => {
    const poradi = { ukol: 0, rozhodni: 1 };
    return (poradi[skupina(a)] - poradi[skupina(b)]) || seradUkoly(a, b);
  });
}

/** Nové poznámky, které ještě Claude nezpracoval. */
export function uClauda() {
  return stav.schranka ? stav.schranka.nove.slice().sort((a, b) => b.kdy - a.kdy) : [];
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

  let h = '<li><button type="button" class="radek" data-prepni="' + esc(p.id) + '" aria-expanded="' + otevrena + '">' +
    '<span class="radek-hora"><span class="radek-titul ' + (otevrena ? '' : 'orez-2') + '">' + esc(titul) + '</span>' +
    '<span class="radek-cas cisla">' + esc(kdyKratce(p.kdy)) + '</span></span>' +
    '<span class="radek-pod">' + (kompaktni || sk === 'hotovo' || sk === 'nove' ? '<span class="' + ZNACKY[sk][0] + '">' + ZNACKY[sk][1] + '</span> ' : '') +
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
export function zapisHtml() {
  return '<div class="card zapis"><textarea data-zapis rows="1" placeholder="Poznámka nebo úkol pro Clauda…" enterkeyhint="send" aria-label="Poznámka pro Clauda"></textarea>' +
    '<div class="zapis-paticka"><span class="znaku"></span><button type="button" class="btn btn--primary" data-ulozit disabled>Uložit</button></div></div>';
}

export function vykresliSchranku(el) {
  if (!el.querySelector('#schranka-obsah')) el.innerHTML = zapisHtml() + '<div id="schranka-obsah" class="pohled-sloupec"></div>';
  const obsah = el.querySelector('#schranka-obsah');
  if (!stav.schranka) {
    obsah.innerHTML = '<div class="card">' + (stav.chyby.schranka ? chybaHtml(stav.chyby.schranka, 'data-schranka-znovu') : kostra(4)) + '</div>';
    return;
  }
  const vse = stav.schranka.nove.concat(stav.schranka.ceka, stav.schranka.hotovo);
  const sk = { rozhodni: [], ukol: [], napad: [], nove: [], hotovo: [] };
  vse.forEach((p) => sk[skupina(p)].push(p));
  sk.ukol.sort(seradUkoly);
  sk.rozhodni.sort((a, b) => a.kdy - b.kdy);
  sk.nove.sort((a, b) => b.kdy - a.kdy);

  let h = stav.chyby.schranka ? '<p class="pruh pruh-varovani">' + esc(stav.chyby.schranka.message) + ' Ukazuju naposledy načtené.</p>' : '';
  let neco = false;
  SKUPINY.forEach((s) => {
    const pol = sk[s[0]];
    if (!pol.length) return;
    neco = true;
    h += '<h2 class="skupina-nadpis" id="sk-' + s[0] + '">' + s[1] + '<span class="pocet cisla">' + pol.length + '</span></h2>' +
      '<div class="card"><ul class="seznam">' + pol.map((p) => polozkaHtml(p, false)).join('') + '</ul></div>';
  });
  if (!neco) h += '<div class="card"><div class="prazdne">Schránka je prázdná. Nadiktuj první poznámku.</div></div>';
  obsah.innerHTML = h;
}

// ---------------------------------------------------------------- ovládání

export function klikSchranka(el) {
  if (el.dataset.prepni) {
    stav.otevrene[el.dataset.prepni] = !stav.otevrene[el.dataset.prepni];
    zmeneno();
    return true;
  }
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
      toast('Uloženo do schránky ✓');
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
      toast({ hotovo: 'Hotovo ✓', zahodit: 'Zahozeno', udelej: 'Předáno Claudovi', odpoved: 'Odpověď předána Claudovi' }[jak]);
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
