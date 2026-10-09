// Test svátků (js/jmeniny.js): domácké tvary, výběr u nejednoznačných, hromadné přidání oblíbených bez duplicit,
// nejbližší svátek – node testy/test_jmeniny.mjs (jména jsou vymyšlený příklad, ne čísi skutečný seznam)
import assert from 'node:assert';
const j = await import('../js/jmeniny.js');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}
const r = (t) => j.rozpoznejJmeno(t);
const jmena = (x) => (x.moznosti || x.navrhy || []).map((m) => m.jmeno);
console.log('Svátky');

test('slovník domáckých tvarů míří jen na jména, která v kalendáři jsou', () => {
  const tvary = j.domackeTvary();
  assert.ok(Object.keys(tvary).length > 150, 'slovník je malý: ' + Object.keys(tvary).length);
  const chybi = [];
  Object.keys(tvary).forEach((t) => tvary[t].forEach((x) => { if (!j.denJmena(x)) chybi.push(t + ' → ' + x); }));
  assert.deepStrictEqual(chybi, []);
});

test('každé jméno z kalendáře napsané přesně zůstane samo sebou (jen domácké tvary, které kalendář zná, se převedou)', () => {
  const tvary = j.domackeTvary();
  const spatne = j.vsechnaJmena().filter((x) => !tvary[x.toLowerCase()]).filter((x) => { const v = r(x); return v.stav !== 'ok' || v.jmeno !== x; });
  assert.deepStrictEqual(spatne, []);
});

test('domácké tvary → jméno z kalendáře (i bez diakritiky a malými)', () => {
  for (const [t, cil] of [['Honza', 'Jan'], ['Pepa', 'Josef'], ['Jirka', 'Jiří'], ['Verča', 'Veronika'], ['Bára', 'Barbora'],
    ['standa', 'Stanislav'], ['Lojza', 'Alois'], ['Zuzka', 'Zuzana'], ['Mirek', 'Miroslav'], ['Vojta', 'Vojtěch']]) {
    const v = r(t);
    assert.deepStrictEqual([v.stav, v.jmeno], ['ok', cil], t + ': ' + JSON.stringify(v));
  }
  assert.strictEqual(r('Honza').den, '06-24');
});

test('nejednoznačné tvary nabídnou výběr i se dny (Saša, Míša, Jindra, Míla)', () => {
  assert.deepStrictEqual(jmena(r('Saša')), ['Alexandr', 'Alexandra']);
  assert.deepStrictEqual(r('Sasa').moznosti.map((m) => m.den), ['02-27', '04-21']);
  assert.deepStrictEqual(jmena(r('Míša')), ['Michal', 'Michaela']);
  // Jindra je v kalendáři u Jindřišky, ale znamená i Jindřicha → výběr ze dvou, ne tři
  assert.deepStrictEqual(jmena(r('Jindra')), ['Jindřich', 'Jindřiška']);
  assert.strictEqual(r('Míla').stav, 'vyber');
  assert.ok(jmena(r('Míla')).indexOf('Kamila') >= 0 && jmena(r('Míla')).indexOf('Mila') < 0, JSON.stringify(r('Míla')));
});

test('diakritika rozliší jméno z kalendáře od domáckého tvaru (Mila × Míla)', () => {
  assert.deepStrictEqual([r('Mila').stav, r('Mila').jmeno, r('Mila').den], ['ok', 'Mila', '05-31']);
  assert.deepStrictEqual([r('Stepan').stav, r('Stepan').jmeno], ['ok', 'Štěpán']);
  assert.deepStrictEqual([r('ZDENEK').stav, r('ZDENEK').jmeno], ['ok', 'Zdeněk']);
});

test('jiný pravopis (Kristina → Kristýna, Emma → Ema); neznámé jméno bez svátku s podobnými', () => {
  assert.deepStrictEqual([r('Kristina').stav, r('Kristina').jmeno], ['ok', 'Kristýna']);
  assert.deepStrictEqual([r('Emma').stav, r('Emma').jmeno], ['ok', 'Ema']);
  assert.strictEqual(r('Xyzzy').stav, 'nezname');
  assert.deepStrictEqual(jmena(r('Xyzzy')), []);
  assert.strictEqual(r('Nikolas').stav, 'nezname');
  assert.strictEqual(jmena(r('Nikolas'))[0], 'Nikola');
  assert.strictEqual(r('  '), null);
});

test('rozdělení zadání: čárky, „a“, nový řádek, vztah v závorce / za pomlčkou / slovy, samá jména = víc lidí', () => {
  assert.deepStrictEqual(j.rozdelJmena('Pepa (děda), Bára a Honza – soused; Eva máma\nTom Eva, 1. Verča., Jindra (bratr a kamarád)'), [
    { text: 'Pepa', kdo: 'děda' }, { text: 'Bára', kdo: '' }, { text: 'Honza', kdo: 'soused' }, { text: 'Eva', kdo: 'máma' },
    { text: 'Tom', kdo: '' }, { text: 'Eva', kdo: '' }, { text: 'Verča', kdo: '' }, { text: 'Jindra', kdo: 'bratr a kamarád' }]);
  assert.deepStrictEqual(j.rozdelJmena(', ,  ;'), []);
  assert.deepStrictEqual(j.rozdelJmena('Honza)'), [{ text: 'Honza', kdo: '' }]);
  assert.strictEqual(j.rozdelJmena('Eva (' + 'x'.repeat(60) + ')')[0].kdo.length, 40);
});

