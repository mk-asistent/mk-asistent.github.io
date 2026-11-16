// Vzdělávání (Michal 16. 11.): trenérské kurzy přehledově – karta kurzu, zásady, barevné dlaždice témat, okno tématu
// (myšlenky, čísla, tabulky, Do tréninku, Pozor, otázky s odpověďmi, zdroje) a Procvičit (otázky v náhodném pořadí).
// Data VZDELAVANI/kurzy/<id>.json píše jen Claude, motor je čte akcí vzdelavani (očištěné). Nic se nezapisuje do motoru:
// poslední výsledek a značky „zopakovat“ jsou jen v zařízení (localStorage přes uloziste – bez něj stránka funguje dál).
// Modul načte app.js až na stránce Vzdělávání; klepnutí si obsluhuje sám (atributy data-vz-…).

import { volej, jeDemo } from './api.js';
import { zmeneno } from './stav.js';
import { esc, uloziste, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { kostra, chybaHtml, segment } from './ui.js';
import { otevriPanel, obnovPanel, jeOtevreny, horniPanel, zavriAPak, elementPanelu } from './panely.js';

const ULOZISTE = 'asistent.data.vzdelavani';
const VOLBY = 'asistent.volby.vzdelavani';     // { kurz } – vybraný kurz
const PROCVIC = 'asistent.vzdelavani.procvic';  // { <kurz>: { posledni: { kdy, vedel, celkem, rozsah }, zopakovat: { '<téma>#<i>': 1 } } }
const OBNOVA_PO = 600000;                        // z motoru znovu nejdřív po 10 min (z minula se ukáže hned)
const ZNOVU_PO_CHYBE = 60000;
const OKNO_TEMA = 'vz-tema', OKNO_PROCVIC = 'vz-procvic';
const ODSTINU = 8; // paleta dlaždic témat (vzdelavani.css .vz-odstin-0…7 – barvy oblastí aplikace)
const IKONY_TEMAT = ['zapas', 'aktivita', 'lide', 'kalendar', 'srdce', 'otazka', 'tabulka', 'hvezda'];

const ulozeno = uloziste.cti(ULOZISTE);
const volby = uloziste.cti(VOLBY) || {};
const c = {
  data: (ulozeno && ulozeno.data) || null, kdy: (ulozeno && ulozeno.kdy) || 0, nacita: false, chyba: null, chybaKdy: 0,
  kurz: volby.kurz || '',
  tema: 0,         // otevřené téma (index)
  vse: false,      // v okně tématu ukázat všechny odpovědi
  nahoru: false,   // po přepnutí tématu posunout okno nahoru
  proc: null       // { rozsah, poradi: [{ t, i }], krok, ukazano, vedel, zopakovat: [klíč], hotovo }
};

// ---------------------------------------------------------------- data

export function nactiVzdelavani(znovu) {
  if (c.nacita) return;
  if (!znovu && c.data && Date.now() - c.kdy < OBNOVA_PO) return;
  if (!znovu && c.chyba && Date.now() - c.chybaKdy < ZNOVU_PO_CHYBE) return;
  c.nacita = true;
  volej('vzdelavani').then((d) => {
    c.chyba = null;
    c.data = d && Array.isArray(d.kurzy) ? d : { kurzy: [] };
    c.kdy = Date.now();
    if (!jeDemo()) uloziste.pis(ULOZISTE, { data: c.data, kdy: c.kdy });
  }, (e) => { c.chyba = e; c.chybaKdy = Date.now(); }).then(() => {
    c.nacita = false;
    zmeneno();
    if (jeOtevreny(OKNO_TEMA) && tema()) obnovPanel(OKNO_TEMA);
  });
}

const kurzy = () => (c.data && c.data.kurzy) || [];
function kurz() { const k = kurzy(); return k.find((x) => x.id === c.kurz) || k[0] || null; }
const tema = () => { const k = kurz(); return k ? k.temata[c.tema] || null : null; };
const otazek = (k) => k.temata.reduce((s, t) => s + t.otazky.length, 0);

function pamet(id) {
  const v = uloziste.cti(PROCVIC);
  const m = v && typeof v === 'object' && v[id] && typeof v[id] === 'object' ? v[id] : {};
  return { posledni: m.posledni || null, zopakovat: m.zopakovat && typeof m.zopakovat === 'object' ? m.zopakovat : {} };
}
function ulozPamet(id, fn) {
  const v = uloziste.cti(PROCVIC);
  const vse = v && typeof v === 'object' ? v : {};
  const m = pamet(id);
  fn(m);
  vse[id] = m;
  uloziste.pis(PROCVIC, vse);
}
const kZopakovani = (k, t) => Object.keys(pamet(k.id).zopakovat).filter((x) => x.split('#')[0] === t.id && t.otazky[Number(x.split('#')[1])]).length;

// ---------------------------------------------------------------- pomocné

const datum = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Number(m[3]) + '. ' + Number(m[2]) + '. ' + m[1] : ''; };
const https = (u) => /^https:\/\//i.test(u || '');
const odkaz = (url, text, trida) => https(url)
  ? '<a class="' + (trida || '') + '" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>' : '';
