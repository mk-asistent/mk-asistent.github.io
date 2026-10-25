// Knihovna – podstránka karty (film, seriál, kniha) a čtečka rešerše jako celá stránka (Michal 12. 10.: „u těch filmů bych
// chtěl mít více informací … ať je to pro mě zajímavé … i něco o hercích … do několika různých sekcí … jako klasickou stránku,
// ne jen pás vpravo“; večer: „udělej to přes celou stránku … nedělej to jako prohlížení celé na jedné stránce s tak velkým
// rolováním … když kliknu na té liště, ať se mi to zobrazí jen k té dané věci“ → ZÁLOŽKY přes celou šířku).
// Tady se jen skládá HTML z dat – stav, adresu #knihovna/<id>[/<záložka>], historii, přepínání záložek a klávesy má
// js/knihovna.js (tenhle soubor načte s sebou, start aplikace na něj nečeká). Vzhled Fixtrack (skill osobni-vzhled), knihovna.css.
// HTML nezávisí na tom, která záložka je otevřená (všechny panely jsou v něm) – vybranou záložku a podzáložku nastaví
// knihovna.js přímo v DOM (hidden, aria-selected), takže přepnutí nic nepřekresluje a obrázky se nenačítají znovu.
// Stránka má pět částí, které se překreslují zvlášť (rozepsaná poznámka se nepřepíše):
//   lista – „← Knihovna“, kopírovat odkaz, ČSFD / Databáze knih
//   hero  – rozmazané pozadí z plakátu, plakát / obálka, název, originál, rok, žánry, hlavní tvůrce, hodnocení, krátce
//           (na jiné než první záložce zúžená na jeden řádek – třída kn-st--kompakt, knihovna.css)
//   moje  – můj stav, hvězdy, poznámka (vpravo v hlavičce)
//   nav   – lepkavý pás záložek (role tablist; jen ty, které karta má)
//   telo  – panely záložek (role tabpanel) + pata

import { esc, odstin, dm, tvar, velkePrvni, trvani, iniciala as inicialyJmena } from './pomocne.js';
import { IKONY } from './ikony.js';
import { kostra, chybaHtml } from './ui.js';
import * as D from './knihovna_data.js';

const PRAZDNE = { lista: '', hero: '', moje: '', nav: '', telo: '', zalozky: [] };
const ven = (u) => ' href="' + esc(u) + '" target="_blank" rel="noopener noreferrer"';
const PRVNI_FAKTA = 4; // nejdůležitější fakta na Přehledu (všechna jsou v záložce Fakta)

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
  const img = u && !(chybne && chybne.has(u)) ? '<img src="' + esc(u) + '" alt="" width="96" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '';
  const stranka = img && D.bezpecnaUrl(o.fotoStranka);
  return '<span class="kn-osoba__foto"><span class="kn-foto" style="--h:' + odstin(o.jmeno) + '" aria-hidden="true"><b>' + esc(inicialyJmena(o.jmeno)) + '</b>' + img + '</span>' +
    (img ? (stranka ? '<a class="kn-foto__zdroj"' + ven(stranka) + '>Foto: Wikimedia Commons</a>' : '<small class="kn-foto__zdroj">Foto: Wikimedia Commons</small>') : '') + '</span>';
}

