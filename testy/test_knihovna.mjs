// Test Knihovny – čisté funkce js/knihovna_data.js (záložky, filtry, hledání, můj stav, náhled z Wikipedie).
// Spuštění: node testy/test_knihovna.mjs
import assert from 'node:assert';
const D = await import('../js/knihovna_data.js');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}

const DATA = {
  karty: [
    { id: 'film-zkusebni-let', druh: 'film', nazev: 'Zkušební let', original: 'Test Flight', rok: 2020, delka: '120 min',
      tvurci: [{ role: 'režie', jmena: ['Jana Testová'] }], zanry: ['drama'], stitky: ['letadla'], kratce: 'Pilotka testuje letadlo.',
      hodnoceni: [{ zdroj: 'ČSFD', hodnota: '80 %', url: 'https://www.csfd.cz/film/1-zkusebni-let/' }], pripraveno: '2026-10-11T22:00:00+02:00',
      souvisi: [{ id: 'reserse-letectvi', proc: 'rešerše' }, { id: 'film-pan-prstenu', proc: 'jiný film' }] },
    { id: 'serial-majak', druh: 'serial', nazev: 'Maják', roky: '2019–2022', pripraveno: '2026-10-01T10:00:00+02:00' },
    { id: 'kniha-maly-princ', druh: 'kniha', nazev: 'Malý princ', original: 'Le Petit Prince', rok: 1943, stran: 96, tvurci: [{ role: 'autor', jmena: ['Antoine de Saint-Exupéry'] }] }
  ],
  reserse: [{ id: 'reserse-letectvi', nazev: 'Jak létá letadlo', kratce: 'Vztlak na křídle.', stitky: ['fyzika'], pripraveno: '2026-10-10T20:00:00+02:00' }],
  moje: { 'film-zkusebni-let': { stav: 'hotovo', hodnoceni: 5 }, 'kniha-maly-princ': { stav: 'chci' }, 'reserse-letectvi': { stav: 'hotovo' } },
  pozadavky: [{ id: 'p-20261011-2210-ab', druh: 'film', text: 'Interstellar', kdy: '2026-10-11T22:10:00+02:00' },
    { id: 'p-20261011-2215-cd', druh: 'reserse', text: 'Proč je obloha modrá?', kdy: '2026-10-11T22:15:00+02:00' },
    { id: 'p-20261011-2220-ef', druh: 'serial', text: 'Černobyl', kdy: '2026-10-11T22:20:00+02:00' }],
  ted: Date.parse('2026-10-11T22:30:00+02:00')
};

console.log('Knihovna');

test('záložky a filtry podle mého stavu: filmy = filmy i seriály, knihy, rešerše; počty', () => {
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'filmy', 'vse', '').map((x) => x.id), ['film-zkusebni-let', 'serial-majak']);
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'filmy', 'hotovo', '').map((x) => x.id), ['film-zkusebni-let']);
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'filmy', 'bez', '').map((x) => x.id), ['serial-majak']);
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'knihy', 'chci', '').map((x) => x.id), ['kniha-maly-princ']);
  assert.deepStrictEqual(D.reserseZalozky(DATA, '', 'bez'), []);
  assert.strictEqual(D.reserseZalozky(DATA, '', 'hotovo').length, 1);
  const p = D.pocty(DATA);
  assert.deepStrictEqual([p.filmy, p.knihy, p.reserse, p.cekaji], [2, 1, 1, 3]);
  assert.deepStrictEqual(p.stavy.filmy, { vse: 2, chci: 0, rozpracovane: 0, hotovo: 1 });
  assert.strictEqual(p.stavy.reserse.hotovo, 1);
  assert.deepStrictEqual(D.pocty(null), { filmy: 0, knihy: 0, reserse: 0, cekaji: 0, stavy: { filmy: { vse: 0, chci: 0, rozpracovane: 0, hotovo: 0 },
    knihy: { vse: 0, chci: 0, rozpracovane: 0, hotovo: 0 }, reserse: { vse: 0, chci: 0, rozpracovane: 0, hotovo: 0 } } });
});

