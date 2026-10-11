// Test průběhu zveřejňování na Instagram (čisté funkce js/ig_prubeh.js) – node testy/test_ig_prubeh.mjs
// Položky plánu jako z motoru (REELY_PLAN / PLAKATY_PLAN po 11. 10. 2026); časy pevné, nezávislé na dnešku.
process.env.TZ = 'Europe/Prague';
import assert from 'node:assert';
const P = await import('../js/ig_prubeh.js');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}
const T = Date.parse('2026-10-11T20:15:00+02:00');
const MIN = 60e3;
const stavy = (kr) => kr.map((k) => k.klic + ':' + k.stav).join(' ');

console.log('Instagram – průběh zveřejňování');

test('kdy se ptát motoru: běží / na řadě = krok, do 30 min = čtení, jinak nic', () => {
  assert.strictEqual(P.sledovani({ stav: 'ceka', kdy: T + 40 * MIN }, T), '');
  assert.strictEqual(P.sledovani({ stav: 'ceka', kdy: T + 20 * MIN }, T), 'cteni');
  assert.strictEqual(P.sledovani({ stav: 'ceka', kdy: T + 30e3 }, T), 'krok', 'minuta rezerva jako v motoru');
  assert.strictEqual(P.sledovani({ stav: 'ceka', kdy: T - 9 * MIN }, T), 'krok', 'čas prošel (stará kopie ze serveru) → zeptat se');
  assert.strictEqual(P.sledovani({ stav: 'nahrava', kdy: T }, T), 'krok');
  assert.strictEqual(P.sledovani({ stav: 'zverejnuji', kdy: T }, T), 'krok');
  assert.strictEqual(P.sledovani({ stav: 'hotovo', kdy: T }, T), '');
  assert.strictEqual(P.sledovani({ stav: 'chyba', kdy: T }, T), '');
  assert.strictEqual(P.sledovani(null, T), '');
});

test('kroky: naplánováno → příprava → Instagram zpracovává (s příběhem) → zveřejnění → příběh → na Instagramu', () => {
  let kr = P.kroky({ stav: 'ceka', kdy: T + 3 * 3600e3, pribeh: true }, { ted: T, video: true });
  assert.strictEqual(stavy(kr), 'plan:ted priprava:ceka zpracovani:ceka zverejnuji:ceka pribeh:ceka hotovo:ceka');
  assert.deepStrictEqual([kr[0].nazev, kr[0].popis, kr[0].cas, kr[1].nazev], ['Naplánováno', 'vyjde 23:15', T + 3 * 3600e3, 'Příprava videa']);
  kr = P.kroky({ stav: 'ceka', kdy: T - MIN }, { ted: T, video: false });
  assert.strictEqual(stavy(kr), 'plan:ted priprava:ceka zpracovani:ceka zverejnuji:ceka hotovo:ceka', 'bez příběhu');
  assert.deepStrictEqual([kr[0].popis, kr[1].nazev], ['čas nastal – zveřejnění začíná', 'Příprava obrázku']);
  kr = P.kroky({ stav: 'nahrava', kdy: T, kroky: { priprava: T + 5e3 } }, { ted: T + 10e3, video: true });
  assert.strictEqual(stavy(kr), 'plan:hotovo priprava:ted zpracovani:ceka zverejnuji:ceka hotovo:ceka');
  assert.deepStrictEqual([kr[1].cas, kr[1].popis], [T + 5e3, 'dočasný odkaz na Disku, odeslání na Instagram']);
  const z = { stav: 'nahrava', kdy: T, pribeh: true, kontejner: 'k1', stavIg: 'IN_PROGRESS', kontrola: T + 2 * MIN, kroky: { priprava: T, zpracovani: T + 10e3 } };
  kr = P.kroky(z, { ted: T + 3 * MIN, video: true });
  assert.strictEqual(stavy(kr), 'plan:hotovo priprava:hotovo zpracovani:ted zverejnuji:ceka pribeh:ceka hotovo:ceka');
  assert.deepStrictEqual([kr[2].cas, kr[2].popis, kr[3].cas], [T + 10e3, 'stahuje a zpracovává video', 0]);
  kr = P.kroky(Object.assign({}, z, { stavIg: 'FINISHED', stavIgPribeh: 'IN_PROGRESS' }), { ted: T + 3 * MIN, video: true });
  assert.strictEqual(kr[2].popis, 'příspěvek hotový, čeká se na příběh');
  kr = P.kroky({ stav: 'zverejnuji', kdy: T, pribeh: true, kontejner: 'k1', kroky: { priprava: T, zpracovani: T, zverejnuji: T + MIN } }, { ted: T + MIN, video: true });
  assert.strictEqual(stavy(kr), 'plan:hotovo priprava:hotovo zpracovani:hotovo zverejnuji:ted pribeh:ceka hotovo:ceka');
  // hotovo: všechno zelené, čas zveřejnění; příběh nevyšel → varování s důvodem (příspěvek platí)
  const hotovo = { stav: 'hotovo', kdy: T, pribeh: true, pribehChyba: 'Video příběhu může mít nejvýš 60 s', odkaz: 'https://www.instagram.com/reel/X/',
    kroky: { priprava: T, zpracovani: T + 5e3, zverejnuji: T + 70e3, pribeh: T + 72e3, hotovo: T + 75e3 } };
  kr = P.kroky(hotovo, { ted: T + 5 * MIN, video: true });
  assert.strictEqual(stavy(kr), 'plan:hotovo priprava:hotovo zpracovani:hotovo zverejnuji:hotovo pribeh:varovani hotovo:hotovo');
  assert.deepStrictEqual([kr[4].popis, kr[5].cas], ['nevyšel: Video příběhu může mít nejvýš 60 s', T + 75e3]);
  // starší položka bez kroků (motor před 11. 10.): čas hotovo ze „zveřejněno“
  kr = P.kroky({ stav: 'hotovo', kdy: T, zverejneno: T + MIN }, { ted: T + 2 * MIN, video: false });
  assert.strictEqual(kr[kr.length - 1].cas, T + MIN);
});

