// Test Cesťáků – čisté funkce js/cestaky_vypocet.js (vzorec, výběr, souhrn, úpravy jako motor). Data vymyšlená.
// Spuštění: node testy/test_cestaky.mjs
import assert from 'node:assert';
const C = await import('../js/cestaky_vypocet.js');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}

const DATA = {
  obdobi: [{ id: 'p1', nazev: 'Podzim 2030', kratce: 'Podz. 30' }, { id: 'j1', nazev: 'Jaro 2031', kratce: 'Jaro 31' }],
  tymy: [{ id: 'A', nazev: 'Áčko', kratce: 'A' }, { id: 'D', nazev: 'Dorost', kratce: 'Dor' }],
  vychozi: { sazba: 2, auta: 3, pohary: false },
  nastaveni: { sazba: 2, auta: 3, pohary: false },
  upravy: {},
  zapasy: [
    { id: 'D-2030-09-01', tym: 'D', obdobi: 'p1', datum: '2030-09-01', souper: 'Soupeř A', hriste: 'Obec A', km: 10 },
    { id: 'A-2030-09-08', tym: 'A', obdobi: 'p1', datum: '2030-09-08', souper: 'Soupeř B', hriste: 'Obec B', km: 20 },
    { id: 'A-2030-08-25', tym: 'A', obdobi: 'p1', datum: '2030-08-25', souper: 'Soupeř C', hriste: 'Obec C', km: 30, bus: true },
    { id: 'A-2030-07-30-pohar', tym: 'A', obdobi: 'p1', datum: '2030-07-30', souper: 'Soupeř D (pohár)', hriste: 'Obec D', km: 5, pohar: true },
    { id: 'D-2031-04-04', tym: 'D', obdobi: 'j1', datum: '2031-04-04', souper: 'Soupeř E', hriste: 'Obec E', km: 15 }
  ]
};
const s = (o) => JSON.parse(JSON.stringify(o));

console.log('Cesťáky');

test('vzorec: auto = km × 2 × auta × sazba, bus = jen cena busu; úprava přepíše bus, auta, km', () => {
  const z = DATA.zapasy[1];
  let r = C.zapasSUpravou(z, null, DATA.nastaveni);
  assert.deepStrictEqual([r.bus, r.auta, r.km, r.autaKm, r.castka, r.upraveno], [false, 3, 20, 120, 240, false]);
  r = C.zapasSUpravou(z, { auta: 5, km: 22 }, DATA.nastaveni);
  assert.deepStrictEqual([r.auta, r.km, r.autaKm, r.castka, r.upraveno], [5, 22, 220, 440, true]);
  r = C.zapasSUpravou(z, { bus: true, busKc: 1500 }, DATA.nastaveni);
  assert.deepStrictEqual([r.bus, r.autaKm, r.castka], [true, 0, 1500]);
  r = C.zapasSUpravou(DATA.zapasy[2], null, DATA.nastaveni);
  assert.deepStrictEqual([r.bus, r.castka], [true, 0], 'bus z výchozího stavu bez ceny = 0');
  r = C.zapasSUpravou(DATA.zapasy[2], { bus: false }, DATA.nastaveni);
  assert.strictEqual(r.castka, 30 * 2 * 3 * 2, 'bus vypnutý = auta');
});

test('výběr: poháry jen se zapnutým nastavením, filtr týmu', () => {
  assert.strictEqual(C.vybrane(DATA, { tym: 'vse' }).length, 4);
  assert.deepStrictEqual(C.vybrane(DATA, { tym: 'A' }).map((z) => z.id), ['A-2030-09-08', 'A-2030-08-25']);
  assert.strictEqual(C.vybrane(Object.assign({}, DATA, { nastaveni: { sazba: 2, auta: 3, pohary: true } }), { tym: 'A' }).length, 3);
  assert.strictEqual(C.vybrane(DATA).length, 4, 'bez voleb = oba týmy');
});

