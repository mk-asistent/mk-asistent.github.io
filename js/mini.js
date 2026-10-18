// Mini okno – „widget na PC“ (Michal 18. 10.: „mohl rychle se podívat na nějaké věci na tom mém webu“). Kompaktní stránka
// #mini (~360 × 640): co hoří a čeká v poště, dnešní program, pití a doplňky s rychlými tlačítky, další zápas a poslední
// výsledek, co dnes vyjde na Instagramu, počasí a připravenost. Tři podoby:
// - v hlavním okně: Ctrl+Shift+A (app.js prepniMini) – stejné okno přepne mezi celou aplikací a mini;
// - samostatné malé okno: zástupce „Mini okno“ z ikony (manifest shortcuts → ./#mini) nebo Nastavení → Otevřít mini okno
//   (window.open popup) – běží v něm celá aplikace, jen ukazuje mini; klepnutí na e-mail ho otevře v HLAVNÍM okně;
// - plovoucí okno vždy navrchu: Document Picture-in-Picture (Chrome / Edge 116+) – stejný obsah, obnovuje se živě po každém
//   překreslení aplikace (app.js vykresli → poVykresleni). Bez API se tlačítko neukazuje (stav.js umiPlovouci).
// Načítá se až při prvním použití (app.js mini(), Nastavení), vzhled mini.css (taky až teď). Na telefonu se neukazuje.

import { stav, zmeneno, umiMotor, hooky, umiPlovouci } from './stav.js';
import { esc, pulnoc, pridejDny, hhmm, dm, DNY_KR, iniciala, odstin, kdyKratce, isoDatum, tvar, klub, rozdilDni } from './pomocne.js';
import { IKONY } from './ikony.js';
import * as posta from './posta.js';
import * as kal from './kalendar.js';
import * as zdravi from './zdravi.js';
import * as pocasi from './pocasi.js';
import * as fotbal from './fotbal.js';
import * as ig from './ig.js';
import * as P from './ig_prubeh.js';
import { pcNastaveni } from './nastaveni.js';
import { toast } from './ui.js';

const KANAL = 'asistent-okna'; // BroadcastChannel mezi okny aplikace (mini → hlavní)
const s = { pip: null, pipHtml: '', stylSlib: null, styl: false, hodiny: 0 };

// ---------------------------------------------------------------- vzhled (mini.css až teď – start aplikace na něj nečeká)

function nactiStyl() {
  if (s.stylSlib) return s.stylSlib;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'mini.css';
  l.id = 'mini-css';
  s.stylSlib = new Promise((ok) => { l.onload = ok; l.onerror = ok; }).then(() => { s.styl = true; });
  document.head.appendChild(l);
  return s.stylSlib;
}

/** Hodiny v hlavičce a „co ještě dnes“ se mění s časem – dokud je mini vidět (nebo plovoucí okno), překreslit každých 30 s. */
function hlidejHodiny() {
  if (s.hodiny) return;
  s.hodiny = setInterval(() => {
    const el = document.getElementById('mini');
    if (s.pip || (el && !el.hidden)) zmeneno();
    else { clearInterval(s.hodiny); s.hodiny = 0; }
  }, 30e3);
}

// ---------------------------------------------------------------- obsah

const karta = (oblast, ikona, nazev, vpravo, telo, atr) => '<section class="mo-karta" data-oblast="' + oblast + '"' + (atr || '') + '>' +
  '<h2 class="mo-karta__hlava"><span class="mo-karta__ikona">' + ikona + '</span><span class="mo-karta__nazev">' + nazev + '</span>' +
  (vpravo ? '<span class="mo-karta__vpravo">' + vpravo + '</span>' : '') + '</h2>' + telo + '</section>';
const prazdne = (text) => '<p class="mo-prazdne">' + IKONY.fajfka + '<span>' + esc(text) + '</span></p>';

