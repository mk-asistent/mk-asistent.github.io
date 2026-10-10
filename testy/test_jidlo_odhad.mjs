// Test odhadu jídla z textu (bílkoviny, kcal, doplňky z režimu) – node testy/test_jidlo_odhad.mjs
import assert from 'node:assert';
process.env.TZ = 'Europe/Prague';
const { odhadniJidlo, denJidla, _test } = await import('../js/jidlo_odhad.js');

// doplňky z režimu (ZDRAVI_REZIM.json) – jen id a názvy
const DOPLNKY = [{ id: 'champion', nazev: 'MADMONQ Champion' }, { id: 'kreatin', nazev: 'Kreatin' }, { id: 'smoothie', nazev: 'Breakfast Smoothie' },
  { id: 'omega3', nazev: 'Omega-3' }, { id: 'joint', nazev: 'Joint Complex' }, { id: 'whey', nazev: 'Clear Whey' },
  { id: 'madmonq', nazev: 'MADMONQ s kofeinem' }, { id: 'elektrolyty', nazev: 'Elektrolyty' }, { id: 'horcik', nazev: 'Hořčík bisglycinát' }];

let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}
const o = (text, doplnky = DOPLNKY) => odhadniJidlo(text, doplnky);
const mezi = (x, od, az, co) => assert.ok(x >= od && x <= az, (co ? co + ': ' : '') + x + ' není v rozmezí ' + od + '–' + az);
const polozka = (r, co) => {
  const p = r.polozky.find((x) => x.co === co);
  assert.ok(p, 'chybí položka „' + co + '“ v ' + JSON.stringify(r.polozky.map((x) => x.co)));
  return p;
};
const nazvy = (r) => r.polozky.map((x) => x.co);
console.log('Odhad jídla');

test('„3 vejce a chleba s máslem“ → vejce ~19 g, chléb ~4–5 g, máslo ~0; celkem 20–28 g a 350–550 kcal', () => {
  const r = o('3 vejce a chleba s máslem');
  assert.deepStrictEqual(nazvy(r), ['Vejce', 'Chléb', 'Máslo']);
  mezi(polozka(r, 'Vejce').bilkoviny, 17, 21, 'vejce');
  mezi(polozka(r, 'Chléb').bilkoviny, 4, 5, 'chléb');
  mezi(polozka(r, 'Máslo').bilkoviny, 0, 1, 'máslo');
  mezi(r.bilkoviny, 20, 28, 'bílkoviny');
  mezi(r.kcal, 350, 550, 'kcal');
  assert.deepStrictEqual([r.doplnky, r.text, r.jisty], [[], '3 vejce a chleba s máslem', true]);
});

test('„kuřecí prsa 200 g s rýží“ → kuře 45–50 g bílkovin (200 g), rýže 4–6 g', () => {
  const r = o('kuřecí prsa 200 g s rýží');
  const k = polozka(r, 'Kuřecí prsa');
  assert.strictEqual(k.g, 200);
  mezi(k.bilkoviny, 45, 50, 'kuře');
  mezi(polozka(r, 'Rýže').bilkoviny, 4, 6, 'rýže');
});

test('„k obědu kuře s rýží“ (bez gramů) → typické porce, 35–50 g bílkovin', () => {
  const r = o('k obědu kuře s rýží');
  assert.deepStrictEqual(nazvy(r), ['Kuře', 'Rýže']);
  mezi(r.bilkoviny, 35, 50);
  assert.strictEqual(r.jisty, true);
});

test('„tvaroh 250g a banán“ → tvaroh polotučný 25–30 g bílkovin', () => {
  const r = o('tvaroh 250g a banán');
  const t = polozka(r, 'Tvaroh polotučný');
  assert.strictEqual(t.g, 250);
  mezi(t.bilkoviny, 25, 30, 'tvaroh');
  polozka(r, 'Banán');
});

