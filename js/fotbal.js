// Fotbal: zápasy našich týmů z fotbal.cz (nástroj v Chromu → schránka → motor) – poslední výsledky, další zápasy
// a převod vybraných týmů do kalendářů Google („⚽ A-tým“…). Kalendář pak ukazuje zápasy všude (Dnes, týden, Zdraví).

import { stav, zmeneno, umiMotor, hooky } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, hhmm, DNY_KR, rozdilDni, kdyKratce, klub } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, hlavickaKarty } from './ui.js';

const ULOZISTE = 'asistent.data.fotbal';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.fotbal = v.data;
}

export function nactiFotbal() {
  if (!umiMotor('fotbal') || stav.nacita.fotbal) return Promise.resolve();
  stav.nacita.fotbal = true;
  stav.chyby.fotbal = null;
  return volej('fotbal')
    .then((data) => {
      // lehká odpověď (bez tabulek) nepřepíše plná data stránky Fotbal, když se od té doby nic nezměnilo
      const stary = stav.fotbal && stav.fotbal.data;
      if (stary && stary.tabulky && data && data.data && !data.data.tabulky && data.data.aktualizovano === stary.aktualizovano) {
        data.data.tabulky = stary.tabulky;
        data.data.detaily = Object.assign({}, stary.detaily, data.data.detaily);
      }
      stav.fotbal = data;
      uloziste.pis(ULOZISTE, { data, kdy: Date.now() });
      // motor při změně dat sám obnovil kalendáře → načíst je znovu
      if (data && data.kalendar && (data.kalendar.pridano || data.kalendar.upraveno) && hooky.obnovKalendar) hooky.obnovKalendar();
    })
    .catch((e) => { stav.chyby.fotbal = e; })
    .then(() => { stav.nacita.fotbal = false; zmeneno(); });
}

export function dotahni() {
  if (umiMotor('fotbal') && !stav.fotbal && !stav.nacita.fotbal && !stav.chyby.fotbal) nactiFotbal();
}

function data() { return stav.fotbal && stav.fotbal.data; }
export function maData() { return !!(data() && data().zapasy && data().zapasy.length); }

const cas = (z) => Date.parse(z.zacatek);
function souper(z) { return klub(z.doma ? z.hoste : z.domaci); }
/** Výhra / remíza / prohra z pohledu našeho týmu. */
function vrp(z) {
  const m = /^(\d+)\s*:\s*(\d+)/.exec(z.vysledek || '');
  if (!m) return '';
  const my = +(z.doma ? m[1] : m[2]), oni = +(z.doma ? m[2] : m[1]);
  return my > oni ? 'V' : my < oni ? 'P' : 'R';
}
function kdy(t) {
  const r = rozdilDni(t);
  return (r === 0 ? 'dnes' : r === 1 ? 'zítra' : r === -1 ? 'včera' : DNY_KR[new Date(t).getDay()] + ' ' + dm(t)) + ' ' + hhmm(t);
}

/** Pro každý tým: poslední odehraný zápas s výsledkem a nejbližší další. */
export function prehled() {
  const d = data();
  if (!d) return [];
  const ted = Date.now();
  return (d.tymy || []).map((t) => {
    const zapasy = d.zapasy.filter((z) => z.tym === t.klic).sort((a, b) => cas(a) - cas(b));
    const posledni = zapasy.filter((z) => z.vysledek && cas(z) < ted).pop() || null;
    const dalsi = zapasy.find((z) => cas(z) + 2 * 36e5 > ted && !z.vysledek) || null;
    return { tym: t, posledni, dalsi };
  });
}

/** Nejbližší zápas klubu (kterýkoli tým) do n dní: { zacatek, nazev } – pro „Další zápas“, když v kalendáři není. */
export function dalsiZapasKlubu(dni) {
  const d = data();
  if (!d) return null;
  const ted = Date.now();
  const z = d.zapasy.filter((x) => !x.vysledek && cas(x) + 2 * 36e5 > ted && cas(x) < ted + (dni || 14) * 864e5).sort((a, b) => cas(a) - cas(b))[0];
  if (!z) return null;
  const t = (d.tymy || []).find((x) => x.klic === z.tym);
  const nas = klub(d.klub || '');
  return { zacatek: cas(z), nazev: (z.doma ? nas + ' – ' + souper(z) : souper(z) + ' – ' + nas) + (t ? ' (' + t.nazev + ')' : '') };
}

