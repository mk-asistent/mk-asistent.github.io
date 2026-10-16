// Plakáty: program víkendu FK Agro Vnorovy na A3 – tvoření a tisk stejně jako stránka Plakáty na webu dorostu (náhled,
// editor s uložením 700 ms po psaní, „Vrátit podle rozlosování“, tisk do PDF) a navíc obrázek ke stažení a Instagram:
// příspěvek + příběh s popiskem od Clauda, zveřejnění v naplánovaný čas nebo hned (motor, jako u reelů; průběh s časy,
// zaseknutí a Zkusit znovu ukazuje js/ig.js). Okno plánu jako u reelu: kdy, popisek (drží se k plánu), účty k označení,
// příběh, náhled obrázků. Na iPhonu se obrázek ke stažení chystá dopředu a sdílí hned v klepnutí (oddíl „obrázek“).
// Plakát podle rozlosování skládá js/plakat.js ze zápasů fotbal.cz (stav.fotbal) a mládeže (plakat_data.js); ruční úpravy
// kol, nastavení, popisky, obrázky a plán drží motor (akce plakaty, plakatUlozit… → CLAUDE_SCHRANKA/PLAKATY).

import { stav, zmeneno, umiMotor, hooky, prejdi } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, DNY_KR, terminDatum, pridejDny, isoDatum, hhmm, otevriOdkaz } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, kostra, chybaHtml, potvrd, hlavickaKarty, segment, kopiruj } from './ui.js';
import { pripoj as pripojNabidku } from './nabidka.js';
import { otevriPanel, zavriPanel, obnovPanel, elementPanelu, jeOtevreny } from './panely.js';
import { LOGA } from './plakat_data.js';
import * as P from './plakat.js';
import * as ig_ from './ig.js'; // průběh zveřejňování (ig_ – „ig“ je níž okno plánu a stav Instagramu z motoru)
import { uctyKOznaceni, casKratce } from './ig_prubeh.js'; // zmínky / označení – stejná kontrola jako motor
import { navrhyHtml } from './ig_navrhy.js'; // 2 návrhy popisku od Clauda na výběr (jako u reelu)
import * as skupiny from './ig_skupiny.js'; // skupiny lidí k označení (čipy u pole Označit účty, Michal 16. 10.)

const ULOZISTE = 'asistent.data.plakaty';
const OTISKY = 'asistent.plakaty.otisky';   // víkend → otisk plakátu, ze kterého jsou obrázky na Instagramu (v tomhle zařízení)
const OZNACIT = 'asistent.ig.oznacitPlakat'; // účty k označení, které Michal u plakátu napsal naposledy
const CESTY = { znaky: 'plakat/znaky/', qr: 'plakat/qr/instagram.png' };
// knihovna na obrázek z plakátu – stahuje se až při prvním stažení obrázku nebo plánu na Instagram. Je přímo v aplikaci
// (html2canvas 1.4.1, MIT – bajtově stejná jako cdnjs i balíček npm, ověřeno 9. 10. 2026), ne z cizího serveru: v aplikaci
// je v zařízení klíč motoru a cizí skript by k němu měl přístup.
const HTML2CANVAS = 'js/vendor/html2canvas.min.js';
const PISMA = ['400 40px Anton', '700 20px "Roboto Condensed"', '600 20px "Roboto Condensed"'];
const ULOZIT_PO = 700;        // ms po posledním písmenu (jako web dorostu)
const PRIPRAVA_PO = 1500;     // ms klidu po otevření stránky / poslední změně plakátu, než se obrázek pro iPhone začne kreslit
const SIRKA = 1400, VYSKA = 990;
const NAHLED_PC = 720; // nejširší náhled plakátu na stránce (px); tisk a obrázek mají plnou velikost
const NAZVY_TYMU = { A: 'A-tým', B: 'B-tým', dorost: 'Dorost' };
const pauza = (ms) => new Promise((hotovo) => setTimeout(hotovo, ms));

const p = {
  sobota: '',            // vybraný víkend (sobota v ISO)
  plakat: null,          // plakát na obrazovce – 10 polí jako na webu dorostu
  plakatVikend: '',      // ke kterému víkendu p.plakat patří
  klic: '',              // odkud plakát je (víkend + uložená verze / otisk rozlosování) – jiný klíč = načíst znovu
  upraveno: false, poznamky: [],
  verzeEditoru: 0, plakatVerze: 0, nahledVerze: -1,
  mistni: false, zmen: 0, casovac: 0,            // rozepsané změny plakátu (uloží se 700 ms po psaní)
  fronta: Promise.resolve(),                      // zápisy do motoru jdou po sobě
  nast: null, casovacNastaveni: 0,                // rozpracované nastavení plakátu
  popisek: {}, casovacPopisku: 0,                 // víkend → ručně psaný popisek (do uložení)
  styl: {},                                       // víkend → pole „Styl popisku“
  pracuje: '', igPracuje: '',
  ig: null,                                       // okno Naplánovat na Instagram
  hlidac: 0,                                      // čekání na popisek od Clauda
  cast: {}, pozorovatel: null
};

const data = () => stav.plakaty;
const fotbalData = () => (stav.fotbal && stav.fotbal.data) || null;
/** Nastavení plakátu: rozepsané v oddílu Nastavení má přednost (náhled se mění hned při psaní). */
const nastaveni = () => (p.nast && p.nast.mistni ? slozNastaveni() : (data() && data().nastaveni) || {});

// ---------------------------------------------------------------- načtení

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.plakaty = upravData(v.data);
}

function upravData(d) {
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  d = obj(d);
  const ven = { nastaveni: obj(d.nastaveni), kola: obj(d.kola), popisky: obj(d.popisky), plan: obj(d.plan), obrazky: obj(d.obrazky), ig: obj(d.ig) };
  if (Array.isArray(d.skupiny)) ven.skupiny = d.skupiny; // skupiny k označení (motor od 2026-10-16.3) – js/ig_skupiny.js
  return ven;
}

function ulozDoZarizeni() { if (data()) uloziste.pis(ULOZISTE, { data: data(), kdy: Date.now() }); }

// průběh zveřejňování (js/ig.js): plán plakátů z motoru → sem (a do zařízení); bez načtených plakátů si ho drží ig.js
ig_.zdroj('plakat', {
  klic: 'plakaty', oblast: 'plakaty', video: false, cil: 'plakaty',
  plan: () => (data() && data().plan) || null,
  nastav: (plan) => { if (!data()) return false; data().plan = plan; ulozDoZarizeni(); return true; },
  nazev: (t) => 'Plakát ' + P.rozsahVikendu(t),
  ucet: () => '@' + ((data() && data().ig && data().ig.ucet) || P.nastaveniPlakatu(nastaveni()).instagram)
});

// kdy se plakáty v tomhle spuštění naposledy načítaly (uložená kopie v zařízení může být stará – jiné zařízení, Claude)
let nacteno = 0;

export function nactiPlakaty(znovu) {
  if (!umiMotor('plakaty') || stav.nacita.plakaty) return Promise.resolve();
  nacteno = Date.now();
  stav.nacita.plakaty = true;
  stav.chyby.plakaty = null;
  return volej('plakaty', znovu ? { znovu: true } : {})
    .then((d) => { stav.plakaty = upravData(d); ulozDoZarizeni(); })
    .catch((e) => { stav.chyby.plakaty = e; })
    .then(() => { stav.nacita.plakaty = false; zmeneno(); });
}

/** Volá se při překreslení stránky Plakáty: data načte, když nejsou, a uloženou kopii obnoví nejvýš jednou za 5 minut
 *  (i po chybě – žádné opakování v kruhu). */
export function dotahni() {
  if (!umiMotor('plakaty') || stav.nacita.plakaty) return;
  if (stav.plakaty ? Date.now() - nacteno > 5 * 60e3 : !stav.chyby.plakaty) nactiPlakaty();
}

export function podnadpis() {
  if (!data()) return stav.chyby.plakaty ? 'Plakáty se nenačetly' : 'Načítám…';
  const s = p.sobota || P.vychoziVikend(Date.now());
  const kolo = data().kola[s];
  return 'Program víkendu na A3 · ' + esc(P.popisVikendu(s)) + ' · ' + (kolo && kolo.stav ? 'upraveno ručně' : 'podle rozlosování');
}

/** Tlačítko „Plakát“ na stránce Fotbal (vedle Reely). */
hooky.plakatTlacitko = (trida) => (umiMotor('plakaty')
  ? '<button type="button" class="' + (trida || 'chip') + ' plakat-tl" data-cil="plakaty">' + IKONY.plakaty + '<span>Plakát</span></button>' : '');

// ---------------------------------------------------------------- plakát vybraného víkendu

function vikendy() { return P.seznamVikendu(fotbalData(), data().kola, [P.vychoziVikend(Date.now()), p.sobota]); }

/** Uložená ruční verze má přednost před rozlosováním (jako na webu dorostu). */
function zdroj() {
  const kolo = data().kola[p.sobota];
  const r = P.zRozlosovani(p.sobota, fotbalData(), nastaveni());
  if (kolo && kolo.stav) return { klic: p.sobota + '|r' + (kolo.upraveno || 0), plakat: P.normalizujPlakat(kolo.stav, p.sobota, nastaveni()), upraveno: true, poznamky: r.poznamky };
  return { klic: p.sobota + '|a' + P.otisk(JSON.stringify(r.stav)), plakat: r.stav, upraveno: false, poznamky: r.poznamky };
}

function pripravPlakat() {
  const z = zdroj();
  p.upraveno = z.upraveno;
  p.poznamky = z.poznamky;
  if (p.plakat && p.plakatVikend === p.sobota) {
    if (z.klic === p.klic || p.mistni) return;    // beze změny, nebo rozepsané změny mají přednost (právě se ukládají)
    if (pise('.pl-editor')) return;               // nepřepisovat pod rukama – srovná se při dalším překreslení
  }
  p.klic = z.klic;
  p.plakat = z.plakat;
  p.plakatVikend = p.sobota;
  p.mistni = false;
  p.verzeEditoru++;
  p.plakatVerze++;
}

function pise(sel) {
  const a = document.activeElement;
  return !!(a && a.closest && a.closest('#p-plakaty ' + sel) && a.matches('input, textarea, select'));
}

function prepniVikend(sobota) {
  if (!sobota || sobota === p.sobota) return;
  ulozHned();
  ulozPopisekHned();
  p.sobota = sobota;
  p.plakat = null;
  p.klic = '';
  p.mistni = false;
  zmeneno();
}

function posun(o) {
  const v = vikendy();
  const i = v.indexOf(p.sobota) + o;
  if (i >= 0 && i < v.length) prepniVikend(v[i]);
}

// ---------------------------------------------------------------- uložení (motor)

function ulozPozdeji() {
  p.mistni = true;
  p.zmen++;
  clearTimeout(p.casovac);
  p.casovac = setTimeout(ulozHned, ULOZIT_PO);
}

function ulozHned() {
  clearTimeout(p.casovac);
  p.casovac = 0;
  if (!p.mistni || !p.plakat) return p.fronta;
  const tyden = p.plakatVikend, plakat = JSON.parse(JSON.stringify(p.plakat)), zmen = p.zmen;
  p.fronta = p.fronta.then(() => volej('plakatUlozit', { tyden, stav: plakat })).then((v) => {
    if (v && v.kola) data().kola = v.kola;
    ulozDoZarizeni();
    // mezitím se nic nepsalo → uloženo (štítek „upraveno ručně“; klíč nové verze, ať se editor zbytečně nepřestaví)
    if (p.zmen === zmen && p.plakatVikend === tyden) {
      p.mistni = false;
      const kolo = data().kola[tyden];
      if (kolo) p.klic = tyden + '|r' + (kolo.upraveno || 0);
    }
    zmeneno();
  }).catch((e) => { toast('Plakát se neuložil: ' + e.message, true); });
  return p.fronta;
}