test('souhrn: dlaždice, tabulka týmy × období s řádkem Celkem jen u obou týmů, období seřazená tým → datum, prázdné období pryč', () => {
  const d = s(DATA);
  d.upravy = { 'D-2030-09-01': { auta: 4 }, 'A-2030-08-25': { busKc: 1000 } };
  const r = C.souhrn(d, { tym: 'vse' });
  // D-09-01: 10×2×4×2 = 160; A-09-08: 20×2×3×2 = 240; A-08-25 bus 1000; D-04-04: 15×2×3×2 = 180
  assert.deepStrictEqual([r.celkem, r.pocet, r.km, r.busem], [1580, 4, 80 + 120 + 90, 1]);
  assert.deepStrictEqual(r.tabulka.radky.map((x) => [x.id, x.obdobi, x.celkem]), [['A', [1240, 0], 1240], ['D', [160, 180], 340]]);
  assert.deepStrictEqual(r.tabulka.celkem, { obdobi: [1400, 180], celkem: 1580 });
  assert.deepStrictEqual(r.obdobi.map((o) => [o.id, o.castka, o.zapasy.map((z) => z.id)]),
    [['p1', 1400, ['A-2030-08-25', 'A-2030-09-08', 'D-2030-09-01']], ['j1', 180, ['D-2031-04-04']]]);
  const a = C.souhrn(d, { tym: 'A' });
  assert.deepStrictEqual([a.pocet, a.tabulka.radky.length, a.tabulka.celkem, a.obdobi.map((o) => o.id)], [2, 1, null, ['p1']]);
});

test('úpravy: meze a čištění hodnot (česká čárka, zaokrouhlení), chyby česky', () => {
  assert.strictEqual(C.zkontroluj('sazba', '4,555'), 4.56);
  assert.strictEqual(C.zkontroluj('km', 12.4), 12);
  assert.strictEqual(C.zkontroluj('busKc', '2 500'), 2500);
  assert.strictEqual(C.zkontroluj('auta', 0), 0);
  for (const [k, v] of [['sazba', 51], ['sazba', ''], ['auta', 2.5], ['auta', 21], ['km', -1], ['km', 2001], ['busKc', 200001], ['bus', 'ano'], ['pohary', 1], ['km', null]]) {
    assert.throws(() => C.zkontroluj(k, v), /musí|ano/, k + ' = ' + v);
  }
});

test('úpravy: co se shoduje s výchozím, se neukládá; null = zrušit; neznámý zápas = chyba', () => {
  let r = C.pouzij(DATA, { zapas: { id: 'A-2030-09-08', zmeny: { auta: 4 } } });
  assert.deepStrictEqual(r.upravy, { 'A-2030-09-08': { auta: 4 } });
  r = C.pouzij(Object.assign({}, DATA, r), { zapas: { id: 'A-2030-09-08', zmeny: { auta: 3, km: 20, bus: false, busKc: 0 } } });
  assert.deepStrictEqual(r.upravy, {}, 'zpět na výchozí = žádná úprava');
  r = C.pouzij(DATA, { zapas: { id: 'A-2030-08-25', zmeny: { bus: false } } });
  assert.deepStrictEqual(r.upravy, { 'A-2030-08-25': { bus: false } }, 'vypnutý bus u busového zápasu je úprava');
  r = C.pouzij(Object.assign({}, DATA, r), { zapas: { id: 'A-2030-08-25', zmeny: { bus: null } } });
  assert.deepStrictEqual(r.upravy, {});
  assert.throws(() => C.pouzij(DATA, { zapas: { id: 'X-1', zmeny: { km: 3 } } }), /není/);
  assert.throws(() => C.pouzij(DATA, { zapas: { id: 'A-2030-09-08', zmeny: { km: 5000 } } }), /Km/);
});

test('nastavení: změna výchozího počtu aut zruší úpravy s právě tím počtem; null = výchozí; Vrátit vše', () => {
  const d = s(DATA);
  d.upravy = { 'A-2030-09-08': { auta: 5 }, 'D-2030-09-01': { auta: 5, km: 11 }, 'D-2031-04-04': { auta: 2 } };
  let r = C.pouzij(d, { nastaveni: { auta: 5, sazba: '2,5' } });
  assert.deepStrictEqual(r.nastaveni, { sazba: 2.5, auta: 5, pohary: false });
  assert.deepStrictEqual(r.upravy, { 'D-2030-09-01': { km: 11 }, 'D-2031-04-04': { auta: 2 } });
  r = C.pouzij(Object.assign({}, d, r), { nastaveni: { sazba: null, pohary: true } });
  assert.deepStrictEqual(r.nastaveni, { sazba: 2, auta: 5, pohary: true });
  r = C.pouzij(Object.assign({}, d, r), { vratitVse: true });
  assert.deepStrictEqual(r, { nastaveni: { sazba: 2, auta: 3, pohary: false }, upravy: {} });
  assert.deepStrictEqual(d.upravy['A-2030-09-08'], { auta: 5 }, 'vstup se nemění');
});

test('formát: Kč s mezerou po tisících, datum bez roku i s rokem', () => {
  assert.strictEqual(C.kc(12345.6).replace(/\s/g, ' '), '12 346 Kč');
  assert.strictEqual(C.den('2030-09-01'), '1. 9.');
  assert.strictEqual(C.den('2030-09-01', true), '1. 9. 2030');
});

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
