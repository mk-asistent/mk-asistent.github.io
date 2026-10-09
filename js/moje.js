// Moje poznámky – co si Michal zapíše sám pro sebe na později (zkratka „Pro mě“ v iPhonu, aplikace). Claude je
// nezpracovává; leží v CLAUDE_SCHRANKA/MOJE a motor je posílá v akci schranka (pole moje: [{ id, text, kdy, odkud }]).
// Michal 9. 10.: „okno, kdy si udělám přes zkratku poznámku sám pro sebe na později … to by se mělo zobrazit na té
// hlavní stránce pro mě“. Karta na Dnes (#dl-moje skládá vykresliDnes v app.js z mojeKartaHtml) a vpravo na stránce
// Schránka (hooky.mojeKarta). Hotovo → MOJE/HOTOVO, Smazat → koš na Disku; obojí jde hned vrátit v oznámení.
// Pravé tlačítko / dlouhé podržení / ⋯ = nabídka (js/nabidka.js): Hotovo, Předat Claudovi, Kopírovat, Smazat.

import { stav, zmeneno, umiMotor, hooky, prejdi } from './stav.js';
import { volej } from './api.js';
import { esc, kdyKratce, prvniRadek, sOdkazy } from './pomocne.js';
import { toast, toastAkce, okno, hlavickaKarty } from './ui.js';
import { IKONY } from './ikony.js';
import { otevri as otevriNabidku } from './nabidka.js';
import { nactiSchranku, ulozMistne } from './schranka.js';

/** Ikona Mých poznámek: lístek s ohnutým rohem (stejný tah jako js/ikony.js). */
export const IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M5.5 4h13A1.5 1.5 0 0 1 20 5.5V14l-6 6H5.5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z"/><path d="M20 14h-4.5a1.5 1.5 0 0 0-1.5 1.5V20"/><path d="M8 8.5h8M8 12h5"/></svg>';

const MYS = window.matchMedia('(hover: hover) and (pointer: fine)'); // klávesnice a myš (PC) – nápověda Ctrl+Enter
const NA_DNES = 5;          // na Dnes nejnovějších pět, zbytek ve Schránce
const NA_STRANCE = 12;      // ve Schránce dvanáct, pak „Ukázat všech“
let rozepsano = '';         // text v poli rychlého přidání – karta se překresluje, text (i kurzor) se vrátí
let ukladam = false;
let vseNaStrance = false;
const rozbalene = {};       // id → celý text

/** Motor Moje poznámky umí (starší motor kartu schová). */
export function umiMoje() { return umiMotor('mojePridat'); }

/** Aktivní moje poznámky (nejnovější nahoře) – ze schránky v zařízení / z motoru. */
export function mojePoznamky() {
  return stav.schranka && Array.isArray(stav.schranka.moje) ? stav.schranka.moje : [];
}

function najdi(id) { return mojePoznamky().find((p) => p.id === id) || null; }

// ---------------------------------------------------------------- karta

/** Karta „Moje poznámky“ na Dnes – prázdný řetězec = karta se schová (motor je ještě neumí, schránka se načítá). */
export function mojeKartaHtml() {
  if (!umiMoje() || !stav.schranka) return '';
  // Dnes překresluje kartu celou – když se zrovna píše do pole, vrátit do nového pole fokus a kurzor
  const a = document.activeElement;
  if (a && a.matches && a.matches('[data-moje-pole]') && a.closest('#p-dnes')) {
    const z = a.selectionStart, k = a.selectionEnd;
    queueMicrotask(() => {
      const n = document.querySelector('#p-dnes [data-moje-pole]');
      if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { n.setSelectionRange(z, k); } catch (e) { /* nic */ } }
    });
  }
  return hlavaHtml(false) + poleHtml() + '<div class="dlazdice__telo" data-moje-telo>' + teloHtml(false) + '</div>';
}

/** Dnes (#dl-moje): když se do pole zrovna píše, překreslí jen hlavičku a seznam – pole, rozepsaný text i klávesnice
 *  v iPhonu zůstanou; jinak celou kartu. Vrací false, když se má karta schovat (motor Moje poznámky neumí, schránka se načítá). */
