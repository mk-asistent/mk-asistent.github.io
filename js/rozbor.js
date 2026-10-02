// Rozbor rozepsané poznámky (psané i diktované česky): je to událost do kalendáře, nebo e-mail? Kdy, s kým, komu.
// Jen návrh pro tlačítko pod polem – rozhoduje Michal (formulář se otevře předvyplněný). Čisté funkce, bez DOM.
// Pozor: \b v JS regulárních výrazech nezná česká písmena – proto se většina testů dělá na textu bez diakritiky (bez()).

const DNY = { nedele: 0, nedeli: 0, pondeli: 1, utery: 2, streda: 3, stredu: 3, ctvrtek: 4, patek: 5, sobota: 6, sobotu: 6 };
const MESICE = ['ledn', 'unor', 'brez', 'dub', 'kvet', 'cervn', 'cerven', 'srp', 'zar', 'rij', 'listop', 'prosin'];
const CISLOVKY = { jedna: 1, jednu: 1, jedne: 1, dve: 2, dvou: 2, druhe: 2, tri: 3, treti: 3, ctyri: 4, ctvrte: 4, pet: 5, pate: 5,
  sest: 6, seste: 6, sedm: 7, sedme: 7, osm: 8, osme: 8, devet: 9, devate: 9, deset: 10, desate: 10,
  jedenact: 11, jedenacte: 11, dvanact: 12, dvanacte: 12 };
const CASTI_DNE = [['rano', 8, 0], ['dopoledne', 10, 0], ['poledne', 12, 0], ['odpoledne', 15, 0], ['vecer', 18, 0]];
const UDALOST = /\b(schuzk|sraz|porad|meeting|trenink|zapas|navstev|obed|vecere|dokto|zubar|kadern|servis|oslav|narozenin|koncert|kino|divadl|termin|zapis do kalendare|zapis si|naplanuj|domluv|pozvi|pozvat|pozvanku|pripomen|nezapomen)/;
const EMAIL = /\b(napis|posli|odepis|odpovez)\b[^.?!]{0,40}\b(e-?mail|mail|zpravu)\b|\b(e-?mail|mail)\s+(pro|pana|pani)\b|\b(napis|odepis|odpovez|posli)\s+(?:(?:panu|pani)\s+)?[a-z]{2,}(ovi|ce|ici|e)\b/;
const VELKE = 'A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ', MALE = 'a-záčďéěíňóřšťúůýž';
const JMENO = '[' + VELKE + '][' + MALE + ']+(?:\\s+[' + VELKE + '][' + MALE + ']+)?';
const NEJMENA = /^(Claude|Asistent|Pondělí|Úterý|Středa|Středu|Čtvrtek|Pátek|Sobota|Sobotu|Neděle|Neděli)$/i;