const pocet = (n, a, b, c5) => n + ' ' + tvar(n, a, b, c5);
const odstin = (i) => 'vz-odstin-' + (i % ODSTINU);
const ikonaTematu = (i) => IKONY[IKONY_TEMAT[i % IKONY_TEMAT.length]] || IKONY.vzdelavani;

function stavText(k) {
  if (k.stav === 'splneno') return 'Splněno' + (k.splneno ? ' ' + datum(k.splneno) : '');
  return k.stav === 'rozpracovano' ? 'Rozpracováno' : 'Plánuji';
}

// ---------------------------------------------------------------- stránka

function kurzHtml(k) {
  const n = otazek(k);
  const p = pamet(k.id).posledni;
  const pod = [k.poradatel, k.proKoho ? 'pro ' + k.proKoho : ''].filter(Boolean).map(esc).join(' · ');
  return '<section class="vz-kurz" aria-label="Kurz">' +
    '<div class="vz-kurz__hlavni">' +
      '<div class="vz-kurz__stitky"><span class="vz-kurz__stav vz-kurz__stav--' + esc(k.stav) + '">' + (k.stav === 'splneno' ? IKONY.fajfka : IKONY.cas) +
        esc(stavText(k)) + '</span>' + (k.uroven ? '<span class="vz-kurz__uroven">' + esc(k.uroven) + '</span>' : '') + '</div>' +
      '<h2 class="vz-kurz__nazev">' + esc(k.nazev) + '</h2>' +
      (pod ? '<p class="vz-kurz__pod">' + pod + '</p>' : '') +
      (k.shrnuti ? '<p class="vz-kurz__shrnuti">' + esc(k.shrnuti) + '</p>' : '') +
      '<div class="vz-kurz__akce">' +
        (n ? '<button type="button" class="vz-tl-hlavni" data-vz-procvicit>' + IKONY.otazka + '<span>Procvičit</span></button>' : '') +
        odkaz(k.odkaz, '<span>E-learning</span>' + IKONY.odkaz, 'vz-tl-odkaz') +
      '</div></div>' +
    '<div class="vz-kurz__telo">' +
      (k.vysledek
        ? '<small>Výsledek testu</small><b class="vz-kurz__cislo cisla">' + esc(k.vysledek) + '</b>'
        : '<small>Otázek na procvičení</small><b class="vz-kurz__cislo cisla">' + n + '</b>') +
      (k.test ? '<span class="vz-kurz__test">' + esc(k.test) + '</span>' : '') +
      '<div class="vz-kurz__deleni"><div><small>Témat</small><b class="cisla">' + k.temata.length + '</b></div>' +
        '<div><small>Otázek</small><b class="cisla">' + n + '</b></div>' +
        '<div><small>Procvičeno</small><b class="cisla">' + (p ? p.vedel + ' / ' + p.celkem : '–') + '</b></div></div>' +
    '</div></section>';
}

function zasadyHtml(k) {
  if (!k.zasady.length) return '';
  return '<section class="card vz-zasady"><div class="card-hlava"><span class="nadpis">' + IKONY.fajfka + '<span>Zásady kurzu</span></span></div>' +
    '<ol class="vz-zasady__mrizka">' + k.zasady.map((z, i) => '<li><b class="vz-zasady__c cisla">' + (i + 1) + '</b><span>' + esc(z) + '</span></li>').join('') + '</ol></section>';
}