/** Počasí a připravenost v jedné řadě (dvě malá čísla). */
function cislaHtml() {
  const d = [];
  if (umiMotor('pocasi') && stav.pocasi) {
    const k = pocasi.kartaPocasi();
    const v = pocasi.vystrahy().length;
    d.push('<button type="button" class="mo-cislo" data-oblast="pocasi" data-mini-cil="pocasi"><span class="mo-cislo__ikona">' + k.ikona + '</span>' +
      '<span><b class="cisla">' + esc(k.hodnota) + (k.jednotka ? '<small>' + esc(k.jednotka) + '</small>' : '') + '</b>' +
      '<small>' + (v ? '<em class="mo-pozor">⚠ ' + v + ' ' + tvar(v, 'výstraha', 'výstrahy', 'výstrah') + '</em>' : esc(k.nazev.replace(/^Teď · /, ''))) + '</small></span></button>');
  }
  if (umiMotor('zdravi') && zdravi.maData()) {
    const z = zdravi.kartaZdravi();
    const zon = z.jednotka === '%' ? zdravi.zona(Number(z.hodnota)) : '';
    d.push('<button type="button" class="mo-cislo' + (zon ? ' mo-cislo--' + zon : '') + '" data-oblast="zdravi" data-mini-cil="zdravi"><span class="mo-cislo__ikona">' + IKONY.srdce + '</span>' +
      '<span><b class="cisla">' + esc(z.hodnota) + (z.jednotka ? '<small>' + esc(z.jednotka) + '</small>' : '') + '</b><small>' + esc(z.nazev) + '</small></span></button>');
  }
  return d.length ? '<div class="mo-cisla">' + d.join('') + '</div>' : '';
}

/** Pošta: co hoří a čeká na tebe (jako „čeká“ na Přehledu). Předmět jen s volbou „I předmět“ (PC v práci vidí ostatní). */
function postaHtml() {
  if (!stav.posta) return karta('posta', IKONY.posta, 'Pošta', '', '<p class="mo-prazdne mo-prazdne--nacitam">' + (stav.chyby.posta ? 'Poštu teď nejde načíst' : 'Načítám…') + '</p>');
  const s2 = posta.kPozornosti();
  const hori = s2.filter((m) => posta.stavZpravy(m) === 'hori').length;
  const sPredmetem = pcNastaveni().predmet;
  const radky = s2.slice(0, 4).map((m) => '<li><button type="button" class="mo-zprava' + (m.neprectena ? ' mo-zprava--nova' : '') + '" data-mini-vlakno="' + esc(m.id) + '">' +
    '<span class="avatar maly" style="--h:' + odstin(m.od) + '" aria-hidden="true">' + esc(iniciala(m.od)) + '</span>' +
    '<span class="mo-zprava__text"><b>' + esc(m.od) + '</b>' + (sPredmetem && m.predmet ? '<small>' + esc(m.predmet) + '</small>' : '') + '</span>' +
    '<span class="mo-zprava__vpravo">' + posta.stavTag(m) + '<em class="cisla">' + esc(kdyKratce(m.kdy)) + '</em></span></button></li>').join('');
  const vpravo = (hori ? '<span class="tag tag--danger">' + hori + ' hoří</span>' : '') +
    '<button type="button" class="mo-sipka" data-mini-cil="posta" aria-label="Otevřít poštu">' + IKONY.sipka + '</button>';
  return karta('posta', IKONY.posta, 'Pošta' + (s2.length ? ' · ' + s2.length : ''), vpravo,
    s2.length ? '<ul class="mo-seznam">' + radky + '</ul>' + (s2.length > 4 ? '<p class="mo-dalsi">+ ' + (s2.length - 4) + ' další v poště</p>' : '')
      : prazdne(posta.neprectene().length ? 'Nic nehoří ani nečeká · ' + posta.neprectene().length + ' nepřečtené' : 'Nic nehoří ani nečeká na odpověď'));
}

