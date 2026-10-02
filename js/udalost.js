// Zápis do kalendáře: nová událost nebo zápas (šablona: tým, soupeř, doma/venku, výkop, sraz), úprava, smazání,
// zápasy z rozpisu na webu dorostu. Zapisuje motor – jen do vlastních kalendářů Google; kalendáře z iPhonu (iCloud)
// jsou jen ke čtení (upravují se v Kalendáři v iPhonu).

import { stav } from './stav.js';
import { volej } from './api.js';
import { esc, pulnoc, pridejDny, isoDatum, terminDatum, uloziste } from './pomocne.js';
import { otevriPanel, zavriPanel, obnovPanel, elementPanelu, zavriAPak } from './panely.js';
import { toast, segment, potvrd, okno } from './ui.js';
import { IKONY } from './ikony.js';
import { obnovPoZmene, najdiUdalost } from './kalendar.js';

/** Rozpisy zápasů z webu (veřejné soubory) – tlačítko je importuje do kalendáře „Zápasy“. */
export const ROZPISY = [
  { klic: 'dorost', nazev: 'Dorost', odkaz: 'https://kocismichal.github.io/dorost/assets/js/rozpis-dorost.js',
    tym: 'dorost', domaci: 'Vnorovy', soutez: '5. liga staršího dorostu JMKFS (C)' }
];
const DOMACI = 'Vnorovy';
const KALENDAR_ZAPASU = 'Zápasy';
const NOVY_KALENDAR_ZAPASU = '__novy-zapasy';
const TYMY = [['dorost', 'Dorost'], ['A-tým', 'A-tým'], ['Benfika', 'Benfika (B)'], ['', 'Jiný']];
const PRIPOMENUTI = [['vychozi', 'Podle nastavení kalendáře'], ['', 'Bez připomenutí'], ['15', '15 minut předem'], ['60', 'Hodinu předem'],
  ['120', '2 hodiny předem'], ['1440', 'Den předem'], ['1440,120', 'Den předem a 2 hodiny předem']];

export function zapisovatelneKalendare() {
  return ((stav.info && stav.info.kalendare) || []).filter((kal) => kal.zapis && kal.zdroj === 'google');
}

export function lzeZapisovat(u) {
  return !!(u && u.zdroj === 'google' && zapisovatelneKalendare().some((kal) => kal.id === u.kalendarId));
}

// ---------------------------------------------------------------- formulář

let f = null; // rozpracovaný formulář (hodnoty polí se drží i při překreslení)

