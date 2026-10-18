// Test výběru oznámení ve Windows a čísla na ikoně (čisté funkce js/pc_vyber.js) – node testy/test_pc_vyber.mjs
// Data jako z motoru a serveru (pošta, Zdraví, plány Instagramu); časy pevné, nezávislé na dnešku.
process.env.TZ = 'Europe/Prague';
import assert from 'node:assert';
const V = await import('../js/pc_vyber.js');

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}
const T = Date.parse('2026-10-18T14:00:00+02:00');
const MIN = 60e3, H = 3600e3;
const zprava = (id, stav, navic) => Object.assign({ id, ucet: 'osobni', stav, od: 'Odesílatel ' + id, predmet: 'Předmět ' + id, kdy: T - H, neprectena: true }, navic);
const relace = (start) => ({ start, zaklad: false, zname: new Set() });

console.log('Asistent na PC – oznámení a odznak');

test('kandidáti z pošty: hoří i přečtené, čeká a otázka jen nepřečtené, hlídaný zvlášť, bez Apps Scriptu a „Beru na vědomí“', () => {
  const k = V.kandidatiPosty([
    zprava('a', 'hori', { neprectena: false }), zprava('b', 'ceka'), zprava('c', 'ceka', { neprectena: false }), zprava('d', 'otazka'),
    zprava('e', 'hori', { hlidano: true }), zprava('f', 'hori', { duvod: 'hlídáš: CPP' }), zprava('g', 'hori', { tiche: true }),
    zprava('h', 'info', { vedomi: true, puvodniStav: 'hori' }), zprava('i', 'cekas'), zprava('j', 'resi')]);
  assert.deepStrictEqual(k.map((x) => x.klic), ['posta:a:hori', 'posta:b:ceka', 'posta:d:ceka', 'posta:e:hlidani', 'posta:f:hlidani']);
  assert.strictEqual(k[0].cil, 'vlakno:a');
  assert.strictEqual(k[2].otazka, true);
});

test('první vyhodnocení po otevření jen zapamatuje, co už je (žádná lavina); pak jen nové', () => {
  const r = relace(T - 5 * MIN);
  const pamet = {};
  let v = V.vyber(V.kandidatiPosty([zprava('a', 'hori'), zprava('b', 'ceka')]), pamet, r, { druhy: {}, ticho: false }, T);
  assert.strictEqual(v.ukazat.length, 0);
  assert.deepStrictEqual(v.oznacit, ['posta:a:hori', 'posta:b:ceka']);
  const p2 = V.ulozDoPameti(pamet, v.oznacit, T);
  v = V.vyber(V.kandidatiPosty([zprava('a', 'hori'), zprava('b', 'ceka'), zprava('c', 'hori', { kdy: T - MIN })]), p2, r, { druhy: {}, ticho: false }, T);
  assert.deepStrictEqual(v.ukazat.map((x) => x.klic), ['posta:c:hori'], 'nová konverzace po otevření');
  const p3 = V.ulozDoPameti(p2, v.oznacit, T);
  v = V.vyber(V.kandidatiPosty([zprava('c', 'hori', { kdy: T - MIN })]), p3, r, { druhy: {}, ticho: false }, T + MIN);
  assert.strictEqual(v.ukazat.length, 0, 'žádné opakování');
});

test('co přišlo, když byla aplikace zavřená, se neohlásí; známá konverzace, která začne hořet, ano', () => {
  const r = relace(T);
  V.vyber(V.kandidatiPosty([zprava('a', 'ceka', { neprectena: false })]), {}, r, { druhy: {} }, T); // základ (a není kandidát)
  r.zname.add('a'); // pc.js přidá všechny známé konverzace
  const v = V.vyber(V.kandidatiPosty([zprava('a', 'hori', { kdy: T - 3 * H }), zprava('z', 'hori', { kdy: T - 2 * H })]), {}, r, { druhy: {} }, T + MIN);
  assert.deepStrictEqual(v.ukazat.map((x) => x.id), ['a'], 'a začala hořet, z přišla do zavřené aplikace');
  assert.deepStrictEqual(v.oznacit.sort(), ['posta:a:hori', 'posta:z:hori'], 'obě zapamatované');
});

