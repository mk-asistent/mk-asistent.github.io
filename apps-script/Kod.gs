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
 *   Schránka  – Můj disk / CLAUDE_SCHRANKA / NOVE, CEKA, HOTOVO/RRRR-MM (soubory .md, skill asistent-schranka);
 *               MOJE (+ MOJE/HOTOVO) = Michalovy poznámky „pro mě“ (zkratka „Pro mě“, aplikace) – Claude je nečte
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
 *               stav „zveřejněno“ (vlastnost REELY_STAV); naplánované zveřejnění na Instagram (IG_TOKEN, REELY_PLAN,
 *               spouštěč instagramKazdych10Min)
 *   Zdraví    – WHOOP (API v2, OAuth – návrat přes doGet) + Apple Zdraví ze zkratky v iPhonu (akce zdraviApple, klíč
 *               ZDRAVI_KLIC); data po měsících v CLAUDE_SCHRANKA/ZDRAVI; váha zapsaná z aplikace (ZDRAVI/VAHA.json,
 *               i s časem zápisu)
 *   Upozornění – do iPhonu přes ntfy (NTFY_TEMA, zapíná aplikace); kontroly každých 10 minut se spouštěčem
 *               instagramKazdych10Min (hoří v poště, výstrahy ČHMÚ, ranní souhrn, neděle, WHOOP, reel na Instagramu)
 *   Auto      – náklady a tankování v Michalově tabulce Google (vlastnost AUTO_TABULKA): čtení, zápis nových řádků,
 *               fotky účtenek do CLAUDE_SCHRANKA/AUTO/uctenky + text přes OCR Disku (služba Drive API);
 *               stav auta z MyŠkoda (CLAUDE_SCHRANKA/AUTO/myskoda.json – zapisuje domácí PC, NASTROJE\asistent\myskoda)
 *
 * Postup nasazení: README.md v kořeni repozitáře.
 */

const VERZE = '2026-10-09.4';
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
  // ?verze – nasazovací skript na PC si po nasazení ověří, že běží nová verze (nic tajného)
  if (prm.verze !== undefined) return ContentService.createTextOutput(VERZE);
  return ContentService.createTextOutput('Asistent – motor běží.');
}

function doPost(e) {
  let vystup, rid = '';
  try {
    let data;
    try {
      data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (chyba) {
      throw new Error('Nečitelný požadavek.');
    }
    // zkratka Zdraví v iPhonu má vlastní klíč jen pro zápis dat (hlavní klíč otevírá poštu). Mezery a odřádkování kolem
    // klíče (kopírování v iPhonu) nevadí a klíč zkratky stačí i bez pole akce. Běžné požadavky aplikace (hlavní klíč)
    // klíč zkratky vůbec nečtou.
    const klicZpravy = typeof data.klic === 'string' ? data.klic.trim() : '';
    const klicZdravi = data.akce === 'zdraviApple' || (klicZpravy && klicZpravy !== klicApi_()) ? klicZdravi_() : null;
    const odZkratky = !!klicZdravi && klicZpravy === klicZdravi;
    if (data.akce === 'zdraviApple' || odZkratky) {
      if (odZkratky) {
        vystup = { ok: true, data: zapisApple_(data) };
        oznacZmenu_('zdravi');
      } else {
        // výsledek pokusu ukáže aplikace (Nastavení → Zdraví) a důvod dostane i zkratka – klíč se nikam nezapisuje
        const zprava = klicZpravy && klicZpravy === klicApi_()
          ? 'Ve zkratce je hlavní klíč aplikace (otevírá poštu) – vyměň ho za klíč pro zkratku z Nastavení → Zdraví.'
          : 'Klíč ve zkratce nesedí s klíčem pro zkratku (Nastavení → Zdraví → Ukázat klíč) – vlož ho znovu.';
        zapisPosledniApple_({ ok: false, pole: poleApple_(data), chyba: zprava });
        vystup = { ok: false, chyba: 'klic', zprava: zprava };
      }
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
      // Google odpověď na POST občas ztratí (prohlížeč pak skončí na doGet) a aplikace to zkusí znovu se stejným rid:
      // zápis se podruhé neprovede – vrátí se výsledek prvního běhu (počká, až doběhne)
      if (CTENI_MOTORU.indexOf(data.akce) < 0 && typeof data.rid === 'string' && /^[\w-]{8,64}$/.test(data.rid)) {
        rid = 'RID:' + data.rid;
        const minule = vysledekRid_(rid);
        if (minule) return ContentService.createTextOutput(minule).setMimeType(ContentService.MimeType.JSON);
        CacheService.getScriptCache().put(rid, 'BEZI', 300);
      }
      vystup = { ok: true, data: AKCE[data.akce](data) };
      if (rid) ulozText_(rid, JSON.stringify(vystup), 600);
      // zápis k autu (tabulka, účtenka, termín…) nebo ke zdraví (voda, jídlo, doplňky, váha) → značka změny; server ji
      // posílá s kopiemi a jiná zařízení si podle ní data načtou znovu
      oznacZmenu_(oblastZapisu_(data.akce));
    }
  } catch (chyba) {
    vystup = { ok: false, chyba: String((chyba && chyba.message) || chyba) };
    if (rid) { try { CacheService.getScriptCache().remove(rid); } catch (e2) { /* příště znovu */ } }
  }
  return ContentService.createTextOutput(JSON.stringify(vystup)).setMimeType(ContentService.MimeType.JSON);
}

// akce, které jen čtou – opakovat je jde bez rizika (bez zapamatované odpovědi)
const CTENI_MOTORU = ['info', 'schranka', 'posta', 'vlakno', 'hledat', 'kalendar', 'kalendare', 'pocasi', 'zdravi', 'fotbal', 'reely', 'dochazka',
  'stitky', 'kontakty', 'postaStitek', 'postaKategorie', 'auto', 'upozorneni', 'autoUctenkaFoto', 'davka', 'zmeny', 'plakaty'];

/** Výsledek dřívějšího běhu téhož požadavku (JSON), nebo null; když ještě běží, počká na něj (nejvýš ~25 s). */
function vysledekRid_(rid) {
  const cache = CacheService.getScriptCache();
  for (let i = 0; i < 25; i++) {
    const stav = cache.get(rid);
    if (!stav) return null;
    if (stav !== 'BEZI') return nactiText_(rid);
    Utilities.sleep(1000);
  }
  return JSON.stringify({ ok: false, chyba: 'Požadavek se ještě zpracovává – za chvíli obnov stránku (nic se nezapíše dvakrát).' });
}

// co motor umí uvnitř akcí (aplikace podle toho ukáže nová tlačítka i u starší verze motoru je schová)
const SCHOPNOSTI = ['polozkaUpravy', 'polozkaTermin'];

const AKCE = {
  info: function () {
    return { verze: VERZE, akce: Object.keys(AKCE).concat(SCHOPNOSTI), ucet: mojeAdresa_(), posta: nastaveniPosty_(), kalendare: seznamKalendaru_(),
      skupinyHostu: skupinyHostu_(), pocasi: infoPocasi_(), jmeniny: jmeninyOblibeni_() };
  },
  skupinyHostuUlozit: function (d) { return ulozSkupinyHostu_(d.skupiny); },
  jmeninyUlozit: function (d) { return ulozJmeniny_(d.oblibeni); },
  nastavPostu: function (d) { return nastavPostu_(d.pracovniAdresa); },
  schranka: function () { return nactiSchranku_(); },
  poznamka: function (d) { return pridejPoznamku_(d.text); },
  polozka: function (d) { return upravPolozku_(d.id, d.jak, d.text); },
  // smazání poznámky schránky (pravé tlačítko v aplikaci) do koše na Disku a Vrátit; moje poznámky „pro mě“ (MOJE)
  schrankaSmazat: function (d) { return doKose_(d.id, true); },
  schrankaObnovit: function (d) { return doKose_(d.id, false); },
  mojePridat: function (d) { return mojePridej_(d.text); },
  mojeHotovo: function (d) { return mojeHotovo_(d.id, !!d.zpet); },
  mojeSmazat: function (d) { return mojeSmaz_(d.id); },
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
  pocasi: function (d) { return pocasi_(!!d.znovu, d.poloha || null); }, // bez polohy z aplikace = výchozí místo (domov)
  pocasiDomov: function (d) { return pocasiDomov_(d); },
  stitky: function (d) { return stitkyGmailu_(!!d.znovu); },
  postaStitek: function (d) { return postaStitku_(d.nazev); },
  postaKategorie: function (d) { return postaKategorie_(d.kategorie, !!d.znovu); },
  postaPresunout: function (d) { return presunDoStitku_(d.id, d.stitek, d.pridat !== false, !!d.archivovat, !!d.novy); },
  postaPrectene: function (d) { return prectiKategorii_(d.kategorie); },
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
  reelNaplanovat: function (d) { return naplanujReel_(d.id, d.kdy, d.oznacit, d.popisek, !!d.pribeh); },
  reelZrusitPlan: function (d) { return zrusPlanReelu_(d.id); },
  plakaty: function () { return plakaty_(); },
  plakatUlozit: function (d) { return plakatUlozit_(d); },
  plakatNastaveni: function (d) { return plakatNastaveni_(d); },
  plakatPopisek: function (d) { return plakatPopisek_(d); },
  plakatPopisekUlozit: function (d) { return plakatPopisekUlozit_(d); },
  plakatObrazky: function (d) { return plakatObrazky_(d); },
  plakatNaplanovat: function (d) { return plakatNaplanovat_(d); },
  plakatZrusitPlan: function (d) { return plakatZrusitPlan_(d); },
  vaha: function (d) { return vaha_(d); },
  doplnky: function (d) { return doplnky_(d); },
  pitiJidlo: function (d) { return pitiJidlo_(d); },
  upozorneni: function () { return upozorneniStav_(); },
  upozorneniZapnout: function () { return upozorneniZapnout_(); },
  upozorneniTest: function () { return { odeslano: upozorni_('Asistent', 'Zkušební upozornění ✓', ['white_check_mark'], 3) }; },
  upozorneniVypnout: function () { return upozorneniVypnout_(); },
  auto: function () { return auto_(); },
  autoNastavit: function (d) { return autoNastavit_(d.odkaz); },
  autoZapsat: function (d) { return autoZapsat_(d); },
  autoSmazat: function (d) { return autoSmazat_(d); },
  autoUctenka: function (d) { return autoUctenka_(d); },
  autoUpravit: function (d) { return autoUpravit_(d); },
  autoUctenkaFoto: function (d) { return autoUctenkaFoto_(d); },
  autoPeceZapsat: function (d) { return autoPeceZapsat_(d); },
  autoTermin: function (d) { return autoTermin_(d); },
  // značky změn: kdy se naposledy zapisovalo (auto, zdraví) – server je posílá s každou obnovou, aplikace podle nich načítá
  zmeny: function () { return zmeny_(); },
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
// (zmeny chyběly – server je chtěl v dávce každých 10 min a dostával „Akci nejde poslat v dávce“, kopie značek nevznikla)
const DAVKA_AKCE = ['info', 'schranka', 'kalendar', 'pocasi', 'zdravi', 'fotbal', 'reely', 'dochazka', 'stitky', 'kontakty', 'zmeny', 'plakaty'];

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

/** Spustit jednou po doplnění oprávnění k Tabulkám do manifestu: Google se zeptá na povolení a vypíše, jestli tabulka auta jde otevřít. */
function povolitTabulky() {
  const id = vlastnosti_().getProperty('AUTO_TABULKA');
  if (!id) {
    SpreadsheetApp.flush();
    Logger.log('Tabulky Google povolené ✓ Tabulku auta propoj v aplikaci (stránka Auto → vložit odkaz).');
    return;
  }
  Logger.log('Tabulka auta: ' + SpreadsheetApp.openById(id).getName() + ' ✓');
}

// ---------------------------------------------------------------- Schránka

function nactiSchranku_() {
  const koren = koren_();
  // poznámky pro Clauda od motoru (jídlo k odhadu, hodnocení dne) jsou jen vnitřní pokyn – aplikace je neukazuje
  const viditelne = function (f) { return !SKRYTE_POZNAMKY.test(f.getName()); };
  const nove = soubory_(podslozka_(koren, 'NOVE')).filter(viditelne).map(function (f) { return polozka_(f, 'NOVE'); });
  const ceka = soubory_(podslozka_(koren, 'CEKA')).filter(viditelne).map(function (f) { return polozka_(f, 'CEKA'); });

  // HOTOVO je po měsících (HOTOVO/2026-10); stačí poslední dva měsíce + soubory přímo v HOTOVO
  const hotovoSlozka = podslozka_(koren, 'HOTOVO');
  let hotovo = soubory_(hotovoSlozka);
  const mesice = [];
  const it = hotovoSlozka.getFolders();
  while (it.hasNext()) mesice.push(it.next());
  mesice.sort(function (a, b) { return b.getName().localeCompare(a.getName()); });
  mesice.slice(0, 2).forEach(function (m) { hotovo = hotovo.concat(soubory_(m)); });
  hotovo.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });
  hotovo = hotovo.filter(viditelne).slice(0, MAX_VYRIZENYCH).map(function (f) { return polozka_(f, 'HOTOVO'); });

  // kdy Claude naposledy zpracoval schránku (obnovil PREHLED.md) – aplikace pozná, že úloha neběží (PC vypnuté)
  const prehled = koren.getFilesByName('PREHLED.md');
  const zpracovano = prehled.hasNext() ? prehled.next().getLastUpdated().getTime() : null;
  return { nove: nove, ceka: ceka, hotovo: hotovo, moje: mojePoznamky_(koren), zpracovano: zpracovano, ted: Date.now() };
}

/** Poznámka napsaná nebo nadiktovaná přímo v aplikaci. */
function pridejPoznamku_(text) {
  return polozka_(novaPoznamka_('NOVE', text), 'NOVE');
}

/** Nový soubor poznámky ve složce schránky (NOVE, MOJE) – stejný tvar jako ze zkratky v iPhonu (hlavička kdy, odkud). */
function novaPoznamka_(nazevSlozky, text) {
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
  return podslozka_(koren_(), nazevSlozky).createFile(nazev, obsah, MimeType.PLAIN_TEXT);
}

// ---- Moje poznámky (Michal 9. 10.: „poznámku sám pro sebe na později … ať se zobrazí na hlavní stránce pro mě“).
// CLAUDE_SCHRANKA/MOJE/*.md ve stejném tvaru jako NOVE (hlavička kdy, odkud) – píše je zkratka „Pro mě“ (Apps Script
// schránky) i aplikace (mojePridat). Hotové → MOJE/HOTOVO, smazané → koš na Disku (30 dní, Vrátit = schrankaObnovit).
// Claude je nezpracovává (jeho úloha čte jen NOVE). Rozebraný soubor se pamatuje jako ostatní poznámky (polozka_).
const MAX_MOJICH = 50;
const MAX_TEXTU_MOJE = 10000;

/** Aktivní moje poznámky, nejnovější nahoře, nejvýš 50: [{ id, text, kdy, odkud }]. Složku MOJE nezakládá. */
function mojePoznamky_(koren) {
  const slozky = koren.getFoldersByName('MOJE');
  if (!slozky.hasNext()) return [];
  // názvy začínají časem zápisu (RRRR-MM-DD_HHMMSS) → nejnovější podle názvu, pak přesně podle hlavičky kdy
  return soubory_(slozky.next()).reverse().slice(0, MAX_MOJICH).map(mojePoznamka_)
    .sort(function (a, b) { return b.kdy - a.kdy; });
}

function mojePoznamka_(soubor) {
  const p = polozka_(soubor, 'MOJE');
  return { id: p.id, text: p.text.length > MAX_TEXTU_MOJE ? p.text.slice(0, MAX_TEXTU_MOJE - 1) + '…' : p.text, kdy: p.kdy, odkud: p.odkud };
}

/** Moje poznámka z aplikace → MOJE (vrátí ji ve tvaru jako v seznamu). */
function mojePridej_(text) {
  return mojePoznamka_(novaPoznamka_('MOJE', text));
}

/** Hotovo: MOJE → MOJE/HOTOVO; zpet = Vrátit (MOJE/HOTOVO → MOJE). Vrací poznámku. */
function mojeHotovo_(id, zpet) {
  return sePoznamkou_(id, function (soubor, misto, koren) {
    if (misto !== (zpet ? 'MOJE/HOTOVO' : 'MOJE')) throw new Error(zpet ? 'Poznámka není mezi hotovými.' : 'Poznámka není mezi mými poznámkami.');
    if (soubor.isTrashed()) throw new Error('Poznámka je v koši.');
    const moje = podslozka_(koren, 'MOJE');
    soubor.moveTo(zpet ? moje : podslozka_(moje, 'HOTOVO'));
    return mojePoznamka_(soubor);
  });
}

/** Moje poznámka (aktivní i hotová) → koš na Disku. */
function mojeSmaz_(id) {
  return sePoznamkou_(id, function (soubor, misto) {
    if (misto !== 'MOJE' && misto !== 'MOJE/HOTOVO') throw new Error('Poznámka není mezi mými poznámkami.');
    soubor.setTrashed(true);
    return true;
  });
}

/** Poznámka schránky (NOVE, CEKA, HOTOVO, MOJE) do koše na Disku (smazat) nebo zpět z koše (Vrátit v aplikaci). */
function doKose_(id, smazat) {
  return sePoznamkou_(id, function (soubor) {
    soubor.setTrashed(!!smazat);
    return true;
  });
}

/** Najde poznámku podle id, ověří, že leží ve stromu schránky (jinak chyba – cizí soubor na Disku), a pod zámkem
 *  zavolá fn(soubor, misto, koren). */
function sePoznamkou_(id, fn) {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    let soubor;
    try { soubor = DriveApp.getFileById(String(id || '')); } catch (chyba) { throw new Error('Poznámka nenalezena.'); }
    const koren = koren_();
    const misto = mistoPoznamky_(soubor, koren);
    if (!misto) throw new Error('Soubor není ve schránce.');
    return fn(soubor, misto, koren);
  } finally {
    zamek.releaseLock();
  }
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
  const misto = mistoPoznamky_(soubor, koren);
  return misto === 'NOVE' || misto === 'CEKA' || misto === 'HOTOVO';
}

/** Kde leží poznámka (.md) ve stromu schránky: 'NOVE' | 'CEKA' | 'HOTOVO' (i HOTOVO/RRRR-MM) | 'MOJE' | 'MOJE/HOTOVO';
 *  '' = jiný soubor (mimo schránku, jiná složka, ne .md). Rodiče se čtou i u souboru v koši (Vrátit). */
