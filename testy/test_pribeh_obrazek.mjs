// Test rozvržení fotky do příběhu 1080 × 1920 (čisté funkce js/pribeh_obrazek.js) – node testy/test_pribeh_obrazek.mjs
import assert from 'node:assert';
const O = await import('../js/pribeh_obrazek.js');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('Příběh z fotky – rozvržení');

test('fotka 9:16 (do 3 %) vyplní celé plátno, přesah se ořízne rovnoměrně; vyšší snímek obrazovky iPhonu se neořízne', () => {
  const r = O.rozvrzeni(1080, 1920);
  assert.deepStrictEqual([r.plne, r.popredi], [true, { x: 0, y: 0, w: 1080, h: 1920 }]);
  const t = O.rozvrzeni(1440, 2600); // o 1,5 % vyšší než 9:16
  assert.strictEqual(t.plne, true);
  assert.deepStrictEqual([t.popredi.w, t.popredi.x, t.popredi.y < 0, t.popredi.y + t.popredi.h > 1920], [1080, 0, true, true]);
  const i = O.rozvrzeni(1179, 2556); // snímek obrazovky iPhonu 19,5 : 9 – celý, po stranách rozmazané pozadí
  assert.deepStrictEqual([i.plne, i.popredi.h, i.popredi.y, i.popredi.x > 0], [false, 1920, 0, true]);
});

test('fotka na šířku (4:3) a čtverec: celá uprostřed, pozadí přes celé plátno (rozmaže se)', () => {
  const r = O.rozvrzeni(4032, 3024);
  assert.strictEqual(r.plne, false);
  assert.deepStrictEqual(r.popredi, { x: 0, y: 555, w: 1080, h: 810 });
  assert.ok(r.pozadi.h === 1920 && r.pozadi.w >= 1080 && r.pozadi.x <= 0, JSON.stringify(r.pozadi));
  const c = O.rozvrzeni(1000, 1000);
  assert.deepStrictEqual([c.plne, c.popredi], [false, { x: 0, y: 420, w: 1080, h: 1080 }]);
  const v = O.rozvrzeni(3024, 4032); // na výšku 3:4 – vejde se na šířku, nahoře a dole pozadí
  assert.deepStrictEqual([v.plne, v.popredi.w, v.popredi.y], [false, 1080, 240]);
});

test('neplatné rozměry → null; malé plátno pro rozmazání má poměr 9:16', () => {
  assert.strictEqual(O.rozvrzeni(0, 100), null);
  assert.strictEqual(O.rozvrzeni(NaN, 100), null);
  assert.deepStrictEqual(O.malePlatno(27), { w: 27, h: 48 });
  assert.deepStrictEqual(O.malePlatno(), { w: 27, h: 48 });
});

console.log('\n' + ok + ' testů prošlo' + (process.exitCode ? ', některé SELHALY' : ''));
