// Knihovna (Michal 11. 10.: „přidat něco jako přehled informací k filmu či knize … jednoduché přehledné informace, co se
// dají získat na internetu … to stejné další stránku s rešerší k různým věcem – chtěl bych se tak vzdělávat a mít takovou
// svoji knihovnu“). Záložky Filmy (filmy i seriály) · Knihy · Rešerše; dlaždice s plakátem / obálkou (bez obrázku zástupná
// plocha s iniciálou), detail karty (hodnocení, tvůrci, obsah bez spoilerů, série a pořadí, zajímavosti, kde sledovat,
// související, zdroje), čtečka rešerše a můj stav, hvězdy a poznámka. „+“ = požadavek pro Clauda: karta se hned ukáže
// jako „Claude připravuje…“ (u filmu a knihy s náhledem z Wikipedie) a plná je, až ji Claude připraví (úloha schránky
// 7–22 h po 30 min).
// Data: motor (knihovna, knihovnaReserse, knihovnaPridat, knihovnaMoje, knihovnaZrusit → CLAUDE_SCHRANKA/KNIHOVNA, formát
// ve skillu osobni-knihovna); v zařízení asistent.data.knihovna (rychlý start, bez sítě). Kopie na serveru (Firebase)
// knihovna nemá – čte se z motoru, jen když je stránka otevřená; jiná zařízení se dozví o změně ze značky změn (zmeny).
// Modul načte app.js až na stránce Knihovna (import()) – start aplikace na něj nečeká. Čisté funkce: js/knihovna_data.js.

import { stav, zmeneno, umiMotor, prejdi } from './stav.js';
import { volej, jeDemo } from './api.js';
import { esc, uloziste, kdyKratce, odstin, tvar, dm, hhmm, datumDlouhe, velkePrvni, trvani } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, kostra, chybaHtml, segment } from './ui.js';
import { otevriPanel, zavriPanel, obnovPanel, elementPanelu, jeOtevreny, zavriAPak } from './panely.js';
import * as nabidka from './nabidka.js';
import * as bubliny from './bubliny.js';
import * as D from './knihovna_data.js';

const ULOZISTE = 'asistent.data.knihovna';                  // poslední odpověď motoru
const ULOZISTE_RESERSI = 'asistent.data.knihovna.reserse';  // naposledy otevřené rešerše (čtečka i bez sítě)
const ULOZISTE_WIKI = 'asistent.data.knihovna.wiki';        // náhledy z Wikipedie k čekajícím požadavkům
const VOLBY = 'asistent.knihovna';                          // záložka a filtry v tomhle zařízení
const MAX_RESERSI_V_ZARIZENI = 8;
const HLIDAT_PO = 5 * 60e3;        // čeká-li požadavek a stránka je otevřená, zeptat se motoru jednou za 5 minut
const ULOZIT_POZNAMKU_PO = 900;    // ms po posledním písmenu
const MAX_WIKI = 6;                // náhledů z Wikipedie naráz
const WIKI_ZNOVU_PO = 2 * 60e3;    // po chybě sítě zkusit náhled znovu nejdřív za 2 minuty
const NAZEV_DRUHU = { film: 'Film', serial: 'Seriál', kniha: 'Kniha', reserse: 'Rešerše' };
const CO_PRIPRAVI = { film: 'kartu filmu', serial: 'kartu seriálu', kniha: 'kartu knihy', reserse: 'rešerši' };
const TRIDA_STAVU = { chci: 'tag--fialova', rozpracovane: 'tag--warn', hotovo: 'tag--ok' };
const PRIDAT = {
  film: ['Název filmu', 'např. Interstellar', 'Claude připraví kartu: o čem to je (bez spoilerů), tvůrci, hodnocení, zajímavosti a kde film teď sledovat.'],
  serial: ['Název seriálu', 'např. Černobyl', 'Claude připraví kartu: o čem to je (bez spoilerů), řady a díly, hodnocení a kde seriál sledovat.'],
  kniha: ['Název knihy (klidně i s autorem)', 'např. Malý princ', 'Claude připraví kartu: o čem kniha je (bez spoilerů), autor, série a pořadí čtení, hodnocení a kde ji sehnat.'],
  reserse: ['Na co se chceš zeptat, nebo téma', 'např. Jak vznikl internet?', 'Claude projde zdroje a připraví přehled: to nejdůležitější krátce, sekce, časovou osu, pojmy a další otázky.']
};

const volby = uloziste.cti(VOLBY) || {};
const k = {
  zalozka: D.ZALOZKY.some((z) => z[0] === volby.zalozka) ? volby.zalozka : 'filmy',
  filtr: Object.assign({ filmy: 'vse', knihy: 'vse', reserse: 'vse' }, volby.filtr),
  dotaz: '',
  nacteno: false,         // v tomhle běhu aplikace už se knihovna četla z motoru
  reserse: {},            // id → { data, kdy } | { nacita, chyba }
  wiki: {},               // id požadavku → { data } (null = nic) | { nacita } | { chyba: ms }
  chybneObrazky: new Set(),
  zapisu: 0,              // zápisy na cestě – odpověď motoru se ukáže až po posledním (okamžitý stav nepřeskočí zpátky)
  fronta: Promise.resolve(),
  poznamka: null,         // { id, text, casovac } rozepsaná poznámka
  pridat: { druh: 'film', text: '' },
  hlidani: 0
};

// ---------------------------------------------------------------- data

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data && !stav.knihovna) stav.knihovna = v.data;
  const r = uloziste.cti(ULOZISTE_RESERSI) || {};
  Object.keys(r).forEach((id) => { if (r[id] && r[id].data && !k.reserse[id]) k.reserse[id] = { data: r[id].data, kdy: r[id].kdy || 0 }; });
  const w = uloziste.cti(ULOZISTE_WIKI) || {};
  Object.keys(w).forEach((id) => { if (!k.wiki[id]) k.wiki[id] = { data: w[id] || null }; });
}

function uloz(data) {
  stav.knihovna = data;
  // plné úložiště: radši nic než stará data (ta by po startu chvíli ukazovala neplatný stav)
  if (!uloziste.pis(ULOZISTE, { data, kdy: Date.now() })) uloziste.smaz(ULOZISTE);
}

/** Načte knihovnu z motoru (karty, index rešerší, můj stav, čekající požadavky). */
export function nactiKnihovnu() {
  if (!umiMotor('knihovna') || stav.nacita.knihovna) return Promise.resolve();
  k.nacteno = true;
  stav.nacita.knihovna = true;
  stav.chyby.knihovna = null;
  return volej('knihovna')
    .then((data) => { if (!k.zapisu) prijmi(data); })
    .catch((e) => { stav.chyby.knihovna = e; })
    .then(() => { stav.nacita.knihovna = false; zmeneno(); });
}

/** Odpověď motoru → stav, zařízení, otevřené panely; náhledy z Wikipedie k vyřízeným požadavkům pryč. */
function prijmi(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.karty)) return;
  uloz(data);
  const cekaji = {};
  D.pozadavky(data).forEach((p) => { cekaji[p.id] = true; });
  Object.keys(k.wiki).forEach((id) => { if (!cekaji[id]) delete k.wiki[id]; });
  ulozWiki();
  obnovOtevrene();
}

/** Volá se při každém překreslení stránky: poprvé načíst z motoru, hlídat čekající požadavky, náhledy z Wikipedie. */
export function dotahni() {
  if (!umiMotor('knihovna')) return;
  if (!k.nacteno && !stav.nacita.knihovna) nactiKnihovnu();
  hlidej();
  wikiNahledy();
}

