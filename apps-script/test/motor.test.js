// Kouřový test motoru (apps-script/Kod.gs) s napodobenými službami Googlu – node apps-script/test/motor.test.js
// Ověřuje vstup doPost (klíč, akce), poštu se dvěma účty, odesílání z pracovní adresy a kalendář (Google + .ics).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

const KLIC = 'testovaci-klic';
const PRAC = 'michal@firma.test';
const JA = 'osobni@gmail.test';

// ---------------------------------------------------------------- napodobené služby
function prostredi() {
  const vlastnosti = new Map([['API_KLIC', KLIC]]);
  const cache = new Map();
  const ttl = new Map(); // doba platnosti uložených hodnot (s)
  const log = { odeslano: [], precteno: [], stazeno: 0, archiv: [], doDorucenych: [], neprecteno: [] };

  const zprava = (o) => ({
    getId: () => o.id, getFrom: () => o.od, getTo: () => o.komu || JA, getCc: () => o.kopie || '', getBcc: () => o.skryta || '',
    getReplyTo: () => o.odpovedNa || o.od,
    getHeader: (h) => (h === 'Message-ID' ? '<' + o.id + '@mail.test>' : h === 'Delivered-To' ? (o.dorucenoNa || '') : ''),
    getPlainBody: () => o.text, getBody: () => (o.html != null ? o.html : '<p>' + o.text + '</p>'), getDate: () => new Date(o.kdy),
    getSubject: () => o.predmet, isInTrash: () => false, isDraft: () => false, isUnread: () => !!o.neprectena,
    getAttachments: () => (o.priloha ? [{ getName: () => 'nabidka.pdf', getSize: () => 12345 }] : []),
    reply: (t, m) => log.odeslano.push({ jak: 'reply', id: o.id, t, m }),
    replyAll: (t, m) => log.odeslano.push({ jak: 'replyAll', id: o.id, t, m }),
    forward: (komu, m) => log.odeslano.push({ jak: 'forward', id: o.id, komu, m })
  });
  const stitkyVlaken = {}; // id vlákna → jména štítků Gmailu
  const vlakno = (id, zpravy, neprectene) => {
    let vDorucenych = true;
    return {
      getLabels: () => { log.getLabels = (log.getLabels || 0) + 1; return (stitkyVlaken[id] || []).map((n) => ({ getName: () => n })); },
      getId: () => id, getFirstMessageSubject: () => zpravy[0].getSubject(), getLastMessageDate: () => zpravy[zpravy.length - 1].getDate(),
      isUnread: () => neprectene, isImportant: () => false, hasStarredMessages: () => false, getMessageCount: () => zpravy.length,
      getMessages: () => zpravy, isInInbox: () => vDorucenych,
      markRead: () => log.precteno.push(id), markUnread: () => log.neprecteno.push(id),
      moveToArchive: () => { vDorucenych = false; log.archiv.push(id); },
      moveToInbox: () => { vDorucenych = true; log.doDorucenych.push(id); }
    };
  };
  const ted = Date.UTC(2026, 9, 2, 15);
  const m1 = zprava({ id: 'm1', od: 'Trenér <trener@klub.test>', predmet: 'Sraz v sobotu', text: 'Ahoj, sraz v 8:30.', kdy: ted - 36e5, neprectena: true });
  const m2 = zprava({ id: 'm2', od: 'Investor <info@stavba.test>', komu: PRAC, predmet: 'Předávací protokol', text: 'Posílám protokol.', kdy: ted - 2 * 36e5, priloha: true });
  const m3 = zprava({ id: 'm3', od: 'Já <' + PRAC + '>', komu: 'info@stavba.test', predmet: 'Re: Předávací protokol', text: 'Děkuji.', kdy: ted - 36e5 });
  // odeslaná pošta: trenérovi jsem psal → je to „známý“
  const m4 = zprava({ id: 'm4', od: 'Já <' + JA + '>', komu: 'Trenér <trener@klub.test>', predmet: 'Omluva', text: 'Dnes nepřijdu.', kdy: ted - 5 * 864e5 });
  const vlakna = { v1: vlakno('v1', [m1], true), v2: vlakno('v2', [m2, m3], false), v3: vlakno('v3', [m4], false) };
  let aliasy = [];
  let stitkyGmailu = {}; // název → { neprectenych, vlakna }

  const zpravy = { m1, m2, m3 };
  let aktualizace = []; // vlákna v kategorii Aktualizace (oznámení)
  let odeslana = [vlakna.v2, vlakna.v3]; // výsledek „in:sent …“ (známí lidé)
  let starsi = { osobni: [], pracovni: [] }; // výsledek druhého okna „older_than:30d newer_than:90d“
  const GmailApp = {
    search: (q, od, max) => {
      log.dotazy = (log.dotazy || []).concat(q);
      (log.maxima = log.maxima || {})[q] = max;
      // „rfc822msgid:<id> {to:… }“ = šla tahle zpráva na pracovní adresu?
      const m = /rfc822msgid:(\S+)@mail\.test/.exec(q);
      if (m) return zpravy[m[1]] && zpravy[m[1]].getTo() === PRAC && q.indexOf('{to:' + PRAC) >= 0 ? [vlakna.v2] : [];
      if (q.indexOf('category:updates') >= 0) return aktualizace;
      if (q.indexOf('in:sent') >= 0) return odeslana;
      if (q.indexOf('older_than:') >= 0) return q.indexOf('{to:') >= 0 ? starsi.pracovni : starsi.osobni;
      return q.indexOf('{to:') >= 0 ? [vlakna.v2] : [vlakna.v1];
    },
    moveThreadToSpam: (v) => { log.spam = v.getId(); },
    moveThreadToInbox: (v) => { log.zeSpamu = (log.zeSpamu || []).concat(v.getId()); v.moveToInbox(); },
    getMessagesForThreads: (v) => v.map((x) => x.getMessages()),
    getThreadById: (id) => vlakna[id] || null,
    getMessageById: (id) => ({ m1, m2, m3 })[id] || null,
    getAliases: () => aliasy,
    getUserLabels: () => Object.keys(stitkyGmailu).map((n) => ({ getName: () => n, getUnreadCount: () => stitkyGmailu[n].neprectenych })),
    getUserLabelByName: (n) => (stitkyGmailu[n] ? { getName: () => n, getThreads: (od, max) => stitkyGmailu[n].vlakna.slice(od, od + max) } : null),
    getInboxUnreadCount: () => 1,
    sendEmail: (komu, predmet, text, m) => log.odeslano.push({ jak: 'send', komu, predmet, t: text, m })
  };

  const udalostG = (nazev, z, k, celodenni) => ({
    getId: () => 'g-' + nazev, getTitle: () => nazev, isAllDayEvent: () => !!celodenni, isRecurringEvent: () => false, getGuestList: () => [],
    getStartTime: () => new Date(z), getEndTime: () => new Date(k), getAllDayStartDate: () => new Date(z), getAllDayEndDate: () => new Date(k),
    getLocation: () => '', getDescription: () => 'Popis <b>tučně</b><br>řádek', getColor: () => ''
  });
  const kalendare = [
    { isHidden: () => false, isSelected: () => true, getColor: () => '#9fe1e7', getName: () => 'Osobní', getId: () => 'osobni@gmail.test', isOwnedByMe: () => true,
      getEvents: () => [udalostG('Zubař', Date.UTC(2026, 9, 6, 7), Date.UTC(2026, 9, 6, 8))] },
    { isHidden: () => false, isSelected: () => false, getColor: () => '#000', getName: () => 'Nevybraný', getId: () => 'x', isOwnedByMe: () => false,
      getEvents: () => { throw new Error('nemá se volat'); } }
  ];
  // vlastní kalendář Google se zápisem (vznikne přes createCalendar) – události v paměti
  const jeDatum = (x) => !!x && typeof x.getTime === 'function';
  const vytvorKalendar = (nazevKal) => {
    const udalosti = [];
    const nova = (nazev, z, k, celodenni, moznosti, rada) => {
      const u = { nazev, z: +z, k: +k, celodenni: !!celodenni, misto: (moznosti || {}).location || '', popis: (moznosti || {}).description || '',
        pripomenuti: null, barva: '', stitky: {}, rada: rada || null, smazano: false, id: 'ev-' + (udalosti.length + 1) + '@google.com',
        hoste: (moznosti && moznosti.guests ? moznosti.guests.split(',') : []), pozvanky: !!(moznosti && moznosti.sendInvites) };
      const o = {
        _: u, getId: () => u.id, getTitle: () => u.nazev, isAllDayEvent: () => u.celodenni, isRecurringEvent: () => !!u.rada,
        getStartTime: () => new Date(u.z), getEndTime: () => new Date(u.k), getAllDayStartDate: () => new Date(u.z), getAllDayEndDate: () => new Date(u.k),
        getLocation: () => u.misto, getDescription: () => u.popis, getColor: () => u.barva, getTag: (t) => (t in u.stitky ? u.stitky[t] : null),
        setTitle: (t) => { u.nazev = t; return o; }, setTime: (a, b) => { u.z = +a; u.k = +b; return o; },
        setAllDayDate: (a) => { u.z = +a; u.k = +a + 864e5; u.celodenni = true; return o; },
        setAllDayDates: (a, b) => { u.z = +a; u.k = +b; u.celodenni = true; return o; },
        setLocation: (t) => { u.misto = t; return o; }, setDescription: (t) => { u.popis = t; return o; },
        removeAllReminders: () => { u.pripomenuti = []; return o; }, addPopupReminder: (m) => { (u.pripomenuti = u.pripomenuti || []).push(m); return o; },
        setColor: (c) => { u.barva = c; return o; }, setTag: (t, v) => { u.stitky[t] = v; return o; },
        deleteEvent: () => { u.smazano = true; }, getEventSeries: () => ({ deleteEventSeries: () => { u.smazano = true; u.celaRada = true; } }),
        getGuestList: () => u.hoste.map((a) => ({ getEmail: () => a })), addGuest: (a) => { u.hoste.push(a); return o; },
        removeGuest: (a) => { u.hoste = u.hoste.filter((x) => x !== a); return o; }
      };
      udalosti.push(o);
      return o;
    };
    const kal = {
      udalosti, getName: () => nazevKal, getId: () => nazevKal.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@group.calendar.test',
      isHidden: () => false, isSelected: () => true, getColor: () => '#2e7a4d', isOwnedByMe: () => true,
      setColor() {}, setHidden() {}, setSelected() {},
      getEvents: (a, b) => udalosti.filter((o) => !o._.smazano && o._.z < +b && o._.k > +a),
      createEvent: (n, a, b, m) => nova(n, a, b, false, m),
      createAllDayEvent: (n, a, b, m) => (jeDatum(b) ? nova(n, a, b, true, m) : nova(n, a, +a + 864e5, true, b)),
      createEventSeries: (n, a, b, r, m) => nova(n, a, b, false, m, r),
      createAllDayEventSeries: (n, a, r, m) => nova(n, a, +a + 864e5, true, m, r)
    };
    return kal;
  };
  let rozpis = '';
  const ICS = ['BEGIN:VCALENDAR', 'X-WR-CALNAME:Rodina', 'BEGIN:VEVENT', 'UID:r1', 'SUMMARY:Trénink',
    'DTSTART;TZID=Europe/Prague:20261005T170000', 'DTEND;TZID=Europe/Prague:20261005T183000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

  const pad = (n, d = 2) => String(n).padStart(d, '0');
  const formatDate = (datum, tz, vzor) => {
    const c = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(datum).forEach((p) => { c[p.type] = p.value; });
    const posun = Math.round((Date.UTC(+c.year, c.month - 1, +c.day, c.hour % 24, +c.minute, +c.second) - Math.floor(datum.getTime() / 1000) * 1000) / 6e4);
    const zn = (posun < 0 ? '-' : '+') + pad(Math.floor(Math.abs(posun) / 60)) + pad(Math.abs(posun) % 60);
    if (vzor === 'Z') return zn;
    if (vzor === 'H') return String(c.hour % 24);
    if (vzor === 'u') return String(new Date(Date.UTC(+c.year, c.month - 1, +c.day)).getUTCDay() || 7); // 1 = pondělí … 7 = neděle
    return vzor.replace("'T'", 'T').replace('yyyy', c.year).replace('MM', pad(c.month)).replace('dd', pad(c.day))
      .replace('HH', pad(c.hour % 24)).replace('mm', pad(c.minute)).replace('ss', pad(c.second))
      .replace('XXX', zn.slice(0, 3) + ':' + zn.slice(3)).replace(/^d\. M\./, c.day + '. ' + c.month + '.').replace('H:', (c.hour % 24) + ':');
  };
  // Utilities.parseDate – jen tvar, který motor používá („RRRR-MM-DD HH:mm“ v daném pásmu)
  const parseDate = (text, tz, vzor) => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(text);
    if (!m || vzor !== 'yyyy-MM-dd HH:mm') throw new Error('parseDate neumí: ' + text + ' / ' + vzor);
    const zaklad = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
    const posun = (t) => { const z = formatDate(new Date(t), tz, 'Z'); return (z[0] === '-' ? -1 : 1) * (+z.slice(1, 3) * 60 + +z.slice(3)) * 6e4; };
    return new Date(zaklad - posun(zaklad - posun(zaklad)));
  };

  // Disk: schránka CLAUDE_SCHRANKA s podsložkami, soubory v paměti
  const iterator = (pole) => { let i = 0; return { hasNext: () => i < pole.length, next: () => pole[i++] }; };
  const vsechnySoubory = {}; // id → soubor (DriveApp.getFileById)
  const slozka = (nazev, rodic) => {
    const s = { nazev, rodic, deti: {}, soubory: [] };
    s.getId = () => 'slozka-' + nazev; s.getName = () => nazev;
    s.getParents = () => iterator(rodic ? [rodic] : []);
    s.getFoldersByName = (n) => { const x = s.deti[n]; let hotovo = !x; return { hasNext: () => !hotovo, next: () => { hotovo = true; return x; } }; };
    s.getFolders = () => iterator(Object.values(s.deti));
    s.getFiles = () => iterator(s.soubory.filter((x) => !x.vKosi));
    s.getFilesByName = (n) => iterator(s.soubory.filter((x) => !x.vKosi && x.getName() === n));
    s.createFolder = (n) => (s.deti[n] = slozka(n, s));
    s.createFile = (n, obsah) => {
      let rodicSouboru = s;
      const f = { vKosi: false, getId: () => 'soubor-' + nazev + '-' + n, getName: () => n, getBlob: () => ({ getDataAsString: () => obsah }),
        getDateCreated: () => new Date(), getLastUpdated: () => new Date(), getParents: () => iterator([rodicSouboru]),
        setContent: (t) => { obsah = t; return f; },
        moveTo: (cil) => { rodicSouboru.soubory = rodicSouboru.soubory.filter((x) => x !== f); cil.soubory.push(f); rodicSouboru = cil; return f; },
        setTrashed: (k) => { f.vKosi = !!k; return f; } };
      s.soubory.push(f); log.soubory = (log.soubory || []).concat({ slozka: nazev, n, obsah });
      vsechnySoubory[f.getId()] = f;
      return f;
    };
    return s;
  };
  const schranka = slozka('CLAUDE_SCHRANKA', null);
  vlastnosti.set('SLOZKA_ID', 'slozka-CLAUDE_SCHRANKA');

  const sandbox = {
    DriveApp: { getFolderById: (id) => { if (id !== 'slozka-CLAUDE_SCHRANKA') throw new Error('nenalezeno'); return schranka; },
      getFileById: (id) => { if (!vsechnySoubory[id]) throw new Error('Soubor nenalezen'); return vsechnySoubory[id]; } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (vlastnosti.has(k) ? vlastnosti.get(k) : null),
      setProperty: (k, v) => vlastnosti.set(k, String(v)), deleteProperty: (k) => vlastnosti.delete(k)
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; } }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v, s) => { cache.set(k, String(v)); ttl.set(k, s); },
      getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])),
      putAll: (o, s) => Object.entries(o).forEach(([k, v]) => { assert.ok(v.length <= 100000); cache.set(k, v); ttl.set(k, s); }),
      remove: (k) => cache.delete(k)
    }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(), formatDate, parseDate,
      newBlob: (s) => ({ getBytes: () => Buffer.from(String(s), 'utf8') }),
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => Array.from(crypto.createHash('md5').update(text, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b))
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => JA }) },
    GmailApp,
    CalendarApp: {
      getAllCalendars: () => kalendare, getDefaultCalendar: () => kalendare[0],
      getCalendarById: (id) => kalendare.find((k) => k.getId() === id) || null,
      getCalendarsByName: (n) => kalendare.filter((k) => k.getName() === n),
      createCalendar: (n) => { const k = vytvorKalendar(n); kalendare.push(k); log.zalozeno = (log.zalozeno || []).concat(n); return k; },
      newRecurrence: () => ({ addWeeklyRule: () => { const p = { typ: 'tydne', do: null, until: (d) => { p.do = +d; return p; } }; return p; } })
    },
    UrlFetchApp: { fetch: (url, moznosti) => {
      log.stazeno++;
      if (url.indexOf('chmi.cz') >= 0) return odpovedChmu(url, moznosti);
      if (url.indexOf('api.prod.whoop.com') >= 0) return odpovedWhoop(url, moznosti || {});
      if (url === 'https://ntfy.sh/') { log.ntfy = (log.ntfy || []).concat(JSON.parse(moznosti.payload)); return { getResponseCode: () => 200, getContentText: () => '{}' }; }
      return { getResponseCode: () => (url.indexOf('chyba') >= 0 ? 404 : 200), getContentText: () => (url.indexOf('rozpis') >= 0 ? rozpis : ICS) };
    } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log() {} },
    Intl
  };
  // WHOOP: token (výměna kódu, obnova s rotací refresh tokenu) a API v2 po stránkách
  const whoop = { platny: 'a1', refresh: 'r1', volani: [], data: null, chyba401: false };
  const odpovedWhoop = (url, moznosti) => {
    whoop.volani.push(url.replace('https://api.prod.whoop.com', ''));
    const json = (kod, telo) => ({ getResponseCode: () => kod, getContentText: () => JSON.stringify(telo), getAllHeaders: () => ({}) });
    if (url === 'https://api.prod.whoop.com/oauth/oauth2/token') {
      const f = moznosti.payload;
      assert.strictEqual(moznosti.method, 'post');
      assert.deepStrictEqual([f.client_id, f.client_secret], ['klient-id', 'klient-tajne']);
      if (f.grant_type === 'authorization_code') {
        assert.strictEqual(f.redirect_uri, 'https://script.google.com/macros/s/MOTOR/exec');
        return f.code === 'dobry-kod' ? json(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 }) : json(400, { error: 'invalid_grant' });
      }
      if (f.grant_type === 'refresh_token' && f.refresh_token === whoop.refresh) {
        whoop.platny = 'a2'; whoop.refresh = 'r2';
        return json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 });
      }
      return json(400, { error: 'invalid_grant' });
    }
    if (moznosti && moznosti.method === 'delete') return json(204, {});
    if (whoop.chyba401 || (moznosti.headers || {}).Authorization !== 'Bearer ' + whoop.platny) return json(401, {});
    const m = /\/developer\/v2\/([a-z/]+)\?(.*)$/.exec(url);
    const druh = m[1].split('/').pop();
    const dotaz = Object.fromEntries(m[2].split('&').map((x) => x.split('=').map(decodeURIComponent)));
    const zaznamy = (whoop.data || {})[druh] || [];
    // dvě stránky: první záznam, pak zbytek
    if (!dotaz.nextToken && zaznamy.length > 1) return json(200, { records: zaznamy.slice(0, 1), next_token: 'str2' });
    return json(200, { records: dotaz.nextToken ? zaznamy.slice(1) : zaznamy });
  };

  // ČHMÚ: skutečné (zkrácené) soubory z apps-script/test/chmu, ETag → 304 jako na serveru ČHMÚ
  const chmu = { cap: 'cap_cerven.xml', chyby: {}, dotazy: [], neukazano: 0 };
  const souborChmu = (url) => {
    if (url === 'https://vystrahy-cr.chmi.cz/data2/XOCZ50_OKPR.xml') return chmu.cap;
    if (/\/alerts\/cap\/$/.test(url)) return { text: '<a href="alert_cap_50_021119.xml">alert_cap_50_021119.xml</a>   02-Oct-2026 11:19   1550502\n' +
      '<a href="alert_cap_50_011119.xml">alert_cap_50_011119.xml</a>   01-Oct-2026 11:19   1550502\n' };
    if (/\/alerts\/cap\/alert_cap_50_021119\.xml$/.test(url)) return 'cap_rijen.xml';
    if (/\/metadata\/meta1\.json$/.test(url)) return 'meta1.json';
    let m = /\/hydrology\/now\/data\/([^/]+)$/.exec(url);
    if (m) return decodeURIComponent(m[1]);
    if (/\/forecast\/now\/$/.test(url)) return 'predpovedi.html';
    m = /\/forecast\/now\/(web_[^/]+)$/.exec(url);
    return m ? m[1] : null;
  };
  const odpovedChmu = (url, moznosti) => {
    const hlavicky = (moznosti && moznosti.headers) || {};
    chmu.dotazy.push({ url, podminene: !!hlavicky['If-None-Match'] });
    const chyba = Object.keys(chmu.chyby).find((k) => url.indexOf(k) >= 0);
    const zdroj = chyba ? null : souborChmu(url);
    const cesta = typeof zdroj === 'string' ? path.join(__dirname, 'chmu', zdroj) : null;
    if (chyba || !zdroj || (cesta && !fs.existsSync(cesta))) {
      const kod = chyba ? chmu.chyby[chyba] : 404;
      return { getResponseCode: () => kod, getAllHeaders: () => ({}), getContentText: () => 'chyba' };
    }
    const text = cesta ? fs.readFileSync(cesta, 'utf8') : zdroj.text;
    const etag = '"' + crypto.createHash('md5').update(text).digest('hex').slice(0, 12) + '"';
    if (hlavicky['If-None-Match'] === etag) {
      chmu.neukazano++;
      return { getResponseCode: () => 304, getAllHeaders: () => ({ ETag: etag }), getContentText: () => '' };
    }
    return { getResponseCode: () => 200, getAllHeaders: () => ({ ETag: etag, 'Last-Modified': 'Fri, 02 Oct 2026 09:19:00 GMT' }),
      getContentText: (znaky) => { assert.strictEqual(znaky, 'UTF-8'); return text; } };
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Kod.gs'), 'utf8'), ctx);
  // „teď“ v motoru (Date.now) – ČHMÚ testy potřebují čas vzorku
  const nastavCas = (ms) => vm.runInContext('Date.now = function () { return ' + Number(ms) + '; };', ctx);
  const surovy = (contents) => JSON.parse(ctx.doPost({ postData: { contents } }).text);
  const volej = (akce, data = {}, klic = KLIC) => surovy(JSON.stringify({ klic, akce, ...data }));
  // záznamy z izolovaného prostředí převést na běžné objekty (jinak je deepStrictEqual odmítne)
  const posledniOdeslano = () => JSON.parse(JSON.stringify(log.odeslano.pop()));
  return { volej, surovy, vlastnosti, cache, ttl, log, posledniOdeslano, ctx, zprava, vlakno, vlakna, kalendare, chmu, nastavCas, schranka, vsechnySoubory, whoop,
    nastavAliasy: (a) => { aliasy = a; }, stitkyVlaken, nastavStitkyGmailu: (o) => { stitkyGmailu = o; }, nastavAktualizace: (a) => { aktualizace = a; }, nastavRozpis: (t) => { rozpis = t; },
    nastavOdeslana: (a) => { odeslana = a; }, nastavStarsi: (osobni, pracovni) => { starsi = { osobni, pracovni: pracovni || [] }; } };
}

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); }
  catch (e) { console.log('  ✗ ' + nazev + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; }
}

