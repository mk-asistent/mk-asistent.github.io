// Asistent – start, navigace (postranní panel, horní lišta s hledáním, spodní lišta na telefonu), hlavička,
// přehled Dnes (čísla, grafy, co čeká) a ovládání (klepnutí, klávesy). Vzhled: styl „Fixtrack“, skill osobni-vzhled.

import { stav, priZmene, zmeneno, prejdi, umiMotor, staryMotor } from './stav.js';
import { jePripojeno, jeDemo } from './api.js';
import { esc, pulnoc, datumDlouhe, hhmm, iniciala, odstin, tvar, velkePrvni, rozdilDni, uloziste, terminDatum, dm, kdyKratce, prvniRadek, DNY_KR } from './pomocne.js';
import { kostra, chybaHtml, hlavickaKarty, okno } from './ui.js';
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
import * as auto from './auto.js';
import { vstupAdresy, klavesaAdresy } from './adresy.js';
import * as ucet from './ucet.js';

const SEKCE = [['dnes', 'Dnes'], ['schranka', 'Schránka'], ['posta', 'Pošta'], ['kalendar', 'Kalendář'], ['zdravi', 'Zdraví'], ['fotbal', 'Fotbal'], ['reely', 'Reely'],
  ['auto', 'Auto']];
// sekce, které ukáže jen motor, který je umí (starší verze motoru je schová)
const viditelna = (s) => ['fotbal', 'reely', 'auto'].indexOf(s[0]) < 0 || umiMotor(s[0]);
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const TELEFON = window.matchMedia('(max-width: 759px)');
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- start

function start() {
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
  auto.nactiZUloziste();
  if (!SEKCE.some((s) => s[0] === stav.pohled)) stav.pohled = 'dnes';
  kal.pripravGesta($('p-kalendar'));
  priZmene(vykresli);
  // účet Firebase: kopie dat ze serveru (načtou se hned, změny chodí živě) – bez účtu se nic nestahuje
  ucet.spust();
  ucet.naKopie(poNovychKopiich);
  ucet.naStav(() => {
    // stav účtu v Nastavení (ne když se zrovna píše do pole – překreslení by ho smazalo)
    const el = elementPanelu('nastaveni');
    if (jeOtevreny('nastaveni') && !(el && el.contains(document.activeElement) && document.activeElement.matches('input, textarea'))) obnovPanel('nastaveni');
  });
  vykresli();
  obnovVse(false);
}

function obnovVse(znovu) {
  stav.naposledy = Date.now();
  schranka.nactiSchranku();
  posta.nactiPostu(znovu);
  kal.nactiKalendar(znovu);
  nast.nactiInfo();
  pocasi.nactiPocasi(znovu);
  zdravi.nactiZdravi(znovu);
  fotbal.nactiFotbal();
  reely.nactiReely(znovu);
  if (znovu || stav.pohled === 'auto') auto.nactiAuto(znovu); // tabulku auta jen na její stránce nebo při Obnovit
  ucet.obnovStare();
}

/** Server obnovil kopie (každých 10 min, po změně nebo při otevření) → načíst znovu, čeho se to týká (z kopie, hned). */
function poNovychKopiich(idy) {
  const je = (id) => idy.indexOf(id) >= 0;
  if (je('posta')) posta.nactiPostu(false);
  if (je('schranka')) schranka.nactiSchranku();
  if (idy.some((id) => id.indexOf('kalendar_') === 0)) kal.nactiKalendar(false, true);
  if (je('info')) nast.nactiInfo();
  if (je('fotbal')) fotbal.nactiFotbal();
  if (je('reely')) reely.nactiReely(false);
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
  pocasi.dotahni();
  zdravi.dotahni();
  fotbal.dotahni();
  reely.dotahni();
  auto.dotahni();
  if (stav.pohled === 'kalendar') dochazka.dotahni();
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
  else if (stav.pohled === 'zdravi') zdravi.vykresliZdravi(el);
  else if (stav.pohled === 'fotbal') fotbal.vykresliFotbal(el);
  else if (stav.pohled === 'reely') reely.vykresliReely(el);
  else if (stav.pohled === 'auto') auto.vykresliAuto(el);
  else kal.vykresliKalendar(el);
  zkontrolujNovinky(p);
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
      if (hori || nove) { stav.filtrPosty = hori ? 'hori' : 'vse'; prejdi('posta'); } else prejdi('dnes');
      if (vystrahy.length && !hori && !nove) pocasi.ukazDetail();
      zmeneno();
    });
}