test('„2 rohlíky se šunkou“ → 2 rohlíky (86 g) + šunka, 12–22 g bílkovin', () => {
  const r = o('2 rohlíky se šunkou');
  assert.strictEqual(polozka(r, 'Rohlík').g, 86);
  polozka(r, 'Šunka');
  mezi(r.bilkoviny, 12, 22);
});

test('„svíčková s 6 knedlíky“ → svíčková bez výchozí přílohy + 6 knedlíků; „svíčková“ sama s knedlíkem', () => {
  let r = o('svíčková s 6 knedlíky');
  assert.deepStrictEqual(nazvy(r), ['Svíčková', 'Knedlík']);
  assert.strictEqual(polozka(r, 'Knedlík').g, 270);
  mezi(r.bilkoviny, 40, 55);
  mezi(r.kcal, 850, 1200, 'kcal');
  r = o('svíčková');
  assert.deepStrictEqual(nazvy(r), ['Svíčková s knedlíkem']);
  mezi(r.bilkoviny, 35, 50);
  mezi(r.kcal, 700, 1000, 'kcal');
});

test('hotová jídla: pizza, půl pizzy, big mac, kebab, guláš s chlebem, smažený sýr (s hranolky / s bramborem)', () => {
  let r = o('pizza');
  mezi(r.bilkoviny, 30, 55);
  mezi(r.kcal, 800, 1200, 'kcal');
  assert.strictEqual(o('půl pizzy').polozky[0].g, 200);
  r = o('big mac');
  assert.deepStrictEqual(nazvy(r), ['Big Mac']);
  mezi(r.bilkoviny, 22, 30);
  mezi(r.kcal, 450, 600, 'kcal');
  mezi(o('kebab').bilkoviny, 30, 50, 'kebab');
  assert.deepStrictEqual(nazvy(o('guláš s chlebem')), ['Guláš', 'Chléb']);
  assert.deepStrictEqual(nazvy(o('smažený sýr')), ['Smažený sýr s hranolky']);
  assert.deepStrictEqual(nazvy(o('smažený sýr s bramborem a tatarkou')), ['Smažený sýr', 'Brambory', 'Tatarská omáčka']);
  assert.deepStrictEqual(nazvy(o('řízek s bramborovým salátem')), ['Řízek', 'Bramborový salát']);
});

test('„2 piva“ → bílkoviny 1–3, kcal ~400; malé a velké pivo, nealko', () => {
  const r = o('2 piva');
  assert.strictEqual(r.polozky[0].g, 1000);
  mezi(r.bilkoviny, 1, 3);
  mezi(r.kcal, 350, 450, 'kcal');
  assert.strictEqual(o('malé pivo').polozky[0].g, 300);
  assert.strictEqual(o('velké pivo').polozky[0].g, 500);
  assert.deepStrictEqual(nazvy(o('nealko pivo')), ['Nealkoholické pivo']);
});

test('„káva s mlékem“ = jedna položka (ne káva + mléko), „hrnek kávy s mlékem“, „kafe bez cukru a mléka“', () => {
  let r = o('káva s mlékem');
  assert.deepStrictEqual(nazvy(r), ['Káva s mlékem']);
  mezi(r.bilkoviny, 0, 3);
  mezi(r.kcal, 15, 60, 'kcal');
  r = o('hrnek kávy s mlékem');
  assert.deepStrictEqual([nazvy(r), r.polozky[0].g], [['Káva s mlékem'], 250]);
  assert.deepStrictEqual(nazvy(o('kafe bez cukru a mléka')), ['Káva']);
  assert.deepStrictEqual(nazvy(o('káva s mlékem a cukrem')), ['Káva s mlékem', 'Cukr']);
});

test('„elektrolyty“ → jen doplněk: doplnky [elektrolyty], text \'\', žádné jídlo', () => {
  const r = o('elektrolyty');
  assert.deepStrictEqual([r.doplnky, r.text, r.polozky, r.bilkoviny, r.kcal, r.jisty], [['elektrolyty'], '', [], 0, 0, true]);
});

