// Příběhy na Instagram z fotky z telefonu (Michal 15. 10.: „A dokážeme dělat i příběhy? A třeba i se zmínkami?“).
// Stránka Reely (tlačítko Nový příběh) a „+“ → okno: vybrat fotku (Fotky / Vyfotit / Soubory; JPEG i HEIC – Safari HEIC
// přečte sám), aplikace ji převede na JPEG 1080 × 1920 (fotka jiného poměru celá uprostřed na rozmazaném pozadí –
// js/pribeh_obrazek.js), zmínky (účty bez @), Teď / Naplánovat → motor pribehNaplanovat: fotka na Disk (REELY/pribehy),
// plán PRIBEHY_PLAN; zveřejní ji spouštěč motoru nebo aplikace (igKrok, typ 'pribeh') stejně jako reely – průběh s kroky
// v kartě příběhu na stránce Reely (js/ig.js). Stejná fotka poslaná znovu (otisk) = stejný příběh, nic se nezdvojí.
// Pole pro fotku je jedno stálé v <body> (jako účtenka v Autu – překreslení okna ho nesmí zahodit) a během výběru
// a nahrávání se aplikace nepřenačte novou verzí (window.asistentPrace → js/start.js). Video z telefonu zatím ne (README).

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej } from './api.js';
import { esc, uloziste, dm, hhmm, DNY_KR, isoDatum } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, potvrd, segment } from './ui.js';
import { otevriPanel, zavriPanel, elementPanelu } from './panely.js';
import { pripoj as pripojNabidku } from './nabidka.js';
import * as ig from './ig.js';
import { uctyKOznaceni, casKratce } from './ig_prubeh.js';
import * as O from './pribeh_obrazek.js';
import * as skupiny from './ig_skupiny.js'; // skupiny lidí k označení (čipy u pole Zmínit účty)

const ULOZISTE = 'asistent.data.reely';     // seznam a plán příběhů jsou v datech reelů (akce reely) – ukládají se s nimi
const VSTUP = 'pribeh-foto-vstup';
const ZMINKY = 'asistent.ig.zminkyPribeh';  // účty, které Michal u příběhu zmínil naposledy
const KVALITA = 0.88;                       // JPEG 1080 × 1920 ≈ 0,3–0,9 MB (Instagram bere nejvýš 8 MB)

let np = null;           // rozpracovaný příběh v okně: { id?, foto?, pripravuji, hned, kdy, oznacit, ukladam, chyba }
let vstup = null, vyberOd = 0;

// ---------------------------------------------------------------- data (stav.reely.pribehy + planPribehu z motoru)

export const seznam = () => (stav.reely && Array.isArray(stav.reely.pribehy) ? stav.reely.pribehy : []);
const planVse = () => (stav.reely && stav.reely.planPribehu) || {};
export const plan = (id) => planVse()[id] || null;
const instagram = () => (stav.reely && stav.reely.instagram) || { nastaveno: false };
const ucet = () => (instagram().ucet ? '@' + instagram().ucet : 'klubový Instagram');
const ulozDoZarizeni = () => { if (stav.reely) uloziste.pis(ULOZISTE, { data: stav.reely, kdy: Date.now() }); };
const kdyPlan = (t) => DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + ' ' + hhmm(t);
const doPole = (t) => isoDatum(t) + 'T' + String(new Date(t).getHours()).padStart(2, '0') + ':' + String(new Date(t).getMinutes()).padStart(2, '0');

/** Jde nový příběh z fotky: motor to umí a Instagram je propojený. */
export const umi = () => umiMotor('pribehNaplanovat') && !!instagram().nastaveno;

/** Kde příběh je: 'chyba' | 'bezi' | 'plan' | 'venku' (vyšel; bez plánu = starý, plán se mezitím zkrátil). */
export function kategorie(x) {
  const z = plan(x.id);
  if (!z) return 'venku';
  if (z.stav === 'nahrava' || z.stav === 'zverejnuji') return 'bezi';
  if (z.stav === 'ceka') return 'plan';
  if (z.stav === 'chyba') return 'chyba';
  return 'venku';
}

