// Tréninky (Michal 16. 11.: „chtěl bych si to v Asistentovi uložit a pak z toho dělat takovou vlastní studnici nápadů na tréninky“).
// Cviky z reelů (chat „Tréninky video“, zkratka Do tréninků): karty píše Claude do CLAUDE_SCHRANKA/TRENINKY/cviky, video, snímky
// a přepis jsou soukromé v TRENINKY/nahledy a do aplikace jdou jen v odpovědi motoru (stejně jako náhledy tipů v Knihovně).
// Seznam po druzích cvičení (rozcvička, přihrávky, střelba, hra, zahrávání…) s hledáním, okno cviku: video vlevo, popis, organizace,
// na co dávat pozor, varianty, moje hvězdy, oblíbené, poznámka, druh a skrytí. Video, snímky a karty zůstávají v zařízení
// (js/tipy_pamet.js) – podruhé se otevřou hned.
// Michal 16. 11. odpoledne: „nevidím náhledy – načítá se to celkem dlouho – vymysli lepší způsob“ → dotazy za sebou (seznam s otiskem →
// náhledy se „znam“ → celé karty), při chybě náhledů dva další pokusy; „nachystej pravé tlačítko … přesouvat a dělat s nima interakci“ →
// nabídka karty (js/nabidka.js), výběr Ctrl/Shift+klik s lištou, přetažení karty na druh.
// Michal 16. 11. večer: „vždy plánek a výpis těch jednotlivých situací … ať si to můžu případně já upravit, popsat“ → oddíl Plánek
// a průběh (js/planek.js, kroky s čísly jako na čarách plánku), Upravit (texty, seznamy, editor plánku js/planek_editor.js – načte
// se až při úpravě) do motoru treninkUprava (Claudova karta zůstává, Vrátit původní), Tisk na A4.
// Modul načte app.js až na stránce Tréninky; klepnutí a psaní si obsluhuje sám (atributy data-tr-…).

import { stav, zmeneno, umiMotor } from './stav.js';
import { volej, jeDemo } from './api.js';
import { esc, uloziste, velkePrvni, tvar } from './pomocne.js';
import { IKONY } from './ikony.js';
import { toast, toastAkce, kostra, chybaHtml, segment, potvrd } from './ui.js';
import { otevriPanel, obnovPanel, jeOtevreny, horniPanel, zavriPanel, elementPanelu } from './panely.js';
import { cistyPlanek, planekSvg, novyPlanek } from './planek.js';
import { pripoj as pripojNabidku, otevri as otevriNabidku, jeOtevrena as nabidkaOtevrena } from './nabidka.js';
import * as Pamet from './tipy_pamet.js';

const ULOZISTE = 'asistent.data.treninky';
const VOLBY = 'asistent.volby.treninky';
const OKNO = 'tr-cvik';
const OBNOVA_PO = 120000; // seznam z motoru znovu nejdřív po 2 min (z minula se ukáže hned)
// druhy jako v motoru (TRENINKY_.DRUHY) – když je motor ještě neposílá
const DRUHY = ['rozcvička', 'rychlost a koordinace', 'technika', 'přihrávky', 'střelba', '1 na 1', 'obrana', 'hra', 'zahrávání', 'kondice', 'brankáři', 'ostatní'];
const TAHNUTI = window.matchMedia('(hover: hover) and (pointer: fine)'); // myš: karta jde přetáhnout na druh

const ulozeno = uloziste.cti(ULOZISTE);
const volby = uloziste.cti(VOLBY) || {};
const t = {
  data: (ulozeno && ulozeno.data) || null, kdy: (ulozeno && ulozeno.kdy) || 0, nacita: false, chyba: null,
  ikony: null, ikonyKdy: 0, ikonyNacita: false, ikonyOk: false, ikonyPokus: 0, ikonyCeka: false, ikonyChyba: false,
  karty: null, kartyOtisk: '', kartyPokus: '', // celé karty z motoru (treninkyKarty) – okno cviku bez čekání
  cviky: {},   // id → { data, nacita, chyba } – celá karta (starý motor bez treninkyKarty)
  nahledy: {}, // id → { data, nacita, chyba, videoUrl, videoNacita, videoChyba, videoEl }
  filtr: volby.filtr || 'vse', dotaz: '', vybrany: null,
  vyber: new Set(), kotva: null // výběr víc karet (PC: Ctrl/⌘+klik, Shift+klik)
};

const posledni = new WeakMap();
function nastav(el, html) {
  if (!el || posledni.get(el) === html) return;
  posledni.set(el, html);
  el.innerHTML = html;
}
const jpeg = (b) => 'data:image/jpeg;base64,' + b;
const bezZnacek = (s) => String(s || '').replace(/\*\*/g, '');
/** `**…**` → podbarvení (to nejdůležitější), stejně jako u tipů v Knihovně. */
const podbarvit = (html) => html.replace(/\*\*([^*\n]+?)\*\*/g, '<mark class="kn-dulezite">$1</mark>').replace(/\*\*/g, '');
const odstavce = (s) => String(s || '').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean).map((x) => '<p>' + podbarvit(esc(x).replace(/\n/g, '<br>')) + '</p>').join('');
const bez = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pauza = (ms) => new Promise((hotovo) => setTimeout(hotovo, ms));
/** Motor umí druhy, přesouvání, skrývání a víc cviků naráz (2026-11-16.4). */
const umi = () => umiMotor('treninkyKarty');
/** Motor umí Michalovy úpravy karet (2026-11-16.5). */
const umiUpravy = () => umiMotor('treninkUprava');
/** Motor umí cvik smazat do koše Disku a vrátit (2026-11-16.5). */
const umiSmazat = () => umiMotor('treninkSmazat');
/** Žádost o plánek: jen cvik, který plánek nemá. */
const chcePlanek = (c) => !!(c && !c.planek && moje(c.id).chciPlanek);

// ---------------------------------------------------------------- data
// Dotazy jdou za sebou (Apps Script souběžné řadí do fronty a každý by čekal na všechny): seznam → náhledy → celé karty.

let rada = Promise.resolve();
const zarad = (fn) => (rada = rada.then(fn).catch(() => {}));
const kartyZPameti = Pamet.cti('tr-karty').then((m) => {
  if (m && m.karty && !t.karty) { t.karty = m.karty; t.kartyOtisk = m.otisk || ''; }
});

export function nactiTreninky(znovu) {
  if (t.nacita) return;
  const cerstvy = !znovu && t.data && Date.now() - t.kdy < OBNOVA_PO;
  const ikonyHotove = t.ikonyOk || t.ikonyCeka || t.ikonyChyba;
  const kartyHotove = !umi() || !t.data || !t.data.otiskKaret || t.data.otiskKaret === t.kartyOtisk || t.data.otiskKaret === t.kartyPokus;
  if (cerstvy && ikonyHotove && kartyHotove) return;
  t.nacita = true;
  zarad(async () => {
    if (!cerstvy) await nactiSeznam();
    await nactiIkony(znovu);
    await nactiKarty();
  }).then(() => { t.nacita = false; });
}

async function nactiSeznam() {
  t.chyba = null;
  // motor čte nové karty po dávkách (neuplne) – zbytek hned dalším dotazem
  for (let i = 0; i < 10; i++) {
    const otisk = umi() && t.data && t.data.otisk && !t.data.neuplne ? t.data.otisk : '';
    let d;
    try { d = await volej('treninky', otisk ? { otisk } : {}); } catch (e) { t.chyba = e; zmeneno(); return; }
    if (d && d.beze_zmeny) { // nic nového – nic se nepřekresluje
      t.kdy = Date.now();
      if (!jeDemo()) uloziste.pis(ULOZISTE, { data: t.data, kdy: t.kdy });
      return;
    }
    prijmi(d);
    zmeneno();
    if (!d || !d.neuplne) return;
    await pauza(300);
  }
}

function prijmi(d) {
  t.data = d;
  t.kdy = Date.now();
  if (!jeDemo()) uloziste.pis(ULOZISTE, { data: d, kdy: t.kdy });
}

/** Malé obrázky: ze zařízení hned, pak motor se „znam“ (stejný čas = nic se neposílá). Chyba = ikony zůstávají (null = nevím),
 *  další pokus za 5 s a za 20 s, pak řádek „Náhledy se nenačetly · Zkusit znovu“. */
async function nactiIkony(znovu) {
  if (t.ikonyNacita || (t.ikonyOk && !znovu)) return;
  t.ikonyNacita = true;
  if (!t.ikony) {
    const m = await Pamet.cti('tr-ikony');
    if (m && !t.ikony) {
      // { kdy, tipy } – starší tvar bez kdy jsou rovnou tipy
      if (m.tipy && typeof m.tipy === 'object' && typeof m.kdy === 'number') { t.ikony = m.tipy; t.ikonyKdy = m.kdy; } else t.ikony = m;
      zmeneno();
    }
  }
  try {
    const r = await volej('treninkyNahledy', t.ikony && t.ikonyKdy ? { znam: t.ikonyKdy } : {});
    if (!(r && r.beze_zmeny)) {
      t.ikony = (r && r.tipy) || {};
      t.ikonyKdy = (r && r.kdy) || 0;
      if (!jeDemo()) Pamet.pis('tr-ikony', { kdy: t.ikonyKdy, tipy: t.ikony });
    }
    t.ikonyOk = true;
    t.ikonyChyba = false;
    t.ikonyPokus = 0;
  } catch (e) {
    t.ikonyPokus++;
    if (t.ikonyPokus <= 2) {
      t.ikonyCeka = true;
      setTimeout(() => { t.ikonyCeka = false; zarad(() => nactiIkony(true)); }, t.ikonyPokus === 1 ? 5000 : 20000);
    } else t.ikonyChyba = true;
  }
  t.ikonyNacita = false;
  zmeneno();
}

