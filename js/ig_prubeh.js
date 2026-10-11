// Instagram – průběh zveřejňování reelu nebo plakátu: kroky s časy, zaseknutí a co s ním (čisté funkce bez DOM a stavu;
// test testy/test_ig_prubeh.mjs). Data = položka plánu z motoru (REELY_PLAN / PLAKATY_PLAN; akce igStav, igKrok, reely,
// plakaty): { kdy, stav: ceka | nahrava | zverejnuji | hotovo | chyba, kroky: { priprava, zpracovani, zverejnuji, pribeh,
// hotovo, chyba } (ms), kontrola (ms poslední kontroly na Instagramu), stavIg / stavIgPribeh (IN_PROGRESS, FINISHED…),
// pokusy + vypadek (výpadek spojení), bezi (zámek běhu motoru do ms), kontejner, pribeh, pribehChyba, mediaPribeh, odkaz,
// chyba, zverejneno }. Starší položky (motor před 11. 10.) kroky nemají – ukáže se jen stav.

import { esc, dm, hhmm, DNY_KR, pulnoc } from './pomocne.js';
import { IKONY } from './ikony.js';

export const LIMITY = {
  zpracovaniVideo: 15 * 60e3,    // Instagram video obvykle zpracuje do 1–2 minut
  zpracovaniObrazek: 5 * 60e3,   // obrázek hned
  bezKontroly: 20 * 60e3,        // rozpracované, ale nikdo se na Instagram nepodíval (spouštěč neběží, aplikace zavřená)
  zpozdeni: 15 * 60e3,           // čas vypršel a zveřejnění nezačalo
  spoustec: 25 * 60e3,           // spouštěč běží každých 10 minut (Google ho občas o pár minut posune)
  brzy: 30 * 60e3,               // do tolika minut před časem čte aplikace stav přímo z motoru
  nedavno: 24 * 3600e3,          // hotové ještě ukazovat s kroky
  naPrehledu: 2 * 3600e3         // na Přehledu: naplánované do 2 h a hotové před méně než 2 h
};
export const POKUSU = 3;         // jako IG_POKUSU v motoru

export const rozpracovana = (z) => !!z && (z.stav === 'nahrava' || z.stav === 'zverejnuji');
export const ceka = (z) => !!z && z.stav === 'ceka';
/** Zveřejňuje se, nebo nastal čas (minuta rezerva jako v motoru). */
export const naRade = (z, ted) => rozpracovana(z) || (ceka(z) && (Number(z.kdy) || 0) <= ted + 60e3);
/** Kdy zveřejňování skončilo (hotovo nebo chyba), jinak 0. */
export const konec = (z) => (z && (z.stav === 'hotovo' || z.stav === 'chyba')
  ? Math.max(Number(z.zverejneno) || 0, Number((z.kroky || {}).hotovo) || 0, Number((z.kroky || {}).chyba) || 0) : 0);

/** Má se aplikace ptát motoru sama? 'krok' = běží nebo je na řadě (posunout igKrok), 'cteni' = vyjde do 30 min, '' = ne. */
export function sledovani(z, ted) {
  if (naRade(z, ted)) return 'krok';
  if (ceka(z) && (Number(z.kdy) || 0) <= ted + LIMITY.brzy) return 'cteni';
  return '';
}

/** Ukázat kroky: čeká na čas, běží, chyba, nebo vyšlo před méně než 24 h (u položek s kroky). */
export function ukazatKroky(z, ted) {
  if (!z) return false;
  if (ceka(z) || rozpracovana(z) || z.stav === 'chyba') return true;
  return z.stav === 'hotovo' && !!z.kroky && konec(z) > ted - LIMITY.nedavno;
}

/** Na Přehled: běží, chyba nebo zaseknuté (do 24 h), vyjde do 2 h, vyšlo před méně než 2 h. */
export function naPrehled(z, ted) {
  if (!z) return 0;
  if (z.stav === 'chyba') return konec(z) > ted - LIMITY.nedavno ? 4 : 0;
  if (rozpracovana(z)) return 3;
  if (ceka(z)) return (Number(z.kdy) || 0) <= ted + LIMITY.naPrehledu ? 2 : 0;
  if (z.stav === 'hotovo') return konec(z) > ted - LIMITY.naPrehledu ? 1 : 0;
  return 0;
}

/** „20:15“ dnes, jinak „po 12. 10. 20:15“. */
export function casKratce(t, ted) {
  return pulnoc(t) === pulnoc(ted) ? hhmm(t) : DNY_KR[new Date(t).getDay()] + ' ' + dm(t) + ' ' + hhmm(t);
}

