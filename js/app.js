// Asistent – start, navigace (postranní panel, horní lišta s hledáním, spodní lišta na telefonu), hlavička,
// přehled Dnes (čísla, grafy, co čeká) a ovládání (klepnutí, klávesy). Vzhled: styl „Fixtrack“, skill osobni-vzhled.

import { stav, priZmene, zmeneno, prejdi, umiMotor, staryMotor } from './stav.js';
import { jePripojeno, jeDemo, volej } from './api.js';
import { esc, pulnoc, datumDlouhe, iniciala, odstin, tvar, velkePrvni, rozdilDni, uloziste, terminDatum, dm, kdyKratce, prvniRadek } from './pomocne.js';
import { kostra, chybaHtml, hlavickaKarty, okno, toastAkce } from './ui.js';
import { IKONY, ikonaPocasi } from './ikony.js';
import { zavriPanel, horniPanel, otevriPanel, zavriAPak, jeOtevreny, obnovPanel, elementPanelu } from './panely.js';
import * as schranka from './schranka.js';
import * as posta from './posta.js';
import * as kal from './kalendar.js';
import * as nast from './nastaveni.js';
import * as hledat from './hledat.js';
import * as udalost from './udalost.js';
import * as pocasi from './pocasi.js';
import * as zdravi from './zdravi.js';
import * as fotbal from './fotbal.js';
import * as dochazka from './dochazka.js';
import * as reely from './reely.js';
import * as plakaty from './plakaty.js';
import * as auto from './auto.js';
import * as moje from './moje.js';
import * as nabidka from './nabidka.js';
import * as krouzky from './krouzky.js';
import { vstupAdresy, klavesaAdresy } from './adresy.js';
import * as ucet from './ucet.js';

const SEKCE = [['dnes', 'Dnes'], ['schranka', 'Schránka'], ['posta', 'Pošta'], ['kalendar', 'Kalendář'], ['zdravi', 'Zdraví'], ['fotbal', 'Fotbal'], ['reely', 'Reely'],
  ['plakaty', 'Plakáty'], ['auto', 'Auto']];
// sekce, které ukáže jen motor, který je umí (starší verze motoru je schová)
const viditelna = (s) => ['fotbal', 'reely', 'plakaty', 'auto'].indexOf(s[0]) < 0 || umiMotor(s[0]);
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const TELEFON = window.matchMedia('(max-width: 759px)');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- start

function start() {
  if (performance.mark) performance.mark('asistent-start');
  window.asistentBezi = true; // js/start.js: aplikace nastartovala (žádná záchrana) a rozepsaný text hlídá při nové verzi
  window.asistentNovaVerze = () => toastAkce('Nová verze aplikace – načte se, až ji zavřeš', 'Načíst teď', () => {
    window.asistentBezSnimku = true; // snímek staré verze nová neukáže
    uloziste.smaz(SNIMEK);
    location.reload();
  });
  $('uvod').hidden = true;
  $('aplikace').hidden = false;
  stav.info = uloziste.cti('asistent.info');
  schranka.nactiZUloziste();
  posta.nactiZUloziste();
  kal.nactiZUloziste();
  pocasi.nactiZUloziste();
  zdravi.nactiZUloziste();
  fotbal.nactiZUloziste();
  dochazka.nactiZUloziste();
  reely.nactiZUloziste();
  plakaty.nactiZUloziste();
  auto.nactiZUloziste();
  if (!SEKCE.some((s) => s[0] === stav.pohled)) stav.pohled = 'dnes';
  kal.pripravGesta($('p-kalendar'));
  priZmene(vykresli);
  // účet Firebase: kopie dat ze serveru (načtou se hned, změny chodí živě) – bez účtu se nic nestahuje
  ucet.spust();
  ucet.naKopie(poNovychKopiich);
  ucet.naSignal(poSignalu);
  ucet.naStav(() => {
    // stav účtu v Nastavení (ne když se zrovna píše do pole – překreslení by ho smazalo)
    const el = elementPanelu('nastaveni');
    if (jeOtevreny('nastaveni') && !(el && el.contains(document.activeElement) && document.activeElement.matches('input, textarea'))) obnovPanel('nastaveni');
  });
  zrusSnimek(); // snímek z js/start.js pryč – ve stejném kroku se vykreslí aplikace (nic neblikne)
  vykresli();
  if (performance.mark) performance.mark('asistent-vykresleno');
  obnovVse(false);
}

// ---------------------------------------------------------------- okamžitý snímek (js/start.js ho ukáže při dalším otevření)
// Michal 9. 10.: „co nejrychlejší práce na stránce“ – při odchodu z aplikace (do pozadí, zavření) a 4 s po posledním
// překreslení se uloží HTML viditelné stránky a lišt. Při dalším otevření ho js/start.js ukáže hned po načtení HTML,
// ještě než se stáhnou a spustí moduly; start() ho pak smaže a vykreslí aplikaci s aktuálními daty. Jen stránky bez
// vložených e-mailů a videí, nejvýš ~600 000 znaků; klíč asistent.data.* = smaže se s uloženými daty i při odpojení.
const SNIMEK = 'asistent.data.snimek';
const SNIMEK_STRANKY = ['dnes', 'schranka', 'posta', 'kalendar', 'zdravi'];
let casovacSnimku = 0;

const rozlozeni = () => (TELEFON.matches ? 'telefon' : SIROKY.matches ? 'pc' : 'ipad');
function naplanujSnimek() {
  clearTimeout(casovacSnimku);
  casovacSnimku = setTimeout(ulozSnimek, 4000);
}

function ulozSnimek() {
  clearTimeout(casovacSnimku);
  if (window.asistentBezSnimku || !window.asistentBezi) return;
  if (!jePripojeno() || $('aplikace').hidden || SNIMEK_STRANKY.indexOf(stav.pohled) < 0 || uloziste.cti('asistent.bezSnimku')) {
    uloziste.smaz(SNIMEK);
    return;
  }
  const stranka = $('p-' + stav.pohled).cloneNode(true);
  stranka.querySelectorAll('iframe, video, audio, canvas, #posta-detail > *').forEach((x) => x.remove());
  const casti = { rail: $('rail').innerHTML, horni: $('horni').innerHTML, hlava: $('hlava').innerHTML, pruhy: $('pruhy').innerHTML,
    lista: $('lista').innerHTML, stranka: stranka.innerHTML };
  const d = new Date();
  const snimek = { den: d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(), kdy: Date.now(), pohled: stav.pohled, rozlozeni: rozlozeni(),
    trida: $('aplikace').className, horniTrida: $('horni').className, styl: document.documentElement.getAttribute('style') || '', casti };
  const delka = Object.keys(casti).reduce((s, k) => s + casti[k].length, 0);
  if (delka > 600000 || !uloziste.pis(SNIMEK, snimek)) uloziste.smaz(SNIMEK);
}

/** Snímek z js/start.js pryč (lišty i stránka) – start() hned potom vykreslí aplikaci. */
function zrusSnimek() {
  if (!document.documentElement.classList.contains('snimek')) return;
  ['rail', 'horni', 'hlava', 'pruhy', 'lista'].forEach((id) => { $(id).innerHTML = ''; });
  document.querySelectorAll('#aplikace [data-pohled]').forEach((el) => { el.innerHTML = ''; });
  document.documentElement.classList.remove('snimek');
  window.asistentSnimek = false;
}

function obnovVse(znovu) {
  stav.naposledy = Date.now();
  // s účtem: poštu, kalendář a reely obnoví server (kopie přijdou živě) – Obnovit pak neposílá motoru deset dotazů
  // naráz (Google pak odpovědi ztrácí); přímo z motoru jen to, co server nechystá (počasí, zdraví, auto)
  const primo = znovu && !ucet.zapnuty();
  schranka.nactiSchranku();
  posta.nactiPostu(primo);
  kal.nactiKalendar(primo);
  nast.nactiInfo();
  // počasí a zdraví server nechystá (jdou z motoru) – při pouhém návratu do aplikace nejvýš jednou za 30 / 15 minut
  if (znovu || stara('asistent.data.pocasi', 30)) pocasi.nactiPocasi(znovu);
  // s účtem se zdraví načte hned po signálu nebo značce změny (zkontrolujZmeny, poSignalu) – jinak jen záloha po 6 h
  if (znovu || stara('asistent.data.zdravi', ucet.zapnuty() ? 360 : 15)) zdravi.nactiZdravi(znovu);
  zkontrolujZmeny();
  fotbal.nactiFotbal();
  reely.nactiReely(primo);
  if (stav.pohled === 'plakaty') plakaty.nactiPlakaty(znovu); // plakát se čte jen na své stránce
  if (znovu || stav.pohled === 'auto') auto.nactiAuto(znovu); // tabulku auta jen na její stránce nebo při Obnovit
  // Obnovit = i čerstvé kopie na serveru (třeba hned po nasazení motoru); jinak jen když jsou kopie starší
  if (znovu) ucet.obnovNaServeru(true);
  else ucet.obnovStare();
}

/** Data v zařízení starší než … minut (nebo žádná)? */
function stara(klic, minut) {
  const v = uloziste.cti(klic);
  return !v || !v.kdy || Date.now() - v.kdy > minut * 60e3;
}

/** Značky změn ze serveru: auto a zdraví se načtou znovu, jen když se k nim od posledního načtení zapisovalo – i mimo
 *  aplikaci (zkratka Zdraví, Claude zapsal diktát „vypil jsem…“). */