test('„kreatin, omega a hořčík“ → tři doplňky, žádné jídlo', () => {
  const r = o('kreatin, omega a hořčík');
  assert.deepStrictEqual([r.doplnky, r.text, r.polozky], [['kreatin', 'omega3', 'horcik'], '', []]);
});

test('„kuře s rýží a elektrolyty“ → jídlo + doplněk, text bez elektrolytů', () => {
  const r = o('kuře s rýží a elektrolyty');
  assert.deepStrictEqual([nazvy(r), r.doplnky, r.text], [['Kuře', 'Rýže'], ['elektrolyty'], 'kuře s rýží']);
});

test('„proteinová tyčinka“ → jídlo (15–20 g bílkovin), ne doplněk Clear Whey; proteinový pudink taky jídlo', () => {
  let r = o('proteinová tyčinka');
  assert.deepStrictEqual([nazvy(r), r.doplnky], [['Proteinová tyčinka'], []]);
  mezi(r.bilkoviny, 15, 20);
  r = o('proteinový pudink');
  assert.deepStrictEqual([nazvy(r), r.doplnky], [['Proteinový pudink'], []]);
  mezi(r.bilkoviny, 15, 25);
});

test('diakritika a velká písmena: „KUŘE S RÝŽÍ“ = „kure s ryzi“ = „Kuře s rýží“', () => {
  const a = o('KUŘE S RÝŽÍ'), b = o('kure s ryzi'), c = o('Kuře s rýží');
  assert.deepStrictEqual([a.bilkoviny, a.kcal, nazvy(a)], [c.bilkoviny, c.kcal, ['Kuře', 'Rýže']]);
  assert.deepStrictEqual([b.bilkoviny, b.kcal, nazvy(b)], [c.bilkoviny, c.kcal, ['Kuře', 'Rýže']]);
  assert.strictEqual(a.text, 'KUŘE S RÝŽÍ');
});

test('prázdný text, mezery, null a bez seznamu doplňků → nic', () => {
  const prazdne = { polozky: [], bilkoviny: 0, kcal: 0, doplnky: [], text: '', jisty: true };
  assert.deepStrictEqual(o(''), prazdne);
  assert.deepStrictEqual(o('   '), prazdne);
  assert.deepStrictEqual(odhadniJidlo(null), prazdne);
  assert.deepStrictEqual(odhadniJidlo(undefined, null), prazdne);
});

test('neznámé jídlo („nějaká buchta od babičky“) → znamo false, obecný odhad, jisty false', () => {
  const r = o('nějaká buchta od babičky');
  assert.strictEqual(r.polozky.length, 1);
  assert.deepStrictEqual([r.polozky[0].co, r.polozky[0].znamo, r.jisty], ['Buchta', false, false]);
  mezi(r.bilkoviny, 3, 12);
  mezi(r.kcal, 150, 450, 'kcal');
  const s = o('kuře s rýží a frgál');
  assert.deepStrictEqual([nazvy(s), s.jisty], [['Kuře', 'Rýže', 'Frgál'], false]);
});

test('popisná slova u známého jídla jistotu nekazí: „grilované kuře s domácí rýží“, „pečená kachna, zelí a knedlík“', () => {
  let r = o('grilované kuře s domácí rýží');
  assert.deepStrictEqual([nazvy(r), r.jisty], [['Kuře', 'Rýže'], true]);
  r = o('pečená kachna, zelí a knedlík');
  assert.deepStrictEqual([nazvy(r), r.jisty], [['Kachna', 'Zelí', 'Knedlík'], true]);
});

test('přídavné jméno před jídlem jen upřesní: hovězí guláš, kuřecí vývar, čokoládový dort, vepřová krkovice, nealko pivo', () => {
  assert.deepStrictEqual(nazvy(o('hovězí guláš')), ['Guláš s knedlíkem']);
  assert.deepStrictEqual(nazvy(o('kuřecí vývar')), ['Vývar']);
  assert.deepStrictEqual(nazvy(o('čokoládový dort')), ['Dort']);
  assert.deepStrictEqual(nazvy(o('vepřová krkovice s knedlíkem')), ['Vepřové maso', 'Knedlík']);
  assert.deepStrictEqual(nazvy(o('tvarohový koláč')), ['Koláč']);
  assert.deepStrictEqual(nazvy(o('míchaná vejce ze 4 vajec se šunkou')), ['Vejce', 'Šunka']);
});

