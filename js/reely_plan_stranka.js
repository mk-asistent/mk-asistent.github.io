// Reely → záložky Plán · Zápasy · Nápady (Michal 16. 11.: „plán, seznam zápasů a tok reelů mít v Asistentovi na jednom místě“).
// Data z motoru (akce reelyPlan – REELY/plan.json, zapasy_audit.json, vyroba.json z domácího PC a plan_moje.json s Michalovými změnami),
// čisté funkce v js/reely_plan.js. Modul načte reely.js až na záložce (jako Cesťáky); klepnutí si obsluhuje sám (atributy data-rp-…).
// Plán na široké obrazovce = sloupce podle stavu dílu, na telefonu jeden seznam podle termínu se štítkem stavu a filtrem.

import { volej, jeDemo } from './api.js';
import { zmeneno } from './stav.js';
import { esc, uloziste, prepisSPolem, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, kostra, chybaHtml, segment, okno } from './ui.js';
import * as RP from './reely_plan.js';

const ULOZISTE = 'asistent.data.reelyPlan';
const VOLBY = 'asistent.volby.reelyPlan';
const OBNOVA_PO = 120000;
const ZNOVU_PO_CHYBE = 60000;

const ulozeno = uloziste.cti(ULOZISTE);
const volby = uloziste.cti(VOLBY) || {};
const c = { data: (ulozeno && ulozeno.data) || null, kdy: (ulozeno && ulozeno.kdy) || 0, nacita: false, chyba: null, chybaKdy: 0,
  bezi: 0, filtr: volby.filtr || 'aktivni' };

const posledni = new WeakMap();
function nastav(el, html) {
  if (!el || posledni.get(el) === html) return;
  posledni.set(el, html);
  prepisSPolem(el, html);
}
function uloz() { if (!jeDemo() && c.data) uloziste.pis(ULOZISTE, { data: c.data, kdy: c.kdy }); }

export function nactiPlan(znovu) {
  if (c.nacita) return;
  if (!znovu && c.data && Date.now() - c.kdy < OBNOVA_PO) return;
  if (!znovu && c.chyba && Date.now() - c.chybaKdy < ZNOVU_PO_CHYBE) return;
  c.nacita = true;
  volej('reelyPlan').then((d) => { c.chyba = null; if (!c.bezi) { c.data = d; c.kdy = Date.now(); uloz(); } },
    (e) => { c.chyba = e; c.chybaKdy = Date.now(); }).then(() => { c.nacita = false; zmeneno(); });
}

/** Zápis (reelyPlanUlozit / reelUdelat) – odpověď je celý nový plán. */
function posli(akce, p, hotovo) {
  c.bezi++;
  zmeneno();
  return volej(akce, p).then((d) => {
    c.data = d; c.kdy = Date.now(); uloz();
    if (hotovo) toast(typeof hotovo === 'function' ? hotovo(d) : hotovo);
  }, (e) => toast('Neuložilo se: ' + ((e && e.message) || 'chyba'), true))
    .then(() => { c.bezi--; zmeneno(); });
}

// ---------------------------------------------------------------- zobrazení

const naPc = () => window.matchMedia('(min-width: 1000px) and (pointer: fine)').matches;
const vlna = (id) => ((c.data && c.data.vlny) || []).find((v) => v.id === id);
const dil = (id) => ((c.data && c.data.dily) || []).find((d) => d.id === id);
const TON = { plan: 'seda', nachystano: 'warn', drahy: 'fialova', reel: 'limetka', naplanovano: 'plan', vyveseno: 'ok' };
const TON_IG = { na_ig: 'ok', chybi: 'danger', bez_zaznamu: 'seda', nedavat: 'seda', neznamy: 'seda' };
const stitekStavu = (s) => '<span class="tag tag--' + TON[s] + ' rp-stav">' + RP.NAZVY_STAVU[s] + '</span>';
const tymTag = (t) => (t ? '<span class="tag tag--seda rp-tym">' + esc(RP.NAZVY_TYMU[t] || t) + '</span>' : '');

