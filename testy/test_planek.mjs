// Test plánku cviku – čisté funkce js/planek.js (čištění, SVG, legenda, velikost značek).
// Spuštění: node testy/test_planek.mjs
import assert from 'node:assert';
const P = await import('../js/planek.js');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}

const ZAKONCENI = {
  vyrez: [74, 8, 33, 52], hriste: 'cary',
  prvky: [
    { t: 'goal', id: 'b1', x: 105, y: 34, w: 7.32, rot: 180 },
    { t: 'p', id: 'gk', side: 'away', gk: true, x: 103.5, y: 34, num: 'B' },
    { t: 'p', id: 'a1', side: 'home', x: 80, y: 30, num: '1' },
    { t: 'mannequin', id: 'f1', x: 90, y: 30 },
    { t: 'ball', id: 'm1', x: 81, y: 31.5 },
    { t: 'dribble', id: 'c1', x1: 80, y1: 30, x2: 86, y2: 36, krok: 1 },
    { t: 'shot', id: 'c2', x1: 87, y1: 36, x2: 104.5, y2: 31.5, krok: 2 }
  ]
};

console.log('Plánek cviku');

test('čištění: prázdné a nesmysly → null, prázdný s prazdnyOk → výřez', () => {
  assert.strictEqual(P.cistyPlanek(null), null);
  assert.strictEqual(P.cistyPlanek('x'), null);
  assert.strictEqual(P.cistyPlanek([]), null);
  assert.strictEqual(P.cistyPlanek({}), null);
  assert.strictEqual(P.cistyPlanek({ prvky: [{ t: 'raketa', x: 1, y: 1 }] }), null);
  const p = P.cistyPlanek({ vyrez: [0, 0, 20, 20], hriste: 'trava', prvky: [] }, true);
  assert.deepStrictEqual(p, { vyrez: [0, 0, 20, 20], hriste: 'trava', prvky: [] });
});

test('čištění: ořez na hřiště, neznámý typ a klíče pryč, doplněná id, texty a krok', () => {
  const p = P.cistyPlanek({
    vyrez: [-50, 10, 500, 20], hriste: 'mars', zlo: 1,
    prvky: [
      { t: 'p', x: 200, y: -5, side: 'mars', num: 'ABCDEF', jmeno: 'Pepa', gk: 'ano' },
      { t: 'ufo', x: 1, y: 1 },
      { t: 'text', x: 10, y: 10, text: 'x'.repeat(60) },
      { t: 'pass', id: 'c1', x1: 1, y1: 1, x2: 10, y2: 1, krok: 25, bx: 100 },
      { t: 'run', id: 'c1', x1: 1, y1: 1, x2: 10, y2: 5, krok: 3 },
      { t: 'run', x1: 5, y1: 5, x2: 5, y2: 5 },
      { t: 'cone', x: 5, y: 5, color: 'red; fill:url(x)' },
      { t: 'goal', x: 105, y: 34, rot: -90, w: 50 },
      { t: 'text', x: 1, y: 1, text: '   ' }
    ]
  });
  assert.deepStrictEqual(p.vyrez, [-3, 10, 111, 20]);
  assert.strictEqual(p.hriste, 'cary');
  assert.strictEqual('zlo' in p, false);
  assert.strictEqual(p.prvky.length, 6);
  const [hrac, text, pass, run, kuzel, branka] = p.prvky;
  assert.deepStrictEqual(hrac, { t: 'p', id: 'h1', x: 105, y: 0, side: 'home', num: 'ABC' });
  assert.strictEqual(text.text.length, 40);
  assert.strictEqual(pass.krok, undefined, 'krok mimo 1–20 zahodit');
  assert.strictEqual(pass.bx, 60);
  assert.strictEqual(run.id, 'c2', 'duplicitní id se přečísluje');
  assert.strictEqual(run.krok, 3);
  assert.strictEqual(kuzel.color, undefined, 'barva jen #rgb / #rrggbb');
  assert.deepStrictEqual([branka.w, branka.rot], [8, 270]);
});

test('čištění: nejvýš 80 prvků', () => {
  const prvky = Array.from({ length: 120 }, (_, i) => ({ t: 'cone', x: i % 100, y: 5 }));
  const p = P.cistyPlanek({ prvky });
  assert.strictEqual(p.prvky.length, 80);
  assert.strictEqual(new Set(p.prvky.map((i) => i.id)).size, 80);
});