function vratPodleRozlosovani() {
  const tyden = p.sobota;
  potvrd('Vrátit plakát podle rozlosování?', { text: 'Ruční úpravy víkendu ' + P.rozsahVikendu(tyden) + ' se smažou.', ano: 'Vrátit', ne: 'Nechat' }).then((ano) => {
    if (!ano) return;
    clearTimeout(p.casovac);
    p.casovac = 0;
    p.mistni = false;
    p.fronta = p.fronta.then(() => volej('plakatUlozit', { tyden, smazat: true })).then((v) => {
      data().kola = (v && v.kola) || {};
      ulozDoZarizeni();
      if (p.sobota === tyden) { p.plakat = null; p.klic = ''; }
      toast('Vráceno podle rozlosování');
      zmeneno();
    }).catch((e) => toast(e.message, true));
  });
}

// ---------------------------------------------------------------- vykreslení stránky

export function vykresliPlakaty(el) {
  zapniPisma();
  if (!data()) {
    el.innerHTML = '<div class="card">' + (stav.chyby.plakaty ? chybaHtml(stav.chyby.plakaty, 'data-pl-znovu') : kostra(4)) + '</div>';
    return;
  }
  if (!p.sobota) p.sobota = P.vychoziVikend(Date.now());
  pripravPlakat();
  if (!el.querySelector('.plakaty')) {
    // .plakaty-levy = náhled s nápovědou k tisku; na PC (plakaty.css ≥ 1 100 px) levý sloupec, který při posunu zůstává
    // vidět – vpravo Instagram a editor (Michal 15. 10.: menší náhled, editor a Instagram kolem něj)
    el.innerHTML = '<div class="plakaty">' +
      '<div class="plakaty-lista" data-pl-cast="lista"></div>' +
      '<div class="plakaty-levy"><div class="plakat-nahled"><div class="plakat-stage"><div class="plakat poster" aria-label="Náhled plakátu – klepnutím na text upravíš jeho pole"></div></div></div>' +
      '<p class="napoveda plakaty-tisk-napoveda">Klepnutím na text v náhledu skočíš na jeho pole. Tisk: v dialogu vyber <b>A3</b>, <b>na šířku</b>, okraje <b>žádné</b> ' +
        'a zapni <b>grafiku na pozadí</b>, jinak se nevytisknou barevné pruhy. Obrázek je JPEG 2 800 px – na Instagram nebo do Fotek.</p></div>' +
      '<div class="plakaty-mrizka"><section class="card pl-editor" data-pl-cast="editor"></section>' +
        '<div class="plakaty-vpravo"><section class="card pl-ig" data-pl-cast="ig"></section>' +
        '<details class="card plakaty-nastaveni" data-pl-cast="nastaveni"></details></div></div>' +
    '</div>';
    p.cast = {};
    p.nahledVerze = -1;
    sledujVelikost(el.querySelector('.plakat-nahled'));
  }
  const vik = vikendy();
  cast(el, 'lista', JSON.stringify([vik, p.sobota, p.upraveno, p.pracuje, sdiletObrazek() && !!hotovyObrazek()]), () => listaHtml(vik));
  if (p.nahledVerze !== p.plakatVerze) vykresliNahled();
  cast(el, 'editor', p.sobota + '|' + p.verzeEditoru + '|' + p.poznamky.join('§'), editorHtml);
  cast(el, 'ig', klicIg(), igHtml);
  if (p.nast && !p.nast.mistni && !pise('.plakaty-nastaveni')) p.nast = null; // srovnat s motorem (jiné zařízení)
  cast(el, 'nastaveni', JSON.stringify([data().nastaveni, p.nast && p.nast.verze, vik]), nastaveniHtml);
  prizpusob();
  hlidejPopisek();
  pripravObrazekDopredu();
}

/** Část stránky se přepíše, jen když se změnil její klíč – a ne pod rukama (rozepsané pole by zmizelo i s klávesnicí). */
function cast(el, jmeno, klic, html) {
  const kont = el.querySelector('[data-pl-cast="' + jmeno + '"]');
  if (!kont || p.cast[jmeno] === klic) return;
  const a = document.activeElement;
  if (a && kont.contains(a) && a.matches('input, textarea, select')) return;
  kont.innerHTML = html();
  p.cast[jmeno] = klic;
}

function listaHtml(vik) {
  const i = vik.indexOf(p.sobota);
  return '<div class="plakaty-vyber">' +
      '<button type="button" class="btn btn--ikona" data-pl-posun="-1" aria-label="Předchozí víkend" title="Předchozí víkend"' + (i <= 0 ? ' disabled' : '') + '>' + IKONY.vlevo + '</button>' +
      '<select class="field" data-pl-vyber aria-label="Víkend">' + vik.map((s) => '<option value="' + s + '"' + (s === p.sobota ? ' selected' : '') + '>' +
        esc(P.popisVikendu(s)) + '</option>').join('') + '</select>' +
      '<button type="button" class="btn btn--ikona" data-pl-posun="1" aria-label="Další víkend" title="Další víkend"' + (i >= vik.length - 1 ? ' disabled' : '') + '>' + IKONY.vpravo + '</button>' +
      '<span class="tag ' + (p.upraveno ? 'tag--danger' : 'tag--seda') + '" data-pl-stav>' + (p.upraveno ? 'upraveno ručně' : 'podle rozlosování') + '</span>' +
    '</div>' +
    '<div class="plakaty-akce">' +
      (p.upraveno ? '<button type="button" class="btn btn--ghost" data-pl-vratit>' + IKONY.obnovit + '<span>Vrátit podle rozlosování</span></button>' : '') +
      // na iPhonu data-pripraveno = obrázek je nakreslený dopředu (klepnutí rovnou sdílí)
      '<button type="button" class="btn btn--ghost" data-pl-stahnout' + (p.pracuje ? ' disabled' : '') +
        (sdiletObrazek() ? ' data-pripraveno="' + (hotovyObrazek() ? 1 : 0) + '"' : '') + '>' + IKONY.stahnout + '<span>' +
        (p.pracuje === 'stahuji' ? 'Připravuji obrázek…' : 'Stáhnout obrázek') + '</span></button>' +
      '<button type="button" class="btn btn--primary" data-pl-tisk>' + IKONY.tisk + '<span>Vytisknout / PDF</span></button>' +
    '</div>';
}

// ---------------------------------------------------------------- náhled (jako web dorostu: zkratitDlouhe, dolad, fit)

function vykresliNahled() {
  const uzel = document.querySelector('#p-plakaty .plakat-stage .poster');
  if (!uzel || !p.plakat) return;
  uzel.innerHTML = P.plakatHtml(p.plakat, CESTY);
  p.nahledVerze = p.plakatVerze;
  dorovnej(uzel);
}

/** Dlouhý název soupeře radši zmenšit, než aby se uřízl třemi tečkami; QR si vezme, co v pravém sloupci zbylo. */
function dorovnej(uzel) {
  zkratitDlouhe(uzel);
  dolad(uzel);
}

function zkratitDlouhe(uzel) {
  uzel.querySelectorAll('.blok .opp, .row .opp, .awayrow .opp, .wkm').forEach((el) => {
    el.style.fontSize = '';
    let px = parseFloat(getComputedStyle(el).fontSize);
    const dno = Math.max(13, px * 0.62);
    let pojistka = 0;
    while (el.scrollWidth > el.clientWidth + 1 && px > dno && pojistka++ < 40) {
      px -= 0.5;
      el.style.fontSize = px + 'px';
    }
  });
}

const QR_MIN = 96, QR_MAX = 240, QR_KROK = 4;
function dolad(uzel) {
  const right = uzel.querySelector('.right');
  const list = uzel.querySelector('.rowlist');
  const img = uzel.querySelector('.qr img');
  if (!right || !list || !img) return;
  const preteka = () => right.scrollHeight > right.clientHeight + 1 || list.scrollHeight > list.clientHeight + 1 ||
    Array.from(list.children).some((r) => r.scrollHeight > r.clientHeight + 1);
  const nastav = (px) => { img.style.width = img.style.height = px + 'px'; };
  let px = QR_MIN;
  nastav(px);
  let pojistka = 0;
  while (!preteka() && px < QR_MAX && pojistka++ < 200) { px += QR_KROK; nastav(px); }
  while (preteka() && px > QR_MIN) { px -= QR_KROK; nastav(px); }
}

/** Náhled se zmenší, aby se plakát vešel do šířky stránky (i v telefonu). */
function prizpusob() {
  const box = document.querySelector('#p-plakaty .plakat-nahled');
  if (!box || !box.clientWidth) return;
  const st = getComputedStyle(box);
  // na PC jen menší náhled (Michal 15. 10.: „je to moc velké, stačí mi menší náhled“) – nejvýš 720 px na šířku
  const sirka = Math.min(box.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight), NAHLED_PC);
  box.style.setProperty('--s', Math.max(0.15, Math.min(1, sirka / SIRKA)).toFixed(4));
}

// ---------------------------------------------------------------- klepnutí v náhledu → pole v editoru
// Michal 15. 10.: „klepnutí na text v náhledu sjede v editoru přesně na pole s tím textem“. Prvky plakátu nesou
// data-pl-pole = cesta pole (plakat.js plakatHtml), editor má stejnou cestu v data-pl-cesta – žádné hledání podle textu.
// Obrysy při najetí jen v náhledu na obrazovce (plakaty.css) – tisk a obrázek (html2canvas, .plakat-export) beze změny.