function zkontrolujZmeny() {
  if (!umiMotor('zmeny') || !ucet.zapnuty()) return;
  volej('zmeny').then((z) => { auto.zkontrolujZmenu(z && z.auto); zdravi.zkontrolujZmenu(z && z.zdravi); }).catch(() => { /* jen zrychlení */ });
}

/** Signál z jiného zařízení (voda, doplňky, váha, tankování…) → načíst hned, ne až za čtvrt hodiny. */
function poSignalu(sig) {
  zdravi.zkontrolujZmenu(sig.zdravi);
  auto.zkontrolujZmenu(sig.auto);
}

/** Server obnovil kopie (každých 10 min, po změně nebo při otevření) → načíst znovu, čeho se to týká (z kopie, hned). */
function poNovychKopiich(idy) {
  const je = (id) => idy.indexOf(id) >= 0;
  if (je('zmeny')) zkontrolujZmeny();
  if (je('posta')) posta.nactiPostu(false);
  if (je('schranka')) schranka.nactiSchranku();
  if (idy.some((id) => id.indexOf('kalendar_') === 0)) kal.nactiKalendar(false, true);
  if (je('info')) nast.nactiInfo();
  if (je('fotbal')) fotbal.nactiFotbal();
  if (je('reely')) reely.nactiReely(false);
  if (je('plakaty') && (stav.plakaty || stav.pohled === 'plakaty')) plakaty.nactiPlakaty(false);
}

// ---------------------------------------------------------------- počty

function pocty() {
  const nep = posta.neprectene();
  return {
    ceka: schranka.naTebe(),
    uClauda: schranka.uClauda(),
    terminy: schranka.terminy(),
    nep,
    hori: posta.pocetStavu('hori'),
    pozornost: posta.kPozornosti(),
    postaDnes: postaNaDnes(),
    dnes: kal.udalostiDne(Date.now())
  };
}

/**
 * Pošta na Dnes samostatně (Michal 9. 10.: „když je vyřízena pošta, tak se nemusí zobrazit – aby bylo jasno, že mám
 * přečteno a vyřízeno, nebo ne“): co chce odpověď (hoří, čeká na tebe, otázka) a ostatní nepřečtené z Primární;
 * nepřečtené Aktualizace (oznámení, účtenky) jen jako počet, ať seznam nezahltí. Obojí prázdné = karta schovaná.
 */
function postaNaDnes() {
  const k = posta.kPozornosti();
  const uz = {};
  k.forEach((m) => { uz[m.id] = true; });
  const zalozky = umiMotor('postaKategorie');
  const nep = posta.neprectene().filter((m) => !uz[m.id]);
  const aktualizace = zalozky ? nep.filter((m) => m.aktualizace) : [];
  const seznam = k.concat(nep.filter((m) => !(zalozky && m.aktualizace)));
  return { seznam, aktualizace, celkem: seznam.length + aktualizace.length };
}

function nacitaSe() { return Object.keys(stav.nacita).some((k) => stav.nacita[k]) || kal.nacitaSe(); }

// Kolečko u Obnovit jen po klepnutí na Obnovit – obnova při otevření a návratu jde potichu na pozadí (data z uložené
// kopie jsou vidět hned a doplní se samy; Michal 9. 10.: „načítání je dlouhé“ = točící se kolečko při každém otevření).
let rucneObnovuje = false;
function tociSe() {
  if (rucneObnovuje && !nacitaSe()) rucneObnovuje = false;
  return rucneObnovuje;
}

// ---------------------------------------------------------------- vykreslení

function vykresli() {
  pocasi.dotahni();
  zdravi.dotahni();
  fotbal.dotahni();
  reely.dotahni();
  auto.dotahni();
  if (stav.pohled === 'kalendar') dochazka.dotahni();
  if (stav.pohled === 'plakaty') plakaty.dotahni();
  const p = pocty();
  document.querySelectorAll('[data-pohled]').forEach((el) => { el.hidden = el.dataset.pohled !== stav.pohled; });
  // levý pás: celý jen na Dnes (nebo připnutý), jinde úzký s ikonami – víc místa na práci
  $('aplikace').classList.toggle('rail-uzky', stav.pohled !== 'dnes' && !railPripnuty());
  if (!railUzky()) $('rail').classList.remove('rozbaleny');
  vykresliRail(p);
  vykresliHorni(p);
  vykresliHlavu(p);
  vykresliPruhy();
  vykresliListu(p);
  const el = $('p-' + stav.pohled);
  sFokusem(() => vykresliStranku(el, p));
  zkontrolujNovinky(p);
  naplanujSnimek();
}

function vykresliStranku(el, p) {
  if (stav.pohled === 'dnes') vykresliDnes(el, p);
  else if (stav.pohled === 'schranka') schranka.vykresliSchranku(el);
  else if (stav.pohled === 'posta') posta.vykresliPostu(el);
  else if (stav.pohled === 'zdravi') zdravi.vykresliZdravi(el);
  else if (stav.pohled === 'fotbal') fotbal.vykresliFotbal(el);
  else if (stav.pohled === 'reely') reely.vykresliReely(el);
  else if (stav.pohled === 'plakaty') plakaty.vykresliPlakaty(el);
  else if (stav.pohled === 'auto') auto.vykresliAuto(el);
  else kal.vykresliKalendar(el);
}

// ---------------------------------------------------------------- Co je nového (okno při otevření, vzor CaseDraft)

let novinkyUkazany = false;
/** Po čerstvém načtení ukáže, co přibylo od posledního otevření: hoří, nová pošta pro tebe, odpovědi Clauda, úkoly na dnes.
 *  Při prvním spuštění jen zapamatuje čas (nic neukazuje). */
function zkontrolujNovinky(p) {
  const cerstve = (data) => data && data.ted >= stav.naposledy - 60000;
  if (novinkyUkazany || jeDemo() || !cerstve(stav.posta) || !cerstve(stav.schranka) || horniPanel()) return;
  novinkyUkazany = true;
  const videno = uloziste.cti('asistent.videno');
  uloziste.pis('asistent.videno', Date.now());
  if (!videno) return;
  const zpravy = posta.vsechnyZpravy();
  const hori = zpravy.filter((m) => posta.stavZpravy(m) === 'hori' && m.kdy > videno).length;
  const nove = zpravy.filter((m) => m.neprectena && m.kdy > videno && ['ceka', 'otazka'].indexOf(posta.stavZpravy(m)) >= 0).length;
  const odpovedi = schranka.odpovedi(7, videno).length;
  const prvniDnes = videno < pulnoc(Date.now());
  const radky = [];
  const vystrahy = pocasi.noveVystrahy();
  vystrahy.forEach((v) => radky.push([v.reka ? IKONY.kapka : IKONY.pozor, pocasi.nazevVystrahy(v), pocasi.kdyPlati(v)]));
  if (hori) radky.push([IKONY.ohen, 'Hoří v poště', hori]);
  if (nove) radky.push([IKONY.posta, 'Nová pošta, která na tebe čeká', nove]);
  if (odpovedi) radky.push([IKONY.claude, 'Claude odpověděl', odpovedi]);
  fotbal.noveVysledky(videno).slice(0, 3).forEach((v) => radky.push([IKONY.zapas, v.text, { V: 'výhra', R: 'remíza', P: 'prohra' }[v.vrp] || '']));
  if (prvniDnes && p.terminy.poTerminu) radky.push([IKONY.pozor, 'Úkoly po termínu', p.terminy.poTerminu]);
  if (prvniDnes && p.terminy.dnes) radky.push([IKONY.schranka, 'Úkoly na dnes', p.terminy.dnes]);
  if (!radky.length) return;
  okno({ ikona: hori ? IKONY.ohen : vystrahy.length ? IKONY.pozor : IKONY.fajfka, ton: hori || vystrahy.length ? 'pozor' : 'ok', nadpis: 'Co je nového',
    text: 'Od posledního otevření (' + kdyKratce(videno) + ')', radky: radky.map((r) => [r[0], r[1], String(r[2])]), ano: 'Ukázat', ne: 'Zavřít' })
    .then((ano) => {
      if (!ano) return;
      if (hori || nove) { stav.filtrPosty = hori ? 'hori' : 'vse'; stav.kategoriePosty = 'primarni'; stav.stitekPosty = ''; prejdi('posta'); } else prejdi('dnes');
      if (vystrahy.length && !hori && !nove) pocasi.ukazDetail();
      zmeneno();
    });
}

function odznakSekce(sekce, p) {
  return { schranka: p.ceka.length, posta: p.nep.length, reely: reely.kVyveseni().length }[sekce] || 0;
}

