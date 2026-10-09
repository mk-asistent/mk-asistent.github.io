// Zdraví: WHOOP (připravenost, spánek, zátěž, tréninky) + Apple Watch (kroky, pohyb, VO2 max) – data z motoru.
// Provázané: trénink se spáruje s událostí v kalendáři (zápas, trénink), na Dnes je karta Zdraví, v detailu zápasu
// v kalendáři čísla z WHOOP. Barvy připravenosti jako WHOOP: zelená 67–100, žlutá 34–66, červená 0–33.

import { stav, zmeneno, umiMotor, staryMotor, hooky } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, pulnoc, pridejDny, zacatekTydne, isoDatum, DNY_KR, dm, hhmm, kdyKratce, trvani, rozdilDni, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { kostra, chybaHtml, hlavickaKarty, toast, okno, potvrd } from './ui.js';
import { otevriPanel, zavriPanel, elementPanelu } from './panely.js';
import { udalostiVRozsahu, jeZapas } from './kalendar.js';
import { odhadniJidlo } from './jidlo_odhad.js';
import { bublina, grafAtr } from './grafy.js';

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
    .then((data) => { stav.zdravi = data; uloziste.pis(ULOZISTE, { data, kdy: Date.now() }); prevedDoplnky(); odesliDoplnky(); })
    .catch((e) => { stav.chyby.zdravi = e; })
    .then(() => { stav.nacita.zdravi = false; zmeneno(); });
}

export function dotahni() {
  if (umiMotor('zdravi') && !stav.zdravi && !stav.nacita.zdravi && !stav.chyby.zdravi) nactiZdravi();
}

let cekaZmena = 0; // značka, která přišla během načítání – po něm se načte ještě jednou

/**
 * Značka změny zdraví – signál z jiného zařízení (voda z mobilu) nebo ze serveru (zkratka, Claude): je novější než data
 * v zařízení (načtená i po vlastním zápisu) → načíst znovu z motoru. Vlastní zápisy signál neposílá zpět (ucet.js).
 */