let blikani = 0;
/** Posune editor k poli s cestou, krátce ho zvýrazní a dá do něj kurzor (na konec textu). */
function skocNaPole(cesta) {
  const pole = document.querySelector('#p-plakaty .pl-editor [data-pl-cesta="' + String(cesta).replace(/["\\]/g, '') + '"]');
  if (!pole) return false;
  const sbalene = pole.closest('details:not([open])');
  if (sbalene) sbalene.open = true;
  const obal = pole.closest('label') || pole;
  const plynule = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  obal.scrollIntoView({ block: 'center', behavior: plynule ? 'smooth' : 'auto' });
  pole.focus({ preventScroll: true });
  if (pole.type === 'text' && pole.setSelectionRange) { const n = pole.value.length; pole.setSelectionRange(n, n); }
  document.querySelectorAll('#p-plakaty .pl-blik').forEach((x) => x.classList.remove('pl-blik'));
  void obal.offsetWidth; // znovu spustit animaci i u stejného pole
  obal.classList.add('pl-blik');
  clearTimeout(blikani);
  blikani = setTimeout(() => obal.classList.remove('pl-blik'), 1600);
  return true;
}

document.addEventListener('click', (e) => {
  const cil = e.target && e.target.closest && e.target.closest('#p-plakaty .plakat-stage [data-pl-pole]');
  if (!cil || e.button) return;
  if (skocNaPole(cil.dataset.plPole)) e.preventDefault();
});

function sledujVelikost(box) {
  if (p.pozorovatel) p.pozorovatel.disconnect();
  p.pozorovatel = typeof ResizeObserver === 'function' ? new ResizeObserver(prizpusob) : null;
  if (p.pozorovatel && box) p.pozorovatel.observe(box);
}
window.addEventListener('resize', prizpusob);

// písma plakátu (Google Fonts): odkaz je v index.html s media="print" – start aplikace na ně nečeká; zapnou se
// až na stránce Plakáty. Po načtení písem se dlouhé názvy a QR přepočítají (šířky textu se změní).
function zapniPisma() {
  const l = document.getElementById('plakat-pisma');
  if (l && l.media !== 'all') l.media = 'all';
}
function cekejNaStyl() {
  const l = document.getElementById('plakat-pisma');
  if (!l || l.sheet) return Promise.resolve();
  return new Promise((ok) => { l.addEventListener('load', ok, { once: true }); l.addEventListener('error', ok, { once: true }); setTimeout(ok, 4000); });
}
/** Před tiskem a obrázkem: písma načtená (nejvýš 6 s – bez sítě se tiskne náhradním písmem). */
async function pripravPisma() {
  zapniPisma();
  const f = document.fonts;
  if (!f || !f.load) return;
  await Promise.race([cekejNaStyl().then(() => Promise.all(PISMA.map((x) => f.load(x).catch(() => null)))).then(() => f.ready), pauza(6000)]);
}
if (document.fonts && document.fonts.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => {
    const uzel = document.querySelector('#p-plakaty .plakat-stage .poster');
    if (uzel && uzel.firstChild) dorovnej(uzel);
  });
}

// ---------------------------------------------------------------- editor (jako web dorostu, vzhled Asistenta)

function pole(cesta, hodnota, popisek, cely) {
  return '<label' + (cely ? ' class="pl-cely"' : '') + '><span class="label">' + popisek + '</span>' +
    '<input class="field" type="text" data-pl-cesta="' + cesta + '" value="' + esc(hodnota) + '" autocomplete="off" spellcheck="false"></label>';
}

function znakVyber(atribut, hodnota, popisek, cely) {
  const volby = [['', '— bez znaku —']].concat(LOGA.map((f) => [f, f.replace(/\.(png|jpg)$/, '')]));
  return '<label' + (cely ? ' class="pl-cely"' : '') + '><span class="label">' + popisek + '</span><select class="field" ' + atribut + '>' +
    volby.map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === (hodnota || '') ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
}

/** Dlaždice / řádek v editoru: mřížka po dvou (tri = po třech, v telefonu první pole přes celou šířku). */
function karta(nadpis, smazat, obsah, tri) {
  return '<div class="pl-karta"><div class="pl-karta__hlava"><b>' + nadpis + '</b>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-pl-smazat="' + smazat + '">' + IKONY.smazat + '<span>Smazat</span></button></div>' +
    '<div class="pl-mrizka' + (tri ? ' pl-mrizka--3' : '') + '">' + obsah + '</div></div>';
}

const pridat = (kde, text) => '<button type="button" class="btn btn--ghost btn--sm pl-pridat" data-pl-pridat="' + kde + '">' + IKONY.plus + '<span>' + text + '</span></button>';

function chybiHtml() {
  const chybi = P.chybejiciZnaky(p.plakat);
  return chybi.length ? 'Bez znaku se vykreslí čárkovaný rámeček: <b>' + chybi.map(esc).join(' · ') + '</b>' : '';
}

function editorHtml() {
  const d = p.plakat;
  let h = hlavickaKarty(IKONY.psat, 'Úprava plakátu', '<span class="muted small">změny se hned ukážou a samy uloží</span>') + '<div class="pl-telo">';
  if (p.poznamky.length) h += '<ul class="pl-upozorneni">' + p.poznamky.map((t) => '<li>' + IKONY.pozor + '<span>' + esc(t) + '</span></li>').join('') + '</ul>';
  h += '<div class="pl-mrizka pl-mrizka--3">' + pole('datum', d.datum, 'Datum') + pole('mesic', d.mesic, 'Měsíc a rok') + pole('nadpis', d.nadpis, 'Nadpis') + '</div>';

  h += '<h3 class="pl-h">Hrajeme doma – velké dlaždice</h3>';
  d.doma.forEach((z, i) => {
    const c = 'doma.' + i + '.';
    h += karta('Dlaždice ' + (i + 1), 'doma:' + i, pole(c + 'tym', z.tym, 'Tým') + pole(c + 'den', z.den, 'Den a datum') + pole(c + 'cas', z.cas, 'Čas') +
      pole(c + 'soutez', z.soutez, 'Soutěž', true) + pole(c + 'souper', z.souper, 'Soupeř') + znakVyber('data-pl-cesta="' + c + 'logo"', z.logo, 'Znak soupeře'), true);
  });
  h += pridat('doma', 'Přidat domácí zápas');

  h += '<h3 class="pl-h">Doma – mládež (úzké řádky)</h3>';
  d.domaMladez.forEach((m, i) => {
    const c = 'domaMladez.' + i + '.';
    h += karta('Řádek ' + (i + 1), 'domaMladez:' + i, pole(c + 'kat', m.kat, 'Kategorie') + pole(c + 'souper', m.souper, 'Soupeř') +
      znakVyber('data-pl-cesta="' + c + 'logo"', m.logo, 'Znak') + pole(c + 'den', m.den, 'Den') + pole(c + 'cas', m.cas, 'Čas'), true);
  });
  h += pridat('domaMladez', 'Přidat řádek mládeže');

  h += '<h3 class="pl-h">Venku</h3>';
  d.venku.forEach((v, i) => {
    const c = 'venku.' + i + '.';
    h += karta('Řádek ' + (i + 1), 'venku:' + i, pole(c + 'kat', v.kat, 'Kategorie') + pole(c + 'cas', v.cas, 'Den a čas') +
      pole(c + 'souper', v.souper, 'Soupeř') + znakVyber('data-pl-cesta="' + c + 'logo"', v.logo, 'Znak soupeře'));
  });
  h += pridat('venku', 'Přidat řádek venku');

  h += '<h3 class="pl-h">V týdnu (zápasy mimo víkend)</h3>';
  d.vTydnu.forEach((t, i) => {
    const c = 'vTydnu.' + i + '.';
    h += karta('Řádek ' + (i + 1), 'vTydnu:' + i, pole(c + 'kat', t.kat, 'Kategorie') +
      '<label><span class="label">Hrajeme</span><select class="field" data-pl-cesta="' + c + 'doma" data-pl-bool="1">' +
        '<option value="1"' + (t.doma ? ' selected' : '') + '>Doma</option><option value=""' + (t.doma ? '' : ' selected') + '>Venku</option></select></label>' +
      pole(c + 'souper', t.souper, 'Soupeř') + pole(c + 'den', t.den, 'Den a datum') + pole(c + 'cas', t.cas, 'Čas'), true);
  });
  h += pridat('vTydnu', 'Přidat zápas v týdnu');

  h += '<h3 class="pl-h">Patička</h3><div class="pl-mrizka">' + pole('vyzva', d.vyzva, 'Velký text vlevo dole', true) +
    pole('paticka.podtitul', d.paticka.podtitul, 'Druhý řádek patičky', true) + pole('paticka.misto', d.paticka.misto, 'Místo (v červeném pruhu)') +
    znakVyber('data-pl-cesta="nasZnak"', d.nasZnak, 'Náš znak') + '</div>';
  h += '<p class="pl-varovani" data-pl-chybi>' + chybiHtml() + '</p>';
  return h + '</div>';
}

/** Psaní v editoru: změna hned v náhledu, uložení 700 ms po psaní; pole se nepřekreslují. */
function zmenPole(t) {
  if (!p.plakat) return;
  const cesta = t.dataset.plCesta;
  const hodnota = t.dataset.plBool ? t.value === '1' : t.value;
  if (P.hodnotaCesty(p.plakat, cesta) === hodnota) return;
  P.nastavCestu(p.plakat, cesta, hodnota);
  p.plakatVerze++;
  vykresliNahled();
  const chybi = document.querySelector('#p-plakaty [data-pl-chybi]');
  if (chybi) chybi.innerHTML = chybiHtml();
  ulozPozdeji();
  pripravObrazekDopredu(); // připravený obrázek už neplatí – nový se nakreslí, až se přestane psát
}

function pridej(kde) {
  const n = P.nastaveniPlakatu(nastaveni());
  const novy = { doma: { tym: n.tymy.A, soutez: n.souteze.A, souper: '', logo: '', den: '', cas: '' }, domaMladez: { kat: '', souper: '', logo: '', den: '', cas: '' },
    venku: { kat: '', souper: '', logo: '', cas: '' }, vTydnu: { kat: '', doma: false, souper: '', den: '', cas: '' } }[kde];
  if (!novy || !p.plakat) return;
  p.plakat[kde].push(novy);
  zmenaRadku();
}

function smaz(co) {
  const [kde, i] = co.split(':');
  if (!p.plakat || !Array.isArray(p.plakat[kde])) return;
  p.plakat[kde].splice(Number(i), 1);
  zmenaRadku();
}

function zmenaRadku() {
  p.verzeEditoru++;
  p.plakatVerze++;
  ulozPozdeji();
  zmeneno();
}

// ---------------------------------------------------------------- nastavení plakátu (sbalitelný oddíl)

function pracovniNastaveni() {
  if (!p.nast) {
    const n = P.nastaveniPlakatu(data().nastaveni);
    p.nast = { data: n, aliasy: Object.keys(n.aliasy).map((k) => [k, n.aliasy[k]]), mistni: false, zmen: 0, verze: 0 };
  }
  return p.nast;
}

function slozNastaveni() {
  const w = p.nast;
  const n = JSON.parse(JSON.stringify(w.data));
  n.aliasy = {};
  w.aliasy.forEach((a) => { const k = String(a[0] || '').trim().toUpperCase(); if (k && a[1]) n.aliasy[k] = a[1]; });
  return n;
}

function nastaveniHtml() {
  const w = pracovniNastaveni(), n = w.data;
  const tymy = Object.keys(n.tymy);
  const nazevTymu = (k) => { const t = ((fotbalData() || {}).tymy || []).find((x) => x.klic === k); return (t && t.nazev) || NAZVY_TYMU[k] || k; };
  const vstup = (cesta, hodnota, popisek, cely, placeholder) => '<label' + (cely ? ' class="pl-cely"' : '') + '><span class="label">' + esc(popisek) + '</span>' +
    '<input class="field" data-pl-nast="' + cesta + '" value="' + esc(hodnota) + '"' + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' autocomplete="off" spellcheck="false"></label>';
  const vik = vikendy();
  if (vik.indexOf(n.popiskyOd) < 0) vik.push(n.popiskyOd);
  return '<summary class="card-hlava"><span class="nadpis">' + IKONY.nastaveni + '<span>Nastavení plakátu</span></span><span class="vpravo">' + IKONY.vpravo + '</span></summary>' +
    '<div class="pl-telo">' +
      '<h3 class="pl-h">Týmy na plakátu</h3><div class="pl-mrizka pl-mrizka--3">' + tymy.map((k) => vstup('tymy.' + k, n.tymy[k], nazevTymu(k))).join('') + '</div>' +
      '<h3 class="pl-h">Soutěže</h3><div class="pl-mrizka">' + tymy.map((k) => vstup('souteze.' + k, n.souteze[k], nazevTymu(k), true)).join('') + '</div>' +
      '<h3 class="pl-h">Texty a znak</h3><div class="pl-mrizka">' + vstup('nadpis', n.nadpis, 'Nadpis') + vstup('misto', n.misto, 'Místo (v červeném pruhu)') +
        vstup('vyzva', n.vyzva, 'Velký text vlevo dole', true) + vstup('podtitul', n.podtitul, 'Druhý řádek patičky', true) +
        znakVyber('data-pl-nast="nasZnak"', n.nasZnak, 'Náš znak') + vstup('instagram', n.instagram, 'Instagram klubu (bez @)') +
        '<label class="pl-cely"><span class="label">Popisky od Clauda samy od víkendu</span><select class="field" data-pl-nast="popiskyOd">' +
          vik.sort().map((s) => '<option value="' + s + '"' + (s === n.popiskyOd ? ' selected' : '') + '>' + esc(P.popisVikendu(s)) + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<h3 class="pl-h">Znaky soupeřů (aliasy)</h3>' +
      w.aliasy.map((a, i) => '<div class="pl-alias"><input class="field" data-pl-alias-klic="' + i + '" value="' + esc(a[0]) + '" placeholder="SOUPEŘ VELKÝMI" aria-label="Soupeř" autocomplete="off">' +
        '<select class="field" data-pl-alias-znak="' + i + '" aria-label="Znak">' + [['', '— znak —']].concat(LOGA.map((f) => [f, f.replace(/\.(png|jpg)$/, '')]))
          .map((o) => '<option value="' + esc(o[0]) + '"' + (o[0] === a[1] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' +
        '<button type="button" class="btn btn--ikona" data-pl-alias-smazat="' + i + '" aria-label="Smazat alias" title="Smazat alias">' + IKONY.smazat + '</button></div>').join('') +
      '<button type="button" class="btn btn--ghost btn--sm pl-pridat" data-pl-alias-pridat>' + IKONY.plus + '<span>Přidat alias</span></button>' +
      '<p class="napoveda">Platí pro plakáty podle rozlosování – ručně upravená kola si drží své texty a znaky. Ukládá se samo. ' +
        'Znak soupeře se jinak najde podle obce (TJ Sokol Hroznová Lhota → hroznova-lhota.png).</p>' +
    '</div>';
}

function zmenNastaveni(t) {
  const w = pracovniNastaveni();
  if (t.dataset.plNast) {
    if (P.hodnotaCesty(w.data, t.dataset.plNast) === t.value) return;
    P.nastavCestu(w.data, t.dataset.plNast, t.value);
  } else if (t.dataset.plAliasKlic != null) w.aliasy[Number(t.dataset.plAliasKlic)][0] = t.value;
  else if (t.dataset.plAliasZnak != null) w.aliasy[Number(t.dataset.plAliasZnak)][1] = t.value;
  nastaveniZmeneno();
}

function nastaveniZmeneno(prestavet) {
  const w = pracovniNastaveni();
  w.mistni = true;
  w.zmen++;
  if (prestavet) w.verze++;
  clearTimeout(p.casovacNastaveni);
  p.casovacNastaveni = setTimeout(ulozNastaveniHned, ULOZIT_PO);
  zmeneno(); // plakát podle rozlosování se hned překreslí s novým nastavením
}

function ulozNastaveniHned() {
  clearTimeout(p.casovacNastaveni);
  p.casovacNastaveni = 0;
  const w = p.nast;
  if (!w || !w.mistni) return;
  const zmen = w.zmen, poslat = P.rozdilNastaveni(slozNastaveni());
  p.fronta = p.fronta.then(() => volej('plakatNastaveni', { nastaveni: poslat })).then((v) => {
    data().nastaveni = (v && v.nastaveni) || poslat;
    ulozDoZarizeni();
    if (p.nast === w && w.zmen === zmen) w.mistni = false;
    zmeneno();
  }).catch((e) => toast('Nastavení plakátu se neuložilo: ' + e.message, true));
}

// ---------------------------------------------------------------- tisk (jako web dorostu)

async function tiskni() {
  // písma už bývají načtená z náhledu – pak tisk hned (Safari chce window.print() přímo z klepnutí)
  if (!(document.fonts && document.fonts.check && PISMA.every((x) => document.fonts.check(x)))) await pripravPisma();
  const uzel = document.querySelector('#p-plakaty .plakat-stage .poster');
  if (uzel) dorovnej(uzel);
  document.documentElement.classList.add('tisk-plakatu');
  window.print();
}
window.addEventListener('beforeprint', () => { if (stav.pohled === 'plakaty') document.documentElement.classList.add('tisk-plakatu'); });
window.addEventListener('afterprint', () => document.documentElement.classList.remove('tisk-plakatu'));

// ---------------------------------------------------------------- obrázek (html2canvas, načte se až při použití)
// iPhone (Michal 15. 10.: „na mobilu mi nejde stáhnout obrázek plakátu“): obrázek se kreslil až po klepnutí (sekundy)
// a Safari pak sdílení odmítlo – navigator.share smí jen hned v obsluze klepnutí (NotAllowedError, vypršelá aktivace);
// v aplikaci na ploše nejde ani <a download>. Proto se na iPhonu obrázek kreslí dopředu (v klidu po otevření stránky
// a po každé změně plakátu), klepnutí na Stáhnout zavolá sdílení synchronně s hotovým souborem (Uložit obrázek → Fotky)
// a když sdílení nejde, ukáže obrázek přes celou obrazovku: podržet prst → Přidat do Fotek (to jde vždy).
// Na PC a na Androidu běžné stažení jako dřív (obrázek až po klepnutí, knihovna se do té doby nestahuje).

let knihovna = null;
function nactiHtml2canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!knihovna) {
    knihovna = new Promise((ok, chyba) => {
      const s = document.createElement('script');
      s.src = HTML2CANVAS;
      s.async = true;
      s.onload = () => (window.html2canvas ? ok(window.html2canvas) : chyba(new Error('Knihovna na obrázek se nenačetla.')));
      s.onerror = () => { s.remove(); chyba(new Error('Knihovna na obrázek se nenačetla – zkontroluj připojení.')); };
      document.head.appendChild(s);
    }).catch((e) => { knihovna = null; throw e; });
  }
  return knihovna;
}

function obrazkyNacteny(uzel) {
  const cekej = Array.from(uzel.querySelectorAll('img')).map((i) => (i.complete ? null
    : new Promise((ok) => { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); })));
  return Promise.race([Promise.all(cekej), pauza(8000)]);
}

/**
 * Plakát jako plátno: neškálovaný uzel 1400 × 990 (náhled má transform: scale) v nulovém rámečku mimo zrak,
 * html2canvas ho vykreslí v kopii stránky. meritko 2 → 2 800 × 1 980 px (limit plátna v Safari je ~16 Mpx).
 * plakat = podoba plakátu, ze které se kreslí (HTML se vezme hned – změna během kreslení ho nerozhodí).
 */
async function vykresliPlatno(meritko, plakat) {
  const html = P.plakatHtml(plakat || p.plakat, CESTY);
  const h2c = await nactiHtml2canvas();
  await pripravPisma();
  const hostitel = document.createElement('div');
  hostitel.className = 'plakat-export';
  hostitel.innerHTML = '<div class="plakat poster">' + html + '</div>';
  document.body.appendChild(hostitel);
  try {
    const uzel = hostitel.firstChild;
    await obrazkyNacteny(uzel);
    dorovnej(uzel);
    return await h2c(uzel, {
      scale: meritko, backgroundColor: '#ffffff', logging: false, useCORS: false, x: 0, y: 0, scrollX: 0, scrollY: 0,
      width: SIRKA, height: VYSKA, windowWidth: SIRKA, windowHeight: VYSKA,
      // kopie stránky bez aplikace (rychlejší) – stačí plakát a styly
      ignoreElements: (e) => e.id === 'aplikace' || e.id === 'panely' || e.id === 'uvod' || e.id === 'toast',
      onclone: (doc) => {
        const h = doc.querySelector('.plakat-export');
        if (h) h.classList.add('plakat-export--klon');
        const f = doc.fonts;
        return f && f.load ? Promise.race([Promise.all(PISMA.map((x) => f.load(x).catch(() => null))), pauza(4000)]) : null;
      }
    });
  } finally {
    hostitel.remove();
  }
}

function zmensi(platno, sirka) {
  const c = document.createElement('canvas');
  c.width = sirka;
  c.height = Math.round(sirka * platno.height / platno.width);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(platno, 0, 0, c.width, c.height);
  return c;
}

const jeIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** iPhone a iPad: obrázek se sdílí (Uložit obrázek → Fotky) – stažení tam končí v Souborech a v aplikaci na ploše nejde. */
const sdiletObrazek = () => jeIos();
const jpegZPlatna = (platno, kvalita) => new Promise((ok, chyba) =>
  platno.toBlob((b) => (b ? ok(b) : chyba(new Error('Obrázek se nepodařilo vytvořit.'))), 'image/jpeg', kvalita));
const dataZBlobu = (blob) => new Promise((ok, chyba) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => chyba(new Error('Obrázek se nepodařilo načíst.'));
  r.readAsDataURL(blob);
});

