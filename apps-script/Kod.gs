/**
 * Asistent – motor (API) pro aplikaci Asistent v iPhonu a na PC.
 *
 * Aplikace je samostatná webová aplikace (PWA) na vlastní adrese. S motorem mluví přes POST:
 *   tělo (text/plain): {"klic": "…", "akce": "posta", …}
 *   odpověď (JSON):    {"ok": true, "data": …}  nebo  {"ok": false, "chyba": "…"}
 *
 * Nasazení: Webová aplikace · Spustit jako: Já · Kdo má přístup: Kdokoli.
 * Chrání to klíč API_KLIC (vlastnost skriptu, vytvoří ho funkce nastavApi). Klíč otevírá poštu,
 * zachází se s ním jako s heslem – nikdy do chatu, gitu ani na Disk. Nový klíč: funkce novyKlic.
 *
 * Data:
 *   Schránka  – Můj disk / CLAUDE_SCHRANKA / NOVE, CEKA, HOTOVO/RRRR-MM (soubory .md, skill asistent-schranka)
 *   Pošta     – Gmail: doručené za 30 dní (z 30–90 dní jen nevyřízené) bez Reklam/Sociálních sítí/Fór; čtení,
 *               odpověď, přeposlání, archiv, odložení („Připomenout“ – v den termínu se zpráva vrátí do Doručených);
 *               každá konverzace má stav (hoří, čeká na tebe, otázka, čekáš na ně, řeší se, informace) i s důvodem.
 *               Dva účty: osobní (Gmail) a pracovní (vlastnost PRACOVNI_ADRESA). Pracovní pošta se do Gmailu
 *               dostane přeposíláním kopií od poskytovatele; odpovídá se z ní přes „Odesílat poštu jako“ v Gmailu.
 *               Náhradní zdroj bez přeposílání: CLAUDE_SCHRANKA/POSTA_FIREMNI.json (souhrny, zapisuje skript na PC).
 *   Kalendář  – zobrazené kalendáře Google (vlastní i zápis: nová událost, úprava, smazání, opakování, připomenutí,
 *               import zápasů z rozpisu) + kalendáře z iPhonu (iCloud, soukromý odkaz webcal://…, jen čtení)
 *   Počasí    – ČHMÚ (otevřená data): výstrahy pro ORP, vodní stav řeky, krátká předpověď kraje; místo ve vlastnosti POCASI
 *   Fotbal    – zápasy klubu z CLAUDE_SCHRANKA/FOTBAL.json (zapisuje nástroj fotbal přes Chrome) → kalendáře „⚽ tým“
 *   Reely     – hotové reely z CLAUDE_SCHRANKA/REELY (zapisuje export z domácího PC): popisky, odkaz na video na Disku,
 *               stav „zveřejněno“ (vlastnost REELY_STAV)
 *   Zdraví    – WHOOP (API v2, OAuth – návrat přes doGet) + Apple Zdraví ze zkratky v iPhonu (akce zdraviApple, klíč
 *               ZDRAVI_KLIC); data po měsících v CLAUDE_SCHRANKA/ZDRAVI; váha zapsaná z aplikace (ZDRAVI/VAHA.json,
 *               i s časem zápisu); upozornění přes ntfy (NTFY_TEMA, kazdouHodinu)
 *
 * Postup nasazení: README.md v kořeni repozitáře.
 */

const VERZE = '2026-10-05.4';
const NAZEV_SLOZKY = 'CLAUDE_SCHRANKA';
const CASOVE_PASMO = 'Europe/Prague';
const DNI_POSTY = 30;  // Doručená pošta za 30 dní (oznámení starší 14 dní aplikace schová)
const DNI_STARSI_POSTY = 90; // druhé okno 30–90 dní: jen nevyřízené (hoří, čeká na tebe, otázka)
const MAX_VLAKEN = 50;
const MAX_STARSICH = 25;
const MAX_ZPRAV_VE_VLAKNE = 12;
const MAX_TEXTU_ZPRAVY = 100000; // znaků textu jedné zprávy ve vlákně (delší se zkrátí a končí „…“)
const MAX_HTML_ZPRAVY = 180000;
const MAX_VYRIZENYCH = 25;
const MAX_ROZSAH_KALENDARE = 100 * 864e5; // jeden dotaz nejvýš na 100 dní
const BARVY_KALENDARU = ['#2f5bd3', '#2e7a4d', '#a8620c', '#8e5bd3', '#c0392b', '#0f7c8c', '#b5407a'];
// barvy jednotlivých událostí v Kalendáři Google (CalendarApp.EventColor 1–11)
const BARVY_UDALOSTI_GOOGLE = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000'
};

// ---------------------------------------------------------------- vstup

function doGet(e) {
  const prm = (e && e.parameter) || {};
  // návrat ze souhlasu WHOOP (OAuth): /exec?code=…&state=… nebo ?error=…
  if (prm.state && (prm.code || prm.error)) return whoopNavrat_(prm);
  return ContentService.createTextOutput('Asistent – motor běží.');
}

function doPost(e) {
  let vystup;
  try {
    let data;
    try {
      data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (chyba) {
      throw new Error('Nečitelný požadavek.');
    }
    // zkratka Zdraví v iPhonu má vlastní klíč jen pro zápis dat (hlavní klíč otevírá poštu)
    if (data.akce === 'zdraviApple') {
      const klicZdravi = klicZdravi_();
      vystup = klicZdravi && typeof data.klic === 'string' && data.klic === klicZdravi
        ? { ok: true, data: zapisApple_(data) } : { ok: false, chyba: 'klic' };
      return ContentService.createTextOutput(JSON.stringify(vystup)).setMimeType(ContentService.MimeType.JSON);
    }
    const klic = klicApi_();
    if (!klic) throw new Error('Motor není nastavený – v editoru spusť funkci nastavApi.');
    if (typeof data.klic !== 'string' || data.klic !== klic) {
      vystup = { ok: false, chyba: 'klic' };
    } else {
      // jen vlastní akce (ne „constructor“ a jiné zděděné vlastnosti objektu)
      if (typeof data.akce !== 'string' || !Object.prototype.hasOwnProperty.call(AKCE, data.akce)) {
        throw new Error('Neznámá akce.');
      }
      vystup = { ok: true, data: AKCE[data.akce](data) };
    }
  } catch (chyba) {
    vystup = { ok: false, chyba: String((chyba && chyba.message) || chyba) };
  }
  return ContentService.createTextOutput(JSON.stringify(vystup)).setMimeType(ContentService.MimeType.JSON);
}

// co motor umí uvnitř akcí (aplikace podle toho ukáže nová tlačítka i u starší verze motoru je schová)
const SCHOPNOSTI = ['polozkaUpravy', 'polozkaTermin'];

const AKCE = {
  info: function () {
    return { verze: VERZE, akce: Object.keys(AKCE).concat(SCHOPNOSTI), ucet: mojeAdresa_(), posta: nastaveniPosty_(), kalendare: seznamKalendaru_(),
      skupinyHostu: skupinyHostu_(), pocasi: { misto: mistoPocasi_() } };
  },
  skupinyHostuUlozit: function (d) { return ulozSkupinyHostu_(d.skupiny); },
  nastavPostu: function (d) { return nastavPostu_(d.pracovniAdresa); },
  schranka: function () { return nactiSchranku_(); },
  poznamka: function (d) { return pridejPoznamku_(d.text); },
  polozka: function (d) { return upravPolozku_(d.id, d.jak, d.text); },
  posta: function (d) { return nactiPostu_(d.znovu); },
  vlakno: function (d) { return nactiVlakno_(d.id, d.precist !== false); },
  odeslat: function (d) { return odeslat_(d); },
  oznacit: function (d) { return oznacitVlakno_(d.id, d.jak); },
  hledat: function (d) { return hledatPostu_(d.dotaz); },
  pripomenout: function (d) { return pripomenout_(d.id, d.termin, d.poznamka); },
  kalendar: function (d) { return nactiKalendar_(d.od, d.do, d.znovu); },
  kalendare: function () { return seznamKalendaru_(); },
  kalendarPridat: function (d) { return pridejKalendar_(d.nazev, d.odkaz, d.barva); },
  kalendarUpravit: function (d) { return upravKalendar_(d.id, d); },
  kalendarOdebrat: function (d) { return odeberKalendar_(d.id); },
  kalendarZalozit: function (d) { return zalozKalendar_(d.nazev, d.barva); },
  udalostUlozit: function (d) { return ulozUdalost_(d); },
  udalostSmazat: function (d) { return smazUdalost_(d.kalendarId, d.udalost, !!d.cela); },
  zapasyImport: function (d) { return importujZapasy_(d); },
  pocasi: function (d) { return pocasi_(!!d.znovu, d.poloha || null); }, // bez polohy z aplikace = výchozí místo
  stitky: function (d) { return stitkyGmailu_(!!d.znovu); },
  postaStitek: function (d) { return postaStitku_(d.nazev); },
  kontakty: function () { return kontakty_(); },
  podpisyUlozit: function (d) { return ulozPodpisy_(d.podpisy); },
  zdravi: function (d) { return zdravi_(!!d.znovu); },
  whoopPropojit: function () { return whoopPropojit_(); },
  whoopOdpojit: function () { return whoopOdpojit_(); },
  zdraviKlic: function (d) { return zdraviKlic_(!!d.novy); },
  fotbal: function (d) { return fotbal_(d); },
  fotbalKalendar: function (d) { return fotbalDoKalendare_(d.tymy); },
  dochazka: function (d) { return dochazka_(!!d.znovu); },
  navrhZahodit: function (d) { return zahoditNavrh_(d.id); },
  navrhyNastavit: function (d) { return nastavNavrhy_(d.rezim); },
  reely: function (d) { return reely_(!!d.znovu); },
  reelStav: function (d) { return nastavStavReelu_(d.id, d.zverejneno); },
  vaha: function (d) { return vaha_(d); },
  // víc čtení v jednom požadavku – aplikace při startu neposílá deset dotazů naráz (ty se pak řadí do fronty)
  davka: function (d) {
    return (Array.isArray(d.polozky) ? d.polozky.slice(0, 12) : []).map(function (p) {
      try {
        if (!p || DAVKA_AKCE.indexOf(p.akce) < 0) throw new Error('Akci nejde poslat v dávce.');
        return { ok: true, data: AKCE[p.akce](p) };
      } catch (chyba) {
        return { ok: false, chyba: String((chyba && chyba.message) || chyba) };
      }
    });
  }
};

// akce, které smí jít v dávce: jen čtení (zápisy a pošta zvlášť)
const DAVKA_AKCE = ['info', 'schranka', 'kalendar', 'pocasi', 'zdravi', 'fotbal', 'reely', 'dochazka', 'stitky', 'kontakty'];

// ---------------------------------------------------------------- nastavení (spouští se ručně v editoru)

/** Spustit jednou (▶ Spustit): vytvoří klíč a vyžádá si všechna povolení. Klíč vypíše do protokolu. */
function nastavApi() {
  const vlastnosti = PropertiesService.getScriptProperties();
  let klic = vlastnosti.getProperty('API_KLIC');
  if (!klic) {
    klic = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    vlastnosti.setProperty('API_KLIC', klic);
  }
  // sáhnout na všechno, co motor používá → Google se zeptá na povolení najednou
  koren_();
  GmailApp.getInboxUnreadCount();
  CalendarApp.getDefaultCalendar();
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  Logger.log('Motor pro účet ' + mojeAdresa_() + ' je připravený.');
  Logger.log('KLÍČ pro aplikaci (vložíš ho jednou v aplikaci): ' + klic);
}

/** Když klíč unikne nebo se ztratí telefon: vyrobí nový, starý přestane platit. */
function novyKlic() {
  PropertiesService.getScriptProperties().deleteProperty('API_KLIC');
  CacheService.getScriptCache().remove('API_KLIC');
  nastavApi();
}

/**
 * Klíč z mezipaměti (6 h), vlastnosti skriptu jen při jejím vypršení – požadavky bez klíče tak
 * nevyčerpají denní kvótu čtení vlastností (50 000) a motor nejde „vypnout“ zahlcením.
 */
function klicApi_() {
  const cache = CacheService.getScriptCache();
  let klic = cache.get('API_KLIC');
  if (!klic) {
    klic = PropertiesService.getScriptProperties().getProperty('API_KLIC');
    if (klic) cache.put('API_KLIC', klic, 21600);
  }
  return klic;
}

let MOJE_ADRESA_ = null; // jednou za běh skriptu
function mojeAdresa_() {
  if (MOJE_ADRESA_ === null) {
    try { MOJE_ADRESA_ = Session.getEffectiveUser().getEmail() || ''; } catch (chyba) { MOJE_ADRESA_ = ''; }
  }
  return MOJE_ADRESA_;
}

// ---------------------------------------------------------------- Schránka

function nactiSchranku_() {
  const koren = koren_();
  const nove = soubory_(podslozka_(koren, 'NOVE')).map(function (f) { return polozka_(f, 'NOVE'); });
  const ceka = soubory_(podslozka_(koren, 'CEKA')).map(function (f) { return polozka_(f, 'CEKA'); });

  // HOTOVO je po měsících (HOTOVO/2026-10); stačí poslední dva měsíce + soubory přímo v HOTOVO
  const hotovoSlozka = podslozka_(koren, 'HOTOVO');
  let hotovo = soubory_(hotovoSlozka);
  const mesice = [];
  const it = hotovoSlozka.getFolders();
  while (it.hasNext()) mesice.push(it.next());
  mesice.sort(function (a, b) { return b.getName().localeCompare(a.getName()); });
  mesice.slice(0, 2).forEach(function (m) { hotovo = hotovo.concat(soubory_(m)); });
  hotovo.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });
  hotovo = hotovo.slice(0, MAX_VYRIZENYCH).map(function (f) { return polozka_(f, 'HOTOVO'); });

  // kdy Claude naposledy zpracoval schránku (obnovil PREHLED.md) – aplikace pozná, že úloha neběží (PC vypnuté)
  const prehled = koren.getFilesByName('PREHLED.md');
  const zpracovano = prehled.hasNext() ? prehled.next().getLastUpdated().getTime() : null;
  return { nove: nove, ceka: ceka, hotovo: hotovo, zpracovano: zpracovano, ted: Date.now() };
}

/** Poznámka napsaná nebo nadiktovaná přímo v aplikaci. */
function pridejPoznamku_(text) {
  text = String(text || '').trim();
  if (!text) throw new Error('Prázdná poznámka.');
  if (text.length > 20000) throw new Error('Poznámka je příliš dlouhá.');
  const ted = new Date();
  const nazev = Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd_HHmmss') + '_' +
    Utilities.getUuid().slice(0, 4) + '.md';
  const obsah = ['---',
    'kdy: ' + Utilities.formatDate(ted, CASOVE_PASMO, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    'odkud: aplikace',
    '---', '', text, ''].join('\n');
  const soubor = podslozka_(koren_(), 'NOVE').createFile(nazev, obsah, MimeType.PLAIN_TEXT);
  return polozka_(soubor, 'NOVE');
}

/**
 * Akce nad položkou schránky (NOVE, CEKA i HOTOVO):
 *   hotovo   – tvůj úkol splněn → HOTOVO (text = co se udělalo, např. „Událost založena: …“)
 *   zahodit  – nápad nechci → HOTOVO
 *   udelej   – nápad / plán schválen → zpět do NOVE, Claude ho při dalším zpracování udělá
 *   odpoved  – odpověď na otázku Clauda → zpět do NOVE
 *   dopsat   – doplnění k poznámce (i už vyřízené) → NOVE, Claude ho vezme jako nový pokyn
 *   nadpis   – vlastní nadpis položky (prázdný = smazat); zůstává, kde je
 *   tema     – téma (prace, osobni, fotbal…; prázdné = bez tématu); zůstává, kde je
 *   smazat   – do koše na Disku Google (30 dní jde obnovit), obnovit – zpět z koše (Vrátit v aplikaci)
 */
function upravPolozku_(id, akce, text) {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    const soubor = DriveApp.getFileById(String(id || ''));
    const koren = koren_();
    // jen poznámky .md ve schránce (ne POSTA_FIREMNI.json ani nic jiného na Disku)
    if (!/\.md$/i.test(soubor.getName()) || !jeVeSchrance_(soubor, koren)) throw new Error('Soubor není ve schránce.');

    if (akce === 'smazat' || akce === 'obnovit') {
      soubor.setTrashed(akce === 'smazat'); // obnovit = Vrátit hned po smazání
      return true;
    }
    const puvodni = soubor.getBlob().getDataAsString('UTF-8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (akce === 'nadpis' || akce === 'tema' || akce === 'termin') {
      let hodnota = String(text || '').replace(/\s+/g, ' ').trim();
      if (akce === 'termin' && hodnota && !/^\d{4}-\d{2}-\d{2}$/.test(hodnota)) throw new Error('Termín musí být RRRR-MM-DD.');
      if (akce === 'nadpis' && hodnota.length > 120) throw new Error('Nadpis je moc dlouhý (nejvýš 120 znaků).');
      if (akce === 'tema') {
        hodnota = hodnota.toLowerCase();
        if (!/^[a-z0-9-]{0,24}$/.test(hodnota)) throw new Error('Neplatné téma.');
      }
      soubor.setContent(nastavHlavicku_(puvodni, akce, hodnota));
      return polozka_(soubor, slozkaPolozky_(soubor, koren));
    }

    const popis = {
      hotovo: String(text || '').trim() || 'Hotovo.',
      zahodit: 'Zahodit – nedělat.',
      udelej: 'Udělej to.',
      odpoved: String(text || '').trim(),
      dopsat: String(text || '').trim()
    }[akce];
    if (!popis) throw new Error('Neznámá akce nebo prázdný text.');
    if (popis.length > 20000) throw new Error('Text je příliš dlouhý.');

    const kdy = Utilities.formatDate(new Date(), CASOVE_PASMO, 'yyyy-MM-dd HH:mm');
    const obsah = puvodni.replace(/\s*$/, '') + '\n\n## Michal – ' + kdy + ' (aplikace' + (akce === 'dopsat' ? ', doplnění' : '') + ')\n' + popis + '\n';
    soubor.setContent(obsah);

    let cil;
    if (akce === 'hotovo' || akce === 'zahodit') {
      const mesic = Utilities.formatDate(new Date(), CASOVE_PASMO, 'yyyy-MM');
      cil = podslozka_(podslozka_(koren, 'HOTOVO'), mesic);
    } else {
      cil = podslozka_(koren, 'NOVE');
    }
    soubor.moveTo(cil);
    return true;
  } finally {
    zamek.releaseLock();
  }
}

function polozka_(soubor, slozka) {
  // rozebraná poznámka se pamatuje podle id a času úpravy – z Disku se čte jen nová nebo změněná (čtení je pomalé)
  const upraveno = soubor.getLastUpdated().getTime();
  const klic = 'pol:' + soubor.getId() + ':' + upraveno;
  const ulozena = nactiZCache_(klic);
  if (ulozena) { ulozena.slozka = slozka; return ulozena; }
  // BOM na začátku (soubor uložený z Windows) by schoval hlavičku ---
  const obsah = soubor.getBlob().getDataAsString('UTF-8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const hlavicka = {};
  let telo = obsah;
  const m = obsah.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    m[1].split('\n').forEach(function (radek) {
      const i = radek.indexOf(':');
      if (i > 0) hlavicka[radek.slice(0, i).trim()] = radek.slice(i + 1).trim();
    });
    telo = obsah.slice(m[0].length);
  }
  // text diktátu = vše před první sekcí „## Claude“ / „## Michal“; zbytek = odpovědi
  const j = telo.search(/^## (Claude|Michal)\b/m);
  const text = (j >= 0 ? telo.slice(0, j) : telo).trim();
  const vlakno = [];
  if (j >= 0) {
    telo.slice(j).split(/^(?=## (?:Claude|Michal)\b)/m).forEach(function (cast) {
      const r = cast.match(/^## (Claude|Michal)[^\n]*\n?([\s\S]*)$/);
      if (r) vlakno.push({ kdo: r[1], kdy: (cast.match(/–\s*([0-9-]+ [0-9:]+)/) || [])[1] || '', text: r[2].trim() });
    });
  }
  const kdy = Date.parse(hlavicka.kdy || '') || soubor.getDateCreated().getTime();
  const polozka = {
    id: soubor.getId(),
    slozka: slozka,
    kdy: kdy,
    upraveno: upraveno,
    odkud: hlavicka.odkud || '',
    typ: hlavicka.typ || '',
    stav: hlavicka.stav || '',
    shrnuti: hlavicka.shrnuti || '',
    termin: hlavicka.termin || '',
    nadpis: hlavicka.nadpis || '',
    tema: hlavicka.tema || '',
    navrh: navrhZHlavicky_(hlavicka.navrh),
    text: text,
    vlakno: vlakno
  };
  ulozDoCache_(klic, polozka, 21600);
  return polozka;
}

/** Návrh od Clauda (JSON na jednom řádku): událost nebo e-mail, který Michal v aplikaci jedním klepnutím potvrdí. */
function navrhZHlavicky_(text) {
  if (!text) return null;
  try {
    const n = JSON.parse(text);
    return n && (n.typ === 'udalost' || n.typ === 'email') ? n : null;
  } catch (chyba) {
    return null;
  }
}

/** Nastaví (nebo smaže, když je hodnota prázdná) řádek „klic: hodnota“ v hlavičce --- poznámky. */
function nastavHlavicku_(obsah, klic, hodnota) {
  const m = obsah.match(/^---\n([\s\S]*?)\n---\n?/);
  let radky = m ? m[1].split('\n') : [];
  const telo = m ? obsah.slice(m[0].length) : obsah;
  let nalezeno = false;
  radky = radky.map(function (r) {
    if (r.split(':')[0].trim() !== klic) return r;
    nalezeno = true;
    return hodnota ? klic + ': ' + hodnota : null;
  }).filter(function (r) { return r !== null; });
  if (!nalezeno && hodnota) radky.push(klic + ': ' + hodnota);
  return '---\n' + radky.join('\n') + '\n---\n' + telo.replace(/^\n?/, '\n');
}

/** NOVE, CEKA nebo HOTOVO podle složky souboru. */
function slozkaPolozky_(soubor, koren) {
  const rodice = soubor.getParents();
  const r = rodice.hasNext() ? rodice.next() : null;
  const nazev = r ? r.getName() : '';
  return nazev === 'NOVE' || nazev === 'CEKA' ? nazev : 'HOTOVO';
}

function soubory_(slozka) {
  const vysledek = [];
  const it = slozka.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/\.md$/i.test(f.getName())) vysledek.push(f);
  }
  vysledek.sort(function (a, b) { return a.getName().localeCompare(b.getName()); });
  return vysledek;
}

/** Leží soubor v NOVE, CEKA nebo HOTOVO(/RRRR-MM) schránky? */
function jeVeSchrance_(soubor, koren) {
  const korenId = koren.getId();
  const cesta = [];
  let rodice = soubor.getParents();
  for (let hloubka = 0; hloubka < 3 && rodice.hasNext(); hloubka++) {
    const r = rodice.next();
    if (r.getId() === korenId) {
      return (cesta.length === 1 && ['NOVE', 'CEKA', 'HOTOVO'].indexOf(cesta[0]) >= 0) ||
        (cesta.length === 2 && cesta[1] === 'HOTOVO' && /^\d{4}-\d{2}$/.test(cesta[0]));
    }
    cesta.push(r.getName());
    rodice = r.getParents();
  }
  return false;
}

function koren_() {
  const vlastnosti = PropertiesService.getScriptProperties();
  const id = vlastnosti.getProperty('SLOZKA_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (chyba) { /* hledat znovu */ }
  }
  const nalezene = DriveApp.getRootFolder().getFoldersByName(NAZEV_SLOZKY);
  if (!nalezene.hasNext()) throw new Error('Na Disku chybí složka ' + NAZEV_SLOZKY + ' – nejdřív nastav schránku.');
  const slozka = nalezene.next();
  vlastnosti.setProperty('SLOZKA_ID', slozka.getId());
  return slozka;
}

function podslozka_(koren, nazev) {
  const nalezene = koren.getFoldersByName(nazev);
  return nalezene.hasNext() ? nalezene.next() : koren.createFolder(nazev);
}

// ---------------------------------------------------------------- Pošta

// prostá e-mailová adresa – nic, co by v dotazu do Gmailu znamenalo operátor ({ } ( ) " : mezera)
const PROSTA_ADRESA = /^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$/i;

function pracovniAdresa_() {
  const a = String(PropertiesService.getScriptProperties().getProperty('PRACOVNI_ADRESA') || '').trim().toLowerCase();
  return PROSTA_ADRESA.test(a) ? a : '';
}

/** Gmail dotaz „zpráva šla na pracovní adresu“ – stejný pro seznam, detail i odeslání. */
function filtrPracovni_(prac) {
  return '{to:' + prac + ' cc:' + prac + ' deliveredto:' + prac + '}';
}

/** Alias z „Odesílat poštu jako“ přesně tak, jak ho vrací Gmail (velikost písmen), nebo ''. */
function aliasPracovni_(prac) {
  let aliasy = [];
  try { aliasy = GmailApp.getAliases(); } catch (chyba) { /* nic */ }
  return aliasy.filter(function (a) { return String(a).toLowerCase() === prac; })[0] || '';
}

/** Stav pošty pro Nastavení v aplikaci: pracovní adresa a jestli z ní jde odesílat. */
function nastaveniPosty_() {
  const prac = pracovniAdresa_();
  return { osobniAdresa: mojeAdresa_(), pracovniAdresa: prac, lzeOdesilatZPracovni: !!prac && !!aliasPracovni_(prac), podpisy: podpisy_(), navrhyOdpovedi: rezimNavrhu_() };
}

function nastavPostu_(adresa) {
  adresa = String(adresa || '').trim().toLowerCase();
  if (adresa && !PROSTA_ADRESA.test(adresa)) throw new Error('Neplatná adresa.');
  if (adresa && adresa === mojeAdresa_().toLowerCase()) throw new Error('To je osobní adresa – sem patří ta pracovní.');
  const vlastnosti = PropertiesService.getScriptProperties();
  if (adresa) vlastnosti.setProperty('PRACOVNI_ADRESA', adresa); else vlastnosti.deleteProperty('PRACOVNI_ADRESA');
  smazCache_('posta');
  smazCache_('znami'); // „moje“ odeslané zprávy se počítají i z pracovní adresy
  ZNAMI_ = undefined;
  return nastaveniPosty_();
}

function nactiPostu_(znovu) {
  // odložené zprávy, kterým přišel termín, zpět do Doručených (bez spouštěče; obvykle jen jedno čtení vlastnosti)
  try {
    if (vratOdlozene_() > 0) znovu = true;
  } catch (chyba) { /* pošta se načte i tak, vrátí se při dalším načtení */ }
  if (!znovu) {
    const ulozene = nactiZCache_('posta');
    if (ulozene) return ulozene;
  }
  const ja = mojeAdresa_().toLowerCase();
  const prac = pracovniAdresa_();
  const kategorie = ' -category:promotions -category:social -category:forums';
  const zaklad = 'in:inbox newer_than:' + DNI_POSTY + 'd' + kategorie;
  // druhé, starší okno: z 30–90 dní jen nevyřízené, ať se nedořešená věc neztratí jen proto, že je starší než měsíc
  const starsi = 'in:inbox older_than:' + DNI_POSTY + 'd newer_than:' + DNI_STARSI_POSTY + 'd' + kategorie;
  const nevyrizene = function (v) { return v.stav === 'hori' || v.stav === 'ceka' || v.stav === 'otazka'; };
  const ucet = function (filtr, nazev) {
    return spojVlakna_(seznamVlaken_(zaklad + filtr, ja, prac, nazev, null, null, true),
      seznamVlaken_(starsi + filtr, ja, prac, nazev, MAX_STARSICH, null, true).filter(nevyrizene));
  };
  const pracovni = prac ? ucet(' ' + filtrPracovni_(prac), 'pracovni') : [];
  // hledání jde po zprávách – vlákno s osobní i pracovní zprávou by bylo dvakrát; patří k pracovní
  const vPracovni = {};
  pracovni.forEach(function (v) { vPracovni[v.id] = true; });
  const osobni = ucet(prac ? ' -to:' + prac + ' -cc:' + prac + ' -deliveredto:' + prac : '', 'osobni')
    .filter(function (v) { return !vPracovni[v.id]; });
  // podklady pro návrhy odpovědí od Clauda (jen na Disk, do aplikace nejdou) + značka „návrh“ u konverzace
  const kOdpovedi = [];
  let navrhy = {};
  try { navrhy = nactiNavrhy_(); } catch (chyba) { navrhy = {}; }
  osobni.concat(pracovni).forEach(function (v) {
    if (v._odpoved) {
      kOdpovedi.push({ id: v.id, zpravaId: v._odpoved.zpravaId, ucet: v.ucet, stav: v.stav, od: v.od, odAdresa: v.odAdresa, predmet: v.predmet, kdy: v.kdy, text: v._odpoved.text });
      const n = navrhy[v.id];
      if (n && n.zpravaId === v._odpoved.zpravaId && n.text) v.navrh = true;
    }
    delete v._odpoved;
  });
  try { ulozPostuKOdpovedi_(kOdpovedi); } catch (chyba) { /* pošta se ukáže i bez podkladů */ }
  const vysledek = {
    osobni: osobni,
    pracovni: pracovni,
    pracovniAdresa: prac,
    firemni: nactiFiremni_(), // souhrny z PC (náhradní zdroj, když se pracovní pošta nepřeposílá)
    ted: Date.now()
  };
  // 5 minut: každá změna z aplikace (odeslání, archiv, přečteno…) mezipaměť maže, Obnovit ji obchází
  ulozDoCache_('posta', vysledek, 300);
  return vysledek;
}

