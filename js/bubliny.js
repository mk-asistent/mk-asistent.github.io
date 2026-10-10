// Bubliny – jedna komponenta pro celou aplikaci místo textových title (Michal 10. 10.: „když najedu na ty kroužky, chci
// aby se mi to hezky zobrazilo jakoby vyjeté … ne jen škaredý výpis“). Dva druhy, jeden vzhled (app.css, oddíl Bubliny –
// plocha karty, jemný okraj, stín a šipka k prvku; tmavý i světlý režim):
//  • bublina s hodnotou (grafy, drobné údaje): prvek s atributy z bublina() – nadpis, velké číslo, rozpis. Myš najetím,
//    dotyk klepnutím (zmizí klepnutím jinam), klávesnice – graf s grafAtr() je jedno místo pro Tab, šipky ←/→ (Home/End)
//    projdou body, Esc ji schová. Míří na bod (data-kotva); myš ani prst ji nechytí. (Dřív v js/grafy.js – ten ji dál vydává.)
//  • vyjetá karta (dlaždice v horní liště Přehledu, kroužky na telefonu): prvek s atributem z karta('druh'), obsah dodá
//    funkce z registruj('druh', fn). Myš: po krátké prodlevě vyjede pod prvkem a dá se do ní najet (tlačítka); klik na prvek
//    vede, kam vedl. Klávesnice: fokus ji ukáže, šipka dolů skočí dovnitř, Esc zavře. Dotyk: klepnutí ji ukáže (prvek nikam
//    nevede), druhé klepnutí nebo klepnutí jinam ji zavře – dál se jde tlačítkem v kartě.
// Obě jsou position: fixed v <body> (nic je neořízne), drží se 8 px od okrajů obrazovky a překreslení stránky je nezavře –
// najdou stejný prvek v novém HTML (karta přes obnovKartu() po každém vykreslení v app.js).

import { esc } from './pomocne.js';

const OKRAJ = 8;          // px od okraje obrazovky
const MEZERA = 9;         // px mezi prvkem a bublinou (šipka)
const PRODLEVA = 260;     // ms – najetí myší, než karta vyjede (přejetí myší přes lištu ji nevysune)
const DOBA_SKRYTI = 170;  // ms – myš smí přejet mezeru mezi prvkem a kartou
const DOBA_ZMIZENI = 180; // ms – karta mizí (přechod v app.css), pak hidden

/** Bublinu el k obdélníku r: pod (karta) nebo nad (bublina s hodnotou); když se tam nevejde, na druhou stranu. Vodorovně
 *  na střed prvku a dovnitř obrazovky, šipka (--sipka) míří na střed prvku; třída „dole“ = bublina je pod prvkem. */
function umisti(el, r, pod) {
  const vyska = window.innerHeight, sirka = document.documentElement.clientWidth || window.innerWidth;
  // rozměry bez přechodu „vyjetí“ (transform) a i s desetinami (offsetWidth zaokrouhluje → přesah o zlomek px)
  const cs = getComputedStyle(el);
  const w = parseFloat(cs.width) || el.offsetWidth, h = parseFloat(cs.height) || el.offsetHeight;
  const stred = r.left + r.width / 2;
  const x = Math.max(OKRAJ, Math.min(Math.round(stred - w / 2), Math.floor(sirka - w - OKRAJ)));
  const nahore = r.top - h - MEZERA, dole = r.bottom + MEZERA;
  const vejdeNahoru = nahore >= OKRAJ, vejdeDolu = dole + h <= vyska - OKRAJ;
  const jePod = pod ? vejdeDolu || !vejdeNahoru : !vejdeNahoru;
  const y = jePod ? Math.min(dole, vyska - h - OKRAJ) : nahore;
  el.classList.toggle('dole', jePod);
  el.style.left = x + 'px';
  el.style.top = Math.round(Math.max(OKRAJ, y)) + 'px';
  el.style.setProperty('--sipka', Math.round(Math.max(16, Math.min(w - 16, stred - x))) + 'px');
}