test('MADMONQ: samotný → champion; „s kofeinem“, „kofein“, „před zápasem“ → madmonq; „madmonq champion“ → champion', () => {
  assert.deepStrictEqual(o('madmonq').doplnky, ['champion']);
  assert.deepStrictEqual(o('champion').doplnky, ['champion']);
  assert.deepStrictEqual(o('MADMONQ Champion').doplnky, ['champion']);
  assert.deepStrictEqual(o('madmonq s kofeinem').doplnky, ['madmonq']);
  assert.deepStrictEqual(o('kofein').doplnky, ['madmonq']);
  assert.deepStrictEqual(o('madmonq před zápasem').doplnky, ['madmonq']);
  const r = o('madmonq a banán');
  assert.deepStrictEqual([r.doplnky, r.text, nazvy(r)], [['champion'], 'banán', ['Banán']]);
});

test('doplňky jinými slovy: protein, whey, smoothie, kloubní výživa, magnesium, ionťák, omega 3, rybí olej', () => {
  const d = (t) => o(t).doplnky;
  assert.deepStrictEqual(d('protein po tréninku'), ['whey']);
  assert.deepStrictEqual(d('clear whey'), ['whey']);
  assert.deepStrictEqual(d('proteinový nápoj'), ['whey']);
  assert.deepStrictEqual(d('smoothie'), ['smoothie']);
  assert.deepStrictEqual(d('Breakfast smoothie'), ['smoothie']);
  assert.deepStrictEqual(d('kloubní výživa'), ['joint']);
  assert.deepStrictEqual(d('magnesium'), ['horcik']);
  assert.deepStrictEqual(d('hořčíku'), ['horcik']);
  assert.deepStrictEqual(d('ionťák'), ['elektrolyty']);
  assert.deepStrictEqual(d('iontový nápoj'), ['elektrolyty']);
  assert.deepStrictEqual(d('omega 3'), ['omega3']);
  assert.deepStrictEqual(d('rybí olej'), ['omega3']);
  assert.deepStrictEqual(d('5 g kreatinu'), ['kreatin']);
  assert.strictEqual(o('protein po tréninku').text, '');
});

test('bez seznamu doplňků: „elektrolyty“ není jídlo, „protein“ je proteinový nápoj', () => {
  let r = o('elektrolyty a kreatin', []);
  assert.deepStrictEqual([r.polozky, r.doplnky, r.jisty], [[], [], true]);
  r = o('protein', []);
  assert.deepStrictEqual(nazvy(r), ['Proteinový nápoj']);
  mezi(r.bilkoviny, 20, 28);
});

test('text bez doplňků je uklizený: „dal jsem si kreatin a k obědu kuře“, „3 vejce, kreatin a chleba“', () => {
  assert.strictEqual(o('dal jsem si kreatin a k obědu kuře s rýží').text, 'k obědu kuře s rýží');
  assert.strictEqual(o('3 vejce, kreatin a chleba').text, '3 vejce a chleba');
  assert.strictEqual(o('elektrolyty, kuře s rýží').text, 'kuře s rýží');
  assert.strictEqual(o('kuře,  elektrolyty,  rýže').text, 'kuře, rýže');
  assert.strictEqual(o('  kuře   s rýží  ').text, 'kuře s rýží');
  assert.strictEqual(o('2 kapsle omegy a 5g kreatinu').text, '');
});