// ---------------------------------------------------------------- Návrhy odpovědí od Clauda
// Motor zapíše konverzace, které čekají na Michalovu odpověď, do CLAUDE_SCHRANKA/POSTA_K_ODPOVEDI.json (jen na Disk).
// Naplánovaná úloha Clauda k nim napíše návrh do CLAUDE_SCHRANKA/ODPOVEDI/<id vlákna>.json; aplikace návrh ukáže
// v konverzaci – Michal ho upraví a odešle sám. Nastavení NAVRHY_ODPOVEDI: obe (výchozí) | osobni | vypnuto.

const MAX_K_ODPOVEDI = 15;

function rezimNavrhu_() {
  const r = vlastnosti_().getProperty('NAVRHY_ODPOVEDI') || 'obe';
  return ['obe', 'osobni', 'vypnuto'].indexOf(r) >= 0 ? r : 'obe';
}

function nastavNavrhy_(rezim) {
  if (['obe', 'osobni', 'vypnuto'].indexOf(rezim) < 0) throw new Error('Neplatné nastavení návrhů.');
  vlastnosti_().setProperty('NAVRHY_ODPOVEDI', rezim);
  vlastnosti_().deleteProperty('ODPOVEDI_OTISK'); // příště se podklady zapíšou znovu (i prázdné)
  smazCache_('posta');
  return nastaveniPosty_();
}

/** Podklady pro Clauda – zapíše se jen při změně (otisk ve vlastnostech), ať se Disk zbytečně nemění. */
function ulozPostuKOdpovedi_(seznam) {
  const rezim = rezimNavrhu_();
  const vybrane = rezim === 'vypnuto' ? [] : seznam.filter(function (v) { return rezim === 'obe' || v.ucet === 'osobni'; })
    .sort(function (a, b) { return b.kdy - a.kdy; }).slice(0, MAX_K_ODPOVEDI);
  const otisk = md5_(rezim + '|' + JSON.stringify(vybrane.map(function (v) { return [v.id, v.zpravaId]; })));
  const p = vlastnosti_();
  if (p.getProperty('ODPOVEDI_OTISK') === otisk) return false;
  const obsah = JSON.stringify({ vytvoreno: new Date(Date.now()).toISOString(), rezim: rezim, vlakna: vybrane }, null, 1);
  const koren = koren_();
  const it = koren.getFilesByName('POSTA_K_ODPOVEDI.json');
  if (it.hasNext()) it.next().setContent(obsah); else koren.createFile('POSTA_K_ODPOVEDI.json', obsah, 'application/json');
  p.setProperty('ODPOVEDI_OTISK', otisk);
  return true;
}

function slozkaNavrhu_() { return podslozka_(koren_(), 'ODPOVEDI'); }

/** Návrhy od Clauda: id vlákna → { zpravaId, text, kdy, poznamka, souborId }. */
function nactiNavrhy_() {
  const vysledek = {};
  const it = slozkaNavrhu_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = /^(.+)\.json$/.exec(f.getName());
    if (!m) continue;
    try {
      const n = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      if (n && n.text) vysledek[m[1]] = { zpravaId: String(n.zpravaId || ''), text: String(n.text).slice(0, 8000), kdy: n.kdy || '', poznamka: String(n.poznamka || '').slice(0, 500), souborId: f.getId() };
    } catch (chyba) { /* rozbitý návrh přeskočit */ }
  }
  return vysledek;
}

/** Návrh k vláknu (jen když odpovídá poslední zprávě, na kterou se odpovídá), jinak null. */
function navrhKVlaknu_(id, zpravaId) {
  const it = slozkaNavrhu_().getFilesByName(String(id) + '.json');
  if (!it.hasNext()) return null;
  try {
    const n = JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
    if (!n || !n.text || String(n.zpravaId || '') !== String(zpravaId)) return null;
    return { zpravaId: String(n.zpravaId), text: String(n.text).slice(0, 8000), kdy: n.kdy || '', poznamka: String(n.poznamka || '').slice(0, 500) };
  } catch (chyba) { return null; }
}

/** Zahodit návrh (Michal ho nechce / odpověděl) – soubor do koše na Disku. */
function zahoditNavrh_(id) {
  if (!/^[0-9a-zA-Z_-]{1,40}$/.test(String(id || ''))) throw new Error('Neplatné id konverzace.');
  const it = slozkaNavrhu_().getFilesByName(String(id) + '.json');
  let n = 0;
  while (it.hasNext()) { it.next().setTrashed(true); n++; }
  smazCache_('posta');
  return { smazano: n };
}

/** Dva seznamy vláken dohromady bez duplicit (podle id), v původním pořadí. */
function spojVlakna_(prvni, druhe) {
  const videno = {};
  return prvni.concat(druhe).filter(function (v) {
    if (videno[v.id]) return false;
    videno[v.id] = true;
    return true;
  });
}

/**
 * Souhrny vláken pro seznam v aplikaci. Vlákna z dotazu do Gmailu, nebo už načtená (predem – např. vlákna štítku);
 * dotaz pak slouží jen k poznání oznámení (kategorie Aktualizace).
 */
function seznamVlaken_(dotaz, ja, prac, ucet, max, predem, sPodklady) {
  const vlakna = predem || GmailApp.search(dotaz, 0, max || MAX_VLAKEN);
  const zpravy = GmailApp.getMessagesForThreads(vlakna);
  const oznameni = dotaz ? oznameniVlakna_(dotaz) : {};
  const stitky = stitkyVlaken_(vlakna);
  const ted = Date.now();
  // známí lidé jednou na celý seznam; kolegové z pracovní domény se berou jako známí
  let znami = znamiLide_();
  if (znami && prac) {
    znami = Object.assign({}, znami);
    znami['@' + prac.split('@')[1]] = true;
  }
  return vlakna.map(function (vlakno, i) {
    // koncepty a zprávy v koši do přehledu nepatří (náhled by ukázal neodeslaný text)
    const platne = zpravy[i].filter(function (m) { return !m.isDraft() && !m.isInTrash(); });
    const seznam = platne.length ? platne : zpravy[i];
    const posledni = seznam[seznam.length - 1];
    // v seznamu ukázat posledního, kdo psal mně (ne mou vlastní odpověď)
    let odesilatel = null;
    for (let j = seznam.length - 1; j >= 0 && !odesilatel; j--) {
      const od = adresa_(seznam[j].getFrom());
      if (od !== ja && od !== prac) odesilatel = seznam[j];
    }
    const odeMne = function (m) { return [ja, prac].indexOf(adresa_(m.getFrom())) >= 0; };
    const odeMe = odeMne(posledni);
    const s = stavADuvod_(posledni, odeMe, vlakno, !!oznameni[vlakno.getId()], ted, seznam.some(odeMne), znami);
    const cekas = s.stav === 'cekas';
    const ukazka = posledni.getPlainBody().replace(/\s+/g, ' ').trim().slice(0, 180);
    // čeká na odpověď → podklad pro návrh od Clauda (nactiPostu_ ho odebere a zapíše do POSTA_K_ODPOVEDI.json)
    const kOdpovedi = !!sPodklady && !odeMe && !!odesilatel && (s.stav === 'hori' || s.stav === 'ceka' || s.stav === 'otazka');
    const polozka = {
      id: vlakno.getId(),
      // u hledání účet předem neznáme – stačí adresy zpráv (přeposlaná pracovní pošta má pracovní adresu v Komu/Kopie)
      ucet: ucet || (prac && seznam.some(function (m) {
        return (String(m.getTo() || '') + ',' + String(m.getCc() || '') + ',' + String(m.getFrom() || '')).toLowerCase().indexOf(prac) >= 0;
      }) ? 'pracovni' : 'osobni'),
      stav: s.stav,
      duvod: s.duvod,
      // „čekáš na ně“: na koho a co (začátek tvé zprávy); jinak poslední, kdo psal tobě
      od: cekas ? 'Čekáš na: ' + jmenaAdresatu_(posledni)
        : odesilatel ? jmeno_(odesilatel.getFrom()) : 'Já → ' + jmeno_(posledni.getTo()),
      odAdresa: odesilatel ? adresa_(odesilatel.getFrom()) : '',
      predmet: vlakno.getFirstMessageSubject() || '(bez předmětu)',
      ukazka: (cekas && prvniRadek_(vlastniText_(posledni))) || ukazka,
      kdy: vlakno.getLastMessageDate().getTime(),
      neprectena: vlakno.isUnread(),
      dulezita: vlakno.isImportant(),
      hvezdicka: vlakno.hasStarredMessages(),
      stitky: stitky[i],
      pocet: seznam.length,
      odkaz: odkazGmail_(vlakno.getId()),
      termin: s.termin ? s.termin.ms : null, // termín z poslední zprávy (23:59 toho dne v Praze)
      terminVeta: s.termin ? s.termin.veta : '',
      poTerminu: !!s.termin && s.termin.ms < ted,
      cekasOd: cekas ? posledni.getDate().getTime() : null
    };
    if (kOdpovedi) polozka._odpoved = { zpravaId: odesilatel.getId(), text: vlastniText_(odesilatel) };
    return polozka;
  });
}

/** Jména adresátů zprávy (Komu, bez něj Kopie), nejvýš tři – pro „Čekáš na: …“. */
function jmenaAdresatu_(zprava) {
  let adresati = rozdelAdresy_(zprava.getTo());
  if (!adresati.length) adresati = rozdelAdresy_(zprava.getCc());
  return adresati.slice(0, 3).map(function (a) { return jmeno_(a); }).join(', ');
}

/** První řádek textu pro náhled; samotné oslovení („Dobrý den,“) se přeskočí. */
function prvniRadek_(text) {
  const radky = String(text || '').split('\n').map(function (r) { return r.trim(); }).filter(Boolean);
  const osloveni = radky.length > 1 && radky[0].length <= 40 && /,$/.test(radky[0]);
  return (radky[osloveni ? 1 : 0] || '').replace(/\s+/g, ' ').slice(0, 180);
}

/** Vlákna z kategorie Aktualizace (oznámení, účtenky, systémové zprávy) – jedním dotazem, bez čtení hlaviček. */
function oznameniVlakna_(dotaz) {
  const mapa = {};
  try {
    GmailApp.search('(' + dotaz + ') category:updates', 0, MAX_VLAKEN).forEach(function (v) { mapa[v.getId()] = true; });
  } catch (chyba) { /* bez kategorií – rozhodne odesílatel */ }
  return mapa;
}

// ---------------------------------------------------------------- Pošta – štítky Gmailu, kontakty, podpisy

const STITKY_SEKUND = 3600; // štítky vlákna se mění zřídka (přidává je hlavně filtr při doručení)
const MAX_VLAKEN_STITKU = 40;
const MAX_PODPISU = 2000;

/** Uživatelské štítky Gmailu u vláken (jména) – z mezipaměti, chybějící se dočtou jedním voláním na vlákno. */
function stitkyVlaken_(vlakna) {
  const cache = CacheService.getScriptCache();
  const klice = vlakna.map(function (v) { return 'stitky:' + v.getId(); });
  let ulozene = {};
  try { ulozene = (klice.length && cache.getAll(klice)) || {}; } catch (chyba) { ulozene = {}; }
  const nove = {};
  const vysledek = vlakna.map(function (v, i) {
    if (ulozene[klice[i]] != null) {
      try { return JSON.parse(ulozene[klice[i]]); } catch (chyba) { /* dočíst znovu */ }
    }
    let jmena = [];
    try { jmena = (v.getLabels ? v.getLabels() : []).map(function (l) { return l.getName(); }); } catch (chyba) { jmena = []; }
    nove[klice[i]] = JSON.stringify(jmena);
    return jmena;
  });
  if (Object.keys(nove).length) {
    try { cache.putAll(nove, STITKY_SEKUND); } catch (chyba) { /* jen zrychlení */ }
  }
  return vysledek;
}

/** Štítky Gmailu tak, jak je má Michal (vlastní, i vnořené „Rodič/Dítě“), s počtem nepřečtených. */
function stitkyGmailu_(znovu) {
  if (!znovu) {
    const ulozene = nactiZCache_('stitky');
    if (ulozene) return ulozene;
  }
  const vysledek = GmailApp.getUserLabels().map(function (l) {
    let neprectenych = 0;
    try { neprectenych = l.getUnreadCount(); } catch (chyba) { /* počet není nutný */ }
    return { nazev: l.getName(), neprectenych: neprectenych };
  }).sort(function (a, b) { return a.nazev.localeCompare(b.nazev, 'cs'); });
  ulozDoCache_('stitky', vysledek, 600);
  return vysledek;
}

/** Konverzace se štítkem (kdekoli, i archivované) – nejnovější nahoře. */
function postaStitku_(nazev) {
  nazev = String(nazev || '').trim();
  if (!nazev) throw new Error('Chybí štítek.');
  const stitek = GmailApp.getUserLabelByName(nazev);
  if (!stitek) throw new Error('Štítek „' + nazev + '“ v Gmailu není.');
  const ja = mojeAdresa_().toLowerCase();
  const prac = pracovniAdresa_();
  return { nazev: nazev, vlakna: seznamVlaken_(null, ja, prac, null, MAX_VLAKEN_STITKU, stitek.getThreads(0, MAX_VLAKEN_STITKU)), ted: Date.now() };
}

/** Lidé, kterým jsem za rok psal (jméno, adresa, kolikrát) – pro našeptávání adres v aplikaci. */
function kontakty_() {
  znamiLide_();
  return (KONTAKTY_ || []).slice(0, 400);
}

/** Podpisy na konec e-mailu (osobní a pracovní) – aplikace je vloží do psaní, motor nic nepřidává. */
function podpisy_() {
  let p = {};
  try { p = JSON.parse(PropertiesService.getScriptProperties().getProperty('PODPISY') || '{}') || {}; } catch (chyba) { p = {}; }
  return { osobni: String(p.osobni || ''), pracovni: String(p.pracovni || '') };
}

function ulozPodpisy_(podpisy) {
  podpisy = podpisy || {};
  const cisty = function (s) { return String(s || '').replace(/\r\n/g, '\n').replace(/\s+$/, ''); };
  const p = { osobni: cisty(podpisy.osobni), pracovni: cisty(podpisy.pracovni) };
  if (p.osobni.length > MAX_PODPISU || p.pracovni.length > MAX_PODPISU) throw new Error('Podpis je příliš dlouhý (nejvýš 2000 znaků).');
  PropertiesService.getScriptProperties().setProperty('PODPISY', JSON.stringify(p));
  return nastaveniPosty_();
}

// Stav konverzace jako „případ“ – nápad převzatý z poštovního klienta Mailer (fastmailer.one), pravidla vlastní.
// Určí se hned a zdarma, bez AI (AI může stav později zpřesnit); ke každému stavu patří krátký důvod (stavADuvod_):
//   hori   – jednat hned: termín do 48 hodin od teď (od kohokoli kromě automatů); výslovná naléhavost nebo nahlášený
//            problém („nefunguje“, „výpadek“) jen od známých – komu jsem psal, kolegové z pracovní domény, lidé z vlákna
//   ceka   – někdo po tobě něco chce (prosba, úkol, „k připomínkám“), nebo jen osobní zpráva od známého
//   otazka – ptá se, ale nic nežádá
//   cekas  – poslední jsi psal ty a čekáš na odpověď
//   resi   – živá konverzace, ve které se od tebe teď nic nečeká
//   info   – oznámení a automatické zprávy, neznámý odesílatel bez prosby a otázky; i konverzace uzavřená tvým „díky“
const PISMENO_PRED = '(?<![\\p{L}])';
const PISMENO_ZA = '(?![\\p{L}])';
const slova_ = function (seznam) { return new RegExp(PISMENO_PRED + '(?:' + seznam.join('|') + ')' + PISMENO_ZA, 'iu'); };
const SLOVA_HORI = slova_(['urgent\\p{L}*', 'asap', 'naléhav\\p{L}*', 'spěchá', 'rychle', 'ihned', 'okamžitě', 'neprodleně',
  'co nejdřív(?:e)?', 'deadline', 'nefunguj\\p{L}*', 'výpadek', 'výpadku', 'nedostupn\\p{L}*', 'havári\\p{L}*', 'porucha', 'poruchu']);
const SLOVA_PROSBA = slova_(['prosím', 'prosíme', 'prosil\\p{L}* bych', 'potřebuj\\p{L}*', 'potřeboval\\p{L}* bych', 'je potřeba', 'je nutné',
  'pošli', 'pošlete', 'pošleš', 'zašli', 'zašlete', 'dej(?:te)?(?: mi)? vědět', 'ozvi se', 'ozvěte se', 'potvrď(?:te)?', 'potvrdíš',
  'zkontroluj(?:te)?', 'připrav(?:te)?', 'zaplať(?:te)?', 'uhraď(?:te)?', 'vyplň(?:te)?', 'schval(?:te)?', 'podepiš(?:te)?',
  'doplň(?:te)?', 'oprav(?:te)?', 'rozhodni', 'rozhodněte', 'odpověz(?:te)?', 'můžeš', 'můžete', 'mohl\\p{L}* (?:bys|byste|bychom)',
  'k připomínkám', 'k vyjádření', 'ke schválení', 'k podpisu', 'k odsouhlasení', 'k objednání']);
const AUTOMAT = /(no-?reply|do-?not-?reply|notification|notifikace|newsletter|mailer-daemon|postmaster|bounce)/i;
const DIKY = new RegExp('^(díky|dík|děkuj\\p{L}*|ok|okay|super|platí|dobře|jasně|v pořádku|výborně|thanks|thank you)' + PISMENO_ZA + '[^?]{0,40}$', 'iu');
const DNY_TERMINU = { 'pondělí': 1, 'úterý': 2, 'středy': 3, 'středu': 3, 'čtvrtka': 4, 'čtvrtek': 4, 'pátku': 5, 'pátek': 5,
  'soboty': 6, 'sobotu': 6, 'neděle': 0, 'neděli': 0 };
const TERMIN = new RegExp(PISMENO_PRED + '(?:do|nejpozději(?: do)?|termín(?:em)?|deadline|potřebuj\\p{L}* (?:to )?(?:do|na))\\s+' +
  '(dnes|dneska|dneška|zítra|zítřka|pozítří|večera|konce dne|' + Object.keys(DNY_TERMINU).join('|') +
  '|(\\d{1,2})\\.\\s?(\\d{1,2})\\.(?:\\s?(\\d{4}))?)' + PISMENO_ZA, 'iu');
const ZKRATKY_DNU = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const ZNAMI_SEKUND = 21600; // seznam známých v mezipaměti – CacheService drží hodnotu nejvýš 6 hodin

/** Vlastní text zprávy: bez citace předchozích, bez podpisu za „-- “ a bez adres (otazník v odkazu není otázka). */
function vlastniText_(zprava) {
  return String(zprava.getPlainBody() || '')
    .split(/\n\s*(?:>|Dne .{0,80}napsal|On .{0,80}wrote:|-----|Od:\s.*\n\s*(?:Odesláno|Datum|Komu):|From:\s.*\n\s*(?:Sent|Date|To):)|\n-- ?\n/)[0]
    .replace(/https?:\/\/\S+/g, '').trim().slice(0, 1500);
}

/**
 * Termín v textu jako okamžik – 23:59 toho dne v Praze, počítáno od data zprávy: dnes / do večera / do konce dne = den
 * zprávy, zítra +1, pozítří +2, den v týdnu = nejbližší takový (i ten samý den), „5. 10.(2026)“ = to datum.
 * Z více termínů platí nejbližší, který ještě neprošel o víc než den (stejná rezerva jako u „hoří“); když prošly
 * všechny, ten poslední. Vrací { ms, fraze ('do pátku'), den ('pá 3. 10.'), veta } nebo null.
 */
function terminZTextu_(text, kdy, ted) {
  const denZpravy = cisloDneZMs_(kdy);
  const hledani = new RegExp(TERMIN.source, 'giu');
  let nejlepsi = null;
  let m;
  while ((m = hledani.exec(text))) {
    const den = denTerminu_(m, denZpravy);
    if (den === null) continue;
    const ymd = zCislaDne_(den);
    const ms = msVZone_(ymd[0], ymd[1], ymd[2], 23, 59, 0, CASOVE_PASMO);
    const plati = ms >= ted - 864e5;
    if (!nejlepsi || (plati ? !nejlepsi.plati || ms < nejlepsi.ms : !nejlepsi.plati && ms > nejlepsi.ms)) {
      nejlepsi = { ms: ms, plati: plati, den: den, zacatek: m.index, konec: m.index + m[0].length, fraze: m[0] };
    }
  }
  if (!nejlepsi) return null;
  const ymd = zCislaDne_(nejlepsi.den);
  const letos = zCislaDne_(cisloDneZMs_(ted))[0];
  return {
    ms: nejlepsi.ms,
    fraze: nejlepsi.fraze.replace(/\s+/g, ' ').toLowerCase(),
    den: ZKRATKY_DNU[denTydne_(nejlepsi.den)] + ' ' + ymd[2] + '. ' + ymd[1] + '.' + (ymd[0] !== letos ? ' ' + ymd[0] : ''),
    veta: vetaKolem_(text, nejlepsi.zacatek, nejlepsi.konec)
  };
}

/** Den termínu (číslo dne jako cisloDne_) z jednoho nálezu TERMIN; null = nesmyslné datum („do 31. 9.“). */
function denTerminu_(m, denZpravy) {
  if (m[2]) {
    const den = Number(m[2]);
    const mesic = Number(m[3]);
    let rok = m[4] ? Number(m[4]) : zCislaDne_(denZpravy)[0];
    if (!m[4] && cisloDne_(rok, mesic, den) < denZpravy - 180) rok++; // „do 5. 1.“ psané v prosinci
    if (mesic < 1 || mesic > 12 || den < 1 || den > dniMesice_(rok, mesic)) return null;
    return cisloDne_(rok, mesic, den);
  }
  const slovo = m[1].toLowerCase();
  if (DNY_TERMINU[slovo] !== undefined) return denZpravy + (DNY_TERMINU[slovo] - denTydne_(denZpravy) + 7) % 7;
  if (slovo === 'zítra' || slovo === 'zítřka') return denZpravy + 1;
  if (slovo === 'pozítří') return denZpravy + 2;
  return denZpravy; // dnes, dneska, dneška, do večera, do konce dne
}

/** Věta, ve které leží nález [zacatek, konec) – pro náhled termínu, nejvýš 140 znaků (dlouhá se ořízne kolem nálezu). */
function vetaKolem_(text, zacatek, konec) {
  // konec věty: nový řádek; ! ? … před mezerou; tečka před mezerou a velkým písmenem (v „do 3. 10. prosím“ jde o datum)
  const konecVety = /\n|[!?…](?=\s|$)|\.(?=\s+\p{Lu}|\s*$)/gu;
  let od = 0;
  let po = text.length;
  let m;
  while ((m = konecVety.exec(text))) {
    if (m.index < zacatek) od = m.index + 1;
    else if (m.index >= konec - 1) { po = m.index + 1; break; }
  }
  const veta = text.slice(od, po).replace(/\s+/g, ' ').trim();
  if (veta.length <= 140) return veta;
  const z = Math.max(od, zacatek - 40);
  const k = Math.min(po, z + 136);
  return (z > od ? '…' : '') + text.slice(z, k).replace(/\s+/g, ' ').trim() + (k < po ? '…' : '');
}

let ZNAMI_; // jednou za běh skriptu; undefined = ještě nenačteno, null = nevíme (každý se bere jako známý)
let KONTAKTY_ = null; // [{ j: jméno, a: adresa, n: kolikrát jsem psal }] – nejčastější nahoře

/**
 * Známí lidé = komu jsem za poslední rok psal (Komu, Kopie i Skrytá kopie mých odeslaných zpráv) → { adresa: true }.
 * Zároveň kontakty se jménem a počtem pro našeptávání adres. Prohledání odeslané pošty je pomalé – drží se
 * v mezipaměti (klíč „znami“ = [[adresa, jméno, počet], …], po kusech přes ulozDoCache_).
 */
function znamiLide_() {
  if (ZNAMI_ !== undefined) return ZNAMI_;
  ZNAMI_ = null;
  let seznam = null;
  try { seznam = nactiZCache_('znami'); } catch (chyba) { /* poškozená mezipaměť – sestavit znovu */ }
  if (!Array.isArray(seznam) || (seznam.length && !Array.isArray(seznam[0]))) { // starý tvar (jen adresy) = sestavit znovu
    const ja = mojeAdresa_().toLowerCase();
    const prac = pracovniAdresa_();
    if (!ja && !prac) return ZNAMI_;
    const adresy = {};
    try {
      const vlakna = GmailApp.search('in:sent newer_than:365d', 0, 300);
      GmailApp.getMessagesForThreads(vlakna).forEach(function (zpravy) {
        zpravy.forEach(function (m) {
          const od = adresa_(m.getFrom());
          if (!od || (od !== ja && od !== prac)) return; // v odeslaných vláknech jsou i odpovědi ostatních
          rozdelAdresy_([m.getTo(), m.getCc(), m.getBcc()].join(',')).forEach(function (cela) {
            const a = adresa_(cela);
            if (!a || a === ja || a === prac) return;
            const jmeno = jmeno_(cela);
            const k = adresy[a] || (adresy[a] = { j: '', n: 0 });
            k.n++;
            if (!k.j && jmeno && jmeno.toLowerCase() !== a) k.j = jmeno;
          });
        });
      });
    } catch (chyba) {
      return ZNAMI_; // Gmail teď nejde – raději každý známý než všechno „neznámé“
    }
    seznam = Object.keys(adresy).map(function (a) { return [a, adresy[a].j, adresy[a].n]; })
      .sort(function (x, y) { return y[2] - x[2]; });
    ulozDoCache_('znami', seznam, ZNAMI_SEKUND);
  }
  ZNAMI_ = {};
  seznam.forEach(function (x) { ZNAMI_[x[0]] = true; });
  KONTAKTY_ = seznam.map(function (x) { return { j: x[1] || '', a: x[0], n: x[2] || 0 }; });
  return ZNAMI_;
}

/** Je odesílatel známý (adresa nebo „@doména“ v seznamu)? Bez seznamu se bere každý jako známý. */
function jeZnamy_(od, znami) {
  if (!znami) return true;
  const a = adresa_(od);
  return znami[a] === true || znami['@' + a.slice(a.indexOf('@') + 1)] === true;
}

/**
 * Stav konverzace podle poslední zprávy i s důvodem pro aplikaci: { stav, duvod, termin } (termin z terminZTextu_
 * nebo null). znami = { adresa: true, '@domena': true } ze znamiLide_; bez něj se bere každý jako známý.
 */
function stavADuvod_(posledni, odeMe, vlakno, jeOznameni, ted, jsemPsal, znami) {
  ted = ted || Date.now();
  const text = vlastniText_(posledni);
  const vse = String(posledni.getSubject() || '') + '\n' + text;
  const termin = terminZTextu_(vse, posledni.getDate().getTime(), ted);
  const vysledek = function (stav, duvod) { return { stav: stav, duvod: duvod, termin: termin }; };
  if (odeMe) {
    // „Čekáš na ně“ jen když opravdu čekáš: ne po krátkém „díky“, ne u hromadné zprávy, ne u automatických adres
    const komu = rozdelAdresy_(String(posledni.getTo() || '') + ',' + String(posledni.getCc() || ''));
    const diky = DIKY.exec(text);
    if (komu.length > 5) return vysledek('info', 'hromadná zpráva (' + komu.length + ' adresátů)');
    if (komu.length && komu.every(function (a) { return AUTOMAT.test(a); })) return vysledek('info', 'psal jsi automatické adrese');
    if (diky && !SLOVA_PROSBA.test(text)) return vysledek('info', 'tvoje „' + diky[1].toLowerCase() + '“ na konci');
    return vysledek('cekas', 'odpověděl jsi poslední');
  }
  if (jeOznameni) return vysledek('info', 'Gmail: Aktualizace');
  if (AUTOMAT.test(String(posledni.getFrom() || ''))) return vysledek('info', 'automatická adresa');
  if (termin && termin.ms >= ted - 864e5 && termin.ms <= ted + 48 * 36e5) {
    return vysledek('hori', 'termín „' + termin.fraze + '“ – ' + termin.den);
  }
  // naléhavá slova jen od známých – od cizích to bývá reklama nebo podvod
  const znamy = jsemPsal || jeZnamy_(posledni.getFrom(), znami);
  const slovo = SLOVA_HORI.exec(vse);
  if (slovo && znamy) return vysledek('hori', 'slovo „' + slovo[0].toLowerCase() + '“');
  const prosba = SLOVA_PROSBA.exec(vse);
  if (prosba) return vysledek('ceka', 'prosba „' + prosba[0].toLowerCase() + '“');
  if (/\?/.test(text)) return vysledek('otazka', 'otazník v textu');
  if (jsemPsal) return vysledek('resi', 'píšete si, nic po tobě nechce');
  if (!znamy) return vysledek('info', 'neznámý odesílatel');
  return vysledek('ceka', 'osobní zpráva');
}

