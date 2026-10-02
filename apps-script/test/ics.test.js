// Testy čtení kalendáře .ics z motoru (apps-script/Kod.gs) – spouští se v Node:  node apps-script/test/ics.test.js
// Kod.gs se načte do izolovaného prostředí bez služeb Googlu; časové zóny počítá Intl (v Apps Scriptu Utilities).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const kod = fs.readFileSync(path.join(__dirname, '..', 'Kod.gs'), 'utf8');
const ctx = vm.createContext({ Intl, Date, Math, JSON, Number, String, Object, Array, isNaN, Infinity });
vm.runInContext(kod, ctx);

const Z = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi); // čas v UTC
const ics = (...udalosti) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Domov', ...udalosti.flat(), 'END:VCALENDAR'].join('\r\n');
// JSON tam a zpět: pole z izolovaného prostředí mají jiný prototyp a deepStrictEqual by je odmítl
const rozbal = (text, od, doDne) => JSON.parse(JSON.stringify(ctx.rozbalIcs_(text, od, doDne)))
  .sort((a, b) => a.zacatek - b.zacatek);

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); }
  catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('ICS – čtení kalendáře z iPhonu');

test('jednorázová událost v pražském čase (léto, CEST = UTC+2)', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:a1', 'SUMMARY:Porada', 'DTSTART;TZID=Europe/Prague:20261005T080000',
    'DTEND;TZID=Europe/Prague:20261005T093000', 'LOCATION:Kancelář', 'END:VEVENT']), Z(2026, 10, 1), Z(2026, 11, 1));
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].zacatek, Z(2026, 10, 5, 6, 0));
  assert.strictEqual(v[0].konec, Z(2026, 10, 5, 7, 30));
  assert.strictEqual(v[0].nazev, 'Porada');
  assert.strictEqual(v[0].misto, 'Kancelář');
  assert.strictEqual(v[0].celodenni, false);
});

test('celodenní událost = půlnoc až půlnoc v Praze', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:a2', 'SUMMARY:Výlet', 'DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261012', 'END:VEVENT']),
    Z(2026, 10, 1), Z(2026, 11, 1));
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].celodenni, true);
  assert.strictEqual(v[0].zacatek, Z(2026, 10, 9, 22)); // 10. 10. 00:00 CEST
  assert.strictEqual(v[0].konec, Z(2026, 10, 11, 22)); // 12. 10. 00:00 CEST (dva dny)
});

test('týdně po + st, 6×, přes konec letního času drží 17:00 místního času', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:t1', 'SUMMARY:Trénink', 'DTSTART;TZID=Europe/Prague:20261019T170000',
    'DTEND;TZID=Europe/Prague:20261019T183000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', 'END:VEVENT']), Z(2026, 10, 1), Z(2026, 12, 1));
  assert.deepStrictEqual(v.map(x => new Date(x.zacatek).toISOString()), [
    '2026-10-19T15:00:00.000Z', '2026-10-21T15:00:00.000Z', // CEST
    '2026-10-26T16:00:00.000Z', '2026-10-28T16:00:00.000Z', // po 25. 10. CET
    '2026-11-02T16:00:00.000Z', '2026-11-04T16:00:00.000Z'
  ]);
  assert.ok(v.every(x => x.konec - x.zacatek === 90 * 6e4));
});

test('rozsah uprostřed opakování vrátí jen výskyty v rozsahu (COUNT se počítá od začátku)', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:t2', 'SUMMARY:Kurz', 'DTSTART;TZID=Europe/Prague:20260901T180000',
    'DTEND;TZID=Europe/Prague:20260901T190000', 'RRULE:FREQ=WEEKLY;COUNT=10', 'END:VEVENT']), Z(2026, 10, 1), Z(2026, 11, 1));
  // 1. 9. + 9 dalších úterků → poslední 3. 11.; v říjnu 6., 13., 20., 27.
  assert.deepStrictEqual(v.map(x => new Date(x.zacatek).getUTCDate()), [6, 13, 20, 27]);
});

test('každý poslední pátek v měsíci (BYDAY=-1FR)', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:m1', 'SUMMARY:Uzávěrka', 'DTSTART;TZID=Europe/Prague:20260130T100000',
    'DTEND;TZID=Europe/Prague:20260130T110000', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR', 'END:VEVENT']), Z(2026, 9, 1), Z(2026, 12, 1));
  assert.deepStrictEqual(v.map(x => new Date(x.zacatek).toISOString().slice(0, 10)), ['2026-09-25', '2026-10-30', '2026-11-27']);
});

