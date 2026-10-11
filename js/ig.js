// Instagram – průběh zveřejňování v aplikaci (reely i plakáty). Michal 11. 10.: „trvá to a nevidím, v jaké je to fázi …
// možnost postnout hned … přehled, v jaké je to fázi, jestli se to někde zaseklo“ (reel už na Instagramu byl a aplikace
// pořád ukazovala „vyjde …“ – brala stav z kopie serveru, která se obnovuje po půl hodině).
// - Když něco běží nebo má do 30 min vyjít, čte aplikace stav přímo z motoru (igStav jednou za minutu; běží-li, posouvá
//   zveřejnění sama akcí igKrok každých ~15 s) – jen při viditelné stránce Přehled, Reely nebo Plakáty. Spouštěč motoru
//   každých 10 minut zůstává záloha (naplánované vyjde i se zavřenou aplikací).
// - Přímé čtení přebije starší kopii ze serveru (ucet.primeCteni); změnil-li se stav (vyšlo, chyba), server kopii hned
//   obnoví i pro ostatní zařízení (ucet.zmenaOblasti).
// - Zveřejnit teď, Zkusit znovu, kroky s časy (js/ig_prubeh.js) a karta na Přehledu.

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej } from './api.js';
import * as ucet from './ucet.js';
import { esc } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, potvrd, hlavickaKarty } from './ui.js';
import { karta, registruj, hlavaKarty } from './bubliny.js';
import * as P from './ig_prubeh.js';

const KROK_PO = 15e3;     // běží nebo je na řadě: další krok motoru za 15 s
const CTENI_PO = 60e3;    // vyjde do 30 min: podívat se jednou za minutu
const ZASEK_PO = 60e3;    // zaseknuté (motor nic nového nehlásí): jednou za minutu
const PO_CHYBE = 60e3;    // motor neodpověděl: znovu za minutu
const PRVNI_PO = 1200;    // první čtení chvíli po vykreslení (start aplikace má přednost)
const STRANKY = ['dnes', 'reely', 'plakaty'];

// Druhy příspěvků – registrují je reely.js a plakaty.js (bez kruhových importů):
// typ 'reel' | 'plakat' → { klic: pole v igStav ('reely' | 'plakaty'), oblast: kopie na serveru, video, cil: stránka,
//   plan() → { id: položka } | null, nastav(plan, data) → true (uloženo v modulu) | false (modul data ještě nemá),
//   nazev(id) → text, ucet() → '@účet' }
const zdroje = {};
export function zdroj(typ, o) { zdroje[typ] = o; }

const s = {
  casovac: 0, bezi: false, dalsiPo: 0,
  cteni: null,   // poslední přímé čtení: { kdy (čas zařízení), ted (čas motoru), spoustec }
  zaloha: {},    // plán druhu, jehož modul data ještě nemá (plakáty před první návštěvou stránky)
  rucne: {}      // 'typ:id' → 'ted' | 'znovu' | 'krok' – právě odeslané klepnutí
};

/** Čas motoru (hodiny zařízení a Googlu se můžou lišit). */
function tedMotoru() { return s.cteni ? Date.now() - (s.cteni.kdy - s.cteni.ted) : Date.now(); }
const spoustec = () => (s.cteni ? s.cteni.spoustec : 0);

function planTypu(typ) {
  const zd = zdroje[typ];
  return (zd && zd.plan()) || s.zaloha[typ] || {};
}

function polozky() {
  const ven = [];
  Object.keys(zdroje).forEach((typ) => {
    const p = planTypu(typ);
    Object.keys(p).forEach((id) => { if (p[id] && typeof p[id] === 'object') ven.push({ typ, id, z: p[id] }); });
  });
  return ven;
}

/** Výsledek igStav / igKrok: plány obou druhů do modulů (a do zařízení), stav spouštěče. */
function prijmi(d) {
  if (!d || typeof d !== 'object' || !d.ted) return;
  s.cteni = { kdy: Date.now(), ted: Number(d.ted) || Date.now(), spoustec: Number(d.spoustec) || 0 };
  Object.keys(zdroje).forEach((typ) => {
    const zd = zdroje[typ];
    const novy = d[zd.klic];
    if (!novy || typeof novy !== 'object') return;
    const stary = planTypu(typ);
    const zmena = Object.keys(Object.assign({}, stary, novy)).some((id) => ((stary[id] || {}).stav || '') !== ((novy[id] || {}).stav || ''));
    if (zd.nastav(novy, d)) delete s.zaloha[typ]; else s.zaloha[typ] = novy;
    // přímo z motoru = čerstvější než kopie na serveru: starší kopie se už nepoužije; změnil-li se stav (vyšlo, chyba,
    // začalo), server kopii za chvíli obnoví – i pro ostatní zařízení
    if (zmena) ucet.zmenaOblasti([zd.oblast]); else ucet.primeCteni(zd.oblast);
  });
  zmeneno();
}