test('hromadné přidání: převod, výběr, bez svátku, bez duplicit, doplnění vztahu, jedno uložení', () => {
  const stavajici = [{ jmeno: 'Josef', kdo: '' }, { jmeno: 'Eva', kdo: 'sestra' }];
  let p = j.pripravOblibene('Pepa (děda), Verča, Saša – kolegyně, Xyzzy, Eva, Eva (teta), Verča, Bára', stavajici, {});
  assert.deepStrictEqual(p.radky.map((x) => x.text + ':' + x.stav), ['Pepa:doplnit', 'Verča:pridat', 'Saša:vyber', 'Xyzzy:nezname',
    'Eva:uz-je', 'Eva:pridat', 'Verča:uz-je', 'Bára:pridat']);
  assert.ok(p.radky[0].prevod && p.radky[0].jmeno === 'Josef' && p.radky[0].den === '03-19', JSON.stringify(p.radky[0]));
  assert.deepStrictEqual([p.pridano, p.doplneno], [3, 1]);
  // výběr u Saši → Alexandra s vztahem
  p = j.pripravOblibene('Pepa (děda), Verča, Saša – kolegyně, Xyzzy, Eva, Eva (teta), Verča, Bára', stavajici, { sasa: 'Alexandra' });
  assert.deepStrictEqual(p.seznam, [{ jmeno: 'Josef', kdo: 'děda' }, { jmeno: 'Eva', kdo: 'sestra' }, { jmeno: 'Veronika', kdo: '' },
    { jmeno: 'Alexandra', kdo: 'kolegyně' }, { jmeno: 'Eva', kdo: 'teta' }, { jmeno: 'Barbora', kdo: '' }]);
  // volba, která k tvaru nepatří, se nepoužije; návrh u neznámého jména jde vybrat
  assert.strictEqual(j.pripravOblibene('Saša', [], { sasa: 'Petr' }).radky[0].stav, 'vyber');
  assert.strictEqual(j.pripravOblibene('Nikolas', [], { nikolas: 'Nikola' }).radky[0].stav, 'pridat');
  // stejný vztah jinak napsaný = stejný člověk
  assert.strictEqual(j.pripravOblibene('Eva (Sestra)', stavajici, {}).radky[0].stav, 'uz-je');
});

test('nejbližší svátek: dva dny u jednoho jména, přes konec roku, 29. 2. jen v přestupném roce', () => {
  const d = (r, m, den) => new Date(r, m - 1, den).getTime();
  assert.deepStrictEqual(j.dnyJmena('Andrej'), ['10-11', '11-30']);
  assert.strictEqual(j.dalsiSvatek('Andrej', d(2026, 10, 9)), d(2026, 10, 11));
  assert.strictEqual(j.dalsiSvatek('Andrej', d(2026, 10, 12)), d(2026, 11, 30));
  assert.strictEqual(j.dalsiSvatek('Horymír', d(2026, 10, 12)), d(2028, 2, 29));
  assert.strictEqual(j.dalsiSvatek('Xyzzy', d(2026, 10, 12)), null);
  const s = j.svatkyOblibenych([{ jmeno: 'Edita', kdo: '' }, { jmeno: 'Štěpán', kdo: 'soused' }, { jmeno: 'Xyzzy' }], d(2026, 12, 20) + 15 * 36e5);
  assert.deepStrictEqual(s.map((x) => [x.jmeno, x.zaDni]), [['Štěpán', 6], ['Edita', 24]]);
  assert.strictEqual(s[0].t, d(2026, 12, 26));
});

test('oblíbený s druhým jménem dne (Elza vedle Elišky): den, nejbližší svátek, rozpoznání i hromadné přidání', () => {
  const d = (r, m, den) => new Date(r, m - 1, den).getTime();
  const den = d(2026, 10, 5) + 13 * 36e5; // kdykoli během dne
  assert.strictEqual(j.hlavniJmeno(den), 'Eliška');
  assert.deepStrictEqual(j.oblibeniDne(den, [{ jmeno: 'Elza', kdo: 'sousedka' }, { jmeno: 'Eva', kdo: '' }]), [{ jmeno: 'Elza', kdo: 'sousedka' }]);
  assert.strictEqual(j.oblibeniDne(den, [{ jmeno: 'elza' }]).length, 1, 'malými a bez diakritiky');
  assert.strictEqual(j.oblibeniDne(d(2026, 10, 6), [{ jmeno: 'Elza' }]).length, 0);
  assert.strictEqual(j.svatkyOblibenych([{ jmeno: 'Elza' }], d(2026, 10, 1))[0].t, d(2026, 10, 5));
  const v = j.rozpoznejJmeno('Elza');
  assert.deepStrictEqual([v.stav, v.jmeno, v.den], ['ok', 'Elza', '10-05']);
  // Eliška už je, Elza je jiný člověk se stejným dnem → přidá se
  const p = j.pripravOblibene('Elza (sousedka), eliska', [{ jmeno: 'Eliška', kdo: '' }], {});
  assert.deepStrictEqual(p.radky.map((r) => r.stav + ':' + r.den), ['pridat:10-05', 'uz-je:10-05']);
  assert.deepStrictEqual(p.seznam, [{ jmeno: 'Eliška', kdo: '' }, { jmeno: 'Elza', kdo: 'sousedka' }]);
  // den se třemi jmény: oblíbení s druhým i třetím jménem
  const tri = d(2026, 10, 15);
  assert.ok(j.jmeninyDne(tri).split(',').length >= 3, j.jmeninyDne(tri));
  const [, druhe, treti] = j.jmeninyDne(tri).split(/,\s*/);
  assert.deepStrictEqual(j.oblibeniDne(tri, [{ jmeno: treti }, { jmeno: druhe }]).map((o) => o.jmeno), [treti, druhe]);
});

console.log('\n' + ok + ' prošlo');