test('31. v měsíci přeskočí kratší měsíce', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:m2', 'SUMMARY:Zálohy', 'DTSTART;VALUE=DATE:20260131',
    'RRULE:FREQ=MONTHLY;BYMONTHDAY=31', 'END:VEVENT']), Z(2026, 8, 1), Z(2027, 1, 15));
  assert.deepStrictEqual(v.map(x => new Date(x.zacatek + 4 * 36e5).toISOString().slice(0, 10)),
    ['2026-08-31', '2026-10-31', '2026-12-31']);
});

test('narozeniny každý rok od 1990 (celodenní) a 29. 2. jen v přestupném roce', () => {
  const v = rozbal(ics(
    ['BEGIN:VEVENT', 'UID:y1', 'SUMMARY:Narozeniny', 'DTSTART;VALUE=DATE:19901014', 'DTEND;VALUE=DATE:19901015', 'RRULE:FREQ=YEARLY', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:y2', 'SUMMARY:Přestupný', 'DTSTART;VALUE=DATE:20240229', 'RRULE:FREQ=YEARLY', 'END:VEVENT']
  ), Z(2026, 1, 1), Z(2028, 12, 31));
  const n = v.filter(x => x.nazev === 'Narozeniny').map(x => new Date(x.zacatek + 4 * 36e5).toISOString().slice(0, 10));
  assert.deepStrictEqual(n, ['2026-10-14', '2027-10-14', '2028-10-14']);
  const p = v.filter(x => x.nazev === 'Přestupný').map(x => new Date(x.zacatek + 4 * 36e5).toISOString().slice(0, 10));
  assert.deepStrictEqual(p, ['2028-02-29']);
});

test('EXDATE vynechá výskyt, RECURRENCE-ID ho přesune, CANCELLED ho zruší', () => {
  const v = rozbal(ics(
    ['BEGIN:VEVENT', 'UID:x1', 'SUMMARY:Jóga', 'DTSTART;TZID=Europe/Prague:20261006T190000', 'DTEND;TZID=Europe/Prague:20261006T200000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE;TZID=Europe/Prague:20261013T190000', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:x1', 'SUMMARY:Jóga (přesunuto)', 'RECURRENCE-ID;TZID=Europe/Prague:20261020T190000',
      'DTSTART;TZID=Europe/Prague:20261021T180000', 'DTEND;TZID=Europe/Prague:20261021T190000', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:x1', 'SUMMARY:Jóga', 'RECURRENCE-ID;TZID=Europe/Prague:20261027T190000', 'STATUS:CANCELLED',
      'DTSTART;TZID=Europe/Prague:20261027T190000', 'DTEND;TZID=Europe/Prague:20261027T200000', 'END:VEVENT']
  ), Z(2026, 10, 1), Z(2026, 11, 8));
  assert.deepStrictEqual(v.map(x => new Date(x.zacatek).toISOString().slice(0, 16) + ' ' + x.nazev), [
    '2026-10-06T17:00 Jóga', '2026-10-21T16:00 Jóga (přesunuto)', '2026-11-03T18:00 Jóga'
  ]);
});

test('UNTIL v UTC a denně ob den (INTERVAL=2) od roku 2015', () => {
  const v = rozbal(ics(
    ['BEGIN:VEVENT', 'UID:d1', 'SUMMARY:Kurz', 'DTSTART;TZID=Europe/Prague:20261001T070000', 'DTEND;TZID=Europe/Prague:20261001T073000',
      'RRULE:FREQ=DAILY;UNTIL=20261005T050000Z', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:d2', 'SUMMARY:Zalít', 'DTSTART;VALUE=DATE:20150101', 'RRULE:FREQ=DAILY;INTERVAL=2', 'END:VEVENT']
  ), Z(2026, 9, 30, 22), Z(2026, 10, 6, 22)); // 1.–6. 10. podle Prahy
  const kurz = v.filter(x => x.nazev === 'Kurz').map(x => new Date(x.zacatek).getUTCDate());
  assert.deepStrictEqual(kurz, [1, 2, 3, 4, 5]);
  const zalit = v.filter(x => x.nazev === 'Zalít').map(x => new Date(x.zacatek + 4 * 36e5).getUTCDate());
  // 1. 1. 2015 + n·2 dny: 2026-10-01 je den 4291 od startu (liché) → zalévá se 2., 4., 6. 10.
  assert.deepStrictEqual(zalit, [2, 4, 6]);
});

test('zalomené řádky, escapované znaky, VALARM uvnitř a plovoucí čas', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:f1', 'SUMMARY:Schůzka\\, důležitá', 'DESCRIPTION:První řádek\\nDruhý ',
    ' pokračuje', 'DTSTART:20261008T140000', 'DURATION:PT45M', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'DESCRIPTION:Připomínka',
    'END:VALARM', 'END:VEVENT']), Z(2026, 10, 1), Z(2026, 11, 1));
  assert.strictEqual(v.length, 1);
  assert.strictEqual(v[0].nazev, 'Schůzka, důležitá');
  assert.strictEqual(v[0].popis, 'První řádek\nDruhý pokračuje');
  assert.strictEqual(v[0].zacatek, Z(2026, 10, 8, 12)); // plovoucí čas = Praha
  assert.strictEqual(v[0].konec - v[0].zacatek, 45 * 6e4);
});