function bilanceHtml(d) {
  const b = d.bilance;
  const dily = d.dily.filter((x) => !x.zruseno);
  const venku = dily.filter((x) => x.stav === 'vyveseno').length;
  const pol = (n, text, ton) => '<span class="rp-bilance__pol' + (ton ? ' rp-bilance__pol--' + ton : '') + '"><b class="cisla">' + n + '</b>' + text + '</span>';
  return '<div class="rp-bilance" aria-label="Bilance">' + pol(b.zapasu, tvar(b.zapasu, 'zápas', 'zápasy', 'zápasů')) + pol(b.natoceno, 'natočeno') +
    pol(b.naIg, 'na IG', 'ok') + pol(b.chybi, 'chybí', 'chybi') + '<span class="rp-bilance__oddel"></span>' +
    pol(venku + ' / ' + dily.length, 'dílů venku') + '</div>';
}

/** Datum prvního zápasu dílu (pro záložku týdne v editoru drah). */
function datumDilu(d) {
  const z = (d.zapasy || []).map((id) => (c.data.zapasy || []).concat(c.data.mimo || []).find((x) => x.id === id)).filter(Boolean)[0];
  return z ? z.datum : '';
}

function tlacitka(d) {
  const editor = RP.editorOdkaz(c.data.editor, naPc(), d, datumDilu(d));
  const id = esc(d.id);
  return RP.akce(d, !!editor).map((a) => {
    if (a === 'editor') return '<a class="btn btn--ghost btn--sm" href="' + esc(editor) + '" target="_blank" rel="noopener" ' +
      'title="Editor drah běží jen na domácím PC (doma na Wi-Fi i z mobilu)">' + IKONY.odkaz + '<span>Editor drah</span><small class="rp-doma">doma</small></a>';
    if (a === 'drahyHotove') return '<button type="button" class="btn btn--ghost btn--sm" data-rp-drahy="' + id + '">' + IKONY.fajfka + '<span>Dráhy hotové</span></button>';
    if (a === 'udelatReel') return '<button type="button" class="btn btn--plan btn--sm" data-rp-udelat="' + id + '">' + IKONY.reely + '<span>Udělej reel</span></button>';
    if (a === 'cekaNaReel') return '<span class="tag tag--plan rp-ceka">' + IKONY.claude + 'Reel skládá Claude</span>';
    if (a === 'naplanovat') return '<button type="button" class="btn btn--plan btn--sm" data-rp-reel="' + esc(d.reel) + '">' + IKONY.instagram + '<span>Naplánovat</span></button>';
    if (a === 'otevritReel') return d.stav === 'reel' ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-rp-reel="' + esc(d.reel) + '">' + IKONY.prehrat + '<span>Otevřít reel</span></button>';
    if (a === 'hotovo') return '<button type="button" class="btn btn--ghost btn--sm" data-rp-hotovo="' + id + '">' + IKONY.fajfka + '<span>Vyšlo</span></button>';
    if (a === 'posun') return '<button type="button" class="btn btn--ghost btn--sm btn--ikona rp-mala" data-rp-termin="' + id + '" title="Změnit termín" aria-label="Změnit termín">' + IKONY.cas + '</button>';
    if (a === 'poznamka') return '<button type="button" class="btn btn--ghost btn--sm btn--ikona rp-mala" data-rp-poznamka="' + id + '" title="Poznámka" aria-label="Poznámka">' + IKONY.psat + '</button>';
    return '';
  }).join('');
}

