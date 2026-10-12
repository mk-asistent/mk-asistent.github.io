// Knihovna – čisté funkce (bez DOM a bez motoru): záložky, filtry podle mého stavu, hledání, okamžitá změna stavu,
// související položky, odkazy a náhled z Wikipedie u čekajícího požadavku. Používá je stránka (js/knihovna.js), Hledat
// (js/hledat.js – načte se při startu, proto je tenhle soubor malý a zvlášť) a test testy/test_knihovna.mjs.
// Data jsou odpověď akce knihovna z motoru: { karty, reserse (index), moje: { id: { stav, hodnoceni, poznamka } },
// pozadavky: [{ id, druh, text, kdy }], chybne, ted } – formát karet a rešerší: skill osobni-knihovna.

export const ZALOZKY = [['filmy', 'Filmy'], ['knihy', 'Knihy'], ['reserse', 'Rešerše']];
export const DRUHY = { film: 'film', serial: 'seriál', kniha: 'kniha', reserse: 'rešerše' };
export const STAVY = ['chci', 'rozpracovane', 'hotovo'];
const NAZVY_STAVU = {
  filmy: { chci: 'Chci vidět', rozpracovane: 'Rozkoukané', hotovo: 'Viděno' },
  knihy: { chci: 'Chci číst', rozpracovane: 'Čtu', hotovo: 'Přečteno' },
  reserse: { chci: 'Chci číst', rozpracovane: 'Čtu', hotovo: 'Přečteno' }
};
const NOVA_DNI = 3; // karta od Clauda je „nová“ ještě 3 dny

/** Záložka podle druhu: film a seriál → filmy, kniha → knihy, rešerše → reserse. */
export function zalozkaDruhu(druh) { return druh === 'kniha' ? 'knihy' : druh === 'reserse' ? 'reserse' : 'filmy'; }

/** [[stav, název]] pro druh / záložku („Chci vidět“ u filmu, „Chci číst“ u knihy). */
export function nazvyStavu(druhNeboZalozka) {
  const z = NAZVY_STAVU[druhNeboZalozka] ? druhNeboZalozka : zalozkaDruhu(druhNeboZalozka);
  return STAVY.map((s) => [s, NAZVY_STAVU[z][s]]);
}
export function nazevStavu(druh, stav) { const z = NAZVY_STAVU[druh] ? druh : zalozkaDruhu(druh); return (NAZVY_STAVU[z] || {})[stav] || ''; }

export const bezDiakritiky = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Slova dotazu bez diakritiky (hledá se, až když jsou všechna). */
export const slova = (dotaz) => bezDiakritiky(dotaz).split(/\s+/).filter(Boolean);

/** Text karty nebo rešerše, ve kterém se hledá: názvy, tvůrci, herci a lidé za kamerou, žánry, štítky, krátce. */
export function textPolozky(x) {
  if (!x) return '';
  const tvurci = (x.tvurci || []).map((t) => (t.jmena || []).join(' ')).join(' ');
  const lide = (x.herci || []).concat(x.lide || []).map((h) => h && h.jmeno).join(' ');
  return bezDiakritiky([x.nazev, x.original, x.roky || x.rok, tvurci, lide, (x.zanry || []).join(' '), (x.stitky || []).join(' '), x.kratce,
    x.serie && x.serie.nazev].filter(Boolean).join(' '));
}
export function odpovida(x, s) { if (!s || !s.length) return true; const t = textPolozky(x); return s.every((w) => t.indexOf(w) >= 0); }

export const karty = (data) => (data && Array.isArray(data.karty) ? data.karty : []);
export const reserse = (data) => (data && Array.isArray(data.reserse) ? data.reserse : []);
export const pozadavky = (data) => (data && Array.isArray(data.pozadavky) ? data.pozadavky : []);
/** Můj stav u položky ({} když žádný). */
export const moje = (data, id) => (data && data.moje && data.moje[id]) || {};

