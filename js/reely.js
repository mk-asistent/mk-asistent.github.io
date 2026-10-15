// Reely: hotové reely z fotbalu (domácí PC → Disk → motor) a příběhy na Instagram. Michal 15. 10.: „na reelech bych to chtěl
// mít lépe uspořádáno a mít tam možnost opravit ten popisek … primárně tam mít jen to, co čeká na Instagram … vše pak
// překliknout, až když budu chtít“ a „seznam reelů víc vlevo a Instagram vpravo jako okno vedle“ →
// - výchozí pohled Nevydané (naplánované podle času vydání nahoře, pod nimi čekající od nejnovějšího), přepínač
//   Nevydané · Zveřejněné · Vše a týmy; volba se pamatuje v zařízení;
// - na PC vlevo seznam (malé karty v mřížce), vpravo detail vybraného: náhled videa (otevře ho Disk – jen Michalův účet),
//   popisek k úpravě (uloží se 700 ms po psaní, motor reelPopisekUlozit → REELY/upravy.json; „Vrátit původní“), 2 návrhy
//   od Clauda na výběr (Návrh 1 / Návrh 2 → Použít; Nové návrhy od Clauda), Instagram: kam (reel, reel + příběh, jen
//   příběh), zmínky / označení, čas, průběh (js/ig.js) a Zveřejnit teď / Naplánovat / Uložit změny / Zrušit plán.
//   Na telefonu a iPadu na výšku klepnutí na kartu otevře tentýž detail přes celou obrazovku (tlačítka v patičce);
// - příběhy z fotek z telefonu (js/pribehy.js) jsou ve stejném seznamu; na Přehledu limetková karta „Reel k vyvěšení“.

import { stav, zmeneno, umiMotor, hooky, prejdi } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, DNY_KR, rozdilDni, zacatekTydne, pridejDny, terminDatum, isoDatum, tvar, kdyKratce, otevriOdkaz } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, kostra, chybaHtml, segment, potvrd, doSchranky } from './ui.js';
import { pripoj as pripojNabidku } from './nabidka.js';
import { otevriPanel, zavriPanel, elementPanelu, jeOtevreny, horniPanel } from './panely.js';
import * as ig from './ig.js';
import { uctyKOznaceni, casKratce } from './ig_prubeh.js';
import * as pribehy from './pribehy.js';
import { navrhyHtml } from './ig_navrhy.js';

const ULOZISTE = 'asistent.data.reely';
const VYBER = 'asistent.reely.vyber'; // { stav: nevydane | zverejnene | vse, tym } – volba pohledu v zařízení
const CERSTVY_DNI = 7;                // na Dnes jen reel ze zápasu za poslední týden
const POPISEK_MAX = 2200;             // Instagram vezme popisek nejvýš 2 200 znaků
const ULOZIT_PO = 700;                // ms po posledním písmenu (jako popisek plakátu)
const PRIBEH_VIDEO_S = 60;            // video v příběhu nejvýš 60 s (motor IG_PRIBEH_VIDEO_S)
const STAVY = ['nevydane', 'zverejnene', 'vse'];
const SIROKE = window.matchMedia('(min-width: 1000px)'); // seznam a detail vedle sebe (jako Pošta)
SIROKE.addEventListener('change', () => zmeneno());

function nactiVyber() {
  const v = uloziste.cti(VYBER);
  return v && typeof v === 'object' ? { stav: STAVY.indexOf(v.stav) >= 0 ? v.stav : 'nevydane', tym: String(v.tym || '') } : { stav: 'nevydane', tym: '' };
}
let vyber = nactiVyber();
let vybrany = '';               // id vybraného reelu nebo příběhu (detail vpravo / v okně)
let f = null;                   // formulář Instagramu vybraného reelu: { id, kdy, kam, oznacit, ukladam, chyba }
let ed = null;                  // popisek vybraného reelu: { id, text, zmena, casovac, uklada, ulozeno, chyba }
let fronta = Promise.resolve(); // ukládání popisků po sobě
const volbaNavrhu = {};         // id → 0 | 1 (Návrh 1 / Návrh 2)

export function nactiZUloziste() {
  const v = uloziste.cti(ULOZISTE);
  if (v && v.data) stav.reely = v.data;
}
const ulozDoZarizeni = () => { if (stav.reely) uloziste.pis(ULOZISTE, { data: stav.reely, kdy: Date.now() }); };

export function nactiReely(znovu) {
  if (!umiMotor('reely') || stav.nacita.reely) return Promise.resolve();
  stav.nacita.reely = true;
  stav.chyby.reely = null;
  return volej('reely', znovu ? { znovu: true } : {})
    .then((data) => { stav.reely = data; ulozDoZarizeni(); })
    .catch((e) => { stav.chyby.reely = e; })
    .then(() => { stav.nacita.reely = false; zmeneno(); });
}

export function dotahni() {
  ig.hlidej(); // průběh zveřejňování na Instagram: přímé čtení z motoru, když něco běží nebo brzy vyjde (volá se při každém překreslení)
  if (umiMotor('reely') && !stav.reely && !stav.nacita.reely && !stav.chyby.reely) nactiReely();
  hlidejNavrhy();
}

/** Čeká se na návrhy popisku od Clauda: na stránce Reely jednou za 3 minuty přímo z motoru (kopie serveru je až po 30 min). */
let hlidacNavrhu = 0;
function hlidejNavrhy() {
  if (hlidacNavrhu || stav.pohled !== 'reely' || !seznam().some((r) => r.cekaNaClauda)) return;
  hlidacNavrhu = setTimeout(() => {
    hlidacNavrhu = 0;
    if (stav.pohled === 'reely' && document.visibilityState === 'visible') nactiReely(true);
  }, 180e3);
}

function seznam() { return (stav.reely && stav.reely.reely) || []; }
function zverejneno(r) { return !!(stav.reely && stav.reely.zverejneno && stav.reely.zverejneno[r.id]); }
function plan(r) { return (stav.reely && stav.reely.plan && stav.reely.plan[r.id]) || null; }
const naplanovano = (r) => { const p = plan(r); return !!(p && ['ceka', 'nahrava', 'zverejnuji'].indexOf(p.stav) >= 0); };
const instagram = () => (stav.reely && stav.reely.instagram) || { nastaveno: false };
const ucetIg = () => (instagram().ucet ? '@' + instagram().ucet : 'klubový Instagram');
/** Popisek, který půjde na Instagram: popisek plánu (z okna plánu), jinak s Michalovou úpravou (motor ho posílá v r.popisek). */
const popisekReelu = (r) => (stav.reely && stav.reely.popiskyPlanu && stav.reely.popiskyPlanu[r.id]) || r.popisek || '';
/** Popisek v detailu: rozepsaný (ještě neuložený) má přednost. */
const aktualniPopisek = (r) => (ed && ed.id === r.id && (ed.zmena || ed.uklada) ? ed.text : popisekReelu(r));
const upraveny = (r) => !!r.upraveno || popisekReelu(r) !== (r.popisek || '');
// u dorostu označit i účet dorostu (Michal 5. 10.); co Michal u týmu napíše jinak, si aplikace zapamatuje
const VYCHOZI_OZNACENI = { dorost: '@dorost_agro' };
const kdyPlan = (t) => DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + ' ' + new Date(t).getHours() + ':' + String(new Date(t).getMinutes()).padStart(2, '0');
const datumReelu = (r) => terminDatum(r.datum) || Date.parse(r.vyrobeno) || 0;
const najdi = (id) => seznam().find((r) => r.id === id);
const delkaText = (s) => { s = Math.round(s || 0); return s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; };
const jePribeh = (id) => /^pribeh_/.test(String(id || ''));