function mistoPoznamky_(soubor, koren) {
  if (!/\.md$/i.test(soubor.getName())) return '';
  const korenId = koren.getId();
  const cesta = [];
  let rodice = soubor.getParents();
  for (let hloubka = 0; hloubka < 3 && rodice.hasNext(); hloubka++) {
    const r = rodice.next();
    if (r.getId() === korenId) {
      const c = cesta.reverse().join('/');
      if (['NOVE', 'CEKA', 'HOTOVO', 'MOJE', 'MOJE/HOTOVO'].indexOf(c) >= 0) return c;
      return /^HOTOVO\/\d{4}-\d{2}$/.test(c) ? 'HOTOVO' : '';
    }
    cesta.push(r.getName());
    rodice = r.getParents();
  }
  return '';
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
  // nejdřív jen dotazy (levné): pořadí vláken, nepřečtená a návrhy od Clauda dají otisk Doručené. Server se ptá
  // každých 10 minut – beze změny se vrátí uložený seznam a zprávy se nenačítají (denní limit Gmailu, 5. 10.)
  const hledej = function (dotaz, max) { return { dotaz: dotaz, vlakna: GmailApp.search(dotaz, 0, max || MAX_VLAKEN) }; };
  const filtrPrac = prac ? ' ' + filtrPracovni_(prac) : null;
  const filtrOsob = prac ? ' -to:' + prac + ' -cc:' + prac + ' -deliveredto:' + prac : '';
  const dotazy = {
    pracovni: filtrPrac == null ? null : [hledej(zaklad + filtrPrac), hledej(starsi + filtrPrac, MAX_STARSICH)],
    osobni: [hledej(zaklad + filtrOsob), hledej(starsi + filtrOsob, MAX_STARSICH)]
  };
  let navrhy = {};
  try { navrhy = nactiNavrhy_(); } catch (chyba) { navrhy = {}; }
  const idy = function (h) { return h.vlakna.map(function (v) { return v.getId(); }); };
  const otisk = md5_(JSON.stringify([prac, dotazy.pracovni ? dotazy.pracovni.map(idy) : null, dotazy.osobni.map(idy),
    GmailApp.search('in:inbox is:unread newer_than:' + DNI_STARSI_POSTY + 'd', 0, 200).map(function (v) { return v.getId(); }).sort(),
    Object.keys(navrhy).sort().map(function (k) { return k + ':' + navrhy[k].zpravaId; })]));
  const doplnPostu = function (v) {
    v.firemni = nactiFiremni_(); // souhrny z PC (náhradní zdroj, když se pracovní pošta nepřeposílá)
    v.pocty = null;              // nepřečtené v Promoakcích, Sociálních sítích a Fórech (čísla u záložek)
    v.prehled = null;            // přehled od Clauda (POSTA_PREHLED.json)
    try { v.pocty = poctyKategorii_(znovu); } catch (chyba) { /* záložky bez čísel */ }
    try { v.prehled = nactiPrehledPosty_(); } catch (chyba) { /* bez přehledu */ }
    v.ted = Date.now();
    // 5 minut: každá změna z aplikace (odeslání, archiv, přečteno…) mezipaměť maže, Obnovit ji obchází
    ulozDoCache_('posta', v, 300);
    return v;
  };
  if (!znovu) {
    const plna = nactiZCache_('posta-plna');
    if (plna && plna.otisk === otisk && plna.vysledek) return doplnPostu(plna.vysledek);
  }
  const ucet = function (h, nazev) {
    return spojVlakna_(seznamVlaken_(h[0].dotaz, ja, prac, nazev, null, h[0].vlakna, true),
      seznamVlaken_(h[1].dotaz, ja, prac, nazev, MAX_STARSICH, h[1].vlakna, true).filter(nevyrizene));
  };
  const pracovni = dotazy.pracovni ? ucet(dotazy.pracovni, 'pracovni') : [];
  // hledání jde po zprávách – vlákno s osobní i pracovní zprávou by bylo dvakrát; patří k pracovní
  const vPracovni = {};
  pracovni.forEach(function (v) { vPracovni[v.id] = true; });
  const osobni = ucet(dotazy.osobni, 'osobni').filter(function (v) { return !vPracovni[v.id]; });
  // podklady pro návrhy odpovědí od Clauda (jen na Disk, do aplikace nejdou) + značka „návrh“ u konverzace
  const kOdpovedi = [];
  osobni.concat(pracovni).forEach(function (v) {
    if (v._odpoved) {
      kOdpovedi.push({ id: v.id, zpravaId: v._odpoved.zpravaId, ucet: v.ucet, stav: v.stav, od: v.od, odAdresa: v.odAdresa, predmet: v.predmet, kdy: v.kdy, text: v._odpoved.text });
      const n = navrhy[v.id];
      if (n && n.zpravaId === v._odpoved.zpravaId && n.text) v.navrh = true;
    }
    delete v._odpoved;
  });
  try { ulozPostuKOdpovedi_(kOdpovedi); } catch (chyba) { /* pošta se ukáže i bez podkladů */ }
  const vysledek = { osobni: osobni, pracovni: pracovni, pracovniAdresa: prac };
  // sestavený seznam s otiskem hodinu – pak se sestaví znovu (termíny „dnes / zítra“ se posouvají)
  ulozDoCache_('posta-plna', { otisk: otisk, vysledek: vysledek }, 3600);
  return doplnPostu(vysledek);
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
 * Denní limit Gmailu (20 000 volání): předmět, datum, nepřečteno a hvězdička se berou ze zpráv načtených jedním
 * getMessagesForThreads – metody vlákna (isUnread, getLastMessageDate…) jsou každá zvlášť volání a server poštu
 * obnovuje každých 10 minut (5. 10. to limit vyčerpalo).
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
    const ukazka = cistyText_(posledni.getPlainBody()).slice(0, 180);
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
      predmet: (zpravy[i][0] && zpravy[i][0].getSubject()) || '(bez předmětu)',
      ukazka: (cekas && prvniRadek_(vlastniText_(posledni))) || ukazka,
      kdy: posledni.getDate().getTime(),
      neprectena: zpravy[i].some(function (m) { return m.isUnread(); }),
      hvezdicka: zpravy[i].some(function (m) { return m.isStarred(); }),
      stitky: stitky[i],
      pocet: seznam.length,
      odkaz: odkazGmail_(vlakno.getId()),
      termin: s.termin ? s.termin.ms : null, // termín z poslední zprávy (23:59 toho dne v Praze)
      terminVeta: s.termin ? s.termin.veta : '',
      poTerminu: !!s.termin && s.termin.ms < ted,
      cekasOd: cekas ? posledni.getDate().getTime() : null
    };
    if (oznameni[vlakno.getId()]) polozka.aktualizace = true; // kategorie Aktualizace – v aplikaci vlastní záložka
    if (kOdpovedi) polozka._odpoved = { zpravaId: odesilatel.getId(), text: vlastniText_(odesilatel) };
    return polozka;
  });
}

// Neviditelné znaky, kterými reklamní e-maily vycpávají náhled („‌ ‌ ‌…“), a zbytky obrázků a odkazů z textové verze.
const NEVIDITELNE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u3164\ufeff\uffa0]/g;

/** Text pro náhled: bez neviditelných znaků, „[image: …]“ a osamělých „<“ po odkazech, mezery sloučené. */
function cistyText_(s) {
  return String(s || '').replace(NEVIDITELNE, '').replace(/\[image:[^\]]*\]/gi, ' ').replace(/(^|\s)<(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ').trim();
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

const STITKY_SEKUND = 21600; // štítky vlákna se mění zřídka (filtr při doručení, přesun z aplikace mezipaměť maže)
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

// ---------------------------------------------------------------- Pošta – kategorie jako v Gmailu, přesun do štítku, přehled od Clauda
// Doručená (nactiPostu_) nese Primární i Aktualizace – aplikace je rozdělí do dvou záložek podle `aktualizace`.
// Promoakce, Sociální sítě a Fóra se načtou až na klepnutí na záložku. Balast z kategorií (odesílatel, předmět, začátek
// textu – za 2 dny) jde jednou za 4 hodiny na Disk do POSTA_K_PREHLEDU.json; naplánovaná úloha Clauda z něj napíše
// POSTA_PREHLED.json (co vyřídit, co by Michala mohlo zajímat, zbytek jednou větou) a aplikace ho ukáže v Poště.

const KATEGORIE_GMAILU = { aktualizace: 'updates', promo: 'promotions', socialni: 'social', fora: 'forums' };
const MAX_VLAKEN_KATEGORIE = 40;
const DNI_KATEGORIE = 30;
const MAX_POCTU = 50;          // víc nepřečtených se nepočítá („50+“)
const PREHLED_POSTY_HODIN = 4;
const MAX_K_PREHLEDU = 30;     // konverzací z jedné kategorie do podkladů
const PREHLED_STITKY = 'VÝVOJ'; // skupiny (štítky), které Claude v přehledu taky projde – vlastnost PREHLED_STITKY (čárkou)

function stitkyKPrehledu_() {
  return String(vlastnosti_().getProperty('PREHLED_STITKY') || PREHLED_STITKY).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function kategorieGmailu_(k) {
  const g = KATEGORIE_GMAILU[k];
  if (!g) throw new Error('Neznámá kategorie pošty.');
  return g;
}

/** Konverzace kategorie (v Doručené, posledních 30 dní) – na klepnutí na záložku, 5 minut v mezipaměti. */
function postaKategorie_(k, znovu) {
  const g = kategorieGmailu_(k);
  if (!znovu) {
    const ulozene = nactiZCache_('posta-' + k);
    if (ulozene) return ulozene;
  }
  const ja = mojeAdresa_().toLowerCase();
  const prac = pracovniAdresa_();
  const vysledek = { kategorie: k, vlakna: seznamVlaken_('in:inbox category:' + g + ' newer_than:' + DNI_KATEGORIE + 'd', ja, prac, null, MAX_VLAKEN_KATEGORIE), ted: Date.now() };
  ulozDoCache_('posta-' + k, vysledek, 300);
  return vysledek;
}

/** Nepřečtené v Promoakcích, Sociálních sítích a Fórech (čísla u záložek jako v Gmailu) – 10 minut v mezipaměti. */
function poctyKategorii_(znovu) {
  if (!znovu) {
    const ulozene = nactiZCache_('posta-pocty');
    if (ulozene) return ulozene;
  }
  const pocty = {};
  ['promo', 'socialni', 'fora'].forEach(function (k) {
    pocty[k] = GmailApp.search('in:inbox is:unread category:' + KATEGORIE_GMAILU[k], 0, MAX_POCTU).length;
  });
  ulozDoCache_('posta-pocty', pocty, 1200);
  return pocty;
}

/**
 * Přesun do štítku (skupiny) jako „Přesunout do“ v Gmailu: štítek + pryč z Doručené; s archivovat: false jen štítek,
 * pridat: false štítek odebere, novy: true štítek založí, když ještě není. Vrací štítky konverzace.
 */
function presunDoStitku_(id, nazev, pridat, archivovat, novy) {
  const vlakno = vlakno_(id);
  nazev = String(nazev || '').replace(/\s+/g, ' ').trim();
  let stitek = nazev ? GmailApp.getUserLabelByName(nazev) : null;
  if (!stitek && novy && pridat) {
    if (nazev.length > 40 || /^\/|\/$|\/\/|[\\"<>]/.test(nazev)) throw new Error('Název skupiny: nejvýš 40 znaků, bez \\ " < > a lomítek na krajích.');
    stitek = GmailApp.createLabel(nazev);
  }
  if (!stitek) throw new Error('Štítek „' + nazev + '“ v Gmailu není.');
  if (pridat) {
    stitek.addToThread(vlakno);
    if (archivovat) {
      zrusOdlozeni_(vlakno, true); // před archivem – rozhoduje, jestli je teď v Doručených
      vlakno.moveToArchive();
    }
  } else {
    stitek.removeFromThread(vlakno);
  }
  CacheService.getScriptCache().remove('stitky:' + vlakno.getId());
  smazCache_('posta');
  smazCache_('stitky');
  let stitky = [];
  try { stitky = vlakno.getLabels().map(function (l) { return l.getName(); }); } catch (chyba) { stitky = []; }
  return { id: vlakno.getId(), stitky: stitky, archivovano: !!(pridat && archivovat) };
}

/** „Označit vše jako přečtené“ v záložce kategorie – nepřečtené v Doručené, nejvýš 100 najednou. */
function prectiKategorii_(k) {
  const g = kategorieGmailu_(k);
  const vlakna = GmailApp.search('in:inbox is:unread category:' + g, 0, 100);
  if (vlakna.length) GmailApp.markThreadsRead(vlakna);
  smazCache_('posta');
  return { precteno: vlakna.length, ids: vlakna.map(function (v) { return v.getId(); }) };
}

/**
 * Podklady pro přehled od Clauda: Aktualizace, Promoakce, Sociální sítě a Fóra za 2 dny (v Doručené) – odesílatel,
 * předmět, začátek textu. Ze spouštěče jednou za 4 hodiny (7–22 h), soubor se přepíše jen při změně. Jen na Disk.
 */
function ulozPostuKPrehledu_(vynutit) {
  const p = vlastnosti_();
  const ted = Date.now();
  if (!vynutit && ted - Number(p.getProperty('PREHLED_POSTY_KDY') || 0) < PREHLED_POSTY_HODIN * 36e5 - 10 * 60e3) return false;
  p.setProperty('PREHLED_POSTY_KDY', String(ted));
  const zpravy = [];
  const videno = {};
  const pridej = function (vlakna, kategorie, stitek) {
    vlakna = vlakna.filter(function (v) { return !videno[v.getId()]; });
    const obsah = vlakna.length ? GmailApp.getMessagesForThreads(vlakna) : [];
    vlakna.forEach(function (v, i) {
      const posledni = obsah[i][obsah[i].length - 1];
      if (!posledni || (stitek && posledni.getDate().getTime() < ted - 2 * 864e5)) return; // ze štítku jen čerstvé (kategorie hlídá dotaz)
      videno[v.getId()] = true;
      const z = { id: v.getId(), kategorie: kategorie, od: jmeno_(posledni.getFrom()), odAdresa: adresa_(posledni.getFrom()),
        predmet: obsah[i][0].getSubject() || '(bez předmětu)',
        ukazka: cistyText_(String(posledni.getPlainBody() || '').replace(/https?:\/\/\S+/g, '')).slice(0, 300),
        kdy: posledni.getDate().getTime(), neprectena: obsah[i].some(function (m) { return m.isUnread(); }) };
      if (stitek) z.stitek = stitek;
      zpravy.push(z);
    });
  };
  Object.keys(KATEGORIE_GMAILU).forEach(function (k) {
    pridej(GmailApp.search('in:inbox category:' + KATEGORIE_GMAILU[k] + ' newer_than:2d', 0, MAX_K_PREHLEDU), k, '');
  });
  // skupiny jako VÝVOJ: filtr je může dávat mimo Doručenou – selhání automatizací má Claude vidět i tak
  stitkyKPrehledu_().forEach(function (n) {
    const stitek = GmailApp.getUserLabelByName(n);
    if (!stitek) return;
    pridej(stitek.getThreads(0, 15), 'stitek', n);
  });
  const otisk = md5_(JSON.stringify(zpravy.map(function (z) { return [z.id, z.kdy]; })));
  if (p.getProperty('PREHLED_POSTY_OTISK') === otisk) return false;
  const text = JSON.stringify({ vytvoreno: new Date(ted).toISOString(), zpravy: zpravy }, null, 1);
  const koren = koren_();
  const it = koren.getFilesByName('POSTA_K_PREHLEDU.json');
  if (it.hasNext()) it.next().setContent(text); else koren.createFile('POSTA_K_PREHLEDU.json', text, 'application/json');
  p.setProperty('PREHLED_POSTY_OTISK', otisk);
  return true;
}

/** Přehled od Clauda (POSTA_PREHLED.json) pro aplikaci – jen očištěné položky, nebo null. */
function nactiPrehledPosty_() {
  const it = koren_().getFilesByName('POSTA_PREHLED.json');
  if (!it.hasNext()) return null;
  let d;
  try { d = JSON.parse(it.next().getBlob().getDataAsString('UTF-8')); } catch (chyba) { return null; }
  if (!d || typeof d !== 'object') return null;
  const text = function (x, n) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n); };
  const polozky = function (seznam) {
    return (Array.isArray(seznam) ? seznam : []).slice(0, 8).map(function (x) {
      x = x || {};
      return { id: /^[0-9a-zA-Z_-]{1,40}$/.test(String(x.id || '')) ? String(x.id) : '', od: text(x.od, 80), predmet: text(x.predmet, 200),
        proc: text(x.proc, 300), kategorie: KATEGORIE_GMAILU[x.kategorie] ? x.kategorie : '' };
    }).filter(function (x) { return x.predmet || x.proc; });
  };
  return {
    vytvoreno: text(d.vytvoreno, 40), prosel: Math.max(0, Number(d.prosel) || 0),
    dulezite: polozky(d.dulezite), zajimave: polozky(d.zajimave),
    ostatni: (Array.isArray(d.ostatni) ? d.ostatni : []).slice(0, 10).map(function (x) {
      x = x || {};
      return { skupina: text(x.skupina, 60), pocet: Math.max(0, Number(x.pocet) || 0), text: text(x.text, 300) };
    }).filter(function (x) { return x.skupina || x.text; })
  };
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
// automatická odpověď (mimo kancelář, dovolená) – její „v urgentních záležitostech volejte…“ není naléhavost od člověka
const AUTOODPOVED = new RegExp('^\\s*(?:automatick[áa] odpov[ěe]ď|automatic reply|auto(?:matic)?[- ]?(?:reply|response)|out of (?:the )?office|' +
  'mimo kancel[áa][řr]|nep[řr][íi]tomnost|abwesenheitsnotiz)' + PISMENO_ZA, 'iu');
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
  if (AUTOODPOVED.test(String(posledni.getSubject() || ''))) return vysledek('info', 'automatická odpověď (mimo kancelář)');
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
  data.plan = planReelu_();
  data.popiskyPlanu = igUpravenePopisky_();
  data.instagram = igStav_();
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

// ---------------------------------------------------------------- Instagram: naplánované zveřejnění reelů (@fkagrovnorovy)
//
// Instagram API s přihlášením přes Instagram – Meta aplikace „Asistent FK Vnorovy“ (vývojový režim, klubový účet je v ní
// tester). Klíč IG_TOKEN vložil Michal do Vlastností skriptu (platí 60 dní, motor ho jednou týdně obnoví). Plán je ve
// vlastnosti REELY_PLAN { id: { kdy, stav: ceka | nahrava | zverejnuji | hotovo | chyba, kontejner, media, odkaz, chyba } }.
// Spouštěč instagramKazdych10Min (Michal ho přidá v editoru) zveřejní, co je na řadě. Instagram si video stahuje z adresy,
// proto video na Disku dostane na pár minut tajný odkaz (Michal souhlasil 5. 10.) a hned po stažení se sdílení vypne.
// Popisek je přesně ten z popisky\*.txt (reely.json) – motor ho nemění.

const IG_API = 'https://graph.instagram.com/v23.0/';
const IG_OBNOVA_KLICE = 7 * 864e5;  // klíč platí 60 dní – obnovit jednou týdně
const IG_CEKANI_MS = 4 * 60e3;      // v jednom běhu spouštěče čekat na zpracování videa nejvýš 4 minuty, pak příště
const IG_POKUSU = 3;                // výpadek při čekání nebo zveřejnění – tolikrát zkusit znovu, pak chyba
const MAX_PLANU = 25;               // vlastnost má limit 9 kB
const IG_POPISEK = 'REELY_POPISEK:'; // + id reelu = popisek upravený v aplikaci jen pro Instagram (soubor na PC se nemění)
const IG_UCET_JMENO = /^[a-z0-9._]{1,30}$/i;

/** Účty k označení: „@dorost_agro, klub“ nebo pole → ['dorost_agro', 'klub'] (nejvýš 5, jen platná jména). */
function igOznacit_(x) {
  const seznam = (Array.isArray(x) ? x : String(x || '').split(/[\s,;]+/)).map(function (u) { return String(u).trim().replace(/^@/, ''); }).filter(Boolean);
  const ven = [];
  seznam.forEach(function (u) {
    if (!IG_UCET_JMENO.test(u)) throw new Error('Neplatné jméno účtu na Instagramu: ' + u);
    if (ven.indexOf(u.toLowerCase()) < 0) ven.push(u.toLowerCase());
  });
  if (ven.length > 5) throw new Error('Označit jde nejvýš 5 účtů.');
  return ven;
}

function igPopisek_(id) { return vlastnosti_().getProperty(IG_POPISEK + id) || ''; }

/** Upravené popisky naplánovaných reelů { id: text } – jen naše vlastnosti, nic jiného ven. */
function igUpravenePopisky_() {
  const v = vlastnosti_().getProperties();
  const ven = {};
  Object.keys(v).forEach(function (k) { if (k.indexOf(IG_POPISEK) === 0) ven[k.slice(IG_POPISEK.length)] = v[k]; });
  return ven;
}

function igKlic_() {
  const k = vlastnosti_().getProperty('IG_TOKEN');
  if (!k) throw new Error('Instagram není propojený – chybí IG_TOKEN ve Vlastnostech skriptu.');
  return k.trim();
}

/** Volání Instagram API; klíč nikdy do chyby ani protokolu. */
function igVolej_(cesta, metoda, parametry) {
  const p = Object.assign({}, parametry, { access_token: igKlic_() });
  const dotaz = Object.keys(p).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]); }).join('&');
  const r = metoda === 'post'
    ? UrlFetchApp.fetch(IG_API + cesta, { method: 'post', payload: dotaz, contentType: 'application/x-www-form-urlencoded', muteHttpExceptions: true })
    : UrlFetchApp.fetch(IG_API + cesta + '?' + dotaz, { muteHttpExceptions: true });
  let j = null;
  try { j = JSON.parse(r.getContentText()); } catch (chyba) { j = null; }
  if (!j || j.error || r.getResponseCode() >= 400) {
    const e = j && j.error;
    throw new Error('Instagram: ' + ((e && (e.error_user_msg || e.message)) || 'HTTP ' + r.getResponseCode()));
  }
  return j;
}

/** Klubový účet (id a jméno) – zjistí se jednou a pamatuje. */
function igUcet_() {
  const p = vlastnosti_();
  try { const u = JSON.parse(p.getProperty('IG_UCET') || 'null'); if (u && u.id) return u; } catch (chyba) { /* znovu */ }
  const j = igVolej_('me', 'get', { fields: 'user_id,username' });
  const u = { id: String(j.user_id || j.id), jmeno: String(j.username || '') };
  p.setProperty('IG_UCET', JSON.stringify(u));
  return u;
}

function igStav_() {
  const p = vlastnosti_();
  let jmeno = '';
  try { jmeno = (JSON.parse(p.getProperty('IG_UCET') || 'null') || {}).jmeno || ''; } catch (chyba) { jmeno = ''; }
  return { nastaveno: !!p.getProperty('IG_TOKEN'), ucet: jmeno };
}

function planReelu_() { return nactiPlan_('REELY_PLAN'); }

/** Plán zveřejnění z vlastnosti (REELY_PLAN – reely, PLAKATY_PLAN – plakáty). */
function nactiPlan_(vlastnost) {
  try { return JSON.parse(vlastnosti_().getProperty(vlastnost) || '{}') || {}; } catch (chyba) { return {}; }
}

