// Cesťáky (Michal 16. 11.: „přesuňme do asistenta z webu dorostu cesťáky“) – cestovné na venkovní zápasy áčka a dorostu FK Agro Vnorovy.
// Na webu dorostu byla data ve veřejně čitelném Firestore; tady jsou soukromě na Disku: zápasy píše Claude do CESTAKY/zapasy.json
// (každou sezónu), Michalovy úpravy (sazba, výchozí počet aut, poháry, u zápasu bus / auta / km / cena busu) ukládá motor do
// CESTAKY/upravy.json – jen odchylky od výchozího stavu. Výpočty jsou čisté v js/cestaky_vypocet.js (stejná pravidla má motor).
// Změna se ukáže hned, do motoru jde za sebou s krátkým odkladem (pole až po opuštění nebo 600 ms bez psaní); chyba = zpět + oznámení.
// Modul načte app.js až na stránce Cesťáky; klepnutí a psaní si obsluhuje sám (atributy data-ce-…).

import { volej, jeDemo } from './api.js';
import { zmeneno } from './stav.js';
import { esc, uloziste, prepisSPolem, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, kostra, chybaHtml, segment, potvrd } from './ui.js';
import * as V from './cestaky_vypocet.js';

const ULOZISTE = 'asistent.data.cestaky';
const VOLBY = 'asistent.volby.cestaky';
const OBNOVA_PO = 120000;  // z motoru znovu nejdřív po 2 min (z minula se ukáže hned)
const ZNOVU_PO_CHYBE = 60000;
const ODKLAD_ZAPISU = 500; // víc klepnutí za sebou = jeden zápis
const ODKLAD_PSANI = 600;  // pole: po 600 ms bez psaní (nebo po opuštění)

const ulozeno = uloziste.cti(ULOZISTE);
const volby = uloziste.cti(VOLBY) || {};
const prazdnaFronta = () => ({ vratitVse: false, nastaveni: false, zapasy: {} });
const c = {
  data: (ulozeno && ulozeno.data) || null, kdy: (ulozeno && ulozeno.kdy) || 0, nacita: false, chyba: null, chybaKdy: 0,
  tym: volby.tym || 'vse',
  mistni: null,           // { nastaveni, upravy } – změny, které ještě nejsou v motoru (ukazují se hned)
  fronta: prazdnaFronta(), casovac: null, bezi: 0
};
let rada = Promise.resolve();

const posledni = new WeakMap();
/** Přepíše jen při změně HTML; pole, do kterého se píše ([data-pole]), zůstane (fokus, klávesnice v iPhonu). */
function nastav(el, html) {
  if (!el || posledni.get(el) === html) return;
  posledni.set(el, html);
  prepisSPolem(el, html);
}

// ---------------------------------------------------------------- data

/** Data k zobrazení: z motoru + změny, které se ještě ukládají. */
function pohled() { return c.data ? Object.assign({}, c.data, c.mistni || {}) : null; }
const ukladaSe = () => c.bezi > 0 || !!c.casovac;
function uloz() { if (!jeDemo() && c.data) uloziste.pis(ULOZISTE, { data: c.data, kdy: c.kdy }); }

export function nactiCestaky(znovu) {
  if (c.nacita) return;
  if (!znovu && c.data && Date.now() - c.kdy < OBNOVA_PO) return;
  if (!znovu && c.chyba && Date.now() - c.chybaKdy < ZNOVU_PO_CHYBE) return; // motor nejde – ne při každém překreslení
  c.nacita = true;
  volej('cestaky').then((d) => {
    c.chyba = null;
    if (ukladaSe()) return; // čerstvý stav přijde s odpovědí zápisu
    c.data = d;
    c.kdy = Date.now();
    uloz();
  }, (e) => { c.chyba = e; c.chybaKdy = Date.now(); }).then(() => { c.nacita = false; zmeneno(); });
}

/** Změna jako akce cestakyUlozit: hned v aplikaci, do motoru po krátkém odkladu. Neplatná hodnota = oznámení, nic se nemění. */
function zmen(p) {
  const d = pohled();
  if (!d) return;
  let nove;
  try { nove = V.pouzij(d, p); } catch (e) { toast(e.message, true); return; }
  if (JSON.stringify(nove) === JSON.stringify({ nastaveni: d.nastaveni, upravy: d.upravy || {} })) return;
  c.mistni = nove;
  if (p.vratitVse) c.fronta = Object.assign(prazdnaFronta(), { vratitVse: true });
  if (p.nastaveni) c.fronta.nastaveni = true;
  if (p.zapas) c.fronta.zapasy[p.zapas.id] = true;
  clearTimeout(c.casovac);
  c.casovac = setTimeout(odesli, ODKLAD_ZAPISU);
  zmeneno();
}