function odznakSekce(sekce, p) {
  return { schranka: p.ceka.length, posta: p.nep.length, reely: reely.kVyveseni().length }[sekce] || 0;
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
    SEKCE.filter(viditelna).map((s) => tl('data-cil="' + s[0] + '"', s[1], IKONY[s[0]], odznakSekce(s[0], p), stav.pohled === s[0])).join('') +
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
  $('hlava').innerHTML =
    '<div class="hlava-ja jen-telefon">' +
      '<button type="button" class="ja" data-menu aria-label="Menu – všechny sekce a Nastavení">' +
        '<span class="avatar" style="--h:' + odstin(jmeno) + '">' + esc(iniciala(jmeno.replace(/[._\d]+/g, ' '))) + '</span>' +
        '<span><small>Asistent · menu</small><b>' + esc(jmeno) + '</b></span>' + IKONY.menu + '</button>' +
      '<div class="hlava-akce">' +
        (umiMotor('zdravi') && stav.pohled !== 'zdravi' ? '<button type="button" class="btn btn--ikona" data-cil="zdravi" aria-label="Zdraví">' + IKONY.srdce + '</button>' : '') +
        '<button type="button" class="btn btn--ikona" data-hledat aria-label="Hledat">' + IKONY.hledat + '</button>' +
        '<button type="button" class="btn btn--ikona' + (nacitaSe() ? ' toci' : '') + '" data-obnovit aria-label="Obnovit">' + IKONY.obnovit + '</button>' +
      '</div></div>' +
    '<div class="hlava-radek"><div class="hlava-titul"><h1>' + (stav.pohled !== 'dnes' ? '<span class="hlava-ikona" data-oblast="' +
      (stav.pohled === 'reely' ? 'fotbal' : stav.pohled) + '">' + IKONY[stav.pohled] + '</span>' : '') + esc(nadpis) + '</h1>' + (pod ? '<p>' + pod + '</p>' : '') + '</div></div>';
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
  $('pruhy').innerHTML = pruhy.join('');
}

/** Spodní lišta na telefonu: plovoucí černá pilulka, aktivní sekce limetková s popiskem, uprostřed „+“. */
function vykresliListu(p) {
  const tl = (s) => {
    const n = odznakSekce(s[0], p);
    return '<button type="button" class="lista__btn" data-cil="' + s[0] + '" aria-label="' + s[1] + (n ? ', ' + n : '') + '"' +
      (stav.pohled === s[0] ? ' aria-current="page"' : '') + '>' + IKONY[s[0]] + '<span>' + s[1] + '</span>' +
      (n ? '<span class="odznak cisla">' + n + '</span>' : '') + '</button>';
  };
  $('lista').innerHTML = tl(SEKCE[0]) + tl(SEKCE[1]) +
    '<button type="button" class="lista__plus" data-rychle aria-label="Přidat – poznámku, e-mail, událost nebo zápas">' + IKONY.plus + '</button>' +
    tl(SEKCE[2]) + tl(SEKCE[3]);
}