/**
 * Úprava plánu pod krátkým zámkem (zámek se nikdy nedrží přes čekání na Instagram). fn(plan) → výsledek (jinak celý plán).
 * vlastnost = REELY_PLAN (výchozí) nebo PLAKATY_PLAN.
 */
function upravPlan_(fn, vlastnost) {
  const nazev = vlastnost || 'REELY_PLAN';
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    const plan = nactiPlan_(nazev);
    const vysledek = fn(plan);
    Object.keys(plan).sort(function (a, b) { return (plan[b].kdy || 0) - (plan[a].kdy || 0); })
      .slice(MAX_PLANU).forEach(function (k) { delete plan[k]; });
    vlastnosti_().setProperty(nazev, JSON.stringify(plan));
    return vysledek === undefined ? plan : vysledek;
  } finally {
    zamek.releaseLock();
  }
}

/** Akce reelNaplanovat: reel na Instagram v daný čas (ms) – jen reel s videem na Disku a s popiskem.
 *  oznacit = účty k označení (user_tags), popisek = upravený text jen pro tenhle příspěvek (jinak ten z popisky\*.txt),
 *  pribeh = stejné video rovnou i do příběhu (Michal 9. 10.: „u reelů to přidání rovnou do příběhu“). */
function naplanujReel_(id, kdy, oznacit, popisek, pribeh) {
  if (!REELY_.platneId(id)) throw new Error('Neplatný reel.');
  igKlic_();
  const t = Number(kdy);
  if (!(t > Date.now() - 10 * 60e3 && t < Date.now() + 60 * 864e5)) throw new Error('Čas zveřejnění nesedí – nejdřív teď, nejpozději za 60 dní.');
  const reel = nactiReely_().reely.filter(function (r) { return r.id === id; })[0];
  if (!reel) throw new Error('Reel už není v REELY/reely.json.');
  if (!reel.odkaz) throw new Error('Video reelu ještě není na Disku.');
  if (!reel.popisek) throw new Error('Reel nemá popisek – bez něj ho na Instagram nepošlu.');
  if (stavReelu_()[id]) throw new Error('Reel už je označený jako zveřejněný.');
  const ucty = igOznacit_(oznacit);
  const text = popisek == null ? '' : String(popisek).replace(/\r\n/g, '\n').trim();
  if (text.length > 2200) throw new Error('Popisek je delší než 2 200 znaků – Instagram ho nevezme.');
  const vlastni = !!text && text !== String(reel.popisek).trim();
  const plan = upravPlan_(function (p) {
    const z = p[id];
    if (z && (z.stav === 'nahrava' || z.stav === 'zverejnuji')) throw new Error('Reel se právě nahrává na Instagram.');
    if (z && z.stav === 'hotovo') throw new Error('Reel už na Instagramu je.');
    p[id] = { kdy: t, stav: 'ceka', oznacit: ucty, upraveno: vlastni };
    if (pribeh) p[id].pribeh = true;
  });
  if (vlastni) vlastnosti_().setProperty(IG_POPISEK + id, text); else vlastnosti_().deleteProperty(IG_POPISEK + id);
  return { plan: plan, popisky: igUpravenePopisky_() };
}

/** Akce reelZrusitPlan: zrušit naplánované zveřejnění (jen dokud se nenahrává). */
function zrusPlanReelu_(id) {
  return { plan: upravPlan_(function (plan) {
    const z = plan[id];
    if (z && (z.stav === 'nahrava' || z.stav === 'zverejnuji')) throw new Error('Reel se už nahrává na Instagram – zrušit to nejde.');
    delete plan[id];
  }), popisky: (vlastnosti_().deleteProperty(IG_POPISEK + id), igUpravenePopisky_()) };
}

/** Spustit v editoru po vložení IG_TOKEN: ověří klíč a vypíše klubový účet. */
function overInstagram() {
  vlastnosti_().deleteProperty('IG_UCET');
  const u = igUcet_();
  Logger.log('Instagram: @' + u.jmeno + ' ✓');
  Logger.log('Pak: Spouštěče (budík vlevo) → Přidat spouštěč → instagramKazdych10Min → Časový → Minutový časovač → Každých 10 minut.');
}

/** Spouštěč každých 10 minut (Michal ho přidá v editoru, jediný potřebný): nejdřív rychlé kontroly upozornění do iPhonu,
 *  pak Instagram (čekání na zpracování videa může trvat minuty). */
function instagramKazdych10Min() {
  try { upozorneniKontrola_(); } catch (chyba) { /* příště */ }
  try {
    const hodina = Number(Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'H'));
    if (hodina >= 7 && hodina <= 22) ulozPostuKPrehledu_();
  } catch (chyba) { /* příště */ }
  try { whoopNaPozadi_(); } catch (chyba) { /* příště (chyba je ve WHOOP_SYNC, aplikace ji ukáže) */ }
  try { hodnoceniJidlaNaPozadi_(); } catch (chyba) { /* příště */ }
  try { popisekPlakatuNaPozadi_(); } catch (chyba) { /* příště */ }
  instagramPlan_();
}

/**
 * WHOOP na pozadí (spouštěč, 6–23 h, nejvýš jednou za 30 min): otevření Zdraví pak na WHOOP API nečeká (dřív 10 s).
 * Přišlo něco nového → značka změny zdraví; aplikace na PC i v telefonu si data načtou samy.
 */
function whoopNaPozadi_() {
  const hodina = Number(Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'H'));
  const whoop = whoopStav_();
  if (hodina < 6 || !whoop.propojeno || Date.now() - whoop.sync.kdy < ZDRAVI_SYNC_MIN * 60000) return;
  const z = whoopSync_(whoop.sync.kdy ? 5 : ZDRAVI_DNI);
  const otisk = md5_(JSON.stringify(z));
  if (otisk !== vlastnosti_().getProperty('WHOOP_OTISK')) {
    vlastnosti_().setProperty('WHOOP_OTISK', otisk);
    oznacZmenu_('zdravi');
  }
}

/** Obnova klíče a zveřejnění toho, co je na řadě – reel nebo plakát (jeden za běh, nejdřív nejstarší). */
function instagramPlan_() {
  if (!vlastnosti_().getProperty('IG_TOKEN')) return;
  try { igObnovKlic_(); } catch (chyba) { /* zkusí se zítra */ }
  const ted = Date.now();
  const naRade = [];
  [['REELY_PLAN', igZverejni_], ['PLAKATY_PLAN', plakatZverejni_]].forEach(function (x) {
    const plan = nactiPlan_(x[0]);
    Object.keys(plan).forEach(function (id) {
      const z = plan[id];
      if (z.stav === 'nahrava' || z.stav === 'zverejnuji' || (z.stav === 'ceka' && z.kdy <= ted + 60e3)) naRade.push({ kdy: z.kdy || 0, fn: x[1], id: id });
    });
  });
  naRade.sort(function (a, b) { return a.kdy - b.kdy; });
  if (naRade.length) naRade[0].fn(naRade[0].id);
}

function igObnovKlic_() {
  const p = vlastnosti_();
  if (Date.now() - Number(p.getProperty('IG_TOKEN_OBNOVA') || 0) < IG_OBNOVA_KLICE) return;
  p.setProperty('IG_TOKEN_OBNOVA', String(Date.now() - IG_OBNOVA_KLICE + 864e5)); // když obnova nevyjde, znovu zítra
  const r = UrlFetchApp.fetch('https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=' +
    encodeURIComponent(igKlic_()), { muteHttpExceptions: true });
  let j = null;
  try { j = JSON.parse(r.getContentText()); } catch (chyba) { j = null; }
  if (j && j.access_token) {
    p.setProperty('IG_TOKEN', j.access_token);
    p.setProperty('IG_TOKEN_OBNOVA', String(Date.now()));
  }
}

/** Jeden reel: kontejner (video z tajného odkazu) → zpracování → zveřejnění → odkaz na příspěvek; sdílení videa hned pryč.
 *  S plánem `pribeh` jde totéž video rovnou i do příběhu (nevyjde-li příběh, reel platí a důvod je v pribehChyba). */
function igZverejni_(id) {
  const reel = nactiReely_().reely.filter(function (r) { return r.id === id; })[0] || null;
  const m = reel && /\/file\/d\/([^/?#]+)/.exec(reel.odkaz || '');
  igPublikuj_({
    vlastnost: 'REELY_PLAN', id: id, souborId: m ? m[1] : '', chybaSouboru: 'Video reelu na Disku není.', video: true,
    chybaTitulek: 'Reel nevyšel na Instagramu', chybaText: (reel && reel.nazev ? reel.nazev + ' – ' : '') + 'důvod je v Asistentovi (Reely)',
    hotovoTitulek: 'Reel je na Instagramu ✓', hotovoText: (reel && reel.nazev) || 'Reel',
    kontejner: function (z, url) {
      const parametry = { media_type: 'REELS', share_to_feed: 'true', caption: igPopisek_(id) || reel.popisek, video_url: url };
      if (z.oznacit && z.oznacit.length) parametry.user_tags = JSON.stringify(z.oznacit.map(function (u) { return { username: u }; }));
      return parametry;
    },
    pribeh: function (url) { return { media_type: 'STORIES', video_url: url }; },
    hotovo: function () { vlastnosti_().deleteProperty(IG_POPISEK + id); nastavStavReelu_(id, true); }
  });
}

/**
 * Zveřejnění jedné položky plánu (reel nebo plakát) – stavový automat přes víc běhů spouštěče: kontejner (a příběh) ze
 * souborů na Disku s dočasným tajným odkazem → zpracování na Instagramu → zveřejnění → odkaz; sdílení hned po stažení pryč.
 * o = { vlastnost, id, souborId, pribehId?, chybaSouboru, video, chyba/hotovo Titulek+Text, kontejner(z, url), pribeh(url), hotovo() }
 */
function igPublikuj_(o) {
  let z = nactiPlan_(o.vlastnost)[o.id];
  if (!z) return;
  const nastav = function (zmena) { z = upravPlan_(function (plan) { plan[o.id] = Object.assign({}, plan[o.id], zmena); return plan[o.id]; }, o.vlastnost); };
  const soubory = [];
  const chyba = function (text) {
    nastav({ stav: 'chyba', chyba: String(text).slice(0, 150), kontejner: '', kontejnerPribeh: '' });
    try { upozorni_(o.chybaTitulek, o.chybaText, ['warning'], 4); } catch (e) { /* bez upozornění */ }
  };
  const skryj = function () {
    soubory.forEach(function (f) { try { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (e) { /* zkusí se příště */ } });
  };
  const vypadek = function (e) {
    // výpadek při čekání nebo zveřejnění: zkusit příště, po IG_POKUSU pokusech chyba (zveřejnění se kontroluje stavem kontejneru)
    const pokusy = (z.pokusy || 0) + 1;
    if (pokusy >= IG_POKUSU) { skryj(); chyba(String((e && e.message) || e)); } else nastav({ pokusy: pokusy });
  };
  if (!o.souborId) { chyba(o.chybaSouboru); return; }
  const hlavni = DriveApp.getFileById(o.souborId);
  soubory.push(hlavni);
  const pribehSoubor = !z.pribeh ? null : o.pribehId && o.pribehId !== o.souborId ? DriveApp.getFileById(o.pribehId) : o.pribehId === '' ? null : hlavni;
  if (pribehSoubor && pribehSoubor !== hlavni) soubory.push(pribehSoubor);
  const url = function (f) { return 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(f.getId()) + '&export=download&confirm=t'; };
  let ucet;
  if (!z.kontejner) {
    try {
      ucet = igUcet_();
      soubory.forEach(function (f) { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); });
      nastav({ stav: 'nahrava', zacatek: Date.now(), pokusy: 0 });
      const k = igVolej_(ucet.id + '/media', 'post', o.kontejner(z, url(hlavni)));
      // příběh: kontejner hned taky (stejný soubor u reelu, vlastní obrázek 9:16 u plakátu); nevyjde-li, hlavní příspěvek platí
      let kp = '', pribehChyba = '';
      if (z.pribeh && pribehSoubor) {
        try { kp = String(igVolej_(ucet.id + '/media', 'post', o.pribeh(url(pribehSoubor))).id); } catch (e) { pribehChyba = String((e && e.message) || e).slice(0, 150); }
      } else if (z.pribeh) pribehChyba = 'Obrázek pro příběh chybí.';
      nastav({ kontejner: String(k.id), kontejnerPribeh: kp, pribehChyba: pribehChyba });
    } catch (e) {
      skryj();
      chyba(String((e && e.message) || e));
      return;
    }
  }
  // Instagram soubory stáhne a zpracuje – obrázek hned, video desítky vteřin až minuty
  let s = null, sp = null;
  try {
    ucet = ucet || igUcet_();
    const konec = Date.now() + IG_CEKANI_MS;
    for (;;) {
      if (!s || s.status_code === 'IN_PROGRESS') s = igVolej_(z.kontejner, 'get', { fields: 'status_code,status' });
      if (z.kontejnerPribeh && (!sp || sp.status_code === 'IN_PROGRESS')) sp = igVolej_(z.kontejnerPribeh, 'get', { fields: 'status_code,status' });
      if ((s.status_code !== 'IN_PROGRESS' && (!sp || sp.status_code !== 'IN_PROGRESS')) || Date.now() > konec) break;
      Utilities.sleep(o.video ? 10000 : 3000);
    }
  } catch (e) {
    vypadek(e);
    return;
  }
  const dlouho = Date.now() - (z.zacatek || 0) > 60 * 60e3;
  if (s.status_code === 'IN_PROGRESS') {
    if (dlouho) { skryj(); chyba('Instagram ' + (o.video ? 'video' : 'obrázek') + ' nezpracoval ani za hodinu.'); }
    return; // příště
  }
  if (sp && sp.status_code === 'IN_PROGRESS' && !dlouho) return; // příspěvek je hotový, příběh ještě ne – příště obojí
  skryj(); // Instagram soubory má (nebo je odmítl) – tajný odkaz pryč
  if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') { chyba('Instagram ' + (o.video ? 'video' : 'obrázek') + ' odmítl: ' + (s.status || s.status_code)); return; }
  let media = z.media || '';
  if (s.status_code !== 'PUBLISHED' && !media) {
    try {
      nastav({ stav: 'zverejnuji' });
      media = String(igVolej_(ucet.id + '/media_publish', 'post', { creation_id: z.kontejner }).id);
      nastav({ media: media });
    } catch (e) {
      vypadek(e);
      return;
    }
  }
  // příběh až po příspěvku; jeho chyba příspěvek neruší
  let mediaPribeh = z.mediaPribeh || '', pribehChyba = z.pribehChyba || '';
  if (z.kontejnerPribeh && !mediaPribeh && !pribehChyba) {
    if (sp && sp.status_code === 'FINISHED') {
      try { mediaPribeh = String(igVolej_(ucet.id + '/media_publish', 'post', { creation_id: z.kontejnerPribeh }).id); } catch (e) { pribehChyba = String((e && e.message) || e).slice(0, 150); }
    } else if (!(sp && sp.status_code === 'PUBLISHED')) {
      pribehChyba = 'Instagram příběh odmítl: ' + (sp ? (sp.status || sp.status_code) : 'bez odpovědi');
    }
  }
  let odkaz = '';
  if (media) { try { odkaz = String(igVolej_(media, 'get', { fields: 'permalink' }).permalink || ''); } catch (e) { odkaz = ''; } }
  nastav({ stav: 'hotovo', media: media, odkaz: odkaz, zverejneno: Date.now(), kontejner: '', kontejnerPribeh: '', chyba: '',
    mediaPribeh: mediaPribeh, pribehChyba: pribehChyba });
  if (o.hotovo) o.hotovo(z);
  try { upozorni_(o.hotovoTitulek, o.hotovoText + (pribehChyba ? ' (příběh nevyšel)' : mediaPribeh ? ' + příběh' : ''), ['white_check_mark'], 3, odkaz); } catch (e) { /* bez upozornění */ }
}

// ---------------------------------------------------------------- Plakáty: program víkendu FK Agro Vnorovy (z webu dorostu, 9. 10.)
//
// Aplikace plakát skládá ze zápasů (FOTBAL.json) a mládeže; motor drží ruční úpravy, nastavení, popisky a obrázky:
//   CLAUDE_SCHRANKA/PLAKATY/plakaty.json { nastaveni, kola: { '<sobota>': { stav, upraveno } },
//                                          popisky: { '<sobota>': { text, kdy, styl, pozadano } } }
//   CLAUDE_SCHRANKA/PLAKATY/popisky_claude.json – popisky na Instagram od Clauda (úloha schránky): { '<sobota>': { text, kdy, styl } }
//   CLAUDE_SCHRANKA/PLAKATY/<sobota>_prispevek.jpg a _pribeh.jpg – obrázky, které aplikace vyrobí z plakátu
// Zveřejnění jako u reelů: vlastnost PLAKATY_PLAN, spouštěč instagramKazdych10Min – příspěvek s popiskem a rovnou příběh.
// Michal 9. 10.: „popisek vždy vymyslíš … z aktuální tabulky … okno, kde řeknu styl … primárně áčko … základ domácí zápasy
// mužů a dorostu“ → o popisek se žádá poznámkou v NOVE (…_plak.md; v pondělí až sobotu na nejbližší víkend i sám).

const PLAKAT_TYDEN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STAV_PLAKATU = 60000;               // znaků JSON jednoho kola
const MAX_OBRAZEK_PLAKATU = 8 * 1024 * 1024;  // Instagram bere obrázek nejvýš 8 MB
// popisky sám od víkendu (Michal 9. 10.: „začínáme příštím týdnem, 10. kolem“); jde přepsat v nastavení plakátů (popiskyOd)
const PLAKATY_POPISKY_OD = '2026-10-17';

function slozkaPlakatu_() { return podslozka_(koren_(), 'PLAKATY'); }

function nactiPlakaty_(slozka) {
  const v = nactiJson_(slozka, 'plakaty.json');
  const d = v.data && typeof v.data === 'object' ? v.data : {};
  const obj = function (x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; };
  return { soubor: v.soubor, data: { nastaveni: obj(d.nastaveni), kola: obj(d.kola), popisky: obj(d.popisky) } };
}

/** Úprava plakaty.json pod zámkem: fn(data, slozka) → výsledek. */
function upravPlakaty_(fn) {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(30000);
  try {
    const slozka = slozkaPlakatu_();
    const v = nactiPlakaty_(slozka);
    const vysledek = fn(v.data, slozka);
    const obsah = JSON.stringify(v.data);
    if (v.soubor) v.soubor.setContent(obsah); else slozka.createFile('plakaty.json', obsah, MimeType.PLAIN_TEXT);
    return vysledek;
  } finally {
    zamek.releaseLock();
  }
}

function tydenPlakatu_(t) {
  const x = String(t || '');
  if (!PLAKAT_TYDEN.test(x)) throw new Error('Víkend má tvar RRRR-MM-DD (sobota).');
  return x;
}

/** „17.–18. 10. 2026“ (přes konec měsíce „31. 10.–1. 11. 2026“) ze soboty v ISO. */
function vikendText_(t) {
  const c = t.split('-').map(Number);
  const ne = new Date(Date.UTC(c[0], c[1] - 1, c[2] + 1));
  return c[2] + '.' + (ne.getUTCMonth() + 1 === c[1] ? '' : ' ' + c[1] + '.') + '–' + ne.getUTCDate() + '. ' + (ne.getUTCMonth() + 1) + '. ' + ne.getUTCFullYear();
}

/** Popisky pro aplikaci: novější z ruční úpravy a Claudova; cekaNaClauda = požádáno o nový a ještě nepřišel. */
function popiskyPlakatu_(rucne, claude) {
  const ven = {};
  Object.keys(rucne || {}).concat(Object.keys(claude || {})).forEach(function (t) {
    if (!PLAKAT_TYDEN.test(t) || ven[t]) return;
    const r = (rucne || {})[t] || {}, c = (claude || {})[t] || {};
    const cKdy = Date.parse(c.kdy || '') || Number(c.kdy) || 0, rKdy = Number(r.kdy) || 0;
    const odClauda = !!c.text && (cKdy >= rKdy || !r.text);
    ven[t] = { text: String(odClauda ? c.text : r.text || '').slice(0, 2200), zdroj: odClauda ? 'claude' : r.text ? 'rucne' : '',
      kdy: odClauda ? cKdy : rKdy, styl: String(r.styl || c.styl || ''), pozadano: Number(r.pozadano) || 0,
      cekaNaClauda: !!r.pozadano && Number(r.pozadano) > cKdy };
  });
  return ven;
}

function popiskyClauda_(slozka) { return nactiJson_(slozka, 'popisky_claude.json').data || {}; }

/** Obrázky pro Instagram po víkendech (jen to, co na Disku je). */
function obrazkyPlakatu_(slozka) {
  const ven = {};
  const it = slozka.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const m = /^(\d{4}-\d{2}-\d{2})_(prispevek|pribeh)\.jpg$/.exec(f.getName());
    if (!m || f.isTrashed()) continue;
    const x = (ven[m[1]] = ven[m[1]] || { kdy: 0 });
    x[m[2]] = true;
    x.kdy = Math.max(x.kdy, f.getLastUpdated().getTime());
  }
  return ven;
}

function souborPlakatu_(slozka, nazev) {
  const it = slozka.getFilesByName(nazev);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; }
  return null;
}