/** Čeká-li požadavek a stránka je otevřená, jednou za 5 minut se zeptat motoru (Claude kartu mezitím připraví). */
function hlidej() {
  if (k.hlidani || stav.pohled !== 'knihovna' || jeDemo() || !D.pozadavky(stav.knihovna).length) return;
  k.hlidani = setTimeout(() => {
    k.hlidani = 0;
    if (stav.pohled === 'knihovna' && document.visibilityState === 'visible' && D.pozadavky(stav.knihovna).length) nactiKnihovnu();
  }, HLIDAT_PO);
}

/** Značka změn ze serveru (zmeny.knihovna): zapisovalo se odjinud (jiné zařízení, Claude přidal kartu) → načíst znovu.
 *  5 s rezerva: vlastní zápis značku posune těsně po čase odpovědi (ted) – kvůli němu se znovu nečte. */
export function zkontrolujZmenu(ms) {
  const d = stav.knihovna;
  if (!ms || stav.nacita.knihovna || !umiMotor('knihovna')) return;
  if (!d || ms > (d.ted || 0) + 5000) nactiKnihovnu();
}

export function podnadpis() {
  const d = stav.knihovna;
  if (!d) return stav.chyby.knihovna ? 'Knihovna se nenačetla' : 'Filmy, seriály, knihy a rešerše';
  const p = D.pocty(d);
  const casti = [p.filmy ? 'filmy a seriály ' + p.filmy : '', p.knihy ? 'knihy ' + p.knihy : '', p.reserse ? 'rešerše ' + p.reserse : '',
    p.cekaji ? 'Claude připravuje ' + p.cekaji : ''].filter(Boolean);
  return casti.length ? velkePrvni(casti.join(' · ')) : 'Zatím prázdná – přidej film, knihu nebo otázku';
}

// ---------------------------------------------------------------- zápisy (okamžitě na obrazovce, motor po sobě)

/**
 * Zápis do motoru: okamzite(data) → data ukáže hned; zápisy jdou po sobě (fronta), odpověď posledního nahradí data.
 * Chyba: toast a návrat k datům před zápisem. Vrací slib s odpovědí motoru, nebo null.
 */
function zapis(akce, data, okamzite) {
  const pred = stav.knihovna;
  if (okamzite) { stav.knihovna = okamzite(stav.knihovna); obnovOtevrene(); zmeneno(); }
  k.zapisu++;
  const slib = k.fronta.then(() => volej(akce, data));
  k.fronta = slib.catch(() => { /* další zápis jede dál */ });
  return slib.then((d) => {
    k.zapisu--;
    if (!k.zapisu) prijmi(d);
    return d;
  }, (e) => {
    k.zapisu--;
    toast(e.message, true);
    if (!k.zapisu && okamzite) { stav.knihovna = pred; obnovOtevrene(); }
    return null;
  }).then((d) => { zmeneno(); return d; });
}

/** Můj stav / hvězdy / poznámka (rozepsaná poznámka k téže položce jde s nimi). */
function ulozMoje(id, zmena) {
  if (k.poznamka && k.poznamka.id === id && zmena.poznamka === undefined) {
    clearTimeout(k.poznamka.casovac);
    zmena.poznamka = k.poznamka.text;
    k.poznamka = null;
  }
  return zapis('knihovnaMoje', Object.assign({ id }, zmena), (d) => D.sMoji(d, id, zmena));
}

function ulozPoznamkuHned() {
  const p = k.poznamka;
  if (!p) return;
  clearTimeout(p.casovac);
  k.poznamka = null;
  if ((D.moje(stav.knihovna, p.id).poznamka || '') === p.text.trim()) { stavPoznamky(p.id, ''); return; }
  stavPoznamky(p.id, 'ukládám…');
  ulozMoje(p.id, { poznamka: p.text }).then((d) => stavPoznamky(p.id, d ? 'uloženo' : 'neuloženo – zkus to znovu'));
}

function stavPoznamky(id, text) {
  document.querySelectorAll('[data-kn-poznamka-stav="' + CSS.escape(id) + '"]').forEach((el) => { el.textContent = text; });
}

/** Nový požadavek pro Clauda: hned jako „Claude připravuje…“, motor ho zapíše (moje.json + pokyn v NOVE). */
function pridej(druh, text) {
  const pred = new Set(D.pozadavky(stav.knihovna).map((p) => p.id));
  const docasny = { id: 'p-tmp-' + Date.now().toString(36), druh, text, kdy: new Date().toISOString(), docasny: true };
  k.zalozka = D.zalozkaDruhu(druh);
  k.dotaz = '';
  const pole = document.getElementById('kn-hledat');
  if (pole) pole.value = '';
  ulozVolby();
  if (stav.pohled !== 'knihovna') prejdi('knihovna');
  return zapis('knihovnaPridat', { druh, text }, (d) => Object.assign({ karty: [], reserse: [], moje: {} }, d, { pozadavky: D.pozadavky(d).concat(docasny) }))
    .then((d) => {
      if (!d) { otevriPridani(druh, text); return null; } // nepovedlo se – text zůstane v okně
      const novy = D.pozadavky(d).find((p) => !pred.has(p.id));
      if (novy) toastAkce('Přidáno – Claude připraví ' + CO_PRIPRAVI[druh] + ' do půl hodiny', 'Vrátit', () => zrus(novy.id, true));
      else toast('Tohle už Claude připravuje.');
      return novy || null;
    });
}

/** Zrušit čekající požadavek (Vrátit ho přidá znovu). */
function zrus(id, tiche) {
  if (/^p-tmp-/.test(id)) { toast('Ještě se ukládá – zkus to za chvilku.'); return; }
  const p = D.pozadavky(stav.knihovna).find((x) => x.id === id);
  if (jeOtevreny('kn-p:' + id)) zavriPanel();
  zapis('knihovnaZrusit', { id }, (d) => Object.assign({}, d, { pozadavky: D.pozadavky(d).filter((x) => x.id !== id) }))
    .then((d) => { if (d && p && !tiche) toastAkce('Požadavek zrušen', 'Vrátit', () => pridej(p.druh, p.text)); });
}

// ---------------------------------------------------------------- stránka

const posledni = new WeakMap();
/** innerHTML jen při změně (obrázky se nenačítají znovu a nic neposkočí). */
function nastav(el, html) {
  if (!el || posledni.get(el) === html) return;
  posledni.set(el, html);
  el.innerHTML = html;
}

export function vykresliKnihovnu(el) {
  if (!umiMotor('knihovna')) {
    nastav(el, '<section class="card"><div class="prazdne prazdne--velke"><i class="kruh kruh--knihovna">' + IKONY.knihovna + '</i>' +
      '<b>Knihovnu umí až nová verze motoru</b><span>Nasaď Novou verzi motoru – návod je v Nastavení → Připojení.</span>' +
      '<button type="button" class="btn btn--ghost" data-otevri-nastaveni="pripojeni">Nastavení připojení</button></div></section>');
    return;
  }
  if (!el.querySelector('#kn-obsah')) {
    posledni.delete(el); // místo hlášky o starém motoru stránka – hláška se příště musí zase zapsat
    el.innerHTML = '<div class="kn-lista">' +
        '<div class="kn-lista__zalozky" id="kn-zalozky"></div>' +
        '<label class="kn-hledat">' + IKONY.hledat + '<input type="search" id="kn-hledat" data-kn-hledat placeholder="Hledat v knihovně…" autocomplete="off" ' +
          'spellcheck="false" enterkeyhint="search" aria-label="Hledat v knihovně"></label>' +
        '<button type="button" class="btn btn--primary kn-lista__pridat" data-kn-pridat>' + IKONY.plus + '<span>Přidat</span></button>' +
      '</div><div class="kn-filtry" id="kn-filtry"></div><div class="kn-obsah" id="kn-obsah"></div>';
    el.querySelector('#kn-hledat').value = k.dotaz;
  }
  nastav(el.querySelector('#kn-zalozky'), zalozkyHtml());
  nastav(el.querySelector('#kn-filtry'), filtryHtml());
  nastav(el.querySelector('#kn-obsah'), obsahHtml());
}