console.log('Motor – kouřový test');

test('špatný klíč → chyba „klic“, chybějící klíč v motoru → návod', () => {
  const p = prostredi();
  assert.deepStrictEqual(p.volej('info', {}, 'spatny'), { ok: false, chyba: 'klic' });
  p.vlastnosti.delete('API_KLIC');
  p.cache.delete('API_KLIC'); // klíč se drží i v mezipaměti – novyKlic() maže obojí
  const o = p.volej('info');
  assert.strictEqual(o.ok, false);
  assert.ok(/nastavApi/.test(o.chyba));
});

test('neznámá akce i nečitelný požadavek vrací ok:false, ne pád', () => {
  const p = prostredi();
  assert.strictEqual(p.volej('neexistuje').ok, false);
  assert.strictEqual(p.volej('constructor').ok, false); // zděděné vlastnosti objektu nejsou akce
  assert.strictEqual(p.volej('toString').ok, false);
  assert.deepStrictEqual(p.surovy('{nejson'), { ok: false, chyba: 'Nečitelný požadavek.' });
  assert.deepStrictEqual(p.surovy(''), { ok: false, chyba: 'klic' });
});

test('info: verze, pošta bez pracovní adresy, seznam kalendářů jen vybraných', () => {
  const p = prostredi();
  const o = p.volej('info');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.posta.pracovniAdresa, '');
  assert.strictEqual(o.data.kalendare.length, 1);
  assert.strictEqual(o.data.kalendare[0].zdroj, 'google');
});

test('pošta: bez pracovní adresy jen osobní; s adresou dva účty a „Já“ se nebere jako odesílatel', () => {
  const p = prostredi();
  let o = p.volej('posta');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.osobni.length, 1);
  assert.strictEqual(o.data.pracovni.length, 0);
  assert.strictEqual(p.volej('nastavPostu', { pracovniAdresa: 'neplatna' }).ok, false);
  o = p.volej('nastavPostu', { pracovniAdresa: PRAC.toUpperCase() });
  assert.strictEqual(o.data.pracovniAdresa, PRAC);
  assert.strictEqual(o.data.lzeOdesilatZPracovni, false);
  o = p.volej('posta');
  assert.strictEqual(o.data.pracovni.length, 1);
  assert.strictEqual(o.data.pracovni[0].ucet, 'pracovni');
  assert.strictEqual(o.data.pracovni[0].od, 'Investor'); // poslední zpráva je moje odpověď → ukázat investora
  assert.strictEqual(o.data.osobni[0].neprectena, true);
});

test('pošta se podruhé vezme z mezipaměti; odeslání ji smaže', () => {
  const p = prostredi();
  p.volej('posta');
  assert.ok(p.cache.has('posta'));
  p.nastavAliasy([]);
  p.volej('odeslat', { rezim: 'odpoved', id: 'm1', text: 'Díky' });
  assert.ok(!p.cache.has('posta'));
});

test('vlákno: celé zprávy, účet podle adresy, přílohy, otevřením přečteno', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  let o = p.volej('vlakno', { id: 'v2' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.ucet, 'pracovni');
  assert.strictEqual(o.data.zpravy.length, 2);
  assert.strictEqual(o.data.zpravy[1].odeMe, true);
  assert.deepStrictEqual(o.data.zpravy[0].prilohy, [{ nazev: 'nabidka.pdf', velikost: 12345 }]);
  o = p.volej('vlakno', { id: 'v1' });
  assert.strictEqual(o.data.ucet, 'osobni');
  assert.deepStrictEqual(p.log.precteno, ['v1']);
  assert.strictEqual(p.volej('vlakno', { id: 'neni' }).ok, false);
});

