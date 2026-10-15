// Návrhy popisku od Clauda na výběr (Michal 15. 10.: „přepisovat popisky a mít od Clauda vždy 2 varianty na výběr“) – reely
// i plakáty stejně: přepínač Návrh 1 / Návrh 2 s náhledem textu a „Použít“ (text do pole popisku – uloží se jako úprava a jde
// dál přepisovat); u reelu i „Nové návrhy od Clauda“ (motor reelPopisekNavrhy). Data: reel.navrhy.varianty (motor z
// REELY/popisky_claude.json), u plakátu popisky[sobota].varianty (PLAKATY/popisky_claude.json) – píše je jen Claude.

import { esc } from './pomocne.js';
import { IKONY } from './ikony.js';
import { segment } from './ui.js';

/**
 * o = { varianty: [text], volba (index), atribut ('data-reel-navrh' → …-volba, …-pouzit, …-claude), id, ceka (Claude píše),
 *       lzeZadat (tlačítko Nové návrhy od Clauda) } → HTML (prázdné, když není co ukázat).
 */
export function navrhyHtml(o) {
  const v = (o.varianty || []).map((x) => String(x || '')).filter((x) => x.trim());
  const id = esc(o.id || '');
  const zadat = o.lzeZadat && !o.ceka ? '<button type="button" class="btn btn--ghost btn--sm" ' + o.atribut + '-claude="' + id + '">' + IKONY.claude +
    '<span>' + (v.length ? 'Nové návrhy' : 'Návrhy od Clauda') + '</span></button>' : '';
  const ceka = o.ceka ? '<p class="ig-navrhy__ceka">' + IKONY.claude + '<span>Claude píše 2 návrhy… (do půl hodiny, když běží PC)</span></p>' : '';
  if (!v.length) return ceka || zadat ? '<div class="ig-navrhy ig-navrhy--prazdne">' + ceka + (zadat ? '<div class="ig-navrhy__akce">' + zadat + '</div>' : '') + '</div>' : '';
  const i = Math.min(Math.max(0, Number(o.volba) || 0), v.length - 1);
  return '<div class="ig-navrhy">' +
    '<div class="ig-navrhy__hlava"><span class="ig-navrhy__nadpis">' + IKONY.claude + (v.length > 1 ? 'Návrhy od Clauda' : 'Návrh od Clauda') + '</span>' +
      (v.length > 1 ? segment(v.map((_, j) => [String(j), 'Návrh ' + (j + 1)]), String(i), o.atribut + '-volba', 'Návrhy popisku') : '') + '</div>' +
    '<div class="ig-navrhy__text">' + esc(v[i]) + '</div>' + ceka +
    '<div class="ig-navrhy__akce"><button type="button" class="btn btn--cerne btn--sm" ' + o.atribut + '-pouzit="' + id + '">' + IKONY.fajfka +
      '<span>Použít ' + (v.length > 1 ? 'návrh ' + (i + 1) : 'návrh') + '</span></button>' + zadat + '</div></div>';
}