/** Překreslit jen stránku (psaní do hledání, záložky, filtry) – bez celé aplikace. */
function prekresliStranku() {
  const el = document.getElementById('p-knihovna');
  if (el && !el.hidden) vykresliKnihovnu(el);
}

function ulozVolby() { uloziste.pis(VOLBY, { zalozka: k.zalozka, filtr: k.filtr }); }

function zalozkyHtml() {
  const p = D.pocty(stav.knihovna);
  return segment(D.ZALOZKY.map((z) => [z[0], z[1], stav.knihovna ? p[z[0]] : null]), k.zalozka, 'data-kn-zalozka', 'Část knihovny');
}

function filtryHtml() {
  const d = stav.knihovna;
  const z = k.zalozka;
  if (!d || !(z === 'reserse' ? D.reserse(d).length : D.pocty(d)[z])) return '';
  const p = D.pocty(d).stavy[z];
  const volbyFiltru = z === 'reserse' ? [['vse', 'Vše', p.vse], ['bez', 'Nepřečtené', p.vse - p.hotovo], ['hotovo', 'Přečtené', p.hotovo]]
    : [['vse', 'Vše', p.vse]].concat(D.nazvyStavu(z).map((s) => [s[0], s[1], p[s[0]]]));
  return segment(volbyFiltru, k.filtr[z], 'data-kn-filtr', 'Filtr podle mého stavu');
}

function obsahHtml() {
  const d = stav.knihovna;
  if (!d) return '<section class="card">' + (stav.chyby.knihovna ? chybaHtml(stav.chyby.knihovna, 'data-kn-znovu') : kostra(5)) + '</section>';
  const z = k.zalozka;
  const ceka = D.cekajici(d, z, k.dotaz);
  let h = '';
  if (z === 'reserse') {
    const seznam = D.reserseZalozky(d, k.dotaz, k.filtr.reserse);
    if (ceka.length || seznam.length) h = '<ul class="kn-reserse-seznam">' + ceka.map(cekajiciRadekHtml).join('') + seznam.map(reserseRadekHtml).join('') + '</ul>';
  } else {
    const seznam = D.kartyZalozky(d, z, k.filtr[z], k.dotaz);
    if (ceka.length || seznam.length) h = '<ul class="kn-mrizka">' + ceka.map(cekajiciKartaHtml).join('') + seznam.map(kartaHtml).join('') + '</ul>';
  }
  if (!h) h = prazdneHtml(z, d);
  if (stav.chyby.knihovna) {
    h = '<p class="kn-pozn kn-pozn--chyba">' + IKONY.pozor + '<span>Nepodařilo se obnovit: ' + esc(stav.chyby.knihovna.message) + '</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-kn-znovu>Zkusit znovu</button></p>' + h;
  }
  const chybne = d.chybne || [];
  if (chybne.length) {
    h += '<p class="kn-pozn">' + IKONY.info + '<span>' + chybne.length + ' ' + tvar(chybne.length, 'soubor', 'soubory', 'souborů') + ' v knihovně ' +
      tvar(chybne.length, 'má', 'mají', 'má') + ' chybu a ' + tvar(chybne.length, 'není', 'nejsou', 'není') + ' vidět: ' + esc(chybne.slice(0, 3).join(', ')) + '</span></p>';
  }
  return h;
}

function prazdneHtml(z, d) {
  const nic = z === 'reserse' ? !D.reserse(d).length : !D.pocty(d)[z];
  if (!nic || k.dotaz) {
    return '<section class="card"><div class="prazdne prazdne--velke"><i class="kruh kruh--knihovna">' + IKONY.hledat + '</i><b>Nic tu neodpovídá</b>' +
      '<span>' + (k.dotaz ? 'Hledáno „' + esc(k.dotaz) + '“. ' : '') + 'Zkus jiný filtr, nebo to přidej – Claude připraví přehled.</span>' +
      '<span class="kn-prazdne__akce"><button type="button" class="btn btn--ghost" data-kn-filtr-vse>Zrušit filtr</button>' +
      (k.dotaz ? '<button type="button" class="btn btn--primary" data-kn-pridat data-kn-druh="' + (z === 'knihy' ? 'kniha' : z === 'reserse' ? 'reserse' : 'film') +
        '" data-kn-text="' + esc(k.dotaz) + '">' + IKONY.plus + '<span>Přidat „' + esc(k.dotaz) + '“</span></button>' : '') + '</span></div></section>';
  }
  const t = { filmy: ['Zatím tu není žádný film ani seriál', 'Napiš název a Claude připraví přehled – o čem to je bez spoilerů, hodnocení, zajímavosti a kde to sledovat.', 'film', 'Přidat film'],
    knihy: ['Zatím tu není žádná kniha', 'Napiš název a Claude připraví přehled – o čem kniha je, autor, série a pořadí čtení.', 'kniha', 'Přidat knihu'],
    reserse: ['Zatím žádná rešerše', 'Zeptej se na cokoli, co tě zajímá – Claude projde zdroje a připraví přehled, ze kterého se něco naučíš.', 'reserse', 'Zeptat se'] }[z];
  return '<section class="card"><div class="prazdne prazdne--velke"><i class="kruh kruh--knihovna">' + IKONY.knihovna + '</i><b>' + t[0] + '</b><span>' + t[1] + '</span>' +
    '<button type="button" class="btn btn--primary" data-kn-pridat data-kn-druh="' + t[2] + '">' + IKONY.plus + '<span>' + t[3] + '</span></button></div></section>';
}

/** Plakát / obálka s pevným poměrem 2 : 3 (nic neposkočí); pod ním zástupná plocha s iniciálou – vidět, dokud se obrázek
 *  nenačte, a místo obrázku, který nejde načíst (posluchač chyby níž ho odebere). */
