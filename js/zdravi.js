// Zdraví: WHOOP (připravenost, spánek, zátěž, tréninky) + Apple Watch (kroky, pohyb, VO2 max) – data z motoru.
// Provázané: trénink se spáruje s událostí v kalendáři (zápas, trénink), na Dnes je karta Zdraví, v detailu zápasu
// v kalendáři čísla z WHOOP. Barvy připravenosti jako WHOOP: zelená 67–100, žlutá 34–66, červená 0–33.

import { stav, zmeneno, umiMotor, staryMotor, hooky } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, pulnoc, pridejDny, isoDatum, DNY_KR, dm, hhmm, kdyKratce, trvani, rozdilDni, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { kostra, chybaHtml, hlavickaKarty, toast, okno, potvrd } from './ui.js';
import { udalostiVRozsahu, jeZapas } from './kalendar.js';

const ULOZISTE = 'asistent.data.zdravi';

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.zdravi = v.data;
}

export function nactiZdravi(znovu) {
  if (!umiMotor('zdravi') || stav.nacita.zdravi) return Promise.resolve();
  stav.nacita.zdravi = true;
  stav.chyby.zdravi = null;
  zmeneno();
  return volej('zdravi', { znovu: !!znovu })
    .then((data) => { stav.zdravi = data; uloziste.pis(ULOZISTE, { data, kdy: Date.now() }); })
    .catch((e) => { stav.chyby.zdravi = e; })
    .then(() => { stav.nacita.zdravi = false; zmeneno(); });
}

export function dotahni() {
  if (umiMotor('zdravi') && !stav.zdravi && !stav.nacita.zdravi && !stav.chyby.zdravi) nactiZdravi();
}

// ---------------------------------------------------------------- data

const SPORTY = {
  soccer: 'Fotbal', running: 'Běh', walking: 'Chůze', cycling: 'Kolo', weightlifting: 'Posilovna', 'functional-fitness': 'Funkční trénink',
  functional_fitness: 'Funkční trénink', powerlifting: 'Silový trénink', 'strength-trainer': 'Posilování', strength_trainer: 'Posilování',
  hiit: 'HIIT', hiking: 'Turistika', 'hiking/rucking': 'Turistika', rucking: 'Turistika', stretching: 'Protahování', yoga: 'Jóga',
  sauna: 'Sauna', 'ice-bath': 'Ledová koupel', ice_bath: 'Ledová koupel', activity: 'Aktivita', other: 'Jiné', tennis: 'Tenis',
  basketball: 'Basketbal', swimming: 'Plavání', football: 'Americký fotbal', pilates: 'Pilates', 'track-&-field': 'Atletika',
  spinning: 'Spinning', rowing: 'Veslování', elliptical: 'Eliptický trenažér', 'stairmaster': 'Schody', 'box-fitness': 'Box'
};
export function nazevSportu(s) {
  const k = String(s || '').toLowerCase().trim();
  return SPORTY[k] || SPORTY[k.replace(/\s+/g, '-')] || (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/[-_]/g, ' ') : 'Trénink');
}

/** Barva připravenosti podle WHOOP. */
export function zona(skore) { return skore == null ? '' : skore >= 67 ? 'zelena' : skore >= 34 ? 'zluta' : 'cervena'; }

function dny() { return (stav.zdravi && stav.zdravi.dny) || []; }
function den(iso) { return dny().find((d) => d.den === iso) || null; }
/** Poslední den, který má z WHOOP připravenost (dnes, nebo včera, když dnešní ještě není). */
function posledniSPripravenosti() {
  const s = dny();
  for (let i = s.length - 1; i >= 0; i--) if (s[i].whoop && s[i].whoop.pripravenost) return s[i];
  return null;
}
export function maData() { return !!(stav.zdravi && dny().some((d) => d.whoop || d.apple)); }