// průběh zveřejňování (js/ig.js): plán reelů z motoru → sem (a do zařízení), i s „zveřejněno“ a upravenými popisky
ig.zdroj('reel', {
  klic: 'reely', oblast: 'reely', video: true, cil: 'reely',
  plan: () => (stav.reely && stav.reely.plan) || null,
  nastav: (planReelu, d) => {
    if (!stav.reely) return false;
    stav.reely.plan = planReelu;
    if (d.zverejneno && typeof d.zverejneno === 'object') stav.reely.zverejneno = d.zverejneno;
    if (d.popiskyPlanu && typeof d.popiskyPlanu === 'object') stav.reely.popiskyPlanu = d.popiskyPlanu;
    ulozDoZarizeni();
    return true;
  },
  nazev: (id) => { const r = najdi(id); return r ? r.nazev : 'Reel'; },
  ucet: ucetIg
});

/** Kde reel je: 'chyba' | 'bezi' (zveřejňuje se) | 'plan' (naplánovaný) | 'ceka' (čeká na Instagram) | 'venku' (vydaný). */
function kategorie(r) {
  const p = plan(r);
  if (p && (p.stav === 'nahrava' || p.stav === 'zverejnuji')) return 'bezi';
  if (p && p.stav === 'ceka') return 'plan';
  if (zverejneno(r)) return 'venku';
  if (p && p.stav === 'chyba') return 'chyba';
  return 'ceka';
}

/** Nezveřejněné reely ze zápasů za poslední týden (nejnovější první) – Dnes a odznak v panelu. */
export function kVyveseni() {
  return seznam().filter((r) => !zverejneno(r) && !naplanovano(r) && (r.popisek || r.video) && rozdilDni(datumReelu(r)) >= -CERSTVY_DNI);
}

export function podnadpis() {
  if (!stav.reely) return stav.chyby.reely ? 'Reely se nenačetly' : 'Načítám…';
  const n = seznam().length;
  const k = seznam().filter((r) => kategorie(r) === 'ceka' || kategorie(r) === 'chyba').length;
  const pl = seznam().filter((r) => kategorie(r) === 'plan' || kategorie(r) === 'bezi').length +
    pribehy.seznam().filter((x) => ['plan', 'bezi'].indexOf(pribehy.kategorie(x)) >= 0).length;
  return n ? n + ' ' + tvar(n, 'reel', 'reely', 'reelů') + (k ? ' · ' + k + ' ' + tvar(k, 'čeká', 'čekají', 'čeká') + ' na Instagram' : pl ? '' : ' · všechny zveřejněné') +
    (pl ? ' · ' + pl + ' ' + tvar(pl, 'naplánovaný', 'naplánované', 'naplánovaných') : '') +
    (stav.reely.aktualizovano ? ' · z PC ' + esc(kdyKratce(Date.parse(stav.reely.aktualizovano))) : '') : 'Hotové reely z domácího PC';
}

function nazevTymu(klic) {
  const t = ((stav.fotbal && stav.fotbal.data && stav.fotbal.data.tymy) || []).find((x) => x.klic === klic);
  return t ? t.nazev : { A: 'A-tým', B: 'B-tým', dorost: 'Dorost' }[klic] || klic;
}

/** Náhled 9:16 s tlačítkem přehrát (odkaz na video na Disku), nebo stav, proč video ještě není. */
function nahledHtml(r) {
  const obr = r.nahled ? '<img src="' + esc(r.nahled) + '" alt="">' : '<span class="reel__prazdny">' + IKONY.reely + '</span>';
  const cas = r.delka ? '<span class="reel__delka cisla">' + delkaText(r.delka) + '</span>' : '';
  if (r.odkaz) {
    return '<a class="reel__nahled" href="' + esc(r.odkaz) + '" target="_blank" rel="noopener noreferrer" aria-label="Přehrát video na Disku Google">' +
      obr + '<span class="reel__play">' + IKONY.prehrat + '</span>' + cas + '</a>';
  }
  return '<span class="reel__nahled">' + obr + '<span class="reel__ceka">' + (r.video ? 'nahrává se na Disk' : 'video se dělá') + '</span>' + cas + '</span>';
}

function kopirovatHtml(r, trida) {
  return popisekReelu(r) ? '<button type="button" class="btn ' + (trida || 'btn--ghost') + '" data-reel-kopirovat="' + esc(r.id) + '">' + IKONY.kopirovat +
    '<span>Kopírovat popisek</span></button>' : '';
}

/** Stav reelu jako štítek: naplánováno na čas, zveřejňuje se, nepovedlo se, čeká, venku (i „příběh vyšel …“). */
function stitekHtml(r, kratce) {
  const p = plan(r);
  const kartaIg = p ? ig.stavKartaAtr('reel', r.id) : ''; // najetí / klepnutí = kroky s časy
  const ucty = !kratce && p && p.oznacit && p.oznacit.length ? '<span class="tag tag--seda">' + (p.jenPribeh ? 'zmíní ' : 'označí ') + esc(p.oznacit.map((u) => '@' + u).join(', ')) + '</span>' : '';
  if (p && p.stav === 'ceka') {
    return '<span class="tag tag--plan"' + kartaIg + '>' + IKONY.kalendar + (p.jenPribeh ? 'příběh ' : '') + (p.kdy > Date.now() ? 'vyjde ' : 'na řadě od ') +
      esc(kdyPlan(p.kdy)) + (p.pribeh && !p.jenPribeh ? ' + příběh' : '') + '</span>' + ucty;
  }
  if (p && (p.stav === 'nahrava' || p.stav === 'zverejnuji')) return '<span class="tag tag--plan"' + kartaIg + '>' + IKONY.obnovit + 'zveřejňuje se</span>';
  if (zverejneno(r)) {
    if (p && p.stav === 'hotovo' && p.jenPribeh) {
      return '<span class="tag tag--ok"' + kartaIg + '>' + IKONY.fajfka + 'příběh vyšel ' + esc(casKratce(Number(p.zverejneno) || p.kdy, Date.now())) + '</span>' +
        (p.zminkyChyba && !kratce ? '<span class="tag tag--warn">bez zmínek</span>' : '');
    }
    return '<span class="tag tag--ok"' + (p ? kartaIg : '') + '>' + IKONY.fajfka + 'na Instagramu od ' + esc(dm(terminDatum(stav.reely.zverejneno[r.id]))) + '</span>' +
      (p && p.stav === 'hotovo' && p.mediaPribeh && !kratce ? '<span class="tag tag--ok">i v příběhu</span>' : '');
  }
  if (p && p.stav === 'chyba') return '<span class="tag tag--danger"' + kartaIg + '>nepovedlo se</span>';
  return '<span class="tag tag--danger">čeká na Instagram</span>';
}

/** Průběh zveřejňování (kroky s časy, zaseknutí, Zkusit znovu – js/ig.js); starší motor bez průběhu: jen chyba jako dřív. */
function prubehHtml(r) {
  const p = plan(r);
  const h = p ? ig.prubehHtml('reel', r.id, p) : '';
  if (h) return h;
  return (p && p.stav === 'chyba' ? '<p class="reel__chyba">Na Instagram se nepodařilo: ' + esc(p.chyba || '') + '</p>' : '') +
    (p && p.stav === 'hotovo' && p.pribehChyba ? '<p class="reel__chyba">Reel vyšel, příběh ne: ' + esc(p.pribehChyba) + '</p>' : '');
}

/** Jde reel poslat na Instagram (nový plán): propojený Instagram, video na Disku, popisek (nebo jen příběh), nezveřejněný –
 *  reel, který vyšel jen v příběhu, jde poslat i jako reel. */
