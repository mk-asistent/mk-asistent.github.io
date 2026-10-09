// Denní kroužky (Michal 9. 10.: „jedním pohledem jako na Apple Watch“): voda, bílkoviny a pohyb za dnešek proti cílům.
// Malé okénko v horní liště na Dnes (PC, iPad) a malá karta na telefonu. Data jen čte ze stav.zdravi (pití a jídlo,
// odškrtnuté doplňky s bílkovinami, kroky z Apple Watch a WHOOP) – js/zdravi.js se tím nemění.
// Cíle z režimu (CLAUDE_SCHRANKA/ZDRAVI_REZIM.json): pitiCil (ml), bilkovinyCil (g), krokyCil (kroky). Chybí-li cíl,
// platí šetrné obecné výchozí: 2,5 l a 130 g (stejně jako karta Pití a jídlo) a 8 000 kroků (běžné doporučení
// – po zranění spíš chůze než výkon; v režimu jde změnit).

import { stav } from './stav.js';
import { esc, isoDatum, pulnoc } from './pomocne.js';
import { doplnkyDnes } from './zdravi.js';

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
  const kruh = (klic, nazev, hodnota, c, text, kratce) => ({ klic, nazev, hodnota, cil: c, podil: Math.max(0, Math.min(1, hodnota / c)),
    procent: Math.round((hodnota / c) * 100), text, kratce });
  return [
    kruh('voda', 'Voda', ml, cPiti, litry(ml) + ' / ' + litry(cPiti) + ' l', litry(ml) + ' l'),
    kruh('bilkoviny', 'Bílkoviny', b, cB, (odhad ? '≈ ' : '') + cislo(b) + ' / ' + cislo(cB) + ' g', (odhad ? '≈ ' : '') + cislo(b) + ' g'),
    kruh('pohyb', 'Pohyb', kroky, cKroky, cislo(kroky) + ' / ' + cislo(cKroky) + ' kroků', kroky >= 10000 ? cislo(kroky / 1000, 1) + ' tis.' : cislo(kroky))
  ];
}

/** „Voda 1,2 / 2,5 l (48 %) · Bílkoviny 40 / 130 g (31 %) · Pohyb 4 012 / 8 000 kroků (50 %)“ – bublina a popis pro čtečku. */
export function popisKrouzku(k) {
  return (k || []).map((x) => x.nazev + ' ' + x.text + ' (' + x.procent + ' %)').join(' · ');
}

/** Tři soustředné kroužky (SVG, barvy v app.css – oddíl Dnes). */
export function krouzkySvg(k, trida) {
  const R = [17.5, 12.5, 7.5];
  return '<svg class="krouzky' + (trida ? ' ' + trida : '') + '" viewBox="0 0 40 40" aria-hidden="true">' + (k || []).map((x, i) => {
    const obvod = 2 * Math.PI * R[i];
    return '<circle class="krouzky__draha krouzky--' + x.klic + '" cx="20" cy="20" r="' + R[i] + '"/>' +
      (x.podil > 0 ? '<circle class="krouzky__hodnota krouzky--' + x.klic + '" cx="20" cy="20" r="' + R[i] + '" stroke-dasharray="' +
        (obvod * x.podil).toFixed(2) + ' ' + obvod.toFixed(2) + '" transform="rotate(-90 20 20)"/>' : '');
  }).join('') + '</svg>';
}

/** Malá legenda vedle kroužků: barevná tečka + procenta (horní lišta; splněný cíl = ✓) nebo hodnoty (telefon). */
export function legendaHtml(k, hodnoty) {
  return '<span class="krouzky-legenda">' + (k || []).map((x) => '<span class="krouzky-legenda__radek krouzky--' + x.klic + '"><i></i>' +
    esc(hodnoty ? x.kratce : x.procent >= 100 ? '✓' : x.procent + ' %') + '</span>').join('') + '</span>';
}