const hodMin = (ms) => { if (ms == null) return '–'; const m = Math.round(ms / 6e4); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };
const hodMinKratce = (ms) => { if (ms == null) return '–'; const m = Math.round(ms / 6e4); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const cisloCz = (n, des) => (n == null ? '–' : Number(n).toLocaleString('cs-CZ', { maximumFractionDigits: des || 0, minimumFractionDigits: des || 0 }));
function denPopis(iso) {
  const t = new Date(iso + 'T12:00').getTime();
  const r = rozdilDni(t);
  return r === 0 ? 'dnes' : r === -1 ? 'včera' : DNY_KR[new Date(t).getDay()] + ' ' + dm(t);
}

/** Karta Zdraví na Dnes (a malé číslo na telefonu). */
export function kartaZdravi() {
  const d = posledniSPripravenosti();
  const w = d && d.whoop;
  if (!w) {
    const a = dny().slice().reverse().find((x) => x.apple && x.apple.kroky != null);
    return { nazev: 'Kroky', hodnota: a ? cisloCz(a.apple.kroky) : '–', jednotka: '', pod: '<span>' + (a ? denPopis(a.den) + ' · Apple Watch' : 'zatím bez dat') + '</span>' };
  }
  const sk = w.pripravenost.skore;
  return {
    nazev: 'Připravenost' + (d.den === isoDatum(Date.now()) ? '' : ' · ' + denPopis(d.den)),
    hodnota: String(sk), jednotka: '%',
    pod: '<span class="tag tag--' + { zelena: 'ok', zluta: 'warn', cervena: 'danger' }[zona(sk)] + '">' + { zelena: 'zelená', zluta: 'žlutá', cervena: 'červená' }[zona(sk)] + '</span>' +
      '<span class="orez-1">' + (w.spanek ? 'spánek ' + hodMinKratce(w.spanek.celkem) : '') + (w.pripravenost.hrv ? ' · HRV ' + Math.round(w.pripravenost.hrv) : '') + '</span>'
  };
}

/** Události z kalendáře, které se s tréninkem překrývají (nejdřív zápas). */
function udalostTreninku(t) {
  const ud = udalostiVRozsahu(t.start, t.konec).filter((u) => !u.celodenni);
  return ud.sort((a, b) => (jeZapas(b) - jeZapas(a)))[0] || null;
}

/** Do detailu události v kalendáři: čísla z WHOOP, když se s ní překrývá trénink. */
function treninkKUdalosti(u) {
  if (!stav.zdravi || u.celodenni) return '';
  const t = (stav.zdravi.treninky || []).find((x) => x.start < u.konec && x.konec > u.zacatek);
  if (!t) return '';
  return '<div class="zdravi-k-udalosti">' + IKONY.srdce + '<span><b>' + esc(nazevSportu(t.sport)) + ' · zátěž ' + cisloCz(t.zatez, 1) + '</b>' +
    '<small>tep ø ' + (t.tepPrumer || '–') + ' / max ' + (t.tepMax || '–') + ' · ' + cisloCz(t.kcal) + ' kcal · ' + trvani(t.konec - t.start) + ' · WHOOP</small></span></div>';
}
hooky.detailUdalosti = treninkKUdalosti;

// ---------------------------------------------------------------- grafy

/** 14 dní: sloupce připravenosti v barvě zóny, tečky zátěže (0–21) a čárky spánku. */
function graf14(seznam) {
  const n = seznam.length;
  if (!n) return '';
  const W = 560, H = 150, P = 18, sirka = (W - 2 * P) / n;
  let s = '<svg class="graf14" viewBox="0 0 ' + W + ' ' + (H + 22) + '" role="img" aria-label="Připravenost a zátěž za posledních ' + n + ' dní">';
  [33, 66].forEach((h) => { const y = H - (h / 100) * (H - 10); s += '<line class="graf14__mez" x1="' + P + '" x2="' + (W - P) + '" y1="' + y + '" y2="' + y + '"/>'; });
  let cara = '';
  seznam.forEach((d, i) => {
    const x = P + i * sirka + sirka * 0.18, w = sirka * 0.64;
    const p = d.whoop && d.whoop.pripravenost ? d.whoop.pripravenost.skore : null;
    if (p != null) {
      const v = Math.max(4, (p / 100) * (H - 10));
      s += '<rect class="graf14__sl graf14__sl--' + zona(p) + '" x="' + x.toFixed(1) + '" y="' + (H - v).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + v.toFixed(1) + '" rx="4"><title>' +
        esc(denPopis(d.den) + ': připravenost ' + p + ' %') + '</title></rect>';
    } else {
      s += '<rect class="graf14__sl graf14__sl--prazdny" x="' + x.toFixed(1) + '" y="' + (H - 6) + '" width="' + w.toFixed(1) + '" height="6" rx="3"/>';
    }
    const z = d.whoop && d.whoop.zatez ? d.whoop.zatez.zatez : null;
    if (z != null) {
      const cx = P + i * sirka + sirka / 2, cy = H - (z / 21) * (H - 10);
      cara += (cara ? ' L ' : 'M ') + cx.toFixed(1) + ' ' + cy.toFixed(1);
      s += '<circle class="graf14__zatez" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.4"><title>' + esc(denPopis(d.den) + ': zátěž ' + cisloCz(z, 1)) + '</title></circle>';
    }
    const t = new Date(d.den + 'T12:00');
    s += '<text class="graf14__popis" x="' + (P + i * sirka + sirka / 2).toFixed(1) + '" y="' + (H + 16) + '" text-anchor="middle">' +
      (d.den === isoDatum(Date.now()) ? 'dnes' : DNY_KR[t.getDay()]) + '</text>';
  });
  if (cara) s = s.replace('<circle', '<path class="graf14__cara" d="' + cara + '"/><circle');
  return s + '</svg>';
}

/** Fáze spánku jako jeden pruh (lehký, hluboký, REM, bdění). */
function pruhSpanku(sp) {
  const casti = [['hluboky', 'Hluboký', sp.hluboky], ['rem', 'REM', sp.rem], ['lehky', 'Lehký', sp.lehky != null ? sp.lehky : sp.jadro], ['bdeni', 'Bdění', sp.bdeni]]
    .filter((c) => c[2] > 0);
  const celkem = casti.reduce((a, c) => a + c[2], 0) || 1;
  return '<div class="pruh-spanku">' + casti.map((c) => '<i class="pruh-spanku__' + c[0] + '" style="width:' + (c[2] / celkem * 100).toFixed(1) + '%" title="' +
    esc(c[1] + ' ' + hodMinKratce(c[2])) + '"></i>').join('') + '</div>' +
    '<ul class="legenda-spanku">' + casti.map((c) => '<li><i class="pruh-spanku__' + c[0] + '"></i>' + c[1] + ' <b>' + hodMinKratce(c[2]) + '</b></li>').join('') + '</ul>';
}

// ---------------------------------------------------------------- stránka Zdraví

function pripojeniHtml(z) {
  const w = (z && z.whoop) || {};
  const radky = [];
  if (!w.propojeno) {
    radky.push('<div class="zdravi-pripojit"><span class="kruh kruh--zelena">' + IKONY.srdce + '</span><span><b>Propoj WHOOP</b><small>' +
      (w.nastaveno ? 'Klepni, přihlas se do WHOOP a povol přístup – připravenost, spánek a tréninky se pak načítají samy.'
        : 'Nejdřív jednorázové nastavení (aplikace na WHOOP a 3 hodnoty do motoru) – návod je v Nastavení → Zdraví.') + '</small></span>' +
      (w.nastaveno ? '<button type="button" class="btn btn--primary" data-zdravi="propojit">Propojit</button>'
        : '<button type="button" class="btn btn--ghost" data-otevri-nastaveni="zdravi">Návod</button>') + '</div>');
  } else if (w.sync && w.sync.chyba) {
    radky.push('<p class="pruh pruh-varovani">WHOOP: ' + esc(w.sync.chyba) + '</p>');
  }
  if (!(z && z.apple && z.apple.kdy)) {
    radky.push('<div class="zdravi-pripojit"><span class="kruh kruh--zluta">' + IKONY.aktivita + '</span><span><b>Apple Watch</b><small>Kroky, pohyb a VO2 max posílá ' +
      'zkratka v iPhonu při otevření aplikace WHOOP – nastavení je v Nastavení → Zdraví.</small></span>' +
      '<button type="button" class="btn btn--ghost" data-otevri-nastaveni="zdravi">Nastavit</button></div>');
  }
  return radky.join('');
}

function heroHtml(d, vcera) {
  const w = d.whoop, p = w.pripravenost, sk = p.skore;
  const zmena = vcera && vcera.whoop && vcera.whoop.pripravenost ? sk - vcera.whoop.pripravenost.skore : null;
  const ring = (() => {
    const r = 46, o = 2 * Math.PI * r;
    return '<svg class="kruh-pripravenosti kruh-pripravenosti--' + zona(sk) + '" viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="' + r + '" class="kruh-pripravenosti__pozadi"/>' +
      '<circle cx="55" cy="55" r="' + r + '" class="kruh-pripravenosti__hodnota" stroke-dasharray="' + (o * sk / 100).toFixed(1) + ' ' + o.toFixed(1) + '" transform="rotate(-90 55 55)"/></svg>';
  })();
  return '<section class="card zdravi-hero"><div class="zdravi-hero__kruh">' + ring + '<div><b class="cisla">' + sk + '<small>%</small></b><span>připravenost</span></div></div>' +
    '<div class="zdravi-hero__text"><small>' + esc(denPopis(d.den)) + (p.kalibrace ? ' · WHOOP se ještě kalibruje' : '') + '</small>' +
    '<h2>' + { zelena: 'Zelená – tělo je odpočaté', zluta: 'Žlutá – zvládneš běžný den', cervena: 'Červená – tělo se ještě zotavuje' }[zona(sk)] + '</h2>' +
    '<ul class="zdravi-hodnoty">' +
      '<li><small>HRV</small><b class="cisla">' + cisloCz(p.hrv) + '<i>ms</i></b></li>' +
      '<li><small>Klidový tep</small><b class="cisla">' + cisloCz(p.klidovyTep) + '<i>bpm</i></b></li>' +
      (p.spo2 != null ? '<li><small>SpO₂</small><b class="cisla">' + cisloCz(p.spo2, 1) + '<i>%</i></b></li>' : '') +
      (zmena != null ? '<li><small>Proti včerejšku</small><b class="cisla">' + (zmena > 0 ? '+' : '') + zmena + '<i>%</i></b></li>' : '') +
    '</ul></div></section>';
}

function kpi(nazev, ikona, hodnota, jednotka, pod, atr) {
  return '<button type="button" class="kpi" ' + (atr || '') + '><span class="kpi__hlava">' + ikona + '<span>' + nazev + '</span></span>' +
    '<span class="kpi__hodnota">' + hodnota + (jednotka ? '<small>' + jednotka + '</small>' : '') + '</span><span class="kpi__pod">' + pod + '</span></button>';
}

function treninkyHtml(seznam) {
  if (!seznam.length) return '<div class="prazdne">Za posledních 14 dní žádný trénink z WHOOP.</div>';
  return '<ul class="seznam">' + seznam.slice(0, 12).map((t) => {
    const u = udalostTreninku(t);
    const zony = t.zony || [];
    const soucet = zony.reduce((a, b) => a + b, 0) || 1;
    return '<li class="trenink' + (u && jeZapas(u) ? ' trenink--zapas' : '') + '"' + (u ? ' data-udalost="' + esc(u.id) + '"' : '') + '>' +
      '<span class="trenink__ikona">' + (t.sport === 'soccer' ? IKONY.zapas : IKONY.aktivita) + '</span>' +
      '<span class="trenink__text"><b>' + esc(nazevSportu(t.sport)) + (u ? ' · ' + esc(u.nazev.replace(/^⚽\s*/, '')) : '') + '</b>' +
      '<small>' + esc(denPopis(t.den)) + ' ' + hhmm(t.start) + ' · ' + trvani(t.konec - t.start) + ' · tep ø ' + (t.tepPrumer || '–') + ' / max ' + (t.tepMax || '–') +
      ' · ' + cisloCz(t.kcal) + ' kcal' + (t.vzdalenost ? ' · ' + cisloCz(t.vzdalenost / 1000, 1) + ' km' : '') + '</small>' +
      '<span class="zony" title="Čas v tepových zónách 0–5">' + zony.map((m, i) => '<i class="zony__' + i + '" style="width:' + (m / soucet * 100).toFixed(1) + '%"></i>').join('') + '</span></span>' +
      '<em class="trenink__zatez cisla">' + cisloCz(t.zatez, 1) + '<small>zátěž</small></em></li>';
  }).join('') + '</ul>';
}

function appleHtml(seznam) {
  const sApple = seznam.filter((d) => d.apple);
  if (!sApple.length) return '<div class="prazdne">Z Apple Watch zatím nic nepřišlo.</div>';
  const posledni = sApple[sApple.length - 1];
  const a = posledni.apple;
  const prumer = (k) => { const h = sApple.slice(-7).map((d) => d.apple[k]).filter((x) => x != null); return h.length ? h.reduce((x, y) => x + y, 0) / h.length : null; };
  const vo2 = sApple.slice().reverse().find((d) => d.apple.vo2max != null);
  const radek = (nazev, hodnota, jednotka, pr) => '<li><small>' + nazev + '</small><b class="cisla">' + hodnota + (jednotka ? '<i>' + jednotka + '</i>' : '') + '</b>' +
    (pr != null ? '<span>ø 7 dní ' + pr + '</span>' : '') + '</li>';
  return '<p class="zdravi-zdroj">' + esc(denPopis(posledni.den)) + ' · Apple Watch</p><ul class="zdravi-mrizka">' +
    radek('Kroky', cisloCz(a.kroky), '', prumer('kroky') != null ? cisloCz(prumer('kroky')) : null) +
    radek('Aktivní energie', cisloCz(a.energie), 'kcal', prumer('energie') != null ? cisloCz(prumer('energie')) : null) +
    radek('Cvičení', cisloCz(a.cviceni), 'min', prumer('cviceni') != null ? cisloCz(prumer('cviceni')) : null) +
    (a.stani != null ? radek('Stání', cisloCz(a.stani), 'h', null) : '') +
    radek('Vzdálenost', cisloCz(a.vzdalenost, 1), 'km', null) +
    (vo2 ? radek('VO₂ max', cisloCz(vo2.apple.vo2max, 1), '', null) : '') +
    (a.klidovyTep != null ? radek('Klidový tep', cisloCz(a.klidovyTep), 'bpm', null) : '') +
    '</ul>';
}

export function vykresliZdravi(el) {
  if (staryMotor()) {
    el.innerHTML = '<div class="card"><div class="prazdne">Zdraví ukáže nová verze motoru – návod je v Nastavení → Připojení.</div>' +
      '<div class="akce" style="padding:0 16px 16px"><button type="button" class="btn btn--primary" data-otevri-nastaveni="pripojeni">Otevřít návod</button></div></div>';
    return;
  }
  const z = stav.zdravi;
  if (!z) {
    el.innerHTML = '<div class="card">' + (stav.chyby.zdravi ? chybaHtml(stav.chyby.zdravi, 'data-zdravi="znovu"') : kostra(5)) + '</div>';
    return;
  }
  const seznam = (z.dny || []).slice(-14);
  // doplnit chybějící dny (graf má mít souvislou osu)
  const plny = [];
  for (let i = 13; i >= 0; i--) {
    const iso = isoDatum(pridejDny(pulnoc(Date.now()), -i));
    plny.push(seznam.find((d) => d.den === iso) || { den: iso });
  }
  const d = posledniSPripravenosti();
  const iDne = d ? plny.findIndex((x) => x.den === d.den) : -1;
  const vcera = iDne > 0 ? plny[iDne - 1] : null;
  const dnes = den(isoDatum(Date.now())) || {};
  const sp = d && d.whoop && d.whoop.spanek;
  const zatez = (dnes.whoop && dnes.whoop.zatez) || (d && d.whoop && d.whoop.zatez) || null;
  const vcerejsiZatez = vcera && vcera.whoop && vcera.whoop.zatez;
  const kroky = (dnes.apple && dnes.apple.kroky) != null ? dnes.apple.kroky : zatez && zatez.kroky;
  let h = pripojeniHtml(z);
  if (d) h += heroHtml(d, vcera);
  h += '<div class="kpi-mrizka zdravi-kpi">' +
    kpi('Spánek', IKONY.spanek, sp ? hodMinKratce(sp.celkem) : '–', sp ? 'h' : '',
      sp ? (sp.vykon != null ? '<span class="tag">' + sp.vykon + ' %</span>' : '') + '<span class="orez-1">potřeba ' + hodMinKratce(sp.potreba) + '</span>' : '<span>bez dat</span>', 'data-zdravi-skoc="spanek"') +
    kpi('Zátěž', IKONY.zatez, zatez && zatez.zatez != null ? cisloCz(zatez.zatez, 1) : '–', '/ 21',
      '<span class="orez-1">' + (zatez && zatez.probiha ? 'dnes zatím' : 'za den') + (vcerejsiZatez && vcerejsiZatez.zatez != null ? ' · včera ' + cisloCz(vcerejsiZatez.zatez, 1) : '') + '</span>', 'data-zdravi-skoc="treninky"') +
    kpi('Kroky', IKONY.aktivita, kroky != null ? cisloCz(kroky) : '–', '',
      '<span class="orez-1">' + ((dnes.apple && dnes.apple.kroky) != null ? 'Apple Watch · dnes' : zatez && zatez.kroky != null ? 'WHOOP · dnes' : 'bez dat') + '</span>', 'data-zdravi-skoc="apple"') +
    '</div>';
  const doplnky = kartaDoplnkuHtml();
  h += '<div class="zdravi-mrizka-karet">' + (doplnky ? '<section class="card dlazdice zd-doplnky">' + doplnky + '</section>' : '') +
    (umiMotor('vaha') ? '<section class="card dlazdice zd-vaha" id="zd-vaha">' + kartaVahyHtml() + '</section>' : '') +
    '<section class="card dlazdice zd-graf">' + hlavickaKarty(IKONY.srdce, 'Posledních 14 dní') +
      '<div class="dlazdice__telo"><p class="zdravi-legenda"><i class="graf14__sl--zelena"></i>připravenost <i class="graf14__tecka"></i>zátěž (0–21)</p>' + graf14(plny) + '</div></section>' +
    '<section class="card dlazdice zd-spanek" id="zd-spanek">' + hlavickaKarty(IKONY.spanek, 'Spánek' + (d ? ' · ' + esc(denPopis(d.den)) : '')) +
      '<div class="dlazdice__telo">' + (sp ? '<p class="zdravi-velke cisla">' + hodMin(sp.celkem) + '</p><p class="zdravi-zdroj">' + hhmm(sp.start) + ' – ' + hhmm(sp.konec) +
        (sp.efektivita != null ? ' · efektivita ' + cisloCz(sp.efektivita) + ' %' : '') + (sp.probuzeni != null ? ' · probuzení ' + sp.probuzeni + '×' : '') +
        (sp.dech != null ? ' · dech ' + cisloCz(sp.dech, 1) + '/min' : '') + '</p>' + pruhSpanku(sp) : '<div class="prazdne">Spánek z WHOOP zatím není.</div>') + '</div></section>' +
    '<section class="card dlazdice zd-treninky" id="zd-treninky">' + hlavickaKarty(IKONY.zatez, 'Tréninky · 14 dní') +
      '<div class="dlazdice__telo">' + treninkyHtml((z.treninky || []).filter((t) => t.den >= plny[0].den)) + '</div></section>' +
    '<section class="card dlazdice zd-apple" id="zd-apple">' + hlavickaKarty(IKONY.aktivita, 'Apple Watch') +
      '<div class="dlazdice__telo">' + appleHtml(z.dny || []) + '</div></section>' +
    '</div>';
  h += '<p class="zdravi-paticka">Data: WHOOP' + (z.whoop && z.whoop.sync && z.whoop.sync.kdy ? ' (' + esc(kdyKratce(z.whoop.sync.kdy)) + ')' : '') +
    ' · Apple Zdraví' + (z.apple && z.apple.kdy ? ' (' + esc(kdyKratce(z.apple.kdy)) + ')' : '') + ' · ukládá se jen na tvém Disku Google.</p>';
  // rozepsaná váha nesmí zmizet, když se stránka mezitím překreslí (dorazí data)
  const pise = document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('[data-vaha-pole]');
  el.innerHTML = h;
  const pole = el.querySelector('[data-vaha-pole]');
  if (pole && pise) { pole.focus({ preventScroll: true }); pole.setSelectionRange(pole.value.length, pole.value.length); }
}

// ---------------------------------------------------------------- Váha (ruční zápis; čas = kdy se zapsala) – CLAUDE_SCHRANKA/ZDRAVI/VAHA.json

let rozepsanaVaha = '';
function vahy() { return (stav.zdravi && stav.zdravi.vaha) || []; }
const kgCz = (kg) => cisloCz(kg, 1);

/** „80,4“, „80.4 kg“ → 80.4; nesmysl nebo mimo 30–250 kg → null (stejně jako motor). */
export function kgZTextu(t) {
  const m = /(\d{2,3})(?:[.,](\d+))?/.exec(String(t == null ? '' : t));
  if (!m) return null;
  const kg = Math.round(Number(m[1] + '.' + (m[2] || '0')) * 10) / 10;
  return kg >= 30 && kg <= 250 ? kg : null;
}

/** „dnes 7:12“, „včera 21:05“, „čt 1. 10. 6:40“ */
function kdyZapsano(t) {
  const r = rozdilDni(t);
  return (r === 0 ? 'dnes' : r === -1 ? 'včera' : DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + (new Date(t).getFullYear() !== new Date().getFullYear() ? ' ' + new Date(t).getFullYear() : '')) + ' ' + hhmm(t);
}

/** Čára z posledních 30 zápisů (osa x podle času, takže mezery mezi vážením jsou vidět). */
function grafVahy(z) {
  const body = z.slice(-30);
  const W = 520, H = 110, P = 16;
  const t0 = body[0].kdy, t1 = body[body.length - 1].kdy;
  const kg = body.map((b) => b.kg);
  const lo = Math.floor((Math.min.apply(null, kg) - 0.3) * 2) / 2, hi = Math.ceil((Math.max.apply(null, kg) + 0.3) * 2) / 2;
  const x = (t) => P + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * (W - 2 * P);
  const y = (v) => P + (hi - v) / ((hi - lo) || 1) * (H - 2 * P);
  const cara = body.map((b, i) => (i ? 'L ' : 'M ') + x(b.kdy).toFixed(1) + ' ' + y(b.kg).toFixed(1)).join(' ');
  return '<svg class="graf-vahy" viewBox="0 0 ' + W + ' ' + (H + 18) + '" role="img" aria-label="Váha – posledních ' + body.length + ' zápisů">' +
    [hi, lo].map((v) => '<line class="graf-vahy__mez" x1="' + P + '" x2="' + (W - P) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>' +
      '<text class="graf-vahy__popis" x="' + (W - P) + '" y="' + (y(v) - 4).toFixed(1) + '" text-anchor="end">' + kgCz(v) + '</text>').join('') +
    '<path class="graf-vahy__cara" d="' + cara + '"/>' +
    body.map((b) => '<circle class="graf-vahy__bod" cx="' + x(b.kdy).toFixed(1) + '" cy="' + y(b.kg).toFixed(1) + '" r="3.6"><title>' +
      esc(kdyZapsano(b.kdy) + ': ' + kgCz(b.kg) + ' kg') + '</title></circle>').join('') +
    '<text class="graf-vahy__popis" x="' + P + '" y="' + (H + 14) + '">' + esc(dm(t0)) + '</text>' +
    '<text class="graf-vahy__popis" x="' + (W - P) + '" y="' + (H + 14) + '" text-anchor="end">' + esc(dm(t1)) + '</text></svg>';
}

export function kartaVahyHtml() {
  const z = vahy();
  const posl = z[z.length - 1], pred = z[z.length - 2];
  const rozdil = posl && pred ? Math.round((posl.kg - pred.kg) * 10) / 10 : null;
  return hlavickaKarty(IKONY.vaha, 'Váha', z.length ? '<span class="muted small">' + z.length + ' ' + tvar(z.length, 'zápis', 'zápisy', 'zápisů') + '</span>' : '') +
    '<div class="dlazdice__telo">' +
      (posl ? '<p class="vaha-ted"><b class="cisla">' + kgCz(posl.kg) + '<small>kg</small></b><span>zapsáno ' + esc(kdyZapsano(posl.kdy)) +
          (rozdil != null ? '<br><em>' + (rozdil > 0 ? '+' : rozdil < 0 ? '−' : '±') + kgCz(Math.abs(rozdil)) + ' kg</em> proti ' + esc(kdyZapsano(pred.kdy)) : '') + '</span></p>'
        : '<p class="prazdne vaha-prazdne">Zatím žádný zápis. Napiš váhu – uloží se i s časem, kdy jsi ji zapsal.</p>') +
      '<div class="vaha-zapis"><input class="field" data-vaha-pole inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="např. 80,4" aria-label="Váha v kg" value="' +
        esc(rozepsanaVaha) + '"><span>kg</span><button type="button" class="btn btn--primary" data-vaha-zapsat>Zapsat</button></div>' +
      (z.length > 1 ? grafVahy(z) : '') +
      (z.length ? '<ul class="vaha-seznam">' + z.slice(-6).reverse().map((x) => '<li><span>' + esc(kdyZapsano(x.kdy)) + '</span><b class="cisla">' + kgCz(x.kg) + ' kg</b>' +
        '<button type="button" class="vaha-smazat" data-vaha-smazat="' + x.kdy + '" aria-label="Smazat zápis ' + esc(kdyZapsano(x.kdy)) + '" title="Smazat zápis">' + IKONY.zavrit + '</button></li>').join('') + '</ul>' : '') +
    '</div>';
}

function poVaze(zaznamy) {
  if (stav.zdravi) {
    stav.zdravi.vaha = zaznamy;
    uloziste.pis(ULOZISTE, { data: stav.zdravi, kdy: Date.now() });
  }
  zmeneno();
}

/** Zapíše váhu (čas zápisu dá motor). Vrací true, když se povedlo. */
export function zapisVahu(text) {
  const kg = kgZTextu(text);
  if (kg == null) { toast('Napiš váhu v kg, třeba 80,4', true); return Promise.resolve(false); }
  return volej('vaha', { kg })
    .then((v) => {
      rozepsanaVaha = '';
      poVaze(v.zaznamy || []);
      const posl = (v.zaznamy || []).slice(-1)[0];
      toast('Zapsáno ' + kgCz(kg) + ' kg' + (posl ? ' · ' + kdyZapsano(posl.kdy) : ''));
      return true;
    })
    .catch((e) => { toast(e.message, true); return false; });
}

/** „+“ → Váha: okno s polem (číselná klávesnice na telefonu). */
export function zapisVahuOknem() {
  return okno({ ikona: IKONY.vaha, nadpis: 'Váha', text: 'Zapíše se i s časem, kdy ji zapisuješ.', pole: { popisek: 'Kg', placeholder: 'např. 80,4', inputmode: 'decimal' },
    ano: 'Zapsat', ne: 'Zrušit' }).then((t) => (t ? zapisVahu(t) : false));
}

/** Psaní do pole váhy (app.js – událost input) a Enter = Zapsat (app.js – keydown). */
export function vstupZdravi(e) {
  if (!e.target.matches || !e.target.matches('[data-vaha-pole]')) return false;
  rozepsanaVaha = e.target.value;
  return true;
}
export function klavesaZdravi(e) {
  if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('[data-vaha-pole]')) return false;
  e.preventDefault();
  zapisVahu(e.target.value);
  return true;
}