// ---------------------------------------------------------------- levý pás
// Michal 9. 10.: „když se rozkliknu do jednotlivých stránek, třeba pošty, tak se ten levý pás zmenší a jsou zobrazeny
// jenom ikony, a když na to najedu nebo rozkliknu nějaké tlačítko, tak se mi to rozbalí – získám větší pracovní prostor“.
// Na Dnes celý, jinde úzký (ikony s počty v odznacích). Najetí myší (s krátkou prodlevou) nebo fokus klávesnicí ho
// rozbalí PŘES obsah – sloupec mřížky zůstane úzký, stránka neposkočí; výběr sekce ho zase sbalí (znovu se rozbalí až po
// novém najetí). „Připnout“ nechá pás celý na všech stránkách (asistent.rail). iPad (760–1179 px) má pás úzký vždy
// (CSS) a rozbalí se stejně; připnutí až od 1180 px. Vzhled: app.css, oddíl postranní panel.
const RAIL_PRIPNUTY = 'asistent.rail';
const SIROKY = window.matchMedia('(min-width: 1180px)');
const IKONA_PRIPNOUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M9.5 3.5h5l-.8 5.2 3.3 3.3v2h-10v-2l3.3-3.3z"/><path d="M12 14v6.5"/></svg>';
const railPripnuty = () => uloziste.cti(RAIL_PRIPNUTY) === 'pripnuty';
/** Je pás teď úzký (iPad, nebo stránka mimo Dnes bez připnutí)? Jen takový se rozbaluje přes obsah. */
const railUzky = () => !SIROKY.matches || $('aplikace').classList.contains('rail-uzky');
let railCasovac = 0, railHtml = '';

function rozbalRail() {
  if (railUzky()) $('rail').classList.add('rozbaleny');
}
function sbalRail() {
  clearTimeout(railCasovac);
  $('rail').classList.remove('rozbaleny');
}
function prepniPripnuti() {
  if (railPripnuty()) uloziste.smaz(RAIL_PRIPNUTY); else uloziste.pis(RAIL_PRIPNUTY, 'pripnuty');
  sbalRail();
  zmeneno();
}
(function hlidejRail() {
  const r = $('rail');
  // jen myš (i trackpad iPadu); dotyk klepnutím rovnou vybírá sekci. Myš, která po výběru sekce zůstala nad pásem,
  // nové pointerenter nevyvolá – pás zůstane sbalený, dokud z něj neodjede a nevrátí se.
  r.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !railUzky()) return;
    clearTimeout(railCasovac);
    railCasovac = setTimeout(rozbalRail, 140);
  });
  r.addEventListener('pointerleave', sbalRail);
  // klávesnice (Tab): rozbalit jen při viditelném fokusu – klepnutí myší tlačítko taky fokusuje, ale bez :focus-visible
  r.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) rozbalRail(); });
  r.addEventListener('focusout', (e) => { if (!r.contains(e.relatedTarget)) sbalRail(); });
  r.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !r.classList.contains('rozbaleny')) return;
    e.stopPropagation();
    sbalRail();
    if (r.contains(document.activeElement)) document.activeElement.blur();
  });
})();

/** Postranní panel: logo (+ připnout), sekce s počty, Nastavení, kdo je připojený. Úzký = jen ikony (CSS). */
function vykresliRail(p) {
  const ucet = (stav.info && stav.info.ucet) || (jeDemo() ? 'ukázka' : '');
  const pripojeni = jeDemo() ? ['ukazka', 'ukázková data'] : navigator.onLine === false ? ['offline', 'offline']
    : stav.chyby.info ? ['offline', 'nepřipojeno – viz Nastavení'] : stav.info ? ['', 'připojeno'] : ['ukazka', 'připojuji…'];
  const tl = (atr, nazev, ikona, n, aktivni) => '<button type="button" class="rail__btn" ' + atr + ' title="' + nazev + '" aria-label="' + nazev +
    (n ? ', ' + n : '') + '"' + (aktivni ? ' aria-current="page"' : '') + '>' + ikona + '<span>' + nazev + '</span>' +
    (n ? '<span class="pocet cisla">' + n + '</span>' : '') + '</button>';
  const pripnuty = railPripnuty();
  const pripnout = stav.pohled === 'dnes' ? '' : '<button type="button" class="rail__pripnout" data-rail-pripnout aria-pressed="' + pripnuty + '" title="' +
    (pripnuty ? 'Odepnout – mimo Dnes zase jen ikony' : 'Připnout rozbalený panel') + '" aria-label="' + (pripnuty ? 'Odepnout panel' : 'Připnout rozbalený panel') + '">' +
    IKONA_PRIPNOUT + '</button>';
  const html =
    '<div class="rail__hlava"><button type="button" class="rail__logo" data-cil="dnes" title="Dnes – hlavní stránka" aria-label="Asistent – hlavní stránka">' +
      '<span class="znak">' + IKONY.dnes + '</span><div><b>Asistent</b><small>osobní přehled</small></div></button>' + pripnout + '</div>' +
    '<div class="rail__sekce">Hlavní</div>' +
    SEKCE.filter(viditelna).map((s) => tl('data-cil="' + s[0] + '"', s[1], IKONY[s[0]], odznakSekce(s[0], p), stav.pohled === s[0])).join('') +
    '<div class="rail__spodek"><div class="rail__sekce">Účet</div>' +
      tl('data-otevri-nastaveni', 'Nastavení', IKONY.nastaveni, 0, false) +
      '<div class="rail__ja" title="' + esc(ucet) + '">' +
        '<span class="avatar" style="--h:' + odstin(ucet || 'A') + '">' + esc(iniciala(String(ucet || 'A').split('@')[0].replace(/[._\d]+/g, ' '))) + '</span>' +
        '<div><b>' + esc(ucet || 'Asistent') + '</b><small><i class="' + pripojeni[0] + '"></i>' + pripojeni[1] + '</small></div></div>' +
    '</div>';
  // jen při změně – překreslení by vzalo fokus tlačítku, na kterém zrovna stojí klávesnice
  if (html !== railHtml) { $('rail').innerHTML = html; railHtml = html; }
}

/** Hlavní akce sekce (vpravo nahoře): poznámka, nový e-mail, přidat kalendář. */
function hlavniAkce() {
  if (stav.pohled === 'posta') return '<button type="button" class="btn btn--primary" data-psat="novy">' + IKONY.psat + '<span>Nový e-mail</span></button>';
  if (stav.pohled === 'kalendar') return '<button type="button" class="btn btn--primary" data-nova-udalost>' + IKONY.plus + '<span>Nová událost</span></button>';
  // na Dnes se na užší liště zmenší na „+“ (popisek nese title a aria-label)
  return '<button type="button" class="btn btn--primary" data-nova-poznamka title="Poznámka pro Clauda" aria-label="Poznámka pro Clauda">' + IKONY.plus +
    '<span>Poznámka pro Clauda</span></button>';
}

/** Horní lišta (iPad, PC): hledání vlevo, obnovit a hlavní akce vpravo; na Dnes mezi nimi malé přehledové dlaždice. */
let horniHtml = '';
function vykresliHorni(p) {
  const dnes = stav.pohled === 'dnes' && !TELEFON.matches;
  const html = '<button type="button" class="hledat-tl" data-hledat aria-label="Hledat v poště, schránce a kalendáři">' + IKONY.hledat +
    '<span class="hledat-tl__text">Hledat v poště, schránce a kalendáři…</span>' + (dnes ? '<span class="hledat-tl__kratce">Hledat</span>' : '') +
    '<kbd>' + (MAC ? '⌘ K' : 'Ctrl K') + '</kbd></button>' +
    (dnes ? dlazdiceHorniHtml(p) : '') +
    '<div class="horni__akce"><button type="button" class="btn btn--ikona' + (tociSe() ? ' toci' : '') + '" data-obnovit aria-label="Obnovit" title="Obnovit">' +
    IKONY.obnovit + '</button>' + hlavniAkce() + '</div>';
  const el = $('horni');
  el.classList.toggle('horni--dnes', dnes);
  // jen při změně (vykresluje se při každém načtení dat) – fokus klávesnice na dlaždici nezmizí
  if (html !== horniHtml) { el.innerHTML = html; horniHtml = html; }
}

