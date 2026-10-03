// Počasí z ČHMÚ (přes motor) – jen to důležité: výstrahy pro místo, řeka při povodňovém stupni, krátká předpověď.
// Data ČHMÚ jsou otevřená (CC BY 4.0) – zdroj se uvádí v detailu.

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej, jeDemo } from './api.js';
import { esc, uloziste, hhmm, dm, DNY_KR, rozdilDni, pulnoc, pridejDny, isoDatum, kdyKratce } from './pomocne.js';
import { IKONY, ikonaPocasi } from './ikony.js';
import { okno } from './ui.js';

const ULOZISTE = 'asistent.data.pocasi';
const VIDENO = 'asistent.pocasi.videno'; // výstrahy, které už ukázalo „Co je nového“

/** Úroveň → [popisek, třída barvy] */
export const UROVNE = {
  fialova: ['Extrémní', 'fialova'], cervena: ['Červená', 'cervena'], oranzova: ['Oranžová', 'oranzova'],
  zluta: ['Žlutá', 'zluta'], vyhled: ['Výhled', 'vyhled'], info: ['Informace', 'info'], zelena: ['Klid', 'zelena']
};

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.pocasi = v.data;
}

// ---------------------------------------------------------------- poloha (zapíná se v Nastavení → Počasí, na každém zařízení zvlášť)
const POLOHA = 'asistent.pocasi.poloha';
export function polohaZapnuta() { return uloziste.cti(POLOHA) === true; }
export function nastavPolohu(zapnuto) { uloziste.pis(POLOHA, !!zapnuto); stav.pocasiTed = null; stav.chybaPolohy = ''; return nactiPocasi(true); }

/** Poloha z telefonu zaokrouhlená na 0,01° (~1 km); null = vypnuto, nepovoleno nebo nezjištěno. */
function zjistiPolohu() {
  if (jeDemo() || !polohaZapnuta() || !navigator.geolocation) return Promise.resolve(null); // ukázka polohu nezjišťuje
  return new Promise((hotovo) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { stav.chybaPolohy = ''; hotovo({ lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 }); },
      (e) => { stav.chybaPolohy = e && e.code === 1 ? 'Poloha není povolená – povol ji pro tuhle stránku v prohlížeči / v Nastavení iPhonu.' : 'Polohu se nepodařilo zjistit.'; hotovo(null); },
      { maximumAge: 30 * 60e3, timeout: 10e3, enableHighAccuracy: false });
  });
}

// WMO kód počasí (Open-Meteo) → ikona aplikace
function ikonaWmo(k) {
  return k === 0 ? 'slunce' : k <= 2 ? 'polojasno' : k === 3 ? 'oblacno' : k <= 48 ? 'mlha' : (k <= 67 || (k >= 80 && k <= 82)) ? 'dest'
    : (k <= 77 || k === 85 || k === 86) ? 'snih' : k >= 95 ? 'bourka' : 'oblacno';
}

/** Teď a příštích 12 hodin pro polohu – Open-Meteo (model ČHMÚ ALADIN), přímo z telefonu, bez klíče. */
function nactiTed(p) {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon + '&models=chmi_aladin_seamless' +
    '&current=temperature_2m,weather_code,precipitation,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code' +
    '&forecast_hours=12&timezone=Europe%2FPrague&wind_speed_unit=ms';
  return fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !j.current) return;
    const h = j.hourly || {};
    stav.pocasiTed = { kdy: Date.now(), teplota: Math.round(j.current.temperature_2m), ikona: ikonaWmo(j.current.weather_code), srazky: j.current.precipitation,
      vitr: j.current.wind_speed_10m, hodiny: (h.time || []).map((t, i) => ({ t: Date.parse(t), teplota: Math.round(h.temperature_2m[i]), ikona: ikonaWmo(h.weather_code[i]),
        pst: h.precipitation_probability ? h.precipitation_probability[i] : null, mm: h.precipitation ? h.precipitation[i] : 0 })) };
    zmeneno();
  }).catch(() => { /* bez „teď“ – přehled ČHMÚ zůstává */ });
}

/** „Teď“ jen když je čerstvé (2 h). */
export function ted() { const t = stav.pocasiTed; return t && Date.now() - t.kdy < 2 * 36e5 ? t : null; }

export function nactiPocasi(znovu) {
  if (!umiMotor('pocasi') || stav.nacita.pocasi) return Promise.resolve();
  stav.nacita.pocasi = true;
  stav.chyby.pocasi = null;
  zmeneno();
  return zjistiPolohu()
    .then((poloha) => { if (poloha) nactiTed(poloha); return volej('pocasi', { znovu: !!znovu, poloha }); })
    .then((data) => { stav.pocasi = data; uloziste.pis(ULOZISTE, { data, kdy: Date.now() }); })
    .catch((e) => { stav.chyby.pocasi = e; })
    .then(() => { stav.nacita.pocasi = false; zmeneno(); });
}