/** Soubor z data: adresy (obrázky z okna plánu) – synchronně, ať jde sdílet hned v klepnutí. */
function souborZDat(data, nazev) {
  const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=]*)$/.exec(String(data || ''));
  if (!m || typeof File !== 'function') return null;
  const bin = atob(m[2]);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new File([b], nazev, { type: m[1] });
}

function stahni(blob, nazev) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nazev;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60e3);
}

// Obrázek plakátu (plátno 2 800 px + JPEG) – jednou na podobu plakátu: stažení, obrázky pro Instagram i okno s obrázkem
// berou stejný. Kreslí se po jednom (dva html2canvas naráz by se o pomocný plakát v dokumentu přetahovaly).
const obr = { klic: '', slib: null, hotovo: null, rada: Promise.resolve(), casovac: 0, ceka: '', chyba: '' };
function klicObrazku() { return p.plakat ? p.sobota + '|' + P.otisk(JSON.stringify(p.plakat)) : ''; }
/** Hotový obrázek aktuální podoby plakátu, jinak null (ještě se kreslí, nebo se plakát od té doby změnil). */
function hotovyObrazek() { return obr.hotovo && obr.hotovo.klic === klicObrazku() ? obr.hotovo : null; }

function obrazekPlakatu() {
  const klic = klicObrazku();
  if (!klic) return Promise.reject(new Error('Plakát ještě není načtený.'));
  if (obr.hotovo && obr.hotovo.klic === klic) return Promise.resolve(obr.hotovo);
  if (obr.slib && obr.klic === klic) return obr.slib;
  const plakat = JSON.parse(JSON.stringify(p.plakat)), nazev = 'plakat_' + p.sobota + '.jpg';
  obr.klic = klic;
  const slib = obr.rada.then(async () => {
    const platno = await vykresliPlatno(2, plakat);
    const blob = await jpegZPlatna(platno, 0.92);
    const hotovo = { klic, platno, blob, nazev, soubor: typeof File === 'function' ? new File([blob], nazev, { type: 'image/jpeg' }) : null };
    if (obr.klic === klic) obr.hotovo = hotovo;
    return hotovo;
  });
  obr.slib = slib;
  obr.rada = slib.catch(() => null);
  slib.then(() => { obr.chyba = ''; }, () => { obr.chyba = klic; }).then(() => {
    if (obr.slib === slib) obr.slib = null;
    if (sdiletObrazek()) zmeneno(); // tlačítko Stáhnout ví, že obrázek je připravený
  });
  return slib;
}

const naKlid = (fn) => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 0));

/** iPhone: obrázek nakreslit dopředu, až je chvíli klid (po otevření stránky, po změně plakátu) – při psaní v editoru se
 *  čekání pokaždé posune. Volá se při každém překreslení stránky; nedělá nic, když je hotový nebo se kreslí. */
function pripravObrazekDopredu() {
  if (!sdiletObrazek() || !p.plakat || stav.pohled !== 'plakaty' || document.visibilityState !== 'visible') return;
  const klic = klicObrazku();
  if (hotovyObrazek() || (obr.slib && obr.klic === klic) || obr.ceka === klic || obr.chyba === klic) return;
  clearTimeout(obr.casovac);
  obr.ceka = klic;
  obr.casovac = setTimeout(() => {
    obr.casovac = 0;
    obr.ceka = '';
    naKlid(() => { if (stav.pohled === 'plakaty' && klicObrazku() === klic) obrazekPlakatu().catch(() => null); });
  }, PRIPRAVA_PO);
}

/** Sdílení souboru hned v obsluze klepnutí (Safari ho po čekání odmítne). false = tady sdílet nejde; když sdílení selže
 *  jinak než zrušením, zavolá se nahrada. */