function kartaDilu(d, seStavem) {
  const v = vlna(d.vlna);
  const drahy = RP.drahyText(d);
  const posunuto = d.terminPlan !== undefined && d.terminPlan !== d.termin;
  return '<li class="rp-dil rp-dil--' + d.stav + (d.chybaIg ? ' rp-dil--chyba' : '') + '" data-rp-dil="' + esc(d.id) + '">' +
    '<div class="rp-dil__hlava"><b class="rp-dil__kdy cisla">' + esc(RP.denADatum(d.termin)) + (d.termin && d.cas && d.cas !== '17:00' ? ' ' + esc(d.cas) : '') + '</b>' +
      (posunuto ? '<span class="tag tag--warn" title="V plánu ' + esc(RP.denADatum(d.terminPlan)) + '">posunuto</span>' : '') +
      (seStavem ? stitekStavu(d.stav) : '') + '</div>' +
    '<div class="rp-dil__nazev">' + esc(d.nazev) + '</div>' +
    '<div class="rp-dil__meta">' + tymTag(d.tym) + (d.format !== 'reel' ? '<span class="tag tag--seda">' + RP.NAZVY_FORMATU[d.format] + '</span>' : '') +
      (drahy ? '<span class="rp-dil__drahy cisla">' + esc(drahy) + '</span>' : '') +
      (d.vyroba && d.vyroba.deska ? '<span class="rp-dil__drahy">deska</span>' : '') + (d.vyroba && d.vyroba.popisek ? '<span class="rp-dil__drahy">popisek</span>' : '') +
      (v ? '<span class="rp-dil__vlna">' + esc(v.nazev) + '</span>' : '') + '</div>' +
    (d.stav === 'naplanovano' && d.planKdy ? '<div class="rp-dil__info">' + (d.chybaIg ? 'Zveřejnění se nepovedlo – otevři reel' : 'Vyjde ' + esc(new Date(d.planKdy).toLocaleString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }))) + '</div>' : '') +
    (d.stav === 'vyveseno' && d.naIg ? '<div class="rp-dil__info">Na IG ' + esc(RP.denADatum(d.naIg)) + '</div>' : '') +
    (d.poznamkaMoje ? '<div class="rp-dil__pozn">' + esc(d.poznamkaMoje) + '</div>' : '') +
    '<div class="rp-dil__akce">' + tlacitka(d) + '</div></li>';
}

function planHtml(d) {
  const sloupce = RP.sloupce(d.dily);
  // PC: sloupce podle stavu (prázdný sloupec zůstane, ať je vidět tok); telefon: jeden seznam s filtrem
  const pc = '<div class="rp-sloupce">' + sloupce.map((s) => '<section class="rp-sloupec rp-sloupec--' + s.stav + '"><div class="rp-sloupec__hlava">' +
    stitekStavu(s.stav) + '<span class="pocet cisla">' + s.dily.length + '</span></div>' +
    (s.dily.length ? '<ul class="rp-dily">' + s.dily.map((x) => kartaDilu(x, false)).join('') + '</ul>' : '<div class="rp-prazdny">–</div>') + '</section>').join('') + '</div>';
  const filtry = [['aktivni', 'Rozpracované'], ['vse', 'Vše']].concat(RP.STAVY.map((s) => [s, RP.NAZVY_STAVU[s]]))
    .map((x) => x.concat([RP.filtruj(d.dily, { stav: x[0] }).length])).filter((x) => x[2] || x[0] === c.filtr || x[0] === 'aktivni');
  const seznam = RP.serad(RP.filtruj(d.dily, { stav: c.filtr }));
  const mob = '<div class="rp-mobil">' + '<div class="rp-filtr">' + segment(filtry, c.filtr, 'data-rp-filtr', 'Které díly ukázat') + '</div>' +
    (seznam.length ? '<ul class="rp-dily">' + seznam.map((x) => kartaDilu(x, true)).join('') + '</ul>' : '<div class="prazdne">Nic tu není.</div>') + '</div>';
  const lista = '<div class="rp-lista"><button type="button" class="btn btn--ghost btn--sm" data-rp-posun-vlnu>' + IKONY.cas + '<span>Posunout vlnu</span></button>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-rp-novy>' + IKONY.plus + '<span>Nový díl</span></button></div>';
  return lista + pc + mob;
}

