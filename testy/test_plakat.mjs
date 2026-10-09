// Test plakátu (čisté funkce js/plakat.js a data js/plakat_data.js) – node testy/test_plakat.mjs
// Zápasy jako ve FOTBAL.json (fotbal.cz): víkendy 17.–18. 10. a 24.–25. 10. 2026 s přeloženými zápasy.
process.env.TZ = 'Europe/Prague';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const P = await import('../js/plakat.js');
const D = await import('../js/plakat_data.js');
const KOREN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}
const z = (tym, zacatek, domaci, hoste, navic) => Object.assign({ tym, zacatek, domaci, hoste, doma: /Vnorovy/.test(domaci), misto: '', vysledek: '' }, navic);
const FOTBAL = { zapasy: [
  z('dorost', '2026-10-11T12:30:00+02:00', 'Dubňany/Mutěnice', 'FK Agro Vnorovy'),
  z('dorost', '2026-10-17T10:00:00+02:00', 'FK Hodonín "B"', 'FK Agro Vnorovy'),
  z('A', '2026-10-17T14:30:00+02:00', 'FK Agro Vnorovy', 'FK Milotice'),
  z('B', '2026-10-18T14:30:00+02:00', 'Petrov', 'Vnorovy B'),
  z('A', '2026-10-21T17:00:00+02:00', 'FK Agro Vnorovy', 'TJ Slavoj Rohatec'), // středa po víkendu → V TÝDNU
  z('A', '2026-10-24T14:30:00+02:00', 'TJ Sokol Hroznová Lhota', 'FK Agro Vnorovy', { poznamka: 'schváleno STK' }),
  z('dorost', '2026-10-25T11:45:00+01:00', 'FK Agro Vnorovy', 'TJ Velká nad Veličkou', { puvodniTermin: '2026-10-24 11:45', poznamka: 'Původní termín: 24.10.2026 11:45' }),
  z('B', '2026-10-25T14:30:00+01:00', 'Vnorovy B', 'Kozojídky', { puvodniTermin: '2026-10-24 14:30' })
] };

console.log('Plakát');

test('data: LOGA = soubory v plakat/znaky, znaky mládeže z rozlosování existují, 13 kol podzimu', () => {
  assert.deepStrictEqual(D.LOGA.slice().sort(), fs.readdirSync(path.join(KOREN, 'plakat', 'znaky')).sort());
  assert.ok(fs.existsSync(path.join(KOREN, 'plakat', 'qr', 'instagram.png')), 'QR na Instagram');
  Object.keys(D.MLADEZ).forEach((s) => {
    assert.ok(D.KOLA.indexOf(s) >= 0, 'mládež mimo kola: ' + s);
    D.MLADEZ[s].doma.concat(D.MLADEZ[s].venku).forEach((r) => assert.ok(D.LOGA.indexOf(r[2]) >= 0, 'chybí znak ' + r[2] + ' (' + s + ')'));
  });
  Object.keys(D.ALIASY).forEach((k) => assert.ok(D.LOGA.indexOf(D.ALIASY[k]) >= 0, 'alias na neexistující znak: ' + k));
  assert.strictEqual(D.KOLA.length, 13);
  assert.ok(D.KOLA.every((s) => new Date(s + 'T12:00').getDay() === 6), 'kola jsou soboty');
});