// ---------------------------------------------------------------- Doplňky dnes (režim z ZDRAVI_REZIM.json na Disku)

const KDY = [['rano', 'Ráno'], ['obed', 'K obědu'], ['pred', 'Před tréninkem'], ['zapas', 'Zápas'], ['po', 'Po zátěži'], ['vecer', 'Večer']];
const VZATO = 'asistent.doplnky.';

/** Zápas dnes? Z dat fotbal.cz (týmy v rezim.zapasTymy) nebo ze zápasu v kalendáři. → čas výkopu (ms) nebo null */
function zapasDnes(rezim) {
  const dnes = isoDatum(Date.now());
  const tymy = rezim.zapasTymy || [];
  const f = stav.fotbal && stav.fotbal.data;
  const z = f && (f.zapasy || []).find((x) => tymy.indexOf(x.tym) >= 0 && isoDatum(Date.parse(x.zacatek)) === dnes);
  if (z) return Date.parse(z.zacatek);
  const od = pulnoc(Date.now());
  const u = udalostiVRozsahu(od, pridejDny(od, 1)).find((x) => jeZapas(x) && !x.celodenni);
  return u ? u.zacatek : null;
}

/** Co dnes brát: položky režimu podle dne (trénink, zápas) a stav odškrtnutí na tomhle zařízení. */
export function doplnkyDnes() {
  const rezim = stav.zdravi && stav.zdravi.rezim;
  if (!rezim || !Array.isArray(rezim.polozky) || !rezim.polozky.length) return null;
  const vykop = zapasDnes(rezim);
  const trenink = (rezim.treninkDny || []).indexOf(new Date().getDay()) >= 0;
  const plati = (p) => !p.jen || (p.jen === 'zapas' && vykop) || (p.jen === 'trenink' && trenink) || (p.jen === 'zatez' && (trenink || vykop));
  const vzato = uloziste.cti(VZATO + isoDatum(Date.now())) || {};
  const polozky = rezim.polozky.filter(plati).map((p) => Object.assign({ vzato: !!vzato[p.id] }, p))
    .sort((a, b) => KDY.findIndex((k) => k[0] === a.kdy) - KDY.findIndex((k) => k[0] === b.kdy));
  return { polozky, vykop, trenink, kofeinDo: rezim.kofeinDo || '', chyba: rezim.chyba || '' };
}