/** Jen stav (hori, ceka, otazka, cekas, resi, info) – viz stavADuvod_. */
function stavPripadu_(posledni, odeMe, vlakno, jeOznameni, ted, jsemPsal, znami) {
  return stavADuvod_(posledni, odeMe, vlakno, jeOznameni, ted, jsemPsal, znami).stav;
}

/**
 * Hledání v celé poště (syntaxe Gmailu: from:, has:attachment, after:2026/9/1 …), nejvýš 20 vláken.
 * Koš a spam se vynechají – kromě dotazu, který je sám chce (in:trash, label:spam, in:anywhere …).
 */
function hledatPostu_(dotaz) {
  dotaz = String(dotaz || '').trim().slice(0, 200);
  if (!dotaz) return { vlakna: [], dotaz: '' };
  const vcetneKose = /(?:^|[^\w-])(?:in|label):(?:trash|spam|anywhere)\b/i.test(dotaz);
  const vlakna = seznamVlaken_('(' + dotaz + ')' + (vcetneKose ? '' : ' -in:trash -in:spam'),
    mojeAdresa_().toLowerCase(), pracovniAdresa_(), null, 20);
  return { vlakna: vlakna, dotaz: dotaz };
}

/**
 * „Připomenout“ = odložit: z e-mailu se stane tvůj úkol s termínem ve schránce (CEKA, s odkazem do Gmailu), konverzace
 * se archivuje a v den termínu se sama vrátí do Doručených jako nepřečtená (vratOdlozene_ při načtení pošty).
 */
function pripomenout_(id, termin, poznamka) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(termin || ''))) throw new Error('Termín má tvar RRRR-MM-DD.');
  const vlakno = vlakno_(id);
  const zpravy = vlakno.getMessages();
  const posledni = zpravy[zpravy.length - 1];
  const predmet = String(vlakno.getFirstMessageSubject() || '(bez předmětu)').replace(/[\r\n]+/g, ' ');
  const od = jmeno_(posledni.getFrom()).replace(/[\r\n]+/g, ' ');
  const ted = new Date();
  const nazev = Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd_HHmmss') + '_' + Utilities.getUuid().slice(0, 4) + '.md';
  const obsah = ['---',
    'kdy: ' + Utilities.formatDate(ted, CASOVE_PASMO, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    'odkud: aplikace (pošta)',
    'typ: ukol-michal',
    'stav: tvuj-ukol',
    'shrnuti: ' + ('Odpovědět: ' + predmet + ' (' + od + ')').slice(0, 160),
    'termin: ' + termin,
    '---', '',
    'Připomenutí e-mailu „' + predmet + '“ od ' + od + '.',
    odkazGmail_(vlakno.getId()),
    poznamka ? '\n' + String(poznamka).slice(0, 2000) : '', ''].join('\n');
  // chybějící schránka nebo moc odložených skončí chybou dřív, než se cokoli změní; pak úkol a archiv
  const ceka = podslozka_(koren_(), 'CEKA');
  zapamatujOdlozene_(vlakno.getId(), termin);
  const soubor = ceka.createFile(nazev, obsah, MimeType.PLAIN_TEXT);
  vlakno.moveToArchive();
  smazCache_('posta');
  return polozka_(soubor, 'CEKA');
}

// Odložené konverzace: vlastnost skriptu ODLOZENE = [{ id, termin: 'RRRR-MM-DD' }], každé vlákno nejvýš jednou.

function odlozene_() {
  try {
    const seznam = JSON.parse(PropertiesService.getScriptProperties().getProperty('ODLOZENE') || '[]');
    return Array.isArray(seznam) ? seznam : [];
  } catch (chyba) {
    return [];
  }
}

/** Uloží seznam odložených (volá se pod zámkem); prázdný seznam vlastnost smaže. */
function ulozOdlozene_(seznam) {
  const vlastnosti = PropertiesService.getScriptProperties();
  if (!seznam.length) {
    vlastnosti.deleteProperty('ODLOZENE');
    return;
  }
  const json = JSON.stringify(seznam);
  if (json.length > 8500) throw new Error('Odložených zpráv je moc – některé nejdřív vyřiď.');
  vlastnosti.setProperty('ODLOZENE', json);
}

/** Zapamatuje odložení konverzace do termínu; nové odložení téže konverzace jen přepíše termín. */
function zapamatujOdlozene_(id, termin) {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    const seznam = odlozene_().filter(function (o) { return o.id !== id; });
    seznam.push({ id: id, termin: termin });
    ulozOdlozene_(seznam);
  } finally {
    zamek.releaseLock();
  }
}

/** Odložené konverzace s termínem dnes nebo dřív (datum v Praze) vrátí do Doručených jako nepřečtené. Vrací počet. */
function vratOdlozene_() {
  const dnes = Utilities.formatDate(new Date(), CASOVE_PASMO, 'yyyy-MM-dd');
  const nastal = function (o) { return String(o.termin) <= dnes; };
  if (!odlozene_().some(nastal)) return 0; // běžný případ: jedno čtení vlastnosti, bez zámku
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    let vraceno = 0;
    const zbyva = odlozene_().filter(function (o) {
      if (!nastal(o)) return true;
      try {
        const vlakno = GmailApp.getThreadById(String(o.id));
        if (vlakno) {
          vlakno.moveToInbox();
          vlakno.markUnread();
          vraceno++;
        }
      } catch (chyba) { /* smazaná konverzace – jen vyřadit ze seznamu */ }
      return false;
    });
    ulozOdlozene_(zbyva);
    if (vraceno) smazCache_('posta');
    return vraceno;
  } finally {
    zamek.releaseLock();
  }
}

/**
 * Odložení už neplatí – konverzace je zpět v Doručených nebo vyřízená (jinak by v den termínu vyskočila znovu).
 * jenZDorucenych: zrušit jen u konverzace, která je teď v Doručených (Hotovo po odpovědi na odloženou).
 */
function zrusOdlozeni_(vlakno, jenZDorucenych) {
  const id = vlakno.getId();
  if (!odlozene_().some(function (o) { return o.id === id; })) return; // běžný případ: jedno čtení vlastnosti
  if (jenZDorucenych && !vlakno.isInInbox()) return;
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    ulozOdlozene_(odlozene_().filter(function (o) { return o.id !== id; }));
  } finally {
    zamek.releaseLock();
  }
}

/**
 * Přišla zpráva na pracovní adresu? Rozhoduje stejný dotaz jako seznam (zpráva podle Message-ID
 * + filtr pracovní adresy) – i u skryté kopie nebo skupinové adresy. Bez Message-ID přesná shoda
 * adresy v Komu/Kopie (ne podřetězec: jmichal@… není michal@…).
 */
function jePracovni_(zprava, prac) {
  if (!prac) return false;
  const idZpravy = String(zprava.getHeader('Message-ID') || '').replace(/^\s*<|>\s*$/g, '').trim();
  if (idZpravy && /^[^\s"{}()]+$/.test(idZpravy)) {
    try {
      return GmailApp.search('rfc822msgid:' + idZpravy + ' ' + filtrPracovni_(prac), 0, 1).length > 0;
    } catch (chyba) { /* níž podle hlaviček */ }
  }
  return rozdelAdresy_([zprava.getTo(), zprava.getCc()].join(','))
    .some(function (a) { return adresa_(a) === prac; });
}

/** Odesílací adresa pro pracovní poštu – musí být v Gmailu nastavená v „Odesílat poštu jako“. */
function odesilatZ_(pracovni) {
  if (!pracovni) return {};
  const prac = pracovniAdresa_();
  const alias = aliasPracovni_(prac);
  if (!alias) throw new Error('Z pracovní adresy zatím odesílat nejde – v Gmailu chybí „Odesílat poštu jako“ ' + prac + '.');
  return { from: alias };
}

/** Zpráva, na kterou se odpovídá: poslední, kterou nenapsal Michal (osobní ani pracovní adresou). */
function cilOdpovedi_(zpravy, ja, prac) {
  for (let i = zpravy.length - 1; i >= 0; i--) {
    const od = adresa_(zpravy[i].getFrom());
    if (od !== ja && od !== prac) return zpravy[i];
  }
  return zpravy[zpravy.length - 1];
}

/** Celé vlákno pro čtení v aplikaci; otevřením se označí jako přečtené. */
function nactiVlakno_(id, precist) {
  const vlakno = vlakno_(id);
  const ja = mojeAdresa_().toLowerCase();
  const prac = pracovniAdresa_();
  const vse = vlakno.getMessages().filter(function (m) { return !m.isInTrash() && !m.isDraft(); });
  if (!vse.length) throw new Error('Ve vlákně není žádná zpráva.');
  const zobrazit = vse.slice(-MAX_ZPRAV_VE_VLAKNE);
  const data = {
    id: vlakno.getId(),
    predmet: vlakno.getFirstMessageSubject() || '(bez předmětu)',
    odkaz: odkazGmail_(vlakno.getId()),
    vDorucenych: vlakno.isInInbox(),
    skryto: vse.length - zobrazit.length,
    // účet podle zprávy, na kterou se bude odpovídat – stejné pravidlo jako při odeslání
    ucet: jePracovni_(cilOdpovedi_(zobrazit, ja, prac), prac) ? 'pracovni' : 'osobni',
    zpravy: zobrazit.map(function (m, i) {
      const od = adresa_(m.getFrom());
      const zprava = {
        id: m.getId(),
        od: jmeno_(m.getFrom()),
        odAdresa: od,
        odeMe: (!!ja && od === ja) || (!!prac && od === prac),
        komu: m.getTo(),
        kopie: m.getCc(),
        kdy: m.getDate().getTime(),
        predmet: m.getSubject(),
        // obří zprávy (newslettery, výpisy) zkrátit – odpověď motoru jinak roste do megabajtů
        text: zkrat_(m.getPlainBody(), MAX_TEXTU_ZPRAVY),
        html: zkratHtml_(m.getBody(), MAX_HTML_ZPRAVY),
        // přílohy jen u posledních tří zpráv – stahují se celé, u starších by to zdržovalo
        prilohy: i >= zobrazit.length - 3 ? seznamPriloh_(m) : null
      };
      // odpověď půjde jinam než na odesílatele (Reply-To) – aplikace to ukáže
      const odpovedNa = String(m.getReplyTo() || '').trim();
      if (odpovedNa && rozdelAdresy_(odpovedNa).some(function (a) { return adresa_(a) !== od; })) zprava.odpovedNa = odpovedNa;
      return zprava;
    })
  };
  // návrh odpovědi od Clauda k poslední zprávě, na kterou se odpovídá (cizí)
  const cizi = data.zpravy.filter(function (z) { return !z.odeMe; }).pop();
  if (cizi && cizi === data.zpravy[data.zpravy.length - 1]) {
    try { const n = navrhKVlaknu_(data.id, cizi.id); if (n) data.navrhOdpovedi = n; } catch (chyba) { /* bez návrhu */ }
  }
  if (precist && vlakno.isUnread()) {
    vlakno.markRead();
    smazCache_('posta');
  }
  return data;
}

function seznamPriloh_(zprava) {
  try {
    return zprava.getAttachments({ includeInlineImages: false }).map(function (a) { return { nazev: a.getName(), velikost: a.getSize() }; });
  } catch (chyba) {
    return null; // velká nebo poškozená příloha nesmí shodit celé vlákno
  }
}

/** Text nejvýš max znaků; zkrácený končí „…“. */
function zkrat_(text, max) {
  text = String(text || '');
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** HTML nejvýš max znaků, řez za posledním celým tagem (ať na konci nezůstane useknuté „<a href=…“); končí „…“. */
function zkratHtml_(html, max) {
  html = String(html || '');
  if (html.length <= max) return html;
  const konecTagu = html.lastIndexOf('>', max - 1);
  return html.slice(0, konecTagu > 0 ? konecTagu + 1 : max) + '…';
}

/**
 * rezim: odpoved | vsem | preposlat | novy
 * idOdeslani (nepovinné, do 64 znaků): stejné id = stejné psaní – opakovaný pokus (po výpadku sítě) e-mail nezdvojí
 * a vrátí { jizOdeslano: true }; jinak výsledek true.
 */
function odeslat_(d) {
  const idOdeslani = d.idOdeslani == null ? '' : String(d.idOdeslani);
  if (idOdeslani.length > 64) throw new Error('Neplatné id odeslání.');
  if (!idOdeslani) return odeslatHned_(d);
  const zamek = LockService.getScriptLock();
  zamek.waitLock(30000); // dva souběžné pokusy se stejným id – druhý počká (přeposlání s přílohami trvá) a uvidí, že první odeslal
  try {
    const cache = CacheService.getScriptCache();
    const klic = 'odeslano:' + idOdeslani;
    let uz = null;
    try { uz = cache.get(klic); } catch (chyba) { /* bez mezipaměti se pošle – horší by bylo neposlat */ }
    if (uz) return { jizOdeslano: true };
    const vysledek = odeslatHned_(d);
    try { cache.put(klic, '1', 21600); } catch (chyba) { /* odesláno je – chyba mezipaměti nesmí hlásit neúspěch */ }
    return vysledek;
  } finally {
    zamek.releaseLock();
  }
}

function odeslatHned_(d) {
  const text = String(d.text || '').replace(/\s+$/, '');
  if (!text.trim()) throw new Error('Prázdná zpráva.');
  if (text.length > 50000) throw new Error('Zpráva je příliš dlouhá.');
  const ja = mojeAdresa_().toLowerCase();
  const prac = pracovniAdresa_();
  // odpověď a přeposlání jdou z adresy, na kterou zpráva přišla; nový e-mail z účtu vybraného v aplikaci
  if (d.rezim === 'odpoved' || d.rezim === 'vsem') {
    const zprava = zprava_(d.id);
    const moznosti = odesilatZ_(jePracovni_(zprava, prac));
    const odeMe = [ja, prac].indexOf(adresa_(zprava.getFrom())) >= 0;
    // odpověď na vlastní zprávu by šla mně – pokračování patří původním adresátům
    if (d.rezim === 'vsem' || odeMe) zprava.replyAll(text, moznosti); else zprava.reply(text, moznosti);
    try { zahoditNavrh_(zprava.getThread().getId()); } catch (chyba) { /* návrh nemusí existovat */ }
  } else if (d.rezim === 'preposlat') {
    preposlat_(zprava_(d.id), adresy_(d.komu), text, prac);
  } else if (d.rezim === 'novy') {
    GmailApp.sendEmail(adresy_(d.komu), String(d.predmet || '').trim() || '(bez předmětu)', text,
      odesilatZ_(d.ucet === 'pracovni'));
  } else {
    throw new Error('Neznámý způsob odeslání.');
  }
  smazCache_('posta');
  return true;
}

/**
 * jak: prectene | neprectene | archivovat | doDorucenych | spam | vratit („Vrátit“ po Hotovo nebo Spamu: zpět do
 * Doručených z archivu i ze spamu). Návrat do Doručených, spam i Hotovo u vrácené konverzace ruší její odložení.
 */
function oznacitVlakno_(id, jak) {
  const vlakno = vlakno_(id);
  if (jak === 'prectene') vlakno.markRead();
  else if (jak === 'neprectene') vlakno.markUnread();
  else if (jak === 'archivovat') {
    zrusOdlozeni_(vlakno, true); // před archivem – rozhoduje, jestli je teď v Doručených
    vlakno.moveToArchive();
  } else if (jak === 'doDorucenych') {
    vlakno.moveToInbox();
    zrusOdlozeni_(vlakno);
  } else if (jak === 'vratit') {
    GmailApp.moveThreadToInbox(vlakno);
    zrusOdlozeni_(vlakno);
  } else if (jak === 'spam') {
    GmailApp.moveThreadToSpam(vlakno);
    zrusOdlozeni_(vlakno);
  } else {
    throw new Error('Neznámá akce.');
  }
  smazCache_('posta');
  return true;
}

function vlakno_(id) {
  const vlakno = id ? GmailApp.getThreadById(String(id)) : null;
  if (!vlakno) throw new Error('Zpráva nenalezena.');
  return vlakno;
}

function zprava_(id) {
  const zprava = id ? GmailApp.getMessageById(String(id)) : null;
  if (!zprava) throw new Error('Zpráva nenalezena.');
  return zprava;
}

function adresy_(s) {
  const seznam = rozdelAdresy_(s);
  if (!seznam.length) throw new Error('Chybí adresát.');
  seznam.forEach(function (a) {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(adresa_(a))) throw new Error('Neplatná adresa: ' + a);
  });
  return seznam.join(', ');
}

/**
 * Přeposlání jako nový e-mail s poznámkou, hlavičkou původní zprávy a jejími přílohami.
 * (forward() přílohy spolehlivě nepřikládá; tělo e-mailu má v Gmailu limit 200 kB, přílohy 25 MB.)
 */
function preposlat_(zprava, komu, text, prac) {
  const moznosti = odesilatZ_(jePracovni_(zprava, prac));
  const prilohy = zprava.getAttachments({ includeInlineImages: false });
  const velikost = prilohy.reduce(function (s, a) { return s + a.getSize(); }, 0);
  if (velikost > 20 * 1024 * 1024) throw new Error('Přílohy jsou na přeposlání z aplikace moc velké – přepošli to z Gmailu.');
  const hlavicka = hlavickaPreposlani_(zprava);
  let html = textNaHtml_(text) + '<br><br>' + hlavicka + zprava.getBody();
  if (bajtu_(html) > 180000) { // velké HTML (newslettery) → jen text původní zprávy
    html = textNaHtml_(text) + '<br><br>' + hlavicka + textNaHtml_(zprava.getPlainBody().slice(0, 60000));
  }
  moznosti.htmlBody = html;
  moznosti.attachments = prilohy;
  const predmet = 'Fwd: ' + String(zprava.getSubject() || '').replace(/^\s*((fwd?|tr|vs)\s*:\s*)+/i, '');
  GmailApp.sendEmail(komu, predmet, text + '\n\n---------- Přeposlaná zpráva ----------\n' + zprava.getPlainBody().slice(0, 30000), moznosti);
}

function bajtu_(s) {
  return Utilities.newBlob(String(s)).getBytes().length;
}

function hlavickaPreposlani_(zprava) {
  return '<div>---------- Přeposlaná zpráva ----------<br>' +
    'Od: ' + escHtml_(zprava.getFrom()) + '<br>' +
    'Datum: ' + Utilities.formatDate(zprava.getDate(), CASOVE_PASMO, 'd. M. yyyy H:mm') + '<br>' +
    'Předmět: ' + escHtml_(zprava.getSubject()) + '<br>' +
    'Komu: ' + escHtml_(zprava.getTo()) + '</div><br>';
}

function textNaHtml_(text) {
  return '<div>' + escHtml_(text).replace(/\n/g, '<br>') + '</div>';
}

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (z) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z];
  });
}

/** Odkaz do Gmailu přes adresu účtu (/u/0/ by v telefonu s víc účty otevřel jiný účet). */
function odkazGmail_(id) {
  const ucet = mojeAdresa_();
  return 'https://mail.google.com/mail/u/' + (ucet ? encodeURIComponent(ucet) : '0') + '/#all/' + id;
}

/** Firemní pošta (WEDOS, IMAP) – soubor zapisuje skript na PC; dokud není, vrací null. */
function nactiFiremni_() {
  try {
    const it = koren_().getFilesByName('POSTA_FIREMNI.json');
    if (!it.hasNext()) return null;
    return JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
  } catch (chyba) {
    return null;
  }
}

/**
 * Seznam adres z hlavičky nebo zadání: '"Novák, Jan" <jan@x.cz>, „Dr. X, Ph.D.“ <x@y.cz>; b@c.cz' → 3 adresy.
 * Čárka a středník dělí jen mimo uvozovky ("…", „…“, “…”), <…> a (…); při nespárovaných uvozovkách nebo
 * závorkách se dělí obyčejně (jinak by se zbytek seznamu slil do jedné adresy).
 */
function rozdelAdresy_(text) {
  const s = String(text || '');
  const vysledek = [];
  let kus = '';
  let uvozovky = ''; // čekaná zavírací uvozovka
  let zavorky = 0;
  for (let i = 0; i < s.length; i++) {
    const z = s.charAt(i);
    if (uvozovky) {
      if (z === '\\' && uvozovky === '"') { kus += z + s.charAt(++i); continue; } // \" uvnitř jména
      if (uvozovky.indexOf(z) >= 0) uvozovky = '';
    } else if (z === '"') {
      uvozovky = '"';
    } else if (z === '„' || z === '“') {
      uvozovky = '“”';
    } else if (z === '<' || z === '(') {
      zavorky++;
    } else if ((z === '>' || z === ')') && zavorky) {
      zavorky--;
    } else if ((z === ',' || z === ';') && !zavorky) {
      if (kus.trim()) vysledek.push(kus.trim());
      kus = '';
      continue;
    }
    kus += z;
  }
  if (uvozovky || zavorky) return s.split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (kus.trim()) vysledek.push(kus.trim());
  return vysledek;
}

/** Jméno z první adresy ('"Novák, Jan" <jan@x.cz>' → Novák, Jan); bez jména adresa. */
function jmeno_(od) {
  const prvni = rozdelAdresy_(od)[0] || '';
  const m = prvni.match(/^([^<]*)<([^>]+)>/);
  if (!m) return prvni;
  const jmeno = m[1].trim().replace(/^["„“”]+|["„“”]+$/g, '').replace(/\\(.)/g, '$1').trim();
  return jmeno || m[2].trim();
}

function adresa_(od) {
  const m = String(od || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(od || '')).trim().toLowerCase();
}

// ---------------------------------------------------------------- Kalendář

function nactiKalendar_(od, doDne, znovu) {
  od = Number(od);
  doDne = Number(doDne);
  if (!(od > 0) || !(doDne > od)) throw new Error('Špatný rozsah kalendáře.');
  if (doDne - od > MAX_ROZSAH_KALENDARE) throw new Error('Příliš velký rozsah kalendáře.');
  const klic = 'kal:' + verzeKalendaru_() + ':' + od + ':' + doDne;
  if (!znovu) {
    const ulozene = nactiZCache_(klic);
    if (ulozene) return ulozene;
  }
  const skryte = skryteKalendare_();
  const udalosti = [];
  const chyby = [];

  CalendarApp.getAllCalendars().forEach(function (kal) {
    let nazev = '?';
    try { // chyba jednoho kalendáře (i jedné události v něm) nesmí shodit ostatní
      if (kal.isHidden() || !kal.isSelected() || skryte.indexOf(kal.getId()) >= 0) return;
      nazev = kal.getName();
      const barva = kal.getColor();
      const kalId = kal.getId();
      const zapis = vlastniKalendar_(kal); // hosty má smysl číst jen u vlastních (jinde je stejně nejde měnit)
      kal.getEvents(new Date(od), new Date(doDne)).forEach(function (u) {
        const celodenni = u.isAllDayEvent();
        const zacatek = (celodenni ? u.getAllDayStartDate() : u.getStartTime()).getTime();
        udalosti.push({
          id: u.getId() + '|' + zacatek,
          nazev: u.getTitle() || '(bez názvu)',
          zacatek: zacatek,
          konec: (celodenni ? u.getAllDayEndDate() : u.getEndTime()).getTime(),
          celodenni: celodenni,
          misto: u.getLocation() || '',
          popis: cistyPopis_(u.getDescription()),
          kalendar: nazev,
          kalendarId: kalId,
          barva: BARVY_UDALOSTI_GOOGLE[u.getColor()] || barva,
          zdroj: 'google',
          opakovana: u.isRecurringEvent(),
          hoste: zapis ? u.getGuestList().map(function (g) { return g.getEmail(); }).slice(0, MAX_HOSTU) : []
        });
      });
    } catch (chyba) {
      chyby.push({ kalendar: nazev, chyba: String(chyba.message || chyba) });
    }
  });

  icsKalendare_().forEach(function (k) {
    if (skryte.indexOf(k.id) >= 0) return;
    try {
      rozbalIcs_(stahniIcs_(k.odkaz, znovu), od, doDne).forEach(function (u) {
        u.kalendar = k.nazev;
        u.kalendarId = k.id;
        u.barva = k.barva;
        u.zdroj = 'icloud';
        udalosti.push(u);
      });
    } catch (chyba) {
      chyby.push({ kalendar: k.nazev, chyba: String(chyba.message || chyba) });
    }
  });

  udalosti.sort(function (a, b) { return (a.zacatek - b.zacatek) || (b.celodenni - a.celodenni); });
  const vysledek = { udalosti: udalosti, chyby: chyby, od: od, do: doDne, ted: Date.now() };
  // i s chybou uložit (kratší dobu) – trvale rozbitý odkaz jinak nutí stahovat všechno pokaždé znovu
  ulozDoCache_(klic, vysledek, chyby.length ? 60 : 300);
  return vysledek;
}

function cistyPopis_(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 3000);
}

function seznamKalendaru_() {
  const skryte = skryteKalendare_();
  const druhy = druhyKalendaru_();
  const google = CalendarApp.getAllCalendars()
    .filter(function (k) { return !k.isHidden() && k.isSelected(); })
    .map(function (k) {
      return { id: k.getId(), nazev: k.getName(), barva: k.getColor(), zdroj: 'google', skryty: skryte.indexOf(k.getId()) >= 0,
        zapis: vlastniKalendar_(k), druh: druhy[k.getId()] || odhadDruhu_(k.getName()) };
    });
  const ics = icsKalendare_().map(function (k) {
    // odkaz se do aplikace nevrací – je to tajemství jako klíč
    return { id: k.id, nazev: k.nazev, barva: k.barva, zdroj: 'icloud', skryty: skryte.indexOf(k.id) >= 0, druh: druhy[k.id] || odhadDruhu_(k.nazev) };
  });
  return google.concat(ics);
}

function pridejKalendar_(nazev, odkaz, barva) {
  odkaz = String(odkaz || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https:\/\/\S+$/i.test(odkaz)) throw new Error('Odkaz musí začínat webcal:// nebo https://');
  const seznam = icsKalendare_();
  if (seznam.some(function (k) { return k.odkaz === odkaz; })) throw new Error('Tenhle kalendář už je přidaný.');
  const text = stahniIcs_(odkaz, true);
  const nazevZIcs = (/^X-WR-CALNAME[^:]*:(.*)$/m.exec(text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '')) || [])[1];
  seznam.push({
    id: 'ics-' + Utilities.getUuid().slice(0, 8),
    nazev: String(nazev || '').trim().slice(0, 60) || (nazevZIcs ? odescapuj_(nazevZIcs.trim()).slice(0, 60) : 'Kalendář z iPhonu'),
    odkaz: odkaz,
    barva: platnaBarva_(barva) || BARVY_KALENDARU[seznam.length % BARVY_KALENDARU.length]
  });
  ulozIcs_(seznam);
  return seznamKalendaru_();
}

function upravKalendar_(id, d) {
  id = String(id || '');
  if (d.druh !== undefined) {
    if (DRUHY_KALENDARU.indexOf(d.druh) < 0) throw new Error('Neznámý druh kalendáře.');
    const druhy = druhyKalendaru_();
    druhy[id] = d.druh;
    ulozDruhy_(druhy);
  }
  if (d.skryty !== undefined) {
    const skryte = skryteKalendare_().filter(function (x) { return x !== id; });
    if (d.skryty) skryte.push(id);
    PropertiesService.getScriptProperties().setProperty('SKRYTE_KALENDARE', JSON.stringify(skryte));
    zvysVerziKalendaru_();
  }
  const seznam = icsKalendare_();
  const k = seznam.filter(function (x) { return x.id === id; })[0];
  if (k && (d.nazev || platnaBarva_(d.barva))) {
    if (d.nazev) k.nazev = String(d.nazev).trim().slice(0, 60);
    if (platnaBarva_(d.barva)) k.barva = d.barva;
    ulozIcs_(seznam);
  }
  return seznamKalendaru_();
}

function odeberKalendar_(id) {
  ulozIcs_(icsKalendare_().filter(function (k) { return k.id !== id; }));
  return seznamKalendaru_();
}