function obrazekHtml(url, nazev, trida) {
  const u = D.bezpecnaUrl(url);
  const img = u && !k.chybneObrazky.has(u) ? '<img src="' + esc(u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '';
  return '<span class="kn-obr ' + (trida || '') + '" style="--h:' + odstin(nazev) + '" aria-hidden="true"><b>' + esc(D.iniciala(nazev)) + '</b>' + img + '</span>';
}

function stavTag(druh, st) { return st ? '<span class="tag ' + TRIDA_STAVU[st] + '">' + esc(D.nazevStavu(druh, st)) + '</span>' : ''; }

function kartaHtml(x) {
  const d = stav.knihovna;
  const m = D.moje(d, x.id);
  const meta = D.metaKarty(x);
  const prvni = (x.hodnoceni || [])[0];
  const hodn = m.hodnoceni || prvni ? '<button type="button" class="kn-hodn" data-kn-otevri="' + esc(x.id) + '" data-kn-id="' + esc(x.id) + '"' + bubliny.karta('kn-hodnoceni') +
    ' aria-label="Hodnocení – ' + esc(x.nazev) + '">' + (m.hodnoceni ? '<span class="kn-hodn__ja">' + IKONY.hvezda + m.hodnoceni + '</span>' : '') +
    (prvni ? '<span class="kn-hodn__zdroj"><small>' + esc(prvni.zdroj) + '</small> ' + esc(prvni.hodnota) + '</span>' : '') + '</button>' : '';
  const nova = D.jeNova(d, x) ? '<span class="tag tag--limetka">nové</span>' : '';
  const st = stavTag(x.druh, m.stav);
  return '<li class="kn-karta" data-kn-karta="' + esc(x.id) + '">' +
    '<button type="button" class="kn-karta__otevri" data-kn-otevri="' + esc(x.id) + '" aria-label="' + esc(x.nazev + (meta ? ', ' + meta : '')) + '">' +
      obrazekHtml(x.obrazek && x.obrazek.url, x.nazev, 'kn-obr--karta') +
      '<span class="kn-karta__telo"><b class="kn-karta__nazev">' + esc(x.nazev) + '</b>' + (meta ? '<small class="kn-karta__meta">' + esc(meta) + '</small>' : '') +
      (x.kratce ? '<span class="kn-karta__kratce">' + esc(x.kratce) + '</span>' : '') + '</span></button>' +
    (nova || st || hodn ? '<span class="kn-karta__pata">' + nova + st + hodn + '</span>' : '') + '</li>';
}

function kdyZadano(p) { const t = D.cas(p.kdy); return t ? 'zadáno ' + kdyKratce(t) : ''; }
function cekaTag() { return '<span class="tag kn-ceka">' + IKONY.claude + 'Claude připravuje…</span>'; }

function cekajiciKartaHtml(p) {
  const w = (k.wiki[p.id] || {}).data;
  return '<li class="kn-karta kn-karta--ceka" data-kn-ceka="' + esc(p.id) + '">' +
    '<button type="button" class="kn-karta__otevri" data-kn-pozadavek="' + esc(p.id) + '" aria-label="' + esc(p.text + ' – Claude připravuje') + '">' +
      obrazekHtml(w && w.obrazek, p.text, 'kn-obr--karta') +
      '<span class="kn-karta__telo"><b class="kn-karta__nazev">' + esc(p.text) + '</b>' +
      '<small class="kn-karta__meta">' + esc([D.DRUHY[p.druh], kdyZadano(p)].filter(Boolean).join(' · ')) + '</small>' +
      (w ? '<span class="kn-karta__kratce">' + esc(w.popis ? velkePrvni(w.popis) : w.text) + '</span>' : '') + '</span></button>' +
    '<span class="kn-karta__pata">' + cekaTag() + '</span></li>';
}

function reserseRadekHtml(r) {
  const m = D.moje(stav.knihovna, r.id);
  const t = D.cas(r.pripraveno);
  return '<li data-kn-karta="' + esc(r.id) + '"><button type="button" class="kn-res" data-kn-otevri="' + esc(r.id) + '">' +
    '<span class="kn-res__ikona">' + IKONY.knihovna + '</span>' +
    '<span class="kn-res__text"><b>' + esc(r.nazev) + '</b>' + (r.kratce ? '<small>' + esc(r.kratce) + '</small>' : '') +
      '<span class="kn-res__meta">' + (t ? '<em class="cisla">' + esc(dm(t)) + '</em>' : '') + (r.stitky || []).slice(0, 3).map((s) => '<span class="tag tag--seda">' + esc(s) + '</span>').join('') +
      (m.stav === 'hotovo' ? '<span class="tag tag--ok">přečteno</span>' : D.jeNova(stav.knihovna, r) ? '<span class="tag tag--limetka">nové</span>' : '') + '</span></span>' +
    IKONY.vpravo + '</button></li>';
}

function cekajiciRadekHtml(p) {
  return '<li data-kn-ceka="' + esc(p.id) + '"><button type="button" class="kn-res kn-res--ceka" data-kn-pozadavek="' + esc(p.id) + '">' +
    '<span class="kn-res__ikona">' + IKONY.claude + '</span>' +
    '<span class="kn-res__text"><b>' + esc(p.text) + '</b><span class="kn-res__meta">' + cekaTag() + '<em>' + esc(kdyZadano(p)) + '</em></span></span>' +
    IKONY.vpravo + '</button></li>';
}

// ---------------------------------------------------------------- detail karty

/** Otevře kartu nebo rešerši podle id (i z hledání a ze „Související“ – nový panel nad předchozím, Zpět vrátí). */
export function otevriPolozku(id) {
  const n = D.najdi(stav.knihovna, id);
  if (!n) {
    if (!k.nacteno) nactiKnihovnu().then(() => { if (D.najdi(stav.knihovna, id)) otevriPolozku(id); });
    else toast('V knihovně to není – obnov stránku.', true);
    return;
  }
  if (n.typ === 'reserse') { otevriReserisi(id); return; }
  const pid = 'kn-d:' + id;
  if (jeOtevreny(pid)) { obnovPanel(pid); return; }
  otevriPanel({
    id: pid, trida: 'panel-bocni panel-knihovna', titul: () => ((D.najdi(stav.knihovna, id) || {}).x || {}).nazev || 'Knihovna',
    vpravo: () => {
      const x = (D.najdi(stav.knihovna, id) || {}).x;
      const o = x ? D.odkazDatabaze(x) : null;
      return o && o.url ? '<a class="btn btn--ikona" href="' + esc(o.url) + '" target="_blank" rel="noopener noreferrer" aria-label="Otevřít ' + esc(o.nazev) + '">' + IKONY.odkaz + '</a>' : '';
    },
    vykresli: () => detailHtml(id),
    poOtevreni: (el) => { hlidejPoznamku(el); el.focus({ preventScroll: true }); },
    priZavreni: ulozPoznamkuHned
  });
}

function hlidejPoznamku(el) {
  el.addEventListener('focusout', (e) => { if (e.target.matches && e.target.matches('[data-kn-poznamka]')) ulozPoznamkuHned(); });
}

const odstavce = (t) => String(t || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).map((s) => '<p>' + esc(s).replace(/\n/g, '<br>') + '</p>').join('');
const oddil = (nadpis, obsah, trida) => (obsah ? '<section class="kn-oddil' + (trida ? ' ' + trida : '') + '"><h4>' + nadpis + '</h4>' + obsah + '</section>' : '');
/** „2026-10-11“ → „11. 10. 2026“ */
function datumZIso(s) { const t = D.cas(s); return t ? dm(t) + ' ' + new Date(t).getFullYear() : String(s || ''); }

function detailHtml(id) {
  const d = stav.knihovna;
  const n = D.najdi(d, id);
  if (!n || n.typ !== 'karta') return '<div class="prazdne">Karta už v knihovně není.</div>';
  const x = n.x, m = D.moje(d, id);
  const video = x.druh !== 'kniha';
  const hlava = [D.DRUHY[x.druh], D.rokKarty(x), x.druh === 'kniha' && x.stran ? x.stran + ' stran' : x.delka, x.zeme].filter(Boolean).join(' · ');
  const hodnoceni = (x.hodnoceni || []).map((h) => {
    const u = D.bezpecnaUrl(h.url);
    const obsah = '<small>' + esc(h.zdroj) + '</small> <b class="cisla">' + esc(h.hodnota) + '</b>';
    return u ? '<a class="kn-hodnoceni__polozka" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + obsah + IKONY.odkaz + '</a>'
      : '<span class="kn-hodnoceni__polozka">' + obsah + '</span>';
  }).join('');
  let h = '<article class="kn-detail" data-oblast="knihovna">' +
    '<header class="kn-hlava">' + obrazekHtml(x.obrazek && x.obrazek.url, x.nazev, 'kn-obr--detail') +
      '<div class="kn-hlava__text"><p class="kn-hlava__druh">' + esc(hlava) + '</p><h3>' + esc(x.nazev) + '</h3>' +
        (x.original && x.original !== x.nazev ? '<p class="kn-hlava__orig">' + esc(x.original) + '</p>' : '') +
        (hodnoceni ? '<div class="kn-hodnoceni">' + hodnoceni + '</div>' : '') +
        ((x.zanry || []).length ? '<div class="kn-zanry">' + x.zanry.map((z) => '<span class="tag tag--seda">' + esc(z) + '</span>').join('') + '</div>' : '') +
      '</div></header>' +
    (x.kratce ? '<p class="kn-kratce">' + esc(x.kratce) + '</p>' : '') +
    mojeHtml(x.id, x.druh, m, true);
  if ((x.tvurci || []).length) {
    h += oddil('Tvůrci', '<dl class="kn-tvurci">' + x.tvurci.map((t) => '<div><dt>' + esc(velkePrvni(t.role)) + '</dt><dd>' + esc(t.jmena.join(', ')) + '</dd></div>').join('') + '</dl>');
  }
  h += oddil(video ? 'O čem to je' : 'O čem kniha je', odstavce(x.obsah));
  h += oddil('Proč to stojí za to', odstavce(x.proc), 'kn-oddil--proc');
  if (x.serie) h += serieHtml(x.serie);
  h += oddil('Zajímavosti', (x.zajimavosti || []).length ? '<ul class="kn-body">' + x.zajimavosti.map((z) => '<li>' + esc(z) + '</li>').join('') + '</ul>' : '');
  h += oddil('Skutečnost vs. ' + (video ? 'film' : 'kniha'), odstavce(x.skutecnost));
  h += oddil('Ocenění', (x.oceneni || []).length ? '<ul class="kn-body kn-body--oceneni">' + x.oceneni.map((z) => '<li>' + esc(z) + '</li>').join('') + '</ul>' : '');
  if (x.kdeSledovat) {
    h += oddil(video ? 'Kde sledovat' : 'Kde sehnat', '<p>' + esc(x.kdeSledovat.text) + '</p>' +
      (x.kdeSledovat.overeno ? '<p class="kn-overeno">' + IKONY.fajfka + '<span>ověřeno ' + esc(datumZIso(x.kdeSledovat.overeno)) + '</span></p>' : ''));
  }
  h += souvisiHtml(x);
  h += odkazyHtml(x.odkazy, x.zdroje);
  h += pataHtml(x);
  return h + '</article>';
}

function serieHtml(s) {
  const celkem = D.celkemMinut(s.dily);
  const dily = (s.dily || []).map((dil, i) => '<li><span class="kn-serie__c cisla">' + (i + 1) + '</span><span class="kn-serie__text"><b>' + esc(dil.nazev) + '</b>' +
    '<small>' + esc([dil.original && dil.original !== dil.nazev ? dil.original : '', dil.rok, dil.delka].filter(Boolean).join(' · ')) + '</small>' +
    (dil.pozn ? '<em>' + esc(dil.pozn) + '</em>' : '') + '</span></li>').join('');
  return oddil('Série' + (s.nazev ? ' · ' + esc(s.nazev) : ''),
    (s.poradi ? '<p class="kn-poradi">' + IKONY.info + '<span><b>Doporučené pořadí:</b> ' + esc(s.poradi) + '</span></p>' : '') +
    (dily ? '<ol class="kn-serie">' + dily + '</ol>' : '') +
    (celkem ? '<p class="kn-serie__celkem">' + (s.dily.length) + ' ' + tvar(s.dily.length, 'díl', 'díly', 'dílů') + ' · celkem ' + esc(trvani(celkem * 60e3)) + '</p>' : ''));
}

function souvisiHtml(x) {
  const s = D.souvisejici(stav.knihovna, x);
  if (!s.length) return '';
  return oddil('Související', '<div class="kn-souvisi">' + s.map((o) => (o.existuje
    ? '<button type="button" class="kn-souvisi__polozka" data-kn-otevri="' + esc(o.id) + '"><span class="kn-souvisi__ikona">' + IKONY.knihovna + '</span>' +
      '<span><b>' + esc(o.nazev) + '</b>' + (o.proc ? '<small>' + esc(o.proc) + '</small>' : '') + '</span>' + IKONY.vpravo + '</button>'
    : '<div class="kn-souvisi__polozka kn-souvisi__polozka--neni"><span class="kn-souvisi__ikona">' + IKONY.plus + '</span>' +
      '<span><b>' + esc(velkePrvni(o.nazev)) + '</b><small>' + esc((o.proc ? o.proc + ' · ' : '') + 'v knihovně zatím není') + '</small></span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-kn-pridat data-kn-druh="' + esc(D.druhZId(o.id)) + '" data-kn-text="' + esc(velkePrvni(o.nazev)) + '">Přidat</button></div>'))
    .join('') + '</div>');
}

function odkazyHtml(odkazy, zdroje) {
  const o = (odkazy || []).filter((x) => D.bezpecnaUrl(x.url));
  const z = (zdroje || []).filter((x) => D.bezpecnaUrl(x.url));
  if (!o.length && !z.length) return '';
  return oddil('Odkazy a zdroje', (o.length ? '<div class="kn-odkazy">' + o.map((x) => '<a class="chip" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' +
      esc(x.nazev) + IKONY.odkaz + '</a>').join('') + '</div>' : '') +
    (z.length ? '<details class="kn-zdroje"><summary>Zdroje (' + z.length + ')</summary><ol>' + z.map((x) => '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' +
      esc(x.nazev) + '</a></li>').join('') + '</ol></details>' : ''));
}

function pataHtml(x) {
  const t = D.cas(x.pripraveno);
  return '<footer class="kn-pata">' + IKONY.claude + '<span>Připravil Claude' + (t ? ' ' + esc(dm(t) + ' ' + new Date(t).getFullYear()) : '') + '</span>' +
    ((x.stitky || []).length ? '<span class="kn-pata__stitky">' + x.stitky.map((s) => '<span class="tag tag--seda">' + esc(s) + '</span>').join('') + '</span>' : '') + '</footer>';
}

/** Můj stav (segment – klepnutí na zvolený ho zruší), hvězdy 1–5 (klepnutí na zvolenou je zruší), poznámka (uloží se sama). */
function mojeHtml(id, druh, m, hvezdy) {
  const poznamka = m.poznamka || '';
  return '<section class="kn-moje" aria-label="Můj stav">' +
    '<div class="kn-moje__radek"><div class="segment" role="group" aria-label="Můj stav">' + D.nazvyStavu(druh)
      .filter((s) => druh !== 'reserse' || s[0] === 'hotovo')
      .map((s) => '<button type="button" class="chip" data-kn-stav="' + s[0] + '" data-kn-id="' + esc(id) + '" aria-pressed="' + (m.stav === s[0]) + '">' +
        (m.stav === s[0] ? IKONY.fajfka : '') + esc(s[1]) + '</button>').join('') + '</div>' +
    (hvezdy ? '<div class="kn-hvezdy" role="group" aria-label="Moje hodnocení">' + [1, 2, 3, 4, 5].map((i) => '<button type="button" class="kn-hvezda' +
      (m.hodnoceni >= i ? ' plna' : '') + '" data-kn-hvezdy="' + i + '" data-kn-id="' + esc(id) + '" aria-pressed="' + (m.hodnoceni === i) + '" aria-label="' + i + ' z 5">' +
      IKONY.hvezda + '</button>').join('') + '</div>' : '') + '</div>' +
    '<label class="kn-poznamka"><span class="label">Moje poznámka</span>' +
      '<textarea class="field" rows="2" maxlength="2000" data-kn-poznamka="' + esc(id) + '" placeholder="' + (druh === 'reserse' ? 'Co si chci zapamatovat…' :
        'Co se mi líbilo, s kým se dívat, komu doporučit…') + '">' + (poznamka.charAt(0) === '\n' ? '\n' : '') + esc(poznamka) + '</textarea>' +
      '<small class="kn-poznamka__stav" data-kn-poznamka-stav="' + esc(id) + '" aria-live="polite"></small></label>' +
  '</section>';
}

// ---------------------------------------------------------------- čtečka rešerše

function otevriReserisi(id) {
  const pid = 'kn-r:' + id;
  if (jeOtevreny(pid)) { obnovPanel(pid); return; }
  otevriPanel({
    id: pid, trida: 'panel-bocni panel-knihovna panel-kn-reserse', titul: () => ((D.najdi(stav.knihovna, id) || {}).x || {}).nazev || 'Rešerše',
    vykresli: () => reserseHtml(id),
    poOtevreni: (el) => { hlidejPoznamku(el); el.focus({ preventScroll: true }); },
    priZavreni: ulozPoznamkuHned
  });
  nactiReserisi(id);
}

/** Celá rešerše z motoru – jen když ji zařízení nemá, nebo ji Claude mezitím přepsal (jiné „připraveno“ v indexu). */
function nactiReserisi(id) {
  const r = k.reserse[id];
  const idx = D.najdi(stav.knihovna, id);
  if (r && (r.nacita || (r.data && (!idx || r.data.pripraveno === idx.x.pripraveno)))) return;
  k.reserse[id] = Object.assign({}, r, { nacita: true, chyba: null });
  volej('knihovnaReserse', { id })
    .then((data) => { k.reserse[id] = { data, kdy: Date.now() }; ulozReserse(); })
    .catch((e) => { k.reserse[id] = Object.assign({}, k.reserse[id], { nacita: false, chyba: e }); })
    .then(() => { if (jeOtevreny('kn-r:' + id)) obnovPanel('kn-r:' + id); });
}

function ulozReserse() {
  const ids = Object.keys(k.reserse).filter((id) => k.reserse[id].data).sort((a, b) => (k.reserse[b].kdy || 0) - (k.reserse[a].kdy || 0)).slice(0, MAX_RESERSI_V_ZARIZENI);
  const o = {};
  ids.forEach((id) => { o[id] = { data: k.reserse[id].data, kdy: k.reserse[id].kdy }; });
  if (!uloziste.pis(ULOZISTE_RESERSI, o)) uloziste.smaz(ULOZISTE_RESERSI);
}

function reserseHtml(id) {
  const r = k.reserse[id] || {};
  const x = r.data;
  if (!x) {
    return r.chyba ? chybaHtml(r.chyba, 'data-kn-reserse-znovu="' + esc(id) + '"') : kostra(8);
  }
  const m = D.moje(stav.knihovna, id);
  const t = D.cas(x.pripraveno);
  let h = '<article class="kn-detail kn-reserse" data-oblast="knihovna">' +
    '<p class="kn-hlava__druh">Rešerše' + (t ? ' · ' + esc(dm(t) + ' ' + new Date(t).getFullYear()) : '') + '</p><h3 class="kn-reserse__nazev">' + esc(x.nazev) + '</h3>' +
    (x.otazka ? '<p class="kn-otazka">' + IKONY.otazka + '<span>' + esc(x.otazka) + '</span></p>' : '') +
    (x.kratce ? '<div class="kn-kratce kn-kratce--reserse"><b>Krátce</b>' + odstavce(x.kratce) + '</div>' : '') +
    ((x.cisla || []).length ? '<div class="kn-cisla">' + x.cisla.map((c) => '<div><b class="cisla">' + esc(c.hodnota) + '</b><small>' + esc(c.co || '') + '</small></div>').join('') + '</div>' : '');
  (x.sekce || []).forEach((s) => {
    h += oddil(esc(s.nadpis || ''), (s.odstavce || []).map((o) => odstavce(o)).join('') +
      ((s.body || []).length ? '<ul class="kn-body">' + s.body.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : ''));
  });
  if ((x.casovaOsa || []).length) {
    h += oddil('Časová osa', '<ol class="kn-osa">' + x.casovaOsa.map((c) => '<li><b class="cisla">' + esc(c.kdy) + '</b><span>' + esc(c.co) + '</span></li>').join('') + '</ol>');
  }
  if ((x.pojmy || []).length) {
    h += oddil('Pojmy', '<div class="kn-pojmy">' + x.pojmy.map((p) => '<details><summary>' + esc(p.pojem) + '</summary><p>' + esc(p.vysvetleni || '') + '</p></details>').join('') + '</div>');
  }
  if ((x.dalsiOtazky || []).length) {
    h += oddil('Další otázky', '<p class="kn-napoveda">Klepnutím pošleš otázku Claudovi – připraví k ní novou rešerši.</p><div class="kn-otazky">' +
      x.dalsiOtazky.map((q) => '<button type="button" class="kn-otazky__polozka" data-kn-otazka="' + esc(q) + '">' + IKONY.otazka + '<span>' + esc(q) + '</span>' +
        '<em>' + IKONY.plus + 'Zeptat se</em></button>').join('') + '</div>');
  }
  h += mojeHtml(id, 'reserse', m, false);
  h += souvisiHtml(x);
  h += odkazyHtml([], x.zdroje);
  h += pataHtml(x);
  return h + '</article>';
}

// ---------------------------------------------------------------- čekající požadavek

function otevriPozadavek(id) {
  const pid = 'kn-p:' + id;
  if (jeOtevreny(pid)) { obnovPanel(pid); return; }
  otevriPanel({
    id: pid, trida: 'panel-okno panel-kn-pozadavek', titul: 'Claude připravuje',
    vykresli: () => pozadavekHtml(id),
    paticka: () => '<div class="akce">' + (D.pozadavky(stav.knihovna).some((p) => p.id === id)
      ? '<button type="button" class="btn btn--ghost btn--nebezpeci" data-kn-zrusit="' + esc(id) + '">' + IKONY.smazat + '<span>Zrušit požadavek</span></button>' : '') +
      '<button type="button" class="btn btn--cerne" data-zavrit-panel>Zavřít</button></div>'
  });
}

function pozadavekHtml(id) {
  const p = D.pozadavky(stav.knihovna).find((x) => x.id === id);
  if (!p) {
    const hotova = D.karty(stav.knihovna).concat(D.reserse(stav.knihovna)).find((x) => x.pozadavek === id);
    return '<div class="prazdne">' + (hotova ? 'Hotovo – Claude připravil „' + esc(hotova.nazev) + '“. <button type="button" class="odkaz" data-kn-otevri="' + esc(hotova.id) + '">Otevřít</button>'
      : 'Požadavek už tu není (vyřízený nebo zrušený).') + '</div>';
  }
  const w = (k.wiki[id] || {}).data;
  const t = D.cas(p.kdy);
  const radek = (ikona, text, vpravo) => '<li>' + ikona + '<span>' + esc(text) + '</span>' + (vpravo ? '<em>' + esc(vpravo) + '</em>' : '') + '</li>';
  return '<div class="kn-pozadavek">' + cekaTag() + '<h3>' + esc(p.text) + '</h3>' +
    '<ul class="okno__radky">' + radek(IKONY.knihovna, 'Co', NAZEV_DRUHU[p.druh]) + (t ? radek(IKONY.cas, 'Zadáno', velkePrvni(datumDlouhe(t)) + ' ' + hhmm(t)) : '') +
      radek(IKONY.claude, 'Hotovo bývá', 'do půl hodiny (7–22 h)') + '</ul>' +
    (w ? '<div class="kn-wiki">' + obrazekHtml(w.obrazek, w.nazev, 'kn-obr--wiki') + '<div class="kn-wiki__text"><small>Mezitím z Wikipedie</small><b>' + esc(w.nazev) + '</b>' +
      (w.popis ? '<em>' + esc(w.popis) + '</em>' : '') + '<p>' + esc(w.text) + '</p>' +
      (w.odkaz ? '<a href="' + esc(w.odkaz) + '" target="_blank" rel="noopener noreferrer">Celý článek na Wikipedii' + IKONY.odkaz + '</a>' : '') + '</div></div>' : '') +
    '<p class="kn-napoveda">' + esc(PRIDAT[p.druh][2]) + '</p></div>';
}

// ---------------------------------------------------------------- náhled z Wikipedie (jen čekající film, seriál, kniha…)

function wikiNahledy() {
  if (jeDemo() || !stav.knihovna) return; // ukázka nic nikam neposílá
  const ted = Date.now();
  D.pozadavky(stav.knihovna).filter((p) => !p.docasny).filter((p) => {
    const w = k.wiki[p.id];
    return !w || (w.chyba && ted - w.chyba > WIKI_ZNOVU_PO);
  }).slice(0, MAX_WIKI).forEach((p) => {
    k.wiki[p.id] = { nacita: true };
    nactiWiki(D.wikiAdresy(p.druh, p.text)).then((data) => {
      k.wiki[p.id] = data === undefined ? { chyba: Date.now() } : { data };
      ulozWiki();
      if (data) { prekresliStranku(); if (jeOtevreny('kn-p:' + p.id)) obnovPanel('kn-p:' + p.id); }
    });
  });
}

/** První shrnutí, které sedí (článek, ne rozcestník); null = nic, undefined = síť nejde (zkusit později). */
async function nactiWiki(adresy) {
  for (const u of adresy) {
    let r;
    try { r = await fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } }); } catch (e) { return undefined; }
    if (!r.ok) continue;
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    const w = D.zWiki(j);
    if (w) return w;
  }
  return null;
}