const jeKlavesnice = (el) => { try { return el.matches(':focus-visible'); } catch (e) { return true; } };
const viditelny = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

// ---------------------------------------------------------------- bublina s hodnotou (grafy; Michal 9. 10.: „když si najedu
// na graf, chtěl bych, aby se zobrazovalo, kolik to byla cena a který měsíc se jedná“)

/** Atributy prvku: nadpis (měsíc, den), hodnota (číslo s jednotkou), pod (rozpis, nepovinné). */
export function bublina(nadpis, hodnota, pod) {
  return ' data-bublina="' + esc(nadpis) + '" data-bublina-hodnota="' + esc(hodnota) + '"' + (pod ? ' data-bublina-pod="' + esc(pod) + '"' : '') +
    ' aria-label="' + esc(nadpis + ': ' + hodnota + (pod ? ' (' + pod + ')' : '')) + '"';
}

/**
 * Atributy obalu grafu: šipky mezi body. Body bez vlastního zaměření (SVG) → obal je jedno místo pro Tab (tab = true);
 * body jsou tlačítka → stačí šipky (tab = false).
 */
export function grafAtr(popis, tab) {
  return ' data-graf' + (tab === false ? '' : ' tabindex="0"') + ' role="group" aria-label="' + esc(popis) + (tab === false ? '' : ' – šipkami projdeš hodnoty') + '"';
}

let bublinaEl = null, hlaseniEl = null, kotva = null, pripnuto = false, ukazatel = 'mouse', casovacSkryti = 0, pozorovatel = null;

function prvekBubliny() {
  if (!bublinaEl) {
    bublinaEl = document.createElement('div');
    bublinaEl.className = 'bublina graf-bublina';
    bublinaEl.id = 'graf-bublina';
    bublinaEl.setAttribute('role', 'tooltip');
    bublinaEl.hidden = true;
    hlaseniEl = document.createElement('div');
    hlaseniEl.className = 'graf-hlaseni';
    hlaseniEl.setAttribute('aria-live', 'polite');
    document.body.append(bublinaEl, hlaseniEl);
  }
  return bublinaEl;
}

/** Ukáže bublinu u prvku el (data-bublina…); zKlavesnice = přečíst i čtečce obrazovky. */
export function ukazBublinu(el, zKlavesnice) {
  const b = prvekBubliny();
  clearTimeout(casovacSkryti);
  if (kotva && kotva !== el) kotva.classList.remove('graf-aktivni');
  kotva = el;
  el.classList.add('graf-aktivni');
  const d = el.dataset;
  b.innerHTML = '<small>' + esc(d.bublina) + '</small>' + (d.bublinaHodnota ? '<b>' + esc(d.bublinaHodnota) + '</b>' : '') +
    (d.bublinaPod ? '<span>' + esc(d.bublinaPod) + '</span>' : '');
  b.hidden = false;
  umistiBublinu();
  if (zKlavesnice) hlaseniEl.textContent = d.bublina + ': ' + (d.bublinaHodnota || '') + (d.bublinaPod ? ', ' + d.bublinaPod : '');
  if (!pozorovatel && window.MutationObserver) {
    // překreslení stránky (nová data) prvek vymění → najít stejný bod v novém grafu, jinak bublinu schovat
    pozorovatel = new MutationObserver(() => { if (kotva && !kotva.isConnected) znovuNajdi(); });
    pozorovatel.observe(document.body, { childList: true, subtree: true });
  }
}

export function skryjBublinu() {
  clearTimeout(casovacSkryti);
  if (kotva) kotva.classList.remove('graf-aktivni');
  kotva = null;
  pripnuto = false;
  if (bublinaEl) bublinaEl.hidden = true;
  if (pozorovatel) { pozorovatel.disconnect(); pozorovatel = null; }
}

