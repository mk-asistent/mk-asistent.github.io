// Docházka dorostu z Týmuj (přes web dorostu → motor): u tréninků a zápasů dorostu v kalendáři kolik přišlo, kdo se omluvil,
// kdo chyběl bez omluvy. Jen proběhlé akce (Týmuj synchronizace na webu dorostu ukládá minulost); texty omluv se nepředávají.

import { stav, zmeneno, umiMotor, hooky } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, isoDatum } from './pomocne.js';
import { IKONY } from './ikony.js';

const ULOZISTE = 'asistent.data.dochazka';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.dochazka = v.data;
}

export function nactiDochazku(znovu) {
  if (!umiMotor('dochazka') || stav.nacita.dochazka) return Promise.resolve();
  stav.nacita.dochazka = true;
  return volej('dochazka', { znovu: !!znovu })
    .then((d) => { stav.dochazka = d; stav.chyby.dochazka = null; uloziste.pis(ULOZISTE, { data: d, kdy: Date.now() }); })
    .catch((e) => { stav.chyby.dochazka = e; })
    .then(() => { stav.nacita.dochazka = false; zmeneno(); });
}

export function dotahni() {
  if (umiMotor('dochazka') && !stav.dochazka && !stav.nacita.dochazka && !stav.chyby.dochazka) nactiDochazku();
}

/** Akce z Týmuj ke kalendářní události dorostu: stejný den, trénink (T_…) k tréninku, zápas (Z_…) k zápasu. */
export function akceKUdalosti(u) {
  const d = stav.dochazka;
  if (!d || !u || u.konec > Date.now() + 36e5) return null;
  const text = (u.nazev || '') + ' ' + (u.kalendar || '');
  if (!/dorost/i.test(text)) return null;
  const zapas = /^⚽|zápas/i.test(u.nazev || '');
  const den = isoDatum(u.zacatek);
  return (d.udalosti || []).find((a) => !a.zruseno && isoDatum(Date.parse(a.zacatek)) === den && (zapas ? /^Z/.test(a.druh) : /^T/.test(a.druh))) || null;
}

/** Krátký údaj do bloku události v týdnu: „18/21“. */
export function kratce(u) {
  const a = akceKUdalosti(u);
  return a ? a.pocty.prislo + '/' + a.pocty.pozvano : '';
}

function detailHtml(u) {
  const a = akceKUdalosti(u);
  if (!a) return '';
  const p = a.pocty;
  const casti = ['přišlo <b>' + p.prislo + ' z ' + p.pozvano + '</b>'];
  if (p.omluveno) casti.push('omluveno ' + p.omluveno);
  if (p.neomluveno) casti.push('<span class="dochazka-chybi">neomluveno ' + p.neomluveno + '</span>');
  if (p.mozna) casti.push('možná ' + p.mozna);
  if (p.bez) casti.push('bez odpovědi ' + p.bez);
  return '<div class="dochazka-detail"><p class="udalost-radek">' + IKONY.lide + '<span>Docházka (Týmuj): ' + casti.join(' · ') + '</span></p>' +
    (a.neomluveni.length ? '<p class="dochazka-jmena"><b>Bez omluvy:</b> ' + esc(a.neomluveni.join(', ')) + '</p>' : '') +
    (a.omluveni.length ? '<p class="dochazka-jmena"><b>Omluveni:</b> ' + esc(a.omluveni.join(', ')) + '</p>' : '') + '</div>';
}

hooky.dochazkaUdalosti = detailHtml;
hooky.dochazkaKratce = kratce;