function vykresliHlavu(p) {
  const titul = SEKCE.find((s) => s[0] === stav.pohled)[1];
  let pod = '';
  if (stav.pohled === 'dnes') {
    pod = esc(velkePrvni(datumDlouhe(Date.now())));
    // sedí s kartami pod tím: „Vyžaduje pozornost · n“ (schránka, auto) a „Pošta · m“ (když je pošta vyřízená, karta není)
    if (stav.schranka && stav.posta) {
      const n = pozornost(p).length;
      const m = p.postaDnes.celkem;
      const casti = [n ? n + ' ' + tvar(n, 'věc čeká', 'věci čekají', 'věcí čeká') + ' na tebe' : '',
        m ? m + ' ' + tvar(m, 'e-mail', 'e-maily', 'e-mailů') + ' k vyřízení' : n ? 'pošta vyřízená' : ''].filter(Boolean);
      pod += ' · ' + (casti.join(' · ') || 'nic na tebe nečeká');
    }
  } else if (stav.pohled === 'schranka') {
    pod = stav.schranka ? p.ceka.length + ' čeká na tebe · ' + p.uClauda.length + ' u Clauda' +
      (stav.schranka.zpracovano ? ' · Claude naposledy ' + esc(kdyKratce(stav.schranka.zpracovano)) : '') : 'Načítám…';
  } else if (stav.pohled === 'posta') {
    pod = stav.posta ? p.pozornost.length + ' ' + tvar(p.pozornost.length, 'konverzace čeká', 'konverzace čekají', 'konverzací čeká') + ' na tebe' +
      (p.hori ? ' · ' + p.hori + ' hoří' : '') + ' · ' + (posta.maPracovni() ? 'osobní a pracovní' : 'osobní Gmail') : 'Načítám…';
  } else if (stav.pohled === 'fotbal') {
    const f = stav.fotbal && stav.fotbal.data;
    pod = f ? esc(f.klub || '') + ' · zápasy, tabulky, střelci' : 'Zápasy z fotbal.cz';
  } else if (stav.pohled === 'reely') {
    pod = reely.podnadpis();
  } else if (stav.pohled === 'plakaty') {
    pod = plakaty.podnadpis();
  } else if (stav.pohled === 'auto') {
    pod = esc(auto.podnadpis());
  } else if (stav.pohled === 'zdravi') {
    const z = stav.zdravi;
    pod = 'WHOOP a Apple Watch' + (z && z.whoop && z.whoop.sync && z.whoop.sync.kdy ? ' · aktualizováno ' + esc(kdyKratce(z.whoop.sync.kdy)) : '');
  } else {
    pod = esc(kal.nadpisObdobi());
  }
  // telefon (vzor PriorAuth): nahoře kdo jsem + ikony, nadpis u Dnes je pozdrav
  const ucet = (stav.info && stav.info.ucet) || '';
  const jmeno = uloziste.cti('asistent.jmeno') || ucet.split('@')[0] || 'Asistent';
  const osloveni = uloziste.cti('asistent.osloveni');
  const nadpis = stav.pohled === 'dnes' && TELEFON.matches ? pozdrav() + (osloveni ? ', ' + osloveni : '') : titul;
  nastavHtml($('hlava'),
    '<div class="hlava-ja jen-telefon">' +
      '<button type="button" class="ja" data-menu aria-label="Menu – všechny sekce a Nastavení">' +
        '<span class="avatar" style="--h:' + odstin(jmeno) + '">' + esc(iniciala(jmeno.replace(/[._\d]+/g, ' '))) + '</span>' +
        '<span><small>Asistent · menu</small><b>' + esc(jmeno) + '</b></span>' + IKONY.menu + '</button>' +
      '<div class="hlava-akce">' +
        (umiMotor('zdravi') && stav.pohled !== 'zdravi' ? '<button type="button" class="btn btn--ikona" data-cil="zdravi" aria-label="Zdraví">' + IKONY.srdce + '</button>' : '') +
        '<button type="button" class="btn btn--ikona" data-hledat aria-label="Hledat">' + IKONY.hledat + '</button>' +
        '<button type="button" class="btn btn--ikona' + (tociSe() ? ' toci' : '') + '" data-obnovit aria-label="Obnovit">' + IKONY.obnovit + '</button>' +
      '</div></div>' +
    '<div class="hlava-radek"><div class="hlava-titul"><h1>' + (stav.pohled !== 'dnes' ? '<span class="hlava-ikona" data-oblast="' +
      (stav.pohled === 'reely' ? 'fotbal' : stav.pohled) + '">' + IKONY[stav.pohled] + '</span>' : '') + esc(nadpis) + '</h1>' + (pod ? '<p>' + pod + '</p>' : '') + '</div></div>');
}

function pozdrav() {
  const h = new Date().getHours();
  return h < 4 ? 'Dobrou noc' : h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer';
}

function vykresliPruhy() {
  const pruhy = [];
  if (jeDemo()) pruhy.push('<p class="pruh pruh-ukazka">Ukázková data – skutečná se ukážou po připojení motoru v Nastavení.</p>');
  if (navigator.onLine === false) pruhy.push('<p class="pruh pruh-offline">Jsi offline – ukazuju naposledy uložená data.</p>');
  // motor nejde připojit (špatná adresa, klíč, nasazení) – říct to nahoře, ne jen nechat prázdné karty
  else if (!jeDemo() && stav.chyby.info && stav.chyby.info.kod !== 'sit') {
    pruhy.push('<p class="pruh pruh-varovani spread"><span>Motor není připojený: ' + esc(stav.chyby.info.message) + '</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-otevri-nastaveni="pripojeni">Nastavení připojení</button></p>');
  }
  nastavHtml($('pruhy'), pruhy.join(''));
}

/** Spodní lišta na telefonu: plovoucí černá pilulka, aktivní sekce limetková s popiskem, uprostřed „+“. */
function vykresliListu(p) {
  const tl = (s) => {
    const n = odznakSekce(s[0], p);
    return '<button type="button" class="lista__btn" data-cil="' + s[0] + '" aria-label="' + s[1] + (n ? ', ' + n : '') + '"' +
      (stav.pohled === s[0] ? ' aria-current="page"' : '') + '>' + IKONY[s[0]] + '<span>' + s[1] + '</span>' +
      (n ? '<span class="odznak cisla">' + n + '</span>' : '') + '</button>';
  };
  nastavHtml($('lista'), tl(SEKCE[0]) + tl(SEKCE[1]) +
    '<button type="button" class="lista__plus" data-rychle aria-label="Přidat – poznámku, e-mail, událost nebo zápas">' + IKONY.plus + '</button>' +
    tl(SEKCE[2]) + tl(SEKCE[3]));
}

/** Menu na telefonu (klepnutí na jméno nahoře): pás zleva se všemi sekcemi – i Zdraví, Fotbal, Reely a Plakáty, které se
 *  do spodní lišty nevejdou – a dole Nastavení a kdo je připojený. */
function otevriMenu() {
  otevriPanel({ id: 'menu', trida: 'panel-menu', titul: 'Asistent', vykresli: menuHtml });
}

function menuHtml() {
  const p = pocty();
  const ucet = (stav.info && stav.info.ucet) || (jeDemo() ? 'ukázka' : '');
  return '<nav class="menu" aria-label="Sekce">' + SEKCE.filter(viditelna).map((s) => {
    const n = odznakSekce(s[0], p);
    return '<button type="button" class="menu__btn" data-menu-cil="' + s[0] + '"' + (stav.pohled === s[0] ? ' aria-current="page"' : '') + '>' +
      IKONY[s[0]] + '<span>' + s[1] + '</span>' + (n ? '<span class="pocet cisla">' + n + '</span>' : '') + '</button>';
  }).join('') + '</nav>' +
    '<div class="menu__spodek"><button type="button" class="menu__btn" data-menu-nastaveni>' + IKONY.nastaveni + '<span>Nastavení</span></button>' +
    (ucet ? '<p class="menu__ucet"><span class="avatar" style="--h:' + odstin(ucet) + '">' + esc(iniciala(String(ucet).split('@')[0].replace(/[._\d]+/g, ' '))) + '</span>' +
      '<span><b>' + esc(ucet) + '</b><small>' + (jeDemo() ? 'ukázková data' : stav.chyby.info ? 'motor nepřipojený' : 'připojeno · motor ' + esc((stav.info && stav.info.verze) || '')) + '</small></span></p>' : '') +
    '</div>';
}

/** „+“ v liště: list zespodu s tím, co jde rychle přidat. */
function otevriRychle() {
  const volba = (akce, ikona, barva, nazev, popis) => '<button type="button" data-rychle-akce="' + akce + '"><i class="kruh kruh--' + barva + '">' + ikona + '</i>' +
    '<b>' + nazev + '</b><small>' + popis + '</small></button>';
  otevriPanel({
    id: 'rychle', trida: 'panel-okno panel-rychle', titul: 'Přidat',
    vykresli: () => '<div class="rychle">' +
      volba('poznamka', IKONY.claude, 'fialova', 'Poznámka pro Clauda', 'otázka, úkol, nápad') +
      (moje.umiMoje() ? volba('moje', moje.IKONA, 'moje', 'Moje poznámka', 'jen pro mě, na později – Claude ji nečte') : '') +
      volba('email', IKONY.psat, 'zluta', 'Nový e-mail', 'z osobní nebo pracovní adresy') +
      volba('udalost', IKONY.kalendar, 'zelena', 'Událost', 'do kalendáře, i s pozvánkami') +
      volba('zapas', IKONY.zapas, 'limetka', 'Zápas', 'tým, soupeř, výkop, sraz') +
      (umiMotor('pitiJidlo') ? volba('jidlo', IKONY.jidlo, 'zdravi', 'Jídlo', 'napiš, co jsi měl – bílkoviny spočítám') : '') +
      (umiMotor('vaha') ? volba('vaha', IKONY.vaha, 'oranz', 'Váha', 'kg – zapíše se i s časem') : '') +
      (umiMotor('autoZapsat') ? volba('tankovani', IKONY.palivo, 'auto', 'Tankování', 'částka, cena za litr, km – do tabulky auta') : '') +
      // účtenka: popisek s polem pro fotku – klepnutí otevře nabídku iPhonu (Fotky / Vyfotit / Soubory; jinak okno nepustí)
      (umiMotor('autoUctenka') ? '<label class="rychle__foto"><i class="kruh kruh--auto">' + IKONY.foto + '</i><b>Účtenky</b><small>vyfoť nebo vyber z Fotek (i víc najednou) – zapíšou se samy</small>' +
        '<input type="file" accept="image/*" multiple data-auto-foto hidden></label>' : '') + '</div>'
  });
}

function rychlaAkce(akce) {
  if (akce === 'poznamka') schranka.zamerZapis();
  else if (akce === 'moje') moje.otevriPridani();
  else if (akce === 'email') posta.otevriPsani('novy');
  else if (akce === 'udalost') udalost.otevriFormular({ den: stav.pohled === 'kalendar' ? stav.kal.vybrany : undefined });
  else if (akce === 'zapas') udalost.otevriFormular({ typ: 'zapas', den: stav.pohled === 'kalendar' ? stav.kal.vybrany : undefined });
  else if (akce === 'vaha') zdravi.otevriVahu();
  else if (akce === 'jidlo') zdravi.otevriJidlo();
  else if (akce === 'tankovani') auto.otevriZapis('tankovani');
}