function znovuNajdi() {
  const stary = kotva;
  const novy = Array.prototype.find.call(document.querySelectorAll('[data-bublina]'), (x) => x.dataset.bublina === stary.dataset.bublina &&
    x.dataset.bublinaHodnota === stary.dataset.bublinaHodnota);
  if (!novy) { skryjBublinu(); return; }
  kotva = null;
  ukazBublinu(novy); // i s novým rozpisem (pod)
}

/** Bublina nad bodem (když se nahoru nevejde, pod ním), vodorovně posunutá dovnitř obrazovky; šipka míří na bod. */
function umistiBublinu() {
  if (!kotva || !bublinaEl || bublinaEl.hidden) return;
  if (!kotva.isConnected) { znovuNajdi(); return; }
  const r = (kotva.querySelector('[data-kotva]') || kotva).getBoundingClientRect();
  if ((!r.width && !r.height) || r.bottom < 0 || r.top > window.innerHeight) { skryjBublinu(); return; }
  umisti(bublinaEl, r, false);
}

const bodGrafu = (cil) => (cil && cil.closest ? cil.closest('[data-bublina]') : null);

// ---------------------------------------------------------------- vyjetá karta

const obsahy = {}; // druh → fn(prvek) → HTML obsahu karty ('' = karta se neukáže)

/** Obsah karty pro prvky s karta(druh); fn dostane prvek a vrátí HTML ('' = nic neukázat, prvek se chová jako dřív). */
export function registruj(druh, fn) { obsahy[druh] = fn; }

/** Atribut prvku, u kterého vyjede karta. */
export function karta(druh) { return ' data-karta="' + esc(druh) + '"'; }

/** Hlavička karty: čtverec s ikonou (barva oblasti --o; hotový prvek „<span class="bk-…“ jde rovnou), malý nadpis
 *  verzálkami, velká hodnota a věta; vpravo nepovinně. hodnota a veta jsou HTML (volající je ošetří). */