function zapasHtml(z, d) {
  const dl = z.dily.map(dil).filter((x) => x && !x.zruseno)[0];
  const odkaz = dl ? '<button type="button" class="odkaz rp-zapas__odkaz" data-rp-na-dil="' + esc(dl.id) + '">' + esc(RP.NAZVY_STAVU[dl.stav]) + ' · ' + esc(RP.denADatum(dl.termin)) + '</button>'
    : z.reel ? '<button type="button" class="odkaz rp-zapas__odkaz" data-rp-reel="' + esc(z.reel) + '">' + IKONY.prehrat + 'Reel</button>' : '';
  const strelci = RP.strelciText(z.strelci);
  return '<li class="rp-zapas">' +
    '<span class="rp-zapas__datum cisla">' + esc(RP.denADatum(z.datum)) + '</span>' +
    '<span class="rp-zapas__tym"><b>' + esc(z.domaci) + ' – ' + esc(z.hoste) + '</b>' + (strelci ? '<small>' + esc(strelci) + '</small>' : z.poznamka ? '<small>' + esc(z.poznamka) + '</small>' : '') + '</span>' +
    '<span class="rp-zapas__skore cisla">' + esc(z.skore || '–') + '</span>' +
    '<span class="rp-zapas__stav"><span class="tag tag--' + TON_IG[z.stavIg] + '">' + esc(RP.stitekZapasu(z)) + '</span>' + odkaz + '</span></li>';
}

function zapasyHtml(d) {
  return '<div class="rp-zapasy">' + RP.zapasySloupce(d.zapasy, d.mimo).map((s) => {
    const naIg = s.zapasy.filter((z) => z.stavIg === 'na_ig').length;
    return '<section class="card rp-zapasy__tym"><div class="card-hlava"><span class="nadpis">' + IKONY.zapas + '<span>' + esc(s.nazev) + '</span></span>' +
      '<span class="vpravo"><span class="napoveda cisla">' + s.zapasy.length + ' · na IG ' + naIg + '</span></span></div>' +
      '<ul class="rp-zapasy__seznam">' + s.zapasy.map((z) => zapasHtml(z, d)).join('') + '</ul></section>';
  }).join('') + '</div>';
}

function napadyHtml(d) {
  return '<div class="rp-lista"><button type="button" class="btn btn--ghost btn--sm" data-rp-napad-novy>' + IKONY.plus + '<span>Vlastní nápad</span></button></div>' +
    (d.napady.length ? '<ul class="rp-napady">' + d.napady.map((n) => '<li class="card rp-napad">' +
      '<b>' + esc(n.nazev) + '</b>' + (n.popis ? '<p>' + esc(n.popis) + '</p>' : '') +
      '<div class="rp-napad__akce">' + (n.vlastni ? '<span class="tag tag--seda">můj</span><button type="button" class="btn btn--ghost btn--sm btn--ikona rp-mala" data-rp-napad-smazat="' +
        esc(n.id) + '" aria-label="Smazat nápad" title="Smazat">' + IKONY.smazat + '</button>' : '') +
      '<button type="button" class="btn btn--ghost btn--sm" data-rp-do-planu="' + esc(n.id) + '">' + IKONY.plus + '<span>Do plánu</span></button></div></li>').join('') + '</ul>'
      : '<div class="prazdne">Zásobník je prázdný.</div>');
}