// ---------------------------------------------------------------- Kalendář – zápis
// Zapisuje se jen do vlastních kalendářů Google. Kalendáře z iPhonu (iCloud) jdou přes soukromý odkaz jen číst –
// zápis do iCloudu by chtěl CalDAV s heslem pro aplikace, což Apps Script neumí (chybí metody PROPFIND/REPORT).
// Na iPhonu se kalendáře Google ukážou vedle iCloudu, když se v Nastavení → Kalendář přidá účet Google.

const NAZEV_KALENDARE_ZAPASU = 'Zápasy';
const BARVA_KALENDARE_ZAPASU = '#2e7a4d';
const MAX_DELKA_UDALOSTI = 62 * 864e5;

function vlastniKalendar_(kal) {
  try { return kal.isOwnedByMe(); } catch (chyba) { return false; }
}

function zapisovatelnyKalendar_(id) {
  const kal = id ? CalendarApp.getCalendarById(String(id)) : CalendarApp.getDefaultCalendar();
  if (!kal) throw new Error('Kalendář nenalezen – obnov kalendář v aplikaci.');
  if (!vlastniKalendar_(kal)) throw new Error('Do kalendáře „' + kal.getName() + '“ zapisovat nejde – vyber jiný.');
  return kal;
}

/** Nový vlastní kalendář Google (např. „Zápasy“); když už stejně pojmenovaný existuje, vrátí ten. */
function zalozKalendar_(nazev, barva) {
  nazev = String(nazev || '').trim().slice(0, 60);
  if (!nazev) throw new Error('Doplň název kalendáře.');
  let kal = CalendarApp.getCalendarsByName(nazev).filter(vlastniKalendar_)[0];
  if (!kal) {
    kal = CalendarApp.createCalendar(nazev);
    if (platnaBarva_(barva)) kal.setColor(barva);
  }
  kal.setHidden(false);
  kal.setSelected(true);
  zvysVerziKalendaru_();
  return { id: kal.getId(), kalendare: seznamKalendaru_() };
}

/** Událost podle id z aplikace („iCalUID|začátek v ms“) – i jeden výskyt opakované události. */
function najdiUdalost_(kal, udalost) {
  const s = String(udalost || '');
  const i = s.lastIndexOf('|');
  const ical = i > 0 ? s.slice(0, i) : s;
  const zacatek = Number(s.slice(i + 1));
  if (!ical || !(zacatek > 0)) throw new Error('Neplatná událost.');
  const nalezena = kal.getEvents(new Date(zacatek - 864e5), new Date(zacatek + 2 * 864e5)).filter(function (u) {
    return u.getId() === ical && (u.isAllDayEvent() ? u.getAllDayStartDate() : u.getStartTime()).getTime() === zacatek;
  })[0];
  if (!nalezena) throw new Error('Událost už neexistuje – obnov kalendář.');
  return nalezena;
}

/** Připomenutí v minutách před začátkem (pole); bez pole se nechá výchozí nastavení kalendáře. */
function nastavPripomenuti_(u, minuty) {
  if (!Array.isArray(minuty)) return;
  u.removeAllReminders();
  minuty.slice(0, 5).forEach(function (m) {
    m = Math.round(Number(m));
    if (m >= 0 && m <= 40320) u.addPopupReminder(m);
  });
}

const MAX_HOSTU = 100;

/** Adresy hostů ze zadání (text „a@x.cz, b@y.cz“ nebo pole) – bez duplicit, všechny musí být platné. */
function hosteZeZadani_(hoste) {
  const seznam = (Array.isArray(hoste) ? hoste : String(hoste || '').split(/[,;\s]+/))
    .map(function (a) { return String(a || '').trim().toLowerCase(); }).filter(Boolean);
  const spatna = seznam.filter(function (a) { return !PROSTA_ADRESA.test(a); })[0];
  if (spatna) throw new Error('Neplatná adresa hosta: ' + spatna.slice(0, 80));
  const bezDuplicit = seznam.filter(function (a, i) { return seznam.indexOf(a) === i; });
  if (bezDuplicit.length > MAX_HOSTU) throw new Error('Nejvýš ' + MAX_HOSTU + ' hostů.');
  return bezDuplicit;
}

/** Hostům upravené události pošle krátký e-mail o změně (CalendarApp u úprav pozvánky sám neposílá). */
function posliZmenuHostum_(hoste, nazev, zacatek, konec, celodenni, misto) {
  const kdy = celodenni
    ? Utilities.formatDate(new Date(zacatek), CASOVE_PASMO, 'd. M. yyyy') + (konec - zacatek > 25 * 36e5
      ? ' – ' + Utilities.formatDate(new Date(konec - 864e5), CASOVE_PASMO, 'd. M. yyyy') : '') + ' (celý den)'
    : Utilities.formatDate(new Date(zacatek), CASOVE_PASMO, 'd. M. yyyy H:mm') + ' – ' + Utilities.formatDate(new Date(konec), CASOVE_PASMO, 'H:mm');
  const text = ['Událost „' + nazev + '“ se změnila.', '', 'Kdy: ' + kdy, misto ? 'Kde: ' + misto : '', '',
    'Aktuální podobu najdeš v pozvánce ve svém kalendáři.'].filter(function (r, i, a) { return r || a[i - 1]; }).join('\n');
  GmailApp.sendEmail(hoste.join(','), 'Změna: ' + nazev, text);
}

/**
 * Nová nebo upravená událost. d = { kalendarId, udalost? (id pro úpravu), nazev, celodenni, zacatek, konec (ms; u celodenní
 * půlnoc prvního dne a půlnoc po posledním dni), misto, popis, pripomenuti: [min], barva ('1'–'11'), tydne, tydneDo ('RRRR-MM-DD'),
 * hoste (e-maily), pozvat (nová: Google pošle pozvánky; úprava: e-mail o změně) }
 */
function ulozUdalost_(d) {
  const kal = zapisovatelnyKalendar_(d.kalendarId);
  const nazev = String(d.nazev || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!nazev) throw new Error('Doplň název události.');
  const zacatek = Number(d.zacatek), konec = Number(d.konec);
  if (!(zacatek > 0) || !(konec > zacatek)) throw new Error('Konec musí být po začátku.');
  if (konec - zacatek > MAX_DELKA_UDALOSTI) throw new Error('Událost je moc dlouhá (nejvýš dva měsíce).');
  const celodenni = !!d.celodenni;
  const jedenDen = konec - zacatek <= 25 * 36e5; // celodenní přes změnu času má 23 nebo 25 hodin
  const moznosti = { location: String(d.misto || '').slice(0, 300), description: String(d.popis || '').slice(0, 5000) };
  const hoste = d.hoste === undefined ? null : hosteZeZadani_(d.hoste);
  if (!d.udalost && hoste && hoste.length) {
    moznosti.guests = hoste.join(',');
    moznosti.sendInvites = !!d.pozvat;
  }
  let u;
  if (d.udalost) {
    u = najdiUdalost_(kal, d.udalost);
    u.setTitle(nazev);
    if (celodenni) {
      if (jedenDen) u.setAllDayDate(new Date(zacatek)); else u.setAllDayDates(new Date(zacatek), new Date(konec));
    } else {
      u.setTime(new Date(zacatek), new Date(konec));
    }
    u.setLocation(moznosti.location);
    u.setDescription(moznosti.description);
    if (hoste) {
      const stavajici = u.getGuestList().map(function (g) { return String(g.getEmail()).toLowerCase(); });
      hoste.filter(function (a) { return stavajici.indexOf(a) < 0; }).forEach(function (a) { u.addGuest(a); });
      stavajici.filter(function (a) { return hoste.indexOf(a) < 0; }).forEach(function (a) { u.removeGuest(a); });
      if (d.pozvat && hoste.length) posliZmenuHostum_(hoste, nazev, zacatek, konec, celodenni, moznosti.location);
    }
  } else if (d.tydne) {
    // opakování každý týden (třeba trénink), případně do data včetně
    const pravidlo = CalendarApp.newRecurrence().addWeeklyRule();
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(d.tydneDo || ''))) {
      pravidlo.until(Utilities.parseDate(d.tydneDo + ' 23:59', CASOVE_PASMO, 'yyyy-MM-dd HH:mm'));
    }
    u = celodenni ? kal.createAllDayEventSeries(nazev, new Date(zacatek), pravidlo, moznosti)
      : kal.createEventSeries(nazev, new Date(zacatek), new Date(konec), pravidlo, moznosti);
  } else if (celodenni) {
    u = jedenDen ? kal.createAllDayEvent(nazev, new Date(zacatek), moznosti)
      : kal.createAllDayEvent(nazev, new Date(zacatek), new Date(konec), moznosti);
  } else {
    u = kal.createEvent(nazev, new Date(zacatek), new Date(konec), moznosti);
  }
  nastavPripomenuti_(u, d.pripomenuti);
  if (BARVY_UDALOSTI_GOOGLE[String(d.barva || '')]) u.setColor(String(d.barva));
  zvysVerziKalendaru_();
  return { id: u.getId(), kalendarId: kal.getId() };
}

/** Uložené skupiny hostů (např. „Dorost – rodiče“) – sdílené mezi zařízeními přes vlastnosti skriptu. */
function skupinyHostu_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('SKUPINY_HOSTU') || '[]');
  } catch (chyba) {
    return [];
  }
}

function ulozSkupinyHostu_(skupiny) {
  if (!Array.isArray(skupiny)) throw new Error('Chybí seznam skupin.');
  const cista = skupiny.slice(0, 30).map(function (s) {
    const nazev = String((s && s.nazev) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!nazev) throw new Error('Skupina bez názvu.');
    return { nazev: nazev, adresy: hosteZeZadani_(s.adresy) };
  }).filter(function (s) { return s.adresy.length; });
  const json = JSON.stringify(cista);
  if (json.length > 8500) throw new Error('Skupin a adres je moc – některé zkrať.');
  PropertiesService.getScriptProperties().setProperty('SKUPINY_HOSTU', json);
  return cista;
}

/** Smazání události (u opakované jen tohoto výskytu, s cela = true celé řady). */
function smazUdalost_(kalendarId, udalost, cela) {
  const kal = zapisovatelnyKalendar_(kalendarId);
  const u = najdiUdalost_(kal, udalost);
  if (cela && u.isRecurringEvent()) u.getEventSeries().deleteEventSeries();
  else u.deleteEvent();
  zvysVerziKalendaru_();
  return true;
}

/**
 * Zápasy z rozpisu (veřejný soubor .js nebo .json s řádky { id, date, time, venue, opponent }) do kalendáře „Zápasy“.
 * Každá událost si ve štítku pamatuje id zápasu → opakovaný import jen upraví změněné, nic nezdvojí ani nesmaže.
 * d = { odkaz, tym (např. „dorost“), domaci (např. „Vnorovy“), soutez?, kalendarId?, vcetneOdehranych? }
 */
function importujZapasy_(d) {
  const odkaz = String(d.odkaz || '').trim();
  if (!/^https:\/\/[^\s/]+\/\S+$/i.test(odkaz)) throw new Error('Odkaz na rozpis musí začínat https://');
  const tym = String(d.tym || '').trim().slice(0, 40);
  const domaci = String(d.domaci || '').trim().slice(0, 60);
  if (!domaci) throw new Error('Chybí název domácího týmu.');
  const odpoved = UrlFetchApp.fetch(odkaz, { muteHttpExceptions: true, followRedirects: true });
  if (odpoved.getResponseCode() !== 200) throw new Error('Rozpis nejde stáhnout (HTTP ' + odpoved.getResponseCode() + ').');
  const zapasy = rozpisZapasu_(odpoved.getContentText('UTF-8').slice(0, 500000));
  if (!zapasy.length) throw new Error('V rozpisu jsem nenašel žádné zápasy.');

  const kal = d.kalendarId ? zapisovatelnyKalendar_(d.kalendarId)
    : CalendarApp.getCalendarById(zalozKalendar_(NAZEV_KALENDARE_ZAPASU, BARVA_KALENDARE_ZAPASU).id);
  const dnes = Utilities.parseDate(Utilities.formatDate(new Date(), CASOVE_PASMO, 'yyyy-MM-dd') + ' 00:00', CASOVE_PASMO, 'yyyy-MM-dd HH:mm').getTime();
  const predpona = (tym || 'zapas').toLowerCase().replace(/[^a-z0-9á-ž]+/g, '-') + ':';
  const vybrane = zapasy.map(function (z) {
    const zacatek = Utilities.parseDate(z.datum + ' ' + z.cas, CASOVE_PASMO, 'yyyy-MM-dd HH:mm').getTime();
    return Object.assign({}, z, { zacatek: zacatek, konec: zacatek + 2 * 36e5 });
  }).filter(function (z) { return d.vcetneOdehranych || z.zacatek >= dnes; });

  // už importované zápasy podle štítku
  const existujici = {};
  if (vybrane.length) {
    const od = Math.min.apply(null, vybrane.map(function (z) { return z.zacatek; })) - 40 * 864e5;
    const doDne = Math.max.apply(null, vybrane.map(function (z) { return z.konec; })) + 40 * 864e5;
    kal.getEvents(new Date(od), new Date(doDne)).forEach(function (u) {
      const stitek = u.getTag('asistent');
      if (stitek && stitek.indexOf(predpona) === 0) existujici[stitek] = u;
    });
  }
  const vysledek = { pridano: 0, upraveno: 0, beze_zmeny: 0, kalendar: kal.getName(), kalendarId: kal.getId() };
  vybrane.forEach(function (z) {
    const nazev = '⚽ ' + (z.doma ? domaci + ' – ' + z.souper : z.souper + ' – ' + domaci) + (tym ? ' (' + tym + ')' : '');
    const misto = z.doma ? domaci + ', hřiště' : z.souper;
    const popis = [d.soutez ? String(d.soutez).slice(0, 120) : '', z.doma ? 'Doma' : 'Venku', 'Z rozpisu: ' + odkaz].filter(Boolean).join('\n');
    const stitek = predpona + z.id;
    const u = existujici[stitek];
    if (u) {
      const zmena = u.getTitle() !== nazev || u.getStartTime().getTime() !== z.zacatek || u.getLocation() !== misto;
      if (zmena) {
        u.setTitle(nazev);
        u.setTime(new Date(z.zacatek), new Date(z.konec));
        u.setLocation(misto);
        vysledek.upraveno++;
      } else {
        vysledek.beze_zmeny++;
      }
      return;
    }
    const nova = kal.createEvent(nazev, new Date(z.zacatek), new Date(z.konec), { location: misto, description: popis });
    nova.setTag('asistent', stitek);
    nastavPripomenuti_(nova, [24 * 60, 120]);
    vysledek.pridano++;
  });
  zvysVerziKalendaru_();
  return vysledek;
}

/** Řádky rozpisu z textu souboru: { id, datum 'RRRR-MM-DD', cas 'H:MM', doma, souper } – bez spouštění kódu. */
function rozpisZapasu_(text) {
  const pole = function (blok, nazev) {
    const m = new RegExp('(?:^|[\\s,{])["\']?' + nazev + '["\']?\\s*:\\s*["\']([^"\']*)["\']').exec(blok);
    return m ? m[1].trim() : '';
  };
  const vysledek = [];
  (text.match(/\{[^{}]*\}/g) || []).forEach(function (blok) {
    const z = { id: pole(blok, 'id'), datum: pole(blok, 'date'), cas: pole(blok, 'time'), misto: pole(blok, 'venue'), souper: pole(blok, 'opponent') };
    if (!z.id || !/^\d{4}-\d{2}-\d{2}$/.test(z.datum) || !/^\d{1,2}:\d{2}$/.test(z.cas) || !z.souper) return;
    vysledek.push({ id: z.id.slice(0, 60), datum: z.datum, cas: z.cas, doma: !/venku|away/i.test(z.misto), souper: z.souper.slice(0, 80) });
  });
  return vysledek;
}

function icsKalendare_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('ICS_KALENDARE') || '[]');
  } catch (chyba) {
    return [];
  }
}

function ulozIcs_(seznam) {
  PropertiesService.getScriptProperties().setProperty('ICS_KALENDARE', JSON.stringify(seznam));
  zvysVerziKalendaru_();
}

function skryteKalendare_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty('SKRYTE_KALENDARE') || '[]');
  } catch (chyba) {
    return [];
  }
}

function verzeKalendaru_() {
  return PropertiesService.getScriptProperties().getProperty('VERZE_KALENDARU') || '1';
}

/** Po změně nastavení kalendářů – staré výsledky v mezipaměti se přestanou používat. */
function zvysVerziKalendaru_() {
  const vlastnosti = PropertiesService.getScriptProperties();
  vlastnosti.setProperty('VERZE_KALENDARU', String(Number(vlastnosti.getProperty('VERZE_KALENDARU') || '1') + 1));
}

function platnaBarva_(b) {
  return /^#[0-9a-f]{6}$/i.test(String(b || '')) ? String(b) : '';
}

function stahniIcs_(odkaz, znovu) {
  const klic = 'ics:' + md5_(odkaz);
  if (!znovu) {
    const ulozene = nactiText_(klic);
    if (ulozene) return ulozene;
  }
  const odpoved = UrlFetchApp.fetch(odkaz, { muteHttpExceptions: true, followRedirects: true });
  const kod = odpoved.getResponseCode();
  if (kod !== 200) throw new Error('Kalendář nejde stáhnout (HTTP ' + kod + ').');
  const text = odpoved.getContentText('UTF-8');
  if (text.indexOf('BEGIN:VCALENDAR') < 0) throw new Error('Na odkazu není kalendář.');
  ulozText_(klic, text, 600);
  return text;
}

// ---------------------------------------------------------------- Fotbal: zápasy klubu z fotbal.cz
//
// Web fotbal.cz je za ochranou Cloudflare – servery Googlu ho nestáhnou. Data proto zapisuje naplánovaná úloha Clauda
// (Michalův Chrome, nástroj NASTROJE\fotbal) do CLAUDE_SCHRANKA/FOTBAL.json; motor je jen čte a na přání převede
// zápasy vybraných týmů do vlastních kalendářů Google („⚽ A-tým“…) – štítek s id zápasu, nic se nezdvojí, změna
// termínu nebo výsledek se v kalendáři přepíše. Týmy a soutěže jsou v souboru (klub se mění v nástroji, ne tady).

const BARVY_TYMU = ['#2e7a4d', '#0f7c8c', '#a8620c', '#8e5bd3', '#c0392b'];

function fotbalNastaveni_() {
  let n = {};
  try { n = JSON.parse(PropertiesService.getScriptProperties().getProperty('FOTBAL') || '{}') || {}; } catch (chyba) { n = {}; }
  return { tymy: Array.isArray(n.tymy) ? n.tymy : [], kalendare: n.kalendare || {}, otisk: n.otisk || '' };
}

function ulozFotbalNastaveni_(n) {
  PropertiesService.getScriptProperties().setProperty('FOTBAL', JSON.stringify(n));
}

/** FOTBAL.json ze schránky (zapisuje nástroj fotbal), nebo null. */
function fotbalData_() {
  const it = koren_().getFilesByName('FOTBAL.json');
  if (!it.hasNext()) return null;
  const soubor = it.next();
  let data;
  try { data = JSON.parse(soubor.getBlob().getDataAsString('UTF-8')); } catch (chyba) { throw new Error('FOTBAL.json ve schránce není platný JSON.'); }
  if (!data || !Array.isArray(data.zapasy)) throw new Error('FOTBAL.json nemá seznam zápasů.');
  return data;
}

/**
 * Akce fotbal: zápasy a týmy pro aplikaci; když se data od posledního převodu změnila, rovnou obnoví kalendáře.
 * d.plne = i tabulky soutěží a detaily všech zápasů (stránka Fotbal); jinak jen detail posledního zápasu týmu (Dnes).
 */
function fotbal_(d) {
  const data = fotbalData_();
  const n = fotbalNastaveni_();
  let kalendar = null;
  if (data && n.tymy.length && otiskFotbalu_(data, n.tymy) !== n.otisk) {
    try { kalendar = fotbalDoKalendare_(n.tymy); } catch (chyba) { kalendar = { chyba: String(chyba.message || chyba) }; }
  }
  return { data: data && !(d && d.plne) ? fotbalLehce_(data) : data, vKalendari: n.tymy, kalendar: kalendar };
}

/** Bez tabulek a starších detailů (kratší odpověď pro Dnes): u každého týmu jen detail posledního odehraného zápasu. */
function fotbalLehce_(data) {
  const vysledek = {};
  Object.keys(data).forEach(function (k) { if (k !== 'tabulky' && k !== 'detaily') vysledek[k] = data[k]; });
  const detaily = data.detaily || {};
  const posledni = {};
  data.zapasy.forEach(function (z) { if (z.vysledek && detaily[z.id]) posledni[z.tym] = z.id; }); // zápasy jsou seřazené podle času
  vysledek.detaily = {};
  Object.keys(posledni).forEach(function (t) { vysledek.detaily[posledni[t]] = detaily[posledni[t]]; });
  vysledek.maTabulky = !!(data.tabulky && Object.keys(data.tabulky).length);
  return vysledek;
}

function otiskFotbalu_(data, tymy) {
  return md5_(tymy.join(',') + '|' + JSON.stringify(data.zapasy.map(function (z) { return [z.id, z.zacatek, z.misto, z.vysledek, z.domaci, z.hoste]; })));
}

// ---------------------------------------------------------------- Reely: hotové reely z fotbalu (domácí PC → Disk → aplikace)
//
// Reely se dělají na domácím PC (skill osobni-veo-reely). Nástroj NASTROJE\asistent\reely (export_reely.py) kopíruje
// hotová videa do CLAUDE_SCHRANKA/REELY/videa a zapisuje REELY/reely.json (popisky, zápasy, malé náhledy). Motor k videím
// dohledá soubory na Disku – odkaz otevře jen Michalův účet (v reelech jsou nezletilí hráči, nic se nesdílí veřejně).
// Popisek se v aplikaci jen kopíruje (jediná pravda je popisky\*.txt na PC); stav „zveřejněno“ drží vlastnost REELY_STAV.

const MAX_STAVU_REELU = 150; // vlastnost má limit 9 kB

/** Akce reely: reely z REELY/reely.json s odkazem na video na Disku + co už je zveřejněné (mezipaměť, d.znovu ji obejde). */
function reely_(znovu) {
  const KLIC = 'reely:seznam';
  let data = znovu ? null : nactiZCache_(KLIC);
  if (!data) {
    data = nactiReely_();
    // video se na Disk nahrává chvíli po exportu z PC – dokud tam není, ptát se častěji
    ulozDoCache_(KLIC, data, data.reely.some(function (r) { return r.video && !r.odkaz; }) ? 60 : 300);
  }
  data.zverejneno = stavReelu_();
  return data;
}

function nactiReely_() {
  const it = koren_().getFoldersByName('REELY');
  const slozka = it.hasNext() ? it.next() : null;
  const soubory = slozka ? slozka.getFilesByName('reely.json') : null;
  if (!soubory || !soubory.hasNext()) return { aktualizovano: '', reely: [] };
  let data;
  try { data = JSON.parse(soubory.next().getBlob().getDataAsString('UTF-8')); } catch (chyba) { throw new Error('REELY/reely.json není platný JSON.'); }
  const videa = {};
  const slozkaVidei = slozka.getFoldersByName('videa');
  if (slozkaVidei.hasNext()) {
    const fit = slozkaVidei.next().getFiles();
    while (fit.hasNext()) { const f = fit.next(); videa[f.getName()] = f.getId(); }
  }
  let fotbal = null;
  try { fotbal = fotbalData_(); } catch (chyba) { /* výsledky z fotbal.cz jen doplňují skóre */ }
  return { aktualizovano: String(data.aktualizovano || ''), reely: REELY_.seznam(data.reely, videa, fotbal) };
}

function stavReelu_() {
  try { return JSON.parse(vlastnosti_().getProperty('REELY_STAV') || '{}') || {}; } catch (chyba) { return {}; }
}

/** Akce reelStav: reel je / není na Instagramu. Popisek ani video se nemění. */
function nastavStavReelu_(id, zverejneno) {
  if (!REELY_.platneId(id)) throw new Error('Neplatný reel.');
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    const s = REELY_.zmenStav(stavReelu_(), String(id), !!zverejneno, Utilities.formatDate(new Date(), CASOVE_PASMO, 'yyyy-MM-dd'));
    vlastnosti_().setProperty('REELY_STAV', JSON.stringify(s));
    return { zverejneno: s };
  } finally {
    zamek.releaseLock();
  }
}

/** Čisté funkce reelů (testuje motor.test.js). */
const REELY_ = (function () {
  const ID = /^reel_[0-9a-z_-]{1,80}$/i;
  const NAHLED = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  function txt(x) { return x == null ? '' : String(x); }
  function platneId(id) { return ID.test(txt(id)); }
  function popis(z) { const s = z.skore ? ' ' + z.skore : ''; return z.domaci ? z.domaci + ' – ' + z.hoste + s : z.souper + s; }
  /** Jen očekávaná pole, odkaz na video (soubor na Disku podle názvu), chybějící skóre z FOTBAL.json (id zápasu). */
  function seznam(reely, videa, fotbal) {
    const vysledky = {};
    ((fotbal && fotbal.zapasy) || []).forEach(function (z) { if (z.id && z.vysledek) vysledky[z.id] = z.vysledek; });
    return (Array.isArray(reely) ? reely : []).filter(function (r) { return r && platneId(r.id); }).map(function (r) {
      const zapasy = (Array.isArray(r.zapasy) ? r.zapasy : []).map(function (z) {
        return { datum: txt(z.datum), tym: txt(z.tym), domaci: txt(z.domaci), hoste: txt(z.hoste), souper: txt(z.souper),
          skore: txt(z.skore) || vysledky[txt(z.id)] || '', soutez: txt(z.soutez) };
      });
      const idVidea = r.video ? videa[txt(r.video)] : '';
      return {
        id: r.id, nazev: zapasy.length ? zapasy.map(popis).join(' + ') : txt(r.nazev || r.id), varianta: txt(r.varianta),
        tymy: (Array.isArray(r.tymy) ? r.tymy : r.tym ? [r.tym] : []).map(txt), tymNazev: txt(r.tymNazev),
        datum: txt(r.datum_zapasu), vyrobeno: txt(r.vyrobeno), delka: Number(r.delka_s) || 0, velikost: Number(r.velikost_mb) || 0,
        video: !!r.video, odkaz: idVidea ? 'https://drive.google.com/file/d/' + idVidea + '/view' : '',
        popisek: txt(r.popisek), nahled: NAHLED.test(txt(r.nahled)) ? r.nahled : '', zapasy: zapasy
      };
    });
  }
  /** Zveřejněné reely { id: 'RRRR-MM-DD' } – nejvýš MAX_STAVU_REELU nejnovějších. */
  function zmenStav(stav, id, ano, dnes) {
    const s = Object.assign({}, stav);
    if (ano) s[id] = dnes; else delete s[id];
    Object.keys(s).sort(function (a, b) { return txt(s[b]).localeCompare(txt(s[a])) || a.localeCompare(b); })
      .slice(MAX_STAVU_REELU).forEach(function (k) { delete s[k]; });
    return s;
  }
  return { seznam: seznam, zmenStav: zmenStav, platneId: platneId };
})();

// ---------------------------------------------------------------- Docházka dorostu (Týmuj → web dorostu → tady)
// Web dorostu má synchronizaci z Týmuj (GitHub Actions) a ukládá docházku do Firestore (dokument dochazka/dorost).
// Adresa dokumentu: vlastnost DOCHAZKA_URL, nebo se odvodí z core.js webu dorostu (vlastnost DOCHAZKA_WEB).
// Ven jde jen souhrn: počty u akce + jména chybějících; texty omluv (můžou být zdravotní) se nepředávají.

const DOCHAZKA_WEB_VYCHOZI = 'https://kocismichal.github.io/dorost';

function dochazkaUrl_() {
  const p = vlastnosti_();
  const url = p.getProperty('DOCHAZKA_URL');
  if (url) return url;
  const web = (p.getProperty('DOCHAZKA_WEB') || DOCHAZKA_WEB_VYCHOZI).replace(/\/+$/, '');
  const core = UrlFetchApp.fetch(web + '/assets/js/core.js', { muteHttpExceptions: true });
  if (core.getResponseCode() !== 200) throw new Error('Web dorostu neodpovídá (' + core.getResponseCode() + ').');
  const t = core.getContentText();
  const projekt = (/projectId:\s*"([^"]+)"/.exec(t) || [])[1];
  const app = (/APP_ID\s*=\s*"([^"]+)"/.exec(t) || [])[1];
  if (!projekt || !app) throw new Error('V core.js webu dorostu chybí projectId / APP_ID.');
  return 'https://firestore.googleapis.com/v1/projects/' + projekt + '/databases/(default)/documents/artifacts/' + app + '/public/data/dochazka/dorost';
}