test('odpověď na pracovní poštu: bez „Odesílat jako“ odmítne, s ním jde z pracovní adresy', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  let o = p.volej('odeslat', { rezim: 'odpoved', id: 'm2', text: 'Děkuji, potvrzuji.' });
  assert.strictEqual(o.ok, false);
  assert.ok(/Odesílat poštu jako/.test(o.chyba));
  p.nastavAliasy([PRAC]);
  o = p.volej('odeslat', { rezim: 'vsem', id: 'm2', text: 'Děkuji, potvrzuji.' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(p.posledniOdeslano(), { jak: 'replyAll', id: 'm2', t: 'Děkuji, potvrzuji.', m: { from: PRAC } });
  o = p.volej('odeslat', { rezim: 'odpoved', id: 'm1', text: 'Ok' });
  assert.deepStrictEqual(p.posledniOdeslano().m, {}); // osobní pošta z osobní adresy
  o = p.volej('odeslat', { rezim: 'odpoved', id: 'm3', text: 'Doplňuji' }); // m3 jsem psal já
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(p.posledniOdeslano().jak, 'replyAll'); // odpověď na vlastní zprávu jde původním adresátům
});

test('přeposlání a nový e-mail: kontrola adres, předmět, účet', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  p.nastavAliasy([PRAC]);
  assert.strictEqual(p.volej('odeslat', { rezim: 'preposlat', id: 'm1', komu: 'nekdo', text: 'Viz níže' }).ok, false);
  let o = p.volej('odeslat', { rezim: 'preposlat', id: 'm2', komu: 'Kolega <kolega@firma.test>', text: 'Viz níže' });
  assert.strictEqual(o.ok, true, o.chyba);
  const f = p.log.odeslano.pop(); // přeposlání = nový e-mail s přílohami původní zprávy
  assert.strictEqual(f.jak, 'send');
  assert.strictEqual(f.predmet, 'Fwd: Předávací protokol');
  assert.strictEqual(f.m.from, PRAC);
  assert.strictEqual(f.m.attachments.length, 1);
  assert.ok(f.m.htmlBody.indexOf('Přeposlaná zpráva') > 0);
  o = p.volej('odeslat', { rezim: 'novy', ucet: 'pracovni', komu: 'a@b.test, c@d.test', predmet: '', text: 'Ahoj' });
  assert.strictEqual(o.ok, true, o.chyba);
  const n = p.log.odeslano.pop();
  assert.deepStrictEqual([n.komu, n.predmet, n.m.from], ['a@b.test, c@d.test', '(bez předmětu)', PRAC]);
  assert.strictEqual(p.volej('odeslat', { rezim: 'novy', komu: 'a@b.test', text: '   ' }).ok, false);
});

test('kalendář: Google + iCloud dohromady, seřazené, s barvou; mezipaměť; skrytí kalendáře', () => {
  const p = prostredi();
  let o = p.volej('kalendarPridat', { nazev: '', odkaz: 'webcal://p01-caldav.icloud.test/published/2/abc' });
  assert.strictEqual(o.ok, true, o.chyba);
  const ics = o.data.find((k) => k.zdroj === 'icloud');
  assert.strictEqual(ics.nazev, 'Rodina'); // název z X-WR-CALNAME
  assert.ok(!('odkaz' in ics)); // odkaz se do aplikace nevrací
  assert.strictEqual(p.volej('kalendarPridat', { odkaz: 'https://p01-caldav.icloud.test/published/2/abc' }).ok, false); // duplicita
  assert.strictEqual(p.volej('kalendarPridat', { odkaz: 'http://nesifrovane' }).ok, false);

  const od = Date.UTC(2026, 9, 4, 22), doDne = Date.UTC(2026, 9, 11, 22);
  o = p.volej('kalendar', { od, do: doDne });
  assert.strictEqual(o.ok, true, o.chyba);
  const u = o.data.udalosti;
  assert.deepStrictEqual(u.map((x) => x.nazev), ['Trénink', 'Zubař', 'Trénink']); // po 5. 10. trénink, út zubař, st trénink
  assert.strictEqual(u[1].popis, 'Popis tučně\nřádek');
  assert.strictEqual(u[0].barva, ics.barva);
  const stazeno = p.log.stazeno;
  p.volej('kalendar', { od, do: doDne });
  assert.strictEqual(p.log.stazeno, stazeno); // podruhé z mezipaměti

  o = p.volej('kalendarUpravit', { id: ics.id, skryty: true });
  assert.strictEqual(o.data.find((k) => k.id === ics.id).skryty, true);
  o = p.volej('kalendar', { od, do: doDne });
  assert.deepStrictEqual(o.data.udalosti.map((x) => x.nazev), ['Zubař']);
  assert.strictEqual(p.volej('kalendar', { od: doDne, do: od }).ok, false);
  assert.strictEqual(p.volej('kalendar', { od, do: od + 200 * 864e5 }).ok, false);
});

test('kalendář z nefunkčního odkazu: chyba u kalendáře, ostatní události dál', () => {
  const p = prostredi();
  p.vlastnosti.set('ICS_KALENDARE', JSON.stringify([{ id: 'ics-1', nazev: 'Rozbitý', odkaz: 'https://chyba.test/x.ics', barva: '#2f5bd3' }]));
  const o = p.volej('kalendar', { od: Date.UTC(2026, 9, 4, 22), do: Date.UTC(2026, 9, 11, 22) });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.udalosti.length, 1);
  assert.strictEqual(o.data.chyby[0].kalendar, 'Rozbitý');
  assert.ok(/404/.test(o.data.chyby[0].chyba));
});

test('stavy konverzací podle pravidel: hoří, čeká na tebe, otázka, čekáš na ně, řeší se, informace', () => {
  const p = prostredi();
  const ted = Date.UTC(2026, 9, 2, 13); // pátek 2. 10. 2026, 15:00 v Praze
  const stav = (o, odeMe, jeOznameni, jsemPsal) => {
    const m = p.zprava(Object.assign({ id: 'x', od: 'Někdo <nekdo@firma.test>', predmet: 'Věc', kdy: ted - 36e5 }, o));
    return p.ctx.stavPripadu_(m, !!odeMe, p.vlakno('vx', [m], true), !!jeOznameni, ted, !!jsemPsal);
  };
  // někdo něco chce / osobní zpráva bez jasného obsahu
  assert.strictEqual(stav({ text: 'Posílám podklady.' }), 'ceka');
  assert.strictEqual(stav({ text: 'Posíláme protokol k připomínkám.' }), 'ceka');
  assert.strictEqual(stav({ text: 'Můžeš to prosím zkontrolovat do středy?' }), 'ceka'); // prosba přebije otazník; středa je za 5 dní
  assert.strictEqual(stav({ text: 'Odkaz: https://x.test/a?b=1 posílám.' }), 'ceka'); // otazník v adrese není otázka
  assert.strictEqual(stav({ text: 'Ahoj\n-- \nJan Novák\nChceš vizitku?' }), 'ceka'); // otazník jen v podpisu
  assert.strictEqual(stav({ text: 'Velký úspěch, gratuluji!' }), 'ceka'); // „úspěch“ není „spěchá“
  assert.strictEqual(stav({ text: 'Jsem rychlejší, než jsem čekal.' }), 'ceka'); // „rychlejší“ není „rychle“
  // otázka bez prosby
  assert.strictEqual(stav({ text: 'Jak to vypadá s výkresy?' }), 'otazka');
  // hoří: naléhavost, problém, termín do 48 hodin od odeslání
  assert.strictEqual(stav({ predmet: 'URGENTNÍ: předání', text: 'Ozvi se.' }), 'hori');
  assert.strictEqual(stav({ text: 'Potřebuji to nejpozději dnes.' }), 'hori');
  assert.strictEqual(stav({ text: 'Můžeš to prosím zkontrolovat do pátku?' }), 'hori'); // napsáno v pátek
  assert.strictEqual(stav({ text: 'Pošlete to prosím do 3. 10.' }), 'hori');
  assert.strictEqual(stav({ text: 'Pošlete to prosím do 20. 10.' }), 'ceka');
  assert.strictEqual(stav({ text: 'Web nefunguje, podívej se na to.' }), 'hori');
  // živá konverzace bez požadavku
  assert.strictEqual(stav({ text: 'Díky.\n> Máš čas?' }, false, false, true), 'resi'); // otázka jen v citaci
  // informace
  assert.strictEqual(stav({ od: 'Banka <no-reply@banka.test>', text: 'Výpis?' }), 'info');
  assert.strictEqual(stav({ text: 'Účtenka' }, false, true), 'info');
  // čekáš na ně – ale ne po krátkém „díky“ a ne u hromadné zprávy
  assert.strictEqual(stav({ text: 'Odpověděl jsem?' }, true), 'cekas');
  assert.strictEqual(stav({ text: 'Díky, platí.' }, true), 'info');
  assert.strictEqual(stav({ text: 'Děkuji, pošlete prosím ještě soupis vad.' }, true), 'cekas');
  assert.strictEqual(stav({ text: 'Zítra nejdu.', komu: 'a@x.test, b@x.test, c@x.test, d@x.test, e@x.test, f@x.test' }, true), 'info');
});

test('pošta: stav v seznamu (moje poslední = čekáš na ně, oznámení podle kategorie)', () => {
  const p = prostredi();
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  let o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.data.pracovni[0].stav, 'info'); // poslední je moje „Děkuji.“ = uzavřené
  assert.strictEqual(o.data.osobni[0].stav, 'ceka');
  p.nastavAktualizace([p.vlakna.v1]);
  o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.data.osobni[0].stav, 'info');
});

test('hledání v celé poště, spam, připomenutí jako úkol ve schránce', () => {
  const p = prostredi();
  let o = p.volej('hledat', { dotaz: 'from:trener has:attachment' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.vlakna.length, 1);
  assert.strictEqual(o.data.vlakna[0].ucet, 'osobni');
  assert.ok(p.log.dotazy.some((q) => q === '(from:trener has:attachment) -in:trash -in:spam'));
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  o = p.volej('hledat', { dotaz: '{to:' + PRAC + '} protokol' }); // napodobený Gmail vrátí pracovní vlákno
  assert.strictEqual(o.data.vlakna[0].ucet, 'pracovni');
  assert.deepStrictEqual(p.volej('hledat', { dotaz: '   ' }).data.vlakna.length, 0);
  assert.strictEqual(p.volej('oznacit', { id: 'v1', jak: 'spam' }).ok, true);
  assert.strictEqual(p.log.spam, 'v1');
  assert.strictEqual(p.volej('pripomenout', { id: 'v1', termin: 'zitra' }).ok, false);
  o = p.volej('pripomenout', { id: 'v1', termin: '2026-10-05', poznamka: 'Zavolat trenérovi' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.slozka, 'CEKA');
  assert.strictEqual(o.data.typ, 'ukol-michal');
  assert.strictEqual(o.data.termin, '2026-10-05');
  assert.ok(/^Odpovědět: Sraz v sobotu/.test(o.data.shrnuti));
  const soubor = p.log.soubory.pop();
  assert.strictEqual(soubor.slozka, 'CEKA');
  assert.ok(soubor.obsah.indexOf('mail.google.com') > 0 && soubor.obsah.indexOf('Zavolat trenérovi') > 0);
});

test('kalendář – zápis: založit kalendář, nová / celodenní / týdně opakovaná, úprava, smazání, cizí kalendář', () => {
  const p = prostredi();
  const verze = () => p.vlastnosti.get('VERZE_KALENDARU') || '1';
  let o = p.volej('kalendarZalozit', { nazev: 'Zápasy', barva: '#2e7a4d' });
  assert.strictEqual(o.ok, true, o.chyba);
  const zid = o.data.id;
  assert.ok(o.data.kalendare.some((k) => k.id === zid && k.zapis === true));
  assert.ok(o.data.kalendare.some((k) => k.nazev === 'Osobní' && k.zapis === true));
  assert.strictEqual(p.volej('kalendarZalozit', { nazev: 'Zápasy' }).data.id, zid); // podruhé stejný, nový nevznikne
  assert.deepStrictEqual(p.log.zalozeno, ['Zápasy']);
  const kal = p.kalendare.find((k) => k.getId() === zid);

  // nová událost s připomenutím; verze kalendářů se zvýší (mezipaměť přestane platit)
  const z = Date.UTC(2026, 9, 7, 15), v0 = verze();
  o = p.volej('udalostUlozit', { kalendarId: zid, nazev: '  Trénink   dorostu ', zacatek: z, konec: z + 90 * 6e4, misto: 'hřiště', pripomenuti: [60] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.notStrictEqual(verze(), v0);
  let u = kal.udalosti[0]._;
  assert.deepStrictEqual([u.nazev, u.z, u.k, u.misto, u.pripomenuti.join()], ['Trénink dorostu', z, z + 90 * 6e4, 'hřiště', '60']);

  // celodenní: jeden den a víc dní (konec = půlnoc po posledním dni)
  const pulnoc = Date.UTC(2026, 9, 9, 22); // 10. 10. 0:00 v Praze
  assert.strictEqual(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Turnaj', celodenni: true, zacatek: pulnoc, konec: pulnoc + 864e5 }).ok, true);
  assert.deepStrictEqual([kal.udalosti[1]._.celodenni, kal.udalosti[1]._.k - kal.udalosti[1]._.z], [true, 864e5]);
  assert.strictEqual(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Soustředění', celodenni: true, zacatek: pulnoc, konec: pulnoc + 3 * 864e5 }).ok, true);
  assert.strictEqual(kal.udalosti[2]._.k - kal.udalosti[2]._.z, 3 * 864e5);

  // každý týden do 20. 12. včetně
  assert.strictEqual(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Trénink', zacatek: z, konec: z + 36e5, tydne: true, tydneDo: '2026-12-20' }).ok, true);
  assert.deepStrictEqual([kal.udalosti[3]._.rada.typ, kal.udalosti[3]._.rada.do], ['tydne', Date.UTC(2026, 11, 20, 22, 59)]);

  // úprava podle id z aplikace („iCalUID|začátek“) – i čas a název
  const prvni = kal.udalosti[0];
  o = p.volej('udalostUlozit', { kalendarId: zid, udalost: prvni.getId() + '|' + z, nazev: 'Trénink (přesunutý)', zacatek: z + 36e5, konec: z + 2 * 36e5 });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([prvni._.nazev, prvni._.z], ['Trénink (přesunutý)', z + 36e5]);
  assert.ok(/neexistuje/.test(p.volej('udalostUlozit', { kalendarId: zid, udalost: prvni.getId() + '|' + z, nazev: 'X', zacatek: z, konec: z + 1 }).chyba));

  // smazání: jeden výskyt / celá řada opakované
  assert.strictEqual(p.volej('udalostSmazat', { kalendarId: zid, udalost: prvni.getId() + '|' + (z + 36e5) }).ok, true);
  assert.strictEqual(prvni._.smazano, true);
  const rada = kal.udalosti[3];
  assert.strictEqual(p.volej('udalostSmazat', { kalendarId: zid, udalost: rada.getId() + '|' + z, cela: true }).ok, true);
  assert.strictEqual(rada._.celaRada, true);

  // kontroly
  assert.ok(/název/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: '   ', zacatek: z, konec: z + 1 }).chyba));
  assert.ok(/po začátku/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'X', zacatek: z, konec: z }).chyba));
  assert.ok(/moc dlouhá/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'X', zacatek: z, konec: z + 90 * 864e5 }).chyba));
  assert.ok(/zapisovat nejde/.test(p.volej('udalostUlozit', { kalendarId: 'x', nazev: 'X', zacatek: z, konec: z + 1 }).chyba));
  assert.ok(/nenalezen/.test(p.volej('udalostUlozit', { kalendarId: 'neni', nazev: 'X', zacatek: z, konec: z + 1 }).chyba));
});

