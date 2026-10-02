// Test rozboru poznámky (událost / e-mail z psaného či diktovaného textu) – node testy/rozbor.test.mjs
process.env.TZ = 'Europe/Prague';
import assert from 'node:assert';
const { rozborTextu, _test } = await import('../js/rozbor.js');

const TED = new Date(2026, 9, 2, 20, 0).getTime(); // pátek 2. 10. 2026 20:00
const d = (den, h = 0, m = 0) => new Date(2026, 9, den, h, m).getTime();
let ok = 0;
function test(nazev, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nazev); } catch (e) { console.log('  ✗ ' + nazev + '\n    ' + e.message); process.exitCode = 1; }
}
console.log('Rozbor poznámky');

test('schůzka s člověkem ve čtvrtek v 10 → událost čt 8. 10. 10:00–11:00, jméno, název bez času', () => {
  const r = rozborTextu('Schůzka s Petrem Novákem ve čtvrtek v 10', TED);
  assert.deepStrictEqual([r.typ, r.zacatek, r.konec, r.celodenni], ['udalost', d(8, 10), d(8, 11), false]);
  assert.deepStrictEqual(r.lide, ['Petrem Novákem']);
  assert.strictEqual(r.nazev, 'Schůzka s Petrem Novákem');
});

test('zítra v 18:30 trénink; od 9 do 10:30; ve dvě odpoledne; 8. 10. ve 14 hodin', () => {
  let r = rozborTextu('zítra v 18:30 trénink dorostu', TED);
  assert.deepStrictEqual([r.zacatek, r.nazev], [d(3, 18, 30), 'Trénink dorostu']);
  r = rozborTextu('Pozvi Petra na schůzku v úterý od 9 do 10:30', TED);
  assert.deepStrictEqual([r.zacatek, r.konec, r.lide], [d(6, 9), d(6, 10, 30), ['Petra']]);
  r = rozborTextu('porada ve dvě', TED); // dnes ve 14 už bylo → zítra
  assert.strictEqual(r.zacatek, d(3, 14));
  r = rozborTextu('Zubař 8. 10. ve 14 hodin', TED);
  assert.deepStrictEqual([r.zacatek, r.nazev], [d(8, 14), 'Zubař']);
  r = rozborTextu('Sraz u hřiště v 10.30 v sobotu', TED);
  assert.strictEqual(r.zacatek, d(3, 10, 30));
});

test('bez času celý den; bez data a klíčového slova nic; „v 1. NP“ není čas', () => {
  const r = rozborTextu('Narozeniny babičky v neděli', TED);
  assert.deepStrictEqual([r.celodenni, r.zacatek, r.nazev], [true, d(4), 'Narozeniny babičky']);
  assert.strictEqual(rozborTextu('Koupit mléko a chleba', TED), null);
  assert.strictEqual(rozborTextu('v 1. NP zkontrolovat zásuvky', TED), null);
  assert.strictEqual(rozborTextu('krátké', TED), null);
});

test('e-mail: „napiš Petrovi, že…“, „pošli e-mail Janě“', () => {
  let r = rozborTextu('napiš Petrovi, že v úterý nepřijdu', TED);
  assert.deepStrictEqual([r.typ, r.lide, r.text], ['email', ['Petrovi'], 'V úterý nepřijdu.']);
  r = rozborTextu('Pošli e-mail Janě Novákové o dresech', TED);
  assert.deepStrictEqual([r.typ, r.lide], ['email', ['Janě Novákové']]);
  r = rozborTextu('Napiš Petrovi, že zítra nepřijdu', TED);
  assert.deepStrictEqual([r.typ, r.lide, r.text], ['email', ['Petrovi'], 'Zítra nepřijdu.']);
});

test('pozvánka víc lidí, „v půl deváté“, délka, „večer v 8“, připomínka', () => {
  let r = rozborTextu('pozvi Petra Nováka a Janu Malou na poradu ve středu v půl deváté', TED);
  assert.deepStrictEqual([r.zacatek, r.nazev, r.lide, r.pozvat], [d(7, 8, 30), 'Porada', ['Petra Nováka', 'Janu Malou'], true]);
  r = rozborTextu('Schůzka s Petrem zítra v 10 na 2 hodiny. Vzít výkresy.', TED);
  assert.deepStrictEqual([r.zacatek, r.konec, r.nazev, r.pozvat, r.popis], [d(3, 10), d(3, 12), 'Schůzka s Petrem', false, 'Vzít výkresy.']);
  r = rozborTextu('večeře s rodiči v sobotu večer v 7', TED);
  assert.deepStrictEqual([r.zacatek, r.nazev], [d(3, 19), 'Večeře s rodiči']);
  r = rozborTextu('připomeň mi zítra zavolat do servisu', TED);
  assert.deepStrictEqual([r.celodenni, r.zacatek, r.nazev], [true, d(3), 'Zavolat do servisu']);
  r = rozborTextu('Odepiš Martinovi že to beru', TED);
  assert.deepStrictEqual([r.typ, r.lide, r.text], ['email', ['Martinovi'], 'To beru.']);
  assert.strictEqual(rozborTextu('Fakturační středisko v 10 dodělat', TED), null); // „středisko“ není středa, bez dne a slova = poznámka
  assert.strictEqual(_test.den('za týden', TED), d(9));
});

test('dny: v pátek řečeno v pátek = za týden, dnes, datum v minulosti = příští rok', () => {
  assert.strictEqual(_test.den('v pátek', TED), d(9));
  assert.strictEqual(_test.den('dnes večer', TED), d(2));
  assert.strictEqual(_test.den('1. 9.', TED), new Date(2027, 8, 1).getTime());
});

console.log(`\n${ok} testů prošlo` + (process.exitCode ? ', některé SELHALY' : ''));
