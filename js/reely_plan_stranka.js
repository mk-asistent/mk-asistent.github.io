// Reely → záložky Plán · Zápasy · Nápady (Michal 16. 11.: „plán, seznam zápasů a tok reelů mít v Asistentovi na jednom místě“).
// Data z motoru (akce reelyPlan – REELY/plan.json, zapasy_audit.json, vyroba.json z domácího PC a plan_moje.json s Michalovými změnami),
// čisté funkce v js/reely_plan.js. Modul načte reely.js až na záložce (jako Cesťáky); klepnutí si obsluhuje sám (atributy data-rp-…).
// Od 16. 11. večer: pravé tlačítko / podržení na kartě dílu = nabídka (termín, vlna, poznámka, vyšlo, zrušit…), karta jde na PC přetáhnout
// do jiné vlny a každá změna se na kartě ukáže hned („ukládám…“ → „uloženo ✓“, chyba = vrácení a hláška).
// Plán na široké obrazovce = Po vlnách (výchozí, sloupec = vlna) nebo Podle stavu, nad tím řádek Na řadě; na telefonu jeden seznam podle termínu se štítkem stavu a filtrem.

import { volej, jeDemo } from './api.js';
import { zmeneno, umiMotor } from './stav.js';
import { esc, uloziste, prepisSPolem, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, kostra, chybaHtml, segment, okno } from './ui.js';
import { pripoj as pripojNabidku } from './nabidka.js';
import * as RP from './reely_plan.js';

const ULOZISTE = 'asistent.data.reelyPlan';
const VOLBY = 'asistent.volby.reelyPlan';
const OBNOVA_PO = 120000;
const ZNOVU_PO_CHYBE = 60000;

const ulozeno = uloziste.cti(ULOZISTE);
const volby = uloziste.cti(VOLBY) || {};
const c = { data: (ulozeno && ulozeno.data) || null, kdy: (ulozeno && ulozeno.kdy) || 0, nacita: false, chyba: null, chybaKdy: 0,
  bezi: 0, filtr: volby.filtr || 'aktivni', pohled: volby.pohled === 'stav' ? 'stav' : 'vlny', vlnaMob: volby.vlna || 'vse' };
const ulozVolby = () => uloziste.pis(VOLBY, { filtr: c.filtr, pohled: c.pohled, vlna: c.vlnaMob });

const ulozeni = {}; // id dílu → 'uklada' | 'ulozeno' | 'chyba' (stav na kartě)
const casovaceUlozeni = {};
const TAHNUTI = window.matchMedia('(hover: hover) and (pointer: fine)');

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

function oznacUlozeni(ids, stav) {
  ids.forEach((id) => {
    clearTimeout(casovaceUlozeni[id]);
    if (stav) ulozeni[id] = stav; else delete ulozeni[id];
    if (stav === 'ulozeno' || stav === 'chyba') casovaceUlozeni[id] = setTimeout(() => { delete ulozeni[id]; zmeneno(); }, stav === 'chyba' ? 6000 : 2500);
  });
}

/** Zápis (reelyPlanUlozit / reelUdelat) – odpověď je celý nový plán.
 *  ids = díly, kterých se změna týká (karta ukáže „ukládám…“ / „uloženo ✓“), lokalne(díl) = změna hned v aplikaci, než odpoví motor. */
function posli(akce, p, hotovo, ids, lokalne) {
  ids = ids || [];
  const zaloha = c.data;
  if (lokalne && c.data) {
    c.data = Object.assign({}, c.data, { dily: c.data.dily.map((x) => (ids.indexOf(x.id) >= 0 ? lokalne(Object.assign({}, x)) || x : x)) });
  }
  c.bezi++;
  oznacUlozeni(ids, 'uklada');
  zmeneno();
  return volej(akce, p).then((d) => {
    c.data = d; c.kdy = Date.now(); uloz();
    oznacUlozeni(ids, 'ulozeno');
    const text = hotovo ? (typeof hotovo === 'function' ? hotovo(d) : hotovo) : 'Uloženo';
    if (text && typeof text === 'object') toastAkce(text.text, text.akce, text.fn); else toast(text);
  }, (e) => {
    if (lokalne) c.data = zaloha; // změna se nepovedla → karta zpátky, jak byla
    oznacUlozeni(ids, 'chyba');
    toast('Neuložilo se: ' + ((e && e.message) || 'chyba'), true);
  }).then(() => { c.bezi--; zmeneno(); });
}