/** Celé karty (organizace, body, varianty, přepis) jedním dotazem, když se od posledně změnil otisk karet (hvězdy ho nemění). */
async function nactiKarty() {
  await kartyZPameti;
  if (!umi() || !t.data || !t.data.otiskKaret || t.data.otiskKaret === t.kartyOtisk || t.data.otiskKaret === t.kartyPokus) return;
  t.kartyPokus = t.data.otiskKaret;
  try {
    const r = await volej('treninkyKarty');
    if (r && r.karty) {
      t.karty = r.karty;
      t.kartyOtisk = r.otisk || '';
      if (!jeDemo()) Pamet.pis('tr-karty', { otisk: t.kartyOtisk, karty: t.karty });
    }
  } catch (e) { /* okno cviku si kartu stáhne samo */ }
}

/** Ze zařízení, jinak z motoru a uložit. */
async function zPametiNeboMotoru(klic, akce, data, vyber) {
  const z = await Pamet.cti(klic);
  if (z) return z;
  const r = vyber(await volej(akce, data));
  if (r && !jeDemo()) Pamet.pis(klic, r);
  return r;
}

function nactiCvik(id) {
  if (t.cviky[id] || (t.karty && t.karty[id])) return;
  const c = t.cviky[id] = { nacita: true };
  zPametiNeboMotoru('tr-cvik:' + id, 'treninkCvik', { id }, (r) => r && r.cvik)
    .then((d) => { c.data = d; }, (e) => { c.chyba = e; })
    .then(() => { c.nacita = false; prekresliOkno(id); });
  // karta se mohla změnit (Claude ji opravil) – po otevření z paměti se potichu dotáhne čerstvá
  Pamet.cti('tr-cvik:' + id).then((z) => {
    if (!z) return;
    volej('treninkCvik', { id }).then((r) => {
      if (r && r.cvik && JSON.stringify(r.cvik) !== JSON.stringify(z)) { c.data = r.cvik; Pamet.pis('tr-cvik:' + id, r.cvik); prekresliOkno(id); }
    }, () => {});
  });
}

function nactiNahled(id) {
  if (t.nahledy[id]) return;
  const ind = t.ikony && t.ikony[id];
  // „náhled není“ jen podle ikon, které opravdu přišly z motoru (dřív chyba = prázdné ikony a u všech „Video k cviku není“)
  if (t.ikonyOk && t.ikony && !ind) { t.nahledy[id] = { data: null }; return; }
  const n = t.nahledy[id] = { nacita: true };
  if (ind && ind.video) nactiVideo(id); // video hned, ne až po snímcích
  zPametiNeboMotoru('tr-nahled:' + id, 'treninkNahled', { id }, (r) => r && r.nahled)
    .then((d) => { n.data = d; if (d && d.video) nactiVideo(id); }, (e) => { n.chyba = e; })
    .then(() => { n.nacita = false; prekresliOkno(id); });
}

function nactiVideo(id) {
  const n = t.nahledy[id];
  if (!n || (n.data && !n.data.video) || n.videoUrl || n.videoNacita) return;
  n.videoNacita = true;
  n.videoChyba = false;
  (async () => {
    let v = await Pamet.cti('tr-video:' + id);
    if (!v) {
      const r = await volej('treninkVideo', { id });
      v = { typ: r.typ || 'video/mp4', bajty: await Pamet.zBase64(r.data) };
      if (!jeDemo()) Pamet.pis('tr-video:' + id, v);
    }
    // nejvýš 3 videa v paměti
    Object.keys(t.nahledy).filter((x) => x !== id && t.nahledy[x].videoUrl && x !== t.vybrany).slice(0, -2).forEach((x) => {
      URL.revokeObjectURL(t.nahledy[x].videoUrl);
      delete t.nahledy[x].videoUrl;
      delete t.nahledy[x].videoEl;
    });
    n.videoUrl = URL.createObjectURL(new Blob([v.bajty], { type: v.typ }));
  })().catch(() => { n.videoChyba = true; }).then(() => { n.videoNacita = false; prekresliOkno(id); });
}

function moje(id) { return (t.data && t.data.moje && t.data.moje.polozky && t.data.moje.polozky[id]) || {}; }

/** Hvězdy, oblíbené, poznámka, druh, skrytí jednoho nebo víc cviků: hned v aplikaci, pak do motoru (chyba = zpět a oznámení). */
function zmenMoje(ids, zmena) {
  ids = [].concat(ids);
  if (!t.data || !ids.length) return;
  const puv = JSON.parse(JSON.stringify(t.data.moje || { polozky: {} }));
  t.data.moje = t.data.moje || { polozky: {} };
  t.data.moje.polozky = t.data.moje.polozky || {};
  ids.forEach((id) => {
    const o = Object.assign({}, moje(id), zmena);
    ['hvezdy', 'oblibene', 'poznamka', 'druh', 'skryty', 'chciPlanek'].forEach((k) => { if (!o[k]) delete o[k]; });
    delete o.kdy;
    if (Object.keys(o).length) t.data.moje.polozky[id] = o; else delete t.data.moje.polozky[id];
  });
  zmeneno();
  ids.forEach(aktualizujMojeVOkne);
  volej('treninkMoje', Object.assign(ids.length === 1 ? { id: ids[0] } : { ids }, zmena)).then((d) => {
    if (d && d.moje && t.data) { t.data.moje = d.moje; if (!jeDemo()) uloziste.pis(ULOZISTE, { data: t.data, kdy: t.kdy }); zmeneno(); }
  }, (e) => {
    t.data.moje = puv;
    zmeneno();
    ids.forEach(aktualizujMojeVOkne);
    toast('Neuložilo se: ' + ((e && e.message) || 'chyba'), true);
  });
}

// ---------------------------------------------------------------- druhy, přesun, skrytí

function cviky() { return (t.data && t.data.cviky) || []; }
const najdi = (id) => cviky().find((c) => c.id === id);
function druhy() { return t.data && Array.isArray(t.data.druhy) && t.data.druhy.length ? t.data.druhy : DRUHY; }
/** Platný druh: Michalovo přesunutí, jinak druh z karty. */
function druhCviku(c) {
  const d = moje(c.id).druh || c.druh;
  return druhy().indexOf(d) >= 0 ? d : 'ostatní';
}
const nazevDruhu = (d) => velkePrvni(d);
const pocetCviku = (n) => n + ' ' + tvar(n, 'cvik', 'cviky', 'cviků');

