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
 *   Pošta     – Gmail: doručené za 14 dní bez Reklam/Sociálních sítí/Fór; čtení, odpověď, přeposlání, archiv.
 *               Dva účty: osobní (Gmail) a pracovní (vlastnost PRACOVNI_ADRESA). Pracovní pošta se do Gmailu
 *               dostane přeposíláním kopií od poskytovatele; odpovídá se z ní přes „Odesílat poštu jako“ v Gmailu.
 *               Náhradní zdroj bez přeposílání: CLAUDE_SCHRANKA/POSTA_FIREMNI.json (souhrny, zapisuje skript na PC).
 *   Kalendář  – zobrazené kalendáře Google + kalendáře z iPhonu (iCloud, soukromý odkaz webcal://…, jen čtení)
 *
 * Postup nasazení: README.md v kořeni repozitáře.
 */

const VERZE = '2026-10-02';
const NAZEV_SLOZKY = 'CLAUDE_SCHRANKA';
const CASOVE_PASMO = 'Europe/Prague';
const DNI_POSTY = 14;
const MAX_VLAKEN = 40;
const MAX_ZPRAV_VE_VLAKNE = 12;
const MAX_VYRIZENYCH = 25;
const MAX_ROZSAH_KALENDARE = 100 * 864e5; // jeden dotaz nejvýš na 100 dní
const BARVY_KALENDARU = ['#2f5bd3', '#2e7a4d', '#a8620c', '#8e5bd3', '#c0392b', '#0f7c8c', '#b5407a'];
// barvy jednotlivých událostí v Kalendáři Google (CalendarApp.EventColor 1–11)
const BARVY_UDALOSTI_GOOGLE = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000'
};

// ---------------------------------------------------------------- vstup