/** Zápasy mužů a dorostu o víkendu (sobota t, neděle) jako řádky pro Clauda: „SO 17. 10. 14:30 · A-tým · doma · domácí – hosté“. */
function souhrnVikendu_(t) {
  let data = null;
  try { data = fotbalData_(); } catch (chyba) { data = null; }
  if (!data) return '(zápasy z fotbal.cz nejsou – vezmi je z plakátu)';
  const c = t.split('-').map(Number);
  const nedele = new Date(Date.UTC(c[0], c[1] - 1, c[2] + 1)).toISOString().slice(0, 10);
  const tymy = {};
  (data.tymy || []).forEach(function (x) { tymy[x.klic] = x; });
  const DNY = ['NE', 'PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO'];
  const radky = data.zapasy.filter(function (z) {
    const den = Utilities.formatDate(new Date(Date.parse(z.zacatek)), CASOVE_PASMO, 'yyyy-MM-dd');
    return den === t || den === nedele;
  }).sort(function (a, b) { return Date.parse(a.zacatek) - Date.parse(b.zacatek); }).map(function (z) {
    const kdy = new Date(Date.parse(z.zacatek));
    const den = Utilities.formatDate(kdy, CASOVE_PASMO, 'yyyy-MM-dd') === t ? 6 : 0;
    const d = Utilities.formatDate(kdy, CASOVE_PASMO, 'yyyy-MM-dd').split('-').map(Number);
    return '- ' + DNY[den] + ' ' + d[2] + '. ' + d[1] + '. ' + Utilities.formatDate(kdy, CASOVE_PASMO, 'HH:mm') + ' · ' +
      ((tymy[z.tym] && tymy[z.tym].nazev) || z.tym) + ' · ' + (z.doma ? 'doma' : 'venku') + ' · ' + z.domaci + ' – ' + z.hoste +
      (z.puvodniTermin ? ' (přeloženo)' : '');
  });
  return radky.length ? radky.join('\n') : '(ten víkend se podle fotbal.cz nehraje)';
}

/** Poznámka pro Clauda v NOVE: napsat popisek k plakátu víkendu t (aplikace ji neukazuje – SKRYTE_POZNAMKY). */
function pozadejOPopisek_(t, styl, souhrn) {
  const ted = new Date(Date.now());
  podslozka_(koren_(), 'NOVE').createFile(Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd_HHmmss') + '_plak.md', ['---',
    'kdy: ' + Utilities.formatDate(ted, CASOVE_PASMO, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    'odkud: aplikace (plakát)', 'typ: plakat-popisek', '---', '',
    'Napiš popisek na Instagram k plakátu víkendu ' + vikendText_(t) + ' a zapiš ho do PLAKATY\\popisky_claude.json → „' + t + '“ ' +
    '(skill asistent-schranka, Popisek k plakátu – čísla z aktuální tabulky ve FOTBAL.json).',
    '', 'Styl: ' + (styl || 'běžný'), '', 'Zápasy:', souhrn, ''].join('\n'), MimeType.PLAIN_TEXT);
}

/** Akce plakaty: všechno pro stránku Plakáty. */
function plakaty_() {
  const slozka = slozkaPlakatu_();
  const d = nactiPlakaty_(slozka).data;
  return { nastaveni: d.nastaveni, kola: d.kola, popisky: popiskyPlakatu_(d.popisky, popiskyClauda_(slozka)),
    plan: nactiPlan_('PLAKATY_PLAN'), obrazky: obrazkyPlakatu_(slozka), ig: igStav_() };
}

/** Akce plakatUlozit: { tyden, stav } = ruční úprava kola; { tyden, smazat } = zpět podle rozlosování. */
function plakatUlozit_(d) {
  const t = tydenPlakatu_(d.tyden);
  return { kola: upravPlakaty_(function (data) {
    if (d.smazat) delete data.kola[t];
    else {
      if (!d.stav || typeof d.stav !== 'object' || Array.isArray(d.stav)) throw new Error('Chybí stav plakátu.');
      const json = JSON.stringify(d.stav);
      if (json.length > MAX_STAV_PLAKATU) throw new Error('Plakát je moc velký na uložení.');
      data.kola[t] = { stav: JSON.parse(json), upraveno: Date.now() };
    }
    const hranice = Utilities.formatDate(new Date(Date.now() - 366 * 864e5), CASOVE_PASMO, 'yyyy-MM-dd');
    Object.keys(data.kola).forEach(function (k) { if (k < hranice) delete data.kola[k]; });
    return data.kola;
  }) };
}

/** Akce plakatNastaveni: názvy týmů, soutěže, místo, texty, náš znak, Instagram, aliasy znaků. */
function plakatNastaveni_(d) {
  const n = d.nastaveni;
  if (!n || typeof n !== 'object' || Array.isArray(n)) throw new Error('Chybí nastavení plakátu.');
  const json = JSON.stringify(n);
  if (json.length > 30000) throw new Error('Nastavení plakátu je moc velké.');
  return { nastaveni: upravPlakaty_(function (data) { data.nastaveni = JSON.parse(json); return data.nastaveni; }) };
}

/** Akce plakatPopisekUlozit: popisek upravený ručně v aplikaci. */
function plakatPopisekUlozit_(d) {
  const t = tydenPlakatu_(d.tyden);
  const text = String(d.text == null ? '' : d.text).replace(/\r\n/g, '\n');
  if (text.length > 2200) throw new Error('Popisek je delší než 2 200 znaků – Instagram ho nevezme.');
  return { popisky: upravPlakaty_(function (data, slozka) {
    data.popisky[t] = Object.assign({}, data.popisky[t], { text: text, kdy: Date.now() });
    return popiskyPlakatu_(data.popisky, popiskyClauda_(slozka));
  }) };
}

/** Akce plakatPopisek: požádat Clauda o (nový) popisek ve stylu styl; souhrn zápasů pošle aplikace (jinak z FOTBAL.json). */
function plakatPopisek_(d) {
  const t = tydenPlakatu_(d.tyden);
  const styl = String(d.styl || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const souhrn = String(d.souhrn || '').replace(/\r\n/g, '\n').trim().slice(0, 3000) || souhrnVikendu_(t);
  return { popisky: upravPlakaty_(function (data, slozka) {
    data.popisky[t] = Object.assign({}, data.popisky[t], { pozadano: Date.now(), styl: styl });
    pozadejOPopisek_(t, styl, souhrn);
    return popiskyPlakatu_(data.popisky, popiskyClauda_(slozka));
  }) };
}

/** Spouštěč: v pondělí až sobotu (8–21 h) jednou požádá Clauda o popisek k nejbližšímu víkendu, když se hraje doma. */
function popisekPlakatuNaPozadi_() {
  const ted = new Date(Date.now());
  const hm = Utilities.formatDate(ted, CASOVE_PASMO, 'HH:mm');
  const den = Number(Utilities.formatDate(ted, CASOVE_PASMO, 'u')); // 1 = pondělí … 7 = neděle
  if (hm < '08:00' || hm > '21:00' || den === 7) return;
  const c = Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd').split('-').map(Number);
  const sobota = new Date(Date.UTC(c[0], c[1] - 1, c[2] + (6 - den))).toISOString().slice(0, 10);
  const vl = vlastnosti_();
  if (vl.getProperty('PLAKAT_POPISEK_AUTO') === sobota) return;
  const od = String(nactiPlakaty_(slozkaPlakatu_()).data.nastaveni.popiskyOd || PLAKATY_POPISKY_OD);
  if (sobota < od) return;
  vl.setProperty('PLAKAT_POPISEK_AUTO', sobota);
  const souhrn = souhrnVikendu_(sobota);
  if (!/ · doma · /.test(souhrn)) return; // doma se nehraje – plakát asi nebude
  upravPlakaty_(function (data, slozka) {
    const p = popiskyPlakatu_(data.popisky, popiskyClauda_(slozka))[sobota];
    if (p && (p.text || p.pozadano)) return;
    data.popisky[sobota] = Object.assign({}, data.popisky[sobota], { pozadano: Date.now(), styl: '' });
    pozadejOPopisek_(sobota, '', souhrn);
  });
}

/** Akce plakatObrazky: { tyden, prispevek, pribeh } jako data:image/jpeg;base64 – obrázky pro Instagram (staré do koše). */
function plakatObrazky_(d) {
  const t = tydenPlakatu_(d.tyden);
  const z = nactiPlan_('PLAKATY_PLAN')[t];
  if (z && (z.stav === 'nahrava' || z.stav === 'zverejnuji')) throw new Error('Plakát se právě nahrává na Instagram.');
  const slozka = slozkaPlakatu_();
  const uloz = function (dataUrl, druh) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new Error('Obrázek pro ' + (druh === 'pribeh' ? 'příběh' : 'příspěvek') + ' chybí nebo není JPEG.');
    const bajty = Utilities.base64Decode(m[1]);
    if (bajty.length > MAX_OBRAZEK_PLAKATU) throw new Error('Obrázek je větší než 8 MB – Instagram ho nevezme.');
    const nazev = t + '_' + druh + '.jpg';
    const stary = souborPlakatu_(slozka, nazev);
    if (stary) stary.setTrashed(true);
    slozka.createFile(Utilities.newBlob(bajty, 'image/jpeg', nazev));
  };
  uloz(d.prispevek, 'prispevek');
  if (d.pribeh) uloz(d.pribeh, 'pribeh');
  return { obrazky: obrazkyPlakatu_(slozka) };
}

/** Akce plakatNaplanovat: { tyden, kdy, pribeh } – příspěvek s popiskem (a příběh) na Instagram v daný čas. */
function plakatNaplanovat_(d) {
  const t = tydenPlakatu_(d.tyden);
  igKlic_();
  const kdy = Number(d.kdy);
  if (!(kdy > Date.now() - 10 * 60e3 && kdy < Date.now() + 60 * 864e5)) throw new Error('Čas zveřejnění nesedí – nejdřív teď, nejpozději za 60 dní.');
  const slozka = slozkaPlakatu_();
  if (!souborPlakatu_(slozka, t + '_prispevek.jpg')) throw new Error('Chybí obrázek plakátu – vyrob ho v aplikaci znovu.');
  if (d.pribeh && !souborPlakatu_(slozka, t + '_pribeh.jpg')) throw new Error('Chybí obrázek pro příběh.');
  const popisek = (popiskyPlakatu_(nactiPlakaty_(slozka).data.popisky, popiskyClauda_(slozka))[t] || {}).text;
  if (!popisek) throw new Error('Plakát nemá popisek – bez něj ho na Instagram nepošlu.');
  return { plan: upravPlan_(function (p) {
    const z = p[t];
    if (z && (z.stav === 'nahrava' || z.stav === 'zverejnuji')) throw new Error('Plakát se právě nahrává na Instagram.');
    if (z && z.stav === 'hotovo') throw new Error('Plakát toho víkendu už na Instagramu je.');
    p[t] = { kdy: kdy, stav: 'ceka', pribeh: !!d.pribeh };
  }, 'PLAKATY_PLAN') };
}

/** Akce plakatZrusitPlan (jen dokud se nenahrává). */
function plakatZrusitPlan_(d) {
  const t = tydenPlakatu_(d.tyden);
  return { plan: upravPlan_(function (plan) {
    const z = plan[t];
    if (z && (z.stav === 'nahrava' || z.stav === 'zverejnuji')) throw new Error('Plakát se už nahrává na Instagram – zrušit to nejde.');
    delete plan[t];
  }, 'PLAKATY_PLAN') };
}

/** Spouštěč: plakát víkendu t na Instagram – příspěvek s popiskem, příběh 9:16. */
function plakatZverejni_(t) {
  const slozka = slozkaPlakatu_();
  const prispevek = souborPlakatu_(slozka, t + '_prispevek.jpg'), pribeh = souborPlakatu_(slozka, t + '_pribeh.jpg');
  const popisek = (popiskyPlakatu_(nactiPlakaty_(slozka).data.popisky, popiskyClauda_(slozka))[t] || {}).text || '';
  igPublikuj_({
    vlastnost: 'PLAKATY_PLAN', id: t, souborId: prispevek ? prispevek.getId() : '', pribehId: pribeh ? pribeh.getId() : '',
    chybaSouboru: 'Obrázek plakátu na Disku není – naplánuj znovu z aplikace.', video: false,
    chybaTitulek: 'Plakát nevyšel na Instagramu', chybaText: 'Víkend ' + vikendText_(t) + ' – důvod je v Asistentovi (Plakáty)',
    hotovoTitulek: 'Plakát je na Instagramu ✓', hotovoText: 'Víkend ' + vikendText_(t),
    kontejner: function (z, url) { return { image_url: url, caption: popisek }; },
    pribeh: function (url) { return { media_type: 'STORIES', image_url: url }; }
  });
}

// ---------------------------------------------------------------- Auto: náklady a tankování (Michalova tabulka Google)
//
// Michal vede auto v tabulce Google (listy Přehled, Náklady, Tankování, Péče o auto) – ta zůstává hlavní a je i záloha.
// Aplikace z ní čte a nové zápisy (tankování, výdaj) píše do prvního volného řádku pod posledním zápisem; Přehled je
// sečte sám (SUMIF přes celé sloupce). Sloupce se hledají podle nadpisů v 1. řádku. ID tabulky je jen ve vlastnosti
// AUTO_TABULKA (Michal vloží odkaz v aplikaci). Fotky účtenek → CLAUDE_SCHRANKA/AUTO/uctenky, text přes OCR Disku
// (dočasný Dokument Google, pak do koše) → návrh zápisu; do tabulky jde až po potvrzení v aplikaci (s odkazem na fotku).
// Potřebuje oprávnění k Tabulkám (manifest) a službu Drive API (čtení účtenek) – README, část Auto.

const AUTO_LISTY = { naklady: 'Náklady', tankovani: 'Tankování', prehled: 'Přehled' };
const MAX_UCTENKY = 6 * 1024 * 1024; // bajtů fotky (aplikace posílá zmenšenou, kolem 0,5 MB)

function autoChybaPristupu_(chyba) {
  const t = String((chyba && chyba.message) || chyba);
  return /permission|oprávnění|authoriz|auth\/spreadsheets/i.test(t)
    ? 'Motor zatím nemá povolení k Tabulkám Google – v editoru motoru doplň manifest a spusť povolitTabulky (návod v aplikaci na stránce Auto).'
    : 'Tabulku auta se nepodařilo otevřít: ' + t;
}

function autoTabulka_() {
  const id = vlastnosti_().getProperty('AUTO_TABULKA');
  if (!id) return null;
  try { return SpreadsheetApp.openById(id); } catch (chyba) { throw new Error(autoChybaPristupu_(chyba)); }
}

function autoList_(ss, druh) {
  const list = ss.getSheetByName(AUTO_LISTY[druh]);
  if (!list) throw new Error('V tabulce chybí list „' + AUTO_LISTY[druh] + '“.');
  return list;
}

/**
 * Značky změn (levné – jen vlastnosti skriptu): auto = kdy se naposledy zapisovalo k autu. Server je chystá při každé
 * obnově (každých 10 min a hned po změně z aplikace) a aplikace tabulku auta načte znovu, jen když je značka novější.
 */
// značky změn: kdy se naposledy zapisovalo k autu a ke zdraví – server je posílá s kopiemi (akce zmeny v dávce),
// aplikace podle nich data načte znovu (zdraví i auto jdou přímo z motoru, kopie na serveru nemají)
const ZNACKY_ZMEN = { auto: 'AUTO_ZMENA', zdravi: 'ZDRAVI_ZMENA' };
const ZAPISY_ZDRAVI = ['vaha', 'doplnky', 'pitiJidlo', 'whoopPropojit', 'whoopOdpojit'];

/** Oblast, které se zápis týká (auto | zdravi), nebo '' – čtení značku nemění. */
function oblastZapisu_(akce) {
  if (CTENI_MOTORU.indexOf(akce) >= 0) return '';
  if (/^auto/.test(akce)) return 'auto';
  return ZAPISY_ZDRAVI.indexOf(akce) >= 0 ? 'zdravi' : '';
}

function oznacZmenu_(oblast) {
  if (!ZNACKY_ZMEN[oblast]) return;
  try {
    const vl = vlastnosti_();
    vl.setProperty(ZNACKY_ZMEN[oblast], String(Date.now()));
    // zdraví: nová verze dat = jiný klíč hotového přehledu v mezipaměti (čas by se při dvou zápisech v jedné ms nezměnil)
    if (oblast === 'zdravi') vl.setProperty('ZDRAVI_V', Utilities.getUuid().slice(0, 8));
  } catch (chyba) { /* jen zrychlení */ }
}

/** Akce zmeny: { auto, zdravi } (ms). Zdraví i podle souborů, které Claude píše rovnou na Disk (diktát pití a jídla, režim). */
function zmeny_() {
  const vl = vlastnosti_();
  return { auto: Number(vl.getProperty('AUTO_ZMENA') || 0),
    zdravi: Math.max(Number(vl.getProperty('ZDRAVI_ZMENA') || 0), zmenaSouboruClauda_()) };
}

/** Kdy Claude naposledy upravil ZDRAVI/PITI_JIDLO_CLAUDE.json nebo ZDRAVI_REZIM.json (id souborů v mezipaměti 6 h, výsledek 1 min). */
function zmenaSouboruClauda_() {
  const cache = CacheService.getScriptCache();
  const hotovo = cache.get('zmena:claude');
  if (hotovo) return Number(hotovo);
  let nejnovejsi = 0;
  [['ZDRAVI', 'PITI_JIDLO_CLAUDE.json'], ['', 'ZDRAVI_REZIM.json']].forEach(function (x) {
    try {
      const klic = 'id:' + x[1];
      let soubor = null;
      const id = cache.get(klic);
      if (id) { try { soubor = DriveApp.getFileById(id); } catch (chyba) { soubor = null; } }
      if (!soubor) {
        const it = (x[0] ? podslozka_(koren_(), x[0]) : koren_()).getFilesByName(x[1]);
        if (!it.hasNext()) return;
        soubor = it.next();
        cache.put(klic, soubor.getId(), 21600);
      }
      nejnovejsi = Math.max(nejnovejsi, soubor.getLastUpdated().getTime());
    } catch (chyba) { /* bez značky – zdraví se načte podle stáří dat */ }
  });
  cache.put('zmena:claude', String(nejnovejsi), 60);
  return nejnovejsi;
}

/** Oblíbení lidé, jejichž jmeniny aplikace v kalendáři zvýrazní (bez upozornění): [{ jmeno, kdo }] – vlastnost JMENINY_OBLIBENI. */
function jmeninyOblibeni_() {
  try {
    const x = JSON.parse(vlastnosti_().getProperty('JMENINY_OBLIBENI') || '[]');
    return Array.isArray(x) ? x : [];
  } catch (chyba) {
    return [];
  }
}