test('kalendář – hosté: pozvánky u nové, změna hostů a e-mail o změně, skupiny hostů', () => {
  const p = prostredi();
  const zid = p.volej('kalendarZalozit', { nazev: 'Zápasy' }).data.id;
  const kal = p.kalendare.find((k) => k.getId() === zid);
  const z = Date.UTC(2026, 9, 10, 8);
  let o = p.volej('udalostUlozit', { kalendarId: zid, nazev: 'Zápas', zacatek: z, konec: z + 2 * 36e5, misto: 'hřiště',
    hoste: 'Trener@Klub.test; rodic@x.test, trener@klub.test', pozvat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  const u = kal.udalosti[0];
  assert.deepStrictEqual([u._.hoste.join(), u._.pozvanky], ['trener@klub.test,rodic@x.test', true]); // malá písmena, bez duplicit
  assert.ok(/Neplatná adresa/.test(p.volej('udalostUlozit', { kalendarId: zid, nazev: 'X', zacatek: z, konec: z + 1, hoste: 'nekdo@' }).chyba));
  // úprava: jeden host pryč, jeden nový, e-mail o změně všem současným
  const pred = p.log.odeslano.length;
  o = p.volej('udalostUlozit', { kalendarId: zid, udalost: u.getId() + '|' + z, nazev: 'Zápas', zacatek: z + 36e5, konec: z + 3 * 36e5,
    misto: 'hřiště', hoste: ['trener@klub.test', 'novy@y.test'], pozvat: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(u._.hoste, ['trener@klub.test', 'novy@y.test']);
  const mail = JSON.parse(JSON.stringify(p.log.odeslano[pred]));
  assert.deepStrictEqual([mail.jak, mail.komu, mail.predmet], ['send', 'trener@klub.test,novy@y.test', 'Změna: Zápas']);
  assert.ok(/Kdy: 10\. 10\. 2026 11:00 – 13:00/.test(mail.t) && /Kde: hřiště/.test(mail.t), mail.t);
  // bez „pozvat“ se nic neposílá, bez pole hosté se hosté nemění
  p.volej('udalostUlozit', { kalendarId: zid, udalost: u.getId() + '|' + (z + 36e5), nazev: 'Zápas!', zacatek: z + 36e5, konec: z + 3 * 36e5 });
  assert.strictEqual(p.log.odeslano.length, pred + 1);
  assert.strictEqual(u._.hoste.length, 2);
  // skupiny hostů: uložit, v info, kontrola adres
  o = p.volej('skupinyHostuUlozit', { skupiny: [{ nazev: ' Dorost – rodiče ', adresy: 'a@x.test, b@x.test' }, { nazev: 'Prázdná', adresy: '' }] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(o.data)), [{ nazev: 'Dorost – rodiče', adresy: ['a@x.test', 'b@x.test'] }]);
  assert.strictEqual(p.volej('info').data.skupinyHostu[0].nazev, 'Dorost – rodiče');
  assert.strictEqual(p.volej('skupinyHostuUlozit', { skupiny: [{ nazev: 'X', adresy: 'spatne' }] }).ok, false);
});

test('zápasy z rozpisu webu: import do „Zápasy“, odehrané vynechá, opakovaný import nic nezdvojí, změnu termínu upraví', () => {
  const p = prostredi();
  const ROZPIS = (cas) => [
    'export const ROZPIS = [',
    '  { id: "podzim26-01", date: "2000-08-15", time: "10:00", venue: "venku", opponent: "Prušánky" },',
    '  { id: "podzim26-08", date: "2099-10-04", time: "' + cas + '", venue: "doma",  opponent: "Těšany" },',
    '  { id: "podzim26-09", date: "2099-10-11", time: "12:30", venue: "venku", opponent: "Dubňany/Mutěnice" }, // komentář',
    '];'].join('\n');
  p.nastavRozpis(ROZPIS('12:15'));
  const zadani = { odkaz: 'https://web.test/dorost/rozpis-dorost.js', tym: 'dorost', domaci: 'Vnorovy', soutez: '5. liga staršího dorostu' };
  let o = p.volej('zapasyImport', zadani);
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno, o.data.beze_zmeny, o.data.kalendar], [2, 0, 0, 'Zápasy']);
  const kal = p.kalendare.find((k) => k.getName() === 'Zápasy');
  const [doma, venku] = kal.udalosti.map((x) => x._);
  assert.strictEqual(doma.nazev, '⚽ Vnorovy – Těšany (dorost)');
  assert.strictEqual(venku.nazev, '⚽ Dubňany/Mutěnice – Vnorovy (dorost)');
  assert.strictEqual(doma.z, Date.UTC(2099, 9, 4, 10, 15)); // 12:15 letního času v Praze
  assert.strictEqual(doma.k - doma.z, 2 * 36e5);
  assert.deepStrictEqual([doma.misto, venku.misto], ['Vnorovy, hřiště', 'Dubňany/Mutěnice']);
  assert.deepStrictEqual(doma.pripomenuti, [1440, 120]);
  assert.strictEqual(doma.stitky.asistent, 'dorost:podzim26-08');
  assert.ok(/5\. liga/.test(doma.popis));

  o = p.volej('zapasyImport', zadani); // znovu – nic nového
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno, o.data.beze_zmeny], [0, 0, 2]);
  p.nastavRozpis(ROZPIS('14:00')); // přeložený výkop
  o = p.volej('zapasyImport', zadani);
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno, o.data.beze_zmeny], [0, 1, 1]);
  assert.strictEqual(doma.z, Date.UTC(2099, 9, 4, 12, 0));
  assert.strictEqual(p.volej('zapasyImport', Object.assign({}, zadani, { vcetneOdehranych: true })).data.pridano, 1);

  // i JSON a klíče v uvozovkách; nesmysly přeskočí
  const z = JSON.parse(JSON.stringify(p.ctx.rozpisZapasu_('[{"id":"a1","date":"2099-01-02","time":"9:30","venue":"away","opponent":"Kyjov"},{"id":"x","date":"spatne"}]')));
  assert.deepStrictEqual(z, [{ id: 'a1', datum: '2099-01-02', cas: '9:30', doma: false, souper: 'Kyjov' }]);

  assert.ok(/https/.test(p.volej('zapasyImport', Object.assign({}, zadani, { odkaz: 'http://web.test/rozpis.js' })).chyba));
  assert.ok(/HTTP 404/.test(p.volej('zapasyImport', Object.assign({}, zadani, { odkaz: 'https://web.test/chyba-rozpis.js' })).chyba));
  p.nastavRozpis('nic tu není');
  assert.ok(/žádné zápasy/.test(p.volej('zapasyImport', zadani).chyba));
});

// ---------------------------------------------------------------- pošta podle Maileru: termíny, známí, důvody, odložení

test('termín vůči dnešku: starý „do zítra“ nehoří, „do pátku“ ve čtvrtek hoří, z více termínů nejbližší', () => {
  const p = prostredi();
  const ctvrtek = Date.UTC(2026, 9, 1, 13); // čtvrtek 1. 10. 2026, 15:00 v Praze
  const patek = Date.UTC(2026, 9, 2, 13);
  const stav = (text, ted, kdy) => {
    const m = p.zprava({ id: 'x', od: 'Někdo <nekdo@firma.test>', predmet: 'Věc', text, kdy: kdy == null ? ted - 36e5 : kdy });
    return JSON.parse(JSON.stringify(p.ctx.stavADuvod_(m, false, p.vlakno('vx', [m], true), false, ted, false)));
  };
  // „do pátku“ napsané ve čtvrtek = pátek 23:59 → do 48 hodin
  let s = stav('Pošli mi to do pátku.', ctvrtek);
  assert.strictEqual(s.stav, 'hori');
  assert.strictEqual(s.duvod, 'termín „do pátku“ – pá 2. 10.');
  assert.strictEqual(s.termin.ms, Date.UTC(2026, 9, 2, 21, 59)); // 23:59 letního času
  // zpráva z 22. 9. s „do zítra“: termín 23. 9. dávno prošel → nehoří, zůstane prosba
  s = stav('Pošlete to prosím do zítra.', patek, patek - 10 * 864e5);
  assert.strictEqual(s.stav, 'ceka');
  assert.strictEqual(s.termin.ms, Date.UTC(2026, 8, 23, 21, 59));
  // prošlý před méně než dnem ještě hoří (včerejší „dnes“), před dvěma dny už ne
  assert.strictEqual(stav('Potřebuji to nejpozději dnes.', patek, patek - 864e5).stav, 'hori');
  assert.strictEqual(stav('Potřebuji to nejpozději dnes.', patek, patek - 2 * 864e5).stav, 'ceka');
  // pozítří = +2 dny 23:59 – v pátek odpoledne to ještě není do 48 hodin
  assert.strictEqual(stav('Pošli to do pozítří.', patek).stav, 'ceka');
  // z více termínů platí nejbližší nadcházející (dřív rozhodoval první v textu)
  s = stav('Celé to pošlete do 20. 10., hlavní část ale do zítra.', patek);
  assert.deepStrictEqual([s.stav, s.termin.fraze], ['hori', 'do zítra']);
  // věta s termínem pro náhled; tečky v datu větu nedělí; dlouhá věta nejvýš 140 znaků
  assert.strictEqual(stav('Ahoj. Pošlete to prosím do 3. 10. Díky moc.', patek).termin.veta, 'Pošlete to prosím do 3. 10.');
  s = stav('Ahoj, ' + 'tohle je hodně dlouhá věta bez tečky '.repeat(8) + 'a potřebujeme to do 3. 10. jinak nestihneme ' +
    'další dlouhé povídání '.repeat(6), patek);
  assert.ok(s.termin.veta.length <= 140 && s.termin.veta.indexOf('do 3. 10.') > 0, s.termin.veta);
  // nesmyslné datum se nepočítá; termín v příštím roce i s rokem
  assert.strictEqual(stav('Pošlete to do 31. 9.', patek).termin, null);
  assert.strictEqual(stav('Pošlete to do 5. 1.', Date.UTC(2026, 11, 20, 12)).termin.den, 'út 5. 1. 2027');
});

test('pošta: termín, věta s termínem, „po termínu“ a důvod v souhrnu', () => {
  const p = prostredi();
  const ted = Date.now();
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Trenér <trener@klub.test>', predmet: 'Podklady',
    text: 'Ahoj. Pošlete to prosím do zítra. Díky.', kdy: ted - 10 * 864e5 })], true);
  const o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  const v = o.data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod, v.poTerminu, v.terminVeta, v.cekasOd], ['ceka', 'prosba „pošlete“', true, 'Pošlete to prosím do zítra.', null]);
  assert.ok(v.termin > ted - 10 * 864e5 && v.termin < ted);
  assert.deepStrictEqual([o.data.osobni[0].termin, o.data.osobni[0].terminVeta], [v.termin, v.terminVeta]);
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Trenér <trener@klub.test>', predmet: 'Sraz', text: 'Sraz v 8:30.', kdy: ted })], true);
  const bez = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([bez.termin, bez.terminVeta, bez.poTerminu, bez.duvod], [null, '', false, 'osobní zpráva']);
});

test('hoří jen od známých: naléhavá slova od cizích ne; neznámý bez prosby a otázky = informace', () => {
  const p = prostredi();
  const ted = Date.UTC(2026, 9, 2, 13);
  const stav = (text, znami, jsemPsal) => {
    const m = p.zprava({ id: 'x', od: 'Cizí <nekdo@cizi.test>', predmet: 'Věc', text, kdy: ted - 36e5 });
    return p.ctx.stavADuvod_(m, false, p.vlakno('vx', [m], true), false, ted, !!jsemPsal, znami);
  };
  const nikdo = {};
  assert.deepStrictEqual([stav('Web nefunguje, podívej se na to.', nikdo).stav, stav('Web nefunguje, podívej se na to.', nikdo).duvod],
    ['info', 'neznámý odesílatel']);
  assert.strictEqual(stav('Web nefunguje.', { 'nekdo@cizi.test': true }).stav, 'hori'); // psal jsem mu
  assert.strictEqual(stav('Web nefunguje.', { '@cizi.test': true }).stav, 'hori');      // kolega z pracovní domény
  assert.strictEqual(stav('Web nefunguje.', nikdo, true).stav, 'hori');                  // psal jsem v tomhle vlákně
  assert.strictEqual(stav('URGENT: posílám nabídku', nikdo).stav, 'info');
  // termín do 48 hodin hoří od kohokoli; prosba čeká; otazník je otázka
  assert.strictEqual(stav('Fakturu uhraďte do zítra.', nikdo).stav, 'hori');
  assert.strictEqual(stav('Pošlete prosím nabídku.', nikdo).stav, 'ceka');
  assert.strictEqual(stav('Máte zájem o spolupráci?', nikdo).stav, 'otazka');
  // bez seznamu (nevíme) je každý známý – jako dřív
  const m = p.zprava({ id: 'y', od: 'Cizí <x@cizi.test>', predmet: 'Věc', text: 'Výpadek!', kdy: ted });
  assert.strictEqual(p.ctx.stavPripadu_(m, false, null, false, ted, false), 'hori');
});