const hhmmPole = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const minuty = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const zMinut = (n) => { n = ((n % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
function casDne(den, hhmm) { const d = new Date(den); const m = minuty(hhmm) || 0; d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d.getTime(); }

function kalendarZapasu() { return zapisovatelneKalendare().find((kal) => kal.nazev === KALENDAR_ZAPASU) || null; }

/** Nový záznam: { den (půlnoc), hodina (0–23,5), typ: 'udalost' | 'zapas' }, úprava: { udalost: id } */
export function otevriFormular(o) {
  o = o || {};
  const kalendare = zapisovatelneKalendare();
  if (!kalendare.length && o.typ !== 'zapas') {
    toast('Není kalendář Google, do kterého jde zapisovat – obnov aplikaci, nebo ho založ v Nastavení.', true);
    return;
  }
  const u = o.udalost ? najdiUdalost(o.udalost) : null;
  if (o.udalost && !u) return;
  const typ = u ? 'udalost' : (o.typ === 'zapas' ? 'zapas' : 'udalost');
  let zacatek, konec;
  if (u) { zacatek = u.zacatek; konec = u.konec; }
  else {
    const den = o.den != null ? pulnoc(o.den) : pulnoc(Date.now());
    // zápas bez zvolené hodiny dopoledne (dorost hraje v 10:00), jiná událost za hodinu od teď
    const hodina = o.hodina != null ? o.hodina : typ === 'zapas' ? 10 : Math.min(22, new Date().getHours() + 1);
    const d = new Date(den);
    d.setHours(Math.floor(hodina), Math.round((hodina % 1) * 60), 0, 0);
    zacatek = d.getTime();
    konec = zacatek + (typ === 'zapas' ? 120 : 60) * 6e4;
  }
  const posledni = uloziste.cti('asistent.kal.posledni');
  const vychoziKalendar = typ === 'zapas'
    ? (kalendarZapasu() ? kalendarZapasu().id : NOVY_KALENDAR_ZAPASU)
    : (kalendare.some((kal) => kal.id === posledni) ? posledni : (kalendare[0] || {}).id);
  const celodenni = u ? u.celodenni : false;
  f = {
    rezim: u ? 'uprava' : 'novy', udalost: u ? u.id : null, opakovana: !!(u && u.opakovana), typ,
    nazev: u ? u.nazev : '', tym: 'dorost', souper: '', doma: true, sraz: '',
    kalendarId: u ? u.kalendarId : vychoziKalendar, celodenni,
    datum: isoDatum(zacatek), od: hhmmPole(zacatek), do: hhmmPole(konec),
    datumDo: isoDatum(celodenni ? pridejDny(konec, -1) : zacatek), delka: Math.max(15, Math.round((konec - zacatek) / 6e4)),
    misto: u ? u.misto || '' : '', popis: u ? u.popis || '' : '', tydne: false, tydneDo: '', casZvoleny: o.hodina != null,
    pripomenuti: !u && typ === 'zapas' ? '1440,120' : 'vychozi',
    // hosté: u nové se pozvánky pošlou, u úpravy e-mail o změně jen na vyžádání
    hoste: u && Array.isArray(u.hoste) ? u.hoste.join(', ') : '', hosteZnami: !u || Array.isArray(u.hoste), pozvat: !u
  };
  otevriPanel({
    id: 'udalost-formular', trida: 'panel-okno panel-formular',
    titul: () => (f.rezim === 'uprava' ? 'Upravit událost' : f.typ === 'zapas' ? 'Nový zápas' : 'Nová událost'),
    vykresli: formularHtml,
    paticka: () => '<div class="akce">' +
      (f.rezim === 'uprava' ? '<button type="button" class="btn btn--ghost btn--nebezpeci" data-smazat-udalost="' + esc(f.udalost) + '">' + IKONY.smazat + '<span>Smazat</span></button>' : '') +
      '<button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--primary" data-ulozit-udalost>' + IKONY.fajfka + '<span>Uložit</span></button></div>',
    poOtevreni: (el) => { const pole = el.querySelector(f.typ === 'zapas' ? '[data-uf="souper"]' : '[data-uf="nazev"]'); if (pole) pole.focus(); },
    priZavreni: () => { f = null; }
  });
}

function nazevZapasu() {
  const souper = (f.souper || '').trim() || 'soupeř';
  return '⚽ ' + (f.doma ? DOMACI + ' – ' + souper : souper + ' – ' + DOMACI) + (f.tym ? ' (' + f.tym + ')' : '');
}

function moznosti(seznam, vybrana) {
  return seznam.map((v) => '<option value="' + esc(v[0]) + '"' + (v[0] === vybrana ? ' selected' : '') + '>' + esc(v[1]) + '</option>').join('');
}

function formularHtml() {
  const kalendare = zapisovatelneKalendare().map((kal) => [kal.id, kal.nazev]);
  if (f.typ === 'zapas' && !kalendarZapasu()) kalendare.unshift([NOVY_KALENDAR_ZAPASU, 'Zápasy (nový kalendář)']);
  const zapas = f.typ === 'zapas';
  let h = '<div class="formular">';
  if (f.rezim === 'novy') h += segment([['udalost', 'Událost'], ['zapas', 'Zápas']], f.typ, 'data-uf-typ', 'Druh záznamu');
  if (zapas) {
    h += '<div class="fmr fmr--2">' +
      '<label><span class="label">Tým</span><select class="field" data-uf="tym">' + moznosti(TYMY, f.tym) + '</select></label>' +
      '<label><span class="label">Soupeř</span><input class="field" data-uf="souper" value="' + esc(f.souper) + '" placeholder="např. Kyjov" autocomplete="off"></label></div>' +
      '<div class="formular__radek">' + segment([['doma', 'Doma'], ['venku', 'Venku']], f.doma ? 'doma' : 'venku', 'data-uf-doma', 'Kde se hraje') +
      '<p class="nahled-nazvu"><span data-uf-nahled>' + esc(nazevZapasu()) + '</span></p></div>';
  } else {
    h += '<label><span class="label">Název</span><input class="field" data-uf="nazev" value="' + esc(f.nazev) + '" placeholder="Co…" autocomplete="off" maxlength="200"></label>';
  }
  h += '<label><span class="label">Kalendář</span><select class="field" data-uf="kalendarId">' + moznosti(kalendare, f.kalendarId) + '</select></label>';
  h += '<label class="prepinac-radek"><span>Celý den</span><span class="prepinac"><input type="checkbox" data-uf-celodenni' + (f.celodenni ? ' checked' : '') + '><span></span></span></label>';
  if (f.celodenni) {
    h += '<div class="fmr fmr--2"><label><span class="label">Od</span><input class="field" type="date" data-uf="datum" value="' + f.datum + '"></label>' +
      '<label><span class="label">Do (včetně)</span><input class="field" type="date" data-uf="datumDo" value="' + f.datumDo + '" min="' + f.datum + '"></label></div>';
  } else {
    h += '<div class="fmr fmr--3"><label><span class="label">Datum</span><input class="field" type="date" data-uf="datum" value="' + f.datum + '"></label>' +
      '<label><span class="label">' + (zapas ? 'Výkop' : 'Od') + '</span><input class="field" type="time" data-uf="od" value="' + f.od + '" step="300"></label>' +
      '<label><span class="label">Do</span><input class="field" type="time" data-uf="do" value="' + f.do + '" step="300"></label></div>';
  }
  if (zapas) h += '<label><span class="label">Sraz (nepovinné)</span><input class="field" type="time" data-uf="sraz" value="' + f.sraz + '" step="300"></label>';
  h += '<label><span class="label">Místo</span><input class="field" data-uf="misto" value="' + esc(f.misto) + '" placeholder="' +
    (zapas ? (f.doma ? DOMACI + ', hřiště' : 'obec soupeře') : 'nepovinné') + '" autocomplete="off"></label>';
  h += hosteHtml();
  if (f.rezim === 'novy' && !zapas) {
    h += '<label class="prepinac-radek"><span>Opakovat každý týden</span><span class="prepinac"><input type="checkbox" data-uf-tydne' + (f.tydne ? ' checked' : '') + '><span></span></span></label>';
    if (f.tydne) h += '<label><span class="label">Opakovat do (nepovinné)</span><input class="field" type="date" data-uf="tydneDo" value="' + f.tydneDo + '" min="' + f.datum + '"></label>';
  }
  h += '<label><span class="label">Připomenout</span><select class="field" data-uf="pripomenuti">' + moznosti(PRIPOMENUTI, f.pripomenuti) + '</select></label>';
  h += '<label><span class="label">Poznámka</span><textarea class="odpoved" data-uf="popis" rows="3" placeholder="nepovinné">' + esc(f.popis) + '</textarea></label>';
  if (f.opakovana) h += '<p class="napoveda">Opakovaná událost – změna platí jen pro tento výskyt.</p>';
  return h + '</div>';
}

// ---------------------------------------------------------------- hosté (pozvánky e-mailem)

const ADRESA = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const skupinyHostu = () => (stav.info && stav.info.skupinyHostu) || [];
function adresyZTextu(text) {
  const seznam = String(text || '').split(/[,;\s]+/).map((a) => a.trim().toLowerCase()).filter(Boolean);
  return seznam.filter((a, i) => seznam.indexOf(a) === i);
}

function hosteHtml() {
  const skupiny = skupinyHostu();
  return '<label><span class="label">Pozvat lidi (e-mail)</span><input class="field" data-uf="hoste" value="' + esc(f.hoste) + '" ' +
      'placeholder="adresy oddělené čárkou" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    (skupiny.length ? '<div class="volby">' + skupiny.map((s) => '<button type="button" class="chip" data-uf-skupina="' + esc(s.nazev) + '">' + IKONY.plus +
      esc(s.nazev) + '<span class="pocet cisla">' + s.adresy.length + '</span></button>').join('') + '</div>' : '') +
    '<div class="formular__radek formular__radek--hoste">' +
      '<label class="prepinac-radek"><span>' + (f.rezim === 'uprava' ? 'Poslat hostům e-mail o změně' : 'Poslat pozvánky e-mailem') + '</span>' +
      '<span class="prepinac"><input type="checkbox" data-uf-pozvat' + (f.pozvat ? ' checked' : '') + '><span></span></span></label>' +
      '<button type="button" class="odkaz" data-uf-ulozit-skupinu>Uložit adresy jako skupinu</button></div>';
}

async function ulozSkupinu(tlacitko) {
  ctiFormular();
  const adresy = adresyZTextu(f.hoste);
  if (!adresy.length) { toast('Nejdřív napiš adresy do pole Pozvat lidi.', true); return; }
  const nazev = await okno({ ikona: IKONY.lide, nadpis: 'Uložit adresy jako skupinu', text: adresy.length + ' ' + (adresy.length === 1 ? 'adresa' : adresy.length < 5 ? 'adresy' : 'adres') +
    ' – příště je přidáš jedním klepnutím.', pole: { popisek: 'Název skupiny', placeholder: 'třeba Dorost – rodiče' }, ano: 'Uložit' });
  if (!nazev) return;
  tlacitko.disabled = true;
  try {
    const skupiny = await volej('skupinyHostuUlozit', { skupiny: skupinyHostu().filter((s) => s.nazev !== nazev).concat({ nazev, adresy }) });
    if (stav.info) { stav.info.skupinyHostu = skupiny; uloziste.pis('asistent.info', stav.info); }
    toast('Skupina „' + nazev + '“ uložená (' + adresy.length + ' adres)');
    prekresli();
  } catch (e) {
    tlacitko.disabled = false;
    toast(e.message, true);
  }
}

/** Hodnoty z polí do f (před překreslením a uložením). */
function ctiFormular() {
  const el = elementPanelu('udalost-formular');
  if (!el || !f) return;
  el.querySelectorAll('[data-uf]').forEach((p) => { f[p.dataset.uf] = p.value; });
}

function prekresli() {
  ctiFormular();
  obnovPanel('udalost-formular');
}

async function uloz(tlacitko) {
  ctiFormular();
  const zapas = f.typ === 'zapas';
  const data = {};
  if (f.udalost) data.udalost = f.udalost;
  if (zapas) {
    if (!f.souper.trim()) { toast('Doplň soupeře.', true); return; }
    data.nazev = nazevZapasu();
    data.misto = f.misto.trim() || (f.doma ? DOMACI + ', hřiště' : f.souper.trim());
    data.popis = [f.doma ? 'Doma' : 'Venku', f.sraz ? 'Sraz: ' + f.sraz : '', f.popis.trim()].filter(Boolean).join('\n');
  } else {
    if (!f.nazev.trim()) { toast('Doplň název.', true); return; }
    data.nazev = f.nazev.trim();
    data.misto = f.misto.trim();
    data.popis = f.popis.trim();
  }
  const den = terminDatum(f.datum);
  if (den == null) { toast('Vyber datum.', true); return; }
  data.celodenni = !!f.celodenni;
  if (f.celodenni) {
    const posledni = terminDatum(f.datumDo) || den;
    if (posledni < den) { toast('Konec je před začátkem.', true); return; }
    data.zacatek = den;
    data.konec = pridejDny(posledni, 1);
  } else {
    if (minuty(f.od) == null || minuty(f.do) == null) { toast('Doplň čas.', true); return; }
    data.zacatek = casDne(den, f.od);
    data.konec = casDne(den, f.do);
    if (data.konec <= data.zacatek) data.konec = casDne(pridejDny(den, 1), f.do); // přes půlnoc
  }
  if (f.rezim === 'novy' && !zapas && f.tydne) {
    data.tydne = true;
    if (terminDatum(f.tydneDo) != null) data.tydneDo = f.tydneDo;
  }
  if (f.pripomenuti !== 'vychozi') data.pripomenuti = f.pripomenuti ? f.pripomenuti.split(',').map(Number) : [];
  const hoste = adresyZTextu(f.hoste);
  const spatna = hoste.find((a) => !ADRESA.test(a));
  if (spatna) { toast('Neplatná adresa: ' + spatna, true); return; }
  // u úpravy hosty posílat, jen když je známe (jinak by se smazali) nebo je někdo dopsal
  if (f.hosteZnami || hoste.length) { data.hoste = hoste; data.pozvat = !!f.pozvat && hoste.length > 0; }
  tlacitko.disabled = true;
  try {
    let kalendarId = f.kalendarId;
    if (kalendarId === NOVY_KALENDAR_ZAPASU) {
      const novy = await volej('kalendarZalozit', { nazev: KALENDAR_ZAPASU, barva: '#2e7a4d' });
      kalendarId = novy.id;
      if (stav.info) { stav.info.kalendare = novy.kalendare; uloziste.pis('asistent.info', stav.info); }
    }
    data.kalendarId = kalendarId;
    await volej('udalostUlozit', data);
    if (!zapas) uloziste.pis('asistent.kal.posledni', kalendarId);
    const novy = f.rezim === 'novy';
    zavriPanel();
    toast(novy ? 'Přidáno do kalendáře' : 'Uloženo');
    obnovPoZmene(data.zacatek);
  } catch (e) {
    tlacitko.disabled = false;
    toast(e.message, true);
  }
}

/** Smazání (z detailu i z formuláře); u opakované buď jen výskyt, nebo celá řada. */
async function smaz(id, cela) {
  const u = najdiUdalost(id);
  if (!u) return;
  const otazka = cela ? 'Smazat celou opakovanou řadu „' + u.nazev + '“?' : 'Smazat „' + u.nazev + '“' + (u.opakovana ? ' (jen tento výskyt)' : '') + '?';
  if (!(await potvrd(otazka, { ton: 'nebezpeci', ikona: IKONY.smazat, ano: 'Smazat',
    text: (u.hoste && u.hoste.length ? 'Událost má hosty – v jejich kalendářích může zůstat, dej jim vědět. ' : '') + 'Smazání nejde vrátit.' }))) return;
  try {
    await volej('udalostSmazat', { kalendarId: u.kalendarId, udalost: u.id, cela: !!cela });
    zavriPanel();
    toast('Smazáno');
    obnovPoZmene(null, u.id);
  } catch (e) {
    toast(e.message, true);
  }
}

/** Tlačítka v detailu události (jen u kalendářů, kam jde zapisovat). */
export function akceUdalostiHtml(u) {
  if (!lzeZapisovat(u)) {
    return u && u.zdroj === 'icloud' ? '<p class="napoveda">Kalendář z iPhonu je tu jen ke čtení – upravíš ho v Kalendáři v iPhonu.</p>' : '';
  }
  return '<div class="akce">' +
    (u.opakovana
      ? '<button type="button" class="btn btn--ghost btn--nebezpeci" data-smazat-udalost="' + esc(u.id) + '" data-cela="1">Smazat řadu</button>' +
        '<button type="button" class="btn btn--ghost btn--nebezpeci" data-smazat-udalost="' + esc(u.id) + '">Smazat tuto</button>'
      : '<button type="button" class="btn btn--ghost btn--nebezpeci" data-smazat-udalost="' + esc(u.id) + '">' + IKONY.smazat + '<span>Smazat</span></button>') +
    '<button type="button" class="btn btn--primary" data-upravit-udalost="' + esc(u.id) + '">' + IKONY.psat + '<span>Upravit</span></button></div>';
}

// ---------------------------------------------------------------- zápasy z rozpisu

async function importujRozpis(klic, tlacitko) {
  const r = ROZPISY.find((x) => x.klic === klic);
  if (!r) return;
  const popisek = tlacitko.innerHTML;
  tlacitko.disabled = true;
  tlacitko.textContent = 'Načítám rozpis…';
  try {
    const v = await volej('zapasyImport', { odkaz: r.odkaz, tym: r.tym, domaci: r.domaci, soutez: r.soutez });
    toast(r.nazev + ': ' + v.pridano + ' nových, ' + v.upraveno + ' upravených, ' + v.beze_zmeny + ' beze změny – kalendář „' + v.kalendar + '“');
    const kalendare = await volej('kalendare');
    if (stav.info) { stav.info.kalendare = kalendare; uloziste.pis('asistent.info', stav.info); }
    obnovPoZmene();
  } catch (e) {
    toast(e.message, true);
  } finally {
    tlacitko.disabled = false;
    tlacitko.innerHTML = popisek;
  }
}

/** Karta „Zápasy“ (pravý panel kalendáře, Nastavení). */
export function zapasyHtml(sTlacitkemNovy) {
  return '<p class="karta-text">Rozpis z webu dorostu: nové zápasy přidá do kalendáře „Zápasy“, přeložené upraví, nic nezdvojí.</p>' +
    ROZPISY.map((r) => '<button type="button" class="dlazdice__pata" data-import-rozpisu="' + esc(r.klic) + '">' + IKONY.obnovit + 'Načíst rozpis – ' + esc(r.nazev) + '</button>').join('') +
    (sTlacitkemNovy ? '<button type="button" class="dlazdice__pata" data-novy-zapas>' + IKONY.plus + 'Zápas ručně</button>' : '');
}

// ---------------------------------------------------------------- ovládání

export function klikUdalost(el) {
  if (el.hasAttribute('data-nova-udalost')) { otevriFormular({ den: el.dataset.novaUdalost ? Number(el.dataset.novaUdalost) : undefined }); return true; }
  if (el.hasAttribute('data-novy-zapas')) { otevriFormular({ typ: 'zapas', den: el.dataset.novyZapas ? Number(el.dataset.novyZapas) : undefined }); return true; }
  if (el.dataset.upravitUdalost) { const id = el.dataset.upravitUdalost; zavriAPak(() => otevriFormular({ udalost: id })); return true; }
  if (el.dataset.smazatUdalost) { smaz(el.dataset.smazatUdalost, el.dataset.cela === '1'); return true; }
  if (el.hasAttribute('data-ulozit-udalost')) { uloz(el); return true; }
  if (el.dataset.importRozpisu) { importujRozpis(el.dataset.importRozpisu, el); return true; }
  if (!f || !el.closest('[data-panel="udalost-formular"]')) return false;
  if (el.dataset.ufTyp) {
    ctiFormular();
    if (f.typ !== el.dataset.ufTyp) {
      f.typ = el.dataset.ufTyp;
      const zapas = f.typ === 'zapas';
      // výchozí hodnoty podle druhu: zápas = 2 h, kalendář Zápasy, připomenutí den a 2 h předem
      f.delka = zapas ? 120 : 60;
      if (zapas && !f.casZvoleny) f.od = '10:00';
      f.do = zMinut((minuty(f.od) || 0) + f.delka);
      f.pripomenuti = zapas ? '1440,120' : 'vychozi';
      f.kalendarId = zapas ? (kalendarZapasu() ? kalendarZapasu().id : NOVY_KALENDAR_ZAPASU)
        : ((zapisovatelneKalendare().find((kal) => kal.id === uloziste.cti('asistent.kal.posledni')) || zapisovatelneKalendare()[0] || {}).id);
      f.tydne = false;
    }
    obnovPanel('udalost-formular');
    return true;
  }
  if (el.dataset.ufDoma) { ctiFormular(); f.doma = el.dataset.ufDoma === 'doma'; obnovPanel('udalost-formular'); return true; }
  if (el.dataset.ufSkupina) {
    // přidat adresy skupiny k těm, co už v poli jsou
    ctiFormular();
    const s = skupinyHostu().find((x) => x.nazev === el.dataset.ufSkupina);
    if (s) {
      f.hoste = adresyZTextu(f.hoste + ',' + s.adresy.join(',')).join(', ');
      const pole = elementPanelu('udalost-formular').querySelector('[data-uf="hoste"]');
      if (pole) pole.value = f.hoste;
      toast('Přidáno: ' + s.nazev + ' (' + s.adresy.length + ')');
    }
    return true;
  }
  if (el.hasAttribute('data-uf-ulozit-skupinu')) { ulozSkupinu(el); return true; }
  return false;
}

/** Přepínače ve formuláři (Celý den, Opakovat). */
export function zmenaUdalost(e) {
  const t = e.target;
  if (!f || !t.closest || !t.closest('[data-panel="udalost-formular"]')) return false;
  if (t.matches('[data-uf-celodenni]')) {
    ctiFormular();
    f.celodenni = t.checked;
    if (f.celodenni && (terminDatum(f.datumDo) == null || f.datumDo < f.datum)) f.datumDo = f.datum;
    prekresli();
    return true;
  }
  if (t.matches('[data-uf-tydne]')) { ctiFormular(); f.tydne = t.checked; prekresli(); return true; }
  if (t.matches('[data-uf-pozvat]')) { f.pozvat = t.checked; return true; }
  return false;
}

/** Psaní do polí: Do se posouvá s Od (stejná délka), náhled názvu zápasu se mění hned. */
export function vstupUdalost(e) {
  const t = e.target;
  if (!f || !t.matches || !t.matches('[data-uf]') || !t.closest('[data-panel="udalost-formular"]')) return false;
  const pole = t.dataset.uf;
  f[pole] = t.value;
  const el = elementPanelu('udalost-formular');
  if (pole === 'od' && minuty(t.value) != null) {
    f.casZvoleny = true;
    f.do = zMinut(minuty(t.value) + f.delka);
    const doPole = el.querySelector('[data-uf="do"]');
    if (doPole) doPole.value = f.do;
  } else if (pole === 'do' && minuty(t.value) != null && minuty(f.od) != null) {
    f.delka = ((minuty(t.value) - minuty(f.od)) + 1440) % 1440 || f.delka;
  } else if (pole === 'datum' && f.celodenni && f.datumDo < f.datum) {
    f.datumDo = f.datum;
    const doPole = el.querySelector('[data-uf="datumDo"]');
    if (doPole) { doPole.value = f.datumDo; doPole.min = f.datum; }
  }
  if (pole === 'souper' || pole === 'tym') {
    const nahled = el.querySelector('[data-uf-nahled]');
    if (nahled) nahled.textContent = nazevZapasu();
  }
  return true;
}