/** zalozka = 'plan' | 'zapasy' | 'napady', zalozkyHtml = přepínač záložek z reely.js. */
export function vykresli(el, zalozka, zalozkyHtml) {
  nactiPlan(false);
  const d = c.data;
  if (!el.querySelector('#rp-obsah')) {
    posledni.delete(el);
    el.innerHTML = '<div class="rp-stranka"><div class="rp-hlava"><div id="rp-zalozky"></div><div id="rp-bilance"></div></div><div id="rp-obsah"></div><div class="rp-pata" id="rp-pata"></div></div>';
  }
  nastav(el.querySelector('#rp-zalozky'), zalozkyHtml);
  if (!d) {
    nastav(el.querySelector('#rp-bilance'), '');
    nastav(el.querySelector('#rp-obsah'), '<section class="card">' + (c.chyba ? chybaHtml(c.chyba, 'data-rp-znovu') : kostra(5)) + '</section>');
    return;
  }
  nastav(el.querySelector('#rp-bilance'), bilanceHtml(d));
  nastav(el.querySelector('#rp-obsah'), zalozka === 'zapasy' ? zapasyHtml(d) : zalozka === 'napady' ? napadyHtml(d) : planHtml(d));
  nastav(el.querySelector('#rp-pata'), (c.bezi ? '<span class="napoveda">ukládám…</span>' : '') +
    (c.chyba ? '<span class="napoveda">Nepodařilo se obnovit · <button type="button" class="odkaz" data-rp-znovu>Zkusit znovu</button></span>' : '') +
    ((d.chybne || []).length ? '<span class="napoveda">Chyba v datech: ' + esc(d.chybne.join(', ')) + '</span>' : ''));
}

export function podnadpis() {
  const d = c.data;
  if (!d) return 'Plán Instagramu';
  const dnes = new Date(); const iso = dnes.getFullYear() + '-' + String(dnes.getMonth() + 1).padStart(2, '0') + '-' + String(dnes.getDate()).padStart(2, '0');
  const dalsi = RP.serad(RP.filtruj(d.dily, { stav: 'aktivni' })).filter((x) => x.termin && x.termin >= iso)[0];
  return esc(d.nazev) + (dalsi ? ' · další ' + esc(RP.denADatum(dalsi.termin)) + ' ' + esc(dalsi.nazev) : '');
}

// ---------------------------------------------------------------- události

const vStrance = (el) => !!(el && el.closest && el.closest('#p-reely'));
let otevriReel = null; // reely.js předá otevriDetail (bez kruhového importu)
export function nastavOtevreniReelu(fn) { otevriReel = fn; }

async function termin(d) {
  // okno s polem vrací null i při Zrušit → „bez termínu“ / „podle plánu“ jsou volby
  const volbyT = d.vlastni ? (d.termin ? [['bez', 'Bez termínu']] : []) : d.terminPlan !== undefined ? [['plan', 'Podle plánu (' + RP.denADatum(d.terminPlan) + ')']] : [];
  const t = await okno({ ikona: IKONY.cas, nadpis: 'Termín dílu', text: d.nazev, volby: volbyT.length ? volbyT : undefined,
    pole: { popisek: 'Datum', hodnota: d.termin || '', typ: 'date' }, ano: 'Uložit' });
  if (!t || t === true) return;
  posli('reelyPlanUlozit', { dil: { id: d.id, zmeny: { termin: t === 'bez' || t === 'plan' ? null : t } } }, 'Termín uložený');
}

async function poznamka(d) {
  const t = await okno({ ikona: IKONY.psat, nadpis: 'Poznámka k dílu', text: d.nazev, volby: d.poznamkaMoje ? [['smazat', 'Smazat poznámku']] : undefined,
    pole: { popisek: 'Poznámka', hodnota: d.poznamkaMoje || '', radku: 3 }, ano: 'Uložit' });
  if (!t || t === true) return;
  posli('reelyPlanUlozit', { dil: { id: d.id, zmeny: { poznamka: t === 'smazat' ? null : t } } });
}

async function posunVlnu() {
  const vlny = c.data.vlny.filter((v) => c.data.dily.some((x) => x.vlna === v.id && x.termin && !x.zruseno && x.stav !== 'vyveseno' && x.stav !== 'naplanovano'));
  if (!vlny.length) { toast('Není co posunout'); return; }
  const v = await okno({ ikona: IKONY.cas, nadpis: 'Posunout vlnu', text: 'Naplánované a vyvěšené díly zůstanou.', volby: vlny.map((x) => [x.id, x.nazev]) });
  if (!v || v === true) return;
  const dni = await okno({ ikona: IKONY.cas, nadpis: 'O kolik?', text: vlna(v).nazev, volby: [['-7', '− týden'], ['7', '+ týden'], ['14', '+ 2 týdny']] });
  if (!dni || dni === true) return;
  posli('reelyPlanUlozit', { posun: { vlna: v, dni: Number(dni) } }, 'Vlna posunutá');
}