/** Přesun do druhu (druh shodný s druhem z karty = zrušit přesunutí); Vrátit vrátí každému cviku jeho předchozí druh. */
function presun(ids, druh) {
  const cile = {}, predtim = {};
  ids.forEach((id) => {
    const c = najdi(id);
    if (!c || druhCviku(c) === druh) return;
    predtim[id] = moje(id).druh || null;
    cile[id] = c.druh === druh ? null : druh;
  });
  const kolik = Object.keys(cile).length;
  zrusVyber(true);
  if (!kolik) { zmeneno(); return; }
  poSkupinach(cile);
  toastAkce((kolik === 1 ? 'Přesunuto' : pocetCviku(kolik) + ' přesunuto') + ' do: ' + nazevDruhu(druh), 'Vrátit', () => poSkupinach(predtim));
}
/** { id: druh | null } → jeden zápis na každou cílovou hodnotu. */
function poSkupinach(mapa) {
  const sk = {};
  Object.keys(mapa).forEach((id) => { const k = mapa[id] || ''; (sk[k] = sk[k] || []).push(id); });
  Object.keys(sk).forEach((k) => zmenMoje(sk[k], { druh: k || null }));
}
function skryj(ids, ano) {
  zrusVyber(true);
  zmenMoje(ids, { skryty: ano });
  toastAkce((ids.length === 1 ? (ano ? 'Cvik skrytý' : 'Cvik vrácený ze skrytých') : pocetCviku(ids.length) + (ano ? ' skryto' : ' vráceno ze skrytých')), 'Vrátit',
    () => zmenMoje(ids, { skryty: !ano }));
}
/** Smazat do koše Disku (víc cviků až po dotazu): hned pryč ze seznamu a z karet, Vrátit = treninkObnovit; chyba = zpět. */
function smazCviky(ids) {
  if (!umiSmazat() || !t.data || !ids.length) return;
  const proved = () => {
    const zaloha = odeber(ids);
    volej('treninkSmazat', { ids }).then(() => {
      ids.forEach((id) => { Pamet.smaz('tr-cvik:' + id); Pamet.smaz('tr-nahled:' + id); Pamet.smaz('tr-video:' + id); });
      toastAkce(ids.length === 1 ? 'Cvik je v koši' : pocetCviku(ids.length) + ' v koši', 'Vrátit', () => obnovCviky(ids, zaloha));
    }, (e) => {
      vrat(zaloha);
      toast('Nesmazalo se: ' + ((e && e.message) || 'chyba'), true);
    });
  };
  if (ids.length === 1) { proved(); return; }
  potvrd('Smazat ' + pocetCviku(ids.length) + '?', { text: 'Půjdou do koše Disku, 30 dní se dají vrátit.', ano: 'Smazat', ton: 'nebezpeci' }).then((ano) => { if (ano) proved(); });
}
/** Cviky pryč ze seznamu, karet a okna; vrací zálohu pro Vrátit. */
function odeber(ids) {
  const zaloha = { polozky: [], karty: {} };
  zrusVyber(true);
  t.data.cviky = cviky().filter((c, i) => { if (ids.indexOf(c.id) < 0) return true; zaloha.polozky.push([i, c]); return false; });
  ids.forEach((id) => { if (t.karty && t.karty[id]) { zaloha.karty[id] = t.karty[id]; delete t.karty[id]; } });
  if (t.vybrany && ids.indexOf(t.vybrany) >= 0 && jeOtevreny(OKNO)) { if (t.uprava && t.uprava.id === t.vybrany) { zrusEditor(); t.uprava = null; } zavriPanel(); }
  ulozCviky();
  return zaloha;
}
function vrat(zaloha) {
  zaloha.polozky.forEach(([i, c]) => { if (!najdi(c.id)) t.data.cviky.splice(Math.min(i, t.data.cviky.length), 0, c); });
  if (Object.keys(zaloha.karty).length) t.karty = Object.assign(t.karty || {}, zaloha.karty);
  ulozCviky();
}
function ulozCviky() {
  if (!jeDemo()) {
    uloziste.pis(ULOZISTE, { data: t.data, kdy: t.kdy });
    if (t.karty) Pamet.pis('tr-karty', { otisk: t.kartyOtisk, karty: t.karty });
  }
  zmeneno();
}
function obnovCviky(ids, zaloha) {
  vrat(zaloha);
  volej('treninkObnovit', { ids }).then(() => toast(ids.length === 1 ? 'Cvik je zpátky' : pocetCviku(ids.length) + ' zpátky'), (e) => {
    toast('Nevrátilo se: ' + ((e && e.message) || 'chyba'), true);
    nactiTreninky(true);
  });
}

function doOblibenych(ids) {
  zrusVyber(true);
  zmenMoje(ids, { oblibene: true });
  toast(ids.length === 1 ? 'Přidáno do oblíbených' : pocetCviku(ids.length) + ' v oblíbených');
}

// ---------------------------------------------------------------- výběr víc karet (PC)

function prepniVyber(id) {
  if (t.vyber.has(id)) t.vyber.delete(id); else t.vyber.add(id);
  t.kotva = id;
  zmeneno();
}
/** Shift+klik: od posledně vybrané po tuhle v pořadí, jak jsou karty vidět. */
function vyberRozsah(id) {
  const z = skupiny().reduce((a, s) => a.concat(s[1].map((c) => c.id)), []);
  const a = z.indexOf(t.kotva), b = z.indexOf(id);
  if (a < 0 || b < 0) { prepniVyber(id); return; }
  z.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => t.vyber.add(x));
  t.kotva = id;
  zmeneno();
}
function zrusVyber(tise) {
  if (!t.vyber.size && !t.kotva) return;
  t.vyber.clear();
  t.kotva = null;
  if (!tise) zmeneno();
}

// ---------------------------------------------------------------- seznam

function platnyFiltr(pocty) {
  const f = t.filtr;
  if (f === 'vse') return f;
  return (pocty || poctyFiltru())[f] ? f : 'vse';
}

function poctyFiltru() {
  const p = { vse: 0, oblibene: 0, skryte: 0, chci: 0 };
  cviky().forEach((c) => {
    const m = moje(c.id);
    if (m.skryty) { p.skryte++; return; }
    p.vse++;
    if (m.oblibene) p.oblibene++;
    if (chcePlanek(c)) p.chci++;
    const d = druhCviku(c);
    p[d] = (p[d] || 0) + 1;
  });
  return p;
}

function vybrane() {
  const f = platnyFiltr();
  const q = bez(t.dotaz).split(/\s+/).filter(Boolean);
  return cviky().filter((c) => {
    const m = moje(c.id);
    if ((f === 'skryte') !== !!m.skryty) return false; // skryté jen pod čipem Skryté
    if (f === 'oblibene' && !m.oblibene) return false;
    if (f === 'chci' && !chcePlanek(c)) return false;
    if (f !== 'vse' && f !== 'oblibene' && f !== 'skryte' && f !== 'chci' && druhCviku(c) !== f) return false;
    if (!q.length) return true;
    const text = bez([c.nazev, c.kratce, druhCviku(c), (c.zamereni || []).join(' '), c.forma, (c.kategorie || []).join(' '), c.autor].join(' '));
    return q.every((s) => text.indexOf(s) >= 0);
  });
}

/** Pod Vše a Oblíbené oddíly po druzích [[druh, cviky]], jinak jedna mřížka [[null, cviky]]. */
function skupiny() {
  const s = vybrane();
  const f = platnyFiltr();
  if (f !== 'vse' && f !== 'oblibene') return [[null, s]];
  return druhy().map((d) => [d, s.filter((c) => druhCviku(c) === d)]).filter((x) => x[1].length);
}

function filtryHtml() {
  if (!cviky().length) return '';
  const p = poctyFiltru();
  const volbyF = [['vse', 'Vše', p.vse]].concat(p.oblibene ? [['oblibene', '★ Oblíbené', p.oblibene]] : [])
    .concat(druhy().filter((d) => p[d]).map((d) => [d, nazevDruhu(d), p[d]]))
    .concat(p.chci ? [['chci', 'Chci plánek', p.chci]] : [])
    .concat(p.skryte ? [['skryte', 'Skryté', p.skryte]] : []);
  return segment(volbyF, platnyFiltr(p), 'data-tr-filtr', 'Druh cvičení');
}

function kartaHtml(c) {
  const ind = t.ikony && t.ikony[c.id];
  const m = moje(c.id);
  const meta = [c.hraci ? c.hraci + ' hráčů' : '', c.delka].filter(Boolean).join(' · ');
  const tah = TAHNUTI.matches && umi() ? ' draggable="true"' : '';
  return '<li><button type="button" class="tr-karta' + (t.vyber.has(c.id) ? ' tr-karta--vybrana' : '') + '" data-tr-otevri="' + esc(c.id) + '"' + tah + '>' +
    '<span class="tr-karta__obr">' + (ind && ind.ikona ? '<img src="' + jpeg(ind.ikona) + '" alt="" loading="lazy" draggable="false">' : '<i>' + IKONY.treninky + '</i>') +
      (ind && ind.video ? '<em class="tr-karta__video">' + IKONY.prehrat + '</em>' : '') +
      (c.planek ? '<em class="tr-karta__planek" aria-label="Má plánek">' + IKONY.tabulka + '</em>' : '') +
      (chcePlanek(c) ? '<em class="tr-karta__planek tr-karta__planek--chci" aria-label="Chci plánek">' + IKONY.tabulka + '</em>' : '') + '</span>' +
    '<span class="tr-karta__telo">' +
      ((c.zamereni || []).length ? '<span class="tr-karta__stitky">' + c.zamereni.slice(0, 2).map((z) => '<span class="tag tag--seda">' + esc(z) + '</span>').join('') + '</span>' : '') +
      '<b>' + esc(c.nazev) + '</b>' +
      (c.kratce ? '<small>' + esc(bezZnacek(c.kratce)) + '</small>' : '') +
      '<span class="tr-karta__meta">' + (meta ? '<span>' + esc(meta) + '</span>' : '') +
        (m.hvezdy ? '<span class="tr-karta__hvezdy" aria-label="' + m.hvezdy + ' z 5">' + '★'.repeat(m.hvezdy) + '</span>' : '') +
        (m.oblibene ? '<span class="tr-karta__obl" aria-label="Oblíbený">♥</span>' : '') + '</span>' +
    '</span></button></li>';
}

function obsahHtml() {
  if (!t.data) {
    if (t.chyba) return '<section class="card">' + chybaHtml(t.chyba, 'data-tr-znovu') + '</section>';
    return '<section class="card">' + kostra(6) + '</section>';
  }
  if (!cviky().length) {
    return '<div class="prazdne prazdne--velke"><i class="kruh">' + IKONY.treninky + '</i><b>Zatím tu nejsou žádné cviky</b>' +
      '<span>Claude je připravuje z reelů v chatu „Tréninky video“. Další cvik pošli z Instagramu přes Sdílet → Do tréninků.</span></div>';
  }
  const chybaIkon = t.ikonyChyba ? '<p class="napoveda tr-nahledy-chyba">Náhledy se nenačetly · <button type="button" class="odkaz" data-tr-ikony-znovu>Zkusit znovu</button></p>' : '';
  const sk = skupiny();
  if (!sk.length) return chybaIkon + '<div class="prazdne"><b>Nic neodpovídá</b><span>Zkus jiný druh nebo hledání.</span></div>';
  return chybaIkon + sk.map((s) => (s[0] ? '<section class="tr-oddil"><h2 class="tr-oddil__nadpis" data-tr-oddil="' + esc(s[0]) + '">' + esc(nazevDruhu(s[0])) +
    '<span class="pocet cisla">' + s[1].length + '</span></h2>' : '') + '<ul class="tr-mrizka">' + s[1].map(kartaHtml).join('') + '</ul>' + (s[0] ? '</section>' : '')).join('');
}