test('kroky při chybě: nepovedený krok červeně s důvodem (poslední začatý), bez kroků = příprava', () => {
  let kr = P.kroky({ stav: 'chyba', kdy: T, chyba: 'Instagram video odmítl: ERROR', kroky: { priprava: T, zpracovani: T + 5e3, chyba: T + MIN } }, { ted: T + 2 * MIN, video: true });
  assert.strictEqual(stavy(kr), 'plan:hotovo priprava:hotovo zpracovani:chyba zverejnuji:ceka hotovo:ceka');
  assert.strictEqual(kr[2].popis, 'Instagram video odmítl: ERROR');
  kr = P.kroky({ stav: 'chyba', kdy: T, chyba: 'Video reelu na Disku není.' }, { ted: T, video: true });
  assert.strictEqual(stavy(kr), 'plan:hotovo priprava:chyba zpracovani:ceka zverejnuji:ceka hotovo:ceka');
  kr = P.kroky({ stav: 'chyba', kdy: T, chyba: 'Address unavailable', kroky: { priprava: T, zpracovani: T, zverejnuji: T + MIN } }, { ted: T, video: false });
  assert.strictEqual(stavy(kr), 'plan:hotovo priprava:hotovo zpracovani:hotovo zverejnuji:chyba hotovo:ceka');
});

test('zaseknutí: chyba, dlouhé zpracování, bez kontroly, nezačalo – s důvodem a akcí; zámek motoru = nic', () => {
  assert.deepStrictEqual(P.zasek({ stav: 'chyba', chyba: 'Invalid OAuth access token' }, T, 0, true),
    { duvod: 'Invalid OAuth access token', akce: 'znovu', tlacitko: 'Zkusit znovu', chyba: true });
  const bezi = { stav: 'nahrava', kdy: T, kontejner: 'k1', stavIg: 'IN_PROGRESS', kontrola: T + 16 * MIN, kroky: { priprava: T, zpracovani: T } };
  let z = P.zasek(bezi, T + 16 * MIN, T + 12 * MIN, true);
  assert.deepStrictEqual([z.akce, z.tlacitko, /video zpracovává už 16 min/.test(z.duvod)], ['znovu', 'Nahrát znovu', true], z.duvod);
  assert.strictEqual(P.zasek(bezi, T + 10 * MIN, T + 5 * MIN, true), null, 'video do 15 min je v pořádku');
  assert.ok(P.zasek(Object.assign({}, bezi, { kontrola: T + 6 * MIN }), T + 6 * MIN, T, false), 'obrázek po 5 min už ano');
  assert.strictEqual(P.zasek(Object.assign({}, bezi, { bezi: T + 20 * MIN }), T + 16 * MIN, 0, true), null, 'motor právě pracuje');
  // rozpracované, ale 25 min se nikdo nedíval (spouštěč neběží, aplikace zavřená)
  z = P.zasek({ stav: 'zverejnuji', kdy: T, kontejner: 'k1', stavIg: 'FINISHED', kontrola: T, kroky: { priprava: T, zpracovani: T, zverejnuji: T } }, T + 25 * MIN, T - 20 * MIN, true);
  assert.deepStrictEqual([z.akce, z.tlacitko], ['krok', 'Pokračovat']);
  assert.ok(/nepodíval 25 min/.test(z.duvod) && /Spouštěč motoru naposledy běžel před 45 min/.test(z.duvod), z.duvod);
  // naplánované na 20:15, ve 20:35 pořád čeká → Zveřejnit teď; spouštěč nevíme (starší motor) → bez věty o spouštěči
  z = P.zasek({ stav: 'ceka', kdy: T }, T + 20 * MIN, 0, true);
  assert.deepStrictEqual([z.akce, z.tlacitko, z.duvod], ['ted', 'Zveřejnit teď', 'Mělo vyjít 20:15, ale zveřejnění nezačalo.']);
  assert.strictEqual(P.zasek({ stav: 'ceka', kdy: T }, T + 10 * MIN, 0, true), null, 'do 15 min po čase ještě ne');
  assert.strictEqual(P.zasek({ stav: 'hotovo', kdy: T }, T + 99 * MIN, 0, true), null);
  assert.strictEqual(P.spoustecNebezi(T - 26 * MIN, T), true);
  assert.strictEqual(P.spoustecNebezi(T - 9 * MIN, T), false);
  assert.strictEqual(P.spoustecNebezi(0, T), false, 'nevíme = nevarovat');
});