test('známí lidé: adresy z mé odeslané pošty (Komu, Kopie, Skrytá), mezipaměť nejvýš 6 hodin', () => {
  const p = prostredi();
  p.nastavOdeslana([p.vlakno('s1', [
    p.zprava({ id: 's1a', od: 'Já <' + JA + '>', komu: '"Novák, Jan" <Jan.Novak@x.test>, b@y.test', kopie: 'c@z.test', skryta: 'd@w.test',
      predmet: 'X', text: 'Ahoj', kdy: Date.UTC(2026, 8, 1) }),
    p.zprava({ id: 's1b', od: 'Cizí <cizi@spam.test>', komu: JA + ', e@v.test', predmet: 'Re: X', text: 'Ok', kdy: Date.UTC(2026, 8, 2) })
  ], false)]);
  const znami = JSON.parse(JSON.stringify(p.ctx.znamiLide_()));
  assert.deepStrictEqual(Object.keys(znami).sort(), ['b@y.test', 'c@z.test', 'd@w.test', 'jan.novak@x.test']); // ne cizí odpověď, ne já
  assert.ok(p.log.dotazy.includes('in:sent newer_than:365d'));
  assert.strictEqual(p.log.maxima['in:sent newer_than:365d'], 300);
  assert.ok(p.cache.has('znami') && p.ttl.get('znami') <= 21600);
  // v pracovní poště je kolega z pracovní domény známý, cizí s „nefunguje“ jen informace
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  assert.ok(!p.cache.has('znami')); // změna adresy = nový seznam
  const kdy = Date.now() - 36e5;
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Kolega <kolega@firma.test>', predmet: 'Tiskárna', text: 'Tiskárna nefunguje.', kdy })], true);
  let v = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod], ['hori', 'slovo „nefunguje“']);
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Prodejce <obchod@cizi.test>', predmet: 'Tiskárna', text: 'Vaše tiskárna nefunguje dobře.', kdy })], true);
  v = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod], ['info', 'neznámý odesílatel']);
});

test('důvod stavu: krátce česky, proč je konverzace tam, kde je', () => {
  const p = prostredi();
  const ted = Date.UTC(2026, 9, 2, 13);
  const duvod = (o, odeMe, jeOznameni, jsemPsal) => {
    const m = p.zprava(Object.assign({ id: 'x', od: 'Někdo <nekdo@firma.test>', predmet: 'Věc', kdy: ted - 36e5 }, o));
    return p.ctx.stavADuvod_(m, !!odeMe, p.vlakno('vx', [m], true), !!jeOznameni, ted, !!jsemPsal).duvod;
  };
  assert.strictEqual(duvod({ text: 'Web nefunguje.' }), 'slovo „nefunguje“');
  assert.strictEqual(duvod({ predmet: 'URGENTNÍ: předání', text: 'Ozvi se.' }), 'slovo „urgentní“');
  assert.strictEqual(duvod({ text: 'Pošlete to prosím do 3. 10.' }), 'termín „do 3. 10.“ – so 3. 10.');
  assert.strictEqual(duvod({ text: 'Účtenka' }, false, true), 'Gmail: Aktualizace');
  assert.strictEqual(duvod({ od: 'Banka <no-reply@banka.test>', text: 'Výpis' }), 'automatická adresa');
  assert.strictEqual(duvod({ text: 'Díky, platí.' }, true), 'tvoje „díky“ na konci');
  assert.strictEqual(duvod({ text: 'Pošlete podklady.' }), 'prosba „pošlete“');
  assert.strictEqual(duvod({ text: 'Jak to vypadá?' }), 'otazník v textu');
  assert.strictEqual(duvod({ text: 'Posílám výkres.' }, true), 'odpověděl jsi poslední');
  assert.strictEqual(duvod({ text: 'Posílám výkres.' }, false, false, true), 'píšete si, nic po tobě nechce');
  assert.strictEqual(duvod({ text: 'Posílám výkres.' }), 'osobní zpráva');
});

test('čekáš na ně: na koho (jména adresátů, i s čárkou v uvozovkách), co jsi psal a od kdy', () => {
  const p = prostredi();
  const kdy = Date.now() - 2 * 864e5;
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm9', od: 'Já <' + JA + '>', predmet: 'Nabídka',
    komu: 'Petr Novák <petr@x.test>, "Svoboda, Jan" <jan@y.test>, c@z.test, d@w.test',
    text: 'Dobrý den,\n\nposílám nabídku, dejte vědět.\n\n> starší citace', kdy })], false);
  const v = p.volej('posta', { znovu: true }).data.osobni[0];
  assert.deepStrictEqual([v.stav, v.duvod], ['cekas', 'odpověděl jsi poslední']);
  assert.strictEqual(v.od, 'Čekáš na: Petr Novák, Svoboda, Jan, c@z.test'); // nejvýš tři
  assert.strictEqual(v.ukazka, 'posílám nabídku, dejte vědět.'); // první řádek vlastního textu, bez oslovení
  assert.strictEqual(v.cekasOd, kdy);
});

test('odeslání jen jednou: stejné idOdeslani pošle e-mail jednou, podruhé vrátí jizOdeslano', () => {
  const p = prostredi();
  const d = { rezim: 'novy', komu: 'a@b.test', predmet: 'Ahoj', text: 'Text', idOdeslani: 'psani-123' };
  let o = p.volej('odeslat', d);
  assert.deepStrictEqual([o.ok, o.data], [true, true]);
  o = p.volej('odeslat', d); // opakovaný pokus (třeba po výpadku sítě)
  assert.deepStrictEqual(o.data, { jizOdeslano: true });
  assert.strictEqual(p.log.odeslano.length, 1);
  assert.strictEqual(p.ttl.get('odeslano:psani-123'), 21600);
  assert.strictEqual(p.volej('odeslat', Object.assign({}, d, { idOdeslani: 'jine-psani' })).data, true);
  assert.strictEqual(p.log.odeslano.length, 2);
  assert.strictEqual(p.volej('odeslat', Object.assign({}, d, { idOdeslani: 'x'.repeat(65) })).ok, false);
  // neúspěšný pokus se nezapamatuje – opravený se stejným id odejde
  assert.strictEqual(p.volej('odeslat', { rezim: 'novy', komu: 'spatne', text: 'X', idOdeslani: 'psani-9' }).ok, false);
  assert.strictEqual(p.volej('odeslat', { rezim: 'novy', komu: 'a@b.test', text: 'X', idOdeslani: 'psani-9' }).data, true);
  assert.strictEqual(p.log.odeslano.length, 3);
});

test('odložit: Připomenout archivuje a zapamatuje, v den termínu se konverzace vrátí do Doručených', () => {
  const p = prostredi();
  const datum = (dni) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + dni * 864e5));
  const odlozene = () => JSON.parse(p.vlastnosti.get('ODLOZENE') || '[]');
  let o = p.volej('pripomenout', { id: 'v1', termin: datum(5) });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.slozka, 'CEKA'); // úkol ve schránce zůstává
  assert.deepStrictEqual(p.log.archiv, ['v1']);
  assert.deepStrictEqual(odlozene(), [{ id: 'v1', termin: datum(5) }]);
  p.volej('pripomenout', { id: 'v1', termin: datum(3) }); // znovu = jen nový termín, ne druhý záznam
  assert.deepStrictEqual(odlozene(), [{ id: 'v1', termin: datum(3) }]);
  p.volej('posta'); // před termínem se nic nevrací
  assert.deepStrictEqual(p.log.doDorucenych, []);
  // termín nastal → zpět do Doručených jako nepřečtená, ze seznamu pryč; pošta se načte znovu, ne z mezipaměti
  p.vlastnosti.set('ODLOZENE', JSON.stringify([{ id: 'v1', termin: datum(0) }, { id: 'v2', termin: datum(1) }, { id: 'smazane', termin: datum(-1) }]));
  const dotazu = p.log.dotazy.length;
  o = p.volej('posta');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([p.log.doDorucenych, p.log.neprecteno], [['v1'], ['v1']]);
  assert.deepStrictEqual(odlozene(), [{ id: 'v2', termin: datum(1) }]);
  assert.ok(p.log.dotazy.length > dotazu);
});

test('Vrátit po Hotovo nebo Spamu: zpět do Doručených i ze spamu; návrat a Hotovo vrácené konverzace ruší odložení', () => {
  const p = prostredi();
  const odlozene = () => JSON.parse(p.vlastnosti.get('ODLOZENE') || '[]').map((x) => x.id);
  assert.strictEqual(p.volej('oznacit', { id: 'v1', jak: 'spam' }).ok, true);
  assert.strictEqual(p.volej('oznacit', { id: 'v1', jak: 'vratit' }).ok, true);
  assert.deepStrictEqual(p.log.zeSpamu, ['v1']); // GmailApp.moveThreadToInbox
  assert.strictEqual(p.vlakna.v1.isInInbox(), true);
  // odložená a hned Hotovo (není v Doručených) – odložení platí dál
  p.volej('pripomenout', { id: 'v1', termin: '2099-01-01' });
  p.volej('oznacit', { id: 'v1', jak: 'archivovat' });
  assert.deepStrictEqual(odlozene(), ['v1']);
  // vrátila se (třeba s odpovědí) a teď je vyřízená → odložení neplatí
  p.vlakna.v1.moveToInbox();
  p.volej('oznacit', { id: 'v1', jak: 'archivovat' });
  assert.deepStrictEqual(odlozene(), []);
  // „Vrátit“ u odložené ruší odložení
  p.volej('pripomenout', { id: 'v2', termin: '2099-01-01' });
  p.volej('oznacit', { id: 'v2', jak: 'vratit' });
  assert.strictEqual(p.vlastnosti.has('ODLOZENE'), false);
});

test('hledání: koš a spam se vynechají, jen když je dotaz sám nechce', () => {
  const p = prostredi();
  ['in:spam faktura', 'label:trash', 'IN:anywhere smlouva', 'from:x -in:spam'].forEach((dotaz) => assert.strictEqual(p.volej('hledat', { dotaz }).ok, true));
  assert.ok(p.log.dotazy.includes('(in:spam faktura)'));
  assert.ok(p.log.dotazy.includes('(label:trash)'));
  assert.ok(p.log.dotazy.includes('(IN:anywhere smlouva)'));
  assert.ok(p.log.dotazy.includes('(from:x -in:spam) -in:trash -in:spam')); // vyloučení není „chci spam“
});

