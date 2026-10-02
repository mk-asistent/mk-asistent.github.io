// Schránka pro Clauda: poznámky z iPhonu i z aplikace, co čeká na Michala, co dělá Claude, co je vyřízené.
// Aplikace připíše odpověď nebo doplnění a soubor přesune, nastaví nadpis a téma; smazání = koš na Disku (30 dní).
// Návrh od Clauda (událost / e-mail z diktátu) se jedním klepnutím otevře předvyplněný – nic se neodešle samo.

import { stav, zmeneno, prejdi, umiMotor } from './stav.js';
import { volej } from './api.js';
import { esc, kdyKratce, prvniRadek, dm, hhmm, rozdilDni, terminDatum, DNY_KR, uloziste, odstin } from './pomocne.js';
import { toast, toastAkce, kostra, chybaHtml, prizpusobVysku, okno, potvrd } from './ui.js';
import { IKONY } from './ikony.js';
import { otevriFormular } from './udalost.js';
import { otevriPsani } from './posta.js';
import { najdiKontakt, nactiKontakty } from './adresy.js';

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

/** Témata poznámek: [klíč, název, odstín štítku]. Claude je přiřazuje při zpracování, Michal je může změnit. */
export const TEMATA = [['prace', 'Práce', 165], ['osobni', 'Osobní', 215], ['fotbal', 'Fotbal', 120], ['zdravi', 'Zdraví', 350],
  ['domov', 'Domov', 32], ['nakup', 'Nákup', 275]];
const TEMA = {};
TEMATA.forEach((t) => { TEMA[t[0]] = t; });

function temaHtml(klic) {
  if (!klic) return '';
  const t = TEMA[klic] || [klic, klic.charAt(0).toUpperCase() + klic.slice(1), odstin(klic)];
  return '<span class="stitek-gmail" style="--h:' + t[2] + '">' + esc(t[1]) + '</span>';
}

/** Nadpis položky: vlastní, jinak shrnutí od Clauda, jinak začátek textu. */
export function nadpis(p) { return p.nadpis || p.shrnuti || prvniRadek(p.text, 140); }

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

/** Čas poslední odpovědi Clauda z hlavičky sekce „## Claude – RRRR-MM-DD HH:MM“ (ms, nebo 0). */
function casOdpovedi(p) {
  const v = p.vlakno.filter((x) => x.kdo === 'Claude').pop();
  const m = v && /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v.kdy || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : 0;
}