export function kartaDoplnkuHtml() {
  const d = doplnkyDnes();
  if (!d) return '';
  const zbyva = d.polozky.filter((p) => !p.vzato).length;
  const nazevKdy = (k) => (KDY.find((x) => x[0] === k) || [k, k])[1];
  const den = d.vykop ? 'den zápasu · výkop ' + hhmm(d.vykop) : d.trenink ? 'tréninkový den' : '';
  const kofein = !d.vykop && d.kofeinDo && new Date().getHours() < 18 ? 'Kofein naposledy ve ' + d.kofeinDo + '.' : '';
  return hlavickaKarty(IKONY.doplnky, 'Doplňky dnes', '<span class="muted small">' + (zbyva ? 'zbývá ' + zbyva : 'vše ✓') + '</span>') +
    (d.chyba ? '<p class="pruh pruh-varovani">' + esc(d.chyba) + '</p>' : '') +
    '<ul class="doplnky">' + d.polozky.map((p) => '<li><button type="button" class="doplnek" data-doplnek="' + esc(p.id) + '" aria-pressed="' + p.vzato + '">' +
      '<i class="zaskrt" aria-hidden="true">' + IKONY.fajfka + '</i><span><b>' + esc(p.nazev) + '</b><small>' + esc(nazevKdy(p.kdy)) + (p.davka ? ' · ' + esc(p.davka) : '') + '</small></span></button></li>').join('') + '</ul>' +
    (den || kofein ? '<p class="doplnky-pozn">' + [den ? velkym(den) : '', kofein].filter(Boolean).join(' · ') + '</p>' : '');
}