/** Lišta nad seznamem, když je něco vybrané (vzhled lišty výběru v Poště). */
function vyberHtml() {
  const n = t.vyber.size;
  if (!n) return '';
  const tl = (jak, ikona, text, hlavni) => '<button type="button" class="btn btn--sm ' + (hlavni ? 'btn--primary' : 'btn--ghost') + '" data-tr-vyber="' + jak + '">' +
    ikona + '<span>' + text + '</span></button>';
  const skryte = platnyFiltr() === 'skryte';
  return '<div class="posta-vyber tr-vyber" role="toolbar" aria-label="Vybrané cviky"><b class="posta-vyber__pocet cisla">Vybráno ' + n + '</b>' +
    '<span class="posta-vyber__akce">' + tl('presunout', IKONY.slozka, 'Přesunout do…', true) + tl('oblibene', IKONY.srdce, 'Do oblíbených') +
      tl('skryt', IKONY.archiv, skryte ? 'Vrátit ze skrytých' : 'Skrýt') + (umiSmazat() ? tl('smazat', IKONY.smazat, 'Smazat') : '') + '</span>' +
    '<button type="button" class="btn btn--ikona btn--sm posta-vyber__zrusit" data-tr-vyber="zrusit" aria-label="Zrušit výběr (Esc)" title="Zrušit výběr (Esc)">' + IKONY.zavrit + '</button></div>';
}

export function vykresliTreninky(el) {
  nactiTreninky(false);
  if (tah.ids) { tah.odlozeno = true; return; } // překreslení by taženou kartu vyměnilo a tažení zrušilo – až po puštění
  if (!el.querySelector('#tr-vyber')) {
    posledni.delete(el);
    el.innerHTML = '<div class="tr-lista"><label class="kn-hledat tr-hledat">' + IKONY.hledat +
      '<input type="search" id="tr-hledat" data-tr-hledat placeholder="Hledat cvik…" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Hledat cvik"></label>' +
      '<div class="tr-filtry" id="tr-filtry"></div></div><div id="tr-vyber"></div><div id="tr-obsah"></div>';
    el.querySelector('#tr-hledat').value = t.dotaz;
  }
  // výběr jen z karet, které jsou vidět
  if (t.vyber.size) {
    const vidno = new Set(vybrane().map((c) => c.id));
    t.vyber.forEach((id) => { if (!vidno.has(id)) t.vyber.delete(id); });
  }
  nastav(el.querySelector('#tr-filtry'), filtryHtml());
  nastav(el.querySelector('#tr-vyber'), vyberHtml());
  nastav(el.querySelector('#tr-obsah'), obsahHtml());
}

export function podnadpis() {
  if (!t.data) return t.chyba ? 'Tréninky se nenačetly' : 'Studnice cviků z reelů';
  const p = poctyFiltru();
  return pocetCviku(p.vse) + (p.oblibene ? ' · ' + p.oblibene + ' ' + tvar(p.oblibene, 'oblíbený', 'oblíbené', 'oblíbených') : '') + ' · z reelů a metodiky';
}

// ---------------------------------------------------------------- nabídka karty (pravé tlačítko, podržení, Shift+F10)

function nabidkaPresunu(ids) {
  const ted = ids.map((id) => druhCviku(najdi(id) || { id }));
  const jeden = ted.every((d) => d === ted[0]) ? ted[0] : '';
  const presunute = ids.filter((id) => moje(id).druh);
  const p = druhy().map((d) => ({ text: nazevDruhu(d) + (d === jeden ? ' ✓' : ''), fn: () => presun(ids, d) }));
  if (presunute.length) {
    p.push({ text: 'Vrátit původní druh', oddel: true, fn: () => {
      const predtim = {};
      presunute.forEach((id) => { predtim[id] = moje(id).druh; });
      zrusVyber(true);
      poSkupinach(Object.fromEntries(presunute.map((id) => [id, null])));
      toastAkce('Vrácený původní druh', 'Vrátit', () => poSkupinach(predtim));
    } });
  }
  return { nadpis: 'Přesunout do', polozky: p };
}

function nabidkaHodnoceni(id) {
  const h = moje(id).hvezdy || 0;
  return { nadpis: 'Ohodnotit', polozky: [5, 4, 3, 2, 1].map((i) => ({ text: '★'.repeat(i) + '☆'.repeat(5 - i) + (h === i ? ' ✓' : ''), fn: () => zmenMoje(id, { hvezdy: i }) }))
    .concat([{ text: 'Bez hodnocení' + (h ? '' : ' ✓'), oddel: true, fn: () => zmenMoje(id, { hvezdy: 0 }) }]) };
}

function nabidkaVyberu() {
  const ids = Array.from(t.vyber);
  const skryte = platnyFiltr() === 'skryte';
  return { nadpis: pocetCviku(ids.length), polozky: [
    { ikona: IKONY.slozka, text: 'Přesunout do…', dalsi: () => nabidkaPresunu(ids) },
    { ikona: IKONY.srdce, text: 'Do oblíbených', fn: () => doOblibenych(ids) },
    { ikona: IKONY.archiv, text: skryte ? 'Vrátit ze skrytých' : 'Skrýt', fn: () => skryj(ids, !skryte) }]
    .concat(chciPlanekPolozka(ids))
    .concat(umiSmazat() ? [{ ikona: IKONY.smazat, text: 'Smazat…', nebezpeci: true, fn: () => smazCviky(ids) }] : [])
    .concat([{ ikona: IKONY.zavrit, text: 'Zrušit výběr', oddel: true, fn: () => zrusVyber() }]) };
}

/** Chci plánek / Zrušit žádost – pro cviky bez plánku (jeden i výběr). */
function chciPlanekPolozka(ids) {
  const bez = ids.filter((id) => { const c = najdi(id); return c && !c.planek; });
  if (!umiUpravy() || !bez.length) return [];
  const vsechny = bez.every((id) => moje(id).chciPlanek);
  return [{ ikona: IKONY.tabulka, text: vsechny ? 'Zrušit žádost o plánek' : 'Chci plánek', fn: () => chciPlanek(bez, !vsechny) }];
}
function chciPlanek(ids, ano) {
  zrusVyber(true);
  zmenMoje(ids, { chciPlanek: ano });
  toast(ano ? (ids.length === 1 ? 'Claude k cviku připraví plánek' : 'Plánek chceš u ' + pocetCviku(ids.length)) : 'Žádost o plánek zrušená');
}

function nabidkaTreninku(cil) {
  const b = cil && cil.closest ? cil.closest('#p-treninky .tr-karta[data-tr-otevri]') : null;
  const c = b && najdi(b.dataset.trOtevri);
  if (!c) return null;
  const id = c.id;
  if (t.vyber.size > 1 && t.vyber.has(id)) return nabidkaVyberu();
  const m = moje(id);
  const p = [{ ikona: IKONY.treninky, text: 'Otevřít', fn: () => otevri(id) }].concat(umiUpravy() ? [{ ikona: IKONY.psat, text: 'Upravit…', fn: () => zacniUpravu(id) }] : []).concat([
    { ikona: IKONY.srdce, text: m.oblibene ? 'Odebrat z oblíbených' : 'Do oblíbených', fn: () => zmenMoje(id, { oblibene: !m.oblibene }) },
    { ikona: IKONY.hvezda, text: 'Ohodnotit…', dalsi: () => nabidkaHodnoceni(id) }]);
  if (umi()) p.push({ ikona: IKONY.slozka, text: 'Přesunout do…', dalsi: () => nabidkaPresunu([id]) });
  if (c.odkaz) p.push({ ikona: IKONY.odkaz, text: 'Otevřít originál', fn: () => window.open(c.odkaz, '_blank', 'noopener') });
  chciPlanekPolozka([id]).forEach((x) => p.push(x));
  if (umi()) p.push({ ikona: IKONY.archiv, text: m.skryty ? 'Vrátit ze skrytých' : 'Skrýt cvik', oddel: true, fn: () => skryj([id], !m.skryty) });
  if (umiSmazat()) p.push({ ikona: IKONY.smazat, text: 'Smazat cvik…', nebezpeci: true, fn: () => smazCviky([id]) });
  return { nadpis: c.nazev, polozky: p };
}
pripojNabidku(nabidkaTreninku);

// ---------------------------------------------------------------- okno cviku

