// Společný stav aplikace a oznámení o změně (překreslení řídí app.js).

import { pulnoc, uloziste } from './pomocne.js';

export const stav = {
  pohled: uloziste.cti('asistent.pohled') || 'dnes',
  info: null,               // z motoru: verze, účet, nastavení pošty, kalendáře
  schranka: null,
  posta: null,
  chyby: {},                // klíč → ChybaApi (schranka, posta, info)
  nacita: {},               // klíč → true
  naposledy: 0,             // kdy se naposledy načítalo všechno
  otevrene: {},             // rozbalené položky schránky
  // pošta
  filtrPosty: uloziste.cti('asistent.filtrPosty') || 'vse',
  vlakna: {},               // id vlákna → { data, nacita, chyba }
  otevreneVlakno: null,
  rozbaleneZpravy: {},
  obrazky: {},              // id zprávy → obrázky z webu povolené (jen do zavření aplikace)
  psani: null,              // rozepsaná zpráva (režim, vlákno, účet)
  // kalendář
  kal: {
    // výchozí: na telefonu měsíc s tečkami, na iPadu a PC týden („týden je to, co lidi opravdu čtou“ – web 2.0)
    pohled: uloziste.cti('asistent.kal.pohled') || (window.matchMedia('(min-width: 760px)').matches ? 'tyden' : 'mesic'),
    vybrany: pulnoc(Date.now()),
    mesice: {},             // 'RRRR-MM' → { udalosti, kdy, zUloziste }
    nacita: {},
    chyby: {}
  }
};

let posluchac = null;
export function priZmene(fn) { posluchac = fn; }
/** Data se změnila → překreslit. Víc změn v jednom kroku se sloučí do jednoho překreslení
 *  (mikroúloha – na rozdíl od requestAnimationFrame proběhne i v okně na pozadí). */
let naplanovano = false;
export function zmeneno() {
  if (naplanovano || !posluchac) return;
  naplanovano = true;
  queueMicrotask(() => { naplanovano = false; posluchac(); });
}