async function novyDil(napad) {
  const nazev = napad ? napad.nazev : await okno({ ikona: IKONY.plus, nadpis: 'Nový díl', pole: { popisek: 'Název', placeholder: 'Co to bude' }, ano: 'Dál' });
  if (!nazev || nazev === true) return;
  const t = await okno({ ikona: IKONY.cas, nadpis: napad ? 'Do plánu' : 'Termín', text: nazev, volby: [['bez', 'Bez termínu']],
    pole: { popisek: 'Datum', typ: 'date' }, ano: 'Přidat' });
  if (!t || t === true) return;
  posli('reelyPlanUlozit', { novy: Object.assign({ nazev, termin: t === 'bez' ? null : t }, napad ? { napad: napad.id } : {}) }, 'Díl je v plánu');
}

async function novyNapad() {
  const nazev = await okno({ ikona: IKONY.plus, nadpis: 'Vlastní nápad', pole: { popisek: 'Název', placeholder: 'Krátce' }, ano: 'Dál' });
  if (!nazev || nazev === true) return;
  const popis = await okno({ ikona: IKONY.psat, nadpis: nazev, pole: { popisek: 'Popis (nepovinné)', radku: 3 }, ano: 'Uložit' });
  if (popis === true) return;
  posli('reelyPlanUlozit', { napad: { nazev, popis: popis || '' } }, 'Nápad uložený');
}

document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('[data-rp-filtr], [data-rp-drahy], [data-rp-udelat], [data-rp-reel], [data-rp-hotovo], [data-rp-termin], ' +
    '[data-rp-poznamka], [data-rp-posun-vlnu], [data-rp-novy], [data-rp-na-dil], [data-rp-napad-novy], [data-rp-napad-smazat], [data-rp-do-planu], [data-rp-znovu]');
  if (!vStrance(el) || !c.data) return;
  const ds = el.dataset;
  if (ds.rpFiltr) { c.filtr = ds.rpFiltr; uloziste.pis(VOLBY, { filtr: c.filtr }); zmeneno(); return; }
  if (ds.rpDrahy) { posli('reelyPlanUlozit', { dil: { id: ds.rpDrahy, zmeny: { drahyHotove: true } } }); return; }
  if (ds.rpUdelat) { posli('reelUdelat', { dil: ds.rpUdelat }, (d) => (d.zalozeno ? 'Claude reel složí na domácím PC' : 'O reel už je požádáno')); return; }
  if (ds.rpReel) { if (otevriReel) otevriReel(ds.rpReel); return; }
  if (ds.rpHotovo) { posli('reelyPlanUlozit', { dil: { id: ds.rpHotovo, zmeny: { hotovo: true } } }, 'Označeno jako vyšlé'); return; }
  if (ds.rpTermin) { const d = dil(ds.rpTermin); if (d) termin(d); return; }
  if (ds.rpPoznamka) { const d = dil(ds.rpPoznamka); if (d) poznamka(d); return; }
  if (el.hasAttribute('data-rp-posun-vlnu')) { posunVlnu(); return; }
  if (el.hasAttribute('data-rp-novy')) { novyDil(null); return; }
  if (ds.rpNaDil) { const d = dil(ds.rpNaDil); if (d) termin(d); return; }
  if (el.hasAttribute('data-rp-napad-novy')) { novyNapad(); return; }
  if (ds.rpNapadSmazat) { posli('reelyPlanUlozit', { napad: { id: ds.rpNapadSmazat, smazat: true } }, 'Nápad smazaný'); return; }
  if (ds.rpDoPlanu) { const n = c.data.napady.find((x) => x.id === ds.rpDoPlanu); if (n) novyDil(n); return; }
  if (el.hasAttribute('data-rp-znovu')) { c.chyba = null; nactiPlan(true); zmeneno(); }
});