/** Menu na telefonu (klepnutí na jméno nahoře): pás zleva se všemi sekcemi – i Zdraví, Fotbal a Reely, které se
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
      volba('email', IKONY.psat, 'zluta', 'Nový e-mail', 'z osobní nebo pracovní adresy') +
      volba('udalost', IKONY.kalendar, 'zelena', 'Událost', 'do kalendáře, i s pozvánkami') +
      volba('zapas', IKONY.zapas, 'limetka', 'Zápas', 'tým, soupeř, výkop, sraz') +
      (umiMotor('vaha') ? volba('vaha', IKONY.vaha, 'oranz', 'Váha', 'kg – zapíše se i s časem') : '') +
      (umiMotor('autoZapsat') ? volba('tankovani', IKONY.palivo, 'auto', 'Tankování', 'částka, cena za litr, km – do tabulky auta') : '') +
      // účtenka: popisek s polem pro fotku – fotoaparát se otevře rovnou klepnutím (iPhone jinak okno nepustí)
      (umiMotor('autoUctenka') ? '<label class="rychle__foto"><i class="kruh kruh--auto">' + IKONY.foto + '</i><b>Účtenka</b><small>vyfoť – částka a datum se vyplní samy</small>' +
        '<input type="file" accept="image/*" capture="environment" data-auto-foto hidden></label>' : '') + '</div>'
  });
}

function rychlaAkce(akce) {
  if (akce === 'poznamka') schranka.zamerZapis();
  else if (akce === 'email') posta.otevriPsani('novy');
  else if (akce === 'udalost') udalost.otevriFormular({ den: stav.pohled === 'kalendar' ? stav.kal.vybrany : undefined });
  else if (akce === 'zapas') udalost.otevriFormular({ typ: 'zapas', den: stav.pohled === 'kalendar' ? stav.kal.vybrany : undefined });
  else if (akce === 'vaha') zdravi.zapisVahuOknem();
  else if (akce === 'tankovani') auto.otevriZapis('tankovani');
}

// ---------------------------------------------------------------- Dnes
// Každá věc jen jednou (Michal 2. 10.): nahoře výstrahy ČHMÚ (jen když jsou), čtyři karty s tím, co se jinde
// neopakuje (počasí, další zápas, nepřečtená pošta, dnešek / zdraví), pod tím jeden společný seznam „Vyžaduje
// pozornost“ (úkoly, rozhodnutí i pošta), týden jako krátký výpis a poznámka pro Clauda s malým přehledem schránky.

function kpi(atributy, ikona, nazev, hodnota, jednotka, pod) {
  return '<button type="button" class="kpi" ' + atributy + '>' +
    '<span class="kpi__hlava">' + ikona + '<span>' + nazev + '</span></span><span class="sipka" aria-hidden="true">' + IKONY.sipka + '</span>' +
    '<span class="kpi__hodnota">' + hodnota + (jednotka ? '<small>' + jednotka + '</small>' : '') + '</span>' +
    '<span class="kpi__pod">' + pod + '</span></button>';
}

function sipkaKarty(atributy, popisek) {
  return '<button type="button" class="sipka" ' + atributy + ' aria-label="' + popisek + '" title="' + popisek + '">' + IKONY.sipka + '</button>';
}

/** „dnes 15:00“, „zítra 10:15“, „so 15:00“ */
function kdyKratky(t, celodenni) {
  const r = rozdilDni(t);
  const den = r === 0 ? 'dnes' : r === 1 ? 'zítra' : DNY_KR[new Date(t).getDay()];
  return den + (celodenni ? '' : ' ' + hhmm(t));
}

/** Co od tebe chce schránka i pošta dohromady, seřazené: po termínu, hoří, dnes, rozhodni, nepřečtené, ostatní. */
function pozornost(p) {
  const polozky = [];
  p.ceka.forEach((x) => {
    const t = terminDatum(x.termin);
    const r = t == null ? null : rozdilDni(t);
    polozky.push({ typ: 'schranka', x, t, vaha: r != null && r < 0 ? 0 : r === 0 ? 2 : schranka.skupina(x) === 'rozhodni' ? 3 : 5, kdy: x.kdy });
  });
  p.pozornost.forEach((m) => {
    const st = posta.stavZpravy(m);
    polozky.push({ typ: 'posta', x: m, vaha: st === 'hori' ? 1 : m.neprectena ? 4 : 6, kdy: m.kdy });
  });
  return polozky.sort((a, b) => (a.vaha - b.vaha) || (b.kdy - a.kdy));
}