/** „před chvílí“, „před 3 min“, „před 2 h 5 min“. */
export function predChvili(ms) {
  const m = Math.max(0, Math.round(ms / 60e3));
  if (m < 1) return 'před chvílí';
  if (m < 60) return 'před ' + m + ' min';
  const h = Math.floor(m / 60);
  return 'před ' + h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}
const minut = (ms) => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); };

/** Spouštěč motoru neběží (známý čas posledního běhu je starší než 25 min). spoustec 0 = nevíme (starší motor). */
export const spoustecNebezi = (spoustec, ted) => !!spoustec && ted - spoustec > LIMITY.spoustec;

/**
 * Zaseknutí (nebo null): { duvod, akce: 'znovu' | 'ted' | 'krok', tlacitko, chyba? }.
 * ted = čas motoru, spoustec = poslední běh spouštěče (0 = nevíme), video = reel (jinak obrázek).
 */
export function zasek(z, ted, spoustec, video) {
  if (!z) return null;
  if (z.stav === 'chyba') return { duvod: z.chyba || 'Neznámá chyba.', akce: 'znovu', tlacitko: 'Zkusit znovu', chyba: true };
  if (z.bezi && z.bezi > ted) return null; // motor na něm právě pracuje
  const k = z.kroky || {};
  const nebezi = spoustecNebezi(spoustec, ted) ? ' Spouštěč motoru naposledy běžel ' + predChvili(ted - spoustec) + '.' : '';
  if (rozpracovana(z) && z.stavIg === 'IN_PROGRESS' && k.zpracovani && ted - k.zpracovani > (video ? LIMITY.zpracovaniVideo : LIMITY.zpracovaniObrazek)) {
    return { duvod: 'Instagram ' + (video ? 'video' : 'obrázek') + ' zpracovává už ' + minut(ted - k.zpracovani) + ' (obvykle do 2 minut). ' +
      'Nahrát znovu pošle ' + (video ? 'video' : 'obrázek') + ' znovu – starý pokus nevyjde.', akce: 'znovu', tlacitko: 'Nahrát znovu' };
  }
  const posledni = Math.max(Number(z.kontrola) || 0, Number(k.priprava) || 0, Number(k.zpracovani) || 0, Number(k.zverejnuji) || 0);
  if (rozpracovana(z) && posledni && ted - posledni > LIMITY.bezKontroly) {
    return { duvod: 'Motor se na zveřejnění nepodíval ' + minut(ted - posledni) + '.' + nebezi, akce: 'krok', tlacitko: 'Pokračovat' };
  }
  if (ceka(z) && z.kdy && ted - z.kdy > LIMITY.zpozdeni) {
    return { duvod: 'Mělo vyjít ' + casKratce(z.kdy, ted) + ', ale zveřejnění nezačalo.' + nebezi, akce: 'ted', tlacitko: 'Zveřejnit teď' };
  }
  return null;
}

/** Krátký stav pro řádek pod kroky: zámek, výpadek, poslední kontrola. */
export function infoText(z, ted) {
  if (!z) return '';
  const casti = [];
  if (z.bezi && z.bezi > ted && rozpracovana(z)) casti.push('motor právě pracuje');
  else if (z.bezi && z.bezi > ted) casti.push('motor začíná');
  if (rozpracovana(z) && z.kontrola) casti.push('poslední kontrola na Instagramu ' + predChvili(ted - z.kontrola));
  if (rozpracovana(z) && z.vypadek) casti.push('výpadek spojení – zkouším znovu (pokus ' + Math.min(POKUSU, (Number(z.pokusy) || 0) + 1) + ' ze ' + POKUSU + ')');
  return casti.join(' · ');
}

/**
 * Kroky pro zobrazení: [{ klic, nazev, stav: 'hotovo' | 'ted' | 'ceka' | 'chyba' | 'varovani', cas, popis }].
 * o = { ted, video }.
 */