// ---------------------------------------------------------------- Dnes
// Každá věc jen jednou (Michal 2. 10.): nahoře výstrahy ČHMÚ (jen když jsou). Přehledová čísla jsou od 9. 10. malé
// dlaždice v horní liště (počasí, připravenost, nepřečtené, denní kroužky – Další zápas je v kartě Fotbal a v týdnu),
// pod tím „Vyžaduje pozornost“ (úkoly, rozhodnutí, auto), pošta ve vlastní kartě (jen když něco čeká nebo je nepřečtené),
// týden jako krátký výpis a poznámka pro Clauda s malým přehledem schránky.

function sipkaKarty(atributy, popisek) {
  return '<button type="button" class="sipka" ' + atributy + ' aria-label="' + popisek + '" title="' + popisek + '">' + IKONY.sipka + '</button>';
}

/** Co od tebe chce schránka a auto, seřazené: po termínu, dnes, auto, rozhodni, ostatní. Pošta má vlastní kartu (postaNaDnes). */
function pozornost(p) {
  const polozky = [];
  p.ceka.forEach((x) => {
    const t = terminDatum(x.termin);
    const r = t == null ? null : rozdilDni(t);
    polozky.push({ typ: 'schranka', x, t, vaha: r != null && r < 0 ? 0 : r === 0 ? 2 : schranka.skupina(x) === 'rozhodni' ? 3 : 5, kdy: x.kdy });
  });
  // auto: přezutí, servis, pojištění… (z naposledy načtených dat auta)
  auto.pripominkyDnes().forEach((x) => polozky.push({ typ: 'auto', x, vaha: 2.5, kdy: x.od || 0 }));
  return polozky.sort((a, b) => (a.vaha - b.vaha) || (b.kdy - a.kdy));
}

/** „Veselí nad Moravou“ → „Veselí n. M.“, „Nové Město na Moravě“ → „Nové Město n. M.“ (místo na malé dlaždici). */
function mistoKratce(s) {
  return String(s || '').replace(/ (nad|pod|na) (\p{Lu})[\p{L}-]*( \p{L}+)*$/u, (cele, predlozka, pismeno) => ' ' + predlozka.charAt(0) + '. ' + pismeno + '.');
}

/** Text z kousku HTML (štítek a text oddělené „ · “; do bublin title – entity zůstávají ošetřené). */
const bezZnacek = (html) => String(html || '').replace(/<\/span>\s*<span/g, '</span> · <span').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Horní lišta na Dnes (PC, iPad): malé přehledové dlaždice místo řady velkých čísel (Michal 9. 10.: „nemusí to být tak
 * velké … menší dlaždice, primárně přehledové se základníma informacema“) – Počasí a Připravenost širší, Nepřečtené
 * a Kroužky užší (2 : 2 : 1 : 1 podle nákresu). Id „dnes-kpi“ zůstalo (odkazy a testy). Na telefonu malá čísla v dnesMobilHtml.
 */
function dlazdiceHorniHtml(p) {
  const dl = (trida, atributy, ikona, hodnota, popis, titulek) => '<button type="button" class="hd ' + trida + '" ' + atributy +
    (titulek ? ' title="' + titulek + '"' : '') + '><span class="hd__ikona">' + ikona + '</span>' +
    '<span class="hd__text"><b class="hd__hodnota cisla">' + hodnota + '</b><small class="hd__popis">' + popis + '</small></span></button>';
  const d = [];
  // počasí (ČHMÚ, „teď“ z Open-Meteo): ikona, teplota, místo zkráceně; předpověď a výstrahy v bublině a v detailu
  if (staryMotor()) {
    d.push(dl('hd--siroka', 'data-oblast="pocasi" data-otevri-nastaveni="pripojeni"', IKONY.polojasno, '–', 'nasaď Novou verzi motoru',
      'Počasí ukáže nová verze motoru – návod je v Nastavení → Připojení'));
  } else if (umiMotor('pocasi')) {
    if (stav.pocasi) {
      const k = pocasi.kartaPocasi();
      const v = pocasi.vystrahy().length;
      d.push(dl('hd--siroka', 'data-oblast="pocasi" data-pocasi', k.ikona, esc(k.hodnota) + (k.jednotka ? '<small>' + esc(k.jednotka) + '</small>' : '') +
        (v ? '<i class="hd__pozor" aria-label="výstrahy ČHMÚ: ' + v + '">' + IKONY.pozor + '</i>' : ''), esc(mistoKratce(k.nazev)), esc(k.nazev) + ' · ' + bezZnacek(k.pod)));
    } else {
      d.push(dl('hd--siroka', 'data-oblast="pocasi" data-pocasi', IKONY.polojasno, '–', stav.chyby.pocasi ? 'nejde načíst' : 'načítám ČHMÚ…',
        esc(stav.chyby.pocasi ? stav.chyby.pocasi.message : '')));
    }
  }
  // připravenost (WHOOP; bez WHOOP kroky z Apple Watch): číslo v barvě zóny, spánek a HRV v popisku
  if (umiMotor('zdravi') && zdravi.maData()) {
    const z = zdravi.kartaZdravi();
    const zon = z.jednotka === '%' ? zdravi.zona(Number(z.hodnota)) : '';
    const pod = bezZnacek(z.pod).replace(/^(zelená|žlutá|červená)( · )?/, '');
    d.push(dl('hd--siroka' + (zon ? ' hd--' + zon : ''), 'data-oblast="zdravi" data-cil="zdravi"', IKONY.srdce,
      esc(z.hodnota) + (z.jednotka ? '<small>' + esc(z.jednotka) + '</small>' : ''), esc(z.nazev) + (pod ? ' · ' + pod : ''),
      esc(z.nazev) + ' ' + esc(z.hodnota) + (z.jednotka ? ' ' + esc(z.jednotka) : '') + ' · ' + bezZnacek(z.pod)));
  }
  // nepřečtené: počet, kolik čeká na odpověď, hoří; nic → fajfka „vše přečteno“
  const nep = p.nep.length, ceka = p.pozornost.length;
  const kPoste = 'data-oblast="posta" data-cil="posta" data-filtr-posty=';
  if (!stav.posta) {
    d.push(dl('hd--uzka', kPoste + '"neprectene"', IKONY.posta, '–', stav.chyby.posta ? 'nejde načíst' : 'načítám…', 'Nepřečtená pošta'));
  } else if (!nep && !ceka) {
    d.push(dl('hd--uzka hd--hotovo', kPoste + '"vse"', IKONY.fajfka, 'vše', 'přečteno', 'Pošta: vše přečteno a vyřízené'));
  } else {
    const popis = p.hori ? '<em class="hd__hori">' + p.hori + ' hoří</em>' : ceka ? ceka + ' čeká' : tvar(nep, 'nepřečtený', 'nepřečtené', 'nepřečtených');
    d.push(dl('hd--uzka', kPoste + '"' + (nep ? 'neprectene' : 'vse') + '"', IKONY.posta, String(nep), popis,
      'Nepřečtené: ' + nep + ' · čeká na odpověď: ' + ceka + (p.hori ? ' · hoří: ' + p.hori : '')));
  }
  // denní kroužky: voda, bílkoviny, pohyb (js/krouzky.js)
  const k = umiMotor('zdravi') ? krouzky.krouzkyDnes() : null;
  if (k) {
    const popis = 'Denní kroužky – ' + krouzky.popisKrouzku(k);
    d.push('<button type="button" class="hd hd--uzka hd--krouzky" data-oblast="zdravi" data-cil="zdravi" data-krouzky title="' + esc(popis) + '" aria-label="' + esc(popis) + '">' +
      krouzky.krouzkySvg(k) + krouzky.legendaHtml(k) + '</button>');
  }
  return '<div class="horni__dlazdice" id="dnes-kpi" role="group" aria-label="Přehled dne">' + d.join('') + '</div>';
}

function kartaPozornosti(p) {
  const seznam = pozornost(p);
  let telo;
  if (!stav.schranka) telo = stav.chyby.schranka ? chybaHtml(stav.chyby.schranka, 'data-schranka-znovu') : kostra(4);
  else if (!seznam.length) telo = '<div class="prazdne">Žádné úkoly ani rozhodnutí. Užij si to.</div>';
  else {
    telo = '<ul class="seznam">' + seznam.slice(0, 10).map((x) => (x.typ === 'auto' ? auto.pripominkaDnesHtml(x.x) : schranka.polozkaHtml(x.x, true))).join('') + '</ul>' +
      (seznam.length > 10 ? '<p class="dlazdice__napoveda">a dalších ' + (seznam.length - 10) + ' ve schránce</p>' : '');
  }
  const pata = '<button type="button" class="dlazdice__pata" data-cil="schranka" data-filtr-schranky="vse">' + IKONY.schranka + 'Schránka' +
    (stav.schranka ? ' · ' + schranka.vsechnyPolozky().length : '') + '</button>';
  return hlavickaKarty(IKONY.fajfka, 'Vyžaduje pozornost' + (seznam.length ? ' · ' + seznam.length : '')) +
    '<div class="dlazdice__telo">' + telo + '</div>' + pata;
}