/** Fronta → požadavky za sebou (Vrátit vše, nastavení, zápasy – u každého celý stav úpravy, takže na pořadí klepnutí nezáleží). */
function odesli() {
  clearTimeout(c.casovac);
  c.casovac = null;
  const f = c.fronta, m = c.mistni;
  c.fronta = prazdnaFronta();
  if (!m) return;
  const pozadavky = [];
  if (f.vratitVse) pozadavky.push({ vratitVse: true });
  if (f.nastaveni) pozadavky.push({ nastaveni: { sazba: m.nastaveni.sazba, auta: m.nastaveni.auta, pohary: m.nastaveni.pohary } });
  Object.keys(f.zapasy).forEach((id) => {
    const u = m.upravy[id] || {};
    const zmeny = {};
    V.KLICE_ZAPASU.forEach((k) => { zmeny[k] = u[k] != null ? u[k] : null; });
    pozadavky.push({ zapas: { id, zmeny } });
  });
  if (!pozadavky.length) return;
  c.bezi++;
  rada = rada.then(async () => {
    for (const p of pozadavky) {
      const r = await volej('cestakyUlozit', p);
      if (r && c.data) Object.assign(c.data, { nastaveni: r.nastaveni, upravy: r.upravy, kdy: r.kdy });
    }
  }).then(() => {
    c.bezi--;
    if (!ukladaSe()) { c.mistni = null; c.kdy = Date.now(); uloz(); }
    zmeneno();
  }, (e) => {
    c.bezi--;
    clearTimeout(c.casovac);
    c.casovac = null;
    c.fronta = prazdnaFronta();
    c.mistni = null; // zpět na to, co je v motoru
    zmeneno();
    toast('Neuložilo se: ' + ((e && e.message) || 'chyba'), true);
    nactiCestaky(true);
  });
}

// odchod z aplikace: rozepsané změny hned do motoru
window.addEventListener('pagehide', () => { if (c.casovac) odesli(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && c.casovac) odesli(); });

// ---------------------------------------------------------------- zobrazení

function platnyTym(d) { return c.tym === 'vse' || (d.tymy || []).some((t) => t.id === c.tym) ? c.tym : 'vse'; }
const desetinne = (n) => String(n).replace('.', ',');
const pocetZapasu = (n) => n + ' ' + tvar(n, 'zápas', 'zápasy', 'zápasů');
/** Tým jako štítek: první tým zeleně, další fialově. */
function tymTag(d, id) {
  const i = (d.tymy || []).findIndex((t) => t.id === id);
  const t = (d.tymy || [])[i] || { id, nazev: id };
  return '<span class="tag ' + (i === 0 ? 'tag--ok' : 'tag--fialova') + ' ce-tym" title="' + esc(t.nazev) + '">' + esc(t.kratce || t.nazev) + '</span>';
}
const krok = (atr, smer, vypnout, popis) => '<button type="button" class="btn btn--ikona ce-krok" ' + atr + '="' + smer + '" aria-label="' + popis + '"' +
  (vypnout ? ' disabled' : '') + '>' + (smer < 0 ? '−' : '+') + '</button>';

function nastaveniHtml(d) {
  const n = d.nastaveni;
  return '<div class="ce-nast__radek">' +
    '<label class="ce-pole"><span class="label">Sazba</span><span class="ce-s-jednotkou"><input class="field ce-cislo ce-cislo--sazba" type="text" inputmode="decimal" ' +
      'autocomplete="off" data-ce-sazba data-pole="ce-sazba" value="' + esc(desetinne(n.sazba)) + '" aria-label="Sazba v Kč za km"><small>Kč/km</small></span></label>' +
    '<div class="ce-pole"><span class="label">Aut na zápas</span><span class="ce-krokovac" role="group" aria-label="Výchozí počet aut">' +
      krok('data-ce-auta-krok', -1, n.auta <= 0, 'O auto méně') + '<b class="cisla" aria-live="polite">' + n.auta + '</b>' + krok('data-ce-auta-krok', 1, n.auta >= 20, 'O auto víc') + '</span></div>' +
    '<label class="ce-pole ce-pohary"><span class="label">Poháry</span><span class="ce-s-jednotkou"><span class="prepinac"><input type="checkbox" data-ce-pohary' +
      (n.pohary ? ' checked' : '') + ' aria-label="Počítat poháry"><span></span></span><small>počítat</small></span></label>' +
    '</div>';
}