function ulozWiki() {
  const o = {};
  Object.keys(k.wiki).forEach((id) => { if (k.wiki[id] && 'data' in k.wiki[id]) o[id] = k.wiki[id].data; });
  uloziste.pis(ULOZISTE_WIKI, o);
}

// ---------------------------------------------------------------- přidání

/** Okno Přidat do knihovny: druh (film, seriál, kniha, rešerše) a název / otázka → požadavek pro Clauda. */
export function otevriPridani(druh, text) {
  k.pridat = { druh: NAZEV_DRUHU[druh] ? druh : k.zalozka === 'knihy' ? 'kniha' : k.zalozka === 'reserse' ? 'reserse' : 'film', text: text || '' };
  if (jeOtevreny('kn-pridat')) { obnovPanel('kn-pridat'); return; }
  otevriPanel({
    id: 'kn-pridat', trida: 'panel-okno panel-kn-pridat', titul: 'Přidat do knihovny', vykresli: pridatHtml,
    paticka: () => '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
      '<button type="button" class="btn btn--primary" data-kn-pridat-odeslat>' + IKONY.plus + '<span>Přidat</span></button></div>',
    poOtevreni: zamerPridani
  });
}

function zamerPridani(el) {
  const i = (el || elementPanelu('kn-pridat') || document).querySelector('[data-kn-pridat-text]');
  if (i) { i.focus({ preventScroll: true }); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* nic */ } }
}