function hvezdyHtml(id) {
  const m = moje(id);
  return '<div class="kn-hvezdy tr-hvezdy" role="group" aria-label="Moje hodnocení">' + [1, 2, 3, 4, 5].map((i) => '<button type="button" class="kn-hvezda' +
    (m.hvezdy >= i ? ' plna' : '') + '" data-tr-hvezdy="' + i + '" aria-pressed="' + (m.hvezdy === i) + '" aria-label="' + i + ' z 5">' + IKONY.hvezda + '</button>').join('') + '</div>';
}

/** Druh (přesunutí) a skrytí v oddílu Moje – jen s novým motorem. */
function druhVOkneHtml(id) {
  const c = najdi(id);
  if (!umi() || !c) return '';
  const m = moje(id);
  const puv = druhy().indexOf(c.druh) >= 0 ? c.druh : 'ostatní';
  const ted = druhCviku(c);
  return '<label class="tr-druh"><span>Druh</span><select class="field field--sm" data-tr-druh aria-label="Druh cvičení">' +
    druhy().map((d) => '<option value="' + esc(d) + '"' + (d === ted ? ' selected' : '') + '>' + esc(nazevDruhu(d)) + '</option>').join('') + '</select></label>' +
    (ted !== puv ? '<span class="napoveda">původně: ' + esc(puv) + ' · <button type="button" class="odkaz" data-tr-druh-vratit>Vrátit</button></span>' : '') +
    '<button type="button" class="btn btn--sm btn--ghost tr-skryt" data-tr-skryt>' + (m.skryty ? 'Vrátit ze skrytých' : 'Skrýt') + '</button>' +
    (umiSmazat() ? '<button type="button" class="btn btn--sm btn--ghost" data-tr-smazat>' + IKONY.smazat + '<span>Smazat</span></button>' : '');
}

function mediaHtml(id) {
  const n = t.nahledy[id];
  const ind = t.ikony && t.ikony[id];
  const d = n && n.data;
  const plakat = (d && (d.snimky || [])[0]) || (d && d.miniatura) || (ind && ind.ikona);
  if (n && n.videoUrl && !n.videoChyba) return '<div class="tr-video" data-tr-video></div>';
  if ((!n || n.nacita || n.videoNacita) && (ind ? ind.video : true) && !(n && n.videoChyba) && !(d && !d.video)) {
    return '<div class="kn-tip__ceka">' + (plakat ? '<img src="' + jpeg(plakat) + '" alt="">' : '') + '<span>' + IKONY.prehrat + 'Načítám video…</span></div>';
  }
  if (d && (d.snimky || []).length) {
    return '<div class="kn-tip__snimky">' + d.snimky.map((b, i) => '<img src="' + jpeg(b) + '" alt="Snímek ' + (i + 1) + ' z videa">').join('') + '</div>' +
      (n.videoChyba ? '<p class="kn-tip__pozn">Video se nepodařilo načíst, proto jsou tu snímky. <button type="button" class="odkaz" data-tr-video-znovu>Zkusit znovu</button></p>' : '');
  }
  if (plakat) return '<div class="kn-tip__snimky kn-tip__snimky--jeden"><img src="' + jpeg(plakat) + '" alt="Náhled"></div>';
  if (n && n.chyba) {
    return '<div class="tr-video tr-video--nic"><i>' + IKONY.treninky + '</i><span>Náhled se nenačetl. <button type="button" class="odkaz" data-tr-nahled-znovu>Zkusit znovu</button></span></div>';
  }
  return '<div class="tr-video tr-video--nic"><i>' + IKONY.treninky + '</i><span>Video k cviku není – odkaz na originál je vpravo.</span></div>';
}

/** Plánek s legendou a vedle (na úzké šířce pod ním) kroky s čísly jako na čarách plánku. */
function prubehHtml(c) {
  const kroky = c.kroky || [];
  if (!c.planek && !kroky.length) return '';
  return '<section class="tr-sekce tr-prubeh"><h3>Plánek a průběh</h3><div class="tr-prubeh__obsah' + (c.planek && kroky.length ? ' tr-prubeh__obsah--dva' : '') + '">' +
    (c.planek ? '<div class="tr-prubeh__planek">' + planekSvg(c.planek, { legenda: true }) + '</div>' : '') +
    (kroky.length ? '<ol class="tr-kroky">' + kroky.map((k, i) => '<li><span class="tr-krok" aria-hidden="true">' + (i + 1) + '</span><span>' + podbarvit(esc(k)) + '</span></li>').join('') + '</ol>' : '') +
    '</div></section>';
}

/** Cvik bez plánku: nenápadný řádek se žádostí pro Clauda. */
function chciRadekHtml(c) {
  if (!umiUpravy() || !c.id || c.planek) return '';
  return moje(c.id).chciPlanek ? '<p class="napoveda tr-chci">O plánek je požádáno · <button type="button" class="odkaz" data-tr-chci>Zrušit</button></p>'
    : '<p class="napoveda tr-chci">Plánek zatím není · <button type="button" class="odkaz" data-tr-chci>Chci plánek</button></p>';
}

/** Zobrazená karta: celá (s Michalovými úpravami), jinak položka seznamu. */
function kartaCviku(id) { return (t.karty && t.karty[id]) || (t.cviky[id] && t.cviky[id].data) || najdi(id) || {}; }

function detailHtml() {
  const id = t.vybrany;
  if (t.uprava && t.uprava.id === id) return upravaHtml();
  const c = kartaCviku(id);
  const nacitaKartu = !(t.karty && t.karty[id]) && t.cviky[id] && t.cviky[id].nacita && !t.cviky[id].data;
  const n = t.nahledy[id];
  const m = moje(id);
  const stitky = (c.zamereni || []).map((z) => '<span class="tag tag--ok">' + esc(z) + '</span>').join('') +
    (c.forma ? '<span class="tag tag--seda">' + esc(c.forma) + '</span>' : '') +
    (c.kategorie || []).map((k) => '<span class="tag tag--seda">' + esc(k) + '</span>').join('');
  const fakta = [['Hráči', c.hraci], ['Prostor', c.prostor], ['Délka', c.delka], ['Intenzita', c.intenzita], ['Pomůcky', (c.pomucky || []).join(', ')]]
    .filter((f) => f[1]).map((f) => '<div><dt>' + f[0] + '</dt><dd>' + esc(f[1]) + '</dd></div>').join('');
  const seznam = (nadpis, body) => ((body || []).length ? '<section class="tr-sekce"><h3>' + nadpis + '</h3><ul>' + body.map((b) => '<li>' + podbarvit(esc(b)) + '</li>').join('') + '</ul></section>' : '');
  const prepis = c.prepis || (n && n.data && n.data.prepis) || '';
  const text = n && n.data && n.data.text;
  return '<div class="tr-detail">' +
    '<div class="tr-detail__media">' + mediaHtml(id) +
      (c.odkaz || (n && n.data && n.data.odkaz) ? '<a class="tr-original" href="' + esc(c.odkaz || n.data.odkaz) + '" target="_blank" rel="noopener">Originál na Instagramu' + IKONY.odkaz + '</a>' : '') +
      (c.autor ? '<small class="tr-autor">' + esc(c.autor) + '</small>' : '') + '</div>' +
    '<div class="tr-detail__text">' +
      (stitky ? '<div class="tr-stitky">' + stitky + '</div>' : '') +
      (c.kratce ? '<div class="tr-kratce">' + odstavce(c.kratce) + '</div>' : '') +
      (fakta ? '<dl class="tr-fakta">' + fakta + '</dl>' : '') +
      (nacitaKartu ? kostra(4) : '') + prubehHtml(c) + '<div data-tr-chci-radek>' + chciRadekHtml(c) + '</div>' +
      ((c.organizace || []).length ? '<section class="tr-sekce"><h3>' + ((c.kroky || []).length ? 'Rozestavení a organizace' : 'Organizace a průběh') + '</h3>' + c.organizace.map(odstavce).join('') + '</section>' : '') +
      seznam('Na co dávat pozor', c.body) + seznam('Varianty a ztížení', c.varianty) +
      '<section class="tr-sekce tr-moje"><h3>Moje</h3><div class="tr-moje__radek">' + hvezdyHtml(id) +
        '<button type="button" class="btn btn--sm ' + (m.oblibene ? 'btn--primary' : 'btn--ghost') + '" data-tr-oblibene aria-pressed="' + !!m.oblibene + '">' +
          (m.oblibene ? '♥ V oblíbených' : '♡ Do oblíbených') + '</button></div>' +
        '<textarea class="tr-poznamka" data-tr-poznamka rows="2" placeholder="Poznámka – kdy jsem to zkoušel, co upravit…">' + esc(m.poznamka || '') + '</textarea>' +
        '<div class="tr-moje__druh" data-tr-moje-druh>' + druhVOkneHtml(id) + '</div></section>' +
      (prepis ? '<details class="kn-tip__blok"><summary>Přepis – co je ve videu řečeno</summary><div class="kn-tip__prepis">' + odstavce(prepis) + '</div></details>' : '') +
      (text ? '<details class="kn-tip__blok"><summary>Text příspěvku</summary><div class="kn-tip__prepis">' + odstavce(text) + '</div></details>' : '') +
    '</div></div>';
}