test('řádek pod kroky, časy po česku, Přehled (co ukázat a jak důležité)', () => {
  assert.strictEqual(P.infoText({ stav: 'nahrava', kontrola: T - 3 * MIN, pokusy: 1, vypadek: 'Address unavailable' }, T),
    'poslední kontrola na Instagramu před 3 min · výpadek spojení – zkouším znovu (pokus 2 ze 3)');
  assert.strictEqual(P.infoText({ stav: 'nahrava', bezi: T + MIN, kontrola: T - 20e3 }, T), 'motor právě pracuje · poslední kontrola na Instagramu před chvílí');
  assert.strictEqual(P.infoText({ stav: 'ceka', bezi: T + MIN }, T), 'motor začíná');
  assert.strictEqual(P.infoText({ stav: 'hotovo' }, T), '');
  assert.deepStrictEqual([P.predChvili(20e3), P.predChvili(59 * MIN), P.predChvili(125 * MIN), P.predChvili(120 * MIN)],
    ['před chvílí', 'před 59 min', 'před 2 h 5 min', 'před 2 h']);
  assert.deepStrictEqual([P.casKratce(T, T), P.casKratce(T + 864e5, T)], ['20:15', 'po 12. 10. 20:15']);
  assert.strictEqual(P.naPrehled({ stav: 'ceka', kdy: T + 3 * 3600e3 }, T), 0, 'za 3 h – ne');
  assert.strictEqual(P.naPrehled({ stav: 'ceka', kdy: T + 3600e3 }, T), 2);
  assert.strictEqual(P.naPrehled({ stav: 'nahrava', kdy: T }, T), 3);
  assert.strictEqual(P.naPrehled({ stav: 'chyba', kdy: T, kroky: { chyba: T - 3600e3 } }, T), 4);
  assert.strictEqual(P.naPrehled({ stav: 'chyba', kdy: T, kroky: { chyba: T - 30 * 3600e3 } }, T), 0, 'chyba starší než den');
  assert.strictEqual(P.naPrehled({ stav: 'hotovo', kdy: T, zverejneno: T - 30 * MIN }, T), 1);
  assert.strictEqual(P.naPrehled({ stav: 'hotovo', kdy: T, zverejneno: T - 3 * 3600e3 }, T), 0);
  assert.ok(P.ukazatKroky({ stav: 'hotovo', kdy: T, zverejneno: T - 3600e3, kroky: { hotovo: T - 3600e3 } }, T));
  assert.ok(!P.ukazatKroky({ stav: 'hotovo', kdy: T, zverejneno: T - 3600e3 }, T), 'starší motor bez kroků – jen štítek');
  const sh = P.souhrn({ stav: 'nahrava', kdy: T, kontejner: 'k1', kroky: { priprava: T, zpracovani: T } }, { ted: T, video: true });
  assert.deepStrictEqual([sh.krok.nazev, sh.poradi, sh.celkem], ['Instagram zpracovává', 3, 5]);
});

test('HTML kroků: aktuální krok s aria-current, fajfky, texty z motoru ošetřené', () => {
  const h = P.krokyHtml({ stav: 'chyba', kdy: T, chyba: '<img src=x onerror=alert(1)>', kroky: { priprava: T } }, { ted: T, video: true });
  assert.ok(!/<img/.test(h) && /&lt;img/.test(h), 'chyba z motoru jako text');
  assert.ok(/ig-krok--chyba/.test(h) && /ig-krok--hotovo/.test(h) && /<svg/.test(h), h.slice(0, 200));
  const h2 = P.krokyHtml({ stav: 'ceka', kdy: T + MIN }, { ted: T, video: false });
  assert.strictEqual((h2.match(/aria-current="step"/g) || []).length, 1);
  assert.ok(/<time class="ig-krok__cas cisla">20:16<\/time>/.test(h2), h2);
  assert.strictEqual((P.teckyHtml(P.kroky({ stav: 'ceka', kdy: T }, { ted: T, video: true })).match(/ig-tecka /g) || []).length, 5);
});

console.log('\n' + ok + ' testů prošlo' + (process.exitCode ? ', některé SELHALY' : ''));