function velkym(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------------------------------------------------------------- ovládání

export function klikZdravi(el) {
  if (el.dataset.doplnek) {
    const klic = VZATO + isoDatum(Date.now());
    const vzato = uloziste.cti(klic) || {};
    vzato[el.dataset.doplnek] = !vzato[el.dataset.doplnek];
    uloziste.pis(klic, vzato);
    // staré dny pryč (jen posledních 7)
    uloziste.klice(VZATO).filter((k) => k < VZATO + isoDatum(pridejDny(pulnoc(Date.now()), -7))).forEach((k) => uloziste.smaz(k));
    zmeneno();
    return true;
  }
  if (el.hasAttribute('data-vaha-zapsat')) {
    const pole = el.closest('.vaha-zapis').querySelector('[data-vaha-pole]');
    el.disabled = true;
    zapisVahu(pole.value).then(() => { el.disabled = false; });
    return true;
  }
  if (el.dataset.vahaSmazat) {
    const kdy = Number(el.dataset.vahaSmazat);
    const x = vahy().find((v) => v.kdy === kdy);
    if (!x) return true;
    potvrd('Smazat zápis ' + kgCz(x.kg) + ' kg?', { ikona: IKONY.smazat, ton: 'nebezpeci', text: 'Zapsáno ' + kdyZapsano(x.kdy) + '.', ano: 'Smazat' }).then((ano) => {
      if (!ano) return;
      volej('vaha', { smazat: kdy }).then((v) => { poVaze(v.zaznamy || []); toast('Zápis smazán'); }).catch((e) => toast(e.message, true));
    });
    return true;
  }
  const akce = el.dataset.zdravi;
  if (akce === 'znovu') { nactiZdravi(true); return true; }
  if (akce === 'propojit') {
    el.disabled = true;
    // okno otevřít hned (ne až po odpovědi) – Safari jinak vyskakovací okno zablokuje
    const okno = window.open('', '_blank');
    volej('whoopPropojit').then((d) => {
      if (okno) okno.location.href = d.odkaz; else location.href = d.odkaz;
      toast('Po povolení ve WHOOP se vrať sem a klepni na Obnovit');
    }).catch((e) => { if (okno) okno.close(); toast(e.message, true); }).then(() => { el.disabled = false; });
    return true;
  }
  if (el.dataset.zdraviSkoc) {
    const cil = document.getElementById('zd-' + el.dataset.zdraviSkoc);
    if (cil) cil.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }
  return false;
}