function filtrHtml(d) {
  const tymy = d.tymy || [];
  if (tymy.length < 2) return '';
  const vse = tymy.length === 2 ? tymy[0].nazev + ' i ' + tymy[1].nazev.toLowerCase() : 'Všechny týmy';
  return segment([['vse', vse]].concat(tymy.map((t) => [t.id, t.nazev])), platnyTym(d), 'data-ce-filtr', 'Tým');
}

function kpiHtml(s) {
  const kpi = (ikona, nazev, hodnota) => '<div class="kpi"><div class="kpi__hlava">' + ikona + '<span>' + nazev + '</span></div><div class="kpi__hodnota">' + hodnota + '</div></div>';
  return kpi(IKONY.auto, 'Celkem', V.cislo(s.celkem) + '<small>Kč</small>') + kpi(IKONY.zapas, 'Zápasů venku', s.pocet) +
    kpi(IKONY.misto, 'Km všemi auty', V.cislo(s.km) + '<small>km</small>') + kpi(IKONY.lide, 'Busem', s.busem);
}

function souhrnHtml(s) {
  const t = s.tabulka;
  const bunky = (a) => a.map((x) => '<td>' + V.cislo(x) + '</td>').join('');
  return '<div class="card-hlava"><span class="nadpis">' + IKONY.tabulka + '<span>Souhrn v Kč</span></span></div>' +
    '<div class="tabulka-obal"><table class="ce-souhrn__tab cisla"><thead><tr><th></th>' +
    t.obdobi.map((o) => '<th><span class="ce-pc">' + esc(o.nazev) + '</span><span class="ce-mob">' + esc(o.kratce) + '</span></th>').join('') + '<th>Celkem</th></tr></thead><tbody>' +
    t.radky.map((r) => '<tr><th scope="row">' + esc(r.nazev) + '</th>' + bunky(r.obdobi) + '<td><b>' + V.cislo(r.celkem) + '</b></td></tr>').join('') +
    (t.celkem ? '<tr class="ce-souhrn__celkem"><th scope="row">Celkem</th>' + bunky(t.celkem.obdobi) + '<td>' + V.cislo(t.celkem.celkem) + '</td></tr>' : '') +
    '</tbody></table></div>';
}

function zapasHtml(d, z) {
  const id = esc(z.id);
  const ovl = '<label class="ce-km"><input class="field ce-cislo ce-cislo--km" type="number" inputmode="numeric" min="0" max="2000" step="1" data-ce-km data-pole="ce-km-' + id +
      '" value="' + z.km + '" aria-label="Km jedna cesta – ' + esc(z.souper) + '"><small>km</small></label>' +
    '<label class="ce-bus"><span class="prepinac"><input type="checkbox" data-ce-bus' + (z.bus ? ' checked' : '') + ' aria-label="Busem – ' + esc(z.souper) + '"><span></span></span><small>Bus</small></label>' +
    (z.bus
      ? '<label class="ce-buskc"><input class="field ce-cislo ce-cislo--kc" type="number" inputmode="numeric" min="0" max="200000" step="100" data-ce-buskc data-pole="ce-buskc-' + id +
        '" value="' + (z.busKc || '') + '" placeholder="cena" aria-label="Cena busu v Kč – ' + esc(z.souper) + '"><small>Kč</small></label>'
      : '<span class="ce-krokovac" role="group" aria-label="Počet aut – ' + esc(z.souper) + '">' + krok('data-ce-krok', -1, z.auta <= 0, 'O auto méně') +
        '<b class="cisla">' + z.auta + '</b>' + krok('data-ce-krok', 1, z.auta >= 20, 'O auto víc') + '<small>aut</small></span>');
  return '<li class="ce-zapas' + (z.bus ? ' ce-zapas--bus' : '') + '" data-ce-id="' + id + '">' +
    '<div class="ce-zapas__info"><span class="ce-zapas__nahore">' + tymTag(d, z.tym) + '<span class="ce-zapas__den cisla">' + V.den(z.datum) + '</span>' +
      (z.pohar ? '<span class="tag tag--warn">pohár</span>' : '') + (z.upraveno ? '<span class="tag tag--seda">upraveno</span>' : '') + '</span>' +
      '<b class="ce-zapas__souper" title="' + esc(z.souper) + '">' + esc(z.souper) + '</b>' + (z.hriste ? '<small class="ce-zapas__hriste">' + esc(z.hriste) + '</small>' : '') + '</div>' +
    '<div class="ce-zapas__ovl">' + ovl + '</div>' +
    '<div class="ce-zapas__kc"><b class="cisla">' + V.kc(z.castka) + '</b><small>' + (z.bus ? 'bus' : V.cislo(z.autaKm) + ' km') + '</small></div></li>';
}

