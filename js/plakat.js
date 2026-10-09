// Plakát FK Agro Vnorovy – čisté funkce (bez prohlížeče, testuje je i Node: testy/plakat.test.mjs): víkendy a kola,
// plakát podle rozlosování (zápasy A-týmu, B-týmu a dorostu z fotbal.cz + mládež z plakat_data.js), znaky soupeřů,
// HTML plakátu jako na webu dorostu (assets/js/plakaty.js → vykresli) a souhrn víkendu pro Clauda (popisek na Instagram).

import { DNY, DNY_KR, MESICE, pulnoc, pridejDny, terminDatum, isoDatum, hhmm, dm, esc, klub } from './pomocne.js';
import { LOGA, NASTAVENI, ALIASY, KOLA, MLADEZ } from './plakat_data.js';

const LOGO = {};
LOGA.forEach((f) => { LOGO[f] = true; });
const velkymi = (s) => String(s == null ? '' : s).toUpperCase();
const cas = (z) => Date.parse(z.zacatek);
const souperZapasu = (z) => (z.doma ? z.hoste : z.domaci);

// ---------------------------------------------------------------- víkendy

/** Sobota víkendu, ke kterému zápas v čase t patří: sobota a neděle ten víkend, pátek ten následující, po–čt ten
 *  předchozí (blok V TÝDNU – jako na webu dorostu „PÁ 16. 10.“ u 17.–18. 10. a „ST 2. 9.“ u 29.–30. 8.). */
export function vikendZapasu(t) {
  return isoDatum(pridejDny(pulnoc(t), [-1, -2, -3, -4, -5, 1, 0][new Date(t).getDay()]));
}

/** Nejbližší nadcházející víkend (v sobotu a v neděli ten právě probíhající). */
export function vychoziVikend(ted) {
  const d = new Date(ted).getDay();
  return isoDatum(pridejDny(pulnoc(ted), d === 0 ? -1 : 6 - d));
}

/** Pořadí kola podzimu (1–13), 0 = víkend mimo podzim 2026. */
export function cisloKola(sobota) { return KOLA.indexOf(sobota) + 1; }

/** „17.–18. 10.“, přes konec měsíce „31. 10.–1. 11.“ (s rokem, když není letošní). */
export function rozsahVikendu(sobota, ted) {
  const so = terminDatum(sobota), ne = pridejDny(so, 1);
  const a = new Date(so), b = new Date(ne);
  return (a.getMonth() === b.getMonth() ? a.getDate() + '.–' : dm(so) + '–') + dm(ne) +
    (b.getFullYear() !== new Date(ted == null ? Date.now() : ted).getFullYear() ? ' ' + b.getFullYear() : '');
}

/** Ve výběru víkendu: „10. kolo · 17.–18. 10.“ (Michal říká „10. kolo“ = 10. víkend podzimu). */
export function popisVikendu(sobota, ted) {
  const k = cisloKola(sobota);
  return (k ? k + '. kolo · ' : '') + rozsahVikendu(sobota, ted);
}

/** Datum v hlavičce plakátu: „17.—18.“ a „ŘÍJNA 2026“, přes dva měsíce „31. 10.—1. 11.“ a „2026“ (jako web dorostu). */
export function datumPlakatu(sobota) {
  const so = terminDatum(sobota), ne = pridejDny(so, 1);
  const a = new Date(so), b = new Date(ne);
  if (a.getMonth() === b.getMonth()) return { datum: a.getDate() + '.—' + b.getDate() + '.', mesic: velkymi(MESICE[a.getMonth()]) + ' ' + a.getFullYear() };
  return { datum: dm(so) + '—' + dm(ne), mesic: String(b.getFullYear()) };
}

/** Víkendy ve výběru: kola podzimu, víkendy se zápasy z fotbal.cz, uložená kola a navíc (výchozí, vybraný). */
export function seznamVikendu(fotbal, kola, navic) {
  const s = {};
  KOLA.forEach((k) => { s[k] = true; });
  ((fotbal && fotbal.zapasy) || []).forEach((z) => { const t = cas(z); if (!isNaN(t)) s[vikendZapasu(t)] = true; });
  Object.keys(kola || {}).concat(navic || []).forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k || '')) s[k] = true; });
  return Object.keys(s).sort();
}

// ---------------------------------------------------------------- nastavení