export function kroky(z, o) {
  const k = (z && z.kroky) || {};
  const ted = o.ted;
  const seznam = [
    { klic: 'plan', nazev: 'Naplánováno' },
    { klic: 'priprava', nazev: o.video ? 'Příprava videa' : 'Příprava obrázku' },
    { klic: 'zpracovani', nazev: 'Instagram zpracovává' },
    { klic: 'zverejnuji', nazev: 'Zveřejnění příspěvku' }
  ];
  if (z.pribeh) seznam.push({ klic: 'pribeh', nazev: 'Příběh' });
  seznam.push({ klic: 'hotovo', nazev: 'Na Instagramu' });
  const index = (klic) => seznam.findIndex((x) => x.klic === klic);
  // aktuální krok (u chyby ten, který se nepovedl = poslední začatý)
  let aktualni;
  if (z.stav === 'ceka') aktualni = 0;
  else if (z.stav === 'nahrava') aktualni = z.kontejner ? 2 : 1;
  else if (z.stav === 'zverejnuji') aktualni = z.pribeh && k.pribeh ? index('pribeh') : 3;
  else if (z.stav === 'hotovo') aktualni = seznam.length;
  else {
    aktualni = 1;
    ['priprava', 'zpracovani', 'zverejnuji', 'pribeh'].forEach((x) => { if (k[x] && index(x) > 0) aktualni = index(x); });
  }
  return seznam.map((x, i) => {
    const krok = Object.assign({ stav: i < aktualni ? 'hotovo' : i === aktualni ? (z.stav === 'chyba' ? 'chyba' : 'ted') : 'ceka', cas: 0, popis: '' }, x);
    if (x.klic === 'plan') {
      krok.cas = Number(z.kdy) || 0;
      if (krok.stav === 'ted') krok.popis = krok.cas > ted ? 'vyjde ' + casKratce(krok.cas, ted) : 'čas nastal – zveřejnění začíná';
    } else if (krok.stav !== 'ceka') krok.cas = Number(k[x.klic]) || 0;
    if (x.klic === 'hotovo' && krok.stav === 'hotovo') krok.cas = Number(k.hotovo) || Number(z.zverejneno) || 0;
    if (krok.stav === 'chyba') krok.popis = z.chyba || 'nepovedlo se';
    else if (krok.stav === 'ted') {
      if (x.klic === 'priprava') krok.popis = 'dočasný odkaz na Disku, odeslání na Instagram';
      if (x.klic === 'zpracovani') {
        krok.popis = z.stavIg === 'FINISHED' && z.pribeh && z.stavIgPribeh === 'IN_PROGRESS' ? 'příspěvek hotový, čeká se na příběh'
          : z.stavIg === 'FINISHED' ? 'hotovo – zveřejňuji' : 'stahuje a zpracovává ' + (o.video ? 'video' : 'obrázek');
      }
      if (x.klic === 'zverejnuji') krok.popis = 'zveřejňuji…';
      if (x.klic === 'pribeh') krok.popis = 'zveřejňuji příběh…';
    }
    // příběh: nevyšel (příspěvek platí) / vyšel
    if (x.klic === 'pribeh' && z.stav === 'hotovo') {
      if (z.pribehChyba) { krok.stav = 'varovani'; krok.popis = 'nevyšel: ' + z.pribehChyba; } else if (!z.mediaPribeh) krok.popis = '';
    }
    return krok;
  });
}

/** Krátký souhrn pro Přehled: aktuální krok (název + popis), pořadí z celku a stav. */
export function souhrn(z, o) {
  const kr = kroky(z, o);
  let i = kr.findIndex((x) => x.stav === 'ted' || x.stav === 'chyba');
  if (i < 0) i = kr.length - 1;
  return { krok: kr[i], poradi: i + 1, celkem: kr.length, kroky: kr };
}

/** Kroky jako svislý seznam (stepper ve stylu aplikace): kroužek s fajfkou / číslem / „!“, název, popis, čas vpravo. */
export function krokyHtml(z, o) {
  return '<ol class="ig-kroky">' + kroky(z, o).map((k, i) => '<li class="ig-krok ig-krok--' + k.stav + '"' + (k.stav === 'ted' ? ' aria-current="step"' : '') + '>' +
    '<span class="ig-krok__bod" aria-hidden="true">' + (k.stav === 'hotovo' ? IKONY.fajfka : k.stav === 'chyba' || k.stav === 'varovani' ? '!' : i + 1) + '</span>' +
    '<span class="ig-krok__text"><b>' + esc(k.nazev) + '</b>' + (k.popis ? '<small>' + esc(k.popis) + '</small>' : '') + '</span>' +
    (k.cas ? '<time class="ig-krok__cas cisla">' + esc(casKratce(k.cas, o.ted)) + '</time>' : '') + '</li>').join('') + '</ol>';
}

/** Malé tečky průběhu (Přehled): jedna na krok, barva podle stavu. */
export function teckyHtml(kr) {
  return '<span class="ig-tecky" aria-hidden="true">' + kr.map((k) => '<i class="ig-tecka ig-tecka--' + k.stav + '"></i>').join('') + '</span>';
}