function pridatHtml() {
  const p = k.pridat, t = PRIDAT[p.druh];
  return '<div class="kn-pridat">' +
    '<div class="segment kn-pridat__druhy" role="group" aria-label="Co přidat">' + Object.keys(NAZEV_DRUHU).map((dr) => '<button type="button" class="chip" data-kn-druh="' + dr +
      '" aria-pressed="' + (p.druh === dr) + '">' + esc(NAZEV_DRUHU[dr]) + '</button>').join('') + '</div>' +
    '<label class="kn-pridat__pole"><span class="label">' + esc(t[0]) + '</span><input class="field" data-kn-pridat-text maxlength="300" autocomplete="off" ' +
      'enterkeyhint="send" placeholder="' + esc(t[1]) + '" value="' + esc(p.text) + '"></label>' +
    '<p class="kn-pridat__uz" data-kn-pridat-uz>' + uzJeHtml() + '</p>' +
    '<p class="kn-pridat__napoveda">' + IKONY.claude + '<span>' + esc(t[2]) + ' Bývá hotovo do půl hodiny (úloha schránky běží 7–22 h).</span></p></div>';
}

/** „V knihovně už je …“ – stejný název ve stejné části (přidat jde i tak, třeba jiný film stejného jména). */
function uzJeHtml() {
  const x = D.uzJe(stav.knihovna, k.pridat.druh, k.pridat.text);
  return x ? IKONY.info + '<span>V knihovně už je „' + esc(x.nazev) + '“' + (D.rokKarty(x) ? ' (' + esc(D.rokKarty(x)) + ')' : '') + '.</span>' +
    '<button type="button" class="odkaz" data-kn-otevri="' + esc(x.id) + '">Otevřít</button>' : '';
}