test('víkendy: „10. kolo“ = 17.–18. 10., výchozí nejbližší víkend, zápas v týdnu k víkendu (pátek před, po–čt po)', () => {
  assert.strictEqual(P.popisVikendu('2026-10-17', Date.parse('2026-10-09')), '10. kolo · 17.–18. 10.');
  assert.strictEqual(P.popisVikendu('2026-10-24', Date.parse('2026-10-09')), '11. kolo · 24.–25. 10.');
  assert.strictEqual(P.popisVikendu('2026-10-31', Date.parse('2026-10-09')), '12. kolo · 31. 10.–1. 11.');
  assert.strictEqual(P.popisVikendu('2027-03-13', Date.parse('2026-10-09')), '13.–14. 3. 2027');
  assert.strictEqual(P.vychoziVikend(new Date(2026, 9, 9, 18).getTime()), '2026-10-10');  // pátek → zítřejší sobota
  assert.strictEqual(P.vychoziVikend(new Date(2026, 9, 17, 9).getTime()), '2026-10-17');  // sobota → dnešek
  assert.strictEqual(P.vychoziVikend(new Date(2026, 9, 18, 21).getTime()), '2026-10-17'); // neděle → včerejší sobota
  assert.strictEqual(P.vychoziVikend(new Date(2026, 9, 19, 7).getTime()), '2026-10-24');  // pondělí → další
  assert.strictEqual(P.vikendZapasu(Date.parse('2026-10-16T16:45:00+02:00')), '2026-10-17'); // pátek
  assert.strictEqual(P.vikendZapasu(Date.parse('2026-10-21T17:00:00+02:00')), '2026-10-17'); // středa po víkendu
  assert.strictEqual(P.vikendZapasu(Date.parse('2026-10-25T11:45:00+01:00')), '2026-10-24'); // neděle (konec letního času)
  assert.deepStrictEqual(P.datumPlakatu('2026-10-17'), { datum: '17.—18.', mesic: 'ŘÍJNA 2026' });
  assert.deepStrictEqual(P.datumPlakatu('2026-10-31'), { datum: '31. 10.—1. 11.', mesic: '2026' });
  const v = P.seznamVikendu(FOTBAL, { '2027-03-13': {} }, ['2026-12-05']);
  assert.ok(v.indexOf('2026-08-15') === 0 && v.indexOf('2027-03-13') === v.length - 1 && v.indexOf('2026-12-05') > 0, v.join());
});

test('17.–18. 10.: doma jen A (so 14:30 Milotice), venku B a dorost, mládež z rozlosování, v týdnu pátek i středa', () => {
  const { stav, poznamky } = P.zRozlosovani('2026-10-17', FOTBAL, {});
  assert.deepStrictEqual(stav.doma, [{ tym: 'A-TÝM', soutez: '6. LIGA DOSPĚLÍ JMKFS (B)', souper: 'MILOTICE', logo: 'milotice.png', den: 'SOBOTA 17. 10.', cas: '14:30' }]);
  assert.deepStrictEqual(stav.venku.map((r) => [r.kat, r.souper, r.logo, r.cas]), [['BENFIKA', 'PETROV', 'petrov.jpg', 'NE 14:30'], ['DOROST', 'HODONÍN B', 'hodonin.png', 'SO 10:00']]);
  assert.deepStrictEqual(stav.domaMladez.map((r) => r.kat + ' ' + r.souper), ['ST. ŽÁCI RATÍŠKOVICE B', 'ST. PŘÍPRAVKA LIPOV', 'ML. PŘÍPRAVKA TĚMICE A']);
  assert.deepStrictEqual(stav.vTydnu.map((r) => [r.kat, r.doma, r.souper, r.den, r.cas]),
    [['ML. ŽÁCI', false, 'HR. LHOTA/LIPOV', 'PÁ 16. 10.', '16:45'], ['A-TÝM', true, 'ROHATEC', 'ST 21. 10.', '17:00']]);
  assert.deepStrictEqual([stav.datum, stav.mesic, stav.nadpis, stav.vyzva, stav.paticka.misto, stav.nasZnak],
    ['17.—18.', 'ŘÍJNA 2026', 'PROGRAM VÍKENDU', 'PŘIJĎTE PODPOŘIT NAŠE KLUKY!', 'AGRO ARÉNA VNOROVY', 'vnorovy.png']);
  assert.deepStrictEqual(poznamky, []);
  assert.deepStrictEqual(P.chybejiciZnaky(stav), []);
});