function zapasyHtml(d, s) {
  if (!s.obdobi.length) return '<div class="prazdne"><b>Žádné zápasy</b><span>Pro tenhle výběr tu nic není.</span></div>';
  return s.obdobi.map((o) => '<section class="card ce-obdobi"><div class="card-hlava"><span class="nadpis"><span>' + esc(o.nazev) + '</span></span>' +
    '<span class="vpravo"><b class="cisla ce-obdobi__kc">' + V.kc(o.castka) + '</b></span></div><ul class="ce-zapasy">' + o.zapasy.map((z) => zapasHtml(d, z)).join('') + '</ul></section>').join('');
}

function pataHtml(d) {
  const jeZmena = Object.keys(d.upravy || {}).length > 0 || V.KLICE_NASTAVENI.some((k) => d.nastaveni[k] !== d.vychozi[k]);
  const kdy = d.kdy ? new Date(d.kdy) : null;
  const casText = kdy && !isNaN(kdy) ? 'Naposledy uloženo ' + kdy.toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  return (jeZmena ? '<button type="button" class="btn btn--ghost btn--sm" data-ce-vratit>' + IKONY.obnovit + '<span>Vrátit vše na výchozí</span></button>' : '') +
    (ukladaSe() ? '<span class="napoveda">ukládám…</span>' : casText ? '<span class="napoveda">' + esc(casText) + '</span>' : '') +
    (c.chyba ? '<span class="napoveda">Nepodařilo se obnovit · <button type="button" class="odkaz" data-ce-znovu>Zkusit znovu</button></span>' : '') +
    ((d.chybne || []).length ? '<span class="napoveda">Claude má v datech chybu: ' + esc(d.chybne.join(', ')) + '</span>' : '');
}

export function vykresliCestaky(el) {
  nactiCestaky(false);
  const d = pohled();
  if (!d || !(d.zapasy || []).length) {
    nastav(el, !d
      ? '<section class="card">' + (c.chyba ? chybaHtml(c.chyba, 'data-ce-znovu') : kostra(6)) + '</section>'
      : '<div class="prazdne prazdne--velke"><i class="kruh">' + IKONY.auto + '</i><b>Zápasy zatím nejsou</b>' +
        '<span>Claude je na sezónu připraví do CLAUDE_SCHRANKA/CESTAKY/zapasy.json.</span></div>');
    return;
  }
  if (!el.querySelector('#ce-zapasy')) {
    posledni.delete(el);
    // PC (16. 11.): nahoře pruh tým · nastavení · uloženo, pod ním dlaždice vedle souhrnu, období ve sloupcích (cestaky.css)
    el.innerHTML = '<div class="ce-stranka"><div class="ce-lista"><div class="ce-filtr" id="ce-filtr"></div><section class="card ce-nast" id="ce-nast"></section>' +
      '<div class="ce-pata" id="ce-pata"></div></div>' +
      '<div class="ce-prehled"><div class="kpi-mrizka ce-kpi" id="ce-kpi"></div><section class="card ce-souhrn" id="ce-souhrn"></section></div>' +
      '<div class="ce-obdobi-seznam" id="ce-zapasy"></div></div>';
  }
  const s = V.souhrn(d, { tym: platnyTym(d) });
  nastav(el.querySelector('#ce-nast'), nastaveniHtml(d));
  nastav(el.querySelector('#ce-filtr'), filtrHtml(d));
  nastav(el.querySelector('#ce-kpi'), kpiHtml(s));
  nastav(el.querySelector('#ce-souhrn'), souhrnHtml(s));
  nastav(el.querySelector('#ce-zapasy'), zapasyHtml(d, s));
  nastav(el.querySelector('#ce-pata'), pataHtml(d));
}