/** Karty záložky (filmy = filmy i seriály), filtr podle mého stavu ('vse', 'chci', 'rozpracovane', 'hotovo', 'bez') a dotaz. */
export function kartyZalozky(data, zalozka, filtr, dotaz) {
  const s = slova(dotaz);
  return karty(data).filter((x) => zalozkaDruhu(x.druh) === zalozka && odpovida(x, s) && filtrSedi(moje(data, x.id).stav, filtr));
}
function filtrSedi(stav, filtr) { return !filtr || filtr === 'vse' ? true : filtr === 'bez' ? !stav : stav === filtr; }

/** Rešerše (index) s dotazem a filtrem (vše / přečteno / nepřečteno). */
export function reserseZalozky(data, dotaz, filtr) {
  const s = slova(dotaz);
  return reserse(data).filter((r) => odpovida(r, s) && (filtr === 'hotovo' ? moje(data, r.id).stav === 'hotovo' : filtr === 'bez' ? moje(data, r.id).stav !== 'hotovo' : true));
}

/** Čekající požadavky záložky, nejnovější nahoře (s dotazem jen ty, které mu odpovídají). */
export function cekajici(data, zalozka, dotaz) {
  const s = slova(dotaz);
  return pozadavky(data).filter((p) => zalozkaDruhu(p.druh) === zalozka && s.every((w) => bezDiakritiky(p.text).indexOf(w) >= 0))
    .sort((a, b) => String(b.kdy).localeCompare(String(a.kdy)));
}

/** Počty do záložek a filtrů: { filmy, knihy, reserse, cekaji, stavy: { filmy: { vse, chci, rozpracovane, hotovo }, … } }. */
export function pocty(data) {
  const p = { filmy: 0, knihy: 0, reserse: reserse(data).length, cekaji: pozadavky(data).length, stavy: {} };
  ZALOZKY.forEach((z) => { p.stavy[z[0]] = { vse: 0, chci: 0, rozpracovane: 0, hotovo: 0 }; });
  karty(data).forEach((x) => {
    const z = zalozkaDruhu(x.druh);
    p[z]++;
    p.stavy[z].vse++;
    const st = moje(data, x.id).stav;
    if (st) p.stavy[z][st]++;
  });
  reserse(data).forEach((r) => { p.stavy.reserse.vse++; const st = moje(data, r.id).stav; if (st) p.stavy.reserse[st]++; });
  return p;
}

/** Okamžitá změna mého stavu v datech (do odpovědi motoru): zmena = { stav?, hodnoceni?, poznamka? }, prázdné = zrušit. */
export function sMoji(data, id, zmena) {
  const d = Object.assign({}, data, { moje: Object.assign({}, data && data.moje) });
  const x = Object.assign({}, d.moje[id]);
  if (zmena.stav !== undefined) x.stav = zmena.stav || undefined;
  if (zmena.hodnoceni !== undefined) x.hodnoceni = zmena.hodnoceni || undefined;
  if (zmena.poznamka !== undefined) x.poznamka = String(zmena.poznamka || '').trim() || undefined;
  Object.keys(x).forEach((k) => { if (x[k] === undefined) delete x[k]; });
  if (x.stav || x.hodnoceni || x.poznamka) d.moje[id] = x; else delete d.moje[id];
  return d;
}

/** Karta nebo rešerše podle id: { typ: 'karta' | 'reserse', x } nebo null. */
export function najdi(data, id) {
  const k = karty(data).find((x) => x.id === id);
  if (k) return { typ: 'karta', x: k };
  const r = reserse(data).find((x) => x.id === id);
  return r ? { typ: 'reserse', x: r } : null;
}

