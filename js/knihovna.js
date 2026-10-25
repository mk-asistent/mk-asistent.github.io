// Knihovna (Michal 11. 10.: „přidat něco jako přehled informací k filmu či knize … jednoduché přehledné informace, co se
// dají získat na internetu … to stejné další stránku s rešerší k různým věcem – chtěl bych se tak vzdělávat a mít takovou
// svoji knihovnu“). Záložky Filmy (filmy i seriály) · Knihy · Rešerše; dlaždice s plakátem / obálkou (bez obrázku zástupná
// plocha s iniciálou). Karta a rešerše jsou od 12. 10. podstránka (Michal: „jako klasickou stránku, ne jen pás vpravo“ – HTML
// v js/knihovna_stranka.js): adresa #knihovna/<id>, Zpět prohlížeče / gesto vrátí seznam se zachovaným posunem a filtrem,
// související karta otevře další podstránku (Zpět vrátí předchozí), odkaz funguje i po znovunačtení. Můj stav, hvězdy a
// poznámka. „+“ = požadavek pro Clauda: karta se hned ukáže jako „Claude připravuje…“ (u filmu a knihy s náhledem
// z Wikipedie) a plná je, až ji Claude připraví (úloha schránky 7–22 h po 30 min).
// Data: motor (knihovna, knihovnaReserse, knihovnaPridat, knihovnaMoje, knihovnaZrusit → CLAUDE_SCHRANKA/KNIHOVNA, formát
// ve skillu osobni-knihovna); v zařízení asistent.data.knihovna (rychlý start, bez sítě). Kopie na serveru (Firebase)
// knihovna nemá – čte se z motoru, jen když je stránka otevřená; jiná zařízení se dozví o změně ze značky změn (zmeny).
// Modul načte app.js až na stránce Knihovna (import()) – start aplikace na něj nečeká. Čisté funkce: js/knihovna_data.js.
// Historie: podstránka = vlastní záznam (pushState s adresou); panely (js/panely.js) dávají záznamy se stejnou adresou,
// takže Zpět nejdřív zavře okno nad stránkou a teprve pak stránku. Odchod do jiné sekce adresu uklidí (mimoKnihovnu).
// Záložky podstránky (Michal 12. 10. večer: „nedělej to jako prohlížení celé na jedné stránce s tak velkým rolováním … když
// kliknu na té liště, ať se mi to zobrazí jen k té dané věci“): pás nahoře = role tablist, klepnutí ukáže jen ten panel (bez
// posunu dolů), adresa #knihovna/<id>/<záložka> přes replaceState (Zpět vede rovnou na seznam, odkaz i znovunačtení otevře
// tu záložku), šipky ←/→ přepínají záložky, v Zákulisí / Obsahu sekce po jedné (podzáložky, ↑/↓). Na jiné než první záložce
// je hlavička zúžená (kn-st--kompakt) – obsah záložky má skoro celou výšku okna.

import { stav, zmeneno, umiMotor, prejdi } from './stav.js';
import { volej, jeDemo } from './api.js';
import { esc, uloziste, kdyKratce, tvar, dm, hhmm, datumDlouhe, velkePrvni } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, kostra, chybaHtml, segment } from './ui.js';
import { otevriPanel, zavriPanel, obnovPanel, elementPanelu, jeOtevreny, zavriAPak, horniPanel } from './panely.js';
import * as nabidka from './nabidka.js';
import * as bubliny from './bubliny.js';
import * as D from './knihovna_data.js';
import * as S from './knihovna_stranka.js';

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
  filtr: Object.assign({ filmy: 'vse', knihy: 'vse', reserse: 'vse', ai: 'vse' }, volby.filtr),
  // Rešerše AI: po týdnech (výchozí), po dnech, nebo jednotlivě (Michal 25. 10.)
  pohledAi: ['tydny', 'dny', 'jednotlive'].indexOf(volby.pohledAi) >= 0 ? volby.pohledAi : 'tydny',
  dotaz: '',
  nacteno: false,         // v tomhle běhu aplikace už se knihovna četla z motoru
  reserse: {},            // id → { data, kdy } | { nacita, chyba }
  wiki: {},               // id požadavku → { data } (null = nic) | { nacita } | { chyba: ms }
  chybneObrazky: new Set(),
  zapisu: 0,              // zápisy na cestě – odpověď motoru se ukáže až po posledním (okamžitý stav nepřeskočí zpátky)
  fronta: Promise.resolve(),
  poznamka: null,         // { id, text, casovac } rozepsaná poznámka
  pridat: { druh: 'film', text: '' },
  hlidani: 0,
  detail: null,           // id otevřené podstránky (karta nebo rešerše), null = seznam
  hloubka: 0,             // kolik záznamů historie nad seznamem (Zpět na seznam = history.go(-hloubka)); 0 = otevřeno odkazem
  odkud: null,            // sekce, ze které se podstránka otevřela (Hledat na Poště…) – Zpět prohlížeče tam vrátí
  posunSeznamu: 0,        // posun seznamu, když se otevřela podstránka (návrat bez historie)
  oddil: '',              // vybraná záložka podstránky ('' = výchozí, první)
  zalozky: [],            // záložky otevřené podstránky [[klíč, název]] (z knihovna_stranka.js)
  pod: {}                 // vybraná sekce v Zákulisí / Obsahu: '<id>:<záložka>' → klíč sekce (jen v tomhle běhu)
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