test('skloňování vajec a kuřete: vajíčka, vajec, vejci, kuřete, kuřecím masem', () => {
  assert.strictEqual(o('2 vajíčka').polozky[0].g, 100);
  assert.deepStrictEqual(nazvy(o('chleba s vajíčkem')), ['Chléb', 'Vejce']);
  assert.deepStrictEqual(nazvy(o('omeleta ze 3 vajec')), ['Vejce']);
  assert.strictEqual(o('omeleta ze 3 vajec').polozky[0].g, 150);
  assert.deepStrictEqual([nazvy(o('200 g kuřete')), o('200 g kuřete').polozky[0].g], [['Kuře'], 200]);
  assert.deepStrictEqual(nazvy(o('těstoviny s kuřecím masem')), ['Těstoviny', 'Kuře']);
});

test('skloňování pečiva, příloh a mléčných: chleba/chlebem/krajíc, rýží/rýžové, bramborami/bramborová kaše, tvarohu, jogurtem', () => {
  assert.deepStrictEqual([nazvy(o('2 krajíce chleba')), o('2 krajíce chleba').polozky[0].g], [['Chléb'], 100]);
  assert.deepStrictEqual(nazvy(o('krajíc s máslem')), ['Chléb', 'Máslo']);
  assert.deepStrictEqual(nazvy(o('vajíčko s chlebem')), ['Vejce', 'Chléb']);
  assert.deepStrictEqual(nazvy(o('řízek s bramborami')), ['Řízek', 'Brambory']);
  assert.deepStrictEqual(nazvy(o('bramborová kaše')), ['Bramborová kaše']);
  assert.deepStrictEqual(nazvy(o('brambor a mrkev')), ['Brambory', 'Mrkev']);
  assert.strictEqual(o('250 g tvarohu').polozky[0].g, 250);
  assert.deepStrictEqual(nazvy(o('müsli s jogurtem')), ['Müsli', 'Jogurt bílý']);
  assert.deepStrictEqual(nazvy(o('jogurtu')), ['Jogurt bílý']);
});

test('jednotky: 0,5 l, 1.5 l, půl litru, sklenice, talíř, lžíce, plátky, miska, dkg', () => {
  const g = (t) => o(t).polozky[0].g;
  assert.strictEqual(g('0,5 l mléka'), 500);
  assert.strictEqual(g('1.5 l coly'), 1500);
  assert.strictEqual(g('půl litru mléka'), 500);
  assert.strictEqual(g('sklenice džusu'), 250);
  assert.strictEqual(g('sklenka vína'), 200);
  assert.strictEqual(g('talíř polévky'), 300);
  assert.strictEqual(g('lžíce arašídového másla'), 15);
  assert.strictEqual(g('3 plátky šunky'), 45);
  assert.strictEqual(g('miska ovesných vloček'), 60);
  assert.strictEqual(g('10 dkg sýra'), 100);
  assert.strictEqual(g('0,3 kg kuřecích prsou'), 300);
});

test('číslovky a kusy: dva, tři, pár, jeden a půl, 2x, rohlík 2x, vejce 3', () => {
  const g = (t) => o(t).polozky[0].g;
  assert.strictEqual(g('dva rohlíky'), 86);
  assert.strictEqual(g('tři vejce'), 150);
  assert.strictEqual(g('pár párků'), 100);
  assert.strictEqual(g('jeden banán'), 120);
  assert.strictEqual(g('jeden a půl rohlíku'), 65);
  assert.strictEqual(g('2x rohlík'), 86);
  assert.strictEqual(g('rohlík 2x'), 86);
  assert.strictEqual(g('vejce 3'), 150);
  assert.strictEqual(g('4 kusy sushi'), 120);
});

test('oddělovače: čárky, „a“, „plus“, „+“, nový řádek; množství nepřeskočí k jinému jídlu', () => {
  assert.deepStrictEqual(nazvy(o('kuře + rýže')), ['Kuře', 'Rýže']);
  assert.deepStrictEqual(nazvy(o('kuře plus rýže')), ['Kuře', 'Rýže']);
  assert.deepStrictEqual(nazvy(o('snídaně: 2 vejce\noběd: guláš s knedlíkem\nvečer pivo')), ['Vejce', 'Guláš', 'Knedlík', 'Pivo']);
  const r = o('3 vejce 2 rohlíky');
  assert.deepStrictEqual(r.polozky.map((p) => p.g), [150, 86]);
});