function ulozJmeniny_(oblibeni) {
  if (!Array.isArray(oblibeni)) throw new Error('Chybí seznam oblíbených.');
  const cisty = oblibeni.slice(0, 60).map(function (o) {
    return { jmeno: String((o && o.jmeno) || '').replace(/\s+/g, ' ').trim().slice(0, 40), kdo: String((o && o.kdo) || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
  }).filter(function (o) { return /^\p{L}[\p{L} .'-]*$/u.test(o.jmeno); });
  vlastnosti_().setProperty('JMENINY_OBLIBENI', JSON.stringify(cisty));
  return cisty;
}

/** Akce auto: zápisy z listů Náklady a Tankování, kategorie a kdo co zaplatil (z Přehledu). */
function auto_() {
  const ss = autoTabulka_();
  return ss ? autoData_(ss) : { nastaveno: false };
}

function autoData_(ss) {
  return autoDataSPripominkami_(ss);
}

function autoDataBez_(ss) {
  const n = autoList_(ss, 'naklady'), t = autoList_(ss, 'tankovani');
  const hn = n.getDataRange().getValues(), ht = t.getDataRange().getValues();
  // odkazy na fotky účtenek v poznámce → aplikace u zápisu ukáže fotku
  const naklady = AUTO_.zapisy(hn, 'naklady', odkazyPoznamek_(n, hn));
  const tankovani = AUTO_.zapisy(ht, 'tankovani', odkazyPoznamek_(t, ht));
  const prehled = ss.getSheetByName(AUTO_LISTY.prehled);
  return {
    nastaveno: true, nazev: ss.getName(), odkaz: ss.getUrl(), naklady: naklady, tankovani: tankovani,
    kategorie: AUTO_.kategorie(naklady, autoKategorieZValidace_(n)),
    platili: prehled ? AUTO_.platili(prehled.getDataRange().getValues()) : null,
    myskoda: autoMyskoda_(),
    pece: autoPece_(ss),
    terminy: autoTerminy_(),
    ted: Date.now()
  };
}

/** Data auta + připomínky „Co řešit“ (sezóna, termíny z tabulky a z auta) – aplikace je ukáže na Auto a na Dnes. */
function autoDataSPripominkami_(ss) {
  const d = autoDataBez_(ss);
  d.pripominky = AUTO_.pripominky(d, Date.now());
  return d;
}

/** Stav auta z MyŠkoda (tachometr, nádrž, dojezd, servis) – soubor AUTO/myskoda.json zapisuje domácí PC; bez polohy a VIN. */
function autoMyskoda_() {
  try {
    const slozky = koren_().getFoldersByName('AUTO');
    if (!slozky.hasNext()) return null;
    const soubory = slozky.next().getFilesByName('myskoda.json');
    if (!soubory.hasNext()) return null;
    const d = JSON.parse(soubory.next().getBlob().getDataAsString('UTF-8'));
    if (!d || !Array.isArray(d.auta)) return null;
    const cislo = function (x) { return typeof x === 'number' && isFinite(x) ? x : null; };
    return {
      aktualizovano: String(d.aktualizovano || ''),
      auta: d.auta.slice(0, 5).map(function (a) {
        const s = a.servis || {};
        return { nazev: String(a.nazev || ''), model: String(a.model || ''), km: cislo(a.km), kmKdy: String(a.km_kdy || ''), palivo: cislo(a.palivo_pct),
          dojezd: cislo(a.dojezd_km), adblue: cislo(a.adblue_km), zamceno: a.zamceno == null ? null : String(a.zamceno),
          servis: { olejKm: cislo(s.olej_km), olejDni: cislo(s.olej_dni), prohlidkaKm: cislo(s.prohlidka_km), prohlidkaDni: cislo(s.prohlidka_dni) } };
      }),
      // tankování podle nádrže a spotřeby mezi dvěma čteními (skript na PC čte jednou denně): od–do, den podle jízd,
      // stav km, odhad litrů
      tankovani: (Array.isArray(d.tankovani) ? d.tankovani : []).slice(-30).map(function (t) {
        return { od: String(t.od || ''), do: String(t.do || ''), den: /^\d{4}-\d{2}-\d{2}$/.test(t.den || '') ? t.den : '',
          km: cislo(t.km), litry: cislo(t.litry) };
      })
    };
  } catch (chyba) {
    return null;
  }
}

/** Kategorie z rozbalovacího seznamu ve sloupci Kategorie (když ho tabulka má). */
function autoKategorieZValidace_(list) {
  try {
    const s = AUTO_.sloupce(list.getRange(1, 1, 1, list.getLastColumn()).getValues()[0]);
    if (s.kategorie < 0) return [];
    const pravidlo = list.getRange(2, s.kategorie + 1).getDataValidation();
    const k = pravidlo ? pravidlo.getCriteriaValues()[0] : null;
    const hodnoty = Array.isArray(k) ? k : k && typeof k.getValues === 'function' ? k.getValues().map(function (r) { return r[0]; }) : [];
    return hodnoty.map(function (x) { return String(x).trim(); }).filter(Boolean);
  } catch (chyba) {
    return [];
  }
}

/** Akce autoNastavit: odkaz na tabulku Google → vlastnost AUTO_TABULKA (ověří listy Náklady a Tankování). Prázdný = odpojit. */
function autoNastavit_(odkaz) {
  const t = String(odkaz == null ? '' : odkaz).trim();
  if (!t) { vlastnosti_().deleteProperty('AUTO_TABULKA'); return { nastaveno: false }; }
  const m = /\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]{20,})/.exec(t) || /^([\w-]{20,})$/.exec(t);
  if (!m) throw new Error('Vlož odkaz na tabulku Google (docs.google.com/spreadsheets/d/…).');
  let ss;
  try { ss = SpreadsheetApp.openById(m[1]); } catch (chyba) { throw new Error(autoChybaPristupu_(chyba)); }
  const data = autoData_(ss);
  vlastnosti_().setProperty('AUTO_TABULKA', m[1]);
  return data;
}

/** Akce autoZapsat: tankování nebo výdaj do prvního volného řádku listu; vrací data jako akce auto. */
function autoZapsat_(d) {
  const ss = autoTabulka_();
  if (!ss) throw new Error('Tabulka auta není propojená.');
  autoZapis_(ss, AUTO_.novyZapis(d));
  return autoData_(ss);
}

/** Nový zápis (zkontrolovaný novyZapis) do prvního volného řádku listu → { list, radek }. */
function autoZapis_(ss, z) {
  const odkazUctenky = odkazUctenky_(z.uctenka);
  const zamek = LockService.getScriptLock();
  zamek.waitLock(20000);
  try {
    const list = autoList_(ss, z.druh);
    const hodnoty = list.getDataRange().getValues();
    const s = AUTO_.sloupce(hodnoty[0] || []);
    if (s.datum < 0 || s.castka < 0) throw new Error('V listu „' + list.getName() + '“ chybí sloupec Datum nebo Částka.');
    const r = AUTO_.volnyRadek(hodnoty, s);
    // číselný formát (Kč, datum, km) jako o řádek výš – barvy a ohraničení nechat, jak je tabulka má
    if (r > 2) {
      Object.keys(s).forEach(function (k) {
        if (s[k] < 0) return;
        const f = list.getRange(r - 1, s[k] + 1).getNumberFormat();
        if (f && !(k === 'datum' && f === '@')) list.getRange(r, s[k] + 1).setNumberFormat(f);
      });
    }
    autoZapisRadek_(list, s, r, z, odkazUctenky, false);
    SpreadsheetApp.flush();
    return { list: z.druh, radek: r };
  } finally {
    zamek.releaseLock();
  }
}

function odkazUctenky_(id) {
  if (!id) return '';
  try { return DriveApp.getFileById(id).getUrl(); } catch (chyba) { return ''; }
}

/**
 * Hodnoty zápisu do řádku r. Nový zápis prázdné hodnoty přeskočí; oprava je smaže (Michal pole vymazal) a u tankování
 * nechá položku a kategorii, jak je tabulka má. Poznámka dostane odkaz „účtenka“ na fotku na Disku.
 */
function autoZapisRadek_(list, s, r, z, odkazUctenky, oprava) {
  const bunka = function (k) { return s[k] >= 0 ? list.getRange(r, s[k] + 1) : null; };
  const hodnota = function (k, v) {
    const b = bunka(k);
    if (!b) return;
    if (v !== null && v !== undefined && v !== '') b.setValue(v);
    else if (oprava) b.setValue('');
  };
  hodnota('datum', new Date(z.datum[0], z.datum[1] - 1, z.datum[2]));
  hodnota('castka', z.castka);
  hodnota('km', z.km);
  hodnota('kdo', z.kdo);
  if (z.druh === 'tankovani') {
    if (!oprava) {
      hodnota('polozka', 'Tankování');
      hodnota('kategorie', 'Palivo');
    }
    hodnota('cenaLitr', z.cenaLitr);
    // litry vzorcem jako ostatní řádky (částka / cena za litr)
    if (s.litry >= 0 && s.cenaLitr >= 0) bunka('litry').setFormula('=' + AUTO_.pismeno(s.castka) + r + '/$' + AUTO_.pismeno(s.cenaLitr) + r);
    else hodnota('litry', Math.round(z.castka / z.cenaLitr * 100) / 100);
  } else {
    hodnota('polozka', z.polozka);
    hodnota('kategorie', z.kategorie);
  }
  const b = bunka('poznamka');
  const text = [z.poznamka, odkazUctenky ? 'účtenka' : ''].filter(Boolean).join(' · ');
  if (b && odkazUctenky) {
    b.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(text).setLinkUrl(text.length - 7, text.length, odkazUctenky).build());
  } else if (b && (text || oprava)) {
    b.setValue(text);
  }
}

/** Odkazy v poznámce po řádcích (index jako hodnoty) – fotka účtenky; bez sloupce Poznámka prázdné pole. */
function odkazyPoznamek_(list, hodnoty) {
  const s = AUTO_.sloupce((hodnoty && hodnoty[0]) || []);
  if (s.poznamka < 0 || !hodnoty || hodnoty.length < 2) return [];
  try {
    return list.getRange(1, s.poznamka + 1, hodnoty.length, 1).getRichTextValues().map(function (r) {
      const v = r[0];
      if (!v) return '';
      let u = v.getLinkUrl();
      if (!u && v.getRuns) v.getRuns().some(function (x) { u = x.getLinkUrl(); return !!u; });
      return u || '';
    });
  } catch (chyba) {
    return [];
  }
}

/** Zápis, který už odkazuje na tuhle fotku účtenky → { list, radek }, jinak null. */
function najdiZapisUctenky_(ss, id) {
  let nalez = null;
  ['tankovani', 'naklady'].some(function (k) {
    const list = autoList_(ss, k);
    const hodnoty = list.getDataRange().getValues();
    const odkazy = odkazyPoznamek_(list, hodnoty);
    for (let i = 1; i < odkazy.length; i++) {
      if (AUTO_.idUctenky(odkazy[i]) === id) { nalez = { list: k, radek: i + 1 }; return true; }
    }
    return false;
  });
  return nalez;
}

/** Stav km ke dni účtenky z auta (MyŠkoda): tankování poznané ten den, jinak dnešní tachometr – jen pro dnešek. */
function kmKeDni_(datumIso) {
  if (!datumIso) return null;
  const ms = autoMyskoda_();
  if (!ms) return null;
  const t = (ms.tankovani || []).filter(function (x) { return x.den === datumIso && x.km != null; })[0];
  if (t) return t.km;
  const a = (ms.auta || [])[0];
  const dnes = Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'yyyy-MM-dd');
  return a && a.km != null && datumIso === dnes && String(a.kmKdy).slice(0, 10) === dnes ? a.km : null;
}

/** Akce autoUpravit: oprava kteréhokoli zápisu z aplikace – jen když v řádku pořád sedí původní datum a částka. */
function autoUpravit_(d) {
  const ss = autoTabulka_();
  if (!ss) throw new Error('Tabulka auta není propojená.');
  const z = AUTO_.novyZapis(d);
  if ((d.list === 'tankovani' ? 'tankovani' : 'naklady') !== z.druh) throw new Error('Druh zápisu se změnit nedá – smaž ho a zapiš znovu.');
  const zamek = LockService.getScriptLock();
  zamek.waitLock(20000);
  try {
    const list = autoList_(ss, z.druh);
    const hodnoty = list.getDataRange().getValues();
    const s = AUTO_.sloupce(hodnoty[0] || []);
    const r = Number(d.radek);
    const radek = r >= 2 ? hodnoty[r - 1] : null;
    if (!radek || AUTO_.datum(radek[s.datum]) !== Number(d.puvodniDatum) || AUTO_.cislo(radek[s.castka]) !== Number(d.puvodniCastka)) {
      throw new Error('Zápis v tabulce se mezitím změnil – obnov stránku.');
    }
    autoZapisRadek_(list, s, r, z, odkazUctenky_(z.uctenka), true);
    SpreadsheetApp.flush();
  } finally {
    zamek.releaseLock();
  }
  return autoData_(ss);
}

const AUTO_PECE_TEXT = 'Péče o auto – text';
const AUTO_TERMINY = ['znamka', 'stk', 'pojisteni'];

/**
 * Termíny k autu, které v tabulce nejsou (dálniční známka platí do, STK do, výročí pojištění): soubor
 * CLAUDE_SCHRANKA/AUTO/terminy.json – zapisuje aplikace (Péče o auto → Termíny) i Claude ze schránky
 * (poznámka „dálniční známka platí do…“). { znamka: 'RRRR-MM-DD', stk, pojisteni }.
 */
function autoTerminy_() {
  try {
    const it = podslozka_(koren_(), 'AUTO').getFilesByName('terminy.json');
    if (!it.hasNext()) return {};
    const d = JSON.parse(it.next().getBlob().getDataAsString('UTF-8')) || {};
    const ven = {};
    AUTO_TERMINY.forEach(function (k) { if (/^\d{4}-\d{2}-\d{2}$/.test(String(d[k] || ''))) ven[k] = d[k]; });
    return ven;
  } catch (chyba) {
    return {};
  }
}

/** Akce autoTermin: { id: znamka | stk | pojisteni, datum: 'RRRR-MM-DD' nebo '' (smazat) } → terminy.json. */
function autoTermin_(d) {
  const id = String(d.id || '');
  if (AUTO_TERMINY.indexOf(id) < 0) throw new Error('Neznámý termín.');
  const datum = String(d.datum || '').trim();
  if (datum && !/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error('Datum má tvar RRRR-MM-DD.');
  const slozka = podslozka_(koren_(), 'AUTO');
  const it = slozka.getFilesByName('terminy.json');
  const soubor = it.hasNext() ? it.next() : null;
  let obsah = {};
  try { obsah = soubor ? JSON.parse(soubor.getBlob().getDataAsString('UTF-8')) || {} : {}; } catch (chyba) { obsah = {}; }
  if (datum) obsah[id] = datum; else delete obsah[id];
  obsah.aktualizovano = new Date(Date.now()).toISOString();
  const text = JSON.stringify(obsah, null, 2);
  if (soubor) soubor.setContent(text); else slozka.createFile('terminy.json', text, MimeType.PLAIN_TEXT);
  const ss = autoTabulka_();
  return ss ? autoData_(ss) : { terminy: autoTerminy_() };
}

/**
 * List „Péče o auto – text“ (plán údržby, rady) pro kartu Péče o auto v aplikaci – text bez prázdných řádků
 * a indexy tučných řádků (nadpis oddílu nebo hlavička tabulky; tučné = nadpis i po Michalových úpravách v tabulce).
 */
function autoPece_(ss) {
  try {
    const list = ss.getSheetByName(AUTO_PECE_TEXT);
    if (!list) return null;
    const hodnoty = list.getDataRange().getValues().slice(0, 300);
    if (!hodnoty.length) return null;
    const vahy = list.getRange(1, 1, hodnoty.length, 1).getFontWeights();
    const radky = [], nadpisy = [];
    hodnoty.forEach(function (r, i) {
      const radek = [0, 1, 2].map(function (j) { return String(r[j] == null ? '' : r[j]).trim().slice(0, 600); });
      if (!radek[0] && !radek[1] && !radek[2]) return;
      if (vahy[i] && vahy[i][0] === 'bold') nadpisy.push(radky.length);
      radky.push(radek);
    });
    return radky.length ? { radky: radky, nadpisy: nadpisy } : null;
  } catch (chyba) {
    return null;
  }
}

/**
 * Akce autoPeceZapsat: péče o auto jako text (Michal 5. 10.: obrázky v listu Péče o auto přepsat a doplnit) do vlastního
 * listu „Péče o auto – text“ hned za ním. Jiné listy nemění; když už list obsah má, nepřepíše ho (jen s prepsat: true).
 * radky = [štítek, text, poznámka]; nadpisy / hlavicky = indexy řádků (tučně; hlavička tabulky podbarvená).
 */
function autoPeceZapsat_(d) {
  const ss = autoTabulka_();
  if (!ss) throw new Error('Tabulka auta není propojená.');
  const radky = (Array.isArray(d.radky) ? d.radky : []).slice(0, 300).map(function (r) {
    return [0, 1, 2].map(function (i) { return String((r && r[i]) == null ? '' : r[i]).slice(0, 2000); });
  });
  if (!radky.length) throw new Error('Žádný text k zápisu.');
  let list = ss.getSheetByName(AUTO_PECE_TEXT);
  if (list && list.getLastRow() > 0) {
    if (!d.prepsat) throw new Error('List „' + AUTO_PECE_TEXT + '“ už obsah má – nic nepřepisuji.');
    list.clear();
  }
  if (!list) {
    const listy = ss.getSheets();
    let za = listy.length;
    listy.forEach(function (l, i) { if (l.getName() === 'Péče o auto') za = i + 1; });
    list = ss.insertSheet(AUTO_PECE_TEXT, za);
  }
  const cely = list.getRange(1, 1, radky.length, 3);
  cely.setValues(radky);
  cely.setWrap(true).setVerticalAlignment('top');
  list.setColumnWidth(1, 210);
  list.setColumnWidth(2, 640);
  list.setColumnWidth(3, 400);
  const indexy = function (pole) { return (Array.isArray(pole) ? pole : []).filter(function (i) { return i >= 0 && i < radky.length; }); };
  indexy(d.nadpisy).forEach(function (i) { list.getRange(i + 1, 1, 1, 3).setFontWeight('bold').setFontSize(i === 0 ? 14 : 12); });
  indexy(d.hlavicky).forEach(function (i) { list.getRange(i + 1, 1, 1, 3).setFontWeight('bold').setBackground('#e6f0ee'); });
  SpreadsheetApp.flush();
  return { list: AUTO_PECE_TEXT, radku: radky.length };
}

/** Akce autoUctenkaFoto: fotka účtenky pro náhled v aplikaci – jen soubory ze složky AUTO/uctenky. */
function autoUctenkaFoto_(d) {
  const id = String(d.id || '');
  if (!/^[\w.-]{10,200}$/.test(id)) throw new Error('Neznámá účtenka.');
  const slozka = podslozka_(podslozka_(koren_(), 'AUTO'), 'uctenky');
  const soubor = DriveApp.getFileById(id);
  const rodice = soubor.getParents();
  let mezi = false;
  while (rodice.hasNext()) if (rodice.next().getId() === slozka.getId()) { mezi = true; break; }
  if (!mezi) throw new Error('Tahle fotka není mezi účtenkami.');
  const blob = soubor.getBlob();
  const bajty = blob.getBytes();
  if (bajty.length > MAX_UCTENKY) throw new Error('Fotka je na náhled moc velká.');
  return { obrazek: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(bajty), nazev: soubor.getName() };
}

/** Akce autoSmazat: smaže poslední zápis listu (překlep hned po zápisu) – jen když pořád sedí datum a částka. */
function autoSmazat_(d) {
  const ss = autoTabulka_();
  if (!ss) throw new Error('Tabulka auta není propojená.');
  const zamek = LockService.getScriptLock();
  zamek.waitLock(20000);
  try {
    const list = autoList_(ss, d.list === 'tankovani' ? 'tankovani' : 'naklady');
    const hodnoty = list.getDataRange().getValues();
    const s = AUTO_.sloupce(hodnoty[0] || []);
    const r = Number(d.radek);
    if (!(r >= 2) || r !== AUTO_.volnyRadek(hodnoty, s) - 1) throw new Error('Smazat jde jen poslední zápis – starší oprav přímo v tabulce.');
    const radek = hodnoty[r - 1];
    if (AUTO_.datum(radek[s.datum]) !== Number(d.datum) || AUTO_.cislo(radek[s.castka]) !== Number(d.castka)) {
      throw new Error('Zápis v tabulce se mezitím změnil – obnov stránku.');
    }
    Object.keys(s).forEach(function (k) { if (s[k] >= 0) list.getRange(r, s[k] + 1).clearContent(); });
    SpreadsheetApp.flush();
  } finally {
    zamek.releaseLock();
  }
  return autoData_(ss);
}

/**
 * Akce autoUctenka: fotka účtenky z telefonu (JPEG jako data URL) → Disk + rozpoznaný text → návrh zápisu.
 * S zapsat: true rovnou zapíše (Michal 5. 10.: „když to vyberu, ať se zápis napíše a já ho případně upravím“) – jen když
 * je z účtenky jasné co (datum a částka; u tankování cena za litr, u výdaje kategorie), jinak vrátí návrh pro okno.
 * Stejná fotka podruhé (otisk z aplikace – opakování po výpadku) → stejný soubor, text i zápis, nic dvakrát.
 */
function autoUctenka_(d) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d.obrazek || ''));
  if (!m) throw new Error('Fotka účtenky nepřišla (čekám JPEG).');
  const bajty = Utilities.base64Decode(m[1]);
  if (bajty.length > MAX_UCTENKY) throw new Error('Fotka účtenky je moc velká.');
  const otisk = /^[0-9a-f]{16,64}$/.test(String(d.otisk || '')) ? String(d.otisk) : '';
  const slozka = podslozka_(podslozka_(koren_(), 'AUTO'), 'uctenky');
  let soubor = null;
  if (otisk) { const it = slozka.getFilesByName('uctenka_' + otisk + '.jpg'); if (it.hasNext()) soubor = it.next(); }
  if (!soubor) {
    const nazev = otisk ? 'uctenka_' + otisk + '.jpg' : Utilities.formatDate(new Date(), CASOVE_PASMO, 'yyyy-MM-dd_HHmmss') + '_uctenka.jpg';
    soubor = slozka.createFile(Utilities.newBlob(bajty, 'image/jpeg', nazev));
  }
  let text = '', chybaTextu = '';
  try {
    text = soubor.getDescription() || ''; // text z minulého pokusu (OCR trvá)
    if (!text) {
      text = ocrObrazku_(soubor, slozka);
      try { soubor.setDescription(text.slice(0, 4000)); } catch (chyba) { /* příště se přečte znovu */ }
    }
  } catch (chyba) { chybaTextu = String((chyba && chyba.message) || chyba); }
  const navrh = AUTO_.zUctenky(text, Date.now());
  const vysledek = { uctenka: soubor.getId(), odkaz: soubor.getUrl(), text: text.slice(0, 3000), chybaTextu: chybaTextu, navrh: navrh };
  const ss = d.zapsat ? autoTabulka_() : null;
  if (!ss) return vysledek;
  let zapsano = najdiZapisUctenky_(ss, soubor.getId());
  if (!zapsano) {
    const zapis = AUTO_.zapisZUctenky(navrh, soubor.getId(), kmKeDni_(navrh.datum));
    if (!zapis) return vysledek;
    zapsano = autoZapis_(ss, AUTO_.novyZapis(zapis));
  }
  return Object.assign(vysledek, { zapsano: zapsano, data: autoData_(ss) });
}