/** Nastavení plakátu z motoru doplněné výchozími (prázdné pole = výchozí hodnota). */
export function nastaveniPlakatu(n) {
  n = n && typeof n === 'object' ? n : {};
  const vyber = (vychozi, hodnota) => (hodnota != null && String(hodnota).trim() !== '' ? String(hodnota) : vychozi);
  const v = { tymy: {}, souteze: {}, aliasy: {} };
  Object.keys(NASTAVENI).forEach((k) => { if (typeof NASTAVENI[k] === 'string') v[k] = vyber(NASTAVENI[k], n[k]); });
  Object.keys(NASTAVENI.tymy).forEach((k) => {
    v.tymy[k] = vyber(NASTAVENI.tymy[k], (n.tymy || {})[k]);
    v.souteze[k] = vyber(NASTAVENI.souteze[k], (n.souteze || {})[k]);
  });
  Object.keys(n.aliasy || {}).forEach((k) => {
    const klic = velkymi(k).replace(/\s+/g, ' ').trim();
    if (klic && n.aliasy[k]) v.aliasy[klic] = String(n.aliasy[k]);
  });
  return v;
}

/** Do motoru jen to, čím se nastavení liší od výchozího – výchozí hodnoty (třeba soutěže na jaro) pak jde měnit v kódu. */
export function rozdilNastaveni(n) {
  const v = nastaveniPlakatu(n), r = {};
  Object.keys(NASTAVENI).forEach((k) => { if (typeof NASTAVENI[k] === 'string' && v[k] !== NASTAVENI[k]) r[k] = v[k]; });
  ['tymy', 'souteze'].forEach((k) => {
    Object.keys(v[k]).forEach((t) => { if (v[k][t] !== NASTAVENI[k][t]) (r[k] = r[k] || {})[t] = v[k][t]; });
  });
  if (Object.keys(v.aliasy).length) r.aliasy = v.aliasy;
  return r;
}

// ---------------------------------------------------------------- soupeři a znaky

// slova, která na plakátu před obcí nejsou: TJ Sokol Hroznová Lhota → HROZNOVÁ LHOTA, FK Baník Dubňany → DUBŇANY
const SLOVA_KLUBU = /^(?:(?:FK|TJ|SK|FC|SFK|MFK|AFC|SC|MSK|FKM|Sokol|Slavoj|Baník|Banik|Podlužan|Agro)\s+)+/i;

/** Soupeř tak, jak je na plakátu: „FK Hodonín "B"“ → „HODONÍN B“, „FC Kyjov 1919“ → „KYJOV“, „TJ Slavoj Rohatec“ → „ROHATEC“. */
export function nazevNaPlakat(n) {
  const s = String(klub(n) || '').replace(SLOVA_KLUBU, '').replace(/\s+(?:19|20)\d{2}$/, '').replace(/\s+/g, ' ').trim();
  return velkymi(s || n);
}

/** „Velká nad Veličkou“ → „velka-nad-velickou“, „Veselí n. Moravou“ → „veseli-nad-moravou“ */
export function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\bn\.\s*/g, 'nad ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const bezDruzstva = (s) => s.replace(/\s+["„]?[A-D]["“”]?$/, '').trim(); // „HODONÍN B“ → „HODONÍN“

/** Znak soupeře: alias z nastavení, vestavěný alias, jinak obec bez diakritiky (.png i .jpg, od konce se ubírají slova);
 *  u sdruženého družstva první klub. '' = znak chybí – na plakátu čárkovaný rámeček se zkratkou. */
export function znakSoupere(nazev, nastaveni) {
  const n = nastaveni && nastaveni.aliasy && nastaveni.tymy ? nastaveni : nastaveniPlakatu(nastaveni);
  const kandidati = [];
  [nazevNaPlakat(nazev), velkymi(klub(nazev)).replace(/\s+/g, ' ').trim()].forEach((s) => {
    const prvni = s.split('/')[0].trim();
    [s, bezDruzstva(s), prvni, bezDruzstva(prvni)].forEach((k) => { if (k && kandidati.indexOf(k) < 0) kandidati.push(k); });
  });
  for (const k of kandidati) { if (LOGO[n.aliasy[k]]) return n.aliasy[k]; }
  for (const k of kandidati) { if (LOGO[ALIASY[k]]) return ALIASY[k]; }
  for (const k of kandidati) {
    const slova = slug(k).split('-').filter(Boolean);
    for (let i = slova.length; i >= 1; i--) {
      const s = slova.slice(0, i).join('-');
      if (LOGO[s + '.png']) return s + '.png';
      if (LOGO[s + '.jpg']) return s + '.jpg';
    }
  }
  return '';
}