function temataHtml(k) {
  if (!k.temata.length) return '<section class="card"><div class="prazdne">Témata kurzu zatím nejsou – připraví je Claude.</div></section>';
  return '<section class="vz-temata-blok" aria-label="Témata"><h2 class="vz-nadpis">Témata <small>' + pocet(k.temata.length, 'téma', 'témata', 'témat') + ' · ' +
      pocet(otazek(k), 'otázka', 'otázky', 'otázek') + '</small></h2><div class="vz-temata">' +
    k.temata.map((t, i) => {
      const z = kZopakovani(k, t);
      return '<button type="button" class="vz-tema ' + odstin(i) + '" data-vz-tema="' + i + '">' +
        '<span class="vz-tema__hlava"><span class="vz-tema__ikona">' + ikonaTematu(i) + '</span><span class="vz-tema__c cisla">' + (i + 1) + '</span></span>' +
        '<b class="vz-tema__nazev">' + esc(t.nazev) + '</b>' +
        (t.veta ? '<span class="vz-tema__veta">' + esc(t.veta) + '</span>' : '') +
        '<span class="vz-tema__pocty">' + pocet(t.myslenky.length, 'myšlenka', 'myšlenky', 'myšlenek') + ' · ' + pocet(t.otazky.length, 'otázka', 'otázky', 'otázek') +
          (z ? '<span class="vz-zopakovat">' + z + ' zopakovat</span>' : '') + '</span></button>';
    }).join('') + '</div></section>';
}

function spodekHtml(k) {
  const coDal = k.coDal.length ? '<section class="card vz-spodek__karta"><div class="card-hlava"><span class="nadpis">' + IKONY.sipka + '<span>Co dál</span></span></div><ul class="vz-seznam">' +
    k.coDal.map((x) => '<li><b>' + (https(x.odkaz) ? odkaz(x.odkaz, esc(x.nazev) + IKONY.odkaz, 'vz-odkaz') : esc(x.nazev)) + '</b>' + (x.popis ? '<span>' + esc(x.popis) + '</span>' : '') + '</li>').join('') +
    '</ul></section>' : '';
  const zdroje = k.zdroje.length ? '<section class="card vz-spodek__karta"><div class="card-hlava"><span class="nadpis">' + IKONY.odkaz + '<span>Zdroje kurzu</span></span></div>' +
    zdrojeHtml(k.zdroje) + '</section>' : '';
  return coDal || zdroje ? '<div class="vz-spodek">' + coDal + zdroje + '</div>' : '';
}

const zdrojeHtml = (z) => '<ul class="vz-seznam vz-seznam--odkazy">' + z.map((x) => '<li>' + odkaz(x.url, '<span>' + esc(x.nazev) + '</span>' + IKONY.odkaz, 'vz-odkaz') + '</li>').join('') + '</ul>';

const posledni = new WeakMap();
function nastav(el, html) {
  if (!el || posledni.get(el) === html) return;
  posledni.set(el, html);
  el.innerHTML = html;
}

export function vykresliVzdelavani(el) {
  nactiVzdelavani(false);
  if (!c.data) {
    nastav(el, '<section class="card">' + (c.chyba ? chybaHtml(c.chyba, 'data-vz-znovu') : kostra(6)) + '</section>');
    return;
  }
  const k = kurz();
  if (!k) {
    nastav(el, '<div class="prazdne prazdne--velke"><i class="kruh">' + IKONY.vzdelavani + '</i><b>Kurzy zatím nejsou</b>' +
      '<span>Kurzy přehledově připravuje Claude do CLAUDE_SCHRANKA/VZDELAVANI/kurzy.</span></div>');
    return;
  }
  const vyber = kurzy().length > 1
    ? '<div class="vz-vyber">' + segment(kurzy().map((x) => [x.id, x.nazev]), k.id, 'data-vz-kurz', 'Kurz') + '</div>' : '';
  const chybne = (c.data.chybne || []).length ? '<p class="napoveda">Claude má v datech chybu: ' + esc(c.data.chybne.join(', ')) + '</p>' : '';
  nastav(el, '<div class="vz-stranka">' + vyber + '<div class="vz-horni">' + kurzHtml(k) + zasadyHtml(k) + '</div>' + temataHtml(k) + spodekHtml(k) + chybne +
    (c.chyba ? '<p class="napoveda">Nepodařilo se obnovit · <button type="button" class="odkaz" data-vz-znovu>Zkusit znovu</button></p>' : '') + '</div>');
}