/** Související položky: [{ id, proc, nazev, typ, druh, existuje }] – co v knihovně není, je jen text. */
export function souvisejici(data, x) {
  return ((x && x.souvisi) || []).map((s) => {
    const n = najdi(data, s.id);
    return { id: s.id, proc: s.proc || '', existuje: !!n, typ: n ? n.typ : '', druh: n ? (n.typ === 'reserse' ? 'reserse' : n.x.druh) : '',
      nazev: n ? n.x.nazev : nazevZId(s.id) };
  });
}
/** „film-pan-prstenu“ → „pan prstenu“ (jen když položka v knihovně ještě není). */
function nazevZId(id) { return String(id || '').replace(/^(film|serial|kniha|reserse)-/, '').replace(/-/g, ' '); }

/** Jen adresy http(s) bez mezer a uvozovek – jinak '' (odkazy z karet jdou do href a src). */
export function bezpecnaUrl(u) { const s = String(u == null ? '' : u).trim(); return /^https?:\/\/[^\s"'<>\\]+$/i.test(s) ? s : ''; }

/** „2001–2003“ nebo „2023“ (nebo ''). */
export function rokKarty(x) { return (x && (x.roky || (x.rok != null ? String(x.rok) : ''))) || ''; }

/** Řádek pod názvem: „2023 · film · 180 min“, u knihy „2004 · kniha · 320 stran“. */
export function metaKarty(x) {
  if (!x) return '';
  const delka = x.druh === 'kniha' ? (x.stran ? x.stran + ' stran' : x.delka || '') : x.delka || '';
  return [rokKarty(x), DRUHY[x.druh] || '', delka].filter(Boolean).join(' · ');
}

/** „178 min“, „2 h 15 min“ → minuty (0 = nevím). */
export function minuty(s) {
  const t = String(s || '');
  const h = /(\d+)\s*h\b/.exec(t), m = /(\d+)\s*min/.exec(t);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}
/** Součet délek dílů série v minutách – jen když ji znám u všech (aspoň dvou) dílů, jinak 0. */
export function celkemMinut(dily) {
  const m = (dily || []).map((d) => minuty(d && d.delka));
  return m.length > 1 && m.every((x) => x > 0) ? m.reduce((a, b) => a + b, 0) : 0;
}
/** Druh podle id („kniha-maly-princ“ → kniha); neznámý → film. */
export function druhZId(id) { const m = /^(film|serial|kniha|reserse)-/.exec(String(id || '')); return m ? m[1] : 'film'; }

/** První hodnocení na dlaždici („ČSFD 88 %“) – nebo ''. */
export function hodnoceniKratce(x) { const h = (x && x.hodnoceni && x.hodnoceni[0]) || null; return h ? h.zdroj + ' ' + h.hodnota : ''; }

/** Čas z ISO textu karty (pripraveno, kdy požadavku) → ms, nebo 0. */
export function cas(iso) { const t = Date.parse(String(iso || '')); return isNaN(t) ? 0 : t; }

/** Karta od Clauda je nová (posledních NOVA_DNI dní) – a ještě bez mého stavu. */
export function jeNova(data, x, ted) {
  const t = cas(x && x.pripraveno);
  return !!t && (ted || Date.now()) - t < NOVA_DNI * 864e5 && !moje(data, x.id).stav;
}

/** Iniciála na zástupnou plochu bez obrázku: první písmeno názvu bez členů („The Hobbit“ → H). */
export function iniciala(nazev) {
  const s = String(nazev || '?').replace(/^(the|a|an)\s+/i, '').trim();
  const m = /[\p{L}\p{N}]/u.exec(s);
  return m ? m[0].toUpperCase() : '?';
}

/** Odkaz ČSFD (film, seriál) nebo Databáze knih (kniha): z odkazů a hodnocení karty, jinak hledání podle názvu. */
export function odkazDatabaze(x) {
  if (!x) return { nazev: '', url: '' };
  const kniha = x.druh === 'kniha';
  const vzor = kniha ? /databazeknih\.cz/i : /csfd\.cz/i;
  const z = (x.odkazy || []).concat(x.hodnoceni || []).find((o) => o && vzor.test(o.url || ''));
  const url = z && bezpecnaUrl(z.url);
  if (url) return { nazev: kniha ? 'Databáze knih' : 'ČSFD', url };
  const q = encodeURIComponent(x.original && !kniha ? x.original : x.nazev);
  return kniha ? { nazev: 'Databáze knih', url: 'https://www.databazeknih.cz/search?q=' + q } : { nazev: 'ČSFD', url: 'https://www.csfd.cz/hledat/?q=' + q };
}

/** Hledání v celé aplikaci (js/hledat.js): [{ id, typ, nazev, pod }] – karty i rešerše, nejvýš max. */
export function hledej(data, dotaz, max) {
  const s = slova(dotaz);
  if (!s.length || !data) return [];
  const k = karty(data).filter((x) => odpovida(x, s)).map((x) => ({ id: x.id, typ: 'karta', nazev: x.nazev, pod: metaKarty(x) }));
  const r = reserse(data).filter((x) => odpovida(x, s)).map((x) => ({ id: x.id, typ: 'reserse', nazev: x.nazev, pod: 'rešerše' + (x.kratce ? ' · ' + x.kratce : '') }));
  return k.concat(r).slice(0, max || 5);
}

/** Je už v knihovně karta stejného jména (název nebo původní název, bez diakritiky) ve stejné záložce? → karta / null. */
export function uzJe(data, druh, text) {
  const t = bezDiakritiky(String(text || '').split(/\s[–-]\s|,|\(/)[0]).replace(/\s+/g, ' ').trim();
  if (t.length < 2) return null;
  const z = zalozkaDruhu(druh);
  if (z === 'reserse') return reserse(data).find((x) => bezDiakritiky(x.nazev) === t) || null;
  return karty(data).find((x) => zalozkaDruhu(x.druh) === z && [x.nazev, x.original].some((n) => n && bezDiakritiky(n) === t)) || null;
}

// ---------------------------------------------------------------- podstránka karty a rešerše (Michal 12. 10.: „klasická stránka,
// ne jen pás vpravo … víc informací v několika sekcích“). Adresa #knihovna/<id> – sdílený odkaz, Zpět prohlížeče i gesto.

const ID_POLOZKY = /^[a-z0-9][a-z0-9-]{0,119}$/;
/** „#knihovna/film-oppenheimer“ → „film-oppenheimer“; jiná adresa (nebo neplatné id) → ''. */
export function idZAdresy(hash) {
  const m = /^#knihovna\/([^/?#]+)$/.exec(String(hash || ''));
  let id = '';
  try { id = m ? decodeURIComponent(m[1]) : ''; } catch (e) { id = ''; }
  return ID_POLOZKY.test(id) ? id : '';
}
/** Adresa podstránky karty nebo rešerše. */
export function adresaPolozky(id) { return '#knihovna/' + id; }

/** Fotka člověka jen z Wikimedia Commons (upload.wikimedia.org, volné licence – skill osobni-knihovna), jinak ''. */
export function fotoUrl(u) { const s = bezpecnaUrl(u); return /^https:\/\/upload\.wikimedia\.org\//i.test(s) ? s : ''; }

/** Kotva sekce na stránce: „kn-s-<id>“ (id jen a–z, 0–9, pomlčky), jinak podle pořadí. */
export function kotvaSekce(s, i) { const id = String((s && s.id) || '').toLowerCase(); return 'kn-s-' + (/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) ? id : String(i + 1)); }

const plne = (a) => Array.isArray(a) && a.length > 0;

/** Krátký název oddílu do pásu: „Jak vznikal: IMAX, 57 dní…“ → „Jak vznikal“; dlouhý zkrátit na slovo a „…“ (celý nadpis je u oddílu). */
export function kratkyNazev(t, max) {
  const m = max || 26;
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  const pred = s.split(/\s*:\s/)[0];
  if (pred.length >= 3 && pred.length < s.length) s = pred;
  if (s.length <= m) return s;
  const rez = s.slice(0, m - 1);
  const mezera = rez.lastIndexOf(' ');
  return (mezera > m / 2 ? rez.slice(0, mezera) : rez).replace(/[\s,;:–-]+$/, '') + '…';
}
const textSekce = (s) => s && (s.nadpis || plne(s.odstavce) || plne(s.body));

/**
 * Oddíly podstránky karty v pořadí, jen ty, které karta má: [[kotva, název do pásu]]. Pás odkazů nahoře je skládá stejně jako
 * stránku (Přehled · Herci · Tvůrci · Postavy · Fakta · <nadpisy sekcí> · Série · Zajímavosti · Kde sledovat · Podobné).
 */
export function oddilyKarty(x) {
  if (!x) return [];
  const kniha = x.druh === 'kniha';
  const o = [];
  if (x.obsah || x.proc || plne(x.citaty)) o.push(['kn-o-prehled', 'Přehled']);
  if (plne(x.herci)) o.push(['kn-o-herci', 'Herci']);
  if (plne(x.lide) || plne(tvurciBezHercu(x))) o.push(['kn-o-tvurci', kniha ? 'Autor a tvůrci' : 'Tvůrci']);
  if (plne(x.postavy)) o.push(['kn-o-postavy', 'Postavy']);
  if (plne(x.fakta)) o.push(['kn-o-fakta', 'Fakta']);
  (x.sekce || []).forEach((s, i) => { if (textSekce(s)) o.push([kotvaSekce(s, i), kratkyNazev(s.nadpis) || 'Sekce ' + (i + 1)]); });
  if (x.serie && (plne(x.serie.dily) || x.serie.poradi)) o.push(['kn-o-serie', 'Série']);
  if (plne(x.zajimavosti) || x.skutecnost || plne(x.oceneni)) o.push(['kn-o-zajimavosti', 'Zajímavosti']);
  if (x.kdeSledovat && x.kdeSledovat.text) o.push(['kn-o-kde', kniha ? 'Kde sehnat' : 'Kde sledovat']);
  if (plne(x.podobne) || plne(x.souvisi)) o.push(['kn-o-podobne', plne(x.podobne) ? 'Podobné' : 'Související']);
  return o;
}

/** Oddíly čtečky rešerše: [[kotva, název]] – sekce, časová osa, pojmy, další otázky, zdroje. */
export function oddilyReserse(r) {
  if (!r) return [];
  const o = [];
  if (r.kratce || plne(r.cisla)) o.push(['kn-o-kratce', 'Krátce']);
  (r.sekce || []).forEach((s, i) => { if (textSekce(s)) o.push([kotvaSekce(s, i), kratkyNazev(s.nadpis) || 'Sekce ' + (i + 1)]); });
  if (plne(r.casovaOsa)) o.push(['kn-o-osa', 'Časová osa']);
  if (plne(r.pojmy)) o.push(['kn-o-pojmy', 'Pojmy']);
  if (plne(r.dalsiOtazky)) o.push(['kn-o-otazky', 'Další otázky']);
  if (plne(r.zdroje) || plne(r.souvisi)) o.push(['kn-o-zdroje', 'Zdroje']);
  return o;
}

/** Tvůrci bez role „hrají“, když má karta herce zvlášť (jinak by se jména opakovala). */
export function tvurciBezHercu(x) {
  const t = (x && x.tvurci) || [];
  return plne(x && x.herci) ? t.filter((r) => !/^(hraj|herc|obsazen)/i.test(String(r.role || ''))) : t;
}

/** Hlavní tvůrce do hlavičky: „Režie Christopher Nolan“, u knihy „Autor …“ (první role, nejvýš 2 jména). */
export function hlavniTvurce(x) {
  const t = tvurciBezHercu(x)[0];
  if (!t || !plne(t.jmena)) return '';
  const role = String(t.role || '');
  return (role.charAt(0).toUpperCase() + role.slice(1)) + ' ' + t.jmena.slice(0, 2).join(', ') + (t.jmena.length > 2 ? ' a další' : '');
}

/**
 * Podobné tipy s vazbou na knihovnu: [{ nazev, rok, proc, druh, id (karta, která v knihovně je), ceka (čekající požadavek) }].
 * Karta se najde podle id, jinak podle názvu ve stejné záložce; jinak čekající požadavek se stejným textem; jinak nic → tlačítko
 * „Přidat do knihovny“ (druh podle id tipu, jinak podle karty, u které je).
 */
export function podobne(data, x) {
  return ((x && x.podobne) || []).filter((p) => p && p.nazev).map((p) => {
    const druh = p.id ? druhZId(p.id) : x.druh === 'kniha' ? 'kniha' : x.druh === 'serial' ? 'serial' : 'film';
    const n = p.id ? najdi(data, p.id) : null;
    const karta = n ? n.x : uzJe(data, druh, p.nazev);
    const t = bezDiakritiky(p.nazev).trim();
    const ceka = karta ? null : pozadavky(data).find((q) => zalozkaDruhu(q.druh) === zalozkaDruhu(druh) && bezDiakritiky(q.text).trim() === t) || null;
    return { nazev: p.nazev, rok: p.rok || null, proc: p.proc || '', druh, id: karta ? karta.id : '', obrazek: karta && karta.obrazek ? karta.obrazek.url || '' : '',
      ceka: ceka ? ceka.id : '' };
  });
}

// ---------------------------------------------------------------- náhled z Wikipedie u čekajícího požadavku
// REST API Wikipedie (CORS, bez klíče): https://cs.wikipedia.org/api/rest_v1/page/summary/<název> – jen shrnutí,
// náhled obrázku (upload.wikimedia.org) a odkaz. Česky, pak anglicky; u filmu nejdřív „Název (film)“ atd.

const PRIPONY = {
  cs: { film: [' (film)', ''], serial: [' (seriál)', ''], kniha: [' (kniha)', ' (román)', ''], reserse: [''] },
  en: { film: [' (film)', ''], serial: [' (TV series)', ''], kniha: [' (novel)', ''], reserse: [''] }
};

/** Adresy shrnutí k vyzkoušení (v pořadí): [url]. Otázky a dlouhé texty nic (rešerše „Proč…?“ na Wikipedii nenajdu). */
export function wikiAdresy(druh, text) {
  const t = String(text || '').split(/\s[–-]\s|,|\(/)[0].replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 80 || /\?/.test(text || '')) return [];
  const adresy = [];
  ['cs', 'en'].forEach((jazyk) => (PRIPONY[jazyk][druh] || ['']).forEach((p) => {
    adresy.push('https://' + jazyk + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent((t + p).replace(/ /g, '_')));
  }));
  return adresy;
}

/** Odpověď shrnutí Wikipedie → { nazev, popis, text, obrazek, odkaz } nebo null (rozcestník, prázdné, cizí adresy pryč). */
export function zWiki(j) {
  if (!j || typeof j !== 'object' || j.type !== 'standard' || !j.extract) return null;
  const obr = j.thumbnail && /^https:\/\/upload\.wikimedia\.org\//.test(j.thumbnail.source || '') ? j.thumbnail.source : '';
  const odkaz = j.content_urls && j.content_urls.desktop && /^https:\/\/[a-z-]+\.wikipedia\.org\//.test(j.content_urls.desktop.page || '') ? j.content_urls.desktop.page : '';
  const text = String(j.extract).replace(/\s+/g, ' ').trim();
  return { nazev: String(j.title || '').slice(0, 200), popis: String(j.description || '').slice(0, 200), text: text.length > 600 ? text.slice(0, 599).trim() + '…' : text,
    obrazek: obr, odkaz };
}