function odeslatPridani() {
  const el = elementPanelu('kn-pridat');
  const pole = el && el.querySelector('[data-kn-pridat-text]');
  const text = String(pole ? pole.value : k.pridat.text).replace(/\s+/g, ' ').trim();
  if (text.length < 2) { toast('Napiš název nebo téma.', true); if (pole) pole.focus(); return; }
  if (text.length > 300) { toast('Moc dlouhé – nejvýš 300 znaků.', true); return; }
  const druh = k.pridat.druh;
  k.pridat.text = '';
  zavriAPak(() => { pridej(druh, text); });
}

// ---------------------------------------------------------------- ovládání (app.js volá klik/vstup/klávesy, když je modul načtený)

/** Překreslí otevřené panely knihovny (ne okno Přidat a ne panel, ve kterém se zrovna píše). */
function obnovOtevrene() {
  document.querySelectorAll('#panely [data-panel^="kn-"]').forEach((el) => {
    const id = el.dataset.panel;
    if (id === 'kn-pridat') return;
    const a = document.activeElement;
    if (a && el.contains(a) && a.matches('textarea, input')) return;
    obnovPanel(id);
  });
}

export function klikKnihovna(el) {
  const ds = el.dataset;
  if (ds.knZalozka) { k.zalozka = ds.knZalozka; ulozVolby(); prekresliStranku(); return true; }
  if (ds.knFiltr) { k.filtr[k.zalozka] = ds.knFiltr; ulozVolby(); prekresliStranku(); return true; }
  if (el.hasAttribute('data-kn-filtr-vse')) {
    k.filtr[k.zalozka] = 'vse';
    k.dotaz = '';
    const pole = document.getElementById('kn-hledat');
    if (pole) pole.value = '';
    ulozVolby();
    prekresliStranku();
    return true;
  }
  if (el.hasAttribute('data-kn-znovu')) { stav.chyby.knihovna = null; nactiKnihovnu(); zmeneno(); return true; }
  if (ds.knReserseZnovu) { delete k.reserse[ds.knReserseZnovu]; nactiReserisi(ds.knReserseZnovu); obnovPanel('kn-r:' + ds.knReserseZnovu); return true; }
  if (el.hasAttribute('data-kn-pridat')) { otevriPridani(ds.knDruh, ds.knText); return true; } // i ze „Související“ – okno nad detailem
  if (ds.knDruh && el.closest('[data-panel="kn-pridat"]')) {
    const pole = el.closest('[data-panel="kn-pridat"]').querySelector('[data-kn-pridat-text]');
    k.pridat = { druh: ds.knDruh, text: pole ? pole.value : k.pridat.text };
    obnovPanel('kn-pridat');
    zamerPridani();
    return true;
  }
  if (el.hasAttribute('data-kn-pridat-odeslat')) { odeslatPridani(); return true; }
  if (ds.knOtevri) {
    const id = ds.knOtevri;
    // z okna Přidat („už je v knihovně“) nebo z čekajícího požadavku: nejdřív zavřít okno
    if (el.closest('[data-panel="kn-pridat"], .panel-kn-pozadavek')) zavriAPak(() => otevriPolozku(id)); else otevriPolozku(id);
    return true;
  }
  if (ds.knPozadavek) { otevriPozadavek(ds.knPozadavek); return true; }
  if (ds.knZrusit) { zrus(ds.knZrusit); return true; }
  if (ds.knStav && ds.knId) {
    const m = D.moje(stav.knihovna, ds.knId);
    ulozMoje(ds.knId, { stav: m.stav === ds.knStav ? '' : ds.knStav });
    return true;
  }
  if (ds.knHvezdy && ds.knId) {
    const n = Number(ds.knHvezdy);
    ulozMoje(ds.knId, { hodnoceni: D.moje(stav.knihovna, ds.knId).hodnoceni === n ? 0 : n });
    return true;
  }
  if (ds.knOtazka) { pridej('reserse', ds.knOtazka); return true; }
  return false;
}