/** Čas pro řazení: naplánované podle času vydání, vydané podle toho, kdy vyšly, jinak kdy se nahrály. */
export function cas(x) {
  const z = plan(x.id);
  return z ? Number(z.zverejneno) || Number(z.kdy) || x.vytvoreno : x.vytvoreno;
}

// průběh zveřejňování (js/ig.js): plán příběhů z motoru → sem (a do zařízení)
ig.zdroj('pribeh', {
  klic: 'pribehy', oblast: 'reely', video: false, cil: 'reely',
  plan: () => (stav.reely && stav.reely.planPribehu) || null,
  nastav: (planPribehu) => {
    if (!stav.reely) return false;
    stav.reely.planPribehu = planPribehu;
    ulozDoZarizeni();
    return true;
  },
  nazev: () => 'Příběh z fotky',
  ucet
});

function prijmi(v) {
  if (!v || !stav.reely) return;
  if (Array.isArray(v.pribehy)) stav.reely.pribehy = v.pribehy;
  if (v.plan && typeof v.plan === 'object') stav.reely.planPribehu = v.plan;
  ulozDoZarizeni();
}

// ---------------------------------------------------------------- karta příběhu na stránce Reely

const zminky = (z) => (z && Array.isArray(z.oznacit) && z.oznacit.length ? z.oznacit.map((u) => '@' + u).join(', ') : '');

function stitekHtml(x, z) {
  const k = ig.stavKartaAtr('pribeh', x.id); // najetí / klepnutí = kroky s časy
  if (!z) return '<span class="tag tag--seda">v seznamu</span>';
  if (z.stav === 'ceka') return '<span class="tag tag--plan"' + k + '>' + IKONY.kalendar + (z.kdy > Date.now() ? 'vyjde ' : 'na řadě od ') + esc(kdyPlan(z.kdy)) + '</span>';
  if (z.stav === 'nahrava' || z.stav === 'zverejnuji') return '<span class="tag tag--plan"' + k + '>' + IKONY.obnovit + 'zveřejňuje se</span>';
  if (z.stav === 'chyba') return '<span class="tag tag--danger"' + k + '>nepovedlo se – ' + (umiMotor('igKrok') ? 'zkus znovu' : 'naplánuj znovu') + '</span>';
  return '<span class="tag tag--ok"' + k + '>' + IKONY.fajfka + 'příběh vyšel ' + esc(casKratce(Number(z.zverejneno) || z.kdy, Date.now())) + '</span>' +
    (z.zminkyChyba ? '<span class="tag tag--warn">bez zmínek</span>' : '');
}

function akceHtml(x, z) {
  const id = esc(x.id);
  if (z && (z.stav === 'nahrava' || z.stav === 'zverejnuji')) return '';
  if (z && z.stav === 'ceka') {
    const ted = ig.tlacitkoTedHtml('pribeh', x.id, 'btn--plan');
    return ted + '<button type="button" class="btn ' + (ted ? 'btn--ghost' : 'btn--plan') + '" data-pribeh-zmenit="' + id + '">' + IKONY.kalendar + '<span>Změnit</span></button>' +
      '<button type="button" class="btn btn--ghost" data-pribeh-zrusit="' + id + '">' + IKONY.zavrit + '<span>Zrušit</span></button>';
  }
  return '<button type="button" class="btn btn--ghost btn--sm" data-pribeh-zrusit="' + id + '">' + IKONY.smazat + '<span>Odebrat ze seznamu</span></button>';
}

const nahled = (x) => (x.nahled ? '<img src="' + esc(x.nahled) + '" alt="">' : '<span class="reel__prazdny">' + IKONY.foto + '</span>');