export function zkontrolujZmenu(znacka) {
  if (!znacka || !umiMotor('zdravi')) return;
  const v = uloziste.cti(ULOZISTE);
  if (v && v.kdy && znacka <= v.kdy) return;
  if (stav.nacita.zdravi) { cekaZmena = Math.max(cekaZmena, znacka); return; }
  nactiZdravi(false).then(() => {
    const z = cekaZmena;
    cekaZmena = 0;
    if (z) zkontrolujZmenu(z);
  });
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

/**
 * 14 dní: sloupce připravenosti v barvě zóny, tečky a čára zátěže (0–21). Každý den je skupina s plochou přes celý
 * sloupec – najetí, klepnutí nebo šipky ukážou bublinu (den, připravenost, zátěž, spánek; js/grafy.js).
 */
function graf14(seznam) {
  const n = seznam.length;
  if (!n) return '';
  const W = 560, H = 150, P = 18, sirka = (W - 2 * P) / n;
  const dnes = isoDatum(Date.now());
  const zatezDne = (d) => (d.whoop && d.whoop.zatez && d.whoop.zatez.zatez != null ? d.whoop.zatez.zatez : null);
  let s = '<svg class="graf14" viewBox="0 0 ' + W + ' ' + (H + 22) + '"' + grafAtr('Připravenost a zátěž za posledních ' + n + ' dní') + '>';
  [33, 66].forEach((h) => { const y = H - (h / 100) * (H - 10); s += '<line class="graf14__mez" x1="' + P + '" x2="' + (W - P) + '" y1="' + y + '" y2="' + y + '"/>'; });
  // čára zátěže pod sloupci dnů (body jsou ve skupinách dnů)
  const cara = seznam.map((d, i) => { const z = zatezDne(d); return z == null ? '' : (P + i * sirka + sirka / 2).toFixed(1) + ' ' + (H - (z / 21) * (H - 10)).toFixed(1); })
    .filter(Boolean).map((b, i) => (i ? 'L ' : 'M ') + b).join(' ');
  if (cara) s += '<path class="graf14__cara" d="' + cara + '"/>';
  seznam.forEach((d, i) => {
    const x0 = P + i * sirka, x = x0 + sirka * 0.18, w = sirka * 0.64, cx = x0 + sirka / 2;
    const p = d.whoop && d.whoop.pripravenost ? d.whoop.pripravenost.skore : null;
    const z = zatezDne(d);
    const sp = d.whoop && d.whoop.spanek;
    const t = new Date(d.den + 'T12:00');
    const v = p != null ? Math.max(4, (p / 100) * (H - 10)) : 6;
    const cy = z != null ? H - (z / 21) * (H - 10) : null;
    // bublina míří na vyšší z obou (vrchol sloupce, nebo tečka zátěže nad ním)
    const kSloupci = cy == null || H - v <= cy;
    s += '<g class="graf14__den"' + bublina((d.den === dnes ? 'dnes · ' : '') + DNY_KR[t.getDay()] + ' ' + dm(t.getTime()),
      p != null ? 'připravenost ' + p + ' %' : z == null && !(sp && sp.celkem) ? 'bez dat z WHOOP' : 'připravenost chybí',
      [z != null ? 'zátěž ' + cisloCz(z, 1) : '', sp && sp.celkem ? 'spánek ' + hodMinKratce(sp.celkem) : ''].filter(Boolean).join(' · ')) + '>' +
      '<rect class="graf-zasah" x="' + x0.toFixed(1) + '" y="0" width="' + sirka.toFixed(1) + '" height="' + (H + 22) + '"/>' +
      '<rect class="graf14__sl graf14__sl--' + (p != null ? zona(p) : 'prazdny') + '" x="' + x.toFixed(1) + '" y="' + (H - v).toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + v.toFixed(1) + '" rx="' + (p != null ? 4 : 3) + '"' + (kSloupci ? ' data-kotva' : '') + '/>' +
      (cy != null ? '<circle class="graf14__zatez" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.4"' + (kSloupci ? '' : ' data-kotva') + '/>' : '') +
      '<text class="graf14__popis" x="' + cx.toFixed(1) + '" y="' + (H + 16) + '" text-anchor="middle">' + (d.den === dnes ? 'dnes' : DNY_KR[t.getDay()]) + '</text></g>';
  });
  return s + '</svg>';
}

/** Fáze spánku jako jeden pruh (lehký, hluboký, REM, bdění) – u každého úseku bublina s časem a podílem noci. */
function pruhSpanku(sp) {
  const casti = [['hluboky', 'Hluboký spánek', sp.hluboky, 'Hluboký'], ['rem', 'REM', sp.rem, 'REM'], ['lehky', 'Lehký spánek', sp.lehky != null ? sp.lehky : sp.jadro, 'Lehký'],
    ['bdeni', 'Bdění', sp.bdeni, 'Bdění']].filter((c) => c[2] > 0);
  const celkem = casti.reduce((a, c) => a + c[2], 0) || 1;
  return '<div class="pruh-spanku">' + casti.map((c) => '<i class="pruh-spanku__' + c[0] + '" style="width:' + (c[2] / celkem * 100).toFixed(1) + '%"' +
    bublina(c[1], hodMinKratce(c[2]) + ' h', Math.round(c[2] / celkem * 100) + ' % noci') + '></i>').join('') + '</div>' +
    '<ul class="legenda-spanku">' + casti.map((c) => '<li><i class="pruh-spanku__' + c[0] + '"></i>' + c[3] + ' <b>' + hodMinKratce(c[2]) + '</b></li>').join('') + '</ul>';
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

// tepové zóny WHOOP (podíl maximálního tepu) – do bubliny u pruhu zón
const ZONY = ['pod 50 % max. tepu', '50–60 % max. tepu', '60–70 % max. tepu', '70–80 % max. tepu', '80–90 % max. tepu', '90–100 % max. tepu'];

function treninkyHtml(seznam) {
  if (!seznam.length) return '<div class="prazdne">Za posledních 14 dní žádný trénink z WHOOP.</div>';
  return '<ul class="seznam">' + seznam.slice(0, 12).map((t) => {
    const u = udalostTreninku(t);
    const zony = t.zony || [];
    const soucet = zony.reduce((a, b) => a + b, 0) || 1;
    const zonyPopis = 'Čas v tepových zónách: ' + zony.map((m, i) => 'zóna ' + i + ' ' + m + ' min').join(', ');
    return '<li class="trenink' + (u && jeZapas(u) ? ' trenink--zapas' : '') + '"' + (u ? ' data-udalost="' + esc(u.id) + '"' : '') + '>' +
      '<span class="trenink__ikona">' + (t.sport === 'soccer' ? IKONY.zapas : IKONY.aktivita) + '</span>' +
      '<span class="trenink__text"><b>' + esc(nazevSportu(t.sport)) + (u ? ' · ' + esc(u.nazev.replace(/^⚽\s*/, '')) : '') + '</b>' +
      '<small>' + esc(denPopis(t.den)) + ' ' + hhmm(t.start) + ' · ' + trvani(t.konec - t.start) + ' · tep ø ' + (t.tepPrumer || '–') + ' / max ' + (t.tepMax || '–') +
      ' · ' + cisloCz(t.kcal) + ' kcal' + (t.vzdalenost ? ' · ' + cisloCz(t.vzdalenost / 1000, 1) + ' km' : '') + '</small>' +
      '<span class="zony" role="img" aria-label="' + esc(zonyPopis) + '">' + zony.map((m, i) => (m ? '<i class="zony__' + i + '" style="width:' + (m / soucet * 100).toFixed(1) + '%"' +
        bublina('Zóna ' + i + ' · ' + ZONY[i], m + ' min', Math.round(m / soucet * 100) + ' % tréninku') + '></i>' : '')).join('') + '</span></span>' +
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

/**
 * Týdenní shrnutí od Clauda (motor: zdravi.tydenni – do týdne po neděli). Stejný text jako v nedělním e-mailu
 * (Michal 9. 10.: „nedělní shrnutí … napsat mailem tu moji aktivitu“).
 */
function tydenniHtml(t) {
  if (!t || !t.text || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.od || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(t.do || ''))) return '';
  const od = new Date(t.od + 'T12:00'), konec = new Date(t.do + 'T12:00');
  const rozsah = (od.getMonth() === konec.getMonth() ? od.getDate() + '.' : dm(od.getTime())) + '–' + dm(konec.getTime());
  return '<section class="card dlazdice zd-tyden" id="zd-tyden">' + hlavickaKarty(IKONY.claude, 'Týden ' + esc(rozsah) + ' · Claude',
      t.odeslano ? '<span class="muted small">odešlo i e-mailem</span>' : '') +
    '<div class="dlazdice__telo"><div class="tyden-claude">' + textTydne(t.text) + '</div></div></section>';
}

/** Claudův text: odstavce (prázdný řádek), odrážky „- “, **tučně** – jinak čistý text. */
function textTydne(text) {
  const tucne = (x) => x.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return String(text).split(/\n\s*\n/).map((odst) => {
    const radky = odst.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!radky.length) return '';
    if (radky.every((x) => /^[-•]\s+/.test(x))) return '<ul>' + radky.map((x) => '<li>' + tucne(esc(x.replace(/^[-•]\s+/, ''))) + '</li>').join('') + '</ul>';
    return '<p>' + radky.map((x) => tucne(esc(x))).join('<br>') + '</p>';
  }).join('');
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
  const piti = kartaPitiHtml();
  // karty ve sloupcích podle své výšky (app.css: columns) – pořadí shora dolů a zleva doprava: denní zápisy, týden od Clauda,
  // pak čísla z hodinek; žádná karta se nenatahuje na výšku sousední (Michal 9. 10.: „stále v jedné stejné výšce“)
  h += '<div class="zdravi-mrizka-karet">' + (doplnky ? '<section class="card dlazdice zd-doplnky">' + doplnky + '</section>' : '') +
    (piti ? '<section class="card dlazdice zd-piti">' + piti + '</section>' : '') +
    (umiMotor('vaha') ? '<section class="card dlazdice zd-vaha" id="zd-vaha">' + kartaVahyHtml() + '</section>' : '') +
    tydenniHtml(z.tydenni) +
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

// ---- cíl váhy (ZDRAVI_REZIM.json → cilVahy { kg, do, od: { kg, den } }; Michal 9. 10.: cíl a „sledovat svůj postup“)

/** Cíl s časy v ms: { kg, t, od: { kg, t } }; null, když cíl v režimu není. Bez „od“ = první zápis váhy. */
function cilVahy() {
  const c = stav.zdravi && stav.zdravi.rezim && stav.zdravi.rezim.cilVahy;
  if (!c || !(Number(c.kg) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.do || ''))) return null;
  const prvni = vahy()[0];
  const od = c.od && Number(c.od.kg) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(c.od.den || '')) ? { kg: Number(c.od.kg), t: Date.parse(c.od.den + 'T07:00:00') }
    : prvni ? { kg: prvni.kg, t: prvni.kdy } : null;
  return od ? { kg: Number(c.kg), t: Date.parse(c.do + 'T07:00:00'), od } : null;
}

/** Plánovaná váha v čase t (přímka od startu k cíli). */
function planVahy(c, t) {
  if (t <= c.od.t) return c.od.kg;
  if (t >= c.t) return c.kg;
  return c.od.kg - (c.od.kg - c.kg) * (t - c.od.t) / (c.t - c.od.t);
}

/**
 * Tempo v kg za týden (záporné = hubne): přímka nejmenších čtverců přes vážení za 21 dní – jen ranní (do 11 h), když jsou
 * aspoň dvě (večer bývá o 1–2 kg víc). Null = málo dat (méně než 2 zápisy nebo rozpětí pod 3 dny).
 */
function tempoVahy() {
  const hranice = Date.now() - 21 * 864e5;
  let z = vahy().filter((x) => x.kdy >= hranice);
  const rano = z.filter((x) => new Date(x.kdy).getHours() < 11);
  if (rano.length >= 2) z = rano;
  if (z.length < 2 || z[z.length - 1].kdy - z[0].kdy < 3 * 864e5) return null;
  const n = z.length;
  const mx = z.reduce((s, x) => s + x.kdy, 0) / n, my = z.reduce((s, x) => s + x.kg, 0) / n;
  const sxx = z.reduce((s, x) => s + (x.kdy - mx) * (x.kdy - mx), 0);
  if (!sxx) return null;
  return z.reduce((s, x) => s + (x.kdy - mx) * (x.kg - my), 0) / sxx * 7 * 864e5;
}

/** Cíl na kartě Váha: pruh od startu k cíli, kolik zbývá, potřebné a skutečné tempo. */
function cilVahyHtml() {
  const c = cilVahy();
  const posl = vahy().slice(-1)[0];
  if (!c || !posl) return '';
  const celkem = c.od.kg - c.kg, hotovo = c.od.kg - posl.kg, zbyva = Math.round((posl.kg - c.kg) * 10) / 10;
  const pct = celkem > 0 ? Math.max(0, Math.min(100, Math.round(hotovo / celkem * 100))) : 100;
  const potreba = zbyva > 0 ? zbyva / Math.max(0.5, (c.t - Date.now()) / (7 * 864e5)) : 0;
  const tempo = tempoVahy();
  const vPlanu = tempo != null && -tempo >= potreba * 0.9;
  const kgTyden = (v) => (v > 0.005 ? '+' : v < -0.005 ? '−' : '') + cisloCz(Math.abs(v), 2) + ' kg/týden';
  return '<div class="vaha-cil">' +
    '<div class="vaha-cil__hlava"><b>Cíl ' + (Number.isInteger(c.kg) ? c.kg : kgCz(c.kg)) + ' kg</b><span>do ' + dm(c.t) + ' ' + new Date(c.t).getFullYear() + '</span></div>' +
    '<div class="vaha-cil__pruh" role="img" aria-label="Splněno ' + pct + ' %"><i style="width:' + pct + '%"></i></div>' +
    '<p class="vaha-cil__text">' + (zbyva <= 0 ? '🎉 Cíl splněný!' : 'zbývá <b class="cisla">' + kgCz(zbyva) + ' kg</b>' +
      (hotovo > 0.05 ? ' · ubylo ' + kgCz(hotovo) + ' kg' : '')) + '</p>' +
    (zbyva > 0 ? '<p class="vaha-cil__tempo">potřeba ' + kgTyden(-potreba) + (tempo != null ? ' · teď ' + kgTyden(tempo) +
      ' <span class="tag ' + (vPlanu ? 'tag--limetka' : 'tag--warn') + '">' + (vPlanu ? 'v plánu' : 'pomaleji') + '</span>' : ' · tempo ukážu po pár ranních váženích') + '</p>' : '') +
    '</div>';
}

/**
 * Čára z posledních 30 zápisů (osa x podle času, takže mezery mezi vážením jsou vidět); s cílem i čárkovaný plán.
 * U bodu bublina: kdy, kg, rozdíl proti minulému vážení ve stejnou denní dobu a plán k cíli (js/grafy.js).
 */
function grafVahy(z) {
  const body = z.slice(-30);
  const posun = z.length - body.length;
  const W = 520, H = 110, P = 16;
  const t0 = body[0].kdy, t1 = body[body.length - 1].kdy;
  const c = cilVahy();
  const plan = c && t1 > c.od.t ? [planVahy(c, Math.max(t0, c.od.t)), planVahy(c, t1)] : null;
  const kg = body.map((b) => b.kg).concat(plan || []);
  const lo = Math.floor((Math.min.apply(null, kg) - 0.3) * 2) / 2, hi = Math.ceil((Math.max.apply(null, kg) + 0.3) * 2) / 2;
  const x = (t) => P + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * (W - 2 * P);
  const y = (v) => P + (hi - v) / ((hi - lo) || 1) * (H - 2 * P);
  // čára jen přes ranní vážení (aspoň dvě), ostatní body prázdné – jinak by kreslila kolísání během dne
  const rano = body.filter((b) => dobaVazeni(b.kdy) === 'rano');
  const naCare = rano.length >= 2 ? rano : body;
  const cara = naCare.map((b, i) => (i ? 'L ' : 'M ') + x(b.kdy).toFixed(1) + ' ' + y(b.kg).toFixed(1)).join(' ');
  const xs = body.map((b) => x(b.kdy));
  return '<svg class="graf-vahy" viewBox="0 0 ' + W + ' ' + (H + 18) + '"' + grafAtr('Váha – posledních ' + body.length + ' zápisů') + '>' +
    [hi, lo].map((v) => '<line class="graf-vahy__mez" x1="' + P + '" x2="' + (W - P) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>' +
      '<text class="graf-vahy__popis" x="' + (W - P) + '" y="' + (y(v) - 4).toFixed(1) + '" text-anchor="end">' + kgCz(v) + '</text>').join('') +
    (plan ? '<line class="graf-vahy__plan" x1="' + x(Math.max(t0, c.od.t)).toFixed(1) + '" x2="' + x(t1).toFixed(1) + '" y1="' + y(plan[0]).toFixed(1) +
      '" y2="' + y(plan[1]).toFixed(1) + '"/>' : '') +
    '<path class="graf-vahy__cara" d="' + cara + '"/>' +
    body.map((b, i) => {
      // plocha bodu = pás od půlky k předchozímu po půlku k dalšímu (myš i prst trefí bod kdekoli nad ním)
      const l = i ? (xs[i - 1] + xs[i]) / 2 : 0, r = i < body.length - 1 ? (xs[i] + xs[i + 1]) / 2 : W;
      const pred = minuleStejne(z, posun + i);
      const rozdil = pred ? Math.round((b.kg - pred.kg) * 10) / 10 : null;
      const pod = [rozdil != null ? (rozdil > 0 ? '+' : rozdil < 0 ? '−' : '±') + kgCz(Math.abs(rozdil)) + ' kg proti ' + kdyZapsano(pred.kdy) : '',
        c && b.kdy > c.od.t ? 'plán ' + kgCz(planVahy(c, b.kdy)) + ' kg' : ''].filter(Boolean).join(' · ');
      return '<g class="graf-bod"' + bublina(kdyZapsano(b.kdy) + ' · ' + NAZEV_DOBY[dobaVazeni(b.kdy)], kgCz(b.kg) + ' kg', pod) + '>' +
        '<rect class="graf-zasah" x="' + l.toFixed(1) + '" y="0" width="' + Math.max(0, r - l).toFixed(1) + '" height="' + (H + 18) + '"/>' +
        '<line class="graf-voditko" x1="' + xs[i].toFixed(1) + '" x2="' + xs[i].toFixed(1) + '" y1="' + P + '" y2="' + (H - 4) + '"/>' +
        '<circle class="graf-vahy__bod' + (dobaVazeni(b.kdy) === 'rano' ? ' graf-vahy__bod--rano' : '') + '" cx="' + xs[i].toFixed(1) + '" cy="' + y(b.kg).toFixed(1) +
        '" r="3.6" data-kotva/></g>';
    }).join('') +
    '<text class="graf-vahy__popis" x="' + P + '" y="' + (H + 14) + '">' + esc(dm(t0)) + '</text>' +
    '<text class="graf-vahy__popis" x="' + (W - P) + '" y="' + (H + 14) + '" text-anchor="end">' + esc(dm(t1)) + '</text></svg>';
}

// Denní doba vážení: ráno (do 11 h) / přes den / večer (od 17 h). Váha během dne kolísá o 1–2 kg (jídlo, pití) –
// Michal 9. 10.: „za den jsem ‚přibral‘ 2 kila, ráno 81,5 a pak 83,5“ → rozdíl i čára jen ve stejnou denní dobu.
const dobaVazeni = (t) => { const h = new Date(t).getHours(); return h < 11 ? 'rano' : h < 17 ? 'den' : 'vecer'; };
const NAZEV_DOBY = { rano: 'ráno', den: 'přes den', vecer: 'večer' };

/** Minulé vážení ve stejnou denní dobu (nejvýš 21 dní zpátky), nebo null. */
function minuleStejne(z, i) {
  const x = z[i];
  for (let j = i - 1; j >= 0; j--) {
    if (x.kdy - z[j].kdy > 21 * 864e5) return null;
    if (dobaVazeni(z[j].kdy) === dobaVazeni(x.kdy)) return z[j];
  }
  return null;
}

/** Poslední váha s časem vážení a rozdílem proti minulému vážení ve stejnou denní dobu (karta ve Zdraví i na Dnes). */
function posledniVahaHtml(z) {
  const posl = z[z.length - 1];
  if (!posl) return '<p class="prazdne vaha-prazdne">Zatím žádný zápis. Napiš váhu – nejlíp ráno po probuzení, ať se dá porovnávat.</p>';
  const pred = minuleStejne(z, z.length - 1);
  const rozdil = pred ? Math.round((posl.kg - pred.kg) * 10) / 10 : null;
  return '<p class="vaha-ted"><b class="cisla">' + kgCz(posl.kg) + '<small>kg</small></b><span>' + esc(kdyZapsano(posl.kdy)) + ' · ' + NAZEV_DOBY[dobaVazeni(posl.kdy)] +
    (rozdil != null ? '<br><em>' + (rozdil > 0 ? '+' : rozdil < 0 ? '−' : '±') + kgCz(Math.abs(rozdil)) + ' kg</em> proti ' + esc(kdyZapsano(pred.kdy))
      : '<br><small>srovnám s dalším vážením ' + (dobaVazeni(posl.kdy) === 'rano' ? 'ráno' : 've stejnou dobu') + '</small>') + '</span></p>';
}

function vahaZapisHtml() {
  return '<div class="vaha-zapis"><input class="field" data-vaha-pole inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="např. 80,4" aria-label="Váha v kg" value="' +
    esc(rozepsanaVaha) + '"><span>kg</span><button type="button" class="btn btn--primary" data-vaha-zapsat>Zapsat</button>' +
    '<button type="button" class="btn btn--ikona" data-vaha-cas aria-label="Zapsat s jiným časem (vážil ses dřív)" title="Zapsat s jiným časem">' + IKONY.cas + '</button></div>';
}

/** Váha na Dnes (Michal 5. 10.: zapisovat i z hlavní stránky) – poslední zápis a pole; cíl, čára a historie jsou ve Zdraví. */
export function kartaVahyDnesHtml() {
  return hlavickaKarty(IKONY.vaha, 'Váha', '<button type="button" class="sipka" data-cil="zdravi" aria-label="Historie váhy ve Zdraví" title="Historie váhy ve Zdraví">' + IKONY.sipka + '</button>') +
    '<div class="dlazdice__telo">' + posledniVahaHtml(vahy()) + vahaZapisHtml() + '</div>';
}

export function kartaVahyHtml() {
  const z = vahy();
  return hlavickaKarty(IKONY.vaha, 'Váha', z.length ? '<span class="muted small">' + z.length + ' ' + tvar(z.length, 'zápis', 'zápisy', 'zápisů') + '</span>' : '') +
    '<div class="dlazdice__telo">' + posledniVahaHtml(z) + cilVahyHtml() + vahaZapisHtml() +
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

/** Zapíše váhu (kdy = čas vážení v ms, když se vážil dřív; jinak čas dá motor). Vrací true, když se povedlo. */
export function zapisVahu(text, kdy) {
  const kg = kgZTextu(text);
  if (kg == null) { toast('Napiš váhu v kg, třeba 80,4', true); return Promise.resolve(false); }
  return volej('vaha', kdy ? { kg, kdy } : { kg })
    .then((v) => {
      rozepsanaVaha = '';
      // pole pustit (zavře klávesnici na telefonu) – karta se pak překreslí s novou váhou
      const a = document.activeElement;
      if (a && a.matches && a.matches('[data-vaha-pole]')) a.blur();
      poVaze(v.zaznamy || []);
      const posl = (v.zaznamy || []).slice(-1)[0];
      toast('Zapsáno ' + kgCz(kg) + ' kg' + (posl ? ' · ' + kdyZapsano(posl.kdy) : ''));
      return true;
    })
    .catch((e) => { toast(e.message, true); return false; });
}

/** Datum a čas pro pole datetime-local (místní čas, bez vteřin). */
const proPole = (t) => { const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

/**
 * „+“ → Váha a hodiny u pole na Dnes: okno s kg a časem vážení (Michal 9. 10.: „ne vždy když se zvážím, si to hned
 * napíšu“) – Teď / Dnes ráno / Včera večer nebo vlastní čas.
 */
export function otevriVahu() {
  const ted = Date.now();
  const dnesRano = new Date(); dnesRano.setHours(7, 0, 0, 0);
  const vcerVecer = new Date(); vcerVecer.setDate(vcerVecer.getDate() - 1); vcerVecer.setHours(21, 0, 0, 0);
  const volby = [['Teď', ted], ['Dnes ráno', dnesRano.getTime()], ['Včera večer', vcerVecer.getTime()]].filter((v) => v[1] <= ted);
  otevriPanel({
    id: 'vaha', trida: 'panel-okno panel-vaha', titul: 'Váha',
    vykresli: () => '<div class="vaha-okno"><label><span class="label">Kg</span><input class="field" data-vaha-okno-kg inputmode="decimal" enterkeyhint="done" ' +
        'autocomplete="off" placeholder="např. 80,4" value="' + esc(rozepsanaVaha) + '"></label>' +
      '<label><span class="label">Kdy ses vážil</span><input class="field" type="datetime-local" data-vaha-okno-kdy max="' + proPole(ted) + '" value="' + proPole(ted) + '"></label>' +
      '<div class="chipy" role="group" aria-label="Rychlý výběr času">' + volby.map((v) => '<button type="button" class="chip" data-vaha-okno-cas="' + proPole(v[1]) + '">' + v[0] + '</button>').join('') + '</div>' +
      '<p class="napoveda">Nejlíp se porovnává ráno po probuzení – přes den váha kolísá o 1–2 kg (jídlo, pití). Rozdíl ukazuju proti vážení ve stejnou denní dobu.</p></div>',
    paticka: () => '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--primary" data-vaha-okno-zapsat>Zapsat</button></div>',
    poOtevreni: (el) => { const p = el.querySelector('[data-vaha-okno-kg]'); if (p) p.focus({ preventScroll: true }); }
  });
}

/** Zápis z okna: čas do dvou minut od teď = teď (čas dá motor), jinak zvolený čas vážení. */
function zapisZOknaVahy(tlacitko) {
  const el = elementPanelu('vaha');
  if (!el) return;
  const pole = el.querySelector('[data-vaha-okno-kdy]').value;
  const kdy = pole ? new Date(pole).getTime() : NaN;
  const zpetne = kdy && Math.abs(Date.now() - kdy) > 2 * 60000 ? kdy : null;
  tlacitko.disabled = true;
  zapisVahu(el.querySelector('[data-vaha-okno-kg]').value, zpetne).then((ok) => { if (ok) zavriPanel(); else tlacitko.disabled = false; });
}

/** Starší název (jinde v aplikaci) – okno s časem. */
export function zapisVahuOknem() { otevriVahu(); return Promise.resolve(true); }

/** Psaní do pole váhy (app.js – událost input) a Enter = Zapsat (app.js – keydown). */
export function vstupZdravi(e) {
  if (!e.target.matches) return false;
  if (e.target.matches('[data-jidlo-co]')) {
    // odhad bílkovin se přepočítá při psaní (jen box pod polem – pole i klávesnice zůstanou)
    const box = e.target.closest('.jidlo-form').querySelector('[data-jidlo-odhad]');
    if (box) box.innerHTML = odhadJidlaHtml(e.target.value);
    return true;
  }
  if (!e.target.matches('[data-vaha-pole]')) return false;
  rozepsanaVaha = e.target.value;
  return true;
}
export function klavesaZdravi(e) {
  if (e.key !== 'Enter' || !e.target.matches) return false;
  // jídlo: Enter = Uložit (Shift+Enter nový řádek)
  if (e.target.matches('[data-jidlo-co]') && !e.shiftKey) {
    e.preventDefault();
    const b = document.querySelector('[data-panel="jidlo"] [data-jidlo-ulozit]');
    if (b) b.click();
    return true;
  }
  if (e.target.matches('[data-vaha-okno-kg]')) {
    e.preventDefault();
    const b = document.querySelector('[data-panel="vaha"] [data-vaha-okno-zapsat]');
    if (b) b.click();
    return true;
  }
  if (!e.target.matches('[data-vaha-pole]')) return false;
  e.preventDefault();
  zapisVahu(e.target.value);
  return true;
}

// ---------------------------------------------------------------- Doplňky dnes (režim z ZDRAVI_REZIM.json na Disku)

const KDY = [['rano', 'Ráno'], ['svacina', 'Svačina'], ['obed', 'K obědu'], ['pred', 'Před tréninkem'], ['zapas', 'Zápas'], ['po', 'Po zátěži'], ['vecer', 'Večer']];
const VZATO = 'asistent.doplnky.';                 // starší motor: odškrtnutí jen v zařízení (den → { id: true })
const CEKAJICI = 'asistent.doplnkyCekajici';       // změny, které motor ještě nepotvrdil { den: { id: true | false } }
const DNY_TYDNE = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const DOPLNKY_ZPET = 56;                           // kolik dní zpátky jde karta Doplňky otevřít (motor drží 120)
const DOPLNKY_VYBER_MIN = 15;                      // vybraný minulý den se bez klepnutí po čtvrthodině vrátí na dnešek
let casovacDoplnku = 0;
let denDoplnku = 0, denDoplnkuKdy = 0;             // den, který karta ukazuje (půlnoc v ms; 0 = dnes), a kdy se naposledy klepalo

/** Den karty Doplňky: vybraný minulý den (nejvýš DOPLNKY_ZPET dní zpátky, klepnuto před méně než čtvrthodinou), jinak dnes. */
function denKartyDoplnku() {
  const dnes = pulnoc(Date.now());
  const plati = denDoplnku && denDoplnku < dnes && denDoplnku >= pridejDny(dnes, -DOPLNKY_ZPET) &&
    Date.now() - denDoplnkuKdy < DOPLNKY_VYBER_MIN * 60000;
  return plati ? denDoplnku : dnes;
}

/** Zápas v daný den? Z dat fotbal.cz (týmy v rezim.zapasTymy) nebo ze zápasu v kalendáři. → čas výkopu (ms) nebo null */
function zapasVDen(rezim, denMs) {
  const den = isoDatum(denMs);
  const tymy = rezim.zapasTymy || [];
  const f = stav.fotbal && stav.fotbal.data;
  const z = f && (f.zapasy || []).find((x) => tymy.indexOf(x.tym) >= 0 && isoDatum(Date.parse(x.zacatek)) === den);
  if (z) return Date.parse(z.zacatek);
  const od = pulnoc(denMs);
  const u = udalostiVRozsahu(od, pridejDny(od, 1)).find((x) => jeZapas(x) && !x.celodenni);
  return u ? u.zacatek : null;
}

/** Den podle režimu: zápas, trénink a které položky ten den platí. */
function denRezimu(rezim, denMs) {
  const vykop = zapasVDen(rezim, denMs);
  const trenink = (rezim.treninkDny || []).indexOf(new Date(denMs).getDay()) >= 0;
  return { vykop, trenink, plati: (p) => !p.jen || (p.jen === 'zapas' && vykop) || (p.jen === 'trenink' && trenink) || (p.jen === 'zatez' && (trenink || vykop)) };
}

/** Odškrtnuté v den (RRRR-MM-DD): z motoru (Disk – stejné na telefonu i PC) + změny, které ještě neodešly; starší motor: jen zařízení. */
function vzatoVDen(den) {
  const server = stav.zdravi && stav.zdravi.doplnky;
  const vzato = server ? Object.assign({}, server[den] || {}) : Object.assign({}, uloziste.cti(VZATO + den) || {});
  const cekajici = (uloziste.cti(CEKAJICI) || {})[den] || {};
  Object.keys(cekajici).forEach((id) => { if (cekajici[id]) vzato[id] = true; else delete vzato[id]; });
  return vzato;
}

/**
 * Hlavní doplňky (Michal 9. 10.: podstatné jsou jen některé, „dále se to nemusí započítávat“):
 * ZDRAVI_REZIM.json → hlavni = [id…]. Do plnění (zbývá, x z y, procenta týdne) se počítají jen ty; ostatní se ukazují
 * šedě pod nimi. Bez seznamu (starší režim) se počítá všechno. Doplněk „jen k zápasu“ je hlavní jen v den zápasu.
 */
function jeHlavni(rezim, p) {
  return !Array.isArray(rezim.hlavni) || !rezim.hlavni.length || rezim.hlavni.indexOf(p.id) >= 0;
}

/**
 * Týden (Po–Ne) se dnem denMs: kolik z platných hlavních položek bylo vzato – po dnech a celkem; u každé položky
 * (i vedlejší) kolik dní z platných (budoucí dny se nepočítají).
 */
function tydenDoplnku(rezim, denMs) {
  const dnes = pulnoc(Date.now());
  const vybrany = pulnoc(denMs);
  const pondeli = zacatekTydne(vybrany);
  const dny = [];
  const polozky = {};
  let vzato = 0, celkem = 0;
  for (let i = 0; i < 7; i++) {
    const d = pridejDny(pondeli, i);
    if (d > dnes) { dny.push({ d, budouci: true }); continue; }
    const x = vzatoVDen(isoDatum(d));
    const plati = rezim.polozky.filter(denRezimu(rezim, d).plati);
    const hlavni = plati.filter((p) => jeHlavni(rezim, p));
    const n = hlavni.filter((p) => x[p.id]).length;
    plati.forEach((p) => { const s = (polozky[p.id] = polozky[p.id] || { vzato: 0, dni: 0 }); s.dni++; if (x[p.id]) s.vzato++; });
    dny.push({ d, vzato: n, celkem: hlavni.length, dnes: d === dnes, vybrany: d === vybrany });
    vzato += n;
    celkem += hlavni.length;
  }
  return { dny, vzato, celkem, polozky, pondeli, tentoTyden: pondeli === zacatekTydne(dnes) };
}

/**
 * Co brát v den (půlnoc v ms; bez něj dnes): položky režimu podle dne (trénink, zápas), odškrtnutí a týden.
 * polozky[].hlavni = počítá se do plnění; plneni = { vzato, celkem } jen z hlavních, které ten den platí (kroužky, karta).
 */
export function doplnkyDnes(denMs) {
  const rezim = stav.zdravi && stav.zdravi.rezim;
  if (!rezim || !Array.isArray(rezim.polozky) || !rezim.polozky.length) return null;
  const d = pulnoc(denMs || Date.now());
  const den = denRezimu(rezim, d);
  const vzato = vzatoVDen(isoDatum(d));
  // i doplněk, který ten den podle režimu neplatí, ale byl vzat (elektrolyty mimo zápas – napsané do jídla) → „navíc“
  const polozky = rezim.polozky.filter((p) => den.plati(p) || vzato[p.id])
    .map((p) => Object.assign({ vzato: !!vzato[p.id], navic: !den.plati(p), hlavni: jeHlavni(rezim, p) }, p))
    .sort((a, b) => KDY.findIndex((k) => k[0] === a.kdy) - KDY.findIndex((k) => k[0] === b.kdy));
  const pocitane = polozky.filter((p) => p.hlavni && !p.navic);
  return { d, dnes: d === pulnoc(Date.now()), polozky, vykop: den.vykop, trenink: den.trenink, kofeinDo: rezim.kofeinDo || '', chyba: rezim.chyba || '',
    plneni: { vzato: pocitane.filter((p) => p.vzato).length, celkem: pocitane.length }, tyden: tydenDoplnku(rezim, d) };
}

/** Plnění hlavních doplňků dnes { vzato, celkem } (null bez režimu) – pro kroužky na Dnes. */
export function plneniDoplnku() {
  const d = doplnkyDnes();
  return d ? d.plneni : null;
}

export function kartaDoplnkuHtml() {
  const d = doplnkyDnes(denKartyDoplnku());
  if (!d) return '';
  const zbyva = d.plneni.celkem - d.plneni.vzato;
  const nazevKdy = (k) => (KDY.find((x) => x[0] === k) || [k, k])[1];
  const den = d.vykop ? 'den zápasu · výkop ' + hhmm(d.vykop) : d.trenink ? 'tréninkový den' : '';
  const kofein = d.dnes && !d.vykop && d.kofeinDo && new Date().getHours() < 18 ? 'Kofein naposledy ve ' + d.kofeinDo + '.' : '';
  const t = d.tyden;
  // týden: klepnutím na den ho karta ukáže (oprava zpětně), šipky o týden; nejdál DOPLNKY_ZPET dní
  const nejdal = pridejDny(pulnoc(Date.now()), -DOPLNKY_ZPET);
  const predchozi = pridejDny(d.d, -7), dalsi = Math.min(pridejDny(d.d, 7), pulnoc(Date.now()));
  const sipka = (cil, smi, ikona, popis) => '<button type="button" class="doplnky-tyden__sipka" data-doplnky-ukaz="' + isoDatum(cil) + '" aria-label="' + popis + '"' +
    (smi ? '' : ' disabled') + '>' + ikona + '</button>';
  const sHlavnimi = Array.isArray(((stav.zdravi && stav.zdravi.rezim) || {}).hlavni);
  // pásek týdne: plný / částečný den podle hlavních doplňků; bublina s „x z y“, klepnutím se den otevře (oprava zpětně)
  const tyden = t.celkem ? '<div class="doplnky-tyden"><span>' +
    (t.tentoTyden ? 'Tento týden' : dm(t.pondeli) + '–' + dm(pridejDny(t.pondeli, 6))) + '</span>' +
    sipka(predchozi, predchozi >= nejdal, IKONY.vlevo, 'Předchozí týden') + sipka(dalsi, !t.tentoTyden, IKONY.vpravo, 'Další týden') +
    '<b class="cisla">' + Math.round(t.vzato / t.celkem * 100) + ' %</b><ol>' +
    t.dny.map((x, i) => {
      const trida = (x.budouci ? 'budouci' : !x.celkem ? 'volno' : x.vzato >= x.celkem ? 'plny' : x.vzato ? 'cast' : 'nic') + (x.dnes ? ' dnes' : '') + (x.vybrany ? ' vybrany' : '');
      const klik = !(x.budouci || !x.celkem || x.d < nejdal);
      const atr = bublina((x.dnes ? 'dnes · ' : '') + DNY_TYDNE[i] + ' ' + dm(x.d), x.budouci ? 'ještě nebyl' : !x.celkem ? 'nic k braní' :
        x.vzato + ' z ' + x.celkem + (sHlavnimi ? ' hlavních' : ''), klik && !x.vybrany ? 'klepnutím den otevřeš a opravíš' : '');
      return '<li class="' + trida + '">' + (klik ? '<button type="button" data-doplnky-ukaz="' + isoDatum(x.d) + '"' + atr + (x.vybrany ? ' aria-current="date"' : '') + '>' +
        DNY_TYDNE[i] + '</button>' : '<span' + atr + '>' + DNY_TYDNE[i] + '</span>') + '</li>';
    }).join('') + '</ol></div>' : '';
  const nadpis = d.dnes ? 'Doplňky dnes' : 'Doplňky · ' + DNY_KR[new Date(d.d).getDay()] + ' ' + dm(d.d);
  const stavDne = !d.plneni.celkem ? '' : !zbyva ? 'vše ✓' : d.dnes ? 'zbývá ' + zbyva : 'vzato ' + d.plneni.vzato + ' z ' + d.plneni.celkem;
  const radek = (p) => {
    const s = t.polozky[p.id];
    return '<li><button type="button" class="doplnek' + (p.hlavni ? '' : ' doplnek--vedlejsi') + '" data-doplnek="' + esc(p.id) + '" data-doplnek-den="' + isoDatum(d.d) +
      '" aria-pressed="' + p.vzato + '">' +
      '<i class="zaskrt" aria-hidden="true">' + IKONY.fajfka + '</i><span><b>' + esc(p.nazev) + '</b><small>' + (p.navic ? 'navíc · ' : '') + esc(nazevKdy(p.kdy)) + (p.davka ? ' · ' + esc(p.davka) : '') + '</small></span>' +
      (s && s.dni > 1 ? '<em class="doplnek__tyden cisla" title="za týden">' + s.vzato + '/' + s.dni + '</em>' : '') + '</button></li>';
  };
  // hlavní nahoře, ostatní šedě pod čarou – ukazují se a jdou odškrtnout, ale do plnění se nepočítají
  const vedlejsi = d.polozky.filter((p) => !p.hlavni);
  return hlavickaKarty(IKONY.doplnky, nadpis, '<span class="muted small">' + stavDne + '</span>' +
      (d.dnes ? '' : '<button type="button" class="odkaz small" data-doplnky-ukaz="dnes">Dnes</button>')) +
    (d.chyba ? '<p class="pruh pruh-varovani">' + esc(d.chyba) + '</p>' : '') +
    '<ul class="doplnky">' + d.polozky.filter((p) => p.hlavni).map(radek).join('') +
      (vedlejsi.length ? '<li class="doplnky__oddel">Ostatní · nepočítají se</li>' + vedlejsi.map(radek).join('') : '') + '</ul>' + tyden +
    (den || kofein ? '<p class="doplnky-pozn">' + [den ? velkym(den) : '', kofein].filter(Boolean).join(' · ') + '</p>' : '');
}

/** Odškrtnout (vzato) / zrušit doplňky v den: hned v kartě, na Disk (stejné na telefonu i PC); víc klepnutí = jeden dotaz. */
function nastavDoplnky(den, idy, vzato) {
  const c = uloziste.cti(CEKAJICI) || {};
  idy.forEach((id) => { (c[den] = c[den] || {})[id] = vzato; });
  uloziste.pis(CEKAJICI, c);
  clearTimeout(casovacDoplnku);
  casovacDoplnku = setTimeout(odesliDoplnky, 700);
}

/** Změny odškrtnutí → motor (ZDRAVI/DOPLNKY.json na Disku). Bez sítě zůstanou čekat a odejdou při dalším načtení Zdraví. */
function odesliDoplnky() {
  const c = uloziste.cti(CEKAJICI) || {};
  const dny = Object.keys(c).filter((den) => Object.keys(c[den] || {}).length);
  if (!dny.length || !umiMotor('doplnky')) return Promise.resolve();
  return dny.reduce((retez, den) => retez.then(() => {
    const zmeny = Object.assign({}, c[den]);
    return volej('doplnky', { den, zmeny }).then((r) => {
      if (stav.zdravi) { stav.zdravi.doplnky = r.dny || {}; uloziste.pis(ULOZISTE, { data: stav.zdravi, kdy: Date.now() }); }
      const ted = uloziste.cti(CEKAJICI) || {};
      Object.keys(zmeny).forEach((id) => { if (ted[den] && ted[den][id] === zmeny[id]) delete ted[den][id]; });
      if (ted[den] && !Object.keys(ted[den]).length) delete ted[den];
      uloziste.pis(CEKAJICI, ted);
    });
  }), Promise.resolve()).catch(() => { /* odejde při dalším načtení Zdraví */ }).then(zmeneno);
}

// ---------------------------------------------------------------- Pití a jídlo (ZDRAVI/PITI_JIDLO.json; diktát → Claude)

const CIL_PITI = 2500, CIL_BILKOVIN = 130; // výchozí cíle – v ZDRAVI_REZIM.json jdou změnit (pitiCil v ml, bilkovinyCil v g)
const litry = (ml) => (Math.round(ml / 50) / 20).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' l';
const pitiDne = (den) => (stav.zdravi && stav.zdravi.pitiJidlo && stav.zdravi.pitiJidlo[den]) || { piti: [], jidlo: [] };

/** Součty dne: ml pití, bílkoviny z jídel a z odškrtnutých doplňků (položky režimu s „bilkoviny“ – whey, smoothie). */
function souctyDne(den) {
  const z = pitiDne(den);
  const rezim = (stav.zdravi && stav.zdravi.rezim) || {};
  const vzato = vzatoVDen(den);
  const doplnky = (rezim.polozky || []).filter((p) => Number(p.bilkoviny) > 0 && vzato[p.id]).map((p) => ({ co: p.nazev, bilkoviny: Number(p.bilkoviny), doplnek: true }));
  const jidla = z.jidlo.concat(doplnky);
  return { ml: z.piti.reduce((s, x) => s + (x.ml || 0), 0), b: jidla.reduce((s, x) => s + (x.bilkoviny || 0), 0), kcal: z.jidlo.reduce((s, x) => s + (x.kcal || 0), 0),
    odhad: z.jidlo.some((x) => x.odhad === 'mistni'), z, jidla };
}

/** Hodnocení stravy od Clauda (večer za den): dnešní, ráno ještě včerejší. */
function hodnoceniHtml(dnes) {
  const dnesni = pitiDne(isoDatum(dnes)).hodnoceni, vcerejsi = pitiDne(isoDatum(pridejDny(dnes, -1))).hodnoceni;
  const h = dnesni || (new Date().getHours() < 14 ? vcerejsi : null);
  if (!h) return '';
  return '<div class="piti__hodnoceni">' + (h.znamka ? '<span class="znamka znamka--' + esc(String(h.znamka).charAt(0).toUpperCase()) + '">' + esc(h.znamka) + '</span>' : '') +
    '<p><b>' + (dnesni ? 'Dnešek' : 'Včerejšek') + ' podle Clauda</b>' + esc(h.text) + '</p></div>';
}

export function kartaPitiHtml() {
  if (!umiMotor('pitiJidlo') || !stav.zdravi) return '';
  const rezim = stav.zdravi.rezim || {};
  const cilPiti = Number(rezim.pitiCil) || CIL_PITI, cilB = Number(rezim.bilkovinyCil) || CIL_BILKOVIN;
  const dnes = pulnoc(Date.now());
  const s = souctyDne(isoDatum(dnes));
  const pct = (x, cil) => Math.min(100, Math.round((x / cil) * 100));
  const po = pridejDny(dnes, -((new Date(dnes).getDay() + 6) % 7));
  const tyden = [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = pridejDny(po, i); return { d, ml: souctyDne(isoDatum(d)).ml }; });
  const posledni = s.z.piti.filter((x) => !x.claude && x.id).slice(-1)[0];
  let h = hlavickaKarty(IKONY.kapka, 'Pití a jídlo', '<span class="muted small">dnes</span>') + '<div class="piti">' +
    '<div class="piti__radek"><span class="piti__ikona" aria-hidden="true">💧</span><div class="piti__text"><b class="cisla">' + litry(s.ml) + '</b>' +
      '<small> z ' + litry(cilPiti) + '</small><div class="piti__pruh"><i style="width:' + pct(s.ml, cilPiti) + '%"></i></div></div>' +
      '<div class="piti__akce"><button type="button" class="btn btn--sm" data-piti="250">+0,25 l</button><button type="button" class="btn btn--sm" data-piti="500">+0,5 l</button>' +
      (posledni ? '<button type="button" class="odkaz" data-piti-zpet="' + esc(posledni.id) + '">zpět</button>' : '') + '</div></div>' +
    '<div class="piti__radek"><span class="piti__ikona" aria-hidden="true">🥩</span><div class="piti__text"><b class="cisla">' + (s.odhad ? '≈ ' : '') + s.b + ' g</b>' +
      '<small> bílkovin z ' + cilB + ' g' + (s.kcal ? ' · ' + (s.odhad ? '≈ ' : '') + s.kcal.toLocaleString('cs-CZ') + ' kcal' : '') + '</small>' +
      '<div class="piti__pruh piti__pruh--b"><i style="width:' + pct(s.b, cilB) + '%"></i></div></div>' +
      '<div class="piti__akce"><button type="button" class="btn btn--sm btn--ghost" data-jidlo-pridat>' + IKONY.plus + '<span>Jídlo</span></button></div></div>';
  if (s.jidla.length) {
    // ≈ = odhad aplikace (Claude ho upřesní), „Claude“ = upřesněno (v titulku jeho poznámka)
    const stitek = (j) => (j.doplnek ? ' <small>doplněk</small>' : j.claude ? ' <small>z diktátu</small>' : j.odhad === 'claude' ? ' <small title="' + esc(j.poznamka || 'upřesnil Claude') + '">Claude</small>' : '');
    h += '<ul class="piti__jidla">' + s.jidla.map((j) => '<li><span class="orez-1">' + esc(j.co) + stitek(j) + '</span>' +
      '<b class="cisla"' + (j.odhad === 'mistni' ? ' title="odhad aplikace – Claude ho upřesní"' : '') + '>' + (j.odhad === 'mistni' ? '≈ ' : '') + j.bilkoviny + ' g</b>' +
      (j.id ? '<button type="button" class="btn btn--ikona btn--sm" data-jidlo-smazat="' + esc(j.id) + '" aria-label="Smazat ' + esc(j.co) + '">' +
      IKONY.zavrit + '</button>' : '<span class="piti__misto"></span>') + '</li>').join('') + '</ul>';
  }
  h += hodnoceniHtml(dnes);
  // týden pití: sloupek = podíl cíle; bublina (najetí, klepnutí, šipky) s litry a procentem cíle
  h += '<ol class="piti__tyden"' + grafAtr('Pití tento týden') + ' data-graf-i="' + tyden.findIndex((t) => t.d === dnes) + '">' +
    tyden.map((t, i) => '<li class="' + (t.d > dnes ? 'budouci' : t.d === dnes ? 'dnes' : '') + '"' +
    bublina((t.d === dnes ? 'dnes · ' : '') + DNY_TYDNE[i] + ' ' + dm(t.d), t.d > dnes ? 'ještě nebyl' : litry(t.ml), t.d > dnes ? '' : 'z ' + litry(cilPiti) + ' · ' +
      Math.round(t.ml / cilPiti * 100) + ' % cíle') + '><span><i style="height:' + pct(t.ml, cilPiti) + '%"></i></span><small>' + DNY_TYDNE[i] + '</small></li>').join('') + '</ol>' +
    '<p class="napoveda">Jídlo stačí napsat („3 vejce a chleba“) – bílkoviny odhadnu hned, Claude je upřesní a večer zhodnotí den. Jde to i diktátem pro Clauda.</p></div>';
  return h;
}

/** Přidat / smazat zápis: hned v kartě, pak motor (při chybě zpět). */
function zapisPiti(data, zprava) {
  const den = data.den;
  const puvodni = stav.zdravi && stav.zdravi.pitiJidlo;
  if (data.jak === 'piti' || data.jak === 'jidlo') {
    const z = JSON.parse(JSON.stringify(pitiDne(den)));
    if (data.jak === 'piti') z.piti.push({ ml: data.ml, kdy: Date.now() });
    else z.jidlo.push({ co: data.co, bilkoviny: data.bilkoviny, kcal: data.kcal, kdy: Date.now(), odhad: data.odhad ? 'mistni' : undefined });
    stav.zdravi.pitiJidlo = Object.assign({}, puvodni, { [den]: z });
    zmeneno();
  }
  return volej('pitiJidlo', data)
    .then((r) => {
      stav.zdravi.pitiJidlo = r.dny || {};
      uloziste.pis(ULOZISTE, { data: stav.zdravi, kdy: Date.now() });
      if (zprava) toast(zprava);
      zmeneno();
    })
    .catch((e) => { stav.zdravi.pitiJidlo = puvodni; zmeneno(); toast(e.message, true); throw e; });
}

// ---- Jídlo napsané slovy (Michal 9. 10.: „napíšu, co jsem měl, bez bílkovin – pošle se to Claudovi a zapíše“):
// bílkoviny a kcal hned odhadne aplikace (js/jidlo_odhad.js), Claude je při další schránce upřesní a večer zhodnotí den;
// doplňky v textu („elektrolyty“, „kreatin“) se jen odškrtnou.

/** Doplňky režimu pro poznání v textu jídla. */
function doplnkyRezimu() { return ((stav.zdravi && stav.zdravi.rezim && stav.zdravi.rezim.polozky) || []).map((p) => ({ id: p.id, nazev: p.nazev })); }
function nazevDoplnku(id) { const p = doplnkyRezimu().find((x) => x.id === id); return p ? p.nazev : id; }

/** Odhad pod polem (překresluje se při psaní). */
function odhadJidlaHtml(text) {
  if (!String(text || '').trim()) return '<p class="jidlo-odhad__prazdne">Napiš, co jsi měl – bílkoviny a kcal spočítám hned.</p>';
  const o = odhadniJidlo(text, doplnkyRezimu());
  let h = '';
  if (o.polozky.length) {
    h += '<p class="jidlo-odhad__soucet"><b class="cisla">≈ ' + o.bilkoviny + ' g</b> bílkovin · <span class="cisla">' + o.kcal.toLocaleString('cs-CZ') + ' kcal</span>' +
      (o.jisty ? '' : ' <small>– část neznám, Claude doplní</small>') + '</p><ul class="jidlo-odhad__polozky">' + o.polozky.map((x) =>
        '<li><span>' + esc(x.co) + (x.g ? ' <small>' + x.g + ' g</small>' : '') + (x.znamo === false ? ' <small>?</small>' : '') + '</span><b class="cisla">' + x.bilkoviny + ' g</b></li>').join('') + '</ul>';
  }
  if (o.doplnky.length) h += '<p class="jidlo-odhad__doplnky">' + IKONY.fajfka + '<span>Odškrtnu doplněk: <b>' + o.doplnky.map((id) => esc(nazevDoplnku(id))).join(', ') + '</b></span></p>';
  return h || '<p class="jidlo-odhad__prazdne">Tohle neznám – Claude to odhadne.</p>';
}

/** Okno „Co jsi jedl?“ (Pití a jídlo → Jídlo, „+“ → Jídlo). */
export function otevriJidlo() {
  otevriPanel({
    id: 'jidlo', trida: 'panel-okno panel-jidlo', titul: 'Co jsi jedl?',
    vykresli: () => '<div class="jidlo-form"><label><span class="label">Jídlo, pití, doplňky</span><textarea class="field" data-jidlo-co rows="2" maxlength="200" enterkeyhint="done" ' +
        'placeholder="např. 3 vejce a chleba · k obědu kuře s rýží · elektrolyty"></textarea></label>' +
      '<div class="jidlo-odhad" data-jidlo-odhad aria-live="polite">' + odhadJidlaHtml('') + '</div>' +
      '<details class="jidlo-presne"><summary>Bílkoviny vím přesně</summary><div class="jidlo-cisla"><label><span class="label">Bílkoviny (g)</span>' +
        '<input class="field" data-jidlo-b inputmode="numeric"></label><label><span class="label">kcal</span><input class="field" data-jidlo-kcal inputmode="numeric"></label></div></details>' +
      '<p class="napoveda">Claude odhad upřesní při další schránce a večer zhodnotí celý den.</p></div>',
    paticka: () => '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--primary" data-jidlo-ulozit>Uložit</button></div>',
    poOtevreni: (el) => { const p = el.querySelector('[data-jidlo-co]'); if (p) p.focus({ preventScroll: true }); }
  });
}

function ulozJidlo(tlacitko) {
  const el = elementPanelu('jidlo');
  if (!el) return;
  const text = el.querySelector('[data-jidlo-co]').value.trim();
  if (!text) { toast('Napiš, co jsi jedl.', true); return; }
  const rucneB = String(el.querySelector('[data-jidlo-b]').value).trim(), rucneK = String(el.querySelector('[data-jidlo-kcal]').value).trim();
  const o = odhadniJidlo(text, doplnkyRezimu());
  const den = isoDatum(Date.now());
  const doplnky = o.doplnky.map(nazevDoplnku).join(', ');
  if (o.doplnky.length && umiMotor('doplnky')) { nastavDoplnky(den, o.doplnky, true); zmeneno(); }
  if (!o.text) { toast('Zapsáno: ' + doplnky + ' ✓'); zavriPanel(); return; }
  const rucne = rucneB !== '';
  const cislo = (t) => Math.round(Number(String(t).replace(',', '.')) || 0);
  const data = { den, jak: 'jidlo', co: o.text, bilkoviny: rucne ? cislo(rucneB) : o.bilkoviny, kcal: rucneK ? cislo(rucneK) : o.kcal, odhad: !rucne };
  tlacitko.disabled = true;
  zapisPiti(data, 'Zapsáno: ' + data.co + ' · ' + (rucne ? '' : '≈ ') + data.bilkoviny + ' g bílkovin' + (doplnky ? ' + ' + doplnky + ' ✓' : ''))
    .then(() => zavriPanel())
    .catch(() => { tlacitko.disabled = false; });
}

/** Odškrtnutí z doby, kdy se pamatovalo jen v zařízení → poprvé na Disk (pak se staré klíče smažou). */
function prevedDoplnky() {
  if (!umiMotor('doplnky') || !stav.zdravi || !stav.zdravi.doplnky) return;
  const stare = uloziste.klice(VZATO).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k.slice(VZATO.length)));
  if (!stare.length) return;
  const c = uloziste.cti(CEKAJICI) || {};
  stare.forEach((k) => {
    const den = k.slice(VZATO.length);
    const mistni = uloziste.cti(k) || {};
    const server = stav.zdravi.doplnky[den] || {};
    Object.keys(mistni).forEach((id) => { if (mistni[id] && !server[id] && !(c[den] && id in c[den])) (c[den] = c[den] || {})[id] = true; });
    uloziste.smaz(k);
  });
  uloziste.pis(CEKAJICI, c);
}

function velkym(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------------------------------------------------------------- ovládání

export function klikZdravi(el) {
  if (el.dataset.piti) { zapisPiti({ den: isoDatum(Date.now()), jak: 'piti', ml: Number(el.dataset.piti) }).catch(() => {}); return true; }
  if (el.dataset.pitiZpet) { zapisPiti({ den: isoDatum(Date.now()), jak: 'smazat', id: el.dataset.pitiZpet }, 'Odebráno').catch(() => {}); return true; }
  if (el.hasAttribute('data-jidlo-pridat')) { otevriJidlo(); return true; }
  if (el.hasAttribute('data-jidlo-ulozit')) { ulozJidlo(el); return true; }
  if (el.dataset.jidloSmazat) {
    potvrd('Smazat jídlo?', { ikona: IKONY.smazat, ton: 'nebezpeci', ano: 'Smazat' }).then((ano) => {
      if (ano) zapisPiti({ den: isoDatum(Date.now()), jak: 'smazat', id: el.dataset.jidloSmazat }, 'Smazáno').catch(() => {});
    });
    return true;
  }
  if (el.dataset.doplnkyUkaz !== undefined) {
    const v = el.dataset.doplnkyUkaz;
    denDoplnku = /^\d{4}-\d{2}-\d{2}$/.test(v) ? pulnoc(Date.parse(v + 'T12:00:00')) : 0;
    denDoplnkuKdy = Date.now();
    zmeneno();
    return true;
  }
  if (el.dataset.doplnek) {
    const den = el.dataset.doplnekDen || isoDatum(Date.now());
    if (den !== isoDatum(Date.now())) denDoplnkuKdy = Date.now(); // opravuje se zpětně – vybraný den nechat
    const id = el.dataset.doplnek;
    const vzato = !vzatoVDen(den)[id];
    if (umiMotor('doplnky')) {
      nastavDoplnky(den, [id], vzato);
    } else {
      const klic = VZATO + den;
      const mistni = uloziste.cti(klic) || {};
      mistni[id] = vzato;
      uloziste.pis(klic, mistni);
      // staré dny pryč (jen posledních 7)
      uloziste.klice(VZATO).filter((k) => k < VZATO + isoDatum(pridejDny(pulnoc(Date.now()), -7))).forEach((k) => uloziste.smaz(k));
    }
    zmeneno();
    return true;
  }
  if (el.hasAttribute('data-vaha-zapsat')) {
    const pole = el.closest('.vaha-zapis').querySelector('[data-vaha-pole]');
    el.disabled = true;
    zapisVahu(pole.value).then(() => { el.disabled = false; });
    return true;
  }
  if (el.hasAttribute('data-vaha-cas')) {
    const pole = el.closest('.vaha-zapis').querySelector('[data-vaha-pole]');
    if (pole) rozepsanaVaha = pole.value;
    otevriVahu();
    return true;
  }
  if (el.dataset.vahaOknoCas) {
    const pole = el.closest('.vaha-okno').querySelector('[data-vaha-okno-kdy]');
    if (pole) pole.value = el.dataset.vahaOknoCas;
    return true;
  }
  if (el.hasAttribute('data-vaha-okno-zapsat')) { zapisZOknaVahy(el); return true; }
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