test('proteinové výrobky a mléčné: skyr, cottage, řecký jogurt, tuňák, krůtí šunka, mozzarella, tvaroh nízkotučný', () => {
  mezi(o('skyr').bilkoviny, 13, 17, 'skyr');
  mezi(o('cottage').bilkoviny, 15, 21, 'cottage');
  assert.deepStrictEqual(nazvy(o('řecký jogurt')), ['Řecký jogurt']);
  mezi(o('tuňák').bilkoviny, 25, 35, 'tuňák');
  assert.deepStrictEqual(nazvy(o('krůtí šunka')), ['Krůtí šunka']);
  mezi(o('mozzarella').bilkoviny, 18, 26, 'mozzarella');
  assert.deepStrictEqual(nazvy(o('nízkotučný tvaroh')), ['Tvaroh nízkotučný']);
});

test('nápoje s kaloriemi a voda: cola, cola zero, džus, latte, voda se nepočítá', () => {
  mezi(o('cola').kcal, 120, 160, 'cola');
  assert.strictEqual(o('cola zero').kcal, 2);
  mezi(o('džus').kcal, 90, 130, 'džus');
  mezi(o('latte').bilkoviny, 5, 10, 'latte');
  const r = o('voda');
  assert.deepStrictEqual([r.polozky, r.jisty, r.text], [[], true, 'voda']);
});

test('ovoce, zelenina, sladkosti: jablko, 2 banány, salát, čokoláda, zmrzlina, sušenky', () => {
  assert.deepStrictEqual(nazvy(o('jablko a 2 banány')), ['Jablko', 'Banán']);
  assert.strictEqual(o('jablko a 2 banány').polozky[1].g, 240);
  assert.deepStrictEqual(nazvy(o('zeleninový salát')), ['Zeleninový salát']);
  assert.deepStrictEqual(nazvy(o('tabulka čokolády')), ['Čokoláda']);
  assert.strictEqual(o('tabulka čokolády').polozky[0].g, 100);
  assert.deepStrictEqual(nazvy(o('zmrzlina')), ['Zmrzlina']);
  assert.deepStrictEqual(nazvy(o('sušenky')), ['Sušenky']);
});

test('předložky popisují, nejsou jídlo: „po tréninku banán“, „párek v rohlíku“, „vejce na tvrdo“, „na svačinu jogurt“', () => {
  assert.deepStrictEqual(nazvy(o('po tréninku banán')), ['Banán']);
  assert.deepStrictEqual(nazvy(o('párek v rohlíku')), ['Párek v rohlíku']);
  assert.deepStrictEqual(nazvy(o('vejce na tvrdo')), ['Vejce']);
  assert.deepStrictEqual(nazvy(o('na svačinu jogurt')), ['Jogurt bílý']);
  assert.deepStrictEqual(nazvy(o('džus z pomerančů')), ['Džus']);
});

test('tabulka: aspoň 150 jídel, výchozí přílohy existují, hodnoty v rozumných mezích', () => {
  assert.ok(_test.pocetJidel >= 150, 'jídel ' + _test.pocetJidel);
  Object.values(_test.PODLE_ID).forEach((z) => {
    assert.ok(z.porce > 0 && z.b >= 0 && z.b <= 90 && z.kcal >= 0 && z.kcal <= 900, z.id);
    if (z.pr) assert.ok(_test.PODLE_ID[z.pr[0]] && _test.PODLE_ID[z.pr[0]].typ === 'p', 'příloha ' + z.id);
  });
});

