// Denní kroužky (Michal 9. 10.: „jedním pohledem jako na Apple Watch“): voda, bílkoviny a pohyb za dnešek proti cílům,
// a když dnes podle režimu platí nějaké hlavní doplňky, čtvrtý kroužek Doplňky (vzato z hlavních – doplnkyDnes().plneni
// z js/zdravi.js, stejné číslo jako karta Doplňky dnes). Malé okénko v horní liště na Přehledu (PC, iPad) a malá karta na
// telefonu; po najetí / klepnutí vyjede karta s velkými kroužky, čísly a cílem (kartaKrouzkuHtml, js/bubliny.js – Michal
// 10. 10.: „ne takhle napsané jen v textu“). Data jen čte ze stav.zdravi (pití a jídlo, odškrtnuté doplňky, kroky
// z Apple Watch a WHOOP).
// Cíle z režimu (CLAUDE_SCHRANKA/ZDRAVI_REZIM.json): pitiCil (ml), bilkovinyCil (g), krokyCil (kroky). Chybí-li cíl,
// platí šetrné obecné výchozí: 2,5 l a 130 g (stejně jako karta Pití a jídlo) a 8 000 kroků (běžné doporučení
// – po zranění spíš chůze než výkon; v režimu jde změnit).

import { stav } from './stav.js';
import { esc, isoDatum, pulnoc } from './pomocne.js';
import { doplnkyDnes } from './zdravi.js';
import { hlavaKarty, pataKarty } from './bubliny.js';

export const VYCHOZI_CILE = { piti: 2500, bilkoviny: 130, kroky: 8000 };

const cislo = (n, des) => Number(n).toLocaleString('cs-CZ', { minimumFractionDigits: des || 0, maximumFractionDigits: des || 0 });
const litry = (ml) => cislo(Math.round(ml / 100) / 10, 1);
const cil = (hodnota, vychozi) => (Number(hodnota) > 0 ? Number(hodnota) : vychozi);

/**
 * Dnešní kroužky (zvenku dovnitř: voda, bílkoviny, pohyb) – null, dokud zdraví není načtené.
 * Každý: { klic, nazev, hodnota, cil, podil (0–1 pro kroužek), procent, text („1,2 / 2,5 l“), kratce („1,2 l“) }.
 */
export function krouzkyDnes(ted) {
  const z = stav.zdravi;
  if (!z) return null;
  const t = ted || Date.now();
  const den = isoDatum(t);
  const rezim = z.rezim || {};
  const pj = (z.pitiJidlo && z.pitiJidlo[den]) || {};
  const ml = (pj.piti || []).reduce((s, x) => s + (Number(x.ml) || 0), 0);
  let b = (pj.jidlo || []).reduce((s, x) => s + (Number(x.bilkoviny) || 0), 0);
  const odhad = (pj.jidlo || []).some((x) => x.odhad === 'mistni');
  // odškrtnuté doplňky s bílkovinami (protein, smoothie) se počítají jako v kartě Pití a jídlo
  const d = doplnkyDnes(pulnoc(t));
  if (d) d.polozky.forEach((p) => { if (p.vzato && Number(p.bilkoviny) > 0) b += Number(p.bilkoviny); });
  // kroky: Apple Watch i WHOOP posílají dnešek průběžně – větší číslo je čerstvější
  const dnes = (z.dny || []).find((x) => x.den === den) || {};
  const kroky = Math.max(Number(dnes.apple && dnes.apple.kroky) || 0, Number(dnes.whoop && dnes.whoop.zatez && dnes.whoop.zatez.kroky) || 0);
  const cPiti = cil(rezim.pitiCil, VYCHOZI_CILE.piti), cB = cil(rezim.bilkovinyCil, VYCHOZI_CILE.bilkoviny), cKroky = cil(rezim.krokyCil, VYCHOZI_CILE.kroky);
  // do vyjeté karty (úzký sloupec u velkého kroužku): karta = [název, hodnota z cíle], zbyva = kolik chybí („zbývá 1,3 l“)
  const kruh = (klic, nazev, hodnota, c, text, kratce, legenda, karta, zbyva) => ({ klic, nazev, hodnota, cil: c, podil: Math.max(0, Math.min(1, hodnota / c)),
    procent: Math.round((hodnota / c) * 100), text, kratce, legenda, karta, zbyva: hodnota >= c ? 'cíl splněn' : zbyva });
  const zbyva = (n, text) => (n >= 2 && n <= 4 && n === Math.round(n) ? 'zbývají ' : 'zbývá ') + text;
  const tVoda = litry(ml) + ' / ' + litry(cPiti) + ' l', tB = (odhad ? '≈ ' : '') + cislo(b) + ' / ' + cislo(cB) + ' g';
  const kruhy = [
    kruh('voda', 'Voda', ml, cPiti, tVoda, litry(ml) + ' l', '', ['Voda', tVoda], zbyva(0, litry(cPiti - ml) + ' l')),
    kruh('bilkoviny', 'Bílkoviny', b, cB, tB, (odhad ? '≈ ' : '') + cislo(b) + ' g', '', ['Bílkoviny', tB], zbyva(0, cislo(cB - b) + ' g')),
    kruh('pohyb', 'Pohyb', kroky, cKroky, cislo(kroky) + ' / ' + cislo(cKroky) + ' kroků', kroky >= 10000 ? cislo(kroky / 1000, 1) + ' tis.' : cislo(kroky), '',
      ['Kroky', cislo(kroky) + ' / ' + cislo(cKroky)], zbyva(cKroky - kroky, cislo(cKroky - kroky)))
  ];
  // hlavní doplňky (ZDRAVI_REZIM.json → hlavni; js/zdravi.js doplnkyDnes().plneni – jen ty, které dnes podle režimu platí):
  // čtvrtý kroužek, když dnes nějaký je – stejné číslo jako „zbývá“ v kartě Doplňky dnes
  const p = d && d.plneni;
  if (p && p.celkem > 0) {
    const hlavnich = Array.isArray(rezim.hlavni) && rezim.hlavni.length ? ' hlavních' : '';
    const n = p.celkem - p.vzato;
    kruhy.push(kruh('doplnky', 'Doplňky', p.vzato, p.celkem, p.vzato + ' z ' + p.celkem + hlavnich, p.vzato + '/' + p.celkem, p.vzato + '/' + p.celkem,
      ['Doplňky', p.vzato + ' z ' + p.celkem], zbyva(n, String(n))));
  }
  return kruhy;
}