/** OCR Disku: obrázek → dočasný Dokument Google (rozpoznání textu, čeština) → prostý text; dokument pak do koše. */
function ocrObrazku_(soubor, slozka) {
  if (typeof Drive === 'undefined') throw new Error('V editoru motoru chybí služba Drive API (čtení účtenek) – účtenku vyplň ručně.');
  const doc = Drive.Files.create({ name: soubor.getName() + ' – text', mimeType: 'application/vnd.google-apps.document', parents: [slozka.getId()] },
    soubor.getBlob(), { ocrLanguage: 'cs' });
  try {
    const odpoved = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + doc.id + '/export?mimeType=text%2Fplain',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (odpoved.getResponseCode() !== 200) throw new Error('převod na text: HTTP ' + odpoved.getResponseCode());
    return odpoved.getContentText('UTF-8');
  } finally {
    try { DriveApp.getFileById(doc.id).setTrashed(true); } catch (chyba) { /* zůstane u účtenek, nevadí */ }
  }
}

/** Čisté funkce auta (testuje motor.test.js). */
const AUTO_ = (function () {
  const NADPISY = { datum: /^datum/, polozka: /^polo[žz]ka/, kategorie: /^kategorie/, castka: /^[čc][áa]stka/, km: /^(stav\s*)?km\b|^tachometr/,
    cenaLitr: /^cena\s*za\s*l/, litry: /^(po[čc]et\s*)?litr/, kdo: /^n[áa]kup|^platil|^kdo/, poznamka: /^pozn[áa]mka/ };
  // kategorie, které tabulka zná z Přehledu – nabídka i bez rozbalovacího seznamu
  const ZAKLADNI = ['Servis', 'Servis - PNEU', 'STK', 'Pojištění', 'Dálniční známka', 'Parkování', 'Myčka', 'Nákup doplňků', 'Doplňková výbava'];
  function txt(x) { return x == null ? '' : String(x).trim(); }

  /** Index sloupců podle nadpisů v 1. řádku (−1 = sloupec chybí). */
  function sloupce(hlavicka) {
    const o = {};
    Object.keys(NADPISY).forEach(function (k) { o[k] = -1; });
    (hlavicka || []).forEach(function (h, i) {
      const t = txt(h).toLowerCase();
      Object.keys(NADPISY).forEach(function (k) { if (o[k] < 0 && NADPISY[k].test(t)) o[k] = i; });
    });
    return o;
  }

  /** 0 → A, 25 → Z, 26 → AA (pro vzorec). */
  function pismeno(i) {
    let s = '', n = i + 1;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  /** „1 338 Kč“, „15 742“, „31,20 Kč“, 1338 → číslo; prázdné nebo nesmysl → null. */
  function cislo(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    let t = txt(x).replace(/[\s ]/g, '').replace(/kč|czk|km$|l$/gi, '');
    if (t.indexOf(',') >= 0 && t.indexOf('.') >= 0) t = t.replace(/\./g, '');
    t = t.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }

  /** Datum z buňky: Date (i z jiného prostředí), „7.12.2025“ i „01.04.2025“ → ms půlnoci; jinak null. */
  function datum(x) {
    if (x && typeof x.getTime === 'function') { const t = x.getTime(); return isFinite(t) ? t : null; }
    const m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(txt(x));
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return d.getMonth() === Number(m[2]) - 1 ? d.getTime() : null;
  }

  /** ID souboru z odkazu na Disk (…/file/d/<id>/…, …?id=<id>) – fotka účtenky v poznámce. */
  function idUctenky(odkaz) {
    const m = /\/file\/d\/([\w.-]{10,})|[?&]id=([\w.-]{10,})/.exec(txt(odkaz));
    return m ? (m[1] || m[2]) : '';
  }

  /**
   * Řádky listu → zápisy { list, radek, datum, polozka, kategorie, castka, km, kdo, poznamka (+ cenaLitr, litry, uctenka) }.
   * odkazy = odkaz v poznámce po řádcích (fotka účtenky); „· účtenka“ z textu poznámky pryč, ať se při opravě nezdvojí.
   */
  function zapisy(hodnoty, list, odkazy) {
    if (!hodnoty || !hodnoty.length) return [];
    const s = sloupce(hodnoty[0]);
    const ven = [];
    for (let i = 1; i < hodnoty.length; i++) {
      const r = hodnoty[i];
      const v = function (k) { return s[k] >= 0 ? r[s[k]] : ''; };
      const d = datum(v('datum')), castka = cislo(v('castka'));
      if (d == null && castka == null) continue; // prázdný řádek nebo seznam kategorií pod tabulkou
      const z = { list: list, radek: i + 1, datum: d, datumText: d == null ? txt(v('datum')) : '', polozka: txt(v('polozka')),
        kategorie: txt(v('kategorie')), castka: castka, km: cislo(v('km')), kdo: txt(v('kdo')).toUpperCase(), poznamka: txt(v('poznamka')) };
      const u = idUctenky(odkazy && odkazy[i]);
      if (u) { z.uctenka = u; z.poznamka = z.poznamka.replace(/\s*·?\s*[úu]čtenka$/i, ''); }
      if (list === 'tankovani') {
        z.cenaLitr = cislo(v('cenaLitr'));
        z.litry = cislo(v('litry'));
        if (z.litry == null && z.castka != null && z.cenaLitr) z.litry = Math.round(z.castka / z.cenaLitr * 100) / 100;
      }
      ven.push(z);
    }
    return ven;
  }

  function kategorie(naklady, zValidace) {
    const videno = {}, ven = [];
    [].concat(zValidace || [], (naklady || []).map(function (z) { return z.kategorie; }), ZAKLADNI).forEach(function (k) {
      const t = txt(k);
      if (!t || /^(palivo|kategorie|koupě auta)$/i.test(t) || videno[t.toLowerCase()]) return;
      videno[t.toLowerCase()] = true;
      ven.push(t);
    });
    return ven;
  }

  /** Přehled: čísla pod nadpisy „Michal“ a „Katka“ (kdo co zaplatil – vzorce v tabulce). */
  function platili(hodnoty) {
    const ven = {};
    for (let i = 0; i + 1 < (hodnoty || []).length; i++) {
      for (let j = 0; j < hodnoty[i].length; j++) {
        const t = txt(hodnoty[i][j]);
        if (/^(michal|katka)$/i.test(t)) { const c = cislo(hodnoty[i + 1][j]); if (c != null) ven[t] = c; }
      }
    }
    return Object.keys(ven).length ? ven : null;
  }

  /** První volný řádek (1 = první řádek listu) pod posledním zápisem – přes prázdné předformátované řádky. */
  function volnyRadek(hodnoty, s) {
    let posledni = 0;
    for (let i = 1; i < hodnoty.length; i++) {
      if ((s.datum >= 0 && datum(hodnoty[i][s.datum]) != null) || (s.castka >= 0 && cislo(hodnoty[i][s.castka]) != null)) posledni = i;
    }
    const hlavni = ['datum', 'polozka', 'kategorie', 'castka', 'km'].map(function (k) { return s[k]; }).filter(function (c) { return c >= 0; });
    let i = posledni + 1;
    while (i < hodnoty.length && hlavni.some(function (c) { return txt(hodnoty[i][c]) !== ''; })) i++;
    return i + 1;
  }

  /** Zápis z aplikace → zkontrolovaný { druh, datum [r, m, d], castka, km, kdo, poznamka, uctenka, cenaLitr | kategorie, polozka }. */
  function novyZapis(d) {
    const druh = d.druh === 'tankovani' ? 'tankovani' : d.druh === 'naklad' ? 'naklady' : '';
    if (!druh) throw new Error('Neznámý druh zápisu.');
    const den = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txt(d.datum));
    if (!den || new Date(Number(den[1]), Number(den[2]) - 1, Number(den[3])).getMonth() !== Number(den[2]) - 1) throw new Error('Chybí datum.');
    const castka = cislo(d.castka);
    if (castka == null || castka <= 0 || castka >= 1e7) throw new Error('Částka musí být kladné číslo.');
    const km = txt(d.km) === '' ? null : cislo(d.km);
    if (txt(d.km) !== '' && (km == null || km < 0 || km > 2e6)) throw new Error('Stav km nesedí.');
    const z = { druh: druh, datum: [Number(den[1]), Number(den[2]), Number(den[3])], castka: Math.round(castka * 100) / 100,
      km: km == null ? null : Math.round(km), kdo: txt(d.kdo).toUpperCase() === 'K' ? 'K' : 'M', poznamka: txt(d.poznamka).slice(0, 200),
      uctenka: /^[\w.-]{10,200}$/.test(txt(d.uctenka)) ? txt(d.uctenka) : '' };
    if (druh === 'tankovani') {
      const cena = cislo(d.cenaLitr);
      if (cena == null || cena < 10 || cena > 150) throw new Error('Cena za litr nesedí (Kč za litr, třeba 36,90).');
      z.cenaLitr = Math.round(cena * 100) / 100;
    } else {
      z.kategorie = txt(d.kategorie).slice(0, 60);
      if (!z.kategorie) throw new Error('Vyber kategorii.');
      z.polozka = txt(d.polozka).slice(0, 120);
    }
    return z;
  }

  // částky na účtence: „1 860,00“, „1860,00“, „1.860,00“, „1860.00“
  const PENIZE = /(\d{1,3}(?:[  .]\d{3})+|\d+)[,.](\d{2})(?!\d)/g;
  function penize(s) {
    const v = [];
    let m;
    PENIZE.lastIndex = 0;
    while ((m = PENIZE.exec(s))) v.push(Number(m[1].replace(/[  .]/g, '') + '.' + m[2]));
    return v;
  }
  const OBCHODY = [['ČSAD', /[čc]sad/i], ['ONO', /\bono\b/i], ['Shell', /shell/i], ['OMV', /\bomv\b/i], ['MOL', /\bmol\b/i], ['Orlen', /orlen|benzina/i],
    ['Avia', /\bavia\b/i], ['EuroOil', /euro\s*oil/i], ['Robin Oil', /robin\s*oil/i], ['Globus', /globus/i], ['Kaufland', /kaufland/i], ['Tesco', /tesco/i],
    ['Albert', /albert/i], ['Lidl', /\blidl\b/i], ['Makro', /\bmakro\b/i], ['Hornbach', /hornbach/i], ['Auto Kelly', /auto\s*kelly/i]];

  /**
   * Text z účtenky (OCR) → návrh zápisu: { druh 'tankovani' | 'naklad', datum 'RRRR-MM-DD', castka, litry, cenaLitr, kategorie, obchod }.
   * Co nejde poznat, je null – aplikace to nechá vyplnit. ted = ms (datum na účtence nesmí být v budoucnu ani starší než rok).
   */
  function zUctenky(text, ted) {
    const radky = String(text || '').replace(/\r/g, '').split('\n').map(function (r) { return r.trim(); }).filter(Boolean);
    const cela = radky.join('\n');
    let litry = null, cenaLitr = null, datumIso = null, m;
    // celková částka: řádek s „k úhradě / celkem“ (jinak „platba / zaplaceno“) → největší částka na něm nebo na řádku pod ním;
    // bez DPH, základu daně a vrácených peněz
    const naRadcich = function (vzor) {
      let v = null;
      radky.forEach(function (r, i) {
        if (!vzor.test(r) || /vr[áa]ceno|p[řr][ií]jato|bez\s*dph|z[áa]klad|sazba/i.test(r)) return;
        let x = penize(r);
        if (!x.length && i + 1 < radky.length) x = penize(radky[i + 1]);
        x.forEach(function (c) { if (c > 0 && c < 1e6 && (v == null || c > v)) v = c; });
      });
      return v;
    };
    let castka = naRadcich(/k\s*[úu]hrad|celkem|celkov[áa]/i);
    if (castka == null) castka = naRadcich(/zaplac|platba|kartou|platebn|suma|total/i);
    m = /(\d{1,3}[,.]\d{1,3})\s*(?:l|lit(?:r[ůu]|ry)?|ltr)\b/i.exec(cela);
    if (m) { const v = Number(m[1].replace(',', '.')); if (v > 0.5 && v < 150) litry = v; }
    m = /(\d{2}[,.]\d{1,2})\s*(?:kč|czk)?\s*\/\s*(?:l|lit)/i.exec(cela) || /(?:\bx|\*|×)\s*(\d{2}[,.]\d{2})(?!\d)/i.exec(cela);
    if (m) { const v = Number(m[1].replace(',', '.')); if (v >= 15 && v <= 90) cenaLitr = v; }
    if (castka == null) { const vse = penize(cela).filter(function (x) { return x < 1e6; }); if (vse.length) castka = Math.max.apply(null, vse); }
    if (litry && cenaLitr && castka == null) castka = Math.round(litry * cenaLitr * 100) / 100;
    if (litry && castka && cenaLitr == null) { const v = castka / litry; if (v >= 15 && v <= 90) cenaLitr = Math.round(v * 100) / 100; }
    if (cenaLitr && castka && litry == null) litry = Math.round(castka / cenaLitr * 100) / 100;
    const DATUM = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)|(\d{4})-(\d{2})-(\d{2})/g;
    while ((m = DATUM.exec(cela))) {
      const r = m[4] ? Number(m[4]) : Number(m[3].length === 2 ? '20' + m[3] : m[3]);
      const mes = Number(m[4] ? m[5] : m[2]), den = Number(m[4] ? m[6] : m[1]);
      const d = new Date(r, mes - 1, den);
      if (d.getMonth() !== mes - 1 || d.getDate() !== den || d.getTime() > ted + 864e5 || d.getTime() < ted - 400 * 864e5) continue;
      datumIso = r + '-' + String(mes).padStart(2, '0') + '-' + String(den).padStart(2, '0');
      break;
    }
    const palivo = litry != null && /nafta|diesel|motorov|benz[ií]n|natural|\bn\s?95\b|\bba\s?95\b|lpg|verva|maxx|v-power|efecta/i.test(cela);
    let kategorie = null;
    if (!palivo) {
      if (/my[čc]k|myt[ií]|wash/i.test(cela)) kategorie = 'Myčka';
      else if (/pneu|p[řr]ezu/i.test(cela)) kategorie = 'Servis - PNEU';
      else if (/servis|v[ýy]m[ěe]na\s*oleje|filtr/i.test(cela)) kategorie = 'Servis';
      else if (/\bstk\b|technick[áa]\s*kontrol|emis/i.test(cela)) kategorie = 'STK';
      else if (/parkov/i.test(cela)) kategorie = 'Parkování';
      else if (/d[áa]ln[ií][čc]n|vignet/i.test(cela)) kategorie = 'Dálniční známka';
      else if (/adblue|ost[řr]ikova|kapalin|st[ěe]ra[čc]|olej/i.test(cela)) kategorie = 'Nákup doplňků';
    }
    let obchod = null;
    OBCHODY.some(function (o) { if (o[1].test(cela)) { obchod = o[0]; return true; } return false; });
    if (!obchod) {
      const r = radky.find(function (x) { return /[a-zá-ž]{3}/i.test(x) && !/i[čc]o?\b|di[čc]|[úu][čc]tenk|doklad|datum|tel|www|kasa|pokladn/i.test(x); });
      if (r) obchod = r.slice(0, 40);
    }
    return { druh: palivo ? 'tankovani' : 'naklad', datum: datumIso, castka: castka, litry: litry, cenaLitr: cenaLitr, kategorie: kategorie, obchod: obchod };
  }

  // sezónní připomínky (měsíc, den) – Michal 5. 10.: „kdy měnit kola a upozornění, kdy to mám začít řešit“
  const SEZONNI = [
    { id: 'pneu-zimni', nazev: 'Přezout na zimní pneumatiky', od: [10, 10], do: [11, 15], hotovo: /pneu|p[řr]ezut|p[řr]ezou/i,
      text: 'Objednej pneuservis. Zimní, jakmile teploty klesají pod 7 °C; při sněhu a náledí jsou od 1. 11. do 31. 3. povinné.' },
    { id: 'pneu-letni', nazev: 'Přezout na letní pneumatiky', od: [3, 20], do: [4, 30], hotovo: /pneu|p[řr]ezut|p[řr]ezou/i,
      text: 'Až se teploty drží nad 7 °C (obvykle v dubnu). Objednej pneuservis s předstihem, zimní uskladni.' },
    { id: 'zima', nazev: 'Připravit auto na zimu', od: [10, 1], do: [11, 15], hotovo: /ost[řr]ikova|st[ěe]ra[čc]/i,
      text: 'Zimní směs do ostřikovačů, nové stěrače, kontrola baterie a nemrznoucí kapaliny, škrabka a odmrazovač do kufru.' },
    { id: 'jaro', nazev: 'Klimatizace a pylový filtr', od: [4, 1], do: [5, 31], hotovo: /klimatiz|pylov/i,
      text: 'Před létem nový pylový filtr; klimatizaci 1× za 2 roky vydezinfikovat a zkontrolovat chladivo.' }
  ];
  const DEN = 864e5, PREDEM = 30 * DEN;

  function den(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function datumCz(ms) { const d = new Date(ms); return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear(); }

  /**
   * Připomínky k autu: sezónní okna (letos, po skončení příští rok), servis a AdBlue podle auta (MyŠkoda), výročí
   * pojištění a konec dálniční známky z Náklady. Každá { id, klic (pro jednorázové upozornění), nazev, text, od, do,
   * stav: 'ted' | 'brzy', hotovo }. Hotovo = v Náklady je k tomu zápis od začátku okna (−30 dní).
   */
  function pripominky(d, ted) {
    const dnes = den(ted);
    const ven = [];
    const naklady = (d && d.naklady) || [];
    const zapis = function (vzor, od) {
      return naklady.some(function (z) { return z.datum != null && z.datum >= od && vzor.test([z.kategorie, z.polozka, z.poznamka].join(' ')); });
    };
    SEZONNI.forEach(function (s) {
      let rok = new Date(dnes).getFullYear();
      let od = new Date(rok, s.od[0] - 1, s.od[1]).getTime(), doo = new Date(rok, s.do[0] - 1, s.do[1]).getTime();
      if (dnes > doo) { rok++; od = new Date(rok, s.od[0] - 1, s.od[1]).getTime(); doo = new Date(rok, s.do[0] - 1, s.do[1]).getTime(); }
      if (dnes < od - PREDEM) return;
      ven.push({ id: s.id, klic: s.id + '-' + rok, nazev: s.nazev, text: s.text, od: od, do: doo, stav: dnes >= od ? 'ted' : 'brzy',
        hotovo: zapis(s.hotovo, od - PREDEM) });
    });
    // servis a AdBlue podle auta
    const a = d && d.myskoda && Array.isArray(d.myskoda.auta) ? d.myskoda.auta[0] : null;
    const sv = (a && a.servis) || {};
    const servis = function (id, nazev, km, dni) {
      if (km == null && dni == null) return;
      const ted2 = (km != null && km <= 1500) || (dni != null && dni <= 21);
      const brzy = (km != null && km <= 4000) || (dni != null && dni <= 60);
      if (!ted2 && !brzy) return;
      const kdy = dni != null ? dnes + dni * DEN : null;
      ven.push({ id: id, klic: id + '-' + (kdy ? new Date(kdy).getFullYear() + '-' + (new Date(kdy).getMonth() + 1) : 'km'), nazev: nazev,
        text: 'Podle auta za ' + [km != null ? km.toLocaleString('cs-CZ') + ' km' : '', dni != null ? dni + ' dní' : ''].filter(Boolean).join(' nebo ') +
          ' – objednej servis.', od: dnes, do: kdy || dnes, stav: ted2 ? 'ted' : 'brzy', hotovo: false });
    };
    servis('olej', 'Servis – výměna oleje', sv.olejKm, sv.olejDni);
    servis('prohlidka', 'Servisní prohlídka', sv.prohlidkaKm, sv.prohlidkaDni);
    if (a && a.adblue != null && a.adblue <= 2500) {
      ven.push({ id: 'adblue', klic: 'adblue-' + new Date(dnes).getFullYear() + '-' + (new Date(dnes).getMonth() + 1), nazev: 'Doplnit AdBlue',
        text: 'Dojezd na AdBlue ' + a.adblue.toLocaleString('cs-CZ') + ' km – kup kanystr a dolij.', od: dnes, do: dnes,
        stav: a.adblue <= 1000 ? 'ted' : 'brzy', hotovo: false });
    }
    // výročí pojištění (poslední roční platba + rok) a dálniční známka (platí 365 dní)
    const posledni = function (vzor) {
      return naklady.filter(function (z) { return z.datum != null && vzor.test([z.kategorie, z.polozka].join(' ')); })
        .sort(function (x, y) { return y.datum - x.datum; })[0] || null;
    };
    // termíny zadané v aplikaci nebo Claudem (AUTO/terminy.json) mají přednost před odhadem z Náklady
    const terminy = (d && d.terminy) || {};
    const zData = function (iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : null; };
    // STK jen ze zadaného termínu (v tabulce není)
    const stk = zData(terminy.stk);
    if (stk != null && dnes >= stk - 45 * DEN) {
      ven.push({ id: 'stk', klic: 'stk-' + terminy.stk, nazev: 'STK', od: stk - 45 * DEN, do: stk, hotovo: false,
        stav: dnes >= stk - 21 * DEN ? 'ted' : 'brzy',
        text: (dnes > stk ? 'STK propadla ' : 'STK platí do ') + datumCz(stk) + ' – objednej termín na stanici technické kontroly.' });
    }
    const poj = posledni(/poji[šs]t/i);
    const pojZTerminu = zData(terminy.pojisteni);
    if (pojZTerminu != null || poj) {
      // výročí: zadané (posune se na nejbližší budoucí), jinak poslední roční platba + rok
      const vyroci = new Date(pojZTerminu != null ? pojZTerminu : poj.datum);
      if (pojZTerminu != null) { while (vyroci.getTime() < dnes - 21 * DEN) vyroci.setFullYear(vyroci.getFullYear() + 1); } else vyroci.setFullYear(vyroci.getFullYear() + 1);
      const v = vyroci.getTime();
      if (dnes >= v - PREDEM && dnes <= v + 21 * DEN) {
        ven.push({ id: 'pojisteni', klic: 'pojisteni-' + vyroci.getFullYear(), nazev: 'Výročí pojištění', od: v - PREDEM, do: v, hotovo: false,
          stav: dnes >= v - 14 * DEN ? 'ted' : 'brzy',
          text: (poj ? 'Roční pojištění bylo ' + datumCz(poj.datum) + ' (' + Math.round(poj.castka || 0).toLocaleString('cs-CZ') + ' Kč) – výročí ' : 'Výročí pojištění ') +
            datumCz(v) + '. Zkontroluj platbu, případně porovnej nabídky; zaplacené zapiš do tabulky.' });
      }
    }
    const znamka = posledni(/d[áa]ln[ií][čc]n/i);
    const znamkaDo = zData(terminy.znamka);
    if (znamka || znamkaDo != null) {
      const konec = znamkaDo != null ? znamkaDo : znamka.datum + 364 * DEN;
      if (dnes >= konec - 45 * DEN) {
        ven.push({ id: 'znamka', klic: 'znamka-' + new Date(konec).getFullYear(), nazev: 'Dálniční známka', od: konec - 21 * DEN, do: konec, hotovo: false,
          stav: dnes >= konec - 21 * DEN ? 'ted' : 'brzy',
          text: dnes > konec ? 'Poslední zapsaná známka platila do ' + datumCz(konec) + '. Kup novou (edalnice.cz) – nebo ji zapiš, jestli už ji máš.'
            : 'Známka platí do ' + datumCz(konec) + ' – kup novou na edalnice.cz.' });
      }
    }
    return ven;
  }

  /** Návrh z účtenky → zápis pro novyZapis, nebo null, když z účtenky není jasné co (pak okno v aplikaci). */
  function zapisZUctenky(n, uctenka, km) {
    if (!n || !n.datum || !(n.castka > 0)) return null;
    const zaklad = { datum: n.datum, castka: n.castka, km: km == null ? '' : km, kdo: 'M', uctenka: uctenka || '' };
    if (n.druh === 'tankovani') {
      const cena = n.cenaLitr || (n.litry ? Math.round(n.castka / n.litry * 100) / 100 : null);
      if (!(cena >= 10 && cena <= 150)) return null;
      return Object.assign(zaklad, { druh: 'tankovani', cenaLitr: cena, poznamka: n.obchod || '' });
    }
    if (!n.kategorie) return null;
    return Object.assign(zaklad, { druh: 'naklad', kategorie: n.kategorie, polozka: n.obchod || '', poznamka: '' });
  }

  return { sloupce: sloupce, pismeno: pismeno, cislo: cislo, datum: datum, zapisy: zapisy, kategorie: kategorie, platili: platili,
    volnyRadek: volnyRadek, novyZapis: novyZapis, zUctenky: zUctenky, idUctenky: idUctenky, zapisZUctenky: zapisZUctenky, pripominky: pripominky };
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
  dny: ['0', '1', '2', '3'],                        // pCK0 dnes … pCK3 za tři dny
  domov: null                                       // { lat, lon } – nastavený domov (akce pocasiDomov); místo výše je pak domov
};
// Domov: poloha z Wi-Fi bývá o pár km vedle (telefon i PC hlásily sousední obec – Michal 9. 10.: „nevím proč mám počasí
// jinde“), proto v okolí domova (do 8 km, při nepřesné poloze i dál podle přesnosti, a v celém ORP domova) ukáže domov.
const DOMOV_OKOLI_M = 8000;
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

/** Pro info (Nastavení → Počasí): místo bez polohy a jestli je to nastavený domov (chybná vlastnost POCASI nesmí shodit info). */
function infoPocasi_() {
  try { const n = nastaveniPocasi_(); return { misto: n.misto, domov: !!n.domov }; } catch (chyba) { return { misto: '', domov: false }; }
}

/**
 * Přehled pro aplikaci; znovu = obejít hotový přehled (stahuje se dál podmíněně).
 * poloha = {lat, lon} z telefonu (aplikace ji pošle jen se zapnutým „Počasí podle polohy“) → výstrahy pro ORP v místě,
 * nejbližší řeka a předpověď kraje; bez polohy (nebo mimo ČR) místo z POCASI. Upozornění bez polohy použijí
 * poslední polohu z aplikace, když není starší než den.
 */
function pocasi_(znovu, poloha) {
  let p = polohaPocasi_(poloha);
  if (p) vlastnosti_().setProperty('POCASI_POLOHA', JSON.stringify({ lat: p.lat, lon: p.lon, presnost: p.presnost, kdy: Date.now() }));
  else if (poloha === undefined) p = posledniPoloha_(); // upozornění: poslední poloha z aplikace (nejvýš den stará)
  else if (vlastnosti_().getProperty('POCASI_POLOHA')) vlastnosti_().deleteProperty('POCASI_POLOHA'); // poloha vypnutá
  let n = null, chybaPolohy = '';
  // v okolí domova domov (poloha z Wi-Fi bývá o pár km vedle): do 8 km (při nepřesné poloze i dál), nebo kdekoli ve stejném
  // ORP – výstrahy ČHMÚ jsou pro celé ORP stejné (Michal 9. 10.: domov Veselí n. M., Wi-Fi hlásí obec 10 km od něj)
  const vychozi = (function () { try { return nastaveniPocasi_(); } catch (chyba) { return null; } })();
  let doma = !!(p && vychozi && vychozi.domov && vzdalenostM_(p, vychozi.domov) <= Math.max(DOMOV_OKOLI_M, (p.presnost || 0) + 3000));
  if (p && !doma) { try { n = nastaveniZPolohy_(p); } catch (chyba) { chybaPolohy = String(chyba.message || chyba); } }
  if (n && vychozi && vychozi.domov && Object.keys(n.orp)[0] === Object.keys(vychozi.orp || {})[0]) doma = true;
  if (doma) n = Object.assign({}, vychozi, { poloha: vychozi.domov });
  if (!n) n = nastaveniPocasi_();
  const klic = n.poloha ? 'pocasi:prehled:' + klicMista_(n) : 'pocasi:prehled';
  // domov: aplikace ukáže jméno místa i bez polohy; přibližná poloha mimo domov → „≈ místo“ a rada v detailu
  // (mění se s každým měřením – do mezipaměti jde jen přehled místa)
  const dopln = function (x) {
    const y = Object.assign({}, x);
    delete y.domov; delete y.presnost;
    if (doma || (!p && vychozi && vychozi.domov)) y.domov = true;
    if (p && !doma && p.presnost > 1500) y.presnost = p.presnost;
    return y;
  };
  if (!znovu) {
    const hotovo = nactiZCache_(klic);
    if (hotovo) return dopln(hotovo);
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
  return dopln(prehled);
}

/** Vzdálenost dvou bodů { lat, lon } v metrech (na pár km stačí rovinná aproximace). */
function vzdalenostM_(a, b) {
  const dy = (Number(a.lat) - Number(b.lat)) * 111320;
  const dx = (Number(a.lon) - Number(b.lon)) * 111320 * Math.cos(Number(a.lat) * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Akce pocasiDomov: { lat, lon, nazev } = domov (obec vybraná v Nastavení → Počasí; aplikace ji najde podle jména),
 * { smazat: true } = zpět na výchozí místo. Domov = místo bez polohy a v okolí domova (vlastnost POCASI).
 */
function pocasiDomov_(d) {
  const vl = vlastnosti_();
  if (d.smazat) {
    vl.deleteProperty('POCASI');
    smazCache_('pocasi:prehled');
    return { misto: POCASI_VYCHOZI.misto, domov: null };
  }
  const p = polohaPocasi_(d);
  if (!p) throw new Error('Domov musí být v Česku.');
  const n = nastaveniZPolohy_(p);
  const nazev = String(d.nazev || '').replace(/\s+/g, ' ').trim().slice(0, 60) || n.misto;
  vl.setProperty('POCASI', JSON.stringify({ misto: nazev, orp: n.orp, stanice: n.stanice, kraj: n.kraj, domov: { lat: p.lat, lon: p.lon } }));
  smazCache_('pocasi:prehled');
  return { misto: nazev, domov: { lat: p.lat, lon: p.lon }, orp: n.orp };
}

// ---- počasí podle polohy: ORP z ČÚZK (RÚIAN), kód výstrah CISORP, kraj předpovědi, nejbližší vodoměrné stanice
const CUZK_RUIAN = 'https://ags.cuzk.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/';
// kód ORP v RÚIAN → kód CISORP ve výstrahách ČHMÚ (ČSÚ číselník 65; Praha je ve výstrahách 1100)
const RUIAN_CISORP = {19:1100,27:2101,35:2125,43:2126,51:2102,60:2108,78:2109,86:2124,94:2110,108:2106,116:2112,124:2104,132:2111,141:2114,159:2117,167:2115,175:2116,183:2113,191:2118,205:2119,213:2103,221:2122,230:2105,248:2107,256:2120,264:2121,272:2123,281:3101,299:3102,302:3103,311:3104,329:3105,337:3106,345:3107,353:3108,361:3109,370:3110,388:3111,396:3112,400:3113,418:3114,426:3115,434:3116,442:3117,451:3201,469:3202,477:3203,485:3204,493:3205,507:3206,515:3207,523:3208,531:3209,540:3210,558:3211,566:3212,574:3213,582:3214,591:3215,604:4101,612:4102,621:4103,639:4104,647:4105,655:4106,663:4107,671:4201,680:4202,698:4203,701:4204,710:4205,728:4206,736:4207,744:4208,752:4209,761:4210,779:4211,787:4212,795:4213,809:4214,817:4215,825:4216,833:5101,841:5102,850:5103,868:5104,876:5105,884:5106,892:5107,906:5108,914:5109,922:5110,931:5201,949:5202,957:5203,965:5204,973:5205,981:5206,990:5207,1007:5208,1015:5209,1023:5210,1031:5211,1040:5212,1058:5213,1066:5214,1074:5215,1082:5301,1091:5302,1104:5303,1112:5304,1121:5305,1139:5306,1147:5307,1155:5308,1163:5309,1171:5310,1180:5311,1198:5312,1201:5313,1210:5314,1228:5315,1236:6101,1244:6102,1252:6103,1261:6104,1279:6105,1287:6106,1295:6107,1309:6108,1317:6203,1325:6201,1333:6202,1341:6204,1350:6205,1368:6206,1376:6207,1384:6208,1392:6209,1406:6210,1414:6211,1422:6212,1431:6213,1449:6214,1457:6215,1465:6216,1473:6217,1481:6219,1490:6218,1503:6220,1511:6221,1520:6109,1538:6110,1546:6111,1554:6112,1562:6113,1571:6114,1589:6115,1597:7101,1601:7102,1619:7103,1627:7104,1635:7105,1643:7106,1651:7107,1660:7108,1678:7109,1686:7110,1694:7111,1708:7112,1716:7113,1724:7201,1732:7202,1741:7203,1759:7204,1767:7205,1775:7206,1783:7207,1791:7208,1805:7209,1813:7210,1821:7211,1830:7212,1848:7213,1856:8101,1864:8102,1872:8103,1881:8104,1899:8105,1902:8106,1911:8107,1929:8108,1937:8109,1945:8110,1953:8111,1961:8112,1970:8113,1988:8114,1996:8115,2003:8116,2011:8117,2020:8118,2038:8119,2046:8120,2054:8121,2062:8122};
const KRAJ_PREDPOVEDI = { 11: 'RPPH', 21: 'RPSC', 31: 'RPCB', 32: 'RPPL', 41: 'RPKV', 42: 'RPUL', 51: 'RPLB', 52: 'RPHK', 53: 'RPPU',
  61: 'RPVY', 62: 'RPJM', 71: 'RPOL', 72: 'RPZL', 81: 'RPMS' };

/** Poloha z aplikace zaokrouhlená na 0,01° (~1 km) s přesností měření (m, 0 = neznámá); mimo ČR (nebo nesmysl) → null. */
function polohaPocasi_(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Math.round(Number(p.lat) * 100) / 100, lon = Math.round(Number(p.lon) * 100) / 100;
  const presnost = Math.max(0, Math.min(100000, Math.round(Number(p.presnost) || 0)));
  return lat > 48.5 && lat < 51.1 && lon > 12 && lon < 18.9 ? { lat: lat, lon: lon, presnost: presnost } : null;
}

function posledniPoloha_() {
  try {
    const p = JSON.parse(vlastnosti_().getProperty('POCASI_POLOHA') || 'null');
    return p && Date.now() - p.kdy < 864e5 ? polohaPocasi_(p) : null;
  } catch (chyba) { return null; }
}

// i se jménem místa: dvě sousední obce v jednom ORP se stejnými stanicemi by jinak sdílely název v mezipaměti
function klicMista_(n) { return Object.keys(n.orp).join(',') + '|' + n.kraj + '|' + (n.stanice || []).join(',') + '|' + n.misto; }

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
const ZDRAVI_SYNC_MIN = 30;     // WHOOP dotahuje spouštěč (whoopNaPozadi_) nejvýš jednou za 30 minut
const ZDRAVI_SYNC_ZALOHA_MIN = 120; // při otevření Zdraví jen když spouštěč nejede (data starší 2 h) nebo Obnovit

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
  if (!pocet) {
    // ukázka začátku toho, co přišlo (bez klíče) – podle ní se pozná, v jakém tvaru zkratka data posílá
    const ukazka = {};
    poleApple_(d).slice(0, 4).forEach(function (k) { ukazka[k] = String(Array.isArray(d[k]) ? d[k].join(' | ') : d[k]).slice(0, 80); });
    zapisPosledniApple_({ ok: false, pole: poleApple_(d), ukazka: ukazka,
      chyba: 'Ve zprávě ze zkratky nejsou žádná data, kterým by motor rozuměl (zkontroluj proměnné v Načíst obsah URL).' });
    throw new Error('Ve zprávě ze zkratky nejsou žádná data (zkontroluj proměnné v Načíst obsah URL).');
  }
  ulozZdravi_(dny, 'apple', null);
  vlastnosti_().setProperty('APPLE_SYNC', String(Date.now()));
  const seznam = Object.keys(dny).sort();
  zapisPosledniApple_({ ok: true, ulozeno: pocet, od: seznam[0], do: seznam[seznam.length - 1], pole: poleApple_(d) });
  // zkratku spouští otevření aplikace WHOOP → rovnou čerstvý WHOOP
  try { if (whoopStav_().propojeno) whoopSync_(3); } catch (chyba) { /* stačí Apple */ }
  return { ulozeno: pocet };
}

/** Jména polí, která zkratka poslala (bez klíče a akce). */
function poleApple_(d) {
  return Object.keys(d || {}).filter(function (k) { return k !== 'klic' && k !== 'akce'; });
}

/** Výsledek posledního pokusu zkratky (6 h v mezipaměti) – aplikace ho ukáže v Nastavení → Zdraví. */
function zapisPosledniApple_(info) {
  ulozDoCache_('APPLE_POSLEDNI', Object.assign({ kdy: Date.now() }, info), 21600);
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

/** Akce zdravi: přehled za 30 dní; WHOOP dotahuje spouštěč na pozadí – tady jen při Obnovit, nebo když spouštěč nejede. */
function zdravi_(znovu) {
  const whoop = whoopStav_();
  let chybaSync = '';
  if (whoop.propojeno && (znovu || Date.now() - whoop.sync.kdy > ZDRAVI_SYNC_ZALOHA_MIN * 60000)) {
    try { whoopSync_(whoop.sync.kdy ? 5 : ZDRAVI_DNI); } catch (chyba) { chybaSync = String(chyba.message || chyba); }
  }
  // hotový přehled z mezipaměti, dokud se nic nezapsalo (značka ZDRAVI_V se mění s každým zápisem, i ze zkratky a WHOOP)
  // ani Claude neupravil své soubory – čtení pak nemusí otevírat sedm souborů na Disku
  const ted = Date.now();
  const vl = vlastnosti_();
  const klic = ['zdravi', vl.getProperty('ZDRAVI_V') || '', zmenaSouboruClauda_(), whoopStav_().sync.kdy, vl.getProperty('APPLE_SYNC') || '',
    Utilities.formatDate(new Date(ted), CASOVE_PASMO, 'yyyy-MM-dd')].join(':');
  let p = !znovu && !chybaSync ? nactiZCache_(klic) : null;
  if (!p) {
    const slozka = slozkaZdravi_();
    const tento = Utilities.formatDate(new Date(ted), CASOVE_PASMO, 'yyyy-MM');
    const minuly = Utilities.formatDate(new Date(ted - (ZDRAVI_DNI + 1) * 864e5), CASOVE_PASMO, 'yyyy-MM');
    const soubory = (minuly === tento ? [tento] : [minuly, tento]).map(function (m) { return nactiMesicZdravi_(slozka, m).data; });
    p = ZDRAVI_.prehled(soubory, ted, ZDRAVI_DNI);
    p.whoop = whoopStav_();
    if (chybaSync) p.whoop.sync.chyba = chybaSync;
    p.rezim = zdraviRezim_();
    p.vaha = nactiVahu_(slozka).zaznamy;
    const claude = nactiJson_(slozka, 'PITI_JIDLO_CLAUDE.json').data || {};
    p.doplnky = spojDoplnky_(nactiDoplnky_(slozka).dny, claude);
    p.pitiJidlo = pitiJidloDny_(slozka, 14, claude);
    if (!chybaSync) ulozDoCache_(klic, p, 1800);
  }
  // poslední pokus zkratky Zdraví (i nepovedený, ten značku nemění) vždy čerstvý
  p.apple = { kdy: Number(vl.getProperty('APPLE_SYNC') || 0), posledni: nactiZCache_('APPLE_POSLEDNI') };
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

/**
 * Akce vaha: d.kg = zapsat (čas = d.kdy, když se vážil dřív – Michal 9. 10.: „ne vždy si to hned napíšu“; jinak teď),
 * d.smazat = čas záznamu ke smazání (překlep). Čas nejvýš 60 dní zpátky a ne v budoucnu. Vrací všechny záznamy.
 */
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
      const ted = Date.now();
      let kdy = ted;
      if (d.kdy != null && d.kdy !== '') {
        kdy = typeof d.kdy === 'number' ? d.kdy : Date.parse(String(d.kdy));
        if (!(kdy > ted - 60 * 864e5 && kdy <= ted + 5 * 60000)) throw new Error('Čas vážení musí být v posledních 60 dnech (ne v budoucnu).');
        kdy = Math.round(kdy / 60000) * 60000;
        while (zaznamy.some(function (z) { return z.kdy === kdy; })) kdy += 1000; // stejná minuta → o vteřinu dál (čas je id záznamu)
      }
      zaznamy.push({ kdy: kdy, kg: kg });
    }
    zaznamy.sort(function (a, b) { return a.kdy - b.kdy; });
    const obsah = JSON.stringify({ aktualizovano: Date.now(), zaznamy: zaznamy });
    if (v.soubor) v.soubor.setContent(obsah); else slozka.createFile('VAHA.json', obsah, MimeType.PLAIN_TEXT);
    return { zaznamy: zaznamy };
  } finally {
    zamek.releaseLock();
  }
}

// ---- doplňky: odškrtnutí z aplikace (stejné na telefonu i PC, s historií pro týdenní přehled) –
// CLAUDE_SCHRANKA/ZDRAVI/DOPLNKY.json { aktualizovano, dny: { 'RRRR-MM-DD': { id: true } } }, drží se 120 dní
const DOPLNKY_DNI = 120;

function nactiDoplnky_(slozka) {
  const it = slozka.getFilesByName('DOPLNKY.json');
  if (!it.hasNext()) return { soubor: null, dny: {} };
  const soubor = it.next();
  let data = null;
  try { data = JSON.parse(soubor.getBlob().getDataAsString('UTF-8')); } catch (chyba) { data = null; }
  return { soubor: soubor, dny: data && data.dny && typeof data.dny === 'object' ? data.dny : {} };
}

/** Akce doplnky: { den: 'RRRR-MM-DD', zmeny: { id: true | false } } – odškrtnutí jednoho dne (i víc položek naráz). Vrací všechny dny. */
function doplnky_(d) {
  const den = String(d.den || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) throw new Error('Den má tvar RRRR-MM-DD.');
  const zmeny = d.zmeny && typeof d.zmeny === 'object' ? d.zmeny : {};
  const zamek = LockService.getScriptLock();
  zamek.waitLock(30000);
  try {
    const slozka = slozkaZdravi_();
    const v = nactiDoplnky_(slozka);
    const dny = v.dny;
    const zaznam = dny[den] || {};
    // zrušené odškrtnutí = výslovné „ne“ (false): přebije doplněk, který zapsal Claude z diktátu (jeho soubor motor nemění)
    Object.keys(zmeny).slice(0, 50).forEach(function (id) {
      if (!/^[\w-]{1,40}$/.test(id)) return;
      zaznam[id] = !!zmeny[id];
    });
    if (Object.keys(zaznam).length) dny[den] = zaznam; else delete dny[den];
    const hranice = Utilities.formatDate(new Date(Date.now() - DOPLNKY_DNI * 864e5), CASOVE_PASMO, 'yyyy-MM-dd');
    Object.keys(dny).forEach(function (k) { if (k < hranice) delete dny[k]; });
    const obsah = JSON.stringify({ aktualizovano: Date.now(), dny: dny });
    if (v.soubor) v.soubor.setContent(obsah); else slozka.createFile('DOPLNKY.json', obsah, MimeType.PLAIN_TEXT);
    return { dny: spojDoplnky_(dny, nactiJson_(slozka, 'PITI_JIDLO_CLAUDE.json').data) };
  } finally {
    zamek.releaseLock();
  }
}

/**
 * Odškrtnuté doplňky po dnech pro aplikaci: z aplikace (DOPLNKY.json) + z diktátu („vzal jsem kreatin“ – Claude je zapíše
 * do PITI_JIDLO_CLAUDE.json → doplnky); výslovné „ne“ z aplikace (false) Claudův zápis přebije. Jen true – { den: { id: true } }.
 */
function spojDoplnky_(dny, claude) {
  const ven = {};
  const den = function (d) { return (ven[d] = ven[d] || {}); };
  const od = claude && claude.doplnky && typeof claude.doplnky === 'object' ? claude.doplnky : {};
  Object.keys(od).forEach(function (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !od[d] || typeof od[d] !== 'object') return;
    Object.keys(od[d]).forEach(function (id) { if (od[d][id] === true && /^[\w-]{1,40}$/.test(id)) den(d)[id] = true; });
  });
  Object.keys(dny || {}).forEach(function (d) {
    Object.keys(dny[d] || {}).forEach(function (id) { if (dny[d][id] === true) den(d)[id] = true; else if (ven[d]) delete ven[d][id]; });
  });
  Object.keys(ven).forEach(function (d) { if (!Object.keys(ven[d]).length) delete ven[d]; });
  return ven;
}

// ---- pití a jídlo (Michal 5. 10.: „piju málo, když to uvidím, třeba to půjde“; bílkoviny k cíli 130 g):
// ZDRAVI/PITI_JIDLO.json zapisuje aplikace přes motor; ZDRAVI/PITI_JIDLO_CLAUDE.json zapisuje Claude z diktátu ve schránce
// (jen přidává, id „c-…“) – motor oba spojí; smazání Claudova zápisu = id v „smazane“ (jeho soubor motor nemění).
const PITI_JIDLO_DNI = 60;

function nactiJson_(slozka, nazev) {
  const it = slozka.getFilesByName(nazev);
  if (!it.hasNext()) return { soubor: null, data: null };
  const soubor = it.next();
  let data = null;
  try { data = JSON.parse(soubor.getBlob().getDataAsString('UTF-8')); } catch (chyba) { data = null; }
  return { soubor: soubor, data: data };
}

/**
 * Pití a jídlo po dnech (posledních n dní) z aplikace i od Clauda, bez smazaných: { 'RRRR-MM-DD': { piti: [], jidlo: [], hodnoceni? } }.
 * Jídlo z aplikace s místním odhadem (odhad: 'mistni') dostane Claudův odhad z PITI_JIDLO_CLAUDE.json → odhady[id]
 * (odhad: 'claude'); hodnocení dne od Clauda → hodnoceni[den] = { znamka, text, kdy }.
 */
function pitiJidloDny_(slozka, dni, claudeData) {
  const vlastni = nactiJson_(slozka, 'PITI_JIDLO.json').data || {};
  const claude = claudeData || nactiJson_(slozka, 'PITI_JIDLO_CLAUDE.json').data || {};
  const odhady = claude.odhady && typeof claude.odhady === 'object' ? claude.odhady : {};
  const smazane = {};
  (Array.isArray(vlastni.smazane) ? vlastni.smazane : []).forEach(function (id) { smazane[id] = true; });
  const hranice = Utilities.formatDate(new Date(Date.now() - (dni - 1) * 864e5), CASOVE_PASMO, 'yyyy-MM-dd');
  const dny = {};
  const den = function (d) { return (dny[d] = dny[d] || { piti: [], jidlo: [] }); };
  const cislo = function (x, max) { return Math.max(0, Math.min(max, Math.round(Number(x) || 0))); };
  Object.keys(vlastni.dny || {}).forEach(function (d) {
    if (d < hranice) return;
    const z = vlastni.dny[d] || {};
    (z.piti || []).forEach(function (x) { den(d).piti.push(x); });
    (z.jidlo || []).forEach(function (x) {
      const o = x && x.id && odhady[x.id];
      den(d).jidlo.push(o && typeof o === 'object' ? Object.assign({}, x, { bilkoviny: cislo(o.bilkoviny, 300), kcal: cislo(o.kcal, 5000), odhad: 'claude',
        poznamka: String(o.poznamka || '').slice(0, 160) }) : x);
    });
  });
  const hodnoceni = claude.hodnoceni && typeof claude.hodnoceni === 'object' ? claude.hodnoceni : {};
  Object.keys(hodnoceni).forEach(function (d) {
    const h = hodnoceni[d];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < hranice || !h || typeof h !== 'object' || !h.text) return;
    den(d).hodnoceni = { znamka: String(h.znamka || '').slice(0, 2), text: String(h.text).slice(0, 700), kdy: Date.parse(h.kdy) || null };
  });
  (Array.isArray(claude.zapisy) ? claude.zapisy : []).forEach(function (x) {
    const d = String((x && x.den) || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < hranice || !/^c-[\w-]{1,60}$/.test(String(x.id || '')) || smazane[x.id]) return;
    const kdy = Date.parse(x.kdy) || null;
    if (x.druh === 'piti' && Number(x.ml) > 0 && Number(x.ml) <= 3000) {
      den(d).piti.push({ id: String(x.id), kdy: kdy, ml: Math.round(Number(x.ml)), co: String(x.co || '').slice(0, 60), claude: true });
    } else if (x.druh === 'jidlo' && x.co) {
      den(d).jidlo.push({ id: String(x.id), kdy: kdy, co: String(x.co).slice(0, 120), bilkoviny: Math.max(0, Math.min(300, Math.round(Number(x.bilkoviny) || 0))),
        kcal: Math.max(0, Math.min(5000, Math.round(Number(x.kcal) || 0))), claude: true });
    }
  });
  Object.keys(dny).forEach(function (d) {
    dny[d].piti.sort(function (a, b) { return (a.kdy || 0) - (b.kdy || 0); });
    dny[d].jidlo.sort(function (a, b) { return (a.kdy || 0) - (b.kdy || 0); });
  });
  return dny;
}

