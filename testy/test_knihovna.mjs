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
  const nula = { vse: 0, chci: 0, rozpracovane: 0, hotovo: 0 };
  assert.deepStrictEqual(D.pocty(null), { filmy: 0, knihy: 0, reserse: 0, ai: 0, cekaji: 0, stavy: { filmy: nula, knihy: nula, reserse: nula, ai: nula } });
});

// Rešerše AI (25. 10.): tipy z odkazů, AI tipy dne a štítek AI ve vlastní záložce, po týdnech / dnech, verdikt z `kratce`
const AI = {
  reserse: [
    { id: 'reserse-letectvi', nazev: 'Jak létá letadlo', stitky: ['fyzika'], pripraveno: '2026-10-10T20:00:00+02:00' },
    { id: 'reserse-ai-tipy-2026-10-23', nazev: 'AI tipy z X – 23. 10.', kratce: '✅ Zkusit – plugin od autora, ověřeno.', stitky: ['AI tipy', 'X'],
      pripraveno: '2026-10-23T21:12:00+02:00' },
    { id: 'reserse-tip-find-skills', nazev: 'Find skills', kratce: '⏸ Později / spíš ne – skill je skutečný, ale…', stitky: ['tip', 'AI', 'skilly'],
      pripraveno: '2026-10-21T20:21:00+02:00' },
    { id: 'reserse-tip-brotli', nazev: 'Brotli RCE', kratce: '✅ Zkusit (= aktualizovat) – jádro potvrzené.', stitky: ['tip', 'bezpečnost'],
      pripraveno: '2026-10-25T12:00:00+02:00' },
    { id: 'reserse-cosi-ai', nazev: 'Jak fungují jazykové modely', kratce: 'Bez verdiktu.', stitky: ['AI'], pripraveno: '2026-10-16T10:00:00+02:00' },
    { id: 'reserse-tip-reklama', nazev: 'Plugin X', kratce: '❌ Ne – reklama na placený plugin.', stitky: ['tip'], pripraveno: '2026-10-20T09:00:00+02:00' }
  ],
  moje: { 'reserse-tip-find-skills': { stav: 'hotovo' } }
};

test('Rešerše AI: tipy, AI tipy dne a štítek AI ve vlastní záložce, zbytek v Rešerších; počty a filtr přečteno', () => {
  assert.deepStrictEqual(D.ZALOZKY.map((z) => z[0]), ['filmy', 'knihy', 'reserse', 'ai']);
  assert.deepStrictEqual(D.reserseZalozky(AI, '', 'vse', 'reserse').map((r) => r.id), ['reserse-letectvi']);
  assert.strictEqual(D.reserseZalozky(AI, '', 'vse', 'ai').length, 5);
  assert.deepStrictEqual(D.reserseZalozky(AI, 'skills', 'vse', 'ai').map((r) => r.id), ['reserse-tip-find-skills']);
  assert.deepStrictEqual(D.reserseZalozky(AI, '', 'hotovo', 'ai').map((r) => r.id), ['reserse-tip-find-skills']);
  assert.strictEqual(D.reserseZalozky(AI, '', 'bez', 'ai').length, 4);
  const p = D.pocty(AI);
  assert.deepStrictEqual([p.reserse, p.ai, p.stavy.ai.vse, p.stavy.ai.hotovo, p.stavy.reserse.vse], [1, 5, 5, 1, 1]);
});

test('Rešerše AI: verdikt ze začátku krátce (i „Později / spíš ne“, „Zkusit (= aktualizovat)“), bez verdiktu null; počty', () => {
  assert.deepStrictEqual(D.verdikt(AI.reserse[1]), { klic: 'zkusit', znak: '✅', text: 'Zkusit', zbytek: 'plugin od autora, ověřeno.' });
  assert.deepStrictEqual(D.verdikt(AI.reserse[2]), { klic: 'pozdeji', znak: '⏸', text: 'Později / spíš ne', zbytek: 'skill je skutečný, ale…' });
  assert.strictEqual(D.verdikt(AI.reserse[3]).text, 'Zkusit (= aktualizovat)');
  assert.strictEqual(D.verdikt(AI.reserse[4]), null);
  assert.strictEqual(D.verdikt({ kratce: '⏸️ Později – s variantou znaku' }).zbytek, 's variantou znaku');
  assert.deepStrictEqual(D.poctyVerdiktu(AI.reserse), { zkusit: 2, kousek: 0, pozdeji: 1, ne: 1 });
});