/** Při překreslení: motor počasí umí (třeba až po načtení info) a ještě nic nemáme → načíst. */
export function dotahni() {
  if (umiMotor('pocasi') && !stav.pocasi && !stav.nacita.pocasi && !stav.chyby.pocasi) nactiPocasi();
}

// ---------------------------------------------------------------- co je důležité

/** Výstrahy, které platí teď nebo začnou do dvou dnů (bez výhledů) + řeka nad povodňovým stupněm. */
export function vystrahy() {
  const p = stav.pocasi;
  if (!p) return [];
  const ted = Date.now();
  const v = (p.vystrahy || []).filter((x) => x.typ !== 'vyhled' && (x.do == null || x.do > ted));
  (p.reky || []).filter((r) => r.spa || r.spaPredpoved).forEach((r) => {
    v.push({ typ: 'povoden', uroven: r.uroven, nazev: r.nazev + ': ' + r.stav, od: r.kdy, do: null, text: r.text, reka: true });
  });
  return v;
}

export function vyhledy() {
  const ted = Date.now();
  return ((stav.pocasi && stav.pocasi.vystrahy) || []).filter((x) => x.typ === 'vyhled' && (x.do == null || x.do > ted));
}

/** Předpověď na den (ms kdykoli v tom dni), nebo null. */
export function predpovedNa(t) {
  const den = isoDatum(t);
  return ((stav.pocasi && stav.pocasi.predpovedi) || []).find((p) => p.den === den) || null;
}

/** Předpověď pro „teď“: dnešní, večer už zítřejší. → { p, kdy: 'dnes'|'zítra' } */
export function nejblizsiPredpoved() {
  const ted = Date.now();
  const dnes = predpovedNa(ted);
  if (dnes && (dnes.do == null || dnes.do > ted)) return { p: dnes, kdy: 'dnes' };
  const zitra = predpovedNa(pridejDny(pulnoc(ted), 1));
  return zitra ? { p: zitra, kdy: 'zítra' } : null;
}

export function teplota(p) {
  const t = p && (p.tMax || p.tMin);
  if (!t) return '';
  return (t[0] === t[1] ? String(t[0]) : t[0] + '–' + t[1]) + ' °C';
}

/** „22°“ – horní hranice dne (do malé karty) */
export function teplotaKratce(p) {
  const t = p && (p.tMax || p.tMin);
  return t ? t[1] + '°' : '–';
}

function denKratce(t) {
  const r = rozdilDni(t);
  return r === 0 ? 'dnes' : r === 1 ? 'zítra' : DNY_KR[new Date(t).getDay()] + ' ' + dm(t);
}

/** Konec přesně o půlnoci se čte líp jako „24:00“ předchozího dne. */
function casKonce(t) {
  const d = new Date(t);
  if (d.getHours() === 0 && d.getMinutes() === 0) return denKratce(t - 60000) + ' 24:00';
  return denKratce(t) + ' ' + hhmm(t);
}

/** Kdy výstraha platí: „teď – do zítra 6:00“, „so 15:00–22:00“, „do odvolání“ */
export function kdyPlati(v) {
  const ted = Date.now();
  const zacala = v.od == null || v.od <= ted;
  if (v.do == null) return (zacala ? 'teď' : 'od ' + denKratce(v.od) + ' ' + hhmm(v.od)) + ' · do odvolání';
  if (zacala) return 'teď – do ' + casKonce(v.do);
  if (pulnoc(v.od) === pulnoc(v.do - 60000)) return denKratce(v.od) + ' ' + hhmm(v.od) + '–' + (new Date(v.do).getHours() === 0 ? '24:00' : hhmm(v.do));
  return denKratce(v.od) + ' ' + hhmm(v.od) + ' – ' + casKonce(v.do);
}

export function nazevVystrahy(v) {
  return (v.reka ? '' : (UROVNE[v.uroven] || UROVNE.info)[0] + ' · ') + v.nazev;
}

/** Nejvážnější úroveň ze seznamu výstrah (pro barvu karty). */
export function nejhorsi(seznam) {
  const poradi = ['fialova', 'cervena', 'oranzova', 'zluta', 'vyhled', 'info', 'zelena'];
  return seznam.map((v) => v.uroven).sort((a, b) => poradi.indexOf(a) - poradi.indexOf(b))[0] || '';
}

// ---------------------------------------------------------------- vykreslení