/**
 * Akce pitiJidlo: { den, jak: 'piti', ml } | { den, jak: 'jidlo', co, bilkoviny, kcal } | { den, jak: 'smazat', id }.
 * Vrací { dny } za 14 dní (jako Zdraví).
 */
function pitiJidlo_(d) {
  const den = String(d.den || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) throw new Error('Den má tvar RRRR-MM-DD.');
  const zamek = LockService.getScriptLock();
  zamek.waitLock(30000);
  try {
    const slozka = slozkaZdravi_();
    const v = nactiJson_(slozka, 'PITI_JIDLO.json');
    const data = v.data && typeof v.data === 'object' ? v.data : {};
    data.dny = data.dny && typeof data.dny === 'object' ? data.dny : {};
    data.smazane = Array.isArray(data.smazane) ? data.smazane : [];
    const zaznam = (data.dny[den] = data.dny[den] || {});
    zaznam.piti = Array.isArray(zaznam.piti) ? zaznam.piti : [];
    zaznam.jidlo = Array.isArray(zaznam.jidlo) ? zaznam.jidlo : [];
    const noveId = function (p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); };
    if (d.jak === 'piti') {
      const ml = Math.round(Number(d.ml));
      if (!(ml > 0 && ml <= 3000)) throw new Error('Kolik ml? (1–3000)');
      zaznam.piti.push({ id: noveId('p'), kdy: Date.now(), ml: ml });
    } else if (d.jak === 'jidlo') {
      const co = String(d.co || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!co) throw new Error('Napiš, co jsi snědl.');
      const zapis = { id: noveId('j'), kdy: Date.now(), co: co, bilkoviny: Math.max(0, Math.min(300, Math.round(Number(d.bilkoviny) || 0))),
        kcal: Math.max(0, Math.min(5000, Math.round(Number(d.kcal) || 0))) };
      // bílkoviny nezadal Michal, jen je odhadla aplikace → upřesní Claude (poznámka do schránky)
      if (d.odhad) zapis.odhad = 'mistni';
      zaznam.jidlo.push(zapis);
      if (d.odhad) { try { jidloKOdhadu_(den, zapis); } catch (chyba) { /* jídlo je zapsané, odhad zůstane místní */ } }
    } else if (d.jak === 'smazat') {
      const id = String(d.id || '');
      if (/^c-/.test(id)) { if (data.smazane.indexOf(id) < 0) data.smazane.push(id); }
      else {
        zaznam.piti = zaznam.piti.filter(function (x) { return x.id !== id; });
        zaznam.jidlo = zaznam.jidlo.filter(function (x) { return x.id !== id; });
      }
    } else {
      throw new Error('Neznámá akce.');
    }
    const hranice = Utilities.formatDate(new Date(Date.now() - PITI_JIDLO_DNI * 864e5), CASOVE_PASMO, 'yyyy-MM-dd');
    Object.keys(data.dny).forEach(function (k) { if (k < hranice) delete data.dny[k]; });
    data.smazane = data.smazane.slice(-300);
    data.aktualizovano = Date.now();
    const obsah = JSON.stringify(data);
    if (v.soubor) v.soubor.setContent(obsah); else slozka.createFile('PITI_JIDLO.json', obsah, MimeType.PLAIN_TEXT);
    return { dny: pitiJidloDny_(slozka, 14) };
  } finally {
    zamek.releaseLock();
  }
}