/** Změna jednoho dílu (zmeny jako v akci reelyPlanUlozit) s okamžitým zobrazením. */
function zmenDil(d, zmeny, hotovo) {
  return posli('reelyPlanUlozit', { dil: { id: d.id, zmeny } }, hotovo, [d.id], (x) => {
    Object.keys(zmeny).forEach((k) => {
      const v = zmeny[k];
      if (k === 'termin') { if (x.terminPlan === undefined) x.terminPlan = x.termin; x.termin = v === null ? (x.vlastni ? null : x.terminPlan) : v; }
      else if (k === 'vlna') { if (x.vlnaPlan === undefined) x.vlnaPlan = x.vlna; x.vlna = v || x.vlnaPlan; }
      else if (k === 'poznamka') { if (v) x.poznamkaMoje = v; else delete x.poznamkaMoje; }
      else if (k === 'hotovo' && v) x.stav = 'vyveseno';
      else if (k === 'drahyHotove' && v && x.stav === 'nachystano') x.stav = 'drahy';
      else if (k === 'zruseno') x.zruseno = !!v;
    });
    return x;
  });
}

// ---------------------------------------------------------------- zobrazení

const naPc = () => window.matchMedia('(min-width: 1000px) and (pointer: fine)').matches;
const vlna = (id) => ((c.data && c.data.vlny) || []).find((v) => v.id === id);
const dil = (id) => ((c.data && c.data.dily) || []).find((d) => d.id === id);
const TON = { plan: 'seda', nachystano: 'warn', drahy: 'fialova', reel: 'limetka', naplanovano: 'plan', vyveseno: 'ok' };
const TON_IG = { na_ig: 'ok', chybi: 'danger', bez_zaznamu: 'seda', nedavat: 'seda', neznamy: 'seda' };
const stitekStavu = (s) => '<span class="tag tag--' + TON[s] + ' rp-stav">' + RP.NAZVY_STAVU[s] + '</span>';
const tymTag = (t) => (t ? '<span class="tag tag--seda rp-tym" data-tym="' + esc(t) + '">' + esc(RP.NAZVY_TYMU[t] || t) + '</span>' : '');

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
  return RP.akce(d, !!editor, umiMotor('reelKlipy')).map((a, i) => {
    if (a === 'upravitDrahy') return '<button type="button" class="btn ' + (i ? 'btn--ghost' : 'btn--plan') + ' btn--sm" data-rp-drahy-web="' + id + '">' +
      IKONY.psat + '<span>Upravit dráhy</span></button>';
    if (a === 'editorPc') return '<a class="odkaz rp-editor-pc" href="' + esc(editor) + '" target="_blank" rel="noopener" ' +
      'title="Místní editor drah – běží jen na domácím PC (doma na Wi-Fi i z mobilu)">editor na PC</a>';
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

/** Hlavní tlačítko podle stavu (řádek Na řadě) – první z akcí dílu kromě termínu a poznámky. */
function hlavniTlacitko(d) {
  const h = document.createElement('div');
  h.innerHTML = tlacitka(d);
  const b = Array.from(h.children).find((x) => !x.matches('[data-rp-termin], [data-rp-poznamka]'));
  return b ? b.outerHTML : '';
}

function kartaDilu(d, seStavem) {
  const v = vlna(d.vlna);
  const drahy = RP.drahyText(d);
  const posunuto = d.terminPlan !== undefined && d.terminPlan !== d.termin;
  const presunuto = d.vlnaPlan !== undefined && d.vlnaPlan !== d.vlna && vlna(d.vlnaPlan);
  const ul = ulozeni[d.id];
  const stavUlozeni = ul === 'uklada' ? '<span class="rp-dil__ulozeni" role="status"><span class="rp-tocka"></span>ukládám…</span>'
    : ul === 'ulozeno' ? '<span class="rp-dil__ulozeni rp-dil__ulozeni--ok" role="status">' + IKONY.fajfka + 'uloženo</span>'
      : ul === 'chyba' ? '<span class="rp-dil__ulozeni rp-dil__ulozeni--chyba" role="status">neuloženo</span>' : '';
  const tah = TAHNUTI.matches && c.pohled === 'vlny' ? ' draggable="true"' : '';
  return '<li class="rp-dil rp-dil--' + d.stav + (d.chybaIg ? ' rp-dil--chyba' : '') + (ul ? ' rp-dil--ul-' + ul : '') + '" data-rp-dil="' + esc(d.id) + '"' +
    (d.tym ? ' data-tym="' + esc(d.tym) + '"' : '') + tah + ' title="Pravé tlačítko = úpravy' + (tah ? ', přetažením do jiné vlny' : '') + '">' +
    '<div class="rp-dil__hlava"><b class="rp-dil__kdy cisla">' + esc(RP.denADatum(d.termin)) + (d.termin && d.cas && d.cas !== '17:00' ? ' ' + esc(d.cas) : '') + '</b>' +
      (posunuto ? '<span class="tag tag--warn" title="V plánu ' + esc(RP.denADatum(d.terminPlan)) + '">posunuto</span>' : '') +
      (presunuto ? '<span class="tag tag--warn" title="V plánu ' + esc(presunuto.nazev) + '">přesunuto</span>' : '') +
      stavUlozeni + (seStavem ? stitekStavu(d.stav) : '') + '</div>' +
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

/** PC Po vlnách (výchozí): sloupec = vlna (auto-fit ≥ 300 px), stav jako štítek na kartě, vyvěšené ztlumené. */
function poVlnachHtml(d) {
  return '<div class="rp-vlny">' + RP.vlnySloupce(d.dily, d.vlny).map((s) => '<section class="rp-vlna"' + (s.id ? ' data-rp-cil-vlna="' + esc(s.id) + '"' : '') + '><div class="rp-vlna__hlava">' +
    '<b>' + esc(s.nazev) + '</b><span class="rp-vlna__info cisla">' + esc(RP.rozsah(s.od, s.do)) + ' · venku ' + s.venku + ' / ' + s.celkem + '</span></div>' +
    '<ul class="rp-dily">' + s.dily.map((x) => kartaDilu(x, true)).join('') + '</ul></section>').join('') + '</div>';
}

/** PC Podle stavu: prázdné sloupce úzké (jen hlavička s nulou), plné se dělí o místo podle počtu dílů a karty v nich jdou do mřížky. */
function podleStavuHtml(d) {
  const sloupce = RP.sloupce(d.dily);
  const sablona = sloupce.map((s) => (s.dily.length ? 'minmax(260px, ' + Math.min(4, Math.ceil(s.dily.length / 3)) + 'fr)' : '132px')).join(' ');
  return '<div class="rp-sloupce" style="--rp-sablona: ' + sablona + '">' + sloupce.map((s) => '<section class="rp-sloupec rp-sloupec--' + s.stav +
    (s.dily.length ? '' : ' rp-sloupec--prazdny') + '"><div class="rp-sloupec__hlava">' + stitekStavu(s.stav) + '<span class="pocet cisla">' + s.dily.length + '</span></div>' +
    (s.dily.length ? '<ul class="rp-dily">' + s.dily.map((x) => kartaDilu(x, false)).join('') + '</ul>' : '') + '</section>').join('') + '</div>';
}

function naRadeHtml(d) {
  const x = RP.naRade(d.dily);
  if (!x) return '';
  return '<div class="rp-narade" data-rp-dil="' + esc(x.id) + '"><span class="rp-narade__label">Na řadě</span><b class="cisla">' + esc(RP.denADatum(x.termin)) + '</b>' +
    '<span class="rp-narade__nazev">' + esc(x.nazev) + '</span>' + stitekStavu(x.stav) + '<span class="rp-narade__akce">' + hlavniTlacitko(x) + '</span></div>';
}

function planHtml(d) {
  // PC: Po vlnách / Podle stavu (volba se pamatuje); telefon: jeden seznam podle termínu s filtrem stavu a vlny
  const pc = '<div class="rp-pc">' + naRadeHtml(d) + (c.pohled === 'stav' ? podleStavuHtml(d) : poVlnachHtml(d)) + '</div>';
  const filtry = [['aktivni', 'Rozpracované'], ['vse', 'Vše']].concat(RP.STAVY.map((s) => [s, RP.NAZVY_STAVU[s]]))
    .map((x) => x.concat([RP.filtruj(d.dily, { stav: x[0] }).length])).filter((x) => x[2] || x[0] === c.filtr || x[0] === 'aktivni');
  const vlnaMob = c.vlnaMob === 'vse' || d.vlny.some((v) => v.id === c.vlnaMob) ? c.vlnaMob : 'vse';
  const seznam = RP.serad(RP.filtruj(d.dily, { stav: c.filtr, vlna: vlnaMob }));
  const mob = '<div class="rp-mobil">' + '<div class="rp-filtr">' + segment(filtry, c.filtr, 'data-rp-filtr', 'Které díly ukázat') +
    segment([['vse', 'Všechny vlny']].concat(d.vlny.map((v) => [v.id, v.nazev.split(' · ')[0]])), vlnaMob, 'data-rp-vlna', 'Vlna') + '</div>' +
    (seznam.length ? '<ul class="rp-dily">' + seznam.map((x) => kartaDilu(x, true)).join('') + '</ul>' : '<div class="prazdne">Nic tu není.</div>') + '</div>';
  const lista = '<div class="rp-lista"><span class="rp-pohled">' + segment([['vlny', 'Po vlnách'], ['stav', 'Podle stavu']], c.pohled, 'data-rp-pohled', 'Pohled plánu') + '</span>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-rp-posun-vlnu>' + IKONY.cas + '<span>Posunout vlnu</span></button>' +
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
    '<span class="rp-zapas__stav"><span class="tag tag--' + TON_IG[z.stavIg] + '" data-ig="' + esc(z.stavIg) + '">' + esc(RP.stitekZapasu(z)) + '</span>' + odkaz + '</span></li>';
}

function zapasyHtml(d) {
  return '<div class="rp-zapasy">' + RP.zapasySloupce(d.zapasy, d.mimo).map((s) => {
    const naIg = s.zapasy.filter((z) => z.stavIg === 'na_ig').length;
    return '<section class="card rp-zapasy__tym" data-tym="' + esc(s.tym) + '"><div class="card-hlava"><span class="nadpis">' + IKONY.zapas + '<span>' + esc(s.nazev) + '</span></span>' +
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
  nastav(el.querySelector('#rp-pata'), (c.bezi ? '<span class="napoveda rp-pata__uklada"><span class="rp-tocka"></span>ukládám změny…</span>' : '') +
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
/** Editor drah v aplikaci (js/drahy_editor.js – načte se až teď); po uložení dráhy dostane plán nový stav dílu. */
function otevriEditorDrah(d) {
  import('./drahy_editor.js').then((m) => m.otevri(d, {
    editorPc: RP.editorOdkaz(c.data.editor, naPc(), d, datumDilu(d)),
    naPlan: (plan) => { if (plan && plan.dily) { c.data = plan; c.kdy = Date.now(); uloz(); zmeneno(); } }
  }), () => toast('Editor drah se nenačetl – zkontroluj připojení.', true));
}

let otevriReel = null; // reely.js předá otevriDetail (bez kruhového importu)
export function nastavOtevreniReelu(fn) { otevriReel = fn; }

async function termin(d) {
  // okno s polem vrací null i při Zrušit → „bez termínu“ / „podle plánu“ jsou volby
  const volbyT = d.vlastni ? (d.termin ? [['bez', 'Bez termínu']] : []) : d.terminPlan !== undefined ? [['plan', 'Podle plánu (' + RP.denADatum(d.terminPlan) + ')']] : [];
  const t = await okno({ ikona: IKONY.cas, nadpis: 'Termín dílu', text: d.nazev, volby: volbyT.length ? volbyT : undefined,
    pole: { popisek: 'Datum', hodnota: d.termin || '', typ: 'date' }, ano: 'Uložit' });
  if (!t || t === true) return;
  zmenDil(d, { termin: t === 'bez' || t === 'plan' ? null : t }, 'Termín uložený');
}

async function poznamka(d) {
  const t = await okno({ ikona: IKONY.psat, nadpis: 'Poznámka k dílu', text: d.nazev, volby: d.poznamkaMoje ? [['smazat', 'Smazat poznámku']] : undefined,
    pole: { popisek: 'Poznámka', hodnota: d.poznamkaMoje || '', radku: 3 }, ano: 'Uložit' });
  if (!t || t === true) return;
  zmenDil(d, { poznamka: t === 'smazat' ? null : t }, t === 'smazat' ? 'Poznámka smazaná' : 'Poznámka uložená');
}

async function posunVlnu() {
  const vlny = c.data.vlny.filter((v) => c.data.dily.some((x) => x.vlna === v.id && x.termin && !x.zruseno && x.stav !== 'vyveseno' && x.stav !== 'naplanovano'));
  if (!vlny.length) { toast('Není co posunout'); return; }
  const v = await okno({ ikona: IKONY.cas, nadpis: 'Posunout vlnu', text: 'Naplánované a vyvěšené díly zůstanou.', volby: vlny.map((x) => [x.id, x.nazev]) });
  if (!v || v === true) return;
  const dni = await okno({ ikona: IKONY.cas, nadpis: 'O kolik?', text: vlna(v).nazev, volby: [['-7', '− týden'], ['7', '+ týden'], ['14', '+ 2 týdny']] });
  if (!dni || dni === true) return;
  posli('reelyPlanUlozit', { posun: { vlna: v, dni: Number(dni) } }, 'Vlna posunutá', c.data.dily.filter((x) => x.vlna === v && x.termin).map((x) => x.id));
}

function presunDoVlny(d, kam) {
  const v = vlna(kam);
  if (!v || kam === d.vlna) return;
  const zpet = d.vlna;
  zmenDil(d, { vlna: kam }, { text: 'Přesunuto: ' + v.nazev.split(' · ')[0] + (d.termin ? ' · termín ' + RP.denADatum(d.termin) : ''), akce: 'Vrátit',
    fn: () => { const x = dil(d.id); if (x) zmenDil(x, { vlna: zpet }, 'Vráceno'); } });
}

function posunDil(d, dni) {
  if (!d.termin) { termin(d); return; }
  const novy = RP.pridejDny(d.termin, dni);
  zmenDil(d, { termin: novy }, 'Termín ' + RP.denADatum(novy));
}

function vyslo(d, ano) {
  zmenDil(d, { hotovo: ano ? true : null }, ano ? { text: 'Označeno jako vyšlé', akce: 'Vrátit', fn: () => { const x = dil(d.id); if (x) vyslo(x, false); } } : 'Zpátky mezi nevyšlé');
}

function zrus(d, ano) {
  zmenDil(d, { zruseno: ano ? true : null }, ano ? { text: 'Díl zrušený', akce: 'Vrátit', fn: () => zrus(d, false) } : 'Díl je zpátky v plánu');
}

/** Pravé tlačítko / podržení na kartě dílu (i v řádku Na řadě). */
function nabidkaDilu(cil) {
  const el = cil && cil.closest ? cil.closest('#p-reely [data-rp-dil]') : null;
  const d = el && c.data && dil(el.dataset.rpDil);
  if (!d) return null;
  const p = [];
  const akce = RP.akce(d, !!RP.editorOdkaz(c.data.editor, naPc(), d, datumDilu(d)), umiMotor('reelKlipy'));
  if (akce.indexOf('upravitDrahy') >= 0) p.push({ ikona: IKONY.psat, text: 'Upravit dráhy', fn: () => otevriEditorDrah(d) });
  if (akce.indexOf('drahyHotove') >= 0) p.push({ ikona: IKONY.fajfka, text: 'Dráhy hotové', fn: () => zmenDil(d, { drahyHotove: true }, 'Dráhy hotové') });
  if (akce.indexOf('udelatReel') >= 0) p.push({ ikona: IKONY.reely, text: 'Udělej reel', fn: () => posli('reelUdelat', { dil: d.id }, (x) => (x.zalozeno ? 'Claude reel složí na domácím PC' : 'O reel už je požádáno'), [d.id]) });
  if (d.reel && (akce.indexOf('naplanovat') >= 0 || akce.indexOf('otevritReel') >= 0)) p.push({ ikona: IKONY.prehrat, text: d.stav === 'reel' ? 'Otevřít a naplánovat' : 'Otevřít reel', fn: () => { if (otevriReel) otevriReel(d.reel); } });
  const lzeTermin = d.stav !== 'vyveseno' && d.stav !== 'naplanovano';
  if (lzeTermin) {
    p.push({ ikona: IKONY.cas, text: 'Změnit termín…', oddel: true, fn: () => termin(d) });
    if (d.termin) p.push({ ikona: IKONY.cas, text: 'Posunout…', dalsi: () => ({ nadpis: 'Posunout ' + d.nazev, polozky: [[-7, 'O týden dřív'], [-1, 'O den dřív'], [1, 'O den později'], [7, 'O týden později'], [14, 'O 2 týdny později']]
      .map((x) => ({ text: x[1] + ' (' + RP.denADatum(RP.pridejDny(d.termin, x[0])) + ')', fn: () => posunDil(d, x[0]) })) }) });
  }
  const vlny = (c.data.vlny || []);
  if (vlny.length) p.push({ ikona: IKONY.slozka || IKONY.cas, text: 'Přesunout do vlny…', oddel: !lzeTermin, dalsi: () => ({ nadpis: 'Do vlny', polozky: vlny.map((v) => ({
    text: v.nazev + (v.id === d.vlna ? ' ✓' : '') + (d.vlnaPlan && v.id === d.vlnaPlan && v.id !== d.vlna ? ' (podle plánu)' : ''), fn: () => presunDoVlny(d, v.id) })) }) });
  p.push({ ikona: IKONY.psat, text: d.poznamkaMoje ? 'Upravit poznámku…' : 'Poznámka…', fn: () => poznamka(d) });
  if (d.stav !== 'vyveseno') p.push({ ikona: IKONY.fajfka, text: 'Vyšlo', oddel: true, fn: () => vyslo(d, true) });
  else if (d.hotovo) p.push({ ikona: IKONY.fajfka, text: 'Ještě nevyšlo', oddel: true, fn: () => vyslo(d, false) });
  if (d.stav !== 'vyveseno' && d.stav !== 'naplanovano') p.push({ ikona: IKONY.smazat, text: 'Zrušit díl', nebezpeci: true, fn: () => zrus(d, true) });
  return { nadpis: RP.denADatum(d.termin) + ' · ' + d.nazev, polozky: p };
}
pripojNabidku(nabidkaDilu);

// přetažení karty do jiné vlny (jen myš, pohled Po vlnách)
const tah = { id: null, cil: null };
function cilTahu(e) {
  const s = e.target.closest && e.target.closest('#p-reely [data-rp-cil-vlna]');
  const d = tah.id && dil(tah.id);
  return s && d && s.dataset.rpCilVlna !== d.vlna ? s : null;
}
function oznacCil(s) {
  if (tah.cil === s) return;
  if (tah.cil) tah.cil.classList.remove('rp-vlna--cil');
  tah.cil = s;
  if (s) s.classList.add('rp-vlna--cil');
}
function konecTahu() {
  oznacCil(null);
  tah.id = null;
  document.documentElement.classList.remove('tahne-dil');
}
document.addEventListener('dragstart', (e) => {
  const k = e.target.closest && e.target.closest('#p-reely .rp-dil[draggable="true"]');
  if (!k) return;
  tah.id = k.dataset.rpDil;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', tah.id);
  document.documentElement.classList.add('tahne-dil');
});
document.addEventListener('dragover', (e) => {
  if (!tah.id) return;
  const s = cilTahu(e);
  oznacCil(s);
  if (!s) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
});
document.addEventListener('drop', (e) => {
  if (!tah.id) return;
  const s = cilTahu(e);
  const d = dil(tah.id);
  konecTahu();
  if (!s || !d) return;
  e.preventDefault();
  presunDoVlny(d, s.dataset.rpCilVlna);
});
document.addEventListener('dragend', konecTahu);

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
  const el = e.target.closest && e.target.closest('[data-rp-drahy-web], [data-rp-filtr], [data-rp-pohled], [data-rp-vlna], [data-rp-drahy], [data-rp-udelat], [data-rp-reel], [data-rp-hotovo], [data-rp-termin], ' +
    '[data-rp-poznamka], [data-rp-posun-vlnu], [data-rp-novy], [data-rp-na-dil], [data-rp-napad-novy], [data-rp-napad-smazat], [data-rp-do-planu], [data-rp-znovu]');
  if (!vStrance(el) || !c.data) return;
  const ds = el.dataset;
  if (ds.rpDrahyWeb) { const d = dil(ds.rpDrahyWeb); if (d) otevriEditorDrah(d); return; }
  if (ds.rpFiltr) { c.filtr = ds.rpFiltr; ulozVolby(); zmeneno(); return; }
  if (ds.rpPohled) { c.pohled = ds.rpPohled; ulozVolby(); zmeneno(); return; }
  if (ds.rpVlna) { c.vlnaMob = ds.rpVlna; ulozVolby(); zmeneno(); return; }
  if (ds.rpDrahy) { const d = dil(ds.rpDrahy); if (d) zmenDil(d, { drahyHotove: true }, 'Dráhy hotové'); return; }
  if (ds.rpUdelat) { posli('reelUdelat', { dil: ds.rpUdelat }, (d) => (d.zalozeno ? 'Claude reel složí na domácím PC' : 'O reel už je požádáno'), [ds.rpUdelat]); return; }
  if (ds.rpReel) { if (otevriReel) otevriReel(ds.rpReel); return; }
  if (ds.rpHotovo) { const d = dil(ds.rpHotovo); if (d) vyslo(d, true); return; }
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