function otevri(id) {
  t.vybrany = id;
  nactiCvik(id);
  nactiNahled(id);
  const n = t.nahledy[id];
  if (n && n.data && n.data.video && !n.videoChyba) nactiVideo(id);
  otevriPanel({
    id: OKNO, trida: 'panel-okno panel-reel tr-okno',
    titul: () => kartaCviku(t.vybrany).nazev || 'Cvik',
    vpravo: () => {
      if (t.uprava && t.uprava.id === t.vybrany) return '<span class="tr-upraveno">úpravy</span>';
      const c = kartaCviku(t.vybrany);
      return ((c.upraveno || []).length ? '<span class="tr-upraveno">upraveno</span>' : '') +
        '<button type="button" class="btn btn--sm btn--ghost tr-hlava-tl" data-tr-tisk aria-label="Tisk">' + IKONY.tisk + '<span>Tisk</span></button>' +
        (umiUpravy() ? '<button type="button" class="btn btn--sm btn--ghost tr-hlava-tl" data-tr-upravit aria-label="Upravit">' + IKONY.psat + '<span>Upravit</span></button>' : '');
    },
    paticka: () => (t.uprava && t.uprava.id === t.vybrany ? patickaUpravyHtml() : ''),
    vykresli: detailHtml,
    poVykresleni: (el) => { pripojVideo(el); pripojEditor(el); },
    // rozepsané úpravy zůstanou (otevře se zase v úpravách), neupravené se zahodí
    priZavreni: () => { zrusEditor(); if (t.uprava && !maZmeny()) t.uprava = null; t.vybrany = null; },
    zavritMimo: () => { if (!neulozeno()) return true; zeptatSeNaZavreni(); return false; }
  });
}

/** Video je jeden prvek po celou dobu otevření – překreslení okna (karta dorazila, hvězdy) ho jen přesune, nevytvoří znovu. */
function pripojVideo(el) {
  const misto = el.querySelector('[data-tr-video]');
  const n = t.nahledy[t.vybrany];
  if (!misto || !n || !n.videoUrl) return;
  if (!n.videoEl) {
    const v = document.createElement('video');
    v.className = 'kn-tip__video';
    v.controls = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.src = n.videoUrl;
    v.addEventListener('error', () => { n.videoChyba = true; Pamet.smaz('tr-video:' + t.vybrany); prekresliOkno(t.vybrany); });
    n.videoEl = v;
  }
  misto.appendChild(n.videoEl);
}

// v úpravách se okno nepřekresluje (fokus, klávesnice v telefonu a editor plánku by zmizely)
function prekresliOkno(id) { if (t.vybrany === id && jeOtevreny(OKNO) && !(t.uprava && t.uprava.id === id)) obnovPanel(OKNO); }

/** Hvězdy, oblíbené, druh a skrytí bez překreslení okna (rozehrané video běží dál). */
function aktualizujMojeVOkne(id) {
  if (t.vybrany !== id || !jeOtevreny(OKNO)) return;
  const el = document.querySelector('[data-panel="' + OKNO + '"]');
  if (!el) return;
  const m = moje(id);
  el.querySelectorAll('[data-tr-hvezdy]').forEach((b) => {
    const i = Number(b.dataset.trHvezdy);
    b.classList.toggle('plna', m.hvezdy >= i);
    b.setAttribute('aria-pressed', String(m.hvezdy === i));
  });
  const o = el.querySelector('[data-tr-oblibene]');
  if (o) {
    o.className = 'btn btn--sm ' + (m.oblibene ? 'btn--primary' : 'btn--ghost');
    o.setAttribute('aria-pressed', String(!!m.oblibene));
    o.textContent = m.oblibene ? '♥ V oblíbených' : '♡ Do oblíbených';
  }
  const d = el.querySelector('[data-tr-moje-druh]');
  if (d) d.innerHTML = druhVOkneHtml(id);
  const ch = el.querySelector('[data-tr-chci-radek]');
  if (ch) ch.innerHTML = chciRadekHtml(kartaCviku(id));
}

// ---------------------------------------------------------------- Michalovy úpravy karty (motor treninkUprava)
// t.uprava = { id, zaklad, k (rozepsaná kopie), editor?, uklada? }. Během psaní se okno nepřekresluje; přidat / smazat / posunout
// položku překreslí jen ten seznam, plánek jen svůj blok. Posílají se jen pole, která se proti zobrazené kartě změnila.

const TEXTY_U = ['nazev', 'kratce', 'hraci', 'prostor', 'delka'];
const SEZNAMY_U = [['kroky', 'Kroky – jak to probíhá', 'Přidat krok'], ['organizace', 'Rozestavení a organizace', 'Přidat odstavec'],
  ['body', 'Na co dávat pozor', 'Přidat bod'], ['varianty', 'Varianty a ztížení', 'Přidat variantu']];
// <textarea> zahodí první odřádkování obsahu
const doPole = (s) => (s.charAt(0) === '\n' ? '\n' : '') + s;

function koncept(c) {
  const k = {};
  TEXTY_U.forEach((p) => { k[p] = c[p] || ''; });
  SEZNAMY_U.forEach(([p]) => { k[p] = (c[p] || []).slice(); });
  k.planek = c.planek ? JSON.parse(JSON.stringify(c.planek)) : null;
  return k;
}

/** Změněná pole proti zobrazené kartě: { pole: hodnota } ([] = smazané všechny položky, planek false = odebraný). */
function zmenyUpravy() {
  const u = t.uprava;
  if (!u) return {};
  const a = u.k, b = u.zaklad, z = {};
  TEXTY_U.forEach((p) => { if (a[p].trim() !== b[p].trim()) z[p] = a[p].trim(); });
  SEZNAMY_U.forEach(([p]) => {
    const x = a[p].map((s) => s.trim()).filter(Boolean);
    if (JSON.stringify(x) !== JSON.stringify(b[p])) z[p] = x;
  });
  const pa = a.planek ? cistyPlanek(a.planek) : null, pb = b.planek ? cistyPlanek(b.planek) : null;
  if (JSON.stringify(pa) !== JSON.stringify(pb)) z.planek = pa || false;
  return z;
}
const maZmeny = () => Object.keys(zmenyUpravy()).length > 0;
const neulozeno = () => !!(t.uprava && t.uprava.id === t.vybrany && maZmeny());

function zacniUpravu(id) {
  if (!umiUpravy()) return;
  if (!(t.uprava && t.uprava.id === id)) {
    zrusEditor();
    const c = kartaCviku(id);
    t.uprava = { id, zaklad: koncept(c), k: koncept(c) };
  }
  if (t.vybrany === id && jeOtevreny(OKNO)) obnovPanel(OKNO); else otevri(id);
  const el = elementPanelu(OKNO);
  const pole = el && el.querySelector('[data-tr-u="nazev"]');
  if (pole) pole.focus({ preventScroll: true });
}

function konecUpravy() {
  zrusEditor();
  t.uprava = null;
  if (jeOtevreny(OKNO)) obnovPanel(OKNO);
}

function polozkyHtml(p) {
  const s = t.uprava.k[p];
  if (!s.length) return '<li class="napoveda tr-u-prazdne">Zatím nic – přidej první.</li>';
  const tl = (akce, ikona, popis, i, vypnout) => '<button type="button" class="btn btn--ikona btn--sm" data-tr-u-akce="' + akce + '" data-tr-u-seznam="' + p + '" data-i="' + i + '"' +
    ' aria-label="' + popis + '" title="' + popis + '"' + (vypnout ? ' disabled' : '') + '>' + ikona + '</button>';
  return s.map((v, i) => '<li class="tr-u-polozka">' + (p === 'kroky' ? '<span class="tr-krok" aria-hidden="true">' + (i + 1) + '</span>' : '') +
    '<textarea class="field" rows="2" data-tr-u-pol="' + p + '" data-i="' + i + '" data-pole="tr-u-' + p + '-' + i + '" aria-label="' + esc(p) + ' ' + (i + 1) + '">' + esc(doPole(v)) + '</textarea>' +
    '<span class="tr-u-tl">' + tl('nahoru', '↑', 'Posunout nahoru', i, i === 0) + tl('dolu', '↓', 'Posunout dolů', i, i === s.length - 1) +
      tl('smazat', IKONY.smazat, 'Smazat', i) + '</span></li>').join('');
}

function planekBlokHtml() {
  if (!t.uprava.k.planek) {
    return '<p class="napoveda">Cvik zatím plánek nemá.</p><button type="button" class="btn btn--sm btn--ghost" data-tr-planek="pridat">' + IKONY.plus + '<span>Přidat plánek</span></button>';
  }
  return '<div class="tr-u-planek" data-tr-planek-editor></div>' +
    '<button type="button" class="btn btn--sm btn--ghost tr-u-odebrat" data-tr-planek="odebrat">' + IKONY.smazat + '<span>Odebrat plánek</span></button>';
}