const bez = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function pulnoc(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function pridejDny(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }

/** Den z textu (ms půlnoci) nebo null. Rozumí: dnes, zítra, pozítří, za týden, za 3 dny, (příští) pondělí…neděle, 8. 10., 8. října (2026). */
function den(text, ted) {
  const t = bez(text);
  const dnes = pulnoc(ted);
  if (/\bpozitri\b/.test(t)) return pridejDny(dnes, 2);
  if (/\bzitra\b/.test(t)) return pridejDny(dnes, 1);
  if (/\bza\s+tyden\b/.test(t)) return pridejDny(dnes, 7);
  let m = /\bza\s+(\d{1,2}|dva|tri|ctyri|pet|sest)\s+(dny|dni)\b/.exec(t);
  if (m) return pridejDny(dnes, /^\d/.test(m[1]) ? +m[1] : { dva: 2, tri: 3, ctyri: 4, pet: 5, sest: 6 }[m[1]]);
  m = /\b(\d{1,2})\.\s*(\d{1,2})\.(?:\s*(\d{4}))?/.exec(t);
  if (m && (+m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12)) m = null;
  if (m) {
    const d = new Date(+(m[3] || new Date(ted).getFullYear()), +m[2] - 1, +m[1]).getTime();
    return !m[3] && d < dnes ? new Date(new Date(d).getFullYear() + 1, +m[2] - 1, +m[1]).getTime() : d;
  }
  m = /\b(\d{1,2})\.\s*([a-z]+)/.exec(t);
  if (m) {
    const i = MESICE.findIndex((x) => m[2].indexOf(x) === 0);
    if (i >= 0) {
      const d = new Date(new Date(ted).getFullYear(), i, +m[1]).getTime();
      return d < dnes ? new Date(new Date(d).getFullYear() + 1, i, +m[1]).getTime() : d;
    }
  }
  m = /\b(nedele|nedeli|pondeli|utery|streda|stredu|ctvrtek|patek|sobota|sobotu)\b/.exec(t);
  if (m) {
    let o = (DNY[m[1]] - new Date(dnes).getDay() + 7) % 7;
    if (o === 0) o = 7; // „v pátek“ řečeno v pátek = za týden (dnešek se říká „dnes“)
    return pridejDny(dnes, o);
  }
  if (/\bdnes\b|\bdneska\b/.test(t)) return dnes;
  return null;
}

/** Čas z textu → [hodiny, minuty, konec?] nebo null: v 10, v 10:30, v 10.30, ve dvě, v půl deváté, od 10 do 11, 10–11 h, ráno, večer. */
function cas(text) {
  const t = bez(text);
  const odpoledne = /\b(odpoledne|vecer)\b/.test(t);
  const rano = /\b(rano|dopoledne)\b/.test(t);
  // „ve dvě“ = 14:00, „v 8 večer“ = 20:00; ráno/dopoledne nechá hodinu, jak je
  const hodina = (h) => (h < 12 && odpoledne) || (h < 7 && !rano) ? h + 12 : h;
  let m = /\bod\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hod\w*)?\s+do\s+(\d{1,2})(?:[:.](\d{2}))?/.exec(t) || /\b(\d{1,2})(?:[:.](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:h|hod)/.exec(t);
  if (m && +m[1] < 24 && +m[3] < 24) {
    const od = hodina(+m[1]);
    let doH = hodina(+m[3]);
    if (doH < od && doH + 12 < 24) doH += 12;
    return [od, +(m[2] || 0), [doH, +(m[4] || 0)]];
  }
  const re = /\b(v|ve|na|kolem|o)\s+(\d{1,2})(?:[:.](\d{2}))?(?!\s*\.)(?:\s*(?:h|hod|hodin))?\b/g;
  while ((m = re.exec(t)) !== null) {
    const zbytek = t.slice(m.index + m[0].length);
    if (+m[2] > 23) continue;
    if (m[3] == null && /^\s*\.\s*\d/.test(zbytek)) continue; // „v 8. 10.“ je datum
    if (m[1] === 'na' && /^\s*(hodiny|hodinu|minut)/.test(zbytek)) continue; // „na 2 hodiny“ je délka
    return [hodina(+m[2]), +(m[3] || 0), null];
  }
  const re2 = /\b(?:v|ve|o)\s+(pul\s+)?([a-z]+)\b/g;
  while ((m = re2.exec(t)) !== null) {
    if (CISLOVKY[m[2]] == null) continue;
    let h = CISLOVKY[m[2]];
    let min = 0;
    if (m[1]) { h -= 1; min = 30; } // „v půl deváté“ = 8:30
    return [hodina(h), min, null];
  }
  for (const [slovo, h, min] of CASTI_DNE) if (new RegExp('\\b' + slovo + '\\b').test(t)) return [h, min, null];
  return null;
}

/** Délka v minutách: „na hodinu“, „na půl hodiny“, „na hodinu a půl“, „na 2 hodiny“, „na 90 minut“ – nebo null. */
function delka(text) {
  const t = bez(text);
  if (/\bna\s+pul\s+hodiny\b/.test(t)) return 30;
  if (/\bna\s+hodinu\s+a\s+pul\b/.test(t)) return 90;
  if (/\bna\s+hodinu\b/.test(t)) return 60;
  const m = /\bna\s+(\d{1,3}(?:[,.]\d)?|[a-z]+)\s+(hodin[a-z]*|minut[a-z]*)\b/.exec(t);
  if (!m) return null;
  const n = /^\d/.test(m[1]) ? parseFloat(m[1].replace(',', '.')) : CISLOVKY[m[1]];
  if (!n) return null;
  const min = Math.round(/^hodin/.test(m[2]) ? n * 60 : n);
  return min >= 5 && min <= 12 * 60 ? min : null;
}

/** Jména lidí: „s Petrem Novákem“, „pozvi Petra a Janu“, „napiš Petrovi“, „e-mail pro Janu“ – slova s velkým písmenem. */
function lide(text) {
  const vysledek = [];
  const pridej = (jmeno) => {
    jmeno = jmeno.trim();
    if (!NEJMENA.test(jmeno) && vysledek.indexOf(jmeno) < 0) vysledek.push(jmeno);
  };
  // klíčové slovo i na začátku věty (velké písmeno), jméno vždy s velkým písmenem; hranice přes mezeru
  const slova = ['s', 'se', 'pozvi', 'pozvat', 'napiš', 'napis', 'pošli', 'posli', 'pro', 'panu', 'paní', 'pani', 's kolegou', 'se šéfem',
    'e-mail', 'email', 'mail', 'zprávu', 'zpravu', 'odepiš', 'odepis', 'odpověz', 'odpovez'];
  const kw = slova.map((x) => '[' + x[0].toUpperCase() + x[0] + ']' + x.slice(1)).join('|');
  const re = new RegExp('(?:^|\\s)(?:' + kw + ')\\s+(' + JMENO + ')', 'g');
  const dalsi = new RegExp('^\\s*(?:,|\\s+a|\\s+i|\\s+nebo)\\s+(' + JMENO + ')'); // „Petra Nováka a Janu Malou“
  let m;
  while ((m = re.exec(text)) !== null) {
    pridej(m[1]);
    let zbytek = text.slice(m.index + m[0].length);
    let n;
    while ((n = dalsi.exec(zbytek)) !== null) { pridej(n[1]); zbytek = zbytek.slice(n[0].length); }
  }
  return vysledek;
}

/** Název události: první věta bez časových údajů a pokynů („zapiš“, „připomeň mi“…), s velkým písmenem.
 *  Hranice slov přes mezery: text se obalí mezerou a slova se mažou i s ní. „Pozvi Petra na poradu…“ → „Porada“. */
function nazevUdalosti(text) {
  // konec věty = !, ?, nový řádek, nebo tečka před velkým písmenem / na konci (tečky v datu „8. 10.“ větu nekončí)
  let veta = String(text || '').split(/[!?\n]|\.(?=\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]|\s*$)/)[0].trim();
  const pozvanka = /^(?:pozvi|pozvat|pozvěte)\s+.+?\s+na\s+([^\d\s].*)$/i.exec(veta);
  if (pozvanka) veta = pozvanka[1].replace(/^(\S{3,}?)eři(?=\s|$)/, '$1eře').replace(/^(\S{3,}?)u(?=\s|$)/, '$1a'); // „na schůzku“ → „schůzka“
  let s = ' ' + veta.replace(/,/g, ' , ') + ' ';
  const konec = '(?=\\s)';
  [
    '\\s(zapiš|zapis|naplánuj|naplanuj|přidej|pridej)(\\s+(mi|si))?(\\s+do\\s+kalendáře|\\s+do\\s+kalendare)?' + konec,
    '\\s(připomeň|pripomen|nezapomeň|nezapomen)(\\s+(mi|si))?' + konec,
    '\\s(dnes|dneska|zítra|zitra|pozítří|pozitri)' + konec,
    '\\sza\\s+(týden|tyden|\\d{1,2}\\s+(dny|dní|dni))' + konec,
    '\\s((příští|pristi|v|ve)\\s+)?(pondělí|úterý|středu|středa|čtvrtek|pátek|sobotu|sobota|neděli|neděle)' + konec,
    '\\sna\\s+(půl\\s+hodiny|hodinu(\\s+a\\s+půl)?|\\d{1,3}([,.]\\d)?\\s+(hodin[a-zy]*|minut[a-z]*)|(dvě|tři|čtyři|pět)\\s+hodin[a-zy]*)' + konec,
    '\\s(v|ve|od|do|na|kolem|o)\\s+\\d{1,2}([:.]\\d{2})?(\\s*(h|hod|hodin))?' + konec,
    '\\s\\d{1,2}\\.\\s*\\d{1,2}\\.(\\s*\\d{4})?' + konec,
    '\\s\\d{1,2}\\.\\s*(ledna|února|března|dubna|května|června|července|srpna|září|října|listopadu|prosince)(\\s*\\d{4})?' + konec,
    '\\s(ráno|dopoledne|v\\s+poledne|odpoledne|večer)' + konec,
    '\\s(v|ve|o)\\s+(půl\\s+)?(jednu|jedné|dvě|druhé|tři|třetí|čtyři|čtvrté|pět|páté|šest|šesté|sedm|sedmé|osm|osmé|devět|deváté|deset|desáté|jedenáct|jedenácté|dvanáct|dvanácté)' + konec
  ].forEach((vzor) => { s = s.replace(new RegExp(vzor, 'gi'), ' '); });
  s = s.replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').replace(/^[\s,–-]+|[\s,–-]+$/g, '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/**
 * Hlavní rozbor: { typ: 'udalost', nazev, popis, zacatek, konec, celodenni, lide, pozvat } | { typ: 'email', lide, predmet, text } | null
 * ted = „teď“ (ms) – kvůli testům.
 */
export function rozborTextu(text, ted) {
  const s = String(text || '').trim();
  if (s.length < 8 || s.length > 400) return null; // dlouhý text je poznámka pro Clauda, ne rychlý zápis
  ted = ted || Date.now();
  const t = bez(s);
  if (EMAIL.test(t)) {
    const telo = (/(?:^|[\s,])(že|ze)\s+(.+)$/i.exec(s) || [])[2] || '';
    return { typ: 'email', lide: lide(s), predmet: '', text: telo ? telo.charAt(0).toUpperCase() + telo.slice(1).replace(/[.!]?$/, '.') : '' };
  }
  const d = den(s, ted);
  const c = cas(s);
  if (!(UDALOST.test(t) && (d != null || c)) && !(d != null && c)) return null;
  const pozvat = /\bpozv/.test(t);
  // další věty („Schůzka zítra v 10. Vzít výkresy.“) = poznámka k události
  const konecVety = new RegExp('[!?\\n]|\\.(?=\\s+[' + VELKE + '])').exec(s);
  const popis = konecVety ? s.slice(konecVety.index + 1).trim() : '';
  const zaklad = { typ: 'udalost', nazev: nazevUdalosti(s), popis, lide: lide(s), pozvat };
  const zakladDne = d != null ? d : (c && pulnoc(ted) + (c[0] * 60 + c[1]) * 6e4 > ted ? pulnoc(ted) : pridejDny(pulnoc(ted), 1));
  if (!c) return Object.assign(zaklad, { zacatek: zakladDne, konec: pridejDny(zakladDne, 1), celodenni: true });
  const zacatek = zakladDne + (c[0] * 60 + c[1]) * 6e4;
  const konec = c[2] ? zakladDne + (c[2][0] * 60 + c[2][1]) * 6e4 : zacatek + (delka(s) || 60) * 6e4;
  return Object.assign(zaklad, { zacatek, konec: konec > zacatek ? konec : zacatek + 60 * 6e4, celodenni: false });
}

export const _test = { den, cas, delka, lide, nazevUdalosti };