// ---------------------------------------------------------------- sledování (přímé čtení z motoru)

/** Co se má od motoru chtít a kdy: { akce: 'igKrok' | 'igStav', typ, id, za (ms) } nebo null. */
function coDal() {
  if (!umiMotor('igStav') || document.visibilityState !== 'visible' || STRANKY.indexOf(stav.pohled) < 0) return null;
  if (Object.keys(s.rucne).length) return null; // běží klepnutí (Zveřejnit teď…) – po něm se naplánuje znovu
  const ted = tedMotoru();
  let krok = null, cteni = false;
  polozky().forEach((x) => {
    const sl = P.sledovani(x.z, ted);
    if (sl === 'krok' && (!krok || (x.z.kdy || 0) < (krok.z.kdy || 0))) krok = x;
    if (sl) cteni = true;
  });
  if (!cteni) return null;
  const posun = krok && umiMotor('igKrok');
  const po = posun ? (P.zasek(krok.z, ted, spoustec(), zdroje[krok.typ].video) ? ZASEK_PO : KROK_PO) : CTENI_PO;
  const za = Math.max(PRVNI_PO, s.dalsiPo - Date.now(), s.cteni ? po - (Date.now() - s.cteni.kdy) : 0);
  return posun ? { akce: 'igKrok', typ: krok.typ, id: krok.id, za } : { akce: 'igStav', za };
}

/** Volá se při každém překreslení (reely.dotahni): naplánuje další přímé čtení, když je co sledovat. */
export function hlidej() {
  if (s.casovac || s.bezi) return;
  const co = coDal();
  if (co) s.casovac = setTimeout(() => { s.casovac = 0; sleduj(); }, co.za);
}

async function sleduj() {
  const co = coDal();
  if (!co || s.bezi) return;
  s.bezi = true;
  try {
    prijmi(co.akce === 'igKrok' ? await volej('igKrok', { typ: co.typ, id: co.id }) : await volej('igStav'));
    s.dalsiPo = 0;
  } catch (e) {
    s.dalsiPo = Date.now() + PO_CHYBE; // motor neodpověděl nebo krok nejde – za minutu znovu (žádné opakování v kruhu)
    // krok nešel (třeba plán mezitím zrušený na jiném zařízení – v zařízení zůstal starý) → aspoň čerstvý stav z motoru
    if (co.akce === 'igKrok' && e && e.kod === 'motor') { try { prijmi(await volej('igStav')); } catch (e2) { /* příště */ } }
  } finally {
    s.bezi = false;
    hlidej();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') hlidej();
  else { clearTimeout(s.casovac); s.casovac = 0; }
});

// ---------------------------------------------------------------- Zveřejnit teď, Zkusit znovu

/** jak: 'ted' (Zveřejnit teď), 'znovu' (Zkusit znovu / Nahrát znovu), 'krok' (Pokračovat). */
export async function hned(typ, id, jak) {
  const klic = typ + ':' + id;
  if (s.rucne[klic]) return;
  s.rucne[klic] = jak;
  zmeneno();
  try {
    prijmi(await volej('igKrok', Object.assign({ typ, id }, jak === 'ted' || jak === 'znovu' ? { [jak]: true } : {})));
  } catch (e) {
    toast(e.message, true);
    if (e && e.kod === 'motor') { try { prijmi(await volej('igStav')); } catch (e2) { /* stav příště */ } }
  } finally {
    delete s.rucne[klic];
    zmeneno();
  }
}

export const pracuje = (typ, id) => !!s.rucne[typ + ':' + id];

/** Klíč pro překreslení části stránky s průběhem (plakáty překreslují kartu Instagramu jen při změně klíče): klepnutí,
 *  nové čtení z motoru a každá minuta („kontrola před 3 min“). Prázdný, když se průběh neukazuje. */
export function klic(typ, id) {
  const z = planTypu(typ)[id];
  if (!z || !P.ukazatKroky(z, tedMotoru())) return '';
  return [pracuje(typ, id) ? 1 : 0, s.cteni ? s.cteni.kdy : 0, Math.floor(Date.now() / 60e3)].join('|');
}

/** Tlačítko Zveřejnit teď (u naplánovaného; u nového je v okně plánu). */
export function tlacitkoTedHtml(typ, id, trida) {
  if (!umiMotor('igKrok')) return '';
  const p = pracuje(typ, id);
  return '<button type="button" class="btn ' + (trida || 'btn--plan') + '" data-ig-akce="ted" data-ig-typ="' + esc(typ) + '" data-ig-id="' + esc(id) + '"' +
    (p ? ' disabled' : '') + '>' + IKONY.odeslat + '<span>' + (p ? 'Zveřejňuji…' : 'Zveřejnit teď') + '</span></button>';
}