test('názvy stavů podle druhu (Viděno × Přečteno) a čekající požadavky v záložce, nejnovější nahoře', () => {
  assert.deepStrictEqual(D.nazvyStavu('serial').map((s) => s[1]), ['Chci vidět', 'Rozkoukané', 'Viděno']);
  assert.deepStrictEqual(D.nazvyStavu('kniha').map((s) => s[1]), ['Chci číst', 'Čtu', 'Přečteno']);
  assert.strictEqual(D.nazevStavu('film', 'hotovo'), 'Viděno');
  assert.strictEqual(D.nazevStavu('knihy', 'rozpracovane'), 'Čtu');
  assert.deepStrictEqual(D.cekajici(DATA, 'filmy', '').map((p) => p.text), ['Černobyl', 'Interstellar']);
  assert.deepStrictEqual(D.cekajici(DATA, 'reserse', '').map((p) => p.text), ['Proč je obloha modrá?']);
  assert.deepStrictEqual(D.cekajici(DATA, 'filmy', 'cerno').map((p) => p.text), ['Černobyl'], 'hledání bez diakritiky');
});

test('hledání bez diakritiky v názvu, původním názvu, tvůrcích a štítcích; hledání v celé aplikaci', () => {
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'filmy', 'vse', 'test flight').map((x) => x.id), ['film-zkusebni-let']);
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'knihy', 'vse', 'exupery').map((x) => x.id), ['kniha-maly-princ']);
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'filmy', 'vse', 'MAJAK 2019').map((x) => x.id), ['serial-majak']);
  assert.deepStrictEqual(D.kartyZalozky(DATA, 'filmy', 'vse', 'nic takového'), []);
  const v = D.hledej(DATA, 'let', 5);
  assert.deepStrictEqual(v.map((x) => [x.typ, x.id]), [['karta', 'film-zkusebni-let'], ['reserse', 'reserse-letectvi']]);
  assert.strictEqual(v[0].pod, '2020 · film · 120 min');
  assert.deepStrictEqual(D.hledej(DATA, '', 5), []);
  assert.deepStrictEqual(D.hledej(null, 'let', 5), []);
});

test('okamžitá změna mého stavu (sMoji): nastavit, zrušit, data se nemění na místě', () => {
  const d1 = D.sMoji(DATA, 'serial-majak', { stav: 'rozpracovane', hodnoceni: 3 });
  assert.deepStrictEqual(d1.moje['serial-majak'], { stav: 'rozpracovane', hodnoceni: 3 });
  assert.ok(!DATA.moje['serial-majak'], 'původní data beze změny');
  const d2 = D.sMoji(d1, 'serial-majak', { stav: '', hodnoceni: 0 });
  assert.ok(!d2.moje['serial-majak'], 'prázdné = pryč');
  const d3 = D.sMoji(DATA, 'film-zkusebni-let', { poznamka: '  Skvělé  ' });
  assert.deepStrictEqual(d3.moje['film-zkusebni-let'], { stav: 'hotovo', hodnoceni: 5, poznamka: 'Skvělé' }, 'ostatní zůstane');
  assert.deepStrictEqual(D.sMoji(null, 'film-x', { stav: 'chci' }).moje, { 'film-x': { stav: 'chci' } });
});

test('dlaždice: rok, druh, délka / stran, první hodnocení, nová karta, iniciála, délka série', () => {
  assert.strictEqual(D.metaKarty(DATA.karty[1]), '2019–2022 · seriál');
  assert.strictEqual(D.metaKarty(DATA.karty[2]), '1943 · kniha · 96 stran');
  assert.strictEqual(D.hodnoceniKratce(DATA.karty[0]), 'ČSFD 80 %');
  assert.ok(D.jeNova({ moje: {} }, DATA.karty[0], DATA.ted), 'připravená před půl hodinou');
  assert.ok(!D.jeNova(DATA, DATA.karty[0], DATA.ted), 's mým stavem už ne');
  assert.ok(!D.jeNova({ moje: {} }, DATA.karty[1], DATA.ted), 'starší než 3 dny');
  assert.strictEqual(D.iniciala('The Hobbit'), 'H');
  assert.strictEqual(D.iniciala('„Šakalí léta“'), 'Š');
  assert.strictEqual(D.iniciala(''), '?');
  assert.strictEqual(D.minuty('2 h 15 min'), 135);
  assert.strictEqual(D.celkemMinut([{ delka: '178 min' }, { delka: '179 min' }, { delka: '201 min' }]), 558);
  assert.strictEqual(D.celkemMinut([{ delka: '178 min' }, { nazev: 'bez délky' }]), 0, 'jen když ji mají všechny díly');
  assert.strictEqual(D.druhZId('kniha-maly-princ'), 'kniha');
  assert.strictEqual(D.druhZId('nesmysl'), 'film');
});