test('SVG: viewBox podle výřezu, prvky s data-id, čísla kroků, hroty, čáry hřiště', () => {
  const s = P.planekSvg(ZAKONCENI);
  assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'));
  assert.ok(s.includes('viewBox="74 8 33 52"'));
  for (const id of ['b1', 'gk', 'a1', 'f1', 'm1', 'c1', 'c2']) assert.ok(s.includes(`data-id="${id}"`), 'chybí ' + id);
  assert.strictEqual((s.match(/class="pl-hrot"/g) || []).length, 2);
  assert.ok(/<g class="pl-krok"[^>]*>.*?>1<\/text>/.test(s) && />2<\/text>/.test(s));
  assert.ok(s.includes('pl-hriste'));
  assert.strictEqual((s.match(/class="pl-cara"/g) || []).length, 3, 'vedení 1 tah, střela 2 (dvojitá)');
  assert.ok(!P.planekSvg({ ...ZAKONCENI, hriste: 'trava' }).includes('pl-hriste'), 'tráva bez čar');
});

test('SVG: volby – vybrané, úchyty, tisk, legenda; escapování textu', () => {
  const s = P.planekSvg(ZAKONCENI, { vybrane: ['c2'], uchyty: true, tisk: true });
  assert.ok(s.includes('planek--tisk'));
  assert.ok(/pl-shot pl-vybrany/.test(s));
  assert.strictEqual((s.match(/data-uchyt=/g) || []).length, 3);
  const f = P.planekSvg(ZAKONCENI, { legenda: true });
  assert.ok(f.startsWith('<figure class="planek-obal"><svg') && f.includes('planek-legenda'));
  const x = P.planekSvg({ prvky: [{ t: 'text', x: 5, y: 5, text: '<script>"' }] });
  assert.ok(x.includes('&lt;script&gt;&quot;') && !x.includes('<script>'));
  assert.ok(P.planekSvg(null).startsWith('<svg'), 'bez plánku prázdné hřiště');
});

test('velikost značek podle výřezu (menší strana)', () => {
  const r = (s) => Number(/class="pl-hrac__telo" r="([\d.]+)"/.exec(s)[1]);
  const hrac = [{ t: 'p', side: 'home', x: 10, y: 10 }];
  const male = r(P.planekSvg({ vyrez: [0, 0, 15, 10], prvky: hrac }));
  const cele = r(P.planekSvg({ vyrez: [-2, -2, 109, 72], prvky: hrac }));
  assert.ok(Math.abs(cele / male - 72 / 10) < 0.2, `poměr ${cele / male}`);
  // podíl poloměru na menší straně výřezu je stejný
  assert.ok(Math.abs(male / 10 - cele / 72) < 0.002);
});

test('legenda jen z použitých druhů', () => {
  const l = P.legendaHtml(ZAKONCENI);
  for (const t of ['vedení míče', 'střela', 'naši', 'brankář', 'míč', 'figurína', 'branka', 'pořadí kroku']) assert.ok(l.includes(t), 'chybí ' + t);
  for (const t of ['přihrávka', 'běh bez míče', 'soupeř', 'kužel', 'tyč', 'zóna', 'žolík']) assert.ok(!l.includes(t), 'navíc ' + t);
  assert.strictEqual(P.legendaHtml({ prvky: [{ t: 'text', x: 1, y: 1, text: 'A' }] }), '');
  assert.strictEqual(P.legendaHtml(null), '');
});

test('výřezy a nový plánek', () => {
  for (const k of ['cele', 'polovina', 'vapno', 'tretina', 'stred', 'ctverec', 'obdelnik']) {
    const v = P.VYREZY[k];
    assert.deepStrictEqual(P.cistyPlanek({ vyrez: v.vyrez, hriste: v.hriste }, true).vyrez, v.vyrez, k);
  }
  assert.deepStrictEqual(P.novyPlanek('ctverec'), { vyrez: [0, 0, 20, 20], hriste: 'trava', prvky: [] });
  assert.strictEqual(P.novyPlanek().prvky.length, 0);
});

console.log(`${ok} testů v pořádku`);
