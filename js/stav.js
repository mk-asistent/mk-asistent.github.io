// Společný stav aplikace, oznámení o změně a přechod mezi sekcemi (překreslení řídí app.js).

import { pulnoc, uloziste } from './pomocne.js';
import { jeDemo } from './api.js';

const FILTRY_POSTY = ['vse', 'neprectene', 'hori', 'ceka', 'otazka', 'cekas', 'info'];
const ze = (hodnota, povolene, vychozi) => (povolene.indexOf(hodnota) >= 0 ? hodnota : vychozi);

export const stav = {
  pohled: uloziste.cti('asistent.pohled') || 'dnes',
  info: null,               // z motoru: verze, účet, nastavení pošty, kalendáře
  schranka: null,
  posta: null,
  pocasi: null,             // přehled ČHMÚ z motoru (výstrahy, řeky, předpovědi)
  kontakty: null,           // komu jsem psal (našeptávač adres)
  zdravi: null,             // přehled WHOOP + Apple Zdraví z motoru
  fotbal: null,             // zápasy klubu (FOTBAL.json přes motor) + týmy v kalendáři
  reely: null,              // hotové reely z fotbalu (REELY/reely.json přes motor) + které jsou na Instagramu
  auto: null,               // náklady a tankování z tabulky Google auta (přes motor)
  plakaty: null,            // plakát na víkend: ruční úpravy kol, nastavení, popisky, obrázky a plán na Instagram (přes motor)
  stitkyGmailu: null,       // štítky Gmailu [{ nazev, neprectenych }]
  stitekPosty: '',          // vybraný štítek ('' = Doručená pošta)
  postaStitku: {},          // název štítku → { vlakna, nacita, chyba, kdy }
  kategoriePosty: ze(uloziste.cti('asistent.kategoriePosty'), ['primarni', 'aktualizace', 'promo', 'socialni', 'fora'], 'primarni'), // záložka jako v Gmailu
  postaKategorie: {},       // promo | socialni | fora → { vlakna, nacita, chyba, kdy }
  presun: null,             // rozpracované „Přesunout do skupiny“ { id, nechat }
  chyby: {},                // klíč → ChybaApi (schranka, posta, info)
  nacita: {},               // klíč → true
  naposledy: 0,             // kdy se naposledy načítalo všechno
  otevrene: {},             // rozbalené položky schránky
  filtrSchranky: 'vse',
  temaSchranky: '',         // filtr podle tématu ('' = všechna)
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
    druh: uloziste.cti('asistent.kal.druh') || '',   // filtr druhu kalendářů ('' = vše)
    mesice: {},             // 'RRRR-MM' → { udalosti, kdy, zUloziste }
    nacita: {},
    chyby: {}
  }
};

/** Háčky mezi moduly bez kruhových importů (např. Zdraví přidá čísla z WHOOP do detailu zápasu v kalendáři). */
export const hooky = {};

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

/**
 * Umí připojený motor tuhle akci? Nový motor posílá v info seznam akcí; starý (bez seznamu) nové věci neumí –
 * aplikace je pak skryje a poradí nasadit novou verzi. Bez načteného info zatím „ne“ (info přijde a překreslí).
 */
export function umiMotor(akce) {
  if (jeDemo()) return true;
  return !!(stav.info && Array.isArray(stav.info.akce) && stav.info.akce.indexOf(akce) >= 0);
}

/** Motor je připojený, ale starší verze (bez seznamu akcí) → v Nastavení a na kartách nabídnout aktualizaci. */
export function staryMotor() {
  return !jeDemo() && !!stav.info && !Array.isArray(stav.info.akce);
}