/** Akce dochazka: souhrn akcí za 8 týdnů (z mezipaměti 30 min). */
function dochazka_(znovu) {
  const KLIC = 'dochazka:souhrn';
  if (!znovu) { const c = nactiZCache_(KLIC); if (c) return c; }
  const r = UrlFetchApp.fetch(dochazkaUrl_(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Docházka z webu dorostu není dostupná (' + r.getResponseCode() + ').');
  const doc = JSON.parse(r.getContentText());
  const pole = doc.fields || {};
  const data = JSON.parse((pole.data && pole.data.stringValue) || '{}');
  const ted = Date.now();
  const souhrn = DOCHAZKA_.souhrn(data, ted - 56 * 864e5, ted + 864e5);
  souhrn.aktualizovano = (pole.aktualizovano && (pole.aktualizovano.timestampValue || pole.aktualizovano.stringValue)) || data.aktualizovano || '';
  souhrn.chyba = (pole.chyba && pole.chyba.stringValue) || '';
  ulozDoCache_(KLIC, souhrn, 1800);
  return souhrn;
}

/** Čisté funkce docházky (testuje motor.test.js). Odpovědi Týmuj: G jde, N nejde (s komentářem = omluva), M možná, '' bez odpovědi. */
const DOCHAZKA_ = (function () {
  function souhrn(data, od, doMs) {
    const jmena = {};
    (data.hraci || []).forEach(function (h) { jmena[h.id] = h.jmeno || ''; });
    const udalosti = (data.udalosti || []).filter(function (u) {
      const t = Date.parse(u.zacatek);
      return t >= od && t < doMs;
    }).map(function (u) {
      const p = { prislo: 0, omluveno: 0, neomluveno: 0, mozna: 0, bez: 0, pozvano: 0 };
      const omluveni = [], neomluveni = [];
      Object.keys(u.ucast || {}).forEach(function (id) {
        const o = u.ucast[id] || [];
        const odpoved = o[0] || '';
        p.pozvano++;
        if (odpoved === 'G') p.prislo++;
        else if (odpoved === 'N') {
          if (String(o[1] || '').trim()) { p.omluveno++; omluveni.push(jmena[id] || '?'); } else { p.neomluveno++; neomluveni.push(jmena[id] || '?'); }
        } else if (odpoved === 'M') p.mozna++;
        else p.bez++;
      });
      const abc = function (a, b) { return a.localeCompare(b, 'cs'); };
      return { zacatek: u.zacatek, druh: u.druh || '', nazev: u.nazev || '', zruseno: !!u.zruseno, venku: !!u.venku, pocty: p,
        omluveni: omluveni.sort(abc), neomluveni: neomluveni.sort(abc) };
    });
    return { udalosti: udalosti };
  }
  return { souhrn: souhrn };
})();

/** „FK Agro Vnorovy“ → „Vnorovy“, „TJ Sokol Těšany“ → „Těšany“, „FK Hodonín "B"“ → „Hodonín B“ */
function kratkyKlub_(n) {
  let s = String(n || '').replace(/["„“”]/g, '').replace(/,?\s*z\.\s*s\.?$/i, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(/^(FK|TJ|SK|FC|SFK|MFK|AFC|FKM|SC|1\.\s*FC|1\.\s*SK|Sokol|Agro|Slavoj|Spartak|Baník|Slovan)\s+/i, '');
  return s || String(n || '');
}

/**
 * Zápasy vybraných týmů (klíče z FOTBAL.json, např. „A“, „B“, „dorost“) do kalendářů „⚽ <tým>“. Jen zápasy od 30 dní
 * zpět; odehrané dostanou do názvu výsledek. tymy = [] → nic se nepřevádí (kalendáře zůstanou, jak jsou).
 */
function fotbalDoKalendare_(tymy) {
  const data = fotbalData_();
  if (!data) throw new Error('Zápasy z fotbal.cz ještě nejsou ve schránce (FOTBAL.json).');
  const n = fotbalNastaveni_();
  const platne = (data.tymy || []).map(function (t) { return t.klic; });
  tymy = (tymy || []).filter(function (t) { return platne.indexOf(t) >= 0; });
  const vysledek = { pridano: 0, upraveno: 0, beze_zmeny: 0, kalendare: {} };
  const od = Date.now() - 30 * 864e5;
  const klub = kratkyKlub_(data.klub || '');
  tymy.forEach(function (klic, i) {
    const tym = (data.tymy || []).filter(function (t) { return t.klic === klic; })[0];
    const info = zalozKalendar_('⚽ ' + tym.nazev, tym.barva || BARVY_TYMU[i % BARVY_TYMU.length]);
    const kal = CalendarApp.getCalendarById(info.id);
    vysledek.kalendare[klic] = info.id;
    const zapasy = data.zapasy.filter(function (z) { return z.tym === klic && Date.parse(z.zacatek) >= od; });
    if (!zapasy.length) return;
    const existujici = {};
    const zacatky = zapasy.map(function (z) { return Date.parse(z.zacatek); });
    kal.getEvents(new Date(Math.min.apply(null, zacatky) - 40 * 864e5), new Date(Math.max.apply(null, zacatky) + 40 * 864e5)).forEach(function (u) {
      const stitek = u.getTag('asistent');
      if (stitek && stitek.indexOf('fotbal:') === 0) existujici[stitek] = u;
    });
    zapasy.forEach(function (z) {
      const zacatek = Date.parse(z.zacatek);
      if (isNaN(zacatek)) return;
      const konec = zacatek + (Number(tym.delka) || 120) * 6e4;
      const souper = kratkyKlub_(z.doma ? z.hoste : z.domaci);
      const nazev = '⚽ ' + (z.doma ? klub + ' – ' + souper : souper + ' – ' + klub) + ' (' + tym.nazev + ')' + (z.vysledek ? ' ' + z.vysledek : '');
      const misto = String(z.misto || '');
      const popis = [tym.soutez || '', z.kolo ? z.kolo + '. kolo' : '', z.doma ? 'Doma' : 'Venku', z.puvodniTermin ? 'Přeloženo z ' + z.puvodniTermin : '',
        z.poznamka || '', z.url ? 'fotbal.cz: ' + z.url : ''].filter(Boolean).join('\n');
      const stitek = 'fotbal:' + z.id;
      const u = existujici[stitek];
      if (u) {
        if (u.getTitle() !== nazev || u.getStartTime().getTime() !== zacatek || u.getLocation() !== misto) {
          u.setTitle(nazev);
          u.setTime(new Date(zacatek), new Date(konec));
          u.setLocation(misto);
          u.setDescription(popis);
          vysledek.upraveno++;
        } else {
          vysledek.beze_zmeny++;
        }
        return;
      }
      if (zacatek < Date.now() - 864e5 && !z.vysledek) return; // starý zápas bez výsledku nezakládat
      const nova = kal.createEvent(nazev, new Date(zacatek), new Date(konec), { location: misto, description: popis });
      nova.setTag('asistent', stitek);
      if (zacatek > Date.now()) nastavPripomenuti_(nova, [24 * 60, 120]);
      vysledek.pridano++;
    });
  });
  // druh „fotbal“ pro týmové kalendáře
  const druhy = druhyKalendaru_();
  Object.keys(vysledek.kalendare).forEach(function (k) { druhy[vysledek.kalendare[k]] = 'fotbal'; });
  ulozDruhy_(druhy);
  n.tymy = tymy;
  n.kalendare = Object.assign({}, n.kalendare, vysledek.kalendare);
  n.otisk = otiskFotbalu_(data, tymy);
  ulozFotbalNastaveni_(n);
  zvysVerziKalendaru_();
  vysledek.kalendareSeznam = seznamKalendaru_();
  return vysledek;
}

// ---------------------------------------------------------------- druhy kalendářů (osobní, práce, fotbal, rodina…)

const DRUHY_KALENDARU = ['osobni', 'prace', 'fotbal', 'rodina', 'ostatni'];

function druhyKalendaru_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('DRUHY_KALENDARU') || '{}') || {}; } catch (chyba) { return {}; }
}

function ulozDruhy_(druhy) {
  PropertiesService.getScriptProperties().setProperty('DRUHY_KALENDARU', JSON.stringify(druhy).slice(0, 8000));
}

/** Druh podle názvu, dokud ho Michal nenastaví sám. */
function odhadDruhu_(nazev) {
  const n = String(nazev || '').toLowerCase();
  if (/⚽|fotbal|zápas|zapas|trénink|trenink|dorost|klub|liga/.test(n)) return 'fotbal';
  if (/práce|prace|pracovn|work|firma|kancel|projekt/.test(n)) return 'prace';
  if (/rodin|family|děti|deti|domácnost/.test(n)) return 'rodina';
  if (/svátk|svatk|narozen|holiday/.test(n)) return 'ostatni';
  return 'osobni';
}

// ---------------------------------------------------------------- iCalendar (.ics): čtení a opakované události
// Běží i mimo Apps Script (testy v Node): nic tady nesahá na služby Googlu kromě posunZony_.

const DNY_ICS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
// zóny z pozvánek z Outlooku/Exchange (Windows názvy) → IANA; neznámé = časové pásmo skriptu
const ZONY_WINDOWS = {
  'Central Europe Standard Time': 'Europe/Prague',
  'Central European Standard Time': 'Europe/Warsaw',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'GTB Standard Time': 'Europe/Athens',
  'E. Europe Standard Time': 'Europe/Bucharest',
  'FLE Standard Time': 'Europe/Kiev',
  'Russian Standard Time': 'Europe/Moscow',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'India Standard Time': 'Asia/Kolkata',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'UTC': 'UTC',
  'GMT': 'UTC',
  'Coordinated Universal Time': 'UTC'
};
const MAX_KROKU_OPAKOVANI = 20000;

/** Události z textu .ics, které zasahují do [od, doDne) (ms); opakované rozbalí na jednotlivé výskyty. */
function rozbalIcs_(text, od, doDne) {
  const hlavni = [];
  const vyjimky = {}; // uid → { ms původního výskytu: upravená událost }
  nactiUdalostiIcs_(text).forEach(function (u) {
    if (u.recurrenceId != null) (vyjimky[u.uid] = vyjimky[u.uid] || {})[u.recurrenceId] = u;
    else hlavni.push(u);
  });
  const vysledek = [];
  const videno = {};
  function pridej(v) {
    if (videno[v.id]) return;
    videno[v.id] = true;
    vysledek.push(v);
  }
  hlavni.forEach(function (u) {
    if (u.zruseno) return;
    try {
      vyskyty_(u, od, doDne, vyjimky[u.uid] || {}).forEach(pridej);
    } catch (chyba) { // jedna podivná událost nesmí shodit celý kalendář – ukázat aspoň první výskyt
      if (u.zacatek < doDne && u.konec > od) pridej(vystupIcs_(u, u.zacatek, u.konec));
    }
  });
  Object.keys(vyjimky).forEach(function (uid) {
    Object.keys(vyjimky[uid]).forEach(function (k) {
      const u = vyjimky[uid][k];
      if (!u.zruseno && u.zacatek < doDne && u.konec > od) pridej(vystupIcs_(u, u.zacatek, u.konec));
    });
  });
  return vysledek;
}

function nactiUdalostiIcs_(text) {
  const radky = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const udalosti = [];
  let vlastnosti = null;
  let vnoreni = 0;
  for (let i = 0; i < radky.length; i++) {
    const radek = radky[i];
    const hlava = radek.trim().toUpperCase();
    if (hlava === 'BEGIN:VEVENT') { vlastnosti = {}; vnoreni = 0; continue; }
    if (!vlastnosti) continue;
    if (hlava === 'END:VEVENT') {
      const u = udalostIcs_(vlastnosti);
      if (u) udalosti.push(u);
      vlastnosti = null;
      continue;
    }
    if (hlava.indexOf('BEGIN:') === 0) { vnoreni++; continue; } // např. VALARM uvnitř události
    if (hlava.indexOf('END:') === 0) { vnoreni--; continue; }
    if (vnoreni > 0) continue;
    const p = vlastnostIcs_(radek);
    if (p) (vlastnosti[p.nazev] = vlastnosti[p.nazev] || []).push(p);
  }
  return udalosti;
}

/** „NAZEV;PARAM=hodnota;PARAM2="x:y":hodnota“ → { nazev, parametry, hodnota } */
function vlastnostIcs_(radek) {
  let uvozovky = false;
  let dvojtecka = -1;
  for (let i = 0; i < radek.length; i++) {
    const z = radek.charAt(i);
    if (z === '"') uvozovky = !uvozovky;
    else if (z === ':' && !uvozovky) { dvojtecka = i; break; }
  }
  if (dvojtecka < 0) return null;
  const casti = radek.slice(0, dvojtecka).split(';');
  const parametry = {};
  casti.slice(1).forEach(function (c) {
    const j = c.indexOf('=');
    if (j > 0) parametry[c.slice(0, j).trim().toUpperCase()] = c.slice(j + 1).replace(/^"|"$/g, '');
  });
  return { nazev: casti[0].trim().toUpperCase(), parametry: parametry, hodnota: radek.slice(dvojtecka + 1) };
}

function udalostIcs_(v) {
  const prvni = function (n) { return v[n] ? v[n][0] : null; };
  const text = function (n) { const p = prvni(n); return p ? odescapuj_(p.hodnota).trim() : ''; };
  const dts = prvni('DTSTART');
  if (!dts) return null;
  const start = datumIcs_(dts.hodnota, dts.parametry);
  if (!start) return null;
  const celodenni = start.datum;
  const zacatek = msIcs_(start);

  let trvaniMs = 0;
  let trvaniDni = 0;
  const dte = prvni('DTEND');
  const dur = prvni('DURATION');
  if (dte) {
    const k = datumIcs_(dte.hodnota, dte.parametry);
    if (k && celodenni) trvaniDni = cisloDne_(k.y, k.mo, k.d) - cisloDne_(start.y, start.mo, start.d);
    else if (k) trvaniMs = Math.max(0, msIcs_(k) - zacatek);
  } else if (dur) {
    const ms = trvaniIcs_(dur.hodnota);
    if (celodenni) trvaniDni = Math.round(ms / 864e5); else trvaniMs = Math.max(0, ms);
  }
  if (celodenni && trvaniDni < 1) trvaniDni = 1;

  const exdate = {};
  const exdateDny = {}; // EXDATE;VALUE=DATE u série s časem vynechá celý den
  (v.EXDATE || []).forEach(function (p) {
    p.hodnota.split(',').forEach(function (h) {
      const d = datumIcs_(h, p.parametry);
      if (!d) return;
      exdate[msIcs_(d)] = true;
      if (d.datum) exdateDny[cisloDne_(d.y, d.mo, d.d)] = true;
    });
  });
  const rdate = [];
  (v.RDATE || []).forEach(function (p) {
    if (String(p.parametry.VALUE || '').toUpperCase() === 'PERIOD') return;
    p.hodnota.split(',').forEach(function (h) {
      const d = datumIcs_(h, p.parametry);
      if (d) rdate.push(d);
    });
  });
  const rid = prvni('RECURRENCE-ID');
  const ridDatum = rid ? datumIcs_(rid.hodnota, rid.parametry) : null;
  const status = prvni('STATUS');
  const rrule = prvni('RRULE');

  return {
    uid: text('UID') || ('bez-uid-' + zacatek),
    nazev: text('SUMMARY') || '(bez názvu)',
    misto: text('LOCATION'),
    popis: text('DESCRIPTION').slice(0, 3000),
    zruseno: !!status && status.hodnota.trim().toUpperCase() === 'CANCELLED',
    start: start,
    celodenni: celodenni,
    zacatek: zacatek,
    konec: celodenni ? konecCelodenni_(start, trvaniDni) : zacatek + trvaniMs,
    trvaniMs: trvaniMs,
    trvaniDni: trvaniDni,
    pravidlo: rrule ? pravidloIcs_(rrule.hodnota) : null,
    exdate: exdate,
    exdateDny: exdateDny,
    rdate: rdate,
    recurrenceId: ridDatum ? msIcs_(ridDatum) : null
  };
}

function datumIcs_(hodnota, parametry) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(hodnota).trim());
  if (!m) return null;
  if (!m[4]) return { y: +m[1], mo: +m[2], d: +m[3], h: 0, mi: 0, s: 0, datum: true, tz: null };
  return {
    y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +m[6], datum: false,
    tz: m[7] ? 'UTC' : zona_(parametry && parametry.TZID)
  };
}

/** TZID → název zóny IANA (Europe/Prague); neznámé a „plovoucí“ časy = časové pásmo skriptu. */
function zona_(tzid) {
  if (!tzid) return CASOVE_PASMO;
  const t = String(tzid).trim();
  if (ZONY_WINDOWS[t]) return ZONY_WINDOWS[t];
  const m = /([A-Za-z]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/.exec(t); // i Etc/GMT-3
  return m ? m[1] : CASOVE_PASMO;
}

function msIcs_(d) {
  if (d.datum) return msVZone_(d.y, d.mo, d.d, 0, 0, 0, CASOVE_PASMO);
  if (d.tz === 'UTC') return Date.UTC(d.y, d.mo - 1, d.d, d.h, d.mi, d.s);
  return msVZone_(d.y, d.mo, d.d, d.h, d.mi, d.s, d.tz || CASOVE_PASMO);
}

function konecCelodenni_(start, dni) {
  const k = zCislaDne_(cisloDne_(start.y, start.mo, start.d) + dni);
  return msVZone_(k[0], k[1], k[2], 0, 0, 0, CASOVE_PASMO);
}

/** Čas „na hodinkách“ v zóně tz → ms od 1970 (UTC). Dva průchody kvůli přechodu letního času. */
function msVZone_(y, mo, d, h, mi, s, tz) {
  const jakoUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const prvni = jakoUtc - posunZony_(jakoUtc, tz);
  return jakoUtc - posunZony_(prvni, tz);
}

/**
 * Posun zóny proti UTC v daném okamžiku (ms), např. +2 h v létě v Praze.
 * Během jedné hodiny UTC se posun nemění (přechody času jsou na celé hodiny) → výsledky se pamatují.
 */
const PAMET_POSUNU_ = {};
function posunZony_(ms, tz) {
  if (tz === 'UTC') return 0;
  const klic = tz + '|' + Math.floor(ms / 36e5);
  if (PAMET_POSUNU_[klic] === undefined) PAMET_POSUNU_[klic] = spoctiPosunZony_(ms, tz);
  return PAMET_POSUNU_[klic];
}

function spoctiPosunZony_(ms, tz) {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    const z = Utilities.formatDate(new Date(ms), tz, 'Z'); // „+0200“
    const m = /([+-])(\d{2}):?(\d{2})/.exec(z);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 6e4 : 0;
  }
  try {
    const casti = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    }).formatToParts(new Date(ms)).forEach(function (p) { casti[p.type] = p.value; });
    const mistni = Date.UTC(+casti.year, +casti.month - 1, +casti.day, +casti.hour % 24, +casti.minute, +casti.second);
    return mistni - Math.floor(ms / 1000) * 1000;
  } catch (chyba) {
    return tz === CASOVE_PASMO ? 0 : posunZony_(ms, CASOVE_PASMO);
  }
}

function trvaniIcs_(s) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(s).trim());
  if (!m) return 0;
  const ms = (((Number(m[2] || 0) * 7 + Number(m[3] || 0)) * 24 + Number(m[4] || 0)) * 60 + Number(m[5] || 0)) * 6e4 +
    Number(m[6] || 0) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function odescapuj_(s) {
  return String(s).replace(/\\([\\;,nN])/g, function (_, z) { return z === 'n' || z === 'N' ? '\n' : z; });
}

function pravidloIcs_(hodnota) {
  const p = {};
  String(hodnota).split(';').forEach(function (c) {
    const j = c.indexOf('=');
    if (j > 0) p[c.slice(0, j).trim().toUpperCase()] = c.slice(j + 1).trim();
  });
  const cisla = function (s) {
    if (!s) return null;
    const a = s.split(',').map(Number).filter(function (n) { return !isNaN(n) && n !== 0; });
    return a.length ? a : null;
  };
  const byday = p.BYDAY ? p.BYDAY.split(',').map(function (x) {
    const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim());
    return m ? { poradi: m[1] ? Number(m[1]) : 0, den: DNY_ICS[m[2].toUpperCase()] } : null;
  }).filter(Boolean) : [];
  const wkst = DNY_ICS[String(p.WKST || 'MO').toUpperCase()];
  return {
    freq: String(p.FREQ || '').toUpperCase(),
    interval: Math.max(1, Number(p.INTERVAL) || 1),
    count: p.COUNT ? Number(p.COUNT) : null,
    until: p.UNTIL ? datumIcs_(p.UNTIL, null) : null,
    byday: byday.length ? byday : null,
    bymonthday: cisla(p.BYMONTHDAY),
    bymonth: cisla(p.BYMONTH),
    bysetpos: cisla(p.BYSETPOS),
    wkst: wkst == null ? 1 : wkst
  };
}

/** Výskyty jedné události (i opakované) v rozsahu [od, doDne). */
function vyskyty_(u, od, doDne, vyjimky) {
  const vysledek = [];
  const r = u.pravidlo;
  if (!r || ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(r.freq) < 0) {
    if (u.zacatek < doDne && u.konec > od && !u.exdate[u.zacatek] && !vyjimky[u.zacatek]) {
      vysledek.push(vystupIcs_(u, u.zacatek, u.konec));
    }
    pridejRdate_(u, od, doDne, vyjimky, vysledek);
    return vysledek;
  }

  const s = u.start;
  const startDen = cisloDne_(s.y, s.mo, s.d);
  const rezerva = (u.celodenni ? u.trvaniDni : Math.ceil(u.trvaniMs / 864e5)) + 2;
  const odDen = cisloDneZMs_(od) - rezerva; // výskyty začínající dřív nemůžou zasáhnout do rozsahu – jen se počítají
  const untilMs = r.until ? (r.until.datum ? konecCelodenni_(r.until, 1) - 1 : msIcs_(r.until)) : Infinity;
  const untilDen = r.until ? cisloDne_(r.until.y, r.until.mo, r.until.d) + 1 : Infinity;
  let pocet = 0;

  // vrací false = dál negenerovat
  function zkus(den) {
    if (den > untilDen) return false;
    pocet++;
    if (r.count != null && pocet > r.count) return false;
    if (den < odDen) return true;
    const ymd = zCislaDne_(den);
    const zac = casVyskytu_(u, ymd);
    if (zac > untilMs || zac >= doDne) return false;
    const kon = u.celodenni ? konecCelodenni_({ y: ymd[0], mo: ymd[1], d: ymd[2] }, u.trvaniDni) : zac + u.trvaniMs;
    if (kon > od && !u.exdate[zac] && !u.exdateDny[den] && !vyjimky[zac]) vysledek.push(vystupIcs_(u, zac, kon));
    return true;
  }
  function dalsi(den) { return den <= startDen ? true : zkus(den); }
  // Bez COUNT se výskyty před rozsahem nemusí počítat → skočit rovnou těsně před rozsah
  // (jinak by denní série z roku 1990 spotřebovala limit kroků dřív, než dojde do dneška).
  const skok = r.count == null && odDen > startDen;
  const mesicuOdStartu = function () {
    const o = zCislaDne_(odDen);
    return (o[0] - s.y) * 12 + (o[1] - s.mo);
  };

  let kroku = 0;
  if (zkus(startDen)) { // DTSTART je vždy první výskyt
    if (r.freq === 'DAILY') {
      let den = startDen + r.interval;
      if (skok) den = Math.max(den, startDen + Math.floor((odDen - startDen) / r.interval) * r.interval);
      for (; kroku++ < MAX_KROKU_OPAKOVANI; den += r.interval) {
        if (!vyhovujeDen_(r, den)) continue;
        if (!dalsi(den)) break;
      }
    } else if (r.freq === 'WEEKLY') {
      const dnyTydne = r.byday ? r.byday.map(function (b) { return b.den; }) : [denTydne_(startDen)];
      let tyden = startDen - ((denTydne_(startDen) - r.wkst + 7) % 7);
      if (skok) tyden += Math.max(0, Math.floor((odDen - tyden) / (7 * r.interval)) - 1) * 7 * r.interval;
      tydny: for (; kroku++ < MAX_KROKU_OPAKOVANI; tyden += 7 * r.interval) {
        const dny = unikatniSerazene_(dnyTydne.map(function (dt) { return tyden + ((dt - r.wkst + 7) % 7); }));
        for (let i = 0; i < dny.length; i++) {
          if (r.bymonth && r.bymonth.indexOf(zCislaDne_(dny[i])[1]) < 0) continue;
          if (!dalsi(dny[i])) break tydny;
        }
      }
    } else if (r.freq === 'MONTHLY') {
      let y = s.y;
      let mo = s.mo;
      if (skok) {
        const preskocit = Math.max(0, Math.floor(mesicuOdStartu() / r.interval) - 1) * r.interval;
        mo += preskocit;
        y += Math.floor((mo - 1) / 12);
        mo = ((mo - 1) % 12) + 1;
      }
      mesice: for (; kroku++ < MAX_KROKU_OPAKOVANI;) {
        if (!r.bymonth || r.bymonth.indexOf(mo) >= 0) {
          const dny = dnyMesice_(r, y, mo, s.d, true);
          for (let i = 0; i < dny.length; i++) if (!dalsi(dny[i])) break mesice;
        }
        mo += r.interval;
        while (mo > 12) { mo -= 12; y++; }
      }
    } else { // YEARLY
      let rok = s.y;
      if (skok) rok += Math.max(0, Math.floor((zCislaDne_(odDen)[0] - s.y) / r.interval) - 1) * r.interval;
      roky: for (let y = rok; kroku++ < MAX_KROKU_OPAKOVANI; y += r.interval) {
        let dny = [];
        (r.bymonth || [s.mo]).forEach(function (mo) {
          if (r.byday || r.bymonthday) dny = dny.concat(dnyMesice_(r, y, mo, s.d, false));
          else if (s.d <= dniMesice_(y, mo)) dny.push(cisloDne_(y, mo, s.d)); // 29. 2. jen v přestupném roce
        });
        dny = unikatniSerazene_(dny);
        if (r.bysetpos) dny = vyberPozice_(dny, r.bysetpos);
        for (let i = 0; i < dny.length; i++) if (!dalsi(dny[i])) break roky;
      }
    }
  }
  pridejRdate_(u, od, doDne, vyjimky, vysledek);
  return vysledek;
}

function casVyskytu_(u, ymd) {
  const s = u.start;
  if (s.datum) return msVZone_(ymd[0], ymd[1], ymd[2], 0, 0, 0, CASOVE_PASMO);
  if (s.tz === 'UTC') return Date.UTC(ymd[0], ymd[1] - 1, ymd[2], s.h, s.mi, s.s);
  return msVZone_(ymd[0], ymd[1], ymd[2], s.h, s.mi, s.s, s.tz || CASOVE_PASMO);
}

function pridejRdate_(u, od, doDne, vyjimky, vysledek) {
  u.rdate.forEach(function (d) {
    const zac = msIcs_(d);
    if (u.exdate[zac] || vyjimky[zac]) return;
    const kon = u.celodenni ? konecCelodenni_(d, u.trvaniDni) : zac + u.trvaniMs;
    if (zac < doDne && kon > od) vysledek.push(vystupIcs_(u, zac, kon));
  });
}

function vyhovujeDen_(r, den) {
  const ymd = zCislaDne_(den);
  if (r.bymonth && r.bymonth.indexOf(ymd[1]) < 0) return false;
  if (r.bymonthday) {
    const n = dniMesice_(ymd[0], ymd[1]);
    if (!r.bymonthday.some(function (md) { return (md > 0 ? md : n + md + 1) === ymd[2]; })) return false;
  }
  if (r.byday && !r.byday.some(function (b) { return b.den === denTydne_(den); })) return false;
  return true;
}

/** Dny měsíce podle BYDAY / BYMONTHDAY (nebo den startu) jako čísla dnů, seřazené. */
function dnyMesice_(r, y, mo, vychozi, sPozici) {
  const n = dniMesice_(y, mo);
  let dny = [];
  if (r.byday) {
    r.byday.forEach(function (b) {
      const vsechny = [];
      for (let d = 1; d <= n; d++) if (denTydne_(cisloDne_(y, mo, d)) === b.den) vsechny.push(d);
      if (b.poradi) {
        const x = b.poradi > 0 ? vsechny[b.poradi - 1] : vsechny[vsechny.length + b.poradi];
        if (x) dny.push(x);
      } else {
        dny = dny.concat(vsechny);
      }
    });
    if (r.bymonthday) {
      dny = dny.filter(function (d) { return r.bymonthday.some(function (md) { return (md > 0 ? md : n + md + 1) === d; }); });
    }
  } else if (r.bymonthday) {
    r.bymonthday.forEach(function (md) {
      const d = md > 0 ? md : n + md + 1;
      if (d >= 1 && d <= n) dny.push(d);
    });
  } else if (vychozi <= n) {
    dny.push(vychozi);
  }
  let vysledek = unikatniSerazene_(dny.map(function (d) { return cisloDne_(y, mo, d); }));
  if (sPozici && r.bysetpos) vysledek = vyberPozice_(vysledek, r.bysetpos);
  return vysledek;
}