function kartyKpi(p, dnes) {
  const karty = [];
  // počasí (ČHMÚ)
  if (staryMotor()) {
    karty.push(kpi('data-oblast="pocasi" data-otevri-nastaveni="pripojeni"', IKONY.polojasno, 'Počasí', '–', '',
      '<span class="tag tag--warn">nový motor</span><span class="orez-1">nasaď Novou verzi</span>'));
  } else if (umiMotor('pocasi')) {
    if (stav.pocasi) {
      const k = pocasi.kartaPocasi();
      karty.push(kpi('data-oblast="pocasi" data-pocasi', k.ikona, k.nazev, k.hodnota, k.jednotka, k.pod));
    } else {
      karty.push(kpi('data-oblast="pocasi" data-pocasi', IKONY.polojasno, 'Počasí', '–', '', '<span class="orez-1">' +
        esc(stav.chyby.pocasi ? stav.chyby.pocasi.message : 'načítám ČHMÚ…') + '</span>'));
    }
  }
  // zdraví (WHOOP, Apple Watch) – jen když ho motor umí
  if (umiMotor('zdravi') && zdravi.maData()) {
    const z = zdravi.kartaZdravi();
    karty.push(kpi('data-oblast="zdravi" data-cil="zdravi"', IKONY.srdce, z.nazev, z.hodnota, z.jednotka, z.pod));
  }
  // další zápas
  const z = kal.dalsiZapas(14);
  const zk = z ? null : fotbal.dalsiZapasKlubu(14);
  karty.push(z
    ? kpi('data-oblast="fotbal" data-udalost="' + esc(z.id) + '"', IKONY.zapas, 'Další zápas', esc(kdyKratky(z.zacatek, z.celodenni)), '',
      '<span class="orez-1">' + esc(z.nazev.replace(/^⚽\s*/, '')) + '</span>')
    : zk ? kpi('data-oblast="fotbal" data-cil="kalendar"', IKONY.zapas, 'Další zápas', esc(kdyKratky(zk.zacatek)), '', '<span class="orez-1">' + esc(zk.nazev) + '</span>')
    : kpi('data-oblast="fotbal" data-cil="kalendar"', IKONY.zapas, 'Další zápas', '–', '', '<span>' + (kal.mameData(dnes) ? '14 dní žádný' : 'načítám…') + '</span>'));
  // nepřečtená pošta
  karty.push(kpi('data-oblast="posta" data-cil="posta" data-filtr-posty="neprectene"', IKONY.posta, 'Nepřečtené', stav.posta ? p.nep.length : '–', '',
    (p.hori ? '<span class="tag tag--danger">' + p.hori + ' hoří</span>' : '') +
    '<span class="orez-1">' + (stav.posta ? p.pozornost.length + ' ' + tvar(p.pozornost.length, 'čeká', 'čekají', 'čeká') + ' na odpověď' : 'načítám…') + '</span>'));
  return karty.join('');
}

function kartaPozornosti(p) {
  const seznam = pozornost(p);
  const chyby = [];
  if (!stav.schranka && stav.chyby.schranka) chyby.push(chybaHtml(stav.chyby.schranka, 'data-schranka-znovu'));
  if (!stav.posta && stav.chyby.posta) chyby.push(chybaHtml(stav.chyby.posta, 'data-posta-znovu'));
  let telo = chyby.join('');
  if (!stav.schranka && !stav.posta && !chyby.length) telo += kostra(4);
  else if (!seznam.length) telo += (stav.schranka || stav.posta) ? '<div class="prazdne">Nic nehoří, nic nečeká. Užij si to.</div>' : '';
  else {
    telo += '<ul class="seznam">' + seznam.slice(0, 10).map((x) => (x.typ === 'schranka'
      ? schranka.polozkaHtml(x.x, true) : posta.zpravaRadekHtml(x.x, posta.maPracovni()))).join('') + '</ul>';
  }
  const pata = '<div class="dlazdice__paty">' +
    '<button type="button" class="dlazdice__pata" data-cil="schranka" data-filtr-schranky="vse">' + IKONY.schranka + 'Schránka' +
      (stav.schranka ? ' · ' + schranka.vsechnyPolozky().length : '') + '</button>' +
    '<button type="button" class="dlazdice__pata" data-cil="posta" data-filtr-posty="vse">' + IKONY.posta + 'Pošta' +
      (stav.posta ? ' · ' + posta.vsechnyZpravy().length : '') + '</button></div>';
  return hlavickaKarty(IKONY.fajfka, 'Vyžaduje pozornost' + (seznam.length ? ' · ' + seznam.length : '')) +
    '<div class="dlazdice__telo">' + telo + (seznam.length > 10 ? '<p class="dlazdice__napoveda">a dalších ' + (seznam.length - 10) + ' ve schránce a v poště</p>' : '') + '</div>' + pata;
}