export function hlavaKarty(ikona, nadpis, hodnota, veta, vpravo) {
  return '<div class="bk-hlava">' + (/^<span class="bk-/.test(ikona) ? ikona : '<span class="bk-ikona">' + ikona + '</span>') +
    '<span class="bk-hlava__text"><small>' + esc(nadpis) + '</small>' +
    (hodnota ? '<b class="cisla">' + hodnota + '</b>' : '') + (veta ? '<span>' + veta + '</span>' : '') + '</span>' + (vpravo || '') + '</div>';
}

/** Pata karty: tlačítka [atributy, text, hlavní?] – dál (stránka, detail); na dotyku jediná cesta dál. */
export function pataKarty(tlacitka) {
  return '<div class="bk-pata">' + tlacitka.filter(Boolean).map((t) => '<button type="button" class="bk-akce' + (t[2] ? ' bk-akce--hlavni' : '') + '" ' + t[0] + '>' +
    '<span>' + esc(t[1]) + '</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>').join('') + '</div>';
}

let kartaEl = null, kartaKotva = null, kartaHtml = '', kartaPripnuta = false, kartaKlavesnice = false;
let casovacKarty = 0, casovacSkrytiKarty = 0, casovacZmizeni = 0, potlacFokus = false;

function prvekKarty() {
  if (!kartaEl) {
    kartaEl = document.createElement('div');
    kartaEl.className = 'bublina bublina--karta';
    kartaEl.id = 'bublina-karta';
    kartaEl.setAttribute('role', 'dialog');
    kartaEl.hidden = true;
    document.body.append(kartaEl);
  }
  return kartaEl;
}

/** Prvek už kartu nemá otevřenou (zvýraznění a odkaz pro čtečku pryč). */
const odznac = (el) => { el.removeAttribute('aria-expanded'); el.removeAttribute('aria-controls'); };
const kartaVidet = () => !!(kartaEl && !kartaEl.hidden && kartaEl.classList.contains('videt'));
const kartaZ = (cil) => (cil && cil.closest ? cil.closest('[data-karta]') : null);
const vKarte = (cil) => !!(kartaEl && cil && cil.nodeType === 1 && kartaEl.contains(cil));

function obsahKarty(el) {
  const fn = obsahy[el.dataset.karta];
  return fn ? fn(el) || '' : '';
}

/** Ukáže kartu u prvku el (pripnout = nezmizí, když z něj myš odjede – dotyk). false = prvek kartu nemá. */
export function ukazKartu(el, pripnout) {
  const html = obsahKarty(el);
  if (!html) { skryjKartu(); return false; }
  const k = prvekKarty();
  clearTimeout(casovacKarty);
  clearTimeout(casovacSkrytiKarty);
  clearTimeout(casovacZmizeni);
  if (kartaKotva && kartaKotva !== el) odznac(kartaKotva);
  kartaKotva = el;
  kartaPripnuta = !!pripnout;
  el.setAttribute('aria-expanded', 'true');
  el.setAttribute('aria-controls', 'bublina-karta');
  k.dataset.druh = el.dataset.karta;
  k.setAttribute('aria-label', el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim());
  if (html !== kartaHtml) { k.innerHTML = '<div class="bk-obsah">' + html + '</div>'; kartaHtml = html; }
  const byla = kartaVidet();
  k.hidden = false;
  umistiKartu();
  if (!byla) { void k.offsetWidth; k.classList.add('videt'); } // přechod „vyjetí“ (app.css)
  return true;
}

/** Schová kartu (dojede přechodem, pak hidden). */
export function skryjKartu() {
  clearTimeout(casovacKarty);
  clearTimeout(casovacSkrytiKarty);
  if (kartaKotva) odznac(kartaKotva);
  kartaKotva = null;
  kartaPripnuta = false;
  kartaKlavesnice = false;
  if (!kartaEl || kartaEl.hidden) return;
  kartaEl.classList.remove('videt');
  clearTimeout(casovacZmizeni);
  casovacZmizeni = setTimeout(() => { if (!kartaKotva) kartaEl.hidden = true; }, DOBA_ZMIZENI);
}

function umistiKartu() {
  if (!kartaKotva || !kartaEl || kartaEl.hidden) return;
  if (!kartaKotva.isConnected) { obnovKartu(); return; }
  const r = kartaKotva.getBoundingClientRect();
  if ((!r.width && !r.height) || r.bottom < 0 || r.top > window.innerHeight) { skryjKartu(); return; }
  umisti(kartaEl, r, true);
}

/**
 * Po překreslení (app.js volá po každém vykreslení): otevřená karta dostane čerstvý obsah; vyměněný prvek (nová data)
 * najde podle druhu znovu, zmizelý (jiná stránka) kartu zavře. Pod fokusem v kartě obsah nepřepisuje.
 */
export function obnovKartu() {
  if (!kartaKotva || !kartaEl || kartaEl.hidden) return;
  if (!kartaKotva.isConnected) {
    const druh = kartaKotva.dataset.karta;
    const novy = Array.prototype.find.call(document.querySelectorAll('[data-karta]'), (x) => x.dataset.karta === druh && viditelny(x));
    if (!novy) { skryjKartu(); return; }
    kartaKotva = novy;
    novy.setAttribute('aria-expanded', 'true');
    novy.setAttribute('aria-controls', 'bublina-karta');
  }
  if (!kartaEl.contains(document.activeElement)) {
    const html = obsahKarty(kartaKotva);
    if (!html) { skryjKartu(); return; }
    if (html !== kartaHtml) { kartaEl.innerHTML = '<div class="bk-obsah">' + html + '</div>'; kartaHtml = html; }
  }
  umistiKartu();
}

/** Jaké zařízení klik udělalo: myš, dotyk (touch, pen), nebo klávesnice (Enter, mezerník, čtečka). */
let posledniUkazatel = 'mouse', casUkazatele = 0;
function puvodKliku(e) {
  if (e.detail === 0) return 'klavesnice';
  if (e.pointerType) return e.pointerType;
  return Date.now() - casUkazatele < 1500 ? posledniUkazatel : 'mouse';
}

// ---------------------------------------------------------------- ovládání – jednou pro celou aplikaci (modul se načte jen
// v prohlížeči; čisté funkce výš jdou i bez DOM)
if (typeof document !== 'undefined') naslouchej();

function naslouchej() {
  document.addEventListener('pointerdown', (e) => { ukazatel = e.pointerType || 'mouse'; posledniUkazatel = ukazatel; casUkazatele = Date.now(); }, true);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return; // dotyk: až klepnutí
    // bublina s hodnotou
    const bod = bodGrafu(e.target);
    if (bod && bod !== kotva) ukazBublinu(bod);
    else if (bod) clearTimeout(casovacSkryti);
    // vyjetá karta: jen myš (pero a dotyk klepnutím)
    if (e.pointerType !== 'mouse') return;
    if (vKarte(e.target)) { clearTimeout(casovacSkrytiKarty); return; }
    const el = kartaZ(e.target);
    if (!el) return;
    clearTimeout(casovacSkrytiKarty);
    if (el === kartaKotva && kartaVidet()) return;
    clearTimeout(casovacKarty);
    // z jedné dlaždice na druhou s otevřenou kartou hned (jako menu), jinak po prodlevě
    casovacKarty = setTimeout(() => { if (el.isConnected) ukazKartu(el); }, kartaVidet() ? 0 : PRODLEVA);
  });

  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const kam = e.relatedTarget;
    // bublina s hodnotou
    if (kotva && !pripnuto && bodGrafu(e.target) === kotva && !bodGrafu(kam)) { // přechod na další bod ukáže pointerover
      // graf ovládaný z klávesnice bublinu drží, i když myš odjede
      const a = document.activeElement;
      if (!(a && a.closest && a.closest('[data-graf]') && a.closest('[data-graf]') === kotva.closest('[data-graf]') && jeKlavesnice(a))) {
        casovacSkryti = setTimeout(skryjBublinu, 120);
      }
    }
    // vyjetá karta
    if (e.pointerType !== 'mouse') return;
    const z = vKarte(e.target) ? kartaEl : kartaZ(e.target);
    if (!z || (kam && kam.nodeType === 1 && (z.contains(kam) || vKarte(kam) || kartaZ(kam)))) return; // dovnitř: pointerover
    clearTimeout(casovacKarty);
    if (kartaVidet() && !kartaPripnuta && !kartaKlavesnice) casovacSkrytiKarty = setTimeout(skryjKartu, DOBA_SKRYTI);
  });

  // klepnutí (záchyt – dřív než app.js): dotyk na prvku s kartou ji ukáže a dál nic (prvek nikam nevede), druhé klepnutí
  // ji zavře; myš a klávesnice nechají prvek dělat, co dělal (karta zmizí). Tlačítko v kartě udělá své a kartu zavře,
  // klepnutí jinam ji zavře.
  document.addEventListener('click', (e) => {
    const el = kartaZ(e.target);
    if (el && !vKarte(e.target)) {
      const puvod = puvodKliku(e);
      if (puvod === 'touch' || puvod === 'pen') {
        if (el === kartaKotva && kartaVidet()) { e.preventDefault(); e.stopImmediatePropagation(); skryjKartu(); return; }
        if (ukazKartu(el, true)) { e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      skryjKartu();
      return;
    }
    if (vKarte(e.target)) { if (e.target.closest('button, a[href]')) skryjKartu(); return; }
    if (kartaKotva) skryjKartu();
  }, true);

  // bublina s hodnotou: klepnutí na bod ji ukáže a nechá (na dotyku); klepnutí jinam ji schová
  document.addEventListener('click', (e) => {
    const el = bodGrafu(e.target);
    if (el) { ukazBublinu(el); pripnuto = ukazatel !== 'mouse'; return; }
    if (kotva) skryjBublinu();
  });

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.matches) return;
    // vyjetá karta: fokus z klávesnice na prvku ji ukáže; fokus jinam (mimo prvek a kartu) ji zavře
    if (vKarte(t)) clearTimeout(casovacSkrytiKarty);
    else if (t.matches('[data-karta]') && jeKlavesnice(t) && !potlacFokus) { if (ukazKartu(t)) kartaKlavesnice = true; }
    else if (kartaKotva && t !== kartaKotva && kartaKlavesnice) skryjKartu();
    // bublina s hodnotou
    if (!jeKlavesnice(t)) return;
    if (t.matches('[data-bublina]')) { ukazBublinu(t, true); return; }
    if (t.matches('[data-graf]')) {
      const body = t.querySelectorAll('[data-bublina]');
      const i = Math.min(body.length - 1, Number(t.dataset.grafI != null ? t.dataset.grafI : body.length - 1));
      if (body[i]) ukazBublinu(body[i], true);
    }
  });
  document.addEventListener('focusout', (e) => {
    if (!kotva || pripnuto) return;
    const kam = e.relatedTarget;
    if (kam && kam.matches && (kam.matches('[data-bublina]') || kam.matches('[data-graf]'))) return;
    skryjBublinu();
  });

  // klávesy karty (záchyt): Esc zavře (a vrátí fokus na prvek), šipka dolů z prvku skočí do karty, Tab z posledního
  // tlačítka kartu zavře a jde dál za prvek, Shift+Tab z prvního zpátky na prvek
  document.addEventListener('keydown', (e) => {
    if (!kartaVidet() || !kartaKotva) return;
    const a = document.activeElement;
    if (e.key === 'Escape') {
      const zpet = vKarte(a) ? kartaKotva : null;
      e.stopPropagation();
      skryjKartu();
      if (zpet && zpet.isConnected) { potlacFokus = true; zpet.focus(); potlacFokus = false; }
      return;
    }
    if (e.key === 'ArrowDown' && a === kartaKotva) {
      const prvni = kartaEl.querySelector('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (prvni) { e.preventDefault(); prvni.focus(); }
      return;
    }
    if (e.key === 'Tab' && vKarte(a)) {
      const prvky = Array.prototype.filter.call(kartaEl.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'), (x) => !x.disabled);
      const k = kartaKotva;
      if (e.shiftKey && a === prvky[0]) { e.preventDefault(); potlacFokus = true; k.focus(); potlacFokus = false; return; }
      if (!e.shiftKey && a === prvky[prvky.length - 1]) { skryjKartu(); potlacFokus = true; k.focus(); potlacFokus = false; } // Tab pak jde za prvek
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && kotva && bublinaEl && !bublinaEl.hidden) { skryjBublinu(); return; }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const graf = e.target && e.target.closest ? e.target.closest('[data-graf]') : null;
    if (!graf) return;
    const body = Array.prototype.slice.call(graf.querySelectorAll('[data-bublina]'));
    if (!body.length) return;
    e.preventDefault();
    // odkud: zaměřený bod (tlačítko), bod s bublinou v tomhle grafu, naposledy vybraný (data-graf-i), jinak poslední
    let i = body.indexOf(e.target);
    if (i < 0) i = body.indexOf(kotva);
    if (i < 0 && graf.dataset.grafI != null) i = Math.min(body.length - 1, Number(graf.dataset.grafI));
    if (i < 0) i = body.length - 1;
    i = e.key === 'Home' ? 0 : e.key === 'End' ? body.length - 1 : Math.max(0, Math.min(body.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)));
    graf.dataset.grafI = i;
    if (body[i].tabIndex >= 0) body[i].focus(); // tlačítka (sloupce): zaměření ukáže bublinu
    else ukazBublinu(body[i], true);
  });

  document.addEventListener('scroll', (e) => {
    if (kotva) umistiBublinu();
    if (kartaKotva && !vKarte(e.target)) umistiKartu(); // posun uvnitř karty ji nehýbe
  }, { capture: true, passive: true });
  window.addEventListener('resize', () => { if (kotva) umistiBublinu(); if (kartaKotva) umistiKartu(); });
}