/** Malá karta příběhu v seznamu (stejná mřížka jako reely) – klepnutí = detail (na PC vpravo, na telefonu v okně). */
export function kartaHtml(x, vybrany) {
  const z = plan(x.id);
  return '<li class="reel reel--pribeh reel--' + kategorie(x) + (vybrany ? ' reel--vybrany' : '') + '" data-pribeh="' + esc(x.id) + '">' +
    '<button type="button" class="reel__vyber" data-reel-vyber="' + esc(x.id) + '"' + (vybrany ? ' aria-current="true"' : '') + '>' +
      '<span class="reel__nahled">' + nahled(x) + '<span class="reel__druh">Příběh</span></span>' +
      '<span class="reel__souhrn"><span class="reel__stitky"><span class="tag tag--fialova">' + IKONY.foto + 'fotka</span>' + stitekHtml(x, z) + '</span>' +
        '<b class="reel__nazev">Příběh z fotky</b><small class="reel__meta">' + esc(['nahráno ' + kdyPlan(x.vytvoreno || Date.now())].concat(zminky(z) ? ['zmíní ' + zminky(z)] : []).join(' · ')) +
        '</small></span></button></li>';
}

/** Detail příběhu z fotky: { telo, akce, nazev } – náhled, stav, zmínky, průběh; Zveřejnit teď / Změnit / Zrušit / Odebrat. */
export function detailHtml(x) {
  const z = plan(x.id);
  // stejné okno jako reel (js/reely.js): vlevo náhled a název, vpravo průběh a zmínky
  const telo = '<div class="reel-detail reel-detail--pribeh" data-pribeh-detail="' + esc(x.id) + '">' +
    '<div class="reel-detail__media"><span class="reel__nahled">' + nahled(x) + '<span class="reel__druh">Příběh</span></span>' +
      '<div class="reel-detail__titul"><div class="reel__stitky"><span class="tag tag--fialova">' + IKONY.foto + 'fotka z telefonu</span>' + stitekHtml(x, z) + '</div>' +
        '<h2 class="reel__nazev">Příběh z fotky</h2><small class="reel__meta">nahráno ' + esc(kdyPlan(x.vytvoreno || Date.now())) + ' · ' + esc(ucet()) + '</small></div></div>' +
    '<div class="reel-detail__obsah">' + (z ? ig.prubehHtml('pribeh', x.id, z) : '') +
    '<section class="reel-detail__cast"><span class="label">Zmínky v příběhu</span><p class="reel-detail__text">' + esc(zminky(z) || 'bez zmínek') + '</p>' +
      '<p class="napoveda">Příběh na Instagramu po 24 h sám zmizí. Fotka zůstává na tvém Disku (REELY/pribehy), dokud ji neodebereš.</p></section></div></div>';
  return { telo, akce: akceHtml(x, z), nazev: 'Příběh z fotky' };
}

// ---------------------------------------------------------------- stálé pole pro fotku (mimo překreslované části)

function pripravVstup() {
  if (vstup || !document.body) return vstup;
  vstup = document.createElement('input');
  vstup.type = 'file';
  vstup.accept = 'image/*';
  vstup.id = VSTUP;
  vstup.className = 'auto-foto-vstup';
  vstup.tabIndex = -1;
  vstup.setAttribute('aria-hidden', 'true');
  vstup.addEventListener('change', poVyberu);
  vstup.addEventListener('cancel', () => { vyberOd = 0; });
  document.body.appendChild(vstup);
  return vstup;
}
if (document.body) pripravVstup(); else document.addEventListener('DOMContentLoaded', pripravVstup);
// klepnutí na „Vybrat fotku“ (zachytávání – před čímkoli jiným): výběr se otevírá; na iPadu nabídku posunout k popisku
document.addEventListener('click', (e) => {
  const l = e.target && e.target.closest ? e.target.closest('label[for="' + VSTUP + '"]') : null;
  if (!l || !pripravVstup()) return;
  const r = l.getBoundingClientRect();
  Object.assign(vstup.style, { left: Math.round(r.left) + 'px', top: Math.round(r.top) + 'px', width: Math.round(r.width) + 'px', height: Math.round(r.height) + 'px' });
  vyberOd = Date.now();
}, true);
// výběr fotky a nahrávání příběhu nepřeruší nová verze aplikace
(window.asistentPrace = window.asistentPrace || []).push(() => (vyberOd > 0 && Date.now() - vyberOd < 10 * 60e3) || !!(np && (np.pripravuji || np.ukladam)));

