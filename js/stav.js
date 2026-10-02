// Společný stav aplikace, oznámení o změně a přechod mezi sekcemi (překreslení řídí app.js).

import { pulnoc, uloziste } from './pomocne.js';

const FILTRY_POSTY = ['vse', 'neprectene', 'hori', 'ceka', 'otazka', 'cekas', 'info'];
const ze = (hodnota, povolene, vychozi) => (povolene.indexOf(hodnota) >= 0 ? hodnota : vychozi);

export const stav = {
  pohled: uloziste.cti('asistent.pohled') || 'dnes',
  info: null,               // z motoru: verze, účet, nastavení pošty, kalendáře
  schranka: null,
  posta: null,
  chyby: {},                // klíč → ChybaApi (schranka, posta, info)
  nacita: {},               // klíč → true
  naposledy: 0,             // kdy se naposledy načítalo všechno
  otevrene: {},             // rozbalené položky schránky
  filtrSchranky: 'vse',
  // pošta
  filtrPosty: ze(uloziste.cti('asistent.filtrPosty'), FILTRY_POSTY, 'vse'),   // stav případu (Hoří, Čeká na tebe …)
  ucetPosty: ze(uloziste.cti('asistent.ucetPosty'), ['oba', 'osobni', 'pracovni'], 'oba'),
  vlakna: {},               // id vlákna → { data, nacita, chyba }
  otevreneVlakno: null,
  rozbaleneZpravy: {},
  obrazky: {},              // id zprávy → obrázky z webu povolené (jen do zavření aplikace)
  psani: null,              // rozepsaná zpráva (režim, vlákno, účet)
  pripominka: null,         // rozpracované „Připomenout“ (vlákno, termín)
  hledani: null,            // hledání v celé poště { dotaz, vlakna, nacita, chyba }
  // kalendář
  kal: {
    // výchozí: na telefonu měsíc s tečkami, na iPadu a PC týden („týden je to, co lidi opravdu čtou“)
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

/** Přechod do sekce (Dnes, Schránka, Pošta, Kalendář). */
export function prejdi(pohled) {
  if (stav.pohled !== pohled) {
    stav.pohled = pohled;
    uloziste.pis('asistent.pohled', pohled);
    zmeneno();
  }
  window.scrollTo(0, 0);
}
