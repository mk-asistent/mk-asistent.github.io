// Asistent – start, navigace (postranní panel, horní lišta s hledáním, spodní lišta na telefonu), hlavička,
// přehled Dnes (čísla, grafy, co čeká) a ovládání (klepnutí, klávesy). Vzhled: styl „Fixtrack“, skill osobni-vzhled.

import { stav, priZmene, zmeneno, prejdi } from './stav.js';
import { jePripojeno, jeDemo } from './api.js';
import { esc, pridejDny, pulnoc, datumDlouhe, hhmm, iniciala, odstin, tvar, velkePrvni, rozdilDni, uloziste } from './pomocne.js';
import { kostra, chybaHtml, hlavickaKarty } from './ui.js';
import { IKONY } from './ikony.js';
import { zavriPanel, horniPanel } from './panely.js';
import { pulkruh, tydenGraf } from './grafy.js';
import * as schranka from './schranka.js';
import * as posta from './posta.js';
import * as kal from './kalendar.js';
import * as nast from './nastaveni.js';
import * as hledat from './hledat.js';
import * as udalost from './udalost.js';

const SEKCE = [['dnes', 'Dnes'], ['schranka', 'Schránka'], ['posta', 'Pošta'], ['kalendar', 'Kalendář']];
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- start

function start() {
  $('uvod').hidden = true;
  $('aplikace').hidden = false;
  stav.info = uloziste.cti('asistent.info');
  schranka.nactiZUloziste();
  posta.nactiZUloziste();
  kal.nactiZUloziste();
  if (!SEKCE.some((s) => s[0] === stav.pohled)) stav.pohled = 'dnes';
  kal.pripravGesta($('p-kalendar'));
  priZmene(vykresli);
  vykresli();
  obnovVse(false);
}

function obnovVse(znovu) {
  stav.naposledy = Date.now();
  schranka.nactiSchranku();
  posta.nactiPostu(znovu);
  kal.nactiKalendar(znovu);
  nast.nactiInfo();
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
    dnes: kal.udalostiDne(Date.now())
  };
}

function nacitaSe() { return Object.keys(stav.nacita).some((k) => stav.nacita[k]) || kal.nacitaSe(); }

// ---------------------------------------------------------------- vykreslení

function vykresli() {
  const p = pocty();
  document.querySelectorAll('[data-pohled]').forEach((el) => { el.hidden = el.dataset.pohled !== stav.pohled; });
  vykresliRail(p);
  vykresliHorni();
  vykresliHlavu(p);
  vykresliPruhy();
  vykresliListu(p);
  const el = $('p-' + stav.pohled);
  if (stav.pohled === 'dnes') vykresliDnes(el, p);
  else if (stav.pohled === 'schranka') schranka.vykresliSchranku(el);
  else if (stav.pohled === 'posta') posta.vykresliPostu(el);
  else kal.vykresliKalendar(el);
}

function odznakSekce(sekce, p) {
  return { schranka: p.ceka.length, posta: p.nep.length }[sekce] || 0;
}

/** Postranní panel: logo, sekce s počty, Nastavení, kdo je připojený. Na iPadu jen ikony (CSS). */
function vykresliRail(p) {
  const ucet = (stav.info && stav.info.ucet) || (jeDemo() ? 'ukázka' : '');
  const pripojeni = jeDemo() ? ['ukazka', 'ukázková data'] : navigator.onLine === false ? ['offline', 'offline']
    : stav.chyby.info ? ['offline', 'nepřipojeno – viz Nastavení'] : stav.info ? ['', 'připojeno'] : ['ukazka', 'připojuji…'];
  const tl = (atr, nazev, ikona, n, aktivni) => '<button type="button" class="rail__btn" ' + atr + ' title="' + nazev + '" aria-label="' + nazev +
    (n ? ', ' + n : '') + '"' + (aktivni ? ' aria-current="page"' : '') + '>' + ikona + '<span>' + nazev + '</span>' +
    (n ? '<span class="pocet cisla">' + n + '</span>' : '') + '</button>';
  $('rail').innerHTML =
    '<button type="button" class="rail__logo" data-cil="dnes" title="Dnes – hlavní stránka" aria-label="Asistent – hlavní stránka">' +
      '<span class="znak">' + IKONY.dnes + '</span><div><b>Asistent</b><small>osobní přehled</small></div></button>' +
    '<div class="rail__sekce">Hlavní</div>' +
    SEKCE.map((s) => tl('data-cil="' + s[0] + '"', s[1], IKONY[s[0]], odznakSekce(s[0], p), stav.pohled === s[0])).join('') +
    '<div class="rail__spodek"><div class="rail__sekce">Účet</div>' +
      tl('data-otevri-nastaveni', 'Nastavení', IKONY.nastaveni, 0, false) +
      '<div class="rail__ja" title="' + esc(ucet) + '">' +
        '<span class="avatar" style="--h:' + odstin(ucet || 'A') + '">' + esc(iniciala(String(ucet || 'A').split('@')[0].replace(/[._\d]+/g, ' '))) + '</span>' +
        '<div><b>' + esc(ucet || 'Asistent') + '</b><small><i class="' + pripojeni[0] + '"></i>' + pripojeni[1] + '</small></div></div>' +
    '</div>';
}