export function podnadpis() {
  const k = kurz();
  if (!k) return c.chyba && !c.data ? 'Vzdělávání se nenačetlo' : 'Trenérské kurzy přehledově';
  return (kurzy().length > 1 ? pocet(kurzy().length, 'kurz', 'kurzy', 'kurzů') + ' · ' : k.nazev + ' · ') + pocet(otazek(k), 'otázka', 'otázky', 'otázek');
}

// ---------------------------------------------------------------- okno tématu

function sekce(ikona, nazev, telo, trida) {
  return telo ? '<section class="vz-sekce' + (trida ? ' ' + trida : '') + '"><h3>' + ikona + '<span>' + nazev + '</span></h3>' + telo + '</section>' : '';
}

function tabulkaHtml(tb) {
  return '<div class="vz-tabulka">' + (tb.nazev ? '<h4>' + esc(tb.nazev) + '</h4>' : '') + '<div class="tabulka-obal"><table>' +
    (tb.sloupce.length ? '<thead><tr>' + tb.sloupce.map((s) => '<th scope="col">' + esc(s) + '</th>').join('') + '</tr></thead>' : '') +
    '<tbody>' + tb.radky.map((r) => '<tr>' + r.map((b, i) => '<' + (i === 0 ? 'th scope="row"' : 'td') + (b.length <= 12 ? ' class="vz-kratke"' : '') + '>' + esc(b) + (i === 0 ? '</th>' : '</td>')).join('') + '</tr>').join('') +
    '</tbody></table></div></div>';
}

function otazkyHtml(k, t) {
  if (!t.otazky.length) return '';
  const zop = pamet(k.id).zopakovat;
  return '<div class="vz-otazky__lista"><button type="button" class="btn btn--sm btn--ghost" data-vz-vse aria-pressed="' + c.vse + '">' +
      (c.vse ? 'Schovat odpovědi' : 'Ukázat všechny odpovědi') + '</button></div>' +
    '<ol class="vz-otazky">' + t.otazky.map((o, i) => '<li><details class="vz-otazka"' + (c.vse ? ' open' : '') + '><summary><span class="vz-otazka__c cisla">' + (i + 1) + '</span>' +
      '<span class="vz-otazka__text">' + esc(o.o) + (zop[t.id + '#' + i] ? ' <span class="vz-zopakovat">zopakovat</span>' : '') + '</span></summary>' +
      '<div class="vz-odpoved"><b>' + esc(o.a) + '</b>' + (o.proc ? '<p>' + esc(o.proc) + '</p>' : '') + '</div></details></li>').join('') + '</ol>';
}

