// Knihovna – podstránka karty (film, seriál, kniha) a čtečka rešerše jako celá stránka (Michal 12. 10.: „u těch filmů bych
// chtěl mít více informací … ať je to pro mě zajímavé … i něco o hercích … do několika různých sekcí … jako klasickou stránku,
// ne jen pás vpravo“). Tady se jen skládá HTML z dat – stav, adresu #knihovna/<id>, historii a ovládání má js/knihovna.js
// (tenhle soubor načte s sebou, start aplikace na něj nečeká). Vzhled Fixtrack (skill osobni-vzhled), knihovna.css.
// Stránka má pět částí, které se překreslují zvlášť (rozepsaná poznámka se nepřepíše, obrázky se nenačítají znovu):
//   lista – „← Knihovna“, kopírovat odkaz, ČSFD / Databáze knih
//   hero  – plakát / obálka, název, originál, rok, žánry, délka, hlavní tvůrce, hodnocení jako dlaždice, krátce
//   moje  – můj stav, hvězdy, poznámka
//   nav   – lepkavý pás odkazů na oddíly (jen ty, které karta má; klepnutí = plynulý posun)
//   telo  – oddíly: Přehled, Herci, Tvůrci, Postavy, Fakta, sekce, Série, Zajímavosti, Kde sledovat, Podobné, odkazy a zdroje

import { esc, odstin, dm, tvar, velkePrvni, trvani, iniciala as inicialyJmena } from './pomocne.js';
import { IKONY } from './ikony.js';
import { kostra, chybaHtml } from './ui.js';
import * as D from './knihovna_data.js';

const PRAZDNE = { lista: '', hero: '', moje: '', nav: '', telo: '' };
const ven = (u) => ' href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"';

// ---------------------------------------------------------------- drobnosti

/** Odstavce z textu s prázdnými řádky. */
export const odstavce = (t) => String(t || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).map((s) => '<p>' + esc(s).replace(/\n/g, '<br>') + '</p>').join('');
/** „2026-10-11“ → „11. 10. 2026“ */
export function datumZIso(s) { const t = D.cas(s); return t ? dm(t) + ' ' + new Date(t).getFullYear() : String(s || ''); }

/** Plakát / obálka s pevným poměrem 2 : 3 (nic neposkočí); pod obrázkem zástupná plocha s iniciálou – vidět, dokud se obrázek
 *  nenačte, a místo obrázku, který nejde načíst (posluchač chyby v knihovna.js ho odebere). */
