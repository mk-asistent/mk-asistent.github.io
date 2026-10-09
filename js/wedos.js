// Pracovní schránka přímo z WEDOS – klientská část. Poštu čte a odesílá server Firebase (firebase/functions/wedos.js,
// IMAP + SMTP, heslo jen v Secret Manageru); aplikace má jen kopii data/wedos (konverzace ve stejném tvaru jako pošta
// z motoru: stav, důvod, náhled…), detaily wedosDetaily/{id} a akce přes funkci wedos.
// Fáze 1: nastavení v Nastavení → Pošta („Pracovní schránka přímo (WEDOS)“).
// Fáze 2: Pošta (posta.js) bere účet „Pracovní“ odsud místo z Gmailu – seznam (zpravy), detail, přečteno, Hotovo
// (archiv), Vrátit, odpověď a nový e-mail (odeslat), počty na Dnes; malé háčky v posta.js označené „WEDOS“.
// Obnova: při otevření aplikace a návratu do ní (kopie starší 4 min), tlačítkem Obnovit a živě s kopiemi ze serveru.
// Bez účtu Firebase (a v ukázce) je vypnuto – motor pracovní poštu přímo nečte.

import { stav, zmeneno } from './stav.js';
import { jeDemo } from './api.js';
import { esc, kdyKratce, uloziste } from './pomocne.js';
import { obnovPanel, jeOtevreny, elementPanelu } from './panely.js';
import { toast, potvrd } from './ui.js';
import { IKONY } from './ikony.js';
import * as ucet from './ucet.js';

export const VYCHOZI = { imap: 'wes1-imap.wedos.net', smtp: 'wes1-smtp.wedos.net' };
const SERVER = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?\.wedos\.net$/;   // jako pravidla Firestore – heslo jen na servery WEDOS
const ADRESA = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const ID = /^w[0-9a-f]{15}$/;     // id konverzace / zprávy WEDOS (Gmail má id jen z číslic a a–f, PC „pc-…“)
const OBNOVIT_PO = 4 * 60e3;      // starší kopie → při otevření požádat server o čerstvou (jako ucet.obnovStare)
const NEJDRIV_ZNOVU = 60e3;       // automaticky nejvýš jednou za minutu (ruční Obnovit kdykoli)
const DETAIL_PLATI = 5 * 60e3;    // detail v paměti zařízení

const w = { nastaveni: undefined, nacita: null, nactenoKdy: 0, obnovuje: false, chyba: '', naposledy: 0, otisk: '', posluchaci: [], detaily: {},
  pracuje: false, startObnovy: false, bezi: {} };

// ---------------------------------------------------------------- nastavení (uzivatele/{uid}.wedos)

/** { adresa, imap, smtp, jmeno } | null (vypnuto) | undefined (ještě nenačteno). */
export function nastaveni() { return w.nastaveni; }

/**
 * Pracovní schránka je zapnutá: účet přihlášený a v něm adresa WEDOS. Než se nastavení z účtu načte (pár set ms po
 * startu), rozhoduje kopie ze serveru – ta existuje jen se zapnutou schránkou (vypnutí ji smaže).
 */
export function zapnuto() {
  if (!ucet.prihlasen()) return false;
  if (w.nastaveni !== undefined) return !!(w.nastaveni && w.nastaveni.adresa);
  return !!kopie();
}

/** Pracovní adresa WEDOS (z nastavení, jinak z kopie) – odesílá se z ní. */
export function pracovniAdresa() {
  const k = kopie();
  return (w.nastaveni && w.nastaveni.adresa) || (k && k.data && k.data.pracovniAdresa) || '';
}

/** Je to konverzace (nebo zpráva) z pracovní schránky WEDOS? */
export function jeWedos(id) { return ID.test(String(id || '')); }

