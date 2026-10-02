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
  const log = { odeslano: [], precteno: [], stazeno: 0 };

  const zprava = (o) => ({
    getId: () => o.id, getFrom: () => o.od, getTo: () => o.komu || JA, getCc: () => o.kopie || '',
    getHeader: (h) => (h === 'Message-ID' ? '<' + o.id + '@mail.test>' : h === 'Delivered-To' ? (o.dorucenoNa || '') : ''),
    getPlainBody: () => o.text, getBody: () => '<p>' + o.text + '</p>', getDate: () => new Date(o.kdy),
    getSubject: () => o.predmet, isInTrash: () => false, isDraft: () => false, isUnread: () => !!o.neprectena,
    getAttachments: () => (o.priloha ? [{ getName: () => 'nabidka.pdf', getSize: () => 12345 }] : []),
    reply: (t, m) => log.odeslano.push({ jak: 'reply', id: o.id, t, m }),
    replyAll: (t, m) => log.odeslano.push({ jak: 'replyAll', id: o.id, t, m }),
    forward: (komu, m) => log.odeslano.push({ jak: 'forward', id: o.id, komu, m })
  });
  const vlakno = (id, zpravy, neprectene) => ({
    getId: () => id, getFirstMessageSubject: () => zpravy[0].getSubject(), getLastMessageDate: () => zpravy[zpravy.length - 1].getDate(),
    isUnread: () => neprectene, isImportant: () => false, hasStarredMessages: () => false, getMessageCount: () => zpravy.length,
    getMessages: () => zpravy, isInInbox: () => true,
    markRead: () => log.precteno.push(id), markUnread: () => {}, moveToArchive: () => {}, moveToInbox: () => {}
  });
  const ted = Date.UTC(2026, 9, 2, 15);
  const m1 = zprava({ id: 'm1', od: 'Trenér <trener@klub.test>', predmet: 'Sraz v sobotu', text: 'Ahoj, sraz v 8:30.', kdy: ted - 36e5, neprectena: true });
  const m2 = zprava({ id: 'm2', od: 'Investor <info@stavba.test>', komu: PRAC, predmet: 'Předávací protokol', text: 'Posílám protokol.', kdy: ted - 2 * 36e5, priloha: true });
  const m3 = zprava({ id: 'm3', od: 'Já <' + PRAC + '>', komu: 'info@stavba.test', predmet: 'Re: Předávací protokol', text: 'Děkuji.', kdy: ted - 36e5 });
  const vlakna = { v1: vlakno('v1', [m1], true), v2: vlakno('v2', [m2, m3], false) };
  let aliasy = [];

  const zpravy = { m1, m2, m3 };
  let aktualizace = []; // vlákna v kategorii Aktualizace (oznámení)
  const GmailApp = {
    search: (q) => {
      log.dotazy = (log.dotazy || []).concat(q);
      // „rfc822msgid:<id> {to:… }“ = šla tahle zpráva na pracovní adresu?
      const m = /rfc822msgid:(\S+)@mail\.test/.exec(q);
      if (m) return zpravy[m[1]] && zpravy[m[1]].getTo() === PRAC && q.indexOf('{to:' + PRAC) >= 0 ? [vlakna.v2] : [];
      if (q.indexOf('category:updates') >= 0) return aktualizace;
      return q.indexOf('{to:') >= 0 ? [vlakna.v2] : [vlakna.v1];
    },
    moveThreadToSpam: (v) => { log.spam = v.getId(); },
    getMessagesForThreads: (v) => v.map((x) => x.getMessages()),
    getThreadById: (id) => vlakna[id] || null,
    getMessageById: (id) => ({ m1, m2, m3 })[id] || null,
    getAliases: () => aliasy,
    getInboxUnreadCount: () => 1,
    sendEmail: (komu, predmet, text, m) => log.odeslano.push({ jak: 'send', komu, predmet, t: text, m })
  };

  const udalostG = (nazev, z, k, celodenni) => ({
    getId: () => 'g-' + nazev, getTitle: () => nazev, isAllDayEvent: () => !!celodenni,
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
        pripomenuti: null, barva: '', stitky: {}, rada: rada || null, smazano: false, id: 'ev-' + (udalosti.length + 1) + '@google.com' };
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
        deleteEvent: () => { u.smazano = true; }, getEventSeries: () => ({ deleteEventSeries: () => { u.smazano = true; u.celaRada = true; } })
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
  const slozka = (nazev, rodic) => {
    const s = { nazev, rodic, deti: {}, soubory: [] };
    s.getId = () => 'slozka-' + nazev; s.getName = () => nazev;
    s.getFoldersByName = (n) => { const x = s.deti[n]; let hotovo = !x; return { hasNext: () => !hotovo, next: () => { hotovo = true; return x; } }; };
    s.createFolder = (n) => (s.deti[n] = slozka(n, s));
    s.createFile = (n, obsah) => {
      const f = { getId: () => 'soubor-' + n, getName: () => n, getBlob: () => ({ getDataAsString: () => obsah }),
        getDateCreated: () => new Date(), getLastUpdated: () => new Date(), getParents: () => { let h = false; return { hasNext: () => !h, next: () => { h = true; return s; } }; } };
      s.soubory.push(f); log.soubory = (log.soubory || []).concat({ slozka: nazev, n, obsah });
      return f;
    };
    return s;
  };
  const schranka = slozka('CLAUDE_SCHRANKA', null);
  vlastnosti.set('SLOZKA_ID', 'slozka-CLAUDE_SCHRANKA');

  const sandbox = {
    DriveApp: { getFolderById: (id) => { if (id !== 'slozka-CLAUDE_SCHRANKA') throw new Error('nenalezeno'); return schranka; } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (vlastnosti.has(k) ? vlastnosti.get(k) : null),
      setProperty: (k, v) => vlastnosti.set(k, String(v)), deleteProperty: (k) => vlastnosti.delete(k)
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => cache.set(k, String(v)),
      getAll: (ks) => Object.fromEntries(ks.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])),
      putAll: (o) => Object.entries(o).forEach(([k, v]) => { assert.ok(v.length <= 100000); cache.set(k, v); }),
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
    UrlFetchApp: { fetch: (url) => {
      log.stazeno++;
      return { getResponseCode: () => (url.indexOf('chyba') >= 0 ? 404 : 200), getContentText: () => (url.indexOf('rozpis') >= 0 ? rozpis : ICS) };
    } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log() {} },
    Intl
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Kod.gs'), 'utf8'), ctx);
  const surovy = (contents) => JSON.parse(ctx.doPost({ postData: { contents } }).text);
  const volej = (akce, data = {}, klic = KLIC) => surovy(JSON.stringify({ klic, akce, ...data }));
  // záznamy z izolovaného prostředí převést na běžné objekty (jinak je deepStrictEqual odmítne)
  const posledniOdeslano = () => JSON.parse(JSON.stringify(log.odeslano.pop()));
  return { volej, surovy, vlastnosti, cache, log, posledniOdeslano, ctx, zprava, vlakno, vlakna, kalendare,
    nastavAliasy: (a) => { aliasy = a; }, nastavAktualizace: (a) => { aktualizace = a; }, nastavRozpis: (t) => { rozpis = t; } };
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

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