/** Dnešní program: co ještě dnes je (celodenní nahoře); když už nic, první věc zítra. */
function programHtml() {
  const ted = Date.now();
  if (!kal.mameData(ted)) return karta('kalendar', IKONY.kalendar, 'Dnes', '', '<p class="mo-prazdne mo-prazdne--nacitam">' + (kal.chybaKalendare() ? 'Kalendář teď nejde načíst' : 'Načítám…') + '</p>');
  const dnes = kal.udalostiDne(ted).filter((u) => u.celodenni || u.konec > ted);
  const radek = (u, zitra) => '<li class="mo-udalost' + (!u.celodenni && u.zacatek <= ted ? ' mo-udalost--ted' : '') + '" style="--b:' + esc(u.barva || 'var(--accent)') + '">' +
    '<em class="cisla">' + (zitra ? 'zítra ' : '') + (u.celodenni ? 'celý den' : hhmm(u.zacatek)) + '</em><i aria-hidden="true"></i><span class="orez-1">' + esc(u.nazev || '(bez názvu)') + '</span></li>';
  let telo;
  if (dnes.length) telo = '<ul class="mo-program">' + dnes.slice(0, 4).map((u) => radek(u, false)).join('') + '</ul>' + (dnes.length > 4 ? '<p class="mo-dalsi">+ ' + (dnes.length - 4) + ' další</p>' : '');
  else {
    const zitra = kal.mameData(pridejDny(pulnoc(ted), 1)) ? kal.udalostiDne(pridejDny(pulnoc(ted), 1)).filter((u) => !u.celodenni).slice(0, 1) : [];
    telo = prazdne('Dnes už nic v kalendáři') + (zitra.length ? '<ul class="mo-program">' + radek(zitra[0], true) + '</ul>' : '');
  }
  return karta('kalendar', IKONY.kalendar, 'Dnes · ' + DNY_KR[new Date(ted).getDay()] + ' ' + dm(ted), '<button type="button" class="mo-sipka" data-mini-cil="kalendar" aria-label="Otevřít kalendář">' + IKONY.sipka + '</button>', telo);
}

const litry = (ml) => (Math.round(ml / 50) / 20).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Pití a doplňky dnes s rychlými tlačítky – stejné atributy jako karta na Přehledu (zápis řeší zdravi.js klikZdravi). */
function zdraviHtml() {
  if (!umiMotor('zdravi')) return '';
  const p = zdravi.pitiDnes();
  const d = zdravi.doplnkyDnes(0, true);
  if (!p && !d) return '';
  const dnes = isoDatum(Date.now());
  let telo = '';
  if (p) {
    const pct = Math.min(100, Math.round(p.ml / p.cil * 100));
    telo += '<div class="mo-piti" data-piti-den="' + dnes + '"><span class="mo-piti__ikona" aria-hidden="true">💧</span>' +
      '<span class="mo-piti__text"><b class="cisla">' + litry(p.ml) + ' l</b><small> z ' + litry(p.cil) + ' l · ' + (p.odhad ? '≈ ' : '') + p.b + ' g bílkovin</small>' +
      '<span class="mo-pruh"><i style="width:' + pct + '%"></i></span></span>' +
      '<button type="button" class="btn btn--sm mo-piti__plus" data-piti="500" aria-label="Přidat půl litru vody">+0,5 l</button></div>';
  }
  if (d && d.polozky.length) {
    // jen to, co dnes platí (hlavní první); odškrtnutí jako na Přehledu
    const dnesni = d.polozky.filter((x) => x.plati || x.vzato).sort((a, b) => (b.hlavni - a.hlavni));
    telo += '<ul class="mo-doplnky">' + dnesni.slice(0, 8).map((x) => '<li><button type="button" class="mo-doplnek' + (x.hlavni ? '' : ' mo-doplnek--vedlejsi') + '" data-doplnek="' + esc(x.id) +
      '" data-doplnek-den="' + dnes + '" aria-pressed="' + x.vzato + '"><i class="mo-zaskrt" aria-hidden="true">' + IKONY.fajfka + '</i><span class="orez-1">' + esc(x.nazev) + '</span></button></li>').join('') + '</ul>';
  }
  const zbyva = d ? d.plneni.celkem - d.plneni.vzato : 0;
  const vpravo = d && d.plneni.celkem ? '<span class="muted small">' + (zbyva ? 'zbývá ' + zbyva : 'vše ✓') + '</span>' : '';
  return karta('zdravi', IKONY.kapka, 'Pití a doplňky', vpravo + '<button type="button" class="mo-sipka" data-mini-cil="zdravi" aria-label="Otevřít Zdraví">' + IKONY.sipka + '</button>', telo);
}