/** Pruh výstrah nahoře na Dnes – jen když nějaká platí (nejvýš dvě, zbytek v detailu). */
export function pruhVystrahHtml() {
  const v = vystrahy();
  if (!v.length) return '';
  return '<div class="vystrahy">' + v.slice(0, 2).map((x) =>
    '<button type="button" class="vystraha vystraha--' + esc(x.uroven) + '" data-pocasi>' +
      '<i class="vystraha__znak">' + (x.reka ? IKONY.kapka : IKONY.pozor) + '</i>' +
      '<span class="vystraha__text"><b>' + esc(nazevVystrahy(x)) + '</b><small>' + esc(kdyPlati(x)) + (x.text ? ' · ' + esc(x.text) : '') + '</small></span>' +
      '<em>ČHMÚ</em></button>').join('') +
    (v.length > 2 ? '<button type="button" class="vystrahy__dalsi" data-pocasi>+ ' + (v.length - 2) + ' další v detailu</button>' : '') + '</div>';
}

/** Údaje pro kartu Počasí (Dnes): { ikona, hodnota, jednotka, nazev, pod (HTML) } */
export function kartaPocasi() {
  const np = nejblizsiPredpoved();
  const v = vystrahy();
  const p = np && np.p;
  const t = p && (p.tMax || p.tMin);
  let pod;
  if (v.length) {
    const h = nejhorsi(v);
    pod = '<span class="tag tag--' + (h === 'zluta' ? 'warn' : 'danger') + '">' + esc(v.length > 1 ? v.length + ' výstrahy' : (UROVNE[h] || UROVNE.info)[0]) + '</span>' +
      '<span class="orez-1">' + esc(v[0].nazev) + '</span>';
  } else {
    pod = '<span class="orez-1">' + esc(p ? p.uvod || 'bez výstrah' : 'bez výstrah ČHMÚ') + '</span>';
  }
  const tt = ted();
  const misto = stav.pocasi && stav.pocasi.podlePolohy && stav.pocasi.misto ? ' · ' + stav.pocasi.misto : '';
  if (tt) {
    if (!v.length) pod = '<span class="orez-1">' + esc((t ? (np.kdy === 'zítra' ? 'zítra ' : 'dnes ') + (t[0] === t[1] ? t[0] : t[0] + '–' + t[1]) + ' °C · ' : '') + (p ? p.uvod || '' : '')) + '</span>';
    return { ikona: ikonaPocasi(tt.ikona), nazev: 'Teď' + misto, hodnota: String(tt.teplota), jednotka: '°C', pod };
  }
  return {
    ikona: p ? ikonaPocasi(p.ikona) : IKONY.polojasno,
    nazev: 'Počasí' + (np && np.kdy === 'zítra' ? ' zítra' : '') + misto,
    hodnota: t ? (t[0] === t[1] ? String(t[0]) : t[0] + '–' + t[1]) : '–',
    jednotka: t ? '°C' : '',
    pod
  };
}