test('24.–25. 10.: B a dorost doma v neděli (přeloženo ze soboty), A v sobotu venku, poznámka svazu', () => {
  const { stav, poznamky } = P.zRozlosovani('2026-10-24', FOTBAL, {});
  assert.deepStrictEqual(stav.doma.map((r) => [r.tym, r.souper, r.logo, r.den, r.cas]),
    [['BENFIKA', 'KOZOJÍDKY', 'kozojidky.png', 'NEDĚLE 25. 10.', '14:30'], ['DOROST', 'VELKÁ NAD VELIČKOU', 'velka-nad-velickou.png', 'NEDĚLE 25. 10.', '11:45']]);
  assert.deepStrictEqual(stav.venku[0], { kat: 'A-TÝM', souper: 'HROZNOVÁ LHOTA', logo: 'hroznova-lhota.png', cas: 'SO 14:30' });
  assert.deepStrictEqual(poznamky, ['A-TÝM – HROZNOVÁ LHOTA: schváleno STK', 'DOROST – VELKÁ NAD VELIČKOU: přeloženo z so 24. 10. 11:45 na ne 25. 10. 11:45',
    'BENFIKA – KOZOJÍDKY: přeloženo z so 24. 10. 14:30 na ne 25. 10. 14:30']);
});

test('soupeř na plakát a jeho znak: zkratky klubů pryč, aliasy, obec bez diakritiky, sdružená družstva, chybějící znak', () => {
  const ocek = { 'FK Hodonín "B"': ['HODONÍN B', 'hodonin.png'], 'MSK Břeclav "B"': ['BŘECLAV B', 'breclav.png'], 'FC Kyjov 1919': ['KYJOV', 'kyjov.png'],
    'TJ Slavoj Velké Pavlovice': ['VELKÉ PAVLOVICE', 'velke-pavlovice.png'], 'FK Baník Ratíškovice "A"': ['RATÍŠKOVICE A', 'ratiskovice.jpg'],
    'FKM Podluží': ['PODLUŽÍ', 'podluzi.png'], 'SK Podlužan Prušánky': ['PRUŠÁNKY', 'prusanky.png'], 'Veselí n. Moravou B': ['VESELÍ N. MORAVOU B', 'veseli-nad-moravou.png'],
    'TJ START Brno': ['START BRNO', 'start-brno.png'], 'Dubňany/Mutěnice': ['DUBŇANY/MUTĚNICE', 'dubnany.png'], 'Hroznová Lhota/Lipov': ['HROZNOVÁ LHOTA/LIPOV', 'hroznova-lhota.png'],
    'TJ Sokol Těšany, z. s.': ['TĚŠANY', 'tesany.jpg'], 'SK Neznámé Město': ['NEZNÁMÉ MĚSTO', ''] };
  Object.keys(ocek).forEach((n) => assert.deepStrictEqual([P.nazevNaPlakat(n), P.znakSoupere(n, {})], ocek[n], n));
  // alias z nastavení má přednost
  assert.strictEqual(P.znakSoupere('SK Neznámé Město', { aliasy: { 'neznámé město': 'kyjov.png' } }), 'kyjov.png');
  assert.strictEqual(P.slug('Velká nad Veličkou'), 'velka-nad-velickou');
});

test('nastavení: prázdné = výchozí, do motoru jen rozdíl, soutěže a týmy z nastavení na plakátu', () => {
  const n = P.nastaveniPlakatu({ tymy: { B: 'B-TÝM', A: '' }, misto: 'HŘIŠTĚ VNOROVY', aliasy: { 'slavoj x': 'rohatec.png' } });
  assert.deepStrictEqual([n.tymy.A, n.tymy.B, n.tymy.dorost, n.misto, n.nadpis, n.popiskyOd], ['A-TÝM', 'B-TÝM', 'DOROST', 'HŘIŠTĚ VNOROVY', 'PROGRAM VÍKENDU', '2026-10-17']);
  assert.deepStrictEqual(P.rozdilNastaveni(n), { misto: 'HŘIŠTĚ VNOROVY', tymy: { B: 'B-TÝM' }, aliasy: { 'SLAVOJ X': 'rohatec.png' } });
  assert.deepStrictEqual(P.rozdilNastaveni({}), {});
  const s = P.zRozlosovani('2026-10-24', FOTBAL, { tymy: { B: 'B-TÝM' }, souteze: { B: 'III. TŘÍDA' } }).stav;
  assert.deepStrictEqual([s.doma[0].tym, s.doma[0].soutez], ['B-TÝM', 'III. TŘÍDA']);
});