test('adresy: čárka ve jménu v uvozovkách nedělí (seznam, jméno, kontrola adresátů, počet adresátů)', () => {
  const p = prostredi();
  const seznam = (s) => JSON.parse(JSON.stringify(p.ctx.rozdelAdresy_(s)));
  assert.deepStrictEqual(seznam('"Novák, Jan" <jan@x.cz>, „Dr. X, Ph.D.“ <x@y.cz>; b@c.cz'),
    ['"Novák, Jan" <jan@x.cz>', '„Dr. X, Ph.D.“ <x@y.cz>', 'b@c.cz']);
  assert.deepStrictEqual(seznam('Jan "Honza <jan@x.cz>, b@c.cz'), ['Jan "Honza <jan@x.cz>', 'b@c.cz']); // nespárované uvozovky
  assert.deepStrictEqual(seznam(''), []);
  assert.deepStrictEqual(seznam('"Jan \\"Honza, ml.\\" Novák" <jan@x.cz>, b@c.cz').length, 2); // \" uvnitř jména
  assert.strictEqual(p.ctx.jmeno_('"Jan \\"Honza\\" Novák" <jan@x.cz>'), 'Jan "Honza" Novák');
  assert.strictEqual(p.ctx.jmeno_('"Novák, Jan" <jan@x.cz>, b@c.cz'), 'Novák, Jan');
  assert.strictEqual(p.ctx.jmeno_('„Dr. X, Ph.D.“ <x@y.cz>'), 'Dr. X, Ph.D.');
  assert.strictEqual(p.ctx.jmeno_('jan@x.cz'), 'jan@x.cz');
  const o = p.volej('odeslat', { rezim: 'novy', komu: '"Novák, Jan" <jan@x.cz>; b@c.cz', text: 'Ahoj' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(p.posledniOdeslano().komu, '"Novák, Jan" <jan@x.cz>, b@c.cz');
  // tři adresáti se jménem s čárkou jsou tři, ne šest → pořád „čekáš na ně“, ne hromadná zpráva
  const ted = Date.UTC(2026, 9, 2, 13);
  const m = p.zprava({ id: 'x', od: 'Já <' + JA + '>', komu: '"A, B" <a@x.test>, "C, D" <c@x.test>, "E, F" <e@x.test>', predmet: 'Věc', text: 'Posílám.', kdy: ted });
  assert.strictEqual(p.ctx.stavPripadu_(m, true, null, false, ted, true), 'cekas');
});

test('pošta: starší okno 30–90 dní – jen nevyřízené (hoří, čeká, otázka), nejvýš 25, bez duplicit', () => {
  const p = prostredi();
  const kdy = Date.now() - 45 * 864e5;
  const stara = (id, o) => p.vlakno(id, [p.zprava(Object.assign({ id: id + 'm', predmet: 'Starší ' + id, kdy }, o))], false);
  p.nastavStarsi([
    stara('s1', { od: 'Trenér <trener@klub.test>', text: 'Pošli prosím soupisku.' }), // čeká na tebe
    stara('s2', { od: 'Banka <no-reply@banka.test>', text: 'Výpis z účtu.' }),        // informace
    stara('s3', { od: 'Já <' + JA + '>', komu: 'trener@klub.test', text: 'Posílám.' }), // čekáš na ně
    stara('s4', { od: 'Trenér <trener@klub.test>', text: 'Kdy začíná trénink?' }),    // otázka
    p.vlakna.v1                                                                         // je i v novém okně
  ]);
  let o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.osobni.map((v) => v.id), ['v1', 's1', 's4']);
  const dotaz = 'in:inbox older_than:30d newer_than:90d -category:promotions -category:social -category:forums';
  assert.strictEqual(p.log.maxima[dotaz], 25);
  // pracovní účet stejně
  p.volej('nastavPostu', { pracovniAdresa: PRAC });
  p.nastavStarsi([], [stara('s5', { od: 'Investor <info@stavba.test>', komu: PRAC, text: 'Můžete to potvrdit?' }),
    stara('s6', { od: 'Dodavatel <obchod@cizi.test>', komu: PRAC, text: 'Pro informaci.' })]); // neznámý bez prosby = informace
  o = p.volej('posta', { znovu: true });
  assert.deepStrictEqual(o.data.pracovni.map((v) => v.id), ['v2', 's5']);
  assert.ok(p.log.dotazy.includes(dotaz + ' {to:' + PRAC + ' cc:' + PRAC + ' deliveredto:' + PRAC + '}'));
});

test('vlákno: dlouhý text a HTML se zkrátí („…“), jiná adresa pro odpověď (Reply-To) se ukáže', () => {
  const p = prostredi();
  const html = '<div>' + '<p>odstavec</p>'.repeat(20000) + '</div>'; // 300 000 znaků
  p.vlakna.v9 = p.vlakno('v9', [
    p.zprava({ id: 'm9', od: 'Firma <info@firma.test>', odpovedNa: 'Podpora <podpora@firma.test>', predmet: 'Newsletter',
      text: 'a'.repeat(150000), html, kdy: Date.now() - 864e5 }),
    p.zprava({ id: 'm10', od: 'Trenér <trener@klub.test>', odpovedNa: 'trener@klub.test', predmet: 'Re: Newsletter', text: 'Krátká', kdy: Date.now() })
  ], false);
  const o = p.volej('vlakno', { id: 'v9' });
  assert.strictEqual(o.ok, true, o.chyba);
  const [z1, z2] = o.data.zpravy;
  assert.deepStrictEqual([z1.text.length, z1.text.slice(-2)], [100001, 'a…']);
  assert.ok(z1.html.length <= 180001 && />…$/.test(z1.html), z1.html.slice(-20)); // řez za celým tagem
  assert.strictEqual(z1.odpovedNa, 'Podpora <podpora@firma.test>');
  assert.deepStrictEqual([z2.text, z2.html], ['Krátká', '<p>Krátká</p>']);
  assert.ok(!('odpovedNa' in z2)); // Reply-To = odesílatel
});

// ---------------------------------------------------------------- schránka: dopsat, nadpis, téma, návrh, smazat

const json = (x) => JSON.parse(JSON.stringify(x));

test('schránka: nadpis a téma v hlavičce, dopsat i k vyřízené (zpět do NOVE), návrh od Clauda, smazat do koše', () => {
  const p = prostredi();
  const ceka = p.schranka.createFolder('CEKA');
  p.schranka.createFolder('NOVE');
  const hotovo = p.schranka.createFolder('HOTOVO');
  const mesic = hotovo.createFolder('2026-10');
  const navrh = { typ: 'udalost', nazev: 'Schůzka s Petrem', zacatek: '2026-10-06T10:00', konec: '2026-10-06T11:00', hoste: ['Petr Novák'], pozvat: true };
  ceka.createFile('2026-10-02_100000_ab12.md', '---\nkdy: 2026-10-02T10:00:00+02:00\nodkud: iPhone\ntyp: ukol-michal\nstav: rozhodni\nshrnuti: Schůzka s Petrem\nnavrh: ' +
    JSON.stringify(navrh) + '\n---\n\nPozvi Petra na schůzku v úterý v deset.\n\n## Claude – 2026-10-02 10:30\nPřipravil jsem návrh události.\n');
  mesic.createFile('2026-10-01_090000_cd34.md', '---\nkdy: 2026-10-01T09:00:00+02:00\n---\n\nKolik je místností?\n\n## Claude – 2026-10-01 09:30\n48.\n');
  let o = p.volej('schranka');
  assert.strictEqual(o.ok, true, o.chyba);
  const polozka = o.data.ceka[0];
  assert.deepStrictEqual(json(polozka.navrh), navrh);
  assert.deepStrictEqual([polozka.nadpis, polozka.tema], ['', '']);
  // nadpis a téma: hlavička se upraví, soubor zůstane v CEKA, vrátí se upravená položka
  o = p.volej('polozka', { id: polozka.id, jak: 'nadpis', text: '  Schůzka   s Petrem – úterý ' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.nadpis, 'Schůzka s Petrem – úterý');
  o = p.volej('polozka', { id: polozka.id, jak: 'tema', text: 'Prace' });
  assert.deepStrictEqual([o.data.tema, o.data.slozka, o.data.text], ['prace', 'CEKA', 'Pozvi Petra na schůzku v úterý v deset.']);
  assert.strictEqual(p.volej('polozka', { id: polozka.id, jak: 'tema', text: 'nesmysl s mezerou' }).ok, false);
  o = p.volej('polozka', { id: polozka.id, jak: 'nadpis', text: '' });
  assert.strictEqual(o.data.nadpis, '');
  assert.ok(/^---\nkdy: [^\n]+\nodkud: iPhone\n/.test(p.vsechnySoubory[polozka.id].getBlob().getDataAsString()));
  // hotovo s textem (po založení události z návrhu) → HOTOVO/RRRR-MM, text v sekci Michal
  assert.strictEqual(p.volej('polozka', { id: polozka.id, jak: 'hotovo', text: 'Událost založena: Schůzka s Petrem, út 6. 10. 10:00' }).ok, true);
  o = p.volej('schranka');
  assert.strictEqual(o.data.ceka.length, 0);
  const hotova = o.data.hotovo.find((x) => x.id === polozka.id);
  assert.strictEqual(hotova.vlakno.pop().text, 'Událost založena: Schůzka s Petrem, út 6. 10. 10:00');
  // dopsat k vyřízené → zpět do NOVE jako nový pokyn
  const stara = o.data.hotovo.find((x) => x.id !== polozka.id);
  assert.strictEqual(p.volej('polozka', { id: stara.id, jak: 'dopsat', text: 'A kolik jich je ve 3. NP?' }).ok, true);
  o = p.volej('schranka');
  const dopsana = o.data.nove.find((x) => x.id === stara.id);
  assert.ok(dopsana, 'dopsaná položka má být v NOVE');
  const posledni = dopsana.vlakno[dopsana.vlakno.length - 1];
  assert.deepStrictEqual([posledni.kdo, posledni.text], ['Michal', 'A kolik jich je ve 3. NP?']);
  assert.strictEqual(p.volej('polozka', { id: stara.id, jak: 'dopsat', text: '  ' }).ok, false);
  // smazat → koš (ve výpisu schránky už není)
  assert.strictEqual(p.volej('polozka', { id: stara.id, jak: 'smazat' }).ok, true);
  assert.strictEqual(p.vsechnySoubory[stara.id].vKosi, true);
  assert.ok(!p.volej('schranka').data.nove.some((x) => x.id === stara.id));
});

// ---------------------------------------------------------------- štítky Gmailu, kontakty, podpisy

test('štítky: u konverzací v seznamu (z mezipaměti podruhé bez Gmailu), seznam štítků, konverzace štítku i archivované', () => {
  const p = prostredi();
  p.stitkyVlaken.v1 = ['Fotbal', 'Fotbal/Dorost'];
  let o = p.volej('posta');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.osobni[0].stitky), ['Fotbal', 'Fotbal/Dorost']);
  const volani = p.log.getLabels;
  o = p.volej('posta', { znovu: true });
  assert.deepStrictEqual(json(o.data.osobni[0].stitky), ['Fotbal', 'Fotbal/Dorost']);
  assert.strictEqual(p.log.getLabels, volani, 'štítky vlákna se mají brát z mezipaměti');
  // seznam štítků s nepřečtenými, seřazený po česku
  p.nastavStitkyGmailu({ 'Účty': { neprectenych: 2, vlakna: [] }, 'Fotbal': { neprectenych: 0, vlakna: [p.vlakna.v1, p.vlakna.v3] }, 'Auto': { neprectenych: 1, vlakna: [] } });
  o = p.volej('stitky');
  assert.deepStrictEqual(json(o.data).map((s) => s.nazev + ':' + s.neprectenych), ['Auto:1', 'Fotbal:0', 'Účty:2']);
  // konverzace štítku: i ta odeslaná/archivovaná (v3), každá se stavem
  o = p.volej('postaStitek', { nazev: 'Fotbal' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(o.data.vlakna.map((v) => v.id), ['v1', 'v3']);
  assert.strictEqual(o.data.vlakna[1].stav, 'cekas');
  assert.strictEqual(p.volej('postaStitek', { nazev: 'Neexistuje' }).ok, false);
});

test('kontakty ze odeslané pošty (jméno, adresa, počet) a podpisy osobní / pracovní', () => {
  const p = prostredi();
  let o = p.volej('kontakty');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data), [{ j: 'Trenér', a: 'trener@klub.test', n: 1 }]);
  // starý tvar mezipaměti (jen adresy) se sestaví znovu i se jmény
  const p2 = prostredi();
  p2.cache.set('znami', '1'); p2.cache.set('znami:0', JSON.stringify(['trener@klub.test']));
  assert.deepStrictEqual(json(p2.volej('kontakty').data), [{ j: 'Trenér', a: 'trener@klub.test', n: 1 }]);
  // podpisy: uložit, info je vrací, příliš dlouhý odmítnout
  o = p.volej('podpisyUlozit', { podpisy: { osobni: 'Michal\r\n', pracovni: 'S pozdravem\nMichal\nFirma' } });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual(json(o.data.podpisy), { osobni: 'Michal', pracovni: 'S pozdravem\nMichal\nFirma' });
  assert.deepStrictEqual(json(p.volej('info').data.posta.podpisy), { osobni: 'Michal', pracovni: 'S pozdravem\nMichal\nFirma' });
  assert.strictEqual(p.volej('podpisyUlozit', { podpisy: { osobni: 'x'.repeat(2001) } }).ok, false);
});

// ---------------------------------------------------------------- fotbal a druhy kalendářů

const FOTBAL = fs.readFileSync(path.join(__dirname, 'fotbal', 'FOTBAL.json'), 'utf8');

test('fotbal: zápasy ze schránky, převod vybraných týmů do kalendářů „⚽ tým“, výsledek v názvu, bez duplicit', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-10-02T20:00:00+02:00'));
  let o = p.volej('fotbal');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.data, null); // soubor ještě není
  assert.ok(/FOTBAL\.json/.test(p.volej('fotbalKalendar', { tymy: ['A'] }).chyba));
  p.schranka.createFile('FOTBAL.json', FOTBAL);
  o = p.volej('fotbal');
  assert.deepStrictEqual([o.data.data.zapasy.length, o.data.vKalendari.length, o.data.data.tymy.map((t) => t.klic).join()], [34, 0, 'A,B,dorost']);
  o = p.volej('fotbalKalendar', { tymy: ['A', 'dorost', 'neexistuje'] });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.ok(o.data.pridano > 0 && o.data.upraveno === 0, JSON.stringify(o.data));
  const kalA = p.kalendare.find((k) => k.getName() === '⚽ A-tým');
  const kalD = p.kalendare.find((k) => k.getName() === '⚽ Dorost');
  assert.ok(kalA && kalD && !p.kalendare.some((k) => k.getName() === '⚽ B-tým'));
  const nazvy = kalA.udalosti.map((u) => u._.nazev);
  assert.ok(nazvy.indexOf('⚽ Šardice – Vnorovy (A-tým)') >= 0, nazvy.join(' | '));
  assert.ok(nazvy.some((n) => /^⚽ Vnorovy – Lysovice \(A-tým\) 1:3$/.test(n)), 'odehraný zápas s výsledkem');
  const sardice = kalA.udalosti.find((u) => /Šardice/.test(u._.nazev));
  assert.deepStrictEqual([sardice._.z, sardice._.k - sardice._.z, sardice._.misto], [Date.parse('2026-10-03T15:00:00+02:00'), 120 * 6e4, 'Šardice']);
  assert.ok(/6\. liga/.test(sardice._.popis) && /10\. kolo/.test(sardice._.popis) && /fotbal\.cz/.test(sardice._.popis));
  assert.strictEqual(sardice._.stitky.asistent.indexOf('fotbal:'), 0);
  assert.deepStrictEqual(json(sardice._.pripomenuti), [1440, 120]);
  // druh fotbal pro týmové kalendáře, nastavení zapamatované
  const seznam = p.volej('kalendare').data;
  assert.strictEqual(seznam.find((k) => k.nazev === '⚽ A-tým').druh, 'fotbal');
  assert.deepStrictEqual(json(p.volej('fotbal').data.vKalendari), ['A', 'dorost']);
  // podruhé nic nového
  o = p.volej('fotbalKalendar', { tymy: ['A', 'dorost'] });
  assert.deepStrictEqual([o.data.pridano, o.data.upraveno], [0, 0]);
  // nová data ve schránce (přeložený zápas + výsledek) → fotbal sám kalendář obnoví
  const data = JSON.parse(FOTBAL);
  const z = data.zapasy.find((x) => x.id === sardice._.stitky.asistent.slice(7));
  z.zacatek = '2026-10-03T16:30:00+02:00';
  p.schranka.soubory.find((x) => x.getName() === 'FOTBAL.json').setContent(JSON.stringify(data));
  o = p.volej('fotbal');
  assert.strictEqual(o.data.kalendar.upraveno, 1, JSON.stringify(o.data.kalendar));
  assert.strictEqual(sardice._.z, Date.parse('2026-10-03T16:30:00+02:00'));
  assert.strictEqual(p.ctx.kratkyKlub_('FK Hodonín "B"'), 'Hodonín B');
  assert.strictEqual(p.ctx.kratkyKlub_('TJ Sokol Těšany'), 'Těšany');
  assert.strictEqual(p.ctx.kratkyKlub_('FK Agro Vnorovy,z.s.'), 'Vnorovy');
});