function lzePlanovat(r) {
  const p = plan(r);
  if (!instagram().nastaveno || !r.odkaz || !umiMotor('reelNaplanovat')) return false;
  if (p && (p.stav === 'nahrava' || p.stav === 'zverejnuji')) return false;
  const jenPribehVenku = p && p.stav === 'hotovo' && p.jenPribeh && umiMotor('igJenPribeh');
  if (zverejneno(r) && !jenPribehVenku) return false;
  return !!popisekReelu(r) || umiMotor('igJenPribeh');
}

// ---------------------------------------------------------------- seznam: malé karty (vlevo / na telefonu celý seznam)

function kartaHtml(r) {
  const t = datumReelu(r);
  const meta = [DNY_KR[new Date(t).getDay()] + ' ' + dm(t), (r.zapasy[0] || {}).soutez].filter(Boolean);
  const obr = r.nahled ? '<img src="' + esc(r.nahled) + '" alt="">' : '<span class="reel__prazdny">' + IKONY.reely + '</span>';
  const vyb = vybrany === r.id && SIROKE.matches;
  return '<li class="reel reel--' + kategorie(r) + (vyb ? ' reel--vybrany' : '') + '" data-reel="' + esc(r.id) + '">' +
    '<button type="button" class="reel__vyber" data-reel-vyber="' + esc(r.id) + '"' + (vyb ? ' aria-current="true"' : '') + '>' +
      '<span class="reel__nahled">' + obr + (r.delka ? '<span class="reel__delka cisla">' + delkaText(r.delka) + '</span>' : '') + '</span>' +
      '<span class="reel__souhrn"><span class="reel__stitky">' + r.tymy.map((k) => '<span class="tag tag--seda">' + esc(nazevTymu(k)) + '</span>').join('') +
        stitekHtml(r, true) + '</span>' +
        '<b class="reel__nazev">' + esc(r.nazev) + '</b>' +
        '<small class="reel__meta">' + esc(meta.join(' · ')) + (upraveny(r) ? ' · upravený popisek' : '') + (r.cekaNaClauda ? ' · Claude píše návrhy' : '') + '</small></span>' +
    '</button></li>';
}

// ---------------------------------------------------------------- detail vybraného reelu (vpravo na PC, okno na telefonu)

/** Formulář Instagramu pro reel: z plánu (čeká na čas) nebo výchozí (zítra / dnes 18:00, poslední volba „kam“, účty týmu). */
function formular(r) {
  if (f && f.id === r.id) return f;
  const p = plan(r);
  const ceka = !!(p && p.stav === 'ceka');
  f = { id: r.id, kdy: ceka ? doPole(p.kdy) : vychoziCas(), kam: vychoziKam(r), ukladam: false, chyba: '',
    oznacit: ceka && p.oznacit ? p.oznacit.map((u) => '@' + u).join(', ') : oznaceniTymu(r) };
  if (!popisekReelu(r) && umiMotor('igJenPribeh') && !ceka) f.kam = 'pribeh'; // bez popisku jde jen příběh
  return f;
}

const doPole = (t) => isoDatum(t) + 'T' + String(new Date(t).getHours()).padStart(2, '0') + ':' + String(new Date(t).getMinutes()).padStart(2, '0');

/** Výchozí čas: nejbližší 18:00 (večer mají reely klubu nejvíc přehrání). */
function vychoziCas() {
  const d = new Date();
  if (d.getHours() >= 17) d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return doPole(d.getTime());
}

function oznaceniTymu(r) {
  const ulozene = uloziste.cti('asistent.ig.oznacit') || {};
  const k = r.tymy[0] || '';
  return k in ulozene ? ulozene[k] : VYCHOZI_OZNACENI[k] || '';
}

/** Kam: 'reel' | 'oba' (reel + příběh) | 'pribeh' (jen příběh) – u naplánovaného jeho volba, jinak poslední v zařízení. */
function vychoziKam(r) {
  const p = plan(r);
  if (p && p.stav === 'ceka') return p.jenPribeh ? 'pribeh' : p.pribeh ? 'oba' : 'reel';
  const k = uloziste.cti('asistent.ig.kamReel');
  if (k === 'reel' || k === 'oba' || (k === 'pribeh' && umiMotor('igJenPribeh'))) return k;
  // Michal 9. 10.: „u reelů to přidání rovnou do příběhu“ – výchozí reel + příběh
  return uloziste.cti('asistent.ig.pribeh') === false ? 'reel' : 'oba';
}

const pocetZnaku = (text) => String(text || '').length.toLocaleString('cs-CZ') + ' / 2 200';

function stavUlozeni(e) {
  if (!e) return '';
  if (e.uklada) return 'Ukládám…';
  if (e.chyba) return 'Neuložilo se: ' + e.chyba;
  if (e.ulozeno) return 'Uloženo';
  return 'Ukládá se samo při psaní';
}

/** Popisek v detailu: pole k úpravě (štítek „upraveno“, počítadlo, Vrátit původní), 2 návrhy od Clauda na výběr. */
function popisekHtml(r) {
  const id = esc(r.id);
  const text = aktualniPopisek(r);
  if (!umiMotor('reelPopisekUlozit')) {
    return '<section class="reel-detail__cast"><div class="reel__popisek-hlava"><span class="label">Popisek</span>' +
      (upraveny(r) ? '<span class="tag tag--warn">upravený pro Instagram</span>' : '') + '</div>' +
      (text ? '<div class="reel__popisek">' + esc(text) + '</div>' : '<p class="reel__bez">Popisek zatím není – připíše ho Claude při výrobě reelu.</p>') + '</section>';
  }
  const navrhy = (r.navrhy && r.navrhy.varianty) || [];
  return '<section class="reel-detail__cast reel__popisek-box" data-reel-popisek-box="' + id + '">' +
    '<div class="reel__popisek-hlava"><span class="label">Popisek</span><span data-reel-stitek>' +
      (upraveny(r) || (ed && ed.id === r.id && ed.zmena) ? '<span class="tag tag--warn">upraveno</span>' : '') + '</span>' +
      '<span class="reel__znaky cisla' + (text.length > POPISEK_MAX ? ' reel__znaky--moc' : '') + '" data-reel-znaky>' + pocetZnaku(text) + '</span></div>' +
    navrhyHtml({ varianty: navrhy, volba: volbaNavrhu[r.id] || 0, atribut: 'data-reel-navrh', id: r.id, ceka: !!r.cekaNaClauda, lzeZadat: umiMotor('reelPopisekNavrhy') }) +
    // <textarea> zahodí první odřádkování obsahu – když text začíná prázdným řádkem, přidat jedno navíc
    '<textarea class="odpoved reel__pole" data-reel-popisek="' + id + '" data-pole="popisek" rows="9" aria-label="Popisek reelu na Instagram" ' +
      'placeholder="Popisek k reelu – napiš ho, nebo vyber návrh od Clauda.">' + esc(/^\r?\n/.test(text) ? '\n' + text : text) + '</textarea>' +
    '<div class="reel__popisek-pata"><small class="reel__ulozeni" data-reel-ulozeni>' + esc(ed && ed.id === r.id ? stavUlozeni(ed) : r.upraveno ? 'Tvoje úprava – popisek z PC zůstává' : 'Ukládá se samo při psaní') + '</small>' +
      (r.upraveno ? '<button type="button" class="btn btn--ghost btn--sm" data-reel-vratit="' + id + '">' + IKONY.obnovit + '<span>Vrátit původní</span></button>' : '') + '</div>' +
    (r.upraveno && r.puvodniZmeneny ? '<p class="napoveda reel__zmena-pc">Popisek na PC se od tvé úpravy změnil – Vrátit původní ukáže nový.</p>' : '') + '</section>';
}