// ---- den jídla z textu (Michal 10. 10.: „nadiktoval sem jídlo co jsem jedl včera … zapsalo se mi to do dneška“)
const SOBOTA = new Date(2026, 9, 10, 8, 4).getTime(); // so 10. 10. 2026 8:04 – skutečný zápis „v pátek ráno sem měl 3 rohlíky…“
const den = (d, m = 10, r = 2026) => new Date(r, m - 1, d).getTime();

test('den jídla: „v pátek ráno sem měl 3 rohlíky…“ v sobotu = pátek 9. 10.; včera, předevčírem, dnes ráno, bez dne', () => {
  assert.strictEqual(denJidla('v pátek ráno sem měl 3 rohlíky, na oběd kuře s rýží a na večeři 3 vejce', SOBOTA), den(9));
  assert.strictEqual(denJidla('včera večer pizza', SOBOTA), den(9));
  assert.strictEqual(denJidla('Včerejší oběd: guláš', SOBOTA), den(9));
  assert.strictEqual(denJidla('předevčírem jsem měl svíčkovou', SOBOTA), den(8));
  assert.strictEqual(denJidla('dnes ráno 2 vejce', SOBOTA), den(10));
  assert.strictEqual(denJidla('3 vejce a chleba', SOBOTA), null);
  // „večeře“ není „včera“, „sobotní“ není den
  assert.strictEqual(denJidla('k večeři tvaroh', SOBOTA), null);
});

test('den jídla: den v týdnu = poslední uplynulý (řečeno týž den = před týdnem), datum letos, budoucnost a víc než 14 dní ne', () => {
  assert.strictEqual(denJidla('v pondělí kuře', SOBOTA), den(5));
  assert.strictEqual(denJidla('ve středu na obědě svíčková', SOBOTA), den(7));
  assert.strictEqual(denJidla('minulou neděli řízek', SOBOTA), den(4));
  assert.strictEqual(denJidla('v sobotu pivo', SOBOTA), den(3), 'v sobotu řečeno v sobotu = minulá sobota');
  assert.strictEqual(denJidla('8. 10. tvaroh', SOBOTA), den(8));
  assert.strictEqual(denJidla('1. října jsem měl dort', SOBOTA), den(1));
  assert.strictEqual(denJidla('zítra si dám řízek', SOBOTA), null, 'zítřek se přeskočí');
  assert.strictEqual(denJidla('20. 10. oslava', SOBOTA), null, 'v budoucnu ne (loni je víc než 14 dní)');
  assert.strictEqual(denJidla('25. 9. svatba', SOBOTA), null, '15 dní zpátky ne');
  assert.strictEqual(denJidla('26. 9. svatba', SOBOTA), den(26, 9), '14 dní zpátky ano');
  // přelom roku: 30. 12. řečeno 2. 1. = loni
  assert.strictEqual(denJidla('30. 12. chlebíčky', new Date(2027, 0, 2, 9).getTime()), den(30, 12, 2026));
});

test('den v textu jídla se nepočítá jako jídlo: „pátek: rohlík“, „8. října, tvaroh“, „předevčírem, guláš“', () => {
  assert.deepStrictEqual(nazvy(o('v pátek ráno sem měl 3 rohlíky')), ['Rohlík']);
  assert.deepStrictEqual(nazvy(o('pátek, rohlík')), ['Rohlík']);
  assert.deepStrictEqual(nazvy(o('8. října, tvaroh')), ['Tvaroh polotučný']);
  assert.deepStrictEqual([nazvy(o('předevčírem, guláš')), o('předevčírem, guláš').jisty], [['Guláš s knedlíkem'], true]);
  assert.strictEqual(o('v pátek ráno sem měl 3 rohlíky').polozky[0].g, 129);
});

test('rychlost: 2000 odhadů (psaní po písmenech) pod 1 s', () => {
  const vzor = 'k obědu kuřecí prsa 200 g s rýží, 2 rohlíky se šunkou, kreatin a omega';
  const t0 = Date.now();
  for (let n = 0; n < 2000; n++) o(vzor.slice(0, (n % vzor.length) + 1));
  mezi(Date.now() - t0, 0, 1000, 'ms');
});

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