test('vypnutý druh a tiché hodiny 22–6: nic se neukáže, jen zapamatuje', () => {
  const r = relace(T - H);
  r.zaklad = true;
  let v = V.vyber(V.kandidatiPosty([zprava('a', 'ceka', { kdy: T })]), {}, r, { druhy: { ceka: false } }, T);
  assert.strictEqual(v.ukazat.length, 0);
  assert.deepStrictEqual(v.oznacit, ['posta:a:ceka']);
  const noc = Date.parse('2026-10-18T23:10:00+02:00');
  v = V.vyber(V.kandidatiPosty([zprava('b', 'hori', { kdy: noc })]), {}, r, { druhy: {}, ticho: true }, noc);
  assert.strictEqual(v.ukazat.length, 0, 've 23:10 ticho');
  assert.deepStrictEqual(v.oznacit, ['posta:b:hori']);
  v = V.vyber(V.kandidatiPosty([zprava('c', 'hori', { kdy: noc })]), {}, r, { druhy: {}, ticho: false }, noc);
  assert.strictEqual(v.ukazat.length, 1, 'tiché hodiny vypnuté');
  assert.strictEqual(V.jeTicho(Date.parse('2026-10-18T05:59:00+02:00')), true);
  assert.strictEqual(V.jeTicho(Date.parse('2026-10-18T06:00:00+02:00')), false);
  assert.strictEqual(V.jeTicho(Date.parse('2026-10-18T21:59:00+02:00')), false);
  assert.strictEqual(V.jeTicho(Date.parse('2026-10-18T22:00:00+02:00')), true);
});

test('soukromí: výchozí jen odesílatel a stav, s volbou i předmět; pracovní pošta', () => {
  const [k] = V.kandidatiPosty([zprava('a', 'hori', { od: 'Jan Novák', predmet: 'Smlouva o dílo', ucet: 'pracovni' })]);
  let o = V.obsah(k, false);
  assert.strictEqual(o.titul, 'Hoří · Jan Novák');
  assert.ok(!/Smlouva/.test(o.titul + o.text) && /Pracovní pošta/.test(o.text), o.text);
  o = V.obsah(k, true);
  assert.strictEqual(o.text, 'Smlouva o dílo');
  const [h] = V.kandidatiPosty([zprava('b', 'hori', { hlidano: true, od: 'Úřad' })]);
  assert.strictEqual(V.obsah(h, false).titul, 'Hlídaný odesílatel · Úřad');
  const [q] = V.kandidatiPosty([zprava('c', 'otazka', { od: 'Trenér' })]);
  assert.strictEqual(V.obsah(q, false).titul, 'Otázka pro tebe · Trenér');
});

test('Claude se ptá k jídlu: jen otázky z posledních 24 h, bez jídla v textu (jen s volbou)', () => {
  const k = V.kandidatiJidla({ '2026-10-18': { jidlo: [{ id: 'j1', co: 'pizza', otazka: { text: 'Celá, nebo půlka?', kdy: T - H } }, { id: 'j2', co: 'vejce' }] },
    '2026-10-16': { jidlo: [{ id: 'j0', co: 'rýže', otazka: { text: 'Kolik?', kdy: T - 50 * H } }] } }, T);
  assert.deepStrictEqual(k.map((x) => x.id), ['j1']);
  assert.ok(!/pizza/.test(JSON.stringify(V.obsah(k[0], false))));
  assert.strictEqual(V.obsah(k[0], true).text, 'pizza: Celá, nebo půlka?');
  assert.strictEqual(k[0].cil, 'jidlo:j1');
});

test('Instagram: čerstvě vyšlo / nevyšlo (6 h), příběh, druh v titulku; naplánované a staré ne', () => {
  const k = V.kandidatiInstagramu([
    { typ: 'reel', id: 'r1', nazev: 'A-tým: góly', z: { stav: 'hotovo', kroky: { hotovo: T - 10 * MIN } } },
    { typ: 'plakat', id: '2026-10-17', nazev: 'Plakát 17.–18. 10.', z: { stav: 'chyba', chyba: 'Token vypršel', kroky: { chyba: T - 5 * MIN } } },
    { typ: 'pribeh', id: 'p1', nazev: 'Fotka', z: { stav: 'hotovo', jenPribeh: true, zverejneno: T - MIN } },
    { typ: 'reel', id: 'r2', nazev: 'Starý', z: { stav: 'hotovo', kroky: { hotovo: T - 30 * H } } },
    { typ: 'reel', id: 'r3', nazev: 'Večer', z: { stav: 'ceka', kdy: T + H } }], T);
  assert.deepStrictEqual(k.map((x) => x.id), ['reel:r1', 'plakat:2026-10-17', 'pribeh:p1']);
  assert.strictEqual(V.obsah(k[0], false).titul, 'Reel vyšel na Instagramu');
  assert.strictEqual(V.obsah(k[1], false).titul, 'Plakát na Instagram nevyšel');
  assert.strictEqual(V.obsah(k[2], false).titul, 'Příběh vyšel na Instagramu');
  assert.ok(!/A-tým/.test(V.obsah(k[0], false).text) && /A-tým/.test(V.obsah(k[0], true).text));
  assert.strictEqual(k[0].cil, 'ig:reel:r1');
});