function temaHtml() {
  const k = kurz(), t = tema();
  if (!k || !t) return '<div class="prazdne">Téma už v kurzu není.</div>';
  const levy = sekce(IKONY.info, 'Hlavní myšlenky', t.myslenky.length ? '<div class="vz-myslenky">' +
      t.myslenky.map((m) => '<div class="vz-myslenka">' + (m.nadpis ? '<b>' + esc(m.nadpis) + '</b>' : '') + (m.text ? '<p>' + esc(m.text) + '</p>' : '') + '</div>').join('') + '</div>' : '') +
    sekce(IKONY.zatez, 'Klíčová čísla', t.cisla.length ? '<div class="vz-cisla">' +
      t.cisla.map((x) => '<div class="vz-cislo"><b class="cisla">' + esc(x.hodnota) + '</b><span>' + esc(x.popis) + '</span></div>').join('') + '</div>' : '');
  // tabulky (až 6 sloupců) a otázky přes celou šířku okna pod oběma sloupci – v půlce okna by se tabulka lámala po slovech
  const tabulky = t.tabulky.length ? sekce(IKONY.tabulka, t.tabulky.length > 1 ? 'Tabulky' : 'Tabulka', '<div class="vz-tabulky">' + t.tabulky.map(tabulkaHtml).join('') + '</div>', 'vz-sekce--siroka') : '';
  const pravy = sekce(IKONY.fajfka, 'Do tréninku', t.doPraxe.length ? '<ul class="vz-fajfky">' + t.doPraxe.map((x) => '<li>' + IKONY.fajfka + '<span>' + esc(x) + '</span></li>').join('') + '</ul>' : '') +
    sekce(IKONY.pozor, 'Pozor', t.pozor.map((p) => '<div class="vz-pozor">' + IKONY.pozor + '<p>' + esc(p.text) + (p.zdroj ? '<small>Zdroj: ' + esc(p.zdroj) + '</small>' : '') + '</p></div>').join(''), 'vz-sekce--pozor') +
    sekce(IKONY.odkaz, 'Zdroje', t.zdroje.length ? zdrojeHtml(t.zdroje) : '');
  return '<div class="vz-okno ' + odstin(c.tema) + '">' + (t.veta ? '<p class="vz-okno__veta"><span class="vz-tema__ikona">' + ikonaTematu(c.tema) + '</span>' + esc(t.veta) + '</p>' : '') +
    '<div class="vz-okno__sloupce"><div class="vz-okno__sloupec">' + levy + '</div><div class="vz-okno__sloupec">' + pravy + '</div></div>' + tabulky +
    sekce(IKONY.otazka, 'Otázky na procvičení', otazkyHtml(k, t), 'vz-sekce--siroka') + '</div>';
}

function patickaTematu() {
  const k = kurz();
  if (!k) return '';
  const pred = k.temata[c.tema - 1], dal = k.temata[c.tema + 1];
  return '<div class="vz-paticka">' +
    '<button type="button" class="btn btn--ghost" data-vz-krok="-1"' + (pred ? '' : ' disabled') + ' aria-label="Předchozí téma">' + IKONY.vlevo +
      '<span class="vz-paticka__nazev">' + (pred ? esc(pred.nazev) : 'Předchozí') + '</span></button>' +
    '<span class="vz-paticka__c cisla">' + (c.tema + 1) + ' / ' + k.temata.length + '</span>' +
    '<button type="button" class="btn btn--primary" data-vz-krok="1"' + (dal ? '' : ' disabled') + ' aria-label="Další téma">' +
      '<span class="vz-paticka__nazev">' + (dal ? esc(dal.nazev) : 'Další') + '</span>' + IKONY.vpravo + '</button></div>';
}

function otevriTema(i) {
  const k = kurz();
  if (!k || !k.temata[i]) return;
  c.tema = i;
  c.vse = false;
  if (jeOtevreny(OKNO_TEMA)) { c.nahoru = true; obnovPanel(OKNO_TEMA); return; }
  otevriPanel({
    id: OKNO_TEMA, trida: 'panel-okno panel-reel vz-panel',
    titul: () => (tema() || {}).nazev || 'Téma',
    vykresli: temaHtml,
    paticka: patickaTematu,
    poVykresleni: (el) => { if (c.nahoru) { c.nahoru = false; el.querySelector('.panel-telo').scrollTop = 0; } },
    zavritMimo: true
  });
}

function krokTematu(smer) {
  const k = kurz();
  if (k && k.temata[c.tema + smer]) otevriTema(c.tema + smer);
}

// ---------------------------------------------------------------- Procvičit

function zamichej(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
  return a;
}

function novePoradi(k, rozsah, jenKlice) {
  const vse = [];
  k.temata.forEach((t, ti) => { if (rozsah === 'vse' || rozsah === t.id) t.otazky.forEach((o, i) => vse.push({ t: ti, i })); });
  const vyber = jenKlice ? vse.filter((q) => jenKlice.indexOf(k.temata[q.t].id + '#' + q.i) >= 0) : vse;
  return { rozsah, poradi: zamichej(vyber), krok: 0, ukazano: false, vedel: 0, zopakovat: [], hotovo: false };
}