/**
 * Přednačtení na pozadí po startu (js/pripravenost.js – modul se načte v klidu po startu, ne až na stránce): data v zařízení
 * starší než mez → z motoru. S účtem hlídají změny značky (zmeny.knihovna – Claude přidal kartu, jiné zařízení), takže
 * čerstvá data ze zařízení se při otevření stránky už znovu nečtou; bez účtu se stránka při otevření obnoví jako dřív.
 */
export function prednacti(mezMin, sZnackami) {
  if (!umiMotor('knihovna') || stav.nacita.knihovna) return Promise.resolve();
  const v = uloziste.cti(ULOZISTE);
  if (v && v.kdy && Date.now() - v.kdy < mezMin * 60e3) { if (sZnackami) k.nacteno = true; return Promise.resolve(); }
  return nactiKnihovnu();
}

/** Data z jiného okna téhož zařízení (událost storage). */
export function zUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data && !k.zapisu) { stav.knihovna = v.data; obnovOtevrene(); }
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
    p.ai ? 'rešerše AI ' + p.ai : '',
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
  // z podstránky (Podobné, další otázka rešerše, „+“ nahoře) se zůstává na ní – seznam si drží záložku a filtr
  if (!(stav.pohled === 'knihovna' && k.detail)) {
    k.zalozka = D.zalozkaDruhu(druh);
    k.dotaz = '';
    const pole = document.getElementById('kn-hledat');
    if (pole) pole.value = '';
    ulozVolby();
    if (stav.pohled !== 'knihovna') prejdi('knihovna');
  }
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
    document.documentElement.classList.remove('kn-podstranka');
    return;
  }
  if (!el.querySelector('#kn-obsah')) {
    posledni.delete(el); // místo hlášky o starém motoru stránka – hláška se příště musí zase zapsat
    el.innerHTML = '<div class="kn-seznam" id="kn-seznam"><div class="kn-lista">' +
        '<div class="kn-lista__zalozky" id="kn-zalozky"></div>' +
        '<label class="kn-hledat">' + IKONY.hledat + '<input type="search" id="kn-hledat" data-kn-hledat placeholder="Hledat v knihovně…" autocomplete="off" ' +
          'spellcheck="false" enterkeyhint="search" aria-label="Hledat v knihovně"></label>' +
        '<button type="button" class="btn btn--primary kn-lista__pridat" data-kn-pridat>' + IKONY.plus + '<span>Přidat</span></button>' +
      '</div><div class="kn-filtry" id="kn-filtry"></div><div class="kn-obsah" id="kn-obsah"></div></div>' +
      // podstránka karty / rešerše: části se překreslují zvlášť (js/knihovna_stranka.js)
      '<article class="kn-st" id="kn-stranka" hidden>' +
        '<div class="kn-st__lista" data-kn-cast="lista"></div>' +
        '<div class="kn-st__vrch"><div class="kn-st__hero" data-kn-cast="hero"></div><div class="kn-st__moje" data-kn-cast="moje"></div></div>' +
        '<div class="kn-st__nav" data-kn-cast="nav"></div>' +
        '<div class="kn-st__telo" data-kn-cast="telo"></div>' +
      '</article>';
    el.querySelector('#kn-hledat').value = k.dotaz;
  }
  const seznam = el.querySelector('#kn-seznam'), stranka = el.querySelector('#kn-stranka');
  seznam.hidden = !!k.detail;
  stranka.hidden = !k.detail;
  document.documentElement.classList.toggle('kn-podstranka', !!k.detail);
  nastav(el.querySelector('#kn-zalozky'), zalozkyHtml());
  nastav(el.querySelector('#kn-filtry'), filtryHtml());
  nastav(el.querySelector('#kn-obsah'), obsahHtml());
  vykresliPodstranku(stranka);
}

/** Překreslit jen stránku (psaní do hledání, záložky, filtry) – bez celé aplikace. */
function prekresliStranku() {
  const el = document.getElementById('p-knihovna');
  if (el && !el.hidden) vykresliKnihovnu(el);
}

function ulozVolby() { uloziste.pis(VOLBY, { zalozka: k.zalozka, filtr: k.filtr, pohledAi: k.pohledAi }); }

function zalozkyHtml() {
  const p = D.pocty(stav.knihovna);
  return segment(D.ZALOZKY.map((z) => [z[0], z[1], stav.knihovna ? p[z[0]] : null]), k.zalozka, 'data-kn-zalozka', 'Část knihovny');
}