/** Hlavní akce sekce (vpravo nahoře): poznámka, nový e-mail, přidat kalendář. */
function hlavniAkce() {
  if (stav.pohled === 'posta') return '<button type="button" class="btn btn--primary" data-psat="novy">' + IKONY.psat + '<span>Nový e-mail</span></button>';
  if (stav.pohled === 'kalendar') return '<button type="button" class="btn btn--primary" data-nova-udalost>' + IKONY.plus + '<span>Nová událost</span></button>';
  return '<button type="button" class="btn btn--primary" data-nova-poznamka>' + IKONY.plus + '<span>Poznámka pro Clauda</span></button>';
}

/** Horní lišta (iPad, PC): hledání vlevo, obnovit a hlavní akce vpravo. */
function vykresliHorni() {
  $('horni').innerHTML = '<button type="button" class="hledat-tl" data-hledat>' + IKONY.hledat +
    '<span>Hledat v poště, schránce a kalendáři…</span><kbd>' + (MAC ? '⌘ K' : 'Ctrl K') + '</kbd></button>' +
    '<div class="horni__akce"><button type="button" class="btn btn--ikona' + (nacitaSe() ? ' toci' : '') + '" data-obnovit aria-label="Obnovit" title="Obnovit">' +
    IKONY.obnovit + '</button>' + hlavniAkce() + '</div>';
}

function vykresliHlavu(p) {
  const titul = SEKCE.find((s) => s[0] === stav.pohled)[1];
  let pod = '';
  if (stav.pohled === 'dnes') {
    pod = esc(velkePrvni(datumDlouhe(Date.now())));
    if (stav.schranka && stav.posta) {
      const n = p.ceka.length + p.pozornost.length;
      pod += ' · ' + (n ? n + ' ' + tvar(n, 'věc čeká', 'věci čekají', 'věcí čeká') + ' na tebe' : 'nic na tebe nečeká');
    }
  } else if (stav.pohled === 'schranka') {
    pod = stav.schranka ? p.ceka.length + ' čeká na tebe · ' + p.uClauda.length + ' u Clauda' : 'Načítám…';
  } else if (stav.pohled === 'posta') {
    pod = stav.posta ? p.pozornost.length + ' ' + tvar(p.pozornost.length, 'konverzace čeká', 'konverzace čekají', 'konverzací čeká') + ' na tebe' +
      (p.hori ? ' · ' + p.hori + ' hoří' : '') + ' · ' + (posta.maPracovni() ? 'osobní a pracovní' : 'osobní Gmail') : 'Načítám…';
  } else {
    pod = esc(kal.nadpisObdobi());
  }
  $('hlava').innerHTML = '<div class="hlava-radek"><div class="hlava-titul"><h1>' + esc(titul) + '</h1>' + (pod ? '<p>' + pod + '</p>' : '') + '</div>' +
    '<div class="hlava-akce jen-telefon">' +
      '<button type="button" class="btn btn--ikona" data-hledat aria-label="Hledat">' + IKONY.hledat + '</button>' +
      '<button type="button" class="btn btn--ikona' + (nacitaSe() ? ' toci' : '') + '" data-obnovit aria-label="Obnovit">' + IKONY.obnovit + '</button>' +
      (stav.pohled === 'posta' ? '<button type="button" class="btn btn--ikona btn--plna" data-psat="novy" aria-label="Nový e-mail">' + IKONY.psat + '</button>' : '') +
      (stav.pohled === 'kalendar' ? '<button type="button" class="btn btn--ikona btn--plna" data-nova-udalost aria-label="Nová událost">' + IKONY.plus + '</button>' : '') +
      '<button type="button" class="btn btn--ikona" data-otevri-nastaveni aria-label="Nastavení">' + IKONY.nastaveni + '</button>' +
    '</div></div>';
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
  $('pruhy').innerHTML = pruhy.join('');
}

