// Hledání (Ctrl K / ⌘ K, na telefonu lupa): při psaní hned v načtené poště, schránce a kalendáři (diakritika nevadí),
// Enter nebo „Hledat v celé poště“ přes motor v celém Gmailu. Rozumí i českým filtrům:
// od: komu: předmět: má:přílohu příloha: je:nepřečtené je:označené ve:odeslané po:1.10.2026 před:31.12.2026

import { stav, prejdi } from './stav.js';
import { volej } from './api.js';
import { esc, kdyKratce, prvniRadek, hhmm, dm, iniciala, odstin, pulnoc, rozdilDni } from './pomocne.js';
import { otevriPanel, zavriAPak, elementPanelu, jeOtevreny } from './panely.js';
import { IKONY } from './ikony.js';
import { vsechnyZpravy, otevriVlakno, otevriPsani, stavTag } from './posta.js';
import { vsechnyPolozky, ukazPolozku, zamerZapis } from './schranka.js';
import { vsechnyUdalosti, otevriUdalost } from './kalendar.js';
import { otevriNastaveni } from './nastaveni.js';

const SIROKE = window.matchMedia('(min-width: 1000px)');
const MAX_SKUPINA = 5;

/** Příkazy a sekce (ukážou se hned, filtrují se textem). */
const PRIKAZY = [
  ['Dnes', 'přehled', 'dnes', () => prejdi('dnes')],
  ['Schránka', 'poznámky a úkoly pro Clauda', 'schranka', () => prejdi('schranka')],
  ['Pošta', 'oba účty', 'posta', () => prejdi('posta')],
  ['Kalendář', 'měsíc, týden, seznam', 'kalendar', () => prejdi('kalendar')],
  ['Nová poznámka pro Clauda', '', 'plus', () => zamerZapis()],
  ['Nový e-mail', '', 'psat', () => otevriPsani('novy')],
  ['Nastavení', 'pošta, kalendáře, vzhled', 'nastaveni', () => otevriNastaveni()]
];

// ---------------------------------------------------------------- český filtr → Gmail

const FILTRY = [
  [/(^|\s)(od|from):/gi, '$1from:'], [/(^|\s)(komu|to):/gi, '$1to:'], [/(^|\s)(předmět|predmet|subject):/gi, '$1subject:'],
  [/(^|\s)(má|ma):(přílohu|prilohu|attachment)/gi, '$1has:attachment'], [/(^|\s)(příloha|priloha|filename):/gi, '$1filename:'],
  [/(^|\s)(je|is):(nepřečtené|neprectene|unread)/gi, '$1is:unread'], [/(^|\s)(je|is):(označené|oznacene|hvězdička|hvezdicka|starred|flagged)/gi, '$1is:starred'],
  [/(^|\s)(ve|in):(odeslané|odeslane|sent)/gi, '$1in:sent'], [/(^|\s)(ve|in):(koš|kos|trash)/gi, '$1in:trash']
];