function procvicHtml() {
  const k = kurz(), p = c.proc;
  if (!k || !p) return '';
  const volby = [['vse', 'Všechna témata', otazek(k)]].concat(k.temata.filter((t) => t.otazky.length).map((t) => [t.id, t.nazev, t.otazky.length]));
  const rozsah = '<div class="vz-rozsah">' + segment(volby, p.rozsah, 'data-vz-rozsah', 'Které otázky') + '</div>';
  if (!p.poradi.length) return rozsah + '<div class="prazdne">Tady nejsou žádné otázky.</div>';
  if (p.hotovo) {
    const zop = p.zopakovat.map((klic) => {
      const [tid, i] = klic.split('#');
      const ti = k.temata.findIndex((t) => t.id === tid);
      const o = ti >= 0 && k.temata[ti].otazky[Number(i)];
      return o ? '<li><span>' + esc(o.o) + '</span><button type="button" class="btn btn--sm btn--ghost" data-vz-do-tematu="' + ti + '">' + esc(k.temata[ti].nazev) + IKONY.vpravo + '</button></li>' : '';
    }).join('');
    return rozsah + '<div class="vz-souhrn"><small>Věděl jsem</small><b class="cisla">' + p.vedel + ' / ' + p.poradi.length + '</b>' +
      '<span>' + (p.zopakovat.length ? pocet(p.zopakovat.length, 'otázku', 'otázky', 'otázek') + ' zopakovat' : 'Všechno správně – výborně.') + '</span></div>' +
      (zop ? '<h3 class="vz-souhrn__nadpis">Zopakovat</h3><ul class="vz-souhrn__seznam">' + zop + '</ul>' : '');
  }
  const q = p.poradi[p.krok], t = k.temata[q.t], o = t.otazky[q.i];
  return rozsah +
    '<div class="vz-prubeh"><span>Otázka <b class="cisla">' + (p.krok + 1) + '</b> z ' + p.poradi.length + '</span><span>věděl jsem <b class="cisla">' + p.vedel + '</b></span></div>' +
    '<div class="vz-prubeh__cara"><i style="width:' + Math.round(p.krok / p.poradi.length * 100) + '%"></i></div>' +
    '<div class="vz-otazka-blok ' + odstin(q.t) + '"><span class="vz-otazka-blok__tema"><span class="vz-tema__ikona">' + ikonaTematu(q.t) + '</span>' + esc(t.nazev) + '</span>' +
      '<p class="vz-otazka-blok__text">' + esc(o.o) + '</p>' +
      (p.ukazano ? '<div class="vz-odpoved vz-odpoved--velka"><b>' + esc(o.a) + '</b>' + (o.proc ? '<p>' + esc(o.proc) + '</p>' : '') + '</div>' : '') + '</div>';
}

function patickaProcvic() {
  const p = c.proc;
  if (!p || !p.poradi.length) return '<div class="vz-paticka"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zavřít</button></div>';
  if (p.hotovo) {
    return '<div class="vz-paticka"><button type="button" class="btn btn--ghost" data-vz-znovu-proc>Znovu</button>' +
      (p.zopakovat.length ? '<button type="button" class="btn btn--primary" data-vz-jen-zopakovat>Jen ty k zopakování</button>' : '<button type="button" class="btn btn--primary" data-zavrit-panel>Hotovo</button>') + '</div>';
  }
  return '<div class="vz-paticka">' + (p.ukazano
    ? '<button type="button" class="btn btn--ghost" data-vz-znalost="0">Zopakovat</button><button type="button" class="btn btn--primary" data-vz-znalost="1">' + IKONY.fajfka + '<span>Věděl jsem</span></button>'
    : '<button type="button" class="btn btn--primary vz-paticka__jedno" data-vz-ukaz>Ukázat odpověď</button>') + '</div>';
}

