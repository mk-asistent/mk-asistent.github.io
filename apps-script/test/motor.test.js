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
  const GmailApp = {
    search: (q) => {
      // „rfc822msgid:<id> {to:… }“ = šla tahle zpráva na pracovní adresu?
      const m = /rfc822msgid:(\S+)@mail\.test/.exec(q);
      if (m) return zpravy[m[1]] && zpravy[m[1]].getTo() === PRAC && q.indexOf('{to:' + PRAC) >= 0 ? [vlakna.v2] : [];
      return q.indexOf('{to:') >= 0 ? [vlakna.v2] : [vlakna.v1];
    },
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
    { isHidden: () => false, isSelected: () => true, getColor: () => '#9fe1e7', getName: () => 'Osobní', getId: () => 'osobni@gmail.test',
      getEvents: () => [udalostG('Zubař', Date.UTC(2026, 9, 6, 7), Date.UTC(2026, 9, 6, 8))] },
    { isHidden: () => false, isSelected: () => false, getColor: () => '#000', getName: () => 'Nevybraný', getId: () => 'x', getEvents: () => { throw new Error('nemá se volat'); } }
  ];
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

  const sandbox = {
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
      getUuid: () => crypto.randomUUID(), formatDate,
      newBlob: (s) => ({ getBytes: () => Buffer.from(String(s), 'utf8') }),
      DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => Array.from(crypto.createHash('md5').update(text, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b))
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => JA }) },
    GmailApp,
    CalendarApp: { getAllCalendars: () => kalendare, getDefaultCalendar: () => kalendare[0] },
    UrlFetchApp: { fetch: (url) => { log.stazeno++; return { getResponseCode: () => (url.indexOf('chyba') >= 0 ? 404 : 200), getContentText: () => ICS }; } },
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
  return { volej, surovy, vlastnosti, cache, log, posledniOdeslano, nastavAliasy: (a) => { aliasy = a; } };
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

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