/** Blok (bílá karta) s nadpisem uvnitř panelu záložky; prázdný obsah = nic. */
function blok(nadpis, obsah, trida, pocet) {
  if (!obsah) return '';
  return '<section class="kn-blok' + (trida ? ' ' + trida : '') + '">' + (nadpis ? '<h2 class="kn-blok__nadpis">' + esc(nadpis) +
    (pocet ? '<small class="cisla">' + pocet + '</small>' : '') + '</h2>' : '') + obsah + '</section>';
}
const podnadpis = (t) => '<h3 class="kn-podnadpis">' + esc(t) + '</h3>';
const body = (a, trida) => ((a || []).length ? '<ul class="kn-body' + (trida ? ' ' + trida : '') + '">' + a.map((b) => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '');

/** Panel záložky (role tabpanel; hidden nastaví knihovna.js podle vybrané záložky). Jediný panel (bez pásu) je jen obal. */
function panel(klic, obsah, sPasem) {
  return '<div class="kn-panel kn-panel--' + esc(klic) + '" data-kn-panel="' + esc(klic) + '"' + (sPasem ? ' id="kn-panel-' + esc(klic) + '" role="tabpanel" aria-labelledby="kn-tab-' +
    esc(klic) + '" tabindex="-1"' : '') + '>' + obsah + '</div>';
}

const IKONA_ZALOZKY = { prehled: 'prehled', herci: 'lide', postavy: 'lide', zakulisi: 'foto', fakta: 'info', serie: 'tabulka', kde: 'prehrat', podobne: 'srdce',
  shrnuti: 'prehled', obsah: 'knihovna', osa: 'cas', pojmy: 'otazka', zdroje: 'odkaz' };

/** Pás záložek (až od dvou – jedna nemá smysl). Klíč = část adresy #knihovna/<id>/<klíč>. */
function navHtml(zalozky, kniha) {
  if (zalozky.length < 2) return '';
  return '<nav class="kn-oddily" aria-label="Části stránky"><div class="kn-oddily__pas" role="tablist" aria-label="Části stránky">' +
    zalozky.map((z) => {
      const ikona = IKONY[z[0] === 'kde' && kniha ? 'knihovna' : z[0] === 'zakulisi' && kniha ? 'misto' : IKONA_ZALOZKY[z[0]]] || '';
      return '<button type="button" class="kn-oddily__btn" role="tab" id="kn-tab-' + esc(z[0]) + '" aria-controls="kn-panel-' + esc(z[0]) + '" aria-selected="false" tabindex="-1" data-kn-tab="' +
        esc(z[0]) + '">' + ikona + '<span>' + esc(z[1]) + '</span></button>';
    }).join('') + '</div></nav>';
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

/** Rozmazané pozadí hlavičky z plakátu (jen obrázek, který jde načíst). Adresa je stejná jako u plakátu (prohlížeč ji vezme
 *  z mezipaměti) – v CSS v uvozovkách (bezpecnaUrl uvozovky ani zpětné lomítko nepustí, závorky v názvu souboru nevadí). */
function pozadiHtml(url, chybne) {
  const u = D.bezpecnaUrl(url);
  if (!u || (chybne && chybne.has(u))) return '';
  return '<div class="kn-hero__pozadi" aria-hidden="true"><i style="background-image:url(' + esc('"' + u + '"') + ')"></i></div>';
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

/** Odkazy (čipy). */
function odkazyHtml(odkazy) {
  const o = (odkazy || []).filter((x) => D.bezpecnaUrl(x.url));
  return o.length ? '<div class="kn-odkazy">' + o.map((x) => '<a class="chip"' + ven(x.url) + '>' + esc(x.nazev) + IKONY.odkaz + '</a>').join('') + '</div>' : '';
}
/** Zdroje jako číslovaný seznam (na širokém ve sloupcích). */
function zdrojeHtml(zdroje) {
  const z = (zdroje || []).filter((x) => D.bezpecnaUrl(x.url));
  return z.length ? '<ol class="kn-zdroje">' + z.map((x) => '<li><a' + ven(x.url) + '>' + esc(x.nazev) + IKONY.odkaz + '</a></li>').join('') + '</ol>' : '';
}
const pocetZdroju = (zdroje) => (zdroje || []).filter((x) => D.bezpecnaUrl(x.url)).length;

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

/** Dlaždice faktů / čísel (KPI jako ve Fixtracku); delší hodnota menším písmem. */
function faktaHtml(fakta, trida) {
  return '<div class="kn-fakta' + (trida ? ' ' + trida : '') + '">' + fakta.map((f) => '<div class="kn-fakt' + (String(f.hodnota).length > 16 ? ' kn-fakt--dlouhy' : '') + '"><small>' +
    esc(f.co) + '</small><b class="cisla">' + esc(f.hodnota) + '</b></div>').join('') + '</div>';
}

/** Odkaz na jinou záložku („Všechna fakta →“). */
const naZalozku = (klic, text) => '<button type="button" class="kn-dal" data-kn-tab-prejdi="' + esc(klic) + '"><span>' + esc(text) + '</span>' + IKONY.vpravo + '</button>';

/**
 * Čtení sekcí po jedné (Zákulisí karty, Obsah rešerše): na PC svislý seznam nadpisů vlevo a vybraná sekce vpravo, na telefonu
 * vodorovný výběr nahoře. Klíč seznamu = klíč záložky (knihovna.js si pamatuje vybranou sekci pro každou kartu).
 */
function cteniHtml(klicZalozky, sekce, popisek) {
  if (!sekce.length) return '';
  const vic = sekce.length > 1;
  const nav = vic ? '<div class="kn-cteni__nav" role="tablist" aria-orientation="vertical" aria-label="' + esc(popisek) + '">' + sekce.map((s, i) =>
    '<button type="button" class="kn-cteni__btn" role="tab" id="kn-ptab-' + esc(s.klic) + '" aria-controls="kn-pp-' + esc(s.klic) + '" aria-selected="false" tabindex="-1" data-kn-pod="' +
      esc(s.klic) + '"><span class="kn-cteni__c cisla">' + (i + 1) + '</span><span class="kn-cteni__plny">' + esc(s.nadpis) + '</span><span class="kn-cteni__kratky">' +
      esc(s.kratky) + '</span></button>').join('') + '</div>' : '';
  const clanky = sekce.map((s, i) => {
    const o = s.s.odstavce || [], b = s.s.body || [];
    const delka = o.join(' ').length;
    const text = o.length ? '<div class="kn-text' + (!b.length && delka > 900 ? ' kn-text--dva' : '') + '">' + o.map((t) => odstavce(t)).join('') + '</div>' : '';
    const vkostce = b.length ? '<aside class="kn-vkostce"><p class="kn-podnadpis">' + (o.length ? 'V kostce' : 'Body') + '</p>' + body(b) + '</aside>' : '';
    const pred = i > 0 ? sekce[i - 1] : null, dalsi = i < sekce.length - 1 ? sekce[i + 1] : null;
    return '<article class="kn-cteni__clanek" id="kn-pp-' + esc(s.klic) + '" data-kn-podpanel="' + esc(s.klic) + '"' + (vic ? ' role="tabpanel" aria-labelledby="kn-ptab-' + esc(s.klic) + '" tabindex="-1"' : '') + '>' +
      (vic ? '<p class="kn-cteni__poradi cisla">' + (i + 1) + ' / ' + sekce.length + '</p>' : '') +
      '<h2 class="kn-cteni__nadpis">' + esc(s.nadpis) + '</h2>' +
      '<div class="kn-cteni__telo' + (text && vkostce ? ' kn-cteni__telo--dva' : '') + '">' + text + vkostce + '</div>' +
      (vic ? '<div class="kn-cteni__dalsi">' + (pred ? '<button type="button" class="kn-dal kn-dal--zpet" data-kn-pod="' + esc(pred.klic) + '">' + IKONY.vlevo + '<span>' + esc(pred.kratky) + '</span></button>' : '<span></span>') +
        (dalsi ? '<button type="button" class="kn-dal" data-kn-pod="' + esc(dalsi.klic) + '"><span>Další: ' + esc(dalsi.kratky) + '</span>' + IKONY.vpravo + '</button>' : '') + '</div>' : '') +
      '</article>';
  }).join('');
  return '<section class="kn-blok kn-cteni' + (vic ? '' : ' kn-cteni--jedna') + '" data-kn-cteni="' + esc(klicZalozky) + '">' + nav + '<div class="kn-cteni__obsah">' + clanky + '</div></section>';
}

/** Lidé (herci, lidé za kamerou): karta s fotkou, jménem, rolí a textem. */
function lideHtml(lide, chybne, popis) {
  return '<ul class="kn-lide">' + lide.map((h) => '<li class="kn-osoba"><div class="kn-osoba__hlava">' + fotoHtml(h, chybne) +
    '<div class="kn-osoba__jmeno"><b>' + esc(h.jmeno) + '</b>' + (popis(h) ? '<small>' + esc(popis(h)) + '</small>' : '') + '</div></div>' +
    (h.o ? '<p class="kn-osoba__o">' + esc(h.o) + '</p>' : '') + '</li>').join('') + '</ul>';
}

// ---------------------------------------------------------------- karta (film, seriál, kniha)

/**
 * Části podstránky karty. ctx = { data (knihovna), chybne (Set obrázků, které nejdou načíst) }.
 * Vrací { lista, hero, moje, nav, telo, titul, zalozky }.
 */
export function kartaCasti(x, ctx) {
  const data = ctx.data, chybne = ctx.chybne;
  const m = D.moje(data, x.id);
  const video = x.druh !== 'kniha';
  const kniha = !video;
  const meta = [D.DRUHY[x.druh], D.rokKarty(x), kniha && x.stran ? x.stran + ' stran' : x.delka, x.zeme].filter(Boolean);
  const tvurce = D.hlavniTvurce(x);
  // hlavička: na PC plakát | název, meta, hodnocení, krátce | (Moje vedle, js/knihovna.js); na telefonu plakát a název vedle sebe
  const hero = pozadiHtml(x.obrazek && x.obrazek.url, chybne) + '<header class="kn-hero" data-oblast="knihovna">' +
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

  const zalozky = D.zalozkyKarty(x);
  const panely = {
    // Přehled: o čem to je (čitelná šířka) | tmavá karta Proč + citáty | nejdůležitější fakta; na užším pod sebou
    prehled: () => {
      const citaty = (x.citaty || []).length ? '<div class="kn-citaty">' + x.citaty.map((c) => '<figure class="kn-citat"><blockquote>' + esc(c.text) + '</blockquote>' +
        (c.kdo ? '<figcaption>' + esc(c.kdo) + '</figcaption>' : '') + '</figure>').join('') + '</div>' : '';
      const fakta = (x.fakta || []).slice(0, PRVNI_FAKTA);
      const vic = (x.fakta || []).length > PRVNI_FAKTA || (x.zajimavosti || []).length || x.skutecnost || (x.oceneni || []).length;
      return '<div class="kn-prehled">' +
        (x.obsah ? blok(video ? 'O čem to je' : 'O čem kniha je', '<div class="kn-text">' + odstavce(x.obsah) + '</div>', 'kn-p-obsah') : '') +
        (x.proc || citaty ? '<div class="kn-p-proc">' + (x.proc ? '<aside class="kn-proc"><p class="kn-proc__nadpis">' + IKONY.hvezda + '<span>Proč to stojí za to</span></p>' +
          odstavce(x.proc) + '</aside>' : '') + citaty + '</div>' : '') +
        (fakta.length ? blok('V číslech', faktaHtml(fakta, 'kn-fakta--prehled') + (vic ? naZalozku('fakta', 'Všechna fakta a zajímavosti') : ''), 'kn-p-fakta') : '') +
        '</div>';
    },
    // Herci (u knih Postavy) a lidé za kamerou jako druhá skupina; starší karta jen se seznamem rolí
    herci: () => lidePanel(),
    postavy: () => lidePanel(),
    // Zákulisí (u knih Svět a autor): sekce od Clauda po jedné
    zakulisi: () => cteniHtml('zakulisi', D.sekcePodzalozek(x), kniha ? 'Svět a autor' : 'Zákulisí'),
    // Fakta a zajímavosti: dlaždice čísel | zajímavosti, skutečnost vs. film, ocenění
    fakta: () => '<div class="kn-fakta-panel">' +
      ((x.fakta || []).length ? blok('V číslech', faktaHtml(x.fakta), 'kn-fp-cisla') : '') +
      ((x.zajimavosti || []).length ? blok('Zajímavosti', '<ol class="kn-zajimavosti">' + x.zajimavosti.map((z, i) => '<li><span class="kn-zajimavosti__c cisla">' + (i + 1) + '</span><p>' + esc(z) +
        '</p></li>').join('') + '</ol>', 'kn-fp-zaj', x.zajimavosti.length) : '') +
      (x.skutecnost ? blok('Skutečnost vs. ' + (video ? 'film' : 'kniha'), '<div class="kn-text">' + odstavce(x.skutecnost) + '</div>', 'kn-fp-skut') : '') +
      ((x.oceneni || []).length ? blok('Ocenění', body(x.oceneni, 'kn-body--oceneni'), 'kn-fp-oceneni') : '') + '</div>',
    serie: () => blok('Série' + (x.serie.nazev ? ' · ' + x.serie.nazev : ''), serieHtml(x.serie, kniha), 'kn-serie-blok'),
    // Kde sledovat / sehnat, odkazy, zdroje
    kde: () => '<div class="kn-kde-panel">' +
      (x.kdeSledovat && x.kdeSledovat.text ? blok(video ? 'Kde sledovat' : 'Kde sehnat', '<div class="kn-kde"><span class="kn-kde__ikona">' + (video ? IKONY.prehrat : IKONY.knihovna) + '</span><div>' +
        '<p>' + esc(x.kdeSledovat.text) + '</p>' +
        (x.kdeSledovat.overeno ? '<p class="kn-overeno">' + IKONY.fajfka + '<span>ověřeno ' + esc(datumZIso(x.kdeSledovat.overeno)) + '</span></p>' : '') + '</div></div>', 'kn-kp-kde') : '') +
      blok('Odkazy', odkazyHtml(x.odkazy), 'kn-kp-odkazy') +
      blok('Zdroje', zdrojeHtml(x.zdroje), 'kn-kp-zdroje', pocetZdroju(x.zdroje)) + '</div>',
    // Podobné (tipy) a související (v knihovně)
    podobne: () => {
      const pod = podobneHtml(data, x, chybne);
      return '<div class="kn-podobne-panel">' + blok('Podobné', pod, 'kn-pp-podobne') + blok('Související', souvisiHtml(data, x), 'kn-pp-souvisi') + '</div>';
    }
  };
  function lidePanel() {
    const tvurci = D.tvurciBezHercu(x);
    const herci = (x.herci || []).length ? blok('Herci', lideHtml(x.herci, chybne, (h) => (h.postava ? 'jako ' + h.postava : '')), 'kn-lp-herci', x.herci.length) : '';
    const postavy = (x.postavy || []).length ? blok('Postavy', '<ul class="kn-postavy">' + x.postavy.map((p) => '<li class="kn-postava"><span class="kn-postava__znak" style="--h:' +
      odstin(p.jmeno) + '" aria-hidden="true">' + esc(inicialyJmena(p.jmeno)) + '</span><span><b>' + esc(p.jmeno) + '</b>' + (p.o ? '<small>' + esc(p.o) + '</small>' : '') + '</span></li>').join('') +
      '</ul>', 'kn-lp-postavy', x.postavy.length) : '';
    const lide = (x.lide || []).length ? lideHtml(x.lide, chybne, (h) => h.role || '')
      : tvurci.length ? '<dl class="kn-tvurci">' + tvurci.map((t) => '<div><dt>' + esc(velkePrvni(t.role)) + '</dt><dd>' + esc((t.jmena || []).join(', ')) + '</dd></div>').join('') + '</dl>' : '';
    const zaKamerou = blok(kniha ? 'Autor a tvůrci' : 'Lidé za kamerou', lide, 'kn-lp-lide', (x.lide || []).length);
    return '<div class="kn-lide-panel">' + (kniha ? postavy + zaKamerou + herci : herci + postavy + zaKamerou) + '</div>';
  }

  // jen jedna nebo žádná záložka (starší jednoduchá karta): obsah bez pásu
  const telo = zalozky.map((z) => panel(z[0], panely[z[0]](), zalozky.length > 1)).join('') + pataHtml(x);
  const zalozkaSeznamu = { filmy: 'Filmy a seriály', knihy: 'Knihy' }[D.zalozkaDruhu(x.druh)];
  return { lista: listaHtml(zalozkaSeznamu, D.odkazDatabaze(x)), hero, moje: mojeHtml(x.id, x.druh, m, true), nav: navHtml(zalozky, kniha), telo, titul: x.nazev, zalozky };
}

function serieHtml(s, kniha) {
  const dily = s.dily || [];
  const celkem = D.celkemMinut(dily);
  const maDelku = dily.some((d) => d.delka), maPozn = dily.some((d) => d.pozn);
  const tabulka = dily.length ? '<div class="kn-tabulka-obal"><table class="kn-tabulka"><thead><tr><th scope="col">#</th><th scope="col">' + (kniha ? 'Díl' : 'Název') + '</th>' +
      '<th scope="col">Rok</th>' + (maDelku ? '<th scope="col">Délka</th>' : '') + (maPozn ? '<th scope="col">Poznámka</th>' : '') + '</tr></thead><tbody>' +
      dily.map((d, i) => '<tr><td class="kn-tabulka__c cisla">' + (i + 1) + '</td><td class="kn-tabulka__nazev"><b>' + esc(d.nazev) + '</b>' +
        (d.original && d.original !== d.nazev ? '<small>' + esc(d.original) + '</small>' : '') + '</td>' +
        '<td class="cisla" data-popisek="Rok">' + esc(d.rok || '') + '</td>' + (maDelku ? '<td class="cisla" data-popisek="Délka">' + esc(d.delka || '') + '</td>' : '') +
        (maPozn ? '<td class="kn-tabulka__pozn" data-popisek="Poznámka">' + esc(d.pozn || '') + '</td>' : '') + '</tr>').join('') +
      '</tbody></table></div>' +
      (celkem ? '<p class="kn-serie__celkem">' + dily.length + ' ' + tvar(dily.length, 'díl', 'díly', 'dílů') + ' · celkem ' + esc(trvani(celkem * 60e3)) + '</p>' : '') : '';
  const poradi = s.poradi ? '<aside class="kn-poradi">' + IKONY.info + '<span><b>Doporučené pořadí:</b> ' + esc(s.poradi) + '</span></aside>' : '';
  return '<div class="kn-serie' + (tabulka && poradi ? ' kn-serie--dva' : '') + '">' + (tabulka ? '<div class="kn-serie__dily">' + tabulka + '</div>' : '') + poradi + '</div>';
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
 * Dokud se celá nenačte, ukáže hlavičku z indexu, krátce a kostru (bez záložek).
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
  const casti = { lista: listaHtml(D.jeAi(idx) ? 'Rešerše AI' : 'Rešerše', null), hero, moje: mojeHtml(idx.id, 'reserse', m, false), titul: x.nazev };
  if (!r || !r.data) {
    return Object.assign({}, PRAZDNE, casti, { telo: (x.kratce ? blok('Krátce', '<div class="kn-kratce"><div class="kn-text">' + odstavce(x.kratce) + '</div></div>') : '') +
      '<section class="card">' + (r && r.chyba ? chybaHtml(r.chyba, 'data-kn-reserse-znovu="' + esc(idx.id) + '"') : kostra(8)) + '</section>' });
  }
  const zalozky = D.zalozkyReserse(x);
  const panely = {
    // Shrnutí: krátce + výrazná čísla | další otázky (klepnutí = nová rešerše)
    shrnuti: () => '<div class="kn-shrnuti">' +
      (x.kratce || (x.cisla || []).length ? blok('Krátce', (x.kratce ? '<div class="kn-kratce"><div class="kn-text">' + odstavce(x.kratce) + '</div></div>' : '') +
        ((x.cisla || []).length ? '<div class="kn-fakta kn-cisla">' + x.cisla.map((c) => '<div class="kn-fakt"><b class="cisla">' + esc(c.hodnota) + '</b><small>' + esc(c.co || '') +
          '</small></div>').join('') + '</div>' : '') +
        (D.sekcePodzalozek(x).length ? naZalozku('obsah', 'Číst celé po částech') : ''), 'kn-sh-kratce') : '') +
      ((x.dalsiOtazky || []).length ? blok('Další otázky', '<p class="kn-napoveda">Klepnutím pošleš otázku Claudovi – připraví k ní novou rešerši.</p><div class="kn-otazky">' +
        x.dalsiOtazky.map((q) => '<button type="button" class="kn-otazky__polozka" data-kn-otazka="' + esc(q) + '">' + IKONY.otazka + '<span>' + esc(q) + '</span>' +
          '<em>' + IKONY.plus + 'Zeptat se</em></button>').join('') + '</div>', 'kn-sh-otazky') : '') + '</div>',
    obsah: () => cteniHtml('obsah', D.sekcePodzalozek(x), 'Obsah rešerše'),
    osa: () => blok('Časová osa', '<ol class="kn-osa">' + x.casovaOsa.map((c) => '<li><b class="cisla">' + esc(c.kdy) + '</b><span>' + esc(c.co) + '</span></li>').join('') + '</ol>',
      'kn-osa-blok', x.casovaOsa.length),
    pojmy: () => blok('Pojmy', '<dl class="kn-pojmy">' + x.pojmy.map((p) => '<div><dt>' + esc(p.pojem) + '</dt><dd>' + esc(p.vysvetleni || '') + '</dd></div>').join('') + '</dl>',
      'kn-pojmy-blok', x.pojmy.length),
    zdroje: () => '<div class="kn-kde-panel">' + blok('Zdroje', zdrojeHtml(x.zdroje), 'kn-kp-zdroje', pocetZdroju(x.zdroje)) + blok('Související', souvisiHtml(ctx.data, x), 'kn-kp-souvisi') + '</div>'
  };
  const telo = zalozky.map((z) => panel(z[0], panely[z[0]](), zalozky.length > 1)).join('') + pataHtml(x);
  return Object.assign({}, casti, { nav: navHtml(zalozky, false), telo, zalozky });
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