/** Fotbal: další zápas klubu a poslední výsledek (z fotbal.cz). */
function fotbalHtml() {
  if (!umiMotor('fotbal') || !fotbal.maData()) return '';
  const dalsi = fotbal.dalsiZapasKlubu(21);
  let posledni = null;
  fotbal.prehled().forEach((x) => { if (x.posledni && (!posledni || fotbal.cas(x.posledni) > fotbal.cas(posledni.z))) posledni = { z: x.posledni, tym: x.tym }; });
  const kdy = (t) => { const r = rozdilDni(t); return (r === 0 ? 'dnes' : r === 1 ? 'zítra' : DNY_KR[new Date(t).getDay()] + ' ' + dm(t)) + ' ' + hhmm(t); };
  let telo = '';
  if (dalsi) telo += '<p class="mo-zapas"><small>Další</small><b class="orez-1">' + esc(dalsi.nazev) + '</b><em class="cisla">' + esc(kdy(dalsi.zacatek)) + '</em></p>';
  if (posledni) {
    const v = fotbal.vrp(posledni.z);
    telo += '<p class="mo-zapas"><small>Poslední</small><b class="orez-1"><span class="mo-vrp mo-vrp--' + v + '">' + (v || '–') + '</span>' + esc(posledni.z.vysledek) + ' ' +
      esc(fotbal.souper(posledni.z)) + '</b><em>' + esc(posledni.tym.nazev) + '</em></p>';
  }
  if (!telo) return '';
  return karta('fotbal', IKONY.zapas, 'Fotbal · ' + esc(klub((stav.fotbal.data && stav.fotbal.data.klub) || '')),
    '<button type="button" class="mo-sipka" data-mini-cil="fotbal" aria-label="Otevřít Fotbal">' + IKONY.sipka + '</button>', telo);
}

const DRUH_IG = { reel: 'Reel', plakat: 'Plakát', pribeh: 'Příběh' };
/** Instagram: co dnes vyjde, co se zveřejňuje, co nevyšlo a co dnes vyšlo. */
function instagramHtml() {
  if (!umiMotor('reely')) return '';
  let plany = [];
  try { plany = ig.planyInstagramu(); } catch (e) { return ''; }
  const ted = ig.tedMotoru();
  const dnes = pulnoc(Date.now());
  const vyber = plany.filter((x) => {
    const z = x.z;
    if (P.ceka(z)) return (Number(z.kdy) || 0) < pridejDny(dnes, 1) + 6 * 36e5; // dnes (a v noci)
    if (P.rozpracovana(z)) return true;
    return (z.stav === 'hotovo' || z.stav === 'chyba') && P.konec(z) >= dnes;
  }).sort((a, b) => (Number(a.z.kdy) || 0) - (Number(b.z.kdy) || 0));
  const stavIg = (x) => {
    const z = x.z;
    const zas = P.zasek(z, ted, 0, x.video);
    if (z.stav === 'hotovo') return '<span class="tag tag--ok">vyšlo ' + esc(P.casKratce(P.konec(z), ted)) + '</span>';
    if (z.stav === 'chyba') return '<span class="tag tag--danger">nevyšlo</span>';
    if (zas) return '<span class="tag tag--danger">zaseklo se</span>';
    if (P.rozpracovana(z)) return '<span class="tag tag--warn">zveřejňuje se</span>';
    return '<span class="tag">' + esc(P.casKratce(Number(z.kdy) || 0, ted)) + '</span>';
  };
  const telo = vyber.length ? '<ul class="mo-seznam">' + vyber.slice(0, 3).map((x) => '<li><button type="button" class="mo-ig" data-mini-cil="ig:' + esc(x.typ + ':' + x.id) + '">' +
    '<span class="mo-ig__text"><small>' + (DRUH_IG[x.z.jenPribeh ? 'pribeh' : x.typ] || 'Příspěvek') + '</small><b class="orez-1">' + esc(x.nazev) + '</b></span>' + stavIg(x) + '</button></li>').join('') + '</ul>'
    : prazdne('Dnes nic naplánovaného');
  return karta('fotbal', IKONY.instagram, 'Instagram dnes', '<button type="button" class="mo-sipka" data-mini-cil="reely" aria-label="Otevřít Reely">' + IKONY.sipka + '</button>', telo, ' data-mo="instagram"');
}