function vyberPozice_(dny, pozice) {
  return unikatniSerazene_(pozice.map(function (p) { return p > 0 ? dny[p - 1] : dny[dny.length + p]; })
    .filter(function (x) { return x != null; }));
}

function unikatniSerazene_(a) {
  return a.filter(function (x, i) { return a.indexOf(x) === i; }).sort(function (p, q) { return p - q; });
}

function vystupIcs_(u, zacatek, konec) {
  return {
    id: u.uid + '|' + zacatek,
    nazev: u.nazev,
    zacatek: zacatek,
    konec: konec,
    celodenni: u.celodenni,
    misto: u.misto,
    popis: u.popis
  };
}

// čísla dnů: 0 = 1. 1. 1970 (kalendářní den bez časové zóny)
function cisloDne_(y, mo, d) { return Math.floor(Date.UTC(y, mo - 1, d) / 864e5); }
function zCislaDne_(n) {
  const t = new Date(n * 864e5);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}
function denTydne_(n) { return (((n % 7) + 7) + 4) % 7; } // 0 = neděle; den 0 byl čtvrtek
function dniMesice_(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate(); }
function cisloDneZMs_(ms) { return Math.floor((ms + posunZony_(ms, CASOVE_PASMO)) / 864e5); }

// ---------------------------------------------------------------- Počasí: ČHMÚ (otevřená data, licence CC BY 4.0 → „Zdroj: ČHMÚ“)
//
// Jen to důležité pro jedno místo: výstrahy ČHMÚ (počasí, povodně, smog) pro ORP, vodní stav řeky s povodňovými
// stupni (SPA) a krátká předpověď kraje na dnes až tři dny dopředu. Místo je ve vlastnosti skriptu POCASI
// (JSON se stejnými klíči jako POCASI_VYCHOZI – stačí ty, které se mění).
// Šetrně k serverům ČHMÚ: výstrahy (~2 MB) a vodní stavy se stahují podmíněně (ETag → 304 bez dat), výpis
// předpovědí nejvýš jednou za hodinu a soubor jen při změně názvu; hotový přehled drží mezipaměť 15 minut.

const POCASI_VYCHOZI = {
  misto: 'Veselí nad Moravou',
  orp: { '6218': 'Veselí nad Moravou' },           // ORP (kód CISORP z výstrah ČHMÚ) → název
  stanice: ['0-203-1-421500', '0-203-1-413000'],    // vodoměrné stanice (objID z hydro.chmi.cz): Morava – Strážnice, Spytihněv
  kraj: 'RPJM',                                     // textové předpovědi: RPJM = Jihomoravský kraj
  dny: ['0', '1', '2', '3']                         // pCK0 dnes … pCK3 za tři dny
};
const POCASI_URL = {
  cap: 'https://vystrahy-cr.chmi.cz/data2/XOCZ50_OKPR.xml',
  capArchiv: 'https://opendata.chmi.cz/meteorology/weather/alerts/cap/',
  hydroMeta: 'https://opendata.chmi.cz/hydrology/now/metadata/meta1.json',
  hydroData: 'https://opendata.chmi.cz/hydrology/now/data/',
  predpovedi: 'https://opendata.chmi.cz/meteorology/weather/forecast/now/'
};
const POCASI_SEKUND = 900;       // hotový přehled
const POCASI_HORIZONT_H = 48;    // výstrahy, které začnou do 48 hodin

function nastaveniPocasi_() {
  const n = JSON.parse(JSON.stringify(POCASI_VYCHOZI));
  const vlastni = PropertiesService.getScriptProperties().getProperty('POCASI');
  if (vlastni) {
    let v = null;
    try { v = JSON.parse(vlastni); } catch (chyba) { throw new Error('Vlastnost POCASI není platný JSON.'); }
    Object.keys(n).forEach(function (k) { if (v && v[k] != null) n[k] = v[k]; });
  }
  return n;
}

/** Název místa pro aplikaci (chybná vlastnost POCASI nesmí shodit info). */
function mistoPocasi_() {
  try { return nastaveniPocasi_().misto; } catch (chyba) { return ''; }
}

/**
 * Přehled pro aplikaci; znovu = obejít hotový přehled (stahuje se dál podmíněně).
 * poloha = {lat, lon} z telefonu (aplikace ji pošle jen se zapnutým „Počasí podle polohy“) → výstrahy pro ORP v místě,
 * nejbližší řeka a předpověď kraje; bez polohy (nebo mimo ČR) místo z POCASI. Upozornění bez polohy použijí
 * poslední polohu z aplikace, když není starší než den.
 */
function pocasi_(znovu, poloha) {
  let p = polohaPocasi_(poloha);
  if (p) vlastnosti_().setProperty('POCASI_POLOHA', JSON.stringify({ lat: p.lat, lon: p.lon, kdy: Date.now() }));
  else if (poloha === undefined) p = posledniPoloha_(); // upozornění: poslední poloha z aplikace (nejvýš den stará)
  else if (vlastnosti_().getProperty('POCASI_POLOHA')) vlastnosti_().deleteProperty('POCASI_POLOHA'); // poloha vypnutá
  let n = null, chybaPolohy = '';
  if (p) { try { n = nastaveniZPolohy_(p); } catch (chyba) { chybaPolohy = String(chyba.message || chyba); } }
  if (!n) n = nastaveniPocasi_();
  const klic = n.poloha ? 'pocasi:prehled:' + klicMista_(n) : 'pocasi:prehled';
  if (!znovu) {
    const hotovo = nactiZCache_(klic);
    if (hotovo) return hotovo;
  }
  const ted = Date.now();
  const chyby = [];
  if (chybaPolohy) chyby.push('poloha (' + chybaPolohy + ') – ukazuju výchozí místo');
  let cap = [], reky = [], predpovedi = [];
  try { cap = vystrahyChmu_(n); } catch (chyba) { chyby.push('výstrahy (' + chyba.message + ')'); }
  try { reky = rekyChmu_(n, ted); } catch (chyba) { chyby.push('vodní stavy (' + chyba.message + ')'); }
  try { predpovedi = predpovediChmu_(n); } catch (chyba) { chyby.push('předpověď (' + chyba.message + ')'); }
  const prehled = CHMU_.prehled({ cap: cap, reky: reky, predpovedi: predpovedi }, ted, n);
  if (n.poloha) prehled.podlePolohy = true;
  if (chyby.length) prehled.chyby = chyby;
  ulozDoCache_(klic, prehled, chyby.length ? 300 : POCASI_SEKUND);
  return prehled;
}

// ---- počasí podle polohy: ORP z ČÚZK (RÚIAN), kód výstrah CISORP, kraj předpovědi, nejbližší vodoměrné stanice
const CUZK_RUIAN = 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/';
// kód ORP v RÚIAN → kód CISORP ve výstrahách ČHMÚ (ČSÚ číselník 65; Praha je ve výstrahách 1100)
const RUIAN_CISORP = {19:1100,27:2101,35:2125,43:2126,51:2102,60:2108,78:2109,86:2124,94:2110,108:2106,116:2112,124:2104,132:2111,141:2114,159:2117,167:2115,175:2116,183:2113,191:2118,205:2119,213:2103,221:2122,230:2105,248:2107,256:2120,264:2121,272:2123,281:3101,299:3102,302:3103,311:3104,329:3105,337:3106,345:3107,353:3108,361:3109,370:3110,388:3111,396:3112,400:3113,418:3114,426:3115,434:3116,442:3117,451:3201,469:3202,477:3203,485:3204,493:3205,507:3206,515:3207,523:3208,531:3209,540:3210,558:3211,566:3212,574:3213,582:3214,591:3215,604:4101,612:4102,621:4103,639:4104,647:4105,655:4106,663:4107,671:4201,680:4202,698:4203,701:4204,710:4205,728:4206,736:4207,744:4208,752:4209,761:4210,779:4211,787:4212,795:4213,809:4214,817:4215,825:4216,833:5101,841:5102,850:5103,868:5104,876:5105,884:5106,892:5107,906:5108,914:5109,922:5110,931:5201,949:5202,957:5203,965:5204,973:5205,981:5206,990:5207,1007:5208,1015:5209,1023:5210,1031:5211,1040:5212,1058:5213,1066:5214,1074:5215,1082:5301,1091:5302,1104:5303,1112:5304,1121:5305,1139:5306,1147:5307,1155:5308,1163:5309,1171:5310,1180:5311,1198:5312,1201:5313,1210:5314,1228:5315,1236:6101,1244:6102,1252:6103,1261:6104,1279:6105,1287:6106,1295:6107,1309:6108,1317:6203,1325:6201,1333:6202,1341:6204,1350:6205,1368:6206,1376:6207,1384:6208,1392:6209,1406:6210,1414:6211,1422:6212,1431:6213,1449:6214,1457:6215,1465:6216,1473:6217,1481:6219,1490:6218,1503:6220,1511:6221,1520:6109,1538:6110,1546:6111,1554:6112,1562:6113,1571:6114,1589:6115,1597:7101,1601:7102,1619:7103,1627:7104,1635:7105,1643:7106,1651:7107,1660:7108,1678:7109,1686:7110,1694:7111,1708:7112,1716:7113,1724:7201,1732:7202,1741:7203,1759:7204,1767:7205,1775:7206,1783:7207,1791:7208,1805:7209,1813:7210,1821:7211,1830:7212,1848:7213,1856:8101,1864:8102,1872:8103,1881:8104,1899:8105,1902:8106,1911:8107,1929:8108,1937:8109,1945:8110,1953:8111,1961:8112,1970:8113,1988:8114,1996:8115,2003:8116,2011:8117,2020:8118,2038:8119,2046:8120,2054:8121,2062:8122};
const KRAJ_PREDPOVEDI = { 11: 'RPPH', 21: 'RPSC', 31: 'RPCB', 32: 'RPPL', 41: 'RPKV', 42: 'RPUL', 51: 'RPLB', 52: 'RPHK', 53: 'RPPU',
  61: 'RPVY', 62: 'RPJM', 71: 'RPOL', 72: 'RPZL', 81: 'RPMS' };

/** Poloha z aplikace zaokrouhlená na 0,01° (~1 km); mimo ČR (nebo nesmysl) → null. */
function polohaPocasi_(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Math.round(Number(p.lat) * 100) / 100, lon = Math.round(Number(p.lon) * 100) / 100;
  return lat > 48.5 && lat < 51.1 && lon > 12 && lon < 18.9 ? { lat: lat, lon: lon } : null;
}

function posledniPoloha_() {
  try {
    const p = JSON.parse(vlastnosti_().getProperty('POCASI_POLOHA') || 'null');
    return p && Date.now() - p.kdy < 864e5 ? polohaPocasi_(p) : null;
  } catch (chyba) { return null; }
}

function klicMista_(n) { return Object.keys(n.orp).join(',') + '|' + n.kraj + '|' + (n.stanice || []).join(','); }

function cuzkBod_(vrstva, p) {
  const r = UrlFetchApp.fetch(CUZK_RUIAN + vrstva + '/query?geometry=' + p.lon + ',' + p.lat +
    '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=kod,nazev&returnGeometry=false&f=json', { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('ČÚZK neodpovídá (' + r.getResponseCode() + ')');
  const f = (JSON.parse(r.getContentText()).features || [])[0];
  return f ? f.attributes : null;
}

/** Nastavení počasí pro polohu (jako POCASI_VYCHOZI); místa se pamatují ve vlastnosti POCASI_MISTA (posledních 20). */
function nastaveniZPolohy_(p) {
  const vl = vlastnosti_();
  const k = p.lat.toFixed(2) + ',' + p.lon.toFixed(2);
  let mista = {};
  try { mista = JSON.parse(vl.getProperty('POCASI_MISTA') || '{}') || {}; } catch (chyba) { mista = {}; }
  let m = mista[k];
  if (!m) {
    const orp = cuzkBod_(14, p);
    if (!orp || !RUIAN_CISORP[orp.kod]) throw new Error('místo mimo ORP');
    const obec = cuzkBod_(12, p);
    const cisorp = RUIAN_CISORP[orp.kod];
    m = { misto: (obec && obec.nazev) || orp.nazev, orp: [String(cisorp), orp.nazev], kraj: KRAJ_PREDPOVEDI[Math.floor(cisorp / 100)] || POCASI_VYCHOZI.kraj,
      stanice: nejblizsiStanice_(p), kdy: Date.now() };
    mista[k] = m;
    const klice = Object.keys(mista).sort(function (a, b) { return mista[b].kdy - mista[a].kdy; });
    klice.slice(20).forEach(function (x) { delete mista[x]; });
    vl.setProperty('POCASI_MISTA', JSON.stringify(mista));
  }
  const orpMapa = {};
  orpMapa[m.orp[0]] = m.orp[1];
  return { misto: m.misto, orp: orpMapa, stanice: m.stanice, kraj: m.kraj, dny: POCASI_VYCHOZI.dny, poloha: p };
}

/** Dvě nejbližší vodoměrné stanice s povodňovými stupni (SPA) do 30 km – seznam stanic z meta1.json (podmíněně, 6 h). */
function nejblizsiStanice_(p) {
  const stanice = stahniPodminene_(POCASI_URL.hydroMeta, 'pocasi:stanice', function (t) { return CHMU_.staniceSouradnice(t); });
  return CHMU_.nejblizsi(stanice, p.lat, p.lon, 30, 2);
}

function hlavickaOdpovedi_(hlavicky, jmeno) {
  for (const k in hlavicky) if (k.toLowerCase() === jmeno) return String(hlavicky[k]);
  return '';
}

/**
 * Podmíněné stažení: v mezipaměti drží {etag, zmena, data}, kde data je UŽ ZPRACOVANÝ (malý) výsledek.
 * Odpověď 304 → vrátí uložená data bez stahování a bez zpracování.
 */
function stahniPodminene_(url, klic, zpracuj, sekund) {
  const ulozeno = nactiZCache_(klic);
  const hlavicky = {};
  if (ulozeno && ulozeno.etag) hlavicky['If-None-Match'] = ulozeno.etag;
  if (ulozeno && ulozeno.zmena) hlavicky['If-Modified-Since'] = ulozeno.zmena;
  const odpoved = UrlFetchApp.fetch(url, { headers: hlavicky, muteHttpExceptions: true, followRedirects: true });
  const kod = odpoved.getResponseCode();
  if (kod === 304 && ulozeno) return ulozeno.data;
  if (kod !== 200) throw new Error('HTTP ' + kod);
  const h = odpoved.getAllHeaders();
  const data = zpracuj(odpoved.getContentText('UTF-8')); // ČHMÚ znakovou sadu neposílá – vždy UTF-8
  ulozDoCache_(klic, { etag: hlavickaOdpovedi_(h, 'etag'), zmena: hlavickaOdpovedi_(h, 'last-modified'), data: data }, sekund || 21600);
  return data;
}

function vystrahyChmu_(n) {
  const zpracuj = function (xml) { return CHMU_.vystrahy(xml, n.orp).polozky; };
  try {
    return stahniPodminene_(POCASI_URL.cap, 'pocasi:cap' + (n.poloha ? ':' + Object.keys(n.orp).join(',') : ''), zpracuj);
  } catch (chyba) {
    // záloha: archiv na opendata – názvy souborů mají jen DDHHMM, nejnovější určí čas ve výpisu
    const vypis = UrlFetchApp.fetch(POCASI_URL.capArchiv, { muteHttpExceptions: true });
    if (vypis.getResponseCode() !== 200) throw chyba;
    const soubor = CHMU_.nejnovejsi(vypis.getContentText('UTF-8'), /^alert_cap_50_\d{6}\.xml$/);
    if (!soubor) throw chyba;
    return stahniPodminene_(POCASI_URL.capArchiv + soubor.nazev, 'pocasi:cap2' + (n.poloha ? ':' + Object.keys(n.orp).join(',') : ''), zpracuj);
  }
}

function rekyChmu_(n, ted) {
  if (!n.stanice || !n.stanice.length) return [];
  const meta = stahniPodminene_(POCASI_URL.hydroMeta, 'pocasi:hmeta' + (n.poloha ? ':' + n.stanice.join(',') : ''), function (t) { return CHMU_.hydroMeta(t, n.stanice); });
  return n.stanice.map(function (id) {
    // soubor stanice (~20 kB) se drží celý – vyhodnocuje se pokaždé s aktuálním časem
    const text = stahniPodminene_(POCASI_URL.hydroData + encodeURIComponent(id) + '.json', 'pocasi:h:' + id, function (t) { return t; }, 7200);
    return CHMU_.reka(text, meta, ted);
  }).filter(function (r) { return r; });
}

function predpovediChmu_(n) {
  const klic = 'pocasi:predpovedi' + (n.poloha ? ':' + n.kraj : '');
  const hotovo = nactiZCache_(klic);
  if (hotovo) return hotovo;
  const vypis = UrlFetchApp.fetch(POCASI_URL.predpovedi, { muteHttpExceptions: true });
  if (vypis.getResponseCode() !== 200) throw new Error('HTTP ' + vypis.getResponseCode());
  const html = vypis.getContentText('UTF-8');
  const drive = nactiZCache_('pocasi:psoubory') || {}; // název souboru → zpracovaná předpověď
  const nove = {};
  const vysledek = [];
  n.dny.forEach(function (d) {
    const soubor = CHMU_.nejnovejsi(html, new RegExp('^web_pCK' + d + 'tx_' + n.kraj + '_\\d{6}(_CC[A-Z])?\\.json$'));
    if (!soubor) return;
    let p = drive[soubor.nazev];
    if (!p) {
      const r = UrlFetchApp.fetch(POCASI_URL.predpovedi + soubor.nazev, { muteHttpExceptions: true });
      if (r.getResponseCode() !== 200) return;
      p = CHMU_.predpoved(r.getContentText('UTF-8'));
    }
    nove[soubor.nazev] = p;
    vysledek.push(p);
  });
  ulozDoCache_('pocasi:psoubory', nove, 21600);
  ulozDoCache_(klic, vysledek, 3600); // výpis znovu nejdřív za hodinu
  return vysledek;
}

/** Ruční zkouška v editoru Apps Scriptu (▶ Spustit): vypíše přehled do protokolu. */
function zkusPocasi() {
  ['pocasi:prehled', 'pocasi:predpovedi'].forEach(smazCache_);
  const p = pocasi_(true);
  Logger.log(p.souhrn);
  p.vystrahy.forEach(function (v) { Logger.log('[' + v.uroven + '] ' + v.nazev + ' · ' + v.text); });
  p.reky.forEach(function (r) { Logger.log(r.nazev + ': ' + r.text); });
  p.predpovedi.forEach(function (x) { Logger.log(x.nazev + ': ' + x.uvod + ' · ' + JSON.stringify(x.tMax)); });
  if (p.chyby) Logger.log('CHYBY: ' + p.chyby.join(' | '));
}

/**
 * Zpracování souborů ČHMÚ – čisté funkce bez stahování (testuje apps-script/test/motor.test.js na skutečných
 * vzorcích). Výstrahy: CAP 1.2 (SIVS + HPPS + SVRS), vodní stavy: hydrology/now, předpovědi: forecast/now.
 */
const CHMU_ = (function () {
  const PORADI = { fialova: 6, cervena: 5, oranzova: 4, zluta: 3, vyhled: 2, info: 1, zelena: 0 };
  const HODINA = 36e5;

  function dekoduj(s) {
    if (s == null) return '';
    s = String(s).replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
    return s.replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&').trim();
  }
  /** první <jmeno>…</jmeno> v bloku (CAP atributy u těchto prvků nepoužívá) */
  function prvek(blok, jmeno) {
    const m = new RegExp('<' + jmeno + '>([\\s\\S]*?)</' + jmeno + '>').exec(blok);
    return m ? dekoduj(m[1]) : '';
  }
  function prvky(blok, jmeno) {
    const re = new RegExp('<' + jmeno + '>([\\s\\S]*?)</' + jmeno + '>', 'g');
    const vysledek = [];
    let m;
    while ((m = re.exec(blok)) !== null) vysledek.push(m[1]);
    return vysledek;
  }
  /** dvojice valueName/value v prvcích parameter, eventCode, geocode */
  function pary(blok, jmeno) {
    const vysledek = {};
    prvky(blok, jmeno).forEach(function (b) {
      const k = prvek(b, 'valueName').trim();
      (vysledek[k] = vysledek[k] || []).push(prvek(b, 'value'));
    });
    return vysledek;
  }
  function cas(s) {
    if (!s) return null;
    const t = Date.parse(s);
    return isNaN(t) ? null : t;
  }
  function vety(text) {
    if (!text) return [];
    return String(text).replace(/\s+/g, ' ').trim()
      .replace(/([.!?])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/g, '$1\n')
      .split('\n').map(function (v) { return v.trim(); }).filter(Boolean);
  }
  function zkrat(s, max) {
    if (!s || s.length <= max) return s || '';
    const kus = s.slice(0, max - 1);
    const mezera = kus.lastIndexOf(' ');
    return (mezera > max * 0.6 ? kus.slice(0, mezera) : kus) + '…';
  }
  /**
   * Jedna věta „co dělat“ z doporučení ČHMÚ: rady píše infinitivem („Nevstupovat…“) nebo „je třeba / doporučuje se“.
   * Věty s odkazy a popisy rizika („může se vyskytnout“) mají nízké skóre.
   */
  function rada(instrukce) {
    const vs = vety(instrukce);
    if (!vs.length) return '';
    const silne = /(je třeba|je nutné|je vhodné|dbát|vyhn|nevstupov|nezdržov|zdržet se|fyzické zátěž|zabezpeč|ukotv|odklid|snížit|omez|dodržov|chráni|nenecháv|připrav|zajist|opatrn|nepodceň|nevychá|nerozdělávat|nepoužívat|řídit se|věnovat|pít |dostatek tekutin|evaku)/i;
    const slabe = /(doporuč|sledovat|zvážit|ověřovat|plánovat)/i;
    let nejlepsi = null, skore = -99;
    vs.forEach(function (v, i) {
      let s = 0;
      const zacatek = v.split(' ').slice(0, 4).join(' ').toLowerCase();
      if (/\b(ne)?[a-zěščřžýáíéůúťďň]+(at|it|ět|et|out|nout|ovat|ít|ýt)\b/.test(zacatek) && !/\b(může|mohou|lze|bude|budou)\b/.test(zacatek)) s += 3;
      if (silne.test(v)) s += 3;
      if (slabe.test(v)) s += 1;
      if (/(https?:|www\.|tinyurl)/i.test(v)) s -= 5;
      if (/\b(může|mohou)\b/.test(v) && s < 3) s -= 1;
      if (v.length > 220) s -= 1;
      s -= i * 0.01; // při shodě dřívější věta
      if (s > skore) { skore = s; nejlepsi = v; }
    });
    return zkrat(nejlepsi, 200);
  }
  function prvniVeta(text) { const vs = vety(text); return vs.length ? zkrat(vs[0], 180) : ''; }
  /** u výhledu je cenná věta, která jmenuje jev (bouřky, teploty…), ne popis synoptické situace */
  function vetaSJevem(text) {
    const vs = vety(text);
    const re = /(bouř|teplot|vítr|větr|nárazy|déšť|deště|srážk|sníh|sněh|mráz|ledovk|náledí|povod|požár|smog)/i;
    for (let i = 0; i < vs.length; i++) if (re.test(vs[i])) return zkrat(vs[i], 180);
    return prvniVeta(text);
  }
  function urovenZeZavaznosti(z) { return { Extreme: 'cervena', Severe: 'oranzova', Moderate: 'zluta', Minor: 'info' }[z] || 'info'; }
  function urovenZBarvy(b) { // „2; yellow; Moderate“ …
    if (!b) return null;
    if (/red/i.test(b)) return 'cervena';
    if (/orange/i.test(b)) return 'oranzova';
    if (/yellow/i.test(b)) return 'zluta';
    if (/green/i.test(b)) return 'zelena';
    return null;
  }

  // ---- výstrahy (CAP)

  /** Položky týkající se zadaných ORP ({kód: název}), bez časového filtru. */
  function vystrahy(xml, orp) {
    orp = orp || {};
    const kody = Object.keys(orp);
    const zacatek = xml.slice(0, 3000);
    const hlavicka = { identifikator: prvek(zacatek, 'identifier'), vydano: cas(prvek(zacatek, 'sent')),
      status: prvek(zacatek, 'status'), druh: prvek(zacatek, 'msgType') };
    const vysledek = { hlavicka: hlavicka, polozky: [] };
    if (hlavicka.status && hlavicka.status !== 'Actual') return vysledek; // Test / Exercise / Draft
    if (hlavicka.druh === 'Cancel') return vysledek;

    const reInfo = /<info>([\s\S]*?)<\/info>/g;
    let m;
    while ((m = reInfo.exec(xml)) !== null) {
      const info = m[1];
      if (!/<language>cs/i.test(info)) continue;          // en-GB = stejná výstraha anglicky
      const jev = prvek(info, 'event');
      if (/^Žádn/i.test(jev)) continue;                    // „Žádná výstraha“, „Žádný výhled“
      let kod = null;
      for (let i = 0; i < kody.length; i++) {
        if (new RegExp('CISORP</valueName>\\s*<value>' + kody[i] + '</value>').test(info)) { kod = kody[i]; break; }
      }
      if (!kod) continue;
      const zavaznost = prvek(info, 'severity'), jistota = prvek(info, 'certainty'), naleha = prvek(info, 'urgency');
      const reakce = prvky(info, 'responseType').map(dekoduj);
      if (reakce.indexOf('AllClear') >= 0 || naleha === 'Past') continue; // odvolaná
      const par = pary(info, 'parameter');
      const ec = pary(info, 'eventCode');
      const ecText = Object.keys(ec).map(function (k) { return k + '=' + ec[k].join('/'); }).join(',');
      const barva = (par.awareness_level || [''])[0];
      const druhJevu = ((par.awareness_type || [''])[0].split(';')[0] || '').trim();
      const kategorie = prvek(info, 'category');
      let typ;
      if (/OUTLOOK/.test(ecText) || /^Výhled/i.test(jev)) typ = 'vyhled';
      else if (ec.SVRS || kategorie === 'Env' || /smog|ozón|ozon|PM10|NO2|SO2|regulace/i.test(jev)) typ = 'smog';
      else if (/povod|dotok/i.test(jev) || druhJevu === '12' || druhJevu === '13') typ = 'povoden';
      else typ = 'vystraha';
      let uroven;
      if (typ === 'vyhled') uroven = 'vyhled';
      else {
        uroven = urovenZBarvy(barva);
        if (!uroven || uroven === 'zelena') uroven = urovenZeZavaznosti(zavaznost);
      }
      if (zavaznost === 'Minor' && jistota === 'Unlikely' && !/dotok/i.test(jev)) continue;
      let kraj = '', celyKraj = false;
      prvky(info, 'area').forEach(function (a) {
        if (new RegExp('<value>' + kod + '</value>').test(a)) {
          const popis = prvek(a, 'areaDesc');
          const mm = /^(.*?)\s*\((.*)\)\s*$/.exec(popis);
          kraj = mm ? mm[1] : popis;
          celyKraj = !mm;
        }
      });
      const od = cas(prvek(info, 'onset')) || cas(prvek(info, 'effective')) || hlavicka.vydano;
      let konec = cas((par.eventEndingTime || [''])[0]) || cas(prvek(info, 'expires'));
      if (typ === 'vyhled' && !konec && od) konec = od + 24 * HODINA;
      const instrukce = prvek(info, 'instruction'), popis = prvek(info, 'description');
      const p = {
        typ: typ, uroven: uroven,
        nazev: /dotok/i.test(jev) ? 'Dotok (doznívající povodeň)' : jev,
        od: od, do: konec || null,
        oblast: orp[kod], kraj: kraj, celyKraj: celyKraj,
        text: (typ === 'vyhled' ? (vetaSJevem(popis) || rada(instrukce)) : (rada(instrukce) || prvniVeta(popis))) ||
          (typ === 'povoden' ? 'Sledovat vodní stavy na hydro.chmi.cz.' : ''),
        popis: prvniVeta(popis),
        jistota: jistota,
        web: prvek(info, 'web') || 'https://vystrahy-cr.chmi.cz/'
      };
      const profily = [];
      [['floodWatch', 1], ['floodWarning', 2], ['flooding', 3]].forEach(function (x) {
        (par[x[0]] || []).forEach(function (v) {
          const c = v.split(',').map(function (s) { return s.trim(); });
          profily.push({ spa: x[1], tok: c[0], stanice: c[1], stav: c[2], prutok: c[3], trend: c[4] });
        });
      });
      if (profily.length) p.profily = profily;
      if (par.hydroOutlook && par.hydroOutlook[0]) p.vyvoj = zkrat(par.hydroOutlook[0], 200);
      vysledek.polozky.push(p);
    }
    return vysledek;
  }

  /** platné teď nebo začínající do horizontu */
  function aktualni(polozky, ted, hodin) {
    const h = (hodin == null ? POCASI_HORIZONT_H : hodin) * HODINA;
    return polozky.filter(function (p) { return (p.do == null || p.do > ted) && (p.od == null || p.od <= ted + h); });
  }

  /** stejný jev se stejnou barvou, který na sebe časově navazuje, spojí do jedné položky */
  function slucDuplicity(polozky) {
    const skupiny = {}, vysledek = [];
    polozky.slice().sort(function (a, b) { return (a.od || 0) - (b.od || 0); }).forEach(function (p) {
      const k = p.typ + '|' + p.nazev + '|' + p.uroven;
      const posl = skupiny[k];
      if (posl && posl.do != null && p.od != null && p.od <= posl.do + 60000) {
        posl.do = p.do == null ? null : Math.max(posl.do, p.do);
        if (p.celyKraj) posl.celyKraj = true;
        return;
      }
      if (posl && posl.do == null) return; // už „do odvolání“
      const kopie = JSON.parse(JSON.stringify(p));
      skupiny[k] = kopie;
      vysledek.push(kopie);
    });
    return vysledek;
  }

  // ---- vodní stavy

  /** meta1.json → {objID: {nazev, tok, spa1, spa2, spa3, q50}} jen pro zadané stanice */
  function hydroMeta(text, ids) {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    const d = j.data.data, sloupce = d.header.split(','), vysledek = {};
    d.values.forEach(function (v) {
      const o = {};
      sloupce.forEach(function (k, i) { o[k] = v[i]; });
      if (ids && ids.indexOf(o.objID) < 0) return;
      vysledek[o.objID] = { nazev: o.STATION_NAME, tok: o.STREAM_NAME, spa1: o.SPA1H, spa2: o.SPA2H, spa3: o.SPA3H, q50: o.SPA4H };
    });
    return vysledek;
  }
  /** meta1.json → [[id, název, tok, lat, lon, maSpa]] (souřadnice WGS84; maSpa = má povodňové stupně). */
  function staniceSouradnice(text) {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    const d = j.data.data, sloupce = d.header.split(',');
    const i = function (k) { return sloupce.indexOf(k); };
    return d.values.map(function (v) {
      return [v[i('objID')], v[i('STATION_NAME')], v[i('STREAM_NAME')], Number(v[i('GEOGR1')]), Number(v[i('GEOGR2')]), v[i('SPA1H')] != null && v[i('SPA1H')] !== '' ? 1 : 0];
    }).filter(function (s) { return isFinite(s[3]) && isFinite(s[4]); });
  }
  /** Nejbližší stanice s povodňovými stupni do maxKm (vzdušně), nejvýš pocet id. */
  function nejblizsi(stanice, lat, lon, maxKm, pocet) {
    const km = function (s) {
      const dLat = (s[3] - lat) * 111.2, dLon = (s[4] - lon) * 111.2 * Math.cos(lat * Math.PI / 180);
      return Math.sqrt(dLat * dLat + dLon * dLon);
    };
    return stanice.filter(function (s) { return s[5]; }).map(function (s) { return [s[0], km(s)]; })
      .filter(function (x) { return x[1] <= maxKm; }).sort(function (a, b) { return a[1] - b[1]; }).slice(0, pocet).map(function (x) { return x[0]; });
  }
  function stupenSpa(h, m) {
    if (h == null || !m) return 0;
    if (m.q50 != null && h >= m.q50) return 4;
    if (m.spa3 != null && h >= m.spa3) return 3;
    if (m.spa2 != null && h >= m.spa2) return 2;
    if (m.spa1 != null && h >= m.spa1) return 1;
    return 0;
  }
  const NAZVY_SPA = ['bez povodně', '1. SPA – bdělost', '2. SPA – pohotovost', '3. SPA – ohrožení', 'extrémní povodeň'];
  const UROVNE_SPA = ['zelena', 'zluta', 'oranzova', 'cervena', 'fialova'];

  /**
   * Stanice (<objID>.json) + metadata → stav řeky. Časy v souborech jsou UTC („Z“).
   * Modelová předpověď H_F není dorovnaná na měření → posune se o rozdíl model × měření v čase posledního měření.
   */
  function reka(text, meta, ted) {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    const obj = j.objList[0], rady = {};
    obj.tsList.forEach(function (t) { rady[t.tsConID] = t.tsData; });
    const m = meta[obj.objID] || {};
    const H = rady.H || [];
    if (!H.length) return null;
    const posl = H[H.length - 1], tPosl = cas(posl.dt);
    let zpet = null;
    for (let i = H.length - 1; i >= 0; i--) { if (cas(H[i].dt) <= tPosl - 3 * HODINA) { zpet = H[i]; break; } }
    let trend = 'ustálená';
    if (zpet) { const rozdil = posl.value - zpet.value; trend = rozdil >= 3 ? 'stoupá' : rozdil <= -3 ? 'klesá' : 'ustálená'; }
    const horizont = ted + POCASI_HORIZONT_H * HODINA;
    let maxF = null, tMaxF = null, nejbl = null;
    (rady.H_F || []).forEach(function (p) {
      const t = cas(p.dt);
      if (Math.abs(t - tPosl) <= 2 * HODINA && (nejbl == null || Math.abs(t - tPosl) < Math.abs(cas(nejbl.dt) - tPosl))) nejbl = p;
      if (t >= ted && t <= horizont && (maxF == null || p.value > maxF)) { maxF = p.value; tMaxF = t; }
    });
    const posun = nejbl ? posl.value - nejbl.value : 0;
    if (maxF != null) maxF = Math.round(maxF + posun);
    const spaTed = stupenSpa(posl.value, m), spaPred = stupenSpa(maxF, m), spa = Math.max(spaTed, spaPred);
    return {
      typ: spa ? 'povoden' : 'hladina',
      uroven: UROVNE_SPA[spa],
      nazev: (m.tok || '') + ' – ' + (m.nazev || obj.objID),
      stav: spaTed ? NAZVY_SPA[spaTed] : spaPred ? 'předpověď: ' + NAZVY_SPA[spaPred] : NAZVY_SPA[0],
      kdy: tPosl, hladina: posl.value, trend: trend, spa: spaTed, spaPredpoved: spaPred,
      maxPredpoved: maxF, kdyMax: tMaxF, spa1: m.spa1 == null ? null : m.spa1,
      text: 'Hladina ' + posl.value + ' cm, ' + trend + (m.spa1 != null ? ' (1. SPA od ' + m.spa1 + ' cm)' : '') + '.',
      web: 'https://hydro.chmi.cz/hpps/'
    };
  }

  // ---- předpovědi (forecast/now, GeoJSON)

  function teploty(s) {
    s = String(s || '').replace(/−/g, '-');
    const m = /(-?\d+)\s*(?:až|–|-)\s*(-?\d+)\s*°C/.exec(s) || /(?:kolem|okolo|asi)\s*(-?\d+)\s*°C/.exec(s);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] != null ? Number(m[2]) : a;
    return [Math.min(a, b), Math.max(a, b)];
  }
  function ikona(uvod, pocasi, srazky) {
    const urci = function (t) {
      if (/bouř/i.test(t)) return 'bourka';
      if (/sněž|sníh|sněh/i.test(t)) return 'snih';
      if (/(?<!bez )(déšť|dešt|přeháň|mrholen)/i.test(t)) return 'dest';
      if (/zataženo|přibývání|zvětšování oblačnosti/i.test(t)) return 'oblacno';
      if (/polojasno|oblačn|průsvitn|ubývání/i.test(t)) return 'polojasno';
      if (/jasno|slunečn|slunce/i.test(t)) return 'slunce';
      if (/mlh/i.test(t)) return 'mlha';
      return '';
    };
    let i = urci(uvod) || urci(String(pocasi || '').replace(/[^.]*mlh[^.]*\.?/gi, '')) || 'polojasno';
    if (srazky && (i === 'polojasno' || i === 'oblacno')) i = 'dest';
    return i;
  }
  function predpoved(text) {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    const vlastnosti = j.data.features[0].properties, hl = vlastnosti['headline-main'] || {};
    const bloky = {};
    (vlastnosti.data || []).forEach(function (x) { bloky[x.name] = x; });
    const t = function (n) { return bloky[n] && bloky[n].displayText ? String(bloky[n].displayText).replace(/\s+/g, ' ').trim() : ''; };
    const jevy = [];
    (vlastnosti.data || []).forEach(function (x) {
      (x.dangerousPhenomenaList || []).forEach(function (d) { if (d && d.name && jevy.indexOf(d.name) < 0) jevy.push(d.name); });
    });
    const srazky = /^0\s*mm\.?$/i.test(t('textPrecipitation')) ? '' : t('textPrecipitation');
    const vitr = t('textWind');
    const od = cas(hl.startTime), konec = cas(hl.endTime);
    return {
      nazev: hl.headline || 'Předpověď',
      od: od, do: konec,
      den: od == null ? '' : denPraha(od + ((konec || od) - od) / 2),
      oblast: String((vlastnosti.place && vlastnosti.place.name) || '').replace(/^pro\s+/i, ''),
      uvod: t('textIntro').replace(/\.$/, ''),
      pocasi: t('textWeather'),
      tMax: teploty(t('textMaximumTemperature')),
      tMin: teploty(t('textMinimumTemperature')),
      srazky: srazky,
      vitr: /(silný|nárazy|vichř|bouř|\b1[0-9]\s*m\/s|\b[2-9][0-9]\s*m\/s)/i.test(vitr) ? vitr : '',
      jevy: jevy,
      ikona: ikona(t('textIntro'), t('textWeather'), srazky),
      uroven: jevy.length ? 'zluta' : 'info',
      vydano: cas(vlastnosti.sent)
    };
  }

  // ---- pražský čas bez Intl (stejně v Apps Scriptu i v Node)
  function posledniNedele(rok, mesic0) {
    const d = new Date(Date.UTC(rok, mesic0 + 1, 0));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  }
  function posunPrahy(ms) {
    const rok = new Date(ms).getUTCFullYear();
    const leto = posledniNedele(rok, 2) + HODINA, zima = posledniNedele(rok, 9) + HODINA;
    return (ms >= leto && ms < zima ? 120 : 60) * 60000;
  }
  function denPraha(ms) { return new Date(ms + posunPrahy(ms)).toISOString().slice(0, 10); }

  // ---- výpis adresáře (nginx autoindex): názvy mají jen DDHHMM → rozhoduje čas změny ve výpisu
  const MESICE = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  function nejnovejsi(html, reNazev) {
    const re = /<a href="([^"]+)">[^<]*<\/a>\s+(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2})\s+(\d+|-)/g;
    let m, nej = null;
    while ((m = re.exec(html)) !== null) {
      const nazev = decodeURIComponent(m[1]);
      if (!reNazev.test(nazev)) continue;
      const t = Date.UTC(+m[4], MESICE[m[3]], +m[2], +m[5], +m[6]);
      if (!nej || t > nej.cas || (t === nej.cas && nazev > nej.nazev)) nej = { nazev: nazev, cas: t };
    }
    return nej;
  }

  // ---- přehled pro aplikaci
  function prehled(vstup, ted, n) {
    const vyst = slucDuplicity(aktualni(vstup.cap || [], ted)).sort(function (a, b) {
      const aT = a.od != null && a.od <= ted ? 1 : 0, bT = b.od != null && b.od <= ted ? 1 : 0;
      return (PORADI[b.uroven] - PORADI[a.uroven]) || (bT - aT) || ((a.od || 0) - (b.od || 0));
    });
    // jedna předpověď na den – při překryvu novější vydání
    const podleDne = {};
    (vstup.predpovedi || []).forEach(function (p) {
      if (p.do != null && p.do <= ted) return;
      const k = p.den || String(p.od);
      if (!podleDne[k] || (p.vydano || 0) > (podleDne[k].vydano || 0)) podleDne[k] = p;
    });
    const predpovedi = Object.keys(podleDne).map(function (k) { return podleDne[k]; })
      .sort(function (a, b) { return (a.od || 0) - (b.od || 0); });
    const reky = vstup.reky || [];
    const vazne = vyst.filter(function (v) { return v.typ !== 'vyhled'; });
    const povodne = reky.filter(function (r) { return r.spa || r.spaPredpoved; });
    let souhrn = 'Žádné výstrahy ČHMÚ';
    if (vazne.length) souhrn = vazne.map(function (v) { return v.nazev; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 3).join(', ');
    else if (povodne.length) souhrn = povodne[0].nazev + ': ' + povodne[0].stav;
    return {
      vytvoreno: ted, misto: n.misto, souhrn: souhrn,
      vystrahy: vyst, reky: reky, predpovedi: predpovedi, zdroj: 'ČHMÚ'
    };
  }

  return { vystrahy: vystrahy, aktualni: aktualni, slucDuplicity: slucDuplicity, hydroMeta: hydroMeta, staniceSouradnice: staniceSouradnice, nejblizsi: nejblizsi, reka: reka,
    predpoved: predpoved, nejnovejsi: nejnovejsi, prehled: prehled, rada: rada, denPraha: denPraha, teploty: teploty };
})();

