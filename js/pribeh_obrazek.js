// Příběh z fotky z telefonu – rozvržení fotky do příběhu 1080 × 1920 (čisté funkce bez DOM; test testy/test_pribeh_obrazek.mjs).
// Fotka s poměrem 9:16 (do 3 %) vyplní celé plátno; jiná (na šířku, 3:4, čtverec) se vejde celá doprostřed a pod ní je
// stejná fotka zvětšená přes celé plátno a rozmazaná (kreslí js/pribehy.js – rozmazání zmenšením, funguje i ve starším Safari).

export const SIRKA = 1080;
export const VYSKA = 1920;
export const TOLERANCE = 0.03; // tolik se poměr fotky smí lišit od 9:16, aby ji šlo jen mírně oříznout

/** Obdélník, kterým fotka w × h zakryje celé plátno (přesahy se oříznou), nebo se do něj celá vejde. */
function obdelnik(w, h, zakryt) {
  const k = zakryt ? Math.max(SIRKA / w, VYSKA / h) : Math.min(SIRKA / w, VYSKA / h);
  const dw = Math.round(w * k), dh = Math.round(h * k);
  return { x: Math.round((SIRKA - dw) / 2), y: Math.round((VYSKA - dh) / 2), w: dw, h: dh };
}

/**
 * Rozvržení fotky w × h (body): { plne, pozadi, popredi } – plne = fotka má (skoro) 9:16 a vyplní celé plátno;
 * pozadi = obdélník zvětšené fotky přes celé plátno (rozmaže se), popredi = kam nakreslit fotku. Neplatné rozměry → null.
 */
export function rozvrzeni(w, h) {
  if (!(w > 0 && h > 0)) return null;
  const plne = Math.abs(w / h - SIRKA / VYSKA) / (SIRKA / VYSKA) <= TOLERANCE;
  return { plne, pozadi: obdelnik(w, h, true), popredi: obdelnik(w, h, plne) };
}

/** Rozměry malého plátna pro rozmazané pozadí (zmenšení a zpětné zvětšení = rozmazání): poměr 9:16, šířka sirka. */
export function malePlatno(sirka) {
  const s = Math.max(4, Math.round(sirka || 27));
  return { w: s, h: Math.round(s * VYSKA / SIRKA) };
}