test('související: co v knihovně je, se dá otevřít; co ne, má název z id', () => {
  const s = D.souvisejici(DATA, DATA.karty[0]);
  assert.deepStrictEqual(s.map((x) => [x.id, x.existuje, x.nazev, x.typ]), [['reserse-letectvi', true, 'Jak létá letadlo', 'reserse'], ['film-pan-prstenu', false, 'pan prstenu', '']]);
});

test('odkazy: jen http(s); ČSFD z karty, jinak hledání; Databáze knih u knihy', () => {
  assert.strictEqual(D.bezpecnaUrl('javascript:alert(1)'), '');
  assert.strictEqual(D.bezpecnaUrl('https://x.cz/a"onerror="x'), '');
  assert.strictEqual(D.bezpecnaUrl(' https://upload.wikimedia.org/a.jpg '), 'https://upload.wikimedia.org/a.jpg');
  assert.deepStrictEqual(D.odkazDatabaze(DATA.karty[0]), { nazev: 'ČSFD', url: 'https://www.csfd.cz/film/1-zkusebni-let/' });
  assert.deepStrictEqual(D.odkazDatabaze(DATA.karty[1]), { nazev: 'ČSFD', url: 'https://www.csfd.cz/hledat/?q=Maj%C3%A1k' });
  assert.deepStrictEqual(D.odkazDatabaze(DATA.karty[2]), { nazev: 'Databáze knih', url: 'https://www.databazeknih.cz/search?q=Mal%C3%BD%20princ' });
});

test('„už v knihovně je“: stejný název nebo původní název ve stejné části, bez diakritiky a autora', () => {
  assert.strictEqual(D.uzJe(DATA, 'film', 'zkusebni let').id, 'film-zkusebni-let');
  assert.strictEqual(D.uzJe(DATA, 'serial', 'Test Flight').id, 'film-zkusebni-let', 'filmy i seriály jsou jedna část');
  assert.strictEqual(D.uzJe(DATA, 'kniha', 'Malý princ – Saint-Exupéry').id, 'kniha-maly-princ');
  assert.strictEqual(D.uzJe(DATA, 'kniha', 'Zkušební let'), null, 'jiná část');
  assert.strictEqual(D.uzJe(DATA, 'film', 'Z'), null);
});

test('náhled z Wikipedie: adresy (film, kniha, cs pak en), otázky ne, jen článek s textem a bezpečnými adresami', () => {
  assert.deepStrictEqual(D.wikiAdresy('film', 'Interstellar'), [
    'https://cs.wikipedia.org/api/rest_v1/page/summary/Interstellar_(film)', 'https://cs.wikipedia.org/api/rest_v1/page/summary/Interstellar',
    'https://en.wikipedia.org/api/rest_v1/page/summary/Interstellar_(film)', 'https://en.wikipedia.org/api/rest_v1/page/summary/Interstellar']);
  assert.strictEqual(D.wikiAdresy('kniha', 'Malý princ – Saint-Exupéry')[0], 'https://cs.wikipedia.org/api/rest_v1/page/summary/Mal%C3%BD_princ_(kniha)');
  assert.deepStrictEqual(D.wikiAdresy('reserse', 'Proč je obloha modrá?'), [], 'otázka');
  assert.deepStrictEqual(D.wikiAdresy('film', 'x'.repeat(90)), []);
  const w = D.zWiki({ type: 'standard', title: 'Interstellar', description: 'film z roku 2014', extract: 'Sci-fi film.',
    thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/x.jpg' }, content_urls: { desktop: { page: 'https://cs.wikipedia.org/wiki/Interstellar' } } });
  assert.deepStrictEqual(w, { nazev: 'Interstellar', popis: 'film z roku 2014', text: 'Sci-fi film.', obrazek: 'https://upload.wikimedia.org/wikipedia/x.jpg',
    odkaz: 'https://cs.wikipedia.org/wiki/Interstellar' });
  assert.strictEqual(D.zWiki({ type: 'disambiguation', extract: 'Rozcestník' }), null);
  assert.strictEqual(D.zWiki({ type: 'standard', extract: '' }), null);
  const cizi = D.zWiki({ type: 'standard', title: 'X', extract: 'Y', thumbnail: { source: 'https://zly.example/x.jpg' }, content_urls: { desktop: { page: 'javascript:alert(1)' } } });
  assert.deepStrictEqual([cizi.obrazek, cizi.odkaz], ['', '']);
  assert.strictEqual(D.zWiki({ type: 'standard', title: 'X', extract: 'a'.repeat(900) }).text.length, 600);
});

console.log('\n' + ok + ' testů prošlo' + (process.exitCode ? ', některé SELHALY' : ''));