export function obrazekHtml(url, nazev, trida, chybne) {
  const u = D.bezpecnaUrl(url);
  const img = u && !(chybne && chybne.has(u)) ? '<img src="' + esc(u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '';
  return '<span class="kn-obr ' + (trida || '') + '" style="--h:' + odstin(nazev) + '" aria-hidden="true"><b>' + esc(D.iniciala(nazev)) + '</b>' + img + '</span>';
}

/** Kulatá fotka člověka (Wikimedia Commons) s pevným rozměrem, jinak iniciály; pod ní drobně zdroj fotky s odkazem. */
function fotoHtml(o, chybne) {
  const u = D.fotoUrl(o.foto);
  const img = u && !(chybne && chybne.has(u)) ? '<img src="' + esc(u) + '" alt="" width="76" height="76" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '';
  const stranka = img && D.bezpecnaUrl(o.fotoStranka);
  return '<span class="kn-osoba__foto"><span class="kn-foto" style="--h:' + odstin(o.jmeno) + '" aria-hidden="true"><b>' + esc(inicialyJmena(o.jmeno)) + '</b>' + img + '</span>' +
    (img ? (stranka ? '<a class="kn-foto__zdroj"' + ven(stranka) + '>Foto: Wikimedia Commons</a>' : '<small class="kn-foto__zdroj">Foto: Wikimedia Commons</small>') : '') + '</span>';
}

/** Oddíl stránky s kotvou (pás nahoře na něj skočí). */
function oddil(kotva, nadpis, obsah, trida) {
  if (!obsah) return '';
  return '<section class="kn-sekce' + (trida ? ' ' + trida : '') + '" id="' + esc(kotva) + '" aria-labelledby="' + esc(kotva) + '-h">' +
    '<h2 class="kn-sekce__nadpis" id="' + esc(kotva) + '-h">' + esc(nadpis) + '</h2>' + obsah + '</section>';
}
const podnadpis = (t) => '<h3 class="kn-podnadpis">' + esc(t) + '</h3>';
const body = (a, trida) => ((a || []).length ? '<ul class="kn-body' + (trida ? ' ' + trida : '') + '">' + a.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '');

/** Lepkavý pás odkazů na oddíly (až od dvou oddílů – jeden nemá smysl). */
function navHtml(oddily) {
  if (oddily.length < 2) return '';
  return '<nav class="kn-oddily" aria-label="Oddíly stránky"><div class="kn-oddily__pas">' +
    oddily.map((o) => '<button type="button" class="kn-oddily__btn" data-kn-skoc="' + esc(o[0]) + '">' + esc(o[1]) + '</button>').join('') + '</div></nav>';
}

/** Horní lišta podstránky: zpět na seznam, kopírovat odkaz, otevřít databázi. */
function listaHtml(kde, odkaz) {
  return '<div class="kn-st-lista">' +
    '<button type="button" class="kn-zpet" data-kn-zpet>' + IKONY.zpet + '<span>Knihovna</span></button>' +
    (kde ? '<span class="kn-st-lista__kde">' + esc(kde) + '</span>' : '') +
    '<span class="kn-st-lista__akce">' +
      '<button type="button" class="btn btn--ikona" data-kn-kopirovat-odkaz aria-label="Kopírovat odkaz na tuhle stránku" title="Kopírovat odkaz">' + IKONY.kopirovat + '</button>' +
      (odkaz && odkaz.url ? '<a class="btn btn--ghost btn--sm kn-st-lista__db"' + ven(odkaz.url) + '>' + esc(odkaz.nazev) + IKONY.odkaz + '</a>' : '') +
    '</span></div>';
}

/** Hodnocení jako dlaždice (zdroj, velké číslo, šipka ↗ ve čtverečku, když vede ven). */
function hodnoceniHtml(hodnoceni) {
  if (!(hodnoceni || []).length) return '';
  return '<div class="kn-hodnoceni">' + hodnoceni.map((h) => {
    const u = D.bezpecnaUrl(h.url);
    const obsah = '<small>' + esc(h.zdroj) + '</small> <b class="cisla">' + esc(h.hodnota) + '</b>';
    const trida = 'kn-hodnoceni__polozka' + (String(h.hodnota).length > 10 ? ' kn-hodnoceni__polozka--dlouhe' : ''); // „87 % (25 203 hodnocení)“ menším písmem
    return u ? '<a class="' + trida + '"' + ven(u) + ' aria-label="' + esc(h.zdroj + ' ' + h.hodnota + ' – otevřít') + '">' + obsah + '<i class="kn-sipka">' + IKONY.sipka + '</i></a>'
      : '<span class="' + trida + '">' + obsah + '</span>';
  }).join('') + '</div>';
}

/** Můj stav (segment – klepnutí na zvolený ho zruší), hvězdy 1–5 (klepnutí na zvolenou je zruší), poznámka (uloží se sama). */
export function mojeHtml(id, druh, m, hvezdy) {
  const poznamka = m.poznamka || '';
  return '<section class="kn-moje" aria-label="Můj stav">' +
    '<p class="kn-moje__nadpis">' + IKONY.hvezda + '<span>Moje</span></p>' +
    '<div class="kn-moje__radek"><div class="segment" role="group" aria-label="Můj stav">' + D.nazvyStavu(druh)
      .filter((s) => druh !== 'reserse' || s[0] === 'hotovo')
      .map((s) => '<button type="button" class="chip" data-kn-stav="' + s[0] + '" data-kn-id="' + esc(id) + '" aria-pressed="' + (m.stav === s[0]) + '">' +
        (m.stav === s[0] ? IKONY.fajfka : '') + esc(s[1]) + '</button>').join('') + '</div>' +
    (hvezdy ? '<div class="kn-hvezdy" role="group" aria-label="Moje hodnocení">' + [1, 2, 3, 4, 5].map((i) => '<button type="button" class="kn-hvezda' +
      (m.hodnoceni >= i ? ' plna' : '') + '" data-kn-hvezdy="' + i + '" data-kn-id="' + esc(id) + '" aria-pressed="' + (m.hodnoceni === i) + '" aria-label="' + i + ' z 5">' +
      IKONY.hvezda + '</button>').join('') + '</div>' : '') + '</div>' +
    '<label class="kn-poznamka"><span class="label">Moje poznámka</span>' +
      '<textarea class="field" rows="3" maxlength="2000" data-kn-poznamka="' + esc(id) + '" placeholder="' + (druh === 'reserse' ? 'Co si chci zapamatovat…' :
        'Co se mi líbilo, s kým se dívat, komu doporučit…') + '">' + (poznamka.charAt(0) === '\n' ? '\n' : '') + esc(poznamka) + '</textarea>' +
      '<small class="kn-poznamka__stav" data-kn-poznamka-stav="' + esc(id) + '" aria-live="polite"></small></label>' +
  '</section>';
}

/** Pata: kdo a kdy připravil, štítky. */
function pataHtml(x) {
  const t = D.cas(x.pripraveno);
  return '<footer class="kn-pata">' + IKONY.claude + '<span>Připravil Claude' + (t ? ' ' + esc(dm(t) + ' ' + new Date(t).getFullYear()) : '') + '</span>' +
    ((x.stitky || []).length ? '<span class="kn-pata__stitky">' + x.stitky.map((s) => '<span class="tag tag--seda">' + esc(s) + '</span>').join('') + '</span>' : '') + '</footer>';
}

/** Odkazy (čipy) a zdroje (rozbalovací seznam; u rešerše rozbalený – je to její oddíl Zdroje). */
function odkazyHtml(odkazy, zdroje, rozbalene) {
  const o = (odkazy || []).filter((x) => D.bezpecnaUrl(x.url));
  const z = (zdroje || []).filter((x) => D.bezpecnaUrl(x.url));
  if (!o.length && !z.length) return '';
  return '<div class="kn-zaver">' + (o.length ? '<div class="kn-odkazy">' + o.map((x) => '<a class="chip"' + ven(x.url) + '>' + esc(x.nazev) + IKONY.odkaz + '</a>').join('') + '</div>' : '') +
    (z.length ? '<details class="kn-zdroje"' + (rozbalene ? ' open' : '') + '><summary>Zdroje (' + z.length + ')</summary><ol>' + z.map((x) => '<li><a' + ven(x.url) + '>' + esc(x.nazev) + '</a></li>').join('') + '</ol></details>' : '') +
    '</div>';
}

/** Související položky (v knihovně → podstránka, jinak „Přidat“ = okno s předvyplněným názvem). */
function souvisiHtml(data, x) {
  const s = D.souvisejici(data, x);
  if (!s.length) return '';
  return '<div class="kn-souvisi">' + s.map((o) => (o.existuje
    ? '<button type="button" class="kn-souvisi__polozka" data-kn-otevri="' + esc(o.id) + '"><span class="kn-souvisi__ikona">' + IKONY.knihovna + '</span>' +
      '<span><b>' + esc(o.nazev) + '</b>' + (o.proc ? '<small>' + esc(o.proc) + '</small>' : '') + '</span>' + IKONY.vpravo + '</button>'
    : '<div class="kn-souvisi__polozka kn-souvisi__polozka--neni"><span class="kn-souvisi__ikona">' + IKONY.plus + '</span>' +
      '<span><b>' + esc(velkePrvni(o.nazev)) + '</b><small>' + esc((o.proc ? o.proc + ' · ' : '') + 'v knihovně zatím není') + '</small></span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-kn-pridat data-kn-druh="' + esc(D.druhZId(o.id)) + '" data-kn-text="' + esc(velkePrvni(o.nazev)) + '">Přidat</button></div>'))
    .join('') + '</div>';
}

/** Text sekce: odstavce (čitelná šířka) a body. */
function textSekceHtml(s) {
  return '<div class="kn-text">' + (s.odstavce || []).map((o) => odstavce(o)).join('') + body(s.body) + '</div>';
}

// ---------------------------------------------------------------- karta (film, seriál, kniha)

/**
 * Části podstránky karty. ctx = { data (knihovna), chybne (Set obrázků, které nejdou načíst) }.
 * Vrací { lista, hero, moje, nav, telo, titul }.
 */
export function kartaCasti(x, ctx) {
  const data = ctx.data, chybne = ctx.chybne;
  const m = D.moje(data, x.id);
  const video = x.druh !== 'kniha';
  const kniha = !video;
  const meta = [D.DRUHY[x.druh], D.rokKarty(x), kniha && x.stran ? x.stran + ' stran' : x.delka, x.zeme].filter(Boolean);
  const tvurce = D.hlavniTvurce(x);
  // hlavička: na telefonu plakát a název vedle sebe, žánry, hodnocení a „krátce“ pod nimi přes celou šířku
  const hero = '<header class="kn-hero" data-oblast="knihovna">' +
    obrazekHtml(x.obrazek && x.obrazek.url, x.nazev, 'kn-obr--hero', chybne) +
    '<div class="kn-hero__text"><div class="kn-hero__hlava">' +
      '<p class="kn-hero__druh">' + esc(meta.join(' · ')) + '</p>' +
      '<h1 class="kn-hero__nazev" tabindex="-1">' + esc(x.nazev) + '</h1>' +
      (x.original && x.original !== x.nazev ? '<p class="kn-hero__orig">' + esc(x.original) + '</p>' : '') +
      (tvurce ? '<p class="kn-hero__tvurce">' + esc(tvurce) + '</p>' : '') + '</div>' +
      '<div class="kn-hero__dalsi">' +
        ((x.zanry || []).length ? '<div class="kn-zanry">' + x.zanry.map((z) => '<span class="tag tag--seda">' + esc(z) + '</span>').join('') + '</div>' : '') +
        hodnoceniHtml(x.hodnoceni) +
        (x.kratce ? '<p class="kn-hero__kratce">' + esc(x.kratce) + '</p>' : '') +
    '</div></div></header>';

  let telo = '';
  // Přehled: o čem to je (čitelná šířka) + tmavá karta „Proč to stojí za to“ vedle, citáty pod tím
  const citaty = (x.citaty || []).length ? '<div class="kn-citaty">' + x.citaty.map((c) => '<figure class="kn-citat"><blockquote>' + esc(c.text) + '</blockquote>' +
    (c.kdo ? '<figcaption>' + esc(c.kdo) + '</figcaption>' : '') + '</figure>').join('') + '</div>' : '';
  if (x.obsah || x.proc || citaty) {
    telo += oddil('kn-o-prehled', 'Přehled', '<div class="kn-prehled' + (x.obsah && x.proc ? ' kn-prehled--dva' : '') + '">' +
      (x.obsah ? '<div class="kn-text">' + podnadpis(video ? 'O čem to je' : 'O čem kniha je') + odstavce(x.obsah) + '</div>' : '') +
      (x.proc ? '<aside class="kn-proc">' + '<p class="kn-proc__nadpis">' + IKONY.hvezda + '<span>Proč to stojí za to</span></p>' + odstavce(x.proc) + '</aside>' : '') +
      '</div>' + citaty);
  }
  // Herci
  if ((x.herci || []).length) {
    telo += oddil('kn-o-herci', 'Herci', '<ul class="kn-lide">' + x.herci.map((h) => '<li class="kn-osoba">' + fotoHtml(h, chybne) +
      '<div class="kn-osoba__text"><b>' + esc(h.jmeno) + '</b>' + (h.postava ? '<small>jako ' + esc(h.postava) + '</small>' : '') +
      (h.o ? '<p>' + esc(h.o) + '</p>' : '') + '</div></li>').join('') + '</ul>');
  }
  // Tvůrci: lidé za kamerou s fotkou, jinak seznam rolí (starší karty)
  const tvurci = D.tvurciBezHercu(x);
  if ((x.lide || []).length || tvurci.length) {
    const lide = (x.lide || []).length ? '<ul class="kn-lide">' + x.lide.map((h) => '<li class="kn-osoba">' + fotoHtml(h, chybne) +
      '<div class="kn-osoba__text"><b>' + esc(h.jmeno) + '</b>' + (h.role ? '<small>' + esc(h.role) + '</small>' : '') + (h.o ? '<p>' + esc(h.o) + '</p>' : '') + '</div></li>').join('') + '</ul>' : '';
    const role = !lide && tvurci.length ? '<dl class="kn-tvurci">' + tvurci.map((t) => '<div><dt>' + esc(velkePrvni(t.role)) + '</dt><dd>' + esc((t.jmena || []).join(', ')) + '</dd></div>').join('') + '</dl>' : '';
    telo += oddil('kn-o-tvurci', kniha ? 'Autor a tvůrci' : 'Lidé za kamerou', lide + role);
  }
  // Postavy (knihy)
  if ((x.postavy || []).length) {
    telo += oddil('kn-o-postavy', 'Postavy', '<ul class="kn-postavy">' + x.postavy.map((p) => '<li class="kn-postava"><span class="kn-postava__znak" style="--h:' + odstin(p.jmeno) + '" aria-hidden="true">' +
      esc(inicialyJmena(p.jmeno)) + '</span><span><b>' + esc(p.jmeno) + '</b>' + (p.o ? '<small>' + esc(p.o) + '</small>' : '') + '</span></li>').join('') + '</ul>');
  }
  // Fakta: dlaždice čísel (KPI jako ve Fixtracku)
  if ((x.fakta || []).length) {
    // delší hodnota („IMAX 65 mm a 65 mm, část černobíle“) menším písmem – velké číslo jen u krátkých
    telo += oddil('kn-o-fakta', 'Fakta', '<div class="kn-fakta">' + x.fakta.map((f) => '<div class="kn-fakt' + (String(f.hodnota).length > 16 ? ' kn-fakt--dlouhy' : '') + '"><small>' +
      esc(f.co) + '</small><b class="cisla">' + esc(f.hodnota) + '</b></div>').join('') + '</div>');
  }
  // Sekce od Clauda (vznik, hudba, historické pozadí…)
  (x.sekce || []).forEach((s, i) => {
    if (s && (s.nadpis || (s.odstavce || []).length || (s.body || []).length)) telo += oddil(D.kotvaSekce(s, i), s.nadpis || 'Sekce ' + (i + 1), textSekceHtml(s), 'kn-sekce--text');
  });
  // Série
  if (x.serie && ((x.serie.dily || []).length || x.serie.poradi)) telo += oddil('kn-o-serie', 'Série' + (x.serie.nazev ? ' · ' + x.serie.nazev : ''), serieHtml(x.serie, kniha));
  // Zajímavosti, skutečnost vs. film, ocenění
  if ((x.zajimavosti || []).length || x.skutecnost || (x.oceneni || []).length) {
    telo += oddil('kn-o-zajimavosti', 'Zajímavosti',
      ((x.zajimavosti || []).length ? '<ol class="kn-zajimavosti">' + x.zajimavosti.map((z, i) => '<li><span class="kn-zajimavosti__c cisla">' + (i + 1) + '</span><p>' + esc(z) + '</p></li>').join('') + '</ol>' : '') +
      (x.skutecnost ? '<div class="kn-skutecnost">' + podnadpis('Skutečnost vs. ' + (video ? 'film' : 'kniha')) + '<div class="kn-text">' + odstavce(x.skutecnost) + '</div></div>' : '') +
      ((x.oceneni || []).length ? '<div class="kn-oceneni-blok">' + podnadpis('Ocenění') + body(x.oceneni, 'kn-body--oceneni') + '</div>' : ''));
  }
  // Kde sledovat / sehnat
  if (x.kdeSledovat && x.kdeSledovat.text) {
    telo += oddil('kn-o-kde', video ? 'Kde sledovat' : 'Kde sehnat', '<div class="kn-kde"><span class="kn-kde__ikona">' + (video ? IKONY.prehrat : IKONY.knihovna) + '</span><div>' +
      '<p>' + esc(x.kdeSledovat.text) + '</p>' +
      (x.kdeSledovat.overeno ? '<p class="kn-overeno">' + IKONY.fajfka + '<span>ověřeno ' + esc(datumZIso(x.kdeSledovat.overeno)) + '</span></p>' : '') + '</div></div>');
  }
  // Podobné (tipy) a související (v knihovně)
  const pod = podobneHtml(data, x, chybne);
  const souv = souvisiHtml(data, x);
  if (pod || souv) telo += oddil('kn-o-podobne', pod ? 'Podobné' : 'Související', pod + (pod && souv ? podnadpis('Související') : '') + souv);
  telo += odkazyHtml(x.odkazy, x.zdroje) + pataHtml(x);

  const zalozka = { filmy: 'Filmy a seriály', knihy: 'Knihy' }[D.zalozkaDruhu(x.druh)];
  return { lista: listaHtml(zalozka, D.odkazDatabaze(x)), hero, moje: mojeHtml(x.id, x.druh, m, true), nav: navHtml(D.oddilyKarty(x)), telo, titul: x.nazev };
}

function serieHtml(s, kniha) {
  const dily = s.dily || [];
  const celkem = D.celkemMinut(dily);
  const maDelku = dily.some((d) => d.delka), maPozn = dily.some((d) => d.pozn);
  return (s.poradi ? '<p class="kn-poradi">' + IKONY.info + '<span><b>Doporučené pořadí:</b> ' + esc(s.poradi) + '</span></p>' : '') +
    (dily.length ? '<div class="kn-tabulka-obal"><table class="kn-tabulka"><thead><tr><th scope="col">#</th><th scope="col">' + (kniha ? 'Díl' : 'Název') + '</th>' +
      '<th scope="col">Rok</th>' + (maDelku ? '<th scope="col">Délka</th>' : '') + (maPozn ? '<th scope="col">Poznámka</th>' : '') + '</tr></thead><tbody>' +
      dily.map((d, i) => '<tr><td class="kn-tabulka__c cisla">' + (i + 1) + '</td><td class="kn-tabulka__nazev"><b>' + esc(d.nazev) + '</b>' +
        (d.original && d.original !== d.nazev ? '<small>' + esc(d.original) + '</small>' : '') + '</td>' +
        '<td class="cisla" data-popisek="Rok">' + esc(d.rok || '') + '</td>' + (maDelku ? '<td class="cisla" data-popisek="Délka">' + esc(d.delka || '') + '</td>' : '') +
        (maPozn ? '<td class="kn-tabulka__pozn" data-popisek="Poznámka">' + esc(d.pozn || '') + '</td>' : '') + '</tr>').join('') +
      '</tbody></table></div>' : '') +
    (celkem ? '<p class="kn-serie__celkem">' + dily.length + ' ' + tvar(dily.length, 'díl', 'díly', 'dílů') + ' · celkem ' + esc(trvani(celkem * 60e3)) + '</p>' : '');
}

/** Podobné tipy: s kartou v knihovně → otevřít, čeká → „Claude připravuje…“, jinak Přidat jedním klepnutím. */
function podobneHtml(data, x, chybne) {
  const p = D.podobne(data, x);
  if (!p.length) return '';
  return '<ul class="kn-podobne">' + p.map((o) => {
    const meta = [o.rok, o.proc].filter(Boolean).join(' · ');
    const telo = obrazekHtml(o.obrazek, o.nazev, 'kn-obr--podobne', chybne) + '<span class="kn-podobne__text"><b>' + esc(o.nazev) + '</b>' +
      (o.rok ? '<em class="cisla">' + esc(o.rok) + '</em>' : '') + (o.proc ? '<small>' + esc(o.proc) + '</small>' : '') + '</span>';
    if (o.id) {
      return '<li class="kn-podobne__polozka" data-kn-karta="' + esc(o.id) + '"><button type="button" class="kn-podobne__otevri" data-kn-otevri="' + esc(o.id) + '" aria-label="' +
        esc(o.nazev + (meta ? ', ' + meta : '') + ' – otevřít v knihovně') + '">' + telo + '<span class="kn-podobne__akce kn-podobne__akce--je">' + IKONY.knihovna + 'V knihovně</span></button></li>';
    }
    return '<li class="kn-podobne__polozka kn-podobne__polozka--neni"><div class="kn-podobne__otevri">' + telo +
      (o.ceka ? '<span class="tag kn-ceka">' + IKONY.claude + 'Claude připravuje…</span>'
        : '<button type="button" class="btn btn--ghost btn--sm kn-podobne__akce" data-kn-podobne-pridat data-kn-druh="' + esc(o.druh) + '" data-kn-text="' + esc(o.nazev) + '">' +
          IKONY.plus + '<span>Přidat do knihovny</span></button>') + '</div></li>';
  }).join('') + '</ul>';
}

// ---------------------------------------------------------------- rešerše (čtečka)

/**
 * Části čtečky rešerše: idx = položka z indexu (název, krátce – je hned), r = { data, nacita, chyba } (celá z motoru).
 * Dokud se celá nenačte, ukáže hlavičku z indexu a kostru.
 */
export function reserseCasti(idx, r, ctx) {
  const x = (r && r.data) || idx;
  const m = D.moje(ctx.data, idx.id);
  const t = D.cas(x.pripraveno);
  const hero = '<header class="kn-hero kn-hero--reserse" data-oblast="knihovna">' +
    '<span class="kn-hero__znak" aria-hidden="true">' + IKONY.knihovna + '</span>' +
    '<div class="kn-hero__text"><div class="kn-hero__hlava"><p class="kn-hero__druh">Rešerše' + (t ? ' · ' + esc(dm(t) + ' ' + new Date(t).getFullYear()) : '') + '</p>' +
      '<h1 class="kn-hero__nazev" tabindex="-1">' + esc(x.nazev) + '</h1></div>' +
      '<div class="kn-hero__dalsi">' +
        (x.otazka ? '<p class="kn-otazka">' + IKONY.otazka + '<span>' + esc(x.otazka) + '</span></p>' : '') +
        ((x.stitky || []).length ? '<div class="kn-zanry">' + x.stitky.map((s) => '<span class="tag tag--seda">' + esc(s) + '</span>').join('') + '</div>' : '') +
    '</div></div></header>';
  const casti = { lista: listaHtml('Rešerše', null), hero, moje: mojeHtml(idx.id, 'reserse', m, false), titul: x.nazev };
  if (!r || !r.data) {
    return Object.assign({}, PRAZDNE, casti, { telo: (x.kratce ? oddil('kn-o-kratce', 'Krátce', '<div class="kn-kratce"><div class="kn-text">' + odstavce(x.kratce) + '</div></div>') : '') +
      '<section class="card">' + (r && r.chyba ? chybaHtml(r.chyba, 'data-kn-reserse-znovu="' + esc(idx.id) + '"') : kostra(8)) + '</section>' });
  }
  let telo = '';
  if (x.kratce || (x.cisla || []).length) {
    telo += oddil('kn-o-kratce', 'Krátce', (x.kratce ? '<div class="kn-kratce"><div class="kn-text">' + odstavce(x.kratce) + '</div></div>' : '') +
      ((x.cisla || []).length ? '<div class="kn-fakta kn-cisla">' + x.cisla.map((c) => '<div class="kn-fakt"><b class="cisla">' + esc(c.hodnota) + '</b><small>' + esc(c.co || '') + '</small></div>').join('') + '</div>' : ''));
  }
  (x.sekce || []).forEach((s, i) => {
    if (s && (s.nadpis || (s.odstavce || []).length || (s.body || []).length)) telo += oddil(D.kotvaSekce(s, i), s.nadpis || 'Sekce ' + (i + 1), textSekceHtml(s), 'kn-sekce--text');
  });
  if ((x.casovaOsa || []).length) {
    telo += oddil('kn-o-osa', 'Časová osa', '<ol class="kn-osa">' + x.casovaOsa.map((c) => '<li><b class="cisla">' + esc(c.kdy) + '</b><span>' + esc(c.co) + '</span></li>').join('') + '</ol>');
  }
  if ((x.pojmy || []).length) {
    telo += oddil('kn-o-pojmy', 'Pojmy', '<div class="kn-pojmy">' + x.pojmy.map((p) => '<details><summary>' + esc(p.pojem) + '</summary><p>' + esc(p.vysvetleni || '') + '</p></details>').join('') + '</div>');
  }
  if ((x.dalsiOtazky || []).length) {
    telo += oddil('kn-o-otazky', 'Další otázky', '<p class="kn-napoveda">Klepnutím pošleš otázku Claudovi – připraví k ní novou rešerši.</p><div class="kn-otazky">' +
      x.dalsiOtazky.map((q) => '<button type="button" class="kn-otazky__polozka" data-kn-otazka="' + esc(q) + '">' + IKONY.otazka + '<span>' + esc(q) + '</span>' +
        '<em>' + IKONY.plus + 'Zeptat se</em></button>').join('') + '</div>');
  }
  const souv = souvisiHtml(ctx.data, x);
  const zdroje = odkazyHtml([], x.zdroje, true);
  if (souv || zdroje) telo += oddil('kn-o-zdroje', 'Zdroje', zdroje + (souv ? podnadpis('Související') + souv : ''));
  telo += pataHtml(x);
  return Object.assign({}, casti, { nav: navHtml(D.oddilyReserse(x)), telo });
}

// ---------------------------------------------------------------- karta, která v knihovně (zatím) není

/** Načítání (knihovna se ještě čte) nebo „v knihovně není“ (smazaná karta, starý odkaz). */
export function chybiCasti(nacita, id) {
  return Object.assign({}, PRAZDNE, {
    lista: listaHtml('', null), titul: 'Knihovna',
    telo: '<section class="card">' + (nacita ? kostra(6) : '<div class="prazdne prazdne--velke"><i class="kruh kruh--knihovna">' + IKONY.knihovna + '</i>' +
      '<b>Tohle v knihovně není</b><span>Karta „' + esc(id) + '“ se nenašla – možná ji Claude přejmenoval nebo smazal.</span>' +
      '<button type="button" class="btn btn--primary" data-kn-zpet>' + IKONY.zpet + '<span>Zpět do knihovny</span></button></div>') + '</section>'
  });
}