// ---------------------------------------------------------------- Zdraví: WHOOP (API v2) + Apple Zdraví (zkratka v iPhonu)
//
// WHOOP: Michal si na developer-dashboard.whoop.com založí vlastní aplikaci (Sandbox, jen pro sebe) a do vlastností
// skriptu vloží WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET a WHOOP_REDIRECT_URI (= adresa /exec tohoto motoru). Propojení:
// aplikace → akce whoopPropojit (odkaz na souhlas WHOOP) → WHOOP vrátí prohlížeč na /exec?code=…&state=… (doGet).
// Tokeny (WHOOP_TOKEN) spravuje motor; refresh token se při každé obnově mění → obnova pod zámkem, nový hned uložit.
// Apple Zdraví: zkratka v iPhonu (spouští ji otevření aplikace WHOOP – zamčený iPhone data Zdraví nepustí) posílá
// denní hodnoty za 7 dní; má vlastní klíč ZDRAVI_KLIC jen pro zápis (hlavní klíč otevírá poštu, do zkratky nepatří).
// Data po dnech: Disk / CLAUDE_SCHRANKA / ZDRAVI / RRRR-MM.json – soukromé, nikdy do gitu. Přehled pro aplikaci: akce zdravi.

const WHOOP_ = {
  auth: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  token: 'https://api.prod.whoop.com/oauth/oauth2/token',
  api: 'https://api.prod.whoop.com/developer',
  scope: 'offline read:recovery read:cycles read:sleep read:workout read:body_measurement'
};
const ZDRAVI_DNI = 30;          // přehled v aplikaci
const ZDRAVI_SYNC_MIN = 30;     // WHOOP se při otevření aplikace dotahuje nejvýš jednou za 30 minut

function vlastnosti_() { return PropertiesService.getScriptProperties(); }

/** Stav propojení pro aplikaci (bez tokenů). */
function whoopStav_() {
  const p = vlastnosti_();
  let sync = {};
  try { sync = JSON.parse(p.getProperty('WHOOP_SYNC') || '{}') || {}; } catch (chyba) { sync = {}; }
  return {
    nastaveno: !!(p.getProperty('WHOOP_CLIENT_ID') && p.getProperty('WHOOP_CLIENT_SECRET') && p.getProperty('WHOOP_REDIRECT_URI')),
    propojeno: !!p.getProperty('WHOOP_TOKEN'),
    sync: { kdy: sync.kdy || 0, chyba: sync.chyba || '' }
  };
}

/** Odkaz na souhlas WHOOP (akce whoopPropojit). state brání podstrčení cizího kódu. */
function whoopPropojit_() {
  const p = vlastnosti_();
  if (!whoopStav_().nastaveno) {
    throw new Error('Chybí nastavení WHOOP ve vlastnostech skriptu (WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, WHOOP_REDIRECT_URI) – návod: Nastavení → Zdraví.');
  }
  const state = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('WHOOP_STATE', state, 900);
  const q = { response_type: 'code', client_id: p.getProperty('WHOOP_CLIENT_ID'), redirect_uri: p.getProperty('WHOOP_REDIRECT_URI'),
    scope: WHOOP_.scope, state: state };
  return { odkaz: WHOOP_.auth + '?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&') };
}

/** Návrat z WHOOP (doGet s code a state): vymění kód za tokeny, první synchronizace za 30 dní. */
function whoopNavrat_(prm) {
  const cache = CacheService.getScriptCache();
  let zprava;
  if (prm.error) zprava = ['WHOOP nepropojen', 'Souhlas nebyl udělen (' + String(prm.error).slice(0, 60) + '). Zkus to znovu z aplikace.'];
  else if (!prm.code || !prm.state || prm.state !== cache.get('WHOOP_STATE')) zprava = ['WHOOP nepropojen', 'Odkaz vypršel nebo není platný. Spusť propojení znovu z aplikace.'];
  else {
    cache.remove('WHOOP_STATE');
    try {
      ulozWhoopToken_(whoopToken_({ grant_type: 'authorization_code', code: prm.code, redirect_uri: vlastnosti_().getProperty('WHOOP_REDIRECT_URI') }));
      try { whoopSync_(ZDRAVI_DNI); } catch (chyba) { /* data se dotáhnou při dalším otevření */ }
      zprava = ['WHOOP propojen ✓', 'Okno můžeš zavřít a vrátit se do Asistenta – data jsou v sekci Zdraví.'];
    } catch (chyba) {
      zprava = ['WHOOP nepropojen', String(chyba.message || chyba)];
    }
  }
  return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font:16px/1.5 -apple-system,Segoe UI,sans-serif;max-width:420px;margin:15vh auto;padding:24px;text-align:center">' +
    '<h2 style="margin:0 0 8px">' + escHtml_(zprava[0]) + '</h2><p style="color:#555">' + escHtml_(zprava[1]) + '</p></div>').setTitle('Asistent – WHOOP');
}

function whoopToken_(formular) {
  const p = vlastnosti_();
  formular.client_id = p.getProperty('WHOOP_CLIENT_ID');
  formular.client_secret = p.getProperty('WHOOP_CLIENT_SECRET');
  const r = UrlFetchApp.fetch(WHOOP_.token, { method: 'post', payload: formular, muteHttpExceptions: true });
  const kod = r.getResponseCode();
  if (kod !== 200) {
    // obnova odmítnutá (změna hesla, odvolaný souhlas) → odpojit, aplikace nabídne nové propojení
    if (formular.grant_type === 'refresh_token' && (kod === 400 || kod === 401)) p.deleteProperty('WHOOP_TOKEN');
    throw new Error('WHOOP odmítl přihlášení (HTTP ' + kod + ')' + (formular.grant_type === 'refresh_token' ? ' – propoj znovu.' : '.'));
  }
  return JSON.parse(r.getContentText()); // tělo obsahuje tokeny – nikdy nelogovat
}

function ulozWhoopToken_(t) {
  vlastnosti_().setProperty('WHOOP_TOKEN', JSON.stringify({
    access_token: t.access_token, refresh_token: t.refresh_token, expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000
  }));
}

/** Platný přístupový token; obnova pod zámkem (refresh token se mění – dvě souběžné obnovy by se pobily). */
function whoopPristup_() {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(30000);
  try {
    const t = JSON.parse(vlastnosti_().getProperty('WHOOP_TOKEN') || 'null');
    if (!t) throw new Error('WHOOP není propojený.');
    if (Date.now() < t.expiresAt - 120000) return t.access_token;
    const novy = whoopToken_({ grant_type: 'refresh_token', refresh_token: t.refresh_token, scope: 'offline' });
    ulozWhoopToken_(novy);
    return novy.access_token;
  } finally {
    zamek.releaseLock();
  }
}

/** GET na WHOOP API; kolekce projde po stránkách (limit 25, nejvýš 12 stránek). */
function whoopGet_(cesta, dotaz) {
  const vse = [];
  let dalsi = null, stran = 0;
  const pristup = whoopPristup_();
  do {
    const q = Object.assign({}, dotaz || {}, dalsi ? { nextToken: dalsi } : {});
    const qs = Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
    const r = UrlFetchApp.fetch(WHOOP_.api + cesta + (qs ? '?' + qs : ''), { headers: { Authorization: 'Bearer ' + pristup }, muteHttpExceptions: true });
    const kod = r.getResponseCode();
    if (kod === 401) { vlastnosti_().deleteProperty('WHOOP_TOKEN'); throw new Error('WHOOP přístup vypršel – propoj znovu.'); }
    if (kod !== 200) throw new Error('WHOOP ' + cesta + ': HTTP ' + kod);
    const j = JSON.parse(r.getContentText());
    if (!j.records) return j;
    Array.prototype.push.apply(vse, j.records);
    dalsi = j.next_token || null;
  } while (dalsi && ++stran < 12);
  return vse;
}

/** Stáhne z WHOOP posledních n dní a uloží po dnech. Chybu zapíše do WHOOP_SYNC (aplikace ji ukáže) a vyhodí dál. */
function whoopSync_(dni) {
  const od = new Date(Date.now() - dni * 864e5).toISOString();
  try {
    const spanky = whoopGet_('/v2/activity/sleep', { limit: 25, start: od });
    const recovery = whoopGet_('/v2/recovery', { limit: 25, start: od });
    const cykly = whoopGet_('/v2/cycle', { limit: 25, start: od });
    const treninky = whoopGet_('/v2/activity/workout', { limit: 25, start: new Date(Date.now() - (dni + 3) * 864e5).toISOString() });
    const z = ZDRAVI_.zWhoop(spanky, recovery, cykly, treninky);
    ulozZdravi_(z.dny, 'whoop', z.treninky);
    vlastnosti_().setProperty('WHOOP_SYNC', JSON.stringify({ kdy: Date.now(), chyba: '' }));
    return z;
  } catch (chyba) {
    vlastnosti_().setProperty('WHOOP_SYNC', JSON.stringify({ kdy: whoopStav_().sync.kdy, chyba: String(chyba.message || chyba).slice(0, 200) }));
    throw chyba;
  }
}

function whoopOdpojit_() {
  try {
    UrlFetchApp.fetch(WHOOP_.api + '/v2/user/access', { method: 'delete', headers: { Authorization: 'Bearer ' + whoopPristup_() }, muteHttpExceptions: true });
  } catch (chyba) { /* i bez odvolání u WHOOP se tokeny smažou */ }
  vlastnosti_().deleteProperty('WHOOP_TOKEN');
  vlastnosti_().deleteProperty('WHOOP_SYNC');
  return whoopStav_();
}

// ---- Apple Zdraví ze zkratky

/** Klíč pro zkratku (jen zápis dat Zdraví). Vytvoří ho, když chybí; novy = vyrobit jiný (starý přestane platit). */
function zdraviKlic_(novy) {
  const p = vlastnosti_();
  let k = p.getProperty('ZDRAVI_KLIC');
  if (!k || novy) {
    k = Utilities.getUuid().replace(/-/g, '');
    p.setProperty('ZDRAVI_KLIC', k);
    CacheService.getScriptCache().remove('ZDRAVI_KLIC'); // starý klíč hned přestane platit
  }
  return { klic: k };
}

/** Klíč zkratky z mezipaměti (6 h) – požadavky s cizím klíčem nevyčerpají kvótu čtení vlastností (jako klicApi_). */
function klicZdravi_() {
  const cache = CacheService.getScriptCache();
  let k = cache.get('ZDRAVI_KLIC');
  if (!k) {
    k = PropertiesService.getScriptProperties().getProperty('ZDRAVI_KLIC');
    if (k) cache.put('ZDRAVI_KLIC', k, 21600);
  }
  return k;
}

/** Akce zdraviApple (volá zkratka s ZDRAVI_KLIC): denní hodnoty za pár dní → přepíše po dnech. */
function zapisApple_(d) {
  const dny = ZDRAVI_.zApple(d);
  const pocet = Object.keys(dny).length;
  if (!pocet) throw new Error('Ve zprávě ze zkratky nejsou žádná data (zkontroluj proměnné v Načíst obsah URL).');
  ulozZdravi_(dny, 'apple', null);
  vlastnosti_().setProperty('APPLE_SYNC', String(Date.now()));
  // zkratku spouští otevření aplikace WHOOP → rovnou čerstvý WHOOP
  try { if (whoopStav_().propojeno) whoopSync_(3); } catch (chyba) { /* stačí Apple */ }
  return { ulozeno: pocet };
}

// ---- úložiště po měsících na Disku

function slozkaZdravi_() { return podslozka_(koren_(), 'ZDRAVI'); }

function nactiMesicZdravi_(slozka, mesic) {
  const it = slozka.getFilesByName(mesic + '.json');
  if (!it.hasNext()) return { soubor: null, data: { dny: {}, treninky: {} } };
  const soubor = it.next();
  let data = null;
  try { data = JSON.parse(soubor.getBlob().getDataAsString('UTF-8')); } catch (chyba) { data = null; }
  return { soubor: soubor, data: data && data.dny ? data : { dny: {}, treninky: {} } };
}

/** Uloží dny (zdroj whoop | apple) a tréninky do souborů po měsících; pod zámkem (zkratka a aplikace naráz). */
function ulozZdravi_(dny, zdroj, treninky) {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(30000);
  try {
    const slozka = slozkaZdravi_();
    const mesice = {};
    const mesic = function (den) {
      const m = den.slice(0, 7);
      if (!mesice[m]) mesice[m] = nactiMesicZdravi_(slozka, m);
      return mesice[m].data;
    };
    Object.keys(dny).forEach(function (den) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return;
      const m = mesic(den);
      const zaznam = m.dny[den] = m.dny[den] || {};
      zaznam[zdroj] = Object.assign({}, zaznam[zdroj], dny[den]);
    });
    (treninky || []).forEach(function (t) {
      if (!t.den) return;
      mesic(t.den).treninky[t.id] = t;
    });
    Object.keys(mesice).forEach(function (m) {
      const x = mesice[m];
      x.data.aktualizovano = Date.now();
      const obsah = JSON.stringify(x.data);
      if (x.soubor) x.soubor.setContent(obsah); else slozka.createFile(m + '.json', obsah, MimeType.PLAIN_TEXT);
    });
  } finally {
    zamek.releaseLock();
  }
}

/** Akce zdravi: přehled za 30 dní; WHOOP se předtím dotáhne, když je propojený a data jsou starší než 30 minut. */
function zdravi_(znovu) {
  const whoop = whoopStav_();
  let chybaSync = '';
  if (whoop.propojeno && (znovu || Date.now() - whoop.sync.kdy > ZDRAVI_SYNC_MIN * 60000)) {
    try { whoopSync_(whoop.sync.kdy ? 5 : ZDRAVI_DNI); } catch (chyba) { chybaSync = String(chyba.message || chyba); }
  }
  const slozka = slozkaZdravi_();
  const ted = Date.now();
  const tento = Utilities.formatDate(new Date(ted), CASOVE_PASMO, 'yyyy-MM');
  const minuly = Utilities.formatDate(new Date(ted - (ZDRAVI_DNI + 1) * 864e5), CASOVE_PASMO, 'yyyy-MM');
  const soubory = (minuly === tento ? [tento] : [minuly, tento]).map(function (m) { return nactiMesicZdravi_(slozka, m).data; });
  const p = ZDRAVI_.prehled(soubory, ted, ZDRAVI_DNI);
  p.whoop = whoopStav_();
  if (chybaSync) p.whoop.sync.chyba = chybaSync;
  p.apple = { kdy: Number(vlastnosti_().getProperty('APPLE_SYNC') || 0) };
  p.rezim = zdraviRezim_();
  p.vaha = nactiVahu_(slozka).zaznamy;
  return p;
}

// ---- váha: ruční zápis z aplikace (Michal se váží jen občas), CLAUDE_SCHRANKA/ZDRAVI/VAHA.json { zaznamy: [{ kdy: ms, kg }] }

function nactiVahu_(slozka) {
  const it = slozka.getFilesByName('VAHA.json');
  if (!it.hasNext()) return { soubor: null, zaznamy: [] };
  const soubor = it.next();
  let data = null;
  try { data = JSON.parse(soubor.getBlob().getDataAsString('UTF-8')); } catch (chyba) { data = null; }
  return { soubor: soubor, zaznamy: data && Array.isArray(data.zaznamy) ? data.zaznamy : [] };
}

/** „80,4“, „80.4 kg“, 80.44 → 80.4 (kg na desetiny); nesmysl nebo mimo 30–250 kg → null. */
function vahaKg_(x) {
  const m = /(\d{2,3})(?:[.,](\d+))?/.exec(String(x == null ? '' : x));
  if (!m) return null;
  const kg = Math.round(Number(m[1] + '.' + (m[2] || '0')) * 10) / 10;
  return kg >= 30 && kg <= 250 ? kg : null;
}

