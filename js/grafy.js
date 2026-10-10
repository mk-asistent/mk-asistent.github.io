// Grafy ve stylu Fixtrack: půlkruhový ukazatel z čárek (schránka) a týden ve sloupcích (kalendář). Bublina s hodnotou
// u grafů (Zdraví, Auto, Pití a jídlo) je od 10. 10. společná s vyjetými kartami v js/bubliny.js – tady se dál vydává,
// ať moduly grafů nemusí nic měnit.

import { esc } from './pomocne.js';

export { bublina, grafAtr, ukazBublinu, skryjBublinu } from './bubliny.js';

/**
 * Půlkruh z čárek obarvených podle podílu skupin; uprostřed velké číslo.
 * segmenty = [[počet, barva CSS], …]
 */
export function pulkruh(segmenty, cislo, popisek) {
  const CAREK = 34, cx = 110, cy = 104, r1 = 72, r2 = 96;
  const celkem = segmenty.reduce((a, s) => a + s[0], 0);
  // hranice skupin na půlkruhu (podíl 0–1)
  const hranice = [];
  let soucet = 0;
  segmenty.forEach((s) => { soucet += s[0]; hranice.push(celkem ? soucet / celkem : 0); });
  let cary = '';
  for (let i = 0; i < CAREK; i++) {
    const podil = (i + 0.5) / CAREK;
    let barva = 'var(--sand-2)';
    if (celkem) {
      const j = hranice.findIndex((h) => podil <= h);
      barva = segmenty[j < 0 ? segmenty.length - 1 : j][1];
    }
    const uhel = Math.PI - podil * Math.PI;
    const x1 = (cx + r1 * Math.cos(uhel)).toFixed(1), y1 = (cy - r1 * Math.sin(uhel)).toFixed(1);
    const x2 = (cx + r2 * Math.cos(uhel)).toFixed(1), y2 = (cy - r2 * Math.sin(uhel)).toFixed(1);
    cary += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="stroke:' + barva + '"/>';
  }
  return '<div class="ukazatel"><svg viewBox="0 0 220 112" aria-hidden="true"><g stroke-width="5.5" stroke-linecap="round">' + cary + '</g></svg>' +
    '<div class="ukazatel__cislo"><b>' + esc(cislo) + '</b><small>' + esc(popisek) + '</small></div></div>';
}

/**
 * Týden ve sloupcích: dny = [{ t, pocet, dnes, popisek, nazev }]. Dnešek tmavě zelený, nejrušnější den korálový.
 * Klepnutí na sloupec otevře den v kalendáři (data-skoc-den).
 */
export function tydenGraf(dny) {
  const max = Math.max(1, ...dny.map((d) => d.pocet));
  const nejvic = dny.reduce((a, d) => (d.pocet > a.pocet ? d : a), dny[0]);
  return '<div class="tyden-graf">' + dny.map((d) => {
    const tridy = ['sloupec'];
    if (d.pocet) tridy.push('plny');
    if (d.dnes) tridy.push('dnes');
    else if (d === nejvic && d.pocet > 1) tridy.push('nejvic');
    const vyska = d.pocet ? Math.round(26 + (d.pocet / max) * 58) : 18;
    return '<button type="button" data-skoc-den="' + d.t + '" aria-label="' + esc(d.nazev + ': ' + d.pocet) + '">' +
      '<span class="' + tridy.join(' ') + '" style="height:' + vyska + 'px">' + (d.pocet || '') + '</span>' +
      '<small>' + esc(d.popisek) + '</small></button>';
  }).join('') + '</div>';
}