/** „od:novák má:přílohu po:1.10.2026“ → „from:novák has:attachment after:2026/10/1“ (dotaz pro Gmail). */
export function naGmail(dotaz) {
  let q = String(dotaz || '').trim();
  FILTRY.forEach((f) => { q = q.replace(f[0], f[1]); });
  q = q.replace(/(^|\s)(po|after|před|pred|before):(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/gi, (c, a, slovo, d, m, r) =>
    a + (/^(po|after)$/i.test(slovo) ? 'after:' : 'before:') + r + '/' + Number(m) + '/' + Number(d));
  return q;
}

// ---------------------------------------------------------------- místní hledání

const bezDiakritiky = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Slova dotazu bez filtrů (filtry zná jen Gmail). */
function slovaDotazu(dotaz) {
  return bezDiakritiky(dotaz).split(/\s+/).filter((s) => s && s.indexOf(':') < 0);
}

function odpovida(slova, ...pole) {
  if (!slova.length) return false;
  const text = bezDiakritiky(pole.join(' '));
  return slova.every((s) => text.indexOf(s) >= 0);
}

function polozkaVysledku(atr, ikona, titul, pod, vpravo) {
  return '<li><button type="button" ' + atr + '><span class="ik">' + ikona + '</span>' +
    '<span class="text"><b class="orez-1">' + titul + '</b>' + (pod ? '<small class="orez-1">' + pod + '</small>' : '') + '</span>' + (vpravo || '') + '</button></li>';
}

function skupinaHtml(nazev, polozky) {
  return polozky.length ? '<li class="skupina" role="presentation">' + nazev + '</li>' + polozky.join('') : '';
}

function avatarHtml(jmeno) {
  return '<span class="ik ik--avatar" style="--h:' + odstin(jmeno) + '">' + esc(iniciala(jmeno)) + '</span>';
}

function vysledkyHtml(dotaz) {
  const q = String(dotaz || '').trim();
  const slova = slovaDotazu(q);
  let h = '';
  // pošta (načtená)
  const posta = q ? vsechnyZpravy().filter((m) => odpovida(slova, m.od, m.predmet, m.ukazka)).slice(0, MAX_SKUPINA) : [];
  h += skupinaHtml('Pošta', posta.map((m) => '<li><button type="button" data-h-vlakno="' + esc(m.id) + '">' + avatarHtml(m.od) +
    '<span class="text"><b class="orez-1">' + esc(m.od) + ' · ' + esc(m.predmet) + '</b><small class="orez-1">' + stavTag(m) + ' ' + esc(prvniRadek(m.ukazka, 90)) + '</small></span>' +
    '<small class="vpravo cisla">' + esc(kdyKratce(m.kdy)) + '</small></button></li>'));
  // hledání v celém Gmailu
  if (q) {
    const hl = stav.hledani && stav.hledani.dotaz === q ? stav.hledani : null;
    let gmail = [polozkaVysledku('data-h-gmail', IKONY.hledat, 'Hledat „' + esc(q) + '“ v celé poště', 'všechny složky obou účtů kromě koše a spamu' + (naGmail(q) !== q ? ' · ' + esc(naGmail(q)) : ''))];
    if (hl && hl.nacita) gmail = ['<li class="vysledky__info">Hledám v Gmailu…</li>'];
    else if (hl && hl.chyba) gmail.push('<li class="vysledky__info chyba">' + esc(hl.chyba.message) + '</li>');
    else if (hl && hl.vlakna) {
      gmail = hl.vlakna.length
        ? hl.vlakna.map((m) => '<li><button type="button" data-h-vlakno="' + esc(m.id) + '">' + avatarHtml(m.od) +
            '<span class="text"><b class="orez-1">' + esc(m.od) + ' · ' + esc(m.predmet) + '</b><small class="orez-1">' + esc(prvniRadek(m.ukazka, 90)) + '</small></span>' +
            '<small class="vpravo cisla">' + esc(kdyKratce(m.kdy)) + '</small></button></li>')
        : ['<li class="vysledky__info">V celé poště nic – zkus jiná slova nebo filtr (od:, předmět:, má:přílohu).</li>'];
    }
    h += skupinaHtml(hl && hl.vlakna ? 'V celé poště' : 'Gmail', gmail);
  }
  // schránka
  const schranka = q ? vsechnyPolozky().filter((p) => odpovida(slova, p.shrnuti, p.text)).slice(0, MAX_SKUPINA) : [];
  h += skupinaHtml('Schránka', schranka.map((p) => polozkaVysledku('data-h-polozka="' + esc(p.id) + '"', IKONY.schranka,
    esc(p.shrnuti || prvniRadek(p.text, 80)), esc(kdyKratce(p.kdy)) + (p.termin ? ' · termín ' + esc(p.termin) : ''))));
  // kalendář (načtené měsíce)
  const udalosti = q ? vsechnyUdalosti().filter((u) => odpovida(slova, u.nazev, u.misto, u.kalendar))
    .sort((a, b) => Math.abs(a.zacatek - Date.now()) - Math.abs(b.zacatek - Date.now())).slice(0, MAX_SKUPINA) : [];
  h += skupinaHtml('Kalendář', udalosti.map((u) => {
    const den = pulnoc(u.zacatek);
    const kdy = rozdilDni(den) === 0 ? 'dnes' : rozdilDni(den) === 1 ? 'zítra' : dm(den);
    return polozkaVysledku('data-h-udalost="' + esc(u.id) + '"', IKONY.kalendar, esc(u.nazev),
      esc(kdy + (u.celodenni ? '' : ' ' + hhmm(u.zacatek)) + (u.misto ? ' · ' + u.misto : '')));
  }));
  // sekce a příkazy
  const prikazy = PRIKAZY.map((p, i) => [p, i]).filter((x) => !q || odpovida(slova, x[0][0], x[0][1]));
  h += skupinaHtml(q ? 'Přejít' : 'Přejít a vytvořit', prikazy.map((x) => polozkaVysledku('data-h-prikaz="' + x[1] + '"', IKONY[x[0][2]], esc(x[0][0]), esc(x[0][1]))));
  if (!h) h = '<li class="vysledky__info">Nic nenalezeno.</li>';
  return h;
}

// ---------------------------------------------------------------- panel

export function otevriHledani() {
  if (jeOtevreny('hledat')) { const el = elementPanelu('hledat'); const i = el && el.querySelector('[data-hledat-pole]'); if (i) i.focus(); return; }
  stav.hledani = null;
  otevriPanel({
    id: 'hledat', trida: 'panel-okno panel-hledat', titul: 'Hledat',
    vykresli: () => '<label class="hledat-pole">' + IKONY.hledat +
      '<input type="search" data-hledat-pole placeholder="Pošta, poznámky, události… (od:, předmět:, má:přílohu)" autocomplete="off" ' +
      'autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Hledat"></label>' +
      '<ul class="vysledky" id="hledat-vysledky" role="listbox">' + vysledkyHtml('') + '</ul>' +
      '<p class="napoveda zkratky">' + IKONY.klavesnice + '<span>↑ ↓ výběr · Enter otevřít · Esc zavřít · v Poště j / k, e hotovo, r odpovědět</span></p>',
    poOtevreni: (el) => { const i = el.querySelector('[data-hledat-pole]'); if (i) i.focus(); }
  });
}

function prekresliVysledky() {
  const el = elementPanelu('hledat');
  if (!el) return;
  const pole = el.querySelector('[data-hledat-pole]');
  el.querySelector('#hledat-vysledky').innerHTML = vysledkyHtml(pole ? pole.value : '');
}

function hledejVGmailu(dotaz) {
  const q = String(dotaz || '').trim();
  if (!q) return;
  stav.hledani = { dotaz: q, nacita: true };
  prekresliVysledky();
  volej('hledat', { dotaz: naGmail(q) })
    .then((data) => { if (stav.hledani && stav.hledani.dotaz === q) stav.hledani = { dotaz: q, vlakna: data.vlakna || [] }; })
    .catch((e) => { if (stav.hledani && stav.hledani.dotaz === q) stav.hledani = { dotaz: q, chyba: e }; })
    .then(prekresliVysledky);
}

/** Kliknutí ve výsledcích; vrací true, když ho obsloužilo. */
export function klikHledat(el) {
  const panel = el.closest('[data-panel="hledat"]');
  if (!panel) return false;
  const pole = panel.querySelector('[data-hledat-pole]');
  if (el.hasAttribute('data-h-gmail')) { hledejVGmailu(pole && pole.value); return true; }
  let akce = null;
  if (el.dataset.hVlakno) {
    const id = el.dataset.hVlakno;
    akce = () => { if (SIROKE.matches) prejdi('posta'); otevriVlakno(id); };
  } else if (el.dataset.hPolozka) {
    const id = el.dataset.hPolozka;
    akce = () => ukazPolozku(id);
  } else if (el.dataset.hUdalost) {
    const id = el.dataset.hUdalost;
    akce = () => otevriUdalost(id);
  } else if (el.dataset.hPrikaz) {
    akce = PRIKAZY[Number(el.dataset.hPrikaz)][3];
  }
  if (!akce) return false;
  zavriAPak(akce); // nejdřív zavřít hledání, pak otevřít výsledek (jinak by krok Zpět zavřel ten nový panel)
  return true;
}

export function vstupHledat(e) {
  if (!e.target.matches || !e.target.matches('[data-hledat-pole]')) return false;
  prekresliVysledky();
  return true;
}

/** Šipky a Enter v hledání. */
export function klavesaHledat(e) {
  const panel = e.target.closest && e.target.closest('[data-panel="hledat"]');
  if (!panel) return false;
  const tlacitka = Array.from(panel.querySelectorAll('#hledat-vysledky button'));
  const i = tlacitka.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const dalsi = e.key === 'ArrowDown' ? (i < 0 ? 0 : Math.min(i + 1, tlacitka.length - 1)) : i - 1;
    if (dalsi < 0) panel.querySelector('[data-hledat-pole]').focus();
    else if (tlacitka[dalsi]) tlacitka[dalsi].focus();
    return true;
  }
  if (e.key === 'Enter' && e.target.matches('[data-hledat-pole]')) {
    e.preventDefault();
    if (tlacitka[0]) tlacitka[0].click();
    return true;
  }
  return false;
}
