// Grafy ve stylu Fixtrack: půlkruhový ukazatel z čárek (schránka), týden ve sloupcích (kalendář) a jedna společná bublina
// s hodnotou pro všechny grafy aplikace (Zdraví, Auto, Pití a jídlo).

import { esc } from './pomocne.js';

// ---------------------------------------------------------------- bublina u grafů (Michal 9. 10.: „když si najedu na graf,
// chtěl bych, aby se zobrazovalo, kolik to byla cena a který měsíc se jedná“)
// Prvek grafu s atributy z bublina() ukáže bublinu: myš najetím, dotyk klepnutím (zmizí klepnutím jinam), klávesnice –
// graf s grafAtr() je jedno místo pro Tab, šipky ←/→ (Home/End) projdou body, Esc bublinu schová. Bublina je jedna pro celou
// aplikaci (position: fixed v <body>): nic ji neořízne a drží se 8 px od okrajů obrazovky. V prvku může být bod s data-kotva
// (kruh, vrchol sloupce) – bublina míří na něj, zbytek prvku je jen plocha pro myš a prst.

/** Atributy prvku grafu: nadpis (měsíc, den), hodnota (číslo s jednotkou), pod (rozpis, nepovinné). */
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
    bublinaEl.className = 'graf-bublina';
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
  umisti();
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

/** Bublina nad prvkem (když se nahoru nevejde, pod ním), vodorovně posunutá dovnitř obrazovky; šipka míří na prvek. */
function umisti() {
  if (!kotva || !bublinaEl || bublinaEl.hidden) return;
  if (!kotva.isConnected) { znovuNajdi(); return; }
  const cil = kotva.querySelector('[data-kotva]') || kotva;
  const r = cil.getBoundingClientRect();
  const vyska = window.innerHeight, sirka = document.documentElement.clientWidth || window.innerWidth;
  if ((!r.width && !r.height) || r.bottom < 0 || r.top > vyska) { skryjBublinu(); return; }
  const b = bublinaEl.getBoundingClientRect();
  const OKRAJ = 8, MEZERA = 9;
  const stred = r.left + r.width / 2;
  const x = Math.max(OKRAJ, Math.min(Math.round(stred - b.width / 2), Math.floor(sirka - b.width - OKRAJ)));
  let y = r.top - b.height - MEZERA;
  const dole = y < OKRAJ;
  if (dole) y = Math.min(r.bottom + MEZERA, vyska - b.height - OKRAJ);
  bublinaEl.classList.toggle('dole', dole);
  bublinaEl.style.transform = 'translate(' + x + 'px, ' + Math.round(Math.max(OKRAJ, y)) + 'px)';
  bublinaEl.style.setProperty('--sipka', Math.round(Math.max(12, Math.min(b.width - 12, stred - x))) + 'px');
}

const bodGrafu = (cil) => (cil && cil.closest ? cil.closest('[data-bublina]') : null);
const jeKlavesnice = (el) => { try { return el.matches(':focus-visible'); } catch (e) { return true; } };

// ovládání bubliny – jednou pro celou aplikaci (modul se načte jen v prohlížeči; čisté funkce výš jdou i bez DOM)
if (typeof document !== 'undefined') naslouchej();

function naslouchej() {
  document.addEventListener('pointerdown', (e) => { ukazatel = e.pointerType || 'mouse'; }, true);
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return; // dotyk: až klepnutí
    const el = bodGrafu(e.target);
    if (el && el !== kotva) ukazBublinu(el);
    else if (el) clearTimeout(casovacSkryti);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch' || !kotva || pripnuto) return;
    if (bodGrafu(e.target) !== kotva || bodGrafu(e.relatedTarget)) return; // přechod na další bod ukáže pointerover
    // graf ovládaný z klávesnice bublinu drží, i když myš odjede
    const a = document.activeElement;
    if (a && a.closest && a.closest('[data-graf]') && a.closest('[data-graf]') === kotva.closest('[data-graf]') && jeKlavesnice(a)) return;
    casovacSkryti = setTimeout(skryjBublinu, 120);
  });
  // klepnutí na bod bublinu ukáže a nechá (na dotyku); klepnutí jinam ji schová
  document.addEventListener('click', (e) => {
    const el = bodGrafu(e.target);
    if (el) { ukazBublinu(el); pripnuto = ukazatel !== 'mouse'; return; }
    if (kotva) skryjBublinu();
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.matches || !jeKlavesnice(t)) return;
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && kotva && !bublinaEl.hidden) { skryjBublinu(); return; }
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
  document.addEventListener('scroll', () => { if (kotva) umisti(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => { if (kotva) umisti(); });
}

/**
 * Půlkruh z čárek obarvených podle podílu skupin; uprostřed velké číslo.
 * segmenty = [[počet, barva CSS], …]
 */
export function pulkruh(segmenty, cislo, popisek) {
  const CAREK = 34, cx = 110, cy = 104, r1 = 72, r2 = 96;
  const celkem = segmenty.reduce((a, s) => a + s[0], 0);
  // hranice skupin na půlkruhu (podíl 0–1)
  const hranice = [];
  let soucet = 0;
  segmenty.forEach((s) => { soucet += s[0]; hranice.push(celkem ? soucet / celkem : 0); });
  let cary = '';
  for (let i = 0; i < CAREK; i++) {
    const podil = (i + 0.5) / CAREK;
    let barva = 'var(--sand-2)';
    if (celkem) {
      const j = hranice.findIndex((h) => podil <= h);
      barva = segmenty[j < 0 ? segmenty.length - 1 : j][1];
    }
    const uhel = Math.PI - podil * Math.PI;
    const x1 = (cx + r1 * Math.cos(uhel)).toFixed(1), y1 = (cy - r1 * Math.sin(uhel)).toFixed(1);
    const x2 = (cx + r2 * Math.cos(uhel)).toFixed(1), y2 = (cy - r2 * Math.sin(uhel)).toFixed(1);
    cary += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="stroke:' + barva + '"/>';
  }
  return '<div class="ukazatel"><svg viewBox="0 0 220 112" aria-hidden="true"><g stroke-width="5.5" stroke-linecap="round">' + cary + '</g></svg>' +
    '<div class="ukazatel__cislo"><b>' + esc(cislo) + '</b><small>' + esc(popisek) + '</small></div></div>';
}

/**
 * Týden ve sloupcích: dny = [{ t, pocet, dnes, popisek, nazev }]. Dnešek tmavě zelený, nejrušnější den korálový.
 * Klepnutí na sloupec otevře den v kalendáři (data-skoc-den).
 */
export function tydenGraf(dny) {
  const max = Math.max(1, ...dny.map((d) => d.pocet));
  const nejvic = dny.reduce((a, d) => (d.pocet > a.pocet ? d : a), dny[0]);
  return '<div class="tyden-graf">' + dny.map((d) => {
    const tridy = ['sloupec'];
    if (d.pocet) tridy.push('plny');
    if (d.dnes) tridy.push('dnes');
    else if (d === nejvic && d.pocet > 1) tridy.push('nejvic');
    const vyska = d.pocet ? Math.round(26 + (d.pocet / max) * 58) : 18;
    return '<button type="button" data-skoc-den="' + d.t + '" aria-label="' + esc(d.nazev + ': ' + d.pocet) + '">' +
      '<span class="' + tridy.join(' ') + '" style="height:' + vyska + 'px">' + (d.pocet || '') + '</span>' +
      '<small>' + esc(d.popisek) + '</small></button>';
  }).join('') + '</div>';
}