function otevriProcvic(rozsah) {
  const k = kurz();
  if (!k) return;
  c.proc = novePoradi(k, rozsah || 'vse');
  if (jeOtevreny(OKNO_PROCVIC)) { obnovPanel(OKNO_PROCVIC); return; }
  otevriPanel({
    id: OKNO_PROCVIC, trida: 'panel-okno vz-panel vz-panel--procvic',
    titul: () => 'Procvičit · ' + ((kurz() || {}).nazev || ''),
    vykresli: procvicHtml,
    paticka: patickaProcvic,
    poVykresleni: (el) => { const b = el.querySelector('[data-vz-ukaz], [data-vz-znalost="1"]'); if (b && el.contains(document.activeElement) === false) b.focus({ preventScroll: true }); },
    priZavreni: () => { zmeneno(); },
    zavritMimo: true
  });
}

function odpovez(vedel) {
  const k = kurz(), p = c.proc;
  if (!k || !p || p.hotovo || !p.ukazano) return;
  const q = p.poradi[p.krok];
  const klic = k.temata[q.t].id + '#' + q.i;
  if (vedel) p.vedel++; else p.zopakovat.push(klic);
  ulozPamet(k.id, (m) => { if (vedel) delete m.zopakovat[klic]; else m.zopakovat[klic] = 1; });
  p.krok++;
  p.ukazano = false;
  if (p.krok >= p.poradi.length) {
    p.hotovo = true;
    ulozPamet(k.id, (m) => { m.posledni = { kdy: Date.now(), vedel: p.vedel, celkem: p.poradi.length, rozsah: p.rozsah }; });
  }
  obnovPanel(OKNO_PROCVIC);
}

// ---------------------------------------------------------------- události

document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('[data-vz-kurz], [data-vz-tema], [data-vz-procvicit], [data-vz-znovu], [data-vz-krok], [data-vz-vse], ' +
    '[data-vz-rozsah], [data-vz-ukaz], [data-vz-znalost], [data-vz-znovu-proc], [data-vz-jen-zopakovat], [data-vz-do-tematu]');
  if (!el || !el.closest('#p-vzdelavani, [data-panel^="vz-"]')) return;
  const d = el.dataset;
  if (d.vzKurz) { c.kurz = d.vzKurz; uloziste.pis(VOLBY, { kurz: c.kurz }); zmeneno(); return; }
  if (d.vzTema != null) { otevriTema(Number(d.vzTema)); return; }
  if (el.hasAttribute('data-vz-procvicit')) { otevriProcvic('vse'); return; }
  if (el.hasAttribute('data-vz-znovu')) { c.chyba = null; nactiVzdelavani(true); zmeneno(); return; }
  if (d.vzKrok) { krokTematu(Number(d.vzKrok)); return; }
  if (el.hasAttribute('data-vz-vse')) {
    c.vse = !c.vse;
    const okno = elementPanelu(OKNO_TEMA);
    if (okno) {
      okno.querySelectorAll('details.vz-otazka').forEach((x) => { x.open = c.vse; });
      el.setAttribute('aria-pressed', String(c.vse));
      el.textContent = c.vse ? 'Schovat odpovědi' : 'Ukázat všechny odpovědi';
    }
    return;
  }
  if (d.vzRozsah) { otevriProcvic(d.vzRozsah); return; }
  if (el.hasAttribute('data-vz-ukaz')) { if (c.proc) { c.proc.ukazano = true; obnovPanel(OKNO_PROCVIC); } return; }
  if (d.vzZnalost) { odpovez(d.vzZnalost === '1'); return; }
  if (el.hasAttribute('data-vz-znovu-proc')) { otevriProcvic(c.proc ? c.proc.rozsah : 'vse'); return; }
  if (el.hasAttribute('data-vz-jen-zopakovat')) {
    const k = kurz();
    if (k && c.proc) { c.proc = novePoradi(k, c.proc.rozsah, c.proc.zopakovat.slice()); obnovPanel(OKNO_PROCVIC); }
    return;
  }
  if (d.vzDoTematu != null) { const i = Number(d.vzDoTematu); zavriAPak(() => otevriTema(i)); }
});

// šipky v okně tématu = předchozí / další téma
document.addEventListener('keydown', (e) => {
  const p = horniPanel();
  if (!p || e.altKey || e.ctrlKey || e.metaKey || (e.target.matches && e.target.matches('input, textarea, select'))) return;
  if (p.id === OKNO_TEMA && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); krokTematu(e.key === 'ArrowLeft' ? -1 : 1); }
});