function doGet() {
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

const AKCE = {
  info: function () { return { verze: VERZE, ucet: mojeAdresa_(), posta: nastaveniPosty_(), kalendare: seznamKalendaru_() }; },
  nastavPostu: function (d) { return nastavPostu_(d.pracovniAdresa); },
  schranka: function () { return nactiSchranku_(); },
  poznamka: function (d) { return pridejPoznamku_(d.text); },
  polozka: function (d) { return upravPolozku_(d.id, d.jak, d.text); },
  posta: function (d) { return nactiPostu_(d.znovu); },
  vlakno: function (d) { return nactiVlakno_(d.id, d.precist !== false); },
  odeslat: function (d) { return odeslat_(d); },
  oznacit: function (d) { return oznacitVlakno_(d.id, d.jak); },
  kalendar: function (d) { return nactiKalendar_(d.od, d.do, d.znovu); },
  kalendare: function () { return seznamKalendaru_(); },
  kalendarPridat: function (d) { return pridejKalendar_(d.nazev, d.odkaz, d.barva); },
  kalendarUpravit: function (d) { return upravKalendar_(d.id, d); },
  kalendarOdebrat: function (d) { return odeberKalendar_(d.id); }
};

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

  return { nove: nove, ceka: ceka, hotovo: hotovo, ted: Date.now() };
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
 * Akce nad položkou z CEKA:
 *   hotovo   – tvůj úkol splněn → HOTOVO
 *   zahodit  – nápad nechci → HOTOVO
 *   udelej   – nápad / plán schválen → zpět do NOVE, Claude ho při dalším zpracování udělá
 *   odpoved  – odpověď na otázku Clauda → zpět do NOVE
 */
function upravPolozku_(id, akce, text) {
  const zamek = LockService.getScriptLock();
  zamek.waitLock(10000);
  try {
    const soubor = DriveApp.getFileById(String(id || ''));
    const koren = koren_();
    // jen poznámky .md ve schránce (ne POSTA_FIREMNI.json ani nic jiného na Disku)
    if (!/\.md$/i.test(soubor.getName()) || !jeVeSchrance_(soubor, koren)) throw new Error('Soubor není ve schránce.');

    const popis = {
      hotovo: 'Hotovo.',
      zahodit: 'Zahodit – nedělat.',
      udelej: 'Udělej to.',
      odpoved: String(text || '').trim()
    }[akce];
    if (!popis) throw new Error('Neznámá akce nebo prázdná odpověď.');

    const kdy = Utilities.formatDate(new Date(), CASOVE_PASMO, 'yyyy-MM-dd HH:mm');
    const obsah = soubor.getBlob().getDataAsString('UTF-8').replace(/\s*$/, '') +
      '\n\n## Michal – ' + kdy + ' (aplikace)\n' + popis + '\n';
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
  return {
    id: soubor.getId(),
    slozka: slozka,
    kdy: kdy,
    upraveno: soubor.getLastUpdated().getTime(),
    odkud: hlavicka.odkud || '',
    typ: hlavicka.typ || '',
    stav: hlavicka.stav || '',
    shrnuti: hlavicka.shrnuti || '',
    termin: hlavicka.termin || '',
    text: text,
    vlakno: vlakno
  };
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
  return { osobniAdresa: mojeAdresa_(), pracovniAdresa: prac, lzeOdesilatZPracovni: !!prac && !!aliasPracovni_(prac) };
}

function nastavPostu_(adresa) {
  adresa = String(adresa || '').trim().toLowerCase();
  if (adresa && !PROSTA_ADRESA.test(adresa)) throw new Error('Neplatná adresa.');
  if (adresa && adresa === mojeAdresa_().toLowerCase()) throw new Error('To je osobní adresa – sem patří ta pracovní.');
  const vlastnosti = PropertiesService.getScriptProperties();
  if (adresa) vlastnosti.setProperty('PRACOVNI_ADRESA', adresa); else vlastnosti.deleteProperty('PRACOVNI_ADRESA');
  smazCache_('posta');
  return nastaveniPosty_();
}

function nactiPostu_(znovu) {
  if (!znovu) {
    const ulozene = nactiZCache_('posta');
    if (ulozene) return ulozene;
  }
  const ja = mojeAdresa_().toLowerCase();
  const prac = pracovniAdresa_();
  const zaklad = 'in:inbox newer_than:' + DNI_POSTY + 'd -category:promotions -category:social -category:forums';
  const pracovni = prac ? seznamVlaken_(zaklad + ' ' + filtrPracovni_(prac), ja, prac, 'pracovni') : [];
  // hledání jde po zprávách – vlákno s osobní i pracovní zprávou by bylo dvakrát; patří k pracovní
  const vPracovni = {};
  pracovni.forEach(function (v) { vPracovni[v.id] = true; });
  const osobni = seznamVlaken_(zaklad + (prac ? ' -to:' + prac + ' -cc:' + prac + ' -deliveredto:' + prac : ''), ja, prac, 'osobni')
    .filter(function (v) { return !vPracovni[v.id]; });
  const vysledek = {
    osobni: osobni,
    pracovni: pracovni,
    pracovniAdresa: prac,
    firemni: nactiFiremni_(), // souhrny z PC (náhradní zdroj, když se pracovní pošta nepřeposílá)
    ted: Date.now()
  };
  ulozDoCache_('posta', vysledek, 90);
  return vysledek;
}

function seznamVlaken_(dotaz, ja, prac, ucet) {
  const vlakna = GmailApp.search(dotaz, 0, MAX_VLAKEN);
  const zpravy = GmailApp.getMessagesForThreads(vlakna);
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
    return {
      id: vlakno.getId(),
      ucet: ucet,
      od: odesilatel ? jmeno_(odesilatel.getFrom()) : 'Já → ' + jmeno_(posledni.getTo()),
      odAdresa: odesilatel ? adresa_(odesilatel.getFrom()) : '',
      predmet: vlakno.getFirstMessageSubject() || '(bez předmětu)',
      ukazka: posledni.getPlainBody().replace(/\s+/g, ' ').trim().slice(0, 180),
      kdy: vlakno.getLastMessageDate().getTime(),
      neprectena: vlakno.isUnread(),
      dulezita: vlakno.isImportant(),
      hvezdicka: vlakno.hasStarredMessages(),
      pocet: seznam.length,
      odkaz: odkazGmail_(vlakno.getId())
    };
  });
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
  return String([zprava.getTo(), zprava.getCc()].join(',')).split(',')
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
      const html = m.getBody() || '';
      const od = adresa_(m.getFrom());
      return {
        id: m.getId(),
        od: jmeno_(m.getFrom()),
        odAdresa: od,
        odeMe: (!!ja && od === ja) || (!!prac && od === prac),
        komu: m.getTo(),
        kopie: m.getCc(),
        kdy: m.getDate().getTime(),
        predmet: m.getSubject(),
        text: m.getPlainBody(),
        html: html.length > 600000 ? '' : html,
        // přílohy jen u posledních tří zpráv – stahují se celé, u starších by to zdržovalo
        prilohy: i >= zobrazit.length - 3 ? seznamPriloh_(m) : null
      };
    })
  };
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

/** rezim: odpoved | vsem | preposlat | novy */
function odeslat_(d) {
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

/** jak: prectene | neprectene | archivovat | doDorucenych */
function oznacitVlakno_(id, jak) {
  const vlakno = vlakno_(id);
  if (jak === 'prectene') vlakno.markRead();
  else if (jak === 'neprectene') vlakno.markUnread();
  else if (jak === 'archivovat') vlakno.moveToArchive();
  else if (jak === 'doDorucenych') vlakno.moveToInbox();
  else throw new Error('Neznámá akce.');
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
  const seznam = String(s || '').split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
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

function jmeno_(od) {
  const prvni = String(od || '').split(',')[0];
  const m = prvni.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return m[1].trim() || m[2].trim();
  return prvni.trim();
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
          zdroj: 'google'
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
  const google = CalendarApp.getAllCalendars()
    .filter(function (k) { return !k.isHidden() && k.isSelected(); })
    .map(function (k) {
      return { id: k.getId(), nazev: k.getName(), barva: k.getColor(), zdroj: 'google', skryty: skryte.indexOf(k.getId()) >= 0 };
    });
  const ics = icsKalendare_().map(function (k) {
    // odkaz se do aplikace nevrací – je to tajemství jako klíč
    return { id: k.id, nazev: k.nazev, barva: k.barva, zdroj: 'icloud', skryty: skryte.indexOf(k.id) >= 0 };
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