function akceHtml(typ, id, zas) {
  if (!zas || !zas.akce || !umiMotor('igKrok')) return '';
  const p = pracuje(typ, id);
  return '<button type="button" class="btn btn--sm ' + (zas.chyba ? 'btn--oranz' : 'btn--plan') + '" data-ig-akce="' + zas.akce + '" data-ig-typ="' + esc(typ) +
    '" data-ig-id="' + esc(id) + '"' + (p ? ' disabled' : '') + '>' + IKONY.obnovit + '<span>' + (p ? 'Posílám…' : esc(zas.tlacitko)) + '</span></button>';
}

/** Klepnutí na tlačítka průběhu (z reely.klikReely – volá se pro každé klepnutí). */
export function klikIg(el) {
  const akce = el.dataset.igAkce;
  if (!akce) return false;
  const typ = el.dataset.igTyp, id = el.dataset.igId;
  if (!zdroje[typ] || !id) return true;
  if (akce === 'ted') zverejnitTed(typ, id);
  else hned(typ, id, akce);
  return true;
}

/** Zveřejnit teď naplánovaný příspěvek (tlačítko i nabídka na pravém tlačítku): s potvrzením, pak hned. */
export function zverejnitTed(typ, id) {
  const zd = zdroje[typ];
  if (!zd || !umiMotor('igKrok')) return;
  const z = planTypu(typ)[id] || {};
  potvrd('Zveřejnit hned?', { ikona: IKONY.instagram, ton: 'ok', text: zd.nazev(id) + ' – na ' + zd.ucet() + ' teď' + (z.pribeh ? ', i do příběhu' : '') +
    ', bez čekání na naplánovaný čas.', ano: 'Zveřejnit teď', ne: 'Počkat' }).then((ano) => { if (ano) hned(typ, id, 'ted'); });
}

// ---------------------------------------------------------------- vyjetá karta u stavu na Instagramu (Michal 11. 10.: najetí
// na štítek „vyjde …“ / „zveřejňuje se“ / „na Instagramu“ ukáže kroky s časy – poslední krok průběhu, bez rozklikávání)

/** Atributy štítku stavu (reel, plakát): karta s průběhem. */
export function stavKartaAtr(typ, id) { return karta('ig', false, typ + ':' + id); }

registruj('ig', (el) => {
  const kl = String(el.dataset.kartaKlic || '');
  const i = kl.indexOf(':');
  const typ = kl.slice(0, i), id = kl.slice(i + 1);
  const zd = zdroje[typ];
  const z = zd && planTypu(typ)[id];
  if (!z || typeof z !== 'object') return '';
  const ted = tedMotoru();
  const sh = P.souhrn(z, { ted, video: zd.video });
  const zas = P.zasek(z, ted, spoustec(), zd.video);
  const hotovo = z.stav === 'hotovo';
  const nazev = hotovo ? 'Na Instagramu' : zas && zas.chyba ? 'Nepovedlo se' : P.ceka(z) ? 'Naplánováno' : sh.krok.nazev;
  const veta = hotovo ? 'vyšlo ' + P.casKratce(sh.krok.cas || P.konec(z), ted) + (z.pribehChyba ? ' · příběh nevyšel' : z.mediaPribeh ? ' · i v příběhu' : '')
    : zas ? zas.duvod : [sh.krok.popis, P.infoText(z, ted)].filter(Boolean).join(' · ');
  return hlavaKarty('<span class="bk-ikona bk-ikona--ig">' + IKONY.instagram + '</span>', zd.nazev(id) + ' · ' + zd.ucet(), esc(nazev), esc(veta),
    hotovo ? '' : '<span class="bk-poradi cisla">' + sh.poradi + '/' + sh.celkem + '</span>') +
    '<div class="bk-oddil">' + P.krokyHtml(z, { ted, video: zd.video }) + '</div>';
});

// ---------------------------------------------------------------- zobrazení