function upravaHtml() {
  const k = t.uprava.k;
  const pole = (p, nazev, napoveda) => '<label><span class="label">' + nazev + '</span><input class="field" data-tr-u="' + p + '" data-pole="tr-u-' + p + '" value="' +
    esc(k[p]) + '"' + (napoveda ? ' placeholder="' + napoveda + '"' : '') + ' autocomplete="off"></label>';
  return '<div class="formular tr-uprava">' + pole('nazev', 'Název') +
    '<label><span class="label">Krátce</span><textarea class="field" rows="3" data-tr-u="kratce" data-pole="tr-u-kratce">' + esc(doPole(k.kratce)) + '</textarea>' +
      '<small class="napoveda">To hlavní dej mezi dvě hvězdičky – <b>**takhle**</b> – v kartě se podbarví.</small></label>' +
    '<div class="tr-uprava__fakta">' + pole('hraci', 'Hráči', 'např. 6–8') + pole('prostor', 'Prostor', 'např. 20 × 15 m') + pole('delka', 'Délka', 'např. 15 min') + '</div>' +
    '<section class="tr-sekce"><h3>Plánek</h3><div data-tr-planek-blok>' + planekBlokHtml() + '</div></section>' +
    SEZNAMY_U.map(([p, nadpis, pridat]) => '<section class="tr-sekce"><h3>' + nadpis + '</h3><ol class="tr-u-seznam" data-tr-seznam="' + p + '">' + polozkyHtml(p) + '</ol>' +
      '<button type="button" class="btn btn--sm btn--ghost" data-tr-u-pridat="' + p + '">' + IKONY.plus + '<span>' + pridat + '</span></button></section>').join('') +
    '</div>';
}

function patickaUpravyHtml() {
  const c = kartaCviku(t.uprava.id);
  return '<div class="akce tr-u-akce">' + ((c.upraveno || []).length ? '<button type="button" class="btn btn--ghost" data-tr-u-vratit>Vrátit původní</button>' : '') +
    '<span class="tr-u-mezera"></span><button type="button" class="btn btn--ghost" data-tr-u-zrusit>Zrušit</button>' +
    '<button type="button" class="btn btn--primary" data-tr-u-ulozit>Uložit</button></div>';
}

/** Editor plánku do místa v okně (modul až teď – při prohlížení se nestahuje). */
function pripojEditor(el) {
  const u = t.uprava;
  const misto = el && el.querySelector('[data-tr-planek-editor]');
  if (!u || u.id !== t.vybrany || !misto || !u.k.planek) return;
  zrusEditor();
  import('./planek_editor.js').then((m) => {
    if (t.uprava !== u || !misto.isConnected || u.editor) return;
    u.editor = m.vytvorEditor(misto, u.k.planek, { onZmena: (p) => { u.k.planek = p; } });
  });
}
function zrusEditor() {
  const u = t.uprava;
  if (!u || !u.editor) return;
  try { u.k.planek = u.editor.planek(); u.editor.znic(); } catch (e) { /* nic */ }
  u.editor = null;
}

/** Psaní do polí úprav – jen do rozepsané kopie, nic se nepřekresluje. */
function pisUpravu(cil) {
  const u = t.uprava;
  if (!u || !cil.closest('[data-panel="' + OKNO + '"]')) return false;
  if (cil.dataset.trU) { u.k[cil.dataset.trU] = cil.value; return true; }
  if (cil.dataset.trUPol) { u.k[cil.dataset.trUPol][Number(cil.dataset.i)] = cil.value; return true; }
  return false;
}

function prekresliSeznam(p, fokus) {
  const el = elementPanelu(OKNO);
  const s = el && el.querySelector('[data-tr-seznam="' + p + '"]');
  if (!s) return;
  s.innerHTML = polozkyHtml(p);
  const pole = fokus != null && s.querySelector('[data-i="' + fokus + '"][data-tr-u-pol]');
  if (pole) pole.focus();
}

function klikUpravy(el) {
  if (el.hasAttribute('data-tr-upravit')) { zacniUpravu(t.vybrany); return true; }
  if (el.hasAttribute('data-tr-tisk')) { tiskni(t.vybrany); return true; }
  const u = t.uprava;
  if (!u || u.id !== t.vybrany) return false;
  if (el.dataset.trUAkce) {
    const p = el.dataset.trUSeznam, i = Number(el.dataset.i), s = u.k[p];
    if (el.dataset.trUAkce === 'smazat') { s.splice(i, 1); prekresliSeznam(p, null); return true; }
    const j = el.dataset.trUAkce === 'nahoru' ? i - 1 : i + 1;
    if (j < 0 || j >= s.length) return true;
    const x = s[i]; s[i] = s[j]; s[j] = x;
    prekresliSeznam(p, j);
    return true;
  }
  if (el.dataset.trUPridat) { const p = el.dataset.trUPridat; u.k[p].push(''); prekresliSeznam(p, u.k[p].length - 1); return true; }
  if (el.dataset.trPlanek) {
    zrusEditor();
    u.k.planek = el.dataset.trPlanek === 'pridat' ? novyPlanek('obdelnik') : null;
    const okno = elementPanelu(OKNO);
    const blok = okno && okno.querySelector('[data-tr-planek-blok]');
    if (blok) blok.innerHTML = planekBlokHtml();
    pripojEditor(okno);
    return true;
  }
  if (el.hasAttribute('data-tr-u-ulozit')) { ulozUpravu(false); return true; }
  if (el.hasAttribute('data-tr-u-zrusit')) {
    if (!maZmeny()) { konecUpravy(); return true; }
    potvrd('Zahodit neuložené změny?', { text: 'Karta zůstane, jak byla.', ano: 'Zahodit', ne: 'Upravovat dál', ton: 'nebezpeci' }).then((ano) => { if (ano) konecUpravy(); });
    return true;
  }
  if (el.hasAttribute('data-tr-u-vratit')) {
    potvrd('Vrátit původní kartu od Clauda?', { text: 'Tvoje úpravy tohohle cviku se zahodí.', ano: 'Vrátit původní' }).then((ano) => { if (ano) ulozUpravu(true); });
    return true;
  }
  return false;
}

async function ulozUpravu(vratit) {
  const u = t.uprava;
  if (!u || u.uklada) return;
  if (u.editor) u.k.planek = u.editor.planek();
  const zmeny = zmenyUpravy();
  if (!vratit && !Object.keys(zmeny).length) { konecUpravy(); return; }
  if (!vratit && 'nazev' in zmeny && !zmeny.nazev) { toast('Název nesmí být prázdný.', true); return; }
  const okno = elementPanelu(OKNO);
  const tlacitko = okno && okno.querySelector(vratit ? '[data-tr-u-vratit]' : '[data-tr-u-ulozit]');
  u.uklada = true;
  if (tlacitko) { tlacitko.disabled = true; tlacitko.textContent = 'Ukládám…'; }
  try {
    const r = await volej('treninkUprava', vratit ? { id: u.id, vratit: true } : { id: u.id, zmeny });
    prijmiKartu(r);
    if (t.uprava === u) konecUpravy();
    toast(vratit ? 'Vrácená původní karta od Clauda' : 'Úpravy uložené');
  } catch (e) {
    u.uklada = false;
    if (tlacitko && tlacitko.isConnected) { tlacitko.disabled = false; tlacitko.textContent = vratit ? 'Vrátit původní' : 'Uložit'; }
    toast('Neuložilo se: ' + ((e && e.message) || 'chyba'), true);
  }
}

/** Uložená karta z motoru: do celých karet (i v zařízení) a do položky seznamu. */
function prijmiKartu(r) {
  const c = r && r.cvik;
  if (!c || !c.id) return;
  t.karty = t.karty || {};
  t.karty[c.id] = c;
  if (r.otiskKaret) t.kartyOtisk = r.otiskKaret;
  if (!jeDemo()) Pamet.pis('tr-karty', { otisk: t.kartyOtisk, karty: t.karty });
  if (t.cviky[c.id]) t.cviky[c.id].data = c;
  Pamet.smaz('tr-cvik:' + c.id);
  const x = najdi(c.id);
  if (x) {
    Object.assign(x, { nazev: c.nazev, kratce: String(c.kratce || '').slice(0, 400), hraci: c.hraci, delka: c.delka, planek: !!c.planek, upraveno: !!(c.upraveno || []).length });
    ['kratce', 'hraci', 'delka', 'planek', 'upraveno'].forEach((k) => { if (!x[k]) delete x[k]; });
    if (!jeDemo()) uloziste.pis(ULOZISTE, { data: t.data, kdy: t.kdy });
  }
  zmeneno();
}

let ptam = false;
function zeptatSeNaZavreni() {
  if (ptam) return;
  ptam = true;
  potvrd('Zahodit neuložené změny?', { text: 'Úpravy cviku nejsou uložené.', ano: 'Zahodit', ne: 'Upravovat dál', ton: 'nebezpeci' }).then((ano) => {
    ptam = false;
    if (!ano) return;
    zrusEditor();
    t.uprava = null;
    zavriPanel();
  });
}
// × a Esc v úpravách s neuloženou změnou se nejdřív zeptají (dřív, než okno zavře app.js)
document.addEventListener('click', (e) => {
  if (!(e.target.closest && e.target.closest('[data-panel="' + OKNO + '"] [data-zavrit-panel]')) || !neulozeno()) return;
  e.preventDefault();
  e.stopPropagation();
  zeptatSeNaZavreni();
}, true);
document.addEventListener('keydown', (e) => {
  const h = horniPanel();
  if (e.key !== 'Escape' || !h || h.id !== OKNO || ptam || nabidkaOtevrena() || document.querySelector('.okno-pozadi') || !neulozeno()) return;
  e.preventDefault();
  e.stopPropagation();
  zeptatSeNaZavreni();
}, true);

