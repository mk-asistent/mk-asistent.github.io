// Asistent – start, navigace (pruh ikon, postranní panel, spodní lišta), hlavička, pohled Dnes, načítání a ovládání.

import { stav, priZmene, zmeneno } from './stav.js';
import { jePripojeno, jeDemo } from './api.js';
import { esc, pridejDny, pulnoc, datumDlouhe, hhmm, iniciala, odstin, tvar, uloziste, terminDatum, rozdilDni } from './pomocne.js';
import { kostra, chybaHtml } from './ui.js';
import { IKONY } from './ikony.js';
import { zavriPanel, horniPanel } from './panely.js';
import * as schranka from './schranka.js';
import * as posta from './posta.js';
import * as kal from './kalendar.js';
import * as nast from './nastaveni.js';

const SEKCE = [['dnes', 'Dnes'], ['schranka', 'Schránka'], ['posta', 'Pošta'], ['kalendar', 'Kalendář']];
const SIROKE_OKNO = window.matchMedia('(min-width: 1000px)');
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

function prepni(pohled) {
  if (stav.pohled === pohled) { window.scrollTo(0, 0); return; }
  stav.pohled = pohled;
  uloziste.pis('asistent.pohled', pohled);
  vykresli();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- počty pro navigaci

function pocty() {
  const nep = posta.neprectene();
  return {
    ceka: schranka.naTebe(),
    uClauda: schranka.uClauda(),
    nep,
    nepOsobni: nep.filter((m) => m.ucet !== 'pracovni').length,
    nepPracovni: nep.filter((m) => m.ucet === 'pracovni').length,
    dnes: kal.udalostiDne(Date.now())
  };
}

// ---------------------------------------------------------------- vykreslení

function vykresli() {
  const p = pocty();
  document.querySelectorAll('[data-pohled]').forEach((el) => { el.hidden = el.dataset.pohled !== stav.pohled; });
  vykresliRail(p);
  vykresliBocni(p);
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

function vykresliRail(p) {
  const ucet = (stav.info && stav.info.ucet) || (jeDemo() ? 'Ukázka' : '');
  $('rail').innerHTML = '<div class="rail__logo" title="Asistent">' + IKONY.dnes + '</div>' +
    SEKCE.map((s) => {
      const n = odznakSekce(s[0], p);
      return '<button type="button" class="rail__btn" data-cil="' + s[0] + '" title="' + s[1] + '" aria-label="' + s[1] + '"' +
        (stav.pohled === s[0] ? ' aria-current="page"' : '') + '>' + IKONY[s[0]] + (n ? '<span class="odznak cisla">' + n + '</span>' : '') + '</button>';
    }).join('') +
    '<div class="rail__spodek">' +
      '<button type="button" class="rail__btn" data-otevri-nastaveni title="Nastavení" aria-label="Nastavení">' + IKONY.nastaveni + '</button>' +
      (ucet ? '<span class="avatar rail__ja" style="--h:' + odstin(ucet) + '" title="' + esc(ucet) + '">' + esc(iniciala(ucet.split('@')[0].replace(/[._]/g, ' '))) + '</span>' : '') +
    '</div>';
}

function polozkaBocni(text, atributy, pocet, aktivni, znak) {
  return '<button type="button" class="bocni__polozka" ' + atributy + (aktivni ? ' aria-current="true"' : '') + '>' +
    (znak || '') + '<span>' + text + '</span>' + (pocet ? '<span class="pocet cisla">' + pocet + '</span>' : '') + '</button>';
}

function vykresliBocni(p) {
  let h = '<div class="bocni__nadpis">' + SEKCE.find((s) => s[0] === stav.pohled)[1] + '</div>';
  const znak = (barva, plny) => '<i class="znak' + (plny ? ' plny' : '') + '" style="--b:' + barva + '"></i>';
  if (stav.pohled === 'dnes') {
    h += '<div class="bocni__sekce">Přehled</div>' +
      polozkaBocni('Čeká na tebe', 'data-cil="schranka"', p.ceka.length, false, znak('var(--warn)')) +
      polozkaBocni('U Clauda', 'data-cil="schranka"', p.uClauda.length, false, znak('var(--fialova)')) +
      polozkaBocni('Nepřečtená pošta', 'data-cil="posta" data-filtr-posty="neprectene"', p.nep.length, false, znak('var(--accent)')) +
      polozkaBocni('Dnes v kalendáři', 'data-cil="kalendar"', p.dnes.length, false, znak('var(--ok)'));
    h += '<div class="bocni__spodek"><button type="button" class="btn btn--primary" data-nova-poznamka>' + IKONY.plus + 'Poznámka pro Clauda</button></div>';
  } else if (stav.pohled === 'schranka') {
    const sk = schranka.skupinyPocty();
    h += '<div class="bocni__sekce">Skupiny</div>' + schranka.SKUPINY.map((s) =>
      polozkaBocni(s[1], 'data-skoc-skupina="' + s[0] + '"', sk[s[0]], false, znak(s[2]))).join('');
    h += '<div class="bocni__spodek"><button type="button" class="btn btn--primary" data-nova-poznamka>' + IKONY.plus + 'Poznámka pro Clauda</button></div>';
  } else if (stav.pohled === 'posta') {
    const vse = posta.vsechnyZpravy();
    h += '<div class="bocni__sekce">Schránky</div>' +
      polozkaBocni('Vše', 'data-filtr-posty="vse"', vse.length, stav.filtrPosty === 'vse', znak('var(--muted)')) +
      polozkaBocni('Nepřečtené', 'data-filtr-posty="neprectene"', p.nep.length, stav.filtrPosty === 'neprectene', znak('var(--accent)', true)) +
      polozkaBocni('Osobní', 'data-filtr-posty="osobni"', vse.filter((m) => m.ucet === 'osobni').length, stav.filtrPosty === 'osobni', znak('var(--muted)')) +
      polozkaBocni('Pracovní', 'data-filtr-posty="pracovni"', vse.filter((m) => m.ucet === 'pracovni').length, stav.filtrPosty === 'pracovni', znak('var(--fialova)'));
    h += '<div class="bocni__spodek"><button type="button" class="btn btn--primary" data-psat="novy">' + IKONY.psat + 'Nový e-mail</button></div>';
  } else {
    h += kal.miniMesicHtml();
    const kalendare = (stav.info && stav.info.kalendare) || [];
    if (kalendare.length) {
      h += '<div class="bocni__sekce">Kalendáře</div>' + kalendare.map((k) => '<label class="bocni__polozka">' + znak(esc(k.barva), true) +
        '<span>' + esc(k.nazev) + '</span><input type="checkbox" data-nast-kal-zobrazit="' + esc(k.id) + '"' + (k.skryty ? '' : ' checked') +
        ' aria-label="Ukazovat ' + esc(k.nazev) + '"></label>').join('');
    }
    h += '<div class="bocni__spodek"><button type="button" class="btn btn--ghost" data-otevri-nastaveni="kalendare">' + IKONY.plus + 'Přidat kalendář z iPhonu</button></div>';
  }
  $('bocni').innerHTML = h;
}

function vykresliHlavu(p) {
  let titul = SEKCE.find((s) => s[0] === stav.pohled)[1];
  let pod = '';
  let akce = '';
  let zalozky = '';
  if (stav.pohled === 'dnes') {
    pod = datumDlouhe(Date.now());
    pod = pod.charAt(0).toUpperCase() + pod.slice(1);
  } else if (stav.pohled === 'schranka') {
    pod = stav.schranka ? p.ceka.length + ' čeká na tebe · ' + p.uClauda.length + ' u Clauda' : 'Načítám…';
  } else if (stav.pohled === 'posta') {
    pod = stav.posta ? p.nep.length + ' ' + tvar(p.nep.length, 'nepřečtená', 'nepřečtené', 'nepřečtených') +
      (posta.maPracovni() ? ' · osobní a pracovní' : ' · osobní Gmail') : 'Načítám…';
    akce = '<button type="button" class="btn btn--primary" data-psat="novy" aria-label="Nový e-mail">' + IKONY.psat + '<span class="jen-siroke">Nový e-mail</span></button>';
    const vse = posta.vsechnyZpravy();
    zalozky = '<div class="zalozky jen-uzke" role="tablist">' + [
      ['vse', 'Vše', vse.length, false], ['neprectene', 'Nepřečtené', p.nep.length, true],
      ['osobni', 'Osobní', vse.filter((m) => m.ucet === 'osobni').length, false], ['pracovni', 'Pracovní', vse.filter((m) => m.ucet === 'pracovni').length, false]
    ].map((z) => '<button type="button" class="zalozka" data-filtr-posty="' + z[0] + '" aria-current="' + (stav.filtrPosty === z[0]) + '">' + z[1] +
      (z[2] ? (z[3] ? '<span class="odznak-tab cisla">' + z[2] + '</span>' : '<span class="pocet cisla">' + z[2] + '</span>') : '') + '</button>').join('') + '</div>';
  } else {
    pod = kal.nadpisObdobi();
  }
  const nacita = Object.keys(stav.nacita).some((k) => stav.nacita[k]) || kal.nacitaSe();
  $('hlava').innerHTML = '<div class="hlava-radek"><div class="hlava-titul"><h1>' + esc(titul) + '</h1>' + (pod ? '<p>' + esc(pod) + '</p>' : '') + '</div>' +
    '<div class="hlava-akce">' +
      '<button type="button" class="btn btn--ikona' + (nacita ? ' toci' : '') + '" id="obnovit" aria-label="Obnovit" title="Obnovit">' + IKONY.obnovit + '</button>' +
      '<button type="button" class="btn btn--ikona jen-telefon" data-otevri-nastaveni aria-label="Nastavení">' + IKONY.nastaveni + '</button>' +
      akce + '</div></div>' + zalozky;
}

function vykresliPruhy() {
  const pruhy = [];
  if (jeDemo()) pruhy.push('<p class="pruh pruh-ukazka">Ukázková data – skutečná se ukážou po připojení motoru v Nastavení.</p>');
  if (navigator.onLine === false) pruhy.push('<p class="pruh pruh-offline">Jsi offline – ukazuju naposledy uložená data.</p>');
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

function kpi(cil, ikona, nazev, hodnota, pod, pruh, atributy) {
  return '<button type="button" class="kpi" data-cil="' + cil + '"' + (atributy || '') + '>' +
    '<span class="kpi__hlava"><span class="kpi__ikona">' + ikona + '</span>' + nazev + '</span>' +
    '<span class="kpi__hodnota">' + hodnota + '</span>' +
    '<span class="kpi__pod">' + pod + '</span>' +
    (pruh ? '<span class="kpi__pruh">' + pruh + '</span>' : '') + '</button>';
}

function vykresliDnes(el, p) {
  if (!el.querySelector('#dnes-obsah')) {
    el.innerHTML = '<div class="kpi-mrizka" id="dnes-kpi"></div><div class="zapis-misto">' + schranka.zapisHtml() + '</div><div id="dnes-obsah"></div>';
  }
  const dnes = pulnoc(Date.now()), zitra = pridejDny(dnes, 1);
  const udZitra = kal.udalostiDne(zitra);
  const poTerminu = p.ceka.filter((x) => { const t = terminDatum(x.termin); return t != null && rozdilDni(t) < 0; }).length;
  const ukoly = p.ceka.filter((x) => schranka.skupina(x) === 'ukol').length;
  const dalsi = p.dnes.filter((u) => !u.celodenni && u.konec > Date.now())[0];
  const ceka = '–';

  el.querySelector('#dnes-kpi').innerHTML =
    kpi('schranka', IKONY.schranka, 'Čeká na tebe', stav.schranka ? p.ceka.length : ceka,
      poTerminu ? '<span class="pozor">' + poTerminu + ' po termínu</span>' : (p.ceka.length ? 'úkoly a rozhodnutí' : 'nic nečeká'),
      p.ceka.length ? '<i style="--podil:' + ukoly + ';--b:var(--accent)"></i><i style="--podil:' + (p.ceka.length - ukoly) + ';--b:var(--warn)"></i>' : '<i></i>') +
    kpi('schranka', IKONY.claude, 'U Clauda', stav.schranka ? p.uClauda.length : ceka,
      p.uClauda.length ? 'zpracuju při další schránce' : 'vše zpracované', '<i style="--b:' + (p.uClauda.length ? 'var(--fialova)' : 'var(--line-soft)') + '"></i>') +
    kpi('posta', IKONY.posta, 'Nepřečtená pošta', stav.posta ? p.nep.length : ceka,
      posta.maPracovni() ? 'osobní ' + p.nepOsobni + ' · pracovní ' + p.nepPracovni : (p.nep.length ? 'v osobním Gmailu' : 'vše přečteno'),
      p.nep.length ? '<i style="--podil:' + p.nepOsobni + ';--b:var(--accent)"></i><i style="--podil:' + p.nepPracovni + ';--b:var(--fialova)"></i>' : '<i></i>',
      ' data-filtr-posty="neprectene"') +
    kpi('kalendar', IKONY.kalendar, 'Dnes v kalendáři', kal.mameData(dnes) ? p.dnes.length : ceka,
      dalsi ? 'další ' + hhmm(dalsi.zacatek) + ' · ' + esc(dalsi.nazev) : (p.dnes.length ? 'na dnes hotovo' : 'volný den'),
      '<i style="--b:' + (p.dnes.length ? 'var(--ok)' : 'var(--line-soft)') + '"></i>');

  // kalendář: dnes a zítra
  let k;
  if (!kal.mameData(dnes)) k = kostra(3);
  else if (!p.dnes.length && !udZitra.length) k = '<div class="prazdne">Dnes ani zítra nic v kalendáři.</div>';
  else {
    k = [[dnes, p.dnes, 'Dnes'], [zitra, udZitra, 'Zítra']].filter((x) => x[1].length).map((x) =>
      '<div class="dlazdice__mezinadpis">' + x[2] + '</div><ul class="seznam">' + x[1].map((u) => kal.udalostHtml(u, x[0])).join('') + '</ul>').join('');
  }
  // schránka: čeká na tebe + u Clauda
  let s;
  if (!stav.schranka) s = stav.chyby.schranka ? chybaHtml(stav.chyby.schranka, 'data-schranka-znovu') : kostra(3);
  else {
    s = '<div class="dlazdice__mezinadpis">Čeká na tebe</div>' + (p.ceka.length
      ? '<ul class="seznam">' + p.ceka.slice(0, 6).map((x) => schranka.polozkaHtml(x, true)).join('') + '</ul>'
      : '<div class="prazdne">Nic nečeká.</div>');
    if (p.uClauda.length) {
      s += '<div class="dlazdice__mezinadpis">U Clauda</div><ul class="seznam">' + p.uClauda.slice(0, 5).map((x) => schranka.polozkaHtml(x, true)).join('') + '</ul>';
    }
  }
  // pošta: nepřečtené
  let m;
  if (!stav.posta) m = stav.chyby.posta ? chybaHtml(stav.chyby.posta, 'data-posta-znovu') : kostra(3);
  else if (!p.nep.length) m = '<div class="prazdne">Žádná nepřečtená pošta.</div>';
  else m = '<ul class="seznam">' + p.nep.slice(0, 8).map((x) => posta.zpravaRadekHtml(x, posta.maPracovni())).join('') + '</ul>';

  const dlazdice = (nazev, pod, cil, telo, siroka, atributy) => '<section class="card dlazdice' + (siroka ? ' dlazdice--siroka' : '') + '">' +
    '<button type="button" class="dlazdice__hlava" data-cil="' + cil + '"' + (atributy || '') + '><b>' + nazev + '</b><small>' + pod + '</small>' +
    '<span class="vpravo">Vše' + IKONY.vpravo + '</span></button><div class="dlazdice__telo">' + telo + '</div></section>';

  el.querySelector('#dnes-obsah').innerHTML = '<div class="dlazdice-mrizka">' +
    dlazdice('Kalendář', 'dnes a zítra', 'kalendar', k) +
    dlazdice('Schránka', p.ceka.length + ' čeká · ' + p.uClauda.length + ' u Clauda', 'schranka', s) +
    dlazdice('Pošta', p.nep.length + ' ' + tvar(p.nep.length, 'nepřečtená', 'nepřečtené', 'nepřečtených'), 'posta', m, true, ' data-filtr-posty="neprectene"') +
    '</div>';
}

// ---------------------------------------------------------------- ovládání

document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a[data-cil], [data-udalost]');
  if (!el || el.closest('#uvod')) return;

  if (el.hasAttribute('data-zavrit-panel')) { zavriPanel(); return; }
  if (el.dataset.cil) {
    // proklik na nepřečtenou poštu rovnou s filtrem
    if (el.dataset.filtrPosty) { stav.filtrPosty = el.dataset.filtrPosty; uloziste.pis('asistent.filtrPosty', stav.filtrPosty); }
    prepni(el.dataset.cil);
    return;
  }
  if (el.id === 'obnovit') { obnovVse(true); return; }
  if (el.hasAttribute('data-otevri-nastaveni')) { nast.otevriNastaveni(el.dataset.otevriNastaveni); return; }
  if (el.hasAttribute('data-nova-poznamka')) {
    if (stav.pohled !== 'dnes' && stav.pohled !== 'schranka') prepni('dnes');
    const pole = document.querySelector('#p-' + stav.pohled + ' [data-zapis]');
    if (pole) { pole.scrollIntoView({ block: 'center' }); pole.focus(); }
    return;
  }
  if (el.dataset.skocSkupina) {
    const cil = document.getElementById('sk-' + el.dataset.skocSkupina);
    if (cil) cil.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  // e-mail otevřený z Dnes na širokém okně patří do pohledu Pošta (seznam + detail vedle sebe)
  if (el.dataset.vlakno && stav.pohled !== 'posta' && SIROKE_OKNO.matches) prepni('posta');
  if (schranka.klikSchranka(el)) return;
  if (posta.klikPosta(el)) return;
  if (kal.klikKalendar(el)) return;
  nast.klikNastaveni(el);
});

document.addEventListener('input', (e) => {
  if (schranka.vstupSchranka(e)) return;
  posta.vstupPosta(e);
});

document.addEventListener('change', (e) => { nast.zmenaNastaveni(e); });

document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd+Enter uloží poznámku nebo odešle e-mail (na PC)
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    if (e.target.matches('[data-zapis]')) { e.preventDefault(); e.target.closest('.zapis').querySelector('[data-ulozit]').click(); }
    else if (e.target.closest('[data-panel="psani"]')) { e.preventDefault(); const t = document.querySelector('[data-panel="psani"] [data-odeslat]'); if (t) t.click(); }
  }
  if (e.key === 'Escape' && horniPanel()) zavriPanel();
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