// ---- jídlo k odhadu a hodnocení dne: pokyn pro Clauda jako poznámka v NOVE. Úloha schránky (obě PC, každých 30 min)
// ji zpracuje jako ostatní poznámky podle skillu asistent-schranka – prompt úlohy se kvůli tomu nemění. Aplikace tyhle
// poznámky neukazuje (SKRYTE_POZNAMKY). Michal 9. 10.: „napíšu, co jsem měl, bez bílkovin, pošle se to Claudovi a zapíše“.
const SKRYTE_POZNAMKY = /_(jidl|hodn|plak)\.md$/;

/** Jídlo s místním odhadem → řádek do poznámky „jídlo k odhadu“ v NOVE (jedna, dokud ji Claude nezpracuje, pak další). */
function jidloKOdhadu_(den, zapis) {
  const nove = podslozka_(koren_(), 'NOVE');
  const radek = '- id ' + zapis.id + ', ' + den + ' ' + Utilities.formatDate(new Date(zapis.kdy), CASOVE_PASMO, 'HH:mm') + ': „' + zapis.co + '“' +
    (zapis.bilkoviny || zapis.kcal ? ' (aplikace odhadla ' + zapis.bilkoviny + ' g bílkovin, ' + zapis.kcal + ' kcal)' : '');
  const it = nove.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (!/_jidl\.md$/.test(f.getName())) continue;
    f.setContent(f.getBlob().getDataAsString('UTF-8').replace(/\s*$/, '\n') + radek + '\n');
    return;
  }
  const ted = new Date(Date.now());
  nove.createFile(Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd_HHmmss') + '_jidl.md', ['---',
    'kdy: ' + Utilities.formatDate(ted, CASOVE_PASMO, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    'odkud: aplikace (jídlo)', 'typ: jidlo', '---', '',
    'Odhadni bílkoviny a kcal jídel, která Michal zapsal v aplikaci bez bílkovin, a zapiš je do ZDRAVI\\PITI_JIDLO_CLAUDE.json → ' +
    '„odhady“ (skill asistent-schranka, Jídlo k odhadu). Vezmi i starší jídla s „odhad: mistni“ bez odhadu, ať žádné nezůstane.',
    '', radek, ''].join('\n'), MimeType.PLAIN_TEXT);
}

/** Spouštěč (každých 10 min): od 21:30 jednou denně poznámka pro Clauda „zhodnoť dnešní jídlo a pití“ – jen když se něco zapsalo. */
function hodnoceniJidlaNaPozadi_() {
  const ted = new Date(Date.now());
  if (Utilities.formatDate(ted, CASOVE_PASMO, 'HH:mm') < '21:30') return;
  const den = Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd');
  const vl = vlastnosti_();
  if (vl.getProperty('HODNOCENI_JIDLA_DEN') === den) return;
  const z = pitiJidloDny_(slozkaZdravi_(), 1)[den];
  if (!z || !(z.jidlo.length || z.piti.length)) return;
  vl.setProperty('HODNOCENI_JIDLA_DEN', den);
  podslozka_(koren_(), 'NOVE').createFile(Utilities.formatDate(ted, CASOVE_PASMO, 'yyyy-MM-dd_HHmmss') + '_hodn.md', ['---',
    'kdy: ' + Utilities.formatDate(ted, CASOVE_PASMO, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    'odkud: aplikace (hodnocení dne)', 'typ: hodnoceni-jidla', '---', '',
    'Zhodnoť Michalovo jídlo a pití za ' + den + ' a zapiš hodnocení do ZDRAVI\\PITI_JIDLO_CLAUDE.json → „hodnoceni“ ' +
    '(skill asistent-schranka, Hodnocení dne – cíle v ZDRAVI_REZIM.json, váha v ZDRAVI\\VAHA.json).', ''].join('\n'), MimeType.PLAIN_TEXT);
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
    // zkratka může seznam poslat i jako pole JSON (místo textu po řádcích)
    const text = function (x) { return Array.isArray(x) ? x.join('\n') : x; };
    Object.keys(POLE_APPLE).forEach(function (pole) {
      // nový tvar: pole + pole_dny (dva seznamy), starý: „datum=hodnota;…“
      const hodnoty = d[pole + '_dny'] != null ? parovaneHodnoty(text(d[pole + '_dny']), text(d[pole])) : denniHodnoty(text(d[pole]));
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
// (aplikace ntfy v iPhonu, téma odebírat). Zapíná se v aplikaci (Nastavení → Upozornění). Kontroly běží každých 10 minut
// se spouštěčem instagramKazdych10Min – jiný spouštěč není potřeba (kazdouHodinu zůstává pro starší hodinový spouštěč).

function upozorni_(nadpis, text, tagy, priorita, odkaz) {
  const tema = vlastnosti_().getProperty('NTFY_TEMA');
  if (!tema) return false;
  const r = UrlFetchApp.fetch('https://ntfy.sh/', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ topic: tema, title: nadpis, message: text, tags: tagy || [], priority: priorita || 3,
      click: odkaz || vlastnosti_().getProperty('ADRESA_APLIKACE') || 'https://mk-asistent.github.io/' }) });
  return r.getResponseCode() === 200;
}

/** Starý hodinový spouštěč – dělá totéž co kontrola každých 10 minut (stačí jeden z nich). */
function kazdouHodinu() {
  upozorneniKontrola_();
}

/** Kontroly pro upozornění (jen s NTFY_TEMA): nové „hoří“ v poště (6–22 h) a výstrahy ČHMÚ (oranžová a vyšší) hned,
 *  ranní souhrn a nedělní přehled jednou, WHOOP (nová připravenost ráno) nejvýš jednou za hodinu. */
function upozorneniKontrola_() {
  const p = vlastnosti_();
  if (!p.getProperty('NTFY_TEMA')) return;
  const hodina = Number(Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'H'));
  try { if (hodina >= 6 && hodina <= 22) horiVPoste_(); } catch (chyba) { /* příště */ }
  try { ranniSouhrn_(hodina); } catch (chyba) { /* příště */ }
  try { nedelniPrehled_(hodina); } catch (chyba) { /* příště */ }
  try { if (hodina >= 8 && hodina <= 20) upozorneniAuto_(); } catch (chyba) { /* zítra */ }
  const hodinaWhoop = Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'yyyy-MM-dd H');
  if (p.getProperty('UPOZORNENI_WHOOP') !== hodinaWhoop && whoopStav_().propojeno) {
    p.setProperty('UPOZORNENI_WHOOP', hodinaWhoop);
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
    const pocasi = pocasi_(false); // přehled drží 15 min → ČHMÚ se ptá nejvýš dvakrát za půl hodiny
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

/**
 * Připomínky k autu do iPhonu (jednou denně, každá jen jednou za sezónu): „začni řešit“ přezutí, přípravu na zimu,
 * servis podle auta, výročí pojištění, dálniční známku. Čte tabulku auta – proto jen jednou za den.
 */
function upozorneniAuto_() {
  const p = vlastnosti_();
  const dnes = Utilities.formatDate(new Date(Date.now()), CASOVE_PASMO, 'yyyy-MM-dd');
  if (p.getProperty('UPOZORNENI_AUTO_DEN') === dnes || !p.getProperty('AUTO_TABULKA')) return;
  p.setProperty('UPOZORNENI_AUTO_DEN', dnes);
  const ss = autoTabulka_();
  if (!ss) return;
  let ohlasene = {};
  try { ohlasene = JSON.parse(p.getProperty('OHLASENO_AUTO') || '{}') || {}; } catch (chyba) { ohlasene = {}; }
  const ted = Date.now();
  AUTO_.pripominky(autoDataBez_(ss), ted).forEach(function (x) {
    if (x.stav !== 'ted' || x.hotovo || ohlasene[x.klic]) return;
    if (upozorni_('Auto: ' + x.nazev, x.text, ['red_car'], 3)) ohlasene[x.klic] = ted;
  });
  // staré záznamy pryč (déle než rok)
  Object.keys(ohlasene).forEach(function (k) { if (ted - ohlasene[k] > 400 * 864e5) delete ohlasene[k]; });
  p.setProperty('OHLASENO_AUTO', JSON.stringify(ohlasene).slice(0, 8000));
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

/** Náhradní cesta z editoru (▶) – jinak se upozornění zapínají v aplikaci (Nastavení → Upozornění). */
function nastavUpozorneni() {
  Logger.log('Téma pro aplikaci ntfy (server ntfy.sh): ' + upozorneniZapnout_().tema);
  Logger.log('Kontroly běží se spouštěčem instagramKazdych10Min (každých 10 minut) – jiný spouštěč není potřeba.');
}

/** Stav pro aplikaci; téma vidí jen ten, kdo má klíč nebo účet (aplikace je za přihlášením). */
function upozorneniStav_() {
  const tema = vlastnosti_().getProperty('NTFY_TEMA');
  return { zapnuto: !!tema, tema: tema || '' };
}

/** Zapnout z aplikace: vyrobí náhodné téma (když chybí) a pošle zkušební upozornění. */
function upozorneniZapnout_() {
  const p = vlastnosti_();
  if (!p.getProperty('NTFY_TEMA')) p.setProperty('NTFY_TEMA', 'asistent-' + Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  return Object.assign(upozorneniStav_(), { odeslano: upozorni_('Asistent', 'Upozornění fungují ✓', ['white_check_mark'], 3) });
}

/** Vypnout: téma pryč (po novém zapnutí vznikne jiné – v aplikaci ntfy ho pak odebírat znovu). */
function upozorneniVypnout_() {
  vlastnosti_().deleteProperty('NTFY_TEMA');
  return upozorneniStav_();
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
  const cache = CacheService.getScriptCache();
  cache.remove(klic);
  // pošta: s Doručenou i čísla a seznamy kategorií (archiv, přečteno a přesun mění i ty)
  if (klic === 'posta') ['posta-pocty', 'posta-plna'].concat(Object.keys(KATEGORIE_GMAILU).map(function (k) { return 'posta-' + k; })).forEach(function (k) { cache.remove(k); });
}

function md5_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(text), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