// ---------------------------------------------------------------- tisk na A4 (treninky.css: html.tisk-cviku, @page tisk-cviku)

function tiskni(id) {
  const c = kartaCviku(id);
  let el = document.getElementById('tr-tisk');
  if (!el) { el = document.createElement('div'); el.id = 'tr-tisk'; document.body.appendChild(el); }
  const seznam = (nadpis, body, cisla) => ((body || []).length ? '<h2>' + nadpis + '</h2><' + (cisla ? 'ol' : 'ul') + '>' +
    body.map((b) => '<li>' + podbarvit(esc(b)) + '</li>').join('') + '</' + (cisla ? 'ol' : 'ul') + '>' : '');
  const fakta = [['Hráči', c.hraci], ['Prostor', c.prostor], ['Délka', c.delka], ['Pomůcky', (c.pomucky || []).join(', ')]].filter((x) => x[1]).map((x) => x[0] + ': ' + x[1]).join(' · ');
  el.innerHTML = '<h1>' + esc(c.nazev || '') + '</h1>' + (fakta ? '<p class="tr-tisk__fakta">' + esc(fakta) + '</p>' : '') +
    (c.kratce ? '<div class="tr-tisk__kratce">' + odstavce(c.kratce) + '</div>' : '') +
    (c.planek ? planekSvg(c.planek, { tisk: true, legenda: true }) : '') + seznam('Průběh', c.kroky, true) +
    ((c.organizace || []).length ? '<h2>' + ((c.kroky || []).length ? 'Rozestavení a organizace' : 'Organizace a průběh') + '</h2>' + c.organizace.map(odstavce).join('') : '') +
    seznam('Na co dávat pozor', c.body) + seznam('Varianty a ztížení', c.varianty);
  document.documentElement.classList.add('tisk-cviku');
  window.print();
}
window.addEventListener('afterprint', () => document.documentElement.classList.remove('tisk-cviku'));

// ---------------------------------------------------------------- události

// Shift+klik nemá v seznamu označovat text
document.addEventListener('mousedown', (e) => {
  if (e.shiftKey && e.target.closest && e.target.closest('#p-treninky .tr-karta')) e.preventDefault();
}, true);

document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('[data-tr-otevri], [data-tr-filtr], [data-tr-znovu], [data-tr-hvezdy], [data-tr-oblibene], [data-tr-video-znovu], ' +
    '[data-tr-vyber], [data-tr-ikony-znovu], [data-tr-nahled-znovu], [data-tr-druh-vratit], [data-tr-skryt], ' +
    '[data-tr-upravit], [data-tr-tisk], [data-tr-smazat], [data-tr-chci], [data-tr-u-akce], [data-tr-u-pridat], [data-tr-planek], [data-tr-u-ulozit], [data-tr-u-zrusit], [data-tr-u-vratit]');
  if (!el) return;
  if (el.dataset.trOtevri) {
    const id = el.dataset.trOtevri;
    // výběr víc karet myší (s novým motorem – zápis pro víc cviků naráz)
    if (umi() && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      if (e.shiftKey && t.kotva) vyberRozsah(id); else prepniVyber(id);
      return;
    }
    zrusVyber(true);
    otevri(id);
    return;
  }
  if (el.dataset.trFiltr) {
    t.filtr = el.dataset.trFiltr === t.filtr && t.filtr !== 'vse' ? 'vse' : el.dataset.trFiltr;
    uloziste.pis(VOLBY, { filtr: t.filtr });
    zmeneno();
    return;
  }
  if (el.dataset.trVyber) {
    const ids = Array.from(t.vyber);
    const jak = el.dataset.trVyber;
    if (jak === 'zrusit') zrusVyber();
    else if (jak === 'oblibene') doOblibenych(ids);
    else if (jak === 'skryt') skryj(ids, platnyFiltr() !== 'skryte');
    else if (jak === 'smazat') smazCviky(ids);
    else if (jak === 'presunout') { const r = el.getBoundingClientRect(); otevriNabidku(r.left, r.bottom + 4, nabidkaPresunu(ids), el); }
    return;
  }
  if (el.hasAttribute('data-tr-znovu')) { nactiTreninky(true); zmeneno(); return; }
  if (klikUpravy(el)) return;
  if (el.hasAttribute('data-tr-ikony-znovu')) { t.ikonyChyba = false; t.ikonyPokus = 0; zarad(() => nactiIkony(true)); zmeneno(); return; }
  const id = t.vybrany;
  if (!id) return;
  if (el.dataset.trHvezdy) { const i = Number(el.dataset.trHvezdy); zmenMoje(id, { hvezdy: moje(id).hvezdy === i ? 0 : i }); return; }
  if (el.hasAttribute('data-tr-oblibene')) { zmenMoje(id, { oblibene: !moje(id).oblibene }); return; }
  if (el.hasAttribute('data-tr-druh-vratit')) { const c = najdi(id); if (c) presun([id], druhy().indexOf(c.druh) >= 0 ? c.druh : 'ostatní'); return; }
  if (el.hasAttribute('data-tr-skryt')) { skryj([id], !moje(id).skryty); return; }
  if (el.hasAttribute('data-tr-smazat')) { smazCviky([id]); return; }
  if (el.hasAttribute('data-tr-chci')) { chciPlanek([id], !moje(id).chciPlanek); return; }
  if (el.hasAttribute('data-tr-nahled-znovu')) { delete t.nahledy[id]; nactiNahled(id); prekresliOkno(id); return; }
  if (el.hasAttribute('data-tr-video-znovu')) {
    const n = t.nahledy[id];
    if (n) { n.videoChyba = false; delete n.videoEl; }
    nactiVideo(id);
    prekresliOkno(id);
  }
});

document.addEventListener('input', (e) => {
  if (!e.target.matches) return;
  if (pisUpravu(e.target)) return;
  if (!e.target.matches('[data-tr-hledat]')) return;
  t.dotaz = e.target.value;
  zmeneno();
});

// poznámka se uloží po opuštění pole (ne při každém písmenu); druh hned po výběru
document.addEventListener('change', (e) => {
  if (!e.target.matches || !t.vybrany) return;
  if (e.target.matches('[data-tr-druh]')) { presun([t.vybrany], e.target.value); return; }
  if (!e.target.matches('[data-tr-poznamka]')) return;
  const text = e.target.value.trim();
  if (text !== (moje(t.vybrany).poznamka || '')) zmenMoje(t.vybrany, { poznamka: text });
});

// Esc zruší výběr (když není otevřené okno ani nabídka)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !t.vyber.size || stav.pohled !== 'treninky' || horniPanel() || nabidkaOtevrena()) return;
  e.preventDefault();
  e.stopPropagation();
  zrusVyber();
}, true);

// ---------------------------------------------------------------- přetažení karty (nebo výběru) na druh – jen myš (vzor: pošta → skupiny)

const tah = { ids: null, cil: null, odlozeno: false };
function cilTahu(e) {
  const c = e.target.closest && e.target.closest('#p-treninky [data-tr-filtr], #p-treninky [data-tr-oddil]');
  const druh = c && (c.dataset.trFiltr || c.dataset.trOddil);
  return druh && druhy().indexOf(druh) >= 0 ? c : null;
}
function oznacCil(c) {
  if (tah.cil === c) return;
  if (tah.cil) tah.cil.classList.remove('cil');
  tah.cil = c;
  if (c) c.classList.add('cil');
}
function konecTahu() {
  if (!tah.ids) return;
  oznacCil(null);
  tah.ids = null;
  document.documentElement.classList.remove('tahne-treninky');
  if (tah.odlozeno) { tah.odlozeno = false; zmeneno(); }
}
document.addEventListener('dragstart', (e) => {
  const b = e.target.closest && e.target.closest('#p-treninky .tr-karta[draggable="true"]');
  if (!b) return;
  const id = b.dataset.trOtevri;
  tah.ids = t.vyber.size > 1 && t.vyber.has(id) ? Array.from(t.vyber) : [id];
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  const nahled = document.createElement('div');
  nahled.className = 'posta-tah';
  nahled.textContent = tah.ids.length > 1 ? pocetCviku(tah.ids.length) : (najdi(id) || {}).nazev || '';
  document.body.appendChild(nahled);
  try { e.dataTransfer.setDragImage(nahled, 16, 16); } catch (x) { /* výchozí obrázek */ }
  setTimeout(() => nahled.remove(), 0);
  document.documentElement.classList.add('tahne-treninky');
});
document.addEventListener('dragover', (e) => {
  if (!tah.ids) return;
  const c = cilTahu(e);
  oznacCil(c);
  if (!c) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
});
document.addEventListener('drop', (e) => {
  if (!tah.ids) return;
  const c = cilTahu(e);
  const ids = tah.ids;
  konecTahu();
  if (!c) return;
  e.preventDefault();
  presun(ids, c.dataset.trFiltr || c.dataset.trOddil);
});
document.addEventListener('dragend', konecTahu);