/** Instagram v detailu: kam, účty, čas a chyba (tlačítka jsou v akceDetailu – na telefonu v patičce okna). */
function instagramHtml(r) {
  const p = plan(r);
  if (!lzePlanovat(r) || (p && (p.stav === 'nahrava' || p.stav === 'zverejnuji'))) {
    if (!instagram().nastaveno && umiMotor('reelNaplanovat') && !zverejneno(r)) {
      return '<p class="napoveda">Instagram není v motoru propojený (IG_TOKEN) – popisek zkopíruj a video vlož do Instagramu ručně.</p>';
    }
    return '';
  }
  const fm = formular(r);
  const jen = fm.kam === 'pribeh';
  const kam = umiMotor('igJenPribeh') ? '<div class="rp-kdy"><span class="label">Kam</span>' +
    segment([['reel', 'Reel'], ['oba', 'Reel + příběh'], ['pribeh', 'Jen příběh']], fm.kam, 'data-rd-kam', 'Kam zveřejnit') + '</div>'
    : '<label class="prepinac-radek"><span><b>I do příběhu</b><small>stejné video rovnou i do příběhu (story)</small></span>' +
      '<span class="prepinac"><input type="checkbox" data-rd-pribeh' + (fm.kam === 'oba' ? ' checked' : '') + '><span></span></span></label>';
  const dlouhe = r.delka > PRIBEH_VIDEO_S + 0.5 && fm.kam !== 'reel'
    ? '<p class="pruh pruh-varovani">Video má ' + delkaText(r.delka) + ' – do příběhu jde nejvýš ' + PRIBEH_VIDEO_S + ' s. ' +
      (jen ? 'Instagram by ho nevzal, zveřejni ho jako reel.' : 'Reel vyjde, příběh nejspíš ne.') + '</p>' : '';
  return '<section class="reel-detail__cast reel-ig"><div class="reel-ig__hlava"><span class="label">' + IKONY.instagram + 'Instagram ' + esc(ucetIg()) + '</span>' +
      (p && p.stav === 'ceka' ? '<span class="tag tag--plan">naplánováno</span>' : '') + '</div>' +
    kam + dlouhe +
    '<label><span class="label">' + (jen ? 'Zmínit účty v příběhu' : 'Označit účty') + '</span><input class="field" data-rd="oznacit" data-pole="oznacit" value="' + esc(fm.oznacit) + '" ' +
      'placeholder="např. @dorost_agro" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<label><span class="label">' + (p && p.stav === 'ceka' ? 'Vyjde' : 'Naplánovat na') + '</span><input class="field" type="datetime-local" data-rd="kdy" data-pole="kdy" value="' + esc(fm.kdy) + '"></label>' +
    '<p class="napoveda">' + (jen ? 'Jen příběh – bez příspěvku a bez popisku, po 24 h zmizí.' : fm.kam === 'oba' ? 'Reel s popiskem a stejné video i do příběhu.' : 'Reel s popiskem.') +
      ' Účty bez @ nebo s ním, oddělené čárkou (nejvýš 20) – ' + (jen ? 'v příběhu se zmíní' : 'na reelu se označí' + (fm.kam === 'oba' ? ', v příběhu zmíní' : '')) +
      '. Jen veřejné účty, které znáš.</p>' +
    '<p class="pruh pruh-varovani" data-rd-chyba' + (fm.chyba ? '' : ' hidden') + '>' + esc(fm.chyba) + '</p></section>';
}