// ---------------------------------------------------------------- plakát podle rozlosování

const kdyText = (t) => DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + ' ' + hhmm(t);
/** „2026-10-24 11:45“ → ms místního času (nebo null) */
function puvodniCas(s) {
  const x = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s || '');
  return x ? new Date(+x[1], +x[2] - 1, +x[3], +(x[4] || 0), +(x[5] || 0)).getTime() : null;
}
/** Zápas mládeže v týdnu („PÁ 16. 10.“, „16:45“) → ms pro řazení s ostatními */
function casZTextu(den, cs, rok) {
  const d = /(\d{1,2})\.\s*(\d{1,2})\./.exec(den || ''), c = /(\d{1,2}):(\d{2})/.exec(cs || '');
  return d ? new Date(rok, +d[2] - 1, +d[1], c ? +c[1] : 0, c ? +c[2] : 0).getTime() : Infinity;
}

/**
 * Plakát víkendu (sobota v ISO) podle rozlosování: zápasy týmů z nastavení (A, B, dorost) z fotbal.cz – doma velké
 * dlaždice, venku řádky „SO 14:30“, pátek před víkendem a po–čt po něm do V TÝDNU – a mládež z plakat_data.js.
 * → { stav (10 polí jako na webu dorostu), poznamky: ['DOROST – VELKÁ NAD VELIČKOU: přeloženo z so 24. 10. 11:45 …'] }
 */
export function zRozlosovani(sobota, fotbal, nastaveni) {
  const n = nastaveniPlakatu(nastaveni);
  const so = terminDatum(sobota), ne = pridejDny(so, 1);
  const tymy = Object.keys(n.tymy);
  const zapasy = ((fotbal && fotbal.zapasy) || []).filter((z) => tymy.indexOf(z.tym) >= 0 && !isNaN(cas(z)));
  const naVikendu = zapasy.filter((z) => vikendZapasu(cas(z)) === sobota);
  const vikend = naVikendu.filter((z) => pulnoc(cas(z)) === so || pulnoc(cas(z)) === ne)
    .sort((a, b) => (tymy.indexOf(a.tym) - tymy.indexOf(b.tym)) || (cas(a) - cas(b)));
  const m = MLADEZ[sobota] || {};
  const radek = (z) => ({ souper: nazevNaPlakat(souperZapasu(z)), logo: znakSoupere(souperZapasu(z), n) });
  const tyden = naVikendu.filter((z) => vikend.indexOf(z) < 0).map((z) => Object.assign({ kat: n.tymy[z.tym], doma: !!z.doma }, radek(z),
    { den: velkymi(DNY_KR[new Date(cas(z)).getDay()]) + ' ' + dm(cas(z)), cas: hhmm(cas(z)), t: cas(z) }))
    .concat((m.tyden || []).map((r) => ({ kat: r[0], doma: !!r[1], souper: r[2], logo: '', den: r[3], cas: r[4], t: casZTextu(r[3], r[4], new Date(so).getFullYear()) })))
    .sort((a, b) => a.t - b.t);
  const stav = Object.assign(datumPlakatu(sobota), {
    nadpis: n.nadpis,
    doma: vikend.filter((z) => z.doma).map((z) => Object.assign({ tym: n.tymy[z.tym], soutez: n.souteze[z.tym] || '' }, radek(z),
      { den: velkymi(DNY[new Date(cas(z)).getDay()]) + ' ' + dm(cas(z)), cas: hhmm(cas(z)) })),
    domaMladez: (m.doma || []).map((r) => ({ kat: r[0], souper: r[1], logo: r[2], den: r[3], cas: r[4] })),
    venku: vikend.filter((z) => !z.doma).map((z) => Object.assign({ kat: n.tymy[z.tym] }, radek(z), { cas: velkymi(DNY_KR[new Date(cas(z)).getDay()]) + ' ' + hhmm(cas(z)) }))
      .concat((m.venku || []).map((r) => ({ kat: r[0], souper: r[1], logo: r[2], cas: r[3] }))),
    vTydnu: tyden.map((r) => ({ kat: r.kat, doma: r.doma, souper: r.souper, den: r.den, cas: r.cas })),
    vyzva: n.vyzva,
    paticka: { misto: n.misto, podtitul: n.podtitul },
    nasZnak: n.nasZnak
  });
  // přeložené zápasy a poznámky svazu – do editoru (na plakát ne)
  const poznamky = [];
  zapasy.forEach((z) => {
    const t = cas(z), p = puvodniCas(z.puvodniTermin);
    const tady = vikendZapasu(t) === sobota;
    const kdo = n.tymy[z.tym] + ' – ' + nazevNaPlakat(souperZapasu(z));
    if (tady && p != null) poznamky.push(kdo + ': přeloženo z ' + kdyText(p) + ' na ' + kdyText(t));
    else if (!tady && p != null && vikendZapasu(p) === sobota) poznamky.push(kdo + ': přeloženo na ' + kdyText(t) + ' – na plakát tohoto víkendu nepatří');
    if (tady && z.poznamka && !/^p[uů]vodn[ií] term[ií]n/i.test(z.poznamka)) poznamky.push(kdo + ': ' + z.poznamka);
  });
  return { stav, poznamky };
}