export function vykresliMojeDnes(el) {
  if (!umiMoje() || !stav.schranka) { el.innerHTML = ''; return false; }
  const pole = el.querySelector('[data-moje-pole]');
  if (pole && pole === document.activeElement && el.querySelector('[data-moje-telo]')) {
    el.querySelector('.card-hlava').outerHTML = hlavaHtml(false);
    el.querySelector('[data-moje-telo]').innerHTML = teloHtml(false);
    return true;
  }
  el.innerHTML = mojeKartaHtml();
  return true;
}

/** Karta vpravo na stránce Schránka: když se píše do pole, překreslí jen hlavičku a seznam (pole zůstane). */
function vykresliMojeDo(el) {
  const pole = el.querySelector('[data-moje-pole]');
  if (pole && pole === document.activeElement && el.querySelector('[data-moje-telo]')) {
    el.querySelector('.card-hlava').outerHTML = hlavaHtml(true);
    el.querySelector('[data-moje-telo]').innerHTML = teloHtml(true);
    return;
  }
  el.innerHTML = hlavaHtml(true) + poleHtml() + '<div class="dlazdice__telo" data-moje-telo>' + teloHtml(true) + '</div>';
}
hooky.mojeKarta = vykresliMojeDo;

function hlavaHtml(naStrance) {
  const n = mojePoznamky().length;
  return hlavickaKarty(IKONA, 'Moje poznámky' + (n ? ' · ' + n : ''), naStrance ? '' :
    '<button type="button" class="sipka" data-moje-ukaz aria-label="Moje poznámky ve Schránce" title="Ve Schránce">' + IKONY.sipka + '</button>');
}