/** Karta Pošta na Dnes: k vyřízení a nepřečtené (řádky jako v Poště), nepřečtené Aktualizace jedním řádkem. */
function kartaPosty(d) {
  let telo;
  if (!stav.posta) telo = stav.chyby.posta ? chybaHtml(stav.chyby.posta, 'data-posta-znovu') : kostra(3);
  else {
    const n = d.aktualizace.length;
    telo = (d.seznam.length ? '<ul class="seznam">' + d.seznam.slice(0, 6).map((m) => posta.zpravaRadekHtml(m, posta.maPracovni())).join('') + '</ul>' : '') +
      (d.seznam.length > 6 ? '<button type="button" class="agenda__vic" data-cil="posta" data-filtr-posty="vse">+ ' + (d.seznam.length - 6) + ' další v poště</button>' : '') +
      (n ? '<button type="button" class="dl-posta__aktualizace" data-cil="posta" data-filtr-posty="neprectene" data-kategorie-posty="aktualizace">' + IKONY.info +
        '<span>' + n + ' ' + tvar(n, 'nepřečtený', 'nepřečtené', 'nepřečtených') + ' v Aktualizacích</span>' + IKONY.vpravo + '</button>' : '');
  }
  const hori = d.seznam.filter((m) => posta.stavZpravy(m) === 'hori').length;
  return hlavickaKarty(IKONY.posta, 'Pošta' + (d.celkem ? ' · ' + d.celkem : ''),
    (hori ? '<span class="tag tag--danger">' + hori + ' hoří</span>' : '') + sipkaKarty('data-cil="posta" data-filtr-posty="vse"', 'Otevřít poštu')) +
    '<div class="dlazdice__telo">' + telo + '</div>';
}

function kartaTydne() {
  const a = kal.agenda(7, 9);
  let telo;
  if (!kal.mameData(Date.now())) telo = kal.chybaKalendare() ? chybaHtml(kal.chybaKalendare(), 'data-kal-znovu') : kostra(3);
  // prázdný týden: dny se svátky zůstanou (svátky nejsou v kalendáři Google – oblíbený ★ by jinak zmizel), pod nimi věta
  else if (!a.celkem) telo = a.html + '<p class="agenda__prazdno">Příštích 7 dní nic v kalendáři.</p>';
  else telo = a.html + (a.celkem > a.pocet ? '<button type="button" class="agenda__vic" data-cil="kalendar">+ ' + (a.celkem - a.pocet) + ' další v kalendáři</button>' : '');
  return hlavickaKarty(IKONY.kalendar, 'Týden' + (a.celkem ? ' · ' + a.celkem : ''), sipkaKarty('data-cil="kalendar"', 'Otevřít kalendář')) +
    '<div class="dlazdice__telo">' + telo + '</div>';
}

/** Malý přehled schránky: jen to, co v „Vyžaduje pozornost“ není (u Clauda, nápady). */
function miniSchrankaHtml() {
  if (!stav.schranka) return '';
  const sk = schranka.skupinyPocty();
  const volby = [['nove', 'U Clauda'], ['napad', 'Nápady']].filter((g) => sk[g[0]]);
  return volby.length ? '<div class="mini-schranka">' + volby.map((g) => '<button type="button" class="chip" data-cil="schranka" data-filtr-schranky="' + g[0] + '">' +
    g[1] + '<span class="pocet cisla">' + sk[g[0]] + '</span></button>').join('') + '</div>' : '';
}

function vykresliDnes(el, p) {
  if (!el.querySelector('#dnes-obsah')) {
    // přehledová čísla jsou v horní liště (dlazdiceHorniHtml), na telefonu v #dnes-mobil; pod „Vyžaduje pozornost“
    // Moje poznámky (js/moje.js) a pošta ve vlastní kartě (schovaná, když je vyřízená)
    el.innerHTML = '<div id="dnes-vystrahy"></div><div class="dnes-mobil" id="dnes-mobil"></div>' +
      '<div class="dnes-mrizka" id="dnes-obsah">' +
      '<section class="card dlazdice dl-pozornost" id="dl-pozornost"></section>' +
      '<div class="dnes-vpravo"><section class="card dlazdice dl-moje" id="dl-moje" data-oblast="schranka" hidden></section>' +
      '<section class="card dlazdice dl-posta" id="dl-posta" data-oblast="posta" hidden></section>' +
      '<section class="card dlazdice dl-tyden" id="dl-tyden" data-oblast="kalendar"></section>' +
      '<section class="card dlazdice dl-doplnky" id="dl-doplnky" data-oblast="zdravi" hidden></section>' +
      '<section class="card dlazdice dl-piti" id="dl-piti" data-oblast="zdravi" hidden></section>' +
      '<section class="card dlazdice dl-vaha" id="dl-vaha" data-oblast="zdravi" hidden></section>' +
      '<section class="dl-reel" id="dl-reel" hidden></section>' +
      '<section class="card dlazdice dl-fotbal" id="dl-fotbal" data-oblast="fotbal" hidden></section>' +
      '<section class="card dlazdice dl-zapis" data-oblast="schranka">' + hlavickaKarty(IKONY.claude, 'Poznámka pro Clauda') +
        schranka.zapisHtml(true) + '<div id="dl-schranka-mini"></div><div class="dlazdice__telo" id="dl-zapis-seznam"></div></section></div>' +
    '</div>';
  }
  const dnes = pulnoc(Date.now());
  // karty se přepíšou jen při změně (nastavHtml) – načtení pošty nepřekresluje zdraví, týden ani rozepsanou odpověď Claudovi
  nastavHtml(el.querySelector('#dnes-vystrahy'), pocasi.pruhVystrahHtml());
  // pošta: karta jen, když něco čeká nebo je nepřečtené (a dokud se načítá); na telefonu je v dnesMobilHtml
  const postaEl = el.querySelector('#dl-posta');
  const ukazPostu = !TELEFON.matches && (!stav.posta || p.postaDnes.celkem > 0);
  postaEl.hidden = !ukazPostu;
  nastavHtml(postaEl, ukazPostu ? kartaPosty(p.postaDnes) : '');
  if (TELEFON.matches) nastavHtml(el.querySelector('#dnes-mobil'), dnesMobilHtml(p, dnes));
  else nastavHtml(el.querySelector('#dl-pozornost'), kartaPozornosti(p));
  nastavHtml(el.querySelector('#dl-tyden'), kartaTydne());
  // moje poznámky (zkratka „Pro mě“) – kartu skládá js/moje.js; když se do jejího pole zrovna píše, překreslí jen hlavičku
  // a seznam (pole, rozepsaný text i klávesnice v iPhonu zůstanou, nová poznámka se po Enteru hned ukáže)
  const mojeEl = el.querySelector('#dl-moje');
  mojeEl.hidden = !moje.vykresliMojeDnes(mojeEl);
  const doplnkyHtml = umiMotor('zdravi') ? zdravi.kartaDoplnkuHtml() : '';
  el.querySelector('#dl-doplnky').hidden = !doplnkyHtml;
  nastavHtml(el.querySelector('#dl-doplnky'), doplnkyHtml);
  const pitiHtml = umiMotor('zdravi') ? zdravi.kartaPitiHtml() : '';
  el.querySelector('#dl-piti').hidden = !pitiHtml;
  nastavHtml(el.querySelector('#dl-piti'), pitiHtml);
  // váha: když se do pole zrovna píše, kartu nepřekreslovat (zmizela by rozepsaná hodnota i klávesnice)
  const vahaEl = el.querySelector('#dl-vaha');
  const piseVahu = document.activeElement && vahaEl.contains(document.activeElement) && document.activeElement.matches('[data-vaha-pole]');
  if (!piseVahu) {
    const vahaHtml = umiMotor('vaha') ? zdravi.kartaVahyDnesHtml() : '';
    vahaEl.hidden = !vahaHtml;
    nastavHtml(vahaEl, vahaHtml);
  }
  // čerstvý nezveřejněný reel: na PC v pravém sloupci, na telefonu hned pod malými čísly (dnesMobilHtml)
  const reelHtml = umiMotor('reely') && !TELEFON.matches ? reely.kartaDnesHtml() : '';
  el.querySelector('#dl-reel').hidden = !reelHtml;
  nastavHtml(el.querySelector('#dl-reel'), reelHtml);
  const fotbalHtml = fotbal.maData() ? fotbal.kartaDnesHtml() : '';
  el.querySelector('#dl-fotbal').hidden = !fotbalHtml;
  nastavHtml(el.querySelector('#dl-fotbal'), fotbalHtml);
  nastavHtml(el.querySelector('#dl-schranka-mini'), miniSchrankaHtml());
  // pod polem: co Claude odpověděl za poslední týden (celá odpověď je v rozbalené položce)
  const odpovedi = schranka.odpovedi(7);
  nastavHtml(el.querySelector('#dl-zapis-seznam'), odpovedi.length
    ? '<div class="dlazdice__mezinadpis">Odpověděl jsem · ' + odpovedi.length + '</div><ul class="seznam">' +
      odpovedi.slice(0, 3).map((x) => schranka.polozkaHtml(x, false)).join('') + '</ul>' +
      (odpovedi.length > 3 ? '<button type="button" class="agenda__vic" data-cil="schranka" data-filtr-schranky="hotovo">+ ' + (odpovedi.length - 3) + ' další ve schránce</button>' : '')
    : '<p class="poznamka-pod dlazdice__napoveda">Co sem napíšeš, zpracuju při další schránce a odpověď uvidíš tady. Z iPhonu jde totéž hlasem přes zkratku „Pro Clauda“.</p>');
  schranka.obnovRozepsane(el);
}