function vykresliListu(p) {
  $('lista').innerHTML = SEKCE.map((s) => {
    const n = odznakSekce(s[0], p);
    return '<button type="button" data-cil="' + s[0] + '"' + (stav.pohled === s[0] ? ' aria-current="page"' : '') + '>' +
      IKONY[s[0]] + '<span>' + s[1] + '</span>' + (n ? '<span class="odznak cisla">' + n + '</span>' : '') + '</button>';
  }).join('');
}

// ---------------------------------------------------------------- Dnes

function kpi(atributy, ikona, nazev, hodnota, jednotka, pod) {
  return '<button type="button" class="kpi" ' + atributy + '>' +
    '<span class="kpi__hlava">' + ikona + '<span>' + nazev + '</span></span><span class="sipka" aria-hidden="true">' + IKONY.sipka + '</span>' +
    '<span class="kpi__hodnota">' + hodnota + (jednotka ? '<small>' + jednotka + '</small>' : '') + '</span>' +
    '<span class="kpi__pod">' + pod + '</span></button>';
}

function sipkaKarty(atributy, popisek) {
  return '<button type="button" class="sipka" ' + atributy + ' aria-label="' + popisek + '" title="' + popisek + '">' + IKONY.sipka + '</button>';
}

function vykresliDnes(el, p) {
  if (!el.querySelector('#dnes-obsah')) {
    el.innerHTML = '<div class="kpi-mrizka" id="dnes-kpi"></div><div class="dnes-mrizka" id="dnes-obsah">' +
      '<section class="card dlazdice dl-ceka" id="dl-ceka"></section>' +
      '<section class="card dlazdice dl-posta" id="dl-posta"></section>' +
      '<section class="card dlazdice dl-tyden" id="dl-tyden"></section>' +
      '<section class="card dlazdice dl-schranka" id="dl-schranka"></section>' +
      '<section class="card dlazdice dl-zapis">' + hlavickaKarty(IKONY.claude, 'Poznámka pro Clauda') +
        schranka.zapisHtml(true) + '<div class="dlazdice__telo" id="dl-zapis-seznam"></div></section>' +
    '</div>';
  }
  const dnes = pulnoc(Date.now());
  const ceka = '–';

  // ---- čísla nahoře
  const t = p.terminy;
  const ukoly = p.ceka.filter((x) => schranka.skupina(x) === 'ukol').length;
  const dalsi = kal.nejblizsi(1, 1).filter((u) => !u.celodenni && pulnoc(u.zacatek) === dnes)[0];
  el.querySelector('#dnes-kpi').innerHTML =
    kpi('data-cil="schranka" data-filtr-schranky="vse"', IKONY.schranka, 'Čeká na tebe', stav.schranka ? p.ceka.length : ceka,
      stav.schranka ? tvar(p.ceka.length, 'věc', 'věci', 'věcí') : '',
      (t.poTerminu ? '<span class="tag tag--danger">' + t.poTerminu + ' po termínu</span>' : t.dnes ? '<span class="tag tag--warn">' + t.dnes + ' dnes</span>' : '') +
      '<span>' + ukoly + ' ' + tvar(ukoly, 'úkol', 'úkoly', 'úkolů') + ' · ' + (p.ceka.length - ukoly) + ' rozhodnutí</span>') +
    kpi('data-cil="posta" data-filtr-posty="vse"', IKONY.posta, 'Pošta', stav.posta ? p.pozornost.length : ceka,
      stav.posta ? tvar(p.pozornost.length, 'čeká', 'čekají', 'čeká') : '',
      (p.hori ? '<span class="tag tag--danger">' + p.hori + ' hoří</span>' : '') + '<span>' + p.nep.length + ' ' + tvar(p.nep.length, 'nepřečtená', 'nepřečtené', 'nepřečtených') + '</span>') +
    kpi('data-cil="kalendar"', IKONY.kalendar, 'Dnes v kalendáři', kal.mameData(dnes) ? p.dnes.length : ceka,
      kal.mameData(dnes) ? tvar(p.dnes.length, 'událost', 'události', 'událostí') : '',
      dalsi ? '<span class="tag">' + hhmm(dalsi.zacatek) + '</span><span class="orez-1">' + esc(dalsi.nazev) + '</span>' : '<span>' + (p.dnes.length ? 'na dnes hotovo' : 'volný den') + '</span>') +
    kpi('data-cil="schranka" data-filtr-schranky="nove"', IKONY.claude, 'U Clauda', stav.schranka ? p.uClauda.length : ceka,
      stav.schranka ? tvar(p.uClauda.length, 'poznámka', 'poznámky', 'poznámek') : '',
      p.uClauda.length ? '<span class="tag tag--fialova">zpracuju ráno</span>' : '<span>vše zpracované</span>');

  // ---- čeká na tebe (úkoly a rozhodnutí ze schránky)
  let c;
  if (!stav.schranka) c = stav.chyby.schranka ? chybaHtml(stav.chyby.schranka, 'data-schranka-znovu') : kostra(3);
  else if (!p.ceka.length) c = '<div class="prazdne">Nic nečeká – všechno vyřízené.</div>';
  else c = '<ul class="seznam">' + p.ceka.slice(0, 8).map((x) => schranka.polozkaHtml(x, true)).join('') + '</ul>';
  el.querySelector('#dl-ceka').innerHTML = hlavickaKarty(IKONY.fajfka, 'Čeká na tebe' + (p.ceka.length ? ' · ' + p.ceka.length : ''),
    sipkaKarty('data-cil="schranka" data-filtr-schranky="vse"', 'Otevřít schránku')) + '<div class="dlazdice__telo">' + c + '</div>' +
    (p.ceka.length > 8 ? '<button type="button" class="dlazdice__pata" data-cil="schranka">Všech ' + p.ceka.length + ' ve schránce</button>' : '');

  // ---- pošta, která na tebe čeká
  let m;
  if (!stav.posta) m = stav.chyby.posta ? chybaHtml(stav.chyby.posta, 'data-posta-znovu') : kostra(4);
  else if (!p.pozornost.length) m = '<div class="prazdne">Nic nehoří a nic nečeká na tvou odpověď.</div>';
  else m = '<ul class="seznam">' + p.pozornost.slice(0, 8).map((x) => posta.zpravaRadekHtml(x, posta.maPracovni())).join('') + '</ul>';
  el.querySelector('#dl-posta').innerHTML = hlavickaKarty(IKONY.posta, 'Pošta · čeká na tebe',
    sipkaKarty('data-cil="posta" data-filtr-posty="vse"', 'Otevřít poštu')) + '<div class="dlazdice__telo">' + m + '</div>' +
    (stav.posta ? '<button type="button" class="dlazdice__pata" data-cil="posta" data-filtr-posty="vse">Celá pošta · ' + posta.vsechnyZpravy().length + '</button>' : '');

  // ---- tento týden: sloupce, další událost, dnešek
  const tyden = kal.tydenPrehled();
  const celkem = tyden.reduce((a, d) => a + d.pocet, 0);
  const pristi = kal.nejblizsi(1, 14)[0];
  let k = '<div class="dlazdice__cislo"><b class="cisla">' + (kal.mameData(dnes) ? celkem : '–') + '</b><small>' + tvar(celkem, 'událost', 'události', 'událostí') + ' tento týden</small></div>' +
    tydenGraf(tyden);
  if (pristi) {
    const den = pulnoc(pristi.zacatek);
    const kdy = rozdilDni(den) === 0 ? 'Dnes' : rozdilDni(den) === 1 ? 'Zítra' : velkePrvni(datumDlouhe(den));
    k += '<button type="button" class="tmava-karta" data-udalost="' + esc(pristi.id) + '"><small>Další</small><b>' + esc(pristi.nazev) + '</b>' +
      '<span>' + esc(kdy) + (pristi.celodenni ? ' · celý den' : ' · ' + hhmm(pristi.zacatek) + '–' + hhmm(pristi.konec)) + (pristi.misto ? ' · ' + esc(pristi.misto) : '') + '</span></button>';
  }
  const zitra = pridejDny(dnes, 1);
  const udZitra = kal.udalostiDne(zitra);
  if (!kal.mameData(dnes)) k += kostra(2);
  else {
    k += [[dnes, p.dnes, 'Dnes'], [zitra, udZitra, 'Zítra']].filter((x) => x[1].length).map((x) =>
      '<div class="dlazdice__mezinadpis">' + x[2] + '</div><ul class="seznam">' + x[1].map((u) => kal.udalostHtml(u, x[0])).join('') + '</ul>').join('');
  }
  el.querySelector('#dl-tyden').innerHTML = hlavickaKarty(IKONY.kalendar, 'Tento týden', sipkaKarty('data-cil="kalendar"', 'Otevřít kalendář')) +
    '<div class="dlazdice__telo">' + k + '</div>';

  // ---- schránka v půlkruhu
  let s;
  if (!stav.schranka) s = kostra(4);
  else {
    const sk = schranka.skupinyPocty();
    const otevrenych = sk.ukol + sk.rozhodni + sk.nove + sk.napad;
    const popis = { ukol: t.poTerminu ? t.poTerminu + ' po termínu' : t.dnes ? t.dnes + ' na dnes' : 'podle termínu',
      rozhodni: 'čeká na tvé ano', nove: 'zpracuju při další schránce', napad: 'na později' };
    s = pulkruh(schranka.SKUPINY.filter((g) => g[0] !== 'hotovo').map((g) => [sk[g[0]], g[2]]), otevrenych, tvar(otevrenych, 'otevřená', 'otevřené', 'otevřených')) +
      '<ul class="legenda">' + schranka.SKUPINY.filter((g) => g[0] !== 'hotovo').map((g) =>
        '<li><button type="button" class="legenda-radek" data-cil="schranka" data-filtr-schranky="' + g[0] + '"><i style="--b:' + g[2] + '"></i>' +
        '<span><b>' + g[1] + '</b><small>' + popis[g[0]] + '</small></span><em>' + sk[g[0]] + '</em></button></li>').join('') + '</ul>';
  }
  el.querySelector('#dl-schranka').innerHTML = hlavickaKarty(IKONY.schranka, 'Schránka', sipkaKarty('data-cil="schranka" data-filtr-schranky="vse"', 'Otevřít schránku')) +
    '<div class="dlazdice__telo">' + s + '</div>';

  // ---- poznámka pro Clauda: pod polem to, co u Clauda leží
  el.querySelector('#dl-zapis-seznam').innerHTML = p.uClauda.length
    ? '<div class="dlazdice__mezinadpis">U Clauda · ' + p.uClauda.length + '</div><ul class="seznam">' + p.uClauda.slice(0, 4).map((x) => schranka.polozkaHtml(x, false)).join('') + '</ul>'
    : '<p class="poznamka-pod dlazdice__napoveda">Co sem napíšeš, zpracuju při další schránce. Z iPhonu jde totéž hlasem přes zkratku „Pro Clauda“.</p>';
}