/** Uložený plakát (z motoru) doplněný o chybějící pole – starší nebo poškozený záznam nesmí shodit stránku. */
export function normalizujPlakat(s, sobota, nastaveni) {
  const x = s && typeof s === 'object' ? s : {};
  const n = nastaveniPlakatu(nastaveni);
  const d = datumPlakatu(sobota);
  const t = (v, vychozi) => (typeof v === 'string' ? v : v == null ? (vychozi || '') : String(v));
  const pole = (v, fn) => (Array.isArray(v) ? v.filter((r) => r && typeof r === 'object').map(fn) : []);
  const pat = x.paticka && typeof x.paticka === 'object' ? x.paticka : {};
  return {
    datum: t(x.datum, d.datum), mesic: t(x.mesic, d.mesic), nadpis: t(x.nadpis, n.nadpis),
    doma: pole(x.doma, (r) => ({ tym: t(r.tym), soutez: t(r.soutez), souper: t(r.souper), logo: t(r.logo), den: t(r.den), cas: t(r.cas) })),
    domaMladez: pole(x.domaMladez, (r) => ({ kat: t(r.kat), souper: t(r.souper), logo: t(r.logo), den: t(r.den), cas: t(r.cas) })),
    venku: pole(x.venku, (r) => ({ kat: t(r.kat), souper: t(r.souper), logo: t(r.logo), cas: t(r.cas) })),
    vTydnu: pole(x.vTydnu, (r) => ({ kat: t(r.kat), doma: !!r.doma, souper: t(r.souper), den: t(r.den), cas: t(r.cas) })),
    vyzva: t(x.vyzva, n.vyzva),
    paticka: { misto: t(pat.misto, n.misto), podtitul: t(pat.podtitul, n.podtitul) },
    nasZnak: t(x.nasZnak, n.nasZnak)
  };
}

/** Kdo nemá znak (na plakátu by byl čárkovaný rámeček). */
export function chybejiciZnaky(s) {
  const ven = [];
  const zkus = (r) => { if (r.souper && !r.logo && ven.indexOf(r.souper) < 0) ven.push(r.souper); };
  s.doma.forEach(zkus);
  s.domaMladez.forEach(zkus);
  s.venku.forEach(zkus);
  return ven;
}