test('zóna z Outlooku („Central Europe Standard Time“) a UTC čas se Z', () => {
  const v = rozbal(ics(
    ['BEGIN:VEVENT', 'UID:o1', 'SUMMARY:Pozvánka', 'DTSTART;TZID=Central Europe Standard Time:20261203T090000',
      'DTEND;TZID=Central Europe Standard Time:20261203T100000', 'END:VEVENT'],
    ['BEGIN:VEVENT', 'UID:o2', 'SUMMARY:Hovor', 'DTSTART:20261203T120000Z', 'DTEND:20261203T123000Z', 'END:VEVENT']
  ), Z(2026, 12, 1), Z(2026, 12, 31));
  assert.strictEqual(v[0].zacatek, Z(2026, 12, 3, 8)); // zima CET = UTC+1
  assert.strictEqual(v[1].zacatek, Z(2026, 12, 3, 12));
});

test('vícedenní celodenní událost zasahující do rozsahu zleva se ukáže', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:v1', 'SUMMARY:Dovolená', 'DTSTART;VALUE=DATE:20260928', 'DTEND;VALUE=DATE:20261004', 'END:VEVENT']),
    Z(2026, 9, 30, 22), Z(2026, 10, 31, 23));
  assert.strictEqual(v.length, 1);
});

test('druhá neděle v květnu (YEARLY + BYMONTH + BYDAY=2SU)', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:y3', 'SUMMARY:Den matek', 'DTSTART;VALUE=DATE:20200510',
    'RRULE:FREQ=YEARLY;BYMONTH=5;BYDAY=2SU', 'END:VEVENT']), Z(2026, 1, 1), Z(2028, 1, 1));
  assert.deepStrictEqual(v.map(x => new Date(x.zacatek + 4 * 36e5).toISOString().slice(0, 10)), ['2026-05-10', '2027-05-09']);
});

test('týdně každé 2 týdny (INTERVAL=2) a COUNT', () => {
  const v = rozbal(ics(['BEGIN:VEVENT', 'UID:w2', 'SUMMARY:Úklid', 'DTSTART;TZID=Europe/Prague:20261003T090000',
    'DTEND;TZID=Europe/Prague:20261003T100000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3', 'END:VEVENT']), Z(2026, 9, 1), Z(2027, 1, 1));
  assert.deepStrictEqual(v.map(x => new Date(x.zacatek + 4 * 36e5).toISOString().slice(0, 10)), ['2026-10-03', '2026-10-17', '2026-10-31']);
});

test('rychlost: 300 opakovaných událostí na 6 týdnů do 1,5 s', () => {
  const ud = [];
  for (let i = 0; i < 300; i++) {
    ud.push(['BEGIN:VEVENT', 'UID:p' + i, 'SUMMARY:Opak ' + i, 'DTSTART;TZID=Europe/Prague:2012' + String(1 + (i % 12)).padStart(2, '0') + '05T080000',
      'DTEND;TZID=Europe/Prague:2012' + String(1 + (i % 12)).padStart(2, '0') + '05T090000',
      'RRULE:FREQ=' + ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'][i % 4], 'END:VEVENT']);
  }
  const t0 = Date.now();
  const v = rozbal(ics(...ud), Z(2026, 9, 28), Z(2026, 11, 9));
  const ms = Date.now() - t0;
  assert.ok(v.length > 1000, 'výskytů: ' + v.length);
  assert.ok(ms < 1500, 'trvalo ' + ms + ' ms');
});

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