// ---------------------------------------------------------------- ovládání

document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a[data-cil], [data-udalost]');
  if (!el || el.closest('#uvod')) return;

  if (el.hasAttribute('data-zavrit-panel')) { zavriPanel(); return; }
  if (hledat.klikHledat(el)) return;
  if (el.dataset.cil) {
    // proklik rovnou s filtrem (z čísel a karet na Dnes)
    if (el.dataset.filtrPosty) { stav.filtrPosty = el.dataset.filtrPosty; }
    if (el.dataset.filtrSchranky) { stav.filtrSchranky = el.dataset.filtrSchranky; }
    prejdi(el.dataset.cil);
    zmeneno();
    return;
  }
  if (el.hasAttribute('data-obnovit')) { obnovVse(true); return; }
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
  if (schranka.klikSchranka(el)) return;
  if (posta.klikPosta(el)) return;
  if (udalost.klikUdalost(el)) return;
  if (kal.klikKalendar(el)) return;
  nast.klikNastaveni(el);
});

document.addEventListener('input', (e) => {
  if (hledat.vstupHledat(e)) return;
  if (udalost.vstupUdalost(e)) return;
  if (schranka.vstupSchranka(e)) return;
  posta.vstupPosta(e);
});

document.addEventListener('change', (e) => { if (!udalost.zmenaUdalost(e)) nast.zmenaNastaveni(e); });

function pise(e) {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

document.addEventListener('keydown', (e) => {
  if ($('aplikace').hidden) return;
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
  if (!horniPanel() && /^[1-4]$/.test(e.key)) { prejdi(SEKCE[Number(e.key) - 1][0]); return; }
  if (!horniPanel() && stav.pohled === 'kalendar' && e.key.toLowerCase() === 'n') { udalost.otevriFormular({ den: stav.kal.vybrany }); return; }
  if (posta.klavesaPosta(e)) e.preventDefault();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && jePripojeno() && Date.now() - stav.naposledy > 60000) obnovVse(false);
});
window.addEventListener('online', () => { zmeneno(); if (jePripojeno()) obnovVse(false); });
window.addEventListener('offline', zmeneno);

// ---------------------------------------------------------------- spuštění

nast.aplikujVzhled();
if (jePripojeno()) start(); else nast.vykresliUvod(start);

// service worker jen na https (GitHub Pages) – v místním náhledu by držel staré soubory
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* aplikace jede i bez něj */ }));
}