test('uložený plakát: chybějící pole doplněná (starý nebo poškozený záznam nesmí shodit stránku)', () => {
  const s = P.normalizujPlakat({ nadpis: 'X', doma: [{ tym: 'A-TÝM', souper: 'MILOTICE' }, null], venku: 'nic' }, '2026-10-17', {});
  assert.deepStrictEqual([s.nadpis, s.datum, s.doma.length, s.doma[0].cas, s.venku.length, s.vTydnu.length, s.paticka.misto], ['X', '17.—18.', 1, '', 0, 0, 'AGRO ARÉNA VNOROVY']);
});

test('HTML plakátu: jedna dlaždice = single, 3 řádky mládeže = m3, v týdnu = tyden, chybějící znak = čárkovaný rámeček', () => {
  const s = P.zRozlosovani('2026-10-17', FOTBAL, {}).stav;
  s.venku[0].logo = '';
  const h = P.plakatHtml(s, { znaky: 'plakat/znaky/', qr: 'plakat/qr/instagram.png' });
  assert.ok(/class="blok single"/.test(h) && /class="left m3"/.test(h) && /class="right tyden"/.test(h), 'třídy velikostí');
  assert.ok(/<div class="ph sm">PETROV<\/div>/.test(h), 'čárkovaný rámeček se zkratkou');
  assert.ok(/AGRO – ROHATEC/.test(h) && /HR\. LHOTA\/LIPOV – AGRO/.test(h), 'směr zápasu v týdnu');
  const prazdny = P.plakatHtml(P.normalizujPlakat({}, '2026-12-05', {}), { znaky: '', qr: '' });
  assert.ok(/TENTO VÍKEND<br>HRAJEME JEN VENKU/.test(prazdny), 'bez domácích zápasů');
});

test('souhrn pro Clauda: domácí zápasy, hlavní zápas áčka, venku, v týdnu, tabulka z fotbal.cz', () => {
  const s = P.zRozlosovani('2026-10-17', FOTBAL, {}).stav;
  const tab = { A: { celkem: [{ poradi: 5, klub: 'FK Milotice', body: 13 }, { poradi: 12, klub: 'FK Agro Vnorovy', body: 4 }] } };
  const t = P.souhrnProClauda(s, '2026-10-17', Object.assign({ tabulky: tab }, FOTBAL), {});
  assert.ok(/^Plakát FK Agro Vnorovy na víkend 17\.–18\. 10\. 2026 \(10\. kolo podzimu\)\./.test(t), t);
  assert.ok(/- A-TÝM \(6\. LIGA DOSPĚLÍ JMKFS \(B\)\): sobota 17\. 10\. 14:30 proti MILOTICE/.test(t), t);
  assert.ok(/Hlavní zápas: A-TÝM – MILOTICE \(sobota 17\. 10\. 14:30\)\./.test(t), t);
  assert.ok(/- DOROST: SO 10:00 HODONÍN B/.test(t) && /- A-TÝM: ST 21\. 10\. 17:00 doma proti ROHATEC/.test(t), t);
  assert.ok(/- A-TÝM: 12\. místo, 4 b\.; MILOTICE 5\. místo, 13 b\./.test(t), t);
  // bez domácích zápasů: hlavní je áčko venku
  const v = P.souhrnProClauda(P.normalizujPlakat({ venku: [{ kat: 'A-TÝM', souper: 'ŠARDICE', cas: 'SO 15:00' }] }, '2026-10-03', {}), '2026-10-03', null, {});
  assert.ok(/Muži ani dorost tento víkend doma nehrají\./.test(v) && /Hlavní zápas: A-TÝM venku – ŠARDICE \(SO 15:00\)\./.test(v), v);
});

console.log('\n' + ok + ' prošlo' + (process.exitCode ? ', něco SELHALO' : ''));