/** „Voda 1,2 / 2,5 l (48 %) · Bílkoviny 40 / 130 g (31 %) · Pohyb 4 012 / 8 000 kroků (50 %)“ – bublina a popis pro čtečku. */
export function popisKrouzku(k) {
  return (k || []).map((x) => x.nazev + ' ' + x.text + ' (' + x.procent + ' %)').join(' · ');
}

/** Tři (s doplňky čtyři) soustředné kroužky (SVG, barvy v app.css – oddíl Dnes). */
export function krouzkySvg(k, trida) {
  const ctyri = (k || []).length > 3;
  const R = ctyri ? [17.75, 13.5, 9.25, 5] : [17.5, 12.5, 7.5];
  return '<svg class="krouzky' + (ctyri ? ' krouzky--ctyri' : '') + (trida ? ' ' + trida : '') + '" viewBox="0 0 40 40" aria-hidden="true">' + (k || []).map((x, i) => {
    const obvod = 2 * Math.PI * R[i];
    return '<circle class="krouzky__draha krouzky--' + x.klic + '" cx="20" cy="20" r="' + R[i] + '"/>' +
      (x.podil > 0 ? '<circle class="krouzky__hodnota krouzky--' + x.klic + '" cx="20" cy="20" r="' + R[i] + '" stroke-dasharray="' +
        (obvod * x.podil).toFixed(2) + ' ' + obvod.toFixed(2) + '" transform="rotate(-90 20 20)"/>' : '');
  }).join('') + '</svg>';
}

/** Malá legenda vedle kroužků: barevná tečka + procenta (horní lišta; splněný cíl = ✓) nebo hodnoty (telefon). */
export function legendaHtml(k, hodnoty) {
  return '<span class="krouzky-legenda' + ((k || []).length > 3 ? ' krouzky-legenda--ctyri' : '') + '">' + (k || []).map((x) =>
    '<span class="krouzky-legenda__radek krouzky--' + x.klic + '"><i></i>' +
    esc(hodnoty ? x.kratce : x.procent >= 100 ? '✓' : x.legenda || x.procent + ' %') + '</span>').join('') + '</span>';
}

/** Velký kroužek jedné věci do karty: dráha a hodnota v její barvě, uprostřed procenta (splněno = ✓, doplňky „1/2“). */
function velkyKrouzek(x) {
  const r = 27, o = 2 * Math.PI * r;
  const stred = x.procent >= 100 ? '✓' : x.klic === 'doplnky' ? esc(x.legenda) : x.procent + '<small>%</small>';
  return '<span class="bk-krouzek"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="bk-krouzek__draha" cx="32" cy="32" r="' + r + '"/>' +
    (x.podil > 0 ? '<circle class="bk-krouzek__hodnota" cx="32" cy="32" r="' + r + '" stroke-dasharray="' + (o * x.podil).toFixed(2) + ' ' + o.toFixed(2) + '"/>' : '') +
    '</svg><b class="cisla">' + stred + '</b></span>';
}

/**
 * Vyjetá karta kroužků (dlaždice v horní liště, malá karta na telefonu – js/bubliny.js): pro každou věc velký kroužek
 * s procentem, hodnota z cíle a kolik zbývá; kolik cílů je splněných; tlačítko do Zdraví.
 */
export function kartaKrouzkuHtml(k) {
  if (!k || !k.length) return '';
  const splneno = k.filter((x) => x.procent >= 100).length;
  return hlavaKarty('<span class="bk-ikona bk-ikona--krouzky">' + krouzkySvg(k) + '</span>', 'Denní kroužky · dnes',
    splneno + '<small> ze ' + k.length + '</small>', splneno === k.length ? 'všechny cíle splněné' : 'cílů splněno') +
    '<ul class="bk-krouzky bk-krouzky--' + k.length + '">' + k.map((x) => '<li class="krouzky--' + x.klic + (x.procent >= 100 ? ' splneno' : '') + '">' +
      velkyKrouzek(x) + '<b>' + esc(x.karta[0]) + '</b><span class="cisla">' + esc(x.karta[1]) + '</span><small>' + esc(x.zbyva) + '</small></li>').join('') + '</ul>' +
    pataKarty([['data-cil="zdravi"', 'Zdraví', true]]);
}