function kartaTydne() {
  const a = kal.agenda(7, 9);
  let telo;
  if (!kal.mameData(Date.now())) telo = kal.chybaKalendare() ? chybaHtml(kal.chybaKalendare(), 'data-kal-znovu') : kostra(3);
  else if (!a.celkem) telo = '<div class="prazdne">Příštích 7 dní nic v kalendáři.</div>';
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
    el.innerHTML = '<div id="dnes-vystrahy"></div><div class="dnes-mobil" id="dnes-mobil"></div><div class="kpi-mrizka" id="dnes-kpi"></div>' +
      '<div class="dnes-mrizka" id="dnes-obsah">' +
      '<section class="card dlazdice dl-pozornost" id="dl-pozornost"></section>' +
      '<div class="dnes-vpravo"><section class="card dlazdice dl-tyden" id="dl-tyden" data-oblast="kalendar"></section>' +
      '<section class="card dlazdice dl-doplnky" id="dl-doplnky" data-oblast="zdravi" hidden></section>' +
      '<section class="card dlazdice dl-vaha" id="dl-vaha" data-oblast="zdravi" hidden></section>' +
      '<section class="dl-reel" id="dl-reel" hidden></section>' +
      '<section class="card dlazdice dl-fotbal" id="dl-fotbal" data-oblast="fotbal" hidden></section>' +
      '<section class="card dlazdice dl-zapis" data-oblast="schranka">' + hlavickaKarty(IKONY.claude, 'Poznámka pro Clauda') +
        schranka.zapisHtml(true) + '<div id="dl-schranka-mini"></div><div class="dlazdice__telo" id="dl-zapis-seznam"></div></section></div>' +
    '</div>';
  }
  const dnes = pulnoc(Date.now());
  el.querySelector('#dnes-vystrahy').innerHTML = pocasi.pruhVystrahHtml();
  if (TELEFON.matches) el.querySelector('#dnes-mobil').innerHTML = dnesMobilHtml(p, dnes);
  else {
    el.querySelector('#dnes-kpi').innerHTML = kartyKpi(p, dnes);
    el.querySelector('#dl-pozornost').innerHTML = kartaPozornosti(p);
  }
  el.querySelector('#dl-tyden').innerHTML = kartaTydne();
  const doplnkyHtml = umiMotor('zdravi') ? zdravi.kartaDoplnkuHtml() : '';
  el.querySelector('#dl-doplnky').hidden = !doplnkyHtml;
  el.querySelector('#dl-doplnky').innerHTML = doplnkyHtml;
  // váha: když se do pole zrovna píše, kartu nepřekreslovat (zmizela by rozepsaná hodnota i klávesnice)
  const vahaEl = el.querySelector('#dl-vaha');
  const piseVahu = document.activeElement && vahaEl.contains(document.activeElement) && document.activeElement.matches('[data-vaha-pole]');
  if (!piseVahu) {
    const vahaHtml = umiMotor('vaha') ? zdravi.kartaVahyDnesHtml() : '';
    vahaEl.hidden = !vahaHtml;
    vahaEl.innerHTML = vahaHtml;
  }
  // čerstvý nezveřejněný reel: na PC v pravém sloupci, na telefonu hned pod malými čísly (dnesMobilHtml)
  const reelHtml = umiMotor('reely') && !TELEFON.matches ? reely.kartaDnesHtml() : '';
  el.querySelector('#dl-reel').hidden = !reelHtml;
  el.querySelector('#dl-reel').innerHTML = reelHtml;
  const fotbalHtml = fotbal.maData() ? fotbal.kartaDnesHtml() : '';
  el.querySelector('#dl-fotbal').hidden = !fotbalHtml;
  el.querySelector('#dl-fotbal').innerHTML = fotbalHtml;
  el.querySelector('#dl-schranka-mini').innerHTML = miniSchrankaHtml();
  // pod polem: co Claude odpověděl za poslední týden (celá odpověď je v rozbalené položce)
  const odpovedi = schranka.odpovedi(7);
  el.querySelector('#dl-zapis-seznam').innerHTML = odpovedi.length
    ? '<div class="dlazdice__mezinadpis">Odpověděl jsem · ' + odpovedi.length + '</div><ul class="seznam">' +
      odpovedi.slice(0, 3).map((x) => schranka.polozkaHtml(x, false)).join('') + '</ul>' +
      (odpovedi.length > 3 ? '<button type="button" class="agenda__vic" data-cil="schranka" data-filtr-schranky="hotovo">+ ' + (odpovedi.length - 3) + ' další ve schránce</button>' : '')
    : '<p class="poznamka-pod dlazdice__napoveda">Co sem napíšeš, zpracuju při další schránce a odpověď uvidíš tady. Z iPhonu jde totéž hlasem přes zkratku „Pro Clauda“.</p>';
}