/** Detail v okně uprostřed: výstrahy s radou, výhled, řeky, předpověď po dnech, zdroj. */
export function ukazDetail() {
  const p = stav.pocasi;
  if (!p) {
    okno({ ikona: IKONY.polojasno, nadpis: 'Počasí', text: stav.chyby.pocasi ? stav.chyby.pocasi.message : 'Načítám data ČHMÚ…', ano: 'Zavřít', ne: null });
    return;
  }
  const v = vystrahy();
  const vh = vyhledy();
  let h = '';
  const tt = ted();
  if (tt && tt.hodiny.length) {
    h += '<h3 class="okno__mezinadpis">Příštích 12 hodin' + (p.podlePolohy ? ' · ' + esc(p.misto) : '') + '</h3><div class="pocasi-hodiny">' + tt.hodiny.map((x) =>
      '<span><small>' + hhmm(x.t) + '</small><i>' + ikonaPocasi(x.ikona) + '</i><b class="cisla">' + x.teplota + '°</b>' +
      (x.pst != null && x.pst >= 20 ? '<em>' + x.pst + ' %</em>' : x.mm >= 0.2 ? '<em>' + String(x.mm).replace('.', ',') + ' mm</em>' : '<em></em>') + '</span>').join('') + '</div>';
  }
  if (stav.chybaPolohy && polohaZapnuta()) h += '<p class="pocasi-chyba">' + esc(stav.chybaPolohy) + ' Ukazuju výchozí místo.</p>';
  if (v.length) {
    h += '<h3 class="okno__mezinadpis">Výstrahy</h3><ul class="pocasi-seznam">' + v.map((x) =>
      '<li class="pocasi-vystraha pocasi-vystraha--' + esc(x.uroven) + '"><b>' + esc(nazevVystrahy(x)) + '</b>' +
      '<small>' + esc(kdyPlati(x)) + (x.celyKraj ? ' · celý kraj' : '') + '</small>' +
      (x.text ? '<p>' + esc(x.text) + '</p>' : '') + (x.vyvoj ? '<p class="muted">' + esc(x.vyvoj) + '</p>' : '') + '</li>').join('') + '</ul>';
  } else {
    h += '<p class="pocasi-klid">' + IKONY.fajfka + '<span>Žádné výstrahy ČHMÚ pro ' + esc(p.misto || 'tvoje místo') + '.</span></p>';
  }
  if (vh.length) {
    h += '<h3 class="okno__mezinadpis">Výhled</h3><ul class="pocasi-seznam">' + vh.map((x) =>
      '<li><b>' + esc(denKratce(x.od)) + '</b><p>' + esc(x.text) + '</p></li>').join('') + '</ul>';
  }
  const pred = p.predpovedi || [];
  if (pred.length) {
    h += '<h3 class="okno__mezinadpis">Předpověď' + (pred[0].oblast ? ' · ' + esc(pred[0].oblast) : '') + '</h3><ul class="pocasi-dny">' + pred.map((x) =>
      '<li><i>' + ikonaPocasi(x.ikona) + '</i><span><b>' + esc(velke(denKratce(x.od + ((x.do || x.od) - x.od) / 2))) + '</b>' +
      '<small>' + esc(x.uvod) + (x.srazky ? ' · srážky ' + esc(x.srazky) : '') + (x.vitr ? ' · ' + esc(x.vitr) : '') +
      (x.jevy && x.jevy.length ? ' · pozor: ' + esc(x.jevy.join(', ')) : '') + '</small></span>' +
      '<em class="cisla">' + esc(teplota(x)) + (x.tMax && x.tMin ? '<small>noc ' + esc(teplota({ tMin: x.tMin })) + '</small>' : '') + '</em></li>').join('') + '</ul>';
  }
  const reky = p.reky || [];
  if (reky.length) {
    h += '<h3 class="okno__mezinadpis">Řeka</h3><ul class="pocasi-seznam">' + reky.map((r) =>
      '<li class="pocasi-reka' + (r.spa || r.spaPredpoved ? ' pocasi-vystraha--' + esc(r.uroven) : '') + '"><b>' + esc(r.nazev) + '</b><small>' + esc(r.stav) + '</small><p>' + esc(r.text) +
      (r.maxPredpoved != null && r.maxPredpoved !== r.hladina ? ' Předpověď nejvýš ' + r.maxPredpoved + ' cm (' + esc(kdyKratce(r.kdyMax)) + ').' : '') + '</p></li>').join('') + '</ul>';
  }
  if (p.chyby && p.chyby.length) h += '<p class="pocasi-chyba">Nepodařilo se načíst: ' + esc(p.chyby.join(', ')) + '.</p>';
  h += '<p class="pocasi-zdroj">Zdroj: ČHMÚ' + (tt ? ' · hodiny: Open-Meteo (model ČHMÚ ALADIN)' : '') + ' · aktualizováno ' + esc(kdyKratce(p.vytvoreno)) +
    ' · <a href="https://vystrahy-cr.chmi.cz/" target="_blank" rel="noopener noreferrer">výstrahy</a>' +
    ' · <a href="https://www.chmi.cz/" target="_blank" rel="noopener noreferrer">chmi.cz</a></p>';
  const np = nejblizsiPredpoved();
  okno({
    ikona: v.length ? IKONY.pozor : np ? ikonaPocasi(np.p.ikona) : IKONY.polojasno,
    ton: v.length ? (nejhorsi(v) === 'zluta' ? 'pozor' : 'nebezpeci') : 'ok',
    nadpis: 'Počasí · ' + (p.misto || 'ČHMÚ'),
    text: v.length ? p.souhrn : np ? velke(np.kdy) + ' ' + teplota(np.p) + ' · ' + np.p.uvod : p.souhrn,
    html: h, siroke: true, ano: 'Zavřít', ne: null
  });
}

function velke(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ---------------------------------------------------------------- Co je nového

function klicVystrahy(v) { return v.typ + '|' + v.nazev + '|' + v.uroven + '|' + (v.reka ? '' : v.od || ''); }

/** Výstrahy, které okno „Co je nového“ ještě neukázalo (a zapamatuje si je). Jen z čerstvých dat. */
export function noveVystrahy() {
  const p = stav.pocasi;
  if (!p || Date.now() - (p.vytvoreno || 0) > 3 * 36e5) return [];
  const videno = uloziste.cti(VIDENO) || {};
  const ted = Date.now();
  const v = vystrahy();
  const nove = v.filter((x) => !videno[klicVystrahy(x)]);
  const dal = {};
  Object.keys(videno).forEach((k) => { if (videno[k] > ted) dal[k] = videno[k]; });
  v.forEach((x) => { dal[klicVystrahy(x)] = x.do || ted + 2 * 864e5; });
  uloziste.pis(VIDENO, dal);
  return nove;
}