test('připomínka doplňku jako motor: od času do 21:00, jen každodenní a neodškrtnuté, jednou za den i hned po otevření', () => {
  const rezim = { polozky: [{ id: 'champ', nazev: 'Champion' }, { id: 'kreatin', nazev: 'Kreatin' }, { id: 'kofein', nazev: 'Kofein', jen: 'zapas' }],
    pripomenout: [{ id: 'champ', cas: '9:00' }, { id: 'kreatin', cas: '20:30' }, { id: 'kofein', cas: '8:00' }] };
  assert.strictEqual(V.kandidatDoplnku(rezim, {}, Date.parse('2026-10-18T08:30:00+02:00')).length, 0, 'ještě ne');
  let k = V.kandidatDoplnku(rezim, {}, T);
  assert.strictEqual(k.length, 1);
  assert.deepStrictEqual(k[0].nazvy, ['Champion'], 'kofein má „jen“, kreatin až večer');
  assert.strictEqual(k[0].klic, 'doplnek:2026-10-18');
  assert.strictEqual(V.kandidatDoplnku(rezim, { champ: true }, T).length, 0, 'odškrtnuté');
  assert.strictEqual(V.kandidatDoplnku(rezim, {}, Date.parse('2026-10-18T21:30:00+02:00')).length, 0, 'po 21:00 už ne');
  const v = V.vyber(k, {}, relace(T), { druhy: {} }, T);
  assert.strictEqual(v.ukazat.length, 1, 'připomínka i při prvním vyhodnocení');
  assert.ok(!/Champion/.test(V.obsah(k[0], false).text) && /Champion/.test(V.obsah(k[0], true).text));
});

test('souhrn: víc věcí naráz jedním oznámením, jen pošta → Pošta', () => {
  const k = V.kandidatiPosty([zprava('a', 'hori'), zprava('b', 'hori'), zprava('c', 'ceka'), zprava('d', 'ceka')]);
  const s = V.souhrn(k);
  assert.strictEqual(s.titul, '4 nové věci v Asistentovi');
  assert.strictEqual(s.text, 'hoří 2 · čeká 2');
  assert.strictEqual(s.cil, 'posta');
  assert.strictEqual(V.souhrn(k.concat(V.kandidatiPosty([zprava('e', 'hori')]))).titul, '5 nových věcí v Asistentovi');
});

test('paměť ohlášených: 30 dní a nejvýš 600 záznamů', () => {
  const stara = { x: T - 31 * 864e5, y: T - 29 * 864e5 };
  assert.deepStrictEqual(Object.keys(V.ulozDoPameti(stara, ['z'], T)).sort(), ['y', 'z']);
  const mnoho = {};
  for (let i = 0; i < 700; i++) mnoho['k' + i] = T - i * MIN;
  const p = V.ulozDoPameti(mnoho, [], T);
  assert.strictEqual(Object.keys(p).length, 600);
  assert.ok(p.k0 && !p.k650, 'nejstarší pryč');
});

test('číslo na ikonu: hoří + čeká + otázka / jen hoří / vypnuto; bez Apps Scriptu a Beru na vědomí', () => {
  const z = [zprava('a', 'hori'), zprava('b', 'ceka', { neprectena: false }), zprava('c', 'otazka'), zprava('d', 'cekas'), zprava('e', 'hori', { tiche: true }),
    zprava('f', 'info', { vedomi: true }), zprava('g', 'resi')];
  assert.strictEqual(V.pocetNaIkonu(z, 'pozornost'), 3);
  assert.strictEqual(V.pocetNaIkonu(z, 'hori'), 1);
  assert.strictEqual(V.pocetNaIkonu(z, 'vypnuto'), 0);
  assert.strictEqual(V.pocetNaIkonu([], 'pozornost'), 0);
});

console.log(ok + ' prošlo');