function filtryHtml() {
  const d = stav.knihovna;
  const z = k.zalozka;
  if (!d || !D.pocty(d)[z]) return '';
  const p = D.pocty(d).stavy[z];
  const cteni = z === 'reserse' || z === 'ai';
  const volbyFiltru = cteni ? [['vse', 'Vše', p.vse], ['bez', 'Nepřečtené', p.vse - p.hotovo], ['hotovo', 'Přečtené', p.hotovo]]
    : [['vse', 'Vše', p.vse]].concat(D.nazvyStavu(z).map((s) => [s[0], s[1], p[s[0]]]));
  const filtr = segment(volbyFiltru, k.filtr[z], 'data-kn-filtr', 'Filtr podle mého stavu');
  // Rešerše AI: zobrazení po týdnech / dnech / jednotlivě vlevo, filtr přečtení vedle
  return z === 'ai' ? '<div class="kn-filtry__ai">' + segment([['tydny', 'Týdny'], ['dny', 'Dny'], ['jednotlive', 'Jednotlivě']], k.pohledAi, 'data-kn-pohled-ai', 'Zobrazení') +
    filtr + '</div>' : filtr;
}

function obsahHtml() {
  const d = stav.knihovna;
  if (!d) return '<section class="card">' + (stav.chyby.knihovna ? chybaHtml(stav.chyby.knihovna, 'data-kn-znovu') : kostra(5)) + '</section>';
  const z = k.zalozka;
  const ceka = D.cekajici(d, z, k.dotaz);
  let h = '';
  if (z === 'reserse') {
    const seznam = D.reserseZalozky(d, k.dotaz, k.filtr.reserse, 'reserse');
    if (ceka.length || seznam.length) h = '<ul class="kn-reserse-seznam">' + ceka.map(cekajiciRadekHtml).join('') + seznam.map(reserseRadekHtml).join('') + '</ul>';
  } else if (z === 'ai') {
    const seznam = D.reserseZalozky(d, k.dotaz, k.filtr.ai, 'ai');
    if (seznam.length) h = aiHtml(seznam, d.ted);
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

/**
 * Rešerše AI (Michal 25. 10.: „primárně mi to zobrazuj po týdnech – ale budu tam mít možnost překliknout po dnech / týdnech
 * a pak jednotlivě“): týden / den = blok s nadpisem (data, tento týden / dnes), počtem a verdikty, pod ním rešerše
 * nejnovější nahoře; Jednotlivě = jeden seznam.
 */
function aiHtml(seznam, ted) {
  if (k.pohledAi === 'jednotlive') return '<ul class="kn-reserse-seznam">' + seznam.map(reserseRadekHtml).join('') + '</ul>';
  const poDnech = k.pohledAi === 'dny';
  return D.skupinyCasu(seznam, poDnech ? 'den' : 'tyden').map((sk) => {
    const n = poDnech ? D.nazevDne(sk.od, ted || Date.now()) : D.nazevTydne(sk.od, ted || Date.now());
    const v = D.poctyVerdiktu(sk.polozky);
    const verdikty = Object.keys(v).filter((x) => v[x]).map((x) => '<span class="kn-ai-verdikty__v kn-verdikt--' + x + '" title="' + esc(NAZEV_VERDIKTU[x]) + '">' +
      D.ZNAKY_VERDIKTU[x] + ' <b class="cisla">' + v[x] + '</b></span>').join('');
    return '<section class="kn-ai-skupina" data-kn-skupina="' + sk.od + '"><header class="kn-ai-skupina__hlava">' +
      '<h3>' + (poDnech ? '' : '<small>Týden</small>') + esc(n.nazev) + (n.kdy ? '<em>' + esc(n.kdy) + '</em>' : '') + '</h3>' +
      '<span class="kn-ai-skupina__pocet cisla">' + sk.polozky.length + ' ' + tvar(sk.polozky.length, 'rešerše', 'rešerše', 'rešerší') + '</span>' +
      (verdikty ? '<span class="kn-ai-verdikty">' + verdikty + '</span>' : '') + '</header>' +
      '<ul class="kn-reserse-seznam">' + sk.polozky.map(reserseRadekHtml).join('') + '</ul></section>';
  }).join('');
}
const NAZEV_VERDIKTU = { zkusit: 'Zkusit', kousek: 'Vzít kousek', pozdeji: 'Později', ne: 'Ne' };

function prazdneHtml(z, d) {
  if (z === 'ai' && !D.pocty(d).ai && !k.dotaz) {
    return '<section class="card"><div class="prazdne prazdne--velke"><i class="kruh kruh--knihovna">' + IKONY.claude + '</i><b>Zatím žádná rešerše AI</b>' +
      '<span>Pošli odkaz zkratkou „Tip pro Clauda“ (sdílení z X, Instagramu, YouTube) – Claude ho prověří, porovná s tím, jak to děláme, a rešerše se ukáže tady. Každý večer sem přibudou i AI tipy dne.</span></div></section>';
  }
  const nic = !D.pocty(d)[z];
  if (!nic || k.dotaz) {
    return '<section class="card"><div class="prazdne prazdne--velke"><i class="kruh kruh--knihovna">' + IKONY.hledat + '</i><b>Nic tu neodpovídá</b>' +
      '<span>' + (k.dotaz ? 'Hledáno „' + esc(k.dotaz) + '“. ' : '') + 'Zkus jiný filtr, nebo to přidej – Claude připraví přehled.</span>' +
      '<span class="kn-prazdne__akce"><button type="button" class="btn btn--ghost" data-kn-filtr-vse>Zrušit filtr</button>' +
      (k.dotaz ? '<button type="button" class="btn btn--primary" data-kn-pridat data-kn-druh="' + (z === 'knihy' ? 'kniha' : z === 'reserse' || z === 'ai' ? 'reserse' : 'film') +
        '" data-kn-text="' + esc(k.dotaz) + '">' + IKONY.plus + '<span>Přidat „' + esc(k.dotaz) + '“</span></button>' : '') + '</span></div></section>';
  }
  const t = { filmy: ['Zatím tu není žádný film ani seriál', 'Napiš název a Claude připraví přehled – o čem to je bez spoilerů, hodnocení, zajímavosti a kde to sledovat.', 'film', 'Přidat film'],
    knihy: ['Zatím tu není žádná kniha', 'Napiš název a Claude připraví přehled – o čem kniha je, autor, série a pořadí čtení.', 'kniha', 'Přidat knihu'],
    reserse: ['Zatím žádná rešerše', 'Zeptej se na cokoli, co tě zajímá – Claude projde zdroje a připraví přehled, ze kterého se něco naučíš.', 'reserse', 'Zeptat se'] }[z];
  return '<section class="card"><div class="prazdne prazdne--velke"><i class="kruh kruh--knihovna">' + IKONY.knihovna + '</i><b>' + t[0] + '</b><span>' + t[1] + '</span>' +
    '<button type="button" class="btn btn--primary" data-kn-pridat data-kn-druh="' + t[2] + '">' + IKONY.plus + '<span>' + t[3] + '</span></button></div></section>';
}

function stavTag(druh, st) { return st ? '<span class="tag ' + TRIDA_STAVU[st] + '">' + esc(D.nazevStavu(druh, st)) + '</span>' : ''; }

const obrazekHtml = (url, nazev, trida) => S.obrazekHtml(url, nazev, trida, k.chybneObrazky);

function kartaHtml(x) {
  const d = stav.knihovna;
  const m = D.moje(d, x.id);
  const meta = D.metaKarty(x);
  const prvni = D.hodnoceniNaDlazdici((x.hodnoceni || [])[0]);
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
  // verdikt tipu („✅ Zkusit – …“) jako barevný štítek, pod názvem jen zbytek věty
  const v = D.verdikt(r);
  const kratce = v ? v.zbytek : r.kratce;
  const ai = D.jeAi(r);
  return '<li data-kn-karta="' + esc(r.id) + '"><button type="button" class="kn-res' + (v ? ' kn-res--verdikt kn-verdikt--' + v.klic : '') + '" data-kn-otevri="' + esc(r.id) + '">' +
    '<span class="kn-res__ikona">' + (ai ? IKONY.claude : IKONY.knihovna) + '</span>' +
    '<span class="kn-res__text">' + (v ? '<span class="kn-verdikt">' + v.znak + ' ' + esc(v.text) + '</span>' : '') + '<b>' + esc(r.nazev) + '</b>' +
      (kratce ? '<small>' + esc(kratce) + '</small>' : '') +
      '<span class="kn-res__meta">' + (t ? '<em class="cisla">' + esc(dm(t) + (ai ? ' ' + hhmm(t) : '')) + '</em>' : '') +
      (r.stitky || []).filter((s) => !ai || !/^(tip|ai)$/i.test(s)).slice(0, 3).map((s) => '<span class="tag tag--seda">' + esc(s) + '</span>').join('') +
      (m.stav === 'hotovo' ? '<span class="tag tag--ok">přečteno</span>' : D.jeNova(stav.knihovna, r) ? '<span class="tag tag--limetka">nové</span>' : '') + '</span></span>' +
    IKONY.vpravo + '</button></li>';
}

function cekajiciRadekHtml(p) {
  return '<li data-kn-ceka="' + esc(p.id) + '"><button type="button" class="kn-res kn-res--ceka" data-kn-pozadavek="' + esc(p.id) + '">' +
    '<span class="kn-res__ikona">' + IKONY.claude + '</span>' +
    '<span class="kn-res__text"><b>' + esc(p.text) + '</b><span class="kn-res__meta">' + cekaTag() + '<em>' + esc(kdyZadano(p)) + '</em></span></span>' +
    IKONY.vpravo + '</button></li>';
}

// ---------------------------------------------------------------- podstránka karty a rešerše (#knihovna/<id>)

/**
 * Otevře kartu nebo rešerši jako podstránku (z dlaždice, Hledat, Související, Podobné…): nový záznam v historii s adresou
 * #knihovna/<id>, takže Zpět prohlížeče / gesto vrátí, odkud se přišlo (seznam se zachovaným posunem, předchozí kartu).
 */
export function otevriPolozku(id) {
  if (!D.idZAdresy(D.adresaPolozky(id))) return;
  const odjinud = stav.pohled !== 'knihovna';
  if (!odjinud && k.detail === id) { window.scrollTo(0, 0); return; }
  // posun stránky, ze které se odchází, do jejího záznamu v historii (Zpět ho vrátí)
  const posun = odjinud ? 0 : window.scrollY;
  if (!odjinud && !k.detail) k.posunSeznamu = posun;
  try { history.replaceState(Object.assign({}, history.state, { knPosun: posun }), ''); } catch (e) { /* nic */ }
  const hloubka = odjinud ? 1 : k.detail ? k.hloubka + 1 : 1;
  try { history.pushState({ kn: id, knHloubka: hloubka }, '', D.adresaPolozky(id)); } catch (e) { /* nic */ }
  if (odjinud) { k.odkud = stav.pohled; k.detail = id; k.hloubka = hloubka; k.oddil = ''; prejdi('knihovna'); }
  ukaz(id, hloubka, 0, true, '');
}

/**
 * Ukáže podstránku id (null = seznam) na záložce oddil ('' = výchozí) a nastaví posun. Volá ji otevření, Zpět (popstate) a „← Knihovna“.
 * zamer = fokus na nadpis (klávesnice a čtečka obrazovky začnou na nové stránce).
 */
function ukaz(id, hloubka, posun, zamer, oddil) {
  ulozPoznamkuHned(); // rozepsaná poznámka odcházející stránky se uloží
  k.detail = id || null;
  k.hloubka = id ? hloubka || 0 : 0;
  k.oddil = id ? oddil || '' : '';
  if (!id) k.odkud = null;
  prekresliStranku(); // rešerši dočte vykresliPodstranku, knihovnu (odkaz před načtením) dotahni()
  zmeneno(); // nadpis okna, lišty
  const y = Math.max(0, Number(posun) || 0);
  window.scrollTo(0, y);
  // prohlížeč při kroku v historii posun obnovuje sám (podle svého) – vlastní hodnota až po něm
  requestAnimationFrame(() => { if (k.detail === (id || null)) window.scrollTo(0, y); ukazAktivniVPasu(); });
  if (zamer && id) {
    const h = document.querySelector('#kn-stranka .kn-hero__nazev');
    if (h) h.focus({ preventScroll: true });
  }
}

/** „← Knihovna“ (i klepnutí na Knihovnu v menu, když je otevřená podstránka): zpět na seznam. Vrací true, když něco udělala. */
export function naSeznam() {
  if (!k.detail) return false;
  // podstránky otevřené ze seznamu: zpátky historií (seznam si pamatuje posun ve svém záznamu)
  if (k.hloubka > 0 && !k.odkud) {
    try { history.go(-k.hloubka); return true; } catch (e) { /* níž bez historie */ }
  }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nic */ }
  ukaz(null, 0, k.posunSeznamu);
  return true;
}

/** Odchod z Knihovny do jiné sekce: podstránka zavřená, adresa bez #knihovna (znovunačtení otevře tu sekci, ne kartu). */
export function mimoKnihovnu() {
  if (!k.detail && !D.idZAdresy(location.hash)) return;
  ulozPoznamkuHned();
  k.detail = null;
  k.hloubka = 0;
  k.odkud = null;
  document.documentElement.classList.remove('kn-podstranka');
  if (D.idZAdresy(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nic */ } }
}

/** Název do titulku okna („Oppenheimer · Knihovna · Asistent“) – jen na podstránce. */
export function titulek() {
  if (!k.detail) return '';
  const n = D.najdi(stav.knihovna, k.detail);
  return (n ? n.x.nazev + ' · ' : '') + 'Knihovna';
}

/** Zpět / vpřed v prohlížeči (i gesto na iPhonu): adresa → podstránka nebo seznam. Zavření okna nad stránkou adresu nemění. */
function poKrokuHistorie(e) {
  const id = D.idZAdresy(location.hash);
  if (id && id === k.detail) {
    const z = D.zalozkaZAdresy(location.hash);
    if (z !== k.oddil) { k.oddil = z; aplikujZalozky(); }
    return;
  }
  if (id === (k.detail || '')) return;
  const s = (e && e.state) || {};
  if (id) {
    if (stav.pohled !== 'knihovna') prejdi('knihovna');
    ukaz(id, s.knHloubka || 0, s.knPosun || 0, false, D.zalozkaZAdresy(location.hash));
    return;
  }
  if (stav.pohled !== 'knihovna') return;
  const odkud = k.odkud;
  ukaz(null, 0, s.knPosun != null ? s.knPosun : k.posunSeznamu);
  // podstránka otevřená z jiné sekce (Hledat na Poště) → Zpět vrátí tam
  if (odkud && odkud !== 'knihovna') { prejdi(odkud); zmeneno(); }
}

/** Části podstránky do jejich míst; část s rozepsanou poznámkou (fokus v poli) se nepřepisuje. */
function vykresliPodstranku(el) {
  const casti = ['lista', 'hero', 'moje', 'nav', 'telo'];
  if (!k.detail) {
    casti.forEach((c) => nastav(el.querySelector('[data-kn-cast="' + c + '"]'), ''));
    return;
  }
  const d = stav.knihovna;
  const n = D.najdi(d, k.detail);
  // celá rešerše z motoru (index má jen název a krátce); po chybě až na „Zkusit znovu“, ne při každém překreslení
  if (n && n.typ === 'reserse' && !(k.reserse[k.detail] || {}).chyba) nactiReserisi(k.detail);
  const ctx = { data: d, chybne: k.chybneObrazky };
  const h = !n ? S.chybiCasti(!d || stav.nacita.knihovna || (!k.nacteno && !stav.chyby.knihovna), k.detail)
    : n.typ === 'reserse' ? S.reserseCasti(n.x, k.reserse[k.detail], ctx) : S.kartaCasti(n.x, ctx);
  const a = document.activeElement;
  casti.forEach((c) => {
    const misto = el.querySelector('[data-kn-cast="' + c + '"]');
    if (!misto) return;
    if (a && misto.contains(a) && a.matches('textarea, input')) return;
    nastav(misto, h[c] || '');
    misto.hidden = !h[c];
  });
  k.zalozky = h.zalozky || [];
  aplikujZalozky();
}

// ---------------------------------------------------------------- záložky podstránky (pás nahoře) a podzáložky (sekce po jedné)

const strankaEl = () => document.getElementById('kn-stranka');
/** Vybraná záložka (platná pro otevřenou stránku; '' = stránka bez záložek). */
const aktivniZalozka = () => D.platnaZalozka(k.zalozky, k.oddil);
/** Klíč záložky do adresy – výchozí (první) se nepíše. */
function oddilDoAdresy() { const a = aktivniZalozka(); return a && k.zalozky.length > 1 && a !== k.zalozky[0][0] ? a : ''; }

/**
 * Vybranou záložku a sekce promítne do DOM (aria-selected, tabindex, hidden) – HTML se kvůli tomu nepřekresluje. Volá se po
 * každém vykreslení podstránky (překreslené části přijdou o stav) i po přepnutí. Na jiné než první záložce zúžená hlavička.
 */
function aplikujZalozky() {
  const el = strankaEl();
  if (!el) return;
  const aktivni = aktivniZalozka();
  const vic = k.zalozky.length > 1;
  el.classList.toggle('kn-st--kompakt', vic && aktivni !== k.zalozky[0][0]);
  el.querySelectorAll('[data-kn-tab]').forEach((b) => {
    const je = b.dataset.knTab === aktivni;
    if (b.getAttribute('aria-selected') !== String(je)) b.setAttribute('aria-selected', String(je));
    b.tabIndex = je ? 0 : -1;
  });
  el.querySelectorAll('[data-kn-panel]').forEach((p) => { const skryt = vic && p.dataset.knPanel !== aktivni; if (p.hidden !== skryt) p.hidden = skryt; });
  el.querySelectorAll('[data-kn-cteni]').forEach((c) => aplikujPodzalozky(c));
}

/** Sekce v Zákulisí / Obsahu: vybraná (zapamatovaná pro kartu a záložku, jinak první) vidět, ostatní skryté. */
function aplikujPodzalozky(cteni) {
  const clanky = Array.from(cteni.querySelectorAll('[data-kn-podpanel]'));
  if (!clanky.length) return '';
  const ulozena = k.pod[k.detail + ':' + cteni.dataset.knCteni];
  const aktivni = clanky.some((c) => c.dataset.knPodpanel === ulozena) ? ulozena : clanky[0].dataset.knPodpanel;
  clanky.forEach((c) => { const skryt = c.dataset.knPodpanel !== aktivni; if (c.hidden !== skryt) c.hidden = skryt; });
  cteni.querySelectorAll('[role="tab"][data-kn-pod]').forEach((b) => {
    const je = b.dataset.knPod === aktivni;
    if (b.getAttribute('aria-selected') !== String(je)) b.setAttribute('aria-selected', String(je));
    b.tabIndex = je ? 0 : -1;
  });
  return aktivni;
}

/** Aktivní tlačítko v pásu, který se posouvá do strany (telefon, iPad), posunout do zorného pole – pás, ne stránku. */
function ukazAktivniVPasu(seznam) {
  const pasy = seznam ? [seznam] : Array.from(document.querySelectorAll('#kn-stranka .kn-oddily__pas, #kn-stranka .kn-cteni__nav'));
  pasy.forEach((pas) => {
    const b = pas.querySelector('[aria-selected="true"]');
    if (!b || pas.scrollWidth <= pas.clientWidth + 1) return;
    const l = b.offsetLeft - pas.offsetLeft;
    if (l - 16 < pas.scrollLeft || l + b.offsetWidth + 28 > pas.scrollLeft + pas.clientWidth) {
      pas.scrollTo({ left: Math.max(0, l - 16), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
}

/**
 * Přepne záložku: jen ten panel, adresa přes replaceState (Zpět vede na seznam), stránka se dolů neposouvá. Když byl pás
 * přilepený nahoře (čtenář byl níž v dlouhém panelu), začne nový panel hned pod ním. fokus = klávesnice (fokus na záložku).
 */
function prepniZalozku(klic, fokus) {
  const el = strankaEl();
  if (!el || !k.detail || k.zalozky.length < 2) return;
  const nova = D.platnaZalozka(k.zalozky, klic);
  const nav = el.querySelector('[data-kn-cast="nav"]');
  const telo = el.querySelector('[data-kn-cast="telo"]');
  const navV = nav.getBoundingClientRect().height;
  const bylPrilepeny = telo.getBoundingClientRect().top < navV + 2;
  if (nova !== aktivniZalozka()) {
    k.oddil = nova;
    try { history.replaceState(history.state, '', D.adresaPolozky(k.detail, oddilDoAdresy())); } catch (e) { /* nic */ }
    aplikujZalozky();
  }
  if (bylPrilepeny) {
    const y = telo.getBoundingClientRect().top + window.scrollY - navV - 12;
    if (window.scrollY > y) window.scrollTo(0, Math.max(0, y));
  }
  ukazAktivniVPasu(nav.querySelector('.kn-oddily__pas'));
  if (fokus) { const b = el.querySelector('[data-kn-tab="' + CSS.escape(nova) + '"]'); if (b) b.focus({ preventScroll: true }); }
}

/** Přepne sekci v Zákulisí / Obsahu (seznam vlevo, na telefonu nahoře; „Další: …“ pod textem). */
function prepniPodzalozku(cteni, klic, fokus) {
  if (!cteni || !k.detail) return;
  k.pod[k.detail + ':' + cteni.dataset.knCteni] = klic;
  const aktivni = aplikujPodzalozky(cteni);
  const nav = cteni.querySelector('.kn-cteni__nav');
  if (nav) ukazAktivniVPasu(nav);
  // „Další“ pod dlouhým textem: začátek nové sekce do zorného pole (pod lepkavý pás), seznam vlevo zůstane
  const clanek = cteni.querySelector('[data-kn-podpanel="' + CSS.escape(aktivni) + '"]');
  const pas = document.querySelector('#kn-stranka [data-kn-cast="nav"]');
  const horni = (pas && !pas.hidden ? pas.getBoundingClientRect().height : 0) + 12;
  if (clanek && clanek.getBoundingClientRect().top < horni) window.scrollTo(0, Math.max(0, clanek.getBoundingClientRect().top + window.scrollY - horni));
  if (fokus) {
    const b = cteni.querySelector('[role="tab"][data-kn-pod="' + CSS.escape(aktivni) + '"]');
    if (b) b.focus({ preventScroll: true }); else if (clanek) clanek.focus({ preventScroll: true });
  }
}

/** Šipky na záložkách a sekcích; ←/→ jinde na stránce (mimo pole, okna a nabídky) přepnou záložku. Vrací true, když klávesu vzala. */
function klavesaZalozek(e) {
  if (!k.detail || stav.pohled !== 'knihovna' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return false;
  const t = e.target;
  const smer = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1, Home: 'prvni', End: 'posledni' }[e.key];
  if (smer === undefined) return false;
  // sekce (podzáložky): všechny šipky, Home, End
  const pod = t && t.closest ? t.closest('.kn-cteni__nav [data-kn-pod]') : null;
  if (pod) {
    const cteni = pod.closest('[data-kn-cteni]');
    const klice = Array.from(cteni.querySelectorAll('.kn-cteni__nav [data-kn-pod]')).map((b) => [b.dataset.knPod]);
    e.preventDefault();
    prepniPodzalozku(cteni, D.sousedniZalozka(klice, pod.dataset.knPod, smer), true);
    return true;
  }
  const naZalozce = t && t.closest ? t.closest('[data-kn-tab]') : null;
  if (!naZalozce) {
    // jinde na stránce jen ←/→ – ne v poli, ne pod oknem, nabídkou nebo vyjetou kartou, ne mimo podstránku
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return false;
    if (horniPanel() || document.querySelector('.okno-pozadi, .nabidka.videt')) return false;
    if (t && t !== document.body && t.closest && !t.closest('#kn-stranka')) return false;
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return false;
  if (k.zalozky.length < 2) return false;
  e.preventDefault();
  prepniZalozku(D.sousedniZalozka(k.zalozky, aktivniZalozka(), smer), !!naZalozce);
  return true;
}

function kopirujOdkaz() {
  const u = location.origin + location.pathname + D.adresaPolozky(k.detail, oddilDoAdresy());
  try {
    navigator.clipboard.writeText(u).then(() => toast('Odkaz zkopírovaný – otevře tuhle stránku i v jiném zařízení s Asistentem'),
      () => toast('Kopírování tady nejde.', true));
  } catch (e) { toast('Kopírování tady nejde.', true); }
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
    .then(() => { if (k.detail === id) prekresliStranku(); });
}

function ulozReserse() {
  const ids = Object.keys(k.reserse).filter((id) => k.reserse[id].data).sort((a, b) => (k.reserse[b].kdy || 0) - (k.reserse[a].kdy || 0)).slice(0, MAX_RESERSI_V_ZARIZENI);
  const o = {};
  ids.forEach((id) => { o[id] = { data: k.reserse[id].data, kdy: k.reserse[id].kdy }; });
  if (!uloziste.pis(ULOZISTE_RESERSI, o)) uloziste.smaz(ULOZISTE_RESERSI);
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
  if (ds.knPohledAi) { k.pohledAi = ds.knPohledAi; ulozVolby(); prekresliStranku(); return true; }
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
  if (ds.knReserseZnovu) { delete k.reserse[ds.knReserseZnovu]; nactiReserisi(ds.knReserseZnovu); prekresliStranku(); return true; }
  // podstránka: zpět na seznam, záložka, sekce, kopírovat odkaz, Podobné → požadavek pro Clauda jedním klepnutím
  if (el.hasAttribute('data-kn-zpet')) { naSeznam(); return true; }
  if (ds.knTab) { prepniZalozku(ds.knTab, false); return true; }
  if (ds.knTabPrejdi) { prepniZalozku(ds.knTabPrejdi, false); const b = document.querySelector('#kn-stranka [data-kn-tab="' + CSS.escape(ds.knTabPrejdi) + '"]'); if (b) b.focus({ preventScroll: true }); return true; }
  if (ds.knPod) { prepniPodzalozku(el.closest('[data-kn-cteni]'), ds.knPod, !el.matches('[role="tab"]')); return true; }
  if (el.hasAttribute('data-kn-kopirovat-odkaz')) { kopirujOdkaz(); return true; }
  if (el.hasAttribute('data-kn-podobne-pridat')) { if (ds.knDruh && ds.knText) pridej(ds.knDruh, ds.knText); return true; }
  if (el.hasAttribute('data-kn-pridat')) { otevriPridani(ds.knDruh, ds.knText); return true; } // i ze „Související“ – okno nad stránkou
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
  if (klavesaZalozek(e)) return true; // šipky: záložky a sekce podstránky
  // Esc na podstránce = zpět na seznam (jako dřív zavřel panel s kartou) – ne v poli, ne pod oknem nebo nabídkou (ta Esc vezme sama)
  if (e.key === 'Escape' && !e.defaultPrevented && k.detail && stav.pohled === 'knihovna' && !horniPanel() && !document.querySelector('.okno-pozadi') &&
    !(t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) { e.preventDefault(); naSeznam(); return true; }
  return false;
}

// pravé tlačítko / podržení na dlaždici (i na tipu v Podobných, který v knihovně je): můj stav, kopírovat název, otevřít ČSFD
// (Databázi knih); u čekajícího Zrušit
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
// odkaz na kartu (#knihovna/<id>) při startu – app.js kvůli němu otevřel stránku Knihovna; hloubka z historie (znovunačtení
// stejné záložky ji zachová, nový odkaz ne – „← Knihovna“ pak seznam jen ukáže)
if (stav.pohled === 'knihovna' && D.idZAdresy(location.hash)) {
  k.detail = D.idZAdresy(location.hash);
  k.oddil = D.zalozkaZAdresy(location.hash);
  k.hloubka = (history.state && history.state.knHloubka) || 0;
}
window.addEventListener('popstate', poKrokuHistorie);
// rozepsaná poznámka na podstránce se uloží i při odchodu z pole
document.addEventListener('focusout', (e) => { if (e.target && e.target.matches && e.target.matches('[data-kn-poznamka]')) ulozPoznamkuHned(); });
// obrázek, který nejde načíst (adresa zmizela, bez sítě): pryč – zůstane zástupná plocha s iniciálou (u fotky herce i bez
// popisku zdroje), příště se nezkouší
document.addEventListener('error', (e) => {
  const t = e.target;
  const obal = t && t.tagName === 'IMG' && t.parentNode && t.parentNode.classList ? t.parentNode : null;
  if (!obal || !(obal.classList.contains('kn-obr') || obal.classList.contains('kn-foto'))) return;
  k.chybneObrazky.add(t.getAttribute('src'));
  const zdroj = obal.classList.contains('kn-foto') && obal.parentNode ? obal.parentNode.querySelector('.kn-foto__zdroj') : null;
  if (zdroj) zdroj.remove();
  t.remove();
}, true);