/** Z Dnes na kartu Moje poznámky ve Schránce (na telefonu je pod seznamem – dojet k ní). */
function ukazNaStrance(vse) {
  if (vse) vseNaStrance = true;
  prejdi('schranka');
  zmeneno();
  setTimeout(() => {
    const karta = document.querySelector('#sb-moje');
    if (karta && !karta.hidden) karta.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 60);
}

function poleHtml() {
  return '<div class="moje-pridat"><input class="field" data-moje-pole maxlength="2000" enterkeyhint="done" autocomplete="off" ' +
    'placeholder="Poznámka pro sebe…" aria-label="Nová moje poznámka" value="' + esc(rozepsano) + '">' +
    '<button type="button" class="btn btn--ikona btn--plna" data-moje-pridat aria-label="Přidat poznámku" title="Přidat (Enter)"' +
    (rozepsano.trim() && !ukladam ? '' : ' disabled') + '>' + IKONY.plus + '</button></div>';
}

function teloHtml(naStrance) {
  const vse = mojePoznamky();
  if (!vse.length) {
    return '<p class="moje-prazdne">Co si sem zapíšeš (nebo nadiktuješ v iPhonu zkratkou „Pro mě“), zůstane jen pro tebe – Claude to nečte.</p>';
  }
  const max = naStrance ? (vseNaStrance ? vse.length : NA_STRANCE) : NA_DNES;
  const zbyva = vse.length - Math.min(max, vse.length);
  return '<ul class="seznam moje-seznam">' + vse.slice(0, max).map(polozkaHtml).join('') + '</ul>' +
    (!zbyva ? '' : naStrance ? '<button type="button" class="agenda__vic" data-moje-vse>Ukázat všech ' + vse.length + '</button>'
      : '<button type="button" class="agenda__vic" data-moje-ukaz="vse">+ ' + zbyva + ' ' + (zbyva === 1 ? 'další' : 'dalších') + ' ve Schránce</button>');
}

function polozkaHtml(p) {
  const cely = !!rozbalene[p.id];
  const kdy = esc(kdyKratce(p.kdy));
  return '<li class="moje-polozka" data-moje-id="' + esc(p.id) + '">' +
    '<button type="button" class="moje-hotovo" data-moje-hotovo="' + esc(p.id) + '" aria-label="Hotovo: ' + esc(prvniRadek(p.text, 60)) + '" title="Hotovo">' + IKONY.fajfka + '</button>' +
    (cely
      // rozbalená: celý text s klikacími odkazy, pod ním kdy a odkud + Sbalit
      ? '<div class="moje-obsah"><div class="moje-text moje-text--cely">' + sOdkazy(p.text) + '</div>' +
        '<button type="button" class="moje-kdy" data-moje-prepni="' + esc(p.id) + '" aria-expanded="true">' + kdy + (p.odkud ? ' · ' + esc(p.odkud) : '') + ' · Sbalit</button></div>'
      : '<button type="button" class="moje-obsah" data-moje-prepni="' + esc(p.id) + '" aria-expanded="false"><span class="moje-text orez-2">' + esc(p.text) + '</span>' +
        '<span class="moje-kdy cisla">' + kdy + '</span></button>') +
    '<button type="button" class="moje-vic" data-moje-nabidka="' + esc(p.id) + '" aria-label="Další akce" title="Další akce (i pravé tlačítko)">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor"/></svg></button>' +
    '</li>';
}

// ---------------------------------------------------------------- akce

/** Přidá poznámku (pole na kartě, okno z „+“). Vrací true, když se uložila. */
async function pridej(text) {
  text = String(text || '').trim();
  if (!text || ukladam) return false;
  ukladam = true;
  document.querySelectorAll('[data-moje-pridat]').forEach((b) => { b.disabled = true; });
  try {
    const p = await volej('mojePridat', { text });
    if (stav.schranka) {
      stav.schranka.moje = [p].concat(mojePoznamky().filter((x) => x.id !== p.id));
      ulozMistne();
    }
    if (rozepsano.trim() === text) {
      rozepsano = '';
      document.querySelectorAll('[data-moje-pole]').forEach((x) => { x.value = ''; });
    }
    toast('Uloženo do Mých poznámek');
    return true;
  } catch (e) {
    toast('Neuloženo – ' + e.message, true);
    return false;
  } finally {
    ukladam = false;
    zmeneno();
  }
}

/** „+“ → Moje poznámka: okno s polem (víc řádků, Ctrl+Enter uloží). */
export async function otevriPridani() {
  const text = await okno({ ikona: IKONA, nadpis: 'Moje poznámka', text: 'Jen pro tebe, na později – Claude ji nečte. Uvidíš ji na Dnes.',
    pole: { popisek: 'Poznámka', radku: 3, placeholder: 'Co si chceš zapamatovat…' + (MYS.matches ? ' (Ctrl+Enter uloží)' : '') }, ano: 'Uložit' });
  // neuložená (bez sítě) se neztratí – zůstane rozepsaná v poli karty
  if (text && !(await pridej(text)) && !rozepsano.trim()) { rozepsano = text.replace(/\s+/g, ' '); zmeneno(); }
}

/** Vyjme poznámku ze seznamu v zařízení (hned zmizí) – vrací, kam ji případně vrátit. */
function vyjmi(id) {
  const seznam = mojePoznamky();
  const i = seznam.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const p = seznam[i];
  stav.schranka.moje = seznam.filter((x) => x.id !== id);
  delete rozbalene[id];
  zmeneno();
  return { p, i };
}

function vrat(kde) {
  if (!kde || !stav.schranka || najdi(kde.p.id)) return;
  const seznam = mojePoznamky().slice();
  seznam.splice(Math.min(kde.i, seznam.length), 0, kde.p);
  stav.schranka.moje = seznam;
  zmeneno();
}

/** Hotovo / Smazat: hned pryč z obrazovky (bez dotazu), motor na pozadí, v oznámení Vrátit. */
function odeber(id, jak) {
  const kde = vyjmi(id);
  if (!kde) return;
  const hotovo = jak === 'hotovo';
  const akce = volej(hotovo ? 'mojeHotovo' : 'mojeSmazat', { id })
    .then(() => { ulozMistne(); return true; })
    .catch((e) => { vrat(kde); toast((hotovo ? 'Nepovedlo se – ' : 'Nesmazáno – ') + e.message, true); return false; });
  toastAkce(hotovo ? 'Hotovo' : 'Smazáno', 'Vrátit', () => {
    vrat(kde);
    akce.then((probehlo) => probehlo && volej(hotovo ? 'mojeHotovo' : 'schrankaObnovit', hotovo ? { id, zpet: true } : { id })
      .then(() => { ulozMistne(); toast('Vráceno'); }))
      .catch((e) => { toast('Nevráceno – ' + e.message, true); nactiSchranku(); });
  });
}

/** Moje poznámka se má přece jen vyřídit s Claudem: nová poznámka do schránky (NOVE) a tahle do hotových. */
async function predatClaudovi(id) {
  const p = najdi(id);
  if (!p) return;
  try {
    const nova = await volej('poznamka', { text: p.text });
    if (stav.schranka && nova) stav.schranka.nove.unshift(nova);
    vyjmi(id);
    await volej('mojeHotovo', { id });
    ulozMistne();
    toast('Předáno Claudovi – zpracuje při další schránce');
  } catch (e) {
    toast(e.message, true);
    nactiSchranku();
  }
}

function kopirovat(p) {
  const hotovo = () => toast('Text zkopírovaný');
  const chyba = () => toast('Kopírování nejde – označ text ručně', true);
  try { navigator.clipboard.writeText(p.text).then(hotovo, chyba); } catch (e) { chyba(); }
}

// ---------------------------------------------------------------- nabídka (pravé tlačítko, dlouhé podržení, ⋯)

/** Nabídka pro moji poznámku, na kterou se kliklo (js/nabidka.js), nebo null. */
export function nabidkaMoje(cil) {
  const li = cil && cil.closest && cil.closest('[data-moje-id]');
  const p = li && najdi(li.dataset.mojeId);
  if (!p) return null;
  return { nadpis: prvniRadek(p.text, 60), polozky: [
    { ikona: IKONY.fajfka, text: 'Hotovo', fn: () => odeber(p.id, 'hotovo') },
    { ikona: IKONY.claude, text: 'Předat Claudovi', fn: () => predatClaudovi(p.id) },
    { ikona: IKONY.kopirovat, text: 'Kopírovat text', fn: () => kopirovat(p) },
    { ikona: IKONY.smazat, text: 'Smazat', nebezpeci: true, fn: () => odeber(p.id, 'smazat') }
  ] };
}

// ---------------------------------------------------------------- ovládání (app.js)

export function klikMoje(el) {
  if (el.hasAttribute('data-moje-pridat')) {
    const pole = el.parentNode.querySelector('[data-moje-pole]');
    pridej(pole ? pole.value : rozepsano);
    return true;
  }
  if (el.dataset.mojeHotovo) { odeber(el.dataset.mojeHotovo, 'hotovo'); return true; }
  if (el.dataset.mojePrepni) {
    const id = el.dataset.mojePrepni;
    if (rozbalene[id]) delete rozbalene[id]; else rozbalene[id] = true;
    zmeneno();
    return true;
  }
  if (el.dataset.mojeNabidka) {
    const n = nabidkaMoje(el);
    const r = el.getBoundingClientRect();
    if (n) otevriNabidku(r.right - 4, r.bottom + 4, n, el);
    return true;
  }
  if (el.hasAttribute('data-moje-vse')) { vseNaStrance = true; zmeneno(); return true; }
  if (el.hasAttribute('data-moje-ukaz')) { ukazNaStrance(el.dataset.mojeUkaz === 'vse'); return true; }
  return false;
}

export function vstupMoje(e) {
  const t = e.target;
  if (!t.matches || !t.matches('[data-moje-pole]')) return false;
  rozepsano = t.value;
  const b = t.parentNode.querySelector('[data-moje-pridat]');
  if (b) b.disabled = !t.value.trim() || ukladam;
  return true;
}

/** Enter v poli = Přidat. */
export function klavesaMoje(e) {
  if (e.key !== 'Enter' || e.isComposing || !e.target.matches || !e.target.matches('[data-moje-pole]')) return false;
  e.preventDefault();
  pridej(e.target.value);
  return true;
}