// ---------------------------------------------------------------- Dnes na telefonu (vzor PriorAuth)

function kdyTerminu(t) {
  const r = rozdilDni(t);
  return r < 0 ? 'po termínu · ' + dm(t) : r === 0 ? 'dnes' : r === 1 ? 'zítra' : dm(t);
}

function pozorKartaHtml(x) {
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
  return '<li><button type="button" class="pozor" data-vlakno="' + esc(m.id) + '">' +
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
  const celkem = seznam.length;
  const pod = [t.poTerminu ? t.poTerminu + ' po termínu' : '', p.hori ? p.hori + ' hoří v poště' : '',
    t.dnes ? t.dnes + ' na dnes' : ''].filter(Boolean).join(' · ') || (celkem ? 'úkoly, rozhodnutí a pošta' : 'nic nečeká – klid');
  let h = '<section class="hero">' +
    '<div class="hero__hlava"><span class="hero__stitek">' + IKONY.fajfka + 'Čeká na tebe</span>' +
      '<button type="button" class="hero__sipka" data-cil="schranka" data-filtr-schranky="vse" aria-label="Otevřít schránku">' + IKONY.sipka + '</button></div>' +
    '<div class="hero__telo"><b class="hero__cislo cisla">' + (nacteno ? celkem : '–') + '</b><p>' + esc(nacteno ? pod : 'Načítám…') + '</p>' +
      '<div class="hero__deleni">' +
        '<button type="button" data-cil="schranka" data-filtr-schranky="vse"><small>Úkoly a rozhodnutí</small><b>' + (stav.schranka ? p.ceka.length : '–') + '</b></button>' +
        '<button type="button" data-cil="posta" data-filtr-posty="vse"><small>Pošta čeká na odpověď</small><b>' + (stav.posta ? p.pozornost.length : '–') + '</b></button>' +
      '</div></div></section>';
  // malá čísla: to, co hlavní karta neukazuje (počasí, zápas / zdraví, nepřečtené)
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
  const zapas = kal.dalsiZapas(14) || fotbal.dalsiZapasKlubu(14);
  male.push(mala('data-oblast="fotbal" ' + (zapas && zapas.id ? 'data-udalost="' + esc(zapas.id) + '"' : 'data-cil="kalendar"'), IKONY.zapas, 'limetka',
    zapas ? esc(kdyKratky(zapas.zacatek, zapas.celodenni).split(' ')[0]) : '–', zapas ? esc(hhmm(zapas.zacatek) + ' zápas') : 'Žádný zápas', ''));
  if (male.length < 3) {
    male.push(mala('data-oblast="posta" data-cil="posta" data-filtr-posty="neprectene"', IKONY.posta, p.hori ? 'oranz' : 'fialova', stav.posta ? p.nep.length : '–',
      'Nepřečtené', p.hori ? '↗ ' + p.hori + ' hoří' : ''));
  }
  h += '<div class="mini-kpi-rada">' + male.slice(0, 3).join('') + '</div>';
  if (umiMotor('reely')) h += reely.kartaDnesHtml(); // limetková karta „Reel k vyvěšení“ (jen když je čerstvý nezveřejněný)
  h += '<section class="pozornost"><div class="pozornost__hlava"><h2>Vyžaduje pozornost</h2>' +
    (seznam.length ? '<span class="pilulka-oranz cisla">' + seznam.length + '</span>' : '') + '</div>';
  if (!nacteno) h += '<div class="card">' + kostra(3) + '</div>';
  else if (!seznam.length) h += '<div class="card"><div class="prazdne">Nic nehoří, nic nečeká. Užij si to.</div></div>';
  else {
    h += '<ul>' + seznam.slice(0, 6).map(pozorKartaHtml).join('') + '</ul>' +
      '<div class="pozornost__dalsi"><button type="button" class="btn btn--ghost" data-cil="schranka" data-filtr-schranky="vse">Schránka</button>' +
      '<button type="button" class="btn btn--ghost" data-cil="posta" data-filtr-posty="vse">Celá pošta</button></div>';
  }
  return h + '</section>';
}