export function podnadpis() {
  const d = pohled();
  if (!d) return c.chyba ? 'Cesťáky se nenačetly' : 'Cestovné na venkovní zápasy';
  const s = V.souhrn(d, { tym: platnyTym(d) });
  return pocetZapasu(s.pocet) + ' venku · ' + V.kc(s.celkem);
}

// ---------------------------------------------------------------- události

const vStrance = (el) => !!(el && el.closest && el.closest('#p-cestaky'));
/** Zápas s úpravou podle řádku. */
function zapasZRadku(el) {
  const li = el.closest('[data-ce-id]');
  const d = pohled();
  const z = li && d && (d.zapasy || []).find((x) => x.id === li.dataset.ceId);
  return z ? V.zapasSUpravou(z, (d.upravy || {})[z.id], d.nastaveni) : null;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('[data-ce-filtr], [data-ce-krok], [data-ce-auta-krok], [data-ce-vratit], [data-ce-znovu]');
  if (!vStrance(el)) return;
  if (el.dataset.ceFiltr) {
    c.tym = el.dataset.ceFiltr;
    uloziste.pis(VOLBY, { tym: c.tym });
    zmeneno();
    return;
  }
  if (el.dataset.ceKrok) {
    const z = zapasZRadku(el);
    if (z) zmen({ zapas: { id: z.id, zmeny: { auta: Math.min(20, Math.max(0, z.auta + Number(el.dataset.ceKrok))) } } });
    return;
  }
  if (el.dataset.ceAutaKrok) {
    const d = pohled();
    if (d) zmen({ nastaveni: { auta: Math.min(20, Math.max(0, d.nastaveni.auta + Number(el.dataset.ceAutaKrok))) } });
    return;
  }
  if (el.hasAttribute('data-ce-vratit')) {
    potvrd('Vrátit vše na výchozí?', { text: 'Zruší úpravy všech zápasů (bus, auta, km, cena busu) a sazbu, počet aut i poháry vrátí na výchozí.', ano: 'Vrátit', ton: 'nebezpeci' })
      .then((ano) => { if (ano) zmen({ vratitVse: true }); });
    return;
  }
  if (el.hasAttribute('data-ce-znovu')) { c.chyba = null; nactiCestaky(true); zmeneno(); }
});

const POLE = '[data-ce-sazba], [data-ce-km], [data-ce-buskc]';
const psani = new WeakMap();

/** Hodnota pole do změny; během psaní rozepsané neplatné číslo mlčí, po opuštění pole se vrátí platná hodnota a ukáže proč. */
function zapisPole(el, konec) {
  clearTimeout(psani.get(el));
  psani.delete(el);
  const d = pohled();
  if (!d) return;
  const raw = el.value.trim();
  let p;
  if (el.matches('[data-ce-sazba]')) p = { nastaveni: { sazba: raw } };
  else {
    const z = zapasZRadku(el);
    if (!z) return;
    p = { zapas: { id: z.id, zmeny: el.matches('[data-ce-km]') ? { km: raw } : { busKc: raw === '' ? 0 : raw } } };
  }
  try { V.pouzij(d, p); } catch (chyba) {
    if (konec) { vratPole(el); toast(chyba.message, true); }
    return;
  }
  zmen(p);
}

function vratPole(el) {
  const d = pohled();
  if (!d) return;
  if (el.matches('[data-ce-sazba]')) { el.value = desetinne(d.nastaveni.sazba); return; }
  const z = zapasZRadku(el);
  if (z) el.value = el.matches('[data-ce-km]') ? z.km : (z.busKc || '');
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches || !el.matches(POLE) || !vStrance(el)) return;
  clearTimeout(psani.get(el));
  psani.set(el, setTimeout(() => zapisPole(el, false), ODKLAD_PSANI));
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.matches || !vStrance(el)) return;
  if (el.matches(POLE)) { zapisPole(el, true); return; }
  if (el.matches('[data-ce-pohary]')) { zmen({ nastaveni: { pohary: el.checked } }); return; }
  if (el.matches('[data-ce-bus]')) {
    const z = zapasZRadku(el);
    if (z) zmen({ zapas: { id: z.id, zmeny: { bus: el.checked } } });
  }
});

// Enter v poli = hotovo (change), klávesnice v telefonu se zavře
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches(POLE) && vStrance(e.target)) { e.preventDefault(); e.target.blur(); }
});