/** Kroky s časy pod reelem / v kartě Instagramu u plakátu (nic, když není co ukázat nebo jde o starší motor bez kroků). */
export function prubehHtml(typ, id, z) {
  const zd = zdroje[typ];
  if (!zd || !z) return '';
  const ted = tedMotoru();
  if (!P.ukazatKroky(z, ted) || (!z.kroky && !umiMotor('igStav'))) return '';
  const zas = P.zasek(z, ted, spoustec(), zd.video);
  let h = '<div class="ig-prubeh' + (zas ? ' ig-prubeh--zasek' : '') + '" data-ig-prubeh="' + esc(typ + ':' + id) + '">' + P.krokyHtml(z, { ted, video: zd.video });
  const info = P.infoText(z, ted);
  const cteno = s.cteni && (P.ceka(z) || P.rozpracovana(z)) ? 'stav z motoru ' + P.predChvili(Date.now() - s.cteni.kdy) : '';
  if (info || cteno) h += '<p class="ig-prubeh__info">' + esc([info, cteno].filter(Boolean).join(' · ')) + '</p>';
  if (zas && !(zas.chyba && z.stav === 'chyba' && !umiMotor('igKrok'))) {
    h += '<div class="ig-zasek' + (zas.chyba ? ' ig-zasek--chyba' : '') + '" role="status">' + IKONY.pozor + '<span>' + esc(zas.duvod) + '</span>' + akceHtml(typ, id, zas) + '</div>';
  }
  if ((P.ceka(z) || P.rozpracovana(z)) && P.spoustecNebezi(spoustec(), ted)) {
    h += '<p class="ig-prubeh__spoustec">' + IKONY.pozor + '<span>Spouštěč motoru naposledy běžel ' + esc(P.predChvili(ted - spoustec())) +
      ' – naplánované příspěvky teď vyjdou, jen když je aplikace otevřená. Zkontroluj spouštěč instagramKazdych10Min v editoru motoru.</span></p>';
  }
  return h + '</div>';
}

/** Karta Instagramu na Přehledu (stručně): to nejdůležitější – chyba / zaseknuté, běží, vyjde do 2 h, vyšlo před chvílí. */
export function kartaHtml() {
  if (!umiMotor('igStav')) return '';
  const ted = tedMotoru();
  const vyber = polozky().map((x) => Object.assign(x, { vaha: P.naPrehled(x.z, ted) + (P.zasek(x.z, ted, spoustec(), zdroje[x.typ].video) ? 10 : 0) }))
    .filter((x) => x.vaha && (x.z.kroky || P.ceka(x.z) || P.rozpracovana(x.z)))
    .sort((a, b) => b.vaha - a.vaha || (a.z.kdy || 0) - (b.z.kdy || 0));
  if (!vyber.length) return '';
  const x = vyber[0], zd = zdroje[x.typ];
  const sh = P.souhrn(x.z, { ted, video: zd.video });
  const zas = P.zasek(x.z, ted, spoustec(), zd.video);
  const hotovo = x.z.stav === 'hotovo';
  // u chyby název kroku, který se nepovedl, do popisu – nahoře jasně „Nepovedlo se“
  const popis = zas ? (zas.chyba ? sh.krok.nazev + ': ' : '') + zas.duvod
    : hotovo ? 'vyšlo ' + P.casKratce(sh.krok.cas || P.konec(x.z), ted) + (x.z.pribehChyba ? ' · příběh nevyšel' : x.z.mediaPribeh ? ' · i v příběhu' : '')
      : [sh.krok.popis, P.infoText(x.z, ted)].filter(Boolean).join(' · ');
  const nazevKroku = hotovo ? 'Na Instagramu' : zas && zas.chyba ? 'Nepovedlo se' : zas && zas.akce === 'ted' ? 'Zveřejnění nezačalo'
    : zas ? 'Zaseklo se – ' + sh.krok.nazev.toLowerCase() : sh.krok.nazev;
  let akce = '';
  if (hotovo && /^https:\/\//.test(x.z.odkaz || '')) akce = '<a class="btn btn--ghost btn--sm" href="' + esc(x.z.odkaz) + '" target="_blank" rel="noopener noreferrer">' + IKONY.odkaz + '<span>Na Instagramu</span></a>';
  else if (zas) akce = akceHtml(x.typ, x.id, zas);
  else if (P.ceka(x.z)) akce = tlacitkoTedHtml(x.typ, x.id, 'btn--plan btn--sm');
  return '<section class="card ig-karta' + (zas ? ' ig-karta--zasek' : hotovo ? ' ig-karta--hotovo' : '') + '" data-oblast="fotbal">' +
    hlavickaKarty(IKONY.instagram, 'Instagram' + (vyber.length > 1 ? ' · ' + vyber.length : ''),
      '<button type="button" class="ig-karta__sipka" data-cil="' + esc(zd.cil) + '" aria-label="Otevřít">' + IKONY.sipka + '</button>') +
    '<div class="ig-karta__telo"><b class="ig-karta__nazev">' + esc(zd.nazev(x.id)) + '</b>' +
      '<div class="ig-karta__krok"><span class="ig-karta__stav ig-karta__stav--' + esc(zas && !zas.chyba ? 'zasek' : sh.krok.stav) + '">' + esc(nazevKroku) + '</span>' +
        P.teckyHtml(sh.kroky) + '<span class="ig-karta__poradi cisla">' + (hotovo ? '' : sh.poradi + '/' + sh.celkem) + '</span></div>' +
      (popis ? '<small class="ig-karta__popis">' + esc(popis) + '</small>' : '') +
      (akce ? '<div class="ig-karta__akce">' + akce + '</div>' : '') +
    '</div></section>';
}