/** innerHTML jen při změně: Dnes se překresluje při každém načtení dat (kopie ze serveru, zdraví, počasí…) – stejný obsah
 *  znovu by prohlížeč zbytečně skládal a zmizel by rozepsaný text, fokus i otevřená bublina grafu. */
const posledniObsah = new WeakMap();
function nastavHtml(el, html) {
  if (posledniObsah.get(el) === html) return;
  posledniObsah.set(el, html);
  el.innerHTML = html;
}

/** Když se při překreslení přece jen vymění pole, do kterého se píše (odpověď Claudovi), vrátit do nového fokus a kurzor. */
function sFokusem(vykresleni) {
  const a = document.activeElement;
  const sel = a && a.matches && a.matches('textarea[data-odpoved]') ? 'textarea[data-odpoved="' + CSS.escape(a.dataset.odpoved) + '"]' : '';
  const kde = sel && a.closest('[data-pohled]');
  const z = sel ? [a.selectionStart, a.selectionEnd] : null;
  vykresleni();
  if (!sel || a.isConnected || !kde) return;
  const n = kde.querySelector(sel);
  if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(z[0], z[1]); } catch (e) { /* nic */ } }
}

// ---------------------------------------------------------------- Dnes na telefonu (vzor PriorAuth)

function kdyTerminu(t) {
  const r = rozdilDni(t);
  return r < 0 ? 'po termínu · ' + dm(t) : r === 0 ? 'dnes' : r === 1 ? 'zítra' : dm(t);
}

function pozorKartaHtml(x) {
  // připomínka auta (přezutí, STK…) není e-mail – dřív se ukázala jako pošta s časem místo názvu a otevřením „Neplatný argument“
  if (x.typ === 'auto') return auto.pripominkaPozorHtml(x.x);
  if (x.typ === 'schranka') {
    const p = x.x;
    return '<li><button type="button" class="pozor" data-ukaz-polozku="' + esc(p.id) + '">' +
      '<span class="pozor__hora"><i class="kruh kruh--' + (p.navrh ? 'limetka' : schranka.skupina(p) === 'rozhodni' ? 'oranz' : 'zluta') + '">' +
        (p.navrh ? (p.navrh.typ === 'email' ? IKONY.psat : IKONY.kalendar) : IKONY.schranka) + '</i>' +
      '<span class="pozor__text"><b>' + esc(p.nadpis || p.shrnuti || prvniRadek(p.text, 80)) + '</b><small>' +
      (p.navrh ? 'Návrh od Clauda – ' + (p.navrh.typ === 'email' ? 'zkontroluj a odešli e-mail' : 'zkontroluj a ulož událost')
        : schranka.skupina(p) === 'rozhodni' ? 'Rozhodni – Claude čeká na tvé ano' : 'Tvůj úkol · zadáno ' + esc(kdyKratce(p.kdy))) + '</small></span></span>' +
      (x.t != null ? '<span class="pozor__radek">' + IKONY.cas + '<span>Termín</span><em>' + esc(kdyTerminu(x.t)) + '</em></span>' : '') + '</button></li>';
  }
  const m = x.x;
  return '<li><button type="button" class="pozor' + (m.neprectena ? ' pozor--neprect' : '') + '" data-vlakno="' + esc(m.id) + '">' +
    '<span class="pozor__hora"><span class="avatar" style="--h:' + odstin(m.od) + '">' + esc(iniciala(m.od)) + '</span>' +
    '<span class="pozor__text"><b>' + esc(m.od) + '</b><small>' + esc(m.predmet) + '</small></span>' + posta.stavTag(m) + '</span>' +
    (m.termin ? '<span class="pozor__radek">' + IKONY.cas + '<span>' + esc(m.terminVeta || 'Termín') + '</span><em>' + esc(kdyTerminu(m.termin)) + '</em></span>'
      : '<span class="pozor__radek">' + IKONY.posta + '<span>' + esc(prvniRadek(m.ukazka || '', 90)) + '</span><em>' + esc(kdyKratce(m.kdy)) + '</em></span>') +
    '</button></li>';
}

function dnesMobilHtml(p, dnes) {
  const t = p.terminy;
  const nacteno = stav.schranka && stav.posta;
  const seznam = pozornost(p);
  const ps = p.postaDnes;
  // hlavní karta: všechno, co čeká na tebe (úkoly, rozhodnutí, auto + pošta k odpovědi); seznamy pod ní jsou dva
  const celkem = seznam.length + p.pozornost.length;
  const pod = [t.poTerminu ? t.poTerminu + ' po termínu' : '', p.hori ? p.hori + ' hoří v poště' : '',
    t.dnes ? t.dnes + ' na dnes' : ''].filter(Boolean).join(' · ') || (celkem ? 'úkoly, rozhodnutí a pošta' : 'nic nečeká – klid');
  let h = '<section class="hero">' +
    '<div class="hero__hlava"><span class="hero__stitek">' + IKONY.fajfka + 'Čeká na tebe</span>' +
      '<button type="button" class="hero__sipka" data-cil="schranka" data-filtr-schranky="vse" aria-label="Otevřít schránku">' + IKONY.sipka + '</button></div>' +
    '<div class="hero__telo"><b class="hero__cislo cisla">' + (nacteno ? celkem : '–') + '</b><p>' + esc(nacteno ? pod : 'Načítám…') + '</p>' +
      '<div class="hero__deleni">' +
        '<button type="button" data-cil="schranka" data-filtr-schranky="vse"><small>Úkoly a rozhodnutí</small><b>' + (stav.schranka ? seznam.length : '–') + '</b></button>' +
        '<button type="button" data-cil="posta" data-filtr-posty="vse"><small>Pošta čeká na odpověď</small><b>' + (stav.posta ? p.pozornost.length : '–') + '</b></button>' +
      '</div></div></section>';
  // malá čísla: počasí, připravenost a denní kroužky (Další zápas je v kartě Fotbal a v týdnu, pošta v seznamu níž)
  const mala = (atr, ikona, barva, cislo, popis, trend) => '<button type="button" class="mini-kpi" ' + atr + '>' +
    '<span class="mini-kpi__hlava"><i class="kruh kruh--' + barva + '">' + ikona + '</i>' + (trend ? '<span class="trend">' + trend + '</span>' : '') + '</span>' +
    '<b class="cisla">' + cislo + '</b><small>' + popis + '</small></button>';
  const male = [];
  if (umiMotor('pocasi') && stav.pocasi) {
    const np = pocasi.nejblizsiPredpoved();
    const v = pocasi.vystrahy();
    male.push(mala('data-oblast="pocasi" data-pocasi', np ? ikonaPocasi(np.p.ikona) : IKONY.polojasno, v.length ? 'oranz' : 'zluta', np ? pocasi.teplotaKratce(np.p) : '–',
      'Počasí ' + (np ? np.kdy : ''), v.length ? '⚠ ' + v.length : ''));
  }
  if (umiMotor('zdravi') && zdravi.maData()) {
    const z = zdravi.kartaZdravi();
    male.push(mala('data-oblast="zdravi" data-cil="zdravi"', IKONY.srdce, 'zdravi', z.hodnota + (z.jednotka === '%' ? '%' : ''), z.nazev, ''));
  }
  const k = umiMotor('zdravi') ? krouzky.krouzkyDnes() : null;
  if (k) {
    const popis = 'Denní kroužky – ' + krouzky.popisKrouzku(k);
    male.push('<button type="button" class="mini-kpi mini-kpi--krouzky" data-oblast="zdravi" data-cil="zdravi" data-krouzky title="' + esc(popis) + '" aria-label="' + esc(popis) + '">' +
      krouzky.krouzkySvg(k) + krouzky.legendaHtml(k, true) + '</button>');
  }
  if (male.length < 3) {
    male.push(mala('data-oblast="posta" data-cil="posta" data-filtr-posty="neprectene"', IKONY.posta, p.hori ? 'oranz' : 'fialova', stav.posta ? p.nep.length : '–',
      'Nepřečtené', p.hori ? '↗ ' + p.hori + ' hoří' : ''));
  }
  h += '<div class="mini-kpi-rada">' + male.slice(0, 3).join('') + '</div>';
  if (umiMotor('reely')) h += reely.kartaDnesHtml(); // limetková karta „Reel k vyvěšení“ (jen když je čerstvý nezveřejněný)
  h += '<section class="pozornost"><div class="pozornost__hlava"><h2>Vyžaduje pozornost</h2>' +
    (seznam.length ? '<span class="pilulka-oranz cisla">' + seznam.length + '</span>' : '') + '</div>';
  if (!stav.schranka) h += '<div class="card">' + (stav.chyby.schranka ? chybaHtml(stav.chyby.schranka, 'data-schranka-znovu') : kostra(3)) + '</div>';
  else if (!seznam.length) h += '<div class="card"><div class="prazdne">Žádné úkoly ani rozhodnutí. Užij si to.</div></div>';
  else {
    h += '<ul>' + seznam.slice(0, 6).map(pozorKartaHtml).join('') + '</ul>' +
      '<div class="pozornost__dalsi"><button type="button" class="btn btn--ghost" data-cil="schranka" data-filtr-schranky="vse">Celá schránka</button></div>';
  }
  h += '</section>';
  // pošta zvlášť (jako karta Pošta na PC): co čeká a nepřečtené; když je vyřízená, sekce není
  if (!stav.posta || ps.celkem) {
    h += '<section class="pozornost pozornost--posta"><div class="pozornost__hlava"><h2>Pošta</h2>' +
      (ps.celkem ? '<span class="pilulka-oranz cisla">' + ps.celkem + '</span>' : '') + '</div>';
    if (!stav.posta) h += '<div class="card">' + (stav.chyby.posta ? chybaHtml(stav.chyby.posta, 'data-posta-znovu') : kostra(2)) + '</div>';
    else {
      const n = ps.aktualizace.length;
      h += (ps.seznam.length ? '<ul>' + ps.seznam.slice(0, 5).map((m) => pozorKartaHtml({ typ: 'posta', x: m })).join('') + '</ul>' : '') +
        (n ? '<button type="button" class="dl-posta__aktualizace" data-cil="posta" data-filtr-posty="neprectene" data-kategorie-posty="aktualizace">' + IKONY.info +
          '<span>' + n + ' ' + tvar(n, 'nepřečtený', 'nepřečtené', 'nepřečtených') + ' v Aktualizacích</span>' + IKONY.vpravo + '</button>' : '') +
        '<div class="pozornost__dalsi"><button type="button" class="btn btn--ghost" data-cil="posta" data-filtr-posty="vse">Celá pošta' +
          (ps.seznam.length > 5 ? ' · ' + (ps.seznam.length - 5) + ' další' : '') + '</button></div>';
    }
    h += '</section>';
  }
  return h;
}