/** Celá mini stránka. plovouci = v plovoucím okně (bez tlačítka Plovoucí okno, místo Celá aplikace „Otevřít Asistenta“). */
export function miniHtml(plovouci) {
  const ted = Date.now();
  const tl = (atr, ikona, popisek, trida) => '<button type="button" class="btn btn--ikona btn--sm ' + (trida || '') + '" ' + atr + ' aria-label="' + popisek + '" title="' + popisek + '">' + ikona + '</button>';
  const hlava = '<header class="mo-hlava"><span class="mo-hlava__logo" aria-hidden="true">' + IKONY.dnes + '</span>' +
    '<span class="mo-hlava__text"><b>Asistent</b><small class="cisla">' + DNY_KR[new Date(ted).getDay()] + ' ' + dm(ted) + ' · ' + hhmm(ted) + '</small></span>' +
    '<span class="mo-hlava__akce">' + tl('data-obnovit', IKONY.obnovit, 'Obnovit') +
      (!plovouci && umiPlovouci() ? tl('data-mini-plovouci', IKONA_PLOVOUCI, 'Plovoucí okno – vždy navrchu') : '') +
      (plovouci ? tl('data-mini-cil="aplikace"', IKONY.ven, 'Otevřít Asistenta') : tl('data-mini-cela', IKONA_CELA, 'Celá aplikace (Ctrl+Shift+A)')) + '</span></header>';
  return hlava + cislaHtml() + postaHtml() + programHtml() + zdraviHtml() + fotbalHtml() + instagramHtml();
}

const ik = (obsah) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + obsah + '</svg>';
const IKONA_PLOVOUCI = ik('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><rect x="11.5" y="11" width="7" height="6" rx="1.2" fill="currentColor" stroke="none"/>');
const IKONA_CELA = ik('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>');

// ---------------------------------------------------------------- vykreslení (hlavní okno v mini, plovoucí okno)

let posledniHtml = '';
/** app.js vykresli v mini režimu: stránka do #mini (jen při změně). */
export function vykresli(el) {
  hlidejHodiny();
  if (!s.styl) { nactiStyl().then(zmeneno); return; }
  const h = miniHtml(false);
  if (h === posledniHtml && el.innerHTML) return;
  posledniHtml = h;
  el.innerHTML = h;
}

/** Po každém překreslení aplikace: plovoucí okno živě. */
export function poVykresleni() {
  if (!s.pip) return;
  const doc = s.pip.document;
  // motiv a barva jako hlavní okno (Nastavení → Vzhled)
  const html = document.documentElement;
  ['data-motiv', 'style'].forEach((a) => {
    const v = html.getAttribute(a);
    if (v == null) doc.documentElement.removeAttribute(a); else if (doc.documentElement.getAttribute(a) !== v) doc.documentElement.setAttribute(a, v);
  });
  const h = miniHtml(true);
  if (h === s.pipHtml) return;
  s.pipHtml = h;
  doc.getElementById('mini').innerHTML = h;
}

// ---------------------------------------------------------------- plovoucí okno (Document Picture-in-Picture)

/** Styly aplikace do plovoucího okna (pravidla jako text; cizí – písma plakátu – odkazem). */
function kopirujStyly(doc) {
  Array.from(document.styleSheets).forEach((sh) => {
    try {
      const st = doc.createElement('style');
      st.textContent = Array.from(sh.cssRules).map((r) => r.cssText).join('\n');
      if (sh.media && sh.media.mediaText) st.media = sh.media.mediaText;
      doc.head.appendChild(st);
    } catch (e) {
      if (!sh.href) return;
      const l = doc.createElement('link');
      l.rel = 'stylesheet';
      l.href = sh.href;
      if (sh.media && sh.media.mediaText) l.media = sh.media.mediaText;
      doc.head.appendChild(l);
    }
  });
}