/** Krátký otisk textu (porovnání verzí plakátu). */
export function otisk(text) {
  let h = 5381;
  const s = String(text);
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Cesta „doma.0.souper“ v plakátu: čtení a zápis (editor). */
export function hodnotaCesty(o, cesta) {
  return cesta.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
}
export function nastavCestu(o, cesta, hodnota) {
  const c = cesta.split('.');
  let x = o;
  for (let i = 0; i < c.length - 1; i++) x = x[c[i]];
  x[c[c.length - 1]] = hodnota;
}

// ---------------------------------------------------------------- HTML plakátu (1:1 web dorostu, jen .hero → .blok)

const zkratka = (n) => esc(String(n).replace(/^(FK|TJ|SK|FC)\s+/i, '').slice(0, 10));

/**
 * Obsah plakátu (do prvku .plakat.poster). cesty = { znaky: 'plakat/znaky/', qr: 'plakat/qr/instagram.png' }.
 * Velikosti řeší CSS podle počtu řádků (m2–m4, v4–v5, tyden); dlouhé názvy zmenší plakaty.js (zkratitDlouhe).
 */
export function plakatHtml(d, cesty) {
  const znak = (logo, nazev, velikost) => {
    const c = velikost ? ' ' + velikost : '';
    return logo ? '<img class="badge' + c + '" src="' + esc(cesty.znaky + logo) + '" alt="' + esc(nazev) + '">'
      : '<div class="ph' + c + '">' + zkratka(nazev) + '</div>';
  };
  const jeden = d.doma.length === 1;
  const bloky = d.doma.map((z) => '<div class="blok' + (jeden ? ' single' : '') + '">' +
    '<div class="team">' + esc(z.tym) + '</div><div class="comp">' + esc(z.soutez) + '</div>' +
    '<div class="mid"><div class="duel"><img class="badge" src="' + esc(cesty.znaky + d.nasZnak) + '" alt="FK Agro Vnorovy">' +
      '<span class="vs">VS</span>' + znak(z.logo, z.souper) + '</div><div class="opp">' + esc(z.souper) + '</div></div>' +
    '<div class="when">' + esc(z.den) + ' &nbsp;|&nbsp; ' + esc(z.cas) + '</div></div>').join('');
  const mladez = d.domaMladez.map((m) => '<div class="row"><span class="cat">' + esc(m.kat) + '</span>' + znak(m.logo, m.souper, 'xs') +
    '<span class="opp">' + esc(m.souper) + '</span><span class="when">' + esc([m.den, m.cas].filter(Boolean).join('  ')) + '</span></div>').join('');
  const venku = d.venku.map((v) => '<div class="awayrow">' + znak(v.logo, v.souper, 'sm') +
    '<div class="meta"><div class="cat">' + esc(v.kat) + '</div><div class="opp">' + esc(v.souper) + '</div></div>' +
    '<div class="when">' + esc(v.cas) + '</div></div>').join('');
  const tyden = d.vTydnu.length ? '<div class="wk"><div class="wkh">V TÝDNU</div>' + d.vTydnu.map((t) => '<div class="wkr">' +
    '<div class="wkline"><span class="wkc">' + esc(t.kat) + '</span><span class="wkt">' + esc([t.den, t.cas].filter(Boolean).join('  ')) + '</span></div>' +
    '<div class="wkm">' + (t.doma ? 'AGRO – ' + esc(t.souper) : esc(t.souper) + ' – AGRO') + '</div></div>').join('') + '</div>' : '';
  const mCls = d.domaMladez.length >= 4 ? ' m4' : d.domaMladez.length === 3 ? ' m3' : d.domaMladez.length === 2 ? ' m2' : '';
  const vCls = (d.venku.length >= 5 ? ' v5' : d.venku.length === 4 ? ' v4' : '') + (d.vTydnu.length ? ' tyden' : '');
  return '<div class="design">' +
    '<div class="corner tl"><i class="t1 k"></i><i class="t1 r"></i><i class="t1 r"></i><i></i></div>' +
    '<div class="corner tr"><i class="t2 r"></i><i class="t2 k"></i><i></i><i class="t2 r"></i></div>' +
    '<div class="corner br"><i></i><i class="t4 r"></i><i class="t4 r"></i><i class="t4 k"></i></div>' +
    '<div class="dots l"></div><div class="dots rt"></div>' +
    '<div class="phead"><img class="clublogo" src="' + esc(cesty.znaky + d.nasZnak) + '" alt="FK Agro Vnorovy">' +
      '<div class="phead-mid"><div class="kicker">FK AGRO VNOROVY</div><div class="ptitle">' + esc(d.nadpis) + '</div></div>' +
      '<div class="pdate"><div class="d">' + esc(d.datum) + '</div><div class="m">' + esc(d.mesic) + '</div></div></div>' +
    '<div class="rule"></div>' +
    '<div class="body2"><div class="left' + mCls + '">' +
      (d.doma.length || d.domaMladez.length
        ? '<div class="band home">HRAJEME DOMA<span class="sub">' + esc(d.paticka.misto) + '</span></div>' + (d.doma.length ? '<div class="bloky">' + bloky + '</div>' : '') + mladez
        : '<div class="nicdoma">TENTO VÍKEND<br>HRAJEME JEN VENKU</div>') +
      '<div class="pfoot"><div><div class="venue">' + esc(d.vyzva) + '</div><div class="txt">' + esc(d.paticka.podtitul) + '</div></div></div>' +
    '</div><div class="right' + vCls + '"><div class="band away">VENKU</div><div class="rowlist">' + venku + '</div>' + tyden +
      '<div class="qr"><div class="qrbox"><img src="' + esc(cesty.qr) + '" alt="Instagram"><span>@FKAGROVNOROVY</span></div></div>' +
    '</div></div></div>';
}

// ---------------------------------------------------------------- souhrn pro Clauda (popisek na Instagram)

const naDen = (den) => String(den || '').toLowerCase();

/** Řádek tabulky klubu (fotbal.cz) – náš (Vnorovy) nebo soupeře podle názvu na plakátu. */
function radekTabulky(tab, souper) {
  const radky = (tab && tab.celkem) || [];
  if (!souper) return radky.find((r) => /vnorov/i.test(r.klub)) || null;
  const s = slug(bezDruzstva(souper.split('/')[0]));
  return radky.find((r) => !/vnorov/i.test(r.klub) && slug(nazevNaPlakat(r.klub)).indexOf(s) === 0) || null;
}

/**
 * Souhrn víkendu z plakátu (i ručně upraveného) – motor z něj udělá úkol pro Clauda. Michal 9. 10.: „primární zápas
 * áčka, ale není to nutnost… základ domácí zápasy mužů a dorostu“, „popisky vždy z aktuální tabulky“.
 */
export function souhrnProClauda(d, sobota, fotbal, nastaveni) {
  const n = nastaveniPlakatu(nastaveni);
  const radky = ['Plakát FK Agro Vnorovy na víkend ' + rozsahVikendu(sobota, terminDatum(sobota)) + ' ' + new Date(terminDatum(sobota)).getFullYear() +
    (cisloKola(sobota) ? ' (' + cisloKola(sobota) + '. kolo podzimu)' : '') + '.'];
  if (d.doma.length) {
    radky.push('', 'Doma – ' + d.paticka.misto + ':');
    d.doma.forEach((z) => radky.push('- ' + z.tym + ' (' + z.soutez + '): ' + naDen(z.den) + ' ' + z.cas + ' proti ' + z.souper));
  } else radky.push('', 'Muži ani dorost tento víkend doma nehrají.');
  if (d.domaMladez.length) {
    radky.push('', 'Mládež doma:');
    d.domaMladez.forEach((m) => radky.push('- ' + m.kat + ': ' + naDen(m.den) + ' ' + m.cas + ' proti ' + m.souper));
  }
  if (d.venku.length) {
    radky.push('', 'Venku:');
    d.venku.forEach((v) => radky.push('- ' + v.kat + ': ' + v.cas + ' ' + v.souper));
  }
  if (d.vTydnu.length) {
    radky.push('', 'V týdnu:');
    d.vTydnu.forEach((t) => radky.push('- ' + t.kat + ': ' + t.den + ' ' + t.cas + ' ' + (t.doma ? 'doma proti ' : 'venku, ') + t.souper));
  }
  // hlavní zápas: áčko doma, jinak první domácí, jinak áčko venku
  const klicTymu = (nazev) => Object.keys(n.tymy).find((k) => n.tymy[k] === nazev) || '';
  const hlavni = d.doma.find((z) => klicTymu(z.tym) === 'A') || d.doma[0] || null;
  const aVenku = !hlavni && d.venku.find((v) => klicTymu(v.kat) === 'A');
  if (hlavni) radky.push('', 'Hlavní zápas: ' + hlavni.tym + ' – ' + hlavni.souper + ' (' + naDen(hlavni.den) + ' ' + hlavni.cas + ').');
  else if (aVenku) radky.push('', 'Hlavní zápas: ' + aVenku.kat + ' venku – ' + aVenku.souper + ' (' + aVenku.cas + ').');
  // tabulka (stránka Fotbal ji stahuje s plnými daty fotbal.cz)
  const tabulky = (fotbal && fotbal.tabulky) || {};
  const tab = [];
  d.doma.map((z) => [klicTymu(z.tym), z.tym, z.souper]).concat(d.venku.map((v) => [klicTymu(v.kat), v.kat, v.souper])).forEach((x) => {
    const t = x[0] && tabulky[x[0]];
    const nas = radekTabulky(t), oni = radekTabulky(t, x[2]);
    if (nas) tab.push('- ' + x[1] + ': ' + nas.poradi + '. místo, ' + nas.body + ' b.' + (oni ? '; ' + x[2] + ' ' + oni.poradi + '. místo, ' + oni.body + ' b.' : ''));
  });
  if (tab.length) radky.push('', 'Tabulka (fotbal.cz):', ...tab);
  radky.push('', 'Výzva na plakátu: ' + d.vyzva, 'Instagram klubu: @' + n.instagram);
  return radky.join('\n');
}