/** Nastavení z účtu (jednou, znovu = načíst znovu). */
export function nactiNastaveni(znovu) {
  if (!ucet.prihlasen()) { w.nastaveni = undefined; return Promise.resolve(null); }
  if (w.nacita) return w.nacita;
  if (w.nastaveni !== undefined && !znovu) return Promise.resolve(w.nastaveni);
  w.nactenoKdy = Date.now();
  w.nacita = ucet.ctiZUctu()
    .then((d) => { w.nastaveni = d && d.wedos && d.wedos.adresa ? d.wedos : null; w.chyba = ''; return w.nastaveni; })
    // bez sítě: zůstane nenačtené (rozhoduje kopie), znovu nejdřív za 30 s – ne při každém překreslení
    .catch((e) => { w.chyba = 'Nastavení pracovní schránky se nenačetlo (' + e.message + ').'; return w.nastaveni; })
    .finally(() => { w.nacita = null; });
  return w.nacita;
}

/** Kontrola a uložení do účtu; pak hned první spojení se schránkou. Vrací výsledek obnovy, chyby česky. */
export async function ulozNastaveni(n) {
  const adresa = String(n.adresa || '').trim().toLowerCase();
  const imap = String(n.imap || VYCHOZI.imap).trim().toLowerCase();
  const smtp = String(n.smtp || VYCHOZI.smtp).trim().toLowerCase();
  const jmeno = String(n.jmeno || '').replace(/[\u0000-\u001f"<>\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!ADRESA.test(adresa) || adresa.length > 120) throw new Error('Napiš celou pracovní adresu (jmeno@firma.cz).');
  if (!SERVER.test(imap) || !SERVER.test(smtp)) throw new Error('Servery musí být WEDOS (…wedos.net) – heslo nesmí jít nikam jinam.');
  const nova = { adresa, imap, smtp, jmeno };
  await ucet.ulozDoUctu({ wedos: nova });
  w.nastaveni = nova;
  w.detaily = {};
  zmeneno();
  return obnov(true);
}

/** Vypnout: nastavení z účtu pryč, server smaže kopii, detaily i svůj stav (heslo v Secret Manageru zůstává). */
export async function vypnout() {
  await ucet.ulozDoUctu({ wedos: null });
  w.nastaveni = null;
  w.detaily = {};
  w.chyba = '';
  zmeneno();
  try { await ucet.zavolej('wedos', { akce: 'vypnout' }); } catch (e) { /* kopie zmizí i tak – server už schránku nečte */ }
}

// ---------------------------------------------------------------- kopie ze serveru (data/wedos)

/** { data: { pracovni, pracovniAdresa, pocty, slozky, chyba, ted }, kdy, potvrzeno } nebo null. */
export function kopie() { return ucet.zapnuty() ? ucet.kopieServeru('wedos') : null; }

/**
 * Konverzace pracovní schránky ve tvaru pošty z motoru (ucet: 'pracovni', zdroj: 'wedos'), nejnovější nahoře.
 * Pořád totéž pole, dokud server nepošle novou kopii – Pošta do něj smí rovnou zapisovat (přečteno, pryč po Hotovo),
 * jako do stav.posta; nová kopie ze serveru pak platí celá.
 */
export function zpravy() {
  const k = kopie();
  const seznam = k && k.data && Array.isArray(k.data.pracovni) ? k.data.pracovni : [];
  seznam.forEach((m) => { m.ucet = 'pracovni'; m.zdroj = 'wedos'; });
  return seznam;
}

/** Pro Nastavení a Poštu: { zapnuto, kdy (server naposledy ověřil), chyba, konverzaci, neprectene, obnovuje }. */
export function stavSpojeni() {
  const k = kopie();
  const d = (k && k.data) || {};
  return { zapnuto: zapnuto(), kdy: k ? (k.potvrzeno || k.kdy) : 0, chyba: (d.chyba && d.chyba.text) || '', druhChyby: (d.chyba && d.chyba.druh) || '',
    konverzaci: (d.pocty && d.pocty.konverzaci) || 0, neprectene: (d.pocty && d.pocty.neprectene) || 0, obnovuje: w.obnovuje, mistniChyba: w.chyba };
}

/** fn() – kopie pracovní pošty se změnila (server ji obnovil, akce). Aplikace se překreslí sama (zmeneno). */
export function naZmenu(fn) { w.posluchaci.push(fn); }
function oznam() { w.posluchaci.forEach((fn) => { try { fn(); } catch (e) { /* další posluchač */ } }); }

// změny kopie chodí živě s ostatními kopiemi (ucet.js odebírá celou kolekci data); nastavení se načte po přihlášení
ucet.naStav(() => {
  if (!ucet.prihlasen()) { w.nastaveni = undefined; w.detaily = {}; w.startObnovy = false; } // odhlášení – jiný účet má jiné nastavení
  else if (w.nastaveni === undefined && !w.nacita && Date.now() - w.nactenoKdy > 30e3) nactiNastaveni().then(() => { oznam(); zmeneno(); });
  const k = ucet.kopieServeru('wedos');
  const o = k ? k.otisk + ':' + k.potvrzeno : '';
  if (o !== w.otisk) {
    const zmenaObsahu = !k || !w.otisk || w.otisk.split(':')[0] !== k.otisk;
    w.otisk = o;
    if (zmenaObsahu) { w.detaily = {}; zmeneno(); }
    oznam();
  }
  // první kopie po otevření aplikace: starší než 4 minuty → server ať se podívá do schránky
  if (!w.startObnovy && zapnuto()) { w.startObnovy = true; obnovStare(); }
});

// návrat do aplikace a tlačítko Obnovit (app.js obnovVse) – pracovní poštu obnovuje server přes funkci wedos
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') obnovStare(); });
document.addEventListener('click', (e) => {
  if (e.target && e.target.closest && e.target.closest('[data-obnovit]') && zapnuto() && !w.obnovuje) obnov(false).catch(() => { /* chyba je v kopii */ });
});

// ---------------------------------------------------------------- akce přes server (funkce wedos)

async function zavolej(data) {
  try {
    return await ucet.zavolej('wedos', data);
  } catch (e) {
    // chyby ze serveru jsou česky (HttpsError); síť a ostatní srozumitelně
    const kod = String((e && e.code) || '');
    if (/unavailable|deadline|internal/.test(kod) && !/[áčďéěíňóřšťúůýž]/i.test(e.message || '')) throw new Error('Server pracovní pošty teď neodpovídá – zkus to za chvíli.');
    throw e;
  }
}

/** Obnova na serveru (vynutit = i když se ve schránce nic nezměnilo). Výsledek přijde i živě přes kopii. */
export async function obnov(vynutit) {
  if (!zapnuto()) return null;
  w.obnovuje = true;
  w.naposledy = Date.now();
  prekresliNastaveni();
  try {
    const r = await zavolej({ akce: 'obnov', vynutit: !!vynutit });
    w.chyba = '';
    return r;
  } catch (e) {
    w.chyba = e.message;
    throw e;
  } finally {
    w.obnovuje = false;
    prekresliNastaveni();
  }
}

/** Otevření aplikace / návrat: kopie starší než 4 minuty → požádat server (potichu, nejvýš jednou za minutu). */
export function obnovStare() {
  if (!zapnuto() || w.obnovuje || Date.now() - w.naposledy < NEJDRIV_ZNOVU) return;
  const k = kopie();
  if (!k || Date.now() - (k.potvrzeno || k.kdy || 0) > OBNOVIT_PO) obnov(false).catch(() => { /* chyba je v kopii a v Nastavení */ });
}

/**
 * Detail konverzace (tvar motoru nactiVlakno_): z paměti, z wedosDetaily (server je chystá předem), jinak ze schránky.
 * volby: kdy (čas poslední zprávy podle seznamu – starší detail se nepoužije), precist (otevřením přečteno), znovu.
 */
export async function detail(id, volby) {
  const o = volby || {};
  const sedi = (d) => !!(d && Array.isArray(d.zpravy) && (!o.kdy || (d.zpravy.length && d.zpravy[d.zpravy.length - 1].kdy === o.kdy)));
  const ulozeny = w.detaily[id];
  let d = ulozeny && !o.znovu && Date.now() - ulozeny.kdy < DETAIL_PLATI && sedi(ulozeny.data) ? ulozeny.data : null;
  if (!d && !o.znovu) {
    const doc = await ucet.ctiZUctu('wedosDetaily', id).catch(() => null);
    if (doc && typeof doc.json === 'string') { try { d = JSON.parse(doc.json); } catch (e) { d = null; } }
    if (!sedi(d)) d = null;
  }
  if (d) { if (o.precist) oznacit(id, 'prectene').catch(() => { /* přečtení se dožene příště */ }); }
  else d = (await zavolej({ akce: 'detail', id, precist: !!o.precist })).detail;
  w.detaily[id] = { data: d, kdy: Date.now() };
  return d;
}

/** Akce nad konverzací: precteno { id | ids, precteno }, archivovat { id }, smazat { id }, vratit { id }. */
export function akce(nazev, data) {
  if (['precteno', 'archivovat', 'smazat', 'vratit'].indexOf(nazev) < 0) return Promise.reject(new Error('Neznámá akce.'));
  if (nazev !== 'precteno') delete w.detaily[data && data.id];
  return zavolej(Object.assign({}, data, { akce: nazev }));
}

/**
 * Akce z Pošty jako motor („oznacit“): archivovat (Hotovo), smazat, prectene, neprectene, vratit. Vrátit počká, až
 * doběhne přesun téže konverzace (jinak by server vracel něco, co ještě nepřesunul).
 */
export function oznacit(id, jak) {
  if (jak === 'archivovat' || jak === 'smazat') {
    const p = akce(jak, { id });
    w.bezi[id] = p.catch(() => null);
    return p;
  }
  if (jak === 'vratit') return Promise.resolve(w.bezi[id]).then(() => akce('vratit', { id }));
  if (jak === 'prectene' || jak === 'neprectene') return akce('precteno', { id, precteno: jak === 'prectene' });
  return Promise.reject(new Error('U pracovní pošty WEDOS tohle z aplikace nejde.'));
}

/** „Označit vše jako přečtené“ v Aktualizacích: i nepřečtené rozesílky pracovní pošty (jedním voláním). Vrací počet. */
export async function prectiAktualizace() {
  if (!zapnuto()) return 0;
  const nep = zpravy().filter((m) => m.aktualizace && m.neprectena);
  if (!nep.length) return 0;
  await akce('precteno', { ids: nep.map((m) => m.id).slice(0, 100), precteno: true });
  nep.forEach((m) => { m.neprectena = false; });
  return nep.length;
}

/** Odeslání z pracovní adresy: { rezim: odpoved|vsem|preposlat|novy, id (zprávy), komu, predmet, text, idOdeslani }. */
export function odeslat(data) {
  return zavolej(Object.assign({}, data, { akce: 'odeslat' }));
}

// ---------------------------------------------------------------- pro Poštu: pruh s chybou a prázdná pracovní pošta

/** Pruh nad seznamem, když se pracovní schránka naposledy nenačetla (špatné heslo, server). */
export function pruhHtml() {
  if (!zapnuto()) return '';
  const s = stavSpojeni();
  if (!s.chyba) return '';
  return '<p class="pruh pruh-varovani">Pracovní pošta: ' + esc(s.chyba) + (s.kdy ? ' Ukazuju naposledy načtenou (' + esc(kdyKratce(s.kdy)) + ').' : '') + '</p>';
}

/** Účet Pracovní bez konverzací: proč (chyba, první načtení, prázdná Doručená); '' = jen prázdný filtr. */
export function prazdnaHtml() {
  const s = stavSpojeni();
  let nadpis, text;
  if (s.chyba && !zpravy().length) { nadpis = 'Pracovní schránku se nepodařilo načíst'; text = s.chyba; }
  else if (!kopie()) { nadpis = 'Čekám na první načtení pracovní schránky'; text = 'Server se k ní připojí do pár minut, nebo hned po Synchronizovat teď v Nastavení → Pošta.'; }
  else if (!zpravy().length) { nadpis = 'Za 30 dní nic v Doručené'; text = 'Pracovní schránka ' + pracovniAdresa() + ' nemá v Doručené nic novějšího (vyřízené jsou v archivu).'; }
  else return '';
  return '<div class="card posta-prace-prazdna">' + IKONY.posta + '<div><b>' + esc(nadpis) + '</b><p>' + esc(text) + '</p>' +
    '<button type="button" class="btn btn--ghost btn--sm" data-otevri-nastaveni="posta">' + IKONY.nastaveni + '<span>Nastavení pošty</span></button></div></div>';
}

// ---------------------------------------------------------------- Nastavení → Pošta: „Pracovní schránka přímo (WEDOS)“

function prekresliNastaveni() {
  const el = elementPanelu('nastaveni');
  // ne když se zrovna píše do pole (překreslení by ho smazalo)
  if (jeOtevreny('nastaveni') && el && el.querySelector('[data-sekce="posta"]') && !(el.contains(document.activeElement) && document.activeElement.matches('input, textarea'))) {
    obnovPanel('nastaveni');
  }
}

function stavHtml() {
  const s = stavSpojeni();
  if (s.obnovuje) return '<p class="nast-stav"><i></i>Spojuji se se schránkou…</p>';
  if (s.chyba) return '<p class="nast-stav chyba"><i></i>' + esc(s.chyba) + '</p>';
  if (s.mistniChyba) return '<p class="nast-stav chyba"><i></i>' + esc(s.mistniChyba) + '</p>';
  if (!s.kdy) return '<p class="nast-stav"><i></i>Čeká na první spojení se schránkou (heslo musí být uložené na serveru – návod níž).</p>';
  return '<p class="nast-stav ok"><i></i>Připojeno · synchronizováno ' + esc(kdyKratce(s.kdy)) + ' · ' + s.konverzaci + ' ' +
    (s.konverzaci >= 1 && s.konverzaci <= 4 ? 'konverzace' : 'konverzací') + ', nepřečtené ' + s.neprectene + '</p>';
}

function navodHtml() {
  return '<details class="napoveda" data-wedos-navod><summary>Heslo k pracovní schránce (jednou, na počítači)</summary><ol class="kroky">' +
    '<li>Heslo se do aplikace nezadává – leží jen na serveru v Google Secret Manageru (ne v databázi ani v kódu).</li>' +
    '<li>Na počítači v terminálu: <code>npx -y firebase-tools functions:secrets:set WEDOS_HESLO --project asistent-michal</code> → vlož heslo ' +
    'k pracovní schránce (vidíš ho jen ty) a potvrď.</li>' +
    '<li>Pak nasadit funkce (udělá Claude – firebase/NASAZENI.md); teprve nové nasazení heslo funkcím předá.</li>' +
    '<li>Změna hesla = stejný příkaz znovu a nové nasazení. Při špatném heslu server zkouší přihlášení jen občas (15 min, 30 min, 1 h…).</li></ol></details>';
}

/** Oddíl do Nastavení → Pošta (vkládá ho nastaveni.js sekcePosty). */
export function nastaveniHtml() {
  let h = '<h3>Pracovní schránka přímo (WEDOS)</h3><p class="napoveda">Server aplikace se k pracovní poště přihlásí sám – čte Doručené ' +
    'a Odeslané (IMAP) a odesílá z pracovní adresy (SMTP) – bez přeposílání do Gmailu. Zapnutá schránka je v Poště účet Pracovní ' +
    '(seznam, odpovědi, Hotovo i počty na Dnes).</p>';
  if (!ucet.nastaveno() || jeDemo()) return '';
  if (!ucet.prihlasen()) return h + '<p class="nast-stav"><i></i>Potřebuje účet – přihlas ho v záložce Připojení.</p>';
  if (w.nastaveni === undefined && !w.chyba) {
    if (!w.nacita && Date.now() - w.nactenoKdy > 30e3) nactiNastaveni().then(prekresliNastaveni);
    return h + '<p class="nast-stav"><i></i>Načítám nastavení…</p>';
  }
  // změna z jiného zařízení: po minutě potichu načíst znovu (překreslí se jen při změně)
  if (!w.nacita && !w.pracuje && Date.now() - w.nactenoKdy > 60e3) {
    const pred = JSON.stringify(w.nastaveni);
    nactiNastaveni(true).then(() => { if (JSON.stringify(w.nastaveni) !== pred) prekresliNastaveni(); });
  }
  const n = w.nastaveni || {};
  const p = (stav.info && stav.info.posta) || {};
  const adresa = n.adresa || p.pracovniAdresa || '';
  const jmeno = n.jmeno || uloziste.cti('asistent.jmeno') || '';
  h += w.nastaveni ? stavHtml() : w.chyba ? '<p class="nast-stav chyba"><i></i>' + esc(w.chyba) + '</p>'
    : '<p class="nast-stav"><i></i>Vypnuto' + (adresa ? ' – adresu jsem předvyplnil z pracovní pošty' : '') + '.</p>';
  h += '<div class="fmr">' +
    '<label><span class="label">Adresa (přihlašovací jméno)</span><input class="field" data-wedos-adresa type="email" inputmode="email" autocomplete="off" ' +
      'autocapitalize="off" spellcheck="false" placeholder="jmeno@firma.cz" value="' + esc(adresa) + '"></label>' +
    '<label><span class="label">Jméno odesílatele</span><input class="field" data-wedos-jmeno type="text" autocomplete="off" placeholder="Jméno Příjmení" value="' +
      esc(jmeno) + '"></label>' +
    '<label><span class="label">Server IMAP (čtení, port 993)</span><input class="field" data-wedos-imap type="text" autocomplete="off" autocapitalize="off" ' +
      'spellcheck="false" value="' + esc(n.imap || VYCHOZI.imap) + '"></label>' +
    '<label><span class="label">Server SMTP (odesílání, port 465)</span><input class="field" data-wedos-smtp type="text" autocomplete="off" autocapitalize="off" ' +
      'spellcheck="false" value="' + esc(n.smtp || VYCHOZI.smtp) + '"></label></div>';
  h += '<div class="akce">' + (w.nastaveni
    ? '<button type="button" class="btn btn--ghost btn--sm" data-wedos="obnovit"' + (w.obnovuje || w.pracuje ? ' disabled' : '') + '>Synchronizovat teď</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-wedos="vypnout"' + (w.pracuje ? ' disabled' : '') + '>Vypnout</button>' +
      '<button type="button" class="btn btn--primary btn--sm" data-wedos="ulozit"' + (w.pracuje ? ' disabled' : '') + '>Uložit a vyzkoušet</button>'
    : '<button type="button" class="btn btn--primary btn--sm" data-wedos="ulozit"' + (w.pracuje ? ' disabled' : '') + '>Zapnout a vyzkoušet</button>') + '</div>';
  return h + navodHtml();
}

async function klikWedos(el) {
  const akceTl = el.dataset.wedos;
  const panel = elementPanelu('nastaveni');
  if (!panel || w.pracuje) return;
  const hodnota = (k) => { const x = panel.querySelector('[data-wedos-' + k + ']'); return x ? x.value : ''; };
  if (akceTl === 'ulozit') {
    w.pracuje = true;
    el.disabled = true;
    try {
      await ulozNastaveni({ adresa: hodnota('adresa'), jmeno: hodnota('jmeno'), imap: hodnota('imap'), smtp: hodnota('smtp') });
      const s = stavSpojeni();
      toast(s.chyba ? s.chyba : 'Pracovní schránka připojená ✓', !!s.chyba);
    } catch (e) {
      toast(e.message, true);
    } finally {
      w.pracuje = false;
      prekresliNastaveni();
    }
    return;
  }
  if (akceTl === 'obnovit') {
    el.disabled = true;
    obnov(true).then(() => toast('Pracovní pošta synchronizovaná ✓')).catch((e) => toast(e.message, true));
    return;
  }
  if (akceTl === 'vypnout') {
    const ano = await potvrd('Vypnout pracovní schránku?', { text: 'Server ji přestane číst a smaže svou kopii. Pošta ve schránce WEDOS zůstává; heslo na serveru taky (smaže ho příkaz v NASAZENI.md).', ano: 'Vypnout' });
    if (!ano) return;
    w.pracuje = true;
    try {
      await vypnout();
      toast('Pracovní schránka vypnutá');
    } catch (e) {
      toast(e.message, true);
    } finally {
      w.pracuje = false;
      prekresliNastaveni();
    }
  }
}

document.addEventListener('click', (e) => {
  const el = e.target && e.target.closest ? e.target.closest('[data-wedos]') : null;
  if (el && !el.disabled && el.closest('[data-panel="nastaveni"]')) klikWedos(el);
});