/** Vyřízené poznámky, na které Claude odpověděl za posledních n dní (nebo od času „od“) – nejnovější nahoře. */
export function odpovedi(dni, od) {
  const hranice = Math.max(Date.now() - (dni || 7) * 864e5, od || 0);
  return (stav.schranka ? stav.schranka.hotovo : []).map((p) => ({ p, t: casOdpovedi(p) }))
    .filter((x) => x.t >= hranice).sort((a, b) => b.t - a.t).map((x) => x.p);
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
  const titul = nadpis(p);
  const posledniClaude = p.vlakno.filter((v) => v.kdo === 'Claude').pop();
  let pod = '';
  if (!otevrena && sk === 'hotovo' && posledniClaude) pod = '→ ' + prvniRadek(posledniClaude.text, 160);
  else if (!otevrena && sk === 'rozhodni' && posledniClaude) pod = prvniRadek(posledniClaude.text, 160);

  let h = '<li data-polozka-id="' + esc(p.id) + '"><button type="button" class="radek" data-prepni="' + esc(p.id) + '" aria-expanded="' + otevrena + '">' +
    '<span class="radek-hora"><span class="radek-titul ' + (otevrena ? '' : 'orez-2') + '">' + esc(titul) + '</span>' +
    '<span class="radek-cas cisla">' + esc(kdyKratce(p.kdy)) + '</span></span>' +
    '<span class="radek-pod">' + (p.navrh ? '<span class="tag tag--limetka">' + IKONY.claude + 'Návrh: ' + (p.navrh.typ === 'email' ? 'e-mail' : 'událost') + '</span> '
      : kompaktni || sk === 'hotovo' || sk === 'nove' ? '<span class="' + SKUPINA[sk][3] + '">' + SKUPINA[sk][4] + '</span> ' : '') +
    temaHtml(p.tema) + terminZnacka(p) + (pod ? ' <span class="orez-2">' + esc(pod) + '</span>' : '') + '</span>' +
    '</button>';

  if (otevrena) {
    h += '<div class="detail">';
    if (p.navrh) h += navrhHtml(p);
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
      h += '<p class="poznamka-pod">Zpracuju při další schránce (během dne každou půlhodinu).</p>';
    }
    // pro všechny: doplnit, nadpis, téma, smazat
    if (umiMotor('polozkaUpravy')) {
      const tl = (jak, ikona, text) => '<button type="button" class="btn btn--ghost btn--sm" data-polozka-akce="' + jak + '" data-id="' + esc(p.id) + '">' + ikona + '<span>' + text + '</span></button>';
      h += '<div class="akce akce--vedlejsi">' + tl('dopsat', IKONY.psat, sk === 'hotovo' ? 'Navázat' : 'Dopsat') + tl('nadpis', IKONY.stitek, 'Nadpis') +
        tl('tema', IKONY.slozka, 'Téma') + tl('smazat', IKONY.smazat, 'Smazat') + '</div>';
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
  // témata, která ve schránce jsou (filtr se kombinuje se skupinou)
  const temata = {};
  vsechnyPolozky().forEach((p) => { if (p.tema) temata[p.tema] = (temata[p.tema] || 0) + 1; });
  const klice = Object.keys(temata).sort((a, b) => (TEMATA.findIndex((t) => t[0] === a) + 99) % 99 - (TEMATA.findIndex((t) => t[0] === b) + 99) % 99);
  const temataHtml = klice.length ? '<div class="segment segment--temata" role="group" aria-label="Téma">' +
    '<button type="button" class="chip" data-tema-schranky="" aria-pressed="' + !stav.temaSchranky + '">Všechna témata</button>' +
    klice.map((k) => '<button type="button" class="chip chip--tema" style="--h:' + (TEMA[k] ? TEMA[k][2] : odstin(k)) + '" data-tema-schranky="' + esc(k) + '" aria-pressed="' +
      (stav.temaSchranky === k) + '">' + esc(TEMA[k] ? TEMA[k][1] : k) + '<span class="pocet cisla">' + temata[k] + '</span></button>').join('') + '</div>' : '';
  return '<div class="filtry"><div class="segment" role="group" aria-label="Filtr schránky">' +
    volby.filter((v) => v[0] === 'vse' || v[2] || v[0] === stav.filtrSchranky).map((v) =>
      '<button type="button" class="chip" data-filtr-schranky="' + v[0] + '" aria-pressed="' + (stav.filtrSchranky === v[0]) + '">' + esc(v[1]) +
      '<span class="pocet cisla">' + v[2] + '</span></button>').join('') + '</div>' + temataHtml + '</div>';
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
  vsechnyPolozky().filter((p) => !stav.temaSchranky || p.tema === stav.temaSchranky).forEach((p) => sk[skupina(p)].push(p));
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
  if (el.dataset.temaSchranky !== undefined && el.closest('#p-schranka')) { stav.temaSchranky = el.dataset.temaSchranky; zmeneno(); return true; }
  if (el.dataset.polozkaAkce) { upravPolozku(el.dataset.polozkaAkce, el.dataset.id); return true; }
  if (el.dataset.navrh) { pouzijNavrh(el.dataset.navrh); return true; }
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

// ---------------------------------------------------------------- Dopsat, nadpis, téma, smazat

function najdi(id) { return vsechnyPolozky().find((p) => p.id === id) || null; }

/** Položku (vrácenou motorem) vyměnit na místě – bez načítání celé schránky. */
function nahrad(p) {
  if (!stav.schranka || !p) return;
  ['nove', 'ceka', 'hotovo'].forEach((k) => {
    stav.schranka[k] = stav.schranka[k].map((x) => (x.id === p.id ? p : x));
  });
  zmeneno();
}

async function upravPolozku(jak, id) {
  const p = najdi(id);
  if (!p) return;
  try {
    if (jak === 'dopsat') {
      const hotova = p.slozka === 'HOTOVO';
      const text = await okno({ ikona: IKONY.psat, nadpis: hotova ? 'Navázat na vyřízenou poznámku' : 'Dopsat k poznámce',
        text: (hotova ? 'Poznámka se vrátí ke zpracování a ' : '') + 'Claude doplnění vezme jako nový pokyn.',
        pole: { popisek: 'Doplnění', radku: 4, placeholder: 'Co dalšího… (Ctrl+Enter uloží)' }, ano: 'Uložit' });
      if (!text) return;
      await volej('polozka', { id, jak: 'dopsat', text });
      toast('Doplněno – zpracuju při další schránce');
      nactiSchranku();
    } else if (jak === 'nadpis') {
      const text = await okno({ ikona: IKONY.stitek, nadpis: 'Nadpis', text: 'Krátký název, podle kterého poznámku najdeš.',
        pole: { popisek: 'Nadpis', hodnota: nadpis(p), placeholder: 'např. Lešení – objednávka' }, ano: 'Uložit' });
      if (text === null || text === false) return;
      nahrad(await volej('polozka', { id, jak: 'nadpis', text }));
      toast('Nadpis uložen');
    } else if (jak === 'tema') {
      const tema = await okno({ ikona: IKONY.slozka, nadpis: 'Téma', text: 'Podle témat se dá schránka filtrovat.',
        volby: TEMATA.map((t) => [t[0], t[1], t[2]]).concat([['', 'Bez tématu']]), vybrana: p.tema || '', ano: 'Zavřít', ne: null });
      if (typeof tema !== 'string') return;
      nahrad(await volej('polozka', { id, jak: 'tema', text: tema }));
    } else if (jak === 'smazat') {
      if (!(await potvrd('Smazat poznámku?', { ton: 'nebezpeci', ikona: IKONY.smazat, ano: 'Smazat',
        text: 'Přesune se do koše na Disku Google – 30 dní ji tam jde obnovit.' }))) return;
      await volej('polozka', { id, jak: 'smazat' });
      ['nove', 'ceka', 'hotovo'].forEach((k) => { stav.schranka[k] = stav.schranka[k].filter((x) => x.id !== id); });
      delete stav.otevrene[id];
      zmeneno();
      toastAkce('Smazáno', 'Vrátit', () => volej('polozka', { id, jak: 'obnovit' }).then(() => { toast('Vráceno'); nactiSchranku(); })
        .catch((e) => toast(e.message, true)));
    }
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------- návrh od Clauda (událost / e-mail z diktátu)

/** „2026-10-06T10:00“ nebo „2026-10-06“ (místní čas) → ms */
function casNavrhu(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(String(s || ''));
  return m ? new Date(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : null;
}

/** Lidé z návrhu (jména nebo adresy) → { adresy (známé), jmena (neznámá – doplní Michal) } */
function lide(seznam) {
  const adresy = [], jmena = [];
  (Array.isArray(seznam) ? seznam : seznam ? [seznam] : []).forEach((x) => {
    const k = najdiKontakt(x);
    if (k && k.a) adresy.push(k.j ? (k.j.indexOf(',') >= 0 ? '"' + k.j + '"' : k.j) + ' <' + k.a + '>' : k.a);
    else jmena.push(String(x));
  });
  return { adresy, jmena };
}

function navrhHtml(p) {
  const n = p.navrh;
  const radek = (ikona, text) => text ? '<li>' + ikona + '<span>' + esc(text) + '</span></li>' : '';
  let h = '<div class="navrh"><small>' + IKONY.claude + 'Claude navrhuje</small>';
  if (n.typ === 'udalost') {
    const z = casNavrhu(n.zacatek), k = casNavrhu(n.konec);
    const kdy = z == null ? '' : DNY_KR[new Date(z).getDay()] + ' ' + dm(z) + (n.celodenni ? ' · celý den' : ' · ' + hhmm(z) + (k ? '–' + hhmm(k) : ''));
    h += '<b>' + esc(n.nazev || 'Událost') + '</b><ul>' + radek(IKONY.kalendar, kdy) + radek(IKONY.misto, n.misto) +
      radek(IKONY.pozvat, (n.hoste || []).length ? 'Pozvat: ' + n.hoste.join(', ') : '') + radek(IKONY.info, n.popis) + '</ul>' +
      '<button type="button" class="btn btn--sm" data-navrh="' + esc(p.id) + '">' + IKONY.kalendar + '<span>Založit událost</span></button>';
  } else {
    h += '<b>' + esc(n.predmet || 'E-mail') + '</b><ul>' + radek(IKONY.lide, (n.komu ? [].concat(n.komu) : []).join(', ')) +
      radek(IKONY.posta, n.text ? prvniRadek(n.text, 160) : '') + '</ul>' +
      '<button type="button" class="btn btn--sm" data-navrh="' + esc(p.id) + '">' + IKONY.psat + '<span>Napsat e-mail</span></button>';
  }
  return h + '<p>Otevře se předvyplněné – nic se neodešle, dokud to nepotvrdíš.</p></div>';
}

/** Otevře formulář události / psaní předvyplněné z návrhu; po uložení / odeslání je položka vyřízená. */
function pouzijNavrh(id) {
  const p = najdi(id);
  if (!p || !p.navrh) return;
  nactiKontakty();
  const n = p.navrh;
  const hotovo = (text) => volej('polozka', { id, jak: 'hotovo', text }).then(() => nactiSchranku()).catch((e) => toast(e.message, true));
  if (n.typ === 'udalost') {
    const l = lide(n.hoste);
    const z = casNavrhu(n.zacatek);
    otevriFormular({
      navrh: { nazev: n.nazev || nadpis(p), zacatek: z, konec: casNavrhu(n.konec), celodenni: !!n.celodenni, misto: n.misto || '',
        popis: [n.popis || '', l.jmena.length ? 'Pozvat (doplnit adresu): ' + l.jmena.join(', ') : ''].filter(Boolean).join('\n'),
        hoste: l.adresy.map((a) => (/<([^>]+)>/.exec(a) || [0, a])[1]), pozvat: n.pozvat !== false },
      poUlozeni: (data) => hotovo('Událost založena: ' + data.nazev + ', ' + DNY_KR[new Date(data.zacatek).getDay()] + ' ' + dm(data.zacatek) +
        (data.celodenni ? '' : ' ' + hhmm(data.zacatek)) + (data.hoste && data.hoste.length ? ' · pozváno ' + data.hoste.length : ''))
    });
  } else {
    const l = lide(n.komu);
    otevriPsani('novy', {
      komu: l.adresy.concat(l.jmena).join(', '), predmet: n.predmet || '', text: n.text || '', ucet: n.ucet === 'pracovni' ? 'pracovni' : 'osobni',
      poOdeslani: () => hotovo('E-mail odeslán: ' + (n.predmet || '(bez předmětu)'))
    });
  }
}