test('druhy kalendářů: odhad podle názvu, uložení vlastního, neplatný odmítnut', () => {
  const p = prostredi();
  let o = p.volej('kalendare');
  assert.strictEqual(o.data[0].druh, 'osobni');
  assert.strictEqual(p.ctx.odhadDruhu_('Práce – projekty'), 'prace');
  assert.strictEqual(p.ctx.odhadDruhu_('Trénink dorostu'), 'fotbal');
  o = p.volej('kalendarUpravit', { id: 'osobni@gmail.test', druh: 'rodina' });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.find((k) => k.id === 'osobni@gmail.test').druh, 'rodina');
  assert.strictEqual(p.volej('kalendarUpravit', { id: 'osobni@gmail.test', druh: 'nesmysl' }).ok, false);
});

// ---------------------------------------------------------------- zdraví: WHOOP + Apple Zdraví

const WHOOP_VZOR = {
  sleep: [
    { id: 's1', cycle_id: 101, start: '2026-10-01T21:10:00.000Z', end: '2026-10-02T05:05:00.000Z', timezone_offset: '+02:00', nap: false, score_state: 'SCORED',
      score: { stage_summary: { total_in_bed_time_milli: 28500000, total_awake_time_milli: 1500000, total_light_sleep_time_milli: 13000000,
        total_slow_wave_sleep_time_milli: 6500000, total_rem_sleep_time_milli: 7000000, sleep_cycle_count: 5, disturbance_count: 8 },
      sleep_needed: { baseline_milli: 27000000, need_from_sleep_debt_milli: 1200000, need_from_recent_strain_milli: 600000, need_from_recent_nap_milli: 0 },
      respiratory_rate: 15.2, sleep_performance_percentage: 91, sleep_consistency_percentage: 83, sleep_efficiency_percentage: 94.1 } },
    { id: 's0', cycle_id: 100, start: '2026-10-01T12:00:00.000Z', end: '2026-10-01T12:30:00.000Z', timezone_offset: '+02:00', nap: true, score_state: 'SCORED', score: {} }
  ],
  recovery: [{ cycle_id: 101, sleep_id: 's1', created_at: '2026-10-02T05:40:00.000Z', score_state: 'SCORED',
    score: { user_calibrating: false, recovery_score: 72, resting_heart_rate: 49, hrv_rmssd_milli: 84.34, spo2_percentage: 96.4, skin_temp_celsius: 33.9 } }],
  cycle: [{ id: 101, start: '2026-10-01T21:10:00.000Z', end: null, timezone_offset: '+02:00', score_state: 'SCORED',
    score: { strain: 9.44, kilojoule: 8000, average_heart_rate: 70, max_heart_rate: 150 }, step_count: 6012 }],
  workout: [{ id: 'w1', start: '2026-10-01T14:00:00.000Z', end: '2026-10-01T15:45:00.000Z', timezone_offset: '+02:00', sport_name: 'Soccer', score_state: 'SCORED',
    score: { strain: 15.8, average_heart_rate: 152, max_heart_rate: 191, kilojoule: 4210.5, percent_recorded: 100,
      zone_durations: { zone_zero_milli: 240000, zone_one_milli: 600000, zone_two_milli: 1500000, zone_three_milli: 1800000, zone_four_milli: 1200000, zone_five_milli: 360000 } } }]
};

function zdraviProstredi() {
  const p = prostredi();
  p.vlastnosti.set('WHOOP_CLIENT_ID', 'klient-id');
  p.vlastnosti.set('WHOOP_CLIENT_SECRET', 'klient-tajne');
  p.vlastnosti.set('WHOOP_REDIRECT_URI', 'https://script.google.com/macros/s/MOTOR/exec');
  p.whoop.data = JSON.parse(JSON.stringify(WHOOP_VZOR));
  p.nastavCas(Date.parse('2026-10-02T08:00:00Z'));
  return p;
}

test('zdraví: propojení WHOOP – odkaz se state, návrat do doGet (špatný state odmítnut), tokeny a první synchronizace', () => {
  const bez = prostredi();
  assert.ok(/WHOOP_CLIENT_ID/.test(bez.volej('whoopPropojit').chyba));
  const p = zdraviProstredi();
  const o = p.volej('whoopPropojit');
  assert.strictEqual(o.ok, true, o.chyba);
  const u = new URL(o.data.odkaz);
  assert.strictEqual(u.origin + u.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
  assert.deepStrictEqual([u.searchParams.get('response_type'), u.searchParams.get('client_id'), u.searchParams.get('redirect_uri')],
    ['code', 'klient-id', 'https://script.google.com/macros/s/MOTOR/exec']);
  assert.ok(/offline/.test(u.searchParams.get('scope')) && u.searchParams.get('state').length >= 32);
  // cizí state → nic
  let h = p.ctx.doGet({ parameter: { code: 'dobry-kod', state: 'cizi-state-12345678' } }).html;
  assert.ok(/nepropojen/.test(h) && !p.vlastnosti.has('WHOOP_TOKEN'));
  // správně → tokeny + data za 30 dní
  h = p.ctx.doGet({ parameter: { code: 'dobry-kod', state: u.searchParams.get('state') } }).html;
  assert.ok(/WHOOP propojen/.test(h), h);
  assert.strictEqual(JSON.parse(p.vlastnosti.get('WHOOP_TOKEN')).refresh_token, 'r1');
  assert.ok(p.whoop.volani.some((x) => x.indexOf('/developer/v2/activity/sleep?limit=25&start=') === 0));
  assert.ok(p.whoop.volani.some((x) => /nextToken=str2/.test(x)), 'druhá stránka');
  // state jde použít jen jednou
  h = p.ctx.doGet({ parameter: { code: 'dobry-kod', state: u.searchParams.get('state') } }).html;
  assert.ok(/nepropojen/.test(h));
  // běžný doGet beze změny
  assert.strictEqual(p.ctx.doGet({ parameter: {} }).text, 'Asistent – motor běží.');
});

test('zdraví: přehled po dnech (den probuzení), recovery přes spánek, zátěž cyklu, tréninky; obnova tokenu s rotací; 401 odpojí', () => {
  const p = zdraviProstredi();
  p.vlastnosti.set('WHOOP_TOKEN', JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expiresAt: Date.parse('2026-10-02T09:00:00Z') }));
  let o = p.volej('zdravi');
  assert.strictEqual(o.ok, true, o.chyba);
  const d = o.data.dny.find((x) => x.den === '2026-10-02');
  assert.ok(d && d.whoop, JSON.stringify(o.data.dny));
  assert.deepStrictEqual(json(d.whoop.pripravenost), { skore: 72, hrv: 84.3, klidovyTep: 49, spo2: 96.4, teplota: 33.9, kalibrace: false });
  assert.strictEqual(d.whoop.spanek.celkem, 26500000);
  assert.deepStrictEqual([d.whoop.spanek.vykon, d.whoop.spanek.potreba, d.whoop.spanek.efektivita], [91, 28800000, 94.1]);
  assert.deepStrictEqual(json(d.whoop.zatez), { probiha: true, kroky: 6012, zatez: 9.4, kcal: 1912, tepPrumer: 70, tepMax: 150 });
  assert.deepStrictEqual(json(o.data.treninky.map((t) => [t.den, t.sport, t.zatez, t.kcal, t.zony.join(',')])),
    [['2026-10-01', 'soccer', 15.8, 1006, '4,10,25,30,20,6']]);
  assert.strictEqual(o.data.whoop.propojeno, true);
  // podruhé do 30 minut se WHOOP nevolá; znovu = vynutit; prošlý token → obnova a nový refresh token hned uložený
  const pocet = p.whoop.volani.length;
  p.volej('zdravi');
  assert.strictEqual(p.whoop.volani.length, pocet);
  p.nastavCas(Date.parse('2026-10-02T09:30:00Z'));
  o = p.volej('zdravi', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(JSON.parse(p.vlastnosti.get('WHOOP_TOKEN')).refresh_token, 'r2');
  assert.ok(p.whoop.volani.indexOf('/oauth/oauth2/token') >= 0);
  // WHOOP odvolal přístup → 401 → odpojeno, chyba v přehledu, uložená data zůstanou
  p.whoop.chyba401 = true;
  o = p.volej('zdravi', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.whoop.propojeno, /propoj znovu/.test(o.data.whoop.sync.chyba)], [false, true]);
  assert.ok(o.data.dny.some((x) => x.den === '2026-10-02' && x.whoop.pripravenost));
});

test('zdraví: zkratka Apple Zdraví – vlastní klíč, česká čísla a data, spánek přes půlnoc, data zůstanou vedle WHOOP', () => {
  const p = zdraviProstredi();
  assert.deepStrictEqual(p.volej('zdraviApple', { kroky: '2026-10-01T00:00:00+02:00=11 873' }, 'spatny'), { ok: false, chyba: 'klic' });
  assert.deepStrictEqual(p.volej('zdraviApple', { kroky: '…' }, KLIC), { ok: false, chyba: 'klic' }); // hlavní klíč tu neplatí
  const k = p.volej('zdraviKlic').data.klic;
  assert.ok(k && k.length >= 32);
  const o = p.volej('zdraviApple', {
    verze: '1',
    kroky: '2026-10-01T00:00:00+02:00=11\u00a0873;2026-10-02T00:00:00+02:00=512',
    energie: '1. 10. 2026=612,4', vzdalenost: '2026-10-01T00:00:00+02:00=8,47', vo2max: '2026-09-28T10:00:00+02:00=41,2',
    klidovy_tep: '2026-10-01T00:00:00+02:00=55', hrv: '2026-10-01T00:00:00+02:00=48,36',
    spanek: '2026-10-01T22:50:00+02:00|2026-10-01T23:40:00+02:00|Jádro;2026-10-01T23:40:00+02:00|2026-10-02T00:30:00+02:00|Hluboký;' +
      '2026-10-02T00:30:00+02:00|2026-10-02T00:40:00+02:00|Vzhůru;2026-10-02T00:40:00+02:00|2026-10-02T06:10:00+02:00|REM;' +
      '2026-10-01T22:40:00+02:00|2026-10-02T06:20:00+02:00|V posteli'
  }, k);
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.ulozeno, 3);
  const z = p.volej('zdravi').data;
  const den1 = z.dny.find((x) => x.den === '2026-10-01').apple;
  assert.deepStrictEqual([den1.kroky, den1.energie, den1.vzdalenost, den1.klidovyTep, den1.hrv], [11873, 612, 8.47, 55, 48.4]);
  const den2 = z.dny.find((x) => x.den === '2026-10-02').apple;
  assert.deepStrictEqual([den2.kroky, den2.spanek.celkem / 6e4, den2.spanek.hluboky / 6e4, den2.spanek.bdeni / 6e4], [512, 430, 50, 10]);
  assert.strictEqual(z.dny.find((x) => x.den === '2026-09-28').apple.vo2max, 41.2);
  assert.ok(z.apple.kdy > 0);
  // soubor na Disku: CLAUDE_SCHRANKA/ZDRAVI/2026-10.json (+ září kvůli VO2max)
  const zdravi = p.schranka.deti.ZDRAVI;
  assert.deepStrictEqual(zdravi.soubory.map((x) => x.getName()).sort(), ['2026-09.json', '2026-10.json']);
  // prázdná zpráva ze zkratky → srozumitelná chyba
  assert.ok(/žádná data/.test(p.volej('zdraviApple', { verze: '1' }, k).chyba));
});

// ---------------------------------------------------------------- upozornění do iPhonu (ntfy)

test('upozornění: bez tématu nic; hoří v poště jen počtem (bez jmen a předmětů) a jednou; ranní souhrn jednou denně', () => {
  const p = prostredi();
  p.chmu.cap = 'cap_rijen.xml';
  p.nastavCas(Date.parse('2026-10-02T07:30:00+02:00'));
  p.ctx.kazdouHodinu();
  assert.ok(!p.log.ntfy, 'bez NTFY_TEMA se nic neposílá');
  p.vlastnosti.set('NTFY_TEMA', 'asistent-test');
  // nepřečtená naléhavá zpráva od známého (trenérovi jsem psal)
  p.vlakna.v1 = p.vlakno('v1', [p.zprava({ id: 'm1', od: 'Trenér <trener@klub.test>', predmet: 'Hřiště', text: 'Urgentně: nefunguje osvětlení, ozvi se.', kdy: Date.parse('2026-10-02T07:00:00+02:00'), neprectena: true })], true);
  p.schranka.createFolder('CEKA').createFile('2026-10-01_090000_ab12.md', '---\nkdy: 2026-10-01T09:00:00+02:00\nstav: tvuj-ukol\n---\n\nZavolat.\n');
  p.ctx.kazdouHodinu();
  const zpravy = json(p.log.ntfy);
  const hori = zpravy.find((z) => /Hoří/.test(z.title));
  assert.ok(hori, JSON.stringify(zpravy));
  assert.strictEqual(hori.topic, 'asistent-test');
  assert.ok(/1 nová konverzace/.test(hori.message) && !/Trenér|Hřiště|osvětlení/.test(hori.title + hori.message), hori.message);
  const rano = zpravy.find((z) => z.title === 'Dobré ráno');
  assert.ok(rano && /1 ve schránce/.test(rano.message) && /°C/.test(rano.message), JSON.stringify(rano));
  // podruhé za hodinu nic nového
  const pocet = p.log.ntfy.length;
  p.nastavCas(Date.parse('2026-10-02T08:30:00+02:00'));
  p.ctx.kazdouHodinu();
  assert.strictEqual(p.log.ntfy.length, pocet);
});

// ---------------------------------------------------------------- počasí (ČHMÚ)