// ---------------------------------------------------------------- ovládání

document.addEventListener('click', (e) => {
  const el = e.target.closest('button, a[data-cil], [data-udalost]');
  if (!el || el.closest('#uvod')) return;

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
  if (zdravi.klikZdravi(el)) return;
  if (reely.klikReely(el)) return;
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
  if (hledat.vstupHledat(e)) return;
  if (udalost.vstupUdalost(e)) return;
  if (schranka.vstupSchranka(e)) return;
  posta.vstupPosta(e);
});

document.addEventListener('change', (e) => { if (!auto.zmenaAuto(e) && !reely.vstupReely(e) && !posta.zmenaPosta(e) && !udalost.zmenaUdalost(e)) nast.zmenaNastaveni(e); });

function pise(e) {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

document.addEventListener('keydown', (e) => {
  if ($('aplikace').hidden) return;
  if (klavesaAdresy(e)) return;
  if (zdravi.klavesaZdravi(e)) return; // Enter v poli váhy = Zapsat
  if (auto.klavesaAuto(e)) return; // Enter v okně tankování / výdaje = Zapsat
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

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && jePripojeno() && Date.now() - stav.naposledy > 60000) {
    // po delší pauze (aplikace v pozadí) zase ukázat, co je nového
    if (Date.now() - stav.naposledy > 30 * 60000) novinkyUkazany = false;
    obnovVse(false);
  }
});
window.addEventListener('online', () => { zmeneno(); if (jePripojeno()) obnovVse(false); });
window.addEventListener('offline', zmeneno);
// telefon ↔ iPad/PC (otočení, změna okna): jiná hlavička a přehled Dnes
TELEFON.addEventListener('change', zmeneno);
// klepnutí vedle vysunutého menu ho zavře
document.querySelector('#panely .panel-pozadi').addEventListener('click', () => { const h = horniPanel(); if (h && h.id === 'menu') zavriPanel(); });

// ---------------------------------------------------------------- spuštění

nast.aplikujVzhled();
if (jePripojeno()) start(); else nast.vykresliUvod(start);

// service worker jen na https (GitHub Pages) – v místním náhledu by držel staré soubory
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* aplikace jede i bez něj */ }));
}