/** Tlačítka Instagramu: Zveřejnit teď a Naplánovat; u naplánovaného Zveřejnit teď, Uložit změny, Zrušit plán; u vydaného odkaz. */
function akceDetailu(r) {
  const p = plan(r);
  let h = '';
  if (p && p.stav === 'hotovo' && /^https:\/\//.test(p.odkaz || '')) {
    h += '<a class="btn btn--ghost" href="' + esc(p.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.odkaz + '<span>Na Instagramu</span></a>';
  }
  if (!lzePlanovat(r)) return h;
  const fm = formular(r);
  const id = esc(r.id);
  if (p && p.stav === 'ceka') {
    return ig.tlacitkoTedHtml('reel', r.id, 'btn--plan') +
      '<button type="button" class="btn btn--ghost" data-rd-ulozit="' + id + '"' + (fm.ukladam ? ' disabled' : '') + '>' + IKONY.kalendar + '<span>' + (fm.ukladam ? 'Ukládám…' : 'Uložit změny') + '</span></button>' +
      '<button type="button" class="btn btn--ghost" data-reel-zrusit-plan="' + id + '">' + IKONY.zavrit + '<span>Zrušit plán</span></button>';
  }
  const jakoReel = p && p.stav === 'hotovo' && p.jenPribeh; // vyšel jen příběh → i jako reel
  return h + (umiMotor('igKrok') ? '<button type="button" class="btn btn--plan" data-rd-ted="' + id + '"' + (fm.ukladam ? ' disabled' : '') + '>' + IKONY.odeslat +
      '<span>' + (fm.ukladam === 'ted' ? 'Posílám…' : jakoReel ? 'Teď i jako reel' : 'Zveřejnit teď') + '</span></button>' : '') +
    '<button type="button" class="btn ' + (umiMotor('igKrok') ? 'btn--ghost' : 'btn--plan') + '" data-rd-ulozit="' + id + '"' + (fm.ukladam ? ' disabled' : '') + '>' + IKONY.kalendar +
      '<span>' + (fm.ukladam === 'plan' ? 'Ukládám…' : 'Naplánovat') + '</span></button>';
}

/** Vedlejší akce: Kopírovat popisek (ruční vložení do Instagramu), Video, Zveřejněno (ručně venku / zpět). */
function vedlejsiAkceHtml(r) {
  const z = zverejneno(r);
  return '<div class="reel__akce reel__akce--vedlejsi">' + kopirovatHtml(r, 'btn--ghost btn--sm') +
    (r.odkaz ? '<a class="btn btn--ghost btn--sm" href="' + esc(r.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.prehrat + '<span>Video</span></a>' : '') +
    '<button type="button" class="btn btn--ghost btn--sm reel__prepinac" data-reel-zverejneno="' + esc(r.id) + '" aria-pressed="' + z + '">' + IKONY.fajfka +
      '<span>' + (z ? 'Zveřejněno' : 'Už je venku') + '</span></button></div>';
}

/** Detail reelu: { telo, akce } – na PC vpravo vedle seznamu (akce pod Instagramem), na telefonu v okně (akce v patičce). */
function detailReelu(r) {
  const t = datumReelu(r);
  const meta = [DNY_KR[new Date(t).getDay()] + ' ' + dm(t), (r.zapasy[0] || {}).soutez, r.varianta, r.delka ? delkaText(r.delka) : '',
    r.velikost ? Math.round(r.velikost) + ' MB' : ''].filter(Boolean);
  const telo = '<div class="reel-detail" data-reel-detail="' + esc(r.id) + '">' +
    '<div class="reel-detail__hlava">' + nahledHtml(r) +
      '<div class="reel-detail__titul"><div class="reel__stitky">' + r.tymy.map((k) => '<span class="tag tag--seda">' + esc(nazevTymu(k)) + '</span>').join('') +
        stitekHtml(r) + '</div><h2 class="reel__nazev">' + esc(r.nazev) + '</h2><small class="reel__meta">' + esc(meta.join(' · ')) + '</small></div></div>' +
    prubehHtml(r) + popisekHtml(r) + instagramHtml(r) + vedlejsiAkceHtml(r) + '</div>';
  return { telo, akce: akceDetailu(r), nazev: r.nazev };
}

function detailPolozky(id) {
  if (jePribeh(id)) { const x = pribehy.seznam().find((p) => p.id === id); return x ? pribehy.detailHtml(x) : null; }
  const r = najdi(id);
  return r ? detailReelu(r) : null;
}

/** Vybrat reel / příběh: na PC detail vpravo, na telefonu okno přes celou obrazovku. */
export function otevriDetail(id) {
  if (!id) return;
  if (vybrany !== id) {
    if (ed && ed.id !== id) ulozPopisek();
    vybrany = id;
    f = null;
    if (!ed || ed.id !== id) ed = null;
  }
  if (stav.pohled !== 'reely') prejdi('reely');
  if (!SIROKE.matches) {
    const d = detailPolozky(id);
    if (!d) return;
    otevriPanel({
      id: 'reel-detail', trida: 'panel-okno panel-formular panel-reel', titul: () => { const x = detailPolozky(vybrany); return x ? x.nazev : 'Reel'; },
      vykresli: () => { const x = detailPolozky(vybrany); return x ? x.telo : ''; },
      paticka: () => { const x = detailPolozky(vybrany); return '<div class="akce akce--reel">' + (x ? x.akce : '') + '</div>'; },
      poOtevreni: (el) => el.focus({ preventScroll: true })
    });
  }
  zmeneno();
}

/** Okno detailu na telefonu: překreslit obsah bez ztráty rozepsaného pole (obnovPanel by přepsal i pole a zavřel klávesnici). */
let posledniPanel = '';
function obnovDetailVOkne() {
  if (!jeOtevreny('reel-detail')) return;
  const el = elementPanelu('reel-detail');
  const d = detailPolozky(vybrany);
  if (!d) { const h = horniPanel(); if (h && h.id === 'reel-detail') zavriPanel(); return; } // reel z exportu vypadl, příběh odebraný
  if (!el) return;
  const telo = el.querySelector('.panel-telo'), pata = el.querySelector('.panel-paticka');
  const klic = d.telo + '|' + d.akce;
  if (klic === posledniPanel) return;
  posledniPanel = klic;
  if (telo) prepisSPolem(telo, d.telo);
  const akce = '<div class="akce akce--reel">' + d.akce + '</div>';
  if (pata && pata.innerHTML !== akce) pata.innerHTML = akce;
}

// ---------------------------------------------------------------- Instagram z detailu (reelNaplanovat)

function ukazChybuFormulare(text) {
  if (f) f.chyba = text;
  document.querySelectorAll('[data-rd-chyba]').forEach((ch) => { ch.textContent = text; ch.hidden = !text; });
}

/** Zveřejnit teď (s potvrzením) nebo Naplánovat / Uložit změny z formuláře v detailu. */
async function odesliPlan(r, hned) {
  const fm = formular(r);
  if (fm.ukladam) return;
  const jen = fm.kam === 'pribeh';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fm.kdy || '');
  if (!hned && !m) { ukazChybuFormulare('Vyber datum a čas.'); return; }
  const kdyPlanu = hned ? Date.now() : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  if (!hned && kdyPlanu < Date.now() - 60e3) { ukazChybuFormulare('Ten čas už byl – vyber pozdější.'); return; }
  const popisek = String(aktualniPopisek(r) || '').replace(/\r\n/g, '\n');
  if (!jen && !popisek.trim()) { ukazChybuFormulare('Popisek je prázdný – napiš ho, nebo vyber návrh od Clauda.'); return; }
  if (!jen && popisek.trim().length > POPISEK_MAX) { ukazChybuFormulare('Popisek je delší než 2 200 znaků – Instagram ho nevezme.'); return; }
  const u = uctyKOznaceni(fm.oznacit);
  if (u.chyba) { ukazChybuFormulare(u.chyba); return; }
  const co = jen ? 'jen příběh' : fm.kam === 'oba' ? 'reel i příběh' : 'reel';
  if (hned) {
    const ano = await potvrd('Zveřejnit hned?', { ikona: IKONY.instagram, ton: 'ok', text: r.nazev + ' – ' + co + ' na ' + ucetIg() + ' teď' +
      (u.ucty.length ? (jen ? ', zmíní ' : ', označí ') + u.ucty.map((x) => '@' + x).join(', ') : '') + '.', ano: 'Zveřejnit teď', ne: 'Počkat' });
    if (!ano) return;
  }
  ukazChybuFormulare('');
  fm.ukladam = hned ? 'ted' : 'plan';
  zmeneno();
  try {
    if (ed && ed.id === r.id && ed.zmena) await ulozPopisek(); // rozepsaný popisek nejdřív uložit
    const v = await volej('reelNaplanovat', Object.assign({ id: r.id, kdy: hned ? Date.now() : kdyPlanu, oznacit: fm.oznacit, pribeh: fm.kam === 'oba' },
      jen ? { jenPribeh: true } : { popisek: popisek.trim() }));
    uloziste.pis('asistent.ig.kamReel', fm.kam);
    stav.reely.plan = v.plan || {};
    stav.reely.popiskyPlanu = v.popisky || {};
    if (v.zverejneno && typeof v.zverejneno === 'object') stav.reely.zverejneno = v.zverejneno;
    if (v.reel) nahradReel(v.reel);
    ulozDoZarizeni();
    if (r.tymy[0]) { const ul = uloziste.cti('asistent.ig.oznacit') || {}; ul[r.tymy[0]] = fm.oznacit; uloziste.pis('asistent.ig.oznacit', ul); }
    if (f === fm) f = null; // formulář znovu z plánu
    toast(hned ? 'Zveřejňuji na Instagram – ' + co + ', průběh vidíš u reelu' : 'Naplánováno – ' + co + ' vyjde ' + kdyPlan(kdyPlanu));
    zmeneno();
    if (hned) ig.hned('reel', r.id, 'ted');
  } catch (e) {
    fm.ukladam = false;
    ukazChybuFormulare(e.message);
    zmeneno();
  }
}

function nahradReel(novy) {
  if (!stav.reely || !novy || !novy.id) return;
  const i = seznam().findIndex((r) => r.id === novy.id);
  if (i >= 0) stav.reely.reely[i] = novy;
}

// ---------------------------------------------------------------- popisek: úprava (reelPopisekUlozit, 700 ms po psaní) a návrhy

/** Psaní do popisku: počítadlo a štítek hned (detail se pod rukama nepřekresluje), uložení 700 ms po posledním písmenu. */
function pisePopisek(t) {
  const id = t.dataset.reelPopisek;
  if (!ed || ed.id !== id) ed = { id, text: t.value, zmena: false, casovac: 0, uklada: false, ulozeno: 0, chyba: '' };
  ed.text = t.value;
  ed.zmena = true;
  ed.ulozeno = 0;
  const box = t.closest('[data-reel-popisek-box]');
  if (box) {
    const z = box.querySelector('[data-reel-znaky]');
    if (z) { z.textContent = pocetZnaku(ed.text); z.classList.toggle('reel__znaky--moc', ed.text.length > POPISEK_MAX); }
    const s = box.querySelector('[data-reel-stitek]');
    if (s && !s.innerHTML) s.innerHTML = '<span class="tag tag--warn">upraveno</span>';
    const u = box.querySelector('[data-reel-ulozeni]');
    if (u) u.textContent = stavUlozeni(ed);
  }
  clearTimeout(ed.casovac);
  ed.casovac = setTimeout(ulozPopisek, ULOZIT_PO);
}

function ukazUlozeni(e) {
  document.querySelectorAll('[data-reel-popisek-box="' + CSS.escape(e.id) + '"] [data-reel-ulozeni]').forEach((u) => { u.textContent = stavUlozeni(e); });
}

/** Uloží rozepsaný popisek (po sobě – fronta); odpověď motoru: reel s úpravou, popisky plánu a plán. */
function ulozPopisek() {
  const e = ed;
  if (!e || !e.zmena) return fronta;
  clearTimeout(e.casovac);
  e.zmena = false;
  const id = e.id, text = e.text;
  if (text.length > POPISEK_MAX) { e.chyba = 'popisek je delší než 2 200 znaků'; ukazUlozeni(e); return fronta; }
  e.uklada = true;
  e.chyba = '';
  ukazUlozeni(e);
  fronta = fronta.then(() => volej('reelPopisekUlozit', { id, text })).then((v) => {
    prijmiPopisek(v);
    e.ulozeno = Date.now();
  }).catch((err) => {
    e.chyba = err.message;
    e.zmena = true; // zkusí se s dalším písmenem nebo před zveřejněním
    toast('Popisek se neuložil: ' + err.message, true);
  }).then(() => {
    e.uklada = false;
    ukazUlozeni(e);
    zmeneno();
  });
  return fronta;
}

function prijmiPopisek(v) {
  if (!v || !stav.reely) return;
  if (v.reel) nahradReel(v.reel);
  if (v.popiskyPlanu && typeof v.popiskyPlanu === 'object') stav.reely.popiskyPlanu = v.popiskyPlanu;
  if (v.plan && typeof v.plan === 'object') stav.reely.plan = v.plan;
  ulozDoZarizeni();
}

/** Text do pole popisku (návrh od Clauda, Vrátit původní): pole se přepíše a uloží jako úprava. */
function nastavPopisek(r, text) {
  if (ed && ed.id === r.id) clearTimeout(ed.casovac);
  ed = { id: r.id, text, zmena: true, casovac: 0, uklada: false, ulozeno: 0, chyba: '' };
  document.querySelectorAll('[data-reel-popisek="' + CSS.escape(r.id) + '"]').forEach((t) => { t.value = text; });
  ulozPopisek();
  zmeneno();
}

function vratitPuvodni(r) {
  if (ed && ed.id === r.id) clearTimeout(ed.casovac);
  ed = null;
  fronta = fronta.then(() => volej('reelPopisekUlozit', { id: r.id, vratit: true }))
    .then((v) => {
      prijmiPopisek(v);
      const text = v && v.reel ? v.reel.popisek || '' : '';
      document.querySelectorAll('[data-reel-popisek="' + CSS.escape(r.id) + '"]').forEach((t) => { t.value = text; });
      toast('Vrácený popisek z PC');
    })
    .catch((e) => toast('Nevyšlo: ' + e.message, true))
    .then(zmeneno);
}

function noveNavrhy(r) {
  volej('reelPopisekNavrhy', { id: r.id })
    .then((v) => { prijmiPopisek(v); toast('Claude dostal úkol – 2 návrhy přijdou do půl hodiny (když běží PC)'); })
    .catch((e) => toast(e.message, true))
    .then(zmeneno);
}

/** Psaní do detailu (popisek, účty, čas) a do okna příběhu – pole se nepřekreslují, jen se pamatuje hodnota. */
export function vstupReely(e) {
  const t = e.target;
  if (!t || !t.matches) return false;
  if (pribehy.vstupPribehy(e)) return true;
  if (t.matches('[data-reel-popisek]')) { if (e.type === 'input') pisePopisek(t); return true; }
  const r = f && najdi(f.id);
  if (!r) return false;
  if (t.matches('[data-rd-pribeh]')) { f.kam = t.checked ? 'oba' : 'reel'; zmeneno(); return true; }
  if (!t.matches('[data-rd]')) return false;
  f[t.dataset.rd] = t.value;
  return true;
}

// ---------------------------------------------------------------- stránka Reely

function nadpisTydne(pondeli) {
  const r = Math.round((zacatekTydne(Date.now()) - pondeli) / (7 * 864e5));
  const rozsah = dm(pondeli) + ' – ' + dm(pridejDny(pondeli, 6));
  return r === 0 ? 'Tento týden · ' + rozsah : r === 1 ? 'Minulý týden · ' + rozsah : rozsah;
}

/** Reely i příběhy z fotek jako položky seznamu: { druh, id, kat, kdy (čas plánu), datum (zápas / nahrání) }. */
function polozky() {
  const vse = seznam().filter((r) => !vyber.tym || r.tymy.indexOf(vyber.tym) >= 0).map((r) => {
    const p = plan(r);
    return { druh: 'reel', id: r.id, r, kat: kategorie(r), kdy: p ? Number(p.kdy) || 0 : 0, datum: datumReelu(r) };
  });
  if (!vyber.tym) {
    pribehy.seznam().forEach((x) => {
      const z = pribehy.plan(x.id);
      vse.push({ druh: 'pribeh', id: x.id, x, kat: pribehy.kategorie(x), kdy: z ? Number(z.kdy) || 0 : 0, datum: pribehy.cas(x) });
    });
  }
  return vse;
}
const kartaPolozky = (p) => (p.druh === 'reel' ? kartaHtml(p.r) : pribehy.kartaHtml(p.x, vybrany === p.id && SIROKE.matches));
const PORADI = { chyba: 0, bezi: 1, plan: 2, ceka: 3, venku: 4 };
const nevydana = (p) => p.kat !== 'venku';

function seznamHtml(pol) { return '<ul class="reely-seznam">' + pol.map(kartaPolozky).join('') + '</ul>'; }

function sekceHtml(nadpis, pol, trida) {
  return pol.length ? '<section class="reely-sekce' + (trida ? ' ' + trida : '') + '"><h2 class="reely-tyden__nadpis">' + esc(nadpis) +
    '<span class="reely-sekce__pocet cisla">' + pol.length + '</span></h2>' + seznamHtml(pol) + '</section>' : '';
}

/** Po týdnech (zápas / nahrání příběhu), nejnovější nahoře. */
function poTydnech(pol) {
  const tydny = [];
  pol.slice().sort((a, b) => b.datum - a.datum).forEach((p) => {
    const pondeli = zacatekTydne(p.datum);
    const t = tydny.find((x) => x.pondeli === pondeli) || (tydny.push({ pondeli, pol: [] }), tydny[tydny.length - 1]);
    t.pol.push(p);
  });
  return tydny;
}

/** Seznam vlevo (sekce) a pořadí položek – podle něj se vybírá první, když vybraná v pohledu není. */
function seznamStranky(vse) {
  if (vyber.stav === 'nevydane') {
    const na = vse.filter((p) => ['chyba', 'bezi', 'plan'].indexOf(p.kat) >= 0)
      .sort((a, b) => PORADI[a.kat] - PORADI[b.kat] || (a.kat === 'plan' ? a.kdy - b.kdy : b.kdy - a.kdy));
    const ceka = vse.filter((p) => p.kat === 'ceka').sort((a, b) => b.datum - a.datum);
    return { poradi: na.concat(ceka), html: na.length || ceka.length ? sekceHtml('Naplánované', na, 'reely-sekce--plan') + sekceHtml('Čeká na Instagram', ceka)
      : '<div class="card"><div class="prazdne">Nic nečeká – všechno je venku. ' +
        '<button type="button" class="btn btn--ghost btn--sm" data-reely-filtr="zverejnene">Ukázat zveřejněné</button></div></div>' };
  }
  const tydny = poTydnech(vyber.stav === 'zverejnene' ? vse.filter((p) => !nevydana(p)) : vse);
  return { poradi: [].concat(...tydny.map((t) => t.pol)), html: tydny.length
    ? tydny.map((t) => '<section class="reely-tyden"><h2 class="reely-tyden__nadpis">' + esc(nadpisTydne(t.pondeli)) + '</h2>' + seznamHtml(t.pol) + '</section>').join('')
    : '<div class="card"><div class="prazdne">Zatím nic zveřejněného.</div></div>' };
}

function strankaHtml() {
  const vse = polozky();
  const vsechnyReely = seznam();
  const tymy = [];
  vsechnyReely.forEach((r) => r.tymy.forEach((k) => { if (tymy.indexOf(k) < 0) tymy.push(k); }));
  const nNe = vse.filter(nevydana).length, nZv = vse.length - nNe;
  const lista = '<div class="reely-lista">' +
    segment([['nevydane', 'Nevydané', nNe], ['zverejnene', 'Zveřejněné', nZv], ['vse', 'Vše', vse.length]], vyber.stav, 'data-reely-filtr', 'Které reely ukázat') +
    (tymy.length > 1 ? segment([['', 'Všechny týmy']].concat(tymy.map((k) => [k, nazevTymu(k)])), vyber.tym, 'data-reely-tym', 'Tým') : '') +
    (pribehy.umi() ? '<button type="button" class="btn btn--plan reely-novy" data-pribeh-novy>' + IKONY.foto + '<span>Nový příběh</span></button>' : '') + '</div>';
  let h = '<div class="reely-stranka">' + (vsechnyReely.length || pribehy.seznam().length || pribehy.umi() ? lista : '');
  if (stav.chyby.reely) h += chybaHtml(stav.chyby.reely, 'data-reely-znovu');
  if (!vsechnyReely.length && !pribehy.seznam().length) {
    h += '<div class="card"><div class="prazdne">Zatím tu žádný reel není. Hotové reely sem posílá domácí PC – po dokončení reelu export ' +
      '<code>NASTROJE\\asistent\\reely\\export_reely.py</code> nahraje popisek a video na Disk.</div></div>';
  } else {
    const s = seznamStranky(vse);
    // na PC detail vpravo: vybraný (i když mezitím vyšel a ze seznamu Nevydané zmizel – průběh je pořád vidět), jinak první
    // v pohledu (vlevo co čeká, vpravo detail vybraného); jiný filtr = zase první
    if (SIROKE.matches && !detailPolozky(vybrany) && s.poradi.length) { vybrany = s.poradi[0].id; f = null; }
    const d = SIROKE.matches && detailPolozky(vybrany);
    h += '<div class="reely-rozvrzeni' + (d ? ' reely-rozvrzeni--detail' : '') + '"><div class="reely-sloupec">' + s.html + '</div>' +
      (d ? '<aside class="reely-detail card" aria-label="Vybraný reel">' + d.telo + (d.akce ? '<div class="reel-detail__akce">' + d.akce + '</div>' : '') + '</aside>' : '') + '</div>';
  }
  h += '<p class="napoveda reely-napoveda">Videa jsou na tvém Disku Google (CLAUDE_SCHRANKA/REELY) a otevře je jen tvůj účet. ' +
    'Do Fotek v iPhonu: v aplikaci Disk ⋯ → Poslat kopii → Uložit video. ' +
    (umiMotor('reelPopisekUlozit') ? 'Popisek upravený tady platí v aplikaci i na Instagramu, soubor na PC (popisky\\…txt) zůstává.' : 'Popisek se mění jen na PC (popisky\\…txt).') + '</p>';
  return h + '</div>';
}

let posledniStranka = '';
export function vykresliReely(el) {
  if (!stav.reely) {
    el.innerHTML = '<div class="card">' + (stav.chyby.reely ? chybaHtml(stav.chyby.reely, 'data-reely-znovu') : kostra(3)) + '</div>';
    posledniStranka = '';
    return;
  }
  const h = strankaHtml();
  if (h !== posledniStranka || !el.firstElementChild) {
    posledniStranka = h;
    prepisSPolem(el, h);
  }
  obnovDetailVOkne();
}

/**
 * innerHTML, ale pole, do kterého se právě píše (popisek, účty, čas – [data-pole]), zůstane: všechno kolem něj se vymění
 * za nové uzly po patrech od pole až ke kořeni, pole samo ne (jeho hodnotu drží ed / f). iPhone by jinak zavřel klávesnici
 * a kurzor by skočil.
 */
function prepisSPolem(el, h) {
  const a = document.activeElement;
  const pole = a && a.matches && a.matches('[data-pole]') && el.contains(a) ? a : null;
  const sablona = document.createElement('template');
  sablona.innerHTML = h;
  const nove = pole && sablona.content.querySelector('[data-pole="' + CSS.escape(pole.dataset.pole) + '"]');
  if (!nove || nove.tagName !== pole.tagName) { el.innerHTML = h; return; }
  let s = pole, n = nove;
  while (s !== el && s.parentNode && n.parentNode) {
    const sp = s.parentNode, np = n.parentNode;
    const deti = Array.from(np.childNodes);
    const i = deti.indexOf(n);
    Array.from(sp.childNodes).forEach((c) => { if (c !== s) sp.removeChild(c); });
    deti.slice(0, i).forEach((c) => sp.insertBefore(c, s));
    deti.slice(i + 1).forEach((c) => sp.appendChild(c));
    if (sp !== el && np.nodeType === 1) {
      Array.from(sp.attributes).forEach((x) => { if (!np.hasAttribute(x.name)) sp.removeAttribute(x.name); });
      Array.from(np.attributes).forEach((x) => sp.setAttribute(x.name, x.value));
    }
    s = sp;
    n = np;
  }
}

/** Limetková karta na Dnes (vzor PriorAuth „Další krok“): nejnovější nevydaný reel – Na Instagram (detail), Kopírovat a Video
 *  jedním ťuknutím. Nad ní karta Instagramu (js/ig.js), když se zveřejňuje, brzy má něco vyjít, zaseklo se to nebo to právě vyšlo. */
export function kartaDnesHtml() {
  const igKarta = ig.kartaHtml();
  const k = kVyveseni();
  if (!k.length) return igKarta;
  const r = k[0];
  const text = popisekReelu(r);
  const sIg = lzePlanovat(r);
  return igKarta + '<div class="dalsi-krok reel-krok" data-reel-krok="' + esc(r.id) + '">' +
    '<div class="reel-krok__hlava"><small>' + IKONY.reely + 'Reel k vyvěšení' + (k.length > 1 ? ' · ' + k.length : '') + '</small>' +
      '<button type="button" class="reel-krok__sipka" data-cil="reely" aria-label="Všechny reely" title="Všechny reely">' + IKONY.sipka + '</button></div>' +
    '<div class="reel-krok__obsah">' + nahledHtml(r) +
      '<div class="reel-krok__text"><b>' + esc(r.nazev) + '</b><small>' + esc([r.tymNazev, (r.zapasy[0] || {}).soutez].filter(Boolean).join(' · ')) + '</small></div></div>' +
    (text ? (upraveny(r) ? '<span class="tag tag--warn reel-krok__upraveno">upravený popisek</span>' : '') + '<div class="reel-krok__popisek">' + esc(text) + '</div>'
      : '<q>Popisek zatím není.</q>') +
    '<div class="reel-krok__akce">' +
      (sIg ? '<button type="button" class="btn btn--cerne" data-reel-detail="' + esc(r.id) + '">' + IKONY.instagram + '<span>Na Instagram</span></button>' : '') +
      kopirovatHtml(r, sIg ? 'btn--ghost' : 'btn--cerne') +
      (r.odkaz ? '<a class="btn btn--ghost" href="' + esc(r.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.prehrat + '<span>Video</span></a>' : '') + '</div>' +
  '</div>';
}

/** Tlačítko na stránku Reely (stránka Fotbal, karta Fotbal na Dnes). */
hooky.reelyTlacitko = (trida) => (umiMotor('reely')
  ? '<button type="button" class="' + (trida || 'chip') + ' reely-tl" data-cil="reely">' + IKONY.reely + '<span>Reely</span>' +
    (kVyveseni().length ? '<span class="pocet cisla">' + kVyveseni().length + '</span>' : '') + '</button>' : '');

/** Popisek do schránky (tlačítko Kopírovat i nabídka; ui.doSchranky – i starší Safari) – u nezveřejněného s „Zveřejněno“. */
function kopirujPopisek(r) {
  doSchranky(aktualniPopisek(r)).then((ok) => {
    if (!ok) { toast('Kopírování nejde – podrž prst na textu popisku a zkopíruj ho ručně.', true); return; }
    if (zverejneno(r)) toast('Popisek zkopírovaný');
    else toastAkce('Popisek zkopírovaný – vlož ho do Instagramu', 'Zveřejněno', () => oznac(r.id, true));
  });
}

/** Zrušit naplánované zveřejnění (tlačítko i nabídka). */
function zrusitPlan(r) {
  potvrd('Zrušit naplánované zveřejnění?', { text: r.nazev + ' – na Instagram pak nepůjde sám.', ano: 'Zrušit plán', ne: 'Nechat' }).then((ano) => {
    if (!ano) return;
    volej('reelZrusitPlan', { id: r.id })
      .then((v) => { stav.reely.plan = v.plan || {}; if (v.popisky) stav.reely.popiskyPlanu = v.popisky; if (f && f.id === r.id) f = null; ulozDoZarizeni(); toast('Plán zrušený'); })
      .catch((e) => toast(e.message, true))
      .then(zmeneno);
  });
}

function oznac(id, ano) {
  if (!stav.reely) return;
  const puvodni = stav.reely.zverejneno || {};
  stav.reely.zverejneno = Object.assign({}, puvodni);
  if (ano) stav.reely.zverejneno[id] = isoDatum(Date.now()); else delete stav.reely.zverejneno[id];
  zmeneno();
  volej('reelStav', { id, zverejneno: ano })
    .then((v) => {
      stav.reely.zverejneno = v.zverejneno || {};
      ulozDoZarizeni();
      toast(ano ? 'Zapsáno – reel je na Instagramu' : 'Vráceno mezi nezveřejněné');
    })
    .catch((e) => { stav.reely.zverejneno = puvodni; toast(e.message, true); })
    .then(zmeneno);
}

function nastavVyber(zmena) {
  vyber = Object.assign({}, vyber, zmena);
  if (SIROKE.matches) { if (ed && ed.id === vybrany) ulozPopisek(); vybrany = ''; f = null; } // v novém pohledu vybrat první
  uloziste.pis(VYBER, vyber);
  zmeneno();
}

export function klikReely(el) {
  if (ig.klikIg(el)) return true; // Zveřejnit teď / Zkusit znovu u naplánovaného reelu, plakátu a příběhu a na Přehledu
  if (pribehy.klikPribehy(el)) return true; // Nový příběh z fotky, změnit, zrušit, okno příběhu
  const reel = (klic) => najdi(el.dataset[klic]);
  if (el.dataset.reelVyber) { otevriDetail(el.dataset.reelVyber); return true; }
  if (el.dataset.reelDetail) { otevriDetail(el.dataset.reelDetail); return true; }
  if (el.dataset.reelKopirovat) { const r = reel('reelKopirovat'); if (r) kopirujPopisek(r); return true; }
  if (el.dataset.reelZverejneno) { const r = reel('reelZverejneno'); if (r) oznac(r.id, !zverejneno(r)); return true; }
  if (el.dataset.rdTed) { const r = reel('rdTed'); if (r) odesliPlan(r, true); return true; }
  if (el.dataset.rdUlozit) { const r = reel('rdUlozit'); if (r) odesliPlan(r, false); return true; }
  if (el.dataset.rdKam) { if (f) { f.kam = el.dataset.rdKam; zmeneno(); } return true; }
  if (el.dataset.reelZrusitPlan) { const r = reel('reelZrusitPlan'); if (r) zrusitPlan(r); return true; }
  if (el.dataset.reelVratit) { const r = reel('reelVratit'); if (r) vratitPuvodni(r); return true; }
  if (el.dataset.reelNavrhVolba != null && el.hasAttribute('data-reel-navrh-volba')) {
    const id = el.closest('[data-reel-popisek-box]') && el.closest('[data-reel-popisek-box]').dataset.reelPopisekBox;
    if (id) { volbaNavrhu[id] = Number(el.dataset.reelNavrhVolba) || 0; zmeneno(); }
    return true;
  }
  if (el.dataset.reelNavrhPouzit) {
    const r = reel('reelNavrhPouzit');
    const text = r && r.navrhy && r.navrhy.varianty[volbaNavrhu[r.id] || 0];
    if (r && text) { nastavPopisek(r, text); toast('Návrh ' + ((volbaNavrhu[r.id] || 0) + 1) + ' je v popisku – jde dál upravit'); }
    return true;
  }
  if (el.dataset.reelNavrhClaude) { const r = reel('reelNavrhClaude'); if (r) noveNavrhy(r); return true; }
  if (el.dataset.reelyFiltr) { nastavVyber({ stav: el.dataset.reelyFiltr }); return true; }
  if (el.dataset.reelyTym != null && el.hasAttribute('data-reely-tym')) { nastavVyber({ tym: el.dataset.reelyTym }); return true; }
  if (el.hasAttribute('data-reely-znovu')) { nactiReely(true); return true; }
  return false;
}

// ---------------------------------------------------------------- pravé tlačítko (Michal 11. 10.)
// Reel (stránka Reely i karta „Reel k vyvěšení“ na Přehledu): Kopírovat popisek, Upravit / na Instagram (detail), Přehrát
// video, Zveřejnit teď a Zrušit plán u naplánovaného, Na Instagramu, Označit zveřejněno. V textu popisku zůstává nabídka
// prohlížeče (označit a kopírovat ručně, kdyby schránka nešla).

function nabidkaReelu(cil) {
  if (cil.closest('.reel__popisek, .reel-krok__popisek')) return null;
  const el = cil.closest('[data-reel], [data-reel-krok]');
  const r = el && najdi(el.dataset.reel || el.dataset.reelKrok);
  if (!r) return null;
  const p = plan(r), z = zverejneno(r);
  const pol = [];
  if (popisekReelu(r)) pol.push({ ikona: IKONY.kopirovat, text: 'Kopírovat popisek', fn: () => kopirujPopisek(r) });
  pol.push({ ikona: IKONY.psat, text: lzePlanovat(r) ? 'Popisek a Instagram…' : 'Otevřít', fn: () => otevriDetail(r.id) });
  if (r.odkaz) pol.push({ ikona: IKONY.prehrat, text: 'Přehrát video', fn: () => otevriOdkaz(r.odkaz) });
  if (p && p.stav === 'hotovo' && /^https:\/\//.test(p.odkaz || '')) pol.push({ ikona: IKONY.instagram, text: 'Otevřít na Instagramu', fn: () => otevriOdkaz(p.odkaz) });
  if (lzePlanovat(r) && p && p.stav === 'ceka') {
    if (umiMotor('igKrok')) pol.push({ ikona: IKONY.odeslat, text: 'Zveřejnit teď', oddel: true, fn: () => ig.zverejnitTed('reel', r.id) });
    pol.push({ ikona: IKONY.zavrit, text: 'Zrušit plán', oddel: !umiMotor('igKrok'), fn: () => zrusitPlan(r) });
  }
  pol.push({ ikona: IKONY.fajfka, text: z ? 'Vrátit mezi nezveřejněné' : 'Označit jako zveřejněné', oddel: true, fn: () => oznac(r.id, !z) });
  if (el.closest('#p-dnes')) pol.push({ ikona: IKONY.reely, text: 'Všechny reely', fn: () => { prejdi('reely'); zmeneno(); } });
  return { nadpis: r.nazev, polozky: pol };
}
pripojNabidku(nabidkaReelu);