/** Akce vaha: d.kg = zapsat (čas zápisu = teď), d.smazat = čas záznamu ke smazání (překlep). Vrací všechny záznamy. */
function vaha_(d) {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(30000);
  try {
    const slozka = slozkaZdravi_();
    const v = nactiVahu_(slozka);
    let zaznamy = v.zaznamy;
    if (d.smazat != null) {
      const kdy = Number(d.smazat);
      zaznamy = zaznamy.filter(function (z) { return z.kdy !== kdy; });
    } else {
      const kg = vahaKg_(d.kg);
      if (kg == null) throw new Error('Váha musí být číslo v kg (např. 80,4).');
      zaznamy.push({ kdy: Date.now(), kg: kg });
    }
    zaznamy.sort(function (a, b) { return a.kdy - b.kdy; });
    const obsah = JSON.stringify({ aktualizovano: Date.now(), zaznamy: zaznamy });
    if (v.soubor) v.soubor.setContent(obsah); else slozka.createFile('VAHA.json', obsah, MimeType.PLAIN_TEXT);
    return { zaznamy: zaznamy };
  } finally {
    zamek.releaseLock();
  }
}

/**
 * Režim doplňků (CLAUDE_SCHRANKA/ZDRAVI_REZIM.json – jen na Michalově Disku, do repa nepatří): co brát kdy,
 * dny tréninku, týmy, jejichž zápas je „den zápasu“, poslední kofein. Aplikace z toho skládá „Doplňky dnes“. Chybí → null.
 */
function zdraviRezim_() {
  const it = koren_().getFilesByName('ZDRAVI_REZIM.json');
  if (!it.hasNext()) return null;
  try {
    const r = JSON.parse(it.next().getBlob().getDataAsString('UTF-8'));
    return r && Array.isArray(r.polozky) ? r : null;
  } catch (chyba) {
    return { chyba: 'ZDRAVI_REZIM.json není platný JSON.', polozky: [] };
  }
}

/** Zpracování dat zdraví – čisté funkce (testuje apps-script/test/motor.test.js). */
const ZDRAVI_ = (function () {
  const MIN = 60000;
  const HOD = 3600000;
  function posunMs(offset) { // „+02:00“, „-0530“, „Z“
    const m = /([+-])(\d{2}):?(\d{2})$/.exec(String(offset || ''));
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * MIN : 0;
  }
  function den(ms, offset) { return new Date(ms + posunMs(offset)).toISOString().slice(0, 10); }
  function mistniDen(iso, offset) { const t = Date.parse(iso); return isNaN(t) ? '' : den(t, offset); }
  function zaokr(x, des) { if (x == null || !isFinite(x)) return null; const k = Math.pow(10, des || 0); return Math.round(x * k) / k; }

  // -------- WHOOP (den = místní datum probuzení z hlavního spánku; cyklus a recovery přes sleep / cycle id)
  function zWhoop(spanky, recovery, cykly, treninky) {
    const dny = {};
    const dne = function (d) { return (dny[d] = dny[d] || {}); };
    const denSpanku = {}, denCyklu = {};
    (spanky || []).forEach(function (s) {
      if (s.nap) return;
      const d = mistniDen(s.end || s.start, s.timezone_offset);
      if (!d) return;
      denSpanku[s.id] = d;
      if (s.cycle_id != null) denCyklu[s.cycle_id] = d;
      if (s.score_state !== 'SCORED' || !s.score) return;
      const st = s.score.stage_summary || {};
      const celkem = (st.total_light_sleep_time_milli || 0) + (st.total_slow_wave_sleep_time_milli || 0) + (st.total_rem_sleep_time_milli || 0);
      if (dne(d).spanek && dne(d).spanek.celkem >= celkem) return; // dva hlavní spánky v jednom dni → delší
      const potreba = s.score.sleep_needed ? ['baseline_milli', 'need_from_sleep_debt_milli', 'need_from_recent_strain_milli', 'need_from_recent_nap_milli']
        .reduce(function (a, k) { return a + (s.score.sleep_needed[k] || 0); }, 0) : null;
      dne(d).spanek = {
        start: Date.parse(s.start), konec: Date.parse(s.end), celkem: celkem,
        lehky: st.total_light_sleep_time_milli || 0, hluboky: st.total_slow_wave_sleep_time_milli || 0, rem: st.total_rem_sleep_time_milli || 0,
        bdeni: st.total_awake_time_milli || 0, probuzeni: st.disturbance_count == null ? null : st.disturbance_count,
        vykon: zaokr(s.score.sleep_performance_percentage), konzistence: zaokr(s.score.sleep_consistency_percentage),
        efektivita: zaokr(s.score.sleep_efficiency_percentage, 1), dech: zaokr(s.score.respiratory_rate, 1), potreba: potreba
      };
    });
    (recovery || []).forEach(function (r) {
      if (r.score_state !== 'SCORED' || !r.score) return;
      const d = denSpanku[r.sleep_id] || denCyklu[r.cycle_id] || mistniDen(r.created_at, '+00:00');
      if (!d) return;
      dne(d).pripravenost = {
        skore: zaokr(r.score.recovery_score), hrv: zaokr(r.score.hrv_rmssd_milli, 1), klidovyTep: zaokr(r.score.resting_heart_rate),
        spo2: zaokr(r.score.spo2_percentage, 1), teplota: zaokr(r.score.skin_temp_celsius, 1), kalibrace: !!r.score.user_calibrating
      };
    });
    (cykly || []).forEach(function (c) {
      const zacatek = Date.parse(c.start);
      const d = denCyklu[c.id] || (isNaN(zacatek) ? '' : den(zacatek + 12 * HOD, c.timezone_offset));
      if (!d) return;
      const z = { probiha: !c.end };
      if (c.step_count != null) z.kroky = c.step_count;
      if (c.score_state === 'SCORED' && c.score) {
        z.zatez = zaokr(c.score.strain, 1);
        z.kcal = c.score.kilojoule == null ? null : Math.round(c.score.kilojoule / 4.184);
        z.tepPrumer = c.score.average_heart_rate;
        z.tepMax = c.score.max_heart_rate;
      }
      dne(d).zatez = z;
    });
    const tr = (treninky || []).filter(function (w) { return w.score_state === 'SCORED' && w.score; }).map(function (w) {
      const s = w.score, zony = s.zone_durations || {};
      return {
        id: String(w.id), den: mistniDen(w.start, w.timezone_offset), start: Date.parse(w.start), konec: Date.parse(w.end),
        sport: String(w.sport_name || '').toLowerCase(), zatez: zaokr(s.strain, 1), tepPrumer: s.average_heart_rate, tepMax: s.max_heart_rate,
        kcal: s.kilojoule == null ? null : Math.round(s.kilojoule / 4.184), vzdalenost: s.distance_meter == null ? null : Math.round(s.distance_meter),
        zony: ['zone_zero_milli', 'zone_one_milli', 'zone_two_milli', 'zone_three_milli', 'zone_four_milli', 'zone_five_milli']
          .map(function (k) { return Math.round((zony[k] || 0) / MIN); })
      };
    });
    return { dny: dny, treninky: tr };
  }

  // -------- Apple Zdraví ze zkratky (texty „datum=hodnota;…“, čísla s desetinnou čárkou a mezerami)
  function cisloCz(s) {
    if (s == null) return null;
    const n = parseFloat(String(s).replace(/[\s  ]/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  const MESICE_CZ = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  /** Datum z textu zkratky: ISO „2026-10-01T…“, české „1. 10. 2026 v 0:00“ nebo „1. října 2026“ → „2026-10-01“ */
  function datumZTextu(s) {
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    const cz = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(s);
    if (cz) return cz[3] + '-' + ('0' + cz[2]).slice(-2) + '-' + ('0' + cz[1]).slice(-2);
    const slovy = new RegExp('(\\d{1,2})\\.\\s*(' + MESICE_CZ.join('|') + ')\\s*(\\d{4})', 'i').exec(String(s || ''));
    return slovy ? slovy[3] + '-' + ('0' + (MESICE_CZ.indexOf(slovy[2].toLowerCase()) + 1)).slice(-2) + '-' + ('0' + slovy[1]).slice(-2) : '';
  }
  /** Dva seznamy ze zkratky – dny a hodnoty, každý údaj na řádku (vlastnosti Datum začátku a Hodnota z „Najít vzorky“)
   *  → { 'RRRR-MM-DD': číslo }. Zkratka tak nepotřebuje Opakovat ani skládat text. */
  function parovaneHodnoty(dnyText, hodnotyText) {
    const out = {};
    const dny = String(dnyText || '').split(/[;\n]+/);
    const hodnoty = String(hodnotyText || '').split(/[;\n]+/);
    for (let i = 0; i < Math.min(dny.length, hodnoty.length); i++) {
      const d = datumZTextu(dny[i]);
      const n = cisloCz(hodnoty[i]);
      if (d && n != null) out[d] = n;
    }
    return out;
  }
  function denniHodnoty(text) {
    const out = {};
    String(text || '').split(/[;\n]+/).forEach(function (kus) {
      const i = kus.lastIndexOf('=');
      if (i < 0) return;
      const d = datumZTextu(kus.slice(0, i));
      const n = cisloCz(kus.slice(i + 1));
      if (d && n != null) out[d] = n;
    });
    return out;
  }
  function typSpanku(s) {
    const t = String(s || '').toLowerCase();
    if (/posteli|in ?bed/.test(t)) return 'vPosteli';
    if (/bdě|bde|vzhůru|vzhuru|awake/.test(t)) return 'bdeni';
    if (/hlubok|deep/.test(t)) return 'hluboky';
    if (/rem/.test(t)) return 'rem';
    if (/jádr|jadr|core|základ|zaklad/.test(t)) return 'jadro';
    if (/spí|span|spán|asleep|sleep/.test(t)) return 'spanek';
    return '';
  }
  /** Úseky spánku „začátek|konec|fáze;…“ → noci podle dne probuzení (konec + 6 h, ať se noc přes půlnoc nerozdělí). */
  function spanekApple(text) {
    const noci = {};
    String(text || '').split(/[;\n]+/).forEach(function (kus) {
      const c = kus.split('|');
      if (c.length < 3) return;
      const z = Date.parse(c[0].trim()), k = Date.parse(c[1].trim());
      const typ = typSpanku(c[2]);
      if (isNaN(z) || isNaN(k) || k <= z || !typ || typ === 'vPosteli') return;
      const d = den(k + 6 * HOD, (/([+-]\d{2}:?\d{2})\s*$/.exec(c[1].trim()) || [])[1] || '+00:00');
      const n = noci[d] = noci[d] || { celkem: 0, jadro: 0, hluboky: 0, rem: 0, bdeni: 0, start: null, konec: null };
      if (typ === 'bdeni') { n.bdeni += k - z; return; }
      n.celkem += k - z;
      if (typ !== 'spanek') n[typ] += k - z;
      n.start = n.start == null ? z : Math.min(n.start, z);
      n.konec = Math.max(n.konec || 0, k);
    });
    return noci;
  }
  const POLE_APPLE = { kroky: 'kroky', energie: 'energie', cviceni: 'cviceni', stani: 'stani', vzdalenost: 'vzdalenost',
    klidovy_tep: 'klidovyTep', hrv: 'hrv', vo2max: 'vo2max' };
  function zApple(d) {
    const dny = {};
    Object.keys(POLE_APPLE).forEach(function (pole) {
      // nový tvar: pole + pole_dny (dva seznamy), starý: „datum=hodnota;…“
      const hodnoty = d[pole + '_dny'] != null ? parovaneHodnoty(d[pole + '_dny'], d[pole]) : denniHodnoty(d[pole]);
      Object.keys(hodnoty).forEach(function (x) {
        // „Doplnit chybějící“ ve zkratce dává dnům bez měření nulu – tep, HRV ani VO2 max nulové být nemůžou
        if (hodnoty[x] === 0 && (pole === 'klidovy_tep' || pole === 'hrv' || pole === 'vo2max')) return;
        (dny[x] = dny[x] || {})[POLE_APPLE[pole]] = pole === 'vzdalenost' ? zaokr(hodnoty[x], 2) : zaokr(hodnoty[x], pole === 'vo2max' || pole === 'hrv' ? 1 : 0);
      });
    });
    const noci = spanekApple(d.spanek);
    Object.keys(noci).forEach(function (x) { (dny[x] = dny[x] || {}).spanek = noci[x]; });
    return dny;
  }

  // -------- přehled pro aplikaci
  function prehled(soubory, ted, dni) {
    const dny = {}, treninky = {};
    soubory.forEach(function (s) {
      Object.keys(s.dny || {}).forEach(function (x) { dny[x] = Object.assign({}, dny[x], s.dny[x]); });
      Object.keys(s.treninky || {}).forEach(function (id) { treninky[id] = s.treninky[id]; });
    });
    const hranice = new Date(ted - dni * 864e5).toISOString().slice(0, 10);
    return {
      vytvoreno: ted,
      dny: Object.keys(dny).filter(function (x) { return x >= hranice; }).sort().map(function (x) { return Object.assign({ den: x }, dny[x]); }),
      treninky: Object.keys(treninky).map(function (id) { return treninky[id]; })
        .filter(function (t) { return t.den >= hranice; }).sort(function (a, b) { return b.start - a.start; })
    };
  }

  return { zWhoop: zWhoop, zApple: zApple, prehled: prehled, cisloCz: cisloCz, spanekApple: spanekApple, mistniDen: mistniDen };
})();

// ---------------------------------------------------------------- upozornění do iPhonu (ntfy, nepovinné)
//
// Když je ve vlastnostech skriptu NTFY_TEMA (náhodné jméno – kdo ho zná, čte), motor pošle krátké upozornění přes ntfy.sh
// (aplikace ntfy v iPhonu, téma odebírat). Spouští ho funkce kazdouHodinu (spouštěč nastaví Michal v editoru: Spouštěče).

function upozorni_(nadpis, text, tagy, priorita) {
  const tema = vlastnosti_().getProperty('NTFY_TEMA');
  if (!tema) return false;
  const r = UrlFetchApp.fetch('https://ntfy.sh/', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ topic: tema, title: nadpis, message: text, tags: tagy || [], priority: priorita || 3,
      click: vlastnosti_().getProperty('ADRESA_APLIKACE') || 'https://mk-asistent.github.io/' }) });
  return r.getResponseCode() === 200;
}

/** Spouštěč každou hodinu: WHOOP (nová připravenost ráno), výstrahy ČHMÚ (oranžová a vyšší), ranní souhrn dne
 *  a nové „hoří“ v poště (6–22 h). Všechno jen když je nastavené NTFY_TEMA. */
function kazdouHodinu() {
  const p = vlastnosti_();
  if (!p.getProperty('NTFY_TEMA')) return;
  const hodina = Number(Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'H'));
  try { if (hodina >= 6 && hodina <= 22) horiVPoste_(); } catch (chyba) { /* příště */ }
  try { ranniSouhrn_(hodina); } catch (chyba) { /* příště */ }
  try { nedelniPrehled_(hodina); } catch (chyba) { /* příště */ }
  if (whoopStav_().propojeno) {
    try {
      const z = whoopSync_(3);
      const dnes = Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'yyyy-MM-dd');
      const d = z.dny[dnes];
      if (d && d.pripravenost && p.getProperty('OHLASENO_ZDRAVI') !== dnes) {
        const sk = d.pripravenost.skore;
        const spanek = d.spanek ? Math.floor(d.spanek.celkem / 36e5) + ' h ' + Math.round((d.spanek.celkem % 36e5) / 6e4) + ' min' : '';
        if (upozorni_('Připravenost ' + sk + ' %', [spanek ? 'Spánek ' + spanek : '', d.pripravenost.hrv ? 'HRV ' + d.pripravenost.hrv + ' ms' : '']
          .filter(Boolean).join(' · '), [sk >= 67 ? 'green_circle' : sk >= 34 ? 'yellow_circle' : 'red_circle'], 3)) {
          p.setProperty('OHLASENO_ZDRAVI', dnes);
        }
      }
    } catch (chyba) { /* zkusí se za hodinu */ }
  }
  try {
    const pocasi = pocasi_(true);
    const ohlasene = JSON.parse(p.getProperty('OHLASENE_VYSTRAHY') || '{}');
    const ted = Date.now();
    const nove = {};
    pocasi.vystrahy.filter(function (v) { return ['oranzova', 'cervena', 'fialova'].indexOf(v.uroven) >= 0 || v.typ === 'povoden'; })
      .forEach(function (v) {
        const k = v.nazev + '|' + v.od;
        nove[k] = v.do || ted + 2 * 864e5;
        if (ohlasene[k]) return;
        upozorni_('⚠ ' + v.nazev, v.text || pocasi.souhrn, [v.uroven === 'oranzova' ? 'orange_circle' : 'red_circle'], 4);
      });
    Object.keys(ohlasene).forEach(function (k) { if (ohlasene[k] > ted && !nove[k]) nove[k] = ohlasene[k]; });
    p.setProperty('OHLASENE_VYSTRAHY', JSON.stringify(nove).slice(0, 8000));
  } catch (chyba) { /* příště */ }
}

/** Nové konverzace „hoří“ za poslední 2 hodiny (každá jen jednou). */
function horiVPoste_() {
  const p = vlastnosti_();
  const ja = mojeAdresa_().toLowerCase();
  const prac = pracovniAdresa_();
  const nove = seznamVlaken_('in:inbox is:unread newer_than:2h -category:promotions -category:social -category:forums', ja, prac, null, 20)
    .filter(function (v) { return v.stav === 'hori'; });
  if (!nove.length) return;
  let ohlasene = [];
  try { ohlasene = JSON.parse(p.getProperty('OHLASENA_POSTA') || '[]'); } catch (chyba) { ohlasene = []; }
  const neohlasene = nove.filter(function (v) { return ohlasene.indexOf(v.id) < 0; });
  if (!neohlasene.length) return;
  // přes ntfy.sh (cizí server) jen počet a účet – jména, předměty a obsah zůstávají v aplikaci
  const pracovnich = neohlasene.filter(function (v) { return v.ucet === 'pracovni'; }).length;
  const text = neohlasene.length + ' ' + (neohlasene.length === 1 ? 'nová konverzace' : neohlasene.length < 5 ? 'nové konverzace' : 'nových konverzací') +
    (pracovnich ? ' (pracovní ' + pracovnich + ')' : '') + ' – otevři Asistenta';
  if (upozorni_('🔥 Hoří v poště', text, ['fire'], 4)) neohlasene.forEach(function (v) { ohlasene.push(v.id); });
  p.setProperty('OHLASENA_POSTA', JSON.stringify(ohlasene.slice(-60)));
}

/**
 * Nedělní přehled příštího týdne (neděle 19–21 h, jednou za týden): počty událostí po dnech, zápasy našich týmů,
 * úkoly s termínem, předpověď ČHMÚ. Přes ntfy (cizí server) bez názvů událostí a textů úkolů – jen počty a časy.
 */
function nedelniPrehled_(hodina) {
  const p = vlastnosti_();
  const ted = new Date(Date.now());
  if (Utilities.formatDate(ted, CASOVE_PASMO, 'u') !== '7' || hodina < 19 || hodina > 21) return;
  const tyden = Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd');
  if (p.getProperty('OHLASENO_TYDEN') === tyden) return;
  const pondeli = Utilities.parseDate(tyden + ' 00:00', CASOVE_PASMO, 'yyyy-MM-dd HH:mm').getTime() + 864e5;
  const vstup = { od: pondeli, udalosti: [], zapasy: [], terminy: [], predpovedi: [], vystrahy: [] };
  try { vstup.udalosti = nactiKalendar_(pondeli, pondeli + 7 * 864e5, false).udalosti; } catch (chyba) { /* bez kalendáře */ }
  try {
    const f = fotbalData_();
    if (f) {
      const nazvy = {};
      (f.tymy || []).forEach(function (t) { nazvy[t.klic] = t.nazev; });
      vstup.zapasy = f.zapasy.map(function (z) { return { zacatek: Date.parse(z.zacatek), tym: nazvy[z.tym] || z.tym, doma: z.doma }; });
    }
  } catch (chyba) { /* bez fotbalu */ }
  try { vstup.terminy = nactiSchranku_().ceka.map(function (x) { return x.termin; }).filter(Boolean); } catch (chyba) { /* bez schránky */ }
  try {
    const poc = pocasi_(false);
    vstup.predpovedi = poc.predpovedi;
    vstup.vystrahy = poc.vystrahy.filter(function (v) { return v.typ !== 'vyhled'; });
  } catch (chyba) { /* bez počasí */ }
  if (upozorni_('Příští týden', TYDEN_.text(vstup), ['calendar'], 3)) p.setProperty('OHLASENO_TYDEN', tyden);
}

/** Text nedělního přehledu – čistá funkce (testuje motor.test.js). Časy v Praze. */
const TYDEN_ = (function () {
  const DNY = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  function datum(ms) { return Utilities.formatDate(new Date(ms), CASOVE_PASMO, 'yyyy-MM-dd'); }
  function denTydne(ms) { return Number(Utilities.formatDate(new Date(ms), CASOVE_PASMO, 'u')) % 7; }
  function cas(ms) { return Utilities.formatDate(new Date(ms), CASOVE_PASMO, 'H:mm'); }
  function text(v) {
    const radky = [];
    const do_ = v.od + 7 * 864e5;
    const dny = [];
    for (let i = 0; i < 7; i++) dny.push(datum(v.od + i * 864e5 + 12 * 36e5));
    // události po dnech (bez zápasů – ty mají vlastní řádek)
    const pocty = {};
    (v.udalosti || []).filter(function (u) { return !/^⚽/.test(u.nazev || '') && u.zacatek < do_ && u.konec > v.od; }).forEach(function (u) {
      const d = datum(Math.max(u.zacatek, v.od));
      if (dny.indexOf(d) >= 0) pocty[d] = (pocty[d] || 0) + 1;
    });
    const celkem = Object.keys(pocty).reduce(function (s, k) { return s + pocty[k]; }, 0);
    radky.push(celkem ? 'Kalendář: ' + celkem + ' (' + dny.filter(function (d) { return pocty[d]; }).map(function (d) {
      return DNY[denTydne(Date.parse(d + 'T12:00:00Z'))] + ' ' + pocty[d];
    }).join(', ') + ')' : 'Kalendář: volný týden');
    const zapasy = (v.zapasy || []).filter(function (z) { return z.zacatek >= v.od && z.zacatek < do_; }).sort(function (a, b) { return a.zacatek - b.zacatek; });
    if (zapasy.length) radky.push('Zápasy: ' + zapasy.map(function (z) { return DNY[denTydne(z.zacatek)] + ' ' + cas(z.zacatek) + ' ' + z.tym + (z.doma ? ' doma' : ' venku'); }).join(' · '));
    const posledni = datum(do_ - 12 * 36e5);
    const terminy = (v.terminy || []).filter(function (t) { return t <= posledni; }).sort();
    if (terminy.length) {
      const prosle = terminy.filter(function (t) { return t < dny[0]; }).length;
      radky.push('Úkoly s termínem: ' + terminy.length + (prosle ? ' (po termínu ' + prosle + ')' : ', první ' + DNY[denTydne(Date.parse(terminy[0] + 'T12:00:00Z'))]));
    }
    const pred = (v.predpovedi || []).filter(function (x) { return dny.indexOf(x.den) >= 0 && x.tMax; });
    if (pred.length) radky.push('Počasí: ' + pred.map(function (x) { return DNY[denTydne(Date.parse(x.den + 'T12:00:00Z'))] + ' ' + x.tMax[1] + ' °C' + (x.ikona === 'dest' || x.ikona === 'bourka' || x.ikona === 'snih' ? ' ' + ({ dest: 'déšť', bourka: 'bouřky', snih: 'sníh' })[x.ikona] : ''); }).join(' · '));
    if ((v.vystrahy || []).length) radky.push('⚠ ' + v.vystrahy.map(function (x) { return x.nazev; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).join(', '));
    return radky.join('\n');
  }
  return { text: text };
})();

/** Ranní souhrn (jednou denně): po probuzení s připraveností z WHOOP, nejpozději v 8 h i bez ní. */
function ranniSouhrn_(hodina) {
  const p = vlastnosti_();
  const dnes = Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'yyyy-MM-dd');
  if (hodina < 6 || hodina > 11 || p.getProperty('OHLASENO_RANO') === dnes) return;
  let pripravenost = null;
  try {
    const mesic = nactiMesicZdravi_(slozkaZdravi_(), dnes.slice(0, 7)).data;
    const den = mesic.dny[dnes];
    pripravenost = den && den.whoop && den.whoop.pripravenost ? den.whoop.pripravenost.skore : null;
  } catch (chyba) { /* bez zdraví */ }
  if (pripravenost == null && hodina < 8 && whoopStav_().propojeno) return; // počkat na WHOOP
  const casti = [];
  try {
    const pulnoc = Utilities.parseDate(dnes + ' 00:00', CASOVE_PASMO, 'yyyy-MM-dd HH:mm').getTime();
    const udalosti = nactiKalendar_(pulnoc, pulnoc + 864e5, false).udalosti.filter(function (u) { return u.celodenni || u.konec > Date.now(); });
    const prvni = udalosti.filter(function (u) { return !u.celodenni; })[0];
    // bez názvů událostí (jde to přes cizí server) – jen počet a čas první
    casti.push(udalosti.length ? udalosti.length + ' v kalendáři' + (prvni ? ', první v ' + Utilities.formatDate(new Date(prvni.zacatek), CASOVE_PASMO, 'H:mm') : '') : 'volný kalendář');
  } catch (chyba) { /* bez kalendáře */ }
  try {
    const ukoly = nactiSchranku_().ceka.filter(function (x) { return !/napad/.test(x.stav || ''); });
    if (ukoly.length) casti.push(ukoly.length + ' ve schránce');
  } catch (chyba) { /* bez schránky */ }
  try {
    const poc = pocasi_(false);
    const pred = poc.predpovedi.filter(function (x) { return x.den === dnes; })[0];
    casti.push((pred && pred.tMax ? pred.tMax[0] + '–' + pred.tMax[1] + ' °C' : 'počasí') + (poc.vystrahy.some(function (v) { return v.typ !== 'vyhled'; }) ? ', ' + poc.souhrn : ''));
  } catch (chyba) { /* bez počasí */ }
  if (pripravenost != null) casti.push('připravenost ' + pripravenost + ' %');
  if (upozorni_('Dobré ráno', casti.join(' · '), ['sunrise'], 3)) {
    p.setProperty('OHLASENO_RANO', dnes);
    if (pripravenost != null) p.setProperty('OHLASENO_ZDRAVI', dnes); // připravenost už byla v souhrnu
  }
}

/** Spustit jednou v editoru (▶): vyrobí téma pro upozornění a vypíše ho do protokolu (vloží se do aplikace ntfy). */
function nastavUpozorneni() {
  const p = vlastnosti_();
  let tema = p.getProperty('NTFY_TEMA');
  if (!tema) {
    tema = 'asistent-' + Utilities.getUuid().replace(/-/g, '').slice(0, 24);
    p.setProperty('NTFY_TEMA', tema);
  }
  Logger.log('Téma pro aplikaci ntfy (server ntfy.sh): ' + tema);
  Logger.log('Pak: Spouštěče (budík vlevo) → Přidat spouštěč → kazdouHodinu → Časový → Hodinový časovač → Každou hodinu.');
  upozorni_('Asistent', 'Upozornění fungují ✓', ['white_check_mark'], 3);
}

// ---------------------------------------------------------------- mezipaměť (CacheService, po kusech)

function ulozDoCache_(klic, objekt, sekund) {
  ulozText_(klic, JSON.stringify(objekt), sekund);
}

function nactiZCache_(klic) {
  const text = nactiText_(klic);
  return text ? JSON.parse(text) : null;
}

/** Jedna hodnota v CacheService má limit 100 kB – delší text se uloží po kusech. */
function ulozText_(klic, text, sekund) {
  const kus = 40000;
  const pocet = Math.ceil(text.length / kus) || 1;
  if (pocet > 60) return; // moc velké – nechat bez mezipaměti
  const hodnoty = {};
  hodnoty[klic] = String(pocet);
  for (let i = 0; i < pocet; i++) hodnoty[klic + ':' + i] = text.slice(i * kus, (i + 1) * kus);
  try {
    CacheService.getScriptCache().putAll(hodnoty, sekund);
  } catch (chyba) { /* mezipaměť je jen zrychlení */ }
}

function nactiText_(klic) {
  const cache = CacheService.getScriptCache();
  const pocet = Number(cache.get(klic) || 0);
  if (!pocet) return null;
  const klice = [];
  for (let i = 0; i < pocet; i++) klice.push(klic + ':' + i);
  const kusy = cache.getAll(klice);
  let text = '';
  for (let i = 0; i < pocet; i++) {
    const k = kusy[klic + ':' + i];
    if (k == null) return null;
    text += k;
  }
  return text;
}

function smazCache_(klic) {
  CacheService.getScriptCache().remove(klic);
}

function md5_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