function lzeSdilet(soubor) {
  if (!soubor || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try { return !!navigator.canShare({ files: [soubor] }); } catch (e) { return false; }
}
function sdilejHned(soubor, nahrada) {
  if (!lzeSdilet(soubor)) return false;
  let slib;
  try { slib = navigator.share({ files: [soubor] }); } catch (e) { return false; }
  Promise.resolve(slib).catch((e) => { if (!e || e.name !== 'AbortError') nahrada(e); });
  return true;
}

/** Stáhnout obrázek (tlačítko i nabídka): iPhone – sdílet hotový obrázek, jinak okno s obrázkem; PC – stažení. */
function stahniObrazek() {
  if (!p.plakat) return;
  if (!sdiletObrazek()) { stahniNaPc(); return; }
  const h = hotovyObrazek();
  if (h && sdilejHned(h.soubor, () => ukazObrazek({ druh: 'plakat' }))) return;
  ukazObrazek({ druh: 'plakat' });
}

async function stahniNaPc() {
  if (p.pracuje) return;
  p.pracuje = 'stahuji';
  zmeneno();
  try {
    const o = await obrazekPlakatu();
    stahni(o.blob, o.nazev);
    toast('Obrázek plakátu stažený (' + o.nazev + ')');
  } catch (e) {
    toast((e && e.message) || 'Obrázek se nepovedl.', true);
  } finally {
    p.pracuje = '';
    zmeneno();
  }
}

// okno s obrázkem přes celou obrazovku: na iPhonu podržet prst → Přidat do Fotek (jde vždy, i v aplikaci na ploše),
// Sdílet, kde to jde; jinde Stáhnout. Otevře se po Stáhnout, když sdílení nejde, a klepnutím na náhled v okně plánu
// (obrázek příspěvku i příběhu).
let velky = null; // { druh: 'plakat' | 'prispevek' | 'pribeh', nazev, data (data: adresa), soubor, chyba }

function ukazObrazek(o) {
  const moje = { druh: o.druh, nazev: o.nazev || 'plakat_' + p.sobota + '.jpg', data: o.data || '', soubor: null, chyba: '' };
  if (moje.data) moje.soubor = souborZDat(moje.data, moje.nazev);
  velky = moje;
  if (!moje.data) {
    obrazekPlakatu().then((h) => dataZBlobu(h.blob).then((data) => {
      if (velky !== moje) return;
      Object.assign(moje, { data, soubor: h.soubor, nazev: h.nazev });
      obnovPanel('plakat-obrazek');
    })).catch((e) => {
      if (velky !== moje) return;
      moje.chyba = (e && e.message) || 'Obrázek se nepovedl.';
      obnovPanel('plakat-obrazek');
    });
  }
  if (jeOtevreny('plakat-obrazek')) { obnovPanel('plakat-obrazek'); return; }
  otevriPanel({
    id: 'plakat-obrazek', trida: 'panel-okno panel-obrazek',
    titul: () => (velky && velky.druh === 'pribeh' ? 'Obrázek příběhu' : velky && velky.druh === 'prispevek' ? 'Obrázek příspěvku' : 'Obrázek plakátu'),
    vykresli: obrazekHtml, paticka: patickaObrazku,
    priZavreni: () => { velky = null; }
  });
}

/** data: adresa JPEG (jen znaky base64, bez uvozovek) – rovnou do src a href; esc by u 2 MB textu zbytečně zdržel. */
const jpegData = (u) => (u && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(u.data) ? u.data : '');

function obrazekHtml() {
  const u = velky;
  if (!u) return '';
  if (u.chyba) return '<p class="pruh pruh-varovani">' + esc(u.chyba) + '</p>';
  if (!u.data) return '<div class="pl-obrazek pl-obrazek--ceka" role="status">' + kostra(1) + '<p>Připravuji obrázek…</p></div>';
  const dotyk = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const navod = jeIos() ? 'Podrž prst na obrázku → <b>Přidat do Fotek</b>' + (lzeSdilet(u.soubor) ? ' (nebo Sdílet → Uložit obrázek).' : '.')
    : dotyk ? 'Podrž prst na obrázku → <b>Stáhnout obrázek</b>, nebo tlačítko Stáhnout.'
    : 'Tlačítko Stáhnout, nebo pravým tlačítkem na obrázku → Uložit obrázek jako…';
  const popis = u.druh === 'pribeh' ? 'Příběh 1080 × 1920' : u.druh === 'prispevek' ? 'Příspěvek na Instagram' : 'Plakát';
  return '<div class="pl-obrazek' + (u.druh === 'pribeh' ? ' pl-obrazek--pribeh' : '') + '">' +
    '<p class="pl-obrazek__navod">' + IKONY.stahnout + '<span>' + navod + '</span></p>' +
    '<img src="' + jpegData(u) + '" alt="' + popis + '" data-pl-obrazek-img></div>';
}

function patickaObrazku() {
  const u = velky;
  const hotovo = !!(u && u.data && !u.chyba);
  return '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zavřít</button>' +
    (hotovo && lzeSdilet(u.soubor) ? '<button type="button" class="btn btn--plan" data-pl-obrazek-sdilet>' + IKONY.odeslat + '<span>Sdílet / uložit</span></button>' : '') +
    (hotovo && !jeIos() ? '<a class="btn btn--plan" href="' + jpegData(u) + '" download="' + esc(u.nazev) + '">' + IKONY.stahnout + '<span>Stáhnout</span></a>' : '') +
    '</div>';
}

// ---------------------------------------------------------------- Instagram: příspěvek (plakát) a příběh 1080 × 1920

function pisSRozestupem(g, text, x, y, rozestup) {
  // zarovnání na střed s prostrkáním (canvas letterSpacing Safari nezná všude)
  const znaky = Array.from(text);
  const sirka = znaky.reduce((s, z) => s + g.measureText(z).width, 0) + rozestup * (znaky.length - 1);
  let poz = x - sirka / 2;
  g.textAlign = 'left';
  znaky.forEach((z) => { g.fillText(z, poz, y); poz += g.measureText(z).width + rozestup; });
}

function zalom(g, text, max) {
  const radky = [];
  let r = '';
  String(text).split(/\s+/).filter(Boolean).forEach((s) => {
    const zkus = r ? r + ' ' + s : s;
    if (r && g.measureText(zkus).width > max) { radky.push(r); r = s; } else r = zkus;
  });
  if (r) radky.push(r);
  return radky;
}

/** Příběh 9:16: plakát přes celou šířku na tmavém pozadí v barvách plakátu, nahoře PROGRAM VÍKENDU a datum, dole výzva
 *  a @účet. Texty jsou v bezpečné zóně (Instagram nahoře a dole překrývá asi 250 px). platno = obrázek plakátu,
 *  d = podoba plakátu (texty), sobota = víkend. */
function obrazekPribehu(plakat, d0, sobota) {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1920;
  const g = c.getContext('2d');
  const n = P.nastaveniPlakatu(nastaveni());
  const CERVENA = '#D91E26', CERNA = '#111111';
  const ANTON = 'Anton, Impact, "Arial Narrow Bold", sans-serif', TEXT = '"Roboto Condensed", "Arial Narrow", Arial, sans-serif';
  g.fillStyle = CERNA;
  g.fillRect(0, 0, 1080, 1920);
  // rohové trojúhelníky jako na plakátu (vlevo nahoře, vpravo dole)
  const troj = (barva, body) => { g.fillStyle = barva; g.beginPath(); g.moveTo(body[0], body[1]); g.lineTo(body[2], body[3]); g.lineTo(body[4], body[5]); g.closePath(); g.fill(); };
  troj(CERVENA, [0, 0, 120, 0, 0, 120]); troj('#ffffff', [0, 120, 60, 120, 0, 180]); troj(CERVENA, [120, 0, 180, 0, 120, 60]);
  troj(CERVENA, [1080, 1920, 960, 1920, 1080, 1800]); troj('#ffffff', [1080, 1800, 1020, 1800, 1080, 1740]); troj(CERVENA, [960, 1920, 900, 1920, 960, 1860]);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffffff';
  g.font = '700 34px ' + TEXT;
  pisSRozestupem(g, 'FK AGRO VNOROVY', 540, 300, 11);
  g.font = '400 128px ' + ANTON;
  g.textAlign = 'center';
  g.fillText(String(d0.nadpis || n.nadpis).toUpperCase(), 540, 470, 1000); // čárka nad Í nesmí sáhnout na řádek nad ním
  const d = P.datumPlakatu(sobota);
  g.fillStyle = CERVENA;
  g.font = '400 84px ' + ANTON;
  g.fillText((d0.datum || d.datum) + ' ' + (d0.mesic || d.mesic), 540, 566, 1000);
  // čára jako pod nadpisem plakátu: 38 % červená, zbytek bílá
  g.fillStyle = '#ffffff';
  g.fillRect(60, 598, 960, 8);
  g.fillStyle = CERVENA;
  g.fillRect(60, 598, 365, 8);
  const vyska = Math.round(1080 * VYSKA / SIRKA);
  const y = 636;
  g.imageSmoothingQuality = 'high';
  g.drawImage(plakat, 0, y, 1080, vyska);
  g.fillStyle = '#ffffff';
  g.font = '400 66px ' + ANTON;
  g.textAlign = 'center';
  const radky = zalom(g, String(d0.vyzva || n.vyzva).toUpperCase(), 980).slice(0, 2);
  radky.forEach((r, i) => g.fillText(r, 540, y + vyska + 108 + i * 76));
  g.fillStyle = CERVENA;
  g.font = '700 40px ' + TEXT;
  pisSRozestupem(g, '@' + String(n.instagram || 'fkagrovnorovy').toUpperCase(), 540, y + vyska + 108 + radky.length * 76 + 34, 7);
  return c;
}

/** Obrázky pro Instagram: příspěvek 1440 px na šířku (poměr 1400 : 990 – Instagram bere 1,91 : 1 až 4 : 5) a příběh.
 *  Z obrázku plakátu, který už je nakreslený (iPhone ho má připravený dopředu), jinak se nakreslí. */
async function obrazkyProInstagram() {
  const plakat = JSON.parse(JSON.stringify(p.plakat)), sobota = p.sobota;
  const o = await obrazekPlakatu();
  await pripravPisma(); // příběh kreslí texty písmem Anton
  return {
    prispevek: zmensi(o.platno, 1440).toDataURL('image/jpeg', 0.9),
    pribeh: obrazekPribehu(o.platno, plakat, sobota).toDataURL('image/jpeg', 0.9),
    otisk: P.otisk(JSON.stringify(plakat))
  };
}

const kdyPlan = (t) => DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + ' ' + hhmm(t);
const doPole = (t) => isoDatum(t) + 'T' + String(new Date(t).getHours()).padStart(2, '0') + ':' + String(new Date(t).getMinutes()).padStart(2, '0');

/** Výchozí čas: čtvrtek před víkendem 18:00; když už prošel, za hodinu (zaokrouhleno na 5 min); u plánu jeho čas. */
function vychoziCas(tyden) {
  const plan = data().plan[tyden];
  if (plan && plan.stav === 'ceka' && plan.kdy > Date.now()) return plan.kdy;
  const c = new Date(pridejDny(terminDatum(tyden), -2));
  c.setHours(18, 0, 0, 0);
  if (c.getTime() > Date.now() + 5 * 60e3) return c.getTime();
  return Math.ceil((Date.now() + 60 * 60e3) / 3e5) * 3e5;
}

function stitekPopisku(zdroj) {
  return zdroj === 'claude' ? '<span class="tag tag--fialova">' + IKONY.claude + 'od Clauda</span>'
    : zdroj === 'rucne' ? '<span class="tag tag--warn">upraveno</span>'
    : zdroj === 'plan' ? '<span class="tag tag--plan">' + IKONY.kalendar + 'v plánu</span>' : '';
}

/** Popisek uložený v motoru: u plakátu v plánu ten z plánu (motor ho drží zvlášť – pozdější popisek od Clauda ho sám
 *  nezmění), jinak popisek kola. */
function ulozenyPopisek(s) {
  const pop = data().popisky[s] || {};
  return String(data().plan[s] && pop.plan ? pop.plan : pop.text || '');
}
/** Popisek, který půjde na Instagram: rozepsaný v kartě, jinak uložený. */
const textPopisku = (s) => (s in p.popisek ? String(p.popisek[s]) : ulozenyPopisek(s));
const ucty = (seznam) => (Array.isArray(seznam) ? seznam.map((u) => '@' + u).join(', ') : '');

function stavPlanuHtml(plan) {
  if (!plan) return '';
  const kartaIg = ig_.stavKartaAtr('plakat', p.sobota); // najetí / klepnutí = kroky s časy
  if (plan.stav === 'ceka') {
    return '<span class="tag tag--plan"' + kartaIg + '>' + IKONY.kalendar + (plan.jenPribeh ? 'příběh vyjde ' : 'vyjde ') + esc(kdyPlan(plan.kdy)) + '</span>' +
      (plan.pribeh && !plan.jenPribeh ? '<span class="tag tag--seda">i do příběhu</span>' : '') +
      (plan.oznacit && plan.oznacit.length ? '<span class="tag tag--seda">' + (plan.jenPribeh ? 'zmíní ' : 'označí ') + esc(ucty(plan.oznacit)) + '</span>' : '');
  }
  // jen příběh (Michal 15. 10.) – po 24 h zmizí, plakát jde potom i jako příspěvek
  if (plan.stav === 'hotovo' && plan.jenPribeh) {
    return '<span class="tag tag--ok"' + kartaIg + '>' + IKONY.fajfka + 'příběh vyšel ' + esc(casKratce(Number(plan.zverejneno) || plan.kdy, Date.now())) + '</span>' +
      (plan.zminkyChyba ? '<span class="tag tag--warn">bez zmínek</span>' : '');
  }
  if (plan.stav === 'nahrava' || plan.stav === 'zverejnuji') return '<span class="tag tag--plan"' + kartaIg + '>' + IKONY.obnovit + 'zveřejňuje se na Instagram</span>';
  if (plan.stav === 'hotovo') {
    return '<span class="tag tag--ok"' + kartaIg + '>' + IKONY.fajfka + 'na Instagramu' + (plan.zverejneno ? ' od ' + esc(kdyPlan(plan.zverejneno)) : '') + '</span>' +
      (plan.mediaPribeh ? '<span class="tag tag--ok">i v příběhu</span>' : '');
  }
  if (plan.stav === 'chyba') return '<span class="tag tag--danger"' + kartaIg + '>nepovedlo se – ' + (umiMotor('igKrok') ? 'zkus znovu' : 'naplánuj znovu') + '</span>';
  return '';
}

function klicIg() {
  const d = data(), s = p.sobota;
  return JSON.stringify([s, d.popisky[s], d.plan[s], d.obrazky[s], d.ig, p.igPracuje, umiMotor('plakatNaplanovat'), s in p.popisek,
    (uloziste.cti(OTISKY) || {})[s] === P.otisk(JSON.stringify(p.plakat || {})), ig_.klic('plakat', s), umiMotor('igKrok'), (p.navrh || {})[s]]);
}

/** Tlačítka karty Instagram (Michal 15. 10.: na telefonu vidět hned, bez hledání – proto nad popiskem). */
function akceIgHtml(plan, ig, text) {
  const s = p.sobota;
  let akce = '';
  if (plan && plan.stav === 'hotovo' && !(plan.jenPribeh && umiMotor('igJenPribeh'))) {
    if (plan.odkaz) akce += '<a class="btn btn--ghost" href="' + esc(plan.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.odkaz + '<span>Na Instagramu</span></a>';
  } else if (!umiMotor('plakatNaplanovat') || !ig.nastaveno || (plan && (plan.stav === 'nahrava' || plan.stav === 'zverejnuji'))) {
    akce = '';
  } else if (plan && plan.stav === 'ceka') {
    const ted = ig_.tlacitkoTedHtml('plakat', s);
    akce += ted + '<button type="button" class="btn ' + (ted ? 'btn--ghost' : 'btn--plan') + '" data-pl-ig-naplanovat>' + IKONY.kalendar + '<span>Změnit čas / popisek</span></button>' +
      '<button type="button" class="btn btn--ghost" data-pl-ig-zrusit>' + IKONY.zavrit + '<span>Zrušit plán</span></button>';
  } else if (umiMotor('igKrok')) {
    // Zveřejnit teď i Naplánovat otevřou stejné okno (popisek, označení, příběh, náhled) – liší se jen „Kdy“
    akce += '<button type="button" class="btn btn--plan" data-pl-ig-hned>' + IKONY.odeslat + '<span>Zveřejnit teď</span></button>' +
      '<button type="button" class="btn btn--ghost" data-pl-ig-naplanovat>' + IKONY.kalendar + '<span>Naplánovat</span></button>';
  } else {
    akce += '<button type="button" class="btn btn--plan" data-pl-ig-naplanovat>' + IKONY.kalendar + '<span>Naplánovat na Instagram</span></button>';
  }
  if (String(text).trim()) akce += '<button type="button" class="btn btn--ghost" data-pl-kopirovat>' + IKONY.kopirovat + '<span>Kopírovat popisek</span></button>';
  return akce ? '<div class="pl-ig__akce">' + akce + '</div>' : '';
}

function igHtml() {
  const d = data(), s = p.sobota;
  const pop = d.popisky[s] || {};
  const plan = d.plan[s] || null;
  const ig = d.ig || {};
  const n = P.nastaveniPlakatu(nastaveni());
  const rucne = s in p.popisek;
  const text = textPopisku(s);
  const vPlanu = !rucne && !!(plan && pop.plan);
  const styl = s in p.styl ? p.styl[s] : String(pop.styl || '');
  let h = hlavickaKarty(IKONY.instagram, 'Instagram', '@' + esc(ig.ucet || n.instagram)) + '<div class="pl-telo">';
  const stavHtml = stavPlanuHtml(plan);
  if (stavHtml) h += '<div class="pl-ig__stav">' + stavHtml + '</div>';
  h += akceIgHtml(plan, ig, text); // tlačítka hned pod stavem – průběh s kroky je dlouhý
  // průběh s časy, zaseknutí a Zkusit znovu (js/ig.js); starší motor bez průběhu: jen chyba jako dřív
  const prubeh = plan ? ig_.prubehHtml('plakat', s, plan) : '';
  if (prubeh) h += prubeh;
  else if (plan && plan.stav === 'chyba') h += '<p class="pl-chyba">Na Instagram se nepodařilo: ' + esc(plan.chyba || 'neznámá chyba') + '</p>';
  if (!prubeh && plan && plan.stav === 'hotovo' && plan.pribehChyba) h += '<p class="pl-chyba">Příběh nevyšel: ' + esc(plan.pribehChyba) + ' (příspěvek platí)</p>';
  if (umiMotor('plakatNaplanovat') && !ig.nastaveno && !(plan && plan.stav === 'hotovo')) {
    h += '<p class="napoveda">Instagram není v motoru propojený (IG_TOKEN) – plánování půjde, až bude. Obrázek jde zatím stáhnout nahoře.</p>';
  }
  // obrázky na Instagramu jsou ze starší podoby plakátu (jen víme-li to v tomhle zařízení)
  const otisk = (uloziste.cti(OTISKY) || {})[s];
  if (plan && plan.stav === 'ceka' && otisk && otisk !== P.otisk(JSON.stringify(p.plakat))) {
    h += '<p class="pl-varovani">Plakát se od naplánování změnil – „Změnit čas / popisek“ nahraje jeho novou podobu.</p>';
  }
  h += '<div class="pl-ig__popisek"><span class="label">Popisek</span><span data-pl-popisek-stitek>' +
    stitekPopisku(rucne ? 'rucne' : vPlanu ? 'plan' : pop.zdroj) + '</span></div>';
  if (pop.cekaNaClauda) h += '<p class="pl-ceka" data-pl-ceka>' + IKONY.claude + '<span>Claude píše popisek… (do půl hodiny, když běží PC)</span></p>';
  // Claude poslal popisek až po naplánování – plán drží ten svůj, nový jde použít jedním klepnutím
  if (vPlanu && plan.stav === 'ceka' && pop.zdroj === 'claude' && String(pop.text || '').trim() && String(pop.text).trim() !== pop.plan &&
      (Number(pop.kdy) || 0) > (Number(pop.planKdy) || 0)) {
    h += '<div class="pl-ceka pl-novy-popisek" data-pl-novy-popisek>' + IKONY.claude + '<span>Claude mezitím napsal nový popisek – na Instagram zatím půjde ten z plánu.</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-pl-popisek-novy>Použít nový</button></div>';
  }
  // 2 návrhy od Clauda na výběr (Michal 15. 10.) – Použít = text do pole, uloží se a jde dál přepisovat
  h += navrhyHtml({ varianty: pop.varianty, volba: (p.navrh || {})[s] || 0, atribut: 'data-pl-navrh', id: s });
  // <textarea> zahodí první odřádkování obsahu – když text začíná prázdným řádkem, přidat jedno navíc
  h += '<textarea class="odpoved" data-pl-popisek rows="8" placeholder="Popisek k příspěvku – napiš ho, nebo požádej Clauda (styl níž).">' +
    esc(/^\r?\n/.test(text) ? '\n' + text : text) + '</textarea>';
  h += '<div class="pl-styl"><label><span class="label">Styl popisku</span><input class="field" data-pl-styl value="' + esc(styl) + '" ' +
    'placeholder="např. vtipně, derby, ať přijde hodně lidí" autocomplete="off"></label>' +
    '<button type="button" class="btn btn--ghost" data-pl-popisek-claude' + (p.igPracuje === 'popisek' ? ' disabled' : '') + '>' + IKONY.claude +
      '<span>' + (p.igPracuje === 'popisek' ? 'Posílám…' : 'Popisek od Clauda') + '</span></button></div>';
  return h + '</div>';
}

function zmenPopisek(t) {
  const s = p.sobota;
  p.popisek[s] = t.value;
  const st = document.querySelector('#p-plakaty [data-pl-popisek-stitek]');
  if (st) st.innerHTML = stitekPopisku('rucne');
  clearTimeout(p.casovacPopisku);
  p.casovacPopisku = setTimeout(ulozPopisekHned, ULOZIT_PO);
}

function ulozPopisekHned() {
  clearTimeout(p.casovacPopisku);
  p.casovacPopisku = 0;
  Object.keys(p.popisek).forEach((tyden) => {
    const text = p.popisek[tyden];
    p.fronta = p.fronta.then(() => volej('plakatPopisekUlozit', { tyden, text })).then((v) => {
      if (v && v.popisky) data().popisky = v.popisky;
      ulozDoZarizeni();
      if (p.popisek[tyden] === text) delete p.popisek[tyden];
      // štítek „upraveno“ hned, i když se do pole pořád píše (karta se pod rukama nepřekresluje)
      const st = p.sobota === tyden && document.querySelector('#p-plakaty [data-pl-popisek-stitek]');
      if (st && data().popisky[tyden]) st.innerHTML = stitekPopisku(data().popisky[tyden].zdroj || 'rucne');
      zmeneno();
    }).catch((e) => toast('Popisek se neuložil: ' + e.message, true));
  });
  return p.fronta;
}

/** Nový popisek od Clauda (přišel po naplánování) do karty i do plánu. */
function pouzijNovyPopisek() {
  const s = p.sobota;
  const pop = data().popisky[s] || {};
  if (!pop.text) return;
  p.popisek[s] = String(pop.text);
  zmeneno();
  ulozPopisekHned().then(() => toast('Nový popisek platí i pro plán'));
}

function pozadejClauda() {
  const tyden = p.sobota;
  if (!p.plakat || p.igPracuje) return;
  const pop = data().popisky[tyden] || {};
  const styl = String(tyden in p.styl ? p.styl[tyden] : pop.styl || '').trim();
  const souhrn = P.souhrnProClauda(p.plakat, tyden, fotbalData(), nastaveni());
  p.igPracuje = 'popisek';
  zmeneno();
  ulozPopisekHned();
  p.fronta = p.fronta.then(() => volej('plakatPopisek', { tyden, styl, souhrn })).then((v) => {
    if (v && v.popisky) data().popisky = v.popisky;
    ulozDoZarizeni();
    toast('Claude dostal úkol – popisek přijde do půl hodiny (když běží PC)');
  }).catch((e) => toast(e.message, true)).then(() => { p.igPracuje = ''; zmeneno(); });
}

/** Čeká se na popisek od Clauda: na stránce se jednou za 3 minuty podívat (s účtem z kopie, jinak z motoru). */
function hlidejPopisek() {
  const pop = data() && data().popisky[p.sobota];
  if (!pop || !pop.cekaNaClauda || p.hlidac) return;
  p.hlidac = setTimeout(() => {
    p.hlidac = 0;
    if (stav.pohled === 'plakaty' && document.visibilityState === 'visible') nactiPlakaty();
  }, 180e3);
}

// ---------------------------------------------------------------- okno Naplánovat / Zveřejnit na Instagram (jako u reelu)
// Kdy (Naplánovat s datem a časem / Teď), účty k označení, i do příběhu, popisek (předvyplněný od Clauda nebo uložený,
// jde upravit – uloží se jako popisek kola i k plánu) a náhled obrázků (klepnutí = obrázek přes celou obrazovku k uložení).

function otevriPlan(hned) {
  if (!p.plakat) return;
  const tyden = p.sobota;
  const plan = data().plan[tyden];
  const ceka = !!(plan && plan.stav === 'ceka');
  p.ig = { tyden, kdy: doPole(vychoziCas(tyden)), pribeh: !(plan && plan.pribeh === false), popisek: textPopisku(tyden),
    jenPribeh: !!(ceka && plan.jenPribeh), // jen příběh bez příspěvku (motor 2026-10-15.2, schopnost igJenPribeh)
    oznacit: ceka ? ucty(plan.oznacit) : String(uloziste.cti(OZNACIT) || ''),
    ukladam: false, nahled: null, chyba: '', hned: !!hned && umiMotor('igKrok'), zmena: ceka };
  const moje = p.ig;
  // obrázky se kreslí hned při otevření – v okně je vidět, co na Instagram půjde (iPhone má plakát nakreslený dopředu)
  moje.obrazky = obrazkyProInstagram();
  moje.obrazky.then((o) => { if (p.ig === moje) { moje.nahled = o; obnovCastiPlanu(); } },
    (e) => { if (p.ig === moje) { moje.chyba = e.message; obnovCastiPlanu(); } });
  otevriPanel({
    id: 'plakat-ig', trida: 'panel-okno panel-formular',
    titul: () => (p.ig && p.ig.hned ? 'Zveřejnit na Instagram' : p.ig && p.ig.zmena ? 'Změnit plán na Instagram' : 'Naplánovat na Instagram'),
    vykresli: planHtml, paticka: patickaPlanu,
    // na telefonu nic nefokusovat – klávesnice ani výběr data by nemusely vyskočit hned při otevření
    poOtevreni: (el) => {
      const pole = !window.matchMedia('(pointer: coarse)').matches && el.querySelector('[data-pl-ig="kdy"]');
      if (pole) pole.focus(); else el.focus({ preventScroll: true });
    },
    priZavreni: () => { if (p.ig === moje) p.ig = null; }
  });
}

function napovedaPlanu(ig) {
  const ucet = '@' + ((data().ig || {}).ucet || P.nastaveniPlakatu(nastaveni()).instagram);
  return 'Plakát víkendu ' + esc(P.rozsahVikendu(ig.tyden)) + ' vyjde na ' + esc(ucet) + (ig.hned ? ' hned' : ' sám v zadaný čas (do 10 minut)') +
    (ig.jenPribeh ? ' – jen příběh 1080 × 1920 (bez příspěvku a popisku, po 24 h zmizí).' : ' – příspěvek s popiskem' + (ig.pribeh ? ' a příběh' : '') + '.') +
    (ig.hned ? ' Průběh uvidíš v kartě Instagram.' : '');
}

function nahledPlanuHtml(ig) {
  if (!ig.nahled) return ig.chyba ? '' : '<p class="napoveda">Připravuji obrázky z plakátu…</p>';
  const obr1 = (druh, trida, popis, popisek) => '<figure><button type="button" class="pl-ig-nahled__btn" data-pl-ig-ukaz="' + druh + '" aria-label="' + popis + ' přes celou obrazovku">' +
    '<img class="' + trida + '" src="' + ig.nahled[druh] + '" alt="' + popis + '"></button><figcaption>' + popisek + '</figcaption></figure>';
  return obr1('prispevek', 'pl-nahled-prispevek', 'Příspěvek', 'Příspěvek 1440 px') + obr1('pribeh', 'pl-nahled-pribeh', 'Příběh', 'Příběh') +
    '<p class="napoveda pl-ig-nahled__napoveda">Klepni na obrázek – zvětší se a jde uložit do Fotek.</p>';
}

function planHtml() {
  const ig = p.ig;
  if (!ig) return '';
  const pop = data().popisky[ig.tyden] || {};
  // Kdy: Naplánovat (čas) / Teď – jen s motorem, který umí igKrok (Zveřejnit teď)
  const volba = umiMotor('igKrok') ? '<div class="rp-kdy"><span class="label">Kdy</span>' +
    segment([['cas', 'Naplánovat'], ['ted', 'Teď']], ig.hned ? 'ted' : 'cas', 'data-pl-ig-kdy-volba', 'Kdy zveřejnit') + '</div>' : '';
  // <textarea> zahodí první odřádkování obsahu – když popisek začíná prázdným řádkem, přidat jedno navíc
  const text = /^\r?\n/.test(ig.popisek) ? '\n' + ig.popisek : ig.popisek;
  const sPlanem = umiMotor('plakatPlanPopisek'); // motor drží popisek k plánu a umí označit účty (od 2026-10-15.1)
  return '<div class="formular">' +
    '<p class="napoveda" data-pl-ig-napoveda>' + napovedaPlanu(ig) + '</p>' + volba +
    (ig.hned ? '' : '<label><span class="label">' + (volba ? 'Datum a čas' : 'Kdy') + '</span><input class="field" type="datetime-local" data-pl-ig="kdy" value="' + esc(ig.kdy) + '"></label>') +
    (umiMotor('igJenPribeh') ? '<div class="rp-kdy"><span class="label">Kam</span>' + segment([['prispevek', 'Příspěvek'], ['oba', 'Příspěvek + příběh'],
      ['pribeh', 'Jen příběh']], ig.jenPribeh ? 'pribeh' : ig.pribeh ? 'oba' : 'prispevek', 'data-pl-ig-kam', 'Kam zveřejnit') + '</div>' : '') +
    // účty k označení se skupinami (js/ig_skupiny.js) – klepnutí na skupinu přidá / ubere její lidi
    (sPlanem ? skupiny.oznaceniHtml({ popisek: ig.jenPribeh ? 'Zmínit účty v příběhu' : 'Označit účty', popisekAtr: 'data-pl-ig-oznacit-popis', atribut: 'data-pl-ig="oznacit"', hodnota: ig.oznacit }) : '') +
    (umiMotor('igJenPribeh') ? '' : '<label class="prepinac-radek"><span><b>I do příběhu</b><small>plakát 1080 × 1920 na tmavém pozadí i do příběhu (story)</small></span>' +
      '<span class="prepinac"><input type="checkbox" data-pl-ig="pribeh"' + (ig.pribeh ? ' checked' : '') + '><span></span></span></label>') +
    '<div class="pl-ig-jen-prispevek" data-pl-ig-prispevek' + (ig.jenPribeh ? ' hidden' : '') + '>' +
    (pop.cekaNaClauda && !String(ig.popisek).trim() ? '<p class="pl-ceka">' + IKONY.claude + '<span>Claude píše popisek… (do půl hodiny, když běží PC) – nebo ho napiš sám.</span></p>' : '') +
    '<label><span class="label">Popisek na Instagram</span><textarea class="odpoved pl-ig-popisek" data-pl-ig="popisek" rows="9" ' +
      'placeholder="Popisek k příspěvku – napiš ho, nebo požádej Clauda v kartě Instagram.">' + esc(text) + '</textarea></label>' +
    '<p class="napoveda">Popisek se uloží i v kartě Instagram' + (sPlanem ? ' a drží se k plánu – pozdější popisek od Clauda ho sám nezmění.' : '.') + '</p></div>' +
    '<div class="pl-ig-nahled" data-pl-ig-nahled>' + nahledPlanuHtml(ig) + '</div>' +
    '<p class="pruh pruh-varovani" data-pl-ig-chyba' + (ig.chyba ? '' : ' hidden') + '>' + esc(ig.chyba) + '</p></div>';
}

function patickaPlanu() {
  const ig = p.ig;
  const popisek = !ig ? '' : ig.ukladam ? 'Nahrávám…' : !ig.nahled && !ig.chyba ? 'Připravuji obrázky…'
    : ig.hned ? 'Zveřejnit teď' : ig.zmena ? 'Uložit změny' : 'Naplánovat';
  return '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
    '<button type="button" class="btn btn--plan" data-pl-ig-ulozit' + (ig && (ig.ukladam || !ig.nahled) ? ' disabled' : '') + '>' +
    (ig && ig.hned ? IKONY.odeslat : IKONY.kalendar) + '<span>' + popisek + '</span></button></div>';
}

/** Překreslí v okně plánu jen náhled, chybu a tlačítka – rozepsaný popisek (a klávesnice v telefonu) zůstane. */
function obnovCastiPlanu() {
  const el = elementPanelu('plakat-ig'), ig = p.ig;
  if (!el || !ig) return;
  const nahled = el.querySelector('[data-pl-ig-nahled]');
  if (nahled) nahled.innerHTML = nahledPlanuHtml(ig);
  const napoveda = el.querySelector('[data-pl-ig-napoveda]');
  if (napoveda) napoveda.innerHTML = napovedaPlanu(ig);
  const ch = el.querySelector('[data-pl-ig-chyba]');
  if (ch) { ch.textContent = ig.chyba; ch.hidden = !ig.chyba; }
  const paticka = el.querySelector('.panel-paticka');
  if (paticka) paticka.innerHTML = patickaPlanu();
}

async function ulozPlan() {
  const ig = p.ig;
  if (!ig) return;
  const ukaz = (t) => { ig.chyba = t; obnovCastiPlanu(); };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ig.kdy || '');
  if (!m && !ig.hned) { ukaz('Vyber datum a čas.'); return; }
  const text = String(ig.popisek || '').replace(/\r\n/g, '\n').trim();
  if (!text && !ig.jenPribeh) { ukaz('Popisek je prázdný – napiš ho, nebo požádej Clauda v kartě Instagram.'); return; }
  if (text.length > 2200 && !ig.jenPribeh) { ukaz('Popisek je delší než 2 200 znaků – Instagram ho nevezme.'); return; }
  const kontrola = uctyKOznaceni(ig.oznacit);
  if (kontrola.chyba) { ukaz(kontrola.chyba); return; }
  let kdy = ig.hned ? Date.now() : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  if (!ig.hned && kdy < Date.now() - 60e3) { ukaz('Ten čas už byl – vyber pozdější.'); return; }
  ig.ukladam = true;
  ukaz('');
  try {
    // popisek z okna = popisek kola (karta ukáže totéž); uloží se jen změněný, ať zůstane štítek „od Clauda“
    if (!ig.jenPribeh && (ig.tyden in p.popisek || text !== ulozenyPopisek(ig.tyden).trim())) p.popisek[ig.tyden] = text;
    await ulozPopisekHned();
    const o = await ig.obrazky;
    const v1 = await volej('plakatObrazky', { tyden: ig.tyden, prispevek: o.prispevek, pribeh: o.pribeh });
    if (v1 && v1.obrazky) data().obrazky = v1.obrazky;
    if (ig.hned) kdy = Date.now(); // obrázky se mezitím nahrávaly
    const sPlanem = umiMotor('plakatPlanPopisek');
    const v2 = await volej('plakatNaplanovat', Object.assign({ tyden: ig.tyden, kdy, pribeh: !!ig.pribeh && !ig.jenPribeh },
      ig.jenPribeh ? { jenPribeh: true, oznacit: ig.oznacit } : sPlanem ? { popisek: text, oznacit: ig.oznacit } : {}));
    if (v2 && v2.plan) data().plan = v2.plan;
    if (v2 && v2.popisky) data().popisky = v2.popisky;
    ulozDoZarizeni();
    const otisky = uloziste.cti(OTISKY) || {};
    otisky[ig.tyden] = o.otisk;
    uloziste.pis(OTISKY, otisky);
    if (sPlanem) uloziste.pis(OZNACIT, ig.oznacit);
    zavriPanel();
    const co = ig.jenPribeh ? ' jen příběh' : ig.pribeh ? ' i s příběhem' : '';
    toast(ig.hned ? 'Zveřejňuji na Instagram' + co + ' – průběh vidíš v kartě Instagram'
      : (ig.zmena ? 'Plán změněný' : 'Naplánováno') + ' – vyjde ' + kdyPlan(kdy) + co);
    zmeneno();
    if (ig.hned) ig_.hned('plakat', ig.tyden, 'ted');
  } catch (e) {
    if (p.ig !== ig) { toast(e.message, true); return; }
    ig.ukladam = false;
    ukaz(e.message);
    toast(e.message, true);
  }
}

function zrusPlan() {
  const tyden = p.sobota;
  potvrd('Zrušit naplánované zveřejnění?', { text: 'Plakát víkendu ' + P.rozsahVikendu(tyden) + ' pak na Instagram nepůjde sám.', ano: 'Zrušit plán', ne: 'Nechat' }).then((ano) => {
    if (!ano) return;
    volej('plakatZrusitPlan', { tyden })
      .then((v) => {
        data().plan = (v && v.plan) || {};
        if (v && v.popisky) data().popisky = v.popisky;
        ulozDoZarizeni();
        toast('Plán zrušený');
      })
      .catch((e) => toast(e.message, true))
      .then(zmeneno);
  });
}

// ---------------------------------------------------------------- ovládání (app.js)

export function klikPlakaty(el) {
  if (el.hasAttribute('data-pl-znovu')) { nactiPlakaty(true); return true; }
  if (el.dataset.plPosun) { posun(Number(el.dataset.plPosun)); return true; }
  if (el.hasAttribute('data-pl-tisk')) { tiskni(); return true; }
  if (el.hasAttribute('data-pl-stahnout')) { stahniObrazek(); return true; }
  if (el.hasAttribute('data-pl-vratit')) { vratPodleRozlosovani(); return true; }
  if (el.dataset.plPridat) { pridej(el.dataset.plPridat); return true; }
  if (el.dataset.plSmazat) { smaz(el.dataset.plSmazat); return true; }
  if (el.hasAttribute('data-pl-popisek-claude')) { pozadejClauda(); return true; }
  if (el.hasAttribute('data-pl-ig-naplanovat') || el.hasAttribute('data-pl-ig-hned')) { otevriPlan(el.hasAttribute('data-pl-ig-hned')); return true; }
  if (el.dataset.plIgKdyVolba) { if (p.ig) { p.ig.hned = el.dataset.plIgKdyVolba === 'ted'; obnovPanel('plakat-ig'); } return true; }
  if (el.hasAttribute('data-pl-ig-ulozit')) { if (p.ig && !p.ig.ukladam) ulozPlan(); return true; }
  if (el.dataset.plIgKam) {
    // kam: příspěvek / + příběh / jen příběh – jen části okna (rozepsaný popisek zůstane)
    if (p.ig) {
      p.ig.jenPribeh = el.dataset.plIgKam === 'pribeh';
      p.ig.pribeh = el.dataset.plIgKam !== 'prispevek';
      const okno = elementPanelu('plakat-ig');
      if (okno) {
        okno.querySelectorAll('[data-pl-ig-kam]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        const pr = okno.querySelector('[data-pl-ig-prispevek]');
        if (pr) pr.hidden = p.ig.jenPribeh;
        const op = okno.querySelector('[data-pl-ig-oznacit-popis]');
        if (op) op.textContent = p.ig.jenPribeh ? 'Zmínit účty v příběhu' : 'Označit účty';
      }
      obnovCastiPlanu();
    }
    return true;
  }
  if (el.dataset.plNavrhVolba != null && el.hasAttribute('data-pl-navrh-volba')) { (p.navrh = p.navrh || {})[p.sobota] = Number(el.dataset.plNavrhVolba) || 0; zmeneno(); return true; }
  if (el.dataset.plNavrhPouzit) {
    const pop = (data() && data().popisky[p.sobota]) || {};
    const i = (p.navrh || {})[p.sobota] || 0;
    const text = Array.isArray(pop.varianty) ? pop.varianty[i] : '';
    if (text) { p.popisek[p.sobota] = String(text); zmeneno(); ulozPopisekHned(); toast('Návrh ' + (i + 1) + ' je v popisku – jde dál upravit'); }
    return true;
  }
  if (el.hasAttribute('data-pl-ig-zrusit')) { zrusPlan(); return true; }
  if (el.hasAttribute('data-pl-kopirovat')) { kopiruj(textPopisku(p.sobota), 'Popisek zkopírovaný – vlož ho do Instagramu'); return true; }
  if (el.hasAttribute('data-pl-popisek-novy')) { pouzijNovyPopisek(); return true; }
  if (el.dataset.plIgUkaz) {
    const druh = el.dataset.plIgUkaz;
    if (p.ig && p.ig.nahled && p.ig.nahled[druh]) ukazObrazek({ druh, data: p.ig.nahled[druh], nazev: 'plakat_' + p.ig.tyden + '_' + druh + '.jpg' });
    return true;
  }
  if (el.hasAttribute('data-pl-obrazek-sdilet')) {
    // sdílení hned v klepnutí (Safari ho jinak nepustí); nevyjde-li, zůstává obrázek k podržení prstem
    if (velky && !sdilejHned(velky.soubor, () => toast('Sdílení nevyšlo – podrž prst na obrázku a ulož ho.', true))) toast('Sdílení tu nejde – podrž prst na obrázku.', true);
    return true;
  }
  if (el.hasAttribute('data-pl-alias-pridat')) { pracovniNastaveni().aliasy.push(['', '']); nastaveniZmeneno(true); return true; }
  if (el.dataset.plAliasSmazat != null) { pracovniNastaveni().aliasy.splice(Number(el.dataset.plAliasSmazat), 1); nastaveniZmeneno(true); return true; }
  return false;
}

/** Psaní a výběr (input i change): editor, víkend, popisek, styl, nastavení, okno plánu. */
export function vstupPlakaty(e) {
  const t = e.target;
  if (!t || !t.matches) return false;
  if (t.matches('[data-pl-cesta]')) { zmenPole(t); return true; }
  if (t.matches('[data-pl-vyber]')) { if (e.type === 'change') prepniVikend(t.value); return true; }
  if (t.matches('[data-pl-popisek]')) { if (e.type === 'input') zmenPopisek(t); return true; }
  if (t.matches('[data-pl-styl]')) { p.styl[p.sobota] = t.value; return true; }
  if (t.matches('[data-pl-nast], [data-pl-alias-klic], [data-pl-alias-znak]')) { zmenNastaveni(t); return true; }
  if (t.matches('[data-pl-ig]')) {
    if (p.ig) {
      p.ig[t.dataset.plIg] = t.type === 'checkbox' ? t.checked : t.value;
      if (t.type === 'checkbox') obnovCastiPlanu(); // jen nápověda – rozepsaný popisek zůstane
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- pravé tlačítko (Michal 11. 10.) a Plakát k zápasu ze Fotbalu
// Na náhledu plakátu a v kartě Instagram: Stáhnout obrázek, Vytisknout, Kopírovat popisek, Zveřejnit teď / Naplánovat /
// Změnit čas / Zrušit plán (jako tlačítka v kartě), Popisek od Clauda, Vrátit podle rozlosování.

/** Plakát k zápasu (nabídka zápasu ve Fotbale): stránka Plakáty rovnou na víkendu toho zápasu. */
hooky.plakatVikend = (t) => {
  const sobota = P.vikendZapasu(t);
  if (p.sobota && p.sobota !== sobota) prepniVikend(sobota); else p.sobota = sobota;
  prejdi('plakaty');
  zmeneno();
};

function nabidkaPlakatu(cil) {
  if (!cil.closest('#p-plakaty .plakat-nahled, #p-plakaty .pl-ig') || !data() || !p.plakat) return null;
  const s = p.sobota, d = data();
  const plan = d.plan[s] || null;
  const ig = d.ig || {};
  const text = textPopisku(s);
  const pol = [
    { ikona: IKONY.stahnout, text: 'Stáhnout obrázek', fn: stahniObrazek },
    { ikona: IKONY.tisk, text: 'Vytisknout / PDF', fn: tiskni }
  ];
  if (text.trim()) pol.push({ ikona: IKONY.kopirovat, text: 'Kopírovat popisek', fn: () => kopiruj(text, 'Popisek zkopírovaný') });
  if (plan && plan.stav === 'hotovo') {
    if (/^https:\/\//.test(plan.odkaz || '')) pol.push({ ikona: IKONY.instagram, text: 'Otevřít na Instagramu', oddel: true, fn: () => otevriOdkaz(plan.odkaz) });
  } else if (umiMotor('plakatNaplanovat') && ig.nastaveno && !(plan && (plan.stav === 'nahrava' || plan.stav === 'zverejnuji'))) {
    if (plan && plan.stav === 'ceka') {
      if (umiMotor('igKrok')) pol.push({ ikona: IKONY.odeslat, text: 'Zveřejnit teď', oddel: true, fn: () => ig_.zverejnitTed('plakat', s) });
      pol.push({ ikona: IKONY.kalendar, text: 'Změnit čas / popisek…', oddel: !umiMotor('igKrok'), fn: () => otevriPlan(false) });
      pol.push({ ikona: IKONY.zavrit, text: 'Zrušit plán', fn: zrusPlan });
    } else {
      if (umiMotor('igKrok')) pol.push({ ikona: IKONY.odeslat, text: 'Zveřejnit teď…', oddel: true, fn: () => otevriPlan(true) });
      pol.push({ ikona: IKONY.kalendar, text: 'Naplánovat na Instagram…', oddel: !umiMotor('igKrok'), fn: () => otevriPlan(false) });
    }
  }
  if (!p.igPracuje) pol.push({ ikona: IKONY.claude, text: 'Popisek od Clauda', fn: pozadejClauda });
  if (p.upraveno) pol.push({ ikona: IKONY.obnovit, text: 'Vrátit podle rozlosování', oddel: true, fn: vratPodleRozlosovani });
  return { nadpis: 'Plakát · ' + P.popisVikendu(s), polozky: pol };
}
pripojNabidku(nabidkaPlakatu);