/** Výsledky zápasů odehraných od posledního otevření (pro „Co je nového“): [{ text, vrp }] */
export function noveVysledky(od) {
  const d = data();
  if (!d) return [];
  const nas = klub(d.klub || '');
  return d.zapasy.filter((z) => z.vysledek && cas(z) + 2 * 36e5 > od && cas(z) < Date.now()).map((z) => {
    const t = (d.tymy || []).find((x) => x.klic === z.tym);
    return { text: (t ? t.nazev + ': ' : '') + (z.doma ? nas + ' – ' + souper(z) : souper(z) + ' – ' + nas) + ' ' + z.vysledek, vrp: vrp(z) };
  });
}

/** Karta Fotbal na Dnes: řádek na tým – poslední výsledek (V/R/P) a další zápas. */
export function kartaDnesHtml() {
  const p = prehled();
  if (!p.length) return '';
  const d = data();
  return hlavickaKarty(IKONY.zapas, 'Fotbal · ' + esc(klub(d.klub || '')), (hooky.reelyTlacitko ? hooky.reelyTlacitko('chip chip--mala') : '') +
    '<span class="muted small">' + esc(kdyKratce(Date.parse(d.aktualizovano) || 0)) + '</span>' +
    '<button type="button" class="sipka" data-cil="fotbal" aria-label="Tabulky a zápasy" title="Tabulky a zápasy">' + IKONY.sipka + '</button>') +
    '<ul class="fotbal-tymy">' + p.map((x) => {
      const v = x.posledni ? vrp(x.posledni) : '';
      return '<li><b class="fotbal-tym" style="--b:' + esc(x.tym.barva || 'var(--accent)') + '">' + esc(x.tym.nazev) + '</b>' +
        (x.posledni ? '<span class="fotbal-vysledek fotbal-vysledek--' + v + '" title="' + esc(x.posledni.domaci + ' – ' + x.posledni.hoste) + '">' +
          '<i>' + v + '</i>' + esc(x.posledni.vysledek) + ' ' + esc(souper(x.posledni)) + '</span>' : '<span class="fotbal-vysledek">–</span>') +
        (x.dalsi ? '<span class="fotbal-dalsi">' + esc(kdy(cas(x.dalsi))) + ' · ' + esc(souper(x.dalsi)) + ' <small>' + (x.dalsi.doma ? 'doma' : 'venku') + '</small></span>'
          : '<span class="fotbal-dalsi muted">podzim dohrán</span>') + '</li>';
    }).join('') + '</ul>';
}

/** Týmy do kalendáře (pravý panel Kalendáře a Nastavení): pilulky – zapnutý tým má zápasy v kalendáři „⚽ tým“. */
export function tymyHtml() {
  if (!umiMotor('fotbal')) return '';
  const d = data();
  if (!d) {
    return '<p class="karta-text">Zápasy z fotbal.cz zatím ve schránce nejsou – stáhne je úloha „Fotbal z fotbal.cz“ (Michalův Chrome).</p>';
  }
  const zapnute = (stav.fotbal && stav.fotbal.vKalendari) || [];
  return '<p class="karta-text">Zápasy našich týmů z fotbal.cz. Zapnutý tým má zápasy v kalendáři „⚽ tým“ – přeložení a výsledky se doplní samy.</p>' +
    '<div class="fotbal-volby">' + (d.tymy || []).map((t) => '<button type="button" class="chip" data-fotbal-tym="' + esc(t.klic) + '" aria-pressed="' +
      (zapnute.indexOf(t.klic) >= 0) + '" title="' + esc(t.soutez || '') + '">' + IKONY.zapas + esc(t.nazev) + '</button>').join('') + '</div>' +
    '<p class="napoveda">Aktualizováno ' + esc(kdyKratce(Date.parse(d.aktualizovano) || 0)) + ' · ' + d.zapasy.length + ' zápasů</p>';
}

// ---------------------------------------------------------------- stránka Fotbal: tabulka, další zápas, výsledky s góly a kartami, střelci

const VYBER = 'asistent.fotbal.tym';
let vybranyTym = uloziste.cti(VYBER) || '';
let pohledTabulky = 'celkem';
let plneZkouseno = false;
const otevreneZapasy = {};