async function poVyberu() {
  const soubor = vstup.files && vstup.files[0];
  vyberOd = 0;
  const moje = np;
  if (!soubor || !moje) { vstup.value = ''; return; }
  moje.pripravuji = true;
  moje.chyba = '';
  obnovCasti();
  try {
    const img = await nactiObrazek(soubor);
    const foto = await pripravFoto(img);
    if (img.close) img.close(); // ImageBitmap – paměť hned pryč
    moje.foto = foto;
  } catch (e) {
    moje.chyba = e.message;
  }
  moje.pripravuji = false;
  vstup.value = ''; // stejnou fotku jde vybrat znovu
  if (np === moje) obnovCasti();
}

/** Fotka → obrázek: FileReader + Image (CSP nepouští blob:), jinak createImageBitmap; HEIC ze Souborů neumí každý prohlížeč. */
function nactiObrazek(soubor) {
  const chybaFotky = () => new Error(/hei[cf]/i.test((soubor.type || '') + ' ' + (soubor.name || ''))
    ? 'Fotka je ve formátu HEIC, který tu nejde přečíst – vyber ji přes Fotky (ne Soubory).'
    : 'Fotku se nepodařilo načíst – zkus ji vybrat znovu.');
  return new Promise((hotovo, chyba) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => hotovo(img);
      img.onerror = () => chyba(chybaFotky());
      img.src = r.result;
    };
    r.onerror = () => chyba(chybaFotky());
    r.readAsDataURL(soubor);
  }).catch((e) => (window.createImageBitmap ? createImageBitmap(soubor).catch(() => { throw e; }) : Promise.reject(e)));
}

/** Fotka → příběh 1080 × 1920 (JPEG) + malý náhled do seznamu + otisk (stejná fotka = stejný příběh v motoru). */
async function pripravFoto(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const r = O.rozvrzeni(w, h);
  if (!r) throw new Error('Fotku se nepodařilo načíst – zkus ji vybrat znovu.');
  const c = document.createElement('canvas');
  c.width = O.SIRKA;
  c.height = O.VYSKA;
  const g = c.getContext('2d');
  g.fillStyle = '#111';
  g.fillRect(0, 0, O.SIRKA, O.VYSKA);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  if (!r.plne) {
    // rozmazané pozadí: fotka zmenšená na pár desítek bodů a zase zvětšená (rozmaže se sama – bez ctx.filter, který starší
    // Safari neumí), přes ni lehce ztmavit, ať fotka vynikne
    const m = O.malePlatno(27);
    const male = document.createElement('canvas');
    male.width = m.w;
    male.height = m.h;
    const k = m.w / O.SIRKA;
    male.getContext('2d').drawImage(img, r.pozadi.x * k, r.pozadi.y * k, r.pozadi.w * k, r.pozadi.h * k);
    const stredni = document.createElement('canvas');
    stredni.width = m.w * 6;
    stredni.height = m.h * 6;
    const gs = stredni.getContext('2d');
    gs.imageSmoothingEnabled = true;
    gs.imageSmoothingQuality = 'high';
    gs.drawImage(male, 0, 0, stredni.width, stredni.height);
    g.drawImage(stredni, 0, 0, O.SIRKA, O.VYSKA);
    g.fillStyle = 'rgba(0, 0, 0, .25)';
    g.fillRect(0, 0, O.SIRKA, O.VYSKA);
    male.width = male.height = stredni.width = stredni.height = 0; // iPhone má na plátna málo paměti
  }
  g.drawImage(img, r.popredi.x, r.popredi.y, r.popredi.w, r.popredi.h);
  const obrazek = c.toDataURL('image/jpeg', KVALITA);
  const n = document.createElement('canvas');
  n.width = 108; // malý náhled do seznamu (motor ho drží v pribehy.json a jde i do kopie reelů na serveru – ~4 kB)
  n.height = 192;
  n.getContext('2d').drawImage(c, 0, 0, n.width, n.height);
  const nahled = n.toDataURL('image/jpeg', 0.55);
  c.width = c.height = n.width = n.height = 0;
  if (!/^data:image\/jpeg;base64,./.test(obrazek)) throw new Error('Fotku se nepodařilo upravit (málo paměti?) – zkus ji vybrat znovu.');
  return { obrazek, nahled, otisk: await otiskFotky(obrazek), plne: r.plne, puvodni: w + ' × ' + h };
}