test('Rešerše AI: po týdnech (pondělí–neděle) a po dnech, nejnovější nahoře; názvy týdne a dne', () => {
  const ted = Date.parse('2026-10-25T18:00:00+01:00'); // neděle – po přechodu na zimní čas
  const seznam = D.reserseZalozky(AI, '', 'vse', 'ai');
  const tydny = D.skupinyCasu(seznam, 'tyden');
  assert.deepStrictEqual(tydny.map((t) => t.polozky.map((r) => r.id)), [
    ['reserse-tip-brotli', 'reserse-ai-tipy-2026-10-23', 'reserse-tip-find-skills', 'reserse-tip-reklama'],
    ['reserse-cosi-ai']]);
  assert.deepStrictEqual(D.nazevTydne(tydny[0].od, ted), { nazev: '19.–25. 10.', kdy: 'tento týden' });
  assert.deepStrictEqual(D.nazevTydne(tydny[1].od, ted), { nazev: '12.–18. 10.', kdy: 'minulý týden' });
  assert.strictEqual(D.nazevTydne(D.zacatekTydne(Date.parse('2026-10-29T12:00:00+01:00')), ted).nazev, '26. 10. – 1. 11.');
  const dny = D.skupinyCasu(seznam, 'den');
  assert.strictEqual(dny.length, 5);
  assert.deepStrictEqual(D.nazevDne(dny[0].od, ted), { nazev: 'neděle 25. 10.', kdy: 'dnes' });
  assert.deepStrictEqual(D.nazevDne(dny[1].od, ted), { nazev: 'pátek 23. 10.', kdy: '' });
  assert.deepStrictEqual(D.skupinyCasu([{ id: 'x' }], 'den'), [{ od: 0, polozky: [{ id: 'x' }] }]);
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

// ---------------------------------------------------------------- podstránka karty (12. 10.)

const ROZSIRENA = {
  id: 'film-zkusebni-let', druh: 'film', nazev: 'Zkušební let', obsah: 'Děj.', proc: 'Proč.',
  tvurci: [{ role: 'režie a scénář', jmena: ['Jana Testová'] }, { role: 'hrají', jmena: ['Karel Zkušební', 'Eva Pokusná'] }, { role: 'hudba', jmena: ['A', 'B', 'C'] }],
  herci: [{ jmeno: 'Karel Zkušební', postava: 'pilot' }], lide: [{ jmeno: 'Jana Testová', role: 'režie' }],
  fakta: [{ co: 'Rozpočet', hodnota: '1 mil.' }],
  sekce: [{ id: 'vznik', nadpis: 'Jak vznikal: IMAX, 57 dní a výbuch bez počítače', odstavce: ['a'] }, { nadpis: 'Proč jsou některé scény černobílé a jiné barevné', body: ['b'] },
    { id: 'ŠPATNĚ!', nadpis: 'Hudba', odstavce: ['c'] }, { nadpis: '', odstavce: [] }],
  serie: { dily: [{ nazev: 'Díl 1' }] }, zajimavosti: ['z'], kdeSledovat: { text: 'Na streamu.' },
  podobne: [{ nazev: 'Maják', id: 'serial-majak' }, { nazev: 'Malý princ' }, { nazev: 'Interstellar', rok: 2014 }, { nazev: 'Nový tip', proc: 'proč' }, { proc: 'bez názvu' }]
};

test('adresa podstránky #knihovna/<id>[/<záložka>]: jen platné id a známá záložka, jinak nic; výchozí záložka bez adresy', () => {
  assert.strictEqual(D.adresaPolozky('film-oppenheimer'), '#knihovna/film-oppenheimer');
  assert.strictEqual(D.adresaPolozky('film-oppenheimer', 'herci'), '#knihovna/film-oppenheimer/herci');
  assert.strictEqual(D.adresaPolozky('film-oppenheimer', ''), '#knihovna/film-oppenheimer', 'výchozí záložka se nepíše');
  assert.strictEqual(D.adresaPolozky('film-oppenheimer', 'nesmysl'), '#knihovna/film-oppenheimer', 'neznámá záložka se nepíše');
  assert.strictEqual(D.idZAdresy('#knihovna/film-oppenheimer'), 'film-oppenheimer');
  assert.strictEqual(D.idZAdresy('#knihovna/film-oppenheimer/zakulisi'), 'film-oppenheimer');
  assert.strictEqual(D.zalozkaZAdresy('#knihovna/film-oppenheimer/zakulisi'), 'zakulisi');
  assert.strictEqual(D.zalozkaZAdresy('#knihovna/film-oppenheimer'), '');
  assert.strictEqual(D.idZAdresy(D.adresaPolozky('reserse-manhattan', 'pojmy')), 'reserse-manhattan');
  assert.strictEqual(D.zalozkaZAdresy(D.adresaPolozky('reserse-manhattan', 'pojmy')), 'pojmy');
  ['', '#knihovna', '#knihovna/', '#posta', '#knihovna/Film X', '#knihovna/../moje', '#knihovna/a/b', '#knihovna/a/herci/x', '#knihovna/a/Herci', '#knihovna/%E0%A4%A',
    '#knihovna/<script>', '#knihovna/a/<b>'].forEach((h) => {
    assert.strictEqual(D.idZAdresy(h), '', h);
    assert.strictEqual(D.zalozkaZAdresy(h), '', h);
  });
});

test('záložky karty: jen ty, které karta má, v pořadí; názvy podle obsahu a druhu; sekce jako podzáložky (klíče podle id, jinak pořadí)', () => {
  assert.deepStrictEqual(D.zalozkyKarty(ROZSIRENA), [['prehled', 'Přehled'], ['herci', 'Herci a tvůrci'], ['zakulisi', 'Zákulisí'], ['fakta', 'Fakta a zajímavosti'],
    ['serie', 'Série'], ['kde', 'Kde sledovat'], ['podobne', 'Podobné']]);
  assert.ok(D.zalozkyKarty(ROZSIRENA).length <= 7, 'nejvýš 7 záložek');
  assert.deepStrictEqual(D.sekcePodzalozek(ROZSIRENA).map((s) => [s.klic, s.kratky]), [['kn-s-vznik', 'Jak vznikal'], ['kn-s-2', 'Proč jsou některé scény…'], ['kn-s-3', 'Hudba']]);
  assert.strictEqual(D.sekcePodzalozek(ROZSIRENA)[0].nadpis, 'Jak vznikal: IMAX, 57 dní a výbuch bez počítače', 'celý nadpis zůstává');
  assert.deepStrictEqual(D.sekcePodzalozek({ sekce: [{ id: 'a', nadpis: 'A' }, { id: 'a', nadpis: 'B' }] }).map((s) => s.klic), ['kn-s-a', 'kn-s-2-1'], 'stejné id → jiný klíč');
  // kniha: Postavy a autor, Svět a autor, Kde sehnat; jen související
  assert.deepStrictEqual(D.zalozkyKarty({ druh: 'kniha', nazev: 'K', obsah: 'o', postavy: [{ jmeno: 'Will' }], lide: [{ jmeno: 'A', role: 'autor' }], sekce: [{ nadpis: 'Svět' }],
    kdeSledovat: { text: 'knihovna' }, souvisi: [{ id: 'film-x' }] }).map((z) => z.join(':')),
    ['prehled:Přehled', 'postavy:Postavy a autor', 'zakulisi:Svět a autor', 'kde:Kde sehnat', 'podobne:Související']);
  // starší karta: tvůrci jen z rolí (aspoň dvě role), zajímavosti bez faktů, odkazy bez „kde“
  assert.deepStrictEqual(D.zalozkyKarty({ druh: 'film', nazev: 'X', tvurci: [{ role: 'režie', jmena: ['A'] }, { role: 'hrají', jmena: ['B'] }], zajimavosti: ['z'],
    odkazy: [{ nazev: 'ČSFD', url: 'https://www.csfd.cz/' }] }).map((z) => z[1]), ['Tvůrci', 'Zajímavosti', 'Odkazy a zdroje']);
  assert.deepStrictEqual(D.zalozkyKarty({ druh: 'kniha', nazev: 'K', tvurci: [{ role: 'autor', jmena: ['A'] }] }), [], 'jen autor (je v hlavičce) – žádná záložka');
  assert.deepStrictEqual(D.zalozkyKarty({ druh: 'film', nazev: 'X', kratce: 'jen krátce' }), [], 'stará jednoduchá karta nemá pás');
  assert.deepStrictEqual(D.zalozkyKarty({ druh: 'serial', nazev: 'S', serie: { dily: [{ nazev: '1. řada' }] } }).map((z) => z[1]), ['Řady a díly']);
  // rešerše: Shrnutí (i jen s dalšími otázkami), Obsah, Časová osa, Pojmy, Zdroje
  assert.deepStrictEqual(D.zalozkyReserse({ kratce: 'k', sekce: [{ nadpis: 'Vztlak', odstavce: ['x'] }], casovaOsa: [{ kdy: '1903', co: 'let' }], pojmy: [{ pojem: 'p' }],
    dalsiOtazky: ['?'], zdroje: [{ nazev: 'z', url: 'https://example.com' }] }).map((z) => z[1]), ['Shrnutí', 'Obsah', 'Časová osa', 'Pojmy', 'Zdroje']);
  assert.deepStrictEqual(D.zalozkyReserse({ dalsiOtazky: ['?'] }).map((z) => z[0]), ['shrnuti']);
  assert.strictEqual(D.kratkyNazev('Hudba: housle, tikání a 21 změn tempa'), 'Hudba');
  assert.strictEqual(D.kratkyNazev('Krátký'), 'Krátký');
  assert.strictEqual(D.kratkyNazev('a'.repeat(40)), 'a'.repeat(25) + '…', 'bez mezery natvrdo');
  assert.strictEqual(D.kotvaSekce({ id: 'Vznik' }, 0), 'kn-s-vznik');
  assert.strictEqual(D.kotvaSekce({ id: '"><img>' }, 4), 'kn-s-5');
});

test('záložky: platná (neznámá → první), sousední pro šipky dokola, Home / End', () => {
  const z = D.zalozkyKarty(ROZSIRENA);
  assert.strictEqual(D.platnaZalozka(z, 'zakulisi'), 'zakulisi');
  assert.strictEqual(D.platnaZalozka(z, ''), 'prehled');
  assert.strictEqual(D.platnaZalozka(z, 'pojmy'), 'prehled', 'záložka, kterou karta nemá → výchozí');
  assert.strictEqual(D.platnaZalozka([], 'herci'), '');
  assert.strictEqual(D.sousedniZalozka(z, 'prehled', 1), 'herci');
  assert.strictEqual(D.sousedniZalozka(z, 'prehled', -1), 'podobne', 'dokola');
  assert.strictEqual(D.sousedniZalozka(z, 'podobne', 1), 'prehled');
  assert.strictEqual(D.sousedniZalozka(z, 'fakta', 'prvni'), 'prehled');
  assert.strictEqual(D.sousedniZalozka(z, 'fakta', 'posledni'), 'podobne');
  assert.strictEqual(D.sousedniZalozka(z, 'neni', 1), 'herci', 'neznámá jako první');
});

test('hodnocení na dlaždici krátce: zdroj bez závorky, první hodnota a „…“', () => {
  assert.deepStrictEqual(D.hodnoceniNaDlazdici({ zdroj: 'ČSFD (1. · 2. · 3. díl)', hodnota: '81 % · 80 % · 76 %' }), { zdroj: 'ČSFD', hodnota: '81 % …' });
  assert.deepStrictEqual(D.hodnoceniNaDlazdici({ zdroj: 'IMDb', hodnota: '8,3/10' }), { zdroj: 'IMDb', hodnota: '8,3/10' });
  assert.deepStrictEqual(D.hodnoceniNaDlazdici({ zdroj: '(jen závorka)', hodnota: 5 }), { zdroj: '(jen závorka)', hodnota: '5' });
  assert.strictEqual(D.hodnoceniNaDlazdici(null), null);
});


test('tvůrci bez „hrají“, když jsou herci zvlášť; hlavní tvůrce do hlavičky; herci v hledání', () => {
  assert.deepStrictEqual(D.tvurciBezHercu(ROZSIRENA).map((t) => t.role), ['režie a scénář', 'hudba']);
  assert.strictEqual(D.tvurciBezHercu({ tvurci: [{ role: 'hrají', jmena: ['X'] }] }).length, 1, 'bez herců zůstanou');
  assert.strictEqual(D.hlavniTvurce(ROZSIRENA), 'Režie a scénář Jana Testová');
  assert.strictEqual(D.hlavniTvurce({ tvurci: [{ role: 'hudba', jmena: ['A', 'B', 'C'] }] }), 'Hudba A, B a další');
  assert.strictEqual(D.hlavniTvurce({}), '');
  assert.deepStrictEqual(D.kartyZalozky({ karty: [ROZSIRENA] }, 'filmy', 'vse', 'zkusebni karel').map((x) => x.id), ['film-zkusebni-let']);
});

test('podobné: karta v knihovně podle id i názvu, čekající požadavek, jinak Přidat se správným druhem', () => {
  const data = Object.assign({}, DATA, { pozadavky: DATA.pozadavky.concat([{ id: 'p-20261012-1000-xy', druh: 'film', text: 'interstellar', kdy: '2026-10-12T10:00:00+02:00' }]) });
  const p = D.podobne(data, ROZSIRENA);
  assert.deepStrictEqual(p.map((o) => [o.nazev, o.id, o.ceka, o.druh]), [
    ['Maják', 'serial-majak', '', 'serial'],
    ['Malý princ', '', '', 'film'],                       // kniha stejného jména je v jiné části – film se přidat dá
    ['Interstellar', '', 'p-20261011-2210-ab', 'film'],   // první čekající se stejným textem (bez ohledu na velikost)
    ['Nový tip', '', '', 'film']]);
  assert.strictEqual(D.podobne(data, { druh: 'kniha', podobne: [{ nazev: 'Malý princ' }] })[0].id, 'kniha-maly-princ', 'u knihy podle názvu v Knihách');
  assert.strictEqual(D.podobne(data, { druh: 'serial', podobne: [{ nazev: 'Černobyl' }] })[0].ceka, 'p-20261011-2220-ef', 'seriál čeká');
  assert.deepStrictEqual(D.podobne(data, null), []);
});

test('fotky lidí jen z Wikimedia Commons (upload.wikimedia.org)', () => {
  assert.strictEqual(D.fotoUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/330px-X.jpg'), 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/330px-X.jpg');
  ['http://upload.wikimedia.org/x.jpg', 'https://example.com/x.jpg', 'https://upload.wikimedia.org.zly.cz/x.jpg', 'javascript:alert(1)', '', null].forEach((u) =>
    assert.strictEqual(D.fotoUrl(u), '', String(u)));
});

console.log('\n' + ok + ' testů prošlo' + (process.exitCode ? ', některé SELHALY' : ''));