/** Klepnutí v plovoucím okně: mini tlačítka tady, ostatní (voda, doplněk, Obnovit) stejně jako v aplikaci (app.js obsluhaKliku). */
function klikVPlovoucim(e) {
  const el = e.target.closest('button, a[data-cil]');
  if (!el) return;
  if (klikMini(el, true)) return;
  if (hooky.klik) hooky.klik(el);
}

/** Plovoucí okno vždy navrchu – volat v klepnutí (prohlížeč jinak okno nedovolí). Druhé klepnutí ho jen ukáže. */
export async function plovouci() {
  if (!umiPlovouci()) { toast('Plovoucí okno tenhle prohlížeč neumí (Chrome nebo Edge 116+)', true); return null; }
  if (s.pip && !s.pip.closed) { try { s.pip.focus(); } catch (e) { /* nic */ } return s.pip; }
  const slib = documentPictureInPicture.requestWindow({ width: 360, height: 640, disallowReturnToOpener: false });
  await nactiStyl();
  const w = await slib;
  const doc = w.document;
  doc.documentElement.lang = 'cs';
  doc.title = 'Asistent';
  kopirujStyly(doc);
  const koren = doc.createElement('div');
  koren.id = 'mini';
  koren.className = 'mo mo--plovouci';
  doc.body.appendChild(koren);
  doc.body.classList.add('mo-telo');
  doc.addEventListener('click', klikVPlovoucim);
  w.addEventListener('pagehide', () => { if (s.pip === w) { s.pip = null; s.pipHtml = ''; } });
  s.pip = w;
  s.pipHtml = '';
  hlidejHodiny();
  poVykresleni();
  return w;
}

export const plovouciOtevrene = () => !!s.pip;

// ---------------------------------------------------------------- ovládání

/** Klepnutí na prvek mini stránky (data-mini-*). vPlovoucim = z plovoucího okna. → true, když ho zpracovalo. */
export function klikMini(el, vPlovoucim) {
  if (el.hasAttribute('data-mini-plovouci')) { plovouci().catch((e) => toast(e.message, true)); return true; }
  if (el.hasAttribute('data-mini-cela')) { if (hooky.prepniMini) hooky.prepniMini(false); return true; }
  const cil = el.dataset.miniVlakno ? 'vlakno:' + el.dataset.miniVlakno : el.dataset.miniCil;
  if (!cil) return false;
  if (hooky.otevriCil) hooky.otevriCil(cil);
  if (vPlovoucim) { try { window.focus(); } catch (e) { /* nic */ } }
  return true;
}

/**
 * Samostatné mini okno → věc otevřít v hlavním okně. Okno otevřené z hlavního (Otevřít mini okno) ho má jako opener;
 * okno ze zástupce na ikoně se ptá přes BroadcastChannel – když se do 0,4 s žádné hlavní okno neozve, otevře nové.
 */
export function doHlavnihoOkna(cil) {
  try {
    const o = window.opener;
    if (o && !o.closed && typeof o.asistentOtevri === 'function') { o.asistentOtevri(cil); o.focus(); return; }
  } catch (e) { /* jiný původ – přes kanál */ }
  let ozvalo = false;
  let kanal = null;
  try { kanal = new BroadcastChannel(KANAL); } catch (e) { kanal = null; }
  const otevriNove = () => { try { window.open('./?otevri=' + encodeURIComponent(cil), '_blank'); } catch (e) { /* nic */ } };
  if (!kanal) { otevriNove(); return; }
  kanal.onmessage = (e) => { if (e.data && e.data.typ === 'otevreno' && e.data.cil === cil) { ozvalo = true; toast('Otevřeno v hlavním okně Asistenta'); } };
  kanal.postMessage({ typ: 'otevri', cil });
  setTimeout(() => { kanal.close(); if (!ozvalo) otevriNove(); }, 400);
}