/** Otisk fotky (stejná fotka = stejný otisk) – motor podle něj příběh nezdvojí, když se pošle znovu. */
async function otiskFotky(dataUrl) {
  try {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
    return Array.from(new Uint8Array(h)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return ''; // bez crypto.subtle – motor si otisk spočítá z fotky sám
  }
}

// ---------------------------------------------------------------- okno Nový příběh / Změnit příběh

/** Výchozí čas plánu: za hodinu, zaokrouhleno na 5 minut. */
const zaHodinu = () => Math.ceil((Date.now() + 60 * 60e3) / 3e5) * 3e5;

/** Okno pro nový příběh (bez id) nebo změnu času a zmínek naplánovaného (id). */
export function otevriNovy(id) {
  if (!umi()) return;
  const z = id ? plan(id) : null;
  const x = id ? seznam().find((p) => p.id === id) : null;
  if (id && !x) return;
  np = { id: id || '', foto: null, nahled: x ? x.nahled : '', pripravuji: false, ukladam: false, chyba: '',
    hned: !id && umiMotor('igKrok'), kdy: doPole(z && z.stav === 'ceka' && z.kdy > Date.now() ? z.kdy : zaHodinu()),
    oznacit: z ? zminky(z) : String(uloziste.cti(ZMINKY) || '') };
  const moje = np;
  otevriPanel({
    // stejné široké okno uprostřed jako detail reelu (Michal 16. 10.: „ať je to jednotné“) – vlevo fotka, vpravo kdy a zmínky
    id: 'pribeh-novy', trida: 'panel-okno panel-formular panel-reel panel-pribeh', titul: () => (np && np.id ? 'Změnit příběh' : 'Nový příběh na Instagram'),
    vykresli: oknoHtml, paticka: patickaHtml,
    // klepnutí mimo okno ho zavře, jen když v něm nic rozdělaného není (vybraná fotka by se ztratila)
    zavritMimo: () => !(np === moje && (moje.foto || moje.pripravuji || moje.ukladam)),
    poOtevreni: (el) => el.focus({ preventScroll: true }),
    priZavreni: () => { if (np === moje) np = null; }
  });
}

function napoveda() {
  return np.id ? 'Čas a zmínky naplánovaného příběhu – fotku vyměníš tak, že příběh zrušíš a nahraješ jinou.'
    : 'Fotka vyjde jako příběh na ' + esc(ucet()) + (np.hned ? ' hned' : ' sama v zadaný čas (do 10 minut)') + ' – po 24 h z Instagramu zmizí.';
}

function fotoHtml() {
  if (np.pripravuji) return '<div class="pribeh-foto__prazdne" role="status"><span class="toci"></span><b>Upravuji fotku na 1080 × 1920…</b></div>';
  if (np.foto) {
    return '<img class="pribeh-foto__nahled" src="' + np.foto.obrazek + '" alt="Náhled příběhu">' +
      '<div class="pribeh-foto__info"><b>Příběh 1080 × 1920</b><small>' + (np.foto.plne ? 'fotka vyplní celý příběh' : 'fotka celá, kolem rozmazané pozadí') +
      ' · původně ' + esc(np.foto.puvodni) + '</small>' +
      '<label for="' + VSTUP + '" class="btn btn--ghost btn--sm pribeh-foto__jina">' + IKONY.foto + '<span>Jiná fotka</span></label></div>';
  }
  if (np.id) {
    return (np.nahled ? '<img class="pribeh-foto__nahled" src="' + esc(np.nahled) + '" alt="Náhled příběhu">' : '') +
      '<div class="pribeh-foto__info"><b>Nahraná fotka</b><small>naplánovaný příběh</small></div>';
  }
  return '<label for="' + VSTUP + '" class="pribeh-foto__vyber"><i class="kruh kruh--fialova">' + IKONY.foto + '</i><b>Vybrat fotku</b>' +
    '<small>z Fotek, vyfotit nebo ze Souborů – upraví se na příběh 1080 × 1920</small></label>';
}

function oknoHtml() {
  if (!np) return '';
  const volba = umiMotor('igKrok') ? '<div class="rp-kdy"><span class="label">Kdy</span>' +
    segment([['ted', 'Teď'], ['cas', 'Naplánovat']], np.hned ? 'ted' : 'cas', 'data-np-kdy', 'Kdy zveřejnit') + '</div>' : '';
  return '<div class="formular pribeh-okno">' +
    '<div class="pribeh-foto" data-np-foto>' + fotoHtml() + '</div>' +
    '<div class="pribeh-okno__pole">' +
    '<p class="napoveda" data-np-napoveda>' + napoveda() + '</p>' + volba +
    '<label data-np-kdy-pole' + (np.hned ? ' hidden' : '') + '><span class="label">' + (volba ? 'Datum a čas' : 'Kdy') + '</span>' +
      '<input class="field" type="datetime-local" data-np="kdy" value="' + esc(np.kdy) + '"></label>' +
    // zmínky se skupinami (js/ig_skupiny.js) – klepnutí na skupinu přidá / ubere její lidi
    skupiny.oznaceniHtml({ popisek: 'Zmínit účty', atribut: 'data-np="oznacit"', hodnota: np.oznacit }) +
    '<p class="napoveda">Účty bez @ nebo s ním, oddělené čárkou (nejvýš 20). Zmíněný účet dostane upozornění – piš jen veřejné účty, ' +
      'které znáš. Když je Instagram v příběhu nevezme, příběh vyjde bez nich.</p>' +
    '<p class="pruh pruh-varovani" data-np-chyba' + (np.chyba ? '' : ' hidden') + '>' + esc(np.chyba) + '</p></div></div>';
}

function patickaHtml() {
  const lze = !!np && !np.ukladam && !np.pripravuji && (!!np.foto || !!np.id);
  const text = !np ? '' : np.ukladam ? (np.foto ? 'Nahrávám…' : 'Ukládám…') : np.hned ? 'Zveřejnit teď' : np.id ? 'Uložit změny' : 'Naplánovat';
  return '<div class="akce"><button type="button" class="btn btn--ghost" data-zavrit-panel>Zrušit</button>' +
    '<button type="button" class="btn btn--plan" data-np-ulozit' + (lze ? '' : ' disabled') + '>' + (np && np.hned ? IKONY.odeslat : IKONY.kalendar) +
    '<span>' + text + '</span></button></div>';
}

/** Překreslí v okně jen fotku, nápovědu, volbu Kdy, chybu a tlačítka – rozepsané zmínky (a klávesnice v telefonu) zůstanou. */
function obnovCasti() {
  const el = elementPanelu('pribeh-novy');
  if (!el || !np) return;
  const casti = { '[data-np-foto]': fotoHtml(), '[data-np-napoveda]': napoveda(), '.panel-paticka': patickaHtml() };
  Object.keys(casti).forEach((s) => { const x = el.querySelector(s); if (x && x.innerHTML !== casti[s]) x.innerHTML = casti[s]; });
  el.querySelectorAll('[data-np-kdy]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.npKdy === 'ted') === np.hned)));
  const pole = el.querySelector('[data-np-kdy-pole]');
  if (pole) pole.hidden = np.hned;
  const ch = el.querySelector('[data-np-chyba]');
  if (ch) { ch.textContent = np.chyba; ch.hidden = !np.chyba; }
}

async function uloz() {
  if (!np || np.ukladam || np.pripravuji) return;
  const moje = np;
  const ukaz = (t) => { moje.chyba = t; if (np === moje) obnovCasti(); };
  if (!np.id && !np.foto) { ukaz('Vyber fotku.'); return; }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(np.kdy || '');
  if (!np.hned && !m) { ukaz('Vyber datum a čas.'); return; }
  const kdy = np.hned ? Date.now() : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
  if (!np.hned && kdy < Date.now() - 60e3) { ukaz('Ten čas už byl – vyber pozdější.'); return; }
  const u = uctyKOznaceni(np.oznacit);
  if (u.chyba) { ukaz(u.chyba); return; }
  moje.ukladam = true;
  ukaz('');
  try {
    const v = await volej('pribehNaplanovat', moje.foto
      ? { obrazek: moje.foto.obrazek, nahled: moje.foto.nahled, otisk: moje.foto.otisk, kdy, oznacit: u.ucty }
      : { id: moje.id, kdy, oznacit: u.ucty });
    prijmi(v);
    uloziste.pis(ZMINKY, moje.oznacit);
    if (np === moje) zavriPanel();
    toast(moje.hned ? 'Zveřejňuji příběh na Instagram – průběh vidíš u příběhu na stránce Reely'
      : (moje.id ? 'Příběh změněný' : 'Příběh naplánovaný') + ' – vyjde ' + kdyPlan(kdy));
    zmeneno();
    if (moje.hned && v && v.id) ig.hned('pribeh', v.id, 'ted');
  } catch (e) {
    moje.ukladam = false;
    if (np !== moje) { toast(e.message, true); return; }
    ukaz(e.message);
  }
}

/** Zrušit naplánovaný příběh / odebrat vyšlý ze seznamu (fotka z Disku do koše; na Instagramu se nic nemaže). */
function zrus(id) {
  const z = plan(id);
  const ceka = !!(z && z.stav === 'ceka');
  potvrd(ceka ? 'Zrušit naplánovaný příběh?' : 'Odebrat příběh ze seznamu?', {
    text: ceka ? 'Na Instagram pak nepůjde. Fotka z Disku půjde do koše.' : 'Z Instagramu se nic nemaže (příběh po 24 h zmizí sám). Fotka z Disku půjde do koše.',
    ano: ceka ? 'Zrušit příběh' : 'Odebrat', ne: 'Nechat'
  }).then((ano) => {
    if (!ano) return;
    volej('pribehZrusit', { id })
      .then((v) => { prijmi(v); toast(ceka ? 'Příběh zrušený' : 'Odebráno ze seznamu'); })
      .catch((e) => toast(e.message, true))
      .then(zmeneno);
  });
}

// ---------------------------------------------------------------- ovládání (z reely.klikReely / vstupReely)

export function klikPribehy(el) {
  if (el.hasAttribute('data-pribeh-novy')) { otevriNovy(); return true; }
  if (el.dataset.pribehZmenit) { otevriNovy(el.dataset.pribehZmenit); return true; }
  if (el.dataset.pribehZrusit) { zrus(el.dataset.pribehZrusit); return true; }
  if (el.dataset.npKdy) { if (np) { np.hned = el.dataset.npKdy === 'ted'; obnovCasti(); } return true; }
  if (el.hasAttribute('data-np-ulozit')) { uloz(); return true; }
  return false;
}

export function vstupPribehy(e) {
  const t = e.target;
  if (!np || !t || !t.matches || !t.matches('[data-np]')) return false;
  np[t.dataset.np] = t.value;
  return true;
}

// pravé tlačítko / podržení na kartě příběhu: Zveřejnit teď, Změnit, Zrušit / Odebrat
pripojNabidku((cil) => {
  const el = cil.closest('[data-pribeh]');
  const x = el && seznam().find((p) => p.id === el.dataset.pribeh);
  if (!x) return null;
  const z = plan(x.id);
  const pol = [];
  if (z && z.stav === 'ceka') {
    if (umiMotor('igKrok')) pol.push({ ikona: IKONY.odeslat, text: 'Zveřejnit teď', fn: () => ig.zverejnitTed('pribeh', x.id) });
    pol.push({ ikona: IKONY.kalendar, text: 'Změnit čas a zmínky…', fn: () => otevriNovy(x.id) });
    pol.push({ ikona: IKONY.zavrit, text: 'Zrušit příběh', oddel: true, fn: () => zrus(x.id) });
  } else if (!(z && (z.stav === 'nahrava' || z.stav === 'zverejnuji'))) {
    pol.push({ ikona: IKONY.smazat, text: 'Odebrat ze seznamu', fn: () => zrus(x.id) });
  }
  return pol.length ? { nadpis: 'Příběh z fotky', polozky: pol } : null;
});