test('počasí: výstrahy pro ORP ze skutečného CAP (28. 6. 2026), řeka a předpovědi; přehled se drží v mezipaměti', () => {
  const p = prostredi();
  p.nastavCas(Date.parse('2026-06-28T09:20:00Z'));
  let o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  const d = o.data;
  assert.strictEqual(d.misto, 'Veselí nad Moravou');
  assert.deepStrictEqual(d.vystrahy.map((v) => v.nazev + '/' + v.uroven),
    ['Extrémně vysoké teploty/cervena', 'Nebezpečí požárů/zluta', 'Silné bouřky/zluta', 'Výhled nebezpečných jevů/vyhled']);
  assert.strictEqual(d.souhrn, 'Extrémně vysoké teploty, Nebezpečí požárů, Silné bouřky');
  const bourky = d.vystrahy[2];
  assert.strictEqual(bourky.od, Date.parse('2026-06-29T15:00:00+02:00'));
  assert.ok(bourky.celyKraj && !/http|tinyurl/i.test(bourky.text), bourky.text);
  assert.deepStrictEqual(d.reky.map((r) => [r.nazev, r.hladina, r.typ]), [['Morava – Strážnice', 82, 'hladina'], ['Morava – Spytihněv', 37, 'hladina']]);
  assert.deepStrictEqual(d.predpovedi.map((x) => x.den), ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
  assert.deepStrictEqual([d.predpovedi[1].ikona, d.predpovedi[1].tMax, d.predpovedi[1].uvod], ['slunce', [21, 24], 'Opět slunečné počasí']);
  assert.ok(!p.chmu.dotazy.some((x) => x.podminene), 'poprvé se stahuje celé');
  // podruhé z mezipaměti – žádné stahování
  const pocet = p.chmu.dotazy.length;
  assert.strictEqual(p.volej('pocasi').ok, true);
  assert.strictEqual(p.chmu.dotazy.length, pocet);
  // „Obnovit“: výstrahy a vodní stavy podmíněně (304, nic se nestahuje), předpovědi hodinu z mezipaměti
  o = p.volej('pocasi', { znovu: true });
  assert.deepStrictEqual(json(o.data.vystrahy), json(d.vystrahy));
  const nove = p.chmu.dotazy.slice(pocet);
  assert.strictEqual(nove.length, 4);
  assert.ok(nove.every((x) => x.podminene));
  assert.strictEqual(p.chmu.neukazano, 4);
});

test('počasí: bez výstrah „Žádné výstrahy ČHMÚ“, výpadek → záloha z archivu, chyba jednoho zdroje nesmaže zbytek', () => {
  let p = prostredi();
  p.chmu.cap = 'cap_rijen.xml';
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  let o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.souhrn, o.data.vystrahy.length], ['Žádné výstrahy ČHMÚ', 0]);
  assert.deepStrictEqual(o.data.predpovedi.map((x) => x.nazev), ['Předpověď na pátek', 'Předpověď na sobotu', 'Předpověď na neděli', 'Předpověď na pondělí']);
  assert.strictEqual(o.data.reky[0].maxPredpoved, 82); // modelová předpověď dorovnaná na měření
  // hlavní adresa výstrah nejde → nejnovější soubor z archivu opendata
  p = prostredi();
  p.chmu.chyby['XOCZ50'] = 503;
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.ok(!o.data.chyby, JSON.stringify(o.data.chyby));
  assert.ok(p.chmu.dotazy.some((x) => /alert_cap_50_021119\.xml$/.test(x.url)));
  // nejdou ani výstrahy, ani archiv → ostatní zůstane, přehled jen na 5 minut
  p = prostredi();
  p.chmu.chyby['XOCZ50'] = 503;
  p.chmu.chyby['/alerts/cap/'] = 500;
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  o = p.volej('pocasi');
  assert.deepStrictEqual(json(o.data.chyby), ['výstrahy (HTTP 503)']);
  assert.strictEqual(o.data.predpovedi.length, 4);
  assert.strictEqual(p.ttl.get('pocasi:prehled'), 300);
});

test('počasí: vlastní místo ve vlastnosti POCASI, chybný JSON nezastaví info', () => {
  const p = prostredi();
  p.vlastnosti.set('POCASI', JSON.stringify({ misto: 'Hodonín', orp: { '6206': 'Hodonín' }, stanice: [] }));
  p.nastavCas(Date.parse('2026-10-02T19:30:00Z'));
  let o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.deepStrictEqual([o.data.misto, o.data.reky.length], ['Hodonín', 0]);
  assert.strictEqual(p.volej('info').data.pocasi.misto, 'Hodonín');
  assert.ok(p.volej('info').data.akce.includes('pocasi'));
  p.vlastnosti.set('POCASI', '{nejson');
  o = p.volej('pocasi', { znovu: true });
  assert.deepStrictEqual(o, { ok: false, chyba: 'Vlastnost POCASI není platný JSON.' });
  o = p.volej('info');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.pocasi.misto, '');
});

test('počasí: povodeň z CAP (profil, vývoj) a hladina nad 2. SPA z měření', () => {
  const p = prostredi();
  p.chmu.cap = { text: `<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>TEST</identifier><sent>2026-10-02T10:00:00+02:00</sent><status>Actual</status><msgType>Update</msgType>
<info><language>cs</language><category>Met</category><event>Povodňová pohotovost</event><responseType>Prepare</responseType>
<urgency>Immediate</urgency><severity>Severe</severity><certainty>Observed</certainty>
<eventCode><valueName>HPPS</valueName><value>XI.2</value></eventCode><onset>2026-10-02T09:00:00+02:00</onset>
<description>Na dolní Moravě je dosaženo 2. SPA.</description>
<instruction>Lokálně se mohou vyskytnout rozlivy do níže položených míst. Nevstupovat do koryt toků a řídit se pokyny povodňových orgánů.</instruction>
<parameter><valueName>floodWarning</valueName><value>Morava, Strážnice, 610 cm, 360 m3s-1, rising</value></parameter>
<parameter><valueName>hydroOutlook</valueName><value>Kulminaci ve Strážnici očekáváme v noci na sobotu.</value></parameter>
<parameter><valueName>awareness_level</valueName><value>3; orange; Severe</value></parameter>
<area><areaDesc>Jihomoravský kraj (Hodonín, Veselí nad Moravou)</areaDesc><geocode><valueName>CISORP</valueName><value>6218</value></geocode></area></info>
<info><language>cs</language><category>Met</category><event>Silný vítr</event><responseType>AllClear</responseType><urgency>Past</urgency>
<severity>Moderate</severity><certainty>Likely</certainty><area><areaDesc>Jihomoravský kraj</areaDesc><geocode><valueName>CISORP</valueName><value>6218</value></geocode></area></info>
</alert>` };
  p.nastavCas(Date.parse('2026-10-02T10:00:00Z'));
  const o = p.volej('pocasi');
  assert.strictEqual(o.ok, true, o.chyba);
  assert.strictEqual(o.data.vystrahy.length, 1); // odvolaný vítr vynechán
  const v = o.data.vystrahy[0];
  assert.deepStrictEqual([v.typ, v.uroven, v.do, v.profily[0].stanice, v.profily[0].spa], ['povoden', 'oranzova', null, 'Strážnice', 2]);
  assert.strictEqual(v.text, 'Nevstupovat do koryt toků a řídit se pokyny povodňových orgánů.');
  assert.strictEqual(v.vyvoj, 'Kulminaci ve Strážnici očekáváme v noci na sobotu.');
  assert.strictEqual(o.data.souhrn, 'Povodňová pohotovost');
  // vodní stav nad 2. SPA (Strážnice 600 cm)
  const C = vm.runInContext('CHMU_', p.ctx);
  const meta = C.hydroMeta(fs.readFileSync(path.join(__dirname, 'chmu', 'meta1.json'), 'utf8'), ['0-203-1-421500']);
  const stanice = JSON.parse(fs.readFileSync(path.join(__dirname, 'chmu', '0-203-1-421500.json'), 'utf8'));
  stanice.objList[0].tsList.find((x) => x.tsConID === 'H').tsData.slice(-1)[0].value = 610;
  const r = json(C.reka(stanice, meta, Date.parse('2026-10-02T19:20:00Z')));
  assert.deepStrictEqual([r.typ, r.uroven, r.spa, r.stav], ['povoden', 'oranzova', 2, '2. SPA – pohotovost']);
  assert.deepStrictEqual(json(C.teploty('Nejnižší teploty −2 až −6 °C')), [-6, -2]);
});

test('nedělní přehled: události po dnech bez zápasů, zápasy týmů, úkoly s termínem, počasí – bez názvů', () => {
  const p = prostredi();
  const T = vm.runInContext('TYDEN_', p.ctx);
  const po = Date.parse('2026-10-05T00:00:00+02:00'); // pondělí
  const h = (den, hod) => po + den * 864e5 + hod * 36e5;
  const text = T.text({ od: po,
    udalosti: [{ nazev: 'Porada', zacatek: h(0, 8), konec: h(0, 9) }, { nazev: 'Zubař', zacatek: h(0, 14), konec: h(0, 15) },
      { nazev: 'Školení', zacatek: h(3, 10), konec: h(3, 12) }, { nazev: '⚽ Vnorovy – Šardice', zacatek: h(5, 15), konec: h(5, 17) },
      { nazev: 'Mimo týden', zacatek: h(8, 10), konec: h(8, 11) }],
    zapasy: [{ zacatek: h(5, 15), tym: 'A-tým', doma: false }, { zacatek: h(6, 12.25), tym: 'Dorost', doma: true }, { zacatek: h(-2, 10), tym: 'B-tým', doma: true }],
    terminy: ['2026-10-01', '2026-10-07', '2026-10-30'],
    predpovedi: [{ den: '2026-10-05', tMax: [17, 20], ikona: 'polojasno' }, { den: '2026-10-06', tMax: [14, 16], ikona: 'dest' }, { den: '2026-10-04', tMax: [20, 22], ikona: 'slunce' }],
    vystrahy: [] });
  assert.strictEqual(text, 'Kalendář: 3 (Po 2, Čt 1)\nZápasy: So 15:00 A-tým venku · Ne 12:15 Dorost doma\nÚkoly s termínem: 2 (po termínu 1)\nPočasí: Po 20 °C · Út 16 °C déšť');
  assert.ok(!/Porada|Zubař|Školení/.test(text), 'žádné názvy událostí přes cizí server');
});

test('docházka: souhrn akcí (přišlo, omluveno s komentářem, neomluveno, možná), jména bez textů omluv, jen v rozsahu', () => {
  const p = prostredi();
  const D = vm.runInContext('DOCHAZKA_', p.ctx);
  const data = { hraci: [{ id: '1', jmeno: 'Hráč A' }, { id: '2', jmeno: 'Hráč B' }, { id: '3', jmeno: 'Hráč C' }, { id: '4', jmeno: 'Hráč D' }, { id: '5', jmeno: 'Hráč E' }],
    udalosti: [{ id: 1, zacatek: '2026-10-01T17:30:00+02:00', nazev: 'ČT - DOROST', druh: 'T_CT', zruseno: false, venku: false,
      ucast: { 1: ['G', ''], 2: ['G', ''], 3: ['N', 'nemoc'], 4: ['N', ''], 5: ['M', ''] } },
    { id: 2, zacatek: '2026-06-01T17:30:00+02:00', druh: 'T_PO', ucast: { 1: ['G', ''] } }] };
  const s = json(D.souhrn(data, Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-10-05T00:00:00Z')));
  assert.strictEqual(s.udalosti.length, 1);
  const u = s.udalosti[0];
  assert.deepStrictEqual(u.pocty, { prislo: 2, omluveno: 1, neomluveno: 1, mozna: 1, bez: 0, pozvano: 5 });
  assert.deepStrictEqual([u.omluveni, u.neomluveni, u.druh], [['Hráč C'], ['Hráč D'], 'T_CT']);
  assert.ok(!/nemoc/.test(JSON.stringify(s)), 'texty omluv se nepředávají');
});

test('návrhy odpovědí: podklady pro Clauda na Disk, návrh u konverzace a v detailu, zahodit, vypnout', () => {
  const p = prostredi();
  let o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.ok, true, o.chyba);
  const ceka = o.data.osobni.find((v) => v.stav === 'ceka');
  assert.ok(ceka, 'vlákno čekající na odpověď');
  assert.ok(!('_odpoved' in ceka), 'podklad nejde do aplikace');
  const podklad = () => p.schranka.soubory.find((f) => f.getName() === 'POSTA_K_ODPOVEDI.json' && !f.vKosi);
  assert.ok(podklad(), 'podklady zapsané');
  const data = JSON.parse(podklad().getBlob().getDataAsString());
  const v = data.vlakna.find((x) => x.id === ceka.id);
  assert.ok(v && v.zpravaId && v.text && v.ucet === 'osobni', 'vlákno v podkladech: ' + JSON.stringify(data.vlakna));
  const zapisu = p.log.soubory.filter((x) => x.n === 'POSTA_K_ODPOVEDI.json').length;
  p.volej('posta', { znovu: true });
  assert.strictEqual(p.log.soubory.filter((x) => x.n === 'POSTA_K_ODPOVEDI.json').length, zapisu, 'beze změny se nezapisuje znovu');
  // Claude napsal návrh → značka v seznamu, text v detailu
  p.schranka.deti.ODPOVEDI.createFile(ceka.id + '.json', JSON.stringify({ vlakno: ceka.id, zpravaId: v.zpravaId, text: 'Ahoj, beru to.', kdy: '2026-10-03T08:00:00+02:00' }));
  o = p.volej('posta', { znovu: true });
  assert.strictEqual(o.data.osobni.find((x) => x.id === ceka.id).navrh, true);
  const vl = p.volej('vlakno', { id: ceka.id, precist: false });
  assert.strictEqual(vl.data.navrhOdpovedi && vl.data.navrhOdpovedi.text, 'Ahoj, beru to.');
  // návrh k jiné (starší) zprávě se neukáže
  p.schranka.deti.ODPOVEDI.soubory[0].setContent(JSON.stringify({ zpravaId: 'jina', text: 'staré' }));
  assert.ok(!p.volej('vlakno', { id: ceka.id, precist: false }).data.navrhOdpovedi, 'návrh k jiné zprávě');
  assert.strictEqual(p.volej('navrhZahodit', { id: ceka.id }).data.smazano, 1);
  assert.strictEqual(p.volej('navrhZahodit', { id: '../x' }).ok, false);
  // vypnuto → prázdné podklady, info ví o nastavení
  assert.strictEqual(p.volej('navrhyNastavit', { rezim: 'vypnuto' }).data.navrhyOdpovedi, 'vypnuto');
  p.volej('posta', { znovu: true });
  assert.strictEqual(JSON.parse(podklad().getBlob().getDataAsString()).vlakna.length, 0);
  assert.strictEqual(p.volej('navrhyNastavit', { rezim: 'nesmysl' }).ok, false);
});

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