export function vstupKnihovna(e) {
  const t = e.target;
  if (!t || !t.matches) return false;
  if (t.matches('[data-kn-hledat]')) { k.dotaz = t.value; prekresliStranku(); return true; }
  if (t.matches('[data-kn-pridat-text]')) {
    k.pridat.text = t.value;
    const uz = t.closest('.kn-pridat').querySelector('[data-kn-pridat-uz]');
    if (uz) uz.innerHTML = uzJeHtml();
    return true;
  }
  if (t.matches('[data-kn-poznamka]')) {
    const id = t.dataset.knPoznamka;
    if (k.poznamka && k.poznamka.id !== id) ulozPoznamkuHned();
    if (k.poznamka) clearTimeout(k.poznamka.casovac);
    k.poznamka = { id, text: t.value, casovac: setTimeout(ulozPoznamkuHned, ULOZIT_POZNAMKU_PO) };
    stavPoznamky(id, '');
    return true;
  }
  return false;
}

export function klavesaKnihovna(e) {
  const t = e.target;
  if (!t || !t.matches) return false;
  if (e.key === 'Enter' && t.matches('[data-kn-pridat-text]')) { e.preventDefault(); odeslatPridani(); return true; }
  if (e.key === 'Escape' && t.matches('[data-kn-hledat]') && t.value) { e.preventDefault(); t.value = ''; k.dotaz = ''; prekresliStranku(); return true; }
  return false;
}

// pravé tlačítko / podržení na dlaždici: můj stav, kopírovat název, otevřít ČSFD (Databázi knih); u čekajícího Zrušit
function nabidkaKnihovny(cil) {
  const li = cil.closest && cil.closest('#p-knihovna [data-kn-karta], #p-knihovna [data-kn-ceka]');
  if (!li) return null;
  if (li.dataset.knCeka) {
    const p = D.pozadavky(stav.knihovna).find((x) => x.id === li.dataset.knCeka);
    if (!p) return null;
    return { nadpis: p.text, polozky: [
      { ikona: IKONY.info, text: 'Podrobnosti', fn: () => otevriPozadavek(p.id) },
      { ikona: IKONY.kopirovat, text: 'Kopírovat text', fn: () => kopiruj(p.text) },
      { ikona: IKONY.smazat, text: 'Zrušit požadavek', fn: () => zrus(p.id), nebezpeci: true }] };
  }
  const n = D.najdi(stav.knihovna, li.dataset.knKarta);
  if (!n) return null;
  const x = n.x, id = x.id, m = D.moje(stav.knihovna, id);
  const druh = n.typ === 'reserse' ? 'reserse' : x.druh;
  const ikony = { chci: IKONY.plus, rozpracovane: druh === 'kniha' || druh === 'reserse' ? IKONY.knihovna : IKONY.prehrat, hotovo: IKONY.fajfka };
  const polozky = D.nazvyStavu(druh).filter((s) => druh !== 'reserse' || s[0] === 'hotovo').map((s) => ({
    ikona: ikony[s[0]], text: m.stav === s[0] ? 'Zrušit „' + s[1] + '“' : s[1], fn: () => ulozMoje(id, { stav: m.stav === s[0] ? '' : s[0] }) }));
  polozky.push({ ikona: IKONY.kopirovat, text: 'Kopírovat název', fn: () => kopiruj(x.nazev) });
  if (n.typ === 'karta') {
    const o = D.odkazDatabaze(x);
    if (o.url) polozky.push({ ikona: IKONY.odkaz, text: 'Otevřít ' + o.nazev, fn: () => window.open(o.url, '_blank', 'noopener,noreferrer') });
  }
  return { nadpis: x.nazev, polozky };
}

function kopiruj(text) {
  const hotovo = () => toast('Zkopírováno: ' + text);
  try {
    navigator.clipboard.writeText(text).then(hotovo, () => toast('Kopírování tady nejde.', true));
  } catch (e) { toast('Kopírování tady nejde.', true); }
}

// vyjetá karta u hodnocení na dlaždici: všechna hodnocení s odkazy, moje hvězdy a poznámka
function kartaHodnoceni(el) {
  const n = D.najdi(stav.knihovna, el.dataset.knId);
  if (!n || n.typ !== 'karta') return '';
  const x = n.x, m = D.moje(stav.knihovna, x.id);
  const prvni = (x.hodnoceni || [])[0];
  let h = bubliny.hlavaKarty(IKONY.hvezda, 'Hodnocení · ' + x.nazev,
    m.hodnoceni ? m.hodnoceni + '<small>/5</small>' : prvni ? esc(prvni.hodnota) : '–', m.hodnoceni ? 'moje hvězdy' : prvni ? esc(prvni.zdroj) : '');
  if ((x.hodnoceni || []).length) {
    h += '<div class="bk-oddil"><ul class="kn-bk-hodnoceni">' + x.hodnoceni.map((o) => {
      const u = D.bezpecnaUrl(o.url);
      return '<li><span>' + esc(o.zdroj) + '</span><b class="cisla">' + esc(o.hodnota) + '</b>' +
        (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" aria-label="Otevřít ' + esc(o.zdroj) + '">' + IKONY.odkaz + '</a>' : '<i></i>') + '</li>';
    }).join('') + '</ul></div>';
  }
  if (m.poznamka) h += '<div class="bk-oddil"><p class="kn-bk-poznamka">' + esc(m.poznamka) + '</p></div>';
  return h + bubliny.pataKarty([['data-kn-otevri="' + esc(x.id) + '"', 'Otevřít kartu', true]]);
}

// ---------------------------------------------------------------- při načtení modulu

nactiZUloziste();
nabidka.pripoj(nabidkaKnihovny);
bubliny.registruj('kn-hodnoceni', kartaHodnoceni);
// obrázek, který nejde načíst (adresa zmizela, bez sítě): pryč – zůstane zástupná plocha s iniciálou, příště se nezkouší
document.addEventListener('error', (e) => {
  const t = e.target;
  if (!t || t.tagName !== 'IMG' || !t.parentNode || !t.parentNode.classList || !t.parentNode.classList.contains('kn-obr')) return;
  k.chybneObrazky.add(t.getAttribute('src'));
  t.remove();
}, true);