/** Plná data (tabulky, detaily všech zápasů) – jen pro stránku Fotbal. */
export function nactiFotbalPlne() {
  if (!umiMotor('fotbal') || stav.nacita.fotbal) return Promise.resolve();
  stav.nacita.fotbal = true;
  return volej('fotbal', { plne: true })
    .then((d) => { stav.fotbal = d; stav.chyby.fotbal = null; uloziste.pis(ULOZISTE, { data: d, kdy: Date.now() }); })
    .catch((e) => { stav.chyby.fotbal = e; })
    .then(() => { stav.nacita.fotbal = false; zmeneno(); });
}

const strana = (z) => (z.doma ? 'domaci' : 'hoste');
const jmenoKratce = (j) => { const c = String(j || '').split(/\s+/); return c.length > 1 ? c[0] + ' ' + c[1].charAt(0) + '.' : j; };
const minuta = (m) => (m == null ? '' : m + '′');

/** Střelci a karty našeho týmu za sezónu (z detailů zápasů). Vlastní góly soupeře se počítají zvlášť. */
function statistikyTymu(d, klic) {
  const strelci = {}, karty = {};
  let vlastni = 0, sDetailem = 0;
  d.zapasy.filter((z) => z.tym === klic && z.vysledek).forEach((z) => {
    const det = d.detaily && d.detaily[z.id];
    if (!det) return;
    sDetailem++;
    (det.goly || []).forEach((g) => {
      if (g.strana !== strana(z)) return;
      if (/vlastn/i.test(g.pozn || '')) { vlastni++; return; }
      strelci[g.hrac] = (strelci[g.hrac] || 0) + 1;
    });
    (det.karty || []).forEach((k) => {
      if (k.strana !== strana(z)) return;
      const x = karty[k.hrac] || (karty[k.hrac] = { z: 0, c: 0 });
      x[k.barva === 'cervena' ? 'c' : 'z']++;
    });
  });
  return {
    strelci: Object.keys(strelci).map((j) => [j, strelci[j]]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs')),
    karty: Object.keys(karty).map((j) => [j, karty[j]]).sort((a, b) => (b[1].c * 3 + b[1].z) - (a[1].c * 3 + a[1].z) || a[0].localeCompare(b[0], 'cs')),
    vlastni, sDetailem
  };
}

function detailZapasuHtml(z, det) {
  if (!det) return '<div class="zapas-detail"><p class="muted small">Detail zápasu ještě není stažený – doplní ho další běh úlohy fotbal.cz.</p>' + odkazHtml(z.url, 'Zápis na fotbal.cz') + '</div>';
  const nase = strana(z);
  const goly = (det.goly || []).map((g) => '<li class="' + (g.strana === nase ? 'nas' : '') + '"><span class="min cisla">' + minuta(g.min) + '</span>' + IKONY.zapas +
    '<span>' + esc(g.hrac) + (g.pozn ? ' <small>(' + esc(g.pozn) + ')</small>' : '') + '</span><small class="strana">' + (g.strana === nase ? klub(z.doma ? z.domaci : z.hoste) : souper(z)) + '</small></li>').join('');
  const karty = (det.karty || []).map((k) => '<li class="' + (k.strana === nase ? 'nas' : '') + '"><span class="min cisla">' + minuta(k.min) + '</span><i class="karta karta--' + (k.barva === 'cervena' ? 'c' : 'z') + '" aria-label="' +
    (k.barva === 'cervena' ? 'červená' : 'žlutá') + ' karta"></i><span>' + esc(k.hrac) + '</span><small class="strana">' + (k.strana === nase ? klub(z.doma ? z.domaci : z.hoste) : souper(z)) + '</small></li>').join('');
  return '<div class="zapas-detail">' +
    '<p class="zapas-meta">' + (det.polocas ? 'Poločas ' + esc(det.polocas) : '') + (det.divaku ? (det.polocas ? ' · ' : '') + det.divaku + ' diváků' : '') + (z.misto ? ' · ' + esc(z.misto) : '') + '</p>' +
    (goly ? '<h4>Góly</h4><ul class="zapas-udalosti">' + goly + '</ul>' : '<p class="muted small">Bez gólů.</p>') +
    (karty ? '<h4>Karty</h4><ul class="zapas-udalosti">' + karty + '</ul>' : '') +
    odkazHtml(z.url, 'Zápis na fotbal.cz') + '</div>';
}

function odkazHtml(url, text) {
  return url ? '<a class="odkaz-ven" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(text) + IKONY.sipka + '</a>' : '';
}

function zapasRadekHtml(z, d) {
  const v = vrp(z);
  const otevreny = !!otevreneZapasy[z.id];
  const det = d.detaily && d.detaily[z.id];
  const strelciNasi = det ? (det.goly || []).filter((g) => g.strana === strana(z) && !/vlastn/i.test(g.pozn || '')).map((g) => jmenoKratce(g.hrac)) : [];
  const t = cas(z);
  return '<li class="zapas-radek' + (otevreny ? ' otevreny' : '') + '"><button type="button" class="zapas-hlava" data-fotbal-zapas="' + esc(z.id) + '" aria-expanded="' + otevreny + '">' +
    '<span class="zapas-kdy"><b>' + DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + '</b><small>' + (z.kolo ? z.kolo + '. kolo' : hhmm(t)) + '</small></span>' +
    '<span class="zapas-tymy"><span class="' + (z.doma ? 'nas' : '') + '">' + esc(klub(z.domaci)) + '</span> – <span class="' + (z.doma ? '' : 'nas') + '">' + esc(klub(z.hoste)) + '</span>' +
      (strelciNasi.length ? '<small>' + IKONY.zapas + esc(strelciNasi.join(', ')) + '</small>' : '') + '</span>' +
    '<span class="fotbal-vysledek fotbal-vysledek--' + v + '"><i>' + v + '</i>' + esc(z.vysledek) + '</span></button>' +
    (otevreny ? detailZapasuHtml(z, det) : '') + '</li>';
}

function budouciRadekHtml(z) {
  const t = cas(z);
  return '<li class="zapas-radek budouci"><div class="zapas-hlava">' +
    '<span class="zapas-kdy"><b>' + DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + '</b><small>' + hhmm(t) + '</small></span>' +
    '<span class="zapas-tymy"><span class="' + (z.doma ? 'nas' : '') + '">' + esc(klub(z.domaci)) + '</span> – <span class="' + (z.doma ? '' : 'nas') + '">' + esc(klub(z.hoste)) + '</span>' +
      (z.puvodniTermin ? '<small>přeloženo</small>' : '') + '</span>' +
    '<span class="zapas-misto">' + (z.doma ? 'doma' : 'venku') + '</span></div></li>';
}

function tabulkaHtml(tab, t) {
  if (!tab) return '<p class="muted small fotbal-pad">Tabulka ještě není stažená – doplní ji další běh úlohy fotbal.cz.</p>';
  const radky = tab[pohledTabulky] || [];
  const nas = new RegExp(klub(data().klub || 'Vnorovy').split(' ').pop(), 'i');
  return '<div class="fotbal-pad"><div class="segment" role="group" aria-label="Tabulka">' + [['celkem', 'Celkem'], ['doma', 'Doma'], ['venku', 'Venku']].map((p) =>
    '<button type="button" class="chip" data-fotbal-tabulka="' + p[0] + '" aria-pressed="' + (pohledTabulky === p[0]) + '">' + p[1] + '</button>').join('') + '</div></div>' +
    '<div class="tabulka-obal"><table class="fotbal-tabulka"><thead><tr><th>#</th><th class="klub">Klub</th><th>Z</th><th class="vrp">V</th><th class="vrp">R</th><th class="vrp">P</th><th>Skóre</th><th>B</th></tr></thead><tbody>' +
    radky.map((r) => '<tr class="' + (nas.test(r.klub) ? 'nas' : '') + '"><td class="cisla">' + r.poradi + '.</td><td class="klub">' + esc(klub(r.klub)) + '</td><td class="cisla">' + r.z +
      '</td><td class="cisla vrp">' + r.v + '</td><td class="cisla vrp">' + r.r + '</td><td class="cisla vrp">' + r.p + '</td><td class="cisla">' + esc(r.skore) + '</td><td class="cisla"><b>' + r.body + '</b></td></tr>').join('') +
    '</tbody></table></div><div class="fotbal-odkazy">' + odkazHtml(t.urlTabulka, 'Tabulka na fotbal.cz') + odkazHtml(t.url, 'Celé rozlosování') + '</div>';
}

export function vykresliFotbal(el) {
  const d = data();
  if (!d) {
    el.innerHTML = '<div class="card"><div class="prazdne">' + (stav.chyby.fotbal ? esc(stav.chyby.fotbal.message) : stav.nacita.fotbal ? 'Načítám zápasy…'
      : 'Zápasy z fotbal.cz zatím nejsou – stáhne je úloha „Fotbal z fotbal.cz“ (Michalův Chrome).') + '</div></div>';
    return;
  }
  if (!d.tabulky && d.maTabulky && !plneZkouseno) { plneZkouseno = true; nactiFotbalPlne(); }
  const tymy = d.tymy || [];
  const t = tymy.find((x) => x.klic === vybranyTym) || tymy[0];
  if (!t) { el.innerHTML = ''; return; }
  const ted = Date.now();
  const zapasy = d.zapasy.filter((z) => z.tym === t.klic).sort((a, b) => cas(a) - cas(b));
  const odehrane = zapasy.filter((z) => z.vysledek).reverse();
  const budouci = zapasy.filter((z) => !z.vysledek && cas(z) + 2 * 36e5 > ted);
  const dalsi = budouci[0];
  const tab = d.tabulky && d.tabulky[t.klic];
  const nas = new RegExp(klub(d.klub || 'Vnorovy').split(' ').pop(), 'i');
  const radekNas = tab && (tab.celkem || []).find((r) => nas.test(r.klub));
  const st = statistikyTymu(d, t.klic);

  let h = '<div class="fotbal-stranka"><div class="fotbal-lista"><div class="segment fotbal-vyber" role="group" aria-label="Tým">' + tymy.map((x) =>
    '<button type="button" class="chip chip--tym" style="--b:' + esc(x.barva || 'var(--accent)') + '" data-fotbal-vyber="' + esc(x.klic) + '" aria-pressed="' + (x.klic === t.klic) + '">' +
    esc(x.nazev) + '</button>').join('') + '</div><span class="fotbal-odkazy-stranek">' + (hooky.reelyTlacitko ? hooky.reelyTlacitko() : '') +
    (hooky.plakatTlacitko ? hooky.plakatTlacitko() : '') + '</span></div>';
  const souhrn = [esc(t.soutez || '')].concat(radekNas ? ['<b>' + radekNas.poradi + '. místo</b>', radekNas.body + ' ' + (radekNas.body === 1 ? 'bod' : radekNas.body >= 2 && radekNas.body <= 4 ? 'body' : 'bodů'),
    radekNas.v + '–' + radekNas.r + '–' + radekNas.p, 'skóre ' + esc(radekNas.skore)] : []).filter(Boolean);
  if (souhrn.length) h += '<p class="fotbal-souhrn">' + souhrn.join(' · ') + '</p>';
  h += '<div class="fotbal-mrizka"><div class="fotbal-sloupec">';
  if (dalsi) {
    const tt = cas(dalsi), dny = rozdilDni(tt);
    h += '<section class="card fotbal-dalsi-zapas">' + hlavickaKarty(IKONY.kalendar, 'Další zápas', '<span class="muted small">' + (dny === 0 ? 'dnes' : dny === 1 ? 'zítra' : 'za ' + dny + ' dní') + '</span>') +
      '<div class="dalsi-zapas"><b>' + esc(klub(dalsi.domaci)) + ' – ' + esc(klub(dalsi.hoste)) + '</b><span>' + DNY_KR[new Date(tt).getDay()] + ' ' + dm(tt) + ' · ' + hhmm(tt) +
      ' · ' + (dalsi.doma ? 'doma' : 'venku') + (dalsi.misto ? ', ' + esc(dalsi.misto) : '') + (dalsi.kolo ? ' · ' + dalsi.kolo + '. kolo' : '') + '</span>' +
      (dalsi.puvodniTermin ? '<small>Přeloženo z ' + esc(dalsi.puvodniTermin) + '</small>' : '') + '</div></section>';
  }
  h += '<section class="card">' + hlavickaKarty(IKONY.zapas, 'Výsledky', '<span class="muted small">' + odehrane.length + ' ' + tvarZapasu(odehrane.length) + '</span>') +
    (odehrane.length ? '<ul class="zapasy-seznam">' + odehrane.map((z) => zapasRadekHtml(z, d)).join('') + '</ul>' : '<p class="muted small fotbal-pad">Zatím nic odehráno.</p>') + '</section>';
  if (budouci.length > 1) {
    h += '<section class="card">' + hlavickaKarty(IKONY.kalendar, 'Zbývající zápasy', '<span class="muted small">' + (budouci.length - 1) + '</span>') +
      '<ul class="zapasy-seznam">' + budouci.slice(1).map(budouciRadekHtml).join('') + '</ul></section>';
  }
  h += '</div><div class="fotbal-sloupec">';
  h += '<section class="card">' + hlavickaKarty(IKONY.tabulka, 'Tabulka', tab && tab.aktualizovano ? '<span class="muted small">' + esc(kdyKratce(Date.parse(tab.aktualizovano))) + '</span>' : '') + tabulkaHtml(tab, t) + '</section>';
  if (st.sDetailem) {
    h += '<section class="card">' + hlavickaKarty(IKONY.zapas, 'Střelci a karty', '<span class="muted small">' + st.sDetailem + ' ' + tvarZapasu(st.sDetailem) + '</span>') +
      '<div class="fotbal-statistiky"><div><h4>Střelci</h4>' + (st.strelci.length ? '<ol>' + st.strelci.slice(0, 12).map((s) => '<li><span>' + esc(s[0]) + '</span><b class="cisla">' + s[1] + '</b></li>').join('') + '</ol>' : '<p class="muted small">Zatím bez gólu.</p>') +
        (st.vlastni ? '<p class="muted small">+ ' + st.vlastni + ' vlastní ' + (st.vlastni === 1 ? 'gól' : 'góly') + ' soupeře</p>' : '') + '</div>' +
      '<div><h4>Karty</h4>' + (st.karty.length ? '<ol>' + st.karty.slice(0, 12).map((s) => '<li><span>' + esc(s[0]) + '</span><span class="karty-pocet">' +
        (s[1].z ? '<i class="karta karta--z"></i>' + s[1].z : '') + (s[1].c ? ' <i class="karta karta--c"></i>' + s[1].c : '') + '</span></li>').join('') + '</ol>' : '<p class="muted small">Bez karet.</p>') + '</div></div></section>';
  }
  h += '<p class="napoveda fotbal-pad">Data z fotbal.cz · aktualizováno ' + esc(kdyKratce(Date.parse(d.aktualizovano) || 0)) + '</p>';
  el.innerHTML = h + '</div></div></div>';
}

function tvarZapasu(n) { return n === 1 ? 'zápas' : n >= 2 && n <= 4 ? 'zápasy' : 'zápasů'; }

export function klikFotbal(el) {
  if (el.dataset.fotbalVyber) { vybranyTym = el.dataset.fotbalVyber; uloziste.pis(VYBER, vybranyTym); zmeneno(); return true; }
  if (el.dataset.fotbalTabulka) { pohledTabulky = el.dataset.fotbalTabulka; zmeneno(); return true; }
  if (el.dataset.fotbalZapas) { otevreneZapasy[el.dataset.fotbalZapas] = !otevreneZapasy[el.dataset.fotbalZapas]; zmeneno(); return true; }
  if (!el.dataset.fotbalTym) return false;
  const klic = el.dataset.fotbalTym;
  const zapnute = ((stav.fotbal && stav.fotbal.vKalendari) || []).slice();
  const i = zapnute.indexOf(klic);
  if (i >= 0) zapnute.splice(i, 1); else zapnute.push(klic);
  el.disabled = true;
  volej('fotbalKalendar', { tymy: zapnute })
    .then((v) => {
      if (stav.fotbal) stav.fotbal.vKalendari = zapnute;
      if (stav.info && v.kalendareSeznam) { stav.info.kalendare = v.kalendareSeznam; uloziste.pis('asistent.info', stav.info); }
      toast(i >= 0 ? 'Tým už se do kalendáře nepřidává (zapsané zápasy zůstaly)' : 'V kalendáři: ' + v.pridano + ' nových zápasů' + (v.upraveno ? ', ' + v.upraveno + ' upraveno' : ''));
      if (hooky.obnovKalendar) hooky.obnovKalendar();
    })
    .catch((e) => toast(e.message, true))
    .then(() => { el.disabled = false; zmeneno(); });
  return true;
}