// ---------------------------------------------------------------- ovládání

document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a[data-cil], [data-udalost]');
  if (!el || el.closest('#uvod')) return;

  // levý pás: připnout / odepnout; výběr sekce rozbalený pás sbalí (jinak by zakrýval otevřenou stránku)
  if (el.hasAttribute('data-rail-pripnout')) { prepniPripnuti(); return; }
  if (el.closest('#rail')) sbalRail();
  if (el.hasAttribute('data-zavrit-panel')) { zavriPanel(); return; }
  if (el.hasAttribute('data-menu')) { otevriMenu(); return; }
  if (el.dataset.menuCil) { const cil = el.dataset.menuCil; zavriAPak(() => { prejdi(cil); zmeneno(); }); return; }
  if (el.hasAttribute('data-menu-nastaveni')) { zavriAPak(() => nast.otevriNastaveni()); return; }
  if (el.hasAttribute('data-rychle')) { otevriRychle(); return; }
  if (el.dataset.rychleAkce) { const akce = el.dataset.rychleAkce; zavriAPak(() => rychlaAkce(akce)); return; }
  if (el.dataset.ukazPolozku) { schranka.ukazPolozku(el.dataset.ukazPolozku); return; }
  if (el.hasAttribute('data-pocasi')) { pocasi.ukazDetail(); return; }
  if (hledat.klikHledat(el)) return;
  if (el.dataset.cil) {
    // proklik rovnou s filtrem (z čísel a karet na Dnes); záložka Pošty jen u „nepřečtené v Aktualizacích“, jinak Primární
    if (el.dataset.filtrPosty) { stav.filtrPosty = el.dataset.filtrPosty; stav.kategoriePosty = el.dataset.kategoriePosty || 'primarni'; stav.stitekPosty = ''; }
    if (el.dataset.filtrSchranky) { stav.filtrSchranky = el.dataset.filtrSchranky; }
    prejdi(el.dataset.cil);
    zmeneno();
    return;
  }
  if (el.hasAttribute('data-obnovit')) { rucneObnovuje = true; obnovVse(true); return; }
  if (el.hasAttribute('data-hledat')) { hledat.otevriHledani(); return; }
  if (el.hasAttribute('data-otevri-nastaveni')) { nast.otevriNastaveni(el.dataset.otevriNastaveni); return; }
  if (el.hasAttribute('data-nova-poznamka')) { schranka.zamerZapis(); return; }
  if (el.dataset.skocDen) {
    stav.kal.vybrany = Number(el.dataset.skocDen);
    kal.nactiKalendar();
    prejdi('kalendar');
    zmeneno();
    return;
  }
  // e-mail otevřený z Dnes na širokém okně patří do pohledu Pošta (seznam + detail vedle sebe)
  if (el.dataset.vlakno && stav.pohled !== 'posta' && window.matchMedia('(min-width: 1000px)').matches) prejdi('posta');
  if (moje.klikMoje(el)) return;
  if (schranka.klikSchranka(el)) return;
  if (posta.klikPosta(el)) return;
  if (zdravi.klikZdravi(el)) return;
  if (reely.klikReely(el)) return;
  if (plakaty.klikPlakaty(el)) return;
  if (auto.klikAuto(el)) return;
  if (fotbal.klikFotbal(el)) return;
  if (udalost.klikUdalost(el)) return;
  if (kal.klikKalendar(el)) return;
  nast.klikNastaveni(el);
});

document.addEventListener('input', (e) => {
  vstupAdresy(e);
  if (zdravi.vstupZdravi(e)) return;
  if (auto.vstupAuto(e)) return;
  if (reely.vstupReely(e)) return;
  if (plakaty.vstupPlakaty(e)) return;
  if (hledat.vstupHledat(e)) return;
  if (udalost.vstupUdalost(e)) return;
  if (moje.vstupMoje(e)) return;
  if (schranka.vstupSchranka(e)) return;
  posta.vstupPosta(e);
});

// pravé tlačítko / dlouhé podržení na položce schránky nebo mé poznámce: malá nabídka (Smazat, Hotovo… – js/nabidka.js)
nabidka.pripoj((el) => schranka.nabidkaPolozky(el) || moje.nabidkaMoje(el));

document.addEventListener('change', (e) => { if (!auto.zmenaAuto(e) && !reely.vstupReely(e) && !plakaty.vstupPlakaty(e) && !posta.zmenaPosta(e) && !udalost.zmenaUdalost(e) && !kal.zmenaKalendar(e)) nast.zmenaNastaveni(e); });

function pise(e) {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

document.addEventListener('keydown', (e) => {
  if ($('aplikace').hidden) return;
  if (klavesaAdresy(e)) return;
  if (zdravi.klavesaZdravi(e)) return; // Enter v poli váhy = Zapsat
  if (auto.klavesaAuto(e)) return; // Enter v okně tankování / výdaje = Zapsat
  if (moje.klavesaMoje(e)) return; // Enter v poli Moje poznámky = Přidat
  // Ctrl/Cmd+K = hledání (všude)
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); hledat.otevriHledani(); return; }
  // Ctrl/Cmd+Enter uloží poznámku nebo odešle e-mail
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    if (e.target.matches('[data-zapis]')) { e.preventDefault(); e.target.closest('.zapis').querySelector('[data-ulozit]').click(); }
    else if (e.target.closest('[data-panel="psani"]')) { e.preventDefault(); const t = document.querySelector('[data-panel="psani"] [data-odeslat]'); if (t) t.click(); }
    return;
  }
  if (e.key === 'Escape' && horniPanel()) { zavriPanel(); return; }
  if (hledat.klavesaHledat(e)) return;
  if (pise(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  // jednoduché klávesy (PC, iPad s klávesnicí)
  if (e.key === '/') { e.preventDefault(); hledat.otevriHledani(); return; }
  if (!horniPanel() && /^[1-9]$/.test(e.key)) { const s = SEKCE.filter(viditelna)[Number(e.key) - 1]; if (s) prejdi(s[0]); return; }
  if (!horniPanel() && stav.pohled === 'kalendar' && e.key.toLowerCase() === 'n') { udalost.otevriFormular({ den: stav.kal.vybrany }); return; }
  if (posta.klavesaPosta(e)) e.preventDefault();
});

// odchod z aplikace (do pozadí, zavření, přenačtení): snímek pro okamžitý start příště (js/start.js)
window.addEventListener('pagehide', ulozSnimek);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') ulozSnimek();
  if (document.visibilityState === 'visible' && jePripojeno() && Date.now() - stav.naposledy > 60000) {
    // po delší pauze (aplikace v pozadí) zase ukázat, co je nového
    if (Date.now() - stav.naposledy > 30 * 60000) novinkyUkazany = false;
    obnovVse(false);
  }
});
window.addEventListener('online', () => { zmeneno(); if (jePripojeno()) obnovVse(false); });
window.addEventListener('offline', zmeneno);
// telefon ↔ iPad/PC (otočení, změna okna): jiná hlavička a přehled Dnes; přes 1180 px celý / úzký levý pás
TELEFON.addEventListener('change', zmeneno);
SIROKY.addEventListener('change', () => { sbalRail(); zmeneno(); });
// klepnutí vedle vysunutého menu ho zavře
document.querySelector('#panely .panel-pozadi').addEventListener('click', () => { const h = horniPanel(); if (h && h.id === 'menu') zavriPanel(); });

// ---------------------------------------------------------------- spuštění

nast.aplikujVzhled();
if (jePripojeno()) start(); else nast.vykresliUvod(start);
// service worker, nová verze a záchrana při prázdné obrazovce: js/start.js (běží i bez modulů)
